# 内网 / 离线安装

没有外网、没有预装 Node.js 的服务器，可以先在联网机器准备文件，再把 Node.js 运行环境和插件一起带进去。无需全局安装 Node.js，也无需管理员权限；但服务器必须允许执行这些程序。

| 服务器条件 | 处理方式 |
| --- | --- |
| 没有预装 Node.js，但允许携入可执行文件 | 使用下面的便携运行环境 + 本地源码安装 |
| 禁止运行 Node.js | 当前插件不能完整安装和运行：安装器、Hook、诊断和 UI 补丁都依赖 Node.js |
| 没有外网，但能访问内部模型网关 | 离线安装插件后，沿用原有网关配置 |
| 完全没有可访问的模型服务 | 可以安装中文插件；插件不会提供离线模型推理能力 |

## 1. 在联网机器准备

先在目标服务器确认系统、CPU 架构和 Claude Code 版本：

```bash
uname -s
uname -m
getconf GNU_LIBC_VERSION  # Linux glibc 系统；Alpine/musl 不适用
claude --version
```

下面以 Linux 为例。准备机须与目标机的系统、CPU 架构、libc 兼容，可以使用匹配目标机的虚拟机或容器。不要把 macOS 的 node-lief 或 x64 的运行环境复制到 Linux ARM64 上。

1. 从 [Node.js 官方下载页](https://nodejs.org/en/download) 下载目标平台的 **Node.js 24 LTS 二进制压缩包**，按官方说明校验 SHA-256。确认目标系统满足其运行要求；旧版 glibc 和 Alpine/musl 不能直接套用普通 Linux 包。
2. 从 [本项目 Release](https://github.com/taekchef/claude-code-zh-cn/releases) 下载所选版本的完整源码压缩包，包含隐藏的 `.claude-plugin` 目录。不要只复制 `plugin/`，也不要在断网服务器执行远程 `curl` 安装命令。
3. 整理为以下目录（目录名由你在解压后统一命名）：

```text
cczh-offline/
  node/                 # Node.js 压缩包解压后的内容，包含 bin/node、bin/npm
  source/               # 插件源码，包含 install.sh、.claude-plugin/、plugin/
  deps/                 # 下一条命令准备二进制处理依赖
```

在匹配目标平台的准备机上执行：

```bash
export PATH="$PWD/cczh-offline/node/bin:$PATH"
node --version
npm install --prefix "$PWD/cczh-offline/deps" node-lief@1.3.2
NODE_PATH="$PWD/cczh-offline/deps/node_modules" node -e 'require("node-lief"); console.log("node-lief OK")'
tar -czf cczh-offline.tar.gz cczh-offline
sha256sum cczh-offline.tar.gz > cczh-offline.tar.gz.sha256
```

`node-lief` 用于原生 Claude Code 的界面补丁。必须带上完成安装后的整个 `deps/`，只下载一个 npm 压缩包不等于依赖已准备完整。通过组织允许的方式把压缩包和校验文件传入内网。

## 2. 在内网服务器安装

先关闭所有 Claude Code 会话，在压缩包所在目录校验并解压：

```bash
sha256sum -c cczh-offline.tar.gz.sha256
tar -xzf cczh-offline.tar.gz -C "$HOME"
export PATH="$HOME/cczh-offline/node/bin:$PATH"
export NODE_PATH="$HOME/cczh-offline/deps/node_modules${NODE_PATH:+:$NODE_PATH}"
node --version
node -e 'require("node-lief"); console.log("node-lief OK")'
claude --version

# 明确使用本地市场目录，无需访问 GitHub 或 npm
ZH_CN_MARKETPLACE_SOURCE="$HOME/cczh-offline/source" \
  bash "$HOME/cczh-offline/source/install.sh"
```

把上述两条 `export` 加入你实际使用的 shell 启动配置，并让启动 Claude Code 的终端或服务继承它们。**安装完成后也要保留运行环境和本地源码目录**：Hook 每次会话仍需要 `node`，本地市场的更新也需要源码目录。不要只在安装时临时设置 PATH，随后删掉 Node.js。

这里使用 Claude Code 官方支持的[本地插件市场](https://code.claude.com/docs/en/discover-plugins#add-from-local-paths)，以及安装器已有的 `ZH_CN_MARKETPLACE_SOURCE` 参数，无需另装一个离线安装器。

## 3. 验证及更新

```bash
claude plugin marketplace list --json
claude plugin list --json
bash "$HOME/cczh-offline/source/doctor.sh" --json
```

确认本插件已启用、市场源为本地目录、中文设置检查正常；需要完整界面补丁时，还要确认诊断中的 `layer4Status` 为 `ok`，而不是只看总退出码。随后重新打开 Claude Code，检查界面并粘贴一段多行文本。

原生程序能否打补丁取决于具体平台和版本，以[支持矩阵](support-matrix.md)和本机诊断结果为准。上游升级后先在联网准备机验证同一版本，再更新离线文件；更新插件时换入新版本的完整源码并重跑本地安装命令。不要在内网指望 GitHub / npm 自动下载更新。

CC Switch 额外说明：完整 shell 安装器使用 `sqlite3` 命令检查数据库；没有该命令时会明确提示未同步。若需要同步，可在安装后使用 Node.js 24 内置 SQLite 的增强安装脚本，先查看输出，再按提示授权同步：

```bash
node "$HOME/cczh-offline/source/plugin/skills/zh-cn-setup/scripts/setup.js"
# 确认需要把中文字段合并到 CC Switch 后执行：
ZH_CN_CCSWITCH_SYNC=1 node "$HOME/cczh-offline/source/plugin/skills/zh-cn-setup/scripts/setup.js"
```

这两条命令不需要下载 npm 依赖或安装 sqlite3 CLI。同步前会备份数据库，保留非中文配置；已有损坏 JSON 会停止写入，需先修正配置。

验证记录：macOS arm64 / Claude Code 2.1.265 已使用独立用户目录、便携 Node.js、预装 node-lief 和本地源码，在系统级禁止网络访问时完成安装、插件启用及 `layer4Status=ok` 诊断。Linux 原生兼容性另由持续集成验证；目标服务器的发行版、架构和 libc 仍需匹配，不能把这次 macOS 实测当作任意 Linux 服务器已验证。
