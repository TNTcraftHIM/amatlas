/* ════════════════════════════════════════════════════════════════════════
   迷宫模块验证(纯 node,无需 jsdom;随 test/run.cjs)
   核心命题:crawler 模块经统一 engine.use 插上 → maze 节点可渲染,
   投影正确、移动/转向改 state、走到 exit 格产 kind:move 动作、engine-core 零改。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
var Amatlas = require('../../../core/runtime/engine-core.js');
var CR    = require('../runtime/crawler.js');

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name); pass++; }
  else { console.log('  X   ' + name + (detail ? '  → ' + detail : '')); fail++; }
}

// ── 测试迷宫:5×5 小迷宫(与设计稿示例一致)─────────────────────────────
//   '#####'          行 0
//   '#...#'          行 1  玩家起点 (1,1) 朝 N
//   '#.#.#'          行 2  (2,2) 是墙,侧开口在 (1,2)/(3,2)
//   '#..E#'          行 3  (3,3) = E 地板+内容(exit 格)
//   '#####'          行 4
function makeWorld(startOverride) {
  return {
    seed: 42,
    id: '18181818-1818-4818-8818-181818181818', start: { map: 'dungeon', node: 'cellar' },
    maps: {
      dungeon: {
        name: '地牢',
        nodes: {
          cellar: {
            kind: 'maze',
            title: '地窖',
            maze: {
              grid: [ '#####', '#...#', '#.#.#', '#..E#', '#####' ],
              start: startOverride || { x: 1, y: 1, dir: 'S' },
              depth: 4,
              cells: {
                '3,3': { exit: { to: 'hall', label: '推开石门走出去' }, look: '墙上一道石门。' },
                '1,3': { look: '地上有具白骨。', once: true }
              }
            }
          },
          hall: {
            kind: 'maze',
            title: '大厅',
            maze: {
              grid: [ '###', '#.#', '###' ],
              start: { x: 1, y: 1, dir: 'N' }
            }
          }
        }
      }
    }
  };
}

function mkEngine(startOverride) {
  var w = makeWorld(startOverride);
  var e = Amatlas.createEngine(w, {});
  e.use(CR.createCrawlerModule());
  e.start();
  return e;
}

function findAct(e, idOrLabel) {
  var acts = e.view().actions;
  return acts.filter(function (a) { return a.id === idOrLabel || a.label === idOrLabel; })[0];
}

console.log('crawler 模块验证');

/* A. 注册 + 基本 dispatch ────────────────────────────────────────────── */
var mod = CR.createCrawlerModule();
ok('A1 createCrawlerModule 返回 use-able 模块(带 install)', typeof mod.install === 'function');
ok('A2 模块 id=crawler, nodeKinds=[maze]', mod.id === 'crawler' && mod.nodeKinds[0] === 'maze');
var eA = mkEngine();
var vA = eA.view();
ok('A3 经 use 插上后 maze 节点可渲染(核心零改)', !!vA.view && vA.view.title === '地窖');
ok('A4 view.maze 意图存在且含 facing+depths', !!(vA.view.maze && typeof vA.view.maze.facing === 'number' && Array.isArray(vA.view.maze.depths)));

/* B. enter 系统:进 maze 节点时从 start 初始化 pos ───────────────────── */
// start 朝 S → dir 应为 2(N=0,E=1,S=2,W=3)
var eB = mkEngine({ x: 1, y: 1, dir: 'S' });
ok('B1 enter 后 _maze 状态已初始化', !!(eB.state._maze));
var bKey = Object.keys(eB.state._maze)[0];
ok('B2 起始坐标正确 (x=1, y=1)', eB.state._maze[bKey].x === 1 && eB.state._maze[bKey].y === 1);
ok('B3 方向字母 S 转数字 2(内部 dir 0-3)', eB.state._maze[bKey].dir === 2);

