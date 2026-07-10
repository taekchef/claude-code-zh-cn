#!/usr/bin/env bash
# translate-skills.sh — Skill/插件命令说明汉化流水线入口。
# 被 session-start hook 后台调用；也可手动 `bash translate-skills.sh --root <dir>` 调试。
# 流程：scan（解析+对比缓存）→ translate（调 LLM）→ apply（写回 frontmatter）
# 设计：单步失败不中断（翻译失败绝不写坏源文件）。

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CACHE_DIR="${ZH_CN_SKILL_I18N_CACHE_DIR:-$HOME/.claude/.skill-i18n-cache}"
ROOT="${ZH_CN_SKILL_I18N_ROOT:-$HOME/.claude}"
DRY_RUN=0
PROVIDER="${ZH_CN_SKILL_I18N_PROVIDER:-auto}"

while [ "$#" -gt 0 ]; do
    case "$1" in
        --root|--scan-root) ROOT="$2"; shift 2 ;;
        --cache-dir) CACHE_DIR="$2"; shift 2 ;;
        --dry-run) DRY_RUN=1; shift ;;
        --provider) PROVIDER="$2"; shift 2 ;;
        *) shift ;;
    esac
done

mkdir -p "$CACHE_DIR"
CACHE_FILE="$CACHE_DIR/translations.json"
QUEUE_FILE="$CACHE_DIR/.queue.$$.json"
APPLY_FILE="$CACHE_DIR/.apply.$$.json"

# 1. 扫描
node "$SCRIPT_DIR/scan.js" --root "$ROOT" --cache "$CACHE_FILE" --output "$QUEUE_FILE" --print ${ZH_CN_SKILL_I18N_LIMIT:+--limit "$ZH_CN_SKILL_I18N_LIMIT"} || true

# dry-run：只看队列，不翻译不写回
if [ "$DRY_RUN" = "1" ]; then
    rm -f "$QUEUE_FILE" 2>/dev/null || true
    exit 0
fi

# 2. 翻译（读队列+缓存，写缓存，输出应用清单）
#    API key 经环境变量传递（ZH_CN_SKILL_I18N_API_KEY），不经 argv，避免泄露到进程列表
export ZH_CN_SKILL_I18N_API_KEY="${ZH_CN_SKILL_I18N_API_KEY:-}"
node "$SCRIPT_DIR/translate.js" \
    --queue "$QUEUE_FILE" \
    --cache "$CACHE_FILE" \
    --output "$APPLY_FILE" \
    --provider "$PROVIDER" \
    ${ZH_CN_SKILL_I18N_BASE_URL:+--base-url "$ZH_CN_SKILL_I18N_BASE_URL"} \
    ${ZH_CN_SKILL_I18N_MODEL:+--model "$ZH_CN_SKILL_I18N_MODEL"} \
    || true

# 3. 写回（传 --root 做路径边界校验）
node "$SCRIPT_DIR/apply.js" --apply "$APPLY_FILE" --root "$ROOT" || true

rm -f "$QUEUE_FILE" "$APPLY_FILE" 2>/dev/null || true
