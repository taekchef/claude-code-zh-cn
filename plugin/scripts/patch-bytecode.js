#!/usr/bin/env node
"use strict";

// 原地翻译方案由 hjkl950217 在 PR #238 提供。只改变字符串占位内的内容，
// 保留 Bun 数据布局；备份、签名和启动验证完成后才替换用户的可执行文件。
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const io = require("../bun-binary-io.js");

// spinner 完成态/进度词：传统 Layer 4 在 patch-cli.js 用结构锚定替换它们，
// bytecode 容器按常量池整串匹配即可。这些词在常量池里只作显示值（无逻辑
// 比较/对象键），整串替换安全；Baked 桶短译成双字才放得下。
// 词表与 patch-cli.js 的 statusVerbs / 动词数组同源（后者是 Layer 4 的锚点），
// 改动其中一处时两处都要跟。
const BUILTIN_SPINNER_TRANSLATIONS = [
  { en: "Baked", zh: "烤了" },
  { en: "Brewed", zh: "沏了" },
  { en: "Churned", zh: "翻搅了" },
  { en: "Cogitated", zh: "琢磨了" },
  { en: "Cooked", zh: "烹饪了" },
  { en: "Crunched", zh: "嚼了" },
  { en: "Sautéed", zh: "翻炒了" },
  { en: "Saut\\xE9ed", zh: "翻炒了" },
  { en: "Worked", zh: "忙活了" },
  { en: "Thought", zh: "思考了" },
  { en: "almost done thinking", zh: "即将完成思考" },
  { en: "thinking some more", zh: "继续思考中" },
  { en: "thinking more", zh: "深入思考" },
  { en: "still thinking", zh: "仍在思考" },
  { en: "Needs input", zh: "需要输入" },
  { en: "Ready for review", zh: "待审核" },
];

// 粘贴/截断附件的协议占位符碎片。Bun 把 `[Pasted text #${id} +${n} lines]` 这类
// 运行时解析的模板拆成常量池静态段，翻译任一静态段都会让识别附件的正则失配，
// 模型只收到占位符字面量而不是真实粘贴内容。patch-cli.js 的
// isProtectedProtocolLiteral 只覆盖明文路径，这里补齐 bytecode 池。
// 注意 ` more lines]` 是折叠行数提示的 UI 文案，可翻译，不在保护之列。
const PROTOCOL_FRAGMENTS = new Set([
  "[Pasted text #",
  " lines]",
  "[...Truncated text",
  "[Image #",
]);

// `Shell cwd was reset to <dir>` 由明文正则（Egt）消费，用于把执行目录复位；
// 翻译会让解析失配、后续命令跑到错误目录。池里暂无完整条目，守卫纯属防御。
// `Agent "`（minify 名 `Wet`）与 `" finished`（`Xir`）是逻辑前缀/后缀对：agent
// 任务列表靠 `startsWith(Wet) && endsWith(Xir)` 识别完成通知，同一常量还用于生成
// 模型可见的 `<task-notification>` 摘要。池里确有 7B `Agent "` 条目，翻译会让任务
// 识别失配、协议混入中文，必须拒绝。
const LOGIC_CONSUMED_FRAGMENTS = new Set([
  "Diff", // 共用的语法名称；仅在面板显示引用中翻译。
  "Chat", // 快捷键上下文也使用此值；只翻译设置中的展示字段。
  "What's contributing to your limits usage?", // 模型说明与界面标题共用。
  "Hook cancelled",
  "Shell cwd was reset to ",
  'Agent "',
]);

