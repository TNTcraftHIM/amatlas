/* graph-audit:maze3d 门【静态围死、但可达压力板的 events.set 打通门旁】夹具 → 不报 P0(R1 解谜)。
   门 'D'(3,1) 四周全 '#'(静态围死);压力板 (1,3)(可达)的 set 把 (3,2) 改成 '.' → 门旁运行时可达。
   这是经典「踩机关才开唯一门」地牢解谜:门故意静态不可达,graph-audit 须认 set 不动点、零误报。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_SET_UNLOCK_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '38733a48-dab3-4676-84e5-e15f37455ce9',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false, caught: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', scareKey: 'caught', look: '迷宫',
        maze: {
          grid: ['#####', '#.#D#', '#.###', '#...#', '#####'], start: { x: 1, y: 1, dir: 'E' },
          events: [{ x: 1, y: 3, hint: '踩到机关', set: [{ x: 3, y: 2, ch: '.' }] }]   // 压力板 (1,3) 可达 → set 打通 (3,2) → 门 (3,1) 旁可达
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
