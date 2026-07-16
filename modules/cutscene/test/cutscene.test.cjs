'use strict';
/* ════════════════════════════════════════════════════════════════════════
   cutscene 模块回归(committed;进 engine/test/run.cjs)
   ────────────────────────────────────────────────────────────────────────
   覆盖设计稿 §8 全项:fail-loud 全表、推进、跳过一致性核心牙、
   scene 继承回溯、audio 缺键不带、演完停表、离开节点停表、
   确定性双跑、会话局部、引擎集成(真 engine-core)。
   手段:mock rAF 手动泵帧;真 engine-core 集成测。
   ════════════════════════════════════════════════════════════════════════ */
var path = require('path');
var CUTSCENE = path.join(__dirname, '..', 'runtime', 'cutscene.js');
var CORE = path.join(__dirname, '..', '..', '..', 'core', 'runtime', 'engine-core.js');
var AUDIO = path.join(__dirname, '..', '..', '..', 'presenters', 'present-audio.js');

var pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.log('  X  ' + msg); }
}
function section(n) { console.log('── ' + n + ' ──'); }
function throws(fn, label) {
  try { fn(); fail++; console.log('  X  ' + label + ' (未抛错)'); }
  catch (e) { pass++; }
}
function throwsContaining(fn, str, label) {
  try { fn(); fail++; console.log('  X  ' + label + ' (未抛错)'); }
  catch (e) {
    if (e.message && e.message.indexOf(str) >= 0) pass++;
    else { fail++; console.log('  X  ' + label + ' (抛错文案「' + e.message + '」不含「' + str + '」)'); }
  }
}

// ── mock rAF 环境 ──────────────────────────────────────────────────────
var rafCb = null;
global.requestAnimationFrame = function (cb) { rafCb = cb; return 1; };
global.cancelAnimationFrame = function () { rafCb = null; };

// 泵 n 帧,每帧步进 ms 毫秒(默认 16.7ms)
function pump(n, ms) {
  ms = ms == null ? 16.7 : ms;
  var t = 0;
  for (var i = 0; i < n; i++) {
    var cb = rafCb; rafCb = null;
    if (!cb) break;
    t += ms;
    cb(t);
  }
}
// 泵 n 帧,不带时间戳(模拟 jsdom 无时间戳 rAF)
function pumpNoTs(n) {
  for (var i = 0; i < n; i++) {
    var cb = rafCb; rafCb = null;
    if (!cb) break;
    cb(undefined);
  }
}

// ── makeApi:最小 mock api ─────────────────────────────────────────────
function makeApi(extra) {
  var api = {
    state: {},
    _mod: null,
    registerModule: function (mod) { this._mod = mod; },
    linkActions: function (node) {
      // 返回节点 links 的简单包装
      var links = node.links || [];
      return links.map(function (lk, i) {
        return {
          id: lk.id != null ? lk.id : ('link:' + i),
          label: lk.label,
          kind: 'move',
          to: lk.to,
          once: !!lk.once,
          run: lk.run || null,
          available: function () { return true; }
        };
      });
    },
    apply: function (action) {
      if (action && typeof action.run === 'function') action.run(this.state);
    },
    _h: null,
    on: function (e, fn) { if (e === 'enter') this._h = fn; },
    // fire 带 pos(真引擎 emit('enter',{pos,node,first}) 必给 pos;账本键 map/node 的真源是 pos——
    //   缺省从 node.id 兜出,专项测试可显式传 pos 验多节点/多地图账本隔离)
    fire: function (node, pos) {
      var ev = { node: node, pos: pos || { map: 'm1', node: (node && (node.id || node.title)) || 'n1' } };
      if (this._mod && this._mod.systems) this._mod.systems.forEach(function (sys) { if (sys.on === 'enter') sys.run(api.state, ev); });
      else if (this._h) this._h(ev);
    },
    restore: function (state, phase, node, pos, rollback) {
      this.state = state;
      var current = node ? { node: node, kind: node.kind, pos: pos } : null;
      var ev = { phase: phase, source: 'load', rollback: !!rollback, current: current, from: null, to: current };
      if (this._mod && this._mod.systems) this._mod.systems.forEach(function (sys) { if (sys.on === 'restore') sys.run(api.state, ev); });
    }
  };
  if (extra) for (var k in extra) api[k] = extra[k];
  return api;
}

// ── freshMod:每次创建全新模块实例(闭包态独立)────────────────────────
function freshMod(apiOverride) {
  // require 缓存只缓工厂函数本身;每次调 createCutsceneModule() 得到独立闭包
  var factory = require(CUTSCENE);
  var mod = factory.createCutsceneModule();
  var api = makeApi(apiOverride);
  mod.install(api);
  return { mod: mod, api: api };
}

// ── 构造 cutscene 节点 ────────────────────────────────────────────────
function csNode(beats, extra) {
  var n = { id: 'cs1', kind: 'cutscene', title: '序章', beats: beats, links: [] };
  if (extra) for (var k in extra) n[k] = extra[k];
  return n;
}

/* ════ A. fail-loud 全表 ════════════════════════════════════════════════ */
section('A fail-loud');

// A1 beats 缺
(function () {
  var m = freshMod();
  throwsContaining(function () { m.mod.render(m.api.state, { id: 'x', kind: 'cutscene', title: 'x' }); },
    'beats', 'A1 beats 缺 → throw 含 "beats"');
})();

// A2 beats 非数组
(function () {
  var m = freshMod();
  throwsContaining(function () { m.mod.render(m.api.state, csNode('wrong')); },
    'beats', 'A2 beats 非数组 → throw');
})();

// A3 beats 空数组
(function () {
  var m = freshMod();
  throwsContaining(function () { m.mod.render(m.api.state, csNode([])); },
    'beats', 'A3 beats 空数组 → throw');
})();

// A4 dur 非有限正数
(function () {
  var m = freshMod();
  throwsContaining(function () { m.mod.render(m.api.state, csNode([{ dur: -1 }])); },
    'dur', 'A4 dur=-1 → throw 含 "dur"');
})();

// A5 dur 非数字
(function () {
  var m = freshMod();
  throwsContaining(function () { m.mod.render(m.api.state, csNode([{ dur: 'three' }])); },
    'dur', 'A5 dur 非数字 → throw');
})();

// A6 dur 与 hold 都缺
(function () {
  var m = freshMod();
  throwsContaining(function () { m.mod.render(m.api.state, csNode([{ text: 'hello' }])); },
    'dur', 'A6 dur 与 hold 都缺 → throw 含 "dur"');
})();

