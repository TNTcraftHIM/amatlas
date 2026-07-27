/* graph-audit:事件 set 后玩家留在机关格；即使后路封死，面前生成 D 仍可通关。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_EVENT_POSITION_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: 'e660506a-af86-4a53-929c-085cb3e1e9fb',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '后路封闭',
        maze: {
          grid: ['#######', '#....##', '#######'], start: { x: 1, y: 1, dir: 'E' },
          events: [{
            x: 3, y: 1, visual: 'plate', hint: '门在眼前升起，后路封闭。',
            set: [{ x: 2, y: 1, ch: '#' }, { x: 4, y: 1, ch: 'D' }]
          }]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
