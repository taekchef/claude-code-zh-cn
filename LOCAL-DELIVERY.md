# Claude Code 中文本地化 2.21.3：Windows 本地交付

本包只处理终端版 Claude Code。运行前请关闭所有正在使用 Claude Code 终端 EXE 的会话；桌面客户端和 VS Code 扩展不在处理范围内。

在本目录打开 PowerShell，使用以下入口：

| 操作 | 命令 |
| --- | --- |
| 安装或重装 | `.\install-local.ps1` |
| 诊断 | `.\doctor.ps1` |
| 卸载，恢复原版英文 | `.\uninstall.ps1` |
| 回退至本次安装前本机状态 | `.\rollback-local.ps1 -BackupDirectory $backupDirectory` |

`install-local.ps1` 默认使用本地备用插件入口，不擅自打开已关闭的正式插件，不向 CC Switch 写入设置。用户的供应商、凭据、会话数据和其他 Hook 保持原样。需要 Node.js 与 `node-lief` 本机依赖；本机已验证具备。以后 Claude Code 更新时，启动器先在副本上自检；失败保留原版程序。

执行回退前，请先将 `$backupDirectory` 设为安装前备份目录的实际完整路径。私人备份**不在 ZIP 内，也不应提交到仓库**。回退入口会检查当前程序和设置的指纹；如果它们后来被升级或修改，会拒绝覆盖。详细版本证据与英文残留见 `docs/windows-2.1.289-local-validation.md`。
