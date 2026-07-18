/* ════════════════════════════════════════════════════════════════════════
   Amatlas arcade 范例模块 · 贪吃蛇 (arcade-demo/snake-module.js)
   ════════════════════════════════════════════════════════════════════════
   一个**自定义玩法模块**,认领 node.kind==='arcade',在节点里跑一局实时贪吃蛇,
   通关后桥回数据驱动状态机。它和 text-adventure/tabletop 用**同一等机制**
   (engine.use / manifest.modules + nodeKinds 路由),核心零改动——"escape hatch"
   只指"引擎不内置这段代码、你写",注册面是一等的。指引见
   text-adventure-game skill 的 references/puzzles-and-minigames.md §B。复制本文件→改 stepLogic/draw 即换成你的小游戏。

   ── 隔离纪律(照做才保住确定性/可测/存档;Bitsy / Ren'Py CDD 同款)──────────
   1. rAF loop 只读引擎 state 一次(进场),小游戏内部态留**模块局部变量 g**(不入档)。
   2. loop 内**绝不**写 engine.state 或调 render();只在「通关」离散边界一次 api.apply 回写。
   3. 通关回写用固定形态 api.apply({ run })(置作者在 node.winKey 声明的 state 键)→ 图审计/死键检查可见。
   4. 食物用 api.rng(种子 PRNG,非 Math.random)→ 逻辑可复现;stepLogic 是纯函数 → 可单测。
   5. 认输/跳过靠 world 数据里的无条件 link(present-dom 渲染进 #choices),不在此处管。

   ── 为什么探针/烟雾不会被它绊倒 ───────────────────────────────────────────
   · 装配探针把 requestAnimationFrame stub 成空操作 + document.getElementById 恒 null
     → startGame 在拿不到挂载点/2D 上下文时**优雅退化**(直接 return,不起 loop)→ 不崩、不挂起。
   · jsdom 烟雾无 canvas 2D 实现 → getContext('2d') 返回 null → 同样退化、不起 loop。
   · 故实时部分对自动闸"失明但无害";关卡的可达性/保底出口由 world 数据(声明式)保证。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).Snake = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createSnakeModule(opts) {
    opts = opts || {};
    var GRID    = opts.grid   || 12;            // 网格边长(格)
    var GOAL    = opts.goal   || 5;             // 默认通关苹果数(node.goal 优先)
    var STEP_MS = opts.stepMs || 140;           // 每步毫秒(固定步长喂逻辑;渲染插值无关确定性)
    var PX      = opts.px     || 22;            // 每格像素
    var STAGE   = opts.stageId || 'arcade-stage';

    var api = null, rafId = 0, running = false, loopGeneration = 0, keyHandler = null, hostDoc = null, stageEl = null;

    function activateArcade(state, node) {
      if (!node || node.kind !== 'arcade') return;
      if (node.winKey && state[node.winKey]) return;
      if (node.failKey && node.lockAfter && (state[node.failKey] || 0) >= node.lockAfter) return;
      try { startGame(node); }
      catch (e) { stop(); throw e; }
    }

    function handleEnter(state, ev) {
      stop();
      activateArcade(state, ev && ev.node);
    }

    function handleRestore(state, ev) {
      if (!ev || ev.phase === 'deactivate') { stop(); return; }
      if (ev.phase === 'activate' && ev.current) activateArcade(state, ev.current.node);
    }

    var mod = {
      id: 'snake',
      nodeKinds: ['arcade'],                    // ← 认领 kind:'arcade' 的节点(与内置模块平权,start() 预检认)
      systems: [
        { on: 'enter', run: handleEnter },
        { on: 'restore', run: handleRestore }
      ],

      render: function (state, node) {
        var won = node.winKey && state[node.winKey];
        var locked = node.failKey && node.lockAfter && (state[node.failKey] || 0) >= node.lockAfter;   // 撞死够多次=锁死态
        var text = won ? (node.wonText || '终端解锁了。')
                 : locked ? (node.lockedText || '终端锁死了——也许有别的法子进去。')
                 : (node.look || '终端弹出一局小游戏。用方向键 / WASD 或画布下方按钮操作；看不到画面时点「放弃」也能离开。');
        return {
          title: node.title || '终端小游戏',
          body: [{ type: 'prose', text: text }],
          status: []
        };
      },

      // 移动靠 node.links(通关门 / 认输)。**必须**经 api.linkActions 把 links 变成动作 → present-dom 渲染进 #choices;
      //   漏掉 = 节点的「放弃/通过」按钮整个不出现(核心 view() 不自动处理 links,模块要主动 concat;同 tabletop/text-adventure)。
      actions: function (state, node) { return api ? api.linkActions(node, state) : []; },

      install: function (a) {
        api = a;
        a.registerModule(mod);
        hostDoc = (typeof document !== 'undefined') ? document : null;
        // 玩法启停由 mod.systems 的 critical enter 生命周期承担；api.on 只适合可隔离 observer。
        // startGame 初始化异常必须传播给核心调用方，不能被 observer catch 后留下半挂 canvas/listener。
      }
    };

    function stop() {
      loopGeneration++;
      running = false;
      if (rafId && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId);
      rafId = 0;
      if (keyHandler && hostDoc && hostDoc.removeEventListener) hostDoc.removeEventListener('keydown', keyHandler);
      keyHandler = null;
      if (stageEl) { stageEl.textContent = ''; while (stageEl.children && stageEl.children.length) stageEl.removeChild(stageEl.children[0]); }
      stageEl = null;
    }

    function startGame(node) {
      if (!hostDoc || !hostDoc.getElementById) return;                  // 无 DOM(探针)→ 优雅退化
      var stage = hostDoc.getElementById(node.stageId || STAGE);
      if (!stage) return;                                               // 无挂载点 → 退化(玩家用「放弃」离开)
      stageEl = stage;
      var canvas = hostDoc.createElement('canvas');
      canvas.width = GRID * PX; canvas.height = GRID * PX;
      canvas.setAttribute('aria-label', '贪吃蛇小游戏画布');
      var ctx = canvas.getContext && canvas.getContext('2d');
      stage.textContent = ''; stage.appendChild(canvas);
      if (!ctx) return;                                                 // 无 2D 上下文(jsdom 烟雾)→ 不起 loop,探针/烟雾安全

      var goal = node.goal || GOAL;
      var failKey = node.failKey, lockAfter = node.lockAfter;   // 撞死计数键 + 锁死阈值(作者在 node 上声明,与 world fail-forward link 的 requires 一致)
      var deathCounted = false;                                 // 每次撞死只记一次(防每帧重复 +1);重开本局时清零
      var g = newGame();

      function newGame() {
        var s = { snake: [{ x: GRID >> 1, y: GRID >> 1 }], dir: { x: 1, y: 0 }, next: { x: 1, y: 0 }, eaten: 0, dead: false, food: null };
        s.food = placeFood(s);
        return s;
      }
      function placeFood(s) {
        for (var t = 0; t < 300; t++) {                                 // 用 api.rng(种子)→ 确定性,非 Math.random
          var fx = Math.floor(api.rng() * GRID), fy = Math.floor(api.rng() * GRID);
          if (!s.snake.some(function (c) { return c.x === fx && c.y === fy; })) return { x: fx, y: fy };
        }
        return { x: 0, y: 0 };
      }
      // 纯逻辑核(可单测:给定 g + 输入序列 + 同种子 rng → 同结果)。loop 只是按固定步长调它 + 绘制。
      function stepLogic(s) {
        if (s.dead) return s;
        s.dir = s.next;
        var head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };
        if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) { s.dead = true; return s; }
        if (s.snake.some(function (c) { return c.x === head.x && c.y === head.y; })) { s.dead = true; return s; }
        s.snake.unshift(head);
        if (s.food && head.x === s.food.x && head.y === s.food.y) { s.eaten++; s.food = placeFood(s); }
        else s.snake.pop();
        return s;
      }
      // rank8 fix:HUD 文案从 canvas fillText 移到 stage 内 DOM 文本节点 → 浏览器自动换行,不再被 canvas 边界截断,屏阅读器可见
      var hudEl = hostDoc.createElement('div');
      hudEl.className = 'amatlas-arcade-hud';
      hudEl.setAttribute('aria-live', 'polite');
      hudEl.style.cssText = 'width:' + (GRID * PX) + 'px;max-width:100%;font:13px/1.5 system-ui,sans-serif;color:#e8edf4;text-align:center;padding:4px 0;min-height:1.5em;word-break:keep-all';

      function draw() {
        ctx.fillStyle = '#0c1119'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (g.food) { ctx.fillStyle = '#b86a6a'; ctx.fillRect(g.food.x * PX + 3, g.food.y * PX + 3, PX - 6, PX - 6); }
        g.snake.forEach(function (c, i) { ctx.fillStyle = i === 0 ? '#9fc0d6' : '#6a8fa8'; ctx.fillRect(c.x * PX + 1, c.y * PX + 1, PX - 2, PX - 2); });
        // HUD 文案写 DOM(自动换行、可读屏),不写 canvas(rank8 fix)
        var hud = '苹果 ' + g.eaten + ' / ' + goal;
        if (g.dead) {                                                   // 清晰呈现剩余次数,别让锁死显得像 bug(调研:surface attempts remaining)
          var fails = (api.state && failKey) ? (api.state[failKey] || 0) : 0;
          var left = lockAfter ? Math.max(0, lockAfter - fails) : null;
          hud += (left === null) ? ' · 撞死了!按方向键或“重开本局”重来'
               : (left > 0) ? ' · 撞死了!还可重试 ' + left + ' 次(方向键 / 重开本局)'
               : ' · 锁死了——看下面的选项';
        }
        hudEl.textContent = hud;
      }

      // 输入:键盘方向键/WASD + 画布下方触屏按钮；死后方向键或“重开本局”复位局内态(软失败,非 soft-lock——离开仍可用「放弃」)
      var acc = 0, last = 0;
      function restartLocal() { g = newGame(); deathCounted = false; acc = 0; last = 0; draw(); }
      function setDirection(nd) {
        if (!nd) return;
        if (g.dead) { restartLocal(); return; }
        if (nd.x === -g.dir.x && nd.y === -g.dir.y) return;             // 禁 180° 反向自杀
        g.next = nd;
      }
      keyHandler = function (e) {
        var nd = dirOf(e.key);
        if (!nd) return;
        if (e.preventDefault) e.preventDefault();
        setDirection(nd);
      };
      hostDoc.addEventListener('keydown', keyHandler);

      // 触屏/coarse pointer 不能依赖软键盘方向键；四向与”重开本局”复用同一 intent/restart 路径，不改外层 Amatlas state。
      // rank1 fix + frontend-design 批:十字 CSS grid(↑顶中/←→中排两侧/↓底中/「重开」独占末行整宽),↑↓不相邻防误触;
      //   gridTemplateAreas 用 ASCII 双引号(历史 bug=中文引号 ”“ → 整条声明失效、十字塌成自动流);touch-action:none 防浏览器吞滑动。
      //   键帽长相 + 按下/焦点/降噪 + 皮肤适配 = 共享类 .amatlas-touchpad-key(engine/ui/touch-controls.css,消费 --amatlas-* token);本模块只管十字布局与事件。
      var controls = hostDoc.createElement('div'); controls.className = 'amatlas-arcade-controls';
      controls.style.cssText = 'display:grid;gap:7px;margin-top:12px;justify-content:center';
      controls.style.gridTemplateColumns = 'repeat(3,46px)';
      controls.style.gridTemplateRows = 'repeat(4,46px)';
      controls.style.gridTemplateAreas = '". up ." "left . right" ". down ." "restart restart restart"';
      function controlButton(label, aria, gridArea, fn) {
        var b = hostDoc.createElement('button'); b.textContent = label; b.setAttribute('type', 'button'); b.setAttribute('aria-label', aria);
        var isDir = gridArea !== 'restart';
        b.className = isDir ? 'amatlas-touchpad-key' : 'amatlas-touchpad-key amatlas-touchpad-key--pill';   // 共享皮肤感知键帽(长相/按下/焦点/降噪在 ui/touch-controls.css)
        // 只留布局/尺寸/功能:minWidth/minHeight 独立赋值(测试 mock 读 style.minWidth);touch-action 保留内联(功能性,防 CSS 缺失时吞滑动)。
        b.style.minWidth = '44px'; b.style.minHeight = isDir ? '44px' : '38px'; b.style.touchAction = 'none';
        b.style.gridArea = gridArea;
        if (!isDir) b.style.marginTop = '6px';
        b.addEventListener('pointerdown', function (e) { if (e && e.preventDefault) e.preventDefault(); if (b.classList) b.classList.add('is-pressed'); fn(); });
        var clrPressed = function () { if (b.classList) b.classList.remove('is-pressed'); };
        b.addEventListener('pointerup', clrPressed); b.addEventListener('pointerleave', clrPressed); b.addEventListener('pointercancel', clrPressed);
        b.addEventListener('click', function (e) { if (e && e.detail === 0) fn(); }); // 仅键盘 Enter/Space(click.detail===0);鼠标/触屏已由 pointerdown 处理,click 不再重复触发(否则真鼠标单击=pointerdown+click 双触发→"重开"双重置、双抽存档 rngSeed)
        return b;
      }
      controls.appendChild(controlButton('↑', '向上', 'up',      function () { setDirection({ x: 0, y: -1 }); }));
      controls.appendChild(controlButton('←', '向左', 'left',    function () { setDirection({ x: -1, y: 0 }); }));
      controls.appendChild(controlButton('→', '向右', 'right',   function () { setDirection({ x: 1, y: 0 }); }));
      controls.appendChild(controlButton('↓', '向下', 'down',    function () { setDirection({ x: 0, y: 1 }); }));
      controls.appendChild(controlButton('重开', '重开本局', 'restart', restartLocal));
      stage.appendChild(hudEl); // HUD 文案 DOM 节点紧接 canvas 之后(rank8)
      stage.appendChild(controls);

      // rAF 固定步长循环:累加真实流逝、按 STEP_MS 整步推进逻辑;通关边界停 loop + 一次 apply 回写
      running = true;
      var generation = loopGeneration;
      function loop(ts) {
        if (!running || generation !== loopGeneration) return;
        if (!last) last = ts;
        acc += (ts - last); last = ts;
        var guard = 0;
        while (acc >= STEP_MS && guard++ < 8) { acc -= STEP_MS; stepLogic(g); }
        draw();
        if (g.eaten >= goal) {                                         // 通关:停 + 一次离散回写(置作者声明的 winKey)
          stop();
          api.apply({ run: function (st) { if (node.winKey) st[node.winKey] = true; } });   // win-link 据此解锁
          return;
        }
        if (g.dead && !deathCounted) {                                 // 撞死=一次失败:离散边界 +1(同 winKey 固定回写形态;每次死只记一次)
          deathCounted = true;
          if (failKey) api.apply({ run: function (st) { st[failKey] = (st[failKey] || 0) + 1; } });
          var fails = (api.state && failKey) ? (api.state[failKey] || 0) : 0;
          if (lockAfter && fails >= lockAfter) {                       // 撞死够多次 → 锁死:停 loop + 清画布;上面的 apply 已触发 render 显 lockedText、world 的 fail-forward 强闯出口已解锁(锁一扇=开一扇,不卡死)
            stop();
            stage.textContent = '';
            return;
          }
          // 未锁死:停在死局画面(draw 已显"还可重试 N 次"),keyHandler 等玩家按方向键重开;放弃出口始终在
        }
        if (generation === loopGeneration) rafId = requestAnimationFrame(loop);
      }
      draw();
      rafId = requestAnimationFrame(loop);
    }

    function dirOf(k) {
      if (k === 'ArrowUp'    || k === 'w' || k === 'W') return { x: 0, y: -1 };
      if (k === 'ArrowDown'  || k === 's' || k === 'S') return { x: 0, y: 1 };
      if (k === 'ArrowLeft'  || k === 'a' || k === 'A') return { x: -1, y: 0 };
      if (k === 'ArrowRight' || k === 'd' || k === 'D') return { x: 1, y: 0 };
      return null;
    }

    return mod;
  }

  return { createSnakeModule: createSnakeModule };
});
