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

test("native latest candidate workflow has a push validation job instead of empty push runs", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /^\s*push:\s*\{\}/m);
  assert.doesNotMatch(workflow, /^\s*paths:/m);
  assert.match(workflow, /name:\s*Validate native candidate workflow/);
  assert.match(workflow, /node\s+--test\s+tests\/native-latest-workflow\.test\.js/);
});

test("native latest candidate workflow runs on macOS arm64 with native dependencies", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /if:\s*\$\{\{\s*github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'\s*\}\}/);
  assert.match(workflow, /runs-on:\s*macos-15\b/);
  assert.match(workflow, /macOS 15 arm64/);
  assert.match(workflow, /actions\/setup-node@v\d+/);
  assert.match(workflow, /node-version:\s*24/);
  assert.match(workflow, /\bnpm\s+install\b[^\n]*\bnode-lief\b/);
});

test("native latest candidate verification waits for workflow validation", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /^\s*verify:\n(?:.*\n){0,4}?\s+needs:\s*validate/m);
});

test("native latest candidate workflow resolves the requested or current latest version", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /inputs\.version/);
  assert.match(workflow, /npm\s+view\s+@anthropic-ai\/claude-code\s+version/);
});

test("native latest candidate workflow uploads evidence without promoting Mach-O patch support", () => {
  const workflow = readWorkflow();

  assert.match(
    workflow,
    /node\s+scripts\/verify-upstream-compat\.js\s+--baseline\s+"\$\{VERSION\}"\s+--skip-latest\s+--native-macos-arm64\s+--json/
  );
  assert.match(workflow, /actions\/upload-artifact@v\d+/);
  assert.match(workflow, /path:\s*\$\{\{\s*steps\.verify\.outputs\.json_path\s*\}\}/);
  assert.match(workflow, /Native candidate recorded/);
  assert.match(workflow, /Mach-O rewriting can break the binary signature/);
  assert.match(workflow, /Candidate JSON artifact: native-latest-candidate-/);
  assert.doesNotMatch(workflow, /contents:\s*write/);
  assert.doesNotMatch(workflow, /pull-requests:\s*write/);
  assert.doesNotMatch(workflow, /scripts\/promote-native-candidate\.js\s+--candidate[^\n]*--write/);
  assert.doesNotMatch(workflow, /peter-evans\/create-pull-request@v\d+/);
  assert.doesNotMatch(workflow, /codex\/native-latest-/);
  assert.doesNotMatch(workflow, /\bgh\s+release\b/);
});

test("native latest candidate workflow publishes an upstream text diff report", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /Generate native text diff report/);
  assert.match(workflow, /scripts\/generate-upstream-text-diff\.js/);
  assert.match(workflow, /text_report_path/);
  assert.match(workflow, /Upload native text diff report/);
  assert.match(workflow, /native-latest-text-diff-\$\{\{\s*steps\.version\.outputs\.version\s*\}\}/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /Text diff report artifact/);
});

test("native latest candidate workflow explains failed promotion boundaries", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /Explain native candidate boundary failure/);
  assert.match(workflow, /failure\(\)/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /scripts\/promote-native-candidate\.js\s+--candidate/);
  assert.match(workflow, /2>&1/);
  assert.doesNotMatch(workflow, /PROMOTE_OUTPUT/);
  assert.doesNotMatch(workflow, /PROMOTE_STATUS/);
});
