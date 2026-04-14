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
  if (entry.floor && entry.ceiling) return `${entry.floor} - ${entry.ceiling}`;
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

function buildMarkdown(config, compat) {
  const resultMap = new Map(compat.results.map((entry) => [entry.version, entry]));
  const npmStable = config.support?.npm?.stable || {};
  const macosExperimental = config.support?.macosOfficialInstaller?.experimental || {};
  const linuxUnsupported = config.support?.linuxOfficialInstaller || {};
  const now = new Date();
  const generatedOn = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  const lines = [
    "# Support Matrix",
    "",
    `> Generated from \`scripts/upstream-compat.config.json\` + \`node scripts/verify-upstream-compat.js --json\` on ${generatedOn}.`,
    "",
    "## Tier Definition",
    "",
    "- `stable`：代表版本段已通过 compat matrix，且 npm 路径具备启动前自修复。",
    "- `experimental`：具备部分自动修复能力，但仍不承诺和 npm stable 同等级体验。",
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
    `| macOS official installer | experimental | ${renderRange(macosExperimental)} | ${renderRepresentativeStatus(
      macosExperimental.representatives,
      resultMap
    )} | ${macosExperimental.notes || "-"} |`,
    `| Linux official installer | unsupported | ${renderRange(linuxUnsupported)} | - | ${linuxUnsupported.notes || "-"} |`,
    "",
    "## Compatibility Matrix",
    "",
    "| Version | Result | Patch count | Residue |",
    "| --- | --- | --- | --- |",
    ...compat.results.map(
      (result) =>
        `| ${result.version} | ${result.status} | ${result.patchCount} | ${renderResidue(result)} |`
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
