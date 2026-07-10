const test = require("node:test");
const assert = require("node:assert/strict");
const meta = require("../plugin/skill-i18n/lib/metadata");

test("plugin.json: 提取顶层 description", () => {
  const obj = { name: "foo", description: "A plugin.", version: "1.0" };
  const descs = meta.extractDescriptions(obj);
  assert.equal(descs.length, 1);
  assert.equal(descs[0].jsonPath, "$.description");
  assert.equal(descs[0].en, "A plugin.");
});

test("marketplace.json: 提取 metadata.description 嵌套层", () => {
  const obj = { metadata: { description: "Marketplace meta." } };
  const descs = meta.extractDescriptions(obj);
  assert.equal(descs.length, 1);
  assert.equal(descs[0].jsonPath, "$.metadata.description");
});

test("applyTranslation / restore 对 $.metadata.description", () => {
  const obj = { metadata: { description: "Meta." } };
  meta.applyTranslation(obj, "$.metadata.description", "元信息。", "Meta.");
  assert.equal(obj.metadata.description, "元信息。");
  assert.equal(obj.metadata._description_en, "Meta.");
  meta.restoreAll(obj);
  assert.equal(obj.metadata.description, "Meta.");
  assert.equal(obj.metadata._zh_cn_translated, undefined);
});

test("marketplace.json: 提取顶层 + plugins[] 多个 description", () => {
  const obj = {
    name: "mp",
    description: "Marketplace.",
    plugins: [
      { name: "a", description: "Plugin A." },
      { name: "b", description: "Plugin B." },
      { name: "c" },
    ],
  };
  const descs = meta.extractDescriptions(obj);
  assert.equal(descs.length, 3);
  assert.equal(descs[1].jsonPath, "$.plugins[0].description");
  assert.equal(descs[2].en, "Plugin B.");
});

test("applyTranslation: 写回中文 + 备份 + 标记", () => {
  const obj = { name: "foo", description: "Hello." };
  meta.applyTranslation(obj, "$.description", "你好。", "Hello.");
  assert.equal(obj.description, "你好。");
  assert.equal(obj._description_en, "Hello.");
  assert.equal(obj._zh_cn_translated, true);
});

test("applyTranslation 对 marketplace plugins[] 项", () => {
  const obj = { plugins: [{ name: "a", description: "A." }] };
  meta.applyTranslation(obj, "$.plugins[0].description", "甲。", "A.");
  assert.equal(obj.plugins[0].description, "甲。");
  assert.equal(obj.plugins[0]._description_en, "A.");
});

test("isPathTranslated", () => {
  const obj = { description: "x", plugins: [{ description: "y" }] };
  assert.equal(meta.isPathTranslated(obj, "$.description"), false);
  meta.applyTranslation(obj, "$.description", "x中", "x");
  assert.equal(meta.isPathTranslated(obj, "$.description"), true);
  assert.equal(meta.isPathTranslated(obj, "$.plugins[0].description"), false);
});

test("restoreAll: 还原所有已译 description", () => {
  const obj = {
    description: "你好。",
    _description_en: "Hello.",
    _zh_cn_translated: true,
    plugins: [{ description: "甲。", _description_en: "A.", _zh_cn_translated: true }],
  };
  meta.restoreAll(obj);
  assert.equal(obj.description, "Hello.");
  assert.equal(obj._description_en, undefined);
  assert.equal(obj.plugins[0].description, "A.");
  assert.equal(obj.plugins[0]._zh_cn_translated, undefined);
});

test("serialize: 合法 JSON + 尾换行", () => {
  const s = meta.serialize({ description: "你好。" });
  assert.doesNotThrow(() => JSON.parse(s));
  assert.ok(s.endsWith("\n"));
});

test("tryParse: 损坏 JSON 返回 null", () => {
  assert.equal(meta.tryParse("{bad"), null);
});
