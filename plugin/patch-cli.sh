#!/usr/bin/env bash
# patch-cli.sh - cli.js 硬编码文字中文 patch 入口
# 被 install.sh 和 session-start hook 调用
# 用法: patch-cli.sh <cli.js路径> [--backup <备份路径>] [--status <状态文件>]
# 返回值(stdout): 成功 patch 的数量；失败/无改动输出 0
# 错误详情写入插件目录 patch.log（由 patch-cli.js 负责），不再静默丢弃

set -euo pipefail

CLI_FILE="${1:-}"

if [ -z "$CLI_FILE" ] || [ ! -f "$CLI_FILE" ]; then
    echo "0"
    exit 0
fi

shift

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

node "$SCRIPT_DIR/patch-cli.js" "$CLI_FILE" "$SCRIPT_DIR/cli-translations.json" "$@"
