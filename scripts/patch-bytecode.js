#!/usr/bin/env node
"use strict";

// 原地翻译方案由 hjkl950217 在 PR #238 提供。只改变字符串占位内的内容，
// 保留 Bun 数据布局；备份、签名和启动验证完成后才替换用户的可执行文件。
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const io = require("../bun-binary-io.js");

// spinner 完成态/进度词：传统 Layer 4 在 patch-cli.js 用结构锚定替换它们，
// bytecode 容器按常量池整串匹配即可。这些词在常量池里只作显示值（无逻辑
// 比较/对象键），整串替换安全；Baked 桶短译成双字才放得下。
// 词表与 patch-cli.js 的 statusVerbs / 动词数组同源（后者是 Layer 4 的锚点），
// 改动其中一处时两处都要跟。
const BUILTIN_SPINNER_TRANSLATIONS = [
  { en: "Baked", zh: "烤了" },
  { en: "Brewed", zh: "沏了" },
  { en: "Churned", zh: "翻搅了" },
  { en: "Cogitated", zh: "琢磨了" },
  { en: "Cooked", zh: "烹饪了" },
  { en: "Crunched", zh: "嚼了" },
  { en: "Sautéed", zh: "翻炒了" },
  { en: "Saut\\xE9ed", zh: "翻炒了" },
  { en: "Worked", zh: "忙活了" },
  { en: "Thought", zh: "思考了" },
  { en: "almost done thinking", zh: "即将完成思考" },
  { en: "thinking some more", zh: "继续思考中" },
  { en: "thinking more", zh: "深入思考" },
  { en: "still thinking", zh: "仍在思考" },
  { en: "Needs input", zh: "需要输入" },
  { en: "Ready for review", zh: "待审核" },
];

// 粘贴/截断附件的协议占位符碎片。Bun 把 `[Pasted text #${id} +${n} lines]` 这类
// 运行时解析的模板拆成常量池静态段，翻译任一静态段都会让识别附件的正则失配，
// 模型只收到占位符字面量而不是真实粘贴内容。patch-cli.js 的
// isProtectedProtocolLiteral 只覆盖明文路径，这里补齐 bytecode 池。
// 注意 ` more lines]` 是折叠行数提示的 UI 文案，可翻译，不在保护之列。
const PROTOCOL_FRAGMENTS = new Set([
  "[Pasted text #",
  " lines]",
  "[...Truncated text",
  "[Image #",
]);

// `Shell cwd was reset to <dir>` 由明文正则（Egt）消费，用于把执行目录复位；
// 翻译会让解析失配、后续命令跑到错误目录。池里暂无完整条目，守卫纯属防御。
const LOGIC_CONSUMED_FRAGMENTS = new Set([
  "Shell cwd was reset to ",
]);

// 池内专用译文。两类用途：
// 1) 修正主表里放不进窄槽的条目（如 ctrl+o，主表长译 24B 装不进 19B 窄槽）；
// 2) 只在 Bun 常量池里作展示片段的串——写进 cli-translations.json 会让明文路径
//    （patch-cli.js）在协议模板或提示词里误替换，故只在此维护、不走主表。
// 槽宽来自 2.1.260 实测，译文超宽会被静默跳过，改动后用测试核对。
const POOL_TRANSLATIONS = new Map([
  [" (ctrl+o to expand)", " ctrl+o展开"],
  ["Added ", "新增 "],
  [" lines", " 行"],
  [" completed", " 已完成"],
  ["timeout ", "超时 "],
  [" · timeout ", " ·超时 "],
  [" for ", "耗时"], // 5B 窄槽最多 2 个单元；`思考了 for 7s` -> `思考了耗时7s`
  ["searched for", "搜索了"],
  ["patterns", "个模式"], // 单数 `pattern` 与 Grep 工具参数共享，不动
]);

