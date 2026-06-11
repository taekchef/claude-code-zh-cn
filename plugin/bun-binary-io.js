#!/usr/bin/env node
/**
 * bun-binary-io.js — 向后兼容包装器
 *
 * 实际实现在 plugin/core/binary-io.js。
 * 本文件保留以便旧引用路径（install.sh、hook、测试）继续工作。
 *
 * 新代码应直接引用 plugin/core/binary-io.js。
 */

"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const corePath = path.join(__dirname, "core", "binary-io.js");

const result = spawnSync(process.execPath, [corePath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env },
});

process.exit(result.status ?? 1);
