'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var spawnSync = require('child_process').spawnSync;

var ROOT = path.join(__dirname, '..', '..', '..');
var HOOK = path.join(ROOT, '.claude', 'hooks', 'pre-compact.mjs');
var START = '<!-- AMATLAS:PROGRESS:START -->';
var END = '<!-- AMATLAS:PROGRESS:END -->';
var pass = 0, fail = 0;

function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  X ' + msg); }
}

function addWorld(project, rel) {
  var worldRel = rel || path.join('src', 'world.js');
  var target = path.join(project, worldRel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, 'globalThis.WORLD = {};\n');
}

function block(body) {
  return START + '\n' + body + '\n' + END;
}

function runProject(project, input, preload) {
  var args = [];
  if (preload) args.push('--require', preload);
  args.push(HOOK);
  var result = spawnSync(process.execPath, args, {
    cwd: project,
    env: Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: project }),
    encoding: 'utf8',
    input: input
  });
  var target = path.join(project, '.claude', 'last-precompact.txt');
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    snapshot: fs.existsSync(target) && fs.statSync(target).isFile() ? fs.readFileSync(target, 'utf8') : null,
    temps: fs.existsSync(path.dirname(target))
      ? fs.readdirSync(path.dirname(target)).filter(function (name) { return /^\.last-precompact\.txt\.tmp-/.test(name); })
      : []
  };
}

function isolated(setup, input, preloadFactory) {
  var project = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-precompact-'));
  try {
    if (setup) setup(project);
    var preload = preloadFactory ? preloadFactory(project) : null;
    return runProject(project, input, preload);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
}

function gitFailurePreload(kind) {
  return function (project) {
    var preload = path.join(project, 'git-failure-preload.cjs');
    fs.writeFileSync(preload, [
      "const cp=require('child_process');",
      "const sync=require('module').syncBuiltinESMExports;",
      "const original=cp.spawnSync;",
      "cp.spawnSync=function(command,args,options){",
      " if(command==='git'&&Array.isArray(args)&&args.join(' ')==='status --short'){",
      "  if(!options||options.timeout!==1500||options.maxBuffer!==262144){const e=new Error('missing git bounds');e.code='EBOUNDS';return {status:null,error:e,stdout:'',stderr:''};}",
      kind === 'timeout'
        ? "  const e=new Error('spawnSync git ETIMEDOUT');e.code='ETIMEDOUT';return {status:null,error:e,stdout:'',stderr:''};"
        : "  const e=new Error('spawnSync git ENOBUFS');e.code='ENOBUFS';return {status:null,error:e,stdout:'',stderr:''};",
      " }",
      " return original.apply(this,arguments);",
      "};sync();"
    ].join('\n'));
    return preload;
  };
}

console.log('-- engine PreCompact atomic recovery snapshot --');
var manual = isolated(function (project) {
  addWorld(project);
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), block('- next: MANUAL-CURRENT\n- custom: opaque'));
  fs.writeFileSync(path.join(project, 'canon.md'), '# Canon\n');
}, JSON.stringify({ trigger: 'manual', session_id: 'session-manual', transcript_path: 'C:/transcripts/manual.jsonl' }));
ok(manual.status === 0 && manual.stdout === '' && manual.stderr === '', 'EP1 manual success exits 0 silently');
ok(/trigger:manual/.test(manual.snapshot) && /session-manual/.test(manual.snapshot) && /C:\/transcripts\/manual\.jsonl/.test(manual.snapshot), 'EP2 manual snapshot records trigger, session id, and transcript path');
ok(/world:src[\\/]world\.js/.test(manual.snapshot) && /canon\.md.*(?:present|exists|存在)/i.test(manual.snapshot), 'EP3 snapshot records world path and root canon existence');
ok(/progress(?:_state| state)?:valid/i.test(manual.snapshot) && /MANUAL-CURRENT/.test(manual.snapshot), 'EP4 valid progress copies the bounded current body');
ok(manual.temps.length === 0, 'EP5 successful atomic replacement leaves no temp file');

var automatic = isolated(function (project) { addWorld(project, 'world.json'); }, JSON.stringify({ trigger: 'auto', session_id: 'session-auto' }));
ok(automatic.status === 0 && /trigger:auto/.test(automatic.snapshot) && /world:world\.json/.test(automatic.snapshot), 'EP6 auto compact records trigger and root world path');

