/* Amatlas S8.5 能力插件(存档 / 小地图 / 成就)验证 —— 纯 node、零依赖。
   对真实 engine 验逻辑;mock DOM 验 UI 挂载/退化。覆盖:各自经 use 挂上、互不干扰、不挂零影响、
   `state` namespace 无碰撞、存档含插件状态(序列化往返)、数组形 use([..]) 一次挂三。
   契约见 ../../core/module-interface.md v4 §2.2(use)·§九(api)。 */
const { createEngine } = require('../../core/runtime/engine-core.js');
const { createSavePlugin } = require('../save.js');
const { createMinimapPlugin, buildMinimapSVG } = require('../minimap.js');
const { createAchievementPlugin } = require('../achievement.js');
const { createInventoryPlugin } = require('../inventory.js');
const presentSvg = require('../../presenters/present-svg.js');   // I9:注入 window.Amatlas.SvgPresenter 验 art-spec 矢量图标渲染(复用 renderArtSpec)

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } }
function count(hay, needle) { return hay.split(needle).length - 1; }

// 两节点世界(home↔garden,exits 连接)+ stub 模块(带一次性动作 wave)
function makeWorld() {
  return { id: '55555555-5555-4555-8555-555555555555', start: { map: 'a', node: 'home' }, seed: 1, maps: { a: { name: 'A', nodes: {
    home:   { kind: 'demo', title: '家',   exits: [ { to: 'garden', label: '去花园' } ] },
    garden: { kind: 'demo', title: '花园', exits: [ { to: 'home', label: '回家' } ] }
  } } } };
}
function makeStub() {
  return { id: 'stub', nodeKinds: ['demo'],
    render: function (s, n) { return { title: n.title, body: [ { type: 'text', text: 'x' } ] }; },
    actions: function () { return [ { id: 'wave', label: '挥手', run: function (s) { s.flags.waved = true; } } ]; } };
}
function eng(extra) { var e = createEngine(makeWorld(), { storage: null }); e.registerModule(makeStub()); if (extra) extra(e); return e; }
function moveTo(e, node) { var a = e.view().actions.filter(function (x) { return x.kind === 'move' && x.to === node; })[0]; e.apply(a); }
function actionById(e, id) { return e.view().actions.filter(function (x) { return x.id === id; })[0]; }
// 极简 mock DOM:slot 元素带 innerHTML / appendChild;createElement 造同形元素。appendChild 记 parentNode +
// removeChild 真摘除(round10:验 toast 自动消隐出 DOM;旧断言只读 _kids,纯增不影响)。
function mockEl() { return { innerHTML: '', value: '', className: '', textContent: '', _kids: [], appendChild: function (c) { c.parentNode = this; this._kids.push(c); }, removeChild: function (c) { var i = this._kids.indexOf(c); if (i >= 0) this._kids.splice(i, 1); c.parentNode = null; }, setAttribute: function () {}, set onclick(f) { this._click = f; }, get onclick() { return this._click; } }; }
function mockDoc(map) { return { querySelector: function (s) { return map[s] || null; }, createElement: function () { return mockEl(); } }; }
// 内存 storage(测多槽存档,不依赖真 localStorage;核心仍用 storage:null 不持久化 → 隔离验证)
function memStorage() { var m = {}; return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; }

console.log('能力插件(save/minimap/achievement/inventory)验证');

// A. 存档插件:exportSave/importSave 对真实 engine 往返
(function () {
  var save = createSavePlugin();
  var e = eng(function (x) { x.use(save); }); e.start();
  e.apply(actionById(e, 'wave'));                       // 改 state(waved=true)
  ok('A1 wave 动作改了 state.flags', e.state.flags.waved === true);
  var code = save.exportSave();
  ok('A2 exportSave 产出非空存档码', typeof code === 'string' && code.length > 0);
  moveTo(e, 'garden');                                   // 再改(pos=garden)
  ok('A3 状态已变(pos=garden)', e.state.pos.node === 'garden');
  ok('A4 importSave 还原到导出点(回 home、waved 仍在)', save.importSave(code) === true && e.state.pos.node === 'home' && e.state.flags.waved === true);
})();

// A'. 存档插件 UI(S11-c 多槽):mock DOM 下挂「💾 存档」按钮 + toggle 面板;面板末尾导出码填入 textarea
(function () {
  var bar = mockEl(); var doc = mockDoc({ '#plugin-bar': bar });
  var save = createSavePlugin({ document: doc, storage: memStorage() });
  var e = eng(function (x) { x.use(save); }); e.start();
  ok('A5 UI 挂到约定插槽(💾 按钮 + 隐藏面板,2 子元素)', bar._kids.length === 2 && /💾/.test(bar._kids[0].textContent) && bar._kids[1].hidden === true);
  var btn = bar._kids[0], panel = bar._kids[1];
  btn.onclick();                                         // 点 💾 展开
  ok('A6 点 💾 → 面板展开', panel.hidden === false);
  var io = panel._kids[panel._kids.length - 1];          // 面板末尾:导出/导入区(textarea + 导出码 + 导入码)
  var ta = io._kids[0], exportBtn = io._kids[1];
  exportBtn.onclick();                                   // 点"导出码"
  ok('A7 点导出码 → textarea 填入存档码', typeof ta.value === 'string' && ta.value.length > 0);
})();

// A''. 多槽管理(纯逻辑,mock storage 注入;无 doc → 跳过 UI、API 仍可调):listSlots/saveTo/loadFrom/deleteSlot/autosave
(function () {
  var store = memStorage(), T = 1700000000000;
  var save = createSavePlugin({ storage: store, slots: 3, now: function () { return T; }, autoOnEnter: false });
  var e = eng(function (x) { x.use(save); }); e.start();   // 在 home(核心 storage:null;插件用 store → 隔离)
  var L0 = save.listSlots();
  ok('A8 listSlots = auto + N 槽、初始全空', L0.length === 4 && L0[0].id === 'auto' && L0[0].kind === 'auto' && L0.every(function (s) { return s.empty; }));
  ok('A9 saveTo(1,label) 写手动槽(meta:place/turn/label/ts)', save.saveTo(1, '存档点') === true && (function () { var s = save.listSlots()[1]; return !s.empty && s.label === '存档点' && s.place === '家' && s.turn === 0 && s.ts === T; })());
  moveTo(e, 'garden'); e.apply(actionById(e, 'wave'));     // 改状态(pos=garden、waved)
  ok('A10 改状态后槽 1 仍是旧快照(place 不变=只读 meta、不随当前 state)', save.listSlots()[1].place === '家');
  ok('A11 loadFrom(1) 还原存档点(回 home、waved 未发生)', save.loadFrom(1) === true && e.state.pos.node === 'home' && !e.state.flags.waved);
  ok('A12 autosave() 写 :auto 槽', save.autosave() === true && !save.listSlots()[0].empty);
  ok('A13 loadFrom 空槽 → false(不破坏当前状态)', save.loadFrom(3) === false && e.state.pos.node === 'home');
  ok('A14 deleteSlot(1) 清空该槽', (function () { save.deleteSlot(1); return save.listSlots()[1].empty; })());
  ok('A15 auto 与 slot 用不同 storage key(信封隔离:删/写 slot 不动 auto)', save.saveTo(2) === true && !save.listSlots()[2].empty && save.listSlots()[0].empty === false);
})();

// A'''. 行内按钮按状态显隐 + emoji(空槽:仅 💾 存档;有档:📂 读取 + 🗑 删除〔删除悬停浮现=CSS〕;重存=先删再存)
(function () {
  var bar = mockEl(); var doc = mockDoc({ '#plugin-bar': bar });
  var save = createSavePlugin({ document: doc, storage: memStorage(), slots: 3 });
  var e = eng(function (x) { x.use(save); }); e.start();
  var panel = bar._kids[1], row1 = panel._kids[2];        // [head, auto, row1, row2, row3, io]
  var sv = row1._kids[1], ld = row1._kids[2], dl = row1._kids[3];   // [info, save, load, del]
  ok('A16 空手动槽:仅显 💾 存档、读/删隐藏', /💾/.test(sv.textContent) && sv.hidden === false && ld.hidden === true && dl.hidden === true);
  save.saveTo(1, '存档点');
  ok('A17 存后:藏 💾、显 📂 读取 + 🗑 删除(emoji)', sv.hidden === true && /📂/.test(ld.textContent) && ld.hidden === false && /🗑/.test(dl.textContent) && dl.hidden === false);
  ok('A18 删后回空:复显 💾、藏读/删(重存=先删再存)', (function () { save.deleteSlot(1); return sv.hidden === false && ld.hidden === true && dl.hidden === true; })());
  var head = panel._kids[0], xbtn = head._kids[0];        // head 内 ✕
  ok('A19 存档浮窗 head 含 ✕、点击关闭', /✕/.test(xbtn.textContent) && (function () { panel.hidden = false; xbtn.onclick(); return panel.hidden === true; })());
})();

