# Changelog

本项目的版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- **主版本号**：不兼容的架构变更（比如需要完全重写安装流程）
- **次版本号**：新增功能或显著改进（比如新增 patch、新增翻译）
- **修订号**：Bug 修复和小调整（比如修正一条翻译）

## [2.4.47] - 2026-06-05

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.165`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.47`，合并后可按发布流程创建 `v2.4.47`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.46] - 2026-06-05

### 改进

- Windows x64 native published support window 跟进 Claude Code `2.1.162`：基于 pinned Windows runner 的 PE extract / patch / repack / `--version` / display audit 证据，同步支持窗口、README / support matrix 派生产物。
- install / doctor 输出明确区分 Claude Code 本体自动升级和中文插件自动更新，避免用户把 `DISABLE_AUTOUPDATER` 误认为由本插件兜底。

### 验证

- `CI workflow 26960843688`
- `Native Latest Candidate workflow 26960840309`
- `node --test tests/doctor.test.js tests/install-smoke.test.js tests/support-window-generation.test.js`

## [2.4.45] - 2026-06-04

### 修复

- 新增 Windows PowerShell 诊断入口 `doctor.ps1`，并随插件 payload 安装到 `plugin/bin/doctor.ps1`，避免 Windows 用户按维护者回复运行诊断时找不到脚本。
- README 和没汉化 issue 模板补充 Windows 对应的 `doctor.ps1 --json` 命令，减少 Windows 用户只填“无”的情况。

### 验证

- `node --test tests/plugin-payload.test.js tests/payload-source-guard.test.js tests/doctor.test.js`
- `node --check scripts/zh-cn-doctor.js`
- `node --check plugin/scripts/zh-cn-doctor.js`

## [2.4.44] - 2026-06-04

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.162`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.44`，合并后可按发布流程创建 `v2.4.44`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.43] - 2026-06-04

### 修复

- 卸载脚本现在会清理本插件写入的 `enabledPlugins`、`extraKnownMarketplaces` 和 settings hooks，避免卸载后 Claude Code 继续尝试执行已删除的 Hook。
- 兼容 `${CLAUDE_PLUGIN_ROOT}/hooks/...` 这类插件随包 Hook 占位符，并让 Bash / PowerShell 的 `jq` fallback 使用同一清理范围。

### 验证

- `node --test tests/node-only-runtime.test.js tests/install-json-helper.test.js`
- `bash scripts/preflight.sh --skip-release-state`
- `CI workflow 26928293326`

## [2.4.42] - 2026-06-03

### 改进

- Windows x64 native published support window 跟进 Claude Code `2.1.160` / `2.1.161`：基于 pinned Windows runner 的 PE extract / patch / repack / `--version` / display audit 证据，同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.42`。

### 验证

- `Native Latest Candidate workflow 26806852039`
- `Native Latest Candidate workflow 26871231090`

## [2.4.41] - 2026-06-03

### 改进

- Windows x64 native published support window 跟进 Claude Code `2.1.159`：基于 pinned Windows runner 的 PE extract / patch / repack / `--version` / display audit 证据，同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.41`。

### 验证

- `Native Latest Candidate workflow 26735357996`
- `node --test tests/support-window-generation.test.js tests/readme-support-window-sync.test.js tests/doc-derived-counts.test.js tests/support-matrix-generation.test.js`
- `bash scripts/preflight.sh --base origin/main --skip-release-state`

## [2.4.40] - 2026-06-03

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.161`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.40`，合并后可按发布流程创建 `v2.4.40`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.39] - 2026-06-02

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.160`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.39`，合并后可按发布流程创建 `v2.4.39`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.38] - 2026-06-01

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.159`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.38`，合并后可按发布流程创建 `v2.4.38`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.37] - 2026-06-01

### 修复

- 修复单引号字符串里的 `/goal` 描述匹配：`Set a goal \u2014 keep working until the condition is met` 这类 escaped Unicode 文案现在会被正确汉化，覆盖 PR #99 Codex review 指出的漏网路径。
- 补齐同一批 slash / prompt command 菜单里的后续英文描述：`/batch`、`/claude-in-chrome`、`/fewer-permission-prompts`、`/simplify`、`/schedule`、`/run`、`/run-skill-generator`，并加入 upstream guard 防止回归。

### 验证

- `node --test tests/patch-cli.test.js`
- `bash scripts/preflight.sh --skip-release-state`

## [2.4.36] - 2026-05-31

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.158`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.36`，合并后可按发布流程创建 `v2.4.36`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.35] - 2026-05-29

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.156`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.35`，合并后可按发布流程创建 `v2.4.35`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.34] - 2026-05-29

### 修复

- 补齐 `/exit`、`/feedback`、`/focus`、`/goal` 等 slash command 菜单描述的中文翻译，覆盖 issue #80 后续截图里仍残留的英文。
- 新增 `/fast` 动态模板翻译规则，支持 `Opus 4.6`、`Opus 4.8` 等不同上游模型名，避免只命中特定旧版本文案。
- 扩展 upstream guard，把这些 slash 菜单描述纳入跨版本兼容检查，避免后续版本再次漏掉。

### 验证

- `node --test tests/patch-cli.test.js tests/translations-quality.test.js tests/translations-schema.test.js tests/upstream-compat.test.js`
- `bash scripts/preflight.sh --skip-release-state`

## [2.4.33] - 2026-05-28

### 修复

- Windows x64 native `.exe` experimental 支持窗口扩展到 Claude Code `2.1.153`，跟进 issue #80 reporter 在 `v2.4.32` 下仍落在本机自验证路径的问题。
- 补齐 issue #80 截图里暴露的 2.1.153 可见英文残留：model 切换提示、JetBrains 插件提示、`/simplify`、`/advisor`、`/background` 和 `/clear` 描述，并加入 upstream guard 防止 native 验证只看版本窗口、漏看新文案。

### 验证

- Native Latest Candidate workflow `26559956813` 的 Windows native candidate job 通过，artifact 为 `windows-native-latest-candidate-2.1.153`。
- `node --test tests/patch-cli.test.js tests/translations-quality.test.js tests/upstream-compat.test.js`

## [2.4.32] - 2026-05-28

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.153`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.32`，合并后可按发布流程创建 `v2.4.32`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.31] - 2026-05-28

### 修复

- CC Switch 同步逻辑在写入 `common_config_claude` 的同时，会为 Claude 供应商启用通用配置写入，避免切换到其他模型/供应商后中文设置再次被覆盖。
- `doctor` 会检查 Claude 供应商是否启用了通用配置写入；当通用配置已包含中文设置但 provider 未启用时，会明确提示需要重新运行安装器或在 CC Switch 中勾选写入通用配置。

### 验证

- `node --test tests/node-only-runtime.test.js tests/doctor.test.js tests/install-smoke.test.js`
- `node --test tests/*.test.js`
- `bash scripts/preflight.sh`

## [2.4.30] - 2026-05-28

### 新增

