'use strict';
/* 2D 横版 example 私有 runtime 子步 A：闭 schema、固定 tick、tile AABB 与生命周期。 */
var path = require('path');
var SIDE = require(path.join(__dirname, '..', 'sidescroller-module.js'));
var WORLD = require(path.join(__dirname, '..', 'world.js'));
var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  X  ' + msg); } }
function throwsContaining(fn, text, msg) {
  try { fn(); fail++; console.log('  X  ' + msg + ' (未抛错)'); }
  catch (e) { if (e.message && e.message.indexOf(text) >= 0) pass++; else { fail++; console.log('  X  ' + msg + ' (' + e.message + ')'); } }
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function spec() { return clone(WORLD.maps.coast.nodes.run.sidescroller); }

console.log('── sidescroller 子步 A ──');
var compiled = SIDE.compileLevel(spec(), 'sidescroller ?map/run');
ok(compiled.width > compiled.viewport.w && compiled.rows.length >= 5 && Object.isFrozen(compiled), 'A1 合法两屏地图编译为冻结计划');
throwsContaining(function () { var s = spec(); s.extra = true; SIDE.compileLevel(s, 'L'); }, 'L.extra', 'A2 未知字段 fail-loud 到完整路径');
throwsContaining(function () { var s = spec(); s.map.rows[1] = s.map.rows[1].slice(1); SIDE.compileLevel(s, 'L'); }, 'L.map.rows[1]', 'A3 非等长地图 fail-loud');
throwsContaining(function () { var s = spec(); s.map.rows[0] = '@' + s.map.rows[0].slice(1); SIDE.compileLevel(s, 'L'); }, 'L.map.rows[0][0]', 'A4 未知 tile 字符 fail-loud');
throwsContaining(function () { var s = spec(); s.player.spawn = { x: 0, y: s.map.rows.length - 1 }; SIDE.compileLevel(s, 'L'); }, 'L.player.spawn', 'A5 出生点入墙 fail-loud');
throwsContaining(function () { var s = spec(); s.player.run = Infinity; SIDE.compileLevel(s, 'L'); }, 'L.player.run', 'A6 非有限移动参数 fail-loud');

function trace(frameMs) {
  var plan = SIDE.compileLevel(spec(), 'L');
  var s = SIDE.createSimulation(plan);
  var drive = SIDE.createFixedDriver(plan, s);
  var now = 0;
  var inputAtTick = function (tick) { return { right: true, jumpPressed: tick === 18 }; };
  drive.frame(now, inputAtTick);
  while (now < 2400) {
    now = Math.min(2400, now + frameMs);
    drive.frame(now, inputAtTick);
  }
  return SIDE.simulationSnapshot(s);
}
var t30 = trace(1000 / 30), t60 = trace(1000 / 60), t144 = trace(1000 / 144);
ok(JSON.stringify(t30) === JSON.stringify(t60) && JSON.stringify(t60) === JSON.stringify(t144), 'A7 30/60/144Hz 同输入 trace 得到同一 tick/位置/速度/相机');
ok(t60.tick === 144 && t60.x > compiled.player.spawnXQ && t60.grounded && t60.vy === 0 && Math.abs(t60.y - compiled.player.spawnYQ) <= 256 && t60.cameraX > 0, 'A8 跑、跳、落地并推动相机，终态回到地面');

(function () {
  var plan = SIDE.compileLevel(spec(), 'L');
  var s = SIDE.createSimulation(plan);
  s.xQ = plan.tileSizeQ - s.wQ;
  s.yQ = (plan.rows.length - 2) * plan.tileSizeQ - s.hQ;
  s.vxQ = plan.runQ;
  SIDE.stepSimulation(plan, s, { right: true });
  ok(s.xQ <= plan.tileSizeQ - s.wQ, 'A9 逐轴 tile AABB 阻止玩家穿过左侧墙柱');
})();

(function () {
  var stage = { textContent: '', children: [], appendChild: function (x) { this.children.push(x); return x; }, removeChild: function (x) { this.children.splice(this.children.indexOf(x), 1); } };
  var listeners = {}, pending = {}, next = 1;
  global.document = {
    getElementById: function (id) { return id === 'sidescroller-stage' ? stage : null; },
    createElement: function (tag) {
      return { tagName: tag, style: {}, className: '', children: [], attrs: {}, setAttribute: function (k, v) { this.attrs[k] = String(v); }, appendChild: function (x) { this.children.push(x); return x; }, addEventListener: function () {}, getContext: tag === 'canvas' ? function () { return { fillStyle: '', fillRect: function () {}, save: function () {}, restore: function () {}, translate: function () {} }; } : undefined };
    },
    addEventListener: function (k, fn) { listeners[k] = fn; },
    removeEventListener: function (k, fn) { if (listeners[k] === fn) delete listeners[k]; }
  };
  global.requestAnimationFrame = function (fn) { var id = next++; pending[id] = fn; return id; };
  global.cancelAnimationFrame = function (id) { delete pending[id]; };
  var api = { state: {}, _mod: null, registerModule: function (m) { this._mod = m; }, linkActions: function () { return []; } };
  var mod = SIDE.createSidescrollerModule(); mod.install(api);
  mod.systems[0].run(api.state, { node: WORLD.maps.coast.nodes.run });
  var staleId = Number(Object.keys(pending)[0]), stale = pending[staleId]; delete pending[staleId];
  mod.systems[0].run(api.state, { node: { kind: 'scene' } });
  ok(stage.children.length === 0 && !listeners.keydown && Object.keys(pending).length === 0, 'A10 离场清 canvas/listener/rAF');
  stale(100);
  ok(Object.keys(pending).length === 0, 'A11 旧 generation callback 晚到 no-op');
})();

console.log('── sidescroller 子步 B ──');
(function () {
  var s = spec();
  s.player.weapon = { cooldownTicks: 10, damage: 1 };
  s.sentry = { id: 'gate-sentry', spawn: { x: 34, y: 8 }, health: 3, fireEveryTicks: 72, projectileSpeed: 96, damage: 1 };
  s.clear = { defeat: 'gate-sentry', exposeLink: 'continue' };
  var plan = SIDE.compileLevel(s, 'B');
  ok(plan.sentry.id === 'gate-sentry' && plan.player.weapon.cooldownTicks === 10 && plan.clear.exposeLink === 'continue', 'B1 闭合 weapon/sentry/clear 编译为固定 tick 计划');
  var bad = clone(s); bad.player.weapon.onFire = function () {};
  throwsContaining(function () { SIDE.compileLevel(bad, 'B'); }, 'B.player.weapon.onFire', 'B2 作者行为 callback fail-loud');
  bad = clone(s); bad.clear.defeat = 'other';
  throwsContaining(function () { SIDE.compileLevel(bad, 'B'); }, 'B.clear.defeat', 'B3 clear 必须引用现役单哨戒炮');
  throwsContaining(function () { SIDE.validateClearLink(plan, { links: [{ id: 'abort' }] }, 'B'); }, 'B.clear.exposeLink', 'B3b clear 必须引用真实 node.links id');
  SIDE.validateClearLink(plan, { links: [{ id: 'continue' }, { id: 'abort' }] }, 'B'); pass++;

  var sim = SIDE.createSimulation(plan);
  sim.xQ = 30 * plan.tileSizeQ;
  sim.yQ = plan.player.spawnYQ;
  SIDE.stepSimulation(plan, sim, { firePressed: true });
  ok(sim.ammo.shotSeq === 1 && sim.playerShots.filter(function (p) { return p.active; }).length === 1, 'B4 fire press 沿只生成一颗稳定池弹体');
  for (var i = 0; i < 9; i++) SIDE.stepSimulation(plan, sim, { firePressed: i === 0 });
  ok(sim.ammo.shotSeq === 1, 'B5 held/repeated fire 不双发且 cooldown 内不缓冲');
  for (var shot = 0; shot < 3; shot++) {
    SIDE.stepSimulation(plan, sim, { firePressed: true });
    SIDE.stepSimulation(plan, sim, { fireReleased: true });
    for (i = 0; i < 70 && !sim.clear; i++) SIDE.stepSimulation(plan, sim, {});
  }
  ok(sim.sentry.hp === 0 && !sim.sentry.active && sim.clear && sim.clearWritePending, 'B6 三次命中击毁哨戒炮并只产生清关边沿');
})();

(function () {
  var s = spec();
  s.player.weapon = { cooldownTicks: 10, damage: 1 };
  s.sentry = { id: 'gate-sentry', spawn: { x: 12, y: 8 }, health: 3, fireEveryTicks: 40, projectileSpeed: 240, damage: 1 };
  s.clear = { defeat: 'gate-sentry', exposeLink: 'continue' };
  var plan = SIDE.compileLevel(s, 'Bdeath'), sim = SIDE.createSimulation(plan);
  sim.xQ = 10 * plan.tileSizeQ;
  for (var i = 0; i < 260 && !sim.dead; i++) SIDE.stepSimulation(plan, sim, {});
  ok(sim.dead && sim.hp === 0 && sim.playerShots.every(function (p) { return !p.active; }) && sim.enemyShots.every(function (p) { return !p.active; }), 'B7 三次受击死亡并冻结/清空弹池');
  SIDE.restartSimulation(plan, sim);
  ok(!sim.dead && sim.hp === 3 && sim.sentry.hp === 3 && !sim.clear, 'B8 本局重开恢复 fresh 玩家/哨戒炮/clear');
  var restored = SIDE.createSimulation(plan, true);
  ok(restored.clear && !restored.sentry.active && restored.sentry.hp === 0, 'B9 已完成 durable flag 重进时重建 clear poster，不复活哨戒炮');
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