// A'''''. C3(qol-backlog-design):坏档读取可见反馈——槽位读档 + auto 槽 + 导入码三口(修守卫扫族一次改齐)
(function () {
  var store = memStorage();
  var bar = mockEl(); var doc = mockDoc({ '#plugin-bar': bar });
  var save = createSavePlugin({ document: doc, storage: store, slots: 3 });
  var e = eng(function (x) { x.use(save); }); e.start();
  var btnEl = bar._kids[0], panel = bar._kids[1], row1 = panel._kids[2];   // [head, auto, row1, row2, row3, io]
  // 直接塞坏档信封进 storage(绕过 saveTo,走真实"坏档已在盘上"场景)。
  // 关键:插件信封 { v, code, meta } 的外层 v 是插件自己的信封版本号(save.js 从不读它做校验)——
  //   loadFrom(id) 只把 env.code 转交 api.importCode(env.code),真正的 badShape 校验发生在**核心解码 code 之后**
  //   看到的**内层** { v:SAVE_VERSION, state:{...} }(engine-core.js:326-336)。故要造"坏档",须让 code 本身
  //   解码后是版本不识的内层 JSON(设计稿示例 v:999 那层),而非乱动外层信封的 v(那只是插件私有元数据)。
  var badCode = Buffer.from(JSON.stringify({ v: 999, state: { pos: { map: 'a', node: 'home' } } }), 'utf8').toString('base64');
  var validCode = save.exportSave();
  store.setItem('amatlas:game:55555555-5555-4555-8555-555555555555:slot:1', JSON.stringify({ v: 1, code: badCode, meta: { ts: 1, place: '家', turn: 0, label: '' } }));
  var ld1 = row1._kids[2];                                // [info, save, load, del]
  btnEl.onclick();                                         // 开面板 → refresh():该槽此刻(listSlots 只读 meta,非空)显"读取"
  ok('A20 坏档槽被 listSlots 判非空(只读 meta,不反序列化 code)、读取按钮可点', panel.hidden === false && ld1.hidden === false);
  ld1.onclick();                                           // 点"读取" → loadFrom(1) 内 importCode 解码内层 v:999 → badShape 拒绝 → false
  ok('A21 坏档读取失败 → 该行 info 出现提示文案(此前零反馈="点了没反应")', /存档不兼容|已损坏/.test(row1._kids[0].textContent));
  ok('A22 坏档读取失败 → 面板不收起(非破坏性失败,留给玩家看提示;成功路径才关)', panel.hidden === false);
  ok('A23 坏档读取失败 → state 未被污染(仍在 home、waved 未被设置)', e.state.pos.node === 'home' && !e.state.flags.waved);
  // auto 槽同一 onLoad 函数、同一反馈(设计稿明确要求 auto 槽同口覆盖)
  store.setItem('amatlas:game:55555555-5555-4555-8555-555555555555:auto', JSON.stringify({ v: 1, code: badCode, meta: { ts: 1, place: '家', turn: 0, label: '' } }));
  var autoRow = panel._kids[1], ldAuto = autoRow._kids[1]; // auto 行无 save 按钮:[info, load, del]
  btnEl.onclick(); btnEl.onclick();                        // 关→开,重触发 refresh()(auto 槽此刻非空、读取可点)
  ldAuto.onclick();
  ok('A24 auto 槽坏档同样有反馈(共享 onLoad,非另起一套)', /存档不兼容|已损坏/.test(autoRow._kids[0].textContent));
  // 好档回归:读取成功 → 面板收起、无警告文案残留(零回归)
  save.deleteSlot(1);                                      // 清掉坏档
  save.saveTo(2, '好档');
  btnEl.onclick(); btnEl.onclick();                         // 关→开,重触发 refresh()
  var row2 = panel._kids[3], ld2 = row2._kids[2];
  ld2.onclick();
  ok('A25 好档读取成功 → 面板收起(零回归,C3 未破坏成功路径)', panel.hidden === true);
  // 导入码口:粘贴无效码点"导入码" → ioStatus 提示(此前完全不消费 importSave 返回值)
  btnEl.onclick();                                          // 重开面板
  var io = panel._kids[panel._kids.length - 1];
  var ta = io._kids[0], imBtn = io._kids[2], ioStatus = io._kids[3];
  // 合法 base64 字母表(b64decode 正常解出)、解出后非合法 JSON → load() 的 JSON.parse 抛、被 catch 后返回 false
  // (对应生产场景:玩家粘贴了半截/被截断的存档码)。字符集合法,不触碰 atob 本身的解码异常分支(那是另一类问题、
  // 不在本轮 C3 范围——本轮只消费 loadFrom/importSave 已有的 boolean:false 信号)。
  ta.value = Buffer.from('this is not a valid save envelope', 'utf8').toString('base64');
  ok('A26-pre 导入前 ioStatus 空(骨架无残留文案)', !ioStatus.textContent);
  imBtn.onclick();
  ok('A26 导入码解码后非合法存档 → ioStatus 出现提示(此前完全不消费 importSave 返回值,点了没反应)', /存档码无效|已损坏/.test(ioStatus.textContent) && panel.hidden === false);
  // 导入码成功回归:面板收起(零回归)
  ta.value = validCode;
  imBtn.onclick();
  ok('A27 导入码成功 → 面板收起(零回归,C3 未破坏成功路径)', panel.hidden === true);
})();

// A28-A29. 手写装配也从核心 api.saveKey 继承 namespace；显式插件 key 仍优先。
(function () {
  var store = memStorage();
  var e = createEngine(makeWorld(), { storage: null }); e.registerModule(makeStub());
  e.use(createSavePlugin({ storage: store }));
  e.use(createAchievementPlugin({ storage: store, achievements: [{ id: 'inherit-ach', title: '继承键', when: function () { return true; } }] }));
  e.start();
  ok('A28 手写 save plugin 未给 key → 自动写 engine.saveKey:auto', store.getItem(e.saveKey + ':auto') != null);
  ok('A29 手写 achievement 未给 storageKey → 自动写 engine.saveKey:ach', /inherit-ach/.test(store.getItem(e.saveKey + ':ach') || ''));

  var store2 = memStorage();
  var e2 = createEngine(makeWorld(), { storage: null }); e2.registerModule(makeStub());
  e2.use(createSavePlugin({ storage: store2, saveKey: 'plugin-override' }));
  e2.use(createAchievementPlugin({ storage: store2, storageKey: 'achievement-override', achievements: [{ id: 'override-ach', when: function () { return true; } }] }));
  e2.start();
  ok('A30 插件显式 key 仍优先于 engine.saveKey', store2.getItem('plugin-override:auto') != null && /override-ach/.test(store2.getItem('achievement-override') || ''));
})();

// B. 小地图:纯函数 buildMinimapSVG
(function () {
  var w = makeWorld();
  var svg = buildMinimapSVG(w, { map: 'a', node: 'home' });
  ok('B1 产出 <svg>', svg.indexOf('<svg') === 0);
  ok('B2 两个节点 → 两个 circle', count(svg, '<circle') === 2);
  ok('B3 当前节点 home 高亮(data-current)', svg.indexOf('data-node="home"') >= 0 && svg.indexOf('data-current="1"') >= 0);
  ok('B4 同图连接 → 连线(home↔garden,2 条)', count(svg, '<line') === 2);
  ok('B5 无位置 / 空世界 → 空串(退化)', buildMinimapSVG(w, undefined) === '' && buildMinimapSVG(null, { map: 'a', node: 'home' }) === '');
})();

