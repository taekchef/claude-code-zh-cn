#!/usr/bin/env pwsh
# session-start hook for claude-code-zh-cn (Windows PowerShell 版本)
# 1. 注入中文上下文指令
# 2. 检测插件 Release 更新并同步安装态
# 3. npm cli.js 可自动重 patch；Windows native 记录安全交接，避免改写正在运行的 exe

$ErrorActionPreference = "SilentlyContinue"

$LegacyPluginRoot = "$env:USERPROFILE\.claude\plugins\claude-code-zh-cn"
$PluginRoot = if ($env:CLAUDE_PLUGIN_ROOT) {
    $env:CLAUDE_PLUGIN_ROOT
} else {
    $LegacyPluginRoot
}
$StateRoot = if ($env:CLAUDE_PLUGIN_DATA) {
    $env:CLAUDE_PLUGIN_DATA
} elseif ($env:CLAUDE_PLUGIN_ROOT) {
    $env:CLAUDE_PLUGIN_ROOT
} else {
    $LegacyPluginRoot
}
New-Item -Force -ItemType Directory -Path $StateRoot | Out-Null

# Marketplace 插件目录按版本缓存，状态写入持久目录；首次加载迁移旧安装的本机状态。
if ($env:CLAUDE_PLUGIN_DATA -and $StateRoot -ne $LegacyPluginRoot) {
    foreach ($stateName in @(".patched-version", ".settings-overlay-cache.json")) {
        $stateTarget = Join-Path $StateRoot $stateName
        $legacyState = Join-Path $LegacyPluginRoot $stateName
        if (-not (Test-Path $stateTarget) -and (Test-Path $legacyState)) {
            Copy-Item $legacyState $stateTarget -Force -ErrorAction SilentlyContinue
        }
    }
}

$MarkerFile = Join-Path $StateRoot ".patched-version"
$SourceRepoFile = Join-Path $StateRoot ".source-repo"
$LastUpdateCheckFile = Join-Path $StateRoot ".last-update-check"
$SettingsOverlayCacheFile = Join-Path $StateRoot ".settings-overlay-cache.json"
$NativePatchPendingFile = Join-Path $StateRoot ".native-patch-pending.json"
$SettingsFile = "$env:USERPROFILE\.claude\settings.json"
$UpdateCheckInterval = if ($env:ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS) {
    [int]$env:ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS
} else { 21600 }
$PluginUpdateTimeoutSeconds = 20
if ($env:ZH_CN_PLUGIN_UPDATE_TIMEOUT_SECONDS) {
    [int]$parsedPluginUpdateTimeout = 0
    if ([int]::TryParse($env:ZH_CN_PLUGIN_UPDATE_TIMEOUT_SECONDS, [ref]$parsedPluginUpdateTimeout) -and
        $parsedPluginUpdateTimeout -gt 0) {
        $PluginUpdateTimeoutSeconds = $parsedPluginUpdateTimeout
    }
}
$LauncherBinDir = if ($env:ZH_CN_LAUNCHER_BIN_DIR) {
    $env:ZH_CN_LAUNCHER_BIN_DIR
} else {
    "$env:USERPROFILE\.claude\bin"
}
$OfficialPluginId = "claude-code-zh-cn@claude-code-zh-cn"
$OfficialMarketplaceName = "claude-code-zh-cn"
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

function Invoke-CommandWithTimeout {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [int]$TimeoutSeconds
    )

    # 始终交给当前 PowerShell 子进程执行，因此 native exe、npm 的 .ps1/.cmd shim 都可用。
    $tokens = @($FilePath) + @($Arguments) | ForEach-Object {
        "'" + ([string]$_).Replace("'", "''") + "'"
    }
    $command = '$ErrorActionPreference="Stop"; try { & ' + ($tokens -join ' ') +
        '; if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }; exit 0 } catch { [Console]::Error.WriteLine($_); exit 1 }'
    $encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = [System.Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
    $startInfo.Arguments = "-NoProfile -NonInteractive -EncodedCommand $encodedCommand"
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) {
            return [PSCustomObject]@{ Success = $false; TimedOut = $false; Output = "" }
        }
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            try { $process.Kill() } catch {}
            try { $process.WaitForExit() } catch {}
            return [PSCustomObject]@{ Success = $false; TimedOut = $true; Output = "" }
        }
        $output = $process.StandardOutput.ReadToEnd() + $process.StandardError.ReadToEnd()
        return [PSCustomObject]@{
            Success = ($process.ExitCode -eq 0)
            TimedOut = $false
            Output = $output
        }
    } catch {
        return [PSCustomObject]@{ Success = $false; TimedOut = $false; Output = "" }
    } finally {
        $process.Dispose()
    }
}

