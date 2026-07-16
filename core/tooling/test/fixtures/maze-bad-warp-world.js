/* graph-audit:maze3d warp 坏夹具 → warp 到墙 / dir 非法均为 [确认][P0]。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_BAD_WARP_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '206b54d9-1bce-427c-9a3a-ad6c8137f837',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '坏 warp',
        maze: {
          grid: ['#####', '#..D#', '#####'], start: { x: 1, y: 1, dir: 'E' },
          events: [{ x: 1, y: 1, hint: '坏传送', warp: { x: 0, y: 0, dir: 'Q' } }]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