// B20. spatial 防重叠(showcase Sonnet/Opus 实测:作者把多节点坐标设得很接近〔主线 x 都=50〕→ circle 挤成一团;力导向松弛推开、保相对布局)
(function () {
  var nodes = {};
  ['n0', 'n1', 'n2', 'n3', 'n4'].forEach(function (id, i) { nodes[id] = { kind: 'scene', name: id, map: { x: 50, y: 50 + (i - 2) * 0.4 }, links: [] }; });  // 5 节点全挤在 x=50、y∈[49.2,50.8]
  var w2 = { start: { map: 'm', node: 'n0' }, maps: { m: { name: 'M', nodes: nodes } } };
  var svg2 = buildMinimapSVG(w2, { map: 'm', node: 'n0' }, { fog: 'off' });   // fog off → 全显
  var re = /<circle cx="([0-9.]+)" cy="([0-9.]+)"/g, mm, pts = [];
  while ((mm = re.exec(svg2))) pts.push({ x: +mm[1], y: +mm[2] });
  var minD = Infinity;
  for (var i = 0; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++) { var dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = Math.sqrt(dx * dx + dy * dy); if (d < minD) minD = d; }
  ok('B20 spatial 防重叠:5 个挤一起的节点经力导向松弛后两两不重叠(最小间距 ≥ 2*nodeR=16)', pts.length === 5 && minD >= 16);
})();

// B'. 小地图插件(S11-c 默认 toggle):🗺️ 按钮进 #plugin-bar + 点开面板画地图、移动后(面板开)高亮跟随
(function () {
  var bar = mockEl(); var doc = mockDoc({ '#plugin-bar': bar });
  var mini = createMinimapPlugin({ document: doc });        // 默认 toggle
  var e = eng(function (x) { x.use(mini); }); e.start();
  ok('B6 toggle:🗺️ 按钮进工具栏 + 隐藏面板(2 子元素)', bar._kids.length === 2 && /🗺️/.test(bar._kids[0].textContent) && bar._kids[1].hidden === true);
  var btn = bar._kids[0], panel = bar._kids[1];
  btn.onclick();                                            // 点开 → 画地图
  var mapBox = panel._kids[1];                              // 面板 = [✕ closeEl, mapBox 地图容器](svg 刷新只动 mapBox、不冲掉 ✕)
  ok('B7 点开面板 → ✕ 关闭按钮 + 地图容器画 svg 高亮 home', panel.hidden === false && /✕/.test(panel._kids[0].textContent) && mapBox.innerHTML.indexOf('<svg') >= 0 && /data-node="home"[^>]*data-current="1"/.test(mapBox.innerHTML));
  moveTo(e, 'garden');                                      // enter 触发 paint、面板开 → 刷新 mapBox
  ok('B7b 移动后(面板开)高亮跟随 garden', /data-node="garden"[^>]*data-current="1"/.test(mapBox.innerHTML));
  ok('B7c ✕ 点击关闭面板(此前 minimap 漏关闭按钮、本轮补)', (function () { panel._kids[0].onclick(); return panel.hidden === true; })());
})();

// B'i. mode:'inline' → 常驻 #plugin-minimap(向后兼容回归);默认 toggle 但无 #plugin-bar → 退化常驻
(function () {
  var box = mockEl(); var doc = mockDoc({ '#plugin-minimap': box });
  var mini = createMinimapPlugin({ document: doc, mode: 'inline' });
  var e = eng(function (x) { x.use(mini); }); e.start();
  ok('B6i inline:常驻插槽画 svg 高亮 home', box.innerHTML.indexOf('<svg') >= 0 && /data-node="home"[^>]*data-current="1"/.test(box.innerHTML));
  moveTo(e, 'garden');
  ok('B7i inline 移动后高亮跟随 garden', /data-node="garden"[^>]*data-current="1"/.test(box.innerHTML));
  var box2 = mockEl(); var doc2 = mockDoc({ '#plugin-minimap': box2 });   // 默认 toggle 但无 #plugin-bar
  eng(function (x) { x.use(createMinimapPlugin({ document: doc2 })); }).start();
  ok('B6f toggle 无工具栏 → 退化常驻 #plugin-minimap', box2.innerHTML.indexOf('<svg') >= 0);
})();

// B''. S11-c 玩家视图(layout:'spatial')+ 语义钩子:node.map 坐标 / data-seen 探索雾 / data-locked 锁定连线 / 缺坐标回退 ring
(function () {
  var w = { start: { map: 'a', node: 'home' }, maps: { a: { name: 'A', nodes: {
    home:   { kind: 'demo', title: '家',   map: { x: 20, y: 80 }, exits: [ { to: 'garden', label: '去花园' } ] },
    garden: { kind: 'demo', title: '花园', map: { x: 80, y: 20 }, links: [ { to: 'secret', label: '密室', requires: function () { return false; } } ] },
    secret: { kind: 'demo', title: '密室', map: { x: 80, y: 80 } }
  } } } };
  var pos = { map: 'a', node: 'home' };
  var svgSpatial = buildMinimapSVG(w, pos, { layout: 'spatial' });
  var svgRing = buildMinimapSVG(w, pos, { layout: 'ring' });
  ok('B8 spatial ≠ ring(node.map 坐标生效)', svgSpatial !== svgRing && svgSpatial.indexOf('<svg') === 0);
  ok('B9 spatial 用 node.map 归一坐标(home{20,80}→cx 31.2/cy 88.8)', svgSpatial.indexOf('cx="31.2"') >= 0 && svgSpatial.indexOf('cy="88.8"') >= 0);
  ok('B10 连线带 requires → data-locked', svgSpatial.indexOf('data-locked="1"') >= 0);
  var svgSeen = buildMinimapSVG(w, pos, { layout: 'spatial', state: { seen: { 'a/home': 1, 'a/garden': 1 } } });
  ok('B11 data-seen 探索雾(home/garden 已探索=2、secret 未)', count(svgSeen, 'data-seen="1"') === 2);
  // 缺坐标 → 静默回退 ring(不 fail-loud:装饰性增强、非门控)
  var wPartial = { start: { map: 'a', node: 'home' }, maps: { a: { nodes: {
    home: { kind: 'demo', exits: [ { to: 'x' } ] }, x: { kind: 'demo' }   // 无 node.map
  } } } };
  ok('B12 spatial 缺坐标 → 回退 ring(等同 ring、不崩)', buildMinimapSVG(wPartial, pos, { layout: 'spatial' }) === buildMinimapSVG(wPartial, pos, { layout: 'ring' }));
  ok('B13 向后兼容:2 参数 == 显式 layout:ring(B1-5 路径不变)', buildMinimapSVG(w, pos) === svgRing);
})();

