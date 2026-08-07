#!/usr/bin/env node
"use strict";
// 把 CC Switch 管理的 skill 目录（~/.cc-switch/skills/<name>/SKILL.md）中已翻译的中文
// description 同步到 cc-switch.db 的 skills.description。默认只读，--apply 才写入并先备份。

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function hasCJK(s) {
  return /[一-鿿]/.test(s || "");
}

// 中文字符占比是否过半（用于判断数据库描述是否"已本地化"，避免个别中文词误判）
function isMostlyZh(s) {
  const t = s || "";
  if (!t) return false;
  const zh = (t.match(/[一-鿿]/g) || []).length;
  return zh / t.length >= 0.5;
}

function parseFrontmatterDescription(filePath) {
  // 返回 frontmatter 中 description/desc 字段的值；无 frontmatter 或无该字段返回 null。
  if (!fs.existsSync(filePath)) return null;
  const head = fs.readFileSync(filePath, "utf8").slice(0, 8000);
  const fm = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  const dm = fm[1].match(/^(?:description|desc):\s*(.*)$/m);
  if (!dm) return null;
  const raw = dm[1].trim();
  if (raw.startsWith('"')) {
    const quoted = raw.match(/^"([\s\S]*)"$/);
    if (quoted) return quoted[1];
  }
  return raw.replace(/^['"]|['"]$/g, "").trim() || null;
}

function skillMdPath(skillsRoot, name) {
  return path.join(skillsRoot, name, "SKILL.md");
}

// 返回 { update, alreadyZh, noSource }。
// update: [{ id, name, dbDesc, zhDesc }]，noSource: [{ id, name, reason }]
function buildSyncPlan(dbPath, skillsRoot) {
  let DatabaseSync = null;
  try {
    DatabaseSync = require("node:sqlite").DatabaseSync;
  } catch {}
  if (!DatabaseSync) {
    throw new Error("当前 Node 不支持 node:sqlite，无法读取 CC Switch 数据库。请升级到 Node 22.5+，或改用 sqlite3 CLI 手动处理。");
  }
  if (!fs.existsSync(dbPath)) {
    return { update: [], alreadyZh: [], noSource: [], missingDb: dbPath };
  }
  const db = new DatabaseSync(dbPath, { readOnly: true });
  let rows;
  try {
    rows = db.prepare("SELECT id, name, description FROM skills").all();
  } finally {
    db.close();
  }
  const update = [];
  const alreadyZh = [];
  const noSource = [];
  for (const row of rows) {
    const dbDesc = String(row.description || "");
    if (isMostlyZh(dbDesc)) {
      alreadyZh.push({ id: row.id, name: row.name });
      continue;
    }
    const zhDesc = parseFrontmatterDescription(skillMdPath(skillsRoot, row.name));
    if (zhDesc && hasCJK(zhDesc)) {
      update.push({ id: row.id, name: row.name, dbDesc, zhDesc });
    } else {
      noSource.push({ id: row.id, name: row.name, reason: "未找到已翻译的中文 description 的 SKILL.md" });
    }
  }
  return { update, alreadyZh, noSource };
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// 返回 { backup, updated }。先备份，再逐条 UPDATE description。
function applyPlan(dbPath, plan) {
  const backup = `${dbPath}.${timestamp()}.bak`;
  fs.copyFileSync(dbPath, backup);
  const DatabaseSync = require("node:sqlite").DatabaseSync;
  const db = new DatabaseSync(dbPath);
  let updated = 0;
  try {
    const stmt = db.prepare("UPDATE skills SET description = ? WHERE id = ?");
    for (const item of plan.update) {
      stmt.run(item.zhDesc, item.id);
      updated += 1;
    }
  } finally {
    db.close();
  }
  return { backup, updated };
}

function homeDir() {
  return os.homedir();
}

function printPlan(plan) {
  const lines = [];
  lines.push(`数据库记录：${plan.update.length + plan.alreadyZh.length + plan.noSource.length} 条`);
  if (plan.missingDb) {
    lines.push(`未检测到 CC Switch 数据库：${plan.missingDb}`);
    return lines.join("\n");
  }
  if (plan.update.length) {
    lines.push(`\n待同步为中文（${plan.update.length} 条）：`);
    for (const item of plan.update) {
      lines.push(`  - ${item.name}`);
    }
  } else {
    lines.push("\n没有需要同步为中文的 skill 描述");
  }
  if (plan.alreadyZh.length) {
    lines.push(`\n已是中文（${plan.alreadyZh.length} 条）：${plan.alreadyZh.map((r) => r.name).join(", ")}`);
  }
  if (plan.noSource.length) {
    lines.push(`\n无中文源可同步（${plan.noSource.length} 条，SKILL.md 缺失或 description 仍为英文）：${plan.noSource.map((r) => r.name).join(", ")}`);
  }
  return lines.join("\n");
}

function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const dbPath = path.join(homeDir(), ".cc-switch", "cc-switch.db");
  const skillsRoot = path.join(homeDir(), ".cc-switch", "skills");

  console.log("CC Switch skill 描述汉化同步\n");
  console.log(`数据库：${dbPath}`);
  console.log(`skill 目录：${skillsRoot}\n`);

  if (!apply) {
    const plan = buildSyncPlan(dbPath, skillsRoot);
    console.log(printPlan(plan));
    console.log("\n（以上为只读预览，未写入任何内容）");
    if (plan.update.length) {
      console.log("\n确认无误后写入（会先备份数据库）：");
      console.log(`  node "${__filename}" --apply`);
    }
    return;
  }

  const plan = buildSyncPlan(dbPath, skillsRoot);
  if (plan.missingDb) {
    console.log(`未检测到 CC Switch 数据库：${plan.missingDb}`);
    process.exit(1);
  }
  if (!plan.update.length) {
    console.log("没有需要同步的 skill 描述，未执行任何写入。");
    return;
  }
  const { backup, updated } = applyPlan(dbPath, plan);
  console.log(`已备份数据库 → ${backup}`);
  console.log(`已更新 ${updated} 条 skill 描述为中文：${plan.update.map((r) => r.name).join(", ")}`);
  console.log("\n如需还原，请先完全退出 CC Switch 和 Claude Code，再执行：");
  const quote = (p) => `"${p}"`;
  if (process.platform === "win32") {
    console.log(`  copy /Y ${quote(backup)} ${quote(dbPath)}`);
  } else {
    console.log(`  cp ${quote(backup)} ${quote(dbPath)}`);
  }
  console.log("\n在 Claude Code 中运行 /reload-plugins；仍未刷新时完全重启。");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`\n执行失败：${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  hasCJK,
  isMostlyZh,
  parseFrontmatterDescription,
  skillMdPath,
  buildSyncPlan,
  applyPlan,
  printPlan,
  homeDir,
};
