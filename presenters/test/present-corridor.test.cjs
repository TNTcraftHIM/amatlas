/* ════════════════════════════════════════════════════════════════════════
   走廊呈现器验证(纯 node,无需 jsdom;随 test/run.cjs)
   核心命题:buildCorridorSVG 纯函数对样例 depths 产合法 SVG,
   无抛、无字面 #000、确定性(两次同输出)、层数随 depths 变。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
var CP = require('../present-corridor.js');

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name); pass++; }
  else { console.log('  X   ' + name + (detail ? '  → ' + detail : '')); fail++; }
}

// buildCorridorSVG 导出情况
ok('A1 present-corridor 导出 buildCorridorSVG 纯函数', typeof CP.buildCorridorSVG === 'function');
ok('A2 present-corridor 导出 createCorridorPresenter 工厂', typeof CP.createCorridorPresenter === 'function');

/* B. 直走廊(多层 front 在尽头)────────────────────────────────────────
   5 层直走廊:前 4 层 front:false, 第 5 层 front:true(尽头)
   ────────────────────────────────────────────────────────────────────── */
var straightCorridorDepths = [
  { left: true,  right: true,  front: false },  // d=0 两侧墙,走廊继续
  { left: true,  right: true,  front: false },  // d=1
  { left: true,  right: true,  front: false },  // d=2
  { left: true,  right: true,  front: false },  // d=3
  { left: true,  right: true,  front: true  }   // d=4 尽头前墙
];
var svgStraight;
try {
  svgStraight = CP.buildCorridorSVG({ facing: 0, depths: straightCorridorDepths });
  ok('B1 直走廊(5层)不抛', true);
} catch (e) {
  ok('B1 直走廊(5层)不抛', false, e.message);
  svgStraight = '';
}
ok('B2 输出含 <svg', typeof svgStraight === 'string' && svgStraight.indexOf('<svg') >= 0);
ok('B3 输出含 </svg>', svgStraight.indexOf('</svg>') >= 0);
ok('B4 无字面 #000(派生深色替代)', svgStraight.indexOf('#000') < 0,
   '发现 #000 位置:' + svgStraight.indexOf('#000'));

/* C. 正前方是墙(单层 front=true)──────────────────────────────────────
   d=0 即停:depths 只含一层且 front:true
   ────────────────────────────────────────────────────────────────────── */
var wallAheadDepths = [
  { left: true, right: true, front: true }
];
var svgWall;
try {
  svgWall = CP.buildCorridorSVG({ facing: 2, depths: wallAheadDepths });
  ok('C1 单层前墙不抛', true);
} catch (e) {
  ok('C1 单层前墙不抛', false, e.message);
  svgWall = '';
}
ok('C2 单层前墙输出含 <svg', svgWall.indexOf('<svg') >= 0);
ok('C3 单层前墙无 #000', svgWall.indexOf('#000') < 0);

/* D. 侧开口(left|right = false)────────────────────────────────────────
   d=0 两侧开口,d=1 左侧开口仅右墙,d=2 前墙
   ────────────────────────────────────────────────────────────────────── */
var sideOpenDepths = [
  { left: false, right: false, front: false },  // 两侧都开
  { left: false, right: true,  front: false },  // 左开右墙
  { left: true,  right: true,  front: true  }   // 前墙停
];
var svgSideOpen;
try {
  svgSideOpen = CP.buildCorridorSVG({ facing: 1, depths: sideOpenDepths });
  ok('D1 侧开口 depths 不抛', true);
} catch (e) {
  ok('D1 侧开口 depths 不抛', false, e.message);
  svgSideOpen = '';
}
ok('D2 侧开口输出含 <svg', svgSideOpen.indexOf('<svg') >= 0);
ok('D3 侧开口无 #000', svgSideOpen.indexOf('#000') < 0);
// 侧开口场景与两侧全墙场景 SVG 应不同(呈现器确实区分了开口)
ok('D4 侧开口 SVG 与全墙 SVG 不同(呈现器区分了开口)',
   svgSideOpen !== svgStraight.slice(0, svgSideOpen.length));

/* E. 确定性(两次同输入 → 输出字节完全相同)────────────────────────────── */
var maze1 = { facing: 0, depths: straightCorridorDepths };
var svg1a = CP.buildCorridorSVG(maze1);
var svg1b = CP.buildCorridorSVG(maze1);
ok('E1 直走廊两次调用输出完全相同(确定性)', svg1a === svg1b);

var maze2 = { facing: 3, depths: sideOpenDepths };
var svg2a = CP.buildCorridorSVG(maze2);
var svg2b = CP.buildCorridorSVG(maze2);
ok('E2 侧开口两次调用输出完全相同(确定性)', svg2a === svg2b);

var maze3 = { facing: 2, depths: wallAheadDepths };
var svg3a = CP.buildCorridorSVG(maze3);
var svg3b = CP.buildCorridorSVG(maze3);
ok('E3 单层前墙两次调用输出完全相同(确定性)', svg3a === svg3b);

/* F. 层数随 depths 变(输出随输入变化)──────────────────────────────────
   1 层 vs 5 层:更多层 → SVG 更长(包含更多图元)
   ────────────────────────────────────────────────────────────────────── */
