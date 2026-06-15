#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const platforms = {
  macos: {
    label: "macOS",
    verifyFlag: "--native-macos-arm64",
  },
  windows: {
    label: "Windows",
    verifyFlag: "--native-windows-x64",
  },
};

function parseArgs(argv) {
  const args = {
    platform: "macos",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--candidate":
        args.candidate = path.resolve(argv[++i]);
        break;
      case "--platform":
        args.platform = argv[++i];
        break;
      case "--text-report":
        args.textReport = path.resolve(argv[++i]);
        break;
      case "--run-url":
        args.runUrl = argv[++i];
        break;
      case "--head-sha":
        args.headSha = argv[++i];
        break;
      case "--output":
        args.output = path.resolve(argv[++i]);
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/prepare-native-failure-handoff.js --candidate candidate.json --output report.md [--platform macos|windows] [--text-report report.md] [--run-url URL] [--head-sha SHA]",
    "",
    "Writes a maintainer handoff report for a failed native latest candidate.",
    "",
  ].join("\n");
}

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readOptionalText(file) {
  if (!file || !fs.existsSync(file)) return "";
  return fs.readFileSync(file, "utf8");
}

function platformDescriptor(platformName) {
  const descriptor = platforms[platformName];
  if (!descriptor) {
    fail(`--platform must be one of ${Object.keys(platforms).join(", ")}, got ${platformName || "unknown"}`);
  }
  return descriptor;
}

function singleResult(candidate) {
  const results = Array.isArray(candidate.results) ? candidate.results : [];
  if (results.length !== 1) {
    fail(`candidate JSON must contain exactly one result, got ${results.length}`);
  }
  return results[0];
}

function textValue(value) {
  return String(value || "unknown");
}

function truncate(text, maxLength = 12000) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trimEnd()}\n\n... truncated ...\n`;
}

function renderIssue(issue) {
  return [
    `- \`${textValue(issue.id)}\` (\`${textValue(issue.command)}\`, ${textValue(issue.kind)})`,
    "",
    "  ```text",
    `  ${textValue(issue.match)}`,
    "  ```",
  ].join("\n");
}

function renderReport({ candidate, result, textReport, runUrl, headSha, platformName }) {
  const platform = platformDescriptor(platformName);
  const native = result.nativeVerification || {};
  const audit = result.displayAudit || {};
  const issues = Array.isArray(audit.issues) ? audit.issues : [];
  const textDiff = truncate(String(textReport || "").trimEnd());
  const version = textValue(result.version);

  return [
    `# ${platform.label} native latest candidate failure: ${version}`,
    "",
    `- Run: ${runUrl || "unknown"}`,
    `- Head SHA: \`${headSha || "unknown"}\``,
    `- Status: \`${textValue(result.status)}\``,
    `- Candidate kind: \`${textValue(result.kind)}\``,
    `- Native: \`${textValue(native.platform)}\` / \`${textValue(native.extract)}\` / \`${textValue(native.repack)}\` / \`${textValue(native.codeSignature)}\``,
    `- Display audit: \`${textValue(audit.status)}\` (${Number.isInteger(audit.issueCount) ? audit.issueCount : issues.length} issues / ${textValue(audit.commandCount)} commands)`,
    "",
    "## What Failed",
    "",
    result.status === "pass"
      ? "- Candidate verification passed, but the workflow failed after candidate verification. Inspect the run log before promoting."
      : `- Candidate verification did not pass: \`status=${textValue(result.status)}\`.`,
    audit.status && audit.status !== "pass"
      ? `- Display audit did not pass: \`status=${audit.status}\`.`
      : "- Display audit did not report additional failures.",
    candidate.summary
      ? `- Summary: pass=${candidate.summary.pass || 0}, fail=${candidate.summary.fail || 0}, skip=${candidate.summary.skip || 0}.`
      : "- Summary: unavailable.",
    "",
    "## Display Audit Issues",
    "",
    issues.length > 0 ? issues.map(renderIssue).join("\n\n") : "- No display audit issues were reported.",
    "",
    "## Text Diff Excerpt",
    "",
    textDiff
      ? ["```markdown", textDiff, "```"].join("\n")
      : "- Text diff report was unavailable; use the artifact from the workflow run.",
    "",
    "## Takeover Commands",
    "",
    "```bash",
    `node scripts/verify-upstream-compat.js --baseline ${version} --skip-latest ${platform.verifyFlag} --json`,
    `node scripts/generate-upstream-text-diff.js --to ${version} ${platform.verifyFlag}`,
    `node scripts/promote-native-candidate.js --candidate <candidate-json> --platform ${platformName}`,
    "```",
    "",
    "## Done Criteria",
    "",
    "- Add the missing source-of-truth translations or guard fix on this branch.",
    "- Re-run the native latest candidate workflow for this version.",
    "- Only promote support metadata after native verification and display audit pass.",
    "- Remove or update this handoff report before marking the PR ready.",
    "",
  ].join("\n");
}

function prepareHandoff(args) {
  platformDescriptor(args.platform);
  if (!args.candidate) fail("--candidate is required");
  if (!args.output) fail("--output is required");

  const candidate = readJson(args.candidate);
  const result = singleResult(candidate);
  const audit = result.displayAudit || {};

  if (result.status === "pass" && audit.status === "pass") {
    fail(`candidate is not failed: ${result.version || "unknown"}`);
  }

  const textReport = readOptionalText(args.textReport);
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(
    args.output,
    renderReport({
      candidate,
      result,
      textReport,
      runUrl: args.runUrl,
      headSha: args.headSha,
      platformName: args.platform,
    })
  );

  return result.version || "unknown";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const version = prepareHandoff(args);
  const platform = platformDescriptor(args.platform);
  process.stdout.write(`prepared ${platform.label} native failure handoff for ${version}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`prepare-native-failure-handoff: ${error.message}`);
    process.exit(1);
  }
}
