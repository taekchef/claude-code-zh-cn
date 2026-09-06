#!/usr/bin/env node
// patch-cli.js - cli.js 硬编码文字中文 patch（安全版）
// 逐条翻译：对每条翻译用正则匹配 "..." 内的目标文本，安全替换
// 被 patch-cli.sh 调用
//
// 优雅降级契约：
// - 单条翻译/结构化 patch 匹配不上 → 跳过该条，其余照常（新版本改了文字 = 那条保持英文）
// - patch 结果必须通过 JS 语法校验才落盘；校验失败 → 不写任何东西，CLI 保持原样可用
// - 任何意外异常 → 记录日志后按"未改动"退出（exit 0），绝不让调用方误以为 patch 成功
//
// 用法: patch-cli.js <cliFile> <translationsFile> [--backup <path>] [--status <file>] [--log <file>]
//   --backup  npm 托管备份模式：patch 前从同版本备份恢复干净基底；备份缺失/过期时自动重建
//   --status  写入单词状态: ok | partial | noop | validation-failed | error
//   --log     错误日志路径（默认与本脚本同目录的 patch.log）

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const positional = [];
const options = {};
{
    const argv = process.argv.slice(2);
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--backup" || argv[i] === "--status" || argv[i] === "--log") {
            options[argv[i].slice(2)] = argv[i + 1];
            i++;
        } else {
            positional.push(argv[i]);
        }
    }
}

const cliFile = positional[0];
const translationsFile = positional[1];

function defaultLogFile() {
    const pluginRoot =
        process.env.CLAUDE_PLUGIN_ROOT ||
        path.join(os.homedir(), ".claude", "plugins", "claude-code-zh-cn");
    if (fs.existsSync(pluginRoot)) {
        return path.join(pluginRoot, "patch.log");
    }
    return path.join(__dirname, "patch.log");
}

const logFile = options.log || defaultLogFile();

const RESIDUE_PROBES = [
    "Quick safety check",
    "This command requires approval",
    "Use /btw to ask a quick side question without interrupting Claude's current work",
];

const PATCHED_TRACE_PROBES = ["安全检查：这是你自己创建", "等待权限确认…", "已切换模型为"];

function logEvent(message) {
    const line = `${new Date().toISOString()} ${message}\n`;
    try {
        try {
            const stat = fs.statSync(logFile);
            if (stat.size > 256 * 1024) {
                const tail = fs.readFileSync(logFile, "utf8").slice(-64 * 1024);
                fs.writeFileSync(logFile, tail);
            }
        } catch {}
        fs.appendFileSync(logFile, line);
    } catch {}
    process.stderr.write(line);
}

function writeStatus(status) {
    if (!options.status) return;
    try {
        fs.writeFileSync(options.status, status + "\n");
    } catch {}
}

function readVersionComment(text) {
    const match = text.match(/^\/\/ Version: (.+)$/m);
    return match ? match[1].trim() : "";
}

function looksPatched(text) {
    return PATCHED_TRACE_PROBES.some((probe) => text.includes(probe));
}

// 先用 vm.Script（CommonJS 语法，进程内、快）；失败再退到 node --check
// （子进程，能正确解析 ESM——npm 的 cli.js 顶层有 import，vm.Script 必然报错）。
function parsesAsJs(text) {
    try {
        new vm.Script(text, { filename: cliFile });
        return true;
    } catch {}
    try {
        const tmp = path.join(
            os.tmpdir(),
            `cczh-syntax-check.${process.pid}.${Math.random().toString(36).slice(2)}.mjs`
        );
        fs.writeFileSync(tmp, text);
        try {
            const result = require("child_process").spawnSync(process.execPath, ["--check", tmp], {
                stdio: "ignore",
                timeout: 30000,
            });
            return result.status === 0;
        } finally {
            try { fs.unlinkSync(tmp); } catch {}
        }
    } catch {
        return false;
    }
}

// 语法校验策略：只有当"原文本身可被 Node 解析"时才要求 patch 结果也可解析。
// 原文就解析不了（如 native 提取的 Bun JS 含非标准语法）→ 跳过校验，不误拦。
function validateSyntax(before, after) {
    if (!parsesAsJs(before)) {
        logEvent(`validation-skipped ${cliFile}: source is not parseable by Node (e.g. native extract)`);
        return true;
    }
    if (parsesAsJs(after)) {
        return true;
    }
    logEvent(`validation-failed ${cliFile}: patched result is not valid JS, refusing to write`);
    return false;
}

function residueStatus(text) {
    return RESIDUE_PROBES.some((probe) => text.includes(probe)) ? "partial" : "ok";
}

function exitNoChange(status) {
    writeStatus(status);
    console.log("0");
    process.exit(0);
}

if (!cliFile || !fs.existsSync(cliFile)) {
    exitNoChange("noop");
}

const currentContent = fs.readFileSync(cliFile, "utf8");
let original = currentContent;

// --backup 托管备份模式：保证每次 patch 都基于干净的英文原文，杜绝 patch 叠 patch
if (options.backup) {
    const backupFile = options.backup;
    const currentVersion = readVersionComment(currentContent);
    let backupContent = null;
    if (fs.existsSync(backupFile)) {
        try {
            backupContent = fs.readFileSync(backupFile, "utf8");
        } catch {
            backupContent = null;
        }
    }

    if (backupContent !== null && currentVersion && readVersionComment(backupContent) === currentVersion) {
        // 同版本备份存在 → 用备份做干净基底
        original = backupContent;
    } else if (!looksPatched(currentContent)) {
        // 备份缺失/版本过期，且当前文件未被 patch 过 → 当前文件就是新 upstream 原文，刷新备份
        try {
            fs.writeFileSync(backupFile, currentContent);
        } catch (error) {
            logEvent(`backup-refresh-failed ${backupFile}: ${error.message}`);
        }
        original = currentContent;
    } else {
        // 备份不可用且当前文件已被 patch 过：没有干净基底。
        // 继续在当前文件上做增量 patch（翻译规则对已翻译文本天然幂等），语法校验兜底。
        logEvent(`no-clean-backup ${cliFile}: patching in place (backup missing or version mismatch)`);
        original = currentContent;
    }
}

let s = original;
let count = 0;

// 全局兜底：任何未预期异常都按"未改动"退出，绝不落半成品
process.on("uncaughtException", (error) => {
    logEvent(`unexpected-error ${cliFile}: ${error && error.stack ? error.stack : error}`);
    writeStatus("error");
    console.log("0");
    process.exit(0);
});

// === Helper：直接全量替换（仅用于特殊 patch，匹配特定代码模式）===
// 单条 patch 内部异常只跳过该条（优雅降级），不中断整体流程

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
    try {
        const replaced = s.replace(pattern, (...args) => {
            const match = args[0];
            const result = replacer(...args);
            if (result !== match) hit = true;
            return result;
        });
        if (hit) {
            s = replaced;
            count++;
        }
    } catch (error) {
        logEvent(`structural-patch-skipped ${pattern}: ${error.message}`);
        return false;
    }
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

