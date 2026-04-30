# Native Binary Support Pivot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn `claude-code-zh-cn` from an old `cli.js` patch-only plugin into a dual-engine plugin that can safely support verified Claude Code native binary versions, starting with macOS arm64.

**Architecture:** Keep the existing `cli.js` path as the stable legacy engine for `2.1.92 - 2.1.112`. Add a separate native engine for Bun-packed binaries: detect native shape, extract embedded JS, reuse the same translation patcher, run sentinel checks, repack a temporary binary, validate it with an isolated HOME, and only then allow runtime patching for explicitly verified versions. Unknown native versions must skip cleanly instead of being patched on hope.

**Tech Stack:** Bash, PowerShell boundary checks, Node.js, `node:test`, npm tarballs, `bun-binary-io.js`, `patch-cli.sh`, `scripts/verify-upstream-compat.js`, support matrix generation.

---

## Plain-Language Outcome

This is a product direction shift.

Before:

- Full CLI text patch depends on `package/cli.js`.
- Claude Code `2.1.113+` breaks that assumption.
- The plugin must tell latest users to pin `2.1.112` for full Chinese UI.

After this plan:

- The plugin has two patch engines:
  - **Legacy JS engine**: stable, old npm `cli.js`, `2.1.92 - 2.1.112`.
  - **Native binary engine**: experimental first, macOS arm64 native binary, explicit verified versions only.
- A verified native version can get the same hardcoded UI Chinese patch as old `cli.js` versions.
- `latest` can become a repeatable verification target, not a blind promise.
- Unsupported native versions still get settings, spinner, Hook, and output-style layers, but hardcoded CLI text patch is skipped with clear messaging.

Expected user-facing result for the first release:

| User install | Expected result |
| --- | --- |
| npm old `cli.js` `2.1.92 - 2.1.112` | Full CLI Patch, stable |
| macOS arm64 native version explicitly verified, starting with `2.1.123` | Full CLI Patch, experimental |
| macOS arm64 native newer than verified window | Safe skip, no fake success |
| Linux native | Safe skip, unsupported for full CLI Patch |
| Windows native `.exe` | Safe skip, unsupported for full CLI Patch |
| Windows old npm `cli.js` | Full CLI Patch through PowerShell path, stable |

Success does **not** mean "we support every future latest automatically." It means "we now have a safe machine-checkable process to verify and promote native latest versions quickly."

---

## Strategy

### Recommended Route

Use the **verified-latest lane**:

1. Keep `2.1.112` stable as the safe fallback.
2. Build native support for macOS arm64 first.
3. Treat each latest native version as a candidate.
4. Promote it to `experimental` only after extract, patch, sentinel, repack, rollback, and temp-run verification all pass.
5. Only consider `stable native` after several consecutive native versions pass with no manual rescue.

### Why Not Jump Straight To Stable Latest

Native patching edits a real executable. One successful `2.1.116` spike proved the path is possible, but it did not prove:

- every new latest keeps the same Bun binary layout;
- version detection never fails;
- patching can always roll back cleanly;
- codesign always succeeds;
- Linux and Windows binary formats are safe to rewrite;
- CI can catch a bad native patch before users do.

So the right product move is: **support native as a first-class direction, but gate it by verification.**

---

## Safety Rules

These rules are non-negotiable:

- Never patch the user's current `claude` while doing research verification.
- Never run `npm install -g @anthropic-ai/claude-code`.
- Never run `claude update`.
- Never modify real `~/.claude` during verification.
- Use temp tarballs, temp binaries, temp HOME, temp XDG dirs.
- Runtime patching must create a restorable backup before writing.
- Runtime patching must not write success markers unless repack and temp-run validation succeed.
- Unknown native versions must skip CLI Patch.
- Missing `node-lief` must skip CLI Patch, not fail installation.
- Windows native and Linux native must remain unsupported until separately proven.

---

## Milestones

