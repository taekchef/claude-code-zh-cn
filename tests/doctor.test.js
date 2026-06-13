const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const { runDoctor, STABLE_INSTALL_CMD } = require(path.join(repoRoot, "scripts", "zh-cn-doctor.js"));

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function hasSqlite3() {
  return !spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).error;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function createCcSwitchDb(home, commonConfig, providers = []) {
  const dbFile = path.join(home, ".cc-switch", "cc-switch.db");
  const configFile = path.join(home, "common_config_claude.json");
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  writeJson(configFile, commonConfig);

  const providerSql = providers.length > 0
    ? [
        "create table providers (id text not null, app_type text not null, name text not null, settings_config text not null, meta text not null default '{}', is_current boolean not null default 0, sort_index integer, primary key(id, app_type));",
        ...providers.map((provider, index) => (
          `insert into providers(id,app_type,name,settings_config,meta,is_current,sort_index) values(${sqlString(provider.id)},${sqlString(provider.appType || "claude")},${sqlString(provider.name)},'{}',${sqlString(JSON.stringify(provider.meta || {}))},${provider.isCurrent ? 1 : 0},${index});`
        )),
      ]
    : [];

  const result = spawnSync(
    "sqlite3",
    [
      dbFile,
      [
        "create table settings (key text primary key, value text);",
        `insert into settings(key,value) values('common_config_claude', CAST(readfile(${sqlString(configFile)}) AS TEXT));`,
        ...providerSql,
      ].join(" ")
    ],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return dbFile;
}

function createFakeNpmClaudeLayout(home, cliBodyLines) {
  const cliFile = path.join(
    home,
    "lib",
    "node_modules",
    "@anthropic-ai",
    "claude-code",
    "cli.js"
  );
  const claudeBin = path.join(home, "bin", "claude");
  const relativeCli = path
    .relative(path.dirname(claudeBin), cliFile)
    .split(path.sep)
    .join("/");

  fs.mkdirSync(path.dirname(cliFile), { recursive: true });
  fs.mkdirSync(path.dirname(claudeBin), { recursive: true });
  fs.writeFileSync(cliFile, cliBodyLines.join("\n"));
  fs.writeFileSync(
    claudeBin,
    `#!/usr/bin/env node\nrequire(${JSON.stringify(relativeCli)});\n`,
    { mode: 0o755 }
  );

  return { cliFile, claudeBin };
}

function createFakeNativeDoctorPlugin(pluginRoot, {
  version = "2.1.150",
  depStatus = "ok",
  targetPath = "C:\\\\fake\\\\claude.exe",
  marker = "",
  supportWindow = {},
} = {}) {
  fs.mkdirSync(pluginRoot, { recursive: true });
  writeJson(path.join(pluginRoot, "manifest.json"), { name: "claude-code-zh-cn", version: "9.9.9" });
  writeJson(path.join(pluginRoot, "support-window.json"), supportWindow);
  fs.writeFileSync(
    path.join(pluginRoot, "bun-binary-io.js"),
    `#!/usr/bin/env node
const cmd = process.argv[2];
if (cmd === "detect") process.stdout.write("native-bun:" + ${JSON.stringify(targetPath)});
else if (cmd === "version") process.stdout.write(${JSON.stringify(version)});
else if (cmd === "check-deps") process.stdout.write(${JSON.stringify(depStatus)});
else if (cmd === "hash") process.stdout.write("fakehash");
else process.stdout.write("");
`
  );
  if (marker) {
    fs.writeFileSync(path.join(pluginRoot, ".patched-version"), marker);
  }
}

function createHealthyRuntimeDoctorFixture() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-runtime-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const { claudeBin } = createFakeNpmClaudeLayout(home, [
    "#!/usr/bin/env node",
    "// Version: 2.1.112",
    'const x="快速安全检查";',
    "",
  ]);

  writeJson(path.join(pluginRoot, "manifest.json"), { name: "claude-code-zh-cn", version: "9.9.9" });
  fs.cpSync(path.join(repoRoot, "plugin", "support-window.json"), path.join(pluginRoot, "support-window.json"));
  fs.cpSync(path.join(repoRoot, "bun-binary-io.js"), path.join(pluginRoot, "bun-binary-io.js"));
  fs.writeFileSync(path.join(pluginRoot, ".patched-version"), "2.1.112|deadbeef\n");
  writeJson(path.join(home, ".claude", "settings.json"), {
    language: "Chinese",
    spinnerVerbs: Object.fromEntries(
      Array.from({ length: 120 }, (_, index) => [`Verb${index}`, `动词${index}`])
    ),
  });

  return { home, pluginRoot, claudeBin };
}

