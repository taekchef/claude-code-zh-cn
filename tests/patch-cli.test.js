const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const patchCli = path.join(repoRoot, "patch-cli.js");
const translations = path.join(repoRoot, "cli-translations.json");

function getNonChineseSlashCommandDescriptions() {
  const cliJs = fs.readFileSync("/opt/homebrew/lib/node_modules/@anthropic-ai/claude-code/cli.js", "utf8");
  const re = /type:"(?:local-jsx|local)",name:"([^"]+)"(?:,aliases:\[(.*?)\])?,description:"([^"]*)"/g;
  const cjk = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;
  const rows = [];

  let match;
  while ((match = re.exec(cliJs))) {
    const desc = match[3];
    if (!cjk.test(desc)) {
      rows.push({ name: match[1], desc });
    }
  }

  return rows;
}

test("duration patch removes English 'for' from generic Worked/Idle variants", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-patch-"));
  const cliFile = path.join(dir, "cli.js");
  fs.writeFileSync(
    cliFile,
    [
      "let teammate=`${verb} Worked for ${fmt(Date.now()-task.startTime)}`;",
      'let idleA=createElement(T,{dimColor:!0},label," for ",duration);',
      'let idleB=createElement(T,{dimColor:!0},"Idle for ",idleDuration);',
      "",
    ].join("\n")
  );

  execFileSync("node", [patchCli, cliFile, translations], { encoding: "utf8" });
  const patched = fs.readFileSync(cliFile, "utf8");

  assert.equal(patched.includes("Worked for"), false, patched);
  assert.equal(patched.includes('" for "'), false, patched);
  assert.equal(patched.includes("Idle for "), false, patched);
  assert.match(patched, /\$\{verb\}\s+\$\{fmt\(Date\.now\(\)-task\.startTime\)\}/);
  assert.match(patched, /"空闲 "/);
});

test("template-string and static UI patching cover the known Chrome and model leak cases", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-patch-"));
  const cliFile = path.join(dir, "cli.js");
  fs.writeFileSync(
    cliFile,
    [
      'const upgradeTitle=`Newer ${tierLabel} model available`;',
      'const settingsLabel="Update settings to use ";',
      'const chromeIntro="Claude in Chrome works with the Chrome extension to let you control your browser directly from Claude Code. Navigate websites, fill forms, capture screenshots, record GIFs, and debug with console logs and network requests.";',
      "",
    ].join("\n")
  );

  execFileSync("node", [patchCli, cliFile, translations], { encoding: "utf8" });
  const patched = fs.readFileSync(cliFile, "utf8");

  assert.equal(patched.includes("Newer ${tierLabel} model available"), false, patched);
  assert.equal(patched.includes("Update settings to use "), false, patched);
  assert.equal(
    patched.includes(
      "Claude in Chrome works with the Chrome extension to let you control your browser directly from Claude Code. Navigate websites, fill forms, capture screenshots, record GIFs, and debug with console logs and network requests."
    ),
    false,
    patched
  );
  assert.match(patched, /`有新的 \$\{tierLabel\} 模型可用`;/);
  assert.match(patched, /"更新设置以使用 ";/);
  assert.match(
    patched,
    /"Claude in Chrome 借助 Chrome 扩展，让你直接从 Claude Code 控制浏览器。可浏览网站、填写表单、截取屏幕、录制 GIF，并通过控制台日志和网络请求调试。";/
  );
});

test("slash command descriptions for add-dir and agents are translated from the shared translation table", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-patch-"));
  const cliFile = path.join(dir, "cli.js");
  fs.writeFileSync(
    cliFile,
    [
      'const addDirDesc="Add a new working directory";',
      'const agentsDesc="Manage agent configurations";',
      "",
    ].join("\n")
  );

  execFileSync("node", [patchCli, cliFile, translations], { encoding: "utf8" });
  const patched = fs.readFileSync(cliFile, "utf8");

  assert.equal(patched.includes("Add a new working directory"), false, patched);
  assert.equal(patched.includes("Manage agent configurations"), false, patched);
  assert.match(patched, /"添加新的工作目录";/);
  assert.match(patched, /"管理 Agent 配置";/);
});

test("all non-Chinese slash command descriptions are translated from the shared translation table", () => {
  const rows = getNonChineseSlashCommandDescriptions();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-patch-"));
  const cliFile = path.join(dir, "cli.js");

  fs.writeFileSync(
    cliFile,
    rows.map((row, index) => `const desc${index}=${JSON.stringify(row.desc)};`).join("\n")
  );

  execFileSync("node", [patchCli, cliFile, translations], { encoding: "utf8" });
  const patched = fs.readFileSync(cliFile, "utf8");

  for (const { desc } of rows) {
    assert.equal(patched.includes(desc), false, desc);
  }
});

