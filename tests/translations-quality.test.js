const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

function loadTranslations() {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, "cli-translations.json"), "utf8")
  );
}

function translationMap() {
  return new Map(loadTranslations().map((entry) => [entry.en, entry.zh]));
}

function loadCompatConfig() {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, "scripts", "upstream-compat.config.json"), "utf8")
  );
}

test("high-visibility translations use the curated wording", () => {
  const map = translationMap();
  const expected = new Map([
    ["/btw for side question", "/btw 题外问题"],
    ["Ask a quick side question without interrupting the main conversation", "提一个题外问题，不打断主对话"],
    ["Use /btw to ask a quick side question without interrupting Claude's current work", "用 /btw 提一个题外问题，不打断 Claude 当前工作"],
    ["Do you want to use this API key?", "要使用此 API 密钥吗？"],
    ["Allowed Unix Sockets:", "允许的 Unix domain socket："],
    ["Cannot block unix domain sockets (see Dependencies tab)", "无法阻止 Unix domain socket（参见依赖标签页）"],
    ["Manage marketplaces", "管理插件市场"],
    ["Select marketplace", "选择插件市场"],
    ["Update marketplace", "更新插件市场"],
    ["Updating marketplace…", "正在更新插件市场…"],
    ["Remove marketplace", "移除插件市场"],
    ["No plugin errors", "没有插件错误"],
    ["No plugins available.", "没有可用插件。"],
    ["Plugin Command Usage:", "插件命令用法："],
    ["Sandbox is not enabled", "沙盒未启用"],
    ["Sandbox is not enabled. Enable sandbox to configure override settings.", "沙盒未启用。启用沙盒后才能配置覆盖设置。"],
    ["Strict sandbox mode:", "严格沙盒模式："],
    ["sandbox disabled", "沙盒已禁用"],
    ["Computer Use needs macOS permissions", "计算机使用需要 macOS 权限"],
    ["Computer Use wants to control these apps", "计算机使用想要控制这些应用"],
    [" Voice mode is now available · /voice to enable", " 语音模式现已可用 · 用 /voice 启用"],
    ["Enter to apply", "按 Enter 应用"],
    ["Enter to auth", "按 Enter 进行认证"],
    ["Enter to confirm · Esc to cancel", "按 Enter 确认 · 按 Esc 取消"],
    ["Enter to confirm · Esc to skip", "按 Enter 确认 · 按 Esc 跳过"],
    ["Enter to continue", "按 Enter 继续"],
    ["Enter to select ·", "按 Enter 选择 ·"],
    [" · /plugin for details", " · 用 /plugin 查看详情"],
    [" · Run /reload-plugins to apply", " · 运行 /reload-plugins 以生效"],
    ["Run /reload-plugins to apply changes", "运行 /reload-plugins 以应用更改"],
    [" · enter to collapse", " · 按 Enter 折叠"],
    [" · enter to view", " · 按 Enter 查看"],
    ["Enter: Save configuration", "按 Enter 保存配置"],
    ["Press Enter to continue", "按 Enter 继续"],
    ["Press Enter once you've installed the app", "安装完成后按 Enter"],
    ["Press Enter or Esc to go back", "按 Enter 或 Esc 返回"],
    ["Press ↑↓ to navigate · Enter to select · Esc to go back", "按 ↑↓ 导航 · 按 Enter 选择 · 按 Esc 返回"],
    ["Press ↑↓ to navigate, Enter to select, Esc to cancel", "按 ↑↓ 导航，按 Enter 选择，按 Esc 取消"],
    ["Your bash commands will be sandboxed. Disable with /sandbox.", "你的 bash 命令将在沙箱中运行。可用 /sandbox 禁用。"],
    ["say its name to get its take · /buddy pet · /buddy off", "喊它的名字听听它的看法 · /buddy pet · /buddy off"],
    ["Use /clear to start fresh when switching topics and free up context", "切换话题时可用 /clear 重新开始，并释放上下文"],
    ["Cannot block unix domain sockets (see Dependencies tab)", "无法阻止 Unix domain socket（见依赖标签页）"],
    [" (required to block unix domain sockets)", " （阻止 Unix domain socket 时需要）"],
    ["Allow unsandboxed fallback:", "允许回退到非沙盒模式："],
    ["Commands cannot run outside the sandbox under any circumstances.", "任何情况下都不允许在沙盒外运行命令。"],
    ["Evidence of sandbox-caused failures includes:", "沙盒导致失败的迹象包括："],
    ["The sandbox has the following restrictions:", "沙盒存在以下限制："],
    ["When you see evidence of sandbox-caused failure:", "当你看到沙盒导致失败的迹象时："],
    ["Try running /plugin to manually install the think-back plugin.", "可以尝试运行 /plugin 手动安装 think-back 插件。"],
    ["plugin - Manage installed plugins", "插件 - 管理已安装插件"],
  ]);

  for (const [en, zh] of expected) {
    assert.equal(map.get(en), zh, `translation drift for: ${en}`);
  }
});

