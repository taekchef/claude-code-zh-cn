"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { patchStringPool } = require("../scripts/patch-bytecode.js");

function entry(text, wide = false) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE((text.length | (wide ? 0 : 0x80000000)) >>> 0);
  header.writeUInt32LE(0x11223344, 4);
  return Buffer.concat([header, Buffer.from(text, wide ? "utf16le" : "latin1")]);
}

test("bytecode translation preserves adjacent entries and uses UTF-16 code units", () => {
  const next = entry("untouched");
  const pool = Buffer.concat([entry("Pondering"), next]);
  const result = patchStringPool(pool, [{ en: "Pondering", zh: "思索中" }]);
  assert.equal(result.patched, 1);
  assert.equal(pool.readUInt32LE(0), 3);
  assert.equal(pool.subarray(8, 14).toString("utf16le"), "思索中");
  assert.deepEqual(pool.subarray(17), next);
  const astral = entry("existing 16bit string", true);
  assert.equal(patchStringPool(astral, [{ en: "existing 16bit string", zh: "思考𠮷" }]).patched, 1);
  assert.equal(astral.readUInt32LE(0), "思考𠮷".length);
});

test("2.1.242 cached strings preserve relative pointers and atom flags", () => {
  const header = Buffer.from("1000000000000000c912008009000000", "hex");
  const next = entry("untouched");
  const pool = Buffer.concat([header, Buffer.from("Pondering"), next]);
  assert.equal(patchStringPool(pool, [{ en: "Pondering", zh: "思索中" }]).patched, 1);
  assert.equal(pool.readBigUInt64LE(), 16n);
  assert.equal(pool.readUInt32LE(8), 0x800012c8);
  assert.equal(pool.readUInt32LE(12), 3);
  assert.equal(pool.subarray(16, 22).toString("utf16le"), "思索中");
  assert.deepEqual(pool.subarray(25), next);
});

test("no match, oversized translations and protected contracts leave bytes intact", () => {
  for (const translation of [
    { en: "absent", zh: "不存在" },
    { en: "Pondering", zh: "这段翻译不能放入原位置" },
    { en: "Pondering", zh: "思索中", skipPatch: "model-prompt-contract" },
  ]) {
    const pool = entry("Pondering");
    const original = Buffer.from(pool);
    const result = patchStringPool(pool, [translation]);
    assert.equal(result.patched, 0);
    assert.deepEqual(pool, original);
    if (translation.zh.includes("不能")) assert.equal(result.tooLong, 1);
  }
});

test("only valid whole string entries match, and repeat patching is a no-op", () => {
  const pool = Buffer.concat([Buffer.from("Pondering"), entry("Pondering more"), entry("Pondering")]);
  const translations = [{ en: "Pondering", zh: "思索中" }];
  assert.equal(patchStringPool(pool, translations).patched, 1);
  const once = Buffer.from(pool);
  assert.equal(patchStringPool(pool, translations).patched, 0);
  assert.deepEqual(pool, once);
});

test("translation boundary rejects malformed or conflicting entries", () => {
  const pool = entry("Pondering");
  for (const translations of [null, [{ en: 123, zh: "中" }], [{ en: "Pondering", zh: "甲" }, { en: "Pondering", zh: "乙" }]]) {
    assert.throws(() => patchStringPool(pool, translations));
  }
  assert.deepEqual(pool, entry("Pondering"));
});

// 内置补充翻译表：spinner 完成态/进度词。传统 Layer 4 在 patch-cli.js 里
// 用结构锚定替换它们；bytecode 容器按常量池整串匹配，只要这些词在池里
// 只作显示值（无逻辑比较/对象键），全局替换就是安全的。
test("built-in extras translate spinner completion verbs even with an empty master table", () => {
  const pool = entry("Churned");
  assert.equal(patchStringPool(pool, []).patched, 1);
  assert.equal(pool.readUInt32LE(0), 3); // 3 UTF-16 code units
  assert.equal(pool.subarray(8, 14).toString("utf16le"), "翻搅了");
});

test("built-in verb fits within a shorter bucket (Baked 5B -> 烤了)", () => {
  const pool = entry("Baked");
  assert.equal(patchStringPool(pool, []).patched, 1);
  assert.equal(pool.subarray(8, 12).toString("utf16le"), "烤了");
});

test("master table wins over built-in extras on key collision", () => {
  const pool = entry("Churned");
  assert.equal(patchStringPool(pool, [{ en: "Churned", zh: "自定义" }]).patched, 1);
  assert.equal(pool.subarray(8, 14).toString("utf16le"), "自定义");
});

test("skipPatch contracts stay protected even when a built-in extra matches", () => {
  const pool = entry("Thought");
  const original = Buffer.from(pool);
  const result = patchStringPool(pool, [{ en: "Thought", zh: "思考了", skipPatch: "model-prompt-contract" }]);
  assert.equal(result.patched, 0);
  assert.deepEqual(pool, original);
});

// 粘贴/截断附件的协议碎片不能翻译：Bun 把 `[Pasted text #${id} +${n} lines]`
// 模板拆成常量池静态段，翻译 ` lines]` 会让运行时识别附件的正则失配，
// 模型只收到占位符字面量而不是真实粘贴内容。
test("paste/truncate protocol fragments in the pool are never translated", () => {
  const pool = entry(" lines]", true);
  const original = Buffer.from(pool);
  const result = patchStringPool(pool, [{ en: " lines]", zh: " 行]" }]);
  assert.equal(result.patched, 0);
  assert.deepEqual(pool, original);
});

