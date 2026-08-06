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
  var listeners = {};
  Object.defineProperty(style, 'visibility', {
    get: function () { return style._visibility; },
    set: function (v) { styleWrites++; style._visibility = String(v); }
  });
  var el = {
    tagName: tag, className: '', disabled: false, onclick: null, onkeydown: null,
    onpointerdown: null, onpointermove: null, onpointerup: null, onpointercancel: null,
    children: [], attrs: {}, style: style, parentNode: null
  };
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
  el.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(el.attrs, k); };
  el.removeAttribute = function (k) { delete el.attrs[k]; };
  el.addEventListener = function (type, listener) {
    if (!listeners[type]) listeners[type] = [];
    if (listeners[type].indexOf(listener) < 0) listeners[type].push(listener);
  };
  el.removeEventListener = function (type, listener) {
    var list = listeners[type] || [];
    var index = list.indexOf(listener);
    if (index >= 0) list.splice(index, 1);
  };
  el.dispatchEvent = function (event) {
    event = event || {};
    if (!event.target) event.target = el;
    event.currentTarget = el;
    var propertyHandler = el['on' + event.type];
    if (typeof propertyHandler === 'function') propertyHandler.call(el, event);
    (listeners[event.type] || []).slice().forEach(function (listener) { listener.call(el, event); });
    return !event.defaultPrevented;
  };
  el.listenerCount = function (type) { return (listeners[type] || []).length; };
  el.listenerAt = function (type, index) { return (listeners[type] || [])[index] || null; };
  el.focusCount = 0;
  el.focus = function () {
    el.focusCount++;
    if (el.ownerDocument) el.ownerDocument.activeElement = el;
  };
  return el;
}
function makeDoc(withHtml) {
  var c = {};
  ['#mapname', '#place', '#look', '#choices', '#status'].forEach(function (s) { c[s] = makeEl('box'); });
  var d = {
    _c: c,
    body: makeEl('body'),
    createElement: function (t) { var el = makeEl(t); el.ownerDocument = d; return el; },
    createTextNode: function (t) { return { nodeType: 3, textContent: String(t) }; },
    querySelector: function (s) { return c[s] || null; },
    _selection: { isCollapsed: true, toString: function () { return ''; } },
    getSelection: function () { return d._selection; }
  };
  d.body.ownerDocument = d;
  d.activeElement = d.body;
  Object.keys(c).forEach(function (selector) { c[selector].ownerDocument = d; });
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
    takeNext: function () {
      var ids = Object.keys(queue).map(Number).sort(function (a, b) { return a - b; });
      if (!ids.length) return null;
      var callback = queue[ids[0]]; delete queue[ids[0]]; return callback;
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
function pointerEvent(target, extra) {
  var event = {
    target: target, button: 0, pointerId: 1, clientX: 10, clientY: 10, timeStamp: 10,
    defaultPrevented: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false,
    stopPropagation: function () { event.stopped = true; }
  };
  Object.keys(extra || {}).forEach(function (key) { event[key] = extra[key]; });
  return event;
}
function panelClick(look, target, options) {
  options = options || {};
  target = target || look;
  var down = pointerEvent(target, options.down);
  var up = pointerEvent(target, options.up);
  var click = pointerEvent(target, options.click);
  down.type = 'pointerdown'; up.type = 'pointerup'; click.type = 'click';
  look.dispatchEvent(down);
  if (options.move) {
    var move = pointerEvent(target, options.move); move.type = 'pointermove'; look.dispatchEvent(move);
  }
  if (options.cancel) {
    var cancel = pointerEvent(target, options.cancel); cancel.type = 'pointercancel'; look.dispatchEvent(cancel);
  } else look.dispatchEvent(up);
  look.dispatchEvent(click);
  return click;
}
function panelKey(look, key, target, extra) {
  var event = pointerEvent(target || look, extra);
  event.type = 'keydown';
  event.key = key;
  event.repeat = false;
  event.preventDefault = function () { event.defaultPrevented = true; };
  look.dispatchEvent(event);
  return event;
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

// I. Phase 3 typewriter:固定 grapheme DOM、一次性 live 全文、共享 timeline、#look 双态补全/推进。
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
  var control = look;
  var expectedFull = plan.lines.map(function (line) { return line.text; }).join('\n');
  ok('I1 视觉 span 数严格等于 extended grapheme cluster 数(组合音标/ZWJ/旗帜)', spans.length === plan.graphemes.length);
  ok('I2 视觉层 aria-hidden=true，未揭示字素 visibility:hidden 但节点已预布局', visual.length === plan.lines.length && visual.every(function (line) { return attr(line, 'aria-hidden') === 'true'; }) && spans.length > visibleCount(spans));
  ok('I3 完整 sr/live 文本只有一份且初始一次写全', live.length === 1 && live[0].textContent === expectedFull && live[0]._textWrites === 1);
  ok('I4 live 使用 polite + atomic，不逐字符播报', attr(live[0], 'aria-live') === 'polite' && attr(live[0], 'aria-atomic') === 'true');
  ok('I5 runtime next 不进入 #choices，#look 成为唯一可聚焦推进控制', d._c['#choices'].children.length === 0 && attr(control, 'role') === 'button' && attr(control, 'tabindex') === '0' && attr(control, 'data-cutscene-next') === '');
  ok('I6 揭示中的 #look tooltip/aria-label 切为显示全部文字', attr(control, 'title') === '显示全部文字' && attr(control, 'aria-label') === '显示全部文字');
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

  panelClick(control);
  ok('I14 揭示中首次点 #look 立即补全连续前缀到全文', visibleCount(spans) === spans.length);
  ok('I15 首次点 #look 只补全：注销 rAF consumer 且不 fire cutscene:next', manager.inspect().key === null && raf.pending() === 0 && raf.cancellations() === 1 && appliedLocal.length === 0);
  ok('I16 补全后保留同一 #look 节点并把 tooltip/aria-label 切回继续语义', d._c['#look'] === control && attr(control, 'title') === '继续 / 下一段' && attr(control, 'aria-label') === '继续 / 下一段');
  panelClick(control);
  ok('I17 补全后再次点同一 #look 正常 fire cutscene:next', appliedLocal.length === 1 && appliedLocal[0].id === 'cutscene:next');
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
    var control = d._c['#look'];
    panelClick(control);
    ok(name + ' → 首帧全文、#look 为继续语义且一次点击直接推进', spans.length === plan.graphemes.length && visibleCount(spans) === spans.length && byClass(control, 'amatlas-typewriter-complete').length === 0 && raf.requests() === 0 && d._c['#choices'].children.length === 0 && attr(control, 'title') === '继续 / 下一段' && attr(control, 'aria-label') === '继续 / 下一段' && appliedImmediate.length === 1 && appliedImmediate[0].id === 'cutscene:next');
  } finally {
    if (cleanup) cleanup();
  }
}

// L. reduced-motion/textSpeed 是 DOM 偏好降级；Segmenter 能力只由 reveal compiler 判一次。
(function () {
  var plan = Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 3, chunks: [{ text: '👩‍💻完整文字' }] }] });
  var oldWindow = global.window;
  immediateCase('L1 reduced-motion', {}, plan,
    function () { global.window = { matchMedia: function () { return { matches: true }; } }; },
    function () { global.window = oldWindow; });
  immediateCase('L2 textSpeed=instant', { textSpeed: 'instant' }, plan);

  var savedSegmenter = Intl.Segmenter;
  var oldWarn = console.warn, warns = 0, compileRejected = false;
  console.warn = function (message) { if (/Intl\.Segmenter/.test(String(message))) warns++; };
  try {
    Intl.Segmenter = undefined;
    try {
      Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 3, chunks: [{ text: '不能编译' }] }] }, { path: 'cutscene m/n beats[0].text' });
    } catch (error) {
      compileRejected = /cutscene m\/n beats\[0\]\.text/.test(String(error && error.message)) && /Intl\.Segmenter/.test(String(error && error.message));
    }

    var raf = rafHarness();
    var manager = Timeline.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
    var d = makeDoc();
    createDomPresenter({ document: d, timelineManager: manager }).present(typewriterSnap(plan, 'segmenter-compiled#0', 3000));
    var spans = byClass(d._c['#look'], 'amatlas-typewriter-grapheme');
    ok('L3 缺 Intl.Segmenter 时 author reveal compiler 带路径 fail-loud', compileRejected);
    ok('L4 DOM 只消费已规范化 grapheme plan，不二次探测 Segmenter 或瞬间补全文',
      spans.length === plan.graphemes.length && visibleCount(spans) < spans.length &&
      manager.inspect().consumerCount === 1 && raf.pending() === 1 && warns === 0);
    manager.invalidate(false);
  } finally {
    Intl.Segmenter = savedSegmenter;
    console.warn = oldWarn;
  }
})();

