#!/usr/bin/env pwsh
# claude-code-zh-cn Windows 安装脚本 (PowerShell)
# 将中文本地化设置合并到 Claude Code 的 settings.json
# 移植自 install.sh - 适配 Windows 原生环境
# 支持 PowerShell 5.1+

param(
    [switch]$UpdateOnly = $false,
    [switch]$SkipBanner = $false
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# ======== 路径变量 ========
$ScriptDir = $PSScriptRoot
$SettingsFile = "$env:USERPROFILE\.claude\settings.json"
$OverlayFile = "$ScriptDir\settings-overlay.json"
$PluginSrc = "$ScriptDir\plugin"
$PluginDst = "$env:USERPROFILE\.claude\plugins\claude-code-zh-cn"
if ($env:CLAUDE_PLUGIN_ROOT) { $PluginDst = $env:CLAUDE_PLUGIN_ROOT }
$MarkerFile = "$PluginDst\.patched-version"
$SourceRepoFile = "$PluginDst\.source-repo"
$LastUpdateCheckFile = "$PluginDst\.last-update-check"
$LauncherBinDir = "$env:USERPROFILE\.claude\bin"
if ($env:ZH_CN_LAUNCHER_BIN_DIR) { $LauncherBinDir = $env:ZH_CN_LAUNCHER_BIN_DIR }
$SourceRepoOverride = $env:ZH_CN_SOURCE_REPO
$TmpDir = "$env:TEMP\claude-zh-cn"

$CliPatchStatusSummary = "已跳过（未执行 CLI Patch）"
$CliPatchStatusOk = $false

# ======== 帮助函数 ========
function Write-CN {
    param([string]$Msg, [string]$Color = "White")
    Write-Host $Msg -ForegroundColor $Color
}

function banner {
    if ($SkipBanner) { return }
    Write-Host ""
    if ($UpdateOnly) {
        Write-CN "=== Claude Code 中文本地化插件 更新 ===" Blue
    } else {
        Write-CN "=== Claude Code 中文本地化插件 安装 ===" Blue
    }
    Write-Host ""
}

function run-js {
    param([string]$Code, [string[]]$JsArgs)
    $tmp = Join-Path $TmpDir "tmp-$PID-$((Get-Random).ToString('x')).js"
    New-Item -Force -ItemType Directory -Path $TmpDir | Out-Null
    $Code | Out-File -FilePath $tmp -Encoding ascii -NoNewline
    try {
        if ($JsArgs) {
            node $tmp @JsArgs
        } else {
            node $tmp
        }
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

# ======== Settings 合并脚本（单行 JS，无特殊字符） ========
$JS_BACKUP_PRUNE = "var fs=require('fs'),path=require('path');var dir=process.env.ZH_CN_SETTINGS_DIR;try{var all=fs.readdirSync(dir).filter(function(n){return n.indexOf('settings.json.zh-cn-backup.')===0}).sort();var stale=all.slice(0,Math.max(0,all.length-5));for(var i=0;i<stale.length;i++){fs.unlinkSync(path.join(dir,stale[i]))}}catch(e){}"

$JS_BUILD_OVERLAY_FILES = "var fs=require('fs');var base=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));var verbs=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));var tips=JSON.parse(fs.readFileSync(process.argv[4],'utf8'));base.spinnerVerbs=verbs;base.spinnerTipsOverride={excludeDefault:true,tips:tips.tips.map(function(t){return t.text})};process.stdout.write(JSON.stringify(base))"

$JS_DEEP_MERGE_FILES = "var fs=require('fs');var sf=process.argv[2];var of=process.argv[3];function readJson(f){return JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''))}var settings=readJson(sf);var overlay=readJson(of);function dm(b,o){var r={};var k;for(k in b){if(b.hasOwnProperty(k))r[k]=b[k]}for(k in o){if(!o.hasOwnProperty(k))continue;if(r[k]&&typeof r[k]==='object'&&!Array.isArray(r[k])&&o[k]&&typeof o[k]==='object'&&!Array.isArray(o[k])){r[k]=dm(r[k],o[k])}else{r[k]=o[k]}}return r}var m=dm(settings,overlay);fs.writeFileSync(sf,JSON.stringify(m,null,2)+'\n');process.stdout.write('ok')"

$JS_PATCH_REVISION = "var crypto=require('crypto'),fs=require('fs'),path=require('path');var root=process.argv[2];var files=['manifest.json','patch-cli.sh','patch-cli.js','cli-translations.json','bun-binary-io.js','compute-patch-revision.sh'];var hash=crypto.createHash('sha256');for(var i=0;i<files.length;i++){var f=files[i];var t=path.join(root,f);if(!fs.existsSync(t))continue;hash.update(f);hash.update('\0');hash.update(fs.readFileSync(t));hash.update('\0')}process.stdout.write(hash.digest('hex').slice(0,16))"


# ======== 输出函数 ========
function completion {
    if ($UpdateOnly -or $SkipBanner) { return }
    Write-Host ""
    Write-CN "=== 安装完成！===" Green
    Write-Host ""
    Write-CN "已启用的功能："
    Write-CN "  √ AI 回复语言 → 中文" Green
    Write-CN "  √ Spinner 提示 → 中文（41 条）" Green
    Write-CN "  √ Spinner 动词 → 中文（187 个）" Green
    Write-CN "  √ 会话启动 Hook → 中文上下文注入（Windows PowerShell）" Green
    Write-CN "  √ 通知 Hook → 中文翻译（Windows PowerShell）" Green
    Write-CN "  √ 输出风格 → Chinese" Green
    Write-CN "  √ 自动重 patch → Claude Code 更新后首次会话自动修复（session-start 兜底）" Green
    Write-CN "  √ 自动更新 → 插件发布新 Release 后自动同步" Green
    if ($CliPatchStatusOk) {
        Write-CN "  √ CLI Patch → $CliPatchStatusSummary" Green
    } else {
        Write-CN "  ! CLI Patch → $CliPatchStatusSummary" Yellow
    }
    Write-Host ""
    Write-Host "重启 Claude Code 即可生效。如需卸载，运行：" -NoNewline
    Write-CN ".\uninstall.ps1" Yellow
}

# ======== 依赖检查 ========
function check-deps {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-CN "错误：需要 node，请先安装 Node.js" Red
        exit 1
    }
    if (-not $UpdateOnly -and -not $SkipBanner) {
        if (-not (Get-Command jq -ErrorAction SilentlyContinue)) {
            Write-CN "提示：建议安装 jq 以获得更好的 JSON 合并支持" Yellow
            Write-Host "  winget install jqlang.jq"
        }
    }
}

# ======== 路径/安装检测 ========
function find-real-claude {
    if ($env:ZH_CN_REAL_CLAUDE -and (Get-Command $env:ZH_CN_REAL_CLAUDE -ErrorAction SilentlyContinue)) {
        return $env:ZH_CN_REAL_CLAUDE
    }
    $oldPath = $env:PATH
    try {
        $filtered = ($env:PATH -split ';' | Where-Object { $_ -ne $LauncherBinDir }) -join ';'
        $env:PATH = $filtered
        $found = (Get-Command claude -ErrorAction SilentlyContinue)
        if ($found) { return $found.Source }
        return $null
    } finally {
        $env:PATH = $oldPath
    }
}

function detect-install {
    param([string]$ClaudeBin)
    if (-not $ClaudeBin) { return $null }
    $helperFile = $null
    if (Test-Path "$PluginSrc\bun-binary-io.js") {
        $helperFile = "$PluginSrc\bun-binary-io.js"
    } elseif (Test-Path "$PluginDst\bun-binary-io.js") {
        $helperFile = "$PluginDst\bun-binary-io.js"
    }
    if (-not $helperFile) { return $null }
    $result = node $helperFile detect $ClaudeBin 2>$null
    if ($result) { return $result.Trim() }
    $claudeDir = Split-Path -Parent $ClaudeBin
    $cliFile = Join-Path $claudeDir "..\lib\node_modules\@anthropic-ai\claude-code\cli.js"
    $cliFile = [System.IO.Path]::GetFullPath($cliFile)
    if (Test-Path $cliFile) { return "npm:$cliFile" }
    try {
        $npmRoot = (npm root -g 2>$null).Trim()
        $cliFile2 = Join-Path $npmRoot "@anthropic-ai\claude-code\cli.js"
        if (Test-Path $cliFile2) { return "npm:$cliFile2" }
    } catch {}
    return $null
}

# ======== Settings 操作 ========
function ensure-settings {
    if (-not (Test-Path $SettingsFile)) {
        if (-not $UpdateOnly -and -not $SkipBanner) {
            Write-CN "settings.json 不存在，创建新文件" Yellow
        }
        $dir = Split-Path -Parent $SettingsFile
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [System.IO.File]::WriteAllText($SettingsFile, '{}', $utf8NoBom)
    }
}

function remove-old-backups {
    $settingsDir = Split-Path -Parent $SettingsFile
    $env:ZH_CN_SETTINGS_DIR = $settingsDir
    run-js $JS_BACKUP_PRUNE
    Remove-Item Env:\ZH_CN_SETTINGS_DIR -ErrorAction SilentlyContinue
}

function build-overlay {
    $baseFile = "$TmpDir\overlay-base-$PID.json"
    $verbsFile = "$TmpDir\overlay-verbs-$PID.json"
    $tipsFile = "$TmpDir\overlay-tips-$PID.json"
    New-Item -Force -ItemType Directory -Path $TmpDir | Out-Null
    [System.IO.File]::Copy($OverlayFile, $baseFile, $true)
    [System.IO.File]::Copy("$ScriptDir\verbs\zh-CN.json", $verbsFile, $true)
    [System.IO.File]::Copy("$ScriptDir\tips\zh-CN.json", $tipsFile, $true)
    try {
        $result = run-js $JS_BUILD_OVERLAY_FILES @($baseFile, $verbsFile, $tipsFile)
    } finally {
        Remove-Item $baseFile, $verbsFile, $tipsFile -Force -ErrorAction SilentlyContinue
    }
    return $result
}

function merge-settings {
    ensure-settings
    if (-not $UpdateOnly) {
        $timestamp = Get-Date -Format "yyyyMMddHHmmss"
        $backupFile = "$SettingsFile.zh-cn-backup.$timestamp"
        Copy-Item $SettingsFile $backupFile
        remove-old-backups
        if (-not $SkipBanner) {
            Write-CN "已备份 settings.json -> $backupFile" Green
        }
    }
    $overlayContent = build-overlay
    $overlayTempFile = "$TmpDir\settings-overlay-$PID.json"
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($overlayTempFile, $overlayContent, $utf8NoBom)
    try {
        $mergeResult = run-js $JS_DEEP_MERGE_FILES @($SettingsFile, $overlayTempFile)
    } finally {
        Remove-Item $overlayTempFile -Force -ErrorAction SilentlyContinue
    }
    if ($mergeResult -ne "ok") {
        Write-CN "错误：settings.json 合并失败" Red
        exit 1
    }
    if (-not $SkipBanner) {
        Write-CN "已更新 settings.json" Green
    }
    if ($PluginDst -and (Test-Path $PluginDst)) {
        $overlayContent | Out-File -FilePath "$PluginDst\.settings-overlay-cache.json" -Encoding utf8 -NoNewline
    }
}

# ======== 插件同步 ========
function sync-plugin {
    if (-not $PluginDst -or $PluginDst -eq "\" -or $PluginDst -eq "/") {
        Write-CN "错误：PLUGIN_DST 非法，拒绝同步" Red
        exit 1
    }
    if (Test-Path $PluginDst) {
        Get-ChildItem $PluginDst -ErrorAction SilentlyContinue | Where-Object {
            -not $_.Name.StartsWith('.')
        } | Remove-Item -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $PluginDst | Out-Null
    Copy-Item "$PluginSrc\*" -Destination $PluginDst -Recurse -Force

    $dstHooksJson = "$PluginDst\hooks.json"
    if (Test-Path $dstHooksJson) {
        $hooksContent = [System.IO.File]::ReadAllText($dstHooksJson, [System.Text.Encoding]::UTF8)
        $hooksContent = $hooksContent -replace "/hooks/session-start'", "/hooks/session-start.cmd'"
        $hooksContent = $hooksContent -replace "/hooks/notification'", "/hooks/notification.cmd'"
        $hooksContent | Out-File -FilePath $dstHooksJson -Encoding ascii -NoNewline
    }
    if (-not $SkipBanner) {
        Write-CN "已安装插件 -> $PluginDst" Green
    }
}

# ======== Launcher 安装 ========
function remove-launcher-file {
    param([string]$Target)
    if (-not (Test-Path $Target)) { return }

    $content = ""
    try {
        $content = [System.IO.File]::ReadAllText($Target, [System.Text.Encoding]::UTF8)
    } catch {}

    if ($content -match "claude-code-zh-cn") {
        Remove-Item $Target -Force -ErrorAction SilentlyContinue
        return $true
    } elseif (-not $SkipBanner) {
        Write-CN "检测到自定义 launcher，未自动删除：$Target" Yellow
    }
    return $false
}

function remove-launcher-artifacts {
    $removedCmd = remove-launcher-file "$LauncherBinDir\claude.cmd"
    $removedPs1 = remove-launcher-file "$LauncherBinDir\claude.ps1"

    $remaining = @()
    if (Test-Path $LauncherBinDir) {
        $remaining = @(Get-ChildItem $LauncherBinDir -ErrorAction SilentlyContinue)
        if (-not $remaining) {
            Remove-Item $LauncherBinDir -Force -ErrorAction SilentlyContinue
        }
    }

    if ($remaining -and -not $SkipBanner -and ($removedCmd -or $removedPs1)) {
        Write-CN "launcher 目录还有其他文件，未移除 PATH：$LauncherBinDir" Yellow
    }

    if (-not $remaining -and $env:ZH_CN_SKIP_USER_PATH_UPDATE -ne "1") {
        $currentUserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
        if ($currentUserPath -like "*$LauncherBinDir*") {
            $newPath = ($currentUserPath -split ';' | Where-Object {
                $_ -ne $LauncherBinDir -and $_ -ne "$LauncherBinDir\"
            }) -join ';'
            [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        }
    }
}

function install-launcher {
    $realClaude = find-real-claude
    $installInfo = detect-install $realClaude
    $kind = ""
    if ($installInfo) {
        $kind = ($installInfo -split ':', 2)[0]
    }

    if ($kind -ne "npm") {
        remove-launcher-artifacts
        if (-not $SkipBanner) {
            Write-CN "当前安装方式不是 npm cli.js，已跳过 launcher PATH 注入" Yellow
        }
        return
    }

    if (-not (Test-Path "$PluginSrc\bin\claude-launcher.cmd")) {
        if (-not $SkipBanner) {
            Write-CN "launcher 文件缺失，已跳过 PATH 注入" Yellow
        }
        return
    }
    New-Item -ItemType Directory -Force -Path $LauncherBinDir | Out-Null
    Copy-Item "$PluginSrc\bin\claude-launcher.ps1" "$LauncherBinDir\claude.ps1" -Force
    Copy-Item "$PluginSrc\bin\claude-launcher.cmd" "$LauncherBinDir\claude.cmd" -Force

    $currentUserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($env:ZH_CN_SKIP_USER_PATH_UPDATE -eq "1") {
        if (-not $SkipBanner) {
            Write-CN "测试模式：已跳过用户 PATH 持久化写入" Yellow
        }
    } elseif ($currentUserPath -notlike "*$LauncherBinDir*") {
        $newPath = $LauncherBinDir
        if ($currentUserPath) { $newPath = "$LauncherBinDir;$currentUserPath" }
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        if (-not $SkipBanner) {
            Write-CN "已将 launcher 目录加入用户 PATH -> $LauncherBinDir" Green
        }
    }
    if (-not $SkipBanner) {
        Write-CN "已安装 Windows launcher -> $LauncherBinDir" Green
    }
}

# ======== CLI Patch ========
function get-patch-revision {
    param([string]$Root)
    run-js $JS_PATCH_REVISION @($Root)
}

function read-cli-version {
    param([string]$CliFile)
    if (-not (Test-Path $CliFile)) { return "" }
    try {
        foreach ($line in (Get-Content $CliFile -First 10)) {
            if ($line -match '^// Version: (.+)$') {
                return $matches[1]
            }
        }
        return ""
    } catch {
        return ""
    }
}

function patch-npm-cli {
    param([string]$CliFile)
    Write-Host ""
    Write-CN "正在 patch cli.js 硬编码文字..." Blue
    $currentVersion = read-cli-version $CliFile
    $backupFile = "$CliFile.zh-cn-backup"
    $backupVersion = ""
    if (Test-Path $backupFile) {
        $backupVersion = read-cli-version $backupFile
    }
    if ($currentVersion -and $backupVersion -and $currentVersion -eq $backupVersion -and (Test-Path $backupFile)) {
        Copy-Item $backupFile $CliFile -Force
        Write-CN "已从备份恢复原始 cli.js（版本一致: $currentVersion）" Green
    } else {
        Copy-Item $CliFile $backupFile -Force
        Write-CN "已备份 cli.js（版本: $currentVersion）" Green
    }
    $patchScript = Join-Path $PluginSrc "patch-cli.js"
    $translationsFile = Join-Path $PluginSrc "cli-translations.json"
    if (Test-Path $patchScript) {
        $patchCount = node $patchScript $CliFile $translationsFile 2>$null
        if ($patchCount -and [int]$patchCount -gt 0) {
            Write-CN "已 patch cli.js（${patchCount} 处硬编码文字）" Green
            $script:CliPatchStatusSummary = "cli.js 中文化（${patchCount} 处硬编码文字）"
            $script:CliPatchStatusOk = $true
        } else {
            Write-CN "已 patch cli.js（${patchCount} 处硬编码文字）" Green
            $script:CliPatchStatusSummary = "cli.js 无新增改动（可能已是最新状态）"
        }
    }
    $patchRevision = get-patch-revision $PluginDst
    if ($patchRevision -and $currentVersion) {
        "${currentVersion}|${patchRevision}" | Out-File -FilePath $MarkerFile -Encoding ascii -NoNewline
    }
}

function initial-patch {
    $realClaude = find-real-claude
    if (-not $realClaude) {
        Write-CN "未找到 Claude Code，跳过 patch 步骤" Yellow
        $script:CliPatchStatusSummary = "已跳过（未检测到 Claude Code）"
        return
    }
    $installInfo = detect-install $realClaude
    if (-not $installInfo) {
        Write-CN "未找到 Claude Code，跳过 patch 步骤" Yellow
        $script:CliPatchStatusSummary = "已跳过（未检测到 Claude Code）"
        return
    }
    $kind, $target = $installInfo -split ':', 2
    switch ($kind) {
        "npm" {
            if ($target -and (Test-Path $target)) {
                patch-npm-cli $target
            }
        }
        "native-bun" {
            Write-CN "检测到原生二进制安装；Windows PE 二进制暂不支持 patch，仅 macOS 支持" Yellow
            $script:CliPatchStatusSummary = "已跳过（Windows PE 二进制 patch 暂未支持）"
        }
        "unknown" {
            Write-CN "当前安装方式暂不支持 CLI Patch，已跳过此步骤" Yellow
            $script:CliPatchStatusSummary = "已跳过（当前安装方式暂不支持 CLI Patch）"
        }
        default {
            Write-CN "未识别的安装类型: $kind" Yellow
            $script:CliPatchStatusSummary = "已跳过（未识别的安装类型: $kind）"
        }
    }
}

# ======== 元数据写入 ========
function write-metadata {
    $sourceRepo = ""
    if ($SourceRepoOverride) {
        $sourceRepo = $SourceRepoOverride
    } elseif ($UpdateOnly -and (Test-Path $SourceRepoFile)) {
        $sourceRepo = [System.IO.File]::ReadAllText($SourceRepoFile, [System.Text.Encoding]::UTF8).Trim()
    } elseif (-not $UpdateOnly) {
        $sourceRepo = $ScriptDir
    }
    if ($sourceRepo) {
        "$sourceRepo" | Out-File -FilePath $SourceRepoFile -Encoding ascii -NoNewline
    }
    $timestamp = [int][double]::Parse((Get-Date (Get-Date).ToUniversalTime() -UFormat %s))
    "$timestamp" | Out-File -FilePath $LastUpdateCheckFile -Encoding ascii -NoNewline
}

# ======== 主流程 ========
function Main {
    banner
    check-deps
    sync-plugin
    install-launcher
    merge-settings
    write-metadata
    if (-not $UpdateOnly) {
        initial-patch
    }
    completion
}

Main