// A7 hold 非布尔
(function () {
  var m = freshMod();
  throwsContaining(function () { m.mod.render(m.api.state, csNode([{ dur: 1, hold: 'yes' }])); },
    'hold', 'A7 hold 非布尔 → throw 含 "hold"');
})();

// A8 text 非 string/string[]
(function () {
  var m = freshMod();
  throwsContaining(function () { m.mod.render(m.api.state, csNode([{ dur: 1, text: 42 }])); },
    'text', 'A8 text 非串/串数组 → throw');
})();

// A9 scene 非对象
(function () {
  var m = freshMod();
  throwsContaining(function () { m.mod.render(m.api.state, csNode([{ dur: 1, scene: 'sea' }])); },
    'scene', 'A9 scene 非对象 → throw');
})();

// A10 audio 非对象
(function () {
  var m = freshMod();
  throwsContaining(function () { m.mod.render(m.api.state, csNode([{ dur: 1, audio: 123 }])); },
    'audio', 'A10 audio 非对象 → throw');
})();

// A11 run 非函数
(function () {
  var m = freshMod();
  throwsContaining(function () { m.mod.render(m.api.state, csNode([{ dur: 1, run: 'doSomething' }])); },
    'run', 'A11 run 非函数 → throw');
})();

// A12 hold:true + dur 写了 → warn(不 throw),dur 不起效
(function () {
  var warned = [];
  var origWarn = console.warn;
  console.warn = function (msg) { warned.push(msg); };
  var m = freshMod();
  var node = csNode([{ hold: true, dur: 5, text: '等待' }]);
  var v;
  try { v = m.mod.render(m.api.state, node); } catch (e) {}
  console.warn = origWarn;
  ok(v !== undefined, 'A12 hold:true+dur → 不 throw');
  ok(warned.some(function (w) { return w && w.indexOf('dur') >= 0; }), 'A12 hold:true+dur → warn 含 "dur"');
})();

// A13 未知拍字段 → warn 点名
(function () {
  var warned = [];
  var origWarn = console.warn;
  console.warn = function (msg) { warned.push(msg); };
  var m = freshMod();
  var node = csNode([{ dur: 1, txet: '笔误' }]);
  try { m.mod.render(m.api.state, node); } catch (e) {}
  console.warn = origWarn;
  ok(warned.some(function (w) { return w && w.indexOf('txet') >= 0; }), 'A13 未知字段 "txet" → warn 点名');
})();

/* ════ B. 推进(mock rAF 泵帧)══════════════════════════════════════════ */
section('B 推进');

// B1 泵帧到 dur → 游标+1,view().body 为下一拍 text
(function () {
  rafCb = null;
  var m = freshMod();
  var node = csNode([
    { dur: 1, text: '第0拍' },
    { dur: 2, text: '第1拍' }
  ]);
  m.api.fire(node);   // enter → beat0
  var v0 = m.mod.render(m.api.state, node);
  ok(v0.body && v0.body[0] && v0.body[0].text === '第0拍', 'B1a 进入后首帧=beat0 text');
  // 泵到 1 秒(dur=1s → 1000ms / 16.7ms ≈ 60 帧)
  pump(70);
  var v1 = m.mod.render(m.api.state, node);
  ok(v1.body && v1.body[0] && v1.body[0].text === '第1拍', 'B1b 泵够 dur=1s 后 → beat1 text');
})();

// B2 dt 防御:ts=undefined 泵 N 帧,游标不动
(function () {
  rafCb = null;
  var m = freshMod();
  var node = csNode([{ dur: 1, text: 'beat0' }, { dur: 1, text: 'beat1' }]);
  m.api.fire(node);
  // 泵无时间戳帧:dt=0,不推进
  pumpNoTs(200);
  var v = m.mod.render(m.api.state, node);
  ok(v.body && v.body[0] && v.body[0].text === 'beat0', 'B2 dt 防御:ts=undefined 泵不动游标');
})();

// B3 hold 拍泵一万帧不动,点 ▸ 才动
(function () {
  rafCb = null;
  var m = freshMod();
  var node = csNode([
    { hold: true, text: '等待确认' },
    { dur: 1, text: '下一拍' }
  ]);
  m.api.fire(node);
  pump(10000);
  var v0 = m.mod.render(m.api.state, node);
  ok(v0.body && v0.body[0] && v0.body[0].text === '等待确认', 'B3a hold 拍泵一万帧不动');
  // 点 ▸
  var acts = m.mod.actions(m.api.state, node);
  var next = acts.filter(function (a) { return a.id === 'cutscene:next'; })[0];
  ok(next != null && acts.length === 1, 'B3b 中间拍动作面只有 ▸，不提前暴露 links');
  m.api.apply(next);
  var v1 = m.mod.render(m.api.state, node);
  ok(v1.body && v1.body[0] && v1.body[0].text === '下一拍', 'B3c 点 ▸ 后进入下一拍');
})();

/* ════ C. 跳过一致性核心牙 ═════════════════════════════════════════════ */
section('C 跳过一致性');

// C1 连续点 ▸ 逐拍快进，末拍才出现出口；run 顺序与自然播放一致。
(function () {
  rafCb = null;
  var log = [];

  var m1 = freshMod();
  var linkTarget = 'harbor';
  var linkNode = csNode([
    { dur: 0.1, text: 'b0', run: function (S) { S.step0 = 1; log.push('run0'); } },
    { dur: 0.1, text: 'b1', run: function (S) { S.step1 = (S.step0 || 0) + 1; log.push('run1'); } },
    { dur: 0.1, text: 'b2', run: function (S) { S.step2 = (S.step1 || 0) + 1; log.push('run2'); } }
  ], { links: [{ id: 'go', label: '进入游戏', to: linkTarget }] });
  m1.api.fire(linkNode);
  pump(500);
  var stateAfterPlay = JSON.parse(JSON.stringify(m1.api.state));

  log = [];
  var m2 = freshMod();
  var linkNode2 = csNode([
    { dur: 0.1, text: 'b0', run: function (S) { S.step0 = 1; log.push('run0'); } },
    { dur: 0.1, text: 'b1', run: function (S) { S.step1 = (S.step0 || 0) + 1; log.push('run1'); } },
    { dur: 0.1, text: 'b2', run: function (S) { S.step2 = (S.step1 || 0) + 1; log.push('run2'); } }
  ], { links: [{ id: 'go', label: '进入游戏', to: linkTarget }] });
  m2.api.fire(linkNode2);
  rafCb = null;
  var acts0 = m2.mod.actions(m2.api.state, linkNode2);
  ok(acts0.length === 1 && acts0[0].id === 'cutscene:next', 'C1a 首拍只有 ▸，不暴露出口');
  m2.api.apply(acts0[0]);
  var acts1 = m2.mod.actions(m2.api.state, linkNode2);
  ok(acts1.length === 1 && acts1[0].id === 'cutscene:next', 'C1b 中间拍仍只有 ▸');
  m2.api.apply(acts1[0]);
  var acts2 = m2.mod.actions(m2.api.state, linkNode2);
  var wrappedLink = acts2.filter(function (a) { return a.id === 'go'; })[0];
  ok(wrappedLink != null && acts2.some(function (a) { return a.id === 'cutscene:next'; }), 'C1c 末拍才出现出口，并保留 ▸ 演完动作');
  var stateAfterSkip = JSON.parse(JSON.stringify(m2.api.state));
  ok(stateAfterSkip.step0 === stateAfterPlay.step0 && stateAfterSkip.step1 === stateAfterPlay.step1 && stateAfterSkip.step2 === stateAfterPlay.step2,
    'C1d 逐拍快进终态与顺播终态一致(step0/1/2 逐键相等)');
  ok(log[0] === 'run0' && log[1] === 'run1' && log[2] === 'run2', 'C1e 逐拍快进 run 按序执行');
})();

