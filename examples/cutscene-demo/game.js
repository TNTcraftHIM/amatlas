/* ════════════════════════════════════════════════════════════════════════
   Amatlas cutscene example 启动胶水 —— scene 主体 + cutscene 插入
   ════════════════════════════════════════════════════════════════════════
   index.html 同时加载 text-adventure 与 cutscene 模块;Amatlas.boot 会按 world.kind 自动注册两者。
   这份 manifest 保持普通文字冒险范本的能力面:状态条、存档、小地图、成就、重开。
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function boot() {
    var WORLD = (typeof CUTSCENE_DEMO_WORLD !== 'undefined')
      ? CUTSCENE_DEMO_WORLD
      : window.CUTSCENE_DEMO_WORLD;

    var engine = window.Amatlas.boot(WORLD, {
      status: function (s) {
        var bits = [ { label: '时刻', value: String((s.clock && s.clock.t) || 0) } ];
        if (s.flags && s.flags.intro_seen) bits.push({ label: '序章', value: '已抵末拍' });
        if (s.flags && s.flags.turning_seen) bits.push({ label: '关键剧情', value: '已触发' });
        if (s.inventory && s.inventory.length) bits.push({ label: '物品', value: s.inventory.join('、') });
        return bits;
      },
      save: true,
      minimap: { mode: 'toggle', layout: 'spatial', fog: 'frontier' },
      reset: true,
      achievements: [
        { id: 'intro', title: '看见回潮', description: '自然播放或逐拍快进到末拍，都会落下同一状态', on: 'action', when: function (s) { return !!(s.flags && s.flags.intro_seen); } },
        { id: 'turning', title: '门后的海', description: '在普通调查后触发关键剧情过场', on: 'action', when: function (s) { return !!(s.flags && s.flags.turning_seen); } },
        { id: 'ending', title: '灯归海上', description: '完成结尾过场', hidden: true, on: 'action', when: function (s) { return !!(s.flags && s.flags.story_done); } }
      ]
    });

    window._engine = engine;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
