#!/usr/bin/env bash
# claude-code-zh-cn 安装脚本
# 将中文本地化设置合并到 Claude Code 的 settings.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SETTINGS_FILE="$HOME/.claude/settings.json"
BACKUP_FILE="$HOME/.claude/settings.json.zh-cn-backup.$(date +%Y%m%d%H%M%S)"
OVERLAY_FILE="$SCRIPT_DIR/settings-overlay.json"
PLUGIN_SRC="$SCRIPT_DIR/plugin"
PLUGIN_DST="$HOME/.claude/plugins/claude-code-zh-cn"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Claude Code 中文本地化插件 安装 ===${NC}"
echo ""

# 检查依赖
if ! command -v python3 &>/dev/null; then
    echo -e "${RED}错误：需要 python3，请先安装${NC}"
    exit 1
fi

if ! command -v jq &>/dev/null; then
    echo -e "${YELLOW}提示：建议安装 jq 以获得更好的 JSON 合并支持${NC}"
    echo "  brew install jq"
    USE_JQ=false
else
    USE_JQ=true
fi

# 检查 settings.json 是否存在
if [ ! -f "$SETTINGS_FILE" ]; then
    echo -e "${YELLOW}settings.json 不存在，创建新文件${NC}"
    mkdir -p "$(dirname "$SETTINGS_FILE")"
    echo '{}' > "$SETTINGS_FILE"
fi

# 备份
cp "$SETTINGS_FILE" "$BACKUP_FILE"
echo -e "${GREEN}已备份 settings.json → ${BACKUP_FILE}${NC}"

# 读取 overlay
OVERLAY_CONTENT=$(cat "$OVERLAY_FILE")

# 合并 settings
if $USE_JQ; then
    # 使用 jq 深度合并
    MERGED=$(jq -s '.[0] * .[1]' "$SETTINGS_FILE" <(echo "$OVERLAY_CONTENT"))
    echo "$MERGED" > "$SETTINGS_FILE"
else
    # 使用 python3 合并
    python3 -c "
import json, sys

with open('$SETTINGS_FILE', 'r') as f:
    settings = json.load(f)

overlay = json.loads('''$OVERLAY_CONTENT''')

# Deep merge - overlay takes precedence
def deep_merge(base, override):
    result = base.copy()
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result

merged = deep_merge(settings, overlay)

with open('$SETTINGS_FILE', 'w') as f:
    json.dump(merged, f, indent=2, ensure_ascii=False)
    f.write('\n')
"
fi

echo -e "${GREEN}已更新 settings.json${NC}"

# 安装插件
mkdir -p "$PLUGIN_DST"
cp -r "$PLUGIN_SRC"/* "$PLUGIN_DST/"
echo -e "${GREEN}已安装插件 → ${PLUGIN_DST}${NC}"

echo ""
echo -e "${GREEN}=== 安装完成！===${NC}"
echo ""
echo -e "已启用的功能："
echo -e "  ${GREEN}✓${NC} AI 回复语言 → 中文"
echo -e "  ${GREEN}✓${NC} Spinner 提示 → 中文（41 条）"
echo -e "  ${GREEN}✓${NC} Spinner 动词 → 中文（150+ 个）"
echo -e "  ${GREEN}✓${NC} 会话启动 Hook → 中文上下文注入"
echo -e "  ${GREEN}✓${NC} 通知 Hook → 中文翻译"
echo -e "  ${GREEN}✓${NC} 输出风格 → Chinese"
echo ""
echo -e "重启 Claude Code 即可生效。如需卸载，运行：${YELLOW}./uninstall.sh${NC}"
