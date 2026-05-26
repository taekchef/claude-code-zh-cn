# Windows Native Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Support Windows native/Bun Claude Code binaries in the same release pipeline as macOS native, with verified CLI Patch coverage for current native versions.

**Architecture:** Extend the existing Bun binary helper from Mach-O-only extraction/repack to format-dispatched native operations. Keep the patch engine unchanged: extract the embedded Claude JS, run the existing translation patch, rebuild Bun data, then write it back through LIEF for PE on Windows and Mach-O on macOS. Promote Windows native support only through numeric verified windows and CI-backed compatibility audits, never as an unbounded `latest` promise.

**Tech Stack:** Node.js, node-lief, PowerShell `install.ps1`, GitHub Actions Windows runners, existing `verify-upstream-compat.js` and support-matrix generators.

---

### Task 1: Add PE Extraction/Repack Tests

**Files:**
- Modify: `tests/bun-binary-io.test.js`
- Modify: `bun-binary-io.js`
- Mirror later: `plugin/bun-binary-io.js`

**Step 1: Write failing tests**

Add tests that assert:
- `detect` still returns `native-bun:<path>` for fake PE binaries with the Bun trailer.
- `bun-binary-io.js` contains a PE extraction path instead of calling `extractFromMachO` unconditionally.
- `repack` dispatches on parsed binary format and no longer errors with "only Mach-O".

**Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/bun-binary-io.test.js
```

Expected: new PE implementation-shape tests fail.

**Step 3: Implement format-dispatched native helper**

In `bun-binary-io.js`:
- Add `extractFromPE(LIEF, binaryPath)` using `LIEF.parse(binaryPath)` and PE section lookup.
- Find the Bun section by scanning PE sections for content that `extractBunDataFromSection` can parse.
- Add `extractNativeBun(LIEF, binaryPath)` returning `{ format, binary, bunData, bunOffsets, sectionHeaderSize, moduleStructSize, section }`.
- Update `cmdExtract`, `cmdRepack`, and `cmdVersion` to use native format dispatch instead of Mach-O-only helpers.
- Add `repackPE(LIEF, peBinary, binPath, newBunBuffer, outputPath, sectionHeaderSize, section)` that updates the PE section content and writes atomically. Do not add signing logic for PE in this task.

**Step 4: Run tests**

Run:

```bash
node --test tests/bun-binary-io.test.js
```

Expected: all tests pass.

**Step 5: Sync plugin payload**

Run:

```bash
bash scripts/sync-payload.sh
```

Expected: `plugin/bun-binary-io.js` matches source.

### Task 2: Enable Windows Native Install Path

**Files:**
- Modify: `install.ps1`
- Modify: `tests/install-smoke.test.js`
- Modify: `scripts/zh-cn-doctor.js`
- Mirror later: `plugin/scripts/zh-cn-doctor.js`

**Step 1: Write failing tests**

Update Windows install smoke tests to expect Windows native support:
- The prior "skips Windows native exe" test should become "patches supported Windows native exe".
- Unsupported native versions should still skip safely.
- The user-facing message must say Windows native patch is experimental and version-gated.

Add doctor tests that classify Windows native supported versions as `needed`, `needs-deps`, or `ok` instead of always unsupported.

**Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/install-smoke.test.js tests/doctor.test.js
```

Expected: tests fail under current skip-only Windows behavior.

**Step 3: Implement PowerShell native patch**

In `install.ps1`:
- For `native-bun`, query `plugin/bun-binary-io.js version`.
- Check version against the Windows native support window from `plugin/support-window.json`.
- Check `node-lief` dependency using `check-deps`.
- Extract embedded JS to a temp file, run `plugin/patch-cli.sh` or `plugin/patch-cli.js`, repack the `.exe`, and write `.patched-version` / `.patched-target` / `.patched-kind`.
- Preserve current safe skip behavior for unsupported versions and missing dependencies.

In `scripts/zh-cn-doctor.js`:
- Report Windows native supported versions as patchable, not categorically unsupported.
- Recommend installing `node-lief` or rerunning `install.ps1` when needed.

**Step 4: Run tests**

Run:

```bash
node --test tests/install-smoke.test.js tests/doctor.test.js
```

Expected: all tests pass; Windows-only integration tests still skip on non-Windows.

**Step 5: Sync plugin payload**

Run:

```bash
bash scripts/sync-payload.sh
```

Expected: plugin mirrors updated doctor and native helper.

### Task 3: Extend Compatibility Matrix To Windows Native

