/* graph-audit ① encounter 漏 scene 夹具(showcase《零号台站》issue①):
   encounter 有 checks 但没写 scene → 进入无画面(view.scene 空)、点检定后骰子才把空场景顶出来突兀冒灰底 → [可疑][P1]。
   · noScene    —— encounter + checks、【无 scene】→ 报 P1。
   · withScene  —— encounter + checks + scene → 不报(对照,零误报)。
   · emptyChecks—— encounter + checks:[] 空 + 无 scene → 不报(没检定就不 pop,守 length 守卫零误报)。
   全节点经 home 可达、各有无条件 exit(保底)→ 无死链/孤儿/无保底干扰。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.ENC_NO_SCENE_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var chk = { id: 'c', label: '检定', skill: '感知', dc: 8, dice: '2d6', success: { text: '成', to: 'home' }, fail: { text: '败', to: 'home' } };
  return {
    id: '17949615-5ebf-47b6-a3d6-f09f3da87b2d',
    start: { map: 'm', node: 'home' },
    maps: { m: { name: 'M', nodes: {
      home: { kind: 'scene', look: '起点', scene: { region: 'room', mood: 'calm' }, links: [
        { label: '去无场景检定', to: 'noScene' },
        { label: '去有场景检定', to: 'withScene' },
        { label: '去空检定', to: 'emptyChecks' }
      ] },
      noScene: { kind: 'encounter', look: '没写 scene 的检定', checks: [chk], exits: [{ to: 'home', label: '回' }] },
      withScene: { kind: 'encounter', look: '写了 scene 的检定', scene: { region: 'cave', mood: 'tense' }, checks: [chk], exits: [{ to: 'home', label: '回' }] },
      emptyChecks: { kind: 'encounter', look: '没有检定的 encounter(结局型)', checks: [], exits: [{ to: 'home', label: '回' }] }
    } } }
  };
});