// 池内专用译文。两类用途：
// 1) 修正主表里放不进窄槽的条目（如 ctrl+o，主表长译 24B 装不进 19B 窄槽）；
// 2) 只在 Bun 常量池里作展示片段的串——写进 cli-translations.json 会让明文路径
//    （patch-cli.js）在协议模板或提示词里误替换，故只在此维护、不走主表。
// 槽宽来自 2.1.260 实测，译文超宽会被静默跳过，改动后用测试核对。
const POOL_TRANSLATIONS = new Map([
  ["List all configured marketplaces", "列出全部插件市场"],
  ["Output as JSON", "输出JSON"],
  // 2026-10 完整文案与经逐槽核验的短译；不加入通用选项值或按键动作。
  ["Claude may use instructions, code, or files from this Skill.","Claude 可使用此技能的指令、代码或文件。"],
  ["Yes, and don't ask again for ","是，今后不再询问 "],
  ["Proceed?","继续吗？"],
  ["Allow external CLAUDE.md file imports?","允许导入外部 CLAUDE.md？"],
  ["Working directory has changes","工作目录有改动"],
  ["Its settings declare project permission rules and/or additional directories. They apply only if you trust this directory explicitly (it is trusted through a parent directory so far).","此目录的设置包含权限规则或额外目录。明确信任此目录后才会生效；目前仅通过父目录间接信任。"],
  ["This directory configures hooks that run commands, declared in","此目录配置了会执行命令的 Hook，定义位于"],
  [" /plugin stats - Show skill usage and context costs"," /plugin stats - 技能用量及开销"],
  [" installed · restart to apply"," 已安装 · 重启生效"],
  ["Create a git commit","创建提交"],
  ["Create a pull request","创建 PR"],
  ["Answer questions about Claude Code features and settings","解答 Claude Code 功能和设置问题"],
  ["Create a skill that knows how to run this project’s app","创建运行项目的技能"],
  ["Launch this project’s app to see your change working","启动项目查看改动"],
  ["Guided setup — pick a role, install a plugin, try a skill, connect tools","引导设置：选择角色、安装插件、试用技能、连接工具"],
  ["Diagramming guidance for Artifacts","作品图示指南"],
  ["Publish a report Artifact from a template","用模板发布报告"],
  ["Manage Claude Code project state","管理项目状态"],
  ["Which agent to import from (codex, gemini, cursor)","来源 codex/gemini/cursor"],
  ["Show what would be imported without writing anything","预览导入内容，不写入文件"],
  ["List what would be deleted without deleting anything","预览要删除的内容，不执行删除"],
  ["Prompt for each item before deleting","逐项确认后删除"],
  ["Skip confirmation prompt","跳过确认"],
  ["Restart every running background session","重启全部运行中的后台会话"],
  ["Disable all enabled plugins","停用全部插件"],
  ["Filter cases by tag (repeatable)","按标签筛选用例（可重复）"],
  ["Override which model is used","指定使用的模型"],
  ["Sign in with your Anthropic account","登录 Anthropic 账号"],
  ["GitHub App installed!","GitHub应用已装"],
  ["Creating a long-lived token for GitHub Actions","创建 GitHub Actions 长效令牌"],
  ["Dark mode (ANSI colors only)","深色（仅 ANSI 色）"],
  ["Claude Code will restart to apply.","重启后生效。"],
  ["Esc again to clear","再按 Esc 清空"],
  ["Opens a secure connection to claude.ai.","安全连接 claude.ai。"],
  ["Plugin Hooks","插件Hook"],
  ["Session Hooks","会话Hook"],
  ["Searching","搜索中"],
  ["Configuration error","配置错误"],
  ["Auto-memory","自动记忆"],
  ["No tool calls yet.","暂无工具调用。"],
  [" · reviewing "," ·审查 "],
  ["1 teammate shut down","已停1位队友"],
  ["Stop ultrareview?","停止深度审查？"],
  [" (ctrl+o to expand)", " ctrl+o展开"],
  ["Added ", "新增 "],
  [" lines", " 行"],
  [" completed", " 已完成"],
  ["timeout ", "超时 "],
  [" · timeout ", " ·超时 "],
  [" for ", "耗时"], // 5B 窄槽最多 2 个单元；`思考了 for 7s` -> `思考了耗时7s`
  ["searched for", "搜索了"],
  ["patterns", "个模式"], // 单数 `pattern` 与 Grep 工具参数共享，不动
  // 2.1.260 用户反馈缺口：Waiting for task 前缀、chord 附加指示、后台 agent
  // 启动/完成、Goal 状态词、Task Output 工具名。均只在池里作展示片段，进主表
  // 会被明文路径在协议模板/提示词里误替换。槽宽来自本机 2.1.260 实测。
  ["\xA0\xA0\xA0\xA0\xA0Waiting for task", "\xA0\xA0等待任务"],
  ["give additional instructions", "给出额外指示"],
  [" background agents launched", " 个后台 Agent 启动"],
  ['Background agent "', '后台 Agent"'],
  [" finished", " 已完成"],
  ["Goal achieved", "目标已达成"],
  ["Goal could not be achieved", "目标未能达成"],
  ["Goal not yet met… continuing", "目标尚未达成…继续"],
  ["Task Output", "任务输出"],
  // 上下文压缩后 banner `✻ Conversation compacted (ctrl+o for history)` 又显示英文：
  // 主表键 `✻ Conversation compacted (` 不匹配池条目（✻ 由组件单独渲染，@111563738
  // children:[mB,"Conversation compacted (",Aw," for history)"]），池里是 24B 的
  // `Conversation compacted (`。尾段 ` for history)` 还被 summarized hint @112441011
  // 的模板共用，头段一并翻避免中英混。`ctrl+o` 是键位变量（保留），` for history`
  // （12B）是 Compacted 状态行 detail（@111406312 `${f} for history`）。槽宽实测。
  ["Conversation compacted (", "对话已压缩（"],
  ["Conversation summarized (", "对话已摘要（"],
  [" for history)", " 查看历史）"],
  [" for history", " 查看历史"],
  // 主表精选译文（37 字符）超过 --betas 帮助描述的池占位（60B narrow，预算 30），
  // tooLong 会整条跳过；池内用预算内的短译文，主表措辞留给其他展示面。
  ["Beta headers to include in API requests (API key users only)", "API 请求的 Beta headers（仅 key 用户）"],
  // 以下主表为测试守护的精选措辞，但超出 slash 菜单池占位预算（narrow=原文字符数一半），
  // 池内用预算内短译文覆盖，主表措辞不动。
  ["Manage MCP servers", "管理 MCP 服务"],
  ["Copy Claude's last response to clipboard (or /copy N for the Nth-latest)", "复制最后回复到剪贴板（/copy N 取第 N 条）"],
  ["Manage allow and deny tool permission rules", "管理工具权限 allow/deny 规则"],
  ["Manage Claude Code plugins", "管理插件"],
  ["Create and manage scheduled remote Claude Code agents", "管理定时运行的远程 Agent"],
  ["Order Claude Code stickers", "订购贴纸"],
  ["Install the Claude Slack app", "安装 Slack 应用"],
  ["Listen to Claude FM lo-fi radio", "收听 Claude FM"],
  ["Stop this background session; transcript and worktree are kept", "停止后台会话；保留 transcript 与 worktree"],
  ["Open Claude in Chrome settings", "Chrome 集成设置"],
  ["Set the AI model for Claude Code", "设置会话 AI 模型"],
  ["Set the terminal UI renderer (default | fullscreen)", "设置终端 UI 渲染器"],
  ["Toggle brief-only mode", "切换 brief 模式"],
  // 2.1.289 窄槽：保留主表的完整译法，这里只收录可在真实池宽内写入的短译。
  ["File resources to download at startup. Format: file_id:relative_path (e.g., --file file_abc:doc.txt file_def:img.png)", "启动时下载文件；格式 file_id:relative_path"],
  ["JSON Schema for structured output validation. Example: {\"type\":\"object\",\"properties\":{\"name\":{\"type\":\"string\"}},\"required\":[\"name\"]}", "结构化输出用 JSON Schema 校验"],
  ["Sign in to your Anthropic account", "登录 Anthropic 账号"],
  ["Add an MCP server to Claude Code.", "添加 MCP 服务"],
  ["Print the default auto mode environment, allow, soft_deny, and hard_deny rules as JSON", "以 JSON 显示 auto mode 默认规则"],
  ["Scaffold a new plugin at ~/.claude/skills/<name>/ (auto-loads next session as <name>@skills-dir)", "在 ~/.claude/skills/<name>/ 创建插件；下次加载"],
  ["Install Claude Code native build. Use [target] to specify version (stable, latest, or specific version)", "安装 Claude Code；[target] 指定版本（stable/latest/版本号）"],
  ["Enable Claude in Chrome integration", "启用 Chrome 集成"],
  ["Disable Claude in Chrome integration", "关闭 Chrome 集成"],
  ["Enable debug mode with optional category filtering (e.g., \"api,hooks\" or \"!1p,!file\")", "启用调试，可选过滤分类（如 api,hooks）"],
  ["Comma or space-separated list of tool names to allow (e.g. \"Bash(git *) Edit\")", "允许的工具名，用逗号或空格分隔"],
  ["Comma or space-separated list of tool names to deny (e.g. \"Bash(git *) Edit\")", "禁用的工具名，用逗号或空格分隔"],
  ["Stop ultrareview", "停止审查"],
  ["Keep worktree and tmux session", "保留工作树和 tmux"],
  ["Remove worktree and tmux session", "移除工作树和 tmux"],
  ["Keep worktree", "保留工作树"],
  ["Remove worktree", "移除工作树"],
  ["Async agent", "异步代理"],
  ["shell mode", "命令模式"],
  ["Claude Code needs your input", "需要你的输入"],
  ["Not now", "暂不"],
  ["See ya!", "再见！"],
  ["Make auto mode your default permission mode?", "要将 auto mode 设为默认权限模式？"],
  ["In plan mode, Claude will:", "计划模式下，Claude 将："],
  ["Ready to code?", "开始写代码？"],
  ["Here is Claude's plan:", "Claude 的计划："],
  ["Plan saved!", "计划已保存"],
  ["Local agents", "本地代理"],
  ["Session URL", "会话网址"],
  ["Run ultraplan", "运行规划"],
  ["Stop ultraplan", "停止规划"],
  ["Ultraplan approved", "规划已批准"],
  ["Error loading Claude Code sessions", "加载会话失败"],
  ["No Claude Code sessions found", "未找到会话"],
  ["Login with Claude account", "登录 Claude 账号"],
  ["Log in to Claude", "登录 Claude"],
  ["Also try: ", "也可试："],
  ["View on GitHub", "在 GitHub 看"],
  ["Please install git and restart Claude Code.", "请安装 git 并重启 Claude Code。"],
  ["MCP servers", "MCP服务"],
  ["Agents view", "代理视图"],
  ["Total tokens:", "总 token："],
  ["Tokens per Day", "每日 token"],
  ["[Image]", "[图]"],
  ["[View Tab]", "[查看页]"],
  ["Move per-machine sections (cwd, env info, memory paths, git status) from the system prompt into the first user message. Improves cross-user prompt-cache reuse. Only applies with the default system prompt (ignored with --system-prompt).", "将本机信息从系统提示移到首条消息，复用提示缓存。仅默认提示生效；--system-prompt 下忽略。"],
  ["When resuming, create a new session ID instead of reusing the original (use with --resume or --continue)", "恢复时创建新会话 ID，不复用原 ID（配合 --resume 或 --continue）"],
  ["Include partial message chunks as they arrive (only works with --print and --output-format=stream-json)", "输出实时消息片段（需 --print 和 --output-format=stream-json）"],
  ["Fetch a plugin .zip from a URL for this session only (repeatable: --plugin-url A --plugin-url B)", "仅本次会话从 URL 加载插件 .zip（可重复指定 --plugin-url）"],
  ["Only use MCP servers from --mcp-config, ignoring all other MCP configurations", "仅用 --mcp-config 的 MCP 服务，忽略其他配置"],
  ["Alias for --permission-mode bypassPermissions", "--permission-mode 的别名"],
  ["Settings file or JSON string to apply to the agent view and dispatched sessions", "用于 Agent 视图和分派会话的设置文件或 JSON"],
  ["Only use MCP servers from --mcp-config in dispatched sessions", "分派会话仅用 --mcp-config 的 MCP 服务"],
  ["Print the effective auto mode config as JSON: your settings where set, defaults otherwise", "以 JSON 显示 auto mode 配置；用户设置优先"],
  ["Get AI feedback on your custom auto mode rules", "获取 auto mode 规则反馈"],
  ["Import MCP servers from Claude Desktop (Mac and WSL only)", "从 Claude Desktop 导入 MCP（Mac/WSL）"],
  ["Add an MCP server (stdio, SSE, HTTP, or WebSocket) with a JSON string", "用 JSON 添加 MCP 服务（stdio/SSE/HTTP/WebSocket）"],
  ["Authenticate with an MCP server (HTTP, SSE, or claude.ai connector)", "认证 MCP 服务（HTTP/SSE/claude.ai）"],
  ["Start the Claude Code MCP server", "启动 MCP 服务"],
  ["Manage Claude Code marketplaces", "管理插件市场"],
  ["Print the raw bugs.json payload instead of formatted findings", "输出原始 bugs.json，不格式化"],
  // 2.1.289 实际终端截图：以下是 Bun 池中的显示串。新版内置命令描述与主表
  // 的旧文案并非同一原文；statusline / 计费标签还受 narrow 槽宽限制。
  // 仅补充完整池条目或可确认的显示片段，不改命令名、参数及 Hook 协议字段。
  ["API Usage Billing", "API 计费"],
  ["Set up Claude Code's status line UI", "设置 Claude 状态栏"],
  ["Author or improve the run-<unit> skill - a per-project skill that tells agents how to build, launch, and drive this project's app. Use when the user asks to set up the project, get it running, write run instructions, or verify build/run steps work from a clean environment.", "编写或改进项目级 run-<unit> skill，说明如何构建、启动和操作应用；用于项目设置、运行说明及从干净环境验证构建与运行。"],
  ["Review the changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes. Quality only — it does not hunt for bugs; use /code-review for that.", "审查改动代码的复用、简化、效率及层级问题并应用修正。只做质量清理，不查缺陷；查缺陷请用 /code-review。"],
  ["Use this skill to configure the Claude Code harness via settings.json. Automated behaviors (\"from now on when X\", \"each time X\", \"whenever X\", \"before/after X\") require hooks configured in settings.json - the harness executes these, not Claude, so memory/preferences cannot fulfill them. Also use for: permissions (\"allow X\", \"add permission\", \"move permission to\"), env vars (\"set X=Y\"), hook troubleshooting, or any changes to settings.json/settings.local.json files. Examples: \"allow npm commands\", \"add bq permission to global settings\", \"move permission to user settings\", \"set DEBUG=true\", \"when claude stops show X\". For simple settings like theme/model, suggest the /config command.", "通过 settings.json 配置 Claude Code。定时或条件动作须用 Hook，不能只靠记忆或偏好。也用于权限、环境变量、Hook 排障，以及修改 settings.json 或 settings.local.json；主题和模型等简单设置请用 /config。"],
  ["Verify that a code change actually does what it's supposed to by exercising it end-to-end and observing behavior — drive the affected flow, not just tests or typecheck. Run before committing nontrivial changes; bootstraps this repo's project verify skill if none exists yet. Don't invoke it on a diff that only touches tests, docs, or other code with no runtime surface to drive (a change to product source always has one) — there's nothing to observe.", "端到端操作受影响流程并观察行为，确认代码改动符合预期，不能只跑测试或类型检查。非平凡改动提交前应运行；如缺少项目验证 skill，会先建立。仅改测试、文档等无运行界面的内容时无需调用。"],
  ["Reference for writing a ", "编写 "],
  [" tool script (script API and gotchas, resume, quality patterns, worked examples). Load before authoring a script for a workflow the user already opted into; it does not itself authorize running one.", " 工具脚本参考（API、恢复、质量要点和示例）。仅用于用户已选择的流程；查看说明不代表授权执行。"],
  ["for agents", "代理"],
  ["Kept model as ", "沿用模型："],
  ["); with no level given, it reuses the level you typed last. Pass --comment to post findings as inline PR comments, or --fix to apply the findings to the working tree after the review. Pass --max-findings <n> to report up to n findings, or --max-findings all for every finding. The choice stays until you pass --max-findings default.", "）；未指定强度时沿用上次输入值。--comment 将问题发布为 PR 行内评论；--fix 在审查后修复工作树；--max-findings <n> 最多报告 n 项，all 报告全部。设置持续生效，直到传入 --max-findings default。"],
  ["TRIGGER — read BEFORE opening the target file; don't skip because it \"looks like a one-liner\" — whenever: the prompt names Claude/Anthropic in any form (Claude, Anthropic, Fable, Opus, Sonnet, Haiku, `anthropic`, `@anthropic-ai`, `claude-*`, `us.anthropic.*`, `[1m]`); the user asks about an LLM (pricing/model choice/limits/caching) — never answer from memory; OR the task is LLM-shaped with provider unstated (agent/MCP/tool-definition/multi-agent/RAG/LLM-judge/computer-use; generate/summarize/extract/classify/rewrite/converse over NL; debugging refusals/cutoffs/streaming/tool-calls/tokens).", "触发条件：打开目标文件前先阅读，不得因“看起来只改一行”而跳过。适用于提示中出现任意 Claude/Anthropic 标识（Claude、Anthropic、Fable、Opus、Sonnet、Haiku、`anthropic`、`@anthropic-ai`、`claude-*`、`us.anthropic.*`、`[1m]`）；用户询问大模型定价、选型、限制或缓存时，不凭记忆作答；或任务涉及未指定供应商的大模型应用（代理/MCP/工具定义/多代理/RAG/模型评判/计算机操作；自然语言生成、摘要、提取、分类、改写、对话；排查拒答、截断、流式输出、工具调用、token 问题）。"],
  ["SKIP only when another provider is being worked on (overrides all triggers): OpenAI/GPT/Gemini/Llama/Mistral/Cohere/Ollama named in the query; OR `grep -rE 'openai|langchain_openai|google.generativeai|genai|mistralai|cohere|ollama'` over the project hits (run this grep FIRST if no provider named — don't Read the file).", "仅在处理其他供应商时跳过，且此规则优先于所有触发条件：问题中明确提到 OpenAI/GPT/Gemini/Llama/Mistral/Cohere/Ollama；或在项目执行 `grep -rE 'openai|langchain_openai|google.generativeai|genai|mistralai|cohere|ollama'` 有匹配。未指定供应商时先运行该 grep，不要先读取文件。"],
  // 菜单分页截图：新版说明与显示片段，保留命令参数及模型标识。
  ["Review the current diff, or a PR number/branch/path target, for correctness bugs (plus reuse/simplification/efficiency cleanups where the model's review recipe covers them) at the given effort level (low/medium: fewer, high-confidence findings; high→max: broader coverage, may include uncertain findings", "按指定强度审查当前差异或 PR 编号、分支、路径中的正确性缺陷，并按模型审查方案检查复用、简化和效率。low/medium：较少但高置信度的问题；high→max：覆盖更广，可能包含待确认问题"],
  ["Toggle the diff panel showing uncommitted changes", "切换未提交改动的差异面板"],
  ["Toggle fast mode (", "切换快模式 ("],
  ["Reference for the Claude API / Anthropic SDK — model ids, pricing, params, streaming, tool use, MCP, agents, caching, token counting, model migration.", "Claude API / Anthropic SDK 参考：模型 ID、定价、参数、流式输出、工具调用、MCP、代理、缓存、token 计数及模型迁移。"],
  ["Use this skill whenever you are about to create ANY chart, graph, plot, dashboard, or data visualization, in ANY output medium — an HTML or React artifact, inline SVG, plotting code in any library (matplotlib, plotly, d3, Recharts, …), an image/PNG you will render and upload, or a chart shared into Slack. Read it BEFORE writing the first line of chart code, choosing chart colors, building a stat tile / meter / KPI row, or laying out a dashboard. When the destination is a first-party document connector (host-designated, never self-described) that renders live charts, hand it the rows (inline, or as an uploaded data file the chart cites) rather than a rendered PNG/SVG — a picture of a chart loses hover, data inspection and per-value comments. Produces visualizations that read as one system — elegant, accessible, consistent in light and dark — using a brand-neutral placeholder palette you swap for your own. Teaches a design-system-agnostic method: a form heuristic, a color formula with a runnable validator, mark specs, and interaction rules. A validated default palette is documented in `references/palette.md` — swap that file's values for your brand's. Triggers on: \"chart\", \"graph\", \"plot\", \"data viz\", \"visualization\", \"dashboard\", \"analytics\", \"visualize data\", \"categorical colors\", \"sequential / diverging palette\", \"stat tile\", \"sparkline\", \"heatmap\", \"legend\", \"axis\", \"tooltip\", \"chart colors\", \"color by series\".", "创建任何图表、曲线、仪表盘或数据可视化时使用本技能，适用于 HTML/React 作品、内联 SVG、任意绘图库代码（matplotlib、plotly、d3、Recharts 等）、待渲染上传的图片/PNG，以及分享到 Slack 的图表。在编写第一行图表代码、选择颜色、制作统计卡片/仪表/KPI 行或布局仪表盘之前阅读。当目标是可渲染交互图表的第一方文档连接器（由宿主指定，不接受自称）时，应提交数据行（内联或图表引用的上传文件），而非渲染好的 PNG/SVG；图片会失去悬停、数据检查及逐值评论功能。采用可替换为自有品牌色的中性占位配色，形成优雅、易访问、明暗主题一致的可视化体系。提供不依赖特定设计系统的方法：形式选择规则、带可运行校验器的配色公式、图形标记规范和交互规则。已验证默认配色见 `references/palette.md`，请按品牌替换其中色值。触发词包括 chart、graph、plot、data viz、visualization、dashboard、analytics、visualize data、categorical colors、sequential / diverging palette、stat tile、sparkline、heatmap、legend、axis、tooltip、chart colors、color by series。"],
  ["Deep research harness — fan-out web searches, fetch sources, adversarially verify claims, synthesize a cited report.", "深度研究流程：并行检索网页、获取来源、交叉核验论断，并生成带引用的报告。"],
  ["Ctrl+Y to paste deleted text", "Ctrl+Y 恢复删文"],
  // 2.1.289 菜单截图补漏：完整原文、真实引号以及窄槽短译。
  ["Grant or revoke Claude agent access to your Design projects", "授予/撤销 Claude 代理访问 Design 项目"],
  ["Push a React design system to claude.ai/design. This runs a converter that bundles the real component code (from Storybook or a bare package) and uploads it. Use when the user runs /design-sync or says \"sync my design system to Claude Design\".", "将 React 设计系统同步到 claude.ai/design：转换并上传 Storybook 或组件包中的实际组件代码。用于 /design-sync 或同步设计系统的请求。"],
  ["Health-check the user's Claude Code setup and fix issues: diagnose installation health — what the `claude doctor` terminal diagnostics cover — from local data (duplicate or leftover installs, PATH, unparseable settings files, broken or colliding agent definitions, skills whose frontmatter fails to parse); find unused skills, MCP servers, and plugins versus their context cost and disable dead weight; deduplicate local CLAUDE.md files against checked-in ones; trim checked-in CLAUDE.md files by cutting content a session could derive from the codebase (directory layouts, tech-stack lists, architecture overviews) while keeping gotchas, rationale, and non-standard conventions; migrate always-loaded CLAUDE.md guidance into lazy skills and nested CLAUDE.md files; flag slow hooks and context-heavy extensions; check the installed version is current; make auto mode the default permission mode; and pre-approve frequently denied read-only commands. Use when the user asks for a doctor run, checkup, audit, tune-up, or cleanup of their Claude Code setup or configuration.", "检查并修复 Claude Code 配置：诊断重复安装、PATH、无效设置、代理与技能定义；清理闲置技能、MCP 服务和插件；去重并精简 CLAUDE.md，保留特殊约定与设计理由；将常驻说明迁移到按需技能或嵌套文件；检查慢 Hook、上下文开销与版本；设置默认自动模式，并预先授权常见的只读命令。用于体检、审计、调优或清理配置。"],
  ["Scan your transcripts for common read-only Bash and MCP tool calls, then add a prioritized allowlist to project .claude/settings.json to reduce permission prompts.", "扫描会话中常见的只读 Bash、MCP 调用，按优先级写入项目 .claude/settings.json 允许列表，减少权限确认。"],
  ["Make a mod: a live pane, band, status line, toast or hook inside Claude Code (terminal or desktop Code tab), written as a plugin of function hooks that hot-reloads in this session. Load before writing or debugging a hooks module.", "编写可在本次会话热重载的界面插件：实时面板、横栏、状态栏、提示或 Hook，适用于终端及桌面 Code 页。编写或调试 Hook 模块前加载。"],
  ["UserPromptSubmit operation blocked by hook:\n", "UserPromptSubmit 已拦截：\n"],
  ["UserPromptExpansion operation blocked by hook:\n", "扩展输入被 Hook 拦截：\n"],
  ["\n\nOriginal prompt: ", "\n\n原始输入："],
]);

