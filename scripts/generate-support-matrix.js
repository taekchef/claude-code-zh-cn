#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const configPath = path.join(__dirname, "upstream-compat.config.json");
const compatScriptPath = path.join(__dirname, "verify-upstream-compat.js");
const outputPath = path.join(repoRoot, "docs", "support-matrix.md");

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function runCompatMatrix() {
  return JSON.parse(
    execFileSync("node", [compatScriptPath, "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
}

function renderRange(entry) {
  if (!entry || entry.unsupported) return "-";
  if (entry.floor && entry.ceiling) {
    const excluded = Array.isArray(entry.excluded) && entry.excluded.length > 0
      ? ` (不含 ${entry.excluded.join(", ")})`
      : "";
    return `${entry.floor} - ${entry.ceiling}${excluded}`;
  }
  return entry.floor || entry.ceiling || "-";
}

function renderRepresentativeStatus(representatives, resultMap) {
  if (!Array.isArray(representatives) || representatives.length === 0) {
    return "-";
  }

  return representatives
    .map((version) => {
      const result = resultMap.get(version);
      const symbol = result ? (result.status === "pass" ? "PASS" : "FAIL") : "N/A";
      return `${version} ${symbol}`;
    })
    .join(" · ");
}

function renderResidue(result) {
  if (!result || !result.residue || result.residue.length === 0) {
    return "-";
  }

  return result.residue.map((entry) => `${entry.kind}:${entry.id}`).join(", ");
}

function renderResult(status) {
  if (status === "pass") return "PASS";
  if (status === "fail") return "FAIL";
  if (status === "skip") return "SKIP";
  return status || "-";
}

function renderRuntime(result) {
  if (!result?.nativeVerification) return "-";
  const versionOutput = result.nativeVerification.versionOutput
    ? `, ${result.nativeVerification.versionOutput}`
    : "";
  return `${result.nativeVerification.detect || result.kind || "native"} ${result.nativeVerification.repack || "checked"}${versionOutput}`;
}

function renderDisplayAudit(result) {
  const audit = result?.displayAudit;
  if (!audit) return "-";
  if (audit.status === "pass") {
    return `PASS (${audit.commandCount} surfaces)`;
  }
  if (audit.status === "fail") {
    return `FAIL (${audit.issueCount} issues / ${audit.commandCount} surfaces)`;
  }
  return renderResult(audit.status);
}

function renderCoverageForChannel(tier, verification) {
  if (tier === "stable") return "完整链路已验证";
  if (tier === "experimental" && /display/i.test(verification || "")) return "native + 显示审计已验证";
  if (tier === "experimental") return "实验验证中";
  return "不承诺完整汉化";
}

function renderAction(tier, notes) {
  if (tier === "stable") return "推荐";
  if (tier === "experimental") return "只用已验证版本";
  if (/不支持|unsupported|跳过/.test(notes || "")) return "不建议";
  return "看备注";
}

function buildMarkdown(config, compat) {
  const resultMap = new Map(compat.results.map((entry) => [entry.version, entry]));
  const npmStable = config.support?.npm?.stable || {};
  const macosInstaller = config.support?.macosOfficialInstaller || {};
  const macosExperimental = macosInstaller.experimental || {};
  const macosNativeExperimental = config.support?.macosNativeExperimental || null;
  const macosTier = macosInstaller.unsupported ? "unsupported" : "experimental";
  const macosWindow = macosInstaller.unsupported ? macosInstaller : macosExperimental;
  const macosVerification = macosInstaller.unsupported
    ? "-"
    : macosExperimental.verification ||
      renderRepresentativeStatus(macosExperimental.representatives, resultMap);
  const linuxUnsupported = config.support?.linuxOfficialInstaller || {};
  const windowsNpm = config.support?.windowsNpmPowerShell || {};
  const windowsNpmStable = windowsNpm.stable || {};
  const windowsNpmTier = windowsNpm.unsupported ? "unsupported" : "stable";
  const windowsNpmWindow = windowsNpm.unsupported ? windowsNpm : windowsNpmStable;
  const windowsNativeUnsupported = config.support?.windowsNativeExe || {};
  const now = new Date();
  const generatedOn = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("-");

  const lines = [
    "# Support Matrix",
    "",
    `> Generated from \`scripts/upstream-compat.config.json\` + \`node scripts/verify-upstream-compat.js --json\` on ${generatedOn}.`,
    "",
    "## Quick Decision",
    "",
    "| 安装方式 | 版本范围 | 状态 | 汉化效果 | 建议 |",
    "| --- | --- | --- | --- | --- |",
    `| npm global install | ${renderRange(npmStable)} | stable | ${renderCoverageForChannel(
      "stable"
    )} | ${renderAction("stable", npmStable.notes)} |`,
    `| macOS official installer | ${renderRange(macosWindow)} | ${macosTier} | ${renderCoverageForChannel(
      macosTier,
      macosVerification
    )} | ${renderAction(macosTier, macosWindow.notes)} |`,
    ...(macosNativeExperimental && macosNativeExperimental.unsupported !== true
      ? [
          `| macOS native binary | ${renderRange(
            macosNativeExperimental
          )} | experimental | ${renderCoverageForChannel(
            "experimental",
            macosNativeExperimental.verification
          )} | ${renderAction("experimental", macosNativeExperimental.notes)} |`,
        ]
      : []),
    `| Linux official installer | ${renderRange(linuxUnsupported)} | unsupported | ${renderCoverageForChannel(
      "unsupported"
    )} | ${renderAction("unsupported", linuxUnsupported.notes)} |`,
    `| Windows / npm global install (PowerShell) | ${renderRange(
      windowsNpmWindow
    )} | ${windowsNpmTier} | ${renderCoverageForChannel(windowsNpmTier)} | ${renderAction(
      windowsNpmTier,
      windowsNpmWindow.notes
    )} |`,
    `| Windows / native .exe / latest | ${renderRange(
      windowsNativeUnsupported
    )} | unsupported | ${renderCoverageForChannel("unsupported")} | ${renderAction(
      "unsupported",
      windowsNativeUnsupported.notes
    )} |`,
    "",
    "## Tier Definition",
    "",
    "- `stable`：代表版本段已通过 compat matrix，且 npm 路径具备启动前自修复。",
    "- `experimental`：已有局部验证或手动路径，但仍不承诺和 npm stable 同等级体验。",
    "- `unsupported`：当前不建议使用，文档只保留明确边界，不承诺修复路径。",
    "",
    "## Current Support",
    "",
    "| Channel | Tier | Version window | Representative verification | Notes |",
    "| --- | --- | --- | --- | --- |",
    `| npm global install | stable | ${renderRange(npmStable)} | ${renderRepresentativeStatus(
      npmStable.representatives,
      resultMap
    )} | ${npmStable.notes || "-"} |`,
    `| macOS official installer | ${macosTier} | ${renderRange(
      macosWindow
    )} | ${macosVerification} | ${macosWindow.notes || "-"} |`,
    ...(macosNativeExperimental && macosNativeExperimental.unsupported !== true
      ? [
          `| macOS native binary | experimental | ${renderRange(
            macosNativeExperimental
          )} | ${macosNativeExperimental.verification || renderRepresentativeStatus(
            macosNativeExperimental.representatives,
            resultMap
          )} | ${macosNativeExperimental.notes || "-"} |`,
        ]
      : []),
    `| Linux official installer | unsupported | ${renderRange(linuxUnsupported)} | - | ${linuxUnsupported.notes || "-"} |`,
    `| Windows / npm global install (PowerShell) | ${windowsNpmTier} | ${renderRange(
      windowsNpmWindow
    )} | - | ${windowsNpmWindow.notes || "-"} |`,
    `| Windows / native .exe / latest | unsupported | ${renderRange(
      windowsNativeUnsupported
    )} | - | ${windowsNativeUnsupported.notes || "-"} |`,
    "",
    "## Compatibility Matrix",
    "",
    "| Version | Package shape | Result | Runtime | 汉化显示审计 | Patch count | Residue |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...compat.results.map(
      (result) =>
        `| ${result.version} | ${result.kind || "-"} | ${renderResult(result.status)} | ${renderRuntime(
          result
        )} | ${renderDisplayAudit(result)} | ${result.patchCount} | ${renderResidue(result)} |`
    ),
    "",
    `Summary: ${compat.summary.pass} pass / ${compat.summary.fail} fail`,
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function main() {
  const config = loadJson(configPath);
  const compat = runCompatMatrix();
  const markdown = buildMarkdown(config, compat);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown);
  process.stdout.write(`${outputPath}\n`);
}

main();