// B'''. 地图打磨:实时锁定(镜像引擎门控 requires/available)+ fog:'hide' 玩家视图(不画未探索)+ hover 标签
(function () {
  var hasKey = function (S) { return !!(S.flags && S.flags.key); };
  var w = { start: { map: 'a', node: 'home' }, maps: { a: { nodes: {
    home:  { kind: 'demo', title: '家',   map: { x: 20, y: 80 }, links: [ { to: 'gate', label: '门', requires: hasKey } ] },
    gate:  { kind: 'demo', title: '闸',   map: { x: 80, y: 20 }, exits: [ { to: 'vault', label: '入库', available: hasKey } ] },   // exit 用 available
    vault: { kind: 'demo', title: '金库', map: { x: 80, y: 80 } }
  } } } };
  var pos = { map: 'a', node: 'home' };
  // 实时锁:requires(link)与 available(exit)都认 —— 无 key → 两条都锁
  var lockedSvg = buildMinimapSVG(w, pos, { layout: 'spatial', state: { flags: {}, seen: {} } });
  ok('B14 实时锁:requires + available 当前为假 → data-locked(2 条)', count(lockedSvg, 'data-locked="1"') === 2);
  var openSvg = buildMinimapSVG(w, pos, { layout: 'spatial', state: { flags: { key: true }, seen: {} } });
  ok('B15 实时解锁:门控为真 → 无 data-locked', openSvg.indexOf('data-locked') < 0);
  // fog:'hide' → 只画已探索(+当前)节点及其连线
  var fog1 = buildMinimapSVG(w, pos, { layout: 'spatial', fog: 'hide', state: { flags: {}, seen: { 'a/home': 1 } } });
  ok('B16 fog:hide 只画已探索+当前(home=1 circle、0 line)', count(fog1, '<circle') === 1 && count(fog1, '<line') === 0 && fog1.indexOf('data-node="home"') >= 0);
  var fog2 = buildMinimapSVG(w, pos, { layout: 'spatial', fog: 'hide', state: { flags: {}, seen: { 'a/home': 1, 'a/gate': 1 } } });
  ok('B17 fog:hide 探索增显(home+gate=2 circle、1 line)', count(fog2, '<circle') === 2 && count(fog2, '<line') === 1);
  // hover 标签:读 node.title、当前节点常显(class current)
  ok('B18 节点标签:读 node.title + 当前常显(.current)', lockedSvg.indexOf('class="amatlas-node-label current"') >= 0 && lockedSvg.indexOf('>家</text>') >= 0);
  // fog:'frontier' → 已探索 + 一度出口邻居(淡显),二度+ 不画(home 探索 → 显 home+gate,藏 2 度 vault)
  var frontier = buildMinimapSVG(w, pos, { layout: 'spatial', fog: 'frontier', state: { flags: {}, seen: { 'a/home': 1 } } });
  ok('B19 fog:frontier 显已探索+一度邻居、藏二度', count(frontier, '<circle') === 2 && frontier.indexOf('data-node="gate"') >= 0 && frontier.indexOf('data-node="vault"') < 0 && count(frontier, 'data-seen="1"') === 1);
  // glyph:'box' → 节点出 <rect>(方块房间)、data 钩子在 rect 上;缺省仍 <circle>(零回归)
  var boxSvg = buildMinimapSVG(w, pos, { layout: 'spatial', glyph: 'box' });
  ok('B20 glyph:box 节点出 rect(无 circle)+ 钩子在 rect', count(boxSvg, '<rect') === 3 && boxSvg.indexOf('<circle') < 0 && /<rect[^>]*data-node="home"[^>]*data-current="1"/.test(boxSvg));
  ok('B20b 缺省 glyph 仍 circle、无 rect(零回归)', (function () { var d = buildMinimapSVG(w, pos, { layout: 'spatial' }); return d.indexOf('<circle') >= 0 && d.indexOf('<rect') < 0; })());
  // box 连线=正交肘形:每连接 3 段(横→竖→横),含竖直段(x1==x2)。本世界 2 连接 → 6 段
  ok('B21 box 正交肘形走廊(2 连接×3 段=6 line、含竖直段)', count(boxSvg, '<line') === 6 && /x1="([\d.]+)" y1="[\d.]+" x2="\1"/.test(boxSvg));
})();

// B''''. box 方向驱动网格布局:dir 显式摆位 + node.map 推断 + 无重叠
(function () {
  function rectPos(svg, id) { var m = svg.match(new RegExp('<rect[^>]*data-node="' + id + '"[^>]*>')); if (!m) return null; var x = m[0].match(/x="([\d.]+)"/), y = m[0].match(/y="([\d.]+)"/); return (x && y) ? { x: +x[1], y: +y[1] } : null; }
  // 显式 dir:a→b 东、a→c 南(根=world.start.node=a 在 (0,0))
  var wDir = { start: { map: 'm', node: 'a' }, maps: { m: { nodes: {
    a: { title: 'A', links: [ { to: 'b', dir: 'e' }, { to: 'c', dir: 's' } ] }, b: { title: 'B' }, c: { title: 'C' }
  } } } };
  var sd = buildMinimapSVG(wDir, { map: 'm', node: 'a' }, { glyph: 'box' });
  var a = rectPos(sd, 'a'), b = rectPos(sd, 'b'), cc = rectPos(sd, 'c');
  ok('B22 box 网格 dir:e → 房间在东(同行右侧)', !!(b && a) && b.x > a.x && Math.abs(b.y - a.y) < 0.5);
  ok('B23 box 网格 dir:s → 房间在南(同列下方)', !!(cc && a) && cc.y > a.y && Math.abs(cc.x - a.x) < 0.5);
  ok('B24 box 网格无重叠(3 房间互异坐标)', new Set([a, b, cc].map(function (p) { return p.x + ',' + p.y; })).size === 3);
  // 无 dir → 由 node.map 的 atan2 推断方向(E 在 D 正东)
  var wInf = { start: { map: 'm', node: 'd' }, maps: { m: { nodes: {
    d: { title: 'D', map: { x: 30, y: 50 }, links: [ { to: 'e2' } ] }, e2: { title: 'E', map: { x: 80, y: 50 } }
  } } } };
  var si = buildMinimapSVG(wInf, { map: 'm', node: 'd' }, { glyph: 'box' });
  var d = rectPos(si, 'd'), e2 = rectPos(si, 'e2');
  ok('B25 box 网格 dir 缺省 → node.map 推断(E 在 D 东)', !!(e2 && d) && e2.x > d.x && Math.abs(e2.y - d.y) < 0.5);
})();

// C. 成就:事件触发 → 写 state._achievement(namespace)→ 随档往返
(function () {
  var ach = createAchievementPlugin({ achievements: [
    { id: 'explorer', title: '探索者', on: 'enter',  when: function (s) { return Object.keys(s.seen || {}).length >= 2; } },
    { id: 'waver',    title: '挥手者', on: 'action', when: function (s, ev) { return ev && ev.action && ev.action.id === 'wave'; } }
  ] });
  var e = eng(function (x) { x.use(ach); }); e.start();   // 在 home,seen=1
  ok('C1 起点未解锁 explorer(仅 1 处 seen)', !e.state._achievement || !e.state._achievement.explorer);
  moveTo(e, 'garden');                                     // seen 增到 2
  ok('C2 到第二处 → explorer 解锁(写入 _achievement)', e.state._achievement.explorer === 1);
  e.apply(actionById(e, 'wave'));
  ok('C3 wave 动作 → waver 解锁', e.state._achievement.waver === 1);
  ok('C4 unlocked() 反映两项', ach.unlocked().sort().join(',') === 'explorer,waver');
  var snap = e.serialize();
  moveTo(e, 'home');                                       // 改变状态
  ok('C5 load 还原:_achievement 随档回来', e.load(snap) === true && e.state._achievement.explorer === 1 && e.state._achievement.waver === 1);
})();

// C5b 原型名也是合法 id；JSON load 恢复成普通对象后不能被继承属性冒充“已解锁”。
(function () {
  var ach = createAchievementPlugin({ achievements: [
    { id: 'constructor', title: '构造者', on: 'action', when: function () { return true; } }
  ] });
  var e = eng(function (x) { x.use(ach); }); e.start();
  var snap = e.serialize();
  e.load(snap);
  e.apply(actionById(e, 'wave'));
  ok('C5b constructor/toString 等原型名成就在 load 后仍可正常解锁', e.state._achievement && e.state._achievement.constructor === 1);
})();

