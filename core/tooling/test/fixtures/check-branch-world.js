/* fixture:检定后果分支边(v12:success.to / fail.to 是真边——闸随契约进化)。
   期望:① vault 只能经 success.to 到达 → **不报不可达**(旧 outEdges 不算检定边会误报)
        ② fail.to 指向不存在的 'phantom' → P0 死链(带「·失败」标签)
   对照:gate 的 links/exits 之外仅靠检定分支连通。 */
var WORLD = {
  id: 'dff302bf-9c29-44c8-9052-96f86074ad8f',
  start: { map: 'm', node: 'gate' },
  maps: { m: { name: 'M', nodes: {
    gate: {
      kind: 'encounter', look: '大门。',
      checks: [ { id: 'pick', label: '开锁', skill: '巧手', dc: 7, dice: '2d6',
        success: { text: '锁开了。', to: 'vault' },
        fail: { text: '撬断了。', to: 'phantom' } } ],   // ← phantom 不存在 → P0 死链
      links: [ { label: '等待', run: function () { return '风声。'; } } ]
    },
    vault: { kind: 'encounter', look: '金库。', checks: [], links: [ { label: '回', to: 'gate' }, { label: '下竞技场', to: 'arena' }, { label: '看陷坑', to: 'pit' } ] },
    arena: {
      kind: 'encounter', look: '竞技场。',
      // 纯分叉检定节点(Disco 红检式「检定即分叉」):只有 checks、无 links/exits;
      // success.to+fail.to 双目的地、无 cost/available、success 不置 flag → 必然移动 = 等价保底,不该报无保底 P0。
      checks: [ { id: 'duel', label: '决斗', skill: '体魄', dc: 8, dice: '2d6',
        success: { text: '获胜。', to: 'vault' },
        fail: { text: '败北被扔出去。', to: 'gate' } } ]
    },
    pit: {
      kind: 'encounter', look: '陷坑。',
      // 对照:只有 success.to、fail 留原地的纯检定节点 → 失败可能反复卡(普通检定边不算保底)→ 仍该报无保底。
      checks: [ { id: 'climb', label: '攀爬', skill: '体魄', dc: 9, dice: '2d6',
        success: { text: '爬出。', to: 'gate' },
        fail: { text: '滑回坑底。' } } ]
    }
  } } }
};
if (typeof module !== 'undefined' && module.exports) module.exports = WORLD;
if (typeof window !== 'undefined') window.MY_WORLD = WORLD;
