'use strict';
/* Minimal R·05 正式旅程：锁真实 game manifest、counter→core exit→scene 与 load/reset。 */
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..');
var ENGINE = path.join(ROOT, '..', '..');
var WORLD_PATH = path.join(ROOT, 'world.js');
var GAME_PATH = path.join(ROOT, 'game.js');
var INDEX_PATH = path.join(ROOT, 'index.html');
var CORE = require(path.join(ENGINE, 'core', 'runtime', 'engine-core.js'));
var TEXT = require(path.join(ENGINE, 'modules', 'text-adventure', 'runtime', 'renderer.js'));
var MINIMAL = require(path.join(ENGINE, 'modules', 'minimal', 'runtime', 'minimal.js'));
var BOOT = require(path.join(ENGINE, 'preset', 'boot.js')).boot;
var WORLD = require(WORLD_PATH);
var pass = 0, fail = 0;
function ok(cond, msg, detail) { if (cond) pass++; else { fail++; console.log('  FAIL ' + msg + (detail ? ' -> ' + detail : '')); } }
function cloneWorld() { delete require.cache[require.resolve(WORLD_PATH)]; return require(WORLD_PATH); }
function node(world, id) { return world.maps.m.nodes[id]; }
function action(snap, pattern) { return (snap.actions || []).filter(function (a) { return typeof pattern === 'string' ? a.id === pattern : pattern.test(a.label || ''); })[0]; }
function body(snap) { return (snap.view.body || []).map(function (line) { return line.text || ''; }).join('\n'); }
function makeEngine(world, goal, module) {
  var e = CORE.createEngine(world, { storage: null });
  e.use(TEXT.createTextAdventureModule());
  e.use(module || MINIMAL.createMinimalModule({ goal: goal == null ? 10 : goal }));
  e.start(); return e;
}
function captureGame(source) {
  var captured = null, listeners = {};
  var module = MINIMAL;
  var context = {
    window: { Amatlas: {
      Minimal: module,
      boot: function (world, manifest) { captured = { world: world, manifest: manifest }; return { reset: function () {} }; }
    } },
    MINIMAL_WORLD: WORLD,
    document: {
      readyState: 'complete',
      getElementById: function () { return null; },
      addEventListener: function (name, fn) { listeners[name] = fn; }
    },
    confirm: function () { return true; }
  };
  vm.runInNewContext(source, context, { filename: GAME_PATH });
  return captured;
}
function stubDoc() { return { querySelector: function () { return null; }, createElement: function () { return { appendChild: function () {}, setAttribute: function () {}, style: {} }; }, head: { insertBefore: function () {} }, getElementById: function () { return null; }, documentElement: { dataset: {} } }; }

console.log('Minimal R·05 正式自定义模块旅程');
var gameSource = fs.readFileSync(GAME_PATH, 'utf8');
var indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
var captured = captureGame(gameSource);
var scripts = Array.from(indexSource.matchAll(/<script\s+src="([^"]+)"/g), function (m) { return m[1]; });
var expectedScripts = [
  '../../core/runtime/engine-core.js', '../../modules/text-adventure/runtime/renderer.js', '../../presenters/present-dom.js',
  '../../modules/minimal/runtime/minimal.js', 'world.js', '../../preset/boot.js', 'game.js'
];
ok(scripts.length === expectedScripts.length && scripts.every(function (s, i) { return s === expectedScripts[i]; }), 'F0 正式index锁core→text→DOM→minimal→world→boot→game完整顺序', JSON.stringify(scripts));
ok(captured && captured.world === WORLD && captured.manifest && Array.isArray(captured.manifest.modules) && captured.manifest.modules.length === 1 && captured.manifest.modules[0].nodeKinds[0] === 'counter' && typeof captured.manifest.modules[0].install === 'function', 'F1 实际执行正式game捕获live manifest.modules单一counter owner');
var handoffSeen = node(WORLD, 'handoff').look({ count: 10 });
var handoffUnseen = node(WORLD, 'handoff').look({ count: 0 });
ok(/计数达到 10/.test(handoffSeen) && /还没有达到/.test(handoffUnseen) && handoffSeen !== handoffUnseen, 'F1b 正式handoff正文真实读取count的成功/未达双分支');
(function missingModuleFailsLoud() {
  var old = global.Amatlas, threw = '';
  global.Amatlas = {
    createEngine: CORE.createEngine,
    TextAdventure: TEXT,
    DomPresenter: { createDomPresenter: function () { return function () {}; } }
  };
  try { BOOT(WORLD, { document: stubDoc(), modules: [] }); }
  catch (e) { threw = e.message; }
  finally { global.Amatlas = old; }
  ok(/node\.kind.*没有模块认领[\s\S]*counter|counter[\s\S]*没有模块认领/.test(threw), 'F2 删除custom module后真实boot/start明确fail-loud未认领counter', threw);
})();