function patchStringPool(buffer, translations) {
  if (!Array.isArray(translations)) throw new Error("翻译表必须是数组");
  const table = new Map();
  const protectedText = new Set(translations.filter(t => t?.skipPatch).map(t => t.en));
  for (const item of translations) {
    if (!item || typeof item.en !== "string" || typeof item.zh !== "string" || !item.en || !item.zh) {
      throw new Error("翻译条目必须包含非空 en / zh 字符串");
    }
    if (protectedText.has(item.en) || PROTOCOL_FRAGMENTS.has(item.en) || LOGIC_CONSUMED_FRAGMENTS.has(item.en)) continue;
    if (table.has(item.en) && table.get(item.en) !== item.zh) throw new Error(`翻译冲突：${item.en}`);
    table.set(item.en, item.zh);
  }
  // 内置补充词只在主表缺省时生效，避免与 cli-translations.json 冲突；
  // 主表标记 skipPatch 的条目仍受保护，内置词不得绕过。
  for (const item of BUILTIN_SPINNER_TRANSLATIONS) {
    if (!table.has(item.en) && !protectedText.has(item.en)) table.set(item.en, item.zh);
  }
  // 池内专用译文直接写入池表（可覆盖主表同名值）；协议/逻辑守卫优先级最高。
  for (const [en, zh] of POOL_TRANSLATIONS) {
    if (!protectedText.has(en) && !PROTOCOL_FRAGMENTS.has(en) && !LOGIC_CONSUMED_FRAGMENTS.has(en)) table.set(en, zh);
  }
  const lengths = new Set([...table.keys()].map(en => en.length));
  const found = new Set();
  let patched = 0, tooLong = 0;
  // ponytail: 单遍扫描 Bun 数据中的精确字符串和条目头；格式变化时扩展版本化解析器。
  for (let offset = 0; offset + 8 <= buffer.length; offset++) {
    // CachedUniquedStringImplBase (2.1.242): relative pointer, bool flags, length.
    // Later shared-pool records: length | is8Bit << 31, hash, characters.
    const cached = offset + 16 <= buffer.length && buffer.readUInt32LE(offset) === 16 &&
      buffer.readUInt32LE(offset + 4) === 0 && (buffer[offset + 8] & 0x36) === 0;
    const flags = cached ? buffer[offset + 8] : buffer[offset + 3];
    if (!cached && flags !== 0x80 && flags !== 0) continue;
    const length = buffer.readUInt32LE(offset + (cached ? 12 : 0)) & 0x7fffffff;
    if (!lengths.has(length)) continue;
    const narrow = cached ? (flags & 1) !== 0 : flags === 0x80;
    const bytes = length * (narrow ? 1 : 2);
    const start = offset + (cached ? 16 : 8);
    if (start + bytes > buffer.length) continue;
    const en = buffer.toString(narrow ? "latin1" : "utf16le", start, start + bytes);
    const zh = table.get(en);
    if (!zh) continue;
    found.add(en);
    const replacement = Buffer.from(zh, "utf16le");
    if (replacement.length > bytes) {
      tooLong++;
    } else {
      buffer.writeUInt32LE(zh.length, offset + (cached ? 12 : 0)); // UTF-16 code units.
      if (cached) buffer[offset + 8] &= ~1;
      buffer.fill(0, start, start + bytes);
      replacement.copy(buffer, start);
      patched++;
    }
    offset = start + bytes - 1;
  }
  return { patched, notFound: table.size - found.size, tooLong };
}

function readContainer(binaryPath) {
  const lief = io.loadNodeLief();
  if (!lief) throw new Error("native patch 需要 node-lief");
  const parsed = io.extractNativeBun(lief, binaryPath);
  const entry = io.findClaudeModule(parsed.bunData, parsed.bunOffsets, parsed.moduleStructSize);
  if (!entry || !io.claudeBytecodeGuardReason(entry)) throw new Error("当前程序不是已识别的 Bun bytecode 容器");
  return { ...parsed, bunData: Buffer.from(parsed.bunData) };
}

