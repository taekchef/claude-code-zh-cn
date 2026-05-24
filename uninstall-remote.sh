#!/usr/bin/env bash
# Remote bootstrap uninstaller for claude-code-zh-cn.
# Intended usage after being attached to the latest GitHub Release:
#   curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/uninstall-remote.sh | bash

set -euo pipefail

REPO="${CCZH_REPO:-taekchef/claude-code-zh-cn}"
# Release workflow replaces these placeholders before uploading this file as a Release Asset.
EMBEDDED_REF="__CCZH_RELEASE_TAG__"
EMBEDDED_COMMIT="__CCZH_RELEASE_COMMIT__"
PLUGIN_DST="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/claude-code-zh-cn}"
INSTALLED_REF_FILE="$PLUGIN_DST/.installed-ref"
INSTALLED_COMMIT_FILE="$PLUGIN_DST/.installed-commit"
PATCH_TARGET_FILE="$PLUGIN_DST/.patched-target"
PATCH_KIND_FILE="$PLUGIN_DST/.patched-kind"
TMP_PARENT="${TMPDIR:-/tmp}"
if [ ! -d "$TMP_PARENT" ] || [ ! -w "$TMP_PARENT" ]; then
  TMP_PARENT="/tmp"
fi
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

read_first_line() {
  local file="$1"
  if [ -f "$file" ]; then
    head -n 1 "$file" | tr -d '\r'
  fi
}

api_get() {
  local path="$1"
  local url="https://api.github.com/repos/${REPO}${path}"

  if [ -n "${GITHUB_TOKEN:-}" ]; then
    curl -fsSL \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "$url"
  else
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "$url"
  fi
}

curl_download() {
  local url="$1"
  local output="$2"

  if [ -n "${GITHUB_TOKEN:-}" ]; then
    curl -fsSL \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "$url" -o "$output"
  else
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "$url" -o "$output"
  fi
}

json_string_field() {
  local field="$1"

  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; data=json.load(sys.stdin); value=data.get(sys.argv[1], ""); print("" if value is None else value)' "$field"
    return
  fi

  if command -v node >/dev/null 2>&1; then
    node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(0,"utf8")); const value=data[process.argv[1]] ?? ""; process.stdout.write(String(value));' "$field"
    return
  fi

  sed -nE "s/^[[:space:]]*\"${field}\"[[:space:]]*:[[:space:]]*\"([^\"]*)\".*/\1/p" | head -n 1
}

urlencode_ref() {
  local value="$1"

  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$value"
    return
  fi

  if command -v node >/dev/null 2>&1; then
    node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$value"
    return
  fi

  printf '%s' "$value" | sed 's/%/%25/g; s#/#%2F#g; s/ /%20/g'
}

has_embedded_ref() {
  [ -n "${EMBEDDED_REF:-}" ] && [ "$EMBEDDED_REF" != "__CCZH_RELEASE_TAG__" ]
}

has_embedded_commit() {
  [ -n "${EMBEDDED_COMMIT:-}" ] && [ "$EMBEDDED_COMMIT" != "__CCZH_RELEASE_COMMIT__" ]
}

resolve_commit_sha() {
  local ref="$1"
  local encoded_ref commit_json sha

  encoded_ref="$(urlencode_ref "$ref")"
  commit_json="$(api_get "/commits/${encoded_ref}")"
  sha="$(printf '%s' "$commit_json" | json_string_field sha)"

  if [ -z "$sha" ]; then
    echo "Error: failed to resolve commit for ${REPO}@${ref}" >&2
    exit 1
  fi

  printf '%s' "$sha"
}

resolve_latest_release() {
  local release_json
  release_json="$(api_get "/releases/latest")"
  REF="$(printf '%s' "$release_json" | json_string_field tag_name)"

  if [ -z "$REF" ]; then
    echo "Error: failed to resolve latest release tag for ${REPO}" >&2
    exit 1
  fi

  SOURCE_SHA="$(resolve_commit_sha "$REF")"
}

resolve_source() {
  local installed_ref installed_commit
  installed_ref="$(read_first_line "$INSTALLED_REF_FILE" 2>/dev/null || true)"
  installed_commit="$(read_first_line "$INSTALLED_COMMIT_FILE" 2>/dev/null || true)"

  if [ -n "${CCZH_REF:-}" ]; then
    REF="$CCZH_REF"
    SOURCE_SHA="$(resolve_commit_sha "$REF")"
  elif [ -n "$installed_ref" ] && [ -n "$installed_commit" ]; then
    REF="$installed_ref"
    SOURCE_SHA="$installed_commit"
  elif [ -n "$installed_ref" ]; then
    REF="$installed_ref"
    SOURCE_SHA="$(resolve_commit_sha "$REF")"
  elif has_embedded_ref && has_embedded_commit; then
    REF="$EMBEDDED_REF"
    SOURCE_SHA="$EMBEDDED_COMMIT"
  elif has_embedded_ref; then
    REF="$EMBEDDED_REF"
    SOURCE_SHA="$(resolve_commit_sha "$REF")"
  else
    resolve_latest_release
  fi

  ARCHIVE_URL="https://api.github.com/repos/${REPO}/tarball/${SOURCE_SHA}"
}

archive_top_dir() {
  local top_dir count
  count="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d '[:space:]')"
  if [ "$count" != "1" ]; then
    echo "Error: expected exactly one top-level directory after extracting ${REPO}@${REF}, got ${count}" >&2
    exit 1
  fi

  top_dir="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d -print -quit)"
  if [ -z "$top_dir" ]; then
    echo "Error: package directory not found after extracting ${REPO}@${REF}" >&2
    exit 1
  fi

  printf '%s' "$top_dir"
}

restore_recorded_patch() {
  local target kind backup
  target="$(read_first_line "$PATCH_TARGET_FILE" 2>/dev/null || true)"
  kind="$(read_first_line "$PATCH_KIND_FILE" 2>/dev/null || true)"

  if [ -z "$target" ]; then
    return 0
  fi

  backup="${target}.zh-cn-backup"
  if [ -f "$target" ] && [ -f "$backup" ]; then
    cp "$backup" "$target"
    rm -f "$backup"
    case "$kind" in
      npm) echo "==> Restored recorded npm cli.js patch target" ;;
      native-bun) echo "==> Restored recorded native binary patch target" ;;
      *) echo "==> Restored recorded patch target" ;;
    esac
  fi
}

need_cmd curl
need_cmd tar
need_cmd find
need_cmd bash
need_cmd wc
need_cmd tr
need_cmd sed
need_cmd head
need_cmd cp
need_cmd rm

REF=""
SOURCE_SHA=""
ARCHIVE_URL=""
ARCHIVE_FILE="$TMP_DIR/source.tar.gz"

resolve_source

echo "==> Downloading ${REPO}@${REF} (${SOURCE_SHA})"
curl_download "$ARCHIVE_URL" "$ARCHIVE_FILE"

echo "==> Extracting package"
tar -xzf "$ARCHIVE_FILE" -C "$TMP_DIR"

SRC_DIR="$(archive_top_dir)"
if [ ! -f "$SRC_DIR/uninstall.sh" ]; then
  echo "Error: uninstall.sh not found at package root after extracting ${REPO}@${REF}" >&2
  exit 1
fi

restore_recorded_patch

cd "$SRC_DIR"
export ZH_CN_SOURCE_REPO="$REPO"
export CCZH_INSTALLED_REF="$REF"
export CCZH_INSTALLED_COMMIT="$SOURCE_SHA"

bash ./uninstall.sh "$@"
