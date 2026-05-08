#!/usr/bin/env pwsh
# session-start hook for claude-code-zh-cn (Windows PowerShell 版本)
# 1. 注入中文上下文指令
# 2. 检测插件 Release 更新并同步安装态
# 3. 检测 cli.js 版本变更，自动重 patch

$ErrorActionPreference = "SilentlyContinue"

$PluginRoot = if ($env:CLAUDE_PLUGIN_ROOT) {
    $env:CLAUDE_PLUGIN_ROOT
} else {
    "$env:USERPROFILE\.claude\plugins\claude-code-zh-cn"
}
$MarkerFile = Join-Path $PluginRoot ".patched-version"
$SourceRepoFile = Join-Path $PluginRoot ".source-repo"
$LastUpdateCheckFile = Join-Path $PluginRoot ".last-update-check"
$SettingsOverlayCacheFile = Join-Path $PluginRoot ".settings-overlay-cache.json"
$SettingsFile = "$env:USERPROFILE\.claude\settings.json"
$UpdateCheckInterval = if ($env:ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS) {
    [int]$env:ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS
} else { 21600 }
$LauncherBinDir = if ($env:ZH_CN_LAUNCHER_BIN_DIR) {
    $env:ZH_CN_LAUNCHER_BIN_DIR
} else {
    "$env:USERPROFILE\.claude\bin"
}
$TmpDir = "$env:TEMP\cczh-hook-$PID"

# ======== helper: write JS to temp file, execute with node, return stdout ========
function Invoke-JsScript {
    param(
        [string]$Code,
        [string[]]$Args
    )
    $tmp = Join-Path $TmpDir "tmp-$PID-$((Get-Random).ToString('x')).js"
    New-Item -Force -ItemType Directory -Path $TmpDir | Out-Null
    $Code | Out-File -FilePath $tmp -Encoding ascii -NoNewline
    try {
        if ($Args) {
            node $tmp @Args 2>$null
        } else {
            node $tmp 2>$null
        }
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

# ======== helper functions ========

function Read-ManifestVersion($Target) {
    $code = @'
try{const d=JSON.parse(require("fs").readFileSync(process.argv[2],"utf8"));process.stdout.write(String(d.version||""))}catch(e){}
'@
    Invoke-JsScript -Code $code -Args @($Target)
}

function Test-VersionIsNewer($Current, $Latest) {
    $code = @'
function parse(v){return String(v||"").split(".").map(p=>{const n=Number.parseInt(p,10);return Number.isFinite(n)?n:0})}
function cmp(a,b){const m=Math.max(a.length,b.length);for(let i=0;i<m;i++){const l=a[i]||0,r=b[i]||0;if(l>r)return 1;if(l<r)return -1}return 0}
process.exit(cmp(parse(process.argv[2]),parse(process.argv[3]))>0?0:1)
'@
    Invoke-JsScript -Code $code -Args @($Latest, $Current)
    return ($LASTEXITCODE -eq 0)
}

function Find-RealClaudeBinary {
    if ($env:ZH_CN_REAL_CLAUDE -and (Get-Command $env:ZH_CN_REAL_CLAUDE -ErrorAction SilentlyContinue)) {
        return $env:ZH_CN_REAL_CLAUDE
    }
    $oldPath = $env:PATH
    try {
        $filtered = ($env:PATH -split ';' | Where-Object { $_ -ne $LauncherBinDir }) -join ';'
        $env:PATH = $filtered
        return (Get-Command claude -ErrorAction SilentlyContinue).Source
    } finally {
        $env:PATH = $oldPath
    }
}

function Get-PatchRevision($Root) {
    $code = @'
const crypto=require("crypto"),fs=require("fs"),path=require("path");
const root=process.argv[2];
const files=["manifest.json","patch-cli.sh","patch-cli.js","cli-translations.json","bun-binary-io.js","compute-patch-revision.sh"];
const hash=crypto.createHash("sha256");
for(const f of files){const t=path.join(root,f);if(!fs.existsSync(t))continue;hash.update(f);hash.update("\0");hash.update(fs.readFileSync(t));hash.update("\0")}
process.stdout.write(hash.digest("hex").slice(0,16));
'@
    Invoke-JsScript -Code $code -Args @($Root)
}

function Read-CliVersion($CliFile) {
    $code = @'
const t=require("fs").readFileSync(process.argv[2],"utf8");const m=t.match(/^\/\/ Version: (.+)$/m);process.stdout.write(m?m[1]:"")
'@
    Invoke-JsScript -Code $code -Args @($CliFile)
}

function Test-NpmCliResidue($CliFile) {
    $code = @'
const fs=require("fs");
const probes=["Quick safety check","This command requires approval","Use /btw to ask a quick side question without interrupting Claude\u0027s current work"];
try{const t=fs.readFileSync(process.argv[2],"utf8");const r=probes.filter(p=>t.includes(p));if(r.length>0){process.stdout.write(r.join(" | "));process.exit(0)}}catch(e){}
process.exit(1);
'@
    Invoke-JsScript -Code $code -Args @($CliFile)
    return ($LASTEXITCODE -eq 0)
}

function Get-InstallInfo($ClaudeBin) {
    if (-not $ClaudeBin) { return $null }
    $helperFile = Join-Path $PluginRoot "bun-binary-io.js"
    if (-not (Test-Path $helperFile)) { return $null }
    node $helperFile detect "$ClaudeBin" 2>$null
}

function Repair-SettingsFromCache {
    if (-not (Test-Path $SettingsOverlayCacheFile)) { return }

    $settingsDir = Split-Path -Parent $SettingsFile
    New-Item -Force -ItemType Directory -Path $settingsDir | Out-Null

    $code = @'
const fs=require("fs");
const settingsFile=process.argv[2];
const overlayFile=process.argv[3];
const pluginKeys=["language","spinnerTipsEnabled","spinnerVerbs","spinnerTipsOverride"];
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,"utf8").replace(/^\uFEFF/,""))}catch(e){return fallback}}
function isObject(value){return value&&typeof value==="object"&&!Array.isArray(value)}
function deepMerge(base,override){const result={...base};for(const [key,value] of Object.entries(override)){if(isObject(result[key])&&isObject(value)){result[key]=deepMerge(result[key],value)}else{result[key]=value}}return result}
const overlay=readJson(overlayFile,null);
if(!isObject(overlay)) process.exit(0);
const settingsRaw=readJson(settingsFile,{});
const settings=isObject(settingsRaw)?settingsRaw:{};
const merged=deepMerge(settings,overlay);
const changed=pluginKeys.some((key)=>JSON.stringify(settings[key])!==JSON.stringify(merged[key]));
if(changed){fs.writeFileSync(settingsFile,JSON.stringify(merged,null,2)+"\n")}
'@
    Invoke-JsScript -Code $code -Args @($SettingsFile, $SettingsOverlayCacheFile) | Out-Null
}

