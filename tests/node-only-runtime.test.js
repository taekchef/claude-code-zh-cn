const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

function locateCommand(command) {
  return execFileSync("/usr/bin/which", [command], { encoding: "utf8" }).trim();
}

function linkCommands(binDir, commands) {
  fs.mkdirSync(binDir, { recursive: true });
  for (const command of commands) {
    fs.symlinkSync(locateCommand(command), path.join(binDir, command));
  }
}

function hasSqlite3() {
  return !spawnSync("sqlite3", ["--version"], { encoding: "utf8" }).error;
}

function hasCommand(command) {
  return spawnSync("/usr/bin/which", [command], { encoding: "utf8" }).status === 0;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

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

test("install.sh works without python3 when node is available", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-node-only-install-"));
  const home = path.join(tmp, "home");
  const binDir = path.join(tmp, "bin");

  fs.mkdirSync(home, { recursive: true });
  linkCommands(binDir, ["node", "cp", "mkdir", "find", "chmod", "cat", "sed", "head", "which", "date", "tr", "dirname"]);

  const result = spawnSync("/bin/bash", [path.join(repoRoot, "install.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      PATH: binDir,
      ZH_CN_SKIP_BANNER: "1",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const settings = JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
  assert.equal(settings.language, "Chinese");
  assert.equal(fs.existsSync(path.join(home, ".claude", "plugins", "claude-code-zh-cn", "manifest.json")), true);
});

test("install.sh update-only still works when archived without install-json-helper", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-node-only-install-fallback-"));
  const source = path.join(tmp, "source");
  const home = path.join(tmp, "home");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");

  for (const relative of ["install.sh", "compute-patch-revision.sh", "settings-overlay.json"]) {
    copyTree(path.join(repoRoot, relative), path.join(source, relative));
  }
  for (const relative of ["plugin", "tips", "verbs"]) {
    copyTree(path.join(repoRoot, relative), path.join(source, relative));
  }

  const result = spawnSync("/bin/bash", [path.join(source, "install.sh"), "--update-only"], {
    cwd: source,
    env: {
      ...process.env,
      HOME: home,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      ZH_CN_SKIP_BANNER: "1",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const settings = JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
  assert.equal(settings.language, "Chinese");
  assert.equal(fs.existsSync(path.join(pluginRoot, "manifest.json")), true);
});

test("install.sh syncs CC Switch common config only with consent", { skip: hasSqlite3() ? false : "requires sqlite3" }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-node-only-ccswitch-"));
  const home = path.join(tmp, "home");
  const binDir = path.join(tmp, "bin");
  const dbFile = path.join(home, ".cc-switch", "cc-switch.db");
  const seedFile = path.join(tmp, "common_config_claude.json");

  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.writeFileSync(seedFile, `${JSON.stringify({ env: { ANTHROPIC_BASE_URL: "https://example.test" } }, null, 2)}\n`);
  execFileSync("sqlite3", [
    dbFile,
    [
      "create table settings (key text primary key, value text);",
      "create table providers (id text not null, app_type text not null, name text not null, settings_config text not null, meta text not null default '{}', is_current boolean not null default 0, primary key(id, app_type));",
      `insert into settings(key,value) values('common_config_claude', CAST(readfile(${sqlString(seedFile)}) AS TEXT));`,
      `insert into providers(id,app_type,name,settings_config,meta,is_current) values('deepseek','claude','DeepSeek','{}',${sqlString(JSON.stringify({ apiFormat: "anthropic" }))},0);`,
      `insert into providers(id,app_type,name,settings_config,meta,is_current) values('xavier','claude','Xavier','{}',${sqlString(JSON.stringify({ apiFormat: "anthropic", commonConfigEnabled: false }))},0);`,
      `insert into providers(id,app_type,name,settings_config,meta,is_current) values('codex','codex','Codex','{}',${sqlString(JSON.stringify({ apiFormat: "openai" }))},0);`,
    ].join(" ")
  ]);

  linkCommands(binDir, ["node", "sqlite3", "cp", "mkdir", "find", "chmod", "cat", "sed", "head", "which", "date", "tr", "dirname", "mktemp", "rm"]);

  const skipped = spawnSync("/bin/bash", [path.join(repoRoot, "install.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      PATH: binDir,
      ZH_CN_SKIP_BANNER: "1",
    },
    encoding: "utf8",
  });
  assert.equal(skipped.status, 0, skipped.stderr || skipped.stdout);

  let ccSwitch = JSON.parse(
    execFileSync("sqlite3", [dbFile, "select value from settings where key='common_config_claude';"], {
      encoding: "utf8",
    })
  );
  assert.equal(ccSwitch.language, undefined);
  let providerMeta = JSON.parse(
    execFileSync("sqlite3", [dbFile, "select meta from providers where id='deepseek' and app_type='claude';"], {
      encoding: "utf8",
    })
  );
  assert.equal(providerMeta.commonConfigEnabled, undefined);

  const quietUpdate = spawnSync("/bin/bash", [path.join(repoRoot, "install.sh"), "--update-only"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      PATH: binDir,
    },
    encoding: "utf8",
  });
  assert.equal(quietUpdate.status, 0, quietUpdate.stderr || quietUpdate.stdout);
  assert.equal(`${quietUpdate.stdout}${quietUpdate.stderr}`.includes("CC Switch"), false);

  const forced = spawnSync("/bin/bash", [path.join(repoRoot, "install.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      PATH: binDir,
      ZH_CN_SKIP_BANNER: "1",
      ZH_CN_CCSWITCH_SYNC: "1",
    },
    encoding: "utf8",
  });
  assert.equal(forced.status, 0, forced.stderr || forced.stdout);

  ccSwitch = JSON.parse(
    execFileSync("sqlite3", [dbFile, "select value from settings where key='common_config_claude';"], {
      encoding: "utf8",
    })
  );
  assert.equal(ccSwitch.language, "Chinese");
  assert.equal(ccSwitch.spinnerTipsEnabled, true);
  assert.equal(ccSwitch.spinnerVerbs.mode, "replace");
  assert.equal(ccSwitch.spinnerVerbs.verbs.length, 187);
  assert.equal(ccSwitch.spinnerTipsOverride.tips.length, 41);
  assert.equal(ccSwitch.env.ANTHROPIC_BASE_URL, "https://example.test");

  const providerMetaById = Object.fromEntries(
    execFileSync("sqlite3", [
      dbFile,
      "select id || char(9) || meta from providers order by app_type, id;",
    ], { encoding: "utf8" })
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const [id, meta] = line.split("\t");
        return [id, JSON.parse(meta)];
      })
  );
  assert.equal(providerMetaById.deepseek.commonConfigEnabled, true);
  assert.equal(providerMetaById.deepseek.apiFormat, "anthropic");
  assert.equal(providerMetaById.xavier.commonConfigEnabled, true);
  assert.equal(providerMetaById.xavier.apiFormat, "anthropic");
  assert.equal(providerMetaById.codex.commonConfigEnabled, undefined);

  assert.equal(
    fs.readFileSync(path.join(home, ".claude", "plugins", "claude-code-zh-cn", ".ccswitch-sync-consent"), "utf8").trim(),
    "allow"
  );

  fs.writeFileSync(seedFile, "{}\n");
  execFileSync("sqlite3", [
    dbFile,
    [
      `update settings set value=CAST(readfile(${sqlString(seedFile)}) AS TEXT) where key='common_config_claude';`,
      `update providers set meta=${sqlString(JSON.stringify({ apiFormat: "anthropic", commonConfigEnabled: false }))} where id='deepseek' and app_type='claude';`,
    ].join(" ")
  ]);

  const remembered = spawnSync("/bin/bash", [path.join(repoRoot, "install.sh"), "--update-only"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      PATH: binDir,
      ZH_CN_SKIP_BANNER: "1",
    },
    encoding: "utf8",
  });
  assert.equal(remembered.status, 0, remembered.stderr || remembered.stdout);

  ccSwitch = JSON.parse(
    execFileSync("sqlite3", [dbFile, "select value from settings where key='common_config_claude';"], {
      encoding: "utf8",
    })
  );
  assert.equal(ccSwitch.language, "Chinese");
  assert.equal(ccSwitch.spinnerVerbs.verbs.length, 187);
  providerMeta = JSON.parse(
    execFileSync("sqlite3", [dbFile, "select meta from providers where id='deepseek' and app_type='claude';"], {
      encoding: "utf8",
    })
  );
  assert.equal(providerMeta.commonConfigEnabled, true);
  assert.ok(fs.readdirSync(path.dirname(dbFile)).some((name) => name.startsWith("cc-switch.db.zh-cn-backup.")));
});