// C'. round13:成就跨 reset 持久(showcase 实测「重新开始→成就清空」)。注入 mock storage → 自带账本写盘;reset 清 state 后 hydrate 恢复
(function () {
  var store = memStorage();
  var ach = createAchievementPlugin({ storage: store, achievements: [
    { id: 'explorer', title: '探索者', on: 'enter', when: function (s) { return Object.keys(s.seen || {}).length >= 2; } }
  ] });
  var e = eng(function (x) { x.use(ach); }); e.start();   // home, seen=1
  moveTo(e, 'garden');                                     // seen→2 → explorer 解锁
  ok('C6 解锁即写持久账本(localStorage)', e.state._achievement.explorer === 1 && /explorer/.test(store.getItem('amatlas:game:55555555-5555-4555-8555-555555555555:ach') || ''));
  e.reset();                                               // 核心 reset:freshState 清 state(含 _achievement)+ 回起点
  ok('C7 reset 后成就幸存(hydrate 从账本恢复,虽回起点 seen=1、when 为假——证明来自账本非重解锁)', e.state._achievement && e.state._achievement.explorer === 1);
  ok("C8 reset 只清核心 SAVE_KEY、不动 'amatlas:game:55555555-5555-4555-8555-555555555555:ach' 账本", /explorer/.test(store.getItem('amatlas:game:55555555-5555-4555-8555-555555555555:ach') || ''));
  // 跨会话/跨周目:全新引擎+插件共享同一 store → install 时 hydrate 历史解锁(按钮 boot 即含进度)
  var ach2 = createAchievementPlugin({ storage: store, achievements: [ { id: 'explorer', title: '探索者', on: 'enter', when: function () { return false; } } ] });
  var e2 = eng(function (x) { x.use(ach2); }); e2.start();
  ok('C9 新会话共享账本 → boot 即 hydrate 历史解锁(跨周目元进度)', ach2.unlocked().indexOf('explorer') >= 0 && e2.state._achievement.explorer === 1);
  // 无 storage(默认 node 下 localStorage undefined → null)→ 优雅降级回旧"仅随档":reset 后清空(不意外持久)
  //   when 用 seen>=2(非恒真)→ reset 回起点 seen=1 时 when 为假、不会被重新解锁,才能干净证明"无账本=不持久"
  var ach3 = createAchievementPlugin({ achievements: [ { id: 'x', on: 'enter', when: function (s) { return Object.keys(s.seen || {}).length >= 2; } } ] });
  var e3 = eng(function (x) { x.use(ach3); }); e3.start();
  moveTo(e3, 'garden');                                    // seen→2 → x 解锁
  var hadX = e3.state._achievement && e3.state._achievement.x === 1;
  e3.reset();                                              // 回起点 seen=1、when 假、无 storage → x 不再
  ok('C10 无 storage → 优雅降级(reset 后清空=旧行为,零回归)', hadX && (!e3.state._achievement || !e3.state._achievement.x));
})();

// D. 集成:数组形 use([..]) 一次挂三;互不干扰;namespace 无碰撞;不挂零影响
(function () {
  var bar = mockEl(), box = mockEl(), overlay = mockEl();
  var doc = mockDoc({ '#plugin-bar': bar, '#plugin-minimap': box, '#plugin-overlay': overlay });
  var save = createSavePlugin({ document: doc });
  var mini = createMinimapPlugin({ document: doc });
  var ach = createAchievementPlugin({ document: doc, achievements: [ { id: 'explorer', on: 'enter', when: function (s) { return Object.keys(s.seen || {}).length >= 2; } } ] });
  var e = eng(function (x) { x.use([ save, mini, ach ]); }); e.start();   // 数组形(借 -a 的插件组)
  moveTo(e, 'garden');
  ok('D1 数组 use 一次挂三:save 可导出 + minimap🗺️ 进工具栏(默认 toggle)+ achievement 解锁', save.exportSave().length > 0 && bar._kids.some(function (k) { return /🗺️/.test(k.textContent); }) && e.state._achievement.explorer === 1);
  ok('D2 namespace 无碰撞:仅成就写 _achievement,save/minimap 不写 state', !('_save' in e.state) && !('_minimap' in e.state) && ('_achievement' in e.state));
  ok('D3 核心状态键完好(pos/seen/flags/_once/clock/rngSeed 未被插件破坏)', e.state.pos.node === 'garden' && e.state.seen['a/home'] === 1 && !!e.state.clock && typeof e.state.rngSeed === 'number');
  // 不挂插件:核心状态形状不含 _achievement(零影响)
  var bare = eng(); bare.start(); moveTo(bare, 'garden');
  ok('D4 不挂插件 → 无 _achievement(零影响、零残留)', !('_achievement' in bare.state) && !('_save' in bare.state) && !('_minimap' in bare.state));
})();

// E. fail-loud(design-principles §6b):achievement.when 写成非函数 → 解锁检查(enter/action)时抛,不再静默"永不解锁"
(function () {
  function throws(fn) { try { fn(); return false; } catch (e) { return true; } }
  var bad = createAchievementPlugin({ achievements: [ { id: 'x', title: 'X', when: 'S.flags.win' } ] });   // 字符串非函数
  ok('E1 when 写成字符串 → enter 检查时抛(成就不再静默永不解锁)', throws(function () { eng(function (x) { x.use(bad); }).start(); }));
  var good = createAchievementPlugin({ achievements: [ { id: 'y', when: function () { return false; } } ] });
  ok('E2 合法函数 when 不抛(回归)', !throws(function () { eng(function (x) { x.use(good); }).start(); }));
  // round7 #1:弱模型用 check/condition 等别名(无 when 函数)→ 成就永不解锁(静默失效)。use 时早抛。
  var aliased = createAchievementPlugin({ achievements: [ { id: 'z', name: '别名', check: function () { return true; } } ] });
  ok('E3 用 check 别名(无 when)→ use 时抛(round7 #1:不再静默永不解锁)', throws(function () { eng(function (x) { x.use(aliased); }).start(); }));
  // round9 audit:on 是闭集枚举 'enter'/'action'。写错值 → check() 里恒不匹配 → 该成就永不被检查、静默永不解锁。
  var badOn = createAchievementPlugin({ achievements: [ { id: 'w', title: 'W', on: 'visited', when: function () { return true; } } ] });
  ok('E4 on 写错值(visited)→ use 时抛(成就不再静默永不检查)', throws(function () { eng(function (x) { x.use(badOn); }).start(); }));
  var okOn = createAchievementPlugin({ achievements: [ { id: 'v', title: 'V', on: 'enter', when: function () { return false; } } ] });
  ok('E5 合法 on:"enter" 不抛(回归)', !throws(function () { eng(function (x) { x.use(okOn); }).start(); }));
  ok('E6 成就 id 必填非空且同清单唯一', throws(function () {
    eng(function (x) { x.use(createAchievementPlugin({ achievements: [{ when: function () { return true; } }] })); });
  }) && throws(function () {
    eng(function (x) { x.use(createAchievementPlugin({ achievements: [{ id: 'dup', when: function () { return true; } }, { id: 'dup', when: function () { return false; } }] })); });
  }));
  var protoAch = createAchievementPlugin({ achievements: [{ id: 'constructor', when: function () { return true; } }] });
  var protoEngine = eng(function (x) { x.use(protoAch); }); protoEngine.start();
  ok('E7 prototype 名称可作普通成就 id 并真实解锁', protoAch.unlocked().indexOf('constructor') >= 0);
})();

// F. round7 统一工具栏:成就常驻按钮(🏆 成就 N/M)+ toggle 列表面板(全部成就 ✓/🔒)
(function () {
  var bar = mockEl(); var doc = mockDoc({ '#plugin-bar': bar, '#plugin-overlay': mockEl() });
  var ach = createAchievementPlugin({ document: doc, achievements: [
    { id: 'a1', title: '甲', description: '做到甲', on: 'enter',  when: function (s) { return Object.keys(s.seen || {}).length >= 2; } },
    { id: 'a2', title: '乙', on: 'action', when: function (s, ev) { return ev && ev.action && ev.action.id === 'wave'; } }
  ] });
  var e = eng(function (x) { x.use(ach); }); e.start();
  var btn = bar._kids[0], panel = bar._kids[1];
  ok('F1 工具栏渲染「🏆 成就 N/M」按钮 + 隐藏面板', bar._kids.length === 2 && /🏆 成就 0\/2/.test(btn.textContent) && panel.hidden === true);
  btn.onclick();
  ok('F2 点按钮 → 面板展开、列出全部成就(标题 + 🔒 未解锁)', panel.hidden === false && panel.innerHTML.indexOf('甲') >= 0 && panel.innerHTML.indexOf('乙') >= 0 && panel.innerHTML.indexOf('🔒') >= 0);
  ok('F3 description 列出', panel.innerHTML.indexOf('做到甲') >= 0);
  moveTo(e, 'garden');
  ok('F4 解锁后按钮计数更新(1/2)', /🏆 成就 1\/2/.test(btn.textContent));
  btn.onclick(); btn.onclick();                          // 关→开,重渲染
  ok('F5 已解锁项显 ✓(got)', panel.innerHTML.indexOf('✓') >= 0 && panel.innerHTML.indexOf('got') >= 0);
  ok('F6 无插槽 → 跳过按钮、toast/记账仍工作(向后兼容)', (function () {
    var d2 = mockDoc({ '#plugin-overlay': mockEl() });   // 无 #plugin-bar
    var a2 = createAchievementPlugin({ document: d2, achievements: [ { id: 'x', when: function () { return true; } } ] });
    var e2 = eng(function (x) { x.use(a2); }); e2.start();
    return e2.state._achievement && e2.state._achievement.x === 1;   // 记账生效、未因无按钮插槽而崩
  })());
})();

