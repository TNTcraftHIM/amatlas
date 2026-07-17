/* 配套 same-name-pool 夹具:sheet 声明 resources 内力 + 体力(检定真正扣的池)。
   graph-audit 文本级从这里提取 sheet.resources 键,与 world.js 的顶层 S.resources.X 比对同名。 */
(function () {
  function boot() {
    var A = window.Amatlas;
    var engine = A.boot(window.SAME_NAME_POOL_WORLD, {
      sheet: { name: '测试者', skills: { 力: 1 }, resources: { 内力: 6, 体力: 5 } }
    });
    window._engine = engine;
  }
  boot();
})();
