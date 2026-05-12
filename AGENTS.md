# claude-code-zh-cn

Claude Code CLI 中文本地化插件。

## 项目结构

- `patch-cli.sh` — CLI 硬编码文字 patch（被 install.sh 和 session-start hook 调用）
- `cli-translations.json` — 1666 条 UI 翻译对照表（英文→中文），patch-cli.sh 从此文件读取
- `install.sh` / `uninstall.sh` — 安装/卸载脚本
- `compute-patch-revision.sh` — patch 规则指纹计算，供 install.sh 和 session-start hook 共用
- `settings-overlay.json` — 合并到 settings.json 的中文设置（只含 language、spinnerTipsEnabled 等独有配置，**不含** verbs 和 tips 数据）
- `plugin/` — 插件（manifest、hooks、output-styles）
- `verbs/zh-CN.json` — 187 个 spinner 动词翻译（**唯一数据源**）
- `tips/zh-CN.json` — 41 条 spinner 提示翻译（**唯一数据源**）
- `CHANGELOG.md` — 版本变更记录

## 数据流

翻译数据**单一来源**，不允许重复维护：

- `verbs/zh-CN.json` 是动词的**唯一数据源**
- `tips/zh-CN.json` 是提示的**唯一数据源**
- `settings-overlay.json` **不重复存放** verbs 和 tips 数据
- `install.sh` 安装时从上述两个 JSON 文件动态读取，现场组装合并到 `~/.claude/settings.json`

**禁止**把 verbs 或 tips 的内容复制到 settings-overlay.json 里。如果要修改翻译，只改 verbs/ 或 tips/ 里的文件。

## 技术要点

- patch-cli.sh 使用**内容匹配**（匹配英文原文），不依赖变量名，跨版本稳定
- 从 `cli-translations.json` 批量读取翻译，按字符串长度**降序**替换（长字符串优先，避免子串冲突）
- cli.js 里的 `…` 是真实 U+2026 字符，不是 `\u2026` 转义序列
- node -e 在 bash 单引号里，用 Unicode 转义（`\uXXXX`）写中文，避免引号嵌套问题
- Hook 等技术术语保留英文（Hook 不是"钩子"，同 API、PR）
- Windows 兼容：NTFS 上 `fs.renameSync` 先 unlink 再 rename

## 版本发布流程

每完成一批有意义的改动后，按以下步骤发布新版本：

1. **升版本号** — 修改 `plugin/manifest.json` 里的 `version`（语义化版本）
2. **更新 CHANGELOG** — 在 `CHANGELOG.md` 顶部新增版本段落，分"新增/改进/修复"
3. **提交** — `git commit`，提交信息带上版本号
4. **打 tag** — `git tag vX.Y.Z`
5. **推送** — `git push origin main --tags`
6. **发 Release** — `gh release create vX.Y.Z --title "vX.Y.Z" --notes "变更摘要"`
7. **发布状态校验** — `bash scripts/preflight.sh --release-state`，确认 manifest / CHANGELOG / tag / GitHub Release 对齐
