const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const compatConfig = require(path.join(repoRoot, "scripts", "upstream-compat.config.json"));
const stableNpmVersions = compatConfig.support.npm.stable.representatives;
const nativeSupport = compatConfig.support.macosNativeExperimental;
const unixShellRequired = process.platform === "win32" ? "covered by Unix CI" : false;
const windowsPowerShellRequired = process.platform !== "win32"
  ? "requires Windows PowerShell on Windows"
  : false;

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bumpPatch(version, amount) {
  const parts = String(version).split(".").map((part) => Number.parseInt(part, 10));
  return `${parts[0]}.${parts[1]}.${parts[2] + amount}`;
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

function createInstallSource(tmpRoot, invokedFile, nativeVersion = "2.1.116", options = {}) {
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
const crypto = require("node:crypto");
const cmd = process.argv[2];
if (cmd === "detect") {
  process.stdout.write("native-bun:" + fs.realpathSync(process.argv[3]));
} else if (cmd === "check-deps") {
  process.stdout.write("ok");
} else if (cmd === "version") {
  process.stdout.write(${JSON.stringify(nativeVersion)});
} else if (cmd === "probe") {
  process.stdout.write("source-js");
} else if (cmd === "extract") {
  fs.writeFileSync(${JSON.stringify(invokedFile)}, cmd);
} else if (cmd === "repack") {
  fs.writeFileSync(${JSON.stringify(invokedFile)}, cmd);
  if (${options.breakOnRepack ? "true" : "false"}) {
    fs.writeFileSync(process.argv[3], "#!/usr/bin/env bash\\nkill -9 $$\\n");
    fs.chmodSync(process.argv[3], 0o755);
  }
} else if (cmd === "hash") {
  process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[3])).digest("hex"));
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

function addLinuxNativeSupport(sourceRepo, version = "2.1.220") {
  const supportPath = path.join(sourceRepo, "plugin", "support-window.json");
  const support = JSON.parse(fs.readFileSync(supportPath, "utf8"));
  support.linuxNativeExperimental = {
    floor: version,
    ceiling: version,
    versions: [version],
    platform: "linux-x64",
    requires: ["node-lief"],
  };
  fs.writeFileSync(supportPath, `${JSON.stringify(support, null, 2)}\n`);
}

test("Linux native install prompt requires node-lief 1.3.0 or newer", () => {
  const script = fs.readFileSync(path.join(repoRoot, "install.sh"), "utf8");
  assert.match(script, /scripts\/native-repair\.js/);
  assert.match(fs.readFileSync(path.join(repoRoot, "plugin/support-window.json"), "utf8"), /node-lief >=1\.3\.0/);
});

test("install smoke supports verified Linux x64 and locally validates new versions but rejects arm64 and musl", { skip: unixShellRequired }, () => {
  const cases = [
    { version: "2.1.220", arch: "x86_64", platform: "linux-x64", patched: true },
    { version: "2.1.220", arch: "aarch64", platform: "linux-arm64", patched: false },
    { version: "2.1.221", arch: "x86_64", platform: "linux-x64", patched: true },
    { version: "2.1.220", arch: "x86_64", platform: "linux-x64-musl", forcePlatform: true, patched: false },
  ];

  for (const item of cases) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-install-linux-native-"));
    const home = path.join(tmp, "home");
    const fakeBin = path.join(tmp, "bin");
    const fakeClaude = path.join(fakeBin, "claude");
    const invokedFile = path.join(tmp, "patch-invoked");
    const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
    const sourceRepo = createInstallSource(tmp, invokedFile, item.version);

    addLinuxNativeSupport(sourceRepo);
    fs.mkdirSync(fakeBin, { recursive: true });
    fs.writeFileSync(fakeClaude, `#!/usr/bin/env bash\necho '${item.version} (Claude Code) 中文帮助'\n`, { mode: 0o755 });
    fs.writeFileSync(
      path.join(fakeBin, "uname"),
      `#!/usr/bin/env bash\nif [ "$1" = "-s" ]; then echo Linux; else echo ${item.arch}; fi\n`,
      { mode: 0o755 }
    );

    const result = spawnSync("bash", [path.join(sourceRepo, "install.sh")], {
      cwd: sourceRepo,
      env: {
        ...process.env,
        HOME: home,
        PATH: `${fakeBin}:${process.env.PATH}`,
        CLAUDE_PLUGIN_ROOT: pluginRoot,
        ZH_CN_REAL_CLAUDE: fakeClaude,
        ZH_CN_NATIVE_PLATFORM: item.platform,
        ZH_CN_LAUNCHER_BIN_DIR: path.join(home, ".claude", "bin"),
        ZH_CN_PROFILE_FILES: path.join(home, ".zshrc"),
        GIT_TERMINAL_PROMPT: "0",
      },
      encoding: "utf8",
    });

    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, output);
    assert.equal(fs.existsSync(invokedFile), item.patched, `${item.arch} ${item.version}`);
    assert.doesNotMatch(output, /未检测到 WSL/, "pure Linux must not be described as failed WSL detection");
    if (item.patched) {
      assert.match(
        fs.readFileSync(path.join(pluginRoot, ".patched-version"), "utf8").trim(),
        new RegExp(`^native\\|${escapeRegex(item.version)}\\|[a-f0-9]+\\|[a-f0-9]{16}`),
        "published Linux support must use a verified marker"
      );
    } else {
      assert.match(output, /暂不支持 CLI Patch/);
      assert.doesNotMatch(output, /版本: .*未纳入已发布支持窗口/);
      assert.match(output, /不支持 arm64、musl/);
    }
  }
});

