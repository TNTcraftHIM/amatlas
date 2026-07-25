/* ════════════════════════════════════════════════════════════════════════
   Amatlas 最小模块范例 · 运行时 (minimal/runtime/minimal.js) — S10.5
   ════════════════════════════════════════════════════════════════════════
   一个**完整、能跑、最小**的玩法模块:计数器游戏(一个 kind、一个动作、render 显计数)。
   它是"创建新模块"的**起点模板**——按 text-adventure-game skill 的 references/plugin-development.md Level 1:
   **复制本目录 + examples/minimal-demo → 改名 → 逐步替换 render/actions**,即可做出自己的玩法类型。

   实现 ../../core/module-interface.md 契约的最小子集:
   · 一个 nodeKind('counter');· render(state,node)→View(显示计数);· actions(state,node)→[+N 动作]。
   · **DOM-free、零依赖**,经统一入口 engine.use(createMinimalModule()) 注册,**核心零改**。
   · 移动"免费":节点若写了 exits,核心自动生成移动动作(本范例单节点,故无 exits)。

   对照(学习用,复制更像的那个见 plugin-development.md):
   · tabletop 模块 = 本范例 + 角色卡/检定/scene·audio 意图;
   · text-adventure 模块 = 本范例 + look 三态/事件/once/locked 灰显。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).Minimal = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createMinimalModule(opts) {
    opts = opts || {};
    var step = opts.step || 1;        // 每次点击 +step(默认 +1)
    var goal = opts.goal || 10;       // 计数达到 goal 即"达成"

    function count(state) { return state.count || 0; }   // 懒读:未初始化按 0(随 serialize 入档)

    var mod = {
      id: 'minimal',
      nodeKinds: ['counter'],         // 本模块负责 node.kind === 'counter' 的节点

      render: function (state, node) {
        var c = count(state), done = c >= goal;
        // View 通用字段(present-dom 消费):title/body/status。mapname 可选,计数器用不到故省略——
        // present-dom 对缺失字段优雅退化(#mapname 为空、:empty 隐藏)。
        return {
          title: node.title || '计数器',
          body: [
            { type: 'prose', text: node.look || '点击下面的按钮增加计数。' },
            { type: 'prose', text: '当前计数:' + c + ' / ' + goal + (done ? '  —— 达成!' : '') }
          ],
          status: [{ label: '计数', value: String(c) }]
        };
      },

      actions: function (state, node) {
        if (count(state) >= goal) return [];                 // 达成后无动作(present-dom 显示空选项区)
        return [{
          id: 'inc', label: '+' + step, kind: 'act',
          run: function (st) { st.count = (st.count || 0) + step; }   // 唯一状态转移:计数 +step
        }];
      }
    };
    // S11-b-ex:模块工厂返回 use-able 插件 → `engine.use(createMinimalModule(opts))` 唯一形态;
    //   registerModule 降为 install 调用的底层原语。已删去旧 minimalPlugin 包装。
    mod.install = function (api) { api.registerModule(mod); };
    return mod;
  }

  return { createMinimalModule: createMinimalModule };
});
