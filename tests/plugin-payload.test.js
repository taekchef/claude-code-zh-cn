const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const legacyManifestPath = path.join(repoRoot, "plugin", "manifest.json");
const officialManifestPath = path.join(repoRoot, "plugin", ".claude-plugin", "plugin.json");
const marketplaceManifestPath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
const pairs = [
  ["patch-cli.sh", path.join(repoRoot, "patch-cli.sh"), path.join(repoRoot, "plugin", "patch-cli.sh")],
  ["patch-cli.js", path.join(repoRoot, "patch-cli.js"), path.join(repoRoot, "plugin", "patch-cli.js")],
  ["cli-translations.json", path.join(repoRoot, "cli-translations.json"), path.join(repoRoot, "plugin", "cli-translations.json")],
  ["bun-binary-io.js", path.join(repoRoot, "bun-binary-io.js"), path.join(repoRoot, "plugin", "bun-binary-io.js")],
  ["compute-patch-revision.sh", path.join(repoRoot, "compute-patch-revision.sh"), path.join(repoRoot, "plugin", "compute-patch-revision.sh")],
  ["doctor.sh", path.join(repoRoot, "doctor.sh"), path.join(repoRoot, "plugin", "bin", "doctor")],
  ["doctor.ps1", path.join(repoRoot, "doctor.ps1"), path.join(repoRoot, "plugin", "bin", "doctor.ps1")],
  ["scripts/zh-cn-doctor.js", path.join(repoRoot, "scripts", "zh-cn-doctor.js"), path.join(repoRoot, "plugin", "scripts", "zh-cn-doctor.js")],
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("legacy and official plugin manifests keep the same release identity", () => {
  const legacyManifest = readJson(legacyManifestPath);
  const officialManifest = readJson(officialManifestPath);

  assert.equal(legacyManifest.name, "claude-code-zh-cn");
  assert.match(legacyManifest.version, /^\d+\.\d+\.\d+$/);
  assert.deepEqual(
    { name: officialManifest.name, version: officialManifest.version },
    { name: legacyManifest.name, version: legacyManifest.version }
  );
});

test("marketplace manifest points at the bundled official plugin", () => {
  const officialManifest = readJson(officialManifestPath);
  const marketplaceManifest = readJson(marketplaceManifestPath);
  const marketplacePlugin = marketplaceManifest.plugins.find(
    (plugin) => plugin.name === officialManifest.name
  );

  assert.ok(marketplacePlugin, `marketplace is missing plugin ${officialManifest.name}`);
  assert.equal(marketplacePlugin.source, "./plugin");
});

test("plugin payload contains all patch files needed by session-start hook", () => {
  for (const [name, rootFile, pluginFile] of pairs) {
    assert.equal(fs.existsSync(rootFile), true, `missing root file: ${name}`);
    assert.equal(fs.existsSync(pluginFile), true, `missing plugin payload file: ${name}`);
    assert.equal(
      fs.readFileSync(pluginFile, "utf8"),
      fs.readFileSync(rootFile, "utf8"),
      `plugin payload file drifted from root copy: ${name}`
    );
  }
});