// C1f 手动 next 的目标 run 抛错:游标与账本均不提交、出口不提前出现，可修复后重试。
(function () {
  rafCb = null;
  var attempts = 0, later = 0;
  var m = freshMod();
  var node = csNode([
    { hold: true, text: 'b0' },
    { hold: true, text: 'boom', run: function () { attempts++; if (attempts === 1) throw new Error('NEXT_BOOM'); } },
    { hold: true, text: 'later', run: function () { later++; } }
  ], { links: [{ id: 'go', label: '进入', to: 'end' }] });
  m.api.fire(node, { map: 'm1', node: 'cs1' });
  var next = m.mod.actions(m.api.state, node)[0];
  var message = '';
  try { m.api.apply(next); } catch (err) { message = err.message; }
  var ran = m.api.state._cutscene && m.api.state._cutscene.ran;
  var afterFail = m.mod.actions(m.api.state, node);
  ok(message === 'NEXT_BOOM', 'C1f-a 手动 next 的 run 异常同步传播');
  ok(m.mod.render(m.api.state, node).body[0].text === 'b0' && !(ran && ran['m1/cs1#1']), 'C1f-b 失败后仍停原拍且失败 beat 不记账');
  ok(afterFail.length === 1 && afterFail[0].id === 'cutscene:next' && later === 0, 'C1f-c 失败后出口仍隐藏、后续 beat 未执行');
  m.api.apply(afterFail[0]);
  ok(m.mod.render(m.api.state, node).body[0].text === 'boom' && ran['m1/cs1#1'] === 1, 'C1f-d 第二次可重试并在成功后提交目标拍');
})();

// C1g 自动 tick 保留容错:run 抛错仍进入目标拍并继续时间轴，不逐帧重试。
(function () {
  rafCb = null;
  var attempts = 0;
  var errors = [];
  var originalError = console.error;
  console.error = function (msg) { errors.push(String(msg)); };
  try {
    var m = freshMod();
    var node = csNode([
      { dur: 0.01, text: 'b0' },
      { dur: 0.01, text: 'b1', run: function () { attempts++; throw new Error('AUTO_BOOM'); } },
      { hold: true, text: 'b2' }
    ]);
    m.api.fire(node);
    pump(8, 20);
    ok(m.mod.render(m.api.state, node).body[0].text === 'b2', 'C1g-a 自动 tick 的目标 run 失败后仍推进并继续时间轴');
    ok(attempts === 1 && errors.some(function (x) { return x.indexOf('tick beat.run') >= 0; }), 'C1g-b 自动失败只尝试一次并记录错误，不每帧重试');
  } finally { console.error = originalError; }
})();

// C2 账本:重进重播不重复执行 run(A/V 照播)
(function () {
  rafCb = null;
  var count = 0;
  var m = freshMod();
  var node = csNode([
    { dur: 0.05, text: 'first', run: function (S) { count++; S.runCount = count; } }
  ]);
  // 第一次进入
  m.api.fire(node);
  // 泵完
  pump(100);
  ok(count === 1, 'C2a 首次进入 run 执行一次');
  // 离开节点
  m.api.fire({ kind: 'other' });
  // 再次进入同一节点
  m.api.fire(node);
  pump(100);
  ok(count === 1, 'C2b 重进同节点:run 不重复执行(账本拦截)');
  // A/V 照播:render 仍返回 text
  var v = m.mod.render(m.api.state, node);
  ok(v.body && v.body[0] && v.body[0].text === 'first', 'C2c 重进后 A/V 照播(render 正常)');
})();

// C3 once 出口:包装后 once:true 出口点一次后被 consumed 过滤(第二次 view 不含)
(function () {
  rafCb = null;
  var consumed = false;
  // 用真 engine-core 测 once 消耗
  var Amatlas = require(CORE);
  var CS = require(CUTSCENE);
  var world = {
    id: '19191919-1919-4919-8919-191919191919', start: { map: 'm', node: 'cs' },
    maps: { m: { name: 'test', nodes: {
      cs: { kind: 'cutscene', id: 'cs', title: '序章', beats: [{ hold: true, text: '等待' }],
            links: [{ id: 'once-link', label: '仅一次', to: 'cs', once: true }] },
    } } }
  };
  var e = Amatlas.createEngine(world, {});
  e.use(CS.createCutsceneModule());
  e.start();
  var acts1 = e.view().actions.filter(function (a) { return a.id === 'once-link'; });
  ok(acts1.length === 1, 'C3a 首次:once 出口可见');
  e.apply(acts1[0]);
  // 回到同一节点(to:'cs'),once 已消耗
  var acts2 = e.view().actions.filter(function (a) { return a.id === 'once-link'; });
  ok(acts2.length === 0, 'C3b 点一次后 once 出口消失(consumed)');
})();

/* ════ D. scene 继承 / audio 缺键 ════════════════════════════════════ */
section('D scene/audio');

