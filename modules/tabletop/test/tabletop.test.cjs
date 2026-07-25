/* ════════════════════════════════════════════════════════════════════════
   跑团模块验证(纯 node,无需 jsdom;随 test/run.cjs)。
   核心命题(S9):一个**不同类型**的模块,**核心零改**、经**统一 use** 插上即可工作;
   检定确定性(随档复现)、角色卡随档、scene/audio 意图随检定正确产出且为"帧产物"。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
var Amatlas = require('../../../core/runtime/engine-core.js');
var TT = require('../runtime/tabletop.js');
var TA = require('../../text-adventure/runtime/renderer.js');   // M2 盲区回归:测 encounter→scene 跨模块路径

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name); pass++; }
  else { console.log('  X   ' + name + (detail ? '  → ' + detail : '')); fail++; }
}

// ── 测试世界:废弃飞船(2 节点),气闸上挂 3 个检定(真实 force + 受控 easy/hard 便于断言成/败分支)──
function makeWorld() {
  return {
    seed: 12345,
    id: '16161616-1616-4616-8616-161616161616', start: { map: 'ship', node: 'airlock' },
    maps: {
      ship: {
        name: '废弃飞船',
        nodes: {
          airlock: {
            kind: 'encounter', title: '坍缩的气闸', look: '一道变形的舱门挡住去路。',
            scene: { region: 'room', mood: 'tense' }, audio: { bgm: 'theme-tense' },
            checks: [
              { id: 'force', label: '撬开舱门(体魄 DC 8)', skill: '体魄', dc: 8, dice: '2d6',
                cost: { res: '状态', amount: 1 },
                success: { text: '金属呻吟着让开。', flag: 'doorOpen', clock: 1 },
                fail: { text: '纹丝不动。', clock: 1 } },
              { id: 'easy', label: '轻推(必成 DC 2)', skill: '体魄', dc: 2, dice: '2d6',
                cost: { res: '状态', amount: 1 },
                success: { text: '轻松搞定。', flag: 'easyOk', clock: 1 } },
              { id: 'hard', label: '蛮力(必败 DC 99)', skill: '体魄', dc: 99, dice: '2d6',
                cost: { res: '状态', amount: 1 },
                fail: { text: '徒劳。' } }
            ],
            exits: [ { to: 'corridor', label: '穿过舱门', available: function (s) { return !!s.flags.doorOpen; } } ]
          },
          corridor: {
            kind: 'encounter', title: '渗水的走廊', look: '通道尽头有微光。',
            scene: { region: 'cave', mood: 'eerie' },
            exits: [ { to: 'airlock', label: '返回气闸' } ]
          }
        }
      }
    }
  };
}
function mkEngine(seed) {
  var w = makeWorld(); if (seed != null) w.seed = seed;
  var e = Amatlas.createEngine(w, {});           // 无 storage、无 presenter → 纯逻辑;view() 是观察窗口
  e.use(TT.createTabletopModule({ sheet: { name: '测试员', skills: { 体魄: 1, 感知: 2 }, resources: { 状态: 3 } } }));
  e.start();
  return e;
}
function findAct(e, id) { var a = e.view().actions.filter(function (x) { return x.id === id; }); return a[0]; }

console.log('tabletop 验证');

/* A. 统一 use 注册 + dispatch 到新 kind ───────────────────────────────── */
var mod = TT.createTabletopModule({ sheet: { skills: { 体魄: 1 }, resources: { 状态: 3 } } });
ok('A1 createTabletopModule 返回 use-able 模块(带 install)', typeof mod.install === 'function');
ok('A2 返回的即模块对象,kind=encounter', mod.id === 'tabletop' && mod.nodeKinds[0] === 'encounter');
var e0 = mkEngine();
var v0 = e0.view();
ok('A3 经 use 插上后 encounter 节点可渲染(核心零改、统一入口)', v0.view.title === '坍缩的气闸' && Array.isArray(v0.view.body));
ok('A4 起点 body 含散文', v0.view.body.some(function (b) { return b.type === 'prose' && /变形的舱门/.test(b.text); }));

/* B. 角色卡 = 组件,随 state(随档)───────────────────────────────────── */
ok('B1 start 后 state.sheet 已就位(systems on:enter 懒初始化)', !!(e0.state.sheet && e0.state.sheet.resources));
ok('B2 状态条含资源 + 回合 + 技能', (function () {
  var labels = v0.view.status.map(function (s) { return s.label; });
  return labels.indexOf('状态') >= 0 && labels.indexOf('回合') >= 0 && labels.indexOf('体魄') >= 0;
})());

/* C. 检定确定性(同种子逐抽复现)──────────────────────────────────────── */
function rollForce(seed) { var e = mkEngine(seed); var cap = null; e.on('check', function (p) { cap = p; }); e.apply(findAct(e, 'force')); return cap; }
var r1 = rollForce(777), r2 = rollForce(777);
ok('C1 检定经 emit("check") 广播结果', r1 && typeof r1.roll === 'number' && typeof r1.ok === 'boolean');
ok('C2 同种子 → 检定逐抽复现(roll/total/ok 全同)', r1.roll === r2.roll && r1.total === r2.total && r1.ok === r2.ok, JSON.stringify(r1) + ' vs ' + JSON.stringify(r2));
ok('C3 total = roll + 技能调整(体魄+1)', r1.total === r1.roll + 1 && r1.mod === 1);
var rA = rollForce(1), rB = rollForce(2);
ok('C4 不同种子 → 一般产生不同骰(非定值)', !(rA.roll === rB.roll && rA.total === rB.total) || rA.roll !== rB.roll, 'seed1=' + rA.roll + ' seed2=' + rB.roll);

/* D. 成功/失败分支后果(受控 DC)────────────────────────────────────────── */
var eW = mkEngine(); var res0 = eW.state.sheet.resources.状态; eW.apply(findAct(eW, 'easy'));
ok('D1 必成检定 → 置 flag', eW.state.flags.easyOk === true);
ok('D2 成功后果推进时钟(clock+1)', eW.state.clock.t === 1, 't=' + eW.state.clock.t);
ok('D3 尝试消耗资源(状态 -1)', eW.state.sheet.resources.状态 === res0 - 1);
var eL = mkEngine(); eL.apply(findAct(eL, 'hard'));
ok('D4 必败检定 → 不置成功 flag', !eL.state.flags.doorOpen && !eL.state.flags.easyOk);
ok('D5 失败也消耗资源', eL.state.sheet.resources.状态 === 2);

/* E. scene/audio 意图随检定产出,且是"帧产物"(读后即清,不复放)──────────── */
var eS = mkEngine(); eS.apply(findAct(eS, 'easy'));
var vAfter = eS.view();                                   // 第一次 view 消费 lastCheck
ok('E1 检定当帧 scene 含 dice 元素(ref=骰值)', !!(vAfter.view.scene && vAfter.view.scene.elements && vAfter.view.scene.elements.some(function (el) { return el.kind === 'dice'; })));
ok('E2 dice 元素带四态 state(success/fail/crit/fumble;v7)', (function () { var d = vAfter.view.scene.elements.filter(function (e) { return e.kind === 'dice'; })[0]; return ['success', 'fail', 'crit', 'fumble'].indexOf(d.state) >= 0; })());
ok('E3 检定当帧 audio.sfx 含 dice-roll + 成/败音', !!(vAfter.view.audio && vAfter.view.audio.sfx && vAfter.view.audio.sfx.indexOf('dice-roll') >= 0 && (vAfter.view.audio.sfx.indexOf('success') >= 0 || vAfter.view.audio.sfx.indexOf('fail') >= 0)));
ok('E4 节点静态意图保留(region=room, bgm=theme-tense)', vAfter.view.scene.region === 'room' && vAfter.view.audio.bgm === 'theme-tense');
var vNext = eS.view();                                    // 第二次 view:lastCheck 已清
ok('E5 帧产物:下一帧无骰子(scene 退回静态)', !(vNext.view.scene.elements && vNext.view.scene.elements.some(function (el) { return el.kind === 'dice'; })));
ok('E6 帧产物:下一帧无 sfx(仅静态 bgm)', !(vNext.view.audio && vNext.view.audio.sfx && vNext.view.audio.sfx.length));

// E7/E8:产生瞬时检定帧后，在该帧 render 前 reset/离开；旧闭包 lastCheck 不得串到新局/新 encounter。
(function () {
  var e = mkEngine();
  e.apply(findAct(e, 'easy')); // apply 内 render 无 presenter，不消费 lastCheck
  e.reset();
  var resetView = e.view();
  ok('E7 检定后未观察就 reset → 新局首个 view 无陈旧 check/dice', !resetView.view.body.some(function (b) { return b.type === 'check'; }) && !(resetView.view.scene.elements || []).some(function (el) { return el.kind === 'dice'; }));

  var e2 = mkEngine();
  e2.apply(findAct(e2, 'easy'));
  e2.enter({ map: 'ship', node: 'corridor' });
  var leaveView = e2.view();
  ok('E8 检定后未观察就离开 → 未交互 encounter 无陈旧 check/dice', !leaveView.view.body.some(function (b) { return b.type === 'check'; }) && !(leaveView.view.scene.elements || []).some(function (el) { return el.kind === 'dice'; }));

  var e3 = mkEngine();
  var beforeCheck = e3.serialize();
  e3.apply(findAct(e3, 'easy'));
  var loaded = e3.load(beforeCheck);
  var restoredView = e3.view();
  ok('E9 同实例同节点 load 旧档 → 恢复帧不串旧 check/dice/sfx', loaded === true &&
    !restoredView.view.body.some(function (b) { return b.type === 'check' || b.type === 'outcome'; }) &&
    !(restoredView.view.scene.elements || []).some(function (el) { return el.kind === 'dice'; }) &&
    !(restoredView.view.audio && (restoredView.view.audio.sfx || []).length));
})();