test("install smoke provisionally self-verifies a future native release instead of hard-skipping it", { skip: unixShellRequired }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-install-native-unsupported-"));
  const home = path.join(tmp, "home");
  const fakeBin = path.join(tmp, "bin");
  const fakeClaude = path.join(fakeBin, "claude");
  const invokedFile = path.join(tmp, "patch-invoked");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const unsupportedNativeVersion = "2.2.0";
  const sourceRepo = createInstallSource(tmp, invokedFile, unsupportedNativeVersion);
  const profileFile = path.join(home, ".zshrc");

  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(fakeClaude, `#!/usr/bin/env bash\necho '${unsupportedNativeVersion} (Claude Code) 中文帮助'\n`);
  fs.chmodSync(fakeClaude, 0o755);
  const sourceHash = crypto.createHash("sha256").update(fs.readFileSync(fakeClaude)).digest("hex");

  const result = spawnSync("bash", [path.join(sourceRepo, "install.sh")], {
    cwd: sourceRepo,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      ZH_CN_REAL_CLAUDE: fakeClaude,
      ZH_CN_NATIVE_PLATFORM: "darwin-arm64",
      ZH_CN_LAUNCHER_BIN_DIR: path.join(home, ".claude", "bin"),
      ZH_CN_PROFILE_FILES: profileFile,
      GIT_TERMINAL_PROMPT: "0",
    },
    encoding: "utf8",
  });

  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /本机自验证/, "future releases should enter the transactional local verification path");
  assert.match(output, /未纳入已发布支持窗口/, "future releases must not look like published support");
  assert.equal(fs.readFileSync(invokedFile, "utf8"), "repack");
  assert.match(
    fs.readFileSync(path.join(pluginRoot, ".patched-version"), "utf8").trim(),
    new RegExp(
      `^native\\|${escapeRegex(unsupportedNativeVersion)}\\|[a-f0-9]+\\|[a-f0-9]{16}\\|provisional\\|darwin-arm64\\|${sourceHash}$`
    )
  );
});

test("install smoke can provisionally self-verify newer same-minor native binaries", { skip: unixShellRequired }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-install-native-provisional-"));
  const home = path.join(tmp, "home");
  const fakeBin = path.join(tmp, "bin");
  const fakeClaude = path.join(fakeBin, "claude");
  const invokedFile = path.join(tmp, "patch-invoked");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const provisionalNativeVersion = bumpPatch(nativeSupport.ceiling, 1);
  const sourceRepo = createInstallSource(tmp, invokedFile, provisionalNativeVersion);
  const profileFile = path.join(home, ".zshrc");

  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(fakeClaude, `#!/usr/bin/env bash\necho '${provisionalNativeVersion} (Claude Code) 中文帮助'\n`);
  fs.chmodSync(fakeClaude, 0o755);

  const sourceHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(fakeClaude))
    .digest("hex");

  const result = spawnSync("bash", [path.join(sourceRepo, "install.sh")], {
    cwd: sourceRepo,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      ZH_CN_REAL_CLAUDE: fakeClaude,
      ZH_CN_NATIVE_PLATFORM: "darwin-arm64",
      ZH_CN_LAUNCHER_BIN_DIR: path.join(home, ".claude", "bin"),
      ZH_CN_PROFILE_FILES: profileFile,
      GIT_TERMINAL_PROMPT: "0",
    },
    encoding: "utf8",
  });

  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, new RegExp(escapeRegex(provisionalNativeVersion)));
  assert.match(output, /本机自验证/, "new same-minor native versions should be locally self-verified");
  assert.match(output, /未纳入已发布支持窗口/, "provisional patch must not look like published support");
  assert.match(output, /DISABLE_AUTOUPDATER/, "install output should not imply the plugin controls Claude Code core updates");
  assert.equal(fs.readFileSync(invokedFile, "utf8"), "repack", "provisional path should extract, patch, and repack");
  assert.match(
    fs.readFileSync(path.join(pluginRoot, ".patched-version"), "utf8").trim(),
    new RegExp(
      `^native\\|${escapeRegex(provisionalNativeVersion)}\\|[a-f0-9]+\\|[a-f0-9]{16}\\|provisional\\|darwin-arm64\\|${sourceHash}$`
    ),
    "provisional native patch should write an explicit non-verified marker"
  );
});

