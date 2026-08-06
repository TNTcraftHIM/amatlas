'use strict';
/* Cutscene R·03 正式旅程：真实 world/core/modules，锁高层 compiler wiring、末拍门控、shore 回接与 load/reset。 */
var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var ENGINE = path.join(ROOT, '..', '..');
var WORLD_PATH = path.join(ROOT, 'world.js');
var CORE = require(path.join(ENGINE, 'core', 'runtime', 'engine-core.js'));
var TEXT = require(path.join(ENGINE, 'modules', 'text-adventure', 'runtime', 'renderer.js'));
var CUTSCENE = require(path.join(ENGINE, 'modules', 'cutscene', 'runtime', 'cutscene.js'));
var WORLD = require(WORLD_PATH);
var pass = 0, fail = 0;
var rafQueue = {}, nextRaf = 1, now = 0;

function ok(cond, msg, detail) {
  if (cond) pass++;
  else { fail++; console.log('  FAIL ' + msg + (detail ? ' -> ' + detail : '')); }
}
function cloneWorld() { delete require.cache[require.resolve(WORLD_PATH)]; return require(WORLD_PATH); }
function node(world, id) { return world.maps.coast.nodes[id]; }
function action(snap, matcher) {
  return (snap.actions || []).filter(function (item) {
    return typeof matcher === 'string' ? item.id === matcher : matcher.test(item.label || '');
  })[0];
}
function bodyText(snap) { return (snap.view.body || []).map(function (line) { return line.text || ''; }).join('\n'); }
function authoredText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.join('\n');
  if (typeof value === 'object' && Array.isArray(value.lines)) return value.lines.map(function (line) { return line.chunks.map(function (chunk) { return chunk.text; }).join(''); }).join('\n');
  return String(value);
}
function installRaf() {
  rafQueue = {}; nextRaf = 1; now = 0;
  global.requestAnimationFrame = function (fn) { var id = nextRaf++; rafQueue[id] = fn; return id; };
  global.cancelAnimationFrame = function (id) { delete rafQueue[id]; };
}
function pumpOne(ms) {
  var ids = Object.keys(rafQueue); if (!ids.length) return false;
  var id = Number(ids[0]), fn = rafQueue[id]; delete rafQueue[id]; now += ms == null ? 250 : ms; fn(now); return true;
}
function pumpUntil(e, pattern, limit) {
  for (var i = 0; i < (limit || 300); i++) {
    if (pattern.test(bodyText(e.view()))) return true;
    if (!pumpOne(250)) break;
  }
  return pattern.test(bodyText(e.view()));
}
function makeEngine(world) {
  installRaf();
  var e = CORE.createEngine(world, { storage: null });
  e.use(TEXT.createTextAdventureModule());
  e.use(CUTSCENE.createCutsceneModule());
  e.start();
  return e;
}
function introBeatsExpression(source) {
  var start = source.indexOf('intro: {');
  var beats = start >= 0 ? source.indexOf('beats:', start) : -1;
  if (beats < 0) return '';
  var value = source.indexOf('[', beats), depth = 0, quote = '', escape = false;
  for (var i = value; i < source.length; i++) {
    var ch = source.charAt(i);
    if (quote) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') {
      depth--;
      if (depth === 0) {
        var next = i + 1;
        while (/\s/.test(source.charAt(next))) next++;
        if (source.slice(next, next + 7) === '.concat') continue;
        return source.slice(value, i + 1);
      }
    }
  }
  return '';
}
function formalIssues(world, source) {
  var issues = [], intro = node(world, 'intro'), shore = node(world, 'shore'), beats = intro && intro.beats || [], links = intro && intro.links || [];
  var b3 = beats[3], b4 = beats[4], last = beats[beats.length - 1], introSource = introBeatsExpression(source);
  if (!/var INTRO_PERFORMANCE\s*=\s*CutsceneAuthoring\.compilePerformance\s*\(/.test(source) || !/\.concat\s*\(\s*INTRO_PERFORMANCE\.beats\s*,\s*\[/.test(introSource)) issues.push('wiring');
  if (beats.length !== 7 || !b3 || !b4 || !Array.isArray(b3.cast) || b3.cast.length !== 1 || b3.cast[0].id !== 'warden' || !b3.cast[0].rig || !Array.isArray(b3.cast[0].rig.tracks) || !b3.cast[0].rig.tracks.length || !/守灯人沿退潮线/.test(authoredText(b3.text))) issues.push('compiled-walk');
  if (!Array.isArray(b4.cast) || b4.cast.length !== 1 || b4.cast[0].id !== 'warden' || b4.speaker !== 'warden' || !/第三次回潮前/.test(authoredText(b4.text))) issues.push('compiled-say');
  if (!last || last.hold !== true || typeof last.run !== 'function') issues.push('last');
  if (links.length !== 2 || links[0].label !== '踏上沙滩' || links[0].to !== 'shore' || links[1].label !== '重看序章' || links[1].to !== 'intro') issues.push('links');
  var shoreSeen = shore && typeof shore.look === 'function' ? shore.look({ flags: { intro_seen: true } }, true) : '';
  var shoreUnseen = shore && typeof shore.look === 'function' ? shore.look({ flags: {} }, true) : '';
  if (!shore || shore.kind !== 'scene' || typeof shore.look !== 'function' || !/刚才那道白光/.test(shoreSeen) || shoreSeen === shoreUnseen || !/雾压着海岸/.test(shoreUnseen) || !(shore.links || []).some(function (link) { return link.id === 'read_tide' && typeof link.run === 'function'; })) issues.push('shore');
  return issues;
}
function advanceToLast(e) {
  var intro = node(e.world, 'intro');
  for (var i = 0; i < intro.beats.length - 1; i++) {
    var snap = e.view(), next = action(snap, 'cutscene:next');
    if (!next) return false;
    e.apply(next);
  }
  return true;
}

console.log('Cutscene R·03 高层作者与玩家正式旅程');
var source = fs.readFileSync(WORLD_PATH, 'utf8');
ok(formalIssues(WORLD, source).length === 0, 'F0 正式 world 命中 compiler wiring/compiled beats/末拍/shore projection', formalIssues(WORLD, source).join(','));
ok(node(WORLD, 'intro').beats.length === 7 && node(WORLD, 'intro').beats[3].cast[0].id === 'warden' && node(WORLD, 'intro').beats[4].speaker === 'warden', 'F1 高层lowering精确占intro #3/#4');
ok(/\.concat\s*\(\s*INTRO_PERFORMANCE\.beats/.test(introBeatsExpression(source)), 'F2 compilePerformance结果直接接入正式intro，不是无用compile调用');
var shoreSeen = node(WORLD, 'shore').look({ flags: { intro_seen: true } }, true);
var shoreUnseen = node(WORLD, 'shore').look({ flags: {} }, true);
ok(node(WORLD, 'shore').kind === 'scene' && /刚才那道白光/.test(shoreSeen) && /雾压着海岸/.test(shoreUnseen) && shoreSeen !== shoreUnseen, 'F3 shore是读取intro_seen的普通scene');

(function skipJourney() {
  var e = makeEngine(WORLD), beats = node(WORLD, 'intro').beats;
  for (var i = 0; i < beats.length; i++) {
    var snap = e.view();
    ok(bodyText(snap) === authoredText(beats[i].text), 'J' + (i + 1) + ' 逐拍快进公开正文对齐正式beat #' + i, bodyText(snap));
    if (i < beats.length - 1) {
      ok(snap.actions.length === 1 && action(snap, 'cutscene:next') && !action(snap, /踏上沙滩/), 'J' + (i + 1) + 'a 末拍前只有runtime next，不提前暴露作者出口');
      e.apply(action(snap, 'cutscene:next'));
    }
  }
  var last = e.view();
  ok(e.state.flags.intro_seen === true && action(last, /踏上沙滩/) && action(last, /重看序章/) && action(last, 'cutscene:next'), 'J8 进入末拍置intro_seen并首次开放两个作者links');

  var saved = e.serialize();
  var restored = makeEngine(cloneWorld());
  var loaded = restored.load(saved), restoredSnap = restored.view(), restoredExpected = authoredText(node(restored.world, 'intro').beats[0].text);
  ok(loaded === true && bodyText(restoredSnap) === restoredExpected, 'J9 同节点load按现役签字从beat0重播，不恢复末拍游标', JSON.stringify({ loaded: loaded, actual: bodyText(restoredSnap), expected: restoredExpected }));
  ok(restored.state.flags.intro_seen === true && restored.state._cutscene && restored.state._cutscene.ran['coast/intro#6'] === 1, 'J10 load保durable intro_seen/beat run账本，不重复副作用');

  e.apply(action(last, /踏上沙滩/));
  var shore = e.view();
  ok(shore.pos.node === 'shore' && shore.nodeKind === 'scene' && !action(shore, 'cutscene:next') && /刚才那道白光/.test(bodyText(shore)), 'J11 末拍作者link经core进入普通shore scene，公开动作面无runtime next');
  var read = action(shore, /读潮线刻痕/);
  ok(!!read && action(shore, /走向发蓝光的潮池/), 'J12 shore普通调查动作与移动出口均可见');
  e.apply(read);
  var investigated = e.view();
  ok(e.state.flags.tide_mark === true && e.state.inventory.indexOf('潮线刻度') >= 0 && /潮汐表/.test(bodyText(investigated)), 'J13 普通scene动作标准apply写durable调查并显示回应');

  e.reset();
  var fresh = e.view();
  var freshExpected = authoredText(node(e.world, 'intro').beats[0].text);
  ok(fresh.pos.node === 'intro' && fresh.nodeKind === 'cutscene' && !e.state.flags.intro_seen && !e.state.flags.tide_mark && e.state.inventory.length === 0 && bodyText(fresh) === freshExpected, 'J14 reset回fresh intro并清调查/末拍状态', JSON.stringify({ actual: bodyText(fresh), expected: freshExpected }));
})();

(function naturalJourney() {
  var fast = makeEngine(cloneWorld());
  advanceToLast(fast);
  var e = makeEngine(cloneWorld());
  ok(pumpUntil(e, /光停在你脚边/, 300), 'J15 真rAF自然推进到正式末拍');
  var snap = e.view();
  var fastDurable = JSON.stringify({ flags: fast.state.flags, inventory: fast.state.inventory, ran: fast.state._cutscene && fast.state._cutscene.ran });
  var naturalDurable = JSON.stringify({ flags: e.state.flags, inventory: e.state.inventory, ran: e.state._cutscene && e.state._cutscene.ran });
  ok(e.state.flags.intro_seen === true && action(snap, /踏上沙滩/) && action(snap, /重看序章/) && naturalDurable === fastDurable, 'J16 自然推进与逐拍快进的durable flags/inventory/run账本一致', JSON.stringify({ fast: fastDurable, natural: naturalDurable }));
})();

console.log('反向变异');
(function () { var mutated = source.replace(/\.concat\s*\(\s*INTRO_PERFORMANCE\.beats\s*,/, '.concat([{dur:1,text:"clone"}],').replace(/\n\s*links:\s*\[/, '\n            _dead: [].concat(INTRO_PERFORMANCE.beats, []),\n            links: ['); ok(formalIssues(WORLD, mutated).indexOf('wiring') >= 0, 'M1 正式beats断线后即使intro内另留dead concat也会打红'); })();
(function () { var w = cloneWorld(); w.maps.coast.nodes.intro.beats.splice(3, 2); ok(formalIssues(w, source).some(function (x) { return /compiled/.test(x); }), 'M2 删除compiled beats会打红'); })();
(function () { var w = cloneWorld(); var beats = node(w, 'intro').beats, t = beats[3]; beats[3] = beats[4]; beats[4] = t; ok(formalIssues(w, source).some(function (x) { return /compiled/.test(x); }), 'M3 调换compiled beats会打红'); })();
(function () { var w = cloneWorld(); node(w, 'intro').beats[node(w, 'intro').beats.length - 1].run = null; ok(formalIssues(w, source).indexOf('last') >= 0, 'M4 删除末拍intro_seen run会打红'); })();
(function () { var w = cloneWorld(); node(w, 'intro').links[0].to = 'intro'; ok(formalIssues(w, source).indexOf('links') >= 0, 'M5 踏上沙滩改self-loop会打红'); })();
(function () { var w = cloneWorld(); node(w, 'shore').kind = 'cutscene'; ok(formalIssues(w, source).indexOf('shore') >= 0, 'M6 shore不再是普通scene会打红'); })();
(function () { var w = cloneWorld(); node(w, 'shore').look = function () { return '刚才那道白光还残在黑沙上。'; }; ok(formalIssues(w, source).indexOf('shore') >= 0, 'M7 shore保留真分支文案但不再读取intro_seen也会打红'); })();

console.log('cutscene-journey: ' + pass + ' 通过, ' + fail + ' 失败');
delete global.requestAnimationFrame; delete global.cancelAnimationFrame;
process.exit(fail ? 1 : 0);
