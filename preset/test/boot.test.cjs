/* preset/boot.js 测试(S12-1)——组装 global.Amatlas 全家桶 + stub DOM,验证:
   自动按 kind 拉内置 module / 缺工厂 fail-loud / escape hatch(return engine、自定义 module 平权)/ 三态。
   node 无 DOM:用 stub doc(querySelector 恒 null → presenter 优雅退化,同 assembly-probe 思路);
   测的是 engine.view() 的数据,不是 DOM 渲染。 */
'use strict';
var pass = 0, fail = 0;
function ok(label, cond, detail) {
  if (cond) { pass++; console.log('  ok  ' + label); }
  else { fail++; console.log('  X   ' + label + '  → ' + (detail || '')); }
}

// ── stub DOM(presenter 在 querySelector 恒 null 时优雅退化)──
function stubEl() {
  return {
    textContent: '', innerHTML: '', className: '', value: '', style: {}, dataset: {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    setAttribute: function () {}, removeAttribute: function () {}, getAttribute: function () { return null; },
    appendChild: function () {}, removeChild: function () {}, insertBefore: function () {}, append: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    addEventListener: function () {}, cloneNode: function () { return stubEl(); },
    firstChild: null, lastChild: null, parentNode: null, children: []
  };
}
function stubDoc() {
  return {
    querySelector: function () { return null; }, getElementById: function () { return null; },
    querySelectorAll: function () { return []; }, createElement: function () { return stubEl(); },
    createElementNS: function () { return stubEl(); }, createTextNode: function () { return {}; },
    addEventListener: function () {}, body: stubEl(), documentElement: stubEl(), head: stubEl()
  };
}

// ── 组装 global.Amatlas(浏览器是各 <script> 挂上的;node 测试手动组装)──
function loadAtlas(overrides) {
  var A = {
    createEngine: require('../../core/runtime/engine-core.js').createEngine,
    TextAdventure: require('../../modules/text-adventure/runtime/renderer.js'),
    Tabletop: require('../../modules/tabletop/runtime/tabletop.js'),
    DomPresenter: require('../../presenters/present-dom.js'),
    SvgPresenter: require('../../presenters/present-svg.js'),
    AudioPresenter: require('../../presenters/present-audio.js'),
    Cutscene: require('../../modules/cutscene/runtime/cutscene.js'),
    SavePlugin: require('../../plugins/save.js'),
    MinimapPlugin: require('../../plugins/minimap.js'),
    AchievementPlugin: require('../../plugins/achievement.js'),
    ResetPlugin: require('../../plugins/reset.js')
  };
  overrides = overrides || {};
  for (var k in overrides) { if (overrides[k] === null) delete A[k]; else A[k] = overrides[k]; }
  global.Amatlas = A;
  return A;
}
var boot = require('../boot.js').boot;
var NO_PRESENT = { svg: false, audio: false };          // 测试聚焦装配,不挂 svg/audio(避免 AudioContext)

function sceneWorld() {
  return { id: '66666666-6666-4666-8666-666666666666', start: { map: 'm', node: 'a' }, maps: { m: { nodes: {
    a: { kind: 'scene', look: '开场白', links: [{ to: 'b', label: '前进' }] },
    b: { kind: 'scene', look: '第二幕', links: [{ to: 'a', label: '返回' }] }
  } } } };
}
function mixedWorld() {
  return { id: '88888888-8888-4888-8888-888888888888', start: { map: 'm', node: 'a' }, maps: { m: { nodes: {
    a: { kind: 'scene', look: '开场', links: [{ to: 't', label: '去试炼' }] },
    t: { kind: 'encounter', look: '试炼', checks: [{ id: 'c', label: '检定', skill: 's', dc: 5, dice: '2d6', success: { text: '成', to: 'a' }, fail: { text: '败', to: 'a' } }], exits: [{ to: 'a', label: '回' }] }
  } } } };
}

// ── A. 基础 + 自动拉 scene module ──
loadAtlas();
var eA = boot(sceneWorld(), { document: stubDoc(), present: NO_PRESENT });
var vA = eA && eA.view && eA.view();
ok('A1 boot 返回 engine、首屏 view 有正文(自动拉了 TextAdventure)', !!(vA && JSON.stringify(vA.view).indexOf('开场白') >= 0), 'view=' + JSON.stringify(vA && vA.view).slice(0, 120));
ok('A2 view 有可点选项', !!(vA && vA.actions && vA.actions.length > 0), 'actions=' + (vA && vA.actions && vA.actions.length));

// ── B. 混合 world 自动拉 scene+encounter 两个 module(走到 encounter 渲染检定)──
loadAtlas();
var eB = boot(mixedWorld(), { document: stubDoc(), present: NO_PRESENT, sheet: { name: '测', skills: { s: 1 }, resources: {} } });
var movB = eB.view().actions.filter(function (a) { return a.to; });
ok('B1 scene 节点装配 OK(有移动到 encounter 的出口)', movB.length > 0, 'acts=' + JSON.stringify(eB.view().actions.map(function (a) { return a.label; })));
eB.apply(movB[0]);                                       // 走到 encounter
var actsB = eB.view().actions;
ok('B2 encounter 节点装配 OK(tabletop 渲染出检定动作)', actsB.some(function (a) { return /检定/.test(a.label || ''); }), 'acts=' + JSON.stringify(actsB.map(function (a) { return a.label; })));
// B3:boot 把 manifest.status 透传给 Tabletop(否则 encounter 节点作者自定义状态栏静默丢失;对称 TextAdventure:115。Sonnet《逝音录》实测)
var eB3 = boot(mixedWorld(), { document: stubDoc(), present: NO_PRESENT, sheet: { name: '测', skills: { s: 1 }, resources: {} }, status: function () { return [{ label: '物品', value: '7' }]; } });
eB3.apply(eB3.view().actions.filter(function (a) { return a.kind === 'move' && a.to === 't'; })[0]);   // 走到 encounter
ok('B3 encounter 节点状态栏含作者 manifest.status 自定义项(变异=boot.js:119 漏传 status → 只剩角色卡默认项、无"物品" → 红)', eB3.view().view.status.some(function (b) { return b.label === '物品' && b.value === '7'; }), 'status=' + JSON.stringify(eB3.view().view.status));

// ── C. fail-loud:world 有 encounter 但 Tabletop 缺 ──
loadAtlas({ Tabletop: null });
var cThrew = false, cMsg = '';
try { boot(mixedWorld(), { document: stubDoc(), present: NO_PRESENT }); } catch (e) { cThrew = /未加载跑团模块/.test(e.message); cMsg = e.message; }
ok('C1 world 有 encounter 但 Tabletop 未加载 → fail-loud 抛 + 提示加 script', cThrew, cMsg.slice(0, 100));

// ── C'. cutscene kind 认领(C2,cutscene-design §6 签字项 Q4):自动拉 + 缺工厂 fail-loud ──
function cutsceneWorld() {
  return { id: '99999999-9999-4999-8999-999999999999', start: { map: 'm', node: 'intro' }, maps: { m: { nodes: {
    intro: { kind: 'cutscene', title: '序章',
      beats: [
        { hold: true, text: '黑幕', run: function (S) { S.flags = S.flags || {}; S.flags.seen_intro = true; } },
        { hold: true, text: '门扉亮起' }
      ],
      links: [{ to: 'a', label: '进入游戏' }] },
    a: { kind: 'scene', look: '正文', links: [{ to: 'a', label: '原地' }] }
  } } } };
}
(function () {
  loadAtlas();
  var e = boot(cutsceneWorld(), { document: stubDoc(), present: NO_PRESENT, storage: null });
  var v = e.view();
  ok("C'1 world 有 cutscene → boot 自动拉过场模块(beat0 渲染出字幕)", v.view.body.length === 1 && v.view.body[0].text === '黑幕', JSON.stringify(v.view.body));
  ok("C'2 首拍动作面只有 ▸，末拍才暴露出口", v.actions.length === 1 && v.actions[0].id === 'cutscene:next', JSON.stringify(v.actions.map(function (a) { return a.id; })));
  e.apply(v.actions[0]);
  ok("C'2b 进入末拍后 link 出现", e.view().actions.some(function (a) { return a.to === 'a'; }), JSON.stringify(e.view().actions.map(function (a) { return a.id; })));
  ok("C'3 beat0 run 已经 enter 的 apply 执行(账本入 state)", e.state.flags && e.state.flags.seen_intro === true && e.state._cutscene && e.state._cutscene.ran['m/intro#0'] === 1, JSON.stringify(e.state._cutscene));
})();
(function () {
  loadAtlas({ Cutscene: null });
  var threw = false, msg = '';
  try { boot(cutsceneWorld(), { document: stubDoc(), present: NO_PRESENT, storage: null }); } catch (e) { threw = /未加载过场模块/.test(e.message) && /cutscene\.js/.test(e.message); msg = e.message; }
  ok("C'4 world 有 cutscene 但 Cutscene 未加载 → fail-loud 抛 + 提示加 script", threw, msg.slice(0, 120));
})();
loadAtlas();   // 还原全家桶(后续段落假定完整 Amatlas)

// ── D. fail-loud:manifest.save 但 SavePlugin 缺 ──
loadAtlas({ SavePlugin: null });
var dThrew = false, dMsg = '';
try { boot(sceneWorld(), { document: stubDoc(), present: NO_PRESENT, save: true }); } catch (e) { dThrew = /未加载 plugins\/save\.js/.test(e.message); dMsg = e.message; }
ok('D1 manifest.save 但 SavePlugin 未加载 → fail-loud 抛', dThrew, dMsg.slice(0, 100));

// ── D'. ResetPlugin 同 D1 模式:manifest.reset:true 但 ResetPlugin 缺 → fail-loud ──
loadAtlas({ ResetPlugin: null });
var dPThrew = false, dPMsg = '';
try { boot(sceneWorld(), { document: stubDoc(), present: NO_PRESENT, reset: true }); } catch (e) { dPThrew = /未加载 plugins\/reset\.js/.test(e.message); dPMsg = e.message; }
ok("D'1 manifest.reset:true 但 ResetPlugin 未加载 → fail-loud 抛(变异=漏接 ResetPlugin→无校验→红)", dPThrew, dPMsg.slice(0, 100));

// ── D''. ResetPlugin 真挂:reset:true + ResetPlugin 在 → 工具栏多 1 个 amatlas-reset-btn ──
loadAtlas();
function trackingDoc() {
  var bar = stubEl(); var appended = [];
  bar.appendChild = function (c) { appended.push(c); };
  return { _bar: bar, _appended: appended,
    querySelector: function (sel) { if (sel === '#plugin-bar') return bar; return null; },
    getElementById: function () { return null; },
    querySelectorAll: function () { return []; }, createElement: function () { return stubEl(); },
    createElementNS: function () { return stubEl(); }, createTextNode: function () { return {}; },
    addEventListener: function () {}, body: stubEl(), documentElement: stubEl(), head: stubEl() };
}
var tdoc = trackingDoc();
boot(sceneWorld(), { document: tdoc, present: NO_PRESENT, reset: true });
var hasResetBtn = tdoc._appended.some(function (c) { return /amatlas-reset-btn/.test(c.className || ''); });
ok("D''1 reset:true → 工具栏挂 ResetPlugin(.amatlas-reset-btn 进 #plugin-bar;变异=boot 漏接 usePlugin→不挂→红)", hasResetBtn, '_appended count=' + tdoc._appended.length);

// ── D'''. reset 未声明 → 不挂(向后兼容老游戏自写 <button id=reset>)──
var tdoc2 = trackingDoc();
boot(sceneWorld(), { document: tdoc2, present: NO_PRESENT });
var noReset = !tdoc2._appended.some(function (c) { return /amatlas-reset-btn/.test(c.className || ''); });
ok("D'''1 reset 未声明 → 不挂(向后兼容;变异=默认挂→违反向后兼容→红)", noReset, '_appended count=' + tdoc2._appended.length);

// ── E. escape hatch:return engine,可继续 use ──
loadAtlas();
var eE = boot(sceneWorld(), { document: stubDoc(), present: NO_PRESENT });
var continued = false;
eE.use(function (api) { continued = (typeof api.view === 'function'); });
ok('E1 boot 返回 engine、可继续 engine.use(escape hatch)', continued, 'continued=' + continued);

// ── F. 自定义/非内置 module 经 manifest.modules 平权装配(用现成 minimal)──
loadAtlas();
var Minimal = require('../../modules/minimal/runtime/minimal.js');
var minimalWorld = Object.assign(
  {},
  require('../../examples/minimal-demo/world.js'),
  { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
);   // B1-b 只给本专项装配副本补身份;正式 example 的 source 迁移留 B1-c。
var fThrew = false, vF = null, fMsg = '';
try { var eF = boot(minimalWorld, { document: stubDoc(), present: NO_PRESENT, modules: [Minimal.createMinimalModule()] }); vF = eF.view(); }
catch (e) { fThrew = true; fMsg = e.message; }
ok('F1 非内置 module(minimal/counter)经 manifest.modules 平权装配、不抛、view 有内容', !fThrew && !!vF, fMsg.slice(0, 120));

// ── G. fail-loud:scene world 但 TextAdventure 缺(自动拉找不到工厂)──
loadAtlas({ TextAdventure: null });
var gThrew = false;
try { boot(sceneWorld(), { document: stubDoc(), present: NO_PRESENT }); } catch (e) { gThrew = /未加载文字冒险模块/.test(e.message); }
ok('G1 scene world 但 TextAdventure 未加载 → fail-loud', gThrew, '');

// ── H. 三态:present.svg:false 不挂(view 仍正常);默认开宽容(无工厂跳过不抛)──
loadAtlas({ SvgPresenter: null, AudioPresenter: null });
var hThrew = false;
try { var eH = boot(sceneWorld(), { document: stubDoc() }); eH.view(); } catch (e) { hThrew = true; }
ok('H1 svg/audio 默认开但工厂缺(没引 script)→ 宽容跳过、不抛', !hThrew, '');

// ── S. v24 每游戏存档身份:核心按 world.id 派生稳定 namespace,boot/插件只继承；显式 override 优先 ──
(function () {
  function mem() { var m = {}; return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, _m: m }; }
  function worldB() {
    var w = sceneWorld();
    w.id = '77777777-7777-4777-8777-777777777777';
    return w;                                                           // 故意与 A 同 maps/start/节点骨架,只换游戏身份。
  }
  var store = mem();
  loadAtlas();
  var e1 = boot(sceneWorld(), { document: stubDoc(), present: NO_PRESENT, storage: store });
  e1.apply(e1.view().actions[0]);                              // 走到 b → 核心自动存档写【派生键】
  var keys1 = Object.keys(store._m);
  ok('S1 核心自动存档写 world.id 派生键', keys1.length === 1 && keys1[0] === 'amatlas:game:' + sceneWorld().id, keys1.join(','));
  loadAtlas();
  var e2 = boot(worldB(), { document: stubDoc(), present: NO_PRESENT, storage: store });
  ok('S2 第二个游戏(图结构相同、world.id 不同)不继承第一个状态', e2.state.pos.map === 'm' && e2.state.pos.node === 'a' && e2.saveKey !== e1.saveKey, JSON.stringify(e2.state.pos));
  loadAtlas();
  var e3 = boot(sceneWorld(), { document: stubDoc(), present: NO_PRESENT, storage: store });
  ok('S3 同一 world.id 重开 → 同键自动续档(回到 b)', e3.state.pos.node === 'b' && e3.saveKey === e1.saveKey, JSON.stringify(e3.state.pos));
  var store2 = mem();
  loadAtlas();
  boot(sceneWorld(), { document: stubDoc(), present: NO_PRESENT, storage: store2, saveKey: 'my-game' });
  ok('S4 manifest.saveKey 显式命名优先(跨版本稳定,推荐)', Object.keys(store2._m).indexOf('my-game') >= 0, Object.keys(store2._m).join(','));
  var store3 = mem();
  loadAtlas();
  boot(sceneWorld(), { document: stubDoc(), present: NO_PRESENT, storage: store3, saveKey: 'g1',
    save: true, achievements: [{ id: 'a1', when: function () { return true; } }] });
  ok('S5 save/achievement 插件继承每游戏键(g1:auto / g1:ach;manifest.storage 也随注入传导)', store3._m['g1:auto'] != null && /a1/.test(store3._m['g1:ach'] || ''), Object.keys(store3._m).join(','));
})();

// ── T. 易用性/逻辑审计批:漏 DomPresenter / storage:null / document 透传 / 错误横幅 / 成就→:auto 时序 ──
(function () {
  function mem() { var m = {}; return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, _m: m }; }

  // T1 漏引 present-dom.js → 指引性抛错(旧版裸 TypeError,违背 boot 自己的 fail-loud 承诺)
  loadAtlas({ DomPresenter: null });
  var t1 = false, t1msg = '';
  try { boot(sceneWorld(), { present: NO_PRESENT, document: stubDoc() }); } catch (e) { t1 = /present-dom\.js/.test(e.message); t1msg = e.message; }
  ok('T1 漏引 present-dom.js → fail-loud 指引(非裸 TypeError)', t1, t1msg.slice(0, 100));

  // T2 manifest.storage:null = 关持久化的合法逃生口,不再回退全局 localStorage
  var spy = mem();
  global.localStorage = spy;
  loadAtlas();
  var eT2 = boot(sceneWorld(), { document: stubDoc(), present: NO_PRESENT, storage: null });
  eT2.apply(eT2.view().actions[0]);
  delete global.localStorage;
  ok('T2 storage:null 不被 || 吞(全局 localStorage 零写入)', Object.keys(spy._m).length === 0, Object.keys(spy._m).join(','));

  // T3 manifest.document 透传到插件(注释承诺"透传",旧版只给 DomPresenter=死字段)
  var d3 = stubDoc(), seen3 = [];
  var oQS = d3.querySelector, oGE = d3.getElementById;
  d3.querySelector = function (s) { seen3.push(s); return oQS(s); };
  d3.getElementById = function (s) { seen3.push(s); return oGE(s); };
  loadAtlas();
  boot(sceneWorld(), { document: d3, present: NO_PRESENT, storage: mem(), save: true, minimap: true });
  ok('T3 manifest.document 透传插件(save/minimap 在注入 doc 上找插槽)', seen3.some(function (s) { return /plugin-bar|plugin-minimap/.test(s); }), seen3.join(',').slice(0, 120));

  // T4 运行时错误横幅:boot 装 window error/unhandledrejection 监听;错误 → 横幅进 body(只建一条)
  var listeners = {}, appended = [];
  global.window = { addEventListener: function (t, fn) { listeners[t] = fn; } };
  var d4 = stubDoc();
  d4.body.appendChild = function (el) { appended.push(el); };
  loadAtlas();
  boot(sceneWorld(), { document: d4, present: NO_PRESENT });
  var hasL = typeof listeners['error'] === 'function' && typeof listeners['unhandledrejection'] === 'function';
  if (hasL) { listeners['error']({ message: '深处 run 抛了' }); listeners['error']({ message: '又抛一次' }); }
  delete global.window;
  ok('T4 错误横幅:装两类监听,错误→横幅进 body 且不重复建', hasL && appended.length === 1 && appended[0].id === 'amatlas-error-banner', 'listeners=' + Object.keys(listeners).join(',') + ' appended=' + appended.length);

  // T5 成就 check 先于 autosave(:auto 信封含本次 enter 解锁的成就;旧序=永远少一拍)
  var store5 = mem();
  loadAtlas();
  boot(sceneWorld(), { document: stubDoc(), present: NO_PRESENT, storage: store5, saveKey: 'g2', save: true,
    achievements: [{ id: 'first-step', title: '启程', when: function () { return true; } }] });
  var env5 = (function () { try { return Buffer.from(JSON.parse(store5._m['g2:auto']).code, 'base64').toString('utf8'); } catch (e) { return ''; } })();
  ok('T5 成就解锁先于 :auto 序列化(信封 code 解码后含 first-step)', /first-step/.test(env5), env5.slice(0, 120));
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
