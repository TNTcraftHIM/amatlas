/* ════════════════════════════════════════════════════════════════════════
   Amatlas 可选表现层 · 真 3D d6 骰子呈现器 (presenters/present-dice3d.js) — S11-c
   ════════════════════════════════════════════════════════════════════════
   **可选 / opt-in**:默认不启用;游戏 `engine.use(...)` 才接管 d6 骰子的呈现。
     engine.use(Amatlas.Dice3dPresenter.createDice3dPresenter({ slot: '#dice3d' }));
   不启用时,骰子仍由 present-svg 画 2.5D(等距立方 / 切面宝石),本文件零影响。

   做什么:每帧看 view.scene 有没有 `{kind:'dice', sides:6}` 的检定结果;有就在 slot 里
   用 HTML `<div>` 立方体(CSS `preserve-3d`)真 3D 翻滚显示结果(由快到慢、结果面朝上)。
   **只接管 d6**(立方体是纯 CSS 唯一划算的多面体);其它面数 / 没骰子 → 清空 slot,交回 present-svg。

   为什么不在 SVG 里做:`transform-style:preserve-3d` 在 <svg> 内几乎所有浏览器不支持(查证 Igalia)
   → 真 3D 必须用 HTML div、脱离 SVG。故独立成一个可选呈现器(契约/engine-core 零改,纯新增)。

   求和检定(2d6 等):元素只带"总和"(`ref`),单颗立方显示不了 9 → **1-6 用点数、>6 用数字**
   (用户拍板:一颗立方显示结果、不碰契约;"N 颗各显一面"需契约加 per-die 点数,留 backlog)。

   可测性:纯函数 cubeHTML(结果→立方体 DOM 串,node 可断言);present 薄包装写 slot。
   动画用 CSS(无 `forwards`,基态=落定姿态);`prefers-reduced-motion` 静止落定 → 不伤可测。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).Dice3dPresenter = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 点数布局(3×3 格);对面之和=7。
  var PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 4, 7, 3, 6, 9] };
  // 6 面标准点数 → 摆位(顶面 = 落定朝上那面,会被"结果"覆盖)
  var FACES = [['a3d-top', 5], ['a3d-bottom', 2], ['a3d-front', 1], ['a3d-back', 6], ['a3d-right', 3], ['a3d-left', 4]];

  // 立方体 CSS(注入 <head> 一次)。基态 transform=俯视顶面;@keyframes 由快到慢翻滚收束到基态。
  var STYLE = '<style id="amatlas-dice3d-style">'
    + '.a3d-stage{width:100%;height:100%;display:flex;align-items:center;justify-content:center;perspective:560px;perspective-origin:50% 36%;position:relative}'
    + '.a3d-halo{position:absolute;left:50%;top:46%;width:120px;height:120px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(246,201,69,.7),transparent 66%);opacity:0;filter:blur(5px);pointer-events:none}'
    + '.a3d-critglow .a3d-halo{opacity:.9}'
    + '.a3d-cube{position:relative;width:60px;height:60px;transform-style:preserve-3d;transform:rotateX(-56deg) rotateY(-18deg);animation:a3d-roll 1.25s cubic-bezier(.1,.82,.16,1)}'  /* 基态=落定俯视;无 forwards(基态=末帧) */
    + '.a3d-face{position:absolute;width:60px;height:60px;border-radius:11px;background:linear-gradient(150deg,#f4efe3,#d9d2c2);border:1px solid #b7ad97;box-shadow:inset 0 0 8px rgba(255,255,255,.5),inset 0 -6px 10px rgba(0,0,0,.18);display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);padding:9px;gap:1px}'
    + '.a3d-face i{display:block}'
    + '.a3d-pip{align-self:center;justify-self:center;width:10px;height:10px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#4a463d,#1c1a16 70%)}'
    + '.a3d-num{grid-column:1/4;grid-row:1/4;display:flex;align-items:center;justify-content:center;font:800 26px/1 system-ui,sans-serif;color:#1c1a16}'
    + '.a3d-top{transform:rotateX(90deg) translateZ(30px)}.a3d-bottom{transform:rotateX(-90deg) translateZ(30px)}'
    + '.a3d-front{transform:translateZ(30px)}.a3d-back{transform:rotateY(180deg) translateZ(30px)}'
    + '.a3d-right{transform:rotateY(90deg) translateZ(30px)}.a3d-left{transform:rotateY(-90deg) translateZ(30px)}'
    + '.a3d-success .a3d-face{background:linear-gradient(150deg,#bfe6c6,#7fbf8c)}'
    + '.a3d-fail .a3d-face{background:linear-gradient(150deg,#e7b9b2,#c87b6a)}'
    + '.a3d-crit .a3d-face{background:linear-gradient(150deg,#ffe9a8,#e9c44e)}'
    + '.a3d-fumble .a3d-face{background:linear-gradient(150deg,#9a5a52,#5a201b)}.a3d-fumble .a3d-pip{background:#2a0d0a}'
    + '@keyframes a3d-roll{0%{transform:rotateX(-420deg) rotateY(560deg) scale(.55)}60%{transform:rotateX(-66deg) rotateY(-28deg) scale(1.05)}100%{transform:rotateX(-56deg) rotateY(-18deg) scale(1)}}'  /* 由快到慢、多圈翻滚收束 */
    + '@media(prefers-reduced-motion:reduce){.a3d-cube{animation:none}}'   /* 静止落定:基态已是俯视顶面、结果可读 */
    + '</style>';

  // 一个面的内容:1-6 → 点数格;>6 或异常(如 2d6 求和)→ 数字。
  function faceInner(v) {
    if (v >= 1 && v <= 6 && PIPS[v]) {
      var cells = '';
      for (var c = 1; c <= 9; c++) cells += (PIPS[v].indexOf(c) >= 0) ? '<i class="a3d-pip"></i>' : '<i></i>';
      return cells;
    }
    return '<span class="a3d-num">' + v + '</span>';
  }

  // 纯函数:结果 + 成败 → 立方体 DOM 串(顶面显结果,其余面标准点数装饰)。node 可断言。
  function cubeHTML(result, state) {
    var faces = '';
    for (var i = 0; i < FACES.length; i++) {
      var cls = FACES[i][0], v = (cls === 'a3d-top') ? result : FACES[i][1];   // 顶面=落定朝上 → 显结果
      faces += '<div class="a3d-face ' + cls + '">' + faceInner(v) + '</div>';
    }
    return '<div class="a3d-stage' + (state === 'crit' ? ' a3d-critglow' : '') + '"><div class="a3d-halo"></div>'
      + '<div class="a3d-cube a3d-' + (state || 'plain') + '">' + faces + '</div></div>';
  }

  function createDice3dPresenter(opts) {
    opts = opts || {};
    var slot = opts.slot || '#dice3d';
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    function resolve() { return opts.container || (doc && doc.querySelector(slot)); }
    function injectStyle() {
      if (!doc || !doc.head || doc.getElementById('amatlas-dice3d-style')) return;
      var box = doc.createElement('div'); box.innerHTML = STYLE;
      if (box.firstChild) doc.head.appendChild(box.firstChild);
    }
    function present(snap) {
      var c = resolve(); if (!c) return;                                       // 无 slot → 退化(纯 2.5D),不抛
      var scene = snap && snap.view && snap.view.scene;
      var els = scene && scene.elements;
      var die = (els && els.filter) ? els.filter(function (e) { return e && e.kind === 'dice' && e.sides === 6; })[0] : null;
      if (!die) { c.innerHTML = ''; return; }                                  // 非 d6 / 无骰 → 清空(交回 present-svg)
      injectStyle();
      var result = parseInt(die.ref, 10); if (isNaN(result)) result = die.ref;
      c.innerHTML = cubeHTML(result, die.state);
    }
    return { present: present, install: function (api) { api.addPresenter(present); } };
  }

  return { createDice3dPresenter: createDice3dPresenter, cubeHTML: cubeHTML };
});