function escapeSingleQuotedLiteralContent(text) {
    return text
        .replace(/\\/g, "\\\\")
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029")
        .replace(/'/g, "\\'");
}

function escapeSingleQuotedLiteralNeedleContent(text) {
    return text
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n")
        .replace(/\t/g, "\\t")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029")
        .replace(/'/g, "\\'");
}

function isProtectedProtocolLiteral(literal) {
    return literal.quote === "`" && literal.text.startsWith("[Pasted text #${") && literal.text.endsWith(" lines]");
}

function replaceTemplateLiteralTextParts(parts, en, zh) {
    let hit = false;
    for (const part of parts) {
        if (part.type !== "text" || !part.value.includes(en)) {
            continue;
        }
        const replaced = replaceLiteralText(part.value, en, zh);
        if (replaced === part.value) {
            continue;
        }
        part.value = replaced;
        hit = true;
    }
    return hit;
}

function splitTemplateSegments(text) {
    return text.split(/\$\{[^}]+\}/g);
}

function replaceWholeTemplateLiteral(literal, en, zh) {
    const exprParts = literal.parts.filter((part) => part.type === "expr");
    if (exprParts.length === 0) {
        return false;
    }

    const enSegments = splitTemplateSegments(en);
    const zhSegments = splitTemplateSegments(zh);
    if (enSegments.length !== exprParts.length + 1 || zhSegments.length !== exprParts.length + 1) {
        return false;
    }

    let segmentIndex = 0;
    for (const part of literal.parts) {
        if (part.type !== "text") {
            continue;
        }
        if (part.value !== enSegments[segmentIndex++]) {
            return false;
        }
    }
    if (segmentIndex !== enSegments.length) {
        return false;
    }

    segmentIndex = 0;
    let textIndex = 0;
    for (const part of literal.parts) {
        if (part.type !== "text") {
            continue;
        }
        part.value = zhSegments[textIndex++] ?? "";
    }
    literal.text = literal.parts.map((part) => part.value).join("");
    return true;
}

function scanStringLiterals(source) {
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
    const templateStack = [];
    let recordStringLiteral = true;

    function setPrevToken(type, value = "") {
        prevToken = { type, value };
    }

    function currentTemplate() {
        return templateStack[templateStack.length - 1] ?? null;
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
                    recordStringLiteral = !(currentTemplate() && currentTemplate().exprDepth > 0);
                    state = "double";
                    i++;
                    continue;
                }

                if (ch === "'") {
                    start = i;
                    recordStringLiteral = !(currentTemplate() && currentTemplate().exprDepth > 0);
                    state = "single";
                    i++;
                    continue;
                }

                if (ch === "`") {
                    start = i;
                    templateStack.push({
                        start,
                        parts: [],
                        textStart: i + 1,
                        exprStart: -1,
                        exprDepth: 0,
                        recordLiteral: !(currentTemplate() && currentTemplate().exprDepth > 0),
                    });
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
                    const template = currentTemplate();
                    if (template && template.exprDepth > 0) {
                        template.exprDepth++;
                    }
                    setPrevToken("open", ch);
                    i++;
                    continue;
                }

                if (ch === "}") {
                    const template = currentTemplate();
                    if (template && template.exprDepth > 0) {
                        template.exprDepth--;
                        if (template.exprDepth === 0) {
                            template.parts.push({
                                type: "expr",
                                value: source.slice(template.exprStart, i + 1),
                            });
                            template.exprStart = -1;
                            template.textStart = i + 1;
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
                    if (recordStringLiteral) {
                        literals.push({
                            start,
                            end: i + 1,
                            text: source.slice(start + 1, i),
                            quote: '"',
                        });
                    }
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
                    if (recordStringLiteral) {
                        literals.push({
                            start,
                            end: i + 1,
                            text: source.slice(start + 1, i),
                            quote: "'",
                        });
                    }
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
                    const template = templateStack.pop();
                    template.parts.push({
                        type: "text",
                        value: source.slice(template.textStart, i),
                    });
                    if (template.recordLiteral) {
                        literals.push({
                            start: template.start,
                            end: i + 1,
                            text: template.parts.map((part) => part.value).join(""),
                            quote: "`",
                            parts: template.parts,
                        });
                    }
                    setPrevToken("template");
                    state = "code";
                    i++;
                    continue;
                }
                if (ch === "$" && next === "{") {
                    const template = currentTemplate();
                    template.parts.push({
                        type: "text",
                        value: source.slice(template.textStart, i),
                    });
                    template.exprStart = i;
                    template.exprDepth = 1;
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
    { en: "Any Bash command starting with", zh: "任意 Bash 命令以" },
    { en: "任意 Bash 命令 starting with", zh: "任意 Bash 命令以" },
    { en: "The Bash command ", zh: "Bash 命令 " },
    { en: "Requires manual approval", zh: "需要手动批准" },
    { en: "Waiting\\u2026", zh: "等待中…" },
    { en: "Waiting for permission\\u2026", zh: "等待权限确认…" },
    { en: "Working\\u2026", zh: "工作中…" },
    { en: "Yes, and don\\u2019t ask again for", zh: "是，不再询问" },
    { en: "Yes, and don’t ask again for", zh: "是，不再询问" },
    { en: " ready · shift+↓ to view", zh: " 已就绪 · 按 shift+↓ 查看" },
    { en: "Failed to save ", zh: "保存失败：" },
];

function translateFastModeTemplateLiteral(literal) {
    const exprParts = literal.parts?.filter((part) => part.type === "expr") ?? [];
    const textParts = literal.parts?.filter((part) => part.type === "text") ?? [];
    if (exprParts.length !== 1 || textParts.length !== 2) {
        return false;
    }

    if (textParts[0].value !== "Toggle fast mode (") {
        return false;
    }

    const hasOnlySuffix = textParts[1].value === " only)";
    if (textParts[1].value !== ")" && !hasOnlySuffix) {
        return false;
    }

    textParts[0].value = hasOnlySuffix ? "切换快速模式（仅 " : "切换快速模式（";
    textParts[1].value = "）";
    literal.text = literal.parts.map((part) => part.value).join("");
    return true;
}

function applyDynamicLiteralTranslations(text) {
    const statusVerbs = new Map([
        ["Baked", "烘焙了"],
        ["Brewed", "沏了"],
        ["Churned", "翻搅了"],
        ["Cogitated", "琢磨了"],
        ["Cooked", "烹饪了"],
        ["Crunched", "嚼了"],
        ["Sautéed", "翻炒了"],
        ["Saut\\xE9ed", "翻炒了"],
        ["Thought", "思考了"],
        ["Worked", "忙活了"],
    ]);

    let translated = text.replace(/Toggle fast mode \((Opus [^)]+?)( only)?\)/g, (_match, model, only) => {
        return only ? `切换快速模式（仅 ${model}）` : `切换快速模式（${model}）`;
    });
    translated = translated.replace(
        /\b(Baked|Brewed|Churned|Cogitated|Cooked|Crunched|Sautéed|Saut\\xE9ed|Thought|Worked) for (?=\$\{)/g,
        (_match, verb) => `${statusVerbs.get(verb)} `
    );
    translated = translated
        .replace(/ctrl\+o to expand/g, "按 ctrl+o 展开")
        .replace(/(\$\{[^}]+\}|\d+) shell(s)? still running/g, "$1 个 shell 仍在运行")
        .replace(/Session recap/g, "会话回顾")
        .replace(/Generating recap/g, "正在生成会话回顾")
        .replace(/Recapping conversation/g, "正在回顾会话");
    return translated;
}

function shouldSkipTranslationRule(rule) {
    return rule && (rule.skipPatch === true || rule.skipPatch === "model-prompt-contract");
}

function installStatuslinePromptPathGuard() {
    const source =
        "Your job is to create or update the statusLine command in the user's Claude Code settings.\n\nWhen asked to convert the user's shell PS1 configuration, follow these steps:";
    const replacement =
        "Your job is to create or update the statusLine command in the user's Claude Code settings.\n\nPath handling for tools:\n- Use shell-relative paths exactly as written when calling tools: ~/.zshrc, ~/.bashrc, ~/.bash_profile, ~/.profile, and ~/.claude/settings.json.\n- Never invent or guess an absolute /Users/... path; the host resolves ~ for the current user.\n\nWhen asked to convert the user's shell PS1 configuration, follow these steps:";
    tryReplace(source, replacement);
}

function installStatuslineCommandPromptPathGuard() {
    const guard =
        " CRITICAL TOOL PATH RULE: use only ~/.zshrc, ~/.bashrc, ~/.bash_profile, ~/.profile, and ~/.claude/settings.json when calling Read, Edit, or Write; never use an absolute /Users/... path.";
    tryRegexReplace(
        /`Create an \$\{([^}]+)\} with subagent_type "statusline-setup" and the prompt "\$\{([^}]+)\}"`/g,
        (match, agentExpr, promptExpr) => {
            if (match.includes("CRITICAL TOOL PATH RULE")) {
                return match;
            }
            return (
                "`Create an ${" +
                agentExpr +
                '} with subagent_type "statusline-setup" and the prompt "${' +
                promptExpr +
                "}" +
                guard +
                '"`'
            );
        }
    );
}

function installDurationFormatterLocalization() {
    const signature = /function\s+[A-Za-z0-9_$]+\([^)]*\)\{if\([A-Za-z0-9_$]+<60000\)/g;
    let match;

    while ((match = signature.exec(s)) !== null) {
        const fnStart = match.index;
        const bodyStart = s.indexOf("{", fnStart);
        if (bodyStart === -1) continue;

        let depth = 0;
        let fnEnd = -1;
        for (let i = bodyStart; i < s.length; i++) {
            if (s[i] === "{") depth++;
            else if (s[i] === "}") depth--;
            if (depth === 0) {
                fnEnd = i;
                break;
            }
        }
        if (fnEnd === -1) continue;

        let fn = s.slice(fnStart, fnEnd + 1);
        if (!fn.includes("mostSignificantOnly") || !fn.includes("toFixed(1)") || !fn.includes("Math.floor")) {
            continue;
        }

        const localized = fn
            .replace(/"0s"/g, '"0秒"')
            .replace(/}d\s+\$\{/g, "}天${")
            .replace(/}h\s+\$\{/g, "}时${")
            .replace(/}m\s+\$\{/g, "}分${")
            .replace(/}d/g, "}天")
            .replace(/}h/g, "}时")
            .replace(/}m/g, "}分")
            .replace(/}s/g, "}秒");

        if (localized !== fn) {
            s = s.slice(0, fnStart) + localized + s.slice(fnEnd + 1);
            count++;
            signature.lastIndex = fnStart + localized.length;
        }
    }
}

