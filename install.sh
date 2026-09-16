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
MARKETPLACE_SOURCE_OVERRIDE="${ZH_CN_MARKETPLACE_SOURCE:-}"
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
OFFICIAL_PLUGIN_ID="claude-code-zh-cn@claude-code-zh-cn"
OFFICIAL_MARKETPLACE_NAME="claude-code-zh-cn"
OFFICIAL_FALLBACK_MARKER="$PLUGIN_DST/.official-fallback-disabled"
PLUGIN_RUNTIME_MODE="standalone"

print_updater_boundary_note() {
    echo -e "  ${YELLOW}!${NC} Claude Code 本体自动升级 → DISABLE_AUTOUPDATER 不归本插件兜底；请以 claude doctor 的 Updates 段为准"
}

print_unpublished_window_note() {
    echo -e "${YELLOW}  提醒：本机自验证不等于已发布支持；普通更新会在下次启动前检查，未知文案继续显示英文。${NC}"
}

make_private_temp_dir() {
    node -e 'const fs=require("fs"),os=require("os"),path=require("path");process.stdout.write(fs.mkdtempSync(path.join(os.tmpdir(),process.argv[1])))' "$1"
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
        echo -e "  ${GREEN}✓${NC} 启动前自修复 → ${LAUNCHER_STATUS_SUMMARY}"
    else
        echo -e "  ${YELLOW}!${NC} 启动前自修复 → ${LAUNCHER_STATUS_SUMMARY}"
    fi
    case "$PLUGIN_RUNTIME_MODE" in
        standalone)
            echo -e "  ${YELLOW}!${NC} 独立备用更新 → 限时检查 Release，会话结束后按提示手动更新"
            ;;
        disabled)
            echo -e "  ${YELLOW}!${NC} 正式插件已停用 → 保留用户选择，不加载备用 Hook"
            ;;
        *)
            echo -e "  ${GREEN}✓${NC} 正式插件更新 → 由 Claude plugin manager 管理"
            ;;
    esac
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
        if [[ "$(native_platform)" == linux-* ]]; then
            echo -e "  ${YELLOW}!${NC} Linux x64 glibc 未收录版本会先本机验证；不支持 arm64、musl"
        else
            echo -e "  ${YELLOW}!${NC} 官方安装器 native patch：已验证版本有公开证据；更高可识别版本会在安装时本机自验证"
        fi
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
        echo "原生程序会按实际结构进行本机自验证；版本清单只记录发布验证结果。"
        if [ "$(node "$PLUGIN_SRC/bun-binary-io.js" check-deps 2>/dev/null)" != "ok" ]; then
            echo "CLI Patch 需要 node-lief（Linux x64 glibc 需要 >= 1.3.0）；请安装 npm install -g node-lief@1.3.2"
        fi
    fi
}

native_platform() {
    node -e 'process.stdout.write(require(process.argv[1]).platform())' "$PLUGIN_SRC/scripts/native-repair.js"
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

official_marketplace_source() {
    case "${MARKETPLACE_SOURCE_OVERRIDE:-}" in
        ?*) printf '%s' "$MARKETPLACE_SOURCE_OVERRIDE"; return ;;
    esac
    case "${SOURCE_REPO_OVERRIDE:-}" in
        http://*|https://*|git@*|ssh://*|*/*)
            printf '%s' "$SOURCE_REPO_OVERRIDE"
            ;;
        *)
            printf '%s' "$SCRIPT_DIR"
            ;;
    esac
}