// 其他初始方向
var eB2 = mkEngine({ x: 1, y: 1, dir: 'N' });
var bKey2 = Object.keys(eB2.state._maze)[0];
ok('B4 方向字母 N 转数字 0', eB2.state._maze[bKey2].dir === 0);
var eB3 = mkEngine({ x: 1, y: 1, dir: 'E' });
var bKey3 = Object.keys(eB3.state._maze)[0];
ok('B5 方向字母 E 转数字 1', eB3.state._maze[bKey3].dir === 1);
var eB4 = mkEngine({ x: 1, y: 1, dir: 'W' });
var bKey4 = Object.keys(eB4.state._maze)[0];
ok('B6 方向字母 W 转数字 3', eB4.state._maze[bKey4].dir === 3);

/* C. 投影(depths 计算)────────────────────────────────────────────────
   迷宫:
     '#####'
     '#...#'
     '#.#.#'
     '#..E#'
     '#####'
   站在 (1,1) 朝 S(+y 方向):前方格 (1,2),(1,3)
     d=0: 当前格 (1,1)  左(W)=(0,1)=墙  右(E)=(2,1)=. 开口
     d=1: 前方格 (1,2)  左(W)=(0,2)=墙  右(E)=(2,2)=# 墙;(1,3) 存在=不停
     d=2: 前方格 (1,3)  左(W)=(0,3)=墙  右(E)=(2,3)=. 开口;(1,4)=墙→front:true,停
   ────────────────────────────────────────────────────────────────────── */
var eC = mkEngine({ x: 1, y: 1, dir: 'S' });
var mC = eC.view().view.maze;
ok('C1 depths 至少 3 层(直走廊+停)', mC.depths.length >= 3);
// 朝 S(向下,dir=2):玩家左手指向【东(+x)】、右手指向【西(-x)】(站着面朝页面下方,左手在东侧)。
//   d=0 当前格(1,1):left=东邻(2,1)=. → false(开口);right=西邻(0,1)=# → true(墙)。
//   (修:原断言把朝 S 的左右写反了——同测试朝 E 的 C8/C9 用的是正确约定、此处与之矛盾;以真实左右为准。)
ok('C2 d=0: left=开口(false,东侧 (2,1) 是地板)', mC.depths[0].left === false,
   'left=' + mC.depths[0].left);
ok('C3 d=0: right=墙(true,西侧 (0,1) 是 #)', mC.depths[0].right === true,
   'right=' + mC.depths[0].right);
// d=1 格(1,2):left=东邻(2,2)=# → true,right=西邻(0,2)=# → true(两侧皆墙)
ok('C4 d=1: left=墙(true)', mC.depths[1].left === true);
ok('C5 d=1: right=墙(true)', mC.depths[1].right === true);
// d=2: 前方 (1,4)=# → front:true,停止
ok('C6 最终层 front=true(前方是墙)', mC.depths[mC.depths.length - 1].front === true);
// d=0 不是前墙层(还有前方)
ok('C7 d=0 front=false(还有前方可走)', mC.depths[0].front === false);

// 站在 (2,1) 朝 E:前方 (3,1),(4,1)=(边界=墙)
// d=0: left=(2,0)=# 墙, right=(2,2)=# 墙
// d=1: 前方 (3,1)=. left=(3,0)=# 墙 right=(3,2)=. 开口; (4,1)=# → front:true 停
var eC2 = mkEngine({ x: 2, y: 1, dir: 'E' });
var mC2 = eC2.view().view.maze;
ok('C8 站 (2,1) 朝 E: d=0 left=墙(上方)', mC2.depths[0].left === true);
ok('C9 站 (2,1) 朝 E: d=0 right=墙(下方)', mC2.depths[0].right === true);
// d=1 right=(3,2)=. 开口
ok('C10 站 (2,1) 朝 E: d=1 right=开口(3,2=.)', mC2.depths[1] && mC2.depths[1].right === false,
   'd1.right=' + (mC2.depths[1] && mC2.depths[1].right));