/* F. 意图非素材:绝不改 world 数据(克隆)──────────────────────────────── */
ok('F1 检定未污染 world 节点的 scene(无 dice 漏进 world)', (function () {
  var n = eS.world.maps.ship.nodes.airlock.scene; return !(n.elements && n.elements.length);
})());

/* G. 资源耗尽挡住重试(available 门控)─────────────────────────────────── */
var eD = mkEngine();
eD.apply(findAct(eD, 'hard')); eD.apply(findAct(eD, 'hard')); eD.apply(findAct(eD, 'hard'));   // 3 次耗光 状态(3→0)
ok('G1 资源=0', eD.state.sheet.resources.状态 === 0);
ok('G2 死局安全网:资源耗尽 + 出口全锁(门未开)→ 检定灰显(locked+lockHint,不留空场景)', (function () { var a = findAct(eD, 'hard'); return !!(a && a.locked === true && /不足/.test(a.lockHint || '')); })());

/* H. 移动走核心 exits + available 门控;成功置 flag 后开门 ────────────────── */
var eM = mkEngine();
ok('H1 开门前 corridor 出口被门控隐藏', !eM.view().actions.some(function (a) { return a.to === 'corridor'; }));
eM.state.flags.doorOpen = true;                            // 模拟 force 成功置 flag
var move = eM.view().actions.filter(function (a) { return a.to === 'corridor'; })[0];
ok('H2 置 doorOpen 后出口出现(核心 defaultMoves 透传 available)', !!move);
eM.apply(move);
ok('H3 apply 移动 → 位置切到 corridor', eM.view().pos.node === 'corridor' && eM.view().view.scene.region === 'cave');

/* I. 存档往返:角色卡 + flags + 时钟 + RNG 累加器 全保 ───────────────────── */
var eP = mkEngine(); eP.apply(findAct(eP, 'easy')); eP.apply(findAct(eP, 'force'));
var blob = eP.serialize();
var eQ = mkEngine(); var loaded = eQ.load(blob);
ok('I1 load 成功', loaded === true);
ok('I2 角色卡资源随档', eQ.state.sheet.resources.状态 === eP.state.sheet.resources.状态);
ok('I3 flags(easyOk)随档', eQ.state.flags.easyOk === eP.state.flags.easyOk);
ok('I4 时钟随档', eQ.state.clock.t === eP.state.clock.t);
ok('I5 RNG 累加器随档(后续检定继续复现)', eQ.state.rngSeed === eP.state.rngSeed);

/* J. fail-loud(design-principles §6b):check.available 写成非函数 → view() 抛,检定门控不再静默旁路 ─── */
(function () {
  function throws(fn) { try { fn(); return false; } catch (e) { return true; } }
  function engCheck(availVal) {
    var w = makeWorld();
    w.maps.ship.nodes.airlock.checks[0].available = availVal;
    var e = Amatlas.createEngine(w, {}); e.use(TT.createTabletopModule({ sheet: { skills: { 体魄: 1 }, resources: { 状态: 3 } } })); e.start();
    return e;
  }
  ok('J1 check.available 写成定值 true → view() 抛(门控不再静默旁路)', throws(function () { engCheck(true).view(); }));
  ok('J2 合法函数 available 不抛(回归)', !throws(function () { engCheck(function () { return true; }).view(); }));
})();

/* K. fail-loud(§6b ⑩):parseDice 非法即抛 / cost.res 拼错 warn / 空后果 warn ─── */
(function () {
  function throws(fn) { try { fn(); return false; } catch (e) { return true; } }
  ok('K1 parseDice 合法 1d20 → {1,20}', (function () { var d = TT.parseDice('1d20'); return d.n === 1 && d.sides === 20; })());
  ok('K2 parseDice 未指定 → 默认 2d6(有意)', (function () { var d = TT.parseDice(); return d.n === 2 && d.sides === 6; })());
  ok('K3 parseDice 非法格式 → 抛(不再静默回退 2d6)', throws(function () { TT.parseDice('1d 20'); }) && throws(function () { TT.parseDice('d6'); }));
  var realWarn = console.warn, warned = [];
  console.warn = function (m) { warned.push(String(m)); };
  try {
    var w = makeWorld();
    w.maps.ship.nodes.airlock.checks = [
      { id: 'badcost', label: '坏资源', skill: '体魄', dc: 2, dice: '2d6', cost: { res: '状況', amount: 1 }, success: { text: 'ok' } },  // res 拼错(状況≠状态)
      { id: 'empty', label: '空后果', skill: '体魄', dc: 2, dice: '2d6' },                                                              // 无 success/fail
      { id: 'badskill', label: '坏技能', skill: '不存在的技能', dc: 2, dice: '2d6', success: { text: 'ok' } }                            // skill 不在 sheet.skills(N1)
    ];
    var e = Amatlas.createEngine(w, {}); e.use(TT.createTabletopModule({ sheet: { skills: { 体魄: 1 }, resources: { 状态: 3 } } })); e.start();
    warned = [];
    e.view();   // 触发 actions() → cost.res / 空后果 warn
    ok('K4 cost.res 不在 resources → warn(资源未扣、可能拼错)', warned.some(function (m) { return /cost\.res/.test(m); }), warned.join(' | '));
    ok('K5 空 success/fail 后果 → warn(无意义检定)', warned.some(function (m) { return /都未定义|无任何后果/.test(m); }), warned.join(' | '));
    ok('K6 skill 不在 sheet.skills → warn(N1,对称 cost.res,弱模型易中/英文混用)', warned.some(function (m) { return /skill .*不在角色卡 skills/.test(m); }), warned.join(' | '));
  } finally { console.warn = realWarn; }
})();

/* L. fail-loud(round7 #2/#3/#4):check 字段别名/错形态 → view() 抛(教正名,只校验形式不碰检定内容)─── */
(function () {
  function throws(fn) { try { fn(); return false; } catch (e) { return true; } }
  function engChecks(checks) {
    var w = makeWorld();
    w.maps.ship.nodes.airlock.checks = checks;
    var e = Amatlas.createEngine(w, {}); e.use(TT.createTabletopModule({ sheet: { skills: { 体魄: 1 }, resources: { 状态: 3 } } })); e.start();
    return e;
  }
  ok('L1 check 用 name 无 label → 抛(按钮文字不再空白)', throws(function () { engChecks([{ id: 'a', name: '撬门', skill: '体魄', dc: 8, dice: '2d6', success: { text: 'ok' } }]).view(); }));
  ok('L2 check 用 onSuccess/onFailure → 抛(后果不再被静默忽略)', throws(function () { engChecks([{ id: 'b', label: '撬门', skill: '体魄', dc: 8, dice: '2d6', onSuccess: function () {} }]).view(); }));
  ok('L3 check.skill 写成函数 → 抛(skill 是技能名字符串)', throws(function () { engChecks([{ id: 'c', label: '撬门', skill: function (s) { return (s.x || 0); }, dc: 8, dice: '2d6', success: { text: 'ok' } }]).view(); }));
  ok('L4 合法 check(label+字符串 skill+success 对象)不抛(回归)', !throws(function () { engChecks([{ id: 'd', label: '撬门', skill: '体魄', dc: 8, dice: '2d6', success: { text: 'ok' } }]).view(); }));
})();

/* M. v6 统一 links/exits(round7 #5):encounter 节点用 links → 经 api.linkActions 产出移动出口 ─────────
   原先 tabletop 只认核心 exits、不认 links → 作者按文字冒险习惯全用 links 时,检定后零出口、soft-lock 卡死。 */
(function () {
  var w = {
    id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'enc' },
    maps: { m: { name: 'M', nodes: {
      enc: { kind: 'encounter', name: '试炼', checks: [{ id: 'c', label: '掷骰', skill: '力量', dc: 8, dice: '2d6', success: { text: 'ok', flag: 'won' } }],
             links: [{ label: '前进', to: 'done' }, { label: '胜门', to: 'win', requires: function (s) { return !!s.flags.won; }, showWhenLocked: true, lockHint: '需检定成功' }] },
      done: { kind: 'encounter', name: '终点', links: [] },
      win: { kind: 'encounter', name: '胜利', links: [] }
    } } }
  };
  var e = Amatlas.createEngine(w, {}); e.use(TT.createTabletopModule({ sheet: { skills: { 力量: 1 }, resources: {} } })); e.start();
  var acts = e.view().actions, lbl = acts.map(function (a) { return a.label + ':' + a.kind + (a.locked ? '(锁)' : ''); }).join(',');
  ok('M1 encounter 用 links → 有移动出口(检定后不再零出口卡死)', acts.some(function (a) { return a.kind === 'move' && a.to === 'done'; }), lbl);
  ok('M2 encounter links 的 requires + showWhenLocked 灰显穿透', acts.some(function (a) { return a.locked && a.label === '胜门'; }), lbl);
  ok('M3 检定与移动出口并存(检定动作仍在)', acts.some(function (a) { return a.kind === 'act' && a.label.indexOf('掷骰') === 0; }), lbl);   // startsWith:引擎自动拼 DC 后缀后检定按钮 label='掷骰(…·DC N)'
})();

