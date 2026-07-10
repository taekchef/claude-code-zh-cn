const test = require("node:test");
const assert = require("node:assert/strict");
const { cjkRatio } = require("../plugin/skill-i18n/lib/cjk");

test("cjkRatio: 纯英文 → 0", () => {
  assert.equal(cjkRatio("Use when you need to refactor a function"), 0);
});

test("cjkRatio: 纯中文 → 1", () => {
  assert.equal(cjkRatio("当你需要重构函数时使用"), 1);
});

test("cjkRatio: 中英混合 → 介于 0 和 1 之间", () => {
  const r = cjkRatio("Use when 当你需要重构");
  assert.ok(r > 0 && r < 1, `got ${r}`);
});

test("cjkRatio: 全角标点计入 CJK", () => {
  const r = cjkRatio("：；「」");
  assert.equal(r, 1);
});

test("cjkRatio: 空值安全 → 0", () => {
  assert.equal(cjkRatio(""), 0);
  assert.equal(cjkRatio(null), 0);
  assert.equal(cjkRatio(undefined), 0);
});