// 前方最终 front:true
ok('C11 站 (2,1) 朝 E: 最终层 front=true(紧邻边界)', mC2.depths[mC2.depths.length - 1].front === true);

// 站在 (1,1) 朝 N:前方 (1,0)=# → d=0 直接 front:true
var eC3 = mkEngine({ x: 1, y: 1, dir: 'N' });
var mC3 = eC3.view().view.maze;
ok('C12 正前方是墙: depths[0].front=true(d=0 即停)', mC3.depths[0].front === true);
ok('C13 正前方是墙: depths 只有 1 层', mC3.depths.length === 1,
   'len=' + mC3.depths.length);

/* D. 移动:前进、转向 ──────────────────────────────────────────────────
   起点 (1,1) 朝 S:前方 (1,2) 是地板 → 前进可用
   ────────────────────────────────────────────────────────────────────── */
var eD = mkEngine({ x: 1, y: 1, dir: 'S' });
var dKey = Object.keys(eD.state._maze)[0];

// D1: 转左(S→E)不应移动
var turnLeft = findAct(eD, 'turn-left') || findAct(eD, '左转');
ok('D1 actions 含转左动作', !!turnLeft, '动作列表:' + eD.view().actions.map(function(a){return a.id||a.label;}).join(','));
eD.apply(turnLeft);
var posAfterLeft = eD.state._maze[dKey];
ok('D2 转左后坐标不变(x=1,y=1)', posAfterLeft.x === 1 && posAfterLeft.y === 1);
ok('D3 转左 S→E: dir 从 2 → 1', posAfterLeft.dir === 1,
   'dir=' + posAfterLeft.dir);

// D2: 再转左 E→N
eD.apply(findAct(eD, 'turn-left') || findAct(eD, '左转'));
ok('D4 再转左 E→N: dir=0', eD.state._maze[dKey].dir === 0,
   'dir=' + eD.state._maze[dKey].dir);

// D3: 转右(N→E)
var turnRight = findAct(eD, 'turn-right') || findAct(eD, '右转');
ok('D5 actions 含转右动作', !!turnRight);
eD.apply(turnRight);
ok('D6 转右 N→E: dir=1', eD.state._maze[dKey].dir === 1,
   'dir=' + eD.state._maze[dKey].dir);

// D4: 朝 S 站 (1,1),前进到 (1,2)
var eD2 = mkEngine({ x: 1, y: 1, dir: 'S' });
var dKey2 = Object.keys(eD2.state._maze)[0];
var fwd = findAct(eD2, 'move-forward') || findAct(eD2, '前进');
ok('D7 前方是地板时前进动作存在', !!fwd, '动作列表:' + eD2.view().actions.map(function(a){return a.id||a.label;}).join(','));
eD2.apply(fwd);
ok('D8 前进后 y+1 (1,1)→(1,2)', eD2.state._maze[dKey2].x === 1 && eD2.state._maze[dKey2].y === 2,
   'x=' + eD2.state._maze[dKey2].x + ' y=' + eD2.state._maze[dKey2].y);
ok('D9 前进后方向不变', eD2.state._maze[dKey2].dir === 2);

// D5: 撞墙不动——(1,2) 朝 W,左边 (0,2)=# 墙 → 前进不应出现
// 先走到 (1,2),再改方向朝 W(dir=3)
eD2.state._maze[dKey2].dir = 3;   // 强制朝 W
var fwdWall = findAct(eD2, 'move-forward') || findAct(eD2, '前进');
ok('D10 前方是墙时前进动作不存在', !fwdWall,
   '不应有前进但找到:' + (fwdWall && (fwdWall.id || fwdWall.label)));

// D6: 强制改坐标到边界 (0,2) 朝 W → 越界当墙 → 前进不存在
var eDedge = mkEngine({ x: 1, y: 2, dir: 'W' });
var dKeyEdge = Object.keys(eDedge.state._maze)[0];
// (1,2) 朝 W → 前方 (0,2)=# → 不出前进
ok('D11 越界方向当墙:前进不存在', !(findAct(eDedge, 'move-forward') || findAct(eDedge, '前进')));

