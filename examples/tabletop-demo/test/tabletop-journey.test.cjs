'use strict';
/* Tabletop R·02 正式旅程：真实 world/core/module，锁资源准备、无准备 fail→partial、pending 读档与 fresh reset。 */
var path = require('path');

var ROOT = path.join(__dirname, '..');
var ENGINE = path.join(ROOT, '..', '..');
var WORLD_PATH = path.join(ROOT, 'world.js');
var CORE = require(path.join(ENGINE, 'core', 'runtime', 'engine-core.js'));
var TABLETOP = require(path.join(ENGINE, 'modules', 'tabletop', 'runtime', 'tabletop.js'));
var WORLD = require(WORLD_PATH);
var EXPECTED_SEED = 20260531;
var SHEET = { name: '醒转者', skills: { 体魄: 1, 感知: 2, 交涉: 1 }, resources: { 状态: 3 } };
var pass = 0, fail = 0;

function ok(cond, msg, detail) {
  if (cond) pass++;
  else { fail++; console.log('  FAIL ' + msg + (detail ? ' -> ' + detail : '')); }
}
function cloneWorld() {
  delete require.cache[require.resolve(WORLD_PATH)];
  return require(WORLD_PATH);
}
function node(world, id) { return world.maps.station.nodes[id]; }
function action(snap, matcher) {
  return (snap.actions || []).filter(function (item) {
    return typeof matcher === 'string' ? item.id === matcher : matcher.test(item.label || '');
  })[0];
}
function line(snap, type) {
  return (snap.view.body || []).filter(function (item) { return item.type === type; })[0];
}
function status(snap, label) {
  var item = (snap.view.status || []).filter(function (bit) { return bit.label === label; })[0];
  return item && item.value;
}
function makeEngine(world) {
  var e = CORE.createEngine(world, { storage: null });
  e.use(TABLETOP.createTabletopModule({ sheet: SHEET }));
  e.start();
  return e;
}
function formalIssues(world) {
  var issues = [];
  var ids = Object.keys(world.maps.station.nodes);
  var bay = node(world, 'bay'), gate = node(world, 'gate'), core = node(world, 'core');
  var scan = bay && bay.checks && bay.checks[0];
  var force = gate && gate.checks && gate.checks[0];
  var talk = core && core.checks && core.checks[0];
  var prepared = { flags: { scanned: true, knows: true }, sheet: { resources: { 状态: 2 } } };
  var scannedFail = { flags: { scanned: true }, sheet: { resources: { 状态: 2 } } };
  var alarmed = { flags: { gateResolved: true, alarmed: true }, sheet: { resources: { 状态: 3 } } };
  var quiet = { flags: { gateResolved: true, gateOpen: true }, sheet: { resources: { 状态: 2 } } };
  if (world.seed !== EXPECTED_SEED) issues.push('seed');
  if (world.start.map !== 'station' || world.start.node !== 'bay' || ids.join(',') !== 'bay,gate,core,ending-peace,ending-force') issues.push('graph');
  if (!scan || scan.id !== 'scan' || scan.dc !== 6 || scan.dice !== '2d6' || !scan.cost || scan.cost.res !== '状态' || scan.cost.amount !== 1 || typeof scan.available !== 'function' || scan.available(prepared) !== false || scan.available(scannedFail) !== false || !scan.success || !scan.success.set || scan.success.set.scanned !== true || scan.success.set.knows !== true || !scan.fail || !scan.fail.set || scan.fail.set.scanned !== true) issues.push('scan');
  if (!force || force.id !== 'force' || force.dc !== 9 || !force.cost || force.cost.res !== '状态' || force.cost.amount !== 0 || typeof force.advantage !== 'function' || force.advantage(prepared) !== true || force.advantage(alarmed) !== false || typeof force.available !== 'function' || force.available(alarmed) !== false || !force.success || force.success.to !== 'core' || !force.success.set || force.success.set.gateResolved !== true || force.success.set.gateOpen !== true || !force.fail || force.fail.to !== 'core' || !force.fail.set || force.fail.set.gateResolved !== true || force.fail.set.alarmed !== true) issues.push('force');
  if (!talk || talk.id !== 'talk' || typeof talk.dc !== 'function' || talk.dc(quiet) !== 8 || talk.dc(alarmed) !== 11 || typeof talk.bonus !== 'function' || talk.bonus(quiet) !== 0 || talk.bonus(alarmed) !== 1 || talk.partialBand !== 1 || !talk.cost || talk.cost.res !== '状态' || talk.cost.amount !== 0 || typeof talk.available !== 'function' || !talk.success || talk.success.to !== 'ending-peace' || !talk.success.set || talk.success.set.aiTrusted !== true || !talk.partial || talk.partial.to !== 'ending-force' || !talk.partial.set || talk.partial.set.emergencyOverride !== true || !talk.fail || talk.fail.to !== 'ending-force') issues.push('talk');
  if (typeof gate.look !== 'function' || !/警报/.test(gate.look(alarmed)) || !/悄无声息|安静/.test(gate.look(quiet))) issues.push('gate-read');
  if (typeof core.look !== 'function' || !/授权|信任|确认/.test(core.look({ flags: { aiTrusted: true }, sheet: { resources: { 状态: 2 } } })) || !/接管|强行|应急/.test(core.look({ flags: { emergencyOverride: true }, sheet: { resources: { 状态: 3 } } }))) issues.push('core-read');
  if (!node(world, 'ending-peace') || !node(world, 'ending-force') || node(world, 'ending-peace').exits || node(world, 'ending-force').exits) issues.push('endings');
  return issues;
}
function enterGate(e) { e.apply(action(e.view(), /走向坍缩的气闸/)); }
function continueFrom(snap, e) { var next = action(snap, '__tt_continue'); e.apply(next); }

