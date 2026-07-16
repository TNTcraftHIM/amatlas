/* 配套 game-merge/world.js:achievement.when 读 flags.ghostAch(全程从不写 → 死 flag)+ flags.realFlag(world 写了 → 不报)。
   纯文本夹具,graph-audit 只把它当文本合并进 flag 读写分析(不执行)。 */
(function () {
  var engine = window.Amatlas.createEngine(window.GAME_MERGE_WORLD, {});
  engine.use(window.Amatlas.TextAdventure.createTextAdventureModule({}));  // scene 节点的玩法模块(满足 kind↔模块静态检查;本夹具重点是下面 achievement.when 的死 flag 合并扫)
  engine.use(window.Amatlas.AchievementPlugin.createAchievementPlugin({
    achievements: [
      { id: 'a1', title: '幽灵', when: function (S) { return S.flags.ghostAch; } },              // ghostAch 从不写 → 死 flag(成就永不解锁)
      { id: 'a2', title: '真实', when: function (S) { return S.flags.realFlag; } },               // realFlag world 写了 → 不报
      { id: 'a3', title: '防御写', when: function (S) { return (S.flags || {}).savedDef; } },     // 防御读 + world 防御写了 savedDef → 不报(归一后识别)
      { id: 'a4', title: '防御死', when: function (S) { return (S.flags || {}).ghostDef; } }       // 防御读 + 从不写 → 死 flag(haiku 的 sacrificed 等同类)
    ]
  }));
})();
