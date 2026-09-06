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

function patchFixtureRepeated(lines, times) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-patch-repeat-"));
  const cliFile = path.join(dir, "cli.js");
  fs.writeFileSync(cliFile, lines.join("\n"));
  for (let i = 0; i < times; i += 1) {
    execFileSync("node", [patchCli, cliFile, translations], { encoding: "utf8" });
  }
  return fs.readFileSync(cliFile, "utf8");
}

function runPatchedFixture(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-patch-run-"));
  const cliFile = path.join(dir, "cli.js");
  fs.writeFileSync(cliFile, lines.join("\n"));
  execFileSync("node", [patchCli, cliFile, translations], { encoding: "utf8" });
  return {
    patched: fs.readFileSync(cliFile, "utf8"),
    output: execFileSync("node", [cliFile], { encoding: "utf8" }).trim(),
  };
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

test("new status families localize Thought, duration hints and running shells", () => {
  const patched = patchFixture([
    'var verbs=["Thought","Crunched","Brewed","Worked"];',
    'let thought=`Thought for ${elapsed} (ctrl+o to expand)`;',
    'let running=`Crunched for ${elapsed} · ${count} shell still running`;',
    'let plural=`Brewed for ${elapsed} · ${count} shells still running`;',
    "",
  ]);

  for (const residue of ["Thought for", "Crunched for", "Brewed for", "ctrl+o to expand", "shell still running", "shells still running"]) {
    assert.equal(patched.includes(residue), false, patched);
  }
  assert.match(patched, /\["思考了","嚼了","沏了","忙活了"\]/);
  assert.match(patched, /`思考了 \$\{elapsed\} \(ctrl\+o 展开\)`/);
  assert.match(patched, /`嚼了 \$\{elapsed\} · \$\{count\} 个 shell 仍在运行`/);
  assert.match(patched, /`沏了 \$\{elapsed\} · \$\{count\} 个 shell 仍在运行`/);
});

test("pasted text protocol stays parseable while visible line counts are localized", () => {
  const patched = patchFixture([
    'function pasteLabel(id,count){if(count===0)return`[Pasted text #${id}]`;return`[Pasted text #${id} +${count} lines]`}',
    'function damagedPasteLabel(id,count){if(count===0)return`[Pasted text #${id}]`;return`[Pasted text #${id} +${count} 行]`}',
    'function parsePaste(text){return /\\[(Pasted text|Image) #(\\d+)(?: \\+\\d+ lines)?\\]/g.test(text)}',
    'function lineCount(count,unit="line"){if(count<=0)return"";return`… +${count} ${pluralize(count,unit)}`}',
    '',
  ]);

  assert.equal(patched.includes('+${count} 行]'), false, patched);
  assert.equal((patched.match(/`\[Pasted text #\$\{id\} \+\$\{count\} lines\]`/g) || []).length, 2, patched);
  assert.match(patched, /\\\+\\d\+ lines/);
  assert.match(patched, /function lineCount\(count,unit="line"\)\{if\(count<=0\)return"";return`… \+\$\{count\} 行`\}/);
});

test("visible Running labels are localized without changing tool metadata", () => {
  const patched = patchFixture([
    'let shell=ui.jsx(Text,{dimColor:true,children:"Running\\u2026 "});',
    'function progress(last){if(!last?.data)return ui.jsx(Text,{children:"Running\\u2026"});if(last.data.progress===void 0)return ui.jsx(Text,{children:"Running\\u2026"})}',
    'let toolStatus=hasTool?`运行中 ${tool.name}(${input})\\u2026`:"Running\\u2026";let rendered=ui.jsxs(Text,{children:["(",toolStatus," ",elapsed,")"]});',
    'let toolLabels={Bash:"Running",Task:"Running task",status:"running"};',
    '',
  ]);

  assert.equal(patched.includes('children:"Running\\u2026'), false, patched);
  assert.match(patched, /children:"运行中… /);
  assert.match(patched, /children:"运行中…"/);
  assert.match(patched, /hasTool\?`运行中 \$\{tool\.name\}\(\$\{input\}\)\\u2026`:"运行中…"/);
  assert.match(patched, /Bash:"Running",Task:"Running task",status:"running"/);
});

test("native 2.1.233 retry warning and dynamic expand hint are localized", () => {
  const patched = patchFixture([
    'let stalled=wh.jsx(_,{color:"error",children:"Waiting for API response"});',
    'let retry=wh.jsxs(_,{dimColor:!0,children:[" \\xB7 will retry in ",remaining," \\xB7 check your network"]});',
    'function expandHint(shortcut){return Xt.dim(`(${shortcut} to expand)`)}',
    '',
  ]);

  for (const residue of ["Waiting for API response", "will retry in", "check your network", "to expand"]) {
    assert.equal(patched.includes(residue), false, patched);
  }
  assert.match(patched, /"等待 API 响应"/);
  assert.match(patched, /" \\xB7 将在 ",remaining," 后重试 \\xB7 请检查网络"/);
  assert.match(patched, /`\(\$\{shortcut\} 展开\)`/);
});

test("goal active indicator is localized without changing command tokens", () => {
  const patched = patchFixture([
    'let indicator=ui.jsxs(Text,{color:color,children:[ui.jsxs(Text,{children:[glyph," "]}),"/goal active",elapsed]});',
    'let command={name:"/goal",status:"active"};',
    '',
  ]);

  assert.match(patched, /,"\/goal 已启用",elapsed/);
  assert.match(patched, /name:"\/goal",status:"active"/);
});

test("goal progress statuses and statistics are localized", () => {
  const patched = patchFixture([
    'let status=failed?"Goal could not be achieved":met?"Goal achieved":"Goal not yet met\\u2026 continuing";',
    'let details=` (${parts.join(" \\xB7 ")})`;',
    'parts.push(`${duration} ${turns}`);',
    'case"goal_status":{if(goal.tokens!==void 0){parts.push(`${tokenCount} tokens`)}const statusAgain=failed?"Goal could not be achieved":met?"Goal achieved":"Goal not yet met\\u2026 continuing";}',
    'let condition=eo.jsxs(_,{children:["Goal: ",goal.condition]});',
    'function goalHint(){let memo=cache.c(3),first=React.useContext(primary),second=React.useContext(secondary),shortcut=ox("app:toggleTranscript","Global","ctrl+o");if(first||second){return null}let format;if(memo[0]===seed)format={keyCase:"lower"},memo[0]=format;else format=memo[0];let result;if(memo[1]!==shortcut)result=scr.jsx(_,{dimColor:!0,children:scr.jsx(it,{chord:shortcut,action:"expand",parens:!0,format:format})}),memo[1]=shortcut,memo[2]=result;else result=memo[2];return result}',
    'let anotherHint=eQe.jsx(it,{chord:otherShortcut,action:"expand",parens:!0,format:otherFormat});',
    'let unrelated=description==="Goal: ";',
    'let unrelatedTokens=`${otherTokenCount} tokens`;',
    '',
  ]);

  for (const residue of ["Goal could not be achieved", "Goal achieved", "Goal not yet met"]) {
    assert.equal(patched.includes(residue), false, patched);
  }
  assert.match(patched, /"未能达成目标"/);
  assert.match(patched, /"目标已达成"/);
  assert.match(patched, /"目标尚未达成…继续执行"/);
  assert.match(patched, /`\$\{tokenCount\} 个 token`/);
  assert.match(patched, /children:\["目标：",goal\.condition\]/);
  assert.match(patched, /chord:shortcut,action:"展开"/);
  assert.match(patched, /chord:otherShortcut,action:"expand"/);
  assert.match(patched, /description==="Goal: "/);
  assert.match(patched, /`\$\{otherTokenCount\} tokens`/);
});

test("recap status literals are localized", () => {
  const patched = patchFixture([
    'const title="Session recap";',
    'const loading="Generating recap";',
    'const progress="Recapping conversation";',
    "",
  ]);

  assert.equal(patched.includes("Session recap"), false, patched);
  assert.equal(patched.includes("Generating recap"), false, patched);
  assert.equal(patched.includes("Recapping conversation"), false, patched);
  assert.match(patched, /"会话回顾"/);
  assert.match(patched, /"正在生成会话回顾"/);
  assert.match(patched, /"正在回顾会话"/);
});

test("turn-duration shell summary (native 2.1.221 shape) is localized", () => {
  const patched = patchFixture([
    'let summary; if (o>0) summary.push(o===1?"1 shell":`${o} shells`);',
    'let row=H&&wo.jsx(y,{dimColor:!0,children:` \\xB7 ${summary} still running`});',
    "",
  ]);

  assert.match(patched, /"1 个 shell"/);
  assert.match(patched, /`\$\{o\} 个 shell`/);
  assert.match(patched, /` \\xB7 \$\{summary\} 仍在运行`/);
  assert.equal(patched.includes("still running`"), false, patched);
});

test("recap heading and /config model-switch tip are localized", () => {
  const patched = patchFixture([
    'let heading=jsxs(y,{bold:!0,children:["recap:"," "]});',
    'let tip="Tip: You can configure model switch behavior in /config";',
    "",
  ]);

  assert.match(patched, /"会话回顾:"/);
  assert.match(patched, /"提示：可在 \/config 中配置模型切换行为"/);
});

test("duration patch removes English 'for' from generic Worked/Idle variants", () => {
  const patched = patchFixture([
    "let teammate=`${verb} Worked for ${fmt(Date.now()-task.startTime)}`;",
    'let finished=allIdle?`Worked for ${fmt(Date.now()-task.startTime)}`:"Idle";',
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
  assert.match(patched, /allIdle\?`忙活了 \$\{fmt\(Date\.now\(\)-task\.startTime\)\}`:"空闲"/);
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
    'function NYT(){return`Review the current diff for correctness bugs and reuse/simplification/efficiency cleanups at the given effort level (low/medium: fewer, high-confidence findings; high\\u2192max: broader coverage, may include uncertain findings${r__()?`; ultra: deep multi-agent review in the cloud${Sg()?"":" (requires claude.ai account access)"}`:""}). Pass --comment to post findings as inline PR comments, or --fix to apply the findings to the working tree after the review.`}',
    "",
  ]);

  assert.equal(patched.includes("Install the "), false, patched);
  assert.equal(patched.includes(" plugin from the JetBrains Marketplace:"), false, patched);
  assert.equal(patched.includes("Set model to "), false, patched);
  assert.equal(patched.includes("Model set to "), false, patched);
  assert.equal(patched.includes(" and saved as your default for new sessions"), false, patched);
  assert.equal(patched.includes("Review the current diff for correctness bugs"), false, patched);
  assert.equal(patched.includes("requires claude.ai account access"), false, patched);
  assert.match(patched, /"从 JetBrains Marketplace 安装 ",L7\.createElement\(k,\{color:"ide"\},q\)," 插件："/);
  assert.match(patched, /`已切换模型为 \$\{P8\.bold\(US\(H\)\)\}\$\{\$\?"，并已保存为新会话默认模型":"（仅本次会话）"\}`/);
  assert.match(patched, /`已切换模型为 \$\{bb\(v8\)\}\$\{gW\.current\?"，并已保存为新会话默认模型":"（仅本次会话）"\}`/);
  assert.match(patched, /\$\(`已切换模型为 \$\{P8\.bold\(US\(P\)\)\}`\)/);
  assert.match(patched, /审查当前 diff 的正确性问题/);
  assert.match(patched, /high→max：覆盖更广/);
  assert.match(patched, /ultra：云端深度多 Agent review/);
  assert.match(patched, /需要 claude\.ai 账号权限/);
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

test("effort picker and dynamic workflow UI residues are translated without changing option values", () => {
  const patched = patchFixture([
    'const effortTitle="Effort";',
    'const effortScale=["Faster","Smarter","xhigh + workflows"];',
    'const effortFooter="←/→ to adjust · Enter to confirm · Esc to cancel";',
    'const effortFooterTemplate=co.useMemo(()=>`${R2H([jp("left"),jp("right")])} to adjust \\xB7 ${R2H([jp("enter")])} to confirm \\xB7 ${R2H([jp("escape")])} to cancel`,[]);',
    'const effortFooterComponent=Nq.createElement(G6,null,Nq.createElement(K_,{chord:["left","right"],action:"adjust"}),Nq.createElement(K_,{chord:"enter",action:"confirm"}),Nq.createElement(K_,{chord:"escape",action:"cancel"}));',
    'const effortUsage=`Usage: /effort [low|medium|high|xhigh|max${extra}|auto] Effort levels: - low: Quick, straightforward implementation - medium: Balanced approach with standard testing - high: Comprehensive implementation with extensive testing - xhigh: Extended reasoning with thorough analysis (${xhighNote}) - max: Maximum capability with deepest reasoning (${maxNote})`;',
    'const ultracode="- ultracode: xhigh + dynamic workflow orchestration (this session only)";',
    'const auto="- auto: Use the default effort level for your model";',
    'const lowDescription="Quick, straightforward implementation with minimal overhead";',
    'const mediumDescription="Balanced approach with standard implementation and testing";',
    'const highDescription="Comprehensive implementation with extensive testing and documentation";',
    'const xhighDescription=`Deeper reasoning than high, just below maximum (${note})`;',
    'const maxDescription=`Maximum capability with deepest reasoning. ${note}`;',
    'const effortPrompt="Change effort level?";',
    'const effortCurrent=`Current effort level: ${level} (${source})`;',
    'const effortAuto=`Effort level: auto (currently ${level})`;',
    'const effortFailed=`Failed to set effort level: ${message}`;',
    'const workflowTitle="Dynamic workflows";',
    'const workflowLoading="Loading dynamic workflow history\\u2026";',
    'const workflowEmpty="No dynamic workflows in this session.";',
    'const workflowDismissed="Dynamic workflows dialog dismissed";',
    'const workflowReview="Review dynamic workflow before running";',
    'const workflowAsk="Run a dynamic workflow?";',
    'const workflowSummary="View workflow summary";',
    'const workflowScript="View raw script";',
    'const workflowTokenA="Dynamic workflows can use a lot of tokens quickly by running many";',
    'const workflowTokenB="subagents in parallel \\u2014 which counts against your usage limit. Stop a";',
    'const workflowTokenC="running workflow at any time with /workflows, or disable dynamic workflows in /config.";',
    'const workflowSave="Save dynamic workflow";',
    'const workflowLaunched=`Workflow launched in background. Task ID: ${taskId}${summary}${transcript}${script}${runId} You will be notified when it completes. Use /workflows to watch live progress.`;',
    'const workflowLaunchedWithBreaks=`Workflow launched in background. Task ID: ${taskId}${summary}${transcript}${script}${runId}\\n\\nYou will be notified when it completes. Use /workflows to watch live progress.`;',
    'const workflowStop="x stop workflow";',
    'const workflowViewRuns="to view dynamic workflow runs";',
    'const workflowClose=VO.createElement(K_,{chord:"escape",action:"close"});',
    'const workflowDefaultClose=qT.default.createElement(K_,{chord:"escape",action:"close"});',
    'const workflowDisabled="Dynamic workflows are disabled by managed settings (`disableWorkflows`).";',
    'const workflowUnavailable="Dynamic workflows are not enabled for this session (org policy, launch gate, or the \\"Dynamic workflows\\" setting in /config).";',
    'const workflowConflict="Workflow file conflict";',
    'const workflowFile="The file .github/workflows/claude.yml already exists";',
    'const creatingPlural="Creating workflow files";',
    'const creatingSingle="Creating workflow file";',
    "",
  ]);

  for (const residue of [
    "Faster",
    "Smarter",
    "xhigh + workflows",
    "to adjust",
    "to confirm",
    'action:"adjust"',
    'action:"confirm"',
    'action:"cancel"',
    "Usage: /effort",
    "Quick, straightforward implementation",
    "Balanced approach with standard implementation",
    "Balanced approach with standard testing",
    "Comprehensive implementation with extensive testing",
    "Extended reasoning with thorough analysis",
    "Deeper reasoning than high",
    "Maximum capability with deepest reasoning",
    "Use the default effort level",
    "Change effort level?",
    "Current effort level",
    "Effort level: auto",
    "Failed to set effort level",
    "Dynamic workflows",
    "Loading dynamic workflow history",
    "No dynamic workflows in this session.",
    "Review dynamic workflow before running",
    "Run a dynamic workflow?",
    "View workflow summary",
    "View raw script",
    "Dynamic workflows can use a lot of tokens quickly",
    "subagents in parallel",
    "Save dynamic workflow",
    "Workflow launched in background",
    "x stop workflow",
    "to view dynamic workflow runs",
    'action:"close"',
    "Workflow file conflict",
    "Creating workflow file",
  ]) {
    assert.equal(patched.includes(residue), false, `raw residue remained: ${residue}\n${patched}`);
  }

  assert.match(patched, /思考强度/);
  assert.match(patched, /更快/);
  assert.match(patched, /更强/);
  assert.match(patched, /\$\{R2H\(\[jp\("left"\),jp\("right"\)\]\)\} 调整 · \$\{R2H\(\[jp\("enter"\)\]\)\} 确认 · \$\{R2H\(\[jp\("escape"\)\]\)\} 取消/);
  assert.match(patched, /←\/→ 调整 · Enter 确认 · Esc 取消/);
  assert.match(patched, /xhigh \+ 工作流/);
  assert.match(patched, /low\|medium\|high\|xhigh\|max\$\{extra\}\|auto/);
  assert.match(patched, /- ultracode：xhigh \+ 动态工作流编排（仅本次会话）/);
  assert.match(patched, /快速、直接的实现，额外开销最小/);
  assert.match(patched, /快速、直接的实现/);
  assert.match(patched, /均衡处理，包含标准实现和测试/);
  assert.match(patched, /更完整的实现，包含充分测试和文档/);
  assert.match(patched, /思考强度：/);
  assert.match(patched, /均衡处理，包含常规测试/);
  assert.match(patched, /扩展推理，做更彻底的分析/);
  assert.match(patched, /比 high 更深入的推理，仅次于 max（\$\{note\}）/);
  assert.match(patched, /最大能力，进行最深度推理。\$\{note\}/);
  assert.match(patched, /动态工作流/);
  assert.match(patched, /正在加载动态工作流历史…/);
  assert.match(patched, /运行前查看动态工作流/);
  assert.match(patched, /工作流已在后台启动。任务 ID：\$\{taskId\}/);
  assert.match(patched, /用 \/workflows 查看实时进度。/);
  assert.match(patched, /Esc 关闭/);
  assert.doesNotMatch(patched, /\."Esc 关闭"/);
  assert.match(patched, /动态工作流已被托管设置/);
  assert.match(patched, /工作流文件冲突/);
});

test("shared visible footer residues are localized without changing unrelated action values", () => {
  const patched = patchFixture([
    'const trustFooter=QE.default.createElement(G6,null,QE.default.createElement(K_,{chord:"enter",action:"confirm"}),QE.default.createElement(K_,{chord:"escape",action:"cancel"}));',
    'const confirmationFooter=lj.default.createElement(G6,null,lj.default.createElement(K_,{chord:"enter",action:"confirm"}),lj.default.createElement(w8,{action:"confirm:no",context:"Confirmation",fallback:"Esc",description:"cancel"}));',
    'const agentsFooter=D8.createElement(V,{dimColor:!0},Ll," ",z?"again ":"","for agents");',
    'const bgAgentsFooter=D8.createElement(V,{dimColor:!0,key:"bg-detach"},Ll," for agents");',
    'const cancelled="Cancelled";',
    'const internalAction={action:"cancel"};',
    "",
  ]);

  for (const residue of [
    "to confirm",
    "to cancel",
    '"for agents"',
    '" for agents"',
    '"again "',
    '"Cancelled"',
  ]) {
    assert.equal(patched.includes(residue), false, `raw residue remained: ${residue}\n${patched}`);
  }

  assert.match(patched, /Enter 确认/);
  assert.match(patched, /Esc 取消/);
  assert.match(patched, /"再次 "/);
  assert.match(patched, /"查看 Agent"/);
  assert.match(patched, /" 查看 Agent"/);
  assert.match(patched, /"已取消"/);
  assert.match(patched, /action:"cancel"/);
});

test("dynamic workflow lifecycle and progress residues are translated safely", () => {
  const patched = patchFixture([
    'const workflowDefault="Dynamic workflow";',
    'const syntaxError=`Workflow script has a syntax error and was not launched:\n${error}`;',
    'const remoteLaunch=`Workflow launched in a remote CCR session. Task ID: ${taskId}\nSession: ${sessionUrl}\n`;',
    'const remoteNote=`\nThe workflow runs against a fresh clone of the pushed branch; phase progress is visible at the session URL, not in /workflows. You will be notified when it completes.`;',
    'const remoteSummary=`Summary: ${summary}\n`;',
    'const remoteWarning=`Warning: ${warning}\n`;',
    'const launchSummary=`\nSummary: ${summary}`;',
    'const transcriptDir=`\nTranscript dir: ${transcriptDir}`;',
    'const scriptFile=`\nScript file: ${scriptPath}\n(Edit this file with Write/Edit and re-invoke Workflow with {scriptPath: "${scriptPath}"} to iterate without resending the script.)`;',
    'const runId=`\nRun ID: ${runId}\nTo resume after editing the script: Workflow({scriptPath: "${scriptPath}", resumeFromRunId: "${runId}"}) \\u2014 completed agents return cached results.`;',
    'const completed=`Dynamic workflow "${name}" completed`;',
    'const failed=`Dynamic workflow "${name}" failed: ${error||"Unknown error"}`;',
    'const stopped=`Dynamic workflow "${name}" was stopped`;',
    "const resume=`To resume after editing the script, call: Workflow({scriptPath: '${scriptPath}', resumeFromRunId: '${runId}'${args}})`;",
    "const paused=`Resume the paused workflow by calling: Workflow({scriptPath: '${scriptPath}', resumeFromRunId: '${runId}'${args}}) \\u2014 completed agents return cached results.`;",
    'const transcripts=`Agent transcripts: ${transcriptDir}`;',
    'const saved=`Dynamic workflow saved to ${path}. Invoke as /${name} or Workflow({name: "${name}"}) in future sessions.`;',
    'const exists=`Dynamic workflow "${name}" already exists at ${path}. Use a different name or overwrite.`;',
    'const inProgress=`${running} in progress`;',
    'const pending=`${pending} pending`;',
    'const completedCount=`${done} completed`;',
    'const taskText=" tasks ("+done+" done, "+running+" in progress, "+open+" open)";',
    'const active=`Dynamic workflow requested for this turn${HO?` \\xB7 ${HO} to ignore`:""}`;',
    'const ignored=`Ultracode keyword ignored for this prompt${HO?` \\xB7 ${HO} to undo`:""}`;',
    "",
  ]);

  for (const residue of [
    '"Dynamic workflow"',
    "Workflow script has a syntax error",
    "remote CCR session",
    "phase progress is visible",
    "Summary:",
    "Warning:",
    "Transcript dir:",
    "Script file:",
    "Edit this file with Write/Edit",
    "Run ID:",
    "To resume after editing the script",
    "Resume the paused workflow",
    "completed agents return cached results",
    "Agent transcripts:",
    "Dynamic workflow saved",
    "Use a different name or overwrite",
    "` in progress`",
    "` pending`",
    "` completed`",
    " done, ",
    " open)",
    "to ignore",
    "to undo",
  ]) {
    assert.equal(patched.includes(residue), false, `raw residue remained: ${residue}\n${patched}`);
  }

  assert.match(patched, /动态工作流/);
  assert.match(patched, /工作流脚本存在语法错误，未启动/);
  assert.match(patched, /远程 CCR 会话中的工作流已启动。任务 ID：\$\{taskId\}/);
  assert.match(patched, /阶段进度可在会话 URL 查看，不在 \/workflows 中显示/);
  assert.match(patched, /摘要：\$\{summary\}/);
  assert.match(patched, /警告：\$\{warning\}/);
  assert.match(patched, /transcript 目录：\$\{transcriptDir\}/);
  assert.match(patched, /脚本文件：\$\{scriptPath\}/);
  assert.match(patched, /Workflow\(\{scriptPath: "\$\{scriptPath\}"\}\)/);
  assert.match(patched, /运行 ID：\$\{runId\}/);
  assert.match(patched, /resumeFromRunId: "\$\{runId\}"/);
  assert.match(patched, /动态工作流 "\$\{name\}" 已完成/);
  assert.match(patched, /动态工作流 "\$\{name\}" 失败：\$\{error\|\|"Unknown error"\}/);
  assert.match(patched, /动态工作流 "\$\{name\}" 已停止/);
  assert.match(patched, /Workflow\(\{scriptPath: '\$\{scriptPath\}', resumeFromRunId: '\$\{runId\}'\$\{args\}\}\)/);
  assert.match(patched, /Agent 记录：\$\{transcriptDir\}/);
  assert.match(patched, /动态工作流已保存到 \$\{path\}/);
  assert.match(patched, /请使用其他名称或覆盖/);
  assert.match(patched, /\$\{running\} 进行中/);
  assert.match(patched, /\$\{pending\} 待处理/);
  assert.match(patched, /\$\{done\} 已完成/);
  assert.match(patched, / 个任务（/);
  assert.match(patched, / 未完成）/);
  assert.match(patched, /本轮已请求动态工作流\$\{HO\?` · \$\{HO\} 忽略`:""\}/);
  assert.match(patched, /已忽略本条提示词中的 Ultracode 关键词\$\{HO\?` · \$\{HO\} 撤销`:""\}/);
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

test("Claude Code 2.1.226 reviewed display literals patch without changing protected tokens", () => {
  const expected = [
    ["requested thread not in this result", "请求的评论线程不在此结果中"],
    ["no comment threads yet", "暂无评论线程"],
    ["read 1 comment thread (filtered)", "已读取 1 个评论线程（已筛选）"],
    ["replied to comment thread", "已回复评论线程"],
    ["reply not posted (summon already answered)", "未发布回复（召唤已得到回应）"],
    ["reply needs thread activation by the user", "需要用户先激活该评论线程才能回复"],
    ["no such document", "文档不存在"],
    ["database write committed", "数据库写入已提交"],
    ["database write not committed", "数据库写入未提交"],
    ["- Remote workspace:", "- 远程工作区："],
    ["git metadata is not collected from this machine", "未从此计算机收集 Git 元数据"],
    ["connected \\xB7 session token rejected", "已连接 · 会话令牌被拒绝"],
    ["claude.ai rejected the session token. Run /login, then reconnect.", "claude.ai 拒绝了会话令牌。请运行 /login，然后重新连接。"],
    ["Activating plugin\\u2026", "正在激活插件…"],
    ["\\u2014 Self-hosted environments \\u2014", "— 自托管环境 —"],
    ["\\xB7 ask your administrator to trust the configured sandbox CA \\u2014 see https://code.claude.com/docs/en/sandboxing", "· 请联系管理员信任已配置的沙箱 CA — 参见 https://code.claude.com/docs/en/sandboxing"],
    ["Message body (this is what will be delivered):", "消息正文（将投递以下内容）："],
    ["Held message from another session", "来自另一会话的待审消息"],
    ["Couldn't share the transcript.", "无法分享对话记录。"],
    ["You can share details with /feedback instead.", "你可以改用 /feedback 分享详细信息。"],
    ["Thanks \\u2014 noted as a bad memory.", "谢谢 — 已标记为不良记忆。"],
    ["Write the self-contained HTML report (scores, prompts, grader verdicts) to <path> instead of the results dir", "将自包含 HTML 报告（评分、提示词和评分器结论）写入 <path>，而不是结果目录"],
    ["Also require publishing the report to claude.ai (already the default when your account supports it); explains why if unavailable", "同时要求将报告发布到 claude.ai（账号支持时已为默认行为）；若不可用则说明原因"],
    ["Keep the HTML report local only; skip publishing it to claude.ai", "仅在本地保留 HTML 报告；跳过发布到 claude.ai"],
    ["Run the authoring interview (already the default in a terminal); requires an interactive terminal", "运行创作访谈（终端中已为默认行为）；需要交互式终端"],
    ["Skip the interactive picker. On headless surfaces, pass --yes=<digest> from the `/import` preview.", "跳过交互式选择器。在无界面环境中，传入 `/import` 预览给出的 --yes=<digest>。"],
  ];
  const patched = patchFixture([
    ...expected.map(([en], index) => `const display_${index}="${en}";`),
    "",
  ]);

  for (const [en, zh] of expected) {
    assert.equal(patched.includes(en), false, `raw display literal remained: ${en}\n${patched}`);
    assert.equal(patched.includes(zh), true, `missing localized display literal: ${zh}\n${patched}`);
  }
  for (const token of [
    "/login",
    "/feedback",
    "https://code.claude.com/docs/en/sandboxing",
    "<path>",
    "--yes=<digest>",
    "`/import`",
    "claude.ai",
  ]) {
    assert.equal(patched.includes(token), true, `protected token changed: ${token}\n${patched}`);
  }
});

test("mark-bad chord hint is localized without broad raw-action replacement", () => {
  const source = [
    'const chord={chord:"b",action:"mark bad"};',
    'const rawAction={action:"mark bad"};',
    'const otherChord={chord:"x",action:"mark bad"};',
    'const nearMiss={chord:"b",action:"mark bad",format:"compact"};',
    "",
  ];
  const patched = patchFixture(source);

  assert.match(patched, /\{chord:"b",action:"标记为不良"\}/);
  assert.match(patched, /const rawAction=\{action:"mark bad"\}/);
  assert.match(patched, /\{chord:"x",action:"mark bad"\}/);
  assert.match(patched, /\{chord:"b",action:"mark bad",format:"compact"\}/);
  assert.equal(patchFixtureRepeated(source, 1), patchFixtureRepeated(source, 2));
});

test("Claude Code 2.1.226 q9v unknown-model warning keeps branches and dynamic values", () => {
  const q9v = 'function q9v(e,t,r){let{source:n,window:o}=Nq(e,t,r);if(n!=="unknown-model")return null;let i=Jmf(e),s=te.CLAUDE_CODE_MAX_CONTEXT_TOKENS;if(i&&s!==void 0&&s>0)return null;let a=[];if(!Jne())a.push("append [1m] to the model name for 1M");if(i)a.push("set CLAUDE_CODE_MAX_CONTEXT_TOKENS to its real window");let l=a.length>0?`If the model accepts more, ${a.join(", or ")}; to make it recognized, `:"To make it recognized, ";return`"${e}" is not a model this version of Claude Code recognizes, so auto-compact will keep this session within ${Ua(o)} tokens (the context window it assumes). ${l}map it in the modelOverrides setting or update Claude Code; CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1 restores the previous wait-for-the-API behavior.`}';
  const { patched, output } = runPatchedFixture([
    'let noticeSource="unknown-model",noticeWindow=200000,modelMapped=false,oneMillionRecognized=false;',
    'function Nq(){return{source:noticeSource,window:noticeWindow}}',
    'function Jmf(){return modelMapped}',
    'const te={CLAUDE_CODE_MAX_CONTEXT_TOKENS:void 0};',
    'function Jne(){return oneMillionRecognized}',
    'function Ua(value){return `${value/1000}k`}',
    q9v,
    'const notices=[];',
    'notices.push(q9v("glm-5.2"));',
    'oneMillionRecognized=true;notices.push(q9v("custom-sonnet"));',
    'modelMapped=true;notices.push(q9v("mapped-model-env-only"));',
    'oneMillionRecognized=false;modelMapped=true;noticeWindow=1000000;notices.push(q9v("mapped-model"));',
    'te.CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000;notices.push(q9v("mapped-model"));',
    'noticeSource="auto";te.CLAUDE_CODE_MAX_CONTEXT_TOKENS=void 0;notices.push(q9v("known-model"));',
    'console.log(JSON.stringify(notices));',
    "",
  ]);
  const notices = JSON.parse(output);

  assert.equal(notices.length, 6);
  assert.match(notices[0], /^"glm-5\.2" 不是此版本 Claude Code 可识别的模型/);
  assert.match(notices[0], /200k 个 token/);
  assert.match(notices[0], /附加 \[1m\] 以启用 1M/);
  assert.doesNotMatch(notices[0], /CLAUDE_CODE_MAX_CONTEXT_TOKENS/);
  assert.match(notices[1], /如需让 Claude Code 识别该模型，请在 modelOverrides 设置中映射/);
  assert.doesNotMatch(notices[1], /\[1m\]|CLAUDE_CODE_MAX_CONTEXT_TOKENS/);
  assert.match(notices[2], /将 CLAUDE_CODE_MAX_CONTEXT_TOKENS 设为该模型的真实窗口/);
  assert.doesNotMatch(notices[2], /\[1m\]/);
  assert.match(notices[3], /启用 1M，或将 CLAUDE_CODE_MAX_CONTEXT_TOKENS 设为该模型的真实窗口/);
  assert.match(notices[3], /1000k 个 token/);
  assert.equal(notices[4], null);
  assert.equal(notices[5], null);
  assert.equal(patched.includes("append [1m] to the model name for 1M"), false);
  assert.equal(patched.includes("If the model accepts more"), false);
  assert.equal(patched.includes("is not a model this version"), false);
  for (const protectedToken of [
    'n!=="unknown-model"',
    "Jmf(e)",
    "Jne()",
    "Ua(o)",
    "modelOverrides",
    "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
    "CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1",
  ]) {
    assert.equal(patched.includes(protectedToken), true, `protected q9v token changed: ${protectedToken}`);
  }
});

test("q9v warning localization is exact-anchor fail-safe and idempotent", () => {
  const exact = 'function q9v(e,t,r){let{source:n,window:o}=Nq(e,t,r);if(n!=="unknown-model")return null;let i=Jmf(e),s=te.CLAUDE_CODE_MAX_CONTEXT_TOKENS;if(i&&s!==void 0&&s>0)return null;let a=[];if(!Jne())a.push("append [1m] to the model name for 1M");if(i)a.push("set CLAUDE_CODE_MAX_CONTEXT_TOKENS to its real window");let l=a.length>0?`If the model accepts more, ${a.join(", or ")}; to make it recognized, `:"To make it recognized, ";return`"${e}" is not a model this version of Claude Code recognizes, so auto-compact will keep this session within ${Ua(o)} tokens (the context window it assumes). ${l}map it in the modelOverrides setting or update Claude Code; CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1 restores the previous wait-for-the-API behavior.`}';
  const nearMiss = exact.replace("function q9v", "function q9w");
  const nearMissPatched = patchFixture([nearMiss, ""]);

  assert.equal(nearMissPatched.includes("If the model accepts more"), true, nearMissPatched);
  assert.equal(nearMissPatched.includes("不是此版本 Claude Code 可识别的模型"), false, nearMissPatched);
  assert.equal(
    patchFixtureRepeated([exact, ""], 1),
    patchFixtureRepeated([exact, ""], 2),
    "q9v localization should be idempotent"
  );

  const duplicatePatched = patchFixture([exact, exact, ""]);
  assert.equal(duplicatePatched.match(/If the model accepts more/g)?.length, 2, duplicatePatched);
  assert.equal(duplicatePatched.includes("不是此版本 Claude Code 可识别的模型"), false, duplicatePatched);
});

test("builtin /config command descriptions are localized", () => {
  const patched = patchFixture([
    'const c1={type:"local",name:"config",description:"Set a setting by key"};',
    'const c2={type:"local",name:"cd",description:"Move this session to a new working directory"};',
    "const c3={type:\"local\",name:\"usage\",description:\"Show session cost, plan usage, and what's contributing to your limits\"};",
    'const c4={type:"local",name:"session",description:"Show cloud session URL and QR code"};',
    'const c5={type:"local",name:"feedback",description:"Send feedback to Anthropic or report a bug"};',
    'const c6={type:"local",name:"fork",description:"Copy this conversation into a new background session and keep working here"};',
    'const c7={type:"local",name:"subtask",description:"Send a subagent off with your full context; its result comes back here"};',
    'const c8={type:"local",name:"chrome",description:"Open Claude in Chrome settings"};',
    'const c9={type:"local",name:"usage-credits",description:"Configure usage credits or request them from your admin when you hit a limit"};',
    'const c10={type:"local",name:"review",description:"Review a GitHub pull request; for your working diff use /code-review"};',
    'const c11={type:"local",name:"artifacts",description:"Browse your published and shared artifacts"};',
    'const c12={type:"local",name:"pause-memory",description:"Pause automemory for this session"};',
    'const c13={type:"local",name:"import",description:"Import config from another AI coding agent into Claude Code"};',
    'const c14={type:"local",name:"skill-doctor",description:"Show which loaded skills are unused and costing context"};',
    'const c15={type:"local",name:"bug",description:"Report a bug or share your conversation"};',
    "",
  ]);

  for (const residue of [
    "Set a setting by key",
    "Move this session to a new working directory",
    "Show session cost, plan usage",
    "Show cloud session URL and QR code",
    "Send feedback to Anthropic or report a bug",
    "Copy this conversation into a new background session",
    "Send a subagent off with your full context",
    "Open Claude in Chrome settings",
    "Configure usage credits",
    "Review a GitHub pull request",
    "Browse your published and shared artifacts",
    "Pause automemory for this session",
    "Import config from another AI coding agent",
    "Show which loaded skills are unused",
    "Report a bug or share your conversation",
  ]) {
    assert.equal(patched.includes(residue), false, `raw residue remained: ${residue}\n${patched}`);
  }

  assert.match(patched, /按键设置配置项/);
  assert.match(patched, /将会话切换到新的工作目录/);
  assert.match(patched, /显示会话费用、套餐用量/);
  assert.match(patched, /显示云端会话链接和二维码/);
  assert.match(patched, /向 Anthropic 发送反馈或报告问题/);
  assert.match(patched, /将当前对话复制到新的后台会话/);
  assert.match(patched, /携带完整上下文派发子代理/);
  assert.match(patched, /打开 Claude 的 Chrome 设置/);
  assert.match(patched, /配置用量积分/);
  assert.match(patched, /审查 GitHub 拉取请求/);
  assert.match(patched, /浏览你已发布和共享的 artifacts/);
  assert.match(patched, /暂停本次会话的自动记忆/);
  assert.match(patched, /从其他 AI 编程代理导入配置到 Claude Code/);
  assert.match(patched, /显示哪些已加载的 skill/);
  assert.match(patched, /报告问题或分享你的对话/);
});

test("Path contains null bytes error stays distinct from the makeErrorWithCode API", () => {
  const patched = patchFixture([
    'if(e.includes("\\x00")||r.includes("\\x00"))throw Error("Path contains null bytes");',
    'const x=KZ(121,"path","string without null bytes",filename);',
    "",
  ]);

  assert.equal(patched.includes("Path contains null bytes"), false, patched);
  assert.match(patched, /throw Error\("路径包含空字节"\)/);
  assert.equal(patched.includes("string without null bytes"), true, patched);
  assert.equal(patched.includes('"\\x00"'), true, patched);
});

test("interrupted turn keeps localized prefix and translates the question suffix", () => {
  const patched = patchFixture([
    'Q4e.jsx(_,{dimColor:!0,children:"已中断 "}),Q4e.jsx(_,{dimColor:!0,children:"\\xB7 What should Claude do instead?"})',
    "",
  ]);

  assert.equal(patched.includes("What should Claude do instead?"), false, patched);
  assert.equal(patched.includes('children:"已中断 "'), true, patched);
  assert.equal(patched.includes('children:"\\xB7 Claude 应该怎么做？"'), true, patched);
});

test("model picker fallback string is localized while preserving --model option", () => {
  const patched = patchFixture([
    'const BXm=l3P??"Switch between Claude models. Your pick becomes the default for new sessions. For other/previous model names, specify with --model.";',
    "",
  ]);

  assert.equal(patched.includes("Switch between Claude models."), false, patched);
  assert.equal(patched.includes("For other/previous model names"), false, patched);
  assert.match(patched, /切换 Claude 模型。/);
  assert.match(patched, /--model/);
});

test("stop hook block cap warning is localized while keeping API identifiers", () => {
  const patched = patchFixture([
    'yield Cl(`A hook blocked the turn from ending ${oa} consecutive times \\u2014 overriding and ending turn. `+"For Stop/SubagentStop hooks, check stop_hook_active in the input and return success while it\'s true. Set CLAUDE_CODE_STOP_HOOK_BLOCK_CAP to raise this limit.","warning")',
    "",
  ]);

  for (const residue of [
    "A hook blocked the turn from ending",
    "consecutive times",
    "overriding and ending turn",
    "For Stop/SubagentStop hooks",
    "check stop_hook_active in the input",
    "Set CLAUDE_CODE_STOP_HOOK_BLOCK_CAP to raise this limit",
  ]) {
    assert.equal(patched.includes(residue), false, `raw residue remained: ${residue}\n${patched}`);
  }
  assert.match(patched, /一个 Hook 已连续 \$\{oa\} 次阻止回合结束 \\u2014 正在覆盖并结束回合。 /);
  assert.match(patched, /stop_hook_active/);
  assert.match(patched, /CLAUDE_CODE_STOP_HOOK_BLOCK_CAP/);
});

test("context bar states are localized while preserving dynamic percentages", () => {
  const patched = patchFixture([
    'let NCw=LCw?`${100-wzh}% context used`:`${wzh}% until auto-compact`;',
    'if(jMM){const X_t=psc?`${NCw} \\xB7 ${psc}`:NCw;}',
    'let zMM=F5e!==void 0||q.DISABLE_COMPACT;',
    'const X_t=psc?`Context low (${dsc}% remaining) \\xB7 ${psc}`:zMM?`Context low (${dsc}% remaining)`:`Context low (${dsc}% remaining) \\xB7 Run /compact to compact & continue`;',
    "",
  ]);

  for (const residue of [
    "% context used",
    "% until auto-compact",
    "Context low",
    "Run /compact to compact & continue",
  ]) {
    assert.equal(patched.includes(residue), false, `raw residue remained: ${residue}\n${patched}`);
  }
  assert.match(patched, /\$\{100-wzh\}% 上下文已使用/);
  assert.match(patched, /\$\{wzh\}% 后自动压缩/);
  assert.match(patched, /上下文不足（剩余 \$\{dsc\}%）/);
  assert.match(patched, /\\xB7 运行 \/compact 压缩并继续/);
  assert.match(patched, /\\xB7 \$\{psc\}/);
  for (const token of ["\\xB7 ${psc}", "${dsc}", "/compact"]) {
    assert.equal(patched.includes(token), true, `protected token changed: ${token}\n${patched}`);
  }
});

test("thinking status verb function is localized while preserving thresholds", () => {
  const patched = patchFixture([
    'function BYS(e){if(e>=FYS)return"almost done thinking";if(e>=$YS)return"thinking some more";if(e>=NYS)return"thinking more";if(e>=LYS)return"still thinking";return"thinking"}',
    "",
  ]);

  for (const residue of [
    "almost done thinking",
    "thinking some more",
    "thinking more",
    "still thinking",
    'return"thinking"',
  ]) {
    assert.equal(patched.includes(residue), false, `raw residue remained: ${residue}\n${patched}`);
  }
  assert.match(patched, /"即将完成思考"/);
  assert.match(patched, /"继续思考中"/);
  assert.match(patched, /仍在思考/);
  assert.match(patched, /"思考中"/);
  assert.match(patched, /function BYS/);
});

test("thinking status verb function is localized when upstream renames the function (2.1.237 I8w + new threshold names)", () => {
  // CC 2.1.237 把 BYS 重命名为 I8w，阈值常量 FYS/$YS/NYS/LYS 改为 R8w/C8w/x8w/k8w；
  // 函数体结构与旧版完全一致，仅标识符漂移。补丁必须按结构而非具体名匹配。
  const patched = patchFixture([
    'function I8w(e){if(e>=R8w)return"almost done thinking";if(e>=C8w)return"thinking some more";if(e>=x8w)return"thinking more";if(e>=k8w)return"still thinking";return"thinking"}',
    "",
  ]);

  for (const residue of [
    "almost done thinking",
    "thinking some more",
    "thinking more",
    "still thinking",
    'return"thinking"',
  ]) {
    assert.equal(patched.includes(residue), false, `raw residue remained: ${residue}\n${patched}`);
  }
  assert.match(patched, /"即将完成思考"/);
  assert.match(patched, /"继续思考中"/);
  assert.match(patched, /仍在思考/);
  assert.match(patched, /"思考中"/);
  // 函数名与阈值常量必须原样保留（不改变内部逻辑判断）
  assert.match(patched, /function I8w\(e\)/);
  assert.match(patched, /if\(e>=R8w\)return/);
  assert.match(patched, /if\(e>=C8w\)return/);
  assert.match(patched, /if\(e>=x8w\)return/);
  assert.match(patched, /if\(e>=k8w\)return/);
});

test("effort suffix template localizes around the raw effort level value", () => {
  const patched = patchFixture([
    'function VTt(e,t){if(t===void 0)return"";let r=Jne(e,t);if(r===void 0)return"";return` with ${gge(D2e(r))} effort`}',
    "",
  ]);

  assert.equal(patched.includes("with ${gge(D2e(r))} effort"), false, patched);
  assert.match(patched, /`（思考强度 \$\{gge\(D2e\(r\)\)\}）`/);
  assert.equal(patched.includes("gge(D2e(r))"), true, patched);
});

test("tool-running activity templates localize durations and suffixes", () => {
  const patched = patchFixture([
    'switch(M.kind){case"tool-running":Ie=`running tool for ${la(M.toolMs)}`;break;case"tool-done":Ie=`ran tool for ${la(M.toolMs)}`;break;case"thinking":Ie=`${Ae}${h}`;break;case"thought-for":Ie=`thought for ${Math.max(1,Math.round(M.thoughtMs/1000))}s`;break;case"none":Ie=null;break}',
    "",
  ]);

  for (const residue of [
    "running tool for",
    "ran tool for",
    "thought for",
  ]) {
    assert.equal(patched.includes(residue), false, `raw residue remained: ${residue}\n${patched}`);
  }
  assert.match(patched, /case"tool-running":Ie=`正在运行工具，已用 \$\{la\(M\.toolMs\)\}`/);
  assert.match(patched, /case"tool-done":Ie=`已完成工具，用时 \$\{la\(M\.toolMs\)\}`/);
  assert.match(patched, /case"thought-for":Ie=`已思考 \$\{Math\.max\(1,Math\.round\(M\.thoughtMs\/1000\)\)\} 秒`/);
  assert.equal(patched.includes('case"thinking":Ie=`${Ae}${h}`;'), true, patched);
  assert.equal(patched.includes('case"none":Ie=null;'), true, patched);
});

test("remoting banner connecting/reconnecting copy is localized", () => {
  const patched = patchFixture([
    'if(a)z+=Xt.dim(" \\xB7 ")+Xt.dim(a);if(l)z+=Xt.dim(" \\xB7 ")+Xt.dim(l);I(`${Xt.yellow(Y)} ${Xt.yellow("Connecting")}${z}',
    'function K(Y,z){if(m)for(let X of f)I(`${Xt.dim(X)}',
    'let W=Mhn[C%Mhn.length];C++,I(`${Xt.yellow(W)} ${Xt.yellow("Reconnecting")} ${Xt.dim("\\xB7")} ${Xt.dim(`retrying in ${Y}`)} ${Xt.dim("\\xB7")} ${Xt.dim(`disconnected ${z}`)}',
    "",
  ]);

  for (const residue of ['"Connecting"', '"Reconnecting"', "retrying in ${Y}", "disconnected ${z}"]) {
    assert.equal(patched.includes(residue), false, `raw residue remained: ${residue}\n${patched}`);
  }
  assert.match(patched, /Xt\.yellow\("连接中"\)/);
  assert.match(patched, /Xt\.yellow\("重新连接"\)/);
  assert.match(patched, /`\$\{Y\} 后重试`/);
  assert.match(patched, /`已断开 \$\{z\}`/);
});

test("remoting ready/connected status values are localized inside their assignments only", () => {
  const patched = patchFixture([
    'updateIdleStatus(){V(),o="idle",i="Ready",g=null,y=0,p=null,M(u),Q()}',
    'setAttached(Y){if(V(),o="attached",i="Connected",g=null,y=0,S<=1)p=oS(Y,d),M(p);Q()}',
    "",
  ]);

  assert.equal(patched.includes('i="Ready"'), false, patched);
  assert.equal(patched.includes('i="Connected"'), false, patched);
  assert.match(patched, /i="就绪"/);
  assert.match(patched, /i="已连接"/);
  assert.match(patched, /o="idle"/);
  assert.match(patched, /o="attached"/);
});

test("agent task status display map is localized while keeping the status keys", () => {
  const patched = patchFixture([
    'LQi=["review","blocked","working","done"],E4t={review:"Ready for review",blocked:"Needs input",working:"Working",done:"Completed"},',
    ',mKw={review:"",blocked:"Sessions that have a question or need your decision land here",working:"Sessions Claude is actively working on \\u2014 they keep running even if you close the terminal",done:"Finished sessions wait here for you to review"}',
    "",
  ]);

  assert.equal(patched.includes('working:"Working"'), false, patched);
  assert.equal(patched.includes('blocked:"Needs input"'), false, patched);
  assert.equal(patched.includes('done:"Completed"'), false, patched);
  assert.equal(patched.includes("Sessions that have a question or need your decision"), false, patched);
  assert.equal(patched.includes("Sessions Claude is actively working on"), false, patched);
  assert.equal(patched.includes("Finished sessions wait here"), false, patched);
  assert.match(patched, /review:"待审核"/);
  assert.match(patched, /blocked:"需要输入"/);
  assert.match(patched, /working:"进行中"/);
  assert.match(patched, /done:"已完成"/);
  assert.match(patched, /blocked:"需要你决策的会话会出现在这里"/);
  assert.match(patched, /working:"Claude 正在积极处理的会话 \\u2014 关闭终端后仍在运行"/);
  assert.match(patched, /done:"已完成的会话留在这里等待你查看"/);
  assert.equal(patched.includes('LQi=["review","blocked","working","done"]'), true, patched);
  assert.equal(patched.includes('review:""'), true, patched);
});

// translations-quality.test.js 只校验这些条目在 cli-translations.json 里带了
// skipPatch:"model-prompt-contract" 标记，管不住 patch-cli.js 里的结构化 patch。
// 硬编码的 tryReplace 会绕过标记直接改写契约文案，让 upstream-compat 的
// preserve 规则失败。这里端到端校验：每条契约文案在 patch 后必须原样保留。
test("model-facing prompt contract fragments survive patching verbatim", () => {
  const contractFragments = JSON.parse(fs.readFileSync(translations, "utf8"))
    .filter((entry) => entry.skipPatch === "model-prompt-contract")
    .map((entry) => entry.en);

  assert.ok(contractFragments.length > 0, "no model-prompt-contract entries found");

  for (const fragment of contractFragments) {
    const patched = patchFixture([`let contract=${JSON.stringify(fragment)};`, ""]);
    assert.equal(
      patched.includes(JSON.stringify(fragment)),
      true,
      `prompt contract fragment was rewritten by patch-cli.js: ${JSON.stringify(fragment)}\n${patched}`
    );
  }
});

// exe 中所有省略号都是字面转义形态 …（真实字符形态不存在）。cli-translations.json
// 里的 en 用真实省略号字符（…），直接 includes 匹配不上，导致 70 条 spinner/状态短语漏译
// （含 /resume 时的 "Resuming conversation…"）。patch-cli.js 必须为含省略号的翻译规则
// 自动生成转义形态变体。fixture 取自 2.1.237 exe 原文（偏移 115758120 / 120742700）。
test("ellipsis translation rules match literal \\u2026 escape form in the binary", () => {
  const patched = patchFixture([
    'e(C,{display:"user"});return}c(!0),t(T,k,"slash_command_picker")}function S(){h.current=!0,e("Resume cancelled",{display:"system"})}if(bo("confirm:no",S,{context:"Confirmation",isActive:s&&!l}),s||l)return L7.jsxs(wp,{color:"suggestion",children:[L7.jsx(b,{bold:!0,color:"suggestion",children:"恢复会话"}),L7.jsx(R,{marginTop:1,children:L7.jsx(Uc,{message:l?"Resuming conversation\\u2026":"Loading conversations\\u2026"})})]});',
    'if(M&&(H.length===0||oe.length===0))return yv.jsx(lws,{children:yv.jsx(Uc,{message:"Loading conversations\\u2026"})});if(J)return yv.jsx(sly,{sessionId:J.sessionId});if(U)return yv.jsx(lws,{children:yv.jsx(Uc,{message:"Resuming conversation\\u2026"})});',
    'let spinner=rP.createElement(h6,{height:1},rP.createElement(V,{dimColor:!0},"Retrying\\u2026"));',
    "",
  ]);

  assert.equal(patched.includes("Resuming conversation\\u2026"), false, patched);
  assert.equal(patched.includes("Loading conversations\\u2026"), false, patched);
  assert.equal(patched.includes("Retrying\\u2026"), false, patched);
  assert.match(patched, /"恢复对话中…":"加载对话中…"/);
  assert.match(patched, /message:"恢复对话中…"/);
  assert.match(patched, /"重试中…"/);
});

test("goal command message templates are localized without touching goal condition text", () => {
  // fixture 取自 2.1.237 真实 exe 提取的 goal 命令处理函数原文（变量名保留原样）
  const patched = patchFixture([
    'function handleGoalQuery(r){if(r.length>vGr)return{type:"text",value:`Goal condition is limited to ${vGr} characters (got ${r.length})`};let n=checkGoal(r);if(n!==null)return{type:"text",value:n};return{type:"query",value:`Goal set: ${r}`,prompt:compose(r)}}',
    'function handleGoalNonInteractive(n){let o=getGoal(t);if(!hasGoal(o)){let i=getGoalText(a);return e(i===null?"No goal set":`Goal cleared: ${i}`,{display:"system"})}return e(`Goal set: ${n}`,{shouldQuery:!0,metaMessages:[compose(n)]}),null}',
    'function showGoalActive(o,i,s){return{type:"text",value:`Goal active: ${o.condition} (${i})${s}`}}',
    'function goalClearedErr(i){return`Goal cleared after an unrecoverable error (${i}): "${jl(e.condition,dcS,!0)}". Run /goal again to continue.`}',
    "",
  ]);

  for (const residue of ["Goal set: ", "Goal cleared: ", "No goal set", "Goal active: ", "Goal condition is limited", "Goal cleared after an unrecoverable error"]) {
    assert.equal(patched.includes(residue), false, `residue ${residue} in: ${patched}`);
  }
  assert.match(patched, /目标已设置：\$\{\w+\}/);
  assert.match(patched, /目标已清除：\$\{\w+\}/);
  assert.match(patched, /"尚未设置目标"/);
  assert.match(patched, /目标条件的字符数限制为 \$\{\w+\} 个字符（当前 \$\{\w+\.length\} 个）/);
  assert.match(patched, /目标执行中：\$\{\w+\.condition\}（\$\{\w+\}/);
  assert.match(patched, /请重新运行 \/goal 继续/);
});

test("background command notification templates are localized while keeping the task name", () => {
  const patched = patchFixture([
    'var jkt="Background command ";',
    'function notif(r,t,n,i){switch(r){case"completed":return`${jkt}"${t}" completed${n!==void 0?` (exit code ${n})`:""}`;case"failed":return`${jkt}"${t}" failed${n!==void 0?` with exit code ${n}`:""}`;case"killed":return`${jkt}"${t}" was stopped`}}',
    'function waitingHint(t){let p=`${jkt}"${t}" appears to be waiting for interactive input`;return p}',
    "",
  ]);

  for (const residue of ['" completed${', '" failed${', '" was stopped`', " waiting for interactive input"]) {
    assert.equal(patched.includes(residue), false, `residue ${residue} in: ${patched}`);
  }
  assert.match(patched, /" 已完成\$\{\w+!==/);
  assert.match(patched, /" 失败\$\{\w+!==/);
  assert.match(patched, /" 已停止\`/);
  assert.match(patched, /" 似乎在等待交互输入\`/);
  assert.match(patched, /\`（退出码 \$\{\w+\}）\`/);
  assert.match(patched, /jkt="后台命令 "/);
});

test("/context panel ordering labels, source labels and section titles are localized in sync", () => {
  const patched = patchFixture([
    'function G1o(e){switch(e){case"userSettings":return"User";case"projectSettings":return"Project";case"localSettings":return"Local";case"flagSettings":return"Flag";case"policySettings":return"Managed";case"plugin":return"Plugin";case"built-in":return"Built-in";case"mcp":return"MCP";case"memoryStore":return"Memory store";case"syncedSkills":return RPe}}',
    'var RPe="claude.ai sync";',
    'function Wr0(e){switch(e){case"flagged":return"Flagged";case"project":return"Project";case"local":return"Local";case"user":return"User";case"enterprise":return"Enterprise";case"managed":return"Managed";case"builtin":case"dynamic":return"Built-in";case"skills":return"Skills";default:return e}}',
    'var MLE=["Project","User",RPe,"Managed","Plugin","MCP","Built-in"];',
    'children:[Ti.jsx(b,{dimColor:!0,children:"Available"}),Ti.jsx(Z_,{variant:"tree",children:items})]',
    'children:[Ti.jsx(b,{dimColor:!0,children:"Loaded"}),Ti.jsx(Z_,{variant:"tree",children:items})]',
    "",
  ]);

  for (const residue of ['"User";case', '"Project";case', '"Local";case', '"Flag";case', '"Managed";case', '"Plugin";case', '"Built-in",', '"Memory store";case', '"Flagged";case', '"Enterprise";case', '"Skills";default', '"Available"', '"Loaded"', '"claude.ai sync"']) {
    assert.equal(patched.includes(residue), false, `residue ${residue} in: ${patched}`);
  }
  assert.match(patched, /case"userSettings":return"用户"/);
  assert.match(patched, /case"projectSettings":return"项目"/);
  assert.match(patched, /case"localSettings":return"本地"/);
  assert.match(patched, /case"flagSettings":return"标志"/);
  assert.match(patched, /case"policySettings":return"托管"/);
  assert.match(patched, /case"plugin":return"插件"/);
  assert.match(patched, /case"built-in":return"内置"/);
  assert.match(patched, /case"mcp":return"MCP"/);
  assert.match(patched, /case"memoryStore":return"记忆存储"/);
  assert.match(patched, /case"flagged":return"已标记"/);
  assert.match(patched, /case"enterprise":return"企业"/);
  assert.match(patched, /case"skills":return"技能"/);
  assert.match(patched, /var RPe="claude\.ai 同步"/);
  // 排序数组必须与 label 函数返回同步翻译，保证 indexOf 匹配仍成立
  assert.match(patched, /MLE=\["项目","用户",RPe,"托管","插件","MCP","内置"\]/);
  assert.match(patched, /children:"可用"/);
  assert.match(patched, /children:"已加载"/);
});

test("welcome and /context billing hints backfill the translation table", () => {
  const patched = patchFixture([
    'return{title:"Tips for getting started",lines:r}',
    'footer:t.length>0?"/release-notes for more":void 0',
    'i=o!=="firstParty"?Vie[o]:as()?p6o():"API Usage Billing"',
    'if(ue>0)se.push({name:"System tools",tokens:ue,color:"inactive"});if(D>0)se.push({name:"System tools (deferred)",tokens:D,color:"inactive",isDeferred:!0})',
    "",
  ]);

  for (const residue of ['"Tips for getting started"', '"/release-notes for more"', '"API Usage Billing"', 'name:"System tools"', 'name:"System tools (deferred)"']) {
    assert.equal(patched.includes(residue), false, `residue ${residue} in: ${patched}`);
  }
  assert.match(patched, /"新手入门提示"/);
  assert.match(patched, /"\/release-notes 了解更多"/);
  assert.match(patched, /"API 用量与计费"/);
  assert.match(patched, /name:"系统工具"/);
  assert.match(patched, /name:"系统工具（延迟）"/);
});

test("detected 2.1.237 UI residues are translated by the translation table", () => {
  const detected = [
    ["Scanning local sessions…", "正在扫描本地会话…"],
    ["Help improve our AI models", "帮助改进我们的 AI 模型"],
    ["Claude has context of ", "Claude 的上下文包含 "],
    ["Plan Approved by ", "计划已由 "],
    ["Plan Rejected by ", "计划已由 "],
    ["Stop hook feedback", "Stop hook 反馈"],
    ["Enabled plan mode", "已启用计划模式"],
    ["Already in plan mode.", "已处于计划模式。"],
    ["Exited plan mode", "已退出计划模式"],
    ["Allow the use of your chats and coding sessions to train and improve Anthropic AI models.", "允许使用你的聊天和编程会话，用于训练和改进 Anthropic AI 模型。"],
    ["Any key closes this panel.", "任意键关闭此面板。"],
  ];

  const sourceLines = detected.map(
    ([en], index) => `const d${index}=${JSON.stringify(en)};`
  );
  // 真实 bundle 中省略号是 … 转义形态，用该形态覆盖 d0 行
  sourceLines[0] = String.raw`const d0="Scanning local sessions\u2026";`;
  const patched = patchFixture([...sourceLines, ""]);

  for (const [en, zh] of detected) {
    assert.equal(patched.includes(en), false, `residue ${en} in: ${patched}`);
    assert.match(patched, new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Press Enter multi-part children are localized structurally while keeping the key", () => {
  // fixture 取自 2.1.237 exe 原文：children 数组把 "Press "、bold Enter、" to continue." 拆成三个字面量，
  // 翻译表子串匹配命中不了，必须按 children 结构做结构化 patch。Enter 键名与 bold/jsx 结构保留。
  const patched = patchFixture([
    'Hi.jsxs(R,{flexDirection:"column",gap:1,marginTop:1,children:[ng,Hi.jsxs(b,{dimColor:!0,children:["Press ",Hi.jsx(b,{bold:!0,children:"Enter"})," to continue."]})]}),uw[26]=OA;',
    'OA=Hi.jsxs(b,{dimColor:!0,children:["Press ",Hi.jsx(b,{bold:!0,children:"Enter"})," to continue."]}),uw[42]=OA;',
    'IAr==="error"?P5.jsxs(b,{color:"error",children:["Couldn\'t start your trial. Press ",P5.jsx(b,{bold:!0,children:"Enter"})," to continue."]}):P5.jsxs(b,{color:"permission",children:["Press ",P5.jsx(b,{bold:!0,children:"Enter"})," to continue."]})',
    'OA=AV.toRetry&&Hi.jsx(R,{marginTop:1,children:Hi.jsxs(b,{color:"permission",children:["Press ",Hi.jsx(b,{bold:!0,children:"Enter"})," to retry."]})}),uw[87]=AV.toRetry,uw[88]=OA;',
    'h.pending?ef.jsxs(b,{children:["Press ",h.keyName," again to exit"]}):v?ef.jsx(Wr,{children:m&&ef.jsx(b,{color:"permission",children:"dialog waiting"})})',
    "",
  ]);

  for (const residue of ['" to continue."]', '" to retry."]', '" again to exit"', '"Press "']) {
    assert.equal(patched.includes(residue), false, `residue ${residue} in: ${patched}`);
  }
  assert.match(patched, /"按 ",[A-Za-z0-9_$]+\.jsx\([A-Za-z0-9_$]+,\{bold:!0,children:"Enter"\}\)," 继续。"\]/);
  assert.match(patched, /"无法开始试用。按 ",/);
  assert.match(patched, /"按 ",[A-Za-z0-9_$]+\.jsx\([A-Za-z0-9_$]+,\{bold:!0,children:"Enter"\}\)," 重试。"\]/);
  assert.match(patched, /"再按 ",h\.keyName," 退出"\]/);
  // 内部结构保留
  assert.match(patched, /bold:!0,children:"Enter"/);
  assert.match(patched, /h\.keyName/);
});

test("newly discovered 2.1.237 UI residues are localized via the translation table", () => {
  // fixture 取自 2.1.237 exe 原文：switch toast 文案、通知提示、/plugin 标题、list 视图后缀、
  // permission 等待提示。只替换显示文案，case key / 状态值 / 三元分支判断保留。
  const patched = patchFixture([
    'function ZsE(e,t,r){if(r)return aso(e,[],{verbose:r});let n=null;switch(t){case"navigate":n="Navigation completed";break;case"tabs_create_mcp":n="Tab created";break;case"tabs_context_mcp":n="Tabs read";break;case"form_input":n="Input completed";break;case"compute":n="Output generated";break}return n}',
    't=pwe.jsx(b,{children:e.localSent?"Terminal and mobile notification sent.":"Mobile notification sent."})',
    'let a=["Configured marketplaces:",""];o.forEach((l)=>{a.push(`  ${et.pointer} ${l}`)});',
    'return Np.jsxs(b,{children:["list",l==="shared"?" (shared)":l==="all"?" (mine + shared)":""]})',
    'm&&ef.jsx(b,{color:"permission",children:"dialog waiting"})',
    "",
  ]);

  for (const residue of ['"Navigation completed"', '"Tabs read"', '"Input completed"', '"Terminal and mobile notification sent."', '"Mobile notification sent."', '"Configured marketplaces:"', '" (shared)"', '" (mine + shared)"', '"dialog waiting"']) {
    assert.equal(patched.includes(residue), false, `residue ${residue} in: ${patched}`);
  }
  for (const zh of ['"导航完成"', '"已读取标签页"', '"输入完成"', '"终端和移动通知已发送。"', '"移动通知已发送。"', '"已配置的插件市场："', '"（共享）"', '"（我的 + 共享）"', '"对话框等待中"']) {
    assert.match(patched, new RegExp(zh.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  // 逻辑判断保留
  for (const logic of ['case"navigate"', 'e.localSent?', 'l==="shared"', 'l==="all"', 'a.push(`  ${et.pointer} ${l}`)']) {
    assert.match(patched, new RegExp(logic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
