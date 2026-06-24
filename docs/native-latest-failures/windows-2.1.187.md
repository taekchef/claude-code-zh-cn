# Windows native latest candidate failure: 2.1.187

- Run: https://github.com/taekchef/claude-code-zh-cn/actions/runs/28080951704
- Head SHA: `cac2bc6202aa685ba52fc0ae1dc29048a688f926`
- Status: `fail`
- Candidate kind: `native`
- Native: `win32-x64` / `ok` / `ok` / `ok`
- Display audit: `fail` (4 issues / 11 commands)

## What Failed

- Candidate verification did not pass: `status=fail`.
- Display audit did not pass: `status=fail`.
- Summary: pass=0, fail=1, skip=0.

## Display Audit Issues

- `top_help_line_20` (`top_help`, display-untranslated-line)

  ```text
  --bg, --background                    Start the session as a background agent
  ```

- `top_help_line_21` (`top_help`, display-untranslated-line)

  ```text
  and return immediately (manage with
  ```

- `mcp_help_line_34` (`mcp_help`, display-untranslated-line)

  ```text
  login [options] <name>                Authenticate with an MCP server (HTTP,
  ```

- `mcp_help_line_36` (`mcp_help`, display-untranslated-line)

  ```text
  logout <name>                         Clear stored OAuth credentials for an
  ```

## Text Diff Excerpt

