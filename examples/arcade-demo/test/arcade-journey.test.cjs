'use strict';
/* Arcade R·06 正式旅程：真实 world/core/modules + 固定 rAF/DOM，锁 goal=5、五果解锁、三败分流与无条件退出。 */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var ENGINE = path.join(ROOT, '..', '..');
var WORLD_PATH = path.join(ROOT, 'world.js');
var SNAKE_PATH = path.join(ROOT, 'snake-module.js');
var CORE = require(path.join(ENGINE, 'core', 'runtime', 'engine-core.js'));
var TEXT = require(path.join(ENGINE, 'modules', 'text-adventure', 'runtime', 'renderer.js'));
var SNAKE = require(SNAKE_PATH);
var WORLD = require(WORLD_PATH);
var SNAKE_SHA256 = '689ed97dc052e24f27802820d3c3680994e41ed41038bb74047066acb9165358';
var EXPECTED_SEED = 0x9E3779B9;
var pass = 0, fail = 0;

function ok(cond, msg, detail) {
  if (cond) pass++;
  else { fail++; console.log('  FAIL ' + msg + (detail ? ' -> ' + detail : '')); }
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function cloneWorld() {
  delete require.cache[require.resolve(WORLD_PATH)];
  return require(WORLD_PATH);
}
function node(world, id) { return world.maps.m.nodes[id]; }
function action(snap, text) {
  return snap.actions.filter(function (item) { return text.test(item.label || ''); })[0];
}
function isOpen(snap, text) {
  var item = action(snap, text);
  return !!(item && !item.locked);
}
function formalIssues(world) {
  var issues = [], arcadeIds = Object.keys(world.maps.m.nodes).filter(function (id) { return node(world, id).kind === 'arcade'; });
  var t = node(world, 'terminal'), ls = (t && t.links) || [];
  if (world.seed !== EXPECTED_SEED) issues.push('seed');
  if (arcadeIds.join(',') !== 'terminal') issues.push('consumer');
  if (!t || t.goal !== 5 || t.lockAfter !== 3 || t.winKey !== 'snakeWon' || t.failKey !== 'snakeFails') issues.push('terminal');
  if (!world.initState || world.initState.snakeWon !== false || world.initState.snakeFails !== 0) issues.push('init');
  if (!node(world, 'terminal-intro') || !/方向键\s*\/\s*WASD/.test(node(world, 'terminal-intro').look || '') || !/触屏按钮/.test(node(world, 'terminal-intro').look || '')) issues.push('input');
  if (ls.length !== 3 || ls[0].to !== 'vault' || typeof ls[0].requires !== 'function' || ls[1].to !== 'vault' || typeof ls[1].requires !== 'function') issues.push('gates');
  if (!ls[2] || ls[2].to !== 'foyer' || ls[2].requires != null || ls[2].once) issues.push('abort');
  return issues;
}
function makeEl(tag) {
  var value = '';
  return {
    tagName: String(tag || '').toUpperCase(), className: '', style: {}, children: [], parentNode: null, _attrs: {}, _h: {},
    set textContent(v) {
      value = String(v == null ? '' : v);
      if (value === '') {
        this.children.forEach(function (child) { child.parentNode = null; });
        this.children = [];
      }
    },
    get textContent() { return value; },
    setAttribute: function (k, v) { this._attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    appendChild: function (c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    addEventListener: function (t, fn) { this._h[t] = fn; }
  };
}
function makeHarness(world) {
  var stage = makeEl('div'), pending = {}, nextRaf = 1, keyHandler = null, now = 0, applied = 0;
  var doc = {
    getElementById: function (id) { return id === 'arcade-stage' ? stage : null; },
    createElement: function (tag) {
      var el = makeEl(tag);
      if (tag === 'canvas') el.getContext = function () { return { fillStyle: '', fillRect: function () {} }; };
      return el;
    },
    addEventListener: function (t, fn) { if (t === 'keydown') keyHandler = fn; },
    removeEventListener: function (t, fn) { if (t === 'keydown' && keyHandler === fn) keyHandler = null; }
  };
  global.document = doc;
  global.requestAnimationFrame = function (fn) { var id = nextRaf++; pending[id] = fn; return id; };
  global.cancelAnimationFrame = function (id) { delete pending[id]; };

  var eng = CORE.createEngine(world, { storage: null });
  var rawApply = eng.apply;
  eng.apply = function (a) { applied++; return rawApply(a); };
  eng.use(TEXT.createTextAdventureModule());
  eng.use(SNAKE.createSnakeModule({ goal: 5, grid: 12 }));
  eng.start();

  function takeFrame() {
    var ids = Object.keys(pending);
    if (!ids.length) return null;
    var id = Number(ids[0]), fn = pending[id];
    delete pending[id];
    return fn;
  }
  function frame(delta) {
    now += delta == null ? 16 : delta;
    var fn = takeFrame();
    if (fn) fn(now);
  }
  function tick() {
    frame(141);
  }
  function press(key) {
    if (keyHandler) keyHandler({ key: key, preventDefault: function () {} });
  }
  function hud() {
    var item = stage.children.filter(function (child) { return /amatlas-arcade-hud/.test(child.className || ''); })[0];
    return item ? item.textContent : '';
  }
  function startArcade() {
    rawApply(action(eng.view(), /走向闪烁的终端/));
    rawApply(action(eng.view(), /坐下,开始挑战/));
    frame(16); // 首个 rAF 只建立 last；后续每个 tick 用固定 >140ms delta 推一步。
  }
  return {
    eng: eng, stage: stage, frame: frame, tick: tick, press: press, hud: hud, startArcade: startArcade,
    applied: function () { return applied; }, pendingCount: function () { return Object.keys(pending).length; },
    cleanup: function () { delete global.document; delete global.requestAnimationFrame; delete global.cancelAnimationFrame; }
  };
}
function runTicks(h, key, count) {
  if (key) h.press(key);
  for (var i = 0; i < count; i++) h.tick();
}

console.log('Arcade R·06 正式五果旅程');
var terminal = node(WORLD, 'terminal');
var links = terminal.links;
ok(formalIssues(WORLD).length === 0, 'F0 正式 world 命中唯一 Arcade R·06 projection', formalIssues(WORLD).join(','));
ok(WORLD.seed === EXPECTED_SEED, 'F1 world 显式冻结与现役默认等价的 seed=0x9E3779B9', String(WORLD.seed));
ok(terminal.kind === 'arcade' && terminal.goal === 5 && terminal.lockAfter === 3 && terminal.winKey === 'snakeWon' && terminal.failKey === 'snakeFails', 'F2 唯一正式 terminal 锁 goal=5 / 三败 / win+fail key');
ok(Object.keys(WORLD.maps.m.nodes).filter(function (id) { return node(WORLD, id).kind === 'arcade'; }).join(',') === 'terminal', 'F3 world 恰好一个正式 arcade 消费者');
ok(WORLD.initState.snakeWon === false && WORLD.initState.snakeFails === 0, 'F4 durable 只初始化胜负边界，不存蛇局 local state');
ok(/5 个苹果/.test(node(WORLD, 'terminal-intro').look) && /不存档/.test(node(WORLD, 'terminal-intro').look) && /随时能放弃/.test(node(WORLD, 'terminal-intro').look), 'F5 ready screen 公开目标/输入/LOUD存档/abort');
ok(links.length === 3 && links[0].to === 'vault' && links[1].to === 'vault' && links[2].to === 'foyer' && !links[2].requires && !links[2].once, 'F6 terminal 精确技巧门/三败分流/无条件异节点 abort 三出口');
ok(node(WORLD, 'vault').title === '核心机房' && !node(WORLD, 'vault').links && !node(WORLD, 'leave').links, 'F7 vault/leave 是两个有意终局');
ok(sha256(fs.readFileSync(SNAKE_PATH)) === SNAKE_SHA256, 'F8 消费者私有 Snake runtime 冻结 SHA', sha256(fs.readFileSync(SNAKE_PATH)));

(function () {
  var h = makeHarness(WORLD);
  try {
    var start = h.eng.view();
    ok(start.pos.node === 'foyer' && isOpen(start, /走向闪烁/), 'J1 真实 core+modules 从 foyer 标准 link 进入 ready screen');
    h.startArcade();
    var initial = h.eng.view();
    ok(initial.pos.node === 'terminal' && h.hud() === '苹果 0 / 5' && h.stage.children.some(function (child) { return child.tagName === 'CANVAS'; }), 'J2 玩家主动 opt-in 后正式 canvas/HUD 0/5 启动');
    ok(!isOpen(initial, /推开解锁的门/) && !isOpen(initial, /撬开控制面板/) && isOpen(initial, /放弃挑战/), 'J3 0/5 仅 abort 开放，技巧门/fail-forward 均锁');

    var plans = [
      [['ArrowUp', 1], ['ArrowLeft', 2], ['ArrowUp', 4]],
      [['ArrowRight', 4], ['ArrowDown', 10]],
      [['ArrowLeft', 7], ['ArrowUp', 8]],
      [['ArrowLeft', 1], ['ArrowDown', 2]]
    ];
    plans.forEach(function (runs, milestone) {
      runs.forEach(function (run) { runTicks(h, run[0], run[1]); });
      var expected = milestone + 1, snap = h.eng.view();
      ok(h.hud() === '苹果 ' + expected + ' / 5' && h.eng.state.snakeWon === false && h.eng.state.snakeFails === 0 && !isOpen(snap, /推开解锁的门/) && isOpen(snap, /放弃挑战/),
        'J' + (4 + milestone) + ' 公开 HUD 到 ' + expected + '/5 时技巧门仍锁、失败账本不动', h.hud());
    });
    runTicks(h, 'ArrowRight', 5);
    var beforeWinApply = h.applied();
    runTicks(h, 'ArrowDown', 1);
    var won = h.eng.view();
    ok(h.eng.state.snakeWon === true && h.eng.state.snakeFails === 0 && h.applied() === beforeWinApply + 1, 'J8 第五果边界恰好一次离散 apply，只写 win 不写 fail', JSON.stringify(h.eng.state));
    ok(!h.hud() && h.stage.children.length === 0 && /ACCESS GRANTED/.test(won.view.body[0].text) && isOpen(won, /推开解锁的门/) && !isOpen(won, /撬开控制面板/), 'J9 第五果不依赖瞬时5/5；稳定面清HUD/canvas/controls并开放技巧门');
    h.eng.apply(action(won, /推开解锁的门/));
    ok(h.eng.state.pos.node === 'vault' && h.eng.view().view.title === '核心机房', 'J10 标准公开 link 真正进入 vault 终局');
  } finally { h.cleanup(); }
})();

(function () {
  var h = makeHarness(cloneWorld());
  try {
    h.startArcade();
    h.eng.apply(action(h.eng.view(), /放弃挑战/));
    ok(h.eng.state.pos.node === 'foyer' && h.eng.state.snakeWon === false && h.eng.state.snakeFails === 0 && h.stage.children.length === 0 && h.pendingCount() === 0,
      'J11 任意时刻标准 abort 回 foyer，并清 session runtime、不伪造胜负');
  } finally { h.cleanup(); }
})();

(function () {
  var h = makeHarness(cloneWorld());
  try {
    h.startArcade();
    for (var expected = 1; expected <= 3; expected++) {
      runTicks(h, null, expected === 1 ? 6 : 7); // restartLocal 把 last 归零，重开后的首帧只重建时间基线，再走6 ticks撞墙。
      if (expected < 3) h.press('ArrowUp'); // dead 时任意方向键经正式restartLocal重开。
    }
    var failed = h.eng.view();
    ok(h.eng.state.snakeWon === false && h.eng.state.snakeFails === 3 && h.stage.children.length === 0 && !isOpen(failed, /推开解锁的门/) && isOpen(failed, /撬开控制面板/) && isOpen(failed, /放弃挑战/),
      'J12 三次真实死亡精确写fail=3，停runtime、锁技巧门并开fail-forward', JSON.stringify(h.eng.state));
    h.eng.apply(action(failed, /撬开控制面板/));
    ok(h.eng.state.pos.node === 'vault' && h.eng.view().view.title === '核心机房', 'J13 三败标准fail-forward真进入vault');
  } finally { h.cleanup(); }
})();

console.log('反向变异');
(function () {
  var w = cloneWorld(); node(w, 'terminal').goal = 1;
  ok(formalIssues(w).indexOf('terminal') >= 0, 'M1 goal=1 会由正式 projection 打红');
})();
(function () {
  var w = cloneWorld(); delete w.seed;
  ok(formalIssues(w).indexOf('seed') >= 0, 'M2 删除显式 seed 会打红正式可复现路线');
})();
(function () {
  var w = cloneWorld(); node(w, 'terminal').links[0].requires = null;
  var e = CORE.createEngine(w, { storage: null }); e.use(TEXT.createTextAdventureModule()); e.use(SNAKE.createSnakeModule({ goal: 5, grid: 12 })); e.start();
  e.apply(action(e.view(), /走向闪烁/)); e.apply(action(e.view(), /坐下/));
  ok(formalIssues(w).indexOf('gates') >= 0 && isOpen(e.view(), /推开解锁的门/), 'M3 删除技巧门 requires 会由 projection 打红且起局前错误开放');
})();
(function () {
  var w = cloneWorld(); node(w, 'terminal').links[2].once = true;
  ok(formalIssues(w).indexOf('abort') >= 0, 'M4 abort 变 once 会打红无条件可重复退出');
})();
(function () {
  var w = cloneWorld(); node(w, 'terminal').links[2].to = 'terminal';
  ok(formalIssues(w).indexOf('abort') >= 0, 'M5 abort 改 self-loop 会打红异节点逃生口');
})();
(function () {
  var w = cloneWorld(); node(w, 'terminal').links[1].requires = function () { return false; };
  var h = makeHarness(w);
  try {
    h.startArcade();
    for (var i = 0; i < 3; i++) { runTicks(h, null, i === 0 ? 6 : 7); if (i < 2) h.press('ArrowUp'); }
    ok(!isOpen(h.eng.view(), /撬开控制面板/), 'M6 fail-forward 恒false 会被三败旅程打红');
  } finally { h.cleanup(); }
})();
(function () {
  var w = cloneWorld(); node(w, 'terminal-intro').look = String(node(w, 'terminal-intro').look).replace(/方向键 \/ WASD 或画布下方触屏按钮；/, '自行操作；');
  ok(formalIssues(w).indexOf('input') >= 0, 'M7 删除 ready 输入说明会打红公开教学契约');
})();
(function () {
  var w = cloneWorld(); node(w, 'terminal').winKey = 'snakeWonTypo';
  var h = makeHarness(w);
  try {
    h.startArcade();
    [[ 'ArrowUp',1 ],[ 'ArrowLeft',2 ],[ 'ArrowUp',4 ],[ 'ArrowRight',4 ],[ 'ArrowDown',10 ],[ 'ArrowLeft',7 ],[ 'ArrowUp',8 ],[ 'ArrowLeft',1 ],[ 'ArrowDown',2 ],[ 'ArrowRight',5 ],[ 'ArrowDown',1 ]].forEach(function (run) { runTicks(h, run[0], run[1]); });
    ok(h.eng.state.snakeWon !== true && !isOpen(h.eng.view(), /推开解锁的门/), 'M8 winKey 拼错不能解锁正式技巧门');
  } finally { h.cleanup(); }
})();

console.log('arcade-journey: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
