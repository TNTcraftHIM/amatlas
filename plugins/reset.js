/* ════════════════════════════════════════════════════════════════════════
   Amatlas 能力插件 · 重开游戏(plugins/reset.js)
   ════════════════════════════════════════════════════════════════════════
   "重新开始"按钮的标准插件化:挂进 #plugin-bar,与 save/minimap/achievement/inventory 并排同款样式,
   不再用模板里那个 `<button id="reset">` `position:fixed` 浮窗(端用户长期反馈"乱飘")。

   ── 行为(同模板原 onclick 逻辑,挪到插件)──────────────────────────────────
   · 工具栏按钮 textContent='↻ 重新开始',点击 → `confirm()` 二次确认 → `engine.reset()`
   · confirm 文案默认沿模板:'重新开始?当前进度将清除(手动存档槽保留)。'
   · confirm 默认开:reset 一键即删自动续档并立刻被新开局覆盖,误点=无可挽回(同 save 删档惯例)
   · escape hatch:作者仍可继续用 `<button id="reset">` + 手写 onclick(向后兼容,但建议改用本插件)

   ── 配置(全可省)──
   · `slot`:挂载选择器,默认 '#plugin-bar'(无此挂载点 → 跳过 UI,reset API 仍可用)
   · `confirm`:二次确认 true(默认)/false/自定义文案 string
   · `label`:按钮文字,默认 '↻ 重新开始'

   用法:engine.use(Amatlas.ResetPlugin.createResetPlugin())  // boot manifest `reset:true` 自动挂
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).ResetPlugin = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 五插件共享:按钮/浮窗的中性默认样式(:where 零特异性 → 作者 .amatlas-* 覆盖换皮)。幂等 id 同 save/inventory/etc。
  var SHARED_CSS = ':where(.amatlas-plugin-btn){appearance:none;font:13px var(--ui,system-ui,sans-serif);background:var(--panel,#121a26);color:var(--ink,#e8edf4);border:1px solid var(--line,#222e40);border-radius:8px;padding:7px 12px;cursor:pointer;transition:.2s}:where(.amatlas-plugin-btn):hover{border-color:var(--accent,#b89b6a);color:var(--accent,#b89b6a)}';

  function injectStyles(doc) {
    if (!doc || !doc.head || !doc.createElement) return;
    if (doc.getElementById && doc.getElementById('amatlas-plugin-shared')) return;
    var s = doc.createElement('style'); if (!s) return;
    s.id = 'amatlas-plugin-shared'; s.textContent = SHARED_CSS;
    if (doc.head.insertBefore) doc.head.insertBefore(s, doc.head.firstChild); else doc.head.appendChild(s);
  }

  function createResetPlugin(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var slot = opts.slot || '#plugin-bar';
    var label = opts.label != null ? String(opts.label) : '重新开始';
    var confirmCfg = opts.confirm == null ? true : opts.confirm;   // true=默认文案 / false=不弹 / string=自定义文案
    var api = null;

    function doReset() {
      if (!api || typeof api.reset !== 'function') {   // api.reset 由核心提供(同 engine.reset);fail-loud
        if (typeof console !== 'undefined' && console.warn) console.warn('[amatlas] reset:api.reset 不可用,无法重开(引擎核心未暴露 reset?)');
        return;
      }
      var msg = (typeof confirmCfg === 'string' && confirmCfg) ? confirmCfg
        : (confirmCfg ? '重新开始?当前进度将清除(手动存档槽保留)。' : null);
      var conf = (typeof window !== 'undefined' && window.confirm) ? window.confirm : null;
      if (msg && conf && !conf(msg)) return;   // 用户取消
      api.reset();
    }

    function mountUI() {
      if (!doc) return;
      var bar = doc.querySelector(slot); if (!bar) return;   // 无插槽 → 跳过 UI(reset API 仍生效)
      injectStyles(doc);
      var btn = doc.createElement('button'); btn.className = 'amatlas-plugin-btn amatlas-reset-btn';
      btn.textContent = label;
      btn.setAttribute('title', '重新开始游戏');
      btn.onclick = doReset;
      bar.appendChild(btn);
    }

    return {
      id: 'reset',
      install: function (a) { api = a; mountUI(); },
      reset: doReset   // 暴露给程序化触发(测试 / 自定义快捷键)
    };
  }

  return { createResetPlugin: createResetPlugin };
});
