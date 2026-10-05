"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

test("install.sh auto-installs node-lief with offline tgz fallback and degrades softly", () => {
  const script = fs.readFileSync(path.join(repoRoot, "install.sh"), "utf8");
  assert.match(script, /ensure_node_lief/);
  assert.match(script, /npm install -g node-lief@1\.3\.2/);
  assert.match(script, /ZH_CN_NODE_LIEF_TGZ/);
  assert.match(script, /deps\/node-lief-\*\.tgz/);
  assert.match(script, /bun-binary-io\.js" check-deps 2>\/dev\/null/);
  // 缺依赖是降级而非失败：不能出现因 node-lief 缺失直接退出安装的路径
  assert.doesNotMatch(script, /ensure_node_lief[\s\S]{0,400}?exit 1/);
});

test("install.ps1 auto-installs node-lief in the native-bun patch path", () => {
  const script = fs.readFileSync(path.join(repoRoot, "install.ps1"), "utf8");
  assert.match(script, /function ensure-node-lief/);
  assert.match(script, /ensure-node-lief\s*\r?\n\s*patch-native-bun/);
  assert.match(script, /npm install -g node-lief@1\.3\.2/);
  assert.match(script, /\$env:ZH_CN_NODE_LIEF_TGZ/);
  assert.match(script, /"deps\\node-lief-\*\.tgz"/);
});

test("plugin copy of install-json-helper resolves build-overlay relative to its own layout", () => {
  const pluginCopy = fs.readFileSync(
    path.join(repoRoot, "plugin", "scripts", "install-json-helper.js"),
    "utf8"
  );
  assert.match(pluginCopy, /require\("\.\/build-overlay\.js"\)/);
  assert.doesNotMatch(pluginCopy, /require\("\.\.\/plugin\/scripts\/build-overlay\.js"\)/);
  const rootCopy = fs.readFileSync(path.join(repoRoot, "scripts", "install-json-helper.js"), "utf8");
  assert.match(rootCopy, /require\("\.\.\/plugin\/scripts\/build-overlay\.js"\)/);
});
