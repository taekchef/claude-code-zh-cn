#!/usr/bin/env bash
# claude-code-zh-cn 卸载脚本
# 恢复原始 settings.json 并移除插件

set -euo pipefail

SETTINGS_FILE="$HOME/.claude/settings.json"
PLUGIN_DST="$HOME/.claude/plugins/claude-code-zh-cn"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Claude Code 中文本地化插件 卸载 ===${NC}"
echo ""

# 查找最近的备份
LATEST_BACKUP=$(ls -t "$HOME/.claude/settings.json.zh-cn-backup."* 2>/dev/null | head -1)

if [ -n "$LATEST_BACKUP" ]; then
    cp "$LATEST_BACKUP" "$SETTINGS_FILE"
    echo -e "${GREEN}已恢复 settings.json ← ${LATEST_BACKUP}${NC}"
else
    # 没有备份，手动移除中文设置
    if command -v jq &>/dev/null; then
        jq 'del(.language) | del(.spinnerTipsOverride) | del(.spinnerVerbs)' "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
        echo -e "${GREEN}已从 settings.json 移除中文设置${NC}"
    elif command -v python3 &>/dev/null; then
        python3 -c "
import json
with open('$SETTINGS_FILE', 'r') as f:
    s = json.load(f)
for k in ['language', 'spinnerTipsOverride', 'spinnerVerbs']:
    s.pop(k, None)
with open('$SETTINGS_FILE', 'w') as f:
    json.dump(s, f, indent=2, ensure_ascii=False)
    f.write('\n')
"
        echo -e "${GREEN}已从 settings.json 移除中文设置${NC}"
    else
        echo -e "${YELLOW}请手动编辑 $SETTINGS_FILE 移除以下字段：${NC}"
        echo "  - language"
        echo "  - spinnerTipsOverride"
        echo "  - spinnerVerbs"
    fi
fi

# 移除插件
if [ -d "$PLUGIN_DST" ]; then
    rm -rf "$PLUGIN_DST"
    echo -e "${GREEN}已移除插件目录${NC}"
fi

echo ""
echo -e "${GREEN}=== 卸载完成！==={NC}"
echo "重启 Claude Code 即可恢复英文界面"
