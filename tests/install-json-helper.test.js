const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const helper = path.join(repoRoot, "scripts", "install-json-helper.js");

function tmpDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function runHelper(args) {
  return spawnSync(process.execPath, [helper, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

test("build-overlay combines base settings with spinner verbs and tip text", () => {
  const tmp = tmpDir("cczh-install-helper-overlay-");
  const base = path.join(tmp, "settings-overlay.json");
  const verbs = path.join(tmp, "verbs.json");
  const tips = path.join(tmp, "tips.json");

  fs.writeFileSync(base, JSON.stringify({ language: "Chinese", spinnerTipsEnabled: true }));
  fs.writeFileSync(verbs, JSON.stringify(["读", "写"]));
  fs.writeFileSync(tips, JSON.stringify({ tips: [{ text: "第一条" }, { text: "第二条" }] }));

  const result = runHelper(["build-overlay", base, verbs, tips]);

  assert.equal(result.status, 0, result.stderr);
  const overlay = JSON.parse(result.stdout);
  assert.equal(overlay.language, "Chinese");
  assert.deepEqual(overlay.spinnerVerbs, ["读", "写"]);
  assert.deepEqual(overlay.spinnerTipsOverride, {
    excludeDefault: true,
    tips: ["第一条", "第二条"],
  });
});

test("deep-merge-settings writes merged settings and preserves unrelated nested keys", () => {
  const tmp = tmpDir("cczh-install-helper-merge-");
  const settings = path.join(tmp, "settings.json");
  const overlay = path.join(tmp, "overlay.json");

  fs.writeFileSync(
    settings,
    JSON.stringify({
      language: "English",
      env: { keep: true, overwrite: "old" },
      theme: "dark",
    })
  );
  fs.writeFileSync(
    overlay,
    JSON.stringify({
      language: "Chinese",
      env: { overwrite: "new" },
      spinnerVerbs: ["读"],
    })
  );

  const result = runHelper(["deep-merge-settings", settings, overlay]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "ok");
  assert.deepEqual(JSON.parse(fs.readFileSync(settings, "utf8")), {
    language: "Chinese",
    env: { keep: true, overwrite: "new" },
    theme: "dark",
    spinnerVerbs: ["读"],
  });
});

test("patch-revision matches the shared patch fingerprint algorithm", () => {
  const tmp = tmpDir("cczh-install-helper-revision-");
  const files = {
    "manifest.json": '{"version":"1.0.0"}',
    "patch-cli.sh": "patch shell",
    "cli-translations.json": "[]",
  };

  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(tmp, name), content);
  }

  const hash = crypto.createHash("sha256");
  for (const name of [
    "manifest.json",
    "patch-cli.sh",
    "patch-cli.js",
    "cli-translations.json",
    "bun-binary-io.js",
    "compute-patch-revision.sh",
  ]) {
    const target = path.join(tmp, name);
    if (!fs.existsSync(target)) continue;
    hash.update(name);
    hash.update("\0");
    hash.update(fs.readFileSync(target));
    hash.update("\0");
  }

  const result = runHelper(["patch-revision", tmp]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, hash.digest("hex").slice(0, 16));
});

test("Windows uninstall protects custom launcher files with the same zh-cn marker check", () => {
  const script = fs.readFileSync(path.join(repoRoot, "uninstall.ps1"), "utf8");

  assert.match(script, /ReadAllText\(\$Target/);
  assert.match(script, /claude-code-zh-cn/);
  assert.match(script, /检测到自定义 launcher，未自动删除/);
});
