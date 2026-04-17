const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const releaseStateScript = path.join(repoRoot, "scripts", "verify-release-state.js");

function writeRepoFiles(repo, manifestVersion, changelogVersion) {
  fs.mkdirSync(path.join(repo, "plugin"), { recursive: true });
  fs.writeFileSync(
    path.join(repo, "plugin", "manifest.json"),
    JSON.stringify(
      {
        name: "claude-code-zh-cn",
        version: manifestVersion,
      },
      null,
      2
    ) + "\n"
  );
  fs.writeFileSync(
    path.join(repo, "CHANGELOG.md"),
    [
      "# Changelog",
      "",
      "本项目的版本号遵循语义化版本。",
      "",
      `## [${changelogVersion}] - 2026-04-16`,
      "",
      "### 修复",
      "",
      "- fixture",
      "",
    ].join("\n")
  );
}

function createFixtureRepo({ manifestVersion, changelogVersion, tagVersion }) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-release-state-repo-"));

  writeRepoFiles(repo, manifestVersion, changelogVersion);
  execFileSync("git", ["init", "-b", "main"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["add", "."], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", `release ${manifestVersion}`], {
    cwd: repo,
    encoding: "utf8",
  });

  if (tagVersion) {
    execFileSync("git", ["tag", `v${tagVersion}`], { cwd: repo, encoding: "utf8" });
  }

  return repo;
}

function createFakeGh(tmp) {
  const bin = path.join(tmp, "bin");
  const gh = path.join(bin, "gh");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    gh,
    `#!/usr/bin/env node
const [scope, command, tag] = process.argv.slice(2);
const releases = new Set((process.env.FAKE_GH_RELEASE_TAGS || "").split(",").filter(Boolean));
if (scope !== "release" || command !== "view" || !tag) {
  console.error("unexpected gh arguments");
  process.exit(2);
}
if (!releases.has(tag)) {
  console.error("release not found");
  process.exit(1);
}
process.stdout.write(JSON.stringify({ tagName: tag, url: "https://example.test/releases/" + tag }) + "\\n");
`
  );
  fs.chmodSync(gh, 0o755);
  return bin;
}

function runReleaseState(repo, env = {}) {
  const fakeGhBin = createFakeGh(repo);
  return spawnSync("node", [releaseStateScript, "--repo-root", repo], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${fakeGhBin}:${process.env.PATH}`,
      ...env,
    },
    encoding: "utf8",
  });
}

function runReleaseStateWithoutFakeGh(repo, env = {}) {
  return spawnSync("node", [releaseStateScript, "--repo-root", repo], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
  });
}

test("verify-release-state passes when manifest and changelog version have a tag and GitHub release", () => {
  const repo = createFixtureRepo({
    manifestVersion: "1.2.3",
    changelogVersion: "1.2.3",
    tagVersion: "1.2.3",
  });

  const result = runReleaseState(repo, { FAKE_GH_RELEASE_TAGS: "v1.2.3" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /manifest: 1\.2\.3/);
  assert.match(result.stdout, /changelog: 1\.2\.3/);
  assert.match(result.stdout, /git tag: v1\.2\.3 OK/);
  assert.match(result.stdout, /github release: v1\.2\.3 OK/);
});

test("verify-release-state fails when manifest and top changelog versions differ", () => {
  const repo = createFixtureRepo({
    manifestVersion: "1.2.3",
    changelogVersion: "1.2.4",
    tagVersion: "1.2.3",
  });

  const result = runReleaseState(repo, { FAKE_GH_RELEASE_TAGS: "v1.2.3" });

  assert.equal(result.status, 1, "version mismatch should fail release-state verification");
  assert.match(result.stdout, /version match: FAIL/);
  assert.match(result.stdout, /manifest 1\.2\.3 does not match top CHANGELOG 1\.2\.4/);
});

test("verify-release-state fails when the current version has no tag or GitHub release", () => {
  const repo = createFixtureRepo({
    manifestVersion: "1.2.3",
    changelogVersion: "1.2.3",
  });

  const result = runReleaseState(repo);

  assert.equal(result.status, 1, "missing tag and release should fail release-state verification");
  assert.match(result.stdout, /git tag: v1\.2\.3 MISSING/);
  assert.match(result.stdout, /github release: v1\.2\.3 MISSING/);
});

test("verify-release-state reports GitHub lookup errors separately from missing releases", () => {
  const repo = createFixtureRepo({
    manifestVersion: "1.2.3",
    changelogVersion: "1.2.3",
    tagVersion: "1.2.3",
  });
  const bin = path.join(repo, "broken-gh-bin");
  const gh = path.join(bin, "gh");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    gh,
    "#!/usr/bin/env bash\nprintf 'Get \"https://api.github.com/repos/o/r/releases/tags/v1.2.3\": net/http: TLS handshake timeout\\n' >&2\nexit 1\n"
  );
  fs.chmodSync(gh, 0o755);

  const result = runReleaseStateWithoutFakeGh(repo, {
    PATH: `${bin}:${process.env.PATH}`,
  });

  assert.equal(result.status, 2, "transport failures should make release-state inconclusive");
  assert.match(result.stdout, /git tag: v1\.2\.3 OK/);
  assert.match(result.stdout, /github release: v1\.2\.3 ERROR/);
  assert.match(result.stdout, /TLS handshake timeout/);
});
