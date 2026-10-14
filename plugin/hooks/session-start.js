#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

function fallbackOutput() {
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: [
        "## 中文本地化提示",
        "",
        "中文插件的自动修复本次未运行；Claude Code 本体保持原样可用。",
        "请继续默认使用简体中文回复，技术术语保留英文。",
      ].join("\n"),
    },
  };
}

function validHookOutput(value) {
  try {
    const parsed = JSON.parse(String(value || "").trim());
    return parsed && parsed.hookSpecificOutput?.hookEventName === "SessionStart";
  } catch {
    return false;
  }
}

function runCandidate(command, args, input, env) {
  return spawnSync(command, args, {
    input,
    encoding: "utf8",
    env,
    windowsHide: true,
  });
}

function main() {
  const input = fs.readFileSync(0, "utf8");
  const hooksDir = __dirname;
  const childEnv = { ...process.env };
  if (process.argv.includes("--standalone")) {
    childEnv.CLAUDE_PLUGIN_ROOT = path.dirname(hooksDir);
  }
  const configRoot = childEnv.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const languageFile = path.join(configRoot, "plugins", "claude-code-zh-cn", ".language-mode");
  let languageMode = "zh-CN";
  try { languageMode = fs.readFileSync(languageFile, "utf8").trim(); } catch {}
  // 英文模式不运行会重新合并中文设置的子 Hook，也不注入中文 fallback。
  if (languageMode === "en") {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "" } }) + "\n");
    return;
  }
  const candidates = process.platform === "win32"
    ? [
        ["pwsh.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(hooksDir, "session-start.ps1")]],
        ["powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(hooksDir, "session-start.ps1")]],
      ]
    : [["/bin/bash", [path.join(hooksDir, "session-start")]]];

  for (const [command, args] of candidates) {
    const result = runCandidate(command, args, input, childEnv);
    if (result.error?.code === "ENOENT") continue;
    if (result.status === 0 && validHookOutput(result.stdout)) {
      process.stdout.write(result.stdout.trimEnd() + "\n");
      return;
    }
    break;
  }

  process.stdout.write(`${JSON.stringify(fallbackOutput())}\n`);
}

main();