- native 安装器新增“软门禁 + 本机自验证”：当 macOS / Windows native 版本高于当前已发布支持窗口、但仍在同一 minor 版本线内时，安装时可尝试 extract / patch / repack / `--version` 自验证，通过才启用 CLI Patch。
- provisional native patch marker 会明确写入 `provisional`、平台和原始二进制 hash；doctor 会把它显示为“本机自验证，尚未纳入已发布支持窗口”，避免把本机临时通过误报成公开支持。

### 修复

- 已明确排除的 native 版本仍保持跳过，不会因为同 minor 软门禁被拿去 provisional patch。

### 验证

- `node --test tests/install-smoke.test.js tests/doctor.test.js tests/session-start-hook.test.js tests/plugin-payload.test.js tests/payload-source-guard.test.js`
- `bash -n install.sh plugin/hooks/session-start`
- `node --check scripts/zh-cn-doctor.js`
- `node --check plugin/scripts/zh-cn-doctor.js`
- `git diff --check`

## [2.4.29] - 2026-05-28

### 修复

- Windows x64 native `.exe` experimental 支持窗口扩展到 Claude Code `2.1.152`，用于解决 issue #80 中 Windows 用户安装后 CLI Patch 被跳过、主界面仍为英文的问题；`2.1.151` 仍保留在未纳入支持列表中。
- macOS arm64 native experimental 支持窗口同步推进到 Claude Code `2.1.152`，吸收本轮 native latest 自动验证结果，避免 `v2.4.29` 被拆成重复 release。
- README、support matrix 和插件支持窗口同步更新 native `2.1.152` 支持边界，并新增回归测试防止 issue #80 的版本再次从生成窗口中丢失。

### 验证

- `node --test tests/support-window-generation.test.js tests/readme-support-window-sync.test.js tests/native-candidate-promotion.test.js`
- `NODE_PATH=/private/tmp/cczh-node-lief/node_modules npm_config_cache=/private/tmp/cczh-npm-cache node scripts/verify-upstream-compat.js --baseline 2.1.152 --skip-latest --native-macos-arm64 --json`
- GitHub Actions native candidate run `26530183703`：Windows native candidate 和 macOS native candidate 均通过。

## [2.4.28] - 2026-05-27

### 修复

- 修复 `install.ps1` 的 CC Switch 提示文案在 Windows PowerShell 中因中文弯引号被当作字符串分隔符，导致 `Write-Host -ForegroundColor` 参数绑定失败的问题。
- 新增 `install.ps1` 弯引号守门测试，避免后续 PowerShell 文案再次触发同类解析问题。
- 新增 PR 自动关闭关键词守门，避免 PR 描述里的 `Fixes #...` / `Closes #...` 在 reporter 复测前误关 issue。

### 验证

- `node --test tests/install-smoke.test.js`
- `env NPM_CONFIG_CACHE=/private/tmp/cczh-npm-cache bash scripts/preflight.sh --skip-release-state`

## [2.4.27] - 2026-05-27

### 新增

- 安装器检测到 CC Switch 的 Claude 通用配置缺少中文设置时，会先询问用户是否同意同步；同意后才会备份并写入 CC Switch 本地数据库，拒绝则保留手动处理路径。
- `doctor` 新增 CC Switch 通用配置只读检查，可提示用户重新运行安装器并授权同步，或在 CC Switch 中手动重新提取通用配置。

### 修复

- `doctor` 兼容当前 `spinnerVerbs: { mode, verbs }` 结构，不再把 187 个 spinner 动词误判为 2 个字段。

### 验证

- `node --test tests/doctor.test.js tests/node-only-runtime.test.js`
- `node --test tests/plugin-payload.test.js tests/payload-source-guard.test.js tests/install-json-helper.test.js`
- `env NPM_CONFIG_CACHE=/private/tmp/cczh-npm-cache bash scripts/preflight.sh --skip-release-state`

## [2.4.26] - 2026-05-27

### 修复

- Windows native `.exe` 版本检测新增回退：当二进制内嵌 JS 头部读不到 `// Version:` 时，会继续读取 npm 包 `package.json`，必要时再执行 `claude.exe --version`。这可以避免 issue #70 里 Windows + `claude 2.1.150` 被误判为 `unknown`，导致已验证版本仍跳过 CLI Patch。
- README 的 `node-lief` 依赖说明改为明确区分 native experimental 与旧版 npm `cli.js` 路径，避免支持边界守门误报。

### 验证

- `node --test tests/bun-binary-io.test.js tests/plugin-payload.test.js`
- `node --test tests/support-boundary-guard.test.js`
- `npm_config_cache=/private/tmp/cczh-npm-cache bash scripts/preflight.sh --skip-release-state`

## [2.4.25] - 2026-05-26

### 新增

- Windows x64 native `.exe` 纳入 experimental CLI Patch 支持窗口，已验证版本与 macOS native 窗口对齐；未验证 latest 仍会安全跳过。
- `install.ps1` 支持按 `windowsNativeExperimental` 支持窗口执行 PE/Bun extract / patch / repack，并写入 native patch marker。
- CI 新增 Windows native compat lane，native latest candidate workflow 也会产出 Windows native 验证 artifact。

### 修复

- doctor 诊断不再把 macOS native 支持窗口误用于 Windows `.exe`，并会校验 native marker 的版本、二进制 hash 与 patch 规则 revision。

### 验证

- `node --test tests/bun-binary-io.test.js tests/install-smoke.test.js tests/doctor.test.js tests/upstream-compat.test.js tests/support-boundary-guard.test.js tests/support-matrix-generation.test.js tests/readme-support-window-sync.test.js tests/native-latest-workflow.test.js tests/plugin-payload.test.js tests/payload-source-guard.test.js tests/preflight.test.js`
- `bash scripts/preflight.sh --skip-release-state`

## [2.4.24] - 2026-05-26

### 新增

- 新增 `./doctor.sh` 和安装后的 `~/.claude/plugins/claude-code-zh-cn/bin/doctor` 诊断入口，可检查插件目录、settings、Claude 安装形态、CLI 版本、patch 记录和 Layer 4 状态，并给出下一步命令。
- 诊断脚本支持 `--json`，方便 issue 反馈或脚本化收集安装状态。

### 修复

- 诊断脚本遇到损坏的插件 `manifest.json` 时不再直接崩溃，会输出可读的 fail 检查。
- npm CLI Patch 状态现在会检查 folder trust、approval、`/btw` 三个高风险英文探针，避免只看一个 sentinel 导致误报已 patch。

### 验证

- `node --test tests/doctor.test.js tests/plugin-payload.test.js tests/payload-source-guard.test.js tests/preflight.test.js`

## [2.4.23] - 2026-05-25

### 新增

- 新增远程安装与卸载引导脚本，发布后会作为 GitHub Release Asset 提供 `curl | bash` 安装入口。
- SessionStart 自动更新现在支持 remote 安装记录的 GitHub repo slug，可继续从最新 Release 拉取并更新插件。
- 新增 Release Asset 上传 workflow，发布 Release 后自动注入 tag / commit 并上传 remote 安装脚本。

### 验证

- `node --test tests/remote-bootstrap.test.js tests/remote-auto-update.test.js`
- `bash scripts/preflight.sh --skip-release-state`

