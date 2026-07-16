/* graph-audit 无保底出口(soft-lock)P0/P1 分档夹具(design-principles §6a/§7.1):
   确定性 soft-lock 默认 [确认][P0] 硬拦;仅当节点某出口标了 lockHint(显式有意单程/未完成)才降 [可疑][P1]。
   · safe(起点)—— 有一条无条件非 once 出口 → 有保底,**不报**。
   · locked —— 出口全带 requires、**无 lockHint** → 无保底出口 [确认][P0]。
   · intended —— 出口全带 requires、**标了 lockHint**(有意单程)→ 降 [可疑][P1]。
   · onceonly —— 唯一出口是 once(一次性,无 lockHint)→ 消耗后重访卡死 → [确认][P0](once 盲点回归)。
   全节点经 safe 可达、互有出边 → 无死链/孤儿/死胡同干扰。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.NO_STANDBY_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '62ac5022-f910-4c7d-b71d-06c44b557014',
    start: { map: 'm', node: 'safe' },
    maps: { m: { name: 'M', nodes: {
      safe: { kind: 'scene', look: '安全屋', links: [
        { label: '去locked', to: 'locked' },          // 无条件 → safe 自身有保底
        { label: '去intended', to: 'intended' },
        { label: '去onceonly', to: 'onceonly' }
      ] },
      locked: { kind: 'scene', look: '全条件门', links: [
        { label: '门(需钥匙)', to: 'safe', requires: function () { return false; } }   // 全条件、无 lockHint → P0
      ] },
      intended: { kind: 'scene', look: '有意单程', links: [
        { label: '单程门', to: 'safe', requires: function () { return false; }, lockHint: '有意单程,暂未完成' }  // 标 lockHint → P1
      ] },
      onceonly: { kind: 'scene', look: '一次性出口', links: [
        { label: '唯一出口(一次性)', to: 'safe', once: true }   // 唯一出口是 once、无 lockHint → P0(once 盲点)
      ] }
    } } }
  };
});
