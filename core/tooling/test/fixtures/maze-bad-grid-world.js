/* graph-audit:maze3d grid 形状坏夹具 → 非矩形 / 非法字符均为 [确认][P0]。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_BAD_GRID_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '8559b746-7683-4f13-a854-9a19ad62e40d',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '坏 grid',
        maze: { grid: ['#####', '#..D#', '#.X#', '#####'], start: { x: 1, y: 1, dir: 'E' } },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
