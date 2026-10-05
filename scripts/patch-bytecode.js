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
  "Shell cwd was reset to ",
  'Agent "',
]);

// 池内专用译文。两类用途：
// 1) 修正主表里放不进窄槽的条目（如 ctrl+o，主表长译 24B 装不进 19B 窄槽）；
// 2) 只在 Bun 常量池里作展示片段的串——写进 cli-translations.json 会让明文路径
//    （patch-cli.js）在协议模板或提示词里误替换，故只在此维护、不走主表。
// 槽宽来自 2.1.260 实测，译文超宽会被静默跳过，改动后用测试核对。
const POOL_TRANSLATIONS = new Map([
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
  const sourceSummary = mainTableOnly ? { sourceModules: 0, sourceReplacements: 0 } :
    patchWin289DisplayModules(bunData, bunOffsets, moduleStructSize, translations, { format, version, sourceHash });
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

module.exports = { patchStringPool, patchBinary, restoreBinary, POOL_TRANSLATIONS, rewriteWin289DisplaySource, patchWin289DisplayModules };
if (require.main === module) {
  try { main(); } catch (error) {
    process.stderr.write(`bytecode patch: ${error.message}\n`);
    process.exitCode = 1;
  }
}
