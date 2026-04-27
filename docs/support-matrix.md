# Support Matrix

> Generated from `scripts/upstream-compat.config.json` + `node scripts/verify-upstream-compat.js --json` on 2026-04-27.

## Tier Definition

- `stable`：代表版本段已通过 compat matrix，且 npm 路径具备启动前自修复。
- `experimental`：已有局部验证或手动路径，但仍不承诺和 npm stable 同等级体验。
- `unsupported`：当前不建议使用，文档只保留明确边界，不承诺修复路径。

## Current Support

| Channel | Tier | Version window | Representative verification | Notes |
| --- | --- | --- | --- | --- |
| npm global install | stable | 2.1.92 - 2.1.112 | 2.1.92 PASS · 2.1.97 PASS · 2.1.104 PASS · 2.1.107 PASS · 2.1.110 PASS · 2.1.112 PASS | PATH 优先 launcher + session-start 二层兜底，适用于旧 cli.js npm 包形态；2.1.113+ native binary wrapper 暂不支持旧 CLI Patch。 |
| macOS official installer | experimental | 2.1.110 - 2.1.112 | 2.1.110 PASS(native 1245) · 2.1.111 PASS(native 1241) · 2.1.112 PASS(native 1241) | 官方安装器指定旧版本仍走 native binary；macOS arm64 已离线验证 extract/patch/repack/--version，插件可用 native patch experimental 处理，需要 node-lief；稳定使用仍建议 npm pinned。 |
| Linux official installer | unsupported | - | - | 当前不支持 Linux 官方安装器；请改用 npm 路径。 |
| Windows / npm global install (PowerShell) | stable | 2.1.92 - 2.1.112 | - | 新增 PowerShell 安装脚本（install.ps1）；适用于旧 npm cli.js 形态，CLI Patch 可用；Windows 上 session-start 二层兜底（launcher 暂不实现启动前自修复）。 |
| Windows / native .exe / latest | unsupported | - | - | Windows native .exe（官方安装器或 2.1.113+ npm 原生 wrapper）会明确跳过 CLI Patch，仅启用 Layer 1~3；硬编码 UI 文字不会被完整翻译。 |

## Compatibility Matrix

| Version | Result | Patch count | Residue |
| --- | --- | --- | --- |
| 2.1.92 | pass | 1521 | - |
| 2.1.97 | pass | 1518 | - |
| 2.1.104 | pass | 1483 | - |
| 2.1.107 | pass | 1456 | - |
| 2.1.110 | pass | 1448 | - |
| 2.1.112 | pass | 1448 | - |

Summary: 6 pass / 0 fail