test("runDoctor reports missing plugin and recommends install", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-"));

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    json: true,
    color: false,
  });

  const plugin = result.checks.find((item) => item.id === "plugin");
  assert.equal(plugin.status, "fail");
  assert.ok(result.recommendations.some((line) => line.includes("./install.sh")));
  assert.equal(result.ok, false);
});

test("runDoctor reports invalid plugin manifest instead of crashing", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");

  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, "manifest.json"), "{broken json\n");

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    json: true,
    color: false,
  });

  const plugin = result.checks.find((item) => item.id === "plugin");
  assert.equal(plugin.status, "fail");
  assert.match(plugin.detail, /manifest\.json/);
  assert.equal(result.ok, false);
});

test("runDoctor detects unpatched npm cli and stable version guidance", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const { claudeBin } = createFakeNpmClaudeLayout(home, [
    "#!/usr/bin/env node",
    "// Version: 2.1.112",
    'const x="Quick safety check";',
    "",
  ]);

  writeJson(path.join(pluginRoot, "manifest.json"), { name: "claude-code-zh-cn", version: "9.9.9" });
  fs.cpSync(path.join(repoRoot, "plugin", "support-window.json"), path.join(pluginRoot, "support-window.json"));
  fs.cpSync(path.join(repoRoot, "bun-binary-io.js"), path.join(pluginRoot, "bun-binary-io.js"));

  writeJson(path.join(home, ".claude", "settings.json"), {
    language: "Chinese",
    spinnerVerbs: { Thinking: "思考中" },
  });

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: claudeBin,
    json: true,
    color: false,
  });

  const layer4 = result.checks.find((item) => item.id === "layer4");
  assert.equal(layer4.status, "fail");
  assert.ok(result.recommendations.some((line) => line.includes("./install.sh")));
  assert.equal(result.cliVersion, "2.1.112");
  assert.equal(result.ok, false);
});

test("runDoctor checks all known npm residue probes before reporting Layer 4 ok", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const { claudeBin } = createFakeNpmClaudeLayout(home, [
    "#!/usr/bin/env node",
    "// Version: 2.1.112",
    'const safety="快速安全检查";',
    'const approval="This command requires approval";',
    'const btw="Use /btw to ask a quick side question without interrupting Claude\'s current work";',
    "",
  ]);

  writeJson(path.join(pluginRoot, "manifest.json"), { name: "claude-code-zh-cn", version: "9.9.9" });
  fs.cpSync(path.join(repoRoot, "plugin", "support-window.json"), path.join(pluginRoot, "support-window.json"));
  fs.cpSync(path.join(repoRoot, "bun-binary-io.js"), path.join(pluginRoot, "bun-binary-io.js"));
  fs.writeFileSync(path.join(pluginRoot, ".patched-version"), "2.1.112|deadbeef\n");

  writeJson(path.join(home, ".claude", "settings.json"), {
    language: "Chinese",
    spinnerVerbs: Object.fromEntries(
      Array.from({ length: 120 }, (_, index) => [`Verb${index}`, `动词${index}`])
    ),
  });

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: claudeBin,
    json: true,
    color: false,
  });

  const layer4 = result.checks.find((item) => item.id === "layer4");
  assert.equal(layer4.status, "fail");
  assert.match(layer4.detail, /This command requires approval/);
  assert.match(layer4.detail, /Use \/btw/);
  assert.equal(result.ok, false);
});