| Milestone | Goal | Done when |
| --- | --- | --- |
| M0 | Refresh evidence | Current latest/native shape is captured without touching user install |
| M1 | Native verifier | `2.1.123` macOS arm64 can be verified in temp dirs |
| M2 | Support config | Verified native versions are controlled by config, not scattered hardcoding |
| M3 | Runtime patch | `install.sh` and `session-start` can patch verified native safely |
| M4 | Docs and matrix | README/support matrix clearly separate stable, experimental, unsupported |
| M5 | Release | Version bump, changelog, tests, tag, GitHub Release, release-state verification |

---

## Evidence Snapshot

### 2026-04-30 Current npm latest

Verified with:

```bash
npm view @anthropic-ai/claude-code version dist-tags bin optionalDependencies --json
```

Result:

| Field | Value |
| --- | --- |
| `version` | `2.1.123` |
| `dist-tags.latest` | `2.1.123` |
| `dist-tags.stable` | `2.1.116` |
| `dist-tags.next` | `2.1.124` |
| `bin.claude` | `bin/claude.exe` |
| macOS arm64 package | `@anthropic-ai/claude-code-darwin-arm64@2.1.123` |

### 2026-04-30 macOS arm64 package shape

Verified in temp dir:

```text
/private/tmp/cczh-native-shape.5BKORk
```

Result:

| Check | Result |
| --- | --- |
| package files | `LICENSE.md`, `README.md`, `claude`, `package.json` |
| `file package/claude` | `Mach-O 64-bit executable arm64` |
| `bun-binary-io.js detect package/claude` | `native-bun:/private/tmp/cczh-native-shape.5BKORk/package/claude` |
| temp HOME `./package/claude --version` | `2.1.123 (Claude Code)` |

This confirms `2.1.123` is a valid macOS arm64 native verification candidate. It does not yet prove extract, patch, repack, rollback, or runtime install safety.

### 2026-04-30 macOS arm64 full native verification

Verified with temporary `node-lief` under `/private/tmp/cczh-node-lief`:

```bash
NODE_PATH=/private/tmp/cczh-node-lief/node_modules \
node scripts/verify-upstream-compat.js --baseline 2.1.123 --skip-latest --native-macos-arm64 --json
```

Result:

| Check | Result |
| --- | --- |
| status | `pass` |
| patch count | `1262` |
| sentinel residue | `[]` |
| missing required text | `[]` |
| detect | `native-bun` |
| extract | `ok` |
| repack | `ok` |
| temp HOME `--version` | `2.1.123 (Claude Code)` |

---

## Task 0: Current Evidence Snapshot

**Files:**
- Modify: `docs/plans/2026-04-30-macos-native-experimental-validation.md`
- Optional create: `docs/native-verification-notes.md`

**Step 1: Confirm current latest metadata**

Run:

```bash
npm view @anthropic-ai/claude-code version dist-tags bin optionalDependencies --json
```

Expected:

- `latest` is a numeric version.
- `bin.claude` points to `bin/claude.exe`.
- platform packages include `@anthropic-ai/claude-code-darwin-arm64`.

If network is unavailable, record that this step is blocked and do not infer current latest from memory.

**Step 2: Confirm macOS arm64 platform package shape**

Run in a temp dir:

```bash
tmp="$(mktemp -d /tmp/cczh-native-shape.XXXXXX)"
cd "$tmp"
npm pack @anthropic-ai/claude-code-darwin-arm64@2.1.123
tar -xzf anthropic-ai-claude-code-darwin-arm64-2.1.123.tgz
file package/claude
node /Users/changfenhuang/projects/claude-code-zh-cn/bun-binary-io.js detect package/claude
HOME="$tmp/home" XDG_CONFIG_HOME="$tmp/home/.config" XDG_CACHE_HOME="$tmp/home/.cache" XDG_DATA_HOME="$tmp/home/.local/share" ./package/claude --version
```

Expected:

- `file` says Mach-O arm64.
- `detect` prints `native-bun:<path>`.
- `--version` prints `2.1.123 (Claude Code)`.

**Step 3: Record result**

