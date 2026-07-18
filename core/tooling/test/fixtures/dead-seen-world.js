/* 夹具:死 seen 键(死读家族第三员)——showcase《谐振》成就冒号键的最小复现。
   合法 seen 键是 'map/node'(斜杠);写成冒号 'map:node' 或拼错节点名 = 恒 undefined = 静默失效。
   gate 应:命中 'm:b'(冒号,不是真实键)+ 'm/ghost'(拼错节点名),放行 'm/b'(合法斜杠键)。 */
module.exports = {
  id: 'cceb5591-723d-4dac-bb49-4afac756b86b',
  start: { map: 'm', node: 'a' },
  maps: { m: { name: 'M', nodes: {
    a: { kind: 'scene', look: '起点', links: [
      { to: 'b', label: '前进' },
      // 合法:斜杠键、真实节点 → 不该被报
      { to: 'b', label: '只有到过 b 才显', requires: function (S) { return !!(S.seen && S.seen['m/b']); }, showWhenLocked: true, lockHint: '需先到 b' }
    ] },
    b: { kind: 'scene', look: '终点', links: [
      // bug1:冒号分隔符 → 永远查不到 → 该出口静默永不解锁
      { to: 'a', label: '回起点(坏门控:冒号键)', requires: function (S) { return !!(S.seen && S.seen['m:b']); }, showWhenLocked: true, lockHint: '坏' },
      // bug2:拼错节点名(ghost 不存在)→ 同样恒 undefined
      { to: 'a', label: '回起点(坏门控:拼错节点)', requires: function (S) { return !!(S.seen && S.seen['m/ghost']); }, showWhenLocked: true, lockHint: '坏' }
    ] }
  } } }
};
