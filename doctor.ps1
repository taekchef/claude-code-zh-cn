#!/usr/bin/env pwsh
# 诊断 claude-code-zh-cn 安装状态，并给出可执行的下一步建议。
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File .\doctor.ps1 [--json]

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

if (-not $env:ZH_CN_DOCTOR_HOME -and $env:USERPROFILE) {
    $env:ZH_CN_DOCTOR_HOME = $env:USERPROFILE
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DoctorScript = Join-Path $ScriptDir "scripts\zh-cn-doctor.js"

if (-not (Test-Path $DoctorScript)) {
    $PluginRoot = Split-Path -Parent $ScriptDir
    $PluginDoctorScript = Join-Path $PluginRoot "scripts\zh-cn-doctor.js"
    if (Test-Path $PluginDoctorScript) {
        $DoctorScript = $PluginDoctorScript
        if (-not $env:ZH_CN_DOCTOR_REPO) {
            $env:ZH_CN_DOCTOR_REPO = $PluginRoot
        }
    }
}

if (-not (Test-Path $DoctorScript)) {
    [Console]::Error.WriteLine("doctor: 找不到 scripts\zh-cn-doctor.js")
    exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    [Console]::Error.WriteLine("doctor: 需要 Node.js，请先安装 Node.js 后重试 doctor.ps1")
    exit 1
}

& node $DoctorScript @args
exit $LASTEXITCODE
