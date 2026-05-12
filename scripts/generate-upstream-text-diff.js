#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const isWindows = process.platform === "win32";
const repoRoot = path.resolve(__dirname, "..");
const defaultConfigPath = path.join(__dirname, "upstream-compat.config.json");
const binaryIoPath = path.join(repoRoot, "bun-binary-io.js");
const defaultTranslationsPath = path.join(repoRoot, "cli-translations.json");

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
    nativeMacosArm64: false,
    translations: defaultTranslationsPath,
    maxItems: 40,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--config":
        args.config = argv[++i];
        break;
      case "--fixtures-dir":
        args.fixturesDir = argv[++i];
        break;
      case "--packages-dir":
        args.packagesDir = argv[++i];
        break;
      case "--from":
        args.from = argv[++i];
        break;
      case "--to":
        args.to = argv[++i];
        break;
      case "--translations":
        args.translations = argv[++i];
        break;
      case "--native-macos-arm64":
        args.nativeMacosArm64 = true;
        break;
      case "--max-items":
        args.maxItems = Number.parseInt(argv[++i], 10);
        break;
      case "--json":
        args.json = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/generate-upstream-text-diff.js --to <version> [--from <version>] [--native-macos-arm64] [--json]",
    "",
    "Compares upstream JS string literals between two Claude Code versions and reports",
    "added/removed English text for translation review. When --from is omitted, the",
    "script uses the nearest previous verified version from upstream-compat.config.json.",
  ].join("\n");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function compareVersions(a, b) {
  const aParts = String(a).split(".").map((part) => Number.parseInt(part, 10));
  const bParts = String(b).split(".").map((part) => Number.parseInt(part, 10));
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i += 1) {
    const left = Number.isFinite(aParts[i]) ? aParts[i] : 0;
    const right = Number.isFinite(bParts[i]) ? bParts[i] : 0;
    if (left !== right) return left - right;
  }
  return String(a).localeCompare(String(b));
}

function resolvePreviousVersion(config, toVersion) {
  const nativeVersions = config.support?.macosNativeExperimental?.representatives || [];
  const baselineVersions = config.baseline?.versions || [];
  const candidates = [...nativeVersions, ...baselineVersions]
    .map(String)
    .filter((version) => compareVersions(version, toVersion) < 0)
    .sort(compareVersions);

  return candidates[candidates.length - 1] || null;
}

function findFixturePackage(fixturesDir, version) {
  const packageDir = path.join(fixturesDir, version, "package");
  if (fs.existsSync(packageDir)) return packageDir;

  const directDir = path.join(fixturesDir, version);
  if (fs.existsSync(directDir)) return directDir;

  fail(`Fixture package for version ${version} not found in ${fixturesDir}`);
}

function packageShapeError(packageDir) {
  if (!fs.existsSync(packageDir)) return "missing package/";
  if (fs.existsSync(path.join(packageDir, "cli.js"))) return null;
  if (fs.existsSync(path.join(packageDir, "claude"))) return null;
  if (fs.existsSync(path.join(packageDir, "bin", "claude.exe"))) return null;
  return "missing cli.js or native executable";
}

function resolvePackageName(config, args, version) {
  const nativeConfig = config.support?.macosNativeExperimental;
  if (
    args.nativeMacosArm64 &&
    nativeConfig?.packageName &&
    compareVersions(version, nativeConfig.floor || version) >= 0
  ) {
    return nativeConfig.packageName;
  }

  return config.packageName;
}

