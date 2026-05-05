#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PAYLOAD_BASE="${PREFLIGHT_BASE:-origin/main}"
SKIP_PAYLOAD_SOURCE=0

usage() {
  cat <<'EOF'
Usage: bash scripts/preflight.sh [--base <git-ref>] [--skip-payload-source]

Runs the local PR preflight suite that mirrors CI-blocking checks.

Options:
  --base <git-ref>       Base ref for payload/source guard. Default: origin/main
  --skip-payload-source  Skip the PR-diff payload/source guard, useful outside PR branches
  -h, --help             Show this help
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      if [ "$#" -lt 2 ]; then
        echo "preflight: --base requires a git ref" >&2
        exit 2
      fi
      PAYLOAD_BASE="$2"
      shift 2
      ;;
    --skip-payload-source)
      SKIP_PAYLOAD_SOURCE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "preflight: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cd "$REPO_ROOT"

step() {
  printf '\n==> %s\n' "$1"
}

run() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
  "$@"
}

TMP_DIR=""
cleanup() {
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

step "Shell syntax check"
run bash -n install.sh
run bash -n uninstall.sh
run bash -n plugin/bin/claude-launcher
run bash -n plugin/hooks/session-start
run bash -n plugin/hooks/notification
run bash -n plugin/profile/claude-code-zh-cn.sh

step "JavaScript syntax check"
run node --check bun-binary-io.js
run node --check plugin/bun-binary-io.js
run node --check plugin/patch-cli.js
run node --check scripts/check-payload-sources.js
run node --check scripts/check-support-boundary.js
run node --check scripts/check-translation-sentinels.js
run node --check scripts/generate-plugin-support-window.js
run node --check scripts/generate-support-matrix.js
run node --check scripts/sync-doc-derived-counts.js
run node --check scripts/verify-upstream-compat.js

if [ "$SKIP_PAYLOAD_SOURCE" -eq 1 ]; then
  step "Check payload source edits"
  echo "Skipped by --skip-payload-source"
else
  step "Check payload source edits"
  run node scripts/check-payload-sources.js --base "$PAYLOAD_BASE"
fi

step "Check support boundary"
run node scripts/check-support-boundary.js

step "Check plugin support window drift"
run node scripts/generate-plugin-support-window.js --write
run git diff --exit-code plugin/support-window.json

step "Run tests"
run node --test tests/*.test.js

step "Verify upstream compatibility"
run node scripts/verify-upstream-compat.js

step "Check translation sentinels"
TMP_DIR="$(mktemp -d)"
VERSION="$(node -e 'const config=require("./scripts/upstream-compat.config.json"); process.stdout.write(config.support.npm.stable.representatives.slice(-1)[0]);')"
PACK_OUTPUT="$TMP_DIR/npm-pack-output.txt"
printf '+ npm pack @anthropic-ai/claude-code@%s --silent\n' "$VERSION"
if ! (cd "$TMP_DIR" && npm pack @anthropic-ai/claude-code@${VERSION} --silent >"$PACK_OUTPUT"); then
  echo "preflight: npm pack failed for @anthropic-ai/claude-code@$VERSION" >&2
  exit 1
fi
TARBALL="$(tail -n 1 "$PACK_OUTPUT")"
run tar -xzf "$TMP_DIR/$TARBALL" -C "$TMP_DIR"
printf '+ node patch-cli.js %q cli-translations.json >/dev/null\n' "$TMP_DIR/package/cli.js"
node patch-cli.js "$TMP_DIR/package/cli.js" cli-translations.json >/dev/null
run node scripts/check-translation-sentinels.js "$TMP_DIR/package/cli.js"

step "Check support matrix drift"
run node scripts/generate-support-matrix.js
run git diff --exit-code docs/support-matrix.md

step "Check doc derived counts"
run node scripts/sync-doc-derived-counts.js --check

printf '\npreflight: OK\n'
