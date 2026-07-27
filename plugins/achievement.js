/* ════════════════════════════════════════════════════════════════════════
   Amatlas 能力插件 · 成就(plugins/achievement.js)— S8.5
   ════════════════════════════════════════════════════════════════════════
   验证统一插件模型订阅"**事件 + 写 state**"的通用性:订阅 `on('enter'/'action')`,按条件把
   解锁记进 **`state._achievement`**(namespace 约定,设计文档 §5:`state._<pluginId>` 防键冲突)。
   因写在 state 里 → **随存档往返**(序列化自动带上)。解锁时往约定插槽(默认 `#plugin-overlay`)弹窗。
   **round13 修(showcase 实测「重新开始 → 成就清空」)**:成就是**跨周目元进度**(像 Steam 成就),不该随单局 reset 蒸发——
   而核心 `reset()` 走 `freshState()` 会把整个 state(含 `_achievement`)清掉。故插件**自带一份 localStorage 持久账本**；
   v24 起未显式给 `storageKey` 时继承核心最终 `api.saveKey + ':ach'`,与本游戏断点续传/槽位同 namespace、又跨 reset 保留。
   解锁即写盘;install 与 enter/action check 把账本并入 `state._achievement`(幂等)→ reset 后由 enter 恢复、且已解锁的不再重复弹窗。presenter 只读 state 刷 UI，不在广播中途写唯一真相。
   无 storage(file:///隐私/测试 null)→ 全程优雅降级回旧的"仅随档"行为(零回归)。
   无 DOM → 跳过弹窗,记账逻辑仍生效(便于测试)。成就清单经 opts 配置(数据驱动,引擎不内置具体成就)。
   **round7 增强(统一工具栏第一步)**:除解锁 toast,还往工具栏插槽(默认 `#plugin-bar`)渲染常驻
   「🏆 成就 N/M」按钮 → 点开 toggle 一个面板,列出**全部**成就(已解锁 ✓ / 未解锁 🔒 + 可选 description)。
   无插槽 → 跳过按钮、toast 仍工作(向后兼容)。
   **round10 修(showcase《奥术神座》)**:① toast 进插件自有 `.amatlas-toast-stack` 容器,默认 CSS 钉**右下**
   并 `toastMs`(默认 4000ms,0/false=常驻)后淡出出 DOM——旧版 toast 无定位、永不移除,作者把 #plugin-overlay
   写成全屏(偏离 guide §5 右下堆)时 toast 从屏幕顶排起、永久叠在工具栏上挡点击;② 按钮计数挂 render
   presenter 同步——load/loadLocal 只 hydrate+render、不发 enter(核心有意防污染 seen),旧版只在解锁时刷新
   → 自动续档/读档后按钮停在旧值(面板开时现算是对的、和按钮对不上)。

   achievements: [ { id, title?, description?, hidden?(秘密成就:未解锁显「❓ ???」、解锁即揭示真名/描述), on?: 'enter'|'action'(缺省两者都查), when:(state, ev)=>bool } ]
   用法:engine.use(createAchievementPlugin({ achievements: [...], slot?:'#plugin-overlay'(toast), buttonSlot?:'#plugin-bar'(按钮+列表), toastMs?:4000(0=常驻) }));
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).AchievementPlugin = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 插件控件默认样式(自带,§11:插件控件 UI ≠ 游戏内容创作 → 引擎兜底默认外观、作者可覆盖换皮;治本反复"工具栏裸")。
  //   :where() 零特异性 → 作者 index.html 任何 .amatlas-* 规则都覆盖;var(--x, fallback) → 作者定义了主题变量就跟随、没定义用中性深色不裸。
  //   共享块(按钮/浮窗,四插件共用)用幂等 id 只注一次;成就专属另一份(toast/列表条目)。注入到 head 最前 → 作者样式在后、自然覆盖。
  var SHARED_CSS = ':where(.amatlas-plugin-btn){appearance:none;font:13px var(--ui,system-ui,sans-serif);background:var(--panel,#121a26);color:var(--ink,#e8edf4);border:1px solid var(--line,#222e40);border-radius:8px;padding:7px 12px;cursor:pointer;transition:.2s}:where(.amatlas-plugin-btn):hover{border-color:var(--accent,#b89b6a);color:var(--accent,#b89b6a)}:where(.amatlas-plugin-panel){position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:60;width:92%;max-width:440px;max-height:82vh;overflow:auto;background:var(--panel,#121a26);color:var(--ink,#e8edf4);border:1px solid var(--line,#222e40);border-radius:14px;padding:24px 22px;box-shadow:0 24px 70px rgba(0,0,0,.6);font:13px var(--ui,system-ui,sans-serif)}:where(.amatlas-plugin-panel)[hidden]{display:none}:where(.amatlas-plugin-panel)::before{content:"";position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:-1}:where(.amatlas-plugin-close){position:absolute;top:14px;right:16px;background:none;border:none;color:var(--dim,#8a99ad);font-size:18px;line-height:1;cursor:pointer;padding:2px 7px;border-radius:6px}:where(.amatlas-plugin-close):hover{color:var(--accent,#b89b6a)}';
  //   toast 定位自带(.amatlas-toast-stack 钉右下 + pointer-events:none):不再依赖作者把 #plugin-overlay 写成 guide §5 的右下 flex 堆——
  //   作者写成全屏 inset:0 时旧版 toast 从屏幕顶排起、正叠在工具栏上;z-index 50 < 浮窗面板 60(toast 不盖模态)。
  var ACH_CSS = ':where(.amatlas-toast-stack){position:fixed;right:14px;bottom:14px;z-index:50;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;max-width:min(320px,80vw)}:where(.amatlas-achievement){background:var(--accent,#b89b6a);color:#1a1206;padding:9px 13px;border-radius:9px;font:600 13px var(--ui,system-ui,sans-serif);box-shadow:0 6px 20px rgba(0,0,0,.45);transition:opacity .35s ease,transform .35s ease}:where(.amatlas-achievement.amatlas-out){opacity:0;transform:translateY(8px)}:where(.amatlas-ach-head){font-weight:600;color:var(--accent,#b89b6a);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--line,#222e40)}:where(.amatlas-ach-item){display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;margin-bottom:8px;background:var(--bg,#0c1119);border:1px solid var(--line,#222e40);border-radius:8px}:where(.amatlas-ach-item.got){border-color:var(--accent,#b89b6a)}:where(.amatlas-ach-item.locked){opacity:.5}:where(.amatlas-ach-mark){font-size:19px;flex-shrink:0}:where(.amatlas-ach-item) b{color:var(--ink,#e8edf4)}:where(.amatlas-ach-desc){color:var(--dim,#8a99ad);font-size:12px}';
  function injectStyles(doc) {
    if (!doc || !doc.head || !doc.createElement) return;   // 容 stub DOM:不全则优雅退化、不崩
    function once(id, css) {
      if (doc.getElementById && doc.getElementById(id)) return;
      var s = doc.createElement('style'); if (!s) return; s.id = id; s.textContent = css;
      if (doc.head.insertBefore) doc.head.insertBefore(s, doc.head.firstChild); else if (doc.head.appendChild) doc.head.appendChild(s);
    }
    once('amatlas-plugin-shared', SHARED_CSS);   // 四插件共用(按钮/浮窗),幂等→只注一次
    once('amatlas-plugin-ach', ACH_CSS);
  }

  function createAchievementPlugin(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var slot = opts.slot || '#plugin-overlay';
    var list = opts.achievements || [];
    var buttonSlot = opts.buttonSlot || '#plugin-bar';    // round7:工具栏触发按钮的插槽(toast 仍走 slot)
    var toastMs = opts.toastMs == null ? 4000 : opts.toastMs;   // round10:toast 存活时长;0/false=常驻(作者自管)
    // 持久账本 storage(成就=跨 reset 元进度)。storage 仍可注入；storageKey 未显式给时在 install(api)
    // 继承核心 saveKey + ':ach',使手写装配也不会退回跨游戏固定键。
    var storage = (opts.storage !== undefined) ? opts.storage : (function () { try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; } })();  // opaque/隐私模式下访问会抛 → 降级 null、不崩;显式 null 不被 || 吞
    if (opts.storageKey !== undefined && (typeof opts.storageKey !== 'string' || !opts.storageKey.trim())) throw new Error('[amatlas] achievement:opts.storageKey 必须是非空字符串;省略则继承 engine.saveKey + ":ach"。');
    var storageKey = opts.storageKey;
    var api = null, btnEl = null, closeEl = null, stackEl = null, durWarned = false;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    function ledger() {                                   // namespace:state._achievement(随档,会话内工作集)
      var s = api && api.state; if (!s) return {};
      if (!s._achievement) s._achievement = Object.create(null);
      return s._achievement;
    }
    // round13:持久账本(localStorage,跨 reset 元进度)。读写全包 try/catch,无 storage 一律静默降级回"仅随档"。
    function warn(m) { if (typeof console !== 'undefined' && console.warn) console.warn(m); }
    function readDurable() { if (!storage) return null; try { var raw = storage.getItem(storageKey); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
    function writeDurable(L) { if (!storage) return; try { storage.setItem(storageKey, JSON.stringify(L)); } catch (e) { if (!durWarned) { durWarned = true; warn('[amatlas] achievement:持久化失败(成就未跨周目保存;quota/隐私模式)— ' + (e && e.message)); } } }
    // 把持久账本并入 state._achievement(幂等)。dur 为空(无 storage / 首次未解锁)→ 提前返回,**不创建** _achievement 键(保旧"懒创建"语义、零回归)。
    //   reset 清 state 后由下一帧 check/presenter 借此恢复;已解锁的并回 L → check 里 `if(L[id])continue` 不再重复弹窗。
    function hydrate() { var dur = readDurable(); if (!dur) return; var L = ledger(); for (var k in dur) if (dur[k]) L[k] = 1; }
    function popup(text) {
      if (!doc) return;
      var el = doc.querySelector(slot); if (!el) return;
      // round10:toast 不再直接散进 slot——进插件自有堆叠容器(默认 CSS 钉右下、pointer-events:none),
      //   定位不再依赖作者把 #plugin-overlay 写对(showcase 实测:作者 overlay 写成全屏 inset:0 → toast 顶着工具栏排)。
      if (!stackEl) { stackEl = doc.createElement('div'); stackEl.className = 'amatlas-toast-stack'; el.appendChild(stackEl); }
      var d = doc.createElement('div'); d.className = 'amatlas-achievement'; d.textContent = '🏆 ' + text;
      stackEl.appendChild(d);
      // 自动消隐:旧版只 append 永不移除 → toast 永久驻留(全屏 overlay 时永久挡住工具栏点击)。
      //   toastMs 后加 .amatlas-out 淡出(CSS transition)、再 350ms 出 DOM;toastMs:0/false = 常驻。
      if (toastMs && typeof setTimeout === 'function') {
        var t1 = setTimeout(function () {
          d.className += ' amatlas-out';
          var t2 = setTimeout(function () { if (d.parentNode && d.parentNode.removeChild) d.parentNode.removeChild(d); }, 350);
          if (t2 && t2.unref) t2.unref();   // node(测试)里不拖住进程退出;浏览器 setTimeout 返回 number 无 unref → 自然跳过
        }, toastMs);
        if (t1 && t1.unref) t1.unref();
      }
    }
    // round7 统一工具栏:常驻「🏆 成就 N/M」按钮 + toggle 列表面板。按钮住工具栏(默认 #plugin-bar,天然可点,
    //   不依赖 style——保持 DOM-free 可测);面板列出全部成就(✓/🔒)。无 DOM/无插槽 → 跳过(toast 仍工作)。
    // 计数只读(不在渲染路径创建 _achievement 键)且只数清单内的 id——旧档残留的已删成就 id 不会数出 7/6。
    function unlockedCount() {
      var L = (api && api.state && api.state._achievement) || {}, n = 0;
      for (var i = 0; i < list.length; i++) if (L[list[i].id]) n++;
      return n;
    }
    function refreshBtn() {
      if (!btnEl) return;
      btnEl.textContent = '🏆 成就 ' + unlockedCount() + '/' + list.length;
    }
    function renderList(panel) {
      var L = (api && api.state && api.state._achievement) || {}, h = '<div class="amatlas-ach-head">成就 ' + unlockedCount() + '/' + list.length + '</div>';
      for (var i = 0; i < list.length; i++) {
        var a = list[i], got = !!L[a.id];
        var secret = !!(a.hidden || a.secret) && !got;     // 隐藏成就:未解锁藏名/描述(显 ❓ ???),解锁即揭示
        var title = secret ? '???' : esc(a.title != null ? a.title : a.id);
        var mark = got ? '✓' : (secret ? '❓' : '🔒');
        var desc = secret ? '<span class="amatlas-ach-desc"> — 隐藏成就</span>'
          : (a.description != null ? '<span class="amatlas-ach-desc"> — ' + esc(a.description) + '</span>' : '');
        h += '<div class="amatlas-ach-item' + (got ? ' got' : ' locked') + (secret ? ' secret' : '') + '">'
          + '<span class="amatlas-ach-mark">' + mark + '</span> <b>' + title + '</b>' + desc + '</div>';
      }
      panel.innerHTML = h;
      if (closeEl) panel.appendChild(closeEl);   // innerHTML 会清子节点 → 重渲后复挂持久 ✕(其 onclick 不丢)
    }
    function mountUI() {
      if (!doc) return;
      var bar = doc.querySelector(buttonSlot); if (!bar) return;
      injectStyles(doc);   // 自带默认样式(工具栏按钮/浮窗/toast 不裸;作者 .amatlas-* 覆盖换皮)
      btnEl = doc.createElement('button'); btnEl.className = 'amatlas-plugin-btn amatlas-ach-btn';
      var panel = doc.createElement('div'); panel.className = 'amatlas-plugin-panel amatlas-ach-panel'; panel.hidden = true;
      closeEl = doc.createElement('button'); closeEl.className = 'amatlas-plugin-close'; closeEl.textContent = '✕'; closeEl.setAttribute('title', '关闭'); closeEl.onclick = function () { panel.hidden = true; };   // ✕ 直接关浮窗(renderList 后复挂)
      btnEl.onclick = function () { panel.hidden = !panel.hidden; if (!panel.hidden) renderList(panel); };
      bar.appendChild(btnEl); bar.appendChild(panel);
      refreshBtn();
    }
    function check(evType, ev) {
      if (!api) return;
      hydrate();                                          // round13:先并入历史解锁 → reset 后不重复弹窗、load 后显示全时进度
      var L = ledger();
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (a.on && a.on !== evType) continue;            // 限定事件类型(缺省 enter/action 都查)
        if (Object.prototype.hasOwnProperty.call(L, a.id) && L[a.id]) continue;   // 已解锁(once);原型名 id 不能命中普通对象继承属性
        // fail-loud(design-principles §6b):when 门控非函数 = 违约。旧写法非函数 → && 短路 → 成就**永不解锁**(静默失效)。
        if (a.when != null && typeof a.when !== 'function') throw new Error('[amatlas] achievement.when 必须是 (state,ev)=>bool 函数(成就「' + (a.title != null ? a.title : a.id) + '」),收到 ' + typeof a.when + ':写成定值会被静默当"永不解锁"→ 失效。改成函数。');
        if (typeof a.when === 'function' && a.when(api.state, ev)) { L[a.id] = 1; writeDurable(L); popup(a.title || a.id); refreshBtn(); }   // round13:解锁即写盘(跨 reset)
      }
    }
    function unlocked() { return Object.keys(ledger()); }

    return {
      id: 'achievement',
      install: function (a) {
        api = a;
        if (storageKey === undefined) storageKey = a && a.saveKey ? a.saveKey + ':ach' : undefined;
        if (typeof storageKey !== 'string' || !storageKey) throw new Error('[amatlas] achievement:找不到有效 storageKey;请使用带 world.id 的 engine,或显式传 opts.storageKey。');
        // fail-loud(round7 #1):成就判定字段是 when:(state,ev)=>bool。无 when 函数 = 永不解锁(静默失效);
        //   弱模型易写成 check/condition 等别名(命令式直觉)→ a.when 为 undefined、第 45 行短路、成就永不触发。
        //   use 时一次性校验、早抛(boot 崩 → 装配探针 P0 抓);只校验字段名/形态,不碰成就条件内容。
        var achievementIds = Object.create(null);
        list.forEach(function (ac, i) {
          if (!ac || typeof ac.id !== 'string' || !ac.id.trim()) {
            throw new Error('[amatlas] achievement[' + i + '].id 必须是非空字符串(持久账本与计数的稳定唯一键)。');
          }
          if (Object.prototype.hasOwnProperty.call(achievementIds, ac.id)) {
            throw new Error('[amatlas] achievement.id 重复:"' + ac.id + '"(同一清单内必须唯一，否则账本/计数会合并)。');
          }
          achievementIds[ac.id] = 1;
          // fail-loud(round9 audit):on 是闭集枚举 'enter'/'action'(检查时机)。写错值(如 'visit'/'click')→ check() 里 a.on!==evType 恒真 → 该成就永不被检查、静默永不解锁。
          if (ac.on != null && ac.on !== 'enter' && ac.on !== 'action') throw new Error('[amatlas] achievement「' + (ac.title != null ? ac.title : (ac.id != null ? ac.id : i)) + '」的 on 只能是 "enter"(进入节点时查)或 "action"(执行动作时查),收到 "' + ac.on + '":写错值 → 该成就永远不被检查、静默永不解锁。删掉 on = 两种时机都查。');
          if (typeof ac.when === 'function') return;
          var alias = ['check', 'condition', 'unlock', 'test', 'cond', 'if'].filter(function (k) { return ac[k] != null; });
          throw new Error('[amatlas] achievement「' + (ac.title != null ? ac.title : (ac.id != null ? ac.id : i)) + '」缺少判定函数 when:(state,ev)=>bool'
            + (alias.length ? '(你写了 ' + alias.join('/') + ',应改名为 when)' : (ac.when != null ? '(when 收到 ' + typeof ac.when + ',必须是函数)' : ''))
            + ':无 when 函数会被静默当"永不解锁"。成就名/图标用 title,条件全由你定。');
        });
        hydrate();                                        // round13:boot 即并入历史解锁 → mountUI 初始计数含跨周目进度
        a.on('enter', function (ev) { check('enter', ev); });
        a.on('action', function (ev) { check('action', ev); });
        mountUI();                                        // round7:渲染工具栏「🏆 成就 N/M」按钮 + 列表面板
        // 按钮计数随每次 render 同步。presenter 只读 state 并刷新 UI，绝不 hydrate/写 state：同一 snapshot
        // 广播中途改唯一真相会让注册顺序前后的 presenter 看到两个世界。历史账本只在 install 与 enter/action
        // 明确生命周期并入；load/loadLocal 的存档 state 直接决定本帧，后续事件再与 durable ledger 合并。
        if (typeof a.addPresenter === 'function') a.addPresenter(function () { refreshBtn(); });
      },
      unlocked: unlocked
    };
  }

  return { createAchievementPlugin: createAchievementPlugin };
});
