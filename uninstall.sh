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
OFFICIAL_PLUGIN_ID="claude-code-zh-cn@claude-code-zh-cn"
OFFICIAL_MARKETPLACE_NAME="claude-code-zh-cn"

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
        if grep -q "claude-code-zh-cn" "$LAUNCHER_FILE" 2>/dev/null; then
            rm -f "$LAUNCHER_FILE"
            echo -e "${GREEN}已移除 launcher${NC}"
        else
            echo -e "${YELLOW}检测到自定义 launcher，未自动删除：${LAUNCHER_FILE}${NC}"
        fi
    fi
    rmdir "$LAUNCHER_BIN_DIR" 2>/dev/null || true
}

remove_launcher_artifacts

find_real_claude_for_plugin() {
    if [ -n "${ZH_CN_REAL_CLAUDE:-}" ] && [ -x "${ZH_CN_REAL_CLAUDE:-}" ]; then
        printf '%s' "$ZH_CN_REAL_CLAUDE"
        return
    fi

    local filtered_path=""
    local path_entry
    local old_ifs="$IFS"
    IFS=':'
    for path_entry in ${PATH:-}; do
        [ "${path_entry:-}" = "$LAUNCHER_BIN_DIR" ] && continue
        if [ -z "$filtered_path" ]; then
            filtered_path="$path_entry"
        else
            filtered_path="${filtered_path}:$path_entry"
        fi
    done
    IFS="$old_ifs"

    PATH="$filtered_path" command -v claude 2>/dev/null || true
}

official_registration_absent() {
    local claude_cli="$1"
    local marketplace_json plugin_json

    marketplace_json="$("$claude_cli" plugin marketplace list --json 2>/dev/null)" || return 1
    plugin_json="$("$claude_cli" plugin list --json 2>/dev/null)" || return 1

    ZH_CN_MARKETPLACE_JSON="$marketplace_json" \
    ZH_CN_PLUGIN_JSON="$plugin_json" \
    ZH_CN_MARKETPLACE_NAME="$OFFICIAL_MARKETPLACE_NAME" \
    ZH_CN_PLUGIN_ID="$OFFICIAL_PLUGIN_ID" \
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
const marketplaceExists = marketplaces.some((entry) => entry && entry.name === process.env.ZH_CN_MARKETPLACE_NAME);
const pluginExists = plugins.some((entry) =>
  entry && entry.id === process.env.ZH_CN_PLUGIN_ID && entry.scope === "user"
);
process.exit(!marketplaceExists && !pluginExists ? 0 : 1);
NODE
}

remove_official_plugin_registration() {
    local claude_cli
    claude_cli="$(find_real_claude_for_plugin)"
    [ -n "$claude_cli" ] || return 0

    "$claude_cli" plugin uninstall "$OFFICIAL_PLUGIN_ID" --scope user >/dev/null 2>&1 || true
    "$claude_cli" plugin marketplace remove --scope user "$OFFICIAL_MARKETPLACE_NAME" >/dev/null 2>&1 || true

    if official_registration_absent "$claude_cli"; then
        echo -e "${GREEN}官方插件注册已移除并验证${NC}"
    else
        echo -e "${YELLOW}官方插件 CLI 卸载未能完整验证；将继续精确清理本插件设置，不影响其他插件。${NC}"
    fi
}

remove_official_plugin_registration

# 精准移除插件注入的 settings 项（保留用户其他配置和 Hook）
if [ -f "$SETTINGS_FILE" ]; then
    if command -v node &>/dev/null; then
        ZH_CN_SETTINGS="$SETTINGS_FILE" ZH_CN_PLUGIN_DST="$PLUGIN_DST" node -e "
const fs = require('fs');
const settingsFile = process.env.ZH_CN_SETTINGS;
const pluginRoot = process.env.ZH_CN_PLUGIN_DST || '';

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function readSettings(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  return raw.trim() ? JSON.parse(raw) : {};
}

function normalizePath(value) {
  return String(value || '').replace(/\\\\/g, '/').replace(/\/+$/, '');
}

const pluginRootNormalized = normalizePath(pluginRoot);
let settings = readSettings(settingsFile);
if (!isObject(settings)) settings = {};
const legacyLocalRegistrationPresent =
  (isObject(settings.enabledPlugins) && Object.prototype.hasOwnProperty.call(settings.enabledPlugins, 'claude-code-zh-cn@local-zh-cn')) ||
  (isObject(settings.extraKnownMarketplaces) && Object.prototype.hasOwnProperty.call(settings.extraKnownMarketplaces, 'local-zh-cn'));

