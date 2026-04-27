const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const scriptPath = path.join(repoRoot, "scripts", "verify-settings-sources.js");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function createFixtureRoot(settingsOverlay) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-settings-sources-"));

  writeJson(path.join(root, "settings-overlay.json"), settingsOverlay);
  writeJson(path.join(root, "verbs", "zh-CN.json"), {
    mode: "replace",
    verbs: ["思考中"],
  });
  writeJson(path.join(root, "tips", "zh-CN.json"), {
    tips: [{ id: "hello", text: "你好" }],
  });

  return root;
}

test("settings data source check passes for the current repo", () => {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /settings data sources OK/);
});

test("settings data source check rejects duplicated spinner data in settings-overlay", () => {
  const fixtureRoot = createFixtureRoot({
    language: "Chinese",
    spinnerTipsEnabled: true,
    spinnerVerbs: ["思考中"],
    spinnerTipsOverride: { excludeDefault: true, tips: ["你好"] },
  });

  const result = spawnSync(process.execPath, [scriptPath, "--root", fixtureRoot], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.notEqual(result.status, 0, "script should fail when settings-overlay duplicates spinner data");
  assert.match(result.stderr, /settings-overlay\.json must not contain spinnerVerbs/);
  assert.match(result.stderr, /settings-overlay\.json must not contain spinnerTipsOverride/);
});
