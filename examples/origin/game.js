(function () {
  'use strict';

  function boot() {
    var WORLD = (typeof ORIGIN_WORLD !== 'undefined') ? ORIGIN_WORLD : window.ORIGIN_WORLD;

    var engine = window.Amatlas.boot(WORLD, {
      modules: [window.Amatlas.Maze3d.createMaze3dModule({ stageId: 'maze3d-stage' })],
      sheet: {
        name: '承天者',
        skills: { '承受': 1 },
        resources: { '意志': 2 }
      },
      status: function (S) {
        var bits = [
          { label: '天穹', value: S.flags && S.flags.worldLit ? '万界初明' : '尚未完成' },
          { label: '领悟', value: String(S.insight || 0) }
        ];
        if (S.worldShape) bits.push({ label: '首条规律', value: S.worldShape });
        return bits;
      },
      save: true,
      minimap: { mode: 'toggle', layout: 'spatial', fog: 'frontier' },
      reset: { confirm: true },
      achievements: [
        {
          id: 'sentence',
          title: '承天之刑',
          description: '自然播放或逐拍快进到末拍，判罚结果都会写入世界状态',
          on: 'action',
          when: function (S) { return !!(S.flags && S.flags.condemned); }
        },
        {
          id: 'weight',
          title: '世界的重量',
          description: '完成承托天穹的检定，无论成败都继续前行',
          on: 'action',
          when: function (S) { return !!(S.flags && (S.flags.heldSteady || S.flags.kneeDown)); }
        },
        {
          id: 'star-corridor',
          title: '穿过未明回廊',
          description: '在尚未点亮的世界里唤醒三枚星痕，找到星图中心',
          hidden: true,
          on: 'action',
          when: function (S) { return !!S.corridorLit; }
        },
        {
          id: 'first-world',
          title: '点亮第一个世界',
          description: '把第一组数据写入暗星',
          hidden: true,
          on: 'action',
          when: function (S) { return !!(S.flags && S.flags.worldLit); }
        }
      ]
    });

    window._engine = engine;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
