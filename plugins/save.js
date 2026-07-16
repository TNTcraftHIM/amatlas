/* ════════════════════════════════════════════════════════════════════════
   Amatlas 能力插件 · 存档(plugins/save.js)— S8.5 / S11-c 多槽管理
   ════════════════════════════════════════════════════════════════════════
   验证统一插件模型对"**能力**"类的通用性:只用已有 api(`exportCode`/`importCode`/`state`/`world`/`on`),
   **不写 state、不碰核心、不改契约**。多槽存档**全在插件层**:派生自 saveKey 的多 key 信封
   (`<saveKey>:auto` / `<saveKey>:slot:1..N`,与核心裸 `saveKey` 的"断点续传"隔离),每槽存
   { v, code:exportCode(), meta:{ ts, place, turn, label } } —— 列表预览**只读 meta、不反序列化全档**;
   code 复用核心 exportCode(序列化归核心、插件不重写格式)。

   **基础方案(最素)**:`💾 存档` 按钮 → toggle 面板:autosave 槽(置顶锁定、enter 时自动写=安全网)
   + N 个手动槽,**按状态显按钮**(空槽:仅 `💾 存档`;有档:`📂 读取` + 悬停该行右侧浮现 `🗑 删除`,删除**就地二次确认**;重存=先删再存,无误覆盖)
   + 导出/导入码(file:// 隐私模式唯一通道、永远可见)。emoji 表意更直观。
   进阶样式(卡片式带地图缩略图 / 紧凑列表)见 game-design-guide —— **共享同一套 API、只换 class/图元**,
   引擎不强加风格(design-principles §10「分层不删、可选按需」)。

   无 DOM/无插槽 → 跳过 UI,API(exportSave/importSave/listSlots/saveTo/loadFrom/deleteSlot/autosave)
   仍可调(便于测试/复用)。storage 缺失(file://)/quota → 全程 try/catch 降级、warn-once。

   **坏档可见反馈(qol-backlog-design §C3)**:核心 importCode 拒绝形状不识/损坏的存档时返回 false(fail-loud
   到 console),但 UI 此前零反馈 = 玩家"点了没反应"(round5 同族)。槽位读取/导入码两个读档口现消费该
   boolean:false → 就地文案提示(不新增样式、不锚定审美),state 不被污染(核心校验先于写入)。

   用法:engine.use(createSavePlugin({ slot:'#plugin-bar', slots:3 }));
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).SavePlugin = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 插件控件默认样式(自带,§11:插件控件 UI ≠ 游戏内容创作 → 引擎兜底默认外观、作者可覆盖换皮;治本反复"工具栏裸")。
  //   :where() 零特异性 → 作者 index.html 任何 .amatlas-* 规则都覆盖;var(--x, fallback) → 作者定义了主题变量就跟随、没定义用中性深色不裸。
  //   共享块(按钮/浮窗,四插件共用)用幂等 id 只注一次;存档专属另一份。注入到 head 最前 → 作者样式在后、自然覆盖。
  var SHARED_CSS = ':where(.amatlas-plugin-btn){appearance:none;font:13px var(--ui,system-ui,sans-serif);background:var(--panel,#121a26);color:var(--ink,#e8edf4);border:1px solid var(--line,#222e40);border-radius:8px;padding:7px 12px;cursor:pointer;transition:.2s}:where(.amatlas-plugin-btn):hover{border-color:var(--accent,#b89b6a);color:var(--accent,#b89b6a)}:where(.amatlas-plugin-panel){position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:60;width:92%;max-width:440px;max-height:82vh;overflow:auto;background:var(--panel,#121a26);color:var(--ink,#e8edf4);border:1px solid var(--line,#222e40);border-radius:14px;padding:24px 22px;box-shadow:0 24px 70px rgba(0,0,0,.6);font:13px var(--ui,system-ui,sans-serif)}:where(.amatlas-plugin-panel)[hidden]{display:none}:where(.amatlas-plugin-panel)::before{content:"";position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:-1}:where(.amatlas-plugin-close){position:absolute;top:14px;right:16px;background:none;border:none;color:var(--dim,#8a99ad);font-size:18px;line-height:1;cursor:pointer;padding:2px 7px;border-radius:6px}:where(.amatlas-plugin-close):hover{color:var(--accent,#b89b6a)}';
  var SAVE_CSS = ':where(.amatlas-save-head){font-weight:600;color:var(--accent,#b89b6a);margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--line,#222e40)}:where(.amatlas-save-row){display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:11px 13px;margin-bottom:9px;background:var(--bg,#0c1119);border:1px solid var(--line,#222e40);border-radius:8px}:where(.amatlas-save-info){flex:1;min-width:130px;font-size:12px;color:var(--ink,#e8edf4)}:where(.amatlas-save-do){color:var(--accent,#b89b6a);border-color:var(--accent,#b89b6a)}:where(.amatlas-save-del){margin-left:auto;border-color:transparent;background:none;color:var(--danger,#c87b6a);opacity:.7}:where(.amatlas-save-io){margin-top:14px;padding-top:14px;border-top:1px solid var(--line,#222e40);display:flex;flex-wrap:wrap;gap:7px}:where(.amatlas-save-code){flex-basis:100%;background:var(--bg,#0c1119);color:var(--dim,#8a99ad);border:1px solid var(--line,#222e40);border-radius:8px;font-family:ui-monospace,monospace;font-size:12px;padding:7px}@media (hover:none){:where(.amatlas-save-del){opacity:.7}}';   // 触屏无 hover → 删除钮常显(推荐皮 hover-only 时由本条兜底;§11 工具类控件)
  function injectStyles(doc) {
    if (!doc || !doc.head || !doc.createElement) return;   // 容 stub DOM:不全则优雅退化、不崩
    function once(id, css) {
      if (doc.getElementById && doc.getElementById(id)) return;
      var s = doc.createElement('style'); if (!s) return; s.id = id; s.textContent = css;
      if (doc.head.insertBefore) doc.head.insertBefore(s, doc.head.firstChild); else if (doc.head.appendChild) doc.head.appendChild(s);
    }
    once('amatlas-plugin-shared', SHARED_CSS);   // 四插件共用(按钮/浮窗),幂等→只注一次
    once('amatlas-plugin-save', SAVE_CSS);
  }

  function createSavePlugin(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var slot = opts.slot || '#plugin-bar';
    // storage 仍由插件自带/可注入；saveKey 未显式给时在 install(api) 继承核心最终 namespace，
    // 使 boot 与手写装配都同源。显式 opts.saveKey 是高级 escape hatch,但必须非空字符串。
    var storage = (opts.storage !== undefined) ? opts.storage : (function () { try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; } })();  // 包 try/catch:opaque origin/隐私模式下**访问** localStorage 会抛(非 undefined)→ 构造期降级为 null、不崩;显式 null(关持久化)不被 || 吞
    if (opts.saveKey !== undefined && (typeof opts.saveKey !== 'string' || !opts.saveKey.trim())) throw new Error('[amatlas] save plugin:opts.saveKey 必须是非空字符串;省略则继承 engine.saveKey。');
    var saveKey = opts.saveKey;
    var N = opts.slots != null ? opts.slots : 3;          // 手动槽数
    var now = opts.now || function () { return (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0; };
    var autoOnEnter = opts.autoOnEnter !== false;         // 默认订阅 enter 自动写 :auto(安全网)
    var api = null, btnEl = null, panelEl = null, rows = {}, pending = {}, warned = false;

    /* ── storage 安全包装(file:// / 隐私模式 / quota 全程降级)── */
    function warn(m) { if (typeof console !== 'undefined' && console.warn) console.warn(m); }
    function read(k) { if (!storage) return null; try { return storage.getItem(k); } catch (e) { return null; } }
    function write(k, v) {
      if (!storage) return false;
      try { storage.setItem(k, v); return true; }
      catch (e) { if (!warned) { warned = true; warn('[amatlas] save:写入失败(存档未持久化;quota/隐私模式)— ' + (e && e.message)); } return false; }
    }
    function remove(k) { if (!storage) return; try { storage.removeItem(k); } catch (e) {} }
    function keyOf(id) { return id === 'auto' ? saveKey + ':auto' : saveKey + ':slot:' + id; }

    /* ── 信封:code 复用核心序列化、meta 是"关于存档的存档"(只为列表预览、不写 state)── */
    function metaNow(label) {
      var s = api && api.state, pos = (s && s.pos) || {};
      var map = api && api.world && api.world.maps && api.world.maps[pos.map];
      var node = map && map.nodes && map.nodes[pos.node];
      return {
        ts: now(),
        place: (node && node.title) || ((pos.map != null ? pos.map + '/' : '') + (pos.node != null ? pos.node : '')),
        turn: (s && s.clock && s.clock.t) || 0,
        label: label || ''
      };
    }
    function readEnvelope(id) { var raw = read(keyOf(id)); if (!raw) return null; try { return JSON.parse(raw); } catch (e) { return null; } }

    /* ── API(DOM-free,可独立调用/测试)── */
    function exportSave() { return api ? api.exportCode() : null; }            // 向后兼容:导出码(永远可见通道)
    function importSave(code) { return api ? api.importCode(code) : false; }   // 向后兼容:导入码

    function saveTo(id, label) {
      if (!api) return false;
      var env = { v: 1, code: api.exportCode(), meta: metaNow(label) };
      var okw = write(keyOf(id), JSON.stringify(env));
      if (okw) refresh();
      return okw;
    }
    function autosave() { return saveTo('auto'); }                             // enter 安全网;auto 槽手动不可覆盖
    function loadFrom(id) {
      var env = readEnvelope(id); if (!env || !env.code) return false;
      return api ? api.importCode(env.code) : false;                          // importCode 失败(坏档)→ false、不破坏当前状态
    }
    function deleteSlot(id) { remove(keyOf(id)); pending[id] = null; refresh(); }
    function listSlots() {
      var ids = ['auto'], out = [], i;
      for (i = 1; i <= N; i++) ids.push(i);
      for (i = 0; i < ids.length; i++) {
        var id = ids[i], env = readEnvelope(id), m = (env && env.meta) || null;
        out.push({ id: id, kind: id === 'auto' ? 'auto' : 'slot', empty: !env,
          ts: m ? m.ts : null, place: m ? m.place : '', turn: m ? m.turn : null, label: m ? m.label : '' });
      }
      return out;
    }
    function slotById(id) { var L = listSlots(), i; for (i = 0; i < L.length; i++) if (L[i].id === id) return L[i]; return null; }

    /* ── UI(抄 achievement 的 btnEl + panel.hidden;骨架固定、refresh 只改文本 → mock-DOM 可测)── */
    function fmtTs(ts) {
      if (!ts) return '';
      var d; try { d = new Date(ts); } catch (e) { return ''; }
      function p(n) { return (n < 10 ? '0' : '') + n; }
      return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function rowText(s) {
      if (s.empty) return s.id === 'auto' ? '自动存档(空)' : '空';
      var parts = [];
      if (s.label) parts.push(s.label);
      if (s.place) parts.push(s.place);
      parts.push('回合 ' + (s.turn || 0));
      var t = fmtTs(s.ts); if (t) parts.push(t);
      return (s.id === 'auto' ? '🔄 ' : '') + parts.join(' · ');
    }
    function clearPendingExcept(id) { for (var k in pending) if (k !== String(id)) pending[k] = null; }
    function refresh() {
      if (!panelEl) return;
      var L = listSlots(), i;
      for (i = 0; i < L.length; i++) {
        var s = L[i], r = rows[s.id]; if (!r) continue;
        r.info.textContent = rowText(s);
        // 按状态显隐 + emoji:空槽仅 💾 存档;有档藏 💾、显 📂 读取 + 🗑 删除(删除靠 CSS 悬停浮现,确认态强制可见)。
        if (r.save) { r.save.textContent = '💾 存档'; r.save.hidden = !s.empty; }
        r.load.textContent = '📂 读取'; r.load.hidden = s.empty;
        var del = pending[s.id] === 'delete';
        r.del.textContent = del ? '🗑 确认?' : '🗑';
        r.del.hidden = s.empty;
        r.del.className = 'amatlas-plugin-btn amatlas-save-del' + (del ? ' amatlas-save-confirm' : '');   // 确认态加 class → CSS 强制可见(否则鼠标移开就被悬停规则藏回去)
      }
    }
    function onSave(id) {
      return function () {
        var s = slotById(id);
        if (s && !s.empty) return;        // 💾 存档钮只在空槽显示;有档要重存 → 先 🗑 删再 💾 存(无误覆盖,匹配"空→存/有档→读+删"按钮逻辑)
        saveTo(id);                       // 空槽直存(saveTo 内 refresh → 该行切到 📂 读取 + 🗑 删除)
      };
    }
    function onLoad(id) {
      return function () {
        var s = slotById(id); if (!s || s.empty) return;
        if (loadFrom(id)) { if (panelEl) panelEl.hidden = true; return; }  // 读档成功 → 收起面板(非破坏、无需确认)
        // C3(qol-backlog-design §C3):loadFrom 返回 false(坏档/形状不识,engine-core.js badShape 校验拒绝)时
        //   核心已 fail-loud 到 console,但槽位 UI 此前零反馈 = 玩家"点了没反应"(round5 同族)。
        //   就地把该行 info 文案换成提示(不调 refresh(),否则会被 rowText(s) 立刻冲掉);state 未被 importCode 触碰(核心校验先于写入)。
        var r = rows[id]; if (r && r.info) r.info.textContent = '⚠ 存档不兼容或已损坏,读取失败';
      };
    }
    function onDel(id) {
      return function () {
        var s = slotById(id); if (!s || s.empty) return;
        if (pending[id] !== 'delete') { pending[id] = 'delete'; clearPendingExcept(id); refresh(); return; }              // 删除 → 二次确认
        deleteSlot(id);                                    // 确认后删(deleteSlot 内清 pending + refresh)
      };
    }
    function buildRow(id) {
      var row = doc.createElement('div'); row.className = 'amatlas-save-row' + (id === 'auto' ? ' amatlas-save-auto' : '');
      var info = doc.createElement('span'); info.className = 'amatlas-save-info'; row.appendChild(info);
      var r = { info: info };
      if (id !== 'auto') { var sv = doc.createElement('button'); sv.className = 'amatlas-plugin-btn amatlas-save-do'; sv.setAttribute('title', '存档'); sv.onclick = onSave(id); row.appendChild(sv); r.save = sv; }  // auto 槽锁定:无"存"按钮
      var ld = doc.createElement('button'); ld.className = 'amatlas-plugin-btn amatlas-save-load'; ld.setAttribute('title', '读取'); ld.onclick = onLoad(id); row.appendChild(ld); r.load = ld;
      var dl = doc.createElement('button'); dl.className = 'amatlas-plugin-btn amatlas-save-del'; dl.setAttribute('title', '删除'); dl.onclick = onDel(id); row.appendChild(dl); r.del = dl;   // 删除:CSS 悬停该行才浮现(语义 class)
      rows[id] = r; panelEl.appendChild(row);
    }
    function mountUI() {
      if (!doc) return;
      var bar = doc.querySelector(slot); if (!bar) return;
      injectStyles(doc);   // 自带默认样式(工具栏按钮/浮窗不裸;作者 .amatlas-* 覆盖换皮)
      btnEl = doc.createElement('button'); btnEl.className = 'amatlas-plugin-btn amatlas-save-btn'; btnEl.textContent = '💾 存档';
      panelEl = doc.createElement('div'); panelEl.className = 'amatlas-plugin-panel amatlas-save-panel'; panelEl.hidden = true;
      btnEl.onclick = function () { panelEl.hidden = !panelEl.hidden; if (!panelEl.hidden) { if (ioStatus) ioStatus.textContent = ''; refresh(); } };   // 开面板清导入提示(防重开显过期警告)

      var head = doc.createElement('div'); head.className = 'amatlas-save-head'; head.textContent = '存档';
      var close = doc.createElement('button'); close.className = 'amatlas-plugin-close'; close.textContent = '✕'; close.setAttribute('title', '关闭'); close.onclick = function () { panelEl.hidden = true; }; head.appendChild(close);   // ✕ 直接关浮窗(住 head→不挪 panel 子节点索引)
      panelEl.appendChild(head);
      var ids = ['auto'], i; for (i = 1; i <= N; i++) ids.push(i);
      for (i = 0; i < ids.length; i++) buildRow(ids[i]);

      // 导出/导入码:file:// 下 localStorage 不可用时的唯一出路 → 永远可见。
      var io = doc.createElement('div'); io.className = 'amatlas-save-io';
      var ta = doc.createElement('textarea'); ta.className = 'amatlas-save-code'; ta.rows = 2; ta.setAttribute('placeholder', '存档码(导出后复制 / 粘贴后导入)');
      var ex = doc.createElement('button'); ex.className = 'amatlas-plugin-btn'; ex.textContent = '导出码';
      ex.onclick = function () { ta.value = exportSave() || ''; };
      var im = doc.createElement('button'); im.className = 'amatlas-plugin-btn'; im.textContent = '导入码';
      // C3:importSave 同 loadFrom 一样可能因坏码返回 false(core badShape/JSON 解析失败)——此前不消费返回值,
      //   坏码粘贴进去点"导入码"=零反馈。ioStatus 复用同一提示文案(修守卫扫族:槽位/导入码两口一次改齐)。
      var ioStatus = doc.createElement('span'); ioStatus.className = 'amatlas-save-io-status';
      im.onclick = function () {
        ioStatus.textContent = '';                                  // 每次尝试先清旧提示(修:失败后重试成功、或面板重开时残留过期警告——红队 FIX)
        if (!ta.value) return;
        if (importSave(ta.value)) { if (panelEl) panelEl.hidden = true; return; }
        ioStatus.textContent = '⚠ 存档码无效或已损坏,导入失败';
      };
      io.appendChild(ta); io.appendChild(ex); io.appendChild(im); io.appendChild(ioStatus); panelEl.appendChild(io);

      bar.appendChild(btnEl); bar.appendChild(panelEl);
      refresh();
    }

    return {
      id: 'save',
      install: function (a) {
        api = a;
        if (saveKey === undefined) saveKey = a && a.saveKey;
        if (typeof saveKey !== 'string' || !saveKey) throw new Error('[amatlas] save plugin:找不到有效 saveKey;请使用带 world.id 的 engine,或显式传 opts.saveKey。');
        if (autoOnEnter) a.on('enter', function () { autosave(); });   // 安全网:每次进节点自动写 :auto 槽
        mountUI();
      },
      exportSave: exportSave, importSave: importSave,                  // 向后兼容
      listSlots: listSlots, saveTo: saveTo, loadFrom: loadFrom, deleteSlot: deleteSlot, autosave: autosave
    };
  }

  return { createSavePlugin: createSavePlugin };
});
