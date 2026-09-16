#!/usr/bin/env pwsh
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PassThruArgs
)

$ErrorActionPreference = "SilentlyContinue"
$LauncherDir = Split-Path -Parent $PSCommandPath

$resolver = Join-Path $LauncherDir "resolve-runtime.js"
if (-not (Test-Path $resolver)) { $resolver = Join-Path $LauncherDir "../scripts/resolve-runtime.js" }
$pluginRoot = (& node $resolver | Out-String).Trim()
if ($pluginRoot -and $env:ZH_CN_LAUNCHER_DISPATCHED -ne "1" -and (Test-Path "$pluginRoot/bin/claude-launcher.ps1")) {
    $env:ZH_CN_LAUNCHER_DISPATCHED = "1"
    $env:ZH_CN_LAUNCHER_BIN_DIR = $LauncherDir
    & "$pluginRoot/bin/claude-launcher.ps1" @PassThruArgs
    exit $LASTEXITCODE
}
if ($env:ZH_CN_LAUNCHER_BIN_DIR) { $LauncherDir = $env:ZH_CN_LAUNCHER_BIN_DIR }
$oldPath = $env:PATH
try {
    $filtered = ($env:PATH -split ';' | Where-Object { $_ -ne $LauncherDir }) -join ';'
    $env:PATH = $filtered
    $realClaude = (Get-Command claude -ErrorAction SilentlyContinue).Source
} finally {
    $env:PATH = $oldPath
}

if (-not $realClaude) {
    Write-Error "[claude-code-zh-cn] real claude executable not found"
    exit 127
}

if ($pluginRoot -and (Test-Path "$pluginRoot/bun-binary-io.js")) {
    $detected = (& node "$pluginRoot/bun-binary-io.js" detect $realClaude | Out-String).Trim()
    if ($detected.StartsWith("native-bun:")) {
        $stateRoot = Join-Path $env:USERPROFILE ".claude/plugins/claude-code-zh-cn"
        & node "$pluginRoot/scripts/native-repair.js" $detected.Substring(11) $stateRoot | Out-Null
    }
}
$env:ZH_CN_REAL_CLAUDE = $realClaude
$env:PATH = $filtered
& $realClaude @PassThruArgs
exit $LASTEXITCODE