// M4-7. 检定按钮 adv 标记(端用户诉求:点检定【前】就在按钮显示优劣势,不止掷骰后结果行)→ actions() 经 advOf 设 act.adv,present-dom 据此渲染徽标
(function () {
  var w = { id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'enc' }, maps: { m: { name: 'M', nodes: {
    enc: { kind: 'encounter', name: '试炼', checks: [
      { id: 'a', label: '优势检定', skill: '力量', dc: 8, dice: '2d6', advantage: true, success: { text: 'ok' }, fail: { text: 'no' } },
      { id: 'd', label: '劣势检定', skill: '力量', dc: 8, dice: '2d6', disadvantage: function () { return true; }, success: { text: 'ok' }, fail: { text: 'no' } },
      { id: 'p', label: '普通检定', skill: '力量', dc: 8, dice: '2d6', success: { text: 'ok' }, fail: { text: 'no' } },
      { id: 'x', label: '抵消检定', skill: '力量', dc: 8, dice: '2d6', advantage: true, disadvantage: true, success: { text: 'ok' }, fail: { text: 'no' } }
    ], links: [] } } } }
  };
  var e = Amatlas.createEngine(w, {}); e.use(TT.createTabletopModule({ sheet: { skills: { 力量: 1 }, resources: {} } })); e.start();
  var acts = e.view().actions;
  function advOf(l) { var a = acts.filter(function (x) { return x.label.indexOf(l) === 0; })[0]; return a ? a.adv : 'NO-ACT'; }   // startsWith:检定按钮 label 带自动 DC 后缀
  ok('M4 优势检定按钮 act.adv="adv"', advOf('优势检定') === 'adv');
  ok('M5 劣势检定(函数形 advantage/disadvantage)按钮 act.adv="dis"', advOf('劣势检定') === 'dis');
  ok('M6 普通检定无 adv 标记(null/undefined)', !advOf('普通检定') && advOf('普通检定') !== 'NO-ACT');
  ok('M7 优劣抵消=原骰、不标 adv', !advOf('抵消检定') && advOf('抵消检定') !== 'NO-ACT');
})();

// M8. wreck_crossing 类软锁修复(showcase round13)+ v18 结果帧 suppressExits:
//   ① v18:检定出结果那帧只剩「继续 →」、旁路 exit(折回)被抑制 → 没法在结果帧撤退绕过 success.to/fail.to
//      (= wreck_crossing 软锁「赢检定后撤退」的成因之一从源头消除)。② :passed 安全网仍保留:正常重访已通过的检定节点,
//      已挣得的前进路 success.to 仍在(不重掷/不重扣)。
(function () {
  var w = { id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'enc' }, maps: { m: { name: 'M', nodes: {
    enc: { kind: 'encounter', name: '渡口', checks: [{ id: 'c', label: '渡河', skill: '力', dc: 2, dice: '2d6', success: { text: '过', flag: 'crossed', to: 'far' }, fail: { text: '冲回', to: 'near' } }], exits: [{ to: 'near', label: '折回' }] },
    far: { kind: 'scene', name: '对岸', look: '到了对岸。', links: [{ label: '回渡口看看', to: 'enc' }] },   // v18:改可回渡口 → 测【正常重访】(不再靠"结果帧撤退",那已被 suppressExits 挡掉)
    near: { kind: 'scene', name: '近岸', look: '回到近岸。', links: [{ label: '再去渡口', to: 'enc' }] }
  } } } };
  var e = Amatlas.createEngine(w, {}); e.use(TT.createTabletopModule({ sheet: { skills: { 力: 1 }, resources: {} } })); e.use(TA.createTextAdventureModule({})); e.start();
  e.apply(e.view().actions.filter(function (a) { return a.id === 'c' && a.kind === 'act'; })[0]);              // 1) 掷渡河(dc2 必过)→ 置 crossed、_ttPending=far(用 id 匹配:label 带自动 DC 后缀)
  var rf = e.view();                                                                            // 结果帧
  ok('M8pre v18:结果帧只剩「继续 →」、旁路 exit「折回」被抑制(suppressExits)',
    rf.view.suppressExits === true && !rf.actions.some(function (a) { return a.label === '折回'; }) && rf.actions.some(function (a) { return a.id === '__tt_continue'; }),
    'suppressExits=' + rf.view.suppressExits + ' acts=' + rf.actions.map(function (a) { return a.label; }).join(','));
  e.apply(rf.actions.filter(function (a) { return a.id === '__tt_continue'; })[0]);             // 2) 继续 → far(被强制去 success.to,不能绕)
  ok('M8c 继续 → 走到 success.to=far(后果分支被强制)', e.view().pos.node === 'far', JSON.stringify(e.view().pos));
  e.apply(e.view().actions.filter(function (a) { return a.label === '回渡口看看'; })[0]);         // 3) 从对岸【正常重访】渡口
  var acts = e.view().actions, dbg = acts.map(function (a) { return a.label + '→' + a.to + ':' + a.kind; }).join(',');
  ok('M8 重访渡口 → 已挣得的前进路 success.to=far 仍在(:passed 安全网,不重掷)', acts.some(function (a) { return a.to === 'far'; }), dbg);
  ok('M8b 该前进路是无条件移动 kind=move(不重掷、不重扣)', (function () { var a = acts.filter(function (x) { return x.to === 'far'; })[0]; return !!a && a.kind === 'move'; })());
  // M8d:检定【前】首帧旁路 exit 仍在(suppressExits 只在结果帧、不误伤正常帧)
  var e2 = Amatlas.createEngine(w, {}); e2.use(TT.createTabletopModule({ sheet: { skills: { 力: 1 }, resources: {} } })); e2.use(TA.createTextAdventureModule({})); e2.start();
  ok('M8d 检定前首帧「折回」exit 在、suppressExits 未置(不误伤正常帧)', !e2.view().view.suppressExits && e2.view().actions.some(function (a) { return a.label === '折回'; }));
})();

// M9. crit 是「已成功」同族(R2 二轮:commit 67e527f 的 success→crit 兄弟):crit 独立 flag+cost 的检定,暴击后守卫必须隐藏检定,
//     不可无限重掷刷 cost.resources 软锁。低层直调 mod.actions(state,node) 精确验守卫(rigged dice 确定性 crit:1d1 恒 1=自然最大)。
(function () {
  var rq = [];
  var ENG = { world: { maps: { m: { name: 'M' } } }, firstTime: function () { return false; }, dice: function (n) { return rq.length ? rq.shift() : n; }, clock: { t: 0, advance: function () {} }, emit: function () {}, linkActions: function () { return []; } };
  var mod = TT.createTabletopModule({ sheet: { skills: { 力: 0 }, resources: { 精力: 5 } } });
  mod.init(ENG);
  var node = { checks: [{ id: 'decode', label: '解译', skill: '力', dc: 1, dice: '1d1', cost: { res: '精力', amount: 1 }, success: { text: '普成', flag: 'wonNormal' }, crit: { text: '暴击', flag: 'wonCrit' } }] };
  var state = { flags: {}, sheet: { skills: { 力: 0 }, resources: { 精力: 5 } }, clock: { t: 0 }, pos: { map: 'm', node: 'n' } };
  mod.systems[0].run(state);
  var before = mod.actions(state, node).some(function (a) { return a.id === 'decode'; });   // 反向变异「原 case」:成功前检定动作在
  rq = [1];                                                                                   // 1d1 恒 1 = 自然最大,dc1 可达 → crit,置 wonCrit(独立于 success.flag)、扣 1 精力
  mod.actions(state, node).filter(function (a) { return a.id === 'decode'; })[0].run(state);
  var energyAfter1 = state.sheet.resources.精力, flagsAfter = JSON.stringify(state.flags);
  state._ttPending = null;                                                                    // 模拟离开节点(enter 清 pending)
  var after = mod.actions(state, node).some(function (a) { return a.id === 'decode'; });       // 重访:守卫应隐藏检定
  ok('M9 暴击(crit 独立 flag)后检定被守卫隐藏,不可无限重摇刷 cost(crit 当成功同族;修复前只读 success.flag→漏 crit 兄弟)',
    before === true && after === false && energyAfter1 === 4 && /wonCrit/.test(flagsAfter) && !/wonNormal/.test(flagsAfter),
    'before=' + before + ' after=' + after + ' energy=' + energyAfter1 + ' flags=' + flagsAfter);
})();

