/* graph-audit 死 state 键 —— maze3d winKey/scareKey 豁免【对象级、仅 kind:'maze3d'】两端锁(R2 二轮批3 #4):
   · corridorLit —— 外层 link.requires 读 S.corridorLit,仅靠【真 maze3d 节点】声明 winKey:'corridorLit' 豁免
       (canvas 内写、静态图看不见)→ **不应报**(合法豁免端)。initState 未声明它 → 豁免唯一来源=maze3d winKey。
   · doorArmed —— 真 maze3d 节点声明 scareKey:'doorArmed'、外层读 S.doorArmed → **不应报**(scareKey 同理)。
   · decoyFlag —— 外层读 S.decoyFlag,但同名 winKey 只出现在【非 maze3d 的 scene 节点】的 decoyMeta 里(红队诱饵)
       → 对象级收紧后不再豁免 → **应报 P0**(spoof 端;原裸文本正则会被它抵消)。
   maze3d 节点为合法可通关迷宫(有可达 D 门),不引入无关 maze3d P0;全节点连通、无孤儿/死链。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.DEAD_STATEKEY_MAZE3D_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f',
    start: { map: 'm', node: 'lobby' },
    maps: { m: { name: 'M', nodes: {
      lobby: {
        kind: 'scene', look: '入口', scene: { region: 'room', mood: 'calm' },
        links: [
          { label: '进迷宫', to: 'maze' },                                                           // 无条件保底
          { label: '诱饵房', to: 'decoyRoom' },                                                       // 无条件
          { label: '诱饵门(需 decoyFlag)', to: 'winEnd', requires: function (S) { return !!S.decoyFlag; } }  // 读 decoyFlag — 无真写、无真 maze3d 声明
        ]
      },
      maze: {
        kind: 'maze3d', winKey: 'corridorLit', scareKey: 'doorArmed', look: '迷宫',
        maze: { grid: ['######', '#...D#', '######'], start: { x: 1, y: 1, dir: 'E' }, monsters: [{ x: 2, y: 1, face: 'mimic' }] },
        links: [
          { label: '通关(迷宫点亮)', to: 'winEnd', requires: function (S) { return !!S.corridorLit; } }, // 读 corridorLit — maze3d winKey 豁免
          { label: '警报触发(被抓)', to: 'winEnd', requires: function (S) { return !!S.doorArmed; } },    // 读 doorArmed — maze3d scareKey 豁免
          { label: '撤回大厅', to: 'lobby' }
        ]
      },
      decoyRoom: {
        kind: 'scene', look: '诱饵房', scene: { region: 'room', mood: 'calm' },
        decoyMeta: { winKey: 'decoyFlag' },   // ← 非 maze3d 节点的诱饵同名 winKey → 对象级收紧后不收 → decoyFlag 不再被豁免
        links: [{ label: '回大厅', to: 'lobby' }]
      },
      winEnd: { kind: 'scene', look: '结束——你完成了', scene: { region: 'forest', mood: 'dawn' }, links: [] }
    } } }
  };
});
