const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync, spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const hookPath = path.join(repoRoot, "plugin", "hooks", "session-start");

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

function setManifestVersion(file, version) {
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.version = version;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
}

function copyReleasePayload(sourceRepo, { includeInstallJsonHelper = true } = {}) {
  fs.mkdirSync(sourceRepo, { recursive: true });

  for (const relative of ["install.sh", "install.ps1", "compute-patch-revision.sh", "settings-overlay.json"]) {
    copyTree(path.join(repoRoot, relative), path.join(sourceRepo, relative));
  }
  if (includeInstallJsonHelper) {
    copyTree(
      path.join(repoRoot, "scripts", "install-json-helper.js"),
      path.join(sourceRepo, "scripts", "install-json-helper.js")
    );
  }
  for (const relative of ["plugin", "tips", "verbs"]) {
    copyTree(path.join(repoRoot, relative), path.join(sourceRepo, relative));
  }
}

function createReleaseSourceRepo(tmpRoot) {
  const sourceRepo = path.join(tmpRoot, "source-repo");
  copyReleasePayload(sourceRepo);

  execFileSync("git", ["init", "-b", "main"], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: sourceRepo, encoding: "utf8" });

  const manifestPath = path.join(sourceRepo, "plugin", "manifest.json");

  setManifestVersion(manifestPath, "2.0.0");
  execFileSync("git", ["add", "."], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "release 2.0.0"], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["tag", "v2.0.0"], { cwd: sourceRepo, encoding: "utf8" });

  setManifestVersion(manifestPath, "2.0.1");
  execFileSync("git", ["add", "."], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "release 2.0.1"], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["tag", "v2.0.1"], { cwd: sourceRepo, encoding: "utf8" });

  setManifestVersion(manifestPath, "2.0.99");
  execFileSync("git", ["add", "."], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "dev only 2.0.99"], { cwd: sourceRepo, encoding: "utf8" });

  return sourceRepo;
}

function createLegacyReleaseSourceRepoWithoutHelper(tmpRoot) {
  const sourceRepo = path.join(tmpRoot, "source-repo-legacy-helperless");
  copyReleasePayload(sourceRepo, { includeInstallJsonHelper: false });

  execFileSync("git", ["init", "-b", "main"], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: sourceRepo, encoding: "utf8" });

  const manifestPath = path.join(sourceRepo, "plugin", "manifest.json");

  setManifestVersion(manifestPath, "2.0.0");
  execFileSync("git", ["add", "."], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "release 2.0.0"], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["tag", "v2.0.0"], { cwd: sourceRepo, encoding: "utf8" });

  setManifestVersion(manifestPath, "2.0.1");
  execFileSync("git", ["add", "."], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "release 2.0.1"], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["tag", "v2.0.1"], { cwd: sourceRepo, encoding: "utf8" });

  fs.mkdirSync(path.join(sourceRepo, "scripts"), { recursive: true });
  fs.writeFileSync(
    path.join(sourceRepo, "scripts", "install-json-helper.js"),
    '#!/usr/bin/env node\nprocess.stderr.write("worktree helper must not be used for helperless release tags\\n");\nprocess.exit(42);\n'
  );
  setManifestVersion(manifestPath, "2.0.99");
  execFileSync("git", ["add", "."], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "dev only helper"], { cwd: sourceRepo, encoding: "utf8" });

  return sourceRepo;
}

function createSourceRepoWithoutTags(tmpRoot) {
  const sourceRepo = path.join(tmpRoot, "source-repo-no-tags");
  fs.mkdirSync(sourceRepo, { recursive: true });

  for (const relative of ["install.sh", "install.ps1", "compute-patch-revision.sh", "settings-overlay.json"]) {
    copyTree(path.join(repoRoot, relative), path.join(sourceRepo, relative));
  }
  copyTree(
    path.join(repoRoot, "scripts", "install-json-helper.js"),
    path.join(sourceRepo, "scripts", "install-json-helper.js")
  );
  for (const relative of ["plugin", "tips", "verbs"]) {
    copyTree(path.join(repoRoot, relative), path.join(sourceRepo, relative));
  }

  execFileSync("git", ["init", "-b", "main"], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["add", "."], { cwd: sourceRepo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: sourceRepo, encoding: "utf8" });

  return sourceRepo;
}