/* N. 契约 v7 骰子:dice 元素带 sides(选骰形) + crit/fumble(自然最大/最小)─────────────────
   用 1d1(恒掷 1 = 同时是最大与最小)确定性触发:dc 可达 → crit;dc 不可达 → fumble。无需猜种子。 */
(function () {
  function rollOnce(checks, skills) {
    var w = { id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'enc' }, maps: { m: { name: 'M', nodes: {
      enc: { kind: 'encounter', name: '试炼', checks: checks, links: [] }
    } } } };
    var e = Amatlas.createEngine(w, {}); e.use(TT.createTabletopModule({ sheet: { skills: skills || {}, resources: {} } })); e.start();
    var act = e.view().actions.filter(function (a) { return a.kind === 'act'; })[0];   // 检定动作(M3 已证 kind='act')
    e.apply(act);
    return e.view().view.scene.elements.filter(function (x) { return x.kind === 'dice'; })[0];
  }
  var d6 = rollOnce([{ id: 'c', label: '掷', skill: '力', dc: 2, dice: '2d6', success: { text: 'ok' } }], { 力: 0 });
  ok('N1 默认 2d6 → dice 元素带 sides=6(选骰形:等距立方)', d6 && d6.sides === 6, d6 && JSON.stringify(d6));
  var dc = rollOnce([{ id: 'c', label: '暴击', skill: '力', dc: 1, dice: '1d1', success: { text: 'great' } }], { 力: 0 });
  ok('N2 roll===n×sides 且成功 → state="crit"(暴击)', dc && dc.state === 'crit', dc && dc.state);
  var df = rollOnce([{ id: 'c', label: '大失败', skill: '力', dc: 99, dice: '1d1', fail: { text: 'bad' } }], { 力: 0 });
  ok('N3 roll===n 且失败 → state="fumble"(大失败)', df && df.state === 'fumble', df && df.state);
  ok('N4 sides 随 dice 规格变(1d1 → sides=1)', dc && dc.sides === 1, dc && dc.sides);
})();

// P. round9 audit:dc 支持 (state)=>number(动态难度)+ 一批 check 字段错形态 fail-loud(似是而非形态→静默失效)
(function () {
  function throws(fn) { try { fn(); return false; } catch (e) { return true; } }
  function eng(checks) {
    var w = makeWorld(); w.maps.ship.nodes.airlock.checks = checks;
    var e = Amatlas.createEngine(w, {}); e.use(TT.createTabletopModule({ sheet: { skills: { 体魄: 1 }, resources: { 状态: 3 } } })); e.start();
    return e;
  }
  function chk(over) { return [Object.assign({ id: 'p', label: '撬门', skill: '体魄', dice: '2d6', success: { text: 'ok' }, fail: { text: 'no' } }, over)]; }
  ok('P1 dc 写成 (S)=>number(动态难度,haiku 写法)→ 不抛、可解析(回归 dc 支持)', !throws(function () { eng(chk({ dc: function (S) { return 6; } })).view(); }));
  ok('P2 dc 写成字符串 → 抛(否则 total>=dc 恒 NaN=永远失败)', throws(function () { eng(chk({ dc: '8' })).view(); }));
  ok('P3 success 写成字符串 → 抛(否则文本+后果全丢)', throws(function () { eng(chk({ dc: 8, success: '成功了' })).view(); }));
  ok('P4 cost 写成数字 → 抛(否则检定永远灰显点不动)', throws(function () { eng(chk({ dc: 8, cost: 1 })).view(); }));
  ok('P5 success.set 写成数组 → 抛(否则置出 0/1 垃圾 flag)', throws(function () { eng(chk({ dc: 8, success: { set: ['won'] } })).view(); }));
  ok('P6 cost.amount 非数 → 抛(否则资源变 NaN)', throws(function () { eng(chk({ dc: 8, cost: { res: '状态', amount: 'two' } })).view(); }));
  ok('P7 check 用 requires(应 available)→ 抛(否则门控静默失效)', throws(function () { eng(chk({ dc: 8, requires: function () { return true; } })).view(); }));
  ok('P8 后果写在 check 顶层(flag/clock,无 success/fail)→ 抛', throws(function () { eng([{ id: 'p', label: '撬门', skill: '体魄', dc: 8, dice: '2d6', flag: 'won', clock: 1 }]).view(); }));
  ok('P9 checks 写成对象而非数组 → 抛', throws(function () { var w = makeWorld(); w.maps.ship.nodes.airlock.checks = { id: 'p', label: '撬门', skill: '体魄', dc: 8, dice: '2d6', success: { text: 'ok' } }; var e = Amatlas.createEngine(w, {}); e.use(TT.createTabletopModule({ sheet: { skills: { 体魄: 1 } } })); e.start(); e.view(); }));
  ok('P10 全合法(数字 dc + success/fail 对象 + cost{res,amount} + set 对象)不抛(回归)', !throws(function () { eng(chk({ dc: 8, cost: { res: '状态', amount: 1 }, success: { text: 'ok', set: { won: true }, clock: 0.5 } })).view(); }));
  ok('P10b success/fail/crit/fumble/partial.clock 负数/非有限/非数字 → view 即抛', ['success', 'fail', 'crit', 'fumble', 'partial'].every(function (side) {
    return [-1, Infinity, NaN, '1'].every(function (value) {
      var over = { dc: 8 }; over[side] = { text: '坏时钟', clock: value };
      return throws(function () { eng(chk(over)).view(); });
    });
  }));
  // P11(②a · fail-silent 修):cost.res 未在 sheet.resources(配置缺失 / initState↔sheet 同名混淆,非拼错也非耗尽)→ 检定能点掷骰,不当"资源不足"灰显。
  //   对照 G2(声明了资源、耗尽=0 才灰显)。"未声明 ≠ 用光了"——修 afford 把配置缺失误判成耗尽、检定永不可点的 fail-silent(showcase 漏配 sheet 即中)。
  ok('P11 cost.res 未在 sheet.resources → 检定能点(非 locked)、不灰显(②a:未声明≠耗尽)', (function () {
    var acts = eng(chk({ dc: 8, cost: { res: '幽灵', amount: 1 }, success: { text: 'ok' } })).view().actions || [];
    var a = acts.filter(function (x) { return x.label.indexOf('撬门') === 0; })[0];   // startsWith:检定按钮 label 带自动 DC 后缀
    return !!(a && !a.locked);
  })());
})();

// Q. v11 对称修:encounter 的 link.run 返回 string → 回应显示(契约 §4.3 通用语义;旧版静默丢弃=round12"选项没反应"在跑团的活体)
(function () {
  var w = { id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'a' }, maps: { m: { name: 'M', nodes: {
    a: { kind: 'encounter', look: '战场。', checks: [],
      links: [ { id: 'clue', label: '搜查', run: function (S) { S.n = (S.n || 0) + 1; return '你找到了线索' + S.n + '号。'; } } ] }
  } } } };
  var e = Amatlas.createEngine(w, {});
  e.use(TT.createTabletopModule({ sheet: { resources: {} } }));
  e.start(); e.view();
  e.apply(e.view().actions.filter(function (x) { return x.id === 'clue'; })[0]);
  var v = e.view();
  ok('Q1 encounter link.run 返回 string → outcome 行显示(与 text-adventure 对称)', v.view.body.some(function (b) { return b.type === 'outcome' && b.text === '你找到了线索1号。'; }), JSON.stringify(v.view.body).slice(0, 200));
  ok('Q2 帧产物语义:再渲染不复现(消费即清)', !e.view().view.body.some(function (b) { return b.type === 'outcome'; }));
  e.apply(e.view().actions.filter(function (x) { return x.id === 'clue'; })[0]);
  ok('Q3 重复点击 → 每次都有回应(线索2号)', e.view().view.body.some(function (b) { return b.text === '你找到了线索2号。'; }));
})();

// Q4/Q5 link.run 回应闭包也必须在 reset/leave 清空，不能在新局/下一 encounter 首次 view 串出。
(function () {
  var w = { id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'a' }, maps: { m: { nodes: {
    a: { kind: 'encounter', look: '甲。', checks: [], links: [{ id: 'clue', label: '搜查', run: function () { return '陈旧线索'; } }] },
    b: { kind: 'encounter', look: '乙。', checks: [], links: [] }
  } } } };
  function make() { var e = Amatlas.createEngine(w, { storage: null }); e.use(TT.createTabletopModule({ sheet: {} })); e.start(); return e; }
  var e = make(); e.apply(e.view().actions.filter(function (a) { return a.id === 'clue'; })[0]); e.reset();
  ok('Q4 link 回应未观察就 reset → 新局不串 pendingMsgs', !e.view().view.body.some(function (b) { return b.text === '陈旧线索'; }));
  var e2 = make(); e2.apply(e2.view().actions.filter(function (a) { return a.id === 'clue'; })[0]); e2.enter({ map: 'm', node: 'b' });
  ok('Q5 link 回应未观察就 leave → 下一 encounter 不串 pendingMsgs', !e2.view().view.body.some(function (b) { return b.text === '陈旧线索'; }));

  var e3 = make();
  var code = e3.exportCode();
  e3.apply(e3.view().actions.filter(function (a) { return a.id === 'clue'; })[0]);
  var imported = e3.importCode(code);
  ok('Q6 同实例同节点 import 旧档 → 恢复帧不串旧 pendingMsgs', imported === true &&
    !e3.view().view.body.some(function (b) { return b.text === '陈旧线索'; }));
})();

