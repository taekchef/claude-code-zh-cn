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

function renderRangeWithExcluded(entry, { code = true } = {}) {
  const range = renderRange(entry);
  const wrapped = code && range !== "-" ? `\`${range}\`` : range;
  const excluded = Array.isArray(entry?.excluded) && entry.excluded.length > 0
    ? `（不含未发布的 ${entry.excluded.map((version) => `\`${version}\``).join("、")}）`
    : "";
  return `${wrapped}${excluded}`;
}

function renderNativeInstallLabel(entry) {
  const range = renderRange(entry);
  if (range === "-") return "-";
  const excluded = Array.isArray(entry?.excluded) && entry.excluded.length > 0
    ? `，不含未发布的 ${entry.excluded.map((version) => `\`${version}\``).join("、")}`
    : "";
  return `\`${range}\`（macOS arm64${excluded}）`;
}

function renderBadgeRange(entry) {
  return renderRange(entry).replace(/ - /g, "--").replace(/\s+/g, "%20");
}

function compactVersions(versions) {
  if (!Array.isArray(versions) || versions.length === 0) return "-";

  const ranges = [];
  let start = versions[0];
  let previous = versions[0];

  function pushRange() {
    ranges.push(start === previous ? `\`${start}\`` : `\`${start} - ${previous}\``);
  }

  for (const version of versions.slice(1)) {
    const prevParts = semverParts(previous);
    const parts = semverParts(version);
    const isConsecutive =
      prevParts &&
      parts &&
      prevParts[0] === parts[0] &&
      prevParts[1] === parts[1] &&
      parts[2] === prevParts[2] + 1;

    if (isConsecutive) {
      previous = version;
      continue;
    }

    pushRange();
    start = version;
    previous = version;
  }

  pushRange();
  return ranges.join("、");
}

function parseNativeDisplayAudit(entry) {
  if (!entry || entry.unsupported) return null;

  const displayPairs = [...String(entry.verification || "").matchAll(/display\s+(\d+)\/(\d+)/g)].map((match) => [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
  ]);
  if (displayPairs.length === 0) {
    fail("macOS native experimental verification must include display audit counts");
  }

  const uniquePairs = new Set(displayPairs.map((pair) => pair.join("/")));
  if (uniquePairs.size !== 1) {
    fail("macOS native experimental display audit counts must be consistent before syncing README");
  }

  const [passed, total] = displayPairs[0];
  return { passed, total };
}

function renderBadges(config) {
  const { npmStable, macosNative } = supportEntries(config);
  const lines = [
    `[![npm stable](https://img.shields.io/badge/npm%20stable-${renderBadgeRange(
      npmStable
    )}-green)](./docs/support-matrix.md)`,
    `[![macOS installer](https://img.shields.io/badge/macos%20installer-experimental-yellow)](./docs/support-matrix.md)`,
  ];

  if (macosNative && macosNative.unsupported !== true) {
    lines.push(
      `[![macOS native](https://img.shields.io/badge/macos%20native-${renderBadgeRange(
        macosNative
      )}%20experimental-yellow)](./docs/support-matrix.md)`
    );
  }

  return lines.join("\n");
}

