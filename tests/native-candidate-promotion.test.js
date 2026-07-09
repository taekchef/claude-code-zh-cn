const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const promoteScript = path.join(repoRoot, "scripts", "promote-native-candidate.js");
const sourceConfig = path.join(repoRoot, "scripts", "upstream-compat.config.json");

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-native-promote-"));
  return path.join(dir, name);
}

function writeJson(file, payload) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function bumpPatch(version, amount) {
  const parts = String(version).split(".").map((part) => Number.parseInt(part, 10));
  return `${parts[0]}.${parts[1]}.${parts[2] + amount}`;
}

const currentNativeCeiling = readJson(sourceConfig).support.macosNativeExperimental.ceiling;
const unverifiedGapVersion = bumpPatch(currentNativeCeiling, 1);
const promotableCandidateVersion = bumpPatch(currentNativeCeiling, 2);
const currentWindowsNativeCeiling = readJson(sourceConfig).support.windowsNativeExperimental.ceiling;
const unverifiedWindowsGapVersion = bumpPatch(currentWindowsNativeCeiling, 1);
const promotableWindowsCandidateVersion = bumpPatch(currentWindowsNativeCeiling, 2);

function copyConfig() {
  const configPath = tmpFile("config.json");
  fs.copyFileSync(sourceConfig, configPath);
  return configPath;
}

function candidateResult(overrides = {}) {
  return {
    packageName: "@anthropic-ai/claude-code",
    baseline: [promotableCandidateVersion],
    results: [
      {
        version: promotableCandidateVersion,
        kind: "native",
        status: "pass",
        patchCount: 1324,
        residue: [],
        missingRequired: [],
        nativeVerification: {
          packageName: "@anthropic-ai/claude-code-darwin-arm64",
          platform: "darwin-arm64",
          detect: "native-bun",
          extract: "ok",
          repack: "ok",
          codeSignature: "ok",
          versionOutput: promotableCandidateVersion,
        },
        displayAudit: {
          status: "pass",
          commandCount: 11,
          issueCount: 0,
          commands: [],
          issues: [],
        },
        ...overrides,
      },
    ],
    summary: { pass: 1, fail: 0, skip: 0 },
  };
}

function windowsCandidateResult(overrides = {}) {
  return {
    packageName: "@anthropic-ai/claude-code",
    baseline: [promotableWindowsCandidateVersion],
    results: [
      {
        version: promotableWindowsCandidateVersion,
        kind: "native-wrapper",
        status: "pass",
        patchCount: 1385,
        residue: [],
        missingRequired: [],
        nativeVerification: {
          packageName: "@anthropic-ai/claude-code-win32-x64",
          platform: "win32-x64",
          detect: "native-bun",
          extract: "ok",
          repack: "ok",
          versionOutput: promotableWindowsCandidateVersion,
        },
        displayAudit: {
          status: "pass",
          commandCount: 11,
          issueCount: 0,
          commands: [],
          issues: [],
        },
        ...overrides,
      },
    ],
    summary: { pass: 1, fail: 0, skip: 0 },
  };
}

