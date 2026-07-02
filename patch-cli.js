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
    return text.replace(/Toggle fast mode \((Opus [^)]+?)( only)?\)/g, (_match, model, only) => {
        return only ? `切换快速模式（仅 ${model}）` : `切换快速模式（${model}）`;
    });
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
]) {
    try {
        step();
    } catch (error) {
        logEvent(`structural-step-skipped ${step.name}: ${error.message}`);
    }
}

// 1. 过去式动词数组
tryRegexReplace(
    /\["Baked","Brewed","Churned","Cogitated","Cooked","Crunched","Saut(?:\u00e9|\\u00e9|\\xE9)ed","Worked"\]/g,
    () => '["烘焙了","沏了","翻搅了","琢磨了","烹饪了","嚼了","翻炒了","忙活了"]'
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
    const translationRules = [
        ...JSON.parse(fs.readFileSync(translationsFile, "utf8")).filter(
            (rule) => !shouldSkipTranslationRule(rule)
        ),
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

const tmp = cliFile + ".zh-cn-tmp";
fs.writeFileSync(tmp, s);
const origMode = fs.statSync(cliFile).mode;
fs.chmodSync(tmp, origMode);
if (process.platform === "win32") {
    try { fs.unlinkSync(cliFile); } catch (e) {}
}
fs.renameSync(tmp, cliFile);

writeStatus(residueStatus(s));
console.log(count);
