<div align="center">

# claude-code-zh-cn

**Claude Code 简体中文本地化插件**

让终端里的 AI 编程助手说中文 🇨🇳

[![GitHub](https://img.shields.io/badge/GitHub-taekchef%2Fclaude--code--zh--cn-blue?logo=github)](https://github.com/taekchef/claude-code-zh-cn)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A52.1.x-green)](https://github.com/anthropics/claude-code)
[![Version](https://img.shields.io/badge/Version-2.0.4-blue)](./CHANGELOG.md)

**3 条命令安装 · 更新后自动修复 · 卸载不丢配置**

</div>

---

## 为什么做这个？

Claude Code 是一个很棒的终端 AI 编程助手，但它没有中文界面——所有 UI 文字硬编码在一个 13MB 的 `cli.js` 里，没有 i18n 基础设施。

官方短期内不太可能加中文支持。所以我做了这个插件，通过四层机制（设置注入 + Hook 系统 + 插件系统 + CLI Patch）实现中文化，**不修改上游代码，更新后自动修复**。

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

### 支持系统

| 系统 | 支持方式 | 安装位置 |
|------|---------|---------|
| macOS | 原生支持 | 终端直接运行 |
| Linux | 原生支持 | 终端直接运行 |
| Windows | 通过 WSL | **必须在 WSL 终端内运行**，不支持 Git Bash / PowerShell |

> **Windows 用户**：先安装 [WSL](https://learn.microsoft.com/zh-cn/windows/wsl/install)，然后在 WSL 中安装 Claude Code 和本插件。不支持原生 Windows。

### 安装

```bash
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
./install.sh
```

安装脚本会自动：
- ✅ 备份现有 `~/.claude/settings.json` 和 `cli.js`
- ✅ 合并中文设置到 settings.json
- ✅ 安装插件到 `~/.claude/plugins/claude-code-zh-cn/`
- ✅ Patch cli.js 硬编码文字（1463 条翻译，1443 处有效 patch）

### 前置要求

- Claude Code CLI >= 2.1.x
- Node.js（CLI Patch 需要）
- Python 3
- 可选：jq（更精准的 JSON 合并）

### 验证

重启 Claude Code 后，发送任意请求。如果看到 spinner 显示“思考中”、“光合作用中”等中文，说明生效了。

### 更新

Claude Code 更新后，插件会在首次会话启动时**自动检测版本变更并重新 patch**，无需手动操作。

如需手动更新插件本体：

```bash
cd claude-code-zh-cn
git pull
./install.sh
```

### 卸载

```bash
cd claude-code-zh-cn
./uninstall.sh
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
| UI 文字全量中文化 | 1463 条翻译，1443 处有效 patch | CLI Patch（逐条正则匹配双引号字符串） |
| 自动重 patch | - | 版本检测，更新后首次会话自动修复 |
| 插件自动更新 | - | SessionStart Hook（只跟随已发布 Release tag） |

## 技术原理

<details>
<summary>展开看四层架构</summary>

Claude Code CLI 是一个 13MB 的单文件压缩包（`cli.js`），所有 UI 文字硬编码其中，没有 i18n 基础设施。本项目通过四层机制实现中文化：

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
- 基于 Node.js 的**逐条正则匹配**，对每条翻译构建 `/"...en..."/g` 正则在双引号字符串内替换
- 通过 offset 检查排除正则字面量中的 `"`（如 `/"Error"/` 不被误改）
- 从 `cli-translations.json` 读取翻译，按长度降序批量替换
- 覆盖：状态消息、按钮文字、错误提示、设置页面、导航、快捷键说明等
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
├── install.sh               ← 一键安装
├── uninstall.sh             ← 一键卸载（精准删除，不丢配置）
├── patch-cli.sh             ← CLI Patch 入口脚本
├── patch-cli.js             ← CLI Patch 核心逻辑（逐条正则匹配双引号字符串）
├── cli-translations.json    ← 1463 条 UI 翻译对照表
├── settings-overlay.json    ← 合并到 settings.json 的中文设置
├── plugin/
│   ├── manifest.json        ← 插件清单
│   ├── hooks.json           ← Hook 事件配置
│   ├── hooks/
│   │   ├── session-start    ← 注入中文上下文 + 自动 patch
│   │   └── notification     ← 通知翻译
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

Layer 1~3（设置、Hook、插件）完全不受影响。Layer 4（CLI Patch）会在更新后首次启动时自动检测版本变更并重新 patch，你不需要做任何事情。
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

macOS、Linux 和 Windows（通过 WSL）。需要 Node.js、Python 3。可选依赖 jq（用于更精准的 JSON 合并）。

**Windows 用户注意**：Claude Code 在 Windows 上通过 WSL 运行。请在 WSL 终端内执行安装脚本，不要在 Git Bash 或 PowerShell 中运行。
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

It translates 187 spinner verbs, 41 spinner tips, 1463 UI translations (1443 effective patches on Claude Code 2.1.96), notification messages, and more. The patch uses per-entry regex matching on double-quoted string boundaries, with regex literal exclusion via offset checks. After Claude Code updates, the plugin automatically re-patches on next session start. Supports macOS, Linux, and Windows (via WSL).

```bash
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
./install.sh
```

See full documentation above (in Chinese). PRs and issues welcome!

---

*本项目不是 Anthropic 官方产品。Claude Code 是 Anthropic Inc. 的商标。*
