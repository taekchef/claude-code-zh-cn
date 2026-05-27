#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const defaultRepoRoot = path.resolve(__dirname, "..");
const closingKeywords = ["close", "closes", "closed", "fix", "fixes", "fixed", "resolve", "resolves", "resolved"];
const issueReference = String.raw`(?:#[0-9]+|[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+#[0-9]+|https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(?:issues|pull)/[0-9]+)`;
const autoClosePattern = new RegExp(String.raw`\b(${closingKeywords.join("|")})\b\s*:?\s+(${issueReference})`, "gi");

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {
    repoRoot: defaultRepoRoot,
    bodyEnv: null,
    bodyFile: null,
    repoFiles: false,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--repo-root":
        args.repoRoot = argv[++i];
        break;
      case "--body-env":
        args.bodyEnv = argv[++i];
        break;
      case "--body-file":
        args.bodyFile = argv[++i];
        break;
      case "--repo-files":
        args.repoFiles = true;
        break;
      case "--json":
        args.json = true;
        break;
      default:
        fail(`Unknown argument: ${arg}`);
    }
  }

  args.repoRoot = path.resolve(args.repoRoot);
  return args;
}

function walkFiles(root, predicate) {
  if (!fs.existsSync(root)) return [];

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath, predicate));
      continue;
    }

    if (entry.isFile() && predicate(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

function repoBodyEntrypoints(repoRoot) {
  const entries = [];
  const template = path.join(repoRoot, ".github", "pull_request_template.md");
  if (fs.existsSync(template)) entries.push(template);

  entries.push(
    ...walkFiles(path.join(repoRoot, ".github", "workflows"), (file) => /\.ya?ml$/i.test(file)),
    ...walkFiles(path.join(repoRoot, "scripts"), (file) => /\.(?:js|sh|md)$/i.test(file))
  );

  return [...new Set(entries)].sort();
}

function lineAndColumn(text, index) {
  const before = text.slice(0, index);
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function findAutoCloseReferences(text, source) {
  const matches = [];

  for (const match of text.matchAll(autoClosePattern)) {
    const position = lineAndColumn(text, match.index);
    matches.push({
      source,
      line: position.line,
      column: position.column,
      keyword: match[1],
      reference: match[2],
      snippet: match[0],
    });
  }

  return matches;
}

function readTextSource(source) {
  return fs.readFileSync(source, "utf8");
}

function collectSources(args) {
  const sources = [];

  if (args.repoFiles || (!args.bodyEnv && !args.bodyFile)) {
    for (const file of repoBodyEntrypoints(args.repoRoot)) {
      sources.push({ name: path.relative(args.repoRoot, file), text: readTextSource(file) });
    }
  }

  if (args.bodyFile) {
    const bodyFile = path.resolve(args.bodyFile);
    sources.push({ name: path.relative(args.repoRoot, bodyFile), text: readTextSource(bodyFile) });
  }

  if (args.bodyEnv) {
    sources.push({ name: `env:${args.bodyEnv}`, text: process.env[args.bodyEnv] || "" });
  }

  return sources;
}

function checkSources(sources) {
  const violations = [];

  for (const source of sources) {
    violations.push(...findAutoCloseReferences(source.text, source.name));
  }

  return {
    ok: violations.length === 0,
    checkedSources: sources.map((source) => source.name),
    violations,
  };
}

function printHuman(payload) {
  if (payload.ok) {
    console.log("pr-autoclose-guard: OK");
    console.log("No GitHub auto-close issue keywords were found in PR body entrypoints.");
    return;
  }

  console.log("pr-autoclose-guard: FAIL");
  console.log("Do not use GitHub issue auto-close keywords in PR descriptions for this repo.");
  console.log("Use `Related to #123` and close the issue only after reporter retest when needed.");
  console.log("");

  for (const violation of payload.violations) {
    console.log(
      `- ${violation.source}:${violation.line}:${violation.column} uses "${violation.snippet}"; write "Related to ${violation.reference}" instead.`
    );
  }
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const payload = checkSources(collectSources(args));

    if (args.json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      printHuman(payload);
    }

    process.exit(payload.ok ? 0 : 1);
  } catch (error) {
    console.error("pr-autoclose-guard: ERROR");
    console.error(error.message);
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  checkSources,
  closingKeywords,
  findAutoCloseReferences,
};
