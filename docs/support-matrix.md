# Support Matrix

> Generated from `scripts/upstream-compat.config.json` + `node scripts/verify-upstream-compat.js --json` on 2026-04-14.

## Tier Definition

- `stable`：代表版本段已通过 compat matrix，且 npm 路径具备启动前自修复。
- `experimental`：具备部分自动修复能力，但仍不承诺和 npm stable 同等级体验。
- `unsupported`：当前不建议使用，文档只保留明确边界，不承诺修复路径。

## Current Support

| Channel | Tier | Version window | Representative verification | Notes |
| --- | --- | --- | --- | --- |
| npm global install | stable | 2.1.92 - 2.1.107 | 2.1.92 PASS · 2.1.97 PASS · 2.1.104 PASS · 2.1.107 PASS | PATH 优先 launcher + session-start 二层兜底，适用于 npm 全局安装。 |
| macOS official installer | experimental | 2.1.104 - 2.1.104 | 2.1.104 PASS | 依赖 native repack / session-start；prelaunch launcher 不覆盖原生二进制。 |
| Linux official installer | unsupported | - | - | 当前不支持 Linux 官方安装器；请改用 npm 路径。 |

## Compatibility Matrix

| Version | Result | Patch count | Residue |
| --- | --- | --- | --- |
| 2.1.92 | pass | 1409 | - |
| 2.1.97 | pass | 1405 | - |
| 2.1.104 | pass | 1368 | - |
| 2.1.107 | pass | 1341 | - |

Summary: 4 pass / 0 fail