function runPromote(args) {
  return spawnSync("node", [promoteScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("promote-native-candidate advances macOS native source-of-truth from a passing candidate", () => {
  const configPath = copyConfig();
  const candidatePath = tmpFile("candidate.json");
  writeJson(candidatePath, candidateResult());

  const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--write"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, new RegExp(`promoted macOS native candidate ${promotableCandidateVersion.replaceAll(".", "\\.")}`));

  const config = readJson(configPath);
  const native = config.support.macosNativeExperimental;
  assert.equal(native.ceiling, promotableCandidateVersion);
  assert.ok(native.representatives.includes(promotableCandidateVersion));
  assert.ok(native.excluded.includes(unverifiedGapVersion), "unverified gap should stay outside support");
  assert.match(
    native.verification,
    new RegExp(`${promotableCandidateVersion.replaceAll(".", "\\.")} PASS\\(native 1324, display 11\\/11\\)`)
  );
  assert.match(native.notes, /不代表未来 latest 自动稳定/);
});

test("promote-native-candidate accepts runtime pass with partial display coverage without claiming full coverage", () => {
  const configPath = copyConfig();
  const candidatePath = tmpFile("candidate.json");
  const coverageIssues = [
    {
      source: "display-audit",
      kind: "display",
      id: "new_help_copy",
      command: "top_help",
      match: "New upstream help copy",
    },
    {
      source: "display-audit",
      kind: "display-untranslated-line",
      id: "top_help_line_4",
      command: "top_help",
      match: "--new  New upstream help copy",
    },
  ];
  writeJson(
    candidatePath,
    candidateResult({
      runtimeStatus: "pass",
      coverage: { status: "partial", issueCount: 2, issues: coverageIssues },
      displayAudit: {
        status: "partial",
        commandCount: 11,
        issueCount: 2,
        warningCount: 2,
        failureCount: 0,
        commands: [],
        issues: coverageIssues.map(({ source, ...issue }) => issue),
        warnings: coverageIssues.map(({ source, ...issue }) => issue),
        failures: [],
      },
    })
  );

  const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--write"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /runtime pass; display coverage partial: 2 warnings/);
  const native = readJson(configPath).support.macosNativeExperimental;
  assert.match(
    native.verification,
    new RegExp(
      `${promotableCandidateVersion.replaceAll(".", "\\.")} PASS\\(native 1324, display runtime 11\\/11, coverage PARTIAL 2\\)`
    )
  );
  assert.match(native.notes, /展示文案覆盖为 PARTIAL（2 个警告）/);
  assert.match(native.notes, /不代表完整中文覆盖/);
  assert.doesNotMatch(
    native.verification,
    new RegExp(`${promotableCandidateVersion.replaceAll(".", "\\.")} PASS\\(native 1324, display 11\\/11\\)`)
  );
});

test("promote-native-candidate rejects coverage evidence that claims complete over observed warnings", () => {
  const configPath = copyConfig();
  const candidatePath = tmpFile("candidate.json");
  const issue = {
    kind: "display-untranslated-line",
    id: "top_help_line_4",
    command: "top_help",
    match: "New upstream help copy",
  };
  writeJson(
    candidatePath,
    candidateResult({
      runtimeStatus: "pass",
      coverage: { status: "complete", issueCount: 0, issues: [] },
      displayAudit: {
        status: "partial",
        commandCount: 11,
        issueCount: 1,
        warningCount: 1,
        failureCount: 0,
        commands: [],
        issues: [issue],
        warnings: [issue],
        failures: [],
      },
    })
  );

  const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--write"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /display coverage evidence conflicts with 1 observed warning/);
  assert.equal(readJson(configPath).support.macosNativeExperimental.ceiling, currentNativeCeiling);
});

test("promote-native-candidate accepts a visible template residue as partial coverage", () => {
  const configPath = copyConfig();
  const candidatePath = tmpFile("candidate.json");
  const issue = {
    source: "residue",
    kind: "template",
    id: "duration_worked",
    match: "Worked for",
  };
  writeJson(
    candidatePath,
    candidateResult({
      runtimeStatus: "pass",
      residue: [{ kind: "template", id: "duration_worked", match: "Worked for" }],
      coverage: { status: "partial", issueCount: 1, issues: [issue] },
    })
  );

  const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--write"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /runtime pass; display coverage partial: 1 warnings/);
  const native = readJson(configPath).support.macosNativeExperimental;
  assert.match(native.verification, /coverage PARTIAL 1/);
  assert.match(native.notes, /展示文案覆盖为 PARTIAL（1 个警告）/);
});

test("promote-native-candidate rejects skipped candidates with a maintainer-readable boundary", () => {
  const configPath = copyConfig();
  const candidatePath = tmpFile("candidate.json");
  writeJson(
    candidatePath,
    candidateResult({
      status: "skip",
      patchCount: 0,
      skipReason: "node-lief dependency missing",
      displayAudit: undefined,
    })
  );

  const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--write"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /native verification did not pass/);
  assert.match(result.stderr, /node-lief dependency missing/);

  const config = readJson(configPath);
  assert.equal(config.support.macosNativeExperimental.ceiling, currentNativeCeiling);
  assert.equal(config.support.macosNativeExperimental.representatives.includes(promotableCandidateVersion), false);
});

test("promote-native-candidate advances Windows native source-of-truth from a passing candidate", () => {
  const configPath = copyConfig();
  const candidatePath = tmpFile("candidate.json");
  writeJson(candidatePath, windowsCandidateResult());

  const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--platform", "windows", "--write"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(
    result.stdout,
    new RegExp(`promoted Windows native candidate ${promotableWindowsCandidateVersion.replaceAll(".", "\\.")}`)
  );

  const config = readJson(configPath);
  const native = config.support.windowsNativeExperimental;
  assert.equal(native.ceiling, promotableWindowsCandidateVersion);
  assert.ok(native.representatives.includes(promotableWindowsCandidateVersion));
  assert.ok(native.excluded.includes(unverifiedWindowsGapVersion), "unverified Windows gap should stay outside support");
  assert.match(
    native.verification,
    new RegExp(`${promotableWindowsCandidateVersion.replaceAll(".", "\\.")} PASS\\(native 1385, display 11\\/11\\)`)
  );
  assert.match(native.notes, /Windows x64 native binary experimental/);
  assert.match(native.notes, /provisional/);
});

test("promote-native-candidate rejects Windows candidates from the macOS promotion lane", () => {
  const configPath = copyConfig();
  const candidatePath = tmpFile("candidate.json");
  writeJson(candidatePath, windowsCandidateResult());

  const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--write"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /expected native, got native-wrapper/);
  assert.match(result.stderr, /expected darwin-arm64, got win32-x64/);
  assert.equal(readJson(configPath).support.windowsNativeExperimental.ceiling, currentWindowsNativeCeiling);
});

test("promote-native-candidate requires display audit before support-window promotion", () => {
  const configPath = copyConfig();
  const candidatePath = tmpFile("candidate.json");
  writeJson(
    candidatePath,
    candidateResult({
      displayAudit: { status: "skip", commandCount: 0, issueCount: 0 },
    })
  );

  const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--write"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /display audit did not pass/);
  assert.equal(readJson(configPath).support.macosNativeExperimental.ceiling, currentNativeCeiling);
});

test("promote-native-candidate rejects partial coverage when required help surfaces were not audited", () => {
  const configPath = copyConfig();
  const candidatePath = tmpFile("candidate.json");
  const issue = {
    kind: "display-untranslated-line",
    id: "top_help_line_4",
    command: "top_help",
    match: "New upstream help copy",
  };
  writeJson(
    candidatePath,
    candidateResult({
      runtimeStatus: "pass",
      coverage: { status: "partial", issueCount: 1, issues: [{ source: "display-audit", ...issue }] },
      displayAudit: {
        status: "partial",
        commandCount: 10,
        issueCount: 1,
        warningCount: 1,
        failureCount: 0,
        commands: [],
        issues: [issue],
        warnings: [issue],
        failures: [],
      },
    })
  );

  const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--write"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /commandCount=10; expected at least 11/);
  assert.equal(readJson(configPath).support.macosNativeExperimental.ceiling, currentNativeCeiling);
});

test("promote-native-candidate keeps preserve and template translation rules as hard failures", () => {
  const cases = [
    {
      name: "preserve rule",
      overrides: {
        missingRequired: [
          { kind: "upstream-text", id: "advisor_dialog_title", rule: "preserve", match: 'title:"Advisor Tool"' },
        ],
      },
      error: /upstream text guard boundary failed: upstream-text:advisor_dialog_title/,
    },
    {
      name: "template translation rule",
      overrides: {
        missingRequired: [
          {
            kind: "upstream-text",
            id: "ultrareview_launch_template",
            rule: "template",
            match: "translated template shape",
          },
        ],
      },
      error: /upstream text guard boundary failed: upstream-text:ultrareview_launch_template/,
    },
  ];

  for (const item of cases) {
    const configPath = copyConfig();
    const candidatePath = tmpFile(`${item.name.replaceAll(" ", "-")}.json`);
    writeJson(candidatePath, candidateResult({ runtimeStatus: "pass", ...item.overrides }));

    const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--write"]);

    assert.equal(result.status, 1, item.name);
    assert.match(result.stderr, item.error, item.name);
    assert.equal(readJson(configPath).support.macosNativeExperimental.ceiling, currentNativeCeiling, item.name);
  }
});

test("promote-native-candidate keeps extract, repack, and version execution as hard failures", () => {
  const validNative = candidateResult().results[0].nativeVerification;
  const cases = [
    {
      name: "extract evidence missing",
      nativeVerification: { ...validNative, extract: undefined },
      error: /native extract boundary failed: unknown/,
    },
    {
      name: "repack failed",
      nativeVerification: { ...validNative, repack: "failed" },
      error: /native repack boundary failed: failed/,
    },
    {
      name: "version execution failed",
      nativeVerification: { ...validNative, versionOutput: "claude unknown" },
      error: /native runtime boundary failed: --version did not include/,
    },
  ];

  for (const item of cases) {
    const configPath = copyConfig();
    const candidatePath = tmpFile(`${item.name.replaceAll(" ", "-")}.json`);
    writeJson(candidatePath, candidateResult({ nativeVerification: item.nativeVerification }));

    const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--write"]);

    assert.equal(result.status, 1, item.name);
    assert.match(result.stderr, item.error, item.name);
    assert.equal(readJson(configPath).support.macosNativeExperimental.ceiling, currentNativeCeiling, item.name);
  }
});

test("promote-native-candidate requires codesign verification before support-window promotion", () => {
  const configPath = copyConfig();
  const candidatePath = tmpFile("candidate.json");
  writeJson(
    candidatePath,
    candidateResult({
      nativeVerification: {
        packageName: "@anthropic-ai/claude-code-darwin-arm64",
        platform: "darwin-arm64",
        detect: "native-bun",
        extract: "ok",
        repack: "ok",
        codeSignature: "failed",
        versionOutput: promotableCandidateVersion,
      },
    })
  );

  const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--write"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /native codesign boundary failed/);
  assert.equal(readJson(configPath).support.macosNativeExperimental.ceiling, currentNativeCeiling);
});