function patchStringPool(buffer, translations, { mainTableOnly = false } = {}) {
  if (!Array.isArray(translations)) throw new Error("翻译表必须是数组");
  const table = new Map();
  const protectedText = new Set(translations.filter(t => t?.skipPatch).map(t => t.en));
  for (const item of translations) {
    if (!item || typeof item.en !== "string" || typeof item.zh !== "string" || !item.en || !item.zh) {
      throw new Error("翻译条目必须包含非空 en / zh 字符串");
    }
    if (protectedText.has(item.en) || PROTOCOL_FRAGMENTS.has(item.en) || LOGIC_CONSUMED_FRAGMENTS.has(item.en)) continue;
    if (table.has(item.en) && table.get(item.en) !== item.zh) throw new Error(`翻译冲突：${item.en}`);
    table.set(item.en, item.zh);
  }
  // 内置补充词只在主表缺省时生效，避免与 cli-translations.json 冲突；
  // 主表标记 skipPatch 的条目仍受保护，内置词不得绕过。
  // mainTableOnly（no-match 探测用）跳过内置与池内注入，保证"空表必须零命中"的守卫语义。
  if (!mainTableOnly) {
    for (const item of BUILTIN_SPINNER_TRANSLATIONS) {
      if (!table.has(item.en) && !protectedText.has(item.en)) table.set(item.en, item.zh);
    }
    // 池内专用译文直接写入池表（可覆盖主表同名值）；协议/逻辑守卫优先级最高。
    for (const [en, zh] of POOL_TRANSLATIONS) {
      if (!protectedText.has(en) && !PROTOCOL_FRAGMENTS.has(en) && !LOGIC_CONSUMED_FRAGMENTS.has(en)) table.set(en, zh);
    }
  }
  const lengths = new Set([...table.keys()].map(en => en.length));
  const found = new Set();
  let patched = 0, tooLong = 0;
  // ponytail: 单遍扫描 Bun 数据中的精确字符串和条目头；格式变化时扩展版本化解析器。
  for (let offset = 0; offset + 8 <= buffer.length; offset++) {
    // CachedUniquedStringImplBase (2.1.242): relative pointer, bool flags, length.
    // Later shared-pool records: length | is8Bit << 31, hash, characters.
    const cached = offset + 16 <= buffer.length && buffer.readUInt32LE(offset) === 16 &&
      buffer.readUInt32LE(offset + 4) === 0 && (buffer[offset + 8] & 0x36) === 0;
    const flags = cached ? buffer[offset + 8] : buffer[offset + 3];
    if (!cached && flags !== 0x80 && flags !== 0) continue;
    const length = buffer.readUInt32LE(offset + (cached ? 12 : 0)) & 0x7fffffff;
    if (!lengths.has(length)) continue;
    const narrow = cached ? (flags & 1) !== 0 : flags === 0x80;
    const bytes = length * (narrow ? 1 : 2);
    const start = offset + (cached ? 16 : 8);
    if (start + bytes > buffer.length) continue;
    const en = buffer.toString(narrow ? "latin1" : "utf16le", start, start + bytes);
    const zh = table.get(en);
    if (!zh) continue;
    found.add(en);
    if (en === zh) {
      offset = start + bytes - 1;
      continue;
    }
    const replacement = Buffer.from(zh, "utf16le");
    if (replacement.length > bytes) {
      tooLong++;
    } else {
      buffer.writeUInt32LE(zh.length, offset + (cached ? 12 : 0)); // UTF-16 code units.
      if (cached) buffer[offset + 8] &= ~1;
      buffer.fill(0, start, start + bytes);
      replacement.copy(buffer, start);
      patched++;
    }
    offset = start + bytes - 1;
  }
  return { patched, notFound: table.size - found.size, tooLong };
}

