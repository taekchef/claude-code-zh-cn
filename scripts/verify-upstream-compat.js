#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const isWindows = process.platform === "win32";
const repoRoot = path.resolve(__dirname, "..");
const defaultConfigPath = path.join(__dirname, "upstream-compat.config.json");
const patchCliPath = path.join(repoRoot, "patch-cli.js");
const patchCliShellPath = path.join(repoRoot, "patch-cli.sh");
const binaryIoPath = path.join(repoRoot, "bun-binary-io.js");
const translationsPath = path.join(repoRoot, "cli-translations.json");

function execFile(cmd, args, opts) {
  if (isWindows) {
    return execFileSync(cmd, args, { ...opts, shell: true });
  }
  return execFileSync(cmd, args, opts);
}

function spawnFile(cmd, args, opts) {
  return spawnSync(cmd, args, isWindows ? { ...opts, shell: true } : opts);
}

function fail(message) {
  throw new Error(message);
}

function compactError(error) {
  return [error.stderr, error.stdout, error.message]
    .filter(Boolean)
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join("\n");
}

function parseArgs(argv) {
  const args = {
    config: defaultConfigPath,
    json: false,
    skipLatest: false,
    nativeMacosArm64: false,
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
      case "--native-macos-arm64":
        args.nativeMacosArm64 = true;
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

function normalizeDisplayCheckList(entries, kind) {
  return (entries || []).map((entry, index) => {
    if (typeof entry === "string") {
      return { kind, id: `${kind}_${index}`, pattern: entry, command: null };
    }

    if (!entry || typeof entry !== "object") {
      fail(`Invalid ${kind} display audit entry at index ${index}`);
    }

    if (!entry.id) {
      fail(`Missing id for ${kind} display audit entry at index ${index}`);
    }

    if (!entry.pattern && !entry.regex) {
      fail(`Missing pattern/regex for ${kind} display audit entry "${entry.id}"`);
    }

    return {
      kind,
      id: entry.id,
      command: entry.command || null,
      pattern: entry.pattern || null,
      regex: entry.regex || null,
    };
  });
}

function normalizeDisplayAudit(audit) {
  if (!audit) return null;

  const commands = (audit.commands || []).map((command, index) => {
    if (!command || typeof command !== "object") {
      fail(`Invalid display audit command at index ${index}`);
    }
    if (!Array.isArray(command.args)) {
      fail(`Display audit command "${command.id || index}" must define args`);
    }

    return {
      id: command.id || `command_${index}`,
      args: command.args.map(String),
      optional: Boolean(command.optional),
      timeoutMs: command.timeoutMs || audit.timeoutMs || 20000,
    };
  });
  const minCommandCount = Number.isInteger(audit.minCommandCount) ? audit.minCommandCount : commands.length;
  if (minCommandCount < 0 || minCommandCount > commands.length) {
    fail(`displayAudit.minCommandCount must be between 0 and ${commands.length}`);
  }

  return {
    commands,
    minCommandCount,
    blockedPhrases: normalizeDisplayCheckList(audit.blockedPhrases, "display"),
    mustPreserve: normalizeDisplayCheckList(audit.mustPreserve, "display-preserve"),
    allowedEnglishLineRegexes: audit.allowedEnglishLineRegexes || [],
    allowedEnglishTerms: audit.allowedEnglishTerms || [],
    minEnglishWords: audit.minEnglishWords || 2,
    maxUntranslatedLines: Number.isInteger(audit.maxUntranslatedLines) ? audit.maxUntranslatedLines : 0,
  };
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
      displayAudit: normalizeDisplayAudit(config.checks?.displayAudit),
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
  if (fs.existsSync(packageDir)) {
    return packageDir;
  }

  const directDir = path.join(fixturesDir, version);
  if (fs.existsSync(directDir)) {
    return directDir;
  }

  fail(`Fixture package for version ${version} not found in ${fixturesDir}`);
}

function downloadedPackageShapeError(packageDir) {
  if (!fs.existsSync(packageDir)) {
    return "missing package/";
  }

  if (!fs.existsSync(path.join(packageDir, "package.json"))) {
    return "missing package.json";
  }

  if (fs.existsSync(path.join(packageDir, "cli.js"))) {
    return null;
  }

  if (fs.existsSync(path.join(packageDir, "claude"))) {
    return null;
  }

  if (fs.existsSync(path.join(packageDir, "bin", "claude.exe"))) {
    return null;
  }

  return "missing cli.js or native executable";
}

function downloadPackage(packageName, version, packagesDir) {
  const safePackageName = packageName.replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const versionRoot = path.join(packagesDir, `${safePackageName}-${version}`);
  const packageDir = path.join(versionRoot, "package");
  if (fs.existsSync(packageDir)) {
    const shapeError = downloadedPackageShapeError(packageDir);
    if (!shapeError) {
      return packageDir;
    }
    fs.rmSync(versionRoot, { recursive: true, force: true });
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

  if (!fs.existsSync(packageDir)) {
    fail(`Downloaded package ${packageName}@${version} did not unpack to package/`);
  }

  const shapeError = downloadedPackageShapeError(packageDir);
  if (shapeError) {
    fail(`Downloaded package ${packageName}@${version} is incomplete: ${shapeError}`);
  }

  return packageDir;
}

function resolvePackageName(config, args, version) {
  const nativeConfig = config.support?.macosNativeExperimental;
  if (
    args.nativeMacosArm64 &&
    nativeConfig?.packageName &&
    (nativeConfig.representatives || []).map(String).includes(String(version))
  ) {
    return nativeConfig.packageName;
  }

  return config.packageName;
}

function resolvePackageDir(config, args, version) {
  if (args.fixturesDir) {
    return findFixturePackage(args.fixturesDir, version);
  }

  const packagesDir = args.packagesDir || path.join(os.tmpdir(), "claude-code-zh-cn-upstream-cache");
  return downloadPackage(resolvePackageName(config, args, version), version, packagesDir);
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

function classifyPackage(packageDir) {
  if (fs.existsSync(path.join(packageDir, "cli.js"))) {
    return "legacy";
  }

  if (fs.existsSync(path.join(packageDir, "claude"))) {
    return "native";
  }

  if (fs.existsSync(path.join(packageDir, "bin", "claude.exe"))) {
    return "native-wrapper";
  }

  return "unknown";
}

function currentNativePlatform() {
  return process.env.CCZH_NATIVE_VERIFY_PLATFORM || `${process.platform}-${process.arch}`;
}

function nativeSkipResult(version, kind, skipReason, extra = {}) {
  return {
    version,
    kind,
    status: "skip",
    patchCount: 0,
    residue: [],
    missingRequired: [],
    skipReason,
    ...extra,
  };
}

function nativeFailResult(version, kind, error, extra = {}) {
  return {
    version,
    kind,
    status: "fail",
    patchCount: 0,
    residue: [],
    missingRequired: [],
    error,
    ...extra,
  };
}

function checkNativeDeps() {
  if (process.env.CCZH_NATIVE_FORCE_DEPS) {
    return process.env.CCZH_NATIVE_FORCE_DEPS;
  }

  return execFile("node", [binaryIoPath, "check-deps"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runNativeVerification(config, args, version, packageDir, kind) {
  if (!args.nativeMacosArm64) {
    return nativeSkipResult(version, kind, "native verification not enabled");
  }

  if (currentNativePlatform() !== "darwin-arm64") {
    return nativeSkipResult(version, kind, "native verification requires macOS arm64");
  }

  let depStatus;
  try {
    depStatus = checkNativeDeps();
  } catch (error) {
    return nativeSkipResult(version, kind, `node-lief dependency check failed: ${compactError(error)}`);
  }

  if (depStatus !== "ok") {
    return nativeSkipResult(version, kind, "node-lief dependency missing");
  }

  if (kind !== "native") {
    return nativeSkipResult(version, kind, "native verification requires platform package with package/claude");
  }

  const binaryPath = path.join(packageDir, "claude");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-native-compat-"));
  const extractedJs = path.join(tmpDir, "extracted.js");
  const patchedBinary = path.join(tmpDir, "claude-patched");

  try {
    const detectOutput = execFile("node", [binaryIoPath, "detect", binaryPath], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();

    if (!detectOutput.startsWith("native-bun:")) {
      return nativeFailResult(version, kind, `native detect returned ${detectOutput || "empty"}`);
    }

    execFile("node", [binaryIoPath, "extract", binaryPath, extractedJs], {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "pipe"],
    });

    const original = fs.readFileSync(extractedJs, "utf8");
    const patchOutput = execFile("bash", [patchCliShellPath, extractedJs], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const patchCount = Number.parseInt(patchOutput || "0", 10) || 0;
    const patched = fs.readFileSync(extractedJs, "utf8");
    const residue = collectResidue(patched, config.checks);
    const missingRequired = collectMissingRequired(original, patched, config.checks);

    fs.copyFileSync(binaryPath, patchedBinary);
    fs.chmodSync(patchedBinary, 0o755);
    execFile("node", [binaryIoPath, "repack", patchedBinary, extractedJs], {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "pipe"],
    });

    const tempHome = path.join(tmpDir, "home");
    fs.mkdirSync(tempHome, { recursive: true });
    const versionOutput = execFile(patchedBinary, ["--version"], {
      cwd: tmpDir,
      encoding: "utf8",
      timeout: 20000,
      env: {
        ...process.env,
        HOME: tempHome,
        XDG_CONFIG_HOME: path.join(tempHome, ".config"),
        XDG_CACHE_HOME: path.join(tempHome, ".cache"),
        XDG_DATA_HOME: path.join(tempHome, ".local", "share"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const displayAudit = runDisplayAudit(config, {
      run: (runArgs, runtimeOptions) =>
        spawnFile(patchedBinary, runArgs, {
          ...runtimeOptions,
          encoding: "utf8",
        }),
    });

    const status =
      patchCount <= 0 ||
      residue.length > 0 ||
      missingRequired.length > 0 ||
      displayAudit?.status === "fail" ||
      !versionOutput.includes(version)
        ? "fail"
        : "pass";

    return {
      version,
      kind,
      status,
      patchCount,
      residue,
      missingRequired,
      nativeVerification: {
        packageName: resolvePackageName(config, args, version),
        platform: "darwin-arm64",
        detect: detectOutput.split(":")[0],
        extract: "ok",
        repack: "ok",
        versionOutput,
      },
      ...(displayAudit ? { displayAudit } : {}),
    };
  } catch (error) {
    return nativeFailResult(version, kind, compactError(error), {
      nativeVerification: {
        packageName: resolvePackageName(config, args, version),
        platform: "darwin-arm64",
      },
    });
  }
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

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function commandMatches(check, commandId) {
  return !check.command || check.command === commandId;
}

function displayCheckMatches(text, check) {
  if (check.pattern && text.includes(check.pattern)) {
    return check.pattern;
  }

  if (check.regex) {
    const compiled = new RegExp(check.regex, "g");
    const match = text.match(compiled);
    if (match && match[0]) {
      return match[0];
    }
  }

  return null;
}

function hasCjk(text) {
  return /[\u3400-\u9fff]/.test(text);
}

function removeAllowedEnglishTerms(text, audit) {
  let result = text;
  for (const term of audit.allowedEnglishTerms) {
    result = result.replace(new RegExp(escapeRegExp(term), "gi"), " ");
  }
  return result;
}

function isLikelyUntranslatedLine(line, audit, allowedLineRegexes) {
  const trimmed = stripAnsi(line).trim();
  if (!trimmed || hasCjk(trimmed)) {
    return false;
  }

  if (allowedLineRegexes.some((regex) => regex.test(trimmed))) {
    return false;
  }

  const scrubbed = removeAllowedEnglishTerms(trimmed, audit)
    .replace(/`[^`]*`/g, " ")
    .replace(/"[^"]*"/g, " ")
    .replace(/'[^']*'/g, " ")
    .replace(/--?[A-Za-z0-9][A-Za-z0-9-]*/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\b[A-Z][A-Z0-9_]{1,}\b/g, " ")
    .replace(/\b[A-Za-z]:[\\/][^\s]+/g, " ")
    .replace(/[~./][^\s]*/g, " ")
    .replace(/[{}[\]():,|=+*#$\\]/g, " ");

  const words = scrubbed.match(/[A-Za-z][A-Za-z']{2,}/g) || [];
  const naturalWords = words.filter((word) => word !== word.toUpperCase());
  return naturalWords.length >= audit.minEnglishWords;
}

function auditDisplayText(output, audit, commandId) {
  const issues = [];
  const allowedLineRegexes = audit.allowedEnglishLineRegexes.map((pattern) => new RegExp(pattern));

  for (const check of audit.blockedPhrases) {
    if (!commandMatches(check, commandId)) continue;
    const match = displayCheckMatches(output, check);
    if (!match) continue;
    issues.push({
      kind: check.kind,
      id: check.id,
      command: commandId,
      match,
    });
  }

  for (const check of audit.mustPreserve) {
    if (!commandMatches(check, commandId)) continue;
    const match = displayCheckMatches(output, check);
    if (match) continue;
    issues.push({
      kind: check.kind,
      id: check.id,
      command: commandId,
      match: check.pattern || check.regex,
    });
  }

  const lines = output.split(/\r?\n/);
  const untranslatedLineIssues = [];
  lines.forEach((line, index) => {
    if (!isLikelyUntranslatedLine(line, audit, allowedLineRegexes)) {
      return;
    }

    untranslatedLineIssues.push({
      kind: "display-untranslated-line",
      id: `${commandId}_line_${index + 1}`,
      command: commandId,
      match: stripAnsi(line).trim(),
    });
  });

  if (untranslatedLineIssues.length > audit.maxUntranslatedLines) {
    issues.push(...untranslatedLineIssues.slice(audit.maxUntranslatedLines));
  }

  return issues;
}

function isolatedRuntimeEnv(tmpDir) {
  const home = path.join(tmpDir, "home");
  fs.mkdirSync(home, { recursive: true });
  return {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    NO_COLOR: "1",
    FORCE_COLOR: "0",
    CI: "1",
  };
}

function runDisplayAudit(config, runtime) {
  const audit = config.checks.displayAudit;
  if (!audit || audit.commands.length === 0) {
    return null;
  }

  const issues = [];
  const commands = [];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-display-audit-"));
  const env = isolatedRuntimeEnv(tmpDir);

  for (const command of audit.commands) {
    const result = runtime.run(command.args, {
      cwd: tmpDir,
      env,
      timeout: command.timeoutMs,
    });
    const stdout = result.stdout || "";
    const stderr = result.stderr || "";
    const output = `${stdout}${stderr ? `\n${stderr}` : ""}`;
    const commandSummary = {
      id: command.id,
      args: command.args,
      status: result.status,
    };

    if (result.error) {
      if (command.optional) {
        commands.push({ ...commandSummary, audit: "skip", error: result.error.message });
        continue;
      }

      const issue = {
        kind: "display-command",
        id: `${command.id}_error`,
        command: command.id,
        match: result.error.message,
      };
      issues.push(issue);
      commands.push({ ...commandSummary, audit: "fail", issueCount: 1 });
      continue;
    }

    if (result.status !== 0) {
      if (command.optional) {
        commands.push({ ...commandSummary, audit: "skip" });
        continue;
      }

      const issue = {
        kind: "display-command",
        id: `${command.id}_exit_${result.status}`,
        command: command.id,
        match: output.trim().slice(0, 300),
      };
      issues.push(issue);
      commands.push({ ...commandSummary, audit: "fail", issueCount: 1 });
      continue;
    }

    const commandIssues = auditDisplayText(output, audit, command.id);
    issues.push(...commandIssues);
    commands.push({
      ...commandSummary,
      audit: commandIssues.length > 0 ? "fail" : "pass",
      issueCount: commandIssues.length,
    });
  }

  const commandCount = commands.filter((command) => command.audit !== "skip").length;
  if (commandCount < audit.minCommandCount) {
    const skipped = commands
      .filter((command) => command.audit === "skip")
      .map((command) => command.id)
      .join(", ");
    issues.push({
      kind: "display-command-count",
      id: "minimum_display_surfaces",
      match: `expected at least ${audit.minCommandCount} audited surfaces, got ${commandCount}; skipped: ${skipped || "-"}`,
    });
  }

  return {
    status: issues.length > 0 ? "fail" : "pass",
    commandCount,
    issueCount: issues.length,
    commands,
    issues,
  };
}

function evaluateVersion(config, args, version) {
  const packageDir = resolvePackageDir(config, args, version);
  const kind = classifyPackage(packageDir);

  if (kind !== "legacy") {
    if (kind === "native" || kind === "native-wrapper") {
      return runNativeVerification(config, args, version, packageDir, kind);
    }

    fail(`Unsupported package shape for version ${version}`);
  }

  const cliSource = path.join(packageDir, "cli.js");
  if (!fs.existsSync(cliSource)) {
    fail(`cli.js not found for version ${version}`);
  }

  const { cliFile, patchCount } = runPatch(cliSource, version, args);
  const patched = fs.readFileSync(cliFile, "utf8");
  const original = fs.readFileSync(cliSource, "utf8");
  const residue = collectResidue(patched, config.checks);
  const missingRequired = collectMissingRequired(original, patched, config.checks);
  const displayAudit = runDisplayAudit(config, {
    run: (runArgs, runtimeOptions) =>
      spawnFile("node", [cliFile, ...runArgs], {
        ...runtimeOptions,
        encoding: "utf8",
      }),
  });

  return {
    version,
    kind,
    status: residue.length > 0 || missingRequired.length > 0 || displayAudit?.status === "fail" ? "fail" : "pass",
    patchCount,
    residue,
    missingRequired,
    ...(displayAudit ? { displayAudit } : {}),
  };
}

function buildSummary(results) {
  return results.reduce(
    (summary, result) => {
      summary[result.status] = (summary[result.status] || 0) + 1;
      return summary;
    },
    { pass: 0, fail: 0, skip: 0 }
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
    const skipSummary = result.skipReason ? `;skip=${result.skipReason}` : "";
    console.log(`${result.version}\t${result.status}\t${result.patchCount}\t${residueSummary};missing=${missingSummary}${skipSummary}`);
  }
  console.log(`summary\tpass=${payload.summary.pass}\tfail=${payload.summary.fail}\tskip=${payload.summary.skip}`);
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
