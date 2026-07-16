/* graph-audit 死 state 键(裸键 deadFlag 版,design-principles §6b ⑧)检测夹具:
   · understanding —— requires 读 S.understanding>=15,但 world.js 从不写它 → 死 state 键 P1(门控恒 false)。
   · score —— requires 读 S.score>0、且 run 写 S.score=10 → 不应报(已写)。
   · flags.* —— 归 deadFlag 查、不应被裸键检查误抓。
   每节点有无条件保底出口、连通,无死链/孤儿/无保底出口干扰。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.DEAD_STATEKEY_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: 'f2fa6b4c-4f0d-42c0-bd74-1242d8b6ba70',
    start: { map: 'm', node: 'a' },
    maps: { m: { name: 'M', nodes: {
      a: { kind: 'scene', look: '起点', links: [
        { label: '保底走', to: 'b' },                                                            // 无条件保底
        { label: '需理解', to: 'b', requires: function (S) { return S.understanding >= 15; } },   // 读 understanding,从不写 → 死键
        { label: '记分', run: function (S) { S.score = 10; S.flags.noted = true; } }              // 写 score + flags.noted
      ] },
      b: { kind: 'scene', look: '终点', links: [
        { label: '回(若有分)', to: 'a', requires: function (S) { return S.score > 0; } },          // 读 score(已写,不报)
        { label: '保底回', to: 'a' }                                                              // 保底
      ] }
    } } }
  };
});
