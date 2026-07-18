/* 故意只 use 文字冒险、漏 createCutsceneModule(手写装配路径):
   world 的 cutscene 节点没有模块认领 → engine.start() 崩、游戏白屏。
   纯文本夹具,graph-audit 只把它当文本合并扫(不执行)。 */
(function () {
  var engine = window.Amatlas.createEngine(window.CS_WORLD, {});
  engine.use(window.Amatlas.TextAdventure.createTextAdventureModule({}));    // scene 有模块 → 不报
  // engine.use(window.Amatlas.Cutscene.createCutsceneModule()); ← 漏了这行 = cutscene 无模块认领
  engine.start();
})();
