"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const native = require("../scripts/native-repair.js");
const installer = require("../scripts/install-json-helper.js");

test("installer and native repair share one patch revision implementation", () => {
  assert.equal(installer.patchRevision(root), native.revision(root));
  assert.match(native.revision(root), /^[a-f0-9]{16}$/);
});

test("Windows SessionStart delegates revision to native repair", () => {
  const hook = fs.readFileSync(path.join(root, "plugin", "hooks", "session-start.ps1"), "utf8");
  assert.match(hook, /native-repair\.js["']\)\)\.revision\(\)/);
});

test("doctor exposes its existing and additional Layer 4 fields", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "zh-cn-doctor.js"), "utf8");
  assert.match(source, /require\("\.\/native-repair\.js"\)\.revision\(root\)/);
  assert.match(source, /layer4State/);
  assert.match(source, /languageMode/);
});