## [2.4.22] - 2026-05-25

### 修复

- 补齐 issue #70 反馈的 native UI 残留英文：权限确认面板标题、`Waiting…` 状态、Yes / No 选项、`don’t ask again` 前缀授权文案，以及紧凑时长单位现在会显示中文。

### 验证

- `node --test tests/patch-cli.test.js`
- `NODE_PATH=/private/tmp/cczh-node-lief/node_modules node scripts/verify-upstream-compat.js --baseline 2.1.150 --skip-latest --native-macos-arm64 --json`

## [2.4.21] - 2026-05-24

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.150`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.21`，合并后可按发布流程创建 `v2.4.21`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.20] - 2026-05-22

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.148`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.20`，合并后可按发布流程创建 `v2.4.20`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.19] - 2026-05-21

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.146`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.19`，合并后可按发布流程创建 `v2.4.19`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.18] - 2026-05-21

### 修复

- 补齐 Claude Code help 面中 `--mcp-config`、`--permission-mode`、`mcp list` 等半中半英文案，避免短片段翻译后留下 `Load MCP 服务器 from JSON files` 这类混杂显示。
- 加强 native display audit：现在会抓到含中文行里的英文残留短句，不再因为一行里已经有中文就直接放过。

### 验证

- `node --test tests/upstream-compat.test.js`
- `node --test tests/translations-quality.test.js`
- `PATH=/Users/changfenhuang/.nvm/versions/node/v24.13.0/bin:$PATH npm_config_cache=/private/tmp/cczh-npm-cache-latest node scripts/verify-upstream-compat.js --baseline 2.1.145 --skip-latest --native-macos-arm64 --packages-dir /private/tmp/cczh-latest-packages --json`

## [2.4.17] - 2026-05-20

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.145`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.17`，合并后可按发布流程创建 `v2.4.17`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.16] - 2026-05-19

### 改进

- macOS native latest 自动 closeout 跟进 Claude Code `2.1.144`：验证通过后同步支持窗口、README / support matrix 派生产物，并把插件版本推进到 `2.4.16`，合并后可按发布流程创建 `v2.4.16`。

### 验证

- `Native Latest Candidate workflow`
- `CI preflight`

## [2.4.15] - 2026-05-17

### 改进

- 恢复 native latest 自动 closeout 的发布准备链路：Claude Code latest 通过 macOS native 验证并产生真实支持窗口变化后，会自动补 `plugin/manifest.json`、`CHANGELOG.md`，再创建带新插件版本号的 draft PR
- Native latest workflow 新增 no-op 闸门：如果 latest 已经被当前支持窗口覆盖，只写 Actions summary，不再重复升版本或开空 PR
- Native latest 候选失败时会自动生成接手报告并开草稿修复 PR，避免维护者只能从邮件和 artifact 手工捞线索

### 验证

- `node --test tests/*.test.js`
- `node --test tests/native-latest-workflow.test.js tests/native-failure-handoff.test.js tests/preflight.test.js`
- `npm_config_cache=/private/tmp/cczh-npm-cache-release-closeout bash scripts/preflight.sh --base origin/main --skip-release-state`

## [2.4.14] - 2026-05-17

### 改进

- macOS native experimental 支持窗口扩展到已验证的 Claude Code `2.1.143`，同步 README、support matrix 和插件支持窗口派生产物

### 验证

- `bash scripts/preflight.sh --base origin/main --skip-release-state`

## [2.4.13] - 2026-05-17

### 改进

- macOS native experimental 支持窗口扩展到已验证的 Claude Code `2.1.141`，同步 README、support matrix 和插件支持窗口派生产物
- Windows install smoke CI 改为 `windows-2022` + `windows-2025-vs2026` 双通道，提前覆盖 GitHub runner 迁移，避免 `windows-latest` 自动切换带来发布前意外

### 修复

- 补齐 Claude Code `2.1.141` 新增 `agents` help 文案翻译，避免 native latest display audit 因英文漏出阻断推广
- 补齐 Claude Code `2.1.142` / `2.1.143` 新增 `agents --help` 选项说明翻译，避免新版 agents help 表面残留英文

### 验证

- `npm_config_cache=/private/tmp/cczh-npm-cache-v2413 bash scripts/preflight.sh --skip-release-state`

## [2.4.12] - 2026-05-14

### 修复

- 补齐 Claude Code 跳过权限检查模式启动安全警告的整段中文翻译，避免只翻译标题、正文仍显示英文

### 验证

- `node --test tests/patch-cli.test.js`

## [2.4.11] - 2026-05-14

### 修复

- 修复 macOS native binary repack 后如果 `codesign` 或签名校验失败仍可能继续写入成功状态的问题；现在重签和 `codesign --verify --strict` 都是硬门槛，失败会直接阻断 native CLI Patch，避免用户启动时遇到 `zsh: killed`
- 修复 SessionStart 自动重 patch 路径在 repack / codesign 失败后未恢复 native 备份的问题，避免留下已改写但不可启动的二进制
- Native candidate 推广流程新增 codesign 校验要求，防止未通过签名验证的候选版本进入支持窗口

### 验证

- `node --test tests/bun-binary-io.test.js tests/native-candidate-promotion.test.js`
- `node --test tests/session-start-hook.test.js`
- `PATH=/Users/changfenhuang/.nvm/versions/node/v24.13.0/bin:$PATH /Users/changfenhuang/.nvm/versions/node/v24.13.0/bin/node scripts/verify-upstream-compat.js --baseline 2.1.140 --skip-latest --native-macos-arm64 --fixtures-dir /private/tmp/cczh-native-fixtures --json`

## [2.4.10] - 2026-05-13

### 修复

- 修复 Claude Code `2.1.139` native binary 中过去式状态动词数组使用 `Saut\xE9ed` 转义写法时绕过 CLI Patch，导致对话结束后显示 `Cooked 19s` 等英文状态的问题

### 验证

- `node --test tests/patch-cli.test.js`
- `node --test tests/*.test.js`
- `node scripts/verify-upstream-compat.js`

## [2.4.9] - 2026-05-12

### 新增

- 新增 macOS native latest candidate 验证通过后的自动 closeout PR 流程：验证成功后可自动推广支持窗口、同步 README / support matrix / 派生计数，并打开 `codex/native-latest-<version>` 收口 PR
- 新增 `scripts/promote-native-candidate.js`，推广前校验 candidate JSON 的 native package、patch、display audit、支持窗口边界，失败时输出可操作的阻断原因
- 新增 native latest 文本差异报告，自动对比上一版与本次 latest 的上游 JS 字符串变化，并把 Markdown 报告写入 Actions summary 和 artifact，方便维护者检查新增 / 删除英文文案

### 改进

- Native latest workflow 新增 push 级别的轻量 contract 验证，避免只在手动 / 定时 macOS 验证时才发现流程脚本问题
- 同步 macOS native `2.1.138` 和 `2.1.139` closeout 结果到 source-of-truth config、support matrix 和 README，保持自动推广产物、支持矩阵和公开说明一致
- Native latest 验证新增新版本 package 解析保护，确保 macOS native candidate 下载 `@anthropic-ai/claude-code-darwin-arm64` 平台包，而不是误用 generic wrapper 包