// R. v12 检定后果分支 success.to / fail.to(调研定稿:Ink divert / ChoiceScript *goto / Fallen London challenge
//    分支 / Disco Elysium 红白检定同款一等公民;fail forward——失败也推进剧情而非原地卡死;旧版静默丢弃)
(function () {
  function mkBranchWorld(dc) {
    return { id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'gate' }, maps: { m: { name: 'M', nodes: {
      gate: { kind: 'encounter', look: '大门。', checks: [
        { id: 'climb', label: '攀爬', skill: '体魄', dc: dc, dice: '2d6',
          success: { text: '翻墙而入。', flag: 'inside', to: 'court' },
          fail: { text: '摔进沟里。', clock: 1, to: 'ditch' } } ],
        links: [ { label: '原地等待', run: function () { return '风声。'; } } ] },
      court: { kind: 'encounter', look: '庭院。', checks: [], links: [ { label: '回', to: 'gate' } ] },
      ditch: { kind: 'encounter', look: '沟里。', checks: [], links: [ { label: '爬出去', to: 'gate' } ] }
    } } } };
  }
  function mkE(dc) { var e = Amatlas.createEngine(mkBranchWorld(dc), {}); e.use(TT.createTabletopModule({ sheet: { skills: { 体魄: 1 }, resources: {} } })); e.start(); e.view(); return e; }
  var eS = mkE(0);                                            // dc 0 → 必成功
  eS.apply(eS.view().actions.filter(function (x) { return x.id === 'climb'; })[0]);
  var vS = eS.view();
  // M2:检定不再自动跳;原地显示结果(消费 lastCheck)+ 本帧给「继续」,点继续才移动。
  ok('R1 检定后不自动跳(M2:显示结果→继续),仍在源节点 gate', eS.state.pos.node === 'gate', JSON.stringify(eS.state.pos));
  ok('R2 后果先于移动(flag 已置)+ 检定结果原地显示(check 行)', eS.state.flags.inside === true && vS.view.body.some(function (b) { return b.type === 'check'; }), JSON.stringify(vS.view.body).slice(0, 160));
  var contS = vS.actions.filter(function (x) { return x.id === '__tt_continue'; })[0];
  ok('R1b 本帧有「继续」动作,to=success.to(court)', !!contS && contS.to === 'court', JSON.stringify(vS.actions.map(function (a) { return a.id; })));
  eS.apply(contS);
  ok('R1c 点继续 → 移动到 court', eS.state.pos.node === 'court', JSON.stringify(eS.state.pos));
  var eF = mkE(99);                                           // dc 99 → 必失败
  var t0 = eF.state.clock.t;
  eF.apply(eF.view().actions.filter(function (x) { return x.id === 'climb'; })[0]);
  ok('R3 失败检定:clock 在检定时即推进(后果先于移动)+ 仍在源节点', eF.state.pos.node === 'gate' && eF.state.clock.t > t0, JSON.stringify(eF.state.pos) + ' clock=' + eF.state.clock.t);
  var contF = eF.view().actions.filter(function (x) { return x.id === '__tt_continue'; })[0];
  ok('R3b 继续 to=fail.to(ditch);点击 → fail forward 到 ditch', !!contF && contF.to === 'ditch');
  eF.apply(contF);
  ok('R3c 点继续 → 移动到 ditch', eF.state.pos.node === 'ditch');
  var eN = mkE(99);                                           // 无 to 的检定行为不变(回归)
  eN.world.maps.m.nodes.gate.checks[0].fail = { text: '滑了一下。' };
  eN.apply(eN.view().actions.filter(function (x) { return x.id === 'climb'; })[0]);
  ok('R4 无 to → 原地(旧行为零回归)', eN.state.pos.node === 'gate');
  function throws(fn) { try { fn(); return false; } catch (e) { return /tabletop/.test(e.message); } }
  ok('R5 success 未知键(sets typo)→ 抛并点名支持的闭集', throws(function () {
    var w = mkBranchWorld(5); w.maps.m.nodes.gate.checks[0].success = { sets: { x: 1 } };
    var e = Amatlas.createEngine(w, {}); e.use(TT.createTabletopModule({ sheet: {} })); e.start(); e.view();
  }));
  ok('R6 to 形态错({room:…})→ 抛教正形', throws(function () {
    var w = mkBranchWorld(5); w.maps.m.nodes.gate.checks[0].success.to = { room: 'court' };
    var e = Amatlas.createEngine(w, {}); e.use(TT.createTabletopModule({ sheet: {} })); e.start(); e.view();
  }));

  // R7-R10:M2 跨模块盲区回归(此前夹具全是 encounter→encounter,从不覆盖 encounter→scene
  //   = 检定结果跨模块不可见 + 串台 bug 长期未被测出的原因)。检定目的地是 scene 节点(text-adventure 渲染)。
  function mkSceneDestWorld() {
    return { id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'gate' }, maps: { m: { name: 'M', nodes: {
      gate: { kind: 'encounter', look: '大门。', scene: { region: 'room', mood: 'tense' },
        checks: [{ id: 'climb', label: '攀爬', skill: '体魄', dc: 0, dice: '2d6',
          success: { text: '翻墙而入,落在庭院里。', flag: 'inside', to: 'court' },
          fail: { text: '摔进沟里。', clock: 1, to: 'court' } }] },
      court: { kind: 'scene', look: '庭院。这里很安静。', scene: { region: 'ruins', mood: 'calm' },
        links: [{ label: '去第二道门', to: 'gate2' }] },                          // scene 节点 → text-adventure 渲染
      gate2: { kind: 'encounter', look: '第二道门。', scene: { region: 'room' },
        checks: [{ id: 'c2', label: '敲门', skill: '体魄', dc: 0, dice: '2d6', success: { text: '开了' }, fail: { text: '没开' } }] }
    } } } };
  }
  function mkE2() {
    var e = Amatlas.createEngine(mkSceneDestWorld(), { storage: null });
    e.use(TT.createTabletopModule({ sheet: { skills: { 体魄: 5 }, resources: {} } }));
    e.use(TA.createTextAdventureModule({}));
    e.start(); e.view(); return e;
  }
  function dice(v) { return !!(v.view.scene && (v.view.scene.elements || []).some(function (el) { return el.kind === 'dice'; })); }
  var e7 = mkE2();
  e7.apply(e7.view().actions.filter(function (x) { return x.id === 'climb'; })[0]);   // 检定成功(dc0)
  var v7 = e7.view();
  ok('R7 检定→scene 目的地:success.text 在源 encounter 可见(根治「后果文本跨模块丢失」)',
    e7.state.pos.node === 'gate'
    && v7.view.body.some(function (b) { return b.type === 'check'; })
    && v7.view.body.some(function (b) { return b.type === 'outcome' && /翻墙而入/.test(b.text); }),
    JSON.stringify(v7.view.body).slice(0, 200));
  ok('R7b 源 encounter 本帧 scene 含骰子元素(骰子在该出现处出现)', dice(v7));
  var cont7 = v7.actions.filter(function (x) { return x.id === '__tt_continue'; })[0];
  ok('R7c 继续 to=scene 节点 court', !!cont7 && cont7.to === 'court');
  e7.apply(cont7);
  var v7b = e7.view();
  ok('R7d 点继续 → 进入 scene 节点(text-adventure 渲染),无陈旧骰子', e7.state.pos.node === 'court' && !dice(v7b));
  // R8:从 scene 走到下一个 encounter(未做任何检定)→ tabletop.render 该处不得显示陈旧检定/骰子(根治串台)
  e7.apply(e7.view().actions.filter(function (x) { return x.to === 'gate2'; })[0]);
  var v8 = e7.view();
  ok('R8 进入下一个 encounter(未交互)→ 无陈旧检定行/骰子(根治「未点击就自动掷骰」串台)',
    e7.state.pos.node === 'gate2' && !v8.view.body.some(function (b) { return b.type === 'check'; }) && !dice(v8),
    JSON.stringify(v8.view.body).slice(0, 160));
  // R9:延迟跳转入档(随存档,刷新/读档不丢)+ 待继续帧不可重复掷骰(防重复扣费)
  var e9 = mkE2();
  e9.apply(e9.view().actions.filter(function (x) { return x.id === 'climb'; })[0]);
  ok('R9 _ttPending 入 state(serialize 即带 → 刷新/读档不丢失)', e9.state._ttPending === 'court');
  var v9 = e9.view();
  ok('R9b 待继续帧只给「继续」、无 climb 检定(防重复掷骰/重复扣费)',
    !v9.actions.some(function (x) { return x.id === 'climb'; }) && v9.actions.some(function (x) { return x.id === '__tt_continue'; }));
  // R10:pendingMsgs 对称——带文字回应的移动型 link 也延迟显示→继续(本作 latent,此处显式覆盖)
  var e10 = Amatlas.createEngine({ id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'a' }, maps: { m: { nodes: {
    a: { kind: 'encounter', look: '机关室。', checks: [], links: [{ label: '拨动开关', to: 'b', run: function () { return '机关轰隆作响。'; } }] },
    b: { kind: 'scene', look: '通道。' }
  } } } }, { storage: null });
  e10.use(TT.createTabletopModule({ sheet: {} })); e10.use(TA.createTextAdventureModule({}));
  e10.start(); e10.view();
  e10.apply(e10.view().actions.filter(function (x) { return x.label.indexOf('拨动开关') === 0; })[0]);   // startsWith:检定按钮 label 带自动 DC 后缀
  var v10 = e10.view();
  ok('R10 带回应的移动 link 延迟:回应在源节点显示 + 不自动跳 + _ttPending 设',
    e10.state.pos.node === 'a' && v10.view.body.some(function (b) { return /机关轰隆/.test(b.text); }) && e10.state._ttPending === 'b',
    JSON.stringify(v10.view.body).slice(0, 160));
  var cont10 = v10.actions.filter(function (x) { return x.id === '__tt_continue'; })[0];
  e10.apply(cont10);
  ok('R10b 继续 → 移动到 b(scene)', e10.state.pos.node === 'b');
})();