verify_official_plugin_registration() {
    local claude_cli="$1"
    local marketplace_json plugin_json expected_version

    marketplace_json="$("$claude_cli" plugin marketplace list --json 2>/dev/null)" || return 1
    plugin_json="$("$claude_cli" plugin list --json 2>/dev/null)" || return 1
    expected_version="$(official_plugin_expected_version)"

    ZH_CN_MARKETPLACE_JSON="$marketplace_json" \
    ZH_CN_PLUGIN_JSON="$plugin_json" \
    ZH_CN_MARKETPLACE_NAME="$OFFICIAL_MARKETPLACE_NAME" \
    ZH_CN_PLUGIN_ID="$OFFICIAL_PLUGIN_ID" \
    ZH_CN_PLUGIN_EXPECTED_VERSION="$expected_version" \
    node <<'NODE' >/dev/null 2>&1
function parse(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const marketplaces = parse(process.env.ZH_CN_MARKETPLACE_JSON);
const plugins = parse(process.env.ZH_CN_PLUGIN_JSON);
const expectedVersion = process.env.ZH_CN_PLUGIN_EXPECTED_VERSION || "";
const marketplaceOk = marketplaces.some((entry) => entry && entry.name === process.env.ZH_CN_MARKETPLACE_NAME);
const pluginOk = plugins.some((entry) =>
  entry &&
  entry.id === process.env.ZH_CN_PLUGIN_ID &&
  entry.scope === "user" &&
  entry.enabled === true &&
  (!expectedVersion || entry.version === expectedVersion)
);

process.exit(marketplaceOk && pluginOk ? 0 : 1);
NODE
}

official_plugin_expected_version() {
    local manifest="$PLUGIN_SRC/.claude-plugin/plugin.json"
    [ -f "$manifest" ] || return 0
    node -e 'try{const value=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(String(value.version||""))}catch{}' "$manifest" 2>/dev/null || true
}

official_user_plugin_installed() {
    local claude_cli="$1"
    local plugin_json

    plugin_json="$("$claude_cli" plugin list --json 2>/dev/null)" || return 1
    ZH_CN_PLUGIN_JSON="$plugin_json" ZH_CN_PLUGIN_ID="$OFFICIAL_PLUGIN_ID" node <<'NODE' >/dev/null 2>&1
try {
  const parsed = JSON.parse(process.env.ZH_CN_PLUGIN_JSON || "[]");
  const plugins = Array.isArray(parsed) ? parsed : [];
  process.exit(plugins.some((entry) => entry && entry.id === process.env.ZH_CN_PLUGIN_ID && entry.scope === "user") ? 0 : 1);
} catch {
  process.exit(1);
}
NODE
}

official_plugin_settings_state() {
    [ -f "$SETTINGS_FILE" ] || { printf 'absent'; return; }

    ZH_CN_SETTINGS="$SETTINGS_FILE" ZH_CN_PLUGIN_ID="$OFFICIAL_PLUGIN_ID" node <<'NODE' 2>/dev/null || printf 'absent'
const fs = require("fs");
try {
  const raw = fs.readFileSync(process.env.ZH_CN_SETTINGS, "utf8").replace(/^\uFEFF/, "");
  const settings = raw.trim() ? JSON.parse(raw) : {};
  const plugins = settings && settings.enabledPlugins;
  if (!plugins || !Object.prototype.hasOwnProperty.call(plugins, process.env.ZH_CN_PLUGIN_ID)) {
    process.stdout.write("absent");
  } else {
    process.stdout.write(plugins[process.env.ZH_CN_PLUGIN_ID] === false ? "disabled" : "enabled");
  }
} catch {
  process.stdout.write("absent");
}
NODE
}

activate_standalone_fallback() {
    local reason="$1"

    PLUGIN_RUNTIME_MODE="standalone"
    echo -e "${YELLOW}官方插件 CLI 校验未完成（${reason}）；将停用未确认的官方入口，并启用一套独立备用 Hook。基础中文设置和 CLI Patch 不受影响。${NC}"
}

mark_official_plugin_verified() {
    PLUGIN_RUNTIME_MODE="official"
    rm -f "$OFFICIAL_FALLBACK_MARKER" 2>/dev/null || true
}

select_safe_plugin_fallback() {
    local reason="$1"
    local settings_state
    settings_state="$(official_plugin_settings_state)"

    case "$settings_state" in
        enabled)
            activate_standalone_fallback "$reason"
            ;;
        disabled)
            if [ -f "$OFFICIAL_FALLBACK_MARKER" ]; then
                activate_standalone_fallback "$reason"
            else
                PLUGIN_RUNTIME_MODE="disabled"
                echo -e "${YELLOW}官方插件已明确停用；保留用户选择，不加载备用 Hook。基础中文设置和 CLI Patch 继续生效。${NC}"
            fi
            ;;
        *)
            activate_standalone_fallback "$reason"
            ;;
    esac
}