function renderSupportSystems(config) {
  const {
    npmStable,
    macosInstaller,
    macosNative,
    linuxInstaller,
    windowsNpm,
    windowsNative,
  } = supportEntries(config);
  const stablePinned = npmStable.ceiling || npmStable.representatives?.at(-1) || npmStable.floor;
  const macosNativeRange = macosNative && macosNative.unsupported !== true
    ? renderRangeWithExcluded(macosNative)
    : "-";
  const macosVerified = macosNative && macosNative.unsupported !== true
    ? compactVersions(macosNative.representatives)
    : "-";
  const macosNativeAudit = parseNativeDisplayAudit(macosNative);
  const macosExcluded = macosNative?.excluded?.length
    ? `${macosNative.excluded.map((version) => `\`${version}\``).join("、")} 官方未发布；`
    : "";
  const nativeBoundary = nextMajorBoundary(npmStable);
  const nativeLatestNote = macosNative && macosNative.unsupported !== true
    ? `本插件当前 stable CLI Patch 支持到 \`${npmStable.ceiling}\`；macOS arm64 native binary 现在有独立 experimental 通道，已验证 ${macosVerified} 的二进制改写链路和 ${macosNativeAudit.total} 个稳定显示面。${macosExcluded}\`latest\` 不是 stable 承诺，未验证的新版本会跳过 CLI Patch。`
    : `本插件当前 stable CLI Patch 支持到 \`${npmStable.ceiling}\`；\`latest\` 不是 stable 承诺，未验证的新版本会跳过 CLI Patch。`;

  return [
    "| 系统 / 通道 | 当前口径 | 已验证窗口 | 说明 |",
    "|------|---------|-----------|------|",
    `| macOS / npm 全局安装 | \`stable\` | ${renderRangeWithExcluded(npmStable)} | 启动前 launcher 自修复 + \`session-start\` 二层兜底 |`,
    `| macOS / 官方安装器 | \`experimental\` | ${renderRangeWithExcluded(macosInstaller)} | 指定旧版本的 native 二进制已验证；插件可用 native patch 处理，需要 \`node-lief\`，稳定仍建议 npm pinned |`,
    ...(macosNative && macosNative.unsupported !== true
      ? [
          `| macOS / native binary | \`experimental\` | ${macosNativeRange} | 当前 macOS arm64 native 已验证 extract / patch / repack / \`--version\` + ${macosNativeAudit.total} 个稳定显示面审计；需要 \`node-lief\`；未验证新版本会安全跳过 CLI Patch |`,
        ]
      : []),
    `| Linux / npm 全局安装 | \`stable\` | ${renderRangeWithExcluded(npmStable)} | 与 npm stable 同口径 |`,
    `| Linux / 官方安装器 | \`unsupported\` | ${renderRangeWithExcluded(linuxInstaller)} | 当前不承诺支持 |`,
    `| Windows / npm 全局安装 (PowerShell) | \`stable\` | ${renderRangeWithExcluded(windowsNpm)} | 新增 PowerShell 安装脚本（install.ps1）；适用于旧 npm cli.js 形态，CLI Patch 可用；需 PowerShell 5.1+ |`,
    `| Windows / native .exe / latest | \`unsupported\` | ${renderRangeWithExcluded(windowsNative)} | 检测到 Windows native .exe 或 \`${nativeBoundary}+\` 时会跳过 CLI Patch，仅启用 Layer 1~3（设置 + Hook + 插件） |`,
    `| Windows / WSL + npm 全局安装 | 跟随 npm \`stable\` | ${renderRangeWithExcluded(npmStable)} | **必须在 WSL 终端内运行**，使用 install.sh |`,
    "",
    `> **Windows 用户（原生 PowerShell）**：现已新增 PowerShell 安装脚本（install.ps1），可在 Windows 10/11 上原生安装**旧 npm cli.js 形态**的 Claude Code（${renderRangeWithExcluded(windowsNpm)}），无需 WSL。见下方「Windows 原生安装」章节。`,
    ">",
    "> **Windows 用户（WSL）**：也可先安装 [WSL](https://learn.microsoft.com/zh-cn/windows/wsl/install)，然后在 WSL 中安装 Claude Code 和本插件。",
    ">",
    `> **Windows native .exe / latest 不支持 CLI Patch**：${windowsNative.notes || "Windows native .exe 目前会明确跳过 CLI Patch，仅启用 Layer 1~3。"}如需完整中文化，请使用 \`npm install -g @anthropic-ai/claude-code@${stablePinned}\` 安装旧 npm 版本。`,
    ">",
    "> **支持边界单一来源**：当前口径以 [docs/support-matrix.md](./docs/support-matrix.md) 为准。该文档由 `scripts/upstream-compat.config.json` + `node scripts/verify-upstream-compat.js --json` 通过 `node scripts/generate-support-matrix.js` 生成。",
    ">",
    `> **最新版说明**：Claude Code 从 \`${nativeBoundary}\` 开始，npm 主包切换为 native binary wrapper，不再包含旧的 \`cli.js\`。${nativeLatestNote}`,
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
  const { npmStable, macosInstaller, macosNative } = supportEntries(config);
  const stablePinned = npmStable.ceiling || npmStable.representatives?.at(-1) || npmStable.floor;
  const macosInstallerPinned = macosInstaller.ceiling || stablePinned;
  const macosNativeRange = macosNative && macosNative.unsupported !== true
    ? renderRangeWithExcluded(macosNative)
    : "-";
  const macosVerified = macosNative && macosNative.unsupported !== true
    ? compactVersions(macosNative.representatives)
    : "-";
  const macosNativeAudit = parseNativeDisplayAudit(macosNative);

  return [
    "当前安装方式口径如下：",
    "",
    "| 安装方式 | 说明 | 当前口径 |",
    "|---------|------|---------|",
    `| \`npm install -g @anthropic-ai/claude-code@${stablePinned}\` | 推荐安装的旧 \`cli.js\` 版本；${renderRangeWithExcluded(
      npmStable
    )} 范围内也可用 | \`stable\` |`,
    "| `npm install -g @anthropic-ai/claude-code` | npm 全局安装最新版；macOS arm64 若版本正好在已验证 native 窗口内可走 experimental | `experimental / skipped`（未验证 native 版本会跳过 CLI Patch） |",
    `| \`curl -fsSL https://claude.ai/install.sh \\| bash -s ${macosInstallerPinned}\` | 官方安装器指定旧版本 | \`experimental\`（macOS arm64 已验证；插件会用 native patch 处理，需要 \`node-lief\`） |`,
    ...(macosNative && macosNative.unsupported !== true
      ? [
          `| Claude Code native binary ${renderNativeInstallLabel(
            macosNative
          )} | 当前已验证的 native binary 版本，显示审计 ${macosNativeAudit.passed}/${macosNativeAudit.total} PASS | \`experimental\`（需要 \`node-lief\`） |`,
        ]
      : []),
    "| `curl -fsSL https://claude.ai/install.sh \\| sh` | 官方安装器 latest | `experimental / skipped`（只有明确验证版本会启用 CLI Patch） |",
    "| `powershell -File install.ps1` | Windows PowerShell 安装（仅适用于旧 npm cli.js 形态；检测到 native .exe 时会跳过 CLI Patch） | `stable`（需 PowerShell 5.1+；CLI Patch 仅 npm 路径） |",
    "",
    "安装脚本会自动检测安装方式，无需手动选择。",
    "",
    `> **native binary 说明**：官方安装器和新版 npm 包都可能装到 native 二进制，不是旧 npm \`cli.js\`。本插件的处理方法是：用 \`bun-binary-io.js\` 提取二进制里的 JS → 复用 \`patch-cli.sh\` 翻译 → 再写回二进制。macOS arm64 ${renderRangeWithExcluded(
      macosInstaller
    )} 已在临时目录验证通过；${macosVerified} 额外通过 ${macosNativeAudit.total} 个稳定显示面审计。运行时需要 \`node-lief\`。要最稳，请优先使用 npm pinned 安装方式。`,
    ">",
    "> **不支持的安装方式**：如当前安装方式暂不支持 CLI Patch，安装脚本会明确提示并只启用 Layer 1~3，不会误报“已完成全部 patch”。",
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
