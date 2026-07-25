/* Amatlas DOM 呈现器 验证 —— 纯 node、零依赖(极简 document stub,不引 jsdom,对齐 run.cjs)。
   补 present-dom 此前的测试盲区(svg/dice3d/audio 都有自测,唯独 present-dom 靠 jsdom smoke 间接覆盖)。
   锁定:① DOM class 契约(选项/正文/状态全无 amatlas- 前缀,只有插件才带);② locked 选项设原生 disabled
        (浏览器原生灰显 + 不可点,免疫作者 CSS class 怎么写——showcase 复发的 .amatlas-choice 写错也不再"看着能点点了没反应")。
   契约见 ../../core/module-interface.md §4.2/§4.4。DOM 集成(真 DOM、多呈现器并存)留 build --smoke jsdom 烟雾。 */
'use strict';
var createDomPresenter = require('../present-dom.js').createDomPresenter;
var Timeline = require('../present-timeline.js');

var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } }

// 极简 document stub —— present-dom 只用 createElement/createTextNode/querySelector
// + 元素的 className/textContent/onclick/disabled/appendChild。不引 jsdom。
function makeEl(tag) {
  var styleWrites = 0;
  var style = {};
  Object.defineProperty(style, 'visibility', {
    get: function () { return style._visibility; },
    set: function (v) { styleWrites++; style._visibility = String(v); }
  });
  var el = { tagName: tag, className: '', disabled: false, onclick: null, children: [], attrs: {}, style: style, parentNode: null };
  var _text = '';
  var _inner = '';
  el._textWrites = 0;
  el._innerWrites = 0;
  el._styleWrites = function () { return styleWrites; };
  Object.defineProperty(el, 'textContent', {
    get: function () { return _text + el.children.map(function (c) { return c.textContent || ''; }).join(''); },
    set: function (v) {
      el._textWrites++;
      _text = (v == null ? '' : String(v));
      el.children.forEach(function (c) { c.parentNode = null; });
      el.children = [];
    }   // 设 textContent 清空子节点(present-dom 用 box.textContent='' 清空容器)
  });
  Object.defineProperty(el, 'innerHTML', {
    get: function () { return _inner; },
    set: function (v) { el._innerWrites++; _inner = String(v); el.textContent = ''; }
  });
  el.appendChild = function (c) { c.parentNode = el; el.children.push(c); return c; };
  el.removeChild = function (c) {
    var i = el.children.indexOf(c);
    if (i >= 0) { el.children.splice(i, 1); c.parentNode = null; }
    return c;
  };
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

function walk(root, out) {
  out = out || [];
  if (!root) return out;
  out.push(root);
  (root.children || []).forEach(function (child) { walk(child, out); });
  return out;
}
function byClass(root, name) {
  return walk(root).filter(function (el) { return typeof el.className === 'string' && el.className.split(/\s+/).indexOf(name) >= 0; });
}
function attr(root, name) {
  return root && root.getAttribute ? root.getAttribute(name) : null;
}
function serialize(root) {
  if (!root) return '';
  if (root.nodeType === 3) return root.textContent;
  var attrs = [];
  if (root.className) attrs.push('class="' + root.className + '"');
  Object.keys(root.attrs || {}).sort().forEach(function (key) { attrs.push(key + '="' + root.attrs[key] + '"'); });
  var body = (root.children || []).length
    ? root.children.map(serialize).join('')
    : root.textContent;
  return '<' + root.tagName + (attrs.length ? ' ' + attrs.join(' ') : '') + '>' + body + '</' + root.tagName + '>';
}
function rafHarness() {
  var nextId = 1, queue = {}, requests = 0, cancellations = 0;
  return {
    request: function (callback) { var id = nextId++; queue[id] = callback; requests++; return id; },
    cancel: function (id) { cancellations++; delete queue[id]; },
    fireNext: function (timestamp) {
      var ids = Object.keys(queue).map(Number).sort(function (a, b) { return a - b; });
      if (!ids.length) return false;
      var callback = queue[ids[0]]; delete queue[ids[0]]; callback(timestamp); return true;
    },
    pending: function () { return Object.keys(queue).length; },
    requests: function () { return requests; },
    cancellations: function () { return cancellations; }
  };
}
function typewriterSnap(plan, key, durationMs) {
  return {
    pos: { map: 'coast', node: 'intro' }, nodeKind: 'cutscene',
    view: {
      title: '序章',
      body: plan.lines.map(function (line) { return { type: 'prose', text: line.text }; }),
      cutscenePlayback: { version: 1, key: key, durationMs: durationMs, motion: null, text: plan }
    },
    actions: [{ id: 'cutscene:next', label: '▸' }]
  };
}
function visibleCount(spans) {
  return spans.filter(function (span) { return span.style.visibility !== 'hidden'; }).length;
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
ok('C3 plain string/string[] 正文 DOM 字节快照保持旧结构', serialize(doc._c['#look']) === '<box><div class="line line-prose">hello</div><div class="line line-event event">beat</div></box>');
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

// I. Phase 3 typewriter:固定 grapheme DOM、一次性 live 全文、共享 timeline、▸ 双态补全/推进。
(function () {
  var source = { mode: 'typewriter', lines: [
    { cps: 4, chunks: [{ text: '雾e\u0301先分开。', pauseAfter: 0.25 }] },
    { cps: 4, chunks: [{ text: '👩‍💻与🇨🇳灯亮。' }] }
  ] };
  var plan = Timeline.compileReveal(source);
  var raf = rafHarness();
  var manager = Timeline.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  var d = makeDoc(), appliedLocal = [];
  var p = createDomPresenter({ document: d, timelineManager: manager });
  p.install({ apply: function (a) { appliedLocal.push(a); }, addPresenter: function () {}, registerModule: function () {} });
  p.present(typewriterSnap(plan, 'intro#1', 5000));

  var look = d._c['#look'];
  var spans = byClass(look, 'amatlas-typewriter-grapheme');
  var live = byClass(look, 'amatlas-typewriter-live');
  var visual = byClass(look, 'amatlas-typewriter-visual');
  var next = d._c['#choices'].children[0];
  var expectedFull = plan.lines.map(function (line) { return line.text; }).join('\n');
  ok('I1 视觉 span 数严格等于 extended grapheme cluster 数(组合音标/ZWJ/旗帜)', spans.length === plan.graphemes.length);
  ok('I2 视觉层 aria-hidden=true，未揭示字素 visibility:hidden 但节点已预布局', visual.length === plan.lines.length && visual.every(function (line) { return attr(line, 'aria-hidden') === 'true'; }) && spans.length > visibleCount(spans));
  ok('I3 完整 sr/live 文本只有一份且初始一次写全', live.length === 1 && live[0].textContent === expectedFull && live[0]._textWrites === 1);
  ok('I4 live 使用 polite + atomic，不逐字符播报', attr(live[0], 'aria-live') === 'polite' && attr(live[0], 'aria-atomic') === 'true');
  ok('I5 揭示中的 ▸ 是唯一键盘可聚焦控制且保留视觉标签', d._c['#choices'].children.length === 1 && next.tagName === 'button' && next.textContent === '▸' && next.disabled === false && typeof next.onclick === 'function');
  ok('I6 揭示中的 ▸ tooltip/aria-label 切为显示全部文字', attr(next, 'title') === '显示全部文字' && attr(next, 'aria-label') === '显示全部文字');
  ok('I7 DOM 不再渲染独立的立即显示按钮', byClass(look, 'amatlas-typewriter-complete').length === 0);
  ok('I8 typewriter 注册到注入的共享 timeline manager，不自开 rAF', manager.inspect().consumerCount === 1 && raf.requests() === 1 && raf.pending() === 1);

  var spanTextWrites = spans.map(function (span) { return span._textWrites; });
  var liveWrites = live[0] ? live[0]._textWrites : -1;
  var visible = [visibleCount(spans)];
  [0, 100, 300, 550, 800].forEach(function (timestamp) {
    if (raf.fireNext(timestamp)) visible.push(visibleCount(spans));
  });
  ok('I9 rAF 只改 visibility：不写 look/span innerHTML，不重复写任一字素 textContent', spans.length === plan.graphemes.length && look._innerWrites === 0 && spans.every(function (span, i) { return span._innerWrites === 0 && span._textWrites === spanTextWrites[i]; }));
  ok('I10 aria-live 始终只保留首帧一次性完整写入', live[0] && live[0]._textWrites === liveWrites && live[0].textContent === expectedFull);
  ok('I11 正常揭示可见前缀单调不减', visible.length > 1 && visible[visible.length - 1] > visible[0] && visible.every(function (count, i) { return i === 0 || count >= visible[i - 1]; }));
  ok('I12 逐字帧不触发标题/正文焦点移动', d._c['#place'].focusCount === 0 && look.focusCount === 0);

  var requestsBeforeRerender = raf.requests();
  var liveNode = live[0];
  p.present(typewriterSnap(plan, 'intro#1', 5000));
  ok('I13 同 beat rerender 复用正文 DOM，不重播 live、不重启 rAF', !!liveNode && byClass(look, 'amatlas-typewriter-live')[0] === liveNode && liveNode._textWrites === 1 && raf.requests() === requestsBeforeRerender);

  next = d._c['#choices'].children[0];
  if (next && typeof next.onclick === 'function') next.onclick();
  ok('I14 揭示中首次点 ▸ 立即补全连续前缀到全文', visibleCount(spans) === spans.length);
  ok('I15 首次点 ▸ 只补全：注销 rAF consumer 且不 fire cutscene:next', manager.inspect().key === null && raf.pending() === 0 && raf.cancellations() === 1 && appliedLocal.length === 0);
  ok('I16 补全后保留同一 ▸ 节点并把 tooltip/aria-label 切回继续语义', d._c['#choices'].children[0] === next && attr(next, 'title') === '继续 / 下一段' && attr(next, 'aria-label') === '继续 / 下一段');
  if (next && typeof next.onclick === 'function') next.onclick();
  ok('I17 补全后再次点同一 ▸ 正常 fire cutscene:next', appliedLocal.length === 1 && appliedLocal[0].id === 'cutscene:next');
})();

// J. DOM 与 SVG consumer 必须落在同一个 manager session / 同一张 rAF。
(function () {
  var plan = Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 2, chunks: [{ text: '同帧' }] }] });
  var raf = rafHarness();
  var manager = Timeline.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  manager.register({ consumerId: 'svg-test', key: 'shared#0', durationMs: 1000, patch: function () {} });
  var d = makeDoc();
  createDomPresenter({ document: d, timelineManager: manager }).present(typewriterSnap(plan, 'shared#0', 1000));
  ok('J1 SVG + DOM 两 consumer 共享同 key 的唯一 pending rAF', manager.inspect().consumerCount === 2 && raf.requests() === 1 && raf.pending() === 1);
  manager.invalidate(false);
})();

