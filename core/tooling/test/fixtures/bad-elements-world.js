/* 夹具:scene.elements 写成非数组(C04;showcase 前瞻审计——作者写错形态→呈现器静默降级同母类)。
   a 节点 elements 写成对象 {…}(应为数组)→ present-svg 运行时抛、整场物件不画;graph-audit 静态 P1 提前抓。
   b 节点 elements:[…] 正确数组 → 不报。P1 不硬拦(退出码 0)。 */
module.exports = {
  id: 'f3e6dac1-83ed-43a5-8abe-ba7334940673',
  start: { map: 'm', node: 'a' },
  maps: { m: { name: 'M', nodes: {
    a: { kind: 'scene', look: '坏 elements', elements: { kind: 'character', ref: 'x' }, links: [{ to: 'b', label: '走' }] },
    b: { kind: 'scene', look: '好 elements', elements: [{ kind: 'item', ref: 'y' }], links: [{ to: 'a', label: '回' }] }
  } } }
};
