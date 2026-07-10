const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const collect = require("../plugin/skill-i18n/lib/collect");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "collect-"));
  // 真实 skill
  fs.mkdirSync(path.join(root, "skills", "real"), { recursive: true });
  fs.writeFileSync(path.join(root, "skills", "real", "SKILL.md"), "---\nname: real\n---\n");
  // 符号链接 skill（指向外部目录）
  const target = path.join(root, "linked-target");
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, "SKILL.md"), "---\nname: linked\n---\n");
  fs.symlinkSync(target, path.join(root, "skills", "linked"), "dir");
  // 用户 command
  fs.mkdirSync(path.join(root, "commands"), { recursive: true });
  fs.writeFileSync(path.join(root, "commands", "c.md"), "---\ndescription: x\n---\n");
  return root;
}

test("collectAll follow=false：跳过符号链接 skill（scan 默认行为）", () => {
  const root = setup();
  const skills = collect.collectAll(root, false).filter((f) => f.kind === "skill");
  assert.equal(skills.length, 1);
  assert.ok(skills[0].path.endsWith("real/SKILL.md"));
});

test("collectAll follow=true：跟随符号链接 skill（restore 总是跟随）", () => {
  const root = setup();
  const skills = collect.collectAll(root, true).filter((f) => f.kind === "skill");
  assert.equal(skills.length, 2); // real + linked
});

test("collectAll 收集 command", () => {
  const root = setup();
  const cmds = collect.collectAll(root, false).filter((f) => f.kind === "command");
  assert.equal(cmds.length, 1);
  assert.ok(cmds[0].path.endsWith("commands/c.md"));
});

// ---------- 防环（五轴 review 修复的回归守护）----------

test("防环: skills 子树符号链接成环不死循环（follow=true）", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "collect-loop-"));
  fs.mkdirSync(path.join(root, "skills", "a"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills", "b"), { recursive: true });
  fs.writeFileSync(path.join(root, "skills", "a", "SKILL.md"), "x");
  fs.writeFileSync(path.join(root, "skills", "b", "SKILL.md"), "x");
  // a/link-to-b -> b, b/link-to-a -> a（成环）
  fs.symlinkSync(path.join(root, "skills", "b"), path.join(root, "skills", "a", "link-to-b"), "dir");
  fs.symlinkSync(path.join(root, "skills", "a"), path.join(root, "skills", "b", "link-to-a"), "dir");
  const r = collect.collectAll(root, true);
  assert.ok(r.length < 100, `成环未挡住，收集 ${r.length} 项`);
});

test("防环: commands 子树符号链接回指祖先（follow=true，上轮漏的）", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "collect-cmd-loop-"));
  fs.mkdirSync(path.join(root, "commands", "sub"), { recursive: true });
  fs.writeFileSync(path.join(root, "commands", "c1.md"), "x");
  fs.writeFileSync(path.join(root, "commands", "sub", "c2.md"), "x");
  // commands/sub/looplink -> ../.. = root（回到根，再进 commands 重收 c1）
  fs.symlinkSync(path.join(root), path.join(root, "commands", "sub", "looplink"), "dir");
  const cmds = collect.collectAll(root, true).filter((f) => f.kind === "command");
  assert.equal(cmds.length, 2, `commands 子树成环，应=2（c1+c2），实际 ${cmds.length}`);
});

test("collectCommandsDeep 应用 EXCLUDE_SEGS：commands/.git/x.md 不被收集", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "collect-exclude-"));
  fs.mkdirSync(path.join(root, "commands", ".git"), { recursive: true });
  fs.mkdirSync(path.join(root, "commands", "keep"), { recursive: true });
  fs.writeFileSync(path.join(root, "commands", ".git", "skip.md"), "x");
  fs.writeFileSync(path.join(root, "commands", "keep", "k.md"), "x");
  fs.writeFileSync(path.join(root, "commands", "top.md"), "x");
  const cmds = collect.collectAll(root, false).filter((f) => f.kind === "command");
  assert.ok(!cmds.some((c) => c.path.includes(".git")), "不应收集 .git 下的 .md");
  assert.equal(cmds.length, 2); // top.md + keep/k.md
});

// ---------- 深递归 + plugin cache + marketplaces ----------

test("深嵌套 skill 被递归发现", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "collect-deep-"));
  fs.mkdirSync(path.join(root, "skills", "a", "b", "c", "d"), { recursive: true });
  fs.writeFileSync(path.join(root, "skills", "a", "b", "c", "d", "SKILL.md"), "x");
  const r = collect.collectAll(root, false).filter((f) => f.kind === "skill");
  assert.equal(r.length, 1);
});

test("collectPluginMarkdown: plugins/cache/<mp>/<plugin>/<version>/ 三层递归", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "collect-cache-"));
  const cacheRoot = path.join(root, "plugins", "cache", "mymp", "myplugin", "1.0.0");
  fs.mkdirSync(path.join(cacheRoot, "skills", "p"), { recursive: true });
  fs.mkdirSync(path.join(cacheRoot, "commands"), { recursive: true });
  fs.writeFileSync(path.join(cacheRoot, "skills", "p", "SKILL.md"), "x");
  fs.writeFileSync(path.join(cacheRoot, "commands", "cmd.md"), "x");
  const r = collect.collectPluginMarkdown(root, false);
  assert.equal(r.length, 2);
});

test("collectMarketplaces: plugins/marketplaces/<name>/ 收集", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "collect-mp-"));
  const mpRoot = path.join(root, "plugins", "marketplaces", "myplugin");
  fs.mkdirSync(path.join(mpRoot, "skills", "s"), { recursive: true });
  fs.writeFileSync(path.join(mpRoot, "skills", "s", "SKILL.md"), "x");
  const r = collect.collectMarketplaces(root, false);
  assert.ok(r.some((f) => f.path.includes("marketplaces/myplugin/skills/s/SKILL.md")));
});

test("空目录 / 不存在根 → collectAll 不抛", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "collect-empty-"));
  const r = collect.collectAll(root, false);
  assert.deepEqual(r, []);
});
