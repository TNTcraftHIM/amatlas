/* ════════════════════════════════════════════════════════════════════════
   Amatlas 能力插件 · 物品栏(plugins/inventory.js)
   ════════════════════════════════════════════════════════════════════════
   把"已拾取的持久物品"渲染成一个可见的 🎒 栏(工具栏按钮 + 模态面板)。设计稿 docs/inventory-design.md。

   ── 数据模型(全用已有机制,公共契约零新增)────────────────────────────────
   · 持久物品 = 作者写进 `state.inventory`(字符串 ID 数组;**普通作者状态字段**,同 module-interface §3.1 的 `inventory:[]` 示例、
     同 `stamina`/`understanding`——作者写、作者读,不是 `_` 开头的插件私有命名空间)。建议在 `world.initState.inventory:[]` 预声明;
     随核心 serialize 自动入档,且 graph-audit 死键检测覆盖它(读了从不写 → P1)。游戏在 link.run / action.run / maze.events[i].run
     里 `(S.inventory||(S.inventory=[])).push('gem')` 拾取——**写入路径是游戏,不是插件**。
   · 物品显示(可选)= 作者写 `world.items = { gem:{label,icon?,description?} }` 纯数据。**引擎只读不校验=开放词汇(§11)**:
     爱写啥字段写啥;缺条目 → 面板直接显示裸 ID(可见退化、非静默)。icon=emoji/文字字符串(最简最稳),或 art-spec 矢量图元数组(同场景 element.art 的 DSL)→ 复用 present-svg renderArtSpec 渲小 SVG;无 present-svg/无效 → 退化 •。

   ── 本插件是"只读派生"(同 minimap),不写 state ──────────────────────────────
   · 只读 `api.state.inventory` + `api.world.items` 渲染;靠 `addPresenter` 在每次渲染后刷新按钮计数(物品变化即跟随)。
     **绝不在渲染回调里写 state**(沿 minimap 原则、避"addPresenter 写 state"反模式)。无 DOM/无插槽 → 跳过 UI、读取逻辑仍生效(DOM-free 可测)。
   · 持久 vs 迷宫局部临时:本栏只显 `state.inventory`(随档);迷宫局部临时物(过关钥匙/将来 FPS 武器弹药血量)留迷宫
     模块局部 `g.*`(不入 state、不入档、被抓/离开即重置)→ 写入路径隔离,两套天然不互染(Doom 钥匙 vs Doom 武器)。

   · fail-loud(§6b/§11,只校验形式不碰内容):`world.initState.inventory` 若声明了却**不是数组** → install 抛(写成字符串/对象
     → 面板把它当空、是静默失效)。`state.inventory` 里混入非字符串项 → warn-once + 跳过(治"• [object Object]"乱码行)。
     `world.items` 不校验(开放词汇;malformed → 退化显裸 ID)。

   用法:engine.use(Amatlas.InventoryPlugin.createInventoryPlugin({ slot?:'#plugin-bar' }))
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).InventoryPlugin = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KEY = 'inventory';   // state 字段名(普通作者字段,同 §3.1 示例;硬编码=单一约定、无多余配置 §10)

  // 插件控件默认样式(自带,§11:插件控件 UI ≠ 游戏内容创作 → 引擎兜底默认外观、作者可覆盖换皮;治本反复"工具栏裸")。
  //   :where() 零特异性 → 作者 index.html 任何 .amatlas-* 规则都覆盖;var(--x, fallback) → 作者定义了主题变量就跟随、没定义用中性深色不裸。
  //   共享块(按钮/浮窗,四插件 save/minimap/achievement/inventory 共用)用幂等 id 'amatlas-plugin-shared' 只注一次;物品栏专属另一份。注入到 head 最前 → 作者样式在后、自然覆盖。
  var SHARED_CSS = ':where(.amatlas-plugin-btn){appearance:none;font:13px var(--ui,system-ui,sans-serif);background:var(--panel,#121a26);color:var(--ink,#e8edf4);border:1px solid var(--line,#222e40);border-radius:8px;padding:7px 12px;cursor:pointer;transition:.2s}:where(.amatlas-plugin-btn):hover{border-color:var(--accent,#b89b6a);color:var(--accent,#b89b6a)}:where(.amatlas-plugin-panel){position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:60;width:92%;max-width:440px;max-height:82vh;overflow:auto;background:var(--panel,#121a26);color:var(--ink,#e8edf4);border:1px solid var(--line,#222e40);border-radius:14px;padding:24px 22px;box-shadow:0 24px 70px rgba(0,0,0,.6);font:13px var(--ui,system-ui,sans-serif)}:where(.amatlas-plugin-panel)[hidden]{display:none}:where(.amatlas-plugin-panel)::before{content:"";position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:-1}:where(.amatlas-plugin-close){position:absolute;top:14px;right:16px;background:none;border:none;color:var(--dim,#8a99ad);font-size:18px;line-height:1;cursor:pointer;padding:2px 7px;border-radius:6px}:where(.amatlas-plugin-close):hover{color:var(--accent,#b89b6a)}';
  // 物品栏专属:面板标题 / 条目行(图标 + 名 + 描述) / 空栏提示。
  var INV_CSS = ':where(.amatlas-inv-head){font-weight:600;color:var(--accent,#b89b6a);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--line,#222e40)}:where(.amatlas-inv-item){display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;margin-bottom:8px;background:var(--bg,#0c1119);border:1px solid var(--line,#222e40);border-radius:8px}:where(.amatlas-inv-icon){font-size:20px;flex-shrink:0;width:1.4em;height:1.4em;line-height:1;display:inline-flex;align-items:center;justify-content:center;text-align:center}:where(.amatlas-inv-item) b{color:var(--ink,#e8edf4)}:where(.amatlas-inv-desc){color:var(--dim,#8a99ad);font-size:12px;flex-basis:100%}:where(.amatlas-inv-empty){color:var(--dim,#8a99ad);font-style:italic;padding:8px 2px}:where(.amatlas-inv-art){vertical-align:middle;shape-rendering:geometricPrecision;display:block}';
  function injectStyles(doc) {
    if (!doc || !doc.head || !doc.createElement) return;   // 容 stub DOM:不全则优雅退化、不崩
    function once(id, css) {
      if (doc.getElementById && doc.getElementById(id)) return;
      var s = doc.createElement('style'); if (!s) return; s.id = id; s.textContent = css;
      if (doc.head.insertBefore) doc.head.insertBefore(s, doc.head.firstChild); else if (doc.head.appendChild) doc.head.appendChild(s);
    }
    once('amatlas-plugin-shared', SHARED_CSS);   // 四插件共用(按钮/浮窗),幂等→只注一次
    once('amatlas-plugin-inv', INV_CSS);
  }

  function createInventoryPlugin(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var slot = opts.slot || '#plugin-bar';
    var api = null, btnEl = null, panelEl = null, closeEl = null, warnedBad = false, warnedIcon = false;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function warnIcon(m) { if (!warnedIcon && typeof console !== 'undefined' && console.warn) { warnedIcon = true; console.warn('[amatlas] inventory:' + m); } }
    // 物品图标:emoji/文字字符串(最简、最稳),或 art-spec 矢量图元数组(同场景 element.art 的 DSL)→ 复用 present-svg renderArtSpec 渲成小 SVG(不另造像素渲染器=§10)。
    //   无 present-svg.js / art-spec 无效 → 退化 • + warn-once(可见退化;emoji 始终可用、不依赖 present-svg)。renderArtSpec 内部 assertSafeStr 已防注入。
    function iconHtml(ic) {
      if (Array.isArray(ic)) {   // 矢量 art-spec → 小 SVG(复用 present-svg);本地坐标建议 ±15 内(viewBox -16..16,超出会被裁)
        if (!ic.length) { warnIcon('icon art-spec 为空数组 → 退化 •(给图元如 [{shape:"circle",cx:0,cy:0,r:8,fill:"#cc4"}],或用 emoji 字符串)'); return '•'; }
        var SP = (typeof window !== 'undefined' && window.Amatlas && window.Amatlas.SvgPresenter) || null;
        if (!SP) { warnIcon('icon 用了 art-spec 数组但未加载 present-svg.js → 退化 •(用 emoji 字符串图标,或在 index.html 把 present-svg.js 引在 inventory.js 之前)'); return '•'; }
        if (typeof SP.renderArtSpec !== 'function') { warnIcon('present-svg 已加载但 renderArtSpec 不可用(版本不匹配)→ 退化 •'); return '•'; }
        try { return '<svg class="amatlas-inv-art" viewBox="-16 -16 32 32" width="1.4em" height="1.4em" aria-hidden="true">' + SP.renderArtSpec(ic, 'world.items[].icon') + '</svg>'; }
        catch (e) { warnIcon('图标 art-spec 无效 → 退化 •(' + (e && e.message) + ')'); return '•'; }
      }
      if (ic != null && ic !== '') return esc(String(ic));   // emoji/文字字符串
      return '•';                                            // 缺省小圆点
    }

    // 只读取:state.inventory 是数组才用,否则空(install 已 fail-loud 拦"声明了却非数组";此处防御运行时被改坏)。不创建键(避免给空 state 添 inventory 键污染裸档)。
    function items() { var s = api && api.state, inv = s ? s[KEY] : null; return Array.isArray(inv) ? inv : []; }
    function meta(id) { var w = (api && api.world && api.world.items) || null, m = (w && typeof w === 'object' && !Array.isArray(w)) ? w[id] : null; return (m && typeof m === 'object') ? m : {}; }   // 作者显示字典(可选);开放词汇、不校验(数组形/缺条目 → 退化显裸 ID)
    function count() { return items().length; }

    function refreshBtn() { if (btnEl) btnEl.textContent = '🎒 物品 ' + count(); }
    function renderList() {
      if (!panelEl) return;
      var inv = items(), h = '<div class="amatlas-inv-head">物品 ' + inv.length + '</div>', i;
      if (!inv.length) h += '<div class="amatlas-inv-empty">(空)</div>';
      for (i = 0; i < inv.length; i++) {
        var id = inv[i];
        if (typeof id !== 'string') {   // fail-loud(可见退化):物品 ID 必须是字符串;混入对象/数字 → warn-once + 跳过(治静默"• [object Object]"行)
          if (!warnedBad && typeof console !== 'undefined' && console.warn) { warnedBad = true; console.warn('[amatlas] inventory:state.' + KEY + ' 含非字符串项(物品 ID 必须是字符串,如 "gem"),已跳过:', id); }
          continue;
        }
        var m = meta(id);
        var icon = iconHtml(m.icon);                                                 // emoji 字符串 | art-spec 矢量数组(→小SVG)| 缺省 •
        var name = esc(m.label != null ? m.label : id);                              // 缺 world.items 条目 → 显裸 ID(可见退化)
        var desc = (m.description != null && m.description !== '') ? '<span class="amatlas-inv-desc">' + esc(m.description) + '</span>' : '';
        h += '<div class="amatlas-inv-item"><span class="amatlas-inv-icon">' + icon + '</span> <b>' + name + '</b>' + desc + '</div>';
      }
      panelEl.innerHTML = h;
      if (closeEl) panelEl.appendChild(closeEl);   // innerHTML 清了子节点 → 复挂持久 ✕(onclick 不丢)
    }
    function mountUI() {
      if (!doc) return;
      var bar = doc.querySelector(slot); if (!bar) return;   // 无插槽 → 跳过控件(读取逻辑仍生效)
      injectStyles(doc);
      btnEl = doc.createElement('button'); btnEl.className = 'amatlas-plugin-btn amatlas-inv-btn';
      panelEl = doc.createElement('div'); panelEl.className = 'amatlas-plugin-panel amatlas-inv-panel'; panelEl.hidden = true;
      closeEl = doc.createElement('button'); closeEl.className = 'amatlas-plugin-close'; closeEl.textContent = '✕'; closeEl.setAttribute('title', '关闭'); closeEl.onclick = function () { panelEl.hidden = true; };
      btnEl.onclick = function () { panelEl.hidden = !panelEl.hidden; if (!panelEl.hidden) renderList(); };
      panelEl.appendChild(closeEl);   // 挂载期即把 ✕ 放进面板(对齐 minimap;面板被外部直接 hidden=false 显示时也有 ✕,renderList 后复挂)
      bar.appendChild(btnEl); bar.appendChild(panelEl);
      refreshBtn();
    }

    return {
      id: 'inventory',
      install: function (a) {
        api = a;
        // fail-loud(只校验形式):initState.inventory 声明了却不是数组 = 违约(面板会把它当空 = 静默失效)。boot 抛 → 装配探针 P0 抓。
        var init = a.world && a.world.initState;
        if (init && init[KEY] != null && !Array.isArray(init[KEY])) throw new Error('[amatlas] inventory:world.initState.' + KEY + ' 必须是数组(物品 ID 字符串数组),收到 ' + (typeof init[KEY]) + ':写成别的会被当空栏(静默失效)。改成 ' + KEY + ': []。');
        mountUI();   // 必须在 api=a 之后(refreshBtn 读 api.state)
        // 物品随游戏写 state 变化 → 每次渲染后刷新按钮计数(render 广播在 enter/action/apply/load/reset 后必到);只读、不写 state。
        if (typeof a.addPresenter === 'function') a.addPresenter(function () { refreshBtn(); if (panelEl && !panelEl.hidden) renderList(); });
      },
      // 只读 helper(供测试/程序化查询;游戏门控用 requires:(S)=>S.inventory.indexOf('x')>=0 直接读 state)。
      //   插件**不去重**:state.inventory 重复 id = 同类堆叠(Doom 弹药式,显真实 state、调试友好);要"只拾一次"用 once:true 或 run 里先 indexOf 检查。要计数用 list().filter(x=>x===id).length。
      has: function (id) { return items().indexOf(id) >= 0; },
      list: function () { return items().slice(); }
    };
  }

  return { createInventoryPlugin: createInventoryPlugin };
});
