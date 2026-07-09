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
  assert.match(workflow, /tests\/native-release-closeout\.test\.js/);
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

test("native latest candidate workflow also verifies Windows native candidates", () => {
  const workflow = readWorkflow();
  const windowsJob = workflow.slice(workflow.indexOf("verify-windows:"));

  assert.match(workflow, /^\s*verify-windows:/m);
  assert.match(workflow, /name:\s*Verify Windows native candidate/);
  assert.match(workflow, /runs-on:\s*windows-2022\b/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /pull-requests:\s*write/);
  assert.match(windowsJob, /shell:\s*pwsh/);
  assert.doesNotMatch(windowsJob, /shell:\s*powershell/);
  assert.match(workflow, /node\s+scripts\/verify-upstream-compat\.js\s+--baseline\s+"\$Version"\s+--skip-latest\s+--native-windows-x64\s+--json/);
  assert.match(workflow, /\$Status = \$LASTEXITCODE/);
  assert.match(workflow, /windows-native-latest-candidate-\$\{\{\s*steps\.version\.outputs\.version\s*\}\}/);
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

test("native latest candidate workflow promotes support evidence without forcing a plugin release", () => {
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
  assert.match(workflow, /Detect native support changes/);
  assert.match(workflow, /git\s+diff\s+--quiet/);
  assert.match(workflow, /changed=false/);
  assert.doesNotMatch(workflow, /Prepare plugin release metadata/);
  assert.doesNotMatch(workflow, /scripts\/prepare-native-release-closeout\.js\s+--native-version/);
  assert.doesNotMatch(workflow, /plugin_version/);
  assert.match(workflow, /peter-evans\/create-pull-request@v\d+/);
  assert.match(workflow, /codex\/native-latest-/);
  assert.match(workflow, /draft:\s*true/);
  assert.match(workflow, /commit-message:\s*"chore: verify macOS native \$\{\{ steps\.version\.outputs\.version \}\} compatibility"/);
  assert.match(workflow, /steps\.support_changes\.outputs\.changed == 'true'/);
  assert.match(workflow, /does not bump the plugin version or CHANGELOG/);
  assert.match(workflow, /No plugin release is required/);
  assert.doesNotMatch(workflow, /\bgh\s+release\b/);
});

test("native latest candidate workflow records runtime and display coverage evidence without overclaiming", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /## Native candidate promotion evidence/);
  assert.match(workflow, /printf '%s\\n' "\$PROMOTE_OUTPUT"[\s\S]*GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /运行硬边界已通过/);
  assert.match(workflow, /展示文案覆盖可能是 `complete` 或 `partial`/);
  assert.match(workflow, /`partial` 不代表完整中文覆盖/);
  assert.doesNotMatch(workflow, /display audit pass/);

  assert.match(workflow, /ConvertFrom-Json/);
  assert.match(workflow, /\$RuntimeStatus/);
  assert.match(workflow, /\$CoverageStatus/);
  assert.match(workflow, /\$CoverageWarningCount/);
  assert.match(workflow, /Display coverage: \$CoverageStatus \(\$CoverageWarningCount warnings\)/);
  assert.match(workflow, /PARTIAL does not claim complete Chinese coverage/);
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
  assert.match(workflow, /PROMOTE_OUTPUT/);
  assert.match(workflow, /PROMOTE_STATUS/);
  assert.match(workflow, /2>&1/);
});

test("native latest candidate workflow reports failed candidates to a single tracking issue", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /Prepare native failure handoff/);
  assert.match(workflow, /scripts\/prepare-native-failure-handoff\.js[\s\S]*--candidate/);
  assert.match(workflow, /docs\/native-latest-failures\/\$\{VERSION\}\.md/);
  assert.match(workflow, /Report native candidate failure to tracking issue/);
  assert.match(workflow, /id:\s*failure_issue/);
  assert.match(workflow, /actions\/github-script@v\d+/);
  assert.match(workflow, /native-candidate-failure/);
  assert.match(workflow, /Native latest candidate failures \(tracking\)/);
  assert.match(workflow, /steps\.failure_handoff\.outputs\.report_path != ''/);
  // 失败不再开草稿 PR
  assert.doesNotMatch(workflow, /Create native candidate failure handoff PR/);
  assert.doesNotMatch(workflow, /codex\/native-latest-\$\{\{\s*steps\.version\.outputs\.version\s*\}\}-fix/);
});

test("native failure tracking issue reporting is idempotent per platform and version", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /<!-- native-candidate-failure \$\{PLATFORM_LABEL\} \$\{CANDIDATE_VERSION\} -->/);
  assert.match(workflow, /already reported/);
  assert.match(workflow, /issues:\s*write/);
});

test("native latest candidate workflow reports failed Windows candidates to the tracking issue", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /Prepare Windows native failure handoff/);
  assert.match(workflow, /scripts\/prepare-native-failure-handoff\.js[\s\S]*--platform windows/);
  assert.match(workflow, /docs\/native-latest-failures\/windows-\$Version\.md/);
  assert.match(workflow, /Report Windows native candidate failure to tracking issue/);
  assert.match(workflow, /id:\s*windows_failure_issue/);
  assert.match(workflow, /PLATFORM_LABEL:\s*Windows x64/);
  assert.match(workflow, /windows-native-latest-text-diff-\$\{\{\s*steps\.version\.outputs\.version\s*\}\}/);
  assert.doesNotMatch(workflow, /Create Windows native candidate failure handoff PR/);
  assert.doesNotMatch(workflow, /codex\/windows-native-latest-\$\{\{\s*steps\.version\.outputs\.version\s*\}\}-fix/);
});

test("native latest candidate workflow prepares Windows promotion artifacts with guards", () => {
  const workflow = readWorkflow();

  assert.match(workflow, /Generate Windows native text diff report/);
  assert.match(workflow, /scripts\/generate-upstream-text-diff\.js --to "\$Version" --native-windows-x64/);
  assert.match(workflow, /Prepare Windows native support promotion artifacts/);
  assert.match(workflow, /scripts\/promote-native-candidate\.js", "--candidate", "\$\{\{\s*steps\.verify\.outputs\.json_path\s*\}\}", "--platform", "windows", "--write"/);
  assert.match(workflow, /scripts\/generate-plugin-support-window\.js", "--write"/);
  assert.match(workflow, /scripts\/generate-support-matrix\.js/);
  assert.match(workflow, /scripts\/sync-readme-support-window\.js", "--write"/);
  assert.match(workflow, /scripts\/sync-doc-derived-counts\.js", "--write"/);
  assert.match(workflow, /scripts\/check-support-boundary\.js/);
  assert.match(workflow, /windows-native-support-promotion\.diff/);
  assert.match(workflow, /Upload Windows native support promotion artifacts/);
  assert.match(workflow, /windows-native-support-promotion-\$\{\{\s*steps\.version\.outputs\.version\s*\}\}/);
});
