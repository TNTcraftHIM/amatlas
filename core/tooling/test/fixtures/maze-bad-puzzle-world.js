/* graph-audit:maze3d puzzle 坏夹具 → 模板形状、结果白名单、混写与 pages 边界均为 P0。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_BAD_PUZZLE_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var code = function (answer) {
    return { kind: 'code', prompt: '输入编号。', answer: answer };
  };
  var success = function () { return { hint: '机关打开。' }; };
  var fail = function () { return { hint: '编号不对。' }; };
  return {
    id: '22d0dd70-194c-4b7d-8fb8-dbc3a76c1742',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '坏谜题',
        maze: {
          grid: ['###############', '#............D#', '###############'], start: { x: 1, y: 1, dir: 'E' },
          events: [
            { x: 1, y: 1, puzzle: { kind: 'dial', prompt: '转动刻度。', answer: '1' }, success: success(), fail: fail() },
            { x: 2, y: 1, puzzle: code('12x'), success: success(), fail: fail() },
            { x: 3, y: 1, puzzle: { kind: 'code', prompt: '输入编号。', answer: '1234', maxLength: 3 }, success: success(), fail: fail() },
            { x: 4, y: 1, puzzle: { kind: 'sequence', prompt: '依次点亮。', choices: ['月', '星'], answer: ['火'] }, success: success(), fail: fail() },
            { x: 5, y: 1, puzzle: { kind: 'toggle', prompt: '拨动开关。', labels: ['一', '二'], answer: [true] }, success: success(), fail: fail() },
            { x: 6, y: 1, puzzle: { kind: 'code', prompt: '输入编号。', answer: '7', script: function () {} }, success: success(), fail: fail() },
            { x: 7, y: 1, puzzle: code('7'), fail: fail() },
            { x: 8, y: 1, puzzle: code('7'), success: success(), fail: {} },
            { x: 9, y: 1, puzzle: code('7'), success: { hint: '机关打开。', once: true }, fail: { hint: '错误。', set: [{ x: 1, y: 1, ch: '.' }] } },
            { x: 10, y: 1, hint: '不应先显示。', puzzle: code('7'), success: success(), fail: fail() },
            { x: 11, y: 1, examine: '普通石板。', success: success() },
            {
              x: 12, y: 1,
              puzzle: code('7'), success: success(), fail: fail(),
              pages: [{ examine: '默认页。' }]
            },
            {
              x: 1, y: 1, visual: 'marker',
              pages: [{
                puzzle: { kind: 'sequence', prompt: '依次点亮。', choices: ['月'], answer: ['星'] },
                success: {}, fail: { hint: '' }
              }]
            },
            {
              x: 2, y: 1, visual: 'none',
              puzzle: code('7'), success: success(), fail: fail()
            }
          ]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