/* E. 走到 exit 格 → actions 含 kind:move 的 to 动作 ──────────────────
   exit 格 = cells['3,3'], to:'hall'
   走到 (3,3):先从 (1,1) 朝 S 前进到 (1,2),再到 (1,3),再转右到 E,前进到 (2,3),(3,3)
   ────────────────────────────────────────────────────────────────────── */
var eE = mkEngine({ x: 3, y: 3, dir: 'N' });   // 直接放在 exit 格上
var eEActs = eE.view().actions;
var exitAct = eEActs.filter(function (a) { return a.kind === 'move' && a.to === 'hall'; })[0];
ok('E1 站在 exit 格时 actions 含 kind:move to=hall', !!exitAct,
   '动作列表:' + JSON.stringify(eEActs.map(function(a){return {id:a.id,label:a.label,to:a.to,kind:a.kind};})));
ok('E2 exit 动作带正确 label', typeof exitAct.label === 'string' && exitAct.label.length > 0);

// apply exit 动作后进入 hall 节点
eE.apply(exitAct);
ok('E3 apply exit 动作后进入目标节点', eE.view().pos.node === 'hall');

// 非 exit 格不产 exit 动作
var eE2 = mkEngine({ x: 1, y: 1, dir: 'S' });
var exitAct2 = eE2.view().actions.filter(function (a) { return a.kind === 'move' && a.to === 'hall'; })[0];
ok('E4 非 exit 格不产 to=hall 动作', !exitAct2);

/* F. 转向恒可用(probe 不误判死节点)───────────────────────────────────
   即使前方是墙(无前进动作),转左/转右仍恒可用。
   ────────────────────────────────────────────────────────────────────── */
var eF = mkEngine({ x: 1, y: 1, dir: 'N' });   // 正前方 (1,0)=# → 无前进
var fActs = eF.view().actions;
var hasTurnLeft  = fActs.some(function (a) { return a.id === 'turn-left'  || a.label === '左转'; });
var hasTurnRight = fActs.some(function (a) { return a.id === 'turn-right' || a.label === '右转'; });
ok('F1 前方是墙时转左仍存在', hasTurnLeft);
ok('F2 前方是墙时转右仍存在', hasTurnRight);
ok('F3 前方是墙时无前进动作(撞墙不动)', !fActs.some(function (a) { return a.id === 'move-forward' || a.label === '前进'; }));

/* G. status + body ──────────────────────────────────────────────────── */
var eG = mkEngine({ x: 1, y: 1, dir: 'S' });
var vG = eG.view().view;
ok('G1 render 产出 title', typeof vG.title === 'string' && vG.title.length > 0);
ok('G2 render 产出 body 数组', Array.isArray(vG.body));
// status 应含朝向信息
ok('G3 render 产出 status(含朝向)', Array.isArray(vG.status) && vG.status.some(function (s) {
  return /[NESW南北东西朝向]/.test(s.value || s.label || '');
}));

// cells look 文本应出现在 body
var eG2 = mkEngine({ x: 3, y: 3, dir: 'N' });   // exit 格有 look
var vG2 = eG2.view().view;
ok('G4 站在有 look 的格子 body 含 look 文本', vG2.body.some(function (b) { return /石门/.test(b.text || ''); }));

