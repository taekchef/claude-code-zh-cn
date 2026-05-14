const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
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

function createFakeElfBinary(filePath) {
  const prefix = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
  const padding = Buffer.alloc(64, 0x42);
  fs.writeFileSync(filePath, Buffer.concat([prefix, padding, bunTrailer]));
  fs.chmodSync(filePath, 0o755);
}

function runHelper(args, extraEnv = {}) {
  return execFileSync("node", [helperPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
    },
  }).trim();
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

  const output = runHelper(["detect", symlinkPath], {
    HOME: isolatedHome,
    npm_config_prefix: isolatedPrefix,
  });

  assert.equal(output, `native-bun:${resolvedBinary}`);
});

test("detect returns npm cli.js path for npm-style installation layout", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-bun-detect-npm-"));
  const binDir = path.join(tmp, "prefix", "bin");
  const binPath = path.join(binDir, "claude");
  const cliPath = path.join(tmp, "prefix", "lib", "node_modules", "@anthropic-ai", "claude-code", "cli.js");

  fs.mkdirSync(path.dirname(cliPath), { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(binPath, "#!/usr/bin/env node\n");
  fs.chmodSync(binPath, 0o755);
  fs.writeFileSync(cliPath, "// Version: 2.1.101\n");

  const output = runHelper(["detect", binPath], {
    HOME: path.join(tmp, "home"),
    npm_config_prefix: path.join(tmp, "npm-prefix"),
  });

  assert.equal(output, `npm:${fs.realpathSync(cliPath)}`);
});

test("detect returns unknown for plain files that are neither Bun binaries nor npm installs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-bun-detect-unknown-"));
  const plainFile = path.join(tmp, "claude");
  fs.writeFileSync(plainFile, "#!/usr/bin/env bash\necho hi\n");
  fs.chmodSync(plainFile, 0o755);

  const output = runHelper(["detect", plainFile], {
    HOME: path.join(tmp, "home"),
    npm_config_prefix: path.join(tmp, "npm-prefix"),
  });

  assert.equal(output, "unknown");
});

test("detect keeps ELF binaries out of native-bun path", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-bun-detect-elf-"));
  const elfPath = path.join(tmp, "claude-elf");
  createFakeElfBinary(elfPath);

  const output = runHelper(["detect", elfPath], {
    HOME: path.join(tmp, "home"),
    npm_config_prefix: path.join(tmp, "npm-prefix"),
  });

  assert.equal(output, "unknown");
});

test("resolve returns the real path for symlinks", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-bun-resolve-"));
  const realFile = path.join(tmp, "real");
  const symlinkPath = path.join(tmp, "link");

  fs.writeFileSync(realFile, "hello\n");
  fs.symlinkSync(realFile, symlinkPath);

  const output = runHelper(["resolve", symlinkPath]);
  assert.equal(output, fs.realpathSync(realFile));
});

test("check-deps returns ok or missing without crashing", () => {
  const output = runHelper(["check-deps"]);
  assert.match(output, /^(ok|missing)$/);
});

test("repack treats codesign signing and verification as hard requirements", () => {
  const helper = fs.readFileSync(helperPath, "utf8");

  assert.match(helper, /runCodesign\(\["-s", "-", "-f", outputPath\], "sign"\)/);
  assert.match(helper, /runCodesign\(\["--verify", "--strict", "--verbose=4", outputPath\], "verify"\)/);
  assert.doesNotMatch(helper, /Warning: codesign failed/);
});

test("hash returns sha256 for binary marker identity", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-bun-hash-"));
  const file = path.join(tmp, "claude");
  fs.writeFileSync(file, "native-binary-content\n");

  const output = runHelper(["hash", file]);
  const expected = crypto.createHash("sha256").update("native-binary-content\n").digest("hex");

  assert.equal(output, expected);
});