function readContainer(binaryPath) {
  const lief = io.loadNodeLief();
  if (!lief) throw new Error("native patch 需要 node-lief");
  const parsed = io.extractNativeBun(lief, binaryPath);
  const entry = io.findClaudeModule(parsed.bunData, parsed.bunOffsets, parsed.moduleStructSize);
  if (!entry || !io.claudeBytecodeGuardReason(entry)) throw new Error("当前程序不是已识别的 Bun bytecode 容器");
  return { ...parsed, bunData: Buffer.from(parsed.bunData) };
}

// Windows 2.1.289 的部分状态文字由 JS 片段动态拼接，常量池替换并不能
// 改变正在执行的 bytecode。只在已核对 SHA-256 的构建中，使五个显示相关模块改用
// 容器内原有源码；源码不扩容、不移动任何指针，也不修改执行指令或其他模块。
const WIN289_SOURCE_SHA256 = "bcc6d9117aec30ad9414490302a25414359c871f5647e32e49b055c92bf84e0b";
const WIN289_DISPLAY_REWRITES = new Map([
  ["chunk-wyssf6qs.js", [
    ['indicator:"manual mode"', 'indicator:"手动模式"', 1],
    ['indicator:"plan mode"', 'indicator:"计划模式"', 1],
    ['indicator:"accept edits"', 'indicator:"接受编辑"', 1],
    ['indicator:"bypass permissions"', 'indicator:"绕过权限"', 1],
    ['indicator:"don\'t ask"', 'indicator:"不询问"', 1],
    ['indicator:"auto mode"', 'indicator:"自动模式"', 1],
  ]],
  ["chunk-bmzxbn1n.js", [
    ['tag:Ie?"dynamic workflow":void 0', 'tag:Ie?"动态工作流":void 0', 1],
    ['const Le=D?"":" on";', 'const Le=D?"":"";', 1],
    ['action:"cycle",parens:!0,format:{keyCase:"lower"}', 'action:"切换",parens:!0,format:{keyCase:"lower"}', 2],
    ['const Eo=E?"to go back":"for agents";', 'const Eo=E?"返回":"代理";', 1],
    ['action:"interrupt",format:{keyCase:"lower"}', 'action:"中断",format:{keyCase:"lower"}', 1],
    ['zn==="xhigh"?"xHigh":zn?sUt(zn):""," ","effort"', '"强度：",zn??""', 1],
    ['zn===as?" (default)":""', 'zn===as?"（默认）":""', 1],
    ['action:"adjust"', 'action:"调整"', 1],
    ['action:H?"set as default":"confirm"', 'action:H?"设为默认":"确认"', 2],
    ['action:"use this session only"', 'action:"仅本次会话使用"', 1],
    ['action:"list"', 'action:"列表"', 2],
    ['action:"cancel"', 'action:"取消"', 13],
    ['fallback:"Esc",description:"cancel"', 'fallback:"Esc",description:"取消"', 6],
  ]],
  ["chunk-h0jzendc.js", [
    ['["(",c," to ",s,")"]', '["(",c,"→",s,")"]', 1],
    ['[c," to ",s]', '[c,"→",s]', 1],
    ['`(${a} to ${o})`', '`(${a}→${o})`', 1],
    ['`${a} to ${o}`', '`${a}→${o}`', 1],
  ]],
  ["chunk-k7a7t1rp.js", [
    ['` with ${T8(AF(s))} effort`', '` · 强度：${T8(AF(s))}`', 1],
  ]],
  ["chunk-9y8h4cpv.js", [
    ['"? for shortcuts"', '"? 快捷键"', 2],
  ]],
]);

