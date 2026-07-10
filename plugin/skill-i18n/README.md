# Skill / 插件命令说明自动汉化

把用户安装的 skill / 插件的 `/` 命令说明翻译成简体中文——即 `/` 命令列表、`/skill` 列表、`/plugin` 管理界面里显示的功能描述。

> ⚠ **默认禁用。开启会修改本机文件，请先知情再启用。**
>
> - 设 `ZH_CN_SKILL_I18N_ENABLE=1` 才启用（默认不跑，不消耗 token/额度）。
> - 开启后会改写 `~/.claude/` 下 skill 的 `SKILL.md`、command 的 `.md`、插件的 `plugin.json`/`marketplace.json` 的 `description` 字段。原文备份到 `description_en`（JSON 为 `_description_en`），可用 `node plugin/skill-i18n/restore.js --all` 一键还原，卸载时也会自动还原。
> - `description` 同时用于 model 自动触发 skill，翻译会影响触发判断（现代多语言 LLM 对中文描述触发良好）。

这是 `claude-code-zh-cn` 插件的一条独立汉化管道，与原有的 cli.js patch、spinner 翻译等互不影响。

## 工作原理

1. **默认禁用**：只有 `ZH_CN_SKILL_I18N_ENABLE=1` 时，SessionStart hook 才在会话启动末尾**后台异步**调用 `translate-skills.sh`（不阻塞启动）。
2. 流水线扫描所有来源（`collect.js` 递归），解析 frontmatter / JSON，与缓存对比，**只翻译新增或改动的项**。
3. 译文写回源文件（备份原文），下次启动即生效。
4. 安装时检测并提示禁用 CC 自动更新（防止升级覆盖 patch）。

skill/command 翻译三阶段：`scan`（扫描+解析+对比缓存）→ `translate`（调翻译引擎）→ `apply`（写回）。

> CC 自带命令（`/cd`、`/help` 等）的汉化属于 cli.js patch 范畴（上游维护），不在本功能内。

## 翻译范围

`collect.js` 用递归 + 排除规则统一扫描，覆盖各种插件目录结构（扁平 / 多 plugins 层 / `.agents` / `.cursor` / `.kiro` / `.openclaw` 等子目录）：

| 来源 | 扫描根 | 翻译字段 |
|---|---|---|
| 用户 skill | `~/.claude/skills`、`~/.claude/.claude/skills` | frontmatter `description` |
| 用户命令 | `~/.claude/commands`（含嵌套子目录） | frontmatter `description` |
| 插件 skill/命令 | `~/.claude/plugins/cache/*/*/*/`（每个版本根递归） | frontmatter `description` |
| marketplace skill/命令 | `~/.claude/plugins/marketplaces/*`（每个插件根递归） | frontmatter `description` |
| 插件元数据 | `.../.claude-plugin/{plugin,marketplace}.json` | `description`（marketplace 含 `plugins[]` 每项 + `metadata.description`） |

排除目录：`.git`、`node_modules`、`docs`、`dist`、`tests`、`src`、`.openclaw`、`.github`、`.vscode`、`.idea`（非 skill/command 内容或多语言副本）。

**默认不跟随符号链接**（避免改写符号链接指向的外部源仓库，如 addy 这类指向 `~/.local/share` 的 skill）。需要时设 `ZH_CN_SKILL_I18N_FOLLOW_SYMLINKS=1`。

> ⚠️ **CC 不加载符号链接 skill**：Claude Code 用 `isDirectory()` 判断 skill 目录，符号链接返回 false → CC 跳过。即使翻译了符号链接 skill 的文件，CC 也不显示。如需 CC 加载，把符号链接替换为真实目录（`cp -R` 替代 `ln -s`）。

## 防止 patch 失效（CC 自动更新）

CC 默认自动更新，每次升级下载全新 binary，**cli.js patch 全丢**。`install.sh` 的 `ensure_cc_autoupdate_disabled` 检测三处：

1. 环境变量 `DISABLE_AUTOUPDATER=1`
2. `settings.json` 的 `env.DISABLE_AUTOUPDATER`
3. shell profile（`~/.zshrc` / `~/.bashrc` / `~/.profile`）的 `export DISABLE_AUTOUPDATER=1`

未禁用时警告；设 `ZH_CN_DISABLE_CC_AUTOUPDATE=1` 安装则自动写入 `~/.zshrc`（幂等，不重复追加）。

## 翻译引擎（按 API 协议分类）

| provider | 协议 | 适用 | 配置 |
|---|---|---|---|
| `claude` | 调 `claude` CLI | 默认，**零配置** | 无 |
| `openai` | OpenAI `chat/completions` 兼容 | OpenAI、DeepSeek、Moonshot 等 | `API_KEY` + `BASE_URL` + `MODEL` |
| `anthropic` | Anthropic `messages` 兼容 | Anthropic 官方及任何 Anthropic 兼容端点 | `API_KEY` + `BASE_URL` + `MODEL` |

> **配置方式**：设 `PROVIDER=openai|anthropic`、`BASE_URL=<你的服务商端点>`、`MODEL=<模型名>`、`API_KEY=<你的 key>`。比 claude CLI 快得多。

