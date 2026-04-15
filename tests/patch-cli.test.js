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