function writeFakeNativeHelper(filePath) {
  fs.writeFileSync(
    filePath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function readVersion(file) {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^\\/\\/ Version: (.+)$/m);
  return match ? match[1] : "";
}

const cmd = process.argv[2];
if (cmd === "detect") {
  process.stdout.write("native-bun:" + fs.realpathSync(process.argv[3]));
} else if (cmd === "check-deps") {
  process.stdout.write("ok");
} else if (cmd === "version") {
  process.stdout.write(readVersion(process.argv[3]));
} else if (cmd === "hash") {
  process.stdout.write(require("node:crypto").createHash("sha256").update(fs.readFileSync(process.argv[3])).digest("hex"));
} else if (cmd === "extract") {
  fs.copyFileSync(process.argv[3], process.argv[4]);
} else if (cmd === "repack") {
  fs.copyFileSync(process.argv[4], process.argv[3]);
} else if (cmd === "resolve") {
  process.stdout.write(fs.realpathSync(process.argv[3]));
} else {
  process.exit(1);
}
`
  );
}

test("session-start repairs settings from cached overlay before emitting JSON", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-settings-repair-"));
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const fakeBin = path.join(tmp, "bin");
  const settingsFile = path.join(home, ".claude", "settings.json");

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });

  fs.writeFileSync(
    path.join(pluginRoot, "compute-patch-revision.sh"),
    "#!/usr/bin/env bash\ncompute_patch_revision(){ printf 'test-revision'; }\n"
  );
  fs.chmodSync(path.join(pluginRoot, "compute-patch-revision.sh"), 0o755);
  fs.writeFileSync(path.join(fakeBin, "claude"), "#!/usr/bin/env bash\n");
  fs.chmodSync(path.join(fakeBin, "claude"), 0o755);

  const overlay = {
    language: "Chinese",
    spinnerTipsEnabled: true,
    spinnerVerbs: {
      loading: "加载中",
      thinking: "思考中",
    },
    spinnerTipsOverride: {
      excludeDefault: true,
      tips: ["保持简洁"],
    },
  };
  fs.writeFileSync(path.join(pluginRoot, ".settings-overlay-cache.json"), JSON.stringify(overlay, null, 2) + "\n");
  fs.writeFileSync(
    settingsFile,
    JSON.stringify(
      {
        theme: "dark",
        permissions: {
          allow: ["Bash(git status:*)"],
        },
      },
      null,
      2
    ) + "\n"
  );

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotThrow(() => JSON.parse(result.stdout), "hook output must remain valid JSON");

  const repaired = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  assert.equal(repaired.language, "Chinese");
  assert.equal(repaired.spinnerTipsEnabled, true);
  assert.deepEqual(repaired.spinnerVerbs, overlay.spinnerVerbs);
  assert.deepEqual(repaired.spinnerTipsOverride, overlay.spinnerTipsOverride);
  assert.equal(repaired.theme, "dark");
  assert.deepEqual(repaired.permissions, { allow: ["Bash(git status:*)"] });
});

test("Windows session-start hook repairs settings from cached overlay", () => {
  const script = fs.readFileSync(path.join(repoRoot, "plugin", "hooks", "session-start.ps1"), "utf8");

  assert.match(script, /\.settings-overlay-cache\.json/);
  assert.match(script, /function Repair-SettingsFromCache/);
  assert.match(script, /spinnerTipsOverride/);
  assert.match(script, /fs\.writeFileSync\(settingsFile/);
  assert.match(script, /Repair-SettingsFromCache/);
});

test("session-start context protects machine-readable configuration", () => {
  const shellHook = fs.readFileSync(hookPath, "utf8");
  const psHook = fs.readFileSync(path.join(repoRoot, "plugin", "hooks", "session-start.ps1"), "utf8");

  for (const source of [shellHook, psHook]) {
    assert.match(source, /## 机器配置保护/);
    assert.match(source, /settings\.json、JSON、shell 命令、Hook、statusLine、MCP/);
    assert.match(source, /JSON key、枚举值、工具名、命令名、路径、环境变量名、subagent_type、slash command/);
    assert.match(source, /不要为了中文化改变配置、命令或工具调用语义/);
  }
});

test("session-start auto-update archives install-json-helper only as an optional payload file", () => {
  const shellHook = fs.readFileSync(hookPath, "utf8");
  const psHook = fs.readFileSync(path.join(repoRoot, "plugin", "hooks", "session-start.ps1"), "utf8");

  assert.match(shellHook, /scripts\/install-json-helper\.js/);
  assert.match(shellHook, /validate_staging_release/);
  assert.match(psHook, /scripts\/install-json-helper\.js/);
  assert.doesNotMatch(shellHook, /\[ -f "\$staging_dir\/scripts\/install-json-helper\.js" \] \|\| return 1/);
  assert.doesNotMatch(psHook, /\(Test-Path "\$stagingDir\\scripts\\install-json-helper\.js"\) -and/);
});

test("session-start re-patches when plugin changed even if Claude Code version is unchanged", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-hook-"));
  const pluginRoot = path.join(tmp, "plugin");
  const fakeBin = path.join(tmp, "bin");
  const cliFile = path.join(tmp, "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js");
  const invokedFile = path.join(tmp, "patch-invoked");

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.dirname(cliFile), { recursive: true });

  fs.writeFileSync(cliFile, "#!/usr/bin/env node\n// Version: 2.1.96\n");
  fs.writeFileSync(path.join(fakeBin, "claude"), "#!/usr/bin/env bash\n");
  fs.chmodSync(path.join(fakeBin, "claude"), 0o755);

  fs.writeFileSync(
    path.join(pluginRoot, "patch-cli.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '1'
printf 'invoked' > ${JSON.stringify(invokedFile)}
`
  );
  fs.chmodSync(path.join(pluginRoot, "patch-cli.sh"), 0o755);
  fs.writeFileSync(path.join(pluginRoot, "manifest.json"), JSON.stringify({ version: "2.0.1" }));
  fs.writeFileSync(path.join(pluginRoot, "patch-cli.js"), "console.log('patch');\n");
  fs.writeFileSync(path.join(pluginRoot, "cli-translations.json"), "[]\n");
  fs.writeFileSync(
    path.join(pluginRoot, "compute-patch-revision.sh"),
    "#!/usr/bin/env bash\ncompute_patch_revision(){ printf 'test-revision'; }\n"
  );
  fs.chmodSync(path.join(pluginRoot, "compute-patch-revision.sh"), 0o755);
  fs.writeFileSync(path.join(pluginRoot, ".patched-version"), "2.1.96");

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(invokedFile), true, "hook did not trigger re-patch for same Claude Code version");
});

