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

// 5b. 主 spinner 的 duration display（反引号模板字符串）
// 原: `${bL} Worked for ${w3(Date.now()-V.startTime)}` → "烘焙了 Worked for 27分26秒"
// 修: `${bL} ${w3(Date.now()-V.startTime)}` → "烘焙了 27分26秒"
tryReplace(' Worked for ${w3(Date.now()-V.startTime)}', ' ${w3(Date.now()-V.startTime)}');
tryReplace('${bL} Idle', '${bL} 空闲');

// 5c. 同类 duration 模板的泛化匹配
// 某些版本会改变量名或表达式，但模板结构仍是 `${verb} Worked for ${duration}`。
// 这里按模板形态处理，不再依赖固定变量名。
tryRegexReplace(/\$\{[^}]+\}\s+Worked for\s+\$\{[^}]+\}/g, (match) =>
    match.replace(" Worked for ", " ")
);
tryRegexReplace(/\$\{[^}]+\}\s+Idle(?=[`"])/g, (match) =>
    match.replace(" Idle", " 空闲")
);

// 5c. 消息完成后的状态行（显示 "翻搅了 for 51秒" 的地方）
// 原: let G=H&&`${O} for ${M}`  （O=动词, M=时长）
// 修: let G=H&&`${O} ${M}`     → "翻搅了 51秒"
tryReplace('`${O} for ${M}`', '`${O} ${M}`');

// 5d. 模板字符串标题（动态变量无法通过双引号扫描覆盖）
tryRegexReplace(/`Newer\s+\$\{([^}]+)\}\s+model available`/g, (_, expr) =>
    '`有新的 ${' + expr + '} 模型可用`'
);

// 5e. /model 动态描述（当前模型名会随版本变化）
tryRegexReplace(/`Set the AI model for Claude Code \(currently \$\{([^}]+)\}\)`/g, (_, expr) =>
    '`设置 Claude Code 使用的 AI 模型（当前为 ${' + expr + '}）`'
);

// 5e2. /fast 动态描述（当前 fast mode 取决于模型名）
tryRegexReplace(/`Toggle fast mode \(\$\{([^}]+)\} only\)`/g, (_, expr) =>
    '`切换快速模式（${' + expr + '} 专用）`'
);

// 5f. /update-config 的单引号描述（不在双引号扫描器覆盖范围内）
tryRegexReplace(
    /'Use this skill to configure the Claude Code harness via settings\.json\. Automated behaviors \("from now on when X", "each time X", "whenever X", "before\/after X"\) require hooks configured in settings\.json - the harness executes these, not Claude, so memory\/preferences cannot fulfill them\. Also use for: permissions \("allow X", "add permission", "move permission to"\), env vars \("set X=Y"\), hook troubleshooting, or any changes to settings\.json\/settings\.local\.json files\. Examples: "allow npm commands", "add bq permission to global settings", "move permission to user settings", "set DEBUG=true", "when claude stops show X"\. For simple settings like theme\/model, use Config tool\.'/g,
    () => "'使用此技能通过 settings.json 配置 Claude Code harness。自动化行为（“从现在起当 X”“每次 X”“每当 X”“在 X 之前/之后”）需要在 settings.json 中配置 Hook - 这些由 harness 执行，不是 Claude，因此记忆/偏好无法满足它们。也用于：权限（“允许 X”“添加权限”“移动权限到”）、环境变量（“设置 X=Y”）、Hook 故障排查，或对 settings.json/settings.local.json 的任何修改。示例：“允许 npm 命令”“向全局设置添加 bq 权限”“将权限移到用户设置”“设置 DEBUG=true”“当 claude 停止时显示 X”。对于主题/模型这类简单设置，请使用 Config 工具。'"
);

// === 逐条翻译：只替换真实的双引号字符串字面量 ===
//
// 先扫描源码中的真实双引号字符串 token，再只在这些 token 内做替换。
// 这样不会跨越源码结构误改对象键、标识符或注释。

if (translationsFile && fs.existsSync(translationsFile)) {
    const translations = JSON.parse(fs.readFileSync(translationsFile, "utf8"));
    translations.sort((a, b) => b.en.length - a.en.length);
    const literals = scanDoubleQuotedLiterals(s);
    let literalsChanged = false;

    for (const { en, zh } of translations) {
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