var badInput = isolated(function (project) { addWorld(project); }, '{ definitely bad json');
ok(badInput.status === 0 && badInput.stdout === '' && badInput.stderr === '' && /trigger:(?:unknown|none)/.test(badInput.snapshot), 'EP7 bad stdin is tolerated and represented without blocking compact');

var noGit = isolated(function (project) { addWorld(project); }, '{}');
ok(noGit.status === 0 && /git status --short/.test(noGit.snapshot) && /not a git|非 git|git unavailable/i.test(noGit.snapshot), 'EP8 no-Git project gets an explicit bounded status fact');

var worldNone = isolated(function (project) {
  var dir = path.join(project, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'last-precompact.txt'), 'world:src/old-world.js\nOLD-CURRENT-SECRET\n');
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), block('- stage: design complete\n- next: PREWORLD-CURRENT'));
}, '{}');
ok(worldNone.status === 0 && /world:none/.test(worldNone.snapshot), 'EP9 world:none overwrites a stale project pointer');
ok(worldNone.snapshot.indexOf('old-world') < 0 && worldNone.snapshot.indexOf('OLD-CURRENT-SECRET') < 0,
  'EP10 world:none snapshot retains no stale world/current data');
ok(/progress(?:_state| state)?:valid/i.test(worldNone.snapshot) && worldNone.snapshot.indexOf('PREWORLD-CURRENT') >= 0,
  'EP11 world:none snapshot preserves a valid pre-world design current');

var worldNoneLegacy = isolated(function (project) {
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), 'PREWORLD-LEGACY-SECRET');
}, '{}');
ok(/progress(?:_state| state)?:legacy/i.test(worldNoneLegacy.snapshot) && worldNoneLegacy.snapshot.indexOf('PREWORLD-LEGACY-SECRET') < 0,
  'EP12 world:none legacy remains diagnostic-only with zero body copy');

[
  ['missing', null, /progress(?:_state| state)?:missing/i, null],
  ['legacy', 'LEGACY-PRECOMPACT-SECRET', /progress(?:_state| state)?:legacy/i, 'LEGACY-PRECOMPACT-SECRET'],
  ['invalid', START + '\nINVALID-PRECOMPACT-SECRET', /progress(?:_state| state)?:invalid/i, 'INVALID-PRECOMPACT-SECRET']
].forEach(function (entry, index) {
  var result = isolated(function (project) {
    addWorld(project);
    if (entry[1] !== null) fs.writeFileSync(path.join(project, 'PROGRESS.md'), entry[1]);
  }, '{}');
  ok(result.status === 0 && entry[2].test(result.snapshot), 'EP' + (13 + index * 2) + ' snapshot reports ' + entry[0] + ' progress state');
  ok(!entry[3] || result.snapshot.indexOf(entry[3]) < 0, 'EP' + (14 + index * 2) + ' ' + entry[0] + ' progress copies no body');
});

var nonRegular = isolated(function (project) {
  addWorld(project);
  fs.mkdirSync(path.join(project, 'PROGRESS.md'));
}, '{}');
ok(nonRegular.status === 0 && /progress(?:_state| state)?:non_regular/i.test(nonRegular.snapshot) && /directory/.test(nonRegular.snapshot),
  'EP19 a directory root is recorded as non-regular without blocking compact');
ok(!/progress(?:_state| state)?:missing/i.test(nonRegular.snapshot), 'EP20 non-regular progress is not represented as missing');

var oversizedFile = isolated(function (project) {
  addWorld(project);
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), block('OVERSIZED-FILE-SECRET') + 'x'.repeat(64 * 1024));
}, '{}');
ok(oversizedFile.status === 0 && /progress(?:_state| state)?:oversized/i.test(oversizedFile.snapshot) && /65536/.test(oversizedFile.snapshot),
  'EP20a oversized whole files retain an explicit snapshot state');
ok(oversizedFile.snapshot.indexOf('OVERSIZED-FILE-SECRET') < 0,
  'EP20b oversized whole files copy zero body fragments');

