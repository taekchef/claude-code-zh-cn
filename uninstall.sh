#!/usr/bin/env bash
# claude-code-zh-cn 卸载脚本
# 精准移除插件注入的设置，保留用户其他配置

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

# 精准移除插件注入的 key（保留用户其他配置）
if [ -f "$SETTINGS_FILE" ]; then
    if command -v jq &>/dev/null; then
        jq 'del(.language) | del(.spinnerTipsEnabled) | del(.spinnerTipsOverride) | del(.spinnerVerbs)' "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
        echo -e "${GREEN}已从 settings.json 移除中文设置（保留其他配置）${NC}"
    elif command -v python3 &>/dev/null; then
        ZH_CN_SETTINGS="$SETTINGS_FILE" python3 -c "
import json, os
sf = os.environ['ZH_CN_SETTINGS']
with open(sf, 'r') as f:
    s = json.load(f)
for k in ['language', 'spinnerTipsEnabled', 'spinnerTipsOverride', 'spinnerVerbs']:
    s.pop(k, None)
with open(sf, 'w') as f:
    json.dump(s, f, indent=2, ensure_ascii=False)
    f.write('\n')
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

# 移除插件
if [ -d "$PLUGIN_DST" ]; then
    rm -rf "$PLUGIN_DST"
    echo -e "${GREEN}已移除插件目录${NC}"
fi

# 还原 patch（统一检测安装类型，避免共存场景误判）
resolve_real_path() {
    node -e "try{process.stdout.write(require('fs').realpathSync(process.argv[1]))}catch{}" "$1" 2>/dev/null \
        || python3 -c "import os,sys;print(os.path.realpath(sys.argv[1]),end='')" "$1" 2>/dev/null \
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

# 清理备份文件
rm -f "$HOME/.claude/settings.json.zh-cn-backup."* 2>/dev/null && echo -e "${GREEN}已清理 settings.json 备份${NC}"

echo ""
echo -e "${GREEN}=== 卸载完成！===${NC}"
echo "重启 Claude Code 即可恢复英文界面"
