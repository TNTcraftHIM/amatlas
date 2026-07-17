/* graph-audit「SCC 软锁口袋」夹具(round12《烈焰与咸风》fog_entry⇄reef_nav 实锤;逐节点「无保底出口」P0 的盲区)。
   两个口袋都是「2 节点互相用无条件出口连成封闭回路、只能靠检定离开」,但只有 grind-trap 该报:
   · 口袋 A {trap_a, trap_b} = grind-trap:trap_b 检定 cost 体力>0、success 逃出、**fail 回 trap_a(留口袋内)**
       → 反复失败每次耗体力、体力枯竭则检定灰显 → 死循环 → **应报软锁口袋 P1**。
   · 口袋 B {ff_a, ff_b} = fail-forward:ff_b 检定 success/fail **都**→ safe_out(离开口袋)→ 负担得起一次就脱身
       → 只剩"到达时体力已不足"才卡(=悲观可达 backlog,非纯拓扑)→ **不应报**(守零误报)。
   两口袋内每个节点【各自】都有无条件出口 → 逐节点「无保底出口」检查都放行 → 正是 SCC 闸要补的盲区。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.SOFTLOCK_POCKET_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '3c62c8f6-2beb-408c-b6ad-16001831a226',
    start: { map: 'm', node: 'hub' },
    initState: { 体力: 5 },
    maps: {
      m: {
        name: 'M',
        nodes: {
          hub: {
            kind: 'scene', name: '岔口', look: '三条路。',
            links: [
              { label: '进 grind 口袋', to: 'trap_a' },
              { label: '进 fail-forward 口袋', to: 'ff_a' },
              { label: '直接走出去', to: 'safe_out' }
            ]
          },
          /* ── 口袋 A:grind-trap(应报)── */
          trap_a: {
            kind: 'scene', name: 'A', look: '雾里。',
            links: [{ label: '往前探', to: 'trap_b' }]            // 唯一出口=无条件,但只指回口袋内
          },
          trap_b: {
            kind: 'encounter', title: 'B', look: '礁石。',
            checks: [{
              id: 'navB', label: '读水流穿礁(航术 · DC 8)', skill: '航术', dc: 8, dice: '2d6',
              cost: { res: '体力', amount: 1 },
              success: { text: '出去了。', to: 'safe_out' },       // 逃出口袋
              fail: { text: '又撞回去。', to: 'trap_a' }            // ← fail 回口袋内 = grind:必须靠 success 逃、每次耗体力
            }],
            exits: [{ to: 'trap_a', label: '退回' }]               // 唯一无条件出口=指回口袋内
          },
          /* ── 口袋 B:fail-forward(不应报)── */
          ff_a: {
            kind: 'scene', name: 'C', look: '风暴边缘。',
            links: [{ label: '冲进去', to: 'ff_b' }]
          },
          ff_b: {
            kind: 'encounter', title: 'D', look: '风暴中心。',
            checks: [{
              id: 'helmD', label: '顶风操舵(航术 · DC 9)', skill: '航术', dc: 9, dice: '2d6',
              cost: { res: '体力', amount: 2 },
              success: { text: '穿过去了。', to: 'safe_out' },      // 成功离开
              fail: { text: '被甩出风暴另一侧。', to: 'safe_out' }   // ← fail 也离开 = fail-forward:负担得起一次就脱身
            }],
            exits: [{ to: 'ff_a', label: '退到边缘' }]
          },
          /* ── 出口/结局 ── */
          safe_out: {
            kind: 'scene', name: '出口', look: '海阔天空。——结局',
            links: []                                              // 终局(死胡同 P2,有意)
          }
        }
      }
    }
  };
});
