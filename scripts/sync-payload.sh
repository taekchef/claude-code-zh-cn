#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

FILES=(
  "patch-cli.sh"
  "patch-cli.js"
  "cli-translations.json"
  "bun-binary-io.js"
  "compute-patch-revision.sh"
  "settings-overlay.json"
)

for file in "${FILES[@]}"; do
  cp "$REPO_ROOT/$file" "$REPO_ROOT/plugin/$file"
done

# spinner 动词/提示是 settings 合并的唯一数据源。它们必须打进 plugin/ 包，
# 否则纯 marketplace 安装（claude plugin install）后 session-start hook 读不到数据，
# spinner 中文化会是空的。
mkdir -p "$REPO_ROOT/plugin/verbs" "$REPO_ROOT/plugin/tips"
cp "$REPO_ROOT/verbs/zh-CN.json" "$REPO_ROOT/plugin/verbs/zh-CN.json"
cp "$REPO_ROOT/tips/zh-CN.json" "$REPO_ROOT/plugin/tips/zh-CN.json"

mkdir -p "$REPO_ROOT/plugin/bin" "$REPO_ROOT/plugin/scripts"
cp "$REPO_ROOT/doctor.sh" "$REPO_ROOT/plugin/bin/doctor"
cp "$REPO_ROOT/doctor.ps1" "$REPO_ROOT/plugin/bin/doctor.ps1"
cp "$REPO_ROOT/scripts/zh-cn-doctor.js" "$REPO_ROOT/plugin/scripts/zh-cn-doctor.js"

chmod +x "$REPO_ROOT/plugin/patch-cli.sh" "$REPO_ROOT/plugin/compute-patch-revision.sh" "$REPO_ROOT/plugin/bin/doctor" 2>/dev/null || true

echo "已同步 payload 文件到 plugin/"
