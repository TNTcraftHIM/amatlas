/* FPS 玩家直达装配:只派生入口与独立存档 namespace；maps 和全部关卡数据仍来自正式 MAZE3D_WORLD。 */
(function () {
  'use strict';
  function boot() {
    var A = window.Amatlas;
    var fpsWorld = Object.assign({}, window.MAZE3D_WORLD, {
      id: '3bcffe81-3400-4415-bdd3-49d05170b127',
      start: { map: 'm', node: 'fps_range' }
    });
    window._engine = A.boot(fpsWorld, {
      modules: [A.Maze3d.createMaze3dModule({ stageId: 'maze3d-stage', mimicVoice: 'speech' })],
      sheet: { name: '勘探员', skills: { '感知': 2 }, resources: { '理智': 5 } },
      reset: true,
      use: [A.InventoryPlugin.createInventoryPlugin({})]
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