function installIssue80VisibleResidueLocalization() {
    // Dynamic UI fragments from Claude Code 2.1.153: keep these structural so
    // broad shards like "Install the " and "Set model to " do not leak into prompts.
    tryRegexReplace(
        /([A-Za-z0-9_$]+(?:\.default)?)\.createElement\(([^,]+),null,"Install the ",\1\.createElement\(\2,\{color:"ide"\},([A-Za-z0-9_$]+)\)," plugin from the JetBrains Marketplace:"," ",\1\.createElement\(\2,\{bold:!0\},"https:\/\/docs\.claude\.com\/s\/claude-code-jetbrains"\)\)/g,
        (match, factory, component, ideName) =>
            `${factory}.createElement(${component},null,"从 JetBrains Marketplace 安装 ",${factory}.createElement(${component},{color:"ide"},${ideName})," 插件："," ",${factory}.createElement(${component},{bold:!0},"https://docs.claude.com/s/claude-code-jetbrains"))`
    );

    tryRegexReplace(
        /let ([A-Za-z0-9_$]+)=`Set model to \$\{([^}]+)\}\$\{([^}]+)\?" and saved as your default for new sessions":" for this session only"\}`/g,
        (match, messageVar, modelExpr, defaultExpr) =>
            `let ${messageVar}=\`已切换模型为 \${${modelExpr}}\${${defaultExpr}?"，并已保存为新会话默认模型":"（仅本次会话）"}\``
    );

    tryRegexReplace(
        /(\blet\s+|,)([A-Za-z0-9_$]+)=`Model set to \$\{([^}]+)\}\$\{([^}]+)\?" and saved as your default for new sessions":" for this session only"\}`/g,
        (match, prefix, messageVar, modelExpr, defaultExpr) =>
            `${prefix}${messageVar}=\`已切换模型为 \${${modelExpr}}\${${defaultExpr}?"，并已保存为新会话默认模型":"（仅本次会话）"}\``
    );

    tryRegexReplace(
        /([A-Za-z0-9_$]+)\(`Set model to \$\{([^}]+)\}`\)/g,
        (match, notifyFn, modelExpr) => `${notifyFn}(\`已切换模型为 \${${modelExpr}}\`)`
    );

    tryRegexReplace(
        /return`Review the current diff for correctness bugs and reuse\/simplification\/efficiency cleanups at the given effort level \(low\/medium: fewer, high-confidence findings; high\\u2192max: broader coverage, may include uncertain findings\$\{([\s\S]*?)\}\)\. Pass --comment to post findings as inline PR comments, or --fix to apply the findings to the working tree after the review\.`/g,
        (match, ultraExpr) => {
            const localizedUltraExpr = ultraExpr
                .replace(/; ultra: deep multi-agent review in the cloud/g, "；ultra：云端深度多 Agent review")
                .replace(/ \(requires claude\.ai account access\)/g, "（需要 claude.ai 账号权限）");
            return `return\`审查当前 diff 的正确性问题，以及复用性、简化和效率改进；按指定 effort 级别执行（low/medium：只报更少、更高置信的问题；high→max：覆盖更广，可能包含不确定问题\${${localizedUltraExpr}}）。传 --comment 可将发现发布为 PR 行内评论，传 --fix 可在 review 后把发现应用到工作区。\``;
        }
    );
}

function installEffortAndWorkflowFooterLocalization() {
    tryRegexReplace(
        /`\$\{([^`]+?)\} to adjust \\xB7 \$\{([^`]+?)\} to confirm \\xB7 \$\{([^`]+?)\} to cancel`/g,
        (match, adjustKeys, confirmKeys, cancelKeys) =>
            `\`\${${adjustKeys}} 调整 · \${${confirmKeys}} 确认 · \${${cancelKeys}} 取消\``
    );

    tryRegexReplace(
        /([A-Za-z0-9_$]+)\.createElement\(([A-Za-z0-9_$]+),null,\1\.createElement\(([A-Za-z0-9_$]+),\{chord:\["left","right"\],action:"adjust"\}\),\1\.createElement\(\3,\{chord:"enter",action:"confirm"\}\),\1\.createElement\(\3,\{chord:"escape",action:"cancel"\}\)\)/g,
        (match, factory, wrapper) =>
            `${factory}.createElement(${wrapper},null,"←/→ 调整 · Enter 确认 · Esc 取消")`
    );

    tryRegexReplace(
        /(?:[A-Za-z0-9_$]+\.)?[A-Za-z0-9_$]+\.createElement\(([A-Za-z0-9_$]+),\{chord:"escape",action:"close"\}\)/g,
        () => '"Esc 关闭"'
    );
}

function installCommonVisibleResidueLocalization() {
    tryRegexReplace(
        /([A-Za-z0-9_$]+(?:\.default)?)\.createElement\(([A-Za-z0-9_$]+),null,\1\.createElement\(([A-Za-z0-9_$]+),\{chord:"enter",action:"confirm"\}\),\1\.createElement\(\3,\{chord:"escape",action:"cancel"\}\)\)/g,
        (match, factory, wrapper) =>
            `${factory}.createElement(${wrapper},null,"Enter 确认","Esc 取消")`
    );

    tryRegexReplace(
        /([A-Za-z0-9_$]+(?:\.default)?)\.createElement\(([A-Za-z0-9_$]+),null,\1\.createElement\(([A-Za-z0-9_$]+),\{chord:"enter",action:"confirm"\}\),\1\.createElement\([A-Za-z0-9_$]+,\{action:"confirm:no",context:"Confirmation",fallback:"Esc",description:"cancel"\}\)\)/g,
        (match, factory, wrapper) =>
            `${factory}.createElement(${wrapper},null,"Enter 确认","Esc 取消")`
    );

    tryRegexReplace(/" for agents"/g, () => '" 查看 Agent"');
    tryRegexReplace(/"for agents"/g, () => '"查看 Agent"');
    tryRegexReplace(/"again "/g, () => '"再次 "');
}

function installWorkflowLifecycleResidueLocalization() {
    tryRegexReplace(
        /`Dynamic workflow requested for this turn\$\{([A-Za-z0-9_$]+)\?` \\xB7 \$\{\1\} to ignore`:""\}`/g,
        (match, keyHint) =>
            "`本轮已请求动态工作流${" + keyHint + "?` · ${" + keyHint + "} 忽略`:\"\"}`"
    );

    tryRegexReplace(
        /`Ultracode keyword ignored for this prompt\$\{([A-Za-z0-9_$]+)\?` \\xB7 \$\{\1\} to undo`:""\}`/g,
        (match, keyHint) =>
            "`已忽略本条提示词中的 Ultracode 关键词${" + keyHint + "?` · ${" + keyHint + "} 撤销`:\"\"}`"
    );
}

function installCli226DisplayDeltaLocalization() {
    // The `action` prop on the chord hint is display copy. Keep unrelated raw
    // action/state strings untouched by requiring the complete `b` chord shape.
    tryRegexReplace(
        /(\{chord:"b",action:)"mark bad"(\})/g,
        (match, prefix, suffix) => `${prefix}"标记为不良"${suffix}`
    );

    // Claude Code 2.1.226's q9v startup-warning builder. This is intentionally
    // an exact whole-function anchor: its branch conditions, dynamic model and
    // window expressions, setting/env identifiers, and control flow stay byte
    // for byte identical; only the user-visible literals are localized.
    const unknownModelNoticeSource = 'function q9v(e,t,r){let{source:n,window:o}=Nq(e,t,r);if(n!=="unknown-model")return null;let i=Jmf(e),s=te.CLAUDE_CODE_MAX_CONTEXT_TOKENS;if(i&&s!==void 0&&s>0)return null;let a=[];if(!Jne())a.push("append [1m] to the model name for 1M");if(i)a.push("set CLAUDE_CODE_MAX_CONTEXT_TOKENS to its real window");let l=a.length>0?`If the model accepts more, ${a.join(", or ")}; to make it recognized, `:"To make it recognized, ";return`"${e}" is not a model this version of Claude Code recognizes, so auto-compact will keep this session within ${Ua(o)} tokens (the context window it assumes). ${l}map it in the modelOverrides setting or update Claude Code; CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1 restores the previous wait-for-the-API behavior.`}';
    const unknownModelNoticeLocalized = 'function q9v(e,t,r){let{source:n,window:o}=Nq(e,t,r);if(n!=="unknown-model")return null;let i=Jmf(e),s=te.CLAUDE_CODE_MAX_CONTEXT_TOKENS;if(i&&s!==void 0&&s>0)return null;let a=[];if(!Jne())a.push("在模型名称后附加 [1m] 以启用 1M");if(i)a.push("将 CLAUDE_CODE_MAX_CONTEXT_TOKENS 设为该模型的真实窗口");let l=a.length>0?`如果模型支持更大的窗口，请${a.join("，或")}；如需让 Claude Code 识别该模型，请`:"如需让 Claude Code 识别该模型，请";return`"${e}" 不是此版本 Claude Code 可识别的模型，因此自动压缩会将本会话限制在 ${Ua(o)} 个 token 内（这是它假定的上下文窗口）。${l}在 modelOverrides 设置中映射该模型，或更新 Claude Code；设置 CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1 可恢复此前等待 API 返回的行为。`}';
    const unknownModelNoticeMatches = s.split(unknownModelNoticeSource).length - 1;
    if (unknownModelNoticeMatches === 1) {
        tryReplace(unknownModelNoticeSource, unknownModelNoticeLocalized);
    }
}

function installTurnDurationBackgroundLocalization() {
    // 状态短语 ` · ${summary} still running`：summary 已由翻译表中文化（1 个 shell / N 个 shell），
    // 这里只把模板里紧跟插值后的 still running 中文化。
    // 只匹配 `\xB7 ${...} still running` 这个唯一结构，不碰 MCP/tool 的 `'${o}' still running`。
    tryRegexReplace(
        /(\\xB7 \$\{[^}]+\}) still running/g,
        (_match, prefix) => `${prefix} 仍在运行`
    );
}

function installPastedTextProtocolRepair() {
    // 旧版补丁曾把粘贴附件协议中的 `lines]` 翻译为 `行]`，但解析器只接受英文。
    // 仅修复 Pasted text 模板生成器，使已 patch 的安装可通过再次安装原地恢复。
    tryRegexReplace(
        /(`\[Pasted text #\$\{[A-Za-z0-9_$]+\} \+\$\{[A-Za-z0-9_$]+\} )行(\]`)/g,
        (_match, prefix, suffix) => `${prefix}lines${suffix}`
    );
}

