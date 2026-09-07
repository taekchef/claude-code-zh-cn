"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
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
