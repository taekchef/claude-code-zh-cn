#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const defaultReadmePath = path.join(repoRoot, "README.md");
const defaultConfigPath = path.join(repoRoot, "scripts", "upstream-compat.config.json");
const markers = ["badges", "support-systems", "install-advice"];

function fail(message) {
  throw new Error(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function parseArgs(argv) {
  const args = {
    write: false,
    readme: defaultReadmePath,
    config: defaultConfigPath,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--write") {
      args.write = true;
      continue;
    }
    if (arg === "--check") {
      args.write = false;
      continue;
    }
    if (arg === "--readme") {
      args.readme = path.resolve(argv[++i]);
      continue;
    }
    if (arg === "--config") {
      args.config = path.resolve(argv[++i]);
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/sync-readme-support-window.js [--check|--write] [--readme README.md] [--config scripts/upstream-compat.config.json]",
    "",
    "Checks or rewrites README support-window snippets from scripts/upstream-compat.config.json.",
    "Generated blocks:",
    "- README support badges",
    "- README support system choice table",
    "- README install advice table",
    "",
  ].join("\n");
}

function requireEntry(entry, label) {
  if (!entry || typeof entry !== "object") {
    fail(`Missing support entry: ${label}`);
  }
  return entry;
}

function supportEntries(config) {
  const support = config.support || {};
  return {
    npmStable: requireEntry(support.npm?.stable, "support.npm.stable"),
    macosInstaller: requireEntry(
      support.macosOfficialInstaller?.experimental || support.macosOfficialInstaller,
      "support.macosOfficialInstaller"
    ),
    macosNative: support.macosNativeExperimental || null,
    linuxInstaller: requireEntry(support.linuxOfficialInstaller, "support.linuxOfficialInstaller"),
    windowsNpm: requireEntry(
      support.windowsNpmPowerShell?.stable || support.windowsNpmPowerShell,
      "support.windowsNpmPowerShell"
    ),
    windowsNative: requireEntry(support.windowsNativeExe, "support.windowsNativeExe"),
    windowsNativeExperimental: support.windowsNativeExperimental || null,
  };
}

function isSemver(version) {
  return /^\d+\.\d+\.\d+$/.test(String(version || ""));
}

function semverParts(version) {
  if (!isSemver(version)) return null;
  return version.split(".").map((part) => Number.parseInt(part, 10));
}

function renderRange(entry) {
  if (!entry || entry.unsupported) return "-";
  if (entry.floor && entry.ceiling) {
    return `${entry.floor} - ${entry.ceiling}`;
  }
  return entry.floor || entry.ceiling || "-";
}

function renderBadgeRange(entry) {
  return renderRange(entry).replace(/ - /g, "--").replace(/\s+/g, "%20");
}

function renderBadges(config) {
  const { npmStable, macosNative, windowsNativeExperimental } = supportEntries(config);
  const lines = [
    `[![npm](https://img.shields.io/badge/npm-${renderBadgeRange(
      npmStable
    )}-green)](./docs/support-matrix.md)`,
  ];

  if (macosNative && macosNative.unsupported !== true) {
    lines.push(
      `[![macOS native](https://img.shields.io/badge/macos%20native-${renderBadgeRange(
        macosNative
      )}-green)](./docs/support-matrix.md)`
    );
  }

  if (windowsNativeExperimental && windowsNativeExperimental.unsupported !== true) {
    lines.push(
      `[![Windows native](https://img.shields.io/badge/windows%20native-${renderBadgeRange(
        windowsNativeExperimental
      )}-green)](./docs/support-matrix.md)`
    );
  }

  return lines.join("\n");
}

function renderSupportSystems(config) {
  const {
    npmStable,
    macosInstaller,
    macosNative,
    windowsNpm,
    windowsNativeExperimental,
  } = supportEntries(config);
  const stablePinned = npmStable.ceiling || npmStable.representatives?.at(-1) || npmStable.floor;
  const nativeBoundary = nextMajorBoundary(npmStable);
  const hasExcluded =
    (macosNative?.excluded?.length || 0) + (windowsNativeExperimental?.excluded?.length || 0) > 0;

  return [
    "| 平台 / 安装形态 | 已验证版本窗口 | 说明 |",
    "|------|-----------|------|",
    `| macOS / Linux / WSL · npm 全局安装 | \`${renderRange(npmStable)}\` | 翻译最完整；launcher 启动前自修复 + \`session-start\` 兜底 |`,
    `| macOS · 官方安装器（native） | \`${renderRange(macosInstaller)}\` | 需要 \`node-lief\` |`,
    ...(macosNative && macosNative.unsupported !== true
      ? [
          `| macOS · native binary（arm64） | \`${renderRange(macosNative)}\` 内的已验证版本 | 需要 \`node-lief\`；个别版本未收录，见支持矩阵 |`,
        ]
      : []),
    `| Windows · npm（PowerShell） | \`${renderRange(windowsNpm)}\` | 用 install.ps1，需 PowerShell 5.1+ |`,
    ...(windowsNativeExperimental && windowsNativeExperimental.unsupported !== true
      ? [
          `| Windows · native .exe（x64） | \`${renderRange(windowsNativeExperimental)}\` 内的已验证版本 | 需要 \`node-lief\`；个别版本未收录，见支持矩阵 |`,
        ]
      : [
          "| Windows · native .exe（x64） | 暂无已验证版本 | 会明确跳过 CLI Patch，仅 Layer 1~3 生效 |",
        ]),
    "| Linux · 官方安装器 | 暂无已验证版本 | 仅 Layer 1~3 生效 |",
    "",
    "> - **已验证窗口不是运行门禁**：同一 `major.minor` 版本线的新 native 版本会先在本机临时提取、翻译、重打包并执行启动自检；通过后才替换。已有词条继续中文，新文案原样保留英文。",
    "> - **失败不伤 CLI**：补丁、重打包或启动自检任一步失败，都会保留或恢复原文件；失败只影响中文覆盖，不影响 Claude Code 使用。",
    "> - **跨版本线保守处理**：例如从 `2.1.x` 升到 `2.2.x` 或 `3.x` 时，不做原生 Layer 4 patch，Layer 1~3 继续生效。",
    "> - **矩阵只记录证据**：纯上游兼容证据可以更新支持矩阵，不要求插件升版；只有插件代码、翻译或 manifest 变化才发布新版。",
    `> - **已验证版本完整清单**${hasExcluded ? "（含个别未收录版本）" : ""}见 [docs/support-matrix.md](./docs/support-matrix.md)，由脚本自动生成。`,
    `> - Claude Code 从 \`${nativeBoundary}\` 起 npm 主包切换为 native binary，不再包含旧的 \`cli.js\`；要最完整的翻译请用 \`npm install -g @anthropic-ai/claude-code@${stablePinned}\`。`,
  ].join("\n");
}

function nextMajorBoundary(entry) {
  const ceiling = entry.ceiling || entry.representatives?.at(-1);
  const parts = semverParts(ceiling);
  if (!parts) return "2.1.113";
  parts[2] += 1;
  return parts.join(".");
}

function renderInstallAdvice(config) {
  const { npmStable, macosInstaller, macosNative, windowsNativeExperimental } = supportEntries(config);
  const stablePinned = npmStable.ceiling || npmStable.representatives?.at(-1) || npmStable.floor;
  const macosInstallerPinned = macosInstaller.ceiling || stablePinned;

  return [
    "| 安装方式 | 中文化程度 |",
    "|---------|-----------|",
    `| \`npm install -g @anthropic-ai/claude-code@${stablePinned}\` | 最完整（推荐） |`,
    "| `npm install -g @anthropic-ai/claude-code`（latest） | 同一版本线先本机自检；已知文案继续中文，新文案保留英文 |",
    `| \`curl -fsSL https://claude.ai/install.sh \\| bash -s ${macosInstallerPinned}\` | 官方安装器指定已验证旧版本（需要 \`node-lief\`） |`,
    "| `curl -fsSL https://claude.ai/install.sh \\| sh`（latest） | 同一版本线先本机自检再启用 CLI Patch；跨版本线只保留 Layer 1~3 |",
    ...(windowsNativeExperimental && windowsNativeExperimental.unsupported !== true
      ? [
          `| \`powershell -File install.ps1\` | Windows：旧 npm cli.js 最完整；native .exe \`${renderRange(windowsNativeExperimental)}\` 内已验证版本需 \`node-lief\` |`,
        ]
      : [
          "| `powershell -File install.ps1` | Windows：旧 npm cli.js 最完整；native .exe 会跳过 CLI Patch |",
        ]),
    ...(macosNative && macosNative.unsupported !== true
      ? [
          "",
          `> **native binary 说明**：官方安装器和新版 npm 包装到的是 native 二进制。插件会提取其中的 JS → 翻译 → 写回，并做启动自检；补丁、重打包或自检失败会恢复原文件。macOS arm64 已验证 \`${renderRange(macosNative)}\` 内的版本（完整清单见[支持矩阵](./docs/support-matrix.md)），同一 \`major.minor\` 新版可本机自检，需要 \`node-lief\`。`,
        ]
      : []),
    "",
    "安装脚本会自动检测安装方式，无需手动选择。",
  ].join("\n");
}

function renderBlocks(config) {
  return {
    badges: renderBadges(config),
    "support-systems": renderSupportSystems(config),
    "install-advice": renderInstallAdvice(config),
  };
}

function replaceBlock(text, name, body) {
  const start = `<!-- readme-support-window:${name}:start -->`;
  const end = `<!-- readme-support-window:${name}:end -->`;
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    fail(`README missing generated block markers for ${name}`);
  }

  return `${text.slice(0, startIndex + start.length)}\n${body}\n${text.slice(endIndex)}`;
}

function syncReadme(text, config) {
  const blocks = renderBlocks(config);
  let next = text;
  for (const name of markers) {
    next = replaceBlock(next, name, blocks[name]);
  }
  return next;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const config = readJson(args.config);
  const original = fs.readFileSync(args.readme, "utf8");
  const next = syncReadme(original, config);

  if (next !== original) {
    if (args.write) {
      fs.writeFileSync(args.readme, next);
      process.stdout.write(`readme support window updated: ${path.relative(repoRoot, args.readme)}\n`);
    } else {
      console.error(`${path.relative(repoRoot, args.readme)}: README support window is stale`);
      console.error("run `node scripts/sync-readme-support-window.js --write` to refresh README");
      process.exit(1);
    }
  }

  process.stdout.write("readme support window OK\n");
}

try {
  main();
} catch (error) {
  console.error(`sync-readme-support-window: ${error.message}`);
  process.exit(1);
}