// M. 非对象形 typewriter 不建立补全态：普通 string/string[] 与无文本拍均由 #look 一次点击直接推进。
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
    var control = d._c['#look'];
    panelClick(control);
    ok(name + ' → #look 一次点击直接推进且 #choices 不含 runtime next', d._c['#choices'].children.length === 0 && attr(control, 'title') === '继续 / 下一段' && attr(control, 'aria-label') === '继续 / 下一段' && appliedDirect.length === 1 && appliedDirect[0].id === 'cutscene:next');
  }
  directCase('M1 普通 string 归一化单行', [{ type: 'prose', text: '整句出现' }]);
  directCase('M2 普通 string[] 归一化多行', [{ type: 'prose', text: '第一行' }, { type: 'prose', text: '第二行' }]);
  directCase('M3 无文本拍', []);
})();

// N. typewriter 自然播完后同一 #look 必须恢复推进，不因完成回调吞 action。
(function () {
  var plan = Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 4, chunks: [{ text: '自然播完' }] }] });
  var raf = rafHarness();
  var manager = Timeline.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  var d = makeDoc(), appliedNatural = [];
  var presenter = createDomPresenter({ document: d, timelineManager: manager });
  presenter.install({ apply: function (a) { appliedNatural.push(a); }, addPresenter: function () {}, registerModule: function () {} });
  presenter.present(typewriterSnap(plan, 'natural#0', 1000));
  var control = d._c['#look'];
  var timestamp = 0, frames = 0;
  while (raf.pending() && frames < 10) {
    raf.fireNext(timestamp);
    timestamp += 250;
    frames++;
  }
  var spans = byClass(d._c['#look'], 'amatlas-typewriter-grapheme');
  ok('N1 自然播完后全文可见且同一 #look 的 aria-label 恢复继续语义', frames < 10 && visibleCount(spans) === spans.length && d._c['#look'] === control && attr(control, 'title') === '继续 / 下一段' && attr(control, 'aria-label') === '继续 / 下一段');
  panelClick(control);
  ok('N2 自然播完后点 #look 正常推进不卡死', appliedNatural.length === 1 && appliedNatural[0].id === 'cutscene:next');
})();

