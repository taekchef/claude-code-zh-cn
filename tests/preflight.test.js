const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const preflightScript = path.join(repoRoot, "scripts", "preflight.sh");
const contributing = path.join(repoRoot, "CONTRIBUTING.md");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("preflight script is the local entrypoint for CI-blocking checks", () => {
  assert.equal(fs.existsSync(preflightScript), true, "missing scripts/preflight.sh");

  const syntax = spawnSync("bash", ["-n", preflightScript], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);

  const script = read(preflightScript);
  for (const snippet of [
    "bash -n install.sh",
    "bash -n uninstall.sh",
    "bash -n plugin/bin/claude-launcher",
    "bash -n plugin/hooks/session-start",
    "bash -n plugin/hooks/notification",
    "bash -n plugin/profile/claude-code-zh-cn.sh",
    "node --check bun-binary-io.js",
    "node --check plugin/bun-binary-io.js",
    "node --check plugin/patch-cli.js",
    "node --check scripts/check-payload-sources.js",
    "node --check scripts/check-support-boundary.js",
    "node --check scripts/check-translation-sentinels.js",
    "node --check scripts/generate-support-matrix.js",
    "node --check scripts/sync-doc-derived-counts.js",
    "node --check scripts/sync-readme-support-window.js",
    "node --check scripts/verify-release-state.js",
    "node --check scripts/verify-upstream-compat.js",
    "node scripts/check-payload-sources.js --base",
    "node scripts/check-support-boundary.js",
    "node scripts/sync-readme-support-window.js --check",
    "node scripts/sync-doc-derived-counts.js --check",
    "node --test tests/*.test.js",
    "node scripts/verify-upstream-compat.js",
    "node scripts/verify-release-state.js --github-repo taekchef/claude-code-zh-cn",
    "npm pack @anthropic-ai/claude-code@${VERSION} --silent",
    "node scripts/check-translation-sentinels.js",
    "node scripts/generate-support-matrix.js",
    "git diff --exit-code docs/support-matrix.md",
  ]) {
    assert.match(script, escapeSnippet(snippet), `missing preflight command: ${snippet}`);
  }
});

test("CONTRIBUTING points contributors at the one-command preflight", () => {
  const text = read(contributing);

  assert.match(text, /bash scripts\/preflight\.sh/);
  assert.match(text, /本地校验/);
  assert.match(text, /release-state \| `node scripts\/verify-release-state\.js --github-repo taekchef\/claude-code-zh-cn`/);
});

function escapeSnippet(snippet) {
  return new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}