console.log('Tabletop R·02 consequence/resource 正式旅程');

ok(formalIssues(WORLD).length === 0, 'F0 正式 world 命中 R·02 consequence/resource projection', formalIssues(WORLD).join(','));
ok(WORLD.seed === EXPECTED_SEED, 'F1 正式 seed=20260531');
ok(Object.keys(WORLD.maps.station.nodes).filter(function (id) { return node(WORLD, id).kind === 'encounter'; }).length === 5, 'F2 五节点均由唯一正式 encounter reference 消费');
ok(SHEET.skills.体魄 === 1 && SHEET.skills.感知 === 2 && SHEET.skills.交涉 === 1 && SHEET.resources.状态 === 3, 'F3 正式角色卡三技能与状态3');
ok(/消耗\s*1\s*点状态/.test(String(node(WORLD, 'bay').look)), 'F4 bay 点击前公开说明 scan 赌注');
ok(!node(WORLD, 'gate').checks[0].crit && !node(WORLD, 'gate').checks[0].fumble && !/quietEntry/.test(JSON.stringify(WORLD)), 'F5 R·02 不冒充固定trace不可达的专门极值旅程');

(function preparedJourney() {
  var e = makeEngine(WORLD);
  var bay = e.view();
  ok(bay.pos.node === 'bay' && status(bay, '状态') === '3' && !!action(bay, 'scan'), 'J1 起点公开状态3且scan可点');
  e.apply(action(bay, 'scan'));
  var scan = e.view();
  ok(status(scan, '状态') === '2' && /2d6\(7\)\+2 = 9 ≥ DC 6.*成功/.test(line(scan, 'check').text), 'J2 正式seed scan=7+2成功，状态3→2', line(scan, 'check') && line(scan, 'check').text);
  ok(/状态\s*[−-]1/.test(line(scan, 'outcome').text) && e.state.flags.scanned === true && e.state.flags.knows === true && !action(scan, 'scan'), 'J3 scan公开回执、durable准备事实且不可重刷');

  enterGate(e);
  var gate = e.view(), force = action(gate, 'force');
  ok(gate.pos.node === 'gate' && force && force.adv === 'adv' && /DC 9/.test(force.label), 'J4 花资源所得knows在force按钮预显优势');
  e.apply(force);
  var forced = e.view();
  ok(/2d6\(8\)\+1 = 9 ≥ DC 9 \(优势\).*成功/.test(line(forced, 'check').text) && e.state.flags.gateOpen === true && e.state.flags.gateResolved === true && e.state.clock.t === 1, 'J5 优势逐抽4,4,4留高二=8，成功后果与clock+1', line(forced, 'check') && line(forced, 'check').text);
  ok(forced.view.suppressExits === true && forced.actions.length === 1 && action(forced, '__tt_continue') && !action(forced, /退回醒转舱/), 'J6 gate结果帧只剩Continue，旁路exit被抑制');

  var gateBlob = e.serialize(), gateRng = e.state.rngSeed;
  var restoredGate = makeEngine(cloneWorld());
  ok(restoredGate.load(gateBlob) === true, 'J7 pending gate结果档可加载到新engine');
  var gateLoaded = restoredGate.view();
  ok(restoredGate.state.rngSeed === gateRng && status(gateLoaded, '状态') === '2' && restoredGate.state.clock.t === 1 && restoredGate.state._ttPending === 'core', 'J8 pending load保资源/clock/RNG/目的地');
  ok(!line(gateLoaded, 'check') && !line(gateLoaded, 'outcome') && /安静|悄无声息/.test(line(gateLoaded, 'prose').text) && gateLoaded.actions.length === 1 && action(gateLoaded, '__tt_continue'), 'J9 瞬时结果不复放，durable gate consequence在源prose回显且只Continue');
  continueFrom(gateLoaded, restoredGate);

  var core = restoredGate.view(), talk = action(core, 'talk');
  ok(core.pos.node === 'core' && talk && /DC 8/.test(talk.label) && /灯塔/.test(line(core, 'prose').text), 'J10 quiet prepared进入core，talk动态DC8');
  restoredGate.apply(action(core, /退回气闸/));
  var revisitedGate = restoredGate.view();
  ok(revisitedGate.pos.node === 'gate' && !action(revisitedGate, 'force') && !!action(revisitedGate, /穿过已经打开的气闸/), 'J10a gateResolved重访不重掷，保留已打开的前进路');
  restoredGate.apply(action(revisitedGate, /穿过已经打开的气闸/));
  core = restoredGate.view(); talk = action(core, 'talk');
  restoredGate.apply(talk);
  var talked = restoredGate.view();
  ok(/2d6\(7\)\+1 = 8 ≥ DC 8.*成功/.test(line(talked, 'check').text) && restoredGate.state.flags.aiTrusted === true && restoredGate.state.clock.t === 1, 'J11 talk逐抽1+6成功并置aiTrusted', line(talked, 'check') && line(talked, 'check').text);
  ok(talked.view.suppressExits === true && talked.actions.length === 1 && action(talked, '__tt_continue'), 'J12 talk结果帧只剩Continue');

  var talkBlob = restoredGate.serialize(), talkRng = restoredGate.state.rngSeed;
  var restoredTalk = makeEngine(cloneWorld());
  ok(restoredTalk.load(talkBlob) === true, 'J13 pending talk结果档可加载到新engine');
  var talkLoaded = restoredTalk.view();
  ok(restoredTalk.state.rngSeed === talkRng && !line(talkLoaded, 'check') && !line(talkLoaded, 'outcome') && /授权|信任|确认/.test(line(talkLoaded, 'prose').text) && talkLoaded.actions.length === 1 && action(talkLoaded, '__tt_continue'), 'J14 talk瞬时帧不复放，durable success在core prose回显且不重掷');
  continueFrom(talkLoaded, restoredTalk);
  ok(restoredTalk.state.pos.node === 'ending-peace' && /唤醒了灯塔/.test(restoredTalk.view().view.body[0].text), 'J15 标准Continue进入和平终局');
})();

