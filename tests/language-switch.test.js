const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const hookFile = path.join(repoRoot, "plugin", "hooks", "user-prompt-submit.js");

function runHook(home, prompt) {
  return spawnSync(process.execPath, [hookFile], {
    input: JSON.stringify({ prompt }),
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: path.join(repoRoot, "plugin"),
      CCZH_DRY_RUN: "",
      // 只保留 node 所在目录，确保 detectInstallation 找不到 claude，测试只验证设置层
      PATH: path.dirname(process.execPath),
    },
    windowsHide: true,
  });
}

test("/chinese merges language + spinner settings and blocks the prompt", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-lang-"));
  const settingsFile = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, "{}\n");

  const result = runHook(home, "/chinese");
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.decision, "block");
  assert.match(output.reason, /已切换为中文/);

  const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  assert.equal(settings.language, "Chinese");
  assert.equal(settings.spinnerTipsEnabled, true);
  assert.ok(Array.isArray(settings.spinnerVerbs.verbs));
  assert.ok(settings.spinnerVerbs.verbs.length >= 100);
});

test("/english removes language + spinner settings and blocks the prompt", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-lang-"));
  const settingsFile = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(
    settingsFile,
    JSON.stringify({ language: "Chinese", spinnerTipsEnabled: true, keep: "user-value" })
  );

  const result = runHook(home, "/english");
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.decision, "block");
  assert.match(output.reason, /已切换为英文/);

  const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  assert.equal(settings.language, undefined);
  assert.equal(settings.spinnerTipsEnabled, undefined);
  assert.equal(settings.keep, "user-value");
});

test("ordinary prompts pass through untouched", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-lang-"));
  const result = runHook(home, "写一个测试");
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {});
});

test("plugin hooks.json wires UserPromptSubmit to the Node entrypoint", () => {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, "plugin", "hooks.json"), "utf8"));
  const entry = config.hooks.UserPromptSubmit[0];
  assert.equal(entry.hooks[0].command, "node");
  assert.deepEqual(entry.hooks[0].args, ["${CLAUDE_PLUGIN_ROOT}/hooks/user-prompt-submit.js"]);
  assert.equal(entry.hooks[0].timeout, 120);
});

test("command stubs exist for /chinese /english /zh /en", () => {
  for (const name of ["chinese", "english", "zh", "en"]) {
    const file = path.join(repoRoot, "plugin", "commands", `${name}.md`);
    assert.ok(fs.existsSync(file), `${file} missing`);
    assert.match(fs.readFileSync(file, "utf8"), /disable-model-invocation:\s*true/);
  }
});
