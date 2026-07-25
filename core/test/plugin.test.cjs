/* Amatlas S8.5 统一插件模型 + 多呈现器 验证 —— 纯 node、零依赖(核心 DOM-free),无需 jsdom。
   覆盖:addPresenter 叠加广播"同一快照" + remove() / 旧 opts.onRender 向后兼容(成为 presenters[0])/
        use(fn) | use({id,install}) | use([..]) 三形态 + 链式 + 错误 + id 去重告警 / use→addPresenter 端到端。
   契约见 ../module-interface.md(版本以文件头为准);设计见 docs/s8.5-design-final.md §2·§3。 */
const { createEngine } = require('../runtime/engine-core.js');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } }
function throws(fn) { try { fn(); return false; } catch (e) { return true; } }

// 最小类型无关世界 + stub 模块(kind='demo');原地 exit 便于反复 render。
function makeWorld() {
  return {
    id: '13131313-1313-4313-8313-131313131313', start: { map: 'a', node: 'home' }, seed: 1,
    maps: { a: { name: 'A', nodes: {
      home: { kind: 'demo', title: '家', exits: [ { to: 'home', label: '原地' } ] }
    } } }
  };
}
function makeStub() {
  return {
    id: 'stub', nodeKinds: ['demo'],
    render: function (state, node) { return { title: node.title, body: [ { type: 'text', text: 'hi' } ] }; }
  };
}
function base(opts) {
  const e = createEngine(makeWorld(), Object.assign({ storage: null }, opts || {}));
  e.registerModule(makeStub());
  return e;
}

console.log('S8.5 plugin + presenter 验证');

// A. 多呈现器:两个 presenter 都收到、且是【同一个快照对象】(证明"算一次,广播",非各算各的)
(function () {
  const e = base();
  let r1 = null, r2 = null;
  e.addPresenter(function (snap) { r1 = snap; });
  e.addPresenter(function (snap) { r2 = snap; });
  e.start();
  ok('A1 presenter1 收到快照(view.title=家)', !!(r1 && r1.view && r1.view.title === '家'));
  ok('A2 presenter2 收到快照(view.title=家)', !!(r2 && r2.view && r2.view.title === '家'));
  ok('A3 两者收到同一快照对象(算一次广播)', r1 === r2 && r1 !== null);
  ok('A4 快照含 actions / pos / nodeKind(信封完整)', Array.isArray(r1.actions) && r1.pos.node === 'home' && r1.nodeKind === 'demo');
})();

// B. addPresenter 返回 remove():移除后不再收到
(function () {
  const e = base();
  let count = 0;
  const remove = e.addPresenter(function () { count++; });
  ok('B1 addPresenter 返回函数(remove)', typeof remove === 'function');
  e.start();                          // 第 1 次 render
  const afterStart = count;
  remove();
  e.apply({ label: '原地动作' });      // 纯动作 → 再次 render(此时已无 presenter)
  ok('B2 start 后收到一次', afterStart === 1);
  ok('B3 remove 后不再收到', count === afterStart);
})();

// C. 旧 opts.onRender 兼容:成为 presenters[0],照常收到(契约 §4.6)
(function () {
  let got = null;
  const e = base({ onRender: function (snap) { got = snap; } });
  e.start();
  ok('C1 opts.onRender 仍被调用(向后兼容)', !!(got && got.view.title === '家'));
})();

// D. opts.onRender 与 addPresenter 共存:都收到同一次 render
(function () {
  let a = 0, b = 0;
  const e = base({ onRender: function () { a++; } });
  e.addPresenter(function () { b++; });
  e.start();
  ok('D1 onRender 与 addPresenter 同时生效', a === 1 && b === 1);
})();

// E. use(fn):函数式插件,install 收到 api;use 返回 api(链式)
(function () {
  const e = base();
  let gotApi = null;
  const ret = e.use(function (api) { gotApi = api; });
  ok('E1 use(fn) 调用 install 并传入 api', !!(gotApi && typeof gotApi.addPresenter === 'function'));
  ok('E2 use 返回 api(链式)', ret === e);
})();

// F. use({id, install}):对象式插件
(function () {
  const e = base();
  let installed = false;
  e.use({ id: 'p1', install: function () { installed = true; } });
  ok('F1 use({id,install}) 调用 install', installed === true);
})();

// G. use([..]):插件组,按注册顺序安装全部(函数 + 对象混用)
(function () {
  const e = base();
  const order = [];
  e.use([
    function () { order.push('x'); },
    { id: 'y', install: function () { order.push('y'); } },
    function () { order.push('z'); }
  ]);
  ok('G1 use([..]) 按序安装全部', order.join('') === 'xyz');
})();

// H. 端到端:use 内 addPresenter 注册的呈现器,start 后收到快照
(function () {
  const e = base();
  let snap = null;
  e.use(function (api) { api.addPresenter(function (s) { snap = s; }); });
  e.start();
  ok('H1 use→addPresenter 的呈现器收到快照', !!(snap && snap.view.title === '家'));
})();

// I. 错误处理:use 非法插件 / addPresenter 非函数 抛错
(function () {
  const e = base();
  ok('I1 use({无 install}) 抛错', throws(function () { e.use({ id: 'bad' }); }));
  ok('I2 use(数字) 抛错', throws(function () { e.use(42); }));
  ok('I3 addPresenter(非函数) 抛错', throws(function () { e.addPresenter(123); }));
})();

// J. id 去重:重复 use 同 id → warn 一次但不抛、仍安装(宽松,借 Bevy 默认去重而 JS 里更松)
(function () {
  const e = base();
  const origWarn = console.warn; let warned = 0;
  console.warn = function () { warned++; };
  let installs = 0;
  const p = { id: 'dup', install: function () { installs++; } };
  try { e.use(p); e.use(p); } finally { console.warn = origWarn; }
  ok('J1 重复 id 仍两次 install(不阻断)', installs === 2);
  ok('J2 重复 id 触发一次告警', warned === 1);
})();

// K. 无 presenter 的纯逻辑引擎:start 不因 render 触发 dispatch(保持旧语义/lesson ⑪)
(function () {
  const e = base();                   // 未挂任何 presenter
  let threw = false;
  try { e.start(); } catch (x) { threw = true; }
  ok('K1 无 presenter 时 start 不抛(render 早返、不强制 dispatch)', threw === false);
  ok('K2 仍可手动 view() 取分派结果', e.view().view.title === '家');
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
