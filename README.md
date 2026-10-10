<div align="center">

# claude-code-zh-cn

**Claude Code 简体中文本地化插件**

让终端里的 Claude Code 彻底说人话 🇨🇳

[English](./README.en.md) · [简体中文](./README.md) · [官方网站](https://taekchef.github.io/claude-code-zh-cn/) · [Codex 中文版](https://github.com/taekchef/codex-code-zh-cn)

187 个趣味 spinner 动词，41 条中文提示，回复耗时中文化；另有 2194 条界面翻译。

[![GitHub](https://img.shields.io/badge/GitHub-taekchef%2Fclaude--code--zh--cn-blue?logo=github)](https://github.com/taekchef/claude-code-zh-cn)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
<!-- readme-support-window:badges:start -->
[![npm](https://img.shields.io/badge/npm-2.1.92--2.1.112-green)](./docs/support-matrix.md)
[![macOS native](https://img.shields.io/badge/macos%20native-2.1.113--2.1.295-green)](./docs/support-matrix.md)
[![Linux native](https://img.shields.io/badge/linux%20native-2.1.220--2.1.285-green)](./docs/support-matrix.md)
[![Windows native](https://img.shields.io/badge/windows%20native-2.1.113--2.1.289-green)](./docs/support-matrix.md)
<!-- readme-support-window:badges:end -->
[![Version](https://img.shields.io/github/v/tag/taekchef/claude-code-zh-cn?label=Version&color=blue)](https://github.com/taekchef/claude-code-zh-cn/releases)

**macOS · Linux · WSL · Windows**

**一行远程安装 · 启动自愈修复 · 会话内随时切中英文**

</div>

---

## 📢 赞助商

<div align="center">

<a href="https://www.infistar.cc/register?aff=J9HHJWNL&ref_source=link"><img src="./docs/assets/infistar-banner.png" alt="Infistar.cc 无限星河 — 一站式全球大模型 API 服务平台" /></a>

</div>

**claude-code-zh-cn × [Infistar.cc](https://www.infistar.cc/register?aff=J9HHJWNL&ref_source=link) 无限星河**

跑 Claude Code 自动写代码与长会话，Token 消耗极大，还常卡在海外信用卡和 429 报错 💸。

推荐 Infistar 的中转服务，体验顺手：
- ⚙️ **配置零成本**：设好 `ANTHROPIC_BASE_URL` 即跑，全面兼容 Claude Code 与本地化插件。
- 🏷️ **价格打穿底线**：低至官方 0.1 折起，倍率透明，挂着 Agent 疯狂刷代码不心疼。
- 🧩 **主流模型聚合**：Claude、DeepSeek、GPT、Gemini 一个 Key 全搞定。
- 💳 **国人友好**：人民币直付免海外卡，支持开票，全模型可验真。
- 🎁 **专属福利**：通过 [专属推广通道](https://www.infistar.cc/register?aff=J9HHJWNL&ref_source=link) 注册立送 $5 试跑额度，先领了跑几轮长会话测测代码生成效果 🚀！

---

## 🧐 为什么搞这个？

Claude Code 是个很顶的终端 AI 编程助手，但官方把整个界面硬编码在一个 13MB 的大文件里，短期内根本指望不上官方出中文。

敲代码已经够掉头发了，凭什么等待时还要面对冷冰冰的洋文 loading？

于是就有了这个项目 —— **一条命令，把终端界面、等待提示、耗时统计、系统通知全都变成地道中文，还把官方放飞自我的怪话动词全译成了中式幽默！**

---

## 👀 效果预览

https://github.com/user-attachments/assets/ff572893-f927-402c-9217-f68f04f4c9d5

原版在装模作样地 `Photosynthesizing...`，现在直接：

```text
⠙ 光合作用中...
💡 按 Shift+Tab 在默认模式、自动接受编辑模式和 Plan 模式之间切换
```

还有更多接地气的画风：

```text
⠙ 蹦迪中...          ⠙ 七荤八素中...         ⠙ 搞事情中...
⠙ 瞎忙活中...        ⠙ 花里胡哨中...         ⠙ 变魔术中...

  琢磨了 1分23秒
```

装完即用，AI 回复也默认优先说中文。

---

## ⚡ 极速安装

### 选项 A：极速脚本（推荐）

**macOS / Linux / WSL** 用户直接在终端粘贴回车：

```bash
curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/install-remote.sh | bash
```

**Windows** 用户通过 PowerShell 运行：

```powershell
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
```

### 选项 B：通过 Claude Code 官方插件市场安装

如果你已经在用 Claude Code 的插件体系：

```bash
claude plugin marketplace add --scope user https://github.com/taekchef/claude-code-zh-cn
claude plugin install claude-code-zh-cn@claude-code-zh-cn --scope user
```

装好后**重启一次 Claude Code**，看到“光合作用中”或“思考中”即表示大功告成！

---

## 🔄 会话内无痛切换中英文（0 Token 消耗）

查英文资料、或者遇到疑难 bug 想跟海外社区对齐报错时，**完全不需要卸载重装！**

直接在 Claude Code 的输入框里输入：

| 命令 | 效果 |
|---|---|
| `/chinese`（或 `/zh`） | 瞬间切回中文界面与趣味提示 |
| `/english`（或 `/en`） | 瞬间切回原汁原味的英文界面 |

底层的 Hook 会在输入时直接拦截处理，**不消耗任何 token**，毫秒级响应。

---

## 🎭 187 个整活动词大赏

原版 Claude Code 的 loading 动词里藏了一堆开发者的精神状态（`Flibbertigibbeting`、`Photosynthesizing`、`Moonwalking`...）。我们绝不搞机翻，全按原汁原味的本土梗翻译：

| 英文原版 | 中文神翻 | | 英文原版 | 中文神翻 |
|---|---|---|---|---|
| `Thinking` | 思考中 | | `Moonwalking` | 太空步中 |
| `Photosynthesizing` | 光合作用中 | | `Flibbertigibbeting` | 叽里呱啦中 |
| `Discombobulating` | 七荤八素中 | | `Whatchamacalliting` | 那个啊来着中 |
| `Shenaniganing` | 搞事情中 | | `Razzmatazzing` | 花里胡哨中 |
| `Boondoggling` | 瞎忙活中 | | `Prestidigitating` | 变魔术中 |
| `Clauding` | 克劳丁中 | | `Boogieing` | 蹦迪中 |
| `Canoodling` | 腻歪中 | | `Spelunking` | 探洞中 |

> 完整 187 个翻译见 [verbs/zh-CN.json](./verbs/zh-CN.json)

---

## 🛠️ 汉化覆盖与安全机制

| 功能模块 | 数量/规模 | 实现机制 |
|---|---|---|
| AI 回复偏好 | 默认中文 | `language: Chinese` |
| Spinner 动词 | 187 个 | `spinnerVerbs` |
| Spinner 提示 | 41 条 | `spinnerTipsOverride` |
| 系统通知 | 6 条 | Notification Hook 拦截翻译 |
| UI 文字中文化 | 2314 条翻译，`2.1.112` 实测 1779 处有效 patch | 字符串 Token 安全 Patch |
| 防崩与降级 | 全自动 | 启动前校验，失败自动回滚英文，绝不损坏 CLI |

<details>
<summary><b>展开查看：四层架构技术原理（怎么做到既汉化又不搞崩 CLI？）</b></summary>

Claude Code 的 UI 文字硬编码在 13MB 的压缩文件内。我们通过分层解耦实现无损汉化：

1. **Layer 1 原生设置注入**：直接注入 `settings.json`（动词、提示、语言），上游版本更新也不会丢失。
2. **Layer 2 Hook 系统**：在会话启动和通知弹出时无感注入中文能力。
3. **Layer 3 插件规范**：遵循官方 Plugin 体系，挂载标准能力。
4. **Layer 4 安全 Patch**：
   - 基于 Node.js 的**字符串字面量扫描器**，只改显示文本，绝不误触代码逻辑、注释或正则表达式。
   - 永远从原始纯净备份进行补丁，拒绝“补丁叠补丁”。
   - 包含严格的语法校验和启动自检。即使遇到未适配的全新上游版本，patch 硬编码文字（2314 条翻译；代表版本 `2.1.112` 实测 1779 处有效 patch）也能安全降级为英文，保证你的 Claude Code 永远可用。

</details>

---

## 💻 支持环境与版本

<!-- readme-support-window:support-systems:start -->
| 平台 / 安装形态 | 已验证版本窗口 | 说明 |
|------|-----------|------|
| macOS / Linux / WSL · npm 全局安装 | `2.1.92 - 2.1.112` | 翻译最完整；launcher 启动前自修复 + `session-start` 兜底 |
| macOS · 官方安装器（native） | `2.1.110 - 2.1.112` | 需要 `node-lief` |
| macOS · native binary（arm64） | `2.1.113 - 2.1.295` 内的已验证版本 | 需要 `node-lief`；个别版本未收录，见支持矩阵 |
| Linux · native binary（x64 glibc） | `2.1.220 - 2.1.285` | 需要 `node-lief >=1.3.0`；未收录版本先本机验证，不含 arm64、musl |
| Windows · npm（PowerShell） | `2.1.92 - 2.1.112` | 用 install.ps1，需 PowerShell 5.1+ |
| Windows · native .exe（x64） | `2.1.113 - 2.1.289` 内的已验证版本 | 需要 `node-lief`；个别版本未收录，见支持矩阵 |
| Linux · 其他官方安装器形态 | 暂无已验证版本 | 仅 Layer 1~3 生效 |

> - **macOS / Windows 版本号不是运行门禁**：高于已知 native 下限、且仍能被识别的新版会先在本机临时副本上翻译并执行启动自检；通过后才替换。已有词条继续中文，新文案原样保留英文。
> - **Linux 本机验证**：Linux x64 glibc 的未收录版本先按程序结构和启动自检验证；不支持 arm64、musl，不代表未来版本全量兼容。
> - **失败不伤 CLI**：补丁、重打包或启动自检任一步失败，都会保留或恢复原文件；失败只影响中文覆盖，不影响 Claude Code 使用。
> - **Windows 不热改运行中的 exe**：Claude Code 更新后先保持原版可用；关闭占用窗口后通过已安装的 `claude` 启动器再次启动，自动补丁并自检，无需重装。
> - **格式变化才停手**：如果未来版本不再是可识别的 native 格式、依赖缺失、提取失败或启动自检失败，只跳过 Layer 4，Layer 1~3 继续生效。
> - **矩阵只记录证据**：纯上游兼容证据可以更新支持矩阵，不要求插件升版；只有插件代码、翻译或 manifest 变化才发布新版。
> - **已验证版本完整清单**（含个别未收录版本）见 [docs/support-matrix.md](./docs/support-matrix.md)，由脚本自动生成。
> - Claude Code 从 `2.1.113` 起 npm 主包切换为 native binary，不再包含旧的 `cli.js`；要最完整的翻译请用 `npm install -g @anthropic-ai/claude-code@2.1.112`。
<!-- readme-support-window:support-systems:end -->

<!-- readme-support-window:install-advice:start -->
| 安装方式 | 中文化程度 |
|---------|-----------|
| `npm install -g @anthropic-ai/claude-code@2.1.112` | 最完整（推荐） |
| `npm install -g @anthropic-ai/claude-code`（latest） | macOS / Windows native 新版先本机自检；Linux x64 glibc 新版先本机自检 |
| `curl -fsSL https://claude.ai/install.sh \| bash -s 2.1.112` | 官方安装器指定已验证旧版本（需要 `node-lief`） |
| `curl -fsSL https://claude.ai/install.sh \| sh`（latest） | macOS 新版先本机自检；Linux x64 glibc 新版先本机自检 |
| `curl -fsSL https://claude.ai/install.sh \| bash -s 2.1.285` | Linux x64 glibc 已验证版本（需要 `node-lief >=1.3.0`）；不含 arm64、musl 或未验证版本 |
| `powershell -File install.ps1` | Windows：旧 npm cli.js 最完整；native .exe `2.1.113 - 2.1.289` 内已验证版本需 `node-lief`；Claude 更新后关闭所有窗口并重跑 |

> **native binary 说明**：官方安装器和新版 npm 包安装的是原生程序。插件会按容器格式翻译：源码构建提取并写回 JS，字节码构建在原字符串占位内写入中文；译文超过占位长度时保留英文。两条路径均在启动自检通过后记录成功，macOS 还会重新签名。已验证版本见[支持矩阵](./docs/support-matrix.md)，不代表完整中文覆盖。Linux x64 glibc 未收录版本须通过本机验证，需要 `node-lief >=1.3.0`。Windows 更新 Claude Code 后，请关闭所有 Claude Code 窗口，再通过已安装的 `claude` 启动器启动。

安装脚本会自动检测安装方式，无需手动选择。
<!-- readme-support-window:install-advice:end -->

完整已验证版本列表详见 [docs/support-matrix.md](./docs/support-matrix.md)。

---

## ❓ 常见问题

<details>
<summary><b>Claude Code 升级后汉化会失效吗？</b></summary>

不会搞坏你的环境。Layer 1~3（动词、提示、语言偏好）始终常驻生效；Layer 4 检测到新版本时会在启动前自动重补丁。即使遇到格式大改的新版，补丁失败也会自动回滚为英文，绝不卡死 Claude Code。
</details>

<details>
<summary><b>怎么彻底卸载？</b></summary>

想恢复纯正英文？
- macOS / Linux / WSL 用户运行：
  ```bash
  curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/uninstall-remote.sh | bash
  ```
- Windows 用户在克隆的源码目录运行 `uninstall.ps1`。
卸载会从备份完整还原原有文件，不留垃圾。
</details>

<details>
<summary><b>界面报错（403 / 超时 / 空响应）是汉化引起的吗？</b></summary>

不是。本插件只负责文案显示，不修改任何网络代理、鉴权和 API 请求。这类报错通常是 Anthropic 账号风控、网络代理不畅或第三方中转服务波动，可用 `./doctor.sh` 辅助排查。
</details>

<details>
<summary><b>可以自己改动词或提示词吗？</b></summary>

完全可以！直接编辑 `verbs/zh-CN.json`（动词）或 `tips/zh-CN.json`（等待提示），然后重新跑一次安装脚本即可。欢迎提交 PR 分享好玩的梗！
</details>


---

## 🔗 姊妹项目与友链

- [**codex-code-zh-cn**](https://github.com/taekchef/codex-code-zh-cn) — Codex CLI 简体中文本地化版本，同样支持 `/chinese` 与 `/english` 秒切。
- [Linux.do](https://linux.do)

## 🙏 致谢

- [@hjkl950217](https://github.com/hjkl950217)：贡献字节码常量池汉化方案及验证。
- 灵感来自 [zstings/claude-code-zh-cn](https://github.com/zstings/claude-code-zh-cn)（VS Code 插件版汉化）。

---

## 🌐 English Description

**claude-code-zh-cn** is a Simplified Chinese localization plugin for [Claude Code CLI](https://github.com/anthropics/claude-code). It translates 187 spinner verbs, 41 spinner tips, 2314 UI translations, notification messages, and more.

👉 **Full English documentation is available in [README.en.md](./README.en.md).**

---

*本项目非 Anthropic 官方产品。Claude Code 为 Anthropic Inc. 之注册商标。*
