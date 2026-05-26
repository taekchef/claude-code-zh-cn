#!/usr/bin/env bash
# Print a pasteable install/update diagnostic report for claude-code-zh-cn.

set -u

PLUGIN_SLUG="claude-code-zh-cn"
DEFAULT_PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/$PLUGIN_SLUG}"

script_dir() {
    local source="${BASH_SOURCE[0]}"
    cd "$(dirname "$source")" >/dev/null 2>&1 && pwd
}

detect_plugin_root() {
    local dir
    dir="$(script_dir)"

    if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "$CLAUDE_PLUGIN_ROOT/manifest.json" ]; then
        printf "%s" "$CLAUDE_PLUGIN_ROOT"
        return
    fi

    if [ -f "$dir/manifest.json" ]; then
        printf "%s" "$dir"
        return
    fi

    if [ -f "$dir/../manifest.json" ]; then
        (cd "$dir/.." >/dev/null 2>&1 && pwd)
        return
    fi

    if [ -f "$dir/plugin/manifest.json" ]; then
        printf "%s" "$dir/plugin"
        return
    fi

    printf "%s" "$DEFAULT_PLUGIN_ROOT"
}

read_first_line() {
    local file="$1"
    if [ -f "$file" ]; then
        head -n 1 "$file" 2>/dev/null | tr -d '\r'
    fi
}

value_or_missing() {
    local value="${1:-}"
    if [ -n "$value" ]; then
        printf "%s" "$value"
    else
        printf "未记录"
    fi
}

manifest_version() {
    local file="$1"
    if [ ! -f "$file" ]; then
        printf "未找到 manifest.json"
        return
    fi

    if command -v node >/dev/null 2>&1; then
        node -e 'const fs=require("fs"); try { const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(data.version || "")); } catch {}' "$file" 2>/dev/null
        return
    fi

    sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$file" | head -n 1
}

format_epoch() {
    local epoch="$1"
    case "$epoch" in
        ''|*[!0-9]*)
            printf "%s" "$epoch"
            return
            ;;
    esac

    date -r "$epoch" "+%Y-%m-%d %H:%M:%S %z" 2>/dev/null \
        || date -d "@$epoch" "+%Y-%m-%d %H:%M:%S %z" 2>/dev/null \
        || printf "%s" "$epoch"
}

format_update_status() {
    local raw="$1"
    local code version epoch formatted

    if [ -z "$raw" ]; then
        printf "未记录"
        return
    fi

    code="$(printf "%s" "$raw" | awk '{print $1}')"
    version="$(printf "%s" "$raw" | awk '{print $2}')"
    epoch="$(printf "%s" "$raw" | awk '{print $3}')"

    if [ -n "$epoch" ]; then
        formatted="$(format_epoch "$epoch")"
        printf "%s %s（%s；raw: %s）" "$code" "$version" "$formatted" "$raw"
    else
        printf "%s" "$raw"
    fi
}

resolve_real_path() {
    local file="$1"
    if [ -z "$file" ]; then
        return
    fi

    if command -v node >/dev/null 2>&1; then
        node -e 'try { process.stdout.write(require("fs").realpathSync(process.argv[1])); } catch {}' "$file" 2>/dev/null
        return
    fi

    readlink "$file" 2>/dev/null || printf "%s" "$file"
}

find_real_claude_binary() {
    if [ -n "${ZH_CN_REAL_CLAUDE:-}" ] && [ -x "${ZH_CN_REAL_CLAUDE:-}" ]; then
        printf "%s" "$ZH_CN_REAL_CLAUDE"
        return
    fi

    local launcher_bin_dir="${ZH_CN_LAUNCHER_BIN_DIR:-$HOME/.claude/bin}"
    local filtered_path=""
    local path_entry
    local old_ifs="$IFS"

    IFS=':'
    for path_entry in ${PATH:-}; do
        if [ "${path_entry:-}" = "$launcher_bin_dir" ]; then
            continue
        fi

        if [ -z "$filtered_path" ]; then
            filtered_path="$path_entry"
        else
            filtered_path="${filtered_path}:$path_entry"
        fi
    done
    IFS="$old_ifs"

    PATH="$filtered_path" command -v claude 2>/dev/null || true
}

all_claude_commands() {
    if command -v which >/dev/null 2>&1; then
        which -a claude 2>/dev/null || true
        return
    fi

    command -v claude 2>/dev/null || true
}

claude_version() {
    local binary="$1"
    if [ -z "$binary" ] || [ ! -x "$binary" ]; then
        printf "未检测到"
        return
    fi

    "$binary" --version 2>&1 | head -n 1 | tr -d '\r' || printf "读取失败"
}

detect_current_install() {
    local plugin_root="$1"
    local binary="$2"

    if [ -z "$binary" ] || [ ! -f "$plugin_root/bun-binary-io.js" ] || ! command -v node >/dev/null 2>&1; then
        return
    fi

    node "$plugin_root/bun-binary-io.js" detect "$binary" 2>/dev/null || true
}

