#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const defaultDocs = ["README.md", "AGENTS.md", "CLAUDE.md"].map((file) => path.join(repoRoot, file));

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function countArray(file, key, label) {
  const data = readJson(path.join(repoRoot, file));
  const list = key ? data[key] : data;
  if (!Array.isArray(list)) {
    fail(`${label} source must be an array: ${file}${key ? `#${key}` : ""}`);
  }
  return list.length;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseArgs(argv) {
  const args = {
    write: false,
    docs: [],
  };

  for (const arg of argv) {
    if (arg === "--write") {
      args.write = true;
      continue;
    }
    if (arg === "--check") {
      args.write = false;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }
    args.docs.push(path.resolve(repoRoot, arg));
  }

  if (args.docs.length === 0) {
    args.docs = defaultDocs;
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/sync-doc-derived-counts.js [--check|--write] [docs...]",
    "",
    "Checks or rewrites README / AGENTS / CLAUDE derived counts from source files.",
    "Sources:",
    "- cli-translations.json array length",
    "- verbs/zh-CN.json verbs length",
    "- tips/zh-CN.json tips length",
    "- scripts/upstream-compat.config.json stable representative",
    "- docs/support-matrix.md generated patch count",
    "",
  ].join("\n");
}

function readStableRepresentative() {
  const config = readJson(path.join(repoRoot, "scripts", "upstream-compat.config.json"));
  const stable = config.support?.npm?.stable || {};
  const representatives = Array.isArray(stable.representatives) ? stable.representatives : [];
  const version = representatives[representatives.length - 1] || stable.ceiling;

  if (!version) {
    fail("scripts/upstream-compat.config.json must define npm stable representatives or ceiling");
  }
  if (stable.ceiling && version !== stable.ceiling) {
    fail(
      `npm stable ceiling (${stable.ceiling}) must match the last representative (${version}) before syncing docs`
    );
  }

  return version;
}

function readPatchCount(version) {
  const matrixPath = path.join(repoRoot, "docs", "support-matrix.md");
  const matrix = fs.readFileSync(matrixPath, "utf8");

  const lines = matrix.split(/\r?\n/);
  const headerIndex = lines.findIndex(
    (line) => line.includes("| Version |") && line.includes("| Patch count |")
  );
  if (headerIndex === -1) {
    fail("docs/support-matrix.md is missing a Compatibility Matrix table with Version and Patch count columns");
  }

  const headers = lines[headerIndex]
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim().toLowerCase());
  const versionIndex = headers.indexOf("version");
  const resultIndex = headers.indexOf("result");
  const patchCountIndex = headers.indexOf("patch count");
  if (versionIndex === -1 || resultIndex === -1 || patchCountIndex === -1) {
    fail("docs/support-matrix.md Compatibility Matrix table must include Version, Result, and Patch count columns");
  }

  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells[versionIndex] !== version) {
      continue;
    }
    if (cells[resultIndex].toLowerCase() !== "pass") {
      fail(`npm stable representative ${version} is not passing in docs/support-matrix.md`);
    }
    const patchCount = Number.parseInt(cells[patchCountIndex], 10);
    if (!Number.isInteger(patchCount)) {
      fail(`docs/support-matrix.md has an invalid patch count for npm stable representative ${version}`);
    }
    return patchCount;
  }

  fail(`docs/support-matrix.md is missing a patch-count row for npm stable representative ${version}`);
}

function loadDerivedCounts() {
  const stableRepresentative = readStableRepresentative();

  return {
    uiTranslations: countArray("cli-translations.json", null, "UI translations"),
    spinnerVerbs: countArray("verbs/zh-CN.json", "verbs", "spinner verbs"),
    spinnerTips: countArray("tips/zh-CN.json", "tips", "spinner tips"),
    stableRepresentative,
    stablePatchCount: readPatchCount(stableRepresentative),
  };
}

function rule(label, regex, replace) {
  return { label, regex, replace };
}

