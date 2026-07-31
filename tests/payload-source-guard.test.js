const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const guardScript = path.join(repoRoot, "scripts", "check-payload-sources.js");

function runGuard(changedFiles) {
  const args = ["--repo-root", repoRoot];
  for (const file of changedFiles) {
    args.push("--changed-file", file);
  }

  return spawnSync("node", [guardScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("payload source guard fails when plugin payload files change without their source files", () => {
  const result = runGuard(["plugin/cli-translations.json", "plugin/patch-cli.js"]);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /payload-source-guard: FAIL/);
  assert.match(result.stdout, /plugin\/cli-translations\.json/);
  assert.match(result.stdout, /edit cli-translations\.json instead/);
  assert.match(result.stdout, /plugin\/patch-cli\.js/);
  assert.match(result.stdout, /edit patch-cli\.js instead/);
  assert.match(result.stdout, /bash scripts\/sync-payload\.sh/);
});

test("payload source guard passes when payload mirrors are changed with their source files", () => {
  const result = runGuard([
    "cli-translations.json",
    "plugin/cli-translations.json",
    "patch-cli.js",
    "plugin/patch-cli.js",
    "doctor.ps1",
    "plugin/bin/doctor.ps1",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /payload-source-guard: OK/);
});

test("payload source guard fails when source files change without synced payload mirrors", () => {
  const result = runGuard(["cli-translations.json", "patch-cli.js", "doctor.ps1", "scripts/zh-cn-doctor.js"]);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /payload-source-guard: FAIL/);
  assert.match(result.stdout, /cli-translations\.json/);
  assert.match(result.stdout, /sync plugin\/cli-translations\.json/);
  assert.match(result.stdout, /patch-cli\.js/);
  assert.match(result.stdout, /sync plugin\/patch-cli\.js/);
  assert.match(result.stdout, /doctor\.ps1/);
  assert.match(result.stdout, /sync plugin\/bin\/doctor\.ps1/);
  assert.match(result.stdout, /scripts\/zh-cn-doctor\.js/);
  assert.match(result.stdout, /sync plugin\/scripts\/zh-cn-doctor\.js/);
  assert.match(result.stdout, /bash scripts\/sync-payload\.sh/);
});

test("payload source guard unit checkPayloadSourceEdits allows mirroring an already-existing source", () => {
  // 首次把已存在的源镜像进 plugin/：源内容没变(不在 diff)，只新增镜像。
  // sourceExistsInBase 返回 true 时应放行，不算「镜像无源」违规。
  const { checkPayloadSourceEdits } = require(guardScript);

  const result = checkPayloadSourceEdits(
    ["plugin/verbs/zh-CN.json", "plugin/tips/zh-CN.json"],
    undefined,
    { sourceExistsInBase: () => true }
  );
  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
});

test("payload source guard unit checkPayloadSourceEdits still flags mirror-without-source when source is new", () => {
  // 源文件在 base 里不存在（全新文件），只加镜像不加源 → 仍应判违规。
  const { checkPayloadSourceEdits } = require(guardScript);

  const result = checkPayloadSourceEdits(
    ["plugin/verbs/zh-CN.json"],
    undefined,
    { sourceExistsInBase: () => false }
  );
  assert.equal(result.ok, false);
  assert.equal(result.violations[0].type, "mirror-without-source");
});
