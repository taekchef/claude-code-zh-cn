#!/usr/bin/env bash
# 诊断 claude-code-zh-cn 安装状态，并给出可执行的下一步建议。
# 用法: ./doctor.sh [--json]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$SCRIPT_DIR/scripts/zh-cn-doctor.js" "$@"