# ======== Auto Update ========
$AutoUpdateMsg = ""
$SourceRepo = $null
if (Test-Path $SourceRepoFile) {
    $SourceRepo = [System.IO.File]::ReadAllText($SourceRepoFile, [System.Text.Encoding]::UTF8) -replace '\r?\n', ''
}

if ($SourceRepo -and (Test-Path "$SourceRepo\.git") -and $env:ZH_CN_DISABLE_AUTO_UPDATE -ne "1") {
    $now = [DateTimeOffset]::Now.ToUnixTimeSeconds()
    $last = 0
    if (Test-Path $LastUpdateCheckFile) {
        $raw = [System.IO.File]::ReadAllText($LastUpdateCheckFile, [System.Text.Encoding]::UTF8) -replace '\r?\n', ''
        [int]::TryParse($raw, [ref]$last) | Out-Null
    }
    $shouldCheck = ($UpdateCheckInterval -eq 0) -or (($now - $last) -ge $UpdateCheckInterval)
    if ($shouldCheck) {
        [string]$now | Out-File -FilePath $LastUpdateCheckFile -Encoding ascii -NoNewline

        $LocalVersion = Read-ManifestVersion "$PluginRoot\manifest.json"
        if ($LocalVersion) {
            Push-Location $SourceRepo
            try {
                git fetch --tags --quiet 2>$null
                $LatestTag = (git tag -l 'v*' --sort=-version:refname 2>$null | Select-Object -First 1)
            } finally {
                Pop-Location
            }
            $LatestVersion = $LatestTag -replace '^v', ''
            if ($LatestTag -and $LatestVersion -and $LocalVersion -match '^\d+\.\d+\.\d+' -and $LatestVersion -match '^\d+\.\d+\.\d+') {
                if (Test-VersionIsNewer $LocalVersion $LatestVersion) {
                    # 原生 PowerShell 自动更新：调用 install.ps1 -UpdateOnly -SkipBanner
                    $stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) "cczh-update-${PID}"
                    try {
                        New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
                        Push-Location $SourceRepo
                        try {
                            git archive --format=tar $LatestTag install.ps1 install.sh compute-patch-revision.sh scripts/install-json-helper.js settings-overlay.json verbs tips plugin 2>$null | tar -xf - -C $stagingDir 2>$null
                        } finally { Pop-Location }
                        if ((Test-Path "$stagingDir\install.ps1") -and (Test-Path "$stagingDir\scripts\install-json-helper.js") -and (Test-Path "$stagingDir\settings-overlay.json") -and (Test-Path "$stagingDir\plugin\manifest.json")) {
                            $env:CLAUDE_PLUGIN_ROOT = $PluginRoot
                            $env:ZH_CN_SOURCE_REPO = $SourceRepo
                            $env:ZH_CN_SKIP_BANNER = "1"
                            powershell -NoProfile -ExecutionPolicy Bypass -File "$stagingDir\install.ps1" -UpdateOnly -SkipBanner 2>$null
                            Remove-Item Env:\CLAUDE_PLUGIN_ROOT, Env:\ZH_CN_SOURCE_REPO, Env:\ZH_CN_SKIP_BANNER -ErrorAction SilentlyContinue
                            $AutoUpdateMsg = "插件已从 v${LocalVersion} 更新到 v${LatestVersion}"
                        }
                    } catch {} finally {
                        if (Test-Path $stagingDir) {
                            Remove-Item -Recurse -Force $stagingDir -ErrorAction SilentlyContinue
                        }
                    }
                }
            }
        }
    }
}