register_official_plugin() {
    local claude_cli marketplace_source
    local plugin_was_installed=false
    local plugin_install_failed=false
    local initial_settings_state

    claude_cli="$(find_real_claude_binary)"
    if [ -z "$claude_cli" ]; then
        select_safe_plugin_fallback "未找到可用的 claude CLI"
        return 0
    fi

    initial_settings_state="$(official_plugin_settings_state)"
    if [ "$initial_settings_state" = "disabled" ] && [ -f "$OFFICIAL_FALLBACK_MARKER" ]; then
        PLUGIN_RUNTIME_MODE="official-retry"
        if reconcile_standalone_hooks && [ "$(official_plugin_settings_state)" = "enabled" ]; then
            initial_settings_state="enabled"
            echo -e "${YELLOW}上次因校验失败临时停用了官方入口；本次重新尝试正式插件注册。${NC}"
        else
            select_safe_plugin_fallback "无法安全切换到正式插件重试状态"
            return 0
        fi
    fi
    if [ "$initial_settings_state" = "disabled" ]; then
        if [ -f "$SCRIPT_DIR/.claude-plugin/marketplace.json" ]; then
            marketplace_source="$(official_marketplace_source)"
            "$claude_cli" plugin marketplace add --scope user "$marketplace_source" >/dev/null 2>&1 || true
        fi
        "$claude_cli" plugin marketplace update "$OFFICIAL_MARKETPLACE_NAME" >/dev/null 2>&1 || true
        if official_user_plugin_installed "$claude_cli"; then
            "$claude_cli" plugin update "$OFFICIAL_PLUGIN_ID" --scope user >/dev/null 2>&1 || true
        fi
        PLUGIN_RUNTIME_MODE="disabled"
        echo -e "${YELLOW}官方插件已明确停用；已保留用户选择，不调用 install，也不加载备用 Hook。${NC}"
        return 0
    fi

    if [ "$UPDATE_ONLY" = true ] && verify_official_plugin_registration "$claude_cli"; then
        mark_official_plugin_verified
        echo -e "${GREEN}官方插件注册已验证（user scope）${NC}"
        return 0
    fi

    if [ ! -f "$PLUGIN_SRC/.claude-plugin/plugin.json" ]; then
        select_safe_plugin_fallback "安装包缺少官方插件清单"
        return 0
    fi

    if [ ! -f "$SCRIPT_DIR/.claude-plugin/marketplace.json" ]; then
        if ! official_user_plugin_installed "$claude_cli"; then
            select_safe_plugin_fallback "安装包缺少插件市场清单，且未检测到已安装的官方插件"
            return 0
        fi
        "$claude_cli" plugin marketplace update "$OFFICIAL_MARKETPLACE_NAME" >/dev/null 2>&1 || true
        "$claude_cli" plugin update "$OFFICIAL_PLUGIN_ID" --scope user >/dev/null 2>&1 || true
        if verify_official_plugin_registration "$claude_cli"; then
            mark_official_plugin_verified
            echo -e "${GREEN}官方插件注册已验证（user scope）${NC}"
        else
            select_safe_plugin_fallback "官方插件自动更新后校验失败"
        fi
        return 0
    fi

    marketplace_source="$(official_marketplace_source)"
    if official_user_plugin_installed "$claude_cli"; then
        plugin_was_installed=true
    fi

    if [ -n "${MARKETPLACE_SOURCE_OVERRIDE:-}" ]; then
        "$claude_cli" plugin marketplace remove "$OFFICIAL_MARKETPLACE_NAME" >/dev/null 2>&1 || true
    fi

    if ! "$claude_cli" plugin marketplace add --scope user "$marketplace_source" >/dev/null 2>&1; then
        if verify_official_plugin_registration "$claude_cli"; then
            mark_official_plugin_verified
            echo -e "${YELLOW}插件市场刷新失败，继续使用已验证的官方 user 插件。${NC}"
        else
            select_safe_plugin_fallback "插件市场注册失败"
        fi
        return 0
    fi
    "$claude_cli" plugin marketplace update "$OFFICIAL_MARKETPLACE_NAME" >/dev/null 2>&1 || true

    if "$claude_cli" plugin install "$OFFICIAL_PLUGIN_ID" --scope user >/dev/null 2>&1; then
        if [ "$plugin_was_installed" = true ]; then
            "$claude_cli" plugin update "$OFFICIAL_PLUGIN_ID" --scope user >/dev/null 2>&1 || true
        fi
    else
        plugin_install_failed=true
        "$claude_cli" plugin update "$OFFICIAL_PLUGIN_ID" --scope user >/dev/null 2>&1 || true
    fi

    if verify_official_plugin_registration "$claude_cli"; then
        mark_official_plugin_verified
        echo -e "${GREEN}官方插件注册已验证（user scope）${NC}"
        return 0
    fi

    if [ "$plugin_install_failed" = true ]; then
        select_safe_plugin_fallback "官方插件安装失败"
    else
        select_safe_plugin_fallback "安装后列表校验失败"
    fi
}

