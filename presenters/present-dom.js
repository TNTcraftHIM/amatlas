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
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./present-timeline.js'));
  else (global.Amatlas = global.Amatlas || {}).DomPresenter = factory(global.Amatlas.Timeline);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Timeline) {
  'use strict';

  var domPresenterSerial = 0;
  var warnedMissingSegmenter = false;

  function resolveTimeline() {
    if (Timeline) return Timeline;
    var root = typeof globalThis !== 'undefined' ? globalThis : this;
    return root && root.Amatlas && root.Amatlas.Timeline ? root.Amatlas.Timeline : null;
  }

  function prefersReducedMotion() {
    try {
      return !!(typeof window !== 'undefined' && window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function hasSegmenter() {
    return typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
  }

  function warnMissingSegmenter() {
    if (warnedMissingSegmenter) return;
    warnedMissingSegmenter = true;
    if (typeof console !== 'undefined' && console.warn)
      console.warn('[amatlas] 当前环境缺少 Intl.Segmenter；typewriter 文字已立即完整显示');
  }

  function normalizeTextSpeed(value) {
    if (value === undefined || value === null) return 1;
    if (value === 'instant') return value;
    if (typeof value !== 'number' || !isFinite(value) || value <= 0)
      throw new Error('[amatlas] DOM presenter textSpeed 必须是正有限 cps 倍率或 "instant"');
    return value;
  }

  // Phase 1 plan 已含精确 grapheme 与 chunk pause；玩家倍率只重算 cps 区间，不缩放 pauseAfterMs。
  function scaleRevealPlan(plan, speed) {
    if (speed === 1) return plan;
    var cursorMs = 0, graphemes = [];
    plan.lines.forEach(function (line, li) {
      if (!line || !Array.isArray(line.chunks))
        throw new Error('[amatlas] view.cutscenePlayback.text.lines[' + li + '] 不是规范化 reveal line');
      line.chunks.forEach(function (chunk, ci) {
        if (!chunk || !Array.isArray(chunk.graphemes) || typeof chunk.cps !== 'number' ||
            !isFinite(chunk.cps) || chunk.cps <= 0 || typeof chunk.pauseAfterMs !== 'number' ||
            !isFinite(chunk.pauseAfterMs) || chunk.pauseAfterMs < 0)
          throw new Error('[amatlas] view.cutscenePlayback.text.lines[' + li + '].chunks[' + ci + '] 不是规范化 reveal chunk');
        var cps = chunk.cps * speed;
        chunk.graphemes.forEach(function (grapheme, gi) {
          if (!grapheme || typeof grapheme.text !== 'string')
            throw new Error('[amatlas] view.cutscenePlayback.text.lines[' + li + '].chunks[' + ci + '].graphemes[' + gi + '] 不是规范化 grapheme');
          graphemes.push({ text: grapheme.text, atMs: cursorMs + Math.round(gi * 1000 / cps) });
        });
        cursorMs += Math.round(chunk.graphemes.length * 1000 / cps) + chunk.pauseAfterMs;
      });
    });
    return { mode: 'typewriter', graphemes: graphemes, durationMs: cursorMs };
  }

  function playbackDuration(playback) {
    var durationMs = playback.durationMs;
    if (typeof durationMs !== 'number' || !isFinite(durationMs) || durationMs < 0 || Math.round(durationMs) !== durationMs)
      throw new Error('[amatlas] cutscene typewriter durationMs 必须是非负整数毫秒');
    return durationMs;
  }

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
    var timelineManager = opts.timelineManager || null;
    var timelineConsumerId = 'dom-presenter-' + (++domPresenterSerial);
    var typewriterState = null;
    var cutscenePanelBinding = null;
    function $(s) { return doc ? doc.querySelector(s) : null; }
    function setText(s, t) { var el = $(s); if (el) el.textContent = (t == null ? '' : String(t)); }

    function manager() {
      if (timelineManager) return timelineManager;
      var api = resolveTimeline();
      timelineManager = api && api.playback;
      return timelineManager;
    }

    function clearTypewriter() {
      if (!typewriterState) return;
      if (typewriterState.registered && typewriterState.manager && typeof typewriterState.manager.unregister === 'function')
        typewriterState.manager.unregister(timelineConsumerId, false);
      typewriterState = null;
    }

    function setCutsceneNextName(control, revealing) {
      var name = revealing ? '显示全部文字' : '继续 / 下一段';
      control.setAttribute('title', name);
      control.setAttribute('aria-label', name);
    }

    function refreshTypewriterNextControl(state) {
      if (state && state.nextControl) setCutsceneNextName(state.nextControl, !state.complete);
    }

    function activateCutsceneNext(action) {
      if (typewriterState && !typewriterState.complete) {
        typewriterState.showAll();
        return;
      }
      if (engine) engine.apply(action);
    }

    function clearCutscenePanelBinding() {
      var binding = cutscenePanelBinding;
      cutscenePanelBinding = null;
      if (!binding || !binding.box) return;
      if (typewriterState && typewriterState.nextControl === binding.box) typewriterState.nextControl = null;
      (binding.events || []).forEach(function (entry) {
        if (entry.mode === 'listener') binding.box.removeEventListener(entry.type, entry.handler);
        else if (binding.box[entry.property] === entry.wrapper) binding.box[entry.property] = entry.previous;
      });
      if (binding.addedClass)
        binding.box.className = String(binding.box.className || '').replace(/(^|\s)cutscene-next-panel(?=\s|$)/g, ' ').replace(/^\s+|\s+$/g, '');
      (binding.attributes || []).forEach(function (attribute) {
        if (attribute.present) binding.box.setAttribute(attribute.name, attribute.value);
        else if (typeof binding.box.removeAttribute === 'function') binding.box.removeAttribute(attribute.name);
        else if (binding.box.attrs) delete binding.box.attrs[attribute.name];
      });
    }

    function rememberAttribute(box, name) {
      var present = typeof box.hasAttribute === 'function'
        ? box.hasAttribute(name)
        : typeof box.getAttribute === 'function' && box.getAttribute(name) !== null;
      return { name: name, present: present, value: present ? box.getAttribute(name) : null };
    }

    function addCutscenePanelEvent(binding, type, handler) {
      var box = binding.box;
      if (typeof box.addEventListener === 'function' && typeof box.removeEventListener === 'function') {
        box.addEventListener(type, handler);
        binding.events.push({ mode: 'listener', type: type, handler: handler });
        return;
      }
      var property = 'on' + type;
      var previous = box[property];
      var wrapper = function (event) {
        if (typeof previous === 'function') previous.call(this, event);
        handler.call(this, event);
      };
      box[property] = wrapper;
      binding.events.push({ mode: 'property', property: property, previous: previous, wrapper: wrapper });
    }

    function eventTime(event) {
      var value = event && Number(event.timeStamp);
      return typeof value === 'number' && isFinite(value) ? value : Date.now();
    }

    function eventHasModifier(event) {
      return !!(event && (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey));
    }

    function isInteractiveTarget(target, boundary) {
      var node = target;
      while (node && node !== boundary) {
        var tag = String(node.tagName || '').toLowerCase();
        if (/^(a|button|input|select|textarea|label|summary)$/.test(tag)) return true;
        if (typeof node.getAttribute === 'function') {
          var editable = node.getAttribute('contenteditable');
          var role = String(node.getAttribute('role') || '').toLowerCase();
          if ((editable !== null && editable !== 'false') || role === 'button' || role === 'link') return true;
        }
        node = node.parentNode;
      }
      return false;
    }

    function hasTextSelection() {
      try {
        var selection = doc && typeof doc.getSelection === 'function' ? doc.getSelection() : null;
        return !!(selection && (selection.isCollapsed === false || String(selection).length > 0));
      } catch (e) { return false; }
    }

    function bindCutscenePanel(action, nodeKind) {
      if (nodeKind !== 'cutscene') return;
      var box = $(S.look);
      if (!box) return;
      var binding = {
        box: box, action: action, press: null, down: null, move: null, up: null, cancel: null, click: null, keydown: null,
        events: [], attributes: ['role', 'tabindex', 'data-cutscene-next', 'title', 'aria-label'].map(function (name) {
          return rememberAttribute(box, name);
        }), addedClass: false
      };
      binding.down = function (event) {
        binding.press = {
          blocked: !event || event.button !== 0 || event.defaultPrevented || eventHasModifier(event) || isInteractiveTarget(event.target, box),
          cancelled: false,
          moved: false,
          pointerId: event && event.pointerId,
          x: event && Number(event.clientX),
          y: event && Number(event.clientY),
          startedAt: eventTime(event),
          releasedAt: null
        };
      };
      binding.move = function (event) {
        var press = binding.press;
        if (!press || press.cancelled || (press.pointerId != null && event && event.pointerId != null && press.pointerId !== event.pointerId)) return;
        var x = Number(event && event.clientX), y = Number(event && event.clientY);
        if (isFinite(x) && isFinite(y) && isFinite(press.x) && isFinite(press.y) &&
            ((x - press.x) * (x - press.x) + (y - press.y) * (y - press.y) > 64)) press.moved = true;
      };
      binding.up = function (event) {
        var press = binding.press;
        if (!press || (press.pointerId != null && event && event.pointerId != null && press.pointerId !== event.pointerId)) return;
        binding.move(event);
        press.releasedAt = eventTime(event);
      };
      binding.cancel = function () {
        if (binding.press) binding.press.cancelled = true;
      };
      binding.click = function (event) {
        var press = binding.press;
        binding.press = null;
        if (!press || !event || press.blocked || press.cancelled || press.moved || press.releasedAt === null ||
            event.button !== 0 || event.defaultPrevented || eventHasModifier(event) ||
            eventTime(event) - press.startedAt > 700 || isInteractiveTarget(event.target, box) || hasTextSelection()) return;
        activateCutsceneNext(action);
      };
      binding.keydown = function (event) {
        if (!event || event.target !== box || event.defaultPrevented || eventHasModifier(event) || event.repeat) return;
        var key = event.key;
        if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        activateCutsceneNext(action);
      };
      addCutscenePanelEvent(binding, 'pointerdown', binding.down);
      addCutscenePanelEvent(binding, 'pointermove', binding.move);
      addCutscenePanelEvent(binding, 'pointerup', binding.up);
      addCutscenePanelEvent(binding, 'pointercancel', binding.cancel);
      addCutscenePanelEvent(binding, 'click', binding.click);
      addCutscenePanelEvent(binding, 'keydown', binding.keydown);
      if (!/(^|\s)cutscene-next-panel(?:\s|$)/.test(String(box.className || ''))) {
        box.className = String(box.className || '') + (box.className ? ' ' : '') + 'cutscene-next-panel';
        binding.addedClass = true;
      }
      box.setAttribute('role', 'button');
      box.setAttribute('tabindex', '0');
      box.setAttribute('data-cutscene-next', '');
      setCutsceneNextName(box, !!(typewriterState && !typewriterState.complete));
      if (typewriterState) typewriterState.nextControl = box;
      cutscenePanelBinding = binding;
    }

    function appendPlainLine(box, b) {
      var div = doc.createElement('div');
      var t = b.type || 'prose';
      // 语义 class:每行都带 line + line-<type>(prose/event/check/outcome…)给 CSS 精细挂载点;
      // 仍保留旧的单 'event' class → 旧 demo 的 `.event` 选择器不受影响(向后兼容、纯增量)。
      div.className = 'line line-' + t + (t === 'event' ? ' event' : '');
      div.textContent = b.text || '';   // textContent 自动转义;换行由 CSS white-space:pre-wrap 保留
      box.appendChild(div);
      return div;
    }

    function renderPlainLook(view, box) {
      clearTypewriter();
      box.textContent = '';
      (view.body || []).forEach(function (b) {
        appendPlainLine(box, b);
      });
    }

    function renderTypewriter(view, playback, box) {
      var timeline = resolveTimeline();
      var playbackManager = manager();
      var plan = playback.text;
      if (!timeline || typeof timeline.revealCount !== 'function')
        throw new Error('[amatlas] cutscene typewriter 已声明，但未加载 presenters/present-timeline.js');
      if (!playbackManager || typeof playbackManager.prepare !== 'function' ||
          typeof playbackManager.register !== 'function' || typeof playbackManager.unregister !== 'function')
        throw new Error('[amatlas] cutscene typewriter 已声明，但 presenter timeline 会话管理器不可用');
      if (playback.version !== 1 || typeof playback.key !== 'string' || !playback.key)
        throw new Error('[amatlas] view.cutscenePlayback 必须是 version:1 且带非空 key');
      if (!plan || plan.mode !== 'typewriter' || !Array.isArray(plan.lines) || !Array.isArray(plan.graphemes))
        throw new Error('[amatlas] view.cutscenePlayback.text 不是规范化 reveal plan');

      var speed = normalizeTextSpeed(opts.textSpeed);
      var reduced = prefersReducedMotion();
      var segmenterMissing = !hasSegmenter();
      if (segmenterMissing) warnMissingSegmenter();
      var instant = reduced || speed === 'instant' || segmenterMissing;

      if (typewriterState && typewriterState.key === playback.key && typewriterState.plan === plan &&
          typewriterState.box === box && typewriterState.live && typewriterState.live.parentNode === box) {
        if (instant && !typewriterState.complete) typewriterState.showAll();
        return;
      }

      playbackManager.prepare(playback.key);
      clearTypewriter();
      box.textContent = '';

      var scaledPlan = speed === 'instant' ? plan : scaleRevealPlan(plan, speed);
      var durationMs = playbackDuration(playback);
      var spans = [];
      var visualLines = [];
      var body = view.body || [];
      var flattened = 0;
      plan.lines.forEach(function (line, li) {
        if (!line || typeof line.text !== 'string' || !Array.isArray(line.chunks))
          throw new Error('[amatlas] view.cutscenePlayback.text.lines[' + li + '] 不是规范化 reveal line');
        var b = body[li];
        if (!b || String(b.text == null ? '' : b.text) !== line.text)
          throw new Error('[amatlas] cutscene typewriter 的完整 body 与 reveal plan 不一致');
        var div = doc.createElement('div');
        var t = b.type || 'prose';
        div.className = 'line line-' + t + (t === 'event' ? ' event' : '') + ' amatlas-typewriter-visual';
        div.setAttribute('aria-hidden', 'true');
        line.chunks.forEach(function (chunk, ci) {
          if (!chunk || !Array.isArray(chunk.graphemes))
            throw new Error('[amatlas] view.cutscenePlayback.text.lines[' + li + '].chunks[' + ci + '] 不是规范化 reveal chunk');
          chunk.graphemes.forEach(function (grapheme, gi) {
            if (!grapheme || typeof grapheme.text !== 'string')
              throw new Error('[amatlas] view.cutscenePlayback.text.lines[' + li + '].chunks[' + ci + '].graphemes[' + gi + '] 不是规范化 grapheme');
            var span = doc.createElement('span');
            span.className = 'amatlas-typewriter-grapheme';
            span.textContent = grapheme.text;
            span.style.visibility = 'hidden';
            div.appendChild(span);
            spans.push(span);
            flattened++;
          });
        });
        visualLines.push(div);
        box.appendChild(div);
      });
      if (flattened !== plan.graphemes.length)
        throw new Error('[amatlas] view.cutscenePlayback.text 的 line grapheme 与扁平 grapheme 数量不一致');

      var live = doc.createElement('div');
      live.className = 'amatlas-typewriter-live';
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('aria-atomic', 'true');
      box.appendChild(live);
      live.textContent = plan.lines.map(function (line) { return line.text; }).join('\n');

      for (var tail = plan.lines.length; tail < body.length; tail++) appendPlainLine(box, body[tail]);

      var state = {
        key: playback.key,
        plan: plan,
        box: box,
        live: live,
        spans: spans,
        visualLines: visualLines,
        visibleCount: 0,
        complete: false,
        registered: false,
        manager: playbackManager,
        showAll: null,
        nextControl: null
      };
      typewriterState = state;

      function setVisibleCount(count) {
        count = Math.max(0, Math.min(count, spans.length));
        if (count === state.visibleCount) return;
        if (count > state.visibleCount) {
          for (var i = state.visibleCount; i < count; i++) spans[i].style.visibility = 'visible';
        } else {
          for (var j = count; j < state.visibleCount; j++) spans[j].style.visibility = 'hidden';
        }
        state.visibleCount = count;
      }
      function finish() {
        if (state.complete) return;
        setVisibleCount(spans.length);
        state.complete = true;
        refreshTypewriterNextControl(state);
        if (state.registered) {
          state.registered = false;
          playbackManager.unregister(timelineConsumerId, false);
        }
      }
      state.showAll = finish;

      if (instant || spans.length === 0) {
        finish();
        return;
      }

      state.registered = true;
      playbackManager.register({
        consumerId: timelineConsumerId,
        key: playback.key,
        durationMs: durationMs,
        patch: function (tMs) {
          if (typewriterState !== state || state.complete) return;
          var count = timeline.revealCount(scaledPlan, tMs);
          if (tMs >= durationMs) count = spans.length;
          setVisibleCount(count);
          if (count >= spans.length) finish();
        },
        reducedMotion: false
      });
    }

    function renderLook(view) {
      var box = $(S.look); if (!box) return;
      var playback = view.cutscenePlayback;
      if (playback && playback.text) renderTypewriter(view, playback, box);
      else renderPlainLook(view, box);
    }

    function renderChoices(actions, nodeKind, restoreCutscenePanelFocus) {
      clearCutscenePanelBinding();
      var box = $(S.choices); if (!box) return;
      box.textContent = '';
      var availableNext = (actions || []).filter(function (action) { return action && action.id === 'cutscene:next' && !action.locked; });
      (actions || []).forEach(function (a) {
        if (a && a.id === 'cutscene:next') return;
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
      if (availableNext.length === 1) {
        bindCutscenePanel(availableNext[0], nodeKind);
        var panel = $(S.look);
        if (restoreCutscenePanelFocus && panel && typeof panel.focus === 'function') panel.focus();
      }
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
        + ':where(.choice-adv-dis){background:rgba(190,60,60,.20);color:#cc5a5a;border:1px solid rgba(190,60,60,.5)}'
        + ':where(.amatlas-typewriter-live){position:absolute!important;width:1px!important;height:1px!important;padding:0!important;'
        + 'margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}'
        + ':where(html[data-node-kind="cutscene"]) #look.cutscene-next-panel{cursor:pointer}'
        + ':where(html[data-node-kind="cutscene"]) #look.cutscene-next-panel:focus-visible{outline:2px solid currentColor;outline-offset:3px}';
      try { doc.head.appendChild(st); } catch (e) { /* 注入是增强,环境差异不抛 */ }
    }

    var lastPosKey = null;   // 滚动跟踪:同节点纯动作重渲染不滚(保留阅读位置),换节点才滚回正文顶
    function present(v) {
      if (!doc || !v) return;
      var active = doc && doc.activeElement;
      var restoreCutscenePanelFocus = !!(active && active === $(S.look) &&
        typeof active.getAttribute === 'function' && active.getAttribute('data-cutscene-next') !== null);
      clearCutscenePanelBinding();
      ensureStyle();
      var view = v.view || {};
      setText(S.mapname, view.mapname || '');
      setText(S.place, view.title || '');
      renderLook(view);
      renderChoices(v.actions, v.nodeKind, restoreCutscenePanelFocus);
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
      install: function (api) {
        engine = api;
        var playbackManager = manager();
        if (playbackManager && typeof playbackManager.bindLifecycle === 'function') playbackManager.bindLifecycle(api);
        api.addPresenter(present);
      },  // S11-b-ex:一步接渲染 + 接点击(api 即 engine,有 apply);已删 attach
      present: present
    };
  }

  return { createDomPresenter: createDomPresenter };
});
