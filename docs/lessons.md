# Lessons

- 2026-04-08: 审查版本历史时，不能用当前工作树或当前 `cli-translations.json` 代表历史 tag 内容。用户质疑“更早版本是否已经翻过 `/btw` 提示”时，必须逐个检查对应 tag 的 `patch-cli.sh`、`patch-cli.js` 和 `cli-translations.json`，避免把“当前版本有词条”误说成“某个旧版本首次修复”。
- 2026-04-09: 诊断“插件更新后为什么没生效”时，不能只看仓库里的最新 `patch-cli.js`。必须同时检查 `~/.claude/plugins/claude-code-zh-cn/` 里的已安装 payload 是否包含 patch 所需文件，以及 `.patched-version` 的判断条件是否会在“同一 Claude Code 版本、不同插件版本”下重新 patch。
- 2026-04-09: 在多代理协作里判断“是谁修的”时，不能只看当前工作树或单一对话结论。必须核对 git 提交历史、分别复现实验“仅翻译表修复”和“翻译表 + patch 引擎修复”的效果，再区分根因修复、引擎加固、以及本机安装态恢复三层归因。
- 2026-04-13: 这个项目的术语策略不是“能翻就翻”。`Agent`、`Skill`、`Hook` 这类产品/机制名词按用户要求应保持英文，不要擅自改成“智能体 / 技能 / 钩子”。后续做翻译质量收敛时，要先确认哪些术语属于应保留英文的产品词，再动词典。
- 2026-04-13: 诊断“同一个 Claude Code 版本里为什么中文突然掉回英文”时，不能把“版本号没变”当成排除条件。`cli.js` 可能被同版本重装、恢复原始文件、或被其他安装流程覆盖，导致 patch 丢失；必须同时检查当前运行文件内容、安装态插件版本，以及 `.patched-version`/自动重 patch 是否真的覆盖到这份 `cli.js`。
- 2026-04-13: 针对 Claude Code 上游 TUI 文案的特殊 patch，不能把变量名或完整模板形态写死。上游同一功能在新版本里可能只是把 `` `${O} for ${M}` `` 改成 `H&&\`${A} for ${X}\`` 这类 guarded template，用户看到就会重新出现 `for`。后续修这类回归时，先从当前实际 `cli.js` 抓真实模板，再把规则写成结构泛化匹配，并补对应回归测试。
- 2026-04-14: 针对带英文撇号的高曝光文案，不能只依赖双引号整句词典。上游或 minifier 可能把 `Claude's` / `what's` / `Code'll` 拆成 `"foo","'","bar"`，导致 `/btw`、folder trust 等文案漏翻。后续遇到这类回归时，优先做“split double-quoted literal” 预处理，再进入常规字符串词典替换。
- 2026-04-14: launcher 不能只信 `.patched-version`。同版本 `npm reinstall/update` 可能把 `cli.js` 覆盖回英文，但 marker 仍然匹配；后续做启动前自修复时，除了比对版本/revision，还要直接扫关键英文探针，确认文件内容本身仍是中文态。
- 2026-04-14: 一旦 PATH 前面放了 launcher，`install.sh`、`uninstall.sh`、`session-start` 这三处凡是要探测 Claude 安装路径，都必须优先拿真实 `claude` 路径，而不是直接 `which claude`。否则 helper 会把 launcher 自己当成目标，npm/native 检测和自动 patch 会一起失效。
- 2026-04-14: compat residue 规则不能写得过宽。像裸 `" for "` 这种碎片在上游 bundle 里会命中无关语境，导致矩阵全红却不是实际回归；后续把 compat 脚本里的模板检查转成 regex/context 规则时，要让 residue 精确对应“已知高风险模板未命中”，而不是泛字符串残留。
- 2026-04-14: 关键英文探针名单不能在多处手写。compat matrix、sentinel 脚本、以及后续 support matrix 说明都应从同一份 config 读 probe 列表和 baseline；否则一边新增 `Tab to amend`/`ctrl+e to explain`，另一边忘了同步，CI 和本地验收会出现假绿。
- 2026-04-14: 危险碎片治理不能只看最新版本段。像 `Enter to submit · Esc to cancel` / `Enter to copy link · Esc to cancel` 这种旧模板只在 `2.1.92/2.1.97` 暴露，如果只用当前最新 bundle 验证，就会误以为 `Enter to` 已经完全可删。后续迁移宽碎片时，必须对代表版本段逐个扫 patched 后残留，再补精确整句。
- 2026-04-14: `docs/support-matrix.md` 这类派生文档不能只生成一次就算完成。只要后续又补了翻译或 patch，compat patch count 就可能变化；因此在收尾前必须再生成一遍，并做一次“连续两次生成结果完全一致”的稳定性检查，避免提交时 README / matrix / 实际验证结果仍然错位。
- 2026-04-15: 判断 GitHub PR“现在卡在哪”时，不能只看 connector 返回的 `mergeable`、普通 comments 或 commit status。像 fork PR 的 workflow approval、branch protection 的 required status checks、以及 unresolved review threads 都可能让页面显示 `BLOCKED`，但不会完整体现在轻量接口里。后续汇报 PR 进展时，必须同时核对 branch protection、Actions run 结论（尤其 `action_required`）、以及 review thread 的 `isResolved` 状态，再下结论。
- 2026-04-16: 外部贡献者的 PR 合并后如果发 release，release notes 必须明确提到贡献者和 PR 编号。不要只写修复内容；发布前要检查“贡献/Thanks”段落，避免把贡献者署名遗漏在公开发布说明之外。