// O. 末拍 links 是独立作者动作：揭示进行中也不被 #look 的本地补全拦截吞掉。
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
  var link = d._c['#choices'].children[0];
  if (link && typeof link.onclick === 'function') link.onclick();
  ok('O1 #choices 只渲染末拍作者 link；link 照常 fire 且不触发补全或 next', d._c['#choices'].children.length === 1 && link.textContent === '离开' && appliedLink.length === 1 && appliedLink[0].id === 'link:leave' && visibleCount(spans) === before && attr(d._c['#look'], 'aria-label') === '显示全部文字');
  manager.invalidate(false);
})();

// P. runtime next 完全融合到正文面板；同一物理 click 不能补全文后又越拍。
(function () {
  var plan = Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 2, chunks: [{ text: '面板两击' }] }] });
  var manager = Timeline.createPlaybackManager({ requestAnimationFrame: rafHarness().request, cancelAnimationFrame: function () {} });
  var d = makeDoc(), appliedPanel = [];
  var presenter = createDomPresenter({ document: d, timelineManager: manager });
  presenter.install({ apply: function (action) { appliedPanel.push(action); }, addPresenter: function () {}, registerModule: function () {} });
  presenter.present(typewriterSnap(plan, 'panel#0', 5000));
  var look = d._c['#look'];
  var spans = byClass(look, 'amatlas-typewriter-grapheme');
  ok('P1 不留独立 next DOM，#look 获得完整 button 语义与稳定 data hook', d._c['#choices'].children.length === 0 && attr(look, 'role') === 'button' && attr(look, 'tabindex') === '0' && attr(look, 'data-cutscene-next') === '');
  panelClick(look);
  ok('P2 正文第一击只补全文，不 apply', visibleCount(spans) === spans.length && appliedPanel.length === 0 && attr(look, 'aria-label') === '继续 / 下一段');
  panelClick(look);
  ok('P3 正文第二击只推进一次', appliedPanel.length === 1 && appliedPanel[0].id === 'cutscene:next');
  ok('P4 #choices 不存在 cutscene:next 的 button/class/data 残留', byClass(d._c['#choices'], 'cutscene-next').length === 0 && d._c['#choices'].children.length === 0);
})();

