/* graph-audit「同名私有 when」正向夹具。
   只有真实 node.events[].when 受文字冒险 beat 契约约束；node.meta.when / 模块私有数据中的
   同名字段不是 event.when，graph CLI 与 build 都必须放行，不能退回全源码裸 regex。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.EVENT_WHEN_PRIVATE_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '4a0359ab-3dbf-4653-bfcc-e2d721dd641b',
    start: { map: 'm', node: 'a' },
    maps: {
      m: {
        name: 'M',
        nodes: {
          a: {
            kind: 'custom',
            meta: { when: 'manual' },
            events: [{ when: function () { return true; }, run: function () {} }],
            links: [{ label: '去 B', to: 'b' }]
          },
          b: {
            kind: 'custom',
            policy: { when: 'after-render' },
            links: [{ label: '回 A', to: 'a' }]
          }
        }
      }
    }
  };
});