Update this plan's evidence section or `docs/native-verification-notes.md` with:

- date;
- version;
- package name;
- package shape;
- whether detection worked;
- whether temp `--version` worked.

---

## Task 1: Add Native Support Config As A Real Contract

**Files:**
- Modify: `scripts/upstream-compat.config.json`
- Create: `plugin/support-window.json`
- Create: `scripts/generate-plugin-support-window.js`
- Modify: `scripts/preflight.sh`
- Test: `tests/support-window-generation.test.js`

**Step 1: Write failing generation test**

Create `tests/support-window-generation.test.js`.

Test intent:

- `plugin/support-window.json` is generated from `scripts/upstream-compat.config.json`.
- It contains only runtime-needed support windows.
- It has no `latest` representative.
- It preserves npm stable ceiling `2.1.112`.
- It may contain explicit macOS native experimental versions above `2.1.112`.

Expected test shape:

```js
test("plugin support window is generated from compat config", () => {
  const generated = execFileSync("node", ["scripts/generate-plugin-support-window.js"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const parsed = JSON.parse(generated);

  assert.equal(parsed.legacyNpmStable.ceiling, "2.1.112");
  assert.deepEqual(parsed.macosNativeExperimental.versions, ["2.1.123"]);
  assert.equal(parsed.macosNativeExperimental.platform, "darwin-arm64");
  assert.ok(!JSON.stringify(parsed).includes("latest"));
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/support-window-generation.test.js
```

Expected: FAIL because the generator does not exist.

**Step 3: Add config entry**

In `scripts/upstream-compat.config.json`, add:

```json
"macosNativeExperimental": {
  "platform": "darwin-arm64",
  "packageName": "@anthropic-ai/claude-code-darwin-arm64",
  "floor": "2.1.123",
  "ceiling": "2.1.123",
  "representatives": ["2.1.123"],
  "verification": "pending",
  "requires": ["node-lief"],
  "notes": "macOS arm64 native binary experimental；只对明确验证版本开放，不代表 latest stable。"
}
```

**Step 4: Implement generator**

Create `scripts/generate-plugin-support-window.js`.

It should output:

```json
{
  "legacyNpmStable": {
    "floor": "2.1.92",
    "ceiling": "2.1.112",
    "versions": ["2.1.92", "2.1.97", "2.1.104", "2.1.107", "2.1.110", "2.1.112"]
  },
  "macosNativeOfficialInstallerExperimental": {
    "floor": "2.1.110",
    "ceiling": "2.1.112",
    "versions": ["2.1.110", "2.1.111", "2.1.112"],
    "platform": "darwin-arm64"
  },
  "macosNativeExperimental": {
    "floor": "2.1.123",
    "ceiling": "2.1.123",
    "versions": ["2.1.123"],
    "platform": "darwin-arm64",
    "packageName": "@anthropic-ai/claude-code-darwin-arm64",
    "requires": ["node-lief"]
  }
}
```

**Step 5: Generate runtime file**

Run:

```bash
node scripts/generate-plugin-support-window.js > plugin/support-window.json
```

Expected: valid JSON.

**Step 6: Add preflight drift check**

In `scripts/preflight.sh`, add:

```bash
step "Check plugin support window drift"
run node scripts/generate-plugin-support-window.js
run git diff --exit-code plugin/support-window.json
```

If the project avoids shell redirection in preflight, implement a `--write` flag in the generator and run:

```bash
node scripts/generate-plugin-support-window.js --write
git diff --exit-code plugin/support-window.json
```

**Step 7: Run tests**

Run:

```bash
node --test tests/support-window-generation.test.js
```

Expected: PASS.

---

## Task 2: Strengthen Support Boundary Guard

**Files:**
- Modify: `scripts/check-support-boundary.js`
- Test: `tests/support-boundary-guard.test.js`

**Step 1: Write failing tests**

Add tests for:

