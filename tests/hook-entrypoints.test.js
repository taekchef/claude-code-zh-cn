const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const sessionEntrypoint = path.join(repoRoot, "plugin", "hooks", "session-start.js");
const notificationEntrypoint = path.join(repoRoot, "plugin", "hooks", "notification.js");

test("plugin hooks use cross-platform Node exec form", () => {
  const config = JSON.parse(fs.readFileSync(path.join(repoRoot, "plugin", "hooks.json"), "utf8"));
  const session = config.hooks.SessionStart[0].hooks[0];
  const notification = config.hooks.Notification[0].hooks[0];

  assert.equal(session.command, "node");
  assert.deepEqual(session.args, ["${CLAUDE_PLUGIN_ROOT}/hooks/session-start.js"]);
  assert.equal(notification.command, "node");
  assert.deepEqual(notification.args, ["${CLAUDE_PLUGIN_ROOT}/hooks/notification.js"]);
});

test("session-start Node entrypoint forwards valid platform hook JSON", { skip: process.platform === "win32" }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-hook-entrypoint-"));
  const hooksDir = path.join(tmp, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(sessionEntrypoint, path.join(hooksDir, "session-start.js"));
  fs.writeFileSync(
    path.join(hooksDir, "session-start"),
    `#!/usr/bin/env bash
read -r input
printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"forwarded"}}'
`
  );

  const result = spawnSync("node", [path.join(hooksDir, "session-start.js")], {
    input: "{}\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, "forwarded");
});

test("Windows session-start hook preserves UTF-8 Chinese in redirected stdout", { skip: process.platform !== "win32" }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-hook-windows-utf8-"));
  const pluginRoot = path.join(tmp, "plugin");
  const hooksDir = path.join(pluginRoot, "hooks");
  const userProfile = path.join(tmp, "home");
  const pluginData = path.join(tmp, "data");
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.mkdirSync(userProfile, { recursive: true });
  fs.mkdirSync(pluginData, { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, "plugin", "hooks", "session-start.ps1"),
    path.join(hooksDir, "session-start.ps1")
  );

  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const commands = [
    path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "PowerShell", "7", "pwsh.exe"),
  ].filter((command) => fs.existsSync(command));
  assert.ok(commands.some((command) => path.basename(command).toLowerCase() === "powershell.exe"));

  const env = {
    ...process.env,
    USERPROFILE: userProfile,
    HOME: userProfile,
    TEMP: tmp,
    TMP: tmp,
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    CLAUDE_PLUGIN_DATA: pluginData,
    ZH_CN_DISABLE_AUTO_UPDATE: "1",
    PATH: [
      path.join(systemRoot, "System32"),
      path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0"),
    ].join(path.delimiter),
  };
  delete env.ZH_CN_REAL_CLAUDE;

  for (const command of commands) {
    const result = spawnSync(
      command,
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(hooksDir, "session-start.ps1")],
      { input: "{}\n", env, timeout: 30_000 }
    );

    assert.equal(result.status, 0, result.stderr.toString("utf8") || result.stdout.toString("utf8"));
    assert.equal(result.signal, null, `${command} timed out`);
    assert.equal(result.stdout.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])), false);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(result.stdout);
    const output = JSON.parse(text);
    const context = output.hookSpecificOutput.additionalContext;
    assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
    assert.match(context, /^## 中文本地化提示/);
    assert.match(context, /你正在使用中文本地化版本/);
    assert.doesNotMatch(context, /�/);
  }
});

test("standalone session entrypoint injects its own plugin root into the child hook", { skip: process.platform === "win32" }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-hook-standalone-root-"));
  const pluginRoot = path.join(tmp, "custom-plugin-root");
  const hooksDir = path.join(pluginRoot, "hooks");
  const capturedRoot = path.join(tmp, "captured-root.txt");
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(sessionEntrypoint, path.join(hooksDir, "session-start.js"));
  fs.writeFileSync(
    path.join(hooksDir, "session-start"),
    `#!/usr/bin/env bash
printf '%s' "$CLAUDE_PLUGIN_ROOT" > "$CAPTURED_ROOT"
printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"ok"}}'
`,
    { mode: 0o755 }
  );

  const env = { ...process.env, CAPTURED_ROOT: capturedRoot };
  delete env.CLAUDE_PLUGIN_ROOT;
  const result = spawnSync("node", [path.join(hooksDir, "session-start.js"), "--standalone"], {
    input: "{}\n",
    env,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(capturedRoot, "utf8"), fs.realpathSync(pluginRoot));
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.hookEventName, "SessionStart");
});

test("session-start Node entrypoint fails open with valid JSON", { skip: process.platform === "win32" }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-hook-fallback-"));
  const hooksDir = path.join(tmp, "hooks");
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(sessionEntrypoint, path.join(hooksDir, "session-start.js"));

  const result = spawnSync("node", [path.join(hooksDir, "session-start.js")], {
    input: "{}\n",
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(output.hookSpecificOutput.additionalContext, /Claude Code 本体保持原样可用/);
});

test("notification Node entrypoint translates known notices and ignores unknown ones", () => {
  const known = spawnSync("node", [notificationEntrypoint], {
    input: JSON.stringify({ message: "Rate limited by service" }),
    encoding: "utf8",
  });
  const unknown = spawnSync("node", [notificationEntrypoint], {
    input: JSON.stringify({ message: "Everything is fine" }),
    encoding: "utf8",
  });

  assert.equal(known.status, 0, known.stderr || known.stdout);
  assert.match(JSON.parse(known.stdout).hookSpecificOutput.additionalContext, /请求频率受限/);
  assert.deepEqual(JSON.parse(unknown.stdout), {});
});
