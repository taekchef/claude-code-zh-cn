const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const guardScript = path.join(repoRoot, "scripts", "check-support-boundary.js");

function mkdirp(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function writeFile(repo, relative, text) {
  const file = path.join(repo, relative);
  mkdirp(file);
  fs.writeFileSync(file, text);
}

function baseConfig(overrides = {}) {
  return {
    support: {
      npm: {
        stable: {
          floor: "2.1.92",
          ceiling: "2.1.112",
          representatives: ["2.1.92", "2.1.112"],
          notes: "2.1.113+ native binary wrapper 暂不支持旧 CLI Patch。",
          ...overrides.npmStable,
        },
      },
      macosOfficialInstaller: {
        experimental: {
          floor: "2.1.110",
          ceiling: "2.1.112",
          representatives: ["2.1.110", "2.1.111", "2.1.112"],
          notes: "macOS arm64 native patch experimental 仅限旧版本。",
          ...overrides.macosExperimental,
        },
      },
      linuxOfficialInstaller: {
        unsupported: true,
        notes: "当前不支持 Linux 官方安装器；请改用 npm 路径。",
      },
      ...overrides.support,
    },
  };
}

function createFixture(files = {}, configOverrides = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-support-boundary-"));
  const defaults = {
    "README.md": [
      "| macOS / npm 全局安装 | stable | 2.1.92 - 2.1.112 |",
      "| Windows / WSL + npm 全局安装 | 跟随 npm stable | 2.1.92 - 2.1.112 | 必须在 WSL 终端内运行 |",
      "Windows native .exe / latest 不支持 CLI Patch；2.1.113+ / latest 暂不承诺稳定 CLI Patch。",
      "Windows PowerShell 安装脚本可以用于旧 npm cli.js 形态，范围仍是 2.1.92 - 2.1.112。",
    ].join("\n"),
    "docs/support-matrix.md": [
      "| npm global install | stable | 2.1.92 - 2.1.112 | 2.1.112 PASS | 2.1.113+ native binary wrapper 暂不支持旧 CLI Patch。 |",
      "| Windows / native .exe / latest | unsupported | - | - | 检测到 Windows native .exe 会跳过 CLI Patch。 |",
    ].join("\n"),
    "install.sh": "echo '如需稳定 CLI 中文化，请使用 npm 安装 Claude Code 2.1.112'\n",
    "plugin/hooks/session-start": "# 未验证版本（尤其 latest）静默跳过，避免误改用户二进制。\n",
    "plugin/bin/claude-launcher": "# launcher only patches npm cli.js\n",
  };

  for (const [relative, text] of Object.entries({ ...defaults, ...files })) {
    writeFile(repo, relative, text);
  }
  writeFile(
    repo,
    "scripts/upstream-compat.config.json",
    `${JSON.stringify(baseConfig(configOverrides), null, 2)}\n`
  );

  return repo;
}

function runGuard(repo) {
  return spawnSync("node", [guardScript, "--repo-root", repo], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("support boundary guard passes scoped current-boundary wording", () => {
  const repo = createFixture();

  const result = runGuard(repo);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /support-boundary-guard: OK/);
  assert.match(result.stdout, /2\.1\.92 - 2\.1\.112/);
});

test("support boundary guard fails when README claims 2.1.113+ or latest support", () => {
  const repo = createFixture({
    "README.md": "本插件 stable 支持 Claude Code 2.1.113+ / latest native binary wrapper。\n",
  });

  const result = runGuard(repo);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /support-boundary-guard: FAIL/);
  assert.match(result.stdout, /README\.md:1/);
  assert.match(result.stdout, /2\.1\.113\+ \/ latest/);
  assert.match(result.stdout, /当前官方边界/);
  assert.match(result.stdout, /stable CLI Patch: 2\.1\.92 - 2\.1\.112/);
  assert.match(result.stdout, /改回/);
});

test("support boundary guard fails when config raises the stable ceiling past 2.1.112", () => {
  const repo = createFixture({}, {
    npmStable: {
      ceiling: "2.1.113",
      representatives: ["2.1.92", "2.1.112", "2.1.113"],
    },
  });

  const result = runGuard(repo);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /scripts\/upstream-compat\.config\.json/);
  assert.match(result.stdout, /npm stable ceiling/);
  assert.match(result.stdout, /2\.1\.112/);
});

test("support boundary guard fails on PR #11 style broad Windows native support claims", () => {
  const repo = createFixture({
    "docs/support-matrix.md": "| Windows / native .exe / latest | stable | 2.1.113+ | - | Windows 原生已支持完整 CLI Patch。 |\n",
    "install.ps1": "Write-Host 'Windows native .exe 已支持 CLI Patch'\n",
  });

  const result = runGuard(repo);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /Windows native/);
  assert.match(result.stdout, /docs\/support-matrix\.md:1/);
  assert.match(result.stdout, /install\.ps1:1/);
  assert.match(result.stdout, /Windows 只能写成 WSL \+ npm stable/);
});
