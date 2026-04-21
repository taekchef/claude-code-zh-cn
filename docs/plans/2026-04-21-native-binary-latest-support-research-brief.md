# Claude Code 最新版 native binary 支持研究 brief

## 给研究模型的任务

请研究 `taekchef/claude-code-zh-cn` 是否应该、以及如何支持 Claude Code `2.1.113+` / latest 的 native binary 形态。

重点不是泛泛讨论，而是给出可执行判断：

- 现有插件是否还有机会支持 Claude Code 最新版？
- 如果有，最小安全方案是什么？
- 要改哪些模块？
- 要补哪些验证，才能对外说“支持”？
- 哪些平台可以先支持，哪些平台暂时不要承诺？

## 项目背景

`claude-code-zh-cn` 是 Claude Code 中文本地化插件。

旧版本 Claude Code 的 npm 包里有 `package/cli.js`，插件通过 `patch-cli.js` 替换其中的硬编码英文 UI 文案。

现在 Claude Code 最新版 npm 包已经变成 native binary wrapper：

- npm 主包不再包含 `package/cli.js`
- `bin.claude` 指向 `bin/claude.exe`
- npm 通过平台 optional dependency 拉二进制，例如 `@anthropic-ai/claude-code-darwin-arm64`

这导致现有 stable CLI Patch 逻辑失效。

## 已验证事实

### 1. `2.1.112` 仍是旧 `cli.js` 形态

隔离验证结果：

- npm 元数据：`bin.claude = "cli.js"`
- tarball 中存在：`package/cli.js`
- 本仓库兼容验证通过：
  - version: `2.1.112`
  - status: `pass`
  - patch count: `1390`
  - residue: `-`

因此 `2.1.112` 可以视为“切换前最后一个已验证可 patch 版本”。

当前仓库已把 npm stable ceiling 收口到 `2.1.112`。

### 2. `2.1.113` 是 native binary wrapper 切换点

隔离验证结果：

- npm 元数据：`bin.claude = "bin/claude.exe"`
- optionalDependencies 开始包含：
  - `@anthropic-ai/claude-code-darwin-arm64`
  - `@anthropic-ai/claude-code-darwin-x64`
  - `@anthropic-ai/claude-code-linux-x64`
  - `@anthropic-ai/claude-code-linux-arm64`
  - `@anthropic-ai/claude-code-win32-x64`
  - `@anthropic-ai/claude-code-win32-arm64`
  - musl variants
- tarball 中存在：
  - `package/cli-wrapper.cjs`
  - `package/install.cjs`
  - `package/bin/claude.exe`
- tarball 中不存在：`package/cli.js`

旧 `verify-upstream-compat.js` 对 `2.1.113` 失败，原因是找不到 `cli.js`。

### 3. `2.1.116` native binary 有转机

在完全隔离的临时目录里验证了 macOS arm64 平台包：

- binary 文件：`package/claude`
- `file` 结果：`Mach-O 64-bit executable arm64`
- 当前仓库 `bun-binary-io.js detect` 能识别为：
  - `native-bun:<path>/package/claude`
- binary 中仍可搜到英文 UI 文案：
  - `Quick safety check`
  - `This command requires approval`
  - `Do you want to proceed?`
  - `Use /btw to ask a quick side question without interrupting Claude's current work`

用临时安装的 `node-lief` 验证：

- `extract` 成功
- 提取出的 JS 约 `13.1MB`
- `patch-cli.sh` 对提取 JS patch 成功：`1231` 处
- patch 后上述英文探针 residue 为 `none`
- `repack` 成功
- 用临时 HOME 跑临时二进制副本：
  - `2.1.116 (Claude Code)`

重要：这次没有碰用户当前使用的 `cc` / `claude`，没有全局安装 `node-lief`，没有改 `~/.claude`。

### 4. 官方安装器指定旧版本不是完全没戏

官方安装器指定旧版本走的是 native binary 路线，不是旧 npm `cli.js` 路线。为了确认这条路线能不能做，已在临时目录验证 macOS arm64 平台包，并把二进制 checksum 对上官方 release manifest。

| Version | Manifest checksum | Detect | Extracted JS | Patch count | Residue | Repack | Temp `--version` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `2.1.110` | match | `native-bun` | `12836436` bytes | `1245` | `-` | ok | `2.1.110 (Claude Code)` |
| `2.1.111` | match | `native-bun` | `12938755` bytes | `1241` | `-` | ok | `2.1.111 (Claude Code)` |
| `2.1.112` | match | `native-bun` | `12938834` bytes | `1241` | `-` | ok | `2.1.112 (Claude Code)` |
| `2.1.116` | match | `native-bun` | `13108204` bytes | `1231` | `-` | ok | `2.1.116 (Claude Code)` |

这说明：

- macOS 官方安装器旧版本 `2.1.110 - 2.1.112` 可以作为 experimental 适配窗口。
- 插件已有处理方法：`bun-binary-io.js` extract / repack，复用 `patch-cli.sh` 做翻译；`install.sh` 和 `session-start` 可以对已验证旧版本窗口启用这个 experimental 路径。
- `2.1.113+` / latest 仍不应该自动改写，因为最新版本的版本标记、回滚策略和跨版本稳定性还没产品化。
- 稳定用户路径仍建议 npm pinned：`npm install -g @anthropic-ai/claude-code@2.1.112`。