### 修复

- 修复 native latest workflow 的验证依赖链路，避免 contract 验证失败时仍继续执行 macOS verify、promotion 和 closeout PR 创建
- 修复 upstream text diff 跳过或截断带 `${...}` 插值、嵌套模板字符串的问题，避免用户可见英文文案漏出翻译审查
- 补齐 Claude Code `2.1.139` 新增 plugin component inventory help 文案翻译

### 验证

- `node --test tests/*.test.js`
- `npm_config_cache=/private/tmp/cczh-npm-cache bash scripts/preflight.sh --base origin/main --skip-release-state`

## [2.4.8] - 2026-05-09

### 改进

- macOS native experimental 支持窗口扩展到已验证的 Claude Code `2.1.138`，覆盖 `2.1.124`、`2.1.126`、`2.1.128`、`2.1.129`、`2.1.131 - 2.1.133`、`2.1.136 - 2.1.138`
- 补齐新版顶层 help / auto-mode help 中的 project、plugin-dir、plugin-url、auto-mode defaults 文案翻译

### 验证

- `node --test tests/translations-quality.test.js`
- `NODE_PATH=/private/tmp/cczh-node-lief/node_modules npm_config_cache=/private/tmp/cczh-npm-cache node scripts/verify-upstream-compat.js --config /private/tmp/cczh-native-candidate.config.json --baseline 2.1.124,2.1.126,2.1.128,2.1.129,2.1.131,2.1.132,2.1.133,2.1.136,2.1.137,2.1.138 --skip-latest --native-macos-arm64 --packages-dir /private/tmp/cczh-native-packages --json`

## [2.4.7] - 2026-05-09

### 修复

- 修复从旧 release tag 自动更新时，如果发布包里还没有 `scripts/install-json-helper.js`，SessionStart staged auto-update 会因归档路径不存在而失败的问题
- Windows SessionStart 自动更新不再把 `scripts/install-json-helper.js` 当成 staged release 必需文件，旧发布包会继续走安装脚本 fallback 完成更新

### 验证

- `node --test tests/session-start-hook.test.js`
- `npm_config_cache=/private/tmp/cczh-npm-cache bash scripts/preflight.sh --base origin/main --skip-release-state`

## [2.4.6] - 2026-05-09

### 改进

- macOS native experimental 支持窗口扩展到已验证的 Claude Code `2.1.133`，并明确 `2.1.124 - 2.1.132` 未纳入本轮支持，避免把未验证 latest 误报为稳定支持
- SessionStart 中文上下文新增“机器配置保护”，生成或修改 `settings.json`、`statusLine`、Hook、MCP、工具参数等机器可读内容时保留 key、命令、路径、`subagent_type` 等原文

### 修复

- CLI Patch 现在跳过模型内部 prompt contract 片段，避免 `/statusline`、memory、环境说明等内部 prompt 被半中文化后影响工具调用或 subagent 设置流程
- `/statusline` 内置 setup agent 和 Agent 任务 prompt 新增路径保护，要求工具调用使用 `~/.zshrc`、`~/.claude/settings.json` 等 `~` 路径，避免第三方模型猜测 `/Users/...` 绝对路径后卡在权限流程
- 补齐 Claude Code `2.1.133` 新增 help 文案翻译，同时保持模型协议文本不被误 patch

### 验证

- `npm_config_cache=/private/tmp/cczh-npm-cache bash scripts/preflight.sh`
- `npm_config_cache=/private/tmp/cczh-npm-cache npm_config_prefix=/private/tmp/cczh-node-lief node scripts/verify-upstream-compat.js --baseline 2.1.133 --skip-latest --native-macos-arm64 --json`

## [2.4.5] - 2026-05-08

### 改进

- CI 改为通过 `scripts/preflight.sh` 统一执行 PR 维护检查，减少本地和远端检查口径分叉
- 新增 macOS native latest candidate workflow，可手动或定时验证最新 native 候选版本，并只上传 JSON 结果，不自动扩大支持窗口
- 安装脚本改用共享 Node helper 处理 settings JSON 合并和 patch revision，减少对 Python / 大环境变量的依赖
- README 新增“30 秒怎么选”，把 old npm、macOS native experimental、latest / next、Windows PowerShell 的使用建议放在快速开始入口

### 修复

- 自动更新打包现在包含 `scripts/install-json-helper.js`，避免更新包缺少安装 helper
- 卸载脚本只删除带有本插件标记的 launcher，遇到用户自定义 launcher 会保留并提示
- Windows 安装脚本会检查 install-json-helper 执行失败，避免 helper 异常时静默继续

### 验证

- `node --test tests/*.test.js`
- `npm_config_cache=/private/tmp/cczh-npm-cache bash scripts/preflight.sh --base origin/main --skip-release-state`

## [2.4.4] - 2026-05-08

### 修复

- 修复 launcher 启动第三方 wrapper 时仍把 `~/.claude/bin` 留在子进程 PATH 里，导致 cmux 这类 wrapper 内部再次调用 `claude` 时重新进入本插件 launcher，循环追加参数并最终触发 `Argument list too long`
- Windows launcher 同步传递过滤后的 PATH，避免同类 wrapper 递归
- Windows 安装脚本的 launcher 注入判断改为只看当前 `claude` 的本地 npm `cli.js` 布局，不再用全局 npm fallback 决定是否注入 PATH

### 验证

- 新增 cmux-style wrapper 回归测试：第三方 wrapper 继承的 PATH 不再包含本插件 launcher 目录，也不会重新进入 launcher
- 新增 Windows launcher / install.ps1 防回归检查
- `node --test tests/launcher.test.js tests/install-smoke.test.js`

## [2.4.3] - 2026-05-07

### 修复

- 加强第三方 wrapper 兼容修复：即使机器上同时存在全局 npm Claude，只要当前 PATH 命中的 `claude` 不是 npm `cli.js` 安装，也不会注入本插件 launcher
- launcher 安装判断现在只看当前实际 `claude` 命令本身，不再用 `npm root -g` 兜底结果决定 PATH 注入，避免 cmux 等第三方 wrapper 再次被串联

### 验证

- 新增混合安装回归测试：第三方 wrapper + 全局 npm Claude 共存时仍跳过 launcher 注入
- `node --test tests/launcher.test.js`

## [2.4.2] - 2026-05-07

### 修复

- 修复第三方 Claude wrapper（例如 cmux）场景下，安装脚本仍注入 `~/.claude/bin/claude` launcher，导致启动时报 `Argument list too long` 的问题
- 非 npm `cli.js` 安装方式现在会跳过 npm 启动前自修复，并清理本插件旧的 launcher PATH 注入，避免第三方 wrapper 和本插件 launcher 串联

### 验证

- 新增第三方 wrapper 回归测试：不支持的安装方式会移除旧 launcher 和 profile 注入
- `node --test tests/*.test.js`

## [2.4.1] - 2026-05-07

### 修复

