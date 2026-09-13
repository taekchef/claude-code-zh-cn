const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const setupScript = path.join(repoRoot, "plugin", "skills", "zh-cn-setup", "scripts", "setup.js");
const {
  ccSwitchConfigStatus,
  syncCcSwitch,
  fillMissingKeys,
  reportPatchStatus,
  reportSkillTranslation,
  resolveInstallerEntry,
} = require(setupScript);

function makeTmpHome() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-setup-"));
  const home = path.join(tmp, "home");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  return { tmp, home };
}

function bashExecutable() {
  if (process.platform !== "win32") return "bash";
  const gitExecPath = execFileSync("git", ["--exec-path"], { encoding: "utf8" }).trim();
  return path.resolve(gitExecPath, "..", "..", "..", "bin", "bash.exe");
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
    // 命令拆成 Set-Location + 相对 .\install.ps1 两行：长路径不再挤在一行里，
    // 复制时不会把结尾的扩展名截断成 .ps。install.ps1 用 $PSScriptRoot 解析路径，
    // 与当前目录无关，所以先 Set-Location 再相对调用是安全的。
    assert.match(out, /Set-Location '[^']*[\\/][^']*'/);
    assert.doesNotMatch(out, /Set-Location '[^']*install\.ps1'/);
    assert.match(out, /powershell -NoProfile -ExecutionPolicy Bypass -File \.\\install\.ps1 -UpdateOnly/);
    assert.match(out, /末尾的 1 不能漏/);
    assert.doesNotMatch(out, /-File install\.ps1/);
  });
});

