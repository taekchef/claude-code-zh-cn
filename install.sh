#!/usr/bin/env bash
# claude-code-zh-cn 安装脚本
# 将中文本地化设置合并到 Claude Code 的 settings.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
UPDATE_ONLY=false
if [ "${1:-}" = "--update-only" ]; then
    UPDATE_ONLY=true
fi

SETTINGS_FILE="$HOME/.claude/settings.json"
BACKUP_FILE="$HOME/.claude/settings.json.zh-cn-backup.$(date +%Y%m%d%H%M%S)"
OVERLAY_FILE="$SCRIPT_DIR/settings-overlay.json"
PLUGIN_SRC="$SCRIPT_DIR/plugin"
PLUGIN_DST="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/claude-code-zh-cn}"
MARKER_FILE="$PLUGIN_DST/.patched-version"
SOURCE_REPO_FILE="$PLUGIN_DST/.source-repo"
LAST_UPDATE_CHECK_FILE="$PLUGIN_DST/.last-update-check"
SOURCE_REPO_OVERRIDE="${ZH_CN_SOURCE_REPO:-}"
SKIP_BANNER="${ZH_CN_SKIP_BANNER:-0}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_banner() {
    if [ "$SKIP_BANNER" = "1" ]; then
        return
    fi

    if [ "$UPDATE_ONLY" = true ]; then
        echo -e "${BLUE}=== Claude Code 中文本地化插件 更新 ===${NC}"
    else
        echo -e "${BLUE}=== Claude Code 中文本地化插件 安装 ===${NC}"
    fi
    echo ""
}

print_completion() {
    if [ "$UPDATE_ONLY" = true ] || [ "$SKIP_BANNER" = "1" ]; then
        return
    fi

    echo ""
    echo -e "${GREEN}=== 安装完成！===${NC}"
    echo ""
    echo -e "已启用的功能："
    echo -e "  ${GREEN}✓${NC} AI 回复语言 → 中文"
    echo -e "  ${GREEN}✓${NC} Spinner 提示 → 中文（41 条）"
    echo -e "  ${GREEN}✓${NC} Spinner 动词 → 中文（187 个）"
    echo -e "  ${GREEN}✓${NC} 会话启动 Hook → 中文上下文注入"
    echo -e "  ${GREEN}✓${NC} 通知 Hook → 中文翻译"
    echo -e "  ${GREEN}✓${NC} 输出风格 → Chinese"
    echo -e "  ${GREEN}✓${NC} CLI Patch → 回复耗时动词 + /btw + /clear 提示中文化"
    echo -e "  ${GREEN}✓${NC} 自动重 patch → Claude Code 更新后首次会话自动修复"
    echo -e "  ${GREEN}✓${NC} 自动更新 → 插件发布新 Release 后自动同步"
    echo ""
    echo -e "重启 Claude Code 即可生效。如需卸载，运行：${YELLOW}./uninstall.sh${NC}"
}

detect_platform() {
    if [ "$UPDATE_ONLY" = true ]; then
        return
    fi

    if [ -f /proc/version ] && grep -qi "microsoft" /proc/version 2>/dev/null; then
        echo -e "${GREEN}检测到 WSL 环境，继续安装${NC}"
    elif [ -f /proc/version ]; then
        echo -e "${YELLOW}提示：未检测到 WSL 环境。如果你在 Windows 上使用 Git Bash 或 PowerShell，${NC}"
        echo -e "${YELLOW}请切换到 WSL 终端后运行此脚本。Claude Code 仅通过 WSL 在 Windows 上运行。${NC}"
        echo ""
    fi
}

