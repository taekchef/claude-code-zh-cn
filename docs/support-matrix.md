# Support Matrix

> Generated from `scripts/upstream-compat.config.json` + `node scripts/verify-upstream-compat.js --json`.

## Quick Decision

| 安装方式 | 版本范围 | 状态 | 汉化效果 | 建议 |
| --- | --- | --- | --- | --- |
| npm global install | 2.1.92 - 2.1.112 | stable | 完整链路已验证 | 推荐 |
| macOS official installer | - | unsupported | 不承诺完整汉化 | 不建议 |
| Linux official installer | - | unsupported | 不承诺完整汉化 | 不建议 |
| Windows / npm global install (PowerShell) | 2.1.92 - 2.1.112 | stable | 完整链路已验证 | 推荐 |
| Windows / native .exe / latest | - | unsupported | 不承诺完整汉化 | 不建议 |

## Tier Definition

- `stable`：代表版本段已通过 compat matrix，且 npm 路径具备启动前自修复。
- `experimental`：已有局部验证或手动路径，但仍不承诺和 npm stable 同等级体验。
- `unsupported`：当前不建议使用，文档只保留明确边界，不承诺修复路径。

## Current Support

| Channel | Tier | Version window | Representative verification | Notes |
| --- | --- | --- | --- | --- |
| npm global install | stable | 2.1.92 - 2.1.112 | 2.1.92 PASS · 2.1.97 PASS · 2.1.104 PASS · 2.1.107 PASS · 2.1.110 PASS · 2.1.112 PASS | PATH 优先 launcher + session-start 二层兜底，适用于旧 cli.js npm 包形态；2.1.113+ native binary wrapper 暂不支持旧 CLI Patch。 |
| macOS official installer | unsupported | - | - | 官方安装器产物是 macOS native / Mach-O 二进制；为避免破坏签名并触发 macOS kill，install.sh 会跳过 CLI Patch，仅启用设置、Hook、输出风格和插件层中文化。 |
| Linux official installer | unsupported | - | - | 当前不支持 Linux 官方安装器；请改用 npm 路径。 |
| Windows / npm global install (PowerShell) | stable | 2.1.92 - 2.1.112 | - | 新增 PowerShell 安装脚本（install.ps1）；适用于旧 npm cli.js 形态，CLI Patch 可用；Windows 上 session-start 二层兜底（launcher 暂不实现启动前自修复）。 |
| Windows / native .exe / latest | unsupported | - | - | Windows native .exe（官方安装器或 2.1.113+ npm 原生 wrapper）会明确跳过 CLI Patch，仅启用 Layer 1~3；硬编码 UI 文字不会被完整翻译。 |

## Compatibility Matrix

| Version | Package shape | Result | Runtime | 汉化显示审计 | Patch count | Residue |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1.92 | legacy | PASS | - | PASS (11 surfaces) | 1583 | - |
| 2.1.97 | legacy | PASS | - | PASS (11 surfaces) | 1580 | - |
| 2.1.104 | legacy | PASS | - | PASS (11 surfaces) | 1546 | - |
| 2.1.107 | legacy | PASS | - | PASS (11 surfaces) | 1520 | - |
| 2.1.110 | legacy | PASS | - | PASS (11 surfaces) | 1512 | - |
| 2.1.112 | legacy | PASS | - | PASS (11 surfaces) | 1513 | - |

Summary: 6 pass / 0 fail

