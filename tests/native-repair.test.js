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
function version(file){
  const value=fs.readFileSync(file,'utf8').match(/# version (\\S+)/)[1];
  if(process.env.TEST_RESTORE_UPDATE_TARGET && file.endsWith('.zh-cn-backup')) fs.writeFileSync(process.env.TEST_RESTORE_UPDATE_TARGET, 'upstream update during restore');
  if(process.env.TEST_RESTORE_UPDATE_BACKUP && file.endsWith('.zh-cn-backup')) fs.appendFileSync(file, '# backup changed during restore\\n');
  if(process.env.TEST_RESTORE_RETARGET && file.endsWith('.zh-cn-backup')) {
    fs.unlinkSync(process.env.TEST_RESTORE_RETARGET);
    fs.symlinkSync(process.env.TEST_RESTORE_NEXT_TARGET, process.env.TEST_RESTORE_RETARGET);
  }
  return value;
}
let retried=false;
function withWindowsFileRetry(fn){
  if(!retried && (process.env.TEST_RETRY_UPDATE_TARGET || process.env.TEST_RETRY_LANGUAGE_MODE)){
    retried=true;
    const rename=fs.renameSync;
    fs.renameSync=()=>{throw Object.assign(new Error('target busy'),{code:'EBUSY'});};
    try {fn();} catch(error) {if(error.code!=='EBUSY') throw error;}
    finally {fs.renameSync=rename;}
    if(process.env.TEST_RETRY_UPDATE_TARGET) fs.writeFileSync(process.env.TEST_RETRY_UPDATE_TARGET, 'upstream update during retry');
    if(process.env.TEST_RETRY_LANGUAGE_MODE) fs.writeFileSync(process.env.TEST_RETRY_LANGUAGE_MODE, 'en\\n');
  }
  return fn();
}
module.exports={readExecutableVersion:version,withWindowsFileRetry};
if(require.main===module){
const [cmd,file,out]=process.argv.slice(2);
if(cmd==='detect') process.stdout.write('native-bun:'+fs.realpathSync(file));
else if(cmd==='version') process.stdout.write(version(file));
else if(cmd==='probe') process.stdout.write('source-js');
else if(cmd==='extract') fs.copyFileSync(file,out);
else if(cmd==='repack') {fs.copyFileSync(out,file); if(process.env.TEST_UPDATE_TARGET) fs.writeFileSync(process.env.TEST_UPDATE_TARGET, 'upstream update');}
else process.exit(1);
}
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
  const run = (extra, input = target) => spawnSync(process.execPath, [path.join(root, 'scripts/native-repair.js'), input, state], { env: {...env, ...extra}, encoding: 'utf8', timeout: 45000 });
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
test('English mode restores a verified native copy, survives relaunch, and permits switching back', { skip: unix }, t => {
  const f = fixture(t), original = fs.readFileSync(f.target, 'utf8');
  const mode = path.join(f.env.CLAUDE_CONFIG_DIR, 'plugins', 'claude-code-zh-cn', '.language-mode');
  fs.mkdirSync(path.dirname(mode), { recursive: true });
  assert.equal(f.run().status, 0);
  // 模拟替换程序后、正式 receipt 落盘前退出；英文还原也须核对 pending receipt。
  fs.renameSync(f.target + '.zh-cn-repair.json', f.target + '.zh-cn-repair.json.pending');
  fs.writeFileSync(mode, 'en\n');
  const english = f.run();
  assert.equal(english.status, 0, english.stderr);
  assert.equal(JSON.parse(english.stdout).mode, 'english');
  assert.equal(JSON.parse(english.stdout).restored, true);
  assert.equal(fs.readFileSync(f.target, 'utf8'), original);
  assert.equal(fs.existsSync(f.target + '.zh-cn-backup'), false);
  assert.equal(fs.existsSync(f.target + '.zh-cn-repair.json.pending'), false);
  assert.equal(JSON.parse(f.run().stdout).changed, false);
  assert.equal(fs.readFileSync(f.target, 'utf8'), original);
  fs.writeFileSync(mode, 'zh-CN\n');
  assert.equal(f.run().status, 0);
  assert.match(fs.readFileSync(f.target, 'utf8'), /中文帮助/);
});
test('English mode preserves the native copy and backup when restore validation or its lock fails', { skip: unix }, t => {
  const f = fixture(t), mode = path.join(f.env.CLAUDE_CONFIG_DIR, 'plugins', 'claude-code-zh-cn', '.language-mode');
  assert.equal(f.run().status, 0);
  const patched = fs.readFileSync(f.target), backup = fs.readFileSync(f.target + '.zh-cn-backup');
  fs.mkdirSync(path.dirname(mode), { recursive: true }); fs.writeFileSync(mode, 'en\n');
  fs.mkdirSync(f.target + '.zh-cn-lock');
  const busy = f.run();
  assert.notEqual(busy.status, 0);
  assert.deepEqual(fs.readFileSync(f.target), patched);
  assert.deepEqual(fs.readFileSync(f.target + '.zh-cn-backup'), backup);
  assert.equal(fs.existsSync(f.target + '.zh-cn-lock'), true);
  fs.rmSync(f.target + '.zh-cn-lock', { recursive: true });
  fs.appendFileSync(f.target + '.zh-cn-backup', '# changed backup\n');
  assert.notEqual(f.run().status, 0);
  assert.deepEqual(fs.readFileSync(f.target), patched);
  assert.match(fs.readFileSync(f.target + '.zh-cn-backup', 'utf8'), /changed backup/);
});
test('English restore detects an upstream update or changed backup during validation', { skip: unix }, t => {
  for (const update of ['target', 'backup']) {
    const f = fixture(t), mode = path.join(f.env.CLAUDE_CONFIG_DIR, 'plugins', 'claude-code-zh-cn', '.language-mode');
    assert.equal(f.run().status, 0);
    const patched = fs.readFileSync(f.target), backup = fs.readFileSync(f.target + '.zh-cn-backup');
    fs.mkdirSync(path.dirname(mode), { recursive: true }); fs.writeFileSync(mode, 'en\n');
    const result = f.run(update === 'target' ? { TEST_RESTORE_UPDATE_TARGET: f.target } : { TEST_RESTORE_UPDATE_BACKUP: '1' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /还原期间已更新/);
    if (update === 'target') {
      assert.equal(fs.readFileSync(f.target, 'utf8'), 'upstream update during restore');
      assert.deepEqual(fs.readFileSync(f.target + '.zh-cn-backup'), backup);
    } else {
      assert.deepEqual(fs.readFileSync(f.target), patched);
      assert.match(fs.readFileSync(f.target + '.zh-cn-backup', 'utf8'), /backup changed during restore/);
    }
    assert.equal(fs.existsSync(f.target + '.zh-cn-repair.json'), true);
    assert.equal(fs.existsSync(f.target + '.zh-cn-lock'), false);
  }
});
test('English restore preserves both builds when the original launcher symlink changes during validation', { skip: unix }, t => {
  const f = fixture(t), mode = path.join(f.env.CLAUDE_CONFIG_DIR, 'plugins', 'claude-code-zh-cn', '.language-mode');
  assert.equal(f.run().status, 0);
  const patched = fs.readFileSync(f.target), backup = fs.readFileSync(f.target + '.zh-cn-backup');
  const entry = path.join(f.tmp, 'claude-entry'), next = path.join(f.tmp, 'claude-next');
  const nextBuild = f.original('9.0.1');
  fs.writeFileSync(next, nextBuild, { mode: 0o755 });
  fs.symlinkSync(f.target, entry);
  fs.mkdirSync(path.dirname(mode), { recursive: true }); fs.writeFileSync(mode, 'en\n');
  const result = f.run({ TEST_RESTORE_RETARGET: entry, TEST_RESTORE_NEXT_TARGET: next }, entry);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /还原期间已更新/);
  assert.deepEqual(fs.readFileSync(f.target), patched);
  assert.deepEqual(fs.readFileSync(f.target + '.zh-cn-backup'), backup);
  assert.equal(fs.readFileSync(next, 'utf8'), nextBuild);
  assert.equal(fs.realpathSync(entry), next);
  assert.equal(fs.existsSync(f.target + '.zh-cn-lock'), false);
});
test('English restore reclaims a dead owner without taking a live restore lock', { skip: unix }, t => {
  const f = fixture(t), original = fs.readFileSync(f.target, 'utf8');
  assert.equal(f.run().status, 0);
  const mode = path.join(f.env.CLAUDE_CONFIG_DIR, 'plugins', 'claude-code-zh-cn', '.language-mode');
  fs.mkdirSync(path.dirname(mode), { recursive: true }); fs.writeFileSync(mode, 'en\n');
  fs.mkdirSync(f.target + '.zh-cn-lock');
  fs.writeFileSync(path.join(f.target + '.zh-cn-lock', 'pid'), `${process.pid}:live`);
  const live = f.run();
  assert.notEqual(live.status, 0);
  assert.match(live.stderr, /占用修复锁/);
  assert.equal(fs.existsSync(f.target + '.zh-cn-lock'), true);
  fs.writeFileSync(path.join(f.target + '.zh-cn-lock', 'pid'), '99999999:dead');
  const dead = f.run();
  assert.equal(dead.status, 0, dead.stderr);
  assert.equal(JSON.parse(dead.stdout).restored, true);
  assert.equal(fs.readFileSync(f.target, 'utf8'), original);
  assert.equal(fs.existsSync(f.target + '.zh-cn-lock'), false);
});
test('English restore revalidates an upstream update between Windows rename retries', { skip: unix }, t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const backup = fs.readFileSync(f.target + '.zh-cn-backup');
  const mode = path.join(f.env.CLAUDE_CONFIG_DIR, 'plugins', 'claude-code-zh-cn', '.language-mode');
  fs.mkdirSync(path.dirname(mode), { recursive: true }); fs.writeFileSync(mode, 'en\n');
  const result = f.run({ TEST_RETRY_UPDATE_TARGET: f.target });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /还原期间已更新/);
  assert.equal(fs.readFileSync(f.target, 'utf8'), 'upstream update during retry');
  assert.deepEqual(fs.readFileSync(f.target + '.zh-cn-backup'), backup);
  assert.equal(fs.existsSync(f.target + '.zh-cn-lock'), false);
});
test('Chinese commit rechecks English mode between Windows rename retries', { skip: unix }, t => {
  const f = fixture(t), original = fs.readFileSync(f.target, 'utf8');
  const mode = path.join(f.env.CLAUDE_CONFIG_DIR, 'plugins', 'claude-code-zh-cn', '.language-mode');
  fs.mkdirSync(path.dirname(mode), { recursive: true }); fs.writeFileSync(mode, 'zh-CN\n');
  const result = f.run({ TEST_RETRY_LANGUAGE_MODE: mode });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /已切换为英文，未提交中文副本/);
  assert.equal(fs.readFileSync(mode, 'utf8').trim(), 'en');
  assert.equal(fs.readFileSync(f.target, 'utf8'), original);
  assert.equal(fs.readFileSync(f.target + '.zh-cn-backup', 'utf8'), original);
  assert.equal(fs.existsSync(f.target + '.zh-cn-lock'), false);
});
test('switching to English after the pending receipt prevents committing the Chinese candidate', { skip: unix }, t => {
  const f = fixture(t), original = fs.readFileSync(f.target, 'utf8');
  const mode = path.join(f.env.CLAUDE_CONFIG_DIR, 'plugins', 'claude-code-zh-cn', '.language-mode');
  fs.mkdirSync(path.dirname(mode), { recursive: true }); fs.writeFileSync(mode, 'zh-CN\n');
  const preload = path.join(f.tmp, 'switch-before-commit.js');
  fs.writeFileSync(preload, `const fs=require('node:fs'),rename=fs.renameSync;
fs.renameSync=function(from,to,...args){
  const result=rename.call(this,from,to,...args);
  if(to===process.env.TEST_PENDING_FILE) fs.writeFileSync(process.env.TEST_LANGUAGE_MODE_FILE,'en\\n');
  return result;
};\n`);
  const result = f.run({
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${JSON.stringify(preload)}`,
    TEST_PENDING_FILE: f.target + '.zh-cn-repair.json.pending', TEST_LANGUAGE_MODE_FILE: mode,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /已切换为英文，未提交中文副本/);
  assert.equal(fs.readFileSync(mode, 'utf8').trim(), 'en');
  assert.equal(fs.readFileSync(f.target, 'utf8'), original);
  assert.equal(fs.readFileSync(f.target + '.zh-cn-backup', 'utf8'), original);
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