test("conditional and dynamic slash command descriptions are translated from the shared translation table and regex patches", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-patch-"));
  const cliFile = path.join(dir, "cli.js");
  fs.writeFileSync(
    cliFile,
    [
      'const keybindings="Open or create your keybindings configuration file";',
      'const loginA="Sign in with your Anthropic account";',
      'const loginB="Switch Anthropic accounts";',
      'const releaseNotes="View release notes";',
      'const terminalA="Enable Option+Enter key binding for newlines and visual bell";',
      'const terminalB="Install Shift+Enter key binding for newlines";',
      'const initA="Initialize a new CLAUDE.md file with codebase documentation";',
      'const initB="Initialize new CLAUDE.md file(s) and optional skills/hooks with codebase documentation";',
      'const batch="Research and plan a large-scale change, then execute it in parallel across 5–30 isolated worktree agents that each open a PR.";',
      'const claudeApi="Build, debug, and optimize Claude API / Anthropic SDK apps. Apps built with this skill should include prompt caching.\\nTRIGGER when: code imports `anthropic`/`@anthropic-ai/sdk`; user asks to use the Claude API, Anthropic SDKs, or Managed Agents (`/v1/agents`, `/v1/sessions`); user asks to add, modify, debug, optimize, or improve a Claude feature (prompt caching, cache hit rate, adaptive thinking, compaction, code_execution, batch, files API, citations, memory tool) or a Claude model (Opus/Sonnet/Haiku) in a file; or user asks about prompt caching / cache hit rate / cache reads / cache creation in any project that uses the Anthropic SDK (even without mentioning Claude by name).\\nDO NOT TRIGGER when: file imports `openai`/non-Anthropic SDK, filename signals another provider (`agent-openai.py`, `*-generic.py`), code is provider-neutral, or task is general programming/ML.";',
      'const review="Review a pull request";',
      'const simplify="Review changed code for reuse, quality, and efficiency, then fix any issues found.";',
      'const updateConfig=\'Use this skill to configure the Claude Code harness via settings.json. Automated behaviors ("from now on when X", "each time X", "whenever X", "before/after X") require hooks configured in settings.json - the harness executes these, not Claude, so memory/preferences cannot fulfill them. Also use for: permissions ("allow X", "add permission", "move permission to"), env vars ("set X=Y"), hook troubleshooting, or any changes to settings.json/settings.local.json files. Examples: "allow npm commands", "add bq permission to global settings", "move permission to user settings", "set DEBUG=true", "when claude stops show X". For simple settings like theme/model, use Config tool.\';',
      'const fastMode=`Toggle fast mode (${modeLabel} only)`;',
      'const loopA="Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo). Omit the interval to let the model self-pace.";',
      'const loopB="Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo, defaults to 10m)";',
      'const modelDesc=`Set the AI model for Claude Code (currently ${currentModel})`;',
      "",
    ].join("\n")
  );

  execFileSync("node", [patchCli, cliFile, translations], { encoding: "utf8" });
  const patched = fs.readFileSync(cliFile, "utf8");

  const englishFragments = [
    "Open or create your keybindings configuration file",
    "Sign in with your Anthropic account",
    "Switch Anthropic accounts",
    "View release notes",
    "Enable Option+Enter key binding for newlines and visual bell",
    "Install Shift+Enter key binding for newlines",
    "Initialize a new CLAUDE.md file with codebase documentation",
    "Initialize new CLAUDE.md file(s) and optional skills/hooks with codebase documentation",
    "Research and plan a large-scale change, then execute it in parallel across 5–30 isolated worktree agents that each open a PR.",
    "Build, debug, and optimize Claude API / Anthropic SDK apps. Apps built with this skill should include prompt caching.",
    "Review a pull request",
    "Review changed code for reuse, quality, and efficiency, then fix any issues found.",
    "Use this skill to configure the Claude Code harness via settings.json. Automated behaviors (\"from now on when X\", \"each time X\", \"whenever X\", \"before/after X\") require hooks configured in settings.json - the harness executes these, not Claude, so memory/preferences cannot fulfill them. Also use for: permissions (\"allow X\", \"add permission\", \"move permission to\"), env vars (\"set X=Y\"), hook troubleshooting, or any changes to settings.json/settings.local.json files. Examples: \"allow npm commands\", \"add bq permission to global settings\", \"move permission to user settings\", \"set DEBUG=true\", \"when claude stops show X\". For simple settings like theme/model, use Config tool.",
    "Toggle fast mode (${modeLabel} only)",
    "Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo). Omit the interval to let the model self-pace.",
    "Run a prompt or slash command on a recurring interval (e.g. /loop 5m /foo, defaults to 10m)",
    "Set the AI model for Claude Code (currently ${currentModel})",
  ];

  for (const fragment of englishFragments) {
    assert.equal(patched.includes(fragment), false, fragment);
  }

  assert.match(patched, /"打开或创建你的 keybindings 配置文件";/);
  assert.match(patched, /"使用你的 Anthropic 账号登录";/);
  assert.match(patched, /"切换 Anthropic 账号";/);
  assert.match(patched, /"查看更新说明";/);
  assert.match(patched, /"启用 Option\+Enter 换行键绑定和视觉铃声";/);
  assert.match(patched, /"安装 Shift\+Enter 换行键绑定";/);
  assert.match(patched, /"用代码库文档初始化新的 CLAUDE\.md 文件";/);
  assert.match(patched, /"用代码库文档初始化新的 CLAUDE\.md 文件，并可选创建技能\/Hook";/);
  assert.match(patched, /"调研并规划一项大规模变更，然后将其并行拆分给 5–30 个彼此隔离的 worktree Agent 执行，每个 Agent 都会打开一个 PR。";/);
  assert.match(
    patched,
    /"构建、调试并优化 Claude API \/ Anthropic SDK 应用。使用此技能构建的应用应包含 prompt caching。\\n在以下情况下触发：/
  );
  assert.match(patched, /"审查一个 PR";/);
  assert.match(patched, /"审查变更代码的复用性、质量和效率，并修复发现的任何问题。";/);
  assert.match(
    patched,
    /'使用此技能通过 settings\.json 配置 Claude Code harness。自动化行为（“从现在起当 X”“每次 X”“每当 X”“在 X 之前\/之后”）需要在 settings\.json 中配置 Hook - 这些由 harness 执行，不是 Claude，因此记忆\/偏好无法满足它们。也用于：权限（“允许 X”“添加权限”“移动权限到”）、环境变量（“设置 X=Y”）、Hook 故障排查，或对 settings\.json\/settings\.local\.json 的任何修改。示例：“允许 npm 命令”“向全局设置添加 bq 权限”“将权限移到用户设置”“设置 DEBUG=true”“当 claude 停止时显示 X”。对于主题\/模型这类简单设置，请使用 Config 工具。';/
  );
  assert.match(patched, /`切换快速模式（\$\{modeLabel\} 专用）`;/);
  assert.match(patched, /"在固定间隔内运行提示词或斜杠命令（例如 \/loop 5m \/foo）。省略间隔则让模型自行调整节奏。";/);
  assert.match(patched, /"在固定间隔内运行提示词或斜杠命令（例如 \/loop 5m \/foo，默认为 10m）";/);
  assert.match(patched, /`设置 Claude Code 使用的 AI 模型（当前为 \$\{currentModel\}）`;/);
});