// F'. 隐藏成就(hidden):未解锁显 ❓ ???(不泄露真名/描述);解锁即揭示
(function () {
  var bar = mockEl(); var doc = mockDoc({ '#plugin-bar': bar, '#plugin-overlay': mockEl() });
  var ach = createAchievementPlugin({ document: doc, achievements: [
    { id: 'open', title: '公开成就', on: 'enter', when: function () { return true; } },
    { id: 'sec', title: '秘密结局', description: '隐藏剧情', hidden: true, on: 'enter', when: function (s) { return s.pos && s.pos.node === 'garden'; } }
  ] });
  var e = eng(function (x) { x.use(ach); }); e.start();    // open 立解锁;sec 未(在 home)
  var btn = bar._kids[0], panel = bar._kids[1];
  btn.onclick();
  ok('F7 隐藏成就未解锁 → ❓ ???(不泄露真名/描述)', panel.innerHTML.indexOf('???') >= 0 && panel.innerHTML.indexOf('❓') >= 0 && panel.innerHTML.indexOf('秘密结局') < 0 && panel.innerHTML.indexOf('隐藏剧情') < 0);
  moveTo(e, 'garden');                                     // 解锁 sec
  btn.onclick(); btn.onclick();                            // 关→开,重渲染
  ok('F8 解锁后揭示真名 + 描述', panel.innerHTML.indexOf('秘密结局') >= 0 && panel.innerHTML.indexOf('隐藏剧情') >= 0);
  var xb = panel._kids[panel._kids.length - 1];           // renderList 后复挂的 ✕
  ok('F9 成就浮窗含 ✕、点击关闭', /✕/.test(xb.textContent) && (function () { panel.hidden = false; xb.onclick(); return panel.hidden === true; })());
})();

// B26-28. round10 地图:密度自适应半径(>28 节点圆缩小;≤28 零回归)+ 读档后 inline 地图跟随
(function () {
  function denseWorld(n) {
    var nodes = {};
    for (var i = 0; i < n; i++) { nodes['n' + i] = { kind: 'demo', title: 'N' + i, map: { x: (i % 7) * 16, y: ((i / 7) | 0) * 16 } }; }
    return { start: { map: 'm', node: 'n0' }, maps: { m: { name: 'M', nodes: nodes } } };
  }
  var s39 = buildMinimapSVG(denseWorld(39), { map: 'm', node: 'n0' }, { layout: 'spatial', fog: 'off' });
  ok('B26 39 节点 → 密度自适应 r=4(round11 gap 6:39 实测 r6 仍贴边 → 更小圆+真留白)', count(s39, 'r="4"') === 39 && s39.indexOf('r="8"') < 0);
  var s9 = buildMinimapSVG(denseWorld(9), { map: 'm', node: 'n0' }, { layout: 'spatial', fog: 'off' });
  ok('B27 ≤28 节点 → r=8 不变(demo/小图零回归,gap 仍 2)', count(s9, 'r="8"') === 9);
  var s51 = buildMinimapSVG(denseWorld(51), { map: 'm', node: 'n0' }, { layout: 'spatial', fog: 'off' });
  ok('B29 51 节点(《奥术之始》实况)→ r=3 呼吸留白、无 r8 残留', count(s51, 'r="3"') === 51 && s51.indexOf('r="8"') < 0);
  // B30-31 标签置顶层(端用户实测:标签在各节点 <g> 内 → 后画节点的圆盖住先画标签;现拆双层=所有形状之后统一画标签)
  (function () {
    var box2 = mockEl(); var doc2 = mockDoc({ '#plugin-minimap': box2 });
    var m2 = createMinimapPlugin({ document: doc2, mode: 'inline', layout: 'ring', fog: 'off' });
    var e2 = eng(function (x) { x.use(m2); }); e2.start();
    var s = box2.innerHTML;
    ok('B30 标签层在所有可见形状之后(最后一个 circle 在第一个 .amatlas-node 组之前 → 标签永不被节点圆遮挡)', s.lastIndexOf('<circle') < s.indexOf('<g class="amatlas-node">') && s.indexOf('<g class="amatlas-node">') >= 0, s.slice(0, 200));
    ok('B31 命中区是 path(fill=transparent 接 hover;circle/rect 计数=可见节点数不变)+ 字号收敛 font-size=5', /<g class="amatlas-node"><path [^>]*fill="transparent"/.test(s) && s.indexOf('font-size="5"') >= 0 && s.indexOf('font-size="6"') < 0);
  })();
  // 读档跟随:load 只 hydrate+render、不发 enter → 旧版(仅订 enter)读档后 inline 地图停在旧位置
  var box = mockEl(); var doc = mockDoc({ '#plugin-minimap': box });
  var mini = createMinimapPlugin({ document: doc, mode: 'inline', layout: 'ring', fog: 'off' });
  var e = eng(function (x) { x.use(mini); }); e.start();
  var snap = e.serialize();                                // 在 home 的存档
  moveTo(e, 'garden');
  ok('B28a 移动后 inline 高亮 garden(render 订阅回归)', /data-node="garden"[^>]*data-current="1"/.test(box.innerHTML));
  ok('B28 load 读档 → inline 地图跟随回 home(旧版停在 garden)', e.load(snap) === true && /data-node="home"[^>]*data-current="1"/.test(box.innerHTML));
})();

// G. round10 成就按钮计数:load/loadLocal/reset 不发 enter → 旧版只在解锁时刷新、按钮陈旧(用户实测刷新页面后停 0/N)
(function () {
  var seen2 = function (s) { return Object.keys(s.seen || {}).length >= 2; };
  var bar = mockEl(); var doc = mockDoc({ '#plugin-bar': bar, '#plugin-overlay': mockEl() });
  var ach = createAchievementPlugin({ document: doc, achievements: [ { id: 'explorer', title: '探索者', on: 'enter', when: seen2 } ] });
  var e = eng(function (x) { x.use(ach); }); e.start();
  var btn = bar._kids[0], panel = bar._kids[1];
  var snap0 = e.serialize();                               // 0/1 时刻的存档
  moveTo(e, 'garden');                                     // 解锁 → 1/1
  ok('G1 解锁后按钮 1/1(回归)', /1\/1/.test(btn.textContent));
  ok('G2 load 回 0/1 存档 → 按钮跟随(load 不发 enter,旧版停在 1/1)', e.load(snap0) === true && /🏆 成就 0\/1/.test(btn.textContent));
  moveTo(e, 'garden');                                     // 再解锁 → 1/1
  e.reset();                                               // reset → freshState + enter(explorer 不满足)
  ok('G3 reset 后按钮回 0/1(旧版停在 1/1)', /🏆 成就 0\/1/.test(btn.textContent));
  moveTo(e, 'garden');
  e.state._achievement.zombie = 1;                         // 旧版本存档残留的已删成就 id
  btn.onclick();                                           // 开面板(现算)
  ok('G4 计数只数清单内 id(残留 zombie 不数出 2/1;按钮/面板头一致 1/1)', /🏆 成就 1\/1/.test(btn.textContent) && panel.innerHTML.indexOf('成就 1/1') >= 0);
  // 用户场景全链:autosave 自动续档(start→loadLocal,不发 enter)→ 新会话开局按钮即显真值
  var store = memStorage();
  function mkE(achPlugin) { var x = createEngine(makeWorld(), { storage: store }); x.registerModule(makeStub()); x.use(achPlugin); return x; }
  var bar1 = mockEl();
  var e1 = mkE(createAchievementPlugin({ document: mockDoc({ '#plugin-bar': bar1, '#plugin-overlay': mockEl() }), achievements: [ { id: 'explorer', on: 'enter', when: seen2 } ] }));
  e1.start(); moveTo(e1, 'garden');                        // 解锁;enter 自动 saveLocal 进 store
  var bar2 = mockEl();
  var e2 = mkE(createAchievementPlugin({ document: mockDoc({ '#plugin-bar': bar2, '#plugin-overlay': mockEl() }), achievements: [ { id: 'explorer', on: 'enter', when: seen2 } ] }));
  e2.start();                                              // start → loadLocal 续档(不发 enter)
  ok('G5 自动续档开局按钮即显 1/1(刷新页面后数字不再停 0/N)', e2.state._achievement && e2.state._achievement.explorer === 1 && /🏆 成就 1\/1/.test(bar2._kids[0].textContent));
})();

