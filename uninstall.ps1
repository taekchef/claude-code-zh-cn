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
const s=JSON.parse(fs.readFileSync(process.env.ZH_CN_SETTINGS,'utf8').replace(/^$([char]0x5C)uFEFF/,''));
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

# 4. 还原 cli.js / clawgod / native（从备份恢复）
$RESTORED = $false
$claudeBin = ""

# 找到 claude 二进制路径（launcher 可能已被 step 1 移除）
try { $claudeBin = (Get-Command claude -ErrorAction SilentlyContinue).Source } catch {}
if (-not $claudeBin) {
    try { $claudeBin = (Get-Command where.exe -ErrorAction SilentlyContinue) ? (& where claude 2>$null).Trim() : "" } catch {}
}

# 先通过 bun-binary-io.js detect 找实际安装路径（与 install 一致）
$helperFile = Join-Path $PluginDst "bun-binary-io.js"
if (-not (Test-Path $helperFile)) {
    # fallback: 从脚本所在目录加载（可能在 repo 中直接运行）
    $helperFile = Join-Path $PSScriptRoot "plugin\bun-binary-io.js"
}
if (Test-Path $helperFile) {
    $installInfo = node $helperFile detect "$claudeBin" 2>$null
    if ($installInfo) {
        $kind, $target = $installInfo -split ':', 2
        if ($kind -eq "npm" -and $target -and (Test-Path "${target}.zh-cn-backup")) {
            Copy-Item "${target}.zh-cn-backup" $target -Force
            Remove-Item "${target}.zh-cn-backup" -Force
            Write-Host "已还原 cli.js" -ForegroundColor Green
            $RESTORED = $true
            # 还原同目录 clawgod
            $cgFile = Join-Path (Split-Path -Parent $target) "cli.original.cjs"
            if (Test-Path "${cgFile}.zh-cn-backup") {
                Copy-Item "${cgFile}.zh-cn-backup" $cgFile -Force
                Remove-Item "${cgFile}.zh-cn-backup" -Force
                Write-Host "已还原 clawgod cli.original.cjs" -ForegroundColor Green
            }
        } elseif ($kind -eq "native-bun" -and $target -and (Test-Path "${target}.zh-cn-backup")) {
            Copy-Item "${target}.zh-cn-backup" $target -Force
            Remove-Item "${target}.zh-cn-backup" -Force
            Write-Host "已还原原生二进制" -ForegroundColor Green
            $RESTORED = $true
            # 还原 clawgod（clawgod 默认输出目录）
            $cgFile = Join-Path $env:USERPROFILE ".clawgod\cli.original.cjs"
            if (Test-Path "${cgFile}.zh-cn-backup") {
                Copy-Item "${cgFile}.zh-cn-backup" $cgFile -Force
                Remove-Item "${cgFile}.zh-cn-backup" -Force
                Write-Host "已还原 clawgod cli.original.cjs" -ForegroundColor Green
            }
        }
    }
}

# fallback: 尝试 npm root -g 找 cli.js
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
        $RESTORED = $true
    } elseif ($cliFile -and (Test-Path $cliFile)) {
        Write-Host "cli.js 没有备份文件，建议运行以下命令还原：" -ForegroundColor Yellow
        Write-Host "  npm install -g @anthropic-ai/claude-code"
    }

    # 还原 clawgod cli.original.cjs（如果存在）
    if ($cliFile) {
        $clawgodFile = Join-Path (Split-Path -Parent $cliFile) "cli.original.cjs"
        if (Test-Path "${clawgodFile}.zh-cn-backup") {
            Copy-Item "${clawgodFile}.zh-cn-backup" $clawgodFile -Force
            Remove-Item "${clawgodFile}.zh-cn-backup" -Force
            Write-Host "已还原 clawgod cli.original.cjs" -ForegroundColor Green
        }
    }
}
if (-not $RESTORED) {
    # 最后尝试：直接检查 .zh-cn-backup 文件
    $possible = @(
        "$env:USERPROFILE\AppData\Local\claude\cli.js",
        "$env:LOCALAPPDATA\Programs\claude\resources\app\cli.js",
        "$env:ProgramFiles\claude\resources\app\cli.js"
    )
    foreach ($p in $possible) {
        if (Test-Path "${p}.zh-cn-backup") {
            Copy-Item "${p}.zh-cn-backup" $p -Force
            Remove-Item "${p}.zh-cn-backup" -Force
            Write-Host "已还原 cli.js ($p)" -ForegroundColor Green
            $RESTORED = $true
            break
        }
    }
}

# 最后尝试：还原 clawgod（~/.clawgod/ 目录）
$cgDefault = Join-Path $env:USERPROFILE ".clawgod\cli.original.cjs"
if (Test-Path "${cgDefault}.zh-cn-backup") {
    Copy-Item "${cgDefault}.zh-cn-backup" $cgDefault -Force
    Remove-Item "${cgDefault}.zh-cn-backup" -Force
    Write-Host "已还原 clawgod cli.original.cjs" -ForegroundColor Green
}

# 5. 移除插件目录
if (Test-Path $PluginDst) {
    Remove-Item -Recurse -Force $PluginDst
    Write-Host "已移除插件目录" -ForegroundColor Green
}

# 清理插件注册信息
$env:ZH_CN_SETTINGS_FILE = $SettingsFile
node -e @"
const fs=require('fs');
const file=process.env.ZH_CN_SETTINGS_FILE;
let s=JSON.parse(fs.readFileSync(file,'utf8').replace(/^$([char]0x5C)uFEFF/,''));
let changed=false;
for(const event of ['SessionStart','Notification']){
  if(s.hooks&&s.hooks[event]){
    const before=s.hooks[event].length;
    s.hooks[event]=s.hooks[event].filter(h=>
      !h.hooks||!h.hooks[0]||!h.hooks[0].command||
      !h.hooks[0].command.includes('claude-code-zh-cn')&&
      !h.hooks[0].command.includes('local-zh-cn')
    );
    if(s.hooks[event].length!==before) changed=true;
    if(s.hooks[event].length===0) delete s.hooks[event];
  }
}
if(changed) fs.writeFileSync(file,JSON.stringify(s,null,2)+'\n');
"@ 2>$null
Remove-Item Env:\ZH_CN_SETTINGS_FILE -ErrorAction SilentlyContinue
if ($LASTEXITCODE -eq 0) { Write-Host "已清理插件注册信息" -ForegroundColor Green }

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
