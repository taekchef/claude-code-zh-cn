#!/usr/bin/env node
/**
 * i18n.js — 多语言国际化核心模块
 *
 * 负责：
 *   1. 语言包发现与加载（locales/index.json → locale code → 数据文件）
 *   2. 当前语言解析（settings.json → env → 默认）
 *   3. 翻译数据查询（CLI 文字、Spinner 动词、提示）
 *   4. 插件 UI 字符串（操作提示、错误信息等）
 *
 * 语言包目录结构：
 *   locales/
 *     index.json           ← 可用语言列表
 *     zh-CN/
 *       manifest.json      ← 语言元数据（版本、作者、兼容性）
 *       translations.json  ← CLI 硬编码文字翻译对照表 [{en, zh}]
 *       verbs.json          ← Spinner 动词列表
 *       tips.json           ← Spinner 提示列表
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ============================================================================
// 路径解析
// ============================================================================

/** 获取语言包根目录（优先用插件目录下的 locales/） */
function localesRoot(pluginRoot) {
  const candidates = [
    pluginRoot ? path.join(pluginRoot, "locales") : "",
    path.join(__dirname, "..", "..", "locales"),
    path.join(__dirname, "..", "locales"),
    path.join(process.cwd(), "locales"),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "index.json"))) return dir;
  }

  // fallback: 通过 CLAUDE_PLUGIN_ROOT 环境变量
  const envRoot = process.env.CLAUDE_PLUGIN_ROOT
    ? path.join(process.env.CLAUDE_PLUGIN_ROOT, "locales")
    : "";
  if (envRoot && fs.existsSync(path.join(envRoot, "index.json"))) return envRoot;

  return null;
}

// ============================================================================
// 引用（import / require in .js）可以直接 require 本文件。
// Shell hook 中通过 node -e 调用以下函数。
// ============================================================================

/** 读取 JSON 文件，返回解析后的对象或 null */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
  } catch {
    return null;
  }
}

// ============================================================================
// 语言包索引
// ============================================================================

/** 加载 locales/index.json */
function loadLocalesIndex(root) {
  const localesDir = root || localesRoot();
  if (!localesDir) return null;
  return readJson(path.join(localesDir, "index.json"));
}

/** 解析语言别名（zh → zh-CN, zh_Hans → zh-CN） */
function resolveLocaleCode(code, index) {
  if (!code || !index) return null;
  const normalized = String(code).trim();

  // 精确匹配 available 列表
  if (index.available) {
    for (const entry of index.available) {
      if (entry.code === normalized) return entry.code;
    }
  }

  // 别名匹配
  if (index.aliases && index.aliases[normalized]) {
    return index.aliases[normalized];
  }

  // 大小写不敏感匹配
  if (index.available) {
    const lower = normalized.toLowerCase();
    for (const entry of index.available) {
      if (entry.code.toLowerCase() === lower) return entry.code;
    }
  }

  return index.default || null;
}

// ============================================================================
// 当前语言检测
// ============================================================================

/**
 * 从 settings.json 获取用户语言设置
 * settings.language 或 settings.locale
 */
function readLanguageFromSettings(settingsPath) {
  if (!settingsPath) {
    settingsPath = process.env.ZH_CN_SETTINGS || path.join(
      process.env.HOME || process.env.USERPROFILE || "/tmp",
      ".claude", "settings.json"
    );
  }

  const settings = readJson(settingsPath);
  if (!settings) return null;

  // i18n.locale 优先（i18n 专用字段），其次 language（Claude Code 原有字段）
  return settings.i18n?.locale || settings.locale || settings.language || null;
}

/**
 * 检测当前应使用的语言代码
 * 优先级：1) env FORCE_LOCALE  2) env ZH_CN_LANG  3) settings.json  4) 默认
 */
function detectLocale(settingsPath, localesDir) {
  // 1. 环境变量强制指定
  if (process.env.FORCE_LOCALE) return process.env.FORCE_LOCALE;
  if (process.env.ZH_CN_LANG) return process.env.ZH_CN_LANG;

  // 2. settings.json → 映射为 locale code
  const fromSettings = readLanguageFromSettings(settingsPath);
  if (fromSettings) {
    const mapped = LANGUAGE_VALUE_MAP[String(fromSettings).toLowerCase()];
    if (mapped) return mapped;
    // 非映射值也可能是标准 locale code
    const index = loadLocalesIndex(localesDir);
    const resolved = resolveLocaleCode(fromSettings, index);
    if (resolved) return resolved;
  }

  // 3. 默认
  const index = loadLocalesIndex(localesDir);
  return index?.default || null;
}

