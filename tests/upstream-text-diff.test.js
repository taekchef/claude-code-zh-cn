const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const diffScript = path.join(repoRoot, "scripts", "generate-upstream-text-diff.js");
const fixtureConfig = path.join(__dirname, "upstream-compat-fixtures", "config.json");
const fixturesDir = path.join(__dirname, "upstream-compat-fixtures", "packages");

function runDiff(args = []) {
  return spawnSync("node", [diffScript, "--config", fixtureConfig, "--fixtures-dir", fixturesDir, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
}

test("upstream text diff reports new English strings for maintainer review", () => {
  const result = runDiff(["--from", "1.0.0", "--to", "1.0.1"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /# Upstream text diff: 1\.0\.0 -> 1\.0\.1/);
  assert.match(result.stdout, /Added upstream strings: 1/);
  assert.match(result.stdout, /Future untranslated probe/);
  assert.match(result.stdout, /Needs translation review: 1/);
});

test("upstream text diff can emit machine-readable added and removed strings", () => {
  const result = runDiff(["--from", "1.0.0", "--to", "1.0.1", "--json"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);

  assert.equal(payload.from, "1.0.0");
  assert.equal(payload.to, "1.0.1");
  assert.deepEqual(payload.added, ["Future untranslated probe"]);
  assert.deepEqual(payload.removed, []);
  assert.deepEqual(payload.needsTranslationReview, ["Future untranslated probe"]);
});

test("upstream text diff filters build metadata and embedded code fragments", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-text-diff-test-"));
  const packagesDir = path.join(tmp, "packages");
  const configPath = path.join(tmp, "config.json");
  const fromPackage = path.join(packagesDir, "1.0.0", "package");
  const toPackage = path.join(packagesDir, "1.0.1", "package");
  fs.mkdirSync(fromPackage, { recursive: true });
  fs.mkdirSync(toPackage, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    packageName: "@fixture/claude-code",
    baseline: { versions: ["1.0.0"] },
  }));
  fs.writeFileSync(path.join(fromPackage, "cli.js"), "const version='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';\n");
  fs.writeFileSync(path.join(toPackage, "cli.js"), [
    "const version='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';",
    "const packed='),lR({ISSUES_EXPLAINER:\"report the issue\",BUILD_TIME:\"2026-05-09T04:04:51Z\",GIT_SHA:\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"}.VERSION,c)){y(';",
    "const visible='Review this new friendly prompt';",
  ].join("\n"));

  const result = spawnSync("node", [
    diffScript,
    "--config", configPath,
    "--fixtures-dir", packagesDir,
    "--from", "1.0.0",
    "--to", "1.0.1",
    "--json",
  ], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.added, ["Review this new friendly prompt"]);
  assert.deepEqual(payload.needsTranslationReview, ["Review this new friendly prompt"]);
});
