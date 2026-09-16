#!/usr/bin/env node
"use strict";

// 安装器、启动器和 Hook 共用一次事务：只在副本验证成功后替换现场。
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const revisionFiles = ["patch-cli.sh", "patch-cli.js", "cli-translations.json", "bun-binary-io.js", "compute-patch-revision.sh", "scripts/patch-bytecode.js", "scripts/native-repair.js"];
function hash(file) {
  const h = crypto.createHash("sha256"), fd = fs.openSync(file, "r"), buffer = Buffer.alloc(1024 * 1024);
  try { let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) h.update(buffer.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return h.digest("hex");
}
function revision() {
  const h = crypto.createHash("sha256");
  for (const file of revisionFiles) if (fs.existsSync(path.join(root, file))) h.update(file).update("\0").update(fs.readFileSync(path.join(root, file))).update("\0");
  return h.digest("hex").slice(0, 16);
}
function readJson(file) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } }
function platform() {
  if (process.env.ZH_CN_NATIVE_PLATFORM) return process.env.ZH_CN_NATIVE_PLATFORM;
  const name = `${process.platform}-${process.arch}`;
  return name === "linux-x64" && !process.report.getReport().header.glibcVersionRuntime ? `${name}-musl` : name;
}
function run(file, args, env = process.env) {
  return execFileSync(file, args, { encoding: "utf8", timeout: 60000, maxBuffer: 8 * 1024 * 1024, windowsHide: true, env, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function io(...args) { return run(process.execPath, [path.join(root, "bun-binary-io.js"), ...args]); }
function atomicJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(value) + "\n", { mode: 0o600 }); fs.renameSync(tmp, file); }
  finally { fs.rmSync(tmp, { force: true }); }
}
function repair(input, stateRoot) {
  const target = fs.realpathSync(input), host = platform();
  if (!["darwin-arm64", "win32-x64", "linux-x64"].includes(host)) throw new Error(`当前平台 ${host} 暂不支持 CLI Patch`);
  const receiptFile = `${target}.zh-cn-repair.json`, backup = `${target}.zh-cn-backup`;
  const currentHash = hash(target), patchRevision = revision();
  const pendingFile = `${receiptFile}.pending`, pending = readJson(pendingFile);
  const receipt = pending?.patchedHash === currentHash ? pending : readJson(receiptFile);
  fs.mkdirSync(stateRoot, { recursive: true });
  function marker(result) {
    const support = readJson(path.join(root, "support-window.json"));
    const verified = Object.values(support || {}).some(e => e.platform === host && e.versions?.includes(result.version));
    const value = `native|${result.version}|${result.patchedHash}|${patchRevision}` + (verified ? "" : `|provisional|${host}|${result.sourceHash}`);
    fs.writeFileSync(path.join(stateRoot, ".patched-version"), value + "\n");
    return { ...result, mode: verified ? "verified" : "provisional" };
  }
  if (receipt?.patchedHash === currentHash && receipt.revision === patchRevision) return marker({ ...receipt, changed: false });
  const lock = `${target}.zh-cn-lock`;
  const deadline = Date.now() + 30000;
  for (;;) {
    try { fs.mkdirSync(lock); break; } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let owner = "";
      try { owner = fs.readFileSync(path.join(lock, "pid"), "utf8"); } catch {}
      const pid = Number(owner.split(":")[0]);
      let dead = false;
      if (Number.isSafeInteger(pid) && pid > 0) {
        try { process.kill(pid, 0); } catch (e) { dead = e.code === "ESRCH"; }
      }
      if (dead) {
        // 清理者也互斥，且取得清理权后重新核对 owner，避免删掉新持有者的锁。
        const reaping = path.join(lock, "reaping");
        try {
          fs.mkdirSync(reaping);
          try {
            if (fs.readFileSync(path.join(lock, "pid"), "utf8") === owner) fs.rmSync(lock, { recursive: true });
          } finally { fs.rmSync(reaping, { recursive: true, force: true }); }
        } catch (e) { if (!["EEXIST", "ENOENT"].includes(e.code)) throw e; }
      }
      if (!fs.existsSync(lock)) return repair(input, stateRoot);
      if (Date.now() >= deadline) throw new Error(`另一个汉化进程占用修复锁：${lock}；本次未改动程序`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  let work;
  try {
    fs.writeFileSync(path.join(lock, "pid"), `${process.pid}:${crypto.randomUUID()}`);
    if (hash(target) !== currentHash || fs.realpathSync(input) !== target) throw new Error("CC 在检查期间已更新，请再次启动");
    // 只有文件指纹和备份指纹同时匹配，才从备份重新应用新规则。
    const source = receipt?.patchedHash === currentHash && fs.existsSync(backup) && receipt.sourceHash === hash(backup) ? backup : target;
    const sourceHash = hash(source);
    work = fs.mkdtempSync(path.join(path.dirname(target), ".zh-cn-prelaunch-"));
    const candidate = path.join(work, host === "win32-x64" ? "claude.exe" : "claude");
    const pristine = path.join(work, "source");
    fs.copyFileSync(source, pristine);
    if (hash(pristine) !== sourceHash) throw new Error("CC 在复制期间已更新，请再次启动");
    fs.copyFileSync(pristine, candidate);
    fs.chmodSync(candidate, fs.statSync(target).mode);
    const version = io("version", candidate);
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("无法识别 CC 版本，未改动程序");
    const layout = io("probe", candidate);
    let patched;
    if (layout === "bytecode") {
      patched = Number(run(process.execPath, [path.join(root, "scripts/patch-bytecode.js"), "patch", candidate, path.join(root, "cli-translations.json")]));
    } else if (layout === "source-js") {
      const js = path.join(work, "cli.js");
      io("extract", candidate, js);
      patched = Number(process.platform === "win32"
        ? run(process.execPath, [path.join(root, "patch-cli.js"), js, path.join(root, "cli-translations.json")])
        : run("bash", [path.join(root, "patch-cli.sh"), js, "--status", path.join(work, "patch-status")]));
      if (patched > 0) io("repack", candidate, js);
    } else throw new Error("新版程序结构尚未适配，未改动程序");
    if (!Number.isFinite(patched) || patched <= 0) throw new Error("没有命中可验证的译文，未改动程序");
    const isolatedHome = path.join(work, "home");
    fs.mkdirSync(isolatedHome);
    const env = { ...process.env, HOME: isolatedHome, USERPROFILE: isolatedHome, CLAUDE_CONFIG_DIR: path.join(isolatedHome, ".claude"), DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1", ZH_CN_PRELAUNCH: "1" };
    if (run(candidate, ["--version"], env).match(/\d+\.\d+\.\d+/)?.[0] !== version) throw new Error("汉化副本启动自检失败，未改动程序");
    if (!/[\u3400-\u9fff]/u.test(run(candidate, ["--help"], env))) throw new Error("汉化副本帮助界面未出现中文，未改动程序");
    const result = { version, sourceHash, patchedHash: hash(candidate), revision: patchRevision, patched, changed: true };
    if (hash(target) !== currentHash || fs.realpathSync(input) !== target) throw new Error("CC 在验证期间已更新，请再次启动");
    if (source === target) {
      const saved = path.join(work, "backup");
      fs.copyFileSync(pristine, saved);
      fs.renameSync(saved, backup);
    }
    atomicJson(pendingFile, result);
    if (hash(target) !== currentHash || fs.realpathSync(input) !== target) throw new Error("CC 在提交前已更新，请再次启动");
    // Windows 的文件占用错误由系统返回；绝不 unlink 正在运行的程序。
    try {
      if (process.platform === "win32") require("../bun-binary-io.js").withWindowsFileRetry(() => fs.renameSync(candidate, target));
      else fs.renameSync(candidate, target);
    } catch (error) {
      throw new Error(`无法替换 CC 程序（${error.code}）；请关闭占用它的窗口后再次启动，无需重装插件`);
    }
    atomicJson(receiptFile, result);
    fs.rmSync(pendingFile, { force: true });
    return marker(result);
  } finally {
    if (work) fs.rmSync(work, { recursive: true, force: true });
    fs.rmSync(lock, { recursive: true, force: true });
  }
}
module.exports = { repair, hash, revision, platform };
if (require.main === module) {
  try {
    const result = repair(process.argv[2], process.argv[3] || process.env.CLAUDE_PLUGIN_DATA || root);
    process.stdout.write(JSON.stringify(result) + "\n");
  } catch (error) { process.stderr.write(`汉化未完成：${error.message}\n`); process.exitCode = 1; }
}
