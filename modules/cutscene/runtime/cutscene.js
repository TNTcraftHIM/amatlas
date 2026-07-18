/* ════════════════════════════════════════════════════════════════════════
   Amatlas 过场模块 · 运行时 (cutscene/runtime/cutscene.js) — C1
   ════════════════════════════════════════════════════════════════════════
   kind='cutscene' 节点:作者写声明式 beats 节拍数组,引擎按时间轴自动推进;
   每拍产出 scene/audio 意图交 present-svg/present-audio 渲染;
   播放中始终可用 ▸ 逐拍即时快进;links 只在末拍出现,演完走素出口。

   设计稿:docs/cutscene-design.md(已过红队+用户签字)。
   铁边界:engine-core.js / module-interface.md / 呈现器 全不碰。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).Cutscene = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ── 已知拍字段(未知拍字段 → console.warn)─────────────────────── */
  var KNOWN_BEAT_FIELDS = { dur: 1, hold: 1, text: 1, scene: 1, audio: 1, run: 1 };

  /* ── 解析一个节点的 beats 并缓存(首次 render 时做,throw 经 boot 错误横幅呈现)── */
  function parseBeats(node) {
    // cutscene 节点的出口只认 links:exits 会被核心 defaultMoves 在每拍直接并入动作、
    // 绕过末拍门控与 link.run 字符串回应包装。fail-loud 拦在解析期。
    if (node.exits && node.exits.length)
      throw new Error('[cutscene] cutscene 节点请用 links 声明出口(节点「' + (node.id || node.title || '?') + '」写了 exits)——exits 会绕过末拍出口门控与 link.run 回应包装。把 exits 改成 links(门控字段 available 改 requires)。');
    var beats = node.beats;
    // beats 必须是非空数组
    if (!Array.isArray(beats) || beats.length === 0)
      throw new Error('[cutscene] beats 必须是非空数组(节点「' + (node.id || node.title || '?') + '」)');
    for (var i = 0; i < beats.length; i++) {
      var b = beats[i];
      // 未知拍字段 warn(typo 提示)
      for (var k in b) {
        if (Object.prototype.hasOwnProperty.call(b, k) && !KNOWN_BEAT_FIELDS[k])
          if (typeof console !== 'undefined' && console.warn)
            console.warn('[cutscene] beats[' + i + '] 含未知字段 "' + k + '"(可能是笔误;已知字段:dur/hold/text/scene/audio/run)');
      }
      // hold 字段:存在必须是布尔
      if (b.hold !== undefined && typeof b.hold !== 'boolean')
        throw new Error('[cutscene] beats[' + i + '].hold 必须是布尔值 true/false');
      // dur 与 hold 同写:hold 优先,dur 被忽略 + warn
      if (b.hold === true && b.dur !== undefined) {
        if (typeof console !== 'undefined' && console.warn)
          console.warn('[cutscene] beats[' + i + ']:hold:true 时 dur 不起效(hold 优先),dur 被忽略');
        // dur 不校验(hold:true 时可省)
      } else if (b.hold !== true) {
        // 非 hold 拍:dur 必须是有限正数
        if (b.dur === undefined)
          throw new Error('[cutscene] beats[' + i + ']:dur 与 hold 都缺——非 hold 拍必须写 dur(有限正数,单位秒)');
        if (typeof b.dur !== 'number' || !isFinite(b.dur) || b.dur <= 0)
          throw new Error('[cutscene] beats[' + i + '].dur 必须是有限正数(单位秒),收到:' + b.dur);
      }
      // text:存在必须是 string 或 string[]
      if (b.text !== undefined) {
        var textOk = typeof b.text === 'string' ||
          (Array.isArray(b.text) && b.text.every(function (t) { return typeof t === 'string'; }));
        if (!textOk)
          throw new Error('[cutscene] beats[' + i + '].text 必须是 string 或 string[]');
      }
      // scene:存在必须是对象
      if (b.scene !== undefined && (typeof b.scene !== 'object' || Array.isArray(b.scene) || b.scene === null))
        throw new Error('[cutscene] beats[' + i + '].scene 必须是 scene 意图对象(如 {region,mood,elements:[…]})');
      // audio:存在必须是对象
      if (b.audio !== undefined && (typeof b.audio !== 'object' || Array.isArray(b.audio) || b.audio === null))
        throw new Error('[cutscene] beats[' + i + '].audio 必须是 audio 意图对象(如 {music:…,sfx:[…]})');
      // run:存在必须是函数(同 link.run 精神:写成表达式 → 副作用静默丢)
      if (b.run !== undefined && typeof b.run !== 'function')
        throw new Error('[cutscene] beats[' + i + '].run 必须是 (state)=>void 函数(写成表达式/字符串会被静默忽略 → 置 flag 等副作用全丢)');
    }
    return beats;
  }

  /* ── scene 继承:回溯 beats[≤cursor] 最后一个定义了 scene 的拍 ── */
  function inheritScene(beats, cursor) {
    for (var j = cursor; j >= 0; j--)
      if (beats[j].scene !== undefined) return beats[j].scene;
    return undefined;
  }

  /* ── text → body prose 数组 ──────────────────────────────────── */
  function textToBody(text) {
    if (text === undefined || text === null) return [];
    if (Array.isArray(text)) return text.map(function (t) { return { type: 'prose', text: t }; });
    return [{ type: 'prose', text: text }];
  }

  /* ── 模块工厂 ────────────────────────────────────────────────── */
  function createCutsceneModule(opts) {
    opts = opts || {};

    /* ── 闭包局部变量(每次 on('enter') 进入 cutscene 节点重建归零)── */
    /* cursor/elapsed/ended/last/rafId/currentNode 绝不写进 state;         */
    /* 唯一进 state 的是 state._cutscene.ran 账本。                        */
    var cursor = 0;
    var elapsed = 0;
    var ended = false;
    var last = null;        // 上一帧时间戳(null=首帧)
    var rafId = null;       // rAF handle
    var timerActive = false; // 计时器是否在运行(独立于 rafId 值,因 mock rAF 返回非 null 数字)
    var timerGeneration = 0; // cancel/re-enter 递增；已出队但晚到的旧 callback 据此 no-op
    var currentNode = null;  // 当前 cutscene 节点引用(用于 ledger 键)
    var currentMap = '';     // 当前地图 id(闭包局部,配合 currentNodeId 组成账本键)
    var currentNodeId = '';  // 当前节点 id(**取自 pos.node**——world 数据里节点对象通常没有 .id 字段,
                             //   id 是 nodes 表的键;若退回 node.id||node.title,两个没 title/同 title 的
                             //   cutscene 节点会共享账本键 → 跨节点 run 静默漏执行)
    var currentState = null; // core load/hydrate 会替换 state 引用且不发 enter；同节点读档靠它识别并从头重播
    var pendingMessage = null; // link.run 字符串回应的瞬时源节点帧产物(显示一次，不入档)
    var parsedCache = {};    // nodeKey → beats(已解析;避免每帧重解析)

    var api = null;          // install 时绑定

    /* ── 节点唯一键(用于账本键前缀 + 解析缓存)─────────────────── */
    /* 格式:'map/node'(§4.3);id 主源 = pos.node(enter 的 ev.pos / render 的 state.pos,引擎必给), */
    /* node.id/node.title 仅作 mock/极端环境兜底。                                        */
    /* 注:地图/节点 id 避免含 / 与 # 是作者约定(与 actionKey 分隔符同族) */
    function nodeKey(node) {
      var mapPart = currentMap || '?map';
      var idPart = currentNodeId || (node && (node.id || node.title)) || '?';
      return mapPart + '/' + idPart;
    }

    /* ── 账本防御初始化 + 读/写 ────────────────────────────────── */
    function ledgerRan(S, node, beatIdx) {
      if (!S._cutscene) S._cutscene = { ran: {} };
      return !!S._cutscene.ran[nodeKey(node) + '#' + beatIdx];
    }
    function ledgerMark(S, node, beatIdx) {
      if (!S._cutscene) S._cutscene = { ran: {} };
      S._cutscene.ran[nodeKey(node) + '#' + beatIdx] = 1;
    }

    /* ── 停表 ────────────────────────────────────────────────────── */
    function cancel() {
      timerGeneration++;
      if (rafId != null && typeof cancelAnimationFrame !== 'undefined') {
        try { cancelAnimationFrame(rafId); } catch (e) {}
      }
      rafId = null;
      timerActive = false;
      last = null;
    }

    function scheduleTick() {
      if (typeof requestAnimationFrame === 'undefined') return;
      var generation = timerGeneration;
      rafId = requestAnimationFrame(function (ts) {
        if (generation !== timerGeneration) return;
        tick(ts);
      });
      timerActive = true;
    }

    /* ── advance:进入拍 i(beat0 在 on('enter') 的 apply 里做)──── */
    /* 手动 next:run 成功后才提交游标；自动 tick:保留失败后仍推进的容错。 */
    function advance(S, toIdx, tolerateRunError) {
      var b = currentNode ? parsedBeats()[toIdx] : null;
      if (b && b.run && !ledgerRan(S, currentNode, toIdx)) {
        try {
          b.run(S);
          ledgerMark(S, currentNode, toIdx);
        } catch (e) {
          if (!tolerateRunError) throw e;
          if (typeof console !== 'undefined' && console.error) console.error('[cutscene] tick beat.run 抛错:', e);
        }
      }
      cursor = toIdx;
      elapsed = 0;
    }

    /* ── 获取当前节点已解析 beats ─────────────────────────────── */
    function parsedBeats() {
      if (!currentNode) return [];
      var key = nodeKey(currentNode);
      if (!parsedCache[key]) parsedCache[key] = parseBeats(currentNode);
      return parsedCache[key];
    }

    /* ── rAF 计时器 tick ─────────────────────────────────────────── */
    function tick(ts) {
      var tickGeneration = timerGeneration;
      // dt 防御:ts 非有限数 或 last 为 null → dt=0(headless/jsdom 无时间戳时不污染 elapsed)
      var dt = (typeof ts === 'number' && isFinite(ts) && last !== null)
        ? Math.min(Math.max(ts - last, 0), 250)
        : 0;
      last = (typeof ts === 'number' && isFinite(ts)) ? ts : last;
      elapsed += dt;

      var beats = parsedBeats();
      var b = beats[cursor];
      // hold 拍不计时
      if (b && !b.hold) {
        var durMs = (b.dur || 0) * 1000;
        if (elapsed >= durMs && cursor < beats.length - 1) {
          var nextIdx = cursor + 1;
          try {
            api.apply({ run: function (S) { advance(S, nextIdx, true); } });
          } catch (e) {
            if (typeof console !== 'undefined' && console.error) console.error('[cutscene] tick api.apply 抛错:', e);
          }
          // apply 可同步触发离场/读档并 cancel；代次已变则旧 tick 到此立即停止，
          // 不能借新 generation 重挂一条幽灵帧。
          if (tickGeneration !== timerGeneration) return;
          // apply 已触发 render;重挂下帧——但落到 hold 拍就收表(timerActive=false/rafId=null、不再排帧,等玩家点 ▸),
          //   守 ensureTimer 的「hold 不计时」不变式;否则「定时叙述→停顿等玩家」会留一条 ~60fps 空转幽灵 rAF。
          if (!ended) {
            timerActive = false;
            rafId = null;
            if (!(beats[cursor] && beats[cursor].hold) && typeof requestAnimationFrame !== 'undefined') {
              scheduleTick();
            }
          }
          return;
        }
        // 末拍计时到:停表(演完)
        if (cursor === beats.length - 1 && elapsed >= durMs) {
          ended = true;
          cancel();
          // 末拍演完触发一次 render(让 actions 切换到素出口)
          try { api.apply({ run: function () {} }); } catch (e) {}
          return;
        }
      }

      if (tickGeneration !== timerGeneration) return;
      // 继续下帧——但当前拍是 hold 就收表(不排帧):快进遗留的陈旧 rAF 一 fire 见 hold 即自行终止,守「hold 不计时」不变式
      timerActive = false;
      rafId = null;
      if (!ended && !(beats[cursor] && beats[cursor].hold) && typeof requestAnimationFrame !== 'undefined') {
        scheduleTick();
      }
    }

    /* ── 幂等补挂计时器(render 里调;load 恢复不发 enter,必须在此补)── */
    function ensureTimer(node) {
      var beats = parsedBeats();
      var isPlayable = currentNode && currentNode === node && !ended && beats.length > 0;
      // hold 拍不需计时器(等玩家点 ▸)
      var currBeat = beats[cursor];
      var needTimer = isPlayable && currBeat && !currBeat.hold;
      // 用 timerActive 判断是否需要补挂(独立于 rafId 值,因 mock rAF 返回非 null handle)
      if (needTimer && !timerActive && typeof requestAnimationFrame !== 'undefined') {
        scheduleTick();
      }
    }

    /* ── render ─────────────────────────────────────────────────── */
    function render(state, node) {
      // 实时会话只由 critical enter/restore 生命周期建立；render 保持纯读取，不再根据 state 引用猜读档。
      // 首次 render 时解析 beats(throw → boot 错误横幅 + probe P0)
      var key = nodeKey(node);
      if (!parsedCache[key]) parsedCache[key] = parseBeats(node);
      var beats = parsedCache[key];

      var b = beats[cursor] || beats[0];
      // scene:回溯 beats[≤cursor] 最后一个定义的 scene(原样引用,保 present-svg 字节相同跳过重建)
      var scene = inheritScene(beats, cursor);
      // audio:当前拍写了才带键;不写=不带 audio 键 → present-audio v15 继承
      var audio = b.audio;

      var body = textToBody(b.text);
      if (pendingMessage) {
        body.push({ type: 'event', text: pendingMessage });
        pendingMessage = null;
      }
      var view = {
        title: node.title || '过场',
        body: body
      };
      if (scene !== undefined) view.scene = scene;
      if (audio !== undefined) view.audio = audio;
      return view;
    }

    /* ── actions ─────────────────────────────────────────────────── */
    function actions(state, node) {
      if (!api) return [];
      var beats = parsedBeats();

      if (state._cutscenePending != null) {
        return [{ id: 'cutscene:continue', label: '继续 →', kind: 'act', to: state._cutscenePending, available: function () { return true; } }];
      }

      // 演完后返回素 links。
      if (ended) return api.linkActions(node, state);

      // 播放中始终有 ▸；中间拍只有它，末拍才附 links。
      var nextBtn = {
        id: 'cutscene:next',
        label: '▸',
        kind: 'act',
        run: function (S) {
          var beats2 = parsedBeats();
          // hold 拍:▸ → 下一拍(或演完);非 hold 拍:▸ → 立即跳到下一拍(快进)
          if (cursor < beats2.length - 1) {
            advance(S, cursor + 1);
            // hold→普通计时拍是动作生命周期边界；render 已有意不启动资源，故在这里显式续表。
            ensureTimer(currentNode);
          } else {
            // 末拍点 ▸:演完
            ended = true;
            cancel();
          }
        }
      };

      // 中间拍不创建出口动作，避免可见性/once 等副作用提前发生。
      if (cursor < beats.length - 1) return [nextBtn];

      // 末拍包装 links，仅保留 link.run 字符串回应的源帧语义。
      var origLinks = api.linkActions(node, state);
      var wrapped = origLinks.map(function (orig) {
        var wrappedAction = Object.assign({}, orig);
        wrappedAction.run = function (S) {
          var response = (typeof orig.run === 'function') ? orig.run(S) : undefined;
          if (typeof response === 'string' && response) {
            pendingMessage = response;
            if (wrappedAction.to != null) {
              S._cutscenePending = wrappedAction.to;
              wrappedAction.to = undefined;
            }
          }
          return response;
        };
        return wrappedAction;
      });

      return [nextBtn].concat(wrapped);
    }

    function stopPlayback() {
      cancel();
      cursor = 0;
      elapsed = 0;
      ended = false;
      currentNode = null;
      currentState = null;
      pendingMessage = null;
      currentMap = '';
      currentNodeId = '';
    }

    function activatePlayback(state, endpoint, clearPending) {
      stopPlayback();
      // R2 二轮 P1:_cutscenePending「进入任意新节点时清空」(module-interface v32)——此前清空(下方)排在 kind!=='cutscene'
      //   早退之后 → 只有进入的下一个节点本身也是 cutscene 才清;演完 link.run 移动到 scene/encounter 等非过场节点则永久残留于
      //   存档(兄弟字段 _ttPending 无条件清=对)。上移到早退之前、对任意目的地 kind 执行;保留 clearPending 门控(restore 传 false=读档/刷新保留 pending)。
      if (clearPending && state) state._cutscenePending = null;
      if (!endpoint || !endpoint.node || endpoint.kind !== 'cutscene') return;
      currentNode = endpoint.node;
      currentState = state;
      currentMap = endpoint.pos && endpoint.pos.map ? endpoint.pos.map : '';
      currentNodeId = endpoint.pos && endpoint.pos.node != null
        ? String(endpoint.pos.node)
        : ((endpoint.node.id || endpoint.node.title) || '?');
      var key = nodeKey(currentNode);
      if (!parsedCache[key]) parsedCache[key] = parseBeats(currentNode);
    }

    function handleRestore(state, ev) {
      if (!ev || ev.phase === 'deactivate') {
        stopPlayback();
        return;
      }
      if (ev.phase !== 'activate' || !ev.current || ev.current.kind !== 'cutscene') return;
      // 恢复只重建 A/V 会话，不调用 api.apply、不过账 beat.run，也不清档内 pending/seen。
      activatePlayback(state, ev.current, false);
      ensureTimer(ev.current.node);
    }

    /* ── enter 玩法生命周期(system;异常不能被 observer 隔离)──────── */
    function handleEnter(state, ev) {
      var endpoint = ev && ev.node ? { pos: ev.pos, node: ev.node, kind: ev.node.kind } : null;
      activatePlayback(state, endpoint, true);
      if (!endpoint || endpoint.kind !== 'cutscene') return;

      // beat0 的 run 在 enter 的 apply 里执行
      var node = ev.node;
      var beats = parsedCache[nodeKey(node)];

      // 进入 beat0:通过 api.apply 执行 beat0 run(若未记账)。顺播 run 异常沿用已签语义:
      // 记录错误但不冻结时间轴；这不等同于把整个玩法生命周期降为可吞错 observer。
      try {
        api.apply({
          run: function (S) {
            // 防御初始化账本(无 run 的节点也要保证 _cutscene 存在)
            if (!S._cutscene) S._cutscene = { ran: {} };
            // 进入 beat0
            cursor = 0;
            elapsed = 0;
            var b0 = beats[0];
            if (b0 && b0.run && !ledgerRan(S, node, 0)) {
              b0.run(S);
              ledgerMark(S, node, 0);
            }
          }
        });
      } catch (e) {
        if (typeof console !== 'undefined' && console.error) console.error('[cutscene] enter beat0 apply 抛错:', e);
      }

      // api.apply 的真实核心路径会同步 render 并可能已经起表；统一走幂等 helper，避免同代双 rAF。
      ensureTimer(node);
    }

    /* ── install ─────────────────────────────────────────────────── */
    function install(a) {
      api = a;
      a.registerModule(mod);
    }

    var mod = {
      id: 'cutscene',
      nodeKinds: ['cutscene'],
      systems: [
        { on: 'enter', run: handleEnter },
        { on: 'restore', run: handleRestore }
      ],
      render: render,
      actions: actions,
      install: install
    };

    return mod;
  }

  return { createCutsceneModule: createCutsceneModule };
});
