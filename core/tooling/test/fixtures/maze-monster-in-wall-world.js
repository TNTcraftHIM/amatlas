/* graph-audit:maze3d monster 在墙里夹具 → [可疑][P1]、退出码 0。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_MONSTER_IN_WALL_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: 'a255e1f4-1d5f-4415-982b-606acb6a1a79',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '墙里怪物',
        maze: { grid: ['#####', '#..D#', '#####'], start: { x: 1, y: 1, dir: 'E' }, monsters: [{ x: 0, y: 0, face: 'mimic' }] },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