// Q. 面板便利点击的误触保护：selection/交互控件/修饰键/右键/defaultPrevented/拖动/取消/长按。
(function () {
  function plainSnap(actions, kind) {
    return { pos: { map: 'm', node: 'guard' }, nodeKind: kind || 'cutscene', view: { title: 'guard', body: [{ type: 'prose', text: '可选择正文' }] }, actions: actions };
  }
  var d = makeDoc(), appliedGuard = [];
  var presenter = createDomPresenter({ document: d });
  presenter.install({ apply: function (action) { appliedGuard.push(action); }, addPresenter: function () {} });
  var nextAction = { id: 'cutscene:next', label: '▸' };
  presenter.present(plainSnap([nextAction]));
  var look = d._c['#look'];

  d._selection = { isCollapsed: false, toString: function () { return '正文'; } };
  panelClick(look);
  d._selection = { isCollapsed: true, toString: function () { return ''; } };
  panelClick(look, look, { click: { shiftKey: true } });
  panelClick(look, look, { down: { button: 2 }, up: { button: 2 }, click: { button: 2 } });
  panelClick(look, look, { click: { defaultPrevented: true } });
  panelClick(look, look, { move: { clientX: 40, clientY: 10 } });
  panelClick(look, look, { cancel: {} });
  panelClick(look, look, { down: { timeStamp: 0 }, up: { timeStamp: 900 }, click: { timeStamp: 900 } });
  panelKey(look, 'Enter', look, { shiftKey: true });
  panelKey(look, ' ', look, { ctrlKey: true });
  ok('Q1 selection/修饰键/右键/defaultPrevented/拖动/取消/长按均不推进', appliedGuard.length === 0);

  ['a', 'button', 'input', 'select', 'textarea', 'label', 'summary'].forEach(function (tag) {
    var target = makeEl(tag); target.parentNode = look; panelClick(look, target);
  });
  var editable = makeEl('span'); editable.setAttribute('contenteditable', 'true'); editable.parentNode = look; panelClick(look, editable);
  var roleButton = makeEl('span'); roleButton.setAttribute('role', 'button'); roleButton.parentNode = look; panelClick(look, roleButton);
  var roleLink = makeEl('span'); roleLink.setAttribute('role', 'link'); roleLink.parentNode = look; panelClick(look, roleLink);
  ok('Q2 链接/按钮/表单/contenteditable/role button|link 内点击均不推进', appliedGuard.length === 0);

  presenter.present(plainSnap([nextAction, { id: 'link:leave', label: '作者出口', kind: 'move' }]));
  look = d._c['#look'];
  panelClick(look);
  ok('Q3 末拍 next+作者 link 共存时正文只触发 next，不代选作者出口', appliedGuard.length === 1 && appliedGuard[0].id === 'cutscene:next');

  presenter.present(plainSnap([{ id: 'link:a', label: 'A', kind: 'move' }, { id: 'link:b', label: 'B', kind: 'move' }]));
  look = d._c['#look'];
  ok('Q4 末拍只剩作者 links 时面板完全不可操作且无可访问属性残留', look.onclick === null && look.onpointerdown === null && look.onkeydown === null && look.listenerCount('keydown') === 0 && !/(?:^|\s)cutscene-next-panel(?:\s|$)/.test(look.className) && attr(look, 'role') === null && attr(look, 'tabindex') === null && attr(look, 'data-cutscene-next') === null && attr(look, 'title') === null && attr(look, 'aria-label') === null);
  presenter.present(plainSnap([nextAction], 'scene'));
  look = d._c['#look'];
  ok('Q5 普通 scene 即使伪造同 id 也不绑定面板推进', look.onclick === null && look.onpointerdown === null && look.listenerCount('keydown') === 0 && attr(look, 'role') === null);
})();

