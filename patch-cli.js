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

function tryRegexReplace(pattern, replacer) {
    let hit = false;
    s = s.replace(pattern, (...args) => {
        const match = args[0];
        const replaced = replacer(...args);
        if (replaced !== match) hit = true;
        return replaced;
    });
    if (hit) count++;
    return hit;
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asDoubleQuotedLiteral(text) {
    return JSON.stringify(text);
}

function splitApostropheLiteral(text) {
    if (!text.includes("'")) {
        return [text];
    }

    const parts = [];
    const segments = text.split("'");
    segments.forEach((segment, index) => {
        parts.push(segment);
        if (index !== segments.length - 1) {
            parts.push("'");
        }
    });
    return parts;
}

function trySplitDoubleQuotedLiteralReplace(en, zh) {
    const parts = splitApostropheLiteral(en);
    if (parts.length === 1) {
        return false;
    }

    const pattern = new RegExp(
        parts.map((part) => escapeRegExp(asDoubleQuotedLiteral(part))).join(String.raw`\s*,\s*`),
        "g"
    );
    return tryRegexReplace(pattern, () => asDoubleQuotedLiteral(zh));
}

function trySingleQuotedLiteralReplace(en, zh) {
    if (en.includes("'") || zh.includes("'")) {
        return false;
    }

    const pattern = new RegExp(`'${escapeRegExp(en)}'`, "g");
    return tryRegexReplace(pattern, () => `'${zh}'`);
}

function tryBacktickLiteralReplace(en, zh) {
    const pattern = new RegExp("`" + escapeRegExp(en) + "`", "g");
    if (tryRegexReplace(pattern, () => `\`${zh}\``)) {
        return true;
    }

    if (!en.endsWith("\n") && !zh.endsWith("\n")) {
        const newlinePattern = new RegExp("`" + escapeRegExp(en + "\n") + "`", "g");
        return tryRegexReplace(newlinePattern, () => `\`${zh}\n\``);
    }

    return false;
}

function scanDoubleQuotedLiterals(source) {
    const literals = [];
    const regexAllowedKeywords = new Set([
        "case",
        "delete",
        "do",
        "else",
        "in",
        "instanceof",
        "new",
        "of",
        "return",
        "throw",
        "typeof",
        "void",
        "yield",
        "await",
    ]);

    let state = "code";
    let i = 0;
    let start = -1;
    let prevToken = { type: "start", value: "" };
    const templateExprDepth = [];

    function setPrevToken(type, value = "") {
        prevToken = { type, value };
    }

    function isIdentifierStart(ch) {
        return /[A-Za-z_$]/.test(ch);
    }

    function isIdentifierPart(ch) {
        return /[A-Za-z0-9_$]/.test(ch);
    }

    function isDigit(ch) {
        return ch >= "0" && ch <= "9";
    }

    function canStartRegex() {
        if (prevToken.type === "start") return true;
        if (prevToken.type === "operator") return true;
        if (prevToken.type === "open") return true;
        if (prevToken.type === "comma") return true;
        if (prevToken.type === "colon") return true;
        if (prevToken.type === "question") return true;
        if (prevToken.type === "templateExprStart") return true;
        if (prevToken.type === "keyword" && regexAllowedKeywords.has(prevToken.value)) return true;
        return false;
    }

    while (i < source.length) {
        const ch = source[i];
        const next = source[i + 1];

        switch (state) {
            case "code":
                if (/\s/.test(ch)) {
                    i++;
                    continue;
                }

                if (ch === '"') {
                    start = i;
                    state = "double";
                    i++;
                    continue;
                }

                if (ch === "'") {
                    state = "single";
                    i++;
                    continue;
                }

                if (ch === "`") {
                    state = "template";
                    i++;
                    continue;
                }

                if (ch === "/" && next === "/") {
                    state = "lineComment";
                    i += 2;
                    continue;
                }

                if (ch === "/" && next === "*") {
                    state = "blockComment";
                    i += 2;
                    continue;
                }

                if (ch === "/") {
                    if (canStartRegex()) {
                        state = "regex";
                        i++;
                        continue;
                    }
                    setPrevToken("operator", "/");
                    i++;
                    continue;
                }

                if (isIdentifierStart(ch)) {
                    let j = i + 1;
                    while (j < source.length && isIdentifierPart(source[j])) j++;
                    const word = source.slice(i, j);
                    setPrevToken(regexAllowedKeywords.has(word) ? "keyword" : "identifier", word);
                    i = j;
                    continue;
                }

                if (isDigit(ch)) {
                    let j = i + 1;
                    while (j < source.length && /[0-9A-Fa-f_xXobBeE.+-]/.test(source[j])) j++;
                    setPrevToken("number", source.slice(i, j));
                    i = j;
                    continue;
                }

                if (ch === "{") {
                    if (templateExprDepth.length > 0) {
                        templateExprDepth[templateExprDepth.length - 1]++;
                    }
                    setPrevToken("open", ch);
                    i++;
                    continue;
                }

                if (ch === "}") {
                    if (templateExprDepth.length > 0) {
                        templateExprDepth[templateExprDepth.length - 1]--;
                        if (templateExprDepth[templateExprDepth.length - 1] === 0) {
                            templateExprDepth.pop();
                            setPrevToken("templateExprEnd", ch);
                            state = "template";
                            i++;
                            continue;
                        }
                    }
                    setPrevToken("close", ch);
                    i++;
                    continue;
                }

                if (ch === "(" || ch === "[") {
                    setPrevToken("open", ch);
                    i++;
                    continue;
                }

                if (ch === ")" || ch === "]") {
                    setPrevToken("close", ch);
                    i++;
                    continue;
                }

                if (ch === ",") {
                    setPrevToken("comma", ch);
                    i++;
                    continue;
                }

                if (ch === ":") {
                    setPrevToken("colon", ch);
                    i++;
                    continue;
                }

                if (ch === "?") {
                    setPrevToken("question", ch);
                    i++;
                    continue;
                }

                if (ch === "=" && next === ">") {
                    setPrevToken("operator", "=>");
                    i += 2;
                    continue;
                }

                setPrevToken("operator", ch);
                i++;
                continue;

            case "double":
                if (ch === "\\") {
                    i += 2;
                    continue;
                }
                if (ch === '"') {
                    literals.push({
                        start,
                        end: i + 1,
                        text: source.slice(start + 1, i),
                    });
                    setPrevToken("string");
                    state = "code";
                    i++;
                    continue;
                }
                i++;
                continue;

            case "single":
                if (ch === "\\") {
                    i += 2;
                    continue;
                }
                if (ch === "'") {
                    setPrevToken("string");
                    state = "code";
                    i++;
                    continue;
                }
                i++;
                continue;

            case "template":
                if (ch === "\\") {
                    i += 2;
                    continue;
                }
                if (ch === "`") {
                    setPrevToken("template");
                    state = "code";
                    i++;
                    continue;
                }
                if (ch === "$" && next === "{") {
                    templateExprDepth.push(1);
                    setPrevToken("templateExprStart", "${");
                    state = "code";
                    i += 2;
                    continue;
                }
                i++;
                continue;

            case "lineComment":
                if (ch === "\n" || ch === "\r") {
                    state = "code";
                }
                i++;
                continue;

            case "blockComment":
                if (ch === "*" && next === "/") {
                    state = "code";
                    i += 2;
                    continue;
                }
                i++;
                continue;

            case "regex":
                if (ch === "\\") {
                    i += 2;
                    continue;
                }
                if (ch === "[") {
                    state = "regexClass";
                    i++;
                    continue;
                }
                if (ch === "/") {
                    i++;
                    while (i < source.length && /[A-Za-z]/.test(source[i])) i++;
                    setPrevToken("regex");
                    state = "code";
                    continue;
                }
                i++;
                continue;

            case "regexClass":
                if (ch === "\\") {
                    i += 2;
                    continue;
                }
                if (ch === "]") {
                    state = "regex";
                    i++;
                    continue;
                }
                i++;
                continue;
        }
    }

    return literals;
}

function replaceLiteralText(text, en, zh) {
    const wordLike = en.match(/^([^A-Za-z0-9_$]*)([A-Za-z][A-Za-z0-9_$]*)([^A-Za-z0-9_$]*)$/);
    if (!wordLike) {
        return text.split(en).join(zh);
    }

    const [, , word] = wordLike;
    const enEscaped = en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|[^A-Za-z0-9_$])(${enEscaped})(?=$|[^A-Za-z0-9_$])`, "g");
    return text.replace(pattern, (match, boundary) => boundary + zh);
}

const specialSplitLiteralTranslations = [
    {
        en: "Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team). If not, take a moment to review what's in this folder first.",
        zh: "安全检查：这是你自己创建或信任的项目吗？（比如你自己的代码、知名开源项目、或团队的工作）。如果不是，请先查看此文件夹中的内容。",
    },
    {
        en: "Claude Code'll be able to read, edit, and execute files here.",
        zh: "Claude Code 将能在此目录中读取、编辑和执行文件。",
    },
];

const specialLiteralTranslations = [
    { en: "Tab to amend", zh: "按 Tab 修改" },
    { en: "ctrl+e to explain", zh: "按 ctrl+e 说明" },
    { en: " ready · shift+↓ to view", zh: " 已就绪 · 按 shift+↓ 查看" },
    { en: "Failed to save ", zh: "保存失败：" },
];

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

// 4. 去掉 duration display 的 "for" 连接词
// 原始: createElement(T, ..., verb, " for ", duration) → "沏了 for 27分26秒"
// 修复: " for " → " "（仅匹配 createElement 文本节点模式）
tryReplace('," for ",', '," ",');
tryReplace('"Idle for "', '"空闲 "');

// 4b. 主 spinner 的 duration display（反引号模板字符串）
// 原: `${bL} Worked for ${w3(Date.now()-V.startTime)}` → "烘焙了 Worked for 27分26秒"
// 修: `${bL} ${w3(Date.now()-V.startTime)}` → "烘焙了 27分26秒"
tryReplace(' Worked for ${w3(Date.now()-V.startTime)}', ' ${w3(Date.now()-V.startTime)}');
tryReplace('${bL} Idle', '${bL} 空闲');

// 4c. 同类 duration 模板的泛化匹配
// 某些版本会改变量名或表达式，但模板结构仍是 `${verb} Worked for ${duration}`。
// 这里按模板形态处理，不再依赖固定变量名。
tryRegexReplace(/\$\{[^}]+\}\s+Worked for\s+\$\{[^}]+\}/g, (match) =>
    match.replace(" Worked for ", " ")
);
tryRegexReplace(/\$\{[^}]+\}\s+Idle(?=[`"])/g, (match) =>
    match.replace(" Idle", " 空闲")
);

