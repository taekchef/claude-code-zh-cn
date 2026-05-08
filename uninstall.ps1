#!/usr/bin/env pwsh
# claude-code-zh-cn Windows 卸载脚本 (PowerShell)
# 精准移除插件注入的设置，保留用户其他配置
# 移植自 uninstall.sh — 适配 Windows 原生环境

param(
    [switch]$SkipBanner = $false
)

$ErrorActionPreference = "Stop"

$SettingsFile = "$env:USERPROFILE\.claude\settings.json"
$PluginDst = if ($env:CLAUDE_PLUGIN_ROOT) {
    $env:CLAUDE_PLUGIN_ROOT
} else {
    "$env:USERPROFILE\.claude\plugins\claude-code-zh-cn"
}
$LauncherBinDir = if ($env:ZH_CN_LAUNCHER_BIN_DIR) {
    $env:ZH_CN_LAUNCHER_BIN_DIR
} else {
    "$env:USERPROFILE\.claude\bin"
}
$LauncherFile = "$LauncherBinDir\claude.cmd"
$LauncherPs1File = "$LauncherBinDir\claude.ps1"

if (-not $SkipBanner) {
    Write-Host ""
    Write-Host "=== Claude Code 中文本地化插件 卸载 ===" -ForegroundColor Blue
    Write-Host ""
}

function Remove-LauncherFile {
    param([string]$Target)
    if (-not (Test-Path $Target)) { return $false }

    $content = ""
    try {
        $content = [System.IO.File]::ReadAllText($Target, [System.Text.Encoding]::UTF8)
    } catch {}

    if ($content -match "claude-code-zh-cn") {
        Remove-Item $Target -Force -ErrorAction SilentlyContinue
        return $true
    }

    if (-not $SkipBanner) {
        Write-Host "检测到自定义 launcher，未自动删除：$Target" -ForegroundColor Yellow
    }
    return $false
}

# 1. 移除 launcher
$removedLauncher = $false
if (Remove-LauncherFile $LauncherFile) {
    $removedLauncher = $true
}
if (Remove-LauncherFile $LauncherPs1File) {
    $removedLauncher = $true
}
# 清理空目录
if (Test-Path $LauncherBinDir) {
    $remaining = Get-ChildItem $LauncherBinDir -ErrorAction SilentlyContinue
    if (-not $remaining) {
        Remove-Item $LauncherBinDir -Force -ErrorAction SilentlyContinue
    }
}
if ($removedLauncher) {
    Write-Host "已移除 launcher" -ForegroundColor Green
}

# 2. 从用户 PATH 中移除 launcher 目录
$currentUserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ((-not (Test-Path $LauncherBinDir)) -and $currentUserPath -like "*$LauncherBinDir*") {
    $newPath = ($currentUserPath -split ';' | Where-Object {
        $_ -ne $LauncherBinDir -and $_ -ne "$LauncherBinDir\"
    }) -join ';'
    [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
    Write-Host "已从用户 PATH 移除 launcher 目录" -ForegroundColor Green
}

# 3. 从 settings.json 精准移除插件注入的 key
if (Test-Path $SettingsFile) {
    if (Get-Command jq -ErrorAction SilentlyContinue) {
        $tempFile = "$SettingsFile.tmp"
        jq 'del(.language) | del(.spinnerTipsEnabled) | del(.spinnerTipsOverride) | del(.spinnerVerbs)' $SettingsFile | Out-File -FilePath $tempFile -Encoding utf8 -NoNewline
        Move-Item $tempFile $SettingsFile -Force
        Write-Host "已从 settings.json 移除中文设置（保留其他配置）" -ForegroundColor Green
    } elseif (Get-Command node -ErrorAction SilentlyContinue) {
        $env:ZH_CN_SETTINGS = $SettingsFile
        node -e @"
const fs=require('fs');
const s=JSON.parse(fs.readFileSync(process.env.ZH_CN_SETTINGS,'utf8'));
for(const k of ['language','spinnerTipsEnabled','spinnerTipsOverride','spinnerVerbs']){delete s[k]}
fs.writeFileSync(process.env.ZH_CN_SETTINGS,JSON.stringify(s,null,2)+'\n');
"@
        Remove-Item Env:\ZH_CN_SETTINGS -ErrorAction SilentlyContinue
        Write-Host "已从 settings.json 移除中文设置（保留其他配置）" -ForegroundColor Green
    } else {
        Write-Host "请手动编辑 $SettingsFile 移除以下字段：" -ForegroundColor Yellow
        Write-Host "  - language"
        Write-Host "  - spinnerTipsEnabled"
        Write-Host "  - spinnerTipsOverride"
        Write-Host "  - spinnerVerbs"
    }
}

# 4. 还原 cli.js（从备份恢复）
$RESTORED = $false

# 试 npm 全局 claude
$claudeBin = (Get-Command claude -ErrorAction SilentlyContinue).Source
if ($claudeBin) {
    # 试原生二进制备份
    if (Test-Path "${claudeBin}.zh-cn-backup") {
        Copy-Item "${claudeBin}.zh-cn-backup" $claudeBin -Force
        Remove-Item "${claudeBin}.zh-cn-backup" -Force
        Write-Host "已还原二进制" -ForegroundColor Green
        $RESTORED = $true
    }
}

if (-not $RESTORED) {
    $cliFile = ""
    try {
        $npmRoot = (npm root -g 2>$null).Trim()
        $cliFile = Join-Path $npmRoot "@anthropic-ai\claude-code\cli.js"
    } catch {}

    if (-not $cliFile -or -not (Test-Path $cliFile)) {
        if ($claudeBin) {
            $cliDir = Split-Path -Parent $claudeBin
            $cliFile = Join-Path $cliDir "..\lib\node_modules\@anthropic-ai\claude-code\cli.js"
            $cliFile = [System.IO.Path]::GetFullPath($cliFile)
        }
    }

    if ($cliFile -and (Test-Path "${cliFile}.zh-cn-backup")) {
        Copy-Item "${cliFile}.zh-cn-backup" $cliFile -Force
        Remove-Item "${cliFile}.zh-cn-backup" -Force
        Write-Host "已还原 cli.js" -ForegroundColor Green
    } elseif ($cliFile -and (Test-Path $cliFile)) {
        Write-Host "cli.js 没有备份文件，建议运行以下命令还原：" -ForegroundColor Yellow
        Write-Host "  npm install -g @anthropic-ai/claude-code"
    }
}

# 5. 移除插件目录
if (Test-Path $PluginDst) {
    Remove-Item -Recurse -Force $PluginDst
    Write-Host "已移除插件目录" -ForegroundColor Green
}

# 6. 清理 settings.json 备份
$backupPattern = "$env:USERPROFILE\.claude\settings.json.zh-cn-backup.*"
Get-ChildItem $backupPattern -ErrorAction SilentlyContinue | Remove-Item -Force
if ((Get-ChildItem $backupPattern -ErrorAction SilentlyContinue).Count -gt 0) {
    Write-Host "已清理 settings.json 备份" -ForegroundColor Green
}

if (-not $SkipBanner) {
    Write-Host ""
    Write-Host "=== 卸载完成！===" -ForegroundColor Green
    Write-Host "重启 Claude Code 即可恢复英文界面"
}
