const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const diagnoseScript = path.join(repoRoot, "diagnose.sh");

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cczh-diagnose-${name}-`));
}

function writeFile(file, content, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, mode === undefined ? undefined : { mode });
}

function runDiagnose(pluginRoot, extraEnv = {}) {
  return spawnSync("bash", [diagnoseScript], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      ...extraEnv,
    },
    encoding: "utf8",
  });
}

test("diagnose.sh prints one pasteable report with plugin, update, install, and patch state", () => {
  const tmp = tempDir("full");
  const pluginRoot = path.join(tmp, "plugin");
  const fakeBin = path.join(tmp, "bin");
  const fakeClaude = path.join(fakeBin, "claude");
  const patchedTarget = path.join(tmp, "npm", "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js");

  writeFile(path.join(pluginRoot, "manifest.json"), '{ "version": "2.4.22" }\n');
  writeFile(path.join(pluginRoot, ".source-repo"), "taekchef/claude-code-zh-cn\n");
  writeFile(path.join(pluginRoot, ".last-update-status"), "ok v2.4.22 1710000000\n");
  writeFile(path.join(pluginRoot, ".last-update-check"), "1710000010\n");
  writeFile(path.join(pluginRoot, ".installed-ref"), "v2.4.22\n");
  writeFile(path.join(pluginRoot, ".installed-commit"), "0123456789abcdef0123456789abcdef01234567\n");
  writeFile(path.join(pluginRoot, ".patched-target"), `${patchedTarget}\n`);
  writeFile(path.join(pluginRoot, ".patched-kind"), "npm\n");
  writeFile(path.join(pluginRoot, ".patched-version"), "2.1.112|fake-revision\n");
  writeFile(
    path.join(pluginRoot, "bun-binary-io.js"),
    `#!/usr/bin/env node
if (process.argv[2] === "detect") {
  process.stdout.write("npm:" + ${JSON.stringify(patchedTarget)});
  process.exit(0);
}
process.exit(1);
`,
    0o755
  );
  writeFile(fakeClaude, "#!/usr/bin/env bash\nprintf '2.1.112 (Claude Code)\\n'\n", 0o755);

  const result = runDiagnose(pluginRoot, {
    PATH: `${fakeBin}:${process.env.PATH}`,
    ZH_CN_LAUNCHER_BIN_DIR: path.join(tmp, "launcher-bin"),
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /claude-code-zh-cn 更新诊断/);
  assert.match(result.stdout, /插件版本: 2\.4\.22/);
  assert.match(result.stdout, /安装来源: taekchef\/claude-code-zh-cn/);
  assert.match(result.stdout, /最近更新: ok v2\.4\.22/);
  assert.match(result.stdout, /远程安装 ref: v2\.4\.22/);
  assert.match(result.stdout, /远程安装 commit: 0123456789abcdef0123456789abcdef01234567/);
  assert.match(result.stdout, /记录的 patch 类型: npm/);
  assert.match(result.stdout, new RegExp(`记录的 patch 目标: ${patchedTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(result.stdout, /当前检测类型: npm/);
  assert.match(result.stdout, /当前检测目标:/);
  assert.match(result.stdout, /claude --version: 2\.1\.112 \(Claude Code\)/);
  assert.match(result.stdout, /which -a claude:/);
  assert.match(result.stdout, /\.last-update-status: ok v2\.4\.22 1710000000/);
});

test("diagnose.sh keeps missing state files explicit instead of failing", () => {
  const tmp = tempDir("missing");
  const pluginRoot = path.join(tmp, "plugin");

  writeFile(path.join(pluginRoot, "manifest.json"), '{ "version": "2.4.23" }\n');

  const result = runDiagnose(pluginRoot, {
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /插件版本: 2\.4\.23/);
  assert.match(result.stdout, /安装来源: 未记录/);
  assert.match(result.stdout, /最近更新: 未记录/);
  assert.match(result.stdout, /远程安装 ref: 未记录/);
  assert.match(result.stdout, /记录的 patch 类型: 未记录/);
  assert.match(result.stdout, /当前检测类型: 未检测到/);
  assert.match(result.stdout, /\.patched-target: 未记录/);
});
