(function () {
  'use strict';

  function boot() {
    var WORLD = (typeof RIG_SHOWCASE_WORLD !== 'undefined')
      ? RIG_SHOWCASE_WORLD
      : window.RIG_SHOWCASE_WORLD;

    var engine = window.Amatlas.boot(WORLD, {
      status: function () { return []; },
      reset: true
    });

    window._engine = engine;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