test("session-start does not fall back to npm patching when helper reports unknown", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-hook-unknown-"));
  const pluginRoot = path.join(tmp, "plugin");
  const fakeBin = path.join(tmp, "bin");
  const cliFile = path.join(tmp, "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js");
  const invokedFile = path.join(tmp, "patch-invoked");

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.dirname(cliFile), { recursive: true });

  fs.writeFileSync(cliFile, "#!/usr/bin/env node\n// Version: 2.1.101\n");
  fs.writeFileSync(path.join(fakeBin, "claude"), "#!/usr/bin/env bash\n");
  fs.chmodSync(path.join(fakeBin, "claude"), 0o755);

  fs.writeFileSync(
    path.join(pluginRoot, "bun-binary-io.js"),
    `#!/usr/bin/env node
const cmd = process.argv[2];
if (cmd === "detect") {
  process.stdout.write("unknown");
} else if (cmd === "check-deps") {
  process.stdout.write("missing");
}
`
  );
  fs.writeFileSync(
    path.join(pluginRoot, "patch-cli.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '1'
printf 'invoked' > ${JSON.stringify(invokedFile)}
`
  );
  fs.chmodSync(path.join(pluginRoot, "patch-cli.sh"), 0o755);
  fs.writeFileSync(path.join(pluginRoot, "manifest.json"), JSON.stringify({ version: "2.2.0" }));
  fs.writeFileSync(path.join(pluginRoot, "patch-cli.js"), "console.log('patch');\n");
  fs.writeFileSync(path.join(pluginRoot, "cli-translations.json"), "[]\n");
  fs.writeFileSync(
    path.join(pluginRoot, "compute-patch-revision.sh"),
    "#!/usr/bin/env bash\ncompute_patch_revision(){ printf 'test-revision'; }\n"
  );
  fs.chmodSync(path.join(pluginRoot, "compute-patch-revision.sh"), 0o755);

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(invokedFile), false, "helper=unknown should not fall back to npm patching");
});

test("session-start honors ZH_CN_REAL_CLAUDE when launcher is first on PATH", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-hook-launcher-path-"));
  const pluginRoot = path.join(tmp, "plugin");
  const launcherBin = path.join(tmp, "launcher-bin");
  const realBin = path.join(tmp, "real-bin");
  const cliFile = path.join(tmp, "npm-prefix", "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js");
  const realClaude = path.join(tmp, "npm-prefix", "bin", "claude");
  const invokedFile = path.join(tmp, "patch-invoked");

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(launcherBin, { recursive: true });
  fs.mkdirSync(path.dirname(cliFile), { recursive: true });
  fs.mkdirSync(path.dirname(realClaude), { recursive: true });

  fs.writeFileSync(cliFile, '#!/usr/bin/env node\n// Version: 2.1.104\nlet safety="Quick safety check";\n');
  fs.writeFileSync(path.join(launcherBin, "claude"), "#!/usr/bin/env bash\n");
  fs.writeFileSync(realClaude, "#!/usr/bin/env bash\n");
  fs.chmodSync(path.join(launcherBin, "claude"), 0o755);
  fs.chmodSync(realClaude, 0o755);

  fs.writeFileSync(
    path.join(pluginRoot, "bun-binary-io.js"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const cmd = process.argv[2];
if (cmd === "detect") {
  const real = fs.realpathSync(process.argv[3]);
  const cli = path.resolve(path.dirname(real), "../lib/node_modules/@anthropic-ai/claude-code/cli.js");
  process.stdout.write(fs.existsSync(cli) ? "npm:" + cli : "unknown");
} else if (cmd === "check-deps") {
  process.stdout.write("missing");
}
`
  );
  fs.writeFileSync(
    path.join(pluginRoot, "patch-cli.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '1'
printf 'invoked' > ${JSON.stringify(invokedFile)}
`
  );
  fs.chmodSync(path.join(pluginRoot, "patch-cli.sh"), 0o755);
  fs.writeFileSync(path.join(pluginRoot, "manifest.json"), JSON.stringify({ version: "2.2.0" }));
  fs.writeFileSync(path.join(pluginRoot, "patch-cli.js"), "console.log('patch');\n");
  fs.writeFileSync(path.join(pluginRoot, "cli-translations.json"), "[]\n");
  fs.writeFileSync(
    path.join(pluginRoot, "compute-patch-revision.sh"),
    "#!/usr/bin/env bash\ncompute_patch_revision(){ printf 'test-revision'; }\n"
  );
  fs.chmodSync(path.join(pluginRoot, "compute-patch-revision.sh"), 0o755);

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${launcherBin}:${realBin}:${process.env.PATH}`,
      ZH_CN_REAL_CLAUDE: realClaude,
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(invokedFile), true, "hook should patch via the real claude path exported by launcher");
});