## 当前主要问题

最新版 native binary 并不是完全不能处理，但现在不能直接对外承诺支持。

主要 blocker：

1. `bun-binary-io.js version` 对 `2.1.116` 读不出版本号。
   - 直接运行二进制 `--version` 能输出 `2.1.116 (Claude Code)`。
   - 但 helper 的 `version` 子命令返回空。
   - 这会影响现有 marker / backup / 自动重 patch 逻辑。

2. 当前 `verify-upstream-compat.js` 假设 npm 包里有 `package/cli.js`。
   - 对 `2.1.113+` 这个假设不成立。
   - 需要把验证链拆成两种模式：
     - legacy `cli.js`
     - native binary extract 后验证

3. native repack 目前主要验证了 macOS arm64。
   - Linux / Windows 不应该直接承诺。
   - 当前代码中的 native backend 也主要围绕 macOS Mach-O 和 Bun section。

4. 安装脚本和文档需要避免误导用户。
   - npm latest 现在也是 native binary。
   - 不能再说“npm 安装就是 stable cli.js 路径”。

## 请重点研究的问题

### 问题 1：是否应该支持 latest？

请判断：

- 是否值得追 Claude Code latest？
- 追 latest 的维护成本是否可控？
- 如果只支持 macOS arm64 native experimental，是否是合理第一步？
- 是否应该把 Linux / Windows 明确排除在第一阶段之外？

### 问题 2：native binary 支持的最小实现是什么？

请给出最小安全方案，最好按文件列出。

重点考虑：

- `bun-binary-io.js`
- `plugin/bun-binary-io.js`
- `install.sh`
- `plugin/hooks/session-start`
- `plugin/bin/claude-launcher`
- `scripts/verify-upstream-compat.js`
- `scripts/upstream-compat.config.json`
- `scripts/generate-support-matrix.js`
- `docs/support-matrix.md`
- `README.md`
- tests under `tests/`

### 问题 3：版本检测应该怎么做？

现在 `bun-binary-io.js version` 读不出 `2.1.116`。

请研究更可靠的版本检测方式，例如：

- 从提取 JS 中找版本字符串
- 直接运行临时 binary `--version`
- 从 npm package metadata 传入版本
- 从 binary 内其他 metadata 读取
- marker 不再只依赖 binary 内版本，而是结合 binary hash / patch revision

请评估每种方式的风险。

### 问题 4：如何保证不破坏用户本机 Claude Code？

必须考虑：

- patch 前备份策略
- 同版本重复 patch 如何恢复干净基底
- 版本升级后旧 backup 不能覆盖新 binary
- repack 失败时如何回滚
- 正在运行的 Claude Code binary 不能直接覆盖
- codesign 失败怎么办
- 缺少 `node-lief` 时如何降级提示

### 问题 5：验证矩阵怎么设计？

希望输出一套可以落地的验证矩阵。

建议至少包含：

- legacy npm `2.1.112`
- native macOS arm64 `2.1.116`
- native helper 缺少 `node-lief`
- native extract 成功但 patch count 为 0
- native repack 失败回滚
- version detection 空值场景
- session-start hook 输出合法 JSON
- install.sh 对 unsupported 平台给出清楚提示

## 建议的产品口径

如果没有更强证据，建议暂时对外这样写：

```text
当前 stable 支持 Claude Code 2.1.92 - 2.1.112。
从 2.1.113 开始，Claude Code npm 包切换为 native binary wrapper，旧 CLI Patch 逻辑不再适用。
macOS arm64 native binary 支持正在验证中，暂不承诺 latest 全平台支持。
```

如果 native 支持验证通过，可以改成：

```text
macOS arm64 native binary: experimental
已验证版本：2.1.116
要求：node-lief
Linux / Windows native binary: unsupported
```

## 研究输出格式要求

请最终给出：

1. 一句话结论：现在应不应该追 latest。
2. 推荐路线：保守、折中、激进三种选择。
3. 最推荐方案的实现步骤。
4. 必须修改的文件清单。
5. 必须新增或更新的测试。
6. 发布前验证命令。
7. 对外 README / release notes 应该怎么写。
8. 明确不能承诺的范围。

请用中文，尽量说人话。不要只讲概念，要给可操作的下一步。

## 安全约束

研究和验证时不要碰用户当前正在使用的 Claude Code。

禁止：

- 不要运行 `npm install -g @anthropic-ai/claude-code`
- 不要运行 `claude update`
- 不要 patch `~/.claude/bin/claude`
- 不要 patch 当前 PATH 里的 `claude`
- 不要修改 `~/.claude` 下用户真实配置

允许：

- 使用临时目录下载 npm tarball
- 使用临时目录安装 `node-lief`
- 对临时 binary 副本做 extract / patch / repack
- 用临时 `HOME` 跑 `./claude-copy --version`

## 当前建议

短期先做两件事：

1. 把 stable 支持窗口更新到 `2.1.112`，并说明 `2.1.113+` 暂不支持旧 CLI Patch。
2. 单独开 native experimental 分支，先把 macOS arm64 `2.1.116` 跑通并补齐验证链。

不要一开始就承诺全平台 latest。
