# claude-code-zh-cn

> Claude Code 中文本地化插件 — 让 CLI 界面说中文

## 这是什么？

Claude Code 是 Anthropic 官方的命令行 AI 编程助手。本项目为它提供**简体中文**本地化支持，通过内置设置和插件系统实现，无需修改源码。

## 效果预览

| 功能 | 原文 | 中文 |
|------|------|------|
| AI 回复语言 | English | 中文（简体） |
| Spinner 动词 | Thinking, Analyzing... | 思考中, 分析中... |
| Spinner 提示 | Start with small features... | 从小功能或 bug 修复开始... |
| 错误信息说明 | Rate limited | 请求频率受限，请稍后再试 |
| 输出风格 | Default | Chinese |

## 覆盖范围

**已覆盖（~80% 用户可见文字）：**
- AI 回复语言（`language` 设置）
- 41 条 Spinner 提示（`spinnerTipsOverride`）
- 150+ 个 Spinner 动词（`spinnerVerbs`）
- 会话启动中文上下文注入
- 通知信息中文翻译
- 中文输出风格

**未覆盖（需 Anthropic 上游支持）：**
- 权限对话框（"Allow?", "Deny?"）
- `/help` 命令输出
- 设置菜单 UI
- Moth 伴生系统文字
- 键盘快捷键提示

## 安装

### 方式一：一键安装

```bash
git clone https://github.com/changfenhuang/claude-code-zh-cn.git
cd claude-code-zh-cn
./install.sh
```

### 方式二：最小安装

只使用内置设置，不安装插件：

```bash
# 将 settings-overlay.json 的内容手动合并到 ~/.claude/settings.json
cat settings-overlay.json
# 复制相关字段到你的 settings.json
```

### 前置要求

- Claude Code CLI >= 2.1.x
- Python 3（用于 JSON 合并）
- 可选：jq（更好的 JSON 处理）

## 卸载

```bash
cd claude-code-zh-cn
./uninstall.sh
```

## 项目结构

```
claude-code-zh-cn/
├── README.md                # 本文件
├── LICENSE                  # MIT
├── install.sh               # 安装脚本
├── uninstall.sh             # 卸载脚本
├── settings-overlay.json    # settings.json 中文覆盖片段
├── plugin/
│   ├── manifest.json        # 插件清单
│   ├── hooks.json           # Hook 配置
│   ├── hooks/
│   │   ├── session-start    # 会话启动时注入中文上下文
│   │   └── notification     # 通知翻译
│   └── output-styles/
│       └── chinese.json     # 中文输出风格定义
├── tips/
│   ├── en.json              # 英文 tips 原文（对照参考）
│   └── zh-CN.json           # 中文 tips 翻译
└── verbs/
    └── zh-CN.json           # 中文 verbs 翻译
```

## 技术原理

Claude Code CLI 所有 UI 文字硬编码在 13MB 的 `cli.js` 压缩包中，没有 i18n 基础设施。本项目利用三个层面的扩展点：

1. **内置设置** — `language`、`spinnerTipsOverride`、`spinnerVerbs` 直接修改用户可见文字
2. **Hook 系统** — `SessionStart`、`Notification` 等 26 种事件钩子注入中文上下文
3. **插件系统** — 标准 Claude Code 插件格式，可管理、可卸载

## 贡献

欢迎贡献！

- 翻译改进：编辑 `tips/zh-CN.json` 或 `verbs/zh-CN.json`
- 新功能：添加新的 hook 或 output style
- Bug 修复：提交 Issue 或 PR

## 许可证

MIT License

## 致谢

- 所有 UI 字符串提取自 [Claude Code](https://github.com/anthropics/claude-code) (v2.1.90)
- 灵感来自 VS Code 的 `zstings/claude-code-zh-cn` 扩展

---

**注意**：本项目不是 Anthropic 官方产品。Claude Code 是 Anthropic 的商标。
