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

# Patch cli.js 硬编码文字
CLI_FILE="$(dirname "$(which claude)")/../lib/node_modules/@anthropic-ai/claude-code/cli.js" 2>/dev/null || true
if [ -z "$CLI_FILE" ]; then
    # 尝试 npm global 路径
    CLI_FILE="$(npm root -g)/@anthropic-ai/claude-code/cli.js"
fi

if [ -f "$CLI_FILE" ]; then
    echo ""
    echo -e "${BLUE}正在 patch cli.js 硬编码文字...${NC}"

    # 备份 cli.js
    cp "$CLI_FILE" "${CLI_FILE}.zh-cn-backup"
    echo -e "${GREEN}已备份 cli.js${NC}"

    # macOS uses sed -i '', Linux uses sed -i
    sed_inplace() {
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i "" "$@"
        else
            sed -i "$@"
        fi
    }

    PATCH_COUNT=0

    # 1. 过去式动词 (Cogitated for 2m 25s → 思考了 2m 25s)
    if sed_inplace 's/UE6=\["Baked","Brewed","Churned","Cogitated","Cooked","Crunched","Sautéed","Worked"\]/UE6=["烘焙了","沏好了","翻搅了","琢磨了","烹饪了","嚼完了","翻炒了","搞定了"]/g' "$CLI_FILE" 2>/dev/null; then
        PATCH_COUNT=$((PATCH_COUNT + 1))
    fi

    # 2. /btw 提示
    if sed_inplace 's/Use \/btw to ask a quick side question without interrupting Claude'\''s current work/使用 \/btw 提一个快速问题，不会打断当前工作/g' "$CLI_FILE" 2>/dev/null; then
        PATCH_COUNT=$((PATCH_COUNT + 1))
    fi

    # 3. /clear 提示
    if sed_inplace 's/Use \/clear to start fresh when switching topics and free up context/使用 \/clear 清空对话，切换话题并释放上下文/g' "$CLI_FILE" 2>/dev/null; then
        PATCH_COUNT=$((PATCH_COUNT + 1))
    fi

    # 4. Tip: 前缀 → 💡
    if sed_inplace 's/`Tip: \${A6}`/`💡 \${A6}`/g' "$CLI_FILE" 2>/dev/null; then
        PATCH_COUNT=$((PATCH_COUNT + 1))
    fi

    # 5. recap: 前缀 → 回顾:
    if sed_inplace 's/"recap:"," "/"回顾:"," "/g' "$CLI_FILE" 2>/dev/null; then
        PATCH_COUNT=$((PATCH_COUNT + 1))
    fi

    # 6. nudge/nudges → 次提醒
    if sed_inplace 's/===1?"nudge":"nudges"/===1?"次提醒":"次提醒"/g' "$CLI_FILE" 2>/dev/null; then
        PATCH_COUNT=$((PATCH_COUNT + 1))
    fi

    echo -e "${GREEN}已 patch cli.js（${PATCH_COUNT} 处硬编码文字）${NC}"
else
    echo -e "${YELLOW}未找到 cli.js，跳过 patch 步骤${NC}"
    echo -e "  提示：如果 Claude Code 安装在非标准路径，可能需要手动 patch"
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
echo ""
echo -e "重启 Claude Code 即可生效。如需卸载，运行：${YELLOW}./uninstall.sh${NC}"
echo -e "${YELLOW}注意：${NC}Claude Code 更新后需重跑 ${YELLOW}./install.sh${NC} 以重新 patch cli.js"
