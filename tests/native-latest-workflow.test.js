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

test("native latest candidate workflow verifies one candidate and uploads JSON only", () => {
  const workflow = readWorkflow();

  assert.match(
    workflow,
    /node\s+scripts\/verify-upstream-compat\.js\s+--baseline\s+"\$\{VERSION\}"\s+--skip-latest\s+--native-macos-arm64\s+--json/
  );
  assert.match(workflow, /actions\/upload-artifact@v\d+/);
  assert.match(workflow, /path:\s*\$\{\{\s*steps\.verify\.outputs\.json_path\s*\}\}/);
  assert.doesNotMatch(workflow, /\bgit\s+push\b/);
  assert.doesNotMatch(workflow, /\bgh\s+release\b/);
  assert.doesNotMatch(workflow, /\bgh\s+pr\b/);
});
