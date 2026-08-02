'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var spawnSync = require('child_process').spawnSync;

var ROOT = path.join(__dirname, '..', '..', '..');
var HOOK = path.join(ROOT, '.claude', 'hooks', 'session-start.mjs');
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

function block(body, newline) {
  var nl = newline || '\n';
  return START + nl + body + nl + END;
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

function run(setup, preload) {
  var project = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-engine-session-'));
  try {
    if (setup) setup(project);
    if (typeof preload === 'function') preload = preload(project);
    var args = [];
    if (preload) args.push('--require', preload);
    args.push(HOOK);
    var r = spawnSync(process.execPath, args, {
      cwd: project,
      env: Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: project }),
      encoding: 'utf8',
      input: '{}\n'
    });
    var out = null;
    try { out = JSON.parse(r.stdout); } catch (e) {}
    return {
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
      ctx: out && out.hookSpecificOutput && out.hookSpecificOutput.additionalContext
    };
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
}

console.log('-- engine SessionStart progress recovery --');
var empty = run();
ok(empty.status === 0 && !!empty.ctx, 'ES1 empty project still emits valid SessionStart JSON');
ok(/not detected|未检测到游戏项目/.test(empty.ctx) && /\/new-game/.test(empty.ctx), 'ES2 empty project remains neutral and points to type routing');

var preWorld = run(function (project) {
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), block('- stage: design complete\n- next: CREATE-WORLD'));
});
ok(preWorld.status === 0 && /未检测到游戏项目/.test(preWorld.ctx) && preWorld.ctx.indexOf('CREATE-WORLD') >= 0,
  'ES3 world-less valid current is restored for a pre-world design checkpoint');
ok(/valid, opaque/.test(preWorld.ctx), 'ES4 world-less valid current keeps the same managed-current identity');

var preWorldLegacy = run(function (project) {
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), 'PREWORLD-LEGACY-SECRET');
});
ok(preWorldLegacy.status === 0 && /legacy/i.test(preWorldLegacy.ctx) && /完整读取|read.*full/i.test(preWorldLegacy.ctx),
  'ES5 world-less legacy gets diagnostic-only guidance');
ok(preWorldLegacy.ctx.indexOf('PREWORLD-LEGACY-SECRET') < 0, 'ES6 world-less legacy injects zero body fragments');

var preWorldInvalid = run(function (project) {
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), START + '\nPREWORLD-INVALID-SECRET');
});
ok(preWorldInvalid.status === 0 && /invalid|损坏/i.test(preWorldInvalid.ctx), 'ES7 world-less invalid progress stays diagnostic-only');
ok(preWorldInvalid.ctx.indexOf('PREWORLD-INVALID-SECRET') < 0, 'ES8 world-less invalid progress injects zero body fragments');

var missing = run(function (project) { addWorld(project); });
ok(missing.status === 0 && /PROGRESS\.md/.test(missing.ctx) && /canon\.md/.test(missing.ctx), 'ES9 a world without progress points to root canon.md');
ok(!/src[\\/]canon/.test(missing.ctx), 'ES10 missing-progress guidance does not point to src/canon');

var current = '- constraint: none\r\n- next: RUN-FOCUSED\r\n- custom field: opaque';
var valid = run(function (project) {
  addWorld(project);
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), '\uFEFFOUTSIDE-BEFORE-SECRET\r\n' + block(current, '\r\n') + '\r\nOUTSIDE-AFTER-SECRET\r\n');
});
ok(valid.status === 0 && valid.ctx.indexOf(current) >= 0, 'ES11 valid BOM/CRLF current with reordered extra fields is injected verbatim');
ok(valid.ctx.indexOf('OUTSIDE-BEFORE-SECRET') < 0 && valid.ctx.indexOf('OUTSIDE-AFTER-SECRET') < 0, 'ES12 marker-external progress text never leaks');

[
  ['short', 'LEGACY-SHORT-SECRET'],
  ['long', Array.from({ length: 500 }, function (_, i) { return 'LEGACY-LONG-SECRET-' + i; }).join('\n')],
  ['giant', 'LEGACY-GIANT-SECRET-' + 'q'.repeat(30000)]
].forEach(function (entry, index) {
  var result = run(function (project) {
    addWorld(project);
    fs.writeFileSync(path.join(project, 'PROGRESS.md'), entry[1]);
  });
  ok(result.status === 0 && /legacy/i.test(result.ctx) && /PROGRESS\.md/.test(result.ctx) && /完整读取|read.*full/i.test(result.ctx),
    'ES' + (13 + index * 2) + ' ' + entry[0] + ' legacy gets path/size/full-read diagnostics');
  ok(result.ctx.indexOf('LEGACY-' + entry[0].toUpperCase() + '-SECRET') < 0,
    'ES' + (14 + index * 2) + ' ' + entry[0] + ' legacy injects zero body fragments');
});

var invalidCases = [
  START + '\n' + START + '\nINVALID-DUP-SECRET\n' + END,
  START + '\nINVALID-MISSING-SECRET',
  END + '\nINVALID-ORDER-SECRET\n' + START,
  START + '\n' + END
];
invalidCases.forEach(function (text, index) {
  var result = run(function (project) {
    addWorld(project);
    fs.writeFileSync(path.join(project, 'PROGRESS.md'), text);
  });
  ok(result.status === 0 && /invalid|损坏/i.test(result.ctx), 'ES' + (19 + index * 2) + ' invalid marker structure is diagnostic-only');
  ok(!/INVALID-(?:DUP|MISSING|ORDER)-SECRET/.test(result.ctx), 'ES' + (20 + index * 2) + ' invalid progress body does not leak');
});

