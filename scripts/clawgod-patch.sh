#!/usr/bin/env bash
# clawgod-patch.sh — ClawGod 用户的中文 patches 支持
#
# ClawGod (https://github.com/0Chencc/clawgod) 从原生二进制提取 cli.js
# 为 cli.original.cjs 并打自己的补丁。此脚本检测 ClawGod 安装并为其
# 叠加中文本地化补丁，同时保留 ClawGod 自身改动。
#
# 用法:  source clawgod-patch.sh && patch_clawgod <patch-cli.sh路径>
#
# 在 session-start hook 中可选引用：
#   [ -f "$PLUGIN_ROOT/scripts/clawgod-patch.sh" ] && source "$PLUGIN_ROOT/scripts/clawgod-patch.sh" && patch_clawgod "$PLUGIN_ROOT/patch-cli.sh"

patch_clawgod() {
    local patch_cli_sh="${1:?patch_clawgod requires patch-cli.sh path}"
    local clawgod_file="$HOME/.clawgod/cli.original.cjs"
    local clawgod_bak="$clawgod_file.zh-cn-bak"

    [ -f "$clawgod_file" ] || return 0

    # 备份当前文件（含 ClawGod 补丁），仅首次
    if [ ! -f "$clawgod_bak" ]; then
        cp "$clawgod_file" "$clawgod_bak" 2>/dev/null || true
    fi

    # 原地 patch，不覆盖 ClawGod 补丁
    local patch_count
    patch_count=$("$patch_cli_sh" "$clawgod_file" 2>/dev/null || echo "0")
    if [ "$patch_count" != "0" ]; then
        echo "已 patch ClawGod cli.original.cjs（${patch_count} 处）"
    fi
}

# 直接执行模式
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    if [ -z "${1:-}" ]; then
        echo "用法: $0 <patch-cli.sh路径>"
        exit 1
    fi
    patch_clawgod "$1"
fi
