#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const defaultRoot = path.resolve(__dirname, "..");

function usage() {
  return [
    "Usage: node scripts/verify-settings-sources.js [--root <repoRoot>]",
    "",
    "Checks that settings-overlay.json does not duplicate spinner verbs or tips.",
  ].join("\n");
}

function parseArgs(argv) {
  let root = defaultRoot;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (arg === "--root") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("--root requires a path");
      }
      root = path.resolve(value);
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return root;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(root, relativePath, errors) {
  const filePath = path.join(root, relativePath);

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${relativePath} could not be read as JSON: ${error.message}`);
    return null;
  }
}

function validateSettingsOverlay(settingsOverlay, errors) {
  if (!isObject(settingsOverlay)) {
    errors.push("settings-overlay.json must contain a JSON object");
    return;
  }

  const forbiddenKeys = new Map([
    ["spinnerVerbs", "verbs/zh-CN.json"],
    ["spinnerTipsOverride", "tips/zh-CN.json"],
  ]);

  for (const [key, sourceFile] of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(settingsOverlay, key)) {
      errors.push(`settings-overlay.json must not contain ${key}; keep this data in ${sourceFile}`);
    }
  }
}

function validateVerbs(verbsConfig, errors) {
  if (!isObject(verbsConfig)) {
    errors.push("verbs/zh-CN.json must contain a JSON object");
    return 0;
  }
  if (!Array.isArray(verbsConfig.verbs)) {
    errors.push("verbs/zh-CN.json must contain a verbs array");
    return 0;
  }

  for (let i = 0; i < verbsConfig.verbs.length; i += 1) {
    const verb = verbsConfig.verbs[i];
    if (typeof verb !== "string" || verb.trim() === "") {
      errors.push(`verbs/zh-CN.json verbs[${i}] must be a non-empty string`);
    }
  }

  return verbsConfig.verbs.length;
}

function validateTips(tipsConfig, errors) {
  if (!isObject(tipsConfig)) {
    errors.push("tips/zh-CN.json must contain a JSON object");
    return 0;
  }
  if (!Array.isArray(tipsConfig.tips)) {
    errors.push("tips/zh-CN.json must contain a tips array");
    return 0;
  }

  for (let i = 0; i < tipsConfig.tips.length; i += 1) {
    const tip = tipsConfig.tips[i];
    if (!isObject(tip)) {
      errors.push(`tips/zh-CN.json tips[${i}] must be an object`);
      continue;
    }
    if (typeof tip.id !== "string" || tip.id.trim() === "") {
      errors.push(`tips/zh-CN.json tips[${i}].id must be a non-empty string`);
    }
    if (typeof tip.text !== "string" || tip.text.trim() === "") {
      errors.push(`tips/zh-CN.json tips[${i}].text must be a non-empty string`);
    }
  }

  return tipsConfig.tips.length;
}

function main() {
  let root;
  try {
    root = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    process.exit(2);
  }

  const errors = [];
  const settingsOverlay = readJson(root, "settings-overlay.json", errors);
  const verbsConfig = readJson(root, path.join("verbs", "zh-CN.json"), errors);
  const tipsConfig = readJson(root, path.join("tips", "zh-CN.json"), errors);

  if (settingsOverlay !== null) {
    validateSettingsOverlay(settingsOverlay, errors);
  }

  const verbCount = verbsConfig === null ? 0 : validateVerbs(verbsConfig, errors);
  const tipCount = tipsConfig === null ? 0 : validateTips(tipsConfig, errors);

  if (errors.length > 0) {
    process.stderr.write(`settings data source check failed:\n- ${errors.join("\n- ")}\n`);
    process.exit(1);
  }

  process.stdout.write(`settings data sources OK: ${verbCount} verbs, ${tipCount} tips\n`);
}

main();
