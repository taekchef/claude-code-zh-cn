#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const isWindows = process.platform === "win32";
const repoRoot = path.resolve(__dirname, "..");
const defaultConfigPath = path.join(__dirname, "upstream-compat.config.json");
const patchCliPath = path.join(repoRoot, "patch-cli.js");
const translationsPath = path.join(repoRoot, "cli-translations.json");

function execFile(cmd, args, opts) {
  if (isWindows) {
    return execFileSync(cmd, args, { ...opts, shell: true });
  }
  return execFileSync(cmd, args, opts);
}

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {
    config: defaultConfigPath,
    json: false,
    skipLatest: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--config":
        args.config = argv[++i];
        break;
      case "--baseline":
        args.baseline = argv[++i];
        break;
      case "--fixtures-dir":
        args.fixturesDir = argv[++i];
        break;
      case "--packages-dir":
        args.packagesDir = argv[++i];
        break;
      case "--translations":
        args.translations = argv[++i];
        break;
      case "--latest-version":
        args.latestVersion = argv[++i];
        break;
      case "--skip-latest":
        args.skipLatest = true;
        break;
      case "--json":
        args.json = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseBaselineOverride(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      fail("--baseline JSON value must be an array");
    }
    return parsed.map((value) => String(value));
  }
  return trimmed.split(",").map((part) => part.trim()).filter(Boolean);
}

function normalizeCheckList(entries, kind, options = {}) {
  return (entries || []).map((entry, index) => {
    if (typeof entry === "string") {
      return { kind, id: `${kind}_${index}`, pattern: entry };
    }

    if (!entry || typeof entry !== "object") {
      fail(`Invalid ${kind} entry at index ${index}`);
    }

    if (!entry.id) {
      fail(`Missing id for ${kind} entry at index ${index}`);
    }

    if (!entry.pattern && !entry.regex) {
      fail(`Missing pattern/regex for ${kind} entry "${entry.id}"`);
    }

    return {
      kind,
      id: entry.id,
      ...(options.includeRule ? { rule: entry.rule || null } : {}),
      sourcePattern: entry.sourcePattern || null,
      sourceRegex: entry.sourceRegex || null,
      pattern: entry.pattern || null,
      regex: entry.regex || null,
    };
  });
}

function loadConfig(configPath) {
  const config = readJson(configPath);
  if (!config.packageName) {
    fail("upstream compat config must define packageName");
  }
  if (!config.baseline || !Array.isArray(config.baseline.versions)) {
    fail("upstream compat config must define baseline.versions");
  }

  return {
    ...config,
    checks: {
      sentinels: normalizeCheckList(config.checks?.sentinels, "sentinel"),
      templateResidues: normalizeCheckList(config.checks?.templateResidues, "template"),
      upstreamTextGuards: normalizeCheckList(config.checks?.upstreamTextGuards, "upstream-text", {
        includeRule: true,
      }),
    },
  };
}

