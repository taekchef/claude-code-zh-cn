const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const compatConfig = require(path.join(repoRoot, "scripts", "upstream-compat.config.json"));
const stableNpmVersions = compatConfig.support.npm.stable.representatives;
const unixShellRequired = process.platform === "win32" ? "covered by Unix CI" : false;
const windowsPowerShellRequired = process.platform !== "win32"
  ? "requires Windows PowerShell on Windows"
  : false;

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function englishCliFixture(version) {
  return [
    "#!/usr/bin/env node",
    `// Version: ${version}`,
    'let safety=createElement(T,null,"Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team). If not, take a moment to review what","\'","s in this folder first.");',
    'let approval="This command requires approval";',
    "",
  ].join("\n");
}

function createFakePeBinary(filePath) {
  const peHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
  const padding = Buffer.alloc(128, 0x00);
  const bunTrailer = Buffer.from("\n---- Bun! ----\n");

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([peHeader, padding, bunTrailer]));
}

function locateWindowsPowerShell() {
  if (process.platform !== "win32") return null;

  for (const command of ["powershell.exe", "powershell"]) {
    const result = spawnSync(command, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.Major"], {
      encoding: "utf8",
    });
    if (result.status === 0) return command;
  }

  return null;
}

function runWindowsPowerShell(command, args = [], options = {}) {
  return spawnSync(command, ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
}

function readUserPath(command) {
  const result = runWindowsPowerShell(command, [
    "-Command",
    "[Environment]::GetEnvironmentVariable('PATH', 'User')",
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.replace(/\r?\n$/, "");
}

function createWindowsInstallEnv(tmp, extraEnv = {}) {
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const launcherBin = path.join(home, ".claude", "bin");

  fs.mkdirSync(home, { recursive: true });

  return {
    ...process.env,
    USERPROFILE: home,
    TEMP: path.join(tmp, "temp"),
    TMP: path.join(tmp, "temp"),
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    ZH_CN_LAUNCHER_BIN_DIR: launcherBin,
    ZH_CN_SKIP_USER_PATH_UPDATE: "1",
    ...extraEnv,
  };
}

function createWindowsNpmInstall(tmp, version) {
  const prefix = path.join(tmp, "npm-prefix");
  const cliFile = path.join(prefix, "node_modules", "@anthropic-ai", "claude-code", "cli.js");
  const fakeClaude = path.join(prefix, "claude.cmd");

  fs.mkdirSync(path.dirname(cliFile), { recursive: true });
  fs.writeFileSync(cliFile, englishCliFixture(version));
  fs.writeFileSync(fakeClaude, "@echo off\r\nnode \"%~dp0node_modules\\@anthropic-ai\\claude-code\\cli.js\" %*\r\n");

  return { prefix, cliFile, fakeClaude };
}

function copyTree(src, dst) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dst, entry));
    }
    return;
  }

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function createInstallSource(tmpRoot, invokedFile, nativeVersion = "2.1.116") {
  const sourceRepo = path.join(tmpRoot, "source");
  fs.mkdirSync(sourceRepo, { recursive: true });

  for (const relative of ["install.sh", "compute-patch-revision.sh", "settings-overlay.json"]) {
    copyTree(path.join(repoRoot, relative), path.join(sourceRepo, relative));
  }
  for (const relative of ["plugin", "tips", "verbs"]) {
    copyTree(path.join(repoRoot, relative), path.join(sourceRepo, relative));
  }

  fs.writeFileSync(
    path.join(sourceRepo, "plugin", "bun-binary-io.js"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const cmd = process.argv[2];
if (cmd === "detect") {
  process.stdout.write("native-bun:" + fs.realpathSync(process.argv[3]));
} else if (cmd === "check-deps") {
  process.stdout.write("ok");
} else if (cmd === "version") {
  process.stdout.write(${JSON.stringify(nativeVersion)});
} else if (cmd === "extract" || cmd === "repack") {
  fs.writeFileSync(${JSON.stringify(invokedFile)}, cmd);
} else if (cmd === "resolve") {
  process.stdout.write(fs.realpathSync(process.argv[3]));
} else {
  process.exit(1);
}
`
  );

  fs.writeFileSync(
    path.join(sourceRepo, "plugin", "patch-cli.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'invoked' > ${JSON.stringify(invokedFile)}
printf '1'
`
  );
  fs.chmodSync(path.join(sourceRepo, "plugin", "patch-cli.sh"), 0o755);
  fs.chmodSync(path.join(sourceRepo, "install.sh"), 0o755);

  return sourceRepo;
}

test("install smoke skips unverified native binaries instead of pretending CLI Patch succeeded", { skip: unixShellRequired }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-install-native-unsupported-"));
  const home = path.join(tmp, "home");
  const fakeBin = path.join(tmp, "bin");
  const fakeClaude = path.join(fakeBin, "claude");
  const invokedFile = path.join(tmp, "patch-invoked");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const sourceRepo = createInstallSource(tmp, invokedFile, "2.1.139");
  const profileFile = path.join(home, ".zshrc");

  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(fakeClaude, "#!/usr/bin/env bash\necho '2.1.139 (Claude Code)'\n");
  fs.chmodSync(fakeClaude, 0o755);

  const result = spawnSync("bash", [path.join(sourceRepo, "install.sh")], {
    cwd: sourceRepo,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      ZH_CN_REAL_CLAUDE: fakeClaude,
      ZH_CN_LAUNCHER_BIN_DIR: path.join(home, ".claude", "bin"),
      ZH_CN_PROFILE_FILES: profileFile,
      GIT_TERMINAL_PROMPT: "0",
    },
    encoding: "utf8",
  });

  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /2\.1\.139/, "the user-facing message should include the unsupported version");
  assert.match(output, /暂不支持 CLI Patch/, "the install path should clearly say CLI Patch is unsupported");
  assert.match(output, /已跳过 CLI Patch/, "the install path should safely skip CLI Patch");
  assert.match(output, /2\.1\.113 - 2\.1\.138/, "the message should show the verified native window");
  assert.match(output, /不含 2\.1\.115.*2\.1\.125/, "the message should mention unsupported native gaps");
  assert.match(output, /Claude Code 2\.1\.112/, "the message should point users to the stable pinned version");
  assert.equal(fs.existsSync(invokedFile), false, "unsupported native should not call patch/extract/repack");
  assert.equal(fs.existsSync(path.join(pluginRoot, ".patched-version")), false, "unsupported native should not write success marker");
});

