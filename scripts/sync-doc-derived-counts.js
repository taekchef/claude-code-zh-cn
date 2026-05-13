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
    "- scripts/upstream-compat.config.json macOS native experimental window",
    "- macOS native patch/display counts from upstream compat verification",
    "",
  ].join("\n");
}

function readConfig() {
  return readJson(path.join(repoRoot, "scripts", "upstream-compat.config.json"));
}

function readStableRepresentative(config) {
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

function readCompatibilityMatrixRow(version) {
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
  if (!headers.includes("version")) {
    fail("docs/support-matrix.md Compatibility Matrix table must include a Version column");
  }

  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells[headers.indexOf("version")] !== version) {
      continue;
    }

    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  }

  fail(`docs/support-matrix.md is missing a compatibility row for ${version}`);
}

function readPatchCount(version) {
  const row = readCompatibilityMatrixRow(version);
  if ((row.result || "").toLowerCase() !== "pass") {
    fail(`npm stable representative ${version} is not passing in docs/support-matrix.md`);
  }

  const patchCount = Number.parseInt(row["patch count"], 10);
  if (!Number.isInteger(patchCount)) {
    fail(`docs/support-matrix.md has an invalid patch count for npm stable representative ${version}`);
  }
  return patchCount;
}

function readDisplayAudit(version) {
  const row = readCompatibilityMatrixRow(version);
  const audit = row["汉化显示审计"] || "";
  const match = audit.match(/^PASS \((\d+) surfaces\)$/);
  if (!match) {
    fail(`docs/support-matrix.md has an invalid display audit for ${version}: ${audit || "-"}`);
  }
  const total = Number.parseInt(match[1], 10);
  return { passed: total, total };
}

