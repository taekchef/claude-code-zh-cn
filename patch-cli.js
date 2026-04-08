#!/usr/bin/env node
// patch-cli.js - cli.js 硬编码文字中文 patch（安全版）
// 逐条翻译：对每条翻译用正则匹配 "..." 内的目标文本，安全替换
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

// 4. 拆分字符串 patch（minifier 在 ' 处拆分字符串）
// "Quick safety check:..." → 中文安全检查提示
tryReplace(
    '"Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team). If not, take a moment to review what","\'","s in this folder first."',
    '"安全检查：这是你自己创建或信任的项目吗？（比如你自己的代码、知名开源项目、或团队的工作）。如果不是，请先查看此文件夹中的内容。"'
);
tryReplace(
    '"Claude Code","\'","ll be able to read, edit, and execute files here."',
    '"Claude Code 将能在此目录中读取、编辑和执行文件。"'
);

// 5. 去掉 duration display 的 "for" 连接词
// 原始: createElement(T, ..., verb, " for ", duration) → "沏了 for 27分26秒"
// 修复: " for " → " "（仅匹配 createElement 文本节点模式）
tryReplace('," for ",', '," ",');
tryReplace('"Idle for "', '"空闲 "');

// === 逐条翻译：用正则匹配双引号字符串内的目标文本 ===
//
// 原理：对每条翻译 { en, zh }，构建正则：
//   /"([^"]*?)EN_TEXT([^"]*?)"/g
// 匹配双引号字符串字面量中包含英文文本的位置，
// 然后在回调中替换 en→zh。
//
// 正则字面量中的 " 也会被匹配（如 /"Error"/），在回调中通过
// 检查 offset 前一个字符是否为 / 来排除。
//
// 限制：
// - 不翻译反引号模板中的文本（22 条在模板中，暂不覆盖）
// - 不翻译字符串内有转义引号 \" 的情况（cli.js 极少出现）

if (translationsFile && fs.existsSync(translationsFile)) {
    const translations = JSON.parse(fs.readFileSync(translationsFile, "utf8"));
    // 按长度降序，避免短串先被替换导致长串匹配失败
    translations.sort((a, b) => b.en.length - a.en.length);

    for (const { en, zh } of translations) {
        if (en === zh) continue;

        // 对 en 文本进行正则转义
        const enEscaped = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // 正则：匹配 "（不含引号的任意内容）en文本（不含引号的任意内容）"
        // [^"\\]* 匹配不含引号和反斜杠的字符（简化处理，忽略 \" 转义引号的情况）
        const regex = new RegExp('("[^"\\\\]*' + enEscaped + '[^"\\\\]*")', 'g');

        let hit = false;
        s = s.replace(regex, (match, p1, offset, str) => {
            // 跳过正则字面量内的 "..."（如 /"Error"/ 中的 "Error"）
            // 正则字面量特征：offset 前一个字符是 /
            // （除法运算符的 / 后面不会紧跟 "，所以这个启发式在 minified JS 中安全）
            if (offset > 0 && str[offset - 1] === '/') {
                return match;
            }
            const replaced = match.substring(0, match.length - 1)
                .split(en).join(zh) + '"';
            if (replaced !== match) hit = true;
            return replaced;
        });

        if (hit) count++;
    }
}

// === 只有实际改变文件内容才写入 ===
if (s === original) {
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
