#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const defaultRepoRoot = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {
    repoRoot: defaultRepoRoot,
    githubRepo: null,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--repo-root":
        args.repoRoot = argv[++i];
        break;
      case "--github-repo":
        args.githubRepo = argv[++i];
        break;
      case "--json":
        args.json = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  args.repoRoot = path.resolve(args.repoRoot);
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readManifestVersion(repoRoot) {
  const manifestPath = path.join(repoRoot, "plugin", "manifest.json");
  const manifest = readJson(manifestPath);
  if (!manifest.version || typeof manifest.version !== "string") {
    fail("plugin/manifest.json must define a string version");
  }
  return manifest.version;
}

function readTopChangelogVersion(repoRoot) {
  const changelogPath = path.join(repoRoot, "CHANGELOG.md");
  const changelog = fs.readFileSync(changelogPath, "utf8");
  const match = changelog.match(/^## \[([^\]]+)\]/m);
  if (!match) {
    fail("CHANGELOG.md must contain a top version heading like ## [1.2.3]");
  }
  return match[1];
}

function compactFailure(result) {
  if (result.error) {
    return result.error.message;
  }

  return [result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)[0] || `command exited ${result.status}`;
}

function missingGitTag(detail) {
  return !detail || /command exited 1|Needed a single revision|unknown revision/i.test(detail);
}

function missingGitHubRelease(detail) {
  return /release not found|could not resolve to a Release|HTTP 404|Not Found/i.test(detail);
}

function checkGitTag(repoRoot, tagName) {
  const result = spawnSync(
    "git",
    ["rev-parse", "--quiet", "--verify", `refs/tags/${tagName}`],
    {
      cwd: repoRoot,
      encoding: "utf8",
    }
  );

  if (result.status === 0) {
    return {
    ok: true,
    state: "ok",
    ref: result.stdout.trim(),
  };
  }

  return {
    ok: false,
    state: missingGitTag(compactFailure(result)) ? "missing" : "error",
    detail: compactFailure(result),
  };
}

function checkGitHubRelease(repoRoot, tagName, githubRepo) {
  const args = ["release", "view", tagName, "--json", "tagName,url"];
  if (githubRepo) {
    args.push("--repo", githubRepo);
  }

  const result = spawnSync("gh", args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      GH_NO_UPDATE_NOTIFIER: "1",
    },
  });

  if (result.status !== 0) {
    const detail = compactFailure(result);
    return {
      ok: false,
      state: missingGitHubRelease(detail) ? "missing" : "error",
      detail,
    };
  }

  let release;
  try {
    release = JSON.parse(result.stdout);
  } catch (error) {
    return {
      ok: false,
      state: "error",
      detail: `gh returned non-JSON output: ${error.message}`,
    };
  }

  if (release.tagName !== tagName) {
    return {
      ok: false,
      state: "error",
      detail: `release tagName ${release.tagName || "<missing>"} did not match ${tagName}`,
    };
  }

  return {
    ok: true,
    state: "ok",
    url: release.url || null,
  };
}

function buildPayload(args) {
  const manifestVersion = readManifestVersion(args.repoRoot);
  const changelogVersion = readTopChangelogVersion(args.repoRoot);
  const tagName = `v${manifestVersion}`;
  const versionMatch = manifestVersion === changelogVersion;
  const gitTag = checkGitTag(args.repoRoot, tagName);
  const githubRelease = checkGitHubRelease(args.repoRoot, tagName, args.githubRepo);

  return {
    manifestVersion,
    changelogVersion,
    tagName,
    checks: {
      versionMatch: {
        ok: versionMatch,
        detail: versionMatch
          ? null
          : `manifest ${manifestVersion} does not match top CHANGELOG ${changelogVersion}`,
      },
      gitTag,
      githubRelease,
    },
  };
}

function payloadOk(payload) {
  return Object.values(payload.checks).every((check) => check.ok);
}

function payloadHasError(payload) {
  return Object.values(payload.checks).some((check) => check.state === "error");
}

function renderState(check) {
  if (check.ok) return "OK";
  return check.state === "error" ? "ERROR" : "MISSING";
}

function printHuman(payload) {
  const versionMatch = payload.checks.versionMatch;
  const gitTag = payload.checks.gitTag;
  const githubRelease = payload.checks.githubRelease;

  console.log("release-state");
  console.log(`manifest: ${payload.manifestVersion}`);
  console.log(`changelog: ${payload.changelogVersion}`);
  console.log(
    versionMatch.ok
      ? "version match: OK"
      : `version match: FAIL (${versionMatch.detail})`
  );
  console.log(`git tag: ${payload.tagName} ${renderState(gitTag)}`);
  if (!gitTag.ok && gitTag.detail) {
    console.log(`git tag detail: ${gitTag.detail}`);
  }
  console.log(`github release: ${payload.tagName} ${renderState(githubRelease)}`);
  if (githubRelease.ok && githubRelease.url) {
    console.log(`github release url: ${githubRelease.url}`);
  }
  if (!githubRelease.ok && githubRelease.detail) {
    console.log(`github release detail: ${githubRelease.detail}`);
  }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const payload = buildPayload(args);
    const ok = payloadOk(payload);
    const hasError = payloadHasError(payload);

    if (args.json) {
      process.stdout.write(`${JSON.stringify({ ...payload, ok }, null, 2)}\n`);
    } else {
      printHuman(payload);
    }

    process.exit(ok ? 0 : hasError ? 2 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
}

main();
