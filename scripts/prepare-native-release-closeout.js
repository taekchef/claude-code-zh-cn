#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const defaultRepoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = {
    repoRoot: defaultRepoRoot,
    date: new Date().toISOString().slice(0, 10),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--repo-root":
        args.repoRoot = path.resolve(argv[++i]);
        break;
      case "--native-version":
        args.nativeVersion = argv[++i];
        break;
      case "--date":
        args.date = argv[++i];
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/prepare-native-release-closeout.js --native-version <claude-code-version> [--date YYYY-MM-DD]",
    "",
    "Bumps plugin/manifest.json by one patch version and prepends a CHANGELOG entry",
    "for an automated macOS native latest closeout PR.",
    "",
  ].join("\n");
}

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, payload) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function isSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(String(version || ""));
}

function isDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || ""));
}

function bumpPatch(version) {
  if (!isSemver(version)) {
    fail(`plugin version must be numeric semver, got ${version || "unknown"}`);
  }
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  parts[2] += 1;
  return parts.join(".");
}

function topChangelogVersion(changelog) {
  const match = changelog.match(/^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/m);
  return match ? match[1] : null;
}

function changelogEntry({ pluginVersion, nativeVersion, date }) {
  return [
    `## [${pluginVersion}] - ${date}`,
    "",
    "### 改进",
    "",
    `- macOS native latest 自动 closeout 跟进 Claude Code \`${nativeVersion}\`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 \`${pluginVersion}\`，合并后可按发布流程创建 \`v${pluginVersion}\`。`,
    "",
    "### 验证",
    "",
    "- `Native Latest Candidate workflow`",
    "- `CI preflight`",
    "",
  ].join("\n");
}

function prependChangelogEntry(changelog, entry) {
  const firstVersionHeading = changelog.search(/^## \[\d+\.\d+\.\d+\] - \d{4}-\d{2}-\d{2}$/m);
  if (firstVersionHeading < 0) {
    fail("CHANGELOG.md must contain a top version heading like ## [1.2.3] - YYYY-MM-DD");
  }
  return `${changelog.slice(0, firstVersionHeading)}${entry}\n${changelog.slice(firstVersionHeading)}`;
}

function prepareReleaseCloseout({ repoRoot, nativeVersion, date }) {
  if (!isSemver(nativeVersion)) {
    fail(`--native-version must be numeric semver, got ${nativeVersion || "unknown"}`);
  }
  if (!isDate(date)) {
    fail(`--date must be YYYY-MM-DD, got ${date || "unknown"}`);
  }

  const manifestPath = path.join(repoRoot, "plugin", "manifest.json");
  const changelogPath = path.join(repoRoot, "CHANGELOG.md");
  const manifest = readJson(manifestPath);
  const changelog = fs.readFileSync(changelogPath, "utf8");
  const currentVersion = manifest.version;
  const topVersion = topChangelogVersion(changelog);

  if (topVersion !== currentVersion) {
    fail(`manifest version ${currentVersion || "unknown"} does not match top CHANGELOG ${topVersion || "unknown"}`);
  }

  const pluginVersion = bumpPatch(currentVersion);
  manifest.version = pluginVersion;
  writeJson(manifestPath, manifest);
  fs.writeFileSync(
    changelogPath,
    prependChangelogEntry(changelog, changelogEntry({ pluginVersion, nativeVersion, date }))
  );

  return pluginVersion;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.nativeVersion) {
    fail("--native-version is required");
  }

  const pluginVersion = prepareReleaseCloseout(args);
  process.stdout.write(`prepared plugin release ${pluginVersion} for macOS native ${args.nativeVersion}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`prepare-native-release-closeout: ${error.message}`);
    process.exit(1);
  }
}