// C4 link.run 返回字符串:先在过场源节点显示回应，再由「继续」导航；不得静默丢到目标节点。
(function () {
  rafCb = null;
  var Amatlas = require(CORE);
  var CS = require(CUTSCENE);
  var world = {
    id: '30303030-3030-4030-8030-303030303030', start: { map: 'm', node: 'cs' },
    maps: { m: { nodes: {
      cs: { kind: 'cutscene', title: '源过场', beats: [{ hold: true, text: '源拍' }],
        links: [{ id: 'answer', label: '作答', to: 'end', run: function (S) { S.answered = true; return '回答被听见了。'; } }] },
      end: { kind: 'cutscene', title: '目标', beats: [{ hold: true, text: '目标拍' }], links: [] }
    } } }
  };
  var e = Amatlas.createEngine(world, { storage: null });
  e.use(CS.createCutsceneModule());
  e.start();
  e.apply(e.view().actions.filter(function (a) { return a.id === 'answer'; })[0]);
  var result = e.view();
  ok(e.state.answered === true && e.state.pos.node === 'cs', 'C4a link.run 状态已结算，但带回应的移动先停在源过场');
  ok(result.view.body.some(function (b) { return b.text === '回答被听见了。'; }), 'C4b link.run 返回字符串在源节点回应帧可见');
  var cont = result.actions.filter(function (a) { return a.id === 'cutscene:continue'; })[0];
  ok(!!cont && result.actions.length === 1, 'C4c 回应帧只给「继续」动作，目标不被静默跳过');
  var responseSave = e.serialize();
  var e2 = Amatlas.createEngine(world, { storage: null });
  e2.use(CS.createCutsceneModule());
  ok(e2.load(responseSave) === true && e2.view().actions.some(function (a) { return a.id === 'cutscene:continue'; }), 'C4d 回应后的待继续目的地入档，刷新/读档不丢导航');
  e.apply(cont);
  ok(e.state.pos.node === 'end', 'C4e 点继续后走标准核心导航到目标节点');
})();

// D1 第 3 拍无 scene → view.scene === 第 2 拍对象(严格 === 同引用)
(function () {
  rafCb = null;
  var scene0 = { region: 'night', mood: 'tense' };
  var scene1 = { region: 'sea', mood: 'calm' };
  var m = freshMod();
  var node = csNode([
    { dur: 0.05, scene: scene0, text: 'b0' },
    { dur: 0.05, scene: scene1, text: 'b1' },
    { dur: 0.05, text: 'b2' }   // 无 scene
  ]);
  m.api.fire(node);
  pump(20);   // → beat1
  pump(20);   // → beat2
  var v = m.mod.render(m.api.state, node);
  ok(v.scene === scene1, 'D1 第3拍无 scene → 继承第2拍 scene(=== 同引用)');
})();

// D2 audio 缺键不带(view 无 audio 键)
(function () {
  rafCb = null;
  var m = freshMod();
  var node = csNode([{ dur: 1, text: 'no audio' }]);
  m.api.fire(node);
  var v = m.mod.render(m.api.state, node);
  ok(!('audio' in v), 'D2 无 audio 字段的拍 → view 不带 audio 键(present-audio v15 继承)');
})();

// D3 cutscene 多拍 audio 与 present-audio v15 继承集成:首拍起 music,中间拍不写 audio → 不重启;换 key 才交叉淡变
(function () {
  function makeMockCtx() {
    var log = [];
    function gainNode() {
      return { gain: { value: 0, setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {}, linearRampToValueAtTime: function (v, t) { log.push('gain.linRamp:' + v + '@' + t); } }, connect: function () {}, disconnect: function () {} };
    }
    var ctx = {
      currentTime: 0, sampleRate: 44100, destination: {}, state: 'suspended',
      createGain: function () { return gainNode(); },
      createOscillator: function () {
        var o = { type: '', frequency: { value: 0, setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} }, detune: { value: 0, setValueAtTime: function () {} }, connect: function () {}, disconnect: function () {}, setPeriodicWave: function () {}, start: function () { log.push('osc.start:' + o.frequency.value); }, stop: function (t) { log.push('osc.stop'); if (t != null) log.push('osc.stopAt:' + t); } };
        log.push('createOscillator'); return o;
      },
      createWaveShaper: function () { log.push('createWaveShaper'); return { curve: null, connect: function () {}, disconnect: function () {} }; },
      createBiquadFilter: function () { log.push('createBiquadFilter'); return { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect: function () {}, disconnect: function () {} }; },
      createBufferSource: function () { log.push('createBufferSource'); return { buffer: null, connect: function () {}, disconnect: function () {}, start: function () { log.push('src.start'); }, stop: function () { log.push('src.stop'); } }; },
      createBuffer: function (ch, len) { log.push('createBuffer'); return { getChannelData: function () { return new Float32Array(len || 8); } }; },
      createConvolver: function () { log.push('createConvolver'); return { buffer: null, normalize: true, connect: function () {}, disconnect: function () {} }; },
      createStereoPanner: function () { log.push('createStereoPanner'); return { pan: { value: 0, setValueAtTime: function () {} }, connect: function () {}, disconnect: function () {} }; },
      createDelay: function () { log.push('createDelay'); return { delayTime: { value: 0 }, connect: function () {}, disconnect: function () {} }; },
      createDynamicsCompressor: function () { log.push('createDynamicsCompressor'); return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: function () {}, disconnect: function () {} }; },
      createPeriodicWave: function () { log.push('createPeriodicWave'); return {}; },
      createConstantSource: function () { log.push('createConstantSource'); return { offset: { value: 0, setValueAtTime: function () {}, setTargetAtTime: function () {}, linearRampToValueAtTime: function () {} }, connect: function () {}, disconnect: function () {}, start: function () {}, stop: function () {} }; },
      resume: function () {}, close: function () {}
    };
    ctx._log = log; return ctx;
  }
  function nOsc(ctx) { return ctx._log.filter(function (x) { return x === 'createOscillator'; }).length; }
  function has(ctx, e) { return ctx._log.some(function (x) { return x === e || x.indexOf(e) === 0; }); }

  rafCb = null;
  var AudioPresenter = require(AUDIO);
  var ctx = makeMockCtx();
  var audio = AudioPresenter.createAudioPresenter({ context: ctx, storage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} } });
  var m = freshMod();
  var node = csNode([
    { hold: true, text: '起乐', audio: { music: 'calm', ambient: 'waves' } },
    { hold: true, text: '继承声场' },
    { hold: true, text: '换曲', audio: { music: 'tense' } }
  ]);
  m.api.fire(node);
  audio.present({ view: m.mod.render(m.api.state, node) });
  var afterFirst = nOsc(ctx);
  ok(afterFirst > 0 && has(ctx, 'gain.linRamp:1@'), 'D3a 首拍 audio.music → present-audio 起曲且淡入');

  m.api.apply(m.mod.actions(m.api.state, node)[0]);
  audio.present({ view: m.mod.render(m.api.state, node) });
  var afterInherited = nOsc(ctx);
  ok(afterInherited === afterFirst, 'D3b 中间拍不写 audio → view 无 audio 键,present-audio 继承且不重启 music');

  m.api.apply(m.mod.actions(m.api.state, node)[0]);
  audio.present({ view: m.mod.render(m.api.state, node) });
  ok(nOsc(ctx) > afterInherited && has(ctx, 'gain.linRamp:0.0001@') && has(ctx, 'osc.stopAt:1'), 'D3c 后续拍换 music key → 旧曲淡出停、新曲重排(交叉淡变)');
})();

