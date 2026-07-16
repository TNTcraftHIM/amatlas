/* graph-audit:maze3d wall-pickup 坏夹具 → face 未指向墙为 [确认][P0]。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_BAD_WALL_PICKUP_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: 'd39f75c0-4197-428e-843d-87e1d08288d0',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '坏 wall-pickup',
        maze: {
          grid: ['######', '#...D#', '######'], start: { x: 1, y: 1, dir: 'E' },
          events: [{ x: 1, y: 1, visual: 'wall-pickup', face: 'E', icon: 'scroll', hint: '东侧不是墙' }]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
