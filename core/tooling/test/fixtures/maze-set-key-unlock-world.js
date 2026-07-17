/* graph-audit:maze3d 门【静态围死、但可达压力板的 events.set 放出钥匙 'K' 打通门旁】夹具(迷宫批1 M5)→ 不报 P0。
   门 'D'(3,1) 四周全 '#'(静态围死);压力板 (1,3)(可达)的 set 把 (3,2) 改成 'K'(而非 '.')→ 门旁运行时可达。
   这是「机关召唤钥匙」范式(先解压力板、钥匙才现身,拾取后门开):graph-audit 的 set 不动点(:244)早已把
   s.ch === 'K' 与 s.ch === '.' 同等当门旁解锁来源建模——本夹具锁死这条正向断言,防未来回退成只认 '.'。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_SET_KEY_UNLOCK_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '71e8fd6d-28ae-4ae3-8f60-e7149346ed6d',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false, caught: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', scareKey: 'caught', look: '迷宫',
        maze: {
          grid: ['#####', '#.#D#', '#.###', '#...#', '#####'], start: { x: 1, y: 1, dir: 'E' },
          events: [{ x: 1, y: 3, once: true, visual: 'plate', hint: '石板下沉,一道光从裂缝里透出。', set: [{ x: 3, y: 2, ch: 'K' }] }]   // 压力板 (1,3) 可达 → set 放出钥匙于 (3,2) → 门 (3,1) 旁可达
        },
        links: [
          { label: '出迷宫', to: 'winEnd', requires: function (s) { return !!s.won; } },
          { label: '被抓', to: 'caughtEnd', requires: function (s) { return !!s.caught; } },
          { label: '撤回', to: 'lobby', requires: function (s) { return !s.caught && !s.won; } }
        ]
      },
      winEnd: { kind: 'scene', look: '逃出', scene: { region: 'forest', mood: 'dawn' }, links: [] },
      caughtEnd: { kind: 'scene', look: '被吞没', scene: { region: 'night', mood: 'dread' }, links: [] }
    } } }
  };
});
