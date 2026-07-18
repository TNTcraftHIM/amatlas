/* ════════════════════════════════════════════════════════════════════════
   Amatlas 可插拔表现层 · HTML(DOM)呈现器 (presenters/present-dom.js)
   ════════════════════════════════════════════════════════════════════════
   把模块产出的"呈现无关 View"(mapname/title/body/status,契约 §4.2)画成 DOM,
   并把动作接到点击 → engine.apply。**类型无关**:任何模块的通用 View 都可由它呈现
   (文字冒险/跑团/最小 demo 共用)。S11-b-ex 起与 present-svg/present-audio 同住
   engine/presenters/(原在 modules/text-adventure/runtime/,因 §7 铁律已按现实解除而归位)。
   零依赖、可在无 DOM 环境 no-op。契约见 ../core/module-interface.md 四。

   用法(经统一入口 use——一步同时接渲染 + 接点击):
     var engine = Amatlas.createEngine(WORLD, { storage: storage });
     engine.use(Amatlas.DomPresenter.createDomPresenter({ document: document }));
     engine.start();

   产出 DOM 的 class 约定(给游戏 CSS 的挂载点,见 text-adventure skill 的 references/game-design-guide.md):
     #look > div.line.line-<type>  —— 每行正文;type ∈ prose/event/check/outcome…(event 另保留旧 .event class)
     #choices > button.choice[.move][.locked]  + span.lock-hint
     #status > span.status-item  ( > b 为值 )
   class 纯增量、向后兼容:不靠这些 class 的 CSS 不受影响;新游戏可用它们做精致样式。
   每次 present() 还在 <html>(documentElement)上写 data-node / data-map / data-node-kind / data-mood / data-region(当前节点/图/节点类型/气氛/区域),
   供作者按节点或气氛写 CSS:html[data-node="ending_x"] #place{…} / html[data-node-kind="cutscene"] #app{…} / html[data-mood="tense"]{…}(只暴露状态事实、不规定样式)。
   这 5 个 data-* 名由引擎占用、每帧覆盖——作者自定义 <html> 上的 data-* 时避开 node/map/node-kind/mood/region。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).DomPresenter = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function createDomPresenter(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var sel = opts.selectors || {};
    var S = {
      mapname: sel.mapname || '#mapname',
      place:   sel.place   || '#place',
      look:    sel.look    || '#look',
      choices: sel.choices || '#choices',
      status:  sel.status  || '#status'
    };
    var engine = null;
    function $(s) { return doc ? doc.querySelector(s) : null; }
    function setText(s, t) { var el = $(s); if (el) el.textContent = (t == null ? '' : String(t)); }

    function renderLook(view) {
      var box = $(S.look); if (!box) return;
      box.textContent = '';
      (view.body || []).forEach(function (b) {
        var div = doc.createElement('div');
        var t = b.type || 'prose';
        // 语义 class:每行都带 line + line-<type>(prose/event/check/outcome…)给 CSS 精细挂载点;
        // 仍保留旧的单 'event' class → 旧 demo 的 `.event` 选择器不受影响(向后兼容、纯增量)。
        div.className = 'line line-' + t + (t === 'event' ? ' event' : '');
        div.textContent = b.text || '';   // textContent 自动转义;换行由 CSS white-space:pre-wrap 保留
        box.appendChild(div);
      });
    }

    function renderChoices(actions) {
      var box = $(S.choices); if (!box) return;
      box.textContent = '';
      (actions || []).forEach(function (a) {
        var btn = doc.createElement('button');
        btn.className = 'choice' + (a.kind === 'move' ? ' move' : '') + (a.locked ? ' locked' : '');
        btn.textContent = a.label || '';
        if (a.adv) {                                           // 检定优势/劣势:点检定【前】就在按钮上显眼标出(端用户诉求;此前只在掷骰后的结果行尾标 (优势))。
          var badge = doc.createElement('span');               // 默认样式由 ensureStyle 注入(绿=优势/红=劣势),作者可用 .choice-adv 覆盖换皮。
          badge.className = 'choice-adv choice-adv-' + a.adv;   // 'adv' | 'dis'
          badge.textContent = a.adv === 'adv' ? '优势' : '劣势';
          btn.appendChild(badge);
        }
        if (a.locked) {
          btn.disabled = true;   // 原生禁用语义:浏览器自带灰显 + 不可点,免疫作者 CSS class 怎么写(选项裸 / class 写错也不再"看着能点、点了没反应")。契约钩子仍是 .choice.locked(向后兼容:自定义 .choice.locked 灰显仍生效,亦可用 :disabled 覆盖);这是功能性增量,不锚定外观。
          var hint = doc.createElement('span');
          hint.className = 'lock-hint';
          hint.textContent = '（' + (a.lockHint || '条件未满足') + '）';
          btn.appendChild(hint);
        } else {
          btn.onclick = function () { if (engine) engine.apply(a); };  // 动作=状态转移,交核心
        }
        box.appendChild(btn);
      });
    }

    function renderStatus(view) {
      var box = $(S.status); if (!box) return;
      box.textContent = '';
      (view.status || []).forEach(function (bit) {
        var span = doc.createElement('span');
        span.className = 'status-item';   // 语义挂载点(增量;旧 #status>span 选择器仍命中)
        if (bit.label) span.appendChild(doc.createTextNode(bit.label + ':'));
        var b = doc.createElement('b');
        b.textContent = (bit.value == null ? '' : String(bit.value));
        span.appendChild(b);
        box.appendChild(span);
      });
    }

    // 检定优劣势徽标的功能性默认样式(一次性注入;同插件控件先例=引擎给"功能性默认外观"、:where() 零特异度作者可覆盖)。
    //   绿=优势 / 红=劣势 的小药丸,紧跟检定按钮文字 → 玩家点检定前一眼可见。typeof 守卫容 stub DOM(jsdom/探针无 head 则跳过)。
    var styleInjected = false;
    function ensureStyle() {
      if (styleInjected || !doc || typeof doc.createElement !== 'function' || !doc.head || typeof doc.head.appendChild !== 'function') return;
      styleInjected = true;
      var st = doc.createElement('style');
      st.textContent = ':where(.choice-adv){display:inline-block;margin-left:.5em;padding:0 .45em;border-radius:.5em;'
        + 'font-size:.78em;font-weight:700;vertical-align:middle;letter-spacing:.04em}'
        + ':where(.choice-adv-adv){background:rgba(60,160,90,.22);color:#3ca05a;border:1px solid rgba(60,160,90,.5)}'
        + ':where(.choice-adv-dis){background:rgba(190,60,60,.20);color:#cc5a5a;border:1px solid rgba(190,60,60,.5)}';
      try { doc.head.appendChild(st); } catch (e) { /* 注入是增强,环境差异不抛 */ }
    }

    var lastPosKey = null;   // 滚动跟踪:同节点纯动作重渲染不滚(保留阅读位置),换节点才滚回正文顶
    function present(v) {
      if (!doc || !v) return;
      ensureStyle();
      var view = v.view || {};
      setText(S.mapname, view.mapname || '');
      setText(S.place, view.title || '');
      renderLook(view);
      renderChoices(v.actions);
      renderStatus(view);
      // CSS 钩子:把「当前节点/节点类型/气氛/区域」写到 <html> dataset——
      //   作者可写 html[data-node="ending_x"] #place{…} / html[data-node-kind="cutscene"] #app{…} / html[data-mood="tense"]{…} 做每节点/每类型/每气氛样式。
      //   只暴露「你在哪+当前节点是什么 kind+是什么气氛」这一形式事实,不规定任何样式;与 present-svg 在 <svg> 挂 data-region/mood 对称,但在 <html> 根 → 外层 CSS 可选中整页任意元素。
      //   Guard:doc.documentElement 有 dataset 才写(测试 stub 无 → 跳过不抛);每次 present() 无条件覆盖,同节点纯动作重渲染也与当前状态同步。
      try {
        var de = doc.documentElement;
        if (de && de.dataset && typeof de.dataset === 'object') {
          var scene = view.scene || {};
          de.dataset.node     = v.pos ? String(v.pos.node || '') : '';
          de.dataset.map      = v.pos ? String(v.pos.map  || '') : '';
          de.dataset.nodeKind = String(v.nodeKind || '');
          de.dataset.mood     = String(scene.mood   || '');
          de.dataset.region   = String(scene.region || '');
        }
      } catch (e) { /* dataset 写入是增强,环境差异不抛 */ }
      // 换节点滚回正文顶(易用性审计批):整页流式排版下,长正文滚到底点选项 → 浏览器保留 scrollTop,
      //   新节点正文开头落在视口上方,玩家每步都要手动滚回(Twine/SugarCube 默认换段滚顶=行业惯例;
      //   替换式渲染停在底部无合法用例)。镜像 present-svg 的 lastPosKey;typeof 守卫容 stub DOM。
      var pk = v.pos ? (v.pos.map + '/' + v.pos.node) : null;
      if (pk !== lastPosKey) {
        var firstPaint = (lastPosKey === null);   // 首屏不滚/不抢焦点:浏览器本就在顶部,且别打断开场屏幕阅读器播报
        lastPosKey = pk;
        if (!firstPaint) {
          try {
            var look = $(S.look);
            if (look && look.scrollTop) look.scrollTop = 0;                     // 容器自滚(作者给 #look 定高时)
            var top = $(S.place) || look;                                       // 优先滚到地点标题(新"页"的开头)
            if (top && typeof top.scrollIntoView === 'function') top.scrollIntoView({ block: 'start' });
            else if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
            focusNewContent(top, look);                                         // 键盘/读屏:换节点把焦点移到新"页"开头
          } catch (e) { /* 滚动/焦点是增强,不因环境差异抛 */ }
        }
      }
    }
    // 换节点时把焦点移到新内容开头(易用性审计批 · IFTF 无障碍):present-dom 每步 textContent='' 重建按钮,
    //   纯键盘/读屏玩家选完一项焦点丢回 body、每步要重新 Tab 进选项区。WCAG「视图切换聚焦区域开头」=
    //   聚焦**地点标题**(非首个选项按钮)——读屏由此按序读「标题→正文→选项」,不会跳过正文(聚焦控件才是反模式);
    //   键盘玩家落在新页顶部、一路 Tab 进选项。tabindex=-1 让标题可编程聚焦(不进 Tab 序);preventScroll 因上面已滚。
    //   只在换节点触发(同节点纯动作不抢焦点,避免把玩家从原处拽走);typeof 守卫容 stub DOM。
    function focusNewContent(heading, look) {
      var target = (heading && heading.textContent) ? heading : (look || heading);
      if (!target || typeof target.focus !== 'function') return;
      if (typeof target.setAttribute === 'function' && target.getAttribute && target.getAttribute('tabindex') == null) target.setAttribute('tabindex', '-1');
      try { target.focus({ preventScroll: true }); } catch (e) { try { target.focus(); } catch (e2) {} }
    }

    return {
      id: 'dom-presenter',
      install: function (api) { engine = api; api.addPresenter(present); },  // S11-b-ex:一步接渲染 + 接点击(api 即 engine,有 apply);已删 attach
      present: present
    };
  }

  return { createDomPresenter: createDomPresenter };
});
