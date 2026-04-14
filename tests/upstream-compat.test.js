const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const compatScript = path.join(repoRoot, "scripts", "verify-upstream-compat.js");
const fixtureConfig = path.join(__dirname, "upstream-compat-fixtures", "config.json");
const fixturesDir = path.join(__dirname, "upstream-compat-fixtures", "packages");

function runCompat(args = []) {
  return spawnSync(
    "node",
    [compatScript, "--config", fixtureConfig, "--fixtures-dir", fixturesDir, ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
    }
  );
}

test("verify-upstream-compat supports --baseline override without touching config", () => {
  const result = runCompat(["--baseline", "1.0.0", "--skip-latest", "--json"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(
    payload.results.map((entry) => entry.version),
    ["1.0.0"]
  );
  assert.equal(payload.summary.pass, 1);
  assert.equal(payload.summary.fail, 0);
});

test("verify-upstream-compat appends latest version and reports residue kind/id", () => {
  const result = runCompat(["--latest-version", "1.0.2", "--json"]);

  assert.equal(result.status, 1, "fixture 1.0.1 should fail because it leaves a sentinel residue");
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(
    payload.results.map((entry) => entry.version),
    ["1.0.0", "1.0.1", "1.0.2"]
  );

  const failing = payload.results.find((entry) => entry.version === "1.0.1");
  assert.ok(failing, "expected 1.0.1 to be present in matrix output");
  assert.equal(failing.status, "fail");
  assert.deepEqual(failing.residue, [
    {
      kind: "sentinel",
      id: "future_probe",
      match: "Future untranslated probe",
    },
  ]);
});
