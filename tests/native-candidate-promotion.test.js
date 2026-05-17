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

function copyConfig() {
  const configPath = tmpFile("config.json");
  fs.copyFileSync(sourceConfig, configPath);
  return configPath;
}

function candidateResult(overrides = {}) {
  return {
    packageName: "@anthropic-ai/claude-code",
    baseline: ["2.1.145"],
    results: [
      {
        version: "2.1.145",
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
          versionOutput: "2.1.145",
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
  assert.match(result.stdout, /promoted macOS native candidate 2\.1\.145/);

  const config = readJson(configPath);
  const native = config.support.macosNativeExperimental;
  assert.equal(native.ceiling, "2.1.145");
  assert.ok(native.representatives.includes("2.1.145"));
  assert.ok(native.excluded.includes("2.1.144"), "unverified gap should stay outside support");
  assert.match(native.verification, /2\.1\.145 PASS\(native 1324, display 11\/11\)/);
  assert.match(native.notes, /不代表未来 latest 自动稳定/);
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
  assert.equal(config.support.macosNativeExperimental.ceiling, "2.1.143");
  assert.equal(config.support.macosNativeExperimental.representatives.includes("2.1.145"), false);
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
  assert.equal(readJson(configPath).support.macosNativeExperimental.ceiling, "2.1.143");
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
        versionOutput: "2.1.145",
      },
    })
  );

  const result = runPromote(["--candidate", candidatePath, "--config", configPath, "--write"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /native codesign boundary failed/);
  assert.equal(readJson(configPath).support.macosNativeExperimental.ceiling, "2.1.143");
});