/* S. 易用性/逻辑审计批:cost.amount:0 合法生效 + 死局判定看 links ───────────── */
(function () {
  // S1/S2 amount:0 = 免费检定(:179 校验放行的合法值;旧 `||1` 静默当 1 扣 + 资源 0 时灰显锁死)
  function freeWorld() {
    return { id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'a' }, maps: { m: { nodes: {
      a: { kind: 'encounter', look: '免费检定',
        checks: [{ id: 'free', label: '观察(免费)', skill: '感知', dc: 2, dice: '2d6',
          cost: { res: '体力', amount: 0 }, success: { text: '看清了', flag: 'seen' }, fail: { text: '模糊' } }],
        exits: [{ to: 'b', label: '走' }] },
      b: { kind: 'encounter', look: '终点', checks: [], exits: [] }
    } } } };
  }
  var eS = Amatlas.createEngine(freeWorld(), { storage: null });
  eS.use(TT.createTabletopModule({ sheet: { skills: { 感知: 5 }, resources: { 体力: 0 } } }));
  eS.start();
  var act = eS.view().actions.filter(function (a) { return a.id === 'free'; })[0];
  ok('S1 amount:0 且资源=0 → 检定可点(免费;旧版按 1 判=灰显锁死)', !!act && !act.locked);
  eS.apply(act);
  ok('S2 amount:0 掷骰后不扣资源(旧版扣 1 → Math.max 钳 0 但语义已错)', eS.state.sheet.resources.体力 === 0);

  // S3 死局判定看 links:检定 starved 但 links 可走 → 不是死局,不灰显「资源不足」
  function linkOutWorld() {
    return { id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'a' }, maps: { m: { nodes: {
      a: { kind: 'encounter', look: '检定耗尽但有路',
        checks: [{ id: 'hard', label: '强攻', skill: '体魄', dc: 9, dice: '2d6',
          cost: { res: '状态', amount: 1 }, success: { text: '成' }, fail: { text: '败' } }],
        links: [{ to: 'b', label: '绕后门走' }] },                       // 出口在 links(文字冒险习惯),exits 没写
      b: { kind: 'encounter', look: '出口', checks: [], exits: [] }
    } } } };
  }
  var eL = Amatlas.createEngine(linkOutWorld(), { storage: null });
  eL.use(TT.createTabletopModule({ sheet: { skills: { 体魄: 1 }, resources: { 状态: 0 } } }));
  eL.start();
  var acts = eL.view().actions;
  var starvedShown = acts.some(function (a) { return a.id === 'hard' && a.locked; });
  var linkOk = acts.some(function (a) { return a.label === '绕后门走' && !a.locked; });
  ok('S3 检定资源耗尽但 link 可走 → 非死局,不亮「资源不足」灰条(旧版只扫 exits=误示死局)', linkOk && !starvedShown);
})();

