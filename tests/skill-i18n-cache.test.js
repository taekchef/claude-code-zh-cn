const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cache = require("../plugin/skill-i18n/lib/cache");

function tmpCacheFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-cache-"));
  return path.join(dir, "translations.json");
}

test("hashKey: 大小写与首尾空格归一化（同一译文命中同 key）", () => {
  assert.equal(cache.hashKey("Hello World"), cache.hashKey(" hello world "));
  assert.equal(cache.hashKey("Hello"), cache.hashKey("hello"));
  assert.notEqual(cache.hashKey("Hello"), cache.hashKey("World"));
});

test("load: 不存在的文件 → 空缓存", () => {
  assert.deepEqual(cache.load("/nonexistent/path/translations.json"), { version: 1, entries: {} });
});

test("load: 损坏 JSON → 空缓存（不抛，不阻断流程）", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-cache-"));
  const f = path.join(dir, "translations.json");
  fs.writeFileSync(f, "{not valid json");
  assert.deepEqual(cache.load(f), { version: 1, entries: {} });
});

test("put + lookup + save + load 往返无损", () => {
  const f = tmpCacheFile();
  const data = cache.load(f);
  cache.put(data, "Hello.", "你好。", "claude");
  assert.equal(cache.lookup(data, "Hello."), "你好。");
  assert.equal(cache.lookup(data, "Missing."), null);
  cache.save(f, data);

  const reloaded = cache.load(f);
  assert.equal(cache.lookup(reloaded, "Hello."), "你好。");
  assert.equal(reloaded.entries[cache.hashKey("Hello.")].provider, "claude");
});

test("save: 不传 cacheFile 不抛（缓存可选）", () => {
  cache.save("", { version: 1, entries: {} }); // 不抛即过
  cache.save(undefined, { version: 1, entries: {} });
});

test("lookup: 大小写差异命中同一条", () => {
  const f = tmpCacheFile();
  const data = cache.load(f);
  cache.put(data, "Refactor function", "重构函数", "claude");
  cache.save(f, data);
  assert.equal(cache.lookup(cache.load(f), "refactor FUNCTION"), "重构函数");
});

test("save: 超过上限时淘汰最旧条目（防无限膨胀）", () => {
  const f = tmpCacheFile();
  const data = cache.load(f);
  const cap = cache.MAX_ENTRIES;
  for (let i = 0; i < cap + 100; i++) cache.put(data, `desc number ${i}`, `译 ${i}`, "claude");
  cache.save(f, data);
  const count = Object.keys(cache.load(f).entries).length;
  assert.ok(count <= cap, `应不超过上限 ${cap}，实际 ${count}`);
  assert.ok(count >= cap * 0.85, `应保留约 90%，实际 ${count}`);
});
