#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// patch revision 指纹只包含真正影响 patch 行为的文件。
// 注意：不含 manifest.json（插件版本号变化不应触发 re-patch）。
// 此列表是唯一权威来源；compute-patch-revision.sh / install.ps1 / session-start.ps1
// 中的副本必须与此保持一致（由 tests/install-json-helper.test.js 守护）。
const PATCH_REVISION_FILES = [
  "patch-cli.sh",
  "patch-cli.js",
  "cli-translations.json",
  "bun-binary-io.js",
  "compute-patch-revision.sh",
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(result[key]) && isPlainObject(value)) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function buildOverlay(baseFile, verbsFile, tipsFile) {
  const base = readJson(baseFile);
  const verbs = readJson(verbsFile);
  const tips = readJson(tipsFile);

  base.spinnerVerbs = verbs;
  base.spinnerTipsOverride = {
    excludeDefault: true,
    tips: (tips.tips || []).map((tip) => tip.text),
  };

  return base;
}

function mergeSettings(settingsFile, overlayFile) {
  const settings = readJson(settingsFile);
  const overlay = readJson(overlayFile);
  fs.writeFileSync(settingsFile, `${JSON.stringify(deepMerge(settings, overlay), null, 2)}\n`);
}

function patchRevision(root) {
  const hash = crypto.createHash("sha256");

  for (const file of PATCH_REVISION_FILES) {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) continue;
    hash.update(file);
    hash.update("\0");
    hash.update(fs.readFileSync(target));
    hash.update("\0");
  }

  return hash.digest("hex").slice(0, 16);
}

function usage() {
  console.error(
    [
      "Usage:",
      "  install-json-helper.js build-overlay <base.json> <verbs.json> <tips.json>",
      "  install-json-helper.js deep-merge-settings <settings.json> <overlay.json>",
      "  install-json-helper.js patch-revision <plugin-root>",
    ].join("\n")
  );
}

function main(argv) {
  const [command, ...args] = argv;

  if (command === "build-overlay" && args.length === 3) {
    process.stdout.write(JSON.stringify(buildOverlay(args[0], args[1], args[2])));
    return;
  }

  if (command === "deep-merge-settings" && args.length === 2) {
    mergeSettings(args[0], args[1]);
    process.stdout.write("ok");
    return;
  }

  if (command === "patch-revision" && args.length === 1) {
    process.stdout.write(patchRevision(args[0]));
    return;
  }

  usage();
  process.exit(64);
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = {
  buildOverlay,
  deepMerge,
  mergeSettings,
  patchRevision,
};
