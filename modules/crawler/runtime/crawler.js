/* ════════════════════════════════════════════════════════════════════════
   Amatlas 迷宫爬行模块 · 运行时 (crawler/runtime/crawler.js)
   ════════════════════════════════════════════════════════════════════════
   为 node.kind='maze' 提供回合制第一人称迷宫游玩:
   · 玩家状态(坐标 + 朝向)存 state._maze[nodeKey],随档。
   · render → View.maze 投影意图(depths 数组),供 present-corridor 消费。
   · actions:左转/右转(恒可用)/ 前进(前方地板才出)/ 走出口(站在 exit 格)。
   · 移动/转向无 to → 核心原地 re-render(回合制,不换节点)。
   · 走出迷宫的出口动作带 to → 核心标准移动路径。

   设计依据(已查证):
   · Wizardry 块格墙模型(最简、作者好写)。
   · 第一人称 dungeon crawler(Dungeon Master / Etrian Odyssey)消失点投影。
   · Amatlas 契约 module-interface.md §2–§4:DOM-free / UMD / use-able 对象。

   硬约束:engine-core 零改 · 全部加性 · 确定性(无 Math.random/Date.now) ·
           UMD 包装 · SVG 不写字面 #000。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).Crawler = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ── 朝向工具 ────────────────────────────────────────────────── */
  // dir: 0=N 1=E 2=S 3=W (顺时针)
  var DIR_LETTER = ['N', 'E', 'S', 'W'];
  var DIR_NAME   = ['北', '东', '南', '西'];
  // 字母 → 0-3
  function letterToDir(ch) {
    var idx = DIR_LETTER.indexOf((ch || '').toUpperCase());
    return idx >= 0 ? idx : 0;
  }
  // 朝向 → 单位向量 {dx,dy};N=-y,E=+x,S=+y,W=-x
  var DELTA = [ {dx:0,dy:-1}, {dx:1,dy:0}, {dx:0,dy:1}, {dx:-1,dy:0} ];
  // 相对方向 → 相对于 facing 的左/右/后
  function turnLeft(dir)  { return (dir + 3) % 4; }
  function turnRight(dir) { return (dir + 1) % 4; }
  function turnBack(dir)  { return (dir + 2) % 4; }

  /* ── 网格工具 ────────────────────────────────────────────────── */
  // 给定 grid(行数组)和坐标,返回该格字符;越界返回 '#'(视为实心墙)
  function cellAt(grid, x, y) {
    if (y < 0 || y >= grid.length) return '#';
    var row = grid[y] || '';
    if (x < 0 || x >= row.length) return '#';
    return row[x];
  }
  // 判断某格是否为地板(非 '#');越界也当墙
  function isFloor(grid, x, y) { return cellAt(grid, x, y) !== '#'; }

  /* ── 前方格坐标 ──────────────────────────────────────────────── */
  function frontPos(x, y, dir) {
    var d = DELTA[dir];
    return { x: x + d.dx, y: y + d.dy };
  }
  // 左邻格
  function leftPos(x, y, dir) {
    var ld = DELTA[turnLeft(dir)];
    return { x: x + ld.dx, y: y + ld.dy };
  }
  // 右邻格
  function rightPos(x, y, dir) {
    var rd = DELTA[turnRight(dir)];
    return { x: x + rd.dx, y: y + rd.dy };
  }

  /* ── 投影计算(§3 核心逻辑) ──────────────────────────────────── */
  // 产出 depths 数组:从 pos 沿 facing 逐格 d=0,1,2…
  // 每层: { left:bool, right:bool, front:bool, content? }
  //   left/right = 该格的左/右邻格是否为墙
  //   front:true = 下一格是墙(该层是走廊末端),此层后不再增加层
  //   content = 'exit'|字面 look 串|null(格 cell 内容标记)
  function buildDepths(grid, cells, x, y, dir, maxDepth) {
    var depths = [];
    var cx = x, cy = y;
    var d = DELTA[dir];
    var depth = maxDepth != null ? maxDepth : 5;

    for (var i = 0; i < depth; i++) {
      var lp = leftPos(cx, cy, dir);
      var rp = rightPos(cx, cy, dir);
      var leftWall  = !isFloor(grid, lp.x, lp.y);
      var rightWall = !isFloor(grid, rp.x, rp.y);

      // 当前格单元格内容(cells 键为 "x,y")
      var cellKey = cx + ',' + cy;
      var cellData = cells && cells[cellKey];
      var content = null;
      if (cellData && cellData.exit) {
        content = 'exit';
      } else if (cellData && cellData.look) {
        content = cellData.look;
      }

      var layer = { left: leftWall, right: rightWall, front: false, content: content };

      // 前方格是否是墙(或越界)
      var fp = { x: cx + d.dx, y: cy + d.dy };
      var frontWall = !isFloor(grid, fp.x, fp.y);

      if (frontWall) {
        layer.front = true;
        depths.push(layer);
        break;
      }

      depths.push(layer);
      // 前进到下一格
      cx = fp.x;
      cy = fp.y;
    }

    return depths;
  }

  /* ── nodeKey 派生(同 amatlas 约定 map/node) ─────────────────── */
  function nodeKey(state) {
    return state.pos.map + '/' + state.pos.node;
  }

  /* ── state._maze[key] = {x,y,dir};读取路径不写 state ───────── */
  function newMazeState(mazeStart) {
    return {
      x: mazeStart.x != null ? mazeStart.x : 0,
      y: mazeStart.y != null ? mazeStart.y : 0,
      dir: letterToDir(mazeStart.dir)
    };
  }

  function getMazeState(state, key, mazeStart) {
    if (state._maze && state._maze[key]) return state._maze[key];
    return newMazeState(mazeStart);
  }

  // 只允许状态转移路径物化 canonical 迷宫状态；render/actions 生成阶段继续纯读。
  function ensureMazeState(state, key, mazeStart) {
    if (!state._maze) state._maze = {};
    if (!state._maze[key]) state._maze[key] = newMazeState(mazeStart);
    return state._maze[key];
  }

  // once look 在“离开当前格”这个明确状态转移点消费；render/view 只读，重复观察不改变游戏。
  function markCurrentCellSeen(state, key, cells) {
    var ms = state._maze && state._maze[key];
    if (!ms) return;
    var cellKey = ms.x + ',' + ms.y;
    var cell = cells[cellKey];
    if (!cell || !cell.once || !cell.look) return;
    if (!state._mazeSeen) state._mazeSeen = {};
    state._mazeSeen[key + '@' + cellKey] = 1;
  }

  /* ── createCrawlerModule ────────────────────────────────────── */
  function createCrawlerModule(opts) {
    opts = opts || {};

    var mod = {
      id: 'crawler',
      nodeKinds: ['maze'],

      /* systems: on:'enter' 初始化当前迷宫节点的玩家状态 */
      systems: [
        {
          on: 'enter',
          run: function (state, ev) {
            var node = ev.node;
            if (!node || !node.maze) return;
            var key = state.pos.map + '/' + state.pos.node;
            // 只在未初始化时设；重访不重置(保留玩家进度)。与动作侧共用同一个物化入口。
            ensureMazeState(state, key, node.maze.start || { x: 0, y: 0, dir: 'N' });
          }
        }
      ],

      /* render: 产 View{title,body,status,maze} */
      render: function (state, node) {
        var maze = node.maze || {};
        var grid = maze.grid || [];
        var cells = maze.cells || {};
        var depth = maze.depth != null ? maze.depth : 5;

        var key = nodeKey(state);
        // 懒初始化(on:enter 不一定先于首次 render,防御性兜底)
        var ms = getMazeState(state, key, maze.start || { x: 0, y: 0, dir: 'N' });

        // 当前格 look 文本
        var cellKey = ms.x + ',' + ms.y;
        var cellData = cells[cellKey];
        var lookText = '';
        if (cellData && cellData.look) {
          // once:只在未访问过时显示(用 state._mazeSeen 账本)
          if (cellData.once) {
            var seenKey = key + '@' + cellKey;
            if (!state._mazeSeen || !state._mazeSeen[seenKey]) lookText = cellData.look;
          } else {
            lookText = cellData.look;
          }
        }

        var body = [];
        if (lookText) {
          body.push({ type: 'prose', text: lookText });
        }

        // 朝向提示(简洁,附加信息)
        var dirLabel = DIR_NAME[ms.dir] || '';
        body.push({ type: 'prose', text: '【朝向:' + dirLabel + '】' });

        // 投影意图
        var depths = buildDepths(grid, cells, ms.x, ms.y, ms.dir, depth);

        return {
          title: node.title || node.name || '迷宫',
          body: body,
          status: [{ label: '朝向', value: DIR_LETTER[ms.dir] }],
          maze: {
            facing: ms.dir,
            depths: depths,
            move: ms.lastMove || null,   // round13:刚发生的移动('forward'|'left'|'right'|'back'|null)→ present-corridor 据此播入场动画(首屏/无移动=null=静态)
            seq: ms.seq || 0             // 步序号(每次移动 +1)→ 连续同向移动 SVG 字节可能相同,presenter 靠 seq 变化判定"新一步"重播动画
          }
        };
      },

      /* actions: 左转/右转/前进/走出口 */
      actions: function (state, node) {
        var maze = node.maze || {};
        var grid = maze.grid || [];
        var cells = maze.cells || {};

        var key = nodeKey(state);
        var mazeStart = maze.start || { x: 0, y: 0, dir: 'N' };
        var ms = getMazeState(state, key, mazeStart);

        var acts = [];

        // ── 左转(恒可用,改 dir,原地 re-render) ────────
        acts.push({
          id: 'turn-left',
          label: '左转',
          kind: 'act',
          run: function (st) {
            var current = ensureMazeState(st, key, mazeStart);
            current.dir = turnLeft(current.dir);
            current.lastMove = 'left'; current.seq = (current.seq || 0) + 1;
          }
        });

        // ── 右转(恒可用,改 dir,原地 re-render) ────────
        acts.push({
          id: 'turn-right',
          label: '右转',
          kind: 'act',
          run: function (st) {
            var current = ensureMazeState(st, key, mazeStart);
            current.dir = turnRight(current.dir);
            current.lastMove = 'right'; current.seq = (current.seq || 0) + 1;
          }
        });

        // ── 后转(可选,恒可用) ───────────────────────────
        acts.push({
          id: 'turn-back',
          label: '后转',
          kind: 'act',
          run: function (st) {
            var current = ensureMazeState(st, key, mazeStart);
            current.dir = turnBack(current.dir);
            current.lastMove = 'back'; current.seq = (current.seq || 0) + 1;
          }
        });

        // ── 前进(前方是地板才产出) ──────────────────────
        var fp = frontPos(ms.x, ms.y, ms.dir);
        if (isFloor(grid, fp.x, fp.y)) {
          // 捕获快照值(闭包用局部变量,避免 ms 被后续动作执行后修改)
          var nextX = fp.x, nextY = fp.y;
          acts.push({
            id: 'move-forward',
            label: '前进',
            kind: 'act',
            run: function (st) {
              var current = ensureMazeState(st, key, mazeStart);
              markCurrentCellSeen(st, key, cells);
              current.x = nextX;
              current.y = nextY;
              current.lastMove = 'forward'; current.seq = (current.seq || 0) + 1;
            }
          });
        }

        // ── 走出口(站在 cells[x,y].exit 格时产出 move 动作) ──
        var cellKey2 = ms.x + ',' + ms.y;
        var cellData2 = cells[cellKey2];
        if (cellData2 && cellData2.exit && cellData2.exit.to) {
          acts.push({
            id: 'exit-maze',
            label: cellData2.exit.label || '离开迷宫',
            kind: 'move',
            to: cellData2.exit.to,
            run: function (st) {
              ensureMazeState(st, key, mazeStart);
              markCurrentCellSeen(st, key, cells);
            }
          });
        }

        return acts;
      }
    };

    mod.install = function (api) { api.registerModule(mod); };
    return mod;
  }

  return { createCrawlerModule: createCrawlerModule };
});
