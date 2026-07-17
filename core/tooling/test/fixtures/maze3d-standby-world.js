/* graph-audit ④ maze3d「无保底出口」豁免夹具(showcase《零号台站》issue④):
   maze3d 节点进度在 canvas 内部(走到发光门=winKey、被怪抓=scareKey,均经 api.apply 写 flag,静态图看不到),
   links 只是【事后路由】→ 即使 win/caught/撤回 全带 requires 也非 soft-lock(玩家始终能玩迷宫=保底行动)。
   豁免后【不报无保底出口】、退出码 0;移除豁免则因三 link 全 requires(无 lockHint)→ 误报 [确认][P0] 退出码 1。
   · maze —— maze3d、三条 link 全 requires(撤回门控成 !被抓&&!通关,被抓后只剩结局=issue④ 修法)→ 豁免不报。
   · winEnd/caughtEnd —— 结局(links:[],P2 死胡同=预期,非 P0)。
   won/caught 在 initState 声明(迷宫模块运行时写)→ 死键检查跳过、零误报。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.MAZE3D_STANDBY_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: 'a093cf40-45ef-442b-af3c-be22c0ee707b',
    start: { map: 'm', node: 'lobby' },
    initState: { won: false, caught: false },
    maps: { m: { name: 'M', nodes: {
      lobby: { kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' }, links: [{ label: '进迷宫', to: 'maze' }] },
      maze: {
        kind: 'maze3d', winKey: 'won', scareKey: 'caught', look: '迷宫',
        maze: { grid: ['######', '#...D#', '######'], start: { x: 1, y: 1, dir: 'E' }, monsters: [{ x: 2, y: 1, face: 'mimic' }] },
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
