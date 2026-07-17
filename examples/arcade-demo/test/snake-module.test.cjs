'use strict';
/* arcade 自定义 runtime 回归：静态闸看不进 canvas/rAF 与 coarse 输入，故以确定性 DOM/rAF mock 锁移动端操作和本局重开。 */
var path = require('path');
var SNAKE = require(path.join(__dirname, '..', 'snake-module.js'));
var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } }
function makeEl(tag) {
  return {
    tagName: String(tag || '').toUpperCase(), textContent: '', className: '', style: {}, children: [], parentNode: null, _attrs: {}, _h: {},
    setAttribute: function (k, v) { this._attrs[k] = String(v); },
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    appendChild: function (c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    addEventListener: function (t, fn) { this._h[t] = fn; }
  };
}
function makeHarness() {
  var stage = makeEl('div'), pending = {}, nextRaf = 1, keyHandler = null, removed = 0, fills = [];
  var doc = {
    getElementById: function (id) { return id === 'arcade-stage' ? stage : null; },
    createElement: function (tag) {
      var el = makeEl(tag);
      if (tag === 'canvas') el.getContext = function () { return { fillStyle: '', font: '', fillRect: function (x, y, w, h) { fills.push([x, y, w, h, this.fillStyle]); }, fillText: function () {} }; };
      return el;
    },
    addEventListener: function (t, fn) { if (t === 'keydown') keyHandler = fn; },
    removeEventListener: function (t, fn) { if (t === 'keydown' && keyHandler === fn) { keyHandler = null; removed++; } }
  };
  global.document = doc;
  global.requestAnimationFrame = function (fn) { var id = nextRaf++; pending[id] = fn; return id; };
  global.cancelAnimationFrame = function (id) { delete pending[id]; };
  var api = {
    state: { snakeFails: 0 }, _enter: null, _mod: null,
    registerModule: function (mod) { this._mod = mod; }, linkActions: function () { return []; }, rng: function () { return 0; },
    on: function (t, fn) { if (t === 'enter') this._enter = fn; },
    apply: function (a) { if (a.run) a.run(this.state); },
    fire: function (node) {
      var ev = { node: node };
      if (this._mod && this._mod.systems) this._mod.systems.forEach(function (sys) { if (sys.on === 'enter') sys.run(api.state, ev); });
      else if (this._enter) this._enter(ev);
    }
  };
  var mod = SNAKE.createSnakeModule({ grid: 4, goal: 9, stepMs: 10, px: 10 });
  mod.install(api);
  function takeFrame() { var ids = Object.keys(pending); if (!ids.length) return null; var id = Number(ids[0]), fn = pending[id]; delete pending[id]; return fn; }
  function frame(ts) { var fn = takeFrame(); if (fn) fn(ts); }
  function restore(state, phase, node) {
    api.state = state;
    var current = node ? { node: node, kind: node.kind, pos: { map: 'm', node: node.kind } } : null;
    (api._mod.systems || []).forEach(function (sys) {
      if (sys.on === 'restore') sys.run(api.state, { phase: phase, source: 'load', rollback: false, current: current, from: null, to: current });
    });
  }
  function button(label) {
    var controls = stage.children.filter(function (x) { return /arcade-controls/.test(x.className || ''); })[0];
    if (!controls) return null;
    return controls.children.filter(function (x) { return x.getAttribute('aria-label') === label; })[0] || null;
  }
  return { stage: stage, api: api, frame: frame, takeFrame: takeFrame, pendingCount: function () { return Object.keys(pending).length; }, restore: restore, button: button, key: function (k) { if (keyHandler) keyHandler({ key: k, preventDefault: function () {} }); }, keyActive: function () { return !!keyHandler; }, removed: function () { return removed; }, fills: fills };
}

console.log('── arcade coarse/mobile + 本局重开 ──');
(function () {
  var h = makeHarness();
  h.api.fire({ kind: 'arcade', failKey: 'snakeFails', lockAfter: 9, goal: 9 });
  var up = h.button('向上'), restart = h.button('重开本局');
  ok(!!up && !!restart && up.style.minWidth === '44px' && up.style.minHeight === '44px', 'A1 canvas 旁有可触摸方向键与 ≥44px 本局重开按钮（变异=仍只有 keydown → coarse/mobile 无法操作）');
  if (up && up._h.pointerdown) up._h.pointerdown({ preventDefault: function () {} });
  h.frame(10); h.frame(20); h.frame(30);
  ok(h.api.state.snakeFails === 0, 'A2 触屏“向上”真实改变 next 方向；同样帧数若仍向右应已撞墙（变异=按钮只装饰不接逻辑） fails=' + h.api.state.snakeFails);
  h.frame(40);
  ok(h.api.state.snakeFails === 1, 'A3 继续向上最终撞墙且失败只计一次 fails=' + h.api.state.snakeFails);
  if (restart && restart._h.pointerdown) restart._h.pointerdown({ preventDefault: function () {} });
  h.frame(50); h.frame(60); h.frame(70);
  ok(h.api.state.snakeFails === 2, 'A4 “重开本局”复位蛇局/死亡闩但不抹外层失败账本，第二次死亡再计一次 fails=' + h.api.state.snakeFails);
})();
(function () {
  var h = makeHarness();
  h.api.fire({ kind: 'arcade', failKey: 'snakeFails', lockAfter: 9, goal: 9 });
  h.api.fire({ kind: 'scene' });
  ok(!h.keyActive() && h.removed() === 1 && h.stage.children.length === 0, 'A5 离开 arcade 同时撤键盘并清 canvas/触屏 controls，旧本局不可继续响应（变异=只 stop rAF 留陈旧舞台）');
})();
(function () {
  var h = makeHarness(), oldNode = { kind: 'arcade', failKey: 'oldFails', lockAfter: 9, goal: 9 }, newNode = { kind: 'arcade', failKey: 'newFails', lockAfter: 9, goal: 9 };
  h.api.fire(oldNode);
  var stale = h.takeFrame(); // 模拟 cancel 前已从浏览器队列出队
  h.api.fire({ kind: 'scene' });
  h.api.fire(newNode);
  ok(h.pendingCount() === 1, 'A6a 重进后只有新会话一条 rAF');
  stale(20);
  ok(h.pendingCount() === 1 && !h.api.state.oldFails, 'A6b 旧会话 callback 晚到 no-op，不重挂旧 loop/写旧账本');
})();
(function () {
  var h = makeHarness(), node = { kind: 'arcade', failKey: 'snakeFails', lockAfter: 9, goal: 9 };
  ok(h.api._mod.systems.some(function (sys) { return sys.on === 'restore'; }), 'A7 arcade 必须声明 critical restore system');
  h.restore({ snakeFails: 0 }, 'activate', node);
  var stale = h.takeFrame();
  ok(h.keyActive() && h.stage.children.length > 0, 'A8 scene→arcade restore activate 启动 canvas/input/rAF');
  h.restore(h.api.state, 'deactivate', node);
  ok(!h.keyActive() && h.stage.children.length === 0 && h.pendingCount() === 0, 'A9 arcade→scene restore deactivate 完整撤资源');
  h.restore({ snakeFails: 0 }, 'activate', node);
  stale(20);
  ok(h.pendingCount() === 1, 'A10 restore 换代后旧 callback 晚到 no-op，只剩新会话一条 rAF');
})();

console.log('════ arcade runtime 回归:' + pass + ' PASS / ' + fail + ' FAIL ════');
process.exit(fail ? 1 : 0);
