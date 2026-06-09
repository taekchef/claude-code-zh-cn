<div align="center">

# claude-code-zh-cn

**Claude Code 简体中文本地化插件**

让终端里的 AI 编程助手说中文 🇨🇳

[![GitHub](https://img.shields.io/badge/GitHub-taekchef%2Fclaude--code--zh--cn-blue?logo=github)](https://github.com/taekchef/claude-code-zh-cn)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
<!-- readme-support-window:badges:start -->
[![npm stable](https://img.shields.io/badge/npm%20stable-2.1.92--2.1.112-green)](./docs/support-matrix.md)
[![macOS installer](https://img.shields.io/badge/macos%20installer-experimental-yellow)](./docs/support-matrix.md)
[![macOS native](https://img.shields.io/badge/macos%20native-2.1.113--2.1.169%20experimental-yellow)](./docs/support-matrix.md)
<!-- readme-support-window:badges:end -->
[![Version](https://img.shields.io/github/v/tag/taekchef/claude-code-zh-cn?label=Version&color=blue)](https://github.com/taekchef/claude-code-zh-cn/releases)

**一行远程安装 · 更新后自动修复 · 卸载不丢配置**

</div>

---

## 为什么做这个？

Claude Code 是一个很棒的终端 AI 编程助手，但它没有中文界面。当前 stable 支持窗口内，UI 文字主要硬编码在一个 13MB 的 `cli.js` 里，没有 i18n 基础设施。

官方短期内不太可能加中文支持。所以我做了这个插件，通过四层机制（设置注入 + Hook 系统 + 插件系统 + CLI Patch）实现中文化，**自动检测安装方式，更新后自动修复**。

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

## 快速开始

### 30 秒怎么选

| 你现在的情况 | 建议 |
|-------------|------|
| 想要最完整、最稳的中文化 | 用旧 npm pinned：`npm install -g @anthropic-ai/claude-code@2.1.112`，CLI Patch 支持最完整 |
| macOS arm64 已在 native 验证窗口内 | 可走 experimental native patch；需要先装 `node-lief` |
| native 版本刚高于已验证窗口，但仍是同一 minor 线 | 安装时会尝试本机自验证；通过才临时启用 CLI Patch，不等于已发布支持 |
| 用 `latest` / `next`，或版本不在已验证窗口内 | 不满足本机自验证边界时只启用 Layer 1~3；Layer 4 CLI Patch 会跳过 |
| Windows PowerShell | 旧 npm `cli.js` 路径最稳；Windows native .exe 用户先 `npm install -g node-lief` 再运行 `install.ps1` |
| 被 Claude Code 自动升级后丢中文 | `DISABLE_AUTOUPDATER` 属于 Claude Code 本体；先看 `claude doctor` 的 Updates 段，再按 [support matrix](./docs/support-matrix.md) 判断插件是否已发布支持 |

### 支持系统

<!-- readme-support-window:support-systems:start -->
| 系统 / 通道 | 当前口径 | 已验证窗口 | 说明 |
|------|---------|-----------|------|
| macOS / npm 全局安装 | `stable` | `2.1.92 - 2.1.112` | 启动前 launcher 自修复 + `session-start` 二层兜底 |
| macOS / 官方安装器 | `experimental` | `2.1.110 - 2.1.112` | 指定旧版本的 native 二进制已验证；插件可用 native patch 处理，需要 `node-lief`，稳定仍建议 npm pinned |
| macOS / native binary | `experimental` | `2.1.113 - 2.1.169`（不含未纳入本轮支持的 `2.1.115`、`2.1.125`、`2.1.127`、`2.1.130`、`2.1.134`、`2.1.135`、`2.1.147`、`2.1.149`、`2.1.151`、`2.1.154`、`2.1.155`、`2.1.157`、`2.1.163`、`2.1.164`、`2.1.166`） | 当前 macOS arm64 native 已验证 extract / patch / repack / `--version` + 11 个稳定显示面审计；需要 `node-lief`；未验证新版本会安全跳过 CLI Patch |
| Linux / npm 全局安装 | `stable` | `2.1.92 - 2.1.112` | 与 npm stable 同口径 |
| Linux / 官方安装器 | `unsupported` | - | 当前不承诺支持 |
| Windows / npm 全局安装 (PowerShell) | `stable` | `2.1.92 - 2.1.112` | 新增 PowerShell 安装脚本（install.ps1）；适用于旧 npm cli.js 形态，CLI Patch 可用；需 PowerShell 5.1+ |
| Windows / native .exe | `experimental` | `2.1.113 - 2.1.162`（不含未纳入本轮支持的 `2.1.115`、`2.1.125`、`2.1.127`、`2.1.130`、`2.1.134`、`2.1.135`、`2.1.147`、`2.1.149`、`2.1.151`、`2.1.154`、`2.1.155`、`2.1.157`） | 当前 Windows x64 native 已验证 extract / patch / repack / `--version` + 11 个稳定显示面审计；需要 `node-lief`；未验证新版本会安全跳过 CLI Patch |
| Windows / WSL + npm 全局安装 | 跟随 npm `stable` | `2.1.92 - 2.1.112` | **必须在 WSL 终端内运行**，使用 install.sh |

> **Windows 用户（原生 PowerShell）**：现已新增 PowerShell 安装脚本（install.ps1），可在 Windows 10/11 上原生安装**旧 npm cli.js 形态**的 Claude Code（`2.1.92 - 2.1.112`），无需 WSL。见下方「Windows 原生安装」章节。
>
> **Windows 用户（WSL）**：也可先安装 [WSL](https://learn.microsoft.com/zh-cn/windows/wsl/install)，然后在 WSL 中安装 Claude Code 和本插件。
>
> **Windows native .exe experimental**：Windows x64 native binary experimental；需要 node-lief；仅代表列出的已验证版本 `2.1.113 - 2.1.162`（不含未纳入本轮支持的 `2.1.115`、`2.1.125`、`2.1.127`、`2.1.130`、`2.1.134`、`2.1.135`、`2.1.147`、`2.1.149`、`2.1.151`、`2.1.154`、`2.1.155`、`2.1.157`），已通过 extract / patch / repack / `--version` + 11 个稳定显示面审计，不代表 future latest 自动稳定。未验证的 latest 会跳过 CLI Patch；如需最稳，请使用 `npm install -g @anthropic-ai/claude-code@2.1.112`。
>
> **支持边界单一来源**：当前口径以 [docs/support-matrix.md](./docs/support-matrix.md) 为准。该文档由 `scripts/upstream-compat.config.json` + `node scripts/verify-upstream-compat.js --json` 通过 `node scripts/generate-support-matrix.js` 生成。
>
> **最新版说明**：Claude Code 从 `2.1.113` 开始，npm 主包切换为 native binary wrapper，不再包含旧的 `cli.js`。本插件当前 stable CLI Patch 支持到 `2.1.112`；macOS arm64 native binary 现在有独立 experimental 通道，已验证 `2.1.113 - 2.1.114`、`2.1.116 - 2.1.124`、`2.1.126`、`2.1.128 - 2.1.129`、`2.1.131 - 2.1.133`、`2.1.136 - 2.1.146`、`2.1.148`、`2.1.150`、`2.1.152 - 2.1.153`、`2.1.156`、`2.1.158 - 2.1.162`、`2.1.165`、`2.1.167 - 2.1.169` 的二进制改写链路和 11 个稳定显示面。Windows x64 native 也有独立 experimental 通道，已验证 `2.1.113 - 2.1.114`、`2.1.116 - 2.1.124`、`2.1.126`、`2.1.128 - 2.1.129`、`2.1.131 - 2.1.133`、`2.1.136 - 2.1.146`、`2.1.148`、`2.1.150`、`2.1.152 - 2.1.153`、`2.1.156`、`2.1.158 - 2.1.162` 的二进制改写链路和 11 个稳定显示面。`2.1.115`、`2.1.125`、`2.1.127`、`2.1.130`、`2.1.134`、`2.1.135`、`2.1.147`、`2.1.149`、`2.1.151`、`2.1.154`、`2.1.155`、`2.1.157`、`2.1.163`、`2.1.164`、`2.1.166` 未纳入本轮支持；`latest` 不是 stable 承诺，未验证的新版本会跳过 CLI Patch。
<!-- readme-support-window:support-systems:end -->

> **自动更新边界**：本插件的“自动更新”只同步中文插件的已发布 Release；`DISABLE_AUTOUPDATER` / `DISABLE_UPDATER` 是 Claude Code 本体升级开关，不由本插件兜底。是否生效请看 `claude doctor` 的 Updates 段。

### 安装方式

<!-- readme-support-window:install-advice:start -->
当前安装方式口径如下：

| 安装方式 | 说明 | 当前口径 |
|---------|------|---------|
| `npm install -g @anthropic-ai/claude-code@2.1.112` | 推荐安装的旧 `cli.js` 版本；`2.1.92 - 2.1.112` 范围内也可用 | `stable` |
| `npm install -g @anthropic-ai/claude-code` | npm 全局安装最新版；macOS arm64 / Windows x64 若版本正好在已验证 native 窗口内可走 experimental | `experimental / skipped`（未验证 native 版本会跳过 CLI Patch） |
| `curl -fsSL https://claude.ai/install.sh \| bash -s 2.1.112` | 官方安装器指定旧版本 | `experimental`（macOS arm64 已验证；插件会用 native patch 处理，需要 `node-lief`） |
| Claude Code native binary `2.1.113 - 2.1.169`（macOS arm64，不含未纳入本轮支持的 `2.1.115`、`2.1.125`、`2.1.127`、`2.1.130`、`2.1.134`、`2.1.135`、`2.1.147`、`2.1.149`、`2.1.151`、`2.1.154`、`2.1.155`、`2.1.157`、`2.1.163`、`2.1.164`、`2.1.166`） | 当前已验证的 native binary 版本，显示审计 11/11 PASS | `experimental`（需要 `node-lief`） |
| `curl -fsSL https://claude.ai/install.sh \| sh` | 官方安装器 latest | `experimental / skipped`（只有明确验证版本会启用 CLI Patch） |
| `powershell -File install.ps1` | Windows PowerShell 安装（旧 npm cli.js 为 stable；Windows x64 native `2.1.113 - 2.1.162` 为 experimental，需要 `node-lief`） | `stable / experimental`（需 PowerShell 5.1+） |

安装脚本会自动检测安装方式，无需手动选择。

> **native binary 说明**：官方安装器和新版 npm 包都可能装到 native 二进制，不是旧 npm `cli.js`。本插件的处理方法是：用 `bun-binary-io.js` 提取二进制里的 JS → 复用 `patch-cli.sh` 翻译 → 再写回二进制。macOS arm64 `2.1.110 - 2.1.112` 已在临时目录验证通过；`2.1.113 - 2.1.114`、`2.1.116 - 2.1.124`、`2.1.126`、`2.1.128 - 2.1.129`、`2.1.131 - 2.1.133`、`2.1.136 - 2.1.146`、`2.1.148`、`2.1.150`、`2.1.152 - 2.1.153`、`2.1.156`、`2.1.158 - 2.1.162`、`2.1.165`、`2.1.167 - 2.1.169` 额外通过 11 个稳定显示面审计。运行时需要 `node-lief`。要最稳，请优先使用 npm pinned 安装方式。
>
> **不支持的安装方式**：如当前安装方式暂不支持 CLI Patch，安装脚本会明确提示并只启用 Layer 1~3，不会误报“已完成全部 patch”。
<!-- readme-support-window:install-advice:end -->

> **本机自验证说明**：如果 native 版本刚高于当前已发布支持窗口、但仍在同一 minor 版本线内，安装器会在本机临时尝试 extract / patch / repack / `--version`。只有这一步通过才会写入 `provisional` patch 记录；doctor 会明确提示“尚未纳入已发布支持窗口”。已明确排除的版本不会进入这条路径。

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

要固定到最完整支持的旧版本，再用官方入口指定版本：`curl -fsSL https://claude.ai/install.sh | bash -s 2.1.112`。

远程安装会记录 GitHub Release 来源，插件发布新版本后，`SessionStart` hook 的自动更新仍然生效；不需要保留本地 clone。

如果你要改翻译或调试脚本，再用本地源码安装：

```bash
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
./install.sh
```

安装脚本会自动：
- ✅ 备份现有 `~/.claude/settings.json` 和 `cli.js`（或原生二进制）
- ✅ 合并中文设置到 settings.json
- ✅ 检测到 CC Switch 通用配置缺少中文设置时，先询问用户；同意后才同步，拒绝则给出手动处理步骤
- ✅ 安装插件到 `~/.claude/plugins/claude-code-zh-cn/`
- ✅ 在 stable 安装方式上 patch 硬编码文字（1794 条翻译；当前 stable 代表版本 `2.1.112` 实测 1555 处有效 patch，显示审计 11/11 PASS）
- ✅ 在 macOS native experimental 已验证版本上 patch 硬编码文字（`2.1.113 - 2.1.114`、`2.1.116 - 2.1.124`、`2.1.126`、`2.1.128 - 2.1.129`、`2.1.131 - 2.1.133`、`2.1.136 - 2.1.146`、`2.1.148`、`2.1.150`、`2.1.152 - 2.1.153`、`2.1.156`、`2.1.158 - 2.1.162`、`2.1.165`、`2.1.167 - 2.1.169` 实测 1320-1405 处，显示审计 11/11 PASS）
- ✅ 如当前安装方式暂不支持 CLI Patch 或缺少 `node-lief`，自动跳过 Layer 4 并保留 Layer 1~3

### Windows 原生安装

```powershell
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
```

install.ps1 会自动完成与 install.sh 相同的步骤：依赖检查、插件同步、Launcher 安装、Settings 合并、CLI Patch（旧 npm cli.js 稳定支持；Windows x64 native 已验证版本为 experimental）、元数据写入。

> **CLI Patch 支持范围**：install.ps1 可 patch 旧 npm cli.js 形态（`2.1.92 - 2.1.112`），也可在安装了 `node-lief` 时 experimental patch Windows x64 native `2.1.113 - 2.1.162`（不含 `2.1.115`、`2.1.125`、`2.1.127`、`2.1.130`、`2.1.134`、`2.1.135`、`2.1.147`、`2.1.149`、`2.1.151`、`2.1.154`、`2.1.155`、`2.1.157`）。检测到未验证 Windows native .exe 或缺少 `node-lief` 时，会明确跳过 CLI Patch，只启用 Layer 1~3（设置 + Hook + 插件）。如需最稳，请使用 `npm install -g @anthropic-ai/claude-code@2.1.112` 安装旧 npm 版本。
>
> **Windows native patch experimental 本机自验证**：如果 Windows native 版本刚高于已验证窗口但仍在同一 minor 线内，安装时会尝试本机自验证，通过才临时启用 CLI Patch；这不等于已发布支持窗口。
>
> **Windows native 用户先装 node-lief**：如果当前 Claude Code 是 `@anthropic-ai/claude-code` 2.1.113+ native `.exe`，请先运行 `npm install -g node-lief`，再运行 `powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1`。未安装时 Layer 4 CLI Patch 会跳过；未进已发布窗口的同 minor 版本即使本机自验证通过，也仍会标记为 `provisional`。
>
> **注意**：PowerShell 脚本要求 PS 5.1+（Windows 10/11 自带）。

### 前置要求

- Claude Code CLI 版本请先对照 [docs/support-matrix.md](./docs/support-matrix.md)
- Node.js（CLI Patch 需要）
- 可选：jq（更精准的 JSON 合并）
- 可选：`node-lief`（macOS / Windows native experimental 适配需要：`npm install -g node-lief`；旧版 npm cli.js 路径不需要）

### 验证

重启 Claude Code 后，发送任意请求。如果看到 spinner 显示“思考中”、“光合作用中”等中文，说明 Layer 1~3 已生效。若安装脚本还显示了 CLI Patch 成功摘要，或 npm 路径升级后首次启动未先掉回关键英文，则 Layer 4 也已启用。

安装后若不确定 Layer 4 是否生效、或 UI 仍是英文，可运行诊断脚本（会检测安装形态、settings、patch 记录，并给出下一步命令）：

macOS / Linux / WSL：

```bash
./doctor.sh
```

Windows PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\doctor.ps1
```

如果你手上只有已安装插件，也可以直接运行：

macOS / Linux / WSL：

```bash
bash ~/.claude/plugins/claude-code-zh-cn/bin/doctor
```

Windows PowerShell：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\plugins\claude-code-zh-cn\bin\doctor.ps1"
```

机器可读输出：

- macOS / Linux / WSL：`./doctor.sh --json` 或 `bash ~/.claude/plugins/claude-code-zh-cn/bin/doctor --json`
- Windows PowerShell：`powershell -NoProfile -ExecutionPolicy Bypass -File .\doctor.ps1 --json` 或 `powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\plugins\claude-code-zh-cn\bin\doctor.ps1" --json`

退出码 `0` = 无阻塞项，`1` = 需要处理。

如果你使用 CC Switch，`doctor` 也会只读检查它的 Claude 通用配置是否包含中文设置。缺失时，重新运行 `./install.sh` 并同意同步即可；如果你不想让安装器修改 CC Switch，也可以按 FAQ 里的手动步骤处理。

### 更新

Claude Code 更新后，插件会在首次会话启动时**自动检测版本变更并重新 patch**，无需手动操作。

插件本体发布新 Release 后，远程安装用户通常不需要手动更新；本地源码安装用户如需手动更新插件本体：

```bash
cd claude-code-zh-cn
git pull
./install.sh
```

Windows 上：

```powershell
cd claude-code-zh-cn
git pull
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
```

### 卸载

远程安装用户可直接运行：

```bash
curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/uninstall-remote.sh | bash
```

本地源码安装用户运行：

```bash
cd claude-code-zh-cn
./uninstall.sh
```

Windows 上：

```powershell
cd claude-code-zh-cn
powershell -NoProfile -ExecutionPolicy Bypass -File uninstall.ps1
```

精准移除插件注入的设置，保留你的其他配置不变。

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
| UI 文字中文化 | 1794 条翻译，`2.1.112` 实测 1555 处有效 patch；macOS native experimental `2.1.113 - 2.1.114`、`2.1.116 - 2.1.124`、`2.1.126`、`2.1.128 - 2.1.129`、`2.1.131 - 2.1.133`、`2.1.136 - 2.1.146`、`2.1.148`、`2.1.150`、`2.1.152 - 2.1.153`、`2.1.156`、`2.1.158 - 2.1.162`、`2.1.165`、`2.1.167 - 2.1.169` 实测 1320-1405 处；固定显示面审计均为 11/11 PASS | CLI Patch（扫描真实双引号字符串 token 后逐条替换）+ 显示面审计 |
| 自动重 patch | - | 版本检测，更新后首次会话重新 patch；不控制 Claude Code 本体是否升级 |
| 插件自动更新 | - | SessionStart Hook（只跟随本插件已发布 Release tag，不兜底 `DISABLE_AUTOUPDATER`） |

## 技术原理

<details>
<summary>展开看四层架构</summary>

当前 stable 支持窗口内，Claude Code CLI 是一个 13MB 的单文件压缩包（`cli.js`），UI 文字硬编码其中，没有 i18n 基础设施。本项目通过四层机制实现中文化：

### Layer 1 — 内置设置（稳定，更新后不丢失）
- `language`: 控制 AI 回复语言
- `spinnerTipsOverride`: 替换等待提示文字
- `spinnerVerbs`: 替换 spinner 动词

### Layer 2 — Hook 系统（稳定，更新后不丢失）
- `SessionStart`: 会话启动时注入中文上下文指令 + 检测插件 Release 更新 + 检测版本自动重 patch
- `Notification`: 拦截系统通知并翻译

### Layer 3 — 插件系统（稳定，更新后不丢失）
- 标准 Claude Code 插件格式
- 提供 Chinese Output Style

### Layer 4 — CLI Patch（自动维护，更新后自动重 patch）
- 基于 Node.js 的**字符串字面量扫描器**，先扫描真实双引号字符串 token，再逐条替换
- 显式排除注释、模板字符串、正则字面量中的 `"`，避免误改代码结构
- 从 `cli-translations.json` 读取翻译，按长度降序批量替换
- 覆盖：状态消息、按钮文字、错误提示、设置页面、导航、快捷键说明等
- 在当前安装方式不支持或缺少依赖时，Layer 4 会被明确跳过，不影响 Layer 1~3
- `session-start` hook 会限频检查插件 Release tag；检测到新发布版本时自动同步安装态
- `session-start` hook 检测版本变更与 patch 规则变更，自动重新 patch
- 有版本校验的备份机制，`uninstall.sh` 可还原

```
稳定性：Layer 1~3 完全不受 Claude Code 更新影响
         Layer 4 自动检测并重新 patch
         插件自动更新只跟随已发布 Release，不跟随 main 未发布 commit
```

</details>

## 项目结构

```
claude-code-zh-cn/
├── README.md                ← 你在这里
├── LICENSE                  ← MIT
├── CHANGELOG.md             ← 版本变更记录
├── install.sh               ← 一键安装 (macOS/Linux)
├── doctor.sh                ← 安装诊断（Layer 1–4 状态与建议）
├── doctor.ps1               ← 安装诊断 (Windows PowerShell)
├── install.ps1              ← 一键安装 (Windows PowerShell)
├── uninstall.sh             ← 一键卸载 (macOS/Linux)
├── uninstall.ps1            ← 一键卸载 (Windows PowerShell)
├── _validate.ps1            ← PowerShell 语法验证工具
├── patch-cli.sh             ← CLI Patch 入口脚本
├── patch-cli.js             ← CLI Patch 核心逻辑（扫描字符串字面量后逐条替换）
├── bun-binary-io.js         ← 原生二进制 I/O 工具（官方安装器 native experimental）
├── cli-translations.json    ← 1794 条 UI 翻译对照表
├── settings-overlay.json    ← 合并到 settings.json 的中文设置
├── plugin/
│   ├── manifest.json        ← 插件清单
│   ├── hooks.json           ← Hook 事件配置
│   ├── bun-binary-io.js     ← 原生二进制 I/O（与根目录拷贝一致）
│   ├── hooks/
│   │   ├── session-start    ← 注入中文上下文 + 自动 patch
│   │   ├── session-start.ps1 ← 同上 (Windows PowerShell)
│   │   ├── session-start.cmd ← CMD 包装器调用 session-start.ps1
│   │   ├── notification     ← 通知翻译
│   │   ├── notification.ps1 ← 同上 (Windows PowerShell)
│   │   └── notification.cmd ← CMD 包装器调用 notification.ps1
│   ├── bin/
│   │   ├── doctor               ← 安装诊断 (macOS/Linux/WSL)
│   │   ├── doctor.ps1           ← 安装诊断 (Windows PowerShell)
│   │   ├── claude-launcher.sh   ← PATH 注入 launcher (macOS/Linux)
│   │   ├── claude-launcher.ps1  ← PATH 注入 launcher (Windows PowerShell)
│   │   └── claude-launcher.cmd  ← PATH 注入 launcher (CMD)
│   └── output-styles/
│       └── chinese.json     ← 中文输出风格
├── tips/
│   ├── en.json              ← 英文原文（对照）
│   └── zh-CN.json           ← 中文翻译
└── verbs/
    └── zh-CN.json           ← 187 个中文动词
```

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
<summary><b>Claude Code 更新后会失效吗？</b></summary>

Layer 1~3（设置、Hook、插件）完全不受影响。Layer 4（CLI Patch）会在支持窗口内自动检测版本变更并重新 patch。

这不等于本插件能阻止 Claude Code 本体升级。`DISABLE_AUTOUPDATER` / `DISABLE_UPDATER` 归 Claude Code 自己处理，是否生效请看 `claude doctor` 的 Updates 段；如果已升到 support matrix 未收录的新窗口，请等本插件发布支持，或临时退回已验证版本。

注意：Claude Code 从 `2.1.113` 开始，npm latest 切换为 native binary wrapper，不再包含旧的 `cli.js`。当前 stable CLI Patch 支持到 `2.1.112`。macOS arm64 native binary 走 experimental 通道，已验证 `2.1.113 - 2.1.114`、`2.1.116 - 2.1.124`、`2.1.126`、`2.1.128 - 2.1.129`、`2.1.131 - 2.1.133`、`2.1.136 - 2.1.146`、`2.1.148`、`2.1.150`、`2.1.152 - 2.1.153`、`2.1.156`、`2.1.158 - 2.1.162`、`2.1.165`、`2.1.167 - 2.1.169` 的二进制改写链路和 11 个稳定显示面；`2.1.115`、`2.1.125`、`2.1.127`、`2.1.130`、`2.1.134`、`2.1.135`、`2.1.147`、`2.1.149`、`2.1.151`、`2.1.154`、`2.1.155`、`2.1.157`、`2.1.163`、`2.1.164`、`2.1.166` 未纳入本轮支持，未验证 latest 不代表 stable 支持。
</details>

<details>
<summary><b>插件发布新版本后需要手动重新安装吗？</b></summary>

通常不需要。`SessionStart` hook 会限频检查已发布的 Release tag；如果发现本地安装版本落后，会自动同步到最新 Release。

注意：

- 自动更新只跟随已发布的 Release tag
- 不会跟随 `main` 上未发布的开发中 commit
- 远程安装不需要保留本地 clone；本地源码安装需要保留安装时使用的源码仓库，否则插件仍可继续使用，只是不会自动更新
</details>

<details>
<summary><b>用 CC Switch 切换供应商后，中文设置又变回去了怎么办？</b></summary>

这是 CC Switch 切换供应商时重写了 `~/.claude/settings.json`。新版安装器检测到 CC Switch 的 Claude 通用配置缺少中文设置时，会先询问是否帮你同步；只有你同意后才会修改 CC Switch 的本地数据库，并且会先备份。

你可以直接重新运行：

```bash
./install.sh
```

看到提示后选择“帮我同步”。如果是非交互环境，可以显式授权：

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

不会。安装脚本在修改任何文件前都会先备份，且所有 patch 都是纯文字替换。如果有问题，运行 `./uninstall.sh` 一键恢复。
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

**claude-code-zh-cn** is a Simplified Chinese localization plugin for [Claude Code CLI](https://github.com/anthropics/claude-code).

It translates 187 spinner verbs, 41 spinner tips, 1794 UI translations, notification messages, and more. The patch combines safe string scanning for legacy `cli.js` plus an experimental macOS arm64 native-binary path for explicitly verified versions from `2.1.113` through `2.1.169` except unsupported `2.1.115`, `2.1.125`, `2.1.127`, `2.1.130`, `2.1.134`, `2.1.135`, `2.1.147`, `2.1.149`, `2.1.151`, `2.1.154`, `2.1.155`, `2.1.157`, `2.1.163`, `2.1.164`, `2.1.166`, now guarded by stable display-surface auditing. On Windows, a PowerShell install script (`install.ps1`) is available for the old npm `cli.js` form (2.1.92–2.1.112). Windows native `.exe` is experimental for explicitly verified versions from `2.1.113` through `2.1.162` except unsupported `2.1.115`, `2.1.125`, `2.1.127`, `2.1.130`, `2.1.134`, `2.1.135`, `2.1.147`, `2.1.149`, `2.1.151`, `2.1.154`, `2.1.155`, `2.1.157`; unverified latest builds are skipped for CLI Patch (Layers 1–3 still active). Current support windows are documented in [docs/support-matrix.md](./docs/support-matrix.md).

```bash
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
./install.sh
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