- native experimental versions above `2.1.112` are allowed only under macOS native experimental config;
- `latest` cannot appear in any support representative list;
- npm stable ceiling cannot exceed `2.1.112`;
- Windows native must remain unsupported;
- README cannot say `2.1.113+` or `latest` is stable.

**Step 2: Run tests**

Run:

```bash
node --test tests/support-boundary-guard.test.js
```

Expected: FAIL until guard is updated.

**Step 3: Implement guard rules**

In `scripts/check-support-boundary.js`:

- Keep `STABLE_CEILING = "2.1.112"` for `support.npm.stable`.
- Reject `latest`, `stable`, `next`, or any non-semver in representative arrays.
- Allow semver above `2.1.112` only if path contains `macosNativeExperimental`.
- Reject support text that says native latest is `stable`.
- Allow text that says native latest is `experimental` only if it says explicit verified versions.

**Step 4: Run tests**

Run:

```bash
node --test tests/support-boundary-guard.test.js
node scripts/check-support-boundary.js
```

Expected: PASS.

---

## Task 3: Add Native Package Shape Detection To Compat Script

**Files:**
- Modify: `scripts/verify-upstream-compat.js`
- Test: `tests/upstream-compat.test.js`
- Add fixtures under: `tests/upstream-compat-fixtures/packages/`

**Step 1: Write failing fixture test**

Add a fixture package representing native shape:

```text
tests/upstream-compat-fixtures/packages/2.1.123-native-fixture/package/package.json
tests/upstream-compat-fixtures/packages/2.1.123-native-fixture/package/claude
```

Expected test:

```js
test("verify-upstream-compat classifies native package shape", () => {
  const result = runCompat(["--baseline", "2.1.123-native-fixture", "--skip-latest", "--json"]);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.results[0].kind, "native");
  assert.equal(parsed.results[0].status, "skip");
  assert.match(parsed.results[0].skipReason, /native verification not enabled/);
});
```

**Step 2: Run test**

Run:

```bash
node --test tests/upstream-compat.test.js
```

Expected: FAIL because native package shape is not handled.

**Step 3: Implement package shape branch**

In `scripts/verify-upstream-compat.js`:

- If unpacked package has `package/cli.js`, use the existing legacy path.
- If unpacked package has `package/claude`, classify as `native`.
- If unpacked package has `package/bin/claude.exe`, classify as `native-wrapper`.
- Add `kind` to JSON results:
  - `legacy`
  - `native`
  - `native-wrapper`
- Native packages should skip unless native verification mode is explicitly enabled.

**Step 4: Run test**

Run:

```bash
node --test tests/upstream-compat.test.js
```

Expected: PASS.

---

## Task 4: Add Real macOS Native Verification Mode

**Files:**
- Modify: `scripts/verify-upstream-compat.js`
- Modify: `bun-binary-io.js` only if version/extract behavior needs a small fix
- Modify: `plugin/bun-binary-io.js` only after top-level helper changes are proven
- Test: `tests/upstream-compat.test.js`

**Step 1: Write failing flag tests**

Add tests for:

- `--native-macos-arm64` is accepted.
- On non-macOS arm64, native verification result is `skip`, not fail.
- If `node-lief` is missing, native verification result is `skip` or `error` with dependency reason, not pass.

**Step 2: Run tests**

Run:

```bash
node --test tests/upstream-compat.test.js
```

Expected: FAIL until option parsing and result shape exist.

**Step 3: Implement native verification path**

For each version in `support.macosNativeExperimental.representatives`:

1. Create temp dir.
2. Run `npm pack @anthropic-ai/claude-code-darwin-arm64@<version>`.
3. Unpack the tarball.
4. Confirm `package/claude` exists.
5. Run:

```bash
node bun-binary-io.js detect package/claude
```

Expected: `native-bun:<path>`.

6. Run:

```bash
node bun-binary-io.js check-deps
```

Expected: `ok`, otherwise report dependency skip.

7. Extract embedded JS:

```bash
node bun-binary-io.js extract package/claude extracted.js
```

8. Patch extracted JS:

```bash
bash patch-cli.sh extracted.js
```

