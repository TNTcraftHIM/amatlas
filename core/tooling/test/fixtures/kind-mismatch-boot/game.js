/* boot 形态装配(纯文本夹具,graph-audit 只合并扫、不执行):用 Amatlas.boot,
   无 createTabletopModule 字样 → 触发 kind↔模块让位。boot 自动按 encounter kind 拉 Tabletop。 */
(function () {
  var A = window.Amatlas;
  var engine = A.boot(window.MISMATCH_WORLD, {            // A.boot( = new-game/SKILL 模板用的别名形式,验证让位也认它(非只 Amatlas.boot)
    sheet: { name: '试炼者', skills: { s: 1 }, resources: {} }
  });
  window._engine = engine;
})();
