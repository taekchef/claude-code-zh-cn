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