Expected: patch count greater than `0`.

9. Run sentinel and upstream text guards against `extracted.js`.

10. Copy `package/claude` to a temp patch target and repack:

```bash
cp package/claude claude-patched
node bun-binary-io.js repack claude-patched extracted.js
```

11. Run patched temp binary:

```bash
HOME="$tmp/home" \
XDG_CONFIG_HOME="$tmp/home/.config" \
XDG_CACHE_HOME="$tmp/home/.cache" \
XDG_DATA_HOME="$tmp/home/.local/share" \
"$tmp/claude-patched" --version
```

Expected: `<version> (Claude Code)`.

**Step 4: Output structured JSON**

Native result should include:

```json
{
  "version": "2.1.123",
  "kind": "native",
  "status": "pass",
  "patchCount": 1231,
  "residue": [],
  "nativeVerification": {
    "packageName": "@anthropic-ai/claude-code-darwin-arm64",
    "platform": "darwin-arm64",
    "detect": "native-bun",
    "extract": "ok",
    "repack": "ok",
    "versionOutput": "2.1.123 (Claude Code)"
  }
}
```

**Step 5: Run real verification**

Run:

```bash
node scripts/verify-upstream-compat.js --baseline 2.1.123 --skip-latest --native-macos-arm64 --json
```

Expected with `node-lief`: PASS for `2.1.123`.

Expected without `node-lief`: clear dependency skip/error.

Do not proceed to runtime patching until this step has a clear result.

---

## Task 5: Improve Native Version And Binary Identity

**Files:**
- Modify: `bun-binary-io.js`
- Modify: `plugin/bun-binary-io.js`
- Test: `tests/bun-binary-io.test.js`

**Step 1: Write failing tests**

Add tests for:

- `version` falls back to parsing `--version` output when embedded metadata is empty.
- `hash <binary>` returns a stable SHA-256 for marker use.
- `detect` continues to ignore ELF unless Linux native support is explicitly added later.

Expected helper commands:

```bash
node bun-binary-io.js version <binary>
node bun-binary-io.js hash <binary>
```

**Step 2: Run tests**

Run:

```bash
node --test tests/bun-binary-io.test.js
```

Expected: FAIL until helper supports hash/fallback behavior.

**Step 3: Implement helper updates**

In `bun-binary-io.js`:

- Add `hash <binary>` command using SHA-256.
- Keep current metadata-based `version` first.
- If metadata version is empty, optionally support `version-run <binary>` for install/hook wrappers, instead of making helper itself run arbitrary binaries by default.

Recommended split:

- `version`: read embedded/static metadata only.
- `hash`: compute file hash.
- shell scripts keep their existing safe temp-HOME `--version` fallback.

This avoids surprising helper behavior.

**Step 4: Sync plugin helper**

Copy equivalent helper changes to `plugin/bun-binary-io.js`.

**Step 5: Run tests**

Run:

```bash
node --test tests/bun-binary-io.test.js
node --check bun-binary-io.js plugin/bun-binary-io.js
```

Expected: PASS.

---

## Task 6: Productize Runtime Native Patch Safely

**Files:**
- Modify: `install.sh`
- Modify: `plugin/hooks/session-start`
- Modify: `plugin/support-window.json`
- Test: `tests/install-smoke.test.js`
- Test: `tests/session-start-hook.test.js`

**Step 1: Write failing install tests**

Add install smoke tests for:

- verified macOS native version patches only when support config allows it;
- unsupported native `2.1.124` skips;
- missing `node-lief` skips and prints install guidance;
- successful native patch writes marker only after repack succeeds;
- failed repack restores original binary and does not write marker.

**Step 2: Write failing hook tests**

Add session-start tests for:

- verified native version re-patches when patch revision changes;
- same version and same hash does not re-patch;
- upgraded native binary does not restore old backup over new binary;
- hook output remains valid JSON even when native patch is skipped;
- unsupported native version does not call extract/repack.

**Step 3: Run tests**

Run:

