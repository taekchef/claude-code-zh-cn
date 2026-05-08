# Support Matrix

> Generated from `scripts/upstream-compat.config.json` + `node scripts/verify-upstream-compat.js --json`.

## Quick Decision

| 安装方式 | 版本范围 | 状态 | 汉化效果 | 建议 |
| --- | --- | --- | --- | --- |
| npm global install | 2.1.92 - 2.1.112 | stable | 完整链路已验证 | 推荐 |
| macOS official installer | 2.1.110 - 2.1.112 | experimental | 实验验证中 | 只用已验证版本 |
| macOS native binary | 2.1.113 - 2.1.133 (不含未纳入本轮支持的 2.1.115, 2.1.124, 2.1.125, 2.1.126, 2.1.127, 2.1.128, 2.1.129, 2.1.130, 2.1.131, 2.1.132) | experimental | native + 显示审计已验证 | 只用已验证版本 |
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
| macOS official installer | experimental | 2.1.110 - 2.1.112 | 2.1.110 PASS(native 1245) · 2.1.111 PASS(native 1241) · 2.1.112 PASS(native 1241) | 官方安装器指定旧版本仍走 native binary；macOS arm64 已离线验证 extract/patch/repack/--version，插件可用 native patch experimental 处理，需要 node-lief；稳定使用仍建议 npm pinned。 |
| macOS native binary | experimental | 2.1.113 - 2.1.133 (不含未纳入本轮支持的 2.1.115, 2.1.124, 2.1.125, 2.1.126, 2.1.127, 2.1.128, 2.1.129, 2.1.130, 2.1.131, 2.1.132) | 2.1.113 PASS(native 1358, display 11/11) · 2.1.114 PASS(native 1358, display 11/11) · 2.1.116 PASS(native 1351, display 11/11) · 2.1.117 PASS(native 1334, display 11/11) · 2.1.118 PASS(native 1323, display 11/11) · 2.1.119 PASS(native 1328, display 11/11) · 2.1.120 PASS(native 1331, display 11/11) · 2.1.121 PASS(native 1334, display 11/11) · 2.1.122 PASS(native 1334, display 11/11) · 2.1.123 PASS(native 1334, display 11/11) · 2.1.133 PASS(native 1321, display 11/11) | macOS arm64 native binary experimental；需要 node-lief；已验证 2.1.113、2.1.114、2.1.116 - 2.1.123、2.1.133 的 extract / patch / repack / --version 和 11 个稳定显示面审计；2.1.115、2.1.124 - 2.1.132 未纳入本轮支持；不代表未来 latest 自动稳定。 |
| Linux official installer | unsupported | - | - | 当前不支持 Linux 官方安装器；请改用 npm 路径。 |
| Windows / npm global install (PowerShell) | stable | 2.1.92 - 2.1.112 | - | 新增 PowerShell 安装脚本（install.ps1）；适用于旧 npm cli.js 形态，CLI Patch 可用；Windows 上 session-start 二层兜底（launcher 暂不实现启动前自修复）。 |
| Windows / native .exe / latest | unsupported | - | - | Windows native .exe（官方安装器或 2.1.113+ npm 原生 wrapper）会明确跳过 CLI Patch，仅启用 Layer 1~3；硬编码 UI 文字不会被完整翻译。 |

## Compatibility Matrix

| Version | Package shape | Result | Runtime | 汉化显示审计 | Patch count | Residue |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1.92 | legacy | PASS | - | PASS (11 surfaces) | 1581 | - |
| 2.1.97 | legacy | PASS | - | PASS (11 surfaces) | 1578 | - |
| 2.1.104 | legacy | PASS | - | PASS (11 surfaces) | 1544 | - |
| 2.1.107 | legacy | PASS | - | PASS (11 surfaces) | 1518 | - |
| 2.1.110 | legacy | PASS | - | PASS (11 surfaces) | 1510 | - |
| 2.1.112 | legacy | PASS | - | PASS (11 surfaces) | 1511 | - |

Summary: 6 pass / 0 fail

