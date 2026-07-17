/* graph-audit:maze3d start 坏夹具 → start 在墙 + dir 非法。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_BAD_START_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: 'b2d24843-f38d-4382-b065-9a8059e729c0',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '坏 start',
        maze: { grid: ['#####', '#..D#', '#####'], start: { x: 0, y: 0, dir: 'Q' } },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
