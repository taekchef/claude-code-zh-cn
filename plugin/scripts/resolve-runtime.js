#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
function read(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } }
function resolveRuntime() {
  const config = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const id = "claude-code-zh-cn@claude-code-zh-cn";
  const legacy = path.join(config, "plugins/claude-code-zh-cn");
  if (read(path.join(config, "settings.json")).enabledPlugins?.[id] === false) {
    return fs.existsSync(path.join(legacy, ".official-fallback-disabled")) ? (process.env.CLAUDE_PLUGIN_ROOT || legacy) : "";
  }
  if (process.env.CLAUDE_PLUGIN_ROOT) return process.env.CLAUDE_PLUGIN_ROOT;
  const entries = read(path.join(config, "plugins/installed_plugins.json")).plugins?.[id] || [];
  const installed = entries.find(e => e.scope === "user");
  // 正式安装记录是唯一选择，不扫描缓存目录猜测“最新版本”。
  return installed ? installed.installPath : path.join(config, "plugins/claude-code-zh-cn");
}
module.exports = { resolveRuntime };
if (require.main === module) process.stdout.write(resolveRuntime() || "");