test("session-start auto-updates only to latest release tag without mutating source repo checkout", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-autoupdate-"));
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const fakeBin = path.join(tmp, "bin");
  const cliFile = path.join(tmp, "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js");
  const sourceRepo = createReleaseSourceRepo(tmp);

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.dirname(cliFile), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });

  copyTree(path.join(repoRoot, "plugin"), pluginRoot);
  setManifestVersion(path.join(pluginRoot, "manifest.json"), "2.0.0");
  fs.writeFileSync(path.join(pluginRoot, ".source-repo"), `${sourceRepo}\n`);
  fs.writeFileSync(path.join(pluginRoot, ".last-update-check"), "0\n");
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), "{}\n");

  fs.writeFileSync(cliFile, "#!/usr/bin/env node\n// Version: 2.1.96\n");
  fs.writeFileSync(path.join(fakeBin, "claude"), "#!/usr/bin/env bash\n");
  fs.chmodSync(path.join(fakeBin, "claude"), 0o755);

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, "manifest.json"), "utf8")).version,
    "2.0.1",
    "installed plugin should update to latest release tag instead of staying stale or following untagged worktree"
  );
  assert.equal(
    fs.readFileSync(path.join(pluginRoot, ".source-repo"), "utf8").trim(),
    sourceRepo,
    "update should preserve original source repo pointer"
  );
  assert.equal(
    execFileSync("git", ["-C", sourceRepo, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim(),
    "main",
    "auto update must not checkout a tag in the source repo worktree"
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8")).language,
    "Chinese",
    "update-only install should still merge the Chinese settings overlay"
  );
});

