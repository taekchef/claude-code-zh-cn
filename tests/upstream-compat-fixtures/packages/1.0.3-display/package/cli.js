#!/usr/bin/env node

if (process.argv.includes("--help")) {
  console.log(`用法：claude [options]

选项：
  --future                                          Future display-only untranslated sentence
  --mixed                                           Load MCP 服务器 from JSON files or strings
`);
}
