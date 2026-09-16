const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const unix = process.platform === 'win32' ? '真实 Windows exe 由 native CI 验证' : false;
function fixture(t) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cczh-prelaunch-test-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const root = path.join(tmp, 'plugin'), target = path.join(tmp, 'claude'), state = path.join(tmp, 'state');
  fs.cpSync(path.join(repo, 'plugin'), root, { recursive: true });
  fs.writeFileSync(path.join(root, 'bun-binary-io.js'), `
const fs=require('fs');
const [cmd,file,out]=process.argv.slice(2);
if(cmd==='detect') process.stdout.write('native-bun:'+fs.realpathSync(file));
else if(cmd==='version') process.stdout.write(fs.readFileSync(file,'utf8').match(/# version (\\S+)/)[1]);
else if(cmd==='probe') process.stdout.write('source-js');
else if(cmd==='extract') fs.copyFileSync(file,out);
else if(cmd==='repack') {fs.copyFileSync(out,file); if(process.env.TEST_UPDATE_TARGET) fs.writeFileSync(process.env.TEST_UPDATE_TARGET, 'upstream update');}
else process.exit(1);
`);
  fs.writeFileSync(path.join(root, 'patch-cli.sh'), `#!/usr/bin/env bash
node - "$1" <<'JS'
const fs=require('fs'),p=process.argv[2];
let s=fs.readFileSync(p,'utf8');
if(process.env.TEST_BAD_CANDIDATE) s='#!/usr/bin/env bash\\nexit 33\\n';
else s=s.replace('English help','中文帮助');
fs.writeFileSync(p,s); process.stdout.write('1');
JS
`);
  const original = version => `#!/usr/bin/env bash\n# version ${version}\nif [ "$1" = "--version" ]; then echo '${version} (Claude Code)'; else echo 'English help'; fi\n`;
  fs.writeFileSync(target, original('9.0.0'), { mode: 0o755 });
  const env = { ...process.env, HOME: tmp, CLAUDE_CONFIG_DIR: path.join(tmp, '.claude'), CLAUDE_PLUGIN_ROOT: root, ZH_CN_NATIVE_PLATFORM: 'linux-x64', ZH_CN_DISABLE_AUTO_UPDATE: '1' };
  const run = extra => spawnSync(process.execPath, [path.join(root, 'scripts/native-repair.js'), target, state], { env: {...env, ...extra}, encoding: 'utf8', timeout: 45000 });
  return { tmp, root, target, state, original, env, run };
}
test('native prelaunch validates an unlisted version, caches by bytes, and repairs a same-version reinstall', { skip: unix }, t => {
  const f = fixture(t);
  const first = f.run();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).mode, 'provisional');
  assert.match(fs.readFileSync(f.target, 'utf8'), /中文帮助/);
  const inode = fs.statSync(f.target).ino;
  assert.equal(JSON.parse(f.run().stdout).changed, false);
  assert.equal(fs.statSync(f.target).ino, inode);
  const rebuilt = f.original('9.0.0') + '# different build, same version\n';
  fs.writeFileSync(f.target, rebuilt);
  assert.equal(f.run().status, 0);
  assert.equal(fs.readFileSync(f.target + '.zh-cn-backup', 'utf8'), rebuilt);
  assert.match(fs.readFileSync(f.target, 'utf8'), /different build/);
  fs.writeFileSync(f.target, f.original('9.0.1'));
  assert.equal(f.run().status, 0);
  assert.match(fs.readFileSync(f.target, 'utf8'), /9\.0\.1/);
});
test('failed candidate and concurrent upstream update never overwrite the original', { skip: unix }, t => {
  const f = fixture(t), original = fs.readFileSync(f.target, 'utf8');
  assert.notEqual(f.run({ TEST_BAD_CANDIDATE: '1' }).status, 0);
  assert.equal(fs.readFileSync(f.target, 'utf8'), original);
  assert.equal(fs.existsSync(f.target + '.zh-cn-repair.json'), false);
  assert.notEqual(f.run({ TEST_UPDATE_TARGET: f.target }).status, 0);
  assert.equal(fs.readFileSync(f.target, 'utf8'), 'upstream update');
  assert.equal(fs.existsSync(f.target + '.zh-cn-lock'), false);
});
test('busy repair is reported without stealing its lock', { skip: unix }, t => {
  const f = fixture(t), original = fs.readFileSync(f.target, 'utf8');
  fs.mkdirSync(f.target + '.zh-cn-lock');
  fs.writeFileSync(path.join(f.target + '.zh-cn-lock', 'pid'), String(process.pid));
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /占用修复锁/);
  assert.equal(fs.readFileSync(f.target, 'utf8'), original);
  assert.equal(fs.existsSync(f.target + '.zh-cn-lock'), true);
});
test('installed launcher follows the marketplace install record on the next launch and respects disabling', { skip: unix }, t => {
  const f = fixture(t), bin = path.join(f.tmp, 'entry'), config = path.join(f.tmp, '.claude');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(config, 'plugins'), { recursive: true });
  fs.copyFileSync(path.join(repo, 'plugin/bin/claude-launcher'), path.join(bin, 'claude'));
  fs.copyFileSync(path.join(repo, 'plugin/scripts/resolve-runtime.js'), path.join(bin, 'resolve-runtime.js'));
  const next = path.join(f.tmp, 'next-plugin');
  fs.cpSync(f.root, next, { recursive: true });
  fs.appendFileSync(path.join(next, 'patch-cli.sh'), '\n# new rules\n');
  const registry = root => fs.writeFileSync(path.join(config, 'plugins/installed_plugins.json'), JSON.stringify({version:2, plugins:{'claude-code-zh-cn@claude-code-zh-cn':[{scope:'user',installPath:root}]}}));
  const launch = () => spawnSync('bash', [path.join(bin, 'claude'), '--help'], {env:{...f.env, CLAUDE_PLUGIN_ROOT:'', ZH_CN_REAL_CLAUDE:f.target}, encoding:'utf8', timeout:30000});
  registry(f.root);
  const first = launch();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /中文帮助/);
  const oldRevision = JSON.parse(fs.readFileSync(f.target+'.zh-cn-repair.json')).revision;
  registry(next);
  const second = launch();
  assert.equal(second.status, 0, second.stderr);
  assert.notEqual(JSON.parse(fs.readFileSync(f.target+'.zh-cn-repair.json')).revision, oldRevision);
  fs.writeFileSync(path.join(config,'settings.json'), JSON.stringify({enabledPlugins:{'claude-code-zh-cn@claude-code-zh-cn':false}}));
  fs.writeFileSync(f.target, f.original('9.0.2'));
  const disabled = launch();
  assert.equal(disabled.status, 0);
  assert.match(disabled.stdout, /English help/);
});

