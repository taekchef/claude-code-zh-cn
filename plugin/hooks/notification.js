#!/usr/bin/env node

"use strict";

const fs = require("node:fs");

const translations = [
  ["Rate limited", "请求频率受限，请稍后再试"],
  ["Token limit reached", "Token 用量已达上限"],
  ["Session expired", "会话已过期"],
  ["Context window", "上下文窗口即将用尽，建议使用 /compact 压缩"],
  ["Usage limit", "使用额度已达上限"],
  ["Auto-compact", "正在自动压缩对话历史..."],
];

function main() {
  let message = "";
  try {
    message = String(JSON.parse(fs.readFileSync(0, "utf8") || "{}").message || "");
  } catch {}

  const match = translations.find(([source]) => message.includes(source));
  if (!match) {
    process.stdout.write("{}\n");
    return;
  }

  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "Notification",
        additionalContext: `通知翻译：${match[1]}`,
      },
    })}\n`
  );
}

main();
