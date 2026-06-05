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

test("native permission dialog status and escaped waiting labels stay translated", () => {
  const patched = patchFixture([
    'let subtitle=N3.createElement(V,{dimColor:!0},"Requires manual approval");',
    'let panel=N3.createElement(K$,{title:g&&!U?"Bash command (unsandboxed)":"Bash command",subtitle:HH});',
    'let wait=rP.createElement(h6,{height:1},rP.createElement(V,{dimColor:!0},"Waiting\\u2026"));',
    'let yesOption={label:"Yes",value:"yes",feedbackConfig:{type:"accept"}};',
    'let noOption={label:"No",value:"no",feedbackConfig:{type:"reject"}};',
    'let permissionLabel={type:"input",label:"Yes, and don\\u2019t ask again for",value:"yes-prefix-edited"};',
    'let prefix=mC.createElement(V,{dimColor:!0},"任意 Bash 命令 starting with"," ",mC.createElement(V,{bold:!0},K));',
    'let exact=mC.createElement(V,{dimColor:!0},"The Bash command ",mC.createElement(V,{bold:!0},q.ruleContent));',
    'let anyTool=mC.createElement(V,{dimColor:!0},"Any use of the ",mC.createElement(V,{bold:!0},q.toolName)," tool");',
    "",
  ]);

  assert.equal(patched.includes("Requires manual approval"), false, patched);
  assert.equal(patched.includes("Bash command"), false, patched);
  assert.equal(patched.includes("Waiting\\u2026"), false, patched);
  assert.equal(patched.includes('label:"Yes",value:"yes"'), false, patched);
  assert.equal(patched.includes('label:"No",value:"no"'), false, patched);
  assert.equal(patched.includes("Yes, and don\\u2019t ask again for"), false, patched);
  assert.equal(patched.includes("starting with"), false, patched);
  assert.equal(patched.includes("The Bash command"), false, patched);
  assert.equal(patched.includes("Any use of the "), false, patched);
  assert.equal(patched.includes('" tool"'), false, patched);
  assert.match(patched, /"需要手动批准"/);
  assert.match(patched, /"Bash 命令（未沙盒隔离）":"Bash 命令"/);
  assert.match(patched, /"等待中…"/);
  assert.match(patched, /label:"是",value:"yes"/);
  assert.match(patched, /label:"否",value:"no"/);
  assert.match(patched, /"是，不再询问"/);
  assert.match(patched, /"任意 Bash 命令以"," "/);
  assert.match(patched, /"Bash 命令 "/);
  assert.match(patched, /"任意使用 ",mC\.createElement/);
  assert.match(patched, /" 工具"/);
});