test("reportPatchStatus resolves Windows installer from marketplace checkout outside cwd", () => {
  const { tmp, home } = makeTmpHome();
  const pluginRoot = path.join(home, ".claude", "plugins", "cache", "claude-code-zh-cn", "claude-code-zh-cn", "2.12.1");
  const marketplaceRoot = path.join(home, ".claude", "plugins", "marketplaces", "O'Brien $Plugin Source");
  const knownMarketplaces = path.join(home, ".claude", "plugins", "known_marketplaces.json");
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(path.join(marketplaceRoot, "plugin"), { recursive: true });
  fs.writeFileSync(path.join(marketplaceRoot, "install.ps1"), "# fixture\n");
  fs.writeFileSync(path.join(marketplaceRoot, "plugin", "patch-cli.js"), "// fixture\n");
  fs.mkdirSync(path.dirname(knownMarketplaces), { recursive: true });
  fs.writeFileSync(knownMarketplaces, JSON.stringify({
    "taekchef": {
      source: { source: "github", repo: "taekchef/claude-code-zh-cn" },
      installLocation: marketplaceRoot,
    },
  }));

  const previousCwd = process.cwd();
  process.chdir(os.tmpdir());
  try {
    const entry = resolveInstallerEntry(pluginRoot, "win32", home);
    const out = reportPatchStatus(pluginRoot, "win32", { home });
    assert.equal(entry, path.join(marketplaceRoot, "install.ps1"));
    // 解析出的目录进 Set-Location（单引号内的 ' 需转义成 ''），安装器本体走相对路径
    assert.match(out, /Set-Location '.*O''Brien \$Plugin Source'/);
    assert.match(out, /powershell -NoProfile -ExecutionPolicy Bypass -File \.\\install\.ps1 -UpdateOnly/);
    assert.doesNotMatch(out, /-File install\.ps1/);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("reportPatchStatus gives clone guidance when Windows marketplace checkout is unavailable", () => {
  const { tmp, home } = makeTmpHome();
  const pluginRoot = path.join(home, ".claude", "plugins", "cache", "claude-code-zh-cn", "claude-code-zh-cn", "2.12.1");
  fs.mkdirSync(pluginRoot, { recursive: true });

  const out = reportPatchStatus(pluginRoot, "win32", { home });
  assert.equal(resolveInstallerEntry(pluginRoot, "win32", home), null);
  assert.match(out, /未找到包含 install\.ps1 的 marketplace 源码目录/);
  assert.match(out, /git clone https:\/\/github\.com\/taekchef\/claude-code-zh-cn\.git/);
  assert.doesNotMatch(out, /-File install\.ps1/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test("reportPatchStatus resolves POSIX installer and quotes paths with spaces", () => {
  const { tmp, home } = makeTmpHome();
  const pluginRoot = path.join(home, ".claude", "plugins", "cache", "claude-code-zh-cn", "claude-code-zh-cn", "2.12.1");
  const marketplaceRoot = path.join(home, ".claude", "plugins", "marketplaces", "Chinese $Plugin's Source");
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.mkdirSync(path.join(marketplaceRoot, "plugin"), { recursive: true });
  fs.writeFileSync(path.join(marketplaceRoot, "install.sh"), "#!/bin/sh\n");
  fs.writeFileSync(path.join(marketplaceRoot, "plugin", "patch-cli.sh"), "#!/bin/sh\n");
  fs.writeFileSync(path.join(home, ".claude", "plugins", "known_marketplaces.json"), JSON.stringify({
    "taekchef": {
      source: { source: "github", repo: "taekchef/claude-code-zh-cn" },
      installLocation: marketplaceRoot,
    },
  }));

  const entry = resolveInstallerEntry(pluginRoot, "linux", home);
  const out = reportPatchStatus(pluginRoot, "linux", { home });
  const macOut = reportPatchStatus(pluginRoot, "darwin", { home });
  assert.equal(entry, path.join(marketplaceRoot, "install.sh"));
  assert.match(out, /bash '.*Chinese \$Plugin'\\''s Source[\\/]install\.sh' --update-only/);
  assert.match(macOut, /bash '.*Chinese \$Plugin'\\''s Source[\\/]install\.sh' --update-only/);
  const command = out.split("\n").find((line) => line.trimStart().startsWith("bash ")).trim();
  const parsed = execFileSync(bashExecutable(), ["-c", `set -- ${command.slice(5, -" --update-only".length)}; printf '%s' "$1"`], {
    encoding: "utf8",
  });
  assert.equal(parsed, entry);

  fs.rmSync(tmp, { recursive: true, force: true });
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

// Real database regression: no sqlite3 executable is needed on Node 24.
for (const backend of ["node", "sqlite3"]) {
test(`CC Switch ${backend} sync preserves existing fields and rejects invalid config`, {
  skip: backend === "sqlite3" && spawnSync("sqlite3", ["--version"]).status !== 0 ? "requires sqlite3" : false,
}, () => {
  const { DatabaseSync } = require("node:sqlite");
  const { tmp, home } = makeTmpHome();
  const dbFile = path.join(home, ".cc-switch", "cc-switch.db");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new DatabaseSync(dbFile);
  db.exec("create table settings(key text primary key, value text)");
  const original = { includeCoAuthoredBy: false, enabledPlugins: { "claude-code-zh-cn@claude-code-zh-cn": true }, spinnerTipsOverride: { custom: "preserved" } };
  const put = db.prepare("insert or replace into settings values(?, ?)");
  const read = () => db.prepare("select value from settings where key=?").get("common_config_claude").value;
  try {
    put.run("common_config_claude", JSON.stringify(original));
    runSetup(home, path.join(repoRoot, "plugin"), { ZH_CN_CCSWITCH_SYNC: "1", ...(backend === "sqlite3" ? { NODE_OPTIONS: "--no-experimental-sqlite" } : { PATH: "" }) });
    const merged = JSON.parse(read());
    assert.equal(merged.includeCoAuthoredBy, false);
    assert.deepEqual(merged.enabledPlugins, original.enabledPlugins);
    assert.equal(merged.spinnerTipsOverride.custom, "preserved");
    assert.equal(merged.language, "Chinese");
    assert.ok(merged.spinnerTipsOverride.tips.length >= 40);
    for (const invalid of ["not json", "[]", "null"]) {
      put.run("common_config_claude", invalid);
      const result = backend === "node"
        ? syncCcSwitch(dbFile, { language: "Chinese" })
        : JSON.parse(execFileSync(process.execPath, ["--no-experimental-sqlite", "-e",
          'process.stdout.write(JSON.stringify(require(process.argv[1]).syncCcSwitch(process.argv[2], {language:"Chinese"})))',
          setupScript, dbFile], { encoding: "utf8" }));
      assert.equal(result.ok, false);
      assert.equal(read(), invalid);
    }
  } finally {
    db.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

}
