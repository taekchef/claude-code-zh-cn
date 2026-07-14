# Support Matrix

> Generated from `scripts/upstream-compat.config.json` + `node scripts/verify-upstream-compat.js --json`.

## Quick Decision

| 安装方式 | 版本范围 | 状态 | 汉化效果 | 建议 |
| --- | --- | --- | --- | --- |
| npm global install | 2.1.92 - 2.1.112 | stable | 完整链路已验证 | 完整证据 |
| macOS official installer | 2.1.110 - 2.1.112 | experimental | 实验验证中 | 新版可本机自检 |
| macOS native binary | 2.1.113 - 2.1.208 (不含未纳入本轮支持的 2.1.115, 2.1.125, 2.1.127, 2.1.130, 2.1.134, 2.1.135, 2.1.147, 2.1.149, 2.1.151, 2.1.154, 2.1.155, 2.1.157, 2.1.163, 2.1.164, 2.1.166, 2.1.171, 2.1.172, 2.1.174, 2.1.176, 2.1.180, 2.1.181, 2.1.182, 2.1.184, 2.1.186, 2.1.187, 2.1.188, 2.1.189, 2.1.191, 2.1.192, 2.1.193, 2.1.194, 2.1.195, 2.1.196, 2.1.197, 2.1.198, 2.1.199, 2.1.200, 2.1.201, 2.1.202, 2.1.203, 2.1.204, 2.1.206, 2.1.207) | experimental | native + 显示审计已验证 | 新版可本机自检 |
| Linux official installer | - | unsupported | 不承诺完整汉化 | 仅 Layer 1~3 |
| Windows / npm global install (PowerShell) | 2.1.92 - 2.1.112 | stable | 完整链路已验证 | 完整证据 |
| Windows / native .exe | 2.1.113 - 2.1.205 (不含未纳入本轮支持的 2.1.115, 2.1.125, 2.1.127, 2.1.130, 2.1.134, 2.1.135, 2.1.147, 2.1.149, 2.1.151, 2.1.154, 2.1.155, 2.1.157, 2.1.163, 2.1.164, 2.1.165, 2.1.166, 2.1.167, 2.1.168, 2.1.169, 2.1.170, 2.1.171, 2.1.172, 2.1.173, 2.1.174, 2.1.175, 2.1.176, 2.1.180, 2.1.181, 2.1.182, 2.1.184, 2.1.185, 2.1.186, 2.1.187, 2.1.188, 2.1.189, 2.1.191, 2.1.192, 2.1.193, 2.1.194, 2.1.195, 2.1.196, 2.1.197, 2.1.198, 2.1.199, 2.1.200, 2.1.201, 2.1.202, 2.1.203, 2.1.204) | experimental | native + 显示审计已验证 | 新版可本机自检 |

## Tier Definition

- 验证等级只表示公开证据和翻译覆盖程度，不是运行门禁。
- `stable`：代表版本段已通过 compat matrix，且 npm 路径具备启动前自修复。
- `experimental`：已有 native 运行和显示面证据；更高可识别版本也会先本机自检，已知文案继续中文，未知文案保留英文。
- `unsupported`：该平台或二进制格式不执行原生 Layer 4；正式插件的 Layer 1~3 继续可用。

## Current Support

