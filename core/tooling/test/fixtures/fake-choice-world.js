/* graph-audit 假选择(同 to 无差别,design-principles §6b ⑨)检测夹具:
   · 节点 hub:「左门」「右门」两个无 run/requires 的纯移动都通向 'room' → 假选择 P1(选哪个都一样)。
   · 「记事后进」带 run(副作用)→ 不算假,不计入数量。
   连通、有保底出口,无其他 P0。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.FAKE_CHOICE_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '44fd645f-96a8-4e34-b56d-833dcf428001',
    start: { map: 'm', node: 'hub' },
    maps: { m: { name: 'M', nodes: {
      hub: { kind: 'scene', look: '枢纽', links: [
        { label: '左门', to: 'room' },                                                    // 纯移动
        { label: '右门', to: 'room' },                                                    // 纯移动、同 to → 与「左门」构成假选择
        { label: '记事后进', to: 'room', run: function (S) { S.flags.noted = true; } }     // 有 run 副作用 → 不算假
      ] },
      room: { kind: 'scene', look: '房间', links: [ { label: '回', to: 'hub' } ] }
    } } }
  };
});