function externalSymlinkCase() {
  var outside = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-precompact-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'progress.md'), block('TREE-EXTERNAL-SECRET'));
    return isolated(function (project) {
      addWorld(project);
      fs.symlinkSync(path.join(outside, 'progress.md'), path.join(project, 'PROGRESS.md'), 'file');
    }, '{}');
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
}
try {
  var externalSymlink = externalSymlinkCase();
  ok(externalSymlink.status === 0 && /progress(?:_state| state)?:tree_external/i.test(externalSymlink.snapshot) &&
    externalSymlink.snapshot.indexOf('TREE-EXTERNAL-SECRET') < 0,
    'EP20c tree-external symlink records a zero-body snapshot state');
} catch (error) {
  if (!error || !/^(EPERM|EACCES|ENOSYS)$/.test(error.code || '')) throw error;
  if (process.platform !== 'win32') {
    console.log('  - EP20c external symlink assertion skipped: ' + error.code);
  } else {
    var outsideJunctionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-precompact-junction-outside-'));
    try {
      externalSymlink = isolated(function (project) {
        addWorld(project);
        fs.symlinkSync(outsideJunctionRoot, path.join(project, 'PROGRESS.md'), 'junction');
      }, '{}');
      ok(externalSymlink.status === 0 && /progress(?:_state| state)?:tree_external/i.test(externalSymlink.snapshot),
        'EP20c tree-external Windows junction records a zero-body snapshot state');
    } finally {
      fs.rmSync(outsideJunctionRoot, { recursive: true, force: true });
    }
  }
}

function failureCase(kind) {
  var project = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-precompact-failure-'));
  try {
    addWorld(project);
    var dir = path.join(project, '.claude');
    fs.mkdirSync(dir, { recursive: true });
    var target = path.join(dir, 'last-precompact.txt');
    fs.writeFileSync(target, 'OLD-TARGET-BYTES\n');
    var preload = path.join(project, 'failure-preload.cjs');
    var source = kind === 'write'
      ? "const fs=require('fs');const original=fs.openSync;fs.openSync=function(file){if(String(file).includes('.last-precompact.txt.tmp-')){const e=new Error('forced temp write failure');e.code='EACCES';throw e;}return original.apply(this,arguments);};\n"
      : "const fs=require('fs');const original=fs.renameSync;fs.renameSync=function(from){if(String(from).includes('.last-precompact.txt.tmp-')){const e=new Error('forced rename failure');e.code='EPERM';throw e;}return original.apply(this,arguments);};\n";
    fs.writeFileSync(preload, source);
    var result = runProject(project, '{}', preload);
    result.oldBytes = fs.readFileSync(target, 'utf8');
    return result;
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
}

var writeFailure = failureCase('write');
ok(writeFailure.status !== 0 && writeFailure.status !== 2 && writeFailure.stderr.length > 0, 'EP21 temp-write failure uses visible non-2 nonzero exit and stderr');
ok(writeFailure.oldBytes === 'OLD-TARGET-BYTES\n' && writeFailure.temps.length === 0, 'EP22 temp-write failure preserves old target and removes temp files');

var renameFailure = failureCase('rename');
ok(renameFailure.status !== 0 && renameFailure.status !== 2 && renameFailure.stderr.length > 0, 'EP23 rename failure uses visible non-2 nonzero exit and stderr');
ok(renameFailure.oldBytes === 'OLD-TARGET-BYTES\n' && renameFailure.temps.length === 0, 'EP24 rename failure preserves old target and removes temp files');

var gitTimeout = isolated(function (project) {
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), block('- next: KEEP-CURRENT-ON-GIT-TIMEOUT'));
}, '{}', gitFailurePreload('timeout'));
ok(gitTimeout.status === 0 && /git status --short.*timeout after 1500ms/is.test(gitTimeout.snapshot) &&
  gitTimeout.snapshot.indexOf('KEEP-CURRENT-ON-GIT-TIMEOUT') >= 0 && !/not a git repository|git unavailable/i.test(gitTimeout.snapshot),
  'EP25 bounded Git timeout is explicit and still writes the valid current snapshot');

var gitBuffer = isolated(function (project) {
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), block('- next: KEEP-CURRENT-ON-GIT-ENOBUFS'));
}, '{}', gitFailurePreload('buffer'));
ok(gitBuffer.status === 0 && /git status --short.*ENOBUFS.*262144/is.test(gitBuffer.snapshot) &&
  gitBuffer.snapshot.indexOf('KEEP-CURRENT-ON-GIT-ENOBUFS') >= 0 && !/not a git repository|git unavailable/i.test(gitBuffer.snapshot),
  'EP26 bounded Git ENOBUFS is explicit and still writes the valid current snapshot');

console.log('==== engine PreCompact: ' + pass + ' PASS / ' + fail + ' FAIL ====');
process.exit(fail ? 1 : 0);