test("runDoctor passes when npm cli sentinel is translated", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const { claudeBin } = createFakeNpmClaudeLayout(home, [
    "#!/usr/bin/env node",
    "// Version: 2.1.112",
    'const x="快速安全检查";',
    "",
  ]);

  writeJson(path.join(pluginRoot, "manifest.json"), { name: "claude-code-zh-cn", version: "9.9.9" });
  fs.cpSync(path.join(repoRoot, "plugin", "support-window.json"), path.join(pluginRoot, "support-window.json"));
  fs.cpSync(path.join(repoRoot, "bun-binary-io.js"), path.join(pluginRoot, "bun-binary-io.js"));
  fs.writeFileSync(path.join(pluginRoot, ".patched-version"), "2.1.112|deadbeef\n");

  writeJson(path.join(home, ".claude", "settings.json"), {
    language: "Chinese",
    spinnerVerbs: Object.fromEntries(
      Array.from({ length: 120 }, (_, index) => [`Verb${index}`, `动词${index}`])
    ),
  });

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: claudeBin,
    json: true,
    color: false,
  });

  const layer4 = result.checks.find((item) => item.id === "layer4");
  assert.equal(layer4.status, "ok");
  assert.equal(result.ok, true);
  assert.equal(result.checks.some((item) => item.status === "fail"), false);
});

test("runDoctor counts current spinnerVerbs object shape", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");

  writeJson(path.join(pluginRoot, "manifest.json"), { name: "claude-code-zh-cn", version: "9.9.9" });
  writeJson(path.join(home, ".claude", "settings.json"), {
    language: "Chinese",
    spinnerVerbs: {
      mode: "replace",
      verbs: Array.from({ length: 187 }, (_, index) => `动词${index}`),
    },
  });

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: "",
    json: true,
    color: false,
  });

  const settings = result.checks.find((item) => item.id === "settings");
  assert.equal(settings.status, "ok");
  assert.match(settings.detail, /187/);
});

test("runDoctor classifies HTTP 200 malformed as upstream or proxy issue", () => {
  const { home, pluginRoot, claudeBin } = createHealthyRuntimeDoctorFixture();

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: claudeBin,
    runtimeError: "API returned an empty or malformed response (HTTP 200)",
    json: true,
    color: false,
  });

  const runtime = result.checks.find((item) => item.id === "runtime-error");
  assert.equal(runtime.status, "warn");
  assert.match(runtime.detail, /不是汉化没生效/);
  assert.equal(result.runtimeIssue.code, "http-200-malformed");
  assert.equal(result.runtimeIssue.category, "upstream-or-proxy");
  assert.ok(result.recommendations.some((line) => line.includes("ANTHROPIC_BASE_URL")));
});

test("runDoctor classifies proxy and gateway chain signals separately", () => {
  const { home, pluginRoot, claudeBin } = createHealthyRuntimeDoctorFixture();

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: claudeBin,
    runtimeError: "CC Switch -> EvoMap gateway ECONNREFUSED 127.0.0.1:15721",
    json: true,
    color: false,
  });

  const runtime = result.checks.find((item) => item.id === "runtime-error");
  assert.equal(runtime.status, "warn");
  assert.match(runtime.detail, /代理\/网关链路异常/);
  assert.equal(result.runtimeIssue.code, "proxy-gateway-chain");
  assert.ok(result.recommendations.some((line) => line.includes("provider 名")));
});

test("runDoctor warns when CC Switch common Claude config is missing zh-cn overlay", { skip: hasSqlite3() ? false : "requires sqlite3" }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-ccswitch-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");

  writeJson(path.join(pluginRoot, "manifest.json"), { name: "claude-code-zh-cn", version: "9.9.9" });
  writeJson(path.join(home, ".claude", "settings.json"), {
    language: "Chinese",
    spinnerVerbs: {
      mode: "replace",
      verbs: Array.from({ length: 187 }, (_, index) => `动词${index}`),
    },
  });
  createCcSwitchDb(home, { env: { ANTHROPIC_BASE_URL: "https://example.test" } });

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: "",
    json: true,
    color: false,
  });

  const ccSwitch = result.checks.find((item) => item.id === "cc-switch");
  assert.equal(ccSwitch.status, "warn");
  assert.match(ccSwitch.detail, /未包含完整中文设置/);
  assert.ok(result.recommendations.some((line) => line.includes("同意同步 CC Switch 通用配置")));
});

