"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { rewriteMacDisplaySource, patchMacDisplayModules, MAC_DISPLAY_BUILDS } = require("../scripts/patch-bytecode.js");
const translations = require("../cli-translations.json");

test("native skill prompt keeps rule values, user names and directories while translating display", () => {
  const source = 'const name="user-skill",dir="/tmp/user data";const title=`Use skill "${name}"?`;const options=[{label:"Yes",value:"yes"},{label:"No",value:"no"}];const e=(n,p)=>p.children,n=0;const children=["Yes, and don\'t ask again for ",e(n,{bold:!0,children:name})," ","in ",e(n,{bold:!0,children:dir})];const body="Claude may use instructions, code, or files from this Skill.";const sentinel="Hook cancelled",context="Chat";JSON.stringify({title,options,children,body,sentinel,context});';
  const result = JSON.parse(vm.runInNewContext(rewriteMacDisplaySource(source, "permission", translations).source));
  assert.equal(result.title, "使用技能“user-skill”？");
  assert.deepEqual(result.options, [{ label: "是", value: "yes" }, { label: "否", value: "no" }]);
  assert.equal(result.children.join(""), "是，今后不再询问 user-skill，目录：/tmp/user data");
  assert.equal(result.body, "Claude 可使用此技能的指令、代码或文件。");
  assert.equal(result.sentinel, "Hook cancelled");
  assert.equal(result.context, "Chat");
});

test("key hints render translated actions without changing the caller or unknown custom text", () => {
  const source = 'function view(t){let{chord:o,action:s,format:n,parens:a,bold:i}=t;return a?["(",o," to ",s,")"]:[o," to ",s]}function format({chord:t,action:o,format:s,parens:n=!1}){let a=t;return n?`(${a} to ${o})`:`${a} to ${o}`}const input={chord:"Tab",action:"amend"};JSON.stringify({view:view(input).join(""),formatted:format({...input,parens:true}),input,unknown:format({chord:"Ctrl+K",action:"user command"})});';
  const result = JSON.parse(vm.runInNewContext(rewriteMacDisplaySource(source, "key-hint", []).source));
  assert.equal(result.view, "Tab 修改");
  assert.equal(result.formatted, "(Tab 修改)");
  assert.equal(result.input.action, "amend");
  assert.equal(result.unknown, "Ctrl+K user command");
});

test("new terse key hints and directory labels remain readable", () => {
  const source = 'function view(t){let{chord:o,action:s,format:n,parens:a,bold:l,terse:p}=t;let m=p?" ":" to ";return [o,m,s]}function format({chord:t,action:o,format:s,parens:n=!1,terse:a=!1}){let l=t;let p=`${l}${a?" ":" to "}${o}`;return n?`(${p})`:p}JSON.stringify({view:view({chord:"Esc",action:"cancel"}).join(""),formatted:format({chord:"Enter",action:"confirm",terse:true})});';
  const result = JSON.parse(vm.runInNewContext(rewriteMacDisplaySource(source, "key-hint", []).source));
  assert.deepEqual(result, { view: "Esc 取消", formatted: "Enter 确认" });
});

test("MCP help keeps all four executable examples and ASCII escapes localize correctly", () => {
  const { text, proposal, commandExamples } = require("../docs/localization-audit-2026-10-09/help-capacity-evidence.json");
  const source = `const help=\`${text}\`;const footer="monthly limit \\xB7 run /usage-credits to adjust";JSON.stringify({help,footer});`;
  const result = JSON.parse(vm.runInNewContext(rewriteMacDisplaySource(source, "mcp-help", translations).source));
  assert.equal(result.help, proposal);
  for (const example of commandExamples.split("\n")) assert.ok(result.help.includes(example));
  assert.equal(result.footer, "每月限额 · 用 /usage-credits 调整");
});

test("diff panel title is Chinese while its shared syntax name stays intact", () => {
  const source = 'var title="Diff";const syntax={name:"Diff",language:"diff"};JSON.stringify({title,syntax});';
  const result = JSON.parse(vm.runInNewContext(rewriteMacDisplaySource(source, "diff-panel", translations).source));
  assert.equal(result.title, "差异");
  assert.deepEqual(result.syntax, { name: "Diff", language: "diff" });
});

test("usage title changes only in the display node, preserving the model's same-named heading", () => {
  const heading = "What's contributing to your limits usage?";
  const source = `const modelHeading=${JSON.stringify(heading)};const view={children:${JSON.stringify(heading)}};JSON.stringify({modelHeading,view});`;
  const result = JSON.parse(vm.runInNewContext(rewriteMacDisplaySource(source, "usage-panel", [{ en: heading, zh: "不应全局替换" }]).source));
  assert.equal(result.view.children, "哪些操作消耗了你的额度？");
  assert.equal(result.modelHeading, heading);
});

test("chat and review labels localize their display fields without changing contexts or tool names", () => {
  const source = 'const context="Chat",toolName="Code review",help="Authorization: Bearer `token` for `url` sources",server="not found";const label={defaultMessage:"Chat",id:"WTrOy36sdu"},title={defaultMessage:"Allow Chat",id:"0Cc9oG2J04"},description={defaultMessage:"Enable Chat. Quick questions and drafting.",id:"z2x73mCBZ9"};const tool={name:toolName,userFacingName(){return"Code review"}};JSON.stringify({context,label,title,description,help,server,name:tool.name,display:tool.userFacingName()});';
  const chat = rewriteMacDisplaySource(source, "chat-settings", [{ en: "Chat", zh: "不应全局替换" }, { en: " for ", zh: "耗时" }, { en: "not found", zh: "未找到" }]);
  const result = JSON.parse(vm.runInNewContext(chat.source));
  assert.equal(result.context, "Chat");
  assert.deepEqual(result.label, { defaultMessage: "聊天", id: "WTrOy36sdu" });
  assert.equal(result.title.defaultMessage, "允许聊天");
  assert.equal(result.description.defaultMessage, "启用聊天，用于简短问答和起草内容。");
  assert.equal(result.name, "Code review");
  assert.equal(result.help, "Authorization: Bearer `token` for `url` sources");
  assert.equal(result.server, "not found");
  const review = JSON.parse(vm.runInNewContext(rewriteMacDisplaySource('const tool={name:"Code review",userFacingName(){return"Code review"}};JSON.stringify({name:tool.name,display:tool.userFacingName()});', "review-label", []).source));
  assert.equal(review.name, "Code review");
  assert.equal(review.display, "代码审查");
});

