const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadGeneratorWithDate(DateImpl) {
  const source = fs
    .readFileSync(path.join(repoRoot, "scripts", "generate-support-matrix.js"), "utf8")
    .replace(/\nmain\(\);\s*$/, "\nmodule.exports = { buildMarkdown };\n");
  const sandbox = {
    __dirname: path.join(repoRoot, "scripts"),
    module: { exports: {} },
    require,
    process,
    Date: DateImpl,
  };

  vm.runInNewContext(source, sandbox, {
    filename: path.join(repoRoot, "scripts", "generate-support-matrix.js"),
  });
  return sandbox.module.exports;
}

test("support matrix generated date uses UTC to avoid timezone drift", () => {
  class DateWithDifferentLocalDay {
    getFullYear() {
      return 2026;
    }
    getMonth() {
      return 3;
    }
    getDate() {
      return 28;
    }
    getUTCFullYear() {
      return 2026;
    }
    getUTCMonth() {
      return 3;
    }
    getUTCDate() {
      return 27;
    }
  }

  const { buildMarkdown } = loadGeneratorWithDate(DateWithDifferentLocalDay);
  const markdown = buildMarkdown(
    {
      support: {
        npm: { stable: { representatives: [] } },
        macosOfficialInstaller: { unsupported: true },
        linuxOfficialInstaller: { unsupported: true },
      },
    },
    { results: [], summary: { pass: 0, fail: 0 } }
  );

  assert.match(markdown, /on 2026-04-27\./);
});
