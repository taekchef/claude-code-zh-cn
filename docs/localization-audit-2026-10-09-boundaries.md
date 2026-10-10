# Claude Code 中文覆盖审计：翻译边界与现有检查盲区

审计日期：2026-10-09  
范围：仓库内翻译实现、上游文案差异扫描、覆盖检查、诊断、skill/通知/动词提示层。五包可提取内容的全量静态取样已完成，见[主审计与决策报告](localization-audit-2026-10-09.md)；本文聚焦实现边界。本文的 `chunk-*.js:数字` 和 `@数字` 均为包内源码字符偏移，不是源码行号；仓库链接的 `#L数字` 仍为行号。

## 结论

**仓库不能据现有“patch 成功”或“11/11 显示面通过”得出“界面已完整汉化”。** 目前检查更适合确认特定规则没有明显回归、选定帮助命令可运行和少数英文残留已消失；它没有枚举整个产品里所有可见文本，也没有验证每个翻译条目是否确实显示在用户面前。代码还明确记录了原生展示覆盖为 `PARTIAL` 的版本。

因此后续审计应把候选文案分为“可直接翻译”“需结构化翻译”“必须保留”三类，并同时记录原文所在界面、槽宽和实测结果。不能把所有英文碎片扫出来后不分用途地塞入全局翻译表。

## 已确认的翻译边界