// G5 once cell 的 render/view 必须纯读：首次可见性由已提交的“进入该格”状态决定，重复 view 不消费内容。
(function () {
  var e = mkEngine({ x: 1, y: 3, dir: 'N' });
  var before = e.serialize();
  var first = e.view();
  var middle = e.serialize();
  var second = e.view();
  var after = e.serialize();
  ok('G5 once 格首次 look 可见', first.view.body.some(function (b) { return /白骨/.test(b.text || ''); }));
  ok('G6 重复 view 不改 state 字节(_mazeSeen 不在 render 中写)', before === middle && middle === after);
  ok('G7 同一已提交状态重复 view 输出一致，不因读取而消费 once look', JSON.stringify(first.view.body) === JSON.stringify(second.view.body));
  var key = Object.keys(e.state._maze)[0];
  e.state._maze[key].dir = 2; // (1,3) 朝 S，前方 (1,4) 是墙；改朝 N 后前进到 (1,2)
  e.apply(findAct(e, 'turn-back'));
  e.apply(findAct(e, 'move-forward'));
  e.state._maze[key].dir = 2;
  e.apply(findAct(e, 'move-forward'));
  ok('G8 离开 once 格时才提交 _mazeSeen，重返后 look 隐藏', e.state._mazeSeen && e.state._mazeSeen[key + '@1,3'] === 1 && !e.view().view.body.some(function (b) { return /白骨/.test(b.text || ''); }));
})();

// G9/G10:合法存档可缺模块私有 _maze；恢复视图与动作必须共用同一个 canonical 起点，不能显示正常却点击 no-op。
(function () {
  var e = mkEngine({ x: 1, y: 1, dir: 'E' });
  var save = JSON.parse(e.serialize());
  delete save.state._maze;
  var loaded = e.load(JSON.stringify(save));
  var before = e.view();
  var forward = findAct(e, 'move-forward');
  e.apply(forward);
  var key = 'dungeon/cellar';
  ok('G9 缺 _maze 的合法档可恢复，且首屏仍从 maze.start 投影', loaded === true && before.view.maze.facing === 1 && !!forward);
  ok('G10 恢复后的首次前进会物化 canonical _maze 并完成动作，不是永久 no-op',
    !!(e.state._maze && e.state._maze[key]) && e.state._maze[key].x === 2 && e.state._maze[key].y === 1 && e.state._maze[key].seq === 1,
    JSON.stringify(e.state._maze));
})();

// G11:出口与前进同为“离开当前格”的状态转移；缺 _maze 恢复后从起点直接走出口也必须先物化再消费 once。
(function () {
  var w = makeWorld({ x: 1, y: 1, dir: 'N' });
  w.maps.dungeon.nodes.cellar.maze.cells['1,1'] = {
    look: '只显示一次的出口刻字。', once: true,
    exit: { to: 'hall', label: '立刻离开' }
  };
  var e = Amatlas.createEngine(w, {});
  e.use(CR.createCrawlerModule());
  e.start();
  var save = JSON.parse(e.serialize());
  delete save.state._maze;
  e.load(JSON.stringify(save));
  e.apply(findAct(e, 'exit-maze'));
  e.enter({ map: 'dungeon', node: 'cellar' });
  ok('G11 缺 _maze 恢复后直接走出口也提交 once seen，重返不复现刻字',
    e.state._mazeSeen && e.state._mazeSeen['dungeon/cellar@1,1'] === 1 &&
    !e.view().view.body.some(function (b) { return /出口刻字/.test(b.text || ''); }));
})();

/* H. 多迷宫 keyed state(两个引擎实例互不干扰)────────────────────────── */
var eH1 = mkEngine({ x: 1, y: 1, dir: 'S' });
var eH2 = mkEngine({ x: 3, y: 3, dir: 'N' });
var hKey1 = Object.keys(eH1.state._maze)[0];
var hKey2 = Object.keys(eH2.state._maze)[0];
ok('H1 两引擎实例互不共享 _maze 状态', eH1.state._maze[hKey1].y !== eH2.state._maze[hKey2].y ||
   eH1.state._maze[hKey1].x !== eH2.state._maze[hKey2].x);
// 对第一个引擎前进,不影响第二个
var fwdH = findAct(eH1, 'move-forward') || findAct(eH1, '前进');
if (fwdH) {
  eH1.apply(fwdH);
  ok('H2 eH1 前进后 y 增大', eH1.state._maze[hKey1].y === 2);
  ok('H3 eH1 移动不影响 eH2 位置', eH2.state._maze[hKey2].y === 3);
} else {
  ok('H2 跳过(前方无前进)', true);
  ok('H3 跳过', true);
}