test("session-start auto-update accepts older release tags without install-json-helper", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-autoupdate-legacy-helperless-"));
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const fakeBin = path.join(tmp, "bin");
  const cliFile = path.join(tmp, "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js");
  const sourceRepo = createLegacyReleaseSourceRepoWithoutHelper(tmp);
  const helperInLatestTag = spawnSync("git", ["-C", sourceRepo, "cat-file", "-e", "v2.0.1:scripts/install-json-helper.js"], {
    encoding: "utf8",
  });

  assert.notEqual(helperInLatestTag.status, 0, "fixture latest release tag must not contain install-json-helper");
  assert.equal(
    fs.existsSync(path.join(sourceRepo, "scripts", "install-json-helper.js")),
    true,
    "fixture worktree keeps a broken helper so this must exercise the staged release archive"
  );

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.dirname(cliFile), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });

  copyTree(path.join(repoRoot, "plugin"), pluginRoot);
  setManifestVersion(path.join(pluginRoot, "manifest.json"), "2.0.0");
  fs.writeFileSync(path.join(pluginRoot, ".source-repo"), `${sourceRepo}\n`);
  fs.writeFileSync(path.join(pluginRoot, ".last-update-check"), "0\n");
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), "{}\n");

  fs.writeFileSync(cliFile, "#!/usr/bin/env node\n// Version: 2.1.96\n");
  fs.writeFileSync(path.join(fakeBin, "claude"), "#!/usr/bin/env bash\n");
  fs.chmodSync(path.join(fakeBin, "claude"), 0o755);

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(pluginRoot, "manifest.json"), "utf8")).version,
    "2.0.1",
    "helper-less release archive should still update through install.sh fallback logic"
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8")).language,
    "Chinese",
    "helper-less update should still merge the Chinese settings overlay"
  );
  assert.match(
    fs.readFileSync(path.join(pluginRoot, ".last-update-status"), "utf8").trim(),
    /^ok v2\.0\.1 \d+$/,
    "hook should record that the staged helper-less archive installed successfully"
  );
});

test("session-start skips auto-update cleanly when source repo path is missing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-autoupdate-missing-"));
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const fakeBin = path.join(tmp, "bin");
  const cliFile = path.join(tmp, "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js");

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.dirname(cliFile), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });

  copyTree(path.join(repoRoot, "plugin"), pluginRoot);
  setManifestVersion(path.join(pluginRoot, "manifest.json"), "2.0.0");
  fs.writeFileSync(path.join(pluginRoot, ".source-repo"), `${path.join(tmp, "does-not-exist")}\n`);
  fs.writeFileSync(path.join(pluginRoot, ".last-update-check"), "0\n");
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), "{}\n");

  fs.writeFileSync(cliFile, "#!/usr/bin/env node\n// Version: 2.1.96\n");
  fs.writeFileSync(path.join(fakeBin, "claude"), "#!/usr/bin/env bash\n");
  fs.chmodSync(path.join(fakeBin, "claude"), 0o755);

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(pluginRoot, "manifest.json"), "utf8")).version, "2.0.0");
});

test("session-start skips auto-update when source repo has no release tags", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-autoupdate-notags-"));
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const fakeBin = path.join(tmp, "bin");
  const cliFile = path.join(tmp, "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js");
  const sourceRepo = createSourceRepoWithoutTags(tmp);

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.dirname(cliFile), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });

  copyTree(path.join(repoRoot, "plugin"), pluginRoot);
  setManifestVersion(path.join(pluginRoot, "manifest.json"), "2.0.0");
  fs.writeFileSync(path.join(pluginRoot, ".source-repo"), `${sourceRepo}\n`);
  fs.writeFileSync(path.join(pluginRoot, ".last-update-check"), "0\n");
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), "{}\n");

  fs.writeFileSync(cliFile, "#!/usr/bin/env node\n// Version: 2.1.96\n");
  fs.writeFileSync(path.join(fakeBin, "claude"), "#!/usr/bin/env bash\n");
  fs.chmodSync(path.join(fakeBin, "claude"), 0o755);

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(pluginRoot, "manifest.json"), "utf8")).version, "2.0.0");
  assert.equal(
    execFileSync("git", ["-C", sourceRepo, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim(),
    "main"
  );
});

