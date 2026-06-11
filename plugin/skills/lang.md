---
name: lang
description: 切换界面语言 / Switch UI language
---

# /lang

切换 Claude Code 界面语言。当前可用语言：

- `zh-CN` — 简体中文

## 用法

```
/lang           查看当前语言和可用选项
/lang zh-CN     切换到简体中文
```

## 实现

调用插件 i18n 模块写入 settings.json：

```bash
node ~/.claude/plugins/claude-code-zh-cn/core/i18n.js set-locale zh-CN
```

重启 Claude Code 生效。当前语言存储在 `settings.json` 的 `i18n.locale` 字段。