function installRunningDisplayLocalization() {
    // 只匹配 JSX children 中的进行中占位文案；工具类型映射里的 Running、
    // 状态枚举 running 以及帮助示例保持原值。
    tryRegexReplace(
        /(children:)"Running\\u2026( ?")/g,
        (_match, prefix, suffix) => `${prefix}"运行中…${suffix}`
    );
    tryRegexReplace(
        /(\?`运行中 \$\{[^}]+\}\(\$\{[^}]+\}\)\\u2026`:)"Running\\u2026"/g,
        (_match, prefix) => `${prefix}"运行中…"`
    );
}

function installVisibleLineCountLocalization() {
    // kAt() 只负责折叠内容的可见“+N lines”摘要。直接输出“行”，
    // 不触碰 Pasted text 占位符中供附件解析器使用的英文协议。
    tryRegexReplace(
        /(function [A-Za-z0-9_$]+\(([A-Za-z0-9_$]+),([A-Za-z0-9_$]+)="line"\)\{if\(\2<=0\)return"";return`)(\\u2026|…) \+\$\{\2\} \$\{[A-Za-z0-9_$]+\(\2,\3\)\}(`\})/g,
        (_match, prefix, countValue, _unit, ellipsis, suffix) => `${prefix}${ellipsis} +\${${countValue}} 行${suffix}`
    );
}

function installCli233DisplayResidueLocalization() {
    // 2.1.233 的流响应停滞提示拆成 JSX children 数组，时间值为动态插值，
    // 因此不能由静态翻译表覆盖。仅替换完整的三段可见文案结构。
    tryRegexReplace(/"Waiting for API response"/g, () => '"等待 API 响应"');
    tryRegexReplace(
        /children:\[" \\xB7 will retry in ",([A-Za-z0-9_$]+)," \\xB7 check your network"\]/g,
        (_match, remaining) => `children:[" \\xB7 将在 ",${remaining}," 后重试 \\xB7 请检查网络"]`
    );

    // 新版展开提示从快捷键绑定动态生成：`(${shortcut} to expand)`。
    tryRegexReplace(/\$\{([A-Za-z0-9_$]+)\} to expand/g, (_match, shortcut) => `\${${shortcut}} 展开`);

    // yS() 是 /goal 等状态卡片复用的展开辅助组件。使用它的完整函数结构作为锚点，
    // 仅改动该组件提供给 Chord 的可见 action，避免触及其他 action:"expand"。
    tryRegexReplace(
        /(function [A-Za-z0-9_$]+\(\)\{let [A-Za-z0-9_$]+=\w+\.c\(3\),[A-Za-z0-9_$]+=\w+\.useContext\([A-Za-z0-9_$]+\),[A-Za-z0-9_$]+=\w+\.useContext\([A-Za-z0-9_$]+\),[A-Za-z0-9_$]+=ox\("app:toggleTranscript","Global","ctrl\+o"\);if\([A-Za-z0-9_$]+\|\|[A-Za-z0-9_$]+\)\{return null\}[\s\S]*?chord:[A-Za-z0-9_$]+,action:)"expand"/g,
        (_match, prefix) => `${prefix}"展开"`
    );
}

function installGoalActiveIndicatorLocalization() {
    // /goal 状态栏把命令名与状态词拼成一个可见 children 字面量。
    // 只替换位于 children 数组、后接动态时长的显示文本，不改命令名和 active 状态值。
    tryRegexReplace(
        /(children:\[[\s\S]{0,300}?)"\/goal active"(,[A-Za-z0-9_$]+\]\})/g,
        (_match, prefix, suffix) => `${prefix}"/goal 已启用"${suffix}`
    );
}

function installGoalDisplayLocalization() {
    // 2.1.233 的 /goal 状态卡片由条件表达式和动态统计拼接而成，
    // 不会命中静态翻译表；只替换完整的可见字面量，不改状态值或数据字段。
    tryRegexReplace(/"Goal could not be achieved"/g, () => '"未能达成目标"');
    tryRegexReplace(/"Goal achieved"/g, () => '"目标已达成"');
    tryRegexReplace(/"Goal not yet met\\u2026 continuing"/g, () => '"目标尚未达成…继续执行"');
    tryRegexReplace(
        /children:\["Goal: ",([A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)?)\]/g,
        (_match, condition) => `children:["目标：",${condition}]`
    );
    tryRegexReplace(
        /(case"goal_status"[\s\S]*?\.tokens!==void 0\)\{[A-Za-z0-9_$]+\.push\(`\$\{[A-Za-z0-9_$]+\} tokens`\)\})/g,
        (_match, goalStatusBlock) => goalStatusBlock.replace(/ tokens`\)\}/, " 个 token`)}")
    );
}

function installGoalCommandMessageLocalization() {
    // /goal 命令的 system/status 消息模板。fixture 取自 2.1.237 exe 原文。
    // 模板字面量内是 minify 标识符，按结构通配；case key、阈值常量与 goal 条件文本不动。
    tryRegexReplace(
        /`Goal set: \$\{([A-Za-z0-9_$]+)\}`/g,
        (_m, v) => '`目标已设置：${' + v + '}`'
    );
    tryRegexReplace(
        /`Goal cleared: \$\{([A-Za-z0-9_$]+)\}`/g,
        (_m, v) => '`目标已清除：${' + v + '}`'
    );
    tryReplace('"No goal set"', '"尚未设置目标"');
    tryRegexReplace(
        /`Goal active: \$\{([A-Za-z0-9_$]+\.condition)\} \(\$\{([A-Za-z0-9_$]+)\}\)\$\{([A-Za-z0-9_$]+)\}`/g,
        (_m, cond, iter, tail) => '`目标执行中：${' + cond + '}（${' + iter + '}）${' + tail + '}`'
    );
    tryRegexReplace(
        /`Goal condition is limited to \$\{([A-Za-z0-9_$]+)\} characters \(got \$\{([A-Za-z0-9_$]+\.length)\}\)`/g,
        (_m, limit, got) => '`目标条件的字符数限制为 ${' + limit + '} 个字符（当前 ${' + got + '} 个）`'
    );
    tryRegexReplace(
        /`Goal cleared after an unrecoverable error \(\$\{([A-Za-z0-9_$]+)\}\): "(\$\{[^`]*\})"\. Run \/goal again to continue\.`/g,
        (_m, err, cond) => '`目标已清除（由于不可恢复的错误 ${' + err + '}）："' + cond + '"。请重新运行 /goal 继续。`'
    );
}

function installBackgroundCommandNotificationLocalization() {
    // 后台命令 task-notification：jkt("Background command ") 前缀由翻译表处理，
    // 这里把 4 个状态后缀模板转中文；任务名变量保留原样。
    tryRegexReplace(
        /"\$\{([A-Za-z0-9_$]+)\}" completed\$\{([A-Za-z0-9_$]+)!==void 0\?` \(exit code \$\{([A-Za-z0-9_$]+)\}\)`:""\}/g,
        (_m, t, n1, n2) => '"${' + t + '}" 已完成${' + n1 + '!==void 0?`（退出码 ${' + n2 + '}）`:""}'
    );
    tryRegexReplace(
        /"\$\{([A-Za-z0-9_$]+)\}" failed\$\{([A-Za-z0-9_$]+)!==void 0\?` with exit code \$\{([A-Za-z0-9_$]+)\}`:""\}/g,
        (_m, t, n1, n2) => '"${' + t + '}" 失败${' + n1 + '!==void 0?`（退出码 ${' + n2 + '}）`:""}'
    );
    tryRegexReplace(
        /"\$\{([A-Za-z0-9_$]+)\}" was stopped`/g,
        (_m, t) => '"${' + t + '}" 已停止`'
    );
    tryRegexReplace(
        /"\$\{([A-Za-z0-9_$]+)\}" appears to be waiting for interactive input`/g,
        (_m, t) => '"${' + t + '}" 似乎在等待交互输入`'
    );
}

function installContextGroupingLocalization() {
    // /context 面板的来源分组标签。两个 label switch 的 case key 是内部状态枚举，
    // 只替换 return 的显示字面量；MLE 排序数组必须与 G1o 返回值同步翻译，
    // 保持 indexOf(label) 排序逻辑不破。
    tryRegexReplace(
        /case"userSettings":return"User";case"projectSettings":return"Project";case"localSettings":return"Local";case"flagSettings":return"Flag";case"policySettings":return"Managed";case"plugin":return"Plugin";case"built-in":return"Built-in";case"mcp":return"MCP";case"memoryStore":return"Memory store";case"syncedSkills":return ([A-Za-z0-9_$]+)/g,
        (_m, rpe) => 'case"userSettings":return"用户";case"projectSettings":return"项目";case"localSettings":return"本地";case"flagSettings":return"标志";case"policySettings":return"托管";case"plugin":return"插件";case"built-in":return"内置";case"mcp":return"MCP";case"memoryStore":return"记忆存储";case"syncedSkills":return ' + rpe
    );
    tryRegexReplace(
        /case"flagged":return"Flagged";case"project":return"Project";case"local":return"Local";case"user":return"User";case"enterprise":return"Enterprise";case"managed":return"Managed";case"builtin":case"dynamic":return"Built-in";case"skills":return"Skills"/g,
        () => 'case"flagged":return"已标记";case"project":return"项目";case"local":return"本地";case"user":return"用户";case"enterprise":return"企业";case"managed":return"托管";case"builtin":case"dynamic":return"内置";case"skills":return"技能"'
    );
    tryRegexReplace(/var [A-Za-z0-9_$]+="claude\.ai sync"/g, (m) => m.replace('"claude.ai sync"', '"claude.ai 同步"'));
    tryRegexReplace(
        /\["Project","User",([A-Za-z0-9_$]+),"Managed","Plugin","MCP","Built-in"\]/g,
        (_m, rpe) => '["项目","用户",' + rpe + ',"托管","插件","MCP","内置"]'
    );
    tryRegexReplace(/{dimColor:!0,children:"Available"}/g, () => '{dimColor:!0,children:"可用"}');
    tryRegexReplace(/{dimColor:!0,children:"Loaded"}/g, () => '{dimColor:!0,children:"已加载"}');
}

