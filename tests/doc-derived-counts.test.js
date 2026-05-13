const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const syncScript = path.join(repoRoot, "scripts", "sync-doc-derived-counts.js");

function runSync(args) {
  return spawnSync("node", [syncScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function copyDocFixtures() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cczh-doc-counts-"));
  const files = ["README.md", "AGENTS.md", "CLAUDE.md"].map((name) => {
    const target = path.join(tmpDir, name);
    fs.copyFileSync(path.join(repoRoot, name), target);
    return target;
  });
  return { tmpDir, files };
}

function makeStale(filePath) {
  let text = fs.readFileSync(filePath, "utf8");
  for (const [pattern, replacement] of [
    [/(\d+)( 个趣味 spinner 动词)/g, `777777$2`],
    [/(\d+)( 条中文提示)/g, `666666$2`],
    [/(\d+)( 个翻译见 \[verbs\/zh-CN\.json\])/g, `777777$2`],
    [/(\d+)( 个 \| `spinnerVerbs` \|)/g, `777777$2`],
    [/(\d+)( 条 \| `spinnerTipsOverride` \|)/g, `666666$2`],
    [/(\d+)( 条 UI 翻译对照表)/g, `999999$2`],
    [/(\d+)( 条翻译；当前 stable 代表版本)/g, `999999$2`],
    [/(\| UI 文字中文化 \| )\d+( 条翻译)/g, `$1999999$2`],
    [/(` 实测 )\d+( 处有效 patch)/g, `$1888888$2`],
    [/(\d+)( spinner verbs,)/g, `777777$2`],
    [/(\d+)( spinner tips,)/g, `666666$2`],
    [/(\d+)( UI translations,)/g, `999999$2`],
    [/(\d+)( 个 spinner 动词翻译)/g, `777777$2`],
    [/(\d+)( 条 spinner 提示翻译)/g, `666666$2`],
  ]) {
    text = text.replace(pattern, replacement);
  }
  fs.writeFileSync(filePath, text);
}

function makeNativeStale(filePath) {
  let text = fs.readFileSync(filePath, "utf8");
  for (const [pattern, replacement] of [
    [/2\.1\.113--2\.1\.133/g, "9.9.113--9.9.133"],
    [/2\.1\.113 - 2\.1\.133/g, "9.9.113 - 9.9.133"],
    [/2\.1\.116 - 2\.1\.123/g, "9.9.116 - 9.9.123"],
    [/2\.1\.133/g, "9.9.133"],
    [/2\.1\.115/g, "9.9.115"],
    [/1321-1358/g, "1-2"],
    [/11\/11/g, "3/4"],
    [/11 个稳定显示面/g, "4 个稳定显示面"],
    [/2\.1\.113` through `2\.1\.133` except unsupported `2\.1\.115`, `2\.1\.124`, `2\.1\.125`, `2\.1\.126`, `2\.1\.127`, `2\.1\.128`, `2\.1\.129`, `2\.1\.130`, `2\.1\.131`, `2\.1\.132`/g, "9.9.113` through `9.9.133` except unsupported `9.9.115`"],
  ]) {
    text = text.replace(pattern, replacement);
  }
  fs.writeFileSync(filePath, text);
}

test("doc-derived count sync passes current README, AGENTS, and CLAUDE docs", () => {
  assert.equal(fs.existsSync(syncScript), true, "missing scripts/sync-doc-derived-counts.js");

  const result = runSync(["--check"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /doc derived counts OK/);
});

test("doc-derived count sync fails stale docs in check mode", () => {
  const { files } = copyDocFixtures();
  for (const file of files) {
    makeStale(file);
  }

  const result = runSync(["--check", ...files]);

  assert.equal(result.status, 1, "stale docs should fail the guard");
  assert.match(result.stderr, /run `node scripts\/sync-doc-derived-counts\.js --write`/);
});

test("doc-derived count sync rewrites stale docs from source files", () => {
  const { files } = copyDocFixtures();
  for (const file of files) {
    makeStale(file);
  }

  const writeResult = runSync(["--write", ...files]);
  assert.equal(writeResult.status, 0, writeResult.stderr || writeResult.stdout);

  const checkResult = runSync(["--check", ...files]);
  assert.equal(checkResult.status, 0, checkResult.stderr || checkResult.stdout);

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(text, /999999 条 UI 翻译/);
    assert.doesNotMatch(text, /888888 处有效 patch/);
    assert.doesNotMatch(text, /777777 个 spinner 动词/);
    assert.doesNotMatch(text, /666666 条 spinner 提示/);
  }
});

test("doc-derived count sync rewrites README native support facts from config and matrix", () => {
  const { files } = copyDocFixtures();
  const readme = files.find((file) => path.basename(file) === "README.md");
  makeNativeStale(readme);

  const staleResult = runSync(["--check", readme]);
  assert.equal(staleResult.status, 1, "stale native README facts should fail the guard");

  const writeResult = runSync(["--write", readme]);
  assert.equal(writeResult.status, 0, writeResult.stderr || writeResult.stdout);

  const checkResult = runSync(["--check", readme]);
  assert.equal(checkResult.status, 0, checkResult.stderr || checkResult.stdout);

  const text = fs.readFileSync(readme, "utf8");
  assert.match(text, /macos%20native-2\.1\.113--2\.1\.140%20experimental/);
  assert.match(text, /2\.1\.113 - 2\.1\.140/);
  assert.match(text, /不含未纳入本轮支持的 `2\.1\.115`、`2\.1\.125`/);
  assert.match(text, /`2\.1\.113 - 2\.1\.114`、`2\.1\.116 - 2\.1\.124`/);
  assert.match(text, /`2\.1\.136 - 2\.1\.140`/);
  assert.match(text, /1322-1358 处/);
  assert.match(text, /显示审计 11\/11 PASS/);
  assert.match(text, /11 个稳定显示面/);
  assert.match(text, /2\.1\.113` through `2\.1\.140` except unsupported `2\.1\.115`, `2\.1\.125`/);
  assert.doesNotMatch(text, /9\.9\.|1-2 处|3\/4|4 个稳定显示面/);
});
