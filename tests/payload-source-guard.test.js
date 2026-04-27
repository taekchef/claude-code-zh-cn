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
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /payload-source-guard: OK/);
});

test("payload source guard fails when source files change without synced payload mirrors", () => {
  const result = runGuard(["cli-translations.json", "patch-cli.js"]);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /payload-source-guard: FAIL/);
  assert.match(result.stdout, /cli-translations\.json/);
  assert.match(result.stdout, /sync plugin\/cli-translations\.json/);
  assert.match(result.stdout, /patch-cli\.js/);
  assert.match(result.stdout, /sync plugin\/patch-cli\.js/);
  assert.match(result.stdout, /bash scripts\/sync-payload\.sh/);
});