// R. 重渲染/离开 cutscene 必须替换并清理 handler，不累计双触发。
(function () {
  var d = makeDoc(), appliedCleanup = [];
  var look = d._c['#look'], sentinelClicks = 0, sentinelDowns = 0, sentinelKeys = 0;
  var sentinelClick = function () { sentinelClicks++; };
  var sentinelDown = function () { sentinelDowns++; };
  var sentinelKey = function () { sentinelKeys++; };
  look.onclick = sentinelClick;
  look.onpointerdown = sentinelDown;
  look.onkeydown = sentinelKey;
  look.className = 'reader-panel';
  look.setAttribute('role', 'region');
  look.setAttribute('tabindex', '-1');
  look.setAttribute('data-cutscene-next', 'author-value');
  look.setAttribute('title', '既有标题');
  look.setAttribute('aria-label', '既有名称');
  var presenter = createDomPresenter({ document: d });
  presenter.install({ apply: function (action) { appliedCleanup.push(action); }, addPresenter: function () {} });
  var snap = { pos: { map: 'm', node: 'same' }, nodeKind: 'cutscene', view: { title: 'same', body: [{ type: 'prose', text: 'x' }] }, actions: [{ id: 'cutscene:next', label: '▸' }] };
  presenter.present(snap);
  var firstClick = look.listenerAt('click', 0);
  panelClick(look);
  presenter.present(snap);
  var secondClick = look.listenerAt('click', 0);
  panelClick(look);
  ok('R1 同节点重渲染替换 listener 且一次 click 只 apply 一次', firstClick && secondClick && firstClick !== secondClick && look.listenerCount('click') === 1 && appliedCleanup.length === 2);
  ok('R2 cutscene 内既有属性 handler 与 panel listener 共存', look.onclick === sentinelClick && look.onpointerdown === sentinelDown && look.onkeydown === sentinelKey && sentinelClicks === 2 && sentinelDowns === 2);
  ok('R3 cutscene 激活时只增量覆盖推进语义，保留既有 class', /(?:^|\s)reader-panel(?:\s|$)/.test(look.className) && /(?:^|\s)cutscene-next-panel(?:\s|$)/.test(look.className) && attr(look, 'role') === 'button' && attr(look, 'tabindex') === '0' && attr(look, 'data-cutscene-next') === '');
  presenter.present({ pos: { map: 'm', node: 'plain' }, nodeKind: 'scene', view: { title: 'plain', body: [] }, actions: [] });
  ok('R4 离开 cutscene 后只移除自身 listener，既有 handler 原样保留', look.listenerCount('click') === 0 && look.listenerCount('pointerdown') === 0 && look.listenerCount('keydown') === 0 && look.onclick === sentinelClick && look.onpointerdown === sentinelDown && look.onkeydown === sentinelKey && !/(?:^|\s)cutscene-next-panel(?:\s|$)/.test(look.className));
  ok('R5 离开 cutscene 后逐值恢复 #look 既有可访问属性', look.className === 'reader-panel' && attr(look, 'role') === 'region' && attr(look, 'tabindex') === '-1' && attr(look, 'data-cutscene-next') === 'author-value' && attr(look, 'title') === '既有标题' && attr(look, 'aria-label') === '既有名称');
  panelClick(look);
  panelKey(look, 'Enter');
  ok('R6 离场后 sentinel 仍执行且 panel 不再推进', sentinelClicks === 3 && sentinelDowns === 3 && sentinelKeys === 1 && appliedCleanup.length === 2);
})();

