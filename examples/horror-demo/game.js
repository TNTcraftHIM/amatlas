/* ════════════════════════════════════════════════════════════════════════
   Amatlas 恐怖短片 启动胶水(boot)—— S10:presenter 品质压力测试。
   ════════════════════════════════════════════════════════════════════════
   组装:核心 + 文字冒险模块(玩法,kind='scene')+ 三呈现器(文字 / SVG / 音频)。
   **故意只挂呈现器、不挂能力插件**——S10 压的是"表现力天花板",不是功能堆叠(那是 S11)。
   恐怖演出**全在 presenter**:同一个文字冒险 View 快照,SVG 呈现器画出画幅黑边/注视的眼睛/
   渗血过场,Audio 呈现器合成氛围低鸣/惊悚刺针——模块与世界数据里**零动画、零素材**。
   注释掉 ② / ③ 任一行 → 退化为纯文字仍可读(优雅退化)。
   ★ 本 demo 是**唯一保留**的逐插件手写装配(escape hatch 对照,展示底层 createEngine + engine.use);
     声明式默认装配(几行 manifest)见 examples/text-adventure-demo(文字冒险)/ tabletop-demo(跑团)/ minimal-demo(自定义模块)的 Amatlas.boot(S12)。
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function boot() {
    var WORLD = (typeof HORROR_WORLD !== 'undefined') ? HORROR_WORLD : window.HORROR_WORLD;
    var A = window.Amatlas;
    var TA = A.TextAdventure;

    var mod = TA.createTextAdventureModule({});   // 默认状态条(位置);恐怖短片刻意不堆 UI
    // 节点的 scene/audio(眼睛/黑边/过场/惊悚音)由 renderer.js 原生透传进 View,呈现器消费;游戏层无需包装。

    var storage = (function () { try { return window.localStorage; } catch (e) { return null; } })();
    // 手写装配与 boot 同样由必填 WORLD.id 派生稳定 namespace；只有嵌入/迁移场景才显式 override saveKey。
    var engine = A.createEngine(WORLD, { storage: storage });
    engine.use(mod);                     // 玩法模块经统一入口注册(mod 带 install);顺序:玩法先、呈现后

    // ── 三呈现器叠加(皆 engine.use);注释 ②/③ 即退化为纯文字 ──────────────────────────
    engine.use(A.DomPresenter.createDomPresenter({ document: document }));          // ① 文字(present-dom;一步接渲染 + 接点击)
    engine.use(A.SvgPresenter.createSvgPresenter({ slot: '#scene' }));              // ② SVG 场景(眼睛/黑边/过场)
    engine.use(A.AudioPresenter.createAudioPresenter());                           // ③ Web Audio(氛围/惊悚音)

    engine.start();                       // 起点 → enter → 广播给所有已挂呈现器

    var rb = document.getElementById('reset');
    if (rb) rb.onclick = function () { if (confirm('重新开始?当前进度将清除(手动存档槽保留)。')) engine.reset(); };   // 二次确认:reset 即删自动续档,误点无可挽回(同 save 删档惯例)

    window._engine = engine;              // 调试 / 测试钩子
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