function rewriteWin289DisplaySource(source, moduleName, translations) {
  const rewrites = WIN289_DISPLAY_REWRITES.get(moduleName);
  if (!rewrites) throw new Error(`未知的 2.1.289 显示模块：${moduleName}`);
  let changed = 0;
  for (const [english, chinese, expected] of rewrites) {
    const hits = source.split(english).length - 1;
    if (hits !== expected) throw new Error(`${moduleName} 显示锚点不匹配：${english} (${hits}/${expected})`);
    source = source.split(english).join(chinese);
    changed += hits;
  }

  // 禁用 bytecode 后，该模块原来由常量池提供的中文会退回英文。把同一份主表
  // 的精确字符串字面量应用到源码；跳过所有协议保护项。池内短译文仅用于槽宽
  // 有限的常量池，不覆盖源码中的主表精选措辞。
  const protectedText = new Set(translations.filter(t => t?.skipPatch).map(t => t.en));
  const sourceTable = new Set(["chunk-wyssf6qs.js", "chunk-bmzxbn1n.js", "chunk-h0jzendc.js", "chunk-k7a7t1rp.js"]);
  for (const { en, zh, skipPatch } of (sourceTable.has(moduleName) ? [...translations] : []).sort((a, b) => b.en.length - a.en.length)) {
    if (skipPatch || protectedText.has(en) || PROTOCOL_FRAGMENTS.has(en) || LOGIC_CONSUMED_FRAGMENTS.has(en)) continue;
    const literal = JSON.stringify(en);
    const hits = source.split(literal).length - 1;
    if (!hits) continue;
    source = source.split(literal).join(JSON.stringify(zh));
    changed += hits;
  }
  return { source, changed };
}

function patchWin289DisplayModules(bunData, bunOffsets, moduleStructSize, translations, { format, version, sourceHash }) {
  if (format !== "PE" || version !== "2.1.289") return { sourceModules: 0, sourceReplacements: 0 };
  if (sourceHash !== WIN289_SOURCE_SHA256) throw new Error("Windows 2.1.289 构建指纹未经验证，未改动文件");
  if (moduleStructSize !== 52 || bunOffsets.modulesPtr.length % 52 !== 0) throw new Error("2.1.289 模块布局不匹配，未改动文件");
  const seen = new Set();
  let sourceReplacements = 0;
  const { offset, length } = bunOffsets.modulesPtr;
  for (let cursor = offset; cursor < offset + length; cursor += moduleStructSize) {
    const nameStart = bunData.readUInt32LE(cursor);
    const nameLength = bunData.readUInt32LE(cursor + 4);
    const name = bunData.toString("utf8", nameStart, nameStart + nameLength);
    const moduleName = path.basename(name);
    if (!WIN289_DISPLAY_REWRITES.has(moduleName)) continue;
    if (seen.has(moduleName) || !name.endsWith(`/root/${moduleName}`)) throw new Error(`2.1.289 模块名异常：${name}`);
    seen.add(moduleName);
    const sourceStart = bunData.readUInt32LE(cursor + 8);
    const sourceLength = bunData.readUInt32LE(cursor + 12);
    const bytecodeLength = bunData.readUInt32LE(cursor + 28);
    if (!sourceLength || !bytecodeLength || bunData[cursor + 48] !== 1 || sourceStart + sourceLength > bunData.length) {
      throw new Error(`2.1.289 模块属性异常：${moduleName}`);
    }
    const source = bunData.toString("latin1", sourceStart, sourceStart + sourceLength);
    const result = rewriteWin289DisplaySource(source, moduleName, translations);
    const replacement = Buffer.from(result.source, "utf8");
    if (replacement.length > sourceLength) throw new Error(`2.1.289 源码占位不足：${moduleName} (+${replacement.length - sourceLength})`);
    bunData.fill(0x20, sourceStart, sourceStart + sourceLength);
    replacement.copy(bunData, sourceStart);
    bunData.writeUInt32LE(0, cursor + 24); // 该模块改用源码，不改其他 bytecode。
    bunData.writeUInt32LE(0, cursor + 28);
    bunData[cursor + 48] = 0; // 源码从 Latin-1 改为 UTF-8。
    sourceReplacements += result.changed;
  }
  if (seen.size !== WIN289_DISPLAY_REWRITES.size) throw new Error(`2.1.289 显示模块缺失：${[...WIN289_DISPLAY_REWRITES.keys()].filter(x => !seen.has(x)).join(", ")}`);
  return { sourceModules: seen.size, sourceReplacements };
}

