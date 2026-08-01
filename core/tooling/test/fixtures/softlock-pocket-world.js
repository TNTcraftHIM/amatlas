/* graph-audit「SCC 软锁口袋」夹具(round12《烈焰与咸风》fog_entry⇄reef_nav 实锤;逐节点「无保底出口」P0 的盲区)。
   两个口袋都是「2 节点互相用无条件出口连成封闭回路、只能靠检定离开」,但只有 grind-trap 该报:
   · 口袋 A {trap_a, trap_b} = grind-trap:trap_b 检定 cost 体力>0、success 逃出、**fail 回 trap_a(留口袋内)**
       → 反复失败每次耗体力、体力枯竭则检定灰显 → 死循环 → **应报软锁口袋 P1**。
   · 口袋 B {ff_a, ff_b} = fail-forward:ff_b 检定 success/fail **都**→ safe_out(离开口袋)→ 负担得起一次就脱身
       → 只剩"到达时体力已不足"才卡(=悲观可达 backlog,非纯拓扑)→ **不应报**(守零误报)。
   · 口袋 C {fum_a, fum_b} = fumble 原地:success/fail 都逃出(旧闸只看 fail 会放行),但**已声明的 fumble 无 to**、
       原地留口袋 + 已扣体力 → 与口袋 A 同构、只是逃逸失败档从 fail 换成 fumble → **应报**(对称接缝补齐:pocket_fumble)。
   · 口袋 D {esc_a, esc_b} = fumble 也逃:已声明 fumble 但 fumble.to 也→ safe_out → 每档都能离开 → **不应报**(证新判据只抓「已声明且不逃」)。
   四口袋内每个节点【各自】都有无条件出口 → 逐节点「无保底出口」检查都放行 → 正是 SCC 闸要补的盲区。 */
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
              { label: '进 fumble-原地 口袋', to: 'fum_a' },
              { label: '进 fumble-也逃 口袋', to: 'esc_a' },
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
          /* ── 口袋 C:fumble 原地(应报)—— success/fail 都逃(旧闸放行),已声明 fumble 无 to、原地留口袋 + 扣 cost ── */
          fum_a: {
            kind: 'scene', name: 'E', look: '深潭边。',
            links: [{ label: '下潜', to: 'fum_b' }]
          },
          fum_b: {
            kind: 'encounter', title: 'F', look: '暗流。',
            checks: [{
              id: 'diveF', label: '潜过暗流(游泳 · DC 8)', skill: '游泳', dc: 8, dice: '2d6',
              cost: { res: '体力', amount: 1 },
              success: { text: '游过去了。', to: 'safe_out' },            // 逃出口袋
              fail: { text: '被冲回岸边、爬上栈道走了。', to: 'safe_out' },  // ← fail 也逃 → 旧闸(只看 fail)放行
              fumble: { text: '呛水力竭,瘫在原地。' }                    // ← 已声明、无 to = 原地留口袋 + 已扣体力 → grind(新判据抓)
            }],
            exits: [{ to: 'fum_a', label: '退回' }]                       // 唯一无条件出口=指回口袋内
          },
          /* ── 口袋 D:fumble 也逃(不应报,守零误报)—— 已声明 fumble 但 fumble.to 也离开口袋 ── */
          esc_a: {
            kind: 'scene', name: 'G', look: '缓坡。',
            links: [{ label: '上坡', to: 'esc_b' }]
          },
          esc_b: {
            kind: 'encounter', title: 'H', look: '碎石坡。',
            checks: [{
              id: 'climbH', label: '攀上碎石坡(攀爬 · DC 7)', skill: '攀爬', dc: 7, dice: '2d6',
              cost: { res: '体力', amount: 1 },
              success: { text: '爬上去了。', to: 'safe_out' },
              fail: { text: '滑下来、换条路走了。', to: 'safe_out' },
              fumble: { text: '摔一跤,但滚到坡下出口。', to: 'safe_out' }   // ← 已声明 fumble 也逃 → 不该报
            }],
            exits: [{ to: 'esc_a', label: '退回' }]
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
