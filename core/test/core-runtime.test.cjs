/* Amatlas 核心内核 (core/runtime) 验证 —— 纯 node、零依赖(核心 DOM-free),无需 jsdom。
   覆盖:状态转移 + once 消耗 / 跨地图移动 / RNG 同种子复现 + 随档复现 / 存档往返 / 死链 / 事件总线。 */
const ENGINE_CORE = require('../runtime/engine-core.js');
const { createEngine } = ENGINE_CORE;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } }
function throws(fn) { try { fn(); return false; } catch (e) { return true; } }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// 类型无关的示例世界:两张地图(a / b),节点 kind='demo',连接放在 node.exits(核心据此默认生成移动)
function makeWorld() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    start: { map: 'a', node: 'home' },
    seed: 12345,
    maps: {
      a: { name: 'A', nodes: {
        home:   { kind: 'demo', title: '家',   exits: [ { to: 'garden', label: '去花园' }, { to: { map: 'b', node: 'gate' }, label: '去B' } ] },
        garden: { kind: 'demo', title: '花园', exits: [ { to: 'home', label: '回家' } ] }
      } },
      b: { name: 'B', nodes: {
        gate:   { kind: 'demo', title: '门',   exits: [ { to: { map: 'a', node: 'home' }, label: '去A' } ] }
      } }
    }
  };
}

// stub 模块(工厂:每个引擎独立 ENG 闭包):render 返回呈现无关 View;actions 用核心服务;system 订阅 enter
function makeStub() {
  let ENG;
  return {
    id: 'stub', nodeKinds: ['demo'],
    init: function (api) { ENG = api; },
    render: function (state, node) {
      return { title: node.title, body: [ { type: 'text', text: '到访' + (state.seen[state.pos.map + '/' + state.pos.node] || 0) + '次' } ] };
    },
    actions: function (state) {
      return [
        { id: 'wave', label: '挥手(一次性)', once: true, run: function (s) { s.flags.waved = true; } },
        { id: 'roll', label: '掷骰', run: function (s) { s.lastRoll = ENG.dice(2, 6); } }
      ];
    },
    systems: [ { on: 'enter', run: function (s) { s.entered = (s.entered || 0) + 1; } } ]
  };
}

function fresh(extraOpts) {
  const e = createEngine(makeWorld(), Object.assign({ storage: null }, extraOpts || {}));
  e.registerModule(makeStub());
  e.start();
  return e;
}
function findAction(e, id) { return e.view().actions.filter(function (a) { return a.id === id; })[0]; }

console.log('S2 engine-core 验证');

// A. 启动 + dispatch:起点正确,seen=1,render 经模块产出 View,默认移动动作生成
(function () {
  const e = fresh();
  const v = e.view();
  ok('A1 起点 pos = a/home', eq(e.state.pos, { map: 'a', node: 'home' }));
  ok('A2 首次到访 seen=1 且 firstTime', e.state.seen['a/home'] === 1 && e.firstTime());
  ok('A3 模块 render 产出 View.title', v.view.title === '家');
  ok('A4 核心据 exits 默认生成 2 个移动动作', v.actions.filter(function (a) { return a.kind === 'move'; }).length === 2);
  ok('A5 view 信封暴露当前节点 nodeKind(供 CSS hook 使用,非模块 View 字段)', v.nodeKind === 'demo' && v.view.nodeKind == null);
  ok('A6 事件总线:system 收到 enter(entered=1)', e.state.entered === 1);
})();