```bash
node --test tests/install-smoke.test.js tests/session-start-hook.test.js
```

Expected: FAIL until runtime logic is updated.

**Step 4: Load support config**

In both `install.sh` and `plugin/hooks/session-start`, add functions:

```bash
support_window_file="$PLUGIN_SRC/support-window.json"
```

For installed hook:

```bash
support_window_file="$PLUGIN_ROOT/support-window.json"
```

Read allowed native versions using `node -e` from JSON.

**Step 5: Detect native support eligibility**

A native binary is eligible only if all are true:

- platform is `Darwin`;
- arch is `arm64`;
- version is in `macosNativeExperimental.versions` or `macosNativeOfficialInstallerExperimental.versions`;
- `node bun-binary-io.js check-deps` returns `ok`;
- binary detection returns `native-bun`.

**Step 6: Strengthen marker**

For native, use:

```text
native|<version>|<binaryHash>|<patchRevision>
```

For legacy npm, keep current marker format unless a test proves migration is needed.

**Step 7: Backup and rollback behavior**

Use:

```text
<binary>.zh-cn-backup.<version>.<hash>
```

Runtime flow:

1. Compute original hash.
2. Find matching clean backup.
3. If no matching clean backup, create one.
4. Extract from clean base.
5. Patch extracted JS.
6. Repack temp binary, not the live binary.
7. Run temp binary `--version` with isolated HOME.
8. Replace live binary only after temp validation passes.
9. Write marker only after replace succeeds.
10. On failure, restore original binary and leave marker unchanged.

**Step 8: Run tests**

Run:

```bash
node --test tests/install-smoke.test.js tests/session-start-hook.test.js
```

Expected: PASS.

---

## Task 7: Generate Support Matrix With Native Rows

**Files:**
- Modify: `scripts/generate-support-matrix.js`
- Modify: `docs/support-matrix.md`
- Test: `tests/support-matrix-generation.test.js`

**Step 1: Write failing test**

Add a test that generated matrix includes:

```text
macOS native binary | experimental | 2.1.123 - 2.1.123
```

And still includes:

```text
npm global install | stable | 2.1.92 - 2.1.112
Windows / native .exe / latest | unsupported
```

**Step 2: Run test**

Run:

```bash
node --test tests/support-matrix-generation.test.js
```

Expected: FAIL until generator is updated.

**Step 3: Update generator**

Add row for `support.macosNativeExperimental`.

Make notes say:

```text
macOS arm64 native binary experimental；需要 node-lief；只对明确验证版本开放，不代表 latest stable。
```

**Step 4: Regenerate matrix**

Run:

```bash
node scripts/generate-support-matrix.js
git diff -- docs/support-matrix.md
```

Expected: matrix shows native experimental separately.

---

## Task 8: Update README Product Direction

**Files:**
- Modify: `README.md`

**Step 1: Update 30-second decision table**

State:

```text
最稳：npm pinned 2.1.112。
新方向：macOS arm64 native experimental，按已验证版本开放。
不要做：把 latest 当 stable 承诺。
```

**Step 2: Update install choices**

Add a macOS native experimental row:

```text
Claude Code native binary 2.1.123 on macOS arm64: experimental, requires node-lief.
```

**Step 3: Keep unsupported wording**

README must still say:

```text
Windows / Linux native 暂不支持完整 CLI Patch。
未验证 latest 会跳过 CLI Patch，只启用设置、Hook、插件层能力。
```

**Step 4: Run guard**

Run:

```bash
node scripts/check-support-boundary.js
```

Expected: PASS.

---

## Task 9: Full Verification

**Files:**
- No new files expected

**Step 1: Syntax checks**

Run:

```bash
bash -n install.sh uninstall.sh plugin/hooks/session-start plugin/bin/claude-launcher scripts/preflight.sh
node --check patch-cli.js plugin/patch-cli.js scripts/check-support-boundary.js scripts/generate-support-matrix.js scripts/generate-plugin-support-window.js scripts/verify-upstream-compat.js bun-binary-io.js plugin/bun-binary-io.js
```