function rulesForDoc(file, counts) {
  const basename = path.basename(file);

  if (basename === "AGENTS.md" || basename === "CLAUDE.md") {
    return [
      rule(
        "cli-translations.json UI translation count",
        /(`cli-translations\.json`\s+—\s+)\d+( 条 UI 翻译对照表)/g,
        (_, before, after) => `${before}${counts.uiTranslations}${after}`
      ),
      rule(
        "verbs/zh-CN.json spinner verb count",
        /(`verbs\/zh-CN\.json`\s+—\s+)\d+( 个 spinner 动词翻译)/g,
        (_, before, after) => `${before}${counts.spinnerVerbs}${after}`
      ),
      rule(
        "tips/zh-CN.json spinner tip count",
        /(`tips\/zh-CN\.json`\s+—\s+)\d+( 条 spinner 提示翻译)/g,
        (_, before, after) => `${before}${counts.spinnerTips}${after}`
      ),
    ];
  }

  if (basename === "README.md") {
    return [
      rule(
        "hero spinner summary counts",
        /(\n)\d+( 个趣味 spinner 动词，)\d+( 条中文提示，回复耗时中文化)/g,
        (_, lineStart, verbSuffix, tipSuffix) =>
          `${lineStart}${counts.spinnerVerbs}${verbSuffix}${counts.spinnerTips}${tipSuffix}`
      ),
      rule(
        "complete spinner verb count",
        /(> 完整 )\d+( 个翻译见 \[verbs\/zh-CN\.json\])/g,
        (_, before, after) => `${before}${counts.spinnerVerbs}${after}`
      ),
      rule(
        "coverage spinner verb row count",
        /(\| Spinner 动词 \| )\d+( 个 \| `spinnerVerbs` \|)/g,
        (_, before, after) => `${before}${counts.spinnerVerbs}${after}`
      ),
      rule(
        "coverage spinner tip row count",
        /(\| Spinner 提示 \| )\d+( 条 \| `spinnerTipsOverride` \|)/g,
        (_, before, after) => `${before}${counts.spinnerTips}${after}`
      ),
      rule(
        "install CLI patch summary counts",
        /(patch 硬编码文字（)\d+( 条翻译；当前 stable 代表版本 `)[^`]+(` 实测 )\d+( 处有效 patch[^）]*）)/g,
        (_, before, middle, after, suffix) =>
          `${before}${counts.uiTranslations}${middle}${counts.stableRepresentative}${after}${counts.stablePatchCount}${suffix}`
      ),
      rule(
        "coverage UI patch row counts",
        /(\| UI 文字中文化 \| )\d+( 条翻译，`)[^`]+(` 实测 )\d+( 处有效 patch[^|]*\|)/g,
        (_, before, middle, after, suffix) =>
          `${before}${counts.uiTranslations}${middle}${counts.stableRepresentative}${after}${counts.stablePatchCount}${suffix}`
      ),
      rule(
        "project tree UI translation count",
        /(\bcli-translations\.json\s+←\s+)\d+( 条 UI 翻译对照表)/g,
        (_, before, after) => `${before}${counts.uiTranslations}${after}`
      ),
      rule(
        "English summary counts",
        /(It translates )\d+( spinner verbs, )\d+( spinner tips, )\d+( UI translations,)/g,
        (_, before, verbSuffix, tipSuffix, uiSuffix) =>
          `${before}${counts.spinnerVerbs}${verbSuffix}${counts.spinnerTips}${tipSuffix}${counts.uiTranslations}${uiSuffix}`
      ),
    ];
  }

  fail(`unsupported doc for derived count sync: ${file}`);
}

function applyRules(file, text, counts) {
  const missing = [];
  let next = text;

  for (const entry of rulesForDoc(file, counts)) {
    let matches = 0;
    next = next.replace(entry.regex, (...args) => {
      matches += 1;
      return entry.replace(...args);
    });
    if (matches === 0) {
      missing.push(entry.label);
    }
  }

  return { text: next, missing };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const counts = loadDerivedCounts();
  const stale = [];
  const missing = [];
  const updated = [];

  for (const file of args.docs) {
    const original = fs.readFileSync(file, "utf8");
    const result = applyRules(file, original, counts);

    if (result.missing.length > 0) {
      missing.push({ file, labels: result.missing });
      continue;
    }

    if (result.text !== original) {
      if (args.write) {
        fs.writeFileSync(file, result.text);
        updated.push(file);
      } else {
        stale.push(file);
      }
    }
  }

  if (missing.length > 0) {
    for (const entry of missing) {
      console.error(`${path.relative(repoRoot, entry.file)}: missing derived count anchors: ${entry.labels.join(", ")}`);
    }
    process.exit(1);
  }

  if (stale.length > 0) {
    for (const file of stale) {
      console.error(`${path.relative(repoRoot, file)}: derived counts are stale`);
    }
    console.error("run `node scripts/sync-doc-derived-counts.js --write` to refresh README / AGENTS / CLAUDE");
    process.exit(1);
  }

  const summary = [
    `uiTranslations=${counts.uiTranslations}`,
    `spinnerVerbs=${counts.spinnerVerbs}`,
    `spinnerTips=${counts.spinnerTips}`,
    `stableRepresentative=${counts.stableRepresentative}`,
    `stablePatchCount=${counts.stablePatchCount}`,
  ].join(" ");

  if (updated.length > 0) {
    process.stdout.write(`doc derived counts updated: ${updated.map((file) => path.relative(repoRoot, file)).join(", ")}\n`);
  }
  process.stdout.write(`doc derived counts OK: ${summary}\n`);
}

try {
  main();
} catch (error) {
  console.error(`sync-doc-derived-counts: ${error.message}`);
  process.exit(1);
}
