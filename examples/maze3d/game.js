/* maze3d 统一入口启动胶水 —— 一个公开入口,内部四个 recipes。
   basic / horror / puzzle / layers 都共用同一份 raycast-maze.js runtime;差异来自 world 数据。
   这里显式注册一个 Maze3d 模块实例,让下游 AI 不把 recipe 误读成多个模块。 */
(function () {
  'use strict';
  function boot() {
    var A = window.Amatlas;
    var engine = A.boot(window.MAZE3D_WORLD, {
      modules: [A.Maze3d.createMaze3dModule({ stageId: 'maze3d-stage', mimicVoice: 'speech' })],
      sheet: { name: '勘探员', skills: { '感知': 2 }, resources: { '理智': 5 } },
      reset: true,
      use: [A.InventoryPlugin.createInventoryPlugin({})]
      // present 省略 → 引了 <script> 就挂:scene 用 present-svg/present-dom/audio,encounter 由 boot 自动拉 tabletop,maze3d 由上方模块实例认领。
    });
    window._engine = engine;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
