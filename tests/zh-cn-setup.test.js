const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const setupScript = path.join(repoRoot, "plugin", "skills", "zh-cn-setup", "scripts", "setup.js");
const {
  ccSwitchConfigStatus,
  fillMissingKeys,
  reportPatchStatus,
  reportSkillTranslation,
} = require(setupScript);

function makeTmpHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-setup-"));
  const home = path.join(tmp, "home");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  return { tmp, home };
}

function runSetup(home, pluginRoot, env = {}) {
  return execFileSync(process.execPath, [setupScript], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      ...env,
    },
  });
}

test("setup.js merges missing spinner config into settings.json and preserves existing keys", () => {
  const { tmp, home } = makeTmpHome();
  const settingsFile = path.join(home, ".claude", "settings.json");
  fs.writeFileSync(settingsFile, JSON.stringify({ theme: "dark", editor: "vim" }) + "\n");

  runSetup(home, path.join(repoRoot, "plugin"));

  const result = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  assert.equal(result.theme, "dark");
  assert.equal(result.editor, "vim");
  assert.equal(result.language, "Chinese");
  assert.equal(result.spinnerTipsEnabled, true);
  assert.equal(result.spinnerVerbs.mode, "replace");
  assert.ok(Array.isArray(result.spinnerVerbs.verbs) && result.spinnerVerbs.verbs.length >= 100);
  assert.ok(Array.isArray(result.spinnerTipsOverride.tips) && result.spinnerTipsOverride.tips.length >= 40);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("setup.js is idempotent and reports no change when settings already complete", () => {
  const { tmp, home } = makeTmpHome();
  const settingsFile = path.join(home, ".claude", "settings.json");
  // 预置完整配置
  const overlay = JSON.parse(
    execFileSync(process.execPath, [
      path.join(repoRoot, "plugin", "scripts", "build-overlay.js"),
      "build-overlay",
      path.join(repoRoot, "plugin"),
    ], { encoding: "utf8", cwd: repoRoot })
  );
  fs.writeFileSync(settingsFile, JSON.stringify(overlay) + "\n");

  const output = runSetup(home, path.join(repoRoot, "plugin"));
  assert.match(output, /已包含完整中文配置，无需修改/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("setup.js backs up settings.json before modifying", () => {
  const { tmp, home } = makeTmpHome();
  const settingsFile = path.join(home, ".claude", "settings.json");
  fs.writeFileSync(settingsFile, JSON.stringify({ theme: "dark" }) + "\n");

  runSetup(home, path.join(repoRoot, "plugin"));

  const backups = fs.readdirSync(path.join(home, ".claude")).filter((f) => f.startsWith("settings.json.zh-cn-backup."));
  assert.ok(backups.length >= 1, "should create a timestamped backup");

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("setup.js migrates legacy spinnerVerbs arrays without losing user values", () => {
  const { tmp, home } = makeTmpHome();
  const settingsFile = path.join(home, ".claude", "settings.json");
  const userVerbs = ["我的自定义动词"];
  fs.writeFileSync(settingsFile, JSON.stringify({ spinnerVerbs: userVerbs }) + "\n");

  runSetup(home, path.join(repoRoot, "plugin"));

  const result = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  assert.deepEqual(result.spinnerVerbs, { mode: "replace", verbs: userVerbs });
  assert.equal(result.language, "Chinese"); // 缺失项仍补齐

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("setup.js reports safe out-of-process skill translation commands", () => {
  const output = reportSkillTranslation(path.join(repoRoot, "plugin"));
  assert.match(output, /--dry-run/);
  assert.match(output, /translate-skills\.sh/);
  assert.match(output, /ZH_CN_SKILL_I18N_EXTRA_ROOTS/);
  assert.match(output, /\/reload-plugins/);
});

test("ccSwitchConfigStatus returns ok for complete config", () => {
  const overlay = { language: "Chinese", spinnerTipsEnabled: true, spinnerVerbs: { mode: "replace", verbs: new Array(150).fill("x") }, spinnerTipsOverride: { tips: new Array(41).fill("y") } };
  assert.equal(ccSwitchConfigStatus(JSON.stringify(overlay), overlay), "ok");
});

test("ccSwitchConfigStatus returns needs-sync for incomplete config", () => {
  const overlay = { language: "Chinese", spinnerTipsEnabled: true, spinnerVerbs: { mode: "replace", verbs: new Array(150).fill("x") }, spinnerTipsOverride: { tips: new Array(41).fill("y") } };
  const incomplete = JSON.stringify({ language: "English", spinnerTipsEnabled: false });
  assert.equal(ccSwitchConfigStatus(incomplete, overlay), "needs-sync");
});

test("ccSwitchConfigStatus returns invalid for non-JSON", () => {
  assert.equal(ccSwitchConfigStatus("not json", {}), "invalid");
  assert.equal(ccSwitchConfigStatus("", {}), "invalid");
});

function withPluginData(value, fn) {
  const prev = process.env.CLAUDE_PLUGIN_DATA;
  if (value === undefined) delete process.env.CLAUDE_PLUGIN_DATA;
  else process.env.CLAUDE_PLUGIN_DATA = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_PLUGIN_DATA;
    else process.env.CLAUDE_PLUGIN_DATA = prev;
  }
}

test("reportPatchStatus guides Windows native to install.ps1 -UpdateOnly when marker present", () => {
  const { tmp, home } = makeTmpHome();
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, ".patched-version"), "native|2.1.224");

  withPluginData(pluginRoot, () => {
    const out = reportPatchStatus(pluginRoot, "win32");
    assert.match(out, /已检测到 CLI patch 标记/);
    assert.match(out, /install\.ps1 -UpdateOnly/);
    assert.match(out, /完全退出所有 Claude Code 窗口/);
    assert.match(out, /不能在运行中热改/);
    assert.doesNotMatch(out, /hook 自动维护/);
  });
});

test("reportPatchStatus guides Windows native when marker missing", () => {
  const { tmp, home } = makeTmpHome();
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");

  withPluginData(pluginRoot, () => {
    const out = reportPatchStatus(pluginRoot, "win32");
    assert.match(out, /暂未检测到 CLI patch 标记/);
    assert.match(out, /手动触发/);
    assert.match(out, /install\.ps1 -UpdateOnly/);
    assert.match(out, /缓存包不含 install\.ps1/);
  });
});

test("reportPatchStatus keeps hook-based guidance on non-Windows", () => {
  const { tmp, home } = makeTmpHome();
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, ".patched-version"), "native|2.1.224");

  withPluginData(pluginRoot, () => {
    const out = reportPatchStatus(pluginRoot, "darwin");
    assert.match(out, /hook 自动维护/);
    assert.match(out, /退出所有 Claude Code 窗口后重新打开/);
    assert.doesNotMatch(out, /install\.ps1 -UpdateOnly/);
  });
});