test("runDoctor accepts complete CC Switch common Claude config", { skip: hasSqlite3() ? false : "requires sqlite3" }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-ccswitch-ok-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");

  writeJson(path.join(pluginRoot, "manifest.json"), { name: "claude-code-zh-cn", version: "9.9.9" });
  writeJson(path.join(home, ".claude", "settings.json"), {
    language: "Chinese",
    spinnerVerbs: {
      mode: "replace",
      verbs: Array.from({ length: 187 }, (_, index) => `动词${index}`),
    },
  });
  createCcSwitchDb(home, {
    language: "Chinese",
    spinnerTipsEnabled: true,
    spinnerVerbs: {
      mode: "replace",
      verbs: Array.from({ length: 187 }, (_, index) => `动词${index}`),
    },
    spinnerTipsOverride: {
      excludeDefault: true,
      tips: Array.from({ length: 41 }, (_, index) => `提示${index}`),
    },
  });

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: "",
    json: true,
    color: false,
  });

  const ccSwitch = result.checks.find((item) => item.id === "cc-switch");
  assert.equal(ccSwitch.status, "ok");
  assert.match(ccSwitch.detail, /187/);
  assert.match(ccSwitch.detail, /41/);
});

test("runDoctor warns when CC Switch Claude providers do not write common config", { skip: hasSqlite3() ? false : "requires sqlite3" }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-ccswitch-providers-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");

  writeJson(path.join(pluginRoot, "manifest.json"), { name: "claude-code-zh-cn", version: "9.9.9" });
  writeJson(path.join(home, ".claude", "settings.json"), {
    language: "Chinese",
    spinnerVerbs: {
      mode: "replace",
      verbs: Array.from({ length: 187 }, (_, index) => `动词${index}`),
    },
  });
  createCcSwitchDb(
    home,
    {
      language: "Chinese",
      spinnerTipsEnabled: true,
      spinnerVerbs: {
        mode: "replace",
        verbs: Array.from({ length: 187 }, (_, index) => `动词${index}`),
      },
      spinnerTipsOverride: {
        excludeDefault: true,
        tips: Array.from({ length: 41 }, (_, index) => `提示${index}`),
      },
    },
    [
      { id: "deepseek", name: "DeepSeek", meta: { apiFormat: "anthropic" } },
      { id: "zhipu", name: "Zhipu GLM", meta: { apiFormat: "anthropic", commonConfigEnabled: true } },
    ]
  );

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: "",
    json: true,
    color: false,
  });

  const ccSwitch = result.checks.find((item) => item.id === "cc-switch");
  assert.equal(ccSwitch.status, "warn");
  assert.match(ccSwitch.detail, /DeepSeek/);
  assert.ok(result.recommendations.some((line) => line.includes("勾选写入通用配置")));
});

test("runDoctor does not treat macOS native support as Windows native support", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const targetPath = path.join(home, "claude.exe");

  fs.writeFileSync(targetPath, "fake exe");
  createFakeNativeDoctorPlugin(pluginRoot, {
    targetPath,
    supportWindow: {
      macosNativeExperimental: {
        platform: "darwin-arm64",
        versions: ["2.1.150"],
      },
    },
  });

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: targetPath,
    json: true,
    color: false,
  });

  const layer4 = result.checks.find((item) => item.id === "layer4");
  const updater = result.checks.find((item) => item.id === "claude-updater");
  assert.equal(layer4.status, "warn");
  assert.match(layer4.detail, /不在已验证支持窗口/);
  assert.match(updater.detail, /DISABLE_AUTOUPDATER/);
  assert.ok(result.recommendations.some((line) => line.includes("docs/support-matrix.md")));
  assert.equal(result.layer4Status, "unsupported");
});

test("runDoctor reports supported Windows native as needing node-lief or patch", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const targetPath = path.join(home, "claude.exe");
  const supportWindow = {
    windowsNativeExperimental: {
      platform: "win32-x64",
      versions: ["2.1.150"],
    },
  };

  fs.writeFileSync(targetPath, "fake exe");
  createFakeNativeDoctorPlugin(pluginRoot, {
    targetPath,
    depStatus: "missing",
    supportWindow,
  });

  const missingDeps = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: targetPath,
    json: true,
    color: false,
  });

  let layer4 = missingDeps.checks.find((item) => item.id === "layer4");
  assert.equal(layer4.status, "fail");
  assert.equal(missingDeps.layer4Status, "needs-deps");
  assert.ok(missingDeps.recommendations.some((line) => line.includes("node-lief")));

  createFakeNativeDoctorPlugin(pluginRoot, {
    targetPath,
    depStatus: "ok",
    supportWindow,
  });

  const needsPatch = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: targetPath,
    json: true,
    color: false,
  });

  layer4 = needsPatch.checks.find((item) => item.id === "layer4");
  assert.equal(layer4.status, "warn");
  assert.equal(needsPatch.layer4Status, "needed");
  assert.ok(needsPatch.recommendations.some((line) => line.includes("install.sh")));

  createFakeNativeDoctorPlugin(pluginRoot, {
    targetPath,
    depStatus: "ok",
    marker: "native|2.1.150|fakehash|\n",
    supportWindow,
  });

  const ok = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: targetPath,
    json: true,
    color: false,
  });

  layer4 = ok.checks.find((item) => item.id === "layer4");
  assert.equal(layer4.status, "ok");
  assert.equal(ok.layer4Status, "ok");
});