`auto`（默认）：无 key → `claude` CLI；要用 API 请显式选 `openai` 或 `anthropic`（无法从 key 反推协议）。

## 环境变量

在 `~/.claude/settings.json` 的 `env` 字段或 shell 环境里配置：

| 变量 | 默认 | 说明 |
|---|---|---|
| `ZH_CN_SKILL_I18N_ENABLE` | `0` | **`1` 才启用本功能**（默认禁用，不消耗 token/额度） |
| `ZH_CN_SKILL_I18N_PROVIDER` | `auto` | `auto` / `claude` / `openai` / `anthropic` |
| `ZH_CN_SKILL_I18N_API_KEY` | 空 | openai/anthropic 的 key（**经环境变量传递，不进 argv/进程列表**） |
| `ZH_CN_SKILL_I18N_BASE_URL` | provider 默认 | openai: `https://api.openai.com/v1`；anthropic: `https://api.anthropic.com` |
| `ZH_CN_SKILL_I18N_MODEL` | 空 | openai/anthropic 模型名（必填） |
| `ZH_CN_SKILL_I18N_FOLLOW_SYMLINKS` | `0` | `1` 跟随符号链接 skill（默认不跟随，保护外部源仓库） |
| `ZH_CN_SKILL_I18N_TIMEOUT` | `25` | hook 后台翻译超时秒数 |
| `ZH_CN_SKILL_I18N_LIMIT` | `0` | 限制本次待翻译条数（`0` 不限；调试/小批验证用） |
| `ZH_CN_SKILL_I18N_CACHE_DIR` | `~/.claude/.skill-i18n-cache` | 译文缓存目录 |

## 可逆性

- 每次翻译都**备份原文**：md 存到 `description_en`，JSON 存到 `_description_en`，并加 `x-zh-cn-translated` / `_zh_cn_translated` 标记。
- 一键还原：`node plugin/skill-i18n/restore.js --all`（还原所有被翻译的文件）。
- 卸载插件时 `uninstall.sh` 会自动调用 restore，恢复全部英文。
- 译文缓存（`translations.json`）按英文原文 hash 存取：插件 `update` 覆盖源文件后，下次启动自动用缓存重新应用、**不重复调用 LLM**。

## 手动运行

```bash
# 扫描看哪些待翻译（不写任何文件）
bash plugin/skill-i18n/translate-skills.sh --root ~/.claude --dry-run

# 立即翻译（默认 claude 引擎）
bash plugin/skill-i18n/translate-skills.sh --root ~/.claude

# 用 OpenAI / Anthropic 兼容 API 快速翻译（按你的服务商填 base-url / model / key）
ZH_CN_SKILL_I18N_PROVIDER=anthropic \
ZH_CN_SKILL_I18N_BASE_URL=https://your-anthropic-compatible-endpoint \
ZH_CN_SKILL_I18N_MODEL=your-model \
ZH_CN_SKILL_I18N_API_KEY=你的key \
bash plugin/skill-i18n/translate-skills.sh --root ~/.claude

# 还原全部
node plugin/skill-i18n/restore.js --all
```

## 重要权衡：description 改中文会同时影响 model 自动触发 skill

skill 的 `description` 字段有两个用途：(1) `/` 命令列表显示给人看，(2) model 读它来决定何时自动调用该 skill。Claude Code 不支持「显示中文、触发用英文」分离（同一字段）。因此翻译会一并影响触发判断。

**实际影响可控**：现代多语言 LLM 对中文 description 的触发理解良好（例如「在……时使用」的描述能被正确匹配）。我们通过原文备份 + 一键禁用 + 全量还原来兜底：

- 备份 `description_en`，随时可逆；
- 默认禁用（不设 `ZH_CN_SKILL_I18N_ENABLE=1` 即不运行）；
- `restore.js --all` 全量还原英文。

如果你高度依赖某个 skill 的英文精确触发，可手动把它从翻译范围排除（翻译后删除其 `x-zh-cn-translated` 标记会触发重译，或直接 `restore` 单个）。

## 可靠性设计

- **行级 patch**：写回 frontmatter 时只改 `description` 行 + 追加备份/标记，**正文内容不变**（CRLF 行尾的文件归一化为 LF），绝不重新序列化。
- **写前自检**：`verifyRewriteSafe` 重解析确认正文与备份一致，否则放弃写回（绝不写坏 skill）。
- **翻译失败不写回**：任何批次/单条失败都跳过，源文件永不损坏，下次重试。
- **幂等**：标记 + 备份 + 缓存三重保证，重复运行不重复翻译。
- **零外部依赖**：frontmatter 手写解析、HTTP 用 node 内置 `https`、调 claude 用 `child_process`，无 `package.json`。
- **占位符保护**：译文会校验 `${...}` 占位符与原文一致，丢失则拒绝该译文。

## 已知限制

- 首次翻译较多 skill 时（claude 引擎）可能耗时数分钟；配置 OpenAI / Anthropic 兼容 API 后显著加快。后台执行不阻塞会话，新装项**下次启动**生效。
- `argument-hint`（命令的参数提示）默认不翻译（含 `[a | b]` 语法符号，翻译易错）。
- Windows 上 `uninstall.ps1` 的等价还原调用尚未补齐（核心功能在 Windows CC 的 bash 环境可用）。
