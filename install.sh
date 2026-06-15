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
INSTALL_JSON_HELPER="$SCRIPT_DIR/scripts/install-json-helper.js"
MARKER_FILE="$PLUGIN_DST/.patched-version"
SOURCE_REPO_FILE="$PLUGIN_DST/.source-repo"
LAST_UPDATE_CHECK_FILE="$PLUGIN_DST/.last-update-check"
CCSWITCH_CONSENT_FILE="$PLUGIN_DST/.ccswitch-sync-consent"
SOURCE_REPO_OVERRIDE="${ZH_CN_SOURCE_REPO:-}"
SKIP_BANNER="${ZH_CN_SKIP_BANNER:-0}"
CCSWITCH_SYNC_CHOICE="${ZH_CN_CCSWITCH_SYNC:-}"
LAUNCHER_BIN_DIR="${ZH_CN_LAUNCHER_BIN_DIR:-$HOME/.claude/bin}"
LAUNCHER_FILE="$LAUNCHER_BIN_DIR/claude"
PROFILE_FILES_OVERRIDE="${ZH_CN_PROFILE_FILES:-}"
PROFILE_MARKER_START="# >>> claude-code-zh-cn launcher >>>"
PROFILE_MARKER_END="# <<< claude-code-zh-cn launcher <<<"
CLI_PATCH_STATUS_SUMMARY="已跳过（未执行 CLI Patch）"
CLI_PATCH_STATUS_OK=false
LAUNCHER_STATUS_SUMMARY="已跳过（未执行 launcher 安装）"
LAUNCHER_STATUS_OK=false

print_updater_boundary_note() {
    echo -e "  ${YELLOW}!${NC} Claude Code 本体自动升级 → DISABLE_AUTOUPDATER 不归本插件兜底；请以 claude doctor 的 Updates 段为准"
}

print_unpublished_window_note() {
    echo -e "${YELLOW}  提醒：本机自验证是临时 patch，不等于已发布支持；升到未发布窗口时请先看支持窗口，未收录就等插件 Release 或临时退回已验证版本。${NC}"
}

if [ -f "$INSTALL_JSON_HELPER" ]; then
    compute_patch_revision() {
        node "$INSTALL_JSON_HELPER" patch-revision "$1"
    }
else
    source "$SCRIPT_DIR/compute-patch-revision.sh"
fi

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
    echo -e "  ${GREEN}✓${NC} 自动重 patch → Claude Code 更新后首次会话自动修复"
    if [ "$LAUNCHER_STATUS_OK" = true ]; then
        echo -e "  ${GREEN}✓${NC} npm 启动前自修复 → ${LAUNCHER_STATUS_SUMMARY}"
    else
        echo -e "  ${YELLOW}!${NC} npm 启动前自修复 → ${LAUNCHER_STATUS_SUMMARY}"
    fi
    echo -e "  ${GREEN}✓${NC} 插件自动更新 → 只跟随本插件已发布 Release，同步中文插件文件"
    print_updater_boundary_note

    if [ "$CLI_PATCH_STATUS_OK" = true ]; then
        echo -e "  ${GREEN}✓${NC} CLI Patch → ${CLI_PATCH_STATUS_SUMMARY}"
    else
        echo -e "  ${YELLOW}!${NC} CLI Patch → ${CLI_PATCH_STATUS_SUMMARY}"
    fi

    local install_info
    install_info="$(detect_installation)"
    if [[ "${install_info:-}" == native-bun:* ]]; then
        echo ""
        echo -e "  ${YELLOW}!${NC} 官方安装器 native patch 属于 experimental；新同版本线会在安装时本机自验证"
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

    if ! command -v jq &>/dev/null; then
        if [ "$UPDATE_ONLY" != true ] && [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${YELLOW}提示：建议安装 jq 以获得更好的 JSON 合并支持${NC}"
            echo "  brew install jq"
        fi
        USE_JQ=false
    else
        USE_JQ=true
    fi

    local install_info
    install_info="$(detect_installation)"
    if [[ "${install_info:-}" == native-bun:* ]]; then
        local native_path native_version dep_status
        native_path="${install_info#*:}"
        native_version="$(native_binary_version "$native_path")"
        dep_status="$(node "$PLUGIN_SRC/bun-binary-io.js" check-deps 2>/dev/null || echo "missing")"

        if is_supported_native_version "$native_version"; then
            if [ "$dep_status" != "ok" ]; then
                echo -e "${YELLOW}检测到已验证原生二进制版本 ${native_version:-unknown}，CLI Patch 需要 node-lief${NC}"
                echo -e "  运行: ${GREEN}npm install -g node-lief${NC}"
            else
                echo -e "${YELLOW}检测到已验证原生二进制版本 ${native_version}，将使用 experimental native patch${NC}"
            fi
        elif can_try_provisional_native_version "$native_version"; then
            if [ "$dep_status" != "ok" ]; then
                echo -e "${YELLOW}检测到新原生二进制版本 ${native_version:-unknown}，同版本线可在安装时本机自验证；需要 node-lief${NC}"
                echo -e "  运行: ${GREEN}npm install -g node-lief${NC}"
            else
                echo -e "${YELLOW}检测到新原生二进制版本 ${native_version}，将尝试本机自验证；通过才启用 CLI Patch${NC}"
            fi
        else
            echo -e "${YELLOW}检测到原生二进制安装方式；当前版本 ${native_version:-unknown} 暂不支持 CLI Patch，已跳过 CLI Patch（安全退出）${NC}"
            echo -e "  macOS native 已验证窗口：$(native_support_summary)"
            echo -e "  如需稳定 CLI 中文化，请使用 npm 安装 Claude Code 2.1.112"
        fi
    fi
}

