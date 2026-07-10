// lib/frontmatter.js — Skill/Command frontmatter 解析与写回（零依赖）
//
// 核心策略：行级 patch，绝不重新序列化整个 frontmatter。
// 写回时只改 description 行 + 在关闭 --- 前追加 description_en / x-zh-cn-translated，
// 其余 frontmatter 字段不变；正文内容不变（CRLF 行尾的文件写回时归一化为 LF）。
//
// 被 scan.js / apply.js / restore.js 共享。

"use strict";

// 行首空白长度
function leadingSpaces(line) {
  const m = /^(\s*)/.exec(line);
  return m ? m[1].length : 0;
}

// 双引号 YAML 字符串反转义
function unescapeDoubleQuoted(s) {
  return s.replace(/\\(.)/g, (_, ch) => {
    if (ch === "n") return "\n";
    if (ch === "t") return "\t";
    if (ch === "r") return "\r";
    if (ch === '"') return '"';
    if (ch === "\\") return "\\";
    return ch;
  });
}

// 转义为双引号 YAML 字符串内容
function escapeDoubleQuoted(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

// YAML > 折叠标量简化版：换行折叠为空格，空行保留为换行
function foldLines(ls) {
  let out = "";
  for (let k = 0; k < ls.length; k++) {
    const cur = ls[k];
    if (k === 0) {
      out = cur;
    } else if (cur === "" || out === "" || out.endsWith("\n")) {
      out += "\n" + cur;
    } else {
      out += " " + cur;
    }
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

// 解析整个文件的 frontmatter。
// 返回 { hasFm, lines, closeIdx, desc }
//   desc = { keyLineIdx, keyIndent, value, style, keyValueOnSameLine,
//            valueStartLineIdx?, valueEndLineIdx? } | null
function parseFrontmatter(text) {
  let src = text;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1); // 剥 BOM
  // 归一化行尾（CRLF / 单独 CR → LF）：否则 `.`+`$` 正则在 CRLF 下失配，CRLF skill 会整条静默失效
  src = src.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const lines = src.split("\n");
  if (lines.length === 0 || lines[0].trim() !== "---") {
    return { hasFm: false, lines, closeIdx: -1, desc: null };
  }

  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) {
    return { hasFm: false, lines, closeIdx: -1, desc: null };
  }

  let desc = null;
  for (let i = 1; i < closeIdx; i++) {
    const m = /^(\s*)description\s*:\s*(.*)$/.exec(lines[i]);
    if (m) {
      desc = parseDescriptionValue(lines, i, m[1], m[2]);
      break;
    }
  }

  return { hasFm: true, lines, closeIdx, desc };
}

// 解析 description 的值（rest = description: 后的同行内容）
function parseDescriptionValue(lines, keyLineIdx, keyIndent, rest) {
  const trimmed = rest.trim();

  // block scalar 指示符：description: >  或  description: |
  const indicator = /^([>|])([-+]?)\s*$/.exec(trimmed);
  if (trimmed === "" || indicator) {
    return scanBlock(lines, keyLineIdx, keyIndent, indicator ? indicator[1] : null);
  }

  // 双引号
  if (trimmed[0] === '"') {
    const m = /^"((?:\\.|[^"\\])*)"/.exec(trimmed);
    const inner = m ? m[1] : trimmed.slice(1);
    return { keyLineIdx, keyIndent, value: unescapeDoubleQuoted(inner), style: "double", keyValueOnSameLine: true };
  }
  // 单引号
  if (trimmed[0] === "'") {
    const m = /^'((?:[^']|'')*)'/.exec(trimmed);
    const inner = m ? m[1] : trimmed.slice(1);
    return { keyLineIdx, keyIndent, value: inner.replace(/''/g, "'"), style: "single", keyValueOnSameLine: true };
  }
  // plain（单行）
  return { keyLineIdx, keyIndent, value: trimmed, style: "plain", keyValueOnSameLine: true };
}

// 扫描 block scalar 内容（从 keyLineIdx+1 起，缩进 > keyIndent 的连续行）
function scanBlock(lines, keyLineIdx, keyIndent, indicator) {
  const baseIndent = keyIndent.length;
  const blockLines = [];
  let contentIndent = -1;
  let j = keyLineIdx + 1;
  while (j < lines.length) {
    const ln = lines[j];
    if (ln.trim() === "---") break; // 关闭分隔符
    if (ln.trim() === "") {
      blockLines.push("");
      j++;
      continue;
    }
    const ind = leadingSpaces(ln);
    if (ind <= baseIndent) break; // 缩进回退，块结束
    if (contentIndent === -1) contentIndent = ind;
    blockLines.push(ln);
    j++;
  }

  if (blockLines.length === 0) {
    return { keyLineIdx, keyIndent, value: "", style: "empty", keyValueOnSameLine: false, valueEndLineIdx: keyLineIdx };
  }

  const dedented = blockLines.map((l) => (l.trim() === "" ? "" : l.slice(contentIndent)));
  let value;
  if (indicator === "|") {
    value = dedented.join("\n").replace(/\n+$/, "");
  } else {
    value = foldLines(dedented);
  }
  const valueEndLineIdx = keyLineIdx + blockLines.length;
  return {
    keyLineIdx,
    keyIndent,
    value,
    style: indicator === "|" ? "literal" : "folded",
    keyValueOnSameLine: false,
    valueEndLineIdx,
  };
}

// 便利：取 description 值
function getDescription(text) {
  const p = parseFrontmatter(text);
  if (!p.hasFm || !p.desc) return null;
  return p.desc.value;
}

