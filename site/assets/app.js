/* Claude Code 中文 · interactions
   Terminal demo renders real translation pairs from the plugin payload. */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- copy buttons ---------- */

  function bindCopyButtons() {
    var buttons = document.querySelectorAll(".copy-btn");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var target = document.getElementById(btn.getAttribute("data-copy-target"));
        if (!target) return;
        var text = target.textContent;
        function done() {
          btn.classList.add("is-copied");
          setTimeout(function () { btn.classList.remove("is-copied"); }, 1600);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
        } else {
          legacyCopy(text);
          done();
        }
      });
    });
  }

  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* no-op */ }
    document.body.removeChild(ta);
  }

  /* ---------- install tabs ---------- */

  function bindTabs() {
    var tabs = document.querySelectorAll(".install-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) {
          var active = t === tab;
          t.classList.toggle("is-active", active);
          t.setAttribute("aria-selected", active ? "true" : "false");
        });
        document.querySelectorAll(".install-pane").forEach(function (pane) {
          var show = pane.id === tab.getAttribute("data-pane");
          pane.classList.toggle("is-active", show);
          if (show) { pane.removeAttribute("hidden"); } else { pane.setAttribute("hidden", ""); }
        });
      });
    });
  }

  /* ---------- reveal on scroll ---------- */

  function bindReveals() {
    var els = document.querySelectorAll(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- stat count-up ---------- */

  function bindCounters() {
    var nums = document.querySelectorAll(".stat-num");
    function setAll() { nums.forEach(function (el) { el.textContent = el.getAttribute("data-count"); }); }
    if (reduceMotion || !("IntersectionObserver" in window)) { setAll(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        var el = entry.target;
        var target = parseInt(el.getAttribute("data-count"), 10);
        var start = null;
        var duration = 1300;
        function tick(ts) {
          if (start === null) start = ts;
          var p = Math.min((ts - start) / duration, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased).toLocaleString("en-US");
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.5 });
    nums.forEach(function (el) { io.observe(el); });
  }

  /* ---------- terminal demo ---------- */

  // Transcript lines. Every ZH line is a real string shipped by the plugin
  // (cli-translations.json / verbs zh-CN.json).
  var SPINNERS_ZH = ["编舞中", "光合作用中", "翻搅中", "烘焙中", "沉思中", "琢磨中"];
  var SPINNERS_EN = ["Choreographing", "Photosynthesizing", "Churning", "Baking", "Pondering", "Cogitating"];

  function transcript(lang) {
    var zh = lang === "zh";
    var l = [];
    l.push({ cls: "t-box-top", text: zh ? "╭─ 欢迎回来！ ────────────────────────────────╮" : "╭─ Welcome back! ─────────────────────────────╮" });
    l.push({ cls: "t-box", text: zh ? "│ 提示：运行 /init 创建 CLAUDE.md，写入项目指引   │" : "│ Tips: Run /init to create a CLAUDE.md file   │" });
    l.push({ cls: "t-box", text: zh ? "│ 运行 /help 查看可用命令                       │" : "│ Run /help to see available commands          │" });
    l.push({ cls: "t-box-top", text: zh ? "╰──────────────────────────────────────────────╯" : "╰──────────────────────────────────────────────╯" });
    l.push({ cls: "", text: "" });
    l.push({ cls: "t-input", text: "帮我看看这个项目的结构" });
    l.push({ cls: "", text: "" });
    l.push({ cls: "t-dim", text: zh ? "  思考了 3 秒（ctrl+o 展开）" : "  Thought for 3s (ctrl+o to expand)" });
    l.push({ cls: "", text: "" });
    l.push({ cls: "", text: zh ? "● 项目结构如下：入口在 src/index.ts，测试在 tests/。" : "● Here is the project structure: entry at src/index.ts, tests in tests/." });
    l.push({ cls: "", text: zh ? "  建议先看 src/index.ts 的初始化逻辑。" : "  I suggest starting with the init logic in src/index.ts." });
    l.push({ cls: "", text: "" });
    l.push({ cls: "t-accent", text: zh ? "✻ 编舞中 3 秒" : "✻ Choreographing for 3s" });
    l.push({ cls: "", text: "" });
    l.push({ cls: "t-dim", text: zh ? "? 要继续吗？ (y/n)" : "? Do you want to proceed? (y/n)" });
    l.push({ cls: "t-dim", text: zh ? "  按 Enter 确认 · 按 Esc 取消" : "  Enter to confirm · Esc to cancel" });
    return l;
  }

  var termBody = document.getElementById("terminalBody");
  var btnEn = document.getElementById("btnEn");
  var btnZh = document.getElementById("btnZh");
  var currentLang = "en";
  var typeTimer = null;
  var spinnerTimer = null;
  var started = false;

  function lineEl(spec) {
    var div = document.createElement("div");
    div.className = "t-line" + (spec.cls ? " " + spec.cls : "");
    div.textContent = spec.text.length ? spec.text : " ";
    return div;
  }

  function renderInstant(lang) {
    clearTimers();
    termBody.textContent = "";
    transcript(lang).forEach(function (spec) { termBody.appendChild(lineEl(spec)); });
    appendCursor();
    startSpinner(lang);
  }

  function appendCursor() {
    var last = termBody.lastElementChild;
    if (!last) return;
    var cursor = document.createElement("span");
    cursor.className = "t-cursor";
    last.appendChild(cursor);
  }

  function renderTyped(lang) {
    clearTimers();
    termBody.textContent = "";
    var lines = transcript(lang);
    var idx = 0;
    function next() {
      if (idx >= lines.length) { appendCursor(); startSpinner(lang); return; }
      var el = lineEl(lines[idx]);
      if (idx === lines.length - 1) {
        var cursor = document.createElement("span");
        cursor.className = "t-cursor";
        el.appendChild(cursor);
      }
      termBody.appendChild(el);
      idx += 1;
      var text = lines[idx - 1].text;
      typeTimer = setTimeout(next, Math.min(420, 90 + text.length * 4));
    }
    next();
  }

  function startSpinner(lang) {
    stopSpinner();
    var accentLine = termBody.querySelector(".t-accent");
    if (!accentLine) return;
    var i = 0;
    var list = lang === "zh" ? SPINNERS_ZH : SPINNERS_EN;
    var suffix = lang === "zh" ? " 3 秒" : " for 3s";
    spinnerTimer = setInterval(function () {
      i = (i + 1) % list.length;
      accentLine.textContent = "✻ " + list[i] + suffix;
    }, 1400);
  }

  function stopSpinner() {
    if (spinnerTimer) { clearInterval(spinnerTimer); spinnerTimer = null; }
  }

  function clearTimers() {
    stopSpinner();
    if (typeTimer) { clearTimeout(typeTimer); typeTimer = null; }
  }

  function setLang(lang, animate) {
    currentLang = lang;
    btnEn.classList.toggle("is-active", lang === "en");
    btnZh.classList.toggle("is-active", lang === "zh");
    if (animate && !reduceMotion) {
      termBody.style.opacity = "0";
      setTimeout(function () {
        renderTyped(lang);
        termBody.style.transition = "opacity .3s cubic-bezier(.16,1,.3,1)";
        termBody.style.opacity = "1";
      }, 160);
    } else {
      renderInstant(lang);
    }
  }

  function initTerminal() {
    if (!termBody || !btnEn || !btnZh) return;
    btnEn.addEventListener("click", function () { setLang("en", true); });
    btnZh.addEventListener("click", function () { setLang("zh", true); });

    if (reduceMotion || !("IntersectionObserver" in window)) {
      renderInstant("en");
      return;
    }
    renderInstant("en");
    termBody.textContent = "";
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !started) {
          started = true;
          io.disconnect();
          renderTyped("en");
        }
      });
    }, { threshold: 0.35 });
    io.observe(document.getElementById("terminalFrame"));
  }

  /* ---------- boot ---------- */

  function boot() {
    bindCopyButtons();
    bindTabs();
    bindReveals();
    bindCounters();
    initTerminal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
