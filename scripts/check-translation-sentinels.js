#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const defaultConfigPath = path.join(__dirname, "upstream-compat.config.json");

function parseArgs(argv) {
  const args = {
    config: defaultConfigPath,
    files: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      args.config = argv[++i];
      continue;
    }
    args.files.push(arg);
  }

  return args;
}

function loadSentinels(configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return (config.checks?.sentinels || []).map((entry, index) => {
    if (typeof entry === "string") {
      return { id: `sentinel_${index}`, pattern: entry };
    }
    return {
      id: entry.id,
      pattern: entry.pattern,
    };
  });
}

function scanFile(filePath, sentinels) {
  const text = fs.readFileSync(filePath, "utf8");
  const hits = [];
  for (const sentinel of sentinels) {
    if (sentinel.pattern && text.includes(sentinel.pattern)) {
      hits.push({
        file: filePath,
        id: sentinel.id,
        match: sentinel.pattern,
      });
    }
  }
  return hits;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.files.length === 0) {
    console.error("Usage: node scripts/check-translation-sentinels.js [--config path] <file> [file...]");
    process.exit(2);
  }

  const sentinels = loadSentinels(path.resolve(args.config));
  const hits = [];

  for (const file of args.files) {
    const target = path.resolve(file);
    if (!fs.existsSync(target)) {
      console.error(`missing file: ${target}`);
      process.exit(2);
    }
    hits.push(...scanFile(target, sentinels));
  }

  if (hits.length === 0) {
    console.log(`No sentinel hits across ${args.files.length} file(s).`);
    process.exit(0);
  }

  for (const hit of hits) {
    console.log(`HIT ${hit.id} ${hit.file} :: ${hit.match}`);
  }
  process.exit(1);
}

main();