// 是否已含翻译标记 x-zh-cn-translated: true
// 接受原始文本，或已解析的 frontmatter 结果（避免 scan 热路径重复 parse）
function hasTranslatedMarker(textOrParsed) {
  const p = typeof textOrParsed === "string" ? parseFrontmatter(textOrParsed) : textOrParsed;
  if (!p || !p.hasFm) return false;
  for (let i = 1; i < p.closeIdx; i++) {
    if (/^\s*x-zh-cn-translated\s*:\s*true\b/.test(p.lines[i])) return true;
  }
  return false;
}

// 取备份的英文原文 description_en
function getOriginalEn(text) {
  const p = parseFrontmatter(text);
  if (!p.hasFm) return null;
  for (let i = 1; i < p.closeIdx; i++) {
    const m = /^\s*description_en\s*:\s*(.*)$/.exec(p.lines[i]);
    if (m) {
      const v = m[1].trim();
      if (v[0] === '"') {
        const mm = /^"((?:\\.|[^"\\])*)"/.exec(v);
        return mm ? unescapeDoubleQuoted(mm[1]) : v;
      }
      if (v[0] === "'") return v.replace(/^'|'$/g, "").replace(/''/g, "'");
      return v;
    }
  }
  return null;
}

// 写回：description 改中文（单行双引号）+ 追加/更新 description_en 与 x-zh-cn-translated。
// 其余 frontmatter 字段与正文保持不变。
function rewriteDescription(text, { zh, en }) {
  const p = parseFrontmatter(text);
  if (!p.hasFm) throw new Error("frontmatter: no frontmatter block");
  if (!p.desc) throw new Error("frontmatter: no description field");

  const lines = p.lines.slice();
  const desc = p.desc;
  lines[desc.keyLineIdx] = `${desc.keyIndent}description: "${escapeDoubleQuoted(zh)}"`;

  // block scalar：删除值占用的后续行
  if (!desc.keyValueOnSameLine && desc.valueEndLineIdx > desc.keyLineIdx) {
    lines.splice(desc.keyLineIdx + 1, desc.valueEndLineIdx - desc.keyLineIdx);
  }

  // 删除行后重找关闭 ---
  let closeIdx = -1;
  for (let i = desc.keyLineIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) closeIdx = lines.length;

  // 在关闭前更新/插入 description_en 与 marker（已存在则更新，不重复添加）
  let enIdx = -1;
  let markerIdx = -1;
  for (let i = 1; i < closeIdx; i++) {
    if (/^\s*description_en\s*:/.test(lines[i])) enIdx = i;
    if (/^\s*x-zh-cn-translated\s*:/.test(lines[i])) markerIdx = i;
  }
  const enLine = `${desc.keyIndent}description_en: "${escapeDoubleQuoted(en)}"`;
  const markerLine = `${desc.keyIndent}x-zh-cn-translated: true`;
  if (enIdx >= 0) {
    lines[enIdx] = enLine;
  } else {
    lines.splice(closeIdx, 0, enLine);
    closeIdx++;
  }
  if (markerIdx >= 0) {
    lines[markerIdx] = markerLine;
  } else {
    lines.splice(closeIdx, 0, markerLine);
  }

  return lines.join("\n");
}

// 还原：description 恢复为 description_en，删除 description_en 与 marker。
// 无标记或无备份时原样返回。
function restoreDescription(text) {
  const p = parseFrontmatter(text);
  if (!p.hasFm || !hasTranslatedMarker(text)) return text;
  const en = getOriginalEn(text);
  if (en === null) return text;

  const lines = p.lines.slice();
  const desc = p.desc;
  if (desc) {
    lines[desc.keyLineIdx] = `${desc.keyIndent}description: "${escapeDoubleQuoted(en)}"`;
    if (!desc.keyValueOnSameLine && desc.valueEndLineIdx > desc.keyLineIdx) {
      lines.splice(desc.keyLineIdx + 1, desc.valueEndLineIdx - desc.keyLineIdx);
    }
  }

  // 重找关闭行，从后往前删除 description_en / marker 行
  let closeIdx = -1;
  for (let i = (desc ? desc.keyLineIdx : 1) + 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closeIdx = i;
      break;
    }
  }
  if (closeIdx === -1) closeIdx = lines.length;
  for (let i = closeIdx - 1; i >= 1; i--) {
    if (/^\s*description_en\s*:/.test(lines[i]) || /^\s*x-zh-cn-translated\s*:/.test(lines[i])) {
      lines.splice(i, 1);
    }
  }

  return lines.join("\n");
}

// 写前自检：rewritten 重解析后，正文（关闭 --- 之后）与原文逐字节相等，
// 且 description_en == 原 description 原文。true 表示安全可写、不破坏 skill 正文。
function verifyRewriteSafe(original, rewritten) {
  try {
    const po = parseFrontmatter(original);
    const pr = parseFrontmatter(rewritten);
    if (!po.hasFm || !pr.hasFm) return false;
    const bodyOrig = po.lines.slice(po.closeIdx + 1).join("\n");
    const bodyNew = pr.lines.slice(pr.closeIdx + 1).join("\n");
    if (bodyOrig !== bodyNew) return false;
    if (getOriginalEn(rewritten) !== (po.desc ? po.desc.value : null)) return false;
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  parseFrontmatter,
  getDescription,
  hasTranslatedMarker,
  getOriginalEn,
  rewriteDescription,
  restoreDescription,
  verifyRewriteSafe,
  // 暴露给测试
  _foldLines: foldLines,
  _escapeDoubleQuoted: escapeDoubleQuoted,
};
