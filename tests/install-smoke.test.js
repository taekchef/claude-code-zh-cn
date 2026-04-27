const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

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

function createInstallSource(tmpRoot, invokedFile) {
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
  process.stdout.write("2.1.116");
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

test("install smoke skips 2.1.113+ native binaries instead of pretending CLI Patch succeeded", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-install-native-unsupported-"));
  const home = path.join(tmp, "home");
  const fakeBin = path.join(tmp, "bin");
  const fakeClaude = path.join(fakeBin, "claude");
  const invokedFile = path.join(tmp, "patch-invoked");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const sourceRepo = createInstallSource(tmp, invokedFile);
  const profileFile = path.join(home, ".zshrc");

  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(fakeClaude, "#!/usr/bin/env bash\necho '2.1.116 (Claude Code)'\n");
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
  assert.match(output, /2\.1\.116/, "the user-facing message should include the unsupported version");
  assert.match(output, /暂不支持 CLI Patch/, "the install path should clearly say CLI Patch is unsupported");
  assert.match(output, /已跳过 CLI Patch/, "the install path should safely skip CLI Patch");
  assert.match(output, /2\.1\.110 - 2\.1\.112/, "the message should show the verified native window");
  assert.match(output, /Claude Code 2\.1\.112/, "the message should point users to the stable pinned version");
  assert.equal(fs.existsSync(invokedFile), false, "unsupported native should not call patch/extract/repack");
  assert.equal(fs.existsSync(path.join(pluginRoot, ".patched-version")), false, "unsupported native should not write success marker");
});
