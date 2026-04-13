const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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

function createReleaseSourceRepo(tmpRoot) {
  const sourceRepo = path.join(tmpRoot, "source-repo");
  fs.mkdirSync(sourceRepo, { recursive: true });

  for (const relative of ["install.sh", "compute-patch-revision.sh", "settings-overlay.json"]) {
    copyTree(path.join(repoRoot, relative), path.join(sourceRepo, relative));
  }
  for (const relative of ["plugin", "tips", "verbs"]) {
    copyTree(path.join(repoRoot, relative), path.join(sourceRepo, relative));
  }

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

function createSourceRepoWithoutTags(tmpRoot) {
  const sourceRepo = path.join(tmpRoot, "source-repo-no-tags");
  fs.mkdirSync(sourceRepo, { recursive: true });

  for (const relative of ["install.sh", "compute-patch-revision.sh", "settings-overlay.json"]) {
    copyTree(path.join(repoRoot, relative), path.join(sourceRepo, relative));
  }
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

test("session-start native re-patch does not roll upgraded binary back to old backup version", () => {
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

  fs.writeFileSync(fakeBinary, "// Version: 2.1.96\nUPGRADED\n");
  fs.writeFileSync(backupBinary, "// Version: 2.1.92\nOLD BACKUP\n");
  fs.chmodSync(fakeBinary, 0o755);
  fs.writeFileSync(markerFile, "2.1.92|stale-revision\n");
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

  assert.match(currentBinary, /Version: 2\.1\.96/, "current binary should stay on upgraded version");
  assert.match(currentBinary, /PATCHED/, "current binary should be re-patched");
  assert.match(refreshedBackup, /Version: 2\.1\.96/, "backup should refresh to upgraded version before re-patch");
  assert.match(updatedMarker, /^2\.1\.96\|/, "marker should update to the upgraded version");
});
