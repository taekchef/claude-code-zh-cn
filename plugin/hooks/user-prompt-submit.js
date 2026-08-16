#!/usr/bin/env node
"use strict";

/**
 * user-prompt-submit.js — /chinese、/english 语言切换 Hook
 *
 * 采用 Prompt Intercept Pattern：拦截用户提交的 /chinese、/zh、/english、/en，
 * 直接更新 settings.json 与 CLI patch，并以 decision:block 阻止本次 API 调用，
 * 把切换结果作为 reason 显示给用户（不消耗任何 token）。
 *
 * 输入：Claude Code UserPromptSubmit hook JSON（stdin）
 * 输出：hook JSON（stdout）
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PLUGIN_ROOT =
  process.env.CLAUDE_PLUGIN_ROOT ||
  path.join(os.homedir(), ".claude", "plugins", "claude-code-zh-cn");
const SETTINGS_FILE = path.join(
  process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"),
  "settings.json"
);
const OVERLAY_FILE = path.join(PLUGIN_ROOT, "settings-overlay.json");
const VERBS_FILE = path.join(PLUGIN_ROOT, "verbs", "zh-CN.json");
const TIPS_FILE = path.join(PLUGIN_ROOT, "tips", "zh-CN.json");
const PATCH_CLI = path.join(PLUGIN_ROOT, "patch-cli.js");
const TRANSLATIONS = path.join(PLUGIN_ROOT, "cli-translations.json");
const BUN_IO = path.join(PLUGIN_ROOT, "bun-binary-io.js");
const NODE = process.execPath;
const DRY_RUN = process.env.CCZH_DRY_RUN === "1";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(result[key]) && isPlainObject(value)) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** 中文：合并语言设置 + spinner 动词/提示。 */
function applyChineseSettings() {
  const settings = readJson(SETTINGS_FILE, {});
  const base = readJson(OVERLAY_FILE, { language: "Chinese", spinnerTipsEnabled: true });
  const verbs = readJson(VERBS_FILE, { mode: "replace", verbs: [] });
  const tips = readJson(TIPS_FILE, { tips: [] });

  const overlay = {
    ...base,
    spinnerVerbs: {
      mode: verbs.mode === "append" ? "append" : "replace",
      verbs: Array.isArray(verbs) ? verbs : verbs.verbs || [],
    },
    spinnerTipsOverride: {
      excludeDefault: true,
      tips: (tips.tips || []).map((tip) => tip.text).filter(Boolean),
    },
  };

  if (DRY_RUN) return { dryRun: true, applied: Object.keys(overlay) };
  const merged = isPlainObject(settings) ? deepMerge(settings, overlay) : overlay;
  writeJson(SETTINGS_FILE, merged);
  return { applied: Object.keys(overlay) };
}

/** 英文：移除本插件注入的语言/spinner 设置，保留用户其他配置。 */
function applyEnglishSettings() {
  const settings = readJson(SETTINGS_FILE, {});
  if (DRY_RUN) return { dryRun: true, removed: [] };
  if (!isPlainObject(settings)) return { removed: [] };

  const removed = [];
  for (const key of ["language", "spinnerTipsEnabled", "spinnerTipsOverride", "spinnerVerbs"]) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      delete settings[key];
      removed.push(key);
    }
  }
  writeJson(SETTINGS_FILE, settings);
  return { removed };
}

function run(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
}

function findClaudeCommand() {
  const candidates = process.platform === "win32" ? ["claude.cmd", "claude.exe", "claude"] : ["claude"];
  for (const command of candidates) {
    const res = spawnSync(process.platform === "win32" ? "where" : "which", [command], {
      encoding: "utf8",
      windowsHide: true,
    });
    const first = (res.stdout || "").split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    if (res.status === 0 && first) return first;
  }
  return null;
}

function detectInstallation() {
  if (!fs.existsSync(BUN_IO)) return null;
  const claudeBin = process.env.CLAUDE_BIN || findClaudeCommand();
  if (!claudeBin) return null;
  const res = run(NODE, [BUN_IO, "detect", claudeBin]);
  const value = (res.stdout || "").trim();
  if (res.status === 0 && /^(npm|native-bun):/.test(value)) {
    return { kind: value.split(":")[0], target: value.slice(value.indexOf(":") + 1) };
  }
  return null;
}

function patchSupported(install) {
  if (!install) return false;
  const roots = [PLUGIN_ROOT];
  if (process.env.CLAUDE_PLUGIN_DATA) roots.unshift(process.env.CLAUDE_PLUGIN_DATA);
  for (const root of roots) {
    if (fs.existsSync(path.join(root, ".patched-version"))) return true;
  }
  return fs.existsSync(`${install.target}.zh-cn-backup`);
}