function installPressEnterContinuationLocalization() {
    // 权限/平台设置提示把 "Press Enter to continue/retry" 拆成 ["Press ",<jsx>.jsx(b,{bold:!0,children:"Enter"})," to ..."]
    // 三个字面量，翻译表子串匹配命中不了。按 children 结构通配 minify 标识符，
    // 只换显示文案，Enter 键名、bold 结构、jsx 调用形态原样保留。
    tryRegexReplace(
        /(children:\[)"Press ",([A-Za-z0-9_$]+\.jsx\([A-Za-z0-9_$]+,\{bold:!0,children:"Enter"\}\),)" to continue\."\]/g,
        (_m, pre, jsx) => `${pre}"按 ",${jsx}" 继续。"]`
    );
    tryRegexReplace(
        /(children:\[)"Couldn't start your trial\. Press ",([A-Za-z0-9_$]+\.jsx\([A-Za-z0-9_$]+,\{bold:!0,children:"Enter"\}\),)" to continue\."\]/g,
        (_m, pre, jsx) => `${pre}"无法开始试用。按 ",${jsx}" 继续。"]`
    );
    tryRegexReplace(
        /(children:\[)"Press ",([A-Za-z0-9_$]+\.jsx\([A-Za-z0-9_$]+,\{bold:!0,children:"Enter"\}\),)" to retry\."\]/g,
        (_m, pre, jsx) => `${pre}"按 ",${jsx}" 重试。"]`
    );
    tryRegexReplace(
        /\["Press ",([A-Za-z0-9_$]+\.[A-Za-z0-9_$]+)," again to exit"\]/g,
        (_m, key) => `["再按 ",${key}," 退出"]`
    );
}

function installStatusbarToolActivityLocalization() {
    // Thought 状态栏（进行中 Thinking / 完成 Thought）
    tryRegexReplace(/([A-Za-z0-9_$]+)\?"Thinking":"Thought"/g, (_m, v) => `${v}?"思考中":"思考"`);
    // Thought/思考时长拼接（children:[Oe," for ",ge]},"thought"）
    tryRegexReplace(
        /children:\[([A-Za-z0-9_$]+)," for ",([A-Za-z0-9_$]+)\]},"thought"/g,
        (_m, label, dur) => `children:[${label},"（",${dur},"）"]},"thought"`
    );

    // mem-search 状态栏（ye() 第三参数是固定复数 "memories"，需整体替换，先于动词对执行）
    tryRegexReplace(
        /ye\("mem-search",([A-Za-z0-9_$]+)\?"searching":"searched","memories"\)/g,
        (_m, v) => `ye("mem-search",${v}?"正在搜索":"已搜索","条记忆")`
    );

    // ye() 状态栏动词对（先长后短，短词不会命中长词的子串）
    const yeVerbs = [
        ["searching for", "searched for", "正在搜索", "已搜索"],
        ["editing", "edited", "正在编辑", "已编辑"],
        ["publishing", "published", "正在发布", "已发布"],
        ["recalling", "recalled", "正在回忆", "已回忆"],
        ["searching", "searched", "正在搜索", "已搜索"],
        ["listing", "listed", "正在列出", "已列出"],
        ["running", "ran", "正在运行", "已运行"],
        ["calling", "called", "正在调用", "已调用"],
        ["writing", "wrote", "正在写入", "已写入"],
        ["making", "made", "正在创建", "已创建"],
        ["reading", "read", "正在读取", "已读取"],
    ];
    for (const [present, past, zhPresent, zhPast] of yeVerbs) {
        tryRegexReplace(
            new RegExp(`([A-Za-z0-9_$]+)\\?"${present}":"${past}"`, "g"),
            (_m, v) => `${v}?"${zhPresent}":"${zhPast}"`
        );
    }
    tryRegexReplace(/([A-Za-z0-9_$]+)\?"REPL'ing":"REPL'd"/g, (_m, v) => `${v}?"正在REPL":"已REPL"`);

    // tool activity 摘要动词（xWo / team / 展开版共用 VAR===0 结构）
    const activityVerbs = [
        ["Searching for", "searching for", "Searched for", "searched for", "正在搜索", "已搜索"],
        ["Recalling", "recalling", "Recalled", "recalled", "正在回忆", "已回忆"],
        ["Searching", "searching", "Searched", "searched", "正在搜索", "已搜索"],
        ["Writing", "writing", "Wrote", "wrote", "正在写入", "已写入"],
        ["Reading", "reading", "Read", "read", "正在读取", "已读取"],
        ["Listing", "listing", "Listed", "listed", "正在列出", "已列出"],
    ];
    for (const [present, lower, past, pastLower, zhPresent, zhPast] of activityVerbs) {
        tryRegexReplace(
            new RegExp(
                `([A-Za-z0-9_$]+)===0\\?"${present}":"${lower}":\\1===0\\?"${past}":"${pastLower}"`,
                "g"
            ),
            (_m, v) => `${v}===0?"${zhPresent}":"${zhPresent}":${v}===0?"${zhPast}":"${zhPast}"`
        );
    }
    // 224+ tool activity / teamMemory 摘要动词：条件从 VAR===0 改为 VAR?X.length===0?，
    // 三元链泛化匹配（VAR?COND?"Present":"lower":COND?"Past":"pastLower"），避免小写动词残留
    const activityVerbs224 = [
        ["Searching for", "searching for", "Searched for", "searched for", "正在搜索", "已搜索"],
        ["Searching", "searching", "Searched", "searched", "正在搜索", "已搜索"],
        ["Recalling", "recalling", "Recalled", "recalled", "正在回忆", "已回忆"],
        ["Writing", "writing", "Wrote", "wrote", "正在写入", "已写入"],
        ["Reading", "reading", "Read", "read", "正在读取", "已读取"],
        ["Listing", "listing", "Listed", "listed", "正在列出", "已列出"],
    ];
    for (const [present, lower, past, pastLower, zhPresent, zhPast] of activityVerbs224) {
        tryRegexReplace(
            new RegExp(
                `([A-Za-z0-9_$]+)\\?([^"]*?)\\?"${present}":"${lower}":\\2\\?"${past}":"${pastLower}"`,
                "g"
            ),
            (_m, v, cond) => `${v}?${cond}?"${zhPresent}":"${zhPresent}":${cond}?"${zhPast}":"${zhPast}"`
        );
    }
    // 相关记忆列表（read→正在回忆/已回忆，write→正在记住/已记住）
    tryRegexReplace(
        /([A-Za-z0-9_$]+)\?"Recalling":"Recalled":\1\?"Remembering":"Remembered"/g,
        (_m, v) => `${v}?"正在回忆":"已回忆":${v}?"正在记住":"已记住"`
    );

    // 状态栏数量名词（children: X})}," ",X===1?"单数":"复数"）
    const statusNouns = [
        ["file", "files", "个文件"],
        ["pattern", "patterns", "个匹配"],
        ["memory", "memories", "条记忆"],
        ["tool", "tools", "个工具"],
        ["agent", "agents", "个 Agent"],
        ["time", "times", "次"],
        ["directory", "directories", "个目录"],
    ];
    for (const [singular, plural, zh] of statusNouns) {
        tryRegexReplace(
            new RegExp(`children:([A-Za-z0-9_$]+)\\)\\}," ",\\1===1\\?"${singular}":"${plural}"`, "g"),
            (_m, v) => `children:${v})}," ",${v}===1?"${zh}":"${zh}"`
        );
    }
    // 通用数量名词（覆盖 children 数组结构、模板、属性访问等，如 uncommitted/occurrences 残留）
    const pluralNouns = [
        ["file", "files", "个文件"],
        ["pattern", "patterns", "个匹配"],
        ["memory", "memories", "条记忆"],
        ["tool", "tools", "个工具"],
        ["agent", "agents", "个 Agent"],
        ["time", "times", "次"],
        ["directory", "directories", "个目录"],
    ];
    for (const [singular, plural, zh] of pluralNouns) {
        tryRegexReplace(
            new RegExp(`([A-Za-z0-9_$]+(?:\\.[A-Za-z0-9_$]+)?)===1\\?"${singular}":"${plural}"`, "g"),
            (_m, v) => `${v}===1?"${zh}":"${zh}"`
        );
    }
    // scratchpad / bash / team 记忆（" X"," " 分隔的特殊结构）
    tryRegexReplace(/" scratchpad"," ",([A-Za-z0-9_$]+)===1\?"edit":"edits"/g, () => '" 个 scratchpad 修改"');
    tryRegexReplace(/" shell"," ",([A-Za-z0-9_$]+)===1\?"command":"commands"/g, () => '" 个 shell 命令"');
    tryRegexReplace(/" team"," ",([A-Za-z0-9_$]+)===1\?"memory":"memories"/g, () => '" 条团队记忆"');

    // tool activity 摘要内的数量名词（`${verb} ${count} ${count===1?"file":"files"}`）
    const activityNouns = [
        ["file", "files", "个文件"],
        ["pattern", "patterns", "个匹配"],
        ["memory", "memories", "条记忆"],
        ["time", "times", "次"],
        ["directory", "directories", "个目录"],
    ];
    for (const [singular, plural, zh] of activityNouns) {
        tryRegexReplace(
            new RegExp(
                `\\$\\{([A-Za-z0-9_$]+)\\}\\s+\\$\\{([A-Za-z0-9_$]+)===1\\?"${singular}":"${plural}"\\}`,
                "g"
            ),
            (_m, count) => `\${${count}} ${zh}`
        );
    }
    // team 记忆（mem-search 固定复数，模板 `${X} team memories`）
    tryRegexReplace(/\$\{([A-Za-z0-9_$]+)\} team memories\`/g, (_m, verb) => `\${${verb}} 条团队记忆\``);
    // team 记忆（mem-read 有数量，`team ${X===1?"memory":"memories"}`）
    tryRegexReplace(/team \$\{([A-Za-z0-9_$]+)===1\?"memory":"memories"\}/g, () => "条团队记忆");
    // team memory 固定复数（224+ 无 team 前缀的 `${X} memories` 模板）
    tryRegexReplace(/\$\{([A-Za-z0-9_$]+)\} memories\`/g, (_m, verb) => `\${${verb}} 条记忆\``);
    // team 记忆（224+ 数量分支：memory/memories 可能已被数量名词规则先翻译成"条记忆"，覆盖两态）
    tryRegexReplace(
        /team \$\{([A-Za-z0-9_$]+)===1\?(?:"memory":"memories"|"条记忆":"条记忆")\}/g,
        () => "条团队记忆"
    );

    // git / PR 动词对象
    tryReplace(
        'let Oe={committed:"committed",amended:"amended commit","cherry-picked":"cherry-picked"}',
        'let Oe={committed:"已提交",amended:"已修订提交","cherry-picked":"已拣选提交"}'
    );
    tryReplace('ye("push","pushed to",', 'ye("push","推送到",');
    tryReplace('let Oe={merged:"merged",rebased:"rebased onto"}', 'let Oe={merged:"已合并",rebased:"已变基到"}');
    tryReplace(
        'let Oe={created:"created",edited:"edited",merged:"merged",commented:"commented on",closed:"closed",ready:"marked ready",draft:"marked draft","auto-merge-enabled":"enabled auto-merge on","auto-merge-disabled":"disabled auto-merge on"}',
        'let Oe={created:"已创建",edited:"已编辑",merged:"已合并",commented:"评论了",closed:"已关闭",ready:"已标记就绪",draft:"已标记草稿","auto-merge-enabled":"已开启自动合并","auto-merge-disabled":"已关闭自动合并"}'
    );

    // Hook 状态行（两种结构）
    tryRegexReplace(
        /"Ran ",([A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)+)," ","PreToolUse ",\1===1\?"hook":"hooks"/g,
        (_m, c) => `"已运行 ",${c}," 个 PreToolUse Hook"`
    );
    tryRegexReplace(
        /"Ran ",([A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)+)," PreToolUse"," ",\1===1\?"hook":"hooks"/g,
        (_m, c) => `"已运行 ",${c}," 个 PreToolUse Hook"`
    );
    // 224+ 无 Ran 前缀的 hook 状态行（active 分支 Oe("hooks","ran",...) 推送结构）
    tryRegexReplace(
        /children:([A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)?)\}\)," PreToolUse"," ",\1===1\?"hook":"hooks"/g,
        (_m, c) => `children:${c}})," 个 PreToolUse Hook"`
    );

    // 224+ memoized Hook 状态行（React JSX transform 生成缓存分支，字面量与直接 JSX 分离）
    // hook/hooks 数量名词（覆盖无 Ran 前缀的直接 JSX 与 memo 分支定义）
    tryRegexReplace(
        /([A-Za-z0-9_$]+)===1\?"hook":"hooks"/g,
        (_m, count) => `${count}===1?"个 Hook":"个 Hook"`
    );
    // memo 分支 "Ran " 字面量（children:[...,"Ran ",count," ",hookLabel," ",noun,""]）
    // 词序纠正：输出 "已运行 <count> 个 <hookLabel> Hook"（防止出现 "已运行 1 stop 个 Hook" 的错误顺序）
    tryRegexReplace(
        /"Ran ",([A-Za-z0-9_$]+)," ",([A-Za-z0-9_$]+(?:\.[A-Za-z0-9_$]+)?)," ",([A-Za-z0-9_$]+),""/g,
        (_m, count, label) => `"已运行 ",${count}," 个 ",${label}," Hook",""`
    );
}

