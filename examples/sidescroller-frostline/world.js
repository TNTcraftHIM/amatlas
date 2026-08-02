/* Amatlas 2D 横版射击第二客户：极夜霜线中继站。 */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.SIDESCROLLER_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var rows = [
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#..............................................#',
    '#............................###...............#',
    '#.................###..........................#',
    '#..............................................#',
    '#.........###..................................#',
    '#..............................................#',
    '################################################'
  ];
  return {
    id: '8b45b7fd-0644-4818-8bb4-066feae290b0',
    start: { map: 'frostline', node: 'relay' },
    seed: 20260802,
    initState: { sidescrollerCleared: false },
    maps: { frostline: { name: '极夜霜线', nodes: {
      relay: {
        kind: 'scene', title: '中继站外闸',
        look: '极夜风暴切断了霜线中继站。货运坡道上的失控防卫塔锁死升降台；穿过冻裂平台，解除它的电源核心。',
        links: [{ to: 'slope', label: '踏上霜线货运坡道' }]
      },
      slope: {
        kind: 'sidescroller', title: '冻裂货运坡道',
        sidescroller: {
          viewport: { w: 320, h: 180 },
          map: { tileSize: 16, rows: rows },
          player: { spawn: { x: 3, y: 8 }, health: 4, run: 84, jump: 224,
            weapon: { cooldownTicks: 8, damage: 2 } },
          sentry: { id: 'relay-warden', spawn: { x: 42, y: 8 }, health: 4,
            fireEveryTicks: 96, projectileSpeed: 80, damage: 1 },
          clear: { defeat: 'relay-warden', exposeLink: 'ascend' }
        },
        links: [
          { id: 'ascend', to: 'handover', label: '启动解锁的货运升降台' },
          { id: 'retreat', to: 'relay', label: '退回中继站外闸' }
        ]
      },
      handover: {
        kind: 'scene', title: '极夜交接',
        look: '防卫塔的红光熄灭，货运升降台穿过风雪抵达主控层。霜线重新广播，中继站把下一班交到你手中。',
        links: []
      }
    } } }
  };
});
