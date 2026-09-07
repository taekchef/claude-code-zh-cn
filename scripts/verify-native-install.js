#!/usr/bin/env node
"use strict";

// 在独立用户目录和官方程序副本上检查完整安装、诊断、重复安装、卸载。
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { execFileSync, execSync } = require("node:child_process");
const repo = path.resolve(__dirname, "..");
const source = process.argv[2];
if (!source) throw new Error("Usage: node scripts/verify-native-install.js <official-binary>");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-real-install-"));
const home = path.join(tmp, "home");
const bin = path.join(tmp, "bin with spaces");
const windows = process.platform === "win32";
const target = path.join(bin, windows ? "claude.exe" : "claude");
const plugin = path.join(home, ".claude", "plugins", "claude-code-zh-cn");
fs.mkdirSync(bin, { recursive: true });
fs.mkdirSync(home, { recursive: true });
fs.copyFileSync(source, target);
fs.chmodSync(target, 0o755);
const env = {
  ...process.env, HOME: home, USERPROFILE: home,
  // Keep the machine dependency prefix while isolating user settings on Windows.
  NPM_CONFIG_PREFIX: execSync("npm prefix -g", { encoding: "utf8" }).trim(),
  CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
  XDG_CONFIG_HOME: path.join(home, ".config"),
  XDG_CACHE_HOME: path.join(home, ".cache"),
  XDG_DATA_HOME: path.join(home, ".local", "share"),
  APPDATA: path.join(home, "AppData", "Roaming"),
  LOCALAPPDATA: path.join(home, "AppData", "Local"),
  PATH: bin + path.delimiter + process.env.PATH,
  CLAUDE_PLUGIN_ROOT: plugin, ZH_CN_REAL_CLAUDE: target,
  ZH_CN_LAUNCHER_BIN_DIR: path.join(home, ".claude", "bin"),
  ZH_CN_PROFILE_FILES: path.join(home, ".profile"),
  ZH_CN_SKIP_USER_PATH_UPDATE: "1", ZH_CN_SKIP_BANNER: "1",
  ZH_CN_MARKETPLACE_SOURCE: repo, CI: "1", NO_COLOR: "1",
  DISABLE_AUTOUPDATER: "1", CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
};
const run = (command, args) => execFileSync(command, args, {
  cwd: repo, env, encoding: "utf8", timeout: 180000,
  maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
});
const hash = () => crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex");
const installer = action => windows
  ? run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(repo, `${action}.ps1`), "-SkipBanner"])
  : run("bash", [path.join(repo, `${action}.sh`)]);
try {
  const original = hash();
  installer("install");
  const patched = hash();
  assert.notEqual(patched, original, "installer must modify the official executable");
  const doctor = JSON.parse(run(process.execPath, [path.join(repo, "scripts", "zh-cn-doctor.js"), "--json"]));
  assert.ok(["ok", "provisional"].includes(doctor.layer4Status), JSON.stringify(doctor));
  assert.match(run(target, ["--help"]), /[\u3400-\u9fff]/u);
  installer("install");
  assert.equal(hash(), patched, "reinstall must produce the same executable");
  installer("uninstall");
  assert.equal(hash(), original, "uninstall must restore the exact original bytes");
  assert.equal(fs.existsSync(target + ".zh-cn-backup"), false);
  assert.equal(fs.existsSync(plugin), false);
  process.stdout.write(JSON.stringify({ install: "ok", doctor: "ok", reinstall: "ok", uninstall: "ok" }) + "\n");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
