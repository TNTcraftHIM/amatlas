/* graph-audit:maze3d 门旁【在孤立区、但可达机关的 events.warp 把玩家传送过去】夹具 → 不报 P0(R1 解谜)。
   门 'D'(3,1) 旁 (3,2) 在孤立 col3(被 col2 墙隔、静态走不到);压力板 (1,3)(可达)的 warp 把玩家送到 (3,3) → 门旁可达。
   证 graph-audit 不动点也认 events.warp(传送=玩家可凭空出现的新 BFS 起点)、零误报。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_WARP_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '382d1ff7-7ffe-49ff-8351-c57dde8d3ef5',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false, caught: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', scareKey: 'caught', look: '迷宫',
        maze: {
          grid: ['#####', '#.#D#', '#.#.#', '#.#.#', '#####'], start: { x: 1, y: 1, dir: 'E' },
          events: [{ x: 1, y: 3, hint: '空间扭曲', warp: { x: 3, y: 3, dir: 'N' } }]   // 压力板 (1,3) 可达 → warp 玩家到孤立 col3 的 (3,3) → 门 (3,1) 旁 (3,2) 可达
        },
        links: [
          { label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } },
          { label: '被抓', to: 'caughtEnd', requires: function (s) { return !!s.caught; } },
          { label: '撤回', to: 'lobby', requires: function (s) { return !s.caught && !s.won; } }
        ]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] },
      caughtEnd: { kind: 'scene', look: '被吞没', scene: { region: 'night', mood: 'dread' }, links: [] }
    } } }
  };
});
