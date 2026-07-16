/* graph-audit:maze3d events.set 坏夹具 → 越界 / 非法 ch 均为 [确认][P0]。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_BAD_EVENT_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '98d2cf1a-22c4-4946-929c-96cf94691b6f',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '坏 set',
        maze: {
          grid: ['#####', '#..D#', '#####'], start: { x: 1, y: 1, dir: 'E' },
          events: [{ x: 1, y: 1, when: 'enter', hint: '坏机关', set: [{ x: 9, y: 1, ch: '.' }, { x: 2, y: 1, ch: 'X' }] }]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
