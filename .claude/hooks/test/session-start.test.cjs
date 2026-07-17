'use strict';
/* 引擎 SessionStart 回归：没有约定位置的 world 时保持中性，不把空包或陈旧进度当成进行中的文字冒险。 */
var fs = require('fs');
var os = require('os');
var path = require('path');
var spawnSync = require('child_process').spawnSync;
var ROOT = path.join(__dirname, '..', '..', '..');
var HOOK = path.join(ROOT, '.claude', 'hooks', 'session-start.mjs');
var pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg); }
}
function run(setup) {
  var project = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-engine-session-'));
  if (setup) setup(project);
  var r = spawnSync(process.execPath, [HOOK], {
    cwd: project,
    env: Object.assign({}, process.env, { CLAUDE_PROJECT_DIR: project }),
    encoding: 'utf8',
    input: '{}\n'
  });
  fs.rmSync(project, { recursive: true, force: true });
  var out = null;
  try { out = JSON.parse(r.stdout); } catch (e) {}
  return {
    status: r.status,
    ctx: out && out.hookSpecificOutput && out.hookSpecificOutput.additionalContext
  };
}
console.log('── engine SessionStart 项目识别 ──');
var empty = run();
ok(empty.status === 0 && !!empty.ctx, 'ES1 空目录仍输出合法 SessionStart JSON');
ok(empty.ctx && /未检测到游戏项目/.test(empty.ctx) && /\/new-game/.test(empty.ctx), 'ES2 空目录给中性未建项目提示与类型路由入口');
ok(empty.ctx && !/text-adventure-game|Phase 1|可能是新游戏|Amatlas 游戏会话启动/.test(empty.ctx), 'ES3 空目录不默认文字冒险或虚构游戏会话');
var orphan = run(function (project) {
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), 'STALE-ORPHAN-PROGRESS\n');
});
ok(orphan.ctx && /未检测到游戏项目/.test(orphan.ctx) && orphan.ctx.indexOf('STALE-ORPHAN-PROGRESS') < 0, 'ES4 无 world 时不把孤立 PROGRESS 当当前游戏状态');
var game = run(function (project) {
  var src = path.join(project, 'src');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'world.js'), 'globalThis.WORLD = {};\n');
});
ok(game.ctx && /检测到游戏项目/.test(game.ctx) && /无 PROGRESS\.md/.test(game.ctx), 'ES5 有约定位置 world 时识别现有游戏但诚实报告缺进度');
ok(game.ctx && !/可能是新游戏|Phase 1/.test(game.ctx), 'ES6 已有 world 不误导为新游戏');
var longGame = run(function (project) {
  var src = path.join(project, 'src');
  fs.mkdirSync(src, { recursive: true });
  fs.writeFileSync(path.join(src, 'world.js'), 'globalThis.WORLD = {};\n');
  var lines = [];
  for (var i = 0; i < 60; i++) lines.push('OLD-' + i + '-' + 'x'.repeat(900));
  lines.push('LATEST-NEXT-STEP');
  fs.writeFileSync(path.join(project, 'PROGRESS.md'), lines.join('\n') + '\n');
});
ok(longGame.ctx && longGame.ctx.length <= 8000, 'ES7 长进度注入严格不超过 8000 字符');
ok(longGame.ctx && /LATEST-NEXT-STEP/.test(longGame.ctx) && /git status --short/.test(longGame.ctx), 'ES8 长进度保留最新尾部与 git status，不被旧前缀挤掉');
console.log('════ engine SessionStart 回归:' + pass + ' PASS / ' + fail + ' FAIL ════');
process.exit(fail ? 1 : 0);