// J2. presenter 必须消费 compiler 的共享 playback duration，不在 DOM 端自行推导。
(function () {
  var plan = Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 2, chunks: [{ text: '有限' }] }] });
  var d = makeDoc();
  var rejected = false;
  try {
    createDomPresenter({ document: d, timelineManager: Timeline.createPlaybackManager({ requestAnimationFrame: null }) })
      .present(typewriterSnap(plan, 'missing-duration#0', null));
  } catch (error) {
    rejected = /durationMs/.test(error && error.message);
  }
  ok('J2 DOM presenter rejects a non-finite playback envelope instead of deriving reveal/motion duration locally', rejected);
})();

// K. 玩家 textSpeed 只缩放 cps；作者 pauseAfter 保持原毫秒数。
(function () {
  var plan = Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 2, chunks: [
    { text: 'AB', pauseAfter: 1 }, { text: 'C' }
  ] }] });
  var registered = null;
  var manager = {
    prepare: function () {},
    register: function (config) { registered = config; config.patch(0); },
    unregister: function () {},
    bindLifecycle: function () {}
  };
  var d = makeDoc();
  createDomPresenter({ document: d, timelineManager: manager, textSpeed: 2 }).present(typewriterSnap(plan, 'speed#0', 3000));
  var spans = byClass(d._c['#look'], 'amatlas-typewriter-grapheme');
  if (registered) registered.patch(1499);
  var before = visibleCount(spans);
  if (registered) registered.patch(1500);
  ok('K1 textSpeed=2 仅把 cps 加倍，1s 作者停顿未缩放(C 在 1500ms 出现)', spans.length === 3 && before === 2 && visibleCount(spans) === 3);
})();

