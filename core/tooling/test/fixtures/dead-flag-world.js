/* graph-audit 死 flag 检测夹具(无保底出口分档移至 no-standby-world.js,本夹具专注死 flag P1):
   · neverSet —— 被 requires 读、但全程从不写 → 死 flag(P1)。
   · opened   —— run 写 + requires 读 → 不应误报死 flag。
   每节点都有无条件保底出口 → 无「无保底出口」干扰;a↔b 连通,无死链/孤儿/死胡同。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.DEAD_FLAG_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '68aca65d-9d17-4909-a4ff-992d6a2ed69f',
    start: { map: 'm', node: 'a' },
    maps: { m: { name: 'M', nodes: {
      a: { kind: 'scene', look: '起点', links: [
        { label: '开门', run: function (S) { S.flags.opened = true; } },
        { label: '走(保底)', to: 'b' },                                                    // 无条件保底出口 → 无「无保底出口」
        { label: '走(需开门)', to: 'b', requires: function (S) { return !!S.flags.opened; } },   // 读 opened(已写,不应误报死 flag)
        { label: '锁死的门', to: 'b', requires: function (S) { return !!S.flags.neverSet; }, showWhenLocked: true, lockHint: '永远锁' }  // 读 neverSet(从不写 → 死 flag)
        // 作者文档注释(模拟 Sonnet r2 world.js:17「其余全用 S.flags.docCommentOnly 模式」):剥注释后不应被当读访问、不误报死 flag
      ] },
      b: { kind: 'scene', look: '终点', links: [
        { label: '回', to: 'a' }                                                            // 无条件保底
      ] }
    } } }
  };
});