/* I. view.maze 意图字段完整性 ──────────────────────────────────────────
   depths 每项必须有 left/right/front 布尔字段。
   ────────────────────────────────────────────────────────────────────── */
var eI = mkEngine({ x: 1, y: 1, dir: 'S' });
var mI = eI.view().view.maze;
var depthsOk = mI.depths.every(function (d) {
  return typeof d.left === 'boolean' && typeof d.right === 'boolean' && typeof d.front === 'boolean';
});
ok('I1 depths 每层含 left/right/front 布尔', depthsOk,
   'depths=' + JSON.stringify(mI.depths));
ok('I2 facing 是 0-3 整数', mI.facing >= 0 && mI.facing <= 3 && mI.facing === Math.floor(mI.facing));

/* J. 移动确定性(同种子同路径同投影)────────────────────────────────────
   两个同种子引擎,各自走相同步骤,最终 _maze 状态相同。
   ────────────────────────────────────────────────────────────────────── */
function walkPath(e) {
  var fwd = findAct(e, 'move-forward') || findAct(e, '前进');
  if (fwd) e.apply(fwd);
  var tl = findAct(e, 'turn-left') || findAct(e, '左转');
  if (tl) e.apply(tl);
  return e;
}
var eJ1 = mkEngine({ x: 1, y: 1, dir: 'S' });
var eJ2 = mkEngine({ x: 1, y: 1, dir: 'S' });
walkPath(eJ1); walkPath(eJ2);
var jKey1 = Object.keys(eJ1.state._maze)[0];
var jKey2 = Object.keys(eJ2.state._maze)[0];
ok('J1 同路径两引擎实例最终坐标相同',
   eJ1.state._maze[jKey1].x === eJ2.state._maze[jKey2].x &&
   eJ1.state._maze[jKey1].y === eJ2.state._maze[jKey2].y &&
   eJ1.state._maze[jKey1].dir === eJ2.state._maze[jKey2].dir);
// 两次 view.maze depths 完全相同(确定性)
var m1 = eJ1.view().view.maze;
var m2 = eJ2.view().view.maze;
ok('J2 同状态两次 depths 输出字节相同', JSON.stringify(m1) === JSON.stringify(m2));

// K. 移动/转向意图(round13 动画支持):move 动作设 maze.move + seq 递增(供 present-corridor 播入场动画)
(function () {
  var e = mkEngine();   // start (1,1) 朝 S(makeWorld 默认)
  function applyId(id) { var a = e.view().actions.filter(function (x) { return x.id === id; })[0]; if (a) e.apply(a); return !!a; }
  var v0 = e.view().view.maze;
  ok('K1 首屏 move=null、seq=0(无入场动画)', (v0.move == null) && v0.seq === 0);
  applyId('turn-left');                       // S → E
  var v1 = e.view().view.maze;
  ok('K2 左转 → maze.move="left"、seq=1', v1.move === 'left' && v1.seq === 1);
  ok('K3 朝 E 有前进动作(前方地板)', e.view().actions.some(function (a) { return a.id === 'move-forward'; }));
  applyId('move-forward');                    // (1,1) → (2,1)
  var v2 = e.view().view.maze;
  ok('K4 前进 → move="forward"、seq=2(连续移动 seq 单调增 → presenter 必重播动画)', v2.move === 'forward' && v2.seq === 2);
  applyId('turn-right');
  ok('K5 右转 → move="right"、seq=3', e.view().view.maze.move === 'right' && e.view().view.maze.seq === 3);
  applyId('turn-back');
  ok('K6 后转 → move="back"、seq=4', e.view().view.maze.move === 'back' && e.view().view.maze.seq === 4);
})();

console.log('\n' + (fail === 0 ? '全部通过' : fail + ' 个失败') + '  pass=' + pass + ' fail=' + fail);
process.exit(fail > 0 ? 1 : 0);
