const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const generator = path.join(repoRoot, "scripts", "generate-plugin-support-window.js");
const compatConfig = require(path.join(repoRoot, "scripts", "upstream-compat.config.json"));

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
  assert.deepEqual(
    parsed.macosNativeExperimental.versions,
    compatConfig.support.macosNativeExperimental.representatives
  );
  assert.deepEqual(parsed.macosNativeExperimental.excluded, compatConfig.support.macosNativeExperimental.excluded);
  assert.equal(parsed.macosNativeExperimental.platform, "darwin-arm64");
  assert.equal(parsed.macosNativeExperimental.packageName, "@anthropic-ai/claude-code-darwin-arm64");
  assert.ok(!JSON.stringify(parsed).includes("latest"));
});

test("checked-in plugin support window has no generator drift", () => {
  const generated = generate();
  const checkedIn = fs.readFileSync(path.join(repoRoot, "plugin", "support-window.json"), "utf8");

  assert.equal(checkedIn, generated);
});

test("native support includes issue 80 reporter version", () => {
  const generated = JSON.parse(generate());

  assert.equal(generated.macosNativeExperimental.ceiling, "2.1.152");
  assert.ok(generated.macosNativeExperimental.versions.includes("2.1.152"));
  assert.equal(generated.windowsNativeExperimental.ceiling, "2.1.152");
  assert.ok(generated.windowsNativeExperimental.versions.includes("2.1.152"));
});