- 修复 README / AGENTS / CLAUDE 里的翻译条数、spinner 数量、patch 数量和 native 支持窗口容易漂移的问题；这些数字现在会从源文件、支持配置和 support matrix 自动校验
- 修复 README 支持系统和安装建议区块可能与 `scripts/upstream-compat.config.json` 不一致的问题，避免公开文档和真实支持窗口说法分叉

### 改进

- `preflight.sh` 新增 README support window 和 doc-derived counts 检查，发布前会直接拦住手改数字、漏同步支持口径的情况
- support boundary guard 改为复用配置渲染的 README 支持片段，减少硬编码文案维护

### 验证

- `node scripts/sync-doc-derived-counts.js --check`
- `node scripts/sync-readme-support-window.js --check`
- `node --test tests/*.test.js`

## [2.4.0] - 2026-04-30

### 新增

- 新增 macOS arm64 native binary experimental 支持通道，已验证 Claude Code `2.1.113`、`2.1.114`、`2.1.116 - 2.1.123` 可完成 extract / patch / repack / 临时 `--version`
- 新增 `plugin/support-window.json` 运行时支持窗口，由 `scripts/upstream-compat.config.json` 生成，避免安装脚本和 Hook 分散硬编码版本
- 新增 `scripts/generate-plugin-support-window.js`，并纳入 preflight 漂移检查
- 新增显示面审计：compat 验证会真实运行顶层和关键子命令 help，阻断用户可见自然语言漏翻，同时保留命令、flag、JSON、MCP 等不该翻译的结构

### 改进

- `verify-upstream-compat.js` 增加 native package 形态识别和 `--native-macos-arm64` 验证模式
- `install.sh` 和 `session-start` 改为按已验证 native 版本窗口启用 CLI Patch，未验证 native 版本继续安全跳过
- native patch marker 改为包含版本、二进制 hash 和 patch 规则指纹，减少重复 patch 和升级误判
- support matrix 和 README 区分 legacy stable、macOS native experimental、Windows/Linux native unsupported，并用“快速决策 + 汉化显示审计”降低用户理解成本
- 补齐 macOS native 已验证窗口内的顶层命令、plugin、MCP、auth、auto-mode、doctor、install、update、ultrareview 等稳定显示面文案

### 验证

- `node scripts/verify-upstream-compat.js --baseline 2.1.113,2.1.114,2.1.116,2.1.117,2.1.118,2.1.119,2.1.120,2.1.121,2.1.122 --skip-latest --native-macos-arm64 --json`：`9 pass / 0 fail / 0 skip`，各版本显示审计 `11/11`
- `node scripts/verify-upstream-compat.js --baseline 2.1.123 --skip-latest --native-macos-arm64 --json`：`2.1.123 PASS(native 1334, display 11/11)`
- `node scripts/verify-upstream-compat.js --baseline 2.1.112 --skip-latest --json`：`2.1.112 PASS(display 11/11)`
- `node --test tests/support-window-generation.test.js`
- `node --test tests/upstream-compat.test.js`
- `node --test tests/session-start-hook.test.js`
- `node --test tests/install-smoke.test.js`

## [2.3.6] - 2026-04-29

### 修复

- 修复 Windows PowerShell 首次安装时新建 `settings.json` 带 BOM，导致 Node 解析 JSON 失败的问题

### 验证

- 新增 Windows PowerShell install smoke，在 `windows-latest` 上验证旧 npm `cli.js` 形态会真实执行 CLI Patch
- 验证 Windows native `.exe` / `2.1.113+` 会明确跳过 CLI Patch，不会误写成功标记
- GitHub Actions：`windows-install-smoke` 和 `test` 均通过

## [2.3.5] - 2026-04-29

### 新增

- 新增支持边界 guard，固定 stable CLI Patch 支持窗口为 `2.1.92 - 2.1.112`，并拦截 `2.1.113+` / `latest` 等越界口径
- 新增 payload 源文件 guard，防止只改 `plugin/` 镜像或改了根源文件却忘记同步发布 payload
- 新增真实上游文案 guard，用真实上游样本校验高风险英文、必翻文案和动态模板形态
- 补充 unsupported-version smoke check，验证超出支持边界的版本会被明确跳过，不会误走 CLI Patch

### 验证

- `node scripts/check-support-boundary.js`
- `node scripts/check-payload-sources.js --base origin/main`
- `node --test tests/*.test.js`
- `node scripts/verify-upstream-compat.js --json`

## [2.3.4] - 2026-04-27

### 新增

- 新增 Windows PowerShell 原生安装/卸载脚本：`install.ps1`、`uninstall.ps1`
- 新增 Windows 版 Hook 和 launcher 包装：`session-start.ps1`、`notification.ps1`、`.cmd` 包装器和 PowerShell launcher
- Windows npm `cli.js` 形态纳入 stable 支持窗口；Windows native `.exe` / latest 继续明确标为 unsupported CLI Patch
- 补充 65 条 Claude Code UI 翻译，覆盖 transcript、thinking、computer-use、rewind 等新文案

### 改进

- Windows 自动更新链路改为走 `install.ps1 -UpdateOnly -SkipBanner`，不再依赖 `bash install.sh --update-only`
- Release archive / session-start 自动更新导出内容补齐 `install.ps1`
- 新增 settings 数据源检查，防止 `settings-overlay.json` 重新混入 spinner verbs / tips 重复数据
- CI 升级到 Node 24 版本的 GitHub Actions
- 补充维护者说明和 lessons 文档，方便后续 review / release 延续同一套判断口径

### 贡献

- 感谢 @Cec1c 贡献 Windows PowerShell 安装链路、Windows Hook / launcher 适配，以及新 UI 翻译补充

### 验证

- `node --test tests/*.test.js`
- `node scripts/verify-upstream-compat.js --json`
- `node scripts/generate-support-matrix.js`

## [2.3.3] - 2026-04-22

### 改进

- 稳定支持窗口从 `2.1.92 - 2.1.110` 扩到 `2.1.92 - 2.1.112`
- README 和 support matrix 明确说明：Claude Code `2.1.113+` / npm latest 已切换为 native binary wrapper，当前旧 CLI Patch 逻辑暂不支持
- macOS 官方安装器指定旧版本口径改为 `experimental`：`2.1.110`、`2.1.111`、`2.1.112` 已用临时 native 二进制验证 extract / patch / repack / `--version`
- `install.sh` 和 `session-start` 保留官方安装器 native patch 处理方法，但只对已验证旧版本窗口开放；`2.1.113+` / latest 会明确跳过
- README 补充官方安装器指定旧版本的命令、native patch 处理方法和 `node-lief` 依赖，同时说明稳定 CLI Patch 仍推荐 npm pinned 安装方式

### 验证

- `node --test tests/*.test.js`

## [2.3.2] - 2026-04-16

### 修复

- 修复一批斜杠命令描述未命中的问题，补齐 `/update-config`、`/claude-api`、`/model`、`/fast` 等命令说明在当前 Claude Code bundle 中的真实字面量形态
- `patch-cli.js` 现在会在真实字符串 token 内处理单引号和模板字符串，避免误改注释、正则字面量等非目标源码上下文
- 修复带英文撇号的单引号字面量漏翻问题，例如 `Copy Claude's last response...`

