import type { Metadata } from "next";
import Image from "next/image";
import { CopyInstallButton } from "./copy-install-button";

const repository = "https://github.com/taekchef/claude-code-zh-cn";
const installCommand =
  "curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/install-remote.sh | bash";

export const metadata: Metadata = {
  title: "Claude Code 中文本地化",
  description:
    "一条命令，把 Claude Code 的终端界面、等待提示、系统通知和默认回复切换为简体中文。",
};

export default function Home() {
  return (
    <main>
      <nav className="nav shell" aria-label="主导航">
        <a className="brand" href="#top" aria-label="返回顶部">
          <span className="brand-mark" aria-hidden="true">
            中
          </span>
          <span>claude-code-zh-cn</span>
        </a>
        <div className="nav-links">
          <a href="#why">为什么做</a>
          <a href="#proof">真实效果</a>
          <a href={`${repository}#安装说明`}>安装说明</a>
          <a className="nav-github" href={repository}>
            GitHub ↗
          </a>
        </div>
      </nav>

      <header className="hero shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Claude Code 简体中文本地化插件</p>
          <h1>
            让终端里的
            <br />
            AI 编程助手
            <br />
            <em>说中文。</em>
          </h1>
          <p className="hero-lead">
            一条命令，把终端界面、等待提示、系统通知和默认回复切换为简体中文。
            装完即用，更新后自动修复。
          </p>
          <div className="install-box" aria-label="一行安装命令">
            <code>{installCommand}</code>
            <CopyInstallButton command={installCommand} />
          </div>
          <p className="hero-note">
            一行远程安装 · 更新后自动修复 · 卸载不丢配置
          </p>
        </div>

        <aside className="hero-aside" aria-label="项目数据">
          <div className="seal">
            <span>开源</span>
            <strong>MIT</strong>
          </div>
          <dl className="hero-stats">
            <div>
              <dt>UI 翻译</dt>
              <dd>1895</dd>
            </div>
            <div>
              <dt>趣味动词</dt>
              <dd>187</dd>
            </div>
            <div>
              <dt>中文提示</dt>
              <dd>41</dd>
            </div>
          </dl>
          <p className="platforms">macOS · Linux · WSL · Windows</p>
        </aside>
      </header>

      <section className="ticker" aria-label="真实中文词库片段">
        <div>
          <span>光合作用中</span>
          <span>蹦迪中</span>
          <span>七荤八素中</span>
          <span>搞事情中</span>
          <span>瞎忙活中</span>
          <span>花里胡哨中</span>
          <span>琢磨了 1分23秒</span>
        </div>
      </section>

      <section className="proof shell section" id="proof">
        <div className="section-head">
          <p className="index">01 / 真实效果</p>
          <h2>不是网页重绘，是真的 Claude Code。</h2>
        </div>
        <figure className="demo-frame">
          <Image
            src="/claude-code-zh-cn-demo.gif"
            alt="真实 Ghostty 窗口中，同一版本 Claude Code 安装中文插件前后的运行对比"
            width={1200}
            height={825}
            unoptimized
          />
          <figcaption>
            <strong>真实 Ghostty 录制</strong>
            <span>
              同一台 Mac、同一个 Claude Code 2.1.211。先运行安装前备份的原版，
              再运行当前中文补丁版；动图只做缩放和前后切换。
            </span>
          </figcaption>
        </figure>
      </section>

      <section className="why section" id="why">
        <div className="shell why-grid">
          <div className="section-head">
            <p className="index">02 / 为什么做这个</p>
            <h2>好工具，不该隔着一层语言。</h2>
          </div>
          <div className="why-copy">
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
        </div>

        <div className="shell layers" aria-label="四层中文化机制">
          {[
            ["01", "设置注入", "默认使用中文回复，保留你原来的个人配置。"],
            ["02", "Hook 系统", "会话启动时检查状态，Claude Code 更新后自动修复。"],
            ["03", "插件系统", "使用正式插件能力安装、启用与跟随 Release 更新。"],
            ["04", "CLI Patch", "替换硬编码界面文案，并在启动前完成安全自检。"],
          ].map(([number, title, body]) => (
            <article className="layer" key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="safety shell section">
        <div className="section-head">
          <p className="index">03 / 安全边界</p>
          <h2>能翻译就翻译，不能安全处理就停手。</h2>
        </div>
        <div className="safety-grid">
          <div className="safety-statement">
            <p>
              遇到还没验证过的新版本，插件会先在本机完成提取、补丁、重打包和启动自检。
            </p>
            <strong>翻不了的部分保持英文，Claude Code 绝不会因为汉化而坏掉。</strong>
          </div>
          <ul>
            <li>
              <span>01</span>安装前备份原文件
            </li>
            <li>
              <span>02</span>失败时保留或恢复原文件
            </li>
            <li>
              <span>03</span>未知新文案原样保留英文
            </li>
            <li>
              <span>04</span>卸载时保留你的其他配置
            </li>
          </ul>
        </div>
      </section>

      <section className="support section">
        <div className="shell support-grid">
          <div>
            <p className="index">04 / 跨平台</p>
            <h2>你在哪写代码，它就在哪说中文。</h2>
          </div>
          <div className="system-list">
            {[
              ["macOS", "npm / native"],
              ["Linux", "npm / WSL"],
              ["Windows", "PowerShell / native"],
            ].map(([name, detail]) => (
              <div key={name}>
                <strong>{name}</strong>
                <span>{detail}</span>
              </div>
            ))}
            <a href={`${repository}/blob/main/docs/support-matrix.md`}>
              查看实时生成的完整支持矩阵 ↗
            </a>
          </div>
        </div>
      </section>

      <section className="final shell section">
        <p className="eyebrow">Claude Code 中文本地化</p>
        <h2>少一点理解界面的消耗，<br />多一点专注写代码的时间。</h2>
        <div className="final-actions">
          <CopyInstallButton command={installCommand} prominent />
          <a href={repository}>在 GitHub 查看源码 ↗</a>
        </div>
        <p>
          如果它让你的 Claude Code 更顺手，欢迎点一下 Star，帮助更多中文用户发现它。
        </p>
      </section>

      <footer className="footer shell">
        <span>claude-code-zh-cn · MIT License</span>
        <span>不是 Claude 官方项目</span>
      </footer>
    </main>
  );
}