Expected: all exit 0.

**Step 2: Unit tests**

Run:

```bash
node --test tests/*.test.js
```

Expected: all pass.

**Step 3: Legacy compat**

Run:

```bash
node scripts/verify-upstream-compat.js
```

Expected: all legacy representatives pass through `2.1.112`.

**Step 4: Native compat**

Run on macOS arm64 with `node-lief` available:

```bash
node scripts/verify-upstream-compat.js --baseline 2.1.123 --skip-latest --native-macos-arm64 --json
```

Expected:

- `kind: "native"`;
- `status: "pass"`;
- patch count greater than `0`;
- no sentinel residue;
- repack ok;
- temp `--version` works.

**Step 5: Generated file drift**

Run:

```bash
node scripts/generate-plugin-support-window.js --write
node scripts/generate-support-matrix.js
git diff --exit-code plugin/support-window.json docs/support-matrix.md
```

Expected: no drift.

**Step 6: Preflight**

Run:

```bash
bash scripts/preflight.sh
```

Expected: PASS.

---

## Task 10: Release Preparation

**Files:**
- Modify: `plugin/manifest.json`
- Modify: `CHANGELOG.md`

**Step 1: Bump version**

Choose next semver based on current manifest.

Because this introduces a new experimental support lane, prefer minor version bump if current project convention allows it.

**Step 2: Update changelog**

Add sections:

```markdown
## vX.Y.Z

### 新增
- 新增 macOS arm64 native binary experimental 验证链。
- 新增 native 支持窗口配置，避免把未验证 latest 误写成支持。

### 改进
- support matrix 区分 legacy stable、native experimental、unsupported。
- install/session-start 对 unsupported native 版本安全跳过。

### 修复
- 防止升级 native binary 后旧 backup 覆盖新版本。
```

**Step 3: Release verification**

Run:

```bash
node --test tests/*.test.js
node scripts/verify-upstream-compat.js
node scripts/verify-upstream-compat.js --baseline 2.1.123 --skip-latest --native-macos-arm64 --json
node scripts/verify-release-state.js
```

Expected: all pass or release-state clearly reports pre-release missing items.

---

## Release Readiness Criteria

Do not release or claim native experimental support until all are true:

- Legacy stable window still passes: `2.1.92 - 2.1.112`.
- Native macOS arm64 verification passes for `2.1.123`.
- `plugin/support-window.json` is generated and checked for drift.
- Install/runtime logic reads support windows instead of hardcoding scattered versions.
- Missing `node-lief` skips safely.
- Repack failure rolls back safely.
- Unsupported native versions do not write success markers.
- `README.md` says native is experimental, not stable latest.
- `docs/support-matrix.md` clearly separates stable, experimental, unsupported.
- `node scripts/check-support-boundary.js` passes.
- Full tests pass.

---

## Work Estimate

| Part | Estimate |
| --- | --- |
| Evidence refresh and real `2.1.123` native verification | 0.5 day |
| Config, guard, generated runtime support window | 0.5-1 day |
| Native verifier in compat script | 1 day |
| Runtime install/session-start safety work | 1-2 days |
| Matrix, README, changelog, release verification | 0.5-1 day |

Expected total for macOS arm64 experimental: **3-5 days**.

If `2.1.123` extract/repack fails in a new way, add **1-2 days** for binary helper work.

Linux/Windows native support is a separate project after this, not part of this estimate.

---

## Recommended Commit Split

1. `test: cover native support boundaries`
2. `feat: generate plugin support window`
3. `feat: verify macos native claude binaries`
4. `feat: gate native runtime patching by verified versions`
5. `docs: document native experimental support`
6. `chore: release vX.Y.Z`

---

## First Implementation Command Sequence

Start with read-only and temp-safe checks:

```bash
git status --short --branch
npm view @anthropic-ai/claude-code version dist-tags bin optionalDependencies --json
```

Then execute Task 0 and Task 1 before touching runtime patch behavior.