// S. 同节点换拍复用 #look：Enter/Space 两击且焦点连续留在正文面板。
(function () {
  var plan = Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 2, chunks: [{ text: '键盘连续推进' }] }] });
  var d = makeDoc(), phase = 0, presenter;
  var snaps = [
    typewriterSnap(plan, 'focus#0', 5000),
    { pos: { map: 'coast', node: 'intro' }, nodeKind: 'cutscene', view: { title: '第二拍', body: [{ type: 'prose', text: '已完整' }] }, actions: [{ id: 'cutscene:next', label: '▸' }] },
    { pos: { map: 'coast', node: 'intro' }, nodeKind: 'cutscene', view: { title: '第三拍', body: [{ type: 'prose', text: '继续' }] }, actions: [{ id: 'cutscene:next', label: '▸' }] }
  ];
  presenter = createDomPresenter({ document: d, timelineManager: Timeline.createPlaybackManager({ requestAnimationFrame: rafHarness().request, cancelAnimationFrame: function () {} }) });
  presenter.install({
    apply: function () { phase++; presenter.present(snaps[phase]); },
    addPresenter: function () {}, registerModule: function () {}
  });
  presenter.present(snaps[0]);
  var panel = d._c['#look'];
  panel.focus();
  var enterReveal = panelKey(panel, 'Enter');
  ok('S1 首次 Enter 只补全文、阻止默认滚动且焦点仍在 #look', phase === 0 && enterReveal.defaultPrevented && d.activeElement === panel && attr(panel, 'aria-label') === '继续 / 下一段');
  var spaceAdvance = panelKey(panel, ' ');
  ok('S2 第二次 Space 换拍后复用 #look 并保持焦点', phase === 1 && spaceAdvance.defaultPrevented && d._c['#look'] === panel && d.activeElement === panel && attr(panel, 'role') === 'button');
  panelKey(panel, 'Enter');
  ok('S3 第三次 Enter 可继续换拍且焦点连续留在 #look', phase === 2 && d._c['#look'] === panel && d.activeElement === panel);

  d.activeElement = d.body;
  presenter.present(snaps[1]);
  panelClick(d._c['#look']);
  ok('S4 panel click 在 #look 未聚焦时不主动抢焦点', d.activeElement === d.body);
})();

// T. 极简旧 stub 没有 add/removeEventListener 时，属性回退也必须共存并原样恢复。
(function () {
  var d = makeDoc(), look = d._c['#look'], appliedFallback = 0, sentinel = 0, keySentinel = 0;
  look.addEventListener = null;
  look.removeEventListener = null;
  var oldClick = function () { sentinel++; };
  var oldKey = function () { keySentinel++; };
  look.onclick = oldClick;
  look.onkeydown = oldKey;
  var presenter = createDomPresenter({ document: d });
  presenter.install({ apply: function () { appliedFallback++; }, addPresenter: function () {} });
  var cutscene = { pos: { map: 'm', node: 'fallback' }, nodeKind: 'cutscene', view: { title: 'fallback', body: [] }, actions: [{ id: 'cutscene:next', label: '▸' }] };
  presenter.present(cutscene);
  panelClick(look);
  panelKey(look, 'Enter');
  ok('T1 无 listener API 时属性回退同时调用既有 click/key handler 与 panel', sentinel === 1 && keySentinel === 1 && appliedFallback === 2 && look.onclick !== oldClick && look.onkeydown !== oldKey);
  presenter.present({ pos: { map: 'm', node: 'plain' }, nodeKind: 'scene', view: { title: 'plain', body: [] }, actions: [] });
  ok('T2 属性回退离场后逐字恢复既有 handler', look.onclick === oldClick && look.onkeydown === oldKey);
  panelClick(look);
  panelKey(look, 'Enter');
  ok('T3 恢复后的 sentinel 仍执行且 panel 不残留', sentinel === 2 && keySentinel === 2 && appliedFallback === 2);
})();

