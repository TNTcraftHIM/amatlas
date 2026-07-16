/* fixture:单图过大(round11:51 节点塞一图 → 小地图必然拥挤)。
   34 个节点线性链(全可达、尾节点带回边=非死胡同),期望:P2 提示「单图过大/拆图」、退出码 0(非闸、纯可用性提示)。 */
var nodes = {};
for (var i = 0; i < 34; i++) {
  nodes['n' + i] = {
    kind: 'scene', name: '节点' + i, look: '第 ' + i + ' 间。',
    links: [ { label: '前进', to: { map: 'big', node: 'n' + ((i + 1) % 34) } } ]
  };
}
var WORLD = { id: 'b0b2f240-b28c-4ff0-9a2b-f3503c821c89', start: { map: 'big', node: 'n0' }, maps: { big: { name: '大图', nodes: nodes } } };
if (typeof module !== 'undefined' && module.exports) module.exports = WORLD;
if (typeof window !== 'undefined') window.MY_WORLD = WORLD;
