<div align="center">

# claude-code-zh-cn

**Claude Code 简体中文本地化插件**

让终端里的 AI 编程助手说中文 🇨🇳

[![GitHub](https://img.shields.io/badge/GitHub-taekchef%2Fclaude--code--zh--cn-blue?logo=github)](https://github.com/taekchef/claude-code-zh-cn)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
<!-- readme-support-window:badges:start -->
[![npm](https://img.shields.io/badge/npm-2.1.92--2.1.112-green)](./docs/support-matrix.md)
[![macOS native](https://img.shields.io/badge/macos%20native-2.1.113--2.1.211-green)](./docs/support-matrix.md)
[![Windows native](https://img.shields.io/badge/windows%20native-2.1.113--2.1.211-green)](./docs/support-matrix.md)
<!-- readme-support-window:badges:end -->
[![Version](https://img.shields.io/github/v/tag/taekchef/claude-code-zh-cn?label=Version&color=blue)](https://github.com/taekchef/claude-code-zh-cn/releases)

**一行远程安装 · 更新后自动修复 · 卸载不丢配置**

</div>

---

## 为什么做这个？

Claude Code 是一个很棒的终端 AI 编程助手，但它没有中文界面。UI 文字主要硬编码在一个 13MB 的 `cli.js` 里，没有 i18n 基础设施。

官方短期内不太可能加中文支持。所以我做了这个插件，通过四层机制（设置注入 + Hook 系统 + 插件系统 + CLI Patch）实现中文化，**自动检测安装方式，更新后自动修复**。遇到还没验证过的新版本也不怕：插件会自动降级——翻不了的部分保持英文，CLI 绝不会坏。

## 效果预览

**安装前：**

```
⠙ Photosynthesizing...

  Tip: Press Shift+Tab to switch between default, auto-accept edits, and plan modes
```

**安装后：**

```
⠙ 光合作用中...

  💡 按 Shift+Tab 在默认模式、自动接受编辑模式和 Plan 模式之间切换
```

更多画风：

```
⠙ 蹦迪中...          ⠙ 七荤八素中...         ⠙ 搞事情中...
⠙ 瞎忙活中...        ⠙ 花里胡哨中...         ⠙ 变魔术中...
```

```
  琢磨了 1分23秒
```

187 个趣味 spinner 动词，41 条中文提示，回复耗时中文化，AI 默认中文回复。**装完即用。**

## 支持范围

<!-- readme-support-window:support-systems:start -->
| 平台 / 安装形态 | 已验证版本窗口 | 说明 |
|------|-----------|------|
| macOS / Linux / WSL · npm 全局安装 | `2.1.92 - 2.1.112` | 翻译最完整；launcher 启动前自修复 + `session-start` 兜底 |
| macOS · 官方安装器（native） | `2.1.110 - 2.1.112` | 需要 `node-lief` |
| macOS · native binary（arm64） | `2.1.113 - 2.1.211` 内的已验证版本 | 需要 `node-lief`；个别版本未收录，见支持矩阵 |
| Windows · npm（PowerShell） | `2.1.92 - 2.1.112` | 用 install.ps1，需 PowerShell 5.1+ |
| Windows · native .exe（x64） | `2.1.113 - 2.1.211` 内的已验证版本 | 需要 `node-lief`；个别版本未收录，见支持矩阵 |
| Linux · 官方安装器 | 暂无已验证版本 | 仅 Layer 1~3 生效 |

> - **版本号不是运行门禁**：高于已知 native 下限、且仍能被识别的新版会先在本机临时提取、翻译、重打包并执行启动自检；通过后才替换。已有词条继续中文，新文案原样保留英文。
> - **失败不伤 CLI**：补丁、重打包或启动自检任一步失败，都会保留或恢复原文件；失败只影响中文覆盖，不影响 Claude Code 使用。
> - **Windows 不热改运行中的 exe**：Claude Code 更新后先保持原版可用；关闭所有 Claude Code 窗口，再按 Windows 安装命令重跑 `install.ps1`，由安装器补丁并自检。
> - **格式变化才停手**：如果未来版本不再是可识别的 native 格式、依赖缺失、提取失败或启动自检失败，只跳过 Layer 4，Layer 1~3 继续生效。
> - **矩阵只记录证据**：纯上游兼容证据可以更新支持矩阵，不要求插件升版；只有插件代码、翻译或 manifest 变化才发布新版。
> - **已验证版本完整清单**（含个别未收录版本）见 [docs/support-matrix.md](./docs/support-matrix.md)，由脚本自动生成。
> - Claude Code 从 `2.1.113` 起 npm 主包切换为 native binary，不再包含旧的 `cli.js`；要最完整的翻译请用 `npm install -g @anthropic-ai/claude-code@2.1.112`。
<!-- readme-support-window:support-systems:end -->

> **自动更新边界**：正式安装态由 Claude Code 插件管理器更新；旧环境的独立兜底安装只跟随本插件已发布 Release。Claude Code 本体升级不要求中文插件同步升版本；`DISABLE_AUTOUPDATER` / `DISABLE_UPDATER` 仍由 Claude Code 本体处理。

## Skill / 插件命令说明自动汉化

除了 cli.js 界面文字，本插件还能**汉化用户安装的 skill 和插件 `/` 命令的功能说明**——安装新 skill/插件后，开启本功能，下次启动 Claude Code 时，它们在 `/` 命令列表、`/skill`、`/plugin` 界面里的描述会翻译成简体中文。

> ⚠ **开启前请知情**：本功能会**修改本机文件**——改写 `~/.claude/` 下 skill 的 `SKILL.md`、command 的 `.md`、插件的 `plugin.json`/`marketplace.json` 的 `description` 字段。原文备份到 `description_en`（JSON 为 `_description_en`），可用 `node plugin/skill-i18n/restore.js --all` 一键还原，卸载时也会自动还原。`description` 同时用于 model 自动触发 skill，翻译会影响触发判断（现代多语言 LLM 对中文描述触发良好）。

- **默认禁用，需显式开启**：设 `ZH_CN_SKILL_I18N_ENABLE=1` 后，SessionStart hook 才会后台增量扫描（默认不跑，不消耗 token/额度）。
- **覆盖范围**：用户与插件的 skill/command（递归扫描 `~/.claude/{skills,commands}` + `plugins/{cache,marketplaces}`）、插件元数据（`plugin.json` / `marketplace.json`）。
- **翻译引擎**：默认用 `claude` CLI（零配置）；可配 OpenAI / Anthropic 兼容 API 加速。
- **可逆**：原文备份（`description_en` + 标记），`restore.js --all` 一键还原，卸载时自动还原。

详细配置（环境变量、API 接入、权衡说明）见 [`plugin/skill-i18n/README.md`](plugin/skill-i18n/README.md)。

> **职责边界**：本功能只翻译**用户安装的** skill/插件说明。CC 自带命令（`/cd`、`/help` 等）的汉化仍由 cli.js patch（上方翻译表）覆盖。

## 快速开始

### 安装

一行安装最新发布版：

```bash
curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/install-remote.sh | bash
```

这条命令会从本项目最新 GitHub Release 下载源码包，然后执行同一套 `install.sh`。它和官方安装器的区别：

| 命令 | 装什么 | 什么时候用 |
|------|--------|------------|
| `curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/install-remote.sh \| bash` | 中文本地化插件 | 已经有 `claude` 命令，只想安装/更新中文插件 |
| `curl -fsSL https://claude.ai/install.sh \| sh` | Claude Code 本体 | 还没有 `claude` 命令，或要先安装官方 CLI |

远程安装会优先把本项目登记到 Claude Code 插件管理器；当前 CLI 不支持正式注册时，才启用等价的独立 Hook 兜底，不需要保留本地 clone。

如果你要改翻译或调试脚本，再用本地源码安装：

```bash
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
./install.sh
```

安装脚本会自动：

- ✅ 备份现有 `~/.claude/settings.json` 和 `cli.js`（或原生二进制）
- ✅ 合并中文设置到 settings.json
- ✅ 检测到 CC Switch 通用配置缺少中文设置时，先询问用户；同意后才同步
- ✅ 优先通过 Claude Code 插件管理器登记 marketplace 并启用正式插件；注册不可用时才安装独立备用 Hook
- ✅ 已验证版本直接使用公开证据；更高 native 版本也先本机自检。可 patch 硬编码文字（1895 条翻译；代表版本 `2.1.112` 实测 1595 处有效 patch）
- ✅ 缺少 `node-lief`、native 格式变化、提取失败或自检失败时，只跳过 Layer 4；Layer 1~3 和 Claude Code 本体继续可用

### Windows 原生安装

```powershell
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
```

install.ps1 会自动完成与 install.sh 相同的步骤：正式插件注册、依赖检查、Settings 合并、CLI Patch 和失败回滚。需要 PowerShell 5.1+（Windows 10/11 自带）。

> **Windows native .exe 用户先装 node-lief**：如果当前 Claude Code 是 2.1.113+ native `.exe`，请先运行 `npm install -g node-lief` 再装插件。未安装时 Layer 4 CLI Patch 会跳过，Layer 1~3 不受影响。也可以继续通过 [WSL](https://learn.microsoft.com/zh-cn/windows/wsl/install) 使用 `install.sh`。

Claude Code 在 Windows 更新后，插件不会现场改写正在运行并被系统锁定的 `claude.exe`。先照常使用；方便时关闭所有 Claude Code 窗口，再回到本项目目录重跑上面的 `install.ps1`，安装器会完成补丁、启动自检和失败回滚。

### 各安装方式的中文化程度

<!-- readme-support-window:install-advice:start -->
| 安装方式 | 中文化程度 |
|---------|-----------|
| `npm install -g @anthropic-ai/claude-code@2.1.112` | 最完整（推荐） |
| `npm install -g @anthropic-ai/claude-code`（latest） | 新版先本机自检；已知文案继续中文，新文案保留英文 |
| `curl -fsSL https://claude.ai/install.sh \| bash -s 2.1.112` | 官方安装器指定已验证旧版本（需要 `node-lief`） |
| `curl -fsSL https://claude.ai/install.sh \| sh`（latest） | 新版先本机自检再启用 CLI Patch；格式或自检失败时只保留 Layer 1~3 |
| `powershell -File install.ps1` | Windows：旧 npm cli.js 最完整；native .exe `2.1.113 - 2.1.211` 内已验证版本需 `node-lief`；Claude 更新后关闭所有窗口并重跑 |

> **native binary 说明**：官方安装器和新版 npm 包装到的是 native 二进制。插件会提取其中的 JS → 翻译 → 写回，并做启动自检；补丁、重打包或自检失败会恢复原文件。macOS arm64 已验证 `2.1.113 - 2.1.211` 内的版本（完整清单见[支持矩阵](./docs/support-matrix.md)）；更高版本也会本机自检，需要 `node-lief`。macOS 可在新会话安全补丁；Windows 不热改运行中的 exe，更新后需关闭窗口并重跑 `install.ps1`。

安装脚本会自动检测安装方式，无需手动选择。
<!-- readme-support-window:install-advice:end -->

### 前置要求

- Node.js（CLI Patch 需要）
- 可选：jq（更精准的 JSON 合并）
- 可选：`node-lief`（native 二进制适配需要：`npm install -g node-lief`；旧版 npm cli.js 路径不需要）

### 验证

重启 Claude Code 后，发送任意请求。如果看到 spinner 显示“思考中”、“光合作用中”等中文，说明 Layer 1~3 已生效。

不确定 Layer 4 是否生效、或 UI 仍是英文时，运行诊断脚本（会检测安装形态、settings、patch 记录和 `patch.log` 里的失败原因，并给出下一步命令）：

```bash
./doctor.sh                                            # macOS / Linux / WSL（仓库内）
bash ~/.claude/plugins/claude-code-zh-cn/bin/doctor    # 只有已安装插件时
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\doctor.ps1   # Windows
```

加 `--json` 得到机器可读输出；退出码 `0` = 无阻塞项，`1` = 需要处理。

如果是请求报错（403、空响应、`ECONNREFUSED` 等）而不是界面英文，那通常是 provider / 代理 / 网关链路问题，不是汉化没生效。可以把报错原文交给 doctor 分流：

```bash
./doctor.sh --runtime-error 'API returned an empty or malformed response (HTTP 200)' --json
```

### 更新

Claude Code 更新后，npm / macOS native 安装会在首次会话启动时**自动检测版本变更并重新 patch**；Windows native 会保留原版可用，并提示关闭窗口后重跑安装器。新版先本机自检；只有格式、依赖、提取或自检失败才跳过原生 Layer 4，不会让 CLI 失效。

插件本体发布新 Release 后，正式安装态由 Claude Code 插件管理器更新。独立兜底安装只做限时检查并提示，不会在会话启动途中原地覆盖自身；本地源码安装用户在会话结束后运行 `git pull && ./install.sh`（Windows：`git pull` 后重跑 `install.ps1`）。

### 卸载

远程安装用户可直接运行：

```bash
curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/uninstall-remote.sh | bash
```

本地源码安装用户运行 `./uninstall.sh`（Windows：`powershell -File uninstall.ps1`）。精准移除插件注入的设置，保留你的其他配置不变。

## 特色：187 个趣味动词翻译

原版 Claude Code 的 spinner 有一堆故意搞怪的英文动词（`Flibbertigibbeting`、`Photosynthesizing`、`Moonwalking`...），我们全部按**原味**翻译了：

| 英文 | 中文 | | 英文 | 中文 |
|------|------|-|------|------|
| `Thinking` | 思考中 | | `Moonwalking` | 太空步中 |
| `Photosynthesizing` | 光合作用中 | | `Flibbertigibbeting` | 叽里呱啦中 |
| `Discombobulating` | 七荤八素中 | | `Whatchamacalliting` | 那个啊来着中 |
| `Shenaniganing` | 搞事情中 | | `Razzmatazzing` | 花里胡哨中 |
| `Boondoggling` | 瞎忙活中 | | `Prestidigitating` | 变魔术中 |
| `Clauding` | 克劳丁中 | | `Boogieing` | 蹦迪中 |
| `Canoodling` | 腻歪中 | | `Spelunking` | 探洞中 |

> 完整 187 个翻译见 [verbs/zh-CN.json](./verbs/zh-CN.json)

## 覆盖了什么

| 功能 | 数量 | 怎么做的 |
|------|------|---------|
| AI 回复语言 | - | `language: Chinese` |
| Spinner 动词 | 187 个 | `spinnerVerbs` |
| Spinner 提示 | 41 条 | `spinnerTipsOverride` |
| 中文上下文注入 | - | SessionStart Hook |
| 通知翻译 | 6 条 | Notification Hook |
| 输出风格 | - | Chinese Output Style |
| UI 文字中文化 | 1895 条翻译，`2.1.112` 实测 1595 处有效 patch | CLI Patch（扫描真实双引号字符串 token 后逐条替换）+ 显示面审计 |
| 自动重 patch | - | 版本检测，更新后首次会话重新 patch |
| 插件自动更新 | - | 正式安装态交给 Claude Code 插件管理器；独立兜底态只跟随已发布 Release |

## 技术原理

<details>
<summary>展开看四层架构与优雅降级机制</summary>

Claude Code CLI 是一个 13MB 的单文件压缩包（`cli.js`，或 native 二进制内嵌 JS），UI 文字硬编码其中，没有 i18n 基础设施。本项目通过四层机制实现中文化：

### Layer 1 — 内置设置（稳定，更新后不丢失）
- `language`: 控制 AI 回复语言
- `spinnerTipsOverride`: 替换等待提示文字
- `spinnerVerbs`: 替换 spinner 动词

### Layer 2 — Hook 系统（稳定，更新后不丢失）
- `SessionStart`: 会话启动时注入中文上下文指令 + 委托插件管理器检查更新 + 检测版本自动重 patch
- `Notification`: 拦截系统通知并翻译

### Layer 3 — 插件系统（稳定，更新后不丢失）
- 标准 Claude Code 插件格式
- 提供 Chinese Output Style

### Layer 4 — CLI Patch（自动维护，优雅降级）
- 基于 Node.js 的**字符串字面量扫描器**，先扫描真实双引号字符串 token，再逐条替换
- 显式排除注释、模板字符串、正则字面量中的 `"`，避免误改代码结构
- 从 `cli-translations.json` 读取翻译，按长度降序批量替换
- 覆盖：状态消息、按钮文字、错误提示、设置页面、导航、快捷键说明等

Layer 1~3 完全不受 Claude Code 更新影响。Layer 4 的优雅降级闭环：

1. **备份**：patch 前保留同版本干净原文备份，re-patch 一律从备份恢复干净基底，杜绝 patch 叠 patch
2. **逐条独立**：单条翻译匹配不上就跳过（新版本改了文字 → 那条保持英文，其余照常）
3. **事务自检**：npm patch 必须通过 JS 语法校验；native patch 必须通过提取、重打包和真实 `--version` 启动自检。任一步失败都保留或恢复原文件
4. **错误可见**：失败写入插件目录 `patch.log`，doctor 可读取诊断

```
稳定性：Layer 1~3 完全不受 Claude Code 更新影响
         Layer 4 自动检测并重新 patch，失败自动降级为英文
         正式插件由 Claude Code 插件管理器更新；独立兜底态只跟随已发布 Release
```

</details>

## 自定义

想调整翻译？直接编辑对应的 JSON 文件：

```bash
# 编辑 spinner 提示
vim tips/zh-CN.json

# 编辑 spinner 动词
vim verbs/zh-CN.json
```

编辑完后重新运行 `./install.sh` 即可生效。

## FAQ

<details>
<summary><b>Claude Code 更新后会失效吗？会不会把 CLI 弄坏？</b></summary>

Layer 1~3（设置、Hook、插件）完全不受影响。Layer 4 会自动检测版本变更：新版在本机自检通过后，只翻译仍能精确匹配的文案；新文案保留英文。版本号本身不再关闭 native 补丁；格式、依赖、提取、重打包或启动自检失败时会保留或恢复原文件——**CLI 始终可用**。已验证证据见 [docs/support-matrix.md](./docs/support-matrix.md)。

这不等于本插件能阻止 Claude Code 本体升级。`DISABLE_AUTOUPDATER` / `DISABLE_UPDATER` 归 Claude Code 自己处理，是否生效请看 `claude doctor` 的 Updates 段。
</details>

<details>
<summary><b>插件发布新版本后需要手动重新安装吗？</b></summary>

通常不需要。正式注册的安装态由 Claude Code 插件管理器限频检查并更新；旧环境的独立兜底安装会检查已发布的 Release。

注意：

- 两种更新方式都只使用已发布版本，不跟随 `main` 上未发布的开发中 commit
- 纯 Claude Code 上游兼容证据不要求中文插件同步升版本；只有插件代码、翻译或 manifest 变化才发布新版
- 远程安装不需要保留本地 clone；独立兜底的本地源码安装需要保留安装时使用的仓库，才能继续自动更新
</details>

<details>
<summary><b>用 CC Switch 切换供应商后，中文设置又变回去了怎么办？</b></summary>

这是 CC Switch 切换供应商时重写了 `~/.claude/settings.json`。新版安装器检测到 CC Switch 的 Claude 通用配置缺少中文设置时，会先询问是否帮你同步；只有你同意后才会修改 CC Switch 的本地数据库，并且会先备份。

直接重新运行 `./install.sh`，看到提示后选择“帮我同步”。非交互环境可以显式授权：

```bash
ZH_CN_CCSWITCH_SYNC=1 ./install.sh
```

Windows PowerShell：

```powershell
$env:ZH_CN_CCSWITCH_SYNC = "1"; .\install.ps1
```

如果选择自己处理，在 CC Switch 中编辑 Claude 供应商，打开“编辑通用配置”，点击“从编辑内容提取”并保存；之后确认要切换的供应商勾选了“写入通用配置”。
</details>

<details>
<summary><b>会不会破坏 Claude Code 原有功能？</b></summary>

不会。安装脚本在修改前先备份；native 补丁还必须通过重打包和真实启动自检，失败就恢复原文件。单条新文案匹配不上时只保留英文，不会连累整套插件。如果仍要移除，运行 `./uninstall.sh`。
</details>

<details>
<summary><b>支持哪些系统？</b></summary>

macOS、Linux 和 Windows（原生 PowerShell 或 WSL）。需要 Node.js。可选依赖 jq（用于更精准的 JSON 合并）。

Windows：现已支持通过 `install.ps1` 在 PowerShell 5.1+ 中原生安装。也可以继续通过 WSL 使用 `install.sh`。
</details>

<details>
<summary><b>能自定义翻译吗？</b></summary>

可以！编辑 `tips/zh-CN.json` 和 `verbs/zh-CN.json`，然后重新运行 `./install.sh` 即可。
</details>

<details>
<summary><b>和 VS Code 扩展的中文化项目有什么区别？</b></summary>

本项目是**终端 CLI** 的中文化，不依赖 VS Code。[zstings/claude-code-zh-cn](https://github.com/zstings/claude-code-zh-cn) 是 Claude Code VS Code 扩展的汉化，两者互补。
</details>

## 贡献

欢迎 PR！

- 翻译改进 → 编辑 `tips/zh-CN.json` 或 `verbs/zh-CN.json`
- 新功能 → 添加 hook 或 output style
- Bug / 没汉化 / 没生效 → 提 [诊断 Issue](https://github.com/taekchef/claude-code-zh-cn/issues/new?template=localization-not-effective.yml)，请带上 `doctor --json` 输出、安装方式、版本和关键路径

## 许可证

[MIT](./LICENSE)

## 致谢

- UI 字符串提取自 [Claude Code](https://github.com/anthropics/claude-code)
- 灵感来自 [zstings/claude-code-zh-cn](https://github.com/zstings/claude-code-zh-cn)（Claude Code VS Code 扩展中文汉化）

---

## English

**claude-code-zh-cn** is a Simplified Chinese localization plugin for [Claude Code CLI](https://github.com/anthropics/claude-code). It translates 187 spinner verbs, 41 spinner tips, 1895 UI translations, notification messages, and more, with graceful degradation on unverified CLI versions (untranslated strings stay in English; the CLI never breaks). Verified version windows are documented in [docs/support-matrix.md](./docs/support-matrix.md).

```bash
curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/install-remote.sh | bash
```

See full documentation above (in Chinese). PRs and issues welcome!

---

*本项目不是 Anthropic 官方产品。Claude Code 是 Anthropic Inc. 的商标。*

## Star History

<a href="https://star-history.com/#taekchef/claude-code-zh-cn&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=taekchef/claude-code-zh-cn&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=taekchef/claude-code-zh-cn&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=taekchef/claude-code-zh-cn&type=Date" />
  </picture>
</a>