### 验证

- `node --test tests/*.test.js`

## [2.3.1] - 2026-04-14

### 修复

- 补发正式 release，使 GitHub release/tag 与当前 `main` 一致
- 纳入 `v2.3.0` 之后补上的 CI 兼容修复：launcher 测试 fixture 现在显式提供 `bash` 和 `env`
- 稳定支持窗口从 `2.1.92 - 2.1.104` 扩到 `2.1.92 - 2.1.107`，并同步 support matrix 与 README

### 说明

- `v2.3.0` 对应提交 `8312a1e`，当时还不包含后续 3 个修正提交
- `v2.3.1` 对应当前 `main`，完整包含路线图实现、CI 修复和 `2.1.107` 验证结果

### 验证

- `node --test tests/*.test.js`

## [2.3.0] - 2026-04-14

### 新增

- npm 路径新增启动前自修复 launcher：`claude` 首次启动前会先检查 `.patched-version` 和关键探针，必要时先 patch 再 exec
- 新增 `scripts/upstream-compat.config.json`、`scripts/verify-upstream-compat.js`、`scripts/check-translation-sentinels.js`、`scripts/generate-support-matrix.js`
- 新增 `docs/support-matrix.md` 派生文档，支持边界改为由配置文件 + compat 验收结果生成

### 改进

- 特殊 patch 规则从单版本字符串修补收敛为模板家族：覆盖 `for`、`/btw`、folder trust、approval dialog 等高风险段
- CI 新增 upstream compat、sentinel、support matrix 漂移检查
- README 支持口径改为 `stable / experimental / unsupported`，不再写“支持最新版”

### 修复

- 修复 npm 更新后第一次启动可能先掉回关键英文的问题：launcher 现在会在 exec 前补 patch，失败时降级 warning + 继续启动
- 修复一批高风险碎片依赖：`Enter to`、` to save `、` to edit this plan in ` 等已迁移到精确句子或结构化 patch
- 危险碎片基线从 10 条降到 5 条，保留项仅剩 ` or `、` back`、` navigate · `、` to get started`、` to reference files or lines in your input`

### 验证

- `bash -n install.sh uninstall.sh plugin/bin/claude-launcher plugin/hooks/session-start plugin/profile/claude-code-zh-cn.sh`
- `node --check patch-cli.js plugin/patch-cli.js scripts/check-translation-sentinels.js scripts/verify-upstream-compat.js scripts/generate-support-matrix.js`
- `node --test tests/*.test.js`
- `node scripts/verify-upstream-compat.js`
- `node scripts/check-translation-sentinels.js <patched-cli>`
- `node scripts/generate-support-matrix.js`

## [2.2.2] - 2026-04-13

### 改进

- 继续收敛普通界面文案，不改动 `Agent` / `Skill` / `Hook` 术语边界
- 统一一批 `Enter` / `Esc` 提示语，减少 `回车` 与 `Enter` 混用
- 收紧 `sandbox`、`plugin`、`/clear`、`think-back` 相关高曝光提示的表达

### 修复

- `Use /clear ...` 改为更自然的中文提示，不再保留直译痕迹
- `unix domain socket` 相关说明文案缩短并统一语气
- `sandbox` 失败说明改成更自然的提示型表达
- `plugin - Manage installed plugins` 等菜单文案收紧为更接近 UI 标题的表达

### 验证

- `bash scripts/sync-payload.sh`
- `node --test tests/*.test.js`：`25/25` 通过

## [2.2.1] - 2026-04-13

### 改进

- `install.sh` 现在会在安装完成时输出真实的 CLI Patch 状态摘要，不再把“已跳过”误显示成“已启用”
- README 收紧了支持边界和 Layer 4 描述：明确不支持的安装方式会只启用 Layer 1~3
- `/btw`、`API 密钥`、`插件市场`、`Unix domain socket`、`沙盒`、`Enter to ...` 等高曝光文案统一术语和表达
- 新增 `tests/translations-quality.test.js`，锁住高曝光术语和半中半英回归

### 修复

- helper 返回 `unknown` 时，不再错误 fallback 到另一份 npm 安装；对应回归用例已补齐
- native path 缺少 `node-lief` 依赖时，`session-start` 会静默跳过 re-patch 且保持合法 JSON 输出
- 修复一批半中半英和直译感较重的 UI 词条，减少 `marketplace` / `Enter` / `API key` 这类残留

### 验证

- `bash -n install.sh uninstall.sh plugin/hooks/session-start plugin/hooks/notification compute-patch-revision.sh plugin/compute-patch-revision.sh scripts/sync-payload.sh`
- `node --check bun-binary-io.js plugin/bun-binary-io.js plugin/patch-cli.js tests/*.test.js`
- `node --test tests/*.test.js`：`25/25` 通过

## [2.2.0] - 2026-04-13

### 新增

- 新增 GitHub Actions CI：自动执行 shell 语法检查、JavaScript 语法检查和全量测试
- 新增 `compute-patch-revision.sh` / `plugin/compute-patch-revision.sh`，统一计算 patch 规则指纹
- 新增 `tests/node-only-runtime.test.js`，验证无 Python 3 时的安装、卸载和 notification hook 行为
- 新增 `tests/translations-schema.test.js`，校验翻译表基础结构
- 新增 `scripts/sync-payload.sh`，显式同步根目录 payload 文件到 `plugin/`
- 新增 `CONTRIBUTING.md`，补齐本地校验和 payload 维护说明

### 改进

- runtime 收敛为 Node-only：`install.sh`、`uninstall.sh`、`notification hook` 不再依赖 Python 3
- `bun-binary-io.js` / `plugin/bun-binary-io.js` 的 `loadNodeLief()` 只保留 `require()` + `npm root -g` 两级探测
- README 版本 badge 改为 GitHub Release 动态 badge
- `CLAUDE.md` 更新为当前翻译条目和项目结构说明
- `settings.json` 备份从无限累积改为自动裁剪，只保留最近 5 份时间戳备份

### 修复

- 修复 `codesign` 的命令注入风险：改用 `execFileSync` 传参调用
- `codesign` 失败时输出 warning，不再静默吞掉
- `notification` hook 的 JSON 解析改为 Node 实现，移除 Python bare `except`
- 增补 `bun-binary-io` 检测测试：覆盖 npm 布局、unknown、ELF、symlink resolve、依赖检查
- `tests/plugin-payload.test.js` 纳入 `compute-patch-revision.sh`，避免 payload 漂移

### 验证

- `bash -n install.sh uninstall.sh plugin/hooks/session-start plugin/hooks/notification compute-patch-revision.sh plugin/compute-patch-revision.sh scripts/sync-payload.sh`
- `node --check bun-binary-io.js plugin/bun-binary-io.js plugin/patch-cli.js tests/*.test.js`
- `node --test tests/*.test.js`：`20/20` 通过
- `HOME=$(mktemp -d ...) ZH_CN_SKIP_BANNER=1 bash ./install.sh` 连续执行 6 次后，`settings.json.zh-cn-backup.*` 保留数量为 `5`

