/* ════════════════════════════════════════════════════════════════════════
   Amatlas 文字冒险 demo 启动胶水 —— S12:Amatlas.boot 声明式默认装配(文字冒险范例)。
   ════════════════════════════════════════════════════════════════════════
   作者只声明一份 manifest,boot 据此:① 按 world 用到的内置 kind 自动拉玩法模块
   (本作 kind:'scene' → 自动拉文字冒险模块;自定义 kind 走 manifest.modules)② 挂呈现器/插件(三态:省略=默认 / 对象=配置 / false=关)
   ③ 复用 start() 的 kind 预检。删 manifest 任一项 = 关掉那能力。

   这是 new-game「文字冒险分支」照抄的范例(跑团见 tabletop-demo、自定义模块见 minimal-demo)。
   index.html 仍引各模块/呈现器/插件 <script>(boot 从 window.Amatlas 读它们)+ 一行 preset/boot.js。
   escape hatch:boot 返回 engine,可继续 engine.use(...)/抓控件;底层 createEngine+use 原样可用
   (逐插件手写对照见 horror-demo)。
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function boot() {
    var WORLD = (typeof TEXT_ADVENTURE_DEMO_WORLD !== 'undefined') ? TEXT_ADVENTURE_DEMO_WORLD : window.TEXT_ADVENTURE_DEMO_WORLD;

    var engine = window.Amatlas.boot(WORLD, {
      status: function (s) {                                          // 存档 namespace 由 WORLD.id 稳定派生；正常游戏不重复写 manifest.saveKey
                                 // 文字冒险状态条(时刻 / 理解 / 物品)
        var bits = [{ label: '时刻', value: String((s.clock && s.clock.t) || 0) }];
        if (s.understanding) bits.push({ label: '理解', value: String(s.understanding) });
        if (s.inventory && s.inventory.length) bits.push({ label: '物品', value: s.inventory.join('、') });
        return bits;
      },
      // present 省略 = 文字+SVG+音频默认挂(index.html 引了对应 <script> 才挂,缺则宽容退化)
      save: true,                                            // 💾 存档(多槽,默认挂 #plugin-bar)
      minimap: { mode: 'toggle', layout: 'spatial' },        // 🗺️ 小地图(玩家视图:node.map 摆位 + 探索雾)
      reset: true,                                           // ↻ 重新开始(挂 #plugin-bar;同 save/minimap 形态。治模板那个 fixed 飘 reset)
      achievements: [                                        // 🏆 成就(简写;等价 achievement:{achievements:[...]})
        // description = 面板里成就名后的小字说明(给玩家'怎么解锁/解锁了什么'的语境;只有 title 会显得干瘪);hidden:true = 未解锁时显 ❓???(防剧透,解锁才揭示)
        { id: 'explorer', title: '探索者', description: '走过两处不同的地方', on: 'enter',  when: function (s) { return Object.keys(s.seen || {}).length >= 2; } },
        { id: 'reader',   title: '读懂了雷纳的笔记', description: '在海岸打开漂流箱并读完里面的笔记', hidden: true, on: 'action', when: function (s) { return !!(s.flags && s.flags.readNotes); } }
      ]
    });

    window._engine = engine;                                 // 调试 / 测试钩子
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
