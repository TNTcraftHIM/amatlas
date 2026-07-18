/* fixture:字段放错对象(v11 对称穷举,全引擎审计实锤的 fail-silent 接缝)。
   期望:① exit 写 requires/run/once → P0「出口字段放错对象」 ② link 写 available → P0「门控字段放错对象」
        ③ scene 节点带 checks → P1(自定义模块可合法消费 → 有合法反例不升 P0)
   对照:正确写法(exit 只 to/label/available、link 用 requires)不报。 */
var WORLD = {
  id: '0ed5b480-c787-425a-bf0e-2f386b37151b',
  start: { map: 'm', node: 'a' },
  maps: { m: { name: 'M', nodes: {
    a: {
      kind: 'scene', name: '甲', look: '房间甲。',
      exits: [
        { to: 'b', label: '上锁的门', requires: function (S) { return S.flags.key; } },   // ← P0:requires 是 links 的
        { to: 'b', label: '正常门', available: function () { return true; } }              // 正确 → 不报
      ],
      links: [
        { label: '密道', to: 'b', available: function () { return false; } },             // ← P0:available 是 exits 的
        { label: '正常链接', to: 'b', requires: function (S) { return true; } }            // 正确 → 不报
      ]
    },
    b: {
      kind: 'scene', name: '乙', look: '房间乙。',
      checks: [ { label: '搜查', skill: '观察', dc: 7, dice: '2d6', success: { text: 'ok' } } ],  // ← P1:scene 不消费 checks
      links: [ { label: '回', to: 'a' } ]
    }
  } } }
};
if (typeof module !== 'undefined' && module.exports) module.exports = WORLD;
if (typeof window !== 'undefined') window.MY_WORLD = WORLD;
