const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const syncScript = path.join(repoRoot, "scripts", "sync-readme-support-window.js");

function runSync(args) {
  return spawnSync("node", [syncScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function writeFixture(files) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-readme-support-"));
  for (const [name, text] of Object.entries(files)) {
    const target = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  return tmpDir;
}

function markerBlock(name, body) {
  return [
    `<!-- readme-support-window:${name}:start -->`,
    body,
    `<!-- readme-support-window:${name}:end -->`,
  ].join("\n");
}

function minimalReadme() {
  return [
    "# Demo",
    "",
    markerBlock("badges", "stale badges"),
    "",
    "### 支持系统",
    "",
    markerBlock("support-systems", "stale support systems"),
    "",
    "### 安装方式",
    "",
    markerBlock("install-advice", "stale install advice"),
    "",
  ].join("\n");
}

function fixtureConfig() {
  return {
    support: {
      npm: {
        stable: {
          floor: "2.1.90",
          ceiling: "2.1.120",
          representatives: ["2.1.90", "2.1.120"],
          notes: "旧 cli.js npm 包形态。",
        },
      },
      macosOfficialInstaller: {
        experimental: {
          floor: "2.1.118",
          ceiling: "2.1.120",
          representatives: ["2.1.118", "2.1.120"],
          notes: "macOS official installer experimental.",
        },
      },
      macosNativeExperimental: {
        platform: "darwin-arm64",
        floor: "2.1.121",
        ceiling: "2.1.130",
        excluded: ["2.1.125"],
        representatives: ["2.1.121", "2.1.122", "2.1.123", "2.1.124", "2.1.126", "2.1.130"],
        verification: "2.1.121 PASS(native 900, display 7/7) · 2.1.130 PASS(native 901, display 7/7)",
        notes: "macOS arm64 native experimental; verified versions only.",
      },
      linuxOfficialInstaller: {
        unsupported: true,
        notes: "当前不支持 Linux 官方安装器；请改用 npm 路径。",
      },
      windowsNpmPowerShell: {
        stable: {
          floor: "2.1.90",
          ceiling: "2.1.120",
          representatives: [],
          notes: "PowerShell old npm cli.js only.",
        },
      },
      windowsNativeExe: {
        unsupported: true,
        notes: "Windows native .exe 跳过 CLI Patch。",
      },
    },
  };
}

test("README support window sync passes current repository README", () => {
  const result = runSync(["--check"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /readme support window OK/);
});

test("README support window sync fails stale generated blocks in check mode", () => {
  const tmpDir = writeFixture({
    "README.md": minimalReadme(),
    "config.json": `${JSON.stringify(fixtureConfig(), null, 2)}\n`,
  });

  const result = runSync([
    "--check",
    "--readme",
    path.join(tmpDir, "README.md"),
    "--config",
    path.join(tmpDir, "config.json"),
  ]);

  assert.equal(result.status, 1, "stale generated README blocks should fail");
  assert.match(result.stderr, /README support window is stale/);
  assert.match(result.stderr, /sync-readme-support-window\.js --write/);
});

test("README support window sync rewrites badges, support table, and install advice from config", () => {
  const tmpDir = writeFixture({
    "README.md": minimalReadme(),
    "config.json": `${JSON.stringify(fixtureConfig(), null, 2)}\n`,
  });
  const readmePath = path.join(tmpDir, "README.md");

  const writeResult = runSync([
    "--write",
    "--readme",
    readmePath,
    "--config",
    path.join(tmpDir, "config.json"),
  ]);
  assert.equal(writeResult.status, 0, writeResult.stderr || writeResult.stdout);

  const text = fs.readFileSync(readmePath, "utf8");
  assert.match(text, /npm%20stable-2\.1\.90--2\.1\.120-green/);
  assert.match(text, /macos%20native-2\.1\.121--2\.1\.130%20experimental-yellow/);
  assert.match(text, /\| macOS \/ native binary \| `experimental` \| `2\.1\.121 - 2\.1\.130`（不含未纳入本轮支持的 `2\.1\.125`） \|/);
  assert.match(text, /npm install -g @anthropic-ai\/claude-code@2\.1\.120/);
  assert.match(text, /Claude Code native binary `2\.1\.121 - 2\.1\.130`（macOS arm64，不含未纳入本轮支持的 `2\.1\.125`）/);
  assert.match(text, /显示审计 7\/7 PASS/);
  assert.match(text, /7 个稳定显示面/);
  assert.match(text, /Windows \/ native \.exe \/ latest \| `unsupported`/);

  const checkResult = runSync([
    "--check",
    "--readme",
    readmePath,
    "--config",
    path.join(tmpDir, "config.json"),
  ]);
  assert.equal(checkResult.status, 0, checkResult.stderr || checkResult.stdout);
});
