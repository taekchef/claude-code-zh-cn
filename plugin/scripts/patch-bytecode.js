#!/usr/bin/env node
/**
 * patch-bytecode.js — Bun bytecode 容器的 UI 字符串 patch 引擎
 *
 * 2.1.242 起官方 native 构建改为 Bun bytecode 编译 + chunk 拆分：入口模块只剩
 * stub，UI 文案存放在 bytecode 字符串常量池，条目格式：
 *   [u32: flags<<24 | charLen][u32 hash][content]
 * flags=0x80 → 8-bit Latin-1 内容（charLen = 字节数）
 * flags=0x00 → 16-bit UTF-16LE 内容（charLen = unit 数，奇数 unit 后有对齐 pad）
 *
 * 关键性质（实测验证）：
 * - bytecode 按条目起点偏移引用字符串，内容占位不变则偏移全部有效
 * - 8-bit 条目可原地翻转为 16-bit：只要译文字符数 ×2 ≤ 原文字节数，
 *   用 UTF-16LE 译文 + 0x00 填充写满原占位，总占位不变
 * - hash 字段不被校验
 *
 * 用法：
 *   node patch-bytecode.js patch <binary> <translations.json> [--dry-run] [--json]
 *   node patch-bytecode.js scan <binary> <translations.json>
 *
 * translations.json 传仓库根的 cli-translations.json 即可（自动过滤 skipPatch 条目）；
 * 也可以是独立的 {en,zh}[] 数组文件。
 *
 * patch 会先备份 <binary> 为 <binary>.zh-cn-bytecode-backup，失败不写回。
 * 译文以 UTF-16LE 写入；若译文字符数 ×2 > 原文字节数则该条跳过（记入 skipped）。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const FLAG_8BIT = 0x80;
const BACKUP_SUFFIX = ".zh-cn-bytecode-backup";

function readAll(file) {
  return fs.readFileSync(file);
}

// 在 buffer 中找 needle 的全部出现位置
function findAll(haystack, needle) {
  const out = [];
  let pos = haystack.indexOf(needle);
  while (pos !== -1) {
    out.push(pos);
    pos = haystack.indexOf(needle, pos + 1);
  }
  return out;
}

// 校验 pos-8 处是否为合法条目头且内容长度匹配
// 返回 { raw, flags, charLen, hash, contentStart, contentBytes }
function matchEntry(buf, contentPos, contentBytes, encoding) {
  if (contentPos < 8) return null;
  const headPos = contentPos - 8;
  const raw = buf.readUInt32LE(headPos);
  const flags = (raw >>> 24) & 0xff;
  const charLen = raw & 0x00ffffff;
  if (flags !== (encoding === "utf8" ? 0x00 : FLAG_8BIT)) return null;
  // 8-bit: charLen == 字节数；16-bit: charLen == unit 数
  if (encoding === "latin1") {
    if (charLen !== contentBytes.length) return null;
  } else {
    if (charLen * 2 !== contentBytes.length) return null;
  }
  return { headPos, raw, flags, charLen, contentPos };
}

// 单条 patch：返回写入的字节数组（不写盘），或 null（不可 patch）
function buildPatch(entry, zh) {
  const zhUnits = [...zh].length;
  const zhUtf16 = Buffer.from(zh, "utf-16le");
  const zhBytes = zhUtf16.length;
  const origBytes = entry.flags === FLAG_8BIT ? entry.charLen : entry.charLen * 2;
  if (zhBytes > origBytes) return null; // 译文占位超限
  const head = Buffer.alloc(4);
  head.writeUInt32LE(zhUnits >>> 0, 0); // flags=0x00（16-bit），len=unit 数
  const region = Buffer.alloc(origBytes, 0x00);
  zhUtf16.copy(region, 0);
  return { head, region };
}

// 扫描翻译表命中：逐条在 buffer 里找 8-bit 与 16-bit 形态（用单遍 Aho-Corasick 太重，
// 这里按翻译表分批，避免大文件反复扫描）
function scanAndCollect(buf, translations, onProgress) {
  const results = [];
  const CHUNK = 200; // 每批条数，控制单遍扫描的表大小
  for (let start = 0; start < translations.length; start += CHUNK) {
    const batch = translations.slice(start, start + CHUNK);
    for (const t of batch) {
      const en = t.en;
      const zh = t.zh;
      if (!en || !zh) continue;
      let hits = [];
      // 8-bit 形态（主流）
      const enLatin = Buffer.from(en, "latin1");
      for (const pos of findAll(buf, enLatin)) {
        const entry = matchEntry(buf, pos, enLatin, "latin1");
        if (entry) hits.push({ entry, encoding: "latin1" });
      }
      // 16-bit 形态
      const enU16 = Buffer.from(en, "utf-16le");
      for (const pos of findAll(buf, enU16)) {
        const entry = matchEntry(buf, pos, enU16, "utf8");
        if (entry) hits.push({ entry, encoding: "utf16" });
      }
      if (hits.length === 0) {
        results.push({ en, zh, status: "not-found" });
        continue;
      }
      for (const h of hits) {
        const patch = buildPatch(h.entry, zh);
        if (!patch) {
          results.push({ en, zh, status: "too-long", enBytes: h.entry.flags === FLAG_8BIT ? h.entry.charLen : h.entry.charLen * 2, zhUnits: [...zh].length });
          continue;
        }
        results.push({ en, zh, status: "match", headPos: h.entry.headPos, contentPos: h.entry.contentPos, encoding: h.encoding, patch });
      }
    }
  }
  return results;
}

// 加载翻译表：默认用仓库根的 cli-translations.json（过滤 skipPatch 的模型契约条目），
// 也可显式传入其他 {en,zh}[] JSON
function loadTranslations(translationsPath) {
  const raw = JSON.parse(fs.readFileSync(translationsPath, "utf8"));
  if (!Array.isArray(raw)) throw new Error(`translations file must be a JSON array: ${translationsPath}`);
  return raw.filter(e => e && e.en && e.zh && !e.skipPatch);
}

function cmdPatch(binaryPath, translationsPath, opts) {
  const translations = loadTranslations(translationsPath);
  const buf = readAll(binaryPath);
  const results = scanAndCollect(buf, translations);
  const matched = results.filter(r => r.status === "match");
  const notFound = results.filter(r => r.status === "not-found");
  const tooLong = results.filter(r => r.status === "too-long");

  if (opts.dryRun) {
    const summary = { mode: "dry-run", binary: binaryPath, matched: matched.length, notFound: notFound.length, tooLong: tooLong.length,
      matchedList: matched.map(m => ({ en: m.en, zh: m.zh, encoding: m.encoding })) };
    if (opts.json) { process.stdout.write(JSON.stringify(summary, null, 2) + "\n"); return; }
    console.log(`[dry-run] 可 patch ${matched.length} 条，未找到 ${notFound.length} 条，译文超长 ${tooLong.length} 条`);
    for (const m of matched) console.log(`  ✓ ${m.en} → ${m.zh} (${m.encoding})`);
    for (const t of tooLong) console.log(`  ✗ 译文超长: ${t.en} (en=${t.enBytes}B, zh=${t.zhUnits}units×2)`);
    return;
  }

  if (matched.length === 0) {
    console.log("没有可 patch 的条目，未改动文件。");
    if (opts.json) process.stdout.write(JSON.stringify({ patched: 0 }) + "\n");
    return;
  }

  // 备份
  const backupPath = binaryPath + BACKUP_SUFFIX;
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(binaryPath, backupPath);
  }

  // 原地写入（同一 buffer 内按 headPos/contentPos 写）
  for (const m of matched) {
    m.patch.head.copy(buf, m.headPos);
    m.patch.region.copy(buf, m.contentPos);
  }
  fs.writeFileSync(binaryPath, buf);

  const summary = { patched: matched.length, notFound: notFound.length, tooLong: tooLong.length, backup: backupPath };
  if (opts.json) { process.stdout.write(JSON.stringify(summary, null, 2) + "\n"); return; }
  console.log(`已 patch ${matched.length} 条（未找到 ${notFound.length}，译文超长 ${tooLong.length}），备份: ${backupPath}`);
  if (tooLong.length) for (const t of tooLong) console.log(`  ✗ 译文超长跳过: ${t.en}`);
}

function cmdScan(binaryPath, translationsPath) {
  const translations = loadTranslations(translationsPath);
  const buf = readAll(binaryPath);
  const results = scanAndCollect(buf, translations);
  const matched = results.filter(r => r.status === "match");
  const notFound = results.filter(r => r.status === "not-found");
  const tooLong = results.filter(r => r.status === "too-long");
  console.log(`可 patch ${matched.length} 条，未找到 ${notFound.length} 条，译文超长 ${tooLong.length} 条`);
  for (const m of matched) console.log(`  ✓ ${m.en} → ${m.zh} (${m.encoding})`);
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const opts = { dryRun: argv.includes("--dry-run"), json: argv.includes("--json") };
  const positional = argv.filter(a => !a.startsWith("--"));
  if ((cmd === "patch" || cmd === "scan") && positional.length >= 3) {
    const [, binaryPath, translationsPath] = positional;
    if (cmd === "patch") cmdPatch(binaryPath, translationsPath, opts);
    else cmdScan(binaryPath, translationsPath);
    return;
  }
  process.stderr.write("Usage: patch-bytecode.js <patch|scan> <binary> <translations.json> [--dry-run] [--json]\n");
  process.exit(2);
}

main();
