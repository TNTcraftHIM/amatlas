/* graph-audit:maze3d trigger/examine 坏夹具 → trigger 坏词、examine 非字符串、空 interact 均为 [确认][P0]。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_BAD_TRIGGER_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '9456cfaa-8c47-44f3-bad1-e05d7c96671f',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '坏互动',
        maze: {
          grid: ['#####', '#..D#', '#####'], start: { x: 1, y: 1, dir: 'E' },
          events: [
            { x: 1, y: 1, trigger: 'touch', hint: '坏 trigger' },
            { x: 2, y: 1, examine: 42 },
            { x: 1, y: 1, trigger: 'interact' }
          ]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