test("duration formatter patch localizes compact time units with renamed variables", () => {
  const patched = patchFixture([
    'function H7(H,_){if(H<60000){if(H===0)return"0s";if(H<1)return`${(H/1000).toFixed(1)}s`;return`${Math.floor(H/1000).toString()}s`}let q=Math.floor(H/86400000),K=Math.floor(H%86400000/3600000),O=Math.floor(H%3600000/60000),T=Math.round(H%60000/1000);if(T===60)T=0,O++;if(O===60)O=0,K++;if(K===24)K=0,q++;let z=_?.hideTrailingZeros;if(_?.mostSignificantOnly){if(q>0)return`${q}d`;if(K>0)return`${K}h`;if(O>0)return`${O}m`;return`${T}s`}if(q>0){if(z&&K===0&&O===0)return`${q}d`;if(z&&O===0)return`${q}d ${K}h`;return`${q}d ${K}h ${O}m`}if(K>0){if(z&&O===0&&T===0)return`${K}h`;if(z&&T===0)return`${K}h ${O}m`;return`${K}h ${O}m ${T}s`}if(O>0){if(z&&T===0)return`${O}m`;return`${O}m ${T}s`}return`${T}s`}',
    "",
  ]);

  assert.equal(patched.includes('"0s"'), false, patched);
  assert.equal(patched.includes("}d"), false, patched);
  assert.equal(patched.includes("}h"), false, patched);
  assert.equal(patched.includes("}m"), false, patched);
  assert.equal(patched.includes("}s"), false, patched);
  assert.match(patched, /return"0秒"/);
  assert.match(patched, /\$\{q\}天\$\{K\}时\$\{O\}分/);
  assert.match(patched, /\$\{K\}时\$\{O\}分\$\{T\}秒/);
  assert.match(patched, /\$\{O\}分\$\{T\}秒/);
  assert.match(patched, /\$\{T\}秒/);
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

test("issue 80 native dynamic residues use targeted structural patches", () => {
  const patched = patchFixture([
    'let ideNotice=L7.createElement(k,null,"Install the ",L7.createElement(k,{color:"ide"},q)," plugin from the JetBrains Marketplace:"," ",L7.createElement(k,{bold:!0},"https://docs.claude.com/s/claude-code-jetbrains"));',
    'function rHK(H,q,K,$){let f=`Set model to ${P8.bold(US(H))}${$?" and saved as your default for new sessions":" for this session only"}`,A=void 0;return f}',
    'let N4=true,pickerStatus=`Model set to ${bb(v8)}${gW.current?" and saved as your default for new sessions":" for this session only"}`;',
    'let remoteStatus=$(`Set model to ${P8.bold(US(P))}`);',
    'function BNf(){return`Review the current diff for correctness bugs and reuse/simplification/efficiency cleanups at the given effort level (low/medium: fewer, high-confidence findings; high\\u2192max: broader coverage, may include uncertain findings${iB()?"; ultra: deep multi-agent review in the cloud":""}). Pass --comment to post findings as inline PR comments, or --fix to apply the findings to the working tree after the review.`}',
    "",
  ]);

  assert.equal(patched.includes("Install the "), false, patched);
  assert.equal(patched.includes(" plugin from the JetBrains Marketplace:"), false, patched);
  assert.equal(patched.includes("Set model to "), false, patched);
  assert.equal(patched.includes("Model set to "), false, patched);
  assert.equal(patched.includes(" and saved as your default for new sessions"), false, patched);
  assert.equal(patched.includes("Review the current diff for correctness bugs"), false, patched);
  assert.match(patched, /"从 JetBrains Marketplace 安装 ",L7\.createElement\(k,\{color:"ide"\},q\)," 插件："/);
  assert.match(patched, /`已切换模型为 \$\{P8\.bold\(US\(H\)\)\}\$\{\$\?"，并已保存为新会话默认模型":"（仅本次会话）"\}`/);
  assert.match(patched, /`已切换模型为 \$\{bb\(v8\)\}\$\{gW\.current\?"，并已保存为新会话默认模型":"（仅本次会话）"\}`/);
  assert.match(patched, /\$\(`已切换模型为 \$\{P8\.bold\(US\(P\)\)\}`\)/);
  assert.match(patched, /审查当前 diff 的正确性问题/);
  assert.match(patched, /high→max：覆盖更广/);
  assert.match(patched, /ultra：云端深度多 Agent review/);
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
    "const fastCurrent=`Toggle fast mode (${pp()})`;",
    'const fastConcrete="Toggle fast mode (Opus 4.8)";',
    'const fastConcreteOnly="Toggle fast mode (Opus 4.6 only)";',
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
  assert.equal(
    patched.includes("Toggle fast mode (${pp()})"),
    false,
    patched
  );
  assert.equal(
    patched.includes("Toggle fast mode (Opus 4.8)"),
    false,
    patched
  );
  assert.equal(
    patched.includes("Toggle fast mode (Opus 4.6 only)"),
    false,
    patched
  );
  assert.match(patched, /使用此技能通过 settings\.json 配置 Claude Code harness。/);
  assert.match(patched, /构建、调试并优化 Claude API \/ Anthropic SDK 应用。使用此技能构建的应用应包含 prompt caching。/);
  assert.match(patched, /设置 Claude Code 使用的 AI 模型（当前为 \$\{lH\(W5\(\)\)\}）/);
  assert.match(patched, /切换快速模式（仅 \$\{im\}）/);
  assert.match(patched, /切换快速模式（\$\{pp\(\)\}）/);
  assert.match(patched, /切换快速模式（Opus 4\.8）/);
  assert.match(patched, /切换快速模式（仅 Opus 4\.6）/);
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

test("dynamic effort help description is translated while preserving choices expression", () => {
  const patched = patchFixture([
    'H.addOption(new H1("--effort <level>",`Effort level for the current session (${QL.join(", ")})`).argParser(parseEffort));',
    "",
  ]);

  assert.equal(patched.includes("Effort level for the current session"), false, patched);
  assert.equal(
    patched.includes('`当前会话的 effort 级别（${QL.join(", ")}）`'),
    true,
    patched
  );
});

test("issue 80 slash command menu residues are translated", () => {
  const patched = patchFixture([
    'const exitDescription="Exit the CLI";',
    'const feedback={name:"feedback",description:"Submit feedback, report a bug, or share your conversation"};',
    'const focus={name:"focus",description:"Toggle focus view (show only your prompt, a tool summary, and the final response)"};',
    'const goal={name:"goal",description:"Set a goal \\u2014 keep working until the condition is met"};',
    "const singleQuotedGoal={name:'goal',description:'Set a goal \\u2014 keep working until the condition is met'};",
    'const batch={name:"batch",description:"Research and plan a large-scale change, then execute it in parallel across 5\\u201330 isolated worktree agents that each open a PR."};',
    'const chrome={name:"claude-in-chrome",description:"Automates your Chrome browser to interact with web pages - clicking elements, filling forms, capturing screenshots, reading console logs, and navigating sites. Opens pages in new tabs within your existing Chrome session. Requires site-level permissions before executing (configured in the extension)."};',
    'const fewer={name:"fewer-permission-prompts",description:"Scan your transcripts for common read-only Bash and MCP tool calls, then add a prioritized allowlist to project .claude/settings.json to reduce permission prompts."};',
    'const simplify={name:"simplify",description:"Review the changed code for reuse, simplification, efficiency, and altitude cleanups, then apply the fixes. Quality only \\u2014 it does not hunt for bugs; use /code-review for that."};',
    'const schedule={name:"schedule",description:"Create, update, list, or run scheduled remote agents (routines) that execute on a cron schedule."};',
    "const run={name:\"run\",description:\"Launch and drive this project's app to see a change working.\"};",
    'const runSkillGenerator={name:"run-skill-generator",description:"Author or improve the run-<unit> skill for this project."};',
    'const usage={name:"usage",description:"Show session cost, plan usage, and activity stats"};',
    'const stop={name:"stop",description:"Stop this background session; transcript and worktree are kept"};',
    "",
  ]);

  assert.equal(patched.includes("Exit the CLI"), false, patched);
  assert.equal(patched.includes("Submit feedback, report a bug, or share your conversation"), false, patched);
  assert.equal(patched.includes("Toggle focus view (show only your prompt"), false, patched);
  assert.equal(patched.includes("Set a goal \\u2014 keep working until the condition is met"), false, patched);
  assert.equal(patched.includes("Show session cost, plan usage, and activity stats"), false, patched);
  assert.equal(patched.includes("Stop this background session; transcript and worktree are kept"), false, patched);
  assert.match(patched, /退出 CLI/);
  assert.match(patched, /提交反馈、报告问题或分享你的对话/);
  assert.match(patched, /切换专注视图/);
  assert.match(patched, /设置目标：持续工作直到条件满足/);
  assert.match(patched, /description:'设置目标：持续工作直到条件满足'/);
  assert.match(patched, /调研并规划大规模改动/);
  assert.match(patched, /自动操作你的 Chrome 浏览器与网页交互/);
  assert.match(patched, /减少权限确认/);
  assert.match(patched, /只做质量清理，不查 bug/);
  assert.match(patched, /按 cron 定时执行/);
  assert.match(patched, /确认改动实际生效/);
  assert.match(patched, /编写或改进 run-<unit> skill/);
  assert.match(patched, /显示会话成本、计划用量和活动统计/);
  assert.match(patched, /停止这个后台会话；保留 transcript 和 worktree/);
});

test("issue 122 slash and prompt command descriptions are translated", () => {
  const issue122Descriptions = [
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
  ];

  const sourceLines = issue122Descriptions.map(
    ([en], index) => `const issue122_${index}=${JSON.stringify(en)};`
  );
  sourceLines[20] = String.raw`const issue122_20="Launch this project\u2019s app to see your change working";`;
  sourceLines[21] = String.raw`const issue122_21="Create a skill that knows how to run this project\u2019s app";`;
  sourceLines[33] = String.raw`const issue122_33="Push a React design system to claude.ai/design. This runs a converter that bundles the real component code (from Storybook or a bare package) and uploads it. Use when the user runs /design-sync or says \"sync my design system to Claude Design\".";`;
  sourceLines[34] = String.raw`const issue122_34="Reference for the Claude API / Anthropic SDK \u2014 model ids, pricing, params, streaming, tool use, MCP, agents, caching, token counting, model migration.";`;
  sourceLines[36] = String.raw`const issue122_36="Author or improve the run-<unit> skill \u2014 a per-project skill that tells agents how to build, launch, and drive this project's app. Use when the user asks to set up the project, get it running, write run instructions, or verify build/run steps work from a clean environment.";`;

  const patched = patchFixture([...sourceLines, ""]);

  for (const [en, zh] of issue122Descriptions) {
    assert.equal(patched.includes(en), false, patched);
    assert.match(patched, new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
