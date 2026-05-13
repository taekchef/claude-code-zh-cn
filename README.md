<div align="center">

# claude-code-zh-cn

**Claude Code 简体中文本地化插件**

让终端里的 AI 编程助手说中文 🇨🇳

[![GitHub](https://img.shields.io/badge/GitHub-taekchef%2Fclaude--code--zh--cn-blue?logo=github)](https://github.com/taekchef/claude-code-zh-cn)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
<!-- readme-support-window:badges:start -->
[![npm stable](https://img.shields.io/badge/npm%20stable-2.1.92--2.1.112-green)](./docs/support-matrix.md)
[![macOS installer](https://img.shields.io/badge/macos%20installer-skipped-lightgrey)](./docs/support-matrix.md)
<!-- readme-support-window:badges:end -->
[![Version](https://img.shields.io/github/v/tag/taekchef/claude-code-zh-cn?label=Version&color=blue)](https://github.com/taekchef/claude-code-zh-cn/releases)

**3 条命令安装 · 更新后自动修复 · 卸载不丢配置**

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
| macOS 官方安装器 / native / `latest` | 只启用 Layer 1~3；不改写 Mach-O，避免触发 macOS kill |
| Windows PowerShell | 只支持旧 npm `cli.js` 路径；遇到 native `.exe` 会跳过 CLI Patch，只启用 Layer 1~3 |

### 支持系统

<!-- readme-support-window:support-systems:start -->
| 系统 / 通道 | 当前口径 | 已验证窗口 | 说明 |
|------|---------|-----------|------|
| macOS / npm 全局安装 | `stable` | `2.1.92 - 2.1.112` | 启动前 launcher 自修复 + `session-start` 二层兜底 |
| macOS / 官方安装器 | `unsupported` | - | 官方安装器产物是 macOS native / Mach-O 二进制；为避免破坏签名并触发 macOS kill，install.sh 会跳过 CLI Patch，仅启用设置、Hook、输出风格和插件层中文化。 |
| Linux / npm 全局安装 | `stable` | `2.1.92 - 2.1.112` | 与 npm stable 同口径 |
| Linux / 官方安装器 | `unsupported` | - | 当前不承诺支持 |
| Windows / npm 全局安装 (PowerShell) | `stable` | `2.1.92 - 2.1.112` | 新增 PowerShell 安装脚本（install.ps1）；适用于旧 npm cli.js 形态，CLI Patch 可用；需 PowerShell 5.1+ |
| Windows / native .exe / latest | `unsupported` | - | 检测到 Windows native .exe 或 `2.1.113+` 时会跳过 CLI Patch，仅启用 Layer 1~3（设置 + Hook + 插件） |
| Windows / WSL + npm 全局安装 | 跟随 npm `stable` | `2.1.92 - 2.1.112` | **必须在 WSL 终端内运行**，使用 install.sh |

> **Windows 用户（原生 PowerShell）**：现已新增 PowerShell 安装脚本（install.ps1），可在 Windows 10/11 上原生安装**旧 npm cli.js 形态**的 Claude Code（`2.1.92 - 2.1.112`），无需 WSL。见下方「Windows 原生安装」章节。
>
> **Windows 用户（WSL）**：也可先安装 [WSL](https://learn.microsoft.com/zh-cn/windows/wsl/install)，然后在 WSL 中安装 Claude Code 和本插件。
>
> **Windows native .exe / latest 不支持 CLI Patch**：Windows native .exe（官方安装器或 2.1.113+ npm 原生 wrapper）会明确跳过 CLI Patch，仅启用 Layer 1~3；硬编码 UI 文字不会被完整翻译。如需完整中文化，请使用 `npm install -g @anthropic-ai/claude-code@2.1.112` 安装旧 npm 版本。
>
> **支持边界单一来源**：当前口径以 [docs/support-matrix.md](./docs/support-matrix.md) 为准。该文档由 `scripts/upstream-compat.config.json` + `node scripts/verify-upstream-compat.js --json` 通过 `node scripts/generate-support-matrix.js` 生成。
>
> **最新版说明**：Claude Code 从 `2.1.113` 开始，npm 主包切换为 native binary wrapper，不再包含旧的 `cli.js`。本插件当前 stable CLI Patch 支持到 `2.1.112`；macOS native / Mach-O 默认跳过 CLI Patch，仅启用设置、Hook、输出风格和插件层中文化；`latest` 不是 stable 承诺。
<!-- readme-support-window:support-systems:end -->

### 安装方式

<!-- readme-support-window:install-advice:start -->
当前安装方式口径如下：

| 安装方式 | 说明 | 当前口径 |
|---------|------|---------|
| `npm install -g @anthropic-ai/claude-code@2.1.112` | 推荐安装的旧 `cli.js` 版本；`2.1.92 - 2.1.112` 范围内也可用 | `stable` |
| `npm install -g @anthropic-ai/claude-code` | npm 全局安装最新版；2.1.113+ native wrapper 会跳过 CLI Patch | `skipped`（仅启用 Layer 1~3） |
| `curl -fsSL https://claude.ai/install.sh \| sh` | 官方安装器会安装 native / Mach-O 二进制；安装脚本不会改写该二进制 | `skipped`（仅启用 Layer 1~3） |
| `powershell -File install.ps1` | Windows PowerShell 安装（仅适用于旧 npm cli.js 形态；检测到 native .exe 时会跳过 CLI Patch） | `stable`（需 PowerShell 5.1+；CLI Patch 仅 npm 路径） |

安装脚本会自动检测安装方式，无需手动选择。

> **native binary 说明**：官方安装器和新版 npm 包都可能装到 native / Mach-O 二进制，不是旧 npm `cli.js`。本插件现在不会 extract / patch / repack 该二进制，避免破坏签名状态并触发 macOS kill；会继续启用设置、Hook、输出风格和插件层中文化。
>
> **不支持的安装方式**：如当前安装方式暂不支持 CLI Patch，安装脚本会明确提示并只启用 Layer 1~3，不会误报“已完成全部 patch”。
<!-- readme-support-window:install-advice:end -->

### 安装

```bash
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
./install.sh
```

安装脚本会自动：
- ✅ 备份现有 `~/.claude/settings.json` 和 npm `cli.js`
- ✅ 合并中文设置到 settings.json
- ✅ 安装插件到 `~/.claude/plugins/claude-code-zh-cn/`
- ✅ 在 stable 安装方式上 patch 硬编码文字（1666 条翻译；当前 stable 代表版本 `2.1.112` 实测 1513 处有效 patch，显示审计 11/11 PASS）
- ✅ 检测到 macOS native / Mach-O 时跳过 Layer 4，不改写官方二进制
- ✅ 如当前安装方式暂不支持 CLI Patch，自动跳过 Layer 4 并保留 Layer 1~3

### Windows 原生安装

```powershell
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
```

install.ps1 会自动完成与 install.sh 相同的步骤：依赖检查、插件同步、Launcher 安装、Settings 合并、CLI Patch（仅 npm cli.js 安装）、元数据写入。

> **CLI Patch 支持范围**：install.ps1 的 CLI Patch 仅适用于旧 npm cli.js 形态（`2.1.92 - 2.1.112`）。检测到 Windows native .exe 或 `2.1.113+` 原生 wrapper 时，会明确跳过 CLI Patch，只启用 Layer 1~3（设置 + Hook + 插件）。如需完整中文化，请使用 `npm install -g @anthropic-ai/claude-code@2.1.112` 安装旧 npm 版本。
>
> **注意**：PowerShell 脚本要求 PS 5.1+（Windows 10/11 自带）。

### 前置要求

- Claude Code CLI 版本请先对照 [docs/support-matrix.md](./docs/support-matrix.md)
- Node.js（CLI Patch 需要）
- 可选：jq（更精准的 JSON 合并）

### 验证

重启 Claude Code 后，发送任意请求。如果看到 spinner 显示“思考中”、“光合作用中”等中文，说明 Layer 1~3 已生效。若安装脚本还显示了 CLI Patch 成功摘要，或 npm 路径升级后首次启动未先掉回关键英文，则 Layer 4 也已启用。

### 更新

Claude Code 更新后，插件会在首次会话启动时**自动检测版本变更并重新 patch**，无需手动操作。

如需手动更新插件本体：

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
| UI 文字中文化 | 1666 条翻译，`2.1.112` 实测 1513 处有效 patch；macOS native / Mach-O 默认跳过二进制改写 | CLI Patch（仅 npm `cli.js` 路径；扫描真实双引号字符串 token 后逐条替换）+ 显示面审计 |
| 自动重 patch | - | 版本检测，更新后首次会话自动修复 |
| 插件自动更新 | - | SessionStart Hook（只跟随已发布 Release tag） |

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
├── install.ps1              ← 一键安装 (Windows PowerShell)
├── uninstall.sh             ← 一键卸载 (macOS/Linux)
├── uninstall.ps1            ← 一键卸载 (Windows PowerShell)
├── _validate.ps1            ← PowerShell 语法验证工具
├── patch-cli.sh             ← CLI Patch 入口脚本
├── patch-cli.js             ← CLI Patch 核心逻辑（扫描字符串字面量后逐条替换）
├── bun-binary-io.js         ← 原生二进制检测 / 版本读取工具（默认不改写 Mach-O）
├── cli-translations.json    ← 1666 条 UI 翻译对照表
├── settings-overlay.json    ← 合并到 settings.json 的中文设置
├── plugin/
│   ├── manifest.json        ← 插件清单
│   ├── hooks.json           ← Hook 事件配置
│   ├── bun-binary-io.js     ← 原生二进制检测 / 版本读取（与根目录拷贝一致）
│   ├── hooks/
│   │   ├── session-start    ← 注入中文上下文 + 自动 patch
│   │   ├── session-start.ps1 ← 同上 (Windows PowerShell)
│   │   ├── session-start.cmd ← CMD 包装器调用 session-start.ps1
│   │   ├── notification     ← 通知翻译
│   │   ├── notification.ps1 ← 同上 (Windows PowerShell)
│   │   └── notification.cmd ← CMD 包装器调用 notification.ps1
│   ├── bin/
│   │   ├── claude-launcher.sh    ← PATH 注入 launcher (macOS/Linux)
│   │   ├── claude-launcher.ps1   ← PATH 注入 launcher (Windows PowerShell)
│   │   └── claude-launcher.cmd   ← PATH 注入 launcher (CMD)
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

注意：Claude Code 从 `2.1.113` 开始，npm latest 切换为 native binary wrapper，不再包含旧的 `cli.js`。当前 stable CLI Patch 支持到 `2.1.112`。macOS 官方安装器 / native / Mach-O 路径默认跳过二进制改写，仅启用 Layer 1~3，避免破坏签名状态并触发 macOS kill。
</details>

<details>
<summary><b>插件发布新版本后需要手动重新安装吗？</b></summary>

通常不需要。`SessionStart` hook 会限频检查已发布的 Release tag；如果发现本地安装版本落后，会自动同步到最新 Release。

注意：

- 自动更新只跟随已发布的 Release tag
- 不会跟随 `main` 上未发布的开发中 commit
- 需要本地保留安装时使用的源码仓库；如果源码仓库已删除，插件仍可继续使用，只是不会自动更新
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
- Bug → 提 [Issue](https://github.com/taekchef/claude-code-zh-cn/issues)

## 许可证

[MIT](./LICENSE)

## 致谢

- UI 字符串提取自 [Claude Code](https://github.com/anthropics/claude-code)
- 灵感来自 [zstings/claude-code-zh-cn](https://github.com/zstings/claude-code-zh-cn)（Claude Code VS Code 扩展中文汉化）

---

## English

**claude-code-zh-cn** is a Simplified Chinese localization plugin for [Claude Code CLI](https://github.com/anthropics/claude-code).

It translates 187 spinner verbs, 41 spinner tips, 1666 UI translations, notification messages, and more. The CLI Patch uses safe string scanning for the legacy npm `cli.js` path. macOS native / Mach-O builds and Windows native `.exe` builds are detected and skipped for binary rewriting, while Layers 1–3 stay active. Current support windows are documented in [docs/support-matrix.md](./docs/support-matrix.md).

```bash
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
./install.sh
```

See full documentation above (in Chinese). PRs and issues welcome!

---

*本项目不是 Anthropic 官方产品。Claude Code 是 Anthropic Inc. 的商标。*
