/* ════════════════════════════════════════════════════════════════════════
   Amatlas 核心内核 (engine-core) — 类型无关 · 零依赖 · DOM-free
   ════════════════════════════════════════════════════════════════════════
   契约见 ../module-interface.md。核心 = 数据驱动状态机 + 地图结构 + 回合循环
   + render/action dispatch + 服务(RNG/时钟/事件总线)+ 存档。呈现交模块。

   设计依据(均已查证):
   · MVU / Elm Architecture · Redux:View=f(State),输入=Update(action,state)。
     我们是回合制(非实时帧)→ 不受"纯 reducer 在实时下吃力"之限;级联效应走事件总线。
   · Game Programming Patterns (Nystrom):Action=Command;事件总线用同步 Observer
     而非 Event Queue(只有需要"在时间上解耦"才用队列,回合制不需要)。
   · mulberry32:微型可种子 PRNG;把演进中的 32-bit 累加器存进 state → 存档可精确复现。
   · Twine/SugarCube 实践:file:// 下 localStorage 不可靠 → 必须有"导出存档码/文件"兜底。

   核心刻意不碰 DOM:render 把"呈现无关的视图描述"广播给已注册的 presenters(opts.onRender 为兼容入口);
   这样内核可在纯 node 下测试(jsdom 留给模块的 HTML 渲染层)。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  // S11-b-ex 统一命名空间:核心 API 与模块/呈现器/插件**同挂一个 `Amatlas` 全局**——
  //   原 `AtlasCore` 双全局已删。弱模型的直觉是 `Amatlas.createEngine`(diagnosis M1 头号崩溃);
  //   单一命名空间也对齐 three.js/PIXI 等惯例。node 路径(module.exports)不变 → require 测试不受影响。
  //   本分支仅浏览器;**核心算法逻辑不在此处**(见下 factory 体)。
  else { var _core = factory(); var _A = (global.Amatlas = global.Amatlas || {}); _A.createEngine = _core.createEngine; _A.SAVE_VERSION = _core.SAVE_VERSION; _A.VERSION = _core.VERSION; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var SAVE_VERSION = 2;
  // 引擎版本戳(易用性审计批):下面那行的占位符由 package-engine.sh 打包时 sed 注入「提交哈希 + 日期」
  //   (子树 git archive 不支持 export-subst,已实测——故走打包后注入,见 package-engine.sh)。dev 仓库里占位符
  //   原样保留 → 归一为 'dev'(优雅、不破 require/测试)。诊断价值:端用户报 bug 时一句「Amatlas.VERSION 是多少 / dist 顶部注释」
  //   即知其包是否陈旧(根治 round9「包内嵌旧引擎拷贝、修复没送达、诊断绕一整轮」)。surface:boot 启动 console.log
  //   + build HTML 头注释 + graph-audit/probe 报告头。注:占位符 token 只出现在下一行(sed 注入/残留校验靠它定位)。
  var AMATLAS_VERSION = '0.1.2';
  if (AMATLAS_VERSION.charAt(0) === '_') AMATLAS_VERSION = 'dev';   // 未注入(dev 工作树)→ dev

  function createEngine(world, opts) {
    opts = opts || {};

    // v24:world.id 是跨版本稳定的游戏身份。不能再从可变图结构/标题/路径猜身份——两款同骨架游戏
    // 会碰撞、同一游戏改内容又会换键。UUID v4 由作者创建游戏时生成一次；显式 saveKey 只作嵌入/迁移逃生口。
    var WORLD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!world || typeof world.id !== 'string' || !WORLD_ID_RE.test(world.id)) {
      throw new Error('[amatlas] world.id 必须是 UUID v4 字符串(每款游戏生成一次并长期保持;复制 demo 做新游戏时换新 UUID)。运行 node -e "console.log(require(\'crypto\').randomUUID())" 生成。');
    }
    var SAVE_KEY;
    if (opts.saveKey !== undefined) {
      if (typeof opts.saveKey !== 'string' || !opts.saveKey.trim()) throw new Error('[amatlas] opts.saveKey 必须是非空字符串;省略则由 world.id 安全派生。');
      SAVE_KEY = opts.saveKey;
    } else {
      SAVE_KEY = 'amatlas:game:' + world.id.toLowerCase();
    }

    // 原始种子(reset 用);live 累加器存在 state.rngSeed 里,随档走。
    // fail-loud(§6b 对称接缝:全引擎对 initState/requires/run/available 都 fail-loud,独漏 seed):
    //   非整数 seed 会被 >>>0 静默截断("x"/3.7/{}→0)→ 破坏「同种子可复现」这条核心保证,且是 AI 作者最易犯的错。
    var seedSrc = (opts.seed != null ? opts.seed : (world.seed != null ? world.seed : 0x9E3779B9));
    if ((opts.seed != null || world.seed != null) && (typeof seedSrc !== 'number' || !isFinite(seedSrc) || Math.floor(seedSrc) !== seedSrc)) {
      throw new Error('[amatlas] world.seed / opts.seed 必须是有限整数,收到 ' + JSON.stringify(seedSrc) + ':非整数会被 >>>0 静默截断/归零 → 破坏「同种子可复现」。省略该字段=用默认种子;要显式种子请给整数。');
    }
    var initialSeed = (seedSrc >>> 0);
    // S8.5:呈现器由单数 present 改为可叠加的 presenters[](多呈现目标:文字/SVG/音频…)。
    //       opts.onRender 仍兼容——被推入 presenters[0],旧式单数用法行为完全不变(契约 §4.6)。
    var presenters = [];
    if (typeof opts.onRender === 'function') presenters.push(opts.onRender);
    // storage 默认值包 try/catch:隐私模式/禁 cookie 下连 `typeof localStorage` 求值都抛 SecurityError
    //   (getter 抛,非 undefined)——save.js:49 插件层早已防御,这里是同坑的核心侧。另:显式
    //   `storage: null`(关持久化的合法逃生口)不得被 || 吞掉落回 localStorage,故用 !== undefined 判。
    var storage = (opts.storage !== undefined) ? opts.storage
      : (function () { try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; } })();
    var clockUnit = opts.clockUnit || 'turn';

    var modules = [];
    var kindIndex = Object.create(null);   // node.kind -> module
    var listeners = Object.create(null);   // event type -> [{fn,isObserver}]；自定义事件名含 __proto__ 也安全
    var pluginIds = Object.create(null);   // S8.5:已 use 的插件 id -> 次数(仅用于重复告警/调试,不阻断)
    var state;            // 唯一真相(见 module-interface.md 三)

    /* ── 状态 ─────────────────────────────────────────────────────────── */
    function freshState() {
      var s = {
        pos: { map: world.start.map, node: world.start.node },
        clock: { unit: clockUnit, t: 0 },
        rngSeed: initialSeed,   // live 32-bit 累加器(序列化 → 同档复现)
        seen: {},               // 'map/node' -> 到访计数(记忆;首次/重访由它判定)
        flags: {},              // 通用布尔事实
        _once: {}               // 已消耗的一次性动作 id
        // 模块组件(sheet/dice/inventory…)运行时直接挂到 state 上,核心只负责序列化
      };
      // v5 声明式初始状态:把 world.initState 的自定义字段浅合并进来,给"自定义状态"一个正确出口——
      //   对齐 Ink 的 `VAR x = 初值`(顶部声明,引擎留 default globals 字典)/ Twine SugarCube 的 StoryInit。
      //   否则作者只能在 run 里首次赋值,极易写出 `S.stamina -= 1` 而 stamina 从未初始化 → undefined-1 = NaN
      //   → 此后所有 `S.stamina >= 1` 门控恒 false → soft-lock(S11-b showcase 实测的根因)。
      //   规则:引擎拥有的字段(pos/clock/rngSeed/seen/_once)不可被覆盖;flags 做一层合并;
      //        其余自定义键深拷挂上(深拷避免与 world 共享引用,reset 后仍是干净初值)。初始状态是纯数据,JSON 深拷安全。
      var init = world.initState;
      // fail-loud:initState 必须是纯数据对象。写成函数(命令式直觉 `initState:(S)=>({hp:3})` / `initState(){…}`)或数组 →
      //   typeof 非 'object'(或是数组)被下面静默跳过 → **所有声明的初始字段丢失** → 随后 `S.hp-1`=NaN、门控恒 false soft-lock
      //   (这正是 initState 功能本要根治的事故,却因"写成函数"绕过它 → 必须 fail-loud)。
      if (init != null && (typeof init !== 'object' || Array.isArray(init))) {
        throw new Error('[amatlas] world.initState 必须是纯数据对象 {键:初值},收到 ' + (typeof init === 'function' ? '函数' : (Array.isArray(init) ? '数组' : typeof init)) + ':写成函数/数组会被静默忽略 → 初始字段全丢、随后 S.x-1=NaN 门控恒 false 卡死。动态初值请在节点 run/event 里写。');
      }
      if (init && typeof init === 'object') {
        var RESERVED = { pos: 1, clock: 1, rngSeed: 1, seen: 1, _once: 1 };
        for (var k in init) {
          if (!Object.prototype.hasOwnProperty.call(init, k) || RESERVED[k]) continue;
          if (k === 'flags' && init.flags && typeof init.flags === 'object') {
            for (var f in init.flags) if (Object.prototype.hasOwnProperty.call(init.flags, f)) s.flags[f] = init.flags[f];
          } else {
            s[k] = JSON.parse(JSON.stringify(init[k]));
          }
        }
      }
      return s;
    }

    /* ── 地图图结构访问(核心拥有"地图")──────────────────────────────── */
    function mapAt(p) { return world.maps[p.map]; }
    function nodeAt(p) { var m = world.maps[p.map]; return m && m.nodes[p.node]; }
    function resolveRef(to, fromMap) {
      return (typeof to === 'string') ? { map: fromMap, node: to } : { map: to.map, node: to.node };
    }
    function visits(ref) { var p = ref || state.pos; return state.seen[p.map + '/' + p.node] || 0; }
    function firstTime(ref) { return visits(ref) <= 1; }

    /* ── Dispatch:模块注册 + 按 node.kind 路由 ───────────────────────── */
    function registerModule(mod) {
      var kinds = mod.nodeKinds || [];
      // node.kind 所有权必须唯一。先完整预检、再写 modules/kindIndex/systems/init：否则后注册模块会
      // 抢走 render/actions 路由，旧模块 system 却仍在运行，形成两个模块共同驱动同一 kind 的 split-brain。
      var declared = Object.create(null);
      for (var i = 0; i < kinds.length; i++) {
        var k = kinds[i];
        if (Object.prototype.hasOwnProperty.call(declared, k)) {
          throw new Error('[amatlas] 模块 "' + (mod.id || '(未命名)') + '" 的 nodeKinds 重复声明 kind="' + k + '"');
        }
        declared[k] = 1;
        var owner = Object.prototype.hasOwnProperty.call(kindIndex, k) ? kindIndex[k] : null;
        if (owner) {
          throw new Error('[amatlas] node.kind="' + k + '" 已由模块 "' + (owner.id || '(未命名)') + '" 认领，模块 "' + (mod.id || '(未命名)') + '" 不能重复认领');
        }
      }
      // fail-loud:认领了 kind 却既无 render 也无 actions → 该 kind 节点静默空渲染、作者拿不到信号。
      if (kinds.length && typeof mod.render !== 'function' && typeof mod.actions !== 'function') {
        throw new Error('[amatlas] 模块 "' + (mod.id || '(未命名)') + '" 认领了 node.kind=' + kinds.join('/') + ',却既无 render 也无 actions 函数 → 该 kind 的节点会静默空渲染。至少提供 render(state,node) 或 actions(state,node)。');
      }
      var removeSystems = [];
      modules.push(mod);
      kinds.forEach(function (k) { kindIndex[k] = mod; });
      try {
        (mod.systems || []).forEach(function (s, si) {
          // fail-loud(§6b 静默失效家族补齐,R2 二轮红队):system 的 on/run 从不校验 → 事件名拼错(如 'entre')
          //   或忘写 run 时,该 system 永久静默不触发、零错误零警告(non-function run 更阴:仅事件真触发时才抛,
          //   不触发的 system 永远沉默)。与 exits/links/available/requires 同族——注册期即抛,别拖到运行时或永不。
          //   注:事件名是开放词汇(自定义事件),故只能校验"非空字符串"这一形状,不能校验"是否已知事件"。
          if (!s || typeof s.on !== 'string' || !s.on) throw new Error('[amatlas] 模块 "' + (mod.id || '(未命名)') + '" 的 systems[' + si + '].on 必须是非空事件名字符串,收到 ' + (s ? JSON.stringify(s.on) : s) + ':缺失/拼错事件名会让该 system 永久静默不触发(零信号)。');
          if (typeof s.run !== 'function') throw new Error('[amatlas] 模块 "' + (mod.id || '(未命名)') + '" 的 system(on="' + s.on + '")缺少 run 函数(收到 ' + typeof s.run + '):无 run 的 system 不触发时永久静默、触发时才抛「run is not a function」→ 必须提供 run(state,ev)。');
          removeSystems.push(addListener(s.on, function (ev) { s.run(state, ev); }, false));
        });
        if (typeof mod.init === 'function') mod.init(api);
      } catch (e) {
        // 只回滚 registerModule 本轮直接拥有的注册。init 在抛错前自行做的 DOM/storage、api.on/use 等
        // 任意副作用没有通用逆操作，不能伪装成全局事务；模块 init 应先校验、后产生外部副作用。
        for (var r = removeSystems.length - 1; r >= 0; r--) removeSystems[r]();
        kinds.forEach(function (k) { if (kindIndex[k] === mod) delete kindIndex[k]; });
        var mi = modules.lastIndexOf(mod);
        if (mi >= 0) modules.splice(mi, 1);
        throw e;
      }
      return api;
    }

    // S8.5:统一插件入口——玩法/呈现/能力插件都经此注册(对标 Bevy「一切皆插件」:同一 Plugin
    //       入口,不在 API 层区分用途)。形态三收:函数 fn(api) | 对象 {id?, install(api)} |
    //       数组(插件组,借 Bevy PluginGroup)。registerModule 保留为"玩法插件"的便捷特例。
    //       插件做什么完全由它在 install 内的行为决定(调 addPresenter→呈现;订阅 on→能力…)。
    function use(plugin) {
      if (Array.isArray(plugin)) { plugin.forEach(function (p) { use(p); }); return api; }
      var install = (typeof plugin === 'function') ? plugin : (plugin && plugin.install);
      if (typeof install !== 'function') throw new Error('[amatlas] use(plugin):需要函数,或带 install 函数的对象');
      var id = (plugin && typeof plugin === 'object') ? plugin.id : null;
      if (id != null) {
        if (pluginIds[id] && typeof console !== 'undefined' && console.warn) {
          console.warn('[amatlas] 插件 id 重复 use:"' + id + '"(仍会再次 install;如非预期请检查注册)');
        }
        pluginIds[id] = (pluginIds[id] || 0) + 1;
      }
      install(api);   // 把核心 API 交给插件;插件自取所需能力
      return api;     // 链式
    }

    function moduleForNode(node) {
      var mod = node && kindIndex[node.kind];
      if (!mod) throw new Error('[amatlas] 无模块负责 node.kind=' + (node && node.kind));
      return mod;
    }

    // 核心从节点连接(node.exits)默认生成移动动作(本地/跨图传送);模块可增删。
    function defaultMoves(node) {
      return (node.exits || []).map(function (ex, i) {
        // fail-loud(v11 对称穷举:全引擎审计实锤的 fail-silent 接缝):exits 只支持 {to,label,available}。
        //   作者把 links 的字段(requires/run/once/lockHint/showWhenLocked)写到 exit 上是高频直觉(links 就这么用),
        //   旧版静默无视 → requires 锁消失、run 副作用全丢、once 一次性出口变无限——三种都是玩法级静默失效。
        var mis = ['requires', 'run', 'once', 'lockHint', 'showWhenLocked'].filter(function (k) { return ex != null && ex[k] != null; });
        if (mis.length) throw new Error('[amatlas] exit「' + ((ex && ex.label) || (ex && typeof ex.to === 'string' ? ex.to : i)) + '」写了 ' + mis.join('/') + ',但 exits 只支持 {to,label,available} —— 这些是 links 的字段,在 exit 上会被静默忽略(门控失效/副作用丢失/一次性出口变无限)。把这条出口改写进 links:[{to,label,' + mis.join(',') + ',…}](links 与 exits 同为出口,引擎统一处理)。');
        return {
          id: 'move:' + i,
          label: ex.label || (typeof ex.to === 'string' ? ex.to : ex.to.node),
          to: ex.to,
          available: ex.available,
          kind: 'move'
        };
      });
    }

    // links → 动作(选项=状态转移)。**契约 v6:links 与 exits 同为通用「出口/连接」,任何 kind 都可用**
    //   (scene/encounter/…)。原先只有 text-adventure 模块处理 links → encounter 用 links 静默无出口(round7 #5
    //   设计债)。逻辑上移到核心、经 api.linkActions 暴露给所有模块复用 = 单一真相、消除「同概念两名字」接缝。
    //   once 消耗 + available 过滤仍由 view() 统一做;本函数做「锁定显隐」策略(防剧透/灰显)+ 空场景安全网。
    function linkActions(node, state) {
      var out = [], hidden = [];
      (node.links || []).forEach(function (lk, idx) {
        var moving = lk.to != null;
        var id = (lk.id != null ? lk.id : ('link:' + idx));
        // fail-loud(design-principles §6b):requires 门控非函数 = 违约。非函数 → meets 恒 true → 锁静默失效。
        if (lk.requires != null && typeof lk.requires !== 'function') throw new Error('[amatlas] link.requires 必须是 (state)=>bool 函数(链接「' + (lk.label != null ? lk.label : id) + '」),收到 ' + typeof lk.requires + ':写成定值会被静默当"已解锁"→ 门控失效。删掉=无条件,或改成函数。');
        // fail-loud(v11 对称穷举):available 是 exits 的字段;link 的门控是 requires(带 showWhenLocked/lockHint 灰显语义)。
        //   旧版在 :164 给每个 link 注入恒真 available → 作者写的 link.available 被无声顶掉 = 门控静默失效(审计实锤)。
        if (lk.available != null) throw new Error('[amatlas] link「' + (lk.label != null ? lk.label : id) + '」写了 available,但 links 的门控字段是 requires(available 是 exits 的)——它在 link 上会被引擎注入的过滤器覆盖 → 你的门控静默失效。改成 requires:(S)=>bool(可加 showWhenLocked:true + lockHint 灰显)。');
        // fail-loud(§6b 对称缺口:当年修了 requires/available/when 独漏 run):run 写成字符串/表达式 → 静默不执行、改 flag/资源的副作用全丢 → 常致 soft-lock。
        if (lk.run != null && typeof lk.run !== 'function') throw new Error('[amatlas] link.run 必须是 (state)=>void|string 函数(链接「' + (lk.label != null ? lk.label : id) + '」),收到 ' + typeof lk.run + ':写成表达式/字符串会被静默忽略 → 置 flag/扣资源等副作用全丢、常致 soft-lock。改成 (S)=>{ … };返回字符串=本次回应文本(经模块显示,与 event.run 对称)。');
        var meets = (typeof lk.requires !== 'function') || lk.requires(state);
        var kind = moving ? 'move' : 'act';
        if (!meets) {
          var lockedAct = { id: id, label: lk.label, kind: kind, locked: true, lockHint: lk.lockHint || '条件未满足', available: function () { return true; } };
          if (lk.showWhenLocked) out.push(lockedAct);  // 灰显 affordance
          else hidden.push(lockedAct);                 // 默认隐藏(防剧透)
          return;
        }
        out.push({ id: id, label: lk.label, kind: kind, to: lk.to, once: !!lk.once, run: lk.run, available: function () { return true; } });
      });
      // 安全网:无任何可点动作时,把被隐藏的锁定项灰显出来,避免空场景死局。
      // 「无任何可点」按 §4.5 字面语义 = links **和 exits** 都无可点(exits 是核心字段,纯函数内可查):
      //   只看 links 会在「exits 可走、links 全为防剧透隐藏」时误判空场景 → 把作者有意隐藏的选项
      //   灰显出来,泄露其存在性与 lockHint 文案(易用性审计批实跑复现)。
      var clickable = out.some(function (a) { return !a.locked; });
      var exitOk = (node.exits || []).some(function (ex) {
        return ex && ex.to != null && (typeof ex.available !== 'function' || ex.available(state));
      });
      if (!clickable && !exitOk && hidden.length) hidden.forEach(function (a) { out.push(a); });
      return out;
    }

    /* ── 一次性动作消耗账本 ───────────────────────────────────────────── */
    function actionKey(a) {
      return state.pos.map + '/' + state.pos.node + '#' + (a.id != null ? a.id : a.label);
    }
    function consumed(a) { return !!a.once && !!state._once[actionKey(a)]; }

    /* ── 可呈现视图(pull):内容 = f(state)──────────────────────────── */
    function view() {
      var node = nodeAt(state.pos);
      var mod = moduleForNode(node);
      var v = (typeof mod.render === 'function') ? mod.render(state, node) : {};
      var custom = (typeof mod.actions === 'function') ? (mod.actions(state, node) || []) : [];
      // v18:模块可在 View 置 suppressExits=true 标本帧为「结果/模态帧」→ 核心不并入 node.exits 的默认移动,
      //   模块 actions() 即完整动作集。tabletop 检定结果帧(等「继续 →」走到 success.to/fail.to)用它 = 只剩「继续」、
      //   防玩家改点旁路 exit 绕过 fail.to 后果 / 退回去重摇检定。缺省(不写/false)= 现状并入 exits、向后兼容。
      var moves = (v && v.suppressExits) ? [] : defaultMoves(node);
      var acts = moves.concat(custom).filter(function (a) {
        if (consumed(a)) return false;
        // fail-loud(design-principles §6b):available 门控存在但非函数 = 违约(契约 available?:(state)=>bool)。
        //   旧写法 `!a.available || a.available(state)` 会把 `available:false`/字符串这类**定值**静默当"无条件可用"
        //   → 锁形同虚设(showcase 同类沉默陷阱)。非函数即抛,让 AI 立刻得到反馈;缺省(null)仍宽容=无条件。
        if (a.available == null) return true;
        if (typeof a.available !== 'function') throw new Error('[amatlas] action.available 必须是 (state)=>bool 函数(动作「' + (a.label != null ? a.label : a.id) + '」),收到 ' + typeof a.available + ':写成定值会被静默当"无条件可用"→ 门控失效。删掉该字段=无条件,或改成函数。');
        return a.available(state);
      });
      return { view: v, actions: acts, pos: { map: state.pos.map, node: state.pos.node }, nodeKind: node.kind };
    }

    /* ── 回合循环:进入节点 ───────────────────────────────────────────── */
    function enter(ref) {
      var target = nodeAt(ref);
      if (!target) throw new Error('[amatlas] 死链:目标节点不存在 ' + ref.map + '/' + ref.node);
      state.pos = { map: ref.map, node: ref.node };
      var key = ref.map + '/' + ref.node;
      state.seen[key] = (state.seen[key] || 0) + 1;   // 必须在 render/事件前 +1,firstTime 才准
      emit('enter', { pos: { map: ref.map, node: ref.node }, node: target, first: firstTime() });
      render();
      saveLocal();
    }

    /* ── 回合循环:执行动作(= 状态转移,Command 模式)──────────────── */
    function apply(action) {
      if (typeof action.run === 'function') action.run(state);   // 改 state(flag/组件/clock…);v21:run 先于消耗 once
      if (action.once) state._once[actionKey(action)] = 1;       // v21:run 成功**后**才消耗 once = 原子(run 抛 → 上面抛、此行不执行 → once 不消耗 → 动作可重点;对齐 Twine/Ink。run 成功路径与旧版逐字等价:once 仍在 emit/move 前设)
      emit('action', { action: action });
      if (action.to) enter(resolveRef(action.to, state.pos.map)); // 有 to → 移动
      else { render(); saveLocal(); }                            // 纯动作 → 原地重渲染(不重复 +1 计数)
    }

    // S8.5:注册一个呈现器(View 快照的消费者)。返回 remove() 以便 teardown(呼应 on() 返回 off())。
    //       不在此处立即渲染——约定"先 use/addPresenter,后 start";start 的首次 render 会广播给已注册者。
    function addPresenter(fn) {
      if (typeof fn !== 'function') throw new Error('[amatlas] addPresenter:需要函数');
      presenters.push(fn);
      return function remove() {
        var i = presenters.indexOf(fn);
        if (i >= 0) presenters.splice(i, 1);
      };
    }

    // S8.5:计算一次 View 快照,按注册顺序广播给所有 presenter(各自取所需字段:文字读 body、
    //       SVG 读 scene、音频读 audio——不同渲染目标,互不覆盖)。无 presenter 时直接返回,
    //       保持旧"无呈现器=不在 render 时触发 view() 分派"语义(契约/lesson ⑪),
    //       也避免 logic-only 引擎被迫 dispatch。
    function render() {
      if (!presenters.length) return;
      var snap = view();
      // per-presenter 隔离:一个呈现器抛错不得拖死其余呈现器,也不得让 enter/apply 里随后的
      //   saveLocal 被跳过(否则=呈现层 bug 连坐自动存档,玩家进度静默丢失)。fail-loud 保留:
      //   console.error 每次都报、不去重——呈现器持续抛错应当持续可见,作者期靠静态闸抓根因。
      for (var i = 0; i < presenters.length; i++) {
        try { presenters[i](snap); }
        catch (e) {
          if (typeof console !== 'undefined' && console.error) console.error('[amatlas] 呈现器 #' + i + ' 抛错(已隔离,其余呈现器/自动存档不受影响):', e);
        }
      }
    }

    /* ── 服务:可种子 RNG(mulberry32);累加器在 state → 同档复现 ───── */
    function rng() {
      state.rngSeed = (state.rngSeed + 0x6D2B79F5) | 0;   // 掩到 32-bit,避免浮点漂移、利于序列化
      var t = state.rngSeed >>> 0;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function dice(n, sides) {
      n = n || 1; sides = sides || 6;
      var sum = 0;
      for (var i = 0; i < n; i++) sum += 1 + Math.floor(rng() * sides);
      return sum;
    }

    /* ── 服务:时钟(单调只增 → 时间性 beat 天然只触发一次)─────────── */
    var clock = {
      advance: function (d) {
        var step = arguments.length ? d : 1;
        if (typeof step !== 'number' || !isFinite(step) || step < 0) {
          throw new Error('[amatlas] clock.advance(d):d 必须是有限非负数字；省略参数表示 +1');
        }
        var result = state.clock.t + step;
        if (!isFinite(result)) throw new Error('[amatlas] clock.advance(d):相加结果必须仍是有限数字');
        state.clock.t = result;
        return result;
      }
    };
    Object.defineProperty(clock, 't', { get: function () { return state.clock.t; }, enumerable: true });

    /* ── 服务:同步事件总线(Observer;非队列)────────────────────────── */
    function addListener(type, fn, isObserver) {
      var entry = { fn: fn, isObserver: isObserver };
      (listeners[type] || (listeners[type] = [])).push(entry);
      return function () { removeListener(type, entry); };
    }
    function removeListener(type, entry) {
      var a = listeners[type]; if (!a) return;
      var i = a.indexOf(entry); if (i >= 0) a.splice(i, 1);
    }
    function on(type, fn) {
      if (typeof fn !== 'function') throw new Error('[amatlas] on(type,fn):fn 必须是函数');
      return addListener(type, fn, true);
    }
    function off(type, fn) {
      var a = listeners[type]; if (!a) return;
      for (var i = 0; i < a.length; i++) {
        if (a[i].fn === fn) { a.splice(i, 1); return; }
      }
    }
    function emit(type, payload) {
      // 公共 api.on 注册的是 Observer，不拥有中止核心状态转移的权力。逐个隔离，避免 action.run/pos/seen
      // 已提交后，某个旁听者截断后续 observer、render 与 saveLocal，形成“内存已前进、画面/磁盘仍在旧处”。
      // 模块 systems 则是玩法事务参与者：它们可能改变 state，契约错误必须同步抛出，不能降级成旁听错误。
      // 不伪造全局回滚：任何 listener 已做的 DOM/storage 副作用不可逆；这里只隔离公共 observer。
      var snapshot = (listeners[type] || []).slice();
      for (var i = 0; i < snapshot.length; i++) {
        var entry = snapshot[i];
        if (!entry.isObserver) {
          entry.fn(payload);
          continue;
        }
        try { entry.fn(payload); }
        catch (e) {
          if (typeof console !== 'undefined' && console.error) console.error("[amatlas] observer '" + type + "' #" + (i + 1) + ' 抛错(已隔离,核心状态转移/后续 observer/render/save 继续):', e);
        }
      }
    }

    // restore 是核心拥有的 tentative 生命周期，不经公共 emit：observer 不能看到未提交候选 state，
    // 也不能把 critical 资源启停错误隔离成“读档成功”。补偿阶段则继续后续 system，避免前一个
    // 清理器抛错后，真正持有 rAF/canvas/listener 的模块永远收不到 teardown。
    function runCritical(type, payload) {
      var snapshot = (listeners[type] || []).slice();
      for (var i = 0; i < snapshot.length; i++) {
        if (!snapshot[i].isObserver) snapshot[i].fn(payload);
      }
    }
    function runCriticalBestEffort(type, payload, errors) {
      var snapshot = (listeners[type] || []).slice();
      for (var i = 0; i < snapshot.length; i++) {
        if (snapshot[i].isObserver) continue;
        try { snapshot[i].fn(payload); }
        catch (e) { errors.push(e); }
      }
    }

    /* ── 存档 / 读档 / 导出兜底 ───────────────────────────────────────── */
    // v2 信封绑定 world.id：localStorage key 隔离不了手工导入码；没有 gameId 时，
    // 两款同骨架游戏可互灌 flags/_once。身份绑定 world 而非可覆盖 saveKey，
    // 保持同一游戏换嵌入槽位后仍能导入自己的便携档。
    var GAME_ID = world.id.toLowerCase();
    function serialize() { return JSON.stringify({ v: SAVE_VERSION, gameId: GAME_ID, state: state }); }
    function hydrate(data) {
      var s = freshState();
      // 拷贝存档自定义键时跳过原型污染键(R2 二轮 P2):JSON.parse 会把 "__proto__" 造成 data.state 的**自有**键,
      //   而 `s[k]=v` 对 k='__proto__'(或 constructor/prototype)会触发原型 setter、篡改候选 state 的原型链
      //   (importCode/load 是外部输入,可用普通存档码注入)。爆炸半径限于该 state 对象、不污染全局 Object.prototype,
      //   但与 :74-76 的 Object.create(null) 防御口径一致——只搬纯数据键,不让外部档改原型链。
      if (data && data.state) for (var k in data.state) if (Object.prototype.hasOwnProperty.call(data.state, k)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        s[k] = data.state[k];
      }
      if (!s.pos || !nodeAt(s.pos)) s.pos = { map: world.start.map, node: world.start.node };  // 坏档兜底
      return s;   // 候选 state；只有 hydrate + render 全成功后才留任，失败由 load 事务恢复旧引用。
    }
    // load/loadLocal:只 hydrate + 重渲染,绝不 enter(否则会把"读档"误记成一次新到访,污染 seen)。
    // design-principles §6b:旧版空 catch 把一切吞成"读档/存档失败"——坏档(非法 JSON / setItem 环境问题)是
    //   预期内、静默兜底;但**合法数据却在 hydrate/render/serialize 抛错 = world/模块代码 bug**,吞掉会误导作者。
    //   故拆开:解析失败 = 坏档静默;解析后抛错 = warn 到 console(P1,不崩——读档失败仍是合法运行时分支)。
    var saveWarned = false;
    function warn(msg) { if (typeof console !== 'undefined' && console.warn) console.warn(msg); }
    // v11 坏档形状校验(全引擎红队实锤:{v:999, clock:{t:'坏数据'}} 旧版 load 返回 true、SAVE_VERSION 只写不读、
    //   字符串经 advance 拼接蔓延进运行时算术且零警告)。版本不识 / 引擎自有字段形状非法 = 坏档(load 的合法
    //   失败分支:warn + 返回 false、当前状态不动);只校验引擎自有字段,world 自定义键照旧宽容(开放词汇)。
    function badShape(data) {
      if (!data || typeof data !== 'object' || !data.state || typeof data.state !== 'object' || Array.isArray(data.state)) return '缺 state';
      if (data.v !== SAVE_VERSION) return '版本不识 v=' + data.v;
      if (typeof data.gameId !== 'string' || !WORLD_ID_RE.test(data.gameId)) return '缺/坏 gameId';
      if (data.gameId.toLowerCase() !== GAME_ID) return '存档属于另一款游戏 gameId=' + data.gameId;
      var st = data.state;
      if (st.pos === null || (st.pos !== undefined && (typeof st.pos !== 'object' || Array.isArray(st.pos) || typeof st.pos.map !== 'string' || !st.pos.map || typeof st.pos.node !== 'string' || !st.pos.node))) return 'pos 形状非法';
      if (st.clock === null || (st.clock !== undefined && (typeof st.clock !== 'object' || Array.isArray(st.clock) || !Object.prototype.hasOwnProperty.call(st.clock, 't') || st.clock.t === null || typeof st.clock.t !== 'number' || !isFinite(st.clock.t) || st.clock.t < 0))) return 'clock 形状非法';
      if (st.seen === null || (st.seen !== undefined && (typeof st.seen !== 'object' || Array.isArray(st.seen)))) return 'seen 形状非法';
      if (st.seen) for (var seenKey in st.seen) if (Object.prototype.hasOwnProperty.call(st.seen, seenKey)) {
        var seenCount = st.seen[seenKey];
        if (typeof seenCount !== 'number' || !isFinite(seenCount) || seenCount < 0) return 'seen 计数非法';
      }
      if (st.flags === null || (st.flags !== undefined && (typeof st.flags !== 'object' || Array.isArray(st.flags)))) return 'flags 形状非法';
      if (st._once === null || (st._once !== undefined && (typeof st._once !== 'object' || Array.isArray(st._once)))) return '_once 形状非法';
      // v11 对称接缝补齐(R2 二轮红队实锤):rngSeed 与 clock.t/seen 同为引擎自有数值字段,却独漏 isFinite/整数检查——
      //   合法 JSON `1e400`→Infinity(或非整数 3.7)能通过校验混入 state,首次 rng() 里 `(Infinity|0)`/`(3.7|0)` 被 ToInt32
      //   静默改写 → RNG 累加器无声清零/漂移、破坏「同档复现」这条核心保证(clock.t/seen 早已挡 Infinity,rngSeed 是漏网兄弟)。
      //   对齐构造期 :58(isFinite + Math.floor)。注:rngSeed 是有符号 int32(rng 的 `|0` 可产生负值),故**不加 ≥0**(与 clock.t/seen 计数语义不同)。
      if (st.rngSeed === null || (st.rngSeed !== undefined && (typeof st.rngSeed !== 'number' || !isFinite(st.rngSeed) || Math.floor(st.rngSeed) !== st.rngSeed))) return 'rngSeed 形状非法';
      return null;
    }
    function endpointFor(s) {
      if (!s || !s.pos) return null;
      var node = nodeAt(s.pos);
      if (!node) return null;
      return {
        pos: { map: s.pos.map, node: s.pos.node },
        node: node,
        kind: node.kind
      };
    }
    function restorePayload(phase, source, rollback, from, to, current) {
      return {
        phase: phase,
        source: source,
        rollback: !!rollback,
        from: from,
        to: to,
        current: current
      };
    }
    function restoreCandidate(data, source, writeBack) {
      var previousState = state;
      var previousEndpoint = endpointFor(previousState);
      var candidate;
      try { candidate = hydrate(data); }
      catch (prepareError) {
        warn('[amatlas] ' + source + ':存档是合法 JSON 但 hydrate 抛错(疑似 world/模块问题)— ' + (prepareError && prepareError.message));
        return false;
      }
      var candidateEndpoint = endpointFor(candidate);
      var activeState = previousState;
      var activeEndpoint = previousEndpoint;
      try {
        if (previousState) {
          runCritical('restore', restorePayload('deactivate', source, false, previousEndpoint, candidateEndpoint, previousEndpoint));
        }
        state = candidate;
        activeState = candidate;
        activeEndpoint = candidateEndpoint;
        runCritical('restore', restorePayload('activate', source, false, previousEndpoint, candidateEndpoint, candidateEndpoint));
        render();
        if (writeBack && !saveLocal()) throw new Error('自动续档回写失败');
        return true;
      } catch (e) {
        var compensationErrors = [];
        if (activeState) {
          state = activeState;
          runCriticalBestEffort('restore', restorePayload('deactivate', source, true, candidateEndpoint, previousEndpoint, activeEndpoint), compensationErrors);
        }
        state = previousState;
        if (previousState) {
          runCriticalBestEffort('restore', restorePayload('activate', source, true, candidateEndpoint, previousEndpoint, previousEndpoint), compensationErrors);
          try { render(); } catch (rollbackRenderError) { compensationErrors.push(rollbackRenderError); }
        }
        var suffix = compensationErrors.length
          ? '；补偿错误:' + compensationErrors.map(function (x) { return x && x.message; }).join(' | ')
          : '';
        warn('[amatlas] ' + source + ':恢复生命周期失败，已回滚旧状态— ' + (e && e.message) + suffix);
        return false;
      }
    }
    function loadWithSource(str, source) {
      var data;
      try { data = JSON.parse(str); } catch (e) { return false; }              // 非法 JSON = 坏档,静默兜底
      var bad = badShape(data);
      if (bad) {
        warn('[amatlas] ' + source + ':坏档已忽略(' + bad + '),当前状态未动。');
        emit('save-rejected', { source: source, reason: bad });   // 可选事件:自动续档静默重开,呈现层可据此提示玩家
        return false;
      }
      // load/importCode 成功必须回写自动续档裸键:否则读手动槽/导入码后不做动作就刷新，
      // 刚恢复的进度会静默回滚。loadLocal 已经读的是裸键，不重复写同一值。
      return restoreCandidate(data, source, source !== 'loadLocal');
    }
    function load(str) { return loadWithSource(str, 'load'); }
    function loadLocal() {
      if (!storage) return false;
      var raw;
      try { raw = storage.getItem(SAVE_KEY); } catch (e) { return false; }      // storage 读失败(隐私模式)= 环境问题
      if (!raw) return false;
      return loadWithSource(raw, 'loadLocal');
    }
    function saveLocal() {
      if (!storage) return true;   // 明确禁用/不可用 storage 时，load 仍可作为纯内存操作成功
      try { storage.setItem(SAVE_KEY, serialize()); return true; }
      catch (e) {                                                               // setItem 失败(quota/隐私)= 环境问题、serialize 抛 = 代码 bug;warn 一次防每帧刷屏
        if (!saveWarned) { saveWarned = true; warn('[amatlas] saveLocal 失败(存档未持久化;quota/隐私模式,或 serialize 抛错)— ' + (e && e.message)); }
        return false;
      }
    }
    function exportCode() { return b64encode(serialize()); }     // 存档码(可粘贴/可存文件)
    function importCode(code) {
      try { return loadWithSource(b64decode(code), 'importCode'); }
      catch (e) { return false; }   // 玩家输入的坏 base64/UTF-8 是坏档分支，不升级成全局运行时崩溃
    }
    function reset() {
      if (storage) { try { storage.removeItem(SAVE_KEY); } catch (e) {} }
      state = freshState();
      enter({ map: state.pos.map, node: state.pos.node });
    }

    function b64encode(s) {
      if (typeof btoa !== 'undefined') return btoa(unescape(encodeURIComponent(s)));
      return Buffer.from(s, 'utf8').toString('base64');
    }
    function b64decode(c) {
      if (typeof atob !== 'undefined') return decodeURIComponent(escape(atob(c)));
      return Buffer.from(c, 'base64').toString('utf8');
    }

    /* ── 启动 ─────────────────────────────────────────────────────────── */
    function start() {
      // design-principles §6b:未知 kind 旧版只在"走到该节点"才抛(moduleForNode 惰性)→ 起点对、深处节点 kind 拼错则深处才崩,
      //   弱模型/探针自动游玩可能走不到。启动即预检"所有 world 节点的 kind 都有模块认领",缺则立刻抛(探针 boot 阶段就抓到)。
      var unclaimed = Object.create(null);
      for (var mapId in world.maps) {
        if (!Object.prototype.hasOwnProperty.call(world.maps, mapId)) continue;
        var nodes = (world.maps[mapId] && world.maps[mapId].nodes) || {};
        for (var nodeId in nodes) {
          if (!Object.prototype.hasOwnProperty.call(nodes, nodeId)) continue;
          var k = nodes[nodeId] && nodes[nodeId].kind;
          if (!kindIndex[k]) unclaimed[k] = (unclaimed[k] || 0) + 1;
        }
      }
      var miss = Object.keys(unclaimed);
      if (miss.length) throw new Error('[amatlas] start:以下 node.kind 没有模块认领(先 use(create<Module>()) 注册对应模块再 start)— '
        + miss.map(function (k) { return "'" + k + "'×" + unclaimed[k]; }).join(', '));
      if (!loadLocal()) { state = freshState(); enter({ map: state.pos.map, node: state.pos.node }); }
      return api;
    }

    var api = {
      world: world,
      registerModule: registerModule,
      use: use, addPresenter: addPresenter,   // S8.5:统一插件入口 + 多呈现器
      start: start, enter: enter, apply: apply, view: view, reset: reset,
      firstTime: firstTime, visits: visits, linkActions: linkActions,
      rng: rng, dice: dice, clock: clock,
      on: on, off: off, emit: emit,
      serialize: serialize, load: load, loadLocal: loadLocal, saveLocal: saveLocal,
      exportCode: exportCode, importCode: importCode
    };
    Object.defineProperty(api, 'state', { get: function () { return state; }, enumerable: true });
    Object.defineProperty(api, 'saveKey', { value: SAVE_KEY, enumerable: true, writable: false, configurable: false });
    return api;
  }

  return { createEngine: createEngine, SAVE_VERSION: SAVE_VERSION, VERSION: AMATLAS_VERSION };
});