// U. 检定增强(M1 条件骰 / M2 优劣势 / M3 暴击大失败叙事 / M4 道具加值)—— mock 受控骰断言精确值
//    设计稿 docs/tabletop-check-enrichment-design.md;查证规则书 D&D 5e/Blades/PbtA/Disco Elysium。
(function () {
  function mockCheck(check, sheet, seq, flags) {
    var mod = TT.createTabletopModule({ sheet: sheet });
    var i = 0;
    var eng = { dice: function () { return seq[i++]; }, clock: { t: 0, advance: function () {} }, emit: function () {}, world: { maps: {} }, firstTime: function () { return false; }, linkActions: function () { return []; } };
    mod.init(eng);
    var st = { pos: { map: 'm', node: 'n' }, flags: flags || {}, clock: eng.clock, sheet: JSON.parse(JSON.stringify(sheet)) };
    var node = { kind: 'encounter', look: 'x', checks: [check] };
    var a = mod.actions(st, node).filter(function (x) { return x.id === 't'; })[0];
    a.run(st);
    var v = mod.render(st, node);
    var cl = v.body.filter(function (b) { return b.type === 'check'; })[0];
    var oc = v.body.filter(function (b) { return b.type === 'outcome'; })[0];
    var dice = ((v.scene && v.scene.elements) || []).filter(function (e) { return e.kind === 'dice'; })[0];
    return { line: cl && cl.text, outcome: oc && oc.text, flags: st.flags, draws: i, dice: dice };
  }
  function uThrows(fn) { try { fn(); return false; } catch (e) { return /tabletop/.test(e.message); } }
  var SH = { skills: { 力: 1 }, resources: {} };
  // M1 条件骰
  var c1 = { id: 't', label: '撬', skill: '力', dc: 9, dice: function (S) { return S.flags.knife ? '2d6' : '1d6'; }, success: { text: '开' }, fail: { text: '否' } };
  ok('U1 M1 条件骰:无道具→1d6(用户诉求:几乎不可能)', /1d6\(6\)\+1 = 7 < DC 9/.test(mockCheck(c1, SH, [6], {}).line));
  ok('U1b M1 条件骰:有道具→2d6(同检定变可过)', /2d6\(11\)\+1 = 12 ≥ DC 9/.test(mockCheck(c1, SH, [11], { knife: true }).line));
  // M2 优劣势 = 多掷一颗骰、保留最高/最低 N 颗(N=原保留数):2d6→3d6kh2、1d20→2d20kh1(=D&D)。
  //   mock dice 逐颗返回 → 优势走 rollSpec 的 kh 路径、消费 N+1 抽;抵消(adv===dis)=原骰 rollSpec(d)、消费 1 抽。
  var c2 = function (a, d) { return { id: 't', label: 'x', skill: '力', dc: 9, dice: '2d6', advantage: a, disadvantage: d, success: { text: '成' }, fail: { text: '败' } }; };
  ok('U2 M2 优势:掷 3d6[2,5,6] 留最高 2=11,骰面 11 + 尾标(优势)', /2d6\(11\)\+1 = 12 ≥ DC 9 \(优势\)/.test(mockCheck(c2(true, false), SH, [2, 5, 6]).line));
  ok('U3 M2 劣势:掷 3d6[2,5,6] 留最低 2=7,骰面 7 + 尾标(劣势)', /2d6\(7\)\+1 = 8 < DC 9 \(劣势\)/.test(mockCheck(c2(false, true), SH, [2, 5, 6]).line));
  ok('U4 M2 优劣抵消=原骰(只消费 1 抽、无标签)', (function () { var r = mockCheck(c2(true, true), SH, [5, 99]); return r.draws === 1 && /2d6\(5\)/.test(r.line) && !/优势|劣势/.test(r.line); })());
  ok('U4b M2 优势=多掷一颗(消费 3 抽=3d6)', mockCheck(c2(true, false), SH, [2, 5, 6]).draws === 3);
  ok('U4c M2 advantage 函数形:(S)=>!!S.flags.x → 3d6 留最高 11 + (优势)', /2d6\(11\)\+1 = 12 ≥ DC 9 \(优势\)/.test(mockCheck({ id: 't', label: 'x', skill: '力', dc: 9, dice: '2d6', advantage: function (S) { return !!S.flags.torch; }, success: { text: '成' }, fail: { text: '败' } }, SH, [2, 5, 6], { torch: true }).line));
  ok('U4d M2 优势还原 D&D:1d20+优势=2d20 留最高 1(掷[8,17]→17)', /1d20\(17\).*≥ DC 10 \(优势\)/.test(mockCheck({ id: 't', label: 'x', skill: '力', dc: 10, dice: '1d20', advantage: true, success: { text: '成' }, fail: { text: '败' } }, { skills: { 力: 0 }, resources: {} }, [8, 17]).line));
  // M3 暴击/大失败叙事
  var c3 = { id: 't', label: 'x', skill: '力', dc: 7, dice: '2d6', success: { text: '普成' }, crit: { text: '暴击', flag: 'cF' }, fail: { text: '普败' }, fumble: { text: '大失败', flag: 'fF' } };
  ok('U5 M3 自然12且成功→crit 分支(text+flag)', (function () { var r = mockCheck(c3, SH, [12]); return r.outcome === '暴击' && r.flags.cF === true; })());
  ok('U6 M3 自然2且失败→fumble 分支', (function () { var r = mockCheck(c3, SH, [2]); return r.outcome === '大失败' && r.flags.fF === true; })());
  ok('U7 M3 普通成功→降级 success(无 crit 字段时零行为变化)', mockCheck({ id: 't', label: 'x', skill: '力', dc: 7, dice: '2d6', success: { text: '普成' }, fail: { text: '普败' } }, SH, [12]).outcome === '普成');
  ok('U7b M3 自然12但 DC 过高仍失败→不误走 crit(诚实:极值仅与成败一致才点亮)', mockCheck({ id: 't', label: 'x', skill: '力', dc: 99, dice: '2d6', success: { text: '成' }, crit: { text: '暴击' }, fail: { text: '败' } }, SH, [12]).outcome === '败');
  // M4 道具加值(显示合并调整值)
  var c4 = { id: 't', label: 'x', skill: '力', dc: 10, dice: '2d6', bonus: function (S) { return S.flags.charm ? 2 : 0; }, success: { text: '成' }, fail: { text: '败' } };
  ok('U8 M4 无符咒:8+1=9<10 败', /2d6\(8\)\+1 = 9 < DC 10/.test(mockCheck(c4, SH, [8], {}).line));
  ok('U8b M4 有符咒:8+1+2=11,检定行显 +3', /2d6\(8\)\+3 = 11 ≥ DC 10/.test(mockCheck(c4, SH, [8], { charm: true }).line));
  // fail-loud(错形态即抛,对齐穷举校验)
  ok('U9 dice 非串非函数→抛', uThrows(function () { mockCheck({ id: 't', label: 'x', skill: '力', dc: 7, dice: 6, success: { text: 'a' } }, SH, [6]); }));
  ok('U9b dice 函数形返回非法 NdS→抛', uThrows(function () { mockCheck({ id: 't', label: 'x', skill: '力', dc: 7, dice: function () { return '坏'; }, success: { text: 'a' } }, SH, [6]); }));
  ok('U10 advantage 非 bool/非函数→抛', uThrows(function () { mockCheck({ id: 't', label: 'x', skill: '力', dc: 7, dice: '2d6', advantage: 'yes', success: { text: 'a' } }, SH, [6]); }));
  ok('U11 bonus 非数/非函数→抛', uThrows(function () { mockCheck({ id: 't', label: 'x', skill: '力', dc: 7, dice: '2d6', bonus: 'big', success: { text: 'a' } }, SH, [6]); }));
  ok('U11b bonus 定值 NaN/±Infinity → 抛，不污染 total', [NaN, Infinity, -Infinity].every(function (v) { return uThrows(function () { mockCheck({ id: 't', label: 'x', skill: '力', dc: 7, dice: '2d6', bonus: v, success: { text: 'a' } }, SH, [6]); }); }));
  ok('U11c bonus 函数返回非有限/非 number → 抛，不强转或静默归零', [NaN, Infinity, -Infinity, '2', 'oops', '', null].every(function (v) { return uThrows(function () { mockCheck({ id: 't', label: 'x', skill: '力', dc: 7, dice: '2d6', bonus: function () { return v; }, success: { text: 'a' } }, SH, [6]); }); }));
  ok('U12 crit 写成字符串→抛', uThrows(function () { mockCheck({ id: 't', label: 'x', skill: '力', dc: 7, dice: '2d6', success: { text: 'a' }, crit: '暴击' }, SH, [6]); }));
  ok('U12b crit 未知键→抛(闭集穷举含 crit/fumble)', uThrows(function () { mockCheck({ id: 't', label: 'x', skill: '力', dc: 7, dice: '2d6', success: { text: 'a' }, crit: { txt: '暴击' } }, SH, [6]); }));
  // M5a kh/kl 取高/取低 K 颗(逐颗经累加器;4d6kh3 属性生成、2d20kh1 优势骰)
  ok('U13 M5a 4d6kh3 掷[1,6,3,5]→取高3=14', /4d6kh3\(14\)/.test(mockCheck({ id: 't', label: 'x', skill: '力', dc: 10, dice: '4d6kh3', success: { text: '成' }, fail: { text: '败' } }, SH, [1, 6, 3, 5]).line));
  ok('U14 M5a 4d6kl3 同序列→取低3=9', /4d6kl3\(9\)/.test(mockCheck({ id: 't', label: 'x', skill: '力', dc: 10, dice: '4d6kl3', success: { text: '成' }, fail: { text: '败' } }, SH, [1, 6, 3, 5]).line));
  ok('U15 M5a kh 取舍数 > 骰数 → 抛', uThrows(function () { mockCheck({ id: 't', label: 'x', skill: '力', dc: 10, dice: '4d6kh5', success: { text: 'a' } }, SH, [1, 6, 3, 5]); }));
  // M5b 部分成功(PbtA 7-9 风:失败但接近 → 成功有代价)
  ok('U16 M5b total=9 落 [dc-2,dc)→ partial 分支 + 标"部分成功"', (function () { var r = mockCheck({ id: 't', label: 'x', skill: '力', dc: 10, dice: '2d6', success: { text: '全胜' }, partial: { text: '惨胜' }, fail: { text: '败' } }, SH, [8]); return r.outcome === '惨胜' && /部分成功/.test(r.line); })());
  ok('U17 M5b total=7 超出带宽(<dc-2)→ 普通失败', mockCheck({ id: 't', label: 'x', skill: '力', dc: 10, dice: '2d6', success: { text: '全胜' }, partial: { text: '惨胜' }, fail: { text: '败' } }, SH, [6]).outcome === '败');
  ok('U18 M5b 无 partial 字段 → 降级失败(向后兼容零行为变化)', mockCheck({ id: 't', label: 'x', skill: '力', dc: 10, dice: '2d6', success: { text: '全胜' }, fail: { text: '败' } }, SH, [8]).outcome === '败');
  ok('U18b M5b partialBand 非数→抛', uThrows(function () { mockCheck({ id: 't', label: 'x', skill: '力', dc: 10, dice: '2d6', success: { text: 'a' }, partial: { text: 'p' }, partialBand: 'wide' }, SH, [8]); }));
  // issue3:骰子元素 ref = **最终鉴定值**(roll+加值),不是裸骰点 → 玩家看到的数字 = 拿去比 DC 的数字。
  var c19 = { id: 't', label: 'x', skill: '力', dc: 5, dice: '2d6', success: { text: '成' }, fail: { text: '败' } };   // 力+1
  ok('U19 骰子 ref=总值(掷 8 +1 → ref="9",不是裸骰 8)', mockCheck(c19, SH, [8]).dice.ref === '9');
  ok('U19b 检定行仍显裸骰(2d6(8)+1=9 → 自然骰在文字里可见)', /2d6\(8\)\+1 = 9/.test(mockCheck(c19, SH, [8]).line));
  // 用户拍板修订:大成功/大失败**也显示总值**(不切回自然骰);暴击/大失败靠 state(present-svg 金光/红裂视觉)+ tier 文字标示。
  var c19c = { id: 't', label: 'x', skill: '力', dc: 5, dice: '2d6', success: { text: '成' }, crit: { text: '暴击' }, fail: { text: '败' }, fumble: { text: '大失败' } };
  ok('U19c 暴击:骰子 ref=总值 13(12+1),state=crit(视觉表暴击、骰面留总值)', (function () { var r = mockCheck(c19c, SH, [12]); return r.dice.ref === '13' && r.dice.state === 'crit'; })());
  ok('U19d 大失败(DC 高):骰子 ref=总值 3(2+1),state=fumble', (function () { var r = mockCheck({ id: 't', label: 'x', skill: '力', dc: 9, dice: '2d6', success: { text: '成' }, fail: { text: '败' }, fumble: { text: '大失败' } }, SH, [2]); return r.dice.ref === '3' && r.dice.state === 'fumble'; })());
})();

/* X. set 守卫:成功只写 success.set(无 flag)的 cost-bearing 检定,通过后不再重摇(治资源黑洞软锁;showcase《逝音录》decode 实锤) */
(function () {
  function eng(seed) {
    var W = { seed: seed, id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'n' }, maps: { m: { name: 'M', nodes: {
      n: { kind: 'encounter', title: 'T', look: 'L',
        checks: [ { id: 'decode', label: '破译(必成)', skill: '感知', dc: 4, dice: '2d6', cost: { res: '状态', amount: 1 }, success: { text: '懂了', set: { decoded: true } } } ],
        exits: [ { to: 'n', label: '留' } ] } } } } };
    var e = Amatlas.createEngine(W, {});
    e.use(TT.createTabletopModule({ sheet: { skills: { 感知: 5 }, resources: { 状态: 3 } } }));
    e.start();
    return e;
  }
  var e = eng(7);
  ok('X1 检定前 decode 可点 + 资源 3', !!findAct(e, 'decode') && e.state.sheet.resources.状态 === 3);
  e.apply(findAct(e, 'decode'));   // 感知5/DC4/2d6 必成(自然非12 非暴击 → 走 success → set decoded + 扣 1)
  ok('X2 成功 → set 写 state.flags.decoded + 扣 1 资源', e.state.flags.decoded === true && e.state.sheet.resources.状态 === 2);
  ok('X3 通过后 decode 不再出现(set 守卫:不可无限重刷扣资源;变异=守卫只认 flag 漏 set → decode 仍在 → 红)', !findAct(e, 'decode'));
})();