function immediateCase(name, options, plan, setup, cleanup) {
  var raf = rafHarness();
  var manager = Timeline.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  var d = makeDoc();
  var appliedImmediate = [];
  if (setup) setup();
  try {
    options.document = d;
    options.timelineManager = manager;
    var presenter = createDomPresenter(options);
    presenter.install({ apply: function (a) { appliedImmediate.push(a); }, addPresenter: function () {}, registerModule: function () {} });
    presenter.present(typewriterSnap(plan, name + '#0', 3000));
    var spans = byClass(d._c['#look'], 'amatlas-typewriter-grapheme');
    var next = d._c['#choices'].children[0];
    if (next && typeof next.onclick === 'function') next.onclick();
    ok(name + ' → 首帧全文、▸ 为继续语义且一次点击直接推进', spans.length === plan.graphemes.length && visibleCount(spans) === spans.length && byClass(d._c['#look'], 'amatlas-typewriter-complete').length === 0 && raf.requests() === 0 && attr(next, 'title') === '继续 / 下一段' && attr(next, 'aria-label') === '继续 / 下一段' && appliedImmediate.length === 1 && appliedImmediate[0].id === 'cutscene:next');
  } finally {
    if (cleanup) cleanup();
  }
}

// L. 能力/偏好三路降级均为全文立即；缺 Segmenter warn once，绝不 split 回退。
(function () {
  var plan = Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 3, chunks: [{ text: '👩‍💻完整文字' }] }] });
  var oldWindow = global.window;
  immediateCase('L1 reduced-motion', {}, plan,
    function () { global.window = { matchMedia: function () { return { matches: true }; } }; },
    function () { global.window = oldWindow; });
  immediateCase('L2 textSpeed=instant', { textSpeed: 'instant' }, plan);

  var savedSegmenter = Intl.Segmenter;
  var oldWarn = console.warn, warns = 0;
  console.warn = function (message) { if (/Intl\.Segmenter/.test(String(message))) warns++; };
  try {
    Intl.Segmenter = undefined;
    immediateCase('L3 缺 Intl.Segmenter', {}, plan);
    immediateCase('L4 缺 Intl.Segmenter 再次呈现', {}, plan);
  } finally {
    Intl.Segmenter = savedSegmenter;
    console.warn = oldWarn;
  }
  ok('L5 缺 Intl.Segmenter 跨 presenter warn once', warns === 1);
})();

