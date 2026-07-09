const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const unixShellRequired = process.platform === "win32" ? "covered by Unix CI" : false;

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function createFakeClaude(tmp, mode) {
  const binDir = path.join(tmp, "bin");
  const cli = path.join(binDir, "claude");
  const log = path.join(tmp, "claude-calls.log");
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    cli,
    `#!/usr/bin/env bash
set -u
printf '%s\\n' "$*" >> "$ZH_CN_FAKE_CLAUDE_LOG"

if [ "\${1:-}" = "plugin" ] && [ "\${2:-}" = "marketplace" ] && [ "\${3:-}" = "list" ]; then
  if [ "$ZH_CN_FAKE_CLAUDE_MODE" = "uninstall-success" ]; then
    if [ -f "$ZH_CN_FAKE_CLAUDE_STATE_DIR/marketplace-removed" ]; then printf '%s\\n' '[]';
    else printf '%s\\n' '[{"name":"claude-code-zh-cn","source":"directory"}]'; fi
    exit 0
  fi
  if [ "$ZH_CN_FAKE_CLAUDE_MODE" = "success" ] || [ "$ZH_CN_FAKE_CLAUDE_MODE" = "reinstall-update" ] || [ "$ZH_CN_FAKE_CLAUDE_MODE" = "disabled-installed" ]; then
    printf '%s\\n' '[{"name":"claude-code-zh-cn","source":"directory"}]'
    exit 0
  fi
  exit 1
fi

if [ "\${1:-}" = "plugin" ] && [ "\${2:-}" = "list" ]; then
  if [ "$ZH_CN_FAKE_CLAUDE_MODE" = "uninstall-success" ]; then
    if [ -f "$ZH_CN_FAKE_CLAUDE_STATE_DIR/plugin-removed" ]; then printf '%s\\n' '[]';
    else printf '[{"id":"claude-code-zh-cn@claude-code-zh-cn","scope":"user","enabled":true,"version":"%s"}]\\n' "$ZH_CN_FAKE_PLUGIN_VERSION"; fi
    exit 0
  fi
  if [ "$ZH_CN_FAKE_CLAUDE_MODE" = "reinstall-update" ]; then
    if [ -f "$ZH_CN_FAKE_CLAUDE_STATE_DIR/plugin-installed" ]; then
      version=$(cat "$ZH_CN_FAKE_CLAUDE_STATE_DIR/plugin-version")
      printf '[{"id":"claude-code-zh-cn@claude-code-zh-cn","scope":"user","enabled":true,"version":"%s"}]\\n' "$version"
    else
      printf '%s\\n' '[]'
    fi
    exit 0
  fi
  if [ "$ZH_CN_FAKE_CLAUDE_MODE" = "disabled-installed" ]; then
    printf '[{"id":"claude-code-zh-cn@claude-code-zh-cn","scope":"user","enabled":false,"version":"%s"}]\\n' "$ZH_CN_FAKE_PLUGIN_VERSION"
    exit 0
  fi
  if [ "$ZH_CN_FAKE_CLAUDE_MODE" = "success" ]; then
    printf '[{"id":"claude-code-zh-cn@claude-code-zh-cn","scope":"user","enabled":true,"version":"%s"}]\\n' "$ZH_CN_FAKE_PLUGIN_VERSION"
    exit 0
  fi
  exit 1
fi

if [ "\${1:-}" = "plugin" ] && [ "\${2:-}" = "marketplace" ] && [ "\${3:-}" = "add" ]; then
  if [ "$ZH_CN_FAKE_CLAUDE_MODE" = "success" ] || [ "$ZH_CN_FAKE_CLAUDE_MODE" = "install-fails" ] || [ "$ZH_CN_FAKE_CLAUDE_MODE" = "reinstall-update" ] || [ "$ZH_CN_FAKE_CLAUDE_MODE" = "disabled-installed" ]; then
    exit 0
  fi
  exit 1
fi

if [ "\${1:-}" = "plugin" ] && [ "\${2:-}" = "marketplace" ] && [ "\${3:-}" = "update" ]; then
  if [ "$ZH_CN_FAKE_CLAUDE_MODE" = "success" ] || [ "$ZH_CN_FAKE_CLAUDE_MODE" = "install-fails" ] || [ "$ZH_CN_FAKE_CLAUDE_MODE" = "reinstall-update" ] || [ "$ZH_CN_FAKE_CLAUDE_MODE" = "disabled-installed" ]; then exit 0; fi
  exit 1
fi

if [ "\${1:-}" = "plugin" ] && [ "\${2:-}" = "uninstall" ] && [ "$ZH_CN_FAKE_CLAUDE_MODE" = "uninstall-success" ]; then
  touch "$ZH_CN_FAKE_CLAUDE_STATE_DIR/plugin-removed"
  exit 0
fi

if [ "\${1:-}" = "plugin" ] && [ "\${2:-}" = "marketplace" ] && [ "\${3:-}" = "remove" ] && [ "$ZH_CN_FAKE_CLAUDE_MODE" = "uninstall-success" ]; then
  touch "$ZH_CN_FAKE_CLAUDE_STATE_DIR/marketplace-removed"
  exit 0
fi

if [ "\${1:-}" = "plugin" ] && [ "\${2:-}" = "install" ]; then
  if [ "$ZH_CN_FAKE_CLAUDE_MODE" = "reinstall-update" ]; then
    if [ -f "$ZH_CN_FAKE_CLAUDE_STATE_DIR/plugin-installed" ]; then exit 1; fi
    touch "$ZH_CN_FAKE_CLAUDE_STATE_DIR/plugin-installed"
    printf '%s' "$ZH_CN_FAKE_PLUGIN_VERSION" > "$ZH_CN_FAKE_CLAUDE_STATE_DIR/plugin-version"
    exit 0
  fi
  if [ "$ZH_CN_FAKE_CLAUDE_MODE" = "success" ] || [ "$ZH_CN_FAKE_CLAUDE_MODE" = "disabled-installed" ]; then
    exit 0
  fi
  exit 1
fi

if [ "\${1:-}" = "plugin" ] && [ "\${2:-}" = "update" ]; then
  if [ "$ZH_CN_FAKE_CLAUDE_MODE" = "reinstall-update" ]; then
    touch "$ZH_CN_FAKE_CLAUDE_STATE_DIR/plugin-updated"
    printf '%s' "$ZH_CN_FAKE_PLUGIN_VERSION" > "$ZH_CN_FAKE_CLAUDE_STATE_DIR/plugin-version"
    exit 0
  fi
  if [ "$ZH_CN_FAKE_CLAUDE_MODE" = "disabled-installed" ]; then exit 0; fi
fi

if [ "\${1:-}" = "plugin" ]; then exit 1; fi

printf '%s\\n' '2.2.0 (Claude Code)'
`,
    { mode: 0o755 }
  );
  return { cli, log, mode };
}