(function unpreparedJourney() {
  var e = makeEngine(cloneWorld());
  enterGate(e);
  var gate = e.view(), force = action(gate, 'force');
  ok(force && !force.adv && /DC 9/.test(force.label) && status(gate, '状态') === '3', 'J16 跳过scan保留状态3且force无优势');
  e.apply(force);
  var failed = e.view();
  ok(/2d6\(7\)\+1 = 8 < DC 9.*失败/.test(line(failed, 'check').text) && e.state.flags.alarmed === true && e.state.flags.gateResolved === true && e.state.clock.t === 2, 'J17 无准备force=8失败，警报后果与clock+2', line(failed, 'check') && line(failed, 'check').text);
  ok(/警报/.test(line(failed, 'prose').text) && failed.actions.length === 1 && action(failed, '__tt_continue'), 'J18 fail durable consequence当帧进入gate prose且只Continue');
  continueFrom(failed, e);

  var core = e.view(), talk = action(core, 'talk');
  ok(talk && /DC 11/.test(talk.label) && status(core, '状态') === '3' && /警报/.test(line(core, 'prose').text), 'J19 alarmed进入core，talk动态DC11且保留资源');
  e.apply(talk);
  var partial = e.view();
  ok(/2d6\(8\)\+2 = 10 < DC 11.*部分成功/.test(line(partial, 'check').text) && e.state.flags.emergencyOverride === true && e.state.clock.t === 3, 'J20 资源bonus使10落band1部分成功，clock累计3', line(partial, 'check') && line(partial, 'check').text);
  ok(/接管|强行|应急/.test(line(partial, 'prose').text) && partial.actions.length === 1 && action(partial, '__tt_continue'), 'J21 partial durable consequence在core prose回显且只Continue');
  continueFrom(partial, e);
  ok(e.state.pos.node === 'ending-force' && /夺回了灯塔/.test(e.view().view.body[0].text), 'J22 标准Continue进入强行接管终局');

  e.reset();
  var fresh = e.view();
  ok(fresh.pos.node === 'bay' && e.state.clock.t === 0 && e.state.rngSeed === EXPECTED_SEED && status(fresh, '状态') === '3' && Object.keys(e.state.flags).length === 0, 'J23 reset恢复正式seed/资源/clock/flags/起点');
  enterGate(e); e.apply(action(e.view(), 'force'));
  ok(/2d6\(7\)\+1 = 8 < DC 9.*失败/.test(line(e.view(), 'check').text), 'J24 reset后同公开选择复现同一force结果');
})();