// G6 Achievement presenter 只能同步 UI，不能在同一 snapshot 广播中 hydrate/改 state。
(function () {
  var store = memStorage();
  var beforeSaw = null, afterSaw = null;
  var e = eng(function (x) {
    x.addPresenter(function () { beforeSaw = !!(x.state._achievement && x.state._achievement.external); });
    x.use(createAchievementPlugin({ storage: store, achievements: [
      { id: 'external', title: '外部历史', on: 'enter', when: function () { return false; } }
    ] }));
    x.addPresenter(function () { afterSaw = !!(x.state._achievement && x.state._achievement.external); });
  });
  e.start();
  var snap = e.serialize();
  store.setItem('amatlas:game:55555555-5555-4555-8555-555555555555:ach', JSON.stringify({ external: 1 }));
  beforeSaw = null; afterSaw = null;
  var loaded = e.load(snap); // load 只 render，不发 enter；旧 Achievement presenter 会在两呈现器之间 hydrate state
  ok('G6 同一 snapshot 前后 presenter 看到相同 state，Achievement presenter 不在广播中途 hydrate', loaded === true && beforeSaw === false && afterSaw === false && !(e.state._achievement && e.state._achievement.external));
})();

// I. 物品栏插件(inventory):只读渲染 state.inventory + world.items 显示字典;按钮计数随 state 变化刷新;DOM-free 退化;fail-loud 非数组。
(function () {
  function invWorld(invInit) {
    return { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', start: { map: 'a', node: 'home' }, seed: 1,
      initState: { inventory: invInit !== undefined ? invInit : ['gem'] },
      items: { gem: { label: '血红宝石', icon: '💎', description: '温热,像还在跳' }, scroll: { label: '残破卷轴' },   // scroll 有 label 无 icon;photo 故意无条目→测裸 ID 退化
        torch: { label: '火把', icon: [ { shape: 'circle', cx: 0, cy: 0, r: 9, fill: '#ffcc44', stroke: '#cc7711', sw: 1 } ] } },   // art-spec 矢量图标(I9/I10)

      maps: { a: { name: 'A', nodes: {
        home: { kind: 'demo', title: '家', exits: [ { to: 'garden', label: '去花园' } ] },
        garden: { kind: 'demo', title: '花园', exits: [ { to: 'home', label: '回家' } ] }
      } } } };
  }
  function invStub() { return { id: 'stub', nodeKinds: ['demo'],
    render: function (s, n) { return { title: n.title, body: [ { type: 'text', text: 'x' } ] }; },
    actions: function () { return [
      { id: 'grab', label: '捡卷轴', run: function (s) { (s.inventory || (s.inventory = [])).push('scroll'); } },
      { id: 'grabPhoto', label: '捡照片', run: function (s) { s.inventory.push('photo'); } }
    ]; } }; }
  function invEng(world, extra) { var e = createEngine(world, { storage: null }); e.registerModule(invStub()); if (extra) extra(e); return e; }

  // I1/I2:UI 挂载 + 计数读 initState + 面板用 world.items 显示名/图标
  var bar = mockEl(), doc = mockDoc({ '#plugin-bar': bar });
  var inv = createInventoryPlugin({ document: doc });
  var e = invEng(invWorld(), function (x) { x.use(inv); }); e.start();
  ok('I1 物品栏 UI 挂 #plugin-bar(🎒 按钮 + 隐藏面板)+ 计数读 initState(1 件)', bar._kids.length === 2 && /🎒/.test(bar._kids[0].textContent) && /物品 1/.test(bar._kids[0].textContent) && bar._kids[1].hidden === true);
  var btn = bar._kids[0], panel = bar._kids[1];
  btn.onclick();
  ok('I2 点 🎒 → 面板展开 + 用 world.items 显示名/图标(变异=删 meta() 查 world.items→显裸 id、"血红宝石"缺→红)', panel.hidden === false && /血红宝石/.test(panel.innerHTML) && /💎/.test(panel.innerHTML));

  // I3:拾取(action.run push state.inventory)→ 按钮计数随渲染刷新(addPresenter)
  e.apply(actionById(e, 'grab'));
  ok('I3 拾取后按钮计数随 render 刷新 1→2(变异=删 install 的 addPresenter refresh→停在"物品 1"→红)', /物品 2/.test(btn.textContent));
  e.apply(actionById(e, 'grabPhoto'));
  btn.onclick(); btn.onclick();   // 关再开 → 重渲列表
  ok('I3b 新拾取卷轴用 world.items.scroll.label 显示、无条目的 photo 显裸 ID(可见退化非静默)', /残破卷轴/.test(panel.innerHTML) && /photo/.test(panel.innerHTML));

  // I4:空栏
  var bar6 = mockEl();
  var e6 = invEng(invWorld([]), function (x) { x.use(createInventoryPlugin({ document: mockDoc({ '#plugin-bar': bar6 }) })); }); e6.start();
  var b6 = bar6._kids[0], p6 = bar6._kids[1]; b6.onclick();
  ok('I4 空物品栏 → 按钮"物品 0" + 面板显(空)', /物品 0/.test(b6.textContent) && /\(空\)/.test(p6.innerHTML));

  // I5:DOM-free 退化(无 document/无插槽)→ 不崩;has/list 只读 helper 工作
  var inv5 = createInventoryPlugin({ document: null });
  var e5 = invEng(invWorld(), function (x) { x.use(inv5); }); e5.start();
  e5.apply(actionById(e5, 'grab'));
  ok('I5 DOM-free → 不崩 + has/list 只读工作(gem 初始 + grab 的 scroll)', inv5.has('gem') === true && inv5.has('scroll') === true && inv5.list().length === 2);

  // I6:fail-loud——initState.inventory 声明了却非数组 → install 抛(变异=删 install 校验→不抛→红)
  var threw = false;
  try { var eb = createEngine(invWorld('sword'), { storage: null }); eb.registerModule(invStub()); eb.use(createInventoryPlugin({ document: null })); }
  catch (err) { threw = /必须是数组/.test(String(err && err.message || err)); }
  ok('I6 initState.inventory 非数组(字符串)→ install 抛 fail-loud(变异=删校验→不抛→红)', threw);

  // I7:命名空间不撞——物品栏 inventory 与成就 _achievement 共存,成就还能读 inventory 解锁
  var doc7 = mockDoc({ '#plugin-bar': mockEl() });
  var e7 = invEng(invWorld(), function (x) {
    x.use(createInventoryPlugin({ document: doc7 }));
    x.use(createAchievementPlugin({ document: doc7, achievements: [ { id: 'a', title: 'A', when: function (s) { return (s.inventory || []).indexOf('gem') >= 0; } } ] }));
  }); e7.start();
  ok('I7 inventory 与 _achievement 命名空间共存(成就读 inventory 解锁、互不污染)', e7.state.inventory.indexOf('gem') >= 0 && e7.state._achievement && e7.state._achievement.a === 1);

  // I8:非字符串物品 ID → warn-once + 面板跳过(治静默"• [object Object]"乱码行)
  var warns = [], oldWarn = console.warn; console.warn = function () { warns.push(Array.prototype.join.call(arguments, ' ')); };
  var bar8 = mockEl();
  var e8 = invEng(invWorld(['gem']), function (x) { x.use(createInventoryPlugin({ document: mockDoc({ '#plugin-bar': bar8 }) })); }); e8.start();
  e8.state.inventory.push({ oops: 1 });   // 作者误塞对象(非字符串)
  var b8 = bar8._kids[0], p8 = bar8._kids[1]; b8.onclick();
  console.warn = oldWarn;
  ok('I8 非字符串物品 ID → warn + 面板跳过(不渲染 [object Object];gem 仍在;变异=删 typeof 守卫→出现→红)', !/\[object Object\]/.test(p8.innerHTML) && /血红宝石/.test(p8.innerHTML) && warns.some(function (s) { return /非字符串/.test(s); }));

  // I9:art-spec 矢量图标 + present-svg 加载 → 复用 renderArtSpec 渲染小 <svg>(window.Amatlas.SvgPresenter 注入)
  var oldWin = global.window;
  global.window = { Amatlas: { SvgPresenter: presentSvg } };
  var bar9 = mockEl();
  var e9 = invEng(invWorld(['torch']), function (x) { x.use(createInventoryPlugin({ document: mockDoc({ '#plugin-bar': bar9 }) })); }); e9.start();
  var b9 = bar9._kids[0], p9 = bar9._kids[1]; b9.onclick();
  delete global.window;
  ok('I9 art-spec 矢量图标 + present-svg → 渲染 <svg>(复用 renderArtSpec;变异=删 iconHtml 数组分支→无 <svg>→红)', /<svg[^>]*amatlas-inv-art/.test(p9.innerHTML) && /<circle/.test(p9.innerHTML) && /火把/.test(p9.innerHTML));

  // I10:art-spec 矢量图标但无 present-svg → 退化 • + warn-once(emoji 始终可用、不硬依赖 present-svg)
  var warns2 = [], oldWarn2 = console.warn; console.warn = function () { warns2.push(Array.prototype.join.call(arguments, ' ')); };
  var bar10 = mockEl();
  var e10 = invEng(invWorld(['torch']), function (x) { x.use(createInventoryPlugin({ document: mockDoc({ '#plugin-bar': bar10 }) })); }); e10.start();
  var b10 = bar10._kids[0], p10 = bar10._kids[1]; b10.onclick();
  console.warn = oldWarn2;
  ok('I10 art-spec 图标无 present-svg → 退化 •(不出 <svg>)+ warn(变异=删 SP 缺失分支的 warn/fallback→无 warn 或出 <svg>→红)', !/<svg/.test(p10.innerHTML) && /火把/.test(p10.innerHTML) && warns2.some(function (s) { return /present-svg/.test(s); }));
})();