function Get-PatchRevision($Root) {
    $code = @'
const crypto=require("crypto"),fs=require("fs"),path=require("path");
const root=process.argv[2];
const files=["patch-cli.sh","patch-cli.js","cli-translations.json","bun-binary-io.js","compute-patch-revision.sh"];
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

function Read-NativeVersion($BinaryPath) {
    $helperFile = Join-Path $PluginRoot "bun-binary-io.js"
    if (-not (Test-Path $helperFile)) { return "" }
    return ((node $helperFile version "$BinaryPath" 2>$null) | Out-String).Trim()
}

function Read-NativeVersionFromExecution($BinaryPath) {
    try {
        $output = ((& $BinaryPath --version 2>$null) | Out-String)
        $match = [regex]::Match($output, "\d+\.\d+\.\d+")
        if ($match.Success) { return $match.Value }
    } catch {}
    return ""
}

function Get-NativePlatform {
    if ($env:ZH_CN_NATIVE_PLATFORM) { return $env:ZH_CN_NATIVE_PLATFORM }
    return "win32-x64"
}

function Test-SupportedNativeVersion($Version, $Platform) {
    $supportFile = Join-Path $PluginRoot "support-window.json"
    if (-not (Test-Path $supportFile)) {
        return @("2.1.110", "2.1.111", "2.1.112") -contains $Version
    }

    $code = @'
const fs=require("fs");
const data=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const version=process.argv[3], platform=process.argv[4]||"";
const versions=[];
for(const key of ["macosNativeOfficialInstallerExperimental","macosNativeExperimental","windowsNativeExperimental"]){
  const entry=data[key];
  if(!entry) continue;
  if(platform&&entry.platform&&entry.platform!==platform) continue;
  versions.push(...(entry.versions||[]));
}
process.exit(versions.includes(version)?0:1);
'@
    Invoke-JsScript -Code $code -Args @($supportFile, $Version, $Platform) | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Test-ProvisionalNativeVersion($Version, $Platform) {
    $supportFile = Join-Path $PluginRoot "support-window.json"
    if (-not $Version -or -not $Platform -or -not (Test-Path $supportFile)) { return $false }

    $code = @'
const fs=require("fs");
const data=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const version=process.argv[3], platform=process.argv[4];
function parse(value){const m=String(value||"").match(/^(\d+)\.(\d+)\.(\d+)$/);return m?m.slice(1).map(Number):null}
function compare(a,b){for(let i=0;i<3;i++){if(a[i]>b[i])return 1;if(a[i]<b[i])return -1}return 0}
const candidate=parse(version);
if(!candidate) process.exit(1);
for(const key of ["macosNativeOfficialInstallerExperimental","macosNativeExperimental","windowsNativeExperimental"]){
  const entry=data[key];
  if(!entry||entry.platform!==platform) continue;
  const floor=parse(entry.floor);
  if(!floor) continue;
  if(compare(candidate,floor)>=0) process.exit(0);
}
process.exit(1);
'@
    Invoke-JsScript -Code $code -Args @($supportFile, $Version, $Platform) | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Get-NativeHash($BinaryPath) {
    $helperFile = Join-Path $PluginRoot "bun-binary-io.js"
    if (-not (Test-Path $helperFile)) { return "unknown" }
    $value = ((node $helperFile hash "$BinaryPath" 2>$null) | Out-String).Trim()
    if ($value) { return $value }
    return "unknown"
}

function Test-NativeMarkerCurrent($Marker, $Version, $Hash, $Revision, $Mode, $Platform) {
    if ($Mode -eq "provisional") {
        return $Marker -like "native|${Version}|${Hash}|${Revision}|provisional|${Platform}|*"
    }
    return $Marker -eq "native|${Version}|${Hash}|${Revision}"
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

function Invoke-NativePatch($Target) {
    $helperFile = Join-Path $PluginRoot "bun-binary-io.js"
    $patchFile = Join-Path $PluginRoot "patch-cli.js"
    if (-not (Test-Path $helperFile) -or -not (Test-Path $patchFile)) { return "" }

    $version = Read-NativeVersion $Target
    $platform = Get-NativePlatform
    $mode = ""
    if (Test-SupportedNativeVersion $version $platform) {
        $mode = "verified"
    } elseif (Test-ProvisionalNativeVersion $version $platform) {
        $mode = "provisional"
    }
    if (-not $mode) { return "" }

    $revision = Get-PatchRevision $PluginRoot
    if (-not $revision) { $revision = "unknown" }
    $currentHash = Get-NativeHash $Target
    $marker = ""
    if (Test-Path $MarkerFile) {
        $marker = [System.IO.File]::ReadAllText($MarkerFile, [System.Text.Encoding]::UTF8).Trim()
    }
    if (Test-NativeMarkerCurrent $marker $version $currentHash $revision $mode $platform) { return "" }

    $depStatus = ((node $helperFile check-deps 2>$null) | Out-String).Trim()
    if ($depStatus -ne "ok") { return "" }

    $backupFile = "${Target}.zh-cn-backup"
    $backupVersion = if (Test-Path $backupFile) { Read-NativeVersion $backupFile } else { "" }
    try {
        if ((Test-Path $backupFile) -and $backupVersion -eq $version) {
            Copy-Item $backupFile $Target -Force -ErrorAction Stop
        } else {
            Copy-Item $Target $backupFile -Force -ErrorAction Stop
        }
    } catch {
        return ""
    }

    $sourceHash = Get-NativeHash $Target
    $tmpJs = Join-Path ([System.IO.Path]::GetTempPath()) ("claude-zh-cn-repatch-" + [System.IO.Path]::GetRandomFileName() + ".js")
    $statusFile = Join-Path ([System.IO.Path]::GetTempPath()) ("cczh-native-patch-status-" + [System.IO.Path]::GetRandomFileName())
    $logFile = Join-Path $StateRoot "patch.log"

    try {
        node $helperFile extract "$Target" "$tmpJs" 2>$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Copy-Item $backupFile $Target -Force -ErrorAction SilentlyContinue
            return ""
        }

        $patchCountText = ((node $patchFile "$tmpJs" "$PluginRoot\cli-translations.json" --status "$statusFile" --log "$logFile" 2>$null) | Out-String).Trim()
        $patchCount = 0
        [int]::TryParse($patchCountText, [ref]$patchCount) | Out-Null
        $patchStatus = ""
        if (Test-Path $statusFile) { $patchStatus = (Get-Content $statusFile -Raw).Trim() }
        if (-not $patchStatus) { $patchStatus = if ($patchCount -gt 0) { "ok" } else { "noop" } }
        if (@("ok", "partial", "noop") -notcontains $patchStatus) { return "" }

        if ($patchCount -gt 0) {
            node $helperFile repack "$Target" "$tmpJs" 2>$null | Out-Null
            if ($LASTEXITCODE -ne 0 -or (Read-NativeVersionFromExecution $Target) -ne $version) {
                Copy-Item $backupFile $Target -Force -ErrorAction SilentlyContinue
                return ""
            }
        }

        $finalHash = Get-NativeHash $Target
        $finalMarker = "native|${version}|${finalHash}|${revision}"
        if ($mode -eq "provisional") {
            $finalMarker = "${finalMarker}|provisional|${platform}|${sourceHash}"
        }
        $finalMarker | Out-File -FilePath $MarkerFile -Encoding ascii -NoNewline

        if ($mode -eq "provisional") {
            return "（新版本已本机自验证，自动 patch ${patchCount} 处；未覆盖文案继续显示英文）"
        }
        if ($patchStatus -eq "partial") {
            return "（已自动 patch ${patchCount} 处；未覆盖文案继续显示英文）"
        }
        if ($patchCount -gt 0) {
            return "（已自动 patch ${patchCount} 处硬编码文字，启动自检通过）"
        }
        return ""
    } finally {
        Remove-Item $tmpJs, $statusFile -Force -ErrorAction SilentlyContinue
    }
}

# ======== Auto Update ========
$AutoUpdateMsg = ""

if ($env:CLAUDE_PLUGIN_DATA -and $env:ZH_CN_DISABLE_AUTO_UPDATE -ne "1") {
    $now = [DateTimeOffset]::Now.ToUnixTimeSeconds()
    $last = 0
    if (Test-Path $LastUpdateCheckFile) {
        $raw = [System.IO.File]::ReadAllText($LastUpdateCheckFile, [System.Text.Encoding]::UTF8) -replace '\r?\n', ''
        [int]::TryParse($raw, [ref]$last) | Out-Null
    }
    $shouldCheck = ($UpdateCheckInterval -eq 0) -or (($now - $last) -ge $UpdateCheckInterval)
    if ($shouldCheck) {
        [string]$now | Out-File -FilePath $LastUpdateCheckFile -Encoding ascii -NoNewline
        $pluginCli = Find-RealClaudeBinary
        $updated = $false
        if ($pluginCli) {
            $marketplaceResult = Invoke-CommandWithTimeout `
                -FilePath $pluginCli `
                -Arguments @("plugin", "marketplace", "update", $OfficialMarketplaceName) `
                -TimeoutSeconds $PluginUpdateTimeoutSeconds
            if ($marketplaceResult.Success) {
                $pluginUpdateResult = Invoke-CommandWithTimeout `
                    -FilePath $pluginCli `
                    -Arguments @("plugin", "update", $OfficialPluginId, "--scope", "user") `
                    -TimeoutSeconds $PluginUpdateTimeoutSeconds
                if ($pluginUpdateResult.Success) {
                    $updateOutput = $pluginUpdateResult.Output
                    $updated = $true
                    if ($updateOutput -notmatch "already at the latest|latest version|已是最新") {
                        $AutoUpdateMsg = "插件更新已由 Claude plugin manager 下载，将在下次会话生效"
                    }
                }
            }
        }
        $updateStatus = if ($updated) { "ok marketplace ${now}" } else { "update_failed marketplace ${now}" }
        $updateStatus | Out-File -FilePath (Join-Path $StateRoot ".last-update-status") -Encoding ascii -NoNewline
    }
}

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
            $null = Invoke-CommandWithTimeout `
                -FilePath "git" `
                -Arguments @("-C", $SourceRepo, "fetch", "--tags", "--quiet") `
                -TimeoutSeconds $PluginUpdateTimeoutSeconds
            # 拉取超时仍可使用本地已有 tag；不会让 SessionStart 一直等待网络。
            $LatestTag = (git -C $SourceRepo tag -l 'v*' --sort=-version:refname 2>$null | Select-Object -First 1)
            $LatestVersion = $LatestTag -replace '^v', ''
            if ($LatestTag -and $LatestVersion -and $LocalVersion -match '^\d+\.\d+\.\d+' -and $LatestVersion -match '^\d+\.\d+\.\d+') {
                if (Test-VersionIsNewer $LocalVersion $LatestVersion) {
                    "available v${LatestVersion} ${now}" | Out-File `
                        -FilePath (Join-Path $StateRoot ".last-update-status") -Encoding ascii -NoNewline
                    $AutoUpdateMsg = "检测到插件 v${LatestVersion}（当前 v${LocalVersion}）。为避免会话启动途中覆盖插件，本次未自动安装；会话结束后在源码目录运行 git pull，再重跑 install.ps1"
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
    if ($Kind -eq "native-bun" -and $Target -and (Test-Path $Target)) {
        # Windows 会锁住正在运行的 claude.exe；SessionStart 现场写回必然失败，
        # 因此这里只记录明确交接。关闭 Claude 后由 install.ps1 完成同一套自检与回滚事务。
        $pendingVersion = Read-NativeVersion $Target
        $pendingPlatform = Get-NativePlatform
        $pendingMode = ""
        if (Test-SupportedNativeVersion $pendingVersion $pendingPlatform) {
            $pendingMode = "verified"
        } elseif (Test-ProvisionalNativeVersion $pendingVersion $pendingPlatform) {
            $pendingMode = "provisional"
        }

        if ($pendingMode) {
            $pendingRevision = Get-PatchRevision $PluginRoot
            if (-not $pendingRevision) { $pendingRevision = "unknown" }
            $pendingHash = Get-NativeHash $Target
            $stateMarker = if (Test-Path $MarkerFile) {
                [System.IO.File]::ReadAllText($MarkerFile, [System.Text.Encoding]::UTF8).Trim()
            } else { "" }
            $legacyMarkerFile = Join-Path $LegacyPluginRoot ".patched-version"
            $legacyMarker = if (Test-Path $legacyMarkerFile) {
                [System.IO.File]::ReadAllText($legacyMarkerFile, [System.Text.Encoding]::UTF8).Trim()
            } else { "" }

            if ((Test-NativeMarkerCurrent $stateMarker $pendingVersion $pendingHash $pendingRevision $pendingMode $pendingPlatform) -or
                (Test-NativeMarkerCurrent $legacyMarker $pendingVersion $pendingHash $pendingRevision $pendingMode $pendingPlatform)) {
                if ($legacyMarker -and $stateMarker -ne $legacyMarker) {
                    $legacyMarker | Out-File -FilePath $MarkerFile -Encoding ascii -NoNewline
                }
                Remove-Item $NativePatchPendingFile -Force -ErrorAction SilentlyContinue
            } else {
                @{
                    version = $pendingVersion
                    target = $Target
                    reason = "running-executable-locked"
                    recordedAt = [DateTimeOffset]::Now.ToUnixTimeSeconds()
                } | ConvertTo-Json -Compress | Out-File -FilePath $NativePatchPendingFile -Encoding utf8
                $AutoPatchMsg = "（Windows 不改写正在运行的 claude.exe；本次保持原版可用。关闭所有 Claude Code 窗口后，按 https://github.com/taekchef/claude-code-zh-cn#windows-原生安装 重跑 install.ps1，即可安全补上仍能匹配的中文文案）"
            }
        } else {
            Remove-Item $NativePatchPendingFile -Force -ErrorAction SilentlyContinue
            $AutoPatchMsg = "（Windows native 当前格式或版本无法进入本机自验证；本次不改写正在运行的 claude.exe，Layer 1~3 继续生效）"
        }
    } elseif ($Kind -eq "npm" -and $Target -and (Test-Path $Target)) {
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
                # 备份/恢复/语法校验/失败回滚统一由 patch-cli.js 托管（--backup 模式）
                $statusFile = Join-Path ([System.IO.Path]::GetTempPath()) ("cczh-patch-status-" + [System.IO.Path]::GetRandomFileName())
                $patchCount = node "$PluginRoot\patch-cli.js" "$Target" "$PluginRoot\cli-translations.json" --backup "$Target.zh-cn-backup" --status $statusFile 2>$null
                $patchStatus = "error"
                if (Test-Path $statusFile) {
                    $patchStatus = (Get-Content $statusFile -Raw).Trim()
                    Remove-Item $statusFile -Force -ErrorAction SilentlyContinue
                }
                switch ($patchStatus) {
                    "ok" {
                        "$CurrentMarker" | Out-File -FilePath $MarkerFile -Encoding ascii -NoNewline
                        if ($patchCount -and [int]$patchCount -gt 0) {
                            $AutoPatchMsg = "（已自动 patch ${patchCount} 处硬编码文字）"
                        }
                    }
                    "noop" {
                        "$CurrentMarker" | Out-File -FilePath $MarkerFile -Encoding ascii -NoNewline
                    }
                    "partial" {
                        # 部分降级：当前版本存在未覆盖文案，不更新 marker，等插件更新后重试
                        $AutoPatchMsg = "（已自动 patch ${patchCount} 处；当前 Claude Code 版本存在未覆盖文案，部分界面保持英文，等待插件更新）"
                    }
                    default {
                        # validation-failed / error：未写盘，CLI 保持原样可用；详情见 patch.log
                    }
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
