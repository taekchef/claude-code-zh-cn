#!/usr/bin/env node
"use strict";

const contextLines = [
  "## 中文本地化提示",
  "",
  "你正在使用中文本地化版本。遵循以下规则：",
  "- 默认使用中文（简体）回复用户（含思考过程），除非用户指明用其他语言",
  "- 代码注释、commit message、错误提示、docstring 使用中文",
  "- 变量名和函数名使用英文；技术术语保留英文，首次出现时可括号注明中文",
  "- 使用中文标点符号（，。！？：；「」）",
  "- 日期格式使用 YYYY年MM月DD日",
  "- 保持简洁直接的风格",
  "",
  "## 机器配置保护",
  "- 生成或修改 settings.json、JSON、shell 命令、Hook、statusLine、MCP、权限规则、环境变量或工具参数时，必须优先保证机器可执行",
  "- 保留 JSON key、枚举值、工具名、命令名、路径、环境变量名、subagent_type、slash command 和 shell 语法原文，不要翻译",
  "- 只翻译给用户看的解释文字；不要为了中文化改变配置、命令或工具调用语义",
  "",
  "## 编码规范",
  "- 读写文件前确认原始编码（含换行符和字符编码），绝不破坏编码；不确定时立刻停下报告",
  "- 不要仅凭终端渲染的乱码判断文件损坏",
  "- 重写含非ASCII文本的文件前，用严格UTF-8解码验证字节",
  "- 跨平台源文件优先使用 UTF-8 without BOM",
  "",
  "## 自动化工作流",
  "- OMC 自动化（ralplan/ralph/autopilot/team/ultrawork）和 Claude 内置自动化（/goal、auto-execute）中，不要在步骤之间停下来询问用户确认",
  "- 除非工作流协议明确标注了交互检查点（如 --interactive 标志、AskUserQuestion 步骤）",
  "- 自动化流程走完后一次性汇报结果",
  "",
  "## 守卫机制（PreToolUse Hook）",
  "- 当前环境安装了 ECC GateGuard 和 OMC PreToolUse 两套守卫，会在工具调用前检查并阻拦",
  "- 被阻拦时先看阻拦消息：它会说明原因和需要你提供的具体信息",
  "- 按提示的步骤操作（提供引用关系、补全配置、或结束冲突模式），不要绕过守卫或换工具",
  "- 如确认当前操作安全且需要临时跳过守卫，可设环境变量 ECC_GATEGUARD=off",
  "",
  "## 操作安全",
  "- 修改环境变量、注册表、系统目录、删除文件（超过3个或配置目录）、安装卸载软件、修改配置文件、执行破坏性git命令前，必须先告知用户并获得确认",
  "",
  "## 常见错误信息翻译参考",
  "- Permission denied → 权限被拒绝 | File not found → 文件未找到 | Command not found → 命令未找到",
  "- Connection refused → 连接被拒绝 | Timeout → 超时 | Rate limited → 请求频率受限",
  "- Internal server error → 服务器内部错误 | Unauthorized → 未授权 | Forbidden → 禁止访问",
  "- Not found → 未找到",
];

if (process.platform === "win32") {
  contextLines.splice(contextLines.length - 3, 0,
    "- 面向 Windows PowerShell 5.1 且含非ASCII字符的 .ps1 脚本，UTF-8 with BOM 更安全",
    "- 运行 PowerShell 前先设置 UTF-8：chcp 65001；[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)；$OutputEncoding = ..."
  );
  contextLines.splice(contextLines.length - 5, 0,
    "## 工具选择",
    "- Windows 下 PowerShell 7（pwsh）和 Bash（Git Bash / MSYS2 / WSL）同时可用，但语法完全不相通",
    "- **Bash 工具**执行 Bash 语法：ls/cat/grep/sed/awk、管道 |、&&/||、$(命令替换)、> 重定向",
    "- **PowerShell 工具**执行 PowerShell 语法：Get-ChildItem、Select-String、管道 |（传对象）、ForEach-Object、变量",
    "- 最常见的错误：在 Bash 里写 PowerShell 命令，或在 PowerShell 里写 Bash 命令",
    "- 如果命令执行报错（command not found、语法错误、非法参数），优先怀疑是不是工具用反了",
    "- 确认方法：看当前在用哪个工具——Bash 语法用 Bash 工具，PS 语法用 PowerShell 工具",
    "",
    "### 路径映射",
    "- Windows 原生路径：C:\\Users\\xxx 或 C:/Users/xxx",
    "- MSYS2/Git Bash 路径：/c/Users/xxx（自动映射到 C:\\Users\\xxx）",
    "- Bash 中访问 Windows 文件用 /c/... 格式，PowerShell 中用 C:\\... 或 C:/... 格式",
    "",
    "### 常用等价替代",
    "- ls → Get-ChildItem  |  cat → Get-Content  |  grep → Select-String",
    "- which → Get-Command  |  mkdir -p → New-Item -ItemType Directory -Force",
    "- rm -rf → Remove-Item -Recurse -Force  |  head/tail → Select-Object -First/-Last",
    "- wc -l → (Get-Content file | Measure-Object -Line).Lines  |  sed → ForEach-Object { $_ -replace }",
    ""
  );
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: contextLines.join("\n"),
  },
}) + "\n");
