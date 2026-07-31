/* ════════════════════════════════════════════════════════════════════════
   Amatlas 跑团 demo 启动胶水 —— S12:Amatlas.boot 声明式默认装配(收敛机械接缝)。
   ════════════════════════════════════════════════════════════════════════
   作者只声明一份 manifest,boot 据此:① 按 world 用到的 kind【自动拉】玩法模块
   (本作全是 kind:'encounter' → 自动拉跑团模块 Tabletop,无需手写 use)② 挂呈现器/插件
   (三态:省略=默认 / 对象=配置 / false=关)③ 复用 start() 的 kind 预检。删 manifest 任一项 = 关掉那能力。

   对照:examples/horror-demo 仍逐插件手写(createEngine + engine.use)= 手写形态对照(text-adventure-demo 同走 Amatlas.boot 声明式装配)。
   escape hatch:boot 返回 engine,可继续 engine.use(...)/抓控件(下方 reset);底层
   Amatlas.createEngine + engine.use 原样可用(boot 是 opt-in 便利层、非强制)。
   scene/audio 由跑团模块 render 原生产出(节点意图 + 检定骰子/音效),呈现器各取所需。
   ════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function boot() {
    var WORLD = (typeof TABLETOP_WORLD !== 'undefined') ? TABLETOP_WORLD : window.TABLETOP_WORLD;

    var engine = window.Amatlas.boot(WORLD, {
      sheet: { name: '醒转者', skills: { 体魄: 1, 感知: 2, 交涉: 1 }, resources: { 状态: 3 } },  // 跑团角色卡(透传 Tabletop)
      // present 省略 = 文字+SVG+音频默认挂(index.html 引了对应 <script> 才挂,缺则宽容退化)
      save: true,                                          // 💾 存档(多槽,默认挂 #plugin-bar)
      minimap: { mode: 'toggle', layout: 'spatial' },      // 🗺️ 小地图(玩家视图:node.map 摆位 + 探索雾)
      reset: true,                                         // ↻ 重新开始(同 save/minimap 形态;治"fixed 飘")
      achievements: [                                      // 🏆 成就(简写;等价 achievement:{achievements:[...]})
        { id: 'breach',   title: '破闸而入', description: '通过体魄检定撬开锈死的闸门', on: 'action', when: function (s) { return !!(s.flags && s.flags.gateOpen); } },
        { id: 'survivor', title: '走遍灯塔', description: '踏足灯塔的全部三处区域', on: 'enter',  when: function (s) { return Object.keys(s.seen || {}).length >= 3; } }
      ]
    });

    window._engine = engine;                               // 调试 / 测试钩子
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
