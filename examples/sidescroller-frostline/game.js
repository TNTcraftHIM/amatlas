/* Amatlas 2D 横版第二客户启动胶水；玩法 runtime 仍直接复用 sibling example。 */
(function () {
  'use strict';
  function boot() {
    var world = typeof SIDESCROLLER_WORLD !== 'undefined' ? SIDESCROLLER_WORLD : window.SIDESCROLLER_WORLD;
    window._engine = window.Amatlas.boot(world, {
      modules: [window.Amatlas.Sidescroller.createSidescrollerModule()]
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
