#!/usr/bin/env node
// patch-cli.js - cli.js 硬编码文字中文 patch（安全版）
// 只替换 JavaScript 字符串字面量内的文字，避免破坏代码标识符
// 被 patch-cli.sh 调用

const fs = require("fs");

const cliFile = process.argv[2];
const translationsFile = process.argv[3];

if (!cliFile || !fs.existsSync(cliFile)) {
    console.log("0");
    process.exit(0);
}

let s = fs.readFileSync(cliFile, "utf8");
let count = 0;

// === Helper：直接全量替换（仅用于特殊 patch，匹配特定代码模式）===

function tryReplace(from, to) {
    if (s.includes(from)) {
        s = s.split(from).join(to);
        count++;
        return true;
    }
    return false;
}

// === 特殊 patch（基于精确代码模式匹配，安全）===

// 1. 过去式动词
tryReplace(
    '["Baked","Brewed","Churned","Cogitated","Cooked","Crunched","Saut\u00e9ed","Worked"]',
    '["烘焙了","沏了","翻搅了","琢磨了","烹饪了","嚼了","翻炒了","忙活了"]'
);

// 2. /btw 提示
tryReplace(
    "Use /btw to ask a quick side question without interrupting Claude\u0027s current work",
    "使用 /btw 提一个问题，不会打断当前工作"
);

// 3. /clear 提示
tryReplace(
    "Use /clear to start fresh when switching topics and free up context",
    "使用 /clear 清空对话，切换话题并释放上下文"
);

// 4. Tip: → 💡
const tipMatch = s.match(/`Tip: \$\{[^}]+\}`/);
if (tipMatch) {
    const replaced = tipMatch[0].replace("Tip: ", "\u{1F4A1} ");
    s = s.split(tipMatch[0]).join(replaced);
    count++;
}

// 5. Compacting
tryReplace("Compacting conversation\u2026", "压缩对话中…");
tryReplace("Compacting conversation", "压缩对话中");

// 6. Hook messages
tryReplace("Running PreCompact hooks\u2026", "运行预压缩 Hook…");
tryReplace("Running PostCompact hooks\u2026", "运行压缩后 Hook…");
tryReplace("Running SessionStart hooks\u2026", "运行会话启动 Hook…");
tryReplace("running stop hooks\u2026", "运行停止 Hook…");
tryReplace("running ${yq} hook", "运行 ${yq} Hook");

// 7. Hook counts
tryReplace('" hook…"', '" 个 Hook…"');
tryReplace('" hooks…"', '" 个 Hook…"');

// 8. Background agents
tryReplace('"All background agents stopped"', '"所有后台代理已停止"');

// 9. Time connectors
tryReplace(" Worked for ", " ");
tryReplace(" for ${M}", " ${M}");

// 10. Duration formatter
const marker = "if(q<60000)";
const markerIdx = s.indexOf(marker);
if (markerIdx !== -1) {
    const fnStart = s.lastIndexOf("function", markerIdx);
    if (fnStart !== -1) {
        let depth = 0, fnEnd = -1;
        for (let i = s.indexOf("{", fnStart); i < s.length; i++) {
            if (s[i] === "{") depth++;
            else if (s[i] === "}") depth--;
            if (depth === 0) { fnEnd = i; break; }
        }
        if (fnEnd !== -1) {
            let fn = s.substring(fnStart, fnEnd + 1);
            const pairs = [
                ["}d ${z}h ${Y}m ${$}s", "}天${z}时${Y}分${$}秒"],
                ["}d ${z}h ${Y}m", "}天${z}时${Y}分"],
                ["}h ${Y}m ${$}s", "}时${Y}分${$}秒"],
                ["}d ${z}h", "}天${z}时"],
                ["}h ${Y}m", "}时${Y}分"],
                ["}m ${$}s", "}分${$}秒"],
                ["}d", "}天"],
                ["}h", "}时"],
                ["}m", "}分"],
                ["}s", "}秒"],
                ['"0s"', '"0秒"'],
            ];
            let changed = false;
            pairs.forEach(([from, to]) => {
                if (fn.includes(from)) {
                    fn = fn.split(from).join(to);
                    changed = true;
                }
            });
            if (changed) {
                s = s.substring(0, fnStart) + fn + s.substring(fnEnd + 1);
                count++;
            }
        }
    }
}

