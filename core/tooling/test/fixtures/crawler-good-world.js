/* 合法 crawler(kind:'maze')世界:grid 用开放词汇('E'=地板+内容标记,对齐 crawler 自身 test/设计稿 §2)。
   两端锁「合法档不误报」:① maze3dIssues 收紧到 kind==='maze3d' 后不再把 '#.DK' 白名单误套 crawler → 'E' 不再报「字符非法」;
   ② crawlerIssues 对合法 grid/start 零 P0/P1。cells.exit.to→hall 的可达性由 outEdges 读 cells 覆盖(hall 非孤儿)。 */
module.exports = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  start: { map: 'dungeon', node: 'cellar' },
  maps: {
    dungeon: {
      name: '地窖',
      nodes: {
        cellar: {
          kind: 'maze', title: '地窖',
          maze: {
            grid: ['#####', '#...#', '#.#.#', '#..E#', '#####'],   // 'E'=开放词汇内容标记(crawler 合法),非 maze3d 的 #.DK
            start: { x: 1, y: 1, dir: 'S' },
            cells: { '3,3': { look: '一道石门。', exit: { to: 'hall', label: '推开石门' } } }
          }
        },
        hall: { kind: 'scene', name: '大厅', look: '你走出地窖,重见天日。——结局', links: [] }
      }
    }
  }
};
