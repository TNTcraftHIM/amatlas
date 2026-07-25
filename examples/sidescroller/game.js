/* Amatlas 2D 横版 example 启动胶水。 */
(function () {
  'use strict';
  function boot() {
    var world = typeof SIDESCROLLER_WORLD !== 'undefined' ? SIDESCROLLER_WORLD : window.SIDESCROLLER_WORLD;
    var engine = window.Amatlas.boot(world, {
      modules: [window.Amatlas.Sidescroller.createSidescrollerModule()]
    });
    var reset = document.getElementById('reset');
    if (reset) reset.onclick = function () { if (confirm('重新开始？当前进度将清除。')) engine.reset(); };
    window._engine = engine;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
