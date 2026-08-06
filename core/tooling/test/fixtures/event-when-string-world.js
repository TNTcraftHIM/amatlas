/* graph-audit「event.when 字符串」夹具(showcase round5 +《黄铜玫瑰》6 处复发;三闸全漏 → 静态硬拦)。
   节点 a 的 event 写 `when:'enter'`(字符串)→ 进节点即抛 → 应报 [确认][P0]、退出码非零;
   节点 b 的 event 写 `when:(S)=>bool`(函数)→ 正确写法 → **不应**误报。验:报 'enter'、只报一条(函数形不命中)。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.EVENT_WHEN_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '96a7c944-916e-4f3e-a939-5a035426ddcd',
    start: { map: 'm', node: 'a' },
    maps: {
      m: {
        name: 'M',
        nodes: {
          a: {
            kind: 'scene', name: 'A', look: '起点。',
            events: [{ when: 'enter', run: function (S) { S.flags.bad = true; } }],   // BUG:字符串 → renderer.js 进节点即抛
            links: [{ label: '去 B', to: 'b' }]
          },
          b: {
            kind: 'scene', name: 'B', look: '终点。',
            events: [{ when: function (S) { return !S.flags.seenB; }, run: function (S) { S.flags.seenB = true; } }],   // 正确:条件函数形,不应被误报
            links: [{ label: '回 A', to: 'a' }]
          }
        }
      }
    }
  };
});
