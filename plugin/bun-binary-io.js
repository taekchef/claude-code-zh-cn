#!/usr/bin/env node
/**
 * bun-binary-io.js — Bun 原生二进制 I/O 工具
 *
 * 从 tweakcc (Piebald-AI/tweakcc) 的 nativeInstallation.ts 精简移植。
 * 仅支持 macOS (Mach-O)，v1 标记为实验性功能。
 *
 * CLI 子命令：
 *   detect <claude-cmd>     → 输出 "npm:<path>" 或 "native-bun:<path>" 或 "unknown"
 *   extract <binary> <out>  → 提取内嵌 JS 到 <out>
 *   repack <binary> <js>    → 将修改后的 JS 写回二进制（含 codesign）
 *   version <binary>        → 输出二进制内嵌的版本号
 *   resolve <path>          → 输出 realpath（跨平台 symlink 解析）
 *   check-deps              → 检查 node-lief 是否可用
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync, execFileSync } = require("child_process");

// ============================================================================
// 常量
// ============================================================================

const BUN_TRAILER = Buffer.from("\n---- Bun! ----\n");
const SIZEOF_OFFSETS = 32;
const SIZEOF_STRING_POINTER = 8;
const SIZEOF_MODULE_OLD = 4 * SIZEOF_STRING_POINTER + 4; // 36
const SIZEOF_MODULE_NEW = 6 * SIZEOF_STRING_POINTER + 4; // 52

// ============================================================================
// node-lief 加载
// ============================================================================

function loadNodeLief() {
  // 1. 直接 require
  try { return require("node-lief"); } catch {}
  // 2. npm root -g
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return require(path.join(globalRoot, "node-lief"));
  } catch {}
  return null;
}

// ============================================================================
// 二进制格式检测
// ============================================================================

function hasBunTrailer(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < BUN_TRAILER.length) return false;
    const fd = fs.openSync(filePath, "r");
    const chunkSize = 1024 * 1024;
    const overlap = BUN_TRAILER.length - 1;
    const buf = Buffer.alloc(chunkSize + overlap);
    let carry = 0;
    let position = 0;

    try {
      while (position < stat.size) {
        const bytesRead = fs.readSync(fd, buf, carry, chunkSize, position);
        if (bytesRead <= 0) break;
        const searchLength = carry + bytesRead;
        if (buf.subarray(0, searchLength).includes(BUN_TRAILER)) return true;
        if (searchLength > overlap) {
          buf.copyWithin(0, searchLength - overlap, searchLength);
          carry = overlap;
        } else {
          carry = searchLength;
        }
        position += bytesRead;
      }
      return false;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function detectBinaryFormat(filePath) {
  try {
    const magic = Buffer.alloc(4);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, magic, 0, 4, 0);
    fs.closeSync(fd);
    // Mach-O 64-bit little-endian
    if (magic[0] === 0xCF && magic[1] === 0xFA && magic[2] === 0xED && magic[3] === 0xFE) return "MachO64";
    // Mach-O 32-bit little-endian
    if (magic[0] === 0xCE && magic[1] === 0xFA && magic[2] === 0xED && magic[3] === 0xFE) return "MachO32";
    // ELF
    if (magic[0] === 0x7F && magic[1] === 0x45 && magic[2] === 0x4C && magic[3] === 0x46) return "ELF";
    return "unknown";
  } catch {
    return "unknown";
  }
}

// ============================================================================
// 安装检测
// ============================================================================

function detectInstallation(claudeCmd) {
  // 1. 解析 symlink → realpath
  let realPath;
  try { realPath = fs.realpathSync(claudeCmd); } catch { return "unknown"; }

  // 2. 先判真实目标本身是不是 Bun 二进制（Codex 二审 #1）
  //    仅支持 Mach-O（macOS），ELF (Linux) 暂不开放
  const format = detectBinaryFormat(realPath);
  if ((format === "MachO64" || format === "MachO32") && hasBunTrailer(realPath)) {
    return "native-bun:" + realPath;
  }

  // 3. 不是二进制 → 检查是否在 npm 布局中
  const npmCli = path.resolve(path.dirname(realPath),
    "../lib/node_modules/@anthropic-ai/claude-code/cli.js");
  if (fs.existsSync(npmCli)) return "npm:" + npmCli;

  // 4. npm root -g 兜底
  try {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    const npmCli2 = path.join(globalRoot, "@anthropic-ai/claude-code/cli.js");
    if (fs.existsSync(npmCli2)) return "npm:" + npmCli2;
  } catch {}

  return "unknown";
}

// ============================================================================
// Bun 数据解析（纯 Buffer 操作，基于 tweakcc）
// ============================================================================

function parseStringPointer(buffer, offset) {
  return {
    offset: buffer.readUInt32LE(offset),
    length: buffer.readUInt32LE(offset + 4),
  };
}

function getStringPointerContent(buffer, sp) {
  return buffer.subarray(sp.offset, sp.offset + sp.length);
}

function parseOffsets(buffer) {
  let pos = 0;
  const byteCount = buffer.readBigUInt64LE(pos);
  pos += 8;
  const modulesPtr = parseStringPointer(buffer, pos);
  pos += 8;
  const entryPointId = buffer.readUInt32LE(pos);
  pos += 4;
  const compileExecArgvPtr = parseStringPointer(buffer, pos);
  pos += 8;
  const flags = buffer.readUInt32LE(pos);
  return { byteCount, modulesPtr, entryPointId, compileExecArgvPtr, flags };
}

function detectModuleStructSize(modulesListLength) {
  const fitsNew = modulesListLength % SIZEOF_MODULE_NEW === 0;
  const fitsOld = modulesListLength % SIZEOF_MODULE_OLD === 0;
  if (fitsNew && !fitsOld) return SIZEOF_MODULE_NEW;
  if (fitsOld && !fitsNew) return SIZEOF_MODULE_OLD;
  // 歧义时优先新格式
  return SIZEOF_MODULE_NEW;
}

function isClaudeModule(moduleName) {
  return moduleName.endsWith("/claude") ||
    moduleName === "claude" ||
    moduleName.endsWith("/src/entrypoints/cli.js") ||
    moduleName === "src/entrypoints/cli.js";
}

function parseCompiledModule(buffer, offset, moduleStructSize) {
  let pos = offset;
  const name = parseStringPointer(buffer, pos); pos += 8;
  const contents = parseStringPointer(buffer, pos); pos += 8;
  const sourcemap = parseStringPointer(buffer, pos); pos += 8;
  const bytecode = parseStringPointer(buffer, pos); pos += 8;

  let moduleInfo, bytecodeOriginPath;
  if (moduleStructSize === SIZEOF_MODULE_NEW) {
    moduleInfo = parseStringPointer(buffer, pos); pos += 8;
    bytecodeOriginPath = parseStringPointer(buffer, pos); pos += 8;
  } else {
    moduleInfo = { offset: 0, length: 0 };
    bytecodeOriginPath = { offset: 0, length: 0 };
  }

  const encoding = buffer.readUInt8(pos); pos += 1;
  const loader = buffer.readUInt8(pos); pos += 1;
  const moduleFormat = buffer.readUInt8(pos); pos += 1;
  const side = buffer.readUInt8(pos);

  return { name, contents, sourcemap, bytecode, moduleInfo, bytecodeOriginPath, encoding, loader, moduleFormat, side };
}

function parseBunDataBlob(bunDataContent) {
  if (bunDataContent.length < SIZEOF_OFFSETS + BUN_TRAILER.length) {
    throw new Error("BUN data is too small");
  }

  // 验证 trailer
  const trailerStart = bunDataContent.length - BUN_TRAILER.length;
  if (!bunDataContent.subarray(trailerStart).equals(BUN_TRAILER)) {
    throw new Error("BUN trailer mismatch");
  }

  // 解析 Offsets
  const offsetsStart = bunDataContent.length - SIZEOF_OFFSETS - BUN_TRAILER.length;
  const bunOffsets = parseOffsets(bunDataContent.subarray(offsetsStart, offsetsStart + SIZEOF_OFFSETS));
  const moduleStructSize = detectModuleStructSize(bunOffsets.modulesPtr.length);

  return { bunOffsets, bunData: bunDataContent, moduleStructSize };
}

// Section format: [u32/u64 size header][bun data blob...]
function extractBunDataFromSection(sectionData) {
  if (sectionData.length < 4) throw new Error("Section data too small");

  // 尝试 u32 header（旧格式）
  const bunDataSizeU32 = sectionData.readUInt32LE(0);
  const expectedLengthU32 = 4 + bunDataSizeU32;

  // 尝试 u64 header（新格式）
  const bunDataSizeU64 = sectionData.length >= 8 ? Number(sectionData.readBigUInt64LE(0)) : 0;
  const expectedLengthU64 = 8 + bunDataSizeU64;

  let headerSize, bunDataSize;

  if (sectionData.length >= 8 && expectedLengthU64 <= sectionData.length && expectedLengthU64 >= sectionData.length - 4096) {
    headerSize = 8;
    bunDataSize = bunDataSizeU64;
  } else if (expectedLengthU32 <= sectionData.length && expectedLengthU32 >= sectionData.length - 4096) {
    headerSize = 4;
    bunDataSize = bunDataSizeU32;
  } else {
    throw new Error("Cannot determine section header format");
  }

  const bunDataContent = sectionData.subarray(headerSize, headerSize + bunDataSize);
  const parsed = parseBunDataBlob(bunDataContent);
  return { ...parsed, sectionHeaderSize: headerSize };
}

// ============================================================================
// 使用 node-lief 的提取/重打包
// ============================================================================

function extractFromMachO(LIEF, binaryPath) {
  LIEF.logging.disable();
  const binary = LIEF.parse(binaryPath);

  const bunSegment = binary.getSegment("__BUN");
  if (!bunSegment) throw new Error("__BUN segment not found");
  const bunSection = bunSegment.getSection("__bun");
  if (!bunSection) throw new Error("__bun section not found");

  return extractBunDataFromSection(bunSection.content);
}

function findClaudeModule(bunData, bunOffsets, moduleStructSize) {
  const modulesListBytes = getStringPointerContent(bunData, bunOffsets.modulesPtr);
  const count = Math.floor(modulesListBytes.length / moduleStructSize);

  for (let i = 0; i < count; i++) {
    const mod = parseCompiledModule(modulesListBytes, i * moduleStructSize, moduleStructSize);
    const moduleName = getStringPointerContent(bunData, mod.name).toString("utf-8");
    if (isClaudeModule(moduleName)) {
      return {
        module: mod,
        moduleName,
        contents: getStringPointerContent(bunData, mod.contents),
      };
    }
  }
  return null;
}

function rebuildBunData(bunData, bunOffsets, modifiedClaudeJs, moduleStructSize) {
  const modulesListBytes = getStringPointerContent(bunData, bunOffsets.modulesPtr);
  const count = Math.floor(modulesListBytes.length / moduleStructSize);

  // Phase 1: 收集所有模块数据
  const stringsData = [];
  const modulesMetadata = [];

  for (let i = 0; i < count; i++) {
    const mod = parseCompiledModule(modulesListBytes, i * moduleStructSize, moduleStructSize);
    const nameBytes = getStringPointerContent(bunData, mod.name);
    const moduleName = nameBytes.toString("utf-8");

    const contentsBytes = (modifiedClaudeJs && isClaudeModule(moduleName))
      ? modifiedClaudeJs
      : getStringPointerContent(bunData, mod.contents);
    const sourcemapBytes = getStringPointerContent(bunData, mod.sourcemap);
    const bytecodeBytes = getStringPointerContent(bunData, mod.bytecode);
    const moduleInfoBytes = getStringPointerContent(bunData, mod.moduleInfo);
    const bytecodeOriginPathBytes = getStringPointerContent(bunData, mod.bytecodeOriginPath);

    modulesMetadata.push({
      name: nameBytes, contents: contentsBytes, sourcemap: sourcemapBytes,
      bytecode: bytecodeBytes, moduleInfo: moduleInfoBytes, bytecodeOriginPath: bytecodeOriginPathBytes,
      encoding: mod.encoding, loader: mod.loader, moduleFormat: mod.moduleFormat, side: mod.side,
    });

    if (moduleStructSize === SIZEOF_MODULE_NEW) {
      stringsData.push(nameBytes, contentsBytes, sourcemapBytes, bytecodeBytes, moduleInfoBytes, bytecodeOriginPathBytes);
    } else {
      stringsData.push(nameBytes, contentsBytes, sourcemapBytes, bytecodeBytes);
    }
  }

  const stringsPerModule = moduleStructSize === SIZEOF_MODULE_NEW ? 6 : 4;

  // Phase 2: 计算布局
  let currentOffset = 0;
  const stringOffsets = [];
  for (const s of stringsData) {
    stringOffsets.push({ offset: currentOffset, length: s.length });
    currentOffset += s.length + 1; // +1 null terminator
  }

  const modulesListOffset = currentOffset;
  const modulesListSize = modulesMetadata.length * moduleStructSize;
  currentOffset += modulesListSize;

  const compileExecArgvBytes = getStringPointerContent(bunData, bunOffsets.compileExecArgvPtr);
  const compileExecArgvOffset = currentOffset;
  const compileExecArgvLength = compileExecArgvBytes.length;
  currentOffset += compileExecArgvLength + 1;

  const offsetsOffset = currentOffset;
  currentOffset += SIZEOF_OFFSETS;
  const trailerOffset = currentOffset;
  currentOffset += BUN_TRAILER.length;

  // Phase 3: 写入
  const newBuf = Buffer.allocUnsafe(currentOffset);
  newBuf.fill(0);

  let stringIdx = 0;
  for (const { offset, length } of stringOffsets) {
    if (length > 0) stringsData[stringIdx].copy(newBuf, offset, 0, length);
    newBuf[offset + length] = 0;
    stringIdx++;
  }

  if (compileExecArgvLength > 0) {
    compileExecArgvBytes.copy(newBuf, compileExecArgvOffset, 0, compileExecArgvLength);
    newBuf[compileExecArgvOffset + compileExecArgvLength] = 0;
  }

  for (let i = 0; i < modulesMetadata.length; i++) {
    const meta = modulesMetadata[i];
    const base = i * stringsPerModule;
    const modStruct = {
      name: stringOffsets[base], contents: stringOffsets[base + 1],
      sourcemap: stringOffsets[base + 2], bytecode: stringOffsets[base + 3],
      moduleInfo: moduleStructSize === SIZEOF_MODULE_NEW ? stringOffsets[base + 4] : { offset: 0, length: 0 },
      bytecodeOriginPath: moduleStructSize === SIZEOF_MODULE_NEW ? stringOffsets[base + 5] : { offset: 0, length: 0 },
      encoding: meta.encoding, loader: meta.loader, moduleFormat: meta.moduleFormat, side: meta.side,
    };

    const modOffset = modulesListOffset + i * moduleStructSize;
    let pos = modOffset;
    newBuf.writeUInt32LE(modStruct.name.offset, pos); newBuf.writeUInt32LE(modStruct.name.length, pos + 4); pos += 8;
    newBuf.writeUInt32LE(modStruct.contents.offset, pos); newBuf.writeUInt32LE(modStruct.contents.length, pos + 4); pos += 8;
    newBuf.writeUInt32LE(modStruct.sourcemap.offset, pos); newBuf.writeUInt32LE(modStruct.sourcemap.length, pos + 4); pos += 8;
    newBuf.writeUInt32LE(modStruct.bytecode.offset, pos); newBuf.writeUInt32LE(modStruct.bytecode.length, pos + 4); pos += 8;
    if (moduleStructSize === SIZEOF_MODULE_NEW) {
      newBuf.writeUInt32LE(modStruct.moduleInfo.offset, pos); newBuf.writeUInt32LE(modStruct.moduleInfo.length, pos + 4); pos += 8;
      newBuf.writeUInt32LE(modStruct.bytecodeOriginPath.offset, pos); newBuf.writeUInt32LE(modStruct.bytecodeOriginPath.length, pos + 4); pos += 8;
    }
    newBuf.writeUInt8(modStruct.encoding, pos); newBuf.writeUInt8(modStruct.loader, pos + 1);
    newBuf.writeUInt8(modStruct.moduleFormat, pos + 2); newBuf.writeUInt8(modStruct.side, pos + 3);
  }

  // 写入 Offsets
  let op = offsetsOffset;
  newBuf.writeBigUInt64LE(BigInt(offsetsOffset), op); op += 8;
  newBuf.writeUInt32LE(modulesListOffset, op); newBuf.writeUInt32LE(modulesListSize, op + 4); op += 8;
  newBuf.writeUInt32LE(bunOffsets.entryPointId, op); op += 4;
  newBuf.writeUInt32LE(compileExecArgvOffset, op); newBuf.writeUInt32LE(compileExecArgvLength, op + 4); op += 8;
  newBuf.writeUInt32LE(bunOffsets.flags, op);

  // 写入 trailer
  BUN_TRAILER.copy(newBuf, trailerOffset);

  return newBuf;
}

function buildSectionData(bunBuffer, headerSize) {
  const sectionData = Buffer.allocUnsafe(headerSize + bunBuffer.length);
  if (headerSize === 8) {
    sectionData.writeBigUInt64LE(BigInt(bunBuffer.length), 0);
  } else {
    sectionData.writeUInt32LE(bunBuffer.length, 0);
  }
  bunBuffer.copy(sectionData, headerSize);
  return sectionData;
}

function atomicWriteBinary(LIEF, binary, outputPath, originalPath) {
  const tempPath = outputPath + ".tmp";
  binary.write(tempPath);
  try {
    const origStat = fs.statSync(originalPath);
    fs.chmodSync(tempPath, origStat.mode);
  } catch {}
  try {
    fs.renameSync(tempPath, outputPath);
  } catch (error) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    if (error && (error.code === "ETXTBSY" || error.code === "EBUSY" || error.code === "EPERM")) {
      throw new Error("Cannot update the Claude executable while it is running. Please close all Claude instances and try again.");
    }
    throw error;
  }
}

function repackMachO(LIEF, machoBinary, binPath, newBunBuffer, outputPath, sectionHeaderSize) {
  // 移除旧签名
  if (machoBinary.hasCodeSignature) {
    machoBinary.removeSignature();
  }

  const bunSegment = machoBinary.getSegment("__BUN");
  if (!bunSegment) throw new Error("__BUN segment not found");
  const bunSection = bunSegment.getSection("__bun");
  if (!bunSection) throw new Error("__bun section not found");

  const newSectionData = buildSectionData(newBunBuffer, sectionHeaderSize);
  const sizeDiff = newSectionData.length - Number(bunSection.size);

  if (sizeDiff > 0) {
    const isARM64 = machoBinary.header.cpuType === LIEF.MachO.Header.CPU_TYPE.ARM64;
    const PAGE_SIZE = isARM64 ? 16384 : 4096;
    const alignedSizeDiff = Math.ceil(sizeDiff / PAGE_SIZE) * PAGE_SIZE;
    const success = machoBinary.extendSegment(bunSegment, alignedSizeDiff);
    if (!success) throw new Error("Failed to extend __BUN segment");
  }

  bunSection.content = newSectionData;
  bunSection.size = BigInt(newSectionData.length);

  atomicWriteBinary(LIEF, machoBinary, outputPath, binPath);

  // macOS 重签名
  try {
    execFileSync("codesign", ["-s", "-", "-f", outputPath], { stdio: "ignore" });
  } catch {
    process.stderr.write("Warning: codesign failed, binary may not run on macOS\n");
  }
}

// ============================================================================
// CLI 子命令实现
// ============================================================================

function cmdDetect() {
  const claudeCmd = process.argv[3];
  if (!claudeCmd) { process.stdout.write("unknown"); return; }
  const result = detectInstallation(claudeCmd);
  process.stdout.write(result);
}

function cmdExtract() {
  const binaryPath = process.argv[3];
  const outputPath = process.argv[4];
  if (!binaryPath || !outputPath) {
    process.stderr.write("Usage: bun-binary-io.js extract <binary> <output>\n");
    process.exit(1);
  }

  const LIEF = loadNodeLief();
  if (!LIEF) {
    process.stderr.write("Error: node-lief not found. Install with: npm install -g node-lief\n");
    process.exit(1);
  }

  const { bunData, bunOffsets, moduleStructSize } = extractFromMachO(LIEF, binaryPath);
  const found = findClaudeModule(bunData, bunOffsets, moduleStructSize);
  if (!found || found.contents.length === 0) {
    process.stderr.write("Error: claude module not found in binary\n");
    process.exit(1);
  }

  fs.writeFileSync(outputPath, found.contents);
  process.stdout.write("ok");
}

function cmdRepack() {
  const binaryPath = process.argv[3];
  const jsPath = process.argv[4];
  if (!binaryPath || !jsPath) {
    process.stderr.write("Usage: bun-binary-io.js repack <binary> <js-file>\n");
    process.exit(1);
  }

  const LIEF = loadNodeLief();
  if (!LIEF) {
    process.stderr.write("Error: node-lief not found. Install with: npm install -g node-lief\n");
    process.exit(1);
  }

  LIEF.logging.disable();
  const modifiedJs = fs.readFileSync(jsPath);
  const binary = LIEF.parse(binaryPath);

  const { bunOffsets, bunData, sectionHeaderSize, moduleStructSize } = extractFromMachO(LIEF, binaryPath);
  const newBuffer = rebuildBunData(bunData, bunOffsets, modifiedJs, moduleStructSize);

  if (binary.format !== "MachO") {
    process.stderr.write("Error: only Mach-O (macOS) is supported in this version\n");
    process.exit(1);
  }

  repackMachO(LIEF, binary, binaryPath, newBuffer, binaryPath, sectionHeaderSize);
  process.stdout.write("ok");
}

function cmdVersion() {
  const binaryPath = process.argv[3];
  if (!binaryPath) {
    process.stderr.write("Usage: bun-binary-io.js version <binary>\n");
    process.exit(1);
  }

  const LIEF = loadNodeLief();
  if (!LIEF) {
    process.stdout.write("");
    return;
  }

  try {
    const { bunData, bunOffsets, moduleStructSize } = extractFromMachO(LIEF, binaryPath);
    const found = findClaudeModule(bunData, bunOffsets, moduleStructSize);
    if (found && found.contents.length > 0) {
      // 从 JS 内容头部提取版本号（匹配 "// Version: X.Y.Z" 格式）
      const header = found.contents.subarray(0, 200).toString("utf-8");
      const match = header.match(/\/\/ Version: (\S+)/);
      if (match) {
        process.stdout.write(match[1]);
        return;
      }
    }
    process.stdout.write("");
  } catch {
    process.stdout.write("");
  }
}

function cmdResolve() {
  const inputPath = process.argv[3];
  if (!inputPath) {
    process.stderr.write("Usage: bun-binary-io.js resolve <path>\n");
    process.exit(1);
  }
  try {
    process.stdout.write(fs.realpathSync(inputPath));
  } catch {
    process.stdout.write(inputPath);
  }
}

function cmdCheckDeps() {
  const LIEF = loadNodeLief();
  process.stdout.write(LIEF ? "ok" : "missing");
}

// ============================================================================
// CLI 入口
// ============================================================================

const command = process.argv[2];
switch (command) {
  case "detect": cmdDetect(); break;
  case "extract": cmdExtract(); break;
  case "repack": cmdRepack(); break;
  case "version": cmdVersion(); break;
  case "resolve": cmdResolve(); break;
  case "check-deps": cmdCheckDeps(); break;
  default:
    process.stderr.write(
      "Usage: bun-binary-io.js <command> [args...]\n" +
      "Commands: detect, extract, repack, version, resolve, check-deps\n"
    );
    process.exit(1);
}
