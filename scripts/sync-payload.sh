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
)

for file in "${FILES[@]}"; do
  cp "$REPO_ROOT/$file" "$REPO_ROOT/plugin/$file"
done

mkdir -p "$REPO_ROOT/plugin/bin" "$REPO_ROOT/plugin/scripts"
cp "$REPO_ROOT/doctor.sh" "$REPO_ROOT/plugin/bin/doctor"
cp "$REPO_ROOT/scripts/zh-cn-doctor.js" "$REPO_ROOT/plugin/scripts/zh-cn-doctor.js"

chmod +x "$REPO_ROOT/plugin/patch-cli.sh" "$REPO_ROOT/plugin/compute-patch-revision.sh" "$REPO_ROOT/plugin/bin/doctor" 2>/dev/null || true

echo "已同步 payload 文件到 plugin/"