test("session-start returns valid JSON even when update fails", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-update-fail-"));
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const fakeBin = path.join(tmp, "bin");
  const cliFile = path.join(tmp, "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js");

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.dirname(cliFile), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });

  copyTree(path.join(repoRoot, "plugin"), pluginRoot);
  setManifestVersion(path.join(pluginRoot, "manifest.json"), "2.0.0");
  // Point to a non-existent path so the update check fails gracefully
  fs.writeFileSync(path.join(pluginRoot, ".source-repo"), `${path.join(tmp, "does-not-exist")}\n`);
  fs.writeFileSync(path.join(pluginRoot, ".last-update-check"), "0\n");
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), "{}\n");

  fs.writeFileSync(cliFile, "#!/usr/bin/env node\n// Version: 2.1.96\n");
  fs.writeFileSync(path.join(fakeBin, "claude"), "#!/usr/bin/env bash\n");
  fs.chmodSync(path.join(fakeBin, "claude"), 0o755);

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  // Output must be valid JSON
  const output = JSON.parse(result.stdout);
  assert.ok(output.hookSpecificOutput, "output must have hookSpecificOutput");
  assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
});

test("session-start writes .last-update-status on successful update", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-update-status-"));
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const fakeBin = path.join(tmp, "bin");
  const cliFile = path.join(tmp, "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js");
  const sourceRepo = createReleaseSourceRepo(tmp);

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.dirname(cliFile), { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });

  copyTree(path.join(repoRoot, "plugin"), pluginRoot);
  setManifestVersion(path.join(pluginRoot, "manifest.json"), "2.0.0");
  fs.writeFileSync(path.join(pluginRoot, ".source-repo"), `${sourceRepo}\n`);
  fs.writeFileSync(path.join(pluginRoot, ".last-update-check"), "0\n");
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), "{}\n");

  fs.writeFileSync(cliFile, "#!/usr/bin/env node\n// Version: 2.1.96\n");
  fs.writeFileSync(path.join(fakeBin, "claude"), "#!/usr/bin/env bash\n");
  fs.chmodSync(path.join(fakeBin, "claude"), 0o755);

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const statusFile = path.join(pluginRoot, ".last-update-status");
  assert.equal(fs.existsSync(statusFile), true, ".last-update-status should exist after update");
  const status = fs.readFileSync(statusFile, "utf8").trim();
  assert.ok(status.startsWith("ok "), `status should start with "ok ", got: ${status}`);
  assert.ok(status.includes("2.0.1"), `status should mention 2.0.1, got: ${status}`);
});

