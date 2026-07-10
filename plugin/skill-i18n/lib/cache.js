// lib/cache.js — 全局译文缓存（零依赖）
// key = sha256(英文.trim().toLowerCase())，value = { en, zh, provider, ts }
// 插件 update 覆盖源文件后，标记丢失但原文相同 → 缓存命中 → 直接重应用，不重调 LLM。

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function hashKey(en) {
  return crypto.createHash("sha256").update(String(en).trim().toLowerCase()).digest("hex");
}

function load(cacheFile) {
  try {
    if (cacheFile && fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      if (data && data.entries) return data;
    }
  } catch {
    // 损坏的缓存文件：当作空缓存，不阻断流程
  }
  return { version: 1, entries: {} };
}

const MAX_ENTRIES = 5000;

function save(cacheFile, data) {
  if (!cacheFile) return;
  try {
    // 软上限：条目过多时按 ts 升序淘汰最旧，避免缓存无限膨胀拖慢启动
    if (data && data.entries) {
      const keys = Object.keys(data.entries);
      if (keys.length > MAX_ENTRIES) {
        keys.sort((a, b) => (data.entries[a].ts || 0) - (data.entries[b].ts || 0));
        const toRemove = keys.length - Math.floor(MAX_ENTRIES * 0.9);
        for (let i = 0; i < toRemove; i++) delete data.entries[keys[i]];
      }
    }
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    const tmp = cacheFile + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    try {
      fs.renameSync(tmp, cacheFile);
    } catch {
      try { fs.unlinkSync(cacheFile); } catch {}
      fs.renameSync(tmp, cacheFile);
    }
  } catch {
    // 缓存写失败不阻断主流程
  }
}

function lookup(data, en) {
  const e = data.entries[hashKey(en)];
  return e && e.zh ? e.zh : null;
}

function put(data, en, zh, provider) {
  data.entries[hashKey(en)] = { en, zh, provider: provider || "unknown", ts: Date.now() };
}

module.exports = { hashKey, load, save, lookup, put, MAX_ENTRIES };