function downloadPackage(packageName, version, packagesDir) {
  const safePackageName = packageName.replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const versionRoot = path.join(packagesDir, `${safePackageName}-${version}`);
  const packageDir = path.join(versionRoot, "package");
  if (fs.existsSync(packageDir)) {
    const shapeError = packageShapeError(packageDir);
    if (!shapeError) return packageDir;
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

  const shapeError = packageShapeError(packageDir);
  if (shapeError) {
    fail(`Downloaded package ${packageName}@${version} is incomplete: ${shapeError}`);
  }

  return packageDir;
}

function resolvePackageDir(config, args, version) {
  if (args.fixturesDir) {
    return findFixturePackage(args.fixturesDir, version);
  }

  const packagesDir = args.packagesDir || path.join(os.tmpdir(), "claude-code-zh-cn-text-diff-cache");
  return downloadPackage(resolvePackageName(config, args, version), version, packagesDir);
}

function checkNativePlatform(args) {
  if (!args.nativeMacosArm64) {
    fail("Native package text diff requires --native-macos-arm64");
  }
  const platform = process.env.CCZH_NATIVE_VERIFY_PLATFORM || `${process.platform}-${process.arch}`;
  if (platform !== "darwin-arm64") {
    fail("Native package text diff requires macOS arm64");
  }
  const depStatus = execFile("node", [binaryIoPath, "check-deps"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (depStatus !== "ok") {
    fail("Native package text diff requires node-lief");
  }
}

function readPackageJs(config, args, version) {
  const packageDir = resolvePackageDir(config, args, version);
  const legacyCli = path.join(packageDir, "cli.js");
  if (fs.existsSync(legacyCli)) {
    return fs.readFileSync(legacyCli, "utf8");
  }

  const nativeBinary = path.join(packageDir, "claude");
  if (fs.existsSync(nativeBinary)) {
    checkNativePlatform(args);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-text-diff-"));
    const extracted = path.join(tmpDir, `${version}.js`);
    execFile("node", [binaryIoPath, "extract", nativeBinary, extracted], {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "pipe"],
    });
    return fs.readFileSync(extracted, "utf8");
  }

  fail(`Unsupported package shape for text diff: ${version}`);
}

function unescapeSimple(raw) {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\`/g, "`")
    .replace(/\\\$/g, "$")
    .replace(/\\"/g, "\"")
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

function skipQuotedExpressionPart(source, start) {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i += 1;
  }
  return source.length;
}

function skipTemplateExpression(source, start) {
  let depth = 1;
  let i = start + 2;
  while (i < source.length) {
    const char = source[i];
    if (char === "\\") {
      i += 2;
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      i = skipQuotedExpressionPart(source, i);
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return source.length;
}

function templateLiteralText(body) {
  let text = "";
  let i = 0;
  while (i < body.length) {
    if (body[i] === "\\") {
      text += body.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (body[i] === "$" && body[i + 1] === "{") {
      text += "${...}";
      i = skipTemplateExpression(body, i);
      continue;
    }
    text += body[i];
    i += 1;
  }
  return unescapeSimple(text);
}

function stringLiterals(source) {
  const literals = [];
  const pattern = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g;
  let match;
  while ((match = pattern.exec(source))) {
    const raw = match[0];
    const quote = raw[0];
    const body = raw.slice(1, -1);
    literals.push(normalizeText(quote === "`" ? templateLiteralText(body) : unescapeSimple(body)));
  }
  return literals.filter(Boolean);
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function looksLikeBuildMetadata(text) {
  if (/^[0-9a-f]{32,}$/i.test(text)) return true;
  return /\b(BUILD_TIME|GIT_SHA|ISSUES_EXPLAINER|PACKAGE_URL|README_URL|FEEDBACK_CHANNEL)\b/.test(text);
}

function looksLikeEmbeddedCode(text) {
  const codeHints = [
    "=>",
    "};",
    "){",
    "||",
    "&&",
    ".VERSION",
    "return}",
    "function ",
  ];
  if (codeHints.some((hint) => text.includes(hint))) return true;
  if (/^[),;{}.[\]\w$!?:<>=+\-*/&|'"` ]{40,}$/.test(text) && /[{}();=]/.test(text)) return true;
  return false;
}

function looksLikeReviewableEnglish(text) {
  if (text.length < 4 || text.length > 500) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (looksLikeBuildMetadata(text)) return false;
  if (looksLikeEmbeddedCode(text)) return false;
  if (/^[A-Z0-9_./:-]+$/.test(text)) return false;
  if (/^[a-z][a-z0-9-]*(\|[a-z][a-z0-9-]*)?$/.test(text)) return false;
  if (/^[./~]/.test(text)) return false;
  return true;
}

function collectInventory(source) {
  return [...new Set(stringLiterals(source).filter(looksLikeReviewableEnglish))].sort((a, b) => a.localeCompare(b));
}

function loadTranslations(translationsPath) {
  if (!translationsPath || !fs.existsSync(translationsPath)) return new Set();
  const entries = readJson(translationsPath);
  if (!Array.isArray(entries)) return new Set();
  return new Set(entries.map((entry) => entry?.en).filter((value) => typeof value === "string"));
}

function diffSets(fromItems, toItems) {
  const fromSet = new Set(fromItems);
  const toSet = new Set(toItems);
  return {
    added: toItems.filter((item) => !fromSet.has(item)),
    removed: fromItems.filter((item) => !toSet.has(item)),
  };
}

function buildPayload(config, args) {
  if (!args.to) {
    fail("--to is required");
  }

  const from = args.from || resolvePreviousVersion(config, args.to);
  if (!from) {
    fail(`Could not infer previous version for ${args.to}; pass --from explicitly`);
  }

  const fromInventory = collectInventory(readPackageJs(config, args, from));
  const toInventory = collectInventory(readPackageJs(config, args, args.to));
  const { added, removed } = diffSets(fromInventory, toInventory);
  const translated = loadTranslations(args.translations);
  const coveredByTranslations = added.filter((item) => translated.has(item));
  const needsTranslationReview = added.filter((item) => !translated.has(item));
  const sensitiveReview = needsTranslationReview.filter((item) =>
    /\b(approval|approve|permission|security|token|password|auth|proceed|danger|delete|review|sandbox)\b/i.test(item)
  );

  return {
    packageName: config.packageName,
    from,
    to: args.to,
    counts: {
      fromStrings: fromInventory.length,
      toStrings: toInventory.length,
      added: added.length,
      removed: removed.length,
      coveredByTranslations: coveredByTranslations.length,
      needsTranslationReview: needsTranslationReview.length,
      sensitiveReview: sensitiveReview.length,
    },
    added,
    removed,
    coveredByTranslations,
    needsTranslationReview,
    sensitiveReview,
  };
}

function renderList(items, maxItems) {
  if (items.length === 0) return ["- None"];
  const visible = items.slice(0, maxItems).map((item) => `- ${item}`);
  if (items.length > maxItems) {
    visible.push(`- ... ${items.length - maxItems} more`);
  }
  return visible;
}

function renderMarkdown(payload, maxItems) {
  return [
    `# Upstream text diff: ${payload.from} -> ${payload.to}`,
    "",
    `- Added upstream strings: ${payload.counts.added}`,
    `- Removed upstream strings: ${payload.counts.removed}`,
    `- Already covered by translations: ${payload.counts.coveredByTranslations}`,
    `- Needs translation review: ${payload.counts.needsTranslationReview}`,
    `- Sensitive review hints: ${payload.counts.sensitiveReview}`,
    "",
    "## Added strings needing review",
    ...renderList(payload.needsTranslationReview, maxItems),
    "",
    "## Added strings already covered",
    ...renderList(payload.coveredByTranslations, maxItems),
    "",
    "## Removed strings",
    ...renderList(payload.removed, maxItems),
    "",
  ].join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const config = readJson(path.resolve(args.config));
  const payload = buildPayload(config, args);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    process.stdout.write(renderMarkdown(payload, args.maxItems));
  }
}

try {
  main();
} catch (error) {
  console.error(`generate-upstream-text-diff: ${error.message}`);
  process.exit(1);
}
