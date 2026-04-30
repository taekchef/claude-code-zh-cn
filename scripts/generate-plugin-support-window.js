#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const defaultConfigPath = path.join(__dirname, "upstream-compat.config.json");
const defaultOutputPath = path.join(repoRoot, "plugin", "support-window.json");

function parseArgs(argv) {
  const args = {
    config: defaultConfigPath,
    output: defaultOutputPath,
    write: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--config":
        args.config = path.resolve(argv[++i]);
        break;
      case "--output":
        args.output = path.resolve(argv[++i]);
        break;
      case "--write":
        args.write = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function requireEntry(entry, label) {
  if (!entry || typeof entry !== "object") {
    throw new Error(`Missing support entry: ${label}`);
  }
  return entry;
}

function versionsFrom(entry) {
  return Array.isArray(entry.representatives) ? entry.representatives.map(String) : [];
}

function buildSupportWindow(config) {
  const npmStable = requireEntry(config.support?.npm?.stable, "support.npm.stable");
  const macosOfficial = config.support?.macosOfficialInstaller?.experimental || null;
  const macosNative = config.support?.macosNativeExperimental || null;

  const payload = {
    legacyNpmStable: {
      floor: npmStable.floor,
      ceiling: npmStable.ceiling,
      versions: versionsFrom(npmStable),
    },
  };

  if (macosOfficial && macosOfficial.unsupported !== true) {
    payload.macosNativeOfficialInstallerExperimental = {
      floor: macosOfficial.floor,
      ceiling: macosOfficial.ceiling,
      versions: versionsFrom(macosOfficial),
      platform: macosOfficial.platform || "darwin-arm64",
      requires: macosOfficial.requires || ["node-lief"],
    };
  }

  if (macosNative && macosNative.unsupported !== true) {
    payload.macosNativeExperimental = {
      floor: macosNative.floor,
      ceiling: macosNative.ceiling,
      versions: versionsFrom(macosNative),
      platform: macosNative.platform || "darwin-arm64",
      packageName: macosNative.packageName || "@anthropic-ai/claude-code-darwin-arm64",
      requires: macosNative.requires || ["node-lief"],
    };
  }

  return payload;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = readJson(args.config);
  const json = `${JSON.stringify(buildSupportWindow(config), null, 2)}\n`;

  if (args.write) {
    fs.mkdirSync(path.dirname(args.output), { recursive: true });
    fs.writeFileSync(args.output, json);
  }

  process.stdout.write(json);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`generate-plugin-support-window: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildSupportWindow,
};
