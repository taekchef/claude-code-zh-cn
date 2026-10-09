<div align="center">

# claude-code-zh-cn

**Simplified Chinese Localization Plugin for Claude Code CLI**

Making Claude Code in your terminal finally speak human Chinese 🇨🇳

[English](./README.en.md) · [简体中文](./README.md) · [Website](https://taekchef.github.io/claude-code-zh-cn/) · [Codex Chinese Edition](https://github.com/taekchef/codex-code-zh-cn)

187 hilarious spinner verbs, 41 tips, localized duration readouts, and 2,000+ UI string patches.

[![GitHub](https://img.shields.io/badge/GitHub-taekchef%2Fclaude--code--zh--cn-blue?logo=github)](https://github.com/taekchef/claude-code-zh-cn)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![npm](https://img.shields.io/badge/npm-2.1.92--2.1.112-green)](./docs/support-matrix.md)
[![macOS native](https://img.shields.io/badge/macos%20native-2.1.113--2.1.285-green)](./docs/support-matrix.md)
[![Linux native](https://img.shields.io/badge/linux%20native-2.1.220--2.1.285-green)](./docs/support-matrix.md)
[![Windows native](https://img.shields.io/badge/windows%20native-2.1.113--2.1.289-green)](./docs/support-matrix.md)
[![Version](https://img.shields.io/github/v/tag/taekchef/claude-code-zh-cn?label=Version&color=blue)](https://github.com/taekchef/claude-code-zh-cn/releases)

**macOS · Linux · WSL · Windows**

**One-line remote install · Self-healing on update · Zero-token in-session language toggle**

</div>

---

## 📢 Sponsor

<div align="center">

<a href="https://www.infistar.cc/register?aff=J9HHJWNL&ref_source=link"><img src="./docs/assets/infistar-banner.png" alt="Infistar.cc" /></a>

</div>

**claude-code-zh-cn × [Infistar.cc](https://www.infistar.cc/register?aff=J9HHJWNL&ref_source=link)**

Running autonomous coding agents drains tokens fast and often hits rate limits or payment barriers 💸.

We recommend Infistar's API proxy service:
- ⚙️ **Zero Setup Friction**: Just configure `ANTHROPIC_BASE_URL` and run immediately.
- 🏷️ **Unbeatable Rates**: Up to 90%+ discount compared to official rates, with crystal clear multipliers.
- 💳 **No Foreign Cards Needed**: Multiple convenient payment methods, transparent model verification.
- 🎁 **Exclusive Bonus**: Sign up via the [exclusive link](https://www.infistar.cc/register?aff=J9HHJWNL&ref_source=link) to claim **$5 free trial credits** to benchmark your long coding sessions 🚀!

---

## 🧐 Why build this?

Anthropic's Claude Code CLI is arguably the coolest terminal AI agent out there. But all UI strings are hardcoded into a monolithic 13MB bundle, with zero i18n infrastructure in sight.

Writing code is painful enough — why should you stare at cold English loading messages while waiting for an agent?

So we built this plugin. **One command turns your terminal interface, wait spinners, elapsed time meters, and notifications into natural, expressive Chinese — complete with the cheeky spirit of the original quirks!**

---

## 👀 Visual Preview

https://github.com/user-attachments/assets/ff572893-f927-402c-9217-f68f04f4c9d5

Instead of the plain old `Photosynthesizing...`:

```text
⠙ 光合作用中...
💡 按 Shift+Tab 在默认模式、自动接受编辑模式和 Plan 模式之间切换
```

And plenty more down-to-earth developer mood indicators:

```text
⠙ 蹦迪中...          ⠙ 七荤八素中...         ⠙ 搞事情中...
⠙ 瞎忙活中...        ⠙ 花里胡哨中...         ⠙ 变魔术中...

  琢磨了 1分23秒
```

---

## ⚡ Quick Install

### Option A: The One-Liner (Recommended)

**macOS / Linux / WSL**:

```bash
curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/install-remote.sh | bash
```

**Windows** (PowerShell):

```powershell
git clone https://github.com/taekchef/claude-code-zh-cn.git
cd claude-code-zh-cn
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
```

### Option B: Via Official Claude Code Plugin Marketplace

If you already use the native Claude Code plugin ecosystem:

```bash
claude plugin marketplace add --scope user https://github.com/taekchef/claude-code-zh-cn
claude plugin install claude-code-zh-cn@claude-code-zh-cn --scope user
```

Restart `claude`, and when you see "光合作用中" (Photosynthesizing) or "思考中" (Thinking), you're all set!

---

## 🔄 Instant Language Toggle (0 Tokens Used!)

Need to check English docs, paste an error message upstream, or collaborate with international peers? **No need to uninstall anything.**

Just type right inside your Claude Code session:

| Command | Action |
|---|---|
| `/english` (or `/en`) | Instantly drops back to raw, untranslated English UI |
| `/chinese` (or `/zh`) | Snaps right back to Chinese mode |

Intercepted instantly by a prompt hook before hitting LLMs — **zero tokens consumed**, near-zero latency.

---

## 🎭 187 Hilarious Spinner Verbs

Claude Code's creators packed the loading spinner with hilarious verbs (`Flibbertigibbeting`, `Photosynthesizing`, `Canoodling`...). We didn't just translate them — we localized their unhinged developer spirit:

| English Original | Localized Chinese | | English Original | Localized Chinese |
|---|---|---|---|---|
| `Thinking` | 思考中 *(Thinking)* | | `Moonwalking` | 太空步中 *(Moonwalking)* |
| `Photosynthesizing` | 光合作用中 *(Photosynthesizing)* | | `Flibbertigibbeting` | 叽里呱啦中 *(Chattering)* |
| `Discombobulating` | 七荤八素中 *(Dazed & Confused)* | | `Whatchamacalliting` | 那个啊来着中 *(Whatchamacallit)* |
| `Shenaniganing` | 搞事情中 *(Making Shenanigans)* | | `Razzmatazzing` | 花里胡哨中 *(Razzmatazzing)* |
| `Boondoggling` | 瞎忙活中 *(Wasting Time)* | | `Prestidigitating` | 变魔术中 *(Conjuring Magic)* |
| `Clauding` | 克劳丁中 *(Clauding)* | | `Boogieing` | 蹦迪中 *(Boogieing/Clubbing)* |
| `Canoodling` | 腻歪中 *(Flirting)* | | `Spelunking` | 探洞中 *(Caving)* |

> See all 187 verbs in [verbs/zh-CN.json](./verbs/zh-CN.json).

---

## 🛠️ Under the Hood: Non-Destructive Architecture

How do you translate a 13MB compiled CLI safely without risking corruption?

1. **Layer 1: Native Settings** (`settings.json`): Configures spinner verbs, tips, and language preferences. Survives upstream updates.
2. **Layer 2: Hook System**: Intercepts notifications and session initialization.
3. **Layer 3: Official Plugin System**: Delivers Chinese output styles natively.
4. **Layer 4: AST-Safe String Patcher**:
   - Accurately targets double-quoted string literals; never modifies code logic, comments, or regexes.
   - Always operates against a pristine upstream backup — zero "patches on top of patches".
   - Runs syntax verification and CLI health checks. If an unverified upstream update introduces unexpected formats, it gracefully falls back to English without ever crashing Claude Code.

---

## ❓ FAQ

<details>
<summary><b>Will upstream Claude Code updates break this?</b></summary>

No. Layers 1–3 persist across updates. When a new binary is detected, Layer 4 automatically tests itself before applying patches. Even if an untested update changes structural layout, it cleanly preserves or reverts to the original English binary so your CLI stays 100% operational.
</details>

<details>
<summary><b>How do I completely uninstall?</b></summary>

- macOS / Linux / WSL:
  ```bash
  curl -fsSL https://github.com/taekchef/claude-code-zh-cn/releases/latest/download/uninstall-remote.sh | bash
  ```
- Windows: Run `uninstall.ps1` from the cloned repo.
All changes are cleanly reversed using your original backups.
</details>

<details>
<summary><b>I'm seeing 403 or network errors — did the plugin cause this?</b></summary>

No. This plugin only touches visual presentation strings. It does not tamper with authentication, API requests, proxies, or endpoints. Connection issues are typically related to Anthropic account status or network proxies. Run `./doctor.sh` to diagnose.
</details>

<details>
<summary><b>Can I customize my own verbs or tips?</b></summary>

Absolutely! Edit `verbs/zh-CN.json` or `tips/zh-CN.json`, then run `./install.sh` again. Feel free to submit PRs with your favorite jokes!
</details>


---

## 🔗 Sister Projects & Links

- [**codex-code-zh-cn**](https://github.com/taekchef/codex-code-zh-cn) — Simplified Chinese localization for the Codex CLI with `/chinese` & `/english` instant switching.
- [Linux.do](https://linux.do)

## 🙏 Acknowledgements

- [@hjkl950217](https://github.com/hjkl950217) for bytecode constant-pool patching and validation.
- Inspired by [zstings/claude-code-zh-cn](https://github.com/zstings/claude-code-zh-cn) (VS Code extension Chinese localization).

## 📄 License

[MIT](./LICENSE)

---

*This project is an independent open-source tool and is not affiliated with Anthropic. Claude Code is a trademark of Anthropic Inc.*