reconcile_standalone_hooks() {
    local fallback_marker_created=false

    if [ "$PLUGIN_RUNTIME_MODE" = "standalone" ] && [ ! -f "$OFFICIAL_FALLBACK_MARKER" ]; then
        mkdir -p "$PLUGIN_DST" 2>/dev/null || true
        if printf '%s\n' "standalone" > "$OFFICIAL_FALLBACK_MARKER" 2>/dev/null; then
            fallback_marker_created=true
        else
            PLUGIN_RUNTIME_MODE="official-unverified"
            echo -e "${YELLOW}无法写入正式插件重试标记；为避免重复 Hook，本次不注入备用 Hook。${NC}"
        fi
    fi

    if ! ZH_CN_SETTINGS="$SETTINGS_FILE" \
    ZH_CN_PLUGIN_DST="$PLUGIN_DST" \
    ZH_CN_PLUGIN_RUNTIME_MODE="$PLUGIN_RUNTIME_MODE" \
    ZH_CN_OFFICIAL_PLUGIN_ID="$OFFICIAL_PLUGIN_ID" \
    node <<'NODE'; then
const fs = require("fs");
const path = require("path");
const settingsFile = process.env.ZH_CN_SETTINGS;
const pluginRoot = process.env.ZH_CN_PLUGIN_DST;
const mode = process.env.ZH_CN_PLUGIN_RUNTIME_MODE;
const officialPluginId = process.env.ZH_CN_OFFICIAL_PLUGIN_ID;
const standaloneArg = "--standalone";

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStandaloneHook(hook) {
  if (!isObject(hook)) return false;
  if (typeof hook.command === "string" && hook.command.includes("ZH_CN_STANDALONE_HOOK=1")) return true;
  if (hook.command !== "node" || !Array.isArray(hook.args) || !hook.args.includes(standaloneArg)) return false;
  const script = String(hook.args[0] || "");
  return script === path.join(pluginRoot, "hooks", "session-start.js") ||
    script === path.join(pluginRoot, "hooks", "notification.js") ||
    script === path.join(pluginRoot, "hooks", "user-prompt-submit.js");
}

function resolveCommitTarget(file) {
  try {
    return fs.realpathSync(file);
  } catch {}
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) {
      const link = fs.readlinkSync(file);
      return path.isAbsolute(link) ? link : path.resolve(path.dirname(file), link);
    }
  } catch {}
  return path.resolve(file);
}

function commitSettings(file, content) {
  const target = resolveCommitTarget(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let mode = 0o600;
  try { mode = fs.statSync(target).mode & 0o777; } catch {}
  const temp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.zh-cn-hooks.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  );
  try {
    fs.writeFileSync(temp, content, { mode });
    fs.chmodSync(temp, mode);
    fs.renameSync(temp, target);
  } finally {
    try { fs.unlinkSync(temp); } catch {}
  }
}

const raw = fs.readFileSync(settingsFile, "utf8").replace(/^\uFEFF/, "");
const settings = raw.trim() ? JSON.parse(raw) : {};
if (!isObject(settings)) process.exit(2);

let changed = false;
if (isObject(settings.hooks)) {
  for (const eventName of Object.keys(settings.hooks)) {
    const entries = settings.hooks[eventName];
    if (!Array.isArray(entries)) continue;
    const nextEntries = [];
    for (const entry of entries) {
      if (!isObject(entry) || !Array.isArray(entry.hooks)) {
        nextEntries.push(entry);
        continue;
      }
      const hooks = entry.hooks.filter((hook) => !isStandaloneHook(hook));
      if (hooks.length !== entry.hooks.length) changed = true;
      if (hooks.length > 0) nextEntries.push(hooks.length === entry.hooks.length ? entry : { ...entry, hooks });
    }
    if (nextEntries.length > 0) settings.hooks[eventName] = nextEntries;
    else delete settings.hooks[eventName];
  }
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
}