// 4d. 消息完成后的状态行（显示 "翻搅了 for 51秒" 的地方）
// 原: let G=H&&`${O} for ${M}`  （O=动词, M=时长）
// 修: let G=H&&`${O} ${M}`     → "翻搅了 51秒"
tryReplace('`${O} for ${M}`', '`${O} ${M}`');
tryRegexReplace(/&&`\$\{[^}]+\} for \$\{[^}]+\}`/g, (match) =>
    match.replace(" for ", " ")
);

// 4e. /clear 省上下文提示（split fragment → 稳定模板）
tryRegexReplace(
    /([A-Za-z0-9_$]+(?:\.default)?)\.createElement\(([^,]+),\{color:"suggestion"\},"\/clear"\),\1\.createElement\(\2,\{dimColor:!0\}," to save "\),\1\.createElement\(\2,\{color:"suggestion"\},([A-Za-z0-9_$]+)," tokens"\)/g,
    (match, factory, component, tokenCount) =>
        `${factory}.createElement(${component},{color:"suggestion"},"/clear"),${factory}.createElement(${component},{dimColor:!0}," 保存 "),${factory}.createElement(${component},{color:"suggestion"},${tokenCount}," tokens")`
);

// 5. 保存并编辑快捷键提示（split fragment → 稳定模板）
tryRegexReplace(
    /([A-Za-z0-9_$]+(?:\.default)?)\.createElement\(([^,]+),\{color:"success"\},"Press ",([A-Za-z0-9_$]+)," or ",([A-Za-z0-9_$]+)," to save,"," ",\1\.createElement\(\2,\{bold:!0\},"e"\)," to save and edit"\)/g,
    (match, factory, component, primaryKey, secondaryKey) =>
        `${factory}.createElement(${component},{color:"success"},"按 ",${primaryKey}," 或 ",${secondaryKey}," 保存，按 ",${factory}.createElement(${component},{bold:!0},"e")," 保存并编辑")`
);

