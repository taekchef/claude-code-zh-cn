const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const patchCli = path.join(repoRoot, "patch-cli.js");
const translations = path.join(repoRoot, "cli-translations.json");

function patchFixture(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-patch-"));
  const cliFile = path.join(dir, "cli.js");
  fs.writeFileSync(cliFile, lines.join("\n"));
  execFileSync("node", [patchCli, cliFile, translations], { encoding: "utf8" });
  return fs.readFileSync(cliFile, "utf8");
}

test("past-tense status verbs are translated when upstream escapes Sautéed", () => {
  const patched = patchFixture([
    'var verbs=["Baked","Brewed","Churned","Cogitated","Cooked","Crunched","Saut\\xE9ed","Worked"];',
    "",
  ]);

  assert.equal(patched.includes("Cooked"), false, patched);
  assert.equal(patched.includes("Saut\\xE9ed"), false, patched);
  assert.match(patched, /"烘焙了","沏了","翻搅了","琢磨了","烹饪了","嚼了","翻炒了","忙活了"/);
});

test("duration patch removes English 'for' from generic Worked/Idle variants", () => {
  const patched = patchFixture([
    "let teammate=`${verb} Worked for ${fmt(Date.now()-task.startTime)}`;",
    "let guarded=H&&`${A} for ${X}`;",
    'let idleA=createElement(T,{dimColor:!0},label," for ",duration);',
    'let idleB=createElement(T,{dimColor:!0},"Idle for ",idleDuration);',
    "",
  ]);

  assert.equal(patched.includes("Worked for"), false, patched);
  assert.equal(patched.includes('" for "'), false, patched);
  assert.equal(patched.includes("Idle for "), false, patched);
  assert.equal(patched.includes("&&`${A} for ${X}`"), false, patched);
  assert.match(patched, /\$\{verb\}\s+\$\{fmt\(Date\.now\(\)-task\.startTime\)\}/);
  assert.match(patched, /&&`\$\{A\} \$\{X\}`/);
  assert.match(patched, /"空闲 "/);
});

test("split literal translation handles folder trust and /btw prompt families", () => {
  const patched = patchFixture([
    'let safety=createElement(T,null,"Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team). If not, take a moment to review what","\'","s in this folder first.");',
    'let safetyBody=createElement(T,null,"Claude Code","\'","ll be able to read, edit, and execute files here.");',
    'let btwTip=createElement(T,null,"Use /btw to ask a quick side question without interrupting Claude","\'","s current work");',
    'let btwLabel="/btw for side question";',
    'let btwShort="Ask a quick side question without interrupting the main conversation";',
    "",
  ]);

  assert.equal(patched.includes("Quick safety check"), false, patched);
  assert.equal(patched.includes('Claude Code","\'","ll'), false, patched);
  assert.equal(patched.includes("/btw for side question"), false, patched);
  assert.equal(
    patched.includes("Use /btw to ask a quick side question without interrupting Claude"),
    false,
    patched
  );
  assert.equal(
    patched.includes("Ask a quick side question without interrupting the main conversation"),
    false,
    patched
  );
  assert.match(patched, /安全检查：这是你自己创建或信任的项目吗？/);
  assert.match(patched, /Claude Code 将能在此目录中读取、编辑和执行文件。/);
  assert.match(patched, /用 \/btw 提一个题外问题，不打断 Claude 当前工作/);
  assert.match(patched, /\/btw 题外问题/);
  assert.match(patched, /提一个题外问题，不打断主对话/);
});

test("approval prompt patch keeps dialog text and key hints in Chinese", () => {
  const patched = patchFixture([
    'let reason="This command requires approval";',
    'let question="Do you want to proceed?";',
    'let confirm="Would you like to proceed?";',
    'let amendHint=" · Tab to amend";',
    'let explainHint=" · ctrl+e to explain";',
    "",
  ]);

  assert.equal(patched.includes("This command requires approval"), false, patched);
  assert.equal(patched.includes("Do you want to proceed?"), false, patched);
  assert.equal(patched.includes("Would you like to proceed?"), false, patched);
  assert.equal(patched.includes("Tab to amend"), false, patched);
  assert.equal(patched.includes("ctrl+e to explain"), false, patched);
  assert.match(patched, /此命令需要批准/);
  assert.match(patched, /要继续吗？/);
  assert.match(patched, / · 按 Tab 修改/);
  assert.match(patched, / · 按 ctrl\+e 说明/);
});