// D4 text 数组多条 prose
(function () {
  rafCb = null;
  var m = freshMod();
  var node = csNode([{ dur: 1, text: ['第一行', '第二行', '第三行'] }]);
  m.api.fire(node);
  var v = m.mod.render(m.api.state, node);
  ok(Array.isArray(v.body) && v.body.length === 3 &&
     v.body[0].text === '第一行' && v.body[2].text === '第三行', 'D3 text 数组 → 多条 prose');
})();

/* ════ E. 生命周期 ═══════════════════════════════════════════════════ */
section('E 生命周期');

// E1 演完停表(末拍计时到 → ended=true,计时器停)
(function () {
  rafCb = null;
  var m = freshMod();
  var node = csNode([{ dur: 0.05, text: 'only' }]);
  m.api.fire(node);
  pump(200);  // 泵很多帧
  // 演完后 actions = 素 linkActions(无 ▸)
  var acts = m.mod.actions(m.api.state, node);
  ok(!acts.some(function (a) { return a.id === 'cutscene:next'; }), 'E1 演完 → 无 ▸ 按钮');
  ok(rafCb === null, 'E1 演完 → 计时器停(rafCb=null)');
})();

// E2 离开节点停表
(function () {
  rafCb = null;
  var m = freshMod();
  var node = csNode([{ dur: 10, text: 'long' }]);
  m.api.fire(node);
  ok(rafCb !== null, 'E2a 进入 cutscene → 计时器起');
  m.api.fire({ kind: 'other-kind' });  // 离开
  ok(rafCb === null, 'E2b 离开节点 → 计时器停');
})();

// E2b 真核心 api.apply 会同步 render；进入非 hold 首拍后仍只能有一条 rAF，不能 system 返回再双挂。
(function () {
  var oldRequest = global.requestAnimationFrame;
  var oldCancel = global.cancelAnimationFrame;
  var scheduled = 0;
  global.requestAnimationFrame = function () { scheduled++; return scheduled; };
  global.cancelAnimationFrame = function () {};
  try {
    var Amatlas = require(CORE);
    var CS = require(CUTSCENE);
    var world = {
      id: '20202020-2020-4020-8020-202020202020',
      start: { map: 'm', node: 'c' },
      maps: { m: { nodes: {
        c: { kind: 'cutscene', beats: [{ dur: 1, text: 'b0' }, { hold: true, text: 'b1' }], links: [] }
      } } }
    };
    var e = Amatlas.createEngine(world, { storage: null, onRender: function () {} });
    e.use(CS.createCutsceneModule());
    e.start();
    ok(scheduled === 1, 'E2b 真核心进入非 hold 首拍只排一条 rAF');
  } finally {
    global.requestAnimationFrame = oldRequest;
    global.cancelAnimationFrame = oldCancel;
    rafCb = null;
  }
})();

// E2c cancel 与浏览器已出队回调竞态:旧会话 callback 即使晚到，也不得在新会话旁再挂一条 rAF。
(function () {
  var oldRequest = global.requestAnimationFrame;
  var oldCancel = global.cancelAnimationFrame;
  var pending = {}, nextId = 1;
  global.requestAnimationFrame = function (cb) { var id = nextId++; pending[id] = cb; return id; };
  global.cancelAnimationFrame = function (id) { delete pending[id]; };
  try {
    var m = freshMod();
    var node = csNode([{ dur: 1, text: 'b0' }, { hold: true, text: 'b1' }]);
    m.api.fire(node);
    var firstId = Number(Object.keys(pending)[0]);
    var stale = pending[firstId];
    m.api.fire({ kind: 'other' });
    m.api.fire(node);
    ok(Object.keys(pending).length === 1, 'E2c-a 离开后重进只有新会话一条 rAF');
    stale(16.7); // 模拟 cancel 前已经从浏览器队列出队、稍后才真正执行的旧 callback
    ok(Object.keys(pending).length === 1, 'E2c-b 旧会话 callback 晚到应 no-op，不得在新 rAF 旁重挂幽灵帧');
  } finally {
    global.requestAnimationFrame = oldRequest;
    global.cancelAnimationFrame = oldCancel;
    rafCb = null;
  }
})();

// E2d callback 执行内部的 api.apply 导致离场，也不得在返回后用新 generation 重挂幽灵帧。
(function () {
  var oldRequest = global.requestAnimationFrame;
  var oldCancel = global.cancelAnimationFrame;
  var pending = {}, nextId = 1;
  global.requestAnimationFrame = function (cb) { var id = nextId++; pending[id] = cb; return id; };
  global.cancelAnimationFrame = function (id) { delete pending[id]; };
  try {
    var m;
    m = freshMod({ apply: function (action) {
      if (action && typeof action.run === 'function') action.run(this.state);
      if (this.leaveDuringTick) { this.leaveDuringTick = false; this.fire({ kind: 'other' }); }
    } });
    var node = csNode([{ dur: 0.001, text: 'b0' }, { hold: true, text: 'b1' }]);
    m.api.fire(node);
    var first = pending[Number(Object.keys(pending)[0])];
    pending = {};
    first(0); // 首帧只落 last
    var next = pending[Number(Object.keys(pending)[0])];
    pending = {};
    m.api.leaveDuringTick = true;
    next(10); // advance 的 apply 内 fire(other) → cancel/generation++
    ok(Object.keys(pending).length === 0, 'E2d tick 内离场后 callback 返回不得重挂幽灵 rAF');
  } finally {
    global.requestAnimationFrame = oldRequest;
    global.cancelAnimationFrame = oldCancel;
    rafCb = null;
  }
})();

