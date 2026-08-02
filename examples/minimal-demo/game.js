/* ════════════════════════════════════════════════════════════════════════
   Amatlas 最小 demo 启动胶水 —— S12:Amatlas.boot 声明式默认装配。
   ════════════════════════════════════════════════════════════════════════
   minimal 的 kind('counter')是【自定义】(非内置 scene/encounter)→ boot 不自动拉它,
   经 manifest.modules 显式声明(与内置模块平权:boot 读其 nodeKinds、start() 预检照样认领,
   漏装配仍 fail-loud)。这正是"加新玩法"经 boot 的标准姿势(见 text-adventure-game skill 的 references/plugin-development.md)。
   计数器无视觉/听觉意图 → index.html 不引 present-svg/audio.js → boot 的 svg/audio 默认开但宽容跳过。
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function boot() {
    var WORLD = (typeof MINIMAL_WORLD !== 'undefined') ? MINIMAL_WORLD : window.MINIMAL_WORLD;

    var engine = window.Amatlas.boot(WORLD, {
      modules: [window.Amatlas.Minimal.createMinimalModule({ goal: 10 })]   // 自定义 module:经 manifest.modules 平权装配
    });

    var rb = document.getElementById('reset');
    if (rb) rb.onclick = function () { if (confirm('重新开始?当前进度将清除(手动存档槽保留)。')) engine.reset(); };   // 二次确认:reset 即删自动续档,误点无可挽回(同 save 删档惯例)
    window._engine = engine;                               // 调试 / 测试钩子
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
