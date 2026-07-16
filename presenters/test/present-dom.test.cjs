/* Amatlas DOM 呈现器 验证 —— 纯 node、零依赖(极简 document stub,不引 jsdom,对齐 run.cjs)。
   补 present-dom 此前的测试盲区(svg/dice3d/audio 都有自测,唯独 present-dom 靠 jsdom smoke 间接覆盖)。
   锁定:① DOM class 契约(选项/正文/状态全无 amatlas- 前缀,只有插件才带);② locked 选项设原生 disabled
        (浏览器原生灰显 + 不可点,免疫作者 CSS class 怎么写——showcase 复发的 .amatlas-choice 写错也不再"看着能点点了没反应")。
   契约见 ../../core/module-interface.md §4.2/§4.4。DOM 集成(真 DOM、多呈现器并存)留 build --smoke jsdom 烟雾。 */
'use strict';
var createDomPresenter = require('../present-dom.js').createDomPresenter;

var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// 极简 document stub —— present-dom 只用 createElement/createTextNode/querySelector
// + 元素的 className/textContent/onclick/disabled/appendChild。不引 jsdom。
function makeEl(tag) {
  var el = { tagName: tag, className: '', disabled: false, onclick: null, children: [], attrs: {} };
  var _text = '';
  Object.defineProperty(el, 'textContent', {
    get: function () { return _text; },
    set: function (v) { _text = (v == null ? '' : String(v)); el.children = []; }   // 设 textContent 清空子节点(present-dom 用 box.textContent='' 清空容器)
  });
  el.appendChild = function (c) { el.children.push(c); return c; };
  el.setAttribute = function (k, v) { el.attrs[k] = v; };
  el.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null; };
  el.focusCount = 0;
  el.focus = function () { el.focusCount++; };
  return el;
}
function makeDoc(withHtml) {
  var c = {};
  ['#mapname', '#place', '#look', '#choices', '#status'].forEach(function (s) { c[s] = makeEl('box'); });
  var d = {
    _c: c,
    createElement: function (t) { return makeEl(t); },
    createTextNode: function (t) { return { nodeType: 3, textContent: String(t) }; },
    querySelector: function (s) { return c[s] || null; }
  };
  // 带 documentElement stub(含 dataset)——供 H 组测试用;默认不带,保 A-G 组不受影响(guard:typeof dataset === 'object')。
  if (withHtml) d.documentElement = { dataset: {} };
  return d;
}

console.log('present-dom 验证(DOM class 契约 + locked disabled)');

var doc = makeDoc();
var applied = [];
var P = createDomPresenter({ document: doc });
P.install({ apply: function (a) { applied.push(a); }, addPresenter: function () {} });
P.present({
  view: {
    mapname: 'M', title: 'T',
    body: [{ type: 'prose', text: 'hello' }, { type: 'event', text: 'beat' }],
    status: [{ label: '体力', value: 5 }]
  },
  actions: [
    { id: 'go', label: '前进', kind: 'move' },
    { label: '锁住', locked: true, lockHint: '条件未满足' },
    { id: 'chk', label: '掷骰', kind: 'act', adv: 'adv' },
    { id: 'chk2', label: '险掷', kind: 'act', adv: 'dis' }
  ]
});

// A. 选项 class 契约(全无 amatlas- 前缀)+ 点击交核心
var ch = doc._c['#choices'].children;
ok('A1 普通选项 button.choice.move(无 amatlas- 前缀)', ch[0].tagName === 'button' && ch[0].className === 'choice move');
if (typeof ch[0].onclick === 'function') ch[0].onclick();
ok('A2 普通选项点击 → engine.apply(交核心状态转移)', applied.length === 1 && applied[0].id === 'go');
ok('A3 普通选项非 disabled(可点)', ch[0].disabled === false);
// B. locked 选项:.choice.locked + 原生 disabled(本次新增)+ lock-hint span + 不接 onclick
ok('B1 locked 选项 button.choice.locked', ch[1].tagName === 'button' && ch[1].className === 'choice locked');
ok('B2 locked 选项设原生 disabled=true(浏览器原生灰显;免疫作者 CSS class 写法)', ch[1].disabled === true);
ok('B3 locked 选项不接 onclick(点了无转移)', ch[1].onclick === null);
ok('B4 locked 选项含 span.lock-hint(lockHint 文案)', ch[1].children.length === 1 && ch[1].children[0].tagName === 'span' && ch[1].children[0].className === 'lock-hint' && /条件未满足/.test(ch[1].children[0].textContent));
// C. 正文行 class 契约:div.line.line-<type>(event 另留 .event 向后兼容)
var lk = doc._c['#look'].children;
ok('C1 正文行 div.line.line-prose', lk[0].tagName === 'div' && lk[0].className === 'line line-prose' && lk[0].textContent === 'hello');
ok('C2 event 行 div.line.line-event.event(向后兼容旧 .event 选择器)', lk[1].className === 'line line-event event');
// D. 状态项 class 契约:span.status-item > b
var st = doc._c['#status'].children;
ok('D1 状态项 span.status-item(无 amatlas- 前缀)', st[0].tagName === 'span' && st[0].className === 'status-item');
ok('D2 状态值在 <b>', (function () { var b = st[0].children[st[0].children.length - 1]; return b.tagName === 'b' && b.textContent === '5'; })());
// E. 无 DOM 环境(无 document)→ no-op 不抛(零依赖容器退化)
ok('E1 无 document → present no-op 不抛', (function () { try { createDomPresenter({ document: null }).present({ view: {}, actions: [] }); return true; } catch (e) { return false; } })());

