/* graph-audit:同一 puzzle.success.set 对同格先开后关 → runtime 最终仍是墙，不能拿中间值证明门可达。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_PUZZLE_FINAL_SET_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '343a449f-a61f-4829-ad8e-350dccb20cc0',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '最终写入',
        maze: {
          grid: ['#####', '#.#D#', '#.###', '#...#', '#####'], start: { x: 1, y: 1, dir: 'E' },
          events: [{
            x: 1, y: 3, visual: 'plate', examine: '石板上的裂缝会重新闭合。',
            puzzle: { kind: 'code', prompt: '输入编号。', answer: '7' },
            success: { hint: '裂缝刚打开又闭合。', set: [{ x: 3, y: 2, ch: '.' }, { x: 3, y: 2, ch: '#' }] },
            fail: { hint: '不对。' }
          }]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