function createInstallSource(tmp) {
  const source = path.join(tmp, "source");
  for (const relative of [
    "install.sh",
    "uninstall.sh",
    "compute-patch-revision.sh",
    "settings-overlay.json",
    ".claude-plugin",
    "plugin",
    "scripts/install-json-helper.js",
    "tips",
    "verbs",
  ]) {
    fs.cpSync(path.join(repoRoot, relative), path.join(source, relative), { recursive: true });
  }
  fs.writeFileSync(
    path.join(source, "plugin", "bun-binary-io.js"),
    `#!/usr/bin/env node
const command = process.argv[2];
if (command === "detect") process.stdout.write("unknown:" + process.argv[3]);
else if (command === "check-deps") process.stdout.write("missing");
else process.exit(1);
`
  );
  return source;
}

function createInstallContext(mode) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-plugin-registration-"));
  const home = path.join(tmp, "home");
  const settingsFile = path.join(home, ".claude", "settings.json");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn-standalone");
  const profileFile = path.join(home, ".zshrc");
  const fake = createFakeClaude(tmp, mode);
  const source = createInstallSource(tmp);
  const pluginVersion = JSON.parse(
    fs.readFileSync(path.join(source, "plugin", ".claude-plugin", "plugin.json"), "utf8")
  ).version;

  writeJson(settingsFile, {
    model: "keep-me",
    hooks: {
      Stop: [
        {
          matcher: "",
          hooks: [{ type: "command", command: "/usr/local/bin/custom-stop" }],
        },
      ],
    },
  });

  return {
    tmp,
    home,
    settingsFile,
    pluginRoot,
    source,
    fake,
    env: {
      ...process.env,
      HOME: home,
      PATH: `${path.dirname(fake.cli)}:${process.env.PATH || ""}`,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      ZH_CN_REAL_CLAUDE: fake.cli,
      ZH_CN_LAUNCHER_BIN_DIR: path.join(home, ".claude", "bin"),
      ZH_CN_PROFILE_FILES: profileFile,
      ZH_CN_FAKE_CLAUDE_LOG: fake.log,
      ZH_CN_FAKE_CLAUDE_MODE: mode,
      ZH_CN_FAKE_CLAUDE_STATE_DIR: tmp,
      ZH_CN_FAKE_PLUGIN_VERSION: pluginVersion,
      GIT_TERMINAL_PROMPT: "0",
    },
  };
}

