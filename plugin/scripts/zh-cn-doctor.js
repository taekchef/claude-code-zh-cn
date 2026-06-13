#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const STABLE_PINNED_VERSION = "2.1.112";
const STABLE_INSTALL_CMD = `npm install -g @anthropic-ai/claude-code@${STABLE_PINNED_VERSION}`;
const CLAUDE_UPDATER_BOUNDARY =
  "DISABLE_AUTOUPDATER 归 Claude Code 本体；本插件只更新中文插件和重 patch，不能保证阻止本体升级。请以 claude doctor 的 Updates 段为准。";
const UNPUBLISHED_WINDOW_GUIDANCE =
  "升到未发布支持窗口时，先看 docs/support-matrix.md；未收录就等插件 Release，或临时退回已验证版本";
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
const RUNTIME_ERROR_ENV = "ZH_CN_DOCTOR_RUNTIME_ERROR";

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

function classifyRuntimeError(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const hasNativeKilled =
    /zsh:\s*killed|killed\s+claude|sigkill|signal\s+sigkill|exit\s*137|status\s*137/i.test(raw);
  if (hasNativeKilled) {
    return {
      code: "native-runtime-killed",
      category: "native-runtime",
      detail:
        "检测到 claude 启动后被系统直接 killed：这通常发生在官方安装器 native 二进制 patch 后无法通过本机启动校验。",
      recommendations: [
        "运行本插件最新版 doctor --json，重点看“原生 CLI 启动自检”",
        "先重新安装 Claude Code 本体恢复原始二进制，再运行最新版 ./install.sh",
        "如果仍失败，请收集 which -a claude、codesign --verify --strict --verbose=4 和 xattr -l 输出",
      ],
    };
  }

  const hasHttp200 = /\bhttp\s*200\b|\(http\s*200\)|\bstatus\s*200\b/i.test(raw);
  const hasMalformed = /api returned an empty or malformed response|malformed response/i.test(raw);
  if (hasHttp200 && hasMalformed) {
    return {
      code: "http-200-malformed",
      category: "upstream-or-proxy",
      detail:
        "检测到 API returned an empty or malformed response (HTTP 200)：这不是汉化没生效，而是上游/代理/网关返回了 Claude Code 无法解析的内容。",
      recommendations: [
        "运行 claude doctor，确认当前 Claude Code Updates、登录状态和 provider 状态",
        "检查当前链路：ANTHROPIC_BASE_URL、HTTP(S)_PROXY、CC Switch 当前 provider、网关健康检查",
        "如果使用 CC Switch / EvoMap，请收集 provider 名、模型名、脱敏后的完整报错和网关侧响应摘要",
      ],
    };
  }

  const has403 = /\b403\b|http\s*403|\(403\)/i.test(raw);
  const hasAccessDenied = /access denied|forbidden|权限|拒绝|无权限/i.test(raw);
  if (has403 && hasAccessDenied) {
    return {
      code: "access-denied-403",
      category: "provider-auth",
      detail:
        "检测到 Access denied (403)：这是上游 provider / 网关授权拒绝，不是汉化或 CLI Patch 问题。",
      recommendations: [
        "先查 provider/API key/模型权限/额度，确认 ANTHROPIC_AUTH_TOKEN 和 ANTHROPIC_BASE_URL 指向同一网关",
        "运行 claude doctor，并收集 which -a claude（Windows 用 where.exe claude）",
        "如果使用 CC Switch / EvoMap，请收集当前 provider 名、模型名和网关健康检查的 403 原文",
      ],
    };
  }

  const hasProxyGatewaySignal =
    /proxy|gateway|upstream|cc switch|evomap|anthropic_base_url|http_proxy|https_proxy|no_proxy|econnrefused|etimedout|enotfound|socket hang up|tunnel|代理|网关|上游|供应商|provider|base_url|127\.0\.0\.1|localhost/i.test(raw);
  if (hasProxyGatewaySignal) {
    return {
      code: "proxy-gateway-chain",
      category: "upstream-or-proxy",
      detail:
        "检测到代理/网关链路异常信号：先按 Claude Code 到 provider 的请求链路排查，不要当作汉化没生效处理。",
      recommendations: [
        "确认本地代理/网关进程和端口仍在运行，再确认 claude 实际读取到的 ANTHROPIC_* / HTTP(S)_PROXY / NO_PROXY",
        "运行 claude doctor 和 which -a claude（Windows 用 where.exe claude）",
        "如果使用 CC Switch / EvoMap，请收集当前 provider 名、模型名、base URL 和脱敏后的完整报错",
      ],
    };
  }

  return {
    code: "runtime-error-unclassified",
    category: "runtime",
    detail:
      "收到运行时报错，但不匹配已知的 403 / HTTP 200 malformed / 代理网关模式；先收集运行链路信息，再判断是否需要插件侧处理。",
    recommendations: [
      "运行 claude doctor，并收集 which -a claude（Windows 用 where.exe claude）",
      "粘贴脱敏后的完整报错、安装方式、Claude Code 版本和当前 provider / base URL",
    ],
  };
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

function isExecutableFile(target) {
  try {
    fs.accessSync(target, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function nativeRuntimeVersion(target) {
  if (!target || !fs.existsSync(target) || !isExecutableFile(target)) {
    return null;
  }

  let tempHome = "";
  try {
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-runtime-home-"));
    const result = spawnSync(target, ["--version"], {
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
      env: {
        ...process.env,
        HOME: tempHome,
        USERPROFILE: tempHome,
        XDG_CONFIG_HOME: path.join(tempHome, ".config"),
        XDG_CACHE_HOME: path.join(tempHome, ".cache"),
        XDG_DATA_HOME: path.join(tempHome, ".local", "share"),
      },
    });
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    const match = output.match(/[0-9]+\.[0-9]+\.[0-9]+/);
    if (result.status === 0 && match) {
      return { checked: true, ok: true, version: match[0] };
    }

    const parts = [];
    if (result.signal) parts.push(`signal=${result.signal}`);
    if (typeof result.status === "number") parts.push(`status=${result.status}`);
    if (result.error) parts.push(`error=${result.error.message}`);
    const detail = parts.join("，") || "未返回版本号";
    return { checked: true, ok: false, detail };
  } finally {
    if (tempHome) {
      try { fs.rmSync(tempHome, { recursive: true, force: true }); } catch {}
    }
  }
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

function decodeHex(value) {
  return Buffer.from(String(value || ""), "hex").toString("utf8");
}

function readCcSwitchClaudeProviders(dbFile) {
  const tableResult = spawnSync(
    "sqlite3",
    [dbFile, "select count(*) from sqlite_master where type='table' and name='providers';"],
    { encoding: "utf8" }
  );

  if (tableResult.status !== 0 || String(tableResult.stdout || "").trim() !== "1") {
    return null;
  }

  const result = spawnSync(
    "sqlite3",
    [
      dbFile,
      "select hex(id), hex(name), hex(meta) from providers where app_type='claude' order by is_current desc, sort_index, name;",
    ],
    { encoding: "utf8" }
  );

  if (result.status !== 0) {
    return null;
  }

  const providers = [];
  for (const line of String(result.stdout || "").split(/\r?\n/).filter(Boolean)) {
    const [idHex, nameHex, metaHex] = line.split("|");
    const id = decodeHex(idHex);
    const name = decodeHex(nameHex) || id || "(未命名)";
    const metaText = decodeHex(metaHex);

    try {
      const meta = metaText.trim() ? JSON.parse(metaText) : {};
      providers.push({
        name,
        commonConfigEnabled: meta && typeof meta === "object" && !Array.isArray(meta)
          ? meta.commonConfigEnabled === true || meta.commonConfigEnabled === 1
          : false,
        invalidMeta: false,
      });
    } catch (_) {
      providers.push({ name, commonConfigEnabled: false, invalidMeta: true });
    }
  }

  return {
    total: providers.length,
    enabled: providers.filter((provider) => provider.commonConfigEnabled).length,
    disabled: providers
      .filter((provider) => !provider.commonConfigEnabled && !provider.invalidMeta)
      .map((provider) => provider.name),
    invalidMeta: providers
      .filter((provider) => provider.invalidMeta)
      .map((provider) => provider.name),
  };
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
    return {
      exists: true,
      settings: JSON.parse(raw),
      claudeProviders: readCcSwitchClaudeProviders(dbFile),
    };
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
 * @param {string} [options.runtimeError]
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
        const providerStatus = ccSwitch.claudeProviders;
        const providerProblems = providerStatus
          ? [...providerStatus.disabled, ...providerStatus.invalidMeta]
          : [];

        if (providerProblems.length > 0) {
          const preview = providerProblems.slice(0, 3).join("、");
          const more = providerProblems.length > 3 ? ` 等 ${providerProblems.length} 个` : "";
          add(
            "cc-switch",
            "CC Switch 通用配置",
            "warn",
            `common_config_claude 已包含中文设置，但 ${providerProblems.length} 个 Claude 供应商未启用通用配置：${preview}${more}`
          );
          recommendations.push("重新运行 ./install.sh 并同意同步；或在 CC Switch 中为这些 Claude 供应商勾选写入通用配置");
        } else {
          add(
            "cc-switch",
            "CC Switch 通用配置",
            "ok",
            `common_config_claude 已包含中文设置，spinner 动词 ${verbCount} 个，提示 ${tipCount} 条`
          );
        }
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

  if (kind === "native-bun" && target) {
    const runtimeVersion = nativeRuntimeVersion(target);
    if (runtimeVersion?.ok) {
      add("native-runtime", "原生 CLI 启动自检", "ok", `--version ${runtimeVersion.version}`);
    } else if (runtimeVersion?.checked) {
      add("native-runtime", "原生 CLI 启动自检", "fail", runtimeVersion.detail);
      recommendations.push("重新安装 Claude Code 本体恢复原始 native 二进制，再运行最新版 ./install.sh");
      recommendations.push("如果重新安装后仍被 killed，请贴 codesign --verify --strict --verbose=4 和 xattr -l 输出");
    }
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
        recommendations.push("这是本机通过的临时 patch，不等于已发布支持");
        recommendations.push(UNPUBLISHED_WINDOW_GUIDANCE);
        recommendations.push("如仍未汉化，请贴本插件 doctor --json 输出和 claude doctor 的 Updates 段");
      }
    } else if (!supported) {
      layer4Status = "unsupported";
      layer4Detail = `native ${cliVersion || "unknown"} 不在已验证支持窗口内`;
      add("layer4", "Layer 4（UI 硬编码）", "warn", layer4Detail);
      recommendations.push(`稳定方案：${STABLE_INSTALL_CMD}`);
      recommendations.push(UNPUBLISHED_WINDOW_GUIDANCE);
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

  if (fs.existsSync(pluginRoot)) {
    add("claude-updater", "Claude Code 本体自动升级", "warn", CLAUDE_UPDATER_BOUNDARY);
  }

  const runtimeIssue = classifyRuntimeError(
    options.runtimeError !== undefined ? options.runtimeError : process.env[RUNTIME_ERROR_ENV]
  );
  if (runtimeIssue) {
    add("runtime-error", "运行时报错分流", "warn", runtimeIssue.detail);
    recommendations.push(...runtimeIssue.recommendations);
  }

  const hasFail = checks.some((item) => item.status === "fail");
  const summary = {
    ok: !hasFail,
    checks,
    recommendations: [...new Set(recommendations)],
    layer4Status,
    installKind: kind,
    cliVersion,
    runtimeIssue: runtimeIssue
      ? { code: runtimeIssue.code, category: runtimeIssue.category }
      : null,
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

  lines.push("文档：docs/support-matrix.md · 重新检测：./doctor.sh 或 .\\doctor.ps1");

  return { ...summary, output: lines.join("\n") };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const runtimeErrorArg = readArgValue(args, "--runtime-error") || readArgValue(args, "--error");
  const result = runDoctor({
    repoRoot: process.env.ZH_CN_DOCTOR_REPO || path.join(__dirname, ".."),
    homeDir: process.env.ZH_CN_DOCTOR_HOME,
    pluginRoot: process.env.ZH_CN_DOCTOR_PLUGIN_ROOT,
    claudePath:
      process.env.ZH_CN_DOCTOR_CLAUDE !== undefined ? process.env.ZH_CN_DOCTOR_CLAUDE : undefined,
    runtimeError: runtimeErrorArg || process.env[RUNTIME_ERROR_ENV],
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

function readArgValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return "";
  return args[index + 1] || "";
}

module.exports = {
  runDoctor,
  STABLE_INSTALL_CMD,
  STABLE_PINNED_VERSION,
  NPM_RESIDUE_PROBES,
  classifyRuntimeError,
};
