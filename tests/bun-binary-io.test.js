const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const helperPath = path.join(repoRoot, "bun-binary-io.js");
const bunTrailer = Buffer.from("\n---- Bun! ----\n");

function createFakeMachOBinary(filePath, { trailerAtEof = false } = {}) {
  const prefix = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x00, 0x00, 0x00, 0x00]);
  const sectionPadding = Buffer.alloc(64, 0x41);
  const eofPadding = Buffer.alloc(64, 0x00);
  const parts = trailerAtEof
    ? [prefix, sectionPadding, eofPadding, bunTrailer]
    : [prefix, sectionPadding, bunTrailer, eofPadding];

  fs.writeFileSync(filePath, Buffer.concat(parts));
  fs.chmodSync(filePath, 0o755);
}

test("detect treats Mach-O binaries with Bun trailer outside EOF as native-bun", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-bun-detect-"));
  const realBinary = path.join(tmp, "claude-real");
  const symlinkPath = path.join(tmp, "claude");
  const isolatedHome = path.join(tmp, "home");
  const isolatedPrefix = path.join(tmp, "npm-prefix");

  fs.mkdirSync(isolatedHome, { recursive: true });
  fs.mkdirSync(isolatedPrefix, { recursive: true });
  createFakeMachOBinary(realBinary, { trailerAtEof: false });
  fs.symlinkSync(realBinary, symlinkPath);
  const resolvedBinary = fs.realpathSync(realBinary);

  const output = execFileSync("node", [helperPath, "detect", symlinkPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: isolatedHome,
      npm_config_prefix: isolatedPrefix,
    },
  }).trim();

  assert.equal(output, `native-bun:${resolvedBinary}`);
});
