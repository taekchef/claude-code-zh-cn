const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const compatScript = path.join(repoRoot, "scripts", "verify-upstream-compat.js");
const fixtureConfig = path.join(__dirname, "upstream-compat-fixtures", "config.json");
const fixturesDir = path.join(__dirname, "upstream-compat-fixtures", "packages");
const translationsFile = path.join(repoRoot, "cli-translations.json");

function runCompat(args = [], env = {}) {
  return spawnSync(
    "node",
    [compatScript, "--config", fixtureConfig, "--fixtures-dir", fixturesDir, ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        ...env,
      },
    }
  );
}

function writePr10StyleTranslations() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-pr10-translations-"));
  const target = path.join(dir, "cli-translations.json");
  const entries = JSON.parse(fs.readFileSync(translationsFile, "utf8"))
    .filter((entry) => !entry.en.includes("Ultrareview launched for"))
    .filter((entry) => !entry.en.includes("This review bills as Extra Usage"));

  for (const entry of entries) {
    if (entry.en === "Advisor Tool") {
      entry.zh = "顾问工具";
    }
  }

  fs.writeFileSync(target, `${JSON.stringify(entries, null, 2)}\n`);
  return target;
}

test("verify-upstream-compat supports --baseline override without touching config", () => {
  const result = runCompat(["--baseline", "1.0.0", "--skip-latest", "--json"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(
    payload.results.map((entry) => entry.version),
    ["1.0.0"]
  );
  assert.equal(payload.summary.pass, 1);
  assert.equal(payload.summary.fail, 0);
});

test("verify-upstream-compat appends latest version and reports residue kind/id", () => {
  const result = runCompat(["--baseline", "1.0.0,1.0.1", "--latest-version", "1.0.2", "--json"]);

  assert.equal(result.status, 1, "fixture 1.0.1 should fail because it leaves a sentinel residue");
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(
    payload.results.map((entry) => entry.version),
    ["1.0.0", "1.0.1", "1.0.2"]
  );

  const failing = payload.results.find((entry) => entry.version === "1.0.1");
  assert.ok(failing, "expected 1.0.1 to be present in matrix output");
  assert.equal(failing.status, "fail");
  assert.deepEqual(failing.residue, [
    {
      kind: "sentinel",
      id: "future_probe",
      match: "Future untranslated probe",
    },
  ]);
});

test("verify-upstream-compat passes the 2.1.112 high-risk upstream text sample", () => {
  const result = runCompat(["--baseline", "2.1.112-risk", "--skip-latest", "--json"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const [risk] = payload.results;

  assert.equal(risk.version, "2.1.112-risk");
  assert.equal(risk.status, "pass");
  assert.deepEqual(risk.residue, []);
  assert.deepEqual(risk.missingRequired, []);
});

test("verify-upstream-compat catches PR #10-style high-risk text regressions", () => {
  const badTranslations = writePr10StyleTranslations();
  const result = runCompat([
    "--baseline",
    "2.1.112-risk",
    "--skip-latest",
    "--translations",
    badTranslations,
    "--json",
  ]);

  assert.equal(result.status, 1, "PR #10-style translations should fail the upstream text guard");
  const payload = JSON.parse(result.stdout);
  const [risk] = payload.results;

  assert.equal(risk.version, "2.1.112-risk");
  assert.equal(risk.status, "fail");
  assert.deepEqual(risk.missingRequired, [
    {
      kind: "upstream-text",
      id: "advisor_prompt_tool_name",
      rule: "preserve",
      match: "# Advisor Tool\n\nYou have access to an \\`advisor\\` tool",
    },
    {
      kind: "upstream-text",
      id: "advisor_dialog_title",
      rule: "preserve",
      match: "title:\"Advisor Tool\"",
    },
    {
      kind: "upstream-text",
      id: "ultrareview_billing_template",
      rule: "template",
      match: "body:`本次 review 会按 Extra Usage 计费（\\$\\{[^}]+\\}）。`",
    },
    {
      kind: "upstream-text",
      id: "ultrareview_launch_template",
      rule: "template",
      match:
        "text:`\\$\\{[^}]+\\}Ultrareview 已为 \\$\\{[^}]+\\} 启动（\\$\\{[^}]+\\}，云端运行）。跟踪：\\$\\{[^}]+\\}\\$\\{[^}]+\\}`",
    },
  ]);
});

test("verify-upstream-compat classifies native package shape", () => {
  const result = runCompat(["--baseline", "2.1.123-native-fixture", "--skip-latest", "--json"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const [native] = payload.results;

  assert.equal(native.version, "2.1.123-native-fixture");
  assert.equal(native.kind, "native");
  assert.equal(native.status, "skip");
  assert.equal(native.patchCount, 0);
  assert.deepEqual(native.residue, []);
  assert.match(native.skipReason, /native verification not enabled/);
  assert.equal(payload.summary.skip, 1);
});

test("verify-upstream-compat accepts native macOS flag and skips on non-macOS arm64", () => {
  const result = runCompat(
    ["--baseline", "2.1.123-native-fixture", "--skip-latest", "--native-macos-arm64", "--json"],
    { CCZH_NATIVE_VERIFY_PLATFORM: "linux-x64" }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const [native] = payload.results;

  assert.equal(native.kind, "native");
  assert.equal(native.status, "skip");
  assert.match(native.skipReason, /requires macOS arm64/);
});

test("verify-upstream-compat reports missing node-lief as native dependency skip", () => {
  const result = runCompat(
    ["--baseline", "2.1.123-native-fixture", "--skip-latest", "--native-macos-arm64", "--json"],
    {
      CCZH_NATIVE_VERIFY_PLATFORM: "darwin-arm64",
      CCZH_NATIVE_FORCE_DEPS: "missing",
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const [native] = payload.results;

  assert.equal(native.kind, "native");
  assert.equal(native.status, "skip");
  assert.match(native.skipReason, /node-lief/);
});

test("verify-upstream-compat resolves new native macOS candidates to the platform package", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-native-package-resolve-"));
  const packagesDir = path.join(tmp, "cache");
  const requestsPath = path.join(tmp, "npm-requests.txt");
  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const fakeNpm = path.join(binDir, "npm");
  fs.writeFileSync(
    fakeNpm,
    [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const { execFileSync } = require('node:child_process');",
      "const spec = process.argv[3];",
      "fs.appendFileSync(process.env.CCZH_NPM_REQUESTS, `${spec}\\n`);",
      "const root = process.cwd();",
      "const staging = path.join(root, 'pack-staging');",
      "fs.rmSync(staging, { recursive: true, force: true });",
      "const packageDir = path.join(staging, 'package');",
      "fs.mkdirSync(packageDir, { recursive: true });",
      "const isPlatformPackage = spec.startsWith('@anthropic-ai/claude-code-darwin-arm64@');",
      "fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: spec.replace(/@2\\.1\\.139$/, ''), version: '2.1.139' }));",
      "if (isPlatformPackage) {",
      "  fs.writeFileSync(path.join(packageDir, 'claude'), '#!/bin/sh\\n');",
      "} else {",
      "  fs.mkdirSync(path.join(packageDir, 'bin'), { recursive: true });",
      "  fs.writeFileSync(path.join(packageDir, 'bin', 'claude.exe'), 'wrapper\\n');",
      "}",
      "execFileSync('tar', ['-czf', 'claude-code-2.1.139.tgz', '-C', staging, 'package'], { cwd: root });",
      "process.stdout.write('claude-code-2.1.139.tgz\\n');",
      "",
    ].join("\n")
  );
  fs.chmodSync(fakeNpm, 0o755);

  const configPath = path.join(tmp, "config.json");
  const fixtureConfigJson = JSON.parse(fs.readFileSync(fixtureConfig, "utf8"));
  fixtureConfigJson.baseline = {
    versions: ["2.1.139"],
    includeLatestFromNpm: false,
  };
  fixtureConfigJson.checks = {
    sentinels: [],
    templateResidues: [],
    upstreamTextGuards: [],
  };
  fixtureConfigJson.support = {
    macosNativeExperimental: {
      platform: "darwin-arm64",
      packageName: "@anthropic-ai/claude-code-darwin-arm64",
      floor: "2.1.113",
      representatives: ["2.1.138"],
    },
  };
  fs.writeFileSync(configPath, `${JSON.stringify(fixtureConfigJson, null, 2)}\n`);

  const result = spawnSync(
    "node",
    [
      compatScript,
      "--config",
      configPath,
      "--packages-dir",
      packagesDir,
      "--baseline",
      "2.1.139",
      "--skip-latest",
      "--native-macos-arm64",
      "--json",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
        CCZH_NATIVE_VERIFY_PLATFORM: "linux-x64",
        CCZH_NPM_REQUESTS: requestsPath,
      },
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(fs.readFileSync(requestsPath, "utf8").trim().split(/\r?\n/), [
    "@anthropic-ai/claude-code-darwin-arm64@2.1.139",
  ]);
  const payload = JSON.parse(result.stdout);
  const [native] = payload.results;
  assert.equal(native.kind, "native");
  assert.equal(native.status, "skip");
  assert.match(native.skipReason, /requires macOS arm64/);
});

test("verify-upstream-compat fails when audited display output leaves user-visible English", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-display-audit-config-"));
  const configPath = path.join(tmp, "config.json");
  const fixtureConfigJson = JSON.parse(fs.readFileSync(fixtureConfig, "utf8"));
  fixtureConfigJson.baseline = {
    versions: ["1.0.3-display"],
    includeLatestFromNpm: false,
  };
  fixtureConfigJson.checks.displayAudit = {
    commands: [{ id: "top_help", args: ["--help"] }],
    blockedPhrases: [
      {
        id: "future_display_sentence",
        pattern: "Future display-only untranslated sentence",
      },
    ],
    maxUntranslatedLines: 0,
  };
  fs.writeFileSync(configPath, `${JSON.stringify(fixtureConfigJson, null, 2)}\n`);

  const result = spawnSync(
    "node",
    [compatScript, "--config", configPath, "--fixtures-dir", fixturesDir, "--skip-latest", "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    }
  );

  assert.equal(result.status, 1, "display audit should block release-quality verification");
  const payload = JSON.parse(result.stdout);
  const [entry] = payload.results;

  assert.equal(entry.version, "1.0.3-display");
  assert.equal(entry.status, "fail");
  assert.equal(entry.displayAudit.status, "fail");
  assert.deepEqual(entry.displayAudit.issues, [
    {
      kind: "display",
      id: "future_display_sentence",
      command: "top_help",
      match: "Future display-only untranslated sentence",
    },
    {
      kind: "display-untranslated-line",
      id: "top_help_line_4",
      command: "top_help",
      match: "--future                                          Future display-only untranslated sentence",
    },
  ]);
});

test("verify-upstream-compat fails when display audit silently skips expected surfaces", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-display-count-config-"));
  const fixtures = path.join(tmp, "packages");
  const packageDir = path.join(fixtures, "1.0.4-display-count", "package");
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, "cli.js"),
    [
      "#!/usr/bin/env node",
      "if (process.argv[2] === '--help') {",
      "  console.log('用法：claude [options]');",
      "  process.exit(0);",
      "}",
      "process.exit(2);",
      "",
    ].join("\n")
  );

  const configPath = path.join(tmp, "config.json");
  const fixtureConfigJson = JSON.parse(fs.readFileSync(fixtureConfig, "utf8"));
  fixtureConfigJson.baseline = {
    versions: ["1.0.4-display-count"],
    includeLatestFromNpm: false,
  };
  fixtureConfigJson.checks.displayAudit = {
    minCommandCount: 2,
    commands: [
      { id: "top_help", args: ["--help"] },
      { id: "missing_help", args: ["missing", "--help"], optional: true },
    ],
    maxUntranslatedLines: 0,
  };
  fs.writeFileSync(configPath, `${JSON.stringify(fixtureConfigJson, null, 2)}\n`);

  const result = spawnSync(
    "node",
    [compatScript, "--config", configPath, "--fixtures-dir", fixtures, "--skip-latest", "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    }
  );

  assert.equal(result.status, 1, "skipped display surfaces should block generated matrix drift");
  const payload = JSON.parse(result.stdout);
  const [entry] = payload.results;

  assert.equal(entry.status, "fail");
  assert.equal(entry.displayAudit.status, "fail");
  assert.equal(entry.displayAudit.commandCount, 1);
  assert.match(entry.displayAudit.issues[0].match, /expected at least 2 audited surfaces, got 1/);
});

test("verify-upstream-compat refreshes a corrupt downloaded package cache", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-corrupt-cache-"));
  const packagesDir = path.join(tmp, "cache");
  const packageName = "@anthropic-ai/claude-code";
  const version = "1.0.5-corrupt-cache";
  const safePackageName = packageName.replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const badPackageDir = path.join(packagesDir, `${safePackageName}-${version}`, "package");
  fs.mkdirSync(badPackageDir, { recursive: true });
  fs.writeFileSync(path.join(badPackageDir, "stale.txt"), "bad cache\n");

  const binDir = path.join(tmp, "bin");
  fs.mkdirSync(binDir, { recursive: true });
  const fakeNpm = path.join(binDir, "npm");
  fs.writeFileSync(
    fakeNpm,
    [
      "#!/usr/bin/env node",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const { execFileSync } = require('node:child_process');",
      "const root = process.cwd();",
      "const staging = path.join(root, 'pack-staging');",
      "const packageDir = path.join(staging, 'package');",
      "fs.mkdirSync(packageDir, { recursive: true });",
      "fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name: '@anthropic-ai/claude-code', version: '1.0.5-corrupt-cache' }));",
      "fs.writeFileSync(path.join(packageDir, 'cli.js'), `#!/usr/bin/env node\\nconsole.log('Quick safety check')\\n`);",
      "execFileSync('tar', ['-czf', 'claude-code-1.0.5-corrupt-cache.tgz', '-C', staging, 'package'], { cwd: root });",
      "process.stdout.write('claude-code-1.0.5-corrupt-cache.tgz\\n');",
      "",
    ].join("\n")
  );
  fs.chmodSync(fakeNpm, 0o755);

  const configPath = path.join(tmp, "config.json");
  const fixtureConfigJson = JSON.parse(fs.readFileSync(fixtureConfig, "utf8"));
  fixtureConfigJson.baseline = {
    versions: [version],
    includeLatestFromNpm: false,
  };
  fixtureConfigJson.checks = {
    sentinels: [],
    templateResidues: [],
    upstreamTextGuards: [],
  };
  fs.writeFileSync(configPath, `${JSON.stringify(fixtureConfigJson, null, 2)}\n`);

  const result = spawnSync(
    "node",
    [compatScript, "--config", configPath, "--packages-dir", packagesDir, "--skip-latest", "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      },
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(badPackageDir, "stale.txt")), false);
  assert.equal(fs.existsSync(path.join(badPackageDir, "cli.js")), true);
  assert.equal(fs.existsSync(path.join(badPackageDir, "package.json")), true);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.summary.pass, 1);
});