test("generated help labels keep enum choices, JSON defaults, environment names and flags unchanged", () => {
  const source = 'const choices=["host","none"],defaultValue="host",presetArg="none",envVar="CLAUDE_TEST_ENV",flags="--environment <name>";const details=[`choices: ${choices.map(v=>JSON.stringify(v)).join(", ")}`,`default: ${JSON.stringify(defaultValue)}`,`preset: ${JSON.stringify(presetArg)}`,`env: ${envVar}`];const usage=`Usage: ${"claude test"}`,suffix=" [options]",internal="default: ";JSON.stringify({details,usage,suffix,choices,defaultValue,presetArg,envVar,flags,internal});';
  const result = JSON.parse(vm.runInNewContext(rewriteMacDisplaySource(source, "help-formatter", []).source));
  assert.deepEqual(result.details, ['可选值："host", "none"', '默认值："host"', '预设值："none"', "环境变量：CLAUDE_TEST_ENV"]);
  assert.equal(result.usage, "用法：claude test");
  assert.equal(result.suffix, " [选项]");
  assert.deepEqual(result.choices, ["host", "none"]);
  assert.equal(result.defaultValue, "host");
  assert.equal(result.presetArg, "none");
  assert.equal(result.envVar, "CLAUDE_TEST_ENV");
  assert.equal(result.flags, "--environment <name>");
  assert.equal(result.internal, "default: ");
  const scope = JSON.parse(vm.runInNewContext(rewriteMacDisplaySource('const scopes=["user","project","local"];JSON.stringify({help:`Installation scope: ${scopes.join(", ")} (default: auto-detect)`,scopes});', "help", []).source));
  assert.equal(scope.help, "安装范围：user, project, local（默认：自动检测）");
  assert.deepEqual(scope.scopes, ["user", "project", "local"]);
});

test("unverified Mac builds and invalid source anchors are rejected before mutation", () => {
  const buffer = Buffer.alloc(128, 0x5a), before = Buffer.from(buffer);
  assert.throws(() => patchMacDisplayModules(buffer, { modulesPtr: { offset: 0, length: 52 } }, 52, [], {
    format: "MachO", version: "2.1.286", sourceHash: "0".repeat(64),
  }), /指纹未经验证/);
  assert.deepEqual(buffer, before);
  assert.throws(() => rewriteMacDisplaySource('const title="Diff";', "permission", []), /锚点不匹配/);
  assert.deepEqual(patchMacDisplayModules(buffer, {}, 52, [], { format: "ELF", version: "2.1.286" }), { sourceModules: 0, sourceReplacements: 0 });
  for (const [version, [hash, modules]] of MAC_DISPLAY_BUILDS) {
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.equal(new Set(modules.map(m => m[0])).size, modules.length, version);
  }
});

test("a verified display module uses its exclusive source space when bytecode is smaller", () => {
  const source = 'const title="Sign in with your Anthropic account";'.padEnd(200, " ");
  const hash = crypto.createHash("sha256").update(source).digest("hex");
  const version = "9.9.9", sourceHash = "a".repeat(64), buffer = Buffer.alloc(600), name = "/$bunfs/root/test.js";
  buffer.write(name, 52);
  buffer.writeUInt32LE(52, 0); buffer.writeUInt32LE(name.length, 4);
  buffer.write(source, 100); buffer.writeUInt32LE(100, 8); buffer.writeUInt32LE(200, 12);
  buffer.fill(0xaa, 400, 404); buffer.writeUInt32LE(400, 24); buffer.writeUInt32LE(4, 28);
  MAC_DISPLAY_BUILDS.set(version, [sourceHash, [["test.js", "help", hash]]]);
  try {
    const result = patchMacDisplayModules(buffer, { modulesPtr: { offset: 0, length: 52 } }, 52, translations, { format: "MachO", version, sourceHash });
    assert.equal(result.sourceModules, 1);
    assert.equal(buffer.readUInt32LE(8), 100);
    assert.equal(buffer.readUInt32LE(28), 0);
    assert.match(buffer.toString("utf8", 100, 300), /Anthropic 账号登录/);
    assert.deepEqual(buffer.subarray(400, 404), Buffer.alloc(4, 0xaa));
    const invalid = 'const title="Sign in with your Anthropic account"; const broken=;'.padEnd(200, " ");
    buffer.write(invalid, 100); buffer.writeUInt32LE(200, 12);
    buffer.writeUInt32LE(400, 24); buffer.writeUInt32LE(4, 28);
    MAC_DISPLAY_BUILDS.set(version, [sourceHash, [["test.js", "help", crypto.createHash("sha256").update(invalid).digest("hex")]]]);
    const before = Buffer.from(buffer);
    assert.throws(() => patchMacDisplayModules(buffer, { modulesPtr: { offset: 0, length: 52 } }, 52, translations, { format: "MachO", version, sourceHash }), /语法验证失败/);
    assert.deepEqual(buffer, before);
  } finally { MAC_DISPLAY_BUILDS.delete(version); }
});
