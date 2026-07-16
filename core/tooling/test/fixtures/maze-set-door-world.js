/* graph-audit:maze3d 可达 events.set 生成 D 夹具 → 合法动态出口,不报迷宫不可通关。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_SET_DOOR_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '6311724c-546c-4ff3-bc46-2b028cd07549',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '可达机关生成出口门',
        maze: {
          grid: ['#####', '#...#', '#####'], start: { x: 1, y: 1, dir: 'E' },
          events: [{ x: 2, y: 1, visual: 'plate', hint: '门从旁边升起。', set: [{ x: 3, y: 1, ch: 'D' }] }]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
