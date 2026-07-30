/* ════════════════════════════════════════════════════════════════════════
   Amatlas 最小 demo 世界数据(minimal 模块)—— S10.5。
   ════════════════════════════════════════════════════════════════════════
   节点 kind='counter'(由 minimal 模块负责)。作者只写"数据",引擎是解释器。
   最小可工作世界:单地图、单节点。要扩展:加节点 + 给节点写 exits(核心自动生成移动动作)。
   注:单节点无 exits → graph-audit 报 P2「死胡同」(可疑级,**不阻断构建**);加 exits 即消除。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.MINIMAL_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    id: '6f0913c3-27c8-412b-b77d-1809a813f4d1',
    start: { map: 'm', node: 'home' },
    maps: {
      m: {
        name: '最小范例',
        nodes: {
          home: {
            kind: 'counter',
            title: '计数器',
            look: '这是一个最小的 Amatlas 玩法模块:点击按钮累加,攒够目标即达成。'
          }
        }
      }
    }
  };
});
