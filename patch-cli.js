#!/usr/bin/env node
// patch-cli.js - cli.js 硬编码文字中文 patch（安全版）
// 只替换 JavaScript 双引号字符串字面量内的文字，避免破坏代码标识符
// 被 patch-cli.sh 调用

const fs = require("fs");

const cliFile = process.argv[2];
const translationsFile = process.argv[3];

if (!cliFile || !fs.existsSync(cliFile)) {
    console.log("0");
    process.exit(0);
}

const original = fs.readFileSync(cliFile, "utf8");
let s = original;
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
// 这些 patch 匹配非常特定的代码模式，不会误伤标识符

// 1. 过去式动词数组
tryReplace(
    '["Baked","Brewed","Churned","Cogitated","Cooked","Crunched","Saut\u00e9ed","Worked"]',
    '["烘焙了","沏了","翻搅了","琢磨了","烹饪了","嚼了","翻炒了","忙活了"]'
);

// 2. Tip: → 💡
const tipMatch = s.match(/`Tip: \$\{[^}]+\}`/);
if (tipMatch) {
    const replaced = tipMatch[0].replace("Tip: ", "\u{1F4A1} ");
    s = s.split(tipMatch[0]).join(replaced);
    count++;
}

// 3. Duration formatter（时间单位中文化）
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

// === 安全批量翻译：只在双引号字符串字面量内替换 ===
//
// 为什么只处理双引号（"）：
// - 混淆后的 cli.js 几乎只用 " 作为字符串引号
// - ' 会出现在注释和缩写中（如 "We're"），导致解析器失步
// - ` 模板字符串中的 ${...} 需要额外处理，增加复杂度和出错风险
// - 只处理 " 覆盖了绝大多数 UI 文字，且安全可靠

const segs = [];
{
    let i = 0;
    while (i < s.length) {
        const qPos = s.indexOf('"', i);
        if (qPos < 0) {
            if (i < s.length) segs.push([0, s.substring(i)]);
            break;
        }
        // 引号前的代码段
        if (qPos > i) segs.push([0, s.substring(i, qPos)]);

        // 找匹配的结束双引号（处理转义 \"）
        let esc = false, end = -1;
        for (let j = qPos + 1; j < s.length; j++) {
            if (esc) { esc = false; continue; }
            if (s[j] === '\\') { esc = true; continue; }
            if (s[j] === '"') { end = j; break; }
        }
        if (end < 0) {
            // 未终止的字符串 → 当作代码处理
            segs.push([0, s.substring(qPos)]);
            break;
        }

        // 字符串段（含前后引号）
        segs.push([1, s.substring(qPos, end + 1)]);
        i = end + 1;
    }
}

// 在字符串段内应用翻译（按长度降序，避免子串冲突）
if (translationsFile && fs.existsSync(translationsFile)) {
    const translations = JSON.parse(fs.readFileSync(translationsFile, "utf8"));
    translations.sort((a, b) => b.en.length - a.en.length);

    for (const { en, zh } of translations) {
        // 跳过 no-op 条目
        if (en === zh) continue;

        let hit = false;
        for (const seg of segs) {
            if (seg[0] === 1 && seg[1].includes(en)) {
                seg[1] = seg[1].split(en).join(zh);
                hit = true;
            }
        }
        if (hit) count++;
    }
}

// 从段重建源码
s = segs.map(seg => seg[1]).join("");

// === 只有实际改变文件内容才写入 ===
if (s === original) {
    // 文件无变化，不写入
    console.log("0");
    process.exit(0);
}

const tmp = cliFile + ".zh-cn-tmp";
fs.writeFileSync(tmp, s);
const origMode = fs.statSync(cliFile).mode;
fs.chmodSync(tmp, origMode);
if (process.platform === "win32") {
    try { fs.unlinkSync(cliFile); } catch (e) {}
}
fs.renameSync(tmp, cliFile);

console.log(count);
