#!/usr/bin/env node
// scan.js — 扫描 skill/command/metadata 来源，解析，对比缓存，输出待翻译队列。
// 来源枚举委托 lib/collect.js（与 restore 共享，避免两处遍历漂移）。
// 输出：{ toTranslate:[{id,en,items}], cached:[{path,kind,jsonPath?,en,zh,id}], skip:[{path,reason}] }

"use strict";

const fs = require("fs");
const path = require("path");
const collect = require("./lib/collect");
const fm = require("./lib/frontmatter");
const meta = require("./lib/metadata");
const cache = require("./lib/cache");
const { cjkRatio, CJK_RATIO_THRESHOLD } = require("./lib/cjk");

function parseArgs(argv) {
  const a = { root: "", cache: "", output: "", print: false, includeProject: false, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--root" || k === "--scan-root") a.root = argv[++i];
    else if (k === "--cache") a.cache = argv[++i];
    else if (k === "--output") a.output = argv[++i];
    else if (k === "--print") a.print = true;
    else if (k === "--include-project") a.includeProject = true;
    else if (k === "--limit") a.limit = Number.parseInt(argv[++i], 10) || 0;
  }
  return a;
}

function readText(p) { try { return fs.readFileSync(p, "utf8"); } catch { return null; } }

function enqueue(toTranslate, cached, cacheData, en, item) {
  const id = cache.hashKey(en);
  const zh = cache.lookup(cacheData, en);
  if (zh) {
    cached.push({ path: item.path, kind: item.kind, jsonPath: item.jsonPath, en, zh, id });
  } else {
    if (!toTranslate.has(id)) toTranslate.set(id, { id, en, items: [] });
    toTranslate.get(id).items.push({ path: item.path, kind: item.kind, jsonPath: item.jsonPath });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.root) { console.error("scan: 缺少 --root"); process.exit(0); }
  if (!args.output) { console.error("scan: 缺少 --output"); process.exit(0); }

  const cacheData = args.cache ? cache.load(args.cache) : { entries: {} };
  // 默认不跟随符号链接：避免改写符号链接指向的外部源仓库
  const follow = process.env.ZH_CN_SKILL_I18N_FOLLOW_SYMLINKS === "1";
  const files = collect.collectAll(args.root, follow);
  const mdFiles = files.filter((f) => f.kind !== "metadata");
  const jsonFiles = files.filter((f) => f.kind === "metadata");

  const toTranslate = new Map();
  const cached = [];
  const skip = [];

  for (const f of mdFiles) {
    const text = readText(f.path);
    if (text === null) { skip.push({ path: f.path, reason: "unreadable" }); continue; }
    const parsed = fm.parseFrontmatter(text);
    if (fm.hasTranslatedMarker(parsed)) { skip.push({ path: f.path, reason: "already-translated" }); continue; }
    const en = parsed.desc ? parsed.desc.value : null;
    if (en === null) { skip.push({ path: f.path, reason: "no-description" }); continue; }
    if (en.trim() === "") { skip.push({ path: f.path, reason: "empty-description" }); continue; }
    if (cjkRatio(en) > CJK_RATIO_THRESHOLD) { skip.push({ path: f.path, reason: "already-zh" }); continue; }
    enqueue(toTranslate, cached, cacheData, en, { path: f.path, kind: f.kind });
  }

  for (const f of jsonFiles) {
    const text = readText(f.path);
    if (text === null) { skip.push({ path: f.path, reason: "unreadable" }); continue; }
    const obj = meta.tryParse(text);
    if (!obj) { skip.push({ path: f.path, reason: "invalid-json" }); continue; }
    const descs = meta.extractDescriptions(obj);
    if (descs.length === 0) { skip.push({ path: f.path, reason: "no-description" }); continue; }
    for (const d of descs) {
      if (meta.isPathTranslated(obj, d.jsonPath)) continue;
      if (cjkRatio(d.en) > CJK_RATIO_THRESHOLD) continue;
      enqueue(toTranslate, cached, cacheData, d.en, { path: f.path, kind: "metadata", jsonPath: d.jsonPath });
    }
  }

  let toTranslateList = [...toTranslate.values()];
  if (args.limit > 0 && toTranslateList.length > args.limit) {
    toTranslateList = toTranslateList.slice(0, args.limit);
  }
  const result = { root: args.root, toTranslate: toTranslateList, cached, skip };
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(result, null, 2));

  if (args.print) {
    const toFileTotal = result.toTranslate.reduce((n, t) => n + t.items.length, 0);
    console.error(`[scan] md ${mdFiles.length} + 元数据 ${jsonFiles.length} 文件`);
    console.error(`  待翻译: ${result.toTranslate.length} 条唯一 / ${toFileTotal} 项`);
    console.error(`  缓存命中: ${result.cached.length} 项`);
    console.error(`  跳过: ${result.skip.length} 项`);
    for (const t of result.toTranslate) console.error(`    [译] ${t.en.slice(0, 70)}`);
  }
}

main();
