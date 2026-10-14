"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { rewriteMacDisplaySource, rewriteWin289DisplaySource, patchStringPool } = require("../scripts/patch-bytecode.js");
const translations = require("../cli-translations.json");

// Predicates independently extracted from official darwin-arm64 2.1.296
// chunk-sfn1dbxq.js (dde / plugin error handler) and 2.1.299
// chunk-4xx9trad.js (ime / plugin error handler). Inputs live outside the
// rewritten source: translating both producer and consumer hides this bug.
const source = `
function longContext(e){return e.includes("Extra usage is required for long context")||e.includes("Usage credits are required for long context")}
function aborted(e){return e.message === "Request was aborted."}
function pluginPermission(e){return e.includes("Permission denied")||e.includes("EACCES")||e.includes("EPERM")}
function sshPermission(e){return e.includes("Permission denied (publickey")||e.includes("Host key verification failed")}
const display="Sign in with your Anthropic account",usageLabel="Usage credits";
({longContext,pluginPermission,sshPermission,aborted,display,usageLabel});`;
function verify(patched) {
  const result = vm.runInNewContext(patched);
  assert.equal(result.aborted({message: "Request was aborted."}), true);
  assert.equal(result.aborted({message: "request failed"}), false);
  assert.equal(result.longContext('429 {"error":{"message":"Usage credits are required for long context requests."}}'), true);
  assert.equal(result.longContext("Extra usage is required for long context requests."), true);
  assert.equal(result.longContext("ordinary rate limit"), false);
  assert.equal(result.pluginPermission("/bin/sh: ./hook.sh: Permission denied"), true);
  assert.equal(result.pluginPermission("EACCES: open hook.sh"), true);
  assert.equal(result.pluginPermission("EPERM: operation not permitted"), true);
  assert.equal(result.pluginPermission("network unavailable"), false);
  assert.equal(result.sshPermission("git@github.com: Permission denied (publickey)."), true);
  assert.equal(result.display, translations.find(t => t.en === "Sign in with your Anthropic account").zh);
  assert.equal(result.usageLabel, "使用额度");
}
test("macOS source predicates still recognize independent external English errors", () => {
  verify(rewriteMacDisplaySource(source, "help", translations).source);
});
test("npm source predicates survive substring translations and repeated patching", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-errors-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "cli.js");
  fs.writeFileSync(file, source);
  for (let i = 0; i < 2; i++) {
    execFileSync(process.execPath, [path.join(__dirname, "../patch-cli.js"), file, path.join(__dirname, "../cli-translations.json"), "--log", path.join(dir, "patch.log")]);
    verify(fs.readFileSync(file, "utf8"));
  }
});
test("bytecode error sentinels remain byte-identical in narrow and wide pools", () => {
  for (const en of ["Request was aborted.", "Permission denied", "Usage credits are required for long context"]) {
    for (const wide of [false, true]) {
      const header = Buffer.alloc(8);
      header.writeUInt32LE((en.length | (wide ? 0 : 0x80000000)) >>> 0);
      const pool = Buffer.concat([header, Buffer.from(en, wide ? "utf16le" : "latin1")]);
      const before = Buffer.from(pool);
      assert.equal(patchStringPool(pool, translations).patched, 0);
      assert.deepEqual(pool, before);
    }
  }
});
test("npm guards escaped sentinels in single, double and template literals", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-error-escapes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "cli.js"), predicates = [];
  for (const quote of ['"', "'", "`"])
    for (const space of [" ", "\\u0020", "\\x20", "\\u{20}", " \\\n"])
      for (const sentinel of ["Request was aborted.", "Permission denied", "Usage credits are required for long context", "Extra usage is required for long context"]) {
        const encoded = sentinel.replace(/ (\S+)$/, (_, last) => space + last);
        predicates.push({ code: `(e)=>e.includes(${quote}${encoded}${quote})`, input: sentinel });
      }
  fs.writeFileSync(file, `[${predicates.map(p => p.code).join(",")}];`);
  execFileSync(process.execPath, [path.join(__dirname, "../patch-cli.js"), file, path.join(__dirname, "../cli-translations.json"), "--log", path.join(dir, "patch.log")]);
  const functions = vm.runInNewContext(fs.readFileSync(file, "utf8"));
  predicates.forEach((predicate, i) => assert.equal(functions[i](predicate.input), true, predicate.code));
});

test("Windows source fallback preserves external error predicates", () => {
  const indicators = ["manual mode", "plan mode", "accept edits", "bypass permissions", "don't ask", "auto mode"];
  const prefix = `const modes=[${indicators.map(indicator => `{indicator:${JSON.stringify(indicator)}}`).join(",")}];`;
  verify(rewriteWin289DisplaySource(prefix + source, "chunk-wyssf6qs.js", translations).source);
});
