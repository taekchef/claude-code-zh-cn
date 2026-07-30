import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the official Chinese product site", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /Claude Code 中文本地化/);
  assert.match(html, /让终端里的/);
  assert.match(html, /为什么做这个/);
  assert.match(html, /真实 Ghostty 录制/);
  assert.match(html, /翻不了的部分保持英文/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|Your site is taking shape/);
});

test("ships the real demo and social preview assets", async () => {
  const demoUrl = new URL("../public/claude-code-zh-cn-demo.gif", import.meta.url);
  const previewUrl = new URL("../public/github-social-preview.png", import.meta.url);
  const [demo, preview, demoStat, previewStat] = await Promise.all([
    readFile(demoUrl),
    readFile(previewUrl),
    stat(demoUrl),
    stat(previewUrl),
  ]);

  assert.equal(demo.subarray(0, 6).toString("ascii"), "GIF89a");
  assert.deepEqual([...preview.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(demoStat.size > 3_000_000);
  assert.ok(previewStat.size > 90_000);
});
