/* 故意做坏的新格式世界 —— graph-audit.mjs 的测试夹具。
   含三类结构问题各一:
     · 死链 [P0]:节点 m/a 的出口指向不存在的 'ghost'。
     · 不可达/孤儿 [P1]:m/island 无任何入边。
     · 死胡同 [P2]:m/island 无任何出边(只有一个纯动作 link,没有 .to)。
   (这是数据夹具,不是真游戏;UMD 导出供 require/import 两用。) */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.BROKEN_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
    id: '06a940e3-1e79-4520-a10b-ef587a6e6a36',
    start: { map: 'm', node: 'a' },
    maps: {
      m: {
        name: '测试图',
        nodes: {
          a: {
            kind: 'scene',
            links: [
              { label: '去 b', to: 'b' },
              { label: '去幽灵(死链)', to: 'ghost' }
            ]
          },
          b: {
            kind: 'scene',
            links: [ { label: '回 a', to: 'a' } ]
          },
          island: {
            kind: 'scene',
            links: [ { label: '原地沉思(纯动作,无 to)', run: function () {} } ]
          }
        }
      }
    }
  };
});