// AV. 检定优劣势按钮徽标(端用户诉求:点检定前就在选项上显眼标出优势/劣势,不止掷骰后结果行)
ok('AV1 adv 检定按钮含 span.choice-adv.choice-adv-adv「优势」', (function () { var b = ch[2].children[0]; return ch[2].className === 'choice' && b && b.tagName === 'span' && b.className === 'choice-adv choice-adv-adv' && b.textContent === '优势'; })());
ok('AV2 dis 检定按钮含 span.choice-adv.choice-adv-dis「劣势」', (function () { var b = ch[3].children[0]; return b && b.className === 'choice-adv choice-adv-dis' && b.textContent === '劣势'; })());
ok('AV3 无 adv 的普通选项不加徽标(ch[0] 前进无 choice-adv)', ch[0].children.length === 0);
ok('AV4 徽标 class 无 amatlas- 前缀(核心呈现器契约)', !/amatlas-/.test(ch[2].children[0].className));

// F. 换节点滚回正文顶(易用性审计批):首屏不滚 / 换节点滚 #place / 同节点纯动作不滚
(function () {
  var d = makeDoc(), scrolls = 0;
  d._c['#place'].scrollIntoView = function () { scrolls++; };
  var p = createDomPresenter({ document: d });
  p.install({ apply: function () {}, addPresenter: function () {} });
  function snap(node) { return { pos: { map: 'm', node: node }, view: { title: node, body: [] }, actions: [] }; }
  p.present(snap('a'));
  ok('F1 首屏渲染不滚(尊重浏览器初始/恢复位置)', scrolls === 0);
  p.present(snap('b'));
  ok('F2 换节点 → 滚到 #place(新"页"开头)', scrolls === 1);
  p.present(snap('b'));
  ok('F3 同节点纯动作重渲染不滚(保留阅读位置)', scrolls === 1);
})();

// G. 键盘焦点管理(易用性审计批 · WCAG 视图切换聚焦区域开头):换节点把焦点移到 #place 标题(非首选项按钮)
(function () {
  var d = makeDoc();
  var p = createDomPresenter({ document: d });
  p.install({ apply: function () {}, addPresenter: function () {} });
  function snap(node) { return { pos: { map: 'm', node: node }, view: { title: node, body: [{ type: 'prose', text: 'x' }] }, actions: [{ id: 'go', label: '走', kind: 'move' }] }; }
  var place = d._c['#place'];
  p.present(snap('a'));
  ok('G1 首屏不抢焦点(不打断开场屏幕阅读器播报)', place.focusCount === 0);
  p.present(snap('b'));
  ok('G2 换节点 → 焦点移到 #place 标题(读屏按序读 标题→正文→选项,不跳过正文)', place.focusCount === 1);
  ok('G3 标题被设为 tabindex=-1(可编程聚焦、不进 Tab 序)', place.getAttribute('tabindex') === '-1');
  ok('G4 焦点落在标题/区域而非首个选项按钮(聚焦控件=WCAG 反模式、会跳过正文)', d._c['#choices'].children[0].focusCount === 0);
  p.present(snap('b'));
  ok('G5 同节点纯动作不抢焦点(不把玩家从原处拽走)', place.focusCount === 1);
})();

// H. CSS 钩子:present() 把当前节点/节点类型/气氛/区域写到 documentElement.dataset(showcase Sonnet #10/#11)
(function () {
  var d = makeDoc(true);   // 带 documentElement stub
  var pH = createDomPresenter({ document: d });
  pH.install({ apply: function () {}, addPresenter: function () {} });

  function snap(node, mood, region, kind) {
    return { pos: { map: 'test-map', node: node }, nodeKind: kind || 'scene', view: { title: node, body: [], scene: { mood: mood || '', region: region || '' } }, actions: [] };
  }

  pH.present(snap('intro', 'tense', 'cave', 'cutscene'));
  ok('H1 首次 present → dataset.node = 当前节点 id', d.documentElement.dataset.node === 'intro');
  ok('H2 首次 present → dataset.map = 当前图 id', d.documentElement.dataset.map === 'test-map');
  ok('H3 首次 present → dataset.nodeKind = 当前 node.kind', d.documentElement.dataset.nodeKind === 'cutscene');
  ok('H4 首次 present → dataset.mood = scene.mood', d.documentElement.dataset.mood === 'tense');
  ok('H5 首次 present → dataset.region = scene.region', d.documentElement.dataset.region === 'cave');

  pH.present(snap('ending', 'calm', 'beach', 'scene'));
  ok('H6 换节点后 dataset 全部更新(node/nodeKind/mood/region 均覆盖)', d.documentElement.dataset.node === 'ending' && d.documentElement.dataset.nodeKind === 'scene' && d.documentElement.dataset.mood === 'calm' && d.documentElement.dataset.region === 'beach');

  pH.present({ pos: { map: 'test-map', node: 'plain' }, view: { title: 'plain', body: [] }, actions: [] });
  ok('H7 无 scene/nodeKind 字段 → mood/region/nodeKind 退化为空串、不抛、不残留旧 kind', d.documentElement.dataset.mood === '' && d.documentElement.dataset.region === '' && d.documentElement.dataset.nodeKind === '');

  ok('H8 无 documentElement 的 doc → 跳过不抛(guard 生效)', (function () {
    try {
      var d2 = makeDoc();   // 不带 documentElement
      var p2 = createDomPresenter({ document: d2 });
      p2.install({ apply: function () {}, addPresenter: function () {} });
      p2.present(snap('x', 'eerie', 'forest'));
      return true;
    } catch (e) { return false; }
  })());
})();

console.log('present-dom: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
