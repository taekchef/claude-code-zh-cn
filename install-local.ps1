#!/usr/bin/env pwsh
# 本地离线优先入口：不尝试启用被关闭的正式插件，也不修改 CC Switch。
param([switch]$UpdateOnly = $false)

$oldStandalone = $env:ZH_CN_PREFER_STANDALONE
$oldCcSwitch = $env:ZH_CN_CCSWITCH_SYNC
try {
    $env:ZH_CN_PREFER_STANDALONE = "1"
    $env:ZH_CN_CCSWITCH_SYNC = "0"
    & (Join-Path $PSScriptRoot "install.ps1") -UpdateOnly:$UpdateOnly
    if ($LASTEXITCODE) { exit $LASTEXITCODE }
} finally {
    $env:ZH_CN_PREFER_STANDALONE = $oldStandalone
    $env:ZH_CN_CCSWITCH_SYNC = $oldCcSwitch
}