// === 安全批量翻译：只在字符串字面量内替换 ===
//
// 将源码解析为交替的 [isString, text] 段：
//   isString=1 → 字符串字面量（"..."、'...'、`...`）— 安全替换
//   isString=0 → 代码 — 不替换
//
// 这样 "Error" 在代码标识符（TypeError）中不会被替换，
// 但 "Error" 在字符串字面量（"Error"）中会被替换为 "错误"。

const segs = [];
{
    let i = 0;
    while (i < s.length) {
        // 查找下一个引号字符：" ' `
        let qPos = -1;
        for (let j = i; j < s.length; j++) {
            const c = s.charCodeAt(j);
            if (c === 34 || c === 39 || c === 96) { // " ' `
                qPos = j;
                break;
            }
        }
        if (qPos < 0) {
            if (i < s.length) segs.push([0, s.substring(i)]);
            break;
        }
        // 引号前的代码段
        if (qPos > i) segs.push([0, s.substring(i, qPos)]);

        const qChar = s[qPos];

        if (qChar === '"' || qChar === "'") {
            // 简单字符串：找匹配的结束引号
            let esc = false, end = -1;
            for (let j = qPos + 1; j < s.length; j++) {
                if (esc) { esc = false; continue; }
                if (s[j] === '\\') { esc = true; continue; }
                if (s[j] === qChar) { end = j; break; }
            }
            if (end < 0) {
                segs.push([0, s.substring(qPos)]);
                break;
            }
            segs.push([1, s.substring(qPos, end + 1)]);
            i = end + 1;
        } else {
            // 模板字符串 `...`：需要把 ${...} 内的代码当作代码段处理
            // 逐字符扫描，遇到 ${ 就切换到代码模式
            let j = qPos + 1;
            let strStart = qPos;
            let esc = false;

            while (j < s.length) {
                if (esc) { esc = false; j++; continue; }
                if (s[j] === '\\') { esc = true; j++; continue; }
                // 遇到 ${ ：当前字符串部分结束，开始代码块
                if (s[j] === '$' && j + 1 < s.length && s[j + 1] === '{') {
                    // 发出字符串段（从 strStart 到当前位置 +1，即包含 ${
                    // 不对：字符串段应该只包含 ${ 之前的模板文字部分
                    segs.push([1, s.substring(strStart, j)]);
                    // 找匹配的 }
                    let depth = 1;
                    const codeStart = j; // 从 $ 开始
                    j += 2;
                    while (j < s.length && depth > 0) {
                        if (s[j] === '{') depth++;
                        else if (s[j] === '}') depth--;
                        if (depth > 0) j++;
                    }
                    // 代码段 ${...}
                    segs.push([0, s.substring(codeStart, j + 1)]);
                    j++;
                    strStart = j; // 下一部分从这里开始
                    continue;
                }
                // 遇到关闭 `
                if (s[j] === '`') {
                    // 发出最后的字符串段（包含关闭 `）
                    segs.push([1, s.substring(strStart, j + 1)]);
                    j++;
                    break;
                }
                j++;
            }
            i = j;
        }
    }
}

// 在字符串段内应用翻译（按长度降序，避免子串冲突）
if (translationsFile && fs.existsSync(translationsFile)) {
    const translations = JSON.parse(fs.readFileSync(translationsFile, "utf8"));
    translations.sort((a, b) => b.en.length - a.en.length);
    let jsonCount = 0;

    for (const { en, zh } of translations) {
        let hit = false;
        for (const seg of segs) {
            if (seg[0] === 1 && seg[1].includes(en)) {
                seg[1] = seg[1].split(en).join(zh);
                hit = true;
            }
        }
        if (hit) jsonCount++;
    }

    count += jsonCount;
    if (jsonCount > 0) {
        console.error("  JSON translations applied: " + jsonCount + "/" + translations.length);
    }
}

// 从段重建源码
s = segs.map(seg => seg[1]).join("");

// === 原子写入（保留文件权限，兼容 Windows）===
const tmp = cliFile + ".zh-cn-tmp";
fs.writeFileSync(tmp, s);
const origMode = fs.statSync(cliFile).mode;
fs.chmodSync(tmp, origMode);
if (process.platform === "win32") {
    try { fs.unlinkSync(cliFile); } catch (e) {}
}
fs.renameSync(tmp, cliFile);

console.log(count);