## [2.1.0] - 2026-04-12

### 新增

- **macOS 官方安装器实验性支持**：新增 native binary backend，支持检测、提取、写回和卸载恢复
- 新增 `bun-binary-io.js` / `plugin/bun-binary-io.js`，统一处理官方安装器的 Bun 原生二进制
- `install.sh` 自动检测安装类型：`npm` / `native-bun`
- `session-start` 对原生二进制新增自动重 patch 逻辑
- 新增测试：
  - `tests/bun-binary-io.test.js`
  - `tests/session-start-hook.test.js` 的 native 升级回归用例

### 修复

- 修复官方安装器 binary 识别失败：Bun trailer 不再要求必须位于 EOF
- 修复 native 升级后自动重 patch 的回滚风险：旧 backup 不再覆盖新版本 binary
- `uninstall.sh` 优先按当前实际运行目标恢复 native backup，避免混合安装场景误判

### 验证

- `node --test tests/*.test.js`：`11/11` 通过
- macOS 官方安装器隔离验证：
  - 安装、patch、卸载恢复通过
  - 从 `2.1.92` 升级到 `2.1.101` 通过

## [2.0.5] - 2026-04-11

### 修复

- `fetch_failed` 状态名改为 `export_failed`（实际是 git archive 导出失败，不是 fetch）
- 没有新版本时写入 `noop` 状态到 `.last-update-status`，避免旧状态误导诊断
- CHANGELOG v2.0.4 日期修正（04-09 → 04-11）

## [2.0.4] - 2026-04-11

### 新增

- **插件自动更新**：session-start hook 自动检测已发布的 Release tag，同步安装态（Codex 协作）
  - 只跟随已发布 Release，不跟随 main 未发布 commit
  - 使用 `git archive` 提取 release 文件到 staging 目录，不修改源码工作树
  - 限频检查（默认 6 小时间隔，可通过 `ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS` 配置）
  - 支持通过 `ZH_CN_DISABLE_AUTO_UPDATE=1` 禁用
- install.sh 重构为函数式结构，新增 `--update-only` 参数支持 hook 触发的更新
- 失败状态记录：自动更新失败时写入 `.last-update-status`（区分 fetch_failed / staging_invalid / install_failed / ok）
- 版本号格式校验：只接受语义化版本号（X.Y.Z 或 X.Y.Z-suffix），防止注入
- git fetch 超时保护：15 秒超时，macOS 使用后台进程 fallback

### 修复

- `git fetch --tags` 无超时保护导致 session 启动卡住（加 timeout 15 + macOS fallback）
- 自动更新失败时完全静默（新增 `.last-update-status` 状态文件记录失败阶段）
- 版本号未做格式校验直接拼入 JSON（新增 `validate_semver()` 白名单校验）

### 变化

- 新增测试 2 条：更新失败时返回合法 JSON、成功时写入 `.last-update-status`
- 测试总数：4 → 9（含原有 patch-cli 和 plugin-payload 测试）

## [2.0.3] - 2026-04-09

### 修复

- **修复 SyntaxError 导致 Claude Code 无法启动**：batch3 新增的 46 条短翻译（`Type`、`Error:`、`Run` 等）在双引号内匹配到代码标识符，导致 `TypeError` → `类型Error`、`SuppressedError` → `Suppressed错误`。删除危险翻译后恢复正常。
- patch-cli.js 重写：新增 `scanDoubleQuotedLiterals()` 安全解析器，防止翻译匹配到代码标识符（Codex 协作）
- 自动重 patch 机制改进：使用 PATCH_REVISION（SHA256）检测插件规则变更（Codex 协作）
- 添加基础测试（Codex 协作）

### 变化

- 翻译条目：1509 → 1463（删除 46 条危险的短翻译）
- patch 覆盖：1485 → 1443 处

## [2.0.2] - 2026-04-09

### 新增

- 翻译表从 759 条扩展到 **1509 条**（+750 条），patch 覆盖从 746 提升到 **1485 处**
- 新增覆盖：对话框提示和确认消息（"Do you want to allow..."、"Would you like to..."等）
- 新增覆盖：状态消息（加载中、连接中、验证中、搜索中等 40+ 条）
- 新增覆盖：Agent/计划模式 UI 文本（计划审批、用户拒绝/批准、退出计划模式等）
- 新增覆盖：Hook 相关提示（Hook 配置禁用、Hook 返回阻断错误、Hook 受策略限制等）
- 新增覆盖：会话管理界面（恢复会话、加载会话、传送会话等）
- 新增覆盖：插件/市场操作提示（添加市场、加载插件、安装确认等）
- 新增覆盖：统计页面标签（活跃天数、最长会话、最长连续等）
- 新增覆盖：快捷键和导航提示（Type to filter、Tab to switch focus等）
- 新增覆盖：/compact 压缩对话相关翻译（26 条）
- 新增覆盖：/btw 和 /clear 完整提示翻译
- 新增覆盖：8 条完整 Press 句子翻译（替代短翻译 "Press "）

### 修复

- 修复 SyntaxError 导致 Claude Code 无法启动：batch3 新增的 46 条短翻译（`Type`、`Error:`、`Run` 等）在双引号内匹配到代码标识符，导致 `TypeError` → `类型Error`、`SuppressedError` → `Suppressed错误`（本会话修复：删除危险翻译；Codex 协作：重写 patch-cli.js 字符串解析器增加防护层）
- 自动重 patch 机制改进：使用 PATCH_REVISION（SHA256）检测插件规则变更，而非仅检测版本号（Codex 协作）
- patch-cli.js 重写：新增 `scanDoubleQuotedLiterals()` 安全解析器，防止翻译匹配到代码标识符（Codex 协作）
- 添加基础测试（patch-cli.test.js、plugin-payload.test.js、session-start-hook.test.js）（Codex 协作）

## [2.0.1] - 2026-04-08

### 修复

- 修复 /btw 提示翻译缺失：原翻译表只覆盖了短标签，未覆盖完整提示句子
- 修复 "Press up to edit queued messages" 部分翻译问题：移除短翻译 "Press " → "按 "，改为完整句子翻译
- 移除导致部分翻译的短通用翻译 "Press "，新增 8 条完整 "Press ..." 句子翻译
- 新增覆盖：/btw 完整提示、导航键说明、多行消息快捷键、安装完成提示等
- 翻译表从 753 条优化为 **759 条**（去重后），patch 总数从 738 提升至 **746 处**
- 修复重复翻译条目（"Auto-allow mode:" 和 "built-in (macOS)" 各去重一条）

## [2.0.0] - 2026-04-08

### 重大更新

- 翻译表从 322 条扩展到 **753 条**（+431 条），patch 总数达 **738 处**
- 新增覆盖：所有 createElement 渲染的用户可见 UI 文字（提示、说明、状态、警告等）
- 新增覆盖：首次启动安全检查提示（"安全检查：这是你自己创建或信任的项目吗？"）
- 新增覆盖：配置说明、Hook 说明、Agent 创建提示、Marketplace 操作提示等
- patch-cli.js 新增拆分字符串 patch（minifier 在 ' 处拆分的字符串）
- 兼容 2.1.92 / 2.1.94 / 2.1.96 三个版本

