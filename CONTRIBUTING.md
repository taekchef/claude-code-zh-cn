# Contributing

## 快速开始

1. Fork 或创建功能分支
2. 修改代码
3. 跑本地校验
4. 提交 PR

## 本地校验

提交 PR 前跑这一条：

```bash
bash scripts/preflight.sh
```

它串起来的是 CI 里会拦 PR 的同一套检查：

| 检查 | 本地命令覆盖 |
| --- | --- |
| shell / JavaScript 语法 | `bash -n`、`node --check` |
| payload/source guard | `node scripts/check-payload-sources.js --base origin/main` |
| support-boundary | `node scripts/check-support-boundary.js` |
| 全量 tests | `node --test tests/*.test.js` |
| upstream compat | `node scripts/verify-upstream-compat.js` |
| translation sentinel | npm 拉取当前支持窗口最后一个版本，patch 后跑 `check-translation-sentinels.js` |
| support-matrix drift | 重新生成 `docs/support-matrix.md`，再跑 `git diff --exit-code` |

如果要对齐 GitHub PR 里的 base SHA：

```bash
bash scripts/preflight.sh --base <base-sha>
```

如果只是本地临时验证、没有 PR diff，可以跳过 payload/source guard：

```bash
bash scripts/preflight.sh --skip-payload-source
```

## payload 文件维护

以下文件在根目录和 `plugin/` 下各保留一份，发布时必须保持一致：

- `patch-cli.sh`
- `patch-cli.js`
- `cli-translations.json`
- `bun-binary-io.js`
- `compute-patch-revision.sh`

规则：

- 根目录文件是编辑源头，`plugin/` 下同名文件只是安装包 payload 镜像
- 不要单独手改 `plugin/cli-translations.json`、`plugin/patch-cli.js` 等镜像文件
- 要改翻译表，就改根目录 `cli-translations.json`
- 要改 patch 逻辑，就改根目录 `patch-cli.js` / `patch-cli.sh`
- 修改根目录源文件后，运行：

```bash
bash scripts/sync-payload.sh
```

CI 有两道检查：

- `scripts/check-payload-sources.js`：检查 PR 是否只改了 `plugin/` 镜像而没改源文件，或改了源文件但忘记同步镜像；失败时会列出不该手改的文件和应该改哪里
- `tests/plugin-payload.test.js`：检查根目录源文件和 `plugin/` 镜像内容完全一致

这两道检查只影响本地校验和 CI，不改变 `install.sh`、`plugin/hooks/session-start` 或用户现有安装流程。

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
