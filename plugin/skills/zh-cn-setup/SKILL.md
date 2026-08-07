---
name: zh-cn-setup
description: 完成 Claude Code 中文本地化的首次增强安装——把 spinner/界面中文化配置合并进 settings.json、检测并同步 CC Switch 通用配置、提示重启让 CLI patch 生效。中文用户安装本插件后如发现 spinner 动词/提示仍是英文，或想完整启用中文化，请使用本 skill。
allowed-tools: Bash(node:${CLAUDE_PLUGIN_ROOT}/skills/zh-cn-setup/scripts/setup.js:*), Bash(node:*skills/zh-cn-setup/scripts/setup.js*:*), Write, Read
---

# zh-cn-setup：中文本地化增强安装

本 skill 是 `claude-code-zh-cn` 插件的首次增强安装入口。在用户通过 `claude plugin marketplace add` + `claude plugin install` 装好插件后，运行本 skill 可补齐以下"装插件本身不会自动完成"的步骤。

## 何时使用

当用户表达以下意图时主动触发：

- "spinner 还是英文" / "转圈的文字没翻译"
- "怎么完整启用中文" / "安装完后还要做什么"
- 在 Windows / macOS / Linux 上刚装好插件，想确认中文化是否完整

## 执行步骤

运行跨平台安装脚本（macOS / Linux / Windows 通用，需 Node.js）：

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/zh-cn-setup/scripts/setup.js"
```

脚本会自动完成：

1. **合并 spinner 中文化配置**到 `~/.claude/settings.json`（从插件内置的 verbs/tips 数据构建，只补齐缺失项，不覆盖用户已有配置；带备份 + 原子写）
2. **检测 CC Switch**：若检测到 CC Switch 的通用配置缺少中文设置，脚本会输出需要用户确认的提示——因为是交互式安装，**请把脚本输出的指令原文转达给用户**，让用户决定是否授权同步
3. **报告 patch 状态**并提示是否需要重启
4. **输出 skill 描述汉化的只读扫描、翻译和恢复命令**；CC Switch skill 位于 `~/.claude` 外时，使用 `ZH_CN_SKILL_I18N_EXTRA_ROOTS` 指定真实目录
5. **检测 CC Switch 数据库 skill 描述**：若 `~/.cc-switch/cc-switch.db` 的 `skills` 表中描述仍为英文、但对应 `SKILL.md` 已翻译为中文，脚本会提示运行可选工具 `cc-switch-descriptions.js`（默认只读预览，`--apply` 才写入并先备份数据库，输出还原命令）

## 重要约束

- **不要**在 skill 里调用 `claude plugin install` / `claude plugin update`：插件本体的安装/更新由用户手动或 Claude plugin manager 负责，避免"插件装自己/更新自己"的循环
- **CLI patch（npm cli.js / native exe）由 session-start hook 自动维护**，不在本 skill 内手动 patch。native exe 更新后需要用户关闭所有 Claude Code 窗口再重开，脚本会提示
- **CC Switch 数据库写入必须由用户主动授权**：`cc-switch-descriptions.js` 的 `--apply` 只在用户主动运行时执行，skill 只输出命令，不在进程内替用户写数据库
- 脚本所有写操作都带备份和失败回滚，不会让机器配置损坏

## CC Switch skill 描述同步工具

`ZH_CN_SKILL_I18N_EXTRA_ROOTS` 只翻译 `SKILL.md` 文件本体，**不会写 CC Switch 数据库**。若脚本检测到 `~/.cc-switch/cc-switch.db` 的 `skills` 表描述仍为英文，把以下命令原文转达给用户：

```bash
# 只读预览（默认，不写入）
node "${CLAUDE_PLUGIN_ROOT}/skills/zh-cn-setup/scripts/cc-switch-descriptions.js"
# 确认后写入（先备份数据库，输出还原命令）
node "${CLAUDE_PLUGIN_ROOT}/skills/zh-cn-setup/scripts/cc-switch-descriptions.js" --apply
```

同一份 `description` 同时用于 CC Switch 管理界面、Claude Code `/skills` 面板和 model 自动触发，所以默认只读、由用户决定是否 `--apply`。

## 给用户的最终提示

脚本跑完后，根据其输出告诉用户：

- 如果提示"请重启 Claude Code"：说明 CLI patch 已由 hook 处理，重启后生效
- 如果提示 CC Switch 同步：把脚本给出的手动步骤或授权命令转给用户