// U. runtime next 已融合进 #look：保留 pointer/focus ring，删除 fixed next、侧向留白、toast 让位与 choices 层叠 CSS。
(function () {
  var d = makeDoc();
  d.head = makeEl('head');
  d.head.ownerDocument = d;
  var presenter = createDomPresenter({ document: d });
  presenter.present({ view: { title: 'cutscene', body: [] }, actions: [] });
  var css = d.head.children.length === 1 ? d.head.children[0].textContent : '';
  var lookRule = (css.match(/#look\.cutscene-next-panel\{([^}]*)\}/) || [])[1] || '';
  var focusRule = (css.match(/#look\.cutscene-next-panel:focus-visible\{([^}]*)\}/) || [])[1] || '';

  ok('U1 #look 推进态只增加 pointer affordance，不再预留 fixed next 留白', /cursor\s*:\s*pointer/.test(lookRule) && !/padding-(?:inline|block)/.test(lookRule) && !/safe-area-inset/.test(lookRule));
  ok('U2 #look 键盘焦点环有明确 outline 与 offset', /outline\s*:\s*2px\s+solid\s+currentColor/.test(focusRule) && /outline-offset\s*:\s*3px/.test(focusRule));
  ok('U3 注入 CSS 不再含独立 next 定位、choices 抬层或 toast 让位', !/\.cutscene-next\{/.test(css) && !/#choices\{z-index\s*:/.test(css) && !/\.amatlas-toast-stack\{bottom\s*:/.test(css) && !/position\s*:\s*fixed/.test(css));
})();

// V. 用户要求的真正“按钮融合”：runtime next 只把正文面板变成可访问推进面，不再生成独立 choice button。
(function () {
  var d = makeDoc(), appliedFusion = [];
  var presenter = createDomPresenter({ document: d });
  presenter.install({ apply: function (action) { appliedFusion.push(action); }, addPresenter: function () {} });
  presenter.present({
    pos: { map: 'm', node: 'fusion' }, nodeKind: 'cutscene',
    view: { title: '融合', body: [{ type: 'prose', text: '正文就是推进面' }] },
    actions: [{ id: 'cutscene:next', label: '▸' }]
  });
  var look = d._c['#look'];
  ok('V1 runtime next 不再向 #choices 渲染独立按钮', d._c['#choices'].children.length === 0);
  ok('V2 #look 自身承担 button 语义、键盘焦点与稳定 hook', attr(look, 'role') === 'button' && attr(look, 'tabindex') === '0' && attr(look, 'data-cutscene-next') === '' && attr(look, 'aria-label') === '继续 / 下一段');
  look.dispatchEvent({ type: 'keydown', target: look, key: 'Enter', defaultPrevented: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, preventDefault: function () { this.defaultPrevented = true; } });
  ok('V3 聚焦正文面按 Enter 只推进一次', appliedFusion.length === 1 && appliedFusion[0].id === 'cutscene:next');
})();

// W. same-node restore 必须让 DOM local typewriter state 与 timeline generation 一起失效。
(function () {
  var plan = Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 4, chunks: [{ text: '恢复后继续揭示' }] }] });
  var raf = rafHarness();
  var manager = Timeline.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  var d = makeDoc(), lifecycleModules = [];
  var presenter = createDomPresenter({ document: d, timelineManager: manager });
  presenter.install({
    apply: function () {}, addPresenter: function () {},
    registerModule: function (module) { lifecycleModules.push(module); }
  });
  var snap = typewriterSnap(plan, 'restore-same#0', 3000);
  presenter.present(snap);
  var oldSpans = byClass(d._c['#look'], 'amatlas-typewriter-grapheme');
  raf.fireNext(1000);
  raf.fireNext(1250);
  var partial = visibleCount(oldSpans);
  var stale = raf.takeNext();

  lifecycleModules.forEach(function (module) {
    (module.systems || []).forEach(function (system) {
      if (system.on === 'restore') system.run({}, { phase: 'deactivate' });
    });
  });
  presenter.present(snap);

  var newSpans = byClass(d._c['#look'], 'amatlas-typewriter-grapheme');
  var visibleBeforeStale = visibleCount(newSpans);
  var writesBeforeStale = newSpans.map(function (span) { return span._styleWrites(); });
  if (stale) stale(2000);
  var staleSafe = manager.inspect().key === 'restore-same#0' && manager.inspect().consumerCount === 1 &&
    visibleCount(newSpans) === visibleBeforeStale && newSpans.every(function (span, i) {
      return span._styleWrites() === writesBeforeStale[i];
    });
  raf.fireNext(3000);
  raf.fireNext(3250);

  ok('W1 partial reveal → restore deactivate → 同 key/plan 重渲染会重注册；旧回调不写新 session，fresh rAF 继续（普通同 beat 复用仍由 I13 锁定）',
    partial > 0 && partial < oldSpans.length && newSpans.length === oldSpans.length &&
    manager.inspect().consumerCount === 1 && staleSafe && visibleCount(newSpans) > visibleBeforeStale);
  manager.invalidate(false);
})();

// W2. 已完成的同 key/plan 也必须在 restore generation 后重建，不能沿用旧完成态。
(function () {
  var plan = Timeline.compileReveal({ mode: 'typewriter', lines: [{ cps: 20, chunks: [{ text: '完成后恢复' }] }] });
  var raf = rafHarness();
  var manager = Timeline.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  var d = makeDoc(), lifecycleModules = [];
  var presenter = createDomPresenter({ document: d, timelineManager: manager });
  presenter.install({
    apply: function () {}, addPresenter: function () {},
    registerModule: function (module) { lifecycleModules.push(module); }
  });
  var snap = typewriterSnap(plan, 'restore-complete#0', 1000);
  presenter.present(snap);
  var oldLive = byClass(d._c['#look'], 'amatlas-typewriter-live')[0];
  var timestamp = 0, frames = 0;
  while (raf.pending() && frames < 10) {
    raf.fireNext(timestamp);
    timestamp += 250;
    frames++;
  }
  var oldSpans = byClass(d._c['#look'], 'amatlas-typewriter-grapheme');

  lifecycleModules.forEach(function (module) {
    (module.systems || []).forEach(function (system) {
      if (system.on === 'restore') system.run({}, { phase: 'deactivate' });
    });
  });
  presenter.present(snap);

  var newLive = byClass(d._c['#look'], 'amatlas-typewriter-live')[0];
  var newSpans = byClass(d._c['#look'], 'amatlas-typewriter-grapheme');
  ok('W2 completed reveal → restore deactivate → 同 key/plan 也从 t=0 重建并注册，而非沿用旧全文完成态',
    frames < 10 && oldSpans.length > 0 && visibleCount(oldSpans) === oldSpans.length && newLive !== oldLive &&
    newSpans.length === oldSpans.length && visibleCount(newSpans) < newSpans.length &&
    manager.inspect().key === 'restore-complete#0' && manager.inspect().consumerCount === 1);
  manager.invalidate(false);
})();

console.log('present-dom: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
