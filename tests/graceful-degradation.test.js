// 优雅降级闭环回归测试：
// - --backup 托管备份：re-patch 先恢复干净基底，杜绝 patch 叠 patch
// - --status 状态输出：ok / partial / noop / error
// - 语法校验：patch 结果非法 JS 时拒绝写盘（原文可解析时）
// - patch.log 错误可见性
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const patchCli = path.join(repoRoot, "patch-cli.js");
const translations = path.join(repoRoot, "cli-translations.json");

function makeContext() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-degrade-"));
  return {
    dir,
    cliFile: path.join(dir, "cli.js"),
    backupFile: path.join(dir, "cli.js.zh-cn-backup"),
    statusFile: path.join(dir, "status"),
    logFile: path.join(dir, "patch.log"),
  };
}

function runPatch(ctx, extraArgs = []) {
  const stdout = execFileSync(
    "node",
    [
      patchCli,
      ctx.cliFile,
      translations,
      "--backup",
      ctx.backupFile,
      "--status",
      ctx.statusFile,
      "--log",
      ctx.logFile,
      ...extraArgs,
    ],
    { encoding: "utf8" }
  );
  return {
    count: stdout.trim(),
    status: fs.existsSync(ctx.statusFile) ? fs.readFileSync(ctx.statusFile, "utf8").trim() : "",
  };
}

function englishCli(version = "1.0.0") {
  return [
    `// Version: ${version}`,
    'const waiting="Waiting for permission\\u2026";',
    'const failed="Failed to save ";',
    "",
  ].join("\n");
}

test("backup mode creates a backup from unpatched source and patches cleanly", () => {
  const ctx = makeContext();
  fs.writeFileSync(ctx.cliFile, englishCli());

  const result = runPatch(ctx);

  assert.equal(result.status, "ok");
  assert.match(fs.readFileSync(ctx.cliFile, "utf8"), /等待权限确认…/);
  // 备份应是未 patch 的英文原文
  assert.match(fs.readFileSync(ctx.backupFile, "utf8"), /Waiting for permission/);
});

test("re-patch restores from same-version backup instead of patching on top of patched file", () => {
  const ctx = makeContext();
  fs.writeFileSync(ctx.cliFile, englishCli());
  runPatch(ctx);

  // 模拟"已 patch 文件被再次 patch"的场景：backup 保持原文，再次运行
  const firstPass = fs.readFileSync(ctx.cliFile, "utf8");
  const second = runPatch(ctx);

  // 幂等：第二次结果与第一次完全一致（基于备份重建，而非叠加）
  assert.equal(fs.readFileSync(ctx.cliFile, "utf8"), firstPass);
  assert.ok(["ok", "noop"].includes(second.status), second.status);
});

test("version change refreshes backup from the new unpatched upstream", () => {
  const ctx = makeContext();
  fs.writeFileSync(ctx.cliFile, englishCli("1.0.0"));
  runPatch(ctx);

  // 模拟 Claude Code 升级：新版本英文原文直接覆盖 cli.js
  fs.writeFileSync(ctx.cliFile, englishCli("2.0.0"));
  const result = runPatch(ctx);

  assert.equal(result.status, "ok");
  assert.match(fs.readFileSync(ctx.cliFile, "utf8"), /等待权限确认…/);
  // 备份应刷新为 2.0.0 的英文原文
  const backup = fs.readFileSync(ctx.backupFile, "utf8");
  assert.match(backup, /Version: 2\.0\.0/);
  assert.match(backup, /Waiting for permission/);
});

test("reports partial status when residue probes remain after patch", () => {
  const ctx = makeContext();
  fs.writeFileSync(
    ctx.cliFile,
    [
      "// Version: 1.0.0",
      'const waiting="Waiting for permission\\u2026";',
      // 构造一个翻译表覆盖不到的 residue 探针变体（真实探针文本嵌在动态模板里）
      "const probe=`Quick safety check${suffix}`;",
      "",
    ].join("\n")
  );

  const result = runPatch(ctx);

  assert.equal(result.status, "partial");
  // 已覆盖的部分仍然翻译成功（部分降级，不是全有全无）
  assert.match(fs.readFileSync(ctx.cliFile, "utf8"), /等待权限确认…/);
});

test("reports noop when nothing needs patching", () => {
  const ctx = makeContext();
  fs.writeFileSync(ctx.cliFile, '// Version: 1.0.0\nconst x="nothing to translate here";\n');

  const result = runPatch(ctx);

  assert.equal(result.status, "noop");
  assert.equal(result.count, "0");
});

test("unexpected errors degrade to no-change exit with error status and log entry", () => {
  const ctx = makeContext();
  fs.writeFileSync(ctx.cliFile, englishCli());
  const before = fs.readFileSync(ctx.cliFile, "utf8");

  // 传入不存在的翻译文件路径不会崩（存在性检查），改用非法 JSON 触发异常
  const badTranslations = path.join(ctx.dir, "bad.json");
  fs.writeFileSync(badTranslations, "{not valid json");
  const stdout = execFileSync(
    "node",
    [patchCli, ctx.cliFile, badTranslations, "--status", ctx.statusFile, "--log", ctx.logFile],
    { encoding: "utf8" }
  );

  assert.equal(stdout.trim(), "0");
  assert.equal(fs.readFileSync(ctx.statusFile, "utf8").trim(), "error");
  assert.equal(fs.readFileSync(ctx.cliFile, "utf8"), before, "file must stay untouched");
  assert.match(fs.readFileSync(ctx.logFile, "utf8"), /unexpected-error/);
});

test("validates ESM sources via node --check instead of skipping (real npm cli.js has top-level import)", () => {
  const ctx = makeContext();
  // vm.Script 解析不了顶层 import，但 node --check 可以 → 必须仍然做校验，不能走 validation-skipped
  fs.writeFileSync(
    ctx.cliFile,
    [
      "// Version: 1.0.0",
      'import { createRequire } from "node:module";',
      'const waiting="Waiting for permission\\u2026";',
      "",
    ].join("\n")
  );

  const result = runPatch(ctx);

  assert.equal(result.status, "ok");
  assert.match(fs.readFileSync(ctx.cliFile, "utf8"), /等待权限确认…/);
  const log = fs.existsSync(ctx.logFile) ? fs.readFileSync(ctx.logFile, "utf8") : "";
  assert.doesNotMatch(log, /validation-skipped/);
});

test("skips syntax validation when the source itself is not parseable (native extract)", () => {
  const ctx = makeContext();
  // 原文本身不是合法 JS（模拟 native 提取物），但包含可翻译字面量
  fs.writeFileSync(
    ctx.cliFile,
    ['// Version: 1.0.0', '@bun-pragma {', 'const waiting="Waiting for permission\\u2026";', ""].join("\n")
  );

  const result = runPatch(ctx);

  assert.match(fs.readFileSync(ctx.cliFile, "utf8"), /等待权限确认…/);
  assert.match(fs.readFileSync(ctx.logFile, "utf8"), /validation-skipped/);
  assert.ok(["ok", "partial", "noop"].includes(result.status), result.status);
});