// ============================================================================
// 语言包数据加载
// ============================================================================

/** 加载指定语言包的完整数据 */
function loadLocale(localeCode, localesDir) {
  const root = localesDir || localesRoot();
  if (!root || !localeCode) return null;

  // 解析 locale code
  const index = readJson(path.join(root, "index.json"));
  const resolved = resolveLocaleCode(localeCode, index);
  if (!resolved) return null;

  const localePath = path.join(root, resolved);
  const manifest = readJson(path.join(localePath, "manifest.json"));
  if (!manifest) return null;

  const files = manifest.files || {};
  const data = { manifest, code: resolved, path: localePath };

  // 按 manifest 中声明的文件列表加载
  if (files.translations) {
    data.translations = readJson(path.join(localePath, files.translations)) || [];
  }
  if (files.verbs) {
    const rawVerbs = readJson(path.join(localePath, files.verbs));
    if (Array.isArray(rawVerbs)) {
      data.verbs = rawVerbs;
    } else if (rawVerbs && Array.isArray(rawVerbs.verbs)) {
      // 格式: { mode: "replace", verbs: [...] }
      data.verbs = rawVerbs.verbs;
      data.verbsMode = rawVerbs.mode;
    } else {
      data.verbs = [];
    }
  }
  if (files.tips) {
    const rawTips = readJson(path.join(localePath, files.tips));
    if (Array.isArray(rawTips)) {
      data.tips = rawTips;
    } else if (rawTips && Array.isArray(rawTips.tips)) {
      // 格式: { tips: [{ text: "..." }] } 或 { tips: ["..."] }
      data.tips = rawTips.tips.map((t) => (typeof t === "string" ? t : t.text || t));
    } else {
      data.tips = [];
    }
  }

  // 可选文件：sessionContext、notifications 等
  if (files.sessionContext) {
    data.sessionContext = readJson(path.join(localePath, files.sessionContext)) || null;
  }
  if (files.notifications) {
    data.notifications = readJson(path.join(localePath, files.notifications)) || null;
  }

  // 兼容字段
  if (!data.verbs && manifest.verbs) {
    data.verbs = manifest.verbs;
  }

  return data;
}

/** Claude Code settings.language 值 → locale code 映射 */
const LANGUAGE_VALUE_MAP = {
  "chinese": "zh-CN",
  "zh-cn": "zh-CN",
  "zh-CN": "zh-CN",
  "cn": "zh-CN",
};

/** 加载当前激活的语言包 */
function loadActiveLocale(settingsPath, localesDir) {
  const code = detectLocale(settingsPath, localesDir);
  return code ? loadLocale(code, localesDir) : null;
}

// ============================================================================
// 翻译查询
// ============================================================================

/**
 * 构建英文→中文查找 Map
 * @param {Array} translations  [{en: "string", zh: "中文"}]
 * @returns {Map<string, string>}
 */
function buildTranslationMap(translations) {
  const map = new Map();
  if (!Array.isArray(translations)) return map;

  for (const entry of translations) {
    if (entry && entry.en != null && entry.zh != null) {
      map.set(entry.en, entry.zh);
    }
  }
  return map;
}

/**
 * 获取单条翻译
 * @param {string} english  英文原文
 * @param {Map|Array} translations  Map 或 Array
 * @returns {string|null}
 */
function translate(english, translations) {
  if (!english || !translations) return null;

  if (translations instanceof Map) {
    return translations.get(english) || null;
  }

  if (Array.isArray(translations)) {
    const entry = translations.find((t) => t.en === english);
    return entry ? entry.zh : null;
  }

  return null;
}

// ============================================================================
// CLI 入口（被 shell hook 或命令行调用）
// ============================================================================

