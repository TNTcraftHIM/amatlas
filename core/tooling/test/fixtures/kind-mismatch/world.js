/* fixture:world 有 encounter 节点,但配套 game.js 漏 use tabletop module
   → kind↔模块静态检查应报 encounter「没有模块认领」P0(scene 有 TextAdventure 不报)。
   模拟 showcase 实测:弱模型做"文字冒险+跑团"混合、game.js 漏了 createTabletopModule
   → engine.start() 崩、游戏白屏(正文/选项不渲染,只剩插件工具栏)。 */
const W = {
  id: '49de8ff4-74aa-4172-987e-6e138c0248b9',
  start: { map: 'm', node: 'hall' },
  maps: { m: { nodes: {
    hall:  { kind: 'scene', look: '大厅。', links: [{ to: 'trial', label: '去试炼' }] },
    trial: { kind: 'encounter', look: '试炼。',
             checks: [{ id: 'c', label: '检定', skill: 's', dc: 5, dice: '2d6',
                        success: { text: '成', to: 'hall' }, fail: { text: '败', to: 'hall' } }],
             exits: [{ to: 'hall', label: '返回' }] }
  } } }
};
if (typeof module !== 'undefined' && module.exports) module.exports = W;
