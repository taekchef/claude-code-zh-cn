#!/usr/bin/env node

// plugin/skills/zh-cn-setup/scripts/setup.js
//
// 跨平台（macOS / Linux / Windows）首次增强安装脚本。
// 由 zh-cn-setup skill 调用，也可被用户手动运行：
//   node ~/.claude/plugins/.../skills/zh-cn-setup/scripts/setup.js
//
// 职责（只做"装插件本身不会自动完成"的步骤）：
//   1. 从插件内置 verbs/tips/settings-overlay 构建 overlay，合并进 ~/.claude/settings.json
//      （只补齐缺失项，并迁移废弃的 spinnerVerbs 数组；带备份 + 原子写）
//   2. 检测 CC Switch 通用配置，必要时引导用户授权同步（非交互时只输出手动步骤）
//   3. 报告 patch 状态，提示是否需要重启
//
// 不做的事（避免循环依赖 / 重复维护）：
//   - 不调 claude plugin install/update（插件本体由用户或 plugin manager 管）
//   - 不手动 CLI patch（由 session-start hook 自动维护）

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const {
  buildOverlay,
  fillMissingKeys,
  writeSettings,
  resolvePluginRoot,
} = require(path.join(__dirname, "..", "..", "..", "scripts", "build-overlay.js"));

function homeDir() {
  return process.env.HOME || process.env.USERPROFILE || os.homedir();
}

function settingsFile() {
  return path.join(homeDir(), ".claude", "settings.json");
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function spinnerVerbCount(value) {
  if (Array.isArray(value)) return value.length;
  return isPlainObject(value) && Array.isArray(value.verbs) ? value.verbs.length : 0;
}

function backupSettings(settingsPath) {
  try {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+/, "")
      .replace("T", "");
    const backup = `${settingsPath}.zh-cn-backup.${stamp}`;
    if (fs.existsSync(settingsPath)) {
      fs.copyFileSync(settingsPath, backup);
      return backup;
    }
  } catch {
    // 备份失败不阻塞，但返回 null
  }
  return null;
}

// ---- CC Switch 同步 ----

function ccSwitchDbPath() {
  return path.join(homeDir(), ".cc-switch", "cc-switch.db");
}

function sqlite3Available() {
  const result = spawnSync("sqlite3", ["--version"], { encoding: "utf8", windowsHide: true });
  return result.status === 0;
}