// E3 重进同节点 → cursor 归零重播(账本防 run 重复)
(function () {
  rafCb = null;
  var m = freshMod();
  var node = csNode([
    { dur: 0.05, text: 'b0' },
    { dur: 0.05, text: 'b1' }
  ]);
  m.api.fire(node);
  pump(100);  // 泵到 beat1
  var v0 = m.mod.render(m.api.state, node);
  ok(v0.body[0].text === 'b1', 'E3a 泵帧后在 beat1');
  // 离开 + 重进
  m.api.fire({ kind: 'other' });
  m.api.fire(node);
  var v1 = m.mod.render(m.api.state, node);
  ok(v1.body[0].text === 'b0', 'E3b 重进 → cursor 归零(从 beat0 重播)');
})();

// E3c hold 拍点 ▸ 进入普通计时拍后，动作边界必须显式续表；render 本身仍不拥有启动职责。
(function () {
  rafCb = null;
  var m = freshMod();
  var node = csNode([{ hold: true, text: 'hold' }, { dur: 1, text: 'timed' }]);
  m.api.fire(node);
  ok(rafCb === null, 'E3c-a hold 首拍不排 rAF');
  var next = m.mod.actions(m.api.state, node).filter(function (a) { return a.id === 'cutscene:next'; })[0];
  m.api.apply(next);
  ok(rafCb !== null, 'E3c-b hold→timed 后必须显式启动 rAF，不能永久停在新拍');
})();

// E4 render 不再隐式启动实时会话；恢复必须走 critical restore activate。
(function () {
  rafCb = null;
  var m = freshMod();
  var node = csNode([{ dur: 1, text: 'b0' }, { dur: 1, text: 'b1' }]);
  m.api.fire(node);
  m.api.fire({ kind: 'other' });
  ok(rafCb === null, 'E4_pre 离开节点后计时器停');
  var restored = { pos: { map: 'm1', node: 'cs1' }, _cutscene: { ran: {} } };
  var v = m.mod.render(restored, node);
  ok(v.body[0].text === 'b0' && rafCb === null, 'E4a render 只产 View，不再偷偷补挂计时器');
  m.api.restore(restored, 'activate', node, restored.pos);
  ok(rafCb !== null, 'E4b restore activate 明确启动计时器');
})();

/* ════ F. tick 内 run 抛错不死计时器 ═══════════════════════════════════ */
section('F 容错');

(function () {
  rafCb = null;
  var errored = false;
  var origErr = console.error;
  console.error = function (msg) { errored = true; };
  var m = freshMod();
  var node = csNode([
    { dur: 0.05, text: 'b0', run: function () { throw new Error('test error'); } },
    { dur: 0.05, text: 'b1' }
  ]);
  m.api.fire(node);
  pump(100);
  // 即使 run 抛错,计时器仍继续推进(不死)
  var v = m.mod.render(m.api.state, node);
  console.error = origErr;
  ok(errored, 'F1 run 抛错 → console.error 被调');
  // 计时器应继续推进(beat1)
  ok(v.body && (v.body[0].text === 'b0' || v.body[0].text === 'b1'), 'F1 run 抛错后计时器未死(可继续)');
})();

// F2 tick 内 api.apply 包 try/catch:beat1.run 抛错时计时器不死(反向变异牙 — mutation b)
// beat0 run 在 enter 的 apply 里执行(不在 tick 里),beat1 run 才经 tick 的 api.apply 路径
(function () {
  rafCb = null;
  var errCount = 0;
  var origErr = console.error;
  console.error = function () { errCount++; };
  var m = freshMod();
  var node = csNode([
    { dur: 0.05, text: 'b0' },                                          // beat0:无 run,enter 路径
    { dur: 0.05, text: 'b1', run: function () { throw new Error('tick-run-error'); } }, // beat1:tick 路径
    { dur: 0.05, text: 'b2' }
  ]);
  m.api.fire(node); // enter → beat0 start
  // 泵到 beat1(dur=0.05s=50ms; 16.7*4≈67ms > 50ms)
  pump(5);  // 5*16.7=83.5ms → beat1
  var vMid = m.mod.render(m.api.state, node);
  // beat1 run 应已执行(可能 throw → errCount 增)、计时器应仍活着
  pump(5);  // 再泵到 beat2
  var vFinal = m.mod.render(m.api.state, node);
  console.error = origErr;
  ok(errCount > 0, 'F2a beat1.run 抛错 → console.error 被调(tick try/catch 生效)');
  ok(vFinal.body && vFinal.body[0] && vFinal.body[0].text === 'b2',
    'F2b tick 内 run 抛错后计时器未死(进到 beat2)');
})();

/* ════ G. 会话局部 ══════════════════════════════════════════════════ */
section('G 会话局部');

(function () {
  rafCb = null;
  var m = freshMod();
  var node = csNode([{ dur: 0.05, text: 'b0' }, { dur: 0.05, text: 'b1' }]);
  m.api.fire(node);
  pump(100);
  // state 序列化不含 cursor/elapsed 字样(账本 ran 除外)
  var str = JSON.stringify(m.api.state);
  var parsed = JSON.parse(str);
  var keys = Object.keys(parsed);
  ok(!keys.some(function (k) { return k === 'cursor' || k === 'elapsed'; }),
    'G1 state 序列化不含 cursor/elapsed 键(会话局部;账本 ran 除外)');
  // 账本键应存在
  ok(parsed._cutscene && parsed._cutscene.ran, 'G2 state 含 _cutscene.ran 账本');
  // cursor 绝不能进 state._cutscene(反向变异牙 — mutation e)
  ok(!(parsed._cutscene && 'cursor' in parsed._cutscene),
    'G3 state._cutscene 不含 cursor 键(cursor 必须住闭包,§4.3/§10-12)');
})();

/* ════ G2. dt 防御混合场景(反向变异牙 — mutation c)═════════════════════ */
// B2 只测全-undefined;这里测「undefined 帧后接真实时间戳帧」不污染 elapsed
(function () {
  rafCb = null;
  var m = freshMod();
  var node = csNode([{ dur: 0.5, text: 'b0' }, { dur: 0.5, text: 'b1' }]);
  m.api.fire(node);
  // 先泵几帧 undefined ts → elapsed 应仍为 0(或不含 NaN)
  pumpNoTs(5);
  var v0 = m.mod.render(m.api.state, node);
  ok(v0.body[0].text === 'b0', 'G4 undefined ts 帧不推进游标');
  // 再泵真实 ts 帧:500ms/16.7ms ≈ 30 帧才到 0.5s
  pump(35);
  var v1 = m.mod.render(m.api.state, node);
  ok(v1.body[0].text === 'b1', 'G5 undefined-ts 后接真实 ts:elapsed 从 0 累加到达 dur → 游标推进');
})();

