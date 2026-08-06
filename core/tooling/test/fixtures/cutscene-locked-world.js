/* fixture:cutscene 全条件出口(无 lockHint)→ 「无保底出口」P0 正确拦(cutscene-design.md §7 两端锁的反端)。
   cutscene 不享 maze 豁免(无 maze 字段)、也不该享——出口全锁 = 玩家演完真的走不出去。 */
const W = {
  id: 'edbd1e45-4a55-4560-9b39-580b43740ea4',
  start: { map: 'm', node: 'intro' },
  maps: { m: { name: '夹具', nodes: {
    intro: { kind: 'cutscene', title: '锁死的序章',
      beats: [{ dur: 2, text: '黑幕。', run: function (S) { S.flags.key = true; } }],
      links: [{ to: 'hall', label: '进入', requires: function (S) { return !!S.flags.key; } }] },
    hall: { kind: 'scene', look: '大厅。', links: [{ to: 'intro', label: '回' }] }
  } } }
};
if (typeof module !== 'undefined' && module.exports) module.exports = W;
