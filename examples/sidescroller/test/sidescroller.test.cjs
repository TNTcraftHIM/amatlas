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
var GOLDEN = {
  moveJump: { tick: 120, x: 49896, y: 31200, vx: 307, vy: 0, grounded: true, cameraX: 22504, hp: 3, dead: false, sentryHp: 3, clear: false, shotSeq: 0 },
  clear: { tick: 47, x: 123392, y: 31232, vx: 0, vy: 0, grounded: true, cameraX: 81920, hp: 3, dead: false, sentryHp: 0, clear: true, shotSeq: 3 },
  death: { tick: 156, x: 131584, y: 31232, vx: 0, vy: 0, grounded: true, cameraX: 81920, hp: 0, dead: true, sentryHp: 3, clear: false, shotSeq: 0 },
  restart: { tick: 0, x: 13056, y: 31232, vx: 0, vy: 0, grounded: true, cameraX: 0, hp: 3, dead: false, sentryHp: 3, clear: false, shotSeq: 0 }
};

console.log('── sidescroller 子步 A ──');
var compiled = SIDE.compileLevel(spec(), 'sidescroller ?map/run');
ok(compiled.width > compiled.viewport.w && compiled.rows.length >= 5 && Object.isFrozen(compiled) && compiled.presentation.id === 'coast', 'A1 合法两屏地图与coast表现preset编译为冻结计划');
(function () {
  var legacy = spec(); delete legacy.presentation;
  ok(SIDE.compileLevel(legacy, 'legacy').presentation.id === 'neutral', 'A1a 旧作品缺presentation走neutral兼容地板且不猜题材');
  var bad = spec(); bad.presentation.extra = true; throwsContaining(function () { SIDE.compileLevel(bad, 'L'); }, 'L.presentation.extra', 'A1b presentation未知字段fail-loud');
  bad = spec(); bad.presentation.profile = 'desert'; throwsContaining(function () { SIDE.compileLevel(bad, 'L'); }, 'L.presentation.profile', 'A1c 未实现profile fail-loud而不静默回落');
  bad = spec(); bad.presentation = 'coast'; throwsContaining(function () { SIDE.compileLevel(bad, 'L'); }, 'L.presentation', 'A1d presentation错形态fail-loud');
  bad = spec(); bad.presentation = null; throwsContaining(function () { SIDE.compileLevel(bad, 'L'); }, 'L.presentation', 'A1e 显式null不是缺字段，必须fail-loud而不落neutral');
  bad = spec(); bad.presentation = undefined; throwsContaining(function () { SIDE.compileLevel(bad, 'L'); }, 'L.presentation', 'A1f 显式undefined不是缺字段，必须fail-loud而不落neutral');
})();
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
  var plan = SIDE.compileLevel(spec(), 'golden'), sim = SIDE.createSimulation(plan);
  for (var i = 0; i < 120; i++) SIDE.stepSimulation(plan, sim, { right: true, jumpPressed: i === 18 });
  ok(JSON.stringify(SIDE.simulationSnapshot(sim)) === JSON.stringify(GOLDEN.moveJump), 'A8a 表现层改动前黄金移动/跳跃 snapshot 不漂移');
})();

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
  function recorder() {
    var ops = [], gradient = { addColorStop: function (at, color) { ops.push(['stop', at, color]); } };
    return { ops: ops, fillStyle: '', fillRect: function (x, y, w, h) { ops.push(['rect', this.fillStyle, Math.round(x), Math.round(y), Math.round(w), Math.round(h)]); }, save: function () { ops.push(['save']); }, restore: function () { ops.push(['restore']); }, translate: function (x, y) { ops.push(['translate', Math.round(x), Math.round(y)]); }, createLinearGradient: function () { return gradient; }, beginPath: function () {}, moveTo: function () {}, lineTo: function () {}, closePath: function () {}, fill: function () { ops.push(['fill', this.fillStyle]); } };
  }
  var coastPlan = SIDE.compileLevel(spec(), 'render-coast'), coastSim = SIDE.createSimulation(coastPlan), coastCtx = recorder();
  SIDE._private.renderFrame(coastCtx, coastPlan, coastSim, { tick: 0, reducedMotion: false, poster: null });
  var frostSpec = spec(); frostSpec.presentation.profile = 'frost'; var frostPlan = SIDE.compileLevel(frostSpec, 'render-frost'), frostCtx = recorder();
  SIDE._private.renderFrame(frostCtx, frostPlan, SIDE.createSimulation(frostPlan), { tick: 0, reducedMotion: false, poster: null });
  ok(JSON.stringify(coastCtx.ops) !== JSON.stringify(frostCtx.ops) && coastCtx.ops.length > 40 && frostCtx.ops.length > 40, 'A9a coast/frost共用纯renderFrame但有不同程序化操作签名');
  coastSim.cameraXQ = 64 * 256;
  var before = JSON.stringify(SIDE.simulationSnapshot(coastSim)), movingCtx = recorder(), reducedCtx = recorder();
  var hitPoster = { type: 'hit', tick: 0, xQ: coastSim.xQ, yQ: coastSim.yQ };
  SIDE._private.renderFrame(movingCtx, coastPlan, coastSim, { tick: 0, reducedMotion: false, poster: hitPoster });
  SIDE._private.renderFrame(reducedCtx, coastPlan, coastSim, { tick: 0, reducedMotion: true, poster: hitPoster });
  ok(JSON.stringify(SIDE.simulationSnapshot(coastSim)) === before && JSON.stringify(movingCtx.ops) !== JSON.stringify(reducedCtx.ops) && movingCtx.ops.some(function (op) { return op[0] === 'rect' && op[4] === 2; }) && reducedCtx.ops.some(function (op) { return op[0] === 'rect' && op[4] === 2; }), 'A9b reduced-motion只冻结远景视差，因果poster仍绘制且renderFrame纯读sim');
})();

