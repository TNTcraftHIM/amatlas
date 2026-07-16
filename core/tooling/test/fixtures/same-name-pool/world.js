/* graph-audit「同名两池」夹具(showcase 实测两次:《深渊》stamina /《落霞一剑》内力;lessons 66 + journal 阶段63/101)。
   场景 run 写**顶层** S.resources['内力'](=BUG:与 game.js sheet.resources.内力 同名两池、永不同步)→ 应报 P1「同名两池 '内力'」;
   另一处写 S.sheet.resources['体力'](=正确写法,负向 lookbehind 排掉)→ **不应**报 体力。验:报 内力、不报 体力。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.SAME_NAME_POOL_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '9c7d24b7-1eae-4757-af0f-cd1514a09977',
    start: { map: 'm', node: 'home' },
    maps: {
      m: {
        name: '测试镇',
        nodes: {
          home: {
            kind: 'scene', name: '家', look: '在家歇着。',
            links: [
              // BUG:回血写顶层 S.resources 池,检定扣的却是 sheet.resources → 永不同步
              { label: '打坐回内力', run: function (S) { S.resources = S.resources || {}; S.resources['内力'] = Math.min(10, (S.resources['内力'] || 0) + 2); }, to: 'home' },
              // 正确:写角色卡池 S.sheet.resources → 检定看得到(不应被误报)
              { label: '歇口气回体力', run: function (S) { S.sheet.resources['体力'] = Math.min(5, (S.sheet.resources['体力'] || 0) + 1); }, to: 'home' },
              { label: '去比武', to: 'fight' }
            ]
          },
          fight: {
            kind: 'encounter', name: '比武', look: '对手在前。',
            checks: [{ id: 'duel', label: '出手', skill: '力', dc: 8, dice: '2d6', cost: { res: '内力', amount: 2 }, success: { text: '赢了。', to: 'home' }, fail: { text: '败了。', to: 'home' } }],
            exits: [{ to: 'home', label: '退走' }]
          }
        }
      }
    }
  };
});