// J. ResetPlugin:工具栏 ↻ 重新开始按钮(治端用户长期反馈"reset 按钮 fixed 飘";同 save/inventory 形态挂 #plugin-bar)
(function () {
  const { createResetPlugin } = require('../reset.js');
  // J1 挂 UI:按钮进 #plugin-bar(无浮窗,只 1 子元素)
  var bar1 = mockEl(); var doc1 = mockDoc({ '#plugin-bar': bar1 });
  var r1 = createResetPlugin({ document: doc1 });
  var e1 = eng(function (x) { x.use(r1); }); e1.start();
  ok('J1 ResetPlugin 挂 #plugin-bar(1 按钮、文字含重新开始)', bar1._kids.length === 1 && /重新开始/.test(bar1._kids[0].textContent));   // rank4: ↻(U+21BB) tofu 风险已移除,不再断言 ↻
  // J2 点击 confirm=true 默认弹窗 → reset 被调(注 global.window.confirm)
  var oldWin = global.window;
  var confirmCalls = 0, confirmRet = true;
  global.window = { confirm: function (msg) { confirmCalls++; return confirmRet; } };
  var bar2 = mockEl();
  var r2 = createResetPlugin({ document: mockDoc({ '#plugin-bar': bar2 }) });
  var e2 = eng(function (x) { x.use(r2); }); e2.start();
  e2.apply(actionById(e2, 'wave'));                     // 改 state
  ok('J2-pre state.flags.waved=true(reset 前)', e2.state.flags.waved === true);
  bar2._kids[0].onclick();                              // 点击 → confirm → reset
  ok('J2 点击 → confirm 被调一次 + reset 清 state(变异=删 doReset 的 api.reset 调用→state 不清→红)', confirmCalls === 1 && !e2.state.flags.waved);
  // J3 confirm 返回 false → 不 reset(用户取消)
  confirmRet = false; confirmCalls = 0;
  e2.apply(actionById(e2, 'wave'));
  bar2._kids[0].onclick();
  ok('J3 confirm 返 false → 不 reset(state 保持;变异=忽略 confirm 返回值→state 被清→红)', confirmCalls === 1 && e2.state.flags.waved === true);
  // J4 confirm:false → 不弹直接 reset
  global.window = { confirm: function () { confirmCalls++; return false; } }; confirmCalls = 0;
  var bar4 = mockEl();
  var r4 = createResetPlugin({ document: mockDoc({ '#plugin-bar': bar4 }), confirm: false });
  var e4 = eng(function (x) { x.use(r4); }); e4.start();
  e4.apply(actionById(e4, 'wave'));
  bar4._kids[0].onclick();
  ok('J4 confirm:false → 不弹 + 直接 reset(变异=忽略 confirm 配置→弹→红)', confirmCalls === 0 && !e4.state.flags.waved);
  // J5 自定义 label
  var bar5 = mockEl();
  var r5 = createResetPlugin({ document: mockDoc({ '#plugin-bar': bar5 }), label: '🔄 RESTART', confirm: false });
  var e5 = eng(function (x) { x.use(r5); }); e5.start();
  ok('J5 自定义 label 生效(变异=忽略 opts.label→默认↻→红)', /🔄 RESTART/.test(bar5._kids[0].textContent));
  // J6 无插槽 → 跳过 UI,reset API 仍生效
  var r6 = createResetPlugin({ document: mockDoc({}), confirm: false });   // 无 #plugin-bar
  var e6 = eng(function (x) { x.use(r6); }); e6.start();
  e6.apply(actionById(e6, 'wave'));
  ok('J6-pre 无插槽 install 不崩 + wave 成功', e6.state.flags.waved === true);
  r6.reset();
  ok('J6 无插槽 → 跳过 UI 但 reset API 仍清 state(变异=mountUI 必跑→无插槽崩→红)', !e6.state.flags.waved);
  global.window = oldWin;
})();

// H. round10 toast:进 .amatlas-toast-stack 堆叠容器(定位由插件默认 CSS 钉右下,不依赖作者 overlay 写法)+ 自动消隐出 DOM。
//    异步收尾(run.cjs 每文件独立 spawn,exit 移到此处)。
(function () {
  var overlay = mockEl(); var doc = mockDoc({ '#plugin-overlay': overlay });
  var ach = createAchievementPlugin({ document: doc, toastMs: 40, achievements: [
    { id: 'x', title: '甲', on: 'enter', when: function () { return true; } }
  ] });
  var e = eng(function (x) { x.use(ach); }); e.start();    // 开局解锁 → toast
  var stack = overlay._kids[0], toast = stack && stack._kids[0];
  ok('H1 toast 进 .amatlas-toast-stack 容器(slot 下恰 1 个容器)', overlay._kids.length === 1 && stack.className === 'amatlas-toast-stack');
  ok('H2 toast 内容(🏆 + 标题)在容器内', !!toast && /🏆/.test(toast.textContent) && /甲/.test(toast.textContent));
  var ov2 = mockEl();
  var ach2 = createAchievementPlugin({ document: mockDoc({ '#plugin-overlay': ov2 }), toastMs: 0, achievements: [
    { id: 'y', title: '乙', on: 'enter', when: function () { return true; } }
  ] });
  eng(function (x) { x.use(ach2); }).start();
  setTimeout(function () {                                 // 40ms 淡出 + 350ms 移除 < 600ms
    ok('H3 toastMs 后 toast 出 DOM(旧版永不移除 → 全屏 overlay 时永久挡工具栏)', stack._kids.indexOf(toast) < 0);
    ok('H4 toastMs:0 → 常驻不移除(作者可选)', ov2._kids[0]._kids.length === 1);
    console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
    process.exit(fail ? 1 : 0);
  }, 600);
})();