test("install.sh respects stored CC Switch manual choice", { skip: hasSqlite3() ? false : "requires sqlite3" }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-node-only-ccswitch-manual-"));
  const home = path.join(tmp, "home");
  const binDir = path.join(tmp, "bin");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
  const dbFile = path.join(home, ".cc-switch", "cc-switch.db");
  const seedFile = path.join(tmp, "common_config_claude.json");

  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, ".ccswitch-sync-consent"), "manual\n");
  fs.writeFileSync(seedFile, "{}\n");
  execFileSync("sqlite3", [
    dbFile,
    [
      "create table settings (key text primary key, value text);",
      `insert into settings(key,value) values('common_config_claude', CAST(readfile(${sqlString(seedFile)}) AS TEXT));`,
    ].join(" ")
  ]);

  linkCommands(binDir, ["node", "sqlite3", "cp", "mkdir", "find", "chmod", "cat", "sed", "head", "which", "date", "tr", "dirname", "mktemp", "rm"]);

  const result = spawnSync("/bin/bash", [path.join(repoRoot, "install.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      PATH: binDir,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(`${result.stdout}${result.stderr}`.includes("手动处理"), false);
  assert.equal(`${result.stdout}${result.stderr}`.includes("CC Switch"), false);

  const ccSwitch = JSON.parse(
    execFileSync("sqlite3", [dbFile, "select value from settings where key='common_config_claude';"], {
      encoding: "utf8",
    })
  );
  assert.equal(ccSwitch.language, undefined);
  assert.equal(
    fs.readFileSync(path.join(pluginRoot, ".ccswitch-sync-consent"), "utf8").trim(),
    "manual"
  );
});

test("uninstall.sh removes zh-cn settings without python3 or jq", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-node-only-uninstall-"));
  const home = path.join(tmp, "home");
  const binDir = path.join(tmp, "bin");
  const settingsPath = path.join(home, ".claude", "settings.json");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.mkdirSync(pluginRoot, { recursive: true });
  linkCommands(binDir, ["node", "rm", "which", "cp", "tr"]);

  fs.writeFileSync(settingsPath, JSON.stringify({
    language: "Chinese",
    spinnerTipsEnabled: true,
    spinnerTipsOverride: { excludeDefault: true, tips: ["a"] },
    spinnerVerbs: ["做"],
    enabledPlugins: {
      "claude-code-zh-cn@local-zh-cn": true,
      "other-plugin@example": true,
    },
    extraKnownMarketplaces: {
      "local-zh-cn": { path: "/tmp/local-zh-cn" },
      "other-market": { path: "/tmp/other" },
    },
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume",
          hooks: [
            { type: "command", command: `node ${path.join(home, ".claude", "plugins", "claude-code-zh-cn", "hooks-handlers", "session-start.js")}` },
            { type: "command", command: "'${CLAUDE_PLUGIN_ROOT}/hooks/session-start'" },
            { type: "command", command: "/usr/local/bin/custom-same-matcher" },
          ],
        },
        {
          matcher: "startup",
          hooks: [{ type: "command", command: "/usr/local/bin/custom-session-start" }],
        },
      ],
      Notification: [
        {
          matcher: "",
          hooks: [{ type: "command", command: "node /tmp/local-zh-cn/hooks-handlers/notification.js" }],
        },
      ],
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: "/usr/local/bin/custom-guard" }],
        },
      ],
      PostToolUse: [],
    },
    theme: "dark",
  }, null, 2));
  const settingsWithoutBom = fs.readFileSync(settingsPath, "utf8");
  fs.writeFileSync(settingsPath, `\uFEFF${settingsWithoutBom}`);

  const result = spawnSync("/bin/bash", [path.join(repoRoot, "uninstall.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      PATH: binDir,
      CLAUDE_PLUGIN_ROOT: path.join(home, ".claude", "plugins", "claude-code-zh-cn"),
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.equal("language" in settings, false);
  assert.equal("spinnerTipsEnabled" in settings, false);
  assert.equal("spinnerTipsOverride" in settings, false);
  assert.equal("spinnerVerbs" in settings, false);
  assert.deepEqual(settings.enabledPlugins, { "other-plugin@example": true });
  assert.deepEqual(settings.extraKnownMarketplaces, { "other-market": { path: "/tmp/other" } });
  assert.equal(settings.hooks.SessionStart.length, 2);
  assert.equal(settings.hooks.SessionStart[0].matcher, "startup|resume");
  assert.deepEqual(settings.hooks.SessionStart[0].hooks, [{ type: "command", command: "/usr/local/bin/custom-same-matcher" }]);
  assert.equal(settings.hooks.SessionStart[1].hooks[0].command, "/usr/local/bin/custom-session-start");
  assert.equal("Notification" in settings.hooks, false);
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, "/usr/local/bin/custom-guard");
  assert.deepEqual(settings.hooks.PostToolUse, []);
  assert.equal(settings.theme, "dark");
});

