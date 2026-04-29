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
    ["Enter to copy link · Esc to cancel", "按 Enter 复制链接 · 按 Esc 取消"],
    ["Enter to confirm · Esc to exit", "按 Enter 确认 · 按 Esc 退出"],
    ["Enter to confirm · Esc to skip", "按 Enter 确认 · 按 Esc 跳过"],
    ["Enter to continue", "按 Enter 继续"],
    ["Enter to run · Esc to go back", "按 Enter 运行 · 按 Esc 返回"],
    ["Enter to select ·", "按 Enter 选择 ·"],
    ["Enter to submit · Esc to cancel", "按 Enter 提交 · 按 Esc 取消"],
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
    ["Hit Enter to queue up additional messages while Claude is working.", "Claude 工作时，按 Enter 可继续排队输入消息。"],
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
    ["↑/↓ to change · Enter to apply · Esc to cancel", "按 ↑/↓ 切换 · 按 Enter 应用 · 按 Esc 取消"],
  ]);

  for (const [en, zh] of expected) {
    assert.equal(map.get(en), zh, `translation drift for: ${en}`);
  }
});

test("slash command descriptions keep the restored PR4 translations", () => {
  const map = translationMap();
  const expected = new Map([
    ["Open or create your keybindings configuration file", "打开或创建你的 keybindings 配置文件"],
    ["Sign in with your Anthropic account", "使用你的 Anthropic 账号登录"],
    ["Switch Anthropic accounts", "切换 Anthropic 账号"],
    ["Manage MCP servers", "管理 MCP 服务器"],
    ["Rename the current conversation", "重命名当前对话"],
    ["Enable plan mode or view the current session plan", "启用计划模式或查看当前会话计划"],
    ["Set the AI model for Claude Code (currently gpt-5.4-medium)", "设置 Claude Code 使用的 AI 模型（当前为 gpt-5.4-medium）"],
    ["Set the AI model for Claude Code (currently ${lH(W5())})", "设置 Claude Code 使用的 AI 模型（当前为 ${lH(W5())}）"],
    ["Toggle fast mode (${im} only)", "切换快速模式（仅 ${im}）"],
    ["View release notes", "查看更新说明"],
    ["Enable Option+Enter key binding for newlines and visual bell", "启用 Option+Enter 换行键绑定和视觉铃声"],
    ["Install Shift+Enter key binding for newlines", "安装 Shift+Enter 换行键绑定"],
    ["Initialize a new CLAUDE.md file with codebase documentation", "用代码库文档初始化新的 CLAUDE.md 文件"],
    ["Initialize new CLAUDE.md file(s) and optional skills/hooks with codebase documentation", "用代码库文档初始化新的 CLAUDE.md 文件，并可选创建技能/Hook"],
    ["Research and plan a large-scale change, then execute it in parallel across 5–30 isolated worktree agents that each open a PR.", "调研并规划一项大规模变更，然后将其并行拆分给 5–30 个彼此隔离的 worktree Agent 执行，每个 Agent 都会打开一个 PR。"],
    ["Build, debug, and optimize Claude API / Anthropic SDK apps.", "构建、调试并优化 Claude API / Anthropic SDK 应用。"],
    ["Review a pull request", "审查一个 PR"],
    ["Review changed code for reuse, quality, and efficiency, then fix any issues found.", "审查变更代码的复用性、质量和效率，并修复发现的任何问题。"],
    ["Use this skill to configure the Claude Code harness via settings.json.", "使用此技能通过 settings.json 配置 Claude Code harness。"],
    ["Generate a one-line session recap now", "立即生成一行会话总结"],
    ["Create, update, list, or run scheduled remote agents (triggers) that execute on a cron schedule.", "创建、更新、列出或运行按 cron 计划执行的远程 Agent（triggers）。"],
    ["Use this skill to configure the Claude Code harness via settings.json. Automated behaviors (\"from now on when X\", \"each time X\", \"whenever X\", \"before/after X\") require hooks configured in settings.json - the harness executes these, not Claude, so memory/preferences cannot fulfill them. Also use for: permissions (\"allow X\", \"add permission\", \"move permission to\"), env vars (\"set X=Y\"), hook troubleshooting, or any changes to settings.json/settings.local.json files. Examples: \"allow npm commands\", \"add bq permission to global settings\", \"move permission to user settings\", \"set DEBUG=true\", \"when claude stops show X\". For simple settings like theme/model, use Config tool.", "使用此技能通过 settings.json 配置 Claude Code harness。自动化行为（“从现在起当 X”“每次 X”“每当 X”“在 X 之前/之后”）需要在 settings.json 中配置 Hook - 这些由 harness 执行，不是 Claude，因此记忆/偏好无法满足它们。也用于：权限（“允许 X”“添加权限”“移动权限到”）、环境变量（“设置 X=Y”）、Hook 故障排查，或对 settings.json/settings.local.json 的任何修改。示例：“允许 npm 命令”“向全局设置添加 bq 权限”“将权限移到用户设置”“设置 DEBUG=true”“当 claude 停止时显示 X”。对于主题/模型这类简单设置，请使用 Config 工具。"],
    ["Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo). Omit the interval to let the model self-pace.", "在固定间隔内运行提示词或斜杠命令（例如 /loop 5m /foo）。省略间隔则让模型自行调整节奏。"],
    ["Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo, defaults to 10m)", "在固定间隔内运行提示词或斜杠命令（例如 /loop 5m /foo，默认为 10m）"],
  ]);

  for (const [en, zh] of expected) {
    assert.equal(map.get(en), zh, `translation drift for: ${en}`);
  }
});

