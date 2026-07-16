/* graph-audit「跑团检定格式错」夹具(showcase 实测:弱模型把 encounter 写成**自创格式**
   check/on_success/on_failure/modifiers,构建只报"不可达"→ 误判成"引擎不支持动态 links"→ 砍掉跑团)。
   trial 用错格式 → 应被点名 P1;safe 用对格式(checks/success/fail + exits)→ 不误报。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.BAD_ENCOUNTER_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '902fe2a9-97f8-418f-9473-3340010e6cd2',
    start: { map: 'm', node: 'a' },
    maps: { m: { name: 'M', nodes: {
      a: { kind: 'scene', look: '起点', links: [ { label: '去检定', to: 'trial' } ] },
      // ✗ 自创格式:check/on_success/on_failure/modifiers(模型干过的)——引擎不认 → 应报 P1
      trial: { kind: 'encounter', look: '检定',
        check: { skill: 'x', dc: 12 }, modifiers: function () { return 0; },
        on_success: { text: '成', run: function () {} }, on_failure: { text: '败' },
        exits: [ { label: '前进', to: 'safe' } ] },
      // ✓ 对格式:checks[{skill,dc,dice,success,fail}] + exits → 不报
      safe: { kind: 'encounter', look: '正确检定',
        checks: [ { id: 'c', label: '检定', skill: 'x', dc: 8, dice: '2d6', success: { text: '成' }, fail: { text: '败' } } ],
        exits: [ { label: '回', to: 'a' } ] }
    } } }
  };
});
