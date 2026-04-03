# claude-code-zh-cn

Claude Code CLI 中文本地化插件。

## 项目结构

- `patch-cli.sh` — CLI 硬编码文字 patch（被 install.sh 和 session-start hook 调用）
- `install.sh` / `uninstall.sh` — 安装/卸载脚本
- `settings-overlay.json` — 合并到 settings.json 的中文设置
- `plugin/` — 插件（manifest、hooks、output-styles）
- `verbs/zh-CN.json` — 187 个 spinner 动词翻译
- `tips/zh-CN.json` — 41 条 spinner 提示翻译
- `CHANGELOG.md` — 版本变更记录

## 技术要点

- patch-cli.sh 使用**内容匹配**（匹配英文原文），不依赖变量名，跨版本稳定
- cli.js 里的 `…` 是真实 U+2026 字符，不是 `\u2026` 转义序列
- node -e 在 bash 单引号里，用 Unicode 转义（`\uXXXX`）写中文，避免引号嵌套问题
- Hook 等技术术语保留英文（Hook 不是"钩子"，同 API、PR）

## 版本发布流程

每完成一批有意义的改动后，按以下步骤发布新版本：

1. **升版本号** — 修改 `plugin/manifest.json` 里的 `version`（语义化版本）
2. **更新 CHANGELOG** — 在 `CHANGELOG.md` 顶部新增版本段落，分"新增/改进/修复"
3. **提交** — `git commit`，提交信息带上版本号
4. **打 tag** — `git tag vX.Y.Z`
5. **推送** — `git push origin main --tags`
6. **发 Release** — `gh release create vX.Y.Z --title "vX.Y.Z" --notes "变更摘要"`
