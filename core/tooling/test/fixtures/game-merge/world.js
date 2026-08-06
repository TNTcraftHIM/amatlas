/* graph-audit「合并扫 game.js」夹具(showcase round4 盲区:deadFlag 旧版只扫 world.js)。
   本 world.js 写 realFlag(直接 run 赋值)+ savedDef(懒初始化 idiom `(S.flags||(S.flags={})).X=`);配套 game.js 的
   achievement.when 读 flags.ghostAch(从不写→报)+ flags.realFlag(写了→不报)+ 防御读 (S.flags||{}).savedDef(写了→不报)
   + (S.flags||{}).ghostDef(从不写→报)。后两个=haiku showcase 实测盲区:防御性读/写 idiom 原正则全漏 → 归一后才对。 */
(function (g, f) {
  if (typeof module !== 'undefined' && module.exports) module.exports = f();
  else g.GAME_MERGE_WORLD = f();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  return {
    id: '26cb0d8a-12e5-4632-92f8-d33eddec525f',
    start: { map: 'm', node: 'a' },
    maps: { m: { name: 'M', nodes: {
      a: { kind: 'scene', look: '起点', links: [
        { label: '走(保底)', to: 'b' },                                          // 无条件保底
        { label: '做事', run: function (S) { S.flags.realFlag = true; } },        // 写 realFlag(直接 S.flags.X=)
        { label: '防御写', run: function (S) { (S.flags || (S.flags = {})).savedDef = true; } }  // 写 savedDef(懒初始化 idiom;归一后应识别为已写、不报)
      ] },
      b: { kind: 'scene', look: '终点', links: [ { label: '回', to: 'a' } ] }
    } } }
  };
});
