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

function createFakePeBinary(filePath) {
  const prefix = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);
  const padding = Buffer.alloc(64, 0x50);
  fs.writeFileSync(filePath, Buffer.concat([prefix, padding, bunTrailer]));
  fs.chmodSync(filePath, 0o755);
}

function createBunSectionData(source) {
  const strings = [
    Buffer.from("claude"),
    Buffer.from(source),
    Buffer.alloc(0),
    Buffer.alloc(0),
    Buffer.alloc(0),
    Buffer.alloc(0),
  ];
  const stringOffsets = [];
  let offset = 0;
  for (const value of strings) {
    stringOffsets.push({ offset, length: value.length });
    offset += value.length + 1;
  }

  const modulesListOffset = offset;
  const moduleStructSize = 52;
  const modulesListSize = moduleStructSize;
  offset += modulesListSize;

  const compileExecArgvOffset = offset;
  const compileExecArgvLength = 0;
  offset += 1;

  const offsetsOffset = offset;
  offset += 32;
  const trailerOffset = offset;
  offset += bunTrailer.length;

  const bunData = Buffer.alloc(offset, 0);
  strings.forEach((value, index) => {
    value.copy(bunData, stringOffsets[index].offset);
  });

  let pos = modulesListOffset;
  for (const pointer of stringOffsets) {
    bunData.writeUInt32LE(pointer.offset, pos);
    bunData.writeUInt32LE(pointer.length, pos + 4);
    pos += 8;
  }
  bunData.writeUInt8(0, pos);
  bunData.writeUInt8(0, pos + 1);
  bunData.writeUInt8(0, pos + 2);
  bunData.writeUInt8(0, pos + 3);

  pos = offsetsOffset;
  bunData.writeBigUInt64LE(BigInt(offsetsOffset), pos);
  pos += 8;
  bunData.writeUInt32LE(modulesListOffset, pos);
  bunData.writeUInt32LE(modulesListSize, pos + 4);
  pos += 8;
  bunData.writeUInt32LE(0, pos);
  pos += 4;
  bunData.writeUInt32LE(compileExecArgvOffset, pos);
  bunData.writeUInt32LE(compileExecArgvLength, pos + 4);
  pos += 8;
  bunData.writeUInt32LE(0, pos);
  bunTrailer.copy(bunData, trailerOffset);

  const sectionData = Buffer.alloc(8 + bunData.length);
  sectionData.writeBigUInt64LE(BigInt(bunData.length), 0);
  bunData.copy(sectionData, 8);
  return sectionData;
}

function writeFakeNodeLief(root) {
  const moduleDir = path.join(root, "node_modules", "node-lief");
  fs.mkdirSync(moduleDir, { recursive: true });
  fs.writeFileSync(
    path.join(moduleDir, "index.js"),
    `
const fs = require("node:fs");
const path = require("node:path");

function createSection(binaryPath) {
  let content = fs.readFileSync(binaryPath).subarray(4);
  return {
    name: ".bun",
    size: BigInt(content.length),
    virtualSize: BigInt(content.length),
    get content() {
      return content;
    },
    set content(value) {
      content = Buffer.from(value);
      this.size = BigInt(content.length);
      this.virtualSize = BigInt(content.length);
    },
  };
}

exports.logging = { disable() {} };
exports.parse = function parse(binaryPath) {
  const section = createSection(binaryPath);
  return {
    format: "PE",
    sections() {
      return [section];
    },
    write(outputPath) {
      fs.writeFileSync(outputPath, Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), section.content]));
    },
  };
};
`
  );
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

function runHelperWithStatus(args, extraEnv = {}) {
  return require("node:child_process").spawnSync("node", [helperPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
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

test("detect treats PE binaries with Bun trailer as native-bun", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-bun-detect-pe-"));
  const pePath = path.join(tmp, "claude.exe");

  createFakePeBinary(pePath);

  const output = runHelper(["detect", pePath], {
    HOME: path.join(tmp, "home"),
    npm_config_prefix: path.join(tmp, "npm-prefix"),
  });

  assert.equal(output, `native-bun:${fs.realpathSync(pePath)}`);
});

test("version falls back to package.json for npm-installed Windows native exe", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-bun-version-package-"));
  const packageRoot = path.join(tmp, "node_modules", "@anthropic-ai", "claude-code");
  const pePath = path.join(packageRoot, "bin", "claude.exe");

  fs.mkdirSync(path.dirname(pePath), { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({ name: "@anthropic-ai/claude-code", version: "2.1.150" })
  );
  createFakePeBinary(pePath);

  const output = runHelper(["version", pePath], {
    HOME: path.join(tmp, "home"),
    npm_config_prefix: path.join(tmp, "npm-prefix"),
  });

  assert.equal(output, "2.1.150");
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

test("helper has a format-dispatched PE extraction and repack path", () => {
  const helper = fs.readFileSync(helperPath, "utf8");

  assert.match(helper, /function extractFromPE\(LIEF, binaryPath\)/);
  assert.match(helper, /function extractNativeBun\(LIEF, binaryPath\)/);
  assert.match(helper, /function repackPE\(LIEF, peBinary, binPath, newBunBuffer, outputPath, sectionHeaderSize, section\)/);
  assert.match(helper, /case "PE":/);
  assert.doesNotMatch(helper, /only Mach-O \(macOS\) is supported in this version/);
});

test("extract, version, and repack can run through a PE node-lief adapter", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-bun-pe-repack-"));
  const binaryPath = path.join(tmp, "claude.exe");
  const extractedPath = path.join(tmp, "extracted.js");
  const replacementPath = path.join(tmp, "replacement.js");
  const fakeModuleRoot = path.join(tmp, "fake-node-path");
  const initialSource = "// Version: 2.1.150\nconst label = \"Bash command\";\n";
  const replacementSource = "// Version: 2.1.150\nconst label = \"Bash 命令\";\n";

  writeFakeNodeLief(fakeModuleRoot);
  fs.writeFileSync(
    binaryPath,
    Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), createBunSectionData(initialSource)])
  );
  fs.chmodSync(binaryPath, 0o755);
  fs.writeFileSync(replacementPath, replacementSource);

  const env = {
    NODE_PATH: path.join(fakeModuleRoot, "node_modules"),
    HOME: path.join(tmp, "home"),
    npm_config_prefix: path.join(tmp, "npm-prefix"),
  };

  assert.equal(runHelper(["version", binaryPath], env), "2.1.150");
  assert.equal(runHelper(["extract", binaryPath, extractedPath], env), "ok");
  assert.equal(fs.readFileSync(extractedPath, "utf8"), initialSource);

  const repack = runHelperWithStatus(["repack", binaryPath, replacementPath], env);
  assert.equal(repack.status, 0, repack.stderr);
  assert.equal(repack.stdout.trim(), "ok");

  assert.equal(runHelper(["extract", binaryPath, extractedPath], env), "ok");
  assert.equal(fs.readFileSync(extractedPath, "utf8"), replacementSource);
});

test("hash returns sha256 for binary marker identity", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-bun-hash-"));
  const file = path.join(tmp, "claude");
  fs.writeFileSync(file, "native-binary-content\n");

  const output = runHelper(["hash", file]);
  const expected = crypto.createHash("sha256").update("native-binary-content\n").digest("hex");

  assert.equal(output, expected);
});
