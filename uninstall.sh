#!/usr/bin/env bash
# claude-code-zh-cn 卸载脚本
# 精准移除插件注入的设置，保留用户其他配置

set -euo pipefail

SETTINGS_FILE="$HOME/.claude/settings.json"
PLUGIN_DST="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/claude-code-zh-cn}"
LAUNCHER_BIN_DIR="${ZH_CN_LAUNCHER_BIN_DIR:-$HOME/.claude/bin}"
LAUNCHER_FILE="$LAUNCHER_BIN_DIR/claude"
PROFILE_FILES_OVERRIDE="${ZH_CN_PROFILE_FILES:-}"
PROFILE_MARKER_START="# >>> claude-code-zh-cn launcher >>>"
PROFILE_MARKER_END="# <<< claude-code-zh-cn launcher <<<"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Claude Code 中文本地化插件 卸载 ===${NC}"
echo ""

list_profile_targets() {
    if [ -n "${PROFILE_FILES_OVERRIDE:-}" ]; then
        printf "%s\n" "$PROFILE_FILES_OVERRIDE"
        return
    fi

    printf "%s\n" \
        "$HOME/.zshrc" \
        "$HOME/.zprofile" \
        "$HOME/.bashrc" \
        "$HOME/.bash_profile" \
        "$HOME/.profile"
}

remove_profile_injection() {
    local target="$1"

    PROFILE_TARGET="$target" \
    PROFILE_MARKER_START="$PROFILE_MARKER_START" \
    PROFILE_MARKER_END="$PROFILE_MARKER_END" \
    node - <<'NODE'
const fs = require("fs");
const path = process.env.PROFILE_TARGET;
const start = process.env.PROFILE_MARKER_START;
const end = process.env.PROFILE_MARKER_END;

if (!fs.existsSync(path)) {
  process.exit(0);
}

let content = fs.readFileSync(path, "utf8");
const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blockPattern = new RegExp(`\\n?${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, "g");
content = content.replace(blockPattern, "").replace(/\s+$/, "");
if (content.length > 0) {
  content += "\n";
}
fs.writeFileSync(path, content);
NODE
}

remove_launcher_artifacts() {
    local target

    while IFS= read -r target; do
        [ -n "$target" ] || continue
        remove_profile_injection "$target"
    done < <(list_profile_targets)

    if [ -f "$LAUNCHER_FILE" ]; then
        rm -f "$LAUNCHER_FILE"
        echo -e "${GREEN}已移除 launcher${NC}"
    fi
    rmdir "$LAUNCHER_BIN_DIR" 2>/dev/null || true
}

remove_launcher_artifacts

# 精准移除插件注入的 key（保留用户其他配置）
if [ -f "$SETTINGS_FILE" ]; then
    if command -v jq &>/dev/null; then
        jq 'del(.language) | del(.spinnerTipsEnabled) | del(.spinnerTipsOverride) | del(.spinnerVerbs)' "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
        echo -e "${GREEN}已从 settings.json 移除中文设置（保留其他配置）${NC}"
    elif command -v node &>/dev/null; then
        ZH_CN_SETTINGS="$SETTINGS_FILE" node -e "
const fs = require('fs');
const settingsFile = process.env.ZH_CN_SETTINGS;
const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
for (const key of ['language', 'spinnerTipsEnabled', 'spinnerTipsOverride', 'spinnerVerbs']) {
  delete settings[key];
}
fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
"
        echo -e "${GREEN}已从 settings.json 移除中文设置（保留其他配置）${NC}"
    else
        echo -e "${YELLOW}请手动编辑 $SETTINGS_FILE 移除以下字段：${NC}"
        echo "  - language"
        echo "  - spinnerTipsEnabled"
        echo "  - spinnerTipsOverride"
        echo "  - spinnerVerbs"
    fi
fi

# 还原 patch（统一检测安装类型，避免共存场景误判）
resolve_real_path() {
    node -e "try{process.stdout.write(require('fs').realpathSync(process.argv[1]))}catch{}" "$1" 2>/dev/null \
        || readlink "$1" 2>/dev/null \
        || printf "%s" "$1"
}

RESTORED=false
claude_bin="$(which claude 2>/dev/null || true)"

if [ -n "$claude_bin" ]; then
    real_bin="$(resolve_real_path "$claude_bin")"

    # 优先检测原生二进制备份
    if [ -n "$real_bin" ] && [ -f "${real_bin}.zh-cn-backup" ]; then
        cp "${real_bin}.zh-cn-backup" "$real_bin"
        rm "${real_bin}.zh-cn-backup"
        echo -e "${GREEN}已还原原生二进制${NC}"
        RESTORED=true
    fi
fi

# 如果没有还原原生二进制，尝试还原 npm cli.js
if [ "$RESTORED" = false ]; then
    CLI_FILE="$(dirname "$(which claude 2>/dev/null || true)")/../lib/node_modules/@anthropic-ai/claude-code/cli.js" 2>/dev/null || true
    if [ -z "$CLI_FILE" ] || [ ! -f "$CLI_FILE" ]; then
        CLI_FILE="$(npm root -g 2>/dev/null)/@anthropic-ai/claude-code/cli.js" 2>/dev/null || true
    fi

    if [ -f "${CLI_FILE}.zh-cn-backup" ]; then
        cp "${CLI_FILE}.zh-cn-backup" "$CLI_FILE"
        rm "${CLI_FILE}.zh-cn-backup"
        echo -e "${GREEN}已还原 cli.js${NC}"
    elif [ -f "$CLI_FILE" ]; then
        echo -e "${YELLOW}cli.js 没有备份文件，建议运行以下命令还原：${NC}"
        echo "  npm install -g @anthropic-ai/claude-code"
    fi
fi

# 移除插件
if [ -d "$PLUGIN_DST" ]; then
    rm -rf "$PLUGIN_DST"
    echo -e "${GREEN}已移除插件目录${NC}"
fi

# 清理备份文件
rm -f "$HOME/.claude/settings.json.zh-cn-backup."* 2>/dev/null && echo -e "${GREEN}已清理 settings.json 备份${NC}"

echo ""
echo -e "${GREEN}=== 卸载完成！===${NC}"
echo "重启 Claude Code 即可恢复英文界面"