test('a dead repair owner is reclaimed and does not require reinstalling', { skip: unix }, t => {
  const f = fixture(t);
  fs.mkdirSync(f.target + '.zh-cn-lock');
  fs.writeFileSync(path.join(f.target + '.zh-cn-lock', 'pid'), '99999999:dead');
  assert.equal(f.run().status, 0);
  assert.match(fs.readFileSync(f.target, 'utf8'), /中文帮助/);
});
test('standalone installation does not select an unconfirmed old marketplace payload', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cczh-resolver-'));
  t.after(() => fs.rmSync(tmp, {recursive:true,force:true}));
  const legacy = path.join(tmp,'plugins/claude-code-zh-cn');
  fs.mkdirSync(legacy,{recursive:true});
  fs.writeFileSync(path.join(legacy,'.official-fallback-disabled'),'standalone');
  fs.writeFileSync(path.join(tmp,'settings.json'),JSON.stringify({enabledPlugins:{'claude-code-zh-cn@claude-code-zh-cn':false}}));
  fs.writeFileSync(path.join(tmp,'plugins/installed_plugins.json'),JSON.stringify({plugins:{'claude-code-zh-cn@claude-code-zh-cn':[{scope:'user',installPath:'/old/plugin'}]}}));
  const result=spawnSync(process.execPath,[path.join(repo,'plugin/scripts/resolve-runtime.js')],{env:{...process.env,CLAUDE_CONFIG_DIR:tmp,CLAUDE_PLUGIN_ROOT:''},encoding:'utf8'});
  assert.equal(result.status,0);
  assert.equal(result.stdout,legacy);
});
test('uninstall preserves a same-version upstream reinstall instead of restoring an older build', {skip:unix}, t => {
  const f=fixture(t);
  assert.equal(f.run().status,0);
  const replacement=f.original('9.0.0')+'# upstream rebuilt\n';
  fs.writeFileSync(f.target,replacement);
  const {restoreBinary}=require('../scripts/patch-bytecode.js');
  assert.equal(restoreBinary(f.target).preservedCurrent,true);
  assert.equal(fs.readFileSync(f.target,'utf8'),replacement);
});
