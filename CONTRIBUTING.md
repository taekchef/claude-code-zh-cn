# Contributing

## 快速开始

1. Fork 或创建功能分支
2. 修改代码
3. 跑本地校验
4. 提交 PR

## 本地校验

```bash
bash -n install.sh uninstall.sh plugin/hooks/session-start plugin/hooks/notification
node --check bun-binary-io.js plugin/bun-binary-io.js plugin/patch-cli.js
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

## 翻译数据规则

- `verbs/zh-CN.json` 是 spinner verbs 的唯一数据源
- `tips/zh-CN.json` 是 spinner tips 的唯一数据源
- `settings-overlay.json` 不重复存储 verbs / tips 的实际内容

## 支持矩阵

- `npm` 安装：稳定支持
- `macOS 官方安装器`：实验性支持
- `Linux 官方安装器`：暂不支持