test("protocol fragment protection does not block neighbouring UI strings", () => {
  const fragment = entry(" lines]", true);
  const pool = Buffer.concat([fragment, entry("Pondering")]);
  const result = patchStringPool(pool, [
    { en: " lines]", zh: " 行]" },
    { en: "Pondering", zh: "思索中" },
  ]);
  assert.equal(result.patched, 1);
  assert.deepEqual(pool.subarray(0, fragment.length), fragment);
  const contentStart = fragment.length + 8;
  assert.equal(pool.subarray(contentStart, contentStart + 6).toString("utf16le"), "思索中");
});

// 回归：` (ctrl+o to expand)` 是 19B 窄槽，最多放 9 个 UTF-16 单元（18B）。
// 主表译文 ` (ctrl+o 展开)`（24B）给明文路径用，放进池槽会被静默跳过（tooLong），
// 用户只看到英文；池内专用短译由 POOL_TRANSLATIONS 提供并覆盖主表。
test("ctrl+o expand hint pool slot falls back to the narrow-slot translation", () => {
  const table = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "cli-translations.json"), "utf8")
  );
  const pool = entry(" (ctrl+o to expand)");
  const result = patchStringPool(pool, table);
  assert.equal(result.patched, 1, "zh must fit the 19-byte narrow slot instead of silently tooLong");
  assert.equal(result.tooLong, 0);
  assert.equal(pool.readUInt32LE(0) & 0x7fffffff, " ctrl+o展开".length);
  assert.ok(
    Buffer.from(" ctrl+o展开", "utf16le").length <= 19,
    "pool translation must fit the 19-byte slot"
  );
});

// `Shell cwd was reset to <dir>` 由明文正则解析以复位执行目录，译文会让解析
// 失配、后续命令跑到错误目录。池里暂无完整条目，守卫纯属防御。
test("regex-consumed Shell cwd reset message is never translated", () => {
  const pool = entry("Shell cwd was reset to ");
  const original = Buffer.from(pool);
  const result = patchStringPool(pool, [{ en: "Shell cwd was reset to ", zh: "Shell cwd 已被重置到 " }]);
  assert.equal(result.patched, 0);
  assert.deepEqual(pool, original);
});

test("logical-consumed guard does not block neighbouring UI strings", () => {
  const fragment = entry("Shell cwd was reset to ");
  const pool = Buffer.concat([fragment, entry("Pondering")]);
  const result = patchStringPool(pool, [
    { en: "Shell cwd was reset to ", zh: "Shell cwd 已被重置到 " },
    { en: "Pondering", zh: "思索中" },
  ]);
  assert.equal(result.patched, 1);
  assert.deepEqual(pool.subarray(0, fragment.length), fragment);
});

// 池内专用片段：只在池里当展示片段的串（+N lines / Added / completed / timeout）。
// 主表不含这些键——写进 cli-translations.json 会让明文路径在协议模板或提示词里
// 误替换（如 ` lines` 与协议的 ` lines]` 相邻）。这里核对它们放得进真实槽宽。
test("pool-only UI fragments translate without entering the plaintext table", () => {
  const mainKeys = new Set(
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "cli-translations.json"), "utf8"))
      .map((e) => e.en)
  );
  const slots = [
    ["Added ", "新增 ", 6],
    [" lines", " 行", 6],
    [" completed", " 已完成", 10],
    ["timeout ", "超时 ", 8],
    [" · timeout ", " ·超时 ", 11],
    [" for ", "耗时", 5],
    ["searched for", "搜索了", 12],
    ["patterns", "个模式", 8],
  ];
  for (const [en, zh, bytes] of slots) {
    assert.ok(!mainKeys.has(en), `${en} must stay out of the plaintext table`);
    assert.ok(Buffer.from(zh, "utf16le").length <= bytes, `${en} zh fits ${bytes}B slot`);
    const pool = entry(en);
    assert.equal(patchStringPool(pool, []).patched, 1, `${en} must patch from the pool-only table`);
    assert.equal(pool.subarray(8, 8 + Buffer.from(zh, "utf16le").length).toString("utf16le"), zh);
  }
});


// "译文存在但静默 tooLong 不生效" 再次出现。槽宽来自 2.1.260 实测。
test("newly added pool UI phrases fit their real pool slot widths", () => {
  const map = new Map(
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "cli-translations.json"), "utf8"))
      .map((e) => [e.en, e])
  );
  const slots = [
    ["Background work is running", 26],
    ["The following will stop when you exit:", 38],
    ["Exit and stop tasks", 19],
    ["Move to background and exit", 27],
    ["Stay", 4],
    ["completed in background", 23],
    ["still running in background", 27],
    ["Running… ", 18],
    [" · done ", 8],
    ["Searching for ", 14],
  ];
  for (const [en, bytes] of slots) {
    const zh = map.get(en)?.zh;
    assert.ok(zh, `translation exists for ${en}`);
    assert.ok(
      Buffer.from(zh, "utf16le").length <= bytes,
      `${en} zh fits ${bytes}B slot (got ${Buffer.from(zh, "utf16le").length}B)`
    );
  }
});