/* ════ G3. advance 路径账本(反向变异牙 — mutation d)═══════════════════ */
// C2 只测 beat0(通过 enter 路径);这里测 beat1(通过 tick→advance 路径)不重复执行
(function () {
  rafCb = null;
  var count0 = 0, count1 = 0;
  var m = freshMod();
  var node = csNode([
    { dur: 0.05, text: 'b0', run: function (S) { count0++; } },
    { dur: 5,    text: 'b1', run: function (S) { count1++; } }  // dur 长保持在 b1
  ]);
  // 第一次进入,泵过 b0 → b1
  m.api.fire(node);
  pump(10); // 10*16.7=167ms > 50ms → advance to beat1, beat1.run 执行
  ok(count1 === 1, 'G6a 首次 advance 到 beat1:run 执行一次');
  // 离开 + 重进 → beat1.run 不应重复(账本在 advance 路径也保护)
  m.api.fire({ kind: 'other' });
  m.api.fire(node);       // 重进 → cursor=0, beat0.run 被账本拦(count0=1)
  pump(10);               // 泵过 b0 → b1 again
  ok(count1 === 1, 'G6b 重进后 advance 到 beat1:run 不重复执行(advance 路径账本)');
})();

/* ════ H. 确定性双跑 ═══════════════════════════════════════════════ */
section('H 确定性');

(function () {
  // 相同 beats + 相同泵帧序列 → 两轮 view 序列逐字节相等
  function run1() {
    rafCb = null;
    var m = freshMod();
    var node = csNode([
      { dur: 0.05, text: '第一拍' },
      { dur: 0.05, text: '第二拍' }
    ]);
    m.api.fire(node);
    var views = [];
    views.push(JSON.stringify(m.mod.render(m.api.state, node)));
    pump(20);
    views.push(JSON.stringify(m.mod.render(m.api.state, node)));
    pump(20);
    views.push(JSON.stringify(m.mod.render(m.api.state, node)));
    return views;
  }
  var r1 = run1(), r2 = run1();
  ok(r1[0] === r2[0] && r1[1] === r2[1] && r1[2] === r2[2],
    'H1 确定性双跑:相同泵帧序列 → view 序列逐字节相等');
})();

/* ════ I. 引擎集成(真 engine-core)══════════════════════════════════ */
section('I 引擎集成');

(function () {
  rafCb = null;
  var Amatlas = require(CORE);
  var CS = require(CUTSCENE);

  var world = {
    id: '19191919-1919-4919-8919-191919191919', start: { map: 'm', node: 'intro' },
    maps: { m: { name: 'test', nodes: {
      intro: {
        kind: 'cutscene', id: 'intro', title: '序章',
        beats: [
          { dur: 1, text: '第一拍', scene: { region: 'night', mood: 'tense' } },
          { hold: true, text: '第二拍(等待)' }
        ],
        links: [{ id: 'go', label: '进入', to: 'game' }]
      },
      game: { kind: 'cutscene', id: 'game', title: '游戏', beats: [{ hold: true, text: '游戏' }], links: [] }
    } } }
  };

  var e = Amatlas.createEngine(world, {});
  e.use(CS.createCutsceneModule());
  e.start();

  var snap = e.view();
  ok(snap.view.title === '序章', 'I1 引擎集成:起点 cutscene 节点 title 正确');
  ok(snap.view.body && snap.view.body[0] && snap.view.body[0].text === '第一拍', 'I2 引擎集成:首帧 body 为 beat0 text');
  ok(snap.view.scene && snap.view.scene.region === 'night', 'I3 引擎集成:scene 回传');
  ok(snap.actions.length === 1 && snap.actions[0].id === 'cutscene:next', 'I4 引擎集成:首拍只有 ▸，不提前暴露出口');
  e.apply(snap.actions[0]);
  var last = e.view();
  var goAct = last.actions.filter(function (a) { return a.id === 'go'; })[0];
  ok(goAct != null, 'I5 引擎集成:进入末拍后出口出现');
  e.apply(goAct);
  ok(e.state.pos.node === 'game', 'I6 点末拍出口 → 导航到目标节点');
})();

// I7 9 拍夹具:前 8 拍只见 ▸，逐拍快进到末拍才出现出口。
(function () {
  rafCb = null;
  var Amatlas = require(CORE);
  var CS = require(CUTSCENE);
  var beats9 = [];
  for (var i = 0; i < 9; i++) beats9.push({ hold: true, text: '拍' + i });
  var world = {
    id: '19191919-1919-4919-8919-191919191919', start: { map: 'm', node: 'long' },
    maps: { m: { name: 'test', nodes: {
      long: { kind: 'cutscene', id: 'long', title: '长过场', beats: beats9, links: [{ id: 'exit', label: '进入结局', to: 'end' }] },
      end: { kind: 'cutscene', id: 'end', title: '结束', beats: [{ hold: true, text: '完' }], links: [] }
    } } }
  };
  var e = Amatlas.createEngine(world, {});
  e.use(CS.createCutsceneModule());
  e.start();
  var middleOnlyNext = true;
  for (var step = 0; step < 8; step++) {
    var acts = e.view().actions;
    if (acts.length !== 1 || acts[0].id !== 'cutscene:next') middleOnlyNext = false;
    e.apply(acts[0]);
  }
  ok(middleOnlyNext && e.view().actions.some(function (a) { return a.id === 'exit'; }), 'I7 9 拍过场前 8 拍只有 ▸，末拍才暴露出口');
})();

