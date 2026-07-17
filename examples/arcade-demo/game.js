/* ════════════════════════════════════════════════════════════════════════
   Amatlas arcade demo 启动胶水 —— Amatlas.boot 声明式装配 + 自定义 arcade 模块。
   ════════════════════════════════════════════════════════════════════════
   snake 的 kind('arcade')是【自定义】(非内置 scene/encounter)→ 经 manifest.modules
   平权声明(与内置模块同一等:boot 读其 nodeKinds、start() 预检照样认领,漏装配仍 fail-loud)。
   这是"加实时小游戏关卡"经 boot 的标准姿势(见 text-adventure-game skill 的 references/puzzles-and-minigames.md §B)。
   无视觉/听觉意图 → index.html 不引 present-svg/audio.js → boot 的 svg/audio 默认开但宽容跳过。
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function boot() {
    var WORLD = (typeof ARCADE_WORLD !== 'undefined') ? ARCADE_WORLD : window.ARCADE_WORLD;

    var engine = window.Amatlas.boot(WORLD, {
      modules: [window.Amatlas.Snake.createSnakeModule({ goal: 5, grid: 12 })]   // 自定义 arcade 模块:经 manifest.modules 平权装配
    });

    var rb = document.getElementById('reset');
    if (rb) rb.onclick = function () { if (confirm('重新开始?当前进度将清除(手动存档槽保留)。')) engine.reset(); };
    window._engine = engine;                                          // 调试 / 测试钩子
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
