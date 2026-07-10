# SPEC: PR #175 review 反馈修复

维护者 taekchef 的 4 条 CHANGES_REQUESTED（https://github.com/taekchef/claude-code-zh-cn/pull/175）：

## 1. 默认禁用，显式启用
当前 SessionStart hook 默认后台跑 + 默认 claude CLI 翻译，会消耗用户 token/额度，且用户未明确同意就启动后台任务。
**改**：只有 `ZH_CN_SKILL_I18N_ENABLE=1` 时才运行；默认安装不自动跑。

## 2. 明确告知会改本机文件
文档要显著说明：开启后会修改 SKILL.md / command markdown / plugin.json / marketplace.json 的 description 字段，原文备份到 description_en / _description_en，可通过 restore 还原；用户需明确知情。

## 3. 翻译子进程加 guard
translate.js 调 claude CLI 时，给子进程传 `ZH_CN_SKILL_I18N_HOOK=1`（SPAWN_GUARD_ENV），覆盖继承的 ENABLE=1，避免翻译进程再次触发同一个 SessionStart hook（防递归）。用专用 HOOK 变量而非 ENABLE=0，因为 ENABLE=0 会被 claude 子进程加载的 settings.json env（ENABLE=1）覆盖。

## 4. 删误提交残留 + 加检查
删除误提交的 claude-code-win32-x64-2.1.113.tgz 和 pack-staging/；补 .gitignore + preflight 检查，避免后续再提交 pack-staging 或临时 .tgz。

## 附
codesign fall-through 修复和 2.1.201 支持窗口维护者同意留本 PR。改完 push 更新 PR。
