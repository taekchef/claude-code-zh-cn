#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { repoRoot: DEFAULT_REPO_ROOT };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repo-root") {
      args.repoRoot = path.resolve(argv[++i]);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readTextIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function isSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(String(version || ""));
}

function compareVersions(a, b) {
  if (!isSemver(a) || !isSemver(b)) {
    return null;
  }

  const left = String(a).split(".").map((part) => Number.parseInt(part, 10));
  const right = String(b).split(".").map((part) => Number.parseInt(part, 10));
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const delta = (left[i] || 0) - (right[i] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function readBoundary(config) {
  const stable = config.support?.npm?.stable || {};
  const stableFloor = stable.floor;
  const stableCeiling = stable.ceiling;

  if (!isSemver(stableFloor) || !isSemver(stableCeiling)) {
    return {
      stableFloor,
      stableCeiling,
      stableRange: `${stableFloor || "unknown"} - ${stableCeiling || "unknown"}`,
      validStableRange: false,
      nativeBoundary: "unknown",
    };
  }

  const parts = stableCeiling.split(".").map((part) => Number.parseInt(part, 10));
  parts[2] += 1;

  return {
    stableFloor,
    stableCeiling,
    stableRange: `${stableFloor} - ${stableCeiling}`,
    validStableRange: true,
    nativeBoundary: parts.join("."),
  };
}

function isNegatedBoundaryLine(line) {
  return /不支持|暂不支持|暂不承诺|不承诺|不属于|不代表|unsupported|not\s+supported|not\s+currently\s+supported|not\s+stable|skipped?|detected and skipped|跳过|未验证|不会|仅启用|只启用|不再包含/i.test(line);
}

function isAllowedNativeExperimentalLine(line) {
  const mentionsMacos = /macOS|darwin/i.test(line);
  const mentionsNative = /native|原生|二进制|binary/i.test(line);
  const experimental = /experimental|实验/i.test(line);
  const stableClaim = /\bstable\b|稳定支持|stable CLI Patch/i.test(line);
  const latestClaim = /\blatest\b|最新版|最新版本/i.test(line);

  return mentionsMacos && mentionsNative && experimental && !stableClaim && !latestClaim;
}

function findSupportClaim(line, boundary) {
  const versions = line.match(/\b\d+\.\d+\.\d+\+?/g) || [];
  const hasFutureVersion =
    /latest|最新版|最新版本/i.test(line) ||
    versions.some((version) => {
      const normalized = version.replace(/\+$/, "");
      const comparison = compareVersions(normalized, boundary.stableCeiling);
      return comparison !== null && comparison > 0;
    });
  const hasSupportVerb = /支持|stable|已支持|可用|support|supported|pass|已验证/i.test(line);

  if (
    hasFutureVersion &&
    hasSupportVerb &&
    !isNegatedBoundaryLine(line) &&
    !isAllowedNativeExperimentalLine(line)
  ) {
    return `${boundary.nativeBoundary}+ / latest 不能写成 stable 支持`;
  }

  return null;
}

function findWindowsNativeClaim(line) {
  const mentionsWindows = /Windows/i.test(line);
  const mentionsNative = /native|原生|\.exe|二进制|binary wrapper|official installer|官方安装器/i.test(line);
  const mentionsNativeExe = /Windows\s+native|Windows\s+原生|\.exe|native binary|原生二进制|binary wrapper/i.test(line);
  const scopedOldNpm = /旧\s*npm|old\s+npm|cli\.js/i.test(line) && /2\.1\.112/.test(line);
  const mentionsCliPatch = /CLI Patch|完整 CLI|稳定|stable|支持/i.test(line);
  const hasSupportVerb = /已支持|支持|stable|可用|support/i.test(line);

  if (
    mentionsWindows &&
    mentionsNative &&
    mentionsCliPatch &&
    hasSupportVerb &&
    !isNegatedBoundaryLine(line) &&
    mentionsNativeExe &&
    !scopedOldNpm
  ) {
    return "Windows native 只能写成 WSL + npm stable，不能写成 native stable 支持";
  }

  return null;
}

function addTextFindings(findings, repoRoot, relative, boundary) {
  const file = path.join(repoRoot, relative);
  const text = readTextIfExists(file);
  if (text === null) return;

  text.split(/\r?\n/).forEach((line, index) => {
    const supportClaim = findSupportClaim(line, boundary);
    const windowsClaim = findWindowsNativeClaim(line);
    const message = supportClaim || windowsClaim;
    if (!message) return;

    findings.push({
      file: relative,
      line: index + 1,
      message,
      text: line.trim(),
    });
  });
}

function addConfigFindings(findings, repoRoot) {
  const relative = "scripts/upstream-compat.config.json";
  const file = path.join(repoRoot, relative);
  const config = readJson(file);
  const boundary = readBoundary(config);
  const stable = config.support?.npm?.stable || {};
  const representatives = stable.representatives || [];

  if (!boundary.validStableRange) {
    findings.push({
      file: relative,
      line: 1,
      message: "npm stable floor / ceiling 必须是数字版本",
      text: `npm stable: ${stable.floor || "unknown"} - ${stable.ceiling || "unknown"}`,
    });
  }

  for (const version of representatives) {
    if (!isSemver(version)) {
      findings.push({
        file: relative,
        line: 1,
        message: `npm stable representatives 不能使用非数字版本 ${version}`,
        text: `npm stable representatives: ${JSON.stringify(representatives)}`,
      });
      continue;
    }

    if (boundary.validStableRange && compareVersions(version, boundary.stableCeiling) > 0) {
      findings.push({
        file: relative,
        line: 1,
        message: `npm stable representatives 不能超过 config ceiling ${boundary.stableCeiling}`,
        text: `npm stable representatives: ${JSON.stringify(representatives)}`,
      });
    }
  }

  addSupportEntryFindings(findings, config.support || {}, relative, [], boundary);
  return boundary;
}

function addSupportEntryFindings(findings, node, relative, pathParts, boundary) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;

  const entryPath = pathParts.join(".");
  const isEntry = node.unsupported === true || node.floor || node.ceiling || node.representatives;
  if (isEntry) {
    const pathText = entryPath.toLowerCase();
    const isMacosInstaller = pathText.includes("macosofficialinstaller");
    const isMacosNativeExperimental = pathText.includes("macosnativeexperimental");
    const isWindowsNative =
      pathText.includes("windows") &&
      (pathText.includes("native") || pathText.includes("exe") || pathText.includes("binary") || pathText.includes("official"));
    const ceilingLimit = isMacosNativeExperimental || !boundary.validStableRange
      ? null
      : boundary.stableCeiling;

    if (isWindowsNative && node.unsupported !== true) {
      findings.push({
        file: relative,
        line: 1,
        message: "Windows native / .exe 必须保持 unsupported",
        text: `${entryPath}: ${JSON.stringify(node)}`,
      });
    }

    if (node.ceiling && !isSemver(node.ceiling)) {
      findings.push({
        file: relative,
        line: 1,
        message: `${entryPath} ceiling 不能使用非数字版本 ${node.ceiling}`,
        text: `${entryPath}: ${node.ceiling}`,
      });
    } else if (node.ceiling && ceilingLimit && compareVersions(node.ceiling, ceilingLimit) > 0) {
      findings.push({
        file: relative,
        line: 1,
        message: `${entryPath} ceiling 不能超过 npm stable ceiling ${ceilingLimit}`,
        text: `${entryPath}: ${node.ceiling}`,
      });
    }

    for (const version of node.representatives || []) {
      if (!isSemver(version)) {
        findings.push({
          file: relative,
          line: 1,
          message: `${entryPath} representatives 不能使用非数字版本 ${version}`,
          text: `${entryPath}: ${JSON.stringify(node.representatives)}`,
        });
        continue;
      }

      if (ceilingLimit && compareVersions(version, ceilingLimit) > 0) {
        findings.push({
          file: relative,
          line: 1,
          message: `${entryPath} representatives 不能超过 npm stable ceiling ${ceilingLimit}`,
          text: `${entryPath}: ${JSON.stringify(node.representatives)}`,
        });
      }
    }
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    addSupportEntryFindings(findings, value, relative, [...pathParts, key], boundary);
  }
}

function buildFindings(repoRoot) {
  const findings = [];
  const boundary = addConfigFindings(findings, repoRoot);

  for (const relative of [
    "README.md",
    "docs/support-matrix.md",
    "install.sh",
    "install.ps1",
    "plugin/hooks/session-start",
    "plugin/hooks/session-start.ps1",
    "plugin/bin/claude-launcher",
    "plugin/bin/claude-launcher.ps1",
    "plugin/bin/claude-launcher.cmd",
  ]) {
    addTextFindings(findings, repoRoot, relative, boundary);
  }

  return { findings, boundary };
}

function printOk(boundary) {
  console.log(`support-boundary-guard: OK`);
  console.log(`stable CLI Patch: ${boundary.stableRange}`);
  console.log(`native CLI Patch: only explicitly verified macOS experimental versions; no latest stable claim`);
}

function printFail(findings, boundary) {
  console.log("support-boundary-guard: FAIL");
  console.log("当前官方边界:");
  console.log(`- stable CLI Patch: ${boundary.stableRange}`);
  console.log(`- ${boundary.nativeBoundary}+ / latest: 不能写成 stable；macOS native 只能写已验证 experimental 窗口`);
  console.log("- Windows 只能写成 WSL + npm stable，不能写成 Windows native stable");
  console.log("");

  for (const finding of findings) {
    console.log(`${finding.file}:${finding.line} ${finding.message}`);
    console.log(`  ${finding.text}`);
    console.log(`  下一步：改回当前官方边界，不要把未验证 native binary 写成已支持。`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { findings, boundary } = buildFindings(args.repoRoot);
  if (findings.length > 0) {
    printFail(findings, boundary);
    process.exit(1);
  }

  printOk(boundary);
}

main();
