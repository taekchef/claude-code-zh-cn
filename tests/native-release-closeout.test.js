const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const closeoutScript = path.join(repoRoot, "scripts", "prepare-native-release-closeout.js");

function fixtureRepo({ manifestVersion = "2.4.14", changelogVersion = "2.4.14" } = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-native-release-closeout-"));
  fs.mkdirSync(path.join(repo, "plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, "plugin", "manifest.json"),
    `${JSON.stringify({ name: "claude-code-zh-cn", version: manifestVersion }, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(repo, "CHANGELOG.md"),
    [
      "# Changelog",
      "",
      "本项目的版本号遵循语义化版本。",
      "",
      `## [${changelogVersion}] - 2026-05-17`,
      "",
      "### 改进",
      "",
      "- fixture",
      "",
    ].join("\n")
  );
  return repo;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function runCloseout(repo, args = []) {
  return spawnSync(
    "node",
    [closeoutScript, "--repo-root", repo, "--native-version", "2.1.144", "--date", "2026-05-17", ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
    }
  );
}

test("prepare-native-release-closeout bumps plugin patch version and prepends changelog", () => {
  const repo = fixtureRepo();

  const result = runCloseout(repo);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /prepared plugin release 2\.4\.15/);
  assert.equal(readJson(path.join(repo, "plugin", "manifest.json")).version, "2.4.15");

  const changelog = fs.readFileSync(path.join(repo, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /^## \[2\.4\.15\] - 2026-05-17/m);
  assert.match(changelog, /Claude Code `2\.1\.144`/);
  assert.match(changelog, /创建 `v2\.4\.15`/);
  assert.match(changelog, /Native Latest Candidate workflow/);
  assert.ok(changelog.indexOf("## [2.4.15]") < changelog.indexOf("## [2.4.14]"));
});

test("prepare-native-release-closeout fails when manifest and changelog drift", () => {
  const repo = fixtureRepo({ manifestVersion: "2.4.14", changelogVersion: "2.4.13" });

  const result = runCloseout(repo);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /manifest version 2\.4\.14 does not match top CHANGELOG 2\.4\.13/);
  assert.equal(readJson(path.join(repo, "plugin", "manifest.json")).version, "2.4.14");
});

test("prepare-native-release-closeout rejects non-semver native versions", () => {
  const repo = fixtureRepo();

  const result = spawnSync(
    "node",
    [closeoutScript, "--repo-root", repo, "--native-version", "latest", "--date", "2026-05-17"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--native-version must be numeric semver/);
  assert.equal(readJson(path.join(repo, "plugin", "manifest.json")).version, "2.4.14");
});