test("uninstall.sh jq fallback removes plugin registrations and hooks", { skip: hasCommand("jq") ? false : "requires jq" }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-jq-uninstall-"));
  const home = path.join(tmp, "home");
  const binDir = path.join(tmp, "bin");
  const settingsPath = path.join(home, ".claude", "settings.json");
  const pluginRoot = path.join(home, ".claude", "plugins", "claude-code-zh-cn");

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.mkdirSync(pluginRoot, { recursive: true });
  linkCommands(binDir, ["jq", "rm", "mv", "which", "cp", "tr", "rmdir", "dirname", "readlink"]);

  fs.writeFileSync(settingsPath, JSON.stringify({
    language: "Chinese",
    spinnerTipsEnabled: true,
    spinnerTipsOverride: { excludeDefault: true, tips: ["a"] },
    spinnerVerbs: ["做"],
    enabledPlugins: {
      "claude-code-zh-cn@local-zh-cn": true,
      "other-plugin@example": true,
    },
    extraKnownMarketplaces: {
      "local-zh-cn": { path: "/tmp/local-zh-cn" },
      "other-market": { path: "/tmp/other" },
    },
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume",
          hooks: [
            { type: "command", command: "'${CLAUDE_PLUGIN_ROOT}/hooks/session-start'" },
            { type: "command", command: "/usr/local/bin/custom-same-matcher" },
          ],
        },
        {
          matcher: "startup",
          hooks: [{ type: "command", command: "/usr/local/bin/custom-session-start" }],
        },
      ],
      Notification: [
        {
          matcher: "",
          hooks: [{ type: "command", command: "node /tmp/local-zh-cn/hooks-handlers/notification.js" }],
        },
      ],
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: "/usr/local/bin/custom-guard" }],
        },
      ],
      PostToolUse: [],
    },
    theme: "dark",
  }, null, 2));

  const result = spawnSync("/bin/bash", [path.join(repoRoot, "uninstall.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      PATH: binDir,
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      ZH_CN_PROFILE_FILES: "\n",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  assert.equal("language" in settings, false);
  assert.equal("spinnerTipsEnabled" in settings, false);
  assert.equal("spinnerTipsOverride" in settings, false);
  assert.equal("spinnerVerbs" in settings, false);
  assert.deepEqual(settings.enabledPlugins, { "other-plugin@example": true });
  assert.deepEqual(settings.extraKnownMarketplaces, { "other-market": { path: "/tmp/other" } });
  assert.equal(settings.hooks.SessionStart.length, 2);
  assert.equal(settings.hooks.SessionStart[0].matcher, "startup|resume");
  assert.deepEqual(settings.hooks.SessionStart[0].hooks, [{ type: "command", command: "/usr/local/bin/custom-same-matcher" }]);
  assert.equal(settings.hooks.SessionStart[1].hooks[0].command, "/usr/local/bin/custom-session-start");
  assert.equal("Notification" in settings.hooks, false);
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, "/usr/local/bin/custom-guard");
  assert.deepEqual(settings.hooks.PostToolUse, []);
  assert.equal(settings.theme, "dark");
});