/** 中文：patch CLI 硬编码文字（npm / native 均走既有安全工具链）。 */
function patchCliChinese(install) {
  if (!install || !fs.existsSync(PATCH_CLI) || !fs.existsSync(TRANSLATIONS)) return null;
  if (!patchSupported(install)) return null;

  try {
    if (install.kind === "npm") {
      if (DRY_RUN) return "npm-dry-run";
      const backup = `${install.target}.zh-cn-backup`;
      const res = run(NODE, [PATCH_CLI, install.target, TRANSLATIONS, "--backup", backup]);
      return res.status === 0 ? "npm-patched" : null;
    }

    if (install.kind === "native-bun") {
      if (DRY_RUN) return "native-dry-run";
      const deps = run(NODE, [BUN_IO, "check-deps"]);
      if (deps.status !== 0 || (deps.stdout || "").trim() !== "ok") return null;
      const binary = install.target;
      const backup = `${binary}.zh-cn-backup`;
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-lang-"));
      const tmpJs = path.join(tmpDir, "extracted.js");
      try {
        if (fs.existsSync(backup)) {
          fs.copyFileSync(backup, binary);
        } else {
          fs.copyFileSync(binary, backup);
        }
        let res = run(NODE, [BUN_IO, "extract", binary, tmpJs]);
        if (res.status !== 0) return null;
        res = run(NODE, [PATCH_CLI, tmpJs, TRANSLATIONS]);
        if (res.status !== 0) return null;
        res = run(NODE, [BUN_IO, "repack", binary, tmpJs]);
        if (res.status !== 0) {
          // 失败回滚到干净备份
          fs.copyFileSync(backup, binary);
          return null;
        }
        return "native-patched";
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    }
  } catch (error) {
    // Windows 上运行中的 native exe 可能被占用；降级为只切设置。
    process.stderr.write(`[claude-code-zh-cn] patch skipped: ${error.message}\n`);
    return null;
  }

  return null;
}

/** 英文：从 .zh-cn-backup 还原 CLI 原文。 */
function restoreCliEnglish(install) {
  if (!install) return null;
  const backup = `${install.target}.zh-cn-backup`;
  if (!fs.existsSync(backup)) return null;
  if (DRY_RUN) return `${install.kind}-dry-run-restore`;
  try {
    fs.copyFileSync(backup, install.target);
    fs.rmSync(backup, { force: true });
    return install.kind === "npm" ? "npm-restored" : "native-restored";
  } catch (error) {
    process.stderr.write(`[claude-code-zh-cn] restore skipped: ${error.message}\n`);
    return null;
  }
}

function switchLanguage(language) {
  let settingsResult;
  let patchResult = null;
  const install = detectInstallation();

  if (language === "zh-CN") {
    settingsResult = applyChineseSettings();
    patchResult = patchCliChinese(install);
    const patchNote = patchResult
      ? "，CLI 界面文案已重新 patch"
      : "；当前环境暂未识别可 patch 的 CLI 安装，界面文案可能仍需重启后由会话启动 Hook 修复";
    return {
      decision: "block",
      reason:
        `✅ 已切换为中文（claude-code-zh-cn）。` +
        `语言设置与 187 个 spinner 动词、41 条提示已更新${patchNote}。` +
        `若界面文案未立即变化，重启 Claude Code 后完全生效。`,
    };
  }

  settingsResult = applyEnglishSettings();
  patchResult = restoreCliEnglish(install);
  const patchNote = patchResult ? "，CLI 原文已从备份还原" : "；未检测到 CLI 备份，界面文案保持现状";
  return {
    decision: "block",
    reason:
      `✅ 已切换为英文。中文语言设置与 spinner 动词/提示已移除${patchNote}。` +
      `重启 Claude Code 后界面完全回到英文。`,
  };
}

function main() {
  let input;
  try {
    input = JSON.parse(fs.readFileSync(0, "utf8").replace(/^\uFEFF/, "") || "{}");
  } catch {
    input = {};
  }

  const prompt = String(input.prompt || input.user_prompt || "").trim();
  const match = /^\/(chinese|zh|english|en)(?:\s|$)/i.exec(prompt);
  if (!match) {
    process.stdout.write("{}\n");
    return;
  }

  const language = /^(chinese|zh)$/i.test(match[1]) ? "zh-CN" : "en";
  const result = switchLanguage(language);
  if (DRY_RUN) {
    result.reason = `[dry-run] ${result.reason}`;
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main();
