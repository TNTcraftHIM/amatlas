/* 故意只 use 文字冒险、漏 createTabletopModule(模拟 showcase 弱模型 bug):
   world 的 encounter 节点没有模块认领 → engine.start() 崩、游戏白屏(只剩工具栏)。
   纯文本夹具,graph-audit 只把它当文本合并扫(不执行)。 */
(function () {
  var engine = window.Amatlas.createEngine(window.MISMATCH_WORLD, {});
  engine.use(window.Amatlas.TextAdventure.createTextAdventureModule({}));    // scene 有模块 → 不报
  // engine.use(window.Amatlas.Tabletop.createTabletopModule({ sheet: {} })); ← 漏了这行 = encounter 无模块认领
  engine.start();
})();