**Files:**
- Modify: `scripts/upstream-compat.config.json`
- Modify: `scripts/verify-upstream-compat.js`
- Modify: `scripts/generate-support-matrix.js`
- Modify: `scripts/sync-readme-support-window.js`
- Modify: `tests/upstream-compat.test.js`
- Modify: `tests/support-boundary-guard.test.js`
- Modify: `tests/support-matrix-generation.test.js`
- Modify: `tests/readme-support-window-sync.test.js`

**Step 1: Write failing tests**

Add tests that assert:
- Windows native has a numeric verified support window.
- The support-boundary guard allows Windows native experimental wording with numeric versions.
- It still rejects "latest is supported" wording.
- Generated README and support matrix list Windows native as experimental once representatives exist.

**Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/upstream-compat.test.js tests/support-boundary-guard.test.js tests/support-matrix-generation.test.js tests/readme-support-window-sync.test.js
```

Expected: tests fail because Windows native is still configured unsupported.

**Step 3: Implement Windows native config support**

Update config and generators:
- Add `windowsNativeBinary.experimental` with verified representatives.
- Start with the same published native versions as macOS where Windows packages exist.
- Keep unsupported gaps explicit.
- Preserve "future latest is not automatically supported" language.

Update `verify-upstream-compat.js`:
- Add a `--native-windows-x64` flag or equivalent native platform selector.
- Resolve `@anthropic-ai/claude-code-win32-x64`.
- Run PE extract / patch / repack checks on Windows runners.
- On non-Windows, skip with a clear message.

**Step 4: Regenerate docs**

Run:

```bash
node scripts/generate-support-matrix.js
node scripts/sync-readme-support-window.js
node scripts/generate-plugin-support-window.js
```

Expected: `docs/support-matrix.md`, `README.md`, and `plugin/support-window.json` update consistently.

**Step 5: Run tests**

Run:

```bash
node --test tests/upstream-compat.test.js tests/support-boundary-guard.test.js tests/support-matrix-generation.test.js tests/readme-support-window-sync.test.js
```

Expected: all pass.

### Task 4: Add Windows Native CI Verification

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/native-latest-candidate.yml`
- Modify: `tests/native-latest-workflow.test.js`
- Modify: `tests/install-smoke.test.js`

**Step 1: Write failing tests**

Add workflow tests that require:
- A Windows native compatibility job on pinned Windows runners.
- `verify-upstream-compat` runs with the Windows native selector.
- The native latest candidate workflow distinguishes macOS and Windows native candidate checks.

**Step 2: Run tests to verify failure**

Run:

```bash
node --test tests/native-latest-workflow.test.js tests/install-smoke.test.js
```

Expected: tests fail because workflows only cover old npm Windows and macOS native verification.

**Step 3: Update workflows**

In CI:
- Add a Windows native compat lane.
- Install `node-lief` on Windows.
- Run `node scripts/verify-upstream-compat.js --native-windows-x64` with a temp npm cache.

In native latest candidate:
- Add Windows candidate package resolution.
- Keep failure handoff explicit when Windows native patch breaks.

**Step 4: Run workflow tests**

Run:

```bash
node --test tests/native-latest-workflow.test.js tests/install-smoke.test.js
```

Expected: all pass.

### Task 5: Full Local Verification And Release Prep

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `plugin/manifest.json`

**Step 1: Run focused tests**

Run:

```bash
node --test tests/bun-binary-io.test.js tests/install-smoke.test.js tests/doctor.test.js tests/upstream-compat.test.js tests/support-boundary-guard.test.js tests/support-matrix-generation.test.js tests/readme-support-window-sync.test.js tests/native-latest-workflow.test.js tests/plugin-payload.test.js tests/payload-source-guard.test.js tests/preflight.test.js
```

Expected: all pass.

**Step 2: Run preflight**

Run:

```bash
bash scripts/preflight.sh --skip-release-state
```

Expected: preflight passes without release-state checks.

**Step 3: Update release metadata**

Update:
- `plugin/manifest.json` version to the next patch version.
- `CHANGELOG.md` with Windows native support, verification, and support-boundary notes.

**Step 4: Commit**

Run:

```bash
git status --short
git add bun-binary-io.js plugin/bun-binary-io.js install.ps1 scripts/zh-cn-doctor.js plugin/scripts/zh-cn-doctor.js scripts/upstream-compat.config.json scripts/verify-upstream-compat.js scripts/generate-support-matrix.js scripts/sync-readme-support-window.js docs/support-matrix.md README.md plugin/support-window.json .github/workflows/ci.yml .github/workflows/native-latest-candidate.yml tests CHANGELOG.md plugin/manifest.json docs/plans/2026-05-26-windows-native-support.md
git commit -m "feat: support Windows native Claude Code patching"
```

Expected: commit succeeds on `codex/windows-native-support`.
