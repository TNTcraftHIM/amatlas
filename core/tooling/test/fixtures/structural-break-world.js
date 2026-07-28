/* graph-audit「结构断裂」(孤儿率升级)检测夹具:
   a→b→c 从 start 可达(3 节点);x→y→z→w 互连成孤岛、无任何可达节点指向 x(4 节点不可达)。
   孤儿率 4/7 ≈ 57% > 1/3 且 ≥3 → 升 [确认][P0](退出码 1)。模拟"某一幕入口漏接边"导致整片不可达
   (如 showcase 的 choose_side 零 inbound → Act2/Act3/结局全断)。无死链/坏 start。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.STRUCTURAL_BREAK_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '48cb8c59-dd57-4107-8f02-d43f4ad0914c',
    start: { map: 'm', node: 'a' },
    maps: { m: { name: 'M', nodes: {
      a: { kind: 'scene', look: '起点', links: [{ label: '去 b', to: 'b' }] },
      b: { kind: 'scene', look: 'b', links: [{ label: '去 c', to: 'c' }] },
      c: { kind: 'scene', look: 'c', links: [{ label: '回 a', to: 'a' }] },
      // 以下 4 节点互连成孤岛,无任何可达节点指向 x → 整片不可达(模拟漏接的"第二幕")
      x: { kind: 'scene', look: 'x', links: [{ label: '去 y', to: 'y' }] },
      y: { kind: 'scene', look: 'y', links: [{ label: '去 z', to: 'z' }] },
      z: { kind: 'scene', look: 'z', links: [{ label: '去 w', to: 'w' }] },
      w: { kind: 'scene', look: 'w', links: [{ label: '回 x', to: 'x' }] }
    } } }
  };
});