(function () {
  var stage = { textContent: '', children: [], appendChild: function (x) { this.children.push(x); return x; }, removeChild: function (x) { this.children.splice(this.children.indexOf(x), 1); } };
  var listeners = {}, pending = {}, next = 1;
  global.document = {
    getElementById: function (id) { return id === 'sidescroller-stage' ? stage : null; },
    createElement: function (tag) {
      return { tagName: tag, style: {}, className: '', children: [], attrs: {}, events: {}, setAttribute: function (k, v) { this.attrs[k] = String(v); }, appendChild: function (x) { this.children.push(x); return x; }, addEventListener: function (name, fn) { this.events[name] = fn; }, getContext: tag === 'canvas' ? function () { return { fillStyle: '', fillRect: function () {}, save: function () {}, restore: function () {}, translate: function () {}, createLinearGradient: function () { return { addColorStop: function () {} }; }, beginPath: function () {}, moveTo: function () {}, lineTo: function () {}, closePath: function () {}, fill: function () {} }; } : undefined };
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

  var deathNode = clone(WORLD.maps.coast.nodes.run);
  deathNode.sidescroller.sentry.spawn = { x: 5, y: 8 };
  deathNode.sidescroller.sentry.fireEveryTicks = 1;
  deathNode.sidescroller.sentry.projectileSpeed = 600;
  deathNode.sidescroller.sentry.damage = 3;
  mod.systems[0].run(api.state, { node: deathNode });
  var ts = 0, guard = 0;
  while (!/已阵亡/.test(stage.children[1].textContent) && guard++ < 180) {
    var liveId = Number(Object.keys(pending)[0]), live = pending[liveId]; delete pending[liveId];
    ts += 1000 / 60; live(ts);
  }
  var controls = stage.children[2], right = controls.children[1], restart = controls.children[4];
  right.events.pointerdown({ preventDefault: function () {} });
  restart.events.click();
  liveId = Number(Object.keys(pending)[0]); live = pending[liveId]; delete pending[liveId];
  ts += 1000 / 60; live(ts);
  ok(/生命 3 \/ 3/.test(stage.children[1].textContent) && /x 51\b/.test(stage.children[1].textContent), 'A12 死亡时 held 方向未释放也会在重开边界清零');
  right.events.pointerup();
})();

(function () {
  function AudioContextMock() {
    this.state = 'suspended'; this.currentTime = 0; this.destination = {}; this.resumes = 0; this.closes = 0; this.oscillators = [];
    AudioContextMock.instances.push(this);
  }
  AudioContextMock.instances = [];
  AudioContextMock.prototype.resume = function () { this.resumes++; this.state = 'running'; };
  AudioContextMock.prototype.close = function () { this.closes++; this.state = 'closed'; };
  AudioContextMock.prototype.createOscillator = function () {
    var osc = { type: '', starts: 0, stops: [], frequency: { first: 0, setValueAtTime: function (v) { osc.frequency.first = v; }, exponentialRampToValueAtTime: function () {} }, connect: function () {}, start: function () { this.starts++; }, stop: function (at) { this.stops.push(at); }, onended: null };
    this.oscillators.push(osc); return osc;
  };
  AudioContextMock.prototype.createGain = function () { return { gain: { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} }, connect: function () {} }; };
  function harness(node, host, storage) {
    var stage = { textContent: '', children: [], appendChild: function (x) { this.children.push(x); return x; }, removeChild: function (x) { this.children.splice(this.children.indexOf(x), 1); } };
    var listeners = {}, pending = {}, next = 1, canvasCtx = { ops: [], fillStyle: '', fillRect: function (x, y, w, h) { this.ops.push([Math.round(x), Math.round(y), Math.round(w), Math.round(h)]); }, save: function () {}, restore: function () {}, translate: function () {}, createLinearGradient: function () { return { addColorStop: function () {} }; }, beginPath: function () {}, moveTo: function () {}, lineTo: function () {}, closePath: function () {}, fill: function () {} };
    global.window = host; global.localStorage = storage || { getItem: function () { return null; } };
    global.document = { getElementById: function () { return stage; }, createElement: function (tag) { var el = { style: {}, children: [], events: {}, textContent: '', setAttribute: function () {}, appendChild: function (x) { this.children.push(x); return x; }, addEventListener: function (name, fn) { this.events[name] = fn; } }; if (tag === 'canvas') el.getContext = function () { return canvasCtx; }; return el; }, addEventListener: function (k, fn) { listeners[k] = fn; }, removeEventListener: function (k, fn) { if (listeners[k] === fn) delete listeners[k]; } };
    global.requestAnimationFrame = function (fn) { var id = next++; pending[id] = fn; return id; }; global.cancelAnimationFrame = function (id) { delete pending[id]; };
    var api = { state: {}, registerModule: function () {}, linkActions: function () { return []; }, apply: function (action) { if (action.run) action.run(this.state); } };
    var mod = SIDE.createSidescrollerModule(); mod.install(api); mod.systems[0].run(api.state, { node: node });
    return { stage: stage, listeners: listeners, pending: pending, ctx: canvasCtx, mod: mod, api: api, frame: function (ts) { var id = Number(Object.keys(pending)[0]), fn = pending[id]; delete pending[id]; fn(ts); }, stop: function () { mod.systems[0].run(api.state, { node: { kind: 'scene' } }); } };
  }
  var host = { AudioContext: AudioContextMock, matchMedia: function () { return { matches: false }; }, addEventListener: function () {}, removeEventListener: function () {} };
  var cueNode = clone(WORLD.maps.coast.nodes.run); cueNode.sidescroller.sentry.spawn = { x: 5, y: 8 }; cueNode.sidescroller.sentry.health = 1; cueNode.sidescroller.sentry.fireEveryTicks = 600; cueNode.sidescroller.sentry.projectileSpeed = 1;
  var h = harness(cueNode, host);
  ok(AudioContextMock.instances.length === 0, 'A13 手势前不创建AudioContext');
  h.listeners.keydown({ key: ' ', repeat: false, preventDefault: function () {} });
  var ac = AudioContextMock.instances[0]; ok(AudioContextMock.instances.length === 1 && ac.resumes === 1, 'A14 首个支持手势只创建并resume一个AudioContext');
  h.frame(0); h.frame(17); var afterShot = ac.oscillators.length; h.frame(17);
  for (var ti = 34; ti < 220 && ac.oscillators.length < 3; ti += 17) h.frame(ti);
  ok(afterShot === 1 && ac.oscillators.length === 3 && ac.oscillators.map(function (o) { return o.frequency.first; }).join(',') === '180,132,294', 'A15 shot/hit/clear token各消费一次，重复draw零重播');
  ac.state = 'suspended'; h.listeners.keydown({ key: 'ArrowRight', repeat: false, preventDefault: function () {} });
  ok(AudioContextMock.instances.length === 1 && ac.resumes === 2 && ac.state === 'running', 'A16 既有Context再次suspended后由后续手势resume而不重建');
  var staleId = Number(Object.keys(h.pending)[0]), stale = h.pending[staleId]; h.stop();
  ok(ac.closes === 1 && ac.oscillators.every(function (o) { return o.stops.some(function (at) { return at === undefined; }); }) && Object.keys(h.pending).length === 0, 'A17 stop清活跃音源、关闭Context并取消rAF');
  stale(500); ok(ac.oscillators.length === 3, 'A18 旧generation晚到不重播SFX');

  AudioContextMock.instances = [];
  var deathNode = clone(WORLD.maps.coast.nodes.run); deathNode.sidescroller.sentry.spawn = { x: 5, y: 8 }; deathNode.sidescroller.sentry.fireEveryTicks = 1; deathNode.sidescroller.sentry.projectileSpeed = 600; deathNode.sidescroller.sentry.damage = 3;
  h = harness(deathNode, host); var right = h.stage.children[2].children[1], fire = h.stage.children[2].children[3], restart = h.stage.children[2].children[4]; right.events.pointerdown({ preventDefault: function () {} }); ac = AudioContextMock.instances[0]; h.frame(0);
  for (ti = 17; !/已阵亡/.test(h.stage.children[1].textContent) && ti < 1000; ti += 17) h.frame(ti);
  var hurtSources = ac.oscillators.slice(), hadHurtPoster = h.ctx.ops.some(function (op) { return op[2] === 10 && op[3] === 2; }); h.ctx.ops = []; restart.events.click(); h.frame(ti);
  var clearedPoster = !h.ctx.ops.some(function (op) { return op[2] === 10 && op[3] === 2; }); fire.events.pointerdown({ preventDefault: function () {} }); h.frame(ti + 17);
  var restartedCues = ac.oscillators.slice(hurtSources.length);
  ok(hadHurtPoster && clearedPoster && ac.closes === 0 && hurtSources.every(function (o) { return o.stops.some(function (at) { return at === undefined; }); }) && restartedCues.length >= 1 && restartedCues[0].frequency.first === 180, 'A19 death→restart清poster/活跃源并让新局seq=1立即发shot声，Context保持单实例');
  h.stop();

  AudioContextMock.instances = [];
  h = harness(cueNode, host, { getItem: function () { return '1'; } }); h.stage.children[2].children[3].events.pointerdown({ preventDefault: function () {} }); h.frame(0); h.frame(17); ok(AudioContextMock.instances.length === 0, 'A20 muted偏好阻止音频图创建且玩法继续'); h.stop();
  h = harness(cueNode, { matchMedia: function () { return { matches: false }; }, addEventListener: function () {}, removeEventListener: function () {} }); h.stage.children[2].children[3].events.pointerdown({ preventDefault: function () {} }); h.frame(0); h.frame(17); ok(true, 'A21 无AudioContext能力静默退化且不崩'); h.stop();

  var queueNode = clone(cueNode), queueHost = { matchMedia: function () { return { matches: false }; }, addEventListener: function () {}, removeEventListener: function () {} };
  h = harness(queueNode, queueHost); fire = h.stage.children[2].children[3]; fire.events.pointerdown({ preventDefault: function () {} }); h.frame(0);
  h.ctx.ops = []; h.frame(250); var catchUpShotDrawn = h.ctx.ops.some(function (op) { return op[2] === 10 && op[3] === 2; });
  h.ctx.ops = []; h.frame(267); var queuedHitDrawn = h.ctx.ops.some(function (op) { return op[2] === 10 && op[3] === 2; });
  h.ctx.ops = []; h.frame(284); var queuedClearDrawn = h.ctx.ops.some(function (op) { return op[2] === 24 && op[3] === 2; });
  ok(catchUpShotDrawn && queuedHitDrawn && queuedClearDrawn, 'A22 250ms追帧仍画shot，且同tick hit+clear逐帧排队不互相覆盖'); h.stop();

  var lifetimeNode = clone(WORLD.maps.coast.nodes.run);
  h = harness(lifetimeNode, queueHost); fire = h.stage.children[2].children[3]; fire.events.pointerdown({ preventDefault: function () {} }); h.frame(0);
  var posterDraws = 0;
  for (var posterFrame = 17; posterFrame <= 13 * 17; posterFrame += 17) { h.ctx.ops = []; h.frame(posterFrame); if (h.ctx.ops.some(function (op) { return op[2] === 10 && op[3] === 2; })) posterDraws++; }
  ok(posterDraws === 12, 'A23 单token空闲时恰画12帧，第13帧不再显示'); h.stop();
  delete global.window; delete global.localStorage;
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
  var golden = SIDE.createSimulation(plan); golden.xQ = plan.sentry.xQ - 4 * plan.tileSizeQ; golden.yQ = plan.player.spawnYQ;
  var guard = 0;
  while (!golden.clear && guard++ < 500) {
    SIDE.stepSimulation(plan, golden, { firePressed: true }); SIDE.stepSimulation(plan, golden, { fireReleased: true });
    for (i = 0; i < plan.player.weapon.cooldownTicks + 6 && !golden.clear; i++) SIDE.stepSimulation(plan, golden, {});
  }
  ok(JSON.stringify(SIDE.simulationSnapshot(golden)) === JSON.stringify(GOLDEN.clear), 'B6a 表现层改动前黄金射击/目标受击/clear snapshot 不漂移');
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
  var golden = SIDE.createSimulation(SIDE.compileLevel(spec(), 'golden-death'));
  golden.xQ = Math.max(compiled.player.spawnXQ, compiled.sentry.xQ - 2 * compiled.tileSizeQ); golden.yQ = compiled.player.spawnYQ; golden.sentry.nextFireTick = 1;
  for (var gi = 0; !golden.dead && gi < 1200; gi++) SIDE.stepSimulation(compiled, golden, {});
  ok(JSON.stringify(SIDE.simulationSnapshot(golden)) === JSON.stringify(GOLDEN.death), 'B7a 表现层改动前黄金玩家受伤/死亡 snapshot 不漂移');
  SIDE.restartSimulation(compiled, golden);
  ok(JSON.stringify(SIDE.simulationSnapshot(golden)) === JSON.stringify(GOLDEN.restart), 'B7b 表现层改动前黄金重开 snapshot 不漂移');
  SIDE.restartSimulation(plan, sim);
  ok(!sim.dead && sim.hp === 3 && sim.sentry.hp === 3 && !sim.clear, 'B8 本局重开恢复 fresh 玩家/哨戒炮/clear');
  var restored = SIDE.createSimulation(plan, true);
  ok(restored.clear && !restored.sentry.active && restored.sentry.hp === 0, 'B9 已完成 durable flag 重进时重建 clear poster，不复活哨戒炮');
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