/* X'. 通过后"已挣得前进路"精修:仅 success.to !== fail.to(真 wreck_crossing 防御场景)保留;两路同处=普通事件→不保留(治用户报"线路修好后回节点仍显示检定按钮、点了只是回上一级"=空壳误导)*/
(function () {
  function eng(checks) {
    var W = { id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'n' }, maps: { m: { name: 'M', nodes: {
      n: { kind: 'encounter', title: 'T', look: 'L', checks: checks, exits: [{ to: 'far', label: '走' }] },
      far: { kind: 'scene', look: '到了', links: [{ to: 'n', label: '回去' }] }
    } } } };
    var e = Amatlas.createEngine(W, {}); e.use(TT.createTabletopModule({ sheet: { skills: { 力: 5 }, resources: {} } })); e.use(TA.createTextAdventureModule({})); e.start();
    return e;
  }
  // X4 场景 B(用户报):success.to === fail.to → 通过后不保留"已挣得"按钮(免空壳)
  var eB = eng([{ id: 'fix', label: '修线路', skill: '力', dc: 2, dice: '2d6', success: { text: '通了', flag: 'fixed', to: 'far' }, fail: { text: '没通', to: 'far' } }]);
  eB.apply(findAct(eB, 'fix'));   // 必成
  eB.apply(eB.view().actions.filter(function (a) { return a.id === '__tt_continue'; })[0]);   // 继续 → far
  eB.apply(eB.view().actions.filter(function (a) { return a.label === '回去'; })[0]);          // 回 n
  var passedB = eB.view().actions.filter(function (a) { return a.id === 'fix:passed'; });
  ok("X4 success.to===fail.to(普通事件,Sonnet storage_bay 模式)→ 通过后不留'已挣得'按钮(变异=无差别保留→出现→红)", passedB.length === 0, '_acts=' + eB.view().actions.map(function (a) { return a.label + ':' + a.kind; }).join(','));
  // X5 场景 A(wreck_crossing 真场景):success.to !== fail.to → 仍保留(M8 安全网不丢)
  var eA = eng([{ id: 'cross', label: '渡河', skill: '力', dc: 2, dice: '2d6', success: { text: '过', flag: 'crossed', to: 'far' }, fail: { text: '冲回', to: 'near' } }]);
  eA.world.maps.m.nodes.near = { kind: 'scene', look: '近岸', links: [{ to: 'n', label: '再去' }] };   // 补 fail.to 节点防死链
  eA.apply(findAct(eA, 'cross'));
  eA.apply(eA.view().actions.filter(function (a) { return a.id === '__tt_continue'; })[0]);
  eA.apply(eA.view().actions.filter(function (a) { return a.label === '回去'; })[0]);
  var passedA = eA.view().actions.filter(function (a) { return a.id === 'cross:passed'; });
  ok("X5 success.to!==fail.to(wreck_crossing 真场景)→ 通过后保留'已挣得'按钮(变异=新判据误伤场景 A→无→红)", passedA.length === 1 && passedA[0].kind === 'move', '_acts=' + eA.view().actions.map(function (a) { return a.label + ':' + a.kind; }).join(','));
  // X6 fail 没写 → 保留(success.to 是唯一前进、无 fail 状态 = wreck 风险)
  var eC = eng([{ id: 'go', label: '前进', skill: '力', dc: 2, dice: '2d6', success: { text: '过', flag: 'gone', to: 'far' } }]);
  eC.apply(findAct(eC, 'go'));
  eC.apply(eC.view().actions.filter(function (a) { return a.id === '__tt_continue'; })[0]);
  eC.apply(eC.view().actions.filter(function (a) { return a.label === '回去'; })[0]);
  var passedC = eC.view().actions.filter(function (a) { return a.id === 'go:passed'; });
  ok("X6 fail 没写 → 仍保留'已挣得'(success.to 唯一前进,wreck 风险存在;变异=fail==null 被当 sameTo→不保留→红)", passedC.length === 1 && passedC[0].kind === 'move', '_acts=' + eC.view().actions.map(function (a) { return a.label + ':' + a.kind; }).join(','));
})();

/* Y. 引擎自动管 DC 提示(用户拍板治本):检定按钮 label 据 skill+dc 自动拼「(技能·DC N)」;通过后 :passed 纯 label 不拼;dcHint:false 关;label 已含 DC 不重复拼 */
(function () {
  function eng(check) {
    var W = { id: '16161616-1616-4616-8616-161616161616', start: { map: 'm', node: 'n' }, maps: { m: { name: 'M', nodes: {
      n: { kind: 'encounter', title: 'T', look: 'L', checks: [check], exits: [{ to: 'far', label: '走' }] },
      far: { kind: 'scene', look: '到了', links: [{ to: 'n', label: '回去' }] }
    } } } };
    var e = Amatlas.createEngine(W, {}); e.use(TT.createTabletopModule({ sheet: { skills: { 感知: 5 }, resources: {} } })); e.use(TA.createTextAdventureModule({})); e.start();
    return e;
  }
  // Y1 检定按钮自动拼 DC 后缀(作者 label 只写动作)
  var e1 = eng({ id: 'search', label: '仔细翻查', skill: '感知', dc: 4, dice: '2d6', success: { text: 'ok', flag: 'found', to: 'far' }, fail: { text: 'no', to: 'far' } });
  var btn1 = findAct(e1, 'search');
  ok('Y1 检定按钮据 skill+dc 自动拼后缀:label=「仔细翻查(感知·DC 4)」(变异=不拼→label 仅「仔细翻查」→红)', btn1 && btn1.label === '仔细翻查(感知·DC 4)', btn1 && btn1.label);
  // Y2 通过后 :passed 按钮纯 label 不拼 DC(用户诉求:通过后隐藏 DC 提示)。需 success.to !== fail.to 才有 :passed
  var e2 = eng({ id: 'cross', label: '渡河', skill: '感知', dc: 2, dice: '2d6', success: { text: '过', flag: 'crossed', to: 'far' }, fail: { text: '退', to: 'n' } });
  e2.apply(findAct(e2, 'cross'));
  e2.apply(e2.view().actions.filter(function (a) { return a.id === '__tt_continue'; })[0]);
  e2.apply(e2.view().actions.filter(function (a) { return a.label === '回去'; })[0]);   // 回 n 重访
  var passed2 = e2.view().actions.filter(function (a) { return a.id === 'cross:passed'; })[0];
  ok('Y2 通过后 :passed 按钮纯动作 label 不带 DC:「渡河」非「渡河(感知·DC 2)」(变异=:passed 用 dcLabel→带 DC→红)', passed2 && passed2.label === '渡河', passed2 && passed2.label);
  // Y3 dcHint:false 关闭自动拼(作者要全自控)
  var e3 = eng({ id: 's', label: '潜入', skill: '感知', dc: 5, dice: '2d6', dcHint: false, success: { text: 'ok', flag: 'x', to: 'far' }, fail: { text: 'no', to: 'far' } });
  ok('Y3 dcHint:false → 不拼后缀(label 仅「潜入」;变异=忽略 dcHint→拼→红)', findAct(e3, 's').label === '潜入');
  // Y4 向后兼容:label 已手写「DC」→ 不重复拼(防旧写法重复)
  var e4 = eng({ id: 'd', label: '撬锁(力·DC 7)', skill: '感知', dc: 7, dice: '2d6', success: { text: 'ok', flag: 'x', to: 'far' }, fail: { text: 'no', to: 'far' } });
  ok('Y4 label 已含 DC → 不重复拼(兼容旧写法;变异=不检测→「撬锁(力·DC 7)(感知·DC 7)」双 DC→红)', findAct(e4, 'd').label === '撬锁(力·DC 7)');
  // Y5 无 skill → 不拼(纯 dc 无技能名,后缀无意义)
  var e5 = eng({ id: 'n2', label: '碰运气', dc: 6, dice: '2d6', success: { text: 'ok', flag: 'x', to: 'far' }, fail: { text: 'no', to: 'far' } });
  ok('Y5 无 skill → 不拼后缀(label 仅「碰运气」;skill==null 守卫)', findAct(e5, 'n2').label === '碰运气');
  // Y6 动态 dc:(S)=>n → 后缀显当前求值
  var e6 = eng({ id: 'dyn', label: '攀爬', skill: '感知', dc: function () { return 8; }, dice: '2d6', success: { text: 'ok', flag: 'x', to: 'far' }, fail: { text: 'no', to: 'far' } });
  ok('Y6 动态 dc 函数 → 后缀显当前求值「(感知·DC 8)」(变异=拼函数体而非求值→红)', findAct(e6, 'dyn').label === '攀爬(感知·DC 8)', findAct(e6, 'dyn').label);
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
