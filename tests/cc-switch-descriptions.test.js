"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const cc = require("../plugin/skills/zh-cn-setup/scripts/cc-switch-descriptions.js");

function tmpdir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cczh-ccsd-"));
}

function writeMd(dir, name, description) {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n`);
}

test("parseFrontmatterDescription 提取带引号的中文 description", () => {
  const dir = tmpdir();
  const md = path.join(dir, "SKILL.md");
  fs.writeFileSync(md, '---\nname: docx\ndescription: "当用户想要创建 Word 文档时使用。"\ndescription_en: "Use for Word docs."\n---\n');
  assert.equal(cc.parseFrontmatterDescription(md), "当用户想要创建 Word 文档时使用。");
});

test("parseFrontmatterDescription 兼容无引号与 desc 键", () => {
  const dir = tmpdir();
  const md = path.join(dir, "SKILL.md");
  fs.writeFileSync(md, "---\ndesc: 处理电子表格\n---\n");
  assert.equal(cc.parseFrontmatterDescription(md), "处理电子表格");
});

test("parseFrontmatterDescription 无 frontmatter 返回 null", () => {
  const dir = tmpdir();
  const md = path.join(dir, "SKILL.md");
  fs.writeFileSync(md, "# 标题\n正文");
  assert.equal(cc.parseFrontmatterDescription(md), null);
});

test("parseFrontmatterDescription 文件不存在返回 null", () => {
  assert.equal(cc.parseFrontmatterDescription(path.join(tmpdir(), "nope", "SKILL.md")), null);
});

test("hasCJK / isMostlyZh 判定中英文", () => {
  assert.equal(cc.hasCJK("Use this skill"), false);
  assert.equal(cc.hasCJK("使用此技能"), true);
  assert.equal(cc.isMostlyZh("使用此技能处理文档"), true);
  assert.equal(cc.isMostlyZh("Create diagrams, export SVG, \"生成 GIF\""), false);
  assert.equal(cc.isMostlyZh(""), false);
});

test("buildSyncPlan 分类 已中/待更新/无源", () => {
  const dir = tmpdir();
  const dbPath = path.join(dir, "cc-switch.db");
  const skillsRoot = path.join(dir, "skills");

  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE skills (id TEXT, name TEXT, description TEXT)");
  const ins = db.prepare("INSERT INTO skills (id, name, description) VALUES (?, ?, ?)");
  ins.run("a", "done", "已翻译为中文的描述");
  ins.run("b", "todo", "English description for skill b");
  ins.run("c", "nosource", "English description for skill c");
  db.close();

  writeMd(skillsRoot, "done", '"已翻译为中文的描述"');
  writeMd(skillsRoot, "todo", '"待写入数据库的中文描述"');

  const plan = cc.buildSyncPlan(dbPath, skillsRoot);
  assert.deepEqual(plan.alreadyZh.map((r) => r.name), ["done"]);
  assert.deepEqual(plan.update.map((r) => r.name), ["todo"]);
  assert.deepEqual(plan.noSource.map((r) => r.name), ["nosource"]);
});

test("buildSyncPlan 数据库缺失时标记 missingDb", () => {
  const dir = tmpdir();
  const plan = cc.buildSyncPlan(path.join(dir, "absent.db"), path.join(dir, "skills"));
  assert.ok(plan.missingDb);
  assert.equal(plan.update.length, 0);
});

test("applyPlan 先备份再更新，数据可从备份还原", () => {
  const dir = tmpdir();
  const dbPath = path.join(dir, "cc-switch.db");
  const skillsRoot = path.join(dir, "skills");

  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE skills (id TEXT, name TEXT, description TEXT)");
  db.prepare("INSERT INTO skills (id, name, description) VALUES (?, ?, ?)").run("b", "todo", "English old");
  db.close();

  writeMd(skillsRoot, "todo", '"新的中文描述"');
  const plan = cc.buildSyncPlan(dbPath, skillsRoot);
  const { backup, updated } = cc.applyPlan(dbPath, plan);
  assert.equal(updated, 1);
  assert.ok(fs.existsSync(backup));

  const check = new DatabaseSync(dbPath, { readOnly: true });
  const row = check.prepare("SELECT description FROM skills WHERE name = ?").get("todo");
  check.close();
  assert.equal(row.description, "新的中文描述");

  // 备份内容仍是旧英文值
  const bak = new DatabaseSync(backup, { readOnly: true });
  const old = bak.prepare("SELECT description FROM skills WHERE name = ?").get("todo");
  bak.close();
  assert.equal(old.description, "English old");
});

test("printPlan 汇总三类记录", () => {
  const plan = {
    update: [{ id: "b", name: "todo" }],
    alreadyZh: [{ id: "a", name: "done" }],
    noSource: [{ id: "c", name: "nosource", reason: "x" }],
  };
  const text = cc.printPlan(plan);
  assert.match(text, /待同步为中文（1 条）/);
  assert.match(text, /已是中文（1 条）/);
  assert.match(text, /无中文源可同步（1 条，/);
});
