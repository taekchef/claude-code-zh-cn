'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const fakeCommit = '0123456789abcdef0123456789abcdef01234567';

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cczh-${name}-`));
}

function writeFile(file, content, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, mode === undefined ? undefined : { mode });
}

function makeFakeCurl(binDir) {
  const file = path.join(binDir, 'curl');
  writeFile(file, `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_CURL_ARGV_LOG"
url=""
out=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o|--output)
      out="$2"
      shift 2
      ;;
    -H|--header)
      if [ "$2" = "@-" ]; then cat >> "$FAKE_CURL_HEADERS_LOG"; fi
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
    printf '{"tag_name":"v-from-latest"}'
    ;;
  */commits/*)
    printf '{"sha":"%s"}' "$FAKE_COMMIT"
    ;;
  */tarball/*)
    if [ -z "$out" ]; then
      cat "$FAKE_TARBALL"
    else
      cp "$FAKE_TARBALL" "$out"
    fi
    ;;
  *)
    echo "unexpected fake curl url: $url" >&2
    exit 44
    ;;
esac
`, 0o755);
}

function makeRemoteScript(kind) {
  return `#!/usr/bin/env bash
set -euo pipefail
{
  echo "script=${kind}"
  echo "pwd=$(pwd)"
  echo "repo=\${ZH_CN_SOURCE_REPO:-}"
  echo "marketplace_source=\${ZH_CN_MARKETPLACE_SOURCE:-}"
  echo "ref=\${CCZH_INSTALLED_REF:-}"
  echo "commit=\${CCZH_INSTALLED_COMMIT:-}"
  printf 'args=%s\n' "$*"
} >> "$TEST_REMOTE_MARKER"
`;
}

function makeNestedScript() {
  return `#!/usr/bin/env bash
set -euo pipefail
printf 'nested executed\n' >> "$TEST_NESTED_MARKER"
`;
}

function packDirectory(tarball, parent, entry) {
  const result = spawnSync('tar', ['-czf', tarball, '-C', parent, entry], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function makeSingleRootTarball(baseDir, kind) {
  const sourceParent = path.join(baseDir, 'src');
  const root = path.join(sourceParent, 'repo-root');
  const scriptName = `${kind}.sh`;
  writeFile(path.join(root, scriptName), makeRemoteScript(kind), 0o644);
  fs.mkdirSync(path.join(root, 'plugin'), { recursive: true });
  writeFile(path.join(root, 'nested', scriptName), makeNestedScript(), 0o644);
  const tarball = path.join(baseDir, `${kind}.tar.gz`);
  packDirectory(tarball, sourceParent, 'repo-root');
  return tarball;
}

function makeTwoRootTarball(baseDir) {
  const sourceParent = path.join(baseDir, 'bad-src');
  writeFile(path.join(sourceParent, 'repo-a', 'install.sh'), makeRemoteScript('install'), 0o644);
  writeFile(path.join(sourceParent, 'repo-b', 'install.sh'), makeRemoteScript('install'), 0o644);
  const tarball = path.join(baseDir, 'two-roots.tar.gz');
  const result = spawnSync('tar', ['-czf', tarball, '-C', sourceParent, 'repo-a', 'repo-b'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return tarball;
}

function makeEnv(baseDir, tarball, extra = {}) {
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
    PATH: [fakeBin, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'),
    CCZH_REPO: 'local/fake-repo',
    FAKE_COMMIT: fakeCommit,
    FAKE_TARBALL: tarball,
    FAKE_CURL_LOG: path.join(baseDir, 'curl.log'),
    FAKE_CURL_ARGV_LOG: path.join(baseDir, 'curl-argv.log'),
    FAKE_CURL_HEADERS_LOG: path.join(baseDir, 'curl-headers.log'),
    TEST_REMOTE_MARKER: path.join(baseDir, 'remote.marker'),
    TEST_NESTED_MARKER: path.join(baseDir, 'nested.marker'),
    ...extra,
  };
}

function runRemoteScript(scriptName, env, args = []) {
  return spawnSync('bash', [path.join(repoRoot, scriptName), ...args], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
}

test('release asset placeholder replacement leaves no embedded placeholders', () => {
  const baseDir = tempDir('placeholders');
  const replacements = {
    __CCZH_RELEASE_TAG__: 'v9.9.9',
    __CCZH_RELEASE_COMMIT__: fakeCommit,
  };

  for (const scriptName of ['install-remote.sh', 'uninstall-remote.sh']) {
    let content = fs.readFileSync(path.join(repoRoot, scriptName), 'utf8');
    for (const [placeholder, value] of Object.entries(replacements)) {
      content = content.split(placeholder).join(value);
    }

    assert.equal(content.includes('__CCZH_RELEASE_'), false, `${scriptName} still contains a release placeholder`);
    const renderedScript = path.join(baseDir, scriptName);
    writeFile(renderedScript, content, 0o755);

    const syntax = spawnSync('bash', ['-n', renderedScript], { encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr || syntax.stdout);
  }
});

test('install-remote uses fake repo tarball, records source metadata, and only runs root installer', () => {
  const baseDir = tempDir('install');
  const tarball = makeSingleRootTarball(baseDir, 'install');
  const pluginRoot = path.join(baseDir, 'plugin');
  const env = makeEnv(baseDir, tarball, {
    CCZH_REF: 'v-test-install',
    CLAUDE_PLUGIN_ROOT: pluginRoot,
  });

  const result = runRemoteScript('install-remote.sh', env, ['--dry-run-for-test']);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const marker = fs.readFileSync(env.TEST_REMOTE_MARKER, 'utf8');
  assert.match(marker, /script=install/);
  assert.match(marker, /repo=local\/fake-repo/);
  assert.match(marker, /marketplace_source=.+repo-root/);
  assert.match(marker, /ref=v-test-install/);
  assert.match(marker, new RegExp(`commit=${fakeCommit}`));
  assert.match(marker, /args=--dry-run-for-test/);
  assert.equal(fs.existsSync(env.TEST_NESTED_MARKER), false, 'nested install.sh must not be executed');
  assert.equal(fs.readFileSync(path.join(pluginRoot, '.installed-ref'), 'utf8').trim(), 'v-test-install');
  assert.equal(fs.readFileSync(path.join(pluginRoot, '.installed-commit'), 'utf8').trim(), fakeCommit);

  const curlLog = fs.readFileSync(env.FAKE_CURL_LOG, 'utf8');
  assert.match(curlLog, /\/commits\/v-test-install/);
  assert.match(curlLog, new RegExp(`/tarball/${fakeCommit}`));
  assert.doesNotMatch(curlLog, /github\.com\/(?!repos\/local\/fake-repo)/);
});

test('remote scripts send GitHub tokens through header stdin, not process arguments', () => {
  for (const kind of ['install', 'uninstall']) {
    const baseDir = tempDir(`token-${kind}`);
    const tarball = makeSingleRootTarball(baseDir, kind);
    const pluginRoot = path.join(baseDir, 'plugin-root');
    if (kind === 'uninstall') {
      writeFile(path.join(pluginRoot, '.installed-ref'), 'v-token\n');
      writeFile(path.join(pluginRoot, '.installed-commit'), `${fakeCommit}\n`);
    }
    const env = makeEnv(baseDir, tarball, {
      CCZH_REF: 'v-token',
      CLAUDE_PLUGIN_ROOT: pluginRoot,
      GITHUB_TOKEN: 'top-secret-token',
    });
    const result = runRemoteScript(`${kind}-remote.sh`, env);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.doesNotMatch(fs.readFileSync(env.FAKE_CURL_ARGV_LOG, 'utf8'), /top-secret-token/);
    assert.match(fs.readFileSync(env.FAKE_CURL_HEADERS_LOG, 'utf8'), /Authorization: Bearer top-secret-token/);
  }
});

test('install-remote rejects tarballs that do not extract to exactly one top-level directory', () => {
  const baseDir = tempDir('bad-tarball');
  const tarball = makeTwoRootTarball(baseDir);
  const env = makeEnv(baseDir, tarball, { CCZH_REF: 'v-bad-archive' });

  const result = runRemoteScript('install-remote.sh', env);
  assert.notEqual(result.status, 0, 'bad archive should fail');
  assert.match(result.stderr + result.stdout, /expected exactly one top-level directory/);
  assert.equal(fs.existsSync(env.TEST_REMOTE_MARKER), false, 'installer must not run after archive structure validation fails');
});

test('uninstall-remote prefers recorded ref, commit, and patch target over latest release', () => {
  const baseDir = tempDir('uninstall');
  const tarball = makeSingleRootTarball(baseDir, 'uninstall');
  const pluginRoot = path.join(baseDir, 'plugin');
  const patchedTarget = path.join(baseDir, 'patched-cli.js');
  writeFile(path.join(pluginRoot, '.installed-ref'), 'v-recorded\n');
  writeFile(path.join(pluginRoot, '.installed-commit'), `${fakeCommit}\n`);
  writeFile(path.join(pluginRoot, '.patched-target'), `${patchedTarget}\n`);
  writeFile(path.join(pluginRoot, '.patched-kind'), 'npm\n');
  writeFile(patchedTarget, 'patched');
  writeFile(`${patchedTarget}.zh-cn-backup`, 'original');

  const env = makeEnv(baseDir, tarball, {
    CLAUDE_PLUGIN_ROOT: pluginRoot,
  });

  const result = runRemoteScript('uninstall-remote.sh', env, ['--yes']);
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const marker = fs.readFileSync(env.TEST_REMOTE_MARKER, 'utf8');
  assert.match(marker, /script=uninstall/);
  assert.match(marker, /ref=v-recorded/);
  assert.match(marker, new RegExp(`commit=${fakeCommit}`));
  assert.match(marker, /args=--yes/);
  assert.equal(fs.readFileSync(patchedTarget, 'utf8'), 'original');
  assert.equal(fs.existsSync(`${patchedTarget}.zh-cn-backup`), false);

  const curlLog = fs.readFileSync(env.FAKE_CURL_LOG, 'utf8');
  assert.match(curlLog, new RegExp(`/tarball/${fakeCommit}`));
  assert.doesNotMatch(curlLog, /\/releases\/latest/);
  assert.doesNotMatch(curlLog, /\/commits\//);
});
