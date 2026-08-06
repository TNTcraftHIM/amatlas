/* ════════════════════════════════════════════════════════════════════════
   Amatlas 最小 demo 世界数据(minimal 模块)—— S10.5。
   ════════════════════════════════════════════════════════════════════════
   节点 kind='counter'(由 minimal 模块负责)。作者只写"数据",引擎是解释器。
   正式 R·05 是单地图三节点:counter 达标前可暂停，达标后核心生成交付 exit，再由普通 scene 接回选择。
   复制为新玩法时保留至少一条无条件非 once 的保底出口；只有条件出口会被 graph-audit 判为确定性 soft-lock。
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
            look: '这是一个最小的 Amatlas 玩法模块:点击按钮累加,攒够目标即达成。',
            exits: [
              {
                to: 'handoff',
                label: '把原型交给试玩者',
                available: function (S) { return (S.count || 0) >= 10; }
              },
              { to: 'pause', label: '暂时放下原型' }
            ]
          },
          pause: {
            kind: 'scene',
            name: '原型工作台外',
            look: '你可以随时暂停一个原型；核心提供的无条件出口让未达标状态也不会成为软锁。',
            links: [{ to: 'home', label: '继续制作原型' }]
          },
          handoff: {
            kind: 'scene',
            name: '试玩交接台',
            look: function (S) {
              return (S.count || 0) >= 10
                ? '计数达到 10。这个出口由核心从 counter 节点的 exits 生成；进入这里后，普通 scene 模块接回调查与选择。'
                : '原型还没有达到交付目标。';
            },
            links: [
              { id: 'inspect_plan', label: '查看改造清单', once: true,
                run: function (S) {
                  S.flags.minimalPlanSeen = true;
                  return '清单写着：改 module id、nodeKinds、render/actions 与 world kind，再保留 manifest.modules 显式装配。';
                } },
              { to: 'home', label: '返回已完成原型' }
            ]
          }
        }
      }
    }
  };
});
