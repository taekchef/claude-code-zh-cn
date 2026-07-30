"use client";

import { useEffect, useState } from "react";

const states = {
  original: {
    label: "安装前",
    status: "Photosynthesizing…",
    tip: "Tip: Press Shift+Tab to switch between default, auto-accept edits, and plan modes",
    elapsed: "Cooked for 1m 23s",
  },
  chinese: {
    label: "安装后",
    status: "光合作用中…",
    tip: "💡 按 Shift+Tab 在默认模式、自动接受编辑模式和 Plan 模式之间切换",
    elapsed: "琢磨了 1分23秒",
  },
};

type Mode = keyof typeof states;

export function TerminalDemo() {
  const [mode, setMode] = useState<Mode>("chinese");
  const current = states[mode];

  useEffect(() => {
    const timer = window.setInterval(
      () => setMode((value) => (value === "chinese" ? "original" : "chinese")),
      5200,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="terminal-stage" aria-label="交互终端模拟">
      <div className="terminal-glow" aria-hidden="true" />
      <div className="terminal-window">
        <div className="terminal-bar">
          <div className="window-controls" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span>claude</span>
          <span className="demo-label">交互终端模拟</span>
        </div>
        <div className="terminal-body" key={mode}>
          <p className="terminal-brand">✻ Claude Code</p>
          <p className="terminal-prompt">
            <span>&gt;</span> 帮我检查这个项目
          </p>
          <div className="terminal-response">
            <p className="terminal-status">
              <span className="spinner">✻</span> {current.status}
            </p>
            <p className="terminal-tip">{current.tip}</p>
            <p className="terminal-elapsed">{current.elapsed}</p>
          </div>
        </div>
        <div className="terminal-switch" aria-label="切换安装前后模拟效果">
          {(Object.keys(states) as Mode[]).map((value) => (
            <button
              key={value}
              type="button"
              className={mode === value ? "active" : ""}
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
            >
              {states[value].label}
            </button>
          ))}
        </div>
        <p className="terminal-source">内容取自当前真实翻译词库，不是录屏证据</p>
      </div>
    </section>
  );
}