test("slash command menu descriptions keep the newly restored wording", () => {
  const map = translationMap();
  const expected = new Map([
    ["Add a new working directory", "添加新的工作目录"],
    ["Manage agent configurations", "管理 Agent 配置"],
    ["Start fresh: discard the current conversation and context", "重新开始：丢弃当前对话和上下文"],
    ["Clear conversation history but keep a summary in context. Optional: /compact [instructions for summarization]", "清除对话历史，但在上下文中保留摘要。可选：/compact [总结说明]"],
    ["Open config panel", "打开 config 面板"],
    ["Copy Claude's last response to clipboard (or /copy N for the Nth-latest)", "复制 Claude 的最后一次回复到剪贴板（或 /copy N 复制第 N 条最近的回复）"],
    ["Manage Claude Code plugins", "管理 Claude Code 插件"],
    ["Exit the REPL", "退出 REPL"],
    ["Edit Claude memory files", "编辑 Claude memory 文件"],
    ["Resume a previous conversation", "恢复之前的对话"],
    ["List available skills", "列出可用技能"],
    ["Order Claude Code stickers", "订购 Claude Code 贴纸"],
    ["List and manage background tasks", "列出并管理后台任务"],
    ["Change the theme", "更改主题"],
    ["Show Claude Code status including version, model, account, API connectivity, and tool statuses", "显示 Claude Code 状态，包括版本、模型、账号、API 连接性和工具状态"],
    ["Toggle fast mode (Opus 4.6 only)", "切换快速模式（仅 Opus 4.6）"],
    ["Generate a one-line session recap now", "立即生成一行会话总结"],
    ["Create, update, list, or run scheduled remote agents (triggers) that execute on a cron schedule.", "创建、更新、列出或运行按 cron 计划执行的远程 Agent（triggers）。"],
    ["Build, debug, and optimize Claude API / Anthropic SDK apps. Apps built with this skill should include prompt caching.", "构建、调试并优化 Claude API / Anthropic SDK 应用。使用此技能构建的应用应包含 prompt caching。"],
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

test("high-risk fragment inventory stays reduced to the approved remainder", () => {
  const map = translationMap();
  const removed = [
    "Enter to",
    " to save ",
    " to edit this plan in ",
    " for Quick Launch",
    " ready · shift+↓ to view",
  ];
  const remaining = [
    " or ",
    " back",
    " navigate · ",
    " to get started",
    " to reference files or lines in your input",
  ];

  for (const fragment of removed) {
    assert.equal(map.has(fragment), false, `fragment should be migrated away: ${fragment}`);
  }

  assert.deepEqual(
    remaining.filter((fragment) => map.has(fragment)),
    remaining,
    "approved fragment remainder drifted"
  );
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
