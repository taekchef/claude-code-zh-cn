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
    [
      "Claude Code - starts an interactive session by default, use -p/--print for non-interactive output",
      "Claude Code - 默认启动交互式会话；使用 -p/--print 输出非交互结果",
    ],
    ["Arguments:", "参数："],
    ["Options:", "选项："],
    ["Commands:", "命令："],
    ["Your prompt", "你的提示词"],
    ["Display help for command", "显示命令帮助"],
    ["Manage background and configured agents", "管理后台和已配置的 Agent"],
    ["Manage background agents", "管理后台 Agent"],
    ["Show only background sessions started under", "仅显示在此路径下启动的后台会话"],
    ["Manage authentication", "管理身份验证"],
    ["Inspect auto mode classifier configuration", "查看自动模式分类器配置"],
    ["Configure and manage MCP servers", "配置和管理 MCP 服务器"],
    ["Show a plugin's component inventory and projected token cost", "显示插件组件清单和预计 token 成本"],
    ["Set up a long-lived authentication token (requires Claude subscription)", "设置长期身份验证 token（需要 Claude 订阅）"],
    ["Check for updates and install if available", "检查更新并安装可用版本"],
    [
      "Run a cloud-hosted multi-agent code review of the current branch (or a PR number / base branch) and print the findings",
      "在云端运行多 Agent 代码审查，目标可为当前分支、PR 编号或基准分支，并打印结果",
    ],
    ["Fast mode ON", "快速模式 开"],
    ["Draws from usage credits", "会消耗用量额度"],
    [
      " for this session only. Selecting a model will undo this.",
      "（仅本次会话）。选择模型将取消此设置。",
    ],
    [
      "Review the current diff and apply the fixes \\u2014 equivalent to /code-review --fix.",
      "审查当前 diff 并应用修复，相当于 /code-review --fix。",
    ],
    [
      "Configure the Advisor Tool to consult a stronger model for guidance at key moments during a task",
      "配置 Advisor Tool，在任务关键节点咨询更强模型获取建议",
    ],
    [
      "Send this session to the background and free the terminal",
      "将本会话放到后台并释放终端",
    ],
    [
      "Start a new session with empty context; previous session stays on disk (resumable with /resume)",
      "用空上下文开始新会话；之前的会话会保留在磁盘上（可用 /resume 恢复）",
    ],
    [
      "Install Claude Code native build. Use [target] to specify version (stable, latest, or specific version)",
      "安装 Claude Code 原生构建。使用 [target] 指定版本（stable、latest 或具体版本）",
    ],
    ["Manage Claude Code project state", "管理 Claude Code 项目状态"],
    [
      "Load a plugin from a directory or .zip for this session only (repeatable: --plugin-dir A --plugin-dir B.zip) (default: [])",
      "仅为当前会话从目录或 .zip 加载插件（可重复：--plugin-dir A --plugin-dir B.zip）（默认：[]）",
    ],
    [
      "Fetch a plugin .zip from a URL for this session only (repeatable: --plugin-url A --plugin-url B) (default: [])",
      "仅为当前会话从 URL 获取插件 .zip（可重复：--plugin-url A --plugin-url B）（默认：[]）",
    ],
    ["Beta headers to include in API requests (API key users only)", "要包含在 API 请求中的 Beta header（仅 API 密钥用户）"],
    ["Load MCP servers from JSON files or strings (space-separated)", "从 JSON 文件或字符串加载 MCP 服务器（空格分隔）"],
    ["Only use MCP servers from --mcp-config, ignoring all other MCP configurations", "仅使用 --mcp-config 中的 MCP 服务器，忽略其他所有 MCP 配置"],
    ["Permission mode to use for the session", "当前会话使用的权限模式"],
    [
      "Model for the current session. Provide an alias for the latest model (e.g. 'sonnet' or 'opus') or a model's full name (e.g. 'claude-opus-4-8').",
      "当前会话使用的模型。可提供最新模型别名（例如 'sonnet' 或 'opus'），也可提供模型完整名称（例如 'claude-opus-4-8'）。",
    ],
    ["System prompt to use for the session", "当前会话使用的系统提示词"],
    [
      "Enable prompt suggestions. In print/SDK mode, emits a prompt_suggestion message after each turn with a predicted next user prompt",
      "启用提示建议。在非交互模式下，每轮结束后输出一条预测的下一步提示。",
    ],
    [
      "Settings files that fail validation are silently ignored in this mode (no error dialog is shown).",
      "在此模式下，校验失败的 settings 文件会被静默忽略（不会显示错误对话框）。",
    ],
    ["Import MCP servers from Claude Desktop (Mac and WSL only)", "从 Claude Desktop 导入 MCP 服务器（仅 Mac 和 WSL）"],
    [
      "List configured MCP servers. Note: The workspace trust dialog is skipped and stdio servers from .mcp.json are spawned for health checks. Only use this command in directories you trust.",
      "列出已配置的 MCP 服务器。注意：此命令会跳过工作区信任对话框，并启动 .mcp.json 中的 stdio 服务器进行健康检查。只在你信任的目录中使用此命令。",
    ],
    [
      "List configured MCP servers. Unapproved .mcp.json servers are shown as \\u23F8 Pending approval and not connected to; approved servers are health-checked.",
      "列出已配置的 MCP 服务器。未批准的 .mcp.json 服务器会显示为 ⏸ 待批准且不会连接；已批准的服务器会做健康检查。",
    ],
    [
      "Get details about an MCP server. Unapproved .mcp.json servers are shown as \\u23F8 Pending approval and not connected to; approved servers are health-checked.",
      "获取 MCP 服务器详情。未批准的 .mcp.json 服务器会显示为 ⏸ 待批准且不会连接；已批准的服务器会做健康检查。",
    ],
    [
      "Print the default auto mode environment, allow, soft_deny, and hard_deny rules as JSON",
      "以 JSON 打印默认 auto mode 环境、allow、soft_deny 和 hard_deny 规则",
    ],
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
    ["Adjust mouse wheel scroll speed", "调整鼠标滚轮滚动速度"],
    ["Automates your Chrome browser to interact with web pages - clicking elements, filling forms, capturing screenshots, reading console logs, and navigating sites. Opens pages in new tabs within your existing Chrome session. Requires site-level permissions before executing (configured in the extension).", "自动操作你的 Chrome 浏览器与网页交互：点击元素、填写表单、截图、读取 console 日志并浏览网站。会在现有 Chrome 会话中打开新标签页，执行前需要站点级权限（在扩展中配置）。"],
    ["Author or improve the run-<unit> skill for this project.", "为这个项目编写或改进 run-<unit> skill。"],
    ["Browse dynamic workflow history (running and completed)", "浏览动态 workflow 历史（运行中和已完成）"],
    ["Effort", "思考强度"],
    ["Faster", "更快"],
    ["Smarter", "更强"],
    ["xhigh + workflows", "xhigh + 工作流"],
    ["Change effort level?", "更改思考强度？"],
    ["Current effort level: ${...} (${...})", "当前思考强度：${...}（${...}）"],
    ["Effort level: auto (currently ${...})", "思考强度：auto（当前为 ${...}）"],
    ["Failed to set effort level: ${...}", "设置思考强度失败：${...}"],
    ["Effort levels:", "思考强度："],
    ["Quick, straightforward implementation", "快速、直接的实现"],
    ["Balanced approach with standard testing", "均衡处理，包含常规测试"],
    ["Comprehensive implementation with extensive testing", "更完整的实现和充分测试"],
    ["Extended reasoning with thorough analysis (${...})", "扩展推理，做更彻底的分析（${...}）"],
    ["Extended reasoning with thorough analysis", "扩展推理，做更彻底的分析"],
    ["Maximum capability with deepest reasoning (${...})", "最大能力，进行最深度推理（${...}）"],
    ["Maximum capability with deepest reasoning", "最大能力，进行最深度推理"],
    ["Quick, straightforward implementation with minimal overhead", "快速、直接的实现，额外开销最小"],
    ["Balanced approach with standard implementation and testing", "均衡处理，包含标准实现和测试"],
    ["Comprehensive implementation with extensive testing and documentation", "更完整的实现，包含充分测试和文档"],
    ["Dynamic workflows", "动态工作流"],
    ["Dynamic workflow", "动态工作流"],
    ["Loading dynamic workflow history\\u2026", "正在加载动态工作流历史…"],
    ["No dynamic workflows in this session.", "本次会话还没有动态工作流。"],
    ["Review dynamic workflow before running", "运行前查看动态工作流"],
    ["Run a dynamic workflow?", "运行动态工作流？"],
    ["View workflow summary", "查看工作流摘要"],
    ["View raw script", "查看原始脚本"],
    ["Save dynamic workflow", "保存动态工作流"],
    ["Workflow script has a syntax error and was not launched:\n${...}", "工作流脚本存在语法错误，未启动：\n${...}"],
    ["Workflow launched in a remote CCR session. Task ID: ${...}\nSession: ${...}\n", "远程 CCR 会话中的工作流已启动。任务 ID：${...}\n会话：${...}\n"],
    ["The workflow runs against a fresh clone of the pushed branch; phase progress is visible at the session URL, not in /workflows. You will be notified when it completes.", "工作流会在已推送分支的新克隆上运行；阶段进度可在会话 URL 查看，不在 /workflows 中显示。完成后会通知你。"],
    ["Workflow launched in background. Task ID: ", "工作流已在后台启动。任务 ID："],
    ["\nSummary: ${...}", "\n摘要：${...}"],
    ["Warning: ${...}\n", "警告：${...}\n"],
    ["\nTranscript dir: ${...}", "\ntranscript 目录：${...}"],
    ["Dynamic workflow \"${...}\" completed", "动态工作流 \"${...}\" 已完成"],
    ["Dynamic workflow \"${...}\" failed: ${...}", "动态工作流 \"${...}\" 失败：${...}"],
    ["Dynamic workflow \"${...}\" was stopped", "动态工作流 \"${...}\" 已停止"],
    ["Agent transcripts: ${...}", "Agent 记录：${...}"],
    ["Dynamic workflow saved to ${...}. Invoke as /${...} or Workflow({name: \"${...}\"}) in future sessions.", "动态工作流已保存到 ${...}。以后可用 /${...} 或 Workflow({name: \"${...}\"}) 调用。"],
    ["Dynamic workflow \"${...}\" already exists at ${...}. Use a different name or overwrite.", "动态工作流 \"${...}\" 已存在于 ${...}。请使用其他名称或覆盖。"],
    ["${...} in progress", "${...} 进行中"],
    ["${...} pending", "${...} 待处理"],
    ["${...} completed", "${...} 已完成"],
    ["You will be notified when it completes.", "完成后会通知你。"],
    ["x stop workflow", "x 停止工作流"],
    ["Cancelled", "已取消"],
    ["Workflow file conflict", "工作流文件冲突"],
    ["Claude in Chrome (beta) settings", "Claude in Chrome（beta）设置"],
    ["Configure optional break reminders and quiet-hours nudges", "配置可选的休息提醒和安静时段提示"],
    ["Configure usage credits to keep working when you hit a limit", "配置用量额度，达到限制后继续工作"],
    ["Create, update, list, or run scheduled remote agents (routines) that execute on a cron schedule.", "创建、更新、列出或运行按 cron 定时执行的远程 agent（routine）。"],
    ["Detach from this background session (it keeps running)", "从这个后台会话断开（会话会继续运行）"],
    ["Dump the JS heap to ~/Desktop", "将 JS heap dump 到 ~/Desktop"],
    ["Exit the CLI", "退出 CLI"],
    ["Free up context by summarizing the conversation so far", "通过总结当前对话释放上下文空间"],
    ["Install the Claude Slack app", "安装 Claude Slack 应用"],
    ["Launch and drive this project's app to see a change working.", "启动并操作这个项目的应用，确认改动实际生效。"],
    ["List, create, and delete recurring loops and stop-hooks", "列出、创建和删除循环任务与 stop-hook"],
    ["Listen to Claude FM lo-fi radio", "收听 Claude FM lo-fi radio"],
    ["Manage background services: assistants, scheduled tasks, and remote control", "管理后台服务：助手、计划任务和远程控制"],
    ["Monitor and autofix any issues with the current PR", "监控并自动修复当前 PR 的问题"],
    ["Options shown when the Pro plan Claude Code trial has ended", "Pro 计划 Claude Code 试用结束时显示的选项"],
    ["Pick up skills added or changed on disk during this session", "加载本会话期间磁盘上新增或修改的 skills"],
    ["Reconfigure Amazon Bedrock authentication, region, or model pins", "重新配置 Amazon Bedrock 认证、区域或模型固定"],
    ["Reconfigure Google Vertex AI authentication, project, region, or model pins", "重新配置 Google Vertex AI 认证、项目、区域或模型固定"],
    ["Research and plan a large-scale change, then execute it in parallel across 5\\u201330 isolated worktree agents that each open a PR.", "调研并规划大规模改动，然后并行交给 5–30 个隔离 worktree agent 执行，每个都会开 PR。"],
    ["Renamed to /usage-credits", "已重命名为 /usage-credits"],
    ["Review the changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes. Quality only \\u2014 it does not hunt for bugs; use /code-review for that.", "审查已修改代码的复用、简化、效率和层级清理，然后应用修复。只做质量清理，不查 bug；查 bug 用 /code-review。"],
    ["Scan your transcripts for common read-only Bash and MCP tool calls, then add a prioritized allowlist to project .claude/settings.json to reduce permission prompts.", "扫描你的 transcripts 中常见的只读 Bash 和 MCP 工具调用，然后把优先 allowlist 写入项目 .claude/settings.json，减少权限确认。"],
    ["Session keeps running. Use /stop to end it.", "会话会继续运行。用 /stop 结束它。"],
    ["Set a goal \\u2014 keep working until the condition is met", "设置目标：持续工作直到条件满足"],
    ["Set the AI model for Claude Code", "设置 Claude Code 使用的 AI 模型"],
    ["Set the terminal UI renderer (default | fullscreen)", "设置终端 UI 渲染器（default | fullscreen）"],
    ["Show current context usage", "显示当前上下文用量"],
    ["Show session cost, plan usage, and activity stats", "显示会话成本、计划用量和活动统计"],
    ["Spawn a background agent that inherits the full conversation", "启动继承完整对话的后台 Agent"],
    ["Stop this background session; transcript and worktree are kept", "停止这个后台会话；保留 transcript 和 worktree"],
    ["Submit feedback, report a bug, or share your conversation", "提交反馈、报告问题或分享你的对话"],
    ["Switch to the latest version (conversation continues)", "切换到最新版本（对话继续）"],
    ["Toggle automemory off/on for this session", "切换本会话的 automemory 开/关"],
    ["Toggle brief-only mode", "切换 brief-only 模式"],
    ["Toggle focus view (show only your prompt, a tool summary, and the final response)", "切换专注视图（只显示你的提示词、工具摘要和最终回复）"],
    ["Toggle voice mode", "切换语音模式"],
  ]);

  for (const [en, zh] of expected) {
    assert.equal(map.get(en), zh, `translation drift for: ${en}`);
  }
});

