const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const generator = path.join(repoRoot, "scripts", "generate-plugin-support-window.js");

function generate(args = []) {
  return execFileSync("node", [generator, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("plugin support window is generated from compat config", () => {
  const generated = generate();
  const parsed = JSON.parse(generated);

  assert.equal(parsed.legacyNpmStable.ceiling, "2.1.112");
  assert.deepEqual(parsed.legacyNpmStable.versions, [
    "2.1.92",
    "2.1.97",
    "2.1.104",
    "2.1.107",
    "2.1.110",
    "2.1.112",
  ]);
  assert.deepEqual(parsed.macosNativeExperimental.versions, [
    "2.1.113",
    "2.1.114",
    "2.1.116",
    "2.1.117",
    "2.1.118",
    "2.1.119",
    "2.1.120",
    "2.1.121",
    "2.1.122",
    "2.1.123",
    "2.1.124",
    "2.1.126",
    "2.1.128",
    "2.1.129",
    "2.1.131",
    "2.1.132",
    "2.1.133",
    "2.1.136",
    "2.1.137",
    "2.1.138",
    "2.1.139",
  ]);
  assert.deepEqual(parsed.macosNativeExperimental.excluded, [
    "2.1.115",
    "2.1.125",
    "2.1.127",
    "2.1.130",
    "2.1.134",
    "2.1.135",
  ]);
  assert.equal(parsed.macosNativeExperimental.platform, "darwin-arm64");
  assert.equal(parsed.macosNativeExperimental.packageName, "@anthropic-ai/claude-code-darwin-arm64");
  assert.ok(!JSON.stringify(parsed).includes("latest"));
});

test("checked-in plugin support window has no generator drift", () => {
  const generated = generate();
  const checkedIn = fs.readFileSync(path.join(repoRoot, "plugin", "support-window.json"), "utf8");

  assert.equal(checkedIn, generated);
});
