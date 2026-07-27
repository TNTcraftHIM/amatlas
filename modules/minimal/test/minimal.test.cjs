/* ════════════════════════════════════════════════════════════════════════
   最小模块范例验证(纯 node,无需 jsdom;随 test/run.cjs)。
   命题:一个**最小**玩法模块经统一 use 插上即工作(核心零改);
   +N 动作改计数、达成后动作消失、自定义 step/goal、计数随档。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
var Amatlas = require('../../../core/runtime/engine-core.js');
var M = require('../runtime/minimal.js');

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name); pass++; }
  else { console.log('  X   ' + name + (detail ? '  → ' + detail : '')); fail++; }
}

// 测试世界:单节点 counter(最小可工作世界)。
function makeWorld() {
  return {
    id: '17171717-1717-4717-8717-171717171717', start: { map: 'm', node: 'home' },
    maps: { m: { name: '计数器', nodes: {
      home: { kind: 'counter', title: '计数器', look: '点击 +1。' }
    } } }
  };
}
function mkEngine(opts) {
  var e = Amatlas.createEngine(makeWorld(), {});     // 无 storage/presenter → 纯逻辑;view() 是观察窗口
  e.use(M.createMinimalModule(opts || { goal: 3 }));
  e.start();
  return e;
}
function inc(e) { var a = e.view().actions.filter(function (x) { return x.id === 'inc'; })[0]; if (a) e.apply(a); return a; }

console.log('minimal 验证');

/* A. 统一 use 注册 + dispatch 到 'counter' kind ───────────────────────── */
var mod = M.createMinimalModule({ goal: 3 });
ok('A1 createMinimalModule 返回 use-able 模块(带 install)', typeof mod.install === 'function');
ok('A2 返回的即模块对象,kind=counter', mod.id === 'minimal' && mod.nodeKinds[0] === 'counter');
var e0 = mkEngine();
var v0 = e0.view();
ok('A3 经 use 插上后 counter 节点可渲染(核心零改、统一入口)', v0.view.title === '计数器' && Array.isArray(v0.view.body));
ok('A4 起点计数 0/3,状态条含"计数"=0', /0 \/ 3/.test(v0.view.body[1].text) && v0.view.status.some(function (s) { return s.label === '计数' && s.value === '0'; }));

/* B. +N 动作改计数(唯一状态转移)──────────────────────────────────────── */
inc(e0);
ok('B1 点一次 → count=1', e0.state.count === 1, 'count=' + e0.state.count);
inc(e0); inc(e0);
ok('B2 再点两次 → count=3(达到 goal)', e0.state.count === 3, 'count=' + e0.state.count);

/* C. 达成后动作消失 + 达成文案 ─────────────────────────────────────────── */
ok('C1 达成后无 inc 动作(actions 返回空)', !e0.view().actions.some(function (a) { return a.id === 'inc'; }));
ok('C2 达成文案出现', /达成/.test(e0.view().view.body[1].text));

/* D. 自定义 step/goal(opts 生效)──────────────────────────────────────── */
var e2 = mkEngine({ step: 5, goal: 10 });
inc(e2);
ok('D1 step=5 → 一次点击 count=5', e2.state.count === 5, 'count=' + e2.state.count);
ok('D2 未达 goal(10)仍有 inc 动作', e2.view().actions.some(function (a) { return a.id === 'inc'; }));

/* E. 计数随档(serialize→load)─────────────────────────────────────────── */
var eP = mkEngine({ goal: 100 }); inc(eP); inc(eP);
var blob = eP.serialize();
var eQ = mkEngine({ goal: 100 }); var loaded = eQ.load(blob);
ok('E1 load 成功', loaded === true);
ok('E2 计数随档(count=2)', eQ.state.count === 2, 'count=' + eQ.state.count);

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
