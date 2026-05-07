#!/usr/bin/env pwsh
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PassThruArgs
)

$ErrorActionPreference = "SilentlyContinue"
$LauncherDir = Split-Path -Parent $PSCommandPath

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

$env:ZH_CN_REAL_CLAUDE = $realClaude
$env:PATH = $filtered
& $realClaude @PassThruArgs
exit $LASTEXITCODE