test("bypass permissions startup warning is translated as a complete safety notice", () => {
  const patched = patchFixture([
    'const title="WARNING: Claude Code running in Bypass Permissions mode";',
    'const patchedTitle="WARNING: Claude Code running in 跳过权限检查 mode";',
    'const body="In Bypass Permissions mode, Claude Code will not ask for your approval before running potentially dangerous commands.";',
    'const patchedBody="In 跳过权限检查 mode, Claude Code will not ask for your approval before running potentially dangerous commands.";',
    'const scope="This mode should only be used in a sandboxed container/VM that has restricted internet access and can easily be restored if damaged.";',
    'const responsibility="By proceeding, you accept all responsibility for actions taken while running in Bypass Permissions mode.";',
    'const patchedResponsibility="By proceeding, you accept all responsibility for actions taken while running in 跳过权限检查 mode.";',
    "",
  ]);

  assert.equal(patched.includes("WARNING: Claude Code running in"), false, patched);
  assert.equal(patched.includes("Bypass Permissions"), false, patched);
  assert.equal(patched.includes("will not ask for your approval"), false, patched);
  assert.equal(patched.includes("potentially dangerous commands"), false, patched);
  assert.equal(patched.includes("restricted internet access"), false, patched);
  assert.equal(patched.includes("accept all responsibility"), false, patched);
  assert.match(patched, /警告：Claude Code 正在以跳过权限检查模式运行/);
  assert.match(patched, /不会在运行可能危险的命令前请求你的批准/);
  assert.match(patched, /只应在有受限网络访问、且损坏后易于恢复的沙盒容器或虚拟机中使用/);
  assert.match(patched, /继续操作即表示你接受在跳过权限检查模式下执行的所有操作责任/);
});

test("fragment migrations use targeted structural patches instead of broad english shards", () => {
  const patched = patchFixture([
    'let quick=YX.default.createElement(V,null,"• Cmd+Esc",YX.default.createElement(V,{dimColor:!0}," for Quick Launch"));',
    'let plan=IM.createElement(u,{marginTop:1},IM.createElement(V,{dimColor:!0},\'"/plan open"\'),IM.createElement(V,{dimColor:!0}," to edit this plan in "),IM.createElement(V,{bold:!0,dimColor:!0},Y));',
    'let saveShortcut=i_.default.createElement(u,{marginTop:2},i_.default.createElement(V,{color:"success"},"Press ",g," or ",c," to save,"," ",i_.default.createElement(V,{bold:!0},"e")," to save and edit"));',
    'let clearHint=[b8.createElement(V,{color:"suggestion"},"/clear"),b8.createElement(V,{dimColor:!0}," to save "),b8.createElement(V,{color:"suggestion"},UA," tokens")];',
    'let status=" ready · shift+↓ to view";',
    "",
  ]);

  assert.equal(patched.includes(" for Quick Launch"), false, patched);
  assert.equal(patched.includes(" to edit this plan in "), false, patched);
  assert.equal(patched.includes(" to save "), false, patched);
  assert.equal(patched.includes(" to save and edit"), false, patched);
  assert.equal(patched.includes(" ready · shift+↓ to view"), false, patched);
  assert.match(patched, /"• 快速启动"/);
  assert.match(patched, /" · Cmd\+Esc"/);
  assert.match(patched, /"在 "/);
  assert.match(patched, /' 中用 "\/plan open" 编辑此计划'/);
  assert.match(patched, /"按 ",g," 或 ",c," 保存，按 ",i_\.default\.createElement/);
  assert.match(patched, /" 保存并编辑"/);
  assert.match(patched, /"\/clear"\),b8\.createElement\(V,\{dimColor:!0\}," 保存 "\)/);
  assert.match(patched, /" 已就绪 · 按 shift\+↓ 查看"/);
});

