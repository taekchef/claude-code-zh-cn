const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const pairs = [
  ["patch-cli.sh", path.join(repoRoot, "patch-cli.sh"), path.join(repoRoot, "plugin", "patch-cli.sh")],
  ["patch-cli.js", path.join(repoRoot, "patch-cli.js"), path.join(repoRoot, "plugin", "patch-cli.js")],
  ["cli-translations.json", path.join(repoRoot, "cli-translations.json"), path.join(repoRoot, "plugin", "cli-translations.json")],
  ["bun-binary-io.js", path.join(repoRoot, "bun-binary-io.js"), path.join(repoRoot, "plugin", "bun-binary-io.js")],
  ["compute-patch-revision.sh", path.join(repoRoot, "compute-patch-revision.sh"), path.join(repoRoot, "plugin", "compute-patch-revision.sh")],
];

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
