/* graph-audit:maze3d 无 D 但写 winKey → [确认][P0] 无法触发通关。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_NO_DOOR_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '124a3597-07f8-44f5-8e10-59fb32758796',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '没有出口门',
        maze: { grid: ['#####', '#...#', '#####'], start: { x: 1, y: 1, dir: 'E' } },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