let changed = false;
for (const key of ['language', 'spinnerTipsEnabled', 'spinnerTipsOverride', 'spinnerVerbs']) {
  if (Object.prototype.hasOwnProperty.call(settings, key)) {
    delete settings[key];
    changed = true;
  }
}

if (isObject(settings.enabledPlugins)) {
  for (const pluginId of ['claude-code-zh-cn@claude-code-zh-cn', 'claude-code-zh-cn@local-zh-cn']) {
    if (Object.prototype.hasOwnProperty.call(settings.enabledPlugins, pluginId)) {
      delete settings.enabledPlugins[pluginId];
      changed = true;
    }
  }
  if (Object.keys(settings.enabledPlugins).length === 0) delete settings.enabledPlugins;
}

if (isObject(settings.extraKnownMarketplaces)) {
  for (const marketplaceName of ['claude-code-zh-cn', 'local-zh-cn']) {
    if (Object.prototype.hasOwnProperty.call(settings.extraKnownMarketplaces, marketplaceName)) {
      delete settings.extraKnownMarketplaces[marketplaceName];
      changed = true;
    }
  }
  if (Object.keys(settings.extraKnownMarketplaces).length === 0) delete settings.extraKnownMarketplaces;
}

function hookBelongsToPlugin(hook) {
  if (!isObject(hook)) return false;
  const normalized = normalizePath(hook.command);
  const args = Array.isArray(hook.args) ? hook.args : [];
  const knownHookSuffixes = [
    '/hooks/session-start',
    '/hooks/notification',
    '/hooks/session-start.js',
    '/hooks/notification.js',
    '/hooks/session-start.cmd',
    '/hooks/notification.cmd',
    '/hooks/session-start.ps1',
    '/hooks/notification.ps1',
    '/hooks-handlers/session-start.js',
    '/hooks-handlers/notification.js',
  ];
  if (normalized.includes('ZH_CN_STANDALONE_HOOK=1')) return true;
  if ((normalized === 'node' || normalized.endsWith('/node') || normalized.endsWith('/node.exe')) &&
      args.includes('--standalone')) {
    const script = normalizePath(args[0]);
    if (pluginRootNormalized && knownHookSuffixes.some((suffix) => script === pluginRootNormalized + suffix)) return true;
  }
  if (legacyLocalRegistrationPresent && normalized.includes('CLAUDE_PLUGIN_ROOT') &&
      knownHookSuffixes.some((suffix) => normalized.includes(suffix))) return true;
  if (pluginRootNormalized && knownHookSuffixes.some((suffix) => normalized.includes(pluginRootNormalized + suffix))) return true;
  return normalized.includes('/local-zh-cn/') &&
    knownHookSuffixes.some((suffix) => normalized.includes(suffix));
}

function cleanHookEntry(entry) {
  if (!isObject(entry) || !Array.isArray(entry.hooks)) {
    return { entry, changed: false, keep: true };
  }

  const hooks = entry.hooks.filter((hook) => !hookBelongsToPlugin(hook));
  if (hooks.length === entry.hooks.length) {
    return { entry, changed: false, keep: true };
  }
  if (hooks.length === 0) {
    return { changed: true, keep: false };
  }
  return { entry: { ...entry, hooks }, changed: true, keep: true };
}

if (isObject(settings.hooks)) {
  for (const eventName of Object.keys(settings.hooks)) {
    const entries = settings.hooks[eventName];
    if (!Array.isArray(entries)) continue;
    const nextEntries = [];
    let eventChanged = false;
    for (const entry of entries) {
      const result = cleanHookEntry(entry);
      if (result.changed) eventChanged = true;
      if (result.keep) nextEntries.push(result.entry);
    }
    if (eventChanged) {
      changed = true;
      if (nextEntries.length > 0) settings.hooks[eventName] = nextEntries;
      else delete settings.hooks[eventName];
    }
  }
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
    changed = true;
  }
}

if (changed) fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n');
"
        echo -e "${GREEN}已从 settings.json 移除中文设置（保留其他配置）${NC}"
    elif command -v jq &>/dev/null; then
        jq --arg pluginRoot "$PLUGIN_DST" '
