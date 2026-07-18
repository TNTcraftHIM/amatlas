/* ════════════════════════════════════════════════════════════════════════
   Amatlas preset 层 · boot —— pit-of-success 默认装配(S12-1)
   ────────────────────────────────────────────────────────────────────────
   作者声明一份 manifest,boot 据此:① 按 world 用到的 kind 自动拉内置 module
   (scene→TextAdventure / encounter→Tabletop)② 挂呈现器/插件(三态)③ 复用
   engine.start() 已有的 kind 预检 ④ 返回 engine。把手写 ~50 行 game.js 的装配
   出错面(漏 use、kind↔module 不匹配、slot 拼写)收敛掉。

   分层(关键):`kind→工厂` 映射只在【本 preset 层】(依赖内置全家桶);
     core 仍纯、对具体 module 一无所知(red-team 认可的出路:表放 preset 不放 core)。

   fail-loud(不静默):world 用了某 kind / manifest 声明了某能力,但对应工厂没
     加载(<script> 漏引)→ 抛 + 提示加哪个 script;绝不静默 no-op。

   escape hatch:① 返回 engine,可继续 engine.use(...) / 操作;② manifest.modules
     传自定义 module 实例(与内置平权,nodeKinds 被 start 预检认);③ manifest.use
     传任意额外插件;④ 底层 Amatlas.createEngine + engine.use(...) 原样保留——boot 是
     【opt-in 便利层、非强制】,手写装配完全可用。

   manifest 形态(全可选):
     { status, sheet,                       // 透传给 text-adventure / tabletop
       present: { svg, audio },             // 呈现器三态:省略=默认开(宽容) / 对象=透传 opts / false=关
       save, minimap, achievement,          // 插件三态:falsy=不挂 / true=默认 / 对象=透传 opts
       achievements: [...],                 // achievement 简写(等价 achievement:{achievements:[...]})
       saveKey: 'embed-slot',               // 可选 storage override;正常游戏省略,由 world.id 稳定派生
       modules: [...], use: [...],          // escape hatch:自定义 module / 额外插件
       errorBanner: false,                  // 关掉运行时错误横幅(默认开;见 installErrorSurface)
       storage, document }                  // 透传(测试/嵌入可注入;默认 localStorage / 全局 document)
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function collectKinds(world) {
    var ks = {}, maps = (world && world.maps) || {}, m, ns, n, k;
    for (m in maps) {
      ns = (maps[m] && maps[m].nodes) || {};
      for (n in ns) { k = ns[n] && ns[n].kind; if (k) ks[k] = (ks[k] || 0) + 1; }
    }
    return ks;
  }
  function asOpts(v) { return (v && typeof v === 'object') ? v : {}; }      // 三态:对象=透传,其余(true)=默认 {}
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  // ── 运行时错误面(玩家可感兜底,"fail-loud 最后一公里")────────────────────
  //    三闸是作者期防线;漏网的深处运行时错误(run/look/event 抛)此前只进 console——玩家视角=
  //    「点了没反应/画面冻住」的无声死亡(round5 when:'enter' 崩实证漏到过端用户)。这里装全局
  //    错误条:window error/unhandledrejection → 页面顶部醒目横幅,提示玩家把原话带回给 Claude 修。
  //    参照 Ren'Py:一切运行时异常呈现为游戏内错误屏、从不只进 console。manifest.errorBanner:false 可关;
  //    样式 :where() 零特异度=作者可任意覆盖(工具类控件 UI,不碰内容创作)。错误面自身绝不能再抛。
  function installErrorSurface(doc) {
    var w = (typeof window !== 'undefined') ? window : null;
    if (!w || typeof w.addEventListener !== 'function' || !doc || typeof doc.createElement !== 'function') return;
    if (w.__amatlasErrorSurface) return;
    w.__amatlasErrorSurface = true;
    var barEl = null, txtEl = null, attached = false;
    function show(msg) {
      try {
        if (!barEl) {
          barEl = doc.createElement('div'); barEl.id = 'amatlas-error-banner'; barEl.className = 'amatlas-error-banner';
          txtEl = doc.createElement('span'); txtEl.className = 'amatlas-error-text'; barEl.appendChild(txtEl);
          var x = doc.createElement('button'); x.className = 'amatlas-error-close'; x.textContent = '✕';
          x.onclick = function () { attached = false; if (barEl.parentNode) barEl.parentNode.removeChild(barEl); };
          barEl.appendChild(x);
          var st = doc.createElement('style'); st.id = 'amatlas-error-style';
          st.textContent = ':where(.amatlas-error-banner){position:fixed;top:0;left:0;right:0;z-index:9999;background:#7f1d1d;color:#fee2e2;font:14px/1.5 system-ui,sans-serif;padding:10px 40px 10px 14px;box-shadow:0 2px 8px rgba(0,0,0,.5)}\n:where(.amatlas-error-close){position:absolute;right:8px;top:8px;background:none;border:none;color:#fee2e2;cursor:pointer;font-size:14px}';
          (doc.head || doc.documentElement).appendChild(st);
        }
        if (!attached) { attached = true; (doc.body || doc.documentElement).appendChild(barEl); }   // 首次/被 ✕ 关过 → (再)现身
        txtEl.textContent = '⚠ 游戏出了一个错:' + msg + ' —— 此前进度已自动存档;请把这句话原样发回给 Claude Code(或游戏作者)修复。';
      } catch (e) { /* 错误面自身吞错 */ }
    }
    w.addEventListener('error', function (ev) { show((ev && ev.message) || String((ev && ev.error) || '未知错误')); });
    w.addEventListener('unhandledrejection', function (ev) { var r = ev && ev.reason; show((r && r.message) || String(r)); });
  }

  function boot(world, manifest) {
    manifest = manifest || {};
    var A = global.Amatlas;
    if (!A || typeof A.createEngine !== 'function')
      throw new Error('[amatlas] boot:找不到 Amatlas.createEngine —— boot 是 preset 层,必须在 core/runtime/engine-core.js 之后加载。');

    var bootDoc = manifest.document !== undefined ? manifest.document : (typeof document !== 'undefined' ? document : undefined);
    if (manifest.errorBanner !== false) installErrorSurface(bootDoc);   // 尽早装:连 boot 自身的装配抛错也能呈现给玩家
    // 引擎版本戳打到 console(诊断:端用户报 bug 时一句"console 里 Amatlas 那行写什么"即知包是否陈旧;见 engine-core ATLAS_VERSION)
    if (typeof console !== 'undefined' && console.log && A.VERSION) console.log('[amatlas] engine ' + A.VERSION);

    // 隐私模式/禁 cookie 下连 `typeof localStorage` 求值都抛 SecurityError(getter 抛)——包 try/catch
    //   降级 null(与 save.js 插件层同款防御);显式 manifest.storage(含 null=关持久化)原样尊重。
    var storage = manifest.storage;
    if (storage === undefined) { try { if (typeof localStorage !== 'undefined') storage = localStorage; } catch (e) { storage = null; } }
    // 核心是游戏身份/存档 namespace 的单一真相:默认从必填 world.id 派生；manifest.saveKey 仅显式 override。
    var engineOpts = { storage: storage };
    if (manifest.saveKey !== undefined) engineOpts.saveKey = manifest.saveKey;
    var engine = A.createEngine(world, engineOpts);
    var gameKey = engine.saveKey;                  // 插件继承核心最终 key,不在 boot 再猜/哈希一份。
    // 呈现器/插件默认 opts:document 统一透传(manifest.document 承诺"透传"此前只到 DomPresenter=死字段)
    function pdefs(extra) { var d = merge({}, extra || {}); if (bootDoc !== undefined) d.document = bootDoc; return d; }

    // ── 玩法模块:world 用到的内置 kind 自动拉;缺工厂 → fail-loud(消除 round9 漏 use/漏 script 的白屏)──
    //    注:下方 fail-loud 文案刻意【不含脚本标签字面】(尖括号)——boot.js 会被 build 内联进单 HTML,
    //    JS 字符串/注释里若出现脚本结束标签(尖括号加 /script)会提前终止脚本块、破坏页面 → 只用文字描述路径。
    var kinds = collectKinds(world);
    if (kinds.scene) {
      if (!A.TextAdventure) throw new Error('[amatlas] boot:world 有 kind:"scene"(' + kinds.scene + ' 个节点)但未加载文字冒险模块 → 在 index.html 用 script 标签加载 modules/text-adventure/runtime/renderer.js。');
      engine.use(A.TextAdventure.createTextAdventureModule({ status: manifest.status }));
    }
    if (kinds.encounter) {
      if (!A.Tabletop) throw new Error('[amatlas] boot:world 有 kind:"encounter"(' + kinds.encounter + ' 个节点)但未加载跑团模块 → 在 index.html 用 script 标签加载 modules/tabletop/runtime/tabletop.js。');
      engine.use(A.Tabletop.createTabletopModule({ sheet: manifest.sheet, status: manifest.status }));   // status 透传(对称 TextAdventure:115)——否则作者 manifest.status 自定义状态栏在 encounter 节点静默丢失(只剩角色卡默认资源/回合/技能);tabletop 工厂收 opts.status(tabletop.js:163)
    }
    if (kinds.cutscene) {
      if (!A.Cutscene) throw new Error('[amatlas] boot:world 有 kind:"cutscene"(' + kinds.cutscene + ' 个节点)但未加载过场模块 → 在 index.html 用 script 标签加载 modules/cutscene/runtime/cutscene.js。');
      engine.use(A.Cutscene.createCutsceneModule());   // 过场模块 v1 无 opts(beats 全在节点数据里;docs/cutscene-design.md §6 boot 认领=签字项 Q4)
    }
    // 自定义 module(实例;与内置平权,其 nodeKinds 由 start() 预检认领)
    (manifest.modules || []).forEach(function (m) { engine.use(m); });

    // ── 呈现器:dom 必挂(缺=正文/选项无处渲染,给修复指引而非裸 TypeError);svg/audio 默认开但
    //    【宽容】(没加载对应 script=作者没要,跳过);显式 false 关。document 统一透传(测试/嵌入)──
    var present = manifest.present || {};
    if (!A.DomPresenter)
      throw new Error('[amatlas] boot:未加载 DOM 呈现器(正文/选项渲染必需)→ 在 index.html 用 script 标签加载 presenters/present-dom.js(在 engine-core.js 之后、game.js 之前)。');
    engine.use(A.DomPresenter.createDomPresenter({ document: bootDoc }));
    if (present.svg !== false && A.SvgPresenter) engine.use(A.SvgPresenter.createSvgPresenter(merge(pdefs({ slot: '#scene' }), asOpts(present.svg))));
    if (present.audio !== false && A.AudioPresenter) engine.use(A.AudioPresenter.createAudioPresenter(pdefs(asOpts(present.audio))));

    // ── 插件:manifest 显式声明=需求 → 缺工厂【抛】(消除"要了插件但漏 script"的静默);falsy=不挂 ──
    //    saveKey/storage/storageKey/document 默认注入(防 file:// 串档;作者 opts 同名字段优先=escape hatch)。
    //    注册序:achievement 先于 save——两者都订阅 'enter',按序触发;成就 check 先写解锁、autosave
    //    后序列化,:auto 信封才包含本次 enter 解锁的成就(反之则永远少一拍;durable 账本掩盖了大半,
    //    但两份"自动档"内容不一致是真缺口)。minimap 走 addPresenter 纯绘制,序无关。
    var ach = manifest.achievement || (manifest.achievements ? { achievements: manifest.achievements } : null);
    usePlugin(engine, ach, A.AchievementPlugin, 'createAchievementPlugin', '成就', 'plugins/achievement.js', pdefs({ storageKey: gameKey + ':ach', storage: storage }));
    usePlugin(engine, manifest.save, A.SavePlugin, 'createSavePlugin', '存档', 'plugins/save.js', pdefs({ saveKey: gameKey, storage: storage }));
    usePlugin(engine, manifest.minimap, A.MinimapPlugin, 'createMinimapPlugin', '小地图', 'plugins/minimap.js', pdefs({}));
    usePlugin(engine, manifest.reset, A.ResetPlugin, 'createResetPlugin', '重开', 'plugins/reset.js', pdefs({}));   // ↻ 工具栏按钮(治模板那个 fixed 飘 reset);未声明=不挂(向后兼容老游戏自己写 <button id=reset>)

    // ── 额外手挂(escape hatch:manifest 表达不了的合法装配)──
    (manifest.use || []).forEach(function (p) { engine.use(p); });

    engine.start();   // 复用 start() 已有的 kind 预检:任何 world kind 漏 module → 抛(boot 自动拉已尽量避免)
    return engine;    // escape hatch:可继续 use / 抓按钮 / 挂 window._engine 等
  }

  function usePlugin(engine, decl, ns, factory, label, script, defaults) {
    if (!decl) return;                                        // 未声明 = 不挂(不是 bug)
    if (!ns) throw new Error('[amatlas] boot:manifest 要了「' + label + '」插件,但未加载 ' + script + ' → 在 index.html 用 script 标签加载它。');
    engine.use(ns[factory](merge(defaults || {}, asOpts(decl))));   // defaults 先、作者 opts 后=作者优先
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { boot: boot };
  else (global.Amatlas = global.Amatlas || {}).boot = boot;
})(typeof globalThis !== 'undefined' ? globalThis : this);
