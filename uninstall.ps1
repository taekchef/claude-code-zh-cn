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

# 3. 从 settings.json 精准移除插件注入的设置项
if (Test-Path $SettingsFile) {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $env:ZH_CN_SETTINGS = $SettingsFile
        $env:ZH_CN_PLUGIN_DST = $PluginDst
        node -e @"
const fs=require('fs');
const settingsFile=process.env.ZH_CN_SETTINGS;
const pluginRoot=process.env.ZH_CN_PLUGIN_DST||'';

function isObject(value){
  return value&&typeof value==='object'&&!Array.isArray(value);
}

function readSettings(file){
  const raw=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
  return raw.trim()?JSON.parse(raw):{};
}

function normalizePath(value){
  return String(value||'').replace(/\\/g,'/').replace(/\/+$/,'');
}

const pluginRootNormalized=normalizePath(pluginRoot);
let settings=readSettings(settingsFile);
if(!isObject(settings)) settings={};

let changed=false;
for(const k of ['language','spinnerTipsEnabled','spinnerTipsOverride','spinnerVerbs']){
  if(Object.prototype.hasOwnProperty.call(settings,k)){
    delete settings[k];
    changed=true;
  }
}

if(isObject(settings.enabledPlugins)&&Object.prototype.hasOwnProperty.call(settings.enabledPlugins,'claude-code-zh-cn@local-zh-cn')){
  delete settings.enabledPlugins['claude-code-zh-cn@local-zh-cn'];
  if(Object.keys(settings.enabledPlugins).length===0) delete settings.enabledPlugins;
  changed=true;
}

if(isObject(settings.extraKnownMarketplaces)&&Object.prototype.hasOwnProperty.call(settings.extraKnownMarketplaces,'local-zh-cn')){
  delete settings.extraKnownMarketplaces['local-zh-cn'];
  if(Object.keys(settings.extraKnownMarketplaces).length===0) delete settings.extraKnownMarketplaces;
  changed=true;
}

function commandBelongsToPlugin(command){
  if(typeof command!=='string') return false;
  const normalized=normalizePath(command);
  return normalized.indexOf('claude-code-zh-cn')!==-1 ||
    normalized.indexOf('local-zh-cn')!==-1 ||
    (normalized.indexOf('CLAUDE_PLUGIN_ROOT')!==-1&&normalized.indexOf('/hooks/')!==-1) ||
    (pluginRootNormalized&&normalized.indexOf(pluginRootNormalized)!==-1);
}

function cleanHookEntry(entry){
  if(!isObject(entry)||!Array.isArray(entry.hooks)){
    return {entry:entry,changed:false,keep:true};
  }

  const hooks=entry.hooks.filter(function(hook){
    return !(isObject(hook)&&commandBelongsToPlugin(hook.command));
  });
  if(hooks.length===entry.hooks.length){
    return {entry:entry,changed:false,keep:true};
  }
  if(hooks.length===0){
    return {changed:true,keep:false};
  }
  return {entry:Object.assign({},entry,{hooks:hooks}),changed:true,keep:true};
}

if(isObject(settings.hooks)){
  for(const eventName of Object.keys(settings.hooks)){
    const entries=settings.hooks[eventName];
    if(!Array.isArray(entries)) continue;
    const nextEntries=[];
    let eventChanged=false;
    for(const entry of entries){
      const result=cleanHookEntry(entry);
      if(result.changed) eventChanged=true;
      if(result.keep) nextEntries.push(result.entry);
    }
    if(eventChanged){
      changed=true;
      if(nextEntries.length>0) settings.hooks[eventName]=nextEntries;
      else delete settings.hooks[eventName];
    }
  }
  if(Object.keys(settings.hooks).length===0){
    delete settings.hooks;
    changed=true;
  }
}

if(changed) fs.writeFileSync(settingsFile,JSON.stringify(settings,null,2)+'\n');
"@
        Remove-Item Env:\ZH_CN_SETTINGS -ErrorAction SilentlyContinue
        Remove-Item Env:\ZH_CN_PLUGIN_DST -ErrorAction SilentlyContinue
        Write-Host "已从 settings.json 移除中文设置（保留其他配置）" -ForegroundColor Green
    } elseif (Get-Command jq -ErrorAction SilentlyContinue) {
        $tempFile = "$SettingsFile.tmp"
        $jqFilter = @'
def normalize_path:
  tostring | gsub("\\\\"; "/") | sub("/+$"; "");

def plugin_command:
  if type != "string" then false
  else
    (normalize_path) as $command |
    ($command | contains("claude-code-zh-cn")) or
    ($command | contains("local-zh-cn")) or
    (($command | contains("CLAUDE_PLUGIN_ROOT")) and ($command | contains("/hooks/"))) or
    (($pluginRoot | normalize_path | length) > 0 and ($command | contains($pluginRoot | normalize_path)))
  end;

def clean_hook_entry:
  if type == "object" and (.hooks | type) == "array" then
    (.hooks |= map(select(((.command? // null) | plugin_command) | not)))
    | select((.hooks | length) > 0)
  else
    .
  end;

del(.language, .spinnerTipsEnabled, .spinnerTipsOverride, .spinnerVerbs)
| if (.enabledPlugins | type) == "object" then
    .enabledPlugins |= del(."claude-code-zh-cn@local-zh-cn")
    | if (.enabledPlugins | length) == 0 then del(.enabledPlugins) else . end
  else . end
| if (.extraKnownMarketplaces | type) == "object" then
    .extraKnownMarketplaces |= del(."local-zh-cn")
    | if (.extraKnownMarketplaces | length) == 0 then del(.extraKnownMarketplaces) else . end
  else . end
| if (.hooks | type) == "object" then
    .hooks |= with_entries(
      if (.value | type) == "array" then
        (.value | map(clean_hook_entry)) as $next |
        if ($next == .value) then .
        elif ($next | length) > 0 then .value = $next
        else empty
        end
      else .
      end
    )
    | if (.hooks | length) == 0 then del(.hooks) else . end
  else . end
'@
        jq --arg pluginRoot $PluginDst $jqFilter $SettingsFile | Out-File -FilePath $tempFile -Encoding utf8 -NoNewline
        Move-Item $tempFile $SettingsFile -Force
        Write-Host "已从 settings.json 移除中文设置（保留其他配置）" -ForegroundColor Green
    } else {
        Write-Host "请手动编辑 $SettingsFile 移除以下字段：" -ForegroundColor Yellow
        Write-Host "  - language"
        Write-Host "  - spinnerTipsEnabled"
        Write-Host "  - spinnerTipsOverride"
        Write-Host "  - spinnerVerbs"
        Write-Host "  - 本插件写入的 hooks / enabledPlugins / extraKnownMarketplaces 项"
    }
}

# 4. 还原 cli.js（从备份恢复）
$RESTORED = $false

# 试 npm 全局 claude
$claudeBin = (Get-Command claude -ErrorAction SilentlyContinue).Source
if ($claudeBin) {
    # 试原生二进制备份
    if (Test-Path "${claudeBin}.zh-cn-backup") {
        Copy-Item "${claudeBin}.zh-cn-backup" $claudeBin -Force
        Remove-Item "${claudeBin}.zh-cn-backup" -Force
        Write-Host "已还原二进制" -ForegroundColor Green
        $RESTORED = $true
    }
}

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
    } elseif ($cliFile -and (Test-Path $cliFile)) {
        Write-Host "cli.js 没有备份文件，建议运行以下命令还原：" -ForegroundColor Yellow
        Write-Host "  npm install -g @anthropic-ai/claude-code"
    }
}

# 5. 移除插件目录
if (Test-Path $PluginDst) {
    Remove-Item -Recurse -Force $PluginDst
    Write-Host "已移除插件目录" -ForegroundColor Green
}

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
