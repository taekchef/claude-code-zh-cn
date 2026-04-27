#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_REPO_ROOT = path.resolve(__dirname, "..");
const STABLE_FLOOR = "2.1.92";
const STABLE_CEILING = "2.1.112";
const STABLE_RANGE = `${STABLE_FLOOR} - ${STABLE_CEILING}`;

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

function isNegatedBoundaryLine(line) {
  return /不支持|暂不支持|暂不承诺|不承诺|unsupported|not\s+supported|not\s+currently\s+supported|skipped?|detected and skipped|跳过|未验证|不会|仅启用|只启用|不再包含/i.test(line);
}

function findSupportClaim(line) {
  const versions = line.match(/\b\d+\.\d+\.\d+\+?/g) || [];
  const hasFutureVersion =
    /latest|最新版|最新版本/i.test(line) ||
    versions.some((version) => {
      const normalized = version.replace(/\+$/, "");
      const comparison = compareVersions(normalized, STABLE_CEILING);
      return comparison !== null && comparison > 0;
    });
  const hasSupportVerb = /支持|stable|已支持|可用|support|supported|pass|已验证/i.test(line);

  if (hasFutureVersion && hasSupportVerb && !isNegatedBoundaryLine(line)) {
    return "2.1.113+ / latest 不能写成 stable 支持";
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

function addTextFindings(findings, repoRoot, relative) {
  const file = path.join(repoRoot, relative);
  const text = readTextIfExists(file);
  if (text === null) return;

  text.split(/\r?\n/).forEach((line, index) => {
    const supportClaim = findSupportClaim(line);
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
  const stable = config.support?.npm?.stable || {};
  const representatives = stable.representatives || [];

  if (stable.floor !== STABLE_FLOOR || stable.ceiling !== STABLE_CEILING) {
    findings.push({
      file: relative,
      line: 1,
      message: `npm stable ceiling 必须保持在 ${STABLE_CEILING}`,
      text: `npm stable: ${stable.floor || "unknown"} - ${stable.ceiling || "unknown"}`,
    });
  }

  for (const version of representatives) {
    if (!isSemver(version)) {
      findings.push({
        file: relative,
        line: 1,
        message: `npm stable representatives 不能使用非数字版本 ${version}`,
        text: `npm stable ceiling: ${STABLE_CEILING}`,
      });
      continue;
    }

    if (compareVersions(version, STABLE_CEILING) > 0) {
      findings.push({
        file: relative,
        line: 1,
        message: `npm stable representatives 不能包含 ${version}`,
        text: `npm stable ceiling: ${STABLE_CEILING}`,
      });
    }
  }

  addSupportEntryFindings(findings, config.support || {}, relative, []);
}

function addSupportEntryFindings(findings, node, relative, pathParts) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;

  const entryPath = pathParts.join(".");
  const isEntry = node.unsupported === true || node.floor || node.ceiling || node.representatives;
  if (isEntry) {
    const pathText = entryPath.toLowerCase();
    const isMacosInstaller = pathText.includes("macosofficialinstaller");
    const isWindowsNative =
      pathText.includes("windows") &&
      (pathText.includes("native") || pathText.includes("exe") || pathText.includes("binary") || pathText.includes("official"));
    const ceilingLimit = isMacosInstaller ? STABLE_CEILING : STABLE_CEILING;

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
    } else if (node.ceiling && compareVersions(node.ceiling, ceilingLimit) > 0) {
      findings.push({
        file: relative,
        line: 1,
        message: `${entryPath} ceiling 不能超过 ${ceilingLimit}`,
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

      if (compareVersions(version, ceilingLimit) > 0) {
        findings.push({
          file: relative,
          line: 1,
          message: `${entryPath} representatives 不能包含 ${version}`,
          text: `${entryPath}: ${JSON.stringify(node.representatives)}`,
        });
      }
    }
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    addSupportEntryFindings(findings, value, relative, [...pathParts, key]);
  }
}

function buildFindings(repoRoot) {
  const findings = [];
  addConfigFindings(findings, repoRoot);

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
    addTextFindings(findings, repoRoot, relative);
  }

  return findings;
}

function printOk() {
  console.log(`support-boundary-guard: OK`);
  console.log(`stable CLI Patch: ${STABLE_RANGE}`);
  console.log(`2.1.113+ / latest: 暂不支持 CLI Patch`);
}

function printFail(findings) {
  console.log("support-boundary-guard: FAIL");
  console.log("当前官方边界:");
  console.log(`- stable CLI Patch: ${STABLE_RANGE}`);
  console.log("- 2.1.113+ / latest: 暂不支持 CLI Patch；改回 unsupported / 跳过口径");
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
  const findings = buildFindings(args.repoRoot);
  if (findings.length > 0) {
    printFail(findings);
    process.exit(1);
  }

  printOk();
}

main();
