/* graph-audit:maze3d puzzle 对抗边界 → 稀疏答案、空 success、set 后 warp 卡墙为 P0；无外观无 examine 为 P1。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_PUZZLE_EDGE_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var code = function () { return { kind: 'code', prompt: '输入编号。', answer: '7' }; };
  var fail = function () { return { hint: '不对。' }; };
  return {
    id: '11567f9a-6bd5-46ed-bb50-d1b3dd8a9bbe',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '谜题边界',
        maze: {
          grid: ['##########', '#.......D#', '##########'], start: { x: 1, y: 1, dir: 'E' },
          events: [
            { x: 1, y: 1, visual: 'plate', puzzle: { kind: 'sequence', prompt: '依次点亮。', choices: ['月'], answer: new Array(1) }, success: { hint: '亮了。' }, fail: fail() },
            { x: 2, y: 1, visual: 'plate', puzzle: { kind: 'toggle', prompt: '拨动开关。', labels: ['月'], answer: new Array(1) }, success: { hint: '亮了。' }, fail: fail() },
            { x: 3, y: 1, visual: 'plate', puzzle: code(), success: { set: [] }, fail: fail() },
            { x: 4, y: 1, visual: 'plate', puzzle: code(), success: { activateMonsters: [] }, fail: fail() },
            { x: 5, y: 1, visual: 'plate', puzzle: code(), success: { hint: '墙升起。', set: [{ x: 6, y: 1, ch: '#' }], warp: { x: 6, y: 1 } }, fail: fail() },
            { x: 6, y: 1, puzzle: code(), success: { hint: '完成。' }, fail: fail() },
            { x: 7, y: 1, visual: 'none', trigger: 'interact', puzzle: code(), success: { hint: '完成。' }, fail: fail() },
            { x: 7, y: 1, visual: 'plate', puzzle: code(), success: { hint: '墙先降下。', set: [{ x: 0, y: 0, ch: '.' }], warp: { x: 0, y: 0 } }, fail: fail() }
          ]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
