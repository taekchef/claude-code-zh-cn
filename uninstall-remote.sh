#!/usr/bin/env bash
# Remote bootstrap uninstaller for claude-code-zh-cn.
# Intended usage after being attached to the latest GitHub Release:
#   curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/uninstall-remote.sh | bash

set -euo pipefail

REPO="${CCZH_REPO:-taekchef/claude-code-zh-cn}"
TMP_PARENT="${TMPDIR:-/tmp}"
TMP_DIR="$(mktemp -d "$TMP_PARENT/claude-code-zh-cn.XXXXXX")"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command not found: $1" >&2
    exit 1
  fi
}

resolve_latest_tag() {
  local latest_url tag
  latest_url="$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/${REPO}/releases/latest")"
  tag="${latest_url##*/}"

  if [ -z "$tag" ] || [ "$tag" = "latest" ]; then
    echo "Error: failed to resolve latest release tag for ${REPO}" >&2
    exit 1
  fi

  printf '%s' "$tag"
}

need_cmd curl
need_cmd tar
need_cmd find
need_cmd bash

TAG="${CCZH_REF:-$(resolve_latest_tag)}"
ARCHIVE_URL="https://github.com/${REPO}/archive/refs/tags/${TAG}.tar.gz"
ARCHIVE_FILE="$TMP_DIR/source.tar.gz"

echo "==> Downloading ${REPO}@${TAG}"
curl -fsSL "$ARCHIVE_URL" -o "$ARCHIVE_FILE"

echo "==> Extracting package"
tar -xzf "$ARCHIVE_FILE" -C "$TMP_DIR"

SRC_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d -name 'claude-code-zh-cn-*' -print -quit)"
if [ -z "${SRC_DIR:-}" ] || [ ! -f "$SRC_DIR/uninstall.sh" ]; then
  echo "Error: uninstall.sh not found after extracting ${REPO}@${TAG}" >&2
  exit 1
fi

cd "$SRC_DIR"
export ZH_CN_SOURCE_REPO="$REPO"

bash ./uninstall.sh "$@"