test("string translation must not rewrite identifiers or object keys across code boundaries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-patch-"));
  const cliFile = path.join(dir, "cli.js");
  fs.writeFileSync(
    cliFile,
    [
      'const modes={external:"acceptEdits"},bypassPermissions:{title:"Bypass Permissions",shortTitle:"Bypass"};',
      'const permsLabel="Permissions:";',
      'const sandboxNote="Sandbox";',
      'const autoAllowBashIfSandboxed=true;',
      'const config=h.object({failIfUnavailable:h.boolean().optional().describe("Exit with a hard gate."),autoAllowBashIfSandboxed:h.boolean().optional(),allowUnsandboxedCommands:h.boolean().optional().describe("Allow commands in the Sandbox")});',
      "",
    ].join("\n")
  );

  execFileSync("node", [patchCli, cliFile, translations], { encoding: "utf8" });
  const patched = fs.readFileSync(cliFile, "utf8");

  assert.match(patched, /const permsLabel="权限：";/);
  assert.match(patched, /const sandboxNote="沙盒";/);
  assert.match(patched, /bypassPermissions:\{title:"跳过权限检查"/, patched);
  assert.match(patched, /autoAllowBashIfSandboxed=true;/, patched);
  assert.equal(patched.includes("bypass权限：{"), false, patched);
  assert.equal(patched.includes("autoAllowBashIf沙盒ed"), false, patched);
});