function ccSwitchReadCommonConfig(dbFile) {
  const result = spawnSync("sqlite3", [dbFile, "select value from settings where key='common_config_claude';"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  const raw = (result.stdout || "").trim();
  return raw ? raw : "";
}

function ccSwitchConfigStatus(currentRaw, overlay) {
  // 与 install.ps1 JS_CCSWITCH_STATUS 同款判定
  const current = (() => {
    try {
      const v = JSON.parse((currentRaw || "").replace(/^\uFEFF/, ""));
      return isPlainObject(v) ? v : null;
    } catch {
      return null;
    }
  })();

  if (!current) return "invalid";

  const verbCount = spinnerVerbCount(current.spinnerVerbs);
  const tipCount = isPlainObject(current.spinnerTipsOverride) && Array.isArray(current.spinnerTipsOverride.tips)
    ? current.spinnerTipsOverride.tips.length
    : 0;

  const ok =
    current.language === "Chinese" &&
    current.spinnerTipsEnabled === true &&
    verbCount >= 100 &&
    tipCount >= 40;
  return ok ? "ok" : "needs-sync";
}

function syncCcSwitch(dbFile, overlay) {
  // 备份 → 合并 → 写入 common_config_claude（事务）
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\..+/, "")
    .replace("T", "");
  const backup = `${dbFile}.zh-cn-backup.${stamp}`;
  try {
    fs.copyFileSync(dbFile, backup);
  } catch {
    return { ok: false, reason: "无法备份数据库" };
  }

  const mergedJson = JSON.stringify(overlay, null, 2);
  // 用 hex 绑定参数避免引号转义地狱：把合并后的 JSON 写到临时文件，用 readfile() 读入
  const mergedFile = path.join(os.tmpdir(), `cczh-ccswitch-merged-${process.pid}.json`);
  try {
    fs.writeFileSync(mergedFile, mergedJson);
    const escaped = mergedFile.replace(/'/g, "''");
    const sql = `begin immediate; insert or replace into settings(key,value) values('common_config_claude', CAST(readfile('${escaped}') AS TEXT)); delete from settings where key='common_config_claude_cleared'; commit;`;
    const result = spawnSync("sqlite3", [dbFile, sql], { encoding: "utf8", windowsHide: true });
    if (result.status !== 0) {
      return { ok: false, reason: "写入失败", backup };
    }
    return { ok: true, backup };
  } finally {
    try {
      fs.unlinkSync(mergedFile);
    } catch {
      // ignore
    }
  }
}

// ---- patch 状态报告 ----

function reportPatchStatus(pluginRoot) {
  // session-start hook 把 patch marker 写在 STATE_ROOT/.patched-version
  // 这里只做只读提示，不手动 patch
  const stateRoot = process.env.CLAUDE_PLUGIN_DATA || process.env.CLAUDE_PLUGIN_ROOT || pluginRoot;
  const markerFile = path.join(stateRoot, ".patched-version");
  const marker = fs.existsSync(markerFile) ? fs.readFileSync(markerFile, "utf8").trim() : "";

  const lines = [];
  if (marker) {
    lines.push(`✓ 已检测到 CLI patch 标记：${marker.split("|")[0]}`);
    lines.push("  （CLI patch 由 session-start hook 自动维护；Claude Code 更新后会自动重新 patch）");
  } else {
    lines.push("ℹ 暂未检测到 CLI patch 标记。这通常表示：");
    lines.push("  - 当前 Claude Code 版本暂不在已验证窗口内（会走 provisional 本机自检），或");
    lines.push("  - patch 将在下次会话启动时由 hook 自动尝试");
  }
  lines.push("");
  lines.push("如界面仍为英文，请完全退出所有 Claude Code 窗口后重新打开（让 hook 重新 patch）。");
  return lines.join("\n");
}

// ---- 主流程 ----

function main() {
  const pluginRoot = resolvePluginRoot();
  const settingsPath = settingsFile();

  console.log("claude-code-zh-cn 增强安装\n");

  // 1. 合并 settings
  const overlay = buildOverlay(pluginRoot);
  const verbCount = spinnerVerbCount(overlay.spinnerVerbs);
  const tipCount = overlay.spinnerTipsOverride?.tips?.length || 0;
  console.log(`已从插件内置数据构建 overlay：${verbCount} 个动词、${tipCount} 条提示`);

  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const current = isPlainObject(readJson(settingsPath, null)) ? readJson(settingsPath, {}) : {};
  const { changed, merged } = fillMissingKeys(settingsPath, overlay);

  if (changed) {
    const backup = backupSettings(settingsPath);
    if (backup) console.log(`已备份 settings.json → ${backup}`);
    writeSettings(settingsPath, merged);
    console.log("✓ 已补齐 settings.json 中缺失的中文配置（未覆盖你已有的设置）");
  } else {
    console.log("✓ settings.json 已包含完整中文配置，无需修改");
  }

  // 2. CC Switch 同步
  const dbFile = ccSwitchDbPath();
  if (fs.existsSync(dbFile)) {
    if (!sqlite3Available()) {
      console.log("\n! 检测到 CC Switch，但系统未安装 sqlite3，无法自动同步通用配置。");
      console.log("  请手动在 CC Switch 的 Claude 通用配置里加入 language=Chinese、spinnerTipsEnabled=true 等。");
    } else {
      const currentRaw = ccSwitchReadCommonConfig(dbFile);
      if (currentRaw === null) {
        console.log("\n! 检测到 CC Switch，但无法读取通用配置表，已跳过自动同步。");
      } else {
        const status = ccSwitchConfigStatus(currentRaw, overlay);
        if (status === "ok") {
          console.log("\n✓ CC Switch 通用配置已是最新，无需同步");
        } else if (status === "invalid") {
          console.log("\n! 检测到 CC Switch，但通用配置不是有效 JSON，已跳过自动同步。");
        } else {
          // needs-sync
          const choice = process.env.ZH_CN_CCSWITCH_SYNC;
          if (choice === "1" || choice === "true" || choice === "yes") {
            const result = syncCcSwitch(dbFile, overlay);
            if (result.ok) {
              console.log("\n✓ 已在授权后同步 CC Switch 通用配置");
              if (result.backup) console.log(`  备份 → ${result.backup}`);
            } else {
              console.log(`\n! CC Switch 同步失败：${result.reason || "未知错误"}`);
              if (result.backup) console.log(`  同步前备份已保留：${result.backup}`);
            }
          } else {
            console.log("\n! 检测到 CC Switch 通用配置缺少中文设置。");
            console.log("  如需授权自动同步（会先备份数据库），重新运行并设置环境变量：");
            console.log("    macOS/Linux: ZH_CN_CCSWITCH_SYNC=1 node .../setup.js");
            console.log("    Windows:     set ZH_CN_CCSWITCH_SYNC=1 && node ...\\setup.js");
            console.log("  否则请手动在 CC Switch 的 Claude 通用配置中加入中文设置。");
          }
        }
      }
    }
  }

  // 3. patch 状态
  console.log("\n--- CLI patch 状态 ---");
  console.log(reportPatchStatus(pluginRoot));

  console.log("\n增强安装完成。");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`\nsetup 失败：${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildOverlay,
  fillMissingKeys,
  ccSwitchConfigStatus,
  syncCcSwitch,
  settingsFile,
  ccSwitchDbPath,
};