test("runDoctor reports provisional native marker without treating it as published support", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const targetPath = path.join(home, "claude.exe");

  fs.writeFileSync(targetPath, "fake exe");
  createFakeNativeDoctorPlugin(pluginRoot, {
    version: "2.1.153",
    targetPath,
    depStatus: "ok",
    marker: "native|2.1.153|fakehash||provisional|win32-x64|sourcehash\n",
    supportWindow: {
      windowsNativeExperimental: {
        platform: "win32-x64",
        versions: ["2.1.152"],
        ceiling: "2.1.152",
      },
    },
  });

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: targetPath,
    json: true,
    color: false,
  });

  const marker = result.checks.find((item) => item.id === "patch-marker");
  const layer4 = result.checks.find((item) => item.id === "layer4");
  const updater = result.checks.find((item) => item.id === "claude-updater");
  assert.match(marker.detail, /provisional/);
  assert.equal(layer4.status, "warn");
  assert.match(layer4.detail, /本机自验证/);
  assert.match(layer4.detail, /尚未纳入已发布支持窗口/);
  assert.match(updater.detail, /DISABLE_AUTOUPDATER/);
  assert.ok(result.recommendations.some((line) => line.includes("docs/support-matrix.md")));
  assert.ok(result.recommendations.some((line) => line.includes("Updates")));
  assert.equal(result.layer4Status, "provisional");
});

test("runDoctor requires native marker hash to match current binary", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const targetPath = path.join(home, "claude.exe");

  fs.writeFileSync(targetPath, "fake exe");
  createFakeNativeDoctorPlugin(pluginRoot, {
    targetPath,
    depStatus: "ok",
    marker: "native|2.1.150|stalehash|\n",
    supportWindow: {
      windowsNativeExperimental: {
        platform: "win32-x64",
        versions: ["2.1.150"],
      },
    },
  });

  const result = runDoctor({
    repoRoot,
    homeDir: home,
    pluginRoot,
    claudePath: targetPath,
    json: true,
    color: false,
  });

  const layer4 = result.checks.find((item) => item.id === "layer4");
  assert.equal(layer4.status, "warn");
  assert.match(layer4.detail, /hash/);
  assert.equal(result.layer4Status, "needed");
});

test("doctor.sh --json surfaces env overrides", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doctor-cli-"));
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");

  writeJson(path.join(pluginRoot, "manifest.json"), { name: "claude-code-zh-cn", version: "1.0.0" });
  writeJson(path.join(home, ".claude", "settings.json"), {
    language: "Chinese",
    spinnerVerbs: Object.fromEntries(
      Array.from({ length: 120 }, (_, index) => [`Verb${index}`, `动词${index}`])
    ),
  });

  const result = spawnSync(process.execPath, [
    path.join(repoRoot, "scripts", "zh-cn-doctor.js"),
    "--json",
    "--runtime-error",
    "Access denied (403)",
  ], {
    encoding: "utf8",
    env: {
      ...process.env,
      ZH_CN_DOCTOR_HOME: home,
      ZH_CN_DOCTOR_PLUGIN_ROOT: pluginRoot,
      ZH_CN_DOCTOR_CLAUDE: "",
      PATH: path.join(home, "empty-bin"),
      NO_COLOR: "1",
    },
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.checks.some((item) => item.id === "plugin" && item.status === "ok"), true);
  assert.equal(payload.checks.some((item) => item.id === "claude" && item.status === "fail"), true);
  assert.equal(payload.runtimeIssue.code, "access-denied-403");
});

test("STABLE_INSTALL_CMD pins recommended npm version", () => {
  assert.match(STABLE_INSTALL_CMD, /@2\.1\.112/);
});
