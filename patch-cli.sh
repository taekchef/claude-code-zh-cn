#!/usr/bin/env bash
# patch-cli.sh - cli.js 硬编码文字中文 patch
# 被 install.sh 和 session-start hook 调用
# 用法: patch-cli.sh <cli.js路径>
# 返回值: 成功 patch 的数量

set -euo pipefail

CLI_FILE="${1:-}"

if [ -z "$CLI_FILE" ] || [ ! -f "$CLI_FILE" ]; then
    echo "0"
    exit 0
fi

# 执行 patch
node -e '
const fs = require("fs");
const f = process.argv[1];
let s = fs.readFileSync(f, "utf8");
let count = 0;

function tryReplace(from, to) {
    if (s.includes(from)) {
        s = s.split(from).join(to);
        count++;
        return true;
    }
    return false;
}

// 1. 过去式动词（直接用 UTF-8 字符）
tryReplace(
    `["Baked","Brewed","Churned","Cogitated","Cooked","Crunched","Saut\u00e9ed","Worked"]`,
    `["烘焙了","沏了","翻搅了","琢磨了","烹饪了","嚼了","翻炒了","忙活了"]`
);

// 2. /btw 提示（用 Unicode 转义避免 bash 单引号问题）
tryReplace(
    "Use /btw to ask a quick side question without interrupting Claude\u0027s current work",
    "\u4f7f\u7528 /btw \u63d0\u4e00\u4e2a\u5feb\u901f\u95ee\u9898\uff0c\u4e0d\u4f1a\u6253\u65ad\u5f53\u524d\u5de5\u4f5c"
);

// 3. /clear 提示
tryReplace(
    "Use /clear to start fresh when switching topics and free up context",
    "\u4f7f\u7528 /clear \u6e05\u7a7a\u5bf9\u8bdd\uff0c\u5207\u6362\u8bdd\u9898\u5e76\u91ca\u653e\u4e0a\u4e0b\u6587"
);

// 4. Tip: 前缀 → 💡（匹配 `Tip: ${任意变量}`）
const tipMatch = s.match(/\x60Tip: \$\{[^}]+\}\x60/);
if (tipMatch) {
    const replaced = tipMatch[0].replace("Tip: ", "\u{1F4A1} ");
    s = s.split(tipMatch[0]).join(replaced);
    count++;
}

// 5. 去掉耗时连接符（两处模板：${QE} Worked for ${I5(...)} 和 ${$} for ${M}）
tryReplace(" Worked for ", " ");
tryReplace(" for ${M}", " ${M}");

// 6. 时间单位中文化（通过特征定位 duration formatter 函数）
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
                ["}d ${z}h ${Y}m ${$}s", "}\u5929${z}\u65f6${Y}\u5206${$}\u79d2"],
                ["}d ${z}h ${Y}m", "}\u5929${z}\u65f6${Y}\u5206"],
                ["}h ${Y}m ${$}s", "}\u65f6${Y}\u5206${$}\u79d2"],
                ["}d ${z}h", "}\u5929${z}\u65f6"],
                ["}h ${Y}m", "}\u65f6${Y}\u5206"],
                ["}m ${$}s", "}\u5206${$}\u79d2"],
                ["}d", "}\u5929"],
                ["}h", "}\u65f6"],
                ["}m", "}\u5206"],
                ["}s", "}\u79d2"],
                ["\"0s\"", "\"0\u79d2\""],
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

fs.writeFileSync(f, s);
console.log(count);
' "$CLI_FILE" 2>/dev/null