// 6. Quick Launch / plan open 等单点高风险 UI 片段迁移到结构化 patch
tryRegexReplace(
    /([A-Za-z0-9_$]+(?:\.default)?)\.createElement\(([^,]+),null,"• Cmd\+Esc",\1\.createElement\(\2,\{dimColor:!0\}," for Quick Launch"\)\)/g,
    (match, factory, component) =>
        `${factory}.createElement(${component},null,"• 快速启动",${factory}.createElement(${component},{dimColor:!0}," · Cmd+Esc"))`
);
tryRegexReplace(
    /([A-Za-z0-9_$]+(?:\.default)?)\.createElement\(([^,]+),\{marginTop:1\},\1\.createElement\(([^,]+),\{dimColor:!0\},['"]"\/plan open"['"]\),\1\.createElement\(\3,\{dimColor:!0\}," to edit this plan in "\),\1\.createElement\(\3,\{bold:!0,dimColor:!0\},([A-Za-z0-9_$]+)\)\)/g,
    (match, factory, containerComponent, textComponent, terminalName) =>
        `${factory}.createElement(${containerComponent},{marginTop:1},${factory}.createElement(${textComponent},{dimColor:!0},"在 "),${factory}.createElement(${textComponent},{bold:!0,dimColor:!0},${terminalName}),${factory}.createElement(${textComponent},{dimColor:!0},' 中用 "/plan open" 编辑此计划'))`
);

// === 逐条翻译：只替换真实的双引号字符串字面量 ===
//
// 先处理 minifier 把 `'` 拆成 `"foo","'","bar"` 的高风险字面量（folder trust、/btw 等），
// 再扫描源码中的真实双引号字符串 token，只在这些 token 内做替换。
// 这样不会跨越源码结构误改对象键、标识符或注释。

if (translationsFile && fs.existsSync(translationsFile)) {
    const translationRules = [
        ...JSON.parse(fs.readFileSync(translationsFile, "utf8")),
        ...specialLiteralTranslations,
        ...specialSplitLiteralTranslations,
    ];
    translationRules.sort((a, b) => b.en.length - a.en.length);

    for (const { en, zh } of translationRules) {
        if (en === zh || !en.includes("'")) {
            continue;
        }
        trySplitDoubleQuotedLiteralReplace(en, zh);
    }

    for (const { en, zh } of translationRules) {
        if (en === zh) continue;
        trySingleQuotedLiteralReplace(en, zh);
        tryBacktickLiteralReplace(en, zh);
    }

    const literals = scanDoubleQuotedLiterals(s);
    let literalsChanged = false;

    for (const { en, zh } of translationRules) {
        if (en === zh) continue;

        let hit = false;
        for (const literal of literals) {
            if (!literal.text.includes(en)) {
                continue;
            }
            const replaced = replaceLiteralText(literal.text, en, zh);
            if (replaced === literal.text) {
                continue;
            }
            literal.text = replaced;
            hit = true;
            literalsChanged = true;
        }

        if (hit) count++;
    }

    if (literalsChanged) {
        let rebuilt = "";
        let cursor = 0;
        for (const literal of literals) {
            rebuilt += s.slice(cursor, literal.start + 1);
            rebuilt += literal.text;
            rebuilt += '"';
            cursor = literal.end;
        }
        rebuilt += s.slice(cursor);
        s = rebuilt;
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
