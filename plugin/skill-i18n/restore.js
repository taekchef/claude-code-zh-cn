#!/usr/bin/env node
// restore.js — 还原所有被翻译的文件为英文。来源枚举委托 lib/collect.js。
// restore 总是跟随符号链接（marker-driven）：确保还原所有曾被翻译的文件，
// 含 scan 在 FOLLOW_SYMLINKS=1 时改写的外部仓库，不依赖运行时环境变量，避免卸载残留译文。
// 用法：node restore.js --root <dir> | --all [--dry-run]

"use strict";

const fs = require("fs");
const path = require("path");
const collect = require("./lib/collect");
const fm = require("./lib/frontmatter");
const meta = require("./lib/metadata");

function parseArgs(argv) {
  const a = { root: "", all: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--root" || k === "--scan-root") a.root = argv[++i];
    else if (k === "--all") a.all = true;
    else if (k === "--dry-run") a.dryRun = true;
  }
  return a;
}

function safeWrite(file, content) {
  const tmp = `${file}.zh-cn-tmp.${process.pid}`;
  fs.writeFileSync(tmp, content);
  try { fs.chmodSync(tmp, fs.statSync(file).mode); } catch {}
  try { fs.renameSync(tmp, file); }
  catch { try { fs.unlinkSync(file); } catch {} fs.renameSync(tmp, file); }
}
function readText(p) { try { return fs.readFileSync(p, "utf8"); } catch { return null; } }

function main() {
  const args = parseArgs(process.argv.slice(2));
  let root = args.root;
  if (args.all && !root) root = process.env.HOME ? path.join(process.env.HOME, ".claude") : "";
  if (!root) { console.error("restore: 缺少 --root 或 --all"); process.exit(0); }

  // 总是跟随符号链接：清理操作应彻底，还原所有含标记的文件
  const files = collect.collectAll(root, true);

  let restored = 0;
  let skipped = 0;
  for (const f of files) {
    const text = readText(f.path);
    if (text === null) { skipped++; continue; }

    if (f.kind === "metadata") {
      const obj = meta.tryParse(text);
      if (!obj) { skipped++; continue; }
      const before = meta.serialize(obj);
      meta.restoreAll(obj);
      const after = meta.serialize(obj);
      if (after === before) { skipped++; continue; }
      if (args.dryRun) { console.log(`[dry-run] 将还原 ${f.path}`); continue; }
      try { safeWrite(f.path, after); restored++; } catch { skipped++; }
    } else {
      if (!fm.hasTranslatedMarker(text)) { skipped++; continue; }
      const reverted = fm.restoreDescription(text);
      if (reverted === text) { skipped++; continue; }
      if (args.dryRun) { console.log(`[dry-run] 将还原 ${f.path}`); continue; }
      try { safeWrite(f.path, reverted); restored++; } catch { skipped++; }
    }
  }
  console.log(`[restore] 完成: 还原 ${restored}，跳过 ${skipped}`);
}

main();