// 显示字符串与程序值共用常量时，不能全局改池。仅在官方构建及模块指纹均
// 匹配的 Mac 构建中，定点修改显示模块。使用该模块原有独立占位（源码区或
// 腾出的 bytecode 区）存放 UTF-8 源码，保留帮助示例，不扩容或移动共享池。
const MAC_DISPLAY_BUILDS = new Map([
  ["2.1.285", ["51f09bd1e021d9fa8a1864c179799bd37cb39962a937935c5cf6823398e86db4", [
    ["chunk-n3b1z5m4.js", "permission", "e174c4bc0c207ff78cd3023846d73cf4d182ccc5f6fd0177943a1b7e137c96a4"],
    ["chunk-xjc7gdgb.js", "key-hint", "00a246283d368132a611312d781f0acfed94e6b1350b54b1326288c0e199413b"],
    ["chunk-b80z6w8h.js", "mcp-help", "82379e1b09aac6f489851b23a7ef48b357067da7e0c02db4db60569053e10a68"],
    ["chunk-sbkxgvv8.js", "diff-panel", "19cefb36c5656fac7d6b498cee7ae33adbd613010b17cf812f6dd58fc26cb65e"],
    ["chunk-wv6p13aq.js", "help", "666ba376c601efb6dc151d038bec4e4f3e41e64fd2bed1abcbc28e278cac19fb"],
    ["chunk-ymhmhwa4.js", "help", "5dd25ea43198eea610e0451296d70186ecd5f9f712b1ec0471f842956de29ba1"],
    ["chunk-ssgd8zcr.js", "permission-reason", "9d403cdd0b2bbadbfef2e0cd0f87e9bd699f91eb9caf80631abe5e39b0b99a1c"],
    ["chunk-fz83gh21.js", "help", "e6d272cfc79b339e80f57a9fdbf1107131d1f8c3d43a0e51d48f48eb0a3f4efc"],
    ["chunk-rrx4gpgm.js", "background-help", "581e9c9d987c24478ed08d9ac12da1884691db1f6c02e06974d291ad78362449"],
    ["chunk-at5kbrxv.js", "help", "286fdd8c42db79432aca9991a629292f1d5ef9b3cc8255561dec63706514a5ec"],
    ["chunk-77zqw3rv.js", "help-formatter", "ec1843eec798d268f7d5df79c6ffae0560b64bbfe1f9484ec1131bd2b0ea9d80"],
    ["chunk-y13zwdn8.js", "usage-panel", "eb78c8aaf332ba60c53cd63f0b16346e7a9cd883371dc5951f3147897138e7fc"],
    ["chunk-zdaxxncw.js", "chat-settings", "7e0d4426925aec6c4dd197f2c8caa26f855eb2ac712ecbd49d745484b8d1c9e5"],
    ["chunk-98qpvhja.js", "review-label", "5d5be7040d8b06610b5b010fffcc96914d8cc01bb639daaebec037c2944c8ca0"],
  ]]],
  ["2.1.286", ["75e3016e9d2570767b08e43a7467d4817a4f149232c169ca295f2c95fef21433", [
    ["chunk-40vr59jt.js", "permission", "7bd333bc2f4d1d02cb587c21c67f8a74c80dcdfa4de7ddbeb53550db5b466183"],
    ["chunk-6a3bbf4y.js", "key-hint", "e0b251e4ba2a536f18b3f5db556068760327ce23928704218b6b6e4e249a8c8c"],
    ["chunk-rwrv0nks.js", "mcp-help", "8ad7820f17821c3ed90db8e4b724977042a99bf8d37be0c3f9642436a334dcf6"],
    ["chunk-smc54qjt.js", "diff-panel", "716095be0af1124a28225391d3f737015e5fd0d3aa6812fbdb1068feee405036"],
    ["chunk-hxxkrcey.js", "help", "bd5d0d23b525e2f7205acd83574f9919eba29653286840502015d8cc62b067d4"],
    ["chunk-k6fc52zf.js", "help", "95ac94fa8f93c837e0db7c35b63670873413c4fe2c4635f161078ed5a0f08519"],
    ["chunk-pnyt6sw9.js", "permission-reason", "cb0b925ed80890a351a78aafa6fddf688c0e16f7629fc7c7f0023eece0e6613f"],
    ["chunk-yajwtwra.js", "help", "a211838b0bbde21ec9c2eba4ae9f90274c02c47dedec73a29b01e8c11c6a4dce"],
    ["chunk-31x2vsqf.js", "background-help", "30c8bc8d61b980f52f89909f90eb0d4349536a9ad9c60095cc44619f4257ac44"],
    ["chunk-1m81t3j7.js", "help", "8451ba214f65e3f2aa3d8613c7455da1533712e0f12f0d16be13d4566bad1701"],
    ["chunk-0c86z2z1.js", "help-formatter", "ebcb74ca5120f33b52d062d23d2581c72512c84009240b607622a4201f3b341f"],
    ["chunk-p7yh4jny.js", "usage-panel", "430e0bd3b66b0609b0c9ed5a2d62083ea075db460be1623870fc896e85083c32"],
    ["chunk-4s4g0jzx.js", "chat-settings", "d279c0b564fadb5bb5d7f4baf14b22240e3abdaf8550e8dce2a3fce7da7c2ca2"],
    ["chunk-j79yyf65.js", "review-label", "f6e1cde0a850b0a5aaef1e24ac7fd4f2860aed84bcf3f936aa46d14d24653e21"],
  ]]],
  ["2.1.295", ["0116ee2e0a513900b633d9951367f18747686478e2b462805b8c31609f047f70", [
    ["chunk-bhz7hapx.js", "permission", "e7d4dc062f83b6dadc4d083278d5fa7e2aceb5bfa71ed1194296a1b052c391a1"],
    ["chunk-p52mhbqz.js", "key-hint", "fc84b50d0f0b1fdcf08c5af6808762396c0580b96593b8b12e80c3265b5da92f"],
    ["chunk-j54ybdtc.js", "mcp-help", "0312ce38cefff411c4c5d2e34904b6147a1edfdeeb16af3489996f53b1714600"],
    ["chunk-8mmnqsff.js", "diff-panel", "4d5f17d872d8a0c50a386300a4f0c8deb3823fb53717a021353231e22cbba922"],
    ["chunk-4ypdmt1d.js", "help", "08ee8baa66fcf645a1689a312f2bed3d6c770e5f15610aac2aed9564d4e81442"],
    ["chunk-ayj73b9e.js", "help", "6933c985cd5f571e3bbb3d63372148372a83b1e095385d2f0e01a6ff87ecb3a4"],
    ["chunk-2sxvm4dn.js", "permission-reason", "73d5f1d876a218a656e34d9c5c11aff69f1ee1174047f571667ad98c31fa3fb5"],
    ["chunk-ccqktn4p.js", "help", "03d46c01724912a98a45bb800cda6d4524efc7c57652de75803cfd34fbc599b4"],
    ["chunk-cwxe0n05.js", "background-help", "42e23385fba6924c6f103a3d1e0f248f27a6aa29137132ed682f5a85902cc9a3"],
    ["chunk-cbxhnd80.js", "help", "4a7a4bf643fcc9ebf835de60b86a3f8f088be8bf1010c68db5c1cf6c5330e032"],
    ["chunk-vtap7ff6.js", "help-formatter", "f81a21b8148adda7f9ade9764afa872762467d52c3e577a6c95b507ef250137a"],
    ["chunk-ncctg2ag.js", "usage-panel", "800a3f97ef15684aa7558ff8f1f5b12d4f36c9c3c7c8e86e4430e4d3a33a0d55"],
    ["chunk-kzx145fg.js", "chat-settings", "7b1a4c10dc63fdfee06d1f861b95db7f6124eb60216108d33006ecf9b7a9390f"],
    ["chunk-v5wkdteh.js", "review-label", "1fd90bae947e737e701b1979c1c9ba5c341e4b2bd21d5280f4f1abe82b5ec3a7"],
  ]]],
]);

const KEY_HINT_ACTIONS = {
  amend: "修改", add: "添加", back: "返回", cancel: "取消", confirm: "确认",
  continue: "继续", cycle: "切换", adjust: "调整", explain: "说明", list: "列表",
  refresh: "刷新", scroll: "滚动", select: "选择", deselect: "取消选择",
  interrupt: "中断", "cancel edit": "取消修改", "clear history": "清空历史",
  "collapse description": "收起说明", "copy link": "复制链接",
  "discard and exit": "放弃并退出", "edit in $EDITOR": "在 $EDITOR 中修改",
  "exit and fix issues": "退出并修复问题", "new line": "换行",
  "only show current repo": "仅显示当前仓库", "open in browser": "在浏览器打开",
  "pick a row first": "先选择一行", "reset to auto": "重置为自动",
  "review & send": "检查并发送", "see the first lines": "查看开头",
  "send now": "立即发送", "show tasks": "显示任务", "stop all agents": "停止全部 Agent",
  submit: "提交", "toggle scope": "切换范围", "twice to stop background agents": "按两次停止后台 Agent",
  "view artifacts": "查看作品", "switch mode": "切换模式", "set as default": "设为默认", "use this session only": "仅本次会话使用",
};