if (mode === "standalone") {
  if (!isObject(settings.enabledPlugins)) settings.enabledPlugins = {};
  settings.enabledPlugins[officialPluginId] = false;
  if (!isObject(settings.hooks)) settings.hooks = {};
  const sessionScript = path.join(pluginRoot, "hooks", "session-start.js");
  const notificationScript = path.join(pluginRoot, "hooks", "notification.js");
  if (!Array.isArray(settings.hooks.SessionStart)) settings.hooks.SessionStart = [];
  if (!Array.isArray(settings.hooks.Notification)) settings.hooks.Notification = [];
  if (!Array.isArray(settings.hooks.UserPromptSubmit)) settings.hooks.UserPromptSubmit = [];
  const userPromptScript = path.join(pluginRoot, "hooks", "user-prompt-submit.js");
  settings.hooks.SessionStart.push({
    matcher: "startup|resume|clear|compact",
    hooks: [{ type: "command", command: "node", args: [sessionScript, standaloneArg], async: false }],
  });
  settings.hooks.Notification.push({
    matcher: "",
    hooks: [{ type: "command", command: "node", args: [notificationScript, standaloneArg], async: false, timeout: 10 }],
  });
  settings.hooks.UserPromptSubmit.push({
    matcher: "",
    hooks: [{ type: "command", command: "node", args: [userPromptScript, standaloneArg], async: false, timeout: 120 }],
  });
  changed = true;
}

if (mode === "official-retry") {
  if (!isObject(settings.enabledPlugins)) settings.enabledPlugins = {};
  settings.enabledPlugins[officialPluginId] = true;
  changed = true;
}