(function journey() {
  var e = makeEngine(WORLD, null, captured.manifest.modules[0]), fresh = e.view();
  ok(/0 \/ 10/.test(body(fresh)) && action(fresh, 'inc') && action(fresh, /暂时放下/) && !action(fresh, /交给试玩者/), 'J1 fresh公开View为0/10、有inc/保底暂停且交付出口未提前出现', body(fresh));
  for (var i = 0; i < 9; i++) e.apply(action(e.view(), 'inc'));
  var nine = e.view();
  ok(/9 \/ 10/.test(body(nine)) && action(nine, 'inc') && !action(nine, /交给试玩者/), 'J2 第9次仍未达标且无出口');
  e.apply(action(nine, 'inc'));
  var done = e.view();
  ok(/10 \/ 10.*达成/.test(body(done)) && !action(done, 'inc') && action(done, /交给试玩者/), 'J3 第10次达标、inc消失且core exit首次出现', body(done));
  e.apply(action(done, /交给试玩者/));
  var handoff = e.view();
  ok(handoff.pos.node === 'handoff' && handoff.nodeKind === 'scene' && !action(handoff, 'inc') && /核心.*exits.*普通 scene/.test(body(handoff)), 'J4 core move进入普通scene并由正文读取count');
  e.apply(action(handoff, /查看改造清单/));
  var inspected = e.view();
  ok(e.state.flags.minimalPlanSeen === true && /manifest\.modules/.test(body(inspected)), 'J5 普通scene action写durable flag并显示回应');
  e.apply(action(inspected, /返回已完成原型/));
  var returned = e.view();
  ok(returned.pos.node === 'home' && e.state.count === 10 && action(returned, /交给试玩者/) && !action(returned, 'inc'), 'J6 返回保留已完成count与出口，不冒充重做');
  var saved = e.serialize(), restored = makeEngine(cloneWorld(), null, captured.manifest.modules[0]);
  ok(restored.load(saved) && restored.state.count === 10 && restored.state.flags.minimalPlanSeen === true && restored.view().pos.node === 'home', 'J7 serialize/load保count/flag/位置');
  e.reset();
  ok(e.view().pos.node === 'home' && /0 \/ 10/.test(body(e.view())) && !e.state.flags.minimalPlanSeen && !action(e.view(), /交给试玩者/), 'J8 reset fresh公开0/10并清flag/出口');
})();

console.log('反向变异');
(function () { var e = makeEngine(cloneWorld(), 9); for (var i = 0; i < 9; i++) e.apply(action(e.view(), 'inc')); ok(!action(e.view(), 'inc'), 'M1 goal 10→9会被第9次仍应有inc打红'); })();
(function () { var w = cloneWorld(); node(w, 'home').exits[0].available = function () { return true; }; ok(!!action(makeEngine(w, 10).view(), /交给试玩者/), 'M2 available恒真会被fresh无出口牙打红'); })();
(function () { var w = cloneWorld(); node(w, 'home').exits[0].available = function (S) { return (S.count || 0) >= 11; }; var e = makeEngine(w, 10); for (var i = 0; i < 10; i++) e.apply(action(e.view(), 'inc')); ok(!action(e.view(), /交给试玩者/), 'M3 threshold 10→11会被第10次应有出口牙打红'); })();
(function () { var w = cloneWorld(); node(w, 'handoff').kind = 'counter'; var e = makeEngine(w, 10); for (var i = 0; i < 10; i++) e.apply(action(e.view(), 'inc')); e.apply(action(e.view(), /交给试玩者/)); ok(e.view().nodeKind !== 'scene', 'M4 handoff改counter会被scene回接牙打红'); })();
(function () { var w = cloneWorld(); node(w, 'handoff').look = function () { return '计数达到 10。'; }; var seen = node(w, 'handoff').look({ count: 10 }), unseen = node(w, 'handoff').look({ count: 0 }); ok(!(/计数达到 10/.test(seen) && /还没有达到/.test(unseen) && seen !== unseen), 'M5 正式scene固定真分支文案会被双状态依赖牙打红'); })();

console.log('minimal-journey: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
