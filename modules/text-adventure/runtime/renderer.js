/* ════════════════════════════════════════════════════════════════════════
   Amatlas 文字冒险模块 · 渲染器 (text-adventure/runtime/renderer.js)
   ════════════════════════════════════════════════════════════════════════
   实现 ../../core/module-interface.md 契约:为 node.kind='scene' 提供
   render / actions / systems。**DOM-free**:render 只产出"呈现无关"的 View
   (由 present-dom.js 等"呈现目标"画成 DOM)。零依赖。

   抽取自 world-engine.html 的呈现语义(S3 = 抽取+抽象,非重写):
   · look   —— 内容=f(状态):字符串 / {first,return}(首次·重访)/ (state)=>string
   · links  —— 选项=状态转移:移动(to)/ 纯动作 / once 消耗 / requires 解锁
                / showWhenLocked 灰显 affordance / lockHint
   · events —— 进入节点自动触发的 beat:when 门控 + once 消耗(随档)
   · status —— 状态条(所在地 + 可选的模块/世界自定义位)

   与 world-engine 的一处**有意差异**(更精确,非回归):核心的纯动作"原地重渲染、
   不再 enter"(不重复 +1 访问计数)→ 纯动作后 look 仍按"首次"渲染,直到真正离开再回来;
   而旧 world-engine 把纯动作实现成"重进当前节点",会顺带把 seen +1、把 look 翻成"重访"。
   Amatlas 取"你没离开就还算首次"的语义(见 docs/lessons-learned.md)。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).TextAdventure = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* look 解析:内容=f(状态)。首次/重访由核心 firstTime 判定(isFirst 传入)。
     函数形得到 (state, isFirst, eng) —— 比 world-engine 的全局 firstTime 更显式、可拿服务。 */
  function resolveLook(look, state, isFirst, eng) {
    if (typeof look === 'function') {
      var r = look(state, isFirst, eng);
      // fail-loud:look 函数返回非字符串(常是忘了 return、或返回对象)→ 静默当空/对象塞进正文。
      if (r != null && typeof r !== 'string') throw new Error('[amatlas] look 函数必须返回字符串(散文),收到 ' + typeof r + ':检查是否漏写 return、或误返回了对象/数组。');
      return r || '';
    }
    // fail-loud:look 写成数组(命令式直觉:多段=数组)/ 对象但字段名写错(text/desc 而非 first/return)→ 静默渲染空白正文。
    if (Array.isArray(look)) throw new Error('[amatlas] look 不能是数组(多段正文请用 "\\n" 连接,或写成函数返回拼接串);收到数组。');
    if (look && typeof look === 'object') {
      if (look.first == null && look.return == null) throw new Error('[amatlas] look 对象必须含 first 和/或 return(首/重访文本),收到 {' + Object.keys(look).join(',') + '}:可能把字段名写错(应为 first/return,不是 text/desc/body)。纯文本直接写字符串即可。');
      return (isFirst ? look.first : (look.return || look.first)) || '';
    }
    return look || '';
  }

  function nodeTitle(node) {
    return node.title != null ? node.title : (node.name != null ? node.name : '');
  }

  // audio.sfx 函数项展开(v22 additive · showcase Sonnet #5「仅首次进入才响一声雷」):sfx 数组项可为
  //   (state,isFirst)=>(string|SfxSpec)[] 函数(与 look 的 (S,first) 对称),renderer 在此按 state/isFirst 求值;
  //   present-audio 类型无关、只收字面 string/SfxSpec 数组(**零改**)。无函数项 → 原样返回(零拷贝、字节级向后兼容)。
  function expandAudioSfx(audio, state, isFirst) {
    if (!audio || !audio.sfx || typeof audio.sfx.length !== 'number') return audio;
    var sfx = audio.sfx, hasFn = false, i;
    for (i = 0; i < sfx.length; i++) { if (typeof sfx[i] === 'function') { hasFn = true; break; } }
    if (!hasFn) return audio;                                  // 无函数项:原样返回,与改动前逐字等价
    var resolved = [];
    for (i = 0; i < sfx.length; i++) {
      var item = sfx[i];
      if (typeof item === 'function') {
        var r = item(state, isFirst);
        if (!Array.isArray(r)) throw new Error('[amatlas] audio.sfx 函数项必须返回数组 (string|SfxSpec)[](哪怕只响一个也要写成 [item]),收到 ' + typeof r + ':检查是否漏写 return、或误把单个字符串当成了返回值。');
        for (var j = 0; j < r.length; j++) resolved.push(r[j]);
      } else { resolved.push(item); }
    }
    var out = {};                                              // 浅克隆 audio,只替换 sfx(不改 node.audio 原始数据,同 tabletop clone 先例)
    for (var k in audio) if (Object.prototype.hasOwnProperty.call(audio, k)) out[k] = audio[k];
    out.sfx = resolved;
    return out;
  }

  /* 工厂:每个引擎一份独立闭包(pendingBeats / ENG 不跨引擎串)。
     opts.status?(state) -> [ {label?, value} | string ]  附加状态条目(类型/游戏自定义)。 */
  function createTextAdventureModule(opts) {
    opts = opts || {};
    var ENG = null;
    var pendingBeats = [];   // 瞬时:本次 enter 触发的 beat 文字;render 读取后清空(不入档)

    function mapName(state) {
      var m = ENG && ENG.world.maps[state.pos.map];
      return (m && m.name) || '';
    }

    /* 进入节点触发 events(beat):when 门控、once 消耗(随档,存 state._eventsDone)。
       文字写入 pendingBeats —— 它是"呈现帧产物",不是游戏状态,故不入 state。 */
    function runBeats(state, node) {
      // 不在此清空 pendingBeats(render ~112 是唯一消费/清点处):移动型 link.run 返回的回应在 enter 前已入队,
      // 这里清会冲掉它(round12:link.run 返回 string = 回应 beat,与 event.run 对称;见 actions 包装)。
      var key = state.pos.map + '/' + state.pos.node;
      var done = state._eventsDone || (state._eventsDone = {});
      (node.events || []).forEach(function (ev) {
        var eid = key + '#' + (ev.id != null ? ev.id : '');
        if (ev.once && done[eid]) return;
        // fail-loud(design-principles §6b):when 门控非函数 = 违约。旧写法非函数 → && 短路 → 事件**无条件触发**(静默旁路)。
        if (ev.when != null && typeof ev.when !== 'function') {
          // 高频混淆(showcase round5):写 when:'enter'/'action' = 把 event 的 when〔条件〕和 achievement 的 on〔时机〕搞混。
          var whint = (typeof ev.when === 'string')
            ? ' —— events 进入节点即自动触发,**不需要** `when:\'' + ev.when + '\'`(别和 achievement 的 `on:\'enter\'` 混);删掉 when,或改成真正的条件函数 (state)=>bool。'
            : ':写成定值会被静默当"恒触发"→ 门控失效。删掉=恒触发,或改成函数。';
          throw new Error('[amatlas] event.when 必须是 (state)=>bool 函数,收到 ' + typeof ev.when + whint);
        }
        if (typeof ev.when === 'function' && !ev.when(state)) return;
        // fail-loud(与 link.run 对称):event.run 非函数 → beat 正文不出现 + 改 flag 的副作用静默丢(常致 soft-lock)。
        if (ev.run != null && typeof ev.run !== 'function') throw new Error('[amatlas] event.run 必须是 (state)=>void|string 函数(事件「' + (ev.id != null ? ev.id : key) + '」),收到 ' + typeof ev.run + ':写成字符串/表达式会被静默忽略 → beat 不显示、副作用全丢。');
        var txt = (typeof ev.run === 'function') ? ev.run(state) : '';
        if (ev.once) done[eid] = 1;
        if (txt) pendingBeats.push(String(txt));
      });
    }

    function buildStatus(state, node) {
      var bits = [{ label: '所在', value: mapName(state) + ' · ' + nodeTitle(node) }];
      if (typeof opts.status === 'function') {
        var extra = opts.status(state);
        // fail-loud:status(state) 必须返回数组(单条也包成 [item])。返回单个对象 → 旧版 .forEach 抛裸 TypeError,这里给教学提示。
        if (extra != null && !Array.isArray(extra)) throw new Error('[amatlas] status(state) 必须返回数组 [{label?,value}|string](哪怕只有一条也要写成 [item]),收到 ' + typeof extra + ':返回单个对象会让状态条渲染崩。');
        (extra || []).forEach(function (b) {
          if (b == null) return;
          bits.push(typeof b === 'string' ? { value: b } : b);
        });
      }
      return bits;
    }

    var mod = {
      id: 'text-adventure',
      nodeKinds: ['scene'],

      init: function (api) { ENG = api; },

      render: function (state, node) {
        var isFirst = ENG ? ENG.firstTime() : true;
        var body = [];
        var prose = resolveLook(node.look, state, isFirst, ENG);
        if (prose) body.push({ type: 'prose', text: prose });
        pendingBeats.forEach(function (t) { body.push({ type: 'event', text: t }); });
        pendingBeats = [];                          // beat 只在触发它的那次渲染显示一次
        var view = {
          mapname: mapName(state),
          title: nodeTitle(node),
          body: body,
          status: buildStatus(state, node)
        };
        // 模块原生产出 scene/audio 意图(与 tabletop 一致):节点声明则带、呈现器各取所需,
        // 未声明则不带、SVG/音频呈现器优雅退化为纯文字(契约 §4.2)。游戏层无需再包 render 垫片。
        if (node.scene) view.scene = node.scene;
        if (node.audio) view.audio = expandAudioSfx(node.audio, state, isFirst);   // v22:展开 sfx 函数项(仅首次/条件音效);无函数项零拷贝原样
        return view;
      },

      // links → 动作(= 状态转移)。**v6:逻辑上移到核心 `api.linkActions`(links/exits 通用、单一真相),
      //   本模块直接复用** → 与 tabletop 等模块行为一致;requires 校验 / 锁定显隐(防剧透/showWhenLocked 灰显)/
      //   空场景安全网都在核心;once 消耗 + available 过滤仍由 view() 统一做。行为与原模块内实现等价(renderer.test 守恒)。
      actions: function (state, node) {
        // fail-loud(v11 审计实锤):scene 节点写 checks(跑团检定)是混合游戏高频直觉,但 text-adventure 不消费
        //   checks → 检定按钮整体静默消失。点名抛(graph-audit 另有静态 P1;自定义模块认领 'scene' 自行消费则不经此处)。
        if (node.checks != null) throw new Error('[amatlas] scene 节点写了 checks(检定),但检定属于跑团模块的 kind:"encounter" —— scene 节点的 checks 会被静默丢弃(检定按钮整体消失)。把该节点改成 kind:"encounter"(混合游戏:boot 会按内置 kind 自动拉 Tabletop 模块),或移除 checks。');
        // round12 真因修:连续两局强模型都给 link.run 写 `return '叙事回应'`(与 event.run 对称的合理直觉),
        // 而核心 dispatch 丢弃返回值 → 纯动作点击零可见反馈 = "选项没反应"。模块层包装捕获:返回 string → 入 beat
        // (核心算法零改;契约 v10:link.run (state)=>void|string,返回字符串 = 本次回应文本)。
        var as = ENG.linkActions(node, state);
        for (var i = 0; i < as.length; i++) (function (a) {
          if (typeof a.run !== 'function') return;
          var orig = a.run;
          a.run = function (st) { var r = orig(st); if (typeof r === 'string' && r) pendingBeats.push(r); return r; };
        })(as[i]);
        return as;
      },

      systems: [ { on: 'enter', run: function (state, ev) { runBeats(state, ev.node); } } ]
    };
    // S11-b-ex:模块工厂返回 use-able 插件 → `engine.use(createTextAdventureModule(opts))` 是唯一注册形态。
    //   registerModule 降为 install 调用的底层原语(契约 v4 §2.2);registerModule(mod) 仍可直接用,忽略多出的 install。
    mod.install = function (api) { api.registerModule(mod); };
    return mod;
  }

  return { createTextAdventureModule: createTextAdventureModule, resolveLook: resolveLook, nodeTitle: nodeTitle, expandAudioSfx: expandAudioSfx };
});
