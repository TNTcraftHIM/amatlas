/* graph-audit:maze3d 不可达 events.set 生成 D 夹具 → 仍为 [确认][P0]。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_SET_DOOR_UNREACHABLE_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: 'ff63217f-1a02-457b-811c-405f87baecf8',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '不可达机关生成出口门',
        maze: {
          grid: ['#######', '#...#.#', '#####.#', '#.....#', '#######'], start: { x: 1, y: 1, dir: 'E' },
          events: [{ x: 5, y: 1, visual: 'plate', hint: '这块板踩不到。', set: [{ x: 3, y: 1, ch: 'D' }] }]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
