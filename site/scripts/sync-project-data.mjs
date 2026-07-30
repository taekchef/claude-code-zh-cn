import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const [manifest, translations, verbs, tips] = await Promise.all([
  readJson("../plugin/manifest.json"),
  readJson("../cli-translations.json"),
  readJson("../verbs/zh-CN.json"),
  readJson("../tips/zh-CN.json"),
]);

assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.ok(Array.isArray(translations));
assert.ok(Array.isArray(verbs.verbs));
assert.ok(Array.isArray(tips.tips));

const data = {
  version: manifest.version,
  uiTranslations: translations.length,
  spinnerVerbs: verbs.verbs.length,
  spinnerTips: tips.tips.length,
};

await writeFile("app/project-data.json", `${JSON.stringify(data, null, 2)}\n`);
console.log(JSON.stringify(data));
