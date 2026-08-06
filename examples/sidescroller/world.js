/* Amatlas 2D 横版射击首个切片：子步 A 只证明跑、跳与卷屏。 */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.SIDESCROLLER_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var rows = [
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#..................###.................#',
    '#......................................#',
    '#...........##.........................#',
    '#......................................#',
    '#......................................#',
    '########################################'
  ];
  return {
    id: '81fe041f-b8e6-45ab-8a6f-6e03840e6dd2',
    start: { map: 'coast', node: 'briefing' },
    seed: 20260723,
    initState: { sidescrollerCleared: false },
    maps: { coast: { name: '海堤试验段', nodes: {
      briefing: {
        kind: 'scene', title: '海堤入口',
        look: '前方是一段废弃海堤。方向键或 A/D 移动，W/↑ 跳跃，空格开火；也可使用画布下方按钮。击毁固定哨戒炮后海堤门才会解除封锁。',
        links: [{ to: 'run', label: '进入横版试验段' }]
      },
      run: {
        kind: 'sidescroller', title: '海堤外缘',
        sidescroller: {
          presentation: { profile: 'coast' },
          viewport: { w: 320, h: 180 },
          map: { tileSize: 16, rows: rows },
          player: { spawn: { x: 3, y: 8 }, health: 3, run: 72, jump: 210,
            weapon: { cooldownTicks: 10, damage: 1 } },
          sentry: { id: 'gate-sentry', spawn: { x: 34, y: 8 }, health: 3,
            fireEveryTicks: 72, projectileSpeed: 96, damage: 1 },
          clear: { defeat: 'gate-sentry', exposeLink: 'continue' }
        },
        links: [
          { id: 'continue', to: 'clear', label: '穿过解除封锁的海堤门' },
          { id: 'abort', to: 'briefing', label: '撤离试验段' }
        ]
      },
      clear: { kind: 'scene', title: '海堤门后', look: '哨戒炮熄火，海堤门滑开。第一个横版切片已经形成闭环。', links: [] }
    } } }
  };
});
