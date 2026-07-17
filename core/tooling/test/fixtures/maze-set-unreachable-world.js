/* graph-audit:maze3d 门【围死 + 有 set,但压力板本身也围死(玩家踩不到)】夹具 → 仍报 P0(R1 解谜不漏真软锁)。
   门 'D'(3,1) 围死;压力板 (5,1) 在右侧孤立区(col5,被 (4,*) 墙隔开、从 start 走不到)→ set 永不触发 → 门仍围死。
   证 graph-audit 不被「写了 set 就算」蒙蔽:只认【可达的机关】(不动点),机关不可达 → 门仍 P0。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_SET_UNREACHABLE_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '1cc334f3-8cc1-4565-aeba-01ff3c01db60',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false, caught: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', scareKey: 'caught', look: '迷宫',
        maze: {
          grid: ['#######', '#.#D#.#', '#.###.#', '#...#.#', '#######'], start: { x: 1, y: 1, dir: 'E' },
          events: [{ x: 5, y: 1, hint: '机关在隔离区', set: [{ x: 3, y: 2, ch: '.' }] }]   // 压力板 (5,1) 在孤立 col5、不可达 → set 不触发 → 门仍围死
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