function patchBinary(binaryPath, translations, { dryRun = false } = {}) {
  binaryPath = fs.realpathSync(binaryPath);
  const version = io.readExecutableVersion(binaryPath);
  if (!version) throw new Error("原始 Claude Code 启动自检失败，未改动文件");
  const backupPath = binaryPath + ".zh-cn-backup";
  const sameVersionBackup = fs.existsSync(backupPath) && io.readExecutableVersion(backupPath) === version;
  const sourcePath = sameVersionBackup ? backupPath : binaryPath;
  const { bunData, format } = readContainer(sourcePath);
  const original = fs.readFileSync(sourcePath);
  const payloadOffset = original.indexOf(bunData);
  if (payloadOffset < 0 || original.indexOf(bunData, payloadOffset + 1) !== -1) {
    throw new Error("无法唯一定位 Bun 数据，未改动文件");
  }
  const summary = patchStringPool(bunData, translations);
  if (dryRun) return { ...summary, version, mode: "dry-run" };
  if (!summary.patched) throw new Error("没有命中可翻译的字节码条目，未改动文件");
  bunData.copy(original, payloadOffset);
  const current = fs.readFileSync(binaryPath);
  const currentPayload = current.subarray(payloadOffset, payloadOffset + bunData.length);
  if (sameVersionBackup && currentPayload.equals(bunData)) return { ...summary, version, backup: backupPath, changed: false };

  const tempDir = fs.mkdtempSync(path.join(path.dirname(binaryPath), ".zh-cn-bytecode-"));
  const candidate = path.join(tempDir, format === "PE" ? "claude.exe" : "claude");
  try {
    fs.writeFileSync(candidate, original, { mode: fs.statSync(binaryPath).mode });
    if (format === "MachO") io.signAndVerifyMachO(candidate);
    if (io.readExecutableVersion(candidate) !== version) throw new Error("汉化副本启动自检失败，未改动原文件");
    const help = execFileSync(candidate, ["--help"], { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"] });
    if (!/[\u3400-\u9fff]/u.test(help)) throw new Error("汉化副本帮助界面未出现中文，未改动原文件");
    if (!sameVersionBackup) io.withWindowsFileRetry(() => fs.copyFileSync(binaryPath, backupPath));
    io.withWindowsFileRetry(() => fs.renameSync(candidate, binaryPath));
    return { ...summary, version, backup: backupPath, changed: true };
  } finally {
    io.withWindowsFileRetry(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  }
}

function restoreBinary(binaryPath) {
  binaryPath = fs.realpathSync(binaryPath);
  const backup = binaryPath + ".zh-cn-backup";
  const version = io.readExecutableVersion(binaryPath);
  if (!version || io.readExecutableVersion(backup) !== version) {
    throw new Error("备份与当前程序版本不一致或无法启动，未还原文件；备份已保留");
  }
  const tempDir = fs.mkdtempSync(path.join(path.dirname(binaryPath), ".zh-cn-restore-"));
  try {
    const candidate = path.join(tempDir, path.basename(binaryPath));
    fs.copyFileSync(backup, candidate);
    io.withWindowsFileRetry(() => fs.renameSync(candidate, binaryPath));
    io.withWindowsFileRetry(() => fs.unlinkSync(backup));
    return { restored: true, version };
  } finally {
    io.withWindowsFileRetry(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  }
}

function main() {
  const [command, binaryPath, translationsPath, ...flags] = process.argv.slice(2);
  if (command === "restore" && binaryPath && !translationsPath) {
    process.stdout.write(JSON.stringify(restoreBinary(binaryPath)) + "\n");
    return;
  }
  if (!["patch", "scan"].includes(command) || !binaryPath || !translationsPath || flags.some(f => !["--json", "--dry-run"].includes(f))) {
    throw new Error("Usage: patch-bytecode.js <patch|scan> <binary> <translations.json> [--dry-run] [--json]");
  }
  const translations = JSON.parse(fs.readFileSync(translationsPath, "utf8"));
  const result = patchBinary(binaryPath, translations, { dryRun: command === "scan" || flags.includes("--dry-run") });
  process.stdout.write(flags.includes("--json") ? JSON.stringify(result) + "\n" : String(result.patched) + "\n");
}

module.exports = { patchStringPool, patchBinary, restoreBinary };
if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`bytecode patch: ${error.message}\n`);
    process.exitCode = 1;
  }
}
