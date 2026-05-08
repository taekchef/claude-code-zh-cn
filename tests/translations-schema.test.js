const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

test("cli-translations.json entries have valid en/zh string keys", () => {
  const translations = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "cli-translations.json"), "utf8")
  );

  assert.equal(Array.isArray(translations), true, "translations file should contain an array");

  for (let i = 0; i < translations.length; i += 1) {
    const entry = translations[i];
    assert.equal(typeof entry, "object", `entry ${i} should be an object`);
    assert.equal(entry !== null, true, `entry ${i} should not be null`);
    assert.equal("en" in entry, true, `entry ${i} missing "en" key`);
    assert.equal("zh" in entry, true, `entry ${i} missing "zh" key`);
    assert.equal(typeof entry.en, "string", `entry ${i} "en" should be string`);
    assert.equal(typeof entry.zh, "string", `entry ${i} "zh" should be string`);
    if ("skipPatch" in entry) {
      assert.ok(
        entry.skipPatch === true || entry.skipPatch === "model-prompt-contract",
        `entry ${i} "skipPatch" should be true or "model-prompt-contract"`
      );
    }
  }
});