function cli() {
  const command = process.argv[2];

  switch (command) {
    case "detect": {
      // 检测当前语言
      const code = detectLocale();
      process.stdout.write(code || "");
      break;
    }
    case "load": {
      // 加载指定语言包，输出 JSON
      const code = process.argv[3] || detectLocale();
      const data = loadLocale(code);
      if (data) {
        process.stdout.write(JSON.stringify(data));
      } else {
        process.exit(1);
      }
      break;
    }
    case "resolve": {
      // 解析语言代码
      const code = process.argv[3];
      const index = loadLocalesIndex();
      const resolved = resolveLocaleCode(code, index);
      process.stdout.write(resolved || "");
      break;
    }
    case "translate": {
      // 单条翻译查询
      const en = process.argv[3];
      const code = process.argv[4] || detectLocale();
      const locale = loadLocale(code);
      if (locale && locale.translations) {
        const result = translate(en, locale.translations);
        process.stdout.write(result || en || "");
      }
      break;
    }
    case "available": {
      // 列出可用语言
      const index = loadLocalesIndex();
      if (index?.available) {
        process.stdout.write(
          index.available.map((l) => `${l.code}:${l.name}`).join("\n")
        );
      }
      break;
    }
    case "session-context": {
      // 构建会话上下文提示文本（供 session-start hook 使用）
      const locale = loadActiveLocale();
      if (locale?.sessionContext) {
        const ctx = locale.sessionContext;
        const parts = [];
        if (ctx.languagePrompt) parts.push(ctx.languagePrompt);
        if (ctx.configProtection) parts.push(ctx.configProtection);
        if (ctx.errorTranslations) {
          const errors = Object.entries(ctx.errorTranslations)
            .map(([en, zh]) => `- ${en} → ${zh}`)
            .join("\n");
          parts.push("## 常见错误信息翻译参考\n" + errors);
        }
        // 追加 /lang 命令说明
        const index = loadLocalesIndex();
        if (index?.available) {
          const langs = index.available.map(l => `  - \`/lang ${l.code}\` → ${l.name}`).join("\n");
          parts.push("## 语言切换\n\n输入 `/lang <代码>` 可切换界面语言。当前可用语言：\n" + langs);
        }
        process.stdout.write(parts.join("\n\n"));
      } else {
        process.exit(1);
      }
      break;
    }
    case "list": {
      // 列出可用语言（供 /lang 命令使用）
      const index = loadLocalesIndex();
      if (index?.available) {
        const current = detectLocale() || "";
        for (const l of index.available) {
          const marker = l.code === current ? " ← 当前" : "";
          process.stdout.write(`${l.code}:${l.name}${marker}\n`);
        }
      }
      break;
    }
    case "set-locale": {
      // 切换语言并写入 settings.json（供 /lang 命令使用）
      const targetCode = process.argv[3];
      if (!targetCode) {
        process.stderr.write("用法：i18n.js set-locale <code>\n");
        process.exit(1);
      }
      const index = loadLocalesIndex();
      const resolved = resolveLocaleCode(targetCode, index);
      if (!resolved) {
        process.stderr.write(`未知语言代码：${targetCode}\n`);
        process.exit(1);
      }
      const settingsPath = process.env.ZH_CN_SETTINGS || path.join(
        process.env.HOME || process.env.USERPROFILE || "/tmp",
        ".claude", "settings.json"
      );
      let settings = {};
      try { settings = JSON.parse(fs.readFileSync(settingsPath, "utf8")); } catch {}
      settings.i18n = settings.i18n || {};
      settings.i18n.locale = resolved;
      // 兼容旧字段
      if (resolved === "zh-CN") settings.language = "Chinese";
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
      process.stdout.write(`ok: ${resolved}`);
      break;
    }
    default:
      process.stderr.write(
        "Usage: i18n.js <command> [args...]\n" +
        "Commands: detect, load, resolve, translate, available, session-context, list, set-locale\n"
      );
      process.exit(1);
  }
}

// ============================================================================
// 导出
// ============================================================================

module.exports = {
  localesRoot,
  loadLocalesIndex,
  resolveLocaleCode,
  detectLocale,
  loadLocale,
  loadActiveLocale,
  readLanguageFromSettings,
  buildTranslationMap,
  translate,
};

// CLI 入口
if (require.main === module) {
  cli();
}
