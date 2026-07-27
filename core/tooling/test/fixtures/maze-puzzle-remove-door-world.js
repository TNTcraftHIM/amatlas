/* graph-audit:同一 puzzle.success.set 打通门旁却删除原始 D → runtime 最终无出口，必须 P0。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_PUZZLE_REMOVE_DOOR_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '94380d7b-b581-4a91-8554-23631975eebd',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '出口消失',
        maze: {
          grid: ['#######', '#.#D###', '#.#####', '#...###', '#######'], start: { x: 1, y: 1, dir: 'E' },
          events: [{
            x: 1, y: 3, visual: 'plate', examine: '石板同时连着墙和出口。',
            puzzle: { kind: 'code', prompt: '输入编号。', answer: '1' },
            success: {
              hint: '通道打开，但出口也沉入地下。',
              set: [{ x: 2, y: 1, ch: '.' }, { x: 3, y: 1, ch: '.' }]
            },
            fail: { hint: '不对。' }
          }]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