# ======== Auto Patch ========
$AutoPatchMsg = ""
$ClaudeBin = Find-RealClaudeBinary
$InstallInfo = $null
if ($ClaudeBin) {
    $InstallInfo = Get-InstallInfo $ClaudeBin
}

if ($InstallInfo) {
    $Kind, $Target = $InstallInfo -split ':', 2
    if ($Kind -eq "npm" -and $Target -and (Test-Path $Target)) {
        $CurrentVersion = Read-CliVersion $Target
        $PatchRevision = Get-PatchRevision $PluginRoot
        $CurrentMarker = $CurrentVersion
        if ($PatchRevision) { $CurrentMarker = "${CurrentVersion}|${PatchRevision}" }
        $PatchedVersion = $null
        if (Test-Path $MarkerFile) {
            $PatchedVersion = [System.IO.File]::ReadAllText($MarkerFile, [System.Text.Encoding]::UTF8) -replace '\r?\n', ''
        }
        $hasResidue = Test-NpmCliResidue $Target
        if ($CurrentMarker -ne $PatchedVersion -or $hasResidue) {
            if (Test-Path "$PluginRoot\patch-cli.js") {
                $patchCount = node "$PluginRoot\patch-cli.js" "$Target" "$PluginRoot\cli-translations.json" 2>$null
                if ($patchCount -and [int]$patchCount -gt 0) {
                    "$CurrentMarker" | Out-File -FilePath $MarkerFile -Encoding ascii -NoNewline
                    $AutoPatchMsg = "（已自动 patch ${patchCount} 处硬编码文字）"
                }
            }
        }
    }
}

Repair-SettingsFromCache

# ======== Cleanup tmp dir ========
if (Test-Path $TmpDir) {
    Remove-Item -Recurse -Force $TmpDir -ErrorAction SilentlyContinue
}

# ======== Build output context ========
$rawInput = [Console]::In.ReadToEnd()

$ctxLines = @(
    "## 中文本地化提示",
    "",
    "你正在使用中文本地化版本。请遵循以下规则：",
    "- 默认使用中文（简体）回复用户",
    "- 技术术语保留英文（如 API、PR、git、npm、React、TypeScript 等）",
    "- 使用中文标点符号（，。！？：；「」）",
    "- 错误信息尽量提供中文解释，附带英文原文",
    "- 保持简洁直接的风格",
    "- 代码注释使用中文",
    "- 日期格式使用 YYYY年MM月DD日",
    "",
    "## 机器配置保护",
    "- 生成或修改 settings.json、JSON、shell 命令、Hook、statusLine、MCP、权限规则、环境变量或工具参数时，必须优先保证机器可执行。",
    "- 保留 JSON key、枚举值、工具名、命令名、路径、环境变量名、subagent_type、slash command 和 shell 语法原文，不要翻译。",
    "- 只翻译给用户看的解释文字；不要为了中文化改变配置、命令或工具调用语义。",
    "",
    "## 常见错误信息翻译参考",
    "- Permission denied → 权限被拒绝",
    "- File not found → 文件未找到",
    "- Command not found → 命令未找到",
    "- Connection refused → 连接被拒绝",
    "- Timeout → 超时",
    "- Rate limited → 请求频率受限",
    "- Internal server error → 服务器内部错误",
    "- Unauthorized → 未授权",
    "- Forbidden → 禁止访问",
    "- Not found → 未找到"
)

if ($AutoUpdateMsg) {
    $ctxLines += @("", "## 自动更新", $AutoUpdateMsg)
}
if ($AutoPatchMsg) {
    $ctxLines += @("", "## 自动修复", $AutoPatchMsg)
}

$result = @{
    hookSpecificOutput = @{
        hookEventName    = "SessionStart"
        additionalContext = ($ctxLines -join "\n")
    }
}
$result | ConvertTo-Json -Compress -Depth 10
