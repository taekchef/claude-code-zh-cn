#!/usr/bin/env node
/**
 * bun-binary-io.js — 向后兼容包装器（仓库根级）
 *
 * 实际实现在 plugin/core/binary-io.js。
 * 本文件保留以便旧参考路径（测试、脚本）继续工作。
 */

"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const corePath = path.join(__dirname, "plugin", "core", "binary-io.js");

const result = spawnSync(process.execPath, [corePath, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env },
});

process.exit(result.status ?? 1);