| Channel | Tier | Version window | Representative verification | Notes |
| --- | --- | --- | --- | --- |
| npm global install | stable | 2.1.92 - 2.1.112 | 2.1.92 PASS · 2.1.97 PASS · 2.1.104 PASS · 2.1.107 PASS · 2.1.110 PASS · 2.1.112 PASS | PATH 优先 launcher + session-start 二层兜底，适用于旧 cli.js npm 包形态；2.1.113+ native binary wrapper 暂不支持旧 CLI Patch。 |
| macOS official installer | experimental | 2.1.110 - 2.1.112 | 2.1.110 PASS(native 1245) · 2.1.111 PASS(native 1241) · 2.1.112 PASS(native 1241) | 官方安装器指定旧版本仍走 native binary；macOS arm64 已离线验证 extract/patch/repack/--version，插件可用 native patch experimental 处理，需要 node-lief；稳定使用仍建议 npm pinned。 |
| macOS native binary | experimental | 2.1.113 - 2.1.208 (不含未纳入本轮支持的 2.1.115, 2.1.125, 2.1.127, 2.1.130, 2.1.134, 2.1.135, 2.1.147, 2.1.149, 2.1.151, 2.1.154, 2.1.155, 2.1.157, 2.1.163, 2.1.164, 2.1.166, 2.1.171, 2.1.172, 2.1.174, 2.1.176, 2.1.180, 2.1.181, 2.1.182, 2.1.184, 2.1.186, 2.1.187, 2.1.188, 2.1.189, 2.1.191, 2.1.192, 2.1.193, 2.1.194, 2.1.195, 2.1.196, 2.1.197, 2.1.198, 2.1.199, 2.1.200, 2.1.201, 2.1.202, 2.1.203, 2.1.204, 2.1.206, 2.1.207) | 2.1.113 PASS(native 1358, display 11/11) · 2.1.114 PASS(native 1358, display 11/11) · 2.1.116 PASS(native 1351, display 11/11) · 2.1.117 PASS(native 1334, display 11/11) · 2.1.118 PASS(native 1323, display 11/11) · 2.1.119 PASS(native 1328, display 11/11) · 2.1.120 PASS(native 1331, display 11/11) · 2.1.121 PASS(native 1334, display 11/11) · 2.1.122 PASS(native 1334, display 11/11) · 2.1.123 PASS(native 1334, display 11/11) · 2.1.124 PASS(native 1331, display 11/11) · 2.1.126 PASS(native 1331, display 11/11) · 2.1.128 PASS(native 1331, display 11/11) · 2.1.129 PASS(native 1333, display 11/11) · 2.1.131 PASS(native 1333, display 11/11) · 2.1.132 PASS(native 1323, display 11/11) · 2.1.133 PASS(native 1323, display 11/11) · 2.1.136 PASS(native 1322, display 11/11) · 2.1.137 PASS(native 1322, display 11/11) · 2.1.138 PASS(native 1322, display 11/11) · 2.1.139 PASS(native 1324, display 11/11) · 2.1.140 PASS(native 1324, display 11/11) · 2.1.141 PASS(native 1324, display 11/11) · 2.1.142 PASS(native 1320, display 11/11) · 2.1.143 PASS(native 1326, display 11/11) · 2.1.144 PASS(native 1324, display 11/11) · 2.1.145 PASS(native 1324, display 11/11) · 2.1.146 PASS(native 1335, display 11/11) · 2.1.148 PASS(native 1333, display 11/11) · 2.1.150 PASS(native 1333, display 11/11) · 2.1.152 PASS(native 1343, display 11/11) · 2.1.153 PASS(native 1343, display 11/11) · 2.1.156 PASS(native 1385, display 11/11) · 2.1.158 PASS(native 1385, display 11/11) · 2.1.159 PASS(native 1392, display 11/11) · 2.1.160 PASS(native 1392, display 11/11) · 2.1.161 PASS(native 1387, display 11/11) · 2.1.162 PASS(native 1385, display 11/11) · 2.1.165 PASS(native 1370, display 11/11) · 2.1.167 PASS(native 1405, display 11/11) · 2.1.168 PASS(native 1405, display 11/11) · 2.1.169 PASS(native 1392, display 11/11) · 2.1.170 PASS(native 1389, display 11/11) · 2.1.173 PASS(native 1381, display 11/11) · 2.1.175 PASS(native 1381, display 11/11) · 2.1.177 PASS(native 1381, display 11/11) · 2.1.178 PASS(native 1473, display 11/11) · 2.1.179 PASS(native 1463, display 11/11) · 2.1.183 PASS(native 1462, display 11/11) · 2.1.185 PASS(native 1462, display 11/11) · 2.1.190 PASS(native 1452, display 11/11) · 2.1.205 PASS(native 1395, display 11/11) · 2.1.208 PASS(native 1393, display 11/11) | macOS arm64 native binary experimental；需要 node-lief；已验证 2.1.113 - 2.1.114、2.1.116 - 2.1.124、2.1.126、2.1.128 - 2.1.129、2.1.131 - 2.1.133、2.1.136 - 2.1.146、2.1.148、2.1.150、2.1.152 - 2.1.153、2.1.156、2.1.158 - 2.1.162、2.1.165、2.1.167 - 2.1.170、2.1.173、2.1.175、2.1.177 - 2.1.179、2.1.183、2.1.185、2.1.190、2.1.205、2.1.208 的 extract / patch / repack / --version 和 11 个稳定显示面的运行审计；2.1.115、2.1.125、2.1.127、2.1.130、2.1.134、2.1.135、2.1.147、2.1.149、2.1.151、2.1.154、2.1.155、2.1.157、2.1.163、2.1.164、2.1.166、2.1.171、2.1.172、2.1.174、2.1.176、2.1.180、2.1.181、2.1.182、2.1.184、2.1.186、2.1.187、2.1.188、2.1.189、2.1.191、2.1.192、2.1.193、2.1.194、2.1.195、2.1.196、2.1.197、2.1.198、2.1.199、2.1.200、2.1.201、2.1.202、2.1.203、2.1.204、2.1.206、2.1.207 未发布或未纳入支持；不代表未来 latest 自动稳定。 |
| Linux official installer | unsupported | - | - | 当前不支持 Linux 官方安装器；请改用 npm 路径。 |
| Windows / npm global install (PowerShell) | stable | 2.1.92 - 2.1.112 | - | 新增 PowerShell 安装脚本（install.ps1）；适用于旧 npm cli.js 形态，CLI Patch 可用；Windows 上 session-start 二层兜底（launcher 暂不实现启动前自修复）。 |
| Windows / native .exe | experimental | 2.1.113 - 2.1.205 (不含未纳入本轮支持的 2.1.115, 2.1.125, 2.1.127, 2.1.130, 2.1.134, 2.1.135, 2.1.147, 2.1.149, 2.1.151, 2.1.154, 2.1.155, 2.1.157, 2.1.163, 2.1.164, 2.1.165, 2.1.166, 2.1.167, 2.1.168, 2.1.169, 2.1.170, 2.1.171, 2.1.172, 2.1.173, 2.1.174, 2.1.175, 2.1.176, 2.1.180, 2.1.181, 2.1.182, 2.1.184, 2.1.185, 2.1.186, 2.1.187, 2.1.188, 2.1.189, 2.1.191, 2.1.192, 2.1.193, 2.1.194, 2.1.195, 2.1.196, 2.1.197, 2.1.198, 2.1.199, 2.1.200, 2.1.201, 2.1.202, 2.1.203, 2.1.204) | 2.1.158 PASS(native 1385, display 11/11) · 2.1.159 PASS(native 1392, display 11/11) · 2.1.160 PASS(native 1392, display 11/11) · 2.1.161 PASS(native 1387, display 11/11) · 2.1.162 PASS(native 1385, display 11/11) · 2.1.177 PASS(native 1381, display 11/11) · 2.1.178 PASS(native 1473, display 11/11) · 2.1.179 PASS(native 1463, display 11/11) · 2.1.183 PASS(native 1462, display 11/11) · 2.1.190 PASS(native 1452, display 11/11) · 2.1.205 PASS(native 1395, display 11/11) | Windows x64 native binary experimental；需要 node-lief；已验证 2.1.113 - 2.1.114、2.1.116 - 2.1.124、2.1.126、2.1.128 - 2.1.129、2.1.131 - 2.1.133、2.1.136 - 2.1.146、2.1.148、2.1.150、2.1.152 - 2.1.153、2.1.156、2.1.158 - 2.1.162、2.1.177 - 2.1.179、2.1.183、2.1.190、2.1.205 的 extract / patch / repack / --version 和 11 个稳定显示面审计；2.1.115、2.1.125、2.1.127、2.1.130、2.1.134、2.1.135、2.1.147、2.1.149、2.1.151、2.1.154、2.1.155、2.1.157、2.1.163、2.1.164、2.1.165、2.1.166、2.1.167、2.1.168、2.1.169、2.1.170、2.1.171、2.1.172、2.1.173、2.1.174、2.1.175、2.1.176、2.1.180、2.1.181、2.1.182、2.1.184、2.1.185、2.1.186、2.1.187、2.1.188、2.1.189、2.1.191、2.1.192、2.1.193、2.1.194、2.1.195、2.1.196、2.1.197、2.1.198、2.1.199、2.1.200、2.1.201、2.1.202、2.1.203、2.1.204 未发布或未纳入支持；不代表 future latest 自动稳定。高于该窗口但仍在同一 minor 线的版本，install.ps1 可在安装时做本机自验证并以 provisional 方式启用；这不等于已发布支持窗口。 |

## Compatibility Matrix

| Version | Package shape | Result | Runtime | 汉化显示审计 | Patch count | Residue |
| --- | --- | --- | --- | --- | --- | --- |
| 2.1.92 | legacy | PASS | - | PASS (11 surfaces) | 1657 | - |
| 2.1.97 | legacy | PASS | - | PASS (11 surfaces) | 1654 | - |
| 2.1.104 | legacy | PASS | - | PASS (11 surfaces) | 1623 | - |
| 2.1.107 | legacy | PASS | - | PASS (11 surfaces) | 1597 | - |
| 2.1.110 | legacy | PASS | - | PASS (11 surfaces) | 1591 | - |
| 2.1.112 | legacy | PASS | - | PASS (11 surfaces) | 1595 | - |

Summary: 6 pass / 0 fail