def normalize_path:
  tostring | gsub("\\\\"; "/") | sub("/+$"; "");

def plugin_hook($legacyLocalRegistration):
  if type != "object" then false
  else
    ((.command? // "") | normalize_path) as $command |
    (.args? // []) as $args |
    ($pluginRoot | normalize_path) as $root |
    (($args[0]? // "") | normalize_path) as $script |
    (($command | contains("ZH_CN_STANDALONE_HOOK=1")) or
    ((($command == "node") or ($command | endswith("/node")) or ($command | endswith("/node.exe"))) and
      ($args | type) == "array" and ($args | index("--standalone")) != null and ($root | length) > 0 and
      (($script == ($root + "/hooks/session-start.js")) or ($script == ($root + "/hooks/notification.js")))) or
    ($legacyLocalRegistration and ($command | contains("CLAUDE_PLUGIN_ROOT")) and
      (($command | contains("/hooks/session-start")) or ($command | contains("/hooks/notification")))) or
    (($root | length) > 0 and
      (($command | contains($root + "/hooks/session-start")) or
       ($command | contains($root + "/hooks/notification")) or
       ($command | contains($root + "/hooks-handlers/session-start.js")) or
       ($command | contains($root + "/hooks-handlers/notification.js")))) or
    (($command | contains("/local-zh-cn/")) and
      (($command | contains("/hooks/session-start")) or
       ($command | contains("/hooks/notification")) or
       ($command | contains("/hooks-handlers/session-start.js")) or
       ($command | contains("/hooks-handlers/notification.js")))))
  end;

def clean_hook_entry($legacyLocalRegistration):
  if type == "object" and (.hooks | type) == "array" then
    (.hooks |= map(select((plugin_hook($legacyLocalRegistration) | not))))
    | select((.hooks | length) > 0)
  else
    .
  end;

(((.enabledPlugins | type) == "object" and (.enabledPlugins | has("claude-code-zh-cn@local-zh-cn"))) or
 ((.extraKnownMarketplaces | type) == "object" and (.extraKnownMarketplaces | has("local-zh-cn")))) as $legacyLocalRegistration
| del(.language, .spinnerTipsEnabled, .spinnerTipsOverride, .spinnerVerbs)
| if (.enabledPlugins | type) == "object" then
    .enabledPlugins |= del(."claude-code-zh-cn@claude-code-zh-cn", ."claude-code-zh-cn@local-zh-cn")
    | if (.enabledPlugins | length) == 0 then del(.enabledPlugins) else . end
  else . end
| if (.extraKnownMarketplaces | type) == "object" then
    .extraKnownMarketplaces |= del(."claude-code-zh-cn", ."local-zh-cn")
    | if (.extraKnownMarketplaces | length) == 0 then del(.extraKnownMarketplaces) else . end
  else . end
| if (.hooks | type) == "object" then
    .hooks |= with_entries(
      if (.value | type) == "array" then
        (.value | map(clean_hook_entry($legacyLocalRegistration))) as $next |
        if ($next == .value) then .
        elif ($next | length) > 0 then .value = $next
        else empty
        end
      else .
      end
    )
    | if (.hooks | length) == 0 then del(.hooks) else . end
  else . end
' "$SETTINGS_FILE" > "${SETTINGS_FILE}.tmp" && mv "${SETTINGS_FILE}.tmp" "$SETTINGS_FILE"
        echo -e "${GREEN}已从 settings.json 移除中文设置（保留其他配置）${NC}"
    else
        echo -e "${YELLOW}请手动编辑 $SETTINGS_FILE 移除以下字段：${NC}"
        echo "  - language"
        echo "  - spinnerTipsEnabled"
        echo "  - spinnerTipsOverride"
        echo "  - spinnerVerbs"
        echo "  - 本插件写入的 hooks / enabledPlugins / extraKnownMarketplaces 项"
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

# 还原 skill/插件命令说明为英文（必须在移除插件目录前，否则 restore.js 已不存在）
if [ -x "$PLUGIN_DST/skill-i18n/restore.js" ] && command -v node >/dev/null 2>&1; then
    echo -e "${BLUE}还原 skill/插件命令说明为英文...${NC}"
    node "$PLUGIN_DST/skill-i18n/restore.js" --all >/dev/null 2>&1 || true
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
