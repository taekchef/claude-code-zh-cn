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
$UpdateCheckInterval = if ($env:ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS) {
    [int]$env:ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS
} else { 21600 }
$LauncherBinDir = if ($env:ZH_CN_LAUNCHER_BIN_DIR) {
    $env:ZH_CN_LAUNCHER_BIN_DIR
} else {
    "$env:USERPROFILE\.claude\bin"
}

# ======== helper functions ========

function Read-ManifestVersion($Target) {
    node -e "try{const d=JSON.parse(require('fs').readFileSync(process.argv[2],'utf8'));process.stdout.write(String(d.version||''))}catch(e){}" $Target 2>$null
}

function Test-VersionIsNewer($Current, $Latest) {
    node -e @"
function parse(v){return String(v||'').split('.').map(p=>{const n=Number.parseInt(p,10);return Number.isFinite(n)?n:0})}
function cmp(a,b){const m=Math.max(a.length,b.length);for(let i=0;i<m;i++){const l=a[i]||0,r=b[i]||0;if(l>r)return 1;if(l<r)return -1}return 0}
process.exit(cmp(parse('$Latest'),parse('$Current'))>0?0:1)
"@ 2>$null
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
    node -e @"
const crypto=require('crypto'),fs=require('fs'),path=require('path');
const root=process.argv[2];
const files=['manifest.json','patch-cli.sh','patch-cli.js','cli-translations.json','bun-binary-io.js','compute-patch-revision.sh'];
const hash=crypto.createHash('sha256');
for(const f of files){const t=path.join(root,f);if(!fs.existsSync(t))continue;hash.update(f);hash.update('\0');hash.update(fs.readFileSync(t));hash.update('\0')}
process.stdout.write(hash.digest('hex').slice(0,16));
"@ $Root 2>$null
}

function Read-CliVersion($CliFile) {
    node -e "const t=require('fs').readFileSync(process.argv[2],'utf8');const m=t.match(/^\/\/ Version: (.+)\$/m);process.stdout.write(m?m[1]:'')" $CliFile 2>$null
}

function Test-NpmCliResidue($CliFile) {
    node -e @"
const fs=require('fs');
const probes=['Quick safety check','This command requires approval','Use /btw to ask a quick side question without interrupting Claude\'s current work'];
try{const t=fs.readFileSync(process.argv[2],'utf8');const r=probes.filter(p=>t.includes(p));if(r.length>0){process.stdout.write(r.join(' | '));process.exit(0)}}catch(e){}
process.exit(1);
"@ $CliFile 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Get-InstallInfo($ClaudeBin) {
    if (-not $ClaudeBin -or -not (Test-Path "$PluginRoot\bun-binary-io.js")) {
        return $null
    }
    return (node "$PluginRoot\bun-binary-io.js" detect $ClaudeBin 2>$null)
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
                    # 尝试用 bash 执行 update-only install（需 Git Bash）
                    $stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) "cczh-update-${PID}"
                    try {
                        New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
                        Push-Location $SourceRepo
                        try {
                            git archive --format=tar $LatestTag install.sh compute-patch-revision.sh settings-overlay.json verbs tips plugin 2>$null | tar -xf - -C $stagingDir 2>$null
                        } finally { Pop-Location }
                        if ((Test-Path "$stagingDir\install.sh") -and (Test-Path "$stagingDir\settings-overlay.json") -and (Test-Path "$stagingDir\plugin\manifest.json")) {
                            if (Get-Command bash -ErrorAction SilentlyContinue) {
                                $env:CLAUDE_PLUGIN_ROOT = $PluginRoot
                                $env:ZH_CN_SOURCE_REPO = $SourceRepo
                                $env:ZH_CN_SKIP_BANNER = "1"
                                bash "$stagingDir\install.sh" --update-only 2>$null
                                Remove-Item Env:\CLAUDE_PLUGIN_ROOT, Env:\ZH_CN_SOURCE_REPO, Env:\ZH_CN_SKIP_BANNER -ErrorAction SilentlyContinue
                                $AutoUpdateMsg = "插件已从 v${LocalVersion} 更新到 v${LatestVersion}"
                            }
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
if ($ClaudeBin -and (Test-Path "$PluginRoot\bun-binary-io.js")) {
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
                $patchCount = node "$PluginRoot\patch-cli.js" $Target "$PluginRoot\cli-translations.json" 2>$null
                if ($patchCount -and [int]$patchCount -gt 0) {
                    $CurrentMarker | Out-File -FilePath $MarkerFile -Encoding ascii -NoNewline
                    $AutoPatchMsg = "（已自动 patch ${patchCount} 处硬编码文字）"
                }
            }
        }
    }
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
