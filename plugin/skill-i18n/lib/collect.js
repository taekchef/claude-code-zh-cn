// lib/collect.js — skill/command/metadata 文件发现（单一来源，scan 与 restore 共用）
// 统一用 walkAndCollect 递归 + 排除规则，告别固定子目录枚举（避免逐轮发现新目录结构）。

"use strict";

const fs = require("fs");
const path = require("path");

function tryReadDir(d) {
  try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; }
}
function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function dirIsDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function fileIsFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
// 目录项是否为「文件」（含跟随符号链接指向的文件），用于 command .md 收集
function isFileEntry(e, full, followSymlinks) {
  if (e.isFile()) return true;
  return followSymlinks && e.isSymbolicLink() && fileIsFile(full);
}
// 目录项是否为「目录」（含跟随符号链接指向的目录），与 isFileEntry 对称
function isDirEntry(e, full, followSymlinks) {
  if (e.isDirectory()) return true;
  return followSymlinks && e.isSymbolicLink() && dirIsDir(full);
}

// 排除的目录段（非 skill/command 内容，或多语言副本 / 构建产物 / IDE 配置）
const EXCLUDE_SEGS = new Set([
  ".git", "node_modules", "docs", "dist", "tests", "test", "src",
  ".github", ".openclaw", ".vscode", ".idea",
]);

// 公共递归收集器：遍历 dir，遇到 SKILL.md 收为 skill，遇到 commands 目录取其下所有 .md 为 command。
// 跟随符号链接由 followSymlinks 控制。统一供 user / cache / marketplaces 三处使用。
// visitedRealpaths 防符号链接成环：进入目录时 realpath + 去重（每组根内部生效，跨组不共享）。
function walkAndCollect(dir, followSymlinks, out, visitedRealpaths) {
  let realDir;
  try { realDir = fs.realpathSync(dir); } catch { return; }
  if (visitedRealpaths.has(realDir)) return; // 已访问（防环）
  visitedRealpaths.add(realDir);
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (EXCLUDE_SEGS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (isDirEntry(e, full, followSymlinks)) {
      if (e.name === "commands") {
        collectCommandsDeep(full, followSymlinks, out, visitedRealpaths);
        continue; // 已收集，不再 walk（避免重复 + 深层 command 漏扫）
      }
      walkAndCollect(full, followSymlinks, out, visitedRealpaths);
    } else if (e.isFile() && e.name === "SKILL.md") {
      out.push({ path: full, kind: "skill" });
    }
  }
}

// 递归收集 commands 目录下所有 .md（含嵌套子目录），作为 command。
// 应用 EXCLUDE_SEGS（与 walkAndCollect 一致），并在进入目录时 realpath + visitedRealpaths 防符号链接成环。
function collectCommandsDeep(dir, followSymlinks, out, visitedRealpaths) {
  let realDir;
  try { realDir = fs.realpathSync(dir); } catch { return; }
  if (visitedRealpaths.has(realDir)) return; // 已访问（防环）
  visitedRealpaths.add(realDir);
  for (const e of tryReadDir(dir)) {
    if (EXCLUDE_SEGS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (isFileEntry(e, full, followSymlinks) && e.name.endsWith(".md")) {
      out.push({ path: full, kind: "command" });
    } else if (isDirEntry(e, full, followSymlinks)) {
      collectCommandsDeep(full, followSymlinks, out, visitedRealpaths);
    }
  }
}

// 从一组根目录递归收集（user 的 skills/commands 根、cache 的各版本根、marketplaces 的各插件根）
function collectFromRoots(roots, followSymlinks) {
  const out = [];
  const visitedRealpaths = new Set();
  for (const r of roots) {
    if (!exists(r)) continue;
    // 根目录本身是 commands 时，直接深收集其下 .md（否则 walkAndCollect 只认子目录名为 commands）
    if (path.basename(r) === "commands") {
      collectCommandsDeep(r, followSymlinks, out, visitedRealpaths);
    } else {
      walkAndCollect(r, followSymlinks, out, visitedRealpaths);
    }
  }
  return out;
}

// 用户级：~/.claude/skills, ~/.claude/commands（及 .claude/skills|commands）
function collectUserMarkdown(root, followSymlinks) {
  return collectFromRoots([
    path.join(root, "skills"),
    path.join(root, "commands"),
    path.join(root, ".claude", "skills"),
    path.join(root, ".claude", "commands"),
  ], followSymlinks);
}

// 插件 cache：<root>/plugins/cache/<mp>/<plugin>/<version>/ 各版本根递归
function collectPluginMarkdown(root, followSymlinks) {
  const roots = [];
  const cacheBase = path.join(root, "plugins", "cache");
  for (const mp of tryReadDir(cacheBase)) {
    if (!mp.isDirectory()) continue;
    const mpDir = path.join(cacheBase, mp.name);
    for (const plugin of tryReadDir(mpDir)) {
      if (!plugin.isDirectory()) continue;
      const pluginDir = path.join(mpDir, plugin.name);
      for (const ver of tryReadDir(pluginDir)) {
        if (ver.isDirectory()) roots.push(path.join(pluginDir, ver.name));
      }
    }
  }
  return collectFromRoots(roots, followSymlinks);
}

// marketplaces：<root>/plugins/marketplaces/<name>/ 各插件根递归
function collectMarketplaces(root, followSymlinks) {
  const roots = [];
  const mpBase = path.join(root, "plugins", "marketplaces");
  for (const mp of tryReadDir(mpBase)) {
    if (mp.isDirectory() || (followSymlinks && mp.isSymbolicLink())) {
      roots.push(path.join(mpBase, mp.name));
    }
  }
  return collectFromRoots(roots, followSymlinks);
}

// 插件元数据 JSON：plugin.json（cache 下）+ marketplace.json（cache 下 + marketplaces 下）
function collectMetadata(root) {
  const out = [];
  const seen = new Set();
  const add = (p) => { if (exists(p) && !seen.has(p)) { seen.add(p); out.push({ path: p, kind: "metadata" }); } };
  const cacheBase = path.join(root, "plugins", "cache");
  for (const mp of tryReadDir(cacheBase)) {
    if (!mp.isDirectory()) continue;
    const mpDir = path.join(cacheBase, mp.name);
    for (const plugin of tryReadDir(mpDir)) {
      if (!plugin.isDirectory()) continue;
      const pluginDir = path.join(mpDir, plugin.name);
      for (const ver of tryReadDir(pluginDir)) {
        if (!ver.isDirectory()) continue;
        const cp = path.join(pluginDir, ver.name, ".claude-plugin");
        add(path.join(cp, "plugin.json"));
        add(path.join(cp, "marketplace.json"));
      }
    }
  }
  const mpBase = path.join(root, "plugins", "marketplaces");
  for (const m of tryReadDir(mpBase)) {
    if (!m.isDirectory()) continue;
    add(path.join(mpBase, m.name, ".claude-plugin", "marketplace.json"));
  }
  return out;
}

// 统一收集所有来源。followSymlinks 控制是否跟随符号链接目录。
function collectAll(root, followSymlinks) {
  return [
    ...collectUserMarkdown(root, followSymlinks),
    ...collectPluginMarkdown(root, followSymlinks),
    ...collectMarketplaces(root, followSymlinks),
    ...collectMetadata(root),
  ];
}

module.exports = {
  collectAll, walkAndCollect, collectCommandsDeep, collectFromRoots,
  collectUserMarkdown, collectPluginMarkdown, collectMarketplaces, collectMetadata,
  EXCLUDE_SEGS,
};
