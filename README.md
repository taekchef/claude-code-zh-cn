<div align="center">

# claude-code-zh-cn

**Claude Code 简体中文本地化插件**

让终端里的 AI 编程助手说中文 🇨🇳

[![GitHub](https://img.shields.io/badge/GitHub-taekchef%2Fclaude--code--zh--cn-blue?logo=github)](https://github.com/taekchef/claude-code-zh-cn)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A52.1.x-green)](https://github.com/anthropics/claude-code)

</div>

---

## 安装后你的终端会变成这样

```
⠋ 光合作用中...

  💡 按 Shift+Tab 在默认模式、自动接受编辑模式和 Plan 模式之间切换
```

```
⠋ 蹦迪中...

  💡 你知道可以直接把图片文件拖拽到终端里吗？
```

```
  琢磨了 1m 23s
```

188 个趣味 spinner 动词，41 条中文提示，回复耗时中文化，AI 默认中文回复。装完即用。

## 特色：188 个趣味动词翻译

原版 Claude Code 的 spinner 有一堆故意搞怪的英文动词（`Flibbertigibbeting`、`Photosynthesizing`、`Moonwalking`...），我们全部按原味翻译了：

| 英文 | 中文 | | 英文 | 中文 |
|------|------|-|------|------|
| `Thinking` | 思考中 | | `Moonwalking` | 太空步中 |
| `Photosynthesizing` | 光合作用中 | | `Flibbertigibbeting` | 叽里呱啦中 |
| `Discombobulating` | 七荤八素中 | | `Whatchamacalliting` | 那个啥来着中 |
| `Shenaniganing` | 搞事情中 | | `Razzmatazzing` | 花里胡哨中 |
| `Boondoggling` | 瞎忙活中 | | `Prestidigitating` | 变魔术中 |
| `Clauding` | 克劳丁中 | | `Boogieing` | 蹦迪中 |
| `Canoodling` | 腻歪中 | | `Spelunking` | 探洞中 |

完整 188 个翻译见 [verbs/zh-CN.json](./verbs/zh-CN.json)

## 覆盖了什么

| 功能 | 数量 | 怎么做的 |
|------|------|---------|
| AI 回复语言 | - | `language: Chinese` |
| Spinner 动词 | 188 个 | `spinnerVerbs` |
| Spinner 提示 | 41 条 | `spinnerTipsOverride` |
| 中文上下文注入 | - | SessionStart Hook |
| 通知翻译 | 6 条 | Notification Hook |
| 输出风格 | - | Chinese Output Style |
| 回复耗时动词 | 8 个 | CLI Patch（琢磨了、搞定了...） |
| /btw /clear 提示 | 2 条 | CLI Patch |
| Tip/回顾/提醒文字 | 3 处 | CLI Patch |

**注意**：CLI Patch 通过 `sed` 修改 `cli.js`，Claude Code 更新后需重跑 `./install.sh`。

权限对话框、`/help` 输出等硬编码 UI 暂未覆盖（需 Anthropic 官方支持）。

## 快速开始

### 安装

```bash
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
./install.sh
```

安装脚本会自动：
- 备份现有 `~/.claude/settings.json` 和 `cli.js`
- 合并中文设置到 settings.json
- 安装插件到 `~/.claude/plugins/claude-code-zh-cn/`
- Patch cli.js 硬编码文字（回复耗时、/btw、/clear 等）

### 前置要求

- Claude Code CLI >= 2.1.x
- Python 3
- 可选：jq（更精准的 JSON 合并）

### 验证

重启 Claude Code 后，发送任意请求。如果看到 spinner 显示"思考中"、"光合作用中"等中文，说明生效了。

### 卸载

```bash
cd claude-code-zh-cn
./uninstall.sh
```

自动恢复原始 settings.json 并移除插件。

## 项目结构

```
claude-code-zh-cn/
├── README.md                ← 你在这里
├── LICENSE                  ← MIT
├── install.sh               ← 一键安装
├── uninstall.sh             ← 一键卸载
├── settings-overlay.json    ← 合并到 settings.json 的中文设置
├── plugin/
│   ├── manifest.json        ← 插件清单
│   ├── hooks.json           ← Hook 事件配置
│   ├── hooks/
│   │   ├── session-start    ← 注入中文上下文
│   │   └── notification     ← 通知翻译
│   └── output-styles/
│       └── chinese.json     ← 中文输出风格
├── tips/
│   ├── en.json              ← 英文原文（对照）
│   └── zh-CN.json           ← 中文翻译
└── verbs/
    └── zh-CN.json           ← 188 个中文动词
```

## 技术原理

<details>
<summary>展开看原理</summary>

Claude Code CLI 是一个 13MB 的单文件压缩包（`cli.js`），所有 UI 文字硬编码其中，没有 i18n 基础设施。本项目通过四层机制实现中文化：

**Layer 1 — 内置设置**（稳定，更新后不丢失）
- `language`: 控制 AI 回复语言
- `spinnerTipsOverride`: 替换等待提示文字
- `spinnerVerbs`: 替换 spinner 动词

**Layer 2 — Hook 系统**（稳定，更新后不丢失）
- `SessionStart`: 会话启动时注入中文上下文指令
- `Notification`: 拦截系统通知并翻译

**Layer 3 — 插件系统**（稳定，更新后不丢失）
- 标准 Claude Code 插件格式
- 提供 Chinese Output Style

**Layer 4 — CLI Patch**（更新后需重跑 install.sh）
- `sed` 替换 `cli.js` 中的硬编码文字
- 回复耗时动词、/btw、/clear 提示、Tip 前缀等
- 有备份机制，`uninstall.sh` 可还原

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

## 贡献

欢迎 PR！

- 翻译改进 → 编辑 `tips/zh-CN.json` 或 `verbs/zh-CN.json`
- 新功能 → 添加 hook 或 output style
- Bug → 提 [Issue](https://github.com/taekchef/claude-code-zh-cn/issues)

## 许可证

[MIT](./LICENSE)

## 致谢

- UI 字符串提取自 [Claude Code](https://github.com/anthropics/claude-code) v2.1.90
- 灵感来自 `zstings/claude-code-zh-cn` VS Code 扩展

---

*本项目不是 Anthropic 官方产品。Claude Code 是 Anthropic Inc. 的商标。*