var nonRegular = run(function (project) {
  addWorld(project);
  fs.mkdirSync(path.join(project, 'PROGRESS.md'));
});
ok(nonRegular.status === 0 && /state:non_regular/.test(nonRegular.ctx) && /directory/.test(nonRegular.ctx),
  'ES27 a directory root is reported as non-regular and SessionStart remains exit 0');
ok(!/无 PROGRESS\.md/.test(nonRegular.ctx), 'ES28 non-regular progress is not disguised as missing');

var oversizedFile = run(function (project) {
  addWorld(project);
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), block('OVERSIZED-FILE-SECRET') + 'x'.repeat(64 * 1024));
});
ok(oversizedFile.status === 0 && /state:oversized/.test(oversizedFile.ctx) && /65536/.test(oversizedFile.ctx),
  'ES28a oversized whole files get a bounded diagnostic without blocking startup');
ok(oversizedFile.ctx.indexOf('OVERSIZED-FILE-SECRET') < 0,
  'ES28b oversized whole files inject zero body fragments');

function externalSymlinkCase() {
  var outside = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-engine-session-outside-'));
  try {
    fs.writeFileSync(path.join(outside, 'progress.md'), block('TREE-EXTERNAL-SECRET'));
    return run(function (project) {
      addWorld(project);
      fs.symlinkSync(path.join(outside, 'progress.md'), path.join(project, 'PROGRESS.md'), 'file');
    });
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
  }
}
var externalSymlink = null;
try {
  externalSymlink = externalSymlinkCase();
  ok(externalSymlink.status === 0 && /state:tree_external/.test(externalSymlink.ctx) &&
    externalSymlink.ctx.indexOf('TREE-EXTERNAL-SECRET') < 0,
    'ES28c tree-external symlink gets a zero-body diagnostic');
} catch (error) {
  if (!error || !/^(EPERM|EACCES|ENOSYS)$/.test(error.code || '')) throw error;
  if (process.platform !== 'win32') {
    console.log('  - ES28c external symlink assertion skipped: ' + error.code);
  } else {
    var outsideJunctionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-session-junction-outside-'));
    try {
      externalSymlink = run(function (project) {
        addWorld(project);
        fs.symlinkSync(outsideJunctionRoot, path.join(project, 'PROGRESS.md'), 'junction');
      });
      ok(externalSymlink.status === 0 && /state:tree_external/.test(externalSymlink.ctx),
        'ES28c tree-external Windows junction gets a zero-body diagnostic');
    } finally {
      fs.rmSync(outsideJunctionRoot, { recursive: true, force: true });
    }
  }
}

var overBody = 'OVER-LIMIT-SECRET-' + 'v'.repeat(5601 - 'OVER-LIMIT-SECRET-'.length);
var over = run(function (project) {
  addWorld(project);
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), block(overBody));
});
ok(over.status === 0 && /5601/.test(over.ctx) && /invalid|损坏/i.test(over.ctx), 'ES29 over-limit current reports its actual size without blocking startup');
ok(over.ctx.indexOf('OVER-LIMIT-SECRET') < 0, 'ES30 over-limit current is not truncated into the injected context');

var currentEdges = 'CUR-FIRST\n\nCUR-LAST';
var largeCurrent = 'CUR-FIRST\n' + 'c'.repeat(5600 - currentEdges.length) + '\nCUR-LAST';
var gitHeavy = run(function (project) {
  addWorld(project);
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), block(largeCurrent));
  fs.writeFileSync(path.join(project, 'DEBUG'), '');
  spawnSync('git', ['init', '-q'], { cwd: project, encoding: 'utf8' });
  for (var i = 0; i < 45; i++) {
    fs.writeFileSync(path.join(project, 'untracked-' + String(i).padStart(2, '0') + '-' + 'n'.repeat(55) + '.txt'), 'x');
  }
});
ok(gitHeavy.status === 0 && gitHeavy.ctx.indexOf(largeCurrent) >= 0, 'ES31 total-budget handling never truncates a valid current');
ok(gitHeavy.ctx.length <= 8000 && /git status --short/.test(gitHeavy.ctx), 'ES32 total context stays within 8000 by reducing only the Git section');

var gitTimeout = run(function (project) {
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), block('- next: KEEP-CURRENT-ON-GIT-TIMEOUT'));
}, gitFailurePreload('timeout'));
ok(gitTimeout.status === 0 && /git status --short.*timeout after 1500ms/is.test(gitTimeout.ctx) &&
  gitTimeout.ctx.indexOf('KEEP-CURRENT-ON-GIT-TIMEOUT') >= 0 && !/not a git repository|git unavailable/i.test(gitTimeout.ctx),
  'ES33 bounded Git timeout is explicit and does not displace valid current');

var gitBuffer = run(function (project) {
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), block('- next: KEEP-CURRENT-ON-GIT-ENOBUFS'));
}, gitFailurePreload('buffer'));
ok(gitBuffer.status === 0 && /git status --short.*ENOBUFS.*262144/is.test(gitBuffer.ctx) &&
  gitBuffer.ctx.indexOf('KEEP-CURRENT-ON-GIT-ENOBUFS') >= 0 && !/not a git repository|git unavailable/i.test(gitBuffer.ctx),
  'ES34 bounded Git ENOBUFS is explicit and does not displace valid current');

ok([empty, preWorld, preWorldLegacy, preWorldInvalid, missing, valid, nonRegular, oversizedFile, externalSymlink, over, gitHeavy, gitTimeout, gitBuffer]
  .filter(Boolean).every(function (r) { return r.status === 0 && !r.stderr; }),
  'ES35 SessionStart factually exits 0 with JSON and no stderr across covered states');

console.log('==== engine SessionStart: ' + pass + ' PASS / ' + fail + ' FAIL ====');
process.exit(fail ? 1 : 0);
