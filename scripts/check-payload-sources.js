#!/usr/bin/env node

"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const defaultRepoRoot = path.resolve(__dirname, "..");

const payloadPairs = [
  { source: "patch-cli.sh", mirror: "plugin/patch-cli.sh" },
  { source: "patch-cli.js", mirror: "plugin/patch-cli.js" },
  { source: "cli-translations.json", mirror: "plugin/cli-translations.json" },
  { source: "bun-binary-io.js", mirror: "plugin/bun-binary-io.js" },
  { source: "compute-patch-revision.sh", mirror: "plugin/compute-patch-revision.sh" },
];

function fail(message) {
  throw new Error(message);
}

function normalizeRepoPath(file) {
  return file.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function parseArgs(argv) {
  const args = {
    repoRoot: defaultRepoRoot,
    base: null,
    head: "HEAD",
    changedFiles: [],
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--repo-root":
        args.repoRoot = argv[++i];
        break;
      case "--base":
        args.base = argv[++i];
        break;
      case "--head":
        args.head = argv[++i];
        break;
      case "--changed-file":
        args.changedFiles.push(argv[++i]);
        break;
      case "--json":
        args.json = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  args.repoRoot = path.resolve(args.repoRoot);
  args.changedFiles = args.changedFiles.map(normalizeRepoPath).filter(Boolean);
  return args;
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
    .filter(Boolean)
    .join("\n") || `command exited ${result.status}`;
}

function readChangedFilesFromGit(repoRoot, base, head) {
  if (!base) {
    fail("Missing --base. In CI, pass the pull request base SHA.");
  }

  const result = spawnSync("git", ["diff", "--name-only", `${base}...${head}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    fail(`Unable to read changed files from git diff ${base}...${head}:\n${compactFailure(result)}`);
  }

  return result.stdout.split("\n").map(normalizeRepoPath).filter(Boolean);
}

function checkPayloadSourceEdits(changedFiles, pairs = payloadPairs) {
  const changedSet = new Set(changedFiles.map(normalizeRepoPath).filter(Boolean));
  const violations = [];

  for (const pair of pairs) {
    if (changedSet.has(pair.mirror) && !changedSet.has(pair.source)) {
      violations.push({ ...pair, type: "mirror-without-source" });
    }

    if (changedSet.has(pair.source) && !changedSet.has(pair.mirror)) {
      violations.push({ ...pair, type: "source-without-mirror" });
    }
  }

  return {
    ok: violations.length === 0,
    changedFiles: [...changedSet].sort(),
    violations,
  };
}

function printHuman(payload) {
  if (payload.ok) {
    console.log("payload-source-guard: OK");
    console.log("Protected plugin payload mirrors are unchanged or paired with their root source files.");
    return;
  }

  console.log("payload-source-guard: FAIL");
  console.log("These plugin/ files are packaged mirrors, not the editing source.");
  console.log("Edit the root source file instead, then run: bash scripts/sync-payload.sh");
  console.log("This guard only runs in CI/local validation; install.sh and session-start are unchanged.");
  console.log("");

  for (const pair of payload.violations) {
    if (pair.type === "source-without-mirror") {
      console.log(`- ${pair.source}: sync ${pair.mirror}`);
    } else {
      console.log(`- ${pair.mirror}: edit ${pair.source} instead`);
    }
  }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const changedFiles = args.changedFiles.length
      ? args.changedFiles
      : readChangedFilesFromGit(args.repoRoot, args.base, args.head);
    const payload = checkPayloadSourceEdits(changedFiles);

    if (args.json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      printHuman(payload);
    }

    process.exit(payload.ok ? 0 : 1);
  } catch (error) {
    console.error("payload-source-guard: ERROR");
    console.error(error.message);
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkPayloadSourceEdits,
  payloadPairs,
};