test("install smoke restores native backup when runtime self-check fails", { skip: unixShellRequired }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-install-native-runtime-fail-"));
  const home = path.join(tmp, "home");
  const fakeBin = path.join(tmp, "bin");
  const fakeClaude = path.join(fakeBin, "claude");
  const invokedFile = path.join(tmp, "patch-invoked");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const nativeVersion = "2.1.175";
  const sourceRepo = createInstallSource(tmp, invokedFile, nativeVersion, { breakOnRepack: true });
  const profileFile = path.join(home, ".zshrc");
  const originalBinary = `#!/usr/bin/env bash\necho '${nativeVersion} (Claude Code)'\n`;

  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(fakeClaude, originalBinary);
  fs.chmodSync(fakeClaude, 0o755);
  const originalInode = fs.statSync(fakeClaude).ino;

  const result = spawnSync("bash", [path.join(sourceRepo, "install.sh")], {
    cwd: sourceRepo,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      ZH_CN_REAL_CLAUDE: fakeClaude,
      ZH_CN_NATIVE_PLATFORM: "darwin-arm64",
      ZH_CN_LAUNCHER_BIN_DIR: path.join(home, ".claude", "bin"),
      ZH_CN_PROFILE_FILES: profileFile,
      GIT_TERMINAL_PROMPT: "0",
    },
    encoding: "utf8",
  });

  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /汉化未完成/, "runtime failure should be visible to the user");
  assert.equal(fs.readFileSync(invokedFile, "utf8"), "repack", "install should reach native repack");
  assert.equal(fs.readFileSync(fakeClaude, "utf8"), originalBinary, "failed runtime self-check must restore backup");
  assert.equal(fs.statSync(fakeClaude).ino, originalInode, "failed candidate must not replace the original inode");
  assert.equal(fs.existsSync(path.join(pluginRoot, ".patched-version")), false, "failed self-check must not write success marker");
});

test("install smoke provisionally self-verifies excluded in-window native binaries", { skip: unixShellRequired }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-install-native-excluded-"));
  const home = path.join(tmp, "home");
  const fakeBin = path.join(tmp, "bin");
  const fakeClaude = path.join(fakeBin, "claude");
  const invokedFile = path.join(tmp, "patch-invoked");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const excludedNativeVersion = nativeSupport.excluded[0];
  const sourceRepo = createInstallSource(tmp, invokedFile, excludedNativeVersion);
  const profileFile = path.join(home, ".zshrc");

  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(fakeClaude, `#!/usr/bin/env bash\necho '${excludedNativeVersion} (Claude Code) 中文帮助'\n`);
  fs.chmodSync(fakeClaude, 0o755);
  const sourceHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(fakeClaude))
    .digest("hex");

  const result = spawnSync("bash", [path.join(sourceRepo, "install.sh")], {
    cwd: sourceRepo,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      ZH_CN_REAL_CLAUDE: fakeClaude,
      ZH_CN_NATIVE_PLATFORM: "darwin-arm64",
      ZH_CN_LAUNCHER_BIN_DIR: path.join(home, ".claude", "bin"),
      ZH_CN_PROFILE_FILES: profileFile,
      GIT_TERMINAL_PROMPT: "0",
    },
    encoding: "utf8",
  });

  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /本机自验证/, "unverified same-minor gaps should enter transactional local verification");
  assert.match(output, /未纳入已发布支持窗口/, "provisional gaps must not look like published support");
  assert.equal(fs.readFileSync(invokedFile, "utf8"), "repack", "excluded same-minor native should extract, patch, and repack");
  assert.match(
    fs.readFileSync(path.join(pluginRoot, ".patched-version"), "utf8").trim(),
    new RegExp(
      `^native\\|${escapeRegex(excludedNativeVersion)}\\|[a-f0-9]+\\|[a-f0-9]{16}\\|provisional\\|darwin-arm64\\|${sourceHash}$`
    ),
    "excluded same-minor native should write an explicit provisional marker"
  );
});