test("uninstall.sh keeps custom launcher files without the zh-cn marker", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-node-only-custom-launcher-"));
  const home = path.join(tmp, "home");
  const binDir = path.join(tmp, "bin");
  const launcherBin = path.join(home, ".claude", "bin");
  const launcherFile = path.join(launcherBin, "claude");

  fs.mkdirSync(launcherBin, { recursive: true });
  linkCommands(binDir, ["node", "rm", "which", "cp", "tr", "rmdir"]);
  fs.writeFileSync(launcherFile, "#!/usr/bin/env bash\nprintf 'custom launcher\\n'\n");
  fs.chmodSync(launcherFile, 0o755);

  const result = spawnSync("/bin/bash", [path.join(repoRoot, "uninstall.sh")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: home,
      PATH: binDir,
      ZH_CN_LAUNCHER_BIN_DIR: launcherBin,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(launcherFile), true, "custom launcher should not be removed");
  assert.match(result.stdout, /检测到自定义 launcher，未自动删除/);
});

test("notification hook translates messages without python3", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-node-only-notification-"));
  const binDir = path.join(tmp, "bin");

  linkCommands(binDir, ["node", "cat"]);

  const result = spawnSync("/bin/bash", [path.join(repoRoot, "plugin", "hooks", "notification")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: binDir,
    },
    input: JSON.stringify({ message: "Rate limited" }),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /请求频率受限/);
});
