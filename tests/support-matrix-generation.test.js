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

test("support matrix output omits wall-clock dates to avoid daily CI drift", () => {
  class DateOne {
    getUTCFullYear() {
      return 2026;
    }
    getUTCMonth() {
      return 4;
    }
    getUTCDate() {
      return 5;
    }
  }

  class DateTwo {
    getUTCFullYear() {
      return 2026;
    }
    getUTCMonth() {
      return 4;
    }
    getUTCDate() {
      return 7;
    }
  }

  const config = {
    support: {
      npm: { stable: { representatives: [] } },
      macosOfficialInstaller: { unsupported: true },
      linuxOfficialInstaller: { unsupported: true },
    },
  };
  const compat = { results: [], summary: { pass: 0, fail: 0 } };
  const first = loadGeneratorWithDate(DateOne).buildMarkdown(config, compat);
  const second = loadGeneratorWithDate(DateTwo).buildMarkdown(config, compat);

  assert.equal(first, second);
  assert.doesNotMatch(first, /on \d{4}-\d{2}-\d{2}\./);
});

test("support matrix includes separate macOS native experimental row", () => {
  const { buildMarkdown } = loadGeneratorWithDate(Date);
  const markdown = buildMarkdown(
    {
      support: {
        npm: {
          stable: {
            floor: "2.1.92",
            ceiling: "2.1.112",
            representatives: ["2.1.112"],
            notes: "legacy npm stable",
          },
        },
        macosOfficialInstaller: { unsupported: true },
        macosNativeExperimental: {
          floor: "2.1.113",
          ceiling: "2.1.123",
          excluded: ["2.1.115"],
          representatives: ["2.1.113", "2.1.114", "2.1.116", "2.1.123"],
          verification: "2.1.113 PASS(native 1358) · 2.1.123 PASS(native 1262)",
          notes: "macOS arm64 native binary experimental；需要 node-lief；只对明确验证版本开放，不代表 latest stable。",
        },
        linuxOfficialInstaller: { unsupported: true },
        windowsNativeExe: {
          unsupported: true,
          notes: "Windows native .exe unsupported.",
        },
      },
    },
    {
      results: [{ version: "2.1.112", status: "pass", patchCount: 1450, residue: [] }],
      summary: { pass: 1, fail: 0, skip: 0 },
    }
  );

  assert.match(markdown, /## Quick Decision/);
  assert.match(markdown, /汉化效果/);
  assert.match(markdown, /npm global install \| stable \| 2\.1\.92 - 2\.1\.112/);
  assert.match(markdown, /macOS native binary \| experimental \| 2\.1\.113 - 2\.1\.123 \(不含未纳入本轮支持的 2\.1\.115\)/);
  assert.match(markdown, /2\.1\.113 PASS\(native 1358\)/);
  assert.match(markdown, /2\.1\.123 PASS\(native 1262\)/);
  assert.match(markdown, /Windows \/ native \.exe \/ latest \| unsupported/);
});

test("support matrix shows display audit status beside patch count", () => {
  const { buildMarkdown } = loadGeneratorWithDate(Date);
  const markdown = buildMarkdown(
    {
      support: {
        npm: {
          stable: {
            floor: "2.1.92",
            ceiling: "2.1.112",
            representatives: ["2.1.112"],
            notes: "legacy npm stable",
          },
        },
        macosOfficialInstaller: { unsupported: true },
        linuxOfficialInstaller: { unsupported: true },
      },
    },
    {
      results: [
        {
          version: "2.1.112",
          kind: "legacy",
          status: "pass",
          patchCount: 1450,
          residue: [],
          displayAudit: { status: "pass", issueCount: 0, commandCount: 5 },
        },
        {
          version: "2.1.123",
          kind: "native",
          status: "fail",
          patchCount: 1262,
          residue: [],
          displayAudit: { status: "fail", issueCount: 2, commandCount: 9 },
        },
      ],
      summary: { pass: 1, fail: 1, skip: 0 },
    }
  );

  assert.match(markdown, /\| Version \| Package shape \| Result \| Runtime \| 汉化显示审计 \| Patch count \| Residue \|/);
  assert.match(markdown, /\| 2\.1\.112 \| legacy \| PASS \| - \| PASS \(5 surfaces\) \| 1450 \| - \|/);
  assert.match(markdown, /\| 2\.1\.123 \| native \| FAIL \| - \| FAIL \(2 issues \/ 9 surfaces\) \| 1262 \| - \|/);
});