function macSourceReplacements(translations) {
  const protectedText = new Set(translations.filter(t => t?.skipPatch).map(t => t.en));
  const sourceTable = new Map([...POOL_TRANSLATIONS, ...BUILTIN_SPINNER_TRANSLATIONS.map(t => [t.en, t.zh]), ...translations.map(t => [t.en, t.zh])]);
  const literals = new Map(), background = new Map();
  for (const [en, zh] of [...sourceTable].sort((a, b) => b[0].length - a[0].length)) {
    if (en === zh || protectedText.has(en) || PROTOCOL_FRAGMENTS.has(en) || LOGIC_CONSUMED_FRAGMENTS.has(en)) continue;
    const asciiLiteral = JSON.stringify(en).replace(/[^\x20-\x7e]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
    const variants = new Set([
      JSON.stringify(en), asciiLiteral, asciiLiteral.replace(/\\u00([0-9a-f]{2})/g, "\\x$1"),
      asciiLiteral.replace(/\\u([0-9a-f]{4})/g, (_match, hex) => `\\u${hex.toUpperCase()}`),
      asciiLiteral.replace(/\\u00([0-9a-f]{2})/g, (_match, hex) => `\\x${hex.toUpperCase()}`),
      `'${en.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`,
    ]);
    if (!en.includes("${") && !en.includes("`")) variants.add(`\`${en}\``);
    for (const literal of variants) literals.set(literal, JSON.stringify(zh));
    if (/^(Open the background session|Print the background session|Usage: claude respawn|Restart a background session \(or|Delete a background session and|also discard the worktree|delete the worktree directory)/.test(en)) {
      for (const fragment of new Set([en, en.replace(/`/g, "\\`"), asciiLiteral.slice(1, -1), asciiLiteral.slice(1, -1).replace(/\\u([0-9a-f]{4})/g, (_match, hex) => `\\u${hex.toUpperCase()}`)])) background.set(fragment, zh);
    }
  }
  // 原来的每条译文、每种转义都扫描整份源码。合并精确字面量规则后，每个模块
  // 只扫描一次；仍按长串优先，不解析或改写参数值。
  const pattern = literals.size ? new RegExp([...literals.keys()].sort((a, b) => b.length - a.length).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g") : null;
  return { pattern, literals, background };
}

function rewriteMacDisplaySource(source, role, translations, replacements = macSourceReplacements(translations)) {
  let changed = 0;
  const replace = (pattern, replacement, minimum = 1) => {
    let hits = 0;
    source = source.replace(pattern, (...args) => { hits++; return typeof replacement === "function" ? replacement(...args) : replacement; });
    if (hits < minimum) throw new Error(`${role} 显示锚点不匹配：${pattern}`);
    changed += hits;
  };
  if (role === "permission") {
    replace(/`Use skill "\$\{([^}]+)\}"\?`/g, (_match, expression) => `\`使用技能“\${${expression}}”？\``);
    // 只改 label；value、反馈类型、规则与工具名必须保持英文。
    replace(/label:"Yes"/g, 'label:"是"');
    replace(/label:"No"/g, 'label:"否"');
    replace(/("Yes, and don't ask again for ",[^\n]+?)," ","in ",/g,
      (_match, before) => `${before},"，目录：",`);
  } else if (role === "permission-reason") {
    replace(/`Ask rule \$\{([^}]+)\} overrides auto mode for this \$\{([^}]+)\}\.`/g,
      (_match, rule, kind) => `\`询问规则 \${${rule}} 优先于此\${${kind}==="tool"?"工具":"命令"}的自动审批。\``);
    replace(/`Permission rule \$\{([^}]+)\} requires confirmation for this \$\{([^}]+)\}\.`/g,
      (_match, rule, kind) => `\`权限规则 \${${rule}} 要求确认此\${${kind}==="tool"?"工具":"命令"}。\``);
  } else if (role === "key-hint") {
    const action = /\{chord:[$\w]+,action:([$\w]+),format:/u.exec(source)?.[1];
    if (!action) throw new Error("按键提示动作参数未找到");
    // 组件入口只翻渲染用的副本，不改调用者传来的内部 action。
    const binding = new RegExp(`(\\{chord:[$\\w]+,action:${action},format:[^;]+;)`);
    replace(binding, (_match, before) => `${before}${action}=__cczhAction(${action});`);
    replace(/" to "/g, '" "');
    replace(/\$\{([$\w]+)\} to \$\{([$\w]+)\}/g,
      (_match, key, label) => `\${${key}} \${__cczhAction(${label})}`, source.includes("terse:") ? 0 : 2);
    if (source.includes("terse:")) {
      replace(/\$\{([$\w]+)\}\$\{[^}]+\}\$\{([$\w]+)\}/g,
        (_match, key, label) => `\${${key}} \${__cczhAction(${label})}`);
    }
    source += `\nfunction __cczhAction(t){const a=${JSON.stringify(KEY_HINT_ACTIONS)};return typeof t==="string"&&Object.hasOwn(a,t)?a[t]:t}\n`;
  } else if (role === "diff-panel") {
    replace(/\b(var|let|const) ([$\w]+)="Diff"/g, (_match, kind, name) => `${kind} ${name}="差异"`);
  } else if (role === "help") {
    replace(/`Effort level for the current session \(\$\{([^}]+)\}\)`/g,
      (_match, levels) => `\`当前会话的推理强度（\${${levels}}）\``, 0);
    replace(/`Installation scope: \$\{([^}]+)\} \(default: auto-detect\)`/g,
      (_match, scopes) => `\`安装范围：\${${scopes}}（默认：自动检测）\``, 0);
  } else if (role === "help-formatter") {
    // Commander 的帮助格式化器拼接这些展示标签，参数枚举和默认值原样保留。
    for (const [en, zh] of [["choices", "可选值"], ["default", "默认值"], ["preset", "预设值"], ["env", "环境变量"], ["Usage", "用法"]]) {
      replace(new RegExp("`" + en + ": (?=\\$\\{)", "g"), "`" + zh + "：");
    }
    replace(/" \[options\]"/g, '" [选项]"');
  } else if (role === "usage-panel") {
    // 只替换 React 展示子节点，另一模块中的模型说明仍使用英文原文。
    replace(/children:"What's contributing to your limits usage\?"/g, 'children:"哪些操作消耗了你的额度？"');
  } else if (role === "chat-settings") {
    // 翻译消息的默认展示文案，保留消息 id、chatSurface 和所有 Chat 上下文值。
    for (const [en, zh] of [["Chat", "聊天"], ["Allow Chat", "允许聊天"], ["Enable Chat. Quick questions and drafting.", "启用聊天，用于简短问答和起草内容。"]]) {
      replace(new RegExp("defaultMessage:" + JSON.stringify(en).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?=,id:)", "g"), "defaultMessage:" + JSON.stringify(zh));
    }
    // 此共享模块还包含服务端代码和长说明，其中的 Markdown 反引号不是
    // JS 模板。仅复用消息展示字段的主表译文，不能把说明里的 ` for ` 当字面量。
    source = source.replace(/\bdefaultMessage:("(?:\\[\s\S]|[^"\\])*")/g, (match, literal) => {
      const chinese = replacements.literals.get(literal);
      if (!chinese) return match;
      changed++;
      return "defaultMessage:" + chinese;
    });
    return { source, changed };
  } else if (role === "review-label") {
    replace(/userFacingName\(\)\{return"Code review"\}/g, 'userFacingName(){return"代码审查"}');
  } else if (!["mcp-help", "help", "background-help"].includes(role)) {
    throw new Error(`未知的显示模块：${role}`);
  }

  if (replacements.pattern) source = source.replace(replacements.pattern, literal => { changed++; return replacements.literals.get(literal); });
  if (role === "background-help") {
    // 新版帮助在模板里追加会话名称提示；只换已核对的帮助正文，保留插值。
    for (const [fragment, zh] of replacements.background) {
      const hits = source.split(fragment).length - 1;
      if (hits) { source = source.split(fragment).join(zh); changed += hits; }
    }
  }
  return { source, changed };
}

function patchMacDisplayModules(bunData, bunOffsets, moduleStructSize, translations, { format, version, sourceHash }) {
  const build = MAC_DISPLAY_BUILDS.get(version);
  if (format !== "MachO" || !build) return { sourceModules: 0, sourceReplacements: 0 };
  if (sourceHash !== build[0]) throw new Error(`macOS ${version} 构建指纹未经验证，未改动文件`);
  const { offset, length } = bunOffsets.modulesPtr;
  if (moduleStructSize !== 52 || length % 52 !== 0 || offset + length > bunData.length) throw new Error("Mac 显示模块布局异常");
  const modules = new Map(build[1].map(([name, role, hash]) => [name, { role, hash }]));
  const replacements = macSourceReplacements(translations);
  const records = [], plans = [], seen = new Set();
  for (let cursor = offset; cursor < offset + length; cursor += 52) {
    const pointers = Array.from({ length: 6 }, (_, i) => ({ start: bunData.readUInt32LE(cursor + i * 8), size: bunData.readUInt32LE(cursor + i * 8 + 4), field: i }));
    records.push({ cursor, pointers });
    const { start, size } = pointers[0];
    const name = bunData.toString("utf8", start, start + size), moduleName = path.basename(name), spec = modules.get(moduleName);
    if (!spec) continue;
    if (seen.has(moduleName) || !name.endsWith(`/root/${moduleName}`)) throw new Error("Mac 显示模块名称异常");
    seen.add(moduleName);
    const contents = pointers[1], bytecode = pointers[3];
    if (!contents.size || !bytecode.size || contents.start + contents.size > bunData.length || bytecode.start + bytecode.size > bunData.length || bunData[cursor + 48] > 1) throw new Error("Mac 显示模块范围异常");
    const source = bunData.toString(bunData[cursor + 48] === 1 ? "latin1" : "utf8", contents.start, contents.start + contents.size);
    if (crypto.createHash("sha256").update(source).digest("hex") !== spec.hash) throw new Error(`${moduleName} 源码指纹不符`);
    const result = rewriteMacDisplaySource(source, spec.role, translations, replacements), replacement = Buffer.from(result.source, "utf8");
    // 帮助启动检查不会加载所有页面；每个将改用源码的模块先单独检查语法。
    try {
      execFileSync(process.execPath, ["--input-type=module", "--check"], { input: result.source, stdio: ["pipe", "ignore", "ignore"] });
    } catch {
      throw new Error(`${moduleName} 显示源码语法验证失败，未改动文件`);
    }
    const storage = contents.size >= bytecode.size ? contents : bytecode;
    if (replacement.length > storage.size) throw new Error(`${moduleName} 显示内容超出独立占位`);
    plans.push({ cursor, storage, replacement, changed: result.changed });
  }
  if (seen.size !== modules.size) throw new Error("Mac 显示模块缺失");
  // 所有验证完成后才写入；腾出的区域不能与任何其他模块字段或模块表重叠。
  const overlaps = (a, n, b, m) => n > 0 && m > 0 && a < b + m && b < a + n;
  for (const plan of plans) {
    const { start, size } = plan.storage;
    if (overlaps(start, size, offset, length)) throw new Error("显示占位与模块表重叠");
    for (const record of records) for (const pointer of record.pointers) {
      if (record.cursor === plan.cursor && pointer.field === plan.storage.field) continue;
      if (overlaps(start, size, pointer.start, pointer.size)) throw new Error("显示占位与其他模块数据重叠");
    }
  }
  for (const { cursor, storage, replacement } of plans) {
    bunData.fill(0x20, storage.start, storage.start + storage.size);
    replacement.copy(bunData, storage.start);
    bunData.writeUInt32LE(storage.start, cursor + 8);
    bunData.writeUInt32LE(replacement.length, cursor + 12);
    bunData.writeUInt32LE(0, cursor + 24);
    bunData.writeUInt32LE(0, cursor + 28);
    bunData[cursor + 48] = 0;
  }
  return { sourceModules: plans.length, sourceReplacements: plans.reduce((sum, plan) => sum + plan.changed, 0) };
}

function patchBinary(binaryPath, translations, { dryRun = false, mainTableOnly = false } = {}) {
  binaryPath = fs.realpathSync(binaryPath);
  const version = io.readExecutableVersion(binaryPath);
  if (!version) throw new Error("原始 Claude Code 启动自检失败，未改动文件");
  const backupPath = binaryPath + ".zh-cn-backup";
  const sameVersionBackup = fs.existsSync(backupPath) && io.readExecutableVersion(backupPath) === version;
  const sourcePath = sameVersionBackup ? backupPath : binaryPath;
  const { bunData, format, bunOffsets, moduleStructSize } = readContainer(sourcePath);
  const original = fs.readFileSync(sourcePath);
  const sourceHash = crypto.createHash("sha256").update(original).digest("hex");
  const payloadOffset = original.indexOf(bunData);
  if (payloadOffset < 0 || original.indexOf(bunData, payloadOffset + 1) !== -1) {
    throw new Error("无法唯一定位 Bun 数据，未改动文件");
  }
  const summary = patchStringPool(bunData, translations, { mainTableOnly });
  const context = { format, version, sourceHash };
  const sourceSummary = mainTableOnly ? { sourceModules: 0, sourceReplacements: 0 } : format === "MachO"
    ? patchMacDisplayModules(bunData, bunOffsets, moduleStructSize, translations, context)
    : patchWin289DisplayModules(bunData, bunOffsets, moduleStructSize, translations, context);
  if (dryRun) return { ...summary, ...sourceSummary, version, mode: "dry-run" };
  if (!summary.patched) throw new Error("没有命中可翻译的字节码条目，未改动文件");
  bunData.copy(original, payloadOffset);
  const current = fs.readFileSync(binaryPath);
  const currentPayload = current.subarray(payloadOffset, payloadOffset + bunData.length);
  if (sameVersionBackup && currentPayload.equals(bunData)) return { ...summary, ...sourceSummary, version, backup: backupPath, changed: false };

  const tempDir = fs.mkdtempSync(path.join(path.dirname(binaryPath), ".zh-cn-bytecode-"));
  const candidate = path.join(tempDir, format === "PE" ? "claude.exe" : "claude");
  try {
    fs.writeFileSync(candidate, original, { mode: fs.statSync(binaryPath).mode });
    if (format === "MachO") io.signAndVerifyMachO(candidate);
    if (io.readExecutableVersion(candidate) !== version) throw new Error("汉化副本启动自检失败，未改动原文件");
    const help = execFileSync(candidate, ["--help"], { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "pipe"] });
    if (!/[\u3400-\u9fff]/u.test(help)) throw new Error("汉化副本帮助界面未出现中文，未改动原文件");
    if (!sameVersionBackup) io.withWindowsFileRetry(() => fs.copyFileSync(binaryPath, backupPath));
    io.withWindowsFileRetry(() => fs.renameSync(candidate, binaryPath));
    return { ...summary, ...sourceSummary, version, backup: backupPath, changed: true };
  } finally {
    io.withWindowsFileRetry(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  }
}

function restoreBinary(binaryPath) {
  binaryPath = fs.realpathSync(binaryPath);
  const backup = binaryPath + ".zh-cn-backup";
  const receiptPath = binaryPath + ".zh-cn-repair.json";
  if (fs.existsSync(receiptPath)) {
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    const { hash } = require("./native-repair.js");
    if (hash(backup) !== receipt.sourceHash) throw new Error("备份指纹不符，未还原文件；备份已保留");
    if (hash(binaryPath) !== receipt.patchedHash) {
      // CC 已被上游重新安装或升级，不能用同版本旧备份覆盖它。
      fs.unlinkSync(backup);
      fs.unlinkSync(receiptPath);
      fs.rmSync(receiptPath + ".pending", { force: true });
      return { restored: false, reason: "current-file-changed", preservedCurrent: true };
    }
  }
  const version = io.readExecutableVersion(binaryPath);
  if (!version || io.readExecutableVersion(backup) !== version) {
    throw new Error("备份与当前程序版本不一致或无法启动，未还原文件；备份已保留");
  }
  const tempDir = fs.mkdtempSync(path.join(path.dirname(binaryPath), ".zh-cn-restore-"));
  try {
    const candidate = path.join(tempDir, path.basename(binaryPath));
    fs.copyFileSync(backup, candidate);
    io.withWindowsFileRetry(() => fs.renameSync(candidate, binaryPath));
    io.withWindowsFileRetry(() => fs.unlinkSync(backup));
    fs.rmSync(binaryPath + ".zh-cn-repair.json", { force: true });
    fs.rmSync(binaryPath + ".zh-cn-repair.json.pending", { force: true });
    return { restored: true, version };
  } finally {
    io.withWindowsFileRetry(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  }
}

function main() {
  const [command, binaryPath, translationsPath, ...flags] = process.argv.slice(2);
  if (command === "restore" && binaryPath && !translationsPath) {
    process.stdout.write(JSON.stringify(restoreBinary(binaryPath)) + "\n");
    return;
  }
  if (!["patch", "scan"].includes(command) || !binaryPath || !translationsPath || flags.some(f => !["--json", "--dry-run", "--main-table-only"].includes(f))) {
    throw new Error("Usage: patch-bytecode.js <patch|scan> <binary> <translations.json> [--dry-run] [--json] [--main-table-only]");
  }
  const translations = JSON.parse(fs.readFileSync(translationsPath, "utf8"));
  const result = patchBinary(binaryPath, translations, { dryRun: command === "scan" || flags.includes("--dry-run"), mainTableOnly: flags.includes("--main-table-only") });
  process.stdout.write(flags.includes("--json") ? JSON.stringify(result) + "\n" : String(result.patched) + "\n");
}

module.exports = { patchStringPool, patchBinary, restoreBinary, POOL_TRANSLATIONS, rewriteWin289DisplaySource, patchWin289DisplayModules, rewriteMacDisplaySource, patchMacDisplayModules, MAC_DISPLAY_BUILDS };
if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`bytecode patch: ${error.message}\n`);
    process.exitCode = 1;
  }
}
