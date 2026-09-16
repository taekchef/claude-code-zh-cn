#!/usr/bin/env bash
# CI：下载两个官方版本到临时目录，验证正常启动入口完成升级后的汉化。
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
platform="$(node -p 'process.platform+"-"+process.arch')"
version="$(npm view @anthropic-ai/claude-code version)"
mkdir "$work/old" "$work/new"
for pair in "old:2.1.265" "new:$version"; do
    dir="${pair%%:*}"
    file="$(npm pack "@anthropic-ai/claude-code-${platform}@${pair#*:}" --pack-destination "$work/$dir" --silent)"
    tar -xzf "$work/$dir/$file" -C "$work/$dir"
done
binary=claude
[ "$platform" != "win32-x64" ] || binary=claude.exe
old="$work/old/package/$binary"
new="$work/new/package/$binary"
[ -f "$old" ] || old="$work/old/package/bin/$binary"
[ -f "$new" ] || new="$work/new/package/bin/$binary"
node "$repo/scripts/verify-native-install.js" "$old" "$new"
