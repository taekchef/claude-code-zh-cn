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

// `Agent "`（Bun 内 minify 名 `Wet`）与 `" finished`（`Xir`）是一对逻辑前缀/后缀：
// agent 任务列表靠 `startsWith(Wet) && r.endsWith(Xir)` 识别完成通知，同一常量还用于
// 生成模型可见的 `<task-notification><summary>Agent "…" finished</summary>` 协议文本。
// 翻译会让任务识别失配、协议文本混入中文，故池里确有这个 7B 条目也必须拒绝。
test("agent task notification prefix consumed by startsWith/endsWith is never translated", () => {
  const pool = entry('Agent "');
  const original = Buffer.from(pool);
  const result = patchStringPool(pool, [{ en: 'Agent "', zh: "后台" }]);
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


// 2.1.260 用户反馈的六类缺口：Waiting for task 前缀、chord 附加指示、后台
// agent 启动/完成、Goal 状态词、Task Output 工具名。全部只作池内展示片段，
// 写进 cli-translations.json 会让明文路径在协议模板或提示词里误替换，故走
// POOL_TRANSLATIONS。槽宽来自本机 2.1.260 实测（窄槽按 UTF-16 单元、宽槽按字节）。
test("2.1.260 reported gaps: pool-only UI fragments translate within slot width", () => {
  const mainKeys = new Set(
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "cli-translations.json"), "utf8"))
      .map((e) => e.en)
  );
  const slots = [
    ["\xA0\xA0\xA0\xA0\xA0Waiting for task", "\xA0\xA0等待任务", 21, false],
    ["give additional instructions", "给出额外指示", 28, false],
    [" background agents launched", " 个后台 Agent 启动", 27, false],
    ['Background agent "', '后台 Agent"', 18, false],
    [" finished", " 已完成", 9, false],
    ["Goal achieved", "目标已达成", 13, false],
    ["Goal could not be achieved", "目标未能达成", 26, false],
    ["Goal not yet met… continuing", "目标尚未达成…继续", 56, true],
    ["Task Output", "任务输出", 11, false],
  ];
  for (const [en, zh, bytes, wide] of slots) {
    assert.ok(!mainKeys.has(en), `${en} must stay out of the plaintext table`);
    assert.ok(
      Buffer.from(zh, "utf16le").length <= bytes,
      `${en} zh fits ${bytes}B slot (got ${Buffer.from(zh, "utf16le").length}B)`
    );
    const pool = entry(en, wide);
    assert.equal(patchStringPool(pool, []).patched, 1, `${en} must patch from the pool-only table`);
    const rep = Buffer.from(zh, "utf16le");
    assert.equal(pool.subarray(8, 8 + rep.length).toString("utf16le"), zh);
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

// 回归：上下文压缩后的 `✻ Conversation compacted (ctrl+o for history)` banner 又显示英文。
// 主表键是 `✻ Conversation compacted (`，但池条目是 `Conversation compacted (`（✻ 由独立
// 组件渲染，@111563738 children:[mB,"Conversation compacted (",Aw," for history)"]），
// 键不匹配故池路径长期未命中。尾段 ` for history)` 还被 summarized hint @112441011 的
// 模板 `` `Conversation summarized (${io} for history)` `` 共用，只翻尾段会造成中英混，
// 故 summarized 头段一并翻。四条均为展示层片段，走 POOL_TRANSLATIONS。
// ` for history)` 主表已有长译 ` 查看历史记录)`（14B），放不进 13B 窄槽，池内用短译覆盖；
// 其余三条主表无对应键，池内独有。槽宽 2.1.260 实测。
test("conversation compacted/summarized banner fragments translate within slot width", () => {
  const main = new Map(
    JSON.parse(fs.readFileSync(path.join(__dirname, "..", "cli-translations.json"), "utf8"))
      .map((e) => [e.en, e.zh])
  );
  const slots = [
    ["Conversation compacted (", "对话已压缩（", 24, false],
    ["Conversation summarized (", "对话已摘要（", 25, false],
    [" for history)", " 查看历史）", 13, false],
    [" for history", " 查看历史", 12, false],
  ];
  for (const [en, zh, bytes, wide] of slots) {
    const mainZh = main.get(en);
    if (mainZh !== undefined) {
      assert.ok(
        Buffer.from(mainZh, "utf16le").length > bytes,
        `${en} main zh (${mainZh}) must exceed ${bytes}B, otherwise no pool override is needed`
      );
    }
    assert.ok(
      Buffer.from(zh, "utf16le").length <= bytes,
      `${en} pool zh fits ${bytes}B slot (got ${Buffer.from(zh, "utf16le").length}B)`
    );
    const pool = entry(en, wide);
    assert.equal(patchStringPool(pool, []).patched, 1, `${en} must patch from the pool-only table`);
    const rep = Buffer.from(zh, "utf16le");
    assert.equal(pool.subarray(8, 8 + rep.length).toString("utf16le"), zh);
  }
});