function fetchLatestVersion(packageName) {
  const versions = JSON.parse(
    execFile("npm", ["view", packageName, "versions", "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
  if (!Array.isArray(versions) || versions.length === 0) {
    fail(`No npm versions returned for ${packageName}`);
  }
  return String(versions[versions.length - 1]);
}

function uniqueVersions(versions) {
  return [...new Set(versions.filter(Boolean).map((value) => String(value)))];
}

function resolveVersions(config, args) {
  const baseline = parseBaselineOverride(args.baseline) || config.baseline.versions;
  const versions = uniqueVersions(baseline);

  if (args.skipLatest) {
    return versions;
  }

  if (args.latestVersion) {
    return uniqueVersions([...versions, args.latestVersion]);
  }

  if (config.baseline.includeLatestFromNpm) {
    return uniqueVersions([...versions, fetchLatestVersion(config.packageName)]);
  }

  return versions;
}

function findFixturePackage(fixturesDir, version) {
  const packageDir = path.join(fixturesDir, version, "package");
  if (fs.existsSync(path.join(packageDir, "cli.js"))) {
    return packageDir;
  }

  const directDir = path.join(fixturesDir, version);
  if (fs.existsSync(path.join(directDir, "cli.js"))) {
    return directDir;
  }

  fail(`Fixture package for version ${version} not found in ${fixturesDir}`);
}

function downloadPackage(packageName, version, packagesDir) {
  const versionRoot = path.join(packagesDir, version);
  const packageDir = path.join(versionRoot, "package");
  if (fs.existsSync(path.join(packageDir, "cli.js"))) {
    return packageDir;
  }

  fs.mkdirSync(versionRoot, { recursive: true });
  const tarball = execFile("npm", ["pack", `${packageName}@${version}`, "--silent"], {
    cwd: versionRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  const tarCwd = isWindows ? versionRoot.replace(/\\/g, "/").replace(/^([A-Z]):/, "/$1") : versionRoot;
  execFile("tar", ["-xzf", tarball, "-C", tarCwd], {
    cwd: versionRoot,
    stdio: ["ignore", "ignore", "pipe"],
  });

  if (!fs.existsSync(path.join(packageDir, "cli.js"))) {
    fail(`Downloaded package ${packageName}@${version} does not contain package/cli.js`);
  }

  return packageDir;
}

function resolvePackageDir(config, args, version) {
  if (args.fixturesDir) {
    return findFixturePackage(args.fixturesDir, version);
  }

  const packagesDir = args.packagesDir || path.join(os.tmpdir(), "claude-code-zh-cn-upstream-cache");
  return downloadPackage(config.packageName, version, packagesDir);
}

function runPatch(cliSource, version, args) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-upstream-compat-"));
  const cliFile = path.join(tmpDir, `${version}.cli.js`);
  fs.copyFileSync(cliSource, cliFile);
  const output = execFile("node", [patchCliPath, cliFile, args.translations || translationsPath], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  return {
    cliFile,
    patchCount: Number.parseInt(output || "0", 10) || 0,
  };
}

function collectResidue(text, checks) {
  const residue = [];
  for (const check of [...checks.sentinels, ...checks.templateResidues]) {
    if (check.pattern && text.includes(check.pattern)) {
      residue.push({
        kind: check.kind,
        id: check.id,
        match: check.pattern,
      });
      continue;
    }

    if (check.regex) {
      const pattern = new RegExp(check.regex, "g");
      const match = text.match(pattern);
      if (match && match[0]) {
        residue.push({
          kind: check.kind,
          id: check.id,
          match: match[0],
        });
      }
    }
  }

  return residue;
}

function checkMatches(text, check, source = false) {
  const pattern = source ? check.sourcePattern : check.pattern;
  const regex = source ? check.sourceRegex : check.regex;

  if (pattern && text.includes(pattern)) {
    return true;
  }

  if (regex) {
    const compiled = new RegExp(regex, "g");
    return compiled.test(text);
  }

  return false;
}

function collectMissingRequired(originalText, patchedText, checks) {
  const missing = [];
  for (const check of checks.upstreamTextGuards) {
    const hasSourceMatcher = Boolean(check.sourcePattern || check.sourceRegex);
    if (hasSourceMatcher && !checkMatches(originalText, check, true)) {
      continue;
    }
    if (!hasSourceMatcher && !checkMatches(originalText, check)) {
      continue;
    }
    if (checkMatches(patchedText, check)) {
      continue;
    }

    missing.push({
      kind: check.kind,
      id: check.id,
      rule: check.rule || "required",
      match: check.pattern || check.regex,
    });
  }

  return missing;
}

function evaluateVersion(config, args, version) {
  const packageDir = resolvePackageDir(config, args, version);
  const cliSource = path.join(packageDir, "cli.js");
  if (!fs.existsSync(cliSource)) {
    fail(`cli.js not found for version ${version}`);
  }

  const { cliFile, patchCount } = runPatch(cliSource, version, args);
  const patched = fs.readFileSync(cliFile, "utf8");
  const original = fs.readFileSync(cliSource, "utf8");
  const residue = collectResidue(patched, config.checks);
  const missingRequired = collectMissingRequired(original, patched, config.checks);

  return {
    version,
    status: residue.length > 0 || missingRequired.length > 0 ? "fail" : "pass",
    patchCount,
    residue,
    missingRequired,
  };
}

function buildSummary(results) {
  return results.reduce(
    (summary, result) => {
      summary[result.status] += 1;
      return summary;
    },
    { pass: 0, fail: 0 }
  );
}

function printHuman(payload) {
  console.log("version\tstatus\tpatches\tresidue");
  for (const result of payload.results) {
    const residueSummary = result.residue.length
      ? result.residue.map((entry) => `${entry.kind}:${entry.id}`).join(",")
      : "-";
    const missingSummary = result.missingRequired.length
      ? result.missingRequired.map((entry) => `${entry.kind}:${entry.id}`).join(",")
      : "-";
    console.log(`${result.version}\t${result.status}\t${result.patchCount}\t${residueSummary};missing=${missingSummary}`);
  }
  console.log(`summary\tpass=${payload.summary.pass}\tfail=${payload.summary.fail}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(path.resolve(args.config));
  const versions = resolveVersions(config, args);
  const results = versions.map((version) => evaluateVersion(config, args, version));
  const payload = {
    packageName: config.packageName,
    baseline: versions,
    results,
    summary: buildSummary(results),
  };

  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    printHuman(payload);
  }

  process.exit(payload.summary.fail > 0 ? 1 : 0);
}

main();
