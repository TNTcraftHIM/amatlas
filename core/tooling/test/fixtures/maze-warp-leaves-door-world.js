/* graph-audit:同一事件先生成 D 再 warp 到隔离格 → runtime 已离开门旁，必须 P0。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_WARP_LEAVES_DOOR_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '5a642082-57e9-4e6a-a172-4e201247fed5',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '被传走的出口',
        maze: {
          grid: ['#######', '#...###', '#######', '#####.#', '#######'], start: { x: 1, y: 1, dir: 'E' },
          events: [{
            x: 2, y: 1, visual: 'plate', hint: '门升起后，你被抛到孤岛。',
            set: [{ x: 3, y: 1, ch: 'D' }], warp: { x: 5, y: 3 }
          }]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
