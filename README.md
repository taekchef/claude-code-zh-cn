<div align="center">

# claude-code-zh-cn

**Claude Code 简体中文本地化插件**

让终端里的 AI 编程助手，终于会说人话。

**一条命令，把 Claude Code 的终端界面、等待提示、系统通知和默认回复切换为简体中文。**

187 个趣味 spinner 动词，41 条中文提示，回复耗时中文化；另有 2070 条界面翻译。

> 🚀 **姊妹项目：**[codex-code-zh-cn](https://github.com/taekchef/codex-code-zh-cn) 也上线了。它把 Codex CLI 做成简体中文版，同样支持直接启动中文界面，以及会话内 `/chinese`、`/english` 切换。

[![GitHub](https://img.shields.io/badge/GitHub-taekchef%2Fclaude--code--zh--cn-blue?logo=github)](https://github.com/taekchef/claude-code-zh-cn)
[![官方网站](https://img.shields.io/badge/官方网站-GitHub%20Pages-222?logo=githubpages)](https://taekchef.github.io/claude-code-zh-cn/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
<!-- readme-support-window:badges:start -->
[![npm](https://img.shields.io/badge/npm-2.1.92--2.1.112-green)](./docs/support-matrix.md)
[![macOS native](https://img.shields.io/badge/macos%20native-2.1.113--2.1.226-green)](./docs/support-matrix.md)
[![Linux native](https://img.shields.io/badge/linux%20native-2.1.220--2.1.220-green)](./docs/support-matrix.md)
[![Windows native](https://img.shields.io/badge/windows%20native-2.1.113--2.1.233-green)](./docs/support-matrix.md)
<!-- readme-support-window:badges:end -->
[![Version](https://img.shields.io/github/v/tag/taekchef/claude-code-zh-cn?label=Version&color=blue)](https://github.com/taekchef/claude-code-zh-cn/releases)
[![Codex 中文版](https://img.shields.io/badge/Codex%20中文版-codex--code--zh--cn-blue)](https://github.com/taekchef/codex-code-zh-cn)

**macOS · Linux · WSL · Windows**

**一行远程安装 · Claude Code 更新后自动处理 · 卸载不碰其他配置**

</div>

---

## 先看这里

不需要先研究实现原理。已经装好 Claude Code 的 macOS、Linux 或 WSL 用户，复制下面这行，重启 Claude Code 就行：

```bash
curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/install-remote.sh | bash
```

看到“思考中”“光合作用中”之类的中文提示，就说明最常用的中文化已经生效。还没有 `claude` 命令？请先安装官方 [Claude Code](https://github.com/anthropics/claude-code)。

| 你现在想做什么 | 直接去这里 |
|---|---|
| 先看实际效果 | [效果预览](#preview) |
| 30 秒装好 | [快速安装](#quick-install) |
| 在中文与英文间即时切换 | [会话内切换语言](#switch-language) |
| 恢复英文或完整卸载 | [恢复英文](#back-to-english) |
| 判断自己的版本能汉化到什么程度 | [支持与兼容性](#support) |
| spinner 仍是英文、或安装报错 | [验证与诊断](#verify) |
| 了解它到底改了什么 | [覆盖范围与安全边界](#coverage) |

<a id="preview"></a>

## 效果预览

![Claude Code 中文本地化演示](./docs/assets/claude-code-zh-cn-demo.gif)

> **真实 Ghostty 录制。**同一台 Mac、同一个 Claude Code `2.1.211`，先运行安装前备份的原版可执行文件，再运行当前中文补丁版。动图只做缩放与前后切换，没有重绘或仿造终端内容。

```text
安装前
⠙ Photosynthesizing...

  Tip: Press Shift+Tab to switch between default, auto-accept edits, and plan modes

安装后
⠙ 光合作用中...

  💡 按 Shift+Tab 在默认模式、自动接受编辑模式和 Plan 模式之间切换
```

它不只是把 `Thinking` 换成“思考中”。原版那些一本正经胡说八道的 spinner 也保留了味道：

```text
⠙ 蹦迪中...          ⠙ 七荤八素中...         ⠙ 搞事情中...
⠙ 瞎忙活中...        ⠙ 花里胡哨中...         ⠙ 变魔术中...

  琢磨了 1分23秒
```

装完即用：默认中文回复、中文 spinner、中文提示、中文耗时与通知会一起到位；更深层的 CLI 界面文字会在安全检查通过后继续补齐。

<a id="quick-install"></a>

## 快速安装

### 选一种适合你的方式

| 使用场景 | 建议方式 | 适用平台 |
|---|---|---|
| 已有 `claude`，想最快装好 | [一行远程安装](#remote-install) | macOS、Linux、WSL |
| 希望由 Claude Code 插件管理器维护 | [插件市场安装](#marketplace-install) | macOS、Linux、Windows |
| 修改翻译、离线使用或调试脚本 | [本地源码安装](#source-install) | macOS、Linux、WSL、Windows |

<a id="remote-install"></a>

### 一行远程安装

```bash
curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/install-remote.sh | bash
```

这会下载**已发布的 Release**，执行与仓库内 `install.sh` 相同的安装逻辑；不需要保留本地 clone。安装器会优先把项目登记为正式插件，当前 CLI 不支持正式注册时，才启用等价的独立 Hook 兜底。安装前会备份原文件；补丁、重打包或启动自检任一步失败时，原文件会被保留或恢复，对应界面文字保持英文，不影响 Claude Code 启动。

<a id="marketplace-install"></a>

### 插件市场安装

如果你习惯用 Claude Code 的标准插件流，执行下面两行。安装后**重启一次 Claude Code**，`session-start` Hook 会合并中文设置，并在适配条件满足时 patch 硬编码文字（2070 条翻译；代表版本 `2.1.112` 实测 1699 处有效 patch）。

```bash
claude plugin marketplace add --scope user https://github.com/taekchef/claude-code-zh-cn
claude plugin install claude-code-zh-cn@claude-code-zh-cn --scope user
```

安装后还可以在 Claude Code 里说“帮我运行 `zh-cn-setup`”。这个检查入口会补齐安全的 settings 配置，报告 CLI Patch 与 CC Switch 状态；对于不能在当前进程内安全完成的操作，它会给出可直接复制的终端命令。

> **spinner 或界面还是英文？**先重启一次；仍未生效时，可运行 `zh-cn-setup`，或手动执行：
>
> ```bash
> node "${CLAUDE_PLUGIN_ROOT}/skills/zh-cn-setup/scripts/setup.js"
> ```
>
> 它只补齐缺失的 spinner 配置，绝不覆盖你已有的手动设置；还会检测并在你授权后同步 CC Switch 的通用配置，输出 Skill 描述汉化的预览与执行命令。

Skill 描述默认不会自动改写。原因很简单：同一个 `description` 既显示在菜单里，也参与模型判断是否触发 Skill。先按 `zh-cn-setup` 输出的 `--dry-run` 命令核对范围，再决定是否翻译。CC Switch 管理的 Skill 若不在 `~/.claude` 下，用 `ZH_CN_SKILL_I18N_EXTRA_ROOTS` 传入真实目录；Windows 用分号分隔，macOS/Linux 用冒号分隔。译文保留英文备份，可用 `node "${CLAUDE_PLUGIN_ROOT}/skill-i18n/restore.js" --all` 还原。

如果 CC Switch 数据库里的 Skill 描述仍是英文，`ZH_CN_SKILL_I18N_EXTRA_ROOTS` 只能翻译 `SKILL.md` 本体，不会写入 `~/.cc-switch/cc-switch.db`。检测到这种情况时，`zh-cn-setup` 会提示运行可选工具 `cc-switch-descriptions.js`：默认只读预览，只有加 `--apply` 才写数据库；写入前会自动备份，并输出还原命令。

<a id="source-install"></a>

### 本地源码安装与 Windows 原生安装

想改翻译、离线使用或排查安装脚本时，克隆仓库后运行安装器：

```bash
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
./install.sh
```

Windows 原生 PowerShell 用户使用同一份源码，但运行 `install.ps1`。它会完成正式插件注册、依赖检查、settings 合并、CLI Patch 与失败回滚；需要 PowerShell 5.1+（Windows 10/11 自带）。

```powershell
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
```

> **Windows native `.exe` 用户：**若 Claude Code 为 `2.1.113+` 的原生 `.exe`，CLI Patch 需要先执行 `npm install -g node-lief`。没装时只会跳过 Layer 4 CLI Patch；spinner、设置、Hook 与插件功能不受影响。Claude Code 更新后，先关闭所有 Claude Code 窗口，再回到仓库目录重跑 `install.ps1`；Windows 不会现场改写被系统锁定的运行中 `.exe`。

### 安装方式与中文化程度

<!-- readme-support-window:install-advice:start -->
| 安装方式 | 中文化程度 |
|---------|-----------|
| `npm install -g @anthropic-ai/claude-code@2.1.112` | 最完整（推荐） |
| `npm install -g @anthropic-ai/claude-code`（latest） | macOS / Windows native 新版先本机自检；Linux native 仅启用已发布窗口 |
| `curl -fsSL https://claude.ai/install.sh \| bash -s 2.1.112` | 官方安装器指定已验证旧版本（需要 `node-lief`） |
| `curl -fsSL https://claude.ai/install.sh \| sh`（latest） | macOS 新版先本机自检；Linux native latest 只保留 Layer 1~3 |
| `curl -fsSL https://claude.ai/install.sh \| bash -s 2.1.220` | Linux x64 glibc 已验证版本（需要 `node-lief >=1.3.0`）；不含 arm64、musl 或 latest |
| `powershell -File install.ps1` | Windows：旧 npm cli.js 最完整；native .exe `2.1.113 - 2.1.233` 内已验证版本需 `node-lief`；Claude 更新后关闭所有窗口并重跑 |

> **native binary 说明**：官方安装器和新版 npm 包装到的是 native 二进制。插件会提取其中的 JS → 翻译 → 写回，并做启动自检；补丁、重打包或自检失败会恢复原文件。macOS arm64 已验证 `2.1.113 - 2.1.226` 内的版本（完整清单见[支持矩阵](./docs/support-matrix.md)）；更高版本也会本机自检，需要 `node-lief`。Linux x64 glibc 仅启用 `2.1.220`，需要 `node-lief >=1.3.0`，不尝试 provisional latest。macOS 可在新会话安全补丁；Windows 不热改运行中的 exe，更新后需关闭窗口并重跑 `install.ps1`。

安装脚本会自动检测安装方式，无需手动选择。
<!-- readme-support-window:install-advice:end -->

<a id="switch-language"></a>

## 会话内切换语言

从 v2.12.0 开始，装好以后直接在 Claude Code 输入框里输入命令并回车：

| 命令 | 结果 |
|---|---|
| `/chinese` 或 `/zh` | 写入中文设置、启用中文 spinner 与提示，并重新 patch CLI 文案。 |
| `/english` 或 `/en` | 移除中文设置，并从备份还原 CLI 原文。 |

命令由 `UserPromptSubmit` Hook 截获处理，**不消耗 token**，结果立即显示。语言设置与 spinner 内容会即时更新；硬编码界面文字需要重启 Claude Code 后才会完全切换。

<a id="back-to-english"></a>

## 恢复英文或完整卸载

只是要对照英文教程？直接输入 `/english`，不必卸载。需要恢复中文时，再输入 `/chinese` 即可。

想彻底移除本插件，macOS、Linux 或 WSL 的远程安装用户运行：

```bash
curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/uninstall-remote.sh | bash
```

本地源码安装用户运行 `./uninstall.sh`。Windows 用户应先关闭所有 Claude Code 窗口；如本机没有保留项目目录，重新下载源码后执行：

```powershell
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1
```

卸载会还原 CLI 备份，移除中文设置、Hook 与插件注册，其他 Claude Code 配置保持不动。重启后即回到英文界面。

> 卸载器无法判断 `language`、`spinnerTipsEnabled`、`spinnerTipsOverride`、`spinnerVerbs` 是插件写入还是你手动维护，因此会统一移除。若你手动配置过这些字段，请先备份需要保留的值。
>
> 若安装时同意同步 CC Switch 的 Claude 通用配置，还需在 CC Switch 的“通用配置”中移除同一组字段；否则下次切换供应商时可能再次写回。若字段原本由你手动维护，请暂时关闭“写入通用配置”，不要直接删除。

<a id="coverage"></a>

## 覆盖范围与安全边界

Claude Code 的界面文字主要硬编码在一个约 13MB 的 `cli.js`，或新版 native 二进制内嵌的 JS 中，并没有现成的 i18n 基础设施。因此这个项目不承诺“翻一把就永远不坏”，而是把稳定功能与可能随上游变化的深度补丁分层处理。

| 能力 | 覆盖内容 | 由什么保证 |
|---|---|---|
| AI 回复语言 | 默认中文回复 | `language: Chinese` |
| Spinner 动词 | 187 个 | `spinnerVerbs` |
| Spinner 提示 | 41 条 | `spinnerTipsOverride` |
| 中文上下文与更新检查 | 会话启动时注入 | `SessionStart` Hook |
| 通知 | 6 条通知翻译 | `Notification` Hook |
| 输出风格 | Chinese Output Style | Claude Code 插件系统 |
| UI 文字中文化 | 2070 条翻译，`2.1.112` 实测 1699 处有效 patch | CLI Patch + 显示面审计 |
| 语言切换 | `/chinese`、`/english` | `UserPromptSubmit` Hook |
| 更新处理 | 版本变化后重新检查 Patch | 版本检测与启动自检 |

这套设计的底线是：**中文化不应该把你的 Claude Code 搞坏。**安装前先备份；每一条翻译都独立匹配，匹配不到就保留英文；npm 路径做 JS 语法校验，native 路径还要经过提取、重打包与真实 `--version` 启动自检。任何一环失败，都保留或恢复原文件。失败记录会写入插件目录的 `patch.log`，可由 doctor 读取。

### 187 个趣味动词，味道保留

原版 Claude Code 有一批故意搞怪的英文 spinner。这里不把它们翻成毫无灵魂的“处理中”，而是尽量保留原味：

| 英文 | 中文 | 英文 | 中文 |
|---|---|---|---|
| `Thinking` | 思考中 | `Moonwalking` | 太空步中 |
| `Photosynthesizing` | 光合作用中 | `Flibbertigibbeting` | 叽里呱啦中 |
| `Discombobulating` | 七荤八素中 | `Whatchamacalliting` | 那个啊来着中 |
| `Shenaniganing` | 搞事情中 | `Razzmatazzing` | 花里胡哨中 |
| `Boondoggling` | 瞎忙活中 | `Prestidigitating` | 变魔术中 |
| `Clauding` | 克劳丁中 | `Boogieing` | 蹦迪中 |
| `Canoodling` | 腻歪中 | `Spelunking` | 探洞中 |

> 完整 187 个翻译见 [verbs/zh-CN.json](./verbs/zh-CN.json)

<a id="support"></a>

## 支持与兼容性

下面是**已验证的支持窗口**，不是把版本号当作运行门禁。macOS 与 Windows 的可识别新版 native 二进制会先在本机做临时提取、翻译、重打包和启动自检；通过才替换。Linux 则只启用已发布的验证版本。完整证据与逐版本记录始终以 [支持矩阵](./docs/support-matrix.md) 为准。

<!-- readme-support-window:support-systems:start -->
| 平台 / 安装形态 | 已验证版本窗口 | 说明 |
|------|-----------|------|
| macOS / Linux / WSL · npm 全局安装 | `2.1.92 - 2.1.112` | 翻译最完整；launcher 启动前自修复 + `session-start` 兜底 |
| macOS · 官方安装器（native） | `2.1.110 - 2.1.112` | 需要 `node-lief` |
| macOS · native binary（arm64） | `2.1.113 - 2.1.226` 内的已验证版本 | 需要 `node-lief`；个别版本未收录，见支持矩阵 |
| Linux · native binary（x64 glibc） | `2.1.220 - 2.1.220` | 需要 `node-lief >=1.3.0`；仅该版本，不含 arm64、musl 或 latest |
| Windows · npm（PowerShell） | `2.1.92 - 2.1.112` | 用 install.ps1，需 PowerShell 5.1+ |
| Windows · native .exe（x64） | `2.1.113 - 2.1.233` 内的已验证版本 | 需要 `node-lief`；个别版本未收录，见支持矩阵 |
| Linux · 其他官方安装器形态 | 暂无已验证版本 | 仅 Layer 1~3 生效 |

> - **macOS / Windows 版本号不是运行门禁**：高于已知 native 下限、且仍能被识别的新版会先在本机临时提取、翻译、重打包并执行启动自检；通过后才替换。已有词条继续中文，新文案原样保留英文。
> - **Linux 不走 provisional**：Linux x64 glibc 仅启用已发布的 `2.1.220`；arm64、musl 和 latest 不执行 CLI Patch。
> - **失败不伤 CLI**：补丁、重打包或启动自检任一步失败，都会保留或恢复原文件；失败只影响中文覆盖，不影响 Claude Code 使用。
> - **Windows 不热改运行中的 exe**：Claude Code 更新后先保持原版可用；关闭所有 Claude Code 窗口，再按 Windows 安装命令重跑 `install.ps1`，由安装器补丁并自检。
> - **格式变化才停手**：如果未来版本不再是可识别的 native 格式、依赖缺失、提取失败或启动自检失败，只跳过 Layer 4，Layer 1~3 继续生效。
> - **矩阵只记录证据**：纯上游兼容证据可以更新支持矩阵，不要求插件升版；只有插件代码、翻译或 manifest 变化才发布新版。
> - **已验证版本完整清单**（含个别未收录版本）见 [docs/support-matrix.md](./docs/support-matrix.md)，由脚本自动生成。
> - Claude Code 从 `2.1.113` 起 npm 主包切换为 native binary，不再包含旧的 `cli.js`；要最完整的翻译请用 `npm install -g @anthropic-ai/claude-code@2.1.112`。
<!-- readme-support-window:support-systems:end -->

正式安装态由 Claude Code 插件管理器更新；旧环境的独立兜底安装只跟随本插件已发布的 Release，不会跟随 `main` 上未发布的提交。Claude Code 本体的自动更新策略仍由 Claude Code 自己的 `DISABLE_AUTOUPDATER` / `DISABLE_UPDATER` 控制。

<a id="verify"></a>

## 验证、诊断与更新

### 验证是否安装成功

重启 Claude Code 后随便发送一个请求。spinner 显示“思考中”“光合作用中”等中文，代表 Layer 1~3 已生效。想确认深度 UI Patch，或遇到界面仍是英文时，运行 doctor：

```bash
./doctor.sh                                            # macOS / Linux / WSL，在仓库目录中
bash ~/.claude/plugins/claude-code-zh-cn/bin/doctor    # 只保留已安装插件时
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\doctor.ps1   # Windows
```

加 `--json` 获取机器可读输出；退出码 `0` 表示无阻塞项，`1` 表示需要处理。若是 403、空响应、`ECONNREFUSED` 等请求错误，而不是界面仍为英文，可以把原始报错交给 doctor 分流：

```bash
./doctor.sh --runtime-error 'API returned an empty or malformed response (HTTP 200)' --json
```

这类问题通常出在 provider、代理或网关链路，不等于汉化失效。

### Claude Code 或插件更新后怎么办

npm 与 macOS native 安装会在首次会话启动时检测版本变化，并重新检查 Patch；新版先在本机自检，只有格式、依赖、提取或自检失败才跳过原生 Layer 4。Windows native 保持原版可用，待你关闭窗口并重跑 `install.ps1` 后再补丁。

插件本体发布新 Release 后，正式安装态由插件管理器更新。独立兜底安装只做限时检查并提示，不会在会话启动中原地覆盖自身；本地源码用户在会话结束后执行 `git pull && ./install.sh`，Windows 则 `git pull` 后重跑 `install.ps1`。

## 高级功能：Skill 与插件命令说明自动汉化

除了 CLI 本身，本插件还可以把用户安装的 Skill 与插件 `/` 命令说明翻成简体中文。它是**独立且默认关闭**的管道：设置 `ZH_CN_SKILL_I18N_ENABLE=1` 后，SessionStart Hook 才会后台增量扫描；不设置就不会运行，也不消耗 token 或额度。

| 需要知道的事 | 说明 |
|---|---|
| 会改哪些内容 | `~/.claude/` 下 Skill 的 `SKILL.md`、Command 的 `.md`，以及插件 `plugin.json`、`marketplace.json` 的 `description`。 |
| 是否可逆 | 原文备份到 `description_en`（JSON 为 `_description_en`）；执行 `node plugin/skill-i18n/restore.js --all` 可一键还原，卸载时也会自动还原。 |
| 对触发的影响 | `description` 同时用于菜单显示和模型自动触发 Skill；翻译可能影响触发判断，因此默认禁用。 |
| 翻译引擎 | 默认调用 `claude` CLI；也可配置 OpenAI 或 Anthropic 兼容 API。 |
| CC Switch 等额外目录 | 使用 `ZH_CN_SKILL_I18N_EXTRA_ROOTS` 指定；Windows 用 `;`，macOS/Linux 用 `:` 分隔。 |

建议先预览，不满意随时还原：

```bash
# 扫描并预览，不改写任何文件
bash plugin/skill-i18n/translate-skills.sh --root ~/.claude --dry-run

# 确认后翻译
bash plugin/skill-i18n/translate-skills.sh --root ~/.claude

# 还原全部英文描述
node plugin/skill-i18n/restore.js --all
```

完整的环境变量、API 配置、扫描范围、符号链接策略与可靠性设计，见 [Skill / 插件命令说明自动汉化](plugin/skill-i18n/README.md)。Claude Code 自带命令（如 `/help`）不走这条管道，仍由 CLI Patch 处理。

## 它是怎么工作的

<details>
<summary><b>展开查看四层架构与优雅降级</b></summary>

项目将稳定能力和高风险的二进制改写分开处理：

| 层 | 做什么 | 更新后的表现 |
|---|---|---|
| Layer 1：内置设置 | `language`、`spinnerTipsOverride`、`spinnerVerbs` | 稳定，不因 CLI 更新丢失。 |
| Layer 2：Hook 系统 | `SessionStart` 注入中文上下文、检查更新并检测重 patch；`Notification` 翻译通知。 | 稳定，不因 CLI 更新丢失。 |
| Layer 3：插件系统 | 标准 Claude Code 插件与 Chinese Output Style。 | 稳定，不因 CLI 更新丢失。 |
| Layer 4：CLI Patch | 扫描真实双引号字符串 token，按长度降序替换 `cli-translations.json` 中的文案。 | 自动维护；失败时优雅降级为英文。 |

Layer 4 会显式排除注释、模板字符串与正则字面量中的 `"`，避免误改代码结构；每条翻译独立处理，单条匹配不到不影响其他文本。每次重新 patch 都会先从同版本的干净备份开始，避免 patch 叠 patch；失败原因留在 `patch.log`，doctor 可读取。

```text
Layer 1~3：始终可用，不怕上游更新
Layer 4：能安全 patch 就继续中文；不能就只让那部分显示英文
```

</details>

## 自定义翻译

动词和提示各有唯一数据源。想让“光合作用中”换成你的口头禅，只编辑对应 JSON，然后重新安装即可：

```bash
vim tips/zh-CN.json      # spinner 提示
vim verbs/zh-CN.json     # spinner 动词
./install.sh
```

不要把动词或提示复制进 `settings-overlay.json`；安装器会从这两个 JSON 动态组装 settings，避免多处维护。

## 常见问题

<details>
<summary><b>Claude Code 更新后会失效吗？会把 CLI 弄坏吗？</b></summary>

Layer 1~3 不受影响。Layer 4 会检测版本变化，并只翻译仍能精确匹配的文案；新版未知文字保持英文。npm Patch 必须通过语法校验，native Patch 还必须通过提取、重打包和真实启动自检；失败就保留或恢复原文件。验证证据见 [支持矩阵](./docs/support-matrix.md)。

这不表示本插件能阻止 Claude Code 自己更新。`DISABLE_AUTOUPDATER` / `DISABLE_UPDATER` 是否生效，请以 `claude doctor` 的 Updates 段为准。

</details>

<details>
<summary><b>插件更新后需要重新安装吗？</b></summary>

通常不需要。正式注册的插件由 Claude Code 插件管理器限频检查并更新；旧环境的独立兜底态只检查已发布 Release。两种方式都不跟随 `main` 上尚未发布的开发提交。纯上游兼容证据也不要求插件同步发版；只有代码、翻译或 manifest 变化才会发布新版。

</details>

<details>
<summary><b>用 CC Switch 切换供应商后，中文设置又被覆盖了怎么办？</b></summary>

这是 CC Switch 重写了 `~/.claude/settings.json`。重新运行安装器，看到提示后选择同步 Claude 通用配置；安装器只会在你同意后修改 CC Switch 本地数据库，并会先备份。非交互环境可显式授权：

```bash
ZH_CN_CCSWITCH_SYNC=1 ./install.sh
```

```powershell
$env:ZH_CN_CCSWITCH_SYNC = "1"; .\install.ps1
```

也可以在 CC Switch 编辑 Claude 供应商，打开“编辑通用配置”，点击“从编辑内容提取”并保存；确认要切换的供应商勾选了“写入通用配置”。

</details>

<details>
<summary><b>支持哪些系统？能用 WSL 吗？</b></summary>

支持 macOS、Linux、Windows，以及 WSL。Windows 可用 PowerShell 5.1+ 的 `install.ps1`，也可以在 WSL 中运行 `install.sh`。CLI Patch 需要 Node.js；`jq` 用于更精确的 JSON 合并，是可选依赖；只有支持矩阵列出的原生二进制补丁路径才需要 `node-lief`（Linux 仅 x64 glibc 的 `2.1.220`，macOS 与 Windows 见各自已验证窗口）。具体版本边界见上方[支持与兼容性](#support)。

</details>

<details>
<summary><b>这和 VS Code 扩展中文化有什么区别？</b></summary>

本项目本质上是**终端 CLI** 的中文化，不依赖 VS Code。[zstings/claude-code-zh-cn](https://github.com/zstings/claude-code-zh-cn) 做的是 Claude Code VS Code 扩展的汉化；两者互补。

</details>

## 参与贡献

欢迎 PR，也欢迎把不顺手的地方讲清楚。翻译改进请修改 `tips/zh-CN.json` 或 `verbs/zh-CN.json`；新功能可以扩展 Hook 或 output style。遇到 Bug、漏翻或本地不生效，请提交[诊断 Issue](https://github.com/taekchef/claude-code-zh-cn/issues/new?template=localization-not-effective.yml)，并附上 `doctor --json` 输出、安装方式、Claude Code 版本与关键路径。这样比一句“没用”更容易被真正解决。

## 许可证

[MIT](./LICENSE)

## 姊妹项目

- [**codex-code-zh-cn**](https://github.com/taekchef/codex-code-zh-cn) — Codex CLI 简体中文本地化扩展：PTY 实时汉化终端界面、状态动词与提示，并启用桌面版中文语言。

## 致谢

- UI 字符串提取自 [Claude Code](https://github.com/anthropics/claude-code)。
- 灵感来自 [zstings/claude-code-zh-cn](https://github.com/zstings/claude-code-zh-cn) 的 Claude Code VS Code 扩展汉化。

---

## English

**claude-code-zh-cn** is a Simplified Chinese localization plugin for [Claude Code CLI](https://github.com/anthropics/claude-code). It translates 187 spinner verbs, 41 spinner tips, 2070 UI translations, notification messages, and more. Start with the command below, then restart Claude Code:

```bash
curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/install-remote.sh | bash
```

On unverified CLI versions, unmatched strings stay in English. If a patch, repack, or startup check fails, the original CLI is preserved or restored. Detailed version evidence is in [docs/support-matrix.md](./docs/support-matrix.md). PRs and issues are welcome.

---

*本项目不是 Anthropic 官方产品。Claude Code 是 Anthropic Inc. 的商标。*