native_binary_version() {
    local binary_path="$1"
    local version output temp_home

    version="$(node "$PLUGIN_SRC/bun-binary-io.js" version "$binary_path" 2>/dev/null || true)"
    if [ -n "${version:-}" ]; then
        printf '%s' "$version"
        return
    fi

    temp_home="$(mktemp -d "${TMPDIR:-/tmp}/cczh-version-home.XXXXXX" 2>/dev/null || true)"
    if [ -n "${temp_home:-}" ]; then
        output="$(HOME="$temp_home" XDG_CONFIG_HOME="$temp_home/.config" XDG_CACHE_HOME="$temp_home/.cache" XDG_DATA_HOME="$temp_home/.local/share" "$binary_path" --version 2>/dev/null || true)"
        rm -rf "$temp_home" 2>/dev/null || true
    else
        output="$("$binary_path" --version 2>/dev/null || true)"
    fi

    printf '%s' "$output" | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true
}

native_binary_version_from_execution() {
    local binary_path="$1"
    local output temp_home

    temp_home="$(mktemp -d "${TMPDIR:-/tmp}/cczh-version-home.XXXXXX" 2>/dev/null || true)"
    if [ -n "${temp_home:-}" ]; then
        output="$(HOME="$temp_home" XDG_CONFIG_HOME="$temp_home/.config" XDG_CACHE_HOME="$temp_home/.cache" XDG_DATA_HOME="$temp_home/.local/share" "$binary_path" --version 2>/dev/null || true)"
        rm -rf "$temp_home" 2>/dev/null || true
    else
        output="$("$binary_path" --version 2>/dev/null || true)"
    fi

    printf '%s' "$output" | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true
}

native_platform() {
    if [ -n "${ZH_CN_NATIVE_PLATFORM:-}" ]; then
        printf '%s' "$ZH_CN_NATIVE_PLATFORM"
        return
    fi

    case "$(uname -s 2>/dev/null)-$(uname -m 2>/dev/null)" in
        Darwin-arm64|Darwin-aarch64)
            printf 'darwin-arm64'
            ;;
        *)
            printf ''
            ;;
    esac
}

is_supported_native_version() {
    local version="$1"
    local platform="${2:-$(native_platform)}"
    local support_file="$PLUGIN_SRC/support-window.json"

    if [ ! -f "$support_file" ]; then
        case "${version:-}" in
            2.1.110|2.1.111|2.1.112)
                return 0
                ;;
            *)
                return 1
                ;;
        esac
    fi

node - "$support_file" "$version" "$platform" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const version = process.argv[3];
const platform = process.argv[4] || "";
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const versions = [];
for (const key of ["macosNativeOfficialInstallerExperimental", "macosNativeExperimental"]) {
  const entry = data[key];
  if (!entry) continue;
  if (platform && entry.platform && entry.platform !== platform) continue;
  versions.push(...(entry.versions || []));
}
process.exit(versions.includes(version) ? 0 : 1);
NODE
}

