/* graph-audit:maze3d pages 坏夹具 → page 禁止字段/坏 trigger/空内容/坏动作形状为 P0,全 when 无默认页为 P1。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_BAD_PAGES_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '7c09a063-b6ec-496b-aa15-6a4d98c17728',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false, hasGem: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', look: '坏 pages',
        maze: {
          grid: ['#####', '#..D#', '#####'], start: { x: 1, y: 1, dir: 'E' }, monsters: [],
          events: [
            { x: 1, y: 1, visual: 'plate', pages: [{ visual: 'pickup', hint: '坏字段' }] },
            { x: 1, y: 1, pages: [{ trigger: 'use', hint: '坏 trigger' }] },
            { x: 1, y: 1, pages: [{ trigger: 'interact' }] },
            { x: 1, y: 1, pages: [{ set: [{ x: 2, y: 1, ch: 'X' }] }] },
            { x: 1, y: 1, pages: [{ when: function (S) { return !!S.hasGem; }, hint: '只有状态页' }] },
            { x: 1, y: 1, hint: '顶层混写', pages: [{ hint: '默认页' }] }
          ]
        },
        links: [{ label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } }]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
