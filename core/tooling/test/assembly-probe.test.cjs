/* ════════════════════════════════════════════════════════════════════════
   assembly-probe.mjs 验证(纯 node,无需 jsdom;随 test/run.cjs)。
   测 CLI 契约 + 分级退出码语义(docs/s11-c-assembly-probe-design.md):
     · 4 真 demo → 退出 0、装配通过。
     · [确认][P0] 装配崩(eval 抛 / createEngine 非函数)→ 退出 1。
     · [可疑][P1] 空渲染/无入口(空 world)→ 退出 0 + 打印 P1 警告(不拦)。
   P1 用例需真引擎 → 动态生成 fixture(path.relative 算 <script src>,免手算路径),跑完即删。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
var spawnSync = require('child_process').spawnSync;
var fs = require('fs');
var path = require('path');

var PROBE = path.join(__dirname, '..', 'assembly-probe.mjs');
var ENGINE = path.join(__dirname, '..', '..', '..');                 // engine/
var CORE = path.join(ENGINE, 'core', 'runtime', 'engine-core.js');
var RENDERER = path.join(ENGINE, 'modules', 'text-adventure', 'runtime', 'renderer.js');
var DOM = path.join(ENGINE, 'presenters', 'present-dom.js');
var SAVE = path.join(ENGINE, 'plugins', 'save.js');
var SVG = path.join(ENGINE, 'presenters', 'present-svg.js');
var ACH = path.join(ENGINE, 'plugins', 'achievement.js');
var INV = path.join(ENGINE, 'plugins', 'inventory.js');
var TMP = path.join(__dirname, 'fixtures', '_probe_tmp');
// 可复用源:合法 2 节点世界(起点有内容+动作、a↔b 可达、自动游玩不崩)+ 标准 DOM boot。
var W2 = '(function(g,f){if(typeof module!=="undefined"&&module.exports)module.exports=f();else g.MY_WORLD=f();})(typeof globalThis!=="undefined"?globalThis:this,function(){return {id:"14141414-1414-4414-8414-141414141414",start:{map:"m",node:"a"},maps:{m:{name:"M",nodes:{a:{kind:"scene",look:"起点",links:[{label:"去b",to:"b"}]},b:{kind:"scene",look:"终点",links:[{label:"回a",to:"a"}]}}}}};});';
var BOOT_DOM = '(function(){function boot(){var A=window.Amatlas;var W=window.MY_WORLD;var e=A.createEngine(W,{storage:null});e.use(A.TextAdventure.createTextAdventureModule({}));e.use(A.DomPresenter.createDomPresenter({document:document}));e.start();window._engine=e;}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();';

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name); pass++; }
  else { console.log('  X   ' + name + (detail ? '  → ' + detail : '')); fail++; }
}
function probe(indexPath) {
  var r = spawnSync(process.execPath, [PROBE, indexPath], { encoding: 'utf8' });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function fresh() { fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true }); }
function rel(to) { return path.relative(TMP, to).split(path.sep).join('/'); }
function write(name, content) { fs.writeFileSync(path.join(TMP, name), content); }
function tmpIndex(scripts) {
  write('index.html', '<!doctype html><html><body>' +
    scripts.map(function (s) { return '<script src="' + s + '"></script>'; }).join('') +
    '</body></html>');
  return path.join(TMP, 'index.html');
}

console.log('assembly-probe 验证');

try {
  // A. 4 真 demo → 退出 0、装配通过
  ['text-adventure-demo', 'tabletop-demo', 'horror-demo', 'minimal-demo'].forEach(function (d) {
    var r = probe(path.join(ENGINE, 'examples', d, 'index.html'));
    ok('A 真 demo 通过(退0):' + d, r.status === 0 && /装配通过|P0=0/.test(r.out), 'status=' + r.status);
  });

  // B1. [P0] eval 抛(调 undefined 的 createEngine,模拟 Haiku game.js:23)→ 退出 1
  fresh();
  write('boom.js', '(function(){ window.Amatlas = window.Amatlas || {}; var A = window.Amatlas; A.createEngine({}); })();');
  var b1 = probe(tmpIndex(['boom.js']));
  ok('B1 eval 抛(A.createEngine 不存在)→ 退出 1 + [P0]', b1.status === 1 && /\[确认\]\[P0\]/.test(b1.out), 'status=' + b1.status + ' ' + b1.out.replace(/\n/g, ' ').slice(0, 160));

  // B2. [P0] 命名空间无 createEngine(不抛,但 finalize 抓)→ 退出 1
  fresh();
  write('noce.js', 'window.Amatlas = { TextAdventure: {} };');           // 有 Amatlas 但无 createEngine
  var b2 = probe(tmpIndex(['noce.js']));
  ok('B2 Amatlas.createEngine 非函数 → 退出 1 + [P0]', b2.status === 1 && /\[确认\]\[P0\]/.test(b2.out) && /createEngine/.test(b2.out), 'status=' + b2.status);

  // C. [P1] 空渲染:真引擎 + 起点 look='' 但**有动作**(隔离"空 body→P1";起点无动作=④起点死局 P0,见 F)→ 退 0 + P1
  fresh();
  write('world.js', '(function(g,f){if(typeof module!=="undefined"&&module.exports)module.exports=f();else g.MY_WORLD=f();})(typeof globalThis!=="undefined"?globalThis:this,function(){return {id:"14141414-1414-4414-8414-141414141414",start:{map:"m",node:"a"},maps:{m:{name:"M",nodes:{a:{kind:"scene",look:"",links:[{label:"等待",run:function(S){}}]}}}}};});');
  write('game.js', '(function(){function boot(){var A=window.Amatlas;var W=window.MY_WORLD;var e=A.createEngine(W,{storage:null});e.use(A.TextAdventure.createTextAdventureModule({}));e.use(A.DomPresenter.createDomPresenter({document:document}));e.start();window._engine=e;}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();');
  write('index.html', '<!doctype html><html><body><div id="look"></div><div id="choices"></div>'   // 核心挂载点齐 → 隔离核心挂载点 P0,只验空 body 的 P1
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var c = probe(path.join(TMP, 'index.html'));
  ok('C1 空 body 不硬拦 → 退出 0', c.status === 0, 'status=' + c.status + ' ' + c.out.replace(/\n/g, ' ').slice(0, 200));
  ok('C2 空 world 打印 [P1] 空渲染/无入口警告', /\[可疑\]\[P1\]/.test(c.out) && /(空渲染|无入口)/.test(c.out), c.out.replace(/\n/g, ' ').slice(0, 200));
  ok('C3 同次未误报 P0', !/\[确认\]\[P0\]/.test(c.out), c.out.replace(/\n/g, ' ').slice(0, 160));

  // C4. [P0] round7 #5 兜底:节点声明了**移动出口(带 to)**却全被门控锁死、无保底,只剩原地动作 → 自动游玩原地打转 → soft-lock。
  //     与 C1(links 全无 to = 合法原地/计数器节点)对照:那里不报、这里报 —— 区别就在"是否声明了走不出的移动出口"。
  fresh();
  write('world.js', '(function(g,f){if(typeof module!=="undefined"&&module.exports)module.exports=f();else g.MY_WORLD=f();})(typeof globalThis!=="undefined"?globalThis:this,function(){return {id:"14141414-1414-4414-8414-141414141414",start:{map:"m",node:"a"},maps:{m:{name:"M",nodes:{a:{kind:"scene",look:"困局",links:[{label:"上锁的门",to:"b",requires:function(S){return false;}},{label:"原地徘徊",run:function(S){}}]},b:{kind:"scene",look:"终点",links:[]}}}}};});');
  write('game.js', BOOT_DOM);
  write('index.html', '<!doctype html><html><body><main id="app"><div id="mapname"></div><h1 id="place"></h1><div id="look"></div><div id="choices"></div><div id="status"></div></main>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var c4 = probe(path.join(TMP, 'index.html'));
  ok('C4 移动出口全锁+只剩原地动作 → soft-lock P0(退 1)', c4.status === 1 && /\[确认\]\[P0\]/.test(c4.out) && /soft-lock/.test(c4.out), 'status=' + c4.status + ' ' + c4.out.replace(/\n/g, ' ').slice(0, 200));

  // D. [P0] 运行时 NaN:自定义数值未初始化就算术(无 initState)→ 浅层自动游玩走步撞 NaN(静态查不到)
  fresh();
  write('world.js', '(function(g,f){if(typeof module!=="undefined"&&module.exports)module.exports=f();else g.MY_WORLD=f();})(typeof globalThis!=="undefined"?globalThis:this,function(){return {id:"14141414-1414-4414-8414-141414141414",start:{map:"m",node:"a"},maps:{m:{name:"M",nodes:{a:{kind:"scene",look:"起点",links:[{label:"挖掘",to:"b",run:function(S){S.stamina-=1;}}]},b:{kind:"scene",look:"终点",links:[{label:"回",to:"a"}]}}}}};});');
  write('game.js', '(function(){function boot(){var A=window.Amatlas;var W=window.MY_WORLD;var e=A.createEngine(W,{storage:null});e.use(A.TextAdventure.createTextAdventureModule({}));e.use(A.DomPresenter.createDomPresenter({document:document}));e.start();window._engine=e;}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();');
  var d = probe(tmpIndex([rel(CORE), rel(RENDERER), rel(DOM), 'world.js', 'game.js']));
  ok('D1 运行时 NaN(走步后)→ 退出 1 + [P0]', d.status === 1 && /\[确认\]\[P0\]/.test(d.out) && /NaN/.test(d.out), 'status=' + d.status + ' ' + d.out.replace(/\n/g, ' ').slice(0, 200));
  ok('D2 NaN 是 ④ 走步阶段抓的(消息含「自动游玩」,首屏 ①②③ 抓不到 → 证明走步的独特价值)', /自动游玩/.test(d.out), d.out.replace(/\n/g, ' ').slice(0, 160));

  // E. 挂载点缺失分级(改 A,S12):显式配的 slot 缺 → P0(强意图、拼错=真 bug);DomPresenter 缺省辅助挂载点缺 → P1。
  //    fixture:挂 DomPresenter + SavePlugin(显式 slot #plugin-bar),index.html 只有 #look/#choices(缺 #status/#mapname/#place/#plugin-bar)。
  fresh();
  write('world.js', '(function(g,f){if(typeof module!=="undefined"&&module.exports)module.exports=f();else g.MY_WORLD=f();})(typeof globalThis!=="undefined"?globalThis:this,function(){return {id:"14141414-1414-4414-8414-141414141414",start:{map:"m",node:"a"},maps:{m:{name:"M",nodes:{a:{kind:"scene",look:"起点",links:[{label:"等待",run:function(S){}}]}}}}};});');
  write('game.js', '(function(){function boot(){var A=window.Amatlas;var W=window.MY_WORLD;var e=A.createEngine(W,{storage:null});e.use(A.TextAdventure.createTextAdventureModule({}));e.use(A.DomPresenter.createDomPresenter({document:document}));e.use(A.SavePlugin.createSavePlugin({slot:"#plugin-bar"}));e.start();window._engine=e;}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();');
  write('index.html', '<!doctype html><html><body><main id="app"><div id="look"></div><div id="choices"></div></main>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script><script src="' + rel(SAVE) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var e5 = probe(path.join(TMP, 'index.html'));
  ok('E1 显式 slot #plugin-bar 缺 → 升 P0(退 1;改 A:强意图、拼错=真 bug)', e5.status === 1 && /显式 slot 挂载点缺失/.test(e5.out) && /#plugin-bar/.test(e5.out), 'status=' + e5.status + ' ' + e5.out.replace(/\n/g, ' ').slice(0, 200));
  ok('E2 DomPresenter 缺省辅助挂载点 #status 缺 → P1(挂载点缺失、不升 P0)', /挂载点缺失/.test(e5.out) && /#status/.test(e5.out), e5.out.replace(/\n/g, ' ').slice(0, 200));
  ok('E3 已有的 #look/#choices 不误报', !/#look/.test(e5.out) && !/#choices/.test(e5.out), e5.out.replace(/\n/g, ' ').slice(0, 200));

  // F. [P0] 起点死局(④,design-principles §6a):world.start 节点首屏无任何动作 → 玩家第一屏卡死(不可能有意)→ 退 1。
  //    起点有开场白(body 非空)却无动作 → 与"空 body→P1"区别开;index.html 给齐 #look/#choices 以隔离核心挂载点 P0。
  fresh();
  write('world.js', '(function(g,f){if(typeof module!=="undefined"&&module.exports)module.exports=f();else g.MY_WORLD=f();})(typeof globalThis!=="undefined"?globalThis:this,function(){return {id:"14141414-1414-4414-8414-141414141414",start:{map:"m",node:"a"},maps:{m:{name:"M",nodes:{a:{kind:"scene",look:"开场白,但无路可走",links:[]}}}}};});');
  write('game.js', BOOT_DOM);
  write('index.html', '<!doctype html><html><body><div id="look"></div><div id="choices"></div>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var f = probe(path.join(TMP, 'index.html'));
  ok('F1 起点无动作 → 退出 1 + [P0] 起点死局', f.status === 1 && /\[确认\]\[P0\]/.test(f.out) && /起点死局/.test(f.out), 'status=' + f.status + ' ' + f.out.replace(/\n/g, ' ').slice(0, 200));
  ok('F2 起点死局区别于空 body(本例 body 非空,仍因无动作 P0)', !/空渲染/.test(f.out), f.out.replace(/\n/g, ' ').slice(0, 160));

  // G. [P0] 核心挂载点缺失(④):用 DomPresenter 但 index.html 缺 #look → 没内容、不可玩 → 退 1(其余挂载点缺仅 P1)。
  fresh();
  write('world.js', W2);
  write('game.js', BOOT_DOM);
  write('index.html', '<!doctype html><html><body><div id="choices"></div>'      // 有 #choices、缺 #look
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var g = probe(path.join(TMP, 'index.html'));
  ok('G1 缺核心挂载点 #look → 退出 1 + [P0] 核心挂载点', g.status === 1 && /\[确认\]\[P0\]/.test(g.out) && /核心挂载点/.test(g.out) && /#look/.test(g.out), 'status=' + g.status + ' ' + g.out.replace(/\n/g, ' ').slice(0, 200));
  ok('G2 #status 等非核心仍只 P1(核心 P0 行不含 #status)', !/核心挂载点[^\n]*#status/.test(g.out), g.out.replace(/\n/g, ' ').slice(0, 200));

  // H. [P1] 默认 slot 失明修复(③):createSvgPresenter() 省略 slot 用内部默认 #scene,index.html 缺 #scene → 报缺(旧版只认显式 slot 会失明)。
  fresh();
  write('world.js', W2);
  write('game.js', '(function(){function boot(){var A=window.Amatlas;var W=window.MY_WORLD;var e=A.createEngine(W,{storage:null});e.use(A.TextAdventure.createTextAdventureModule({}));e.use(A.DomPresenter.createDomPresenter({document:document}));e.use(A.SvgPresenter.createSvgPresenter());e.start();window._engine=e;}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();');
  write('index.html', '<!doctype html><html><body><div id="look"></div><div id="choices"></div>'   // 核心齐、缺 #scene
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script><script src="' + rel(SVG) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var h = probe(path.join(TMP, 'index.html'));
  ok('H1 createSvgPresenter() 省略 slot → 报缺默认 #scene(非核心 → P1 退 0)', h.status === 0 && /挂载点缺失/.test(h.out) && /#scene/.test(h.out), 'status=' + h.status + ' ' + h.out.replace(/\n/g, ' ').slice(0, 200));
  ok('H2 旧版"默认 slot 失明"已修(显式 slot 之外也能查出默认 #scene)', /#scene/.test(h.out), h.out.replace(/\n/g, ' ').slice(0, 160));

  // N. [P1] 物品栏插件默认 slot 失明:只用 createInventoryPlugin()(默认 slot #plugin-bar、不用 save/ach)但 index.html 缺 #plugin-bar → 报缺(否则物品栏静默不挂)。
  //    index.html 给齐 DomPresenter 的 #look/#choices/#status/#mapname/#place → 隔离出唯一缺的 #plugin-bar 来自 inventory 检测。
  fresh();
  write('world.js', W2);
  write('game.js', '(function(){function boot(){var A=window.Amatlas;var W=window.MY_WORLD;var e=A.createEngine(W,{storage:null});e.use(A.TextAdventure.createTextAdventureModule({}));e.use(A.DomPresenter.createDomPresenter({document:document}));e.use(A.InventoryPlugin.createInventoryPlugin({}));e.start();window._engine=e;}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();');
  write('index.html', '<!doctype html><html><body><main id="app"><div id="look"></div><div id="choices"></div><div id="status"></div><div id="mapname"></div><h1 id="place"></h1></main>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script><script src="' + rel(INV) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var nv = probe(path.join(TMP, 'index.html'));
  ok('N1 只用 inventory(默认 slot)缺 #plugin-bar → 报缺(P1 退0;变异=探针删 useInv→不报→红)', nv.status === 0 && /挂载点缺失/.test(nv.out) && /#plugin-bar/.test(nv.out), 'status=' + nv.status + ' ' + nv.out.replace(/\n/g, ' ').slice(0, 200));
  ok('N2 P1 不硬拦(退0)+ 未误报 P0', nv.status === 0 && !/\[确认\]\[P0\]/.test(nv.out), nv.out.replace(/\n/g, ' ').slice(0, 160));

  // L. 悬空按钮(round4 ①):<button id=X> 但 game.js 从不引用 X → P1(模型自造图标按钮没接 onclick)
  fresh();
  write('world.js', W2);
  write('game.js', BOOT_DOM + '\nvar _r=document.getElementById("reset"); if(_r)_r.onclick=function(){};');  // 只接 reset
  write('index.html', '<!doctype html><html><body><div id="look"></div><div id="choices"></div>'
    + '<button id="reset">重开</button><button id="ghost-btn">幽灵</button>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var Lr = probe(path.join(TMP, 'index.html'));
  ok('L1 悬空按钮 #ghost-btn 报 P1(game.js 没接 onclick)', /悬空按钮[^\n]*#ghost-btn/.test(Lr.out), Lr.out.replace(/\n/g, ' ').slice(0, 200));
  ok('L2 已接的 #reset 不误报', !/悬空按钮[^\n]*#reset/.test(Lr.out), Lr.out.replace(/\n/g, ' ').slice(0, 160));

  // M. CSS class 不匹配(round4 ②):.choice-btn 但无 .choice / .plugin-btn 但无 .amatlas-plugin-btn → P1;写对则不报
  fresh();
  write('world.js', W2); write('game.js', BOOT_DOM);
  write('index.html', '<!doctype html><html><head><style>.choice-btn{color:red}.plugin-btn{color:blue}</style></head><body>'
    + '<div id="look"></div><div id="choices"></div>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var Mr = probe(path.join(TMP, 'index.html'));
  ok('M1 .choice-btn 报不匹配(实际 .choice;present-dom 核心 → P1 退0)', /CSS class 不匹配.{0,80}\.choice-btn/.test(Mr.out) && Mr.status === 0, 'status=' + Mr.status + ' ' + Mr.out.replace(/\n/g, ' ').slice(0, 200));
  // (M2/M2b 删:插件 class 误写 P0 检查已随 §11 治本移除 —— save/minimap/achievement 插件 install 自带默认样式(:where 零特异、var fallback)、误写/没写都不裸;选项 .choice 仍由 M1/M3 查、present-dom 不自带样式)
  fresh();
  write('world.js', W2); write('game.js', BOOT_DOM);
  write('index.html', '<!doctype html><html><head><style>.choice{color:red}</style></head><body><div id="look"></div><div id="choices"></div>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var Mok = probe(path.join(TMP, 'index.html'));
  ok('M3 写对 .choice → 不报 CSS 不匹配(零误报)', !/CSS class 不匹配/.test(Mok.out), Mok.out.replace(/\n/g, ' ').slice(0, 160));

  // (M4/M5 删:成就插件 class 误写 P0 同上随 §11 治本移除 —— 插件自带样式、误写不致裸)

  // (N1-N3 删:「插件控件完全没写样式」检查已随 §11 治本移除 —— 插件 install 自带默认样式,无论作者写不写都不裸;接缝消失=检查删,见 lesson)

  // O. boot 形态(改 A,S12):game.js 用 Amatlas.boot → 工厂调用收进 preset 层,旧版 grep createXxx 会【失明】。
  //    验证 probe 认 boot:核心挂载点仍 P0、插件 CSS 接缝仍 P0(不失明)、无插件零误报。
  var BOOT = path.join(ENGINE, 'preset', 'boot.js');
  // O1 boot + 缺核心挂载点 #look → P0(boot 必挂 DomPresenter;旧版只 grep createDomPresenter 会对 boot 失明)
  fresh();
  write('world.js', W2);
  write('game.js', '(function(){function boot(){var A=window.Amatlas;window._engine=A.boot(window.MY_WORLD,{});}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();');  // 用 A.boot 别名(模板形式)验证 usesBoot 也认它
  write('index.html', '<!doctype html><html><body><div id="choices"></div>'      // 缺 #look
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script><script src="' + rel(BOOT) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var o1 = probe(path.join(TMP, 'index.html'));
  ok('O1 boot 形态 + 缺核心挂载点 #look → P0(退1;boot 必挂 DomPresenter,旧版 grep createDomPresenter 会失明)', o1.status === 1 && /核心挂载点/.test(o1.out) && /#look/.test(o1.out), 'status=' + o1.status + ' ' + o1.out.replace(/\n/g, ' ').slice(0, 200));

  // (O2 删:boot + 插件 class 误写 P0 同上随 §11 治本移除;O1 核心挂载点 / O3 无插件零误报 保留)

  // O3 boot + 无插件 → 不误报插件挂载点/CSS(零误报校准:onKey 只在 boot 实参区跑、manifest {} 不命中 save/minimap/ach)
  fresh();
  write('world.js', W2);
  write('game.js', '(function(){function boot(){window._engine=window.Amatlas.boot(window.MY_WORLD,{});}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();');
  write('index.html', '<!doctype html><html><head><style>.choice{color:red}</style></head><body><main id="app"><div id="mapname"></div><h1 id="place"></h1><div id="look"></div><div id="choices"></div><div id="status"></div></main>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script><script src="' + rel(BOOT) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var o3 = probe(path.join(TMP, 'index.html'));
  ok('O3 boot 无插件 → P0=0 且不误报插件挂载点(退0;manifest{} 不命中 save/minimap/ach)', o3.status === 0 && !/plugin-bar|plugin-minimap|plugin-overlay/.test(o3.out), 'status=' + o3.status + ' ' + o3.out.replace(/\n/g, ' ').slice(0, 200));

  // O5 boot + reset:true(↻ 重开 ResetPlugin 默认挂 #plugin-bar)缺 #plugin-bar → 报缺(P1)。补对称兄弟:save/inventory 已测、reset 此前是盲点(reset:true 缺 #plugin-bar 会静默消失、三闸全过)。引 reset.js→装配不崩(install 找不到 #plugin-bar 即 no-op),只剩静态挂载点 P1。变异=探针删 useReset→不报→红。
  var RESET = path.join(ENGINE, 'plugins', 'reset.js');
  fresh();
  write('world.js', W2);
  write('game.js', '(function(){function boot(){window._engine=window.Amatlas.boot(window.MY_WORLD,{reset:true});}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();');
  write('index.html', '<!doctype html><html><body><main id="app"><div id="mapname"></div><h1 id="place"></h1><div id="look"></div><div id="choices"></div><div id="status"></div></main>'   // 核心挂载点齐、唯独缺 #plugin-bar → 隔离出 reset 检测
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script><script src="' + rel(RESET) + '"></script><script src="' + rel(BOOT) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var o5 = probe(path.join(TMP, 'index.html'));
  ok('O5 boot + reset:true 缺 #plugin-bar → 报缺(P1 退0;对称兄弟,变异=探针删 useReset→不报→红)', o5.status === 0 && /挂载点缺失/.test(o5.out) && /#plugin-bar/.test(o5.out), 'status=' + o5.status + ' ' + o5.out.replace(/\n/g, ' ').slice(0, 200));

  // O4 用 A.boot 但 index.html 漏引 preset/boot.js → window.Amatlas.boot 未定义 → 装配崩 P0(S12-4 showcase 真因;静态早抓 + 明确提示加 boot.js)
  fresh();
  write('world.js', W2);
  write('game.js', '(function(){function boot(){var A=window.Amatlas;window._engine=A.boot(window.MY_WORLD,{});}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();');
  write('index.html', '<!doctype html><html><body><div id="look"></div><div id="choices"></div>'   // 引擎/模块/world/game 齐,独缺 preset/boot.js
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var o4 = probe(path.join(TMP, 'index.html'));
  ok('O4 用 A.boot 但漏引 preset/boot.js → P0(退1、点名 preset/boot.js)', o4.status === 1 && /preset\/boot\.js/.test(o4.out), 'status=' + o4.status + ' ' + o4.out.replace(/\n/g, ' ').slice(0, 200));

  // P. 核心呈现器选项 class 误加 amatlas- 前缀(showcase 实测:haiku 把 .choice 写成 .amatlas-link → .choice 无样式 → 选项裸 + locked 不灰显点了没反应)。普适查"核心 .choice 有没有样式"(不枚举误写名)。
  fresh();
  write('world.js', W2); write('game.js', BOOT_DOM);
  write('index.html', '<!doctype html><html><head><style>.amatlas-link{color:red}.amatlas-status-item{}</style></head><body><div id="look"></div><div id="choices"></div>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var p1r = probe(path.join(TMP, 'index.html'));
  ok('P1 选项 class 误加 amatlas- 前缀(.amatlas-link、无 .choice)→ 报"选项按钮无样式"(退0、P1)', /选项按钮无样式/.test(p1r.out) && p1r.status === 0, 'status=' + p1r.status + ' ' + p1r.out.replace(/\n/g, ' ').slice(0, 200));
  fresh();
  write('world.js', W2); write('game.js', BOOT_DOM);
  write('index.html', '<!doctype html><html><head><style>.choice{color:red}</style></head><body><div id="look"></div><div id="choices"></div>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var p2r = probe(path.join(TMP, 'index.html'));
  ok('P2 写对 .choice → 不报选项无样式(零误报)', !/选项按钮无样式/.test(p2r.out), p2r.out.replace(/\n/g, ' ').slice(0, 160));

  // P3. 共享 CSS 路线:source index.html 用本地 stylesheet link 提供 .choice,probe 必须读取它;否则共享 skin A 段会被旧 styleText 误报。
  fresh();
  fs.mkdirSync(path.join(TMP, 'styles'), { recursive: true });
  write('world.js', W2); write('game.js', BOOT_DOM); write('styles/atlas.css', '.choice{color:red}.choice.locked{opacity:.5}');
  write('index.html', '<!doctype html><html><head><link rel="stylesheet" href="styles/atlas.css"></head><body><div id="look"></div><div id="choices"></div>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var p3r = probe(path.join(TMP, 'index.html'));
  ok('P3 本地 linked CSS 里的 .choice 被 probe 识别 → 不报选项无样式', p3r.status === 0 && !/选项按钮无样式/.test(p3r.out), 'status=' + p3r.status + ' ' + p3r.out.replace(/\n/g, ' ').slice(0, 200));

  fresh();
  write('world.js', W2); write('game.js', BOOT_DOM);
  write('index.html', '<!doctype html><html><head><link rel="stylesheet" href="styles/missing.css"></head><body><div id="look"></div><div id="choices"></div>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(RENDERER) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var p4r = probe(path.join(TMP, 'index.html'));
  ok('P4 缺失 linked CSS → P1 点名 stylesheet 读不到(不升 P0;build 负责 fail-closed)', p4r.status === 0 && /stylesheet 读不到:styles\/missing\.css/.test(p4r.out), 'status=' + p4r.status + ' ' + p4r.out.replace(/\n/g, ' ').slice(0, 200));

  // Q. v14:audio.music 用 {midi:...} 但没引 presenters/midi-music.js → P1 静态补抓(真机渲染才抛、探针无 AudioContext 走不到)
  fresh();
  var WMIDI = W2.replace('look:"起点",', 'look:"起点",audio:{music:{midi:"TVRoZA=="}},');
  write('world.js', WMIDI); write('game.js', BOOT_DOM);
  tmpIndex([rel(CORE), rel(RENDERER), rel(DOM), 'world.js', 'game.js']);
  var q1 = probe(path.join(TMP, 'index.html'));
  ok('Q1 {midi} 漏引 midi-music.js → P1 点名加 script', /midi-music\.js/.test(q1.out) && /P1/.test(q1.out), q1.out.replace(/\n/g, ' ').slice(0, 200));
  fresh();
  write('world.js', WMIDI); write('game.js', BOOT_DOM);
  tmpIndex([rel(CORE), rel(RENDERER), rel(DOM), rel(path.join(ENGINE, 'presenters', 'midi-music.js')), 'world.js', 'game.js']);
  var q2 = probe(path.join(TMP, 'index.html'));
  ok('Q2 引了 midi-music.js → 不报(零误报)', !/没加载 presenters\/midi-music/.test(q2.out), q2.out.replace(/\n/g, ' ').slice(0, 160));

  // Q3/Q4. 普通 audio.music 也依赖 compose-music.js；浏览器后加载合法，故只验是否存在、不限制 script 顺序。
  fresh();
  var WMUSIC = W2.replace('look:"起点",', 'look:"起点",audio:{music:"calm"},');
  write('world.js', WMUSIC); write('game.js', BOOT_DOM);
  tmpIndex([rel(CORE), rel(RENDERER), rel(DOM), 'world.js', 'game.js']);
  var q3 = probe(path.join(TMP, 'index.html'));
  ok('Q3 audio.music 漏引 compose-music.js → P1 点名加 script', /compose-music\.js/.test(q3.out) && /P1/.test(q3.out), q3.out.replace(/\n/g, ' ').slice(0, 200));
  fresh();
  write('world.js', WMUSIC); write('game.js', BOOT_DOM);
  tmpIndex([rel(CORE), rel(RENDERER), rel(DOM), 'world.js', 'game.js', rel(path.join(ENGINE, 'presenters', 'compose-music.js'))]);
  var q4 = probe(path.join(TMP, 'index.html'));
  ok('Q4 compose 后加载也算已装配 → 不报(零误报)', !/没加载 presenters\/compose-music/.test(q4.out), q4.out.replace(/\n/g, ' ').slice(0, 160));

  // Q5/Q6. query/fragment 不是本地文件名；credits.music 也不能跨对象误拼成 audio.music。
  fresh();
  write('world.js', WMUSIC); write('index.html', '<!doctype html><body><script src=world.js></script></body>');
  var q5bare = probe(path.join(TMP, 'index.html'));
  ok('Q5a 合法裸 script src 不能被当成无脚本跳过', !/无 <script src>/.test(q5bare.out) && !/跳过\(非游戏错误/.test(q5bare.out), q5bare.out.replace(/\n/g, ' ').slice(0, 220));

  fresh();
  write('world.js', WMUSIC); write('game.js', BOOT_DOM);
  tmpIndex([rel(CORE) + '?v=40', rel(RENDERER) + '#runtime', rel(DOM), rel(path.join(ENGINE, 'presenters', 'compose-music.js')) + '?cache=1', 'world.js', 'game.js']);
  write('index.html', fs.readFileSync(path.join(TMP, 'index.html'), 'utf8').replace('<body>', '<body><div id="look"></div><div id="choices"></div>'));
  var q5 = probe(path.join(TMP, 'index.html'));
  ok('Q5 本地 script src 带 query/fragment 仍能装配', q5.status === 0 && !/脚本读不到/.test(q5.out) && !/\[确认\]\[P0\]/.test(q5.out), q5.out.replace(/\n/g, ' ').slice(0, 240));

  fresh();
  var WCREDITS = W2.replace('look:"起点",', 'look:"起点",audio:{sfx:[]},credits:{music:"作曲者"},');
  write('world.js', WCREDITS); write('game.js', BOOT_DOM);
  tmpIndex([rel(CORE), rel(RENDERER), rel(DOM), 'world.js', 'game.js']);
  write('index.html', fs.readFileSync(path.join(TMP, 'index.html'), 'utf8').replace('<body>', '<body><div id="look"></div><div id="choices"></div>'));
  var q6 = probe(path.join(TMP, 'index.html'));
  ok('Q6 credits.music 不误报为 audio.music 漏 compose', !/没加载 presenters\/compose-music/.test(q6.out), q6.out.replace(/\n/g, ' ').slice(0, 220));

  // R. 9 拍 cutscene 前 8 拍只有 runtime-owned ▸；probe 必须窄化识别并逐拍 apply，不能误报 soft-lock。
  //    beat5.run 注入 NaN，证明 probe 不是跳过中间拍直接点末拍出口。
  fresh();
  var CUTSCENE = path.join(ENGINE, 'modules', 'cutscene', 'runtime', 'cutscene.js');
  write('world.js', '(function(g,f){if(typeof module!=="undefined"&&module.exports)module.exports=f();else g.MY_WORLD=f();})(typeof globalThis!=="undefined"?globalThis:this,function(){return {id:"14141414-1414-4414-8414-141414141414",start:{map:"m",node:"intro"},maps:{m:{name:"M",nodes:{'
    + 'intro:{kind:"cutscene",title:"序章",beats:[{hold:true,text:"b0"},{hold:true,text:"b1"},{hold:true,text:"b2"},{hold:true,text:"b3"},{hold:true,text:"b4"},{hold:true,text:"b5",run:function(S){S.flags.mid=true;}},{hold:true,text:"b6"},{hold:true,text:"b7"},{hold:true,text:"b8"}],links:[{label:"进入结局",to:"outro"}]},'
    + 'outro:{kind:"cutscene",title:"终章",beats:[{hold:true,text:"完"}],links:[]}'
    + '}}}};});');
  write('game.js', '(function(){function boot(){var A=window.Amatlas;var W=window.MY_WORLD;var e=A.createEngine(W,{storage:null});e.use(A.Cutscene.createCutsceneModule());e.use(A.DomPresenter.createDomPresenter({document:document}));e.start();window._engine=e;}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();})();');
  write('index.html', '<!doctype html><html><body><main id="app"><div id="look"></div><div id="choices"></div></main>'
    + '<script src="' + rel(CORE) + '"></script><script src="' + rel(CUTSCENE) + '"></script><script src="' + rel(DOM) + '"></script>'
    + '<script src="world.js"></script><script src="game.js"></script></body></html>');
  var r9 = probe(path.join(TMP, 'index.html'));
  ok('R1 9 拍 cutscene 前 8 拍仅 ▸，probe 逐拍走到末拍出口且 P0=0', r9.status === 0 && !/\[确认\]\[P0\]/.test(r9.out), 'status=' + r9.status + ' ' + r9.out.replace(/\n/g, ' ').slice(0, 240));
  ok('R2 probe 连续 apply ▸ 穿过 beat5.run，再从末拍出口离开', !/运行时 NaN|运行时崩/.test(r9.out), r9.out.replace(/\n/g, ' ').slice(0, 160));

  var badWorld = fs.readFileSync(path.join(TMP, 'world.js'), 'utf8').replace('S.flags.mid=true;', 'S.flags.mid=0/0;');
  write('world.js', badWorld);
  var r10 = probe(path.join(TMP, 'index.html'));
  ok('R3 beat5.run 注入 NaN 后 probe 必须报运行时 P0，证明真实经过中间拍', r10.status !== 0 && /运行时 NaN/.test(r10.out), 'status=' + r10.status + ' ' + r10.out.replace(/\n/g, ' ').slice(0, 220));
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });                   // 清临时 fixture,绝不残留入库
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
