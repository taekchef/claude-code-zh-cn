'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const sessionStart = path.join(repoRoot, 'plugin', 'hooks', 'session-start');

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cczh-auto-update-${name}-`));
}

function writeFile(file, content, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, mode === undefined ? undefined : { mode });
}

function makeFakeCurl(binDir) {
  const file = path.join(binDir, 'curl');
  writeFile(file, `#!/usr/bin/env bash
set -euo pipefail
url=""
out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o|--output)
      out="$2"
      shift 2
      ;;
    -H|--header)
      shift 2
      ;;
    -*)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done
printf '%s\n' "$url" >> "$FAKE_CURL_LOG"
case "$url" in
  */releases/latest)
    printf '{"tag_name":"v2.0.0"}'
    ;;
  *)
    echo "unexpected fake curl url: $url" >&2
    exit 44
    ;;
esac
`, 0o755);
}

function makePluginRoot(baseDir, sourceRepo) {
  const pluginRoot = path.join(baseDir, 'plugin');
  writeFile(path.join(pluginRoot, 'manifest.json'), '{"version":"1.0.0"}\n');
  writeFile(path.join(pluginRoot, '.source-repo'), `${sourceRepo}\n`);
  writeFile(path.join(pluginRoot, 'compute-patch-revision.sh'), 'compute_patch_revision() { printf fake-local-rev; }\n');
  writeFile(path.join(pluginRoot, 'bun-binary-io.js'), 'process.exit(0)\n');
  return pluginRoot;
}

function makeEnv(baseDir, pluginRoot) {
  const fakeBin = path.join(baseDir, 'bin');
  fs.mkdirSync(fakeBin, { recursive: true });
  makeFakeCurl(fakeBin);

  const home = path.join(baseDir, 'home');
  const tmp = path.join(baseDir, 'tmp');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });

  return {
    ...process.env,
    HOME: home,
    TMPDIR: tmp,
    PATH: [fakeBin, process.env.PATH].filter(Boolean).join(':'),
    CLAUDE_PLUGIN_ROOT: pluginRoot,
    ZH_CN_UPDATE_CHECK_INTERVAL_SECONDS: '0',
    ZH_CN_LAUNCHER_BIN_DIR: path.join(baseDir, 'missing-launcher-bin'),
    FAKE_CURL_LOG: path.join(baseDir, 'curl.log'),
  };
}

function runSessionStart(env) {
  return spawnSync('bash', [sessionStart], {
    cwd: repoRoot,
    env,
    input: '{}\n',
    encoding: 'utf8',
  });
}

test('SessionStart announces a remote release without replacing a standalone install', () => {
  const baseDir = tempDir('slug');
  const pluginRoot = makePluginRoot(baseDir, 'local/fake-repo');
  const env = makeEnv(baseDir, pluginRoot);

  const result = runSessionStart(env);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const curlLog = fs.readFileSync(env.FAKE_CURL_LOG, 'utf8');
  assert.match(curlLog, /api\.github\.com\/repos\/local\/fake-repo\/releases\/latest/);
  assert.doesNotMatch(curlLog, /\/commits\/|\/tarball\//);
  assert.equal(fs.readFileSync(path.join(pluginRoot, 'manifest.json'), 'utf8').trim(), '{"version":"1.0.0"}');
  assert.equal(fs.readFileSync(path.join(pluginRoot, '.source-repo'), 'utf8').trim(), 'local/fake-repo');
  assert.match(fs.readFileSync(path.join(pluginRoot, '.last-update-status'), 'utf8'), /^available v2\.0\.0 /);
  assert.match(result.stdout, /检测到插件 v2\.0\.0.*本次未自动安装/);
});

test('SessionStart keeps unsupported .source-repo values out of remote auto-update', () => {
  const baseDir = tempDir('unsupported-source');
  const pluginRoot = makePluginRoot(baseDir, 'not a repo slug');
  const env = makeEnv(baseDir, pluginRoot);

  const result = runSessionStart(env);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(env.FAKE_CURL_LOG), false, 'unsupported .source-repo must not call GitHub');
  assert.equal(fs.readFileSync(path.join(pluginRoot, 'manifest.json'), 'utf8').trim(), '{"version":"1.0.0"}');
});