if (changed) commitSettings(settingsFile, `${JSON.stringify(settings, null, 2)}\n`);
NODE
        if [ "$fallback_marker_created" = true ]; then
            rm -f "$OFFICIAL_FALLBACK_MARKER" 2>/dev/null || true
        fi
        PLUGIN_RUNTIME_MODE="official-unverified"
        echo -e "${YELLOW}备用 Hook 安全写入失败；为避免重复 Hook，本次保留官方入口。基础中文设置和 CLI Patch 仍保持可用。${NC}"
        return 0
    fi

    if [ "$PLUGIN_RUNTIME_MODE" = "standalone" ]; then
        echo -e "${YELLOW}已启用独立备用 Hook（不会与官方插件 Hook 同时加载）${NC}"
    fi
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
        echo -e "${YELLOW}检测到 CC Switch，但未找到 sqlite3，通用配置未同步；可运行插件的 zh-cn-setup（Node.js 22.13+ 内置 SQLite）或在 CC Switch 中手动合并。${NC}" >&2
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
    local native_info
    native_info="$(node "$PLUGIN_DST/bun-binary-io.js" detect "$(find_real_claude_binary)" 2>/dev/null || true)"
    case "$native_info" in native-bun:*) printf "%s" "$native_info"; return ;; esac
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

    if [ "$install_kind" != "npm" ] && [ "$install_kind" != "native-bun" ]; then
        remove_launcher_artifacts
        LAUNCHER_STATUS_SUMMARY="已跳过（当前 claude 命令不是 npm cli.js）"
        if [ "$SKIP_BANNER" != "1" ]; then
            echo -e "${YELLOW}当前安装方式不需要 启动前自修复，已跳过 launcher PATH 注入${NC}"
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
    cp "$PLUGIN_DST/scripts/resolve-runtime.js" "$LAUNCHER_BIN_DIR/resolve-runtime.js"
    chmod +x "$LAUNCHER_FILE" 2>/dev/null || true

    while IFS= read -r target; do
        [ -n "$target" ] || continue
        update_profile_injection "$target" install
    done < <(list_profile_targets)

    if [ "$SKIP_BANNER" != "1" ]; then
        echo -e "${GREEN}已安装 launcher → ${LAUNCHER_FILE}${NC}"
    fi
    LAUNCHER_STATUS_SUMMARY="CC 更新后首次启动会先验证并补汉化"
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
    local current_version patch_count patch_revision patch_status status_dir status_file

    echo ""
    echo -e "${BLUE}正在 patch cli.js 硬编码文字...${NC}"

    current_version=$(sed -n 's/^\/\/ Version: //p' "$cli_file" | head -1) || current_version=""

    # 备份/恢复/语法校验/失败回滚统一由 patch-cli.js 托管（--backup 模式）：
    # - 同版本备份存在 → 从备份恢复干净基底再 patch，杜绝 patch 叠 patch
    # - patch 结果通过 JS 语法校验才写盘；失败则不落盘，CLI 保持可用（优雅降级）
    status_dir="$(make_private_temp_dir "cczh-patch-status.")"
    status_file="$status_dir/status"
    patch_count=$("$PLUGIN_SRC/patch-cli.sh" "$cli_file" \
        --backup "${cli_file}.zh-cn-backup" \
        --status "$status_file" 2>/dev/null || echo "0")
    patch_status="$(cat "$status_file" 2>/dev/null || echo "error")"
    rm -rf "$status_dir"

    case "$patch_status" in
        ok)
            echo -e "${GREEN}已 patch cli.js（${patch_count:-0} 处硬编码文字）${NC}"
            CLI_PATCH_STATUS_SUMMARY="cli.js 中文化（${patch_count:-0} 处硬编码文字）"
            CLI_PATCH_STATUS_OK=true
            ;;
        partial)
            echo -e "${YELLOW}已 patch cli.js（${patch_count:-0} 处），但当前版本存在未覆盖的英文文案（部分降级，CLI 可正常使用）${NC}"
            CLI_PATCH_STATUS_SUMMARY="cli.js 部分中文化（${patch_count:-0} 处，当前版本存在未覆盖文案）"
            CLI_PATCH_STATUS_OK=true
            ;;
        noop)
            echo -e "${GREEN}cli.js 无新增改动（可能已是最新状态）${NC}"
            CLI_PATCH_STATUS_SUMMARY="cli.js 无新增改动（可能已是最新状态）"
            CLI_PATCH_STATUS_OK=true
            ;;
        validation-failed)
            echo -e "${YELLOW}patch 结果未通过 JS 语法校验，已放弃写入（CLI 保持英文可用，详见插件目录 patch.log）${NC}"
            CLI_PATCH_STATUS_SUMMARY="已跳过（patch 结果未通过语法校验，CLI 保持英文可用）"
            return
            ;;
        *)
            echo -e "${YELLOW}CLI Patch 未完成（详见插件目录 patch.log），CLI 保持原样可用${NC}"
            CLI_PATCH_STATUS_SUMMARY="已跳过（CLI Patch 未完成，详见 patch.log）"
            return
            ;;
    esac

    patch_revision=$(compute_patch_revision "$PLUGIN_DST" 2>/dev/null || true)
    if [ -n "${patch_revision:-}" ] && [ -n "${current_version:-}" ]; then
        echo "${current_version}|${patch_revision}" > "$MARKER_FILE"
    fi
}

patch_native_binary() {
    local result
    if result="$(node "$PLUGIN_DST/scripts/native-repair.js" "$1" "$PLUGIN_DST")"; then
        CLI_PATCH_STATUS_OK=true
        CLI_PATCH_STATUS_SUMMARY="$(node -e 'const r=JSON.parse(process.argv[1]);process.stdout.write("Claude Code "+r.version+" 本机自验证通过（"+r.patched+" 处译文；"+(r.mode==="provisional"?"未纳入已发布支持窗口":"已发布验证版本")+"）")' "$result")"
        echo "$CLI_PATCH_STATUS_SUMMARY"
    else
        CLI_PATCH_STATUS_SUMMARY="未完成；请按上方具体错误处理，正常升级后再次启动即可重试"
        echo "$CLI_PATCH_STATUS_SUMMARY"
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
    register_official_plugin
    install_launcher
    merge_settings
    reconcile_standalone_hooks
    write_install_metadata

    if [ "$UPDATE_ONLY" != true ]; then
        initial_patch_cli
    fi


    print_completion
}

main "$@"
