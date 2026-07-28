/* graph-audit:maze3d 网格【发光门被墙围死】夹具 → [确认][P0] 迷宫不可通关、退出码 1。
   门 'D' 四周全 '#'(从 start 走不到任何门旁)→ 玩家永远开不了门、逃不出;BFS 可达精确判定(零误报)。
   (maze3d 仍豁免"无保底出口";本 P0 仅来自门围死。won/caught 在 initState → 无死键误报。) */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE_DOOR_WALLED_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '55df6497-43fb-4932-8e7d-3751b57f729a',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false, caught: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', scareKey: 'caught', look: '迷宫',
        maze: { grid: ['#####', '#.#D#', '#.###', '#...#', '#####'], start: { x: 1, y: 1, dir: 'E' } },
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
