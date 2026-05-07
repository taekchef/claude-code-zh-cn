const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

function locateCommand(command) {
  return execFileSync("/usr/bin/which", [command], { encoding: "utf8" }).trim();
}

function linkCommands(binDir, commands) {
  fs.mkdirSync(binDir, { recursive: true });
  for (const command of commands) {
    fs.symlinkSync(locateCommand(command), path.join(binDir, command));
  }
}

function englishCliFixture() {
  return [
    "#!/usr/bin/env node",
    "// Version: 2.1.104",
    'let safety=createElement(T,null,"Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team). If not, take a moment to review what","\'","s in this folder first.");',
    'let approval="This command requires approval";',
    "",
  ].join("\n");
}

function createFakeNpmInstall(tmp) {
  const prefix = path.join(tmp, "npm-prefix");
  const realBin = path.join(prefix, "bin");
  const cliDir = path.join(prefix, "lib", "node_modules", "@anthropic-ai", "claude-code");
  const cliFile = path.join(cliDir, "cli.js");
  const realClaude = path.join(realBin, "claude");
  const invokedFile = path.join(tmp, "real-claude-invoked");
  const envFile = path.join(tmp, "real-claude-env");

  fs.mkdirSync(realBin, { recursive: true });
  fs.mkdirSync(cliDir, { recursive: true });
  fs.writeFileSync(cliFile, englishCliFixture());
  fs.writeFileSync(
    realClaude,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'invoked' > ${JSON.stringify(invokedFile)}
printf '%s\\n' "\${ZH_CN_REAL_CLAUDE:-}" > ${JSON.stringify(envFile)}
if [ "\${REQUIRE_PATCH_BEFORE_EXEC:-0}" = "1" ] && grep -q "Quick safety check" ${JSON.stringify(cliFile)}; then
  echo "cli.js still contains English safety prompt" >&2
  exit 91
fi
printf 'real claude ok\\n'
`
  );
  fs.chmodSync(realClaude, 0o755);

  return { prefix, realBin, realClaude, cliFile, invokedFile, envFile };
}

function createLauncherContext() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-launcher-"));
  const home = path.join(tmp, "home");
  const shellBin = path.join(tmp, "cmd-bin");
  const profileFile = path.join(home, ".zshrc");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const launcherBin = path.join(home, ".claude", "bin");
  const npmInstall = createFakeNpmInstall(tmp);

  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(profileFile, "# test profile\n");
  linkCommands(shellBin, [
    "bash",
    "env",
    "node",
    "cp",
    "mkdir",
    "find",
    "chmod",
    "cat",
    "sed",
    "head",
    "which",
    "date",
    "tr",
    "dirname",
    "rm",
    "grep",
  ]);

  return {
    tmp,
    home,
    shellBin,
    profileFile,
    pluginRoot,
    launcherBin,
    launcherFile: path.join(launcherBin, "claude"),
    ...npmInstall,
  };
}

function createUnsupportedWrapperContext({ withGlobalNpmFallback = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-unsupported-wrapper-"));
  const home = path.join(tmp, "home");
  const shellBin = path.join(tmp, "cmd-bin");
  const realBin = path.join(tmp, "third-party-bin");
  const globalRoot = path.join(tmp, "global-node-modules");
  const profileFile = path.join(home, ".zshrc");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const launcherBin = path.join(home, ".claude", "bin");
  const thirdPartyClaude = path.join(realBin, "claude");

  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(realBin, { recursive: true });
  fs.writeFileSync(profileFile, "# test profile\n");
  fs.writeFileSync(
    thirdPartyClaude,
    "#!/usr/bin/env bash\nprintf 'third-party claude wrapper\\n'\n"
  );
  fs.chmodSync(thirdPartyClaude, 0o755);

  linkCommands(shellBin, [
    "bash",
    "env",
    "node",
    "cp",
    "mkdir",
    "find",
    "chmod",
    "cat",
    "sed",
    "head",
    "which",
    "date",
    "tr",
    "dirname",
    "rm",
    "grep",
  ]);

  if (withGlobalNpmFallback) {
    const globalCliDir = path.join(globalRoot, "@anthropic-ai", "claude-code");
    fs.mkdirSync(globalCliDir, { recursive: true });
    fs.writeFileSync(path.join(globalCliDir, "cli.js"), englishCliFixture());
    fs.writeFileSync(
      path.join(shellBin, "npm"),
      `#!/usr/bin/env bash
if [ "$1" = "root" ] && [ "$2" = "-g" ]; then
  printf '%s\\n' ${JSON.stringify(globalRoot)}
  exit 0
fi
exit 1
`
    );
    fs.chmodSync(path.join(shellBin, "npm"), 0o755);
  }

  return {
    tmp,
    home,
    shellBin,
    realBin,
    profileFile,
    pluginRoot,
    launcherBin,
    launcherFile: path.join(launcherBin, "claude"),
  };
}

function runInstall(context) {
  return spawnSync("/bin/bash", [path.join(repoRoot, "install.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: context.home,
      PATH: `${context.realBin}:${context.shellBin}`,
      ZH_CN_SKIP_BANNER: "1",
      ZH_CN_PROFILE_FILES: context.profileFile,
    },
    encoding: "utf8",
  });
}

function runClaude(context, extraEnv = {}) {
  return spawnSync("/bin/bash", ["-lc", "claude"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: context.home,
      CLAUDE_PLUGIN_ROOT: context.pluginRoot,
      PATH: `${context.launcherBin}:${context.realBin}:${context.shellBin}`,
      ...extraEnv,
    },
    encoding: "utf8",
  });
}

test("install.sh installs launcher assets and npm launcher patches before exec on same-version overwrite", () => {
  const context = createLauncherContext();
  const install = runInstall(context);

  assert.equal(install.status, 0, install.stderr || install.stdout);
  assert.equal(fs.existsSync(context.launcherFile), true, "launcher file should be installed");
  assert.match(
    fs.readFileSync(context.profileFile, "utf8"),
    /claude-code-zh-cn launcher/,
    "profile should source the launcher snippet"
  );

  fs.writeFileSync(context.cliFile, englishCliFixture());

  const launch = runClaude(context, { REQUIRE_PATCH_BEFORE_EXEC: "1" });
  assert.equal(launch.status, 0, launch.stderr || launch.stdout);
  assert.equal(fs.readFileSync(context.invokedFile, "utf8"), "invoked");
  assert.equal(fs.readFileSync(context.envFile, "utf8").trim(), context.realClaude);

  const patchedCli = fs.readFileSync(context.cliFile, "utf8");
  assert.equal(patchedCli.includes("Quick safety check"), false, patchedCli);
  assert.equal(patchedCli.includes("This command requires approval"), false, patchedCli);
});

test("launcher warns and still execs real claude when prelaunch patch fails", () => {
  const context = createLauncherContext();
  const install = runInstall(context);

  assert.equal(install.status, 0, install.stderr || install.stdout);

  fs.writeFileSync(
    path.join(context.pluginRoot, "patch-cli.sh"),
    "#!/usr/bin/env bash\nset -euo pipefail\nexit 1\n"
  );
  fs.chmodSync(path.join(context.pluginRoot, "patch-cli.sh"), 0o755);
  fs.writeFileSync(context.cliFile, englishCliFixture());

  const launch = runClaude(context);
  assert.equal(launch.status, 0, launch.stderr || launch.stdout);
  assert.equal(fs.readFileSync(context.invokedFile, "utf8"), "invoked");
  assert.match(launch.stderr, /prelaunch patch failed/i);
  assert.match(fs.readFileSync(context.cliFile, "utf8"), /Quick safety check/);
});

test("install.sh removes stale launcher injection for unsupported third-party claude wrappers", () => {
  const context = createUnsupportedWrapperContext();
  const profileBlock = [
    "# test profile",
    "",
    "# >>> claude-code-zh-cn launcher >>>",
    `[ -f "${context.pluginRoot}/profile/claude-code-zh-cn.sh" ] && . "${context.pluginRoot}/profile/claude-code-zh-cn.sh"`,
    "# <<< claude-code-zh-cn launcher <<<",
    "",
  ].join("\n");

  fs.mkdirSync(context.launcherBin, { recursive: true });
  fs.writeFileSync(context.launcherFile, "#!/usr/bin/env bash\n# claude-code-zh-cn launcher\nexit 99\n");
  fs.chmodSync(context.launcherFile, 0o755);
  fs.writeFileSync(context.profileFile, profileBlock);

  const install = runInstall(context);

  assert.equal(install.status, 0, install.stderr || install.stdout);
  assert.equal(fs.existsSync(context.launcherFile), false, "stale launcher should be removed");
  assert.doesNotMatch(
    fs.readFileSync(context.profileFile, "utf8"),
    /claude-code-zh-cn launcher/,
    "profile launcher injection should be removed"
  );
});

test("install.sh ignores global npm fallback when current claude is a third-party wrapper", () => {
  const context = createUnsupportedWrapperContext({ withGlobalNpmFallback: true });

  const install = runInstall(context);

  assert.equal(install.status, 0, install.stderr || install.stdout);
  assert.equal(fs.existsSync(context.launcherFile), false, "launcher should not be installed from npm fallback");
  assert.doesNotMatch(
    fs.readFileSync(context.profileFile, "utf8"),
    /claude-code-zh-cn launcher/,
    "profile launcher injection should not be added from npm fallback"
  );
});

test("uninstall.sh removes launcher injection and restores npm cli backup", () => {
  const context = createLauncherContext();
  const install = runInstall(context);

  assert.equal(install.status, 0, install.stderr || install.stdout);
  assert.equal(fs.existsSync(`${context.cliFile}.zh-cn-backup`), true, "install should create npm cli backup");

  const uninstall = spawnSync("/bin/bash", [path.join(repoRoot, "uninstall.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: context.home,
      PATH: `${context.launcherBin}:${context.realBin}:${context.shellBin}`,
      ZH_CN_PROFILE_FILES: context.profileFile,
    },
    encoding: "utf8",
  });

  assert.equal(uninstall.status, 0, uninstall.stderr || uninstall.stdout);
  assert.equal(fs.existsSync(context.launcherFile), false, "launcher should be removed on uninstall");
  assert.equal(fs.existsSync(context.pluginRoot), false, "plugin root should be removed on uninstall");
  assert.doesNotMatch(
    fs.readFileSync(context.profileFile, "utf8"),
    /claude-code-zh-cn launcher/,
    "profile injection should be removed on uninstall"
  );
  assert.match(fs.readFileSync(context.cliFile, "utf8"), /Quick safety check/);
});
