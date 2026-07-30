import Image from "next/image";
import { CopyInstallButton } from "./copy-install-button";
import { GitHubStats } from "./github-stats";
import projectData from "./project-data.json";
import { TerminalDemo } from "./terminal-demo";

const repository = "https://github.com/taekchef/claude-code-zh-cn";
const installCommand =
  "curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/install-remote.sh | bash";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function Home() {
  return (
    <main>
      <div className="ambient" aria-hidden="true" />
      <nav className="nav shell" aria-label="主导航">
        <a className="brand" href="#top" aria-label="返回顶部">
          <span className="brand-glyph">中</span>
          <span>claude-code-zh-cn</span>
        </a>
        <div className="nav-links">
          <a href="#demo">效果</a>
          <a href="#mechanism">原理</a>
          <a href={`${repository}#安装说明`}>文档</a>
          <a className="nav-cta" href={repository}>
            GitHub
          </a>
        </div>
      </nav>

      <header className="hero shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Claude Code 简体中文本地化插件</p>
          <h1>
            <span className="hero-line">让 Claude Code</span>
            <span className="hero-accent">真正说中文。</span>
          </h1>
          <p className="hero-lead">
            终端界面、等待提示、系统通知和默认回复，一条命令切换为简体中文。
          </p>
          <div className="hero-actions">
            <CopyInstallButton command={installCommand} prominent />
            <a href={`${repository}#30-秒安装`}>安装文档</a>
          </div>
        </div>
        <TerminalDemo />
      </header>

      <section className="proof-strip" aria-label="项目真实数据">
        <div className="shell metric-track">
          <div>
            <strong>{projectData.uiTranslations}</strong>
            <span>条 UI 翻译</span>
          </div>
          <div>
            <strong>{projectData.spinnerVerbs}</strong>
            <span>个趣味动词</span>
          </div>
          <div>
            <strong>{projectData.spinnerTips}</strong>
            <span>条中文提示</span>
          </div>
          <GitHubStats />
          <div className="platform-metric">
            <strong>4</strong>
            <span>macOS / Linux / WSL / Windows</span>
          </div>
        </div>
      </section>

      <section className="real-demo shell reveal" id="demo">
        <div className="demo-heading">
          <p className="eyebrow">真实录屏证据</p>
          <h2>同一台 Mac。<br />同一个 Claude Code。</h2>
          <p>
            先运行安装前备份的原版，再运行当前中文补丁版。没有重绘，也没有仿造终端内容。
          </p>
        </div>
        <figure className="ghostty-frame">
          <div className="frame-bar">
            <span>Ghostty</span>
            <span>Claude Code 2.1.211</span>
          </div>
          <Image
            src={`${basePath}/claude-code-zh-cn-demo.gif`}
            alt="真实 Ghostty 窗口中，同一版本 Claude Code 安装中文插件前后的运行对比"
            width={1200}
            height={825}
            unoptimized
            priority
          />
          <figcaption>
            真实 Ghostty 录制。动图只做缩放和前后切换。
          </figcaption>
        </figure>
      </section>

      <section className="verb-marquee" aria-label="真实中文词库片段">
        <div>
          {[
            "光合作用中",
            "蹦迪中",
            "七荤八素中",
            "搞事情中",
            "瞎忙活中",
            "花里胡哨中",
            "琢磨中",
            "光合作用中",
            "蹦迪中",
            "七荤八素中",
          ].map((verb, index) => (
            <span key={`${verb}-${index}`}>✻ {verb}</span>
          ))}
        </div>
      </section>

      <section className="story shell reveal">
        <div className="story-title">
          <span>为什么做这个？</span>
          <h2>一个很棒的工具，<br />不该隔着语言使用。</h2>
        </div>
        <div className="story-copy">
          <p>
            Claude Code 是一个很棒的终端 AI 编程助手，但它没有中文界面。UI
            文字主要硬编码在一个 13MB 的 <code>cli.js</code> 里，没有 i18n
            基础设施。
          </p>
          <p>
            官方短期内不太可能加中文支持。所以我做了这个插件，通过四层机制实现中文化，
            自动检测安装方式，更新后自动修复。
          </p>
        </div>
      </section>

      <section className="mechanism" id="mechanism">
        <div className="shell mechanism-layout">
          <div className="mechanism-intro">
            <h2>不是简单替换。<br />是四层协同。</h2>
            <p>
              设置、Hook、插件系统与 CLI Patch 各自负责一层。更新时重新检查，异常时安全停手。
            </p>
          </div>
          <div className="mechanism-stack">
            {[
              ["设置注入", "让 AI 默认使用中文回复，同时保留你的个人设置。", "LANGUAGE"],
              ["Hook 系统", "每次会话启动时检查版本变化，必要时自动修复。", "SESSION"],
              ["插件系统", "通过正式插件能力安装、启用并跟随 Release 更新。", "PLUGIN"],
              ["CLI Patch", "处理硬编码界面文案，替换前后都执行安全自检。", "PATCH"],
            ].map(([title, body, code]) => (
              <article className="mechanism-card" key={title}>
                <span>{code}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="safety shell reveal">
        <div className="safety-copy">
          <p className="eyebrow">安全降级</p>
          <h2>翻不了的部分保持英文。<br />CLI 绝不会坏。</h2>
          <p>
            新版本会先在本机完成提取、翻译、重打包和启动自检。任一步失败都保留或恢复原文件。
          </p>
        </div>
        <div className="safety-orbit" aria-hidden="true">
          <span className="orbit-core">SAFE</span>
          <span className="orbit-ring ring-one" />
          <span className="orbit-ring ring-two" />
          <span className="orbit-label label-backup">备份</span>
          <span className="orbit-label label-verify">自检</span>
          <span className="orbit-label label-restore">恢复</span>
        </div>
      </section>

      <section className="install shell reveal">
        <div className="install-copy">
          <h2>装完即用。</h2>
          <p>一行远程安装。更新后自动修复。卸载不丢配置。</p>
        </div>
        <div className="command-panel">
          <div className="command-topline">
            <span>TERMINAL</span>
            <span>macOS / Linux / WSL</span>
          </div>
          <code>
            <span>$</span> {installCommand}
          </code>
          <CopyInstallButton command={installCommand} />
        </div>
        <div className="install-links">
          <a href={`${repository}#windows-原生安装`}>Windows 安装说明</a>
          <a href={`${repository}/blob/main/docs/support-matrix.md`}>
            完整支持矩阵
          </a>
          <a href={`${repository}/releases/latest`}>最新 Release</a>
        </div>
      </section>

      <section className="final-cta">
        <div className="shell final-inner">
          <h2>让终端里的 AI 编程助手说中文 🇨🇳</h2>
          <p>
            如果它让你的 Claude Code 更顺手，点一下 Star，帮助更多中文用户发现它。
          </p>
          <div className="final-actions">
            <a className="star-button" href={repository}>
              前往 GitHub Star
            </a>
            <span>MIT License</span>
          </div>
        </div>
      </section>

      <footer className="footer shell">
        <span>claude-code-zh-cn</span>
        <span>当前插件 {projectData.version}，社区项目，非 Claude 官方产品</span>
      </footer>
    </main>
  );
}