test("Windows PowerShell old-npm install smoke is wired into CI", () => {
  const workflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");

  assert.match(workflow, /windows-latest/, "CI should include a Windows runner for install.ps1 smoke");
  assert.match(
    workflow,
    /node --test tests\/install-smoke\.test\.js/,
    "CI should run the install smoke on the Windows runner"
  );
});

test("install.ps1 gates launcher injection to Windows old npm cli.js installs", () => {
  const script = fs.readFileSync(path.join(repoRoot, "install.ps1"), "utf8");
  const launcherDetectorStart = script.indexOf("function detect-launcher-install");
  const launcherDetectorEnd = script.indexOf("# ======== Settings 操作 ========");
  const launcherDetector = script.slice(launcherDetectorStart, launcherDetectorEnd);

  assert.ok(launcherDetectorStart >= 0, "install.ps1 should have a launcher-only detector");
  assert.match(script, /function remove-launcher-artifacts \{/);
  assert.match(script, /当前安装方式不是 npm cli\.js/);
  assert.match(script, /remove-launcher-artifacts/);
  assert.match(script, /launcher 目录还有其他文件，未移除 PATH/);
  assert.match(script, /detect-launcher-install \$realClaude/);
  assert.match(script, /\$kind -ne "npm"/);
  assert.doesNotMatch(launcherDetector, /npm root -g/, "launcher gating must not use global npm fallback");
});

test(
  "install.ps1 patches Windows old npm cli.js representatives without touching the real user install",
  { skip: windowsPowerShellRequired },
  () => {
    const powershell = locateWindowsPowerShell();
    assert.ok(powershell, "Windows PowerShell is required for this smoke");
    assert.ok(stableNpmVersions.length > 0, "stable npm representative versions must not be empty");

    const beforeUserPath = readUserPath(powershell);

    for (const version of stableNpmVersions) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `cczh-install-ps-old-npm-${version}-`));
      const { cliFile, fakeClaude } = createWindowsNpmInstall(tmp, version);
      const home = path.join(tmp, "home");
      const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
      const markerFile = path.join(pluginRoot, ".patched-version");

      const result = runWindowsPowerShell(powershell, ["-File", path.join(repoRoot, "install.ps1"), "-SkipBanner"], {
        env: createWindowsInstallEnv(tmp, {
          ZH_CN_REAL_CLAUDE: fakeClaude,
        }),
      });

      const output = `${result.stdout}\n${result.stderr}`;
      assert.equal(result.status, 0, output);
      assert.match(output, /正在 patch cli\.js/, output);
      assert.match(output, /已 patch cli\.js/, output);

      const patchedCli = fs.readFileSync(cliFile, "utf8");
      assert.equal(patchedCli.includes("Quick safety check"), false, patchedCli);
      assert.equal(patchedCli.includes("This command requires approval"), false, patchedCli);
      assert.match(fs.readFileSync(`${cliFile}.zh-cn-backup`, "utf8"), /Quick safety check/);
      assert.match(
        fs.readFileSync(markerFile, "utf8"),
        new RegExp(`^${escapeRegex(version)}\\|[a-f0-9]{16}$`),
        "successful old-npm patch should write the version+patch-revision marker"
      );
    }

    const afterUserPath = readUserPath(powershell);
    assert.equal(afterUserPath, beforeUserPath, "smoke must not mutate persistent Windows user PATH");
  }
);

test(
  "install.ps1 skips Windows native exe instead of pretending CLI Patch succeeded",
  { skip: windowsPowerShellRequired },
  () => {
    const powershell = locateWindowsPowerShell();
    assert.ok(powershell, "Windows PowerShell is required for this smoke");

    const beforeUserPath = readUserPath(powershell);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-install-ps-native-"));
    const fakeClaude = path.join(tmp, "native", "claude.exe");
    const pluginRoot = path.join(tmp, "home", ".claude", "plugins", "claude-code-zh-cn");
    const launcherBin = path.join(tmp, "home", ".claude", "bin");
    const markerFile = path.join(pluginRoot, ".patched-version");
    createFakePeBinary(fakeClaude);

    const result = runWindowsPowerShell(powershell, ["-File", path.join(repoRoot, "install.ps1"), "-SkipBanner"], {
      env: createWindowsInstallEnv(tmp, {
        ZH_CN_REAL_CLAUDE: fakeClaude,
      }),
    });

    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, output);
    assert.match(output, /原生二进制/, output);
    assert.match(output, /暂不支持 patch/, output);
    assert.equal(fs.existsSync(path.join(launcherBin, "claude.cmd")), false, "unsupported native exe must not install launcher");
    assert.equal(fs.existsSync(path.join(launcherBin, "claude.ps1")), false, "unsupported native exe must not install launcher");
    assert.equal(fs.existsSync(markerFile), false, "unsupported native exe must not write a success marker");
    assert.equal(readUserPath(powershell), beforeUserPath, "smoke must not mutate persistent Windows user PATH");
  }
);
