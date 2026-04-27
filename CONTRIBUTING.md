# Contributing

## 快速开始

1. Fork 或创建功能分支
2. 修改代码
3. 跑本地校验
4. 提交 PR

## 本地校验

```bash
for file in install.sh uninstall.sh plugin/hooks/session-start plugin/hooks/notification; do bash -n "$file" || exit 1; done
for file in bun-binary-io.js plugin/bun-binary-io.js plugin/patch-cli.js scripts/verify-release-state.js scripts/verify-settings-sources.js; do node --check "$file" || exit 1; done
node scripts/verify-settings-sources.js
node --test tests/*.test.js
```

## payload 文件维护

以下文件在根目录和 `plugin/` 下各保留一份，发布时必须保持一致：

- `patch-cli.sh`
- `patch-cli.js`
- `cli-translations.json`
- `bun-binary-io.js`
- `compute-patch-revision.sh`

修改根目录文件后，运行：

```bash
bash scripts/sync-payload.sh
```

`tests/plugin-payload.test.js` 会校验这些文件没有漂移。

## 发布状态校验

发布新版本后，运行：

```bash
node scripts/verify-release-state.js
```

该检查会读取 `plugin/manifest.json` 和 `CHANGELOG.md` 顶部版本，确认两者一致，并确认同名 `vX.Y.Z` Git tag 与 GitHub Release 都存在。它依赖 GitHub CLI：

```bash
gh release view vX.Y.Z --json tagName,url
```

输出中的 `MISSING` 表示对应 tag/release 确实缺失；`ERROR` 表示 GitHub CLI、网络或权限导致状态无法确认，需要修复环境后重跑。

如果当前目录无法自动推断 GitHub 仓库，可以显式指定：

```bash
node scripts/verify-release-state.js --github-repo taekchef/claude-code-zh-cn
```

## 翻译数据规则

- `verbs/zh-CN.json` 是 spinner verbs 的唯一数据源
- `tips/zh-CN.json` 是 spinner tips 的唯一数据源
- `settings-overlay.json` 不重复存储 verbs / tips 的实际内容

改动这三个文件后，运行：

```bash
node scripts/verify-settings-sources.js
```

## 支持矩阵

- `npm` 安装：稳定支持
- `macOS 官方安装器`：实验性支持
- `Linux 官方安装器`：暂不支持