console.log('反向变异');
(function () { var w = cloneWorld(); delete w.seed; ok(formalIssues(w).indexOf('seed') >= 0, 'M1 删除seed打红'); })();
(function () { var w = cloneWorld(); node(w, 'bay').checks[0].cost.amount = 0; ok(formalIssues(w).indexOf('scan') >= 0, 'M2 scan cost改0打红'); })();
(function () { var w = cloneWorld(); node(w, 'bay').checks[0].cost.res = '状况'; ok(formalIssues(w).indexOf('scan') >= 0, 'M3 scan资源名漂移打红'); })();
(function () { var w = cloneWorld(); delete node(w, 'bay').checks[0].available; ok(formalIssues(w).indexOf('scan') >= 0, 'M4 删除scan一次性门控打红'); })();
(function () { var w = cloneWorld(); node(w, 'bay').checks[0].available = function (S) { return !S.flags.knows; }; ok(formalIssues(w).indexOf('scan') >= 0, 'M4a scan门控只认成功knows、失败后可重刷会打红'); })();
(function () { var w = cloneWorld(); node(w, 'gate').checks[0].advantage = function () { return false; }; ok(formalIssues(w).indexOf('force') >= 0, 'M5 knows不再给优势打红'); })();
(function () { var w = cloneWorld(); node(w, 'gate').checks[0].dc = 8; ok(formalIssues(w).indexOf('force') >= 0, 'M6 force DC漂移打红'); })();
(function () { var w = cloneWorld(); node(w, 'gate').checks[0].fail = { text: '坏变异', to: 'core' }; ok(formalIssues(w).indexOf('force') >= 0, 'M7 删除gate失败后果打红'); })();
(function () { var w = cloneWorld(); node(w, 'core').checks[0].dc = function () { return 8; }; ok(formalIssues(w).indexOf('talk') >= 0, 'M8 alarmed不再改变talk DC打红'); })();
(function () { var w = cloneWorld(); node(w, 'core').checks[0].bonus = function () { return 0; }; ok(formalIssues(w).indexOf('talk') >= 0, 'M9 删除剩余资源bonus打红'); })();
(function () { var w = cloneWorld(); node(w, 'core').checks[0].partialBand = 2; ok(formalIssues(w).indexOf('talk') >= 0, 'M10 partialBand漂移打红'); })();
(function () { var w = cloneWorld(); node(w, 'core').checks[0].cost.amount = 1; ok(formalIssues(w).indexOf('talk') >= 0, 'M10a 必经talk从免费漂移为收费会打红'); })();
(function () { var w = cloneWorld(); delete node(w, 'core').checks[0].partial; ok(formalIssues(w).indexOf('talk') >= 0, 'M11 删除partial打红'); })();
(function () { var w = cloneWorld(); node(w, 'core').look = '静态堆芯。'; ok(formalIssues(w).indexOf('core-read') >= 0, 'M12 consequence只写不读打红'); })();

console.log('tabletop-journey: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
