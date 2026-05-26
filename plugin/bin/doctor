#!/usr/bin/env bash
# 诊断 claude-code-zh-cn 安装状态，并给出可执行的下一步建议。
# 用法: ./doctor.sh [--json]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SCRIPT_DIR/scripts/zh-cn-doctor.js" ]; then
  exec node "$SCRIPT_DIR/scripts/zh-cn-doctor.js" "$@"
fi

if [ -f "$SCRIPT_DIR/../scripts/zh-cn-doctor.js" ]; then
  export ZH_CN_DOCTOR_REPO="${ZH_CN_DOCTOR_REPO:-$(cd "$SCRIPT_DIR/.." && pwd)}"
  exec node "$SCRIPT_DIR/../scripts/zh-cn-doctor.js" "$@"
fi

echo "doctor: 找不到 scripts/zh-cn-doctor.js" >&2
exit 1
