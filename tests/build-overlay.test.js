const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const modulePath = path.join(repoRoot, "plugin", "scripts", "build-overlay.js");
const { buildOverlay, fillMissingKeys, writeSettings, PLUGIN_KEYS } = require(modulePath);

function makeTmpPluginRoot({ verbs, tips, base }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-overlay-"));
  if (base) {
    fs.writeFileSync(path.join(root, "settings-overlay.json"), JSON.stringify(base) + "\n");
  }
  fs.mkdirSync(path.join(root, "verbs"), { recursive: true });
  fs.writeFileSync(path.join(root, "verbs", "zh-CN.json"), JSON.stringify(verbs) + "\n");
  fs.mkdirSync(path.join(root, "tips"), { recursive: true });
  fs.writeFileSync(path.join(root, "tips", "zh-CN.json"), JSON.stringify(tips) + "\n");
  return root;
}

test("buildOverlay assembles base + verbs + tips from bundled plugin data", () => {
  const root = makeTmpPluginRoot({
    base: { language: "Chinese", spinnerTipsEnabled: true },
    verbs: { mode: "replace", verbs: ["思考中", "加载中"] },
    tips: { tips: [{ id: "a", text: "保持简洁" }, { id: "b", text: "用 Plan 模式" }] },
  });

  const overlay = buildOverlay(root);

  assert.equal(overlay.language, "Chinese");
  assert.equal(overlay.spinnerTipsEnabled, true);
  assert.deepEqual(overlay.spinnerVerbs, ["思考中", "加载中"]);
  assert.deepEqual(overlay.spinnerTipsOverride, {
    excludeDefault: true,
    tips: ["保持简洁", "用 Plan 模式"],
  });

  fs.rmSync(root, { recursive: true, force: true });
});

test("buildOverlay handles legacy verbs-as-array shape", () => {
  const root = makeTmpPluginRoot({
    base: { language: "Chinese", spinnerTipsEnabled: true },
    verbs: ["思考中"], // 旧格式：直接是数组
    tips: { tips: [{ id: "a", text: "保持简洁" }] },
  });

  const overlay = buildOverlay(root);
  assert.deepEqual(overlay.spinnerVerbs, ["思考中"]);

  fs.rmSync(root, { recursive: true, force: true });
});

test("buildOverlay falls back to defaults when base overlay is missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-overlay-nobase-"));
  fs.mkdirSync(path.join(root, "verbs"), { recursive: true });
  fs.writeFileSync(path.join(root, "verbs", "zh-CN.json"), JSON.stringify({ verbs: ["思考中"] }) + "\n");
  fs.mkdirSync(path.join(root, "tips"), { recursive: true });
  fs.writeFileSync(path.join(root, "tips", "zh-CN.json"), JSON.stringify({ tips: [{ id: "a", text: "x" }] }) + "\n");

  const overlay = buildOverlay(root);
  assert.equal(overlay.language, "Chinese");
  assert.equal(overlay.spinnerTipsEnabled, true);

  fs.rmSync(root, { recursive: true, force: true });
});

test("buildOverlay against the real repo plugin payload matches expected counts", () => {
  const overlay = buildOverlay(path.join(repoRoot, "plugin"));
  assert.equal(overlay.language, "Chinese");
  assert.equal(overlay.spinnerTipsEnabled, true);
  assert.ok(Array.isArray(overlay.spinnerVerbs));
  assert.ok(overlay.spinnerVerbs.length >= 100);
  assert.ok(Array.isArray(overlay.spinnerTipsOverride.tips));
  assert.ok(overlay.spinnerTipsOverride.tips.length >= 40);
  assert.equal(overlay.spinnerTipsOverride.excludeDefault, true);
});

test("fillMissingKeys seeds only absent keys and preserves everything else", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-settings-fill-"));
  const settingsFile = path.join(dir, "settings.json");
  fs.writeFileSync(settingsFile, JSON.stringify({ theme: "dark", editor: "vim" }) + "\n");

  const overlay = {
    language: "Chinese",
    spinnerTipsEnabled: true,
    spinnerVerbs: ["思考中"],
    spinnerTipsOverride: { excludeDefault: true, tips: ["x"] },
  };

  const { changed, merged } = fillMissingKeys(settingsFile, overlay);
  assert.equal(changed, true);
  assert.equal(merged.theme, "dark");
  assert.equal(merged.editor, "vim");
  assert.equal(merged.language, "Chinese");
  assert.deepEqual(merged.spinnerVerbs, ["思考中"]);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("fillMissingKeys never overwrites existing spinner config", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-settings-preserve-"));
  const settingsFile = path.join(dir, "settings.json");
  const userVerbs = ["我的自定义动词"];
  fs.writeFileSync(
    settingsFile,
    JSON.stringify({ spinnerVerbs: userVerbs, spinnerTipsOverride: { tips: ["mine"] } }) + "\n"
  );

  const overlay = {
    language: "Chinese",
    spinnerTipsEnabled: true,
    spinnerVerbs: ["不应该覆盖"],
    spinnerTipsOverride: { excludeDefault: true, tips: ["也不应该"] },
  };

  const { changed, merged } = fillMissingKeys(settingsFile, overlay);
  assert.equal(changed, true); // language/spinnerTipsEnabled 仍被补齐
  assert.deepEqual(merged.spinnerVerbs, userVerbs, "existing spinnerVerbs must be preserved");
  assert.deepEqual(merged.spinnerTipsOverride, { tips: ["mine"] }, "existing spinnerTipsOverride must be preserved");
  assert.equal(merged.language, "Chinese");

  fs.rmSync(dir, { recursive: true, force: true });
});

test("fillMissingKeys reports no change when all plugin keys already present", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-settings-complete-"));
  const settingsFile = path.join(dir, "settings.json");
  fs.writeFileSync(
    settingsFile,
    JSON.stringify({
      language: "English",
      spinnerTipsEnabled: false,
      spinnerVerbs: ["x"],
      spinnerTipsOverride: { tips: ["y"] },
    }) + "\n"
  );

  const overlay = {
    language: "Chinese",
    spinnerTipsEnabled: true,
    spinnerVerbs: ["z"],
    spinnerTipsOverride: { tips: ["w"] },
  };

  const { changed, merged } = fillMissingKeys(settingsFile, overlay);
  assert.equal(changed, false);
  assert.equal(merged.language, "English"); // 用户值保留

  fs.rmSync(dir, { recursive: true, force: true });
});

test("writeSettings writes atomically and produces valid JSON", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-settings-write-"));
  const settingsFile = path.join(dir, "settings.json");
  writeSettings(settingsFile, { language: "Chinese", spinnerTipsEnabled: true });
  const written = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  assert.deepEqual(written, { language: "Chinese", spinnerTipsEnabled: true });
  // 无残留临时文件
  assert.equal(fs.readdirSync(dir).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("PLUGIN_KEYS covers the four spinner/localization settings", () => {
  assert.deepEqual(PLUGIN_KEYS, ["language", "spinnerTipsEnabled", "spinnerVerbs", "spinnerTipsOverride"]);
});