| 现象 | 仓库证据 | 审计判断 |
|---|---|---|
| 粘贴内容占位符含协议片段 | 字节码补丁说明 `[Pasted text #… +… lines]` 会被运行时正则识别，池中静态片段 `[Pasted text #`、` lines]`、`[...Truncated text`、`[Image #` 被硬保护；见 [`scripts/patch-bytecode.js`](../scripts/patch-bytecode.js#L36-L46)。测试直接证明 ` lines]` 不替换，邻近的 `Pondering` 仍可翻；见 [`tests/patch-bytecode.test.js`](../tests/patch-bytecode.test.js#L208-L230)。 | ` lines]` 单看是 UI 短词，但处于协议模板时翻译会破坏附件识别。需要按模板/调用位置决定；全局替换不安全。注释指出 ` more lines]` 是可翻译的 UI 展示片段，但仍应由新版实物确认其真实使用位置。 |
| 英文片段被程序解析或用作任务标识 | `Shell cwd was reset to ` 被解析以恢复执行目录；`Agent "` 与 `" finished` 用于识别完成通知，并进入模型可见的 task-notification 文本；见 [`scripts/patch-bytecode.js`](../scripts/patch-bytecode.js#L48-L57)。对应测试验证这些前后缀不改、旁边的 UI 仍能翻；见 [`tests/patch-bytecode.test.js`](../tests/patch-bytecode.test.js#L250-L284)。 | 有些词虽然会出现在屏幕或通知附近，但同时承担机器判断或模型协议。应保留协议本体，另用上下文锚定的改写只翻用户可见部分。 |
| 提示词碎片不能按一般界面翻译 | 主表有 `skipPatch` 标记；字节码补丁建保护集合，源码补丁也跳过此类条目；见 [`scripts/patch-bytecode.js`](../scripts/patch-bytecode.js#L211-L233) 和 [`scripts/patch-bytecode.js`](../scripts/patch-bytecode.js#L333-L345)。测试列出“or”“Fast mode”“Output Style”“Version: ”等保护项；见 [`tests/translations-quality.test.js`](../tests/translations-quality.test.js#L459-L480)；还有端到端测试逐条确认提示词原样保留，见 [`tests/patch-cli.test.js`](../tests/patch-cli.test.js#L1389-L1408)。 | “短、常见、看上去像 UI”的词也可能是给模型看的指令。先确认文本消费方，再决定翻译。现有提示词保护有测试，但硬编码结构补丁仍须避免绕过保护；相关测试注释明确指出曾有这种风险。 |
| 拆开的 JSX 或模板句子无法靠完整字符串表覆盖 | 源码补丁只识别可见文本字面量；模板支持分别替换静态段，也支持表达式数匹配时整句重写；见 [`patch-cli.js`](../patch-cli.js#L284-L338)、[`patch-cli.js`](../patch-cli.js#L692-L702)。`Press `、粗体 `Enter`、` to continue.` 被拆成多个子节点时，仓库使用结构补丁并保留按键名和 JSX 结构；见 [`patch-cli.js`](../patch-cli.js#L1123-L1143) 和 [`tests/patch-cli.test.js`](../tests/patch-cli.test.js#L1550-L1572)。 | 词表里有完整句子不表示运行时就会命中。新界面要记录文本是否被拆段、变量插入在哪里；需要时只改显示节点，保留键值、表达式和控件结构。 |
| 原生常量槽可能装不下中文 | 字节码替换按原槽容量写入，译文过长只累计 `tooLong` 并跳过；见 [`scripts/patch-bytecode.js`](../scripts/patch-bytecode.js#L235-L268)。注释记录 ` (ctrl+o to expand)` 槽 19 字节，主表译文 24 字节会被跳过，池内短译才放得下；见 [`scripts/patch-bytecode.js`](../scripts/patch-bytecode.js#L59-L63)、[`scripts/patch-bytecode.js`](../scripts/patch-bytecode.js#L232-L248)。测试还验证若干菜单短译和模型选择描述能放进槽；见 [`tests/patch-bytecode.test.js`](../tests/patch-bytecode.test.js#L168-L192)。 | 翻译表命中与原生程序实际变成中文是两回事。审计结果必须保留“槽过窄/未替换”状态；短译应先核对含义，再核实其实际界面。 |
| 多个表面有专用译文，不能以主翻译表覆盖它们 | 池专用表说明其译文要么解决槽宽，要么只适用于池内展示片段，否则放入通用表会误改明文协议/提示词；见 [`scripts/patch-bytecode.js`](../scripts/patch-bytecode.js#L59-L63)。其中 `patterns` 只翻复数，注释明确单数 `pattern` 和 Grep 参数共用；见 [`scripts/patch-bytecode.js`](../scripts/patch-bytecode.js#L71-L73)。 | 源字符串、界面语义与目标程序行为要一起审。短片段最容易跨界复用，应单独列为高风险项目。 |

## 现有覆盖判断会遗漏什么，或让结果看起来比实际更完整

| 机制 | 已确认范围 | 盲区及影响 |
|---|---|---|
| 上游文案差异扫描 | `generate-upstream-text-diff.js` 抽取两版字面量，去重后只比较新增和删除的字符串；翻译覆盖按英文原文精确相等判定；见 [`scripts/generate-upstream-text-diff.js`](../scripts/generate-upstream-text-diff.js#L334-L350)、[`scripts/generate-upstream-text-diff.js`](../scripts/generate-upstream-text-diff.js#L378-L405)、[`scripts/generate-upstream-text-diff.js`](../scripts/generate-upstream-text-diff.js#L419-L447)。动态模板以 `${...}` 占位；见 [`scripts/generate-upstream-text-diff.js`](../scripts/generate-upstream-text-diff.js#L294-L312)。 | 它能找“相对上一版新增的可疑文案”，不能找“已存在多版却一直漏译的旧文案”。精确相等也不会把片段翻译、结构化改写或池内专用表算作已覆盖；过滤条件会排除短于 4 字符、长于 500 字符、像代码/元数据/参数的字符串。报告因此不能当作完整可翻译文案目录。 |
| native 源码副本与实际 bytecode | native `sources` 命令明确注释它提取的是 bytecode 构建里的 chunk 源码“调试副本”，只用于文案差异审计；见 [`bun-binary-io.js`](../bun-binary-io.js#L702-L718)。bytecode 容器则由另一条路径直接修改常量池；见 [`scripts/verify-upstream-compat.js`](../scripts/verify-upstream-compat.js#L569-L584)。 | 源码副本中的字符串不等于执行程序常量池中的字符串：前者可能与打包/运行时文本不同，后者也可能由模板静态段、编译期生成或池内短译覆盖。最终清单要并列标注“源码候选”和“实际池命中/可见运行输出”，不得把一次 sources 扫描计作实际补丁覆盖。 |
| 文案抽取方式 | 扫描器从单双引号和模板引号提取文本，模板表达式被占位，并把空白归一；见 [`scripts/generate-upstream-text-diff.js`](../scripts/generate-upstream-text-diff.js#L244-L354)。现有测试覆盖普通新增句、嵌入式模板和元数据/代码过滤；见 [`tests/upstream-text-diff.test.js`](../tests/upstream-text-diff.test.js#L21-L42)、[`tests/upstream-text-diff.test.js`](../tests/upstream-text-diff.test.js#L85-L155)。 | 这不是完整的 JavaScript 语义或界面可见性分析。扫描循环只跳过引号内容，没有注释状态，因此注释里的引号文本也可能进入候选清单；同理，文字可能来自变量/外部数据而不呈现为静态字面量。静态句子也可能只用于日志、测试、模型提示或不可见数据。抽取结果须人工核用途。 |
| 兼容性“通过”与覆盖“完整”是两件事 | 代码将运行兼容状态与覆盖状态分别返回；少量配置残留和覆盖警告会令 `coverage.status` 为 `partial`，但整体运行状态仍可为 `pass`；见 [`scripts/verify-upstream-compat.js`](../scripts/verify-upstream-compat.js#L1011-L1037)。测试固定验证“运行通过、展示有英文”的结果为 `pass + partial`；见 [`tests/upstream-compat.test.js`](../tests/upstream-compat.test.js#L756-L818)。 | UI 提示或 CI 单看绿色 `pass` 容易被理解为“汉化完整”。应把“能启动/补丁安全”“选定表面无已知残留”“全量文案覆盖”分开呈现；本仓库只明确支持前两类有限证据。 |
| 展示审计主要检查帮助输出 | 当前生产配置列出 11 个 CLI 帮助命令：顶层 `--help` 和 `agents`、`auth`、`auto-mode`、`doctor`、`install`、`mcp`、`plugin`、`setup-token`、`update`、`ultrareview` 帮助；其中除顶层外均为 optional；见 [`scripts/upstream-compat.config.json`](../scripts/upstream-compat.config.json#L540-L627)。 | 这些命令不是权限弹窗、计划模式、侧栏、差异面板、代码审查页签、登录/更新流程等完整交互界面的现场验收；help 输出也不覆盖交互界面的动态页脚、情境提示或页面标签。即使 11 项都执行，也不能外推到未覆盖的对话流程或原生桌面 UI。 |
| 英文残留规则偏向长句 | `isLikelyUntranslatedLine` 至少要求 2 个长度至少 3 的英文单词；中英混排还要含预设指示词之一；代码另清除允许的英文术语、引号、参数及路径；见 [`scripts/verify-upstream-compat.js`](../scripts/verify-upstream-compat.js#L773-L839)。生产配置允许几十个英文产品词和多种整行格式；见 [`scripts/upstream-compat.config.json`](../scripts/upstream-compat.config.json#L695-L741)。 | “Yes”“No”“Chat”这类单个短词不会达到两词门槛；像“由 user 切换 model”这样的中英混排在去除中文后剩两个英文词，但没有预设连接词，也可能漏报。规则适合抓长段漏译，不是短标签完整性保证。 |
| 配置中的硬编码残留清单 | `collectResidue` 只在配置哨兵和模板检查项中找精确文本/正则；见 [`scripts/verify-upstream-compat.js`](../scripts/verify-upstream-compat.js#L679-L705)。展示检查亦只针对配置的 blocked phrases、must-preserve 与命令输出；见 [`scripts/verify-upstream-compat.js`](../scripts/verify-upstream-compat.js#L841-L889)。 | 清单没有命中的英文不会自动成为失败项。它提供已知风险的回归保护，不会自动发现所有漏译。 |
| Doctor 诊断状态 | npm doctor 只检查 3 个高风险哨兵，若都不存在就报告抽样未发现探针；见 [`scripts/zh-cn-doctor.js`](../scripts/zh-cn-doctor.js#L24-L28)、[`scripts/zh-cn-doctor.js`](../scripts/zh-cn-doctor.js#L746-L765)。原生路径一处按当前文件 hash、版本、规则记录判断补丁状态；另一处按修复回执和规则版本报告“已补丁若干处，英文覆盖需另行审计”；见 [`scripts/zh-cn-doctor.js`](../scripts/zh-cn-doctor.js#L774-L794)、[`scripts/zh-cn-doctor.js`](../scripts/zh-cn-doctor.js#L920-L944)。 | 这两处回答不同问题：补丁记录是否有效 vs 可见英文是否完整。原生分支在边界状态下可能呈现一个状态“需要补丁”、另一个仍有补丁回执；当前测试未发现针对两套状态不一致的专门断言。不要把 patch 数当覆盖率。 |

## 其他翻译层的边界

| 层 | 代码实际做什么 | 审计决策 |
|---|---|---|
| skill/插件命令描述 | 仅在 `ZH_CN_SKILL_I18N_ENABLE=1` 时后台运行；修改 `SKILL.md`、命令 Markdown 和插件元数据的 `description`，并明确会同时影响模型触发；见 [`plugin/skill-i18n/README.md`](../plugin/skill-i18n/README.md#L3-L22)、[`plugin/skill-i18n/README.md`](../plugin/skill-i18n/README.md#L113-L132)。 | 这是可选的用户本机内容翻译，不是 Claude Code 主界面翻译，也不能据其存在推断用户已经启用或所有 skill 已翻。 |
| skill 扫描范围与跳过条件 | 递归扫描技能、命令和插件元数据，按排除目录、默认不跟随符号链接；对中文比例超过 0.3 的描述直接跳过；见 [`plugin/skill-i18n/lib/collect.js`](../plugin/skill-i18n/lib/collect.js#L26-L54)、[`plugin/skill-i18n/README.md`](../plugin/skill-i18n/README.md#L24-L40)、[`plugin/skill-i18n/lib/cjk.js`](../plugin/skill-i18n/lib/cjk.js#L6-L28)、[`plugin/skill-i18n/scan.js`](../plugin/skill-i18n/scan.js#L60-L83)。 | 混合描述只要中文/全角比例超过阈值就可能被视为已翻译；扫描到的文件也不等于其中正文和参数提示均翻译。README 说明 `argument-hint` 默认不翻；见 [`plugin/skill-i18n/README.md`](../plugin/skill-i18n/README.md#L134-L138)。 |
| 通知 Hook | 只按 `message` 子串匹配 6 类通知，输出 `additionalContext`；见 [`plugin/hooks/notification.js`](../plugin/hooks/notification.js#L7-L35)。Windows 版重复同一组匹配；见 [`plugin/hooks/notification.ps1`](../plugin/hooks/notification.ps1#L13-L32)。Hook 注册为同步 `Notification` 命令；见 [`plugin/hooks.json`](../plugin/hooks.json#L16-L28)。 | 这是有限的已知通知补充翻译，不覆盖所有系统通知、所有英文变体或弹窗内容；也只能确认它返回附加上下文，不能仅凭此源代码确认用户实际看到的通知已被原位替换。 |
| spinner 动词和提示 | 安装/语言切换从专用 JSON 读取，动词与提示作为设置注入；见 [`plugin/hooks/user-prompt-submit.js`](../plugin/hooks/user-prompt-submit.js#L78-L100)。测试守护根目录与插件包副本一致，以及动词避免中英混拼；见 [`tests/translations-quality.test.js`](../tests/translations-quality.test.js#L586-L603)、[`tests/plugin-payload.test.js`](../tests/plugin-payload.test.js#L1-L30)。 | 这些检查证明数据形态和打包同步，不评价每条文案是否自然、是否覆盖上游全部动词，也不证明运行时每个 spinner 提示都采用这些文案。 |

## 现有测试证据能证明什么

- 已有测试针对已知样本守住关键边界：协议片段、模型提示词保护、模板拼接、宽度限制、某些新版本中发现的残留，以及特定帮助命令的长英文行。证据分别见 [`tests/patch-bytecode.test.js`](../tests/patch-bytecode.test.js#L120-L133)、[`tests/patch-cli.test.js`](../tests/patch-cli.test.js#L1393-L1408)、[`tests/patch-cli.test.js`](../tests/patch-cli.test.js#L1550-L1595)、[`tests/upstream-compat.test.js`](../tests/upstream-compat.test.js#L756-L818)。
- 这些是针对已知问题和合成 fixture 的回归测试。测试能证明“这条已知边界按预期处理”，不能证明未枚举的所有页面、短词、模板和通知都已覆盖。
- 翻译质量测试中有策划措辞、少量高风险片段、spinner 形态与已知候选的断言；见 [`tests/translations-quality.test.js`](../tests/translations-quality.test.js#L415-L480)、[`tests/translations-quality.test.js`](../tests/translations-quality.test.js#L483-L603)。没有从上游完整字面量目录推导出“所有可见英文都已归类或翻译”的总量守恒检查。
- 字节码测试验证容量、结构和固定样本；它不等同于对权限弹窗、对话标签、差异面板等实际流程逐项操作并截屏验收。

## 建议的审计与决策方式

1. **先建立完整候选目录。** 对目标版本的全部可提取字符串和运行时新增动态片段建立清单；按来源、模板/拼接位置和可见界面归组。上游版本 diff 继续用于发现增量，但不能充当总目录。
2. **每条都做三类裁定。** ①确定给用户看的文案且语义明确：翻译；②同时被代码判断、协议解析或模型读取：保留机器协议，通过结构锚点只翻显示副本；③参数、命令、品牌或不该翻的标识：保留并记录理由。
3. **单列技术限制。** 对每条原生字符串记录槽宽、译文 UTF-16 长度、是否 `tooLong`、是否有池内短译或结构改写；不要把“主表有中文”算成“用户能看到中文”。
4. **按用户流程验收。** 至少把 issue 中提到的权限授权弹窗，以及聊天/差异/代码审查入口纳入实机清单；再覆盖设置、登录、插件管理和通知等实际使用面。帮助输出、启动自检、补丁数量各自作为独立证据。
5. **报告里分开展示结果。** “运行安全”“本次列出的流程通过”“本版本已归类的界面覆盖”分别报告；未操作的界面写“未验证”，协议保护项写“有意保留”，槽宽失败写“尚未汉化”。

## 尚未验证

- 五包静态候选中短标签/拼接模板的真实屏幕位置、运行可达性，以及静态取样以外的服务端和外部插件文案；全产品交互尚未验收。
- 最新权限授权弹窗、聊天、差异、代码审查标签以及 native 界面的人工操作结果。
- 用户本机是否启用了 skill 自动翻译、使用了哪些额外 skill 路径，以及 Notification Hook 返回内容在当前 Claude Code 版本中的最终呈现方式。
- Doctor 在原生安装下“patch 记录状态”和“覆盖提醒状态”不一致的可复现条件；当前代码表明两种状态来源不同，专门测试未找到。

## 2026-10-09：Mac 2.1.295 短词与窄槽复核补充

下列位置以 Mac arm64 2.1.295 的 `modules/*.js.txt` 调试源码副本和 `inventory.json` 为证。它们能确认源代码用途与常量池槽宽；不是屏幕录制，不能单独证明每条路径在用户当前会话中出现。

| 文案 | 已追到的用途 | 决策 |
|---|---|---|
| `Chat` | `chunk-g3af3bz9.js:2549,11163,22845` 用作快捷键上下文枚举/判断；`chunk-cv4party.js:2629` 插入剪贴板提示；`chunk-kzx145fg.js:841542` 则进入 `Allow Chat` 设置的 `defaultMessage` 和 `label`。同一个词同时是协议上下文、提示参数和可见设置文案。 | 禁止全局替换。只对 `j.msg` 等明确展示字段做定点翻译；保留上下文值 `"Chat"`。目前源码不能确认截图顶栏的 `Chat` 来自此处。 |
| `Diff` | `chunk-8mmnqsff.js:28187` 的 `Go` 被导出为 `PANE_TITLE`（约 8143），并用于 `Me()` 返回对象的 `title:Go`（约 54163）及 `openPane({id:Z,title:Go})`（约 56400）。这确实是差异面板标题。此文件的 `/diff` 命令另有 `jo={name:Gs,description:Us}`，描述是“Toggle the diff panel showing uncommitted changes”；两者不是同一用途。另有语法高亮语言名 `Diff`（`chunk-3t8w43qz.js`、`chunk-6e96crw9.js`）应保留。 | 可把 `PANE_TITLE` 锚定为面板显示词翻译；不能对全局字符串或语法高亮名称做替换。截图中的 `Diff` 若是顶栏标签，归属仍未证实；目前只能证实源码有差异面板标题。 |
| `Yes` / `No` | `chunk-n6w5fq1s.js:1147` 分别进入 `confirmLabel`、`cancelLabel` 默认值；`chunk-2sxvm4dn.js:58313,58422` 是反馈按钮对象的 `label`，另有独立的 `value:"yes"/"no"`；`chunk-bhz7hapx.js:148748` 的授权选项也把显示 `label` 与 `value:"accept"` 等分开。`chunk-hh0a7kes.js:221152` 还把它们放入 AskUser 的默认候选数组。 | 它们确有可见按钮场景，但不是每一处都只是显示文本。只翻译按钮 `label` / 明确的显示属性，保留 `value`、行为判断和候选协议；不添加全局短词映射。 |
| `amend` | `chunk-2sxvm4dn.js:36575` 把它传给快捷键提示组件；`chunk-p52mhbqz.js:3890` 的 `z()`（KeyHint）将 `action` 放进渲染子节点，`LD()`（约 4537）也把 action 拼进返回的显示句。因此此处的值确实作为用户可见提示文本，而不只是内部标识。 | 修正此前“不是显示标签、保留 action”的判断：该 KeyHint 路径应汉化显示出来的 `amend`（候选“修订”可装入 5 字节槽，语义需按实际提示验收）。这不意味着其他组件里同名 action 值都可改；应逐个追踪其是否被展示还是参与逻辑判断。 |
| ` to ` | `chunk-p52mhbqz.js:3890` 在非简略 KeyHint 中用作连接词；约 4537 的 `LD()` 同样在按键与 action 之间拼接。全包清单中该空格连接词出现 80 次，共享 4 字节窄槽；其他命中包含自然语言模板、日志和协议内容。 | 它是可见 KeyHint 文案的一部分，但不能全局替换。应在 KeyHint 的渲染模板内做局部中文句式改写（例如“按 Tab 键修订”），不要单独替换这个共享连接词，也不要改动槽池中的全局字面量。 |
| `Use this skill?` | `chunk-bhz7hapx.js:1269975` 是技能权限卡片标题变量的兜底分支；紧接着 `fa` 组件以 `title:uo` 渲染。存在技能时走模板 `Use skill "⟪skill display⟫"?`，所以只覆盖兜底句不会覆盖常见动态标题。 | 这是明确展示标题，应翻译兜底和模板的静态部分，并保留技能名插值。两个分支需作为一个文案单元处理。 |
| `Code Review` | 全名在此包没有精确命中。大小写不同的 `Code review` 在 `chunk-v5wkdteh.js:61690` 用作工具 `userFacingName()` 返回值并进入工具调用消息渲染。 | 不能据此把截图中的 `Code Review` 认定为顶栏标签或代码审查页面标题；截图来源/宿主界面仍需单独查明。 |

### 窄槽记录的处理

`tooLong` 表示该常量池槽位装不下当前 UTF-16LE 译文，不代表文案不可翻。下表是本包记录中的典型例子；槽字节数和是否能改由清单验证，展示效果尚未实机验收。

| 原文 | 槽容量 / 当前译文 | 源码用途及决定 |
|---|---|---|
| `Enter` | 5 字节；表中译文仍是 `Enter`，清单因身份映射也记为 `too-long`。 | `chunk-g3af3bz9.js:9852` 是按键名转显示名；`chunk-p52mhbqz.js:1902` 是按键别名数据。保留标准按键名；把“相同译文”从失败统计中剔除，若要汉化句子只改包裹说明，不改按键标识。 |
| `Hook cancelled` | 14 字节；译文 `Hook 已取消` 未写入。 | `chunk-bc48hzhc.js:601230` 用它作 `output` 比较；约 2944265 处写入 `stderr/output`，约 2987945 处事件带有 `outcome:"cancelled"`。这是运行结果/判断哨兵，不应全局替换；如果它最终直接显示给用户，应从 `outcome` 或 `aborted` 状态生成可翻译消息。 |
| `GitHub App installed!` | 21 字节；当前译文超槽宽。 | `chunk-xz89v37t.js:43615` 明确是成功卡片粗体标题；约 63525 处也作为完成回调的消息参数。考虑窄槽约束，可优先评估仅显示“已安装”（6 字节），前提是相邻卡片明确写出 GitHub App；否则需要针对该标题做结构化短译，不能将未写入误报为已翻译。 |
| `Sign in with your Anthropic account` | 35 字节；当前译文超槽宽。 | `chunk-bc48hzhc.js:1142441` 是 `login` 命令的 `description`。可评估更短的“登录 Anthropic 账号”（约 30 字节）适配池；它是描述字段，仍须检查命令列表/帮助实际消费方后再定最终措辞。 |

本次能确认 `Diff` 是原生差异面板标题，不能确认截图中 `Chat`、`Diff`、`Code Review` 三个顶栏词均属于该 CLI 的同一栏。尤其 `Code Review` 没有精确原文命中，现有证据不足以把截图页签直接加进本包翻译清单；需先取得截图所属窗口/宿主界面的来源证据。
