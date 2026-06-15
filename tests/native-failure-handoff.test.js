const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const handoffScript = path.join(repoRoot, "scripts", "prepare-native-failure-handoff.js");

function fixtureCandidate({ status = "fail", auditStatus = "fail" } = {}) {
  return {
    packageName: "@anthropic-ai/claude-code",
    baseline: ["2.1.143"],
    results: [
      {
        version: "2.1.143",
        kind: "native",
        status,
        patchCount: 1316,
        residue: [],
        missingRequired: [],
        nativeVerification: {
          packageName: "@anthropic-ai/claude-code-darwin-arm64",
          platform: "darwin-arm64",
          detect: "native-bun",
          extract: "ok",
          repack: "ok",
          codeSignature: "ok",
          versionOutput: "2.1.143 (Claude Code)",
        },
        displayAudit: {
          status: auditStatus,
          commandCount: 11,
          issueCount: auditStatus === "fail" ? 2 : 0,
          commands: [
            {
              id: "agents_help",
              args: ["agents", "--help"],
              status: 0,
              audit: auditStatus,
              issueCount: auditStatus === "fail" ? 2 : 0,
            },
          ],
          issues:
            auditStatus === "fail"
              ? [
                  {
                    kind: "display-untranslated-line",
                    id: "agents_help_line_6",
                    command: "agents_help",
                    match: "--add-dir <directory>                 Additional directory to allow tool",
                  },
                  {
                    kind: "display-untranslated-line",
                    id: "agents_help_line_7",
                    command: "agents_help",
                    match: "access to in dispatched sessions",
                  },
                ]
              : [],
        },
      },
    ],
    summary: {
      pass: status === "pass" ? 1 : 0,
      fail: status === "fail" ? 1 : 0,
      skip: 0,
    },
  };
}

function runHandoff(candidate, args = []) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-native-failure-handoff-"));
  const candidatePath = path.join(tmp, "candidate.json");
  const textReportPath = path.join(tmp, "text-diff.md");
  const outputPath = path.join(tmp, "docs", "native-latest-failures", "2.1.143.md");

  fs.writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
  fs.writeFileSync(textReportPath, "# Upstream text diff\n\n- fixture diff\n");

  const result = spawnSync(
    "node",
    [
      handoffScript,
      "--candidate",
      candidatePath,
      "--text-report",
      textReportPath,
      "--run-url",
      "https://github.com/taekchef/claude-code-zh-cn/actions/runs/123",
      "--head-sha",
      "b23cb9c6b317d5a83a682e31071006c266580c23",
      "--output",
      outputPath,
      ...args,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    }
  );

  return { result, outputPath };
}

test("prepare-native-failure-handoff writes a maintainer-ready failure report", () => {
  const { result, outputPath } = runHandoff(fixtureCandidate());

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /prepared macOS native failure handoff for 2\.1\.143/);

  const report = fs.readFileSync(outputPath, "utf8");
  assert.match(report, /^# macOS native latest candidate failure: 2\.1\.143/m);
  assert.match(report, /Run: https:\/\/github\.com\/taekchef\/claude-code-zh-cn\/actions\/runs\/123/);
  assert.match(report, /Head SHA: `b23cb9c6b317d5a83a682e31071006c266580c23`/);
  assert.match(report, /Status: `fail`/);
  assert.match(report, /Native: `darwin-arm64` \/ `ok` \/ `ok` \/ `ok`/);
  assert.match(report, /`agents_help_line_6` \(`agents_help`, display-untranslated-line\)/);
  assert.match(report, /--add-dir <directory>                 Additional directory to allow tool/);
  assert.match(report, /node scripts\/verify-upstream-compat\.js --baseline 2\.1\.143 --skip-latest --native-macos-arm64 --json/);
  assert.match(report, /# Upstream text diff/);
});

test("prepare-native-failure-handoff writes Windows takeover commands", () => {
  const candidate = fixtureCandidate();
  const [entry] = candidate.results;
  entry.kind = "native-wrapper";
  entry.nativeVerification = {
    packageName: "@anthropic-ai/claude-code-win32-x64",
    platform: "win32-x64",
    detect: "native-bun",
    extract: "ok",
    repack: "ok",
    versionOutput: "2.1.143 (Claude Code)",
  };

  const { result, outputPath } = runHandoff(candidate, ["--platform", "windows"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /prepared Windows native failure handoff for 2\.1\.143/);

  const report = fs.readFileSync(outputPath, "utf8");
  assert.match(report, /^# Windows native latest candidate failure: 2\.1\.143/m);
  assert.match(report, /Native: `win32-x64` \/ `ok` \/ `ok` \/ `unknown`/);
  assert.match(report, /node scripts\/verify-upstream-compat\.js --baseline 2\.1\.143 --skip-latest --native-windows-x64 --json/);
  assert.match(report, /node scripts\/generate-upstream-text-diff\.js --to 2\.1\.143 --native-windows-x64/);
  assert.match(report, /node scripts\/promote-native-candidate\.js --candidate <candidate-json> --platform windows/);
});

test("prepare-native-failure-handoff rejects passing candidates", () => {
  const { result } = runHandoff(fixtureCandidate({ status: "pass", auditStatus: "pass" }));

  assert.equal(result.status, 1);
  assert.match(result.stderr, /candidate is not failed/);
});
