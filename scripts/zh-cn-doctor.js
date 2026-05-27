#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const STABLE_PINNED_VERSION = "2.1.112";
const STABLE_INSTALL_CMD = `npm install -g @anthropic-ai/claude-code@${STABLE_PINNED_VERSION}`;
const PATCH_REVISION_FILES = [
  "manifest.json",
  "patch-cli.sh",
  "patch-cli.js",
  "cli-translations.json",
  "bun-binary-io.js",
  "compute-patch-revision.sh",
];
const NPM_RESIDUE_PROBES = [
  "Quick safety check",
  "This command requires approval",
  "Use /btw to ask a quick side question without interrupting Claude's current work",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function parseVersion(version) {
  return String(version || "")
    .split(".")
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

function compareVersion(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    const l = left[i] || 0;
    const r = right[i] || 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function versionInRange(version, floor, ceiling) {
  if (!version || !floor || !ceiling) return false;
  return compareVersion(version, floor) >= 0 && compareVersion(version, ceiling) <= 0;
}

function loadSupportWindow(repoRoot, pluginRoot = "") {
  const candidates = [
    pluginRoot ? path.join(pluginRoot, "support-window.json") : "",
    path.join(repoRoot, "plugin", "support-window.json"),
    path.join(repoRoot, "support-window.json"),
  ].filter(Boolean);
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return readJson(file);
    }
  }
  return null;
}

function isLegacyNpmStable(version, support) {
  const entry = support?.legacyNpmStable;
  if (!entry) {
    return versionInRange(version, "2.1.92", "2.1.112");
  }
  if (Array.isArray(entry.versions) && entry.versions.includes(version)) {
    return true;
  }
  return versionInRange(version, entry.floor, entry.ceiling);
}

function nativeSupportLists(support) {
  const lists = [];
  for (const key of [
    "macosNativeOfficialInstallerExperimental",
    "macosNativeExperimental",
    "windowsNativeExperimental",
  ]) {
    const entry = support?.[key];
    if (!entry) continue;
    lists.push({
      key,
      platform: entry.platform || "",
      versions: Array.isArray(entry.versions) ? entry.versions : [],
      floor: entry.floor,
      ceiling: entry.ceiling,
      excluded: Array.isArray(entry.excluded) ? entry.excluded : [],
    });
  }
  return lists;
}

function nativePlatformForTarget(target) {
  if (process.platform === "win32" || /\.exe$/i.test(String(target || ""))) {
    return "win32-x64";
  }
  if (process.platform === "darwin") {
    return "darwin-arm64";
  }
  return process.platform || "";
}

function isSupportedNativeVersion(version, support, platform = "") {
  if (!version) return false;
  const versions = [];
  for (const entry of nativeSupportLists(support)) {
    if (platform && entry.platform && entry.platform !== platform) continue;
    versions.push(...entry.versions);
  }
  return versions.includes(version);
}

function filteredPath(envPath, launcherBinDir) {
  const parts = String(envPath || "").split(path.delimiter).filter(Boolean);
  const filtered = parts.filter((entry) => path.resolve(entry) !== path.resolve(launcherBinDir));
  return filtered.join(path.delimiter);
}

function findClaudeOnPath(envPath) {
  const env = { ...process.env, PATH: envPath };
  const result =
    process.platform === "win32"
      ? spawnSync("where", ["claude"], { encoding: "utf8", env })
      : spawnSync("sh", ["-c", "command -v claude"], { encoding: "utf8", env });
  if (result.status !== 0) return "";
  return String(result.stdout || "").trim().split(/\r?\n/)[0] || "";
}

function readCliVersion(cliFile) {
  try {
    const head = fs.readFileSync(cliFile, "utf8").slice(0, 400);
    const match = head.match(/^\/\/ Version: (\S+)/m);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

function readMarker(markerFile) {
  try {
    return fs.readFileSync(markerFile, "utf8").trim();
  } catch {
    return "";
  }
}

function parseMarker(marker) {
  if (!marker) return { kind: "", version: "", revision: "" };
  if (marker.startsWith("native|")) {
    const parts = marker.split("|");
    return {
      kind: "native",
      version: parts[1] || "",
      hash: parts[2] || "",
      revision: parts[3] || "",
      provisional: parts[4] === "provisional",
      platform: parts[5] || "",
      sourceHash: parts[6] || "",
    };
  }
  const [version, revision] = marker.split("|");
  return { kind: "npm", version: version || "", revision: revision || "" };
}

function computePatchRevision(root) {
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256");
  for (const relative of PATCH_REVISION_FILES) {
    const file = path.join(root, relative);
    if (!fs.existsSync(file)) continue;
    hash.update(relative);
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

function npmCliResidue(cliFile, probes = NPM_RESIDUE_PROBES) {
  try {
    const sample = fs.readFileSync(cliFile, "utf8").slice(0, 500_000);
    return probes.filter((probe) => sample.includes(probe));
  } catch {
    return null;
  }
}

function checkNodeLief(bunBinaryIoPath) {
  const result = spawnSync(process.execPath, [bunBinaryIoPath, "check-deps"], {
    encoding: "utf8",
  });
  return String(result.stdout || "").trim() === "ok";
}

function nativeBinaryHash(bunBinaryIoPath, target) {
  const result = spawnSync(process.execPath, [bunBinaryIoPath, "hash", target], {
    encoding: "utf8",
  });
  return String(result.stdout || "").trim();
}

function detectInstallation(bunBinaryIoPath, claudeBin) {
  const result = spawnSync(process.execPath, [bunBinaryIoPath, "detect", claudeBin], {
    encoding: "utf8",
  });
  return String(result.stdout || "").trim();
}

function colorize(text, tone, useColor) {
  if (!useColor) return text;
  const codes = { ok: "\u001b[32m", warn: "\u001b[33m", fail: "\u001b[31m", info: "\u001b[34m", reset: "\u001b[0m" };
  return `${codes[tone] || ""}${text}${codes.reset}`;
}

function icon(status) {
  if (status === "ok") return "✓";
  if (status === "warn") return "!";
  return "✗";
}

function spinnerVerbCount(spinnerVerbs) {
  if (Array.isArray(spinnerVerbs)) {
    return spinnerVerbs.length;
  }
  if (!spinnerVerbs || typeof spinnerVerbs !== "object") {
    return 0;
  }
  if (Array.isArray(spinnerVerbs.verbs)) {
    return spinnerVerbs.verbs.length;
  }
  return Object.keys(spinnerVerbs).length;
}

function spinnerTipCount(spinnerTipsOverride) {
  if (Array.isArray(spinnerTipsOverride)) {
    return spinnerTipsOverride.length;
  }
  if (!spinnerTipsOverride || typeof spinnerTipsOverride !== "object") {
    return 0;
  }
  if (Array.isArray(spinnerTipsOverride.tips)) {
    return spinnerTipsOverride.tips.length;
  }
  return 0;
}

function readCcSwitchCommonConfig(homeDir) {
  const dbFile = path.join(homeDir, ".cc-switch", "cc-switch.db");
  if (!fs.existsSync(dbFile)) {
    return { exists: false };
  }

  if (spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).error) {
    return { exists: true, error: "未检测到 sqlite3，无法检查 CC Switch 通用配置" };
  }

  const result = spawnSync(
    "sqlite3",
    [dbFile, "select value from settings where key='common_config_claude';"],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    return {
      exists: true,
      error: String(result.stderr || "无法读取 CC Switch 通用配置").trim(),
    };
  }

  const raw = String(result.stdout || "").trim();
  if (!raw) {
    return { exists: true, missing: true };
  }

  try {
    return { exists: true, settings: JSON.parse(raw) };
  } catch (error) {
    return {
      exists: true,
      error: `CC Switch common_config_claude 不是有效 JSON：${error.message}`,
    };
  }
}

/**
 * @param {object} options
 * @param {string} [options.repoRoot]
 * @param {string} [options.homeDir]
 * @param {string} [options.pluginRoot]
 * @param {string} [options.claudePath]
 * @param {boolean} [options.json]
 * @param {boolean} [options.color]
 */
function runDoctor(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, ".."));
  const homeDir = options.homeDir || process.env.HOME || os.homedir();
  const pluginRoot =
    options.pluginRoot || path.join(homeDir, ".claude", "plugins", "claude-code-zh-cn");
  const launcherBinDir =
    options.launcherBinDir || path.join(homeDir, ".claude", "bin");
  const settingsFile = path.join(homeDir, ".claude", "settings.json");
  const markerFile = path.join(pluginRoot, ".patched-version");
  const sourceRepoFile = path.join(pluginRoot, ".source-repo");
  const useColor = options.color !== false && !process.env.NO_COLOR;
  const support = loadSupportWindow(repoRoot, pluginRoot);
  const bunBinaryIoPath = path.join(
    fs.existsSync(path.join(pluginRoot, "bun-binary-io.js"))
      ? pluginRoot
      : repoRoot,
    "bun-binary-io.js"
  );

  const checks = [];
  const recommendations = [];

  function add(id, label, status, detail) {
    checks.push({ id, label, status, detail });
  }

  if (!spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" }).error) {
    add("node", "Node.js", "ok", process.version);
  } else {
    add("node", "Node.js", "fail", "未检测到 node");
    recommendations.push("安装 Node.js 后重新运行 ./install.sh");
  }

  const manifestPath = path.join(pluginRoot, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = readJson(manifestPath);
      add("plugin", "插件目录", "ok", `${pluginRoot} (v${manifest.version || "?"})`);
    } catch (error) {
      add("plugin", "插件目录", "fail", `无法解析 manifest.json：${error.message}`);
      recommendations.push("检查插件目录是否损坏；必要时在本仓库重新运行 ./install.sh");
    }
  } else {
    add("plugin", "插件目录", "fail", `未找到 ${pluginRoot}`);
    recommendations.push(`在本仓库运行 ./install.sh 安装插件`);
  }

  if (fs.existsSync(settingsFile)) {
    try {
      const settings = readJson(settingsFile);
      const verbCount = spinnerVerbCount(settings.spinnerVerbs);
      const languageOk = settings.language === "Chinese";
      if (languageOk && verbCount >= 100) {
        add("settings", "settings.json (Layer 1)", "ok", `language=Chinese，spinner 动词 ${verbCount} 个`);
      } else if (languageOk) {
        add(
          "settings",
          "settings.json (Layer 1)",
          "warn",
          `language=Chinese，但 spinner 动词仅 ${verbCount} 个（可能未完整合并）`
        );
        recommendations.push("重新运行 ./install.sh 合并 verbs/tips");
      } else {
        add(
          "settings",
          "settings.json (Layer 1)",
          "warn",
          `language=${settings.language || "(未设置)"}，spinner 动词 ${verbCount} 个`
        );
        recommendations.push("运行 ./install.sh 写入中文 settings");
      }
    } catch (error) {
      add("settings", "settings.json (Layer 1)", "fail", `无法解析：${error.message}`);
    }
  } else {
    add("settings", "settings.json (Layer 1)", "warn", `未找到 ${settingsFile}`);
    recommendations.push("运行 ./install.sh 创建并合并 settings.json");
  }

  const ccSwitch = readCcSwitchCommonConfig(homeDir);
  if (ccSwitch.exists) {
    if (ccSwitch.error) {
      add("cc-switch", "CC Switch 通用配置", "warn", ccSwitch.error);
      recommendations.push("如果使用 CC Switch 切换供应商后中文设置丢失，请在 CC Switch 中重新提取通用配置");
    } else if (ccSwitch.missing) {
      add("cc-switch", "CC Switch 通用配置", "warn", "未找到 common_config_claude");
      recommendations.push("重新运行 ./install.sh，并同意同步 CC Switch 通用配置；或在 CC Switch 中手动重新提取通用配置");
    } else {
      const ccSwitchSettings = ccSwitch.settings || {};
      const verbCount = spinnerVerbCount(ccSwitchSettings.spinnerVerbs);
      const tipCount = spinnerTipCount(ccSwitchSettings.spinnerTipsOverride);
      const complete =
        ccSwitchSettings.language === "Chinese" &&
        ccSwitchSettings.spinnerTipsEnabled === true &&
        verbCount >= 100 &&
        tipCount >= 40;

      if (complete) {
        add(
          "cc-switch",
          "CC Switch 通用配置",
          "ok",
          `common_config_claude 已包含中文设置，spinner 动词 ${verbCount} 个，提示 ${tipCount} 条`
        );
      } else {
        add(
          "cc-switch",
          "CC Switch 通用配置",
          "warn",
          `common_config_claude 未包含完整中文设置（language=${ccSwitchSettings.language || "(未设置)"}，spinner 动词 ${verbCount} 个，提示 ${tipCount} 条）`
        );
        recommendations.push("重新运行 ./install.sh，并同意同步 CC Switch 通用配置；或在 CC Switch 中手动重新提取通用配置");
      }
    }
  }

  const pathWithoutLauncher = filteredPath(process.env.PATH, launcherBinDir);
  const claudeBin =
    options.claudePath !== undefined
      ? options.claudePath
      : findClaudeOnPath(pathWithoutLauncher || process.env.PATH);
  const claudeViaLauncher = findClaudeOnPath(process.env.PATH);
  const launcherFirst =
    claudeViaLauncher &&
    path.resolve(claudeViaLauncher) === path.resolve(path.join(launcherBinDir, "claude"));

  if (!claudeBin) {
    add("claude", "Claude Code CLI", "fail", "PATH 中未找到 claude 命令");
    recommendations.push("先安装 Claude Code：https://github.com/anthropics/claude-code");
  } else {
    add("claude", "Claude Code CLI", "ok", claudeBin);
  }

  let installInfo = "";
  if (claudeBin && fs.existsSync(bunBinaryIoPath)) {
    installInfo = detectInstallation(bunBinaryIoPath, claudeBin);
  }

  const kind = installInfo.includes(":") ? installInfo.split(":")[0] : installInfo || "unknown";
  const target = installInfo.includes(":") ? installInfo.slice(installInfo.indexOf(":") + 1) : "";

  if (installInfo) {
    add("install-kind", "安装形态", "ok", installInfo);
  } else if (claudeBin) {
    add("install-kind", "安装形态", "warn", "无法识别（将跳过 CLI Patch）");
  }

  let cliVersion = "";
  if (kind === "npm" && target) {
    cliVersion = readCliVersion(target);
  } else if (kind === "native-bun" && target && fs.existsSync(bunBinaryIoPath)) {
    const versionResult = spawnSync(process.execPath, [bunBinaryIoPath, "version", target], {
      encoding: "utf8",
    });
    cliVersion = String(versionResult.stdout || "").trim();
    if (!cliVersion) {
      const runResult = spawnSync(target, ["--version"], { encoding: "utf8" });
      const match = String(runResult.stdout || runResult.stderr || "").match(
        /[0-9]+\.[0-9]+\.[0-9]+/
      );
      cliVersion = match ? match[0] : "";
    }
  }

  if (cliVersion) {
    add("cli-version", "CLI 版本", "ok", cliVersion);
  } else if (claudeBin) {
    add("cli-version", "CLI 版本", "warn", "无法读取版本号");
  }

  const marker = parseMarker(readMarker(markerFile));
  if (marker.version || marker.revision) {
    add(
      "patch-marker",
      "CLI Patch 记录",
      "ok",
      marker.kind === "native"
        ? `native ${marker.version} (revision ${marker.revision || "?"}${marker.provisional ? ", provisional" : ""})`
        : `${marker.version} (revision ${marker.revision || "?"})`
    );
  } else if (fs.existsSync(pluginRoot)) {
    add("patch-marker", "CLI Patch 记录", "warn", "无 .patched-version（可能从未 patch 或已跳过 Layer 4）");
  }

  let layer4Status = "skipped";
  let layer4Detail = "";

  if (kind === "npm" && target) {
    const stable = isLegacyNpmStable(cliVersion, support);
    const residue = npmCliResidue(target);
    if (!stable) {
      layer4Status = "unsupported";
      layer4Detail = `npm ${cliVersion || "unknown"} 不在 stable 窗口 2.1.92–2.1.112`;
      add("layer4", "Layer 4（UI 硬编码）", "warn", layer4Detail);
      recommendations.push(`如需完整 UI 中文，请改用：${STABLE_INSTALL_CMD}`);
      recommendations.push("然后在本仓库重新运行 ./install.sh");
    } else if (Array.isArray(residue) && residue.length > 0) {
      layer4Status = "needed";
      layer4Detail = `检测到未翻译的 UI 探针：${residue.join(" | ")}`;
      add("layer4", "Layer 4（UI 硬编码）", "fail", layer4Detail);
      recommendations.push("运行 ./install.sh 或重启 Claude Code 触发 session-start 自动 patch");
    } else if (Array.isArray(residue)) {
      layer4Status = "ok";
      layer4Detail = "cli.js 抽样未发现高风险英文探针";
      add("layer4", "Layer 4（UI 硬编码）", "ok", layer4Detail);
    } else {
      add("layer4", "Layer 4（UI 硬编码）", "warn", "无法读取 cli.js 以验证 patch 状态");
    }

    if (stable && !launcherFirst) {
      add("launcher", "npm 启动前自修复", "warn", `PATH 未优先 ${path.join(launcherBinDir, "claude")}`);
      recommendations.push("重新运行 ./install.sh 安装 launcher，或把 ~/.claude/bin 放在 PATH 最前");
    } else if (stable && launcherFirst) {
      add("launcher", "npm 启动前自修复", "ok", "launcher 已在 PATH 最前");
    }
  } else if (kind === "native-bun" && target) {
    const nativePlatform = nativePlatformForTarget(target);
    const supported = isSupportedNativeVersion(cliVersion, support, nativePlatform);
    const liefOk = checkNodeLief(bunBinaryIoPath);
    if (!supported && marker.kind === "native" && marker.version === cliVersion && marker.provisional) {
      const currentHash = nativeBinaryHash(bunBinaryIoPath, target);
      const currentRevision = computePatchRevision(pluginRoot);
      if (marker.hash && currentHash && marker.hash !== currentHash) {
        layer4Status = "needed";
        add("layer4", "Layer 4（UI 硬编码）", "warn", "provisional native 二进制 hash 与 patch 记录不一致");
        recommendations.push("运行 ./install.sh 重新做本机自验证 patch");
      } else if (marker.revision && currentRevision && marker.revision !== currentRevision) {
        layer4Status = "needed";
        add("layer4", "Layer 4（UI 硬编码）", "warn", "provisional patch 规则版本与记录不一致");
        recommendations.push("运行 ./install.sh 重新做本机自验证 patch");
      } else {
        layer4Status = "provisional";
        layer4Detail = `native ${cliVersion || "unknown"} 已本机自验证 patch，但尚未纳入已发布支持窗口`;
        add("layer4", "Layer 4（UI 硬编码）", "warn", layer4Detail);
        recommendations.push("这是本机通过的临时 patch；等插件发布支持窗口后可重新运行 ./install.sh 转为已验证记录");
      }
    } else if (!supported) {
      layer4Status = "unsupported";
      layer4Detail = `native ${cliVersion || "unknown"} 不在已验证支持窗口内`;
      add("layer4", "Layer 4（UI 硬编码）", "warn", layer4Detail);
      recommendations.push(`稳定方案：${STABLE_INSTALL_CMD}`);
      recommendations.push("详见 docs/support-matrix.md");
    } else if (!liefOk) {
      layer4Status = "needs-deps";
      layer4Detail = "已验证版本，但缺少 node-lief";
      add("layer4", "Layer 4（UI 硬编码）", "fail", layer4Detail);
      recommendations.push("运行：npm install -g node-lief");
      recommendations.push("然后重新运行 ./install.sh");
    } else if (marker.kind === "native" && marker.version === cliVersion) {
      const currentHash = nativeBinaryHash(bunBinaryIoPath, target);
      const currentRevision = computePatchRevision(pluginRoot);
      if (marker.hash && currentHash && marker.hash !== currentHash) {
        layer4Status = "needed";
        add("layer4", "Layer 4（UI 硬编码）", "warn", "native 二进制 hash 与 patch 记录不一致");
        recommendations.push("运行 ./install.sh 重新 patch native 二进制");
      } else if (marker.revision && currentRevision && marker.revision !== currentRevision) {
        layer4Status = "needed";
        add("layer4", "Layer 4（UI 硬编码）", "warn", "patch 规则版本与记录不一致");
        recommendations.push("运行 ./install.sh 重新 patch native 二进制");
      } else {
        layer4Status = "ok";
        add("layer4", "Layer 4（UI 硬编码）", "ok", `experimental native ${cliVersion} 已记录 patch`);
      }
    } else {
      layer4Status = "needed";
      add("layer4", "Layer 4（UI 硬编码）", "warn", "支持此版本，但 patch 记录与当前版本不一致");
      recommendations.push("运行 ./install.sh 重新 patch native 二进制");
    }
  } else if (kind === "unknown" || !installInfo) {
    layer4Detail = "当前安装方式不支持 CLI Patch，仅 Layer 1–3 生效";
    add("layer4", "Layer 4（UI 硬编码）", "warn", layer4Detail);
    if (process.platform === "win32") {
      recommendations.push(`Windows 完整 UI 中文：${STABLE_INSTALL_CMD}，再用 install.ps1`);
    } else {
      recommendations.push(`完整 UI 中文推荐：${STABLE_INSTALL_CMD}`);
    }
  }

  if (fs.existsSync(sourceRepoFile)) {
    const sourceRepo = fs.readFileSync(sourceRepoFile, "utf8").trim();
    if (sourceRepo && fs.existsSync(sourceRepo)) {
      add("auto-update", "插件自动更新", "ok", `源码目录 ${sourceRepo}`);
    } else {
      add("auto-update", "插件自动更新", "warn", `.source-repo 指向的路径不存在：${sourceRepo || "(空)"}`);
      recommendations.push("保留安装时的 git 仓库路径，或设置 ZH_CN_SOURCE_REPO 后重新 install");
    }
  } else if (fs.existsSync(pluginRoot)) {
    add("auto-update", "插件自动更新", "warn", "无 .source-repo，Release 自动同步可能不可用");
  }

  const hasFail = checks.some((item) => item.status === "fail");
  const summary = {
    ok: !hasFail,
    checks,
    recommendations: [...new Set(recommendations)],
    layer4Status,
    installKind: kind,
    cliVersion,
  };

  if (options.json) {
    return summary;
  }

  const lines = [];
  lines.push(colorize("=== Claude Code 中文本地化 · 诊断 ===", "info", useColor));
  lines.push("");

  for (const item of checks) {
    const prefix = colorize(icon(item.status), item.status, useColor);
    lines.push(`${prefix} ${item.label}`);
    if (item.detail) {
      lines.push(`    ${item.detail}`);
    }
  }

  lines.push("");
  if (summary.recommendations.length > 0) {
    lines.push(colorize("建议下一步：", "info", useColor));
    for (const step of summary.recommendations) {
      lines.push(`  • ${step}`);
    }
    lines.push("");
  } else {
    lines.push(colorize("未发现需要立即处理的问题。重启 Claude Code 后应能看到中文 spinner。", "ok", useColor));
    lines.push("");
  }

  lines.push("文档：docs/support-matrix.md · 重新检测：./doctor.sh");

  return { ...summary, output: lines.join("\n") };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const result = runDoctor({
    repoRoot: process.env.ZH_CN_DOCTOR_REPO || path.join(__dirname, ".."),
    homeDir: process.env.ZH_CN_DOCTOR_HOME,
    pluginRoot: process.env.ZH_CN_DOCTOR_PLUGIN_ROOT,
    claudePath:
      process.env.ZH_CN_DOCTOR_CLAUDE !== undefined ? process.env.ZH_CN_DOCTOR_CLAUDE : undefined,
    json,
    color: process.stdout.isTTY,
  });

  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`${result.output}\n`);
  }

  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { runDoctor, STABLE_INSTALL_CMD, STABLE_PINNED_VERSION, NPM_RESIDUE_PROBES };
