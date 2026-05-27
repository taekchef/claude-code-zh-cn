const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const guardScript = path.join(repoRoot, "scripts", "check-pr-autoclose-keywords.js");

function runGuard(args, options = {}) {
  return spawnSync("node", [guardScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });
}

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pr-autoclose-guard-"));
}

test("PR auto-close guard allows neutral issue links", () => {
  const result = runGuard(["--body-env", "PR_BODY"], {
    env: {
      PR_BODY: "Related to #82. Keep the issue open until the reporter retests.",
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /pr-autoclose-guard: OK/);
});

test("PR auto-close guard rejects GitHub issue closing keywords in PR bodies", () => {
  const result = runGuard(["--body-env", "PR_BODY"], {
    env: {
      PR_BODY: "Fixes #82 after the CC Switch installer update.",
    },
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /pr-autoclose-guard: FAIL/);
  assert.match(result.stdout, /Fixes #82/);
  assert.match(result.stdout, /Related to #82/);
});

test("PR auto-close guard rejects colon and cross-repo closing syntax", () => {
  const result = runGuard(["--body-env", "PR_BODY"], {
    env: {
      PR_BODY: "CLOSES: taekchef/claude-code-zh-cn#82",
    },
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /CLOSES: taekchef\/claude-code-zh-cn#82/);
});

test("PR auto-close guard scans repository PR body entrypoints", () => {
  const tempRepo = makeTempRepo();
  const templateDir = path.join(tempRepo, ".github");
  fs.mkdirSync(templateDir, { recursive: true });
  fs.writeFileSync(path.join(templateDir, "pull_request_template.md"), "Closes #82\n", "utf8");

  const result = runGuard(["--repo-root", tempRepo]);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /\.github\/pull_request_template\.md:1:1/);
  assert.match(result.stdout, /Closes #82/);
});

test("current repository PR body entrypoints do not auto-close issues", () => {
  const result = runGuard([]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /pr-autoclose-guard: OK/);
});