test("session-start native re-patch does not roll upgraded supported binary back to old backup version", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-native-upgrade-"));
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const fakeBin = path.join(tmp, "bin");
  const fakeBinary = path.join(tmp, "claude-native");
  const backupBinary = `${fakeBinary}.zh-cn-backup`;
  const markerFile = path.join(pluginRoot, ".patched-version");

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });

  copyTree(path.join(repoRoot, "plugin"), pluginRoot);
  fs.writeFileSync(path.join(pluginRoot, "manifest.json"), JSON.stringify({ version: "2.0.5" }));
  writeFakeNativeHelper(path.join(pluginRoot, "bun-binary-io.js"));
  fs.writeFileSync(
    path.join(pluginRoot, "patch-cli.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
if ! grep -q 'PATCHED' "$1"; then
  printf '\nPATCHED\n' >> "$1"
fi
printf '1'
`
  );
  fs.chmodSync(path.join(pluginRoot, "patch-cli.sh"), 0o755);

  fs.writeFileSync(fakeBinary, "// Version: 2.1.112\nUPGRADED\n");
  fs.writeFileSync(backupBinary, "// Version: 2.1.110\nOLD BACKUP\n");
  fs.chmodSync(fakeBinary, 0o755);
  fs.writeFileSync(markerFile, "2.1.110|stale-revision\n");
  fs.symlinkSync(fakeBinary, path.join(fakeBin, "claude"));

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const currentBinary = fs.readFileSync(fakeBinary, "utf8");
  const refreshedBackup = fs.readFileSync(backupBinary, "utf8");
  const updatedMarker = fs.readFileSync(markerFile, "utf8").trim();

  assert.match(currentBinary, /Version: 2\.1\.112/, "current binary should stay on upgraded version");
  assert.match(currentBinary, /PATCHED/, "supported native binary should be re-patched");
  assert.match(refreshedBackup, /Version: 2\.1\.112/, "backup should refresh to upgraded version before re-patch");
  assert.match(updatedMarker, /^native\|2\.1\.112\|[a-f0-9]{64}\|/, "marker should update to the upgraded native version");
});

test("session-start patches verified macOS native experimental version", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-native-verified-"));
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const fakeBin = path.join(tmp, "bin");
  const fakeBinary = path.join(tmp, "claude-native");
  const markerFile = path.join(pluginRoot, ".patched-version");

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });

  copyTree(path.join(repoRoot, "plugin"), pluginRoot);
  fs.writeFileSync(path.join(pluginRoot, "manifest.json"), JSON.stringify({ version: "2.3.0" }));
  writeFakeNativeHelper(path.join(pluginRoot, "bun-binary-io.js"));
  fs.writeFileSync(
    path.join(pluginRoot, "patch-cli.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '\nPATCHED-EXPERIMENTAL\n' >> "$1"
printf '1'
`
  );
  fs.chmodSync(path.join(pluginRoot, "patch-cli.sh"), 0o755);

  fs.writeFileSync(fakeBinary, "// Version: 2.1.123\nNATIVE\n");
  fs.chmodSync(fakeBinary, 0o755);
  fs.symlinkSync(fakeBinary, path.join(fakeBin, "claude"));

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(fs.readFileSync(fakeBinary, "utf8"), /PATCHED-EXPERIMENTAL/);
  assert.match(fs.readFileSync(markerFile, "utf8").trim(), /^native\|2\.1\.123\|[a-f0-9]{64}\|/);
  assert.doesNotThrow(() => JSON.parse(result.stdout));
});

test("session-start restores native backup when repack fails after mutating binary", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-native-repack-fail-"));
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const fakeBin = path.join(tmp, "bin");
  const fakeBinary = path.join(tmp, "claude-native");
  const backupBinary = `${fakeBinary}.zh-cn-backup`;
  const markerFile = path.join(pluginRoot, ".patched-version");

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });

  copyTree(path.join(repoRoot, "plugin"), pluginRoot);
  fs.writeFileSync(path.join(pluginRoot, "manifest.json"), JSON.stringify({ version: "2.4.11" }));
  fs.writeFileSync(
    path.join(pluginRoot, "bun-binary-io.js"),
    `#!/usr/bin/env node
const fs = require("node:fs");
function readVersion(file) {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^\\/\\/ Version: (.+)$/m);
  return match ? match[1] : "";
}
const cmd = process.argv[2];
if (cmd === "detect") {
  process.stdout.write("native-bun:" + fs.realpathSync(process.argv[3]));
} else if (cmd === "check-deps") {
  process.stdout.write("ok");
} else if (cmd === "version") {
  process.stdout.write(readVersion(process.argv[3]));
} else if (cmd === "hash") {
  process.stdout.write(require("node:crypto").createHash("sha256").update(fs.readFileSync(process.argv[3])).digest("hex"));
} else if (cmd === "extract") {
  fs.copyFileSync(process.argv[3], process.argv[4]);
} else if (cmd === "repack") {
  fs.copyFileSync(process.argv[4], process.argv[3]);
  process.exit(1);
}
`
  );
  fs.writeFileSync(
    path.join(pluginRoot, "patch-cli.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '\nPATCHED-BUT-UNSIGNED\n' >> "$1"
printf '1'
`
  );
  fs.chmodSync(path.join(pluginRoot, "patch-cli.sh"), 0o755);

  fs.writeFileSync(fakeBinary, "// Version: 2.1.140\nORIGINAL\n");
  fs.writeFileSync(backupBinary, "// Version: 2.1.140\nCLEAN BACKUP\n");
  fs.chmodSync(fakeBinary, 0o755);
  fs.symlinkSync(fakeBinary, path.join(fakeBin, "claude"));
  fs.writeFileSync(markerFile, "native|2.1.140|stale|old-revision\n");

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(fakeBinary, "utf8"), "// Version: 2.1.140\nCLEAN BACKUP\n");
  assert.equal(fs.readFileSync(markerFile, "utf8").trim(), "native|2.1.140|stale|old-revision");
  assert.doesNotThrow(() => JSON.parse(result.stdout));
});

test("session-start skips native latest outside verified experimental window", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-native-latest-skip-"));
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const fakeBin = path.join(tmp, "bin");
  const fakeBinary = path.join(tmp, "claude-native");
  const invokedFile = path.join(tmp, "patch-invoked");
  const markerFile = path.join(pluginRoot, ".patched-version");

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });

  copyTree(path.join(repoRoot, "plugin"), pluginRoot);
  fs.writeFileSync(path.join(pluginRoot, "manifest.json"), JSON.stringify({ version: "2.0.5" }));
  writeFakeNativeHelper(path.join(pluginRoot, "bun-binary-io.js"));
  fs.writeFileSync(
    path.join(pluginRoot, "patch-cli.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'invoked' > ${JSON.stringify(invokedFile)}
printf '1'
`
  );
  fs.chmodSync(path.join(pluginRoot, "patch-cli.sh"), 0o755);

  fs.writeFileSync(fakeBinary, "// Version: 2.1.144\nLATEST\n");
  fs.chmodSync(fakeBinary, 0o755);
  fs.writeFileSync(markerFile, "2.1.112|stale-revision\n");
  fs.symlinkSync(fakeBinary, path.join(fakeBin, "claude"));

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(invokedFile), false, "unverified native should not be patched yet");
  assert.equal(fs.readFileSync(markerFile, "utf8").trim(), "2.1.112|stale-revision");
  assert.doesNotThrow(() => JSON.parse(result.stdout));
});

