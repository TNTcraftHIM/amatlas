/* graph-audit:maze3d 合法 puzzle 夹具 → 顶层三模板、page 模板与 success.set BFS 均零误报。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_PUZZLE_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '19ab3855-93b9-44b4-92f8-d3795a622514',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false, solved: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '合法谜题',
        maze: {
          grid: ['#####', '#.#D#', '#.###', '#...#', '#####'], start: { x: 1, y: 1, dir: 'E' },
          events: [
            {
              x: 1, y: 3, visual: 'plate', examine: '石板上刻着三位编号。',
              puzzle: { kind: 'code', prompt: '输入编号。', answer: '137', maxLength: 3 },
              success: { hint: '墙面沉下。', set: [{ x: 3, y: 2, ch: '.' }] },
              fail: { hint: '编号不对。' }
            },
            {
              x: 2, y: 3, visual: 'marker',
              pages: [{
                examine: '盘面刻着月、星、火。',
                puzzle: { kind: 'sequence', prompt: '依次点亮符号。', choices: ['月', '星', '火'], answer: ['星', '月', '火'] },
                success: { hint: '符号全部亮起。', run: function (s) { s.solved = true; } },
                fail: { hint: '机关发出错音。' }
              }]
            },
            {
              x: 1, y: 1, visual: 'plate', trigger: 'interact',
              puzzle: { kind: 'toggle', prompt: '拨动开关。', labels: ['月', '星', '火'], answer: [true, false, true] },
              success: { hint: '开关锁定。', turn: 'S' },
              fail: { hint: '组合不对。' }
            }
          ]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