function installConfigRemainderLocalization() {
    // /config 配置项 label（结构 patch，避免翻译表混杂句子）
    const configLabels = [
        ["Theme", "主题"],
        ["Local notifications", "本地通知"],
        ["Output style", "输出风格"],
        ["Language", "语言"],
        ["Model", "模型"],
        ["Artifacts", "工件"],
        ["Ultracode keyword trigger", "Ultracode 关键词触发"],
        ["Worktree base ref", "Worktree 基准引用"],
        ["Skip the /copy picker", "跳过 /copy 选择器"],
        ["Open agents view by default", "默认打开 Agent 视图"],
        ["Question auto-continue timeout", "问题自动继续超时"],
        ["Precompute compaction", "预计算压缩"],
        ["Show message timestamps", "显示消息时间戳"],
        ["Push when actions required", "需要操作时推送"],
        ["Push when Claude decides", "Claude 决定时推送"],
    ];
    for (const [en, zh] of configLabels) {
        tryReplace(`label:"${en}"`, `label:"${zh}"`);
    }
    // Teammate mode：label 是三元分支里的字面量，不用 `label:` 前缀
    tryReplace(':"Teammate mode"', ':"协作模式"');
    tryRegexReplace(/`Teammate mode \[overridden: \$\{([^}]+)\}\]`/g, (_m, expr) => `\`协作模式 [已被覆盖：\${${expr}}]\``);
    tryReplace('pTr("Auto-scroll",', 'pTr("自动滚动",');
    tryReplace('pTr("Show last response in external editor",', 'pTr("在外部编辑器中显示最后回复",');
    tryReplace('"For custom themes, use /theme."', '"自定义主题请使用 /theme。"');
    tryReplace('"For custom styles, open /config."', '"自定义样式请打开 /config。"');
    tryReplace('"For a specific model ID, use /model."', '"指定模型 ID 请使用 /model。"');
    tryReplace('"For a specific model ID, open /config."', '"指定模型 ID 请打开 /config。"');
    tryReplace(
        `"Any language name or ISO code (e.g. 'ja'); use 'default' for English."`,
        `"任意语言名称或 ISO 代码（如 'ja'）；'default' 表示英语。"`
    );
    tryRegexReplace(/\(disabled in safe mode\)/g, () => "（安全模式下禁用）");
}

function installErrorTemplateLocalization() {
    // CommandExec 状态描述模板（$sg 内 return 语句，均以反引号闭合，不会误伤日志文本）
    tryRegexReplace(/\`failed with exit code \$\{([^}]+)\}\`/g, (_m, v) => `\`失败，退出码 \${${v}}\``);
    tryRegexReplace(/\`failed with \$\{([^}]+)\}\`/g, (_m, v) => `\`失败：\${${v}}\``);
    tryRegexReplace(
        /\`was killed with \$\{([^}]+)\} \(\$\{([^}]+)\}\)\`/g,
        (_m, sig, desc) => `\`被终止（\${${sig}}：\${${desc}}）\``
    );
    tryRegexReplace(/\`timed out after \$\{([^}]+)\} milliseconds\`/g, (_m, t) => `\`超时（\${${t}} 毫秒）\``);
}

