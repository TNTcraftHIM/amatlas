/* fixture:world 有 cutscene 节点,但配套 game.js(手写装配)漏 use 过场模块
   → kind↔模块静态检查应报 cutscene「没有模块认领」P0(scene 有 TextAdventure 不报)。
   注:boot 形态会整体让位(kind-mismatch-boot 夹具已覆盖);本夹具锁的是手写 escape-hatch 路径。 */
const W = {
  id: '3efb6e99-fd38-4b2c-9ccf-a155bf19c734',
  start: { map: 'm', node: 'intro' },
  maps: { m: { nodes: {
    intro: { kind: 'cutscene', title: '序章',
      beats: [{ dur: 2, text: '黑幕。' }],
      links: [{ to: 'hall', label: '进入' }] },
    hall: { kind: 'scene', look: '大厅。', links: [{ to: 'intro', label: '回' }] }
  } } }
};
if (typeof module !== 'undefined' && module.exports) module.exports = W;
