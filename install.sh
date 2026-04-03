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
if ! command -v node &>/dev/null; then
    echo -e "${RED}错误：需要 node，请先安装${NC}"
    exit 1
fi

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
    # 使用 python3 合并（通过环境变量传参，避免注入风险）
    ZH_CN_SETTINGS="$SETTINGS_FILE" ZH_CN_OVERLAY="$OVERLAY_CONTENT" python3 -c "
import json, sys, os

settings_file = os.environ['ZH_CN_SETTINGS']
overlay_content = os.environ['ZH_CN_OVERLAY']

with open(settings_file, 'r') as f:
    settings = json.load(f)

overlay = json.loads(overlay_content)

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

with open(settings_file, 'w') as f:
    json.dump(merged, f, indent=2, ensure_ascii=False)
    f.write('\n')
" 2>/dev/null
fi

echo -e "${GREEN}已更新 settings.json${NC}"

# 安装插件
mkdir -p "$PLUGIN_DST"
cp -r "$PLUGIN_SRC"/* "$PLUGIN_DST/"
# 复制 patch-cli.sh 到插件目录，hook 需要用
cp "$SCRIPT_DIR/patch-cli.sh" "$PLUGIN_DST/"
chmod +x "$PLUGIN_DST/patch-cli.sh"
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

    # 检测 cli.js 版本，避免用旧备份覆盖新版
    CURRENT_VERSION=$(sed -n 's/^\/\/ Version: //p' "$CLI_FILE" | head -1) || CURRENT_VERSION=""
    BACKUP_VERSION=""
    if [ -f "${CLI_FILE}.zh-cn-backup" ]; then
        BACKUP_VERSION=$(sed -n 's/^\/\/ Version: //p' "${CLI_FILE}.zh-cn-backup" | head -1) || BACKUP_VERSION=""
    fi

    if [ "${CURRENT_VERSION:-}" = "${BACKUP_VERSION:-}" ] && [ -n "${BACKUP_VERSION:-}" ] && [ -f "${CLI_FILE}.zh-cn-backup" ]; then
        # 版本一致，安全恢复原始再 patch（确保幂等）
        cp "${CLI_FILE}.zh-cn-backup" "$CLI_FILE"
        echo -e "${GREEN}已从备份恢复原始 cli.js（版本一致: ${CURRENT_VERSION:-unknown}）${NC}"
    else
        # 版本不同或首次安装，备份当前版本
        cp "$CLI_FILE" "${CLI_FILE}.zh-cn-backup"
        echo -e "${GREEN}已备份 cli.js（版本: ${CURRENT_VERSION:-unknown}）${NC}"
    fi

    PATCH_COUNT=$("$SCRIPT_DIR/patch-cli.sh" "$CLI_FILE" 2>/dev/null || echo "0")
    echo -e "${GREEN}已 patch cli.js（${PATCH_COUNT:-0} 处硬编码文字）${NC}"
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
echo -e "  ${GREEN}✓${NC} 自动重 patch → Claude Code 更新后首次会话自动修复"
echo ""
echo -e "重启 Claude Code 即可生效。如需卸载，运行：${YELLOW}./uninstall.sh${NC}"