## [1.3.1] - 2026-04-08

### 新增

- 翻译表从 310 条扩展到 **322 条**（+12 条）
- 新增覆盖：权限对话框（"此命令需要批准"、"我信任这些设置"等）
- 新增覆盖：接受条款提示（Help improve Claude ON/OFF）
- 新增覆盖：系统辅助功能提示、插件安装提示

### 修复

- 兼容 2.1.92 和 2.1.94：同时保留 `Answering...` 和 `Answering…` 两条翻译
- 版本号和文档与实际翻译数同步

## [1.3.0] - 2026-04-08

### 新增

- 翻译表从 136 条扩展到 **310 条**（+174 条），patch 总数从 139 提升到 **313**
- 新增覆盖：设置页面（主题、权限、通知、思考模式、自动更新等 20+ 项）
- 新增覆盖：MCP 管理页面（项目/用户/本地/企业/内置 MCP、工具查看等）
- 新增覆盖：Agent 管理页面（用户/项目/本地/托管/插件/内置 Agent、编辑/删除等）
- 新增覆盖：对话框选项（恢复对话、worktree 管理、远程控制、GitHub Actions 等）
- 新增覆盖：状态消息（验证会话、获取日志、切换分支等）
- 安全过滤：27 条短通用词和标识符子串被排除（Save、Cancel、Continue、Theme、Model 等）

## [1.2.4] - 2026-04-07

### 修复

- **patch-cli.js 重写**：抛弃段解析器，改为逐条正则匹配方案
  - 旧段解析器无法安全区分正则字面量和除法运算符，导致 `"application/json"` 等字符串中的 `/` 被吞掉（文件损坏），或 8689 个正则内的 `"` 干扰字符串配对（90/136 翻译失败）
  - 新方案对每条翻译构建 `/"...en..."/g` 正则，在双引号字符串内替换
  - 正则字面量中的 `"` 通过 offset 检查排除（`/"Error"/` 不会被误改）
  - 在 Claude Code 2.1.92 原始文件上实测：139 处 patch（136 条翻译 + 3 条特殊 patch），全部生效
  - 已知局限：不翻译反引号模板中的文本；正则/除法歧义无法完全消除，但对 2.1.92 实测无标识符污染

## [1.2.3] - 2026-04-07

### 改进

- 翻译表从 63 条恢复到 **136 条**：重新验证 v2.1.92 中实际存在的字符串
- 移除 72 条危险短通用词（Error、Cancel、Continue 等会污染代码标识符）
- 移除 350 条 v2.1.92 中已不存在的过时翻译
- 新增覆盖：欢迎页、登录流程、计划模式、MCP 设置、权限管理等 UI 文字

## [1.2.2] - 2026-04-07

### 修复

- **段解析器重写**：修复 v1.2.1 段解析器的两个致命 bug：
  - Bug #1：解析器处理单引号 `'` 时，把 `We're` 中的撇号当成字符串开始，导致从文件头部就失步，把 3327 个代码段误判为字符串
  - Bug #2：正则表达式字面量中的 `"` 导致引号配对失步
  - 修复：只处理双引号 `"`（混淆后的 cli.js 几乎只用双引号作为字符串引号）
- **翻译表精简**：从 488 条精简到 63 条——移除 v2.1.92 中不存在的 350 条过时翻译 + 72 条危险短通用词
- **计数修复**：只在实际改变文件内容时才输出非零计数，no-op 条目（en===zh）不计入
- **写入保护**：如果 patch 后文件和原始文件完全一致，不执行写入操作

## [1.2.1] - 2026-04-07

### 修复

- **紧急修复**：v1.2.0 的全局字符串替换会污染 JS 代码标识符（如 `TypeError → Type错误`、`toLowerCase → to低erCase`），导致 Claude Code 无法启动
- 新增 `patch-cli.js`，使用 JS 源码段解析器，只替换字符串字面量内的文字
- 移除危险翻译（短通用词和标识符子串）

## [1.2.0] - 2026-04-07

### 新增

- **UI 文字全量中文化**：569 条 cli.js 硬编码英文翻译为中文
  - 状态消息（加载中…、运行中…、搜索中…、处理中…等）
  - 按钮文字（接受、取消、继续、保存、禁用、启用等）
  - 错误提示（错误：、网络错误、未知错误等）
  - 设置页面（设置、模型、主题、语言、权限等）
  - 导航和快捷键说明
  - 对话框和确认提示
  - 权限请求（允许、拒绝）
  - 计划模式、Agent、MCP 等高级功能 UI
- `cli-translations.json` 翻译对照表（英文→中文，JSON 格式易于维护）
- Windows (WSL) 兼容性：install.sh 自动检测 WSL 环境
- Windows (WSL) 兼容性：patch-cli.sh 处理 NTFS 上 renameSync 限制

### 改进

- patch-cli.sh 改为从 `cli-translations.json` 读取翻译，不再硬编码
- 翻译按字符串长度降序替换，避免短字符串先被替换导致长字符串匹配失败
- README 更新：Windows/WSL 使用说明，覆盖表简化
- install.sh 添加 WSL 环境检测提示

## [1.1.0] - 2026-04-03

### 新增

- Hook 运行提示中文化（5 条）：运行预压缩 Hook…、运行压缩后 Hook…、运行会话启动 Hook…、运行停止 Hook…、运行 ${event} Hook
- Hook 计数中文化（2 条）：1 个 Hook…、3 个 Hook…
- 后台代理提示中文化（1 条）：所有后台代理已停止
- /compact 压缩对话提示中文化（1 条）：压缩对话中…
- CLI Patch 总数从 7 提升至 17

### 改进

- Hook 相关术语保留英文（Hook 而非"钩子"），与 API、PR 等技术术语处理一致
- README 覆盖表新增 Hook 运行提示、Hook 计数、后台代理提示、/compact 提示

## [1.0.0] - 2026-03-29

### 首个正式版本

- AI 回复语言 → 中文（`language: Chinese`）
- 187 个趣味 Spinner 动词翻译（光合作用中、蹦迪中、搞事情中…）
- 41 条中文 Spinner 提示
- 会话启动 Hook — 中文上下文注入
- 通知 Hook — 6 条中文翻译（频率限制、Token 限额、会话过期等）
- Chinese Output Style
- CLI Patch（内容匹配，跨版本稳定）：
  - 回复耗时动词（8 个：琢磨了、忙活了、烘焙了…）
  - 时间单位中文化（天、时、分、秒）
  - 去掉耗时连接符（"Worked for" → 空格）
  - /btw 提示中文化
  - /clear 提示中文化
  - Tip 前缀 → 💡
- 自动重 patch 机制 — Claude Code 更新后首次会话自动修复
- install.sh 一键安装
- uninstall.sh 精准卸载（不丢用户配置）
- 版本校验的备份机制
