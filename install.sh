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

    local install_info
    install_info="$(detect_installation)"
    if [[ "${install_info:-}" == native-bun:* ]]; then
        echo ""
        echo -e "  ${YELLOW}[实验性] 原生二进制 patch — 如遇问题请提交 Issue${NC}"
    fi

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

    # 检查原生二进制依赖
    local install_info
    install_info="$(detect_installation)"
    if [[ "${install_info:-}" == native-bun:* ]]; then
        local dep_status
        dep_status="$(node "$PLUGIN_SRC/bun-binary-io.js" check-deps 2>/dev/null || echo "missing")"
        if [ "$dep_status" != "ok" ]; then
            echo -e "${YELLOW}检测到官方安装器版本，需要 node-lief 支持${NC}"
            echo -e "  运行: ${GREEN}npm install -g node-lief${NC}"
        fi
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

resolve_real_path() {
    node -e "try{process.stdout.write(require('fs').realpathSync(process.argv[1]))}catch{}" "$1" 2>/dev/null \
        || python3 -c "import os,sys;print(os.path.realpath(sys.argv[1]),end='')" "$1" 2>/dev/null \
        || readlink "$1" 2>/dev/null \
        || printf "%s" "$1"
}

detect_installation() {
    local claude_bin
    claude_bin="$(which claude 2>/dev/null || true)"
    if [ -z "$claude_bin" ]; then
        printf ""
        return
    fi

    # 调用 JS 后端（用源码侧路径 $PLUGIN_SRC，首次安装时 $PLUGIN_DST 不存在）
    if [ -f "$PLUGIN_SRC/bun-binary-io.js" ]; then
        local result
        result="$(node "$PLUGIN_SRC/bun-binary-io.js" detect "$claude_bin" 2>/dev/null || true)"

        # helper 成功执行：有结果就用，unknown 就跳过（不认识的安装类型）
        if [ -n "$result" ] && [ "$result" != "unknown" ]; then
            printf "%s" "$result"
            return
        fi
        # unknown 或 helper 执行失败 → 不 patch
        printf ""
        return
    fi

    # helper 不存在（不应发生，但兜底）：旧逻辑
    local cli_file
    cli_file="$(dirname "$(resolve_real_path "$claude_bin")")/../lib/node_modules/@anthropic-ai/claude-code/cli.js" 2>/dev/null || true
    if [ -f "$cli_file" ]; then
        printf "npm:%s" "$cli_file"
        return
    fi
    cli_file="$(npm root -g 2>/dev/null)/@anthropic-ai/claude-code/cli.js"
    if [ -f "$cli_file" ]; then
        printf "npm:%s" "$cli_file"
        return
    fi

    printf ""
}

compute_patch_revision() {
    node - "$PLUGIN_DST" <<'NODE'
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = process.argv[2];
const files = ["manifest.json", "patch-cli.sh", "patch-cli.js", "cli-translations.json", "bun-binary-io.js"];
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

patch_npm_cli() {
    local cli_file="$1"
    local current_version backup_version patch_count patch_revision

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

    patch_count=$("$PLUGIN_SRC/patch-cli.sh" "$cli_file" 2>/dev/null || echo "0")
    echo -e "${GREEN}已 patch cli.js（${patch_count:-0} 处硬编码文字）${NC}"

    patch_revision=$(compute_patch_revision 2>/dev/null || true)
    if [ -n "${patch_revision:-}" ] && [ -n "${current_version:-}" ]; then
        echo "${current_version}|${patch_revision}" > "$MARKER_FILE"
    fi
}

patch_native_binary() {
    local binary_path="$1"
    local tmp_js="${TMPDIR:-/tmp}/claude-zh-cn-extract.$$.js"
    local backup_path="${binary_path}.zh-cn-backup"
    local current_version backup_version

    echo ""
    echo -e "${BLUE}检测到官方安装器（原生二进制），正在 patch...${NC}"
    echo -e "  二进制路径: ${binary_path}"

    # 检查依赖
    local dep_status
    dep_status="$(node "$PLUGIN_SRC/bun-binary-io.js" check-deps 2>/dev/null || echo "missing")"
    if [ "$dep_status" != "ok" ]; then
        echo -e "${YELLOW}需要安装 node-lief 来支持原生二进制 patch${NC}"
        echo -e "  运行: ${GREEN}npm install -g node-lief${NC}"
        echo -e "  然后重新运行 ./install.sh"
        return
    fi

    current_version=$(node "$PLUGIN_SRC/bun-binary-io.js" version "$binary_path" 2>/dev/null || true)
    backup_version=""
    if [ -f "$backup_path" ]; then
        backup_version=$(node "$PLUGIN_SRC/bun-binary-io.js" version "$backup_path" 2>/dev/null || true)
    fi

    # 备份逻辑：仅同版本恢复 backup；版本变化时刷新 backup 为当前版本
    if [ -f "$backup_path" ] && [ -n "${current_version:-}" ] && [ "${current_version:-}" = "${backup_version:-}" ]; then
        echo -e "  从备份恢复原始二进制..."
        cp "$backup_path" "$binary_path" || {
            echo -e "${RED}恢复备份失败${NC}"
            return
        }
    else
        echo -e "  备份原始二进制..."
        cp "$binary_path" "$backup_path" || {
            echo -e "${RED}创建备份失败${NC}"
            return
        }
    fi

    # 提取 → patch → 写回
    node "$PLUGIN_SRC/bun-binary-io.js" extract "$binary_path" "$tmp_js" || {
        echo -e "${RED}提取 JS 失败${NC}"
        rm -f "$tmp_js"
        return
    }

    local patch_count
    patch_count=$("$PLUGIN_SRC/patch-cli.sh" "$tmp_js" 2>/dev/null || echo "0")

    if [ "$patch_count" != "0" ]; then
        node "$PLUGIN_SRC/bun-binary-io.js" repack "$binary_path" "$tmp_js" || {
            echo -e "${RED}写回二进制失败，正在从备份恢复...${NC}"
            cp "$backup_path" "$binary_path" 2>/dev/null || true
            rm -f "$tmp_js"
            return
        }
        echo -e "${GREEN}已 patch 原生二进制（${patch_count} 处硬编码文字）${NC}"
    else
        echo -e "${YELLOW}未找到需要 patch 的内容${NC}"
    fi

    rm -f "$tmp_js"

    # 更新 marker
    local patch_revision
    current_version=$(node "$PLUGIN_SRC/bun-binary-io.js" version "$binary_path" 2>/dev/null || true)
    patch_revision=$(compute_patch_revision 2>/dev/null || true)
    if [ -n "${patch_revision:-}" ] && [ -n "${current_version:-}" ]; then
        echo "${current_version}|${patch_revision}" > "$MARKER_FILE"
    fi
}

initial_patch_cli() {
    local install_info

    install_info="$(detect_installation)"
    if [ -z "$install_info" ]; then
        echo -e "${YELLOW}未找到 Claude Code，跳过 patch 步骤${NC}"
        return
    fi

    local kind="${install_info%%:*}"
    local target="${install_info#*:}"

    case "$kind" in
        npm)
            patch_npm_cli "$target"
            ;;
        native-bun)
            patch_native_binary "$target"
            ;;
        *)
            echo -e "${YELLOW}未识别的安装类型: $kind${NC}"
            ;;
    esac
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
