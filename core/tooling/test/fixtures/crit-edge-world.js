/* graph-audit v16 夹具:暴击/大失败叙事分支 crit.to / fumble.to 也是真边(闸随契约进化,镜像 v12 的 success.to/fail.to)。
   vault 只经 crit.to 可达、pit 只经 fumble.to 可达 → 正确计边则 4/4 可达;漏计则误报 vault/pit 为孤儿。
   全节点经 gate 可达、互有出边 → 无死链/孤儿/死胡同干扰,验的是"crit/fumble.to 被算作边"。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.CRIT_EDGE_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: 'aebd81f0-551f-43af-a51e-974f5d386074',
    start: { map: 'm', node: 'gate' },
    maps: { m: { name: 'M', nodes: {
      gate: { kind: 'encounter', look: '门', checks: [
        { id: 'force', label: '撬', skill: '力', dc: 8, dice: '2d6',
          success: { text: '开', to: 'hall' },
          crit: { text: '完美', to: 'vault' },      // vault 仅经暴击可达
          partial: { text: '勉强', to: 'shrine' },  // shrine 仅经部分成功可达(v17)
          fail: { text: '砸', to: 'hall' },
          fumble: { text: '崩断', to: 'pit' } } ] },  // pit 仅经大失败可达
      hall: { kind: 'scene', look: '大厅', links: [{ label: '回', to: 'gate' }] },
      vault: { kind: 'scene', look: '密室(仅暴击可达)', links: [{ label: '出', to: 'hall' }] },
      shrine: { kind: 'scene', look: '小祠(仅部分成功可达)', links: [{ label: '离', to: 'hall' }] },
      pit: { kind: 'scene', look: '陷坑(仅大失败可达)', links: [{ label: '爬出', to: 'hall' }] }
    } } }
  };
});