function installCli233ResidualUILocalization() {
    // 2.1.233 六个用户报告残留 + 主动扫描到的同族动态 UI 文案。
    // 全部是给用户看的显示文案；API/环境变量名（stop_hook_active、
    // CLAUDE_CODE_STOP_HOOK_BLOCK_CAP、--model）和状态枚举（idle/attached）保持英文。

    // 1. Null-bytes 错误只改 UI 可显示的 Error 文案，不触碰 makeErrorWithCode 内部 API
    tryRegexReplace(
        /throw Error\("Path contains null bytes"\)/g,
        () => 'throw Error("路径包含空字节")'
    );

    // 2. 中断回合的追问后缀（已中断 已汉化，这里补问句）
    tryRegexReplace(
        /children:"\\xB7 What should Claude do instead\?"/g,
        () => 'children:"\\xB7 Claude 应该怎么做？"'
    );

    // 3. 模型选择器 fallback 文案（保留 --model 选项描述）
    tryReplace(
        '"Switch between Claude models. Your pick becomes the default for new sessions. For other/previous model names, specify with --model."',
        '"切换 Claude 模型。你的选择会作为新会话的默认模型。其他/之前的模型名称请用 --model 指定。"'
    );

    // 4. Stop/SubagentStop Hook 阻断警告（分号转义模板与字符串拼接两段）
    tryRegexReplace(
        /`A hook blocked the turn from ending \$\{([^}]+)\} consecutive times \\u2014 overriding and ending turn\. `\+"For Stop\/SubagentStop hooks, check stop_hook_active in the input and return success while it's true\. Set CLAUDE_CODE_STOP_HOOK_BLOCK_CAP to raise this limit\."/g,
        (_m, oa) =>
            "`一个 Hook 已连续 ${" + oa + "} 次阻止回合结束 \\u2014 正在覆盖并结束回合。 `+" +
            '"对于 Stop/SubagentStop Hook，请检查输入中的 stop_hook_active，并在其值为 true 时返回成功。设置 CLAUDE_CODE_STOP_HOOK_BLOCK_CAP 可提高此上限。"'
    );

    // 5. 状态栏上下文占用/压缩提示（保留动态百分比和 /compact 命令名）
    tryRegexReplace(
        /\$\{100-([^}]+)\}% context used/g,
        (_m, v) => `\${100-${v}}% 上下文已使用`
    );
    tryRegexReplace(
        /\$\{([^}]+)\}% until auto-compact/g,
        (_m, v) => `\${${v}}% 后自动压缩`
    );
    tryRegexReplace(
        /Context low \(\$\{([^}]+)\}% remaining\)/g,
        (_m, v) => `上下文不足（剩余 \${${v}}%）`
    );
    // 注意：此替换须避免命中 NCw 拼接的 `${NCw} \xB7 ${psc}`（第5前序部分），
    // 这里只改独立存在的 `\xB7 Run /compact ...` 模板尾段。
    tryRegexReplace(
        /\\xB7 Run \/compact to compact & continue/g,
        () => " \\xB7 运行 /compact 压缩并继续"
    );

    // 6. thinking 状态动词集（函数名与阈值常量名随上游 minify 漂移，按结构匹配；
    //    只替换返回的英文字符串，保留函数名、参数与阈值比较逻辑，不改变内部判断）
    tryRegexReplace(
        /function ([A-Za-z_$][\w$]*)\(([^)]+)\)\{if\(\2>=([A-Za-z_$][\w$]*)\)return"almost done thinking";if\(\2>=([A-Za-z_$][\w$]*)\)return"thinking some more";if\(\2>=([A-Za-z_$][\w$]*)\)return"thinking more";if\(\2>=([A-Za-z_$][\w$]*)\)return"still thinking";return"thinking"\}/g,
        (_m, fn, e, f, ys, ny, ly) =>
            `function ${fn}(${e}){if(${e}>=${f})return"即将完成思考";if(${e}>=${ys})return"继续思考中";if(${e}>=${ny})return"深入思考";if(${e}>=${ly})return"仍在思考";return"思考中"}`
    );

    // 7. effort 后缀模板（保留 effort level API 值；gge/D2e 只做取值）
    tryRegexReplace(
        /` with \$\{([^}]+)\} effort`/g,
        (_m, expr) => "`（思考强度 ${" + expr + "}）`"
    );

    // 8. 工具/思考活动时长模板（la 时长已汉化,只改前缀与后缀）
    tryRegexReplace(
        /`running tool for \$\{la\(([^}]+)\)\}`/g,
        (_m, ms) => "`正在运行工具，已用 ${la(" + ms + ")}`"
    );
    tryRegexReplace(
        /`ran tool for \$\{la\(([^}]+)\)\}`/g,
        (_m, ms) => "`已完成工具，用时 ${la(" + ms + ")}`"
    );
    tryRegexReplace(
        /`thought for \$\{Math\.max\(1,Math\.round\(([^}]+)\/1000\)\)\}s`/g,
        (_m, ms) => "`已思考 ${Math.max(1,Math.round(" + ms + "/1000))} 秒`"
    );

    // 9. remoting banner 连接/重连提示（ReactNode + 模板拼接）
    tryRegexReplace(/Xt\.yellow\("Connecting"\)/g, () => 'Xt.yellow("连接中")');
    tryRegexReplace(/Xt\.yellow\("Reconnecting"\)/g, () => 'Xt.yellow("重新连接")');
    tryRegexReplace(/`retrying in \$\{([^}]+)\}`/g, (_m, v) => `\`\${${v}} 后重试\``);
    tryRegexReplace(/`disconnected \$\{([^}]+)\}`/g, (_m, v) => `\`已断开 \${${v}}\``);

    // 10. remoting 状态赋值的可见文案（只改字符串值,状态键 idle/attached 不变）
    // 匹配 updateIdleStatus/setAttached 内紧凑赋值,保留逗号与变量 i
    tryRegexReplace(/,i="Ready",/g, () => ',i="就绪",');
    tryRegexReplace(/,i="Connected",/g, () => ',i="已连接",');

    // 11. FleetView 任务状态显示映射（键是状态枚举,值是给用户的显示文案）
    tryReplace(
        ',E4t={review:"Ready for review",blocked:"Needs input",working:"Working",done:"Completed"}',
        ',E4t={review:"待审核",blocked:"需要输入",working:"进行中",done:"已完成"}'
    );
    tryReplace(
        ',mKw={review:"",blocked:"Sessions that have a question or need your decision land here",working:"Sessions Claude is actively working on \\u2014 they keep running even if you close the terminal",done:"Finished sessions wait here for you to review"}',
        ',mKw={review:"",blocked:"需要你决策的会话会出现在这里",working:"Claude 正在积极处理的会话 \\u2014 关闭终端后仍在运行",done:"已完成的会话留在这里等待你查看"}'
    );

    // 12. resume 提示（resumeHint 写入 stdout 的模板；保留 claude --resume/--worktree 命令形态）
    // cli.js 中该模板的换行可能是真实换行 U+000A（JSON.stringify 显示为 \n）或字面 `\n`
    // （反斜杠+n 两字符），两种形态都匹配。
    tryRegexReplace(
        /`(\n|\\n)Resume this session with:(\n|\\n)claude \$\{([^}]+)\}--resume \$\{([^}]+)\}(\n|\\n)`/g,
        (_m, _a, _b, o, r, _c) => `\`\\n请使用以下命令继续会话：\\nclaude \${${o}}--resume \${${r}}\\n\``
    );

    // 13. /rewind 回滚提示的多段 push 数组（保留 --- 分隔线、/rewind 命令名与 ${e.ref} 变量）
    tryReplace(
        '"Don\'t want these changes? Resume this session (above), then run"',
        '"不想保留这些更改？请在上方恢复会话，然后运行"'
    );
    tryReplace(
        '"`/rewind` to roll back the turn\'s tool edits (bash-made changes"',
        '"`/rewind` 回滚本次回合的工具编辑（bash 产生的更改"'
    );
    tryReplace(
        "`excluded). ${e.ref} holds a full snapshot until this session's`",
        "`（已排除）。${e.ref} 存储了完整快照，直到本次会话的`"
    );
    tryReplace(
        '"next checkpoint, or for up to ~2 weeks."',
        '"下一个检查点，或最长约 2 周。"'
    );

    // 14. remote-control 恢复/环境保留提示（保留 claude remote-control、--continue、--session-id 命令形态）
    tryRegexReplace(
        /`Resume this session by running \\`claude remote-control \$\{e\.ownsPointer\?"--continue":`--session-id \$\{l\}`\}\\\``/g,
        () => '`请运行 \\`claude remote-control ${e.ownsPointer?"--continue":`--session-id ${l}`}\\` 恢复本会话`'
    );
    tryReplace(
        '"Environment preserved. Restart `claude remote-control` to reconnect existing sessions."',
        '"环境已保留。请重新启动 `claude remote-control` 以重新连接现有会话。"'
    );

    // 15. auto_mode_pregather 上下文标签（显示在 context 标签中）
    tryReplace(
        '"CLAUDE.md files and project docs"',
        '"CLAUDE.md 文件与项目文档"'
    );
    tryReplace(
        '"Repo facts"',
        '"仓库事实"'
    );
    tryReplace(
        '"Existing auto-mode settings (selective read)"',
        '"现有自动模式设置（选择性读取）"'
    );
    tryReplace(
        '"Recent usage in this project (names only)"',
        '"此项目的最近使用情况（仅名称）"'
    );
    tryReplace(
        '"Config scans (names only)"',
        '"配置扫描（仅名称）"'
    );
    tryReplace(
        '"Shipped default auto-mode rule labels"',
        '"随附的默认自动模式规则标签"'
    );

    // 16. hook 配置 schema 描述（/hooks 配置帮助文本）
    tryReplace(
        '"Custom status message to display in spinner while hook runs"',
        '"Hook 运行时在 spinner 显示的自定义状态消息"'
    );
    tryReplace(
        '"If true, hook runs once and is removed after execution"',
        '"若为 true，Hook 只运行一次，执行后即移除"'
    );

    // 17. 新功能公告标题与遥测确认文案
    tryReplace(
        '"Feature of the week:"',
        '"本周功能："'
    );
    tryReplace(
        '"Help improve our AI models "',
        '"帮助改进我们的 AI 模型 "'
    );

    // 18. memory 保存说明标题属于模型提示词契约（cli-translations.json 已标记
    //     skipPatch:"model-prompt-contract"），不得在此硬编码翻译，否则会绕过标记
    //     并触发 upstream-compat 的 system_prompt_memory_contract preserve 失败。

    // 19. 遥测开关相关（无尾空格标题、隐私选项 label、日志；\xB7 为源码字面转义）
    tryReplace(
        '"Help improve our AI models"',
        '"帮助改进我们的 AI 模型"'
    );
    tryReplace(
        '"Accept terms \\xB7 Help improve our AI models: ON"',
        '"接受条款 \\xB7 帮助改进我们的 AI 模型：开"'
    );
    tryReplace(
        '"Accept terms \\xB7 Help improve our AI models: OFF"',
        '"接受条款 \\xB7 帮助改进我们的 AI 模型：关"'
    );
    tryReplace(
        '"Accept terms \\xB7 Help improve our AI models: OFF (for emails with your domain)"',
        '"接受条款 \\xB7 帮助改进我们的 AI 模型：关（针对你域名的邮件）"'
    );
}