test("native compat and Windows install smoke are wired into CI", () => {
  const workflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");

  assert.doesNotMatch(workflow, /windows-latest/, "CI should not rely on the floating Windows runner");
  assert.match(workflow, /windows-2022/, "CI should pin the stable VS 2022 Windows runner");
  assert.match(workflow, /windows-2025-vs2026/, "CI should preview the June 2026 VS 2026 Windows runner migration");
  assert.match(workflow, /fail-fast: false/, "both Windows smoke lanes should report independently");
  assert.match(
    workflow,
    /node --test tests\/install-smoke\.test\.js/,
    "CI should run the install smoke on the Windows runner"
  );
  assert.match(workflow, /windows-native-compat/, "CI should include a Windows native compat lane");
  assert.match(workflow, /--native-windows-x64/, "CI should verify Windows native patching");
  assert.match(workflow, /npm install --global node-lief@1\.3\.2/, "Windows native compat should pin node-lief");
  assert.match(workflow, /linux-native-compat/, "CI should include a Linux native compat lane");
  assert.match(workflow, /npm install --global node-lief@1\.3\.2/, "Linux native compat should pin node-lief");
  assert.match(
    workflow,
    /--skip-latest --native-linux-x64 --fail-on-skip --json/,
    "CI should verify the published Linux native versions without skipping"
  );
});

