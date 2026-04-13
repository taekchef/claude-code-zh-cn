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

chmod +x "$REPO_ROOT/plugin/patch-cli.sh" "$REPO_ROOT/plugin/compute-patch-revision.sh" 2>/dev/null || true

echo "已同步 payload 文件到 plugin/"