function runInstall(context, args = []) {
  return spawnSync("/bin/bash", [path.join(context.source, "install.sh"), ...args], {
    cwd: context.source,
    env: context.env,
    encoding: "utf8",
  });
}

function allHooks(settings) {
  const hooks = [];
  for (const entries of Object.values(settings.hooks || {})) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      for (const hook of Array.isArray(entry?.hooks) ? entry.hooks : []) {
        hooks.push(hook);
      }
    }
  }
  return hooks;
}

function standaloneHooks(settings, pluginRoot) {
  return allHooks(settings).filter((hook) =>
    hook?.command === "node" &&
    Array.isArray(hook.args) &&
    hook.args.includes("--standalone") &&
    [
      path.join(pluginRoot, "hooks", "session-start.js"),
      path.join(pluginRoot, "hooks", "notification.js"),
    ].includes(hook.args[0])
  );
}

test("install registers and verifies the official user plugin without duplicate fallback hooks", { skip: unixShellRequired }, () => {
  const context = createInstallContext("success");
  const before = JSON.parse(fs.readFileSync(context.settingsFile, "utf8"));
  before.hooks.SessionStart = [
    {
      matcher: "startup|resume|clear|compact",
      hooks: [
        {
          type: "command",
          command: "node",
          args: [path.join(context.pluginRoot, "hooks", "session-start.js"), "--standalone"],
        },
      ],
    },
  ];
  writeJson(context.settingsFile, before);
  const result = runInstall(context);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  const calls = fs.readFileSync(context.fake.log, "utf8");
  assert.match(calls, new RegExp(`plugin marketplace add --scope user ${context.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(calls, /plugin install claude-code-zh-cn@claude-code-zh-cn --scope user/);
  assert.match(calls, /plugin marketplace list --json/);
  assert.match(calls, /plugin list --json/);
  assert.match(output, /官方插件注册已验证/);

  const settings = JSON.parse(fs.readFileSync(context.settingsFile, "utf8"));
  assert.equal(settings.model, "keep-me");
  assert.deepEqual(settings.hooks.Stop, [
    {
      matcher: "",
      hooks: [{ type: "command", command: "/usr/local/bin/custom-stop" }],
    },
  ]);
  assert.equal(
    standaloneHooks(settings, context.pluginRoot).length,
    0,
    "verified official hooks must not be duplicated in settings.json"
  );
});

test("install does not add fallback hooks when an enabled official record cannot be re-verified", { skip: unixShellRequired }, () => {
  const context = createInstallContext("install-fails");
  const before = JSON.parse(fs.readFileSync(context.settingsFile, "utf8"));
  before.enabledPlugins = { "claude-code-zh-cn@claude-code-zh-cn": true };
  writeJson(context.settingsFile, before);

  const result = runInstall(context);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /检测到已有启用记录，为避免重复 Hook，未注入备用 Hook/);

  const settings = JSON.parse(fs.readFileSync(context.settingsFile, "utf8"));
  assert.equal(settings.enabledPlugins["claude-code-zh-cn@claude-code-zh-cn"], true);
  assert.equal(
    standaloneHooks(settings, context.pluginRoot).length,
    0
  );
});

test("install respects an explicitly disabled official plugin without enabling fallback hooks", { skip: unixShellRequired }, () => {
  const context = createInstallContext("disabled-installed");
  const before = JSON.parse(fs.readFileSync(context.settingsFile, "utf8"));
  before.enabledPlugins = { "claude-code-zh-cn@claude-code-zh-cn": false };
  writeJson(context.settingsFile, before);

  const result = runInstall(context);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /已明确停用.*不加载备用 Hook/);

  const settings = JSON.parse(fs.readFileSync(context.settingsFile, "utf8"));
  assert.equal(settings.enabledPlugins["claude-code-zh-cn@claude-code-zh-cn"], false);
  assert.equal(standaloneHooks(settings, context.pluginRoot).length, 0);
  const calls = fs.readFileSync(context.fake.log, "utf8");
  assert.doesNotMatch(calls, /plugin install claude-code-zh-cn@claude-code-zh-cn/);
  assert.match(calls, /plugin update claude-code-zh-cn@claude-code-zh-cn --scope user/);
});

test("install falls back to one standalone hook set when official plugin installation fails", { skip: unixShellRequired }, () => {
  const context = createInstallContext("install-fails");
  const first = runInstall(context);
  const firstOutput = `${first.stdout}\n${first.stderr}`;

  assert.equal(first.status, 0, firstOutput);
  assert.match(firstOutput, /官方插件注册未完成（官方插件安装失败）/);
  assert.match(firstOutput, /已启用独立备用 Hook/);

  const second = runInstall(context);
  assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);

  const settings = JSON.parse(fs.readFileSync(context.settingsFile, "utf8"));
  assert.equal(settings.model, "keep-me");
  assert.deepEqual(settings.hooks.Stop, [
    {
      matcher: "",
      hooks: [{ type: "command", command: "/usr/local/bin/custom-stop" }],
    },
  ]);

  const fallbacks = standaloneHooks(settings, context.pluginRoot);
  assert.equal(fallbacks.length, 2, "reinstall must replace, not duplicate, the fallback hook set");
  assert.deepEqual(
    fallbacks.map((hook) => hook.args[0]).sort(),
    [
      path.join(context.pluginRoot, "hooks", "notification.js"),
      path.join(context.pluginRoot, "hooks", "session-start.js"),
    ].sort()
  );
  assert.equal(fs.existsSync(path.join(context.pluginRoot, "hooks", "session-start.js")), true);
  assert.equal(fs.existsSync(path.join(context.pluginRoot, "hooks", "notification.js")), true);
});

test("reinstall updates an existing user plugin when repeated install returns nonzero", { skip: unixShellRequired }, () => {
  const context = createInstallContext("reinstall-update");
  const first = runInstall(context);
  assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);

  const second = runInstall(context);
  const secondOutput = `${second.stdout}\n${second.stderr}`;
  assert.equal(second.status, 0, secondOutput);
  assert.match(secondOutput, /官方插件注册已验证/);
  assert.equal(fs.existsSync(path.join(context.tmp, "plugin-updated")), true);

  const calls = fs.readFileSync(context.fake.log, "utf8");
  assert.equal((calls.match(/plugin install claude-code-zh-cn@claude-code-zh-cn --scope user/g) || []).length, 2);
  assert.match(calls, /plugin update claude-code-zh-cn@claude-code-zh-cn --scope user/);

  const settings = JSON.parse(fs.readFileSync(context.settingsFile, "utf8"));
  assert.equal(standaloneHooks(settings, context.pluginRoot).length, 0);
});

test("update-only refreshes an existing official plugin when staging omits the root marketplace manifest", { skip: unixShellRequired }, () => {
  const context = createInstallContext("reinstall-update");
  const first = runInstall(context);
  assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);

  const manifestFile = path.join(context.source, "plugin", ".claude-plugin", "plugin.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  const parts = manifest.version.split(".").map(Number);
  manifest.version = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  writeJson(manifestFile, manifest);
  context.env.ZH_CN_FAKE_PLUGIN_VERSION = manifest.version;
  fs.rmSync(path.join(context.source, ".claude-plugin"), { recursive: true, force: true });

  const update = runInstall(context, ["--update-only"]);
  const output = `${update.stdout}\n${update.stderr}`;
  assert.equal(update.status, 0, output);
  assert.match(output, /官方插件注册已验证/);
  assert.equal(fs.readFileSync(path.join(context.tmp, "plugin-version"), "utf8"), manifest.version);

  const calls = fs.readFileSync(context.fake.log, "utf8");
  assert.match(calls, /plugin marketplace update claude-code-zh-cn/);
  assert.match(calls, /plugin update claude-code-zh-cn@claude-code-zh-cn --scope user/);
  const settings = JSON.parse(fs.readFileSync(context.settingsFile, "utf8"));
  assert.equal(standaloneHooks(settings, context.pluginRoot).length, 0);
});

test("uninstall removes only this official plugin, marketplace, and fallback hooks", { skip: unixShellRequired }, () => {
  const context = createInstallContext("uninstall-success");
  fs.mkdirSync(context.pluginRoot, { recursive: true });
  fs.writeFileSync(path.join(context.pluginRoot, "owned.txt"), "owned\n");
  writeJson(context.settingsFile, {
    model: "keep-me",
    enabledPlugins: {
      "claude-code-zh-cn@claude-code-zh-cn": true,
      "claude-code-zh-cn@local-zh-cn": true,
      "other-plugin@example": true,
    },
    extraKnownMarketplaces: {
      "claude-code-zh-cn": { source: { source: "directory", path: context.source } },
      "local-zh-cn": { path: context.source },
      "other-market": { path: "/tmp/other" },
    },
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume|clear|compact",
          hooks: [
            {
              type: "command",
              command: "node",
              args: [path.join(context.pluginRoot, "hooks", "session-start.js"), "--standalone"],
            },
            { type: "command", command: "/usr/local/bin/custom-session-start" },
          ],
        },
      ],
      Stop: [
        {
          matcher: "",
          hooks: [
            { type: "command", command: "/usr/local/bin/audit --label claude-code-zh-cn" },
          ],
        },
      ],
    },
  });

  const result = spawnSync("/bin/bash", [path.join(context.source, "uninstall.sh")], {
    cwd: context.source,
    env: context.env,
    encoding: "utf8",
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0, output);
  const calls = fs.readFileSync(context.fake.log, "utf8");
  assert.match(calls, /plugin uninstall claude-code-zh-cn@claude-code-zh-cn --scope user/);
  assert.match(calls, /plugin marketplace remove --scope user claude-code-zh-cn/);
  assert.match(calls, /plugin list --json/);
  assert.match(calls, /plugin marketplace list --json/);
  assert.match(output, /官方插件注册已移除并验证/);

  const settings = JSON.parse(fs.readFileSync(context.settingsFile, "utf8"));
  assert.equal(settings.model, "keep-me");
  assert.deepEqual(settings.enabledPlugins, { "other-plugin@example": true });
  assert.deepEqual(settings.extraKnownMarketplaces, { "other-market": { path: "/tmp/other" } });
  assert.deepEqual(settings.hooks.SessionStart, [
    {
      matcher: "startup|resume|clear|compact",
      hooks: [{ type: "command", command: "/usr/local/bin/custom-session-start" }],
    },
  ]);
  assert.deepEqual(settings.hooks.Stop, [
    {
      matcher: "",
      hooks: [{ type: "command", command: "/usr/local/bin/audit --label claude-code-zh-cn" }],
    },
  ]);
  assert.equal(fs.existsSync(context.pluginRoot), false);
});

test("uninstall keeps another plugin's generic CLAUDE_PLUGIN_ROOT hook without legacy local registration", { skip: unixShellRequired }, () => {
  const context = createInstallContext("uninstall-success");
  fs.mkdirSync(context.pluginRoot, { recursive: true });
  writeJson(context.settingsFile, {
    enabledPlugins: {
      "claude-code-zh-cn@claude-code-zh-cn": true,
      "other-plugin@example": true,
    },
    extraKnownMarketplaces: {
      "claude-code-zh-cn": { source: { source: "directory", path: context.source } },
      "other-market": { path: "/tmp/other" },
    },
    hooks: {
      SessionStart: [
        {
          matcher: "startup",
          hooks: [{ type: "command", command: "'${CLAUDE_PLUGIN_ROOT}/hooks/session-start'" }],
        },
      ],
    },
  });

  const result = spawnSync("/bin/bash", [path.join(context.source, "uninstall.sh")], {
    cwd: context.source,
    env: context.env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const settings = JSON.parse(fs.readFileSync(context.settingsFile, "utf8"));
  assert.deepEqual(settings.enabledPlugins, { "other-plugin@example": true });
  assert.deepEqual(settings.extraKnownMarketplaces, { "other-market": { path: "/tmp/other" } });
  assert.deepEqual(settings.hooks.SessionStart, [
    {
      matcher: "startup",
      hooks: [{ type: "command", command: "'${CLAUDE_PLUGIN_ROOT}/hooks/session-start'" }],
    },
  ]);
});

test("Windows install and uninstall scripts mirror the verified official-plugin lifecycle", () => {
  const install = fs.readFileSync(path.join(repoRoot, "install.ps1"), "utf8");
  const uninstall = fs.readFileSync(path.join(repoRoot, "uninstall.ps1"), "utf8");

  assert.match(install, /\$OfficialPluginId = "claude-code-zh-cn@claude-code-zh-cn"/);
  assert.match(install, /function register-official-plugin \{/);
  assert.match(install, /plugin marketplace add --scope user \$marketplaceSource/);
  assert.match(install, /plugin install \$OfficialPluginId --scope user/);
  assert.match(install, /plugin update \$OfficialPluginId --scope user/);
  assert.match(install, /plugin marketplace list --json/);
  assert.match(install, /plugin list --json/);
  assert.match(install, /function reconcile-standalone-hooks \{/);
  assert.match(install, /--standalone/);
  assert.match(install, /path\.join\(pluginRoot,"hooks","session-start\.js"\)/);
  assert.match(install, /path\.join\(pluginRoot,"hooks","notification\.js"\)/);
  assert.match(install, /sync-plugin[\s\S]+register-official-plugin[\s\S]+merge-settings[\s\S]+reconcile-standalone-hooks/);

  assert.match(uninstall, /\$OfficialPluginId = "claude-code-zh-cn@claude-code-zh-cn"/);
  assert.match(uninstall, /plugin uninstall \$OfficialPluginId --scope user/);
  assert.match(uninstall, /plugin marketplace remove --scope user \$OfficialMarketplaceName/);
  assert.match(uninstall, /plugin marketplace list --json/);
  assert.match(uninstall, /plugin list --json/);
  assert.match(uninstall, /claude-code-zh-cn@claude-code-zh-cn/);
  assert.match(uninstall, /--standalone/);
});
