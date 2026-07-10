#!/usr/bin/env node
// translate.js — 读队列 + 缓存，调翻译 provider，写缓存，输出应用清单。
//
// provider 按 API 协议格式分类（非厂商）：
//   claude     —— 调 claude CLI（默认，零配置）
//   openai     —— OpenAI chat/completions 兼容协议（OpenAI、DeepSeek、Moonshot 等）
//   anthropic  —— Anthropic messages 兼容协议（Anthropic 官方及任何 Anthropic 兼容端点）
// 提供 Anthropic 兼容端点的服务，用 --provider anthropic + 对应 base-url + key。

"use strict";

const fs = require("fs");
const https = require("https");
const http = require("http");
const { URL } = require("url");
const { spawn } = require("child_process");
const cache = require("./lib/cache");

// 翻译子进程 spawn claude 时的 env guard：用专用 HOOK 变量（非 ENABLE——ENABLE=0 会被
// claude 子进程加载的 settings.json env ENABLE=1 覆盖导致递归）。hook 入口见 HOOK=1 即跳过。
// review #3。
const SPAWN_GUARD_ENV = { ZH_CN_SKILL_I18N_HOOK: "1" };

const SYS_PROMPT = `You are a professional translator. Translate English skill/command descriptions for a developer tool's slash-command menu into Simplified Chinese.

Rules:
1. Output ONLY a JSON object mapping each input ID to its Chinese translation. No prose, no markdown code fences.
2. Keep these UNTRANSLATED exactly as-is: \${...}, $ARGUMENTS, $1, slash command names like /foo, and these terms: API, PR, git, npm, React, TypeScript. Also keep file paths and URLs unchanged.
3. Be concise (this is for a menu display). Preserve the original meaning and sentence structure.
4. If an input is already Chinese or a pure placeholder, return it unchanged.`;

function parseArgs(argv) {
  const a = { queue: "", cache: "", output: "", provider: "auto", baseUrl: "", model: "" };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--queue") a.queue = argv[++i];
    else if (k === "--cache") a.cache = argv[++i];
    else if (k === "--output") a.output = argv[++i];
    else if (k === "--provider") a.provider = argv[++i];
    else if (k === "--base-url") a.baseUrl = argv[++i];
    else if (k === "--model") a.model = argv[++i];
  }
  return a;
}