test("slash and prompt command descriptions added for issue 122 stay translated", () => {
  const map = translationMap();
  const expected = new Map([
    ["Let Claude consult a stronger model at key moments", "让 Claude 在关键时刻咨询更强模型"],
    ["Set how full the context gets before auto-summarizing", "设置触发自动总结的上下文占用阈值"],
    ["Plan a large change; background agents each open a PR", "规划大型改动；后台 Agent 分别开 PR"],
    ["Build and debug apps that use the Claude API", "构建并调试使用 Claude API 的应用"],
    ["Let Claude browse and interact with pages in your Chrome", "让 Claude 在你的 Chrome 中浏览并操作网页"],
    ["Open settings", "打开设置"],
    ["Manage background services and routines", "管理后台服务和计划任务"],
    ["Turn on debug logging and investigate problems", "开启调试日志并排查问题"],
    ["Push your design system components to claude.ai/design", "将你的设计系统组件推送到 claude.ai/design"],
    ["Pre-approve safe read-only commands based on your usage", "根据你的使用记录预先批准安全的只读命令"],
    ["Toggle focus view: just your prompt, summary, and response", "切换专注视图：仅显示你的提示词、摘要和回复"],
    ["Set a goal Claude checks before stopping", "设置 Claude 停止前检查的目标"],
    ["Open your keyboard shortcuts file", "打开你的键盘快捷键文件"],
    ["List, create, and delete loops", "列出、创建和删除循环任务"],
    ["Open a memory file in your editor", "在编辑器中打开 memory 文件"],
    ["Manage allow and deny tool permission rules", "管理工具权限的 allow / deny 规则"],
    ["Control this session from your phone or claude.ai/code", "通过手机或 claude.ai/code 控制本会话"],
    ["Choose the default environment for cloud agents", "选择云端 Agent 的默认环境"],
    ["Create and manage scheduled remote Claude Code agents", "创建和管理定时运行的远程 Claude Code Agent"],
    ["Create and manage routines: cloud agents on a schedule", "创建和管理 routine：按计划运行的云端 Agent"],
    ["Launch this project\\u2019s app to see your change working", "启动此项目的应用，确认改动生效"],
    ["Create a skill that knows how to run this project\\u2019s app", "创建一个知道如何运行此项目应用的 skill"],
    ["Clean up the changed code without changing behavior", "在不改变行为的前提下清理已修改代码"],
    ["View and manage everything running in the background", "查看并管理所有后台运行项"],
    ["Claude Code on the web drafts a plan you can edit and approve", "Claude Code on the web 会起草可编辑、可批准的方案"],
    ["Find and verify bugs in your branch using Claude Code on the web", "使用 Claude Code on the web 查找并验证当前分支中的 bug"],
    ["Show this session's version (autoupdate may have a newer one)", "显示当前会话版本（自动更新可能已有更新版本）"],
    ["Set up Claude Code on the web with your GitHub account", "用你的 GitHub 账号设置 Claude Code on the web"],
    ["Browse running and completed workflows", "浏览运行中和已完成的 workflow"],
    ["Commit, push, and open a PR", "提交 commit、推送分支并打开 PR"],
    ["Change settings: hooks, permissions, environment variables", "更改设置：Hook、权限和环境变量"],
    ["Repeat a prompt or command on an interval (e.g. /loop 5m /foo)", "按间隔重复运行提示词或命令（例如 /loop 5m /foo）"],
    [
      "Create a new Cowork plugin from scratch, or customize an installed plugin for a specific organization. Use when: customize plugin, set up plugin, configure plugin, tailor plugin, adjust plugin settings, customize plugin connectors, customize plugin skill, tweak plugin, modify plugin configuration, create a plugin, build a plugin, make a new plugin, develop a plugin, scaffold a plugin.",
      "从零创建 Cowork 插件，或为特定组织定制已安装插件。适用于：定制插件、设置插件、配置插件、调整插件设置、定制插件 connector、定制插件 skill、修改插件配置、创建插件、构建插件、开发插件或生成插件脚手架。",
    ],
    [
      "Push a React design system to claude.ai/design. This runs a converter that bundles the real component code (from Storybook or a bare package) and uploads it. Use when the user runs /design-sync or says \\\"sync my design system to Claude Design\\\".",
      "将 React 设计系统推送到 claude.ai/design。此命令会运行转换器，打包真实组件代码（来自 Storybook 或裸 package）并上传。适用于用户运行 /design-sync，或表示要将设计系统同步到 Claude Design 时。",
    ],
    [
      "Reference for the Claude API / Anthropic SDK \\u2014 model ids, pricing, params, streaming, tool use, MCP, agents, caching, token counting, model migration.",
      "Claude API / Anthropic SDK 参考：模型 ID、价格、参数、流式输出、工具使用、MCP、agents、缓存、token 计数和模型迁移。",
    ],
    [
      "Launch and drive this project's app to see a change working. Use when asked to run, start, or screenshot the app, or to confirm a change works in the real app (not just tests). First looks for a project skill that already covers launching the app; otherwise falls back to built-in patterns per project type (CLI, server, TUI, Electron, browser-driven, library).",
      "启动并操作此项目的应用，确认改动实际生效。适用于用户要求运行、启动、截图应用，或确认改动在真实应用中生效（不只是测试通过）时。会先查找已覆盖应用启动的项目 skill；否则按项目类型（CLI、server、TUI、Electron、browser-driven、library）使用内置模式。",
    ],
    [
      "Author or improve the run-<unit> skill \\u2014 a per-project skill that tells agents how to build, launch, and drive this project's app. Use when the user asks to set up the project, get it running, write run instructions, or verify build/run steps work from a clean environment.",
      "编写或改进 run-<unit> skill：这是一个项目级 skill，用来告诉 Agent 如何构建、启动并操作此项目的应用。适用于用户要求设置项目、让项目跑起来、编写运行说明，或验证构建/运行步骤能否在干净环境中生效时。",
    ],
    [
      "Verify that a code change actually does what it's supposed to by running the app and observing behavior. Use when asked to verify a PR, confirm a fix works, test a change manually, check that a feature works, or validate local changes before pushing.",
      "通过运行应用并观察行为，验证代码改动是否真正达到预期。适用于用户要求验证 PR、确认修复生效、手动测试改动、检查功能可用，或在推送前验证本地改动时。",
    ],
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
    "Bash command (unsandboxed)",
    "Waiting\\u2026",
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

test("model-facing prompt contract fragments are marked patch-skip", () => {
  const entries = new Map(loadTranslations().map((entry) => [entry.en, entry]));
  const promptContractFragments = [
    " or ",
    "Fast mode",
    "Output Style",
    "Output style",
    "Saving a memory is a two-step process:",
    "Version: ",
    "You have been invoked in the following environment: ",
    "Your responses should be short and concise.",
    "active agent",
    "active shell",
  ];

  for (const fragment of promptContractFragments) {
    assert.equal(
      entries.get(fragment)?.skipPatch,
      "model-prompt-contract",
      `prompt contract fragment should be skipped by patch-cli.js: ${fragment}`
    );
  }
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