// I7 多地图同 id 节点账本隔离(nodeKey 格式 'map/node#beatIdx' — §4.3 回归)
// 多地图游戏中两张地图各有同 id cutscene 节点:进第一张地图节点 → run 执行 → 进第二张地图同 id 节点 → run 应再次执行(账本互不干扰)。
// 修复前:nodeKey 只用 node.id → 第二张地图账本被第一张拦 → run2 不执行(count1 误为 0)。
(function () {
  rafCb = null;
  var Amatlas = require(CORE);
  var CS = require(CUTSCENE);
  var run1 = 0, run2 = 0;
  var world = {
    id: '19191919-1919-4919-8919-191919191919', start: { map: 'map1', node: 'cs' },
    maps: {
      map1: { name: '地图1', nodes: {
        cs: { kind: 'cutscene', id: 'cs', title: '序章1',
              beats: [{ hold: true, text: 'map1', run: function (S) { run1++; } }],
              links: [{ id: 'goto-map2', label: '前往地图2', to: { map: 'map2', node: 'cs' } }] }
      } },
      map2: { name: '地图2', nodes: {
        cs: { kind: 'cutscene', id: 'cs', title: '序章2',
              beats: [{ hold: true, text: 'map2', run: function (S) { run2++; } }],
              links: [] }
      } }
    }
  };
  var e = Amatlas.createEngine(world, {});
  e.use(CS.createCutsceneModule());
  e.start();
  // map1/cs 进入:beat0 run1 执行一次
  ok(run1 === 1, 'I7a map1/cs 进入 → run1 执行一次');
  // 导航到 map2/cs
  var goAct = e.view().actions.filter(function (a) { return a.id === 'goto-map2'; })[0];
  ok(goAct != null, 'I7b map2 跳转出口可见');
  e.apply(goAct);
  // map2/cs 进入:beat0 run2 应执行(账本键 'map2/cs#0' ≠ 'map1/cs#0')
  ok(run2 === 1, 'I7c map2/cs 进入 → run2 执行一次(账本按地图隔离,不被 map1 账本拦截)');
})();

/* ════ Z. 主循环亲验补牙(C1 复核发现的三个真问题;两端锁)══════════════ */
section('Z 亲验补牙');

// Z1 账本键真源 = pos.node:两个**没有 id/title 字段**的 cutscene 节点(world 里 id 本是 nodes 表的键、
//    节点对象常不带 .id)——若键退回 node.id||node.title 会同落 '?' → 跨节点账本碰撞 → 第二个节点的
//    run 被静默跳过。修后以 fire 传入的 pos.node 为键源,两节点 run 各自执行。
(function () {
  var m = freshMod();
  var ranA = 0, ranB = 0;
  var nodeA = { kind: 'cutscene', beats: [{ hold: true, run: function () { ranA++; } }], links: [] };
  var nodeB = { kind: 'cutscene', beats: [{ hold: true, run: function () { ranB++; } }], links: [] };
  m.api.fire(nodeA, { map: 'm1', node: 'a' });
  ok(ranA === 1, 'Z1a 节点 a(无 id/title)beat0 run 执行');
  m.api.fire(nodeB, { map: 'm1', node: 'b' });
  ok(ranB === 1, 'Z1b 节点 b(无 id/title)beat0 run 执行(账本键取 pos.node,不与 a 碰撞)');
  ok(m.api.state._cutscene && m.api.state._cutscene.ran['m1/a#0'] === 1 && m.api.state._cutscene.ran['m1/b#0'] === 1,
    'Z1c 账本键为 m1/a#0 与 m1/b#0(pos.node 为源)');
})();

// Z2 读档跳到另一 cutscene 节点：critical restore 明确停 A、启 B，不再由 render 猜 state 引用。
(function () {
  var m = freshMod();
  ok(m.mod.systems.some(function (sys) { return sys.on === 'restore'; }), 'Z2 restore 必须是 critical module system，不能继续只靠 render 猜恢复');
  var nodeA = { kind: 'cutscene', beats: [{ dur: 0.01, text: 'A0' }, { hold: true, text: 'A1' }], links: [] };
  var nodeB = { kind: 'cutscene', beats: [{ dur: 0.01, text: 'B0' }, { hold: true, text: 'B1' }], links: [] };
  m.api.fire(nodeA, { map: 'm1', node: 'a' });
  pump(3, 10);   // A 推进到 A1(hold)
  m.api.restore(m.api.state, 'deactivate', nodeA, { map: 'm1', node: 'a' });
  var restored = { pos: { map: 'm1', node: 'b' }, _cutscene: { ran: {} } };
  m.api.restore(restored, 'activate', nodeB, { map: 'm1', node: 'b' });
  var v = m.mod.render(restored, nodeB);
  ok(v.body.length === 1 && v.body[0].text === 'B0', 'Z2a restore 跳节点 → 游标归零、渲染 B 的 beat0(非 A 的游标位)');
  ok(rafCb !== null, 'Z2b restore activate → 计时器已排帧');
  pump(3, 10);   // 推进 B
  var v2 = m.mod.render(restored, nodeB);
  ok(v2.body[0].text === 'B1', 'Z2c restore 启动的计时器真能推进 B 到 beat1');
})();

// Z2d 同一 cutscene 节点读旧档:state 引用已由 core hydrate 替换，但 load 不发 enter。
//     文档承诺播放进度不入档，所以必须从 beat0 重播；旧版因 currentNode===node 留在 beat1。
(function () {
  rafCb = null;
  var Amatlas = require(CORE);
  var CS = require(CUTSCENE);
  var world = {
    id: '29292929-2929-4929-8929-292929292929', start: { map: 'm', node: 'cs' },
    maps: { m: { nodes: {
      cs: { kind: 'cutscene', title: '同节点读档', beats: [
        { hold: true, text: '旧档开头' },
        { hold: true, text: '会话后段' }
      ], links: [] }
    } } }
  };
  var e = Amatlas.createEngine(world, { storage: null });
  e.use(CS.createCutsceneModule());
  e.start();
  var oldSave = e.serialize();
  e.apply(e.view().actions.filter(function (a) { return a.id === 'cutscene:next'; })[0]);
  ok(e.view().view.body[0].text === '会话后段', 'Z2d-a 当前会话已推进到 beat1');
  ok(e.load(oldSave) === true, 'Z2d-b 同节点旧档 load 成功');
  ok(e.view().view.body[0].text === '旧档开头', 'Z2d-c 同节点读档也从 beat0 重播(播放进度不入档)');
})();

// Z3 exits 旁路拦截:cutscene 节点写 exits(核心 defaultMoves 会不经包装并入动作 → 跳过不一致)→ 解析期 throw;
//    exits:[] 空数组不抛(无害);links 照常。
(function () {
  var m = freshMod();
  throwsContaining(function () {
    m.mod.render(m.api.state, { kind: 'cutscene', title: 'x', beats: [{ hold: true }], exits: [{ to: 'y' }], links: [] });
  }, 'exits', 'Z3a 写 exits → throw 且文案点名 exits→links');
  var m2 = freshMod();
  var v = null;
  try { v = m2.mod.render(m2.api.state, { kind: 'cutscene', title: 'x2', beats: [{ hold: true, text: 'ok' }], exits: [], links: [] }); } catch (e) {}
  ok(v && v.body[0].text === 'ok', 'Z3b exits 空数组不抛(无害形态)');
})();

/* ════ 汇总 ════════════════════════════════════════════════════════ */
console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