test("native transactions validate a candidate before touching the original", () => {
  const script = fs.readFileSync(path.join(repoRoot, "scripts/native-repair.js"), "utf8");
  assert.ok(script.indexOf('run(candidate, ["--help"]') < script.indexOf('fs.renameSync(candidate, target)'));
  assert.match(script, /hash\(target\) !== currentHash/);
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

test("Windows installer delegates native patch to the shared transaction", () => {
  const script = fs.readFileSync(path.join(repoRoot, "install.ps1"), "utf8");
  assert.match(script, /scripts\\native-repair\.js/);
  assert.match(script, /\$LASTEXITCODE -eq 0/);
});

test("Windows write guard waits for transient sharing but rejects a held lock", { skip: windowsPowerShellRequired }, () => {
  const powershell = locateWindowsPowerShell();
  assert.ok(powershell);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-write-lock-"));
  const script = fs.readFileSync(path.join(repoRoot, "install.ps1"), "utf8");
  const guard = script.match(/function test-binary-writable \{[\s\S]*?\n\}/)[0];
  const check = path.join(tmp, "check.ps1");
  fs.writeFileSync(check, "\ufeff" + guard + `
$ErrorActionPreference = "Stop"
$file = $env:CCZH_LOCK_FILE
[System.IO.File]::WriteAllText($file, "original")
$job = Start-Job -ArgumentList $file -ScriptBlock {
  param($file)
  $lock = [System.IO.File]::Open($file, 'Open', 'Write', 'None')
  try {
    [System.IO.File]::WriteAllText("$file.ready", "ready")
    Start-Sleep -Milliseconds 4500
  } finally { $lock.Dispose() }
}
try {
  $deadline = (Get-Date).AddSeconds(15)
  while (-not (Test-Path "$file.ready")) {
    if ((Get-Date) -gt $deadline) { throw "lock holder did not start" }
    Start-Sleep -Milliseconds 20
  }
  if (-not (test-binary-writable $file)) { throw "released lock was rejected" }
  Receive-Job $job -Wait | Out-Null
  $lock = [System.IO.File]::Open($file, 'Open', 'Write', 'None')
  try { if (test-binary-writable $file) { throw "held lock was accepted" } }
  finally { $lock.Dispose() }
  if ([System.IO.File]::ReadAllText($file) -ne "original") { throw "probe changed bytes" }
} finally { Remove-Job $job -Force -ErrorAction SilentlyContinue }
`);
  try {
    const result = runWindowsPowerShell(powershell, ["-File", check], {
      env: { ...process.env, CCZH_LOCK_FILE: path.join(tmp, "program.exe") }, timeout: 60000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

for (const operation of ["replace", "remove"]) {
test(`Windows binary ${operation} waits for release and preserves a persistently locked target`, { skip: windowsPowerShellRequired }, () => {
  const powershell = locateWindowsPowerShell();
  assert.ok(powershell);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-replace-lock-"));
  const check = path.join(tmp, "check.ps1");
  const replacement = path.join(tmp, "replace.cjs");
  fs.writeFileSync(replacement, `
try { require(${JSON.stringify(path.join(repoRoot, "bun-binary-io.js"))}).withWindowsFileRetry(() => ${operation === "replace" ? 'require("node:fs").renameSync(process.argv[2], process.argv[3])' : 'require("node:fs").unlinkSync(process.argv[3])'}); }
catch (error) { process.stdout.write(error.code); process.exitCode = 1; }
`);
  fs.writeFileSync(check, `
$ErrorActionPreference = "Stop"
$file = $env:CCZH_LOCK_FILE
$candidate = "$file.candidate"
[System.IO.File]::WriteAllText($file, "original")
[System.IO.File]::WriteAllText($candidate, "replacement")
$job = Start-Job -ArgumentList $file -ScriptBlock {
  param($file)
  $lock = [System.IO.File]::Open($file, 'Open', 'Read', 'Read')
  try {
    [System.IO.File]::WriteAllText("$file.ready", "ready")
    Start-Sleep -Milliseconds 4500
  } finally { $lock.Dispose() }
}
try {
  $deadline = (Get-Date).AddSeconds(15)
  while (-not (Test-Path "$file.ready")) {
    if ((Get-Date) -gt $deadline) { throw "lock holder did not start" }
    Start-Sleep -Milliseconds 20
  }
  & $env:CCZH_NODE $env:CCZH_REPLACE_SCRIPT $candidate $file
  if ($LASTEXITCODE -ne 0) { throw "replacement failed after lock release" }
  Receive-Job $job -Wait | Out-Null
  if ($env:CCZH_OPERATION -eq "replace") {
    if ([System.IO.File]::ReadAllText($file) -ne "replacement") { throw "replacement did not reach target" }
  } elseif (Test-Path $file) { throw "released backup was not removed" }
  [System.IO.File]::WriteAllText($file, "replacement")
  [System.IO.File]::WriteAllText($candidate, "second")
  $lock = [System.IO.File]::Open($file, 'Open', 'Read', 'Read')
  try {
    & $env:CCZH_NODE $env:CCZH_REPLACE_SCRIPT $candidate $file
    if ($LASTEXITCODE -eq 0) { throw "locked target was replaced" }
  } finally { $lock.Dispose() }
  if ([System.IO.File]::ReadAllText($file) -ne "replacement") { throw "locked target was lost" }
  if ([System.IO.File]::ReadAllText($candidate) -ne "second") { throw "candidate was lost" }
} finally { Remove-Job $job -Force -ErrorAction SilentlyContinue }
exit 0
`);
  try {
    const result = runWindowsPowerShell(powershell, ["-File", check], {
      env: { ...process.env, CCZH_LOCK_FILE: path.join(tmp, "program.exe"), CCZH_NODE: process.execPath, CCZH_REPLACE_SCRIPT: replacement, CCZH_OPERATION: operation }, timeout: 60000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
}

test("install.ps1 avoids PowerShell smart quotes in script strings", () => {
  const script = fs.readFileSync(path.join(repoRoot, "install.ps1"), "utf8");

  assert.doesNotMatch(
    script,
    /[“”‘’]/,
    "PowerShell treats smart quotes as quote delimiters, which can break Write-CN argument parsing"
  );
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
    assert.match(output, /汉化未完成/, output);
    assert.match(output, /未改动程序/, output);
    assert.equal(fs.existsSync(path.join(launcherBin, "claude.cmd")), true, "native launcher remains available to retry after an upstream update");
    assert.equal(fs.existsSync(path.join(launcherBin, "claude.ps1")), true, "native launcher remains available to retry after an upstream update");
    assert.equal(fs.existsSync(markerFile), false, "unsupported native exe must not write a success marker");
    assert.equal(readUserPath(powershell), beforeUserPath, "smoke must not mutate persistent Windows user PATH");
  }
);
