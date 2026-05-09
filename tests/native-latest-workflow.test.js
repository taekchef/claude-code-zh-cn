const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "native-latest-candidate.yml");

function readWorkflow() {
  return fs.readFileSync(workflowPath, "utf8");
}

test("native latest candidate workflow can be triggered manually and on schedule", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /^\s*workflow_dispatch:/m);
  assert.match(workflow, /^\s*schedule:/m);
  assert.match(workflow, /-\s+cron:/);
});

test("native latest candidate workflow runs on macOS arm64 with native dependencies", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /runs-on:\s*macos-15\b/);
  assert.match(workflow, /macOS 15 arm64/);
  assert.match(workflow, /actions\/setup-node@v\d+/);
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /\bnpm\s+install\b[^\n]*\bnode-lief\b/);
});

test("native latest candidate workflow resolves the requested or current latest version", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /inputs\.version/);
  assert.match(workflow, /npm\s+view\s+@anthropic-ai\/claude-code\s+version/);
});

test("native latest candidate workflow promotes passing candidates into a PR-ready branch", () => {
  const workflow = readWorkflow();

  assert.match(
    workflow,
    /node\s+scripts\/verify-upstream-compat\.js\s+--baseline\s+"\$\{VERSION\}"\s+--skip-latest\s+--native-macos-arm64\s+--json/
  );
  assert.match(workflow, /actions\/upload-artifact@v\d+/);
  assert.match(workflow, /path:\s*\$\{\{\s*steps\.verify\.outputs\.json_path\s*\}\}/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /pull-requests:\s*write/);
  assert.match(workflow, /scripts\/promote-native-candidate\.js\s+--candidate/);
  assert.match(workflow, /scripts\/generate-plugin-support-window\.js\s+--write/);
  assert.match(workflow, /scripts\/generate-support-matrix\.js/);
  assert.match(workflow, /scripts\/sync-readme-support-window\.js\s+--write/);
  assert.match(workflow, /scripts\/sync-doc-derived-counts\.js\s+--write/);
  assert.match(workflow, /peter-evans\/create-pull-request@v\d+/);
  assert.match(workflow, /codex\/native-latest-/);
  assert.doesNotMatch(workflow, /\bgh\s+release\b/);
});

test("native latest candidate workflow explains failed promotion boundaries", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /Explain native candidate boundary failure/);
  assert.match(workflow, /failure\(\)/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /scripts\/promote-native-candidate\.js\s+--candidate/);
  assert.match(workflow, /2>&1/);
});