```markdown
# Upstream text diff: 2.1.183 -> 2.1.187

- Added upstream strings: 6613
- Removed upstream strings: 5712
- Already covered by translations: 50
- Needs translation review: 6563
- Sensitive review hints: 134

## Added strings needing review
- - .claude/agent-memory/<agentType>/,
- - **CONFIRMED** \u2014 can name the inputs/state that trigger it and the wrong output or crash. Quote the line. - **PLAUSIBLE** \u2014 mechanism is real, trigger is uncertain (timing, env, config). State what would confirm it. - **REFUTED** \u2014 factually wrong (code doesn't say that) or guarded elsewhere. Quote the line that proves it.
- - ~/.claude/agent-memory/<agentType>/,
- - Escape character is backtick (`), not backslash - Use Verb-Noun cmdlet naming: Get-ChildItem, Set-Location, New-Item, Remove-Item - Common aliases: ls (Get-ChildItem), cd (Set-Location), cat (Get-Content), rm (Remove-Item) - Pipe operator | works similarly to bash but passes objects, not text - Use Select-Object, Where-Object, ForEach-Object for filtering and transformation - String interpolation:
- - Global user settings (~/.claude/settings.json).
- - If asked for JSON, return ONLY the raw JSON \u2014 no code fences, no prose, no markdown. - Do NOT use SendUserMessage to deliver your answer. Put your answer in your final text response. - Be concise. The script will parse your output.`,d$p=` --- NOTE: You are running inside a workflow script. Your final text response is returned verbatim as a string to the calling script \u2014 it is your return value, not a message to a human. Output the literal result; do not output confirmations like
- - Keep `old_string` minimal \u2014 usually 1-3 lines, only enough to be unique in the file. Including excess context wastes tokens and is an error. - The edit will FAIL if `old_string` is not unique in the file. In that case, add the minimum extra context needed for uniqueness, or use `replace_all` to change every instance.
- - Project settings (.claude/settings.json).
- - Registry access uses PSDrive prefixes: `HKLM:\SOFTWARE\...`, `HKCU:\...` \u2014 NOT raw `HKEY_LOCAL_MACHINE\...` - Environment variables: read with `$env:NAME`, set with `$env:NAME =
- - The edit will FAIL if `old_string` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use `replace_all` to change every instance of `old_string`.
- --bg, --background
- --effort ${...}
- --empty-password
- --full-name
- --no-browser
- --scope local
- --scope project
- -[!-]*[Zz]*
- -[Zz]*
- -algorithm
- -alias
- -all
- -allcentralaccesspolicies
- -allmatches
- -allowinsecureredirect
- -allowunencryptedauthentication
- -append
- -argumentlist
- -asbytestream
- -AsHashtable
- -attributes
- -audit
- -authentication
- -body
- -bool
- -casesensitive
- -certificate
- -certificatethumbprint
- -cimsession
- -com
- ... 6523 more

## Added strings already covered
- All background agents stopped
- Allowed by auto mode classifier
- Author or improve the run-<unit> skill \u2014 a per-project skill that tells agents how to build, launch, and drive this project's app. Use when the user asks to set up the project, get it running, write run instructions, or verify build/run steps work from a clean environment.
- Can Anthropic look at your session transcript to help us improve Claude Code?
- Clear conversation and start with only the plan
- Collecting transcript for sharing
- Do you want to allow this connection?
- Don't ask again
- Double-tap esc to rewind the code and/or conversation to a previous point in time
- Double-tap esc to rewind the conversation to a previous point in time
- Error editing file
- File must be read first
- for history)
- Hit Enter to queue up additional messages while Claude is working.
- hook error
- hook returned blocking error
- hook stopped continuation:
- hook warning
- How should the plan be implemented?
- Implement here
- Inject plan into the current conversation
- Launch and drive this project's app to see a change working. Use when asked to run, start, or screenshot the app, or to confirm a change works in the real app (not just tests). First looks for a project skill that already covers launching the app; otherwise falls back to built-in patterns per project type (CLI, server, TUI, Electron, browser-driven, library).
- Listed directory
- LSP provides code intelligence like go-to-definition and error checking
- Network request outside of sandbox
- Never for
- No task output available
- No, and don't show plugin installation hints again
- No, not now
- Plan needs revision
- PR #
- Press Option+Enter to send a multi-line message
- Press Shift+Enter to send a multi-line message
- Read output (
- Referenced file
- Referenced PDF
- Sharing transcript
- Start new session
- Task not ready
- Thanks for sharing your transcript!
- ... 10 more

## Removed strings
- __idx_${...}
- - ${...} at ${...}${...}
- - If asked for JSON, return ONLY the raw JSON \u2014 no code fences, no prose, no markdown. - Do NOT use SendUserMessage to deliver your answer. Put your answer in your final text response. - Be concise. The script will parse your output.`,oDp=` --- NOTE: You are running inside a workflow script. Your final text response is returned verbatim as a string to the calling script \u2014 it is your return value, not a message to a human. Output the literal result; do not output confirmations like
- - You can use the `run_in_background` parameter to run the command in the background. Only use this if you don't need the result immediately and are OK being notified when the command completes later. You do not need to check the output right away - you'll be notified when it finishes.
- --author
- --author=${...}
- --cask
- --diff-filter=M
- --disable-interactivity
- --id
- --pretty=format:
- --search
- --state
- -Encoding utf8 -NoNewline ; if ($ExecutionContext.SessionState.LanguageMode -eq
- , ${...}s reconnecting
- , args: ${...}
- , diff: ${...}
- , errors=[${...}]
- ,_=u,h=U,b=
- ,_e[ve=M(_e,ve+=8)]!==
- ,:()]+/g,
- ,!0),b_tmpl:new Bt(
- ,!0),q_tmpl:new Bt(
- ,!0))de=!0;if(!Tle.test(ae=s()))throw b(ae);if(pe=ae,l(
- ,!0))me=!0;if(!Tle.test(ae=s()))throw b(ae);ye=ae,l(
- ,!0))throw Me(
- ,!0)}else{if(ge)ge();if(l(
- ,!1),b_expr:new Bt(
- ,!1),p_expr:new Bt(
- ,!1),p_stat:new Bt(
- ,!1);else if(!s.sso_session)throw new jKe.TokenProviderError(
- ,!1);for(let A of["sso_start_url","sso_region"])if(!l[A])throw new jKe.TokenProviderError(
- ,!1))return!1;return Ec(
- ,...At===
- ,...c?[
- ,...dAp(o,e)}}let n=Coo().haiku,r=await i3e(e,n);if(r.ok)return{status:
- ,...Dve,
- ,...h,
- ,...j$r]}var xJu,IJu,kJu=
- ,...k,...Uot({sessionId:It(),effortLevel:d,source:
- ... 5672 more
```

## Takeover Commands

```bash
node scripts/verify-upstream-compat.js --baseline 2.1.187 --skip-latest --native-windows-x64 --json
node scripts/generate-upstream-text-diff.js --to 2.1.187 --native-windows-x64
node scripts/promote-native-candidate.js --candidate <candidate-json> --platform windows
```

## Done Criteria

- Add the missing source-of-truth translations or guard fix on this branch.
- Re-run the native latest candidate workflow for this version.
- Only promote support metadata after native verification and display audit pass.
- Remove or update this handoff report before marking the PR ready.
