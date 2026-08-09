#!/usr/bin/env node

// plugin/scripts/build-overlay.js
//
// 从 plugin 内置数据构建中文本地化 overlay，并按需把缺失的 spinner 配置补进
// ~/.claude/settings.json。
//
// 这是 spinner 动词/提示数据的运行期消费者，由三处共用：
//   - session-start (bash) hook   纯 marketplace 安装后首次自补齐
//   - session-start.ps1 hook      同上（Windows）
//   - plugin/skills/zh-cn-setup   交互式完整安装
//
// 算法与 scripts/install-json-helper.js 的 buildOverlay 完全一致（单一数据源）。
// 数据文件随 plugin 包分发：plugin/verbs/zh-CN.json、plugin/tips/zh-CN.json、
// plugin/settings-overlay.json。这样纯 `claude plugin install` 安装也能生效，
// 不依赖 install.sh / install.ps1 预生成的 .settings-overlay-cache.json。

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PLUGIN_KEYS = ["language", "spinnerTipsEnabled", "spinnerVerbs", "spinnerTipsOverride"];

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// 与 install-json-helper.js buildOverlay 同款算法。base/verbs/tips 缺失时优雅降级。
function buildOverlay(pluginRoot) {
  const baseFile = path.join(pluginRoot, "settings-overlay.json");
  const verbsFile = path.join(pluginRoot, "verbs", "zh-CN.json");
  const tipsFile = path.join(pluginRoot, "tips", "zh-CN.json");

  const base = isPlainObject(readJson(baseFile, null))
    ? readJson(baseFile, {})
    : { language: "Chinese", spinnerTipsEnabled: true };

  const verbs = readJson(verbsFile, null);
  const tips = readJson(tipsFile, null);

  if (Array.isArray(verbs) || (isPlainObject(verbs) && Array.isArray(verbs.verbs))) {
    base.spinnerVerbs = {
      mode: isPlainObject(verbs) && verbs.mode === "append" ? "append" : "replace",
      verbs: Array.isArray(verbs) ? verbs : verbs.verbs,
    };
  }

  if (isPlainObject(tips) && Array.isArray(tips.tips)) {
    base.spinnerTipsOverride = {
      excludeDefault: true,
      tips: tips.tips.map((tip) => tip.text).filter((text) => typeof text === "string"),
    };
  }

  return base;
}

// 只补齐 settings 里缺失的插件 key；旧数组只包装为当前 schema，不替换用户动词。
// 返回 { changed, merged }；调用方决定是否写盘。
function fillMissingKeys(settingsFile, overlay) {
  const settings = isPlainObject(readJson(settingsFile, null)) ? readJson(settingsFile, {}) : {};
  const merged = { ...settings };
  let changed = false;

  if (Array.isArray(settings.spinnerVerbs)) {
    merged.spinnerVerbs = { mode: "replace", verbs: settings.spinnerVerbs };
    changed = true;
  }

  for (const key of PLUGIN_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(settings, key) && Object.prototype.hasOwnProperty.call(overlay, key)) {
      merged[key] = overlay[key];
      changed = true;
    }
  }

  return { changed, merged };
}

function writeSettings(settingsFile, merged) {
  const dir = path.dirname(settingsFile);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const existingMode = fs.existsSync(settingsFile) ? fs.statSync(settingsFile).mode & 0o600 : 0o600;
  const mode = existingMode || 0o600;
  const tmp = path.join(dir, `.${path.basename(settingsFile)}.${crypto.randomBytes(8).toString("hex")}.tmp`);
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL |
    (fs.constants.O_NOFOLLOW || 0);
  let output;
  try {
    output = fs.openSync(tmp, flags, mode);
    fs.writeFileSync(output, `${JSON.stringify(merged, null, 2)}\n`);
    fs.fsyncSync(output);
    fs.closeSync(output);
    output = undefined;
    fs.renameSync(tmp, settingsFile);
  } finally {
    if (output !== undefined) fs.closeSync(output);
    fs.rmSync(tmp, { force: true });
  }
}

// resolve overlay 数据源优先级：显式传入 > CLAUDE_PLUGIN_ROOT > 调用脚本所在 plugin 根
function resolvePluginRoot(explicit) {
  if (explicit) return path.resolve(explicit);
  if (process.env.CLAUDE_PLUGIN_ROOT) return path.resolve(process.env.CLAUDE_PLUGIN_ROOT);
  // 本文件位于 <pluginRoot>/scripts/build-overlay.js
  return path.resolve(__dirname, "..");
}

function main(argv) {
  const [command, ...args] = argv;

  if (command === "build-overlay" && args.length <= 1) {
    const pluginRoot = resolvePluginRoot(args[0]);
    process.stdout.write(JSON.stringify(buildOverlay(pluginRoot)));
    return;
  }

  if (command === "ensure-settings" && args.length >= 1 && args.length <= 2) {
    const settingsFile = path.resolve(args[0]);
    const pluginRoot = resolvePluginRoot(args[1]);
    const overlay = buildOverlay(pluginRoot);
    const { changed, merged } = fillMissingKeys(settingsFile, overlay);
    if (changed) {
      writeSettings(settingsFile, merged);
      process.stdout.write("updated");
    } else {
      process.stdout.write("noop");
    }
    return;
  }

  console.error(
    [
      "Usage:",
      "  build-overlay.js build-overlay [plugin-root]",
      "  build-overlay.js ensure-settings <settings.json> [plugin-root]",
    ].join("\n")
  );
  process.exit(64);
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { buildOverlay, fillMissingKeys, writeSettings, resolvePluginRoot, PLUGIN_KEYS };
