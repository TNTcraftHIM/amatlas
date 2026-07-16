/* fixture(§11.2 误报修,红队实锤):手写装配 + 【自定义模块】合法认领内置 kind 'encounter'
   (契约 §2:任何模块都可声明 nodeKinds)→ 实跑 start 成功、游戏正常,旧版 grep 不到
   createTabletopModule 却报 P0 硬拦 = P0 误报。修后:源里出现 nodeKinds(自定义模块、认领面
   静态不可知)→ 降 P1 可疑(start() 预检 + probe 运行时仍权威兜底)。纯文本夹具,只被当文本扫。 */
(function () {
  var myBattle = {
    id: 'my-battle',
    nodeKinds: ['encounter'],                       // 自定义模块合法认领内置 kind
    render: function (state, node) { return { title: node.name, body: [{ type: 'prose', text: node.look }], status: [] }; },
    actions: function (state, node) { return []; },
    install: function (api) { api.registerModule(myBattle); }
  };
  var engine = window.Amatlas.createEngine(window.MISMATCH_WORLD, {});
  engine.use(window.Amatlas.TextAdventure.createTextAdventureModule({}));
  engine.use(myBattle);                             // encounter 由自定义模块认领 → 合法、start 不崩
  engine.start();
})();
