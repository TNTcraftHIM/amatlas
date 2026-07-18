/* fixture:可无限刷属性(round12《灰雾》实测:纯动作增益链接无 once/requires → 反复点刷属性+同段回应)。
   期望:farm 链接报 P1「可无限刷属性」;有 once / 有 requires / 含 -= 抵扣的不报(零误报);退出码 0(P1 不拦)。 */
var WORLD = {
  id: 'a135f755-6a43-428f-bab7-77b94d82d84e',
  start: { map: 'm', node: 'a' },
  initState: { insight: 0, coins: 5 },
  maps: { m: { name: 'M', nodes: {
    a: {
      kind: 'scene', name: '甲', look: '房间甲。',
      links: [
        { label: '反复琢磨', run: function (S) { S.insight = (S.insight || 0) + 1; return '你又琢磨了一遍。'; } },   // ← 该报:无 once/requires 纯增益
        { label: '深究一次', once: true, run: function (S) { S.insight = (S.insight || 0) + 2; return '只此一次。'; } },  // once → 不报
        { label: '有条件领悟', requires: function (S) { return S.coins > 0; }, run: function (S) { S.insight += 1; } },   // requires → 不报
        { label: '买情报', run: function (S) { S.coins -= 1; S.insight += 1; return '花钱换情报。'; } },                   // 含 -= 抵扣 → 不报(交易型)
        { label: '走', to: 'b' }
      ]
    },
    b: { kind: 'scene', name: '乙', look: '房间乙。', links: [ { label: '回', to: 'a' } ] }
  } } }
};
if (typeof module !== 'undefined' && module.exports) module.exports = WORLD;
if (typeof window !== 'undefined') window.MY_WORLD = WORLD;
