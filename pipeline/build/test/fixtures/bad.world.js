/* 故意做坏的世界 —— build.mjs 准入门测试夹具(一次触发两类硬错):
     · schema [P0]:节点 m/a 缺 kind(模块按 kind 路由 dispatch,缺则没人接)。
     · 图死链 [P0]:m/a 的出口指向不存在的 'ghost'(复用 graph-audit 捕获)。
   UMD 导出供 require/import 两用;这是数据夹具,不是真游戏。 */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.BAD_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  return {
    id: '286eac6d-8005-4af6-808a-b158ed666801',
    start: { map: 'm', node: 'a' },
    maps: {
      m: {
        name: '坏图',
        nodes: {
          a: { /* 故意缺 kind */ links: [
            { label: '去 b', to: 'b' },
            { label: '去幽灵(死链)', to: 'ghost' }
          ] },
          b: { kind: 'scene', links: [ { label: '回 a', to: 'a' } ] }
        }
      }
    }
  };
});