can_try_provisional_native_version() {
    local version="$1"
    local platform="${2:-$(native_platform)}"
    local support_file="$PLUGIN_SRC/support-window.json"

    if [ -z "${version:-}" ] || [ -z "${platform:-}" ] || [ ! -f "$support_file" ]; then
        return 1
    fi

    node - "$support_file" "$version" "$platform" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const version = process.argv[3];
const platform = process.argv[4];
const data = JSON.parse(fs.readFileSync(file, "utf8"));

function parse(v) {
  return String(v || "").split(".").map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

function compare(a, b) {
  const left = parse(a);
  const right = parse(b);
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    const l = left[i] || 0;
    const r = right[i] || 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function sameMinor(a, b) {
  const left = parse(a);
  const right = parse(b);
  return left[0] === right[0] && left[1] === right[1];
}

const keys = ["macosNativeExperimental"];
for (const key of keys) {
  const entry = data[key];
  if (!entry || entry.platform !== platform || !entry.ceiling) continue;
  if (sameMinor(version, entry.ceiling) && compare(version, entry.ceiling) > 0) {
    process.exit(0);
  }
}
process.exit(1);
NODE
}

native_support_summary() {
    local support_file="$PLUGIN_SRC/support-window.json"

    if [ ! -f "$support_file" ]; then
        printf "2.1.110 - 2.1.112"
        return
    fi

    node - "$support_file" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const ranges = [];
for (const key of ["macosNativeOfficialInstallerExperimental", "macosNativeExperimental"]) {
  const entry = data[key];
  if (!entry || !entry.floor || !entry.ceiling) continue;
  let range = entry.floor === entry.ceiling ? entry.floor : `${entry.floor} - ${entry.ceiling}`;
  if (Array.isArray(entry.excluded) && entry.excluded.length > 0) {
    range += ` (不含 ${entry.excluded.join(", ")})`;
  }
  ranges.push(range);
}
process.stdout.write(ranges.join("；") || "无");
NODE
}

native_binary_hash() {
    local binary_path="$1"
    node "$PLUGIN_SRC/bun-binary-io.js" hash "$binary_path" 2>/dev/null || printf "unknown"
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

prune_settings_backups() {
    local settings_dir
    settings_dir="$(dirname "$SETTINGS_FILE")"

    ZH_CN_SETTINGS_DIR="$settings_dir" node -e "
const fs = require('fs');
const path = require('path');

const settingsDir = process.env.ZH_CN_SETTINGS_DIR;
const prefix = 'settings.json.zh-cn-backup.';

try {
  const backups = fs.readdirSync(settingsDir)
    .filter((name) => name.startsWith(prefix))
    .sort();

  const stale = backups.slice(0, Math.max(0, backups.length - 5));
  for (const name of stale) {
    fs.unlinkSync(path.join(settingsDir, name));
  }
} catch {}
" 2>/dev/null || true
}

build_overlay_content() {
    if [ -f "$INSTALL_JSON_HELPER" ]; then
        node "$INSTALL_JSON_HELPER" build-overlay \
            "$OVERLAY_FILE" \
            "$SCRIPT_DIR/verbs/zh-CN.json" \
            "$SCRIPT_DIR/tips/zh-CN.json"
        return
    fi

    ZH_CN_BASE_FILE="$OVERLAY_FILE" \
    ZH_CN_VERBS_FILE="$SCRIPT_DIR/verbs/zh-CN.json" \
    ZH_CN_TIPS_FILE="$SCRIPT_DIR/tips/zh-CN.json" \
    node -e "
const fs = require('fs');
const base = JSON.parse(fs.readFileSync(process.env.ZH_CN_BASE_FILE, 'utf8').replace(/^\uFEFF/, ''));
const verbs = JSON.parse(fs.readFileSync(process.env.ZH_CN_VERBS_FILE, 'utf8').replace(/^\uFEFF/, ''));
const tips = JSON.parse(fs.readFileSync(process.env.ZH_CN_TIPS_FILE, 'utf8').replace(/^\uFEFF/, ''));
base.spinnerVerbs = verbs;
base.spinnerTipsOverride = { excludeDefault: true, tips: (tips.tips || []).map(t => t.text) };
process.stdout.write(JSON.stringify(base));
"
}

ccswitch_manual_steps() {
    if [ "$SKIP_BANNER" = "1" ]; then
        return
    fi

    echo -e "${YELLOW}你也可以在 CC Switch 中手动处理：编辑 Claude 供应商 → 编辑通用配置 → 从编辑内容提取 → 保存，并确认要切换的供应商勾选“写入通用配置”。${NC}"
}

ccswitch_read_consent() {
    if [ -f "$CCSWITCH_CONSENT_FILE" ]; then
        tr -d '\r\n' < "$CCSWITCH_CONSENT_FILE"
    fi
}

ccswitch_write_consent() {
    local value="$1"
    mkdir -p "$(dirname "$CCSWITCH_CONSENT_FILE")" 2>/dev/null || return 0
    printf "%s\n" "$value" > "$CCSWITCH_CONSENT_FILE" 2>/dev/null || true
}

ccswitch_prompt_for_consent() {
    local answer

    if [ "$UPDATE_ONLY" = true ] || [ "$SKIP_BANNER" = "1" ]; then
        return 2
    fi
    if [ ! -r /dev/tty ] || [ ! -w /dev/tty ]; then
        return 2
    fi

    {
        echo ""
        echo -e "${YELLOW}检测到你在使用 CC Switch。它切换供应商时会重写 Claude 的 settings.json，可能覆盖中文插件设置。${NC}"
        echo "要不要现在把中文插件设置同步到 CC Switch 的“通用配置”，并让 Claude 供应商切换时写入通用配置？"
        echo "同意后，之后切换供应商也会保留中文；不会修改 API Key、模型或供应商配置。"
        printf "输入 Y 帮我同步，或 n 自己处理 [Y/n]: "
    } > /dev/tty

    read -r answer < /dev/tty || answer=""
    case "$answer" in
        ""|[Yy]|[Yy][Ee][Ss]|是|好|同意)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

ccswitch_config_status() {
    local current_file="$1"
    local overlay_file="$2"

    ZH_CN_CCSWITCH_CURRENT_FILE="$current_file" \
    ZH_CN_CCSWITCH_OVERLAY_FILE="$overlay_file" \
    node <<'NODE' 2>/dev/null || printf "invalid"
const fs = require("fs");

function readJson(file, fallback) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  if (!raw.trim()) return fallback;
  return JSON.parse(raw);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function spinnerVerbCount(value) {
  if (Array.isArray(value)) return value.length;
  if (!isPlainObject(value)) return 0;
  if (Array.isArray(value.verbs)) return value.verbs.length;
  return Object.keys(value).length;
}

function spinnerTipCount(value) {
  if (Array.isArray(value)) return value.length;
  if (!isPlainObject(value)) return 0;
  if (Array.isArray(value.tips)) return value.tips.length;
  return 0;
}

const current = readJson(process.env.ZH_CN_CCSWITCH_CURRENT_FILE, {});
readJson(process.env.ZH_CN_CCSWITCH_OVERLAY_FILE, {});

if (!isPlainObject(current)) {
  process.stdout.write("invalid");
  process.exit(0);
}

const complete =
  current.language === "Chinese" &&
  current.spinnerTipsEnabled === true &&
  spinnerVerbCount(current.spinnerVerbs) >= 100 &&
  spinnerTipCount(current.spinnerTipsOverride) >= 40;

process.stdout.write(complete ? "ok" : "needs-sync");
NODE
}

ccswitch_build_merged_config() {
    local current_file="$1"
    local overlay_file="$2"
    local output_file="$3"

    ZH_CN_CCSWITCH_CURRENT_FILE="$current_file" \
    ZH_CN_CCSWITCH_OVERLAY_FILE="$overlay_file" \
    ZH_CN_CCSWITCH_OUTPUT_FILE="$output_file" \
    node <<'NODE'
const fs = require("fs");

function readJson(file, fallback) {
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  if (!raw.trim()) return fallback;
  return JSON.parse(raw);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(result[key]) && isPlainObject(value)) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

const current = readJson(process.env.ZH_CN_CCSWITCH_CURRENT_FILE, {});
const overlay = readJson(process.env.ZH_CN_CCSWITCH_OVERLAY_FILE, {});

if (!isPlainObject(current) || !isPlainObject(overlay)) {
  process.exit(2);
}

fs.writeFileSync(
  process.env.ZH_CN_CCSWITCH_OUTPUT_FILE,
  `${JSON.stringify(deepMerge(current, overlay), null, 2)}\n`
);
NODE
}

ccswitch_build_provider_meta_updates() {
    local providers_file="$1"
    local output_file="$2"

    ZH_CN_CCSWITCH_PROVIDERS_FILE="$providers_file" \
    ZH_CN_CCSWITCH_PROVIDER_SQL_FILE="$output_file" \
    node <<'NODE'
const fs = require("fs");

function fromHex(hex) {
  return Buffer.from(hex || "", "hex").toString("utf8");
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const raw = fs.readFileSync(process.env.ZH_CN_CCSWITCH_PROVIDERS_FILE, "utf8").replace(/\r/g, "");
const lines = raw.split("\n").filter(Boolean);
const updates = [];
let changed = 0;
let skipped = 0;

for (const line of lines) {
  const tab = line.indexOf("\t");
  if (tab < 0) {
    skipped += 1;
    continue;
  }

  const id = fromHex(line.slice(0, tab));
  const metaText = fromHex(line.slice(tab + 1).trim());
  let meta;

  try {
    meta = metaText.trim() ? JSON.parse(metaText) : {};
  } catch (_) {
    skipped += 1;
    continue;
  }

  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    skipped += 1;
    continue;
  }

  if (meta.commonConfigEnabled !== true) {
    changed += 1;
  }
  meta.commonConfigEnabled = true;

  updates.push(
    `update providers set meta=${sqlString(JSON.stringify(meta))} where id=${sqlString(id)} and app_type='claude';`
  );
}

fs.writeFileSync(process.env.ZH_CN_CCSWITCH_PROVIDER_SQL_FILE, updates.join("\n") + (updates.length ? "\n" : ""));
process.stdout.write(`${changed} ${lines.length} ${skipped}`);
NODE
}

sync_ccswitch_common_config() {
    local overlay_content="$1"
    local db_file="$HOME/.cc-switch/cc-switch.db"
    local consent status answer consent_source
    local current_file overlay_file merged_file providers_file provider_sql_file
    local backup_file escaped_merged provider_update_sql provider_sync_summary
    local provider_sync_changed provider_sync_total provider_sync_skipped provider_sync_rest

    [ -f "$db_file" ] || return 0

    if ! command -v sqlite3 >/dev/null 2>&1; then
        if [ "$UPDATE_ONLY" != true ] && [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${YELLOW}检测到 CC Switch，但未找到 sqlite3，无法自动检查/同步通用配置。${NC}"
            ccswitch_manual_steps
        fi
        return 0
    fi

    current_file="$(mktemp "${TMPDIR:-/tmp}/cczh-ccswitch-current.XXXXXX")"
    overlay_file="$(mktemp "${TMPDIR:-/tmp}/cczh-ccswitch-overlay.XXXXXX")"
    merged_file="$(mktemp "${TMPDIR:-/tmp}/cczh-ccswitch-merged.XXXXXX")"
    providers_file="$(mktemp "${TMPDIR:-/tmp}/cczh-ccswitch-providers.XXXXXX")"
    provider_sql_file="$(mktemp "${TMPDIR:-/tmp}/cczh-ccswitch-providers-sql.XXXXXX")"
    printf "%s" "$overlay_content" > "$overlay_file"

    if ! sqlite3 "$db_file" "select value from settings where key='common_config_claude';" > "$current_file" 2>/dev/null; then
        rm -f "$current_file" "$overlay_file" "$merged_file" "$providers_file" "$provider_sql_file" 2>/dev/null || true
        if [ "$UPDATE_ONLY" != true ] && [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${YELLOW}检测到 CC Switch，但无法读取通用配置表，已跳过自动同步。${NC}"
        fi
        return 0
    fi

    status="$(ccswitch_config_status "$current_file" "$overlay_file")"
    if [ "$status" = "ok" ]; then
        if [ "$(sqlite3 "$db_file" "select count(*) from sqlite_master where type='table' and name='providers';" 2>/dev/null)" != "1" ] || \
            ! sqlite3 "$db_file" "select hex(id) || char(9) || hex(meta) from providers where app_type='claude';" > "$providers_file" 2>/dev/null || \
            [ ! -s "$providers_file" ]; then
            rm -f "$current_file" "$overlay_file" "$merged_file" "$providers_file" "$provider_sql_file" 2>/dev/null || true
            return 0
        fi
        provider_sync_summary="$(ccswitch_build_provider_meta_updates "$providers_file" "$provider_sql_file" 2>/dev/null || true)"
        provider_sync_changed="${provider_sync_summary%% *}"
        if [ "${provider_sync_changed:-0}" = "0" ]; then
            rm -f "$current_file" "$overlay_file" "$merged_file" "$providers_file" "$provider_sql_file" 2>/dev/null || true
            return 0
        fi
        status="needs-sync"
    fi
    if [ "$status" != "needs-sync" ]; then
        rm -f "$current_file" "$overlay_file" "$merged_file" "$providers_file" "$provider_sql_file" 2>/dev/null || true
        if [ "$UPDATE_ONLY" != true ] && [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${YELLOW}检测到 CC Switch，但 common_config_claude 不是有效 JSON，已跳过自动同步。${NC}"
            ccswitch_manual_steps
        fi
        return 0
    fi

    case "$CCSWITCH_SYNC_CHOICE" in
        1|true|TRUE|yes|YES|y|Y)
            consent="allow"
            consent_source="env"
            ;;
        0|false|FALSE|no|NO|n|N)
            consent="manual"
            consent_source="env"
            ;;
        *)
            consent="$(ccswitch_read_consent)"
            [ -n "$consent" ] && consent_source="stored"
            ;;
    esac

    if [ "$consent" != "allow" ] && [ "$consent" != "manual" ]; then
        set +e
        ccswitch_prompt_for_consent
        answer="$?"
        set -e
        if [ "$answer" = "0" ]; then
            consent="allow"
            consent_source="prompt"
            ccswitch_write_consent "allow"
        elif [ "$answer" = "1" ]; then
            consent="manual"
            consent_source="prompt"
            ccswitch_write_consent "manual"
        else
            rm -f "$current_file" "$overlay_file" "$merged_file" "$providers_file" "$provider_sql_file" 2>/dev/null || true
            if [ "$UPDATE_ONLY" != true ] && [ "$SKIP_BANNER" != "1" ]; then
                echo -e "${YELLOW}检测到 CC Switch 通用配置缺少中文设置；当前不是交互式安装，未自动修改。${NC}"
                echo -e "${YELLOW}如需授权自动同步，可运行：ZH_CN_CCSWITCH_SYNC=1 ./install.sh${NC}"
                ccswitch_manual_steps
            fi
            return 0
        fi
    fi

    if [ "$consent" != "allow" ]; then
        rm -f "$current_file" "$overlay_file" "$merged_file" "$providers_file" "$provider_sql_file" 2>/dev/null || true
        if [ "$consent_source" = "prompt" ] && [ "$SKIP_BANNER" != "1" ]; then
            ccswitch_manual_steps
        fi
        return 0
    fi

    ccswitch_write_consent "allow"
    if ! ccswitch_build_merged_config "$current_file" "$overlay_file" "$merged_file" >/dev/null 2>&1; then
        rm -f "$current_file" "$overlay_file" "$merged_file" "$providers_file" "$provider_sql_file" 2>/dev/null || true
        if [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${YELLOW}CC Switch 通用配置合并失败，已跳过自动同步。${NC}"
            ccswitch_manual_steps
        fi
        return 0
    fi

    provider_update_sql=""
    provider_sync_summary=""
    if [ "$(sqlite3 "$db_file" "select count(*) from sqlite_master where type='table' and name='providers';" 2>/dev/null)" = "1" ]; then
        if sqlite3 "$db_file" "select hex(id) || char(9) || hex(meta) from providers where app_type='claude';" > "$providers_file" 2>/dev/null; then
            provider_sync_summary="$(ccswitch_build_provider_meta_updates "$providers_file" "$provider_sql_file" 2>/dev/null || true)"
            if [ -s "$provider_sql_file" ]; then
                provider_update_sql="$(cat "$provider_sql_file")"
            fi
        fi
    fi

    backup_file="${db_file}.zh-cn-backup.$(date +%Y%m%d%H%M%S)"
    cp "$db_file" "$backup_file" 2>/dev/null || backup_file=""

    escaped_merged="${merged_file//\'/\'\'}"
    if sqlite3 "$db_file" "begin immediate; insert or replace into settings(key,value) values('common_config_claude', CAST(readfile('$escaped_merged') AS TEXT)); delete from settings where key='common_config_claude_cleared'; ${provider_update_sql} commit;" >/dev/null 2>&1; then
        if [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${GREEN}已在用户同意后同步 CC Switch 通用配置${NC}"
            if [ -n "$provider_sync_summary" ]; then
                provider_sync_changed="${provider_sync_summary%% *}"
                provider_sync_rest="${provider_sync_summary#* }"
                provider_sync_total="${provider_sync_rest%% *}"
                provider_sync_skipped="${provider_sync_rest#* }"
                if [ "${provider_sync_total:-0}" != "0" ]; then
                    echo -e "${GREEN}已让 CC Switch 的 Claude 供应商切换时写入通用配置（${provider_sync_changed}/${provider_sync_total} 个需要更新）${NC}"
                fi
                if [ "${provider_sync_skipped:-0}" != "0" ]; then
                    echo -e "${YELLOW}有 ${provider_sync_skipped} 个 Claude 供应商 meta 不是有效 JSON，已跳过。${NC}"
                fi
            fi
            [ -n "$backup_file" ] && echo -e "${GREEN}已备份 CC Switch 数据库 → ${backup_file}${NC}"
        fi
    else
        if [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${YELLOW}CC Switch 数据库当前无法写入，已跳过自动同步。${NC}"
            [ -n "$backup_file" ] && echo -e "${YELLOW}同步前备份已保留：${backup_file}${NC}"
            ccswitch_manual_steps
        fi
    fi

    rm -f "$current_file" "$overlay_file" "$merged_file" "$providers_file" "$provider_sql_file" 2>/dev/null || true
}

merge_settings() {
    local overlay_content merged

    ensure_settings_file

    if [ "$UPDATE_ONLY" != true ]; then
        cp "$SETTINGS_FILE" "$BACKUP_FILE"
        prune_settings_backups
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
        local overlay_temp
        overlay_temp="${SETTINGS_FILE}.zh-cn-overlay.$$"
        printf '%s' "$overlay_content" > "$overlay_temp"
        if [ -f "$INSTALL_JSON_HELPER" ]; then
            node "$INSTALL_JSON_HELPER" deep-merge-settings "$SETTINGS_FILE" "$overlay_temp" >/dev/null
        else
            ZH_CN_SETTINGS="$SETTINGS_FILE" ZH_CN_OVERLAY_FILE="$overlay_temp" node -e "
const fs = require('fs');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(result[key]) && isPlainObject(value)) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

const merged = deepMerge(readJson(process.env.ZH_CN_SETTINGS), readJson(process.env.ZH_CN_OVERLAY_FILE));
fs.writeFileSync(process.env.ZH_CN_SETTINGS, JSON.stringify(merged, null, 2) + '\n');
"
        fi
        rm -f "$overlay_temp" 2>/dev/null || true
    fi

    if [ "$SKIP_BANNER" != "1" ]; then
        echo -e "${GREEN}已更新 settings.json${NC}"
    fi

    # 缓存完整 overlay 到插件目录，供 session-start hook 自修复使用
    if [ -n "${PLUGIN_DST:-}" ] && [ -d "$PLUGIN_DST" ]; then
        echo "$overlay_content" > "$PLUGIN_DST/.settings-overlay-cache.json"
    fi

    sync_ccswitch_common_config "$overlay_content"
}

sync_plugin_payload() {
    if [ -z "${PLUGIN_DST:-}" ] || [ "$PLUGIN_DST" = "/" ]; then
        echo -e "${RED}错误：PLUGIN_DST 非法，拒绝同步${NC}"
        exit 1
    fi

    mkdir -p "$PLUGIN_DST"
    find "$PLUGIN_DST" -mindepth 1 -maxdepth 1 ! -name '.*' -exec rm -rf {} +
    cp -R "$PLUGIN_SRC"/. "$PLUGIN_DST"/
    chmod +x "$PLUGIN_DST/patch-cli.sh" "$PLUGIN_DST/compute-patch-revision.sh" 2>/dev/null || true
    chmod +x "$PLUGIN_DST/hooks/session-start" "$PLUGIN_DST/hooks/notification" 2>/dev/null || true
    chmod +x "$PLUGIN_DST/bin/claude-launcher" "$PLUGIN_DST/bin/doctor" 2>/dev/null || true

    if [ "$SKIP_BANNER" != "1" ]; then
        echo -e "${GREEN}已安装插件 → ${PLUGIN_DST}${NC}"
    fi
}

resolve_real_path() {
    node -e "try{process.stdout.write(require('fs').realpathSync(process.argv[1]))}catch{}" "$1" 2>/dev/null \
        || readlink "$1" 2>/dev/null \
        || printf "%s" "$1"
}

profile_source_line() {
    local profile_script="$PLUGIN_DST/profile/claude-code-zh-cn.sh"
    printf '[ -f "%s" ] && . "%s"' "$profile_script" "$profile_script"
}

list_profile_targets() {
    if [ -n "${PROFILE_FILES_OVERRIDE:-}" ]; then
        printf "%s\n" "$PROFILE_FILES_OVERRIDE"
        return
    fi

    local shell_name="${SHELL##*/}"
    local candidates=()
    case "$shell_name" in
        zsh)
            candidates=("$HOME/.zshrc" "$HOME/.zprofile")
            ;;
        bash)
            candidates=("$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.profile")
            ;;
        *)
            candidates=("$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile")
            ;;
    esac

    local target
    for target in "${candidates[@]}"; do
        if [ -f "$target" ]; then
            printf "%s\n" "$target"
            return
        fi
    done

    printf "%s\n" "${candidates[0]}"
}

update_profile_injection() {
    local target="$1"
    local mode="$2"
    local source_line
    source_line="$(profile_source_line)"

    PROFILE_TARGET="$target" \
    PROFILE_MODE="$mode" \
    PROFILE_MARKER_START="$PROFILE_MARKER_START" \
    PROFILE_MARKER_END="$PROFILE_MARKER_END" \
    PROFILE_SOURCE_LINE="$source_line" \
    node - <<'NODE'
const fs = require("fs");
const path = process.env.PROFILE_TARGET;
const mode = process.env.PROFILE_MODE;
const start = process.env.PROFILE_MARKER_START;
const end = process.env.PROFILE_MARKER_END;
const sourceLine = process.env.PROFILE_SOURCE_LINE;
const block = `${start}\n${sourceLine}\n${end}`;

let content = "";
if (fs.existsSync(path)) {
  content = fs.readFileSync(path, "utf8");
}

const escapedStart = start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const blockPattern = new RegExp(`\\n?${escapedStart}[\\s\\S]*?${escapedEnd}\\n?`, "g");
content = content.replace(blockPattern, "");

if (mode === "install") {
  const trimmed = content.replace(/\s+$/, "");
  const prefix = trimmed.length > 0 ? `${trimmed}\n\n` : "";
  content = `${prefix}${block}\n`;
} else {
  content = content.replace(/\s+$/, "");
  if (content.length > 0) {
    content += "\n";
  }
}

fs.mkdirSync(require("path").dirname(path), { recursive: true });
fs.writeFileSync(path, content);
NODE
}

remove_launcher_artifacts() {
    local target

    while IFS= read -r target; do
        [ -n "$target" ] || continue
        update_profile_injection "$target" remove
    done < <(list_profile_targets)

    if [ -f "$LAUNCHER_FILE" ]; then
        if grep -q "claude-code-zh-cn" "$LAUNCHER_FILE" 2>/dev/null; then
            rm -f "$LAUNCHER_FILE"
        elif [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${YELLOW}检测到自定义 launcher，未自动删除：${LAUNCHER_FILE}${NC}"
        fi
    fi
    rmdir "$LAUNCHER_BIN_DIR" 2>/dev/null || true
}

detect_launcher_installation() {
    local claude_bin
    claude_bin="$(find_real_claude_binary)"
    if [ -z "$claude_bin" ]; then
        return 0
    fi

    node - "$claude_bin" <<'NODE'
const fs = require("fs");
const path = require("path");

let realPath = "";
try {
  realPath = fs.realpathSync(process.argv[2]);
} catch {
  process.exit(0);
}

const candidates = [
  path.resolve(path.dirname(realPath), "../lib/node_modules/@anthropic-ai/claude-code/cli.js"),
  path.resolve(path.dirname(realPath), "node_modules/@anthropic-ai/claude-code/cli.js"),
];

for (const cliFile of candidates) {
  if (fs.existsSync(cliFile)) {
    process.stdout.write(`npm:${cliFile}`);
    process.exit(0);
  }
}
NODE
}

install_launcher() {
    local source_launcher="$PLUGIN_DST/bin/claude-launcher"
    local install_info install_kind
    local target

    install_info="$(detect_launcher_installation)"
    install_kind="${install_info%%:*}"

    if [ "$install_kind" != "npm" ]; then
        remove_launcher_artifacts
        LAUNCHER_STATUS_SUMMARY="已跳过（当前 claude 命令不是 npm cli.js）"
        if [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${YELLOW}当前安装方式不需要 npm 启动前自修复，已跳过 launcher PATH 注入${NC}"
        fi
        return
    fi

    if [ ! -f "$source_launcher" ] || [ ! -f "$PLUGIN_DST/profile/claude-code-zh-cn.sh" ]; then
        echo -e "${YELLOW}launcher 文件缺失，已跳过 PATH 注入${NC}"
        LAUNCHER_STATUS_SUMMARY="已跳过（launcher 文件缺失）"
        return
    fi

    mkdir -p "$LAUNCHER_BIN_DIR"
    cp "$source_launcher" "$LAUNCHER_FILE"
    chmod +x "$LAUNCHER_FILE" 2>/dev/null || true

    while IFS= read -r target; do
        [ -n "$target" ] || continue
        update_profile_injection "$target" install
    done < <(list_profile_targets)

    if [ "$SKIP_BANNER" != "1" ]; then
        echo -e "${GREEN}已安装 launcher → ${LAUNCHER_FILE}${NC}"
    fi
    LAUNCHER_STATUS_SUMMARY="npm 更新后首次启动会先 patch"
    LAUNCHER_STATUS_OK=true
}

find_real_claude_binary() {
    if [ -n "${ZH_CN_REAL_CLAUDE:-}" ] && [ -x "${ZH_CN_REAL_CLAUDE:-}" ]; then
        printf "%s" "$ZH_CN_REAL_CLAUDE"
        return
    fi

    local filtered_path=""
    local path_entry
    local old_ifs="$IFS"
    IFS=':'
    for path_entry in ${PATH:-}; do
        if [ "${path_entry:-}" = "$LAUNCHER_BIN_DIR" ]; then
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

detect_installation() {
    local claude_bin
    claude_bin="$(find_real_claude_binary)"
    if [ -z "$claude_bin" ]; then
        printf ""
        return
    fi

    # 调用 JS 后端（用源码侧路径 $PLUGIN_SRC，首次安装时 $PLUGIN_DST 不存在）
    if [ -f "$PLUGIN_SRC/bun-binary-io.js" ]; then
        local result
        result="$(node "$PLUGIN_SRC/bun-binary-io.js" detect "$claude_bin" 2>/dev/null || true)"

        # helper 成功执行：有结果就用；unknown 也向上传递，供上层决定如何提示
        if [ -n "$result" ]; then
            printf "%s" "$result"
            return
        fi
        # helper 执行失败 → 不 patch
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
    if [ "${patch_count:-0}" = "0" ]; then
        CLI_PATCH_STATUS_SUMMARY="cli.js 无新增改动（可能已是最新状态）"
    else
        CLI_PATCH_STATUS_SUMMARY="cli.js 中文化（${patch_count:-0} 处硬编码文字）"
    fi
    CLI_PATCH_STATUS_OK=true

    patch_revision=$(compute_patch_revision "$PLUGIN_DST" 2>/dev/null || true)
    if [ -n "${patch_revision:-}" ] && [ -n "${current_version:-}" ]; then
        echo "${current_version}|${patch_revision}" > "$MARKER_FILE"
    fi
}

patch_native_binary() {
    local binary_path="$1"
    local tmp_js="${TMPDIR:-/tmp}/claude-zh-cn-extract.$$.js"
    local backup_path="${binary_path}.zh-cn-backup"
    local current_version backup_version patch_mode platform

    echo ""
    echo -e "${BLUE}检测到官方安装器（原生二进制）${NC}"
    echo -e "  二进制路径: ${binary_path}"

    current_version="$(native_binary_version "$binary_path")"
    platform="$(native_platform)"
    patch_mode="verified"
    if is_supported_native_version "$current_version" "$platform"; then
        patch_mode="verified"
    elif can_try_provisional_native_version "$current_version" "$platform"; then
        patch_mode="provisional"
    else
        echo -e "${YELLOW}当前原生二进制版本 ${current_version:-unknown} 暂不支持 CLI Patch，已跳过 CLI Patch（安全退出）${NC}"
        echo -e "  macOS native 已验证窗口：$(native_support_summary)"
        echo -e "  如需稳定 CLI 中文化，请使用 npm 安装 Claude Code 2.1.112"
        print_updater_boundary_note
        echo -e "${YELLOW}  下一步：如果是 Claude Code 自动升到未发布窗口，请等插件发布支持，或临时安装支持窗口内版本。${NC}"
        CLI_PATCH_STATUS_SUMMARY="已跳过（原生二进制版本 ${current_version:-unknown} 暂不支持 CLI Patch）"
        return
    fi

    if [ "$patch_mode" = "provisional" ]; then
        echo -e "  版本: ${current_version}（未纳入已发布支持窗口，安装时本机自验证）"
        print_unpublished_window_note
    else
        echo -e "  版本: ${current_version}（experimental）"
    fi

    local dep_status
    dep_status="$(node "$PLUGIN_SRC/bun-binary-io.js" check-deps 2>/dev/null || echo "missing")"
    if [ "$dep_status" != "ok" ]; then
        echo -e "${YELLOW}需要安装 node-lief 来支持官方安装器 native patch${NC}"
        echo -e "  运行: ${GREEN}npm install -g node-lief${NC}"
        echo -e "  然后重新运行 ./install.sh"
        CLI_PATCH_STATUS_SUMMARY="已跳过（官方安装器 CLI Patch 需要 node-lief）"
        return
    fi

    backup_version=""
    if [ -f "$backup_path" ]; then
        backup_version="$(native_binary_version "$backup_path")"
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

    local source_hash
    source_hash="$(native_binary_hash "$binary_path")"

    node "$PLUGIN_SRC/bun-binary-io.js" extract "$binary_path" "$tmp_js" || {
        echo -e "${RED}提取 JS 失败${NC}"
        CLI_PATCH_STATUS_SUMMARY="已跳过（原生二进制提取失败）"
        rm -f "$tmp_js"
        return
    }

    local patch_count
    patch_count=$("$PLUGIN_SRC/patch-cli.sh" "$tmp_js" 2>/dev/null || echo "0")

    if [ "$patch_count" != "0" ]; then
        node "$PLUGIN_SRC/bun-binary-io.js" repack "$binary_path" "$tmp_js" || {
            echo -e "${RED}写回二进制失败，正在从备份恢复...${NC}"
            cp "$backup_path" "$binary_path" 2>/dev/null || true
            CLI_PATCH_STATUS_SUMMARY="已跳过（原生二进制写回失败）"
            rm -f "$tmp_js"
            return
        }
        local verified_version
        echo -e "  正在运行 --version 做本机启动自检..."
        verified_version="$(native_binary_version_from_execution "$binary_path")"
        if [ "${verified_version:-}" != "${current_version:-}" ]; then
            echo -e "${RED}本机启动自检失败，正在从备份恢复...${NC}"
            cp "$backup_path" "$binary_path" 2>/dev/null || true
            CLI_PATCH_STATUS_SUMMARY="已跳过（原生二进制本机启动自检失败）"
            rm -f "$tmp_js"
            return
        fi

        if [ "$patch_mode" = "provisional" ]; then
            echo -e "${GREEN}本机自验证通过，已 patch 原生二进制（${patch_count} 处硬编码文字）${NC}"
            CLI_PATCH_STATUS_SUMMARY="官方安装器 native 本机自验证中文化（${patch_count} 处硬编码文字，未纳入已发布支持窗口）"
        else
            echo -e "${GREEN}本机启动自检通过，已 patch 原生二进制（${patch_count} 处硬编码文字）${NC}"
            CLI_PATCH_STATUS_SUMMARY="官方安装器 native 启动自检中文化（${patch_count} 处硬编码文字）"
        fi
        CLI_PATCH_STATUS_OK=true
    else
        echo -e "${YELLOW}未找到需要 patch 的内容${NC}"
        if [ "$patch_mode" = "provisional" ]; then
            CLI_PATCH_STATUS_SUMMARY="已跳过（原生二进制本机自验证未找到可 patch 内容）"
            rm -f "$tmp_js"
            return
        else
            CLI_PATCH_STATUS_SUMMARY="原生二进制无新增改动（可能已是最新状态）"
            CLI_PATCH_STATUS_OK=true
        fi
    fi

    rm -f "$tmp_js"

    local patch_revision final_hash
    current_version="$(native_binary_version "$binary_path")"
    final_hash="$(native_binary_hash "$binary_path")"
    patch_revision=$(compute_patch_revision "$PLUGIN_DST" 2>/dev/null || true)
    if [ -n "${patch_revision:-}" ] && [ -n "${current_version:-}" ]; then
        if [ "$patch_mode" = "provisional" ]; then
            echo "native|${current_version}|${final_hash:-unknown}|${patch_revision}|provisional|${platform:-unknown}|${source_hash:-unknown}" > "$MARKER_FILE"
        else
            echo "native|${current_version}|${final_hash:-unknown}|${patch_revision}" > "$MARKER_FILE"
        fi
    fi
}

initial_patch_cli() {
    local install_info

    install_info="$(detect_installation)"
    if [ -z "$install_info" ]; then
        echo -e "${YELLOW}未找到 Claude Code，跳过 patch 步骤${NC}"
        CLI_PATCH_STATUS_SUMMARY="已跳过（未检测到 Claude Code）"
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
        unknown)
            echo -e "${YELLOW}当前安装方式暂不支持 CLI Patch，已跳过此步骤${NC}"
            CLI_PATCH_STATUS_SUMMARY="已跳过（当前安装方式暂不支持 CLI Patch）"
            ;;
        *)
            echo -e "${YELLOW}未识别的安装类型: $kind${NC}"
            CLI_PATCH_STATUS_SUMMARY="已跳过（未识别的安装类型: $kind）"
            ;;
    esac
}

main() {
    print_banner
    detect_platform
    check_dependencies
    sync_plugin_payload
    install_launcher
    merge_settings
    write_install_metadata

    if [ "$UPDATE_ONLY" != true ]; then
        initial_patch_cli
    fi

    print_completion
}

main "$@"
