/* 坏 crawler(kind:'maze')世界:三种数据缺陷,crawler runtime 全静默退化(不抛)、原本四闸全判绿。
   crawlerIssues 应逐个 P0 点名 → 退出码 1。三节点都从 entry 可达(避免无关孤儿噪声)。 */
module.exports = {
  id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  start: { map: 'dungeon', node: 'entry' },
  maps: {
    dungeon: {
      name: '地窖',
      nodes: {
        entry: {
          kind: 'scene', name: '入口', look: '三道门。',
          links: [
            { label: '无 maze 数据的迷宫', to: 'nomaze' },
            { label: 'start 落墙的迷宫', to: 'wallstart' },
            { label: '锯齿(非矩形)grid 的迷宫', to: 'raggedgrid' }
          ]
        },
        nomaze: { kind: 'maze', title: '空迷宫' },                    // 故意不写 node.maze
        wallstart: {
          kind: 'maze', title: '墙里出生',
          maze: { grid: ['#####', '#...#', '#####'], start: { x: 0, y: 0, dir: 'N' } }   // (0,0)='#'
        },
        raggedgrid: {
          kind: 'maze', title: '锯齿迷宫',
          maze: { grid: ['#####', '#..#', '#####'], start: { x: 1, y: 1, dir: 'N' } }     // 第 1 行宽 4 ≠ 5
        }
      }
    }
  }
};