// A'. Observer 异常隔离:listener 只能观察，不能把核心事务截成 state 已变但 render/save 未完成的半提交。
(function () {
  const writes = [];
  const storage = {
    getItem: function () { return null; },
    setItem: function (_key, value) { writes.push(JSON.parse(value).state); },
    removeItem: function () {}
  };
  const e = createEngine(makeWorld(), { storage: storage, onRender: function () {} });
  e.registerModule(makeStub());
  let laterEnter = 0, laterAction = 0, errors = [];
  e.on('enter', function (ev) { if (ev.pos.node === 'garden') throw new Error('ENTER_LISTENER_BOOM'); });
  e.on('enter', function (ev) { if (ev.pos.node === 'garden') laterEnter++; });
  e.on('action', function () { throw new Error('ACTION_LISTENER_BOOM'); });
  e.on('action', function () { laterAction++; });
  const oldError = console.error; console.error = function () { errors.push(Array.prototype.join.call(arguments, ' ')); };
  try {
    e.start();
    e.apply(findAction(e, 'wave'));
    const garden = e.view().actions.filter(function (a) { return a.kind === 'move' && a.to === 'garden'; })[0];
    e.apply(garden);
  } finally { console.error = oldError; }
  ok('A7 action listener 抛错被逐个隔离:后续 listener + 纯动作 save 仍完成', laterAction === 2 && writes.some(function (s) { return s.flags.waved === true && s.pos.node === 'home'; }));
  ok('A8 enter listener 抛错被逐个隔离:后续 listener + 移动 render/save 仍完成', laterEnter === 1 && e.state.pos.node === 'garden' && writes[writes.length - 1].pos.node === 'garden');
  ok('A9 observer 错误仍逐次可见,点名 enter/action 与注册序号', errors.some(function (m) { return /observer 'enter' #2.*ENTER_LISTENER_BOOM/.test(m); }) && errors.some(function (m) { return /observer 'action' #1.*ACTION_LISTENER_BOOM/.test(m); }));
})();

// A''. 模块 system 是玩法事务参与者，不得被公共 observer 的隔离语义吞错。
(function () {
  const e = createEngine(makeWorld(), { storage: null });
  const mod = makeStub();
  mod.systems = [{
    on: 'enter',
    run: function (_state, ev) {
      if (ev.pos.node === 'garden') throw new Error('SYSTEM_BOOM');
    }
  }];
  e.registerModule(mod);
  e.start();
  const garden = e.view().actions.filter(function (a) { return a.kind === 'move' && a.to === 'garden'; })[0];
  let message = '';
  try { e.apply(garden); } catch (err) { message = err.message; }
  ok('A10 module system 抛错仍同步传播(fail-loud),不被 observer 隔离吞掉', message === 'SYSTEM_BOOM');
})();

// A'''. observer 改为内部 entry 后，既有 on() remove / off(type,fn) 公共语义不回归。
(function () {
  const e = fresh();
  let count = 0;
  function observe() { count++; }
  const remove = e.on('custom', observe);
  e.emit('custom');
  remove();
  e.emit('custom');
  e.on('custom', observe);
  e.off('custom', observe);
  e.emit('custom');
  ok('A11 on() 返回 remove 且 off(type,fn) 仍能移除 observer', count === 1);
  ok('A12 on(type,非函数) 注册时立即 fail-loud,不被 observer 运行时隔离吞掉', throws(function () { e.on('enter', null); }));
  let protoEvents = 0;
  const removeProto = e.on('__proto__', function () { protoEvents++; });
  e.emit('__proto__'); removeProto(); e.emit('__proto__');
  ok('A13 prototype 名称也可作为普通事件类型注册/触发/移除', protoEvents === 1);
})();

// B. 状态转移 + once 消耗
(function () {
  const e = fresh();
  e.apply(findAction(e, 'wave'));
  ok('B1 动作 run 改了 state.flags', e.state.flags.waved === true);
  ok('B2 纯动作不移动(仍在 home)', eq(e.state.pos, { map: 'a', node: 'home' }));
  ok('B3 纯动作不重复 +1 计数(seen 仍=1)', e.state.seen['a/home'] === 1);
  ok('B4 once 已消耗:wave 不再出现在动作里', !findAction(e, 'wave'));
})();

// B'. v21 once 消耗后置(原子性):run 抛错 → once 不消耗、动作可重点(独立 boomStub,run 故意抛)
(function () {
  function boomStub() {
    return {
      id: 'boom-stub', nodeKinds: ['demo'],
      render: function (state, node) { return { title: node.title, body: [] }; },
      actions: function () { return [ { id: 'boom', label: '爆(一次性+抛)', once: true, run: function (s) { s.flags.touched = true; throw new Error('run 故意抛'); } } ]; }
    };
  }
  const e = createEngine(makeWorld(), { storage: null });
  e.registerModule(boomStub());
  e.start();
  let threw = false;
  try { e.apply(findAction(e, 'boom')); } catch (err) { threw = true; }
  ok('B5 once 动作 run 抛 → apply 抛(走 errorBanner 路径,非静默)', threw);
  ok('B6 v21 原子:run 抛 → once 未消耗(boom 仍在动作里、可重点;变异=apply 换回 once-先序→run 抛后 boom 被消耗→红)', !!findAction(e, 'boom'));
})();

// C. 跨地图移动(transfer)
(function () {
  const e = fresh();
  const toB = e.view().actions.filter(function (a) { return a.kind === 'move' && a.to && a.to.map === 'b'; })[0];
  e.apply(toB);
  ok('C1 跨图后 pos = b/gate', eq(e.state.pos, { map: 'b', node: 'gate' }));
  ok('C2 新节点 seen=1', e.state.seen['b/gate'] === 1);
  ok('C3 entered 累加到 2', e.state.entered === 2);
})();

// D. RNG:同种子两引擎序列一致;dice 确定
(function () {
  const e1 = fresh({ seed: 777 }), e2 = fresh({ seed: 777 });
  const s1 = [], s2 = [];
  for (var i = 0; i < 5; i++) { s1.push(e1.rng()); s2.push(e2.rng()); }
  ok('D1 同种子 rng() 序列逐项相等', eq(s1, s2));
  ok('D2 rng 在 [0,1)', s1.every(function (x) { return x >= 0 && x < 1; }));
  const e3 = fresh({ seed: 777 }), e4 = fresh({ seed: 777 });
  ok('D3 同种子 dice(2,6) 相等且在 2..12', e3.dice(2, 6) === e4.dice(2, 6));
})();

// D'. 时钟服务只接受有限非负推进量，守住“单调只增”与可序列化数值。
(function () {
  const invalid = [-1, -0.5, Infinity, -Infinity, NaN, '1', null, undefined, true, {}];
  const e = fresh();
  const before = e.clock.t;
  const rejected = invalid.every(function (d) {
    const t = e.clock.t;
    const didThrow = throws(function () { e.clock.advance(d); });
    return didThrow && e.clock.t === t;
  });
  ok('D4 clock.advance 拒绝负数/非有限数/非数字/显式 null|undefined，失败时 t 不动', rejected && e.clock.t === before);
  const values = [e.clock.advance(), e.clock.advance(0), e.clock.advance(0.5), e.clock.advance(2)];
  ok('D5 clock.advance 合法省略/0/小数/正数仍按序推进并返回新值', eq(values, [1, 1, 1.5, 3.5]) && e.clock.t === 3.5);

  const maxEnv = JSON.parse(e.serialize()); maxEnv.state.clock.t = Number.MAX_VALUE;
  ok('D6 合法有限数相加若溢出 Infinity → advance 在修改前抛且 t 不动', e.load(JSON.stringify(maxEnv)) === true && (function () {
    const t = e.clock.t;
    return throws(function () { e.clock.advance(Number.MAX_VALUE); }) && e.clock.t === t;
  })());
})();

// E. 存档往返:serialize -> 改 -> load 还原,逐字节一致
(function () {
  const e = fresh();
  e.apply(findAction(e, 'roll'));        // 制造一些状态(lastRoll + rngSeed 推进)
  const snap = e.serialize();
  e.apply(findAction(e, 'wave'));         // 改变状态
  ok('E1 改后与快照不同', e.serialize() !== snap);
  e.load(snap);
  ok('E2 load 后与快照逐字节一致', e.serialize() === snap);
})();

// F. RNG 随档复现:导出后再抽,导入回退,后续抽值一致(证明 rngSeed 入档)
(function () {
  const e = fresh({ seed: 42 });
  e.rng(); e.rng();
  const code = e.exportCode();
  const after = e.rng();          // 第 3 抽
  e.importCode(code);             // 回到第 2 抽后
  ok('F1 导出/导入存档码后,RNG 续抽值一致', e.rng() === after);
})();

// G. 死链 + 未知 kind 启动预检(§6b ⑥)
(function () {
  const e = fresh();
  ok('G1 enter 不存在节点抛错', throws(function () { e.enter({ map: 'a', node: '幽灵' }); }));
  ok('G2 start() 预检:起点节点 kind 无模块认领 → 启动即抛', throws(function () {
    const w = makeWorld(); w.maps.a.nodes.home.kind = '没人管';
    const e2 = createEngine(w, { storage: null }); e2.registerModule(makeStub()); e2.start();
  }));
  ok('G3 start() 预检覆盖非起点(深处节点 kind 错也启动即抛,不必走到)', throws(function () {
    const w = makeWorld(); w.maps.b.nodes.gate.kind = '深处没人管';
    const e3 = createEngine(w, { storage: null }); e3.registerModule(makeStub()); e3.start();
  }));
  ok('G3b 未认领的 prototype 名称 kind 也必须启动即抛', throws(function () {
    const w = makeWorld(); w.maps.a.nodes.home.kind = '__proto__';
    const e3 = createEngine(w, { storage: null }); e3.start();
  }));
})();

// G'. node.kind 所有权唯一:重复认领必须在任何 module/system/init 副作用前整模块拒绝。
(function () {
  const e = createEngine(makeWorld(), { storage: null });
  let claimedRuns = 0, rejectedRuns = 0, rejectedInits = 0;
  e.registerModule({
    id: 'kind-owner',
    nodeKinds: ['demo'],
    systems: [{ on: 'enter', run: function () { claimedRuns++; } }],
    render: function () { return { title: 'owner', body: [] }; },
    actions: function () { return []; }
  });
  let duplicateMessage = '';
  try {
    e.registerModule({
      id: 'kind-intruder',
      nodeKinds: ['free-kind', 'demo'],
      systems: [{ on: 'enter', run: function () { rejectedRuns++; } }],
      init: function () { rejectedInits++; },
      render: function () { return { title: 'intruder', body: [] }; },
      actions: function () { return []; }
    });
  } catch (err) { duplicateMessage = err.message; }
  e.start();
  ok('G4 重复 node.kind 注册立即 fail-loud,点名 kind 与双方模块', /demo.*kind-owner.*kind-intruder/.test(duplicateMessage));
  ok('G5 被拒模块无 system/init 副作用,原 owner 仍独占 render 与 enter system', rejectedRuns === 0 && rejectedInits === 0 && claimedRuns === 1 && e.view().view.title === 'owner');
  ok('G6 重复模块整批原子拒绝:冲突 kind 前面的 free-kind 也不被半认领', throws(function () {
    const w = makeWorld(); w.maps.a.nodes.home.kind = 'free-kind';
    const probe = createEngine(w, { storage: null });
    probe.registerModule({ id: 'kind-owner', nodeKinds: ['demo'], render: function () { return {}; } });
    try { probe.registerModule({ id: 'kind-intruder', nodeKinds: ['free-kind', 'demo'], render: function () { return {}; } }); } catch (_err) {}
    probe.start();
  }));
  ok('G7 同一模块 nodeKinds 内重复声明也在安装副作用前 fail-loud', throws(function () {
    const probe = createEngine(makeWorld(), { storage: null });
    probe.registerModule({ id: 'self-duplicate', nodeKinds: ['demo', 'demo'], render: function () { return {}; } });
  }));
  ok('G8 prototype 名称也可作为普通 kind 被唯一认领(__proto__/constructor 不污染索引)', !throws(function () {
    const w = makeWorld(); w.maps.a.nodes.home.kind = '__proto__';
    const probe = createEngine(w, { storage: null });
    probe.registerModule({ id: 'prototype-kind', nodeKinds: ['__proto__'], render: function () { return {}; } });
    probe.registerModule({ id: 'normal-kind', nodeKinds: ['demo'], render: function () { return {}; } });
    probe.start();
  }));
})();

// G''. mod.init 抛错:核心自己刚写入的 kind/system/module 注册必须回滚，允许干净替代模块接管。
(function () {
  const e = createEngine(makeWorld(), { storage: null });
  let failedRuns = 0, replacementRuns = 0, initSideEffect = 0, message = '';
  try {
    e.registerModule({
      id: 'broken-init',
      nodeKinds: ['demo'],
      systems: [{ on: 'enter', run: function () { failedRuns++; } }],
      init: function () { initSideEffect++; throw new Error('INIT_BOOM'); },
      render: function () { return { title: 'broken', body: [] }; }
    });
  } catch (err) { message = err.message; }
  let replacementAccepted = true;
  try {
    e.registerModule({
      id: 'replacement',
      nodeKinds: ['demo'],
      systems: [{ on: 'enter', run: function () { replacementRuns++; } }],
      render: function () { return { title: 'replacement', body: [] }; },
      actions: function () { return []; }
    });
  } catch (_err) { replacementAccepted = false; }
  e.start();
  ok('G9 mod.init 抛错原错误同步传播，且 init 自己已做的外部副作用不伪装成可回滚', message === 'INIT_BOOM' && initSideEffect === 1);
  ok('G10 init 失败后核心 kind 所有权释放，替代模块可干净注册并负责 render', replacementAccepted && e.view().view.title === 'replacement');
  ok('G11 init 失败模块的 systems 已移除，不在后续 enter 形成幽灵规则', failedRuns === 0 && replacementRuns === 1);
})();

// H. 声明式初始状态 world.initState(v5):自定义字段浅合并进 freshState;保留字段不被覆盖;深拷隔离
(function () {
  const w = makeWorld();
  w.initState = { stamina: 3, inventory: ['刀'], flags: { intro: true }, pos: { map: 'x', node: 'y' } };
  const e = createEngine(w, { storage: null }); e.registerModule(makeStub()); e.start();
  ok('H1 initState 自定义字段进 state', e.state.stamina === 3 && eq(e.state.inventory, ['刀']));
  ok('H2 initState.flags 合并进 flags', e.state.flags.intro === true);
  ok('H3 保留字段 pos 不被 initState 覆盖', eq(e.state.pos, { map: 'a', node: 'home' }));
  e.state.stamina -= 1;
  ok('H4 自定义数值可正常递减(根因:不再 undefined→NaN)', e.state.stamina === 2);
  e.state.inventory.push('盾'); e.reset();
  ok('H5 reset 后 initState 是干净深拷(不与上局共享引用)', eq(e.state.inventory, ['刀']));
})();

// I. fail-loud(design-principles §6b):action.available 写成非函数 → view() 抛(不再把定值静默当"无条件可用")
(function () {
  const w = makeWorld();
  w.maps.a.nodes.home.exits[0].available = false;   // 作者笔误:想"禁用"却写成定值;旧版 `!a.available||…` 会静默当无条件可用
  const e = createEngine(w, { storage: null }); e.registerModule(makeStub()); e.start();
  ok('I1 exit.available=非函数 → view() 抛(定值门控不再静默旁路)', throws(function () { e.view(); }));
  const w2 = makeWorld();
  w2.maps.a.nodes.home.exits[0].available = function () { return true; };
  const e2 = createEngine(w2, { storage: null }); e2.registerModule(makeStub()); e2.start();
  ok('I2 合法函数 available 不抛(回归)', !throws(function () { e2.view(); }));
})();

// J. fail-loud(§6b ⑤):load 区分坏档(静默兜底)vs 合法数据却抛错(warn 出来,不再静默吞成"读档失败")
(function () {
  const realWarn = console.warn; let warned = [];
  console.warn = function (m) { warned.push(String(m)); };
  try {
    const e = fresh();
    ok('J1 非法 JSON 存档码 → load 返回 false 且不抛', e.load('{坏的json') === false);
    ok('J2 坏档不 warn(非法 JSON=预期内数据问题,静默兜底)', warned.length === 0);
  let importResult;
  const importThrew = throws(function () {
    if (typeof globalThis.atob === 'function') {
      const oldAtob = globalThis.atob;
      try { globalThis.atob = function () { throw new Error('InvalidCharacterError'); }; importResult = e.importCode('%'); }
      finally { globalThis.atob = oldAtob; }
    } else importResult = e.importCode('%%%');
  });
  ok('J2b 非法 base64 存档码 → importCode=false 且不抛', !importThrew && importResult === false);
    // 合法 JSON 但 render 抛错(world 有非函数门控)→ 代码 bug 不再被吞成"读档失败"
    const w = makeWorld(); w.maps.a.nodes.home.exits[0].available = 'S.x';        // 非函数门控 → view() 抛
    const e2 = createEngine(w, { storage: null, onRender: function () {} });        // 有呈现器 → render 才会跑 view()
    e2.registerModule(makeStub());
    const good = JSON.stringify({ v: ENGINE_CORE.SAVE_VERSION, gameId: w.id, state: { pos: { map: 'a', node: 'home' }, clock: { unit: 'turn', t: 0 }, rngSeed: 1, seen: { 'a/home': 1 }, flags: {}, _once: {} } });
    warned = [];
    const beforeRef = e2.state, beforeBytes = e2.serialize();
    const r = e2.load(good);
    ok('J3 合法 JSON 但 hydrate/render 抛 → load=false 且当前 state 引用/字节不变', r === false && e2.state === beforeRef && e2.serialize() === beforeBytes);
    ok('J4 合法数据却抛错 → warn 出来(代码 bug 不再静默吞)', warned.some(function (m) { return /\[amatlas\] load/.test(m); }));
  } finally { console.warn = realWarn; }
})();

// J'. v40 恢复生命周期：读档是实时会话换代，不是 enter；critical system 参与提交与补偿。
(function () {
  function envelope(world, pos, seen) {
    return JSON.stringify({
      v: ENGINE_CORE.SAVE_VERSION,
      gameId: world.id,
      state: {
        pos: pos,
        clock: { unit: 'turn', t: 4 },
        rngSeed: 7,
        seen: seen,
        flags: {},
        _once: {}
      }
    });
  }
  function lifecycleModule(log, controls) {
    controls = controls || {};
    return {
      id: 'restore-probe',
      nodeKinds: ['demo'],
      render: function (s, node) {
        if (controls.throwRender && s.pos.node === 'garden') throw new Error('RESTORE_RENDER_BOOM');
        return { title: node.title, body: [] };
      },
      actions: function () { return []; },
      systems: [
        { on: 'enter', run: function (s) { s.entered = (s.entered || 0) + 1; } },
        { on: 'restore', run: function (s, ev) {
          log.push([ev.phase, ev.source, ev.rollback, s && s.pos && s.pos.node,
            ev.from && ev.from.pos.node, ev.to && ev.to.pos.node]);
          if (ev.phase === 'deactivate') controls.resources = 0;
          if (ev.phase === 'activate') {
            controls.resources = 1;
            if (controls.throwActivate && s.pos.node === 'garden' && !ev.rollback) {
              controls.resources = 0;
              throw new Error('RESTORE_ACTIVATE_BOOM');
            }
          }
        } } ]
    };
  }

  const world = makeWorld(), log = [], controls = { resources: 0 };
  const e = createEngine(world, { storage: null });
  e.registerModule(lifecycleModule(log, controls)); e.start(); controls.resources = 1;
  const beforeSeen = e.state.seen['a/home'];
  const gardenSave = envelope(world, { map: 'a', node: 'garden' }, { 'a/home': 8, 'a/garden': 3 });
  ok('J5 load 运行 critical restore deactivate→activate，且不合成 enter/不增加 seen',
    e.load(gardenSave) === true && eq(log.map(function (x) { return x.slice(0, 2); }), [['deactivate', 'load'], ['activate', 'load']]) &&
    e.state.seen['a/home'] === 8 && e.state.seen['a/garden'] === 3 && e.state.entered == null && beforeSeen === 1 && controls.resources === 1);

  log.length = 0;
  const sameSave = envelope(world, { map: 'a', node: 'garden' }, { 'a/garden': 3 });
  ok('J6 同节点 load 也换代，不按位置相等短路', e.load(sameSave) === true && log.length === 2 && log[0][0] === 'deactivate' && log[1][0] === 'activate');

  let observerRuns = 0; e.on('restore', function () { observerRuns++; throw new Error('OBSERVER_MUST_NOT_RUN'); });
  log.length = 0;
  ok('J7 api.on(restore) observer 不参与 tentative lifecycle', e.load(sameSave) === true && observerRuns === 0 && log.length === 2);

  const localLog = [], localControls = { resources: 0 };
  const localRaw = envelope(world, { map: 'a', node: 'garden' }, { 'a/garden': 2 });
  const localStorage = { getItem: function () { return localRaw; }, setItem: function () {}, removeItem: function () {} };
  const el = createEngine(world, { storage: localStorage }); el.registerModule(lifecycleModule(localLog, localControls));
  ok('J8 loadLocal 在无 presenter/尚无 live state 时仍 activate，source 精确为 loadLocal',
    el.loadLocal() === true && localLog.length === 1 && localLog[0][0] === 'activate' && localLog[0][1] === 'loadLocal' && localControls.resources === 1);

  const importLog = [], importControls = { resources: 0 };
  const ei = createEngine(world, { storage: null }); ei.registerModule(lifecycleModule(importLog, importControls)); ei.start(); importControls.resources = 1;
  const code = typeof btoa !== 'undefined'
    ? btoa(unescape(encodeURIComponent(gardenSave)))
    : Buffer.from(gardenSave, 'utf8').toString('base64');
  ok('J9 importCode 保留独立 source，不伪装成 load', ei.importCode(code) === true && importLog.some(function (x) { return x[1] === 'importCode'; }) && !importLog.some(function (x) { return x[1] === 'load'; }));

  const failLog = [], failControls = { resources: 1, throwActivate: true };
  const ef = createEngine(world, { storage: null }); ef.registerModule(lifecycleModule(failLog, failControls)); ef.start();
  const oldRef = ef.state, oldBytes = ef.serialize();
  const realWarn = console.warn; console.warn = function () {};
  const failed = ef.load(gardenSave); console.warn = realWarn;
  ok('J10 candidate activate 失败后清候选、恢复旧引用并 rollback activate 旧会话', failed === false && ef.state === oldRef && ef.serialize() === oldBytes && failControls.resources === 1 &&
    failLog.some(function (x) { return x[0] === 'deactivate' && x[2] === true; }) && failLog.some(function (x) { return x[0] === 'activate' && x[2] === true && x[3] === 'home'; }));
})();

// K. round9 audit:initState 写成函数/数组 → start 抛(否则初值静默全丢 → S.x-1=NaN soft-lock,正是 initState 功能要防的事故)
(function () {
  function throws(fn) { try { fn(); return false; } catch (e) { return true; } }
  function boot(initState) { var w = makeWorld(); w.initState = initState; var e = createEngine(w, { storage: null }); e.registerModule(makeStub()); e.start(); }
  ok('K1 initState 写成函数 → 抛(初值不再静默丢失)', throws(function () { boot(function () { return { hp: 3 }; }); }));
  ok('K2 initState 写成数组 → 抛', throws(function () { boot([1, 2]); }));
  ok('K3 initState 合法对象不抛(回归)', !throws(function () { boot({ hp: 3 }); }));
})();

// V. v11 对称穷举:exits 字段放错 → view 即抛(旧版静默忽略=锁消失/副作用丢/once 无效;全引擎审计实锤)
(function () {
  function w(exit) {
    return { id: '33333333-3333-4333-8333-333333333333', start: { map: 'm', node: 'a' }, maps: { m: { name: 'M', nodes: {
      a: { kind: 'demo', exits: [exit] }, b: { kind: 'demo', exits: [] } } } } };
  }
  function mk(exit) { const e = createEngine(w(exit), { storage: null }); e.registerModule(makeStub()); e.start(); return e; }
  ok('V1 exit 写 requires(links 的字段)→ view 抛(旧版静默无视=锁消失)', throws(function () { mk({ to: 'b', requires: function () { return false; } }).view(); }));
  ok('V2 exit 写 run/once → view 抛(旧版副作用丢/一次性出口变无限)', throws(function () { mk({ to: 'b', run: function (S) { S.flags.x = 1; }, once: true }).view(); }));
  ok('V3 正确写法(to/label/available)不抛', !throws(function () { mk({ to: 'b', label: '门', available: function () { return true; } }).view(); }));
})();

// W. v11 坏档形状校验(红队实锤:{v:999, clock:{t:'坏数据'}} 旧版 load 返回 true、字符串污染蔓延进 advance 算术)
(function () {
  function mk() { const e = createEngine(makeWorld(), { storage: null }); e.registerModule(makeStub()); e.start(); return e; }
  const e = mk(); const posBefore = e.state.pos.node;
  ok('W1 版本不识(v:999)→ load=false、当前状态不动', e.load(JSON.stringify({ v: 999, state: { pos: { map: 'a', node: 'home' } } })) === false && e.state.pos.node === posBefore);
  ok('W2 clock.t 是字符串 → load=false(不再污染运行时算术)', e.load(JSON.stringify({ v: ENGINE_CORE.SAVE_VERSION, gameId: makeWorld().id, state: { pos: { map: 'a', node: 'home' }, clock: { t: '坏数据' } } })) === false && typeof e.state.clock.t === 'number');
  ok('W3 seen 写成数组 → load=false', e.load(JSON.stringify({ v: ENGINE_CORE.SAVE_VERSION, gameId: makeWorld().id, state: { seen: [1, 2] } })) === false);
  ok('W4 缺 state → load=false(旧版返回 true=假装读档成功)', e.load(JSON.stringify({ v: ENGINE_CORE.SAVE_VERSION, gameId: makeWorld().id })) === false);
  const coreNullKeys = ['pos', 'clock', 'rngSeed', 'seen', 'flags', '_once'];
  const nullFamilyAtomic = coreNullKeys.every(function (key) {
    const envelope = JSON.parse(e.serialize()); envelope.state[key] = null;
    const beforeRef = e.state, beforeBytes = e.serialize();
    return e.load(JSON.stringify(envelope)) === false && e.state === beforeRef && e.serialize() === beforeBytes;
  });
  ok('W5 核心字段 pos/clock/rngSeed/seen/flags/_once 任一 null → load=false 且 state 原子不动', nullFamilyAtomic);
  const clockNullEnvelope = JSON.parse(e.serialize()); clockNullEnvelope.state.clock.t = null;
  const beforeClockRef = e.state, beforeClockBytes = e.serialize();
  ok('W5b clock.t=null → load=false 且 state 原子不动', e.load(JSON.stringify(clockNullEnvelope)) === false && e.state === beforeClockRef && e.serialize() === beforeClockBytes);
  const clockNegativeEnvelope = JSON.parse(e.serialize()); clockNegativeEnvelope.state.clock.t = -1;
  ok('W5c clock.t 为负数 → load=false 且 state 原子不动', e.load(JSON.stringify(clockNegativeEnvelope)) === false && e.state === beforeClockRef && e.serialize() === beforeClockBytes);
  const badClockContainers = [[], {}];
  ok('W5d clock=[] 或缺 t 的 {} → load=false 且 state 原子不动', badClockContainers.every(function (clockValue) {
    const env = JSON.parse(e.serialize()); env.state.clock = clockValue;
    const beforeRef = e.state, beforeBytes = e.serialize();
    return e.load(JSON.stringify(env)) === false && e.state === beforeRef && e.serialize() === beforeBytes;
  }));
  const snap = e.serialize();
  const legacy = JSON.parse(snap); delete legacy.v; delete legacy.gameId;
  ok('W6 合法 v2 档往返仍 true；缺版本/身份的旧手工档 clean cut 拒绝', e.load(snap) === true && e.load(JSON.stringify(legacy)) === false);
  const badPos = JSON.parse(snap); badPos.state.pos = {};
  ok('W7 pos 必须含非空 map/node，空对象不能伪装成功后静默回起点', e.load(JSON.stringify(badPos)) === false);
  const badSeen = JSON.parse(snap); badSeen.state.seen = { 'a/home': 'bad' };
  ok('W8 seen 各访问计数必须是有限非负 number，不能在下次 enter 拼成字符串', e.load(JSON.stringify(badSeen)) === false);
})();

// X. 易用性/逻辑审计批:存档边界 + 广播隔离(隐私模式 SecurityError / loadLocal 坏档 / load 回写 / presenter 隔离)
(function () {
  function memStorage(initial) {
    const m = Object.assign({}, initial || {}); const log = [];
    return { getItem: function (k) { return (k in m) ? m[k] : null; },
             setItem: function (k, v) { m[k] = String(v); log.push(k); },
             removeItem: function (k) { delete m[k]; }, _m: m, _log: log };
  }
  // X1/X2 隐私模式:typeof localStorage 求值即抛 SecurityError(getter 抛)——核心默认值/显式 null 都不得崩
  Object.defineProperty(globalThis, 'localStorage', { get: function () { throw new Error('SecurityError'); }, configurable: true });
  let crashedDefault = throws(function () { const e = createEngine(makeWorld(), {}); e.registerModule(makeStub()); e.start(); });
  let crashedNull = throws(function () { const e = createEngine(makeWorld(), { storage: null }); e.registerModule(makeStub()); e.start(); });
  delete globalThis.localStorage;
  ok('X1 隐私模式(localStorage getter 抛)→ createEngine 默认值降级 null、不白屏', !crashedDefault);
  ok('X2 显式 storage:null 逃生口不被 || 吞掉(旧版仍求值 typeof → 崩)', !crashedNull);

  // X3 loadLocal 坏档:自动续档通道与 load 同一道 badShape 闸 → false,start 走 freshState 兜底
  const defaultKey = 'amatlas:game:11111111-1111-4111-8111-111111111111';
  const badStore = memStorage({ [defaultKey]: JSON.stringify({ v: 999, state: { pos: { map: 'a', node: 'garden' } } }) });
  const e3 = createEngine(makeWorld(), { storage: badStore }); e3.registerModule(makeStub()); e3.start();
  ok('X3 loadLocal 坏档(v:999)→ 忽略并按新开局(旧版 hydrate 直吞 → 假装续档)', e3.state.pos.node === 'home' && e3.state.clock.t === 0);

  // X3b loadLocal 失败也必须原子:合法 JSON 通过形状闸后若 render 抛,不能把候选 state 留在当前会话。
  const atomicKey = 'amatlas:game:22222222-2222-4222-8222-222222222222';
  const atomicWorld = makeWorld(); atomicWorld.id = '22222222-2222-4222-8222-222222222222';
  atomicWorld.maps.a.nodes.home.exits[0].available = 'S.x';
  const atomicRaw = JSON.stringify({ v: ENGINE_CORE.SAVE_VERSION, gameId: atomicWorld.id, state: { pos: { map: 'a', node: 'home' }, clock: { unit: 'turn', t: 7 }, rngSeed: 7, seen: { 'a/home': 9 }, flags: { loaded: true }, _once: {} } });
  const atomicStore = memStorage({ [atomicKey]: atomicRaw });
  const e3b = createEngine(atomicWorld, { storage: atomicStore, onRender: function () {} }); e3b.registerModule(makeStub());
  const atomicBeforeRef = e3b.state, atomicBeforeBytes = e3b.serialize();
  const oldWarn = console.warn; console.warn = function () {};
  const atomicResult = e3b.loadLocal(); console.warn = oldWarn;
  ok('X3b loadLocal 的 hydrate/render 失败 → false 且当前 state 引用/字节不变', atomicResult === false && e3b.state === atomicBeforeRef && e3b.serialize() === atomicBeforeBytes);
  const nullLocalEnvelope = JSON.parse(atomicRaw); nullLocalEnvelope.state._once = null;
  atomicStore._m[atomicKey] = JSON.stringify(nullLocalEnvelope);
  const nullLocalBeforeRef = e3b.state, nullLocalBeforeBytes = e3b.serialize();
  console.warn = function () {}; const nullLocalResult = e3b.loadLocal(); console.warn = oldWarn;
  ok('X3c loadLocal 核心字段 null → false 且当前 state 引用/字节不变', nullLocalResult === false && e3b.state === nullLocalBeforeRef && e3b.serialize() === nullLocalBeforeBytes);

  // X4 load 成功 → 回写自动续档裸键(否则读档后刷新=回滚)
  const st4 = memStorage();
  const e4 = createEngine(makeWorld(), { storage: st4 }); e4.registerModule(makeStub()); e4.start();
  function mvGarden(e) { return e.view().actions.filter(function (a) { return a.kind === 'move' && a.label === '去花园'; })[0]; }
  e4.apply(mvGarden(e4)); const snap4 = e4.serialize(); e4.reset();
  st4._log.length = 0;
  const okLoad = e4.load(snap4);
  ok('X4 load 成功回写裸键(读档→刷新不再回滚)', okLoad === true && st4._log.indexOf(defaultKey) >= 0 && JSON.parse(st4._m[defaultKey]).state.pos.node === 'garden');

  // X4b 回写失败不能报告成功并把内存留在无法续档的新状态。
  const failStore = memStorage();
  const ef = createEngine(makeWorld(), { storage: failStore }); ef.registerModule(makeStub()); ef.start();
  ef.apply(mvGarden(ef));
  const homeSnap = (function () { const x = createEngine(makeWorld(), { storage: null }); x.registerModule(makeStub()); x.start(); return x.serialize(); })();
  const beforeFailLoad = ef.serialize();
  const rendered = [];
  ef.addPresenter(function (snap) { rendered.push(snap.pos.node); });
  failStore.setItem = function () { throw new Error('QUOTA'); };
  const oldFailWarn = console.warn; console.warn = function () {};
  const failLoadResult = ef.load(homeSnap); console.warn = oldFailWarn;
  ok('X4b 自动档回写失败 → load=false 且内存状态回滚', failLoadResult === false && ef.serialize() === beforeFailLoad && ef.state.pos.node === 'garden');
  ok('X4c load 回写失败后重新渲染旧 state，画面不滞留在候选存档', rendered.length >= 2 && rendered[rendered.length - 1] === 'garden');

  // X5 presenter 隔离:首个呈现器抛错,后续呈现器照常收到快照、自动存档照常写
  const st5 = memStorage(); let got = 0;
  const e5 = createEngine(makeWorld(), { storage: st5 });
  e5.registerModule(makeStub());
  e5.addPresenter(function () { throw new Error('呈现器炸了'); });
  e5.addPresenter(function (snap) { if (snap && snap.pos) got++; });
  const errSilent = (function () { const old = console.error; console.error = function () {}; try { e5.start(); e5.apply(e5.view().actions.filter(function (a) { return a.kind === 'move' && a.label === '去花园'; })[0]); } finally { console.error = old; } return true; })();
  ok('X5 呈现器抛错被隔离:其余呈现器收到广播 + 自动存档不被连坐', errSilent && got >= 2 && JSON.parse(st5._m[defaultKey]).state.pos.node === 'garden');
})();

// X6-X11. 默认存档身份:world.id 是跨构建稳定的游戏身份,不是内容/图结构哈希。
(function () {
  function memStorage() {
    const m = {};
    return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, _m: m };
  }
  function startWorld(world, storage, opts) {
    const e = createEngine(world, Object.assign({ storage: storage }, opts || {}));
    e.registerModule(makeStub()); e.start(); return e;
  }
  const store = memStorage();
  const wa = makeWorld();
  const wb = makeWorld(); wb.id = '22222222-2222-4222-8222-222222222222';
  const ea = startWorld(wa, store);
  ea.apply(ea.view().actions.filter(function (a) { return a.kind === 'move' && a.label === '去花园'; })[0]);
  const eb = startWorld(wb, store);
  ok('X6 同骨架/同 maps/start、不同 world.id → 共享 storage 不串档', eb.state.pos.node === 'home' && Object.keys(store._m).length === 2);
  ok('X7 默认 key 由 world.id 稳定派生且 api.saveKey 只读可见', ea.saveKey === 'amatlas:game:' + wa.id && eb.saveKey === 'amatlas:game:' + wb.id);

  const wa2 = makeWorld();
  wa2.maps.a.nodes.extra = { kind: 'demo', title: '新增内容', exits: [{ to: 'home', label: '回家' }] };
  const ea2 = startWorld(wa2, store);
  ok('X8 同 world.id 内容/节点升级后仍续同一档', ea2.state.pos.node === 'garden' && ea2.saveKey === ea.saveKey);

  const missing = makeWorld(); delete missing.id;
  const bad = makeWorld(); bad.id = 'not-a-uuid';
  ok('X9 缺/坏 world.id 都在 createEngine fail-loud', throws(function () { createEngine(missing, { storage: null }); }) && throws(function () { createEngine(bad, { storage: null }); }));
  ok('X10 显式 saveKey 必须非空字符串,不再被 || 静默回退', throws(function () { createEngine(makeWorld(), { storage: null, saveKey: '' }); }) && throws(function () { createEngine(makeWorld(), { storage: null, saveKey: 7 }); }));
  const override = startWorld(makeWorld(), memStorage(), { saveKey: 'embed-slot' });
  ok('X11 合法显式 saveKey 优先且 api.saveKey 返回最终值', override.saveKey === 'embed-slot');

  ea.state.flags.fromA = true;
  ea.state._once['a/home#foreign'] = 1;
  const ebBefore = eb.serialize();
  ok('X12 不同 world.id 的便携存档不能跨游戏导入', eb.importCode(ea.exportCode()) === false && eb.serialize() === ebBefore && !eb.state.flags.fromA && !eb.state._once['a/home#foreign']);
})();

// Y. linkActions 空场景安全网按 §4.5 字面语义:「无任何可点」= links **和 exits** 都无可点
(function () {
  function w(exits) {
    return { id: '44444444-4444-4444-8444-444444444444', start: { map: 'm', node: 'a' }, maps: { m: { name: 'M', nodes: {
      a: { kind: 'demo', exits: exits,
        links: [{ to: 'b', label: '密道', requires: function () { return false; } }] },   // 默认隐藏(防剧透)
      b: { kind: 'demo', exits: [] } } } } };
  }
  function mk(exits) { const e = createEngine(w(exits), { storage: null }); e.registerModule(makeStub()); e.start(); return e; }
  // 直接测核心纯函数 api.linkActions(stub 模块不消费 links;真实消费方 renderer/tabletop 各有自测)
  const withExit = mk([{ to: 'b', label: '正门' }]);
  const las1 = withExit.linkActions(withExit.world.maps.m.nodes.a, withExit.state);
  ok('Y1 exits 可走 + links 全为隐藏锁定 → 不揭示(防剧透不泄露;旧版误判空场景)', !las1.some(function (a) { return a.label === '密道'; }));
  const noExit = mk([]);
  const las2 = noExit.linkActions(noExit.world.maps.m.nodes.a, noExit.state);
  ok('Y2 真·空场景(links/exits 都无可点)→ 仍揭示灰显(安全网保留)', las2.some(function (a) { return a.label === '密道' && a.locked; }));
})();

// Z. 引擎版本戳(易用性审计批):export VERSION;dev 工作树占位符归一为 'dev'(打包时 sed 注入哈希+日期)
(function () {
  ok('Z1 engine-core 导出 VERSION 字符串', typeof ENGINE_CORE.VERSION === 'string' && ENGINE_CORE.VERSION.length > 0);
  // 不变量(dev 树=dev / 发布包=打包注入的哈希,两态都成立)——占位符绝不泄露给运行时。
  //   注意:别断言 ===' dev'(那只在 dev 树成立;发布包跑 run.cjs 会假失败,惊到端用户)。
  ok('Z2 VERSION 不泄露占位符(__AMATLAS_VERSION__ 不出现在运行时值)', ENGINE_CORE.VERSION.indexOf('__AMATLAS_VERSION__') < 0 && ENGINE_CORE.VERSION.indexOf('$Format') < 0);
})();

// ZA. fail-loud 补齐(S5:seed 校验 / registerModule render|actions / SAVE_VERSION 事件)——每条带反向变异牙。
(function () {
  // seed:非整数即 fail-loud(反向:整数 / 省略仍过)
  ok('ZA1 world.seed 字符串 → createEngine 抛(非整数不再静默归零)', throws(function () {
    var w = makeWorld(); w.seed = 'not-a-number'; createEngine(w, { storage: null });
  }));
  ok('ZA2 world.seed 小数 3.7 → 抛(不再静默截断成 3)', throws(function () {
    var w = makeWorld(); w.seed = 3.7; createEngine(w, { storage: null });
  }));
  ok('ZA3 opts.seed 空对象 → 抛', throws(function () {
    createEngine(makeWorld(), { storage: null, seed: {} });
  }));
  ok('ZA4 合法整数 seed 仍不抛(回归)', !throws(function () {
    var w = makeWorld(); w.seed = 424242; createEngine(w, { storage: null });
  }));
  ok('ZA5 省略 seed(world 无 seed 字段)仍不抛(默认种子)', !throws(function () {
    var w = makeWorld(); delete w.seed; createEngine(w, { storage: null });
  }));

  // registerModule:认领 kind 却无 render/actions → fail-loud(反向:有 render / 仅 actions 仍过)
  ok('ZA6 认领 kind 却无 render/actions → registerModule 抛(不再静默空渲染)', throws(function () {
    createEngine(makeWorld(), { storage: null }).registerModule({ id: 'blank', nodeKinds: ['demo'] });
  }));
  ok('ZA7 认领 kind 且有 render 的正常模块仍过(回归)', !throws(function () {
    createEngine(makeWorld(), { storage: null }).registerModule(makeStub());
  }));
  ok('ZA8 只有 actions(无 render)也算合法(二选一)', !throws(function () {
    createEngine(makeWorld(), { storage: null }).registerModule({ id: 'acts-only', nodeKinds: ['demo'], actions: function () { return []; } });
  }));

  // SAVE_VERSION/坏形状被弃时发 save-rejected 事件(反向:好档不发)
  (function () {
    var e = createEngine(makeWorld(), { storage: null });
    e.registerModule(makeStub()); e.start();
    var rejects = [];
    e.on('save-rejected', function (ev) { rejects.push(ev); });
    var oldWarn = console.warn; console.warn = function () {};
    try {
      e.importCode(e.exportCode());                                            // 合法档 → 不发
      var goodCount = rejects.length;
      e.load(JSON.stringify({ v: 999, gameId: e.world.id, state: {} }));       // 版本不识 → 发
      ok('ZA9 坏档(版本不识)被弃时发 save-rejected(带 reason),好档不发', goodCount === 0 && rejects.length === 1 && /版本不识/.test(rejects[0].reason));
    } finally { console.warn = oldWarn; }
  })();
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
