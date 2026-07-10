const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseFrontmatter,
  getDescription,
  rewriteDescription,
  restoreDescription,
  hasTranslatedMarker,
  getOriginalEn,
} = require("../plugin/skill-i18n/lib/frontmatter");

// 提取 frontmatter 关闭 --- 之后的正文（逐字节）
function bodyAfter(text) {
  const p = parseFrontmatter(text);
  return p.hasFm ? p.lines.slice(p.closeIdx + 1).join("\n") : text;
}

// ---------- 解析 ----------

test("解析 plain description", () => {
  const t = "---\nname: foo\ndescription: Use when refactoring.\n---\n# Body\n";
  assert.equal(getDescription(t), "Use when refactoring.");
});

test("解析双引号 description（含 em-dash）", () => {
  const t = '---\nname: foo\ndescription: "Create a PR — discovers templates"\n---\n';
  assert.equal(getDescription(t), "Create a PR — discovers templates");
});

test("解析单引号 description", () => {
  const t = "---\ndescription: 'Review the diff for bugs'\n---\n";
  assert.equal(getDescription(t), "Review the diff for bugs");
});

test("解析 block scalar 折叠块（>）", () => {
  // 模拟 ponytail 风格的多行 description
  const t = "---\ndescription: >\n  Lazy means efficient,\n  not careless.\n---\n";
  assert.equal(getDescription(t), "Lazy means efficient, not careless.");
});

test("解析 block scalar 字面块（|）", () => {
  const t = "---\ndescription: |\n  Line one\n  Line two\n---\n";
  assert.equal(getDescription(t), "Line one\nLine two");
});

test("解析多行 > 折叠块（含引号/命令名，类真实 ponytail）", () => {
  const t = "---\ndescription: >\n  Audit for over-engineering. Use when the user says \"audit this\",\n  \"find bloat\", or \"/audit\". Does not apply fixes.\n---\n";
  assert.equal(
    getDescription(t),
    'Audit for over-engineering. Use when the user says "audit this", "find bloat", or "/audit". Does not apply fixes.'
  );
});

test("无 frontmatter → hasFm false", () => {
  assert.equal(parseFrontmatter("# just markdown\n").hasFm, false);
  assert.equal(getDescription("# no fm\n"), null);
});

test("空 frontmatter → 无 description", () => {
  assert.equal(getDescription("---\n---\n# Body\n"), null);
});

test("解析 CRLF 行尾的 description（#1 修复）", () => {
  const t = "---\r\nname: foo\r\ndescription: Use when refactoring.\r\n---\r\n# Body\r\n";
  assert.equal(getDescription(t), "Use when refactoring.");
  const out = rewriteDescription(t, { zh: "重构时使用。", en: "Use when refactoring." });
  assert.equal(getDescription(out), "重构时使用。");
});

// ---------- 写回 ----------

test("写回 plain description：正文逐字节不变，字段正确", () => {
  const t = "---\nname: foo\ndescription: Use when refactoring.\n---\n# Body\nline2\n";
  const origBody = bodyAfter(t);
  const out = rewriteDescription(t, { zh: "重构时使用。", en: "Use when refactoring." });

  assert.ok(out.includes('description: "重构时使用。"'), out);
  assert.ok(out.includes('description_en: "Use when refactoring."'), out);
  assert.ok(out.includes("x-zh-cn-translated: true"), out);
  // 正文逐字节相等（写坏 skill 是最危险回归，强断言守护）
  assert.equal(bodyAfter(out), origBody);
  // 重解析
  assert.equal(getDescription(out), "重构时使用。");
  assert.equal(hasTranslatedMarker(out), true);
  assert.equal(getOriginalEn(out), "Use when refactoring.");
});

test("写回双引号 description：原引号内容正确替换", () => {
  const t = '---\ndescription: "Create a PR — discovers templates"\n---\nbody\n';
  const out = rewriteDescription(t, { zh: "创建 PR — 自动发现模板", en: "Create a PR — discovers templates" });
  assert.equal(getDescription(out), "创建 PR — 自动发现模板");
  assert.ok(out.includes("body"), "正文保留");
});

test("写回 block scalar：多行值折叠为单行中文，原块行被删除", () => {
  const t = "---\ndescription: >\n  Lazy means efficient,\n  not careless.\n---\n# Body\n";
  const out = rewriteDescription(t, { zh: "懒即高效。", en: "Lazy means efficient, not careless." });
  assert.equal(getDescription(out), "懒即高效。");
  // 写回后 description 应为单行双引号（不再是 folded block），缩进块行被移除
  assert.equal(parseFrontmatter(out).desc.style, "double");
  assert.ok(!/\n  Lazy means efficient/.test(out), "块缩进行不应残留: " + out);
  // description_en 备份保留原文（单行）
  assert.ok(out.includes('description_en: "Lazy means efficient, not careless."'), out);
  assert.equal(bodyAfter(out), "# Body\n", "正文逐字节不变");
});

test("写回幂等：marker / description_en 不重复添加", () => {
  const t = "---\ndescription: x\n---\n";
  const out = rewriteDescription(t, { zh: "甲", en: "x" });
  const out2 = rewriteDescription(out, { zh: "乙", en: "x" });
  assert.equal((out2.match(/x-zh-cn-translated: true/g) || []).length, 1);
  assert.equal((out2.match(/description_en:/g) || []).length, 1);
  assert.equal(getDescription(out2), "乙");
});

test("写回保留其它 frontmatter 字段原样", () => {
  const t = "---\nname: foo\nlicense: MIT\ndescription: Hello.\n---\n";
  const out = rewriteDescription(t, { zh: "你好。", en: "Hello." });
  assert.ok(out.includes("license: MIT"), out);
  assert.ok(out.includes("name: foo"), out);
});

// ---------- 还原 ----------

test("还原：description 回英文，marker 与备份移除", () => {
  const t = "---\nname: foo\ndescription: Use when refactoring.\n---\n# Body\n";
  const translated = rewriteDescription(t, { zh: "重构时使用。", en: "Use when refactoring." });
  const restored = restoreDescription(translated);
  assert.equal(getDescription(restored), "Use when refactoring.");
  assert.equal(hasTranslatedMarker(restored), false);
  assert.equal(getOriginalEn(restored), null);
  assert.ok(restored.includes("# Body"), "正文保留");
});

test("还原无标记的文件：原样返回", () => {
  const t = "---\ndescription: Hello.\n---\nbody\n";
  assert.equal(restoreDescription(t), t);
});
