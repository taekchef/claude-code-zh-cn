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

  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", "zh-cn-doctor.js"), "--json"], {
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
});

test("STABLE_INSTALL_CMD pins recommended npm version", () => {
  assert.match(STABLE_INSTALL_CMD, /@2\.1\.112/);
});