var svgShort = CP.buildCorridorSVG({ facing: 0, depths: [
  { left: true, right: true, front: true }
]});
var svgLong = CP.buildCorridorSVG({ facing: 0, depths: straightCorridorDepths });
ok('F1 5层 SVG 长于 1层 SVG(层数越多图元越多)', svgLong.length > svgShort.length,
   '1层长度=' + svgShort.length + ' 5层长度=' + svgLong.length);

// 不同 facing 值(朝向)也产生合法输出
var facings = [0, 1, 2, 3];
var facingResults = facings.map(function (f) {
  var svg;
  try { svg = CP.buildCorridorSVG({ facing: f, depths: straightCorridorDepths }); } catch (e) { svg = ''; }
  return svg;
});
ok('F2 四个朝向各自产合法 SVG(均含<svg)',
   facingResults.every(function (s) { return s.indexOf('<svg') >= 0; }));
ok('F3 四个朝向输出均无 #000',
   facingResults.every(function (s) { return s.indexOf('#000') < 0; }));

/* G. edge case:空 depths 数组不抛(graceful)──────────────────────────── */
var svgEmpty;
try {
  svgEmpty = CP.buildCorridorSVG({ facing: 0, depths: [] });
  ok('G1 空 depths 不抛', true);
} catch (e) {
  ok('G1 空 depths 不抛', false, e.message);
  svgEmpty = '';
}
ok('G2 空 depths 输出仍含 <svg(骨架)', svgEmpty.indexOf('<svg') >= 0);
ok('G3 空 depths 无 #000', svgEmpty.indexOf('#000') < 0);

/* H. createCorridorPresenter:snap.view.maze 缺失 → no-op ─────────────
   用 headless(无 DOM)验证: present 返回不抛即可(slot 找不到→静默跳过)
   ────────────────────────────────────────────────────────────────────── */
var presenter = CP.createCorridorPresenter({ slot: '#nonexistent-slot' });
ok('H1 createCorridorPresenter 返回带 install 的对象', typeof presenter.install === 'function');
ok('H2 presenter 带 present 函数', typeof presenter.present === 'function');
// 无 maze 意图 → no-op 不抛
try {
  presenter.present({ view: { title: '非迷宫', body: [] }, actions: [], pos: { map: 'x', node: 'y' } });
  ok('H3 snap.view.maze 缺失时 present 不抛(no-op)', true);
} catch (e) {
  ok('H3 snap.view.maze 缺失时 present 不抛(no-op)', false, e.message);
}
// 有 maze 意图但 slot 不存在(DOM-free 环境)→ 不抛(静默 no-op)
try {
  presenter.present({
    view: { title: '地窖', maze: { facing: 0, depths: straightCorridorDepths } },
    actions: [], pos: { map: 'dungeon', node: 'cellar' }
  });
  ok('H4 slot 不存在时 present 不抛(DOM-free 静默)', true);
} catch (e) {
  ok('H4 slot 不存在时 present 不抛(DOM-free 静默)', false, e.message);
}

// M. 移动/转向入场动画(round13:端用户要"3D 引擎推进感";SMIL 声明式、停止态=静帧、reduced-motion 可剥)
(function () {
  var d = [{ left: true, right: false, front: false }, { left: false, right: true, front: true }];
  var stat = CP.buildCorridorSVG({ facing: 0, depths: d });
  var fwd = CP.buildCorridorSVG({ facing: 0, depths: d, move: 'forward' });
  var lft = CP.buildCorridorSVG({ facing: 0, depths: d, move: 'left' });
  var rgt = CP.buildCorridorSVG({ facing: 0, depths: d, move: 'right' });
  ok('M1 无 move → 不注入动画(字节 == 旧静帧,确定性/停止态守恒)', stat.indexOf('animateTransform') < 0 && stat === CP.buildCorridorSVG({ facing: 0, depths: d }));
  ok('M2 move:forward → 含 <animateTransform + 包动画 <g class="amatlas-corridor-move">', fwd.indexOf('<animateTransform') >= 0 && fwd.indexOf('amatlas-corridor-move') >= 0);
  ok('M3 forward 是中心放大(含 type="scale" + type="translate")', fwd.indexOf('type="scale"') >= 0 && fwd.indexOf('type="translate"') >= 0);
  ok('M4 move:left/right → 含 type="rotate"(绕中心回正,转身扫视)', lft.indexOf('type="rotate"') >= 0 && rgt.indexOf('type="rotate"') >= 0);
  ok('M5 动画 fill="freeze"(停止态冻结在 identity = 正确静帧)', fwd.indexOf('fill="freeze"') >= 0);
  ok('M6 reduced-motion 剥 SMIL → 无 animateTransform,但走廊内容(<g>+polygon)仍在 = 静帧', (function () {
    var stripped = fwd.replace(/<animateTransform\b[^>]*\/>/g, '');
    return stripped.indexOf('animateTransform') < 0 && stripped.indexOf('amatlas-corridor-move') >= 0 && stripped.indexOf('<polygon') >= 0;
  })());
  ok('M7 动画版仍合法、无字面 #000、确定性', fwd.indexOf('<svg') >= 0 && fwd.indexOf('#000') < 0 && fwd === CP.buildCorridorSVG({ facing: 0, depths: d, move: 'forward' }));
})();

console.log('\n' + (fail === 0 ? '全部通过' : fail + ' 个失败') + '  pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);