test("session-start native path skips re-patch cleanly when node-lief deps are missing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-native-node-lief-missing-"));
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const fakeBin = path.join(tmp, "bin");
  const fakeBinary = path.join(tmp, "claude-native");
  const invokedFile = path.join(tmp, "patch-invoked");
  const markerFile = path.join(pluginRoot, ".patched-version");

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });

  copyTree(path.join(repoRoot, "plugin"), pluginRoot);
  fs.writeFileSync(path.join(pluginRoot, "manifest.json"), JSON.stringify({ version: "2.2.0" }));
  fs.writeFileSync(
    path.join(pluginRoot, "bun-binary-io.js"),
    `#!/usr/bin/env node
const fs = require("node:fs");
function readVersion(file) {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^\\/\\/ Version: (.+)$/m);
  return match ? match[1] : "";
}
const cmd = process.argv[2];
if (cmd === "detect") {
  process.stdout.write("native-bun:" + fs.realpathSync(process.argv[3]));
} else if (cmd === "check-deps") {
  process.stdout.write("missing");
} else if (cmd === "version") {
  process.stdout.write(readVersion(process.argv[3]));
} else if (cmd === "hash") {
  process.stdout.write(require("node:crypto").createHash("sha256").update(fs.readFileSync(process.argv[3])).digest("hex"));
}
`
  );
  fs.writeFileSync(
    path.join(pluginRoot, "patch-cli.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '1'
printf 'invoked' > ${JSON.stringify(invokedFile)}
`
  );
  fs.chmodSync(path.join(pluginRoot, "patch-cli.sh"), 0o755);

  fs.writeFileSync(fakeBinary, "// Version: 2.1.112\nORIGINAL\n");
  fs.chmodSync(fakeBinary, 0o755);
  fs.symlinkSync(fakeBinary, path.join(fakeBin, "claude"));
  fs.writeFileSync(markerFile, "2.1.92|stale-revision\n");

  const result = spawnSync("bash", [hookPath], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      PATH: `${fakeBin}:${process.env.PATH}`,
      ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    input: "\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(invokedFile), false, "missing deps should skip native re-patch");
  assert.equal(fs.readFileSync(markerFile, "utf8").trim(), "2.1.92|stale-revision");
  assert.doesNotThrow(() => JSON.parse(result.stdout));
});