function parseVersion(value) {
  const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

function compactVersions(versions) {
  const groups = [];
  for (const version of versions.map(String)) {
    const parsed = parseVersion(version);
    const previousGroup = groups[groups.length - 1];
    const previousVersion = previousGroup ? parseVersion(previousGroup[previousGroup.length - 1]) : null;
    if (
      parsed &&
      previousVersion &&
      parsed.major === previousVersion.major &&
      parsed.minor === previousVersion.minor &&
      parsed.patch === previousVersion.patch + 1
    ) {
      previousGroup.push(version);
      continue;
    }
    groups.push([version]);
  }

  return groups.flatMap((group) => {
    if (group.length === 1) return group;
    return [`${group[0]} - ${group[group.length - 1]}`];
  });
}

function formatBacktickedList(segments) {
  return segments.map((segment) => `\`${segment}\``).join("、");
}

function parseNativeVerification(entry) {
  const verification = entry.verification || "";
  const patchCounts = [...verification.matchAll(/native\s+(\d+)/g)].map((match) =>
    Number.parseInt(match[1], 10)
  );
  if (patchCounts.length === 0) {
    fail("macOS native experimental verification must include native patch counts");
  }

  const displayPairs = [...verification.matchAll(/display\s+(\d+)\/(\d+)/g)].map((match) => [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
  ]);
  if (displayPairs.length === 0) {
    fail("macOS native experimental verification must include display audit counts");
  }

  const uniqueDisplayPairs = new Set(displayPairs.map((pair) => pair.join("/")));
  if (uniqueDisplayPairs.size !== 1) {
    fail("macOS native experimental display audit counts must be consistent before syncing README");
  }

  const [displayPassed, displayTotal] = displayPairs[0];
  return {
    patchMin: Math.min(...patchCounts),
    patchMax: Math.max(...patchCounts),
    displayPassed,
    displayTotal,
  };
}

function readNativeFacts(config) {
  const entry = config.support?.macosNativeExperimental;
  if (!entry || entry.unsupported) {
    return null;
  }
  if (!entry.floor || !entry.ceiling) {
    fail("macOS native experimental config must define floor and ceiling");
  }
  if (!Array.isArray(entry.representatives) || entry.representatives.length === 0) {
    fail("macOS native experimental config must define representatives");
  }

  const verification = parseNativeVerification(entry);
  const excluded = Array.isArray(entry.excluded) ? entry.excluded.map(String) : [];
  const compactSegments = compactVersions(entry.representatives);
  return {
    floor: String(entry.floor),
    ceiling: String(entry.ceiling),
    range: `${entry.floor} - ${entry.ceiling}`,
    badgeRange: `${entry.floor}--${entry.ceiling}`,
    excluded,
    excludedPrimary: excluded[0] || "",
    excludedBackticked: formatBacktickedList(excluded),
    englishExcludedBackticked: excluded.map((version) => `\`${version}\``).join(", "),
    compactSegments,
    compactBackticked: formatBacktickedList(compactSegments),
    patchRange: `${verification.patchMin}-${verification.patchMax}`,
    displayPassed: verification.displayPassed,
    displayTotal: verification.displayTotal,
  };
}

function loadDerivedCounts() {
  const config = readConfig();
  const stableRepresentative = readStableRepresentative(config);

  return {
    uiTranslations: countArray("cli-translations.json", null, "UI translations"),
    spinnerVerbs: countArray("verbs/zh-CN.json", "verbs", "spinner verbs"),
    spinnerTips: countArray("tips/zh-CN.json", "tips", "spinner tips"),
    stableRepresentative,
    stablePatchCount: readPatchCount(stableRepresentative),
    stableDisplayAudit: readDisplayAudit(stableRepresentative),
    macosNative: readNativeFacts(config),
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
        /(patch 硬编码文字（)\d+( 条翻译；当前 stable 代表版本 `)[^`]+(` 实测 )\d+( 处有效 patch，显示审计 )\d+\/\d+( PASS）)/g,
        (_, before, middle, after, auditPrefix, suffix) =>
          `${before}${counts.uiTranslations}${middle}${counts.stableRepresentative}${after}${counts.stablePatchCount}${auditPrefix}${counts.stableDisplayAudit.passed}/${counts.stableDisplayAudit.total}${suffix}`
      ),
      rule(
        "install native patch summary facts",
        /(在 macOS native experimental 已验证版本上 patch 硬编码文字（).+?( 实测 )\d+-\d+( 处，显示审计 )\d+\/\d+( PASS）)/g,
        (_, before, middle, after, suffix) =>
          `${before}${counts.macosNative.compactBackticked}${middle}${counts.macosNative.patchRange}${after}${counts.macosNative.displayPassed}/${counts.macosNative.displayTotal}${suffix}`
      ),
      rule(
        "coverage UI patch row counts",
        /(\| UI 文字中文化 \| )\d+( 条翻译，`)[^`]+(` 实测 )\d+( 处有效 patch；macOS native experimental ).+?( 实测 )\d+-\d+( 处；固定显示面审计均为 )\d+\/\d+( PASS \|)/g,
        (_, before, middle, stableAfter, nativeMiddle, nativeAfter, auditPrefix, suffix) =>
          `${before}${counts.uiTranslations}${middle}${counts.stableRepresentative}${stableAfter}${counts.stablePatchCount}${nativeMiddle}${counts.macosNative.compactBackticked}${nativeAfter}${counts.macosNative.patchRange}${auditPrefix}${counts.macosNative.displayPassed}/${counts.macosNative.displayTotal}${suffix}`
      ),
      rule(
        "coverage UI patch row counts native skipped",
        /(\| UI 文字中文化 \| )\d+( 条翻译，`)[^`]+(` 实测 )\d+( 处有效 patch；macOS native \/ Mach-O 默认跳过二进制改写 \|)/g,
        (_, before, middle, after, suffix) =>
          `${before}${counts.uiTranslations}${middle}${counts.stableRepresentative}${after}${counts.stablePatchCount}${suffix}`
      ),
      rule(
        "macOS native badge window",
        /(macos%20native-)[0-9.]+--[0-9.]+(%20experimental-yellow)/g,
        (_, before, after) => `${before}${counts.macosNative.badgeRange}${after}`
      ),
      rule(
        "macOS native support table facts",
        /(\| macOS \/ native binary \| `experimental` \| `)[^`]+(`（不含未纳入本轮支持的 ).+?(） \| 当前 macOS arm64 native 已验证 extract \/ patch \/ repack \/ `--version` \+ )\d+( 个稳定显示面审计)/g,
        (_, before, excludedBefore, excludedAfter, auditSuffix) =>
          `${before}${counts.macosNative.range}${excludedBefore}${counts.macosNative.excludedBackticked}${excludedAfter}${counts.macosNative.displayTotal}${auditSuffix}`
      ),
      rule(
        "macOS native latest note facts",
        /(已验证 )`[^`]+`(?:、`[^`]+`)*( 的二进制改写链路和 )\d+( 个稳定显示面。).+?( 未纳入本轮支持)/g,
        (_, before, middle, auditSuffix) =>
          `${before}${counts.macosNative.compactBackticked}${middle}${counts.macosNative.displayTotal}${auditSuffix}${counts.macosNative.excludedBackticked} 未纳入本轮支持`
      ),
      rule(
        "macOS native install option facts",
        /(\| Claude Code native binary `)[^`]+(`（macOS arm64，不含未纳入本轮支持的 ).+?(） \| 当前已验证的 native binary 版本，显示审计 )\d+\/\d+( PASS \| `experimental`（需要 `node-lief`） \|)/g,
        (_, before, excludedBefore, excludedAfter, suffix) =>
          `${before}${counts.macosNative.range}${excludedBefore}${counts.macosNative.excludedBackticked}${excludedAfter}${counts.macosNative.displayPassed}/${counts.macosNative.displayTotal}${suffix}`
      ),
      rule(
        "native binary note audit facts",
        /(；)`[^`]+`(?:、`[^`]+`)*( 额外通过 )\d+( 个稳定显示面审计。)/g,
        (_, before, middle, after) =>
          `${before}${counts.macosNative.compactBackticked}${middle}${counts.macosNative.displayTotal}${after}`
      ),
      rule(
        "FAQ native support facts",
        /(macOS arm64 native binary 走 experimental 通道，已验证 )`[^`]+`(?:、`[^`]+`)*( 的二进制改写链路和 )\d+( 个稳定显示面；).+?( (?:未纳入本轮支持|官方未发布))/g,
        (_, before, middle, auditSuffix) =>
          `${before}${counts.macosNative.compactBackticked}${middle}${counts.macosNative.displayTotal}${auditSuffix}${counts.macosNative.excludedBackticked} 未纳入本轮支持`
      ),
      rule(
        "English native summary range",
        /(from `)[^`]+(` through `)[^`]+(` except (?:unsupported|unpublished) ).+?(, now guarded)/g,
        (_, before, middle, _excludedBefore, after) =>
          `${before}${counts.macosNative.floor}${middle}${counts.macosNative.ceiling}\` except unsupported ${counts.macosNative.englishExcludedBackticked}${after}`
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
    const nativeRule = /native|macOS native|English native|install native|FAQ native/.test(entry.label) ||
      entry.label === "coverage UI patch row counts";
    if (matches === 0 && !(nativeRule && !counts.macosNative)) {
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
    `stableDisplayAudit=${counts.stableDisplayAudit.passed}/${counts.stableDisplayAudit.total}`,
    counts.macosNative
      ? `macosNative=${counts.macosNative.range} excluded=${counts.macosNative.excluded.join(",") || "-"} patchRange=${counts.macosNative.patchRange} display=${counts.macosNative.displayPassed}/${counts.macosNative.displayTotal}`
      : "macosNative=-",
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
