#!/usr/bin/env pwsh
# 仅用于本机 2.21.3 安装前创建的私人备份；不包含在安装 ZIP 的备份数据中。
param([Parameter(Mandatory = $true)][string]$BackupDirectory)

$ErrorActionPreference = "Stop"
$backup = (Resolve-Path -LiteralPath $BackupDirectory).Path
$state = Get-Content -LiteralPath (Join-Path $backup "state.json") -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $state.targetHashAfterInstall -or -not $state.settingsHashAfterInstall) {
    throw "备份状态缺少安装后指纹；没有执行还原"
}

$target = [System.IO.Path]::GetFullPath($state.target)
$pluginPath = [System.IO.Path]::GetFullPath($state.pluginPath)
$settingsPath = [System.IO.Path]::GetFullPath($state.settingsPath)
$launcherPath = [System.IO.Path]::GetFullPath($state.launcherPath)
$expectedPluginPath = Join-Path $env:USERPROFILE ".claude\plugins\claude-code-zh-cn"
if ($pluginPath -ne [System.IO.Path]::GetFullPath($expectedPluginPath)) {
    throw "插件目标路径与当前用户不一致；没有执行还原"
}
if (-not (Test-Path -LiteralPath $target) -or -not (Test-Path -LiteralPath $pluginPath)) {
    throw "目标程序或插件不存在；没有执行还原"
}
if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $state.targetHashAfterInstall) {
    throw "Claude Code 已被更新或更改；没有覆盖新程序"
}
if ((Get-FileHash -LiteralPath $settingsPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $state.settingsHashAfterInstall) {
    throw "settings.json 在安装后已更改；没有覆盖用户的新设置"
}
$registryPath = Join-Path (Split-Path -Parent $pluginPath) "installed_plugins.json"
if ($state.registryHashAfterInstall -and
    (Get-FileHash -LiteralPath $registryPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $state.registryHashAfterInstall) {
    throw "插件注册表在安装后已更改；没有覆盖用户的新注册信息"
}
if ($state.launcherHashes) {
    foreach ($name in @("claude.ps1","claude.cmd","resolve-runtime.js")) {
        $expected = $state.launcherHashes.PSObject.Properties[$name].Value
        if (-not $expected -or (Get-FileHash -LiteralPath (Join-Path $launcherPath $name) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
            throw "启动入口 $name 在安装后已更改；没有覆盖用户的新入口"
        }
    }
}
$version = (Get-Content -LiteralPath (Join-Path $pluginPath "manifest.json") -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($version -ne "2.21.3") { throw "插件已被更新为 $version；没有覆盖新插件" }
foreach ($pair in @(@("claude.exe",$state.targetHashBefore),@("claude.exe.zh-cn-backup",$state.sourceHash))) {
    $file = Join-Path $backup $pair[0]
    if (-not (Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pair[1]) {
        throw "私人备份文件 $($pair[0]) 缺失或指纹不符；没有执行还原"
    }
}
$running = Get-CimInstance Win32_Process -Filter "name = 'claude.exe'" | Where-Object { $_.ExecutablePath -eq $target }
if ($running) { throw "目标终端仍在运行；请关闭后重试" }

# 同目录候选文件先完整复制和校验，再原子替换，不直接在目标 EXE 上写字节。
$candidate = Join-Path (Split-Path -Parent $target) (".cczh-rollback-" + [guid]::NewGuid().ToString("N") + ".exe")
try {
    Copy-Item -LiteralPath (Join-Path $backup "claude.exe") -Destination $candidate -Force
    if ((Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant() -ne $state.targetHashBefore) {
        throw "回退候选 EXE 校验失败；目标程序未更改"
    }
    & node -e 'const fs=require("fs");fs.renameSync(process.argv[1],process.argv[2])' $candidate $target
    if ($LASTEXITCODE -ne 0) { throw "目标程序被占用；目标程序未更改" }
} finally {
    if (Test-Path -LiteralPath $candidate) { Remove-Item -LiteralPath $candidate -Force }
}
Copy-Item -LiteralPath (Join-Path $backup "claude.exe.zh-cn-backup") -Destination ($target + ".zh-cn-backup") -Force
Copy-Item -LiteralPath (Join-Path $backup "claude.exe.zh-cn-repair.json") -Destination ($target + ".zh-cn-repair.json") -Force
Copy-Item -LiteralPath (Join-Path $backup "settings.json") -Destination $settingsPath -Force
Copy-Item -LiteralPath (Join-Path $backup "installed_plugins.json") -Destination (Join-Path (Split-Path -Parent $pluginPath) "installed_plugins.json") -Force
$retired = Join-Path (Split-Path -Parent $pluginPath) ("claude-code-zh-cn.2.21.3-retired-" + (Get-Date -Format "yyyyMMddHHmmss"))
if ([System.IO.Path]::GetFullPath($retired).StartsWith([System.IO.Path]::GetFullPath((Split-Path -Parent $pluginPath)) + [System.IO.Path]::DirectorySeparatorChar) -ne $true) {
    throw "插件回退目标路径无效"
}
Move-Item -LiteralPath $pluginPath -Destination $retired
Copy-Item -LiteralPath (Join-Path $backup "plugin") -Destination $pluginPath -Recurse -Force
foreach ($name in @("claude.ps1","claude.cmd","resolve-runtime.js")) {
    Copy-Item -LiteralPath (Join-Path $backup $name) -Destination (Join-Path $launcherPath $name) -Force
}
$commandRoot = Join-Path $env:USERPROFILE ".claude\commands"
$ownedText = "This command is handled by the claude-code-zh-cn UserPromptSubmit hook"
foreach ($name in @("chinese","english","zh","en")) {
    $commandFile = Join-Path $commandRoot ($name + ".md")
    if (-not $state.preserveCommandStubs -and (Test-Path -LiteralPath $commandFile) -and
        [System.IO.File]::ReadAllText($commandFile, [System.Text.Encoding]::UTF8).Contains($ownedText)) {
        Remove-Item -LiteralPath $commandFile -Force
    }
}
Write-Host "已还原安装前的终端程序、插件、Hook、设置和启动器；2.21.3 插件副本保存在 $retired"
