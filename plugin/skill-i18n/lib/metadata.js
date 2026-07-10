// lib/metadata.js — 插件元数据 JSON（plugin.json / marketplace.json）的 description 提取/写回
// 与 frontmatter.js 对称：md 走 frontmatter，JSON 走这里。
// 备份用 _description_en，标记用 _zh_cn_translated（下划线前缀，避免与官方字段冲突）。
// marketplace.json 的多个 description（顶层 + plugins[] 每项）分别处理。

"use strict";

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// 提取所有应翻译的 description 位置：plugin.json 顶层 + marketplace.json 的 plugins[]
function extractDescriptions(obj) {
  const out = [];
  if (obj && typeof obj.description === "string") {
    out.push({ jsonPath: "$.description", en: obj.description });
  }
  if (obj && obj.metadata && typeof obj.metadata.description === "string") {
    out.push({ jsonPath: "$.metadata.description", en: obj.metadata.description });
  }
  if (obj && Array.isArray(obj.plugins)) {
    obj.plugins.forEach((p, i) => {
      if (p && typeof p.description === "string") {
        out.push({ jsonPath: `$.plugins[${i}].description`, en: p.description });
      }
    });
  }
  return out;
}

// 取 jsonPath 对应的 owner 对象（持有 description 字段的对象）
function getOwner(obj, jsonPath) {
  if (!obj) return null;
  if (jsonPath === "$.description") return obj;
  if (jsonPath === "$.metadata.description") return obj.metadata || null;
  const m = /^\$\.plugins\[(\d+)\]\.description$/.exec(jsonPath);
  if (m && Array.isArray(obj.plugins)) return obj.plugins[+m[1]] || null;
  return null;
}

function isPathTranslated(obj, jsonPath) {
  const owner = getOwner(obj, jsonPath);
  return !!(owner && owner._zh_cn_translated);
}

// 应用译文（原地修改 owner）
function applyTranslation(obj, jsonPath, zh, en) {
  const owner = getOwner(obj, jsonPath);
  if (!owner) return;
  owner.description = zh;
  owner._description_en = en;
  owner._zh_cn_translated = true;
}

// 还原单个 owner：description = _description_en，删备份与标记
function restoreOwner(owner) {
  if (owner && owner._zh_cn_translated && typeof owner._description_en === "string") {
    owner.description = owner._description_en;
    delete owner._description_en;
    delete owner._zh_cn_translated;
  }
}

// 还原整个 JSON 对象的所有已译 description
function restoreAll(obj) {
  if (!obj) return;
  restoreOwner(obj);
  if (obj.metadata) restoreOwner(obj.metadata);
  if (Array.isArray(obj.plugins)) obj.plugins.forEach(restoreOwner);
}

function serialize(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

module.exports = {
  tryParse,
  extractDescriptions,
  isPathTranslated,
  applyTranslation,
  restoreAll,
  serialize,
};