print_state_file() {
    local plugin_root="$1"
    local name="$2"
    local value
    value="$(read_first_line "$plugin_root/$name")"
    printf "%s: %s\n" "$name" "$(value_or_missing "$value")"
}

PLUGIN_ROOT="$(detect_plugin_root)"
MANIFEST_FILE="$PLUGIN_ROOT/manifest.json"

SOURCE_REPO="$(read_first_line "$PLUGIN_ROOT/.source-repo")"
LAST_UPDATE_STATUS="$(read_first_line "$PLUGIN_ROOT/.last-update-status")"
LAST_UPDATE_CHECK="$(read_first_line "$PLUGIN_ROOT/.last-update-check")"
INSTALLED_REF="$(read_first_line "$PLUGIN_ROOT/.installed-ref")"
INSTALLED_COMMIT="$(read_first_line "$PLUGIN_ROOT/.installed-commit")"
PATCHED_TARGET="$(read_first_line "$PLUGIN_ROOT/.patched-target")"
PATCHED_KIND="$(read_first_line "$PLUGIN_ROOT/.patched-kind")"
PATCHED_VERSION="$(read_first_line "$PLUGIN_ROOT/.patched-version")"

REAL_CLAUDE="$(find_real_claude_binary)"
REAL_CLAUDE_PATH="$(resolve_real_path "$REAL_CLAUDE")"
CURRENT_INSTALL="$(detect_current_install "$PLUGIN_ROOT" "$REAL_CLAUDE_PATH")"
CURRENT_KIND="未检测到"
CURRENT_TARGET="未检测到"
if [ -n "$CURRENT_INSTALL" ]; then
    case "$CURRENT_INSTALL" in
        *:*)
            CURRENT_KIND="${CURRENT_INSTALL%%:*}"
            CURRENT_TARGET="${CURRENT_INSTALL#*:}"
            ;;
        *)
            CURRENT_KIND="$CURRENT_INSTALL"
            CURRENT_TARGET="未检测到"
            ;;
    esac
fi

printf "claude-code-zh-cn 更新诊断\n"
printf "生成时间: %s\n" "$(date "+%Y-%m-%d %H:%M:%S %z" 2>/dev/null || true)"
printf "\n"
printf "插件目录: %s\n" "$PLUGIN_ROOT"
printf "插件版本: %s\n" "$(value_or_missing "$(manifest_version "$MANIFEST_FILE")")"
printf "安装来源: %s\n" "$(value_or_missing "$SOURCE_REPO")"
printf "最近更新: %s\n" "$(format_update_status "$LAST_UPDATE_STATUS")"
if [ -n "$LAST_UPDATE_CHECK" ]; then
    printf "最近检查: %s（raw: %s）\n" "$(format_epoch "$LAST_UPDATE_CHECK")" "$LAST_UPDATE_CHECK"
else
    printf "最近检查: 未记录\n"
fi
printf "\n"
printf "远程安装 ref: %s\n" "$(value_or_missing "$INSTALLED_REF")"
printf "远程安装 commit: %s\n" "$(value_or_missing "$INSTALLED_COMMIT")"
printf "\n"
printf "记录的 patch 类型: %s\n" "$(value_or_missing "$PATCHED_KIND")"
printf "记录的 patch 目标: %s\n" "$(value_or_missing "$PATCHED_TARGET")"
printf "patch marker: %s\n" "$(value_or_missing "$PATCHED_VERSION")"
printf "\n"
printf "当前检测类型: %s\n" "$CURRENT_KIND"
printf "当前检测目标: %s\n" "$CURRENT_TARGET"
printf "claude 命令: %s\n" "$(value_or_missing "$REAL_CLAUDE")"
printf "claude 真实路径: %s\n" "$(value_or_missing "$REAL_CLAUDE_PATH")"
printf "claude --version: %s\n" "$(claude_version "$REAL_CLAUDE_PATH")"
printf "which -a claude:\n"
CLAUDE_COMMANDS="$(all_claude_commands)"
if [ -n "$CLAUDE_COMMANDS" ]; then
    printf "%s\n" "$CLAUDE_COMMANDS" | sed 's/^/  /'
else
    printf "  未检测到\n"
fi
printf "\n"
printf "状态文件:\n"
print_state_file "$PLUGIN_ROOT" ".source-repo"
print_state_file "$PLUGIN_ROOT" ".last-update-status"
print_state_file "$PLUGIN_ROOT" ".last-update-check"
print_state_file "$PLUGIN_ROOT" ".installed-ref"
print_state_file "$PLUGIN_ROOT" ".installed-commit"
print_state_file "$PLUGIN_ROOT" ".patched-kind"
print_state_file "$PLUGIN_ROOT" ".patched-target"
print_state_file "$PLUGIN_ROOT" ".patched-version"
