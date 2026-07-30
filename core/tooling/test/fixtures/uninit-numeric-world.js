/* graph-audit initState 未声明数值字段(NaN 源头)检测夹具:
   · stamina —— run 里 S.stamina -= 1,但 initState 未声明 → P1(首次 undefined-1 = NaN)。
   · gold    —— run 里 S.gold += 5,且 initState 声明了 gold:0 → 不应报(已初始化)。
   每节点有无条件保底出口、连通,无死链/孤儿/结构断裂(隔离:只验数值字段检查)。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.UNINIT_NUMERIC_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: 'cc8668e9-5f25-4438-baae-16f94c73265f',
    start: { map: 'm', node: 'a' },
    initState: { gold: 0 },
    maps: { m: { name: 'M', nodes: {
      a: { kind: 'scene', look: '起点', links: [
        { label: '消耗体力', to: 'b', run: function (S) { S.stamina -= 1; } },   // stamina 未声明 → NaN
        { label: '赚钱', run: function (S) { S.gold += 5; } }                      // gold 已声明 → 安全
      ] },
      b: { kind: 'scene', look: '终点', links: [
        { label: '回', to: 'a' }                                                   // 无条件保底
      ] }
    } } }
  };
});
