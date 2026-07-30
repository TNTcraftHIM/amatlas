/* graph-audit:maze3d 网格【钥匙被墙围死】夹具 → [可疑][P1] 钥匙拿不到、退出码 0(P1 不硬拦)。
   门 'D' 可达(无 P0),但钥匙 'K' 四周全 '#'(从 start 走不到)→ 若是"先找钥匙再开门"则无法通关。BFS 精确(零误报)。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_KEY_BOXED_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '069f7d2e-eb8d-43cb-9c00-928c3e9575b5',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false, caught: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', scareKey: 'caught', look: '迷宫',
        maze: { grid: ['#######', '#.....#', '#.###.#', '#.#K#.#', '#.###.#', '#....D#', '#######'], start: { x: 1, y: 1, dir: 'E' } },
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