test("string translation must not rewrite identifiers or object keys across code boundaries", () => {
  const patched = patchFixture([
    'const modes={external:"acceptEdits"},bypassPermissions:{title:"Bypass Permissions",shortTitle:"Bypass"};',
    'const permsLabel="Permissions:";',
    'const sandboxNote="Sandbox";',
    'const autoAllowBashIfSandboxed=true;',
    'const config=h.object({failIfUnavailable:h.boolean().optional().describe("Exit with a hard gate."),autoAllowBashIfSandboxed:h.boolean().optional(),allowUnsandboxedCommands:h.boolean().optional().describe("Allow commands in the Sandbox")});',
    "",
  ]);

  assert.match(patched, /const permsLabel="权限：";/);
  assert.match(patched, /const sandboxNote="沙盒";/);
  assert.match(patched, /bypassPermissions:\{title:"跳过权限检查"/, patched);
  assert.match(patched, /autoAllowBashIfSandboxed=true;/, patched);
  assert.equal(patched.includes("bypass权限：{"), false, patched);
  assert.equal(patched.includes("autoAllowBashIf沙盒ed"), false, patched);
});

test("single-quoted and template literal command descriptions are translated", () => {
  const patched = patchFixture([
    'const updateConfig=\'Use this skill to configure the Claude Code harness via settings.json. Automated behaviors ("from now on when X", "each time X", "whenever X", "before/after X") require hooks configured in settings.json - the harness executes these, not Claude, so memory/preferences cannot fulfill them. Also use for: permissions ("allow X", "add permission", "move permission to"), env vars ("set X=Y"), hook troubleshooting, or any changes to settings.json/settings.local.json files. Examples: "allow npm commands", "add bq permission to global settings", "move permission to user settings", "set DEBUG=true", "when claude stops show X". For simple settings like theme/model, use Config tool.\';',
    "const claudeApi=`Build, debug, and optimize Claude API / Anthropic SDK apps. Apps built with this skill should include prompt caching.\n`;",
    "const model=`Set the AI model for Claude Code (currently ${lH(W5())})`;",
    "const fast=`Toggle fast mode (${im} only)`;",
    "",
  ]);

  assert.equal(
    patched.includes("Use this skill to configure the Claude Code harness via settings.json."),
    false,
    patched
  );
  assert.equal(
    patched.includes("Build, debug, and optimize Claude API / Anthropic SDK apps. Apps built with this skill should include prompt caching."),
    false,
    patched
  );
  assert.equal(
    patched.includes("Set the AI model for Claude Code (currently ${lH(W5())})"),
    false,
    patched
  );
  assert.equal(
    patched.includes("Toggle fast mode (${im} only)"),
    false,
    patched
  );
  assert.match(patched, /使用此技能通过 settings\.json 配置 Claude Code harness。/);
  assert.match(patched, /构建、调试并优化 Claude API \/ Anthropic SDK 应用。使用此技能构建的应用应包含 prompt caching。/);
  assert.match(patched, /设置 Claude Code 使用的 AI 模型（当前为 \$\{lH\(W5\(\)\)\}）/);
  assert.match(patched, /切换快速模式（仅 \$\{im\}）/);
});

test("single-quoted literals with apostrophes are translated", () => {
  const patched = patchFixture([
    "const copy='Copy Claude\\'s last response to clipboard (or /copy N for the Nth-latest)';",
    "",
  ]);

  assert.equal(
    patched.includes("Copy Claude\\'s last response to clipboard (or /copy N for the Nth-latest)"),
    false,
    patched
  );
  assert.match(patched, /复制 Claude 的最后一次回复到剪贴板（或 \/copy N 复制第 N 条最近的回复）/);
});

test("model prompt contract translations are skipped while regular UI still patches", () => {
  const patched = patchFixture([
    'const systemPrompt=`You are an interactive agent.',
    'Your responses should be short and concise.',
    'Saving a memory is a two-step process:',
    'You have been invoked in the following environment: Version: Darwin Fast mode',
    'Use exact search terms without * or ?.',
    'Current context: active agent, active shell.',
    'Output Style and Output style are settings payload labels.`;',
    'const statuslineSetup=`You are a status line setup agent for Claude Code. Your job is to create or update the statusLine command in the user\\\'s Claude Code settings.',
    'The status line JSON includes output_style and version fields.',
    'Create an Agent with subagent_type "statusline-setup" and the prompt "Configure my statusLine from my shell PS1 configuration"`;',
    'const ui="Welcome back!";',
    "",
  ]);

  assert.equal(patched.includes("inter活动 Agent"), false, patched);
  assert.equal(patched.includes("你的回复应该简短精炼"), false, patched);
  assert.equal(patched.includes("保存记忆分两步"), false, patched);
  assert.equal(patched.includes("你已在以下环境中被调用"), false, patched);
  assert.equal(patched.includes("without * 或 ?"), false, patched);
  assert.equal(patched.includes("活动 Agent"), false, patched);
  assert.equal(patched.includes("活动 Shell"), false, patched);
  assert.equal(patched.includes("输出风格"), false, patched);
  assert.equal(patched.includes("版本：Darwin"), false, patched);
  assert.equal(patched.includes("快速模式"), false, patched);
  assert.equal(patched.includes("statusLine"), true, patched);
  assert.equal(patched.includes("subagent_type \"statusline-setup\""), true, patched);
  assert.equal(patched.includes("Configure my statusLine from my shell PS1 configuration"), true, patched);
  assert.match(patched, /const ui="欢迎回来！";/);
});

test("statusline setup prompt uses tilde paths instead of guessed home directories", () => {
  const patched = patchFixture([
    "const statuslineSetup=`You are a status line setup agent for Claude Code. Your job is to create or update the statusLine command in the user's Claude Code settings.",
    '',
    "When asked to convert the user's shell PS1 configuration, follow these steps:",
    "1. Read the user's shell configuration files in this order of preference:",
    '   - ~/.zshrc',
    '   - ~/.bashrc',
    '   - ~/.bash_profile',
    '   - ~/.profile',
    '',
    'Update ~/.claude/settings.json when ready.`;',
    "",
  ]);

  assert.match(patched, /Path handling for tools:/);
  assert.match(patched, /Use shell-relative paths exactly as written when calling tools/);
  assert.match(patched, /~\/\.zshrc/);
  assert.match(patched, /~\/\.claude\/settings\.json/);
  assert.match(patched, /Never invent or guess an absolute \/Users\/\.\.\. path/);
  assert.equal(patched.includes("`/Users/...`"), false, patched);
  assert.equal(/[\u3400-\u9fff]/.test(patched), false, patched);
});

test("/statusline command forwards path guard into setup agent task prompt", () => {
  const patched = patchFixture([
    'const statuslineCommand={async getPromptForCommand(H){let _=H.trim()||"Configure my statusLine from my shell PS1 configuration";return[{type:"text",text:`Create an ${n9} with subagent_type "statusline-setup" and the prompt "${_}"`}]}};',
    "",
  ]);

  assert.match(patched, /CRITICAL TOOL PATH RULE/);
  assert.match(patched, /when calling Read, Edit, or Write/);
  assert.match(patched, /use only ~\/\.zshrc, ~\/\.bashrc, ~\/\.bash_profile, ~\/\.profile, and ~\/\.claude\/settings\.json/);
  assert.match(patched, /never use an absolute \/Users\/\.\.\. path/);
  assert.equal(/[\u3400-\u9fff]/.test(patched), false, patched);
});

test("single-quoted and template matches in comments or regex literals stay untouched", () => {
  const patched = patchFixture([
    "// `Toggle fast mode (${im} only)` should remain untouched in comments",
    "// 'Use this skill to configure the Claude Code harness via settings.json.' should remain untouched in comments",
    "const fastPattern=/`Toggle fast mode \\(\\$\\{im\\} only\\)`/;",
    "const configPattern=/'Use this skill to configure the Claude Code harness via settings\\.json\\.'/;",
    "const liveFast=`Toggle fast mode (${im} only)`;",
    "const liveConfig='Use this skill to configure the Claude Code harness via settings.json.';",
    "",
  ]);

  assert.match(patched, /\/\/ `Toggle fast mode \(\$\{im\} only\)` should remain untouched in comments/);
  assert.match(
    patched,
    /\/\/ 'Use this skill to configure the Claude Code harness via settings\.json\.' should remain untouched in comments/
  );
  assert.equal(patched.includes("const fastPattern=/`Toggle fast mode \\(\\$\\{im\\} only\\)`/;"), true, patched);
  assert.equal(
    patched.includes(
      "const configPattern=/'Use this skill to configure the Claude Code harness via settings\\.json\\.'/;"
    ),
    true,
    patched
  );
  assert.match(patched, /切换快速模式（仅 \$\{im\}）/);
  assert.match(patched, /使用此技能通过 settings\.json 配置 Claude Code harness。/);
});

test("template literals with embedded expressions keep expression structure", () => {
  const patched = patchFixture([
    'const key=`${z??""}:${q}`;',
    'const auth=`Error: ${x6(err)||"Failed to authenticate"}`;',
    'const version=`${{VERSION:"2.1.108",BUILD_TIME:"2026-04-14T17:18:04Z"}.VERSION} (Claude Code)`;',
    'const model=`Set the AI model for Claude Code (currently ${currentModel()})`;',
    "const fast=`Toggle fast mode (${im} only)`;",
    "",
  ]);

  assert.equal(patched.includes('const key=`${z??""}:${q}`;'), true, patched);
  assert.equal(
    patched.includes('const auth=`Error: ${x6(err)||"Failed to authenticate"}`;'),
    true,
    patched
  );
  assert.equal(
    patched.includes(
      'const version=`${{VERSION:"2.1.108",BUILD_TIME:"2026-04-14T17:18:04Z"}.VERSION} (Claude Code)`;'
    ),
    true,
    patched
  );
  assert.equal(patched.includes('const model=`设置 Claude Code 使用的 AI 模型（当前为 ${currentModel()}）`;'), true, patched);
  assert.equal(patched.includes('const fast=`切换快速模式（仅 ${im}）`;'), true, patched);
});
