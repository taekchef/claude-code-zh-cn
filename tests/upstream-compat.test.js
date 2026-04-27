const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const compatScript = path.join(repoRoot, "scripts", "verify-upstream-compat.js");
const fixtureConfig = path.join(__dirname, "upstream-compat-fixtures", "config.json");
const fixturesDir = path.join(__dirname, "upstream-compat-fixtures", "packages");
const translationsFile = path.join(repoRoot, "cli-translations.json");

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

function writePr10StyleTranslations() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-pr10-translations-"));
  const target = path.join(dir, "cli-translations.json");
  const entries = JSON.parse(fs.readFileSync(translationsFile, "utf8"))
    .filter((entry) => !entry.en.includes("Ultrareview launched for"))
    .filter((entry) => !entry.en.includes("This review bills as Extra Usage"));

  for (const entry of entries) {
    if (entry.en === "Advisor Tool") {
      entry.zh = "顾问工具";
    }
  }

  fs.writeFileSync(target, `${JSON.stringify(entries, null, 2)}\n`);
  return target;
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
  const result = runCompat(["--baseline", "1.0.0,1.0.1", "--latest-version", "1.0.2", "--json"]);

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

test("verify-upstream-compat passes the 2.1.112 high-risk upstream text sample", () => {
  const result = runCompat(["--baseline", "2.1.112-risk", "--skip-latest", "--json"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const [risk] = payload.results;

  assert.equal(risk.version, "2.1.112-risk");
  assert.equal(risk.status, "pass");
  assert.deepEqual(risk.residue, []);
  assert.deepEqual(risk.missingRequired, []);
});

test("verify-upstream-compat catches PR #10-style high-risk text regressions", () => {
  const badTranslations = writePr10StyleTranslations();
  const result = runCompat([
    "--baseline",
    "2.1.112-risk",
    "--skip-latest",
    "--translations",
    badTranslations,
    "--json",
  ]);

  assert.equal(result.status, 1, "PR #10-style translations should fail the upstream text guard");
  const payload = JSON.parse(result.stdout);
  const [risk] = payload.results;

  assert.equal(risk.version, "2.1.112-risk");
  assert.equal(risk.status, "fail");
  assert.deepEqual(risk.missingRequired, [
    {
      kind: "upstream-text",
      id: "advisor_prompt_tool_name",
      rule: "preserve",
      match: "# Advisor Tool\n\nYou have access to an \\`advisor\\` tool",
    },
    {
      kind: "upstream-text",
      id: "advisor_dialog_title",
      rule: "preserve",
      match: "title:\"Advisor Tool\"",
    },
    {
      kind: "upstream-text",
      id: "ultrareview_billing_template",
      rule: "template",
      match: "body:`本次 review 会按 Extra Usage 计费（\\$\\{[^}]+\\}）。`",
    },
    {
      kind: "upstream-text",
      id: "ultrareview_launch_template",
      rule: "template",
      match:
        "text:`\\$\\{[^}]+\\}Ultrareview 已为 \\$\\{[^}]+\\} 启动（\\$\\{[^}]+\\}，云端运行）。跟踪：\\$\\{[^}]+\\}\\$\\{[^}]+\\}`",
    },
  ]);
});