// M. 非对象形 typewriter 不建立补全态：普通 string/string[] 与无文本拍均一次点击直接推进。
(function () {
  function directCase(name, body) {
    var d = makeDoc(), appliedDirect = [];
    var presenter = createDomPresenter({ document: d });
    presenter.install({ apply: function (a) { appliedDirect.push(a); }, addPresenter: function () {} });
    presenter.present({
      pos: { map: 'coast', node: name }, nodeKind: 'cutscene',
      view: { title: name, body: body },
      actions: [{ id: 'cutscene:next', label: '▸' }]
    });
    var next = d._c['#choices'].children[0];
    if (next && typeof next.onclick === 'function') next.onclick();
    ok(name + ' → ▸ 一次点击直接推进', attr(next, 'title') === '继续 / 下一段' && attr(next, 'aria-label') === '继续 / 下一段' && appliedDirect.length === 1 && appliedDirect[0].id === 'cutscene:next');
  }
  directCase('M1 普通 string 归一化单行', [{ type: 'prose', text: '整句出现' }]);
  directCase('M2 普通 string[] 归一化多行', [{ type: 'prose', text: '第一行' }, { type: 'prose', text: '第二行' }]);
  directCase('M3 无文本拍', []);
})();

// N. typewriter 自然播完后同一 ▸ 必须恢复推进，不因完成回调吞 action。
(function () {
  var plan = Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 4, chunks: [{ text: '自然播完' }] }] });
  var raf = rafHarness();
  var manager = Timeline.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  var d = makeDoc(), appliedNatural = [];
  var presenter = createDomPresenter({ document: d, timelineManager: manager });
  presenter.install({ apply: function (a) { appliedNatural.push(a); }, addPresenter: function () {}, registerModule: function () {} });
  presenter.present(typewriterSnap(plan, 'natural#0', 1000));
  var next = d._c['#choices'].children[0];
  var timestamp = 0, frames = 0;
  while (raf.pending() && frames < 10) {
    raf.fireNext(timestamp);
    timestamp += 250;
    frames++;
  }
  var spans = byClass(d._c['#look'], 'amatlas-typewriter-grapheme');
  ok('N1 自然播完后全文可见且同一 ▸ 的 aria-label 恢复继续语义', frames < 10 && visibleCount(spans) === spans.length && d._c['#choices'].children[0] === next && attr(next, 'title') === '继续 / 下一段' && attr(next, 'aria-label') === '继续 / 下一段');
  if (next && typeof next.onclick === 'function') next.onclick();
  ok('N2 自然播完后点 ▸ 正常推进不卡死', appliedNatural.length === 1 && appliedNatural[0].id === 'cutscene:next');
})();

// O. 末拍 links 是独立动作：揭示进行中也不被 ▸ 的本地补全拦截吞掉。
(function () {
  var plan = Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 2, chunks: [{ text: '末拍出口' }] }] });
  var raf = rafHarness();
  var manager = Timeline.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  var d = makeDoc(), appliedLink = [];
  var presenter = createDomPresenter({ document: d, timelineManager: manager });
  presenter.install({ apply: function (a) { appliedLink.push(a); }, addPresenter: function () {}, registerModule: function () {} });
  var snap = typewriterSnap(plan, 'last#0', 3000);
  snap.actions.push({ id: 'link:leave', label: '离开', kind: 'move' });
  presenter.present(snap);
  var spans = byClass(d._c['#look'], 'amatlas-typewriter-grapheme');
  var before = visibleCount(spans);
  var link = d._c['#choices'].children[1];
  if (link && typeof link.onclick === 'function') link.onclick();
  ok('O1 揭示中的末拍 link 照常 fire，自身不触发补全或 cutscene:next', appliedLink.length === 1 && appliedLink[0].id === 'link:leave' && visibleCount(spans) === before && attr(d._c['#choices'].children[0], 'aria-label') === '显示全部文字');
  manager.invalidate(false);
})();

console.log('present-dom: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
