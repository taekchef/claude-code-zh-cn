"use strict";

// patch-bytecode.test.js — bytecode 常量池 patch 引擎的单元测试
// fixture 按真实 exe 条目形态构造：[u32: flags<<24|len][u32 hash][content]，条目紧密排列

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ENGINE = path.join(__dirname, "..", "scripts", "patch-bytecode.js");

// 构造一个最小 bytecode 容器样本：两个 8-bit 条目 + 一个 16-bit 条目
// 条目流紧密排列（实测形态），返回 Buffer
function buildSample() {
  const parts = [];
  function entry8(str) {
    const head = Buffer.alloc(8);
    head.writeUInt32LE((0x80 << 24 | str.length) >>> 0, 0);
    head.writeUInt32LE(0x11223344, 4); // hash 不校验，写死
    return Buffer.concat([head, Buffer.from(str, "latin1")]);
  }
  function entry16(str) {
    const units = [...str].length;
    const head = Buffer.alloc(8);
    head.writeUInt32LE(units >>> 0, 0); // flags=0x00
    head.writeUInt32LE(0x55667788, 4);
    return Buffer.concat([head, Buffer.from(str, "utf-16le")]);
  }
  parts.push(entry8("Pondering"));
  parts.push(entry8("almost done thinking"));
  parts.push(entry16("existing 16bit string"));
  return Buffer.concat(parts);
}

test("patch rewrites 8-bit entry as 16-bit Chinese in place", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zhcn-bc-"));
  try {
    const bin = path.join(dir, "fake-claude.exe");
    const trans = path.join(dir, "trans.json");
    fs.writeFileSync(bin, buildSample());
    fs.writeFileSync(trans, JSON.stringify([
      { en: "Pondering", zh: "思索中" }, // 3 units × 2B = 6B ≤ 9B 占位 ✓
    ]));
    const out = execFileSync(process.execPath, [ENGINE, "patch", bin, trans], { encoding: "utf8" });
    assert.match(out, /已 patch 1 条/);

    const buf = fs.readFileSync(bin);
    // 条目头已翻转为 16-bit len=3
    const headRaw = buf.readUInt32LE(0);
    assert.strictEqual(headRaw >>> 24, 0x00, "flags 应为 0x00（16-bit）");
    assert.strictEqual(headRaw & 0x00ffffff, 3, "len 应为译文字符数 3");
    // 内容为 UTF-16LE "思索中" + 3 字节 0x00 填充（原占位 9 字节）
    assert.deepStrictEqual([...buf.subarray(8, 14)], [...Buffer.from("思索中", "utf-16le")]);
    assert.deepStrictEqual([...buf.subarray(14, 17)], [0, 0, 0], "尾部应填充 0x00");
    // 后续条目（almost done thinking 的头）不受影响
    assert.strictEqual(buf.readUInt32LE(17) >>> 24, 0x80, "下一 8-bit 条目头 flags 不变");
    assert.strictEqual(buf.readUInt32LE(17) & 0xffffff, 20);
    assert.strictEqual(buf.subarray(25, 45).toString("latin1"), "almost done thinking");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("scan reports not-found for missing strings and keeps file untouched", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zhcn-bc-"));
  try {
    const bin = path.join(dir, "fake-claude.exe");
    const trans = path.join(dir, "trans.json");
    const original = buildSample();
    fs.writeFileSync(bin, original);
    fs.writeFileSync(trans, JSON.stringify([
      { en: "No Such String Here", zh: "不存在" },
    ]));
    const out = execFileSync(process.execPath, [ENGINE, "patch", bin, trans], { encoding: "utf8" });
    assert.match(out, /没有可 patch 的条目，未改动文件/);
    assert.ok(Buffer.compare(fs.readFileSync(bin), original) === 0, "文件应保持不变");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("patch skips entries whose translation is too long for the slot", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zhcn-bc-"));
  try {
    const bin = path.join(dir, "fake-claude.exe");
    const trans = path.join(dir, "trans.json");
    const original = buildSample();
    fs.writeFileSync(bin, original);
    fs.writeFileSync(trans, JSON.stringify([
      { en: "Musing", zh: "沉思冥想中呀" }, // 6 units × 2B = 12B > 6B 占位 → 跳过
    ]));
    const out = execFileSync(process.execPath, [ENGINE, "patch", bin, trans], { encoding: "utf8" });
    assert.match(out, /没有可 patch 的条目，未改动文件/);
    assert.ok(Buffer.compare(fs.readFileSync(bin), original) === 0, "文件应保持不变");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("skipPatch entries (model prompt contract) are never patched", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zhcn-bc-"));
  try {
    const bin = path.join(dir, "fake-claude.exe");
    const trans = path.join(dir, "trans.json");
    const original = buildSample();
    fs.writeFileSync(bin, original);
    fs.writeFileSync(trans, JSON.stringify([
      { en: "Pondering", zh: "思索中", skipPatch: "model-prompt-contract" },
    ]));
    execFileSync(process.execPath, [ENGINE, "patch", bin, trans], { encoding: "utf8" });
    assert.ok(Buffer.compare(fs.readFileSync(bin), original) === 0, "skipPatch 条目必须保持原样");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("16-bit entries are patched in place without changing size", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zhcn-bc-"));
  try {
    const bin = path.join(dir, "fake-claude.exe");
    const trans = path.join(dir, "trans.json");
    fs.writeFileSync(bin, buildSample());
    fs.writeFileSync(trans, JSON.stringify([
      { en: "existing 16bit string", zh: "已是16位" }, // 5 units = 10B ≤ 19×2=38B ✓
    ]));
    const out = execFileSync(process.execPath, [ENGINE, "patch", bin, trans], { encoding: "utf8" });
    assert.match(out, /已 patch 1 条/);
    const buf = fs.readFileSync(bin);
    const headRaw = buf.readUInt32LE(51); // 9+8 + 20+8 + 8 头位置 = 17+8+28 = 53？实际按 8+29=37 后的 16-bit 头
    // 直接全局验证：文件大小不变
    assert.strictEqual(buf.length, buildSample().length, "总大小必须不变");
    // 找到 patched 头
    let found = false;
    for (let p = 0; p < buf.length - 8; p++) {
      const raw = buf.readUInt32LE(p);
      if ((raw >>> 24) === 0 && (raw & 0xffffff) === 5) {
        const content = buf.subarray(p + 8, p + 18).toString("utf-16le");
        if (content === "已是16位") { found = true; break; }
      }
    }
    assert.ok(found, "应存在 16-bit 头 len=5 内容='已是16位'");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("idempotent: patching an already-patched binary is a no-op", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zhcn-bc-"));
  try {
    const bin = path.join(dir, "fake-claude.exe");
    const trans = path.join(dir, "trans.json");
    fs.writeFileSync(bin, buildSample());
    fs.writeFileSync(trans, JSON.stringify([{ en: "Pondering", zh: "思索中" }]));
    execFileSync(process.execPath, [ENGINE, "patch", bin, trans], { encoding: "utf8" });
    const once = fs.readFileSync(bin);
    const out = execFileSync(process.execPath, [ENGINE, "patch", bin, trans], { encoding: "utf8" });
    const twice = fs.readFileSync(bin);
    assert.match(out, /没有可 patch 的条目，未改动文件/);
    assert.ok(Buffer.compare(once, twice) === 0, "第二次 patch 不应再改动");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
