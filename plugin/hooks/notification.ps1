#!/usr/bin/env pwsh
# notification hook for claude-code-zh-cn (Windows PowerShell 版本)
# 翻译常见通知消息为中文

$rawInput = [Console]::In.ReadToEnd()

$message = ""
try {
    $data = $rawInput | ConvertFrom-Json
    $message = [string]$data.message
} catch {}

$translated = ""
switch -Wildcard ($message) {
    "*Rate limited*"        { $translated = "请求频率受限，请稍后再试" }
    "*Token limit reached*"  { $translated = "Token 用量已达上限" }
    "*Session expired*"      { $translated = "会话已过期" }
    "*Context window*"       { $translated = "上下文窗口即将用尽，建议使用 /compact 压缩" }
    "*Usage limit*"          { $translated = "使用额度已达上限" }
    "*Auto-compact*"         { $translated = "正在自动压缩对话历史..." }
}

if ($translated) {
    $result = @{
        hookSpecificOutput = @{
            hookEventName    = "Notification"
            additionalContext = "通知翻译：$translated"
        }
    }
    $result | ConvertTo-Json -Compress
} else {
    Write-Output "{}"
}
