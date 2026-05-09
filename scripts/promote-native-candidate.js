#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const defaultConfigPath = path.join(__dirname, "upstream-compat.config.json");

function parseArgs(argv) {
  const args = {
    config: defaultConfigPath,
    write: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--candidate":
        args.candidate = path.resolve(argv[++i]);
        break;
      case "--config":
        args.config = path.resolve(argv[++i]);
        break;
      case "--write":
        args.write = true;
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
    "Usage: node scripts/promote-native-candidate.js --candidate candidate.json [--config scripts/upstream-compat.config.json] [--write]",
    "",
    "Validates one macOS arm64 native candidate JSON and, with --write, promotes it into scripts/upstream-compat.config.json.",
    "The script refuses skipped/failed candidates and prints the exact boundary that blocked promotion.",
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

function semverParts(version) {
  if (!isSemver(version)) return null;
  return String(version).split(".").map((part) => Number.parseInt(part, 10));
}

function compareVersions(a, b) {
  const left = semverParts(a);
  const right = semverParts(b);
  if (!left || !right) return null;

  for (let i = 0; i < 3; i += 1) {
    const delta = left[i] - right[i];
    if (delta !== 0) return delta;
  }
  return 0;
}

function sortVersions(versions) {
  return [...new Set(versions.map(String))]
    .filter(isSemver)
    .sort((a, b) => compareVersions(a, b));
}

function compactVersions(versions) {
  const sorted = sortVersions(versions);
  const segments = [];
  let start = sorted[0];
  let previous = sorted[0];

  function pushSegment() {
    if (!start) return;
    segments.push(start === previous ? start : `${start} - ${previous}`);
  }

  for (const version of sorted.slice(1)) {
    const prev = semverParts(previous);
    const current = semverParts(version);
    const consecutive =
      prev &&
      current &&
      current[0] === prev[0] &&
      current[1] === prev[1] &&
      current[2] === prev[2] + 1;

    if (consecutive) {
      previous = version;
      continue;
    }

    pushSegment();
    start = version;
    previous = version;
  }

  pushSegment();
  return segments;
}

function versionsBetweenExclusive(start, end) {
  const from = semverParts(start);
  const to = semverParts(end);
  if (!from || !to || from[0] !== to[0] || from[1] !== to[1]) {
    return [];
  }

  const versions = [];
  for (let patch = from[2] + 1; patch < to[2]; patch += 1) {
    versions.push(`${from[0]}.${from[1]}.${patch}`);
  }
  return versions;
}

function verificationEntry(result) {
  const displayCount = result.displayAudit.commandCount;
  return `${result.version} PASS(native ${result.patchCount}, display ${displayCount}/${displayCount})`;
}

function verificationMap(raw) {
  const map = new Map();
  for (const chunk of String(raw || "").split(/\s+·\s+/)) {
    const match = chunk.match(/^(\d+\.\d+\.\d+)\s+/);
    if (!match) continue;
    map.set(match[1], chunk);
  }
  return map;
}

function describeList(entries, formatter) {
  if (!Array.isArray(entries) || entries.length === 0) return "-";
  return entries.map(formatter).join(", ");
}

function validateCandidate(config, payload) {
  const reasons = [];
  const results = Array.isArray(payload.results) ? payload.results : [];
  const result = results.length === 1 ? results[0] : null;
  const nativeConfig = config.support?.macosNativeExperimental;

  if (!nativeConfig || nativeConfig.unsupported === true) {
    reasons.push("support.macosNativeExperimental is missing or unsupported");
  }

  if (!result) {
    reasons.push(`candidate JSON must contain exactly one result, got ${results.length}`);
    return { result: null, reasons };
  }

  if (!isSemver(result.version)) {
    reasons.push(`candidate version must be a numeric semver, got ${result.version || "unknown"}`);
  }

  if (result.status !== "pass") {
    const skip = result.skipReason ? `; ${result.skipReason}` : "";
    const error = result.error ? `; ${result.error}` : "";
    reasons.push(`native verification did not pass: status=${result.status || "unknown"}${skip}${error}`);
  }

  if (result.kind !== "native") {
    reasons.push(`package shape boundary failed: expected native, got ${result.kind || "unknown"}`);
  }

  if (!Number.isInteger(result.patchCount) || result.patchCount <= 0) {
    reasons.push(`native patch boundary failed: patchCount=${result.patchCount || 0}`);
  }

  if (Array.isArray(result.residue) && result.residue.length > 0) {
    reasons.push(
      `translation residue boundary failed: ${describeList(result.residue, (entry) => `${entry.kind}:${entry.id}`)}`
    );
  }

  if (Array.isArray(result.missingRequired) && result.missingRequired.length > 0) {
    reasons.push(
      `upstream text guard boundary failed: ${describeList(result.missingRequired, (entry) => `${entry.kind}:${entry.id}`)}`
    );
  }

  const native = result.nativeVerification || {};
  if (native.platform !== "darwin-arm64") {
    reasons.push(`native platform boundary failed: expected darwin-arm64, got ${native.platform || "unknown"}`);
  }

  const expectedPackage = nativeConfig?.packageName || "@anthropic-ai/claude-code-darwin-arm64";
  if (native.packageName && native.packageName !== expectedPackage) {
    reasons.push(`native package boundary failed: expected ${expectedPackage}, got ${native.packageName}`);
  }

  if (native.extract && native.extract !== "ok") {
    reasons.push(`native extract boundary failed: ${native.extract}`);
  }

  if (native.repack !== "ok") {
    reasons.push(`native repack boundary failed: ${native.repack || "unknown"}`);
  }

  if (!String(native.versionOutput || "").includes(String(result.version || ""))) {
    reasons.push(`native runtime boundary failed: --version did not include ${result.version}`);
  }

  const audit = result.displayAudit;
  if (!audit || audit.status !== "pass") {
    reasons.push(`display audit did not pass: status=${audit?.status || "missing"}`);
  } else if (!Number.isInteger(audit.commandCount) || audit.commandCount <= 0) {
    reasons.push(`display audit did not pass: commandCount=${audit.commandCount || 0}`);
  }

  if (nativeConfig?.ceiling && result.version && compareVersions(result.version, nativeConfig.ceiling) > 0) {
    const current = semverParts(nativeConfig.ceiling);
    const next = semverParts(result.version);
    if (current && next && (current[0] !== next[0] || current[1] !== next[1])) {
      reasons.push(
        `version line boundary failed: ${result.version} crosses ${nativeConfig.ceiling}; promote this minor/major line manually`
      );
    }
  }

  return { result, reasons };
}

function renderNotes(entry, displayCount) {
  const verified = compactVersions(entry.representatives).join("、");
  const excluded = Array.isArray(entry.excluded) && entry.excluded.length > 0
    ? `${entry.excluded.join("、")} 未发布或未纳入支持；`
    : "";

  return `macOS arm64 native binary experimental；需要 node-lief；已验证 ${verified} 的 extract / patch / repack / --version 和 ${displayCount} 个稳定显示面审计；${excluded}不代表未来 latest 自动稳定。`;
}

function promote(config, result) {
  const entry = config.support.macosNativeExperimental;
  const previousCeiling = entry.ceiling;
  const representatives = new Set((entry.representatives || []).map(String));
  const excluded = new Set((entry.excluded || []).map(String));

  representatives.add(result.version);
  excluded.delete(result.version);

  if (previousCeiling && compareVersions(result.version, previousCeiling) > 0) {
    for (const version of versionsBetweenExclusive(previousCeiling, result.version)) {
      if (!representatives.has(version)) {
        excluded.add(version);
      }
    }
    entry.ceiling = result.version;
  }

  entry.representatives = sortVersions([...representatives]);
  entry.excluded = sortVersions([...excluded].filter((version) => !representatives.has(version)));

  const byVersion = verificationMap(entry.verification);
  byVersion.set(result.version, verificationEntry(result));
  const missingVerification = entry.representatives.filter((version) => !byVersion.has(version));
  if (missingVerification.length > 0) {
    fail(`Existing native verification is missing representatives: ${missingVerification.join(", ")}`);
  }

  entry.verification = entry.representatives.map((version) => byVersion.get(version)).join(" · ");
  entry.notes = renderNotes(entry, result.displayAudit.commandCount);

  return entry;
}

function printBlocked(result, reasons) {
  const version = result?.version || "unknown";
  console.error(`native candidate promotion blocked for ${version}`);
  for (const reason of reasons) {
    console.error(`- ${reason}`);
  }
  console.error("- next step: keep this version outside public support until the boundary is fixed and re-verified");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  if (!args.candidate) {
    fail("--candidate is required");
  }

  const config = readJson(args.config);
  const candidate = readJson(args.candidate);
  const { result, reasons } = validateCandidate(config, candidate);

  if (reasons.length > 0) {
    printBlocked(result, reasons);
    process.exit(1);
  }

  promote(config, result);

  if (args.write) {
    writeJson(args.config, config);
    process.stdout.write(
      `promoted macOS native candidate ${result.version} into ${path.relative(repoRoot, args.config)}\n`
    );
    return;
  }

  process.stdout.write(`macOS native candidate ${result.version} is promotable\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`promote-native-candidate: ${error.message}`);
    process.exit(1);
  }
}