test("upstream compat config keeps the required english sentinels", () => {
  const expected = [
    "Quick safety check",
    "Security guide",
    "Use /btw to ask a quick side question without interrupting Claude's current work",
    "This command requires approval",
    "Do you want to proceed?",
    "Tab to amend",
    "ctrl+e to explain",
  ];
  const sentinels = loadCompatConfig().checks.sentinels.map((entry) => entry.pattern);
  assert.deepEqual(sentinels, expected);
});

test("translations avoid legacy half-translated phrasing for key UX terms", () => {
  const disallowedPatterns = [
    /旁路问题/,
    /插个问题/,
    /Sandbox 未启用/,
    /沙箱未启用/,
    /Unix Socket/,
    /unix domain socket/,
    /API key/,
    /plugin 错误/,
    /可用的 plugin/,
    /Plugin 命令用法/,
    /管理 marketplace/,
    /选择 marketplace/,
    /更新 marketplace/,
    /正在更新 marketplace/,
    /严格 sandbox 模式/,
    /sandbox 已禁用/,
    /Computer Use 需要/,
    /Computer Use 想要/,
    /语音模式现已可用 · \/voice 启用/,
    /按回车/,
    / · \/plugin 查看详情/,
    /运行 \/reload-plugins 以应用$/,
    /回车折叠/,
    /回车查看/,
    /回车：保存配置/,
    /回车选择/,
    / · 按 ↑↓ 导航 · 按 Enter 选择 · Esc 返回/,
    /按 ↑↓ 导航，按 Enter 选择，Esc 取消/,
    /使用 \/sandbox 禁用/,
    /说它的名字听听它的看法/,
    /切换话题时用 \/clear 重新开始，释放上下文空间/,
    /参见依赖标签页/,
    /未沙盒化的回退/,
    /任何情况下都不能在沙盒外运行命令/,
    /沙盒导致的失败包括：/,
    /沙盒有以下限制：/,
    /当你看到沙盒导致的失败时：/,
    /试试运行 \/plugin 手动安装 think-back 插件。/,
    /插件 - 管理已安装的插件/,
    /(?<!按 )Enter 查看/,
    /(?<!按 )Enter 继续/,
    /(?<!按 )Enter 确认/,
    /(?<!按 )Enter 选择/,
    /(?<!按 )Enter 应用/,
  ];

  const allowlist = new Set([" · ./path/to/marketplace"]);

  for (const entry of loadTranslations()) {
    for (const pattern of disallowedPatterns) {
      if (!pattern.test(entry.zh)) continue;
      if (allowlist.has(entry.zh)) continue;
      assert.fail(`disallowed translation pattern "${pattern}" found in zh="${entry.zh}"`);
    }
  }
});

test("translations do not leave raw marketplace wording in Chinese text", () => {
  const allowlist = new Set([" · ./path/to/marketplace"]);

  for (const entry of loadTranslations()) {
    if (!entry.zh.includes("marketplace")) continue;
    if (allowlist.has(entry.zh)) continue;
    assert.fail(`raw marketplace wording leaked into zh="${entry.zh}"`);
  }
});

test("check-translation-sentinels reports matching probes with explicit reasons", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-sentinel-hit-"));
  const target = path.join(tmp, "cli.js");
  fs.writeFileSync(target, 'let a="Quick safety check"; let b="ctrl+e to explain";\n');

  const result = spawnSync(
    "node",
    [path.join(repoRoot, "scripts", "check-translation-sentinels.js"), target],
    { cwd: repoRoot, encoding: "utf8" }
  );

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /quick_safety_check/);
  assert.match(result.stdout, /ctrl_e_to_explain/);
});

test("check-translation-sentinels passes when configured probes are absent", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-sentinel-clean-"));
  const target = path.join(tmp, "cli.js");
  fs.writeFileSync(
    target,
    'let a="安全检查：这是你自己创建或信任的项目吗？"; let b="按 ctrl+e 说明";\n'
  );

  const result = spawnSync(
    "node",
    [path.join(repoRoot, "scripts", "check-translation-sentinels.js"), target],
    { cwd: repoRoot, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /No sentinel hits/);
});
