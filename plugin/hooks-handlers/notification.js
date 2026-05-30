#!/usr/bin/env node
"use strict";

const translations = {
  "Rate limited": "请求频率受限，请稍后再试",
  "Token limit reached": "Token 用量已达上限",
  "Session expired": "会话已过期",
  "Context window": "上下文窗口即将用尽，建议使用 /compact 压缩",
  "Usage limit": "使用额度已达上限",
  "Auto-compact": "正在自动压缩对话历史...",
};

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  let message = "";
  try {
    message = String(JSON.parse(input).message || "");
  } catch {}

  let translated = "";
  for (const [key, value] of Object.entries(translations)) {
    if (message.includes(key)) {
      translated = value;
      break;
    }
  }

  if (translated) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "Notification",
        additionalContext: `通知翻译：${translated}`,
      },
    }));
  } else {
    process.stdout.write("{}");
  }
});