function stripFence(s) {
  return s.replace(/^\s*```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}

// 宽松解析 LLM 输出为 JSON 对象：先 stripFence；失败则提取首个 { 到末个 } 的子串再 parse
function parseJsonObjectLoose(raw) {
  const s = stripFence(raw);
  try { return JSON.parse(s); } catch {}
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  return null;
}

function buildInputs(entries) {
  const inputs = {};
  for (const e of entries) inputs[e.id] = e.en;
  return inputs;
}

// 占位符校验：en 与 zh 的 ${...} 出现次数与内容必须一致，否则译文可能丢失占位符
function placeholders(s) {
  // 捕获 ${...}、裸 $IDENTIFIER（如 $ARGUMENTS）、$N（如 $1）
  const re = /\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*|\$[0-9]+/g;
  const m = String(s).match(re);
  return m ? m.slice().sort() : [];
}
function placeholdersMatch(en, zh) {
  const a = placeholders(en);
  const b = placeholders(zh);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// 通用 JSON HTTP 请求（零依赖，node 内置 https/http）
function httpJsonRequest(urlStr, { headers, body, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search,
      method: "POST",
      headers: { "Content-Type": "application/json", ...(headers || {}) },
    }, (res) => {
      let data = "";
      res.on("data", (d) => { data += d; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("请求超时")));
    if (body) req.write(body);
    req.end();
  });
}

// claude CLI provider（默认，零配置）
function translateClaude(entries) {
  return new Promise((resolve, reject) => {
    const prompt = `${SYS_PROMPT}\n\nInputs:\n${JSON.stringify(buildInputs(entries), null, 2)}`;
    const child = spawn("claude", ["--bare", "-p", prompt, "--output-format", "text"], {
      stdio: ["ignore", "pipe", "pipe"],
      // 防递归：翻译子进程不再触发同一个 SessionStart hook（review #3）
      env: { ...process.env, ...SPAWN_GUARD_ENV },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`claude exit ${code}`));
      const parsed = parseJsonObjectLoose(out);
      if (parsed === null) return reject(new Error("claude 输出无法解析为 JSON"));
      resolve(parsed);
    });
  });
}

// OpenAI chat/completions 兼容协议
async function translateOpenAI(entries, args, apiKey) {
  if (!apiKey) throw new Error("openai provider 需要 ZH_CN_SKILL_I18N_API_KEY");
  if (!args.model) throw new Error("openai provider 需要 --model / ZH_CN_SKILL_I18N_MODEL");
  const baseURL = (args.baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const body = JSON.stringify({
    model: args.model,
    messages: [
      { role: "system", content: SYS_PROMPT },
      { role: "user", content: "Inputs:\n" + JSON.stringify(buildInputs(entries), null, 2) },
    ],
    temperature: 0.3,
  });
  const resp = await httpJsonRequest(`${baseURL}/chat/completions`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });
  const content = JSON.parse(resp).choices[0].message.content;
  const parsed = parseJsonObjectLoose(content);
  if (parsed === null) throw new Error("openai 返回无法解析为 JSON");
  return parsed;
}

// Anthropic messages 兼容协议（任何 Anthropic 兼容端点用此 + 对应 base-url）
async function translateAnthropic(entries, args, apiKey) {
  if (!apiKey) throw new Error("anthropic provider 需要 ZH_CN_SKILL_I18N_API_KEY");
  if (!args.model) throw new Error("anthropic provider 需要 --model / ZH_CN_SKILL_I18N_MODEL");
  const baseURL = (args.baseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
  const body = JSON.stringify({
    model: args.model,
    max_tokens: 4096,
    system: SYS_PROMPT,
    messages: [
      { role: "user", content: "Inputs:\n" + JSON.stringify(buildInputs(entries), null, 2) },
    ],
  });
  const resp = await httpJsonRequest(`${baseURL}/v1/messages`, {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body,
  });
  const data = JSON.parse(resp);
  const content = (data.content && data.content[0] && data.content[0].text) || "";
  const parsed = parseJsonObjectLoose(content);
  if (parsed === null) throw new Error("anthropic 返回无法解析为 JSON");
  return parsed;
}

function resolveProvider(args) {
  const p = (args.provider || "auto").toLowerCase();
  if (p === "openai") return "openai";
  if (p === "anthropic") return "anthropic";
  if (p === "claude") return "claude";
  return "claude"; // auto 默认 claude CLI（零配置）
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.queue || !args.output) {
    console.error("translate: 缺少 --queue / --output");
    process.exit(0);
  }
  if (!fs.existsSync(args.queue)) {
    fs.writeFileSync(args.output, "[]");
    return;
  }

  const queue = JSON.parse(fs.readFileSync(args.queue, "utf8"));
  const cacheData = args.cache ? cache.load(args.cache) : { entries: {} };
  const provider = resolveProvider(args);
  const apiKey = process.env.ZH_CN_SKILL_I18N_API_KEY || "";

  const applyList = [];
  for (const c of queue.cached || []) {
    applyList.push({ path: c.path, kind: c.kind, jsonPath: c.jsonPath, en: c.en, zh: c.zh });
  }

  const toDo = queue.toTranslate || [];
  const translations = {};
  const BATCH = 30;
  for (let i = 0; i < toDo.length; i += BATCH) {
    const batch = toDo.slice(i, i + BATCH);
    try {
      let map;
      if (provider === "openai") map = await translateOpenAI(batch, args, apiKey);
      else if (provider === "anthropic") map = await translateAnthropic(batch, args, apiKey);
      else map = await translateClaude(batch);
      Object.assign(translations, map);
    } catch (e) {
      console.error(`[translate] 批次失败 (${provider}): ${e.message}，降级小批次重试`);
      // 降级：分成更小批次重试（避免逐条 spawn 的 N 次开销撞 hook 25s 超时）
      const SUB = 5;
      for (let j = 0; j < batch.length; j += SUB) {
        const sub = batch.slice(j, j + SUB);
        try {
          let m;
          if (provider === "openai") m = await translateOpenAI(sub, args, apiKey);
          else if (provider === "anthropic") m = await translateAnthropic(sub, args, apiKey);
          else m = await translateClaude(sub);
          Object.assign(translations, m);
        } catch (e2) {
          console.error(`[translate] 小批次重试仍失败，跳过 ${sub.length} 条`);
        }
      }
    }
  }

  for (const t of toDo) {
    const zh = translations[t.id];
    if (!zh || typeof zh !== "string") {
      console.error(`[translate] 未获得译文，跳过: ${t.en.slice(0, 50)}`);
      continue;
    }
    if (!placeholdersMatch(t.en, zh)) {
      console.error(`[translate] 占位符不一致，跳过: ${t.en.slice(0, 50)}`);
      continue;
    }
    // 译文长度异常检测：远超原文则可能被注入异常内容，拒绝该译文
    if (zh.length > t.en.length * 5 + 50) {
      console.error(`[translate] 译文异常过长，跳过: ${t.en.slice(0, 50)}`);
      continue;
    }
    if (args.cache) cache.put(cacheData, t.en, zh, provider);
    for (const it of t.items) applyList.push({ path: it.path, kind: it.kind, jsonPath: it.jsonPath, en: t.en, zh });
  }

  if (args.cache) cache.save(args.cache, cacheData);
  fs.writeFileSync(args.output, JSON.stringify(applyList, null, 2));
  console.error(`[translate] provider=${provider}，将应用 ${applyList.length} 个文件`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`[translate] fatal: ${e.message}`);
    process.exit(0); // 不阻断 hook
  });
}

module.exports = { translateClaude, translateOpenAI, translateAnthropic, resolveProvider, parseJsonObjectLoose, placeholdersMatch, SPAWN_GUARD_ENV };