check_dependencies() {
    if ! command -v node &>/dev/null; then
        echo -e "${RED}错误：需要 node，请先安装${NC}"
        exit 1
    fi

    if ! command -v python3 &>/dev/null; then
        echo -e "${RED}错误：需要 python3，请先安装${NC}"
        exit 1
    fi

    if ! command -v jq &>/dev/null; then
        if [ "$UPDATE_ONLY" != true ] && [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${YELLOW}提示：建议安装 jq 以获得更好的 JSON 合并支持${NC}"
            echo "  brew install jq"
        fi
        USE_JQ=false
    else
        USE_JQ=true
    fi
}

ensure_settings_file() {
    if [ ! -f "$SETTINGS_FILE" ]; then
        if [ "$UPDATE_ONLY" != true ] && [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${YELLOW}settings.json 不存在，创建新文件${NC}"
        fi
        mkdir -p "$(dirname "$SETTINGS_FILE")"
        echo '{}' > "$SETTINGS_FILE"
    fi
}

build_overlay_content() {
    local overlay_content verbs_content tips_content

    overlay_content=$(cat "$OVERLAY_FILE")
    verbs_content=$(cat "$SCRIPT_DIR/verbs/zh-CN.json")
    tips_content=$(cat "$SCRIPT_DIR/tips/zh-CN.json")

    ZH_CN_BASE="$overlay_content" ZH_CN_VERBS="$verbs_content" ZH_CN_TIPS="$tips_content" node -e "
const base = JSON.parse(process.env.ZH_CN_BASE);
const verbs = JSON.parse(process.env.ZH_CN_VERBS);
const tips = JSON.parse(process.env.ZH_CN_TIPS);
base.spinnerVerbs = verbs;
base.spinnerTipsOverride = { excludeDefault: true, tips: tips.tips.map(t => t.text) };
process.stdout.write(JSON.stringify(base));
"
}

merge_settings() {
    local overlay_content merged

    ensure_settings_file

    if [ "$UPDATE_ONLY" != true ]; then
        cp "$SETTINGS_FILE" "$BACKUP_FILE"
        if [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${GREEN}已备份 settings.json → ${BACKUP_FILE}${NC}"
        fi
    fi

    overlay_content=$(build_overlay_content)

    if $USE_JQ; then
        merged=$(jq -s '.[0] * .[1]' "$SETTINGS_FILE" <(echo "$overlay_content"))
        if [ -z "$merged" ] || ! echo "$merged" | jq 'type == "object"' >/dev/null 2>&1; then
            echo -e "${RED}错误：settings.json 合并失败${NC}"
            if [ "$UPDATE_ONLY" != true ]; then
                cp "$BACKUP_FILE" "$SETTINGS_FILE"
            fi
            exit 1
        fi
        echo "$merged" > "$SETTINGS_FILE"
    else
        ZH_CN_SETTINGS="$SETTINGS_FILE" ZH_CN_OVERLAY="$overlay_content" python3 -c "
import json, os

settings_file = os.environ['ZH_CN_SETTINGS']
overlay_content = os.environ['ZH_CN_OVERLAY']

with open(settings_file, 'r') as f:
    settings = json.load(f)

overlay = json.loads(overlay_content)

def deep_merge(base, override):
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result

merged = deep_merge(settings, overlay)

with open(settings_file, 'w') as f:
    json.dump(merged, f, indent=2, ensure_ascii=False)
    f.write('\n')
" 2>/dev/null
    fi

    if [ "$SKIP_BANNER" != "1" ]; then
        echo -e "${GREEN}已更新 settings.json${NC}"
    fi
}

sync_plugin_payload() {
    if [ -z "${PLUGIN_DST:-}" ] || [ "$PLUGIN_DST" = "/" ]; then
        echo -e "${RED}错误：PLUGIN_DST 非法，拒绝同步${NC}"
        exit 1
    fi

    mkdir -p "$PLUGIN_DST"
    find "$PLUGIN_DST" -mindepth 1 -maxdepth 1 ! -name '.*' -exec rm -rf {} +
    cp -R "$PLUGIN_SRC"/. "$PLUGIN_DST"/
    chmod +x "$PLUGIN_DST/patch-cli.sh" 2>/dev/null || true
    chmod +x "$PLUGIN_DST/hooks/session-start" "$PLUGIN_DST/hooks/notification" 2>/dev/null || true

    if [ "$SKIP_BANNER" != "1" ]; then
        echo -e "${GREEN}已安装插件 → ${PLUGIN_DST}${NC}"
    fi
}

locate_cli_file() {
    local cli_file=""

    cli_file="$(dirname "$(which claude 2>/dev/null || true)")/../lib/node_modules/@anthropic-ai/claude-code/cli.js" 2>/dev/null || true
    if [ -z "$cli_file" ] || [ ! -f "$cli_file" ]; then
        cli_file="$(npm root -g 2>/dev/null)/@anthropic-ai/claude-code/cli.js"
    fi

    printf "%s" "$cli_file"
}

compute_patch_revision() {
    node - "$PLUGIN_DST" <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = process.argv[2];
const files = ["manifest.json", "patch-cli.sh", "patch-cli.js", "cli-translations.json"];
const hash = crypto.createHash("sha256");

for (const file of files) {
    const target = path.join(root, file);
    if (!fs.existsSync(target)) continue;
    hash.update(file);
    hash.update("\0");
    hash.update(fs.readFileSync(target));
    hash.update("\0");
}

process.stdout.write(hash.digest("hex").slice(0, 16));
NODE
}

resolve_source_repo() {
    if [ -n "${SOURCE_REPO_OVERRIDE:-}" ]; then
        printf "%s" "$SOURCE_REPO_OVERRIDE"
        return
    fi

    if [ "$UPDATE_ONLY" = true ] && [ -f "$SOURCE_REPO_FILE" ]; then
        tr -d '\r' < "$SOURCE_REPO_FILE"
        return
    fi

    if [ "$UPDATE_ONLY" != true ]; then
        printf "%s" "$SCRIPT_DIR"
    fi
}

write_install_metadata() {
    local source_repo=""
    source_repo="$(resolve_source_repo)"

    if [ -n "${source_repo:-}" ]; then
        printf "%s\n" "$source_repo" > "$SOURCE_REPO_FILE"
    fi

    date +%s > "$LAST_UPDATE_CHECK_FILE" 2>/dev/null || true
}

initial_patch_cli() {
    local cli_file current_version backup_version patch_count patch_revision

    cli_file="$(locate_cli_file)"
    if [ ! -f "$cli_file" ]; then
        echo -e "${YELLOW}未找到 cli.js，跳过 patch 步骤${NC}"
        echo -e "  提示：如果 Claude Code 安装在非标准路径，可能需要手动 patch"
        return
    fi

    echo ""
    echo -e "${BLUE}正在 patch cli.js 硬编码文字...${NC}"

    current_version=$(sed -n 's/^\/\/ Version: //p' "$cli_file" | head -1) || current_version=""
    backup_version=""
    if [ -f "${cli_file}.zh-cn-backup" ]; then
        backup_version=$(sed -n 's/^\/\/ Version: //p' "${cli_file}.zh-cn-backup" | head -1) || backup_version=""
    fi

    if [ "${current_version:-}" = "${backup_version:-}" ] && [ -n "${backup_version:-}" ] && [ -f "${cli_file}.zh-cn-backup" ]; then
        cp "${cli_file}.zh-cn-backup" "$cli_file"
        echo -e "${GREEN}已从备份恢复原始 cli.js（版本一致: ${current_version:-unknown}）${NC}"
    else
        cp "$cli_file" "${cli_file}.zh-cn-backup"
        echo -e "${GREEN}已备份 cli.js（版本: ${current_version:-unknown}）${NC}"
    fi

    patch_count=$("$SCRIPT_DIR/patch-cli.sh" "$cli_file" 2>/dev/null || echo "0")
    echo -e "${GREEN}已 patch cli.js（${patch_count:-0} 处硬编码文字）${NC}"

    patch_revision=$(compute_patch_revision 2>/dev/null || true)
    if [ -n "${patch_revision:-}" ] && [ -n "${current_version:-}" ]; then
        echo "${current_version}|${patch_revision}" > "$MARKER_FILE"
    fi
}

main() {
    print_banner
    detect_platform
    check_dependencies
    sync_plugin_payload
    merge_settings
    write_install_metadata

    if [ "$UPDATE_ONLY" != true ]; then
        initial_patch_cli
    fi

    print_completion
}

main "$@"