// === 特殊 patch（基于精确代码模式匹配，安全）===
// 这些 patch 匹配非常特定的代码模式，不会误伤标识符

// 0. /statusline 内部 agent prompt 防守：第三方模型容易猜错 /Users/... 绝对路径。
// 保持英文，不做中文化；只强化工具路径契约。
// 每个结构化 patch 独立执行，单个失败只跳过该项（记日志），其余照常。
for (const step of [
    installStatuslinePromptPathGuard,
    installStatuslineCommandPromptPathGuard,
    installDurationFormatterLocalization,
    installIssue80VisibleResidueLocalization,
    installEffortAndWorkflowFooterLocalization,
    installCommonVisibleResidueLocalization,
    installWorkflowLifecycleResidueLocalization,
    installCli226DisplayDeltaLocalization,
    installTurnDurationBackgroundLocalization,
    installPastedTextProtocolRepair,
    installRunningDisplayLocalization,
    installVisibleLineCountLocalization,
    installCli233DisplayResidueLocalization,
    installGoalActiveIndicatorLocalization,
    installGoalDisplayLocalization,
    installGoalCommandMessageLocalization,
    installBackgroundCommandNotificationLocalization,
    installContextGroupingLocalization,
    installPressEnterContinuationLocalization,
    installStatusbarToolActivityLocalization,
    installConfigRemainderLocalization,
    installErrorTemplateLocalization,
    installCli233ResidualUILocalization,
]) {
    try {
        step();
    } catch (error) {
        logEvent(`structural-step-skipped ${step.name}: ${error.message}`);
    }
}

// 1. 过去式状态动词数组（兼容包含 Thought 的新版词族）
tryRegexReplace(
    /\["Baked","Brewed","Churned","Cogitated","Cooked","Crunched","Saut(?:\u00e9|\\u00e9|\\xE9)ed","Worked"\]/g,
    () => '["烘焙了","沏了","翻搅了","琢磨了","烹饪了","嚼了","翻炒了","忙活了"]'
);
tryRegexReplace(
    /\[((?:"(?:Baked|Brewed|Churned|Cogitated|Cooked|Crunched|Saut(?:é|\\u00e9|\\xE9)ed|Thought|Worked)"[,]?){2,})\]/g,
    (match) => {
        const pairs = [
            ["Baked", "烘焙了"], ["Brewed", "沏了"], ["Churned", "翻搅了"],
            ["Cogitated", "琢磨了"], ["Cooked", "烹饪了"], ["Crunched", "嚼了"],
            ["Sautéed", "翻炒了"], ["Saut\\u00e9ed", "翻炒了"], ["Saut\\xE9ed", "翻炒了"],
            ["Thought", "思考了"], ["Worked", "忙活了"],
        ];
        let result = match;
        for (const [en, zh] of pairs) result = result.split(`"${en}"`).join(`"${zh}"`);
        return result;
    }
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
tryRegexReplace(/\?`Worked for \$\{([^}]+)\}`:"Idle"/g, (match, durationExpr) =>
    `?\`忙活了 \${${durationExpr}}\`:"空闲"`
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

// 7. 权限确认面板的新 native UI 片段（避免全局翻译 Bash/Yes/No 误伤系统提示）
tryRegexReplace(
    /title:([A-Za-z0-9_$]+)&&!([A-Za-z0-9_$]+)\?"Bash command \(unsandboxed\)":"Bash command"/g,
    (match, sandboxed, visible) =>
        `title:${sandboxed}&&!${visible}?"Bash 命令（未沙盒隔离）":"Bash 命令"`
);
tryRegexReplace(/label:"Yes",value:"yes"/g, () => 'label:"是",value:"yes"');
tryRegexReplace(/label:"No",value:"no"/g, () => 'label:"否",value:"no"');
tryRegexReplace(
    /([A-Za-z0-9_$]+(?:\.default)?)\.createElement\(([^,]+),\{dimColor:!0\},"Any use of the ",\1\.createElement\(\2,\{bold:!0\},([^)]*)\)," tool"\)/g,
    (match, factory, component, toolName) =>
        `${factory}.createElement(${component},{dimColor:!0},"任意使用 ",${factory}.createElement(${component},{bold:!0},${toolName})," 工具")`
);

// === 逐条翻译：只替换真实的字符串字面量 ===
//
// 先处理 minifier 把 `'` 拆成 `"foo","'","bar"` 的高风险字面量（folder trust、/btw 等），
// 再扫描源码中的真实字符串 token，只在这些 token 内做替换。
// 这样不会跨越源码结构误改对象键、标识符或注释。

if (translationsFile && fs.existsSync(translationsFile)) {
    const baseRules = JSON.parse(fs.readFileSync(translationsFile, "utf8")).filter(
        (rule) => !shouldSkipTranslationRule(rule)
    );
    // 二进制里省略号一律是字面转义形态（… 六字符），而翻译表 en 用真实
    // 省略号字符，直接 includes 匹配不上。为含省略号的规则补一份转义形态变体。
    const escapedEllipsisRules = baseRules
        .filter((rule) => rule.en.includes("…"))
        .map((rule) => ({
            en: rule.en.split("…").join("\\u2026"),
            zh: rule.zh,
        }));
    const translationRules = [
        ...baseRules,
        ...escapedEllipsisRules,
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

    const literals = scanStringLiterals(s);
    let literalsChanged = false;

    for (const literal of literals) {
        if (literal.quote === "`") {
            if (translateFastModeTemplateLiteral(literal)) {
                literalsChanged = true;
                count++;
            }
            continue;
        }

        const replaced = applyDynamicLiteralTranslations(literal.text);
        if (replaced !== literal.text) {
            literal.text = replaced;
            literalsChanged = true;
            count++;
        }
    }

    for (const { en, zh } of translationRules) {
        if (en === zh) continue;

        let hit = false;
        for (const literal of literals) {
            if (isProtectedProtocolLiteral(literal)) {
                continue;
            }
            if (literal.quote === "`") {
                if (!replaceWholeTemplateLiteral(literal, en, zh)) {
                    if (!replaceTemplateLiteralTextParts(literal.parts, en, zh)) {
                        continue;
                    }
                    literal.text = literal.parts.map((part) => part.value).join("");
                }
                hit = true;
                literalsChanged = true;
                continue;
            }

            const needle = literal.quote === "'" ? escapeSingleQuotedLiteralNeedleContent(en) : en;
            const replacementText = literal.quote === "'" ? escapeSingleQuotedLiteralContent(zh) : zh;
            if (!literal.text.includes(needle)) {
                continue;
            }
            const replaced = replaceLiteralText(literal.text, needle, replacementText);
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
            rebuilt += literal.quote;
            cursor = literal.end;
        }
        rebuilt += s.slice(cursor);
        s = rebuilt;
    }
}

// === 只有实际改变文件内容才写入 ===
// s 是基于干净基底（original）patch 后的完整结果；currentContent 是磁盘上的现状。
// 两者一致 → 无需写盘；不一致 → 语法校验通过后原子替换。
if (s === currentContent) {
    exitNoChange(residueStatus(s) === "ok" ? "noop" : "partial");
}

// 语法校验：patch 结果必须是合法 JS，否则放弃写盘（磁盘保持原状，CLI 可用）
if (!validateSyntax(original, s)) {
    writeStatus("validation-failed");
    console.log("0");
    process.exit(0);
}

const uniqueSuffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
const tmp = `${cliFile}.zh-cn-tmp.${uniqueSuffix}`;
let commitError = null;
try {
    fs.writeFileSync(tmp, s);
    const origMode = fs.statSync(cliFile).mode;
    fs.chmodSync(tmp, origMode);

    if (process.platform === "win32") {
        // NTFS 不能直接 rename 覆盖目标；先把原文件挪到唯一回滚位，再提交新文件。
        const rollback = `${cliFile}.zh-cn-swap-backup.${uniqueSuffix}`;
        fs.renameSync(cliFile, rollback);
        try {
            fs.renameSync(tmp, cliFile);
        } catch (error) {
            try {
                fs.renameSync(rollback, cliFile);
            } catch {
                // rename 回滚仍失败时用 copy 兜底，不能让 cli.js 消失。
                fs.copyFileSync(rollback, cliFile);
                try { fs.unlinkSync(rollback); } catch {}
            }
            throw error;
        }
        try { fs.unlinkSync(rollback); } catch {}
    } else {
        // 同目录 rename 在 POSIX 上是原子替换；并发进程最多最后一次写入胜出。
        fs.renameSync(tmp, cliFile);
    }
} catch (error) {
    commitError = error;
} finally {
    try { fs.unlinkSync(tmp); } catch {}
}
if (commitError) {
    logEvent(`commit-failed ${cliFile}: ${commitError.message}`);
    writeStatus("error");
    console.log("0");
    process.exit(0);
}

writeStatus(residueStatus(s));
console.log(count);
