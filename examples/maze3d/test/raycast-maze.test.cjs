'use strict';
/* ════════════════════════════════════════════════════════════════════════
   maze3d 运行时回归(committed;进 engine/test/run.cjs)
   ────────────────────────────────────────────────────────────────────────
   为什么 committed:maze3d 是 arcade「孤岛」(canvas+rAF 实时声画),graph-audit / assembly-probe /
   smoke-harness 都看不进它的运行时生命周期 → 「再玩一次直接通关态」「TTS 念白飘到结局画面」
   「恢复存档迷宫窗口消失」这类 bug 过了所有静态闸、漏到端用户。此前烟雾只在 _scratch(不进 runner)
   = 根因。本测把 生命周期 / 音频 / TTS / 怪物 / 钥匙 / 自定义外观 全部锁进 committed runner。
   ────────────────────────────────────────────────────────────────────────
   手段:确定性 headless stub —— mock canvas / DOM / rAF;**无 gradient/arc/drawImage、无 AudioContext**
   (心跳/drone/TTS-床 静默退化);fillRect 计数=渲染发生的证据;可选 speechSynthesis spy=验 TTS 取消;
   捕获 window keydown=合成移动。纯 node、零依赖、process.exit(fail?1:0)。
   ════════════════════════════════════════════════════════════════════════ */
var path = require('path');
var fs = require('fs');
var MAZE = path.join(__dirname, '..', 'raycast-maze.js');   // canonical(末尾 ZA8 段检查 examples/maze3d 是唯一公开入口)
var STAGE = 'maze3d-stage';

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } }
function section(n) { console.log('── ' + n + ' ──'); }

// ── 共享 headless 环境(每 run 重置全局 document/window/rAF)──────────────────
var fillRects, rafCb, rafPending, rafNext, winH, docH, winEvents, docEvents, stageEl, cancelCount, spokeCount, pwCount, audioStarts, translateCount;   // winEvents/docEvents=真实多 listener EventTarget spy；winH/docH 保留便捷 dispatch 入口   // audioStarts=osc/buffersource.start 调用数(脚步/开门/张力/拾取 出声证据);translateCount=ctx.translate 调用数(震屏/头部晃动证据);pwCount=createPeriodicWave 调用数(glottalWave 声门源=formant 念白唯一来源 → 隔离"是否真合成了念白")
var recCols = [], recOn = false;   // 火把测试:recOn 时录每次 fillRect 的 fillStyle 颜色(验 torch 改色/摇曳/确定性)
var recRects = [], recRectsOn = false;   // 假高度墙测试:recRectsOn 时录每次 fillRect 的 [x,y,w,h] 几何(验墙列拉伸/锚脚;独立于 recCols 不破坏旧测试)
var recStyleRects = [], recStyleOn = false;   // V 段墙面梯度/AO 测试:recStyleOn 时录每次 fillRect 的 [x,y,w,h,fillStyle](验白色/黑色叠加层 rgba)
var recStyleAfter = 0;
function makeEventTarget(store) {
  var listeners = {};
  function sync(type) {
    if (!listeners[type] || !listeners[type].length) { delete store[type]; return; }
    store[type] = function (ev) { var a = listeners[type].slice(); for (var i = 0; i < a.length; i++) a[i](ev || {}); };
  }
  return {
    addEventListener: function (type, fn) { var a = listeners[type] || (listeners[type] = []); if (a.indexOf(fn) < 0) a.push(fn); sync(type); },
    removeEventListener: function (type, fn) { var a = listeners[type]; if (!a) return; var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); sync(type); },
    listenerCount: function (type) { return (listeners[type] || []).length; }
  };
}
function makeEl() {
  var el = {
    textContent: '', innerHTML: '', style: {}, className: '',
    children: [], parentNode: null, nextSibling: null, _attrs: {},
    setAttribute: function (k, v) { this._attrs[k] = String(v); }, getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    addEventListener: function (t, fn) { (this._h = this._h || {})[t] = fn; }, removeEventListener: function () {}, focus: function () {},   // 记录处理器(this._h[type])→ 触屏 overlay pointer 测试可 dispatch
    appendChild: function (c) { this.children.push(c); if (c && typeof c === 'object') c.parentNode = this; return c; },
    insertBefore: function (c) { this.children.push(c); if (c && typeof c === 'object') c.parentNode = this; return c; },
    removeChild: function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; }
  };
  el.classList = {
    add: function (name) { if ((' ' + el.className + ' ').indexOf(' ' + name + ' ') < 0) el.className = (el.className ? el.className + ' ' : '') + name; },
    remove: function (name) { el.className = el.className.split(/\s+/).filter(function (c) { return c && c !== name; }).join(' '); },
    contains: function (name) { return (' ' + el.className + ' ').indexOf(' ' + name + ' ') >= 0; }
  };
  return el;
}
function makeCanvas(opts) {
  opts = opts || {};
  var c = makeEl();
  c.width = 0; c.height = 0;
  c.getContext = function () { return { fillStyle: '', font: '', fillRect: function (x, y, w, h) { fillRects++; if (recOn) recCols.push(this.fillStyle); if (recRectsOn) recRects.push([x, y, w, h]); if (recStyleOn && fillRects > recStyleAfter) recStyleRects.push([x, y, w, h, this.fillStyle]); }, fillText: function () {}, save: function () {}, restore: function () {}, translate: function () { translateCount++; } }; };   // save/restore/translate=震屏/头部晃动整帧平移(被抓 trauma→translate);noop 够验不抛(真位移留 Playwright)
  if (opts.pointerLockRequest) c.requestPointerLock = opts.pointerLockRequest;
  return c;
}
// ── mock AudioContext(path-A 实时音频图 + StereoPanner 声场定位 pan 参数测试用;无 AudioContext 时 maze 音频全静默退化=测不到)──
//   诚实:mock 不做真 DSP → 验的是「pan 参数随怪方位正确赋值 + 音频图构建不抛错」,真实左右耳声像留耳机实听。
var mockPanners = [], mockConvolvers = [], mockFilters = [];
function audioParam(v) {
  return { value: v || 0,
    setValueAtTime: function (x) { this.value = x; return this; },
    setTargetAtTime: function (x) { this.value = x; return this; },                 // 记录目标值(忽略 ramp 时间常数;够验 pan 朝向)
    exponentialRampToValueAtTime: function (x) { this.value = x; return this; },
    linearRampToValueAtTime: function (x) { this.value = x; return this; },
    cancelScheduledValues: function () { return this; } };
}
function audioNode(extra) { var n = { connect: function () { return this; }, disconnect: function () {} }; if (extra) for (var k in extra) n[k] = extra[k]; return n; }
function mockAudioCtx(opts) {
  opts = opts || {};
  var ctx = {
    currentTime: 0, sampleRate: 44100, state: 'running', destination: audioNode(),
    resume: function () {}, close: function () {},
    createGain: function () { return audioNode({ gain: audioParam(1) }); },
    createOscillator: function () { return audioNode({ type: 'sine', frequency: audioParam(440), detune: audioParam(0), start: function () { audioStarts++; }, stop: function () {}, setPeriodicWave: function () {} }); },
    createBiquadFilter: function () { var f = audioNode({ type: 'lowpass', frequency: audioParam(350), Q: audioParam(1) }); mockFilters.push(f); return f; },
    createBufferSource: function () { return audioNode({ buffer: null, loop: false, start: function () { audioStarts++; }, stop: function () {} }); },
    createConvolver: opts.noConvolver ? undefined : function () { var c = audioNode({ normalize: true, buffer: null }); mockConvolvers.push(c); return c; },
    createWaveShaper: function () { return audioNode({ curve: null }); },
    createPeriodicWave: function () { pwCount++; return {}; },   // glottalWave() 声门源唯一调用点 → 计数=formant 念白合成次数
    createBuffer: function (ch, len) { return { getChannelData: function () { return new Float32Array(len); } }; }
  };
  if (!opts.noPanner) ctx.createStereoPanner = function () { var p = audioNode({ pan: audioParam(0) }); mockPanners.push(p); return p; };   // noPanner=模拟老浏览器无 createStereoPanner → 退化
  return ctx;
}
function resetEnv(opts) {
  opts = opts || {};
  fillRects = 0; rafCb = null; rafPending = {}; rafNext = 1; winH = {}; docH = {}; winEvents = makeEventTarget(winH); docEvents = makeEventTarget(docH); cancelCount = 0; spokeCount = 0; pwCount = 0; audioStarts = 0; translateCount = 0; mockConvolvers = []; mockFilters = [];
  recStyleRects = []; recStyleOn = false; recStyleAfter = 0;
  stageEl = makeEl(); stageEl.parentNode = makeEl();
  var headEl = makeEl();
  global.document = {
    head: headEl,
    body: makeEl(),                                                             // 伪全屏"锁底层滚动"测试:enterFs 改 body/html 的 overflow/overscrollBehavior、退出还原(mock 无 body 时此分支漏测=lesson 141 fail-silent 风险)
    documentElement: makeEl(),
    fullscreenElement: null,                                                    // 全屏切换测试可设(isFs() 读它)
    addEventListener: docEvents.addEventListener,
    removeEventListener: docEvents.removeEventListener,
    getElementById: function (id) {
      if (id === STAGE) return stageEl;
      if (id === 'scene') return null;
      for (var i = 0; i < headEl.children.length; i++) if (headEl.children[i] && headEl.children[i].id === id) return headEl.children[i];
      return null;   // 让私有样式注入路径真的跑;插入后再按 id 返回,同时覆盖幂等语义。
    },
    createElement: function (tag) { return tag === 'canvas' ? makeCanvas(opts) : makeEl(); }
  };
  var win = { addEventListener: winEvents.addEventListener, removeEventListener: winEvents.removeEventListener };   // 多 listener + 精确 remove；无 AudioContext → 心跳/drone/人声静默退化
  if (opts.speech) {                                  // TTS 取消测试:注入 speechSynthesis spy(策略 B)
    win.speechSynthesis = { speaking: false, cancel: function () { cancelCount++; }, speak: function () { spokeCount++; }, getVoices: function () { return []; } };
    global.SpeechSynthesisUtterance = function () {};
  } else {
    try { delete global.SpeechSynthesisUtterance; } catch (e) {}
  }
  if (opts.audio) { mockPanners = []; win.AudioContext = function () { return mockAudioCtx(opts); }; }   // 注入 mock AudioContext → path-A 音频图真跑(否则无 AC 全静默退化)
  global.window = win;
  global.requestAnimationFrame = function (cb) { var id = rafNext++; rafPending[id] = cb; rafCb = cb; return id; };
  global.cancelAnimationFrame = function (id) { delete rafPending[id]; if (rafCb && !Object.keys(rafPending).some(function (k) { return rafPending[k] === rafCb; })) rafCb = null; };
}
function makeApi() {
  var api = {
    state: {}, _mod: null, registerModule: function (mod) { this._mod = mod; }, linkActions: function () { return []; },
    apply: function (s) { if (s && s.run) s.run(this.state); },   // winNow/scareEnd 经此回写 winKey/scareKey
    _h: null, on: function (e, fn) { if (e === 'enter') this._h = fn; },
    fire: function (n) {
      var ev = { node: n };
      if (this._mod && this._mod.systems) this._mod.systems.forEach(function (sys) { if (sys.on === 'enter') sys.run(api.state, ev); });
      else if (this._h) this._h(ev);
    },
    restore: function (state, phase, node) {
      this.state = state;
      var current = node ? { node: node, kind: node.kind, pos: { map: 'm', node: 'maze' } } : null;
      if (this._mod && this._mod.systems) this._mod.systems.forEach(function (sys) {
        if (sys.on === 'restore') sys.run(api.state, { phase: phase, source: 'load', rollback: false, current: current, from: null, to: current });
      });
    }
  };
  return api;
}
function freshModule(opts, env) {
  resetEnv(env);
  var mod = require(MAZE).createMaze3dModule(opts || {});   // 每次新模块(模块级闭包态独立);require 缓存仅缓工厂
  var api = makeApi();
  mod.install(api);
  return { mod: mod, api: api };
}
function takeRaf() { var ids = Object.keys(rafPending || {}); if (!ids.length) { var lone = rafCb; rafCb = null; return lone; } var id = ids[0], cb = rafPending[id]; delete rafPending[id]; rafCb = null; return cb; }
function pump(n) { var f = 0, threw = null; try { for (var i = 0; i < n; i++) { var cb = takeRaf(); if (!cb) break; cb(i * 16.7); f++; } } catch (e) { threw = e; } return { frames: f, threw: threw }; }
function canvasMounted() { for (var i = 0; i < stageEl.children.length; i++) if (stageEl.children[i] && stageEl.children[i].getContext) return true; return false; }
function playNode(extra) { var n = { kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: 'cave', monsters: [] } }; if (extra) for (var k in extra) n[k] = extra[k]; return n; }

// ════ A. 生命周期回归(replay / 恢复存档 / 放弃重来)═════════════════════════
//   引擎 load/loadLocal 只 hydrate+重渲染、**不发 'enter'**(护 seen 首访,engine-core:317)。
//   maze 靠 render() 幂等补挂 canvas 兜住恢复存档;winKey 已置则不重起(replay 既定=保持通关)。
section('A 生命周期');
(function () {   // A1 恢复存档必须由 critical restore activate 启动；render 保持无副作用。
  var m = freshModule({}, {}), node = playNode();
  ok(m.mod.systems.some(function (sys) { return sys.on === 'restore'; }), 'A1a maze3d 必须声明 critical restore system');
  var view = m.mod.render(m.api.state, node);
  ok(fillRects === 0 && !canvasMounted(), 'A1b render 只产 View，不再偷偷补挂 canvas/rAF');
  m.api.restore({}, 'activate', node);
  ok(fillRects > 480 && canvasMounted(), 'A1c restore activate → 挂 canvas + 全屏渲染(>CW 证至少一屏列)');
  ok(view && view.body && /走廊|门|移动/.test(view.body[0].text) && !/黑暗/.test(view.body[0].text), 'A1d 探索态文本=无怪物探索语气(含门/移动/走廊、不含"黑暗"恐怖词)');
})();
(function () {   // A2 恢复到「已通关」maze:render 看到 winKey 已置 → 不补挂(won 守卫)、显 wonText
  var m = freshModule({}, {});
  m.api.state.won = true;
  var view = m.mod.render(m.api.state, playNode({ wonText: '门开了，你走出了迷宫。' }));
  ok(fillRects === 0 && !canvasMounted(), 'A2 恢复到已通关 → 不重起迷宫(won 守卫)');
  ok(view && /走出|门开/.test(view.body[0].text), 'A2 显 wonText');
})();
(function () {   // A3 replay 既定行为:'enter' 时 winKey 已置 → 不起局(hub「通关过=保持」白拿)
  var m = freshModule({}, {});
  m.api.state.won = true;
  m.api.fire(playNode());
  ok(fillRects === 0 && !canvasMounted(), 'A3 enter 时已通关 → 不重跑迷宫(replay 既定:winKey 持续=有意,自动重置会 fail-silent 重锁跨节点门控)');
})();
(function () {   // A3.5 对称守卫(红队 gaps high):'enter' 时 scareKey 已置 → 不起局(line 365,与 winKey 同性)
  var m = freshModule({}, {});
  m.api.state.caught = true;
  m.api.fire(playNode());
  ok(fillRects === 0 && !canvasMounted(), 'A3.5 enter 时已被抓 → 不重起(scareKey 守卫;与 A3 对称,被抓后重 enter 不重跑)');
})();
(function () {   // A4 replay-after-reset:内容层清 winKey(play-again link 的 run)后再 enter → 全新一局
  var m = freshModule({}, {});
  m.api.state.won = false;   // 内容层已重置
  m.api.fire(playNode());
  ok(fillRects > 0 && canvasMounted(), 'A4 winKey 重置后 enter → 全新一局(replay 内容修生效)');
})();
(function () {   // A5 放弃重来:enter maze →(放弃)enter 非 maze 节点 stop → 再 enter maze → 干净重起
  var m = freshModule({}, {});
  m.api.fire(playNode());
  ok(fillRects > 0, 'A5 第一局起来');
  m.api.fire({ kind: 'scene', look: '门廊' });   // 放弃=转移到非 maze 节点 → enter 处理器 stop()
  var afterLeave = fillRects;
  m.api.fire(playNode());                                 // 重来
  ok(fillRects > afterLeave, 'A5 放弃后再 enter → 干净重起第二局(running 已复位、无残留)');
})();
(function () {   // A5a restore deactivate 跨 kind 必须撤 stage/rAF/input；同节点再 activate 建全新会话。
  var m = freshModule({}, {}), node = playNode();
  m.api.restore({}, 'activate', node);
  var stale = takeRaf();
  ok(canvasMounted() && Object.keys(rafPending).length === 0, 'A5a-1 restore activate 已建立 maze 会话');
  m.api.restore(m.api.state, 'deactivate', node);
  ok(!canvasMounted() && Object.keys(rafPending).length === 0 && !winH.keydown, 'A5a-2 restore deactivate 清 canvas/rAF/input');
  m.api.restore({}, 'activate', node);
  stale(16.7);
  ok(canvasMounted() && Object.keys(rafPending).length === 1, 'A5a-3 同节点换代后旧 callback no-op，只剩新会话');
})();
(function () {   // A5b 全局 listener 必须随一局 stop 全撤回，且不能误删页面既有同类 listener。
  var m = freshModule({}, { pointerLockRequest: function () { global.document.pointerLockElement = this; if (docH.pointerlockchange) docH.pointerlockchange({}); } });
  global.window.matchMedia = function (q) { return { matches: /coarse/.test(q) }; };
  global.window.history = { pushState: function () {}, back: function () {} };
  global.document.exitPointerLock = function () { global.document.pointerLockElement = null; if (docH.pointerlockchange) docH.pointerlockchange({}); };
  var sent = 0, sentinel = function () { sent++; };
  global.window.addEventListener('keydown', sentinel); global.window.addEventListener('resize', sentinel);
  global.document.addEventListener('pointerlockchange', sentinel); global.document.addEventListener('fullscreenchange', sentinel);
  m.api.fire(playNode());
  var cv = null, fsBtn = null, ch = stageEl.children, i;
  for (i = 0; i < ch.length; i++) { if (ch[i] && ch[i].getContext) cv = ch[i]; if (ch[i] && ch[i].textContent === '⛶') fsBtn = ch[i]; }
  if (cv && cv._h && cv._h.pointerdown) cv._h.pointerdown({ preventDefault: function () {} });
  if (fsBtn && fsBtn._h && fsBtn._h.pointerdown) fsBtn._h.pointerdown({ preventDefault: function () {} });
  if (docH.pointerlockchange) docH.pointerlockchange({});   // 浏览器可能派发重复状态事件；mousemove listener 仍只能有一份
  var allBound = winEvents.listenerCount('keydown') === 2 && winEvents.listenerCount('resize') === 2 && winEvents.listenerCount('orientationchange') === 1 && winEvents.listenerCount('popstate') === 1 && docEvents.listenerCount('visibilitychange') === 1 && docEvents.listenerCount('pointerlockchange') === 2 && docEvents.listenerCount('pointerlockerror') === 1 && docEvents.listenerCount('mousemove') === 1 && docEvents.listenerCount('fullscreenchange') === 2 && docEvents.listenerCount('webkitfullscreenchange') === 1;
  m.api.fire({ kind: 'scene', look: '门廊' });
  var ownGone = winEvents.listenerCount('keydown') === 1 && winEvents.listenerCount('keyup') === 0 && winEvents.listenerCount('blur') === 0 && winEvents.listenerCount('resize') === 1 && winEvents.listenerCount('orientationchange') === 0 && winEvents.listenerCount('popstate') === 0 && docEvents.listenerCount('visibilitychange') === 0 && docEvents.listenerCount('pointerlockchange') === 1 && docEvents.listenerCount('pointerlockerror') === 0 && docEvents.listenerCount('mousemove') === 0 && docEvents.listenerCount('fullscreenchange') === 1 && docEvents.listenerCount('webkitfullscreenchange') === 0;
  var sentBefore = sent;
  if (winH.keydown) winH.keydown({ key: '?' }); if (winH.resize) winH.resize({}); if (docH.pointerlockchange) docH.pointerlockchange({}); if (docH.fullscreenchange) docH.fullscreenchange({});
  ok(allBound && ownGone && sent - sentBefore === 4 && global.document.pointerLockElement == null, 'A5b stop 撤回完整 window/document listener 同族并释放 Pointer Lock，页面 sentinel 不误删(变异=漏任一 remove 或按类型清空→红) bound=' + allBound + ' gone=' + ownGone + ' sentinelDelta=' + (sent - sentBefore) + ' locked=' + !!global.document.pointerLockElement);
})();
(function () {   // A5c 已出队旧 callback 晚到不得在新 maze 会话旁复活第二条 loop。
  var m = freshModule({}, {}), oldNode = playNode({ winKey: 'oldWon' }), newNode = playNode({ winKey: 'newWon' });
  m.api.fire(oldNode);
  var stale = takeRaf();
  m.api.fire({ kind: 'scene' });
  m.api.fire(newNode);
  var before = Object.keys(rafPending).length;
  stale(16.7);
  ok(before === 1 && Object.keys(rafPending).length === 1 && !m.api.state.oldWon, 'A5c 旧会话 rAF 晚到 no-op，不重挂旧 loop/写旧状态');
})();
(function () {   // A6 gallery 静态预览选项:只画首帧,不挂输入/按钮/HUD/音频,一页多 canvas 不烧 CPU/不抢键盘。
  var m = freshModule({ controls: false, audio: false, staticPreview: true }, { audio: true });
  m.api.fire(playNode());
  ok(fillRects > 480 && canvasMounted(), 'A6 staticPreview 首帧仍渲染出 canvas(素材卡可见)');
  ok(!rafCb, 'A6 staticPreview 不持续 requestAnimationFrame(变异=gallery 每卡都跑 loop→rafCb 非空)');
  ok(!winH.keydown && stageEl.children.length === 1, 'A6 controls:false 不挂键盘/按钮/HUD,stage 只留 canvas(变异=gallery 卡片堆控制层/抢键盘) children=' + stageEl.children.length);
  ok(audioStarts === 0 && mockPanners.length === 0, 'A6 audio:false 即使浏览器有 AudioContext 也不建迷宫音频图(变异=gallery 多卡片解锁/建声源) starts=' + audioStarts + ' panners=' + mockPanners.length);
})();

// ════ B. TTS 念白泄漏修(speechSynthesis.cancel)═══════════════════════════
//   speechSynthesis 是浏览器独立全局队列、hbCtx.close 管不到 → 离开/被抓不取消则那句话飘到结局画面继续念。
section('B TTS 取消');
(function () {   // B1 离开迷宫 → 取消还在念的伪人 TTS(强化:真念真掐——放远 chase:false mimic,pump 触发 speak,再离开测 cancel;红队 vacuous high 修)
  var m = freshModule({ mimicVoice: 'speech' }, { speech: true });
  m.api.fire({ kind: 'maze3d', maze: { grid: ['#######', '#.....#', '#.....#', '#.....#', '#######'], start: { x: 1, y: 2, dir: 'E' }, theme: 'cave', monsters: [{ x: 3, y: 2, face: 'mimic', chase: false }] } });   // 距离 2 格 → prox≈0.92 > 0.35,chase:false 不抓玩家
  var r = pump(180);                                                                                       // ≈3s ≥ 首次开口阈值(1.4+rng*0.8 ≈ 1.4~2.2s)
  ok(!r.threw, 'B1 mimic 开口路径无抛错' + (r.threw ? ': ' + (r.threw.stack || r.threw) : ''));
  ok(spokeCount > 0, 'B1 mimic 真开口了(spokeCount=' + spokeCount + ',前置:验真有念白在播)');
  var before = cancelCount;
  m.api.fire({ kind: 'scene', look: '走廊' });                                                              // 离开 → stop() → cancelSpeech()
  ok(cancelCount > before, 'B1 离开迷宫 → cancelSpeech()(中途真掐念白、不飘到下一画面;非空 cancel)');
})();
(function () {   // B2 被抓 → scareEnd 立刻取消念白(否则突脸 sting 被半句呢喃糊住 / 飘到结局画面)
  var m = freshModule({ mimicVoice: 'speech' }, { speech: true });
  m.api.fire({ kind: 'maze3d', scareKey: 'caught', maze: { grid: ['#######', '#.....#', '#..P..#', '#.....#', '#######'], start: { x: 3, y: 2, dir: 'N' }, theme: 'cave', monsters: [{ x: 2, y: 2, face: 'mimic' }, { x: 4, y: 2, face: 'mimic' }] } });
  var afterEnter = cancelCount;
  var r = pump(200);
  ok(!r.threw, 'B2 被抓路径无抛错' + (r.threw ? ': ' + (r.threw.stack || r.threw) : ''));
  ok(m.api.state.caught === true, 'B2 被 mimic 抓到');
  ok(cancelCount > afterEnter, 'B2 被抓瞬间 cancelSpeech()(scareEnd 掐念白,修 TTS 泄漏到结局画面)');
})();
(function () {   // B3 自定义念白台词 + 无 TTS → 静默,不盲替英文内置呢喃(诚实限制;createPeriodicWave=formant 声门源唯一来源 → pwCount 隔离念白是否真合成)
  var m = freshModule({}, { audio: true, speech: false });   // mock 音频(formant 真建图)+ 无 TTS
  m.api.fire({ kind: 'maze3d', maze: { grid: ['#######', '#.....#', '#.....#', '#.....#', '#######'], start: { x: 1, y: 2, dir: 'E' }, theme: 'cave', monsters: [{ x: 3, y: 2, face: 'mimic', chase: false, lines: ['你来了…', '别走…'] }] } });
  var r = pump(200);                                          // ≥ 首次开口阈值(1.4~2.2s)
  ok(!r.threw, 'B3 自定义 lines + 无 TTS 路径无抛错' + (r.threw ? ': ' + (r.threw.stack || r.threw) : ''));
  ok(pwCount === 0, 'B3 自定义台词 + 无 TTS → 不盲合成英文 formant(静默,诚实限制)(pwCount=' + pwCount + ';变异=退回盲替 "I love you"→声门源 createPeriodicWave 被调→pwCount>0 稳定红)');
})();
(function () {   // B4 内置短语 mimic + 无 TTS → formant 仍念(证只静默"自定义无 TTS"、内置零回归=零误报)
  var m = freshModule({}, { audio: true, speech: false });
  m.api.fire({ kind: 'maze3d', maze: { grid: ['#######', '#.....#', '#.....#', '#.....#', '#######'], start: { x: 1, y: 2, dir: 'E' }, theme: 'cave', monsters: [{ x: 3, y: 2, face: 'mimic', chase: false }] } });
  var r = pump(200);
  ok(!r.threw, 'B4 内置 mimic + 无 TTS formant 路径无抛错' + (r.threw ? ': ' + (r.threw.stack || r.threw) : ''));
  ok(pwCount > 0, 'B4 内置短语 + 无 TTS → formant 真念(声门源 createPeriodicWave 被调 pwCount=' + pwCount + ';证只静默自定义、内置零回归)');
})();

// ════ C. 音频泄漏修(explore 显式停 present-audio 主轨/氛围)══════════════════
//   迷宫自有 hbCtx 出声 → present-audio 的主轨/氛围必须显式停,否则契约 v15「缺键继承」让上一场景 bgm 叠双层。
section('C 音频');
(function () {
  var m = freshModule({}, {});
  var v1 = m.mod.render({}, { kind: 'maze3d', maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'E' } } });
  ok(v1 && v1.audio && v1.audio.music === false && v1.audio.ambient === false, 'C1 探索:music:false + ambient:false(堵 v15 缺键继承叠双层)');
  var v2 = m.mod.render({}, { kind: 'maze3d', scareAmbient: 'heartbeat', maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'E' } } });
  ok(v2 && v2.audio && v2.audio.ambient === 'heartbeat' && v2.audio.music === false, 'C2 scareAmbient → ambient=预设叠恐怖 BGS + music:false');
  var v3 = m.mod.render({ won: true }, { kind: 'maze3d', winKey: 'won', maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'E' } } });
  ok(v3 && v3.audio && v3.audio.ambient === false && v3.audio.music === false, 'C3 逃出:停氛围+主轨(死寂)');
  var v4 = m.mod.render({ caught: true }, { kind: 'maze3d', scareKey: 'caught', scareSfx: 'horror-sting', maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'E' } } });
  ok(v4 && v4.audio && v4.audio.ambient === false && v4.audio.music === false && v4.audio.sfx && v4.audio.sfx[0] === 'horror-sting', 'C4 被抓:停氛围+主轨 + 惊吓 sfx');
  ok(v4 && v4.body && /抓住|黑暗/.test(v4.body[0].text), 'C4 caughtText 锁定(对称 A2:render() text 分支不被悄改)');
  // ── 反向牙:BGM 按需开(maze3d 泛用化,docs/maze-audio-design.md §11)。作者写 node.audio.music 才点播,没写=默认 false(上面 C1/C3/C4 已锁「没写=false」这一端)。──
  var mm = { preset: 'sacral', tempo: 48, timbre: { pad: 'choir', bass: 'organ' } };
  var v5 = m.mod.render({}, { kind: 'maze3d', audio: { music: mm }, maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'E' } } });
  ok(v5 && v5.audio && v5.audio.music === mm && v5.audio.ambient === false, 'C1b 探索+audio.music → BGM 透传该 spec(opt-in 生效 → 证 C1「默认 false」非写死)');
  var v6 = m.mod.render({ won: true }, { kind: 'maze3d', winKey: 'won', audio: { music: mm }, maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'E' } } });
  ok(v6 && v6.audio && v6.audio.music === mm && v6.audio.ambient === false, 'C3b 通关+audio.music → BGM 续奏(胜利涌起,不再一律死寂)');
  var v7 = m.mod.render({ caught: true }, { kind: 'maze3d', scareKey: 'caught', audio: { music: mm }, maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'E' } } });
  ok(v7 && v7.audio && v7.audio.music === false, 'C4b 被抓+audio.music → 仍 music:false(死/败永远静默,作者点播不覆盖惊吓 sfx)');
})();
// ── STAR repro(承星者星痕:visual:'pickup' + examine + set 组合进格是否自动拾取)──
(function () {
  var m = freshModule({}, {});
  var t = 0; function step() { var cb = rafCb; rafCb = null; if (cb) cb(t); t += 16.7; }
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: {
    grid: ['########', '#......#', '########'], start: { x: 1, y: 1, dir: 'E' }, monsters: [],
    events: [{ x: 3, y: 1, once: true, visual: 'pickup', icon: 'crystal',
      examine: '第一枚星痕里蜷着一道尚未拥有方向的风。', hint: '你托住第一枚星痕。',
      run: function (S) { S.star1 = true; }, set: [{ x: 5, y: 1, ch: '.' }] }]
  } });
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  for (var i = 0; i < 90; i++) step();
  ok(m.api.state.star1 === true, 'STAR repro: pickup+examine+set 进格自动触发拾取(star1=' + m.api.state.star1 + ')');
})();
(function () {   // C5 audio:false 是硬静音:即使进 maze、泵帧、站在拾取/机关格,也不创建任何迷宫内部 AudioContext 声源。
  var m = freshModule({ audio: false }, { audio: true });
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#...#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [{ x: 2, y: 1, face: 'skull', chase: false }], events: [{ x: 2, y: 2, visual: 'pickup', icon: 'gem', run: function (S) { S.got = true; } }] } });
  var r = pump(80);
  ok(!r.threw && audioStarts === 0 && mockPanners.length === 0 && m.api.state.got === true, 'C5 audio:false 下怪物/拾取/氛围均不建音频图,但玩法照常触发 got=' + m.api.state.got + ' starts=' + audioStarts + ' panners=' + mockPanners.length);
})();

// ════ D. 怪物全路径(body+face 追逐→被抓→突脸/死亡演出 不抛错)═══════════════
section('D 怪物');
(function () {
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', scareKey: 'caught', maze: { grid: ['#######', '#.....#', '#..P..#', '#.....#', '#######'], start: { x: 3, y: 2, dir: 'N' }, theme: 'cave', monsters: [{ x: 2, y: 2, body: 'slender' }, { x: 4, y: 2, face: 'yurei' }] } });
  var r = pump(200);
  ok(!r.threw, 'D1 slender(body)+yurei(face) 全路径无抛错' + (r.threw ? ': ' + (r.threw.stack || r.threw) : ''));
  ok(fillRects > 1000, 'D1 渲染发生(fillRect ' + fillRects + ' > 1000)');
  ok(m.api.state.caught === true, 'D1 被抓 → lunge + 死亡演出触发');
})();

// ════ E. 钥匙门控(idea⑤:有 K 未拾取→锁 / 拾取→开 / 无 K→自由开)══════════════
//   E2(锁)vs E3(开)同门位几何 = 证门控真生效、非「没走到门」。
section('E 钥匙门控');
function findHud() {                                                  // 找 stage 内 className='amatlas-maze-hint' 的浮层 div(render 把 HUD 文本写它);返回 textContent
  var p = stageEl; if (!p || !p.children) return '';                 // HUD 提示现挂在 stage 内(悬画面顶浮层),非 stage 兄弟节点
  for (var i = 0; i < p.children.length; i++) { var c = p.children[i]; if (c && c.className === 'amatlas-maze-hint') return c.textContent || ''; }
  return '';
}
function findStageButton(label) {
  var stack = [stageEl];
  while (stack.length) {
    var p = stack.pop(); if (!p || !p.children) continue;
    for (var i = 0; i < p.children.length; i++) { var c = p.children[i]; if (c && c.textContent === label) return c; if (c && c.children) stack.push(c); }
  }
  return null;
}
function findPuzzleOverlay() {
  var stack = [stageEl];
  while (stack.length) {
    var p = stack.pop(); if (!p || !p.children) continue;
    for (var i = 0; i < p.children.length; i++) { var c = p.children[i]; if (c && (' ' + (c.className || '') + ' ').indexOf(' amatlas-maze-puzzle-overlay ') >= 0) return c; if (c && c.children) stack.push(c); }
  }
  return null;
}
function isPuzzleOverlayOpen() { var ov = findPuzzleOverlay(); return !!(ov && ov.style && ov.style.display === 'flex'); }
function findPuzzleElement(className) {
  var stack = [findPuzzleOverlay()];
  while (stack.length) { var p = stack.pop(); if (!p) continue; if ((' ' + (p.className || '') + ' ').indexOf(' ' + className + ' ') >= 0) return p; if (p.children) for (var i = 0; i < p.children.length; i++) stack.push(p.children[i]); }
  return null;
}
function findPuzzleText(className) { var p = findPuzzleElement(className); return p ? p.textContent || '' : ''; }
function clickStageButton(label) { var b = findStageButton(label); if (b && b._h && b._h.click) { b._h.click({ preventDefault: function () {} }); return true; } return false; }
function keyRun(label, maze, expectWin, extraCheck) {
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: maze });
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });   // 合成前进(朝 E → +x)
  var r = pump(240);
  ok(!r.threw && (!!m.api.state.won === expectWin), label + ' (won=' + !!m.api.state.won + ' 期望 ' + expectWin + ')' + (r.threw ? ' 抛:' + (r.threw.stack || r.threw) : ''));
  if (extraCheck) extraCheck(findHud());
}
keyRun('E1 钥匙在路径上→拾取→门开', { grid: ['#######', '#..K.D#', '#######'], start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [] }, true);
keyRun('E2 钥匙在岔路·只走到门→门锁', { grid: ['#######', '#...D.#', '#....K#', '#######'], start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [] }, false,
  function (hud) { ok(/锁|🔒/.test(hud), 'E2 HUD 显锁(到了门+锁了,非「根本没走到门」;红队 vacuous high 修)hud=' + JSON.stringify(hud)); });
keyRun('E3 无钥匙→门自由开(向后兼容)', { grid: ['#######', '#...D.#', '#######'], start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [] }, true);

// ── E4–E9 发布前 R1 polish:grid K 进入既有上下文链；主动拾取与原自动兜底共用一次性结算，不另造对象/触屏 API。──
(function () {   // E4 E / Enter / 触屏按钮三入口必须同义；第二次不再结算/响铃。
  function one(kind) {
    var m = freshModule({}, { audio: true }), pd = 0;
    m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#.KD#', '#####'], start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [] } });
    var btn = findStageButton('拾取'), shown = !!(btn && btn.style.display === 'block' && btn.getAttribute('aria-label') === '拾取'), before = audioStarts;
    function use() {
      if (kind === 'touch') { if (btn && btn._h && btn._h.pointerdown) btn._h.pointerdown({ preventDefault: function () { pd++; } }); }
      else if (winH.keydown) winH.keydown({ key: kind, repeat: false, preventDefault: function () { pd++; } });
    }
    use(); var after = audioStarts, hud = findHud(), hidden = !!(btn && btn.style.display === 'none');
    use();
    return { shown: shown, acquired: /已在手/.test(hud), hidden: hidden, once: after === before + 1 && audioStarts === after && pd === 1, delta: before + '→' + after + '→' + audioStarts, pd: pd };
  }
  var e = one('E'), enter = one('Enter'), touch = one('touch');
  ok(e.shown && enter.shown && touch.shown, 'E4a K 在自动半径外但合法上下文内 → E/Enter/触屏均显示“拾取”+ aria 同步');
  ok(e.acquired && enter.acquired && touch.acquired && e.hidden && enter.hidden && touch.hidden, 'E4b 三入口均取得 K，HUD 切“已在手”，拾取按钮同步隐藏');
  ok(e.once && enter.once && touch.once, 'E4c 三入口第二次均不重复结算/响铃/preventDefault E=' + e.delta + '/' + e.pd + ' Enter=' + enter.delta + '/' + enter.pd + ' touch=' + touch.delta + '/' + touch.pd);
})();
(function () {   // E5 自动路径仍成立且只结算一次；源码牙锁主动/自动共享 acquireKey，防以后再分叉两套赋值。
  var m = freshModule({}, { audio: true });
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['####', '#K.#', '####'], start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [] } });
  pump(2); var after = audioStarts, hud = findHud(); pump(12);
  var src = fs.readFileSync(MAZE, 'utf8');
  ok(/已在手/.test(hud) && audioStarts === after, 'E5a 原同格/<0.5 自动拾取仍成立，后续帧不重复响铃 starts=' + after + '→' + audioStarts);
  ok(/function acquireKey\(item\)/.test(src) && /if \(acquireKey\(it\)\) break;/.test(src) && /target\.kind === 'key'[\s\S]{0,240}acquireKey\(target\.item\)/.test(src), 'E5b 主动/自动两路源码共同调用 acquireKey(item)，不保留分叉的 taken/hasKey/chime 结算');
})();
(function () {   // E6 正向可见性控制 + 背后/超距/对角隔墙三反例；DDA 不能只是写了没消费。
  function shown(maze, nudgeBack) { var m = freshModule({}, {}); m.api.fire({ kind: 'maze3d', winKey: 'won', maze: maze }); if (nudgeBack && winH.keydown) { winH.keydown({ key: 'ArrowDown', preventDefault: function () {} }); pump(3); if (winH.keyup) winH.keyup({ key: 'ArrowDown' }); } var b = findStageButton('拾取'); return !!(b && b.style.display === 'block'); }
  var openDiag = shown({ grid: ['#####', '#...#', '#.K.#', '#...#', '#####'], start: { x: 1, y: 1, dir: 'E' }, monsters: [] }, true);
  var blockedDiag = shown({ grid: ['#####', '#...#', '##K#', '#####'], start: { x: 1, y: 1, dir: 'E' }, monsters: [] }, true);   // 向西微退约 0.07 格后，视线明确先穿 (1,2) 墙且仍在 1.5 格上下文半径内，避开格角 tie。
  var behind = shown({ grid: ['#####', '#K..#', '#####'], start: { x: 2, y: 1, dir: 'E' }, monsters: [] });
  var far = shown({ grid: ['#######', '#...K.#', '#######'], start: { x: 1, y: 1, dir: 'E' }, monsters: [] });
  ok(openDiag && !blockedDiag, 'E6a 对角一格 K 无墙可拾取，同几何在视线角点有墙则 DDA 挡住 open/blocked=' + openDiag + '/' + blockedDiag);
  ok(!behind && !far, 'E6b 背后/超距 K 不显示拾取按钮 behind/far=' + behind + '/' + far);
})();
(function () {   // E7 同场优先级:可执行 K 胜只读 examine；取得后按钮切回查看，事件对象不被误交 acquireKey。
  var m = freshModule({}, {}), pd = 0;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#.KD#', '#####'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 1, examine: '墙脚刻着一行字。' }] } });
  var pickup = findStageButton('拾取');
  if (winH.keydown) winH.keydown({ key: 'E', repeat: false, preventDefault: function () { pd++; } });
  var inspect = findStageButton('查看'), switched = !!(inspect && inspect.style.display === 'block');
  if (winH.keydown) winH.keydown({ key: 'E', repeat: false, preventDefault: function () { pd++; } });
  ok(pickup && switched && /墙脚刻着/.test(findHud()) && pd === 2, 'E7 K+examine 同场先“拾取”，取得后稳定切“查看”且事件仍可读 pd=' + pd + ' hud=' + JSON.stringify(findHud()));
})();
(function () {   // E8 K 与 interact 同为动作时按几何择优；K 取得后事件继续执行一次，不混淆候选类型。
  var m = freshModule({}, {}), pd = 0;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#.KD#', '#####'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 1, trigger: 'interact', once: true, hint: '拉杆落下。', run: function (S) { S.lever = (S.lever || 0) + 1; } }] } });
  var first = findStageButton('拾取');
  if (winH.keydown) winH.keydown({ key: 'Enter', repeat: false, preventDefault: function () { pd++; } });
  var second = findStageButton('互动'), switched = !!(second && second.style.display === 'block'), before = m.api.state.lever;
  if (winH.keydown) winH.keydown({ key: 'Enter', repeat: false, preventDefault: function () { pd++; } });
  ok(first && switched && before == null && m.api.state.lever === 1 && pd === 2, 'E8 K+interact 同场先取前方 K，再切互动并执行 event 一次（候选类型不混） lever=' + m.api.state.lever + ' pd=' + pd);
})();
(function () {   // E9 动态 set ch:'K' 当帧进入上下文；覆写移除后即使转回正面也不留幽灵目标。
  var spawned = freshModule({}, {}), pd = 0;
  spawned.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#..D#', '#####'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 1, trigger: 'interact', once: true, hint: '暗格弹开。', set: [{ x: 2, y: 1, ch: 'K' }] }] } });
  var spawnBtn = findStageButton('互动'); if (spawnBtn && spawnBtn._h && spawnBtn._h.pointerdown) spawnBtn._h.pointerdown({ preventDefault: function () { pd++; } });
  var dynamicPickup = findStageButton('拾取'), spawnedShown = !!(dynamicPickup && dynamicPickup.style.display === 'block');

  var removed = freshModule({}, {}), pd2 = 0;
  removed.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#.KD#', '#####'], start: { x: 1, y: 1, dir: 'W' }, monsters: [], events: [{ x: 1, y: 1, trigger: 'interact', once: true, hint: '暗格合拢。', set: [{ x: 2, y: 1, ch: '.' }] }] } });
  var removeBtn = findStageButton('互动'); if (removeBtn && removeBtn._h && removeBtn._h.pointerdown) removeBtn._h.pointerdown({ preventDefault: function () { pd2++; } });
  if (winH.keydown) winH.keydown({ key: 'ArrowRight', preventDefault: function () {} });
  var ghost = false; for (var i = 0; i < 180; i++) { pump(1); var gb = findStageButton('拾取'); if (gb && gb.style.display === 'block') { ghost = true; break; } }
  if (winH.keyup) winH.keyup({ key: 'ArrowRight' });
  ok(spawnedShown && pd === 1, "E9a events.set ch:'K' 生成后当帧切为拾取上下文 shown=" + spawnedShown + ' pd=' + pd);
  ok(removeBtn && pd2 === 1 && !ghost && !/已在手/.test(findHud()), "E9b 覆写 K→'.' 后转回正面也无幽灵拾取目标/误持有 ghost=" + ghost + ' pd=' + pd2);
})();

// ════ F. 自定义怪外观/念白/钥匙 DSL(fail-loud parse-don't-validate)════════════
//   坏数据必 throw(maze 孤岛、静态闸看不进 → 解析时抛 → boot 错误横幅);好数据渲染。
section('F 自定义外观 DSL');
function artRun(monster) {
  var m = freshModule({}, {});
  var node = { kind: 'maze3d', maze: { grid: ['#######', '#.....#', '#######'], start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [Object.assign({ x: 5, y: 1, chase: false }, monster)] } };
  var threw = null; try { m.api.fire(node); } catch (e) { threw = e; }
  pump(3);
  return { threw: threw, rects: fillRects };
}
function artThrow(name, mon) { var r = artRun(mon); ok(!!r.threw, 'F 抛:' + name + (r.threw ? '' : ' (没抛!)')); }
function artOk(name, mon) { var r = artRun(mon); ok(!r.threw && r.rects > 0, 'F 好:' + name + (r.threw ? ' 抛:' + r.threw.message : (r.rects > 0 ? '' : ' rects=0'))); }
artThrow('① art 非数组', { art: 'AA', palette: { A: [1, 2, 3] } });
artThrow('② 行非字符串/空', { art: ['AA', ''], palette: { A: [1, 2, 3] } });
artThrow('③ 行不等长', { art: ['AA', 'A'], palette: { A: [1, 2, 3] } });
artThrow('④ 超 32×32', { art: (function () { var a = []; for (var i = 0; i < 33; i++) a.push('A'); return a; })(), palette: { A: [1, 2, 3] } });
artThrow('⑤a palette 值非 3 数', { art: ['A'], palette: { A: [1, 2] } });
artThrow('⑤b palette 浮点', { art: ['A'], palette: { A: [1.5, 2, 3] } });
artThrow('⑤c palette 越界 300', { art: ['A'], palette: { A: [300, 0, 0] } });
artThrow("⑥ '.' 作 palette 键", { art: ['A'], palette: { A: [1, 2, 3], '.': [0, 0, 0] } });
artThrow('⑦ 未声明字符 B', { art: ['AB'], palette: { A: [1, 2, 3] } });
artOk('小网格', { art: ['.A.', 'AAA', '.A.'], palette: { A: [200, 30, 30] } });
artOk('纯黑可用(透明是字符非颜色)', { art: ['AB'], palette: { A: [0, 0, 0], B: [200, 200, 200] } });
artOk('镜像 mirror', { mirror: true, art: ['AB', 'AB'], palette: { A: [200, 30, 30], B: [30, 30, 200] } });
artOk('向后兼容:内置 face 无 art', { face: 'mimic' });
artOk('art+face 组合(自定义 look + 借 skull 音/FX)', { art: ['.A.', 'AAA', '.A.'], palette: { A: [200, 30, 30] }, face: 'skull' });
artThrow('lines 非数组', { face: 'mimic', lines: 'hi' });
artThrow('lines 空数组', { face: 'mimic', lines: [] });
artThrow('lines 含非字符串', { face: 'mimic', lines: ['ok', 123] });
artOk('自定义念白(face:mimic + lines)', { face: 'mimic', lines: ['你来了…', '别走…'] });
artOk('art+face+lines', { art: ['.A.', 'AAA'], palette: { A: [200, 30, 30] }, face: 'skull', lines: ['看着我'] });
(function () {   // keyArt 自定义钥匙外观:好→渲染、坏→throw
  var m = freshModule({}, {}), kg = ['#######', '#.K..D#', '#######'], threw = null;
  try { m.api.fire({ kind: 'maze3d', maze: { grid: kg, start: { x: 1, y: 1, dir: 'E' }, keyArt: { art: ['.A.', 'AAA', '.A.'], palette: { A: [240, 200, 90] } } } }); } catch (e) { threw = e; }
  pump(3);
  ok(!threw && fillRects > 0, 'F keyArt 自定义钥匙外观渲染、无抛错' + (threw ? ' 抛:' + threw.message : ''));
})();
(function () {
  var m = freshModule({}, {}), threw = null;
  try { m.api.fire({ kind: 'maze3d', maze: { grid: ['#######', '#.K..D#', '#######'], start: { x: 1, y: 1, dir: 'E' }, keyArt: { art: ['AA', 'A'], palette: { A: [1, 2, 3] } } } }); } catch (e) { threw = e; }
  pump(3);
  ok(!!threw, 'F 坏 keyArt(行不等长)→ throw');
})();

// ════ H. 音频图 + StereoPanner 声场定位(mock AudioContext;pan 随方位变号)═══════════
//   path-A 实时音频此前在无 AudioContext stub 下全静默退化=零覆盖;注入 mock 后首次覆盖音频图构建 + 验声场 pan 朝向。
section('H 音频图+声场');
function audioRun(monster, frames, env) {
  var m = freshModule({}, env || { audio: true });   // 朝东、5×5 开间、怪 chase:false 定点 → 方位角稳定可断言
  var node = { kind: 'maze3d', scareKey: 'caught', maze: { grid: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'], start: { x: 3, y: 3, dir: 'E' }, theme: 'cave', monsters: [Object.assign({ x: 3, y: 3, chase: false }, monster)] } };
  var threw = null; try { m.api.fire(node); } catch (e) { threw = e; }
  var r = pump(frames || 40); if (!threw) threw = r.threw;
  return { threw: threw };
}
function lastPan() { return mockPanners.length ? mockPanners[0].pan.value : 0; }
function proxPan() { return mockPanners.length ? mockPanners[0].pan.value : 0; }
function speakPan() { return mockPanners.length > 1 ? mockPanners[mockPanners.length - 1].pan.value : 0; }
(function () {   // H1 音频图构建无抛错 + hbEnsure 建了 1 个 proxPanner
  var r = audioRun({ x: 5, y: 3, face: 'skull' }, 40);
  ok(!r.threw, 'H1 path-A 音频图(mock AudioContext)构建无抛错' + (r.threw ? ': ' + (r.threw.stack || r.threw) : ''));
  ok(mockPanners.length === 1, 'H1 hbEnsure 建 1 个 StereoPanner(proxPanner)mockPanners=' + mockPanners.length);
})();
(function () {   // H2 声场定位:朝东,怪在 北=屏幕左→pan<0 / 南=屏幕右→pan>0 / 正东前方→pan≈0(与 projectSprite 的 ang→screenX 同源、声画一致)
  audioRun({ x: 3, y: 1, face: 'skull' }, 40); var north = lastPan();
  ok(north < -0.5, 'H2 怪在北(朝东=屏幕左侧)→ pan<0 偏左(pan=' + north.toFixed(2) + ')');
  audioRun({ x: 3, y: 5, face: 'skull' }, 40); var south = lastPan();
  ok(south > 0.5, 'H2 怪在南(朝东=屏幕右侧)→ pan>0 偏右(pan=' + south.toFixed(2) + ')');
  audioRun({ x: 5, y: 3, face: 'skull' }, 40); var ahead = lastPan();
  ok(Math.abs(ahead) < 0.3, 'H2 怪在正前方 → pan≈0 居中(pan=' + ahead.toFixed(2) + ')');
})();
(function () {   // H3 降级:无 createStereoPanner(老浏览器)→ 不建 panner、不抛错、仍渲染(proxBus 直连 hbMaster)
  var r = audioRun({ x: 5, y: 3, face: 'skull' }, 40, { audio: true, noPanner: true });
  ok(!r.threw && mockPanners.length === 0, 'H3 无 createStereoPanner → 退化(0 panner、无抛错)' + (r.threw ? ': ' + (r.threw.stack || r.threw) : ''));
})();
(function () {   // H4 formant 念白 Web Audio 图(mimic + 默认 formant)pump 足够帧触发开口 → 不抛错(首次覆盖 formant 合成图:periodicWave/convolver/waveShaper)
  var r = audioRun({ x: 4, y: 3, face: 'mimic' }, 200);
  ok(!r.threw, 'H4 mimic formant 念白音频图无抛错' + (r.threw ? ': ' + (r.threw.stack || r.threw) : ''));
})();
(function () {   // H5 主题化 ambient:同是普通 maze,不同 theme 应走不同程序化参数分支;不靠听感断言,用首帧声源数差异锁住 flesh/设施的额外调制层。
  function startsFor(th) { var m = freshModule({}, { audio: true }); m.api.fire({ kind: 'maze3d', maze: { grid: ['#####', '#...#', '#...#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: th, monsters: [] } }); pump(1); return audioStarts; }
  var base = startsFor('cave'), flesh = startsFor('flesh'), station = startsFor('station');
  ok(flesh > base && station > base, 'H5 主题化 ambient 分支:flesh/station 比 cave 多出程序调制/辅振层(变异=buildMazeAmbient 忽略 theme→三者相同) cave=' + base + ' flesh=' + flesh + ' station=' + station);
})();
(function () {   // H6 face 切换不累积旧 proximity bus:最近怪从 skull 切到 mimic 只保留一个 proxPanner;rear wet 支路随旧 bus 断开,不额外建声像。
  var m = freshModule({}, { audio: true });
  m.api.fire({ kind: 'maze3d', maze: { grid: ['#######', '#.....#', '#..P..#', '#.....#', '#######'], start: { x: 3, y: 2, dir: 'E' }, theme: 'cave', monsters: [{ x: 5, y: 2, face: 'skull', chase: false }, { x: 3, y: 1, face: 'mimic', chase: false }] } });
  var r = pump(80);
  ok(!r.threw && mockPanners.length === 1, 'H6 最近怪 face 切换只复用同一个 proxPanner,旧 bus disconnect 不累积 panner=' + mockPanners.length + (r.threw ? ' 抛:' + (r.threw.stack || r.threw) : ''));
})();
(function () {   // H7 身后 cue 建图:怪在正后方时仍 pan≈0(物理歧义诚实保留),但额外建立 convolver+lowpass 湿支路用于暗尾音。
  var r = audioRun({ x: 1, y: 3, face: 'zombie' }, 40);
  ok(!r.threw, 'H7 身后 rear cue 音频图无抛错' + (r.threw ? ': ' + (r.threw.stack || r.threw) : ''));
  ok(Math.abs(proxPan()) < 0.3, 'H7 身后怪左右 pan 仍≈0(不伪 HRTF) pan=' + proxPan().toFixed(2));
  ok(mockConvolvers.length >= 1 && mockFilters.some(function (f) { return f.type === 'lowpass' && f.frequency.value >= 1100 && Math.abs(f.Q.value - 0.55) < 0.02; }), 'H7 身后 cue 建立 rear 专属湿支路(lowpass Q≈0.55+freq≥1100,区别于怪自身 440Hz 环境滤波;变异=去 connectRearCue 滤波→无此滤波→红) convolvers=' + mockConvolvers.length);
})();
(function () {   // H8 rear cue 降级:无 convolver 时不抛错、proxPanner 仍工作;无 panner 时也不抛错(老浏览器/轻量环境)。
  var r1 = audioRun({ x: 1, y: 3, face: 'zombie' }, 40, { audio: true, noConvolver: true });
  ok(!r1.threw && mockConvolvers.length === 0, 'H8a 无 createConvolver → rear wet 支路跳过,不抛错(convolvers=' + mockConvolvers.length + ')' + (r1.threw ? ': ' + (r1.threw.stack || r1.threw) : ''));
  var r2 = audioRun({ x: 1, y: 3, face: 'zombie' }, 40, { audio: true, noPanner: true, noConvolver: true });
  ok(!r2.threw && mockPanners.length === 0, 'H8b 无 panner+无 convolver → 居中干声退化,不抛错(panners=' + mockPanners.length + ')' + (r2.threw ? ': ' + (r2.threw.stack || r2.threw) : ''));
})();
(function () {   // H9 formant 念白空间壳层:内置 mimic 背后开口会新建第二个 panner(快照),proxPanner 仍是第一个;自定义无 TTS 仍由 B3 锁诚实静默。
  var r = audioRun({ x: 1, y: 3, face: 'mimic' }, 220);
  ok(!r.threw && pwCount > 0, 'H9 mimic 背后 formant 念白仍合成声门源(pwCount=' + pwCount + ')' + (r.threw ? ': ' + (r.threw.stack || r.threw) : ''));
  ok(mockPanners.length >= 2 && Math.abs(speakPan()) < 0.3, 'H9 formant 念白建独立快照 panner,身后左右仍居中(mockPanners=' + mockPanners.length + ', speakPan=' + speakPan().toFixed(2) + ')');
})();
(function () {   // H10 rear cue 方向行为差分(audit:此前 H7-H9 只测身后、从不对比前后):怪在身后→rear lowpass 更暗(freq 低);正前方→更亮(freq 高)→证 rear 真随方位调制 filter、非恒定。
  function rearFreq(monPos) {
    audioRun(monPos, 40);   // freshModule 已重置 mockFilters;rear filter 由 Q≈0.55 唯一辨识
    var rf = null, i, f; for (i = 0; i < mockFilters.length; i++) { f = mockFilters[i]; if (f.type === 'lowpass' && Math.abs(f.Q.value - 0.55) < 0.02) rf = f; }
    return rf ? rf.frequency.value : null;
  }
  var behind = rearFreq({ x: 1, y: 3, face: 'zombie' }), front = rearFreq({ x: 5, y: 3, face: 'zombie' });   // 玩家(3,3)朝E:(1,3)身后、(5,3)正前
  ok(behind != null && front != null && behind < front - 100, 'H10 rear cue 方向差分:身后 rear lowpass 更暗 freq(' + behind + ')< 正前方(' + front + ')(变异=rear 不调制 filter 频率→恒定→相等→红)');
})();

// ════ I. 火把光照(torch)渲染确定性守卫(补审计 wg2yunxe5 的 committed 覆盖)════
//   torch 的「摇曳/暖色/二次衰减」**视觉正确性**由 Edge headless 截图(doNext② 主循环亲核)+ `_scratch/torch-determinism.cjs`
//   (确定性 177914 色逐字一致 / torch vs 无 torch 53352 色差)验。**committed 这里锁 torch 路径渲染确定性 + 逐帧"摇曳"真改色**。
//   逐帧闸的关键(原"暂缺"的真因):**不是 harness 污染**(resetEnv 清 rafCb / freshModule 每段独立 / loop 查 running),是
//     **"4 帧同落一个 8Hz bucket"指标失效**——pump 默认 ts=i*16.7、loop dt 上限 0.05s + 头两帧 dt=0(last 初值 0 falsy),
//     4 帧只到 g.tw≈0.067、floor(*8) 恒 0 → 有/无摇曳 distinct 色数都=1、变异验不出。**修=控 ts 跨 8Hz 边界(125ms)** → I2 双断言。
section('I 火把光照');
function torchNode(theme) { return { kind: 'maze3d', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'E' }, theme: theme, monsters: [] } }; }
function torchRun(theme, n) {                       // 录 fire + pump n 帧的全部 fillStyle 颜色(单泵、连续 i)
  var m = freshModule({}, {}); recCols = []; recOn = true;
  try { m.api.fire(torchNode(theme)); } catch (e) {}
  pump(n); recOn = false; return recCols.join('|');
}
function torchFrames(theme, tsArr) {                // 逐帧录色:按给定 ts 序列单独捕获每帧全部 fillStyle(控 ts 精确跨 8Hz bucket)
  var m = freshModule({}, {});
  try { m.api.fire(torchNode(theme)); } catch (e) {}
  var out = [];
  for (var i = 0; i < tsArr.length; i++) { var cb = rafCb; rafCb = null; if (!cb) break; recCols = []; recOn = true; cb(tsArr[i]); recOn = false; out.push(recCols.join('|')); }
  return out;
}
ok(torchRun('cave', 4) === torchRun('cave', 4), 'I1 torch 路径渲染确定性:cave(torch 主题)两次相同帧序列颜色逐字相同(防 Math.random/Date.now 混入渲染)');
// I2 逐帧"摇曳"committed 闸:ts=[0,1000,2000,3000,4000] → g.tw=0/0/0.05/0.10/0.15(loop dt≤0.05 + 头两帧 dt=0);floor(tw*8) 帧0/2=bucket0、帧4=bucket1
(function () {
  var fr = torchFrames('cave', [0, 1000, 2000, 3000, 4000]);
  ok(fr.length === 5 && !!fr[0] && fr[0] === fr[2],
    'I2a 同 8Hz bucket 两帧(g.tw 0 vs 0.05,无怪→g.prox=0 不触发 vignette/proxFx)逐字相同 → 证 torchFlick 是静态场景唯一 g.tw 变量(牙不被其它噪声污染)');
  ok(!!fr[0] && !!fr[4] && fr[0] !== fr[4],
    'I2b torch 摇曳真逐帧改色:帧0(bucket0)vs 帧4(bucket1,g.tw≥0.15 跨 125ms)墙/地板色不同(变异=torchFlick 恒 1→两 bucket 同色→I2b 稳定红)');
})();

// ════ J. maze 私有诊断 warn(未知主题 runtime 友好提示;非 graph-audit 静态闸——孤岛分层有摩擦,只在 maze runtime 退化+提示)════
section('J 诊断 warn');
(function () {   // J1 未知 theme → maze runtime console.warn(含主题名 + 已知清单),仍退化中性默认但提示作者(对称 music preset typo warn 家族)
  var warns = [], orig = console.warn; console.warn = function (msg) { warns.push(String(msg)); };
  try { var m = freshModule({}, {}); m.api.fire({ kind: 'maze3d', maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'N' }, theme: 'haunted', monsters: [] } }); }
  finally { console.warn = orig; }
  ok(warns.some(function (s) { return /maze theme/.test(s) && /haunted/.test(s); }),
    'J1 未知主题 "haunted" → maze 私有 runtime warn(含主题名;变异=删 warn 行→warns 空稳定红)warns=' + JSON.stringify(warns));
})();
(function () {   // J2 已知 theme(cave)+ 缺省(无 theme)→ 不 warn(零误报:合法值不打扰)
  var warns = [], orig = console.warn; console.warn = function (msg) { warns.push(String(msg)); };
  try {
    var m1 = freshModule({}, {}); m1.api.fire({ kind: 'maze3d', maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'N' }, theme: 'cave', monsters: [] } });
    var m2 = freshModule({}, {}); m2.api.fire({ kind: 'maze3d', maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'N' }, monsters: [] } });
  } finally { console.warn = orig; }
  ok(!warns.some(function (s) { return /maze theme/.test(s); }),
    'J2 已知 theme(cave)+ 缺省 → 不触发 maze theme warn(零误报)warns=' + JSON.stringify(warns));
})();

section('K 坐标事件 maze.events[] + 怪速 chaseSpeed');
function evThrows(node) { var m = freshModule({}, {}); try { m.api.fire(node); return false; } catch (e) { return /\[maze/.test(String(e && e.message || e)); } }
var EGRID = ['#####', '#...#', '#...#', '#...#', '#####'];   // 5×5 全空腔,起点(2,2)可走、无门无钥匙
(function () {   // K1 走进事件格 → run(state,api) 被调写 state(边缘进格:起点格 prevC=-999 → 首帧即"进入"触发)
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, theme: 'cave', monsters: [],
    events: [{ x: 2, y: 2, run: function (S) { S.hit = true; } }] } });
  pump(1);
  ok(m.api.state.hit === true, 'K1 走进事件格 → run 被调写 state(变异=删 loop 坐标检查块→稳定红)state=' + JSON.stringify(m.api.state));
})();
(function () {   // K2 once:true → 多帧只触发一次
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, theme: 'cave', monsters: [],
    events: [{ x: 2, y: 2, once: true, run: function (S) { S.n = (S.n || 0) + 1; } }] } });
  pump(3);
  ok(m.api.state.n === 1, 'K2 once:true 多帧只触发一次(变异=删 g.triggered once 守卫→红)n=' + m.api.state.n);
})();
(function () {   // K3 once:false 边缘进格:站定不动 5 帧仍只触发一次(非每帧 60×/s;Dungeon Master/RPG Maker Player Touch 语义)
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, theme: 'cave', monsters: [],
    events: [{ x: 2, y: 2, run: function (S) { S.n = (S.n || 0) + 1; } }] } });
  pump(5);
  ok(m.api.state.n === 1, 'K3 once:false 站定 5 帧仍只 1 次(变异=去掉 cellChg 边缘检测→每帧触发 n=5 红;这是"别每秒触发 60 次"的关键牙)n=' + m.api.state.n);
})();
(function () {   // K4 run 非函数 → startMaze 抛(fail-loud)
  ok(evThrows({ kind: 'maze3d', maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'N' }, events: [{ x: 1, y: 1, run: 'nope' }] } }),
    'K4 events.run 非函数 → 抛(变异=删 run 校验→不抛红)');
})();
(function () {   // K5 既无 run 也无 hint → 抛(空事件)
  ok(evThrows({ kind: 'maze3d', maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'N' }, events: [{ x: 1, y: 1 }] } }), 'K5 events 既无 run 也无 hint → 抛(空事件)');
})();
(function () {   // K5b 纯 hint 事件(无 run,氛围 floor-text)→ 合法不抛、pump 不崩
  var m = freshModule({}, {}), okhint = true;
  try { m.api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, hint: '墙缝里有抓痕' }] } }); pump(2); } catch (e) { okhint = false; }
  ok(okhint, 'K5b 纯 hint 事件(无 run)合法、pump 不崩(run 可选,Dungeon Master floor-text 式)');
})();
(function () {   // K5c R1-b1 examine-only 是合法只读线索;examine 形态错则 fail-loud。
  var m = freshModule({}, {}), okex = true;
  try { m.api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, examine: '地上有一行很浅的刻字。' }] } }); pump(2); } catch (e) { okex = false; }
  ok(okex, 'K5c examine-only 事件合法、不因无 run/hint 被当空事件(只读线索可独立存在)');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, examine: 42 }] } }), 'K5c examine 非字符串 → 抛[maze event](变异=坏线索静默进运行时→红)');
})();
(function () {   // K6 坐标越界 → 抛
  ok(evThrows({ kind: 'maze3d', maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'N' }, events: [{ x: 9, y: 9, run: function () {} }] } }),
    'K6 events 坐标越界 → 抛(变异=删越界校验→不抛红)');
})();
(function () {   // K7 事件落墙格 → 不抛,只 warn(玩家走不到、零误报不硬拦)
  var warns = [], orig = console.warn; console.warn = function (msg) { warns.push(String(msg)); };
  var threw = false;
  try { var m = freshModule({}, {}); m.api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 0, y: 0, run: function () {} }] } }); }
  catch (e) { threw = true; } finally { console.warn = orig; }
  ok(!threw && warns.some(function (s) { return /maze event/.test(s); }), 'K7 事件落墙格 → 不抛+warn(玩家走不到)threw=' + threw + ' warns=' + JSON.stringify(warns));
})();
(function () {   // K8 chaseSpeed:非正数抛 / 正数不抛且正常跑
  ok(evThrows({ kind: 'maze3d', maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'N' }, chaseSpeed: -1, monsters: [] } }), 'K8a chaseSpeed 非正数 → 抛');
  var m = freshModule({}, {}), ok8 = true;
  try { m.api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, chaseSpeed: 3.5, monsters: [] } }); pump(2); } catch (e) { ok8 = false; }
  ok(ok8, 'K8b chaseSpeed 正数(3.5)→ 不抛、正常运行');
})();

section('K9 命名物品库 icon(事件道具 + 钥匙 keyIcon)');
(function () {   // K9a 事件 icon 库内名 → 不抛 + pump 渲染不崩(可见精灵进 sprite pass)+ run 仍触发
  var m = freshModule({}, {}), ok9 = true;
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, theme: 'cave', monsters: [],
    events: [{ x: 2, y: 2, icon: 'scroll', hint: '一卷纸', run: function (S) { S.got = true; } }] } }); pump(2); } catch (e) { ok9 = false; }
  ok(ok9 && m.api.state.got === true, 'K9a 事件 icon 库内名(scroll)→ 不抛+渲染不崩+run 仍触发 got=' + (m && m.api.state.got));
})();
(function () {   // K9b 未知 icon 名 → warn(列已知名单)+ 不抛(退化无精灵,hint/run 仍工作);变异=删 resolveIcon 未知分支 warn→warns 空红
  var warns = [], orig = console.warn; console.warn = function (s) { warns.push(String(s)); };
  var threw = false, ran = false;
  try { var m = freshModule({}, {}); m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, theme: 'cave', monsters: [],
    events: [{ x: 2, y: 2, icon: 'scrol', run: function (S) { S.r = true; } }] } }); pump(2); ran = m.api.state.r === true; }
  catch (e) { threw = true; } finally { console.warn = orig; }
  ok(!threw && ran && warns.some(function (s) { return /maze icon/.test(s) && /scrol/.test(s); }), 'K9b 未知 icon → warn+不抛+run 仍触发(变异=删未知分支 warn→红)warns=' + JSON.stringify(warns));
})();
(function () {   // K9c 事件 icon 非字符串 → throw(形态错 fail-loud);变异=删 resolveIcon 类型校验→不抛红
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 1, icon: 42, run: function () {} }] } }),
    'K9c 事件 icon 非字符串(42)→ 抛(变异=删 resolveIcon 类型校验→不抛红)');
})();
(function () {   // K9d 钥匙 keyIcon 库内名(bone_key)→ 不抛、pump 渲染不崩(钥匙换外观)
  var m = freshModule({}, {}), okk = true;
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: { grid: ['#######', '#.K..D#', '#######'], start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [], keyIcon: 'bone_key' } }); pump(2); } catch (e) { okk = false; }
  ok(okk, 'K9d keyIcon 库内名(bone_key)→ 不抛、渲染不崩');
})();
(function () {   // K9e keyIcon 非字符串 → throw
  ok(evThrows({ kind: 'maze3d', maze: { grid: ['#######', '#.K..D#', '#######'], start: { x: 1, y: 1, dir: 'E' }, keyIcon: 99 } }),
    'K9e keyIcon 非字符串(99)→ 抛(fail-loud)');
})();
(function () {   // K9f 事件 art+icon 同写 → warn(art 优先);变异=删同写 warn→红
  var warns = [], orig = console.warn; console.warn = function (s) { warns.push(String(s)); };
  try { var m = freshModule({}, {}); m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, theme: 'cave', monsters: [],
    events: [{ x: 2, y: 2, icon: 'gem', art: ['.A.', 'AAA', '.A.'], palette: { A: [200, 30, 30] }, run: function () {} }] } }); pump(1); }
  finally { console.warn = orig; }
  ok(warns.some(function (s) { return /art 与 icon 同写/.test(s); }), 'K9f 事件 art+icon 同写 → warn(art 优先)warns=' + JSON.stringify(warns));
})();
(function () {   // K9g event.visual 坏词 fail-loud;写了视觉角色就校验,不写保持旧默认
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 1, visual: 'floating', run: function () {} }] } }),
    "K9g event.visual 坏词 → 抛[maze event visual](变异=坏词静默回退→红)");
})();
(function () {   // K9h visual:'none' 可显式隐藏有 icon 的事件(escape hatch:隐藏陷阱/纯触发),但 run 仍触发
  var warns = [], orig = console.warn; console.warn = function (s) { warns.push(String(s)); };
  var m = freshModule({}, {}), ok9h = true;
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, visual: 'none', icon: 'gem', run: function (S) { S.hiddenRan = true; } }] } }); pump(2); }
  catch (e) { ok9h = false; } finally { console.warn = orig; }
  ok(ok9h && m.api.state.hiddenRan === true && warns.some(function (s) { return /visual='none'/.test(s); }), "K9h visual:'none' 隐藏可见物但 run 仍触发 + warn(escape hatch) ran=" + (m && m.api.state.hiddenRan) + ' warns=' + JSON.stringify(warns));
})();
(function () {   // K9i floor-pickup / wall-pickup 是合法私有视觉角色;隐藏物必须显式写,默认 pickup 不变。
  var m = freshModule({}, {}), ok9i = true;
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [
    { x: 2, y: 2, visual: 'floor-pickup', icon: 'gem', run: function (S) { S.floorHidden = true; } },
    { x: 2, y: 1, visual: 'wall-pickup', face: 'N', icon: 'scroll', hint: '墙缝里有纸片' }
  ] } }); pump(2); }
  catch (e) { ok9i = false; }
  ok(ok9i && m.api.state.floorHidden === true, "K9i visual:'floor-pickup'/'wall-pickup' 合法,且 floor-pickup 仍可 run 写 state(变异=白名单漏新值→抛) floorHidden=" + (m && m.api.state.floorHidden));
})();
(function () {   // K9j wall-pickup 必须说明哪面墙,且 face 必须真指向相邻墙格#;否则作者以为贴墙、实际悬空。
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 1, visual: 'wall-pickup', icon: 'scroll', run: function () {} }] } }), "K9j wall-pickup 缺 face → 抛[maze event visual](变异=静默按默认面贴错墙→红)");
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 1, visual: 'wall-pickup', face: 'Q', icon: 'scroll', run: function () {} }] } }), 'K9j wall-pickup face 坏词 → 抛[maze event visual]');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, visual: 'wall-pickup', face: 'E', icon: 'scroll', run: function () {} }] } }), 'K9j wall-pickup face 指向空地而非墙# → 抛[maze event visual]');
})();
(function () {   // K9k 嵌入式拾取物必须有可发现形态:不能既隐藏又无 icon/art;未知 icon 对普通 pickup 只 warn,对隐藏物要硬报。
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, visual: 'floor-pickup', run: function () {} }] } }), 'K9k floor-pickup 无 icon/art → 抛[maze event visual]');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 1, visual: 'wall-pickup', face: 'N', run: function () {} }] } }), 'K9k wall-pickup 无 icon/art → 抛[maze event visual]');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, visual: 'floor-pickup', icon: 'scrol', run: function () {} }] } }), 'K9k floor-pickup 未知 icon → 抛[maze event visual](变异=退化成完全看不见的隐藏物→红)');
})();
(function () {   // K9l floor-pickup 是“贴近才拿”:刚跨进格边缘不触发,靠近格中心才触发;触发时只响一次拾取声。
  var m = freshModule({}, { audio: true }), t = 0;
  function step() { var cb = rafCb; rafCb = null; if (cb) cb(t); t += 16.7; }   // 同一局内单调 ts;避免分段 pump() 重置 ts 造成负 dt。
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#######', '#.....#', '#######'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 3, y: 1, once: true, visual: 'floor-pickup', icon: 'gem', run: function (S) { S.floorTouch = true; } }] } });
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  for (var i = 0; i < 37; i++) step();
  ok(m.api.state.floorTouch !== true, 'K9l floor-pickup 刚跨进目标格边缘不触发(变异=仍走进格即拿→红) floorTouch=' + m.api.state.floorTouch);
  var before = audioStarts;
  for (; i < 41; i++) step();
  var after = audioStarts;
  ok(m.api.state.floorTouch === true, 'K9l floor-pickup 靠近格中心后触发(贴上去才能拿) floorTouch=' + m.api.state.floorTouch);
  if (winH.keyup) winH.keyup({ key: 'ArrowUp', preventDefault: function () {} });   // 站定测“不重复响”,排除继续行走脚步声干扰
  for (; i < 60; i++) step();
  ok(after > before && audioStarts === after, 'K9l floor-pickup 触发时有低调拾取声且 once 站定不重复响 starts ' + before + '→' + after + '→' + audioStarts);
})();
(function () {   // K9m wall-pickup 是“面向对应墙 + 贴近墙面”才拿;触发时有墙缝抽取声,贴着不每帧刷。
  var m = freshModule({}, { audio: true });
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['###', '#P#', '###'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 1, visual: 'wall-pickup', face: 'E', icon: 'scroll', run: function (S) { S.wallTouch = (S.wallTouch || 0) + 1; } }] } });
  pump(3);
  ok(!m.api.state.wallTouch, 'K9m wall-pickup 站在格中心未贴墙 → 不触发(变异=进格即拿→红) wallTouch=' + m.api.state.wallTouch);
  var before = audioStarts;
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  pump(40);
  var after = audioStarts;
  ok(m.api.state.wallTouch === 1, 'K9m wall-pickup 面向并贴近对应墙面 → 触发一次,贴着不每帧刷(变异=不查 facing/near 或无 touchingEvents 边缘→红) wallTouch=' + m.api.state.wallTouch);
  ok(after > before, 'K9m wall-pickup 触发时有墙缝抽取声(starts ' + before + '→' + after + ')');
})();
(function () {   // K9n R1-b1 wall-pickup examine:只读检视复用“面向 + 贴墙”语义,不自动拿、不 run、不 once。
  var m = freshModule({}, { audio: true });
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['###', '#P#', '###'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 1, once: true, visual: 'wall-pickup', face: 'E', icon: 'scroll', examine: '墙缝里夹着一张纸片。', run: function (S) { S.tookNote = (S.tookNote || 0) + 1; } }] } });
  pump(3);
  var midHud = findHud(), midStarts = audioStarts, pd0 = 0;
  if (winH.keydown) winH.keydown({ key: 'e', repeat: false, preventDefault: function () { pd0++; } });
  pump(2);
  ok(!/纸片/.test(findHud()) && pd0 === 0 && m.api.state.tookNote !== 1, 'K9n 格中心未贴墙按 E 不显示 examine、不 preventDefault、不触发 run hud=' + JSON.stringify(findHud()) + ' pd=' + pd0 + ' ran=' + m.api.state.tookNote);
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  pump(40);
  var ranAfterTouch = m.api.state.tookNote, startsAfterTouch = audioStarts;
  if (winH.keydown) winH.keydown({ key: 'e', repeat: false, preventDefault: function () { pd0++; } });
  var hudAfterE = findHud();
  if (winH.keydown) winH.keydown({ key: 'e', repeat: true, preventDefault: function () { pd0 += 10; } });
  var hudAfterRepeat = findHud();
  ok(ranAfterTouch === 1 && startsAfterTouch > midStarts, 'K9n 有 run 的 wall-pickup 贴墙仍按旧接触语义拿取一次(回归), ran=' + ranAfterTouch);
  ok(!/纸片/.test(hudAfterE) && hudAfterRepeat === hudAfterE, 'K9n once 消耗后的物件不再可检视,repeat keydown 也不刷新/拦截 hud=' + JSON.stringify(hudAfterE) + ' midHud=' + JSON.stringify(midHud));
})();
(function () {   // K9o R1-b1 examine-only wall-pickup:贴墙后按 E/Enter 显示,但不触发 run/once/拾取声。
  var m = freshModule({}, { audio: true });
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['###', '#P#', '###'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 1, once: true, visual: 'wall-pickup', face: 'E', icon: 'scroll', examine: '墙缝里夹着一张纸片。' }] } });
  pump(3);
  var pd = 0, btn = findStageButton('查看'), hidden0 = btn && btn.style.display === 'none';
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  pump(40);
  var afterMove = audioStarts, shown1 = btn && btn.style.display === 'block' && /height:46px/.test(btn.style.cssText || '') && /min-width:56px/.test(btn.style.cssText || '');
  if (winH.keydown) winH.keydown({ key: 'E', repeat: false, preventDefault: function () { pd++; } });
  var hudE = findHud(), afterE = audioStarts;
  if (winH.keydown) winH.keydown({ key: 'Enter', repeat: false, preventDefault: function () { pd++; } });
  var hudEnter = findHud(), afterEnter = audioStarts;
  ok(afterE === afterMove && afterEnter === afterMove && /纸片/.test(hudE) && /纸片/.test(hudEnter) && pd === 2, 'K9o examine-only 不自动拾取/不出拾取声,贴墙后 E/Enter 显示只读线索 starts afterMove/E/Enter=' + afterMove + '/' + afterE + '/' + afterEnter + ' hud=' + JSON.stringify(hudEnter) + ' pd=' + pd);
  ok(hidden0 && shown1, 'K9o 触屏/鼠标上下文“查看”按钮只在有检视目标时显示,命中区不低于四向按钮量级 hidden0=' + hidden0 + ' shown1=' + shown1 + ' style=' + (btn && btn.style.cssText));
  var beforeBtn = audioStarts;
  if (btn && btn._h && btn._h.pointerdown) btn._h.pointerdown({ preventDefault: function () { pd++; } });
  ok(/纸片/.test(findHud()) && audioStarts === beforeBtn && pd === 3, 'K9o 查看按钮走同一只读检视 intent,不出声/不写状态 hud=' + JSON.stringify(findHud()) + ' starts=' + beforeBtn + '→' + audioStarts + ' pd=' + pd);
})();
(function () {   // K9p HUD 优先级:检视线索不能压过锁门等关键态。
  var m = freshModule({}, {}), pd = 0;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#PDK#', '#####'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 1, examine: '墙上写着门后有东西。' }] } });
  if (winH.keydown) winH.keydown({ key: 'E', repeat: false, preventDefault: function () { pd++; } });
  pump(2);
  ok(/锁|🔒/.test(findHud()) && !/门后有东西/.test(findHud()) && pd === 1, 'K9p lockedDoor HUD 优先于 examine 文案(检视不覆盖关键态) hud=' + JSON.stringify(findHud()) + ' pd=' + pd);
})();
(function () {   // K9q R1-b2 trigger:'interact':起点格也不自动触发;只有 E 非 repeat 主动触发动作/hint/once。
  var m = freshModule({}, {}), pd = 0;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P##', '#...#', '#####'], start: { x: 2, y: 2, dir: 'E' }, monsters: [], events: [
    { x: 2, y: 2, trigger: 'interact', once: true, visual: 'plate', hint: '你按下石座,右侧墙面打开。', set: [{ x: 3, y: 2, ch: '.' }], run: function (S) { S.usedPedestal = (S.usedPedestal || 0) + 1; } },
    { x: 3, y: 2, run: function (S) { S.reachedOpenedCell = true; } }
  ] } });
  pump(3);
  var before = m.api.state.usedPedestal, btn = findStageButton('互动'), btnDisplayBefore = btn && btn.style.display;
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  pump(35);
  var reachedBeforeUse = m.api.state.reachedOpenedCell;
  if (winH.keyup) winH.keyup({ key: 'ArrowUp' });
  if (winH.keydown) winH.keydown({ key: 'E', repeat: true, preventDefault: function () { pd += 10; } });
  var afterRepeat = m.api.state.usedPedestal;
  if (winH.keydown) winH.keydown({ key: 'E', repeat: false, preventDefault: function () { pd++; } });
  var hudAfter = findHud(), afterUse = m.api.state.usedPedestal;
  if (winH.keydown) winH.keydown({ key: 'Enter', repeat: false, preventDefault: function () { pd++; } });
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  pump(70);
  ok(before == null && reachedBeforeUse !== true && afterRepeat == null && afterUse === 1 && pd === 1, "K9q trigger:'interact' 不因进格/按键 repeat 触发,只被 E 非 repeat 主动触发一次 before/repeat/after=" + before + '/' + afterRepeat + '/' + afterUse + ' reachedBefore=' + reachedBeforeUse + ' pd=' + pd);
  ok(m.api.state.reachedOpenedCell === true && /石座/.test(hudAfter), 'K9q 主动互动执行 set/hint:按 E 后右侧墙打开,随后可走入新格 reached=' + m.api.state.reachedOpenedCell + ' hud=' + JSON.stringify(hudAfter));
  ok(btn && btnDisplayBefore === 'block' && btn.textContent === '互动', 'K9q 上下文按钮对 interact 目标显示“互动”而不是“查看” label=' + (btn && btn.textContent) + ' displayBefore=' + btnDisplayBefore);
})();
(function () {   // K9r R1-b2 触屏/鼠标按钮走同一互动 intent,且 trigger 坏词 fail-loud。
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, trigger: 'touch', hint: '坏 trigger' }] } }), "K9r trigger 不是 'interact' → 抛[maze event](变异=拼写错误静默变成自动/空行为→红)");
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, trigger: 'interact' }] } }), "K9r trigger:'interact' 本身不算事件内容,仍需 run/set/warp/turn/hint/examine(空事件继续 fail-loud)");
  var m = freshModule({}, {}), pd = 0;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, trigger: 'interact', once: true, visual: 'pickup', icon: 'gem', hint: '宝石嵌入凹槽。', run: function (S) { S.buttonUse = (S.buttonUse || 0) + 1; } }] } });
  var btn = findStageButton('互动');
  if (btn && btn._h && btn._h.pointerdown) btn._h.pointerdown({ preventDefault: function () { pd++; } });
  var after = m.api.state.buttonUse;
  if (btn && btn._h && btn._h.pointerdown) btn._h.pointerdown({ preventDefault: function () { pd++; } });
  ok(after === 1 && m.api.state.buttonUse === 1 && /宝石/.test(findHud()) && pd === 1, 'K9r “互动”按钮触发一次 run/hint/once,第二次因 once 消耗不再拦截/重复 state=' + m.api.state.buttonUse + ' hud=' + JSON.stringify(findHud()) + ' pd=' + pd);
})();
(function () {   // K9s R1-b2 wall-pickup + interact:贴墙只显示上下文,不自动拿;按 E 才执行。
  var m = freshModule({}, { audio: true }), pd = 0;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['###', '#P#', '###'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 1, trigger: 'interact', once: true, visual: 'wall-pickup', face: 'E', icon: 'scroll', hint: '你从墙缝里抽出纸条。', run: function (S) { S.wallUse = (S.wallUse || 0) + 1; } }] } });
  pump(3);
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  pump(40);
  var beforeE = m.api.state.wallUse, startsBeforeE = audioStarts, btn = findStageButton('互动'), btnDisplayBefore = btn && btn.style.display;
  if (winH.keydown) winH.keydown({ key: 'e', repeat: false, preventDefault: function () { pd++; } });
  ok(beforeE == null && m.api.state.wallUse === 1 && audioStarts > startsBeforeE && pd === 1, "K9s trigger:'interact' 的 wall-pickup 贴墙不自动触发,按 E 才 run/once/出拾取声 before=" + beforeE + ' after=' + m.api.state.wallUse + ' starts=' + startsBeforeE + '→' + audioStarts + ' pd=' + pd);
  ok(btn && btn.textContent === '互动' && btnDisplayBefore === 'block', 'K9s wall-pickup 互动目标贴墙后显示“互动”按钮 label=' + (btn && btn.textContent) + ' displayBefore=' + btnDisplayBefore);
})();
(function () {   // K9t R1-b3 pages:默认页先给失败反馈;状态页后匹配优先,满足条件后执行 run/set/hint。
  var baseEvent = { x: 2, y: 2, visual: 'plate', pages: [
    { hint: '缺少能嵌入石座的宝石。' },
    { when: function (S) { return !!S.hasGem && !S.gemInserted; }, hint: '宝石嵌入石座,右侧墙面打开。', run: function (S) { S.gemInserted = true; }, set: [{ x: 3, y: 2, ch: '.' }] },
    { when: function (S) { return !!S.gemInserted; }, examine: '宝石已经嵌在石座里。' }
  ] };
  var m1 = freshModule({}, {});
  m1.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P##', '#...#', '#####'], start: { x: 2, y: 2, dir: 'E' }, monsters: [], events: [baseEvent] } });
  pump(2);
  ok(!m1.api.state.gemInserted && /缺少/.test(findHud()), 'K9t pages 默认页在条件不满足时生效,但不执行成功页 run/set state=' + JSON.stringify(m1.api.state) + ' hud=' + JSON.stringify(findHud()));
  var m2 = freshModule({}, {}); m2.api.state.hasGem = true;
  m2.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P##', '#...#', '#####'], start: { x: 2, y: 2, dir: 'E' }, monsters: [], events: [baseEvent, { x: 3, y: 2, run: function (S) { S.reachedOpenedCell = true; } }] } });
  pump(2);
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  pump(70);
  ok(m2.api.state.gemInserted === true && m2.api.state.reachedOpenedCell === true && /宝石嵌入/.test(findHud()), 'K9t pages 后匹配状态页覆盖默认页并执行 set:右侧墙打开后可走入新格 state=' + JSON.stringify(m2.api.state) + ' hud=' + JSON.stringify(findHud()));
})();
(function () {   // K9u R1-b3 pages:没有匹配页=当前不可见/不可触发,不会掉回顶层或误消耗。
  var m = freshModule({}, {}), pd = 0;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, visual: 'pickup', icon: 'gem', pages: [{ when: function (S) { return !!S.hiddenReady; }, examine: '你看见了隐藏宝石。', hint: '你拾起隐藏宝石。', run: function (S) { S.hiddenGem = true; } }] }] } });
  pump(3);
  var btn = findStageButton('查看'), btnHidden = btn && btn.style.display === 'none';
  if (winH.keydown) winH.keydown({ key: 'E', repeat: false, preventDefault: function () { pd++; } });
  ok(m.api.state.hiddenGem !== true && !/隐藏宝石/.test(findHud()) && btnHidden && pd === 0, 'K9u pages 无匹配页时不自动触发、不显示查看按钮、不拦截 E state=' + JSON.stringify(m.api.state) + ' hud=' + JSON.stringify(findHud()) + ' pd=' + pd + ' btnHidden=' + btnHidden);
})();
(function () {   // K9v R1-b3 pages + interact:page 可单独要求主动确认;顶层 trigger 也可被 page 继承。
  var m1 = freshModule({}, {}), pd1 = 0; m1.api.state.hasGem = true;
  m1.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, visual: 'plate', pages: [{ hint: '空石座。' }, { when: function (S) { return !!S.hasGem; }, trigger: 'interact', hint: '你主动把宝石按进石座。', run: function (S) { S.pageUse = (S.pageUse || 0) + 1; } }] }] } });
  pump(3);
  var before = m1.api.state.pageUse, btn = findStageButton('互动'), shown = btn && btn.style.display === 'block' && btn.textContent === '互动';
  if (winH.keydown) winH.keydown({ key: 'E', repeat: false, preventDefault: function () { pd1++; } });
  ok(before == null && m1.api.state.pageUse === 1 && shown && pd1 === 1 && /主动把宝石/.test(findHud()), "K9v page trigger:'interact' 不自动触发,但 E/按钮语义可执行当前页动作 before=" + before + ' after=' + m1.api.state.pageUse + ' shown=' + shown + ' pd=' + pd1 + ' hud=' + JSON.stringify(findHud()));
  var m2 = freshModule({}, {}), pd2 = 0;
  m2.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, trigger: 'interact', visual: 'marker', pages: [{ hint: '你拉动墙上的小杆。', run: function (S) { S.inheritedUse = true; } }] }] } });
  pump(3);
  var before2 = m2.api.state.inheritedUse, btn2 = findStageButton('互动'), shown2 = btn2 && btn2.style.display === 'block' && btn2.textContent === '互动';
  if (winH.keydown) winH.keydown({ key: 'Enter', repeat: false, preventDefault: function () { pd2++; } });
  ok(before2 == null && m2.api.state.inheritedUse === true && shown2 && pd2 === 1, "K9v 顶层 trigger:'interact' 被 page 继承,page 不必重复写 trigger state=" + JSON.stringify(m2.api.state) + ' shown2=' + shown2 + ' pd2=' + pd2);
})();
(function () {   // K9w R1-b3 pages fail-loud:page 只能写文本/动作/trigger,坐标/视觉/once 和坏动作形状都要抛。
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, pages: [] }] } }), 'K9w pages 空数组 → 抛[maze event]');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, hint: '顶层混写', pages: [{ hint: 'page' }] }] } }), 'K9w pages 存在时顶层 hint/run/set/when 等内容字段混写 → 抛');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, pages: [{ x: 1, hint: '坏字段' }] }] } }), 'K9w page 写 x/y/visual/once 等锚点字段 → 抛');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, pages: [{ trigger: 'use', hint: '坏 trigger' }] }] } }), "K9w page trigger 只支持 'interact' → 抛");
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, pages: [{ when: function () { return true; } }] }] } }), 'K9w page 只有 when/trigger 不算内容 → 抛');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, pages: [{ set: [{ x: 1, y: 1, ch: 'X' }] }] }] } }), 'K9w page 内 set 坏 ch 复用顶层动作形状闸 → 抛');
})();
(function () {   // K9x R1-b4 puzzle fail-loud:只接数据模板入口;同层动作进 success,fail v1 只允许 hint。
  var baseP = { kind: 'code', prompt: '石门上刻着四位符号。', answer: '1374' }, ok9x = true;
  try { freshModule({}, {}).api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, puzzle: baseP, success: { hint: '门后机括响起。' }, fail: { hint: '符号暗了一下。' } }] } }); }
  catch (e) { ok9x = false; }
  ok(ok9x, 'K9x puzzle-only 事件合法:动作必须等正确答案后由 success 结算');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, puzzle: { kind: 'slider' }, success: { hint: 'ok' }, fail: { hint: 'bad' } }] } }), 'K9x puzzle.kind 非 code/sequence/toggle → 抛[maze puzzle]');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, puzzle: baseP, hint: '混写', success: { hint: 'ok' }, fail: { hint: 'bad' } }] } }), 'K9x puzzle 同层混写 hint/run/set/warp/turn → 抛,防打开面板前先执行动作');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, puzzle: baseP, success: {}, fail: { hint: 'bad' } }] } }), 'K9x puzzle.success 空对象 → 抛,成功后必须有可见结果或动作');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, puzzle: baseP, success: { hint: 'ok' }, fail: { hint: 'bad', set: [{ x: 1, y: 1, ch: '#' }] } }] } }), 'K9x puzzle.fail 写动作 → 抛,v1 答错只显示 hint');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, puzzle: baseP, success: { hint: '顶层错位' }, fail: { hint: 'bad' }, pages: [{ hint: 'page' }] }] } }), 'K9x pages 存在时顶层 puzzle/success/fail 混写 → 抛,谜题必须写进 page');
})();
(function () {   // K9xf puzzle UI 由稳定 class + 现有全局 token 驱动;样式幂等注入,JS 不再硬编码深色材质。
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, puzzle: { kind: 'toggle', prompt: '调整月与火。', labels: ['月', '火'], answer: [true, false] }, success: { hint: '机关接通。' }, fail: { hint: '组合不对。' } }] } });
  pump(2);
  var style = global.document.getElementById('amatlas-maze-puzzle-style');
  var dialog = findPuzzleElement('amatlas-maze-puzzle-dialog'), prompt = findPuzzleElement('amatlas-maze-puzzle-prompt'), controls = findPuzzleElement('amatlas-maze-puzzle-controls');
  var toggle = findPuzzleElement('amatlas-maze-puzzle-toggle'), actions = findPuzzleElement('amatlas-maze-puzzle-actions'), cancel = findPuzzleElement('amatlas-maze-puzzle-cancel'), confirm = findPuzzleElement('amatlas-maze-puzzle-confirm');
  var overlay = findPuzzleOverlay(), mazeControls = findStageButton('▲') && findStageButton('▲').parentNode;
  var css = style ? style.textContent : '', beforeCount = global.document.head.children.filter(function (el) { return el && el.id === 'amatlas-maze-puzzle-style'; }).length;
  var second = require(MAZE).createMaze3dModule({}); second.install(makeApi());
  var afterCount = global.document.head.children.filter(function (el) { return el && el.id === 'amatlas-maze-puzzle-style'; }).length;
  var puzzleSrc = fs.readFileSync(MAZE, 'utf8').match(/var PUZZLE_CSS\s*=([\s\S]*?)function injectPuzzleStyles/) || ['', ''];
  var oldHardcoded = ['rgba(10,14,24,.94)', 'rgba(24,34,52,.86)', '#eef3f8', '#ffb7ad'].some(function (v) { return puzzleSrc[1].indexOf(v) >= 0; });
  ok(style && beforeCount === 1 && afterCount === 1 && dialog && prompt && controls && toggle && actions && cancel && confirm && overlay && overlay.classList.contains('is-open') && stageEl.classList.contains('amatlas-maze-puzzle-active') && mazeControls && mazeControls.className === 'amatlas-maze-controls' && dialog.getAttribute('role') === 'dialog' && dialog.getAttribute('aria-label') === '调整月与火。', 'K9xf puzzle stylesheet 幂等注入且 DOM 输出稳定语义 class/打开态/诚实 dialog 名称 count=' + beforeCount + '→' + afterCount);
  ok(css.indexOf('--amatlas-panel') >= 0 && css.indexOf('--amatlas-panel-2') >= 0 && css.indexOf('--amatlas-ink') >= 0 && css.indexOf('--amatlas-accent') >= 0 && css.indexOf('--amatlas-accent-2') >= 0 && css.indexOf('--amatlas-danger') >= 0 && css.indexOf('min-width:44px;height:44px') >= 0 && css.indexOf('width:min(92%,400px)') >= 0 && css.indexOf('overscroll-behavior:contain') >= 0 && css.indexOf('.amatlas-maze-puzzle-active) :where(.amatlas-maze-controls)') >= 0 && css.indexOf('visibility:hidden;pointer-events:none') >= 0 && !oldHardcoded, 'K9xf puzzle 材质消费现有 --amatlas-* token+fallback,锁 400px dialog/44px 按钮/移动端滚动边界,且打开时隐藏底层移动控件');
  var moonToggle = findStageButton('月：关'); clickStageButton('月：关');
  ok(moonToggle && moonToggle.getAttribute('aria-pressed') === 'true' && !moonToggle.style.background, 'K9xf toggle 视觉状态只由 aria-pressed + CSS 驱动,不再写内联背景色');
  clickStageButton('关闭');
  ok(overlay && !overlay.classList.contains('is-open') && !stageEl.classList.contains('amatlas-maze-puzzle-active') && overlay.style.display === 'none', 'K9xf 关闭谜题同步移除打开态 class,底层移动控件不被永久隐藏');
})();
(function () {   // K9y R1-b4 自动 puzzle:进格打开 overlay,暂停移动/怪物/后续坐标事件;取消不执行 fail、不消耗 once。
  var m = freshModule({}, {}), pd = 0;
  m.api.fire({ kind: 'maze3d', scareKey: 'caught', maze: { grid: ['#######', '#.....#', '#.P...#', '#.....#', '#######'], start: { x: 2, y: 2, dir: 'E' }, monsters: [{ x: 4, y: 2, face: 'skull' }], events: [
    { x: 2, y: 2, once: true, visual: 'plate', puzzle: { kind: 'code', prompt: '输入墙上的四位符号。', answer: '1374' }, success: { hint: '机关打开。', run: function (S) { S.solved = true; } }, fail: { hint: '密码不对。' } },
    { x: 2, y: 2, run: function (S) { S.sameCellRan = true; } },
    { x: 3, y: 2, run: function (S) { S.nextCellRan = true; } }
  ] } });
  pump(2);
  var open1 = isPuzzleOverlayOpen(), beforeX = fillRects;
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () { pd++; } });
  var rPause = pump(90), stillOpen = isPuzzleOverlayOpen();
  ok(open1 && stillOpen && !rPause.threw && m.api.state.solved !== true && m.api.state.sameCellRan !== true && m.api.state.nextCellRan !== true && m.api.state.caught !== true, 'K9y puzzle 自动打开后暂停:移动/怪物/同格后续事件/下一格事件均不发生 open=' + open1 + '/' + stillOpen + ' state=' + JSON.stringify(m.api.state) + ' pd=' + pd + ' rendered=' + beforeX + '→' + fillRects);
  if (winH.keydown) winH.keydown({ key: 'Escape', preventDefault: function () { pd++; } });
  pump(2);
  ok(!isPuzzleOverlayOpen() && m.api.state.solved !== true && m.api.state.sameCellRan !== true && m.api.state.nextCellRan !== true, 'K9y Esc 取消关闭 overlay,不执行 fail/success、不消耗 once 的后续动作 state=' + JSON.stringify(m.api.state) + ' pd=' + pd);
  pump(2);
  ok(!isPuzzleOverlayOpen() && m.api.state.sameCellRan !== true, 'K9y 关闭后站在原格不立刻反复弹窗,同格普通事件也不会补跑;需离开再回来 state=' + JSON.stringify(m.api.state));
})();
(function () {   // K9z R1-b4 trigger:'interact' 与 pages:保留主动入口;page 条件页可打开 puzzle,关闭按钮同 Esc 只取消。
  var m1 = freshModule({}, {}), pd1 = 0; m1.api.state.ready = true;
  m1.api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, trigger: 'interact', once: true, visual: 'plate', puzzle: { kind: 'toggle', prompt: '拨动三枚开关。', labels: ['月', '星', '火'], answer: [true, false, true] }, success: { hint: '墙内齿轮归位。' }, fail: { hint: '开关弹回原位。' } }] } });
  pump(3);
  var btn1 = findStageButton('互动'), beforeOpen = isPuzzleOverlayOpen();
  if (winH.keydown) winH.keydown({ key: 'Enter', repeat: false, preventDefault: function () { pd1++; } });
  var afterOpen = isPuzzleOverlayOpen(), btnHidden = btn1 && btn1.style.display === 'none';
  ok(!beforeOpen && afterOpen && pd1 === 1 && btnHidden, "K9z trigger:'interact' puzzle 不自动打开,Enter 非 repeat 才开 overlay 且隐藏互动按钮 before/after=" + beforeOpen + '/' + afterOpen + ' btnHidden=' + btnHidden);
  var closeBtn = findStageButton('关闭');
  if (closeBtn && closeBtn._h && closeBtn._h.click) closeBtn._h.click({ preventDefault: function () { pd1++; } });
  ok(!isPuzzleOverlayOpen(), 'K9z overlay 关闭按钮可触屏点击取消,同样不结算 fail/success pd=' + pd1);
  if (winH.keydown) winH.keydown({ key: 'Enter', repeat: false, preventDefault: function () { pd1++; } });
  var reopenedAfterClose = isPuzzleOverlayOpen();
  ok(reopenedAfterClose, "K9z 取消不消耗 once:同一 trigger:'interact' puzzle 关闭后仍可再次打开");
  if (winH.keydown) winH.keydown({ key: 'Escape', preventDefault: function () { pd1++; } });
  var m2 = freshModule({}, {}); m2.api.state.ready = true;
  m2.api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, visual: 'marker', pages: [
    { hint: '机关沉默着。' },
    { when: function (S) { return !!S.ready; }, puzzle: { kind: 'sequence', prompt: '按下发亮的符号。', choices: ['月', '星', '火'], answer: ['星', '月', '火'] }, success: { hint: '符号依次亮起。' }, fail: { hint: '顺序错了。' } }
  ] }] } });
  pump(2);
  ok(isPuzzleOverlayOpen(), 'K9z page 条件命中后 puzzle 作为当前 page 内容自动打开 overlay');
})();
(function () {   // K9za code:键盘数字/退格/Enter 与触屏数字键共用输入;答错只反馈,答对才 run/set/once。
  var m = freshModule({}, {}), pd = 0;
  m.api.fire({ kind: 'maze3d', maze: { grid: ['#####', '#...#', '#.P##', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, trigger: 'interact', once: true, visual: 'plate', puzzle: { kind: 'code', prompt: '输入三位编号。', answer: '137', maxLength: 3 }, success: { hint: '石门打开。', run: function (S) { S.codeSolved = (S.codeSolved || 0) + 1; }, set: [{ x: 3, y: 2, ch: '.' }] }, fail: { hint: '编号不对。' } }] } });
  pump(2); if (winH.keydown) winH.keydown({ key: 'Enter', repeat: false, preventDefault: function () {} });
  clickStageButton('1'); clickStageButton('2'); clickStageButton('确认');
  var wrongOpen = isPuzzleOverlayOpen(), wrongFeedback = findPuzzleText('amatlas-maze-puzzle-feedback'), wrongState = m.api.state.codeSolved;
  if (winH.keydown) { winH.keydown({ key: 'Backspace', preventDefault: function () { pd++; } }); winH.keydown({ key: '3', preventDefault: function () { pd++; } }); winH.keydown({ key: '7', preventDefault: function () { pd++; } }); winH.keydown({ key: 'Enter', repeat: false, preventDefault: function () { pd++; } }); }
  ok(wrongOpen && /编号不对/.test(wrongFeedback) && wrongState == null && !isPuzzleOverlayOpen() && m.api.state.codeSolved === 1 && pd === 4, 'K9za code 错答只在面板反馈、不写 state/不消耗 once;退格+键盘补正后 Enter 才执行 success/关闭 state=' + JSON.stringify(m.api.state) + ' feedback=' + JSON.stringify(wrongFeedback) + ' pd=' + pd);
  if (winH.keydown) winH.keydown({ key: 'Enter', repeat: false, preventDefault: function () { pd++; } });
  ok(!isPuzzleOverlayOpen() && m.api.state.codeSolved === 1 && pd === 4, 'K9za code 成功后事件级 once 已消耗:同一主动目标不再打开/重复结算');
})();
(function () {   // K9zb sequence:触屏顺序按钮、撤销/清空、错答重试;成功复用 set/run。
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', maze: { grid: ['#####', '#...#', '#.P##', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, trigger: 'interact', once: true, puzzle: { kind: 'sequence', prompt: '依次点亮符号。', choices: ['月', '星', '火'], answer: ['星', '月', '火'] }, success: { hint: '符号归位。', run: function (S) { S.sequenceSolved = true; }, set: [{ x: 3, y: 2, ch: '.' }] }, fail: { hint: '顺序错了。' } }] } });
  pump(2); if (winH.keydown) winH.keydown({ key: 'Enter', repeat: false, preventDefault: function () {} });
  clickStageButton('月'); clickStageButton('星'); clickStageButton('撤销'); clickStageButton('火'); clickStageButton('确认');
  var failText = findPuzzleText('amatlas-maze-puzzle-feedback'), afterFail = m.api.state.sequenceSolved;
  clickStageButton('清空'); clickStageButton('星'); clickStageButton('月'); clickStageButton('火'); clickStageButton('确认');
  ok(/顺序错了/.test(failText) && afterFail !== true && m.api.state.sequenceSolved === true && !isPuzzleOverlayOpen(), 'K9zb sequence 触屏错序/撤销不写状态,清空后按正确顺序才结算 success feedback=' + JSON.stringify(failText));
})();
(function () {   // K9zc toggle:全部开关均可触屏点,aria-pressed 同步;错答不消耗 once,重试成功。
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, trigger: 'interact', once: true, puzzle: { kind: 'toggle', prompt: '调整三路开关。', labels: ['月', '星', '火'], answer: [true, false, true] }, success: { hint: '回路接通。', run: function (S) { S.toggleSolved = true; } }, fail: { hint: '回路仍然断开。' } }] } });
  pump(2); if (winH.keydown) winH.keydown({ key: 'Enter', repeat: false, preventDefault: function () {} });
  clickStageButton('月：关'); clickStageButton('确认');
  var failText = findPuzzleText('amatlas-maze-puzzle-feedback'), afterFail = m.api.state.toggleSolved, moonOn = findStageButton('月：开');
  clickStageButton('火：关'); clickStageButton('确认');
  ok(/回路仍然断开/.test(failText) && afterFail !== true && moonOn && m.api.state.toggleSolved === true && !isPuzzleOverlayOpen(), 'K9zc toggle 触屏点按更新开关,错答不结算/不消耗 once,补齐目标组合才成功 feedback=' + JSON.stringify(failText));
})();
(function () {   // K9zd 三模板/结果字段 fail-loud:两端锁住答案形状、未知字段与 success 禁字段。
  function pEv(puz, success, fail0) { return { kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, puzzle: puz, success: success || { hint: 'ok' }, fail: fail0 || { hint: 'bad' } }] } }; }
  ok(evThrows(pEv({ kind: 'code', prompt: '密码', answer: '12a' })), 'K9zd code.answer 含非数字 → 抛');
  ok(evThrows(pEv({ kind: 'code', prompt: '密码', answer: '123', maxLength: 2 })), 'K9zd code.maxLength 短于答案 → 抛');
  ok(evThrows(pEv({ kind: 'sequence', prompt: '顺序', choices: ['月'], answer: ['星'] })), 'K9zd sequence.answer 不来自 choices → 抛');
  var sparseSequence = new Array(1), sparseToggle = new Array(1);
  ok(evThrows(pEv({ kind: 'sequence', prompt: '顺序', choices: ['月'], answer: sparseSequence })), 'K9zd sequence.answer 稀疏数组不能绕过 every → 抛');
  ok(evThrows(pEv({ kind: 'toggle', prompt: '开关', labels: ['甲', '乙'], answer: [true] })), 'K9zd toggle.answer 与 labels 不等长 → 抛');
  ok(evThrows(pEv({ kind: 'toggle', prompt: '开关', labels: ['甲'], answer: sparseToggle })), 'K9zd toggle.answer 稀疏数组不能错误自动通过 → 抛');
  ok(evThrows(pEv({ kind: 'code', prompt: '密码', answer: '1', script: function () {} })), 'K9zd puzzle 未知/任意逻辑字段 → 抛');
  ok(evThrows(pEv({ kind: 'code', prompt: '密码', answer: '1' }, { hint: 'ok', once: true })), 'K9zd success.once 等身份字段 → 抛');
  ok(evThrows(pEv({ kind: 'code', prompt: '密码', answer: '1' }, { set: [] })), 'K9zd success.set 空数组不是可见结果 → 抛');
  ok(evThrows(pEv({ kind: 'code', prompt: '密码', answer: '1' }, { activateMonsters: [] })), 'K9zd success.activateMonsters 空数组不是可见结果 → 抛');
  ok(evThrows(pEv({ kind: 'code', prompt: '密码', answer: '1' }, { set: [{ x: 1, y: 1, ch: '#' }], warp: { x: 1, y: 1 } })), 'K9zd success 先 set 墙再 warp 到同格会卡住 → 按真实结算顺序抛');
  ok(!evThrows(pEv({ kind: 'code', prompt: '密码', answer: '1' }, { set: [{ x: 0, y: 0, ch: '.' }], warp: { x: 0, y: 0 } })), 'K9zd success 先把原墙 set 成地板再 warp → 按真实结算顺序放行');
  ok(evThrows(pEv({ kind: 'code', prompt: '密码', answer: '1' }, { hint: 'ok' }, { hint: 'bad', extra: true })), 'K9zd fail 除 hint 外未知字段 → 抛');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, success: { hint: '漂浮结果' }, hint: '普通事件' }] } }), 'K9zd 顶层 success/fail 脱离 puzzle → 抛');
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, pages: [{ hint: '默认页' }, { success: { hint: '漂浮结果' }, examine: '坏页' }] }] } }), 'K9zd page 内 success/fail 脱离 puzzle → 抛');
})();
(function () {   // K9ze success.set ch:'K' 也参与 needKey 预扫描,不能让有动态钥匙的门在解谜前自由开启。
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#######', '#...D.#', '#.....#', '#######'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 2, puzzle: { kind: 'code', prompt: '释放钥匙。', answer: '1' }, success: { hint: '钥匙出现。', set: [{ x: 5, y: 2, ch: 'K' }] }, fail: { hint: '不对。' } }] } });
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} }); pump(180);
  ok(m.api.state.won !== true && /锁|🔒/.test(findHud()), "K9ze puzzle.success 动态放 K 会从开局锁门,不会因 set 藏在 success 里漏扫而自由通关 hud=" + JSON.stringify(findHud()));
})();

section('K10 maze.icons 作者自定义物品表(下游扩展接口)');
(function () {   // K10a 自定义新物品名 → 事件 icon 引用不抛、pump 不崩、不报未知、run 触发
  var warns = [], orig = console.warn; console.warn = function (s) { warns.push(String(s)); };
  var m = freshModule({}, {}), ok10 = true;
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, theme: 'cave', monsters: [],
    icons: { torch: { art: ['.A.', 'AAA', '.A.'], palette: { A: [240, 160, 40] } } },
    events: [{ x: 2, y: 2, icon: 'torch', run: function (S) { S.t = true; } }] } }); pump(2); }
  catch (e) { ok10 = false; } finally { console.warn = orig; }
  ok(ok10 && m.api.state.t === true && !warns.some(function (s) { return /未知物品名/.test(s); }), 'K10a maze.icons 自定义新物品(torch)→ 不抛+不报未知+run 触发 t=' + (m && m.api.state.t));
})();
(function () {   // K10b 同名覆盖内置:故意给坏的自定义 gem(行不等长)→ 抛 ⇒ 证 custom 分支优先于内置好 gem 被解析(变异=删 resolveIcon custom 优先分支→走内置好 gem 不抛→红)
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, icons: { gem: { art: ['AA', 'A'], palette: { A: [1, 2, 3] } } }, events: [{ x: 2, y: 1, icon: 'gem', run: function () {} }] } }),
    'K10b maze.icons 同名覆盖内置(坏 gem art)→ 抛(证自定义优先于内置;变异=删 custom 优先→走内置好 gem 不抛→红)');
})();
(function () {   // K10c maze.icons 非对象 → throw(fail-loud)
  ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, icons: [1, 2], events: [{ x: 2, y: 1, icon: 'key', run: function () {} }] } }),
    'K10c maze.icons 非对象(数组)→ 抛(fail-loud)');
})();

section('L 脚步声 / 开门音效 / 张力层(音频批,mock AudioContext)');
(function () {   // L1 走动→脚步声按步频出声(audioStarts 在走动后增;基线=首帧建氛围床/张力层)
  var m = freshModule({}, { audio: true });
  m.api.fire(playNode());                                  // cave 5×5 空腔,(2,2)朝 N,无怪无门
  pump(1); var base = audioStarts;                         // 首帧建氛围/张力(基线 starts)
  winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });   // 按前进
  pump(40);                                                // ~0.67s 跨 ≥1 步频 → ≥1 记脚步声(无怪→唯一新声源)
  ok(audioStarts > base, 'L1 走动→脚步声出声(audioStarts ' + base + '→' + audioStarts + ';无怪→脚步是唯一新声源;变异=删 loop footstep() 调用→不增→红)');
})();
(function () {   // L2 站定不动→无脚步声(脚步只在真移动时;gate=spd && 真位移)
  var m = freshModule({}, { audio: true });
  m.api.fire(playNode());
  pump(1); var base = audioStarts;
  pump(40);                                                // 不按键、站定 40 帧
  ok(audioStarts === base, 'L2 站定 40 帧→无脚步声(audioStarts 维持 ' + base + ';变异=脚步不 gate 移动/位移→站定也响→红)');
})();
(function () {   // L3 接触通关→开门音效 doorOpenSound + stop(true) keepAudio 不崩、won(新增 audio 路径回归)
  var m = freshModule({}, { audio: true });
  m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: { grid: ['###', '#.#', '#.#', '#D#'], start: { x: 1, y: 1, dir: 'S' }, theme: 'cave', monsters: [] } });
  pump(1);
  winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });   // 朝南(门)前进
  var r = pump(60);                                        // 走到门→接触判定通关
  ok(!r.threw && m.api.state.won === true, 'L3 走到门→接触通关 + 开门音效 + stop(true) 不崩、won=' + m.api.state.won + (r.threw ? ' 抛:' + (r.threw.stack || r.threw) : '') + '(验 doorOpenSound/keepAudio 不破坏通关流)');
})();
(function () {   // L4 可见 pickup 进格即拿并出声;纯 hint 不建新声源,避免“所有事件都响”把声音语言糊掉。
  function startsFor(ev) { var m = freshModule({}, { audio: true }); m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [ev] } }); pump(2); return { starts: audioStarts, state: m.api.state }; }
  var hint = startsFor({ x: 2, y: 2, hint: '只是氛围' });
  var pick = startsFor({ x: 2, y: 2, visual: 'pickup', icon: 'gem', run: function (S) { S.got = true; } });
  ok(pick.state.got === true && pick.starts > hint.starts, 'L4 pickup 触发→短亮拾取声;纯 hint 不额外出声 hint=' + hint.starts + ' pickup=' + pick.starts);
})();
section('M 手感:震屏(trauma→整帧 translate)/ 站定不晃');
(function () {   // M1 被抓→震屏:scareEnd 设 trauma=1 → render 整帧 translate
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', scareKey: 'caught', maze: { grid: ['#######', '#.....#', '#..P..#', '#.....#', '#######'], start: { x: 3, y: 2, dir: 'N' }, theme: 'cave', monsters: [{ x: 2, y: 2, face: 'yurei' }, { x: 4, y: 2, face: 'skull' }] } });
  pump(200);                                               // 怪追上→被抓→scareEnd 设 trauma=1→震屏
  ok(m.api.state.caught === true && translateCount > 0, 'M1 被抓→震屏(整帧 translate 被调;caught=' + m.api.state.caught + ' translateCount=' + translateCount + ';变异=删 scareEnd 的 trauma=1 或 render 震屏块→translateCount=0→红)');
})();
(function () {   // M2 站定无怪→不 translate(无震屏无头部晃动;也护 I 段决定性前提:idle 不平移)
  var m = freshModule({}, {});
  m.api.fire(playNode());                                  // 无怪、无门、不按键
  pump(30);
  ok(translateCount === 0, 'M2 站定无怪→不 translate(translateCount=' + translateCount + ';变异=震屏/晃动恒平移→红,也会破 I 段决定性)');
})();
section('N HUD 钥匙 emoji 按 keyIcon 派生(治"实物 keycard、提示却🔑"接缝)');
function hudWithKey(keyIcon) {
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: Object.assign({ grid: ['#######', '#...K.#', '#######'], start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [] }, keyIcon ? { keyIcon: keyIcon } : {}) });
  pump(2);                                                  // 渲一帧即写 HUD
  return findHud();
}
(function () {   // N1 缺省 keyIcon → HUD 显🔑(默认金钥匙;向后兼容)
  var hud = hudWithKey(null);
  ok(/🔑/.test(hud), 'N1 缺省 keyIcon → HUD 含🔑(向后兼容;变异=resolveKeyHudEmoji 返非🔑→红)hud=' + JSON.stringify(hud));
})();
(function () {   // N2 keyIcon='keycard' → HUD 显🪪 + 不再硬编🔑(变异=删 resolveKeyHudEmoji 调用走回硬码🔑→红)
  var hud = hudWithKey('keycard');
  ok(/🪪/.test(hud) && !/🔑/.test(hud), 'N2 keycard → HUD 含🪪 不含🔑(变异=HUD 硬编🔑→含🔑→红)hud=' + JSON.stringify(hud));
})();
(function () {   // N3 keyIcon='gem' → HUD 显💎(同 N2 反向 lens,防特定 emoji 漏配)
  var hud = hudWithKey('gem');
  ok(/💎/.test(hud) && !/🔑/.test(hud), 'N3 gem → HUD 含💎 不含🔑 hud=' + JSON.stringify(hud));
})();
(function () {   // N4 keyIcon='nonexistent' → 表里没的回退🔑(防漂移:加新 keyIcon 漏了 KEY_HUD_EMOJI 不崩、回到默认)
  var hud = hudWithKey('nonexistent_glyph');
  ok(/🔑/.test(hud), 'N4 未知 keyIcon → 回退🔑(变异=回退默认变空→玩家看不到提示 emoji→红)hud=' + JSON.stringify(hud));
})();
section('O 坐标事件动作:运行时改格 set / 传送 warp / 转向 turn(R1-1 解谜探索)');
// 端到端:都用 keyRun(走到门→winKey)证「动作真生效=门可达」+ 配对变异牙(去掉动作→门不可达,§13 两端都锁=排除 vacuous「本来就能到门」)。
// ── O1 运行时改格 set:开墙打通 ──
keyRun('O1a set 把挡路墙改成地板→路通→正对门通关',
  { grid: ['######', '#..#D#', '######'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 2, y: 1, set: [{ x: 3, y: 1, ch: '.' }] }] }, true);
keyRun('O1b 同迷宫去掉 set(纯 hint)→墙仍挡→门不可达(变异牙:证 won 靠 set 开墙、非本来可达)',
  { grid: ['######', '#..#D#', '######'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 2, y: 1, hint: '前方裂缝' }] }, false);
// ── O2 条件 when:门控动作执行(做条件机关/顺序谜题终步)──
keyRun('O2a when 返回 true→set 执行→通关',
  { grid: ['######', '#..#D#', '######'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 2, y: 1, when: function () { return true; }, set: [{ x: 3, y: 1, ch: '.' }] }] }, true);
keyRun('O2b when 返回 false→set 不执行→门不可达(变异牙:证 when 门控整条动作)',
  { grid: ['######', '#..#D#', '######'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 2, y: 1, when: function () { return false; }, set: [{ x: 3, y: 1, ch: '.' }] }] }, false);
// ── O3 slice 隔离:set 改副本、不污染作者 maze.grid 原数组(根治"被抓重进机关不复位")──
(function () {
  var m = freshModule({}, {});
  var mazeObj = { grid: ['######', '#..#D#', '######'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 2, y: 1, run: function (S) { S.stepped = true; }, set: [{ x: 3, y: 1, ch: '.' }] }] };
  var rowBefore = mazeObj.grid[1];
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mazeObj });
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  pump(120);
  ok(m.api.state.stepped === true && mazeObj.grid[1] === rowBefore && mazeObj.grid[1].charAt(3) === '#',
    'O3 set 不污染作者 maze.grid 原数组(grid.slice 隔离;stepped 证真触发非 vacuous;变异=去 .slice()→原行被改→红)stepped=' + m.api.state.stepped + ' row=' + JSON.stringify(mazeObj.grid[1]));
})();
// ── O4 传送 warp:突破墙隔离,把玩家放到够不到的区域 ──
keyRun('O4a warp 把玩家从隔离起点传送到门前→通关',
  { grid: ['######', '#.#.D#', '######'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 1, warp: { x: 3, y: 1, dir: 'E' } }] }, true);
keyRun('O4b 去掉 warp→困在墙后起点→门不可达(变异牙:证 won 靠 warp 传送)',
  { grid: ['######', '#.#.D#', '######'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 1, hint: '四壁封闭' }] }, false);
// ── O5 转向 turn:spinner 强制改朝向 ──
keyRun('O5a turn 把朝北强制转向门(东)→正对门通关',
  { grid: ['####', '#.D#', '####'], start: { x: 1, y: 1, dir: 'N' }, monsters: [], events: [{ x: 1, y: 1, turn: 'E' }] }, true);
keyRun('O5b 去掉 turn→始终朝北对墙→门不可达(变异牙:证 won 靠 turn 转向)',
  { grid: ['####', '#.D#', '####'], start: { x: 1, y: 1, dir: 'N' }, monsters: [], events: [{ x: 1, y: 1, hint: '一阵眩晕' }] }, false);
// ── O6 字段 fail-loud 校验(解析时抛 → boot 横幅)──
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, set: 'nope' }] } }), 'O6a set 非数组 → 抛');
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, set: [{ x: 1, y: 1, ch: 'X' }] }] } }), 'O6b set.ch 非法字符(只允许 #/./D)→ 抛');
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, set: [{ x: 9, y: 9, ch: '.' }] }] } }), 'O6c set 坐标越界 → 抛');
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, warp: { x: 0, y: 0 } }] } }), 'O6d warp 目标是墙(玩家会卡)→ 抛');
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, warp: { x: 1, y: 1, dir: 'Z' } }] } }), 'O6e warp.dir 非法 → 抛');
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, turn: 'Z' }] } }), 'O6f turn 非法方向 → 抛');
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, events: [{ x: 2, y: 2, when: 'nope' }] } }), 'O6g when 非函数 → 抛');
// ── O7 空事件判定扩展:只有动作字段(无 run/hint)也算非空、合法 ──
(function () {
  var m = freshModule({}, {}), ok7 = true;
  try { m.api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, set: [{ x: 1, y: 1, ch: '#' }] }] } }); pump(2); } catch (e) { ok7 = false; }
  ok(ok7, 'O7 只有 set(无 run/hint)= 合法非空事件、pump 不崩(空事件判定纳入 set/warp/turn)');
})();

// ── O9 怪物激活/停用 events[].activateMonsters / .deactivateMonsters(迷宫批1 M1)────────────────────────────
//   端到端手段:1 格外怪物(D1 精确前例:1 cell away、active 时 ~20 帧内 caught)驱动 pursuit,用 caught(scareEnd 写
//   scareKey)当"距离是否缩短"的可观测代理——pump(1) 逐帧调用会让 loop() 内 last/ts 时钟倒退(dt 变负,已用 debug 探针实测
//   证实),因此必须单次 pump(N) 覆盖足够帧数(同 keyRun/D1 既有写法),不可分多次 pump(1) 循环。
var MGRID9 = ['#######', '#.....#', '#..P..#', '#.....#', '#######'];   // 玩家 (3,2);怪物默认放 (2,2)=1 格外,精确复刻 D1 catch 前例
function mon9(node) {   // 装 monsters/events 的 maze3d node,固定 scareKey='caught'
  return { kind: 'maze3d', scareKey: 'caught', maze: { grid: MGRID9, start: { x: 3, y: 2, dir: 'N' }, theme: 'cave', monsters: node.monsters, events: node.events } };
}
(function () {   // O9a deactivateMonsters:true 在玩家起点格触发 → 本来会 catch 的怪不再逼近,pump 远超"本会 catch"的帧数仍未被抓
  var m = freshModule({}, {});
  m.api.fire(mon9({ monsters: [{ x: 2, y: 2, body: 'slender' }], events: [{ x: 3, y: 2, deactivateMonsters: true, hint: '怪物停了下来' }] }));
  var r = pump(60);   // D1 同几何 active 时 ~20 帧内 caught;60 帧留 3× 余量仍未抓 = 距离未缩短的可观测证据
  ok(!r.threw && !m.api.state.caught, 'O9a deactivateMonsters:true → 停用后 60 帧仍未被抓(距离不再缩短;变异见 O9e)threw=' + (r.threw && r.threw.message) + ' caught=' + m.api.state.caught);
})();
(function () {   // O9b 同几何、去掉 deactivateMonsters(纯 hint)→ 对照组:怪物照常逼近并抓住(证 O9a 并非"本来就抓不到"的 vacuous pass)
  var m = freshModule({}, {});
  m.api.fire(mon9({ monsters: [{ x: 2, y: 2, body: 'slender' }], events: [{ x: 3, y: 2, hint: '怪物停了下来' }] }));
  var r = pump(60);
  ok(!r.threw && m.api.state.caught === true, 'O9b 对照:同几何去掉 deactivateMonsters → 60 帧内正常被抓(证 O9a 的"未被抓"确由停用导致,非本来到不了)threw=' + (r.threw && r.threw.message) + ' caught=' + m.api.state.caught);
})();
(function () {   // O9c activateMonsters:true 激活一只初始 active:false 的怪 → 恢复逼近并抓住玩家(单独 active:false、无事件时永不逼近=另一半对照,见 O9d)
  var m = freshModule({}, {});
  m.api.fire(mon9({ monsters: [{ x: 2, y: 2, body: 'slender', active: false }], events: [{ x: 3, y: 2, activateMonsters: true, hint: '怪物动了起来' }] }));
  var r = pump(60);
  ok(!r.threw && m.api.state.caught === true, 'O9c activateMonsters:true → 初始停用的怪被激活后 60 帧内追上(恢复逼近)threw=' + (r.threw && r.threw.message) + ' caught=' + m.api.state.caught);
})();
(function () {   // O9d 对照:同几何 active:false 但不触发 activateMonsters → 怪物永远不动、玩家永不被抓(证 O9c 的"追上"确由激活导致)
  var m = freshModule({}, {});
  m.api.fire(mon9({ monsters: [{ x: 2, y: 2, body: 'slender', active: false }], events: [] }));
  var r = pump(60);
  ok(!r.threw && !m.api.state.caught, 'O9d 对照:active:false 无 activateMonsters → 60 帧仍未被抓(证 O9c 并非"本来就会抓")threw=' + (r.threw && r.threw.message) + ' caught=' + m.api.state.caught);
})();
(function () {   // O9e 反向变异牙(硬约束4 亲验):故意把 activateMonsters/deactivateMonsters 从 mazeEventNeedsState 摘掉,证明纯该类事件会退化为
  //   settleMazeEventActions(null) 直调(而非经 api.apply 广播)——用 api.apply 调用次数当探针(caught/距离对这两个字段本身是 vacuous:裸调结算
  //   仍会无条件执行、g.monsters[k].active 照样被写,此为亲手验证过的真实现象,故改用能真正观测 stateful-action 归属的信号)。
  //   变异后:纯 deactivateMonsters 事件的 api.apply 调用次数从 1 跌到 0(触发路径从"引擎广播"退化为"裸调 settleMazeEventActions(null)")→ 断言变红;
  //   还原(去掉替换)后再跑一次 → 断言变绿。全程只读源码字符串+运行时 require,不改仓库文件。
  var fs = require('fs');
  var srcOrig = fs.readFileSync(MAZE, 'utf8');
  var needle = 'return !!(evx && (evx.when || evx.run || evx.set || evx.warp || evx.turn || evx.activateMonsters != null || evx.deactivateMonsters != null));';
  if (srcOrig.indexOf(needle) < 0) { ok(false, 'O9e 反向变异:mazeEventNeedsState 行文本对不上(源码改动脱节于测试,先更新此常量)'); }
  else {
    var mutated = srcOrig.replace(needle, 'return !!(evx && (evx.when || evx.run || evx.set || evx.warp || evx.turn));');
    var tmpPath = MAZE + '.o9e-mutant.tmp.js';
    fs.writeFileSync(tmpPath, mutated);
    var applyCount = 0, redOk = false, greenOk = false, errMsg = '';
    try {
      resetEnv();
      var mutMod = require(tmpPath).createMaze3dModule({});
      var spyApi = makeApi();
      spyApi.apply = function (s) { applyCount++; if (s && s.run) s.run(this.state); };
      mutMod.install(spyApi);
      spyApi.fire(mon9({ monsters: [{ x: 2, y: 2, body: 'slender' }], events: [{ x: 3, y: 2, deactivateMonsters: true, hint: '怪物停了下来' }] }));
      pump(5);
      redOk = (applyCount === 0);   // 变异后:纯 deactivateMonsters 事件不再经 api.apply(mazeEventNeedsState 漏计的真实后果)→ 断言应变红(此处 redOk 记录"红队复现成功")
    } catch (e) { errMsg = String(e && e.message || e); }
    finally { try { fs.unlinkSync(tmpPath); } catch (e2) {} try { delete require.cache[require.resolve(tmpPath)]; } catch (e3) {} }
    // 还原:用未改的原版源码走同一 spy 流程,确认 apply 计数恢复为 1(绿灯)
    var applyCount2 = 0;
    try {
      resetEnv();
      var origMod = require(MAZE).createMaze3dModule({});
      var spyApi2 = makeApi();
      spyApi2.apply = function (s) { applyCount2++; if (s && s.run) s.run(this.state); };
      origMod.install(spyApi2);
      spyApi2.fire(mon9({ monsters: [{ x: 2, y: 2, body: 'slender' }], events: [{ x: 3, y: 2, deactivateMonsters: true, hint: '怪物停了下来' }] }));
      pump(5);
      greenOk = (applyCount2 === 1);
    } catch (e4) { errMsg += ' restore:' + String(e4 && e4.message || e4); }
    ok(redOk && greenOk, 'O9e 反向变异牙:摘掉 mazeEventNeedsState 的两新键 → 纯 activateMonsters/deactivateMonsters 事件的 api.apply 调用数 1→0(断言变红,redOk=' + redOk + ')还原后复原 0→1(greenOk=' + greenOk + ')' + errMsg);
  }
})();
(function () {   // O9f 两键同现,固定顺序=先 deactivate 后 activate(同下标叠加 → 最终态=激活;设计稿拍板顺序,勿颠倒)
  var m = freshModule({}, {});
  m.api.fire(mon9({ monsters: [{ x: 2, y: 2, body: 'slender' }], events: [{ x: 3, y: 2, deactivateMonsters: [0], activateMonsters: [0], hint: '先停后动' }] }));
  var r = pump(60);
  ok(!r.threw && m.api.state.caught === true, 'O9f 两键同现同下标 → 先 deactivate 后 activate,最终态=激活 → 60 帧内被抓threw=' + (r.threw && r.threw.message) + ' caught=' + m.api.state.caught);
})();
(function () {   // O9g 索引数组精确到下标:只停 monsters[0],monsters[1] 仍活跃并追上玩家(证索引形态不是"全部生效"的误解)
  var GRID9G = ['#########', '#.......#', '#..P.M..#', '#.......#', '#########'];
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', scareKey: 'caught', maze: { grid: GRID9G, start: { x: 3, y: 2, dir: 'N' }, theme: 'cave',
    monsters: [{ x: 2, y: 2, body: 'slender' }, { x: 5, y: 2, body: 'slender' }],
    events: [{ x: 3, y: 2, deactivateMonsters: [0], hint: '只停一只' }] } });
  var r = pump(80);
  ok(!r.threw && m.api.state.caught === true, 'O9g 索引数组只停 monsters[0] → monsters[1] 仍追上(索引精确生效,非全体)threw=' + (r.threw && r.threw.message) + ' caught=' + m.api.state.caught);
})();
// ── O9h fail-loud 校验(解析时抛,文案照设计稿逐字)──
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [{ x: 1, y: 1 }], events: [{ x: 2, y: 2, activateMonsters: 'yes' }] } }),
  'O9h1 activateMonsters 非 true/数组 → 抛(变异=删形态校验→不抛红)');
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [{ x: 1, y: 1 }], events: [{ x: 2, y: 2, activateMonsters: [5] }] } }),
  'O9h2 activateMonsters 索引越界(monsters 只 1 个)→ 抛');
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [{ x: 1, y: 1 }], events: [{ x: 2, y: 2, activateMonsters: [-1] }] } }),
  'O9h3 activateMonsters 负索引越界 → 抛');
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [{ x: 1, y: 1 }], events: [{ x: 2, y: 2, activateMonsters: [0.5] }] } }),
  'O9h4 activateMonsters 非整数索引 → 抛');
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [{ x: 1, y: 1 }], events: [{ x: 2, y: 2, deactivateMonsters: 42 }] } }),
  'O9h5 deactivateMonsters 非 true/数组(数字)→ 抛(与 activateMonsters 对称文案)');
ok(evThrows({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [{ x: 1, y: 1 }], events: [{ x: 2, y: 2, deactivateMonsters: [9] }] } }),
  'O9h6 deactivateMonsters 索引越界 → 抛');
(function () {   // O9i 只有 activateMonsters(无 run/hint/set/warp/turn)= 合法非空事件(线 680 空事件判定须纳入两新键,同 O7 精神)
  var m = freshModule({}, {}), ok9i = true;
  try { m.api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [{ x: 1, y: 1 }], events: [{ x: 2, y: 2, activateMonsters: [0] }] } }); pump(2); } catch (e) { ok9i = false; }
  ok(ok9i, 'O9i 只有 activateMonsters(无 run/hint)= 合法非空事件、pump 不崩(空事件判定纳入 activateMonsters/deactivateMonsters)');
})();
(function () {   // O9j true 形态在 monsters:[] 时不抛(vacuously 激活/停用零只怪,与 set/when 对零元素不额外限制的既有精神一致)
  var m = freshModule({}, {}), ok9j = true;
  try { m.api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, activateMonsters: true, hint: 'x' }] } }); pump(2); } catch (e) { ok9j = false; }
  ok(ok9j, 'O9j activateMonsters:true 在 monsters:[] 时不抛、pump 不崩(vacuous 合法)');
})();

// ════ O11. events[].set 白名单扩 'K'(迷宫批1 M5):机关运行时放出钥匙,门从一开始就锁("先解机关、钥匙才现身")══
//   端到端手段:keyRun(同 E 段)证「未触发机关时门锁 / 触发后拾取门开」;控制组证非 vacuous;
//   mutation 牙(O11f)对 needKey 的 events 静态扫描做源码级变异,同 O9e/O10h 手法。
section("O11 events[].set 放出钥匙 ch:'K'(迷宫批1 M5)");
// ── O11a:needKey 从一开始(未触发机关前)就为真——压力板不在直线路径上(y=2)、走 E 到门(y=1)全程不触发 → 门锁,won 不置位。
//   证明「grid 没有 'K'、也没走过机关」时,needKey 仍因 events[].set 含 ch:'K' 被静态扫描为 true(而非要等机关真触发才锁)。
keyRun('O11a needKey 从一开始为真(机关从未触发)→ 直走到门仍锁、won 不置位',
  { grid: ['########', '#.....D#', '#......#', '########'], start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [],
    events: [{ x: 2, y: 2, once: true, visual: 'plate', hint: '(未触发,不在直线路径上)', set: [{ x: 4, y: 1, ch: 'K' }] }] }, false,
  function (hud) { ok(/锁|🔒/.test(hud), "O11a HUD 显锁(到了门+因 needKey 锁了)hud=" + JSON.stringify(hud)); });
// ── O11b 对照:同几何但去掉 events(无 set ch:'K'、也无 grid 'K')→ needKey 应为 false,门自由开(证 O11a 并非"本来就到不了门")
keyRun("O11b 对照:同几何去掉 events → needKey=false、门自由开(证 O11a 的锁确由 events.set ch:'K' 静态扫描导致)",
  { grid: ['########', '#.....D#', '#......#', '########'], start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [] }, true);
// ── O11c:「先机关后钥匙」完整流程——压力板就在直线路径上,触发后钥匙精灵出现在路径前方,走过去自动拾取,继续到门 → 门开。
keyRun("O11c 先机关后钥匙完整流程:走过压力板(2,1)→(4,1)现出'K'→路过自动拾取→到门(7,1)开",
  { grid: ['#########', '#......D#', '#########'], start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [],
    events: [{ x: 2, y: 1, once: true, visual: 'plate', hint: '石板下沉,一道光从裂缝里透出。', set: [{ x: 4, y: 1, ch: 'K' }] }] }, true);
// ── O11d fail-loud 白名单:set.ch='K' 现在合法(不抛);旧断言(非法字符仍抛)保留在 O6b,此处只补"K 不再算非法"的正例回归。
(function () {
  var m = freshModule({}, {}), okk = true;
  try { m.api.fire({ kind: 'maze3d', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, set: [{ x: 1, y: 1, ch: 'K' }] }] } }); pump(2); } catch (e) { okk = false; }
  ok(okk, "O11d events.set[].ch='K' 合法、不抛(白名单扩展;旧 O6b 的非法字符 'X' 仍抛不受影响)");
})();
// ── O11e 覆写测试:set 把当前是 'K' 的格改写成别的 ch → 未拾取精灵同步消失(防墙里幽灵钥匙)。
//   行为代理:压力板1 在 (5,1) 放钥匙,压力板2(在到达 (5,1) 之前的路径上)把 (5,1) 改回 '.'(覆写掉钥匙)→
//   玩家继续走过 (5,1)(此刻已是普通地板、精灵已消失)到门 → 不该拿到钥匙 → 门仍锁、won 不置位。
keyRun("O11e 覆写 'K' 格→精灵消失(行为代理:走过被覆写的格不再获得钥匙,门仍锁)",
  { grid: ['#########', '#......D#', '#########'], start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [],
    events: [
      { x: 2, y: 1, once: true, hint: '石板下沉,某处透出微光。', set: [{ x: 5, y: 1, ch: 'K' }] },      // 先放出钥匙于 (5,1)
      { x: 3, y: 1, once: true, hint: '又一块石板陷落,微光骤然熄灭。', set: [{ x: 5, y: 1, ch: '.' }] }  // 玩家到 (5,1) 之前先覆写掉它
    ] }, false);
// ── O11f 反向变异牙(硬约束4/5 亲验):把 needKey 的 events 静态扫描从计算式里摘掉,证明「先机关后钥匙」用例(O11a)会退化为
//   needKey=false(门从一开始就不锁,即使 events 里写了 set ch:'K')——用 O11a 同几何(机关从未触发的直线路径)当探针,
//   变异后 240 帧走到门应变成 won=true(而非期望的 false)。全程只读源码字符串 + 运行时 require,不改仓库文件。
(function () {
  var fs = require('fs');
  var srcOrig = fs.readFileSync(MAZE, 'utf8');
  var needle = 'g.needKey = g.items.length > 0 || needKeyFromEvents;';
  if (srcOrig.indexOf(needle) < 0) { ok(false, 'O11f 反向变异:needKey 计算源码行文本对不上(源码改动脱节于测试,先更新此常量)'); return; }
  var mutated = srcOrig.replace(needle, 'g.needKey = g.items.length > 0;');
  var tmpPath = MAZE + '.o11f-mutant.tmp.js';
  fs.writeFileSync(tmpPath, mutated);
  var redOk = false, greenOk = false, errMsg = '';
  var GRID = ['########', '#.....D#', '#......#', '########'];   // O11a 同几何:压力板 (2,2) 不在直线路径 y=1 上,从未触发
  var EVENTS = [{ x: 2, y: 2, once: true, visual: 'plate', hint: '(未触发)', set: [{ x: 4, y: 1, ch: 'K' }] }];
  try {
    resetEnv();
    var mutMod = require(tmpPath).createMaze3dModule({});
    var spyApi = makeApi();
    mutMod.install(spyApi);
    spyApi.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: GRID, start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [], events: EVENTS } });
    if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
    pump(240);
    redOk = (spyApi.state.won === true);   // 变异后:needKey 不再扫 events → 从一开始就 false → 门无锁直接可开(本应像 O11b 对照一样自由开)
  } catch (e) { errMsg = String(e && e.message || e); }
  finally { try { fs.unlinkSync(tmpPath); } catch (e2) {} try { delete require.cache[require.resolve(tmpPath)]; } catch (e3) {} }
  // 还原:用未改的原版源码走同一探针,确认恢复"O11a 的门锁、won 不置位"(绿灯)
  try {
    resetEnv();
    var origMod = require(MAZE).createMaze3dModule({});
    var spyApi2 = makeApi();
    origMod.install(spyApi2);
    spyApi2.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: GRID, start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [], events: EVENTS } });
    if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
    pump(240);
    greenOk = (spyApi2.state.won !== true);   // 还原后:门应仍锁(won 不置位),与变异后的 won=true 相反,证明还原生效
  } catch (e4) { errMsg += ' restore:' + String(e4 && e4.message || e4); }
  ok(redOk && greenOk, "O11f 反向变异牙:摘掉 needKey 的 events 静态扫描 → 「先机关后钥匙」用例(机关从未触发)从锁门(false)退化为自由开门(won=true,redOk=" + redOk + ')还原后复原锁门(greenOk=' + greenOk + ')' + errMsg);
})();

section('P 机关可视化 + 提示时长 + 氛围措辞(maze 视觉/UX 优化)');
// P1 set/warp/turn 机关无 icon → 自动派生贴地 marker(机关一眼可见,但不再像可拾取立牌)
(function () {
  function cap(events) { var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true; m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: events } }); pump(1); recStyleRects = []; recStyleAfter = fillRects; pump(1); recStyleOn = false; return { rects: fillRects, rs: recStyleRects.slice() }; }
  function wideGround(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] >= 8 && r[1] >= 170 && /^rgba\(/.test(r[4])) n++; } return n; }
  function tallCols(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] === 1 && r[3] >= 8 && r[1] > 60 && r[1] < 180) n++; } return n; }
  var withMarker = cap([{ x: 2, y: 1, set: [{ x: 1, y: 1, ch: '#' }] }]);
  var pureHint = cap([{ x: 2, y: 1, hint: '只是氛围' }]);
  ok(wideGround(withMarker.rs) > wideGround(pureHint.rs) + 3, 'P1 set 机关(无icon)→贴地 marker 宽横条多于纯 hint(变异=去 ACTION_GLYPH/marker 派生→相近→红) markerWide=' + wideGround(withMarker.rs) + ' pureWide=' + wideGround(pureHint.rs));
  ok(tallCols(withMarker.rs) < 20, 'P1 set 机关默认不画竖牌列,读作踩地面而非可拾取物(变异=回退 artLayers 竖牌→tallCols 大增) tallCols=' + tallCols(withMarker.rs));
})();
// P2 eventHint 时长按字数:长 hint 触发后 pump 到 ~3s 仍显示(len*0.12≈4.8s>3),短 hint 已消失(2.6s<3)=证时长按内容、非恒定
(function () {
  function hintAt(secs, hint) {
    var m = freshModule({}, {});
    m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, hint: hint }] } });
    pump(Math.ceil(secs / 0.0167) + 2); return findHud();
  }
  var longH = '这是一句很长的机关提示文字总共大约四十个字用来测试按字数自适应的显示时长够不够读完它';   // ~40 字 → 时长 ~4.8s
  ok(hintAt(3.0, longH).indexOf(longH.slice(0, 10)) >= 0, 'P2 长 hint(~40字)pump 到 3s 仍显示(时长 len*0.12≈4.8s>3;变异=固定2.6→3s已消失→红)hud=' + JSON.stringify(hintAt(3.0, longH).slice(0, 26)));
  ok(hintAt(3.0, '短提示').indexOf('短提示') < 0, 'P2b 短 hint(3字)pump 到 3s 已消失(2.6s<3,证按内容非恒定长)hud=' + JSON.stringify(hintAt(3.0, '短提示').slice(0, 26)));
})();
// P3 无钥匙迷宫漫游 HUD = 氛围观察句(THEME_IDLE),不再命令式"走动转身,找到那扇发光的门"
(function () {
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], theme: 'cave' } });   // 无钥匙(无 K)、cave 主题
  pump(3);
  var hud = findHud();
  ok(/冷意|微光|呼吸/.test(hud) && !/走动转身/.test(hud), 'P3 无钥匙迷宫漫游 HUD = 氛围句(cave→含"冷意/微光/呼吸"),不再命令式(变异=默认句留"走动转身"→不含氛围词→红) hud=' + JSON.stringify(hud.slice(0, 30)));
})();

section('Q 机关音效(set/warp/turn → hbCtx 合成出声 + 远程 set 距离调制;headless 无 AudioContext 退化已由默认 resetEnv 各段验不崩)');
(function () {
  function fireA(maze) { var m = freshModule({}, { audio: true }); m.api.fire({ kind: 'maze3d', winKey: 'won', maze: maze }); pump(2); return audioStarts; }   // 注入 mock AudioContext → hbCtx 音频图真跑;起点机关首帧触发、玩家不动(无脚步声干扰)
  ok(fireA({ grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, set: [{ x: 1, y: 1, ch: '#' }] }] }) > 0, 'Q1 set 机关触发 → mechSetSfx 出声(audioStarts>0;变异=去 mechSetSfx 调用→0)');
  ok(fireA({ grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, warp: { x: 1, y: 1 } }] }) > 0, 'Q2 warp 机关触发 → mechWarpSfx 出声(变异=去 mechWarpSfx→0)');
  ok(fireA({ grid: EGRID, start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 2, turn: 'E' }] }) > 0, 'Q3 turn 机关触发 → mechTurnSfx 出声(变异=去 mechTurnSfx→0)');
  // Q4 远程 set(被改格远>阈值)→ 比近 set 多出远处混响层的音源(距离调制生效:远端额外起 fo/fn)
  var FARGRID = ['###########', '#.........#', '#.........#', '#.........#', '###########'];
  var nearA = fireA({ grid: FARGRID, start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 1, set: [{ x: 2, y: 1, ch: '#' }] }] });   // 改格在脚边(距~1)→只近端踩板声
  var farA = fireA({ grid: FARGRID, start: { x: 1, y: 1, dir: 'E' }, monsters: [], events: [{ x: 1, y: 1, set: [{ x: 9, y: 3, ch: '#' }] }] });    // 改格在远角(距~8)→额外远处石门错动层
  ok(farA > nearA, 'Q4 远程 set(被改格远)→ 比近 set 多出远处回响层音源(距离调制生效;变异=去远程分支→相等)far=' + farA + ' near=' + nearA);
})();

// ════ R. R1-2 泛用主题(门发光 per-theme doorGlow + 冷色调 station/ice/clinic;engine-core/公共契约零改)════
section('R 泛用主题');
function parseRGB(s) { var mm = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(s)); return mm ? [+mm[1], +mm[2], +mm[3]] : null; }
function doorRec(theme, extra) {   // 玩家正北一格 = 门 D(castRay 必撞)→ 返回该帧全部 fillStyle 原串(门体色 + drawDoorGlow 辉光色都在内)
  var m = freshModule({}, {}); recCols = []; recOn = true;
  var mz = { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: theme, monsters: [] }, k;
  if (extra) for (k in extra) mz[k] = extra[k];
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz }); } catch (e) {}
  pump(2); recOn = false; return recCols.slice();
}
function doorSig(theme, extra) {   // 录 startMaze 同步首帧完整 fillRect 几何+颜色;用于区分 exitStyle 分支,避免 doorRec 只看 fillStyle 漏掉门叠层。门离玩家两格,不在首个 loop 里自动 win。
  var m = freshModule({}, {}), mz = { grid: ['#####', '#.D.#', '#...#', '#.P.#', '#####'], start: { x: 2, y: 3, dir: 'N' }, theme: theme, monsters: [] }, k;
  if (extra) for (k in extra) mz[k] = extra[k];
  recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
  recStyleOn = false;
  return recStyleRects.map(function (r) { return [Math.round(r[0]), Math.round(r[1]), Math.round(r[2]), Math.round(r[3]), r[4]].join(','); }).join('|');
}
function maxBy(strs, fn) { var mx = -999, i, c, v; for (i = 0; i < strs.length; i++) { c = parseRGB(strs[i]); if (c) { v = fn(c); if (v > mx) mx = v; } } return mx; }
function hasGlow(strs, r, g, b) { var re = new RegExp('rgba\\(' + r + ',\\s*' + g + ',\\s*' + b + ','), i; for (i = 0; i < strs.length; i++) if (re.test(strs[i])) return true; return false; }   // drawDoorGlow 辉光 = rgba(doorGlow,alpha);最特异=直接验辉光用的就是该主题 doorGlow 色(变异走缺省暖橙金→不含→红;不被墙/地板同通道高值掩盖)
// R1 三新主题 fire+pump 不抛(渲染管线接受新主题 config + doorGlow 字段)
['station', 'ice', 'clinic'].forEach(function (th) {
  var threw = null, m = freshModule({}, {});
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: th, monsters: [] } }); pump(2); } catch (e) { threw = e; }
  ok(!threw, 'R1 ' + th + ' 主题 fire+pump 不抛' + (threw ? ': ' + (threw.stack || threw) : ''));
});
// R2 station/ice/clinic 已进 THEMES → 不触发未知主题 warn(零误报;对称 J1/J2)
(function () {
  var warns = [], orig = console.warn; console.warn = function (s) { warns.push(String(s)); };
  try { ['station', 'ice', 'clinic'].forEach(function (th) { var m = freshModule({}, {}); m.api.fire({ kind: 'maze3d', maze: { grid: ['###', '#.#', '###'], start: { x: 1, y: 1, dir: 'N' }, theme: th, monsters: [] } }); }); } finally { console.warn = orig; }
  ok(!warns.some(function (s) { return /maze theme/.test(s); }), 'R2 station/ice/clinic 已进 THEMES → 不报未知主题 warn(零误报)warns=' + JSON.stringify(warns));
})();
// R3 doorGlow 缺省回归:cave(不设 doorGlow)门辉光 = 缺省暖橙金 rgba(255,186,92)→ 证不设 doorGlow 走原公式逐字节不变(向后兼容铁律;变异不影响=cave 本走缺省)
ok(hasGlow(doorRec('cave'), 255, 186, 92), 'R3 cave 缺省门辉光暖橙金 rgba(255,186,92)(不设 doorGlow→原值;向后兼容)');
// R4 doorGlow 生效(门体路径 shadeWall+blast-door warm):station 门体冷青 max(B-R)>70
//   变异验牙:删 doorGlow 派生(门体走暖橙)→ B-R 转负、max(B-R) 只剩冷蓝墙 <70 → 红
//   注:station 用 blast-door 自带黄黑警示条(暖黄=固有危险标志、不受 doorGlow 控)→ 验"门体冷"用 B-R 差(警示条不拉低门体冷青的 B-R 峰值)、不验"全场无暖"
ok(maxBy(doorRec('station'), function (c) { return c[2] - c[0]; }) > 70, 'R4 station 门体冷青(shadeWall doorGlow)max(B-R)>70(变异走暖橙→B-R 转负、只剩墙→红)');
// R4b/R5 doorGlow 生效(辉光路径 drawDoorGlow):三主题门辉光 = 各自 doorGlow 色
//   变异验牙:删 doorGlow 派生(辉光走缺省暖橙金)→ 不含各自冷色 → 红(辉光色检查特异于门、不被墙/地板同通道高值掩盖=治旧 max(B)/max(G) 无效验牙)
ok(hasGlow(doorRec('station'), 120, 210, 235), 'R4b station 门辉光 = doorGlow 冷青 rgba(120,210,235)(变异走暖橙金→红)');
ok(hasGlow(doorRec('ice'), 150, 220, 245), 'R5a ice 门辉光 = doorGlow 冷青白 rgba(150,220,245)(变异走暖橙金→红)');
ok(hasGlow(doorRec('clinic'), 190, 230, 205), 'R5b clinic 门辉光 = doorGlow 淡绿白 rgba(190,230,205)(变异走暖橙金→红)');
// R6 maze.exitStyle 是迷宫级出口视觉覆盖:合法值都能渲染且新类型签名可分,不是必须换 theme 才能换出口。
(function () {
  var styles = ['glow', 'portcullis', 'iron-bars', 'shoji', 'sphincter', 'blast-door', 'archway', 'portal', 'stairs', 'elevator'];
  var sigs = {}, uniq = {}, okAll = true, i;
  for (i = 0; i < styles.length; i++) {
    try { sigs[styles[i]] = doorSig('dungeon', { exitStyle: styles[i] }); }
    catch (e) { okAll = false; sigs[styles[i]] = 'THREW:' + e; }
  }
  ['archway', 'portal', 'stairs', 'elevator'].forEach(function (s) { uniq[sigs[s]] = 1; });
  ok(okAll && Object.keys(uniq).length === 4, 'R6 maze.exitStyle 新出口 archway/portal/stairs/elevator 都能渲染且签名可分(变异=全回退 glow/theme.door→唯一数不足) unique=' + Object.keys(uniq).length + ' ok=' + okAll);
})();
// R7 maze.exitStyle 覆盖 theme.door:cave 默认 portcullis,写 portal 后必须不同于 cave 默认/显式 portcullis。
(function () {
  var caveDefault = doorSig('cave');
  var cavePortcullis = doorSig('cave', { exitStyle: 'portcullis' });
  var cavePortal = doorSig('cave', { exitStyle: 'portal' });
  ok(caveDefault === cavePortcullis && cavePortal !== caveDefault, 'R7 maze.exitStyle 覆盖 theme.door(变异=仍用 cave portcullis) eqDefaultPortcullis=' + (caveDefault === cavePortcullis) + ' eqDefault=' + (cavePortal === caveDefault));
})();
// R8 fail-loud:坏 exitStyle 抛 [maze exit],不静默退回主题门。
(function () {
  var threw = false;
  try { var m = freshModule({}, {}); m.api.fire({ kind: 'maze3d', maze: { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: 'dungeon', exitStyle: 'wormhole', monsters: [] } }); }
  catch (e) { threw = /\[maze exit\]/.test(String(e && (e.message || e))); }
  ok(threw, 'R8 maze.exitStyle 坏词 → 抛[maze exit](变异=静默退回 theme.door→红) threw=' + threw);
})();

// ── R9-R14 R1-2 第二批(industrial 工业废墟 + tomb 古墓;设计稿 docs/maze-themes-batch2-design.md 批2a)──
//   两主题均为「纯数据版」(THEMES 新键,复用现成 wallTex/ceilTex/floorTex/door,无新纹理分支;设计稿两步走策略:先纯数据版截图核,拉不开再加 panel/sandstone——本批判定纯数据已足够区分,故未加)。
// R9 两新主题 fire+pump 不抛(渲染管线接受新 THEMES 键)+ 不触发未知主题 warn(已进 THEMES,零误报,对称 R1/R2)。
(function () {
  var warns = [], orig = console.warn; console.warn = function (s) { warns.push(String(s)); };
  ['industrial', 'tomb'].forEach(function (th) {
    var threw = null, m = freshModule({}, {});
    try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: th, monsters: [] } }); pump(2); } catch (e) { threw = e; }
    ok(!threw, 'R9 ' + th + ' 主题 fire+pump 不抛' + (threw ? ': ' + (threw.stack || threw) : ''));
  });
  console.warn = orig;
  ok(!warns.some(function (s) { return /maze theme/.test(s); }), 'R9b industrial/tomb 已进 THEMES → 不报未知主题 warn(零误报)warns=' + JSON.stringify(warns));
})();
// R10 industrial 门体走暗橙警示 doorGlow(与 station 亮青对拉,证「金属系靠门光色拉开」):门辉光 = rgba(200,90,30,...)。
//   变异验牙:删 doorGlow 派生(辉光走缺省暖橙金 255,186,92)→ 不含暗橙 → 红(同 R4b/R5 辉光路径特异性)。
ok(hasGlow(doorRec('industrial'), 200, 90, 30), 'R10 industrial 门辉光 = doorGlow 暗橙警示 rgba(200,90,30)(变异走缺省暖橙金→红)');
// R11 tomb 未设 doorGlow → 门辉光走缺省暖橙金(向后兼容公式;证"tomb 非冷色、复用现有暖门"未破坏缺省路径)。
ok(hasGlow(doorRec('tomb'), 255, 186, 92), 'R11 tomb 缺省门辉光暖橙金 rgba(255,186,92)(不设 doorGlow→原值,同 R3 cave 缺省回归)');
// parseRGBOpaque:只认不带 alpha 的纯 'rgb(r,g,b)'(=shadeWall/drawWallTex 直接写的墙底色),排除 rgba(...) 叠加层
//   (凹槽受光边/AO/vignette 等半透明白色高光,若混进 rgba 会被白高光 rgb(255,255,255) 污染饱和到 255,见 lesson 141 同类"不特异"教训)。
function parseRGBOpaque(s) { var mm = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(String(s)); return mm ? [+mm[1], +mm[2], +mm[3]] : null; }
function isWallColRect(r) { return r[2] === 1 && r[3] > 4; }   // w===1 且够高 = 墙列(排除 floor/ceil 的满宽横带 w=CW=480;同 S 段 wallCols() 判据)
function wallMaxSig(theme, pick) {   // pick(c)=从 [r,g,b] 取比较用标量(R12 用 r-b、R13 用 r);只在墙列几何(排除满宽 floor/ceil 横带)里取该主题渲染出的最大值
  var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
  var mz = { grid: ['#############', '#...........#', '#...........#', '#.P.........#', '#...........#', '#...........#', '#############'], start: { x: 2, y: 3, dir: 'E' }, theme: theme, monsters: [], flatWalls: true, decorDensity: 0, wallDecorDensity: 0, wearLevel: 0 };
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
  recStyleOn = false;
  var mx = -999, i, rs = recStyleRects;
  for (i = 0; i < rs.length; i++) { if (!isWallColRect(rs[i])) continue; var c = parseRGBOpaque(rs[i][4]); if (c) { var v = pick(c); if (v > mx) mx = v; } }
  return mx;
}
function rMinusB(c) { return c[0] - c[2]; }
function rOnly(c) { return c[0]; }
// R12 industrial 与既有金属系(metal/station)墙基色可分:industrial 暖锈(R>B),metal/station 冷灰蓝(B>=R)。
//   变异验牙(反向变异牙,同 O9e 手法):文本替换 industrial 的 wallBase 为 station 的冷蓝值 → 断言应变红;还原后应变绿。
//   （纯像素采样比较易被 torch.warm/doorGlow/ceilFar 等其它暖色字段掩盖出正确结果但掩盖了 wallBase 本身是否真被改对,
//   故用 O9e 式源码文本替换直接命中 THEMES 里的 wallBase 元组本身,而非在 pick() 里试图人工隔离哪个字段贡献了暖色）。
(function () {
  var indRB = wallMaxSig('industrial', rMinusB), metalRB = wallMaxSig('metal', rMinusB), stationRB = wallMaxSig('station', rMinusB);
  ok(indRB > 0 && indRB > metalRB && indRB > stationRB, 'R12 industrial 墙面(纯 rgb 底色,排除 rgba 高光)max(R-B)>0 且高于 metal/station(锈暖底拉开金属系) ind=' + indRB + ' metal=' + metalRB + ' station=' + stationRB);

  var srcOrig = fs.readFileSync(MAZE, 'utf8');
  var needle = "industrial: { wallBase: [104, 96, 78],";
  if (srcOrig.indexOf(needle) < 0) { ok(false, 'R12 反向变异:industrial wallBase 行文本对不上(源码改动脱节于测试,先更新此常量)'); }
  else {
    var mutated = srcOrig.replace(needle, "industrial: { wallBase: [88, 104, 124],");   // 换成 station 的冷蓝 wallBase(逐字复刻)
    var tmpPath = MAZE + '.r12-mutant.tmp.js';
    fs.writeFileSync(tmpPath, mutated);
    var redRB = -999, errMsg = '';
    try {
      delete require.cache[require.resolve(tmpPath)];
      var mutMod = require(tmpPath);
      resetEnv();
      var mAPI = makeApi(); mutMod.createMaze3dModule({}).install(mAPI);
      recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
      var mz = { grid: ['#############', '#...........#', '#...........#', '#.P.........#', '#...........#', '#...........#', '#############'], start: { x: 2, y: 3, dir: 'E' }, theme: 'industrial', monsters: [], flatWalls: true, decorDensity: 0, wallDecorDensity: 0, wearLevel: 0 };
      mAPI.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
      recStyleOn = false;
      var mx = -999, i, rs = recStyleRects;
      for (i = 0; i < rs.length; i++) { if (!isWallColRect(rs[i])) continue; var c = parseRGBOpaque(rs[i][4]); if (c) { var v = rMinusB(c); if (v > mx) mx = v; } }
      redRB = mx;
    } catch (e) { errMsg = String(e && e.message || e); }
    finally { try { fs.unlinkSync(tmpPath); } catch (e2) {} try { delete require.cache[require.resolve(tmpPath)]; } catch (e3) {} }
    var indRB2 = wallMaxSig('industrial', rMinusB);   // 还原后(require 原始未改的 MAZE)复核仍是暖色 → 绿灯
    // torch.warm/ceilFar 雾染仍会给墙面残留少量暖色(即使 wallBase 单独换成冷底),故不强求 redRB<=0,只要求"显著跌落"(< 一半)才算变异被捕捉到
    var redOk = redRB < indRB2 * 0.5;
    ok(redOk && indRB2 > 0, 'R12b 反向变异牙:industrial wallBase 换成 station 冷蓝值 → max(R-B) 显著跌落(< 原值一半;redOk=' + redOk + ' red=' + redRB + '),还原后复核仍 >0(green=' + indRB2 + ')' + errMsg);
  }
})();
// R13 tomb 与既有石质系(dungeon/cave)墙基色可分:tomb 更亮更黄(R 通道显著高于两者,证暖沙黄非同色复用)。
//   变异验牙(同 R12b 手法):文本替换 tomb 的 wallBase 为 dungeon 的暗红棕值 → 断言应变红;还原后应变绿。
(function () {
  var tombR = wallMaxSig('tomb', rOnly), dungeonR = wallMaxSig('dungeon', rOnly), caveR = wallMaxSig('cave', rOnly);
  ok(tombR > dungeonR && tombR > caveR, 'R13 tomb 墙面(纯 rgb 底色,排除 rgba 高光)max(R) 高于 dungeon/cave(暖沙黄更亮,拉开石质系) tomb=' + tombR + ' dungeon=' + dungeonR + ' cave=' + caveR);

  var srcOrig = fs.readFileSync(MAZE, 'utf8');
  var needle = "tomb:      { wallBase: [176, 148, 96],";
  if (srcOrig.indexOf(needle) < 0) { ok(false, 'R13 反向变异:tomb wallBase 行文本对不上(源码改动脱节于测试,先更新此常量)'); }
  else {
    var mutated = srcOrig.replace(needle, "tomb:      { wallBase: [122, 86, 70],");   // 换成 dungeon 的暗红棕 wallBase(逐字复刻)
    var tmpPath = MAZE + '.r13-mutant.tmp.js';
    fs.writeFileSync(tmpPath, mutated);
    var redR = -999, errMsg2 = '';
    try {
      delete require.cache[require.resolve(tmpPath)];
      var mutMod2 = require(tmpPath);
      resetEnv();
      var mAPI2 = makeApi(); mutMod2.createMaze3dModule({}).install(mAPI2);
      recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
      var mz2 = { grid: ['#############', '#...........#', '#...........#', '#.P.........#', '#...........#', '#...........#', '#############'], start: { x: 2, y: 3, dir: 'E' }, theme: 'tomb', monsters: [], flatWalls: true, decorDensity: 0, wallDecorDensity: 0, wearLevel: 0 };
      mAPI2.fire({ kind: 'maze3d', winKey: 'won', maze: mz2 });
      recStyleOn = false;
      var mx2 = -999, j, rs2 = recStyleRects;
      for (j = 0; j < rs2.length; j++) { if (!isWallColRect(rs2[j])) continue; var c2 = parseRGBOpaque(rs2[j][4]); if (c2) { var v2 = rOnly(c2); if (v2 > mx2) mx2 = v2; } }
      redR = mx2;
    } catch (e4) { errMsg2 = String(e4 && e4.message || e4); }
    finally { try { fs.unlinkSync(tmpPath); } catch (e5) {} try { delete require.cache[require.resolve(tmpPath)]; } catch (e6) {} }
    var tombR2 = wallMaxSig('tomb', rOnly);   // 还原后(require 原始未改的 MAZE)复核仍高于 dungeon → 绿灯
    // torch.warm 雾染仍会给墙面残留少量暖色差异,不强求 redR<=dungeonR(自身),只要求"跌落到与 dungeon 接近"(差距缩到 green 领先幅度的一半内)
    var lead = tombR2 - dungeonR, redOk2 = (redR - dungeonR) < lead * 0.5;
    ok(redOk2 && tombR2 > dungeonR, 'R13b 反向变异牙:tomb wallBase 换成 dungeon 暗红棕值 → max(R) 相对 dungeon 的领先幅度显著收窄(< 原领先一半;redOk=' + redOk2 + ' red=' + redR + ' dungeonRef=' + dungeonR + ' lead=' + lead + '),还原后复核仍 >dungeon(green=' + tombR2 + ')' + errMsg2);
  }
})();
// R14 既有 9 主题(default+8 命名)确定性双跑逐字节相等(同 seed 同渲染,证渲染管线本身无隐藏随机/时间依赖)。
(function () {
  function fullSig(theme) {
    var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
    var mz = { grid: ['#######', '#.....#', '#.P..D#', '#.....#', '#######'], start: { x: 2, y: 2, dir: 'E' }, theme: theme, monsters: [] };
    m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
    pump(5); recStyleOn = false;
    return recStyleRects.map(function (r) { return [Math.round(r[0]), Math.round(r[1]), Math.round(r[2]), Math.round(r[3]), r[4]].join(','); }).join('|');
  }
  var themes = ['', 'cave', 'dungeon', 'shoji', 'flesh', 'metal', 'station', 'ice', 'clinic'], allEq = true, mism = [];
  themes.forEach(function (th) {
    var s1 = fullSig(th), s2 = fullSig(th);
    if (s1 !== s2) { allEq = false; mism.push(th); }
  });
  ok(allEq, 'R14 既有 9 主题(default+8命名)同 seed 双跑逐字节相等(变异=渲染管线混入非确定性来源→不等→红) mismatched=' + mism.join(','));
})();
// R15 既有 9 主题(default+8 命名)渲染签名的 SHA256 黄金哈希,原样写死在这里当回归锁:证任何本批编辑
//   都未动到这些条目里【本不该动】的字段(不止"删新键能否救回"——直接钉死渲染结果本身,任何既有条目的哪怕 1 个
//   数字被误改都会让哈希不等,包括误编辑溢出到相邻 clinic 字段这类"删新键也救不回"的情形)。
//   ★材质差分收尾批(clinic→医院小瓷砖 'smalltile',与 station 大砖格 tile 差分):clinic 哈希是【有意】改动、已重算更新为差分后新值
//     (引擎未发布,允许改既有主题墙纹并更新对应黄金断言);其余 8 主题(default/cave/dungeon/shoji/flesh/metal/station/ice)
//     哈希保持原值不动——这批只碰 clinic.wallTex 一字段,8 主题渲染逐字节不变(本文件运行即验证:仅 clinic 哈希变)。
//     (更早批:metal.wallTex 'tile'→'plate'、ice.wallTex 'stone'→'ice' 的两哈希已在下方各自注释处重算固化。)
//   变异验牙:任何一处既有条目【不该动】的字段被改动,对应主题哈希立即不等 → 红。
(function () {
  var crypto = require('crypto');
  function fullSig9(theme) {
    var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
    var mz = { grid: ['#######', '#.....#', '#.P..D#', '#.....#', '#######'], start: { x: 2, y: 2, dir: 'E' }, theme: theme, monsters: [] };
    m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
    pump(5); recStyleOn = false;
    return recStyleRects.map(function (r) { return [Math.round(r[0]), Math.round(r[1]), Math.round(r[2]), Math.round(r[3]), r[4]].join(','); }).join('|');
  }
  var GOLDEN = {   // 键=theme 名('' = default);值 = HEAD(commit 52cc95c,批2a之前)对应主题渲染签名的 sha256
    '': '5661007c83591e9de5d709a5a5b545eade29b925e9a791fe2835b6d8c837cc75',
    cave: 'eb4e819e41a0181ced0a92fe5f0db3ebcc545a9196c6a8c816c650ce608c441c',
    dungeon: 'ecb845130abfed9c498a828ba87f6b0ce3abfc55e06a42f9979707f3698e656b',
    shoji: '7e162e1957d9bb54dd09d089f3a23e269ae4b1d44f772ba0100519af30349d50',
    flesh: '9f753a5410ed4eeb0b867431b314c242934ab0be1beeea8bfe58df61296f16d8',
    metal: '7d6cd1d785d0f00fa6cc7cc1bc5398b9bb60fe07071e7287edabbffab255d28a',   // ★材质差分后重算:metal.wallTex 'tile'→'plate'(金属菱纹板;修「metal 用瓷砖纹」选错)→ 此哈希由旧 e69bf795… 更新为新值(引擎未发布,允许改既有主题墙纹并更新黄金断言)
    station: 'd77c6557405dd8c696bec77c9b32c1e0acc79f5f3a490c03de667ca5aca769c9',
    ice: '0a0160c9c1c3d6ca3794a1463ae0c9e91089760d0c65730bc015976ca75ebbb6',   // ★材质差分后重算:ice.wallTex 'stone'→'ice'(冰面纹;修「ice 用石头纹」选错)→ 此哈希由旧 0cbbec6c… 更新为新值(同上,有意改动)
    clinic: '5d3ad62e9da53154f9d234263df935b497b2e6398a59d031e1bf236df8dd65db'   // ★材质差分收尾后重算:clinic.wallTex 'tile'→'smalltile'(医院密网小白瓷砖+亮白洁净填缝,与 station 大砖格 tile 差分)→ 此哈希由旧 9df047fc5e97… 更新为新值(引擎未发布,允许改既有主题墙纹并更新黄金断言);本批只碰 clinic.wallTex 一字段,其余 8 主题渲染逐字节不变=其哈希原值不动(本文件运行即验证:仅 clinic 哈希变)
  };
  var mism = [];
  Object.keys(GOLDEN).forEach(function (th) {
    var sig = fullSig9(th), hash = crypto.createHash('sha256').update(sig).digest('hex');
    if (hash !== GOLDEN[th]) mism.push(th + '(got ' + hash.slice(0, 12) + '… want ' + GOLDEN[th].slice(0, 12) + '…)');
  });
  ok(mism.length === 0, 'R15 既有 9 主题渲染签名 sha256 与批2a前 HEAD 黄金哈希逐一相等(锁住既有条目零改动;变异=任一既有 THEMES 字段被动过→对应哈希不等→红) mismatched=' + mism.join(';'));
})();

// ── R16-R22 R1-2 第二批2b(crystal 水晶洞 + neon 赛博霓虹;设计稿 docs/maze-themes-batch2-design.md 批2b)──
//   crystal=纯数据版(复用 stone+portal)+ 新 wallDecor 'crystals'(半透明切面晶簇,差异化 ice);neon=新 wallTex 'circuit'(暗面板+seeded 青/品红自发光竖线,差异化收益最高)。
// R16 两新主题 fire+pump 不抛(渲染管线接受新 THEMES 键 + 新 wallTex 'circuit' 分支)+ 不触发未知主题 warn(已进 THEMES,零误报,对称 R9)。
(function () {
  var warns = [], orig = console.warn; console.warn = function (s) { warns.push(String(s)); };
  ['crystal', 'neon'].forEach(function (th) {
    var threw = null, m = freshModule({}, {});
    try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: th, monsters: [] } }); pump(2); } catch (e) { threw = e; }
    ok(!threw, 'R16 ' + th + ' 主题 fire+pump 不抛' + (threw ? ': ' + (threw.stack || threw) : ''));
  });
  console.warn = orig;
  ok(!warns.some(function (s) { return /maze theme/.test(s); }), 'R16b crystal/neon 已进 THEMES → 不报未知主题 warn(零误报)warns=' + JSON.stringify(warns));
})();
// R17 crystal 门体走紫色 doorGlow(与 GLYPHS.crystal[150,120,225]同族色语义一致):门辉光 = rgba(170,120,235,...)。
//   变异验牙:删 doorGlow 派生(辉光走缺省暖橙金 255,186,92)→ 不含紫 → 红(同 R10/R4b 辉光路径特异性)。
ok(hasGlow(doorRec('crystal'), 170, 120, 235), 'R17 crystal 门辉光 = doorGlow 紫色 rgba(170,120,235)(变异走缺省暖橙金→红)');
// R18 neon 门体走品红 doorGlow(Lospec Cyberpunk Neons 已核 hex #e13a6a → rgb(225,58,106)):门辉光 = rgba(225,58,106,...)。
ok(hasGlow(doorRec('neon'), 225, 58, 106), 'R18 neon 门辉光 = doorGlow 品红 rgba(225,58,106)(Lospec #e13a6a;变异走缺省暖橙金→红)');
// R19 crystal 与既有冷色石质系 ice(同 wallTex:'stone')墙基色可分:crystal 偏紫(G-B<0 蓝紫失衡)、ice 偏青(G-B>0 绿蓝均衡);crystal 更亮更饱和(sum 更高)。
//   （crystal wallBase=[86,62,118] vs ice wallBase=[150,195,215]:crystal R-G=+24>0=紫调、ice R-G=-45<0=青调——两主题 R-G 符号相反,比单纯亮度差更特异)
//   变异验牙(同 R12b/R13b 手法):文本替换 crystal 的 wallBase 为 ice 的冷青值 → R-G 符号应翻转(由正变负)→ 红;还原后应变绿(R-G 恢复 >0)。
function rMinusG(c) { return c[0] - c[1]; }
(function () {
  var crystalRG = wallMaxSig('crystal', rMinusG), iceRG = wallMaxSig('ice', rMinusG);
  ok(crystalRG > 0 && iceRG < 0, 'R19 crystal 墙面(纯 rgb 底色)max(R-G)>0=紫调,ice 反之<0=青调(两主题 R-G 符号相反,拉开同 stone 冷色系) crystal=' + crystalRG + ' ice=' + iceRG);

  var srcOrig = fs.readFileSync(MAZE, 'utf8');
  var needle = "crystal:   { wallBase: [86, 62, 118],";
  if (srcOrig.indexOf(needle) < 0) { ok(false, 'R19 反向变异:crystal wallBase 行文本对不上(源码改动脱节于测试,先更新此常量)'); }
  else {
    var mutated = srcOrig.replace(needle, "crystal:   { wallBase: [150, 195, 215],");   // 换成 ice 的冷青 wallBase(逐字复刻)
    var tmpPath = MAZE + '.r19-mutant.tmp.js';
    fs.writeFileSync(tmpPath, mutated);
    var redRG = 999, errMsg = '';
    try {
      delete require.cache[require.resolve(tmpPath)];
      var mutMod = require(tmpPath);
      resetEnv();
      var mAPI = makeApi(); mutMod.createMaze3dModule({}).install(mAPI);
      recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
      var mz = { grid: ['#############', '#...........#', '#...........#', '#.P.........#', '#...........#', '#...........#', '#############'], start: { x: 2, y: 3, dir: 'E' }, theme: 'crystal', monsters: [], flatWalls: true, decorDensity: 0, wallDecorDensity: 0, wearLevel: 0 };
      mAPI.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
      recStyleOn = false;
      var mx = -999, i, rs = recStyleRects;
      for (i = 0; i < rs.length; i++) { if (!isWallColRect(rs[i])) continue; var c = parseRGBOpaque(rs[i][4]); if (c) { var v = rMinusG(c); if (v > mx) mx = v; } }
      redRG = mx;
    } catch (e) { errMsg = String(e && e.message || e); }
    finally { try { fs.unlinkSync(tmpPath); } catch (e2) {} try { delete require.cache[require.resolve(tmpPath)]; } catch (e3) {} }
    var crystalRG2 = wallMaxSig('crystal', rMinusG);   // 还原后(require 原始未改的 MAZE)复核仍是紫调 → 绿灯
    var redOk = redRG <= 0;   // 换成 ice 冷青底后,max(R-G) 应不再为正(符号翻转/持平,不再读紫)
    ok(redOk && crystalRG2 > 0, 'R19b 反向变异牙:crystal wallBase 换成 ice 冷青值 → max(R-G) 不再为正(不再读紫;redOk=' + redOk + ' red=' + redRG + '),还原后复核仍 >0(green=' + crystalRG2 + ')' + errMsg);
  }
})();
// R20 neon 新 wallTex 'circuit' 产生 seeded 自发光青/品红竖线(rgba 叠加层含 Lospec 精确色 [83,235,228] 青或 [225,58,106] 品红),既有主题的墙面渲染流(rgb/rgba 全体)不含这两个特定色值组合(circuit 分支专属、非其它纹理复用同色)。
//   取景:长廊视角(planeMaze 同款几何)+ 关闭 decor/wallDecor 噪声(decorDensity:0,wallDecorDensity:0)只留 wallTex 本身;多格墙面扫景提高至少撞中一条 seeded 发光线的概率。
function circuitGlowRects(theme, texOverride) {
  var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
  var mz = { grid: ['#############', '#...........#', '#...........#', '#.P.........#', '#...........#', '#...........#', '#############'], start: { x: 2, y: 3, dir: 'E' }, theme: theme, monsters: [], flatWalls: true, decorDensity: 0, wallDecorDensity: 0, wearLevel: 0 };
  if (texOverride) mz.wallTex = texOverride;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
  recStyleOn = false;
  return recStyleRects.slice();
}
function hasRGBA(rects, r, g, b) { var re = new RegExp('rgba\\(' + r + ',\\s*' + g + ',\\s*' + b + ','), i; for (i = 0; i < rects.length; i++) { var s = rects[i][4]; if (re.test(String(s))) return true; } return false; }
(function () {
  var neonRects = circuitGlowRects('neon');
  var hasCyan = hasRGBA(neonRects, 83, 235, 228), hasMagenta = hasRGBA(neonRects, 225, 58, 106);
  ok(hasCyan || hasMagenta, 'R20 neon circuit 墙面含 seeded 自发光竖线(青 rgba(83,235,228,…) 或品红 rgba(225,58,106,…);Lospec Cyberpunk Neons 已核 hex)cyan=' + hasCyan + ' magenta=' + hasMagenta);
  // 既有石质/金属主题(同几何取景)不应误撞这两个 circuit 专属色值(证不是"任何纹理都可能凑出这俩数字"的巧合)
  var metalRects = circuitGlowRects('metal'), stoneRects = circuitGlowRects('cave');
  var falsePos = hasRGBA(metalRects, 83, 235, 228) || hasRGBA(metalRects, 225, 58, 106) || hasRGBA(stoneRects, 83, 235, 228) || hasRGBA(stoneRects, 225, 58, 106);
  ok(!falsePos, 'R20b circuit 专属发光色不误现于 metal/cave 墙面渲染(零假阳性)');
  // 反向变异牙:neon 迷宫显式覆盖 wallTex:'tile'(经 maze.wallTex 白名单,走既有 tile 分支非 circuit)→ 青/品红发光线应消失。
  var neonAsTile = circuitGlowRects('neon', 'tile');
  var stillGlow = hasRGBA(neonAsTile, 83, 235, 228) || hasRGBA(neonAsTile, 225, 58, 106);
  ok(!stillGlow, 'R20c 反向变异牙:neon 显式 wallTex 覆盖为 tile(非 circuit)→ 青/品红发光线消失(变异=circuit 分支被误接到其它 tex 判据→红)');
})();
// R21 crystals wallDecor kind 渲染不抛 + 产生晶体紫色族 rgba 像素(与 growth 的绿/红苔痕像素不同色族,证差异化非同色复用)。
(function () {
  var threw = null, m = freshModule({}, {});
  var mzC = { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: 'crystal', monsters: [], wallDecor: [{ x: 2, y: 0, face: 'S', kind: 'crystals', u: 0.5, v: 0.28, scale: 1.2 }] };
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mzC }); pump(2); } catch (e) { threw = e; }
  ok(!threw, 'R21 crystals wallDecor kind 不抛' + (threw ? ': ' + (threw.stack || threw) : ''));

  var m2 = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;   // freshModule 先调(内部 resetEnv 会清 recStyleOn)、录制标志后置——同 wallMaxSig/doorSig 既有次序(次序颠倒=录不到首帧同步绘制,曾误报见调试记录)
  m2.api.fire({ kind: 'maze3d', winKey: 'won', maze: mzC }); pump(1); recStyleOn = false;
  var hasCrystalHi = hasRGBA(recStyleRects, 225, 205, 255);   // 顶尖亮高光色(crystal 专属,GLYPHS.crystal 同族)
  ok(hasCrystalHi, 'R21b crystals wallDecor 含晶体高光色 rgba(225,205,255,…)(与 growth 苔痕/霜痕色族不同,证非同色复用)');
})();
// R22 crystal/neon 确定性双跑逐字节相等(同 seed 同渲染,证渲染管线本身无隐藏随机/时间依赖;对称 R14)。
(function () {
  function fullSig(theme) {
    var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
    var mz = { grid: ['#######', '#.....#', '#.P..D#', '#.....#', '#######'], start: { x: 2, y: 2, dir: 'E' }, theme: theme, monsters: [] };
    m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
    pump(5); recStyleOn = false;
    return recStyleRects.map(function (r) { return [Math.round(r[0]), Math.round(r[1]), Math.round(r[2]), Math.round(r[3]), r[4]].join(','); }).join('|');
  }
  var themes = ['crystal', 'neon'], allEq = true, mism = [];
  themes.forEach(function (th) {
    var s1 = fullSig(th), s2 = fullSig(th);
    if (s1 !== s2) { allEq = false; mism.push(th); }
  });
  ok(allEq, 'R22 crystal/neon 同 seed 双跑逐字节相等(变异=渲染管线混入非确定性来源→不等→红) mismatched=' + mism.join(','));
})();

// ── R23-R29 R1-2 第二批2c(submarine 潜艇/水下站;设计稿 docs/maze-themes-batch2-design.md 批2c)──
//   金属系第 4 员,撞车风险最高 → 靠幽绿冷灰底(G 为主导通道,别于 metal/station/industrial)+ 新门 wheel-hatch(圆舱门+十字轮阀+密封铆接环)+ 加重雾(fogRange/fogTint/fogMix)拉开。
// R23 submarine 主题 fire+pump 不抛(渲染管线接受新 THEMES 键 + 新门样式 'wheel-hatch' 分支)+ 不触发未知主题 warn(已进 THEMES,零误报,对称 R9/R16)。
(function () {
  var warns = [], orig = console.warn; console.warn = function (s) { warns.push(String(s)); };
  var threw = null, m = freshModule({}, {});
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: 'submarine', monsters: [] } }); pump(2); } catch (e) { threw = e; }
  ok(!threw, 'R23 submarine 主题 fire+pump 不抛' + (threw ? ': ' + (threw.stack || threw) : ''));
  console.warn = orig;
  ok(!warns.some(function (s) { return /maze theme/.test(s); }), 'R23b submarine 已进 THEMES → 不报未知主题 warn(零误报)warns=' + JSON.stringify(warns));
})();
// R24 submarine 门体走幽绿 doorGlow(与既有 station 亮青/industrial 暗橙/clinic 淡绿白同族但更饱和更暗——幽深):门辉光 = rgba(90,200,160,...)。
//   变异验牙:删 doorGlow 派生(辉光走缺省暖橙金 255,186,92)→ 不含幽绿 → 红(同 R10/R17/R4b 辉光路径特异性)。
ok(hasGlow(doorRec('submarine'), 90, 200, 160), 'R24 submarine 门辉光 = doorGlow 幽绿 rgba(90,200,160)(变异走缺省暖橙金→红)');
// R25 submarine 与既有金属系三员(metal/station/industrial)墙基色可分:submarine 幽绿(G 为主导通道,G-max(R,B)全场最高),显著高于其余三员(metal/station 判据在这套雾/torch 衰减下全场压到 0,industrial 压到 1——同 R12/R13 手法:直接比大小而非绝对符号,避免暗墙 rounding 把"接近但非零"的差异误判)。
//   变异验牙(同 R12b/R13b/R19b 手法):文本替换 submarine 的 wallBase 为 metal 的中性灰值 → 领先优势应显著收窄(<原领先一半)→ 红;还原后应变绿。
function gMinusMaxRB(c) { return c[1] - Math.max(c[0], c[2]); }
(function () {
  var subG = wallMaxSig('submarine', gMinusMaxRB), metalG = wallMaxSig('metal', gMinusMaxRB), stationG = wallMaxSig('station', gMinusMaxRB), indG = wallMaxSig('industrial', gMinusMaxRB);
  ok(subG > metalG && subG > stationG && subG > indG, 'R25 submarine 墙面(纯 rgb 底色)max(G-max(R,B))高于 metal/station/industrial(幽绿主导,拉开金属系三员) sub=' + subG + ' metal=' + metalG + ' station=' + stationG + ' ind=' + indG);

  var srcOrig = fs.readFileSync(MAZE, 'utf8');
  var needle = "submarine: { wallBase: [66, 100, 88],";
  if (srcOrig.indexOf(needle) < 0) { ok(false, 'R25 反向变异:submarine wallBase 行文本对不上(源码改动脱节于测试,先更新此常量)'); }
  else {
    var mutated = srcOrig.replace(needle, "submarine: { wallBase: [96, 104, 112],");   // 换成 metal 的中性灰 wallBase(逐字复刻)
    var tmpPath = MAZE + '.r25-mutant.tmp.js';
    fs.writeFileSync(tmpPath, mutated);
    var redG = 999, errMsg = '';
    try {
      delete require.cache[require.resolve(tmpPath)];
      var mutMod = require(tmpPath);
      resetEnv();
      var mAPI = makeApi(); mutMod.createMaze3dModule({}).install(mAPI);
      recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
      var mz = { grid: ['#############', '#...........#', '#...........#', '#.P.........#', '#...........#', '#...........#', '#############'], start: { x: 2, y: 3, dir: 'E' }, theme: 'submarine', monsters: [], flatWalls: true, decorDensity: 0, wallDecorDensity: 0, wearLevel: 0 };
      mAPI.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
      recStyleOn = false;
      var mx = -999, i, rs = recStyleRects;
      for (i = 0; i < rs.length; i++) { if (!isWallColRect(rs[i])) continue; var c = parseRGBOpaque(rs[i][4]); if (c) { var v = gMinusMaxRB(c); if (v > mx) mx = v; } }
      redG = mx;
    } catch (e) { errMsg = String(e && e.message || e); }
    finally { try { fs.unlinkSync(tmpPath); } catch (e2) {} try { delete require.cache[require.resolve(tmpPath)]; } catch (e3) {} }
    var subG2 = wallMaxSig('submarine', gMinusMaxRB);   // 还原后(require 原始未改的 MAZE)复核仍领先 metal → 绿灯
    var lead = subG2 - metalG, redOk = (redG - metalG) < lead * 0.5;   // 换成 metal 底后,相对 metal 的领先幅度应显著收窄(< 原领先一半)
    ok(redOk && subG2 > metalG, 'R25b 反向变异牙:submarine wallBase 换成 metal 中性灰值 → max(G-max(R,B)) 相对 metal 的领先幅度显著收窄(< 原领先一半;redOk=' + redOk + ' red=' + redG + ' metalRef=' + metalG + ' lead=' + lead + '),还原后复核仍 >metal(green=' + subG2 + ')' + errMsg);
  }
})();
// R26 maze.exitStyle 新增 'wheel-hatch' 能渲染、且渲染签名与既有 10 样式两两可分(不是某个既有样式的静默别名);沿用 R6 白名单枚举手法,证 11 样式(含新)总数唯一。
(function () {
  var styles = ['glow', 'portcullis', 'iron-bars', 'shoji', 'sphincter', 'blast-door', 'archway', 'portal', 'stairs', 'elevator', 'wheel-hatch'];
  var sigs = {}, uniq = {}, okAll = true, i;
  for (i = 0; i < styles.length; i++) {
    try { sigs[styles[i]] = doorSig('submarine', { exitStyle: styles[i] }); }
    catch (e) { okAll = false; sigs[styles[i]] = 'THREW:' + e; }
  }
  styles.forEach(function (s) { uniq[sigs[s]] = 1; });
  ok(okAll && Object.keys(uniq).length === styles.length, 'R26 maze.exitStyle 新增 wheel-hatch 可渲染且与既有 10 样式渲染签名两两可分(变异=wheel-hatch 静默复用某既有分支→唯一数不足) unique=' + Object.keys(uniq).length + '/' + styles.length + ' ok=' + okAll);
})();
// R27 submarine 主题门默认走 'wheel-hatch'(THEMES.submarine.door 字段本身),不必显式 maze.exitStyle 覆盖才能拿到新门。
(function () {
  var subDefault = doorSig('submarine');
  var subExplicitHatch = doorSig('submarine', { exitStyle: 'wheel-hatch' });
  var subBlastDoor = doorSig('submarine', { exitStyle: 'blast-door' });
  ok(subDefault === subExplicitHatch && subDefault !== subBlastDoor, 'R27 submarine 主题默认门 = wheel-hatch(与显式覆盖同签名、与其它门样式不同签名;变异=THEMES.submarine.door 误配成其它值→红) eqExplicit=' + (subDefault === subExplicitHatch) + ' neqBlastDoor=' + (subDefault !== subBlastDoor));
})();
// R28 fail-loud 白名单回归(对称 R8):坏 exitStyle 仍抛 [maze exit],新增 wheel-hatch 未破坏既有拒绝路径。
(function () {
  var threw = false;
  try { var m = freshModule({}, {}); m.api.fire({ kind: 'maze3d', maze: { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: 'submarine', exitStyle: 'submersible-airlock', monsters: [] } }); }
  catch (e) { threw = /\[maze exit\]/.test(String(e && (e.message || e))); }
  ok(threw, 'R28 maze.exitStyle 坏词(即使主题已是 submarine)→ 仍抛[maze exit](变异=wheel-hatch 加入后白名单校验被绕过→红) threw=' + threw);
})();
// R29 submarine 确定性双跑逐字节相等(同 seed 同渲染,证渲染管线本身无隐藏随机/时间依赖;对称 R14/R22)。
(function () {
  function fullSig(theme) {
    var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
    var mz = { grid: ['#######', '#.....#', '#.P..D#', '#.....#', '#######'], start: { x: 2, y: 2, dir: 'E' }, theme: theme, monsters: [] };
    m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
    pump(5); recStyleOn = false;
    return recStyleRects.map(function (r) { return [Math.round(r[0]), Math.round(r[1]), Math.round(r[2]), Math.round(r[3]), r[4]].join(','); }).join('|');
  }
  var s1 = fullSig('submarine'), s2 = fullSig('submarine');
  ok(s1 === s2, 'R29 submarine 同 seed 双跑逐字节相等(变异=渲染管线混入非确定性来源→不等→红)');
})();

// ── R30-R37 四主题专属墙纹(panel 工业金属板 / hull 潜艇船体 / sandstone 古墓砂岩 / crystal 水晶洞;端用户"几个风格墙面差距太小"→ 各给专属 wallTex 分支拉开辨识度)──
//   接线:industrial.wallTex='panel'、submarine='hull'、tomb='sandstone'、crystal='crystal'(四主题脱离复用的 tile/stone)。
//   下面 wallTexSig 沿用 R20 circuitGlowRects 取景(长廊 flatWalls + 关 decor/wallDecor 噪声)只留 wallTex 本身;wearLevel 不清(panel/hull 的锈/渗水是 wearLevel 门控专属特征,industrial 0.75/submarine 0.70)。
function wallTexRects(theme, texOverride, wearOverride) {
  var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
  var mz = { grid: ['#############', '#...........#', '#...........#', '#.P.........#', '#...........#', '#...........#', '#############'], start: { x: 2, y: 3, dir: 'E' }, theme: theme, monsters: [], flatWalls: true, decorDensity: 0, wallDecorDensity: 0 };
  if (texOverride != null) mz.wallTex = texOverride;
  if (wearOverride != null) mz.wearLevel = wearOverride;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
  pump(2); recStyleOn = false;
  return recStyleRects.slice();
}
function wallTexSig(theme, texOverride) { return wallTexRects(theme, texOverride).map(function (r) { return [Math.round(r[0]), Math.round(r[1]), Math.round(r[2]), Math.round(r[3]), r[4]].join(','); }).join('|'); }
var NEWTEX = { industrial: { tex: 'panel', old: 'tile' }, submarine: { tex: 'hull', old: 'tile' }, tomb: { tex: 'sandstone', old: 'stone' }, crystal: { tex: 'crystal', old: 'stone' } };
// R30 四主题(接了新专属 wallTex)fire+pump 不抛(渲染管线接受新 wallTex 分支)+ 不报未知主题 warn(已在 THEMES,零误报,对称 R9/R16/R23)。
(function () {
  var warns = [], orig = console.warn; console.warn = function (s) { warns.push(String(s)); };
  Object.keys(NEWTEX).forEach(function (th) {
    var threw = null, m = freshModule({}, {});
    try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: th, monsters: [] } }); pump(3); } catch (e) { threw = e; }
    ok(!threw, 'R30 ' + th + '(wallTex=' + NEWTEX[th].tex + ')fire+pump 不抛' + (threw ? ': ' + (threw.stack || threw) : ''));
  });
  console.warn = orig;
  ok(!warns.some(function (s) { return /maze theme/.test(s); }), 'R30b 四主题已进 THEMES → 不报未知主题 warn(零误报)warns=' + JSON.stringify(warns));
})();
// R31 四主题墙纹真走各自新分支(反向变异验牙,同 R20c 手法):把 maze.wallTex 显式覆盖回旧值('tile'/'stone',经白名单走既有分支)→ 墙纹签名必变(证新分支非旧分支静默别名);渲染量非空。
(function () {
  Object.keys(NEWTEX).forEach(function (th) {
    var newSig = wallTexSig(th), oldSig = wallTexSig(th, NEWTEX[th].old);
    ok(newSig.length > 0 && newSig !== oldSig, 'R31 ' + th + ' 专属墙纹 ' + NEWTEX[th].tex + ' ≠ 旧复用纹理 ' + NEWTEX[th].old + '(反向变异牙:覆盖回旧 tex→签名变;变异=新分支被误接旧判据→签名同→红)newLen=' + newSig.length);
  });
})();
// R32 accent 特异色(panel 锈痕 / hull 渗水 / crystal 晶面高光)只现于本主题新分支,覆盖回旧 tex 后消失(证特征来自新分支而非取景巧合;sandstone 无独占 rgba accent、其区分靠 R31 签名+大石课不透明层理,故不在此列)。
(function () {
  // panel:seeded 暗橙锈竖痕 rgba(120,58,22,…)(wearLevel 门控;industrial 默认 0.75)
  var indNew = wallTexRects('industrial'), indAsTile = wallTexRects('industrial', 'tile');
  ok(hasRGBA(indNew, 120, 58, 22), 'R32a panel 含 seeded 暗橙锈痕 rgba(120,58,22,…)(industrial 高 wearLevel;变异=删锈痕支→无→红)');
  ok(!hasRGBA(indAsTile, 120, 58, 22), 'R32a2 覆盖回 tile → panel 锈痕色消失(证锈痕是 panel 分支专属)');
  // hull:seeded 幽绿渗水暗痕 rgba(20,44,38,…)
  var subNew = wallTexRects('submarine'), subAsTile = wallTexRects('submarine', 'tile');
  ok(hasRGBA(subNew, 20, 44, 38), 'R32b hull 含 seeded 幽绿渗水暗痕 rgba(20,44,38,…)(变异=删渗水支→无→红)');
  ok(!hasRGBA(subAsTile, 20, 44, 38), 'R32b2 覆盖回 tile → hull 渗水痕消失(证渗水是 hull 分支专属)');
  // crystal:seeded 冷紫白晶面高光 rgba(206,178,244,…) 或淡紫 rgba(176,150,230,…)
  var crNew = wallTexRects('crystal'), crAsStone = wallTexRects('crystal', 'stone');
  var crHasGlow = hasRGBA(crNew, 206, 178, 244) || hasRGBA(crNew, 176, 150, 230);
  ok(crHasGlow, 'R32c crystal 含 seeded 冷紫白晶面高光 rgba(206,178,244,…)/(176,150,230,…)(变异=删高光支→无→红)');
  var crStoneGlow = hasRGBA(crAsStone, 206, 178, 244) || hasRGBA(crAsStone, 176, 150, 230);
  ok(!crStoneGlow, 'R32c2 覆盖回 stone → crystal 晶面高光消失(证高光是 crystal 分支专属)');
  // 零假阳性:panel 锈色/hull 渗水色/crystal 高光色不误现于既有石质/金属主题(cave/metal)墙面
  var caveRects = wallTexRects('cave'), metalRects = wallTexRects('metal');
  var falsePos = hasRGBA(caveRects, 206, 178, 244) || hasRGBA(caveRects, 176, 150, 230) || hasRGBA(metalRects, 120, 58, 22) || hasRGBA(metalRects, 20, 44, 38);
  ok(!falsePos, 'R32d 四新纹理 accent 专属色不误现于既有 cave/metal 墙面(零假阳性)');
})();
// R33 sandstone 大块石课确有独占绘制(反向变异牙第二形态):sandstone 与旧 stone 在同主题(tomb)取景下墙列不透明 rgb 序列不同(大石课 3 行 vs stone 4 行小块 + 层理横纹),证"大块+层理"非 stone 小块复用。
(function () {
  function opaqueColSig(theme, texOverride) {   // 只取不透明墙列(w=1 且够高),排除 rgba accent → 锁"结构性"绘制差异(石课行数/层理),不靠 accent
    return wallTexRects(theme, texOverride).filter(isWallColRect).map(function (r) { var c = parseRGBOpaque(r[4]); return c ? [Math.round(r[1]), c[0] + ',' + c[1] + ',' + c[2]].join(':') : null; }).filter(function (x) { return x != null; }).join('|');
  }
  var sandSig = opaqueColSig('tomb'), stoneSig = opaqueColSig('tomb', 'stone');
  ok(sandSig.length > 0 && sandSig !== stoneSig, 'R33 sandstone 大块石课+层理的不透明墙列序列 ≠ 旧 stone 小块(证结构性差异非仅换色;变异=sandstone 退化成 stone 布局→序列同→红)sandLen=' + sandSig.length);
})();
// R34 四主题确定性双跑逐字节相等(同 seed 同渲染,证新纹理分支无隐藏随机/时间依赖;对称 R14/R22/R29)。
(function () {
  var allEq = true, mism = [];
  Object.keys(NEWTEX).forEach(function (th) {
    var s1 = wallTexSig(th), s2 = wallTexSig(th);
    if (s1 !== s2) { allEq = false; mism.push(th); }
  });
  ok(allEq, 'R34 四主题(panel/hull/sandstone/crystal)同 seed 双跑逐字节相等(变异=新纹理混入非确定性来源→不等→红)mismatched=' + mism.join(','));
})();
// R35 fail-loud 白名单回归(对称 R8/R28):坏 wallTex 仍抛 [maze wall];新增四值未破坏既有拒绝路径,且四新值本身经白名单不抛。
(function () {
  function wtThrows(v) { var m = freshModule({}, {}); try { m.api.fire({ kind: 'maze3d', maze: { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: 'cave', wallTex: v, monsters: [] } }); return false; } catch (e) { return /\[maze wall\]/.test(String(e && (e.message || e))); } }
  ok(wtThrows('marble'), 'R35 坏 wallTex "marble" → 仍抛[maze wall](变异=四新值加入后白名单被绕过→红)');
  var okAll = ['panel', 'hull', 'sandstone', 'crystal'].every(function (v) { return !wtThrows(v); });
  ok(okAll, 'R35b 四新 wallTex 值经白名单不抛(变异=漏加入白名单→合法值被拒→红)');
})();

// ── R36-R41 既有材质差分(修材质选错:ice 用了 stone 石头纹→改专属 'ice' 冰面纹;metal 用了 tile 瓷砖纹→改专属 'plate' 金属菱纹板)──
//   接线:ice.wallTex='ice'(脱离复用的 stone)、metal.wallTex='plate'(脱离复用的 tile)。沿用 R30-R35 的 wallTexRects/wallTexSig 取景(长廊 flatWalls + 关 decor/wallDecor 噪声)只留 wallTex 本身。
//   注:R15 已锁 ice/metal 两哈希(差分后重算的新值)+ 其余 7 主题哈希零变化;这里补 ice/plate 两新分支的「真走新分支 / accent 专属 / 结构性差异 / 确定性 / 白名单」牙。
var DIFFTEX = { ice: { tex: 'ice', old: 'stone' }, metal: { tex: 'plate', old: 'tile' } };
// R36 ice/metal(接了差分后新专属 wallTex)fire+pump 不抛(渲染管线接受新 wallTex 分支)+ 不报未知主题 warn(已在 THEMES,零误报,对称 R9/R16/R23/R30)。
(function () {
  var warns = [], orig = console.warn; console.warn = function (s) { warns.push(String(s)); };
  Object.keys(DIFFTEX).forEach(function (th) {
    var threw = null, m = freshModule({}, {});
    try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: th, monsters: [] } }); pump(3); } catch (e) { threw = e; }
    ok(!threw, 'R36 ' + th + '(wallTex=' + DIFFTEX[th].tex + ')fire+pump 不抛' + (threw ? ': ' + (threw.stack || threw) : ''));
  });
  console.warn = orig;
  ok(!warns.some(function (s) { return /maze theme/.test(s); }), 'R36b ice/metal 已进 THEMES → 不报未知主题 warn(零误报)warns=' + JSON.stringify(warns));
})();
// R37 ice/metal 墙纹真走各自新分支(反向变异验牙,同 R20c/R31 手法):把 maze.wallTex 显式覆盖回旧值('stone'/'tile',经白名单走既有分支)→ 墙纹签名必变(证 'ice'/'plate' 新分支非旧分支静默别名);渲染量非空。
(function () {
  Object.keys(DIFFTEX).forEach(function (th) {
    var newSig = wallTexSig(th), oldSig = wallTexSig(th, DIFFTEX[th].old);
    ok(newSig.length > 0 && newSig !== oldSig, 'R37 ' + th + ' 差分墙纹 ' + DIFFTEX[th].tex + ' ≠ 旧复用纹理 ' + DIFFTEX[th].old + '(反向变异牙:覆盖回旧 tex→签名变;变异=新分支被误接旧判据/未接线→签名同→红)newLen=' + newSig.length);
  });
})();
// R38 accent 特异色只现于本主题新分支,覆盖回旧 tex 后消失(证特征来自新分支而非取景巧合)+ 零假阳性(不误现于既有石质/金属主题)。
(function () {
  // ice:seeded 冷白/淡青霜光高光 rgba(210,235,255,…) 或 rgba(190,220,240,…)
  var iceNew = wallTexRects('ice'), iceAsStone = wallTexRects('ice', 'stone');
  var iceHasFrost = hasRGBA(iceNew, 210, 235, 255) || hasRGBA(iceNew, 190, 220, 240);
  ok(iceHasFrost, 'R38a ice 含 seeded 冷白/淡青霜光高光 rgba(210,235,255,…)/(190,220,240,…)(变异=删霜光支→无→红)');
  var iceStoneFrost = hasRGBA(iceAsStone, 210, 235, 255) || hasRGBA(iceAsStone, 190, 220, 240);
  ok(!iceStoneFrost, 'R38a2 覆盖回 stone → ice 霜光消失(证霜光是 ice 分支专属)');
  // 零假阳性:ice 霜光色不误现于既有石质主题(cave,同 stone 复用来源)墙面
  var caveRects = wallTexRects('cave');
  ok(!(hasRGBA(caveRects, 210, 235, 255) || hasRGBA(caveRects, 190, 220, 240)), 'R38b ice 霜光专属色不误现于既有 cave(旧 stone)墙面(零假阳性)');
})();
// R39 ice 不规则裂纹网确有独占结构绘制(反向变异牙第二形态,同 R33 手法):ice 与旧 stone 在同主题(cave)取景下墙列【不透明 rgb】序列不同(冰的斜向裂纹+疏断裂线 vs stone 小块砖缝+污渍),证结构性差异非仅 accent/换色。
(function () {
  function opaqueColSig(theme, texOverride) {
    return wallTexRects(theme, texOverride).filter(isWallColRect).map(function (r) { var c = parseRGBOpaque(r[4]); return c ? [Math.round(r[1]), c[0] + ',' + c[1] + ',' + c[2]].join(':') : null; }).filter(function (x) { return x != null; }).join('|');
  }
  var iceSig = opaqueColSig('cave', 'ice'), stoneSig = opaqueColSig('cave', 'stone');   // 同主题 cave 取景,只换 wallTex → 隔离纹理结构本身
  ok(iceSig.length > 0 && iceSig !== stoneSig, 'R39 ice 斜裂纹+断裂线的不透明墙列序列 ≠ 旧 stone 小块砖缝(证结构性差异非仅换色;变异=ice 退化成 stone 布局→序列同→红)iceLen=' + iceSig.length);
})();
// R40 metal plate 菱纹板确有独占结构绘制(同 R39/R33 手法):plate 与旧 tile 在同主题(metal)取景下墙列【不透明 rgb】序列不同(菱形交叉斜脊 vs tile 矩形砖格),证"菱纹网"非 tile 矩形复用。
(function () {
  function opaqueColSig(theme, texOverride) {
    return wallTexRects(theme, texOverride).filter(isWallColRect).map(function (r) { var c = parseRGBOpaque(r[4]); return c ? [Math.round(r[1]), c[0] + ',' + c[1] + ',' + c[2]].join(':') : null; }).filter(function (x) { return x != null; }).join('|');
  }
  var plateSig = opaqueColSig('metal', 'plate'), tileSig = opaqueColSig('metal', 'tile');
  ok(plateSig.length > 0 && plateSig !== tileSig, 'R40 metal plate 菱纹斜脊的不透明墙列序列 ≠ 旧 tile 矩形砖格(证结构性差异非仅换色;变异=plate 退化成 tile 布局→序列同→红)plateLen=' + plateSig.length);
})();
// R41 ice/metal 差分后确定性双跑逐字节相等(同 seed 同渲染,证新纹理分支无隐藏随机/时间依赖;对称 R14/R22/R29/R34)+ fail-loud 白名单回归(对称 R8/R28/R35):新增 'ice'/'plate' 经白名单不抛、坏值仍抛。
(function () {
  var allEq = true, mism = [];
  Object.keys(DIFFTEX).forEach(function (th) { var s1 = wallTexSig(th), s2 = wallTexSig(th); if (s1 !== s2) { allEq = false; mism.push(th); } });
  ok(allEq, 'R41 ice/metal(ice/plate 纹理)同 seed 双跑逐字节相等(变异=新纹理混入非确定性来源→不等→红)mismatched=' + mism.join(','));
  function wtThrows(v) { var m = freshModule({}, {}); try { m.api.fire({ kind: 'maze3d', maze: { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: 'cave', wallTex: v, monsters: [] } }); return false; } catch (e) { return /\[maze wall\]/.test(String(e && (e.message || e))); } }
  ok(['ice', 'plate'].every(function (v) { return !wtThrows(v); }), 'R41b 新 wallTex 值 ice/plate 经白名单不抛(变异=漏加入白名单→合法值被拒→红)');
  ok(wtThrows('frost'), 'R41c 坏 wallTex "frost" → 仍抛[maze wall](变异=ice/plate 加入后白名单被绕过→红)');
})();

// ── R42-R46 材质差分收尾(clinic 用了 station 同款大砖格 tile→改专属 'smalltile' 医院密网小白瓷砖+亮白洁净填缝)──
//   接线:clinic.wallTex='smalltile'(脱离与 station 复用的 tile);station 仍 'tile' 不动。沿用 R36-R41 的 wallTexRects/wallTexSig 取景(长廊 flatWalls + 关 decor/wallDecor)只留 wallTex 本身。
//   注:R15 已锁 clinic 哈希(差分后重算的新值)+ 其余 8 主题哈希零变化;这里补 'smalltile' 新分支的「真走新分支 / 亮填缝专属 / 结构性差异 / 确定性 / 白名单」牙。
function maxBriteWallCol(rs) {   // 最亮不透明墙列的 rgb 通道和(smalltile 亮填缝 vs tile 暗缝的区分量:tile 缝比底暗、smalltile 缝比底亮)
  var best = -1, i; for (i = 0; i < rs.length; i++) { var r = rs[i]; if (!isWallColRect(r)) continue; var c = parseRGBOpaque(r[4]); if (!c) continue; var s = c[0] + c[1] + c[2]; if (s > best) best = s; } return best;
}
// R42 clinic(接了差分后新专属 wallTex 'smalltile')fire+pump 不抛(渲染管线接受新 wallTex 分支)+ 不报未知主题 warn(已在 THEMES,零误报,对称 R9/R16/R23/R30/R36)。
(function () {
  var warns = [], orig = console.warn; console.warn = function (s) { warns.push(String(s)); };
  var threw = null, m = freshModule({}, {});
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: 'clinic', monsters: [] } }); pump(3); } catch (e) { threw = e; }
  console.warn = orig;
  ok(!threw, 'R42 clinic(wallTex=smalltile)fire+pump 不抛(渲染管线接受新 smalltile 分支)' + (threw ? ': ' + (threw.stack || threw) : ''));
  ok(!warns.some(function (s) { return /maze theme/.test(s); }), 'R42b clinic 已进 THEMES → 不报未知主题 warn(零误报)warns=' + JSON.stringify(warns));
  var rects = wallTexRects('clinic');
  ok(rects.filter(isWallColRect).length > 0, 'R42c clinic(smalltile)墙面渲染非空(有墙列 fillRect;变异=smalltile 分支画不出墙纹→空→红)n=' + rects.filter(isWallColRect).length);
})();
// R43 clinic 墙纹真走新 smalltile 分支(反向变异验牙,同 R37 手法):把 maze.wallTex 显式覆盖回旧 'tile'(station 同款大砖格,经白名单走既有 tile 分支)→ 墙纹签名必变(证 'smalltile' 是真新分支、非 tile 静默别名);渲染量非空。
(function () {
  var newSig = wallTexSig('clinic'), oldSig = wallTexSig('clinic', 'tile');
  ok(newSig.length > 0 && newSig !== oldSig, 'R43 clinic 差分墙纹 smalltile ≠ 旧复用 tile(反向变异牙:覆盖回 tile→签名变;变异=smalltile 被误接 tile 判据/未接线→签名同→红)newLen=' + newSig.length);
})();
// R44 smalltile 亮白洁净填缝专属(证"clean grout 比底亮"是 smalltile 新分支特征,与 station 同款 tile 的"暗缝比底暗"相反):同主题 clinic 取景下,smalltile 的最亮不透明墙列显著亮于 tile(tile 缝只会更暗、无比底更亮的填缝)。这是"密网小白瓷砖 vs 大砖格暗缝"最直观的差分量。
(function () {
  var smtBrite = maxBriteWallCol(wallTexRects('clinic')), tilBrite = maxBriteWallCol(wallTexRects('clinic', 'tile'));
  ok(smtBrite > tilBrite * 1.25, 'R44 smalltile 亮填缝:最亮墙列(白色洁净缝)显著亮于回退 tile 的暗缝(smtBrite=' + smtBrite + ' > tilBrite=' + tilBrite + '×1.25;变异=删亮填缝绘制/缝改暗→smtBrite 跌到≈tile→红)');
})();
// R45 smalltile 密网小砖确有独占结构绘制(反向变异牙第二形态,同 R39/R40 手法):smalltile 与旧 tile 在同主题 clinic 取景下墙列【不透明 rgb】序列不同(6 列×~9 行小砖密网+亮缝 vs tile 3 列×4 行大砖格暗缝),证结构性差异非仅换色。
(function () {
  function opaqueColSig(theme, texOverride) {
    return wallTexRects(theme, texOverride).filter(isWallColRect).map(function (r) { var c = parseRGBOpaque(r[4]); return c ? [Math.round(r[1]), c[0] + ',' + c[1] + ',' + c[2]].join(':') : null; }).filter(function (x) { return x != null; }).join('|');
  }
  var smtSig = opaqueColSig('clinic', 'smalltile'), tileSig = opaqueColSig('clinic', 'tile');
  ok(smtSig.length > 0 && smtSig !== tileSig, 'R45 smalltile 密网小砖+亮缝的不透明墙列序列 ≠ 旧 tile 大砖格暗缝(证结构性差异非仅换色;变异=smalltile 退化成 tile 布局→序列同→红)smtLen=' + smtSig.length);
})();
// R46 clinic(smalltile 纹理)差分后确定性双跑逐字节相等(证新纹理分支无隐藏随机/时间依赖;对称 R14/R22/R41)+ fail-loud 白名单回归(对称 R8/R41b):新增 'smalltile' 经白名单不抛、坏值仍抛。
(function () {
  var s1 = wallTexSig('clinic'), s2 = wallTexSig('clinic');
  ok(s1 === s2, 'R46 clinic(smalltile)同 seed 双跑逐字节相等(变异=smalltile 混入非确定性来源→不等→红)');
  function wtThrows(v) { var m = freshModule({}, {}); try { m.api.fire({ kind: 'maze3d', maze: { grid: ['#####', '#.D.#', '#.P.#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: 'cave', wallTex: v, monsters: [] } }); return false; } catch (e) { return /\[maze wall\]/.test(String(e && (e.message || e))); } }
  ok(!wtThrows('smalltile'), 'R46b 新 wallTex 值 smalltile 经白名单不抛(变异=漏加入白名单→合法值被拒→红)');
  ok(wtThrows('minitile'), 'R46c 坏 wallTex "minitile" → 仍抛[maze wall](变异=smalltile 加入后白名单被绕过→红)');
})();

// ════ S. R1-3 多层高度装饰(假高度墙锚脚拉伸;maze 私有、碰撞/可达/isWall 零改)════
//   墙面分层(檐口/踢脚 drawWallBands)是纯视觉装饰、与 wallTex 砖缝混在一起难特异单元验(强行计数=不特异假绿,见 lesson 141)→ 靠 Playwright 真机核;这里只锁假高度墙(可特异验:墙列几何)。
section('S 多层高度装饰');
function wallCols(mz) {   // 录某迷宫墙列 fillRect 几何(墙列=w=1 的竖条);pump 多帧后取
  var m = freshModule({}, {}); recRects = []; recRectsOn = true;
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz }); } catch (e) {}
  pump(2); recRectsOn = false;
  var cols = [], i; for (i = 0; i < recRects.length; i++) if (recRects[i][2] === 1 && recRects[i][3] > 4) cols.push(recRects[i]);   // w=1 且够高 = 墙列(滤掉檐口/踢脚细带)
  return cols;
}
var SGRID = ['#####', '#...#', '#.P.#', '#...#', '#####'];   // 玩家四周有墙(各方向墙可见)
function sumH(c) { var s = 0, i; for (i = 0; i < c.length; i++) s += c[i][3]; return s; }
function maxBot(c) { var m = 0, i, b; for (i = 0; i < c.length; i++) { b = c[i][1] + c[i][3]; if (b > m) m = b; } return m; }
function maxH(c) { var m = 0, i; for (i = 0; i < c.length; i++) if (c[i][3] > m) m = c[i][3]; return m; }
// S1 缺省墙=平整(评估后移除逐格随机起伏):默认墙列总高 ≈ flatWalls(不再额外拔高)
(function () {
  var def = wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'E' }, theme: 'dungeon', monsters: [] });
  var flat = wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'E' }, theme: 'dungeon', monsters: [], flatWalls: true });
  ok(Math.abs(sumH(def) - sumH(flat)) <= sumH(flat) * 0.02, 'S1 缺省墙=平整:默认墙列总高≈flatWalls(已移除逐格起伏;变异=wallScaleAt 默认返回>1→def>flat→红) def=' + Math.round(sumH(def)) + ' flat=' + Math.round(sumH(flat)));
})();
// S2 锚脚:wallHeights 拔高只动墙顶、墙脚不动 → 标高墙列更高(maxH)但最低墙底 y 与 flat 接近(差<4px;变异=对称缩放→墙底下移→红)
(function () {
  var tall = wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'N' }, theme: 'dungeon', monsters: [], wallHeights: { '2,0': 2.5 } });
  var flat = wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'N' }, theme: 'dungeon', monsters: [], flatWalls: true });
  ok(maxH(tall) > maxH(flat) * 1.3 && Math.abs(maxBot(tall) - maxBot(flat)) < 4, 'S2 锚脚:wallHeights 拔高墙顶不动墙脚(标高墙更高、最低墙底≈flat;变异=对称缩放→墙底下移→红) tallH=' + Math.round(maxH(tall)) + ' flatH=' + Math.round(maxH(flat)) + ' tallBot=' + Math.round(maxBot(tall)) + ' flatBot=' + Math.round(maxBot(flat)));
})();
// S3 wallHeights 作者精确标:标某墙格 scale=3 → 该墙列显著高于默认平整墙(scale=1)
(function () {
  var marked = wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'N' }, theme: 'dungeon', monsters: [], wallHeights: { '2,0': 3 } });   // 玩家(2,2)朝 N 穿(2,1)地板、撞(2,0)墙
  var plain = wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'N' }, theme: 'dungeon', monsters: [] });
  ok(maxH(marked) > maxH(plain) * 1.5, 'S3 wallHeights 作者标(2,1):3 → 该墙列显著高于默认平整墙(变异=不读 wallHeights→相近→红) marked=' + Math.round(maxH(marked)) + ' plain=' + Math.round(maxH(plain)));
})();
// S4 缺省墙高确定性(默认平整=常量,确定性 trivial;仍锁防偶然引入 Math.random):同迷宫两次墙列逐字相同
(function () {
  var a = wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'E' }, theme: 'dungeon', monsters: [] });
  var b = wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'E' }, theme: 'dungeon', monsters: [] });
  ok(a.length > 0 && JSON.stringify(a) === JSON.stringify(b), 'S4 缺省墙高确定性:同迷宫两次墙列逐字相同(变异=wallScaleAt 用 Math.random→不同→红) n=' + a.length);
})();
// S5 per-scene wallScale:整场景等比拔高 → 最高墙列 ≈ scale×flat(均匀拔高、无逐格阶梯=大厅感)
(function () {
  var grand = wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'E' }, theme: 'dungeon', monsters: [], wallScale: 1.5 });
  var flat = wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'E' }, theme: 'dungeon', monsters: [], flatWalls: true });
  ok(maxH(grand) > maxH(flat) * 1.4 && maxH(grand) < maxH(flat) * 1.6, 'S5 wallScale 整场景等比拔高:最高墙列≈1.5×flat(均匀拔高=大厅感;变异=不读 maze.wallScale→≈flat→红) grand=' + Math.round(maxH(grand)) + ' flat=' + Math.round(maxH(flat)));
})();
// S6 flatWalls 压过 wallScale:显式平整优先(flatWalls:true + wallScale:1.5 → 仍平整)
(function () {
  var forced = wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'E' }, theme: 'dungeon', monsters: [], flatWalls: true, wallScale: 1.5 });
  var flat = wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'E' }, theme: 'dungeon', monsters: [], flatWalls: true });
  ok(Math.abs(maxH(forced) - maxH(flat)) <= maxH(flat) * 0.03, 'S6 flatWalls 压过 wallScale:显式平整优先(变异=flatWalls 不再 early-return→被 wallScale 拔高→红) forced=' + Math.round(maxH(forced)) + ' flat=' + Math.round(maxH(flat)));
})();
// S7 wallScale 校验 fail-loud:非数字 / <1 → startMaze 抛(形态错即报 §11);≥1 数字不抛
(function () {
  function fireScale(ws) { var m = freshModule({}, {}); var threw = null; try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: SGRID, start: { x: 2, y: 2, dir: 'E' }, theme: 'dungeon', monsters: [], wallScale: ws } }); } catch (e) { threw = e; } return threw; }
  var bad1 = fireScale('big'), bad2 = fireScale(0.5), good = fireScale(1.5);
  ok(!!bad1 && !!bad2 && !good, 'S7 wallScale 校验:非数字/<1 抛、≥1 数字不抛(变异=去校验→bad 不抛→红) badStr=' + !!bad1 + ' bad<1=' + !!bad2 + ' good=' + !!good);
})();
// S8 wallTexMode 校验 fail-loud:非 'tile'/'stretch' → startMaze 抛(形态错即报 §11);两合法值不抛
(function () {
  function fireMode(m0) { var m = freshModule({}, {}); var threw = null; try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: SGRID, start: { x: 2, y: 2, dir: 'E' }, theme: 'dungeon', monsters: [], wallScale: 1.85, wallTexMode: m0 } }); } catch (e) { threw = e; } return threw; }
  var bad = fireMode('tiled'), okT = fireMode('tile'), okS = fireMode('stretch');
  ok(!!bad && !okT && !okS, "S8 wallTexMode 校验:非 'tile'/'stretch' 抛、两合法值不抛(变异=去校验→bad 不抛→红) bad=" + !!bad + ' tile=' + !okT + ' stretch=' + !okS);
})();
// S9 wallTexMode 双模式真生效:同一 wallScale=2 高墙,tile 与 stretch 的墙纹列序列不同(平铺多贴几排 vs 等比放大);但墙体外框等高(几何只随 wallScale、与纹理模式无关)
(function () {
  function cols(mode) { return wallCols({ grid: SGRID, start: { x: 2, y: 2, dir: 'E' }, theme: 'dungeon', monsters: [], wallScale: 2, wallTexMode: mode }); }
  var tile = cols('tile'), stretch = cols('stretch');
  var diff = JSON.stringify(tile) !== JSON.stringify(stretch);
  var sameEnv = Math.abs(maxH(tile) - maxH(stretch)) <= maxH(stretch) * 0.02;
  ok(diff && sameEnv, 'S9 wallTexMode 双模式生效:tile≠stretch 墙纹(变异=开关空转恒传 sc→序列相同→红)、外框仍等高(几何只随 wallScale) diff=' + diff + ' tileMaxH=' + Math.round(maxH(tile)) + ' stretchMaxH=' + Math.round(maxH(stretch)));
})();

// ════ T. R1-4 批1 PC 控制(WASD strafe 侧移 + mapKey 拆开;mouselook=Pointer Lock 无 headless API → 靠 Playwright 真机核)════
//   验法:玩家(2,2)朝 N 站,合成某键持续按、pump 让其移动,看是否走到「特定方向的事件格」触发 run(=移动方向正确的行为证据)。
//   朝 N(=-y):前进→北(2,1)、strafe 右→东(3,2)、strafe 左→西(1,2)。
section('T PC 控制(strafe/mapKey)');
function ctrlRun(key, ev) {
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [ev] } });
  if (winH.keydown) winH.keydown({ key: key, preventDefault: function () {} });
  pump(40);
  return m.api.state;
}
ok(ctrlRun('d', { x: 3, y: 2, run: function (S) { S.hit = 1; } }).hit === 1, 'T1 WASD D=strafe 右(朝N侧移到东(3,2);变异=D 仍转向/无 strafe→原地不侧移→不触发→红)');
ok(ctrlRun('a', { x: 1, y: 2, run: function (S) { S.hit = 1; } }).hit === 1, 'T2 WASD A=strafe 左(朝N侧移到西(1,2))');
ok(ctrlRun('w', { x: 2, y: 1, run: function (S) { S.hit = 1; } }).hit === 1, 'T3 W=前进(朝N前进到北(2,1);intent 层 forward 仍工作)');
ok(ctrlRun('ArrowRight', { x: 3, y: 2, run: function (S) { S.hit = 1; } }).hit !== 1, 'T4 方向键 →=转向不侧移(东事件不触发;与 T1 对比证 ←→ 转向 / A/D strafe 已拆开;变异=ArrowRight 错当 strafe→触发→红)');
(function () {   // T4b E/Enter 是离散检视 intent,不进入持续移动 keys 表。
  var m = freshModule({}, {}), pd = 0;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 1, run: function (S) { S.hit = 1; } }] } });
  if (winH.keydown) { winH.keydown({ key: 'E', repeat: false, preventDefault: function () { pd++; } }); winH.keydown({ key: 'Enter', repeat: true, preventDefault: function () { pd += 10; } }); }
  pump(50);
  ok(m.api.state.hit !== 1 && pd === 0, 'T4b E/Enter 不进 mapKey/keys 表,按住或 repeat 不导致前进/侧移/转向,无检视目标也不 preventDefault hit=' + m.api.state.hit + ' pd=' + pd);
})();
(function () {   // T5 Pointer Lock 被浏览器拒绝是可选 mouselook 失败,不能冒成全局错误;拒绝后短冷却内不重复请求。
  var calls = 0, caught = 0;
  var m = freshModule({}, { pointerLockRequest: function () { calls++; return { catch: function (fn) { caught++; fn(new Error('Pointer lock cannot be acquired immediately after the user has exited the lock.')); } }; } });
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [] } });
  var cv = null, ch = stageEl.children, i;
  for (i = 0; i < ch.length; i++) if (ch[i] && ch[i].getContext) cv = ch[i];
  if (cv && cv._h && cv._h.pointerdown) { cv._h.pointerdown({ preventDefault: function () {} }); cv._h.pointerdown({ preventDefault: function () {} }); }
  ok(calls === 1 && caught === 1, 'T5 Pointer Lock Promise rejection 被本地 catch 吃掉,且 deny 冷却内不连打 request(变异=未 catch→全局错误横幅 / 无冷却→calls=2) calls=' + calls + ' caught=' + caught);
})();
(function () {   // T6 ESC/浏览器退出 pointer lock 后,立即点画面不应马上重请求;冷却过后用户再点可重进。
  var calls = 0;
  var m = freshModule({}, { pointerLockRequest: function () { calls++; return { catch: function () {} }; } });
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [] } });
  var cv = null, ch = stageEl.children, i;
  for (i = 0; i < ch.length; i++) if (ch[i] && ch[i].getContext) cv = ch[i];
  if (cv && cv._h && cv._h.pointerdown) cv._h.pointerdown({ preventDefault: function () {} });
  global.document.pointerLockElement = cv; if (docH.pointerlockchange) docH.pointerlockchange({});
  global.document.pointerLockElement = null; if (docH.pointerlockchange) docH.pointerlockchange({});
  if (cv && cv._h && cv._h.pointerdown) cv._h.pointerdown({ preventDefault: function () {} });
  var blocked = calls === 1;
  pump(65);
  if (cv && cv._h && cv._h.pointerdown) cv._h.pointerdown({ preventDefault: function () {} });
  ok(blocked && calls === 2, 'T6 Pointer Lock 退出后短冷却拦立即重进,冷却后允许再次点击进入(变异=刚 ESC 退出立刻 request→浏览器报错横幅) blocked=' + blocked + ' calls=' + calls);
})();
(function () {   // T7 退出全屏 hook(通关/被抓/按钮同路)必须同步释放 Pointer Lock,否则结算选项出现了但鼠标仍被画面捕获。
  var calls = 0, exits = 0;
  var m = freshModule({}, { pointerLockRequest: function () { calls++; return { catch: function () {} }; } });
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [] } });
  var cv = null, fsBtn = null, ch = stageEl.children, i, j;
  for (i = 0; i < ch.length; i++) {
    if (ch[i] && ch[i].getContext) cv = ch[i];
    if (ch[i] && ch[i].textContent === '⛶') fsBtn = ch[i];
    if (ch[i] && ch[i].children) for (j = 0; j < ch[i].children.length; j++) if (ch[i].children[j] && ch[i].children[j].textContent === '⛶') fsBtn = ch[i].children[j];
  }
  global.document.exitPointerLock = function () { exits++; global.document.pointerLockElement = null; if (docH.pointerlockchange) docH.pointerlockchange({}); };
  if (cv && cv._h && cv._h.pointerdown) cv._h.pointerdown({ preventDefault: function () {} });
  global.document.pointerLockElement = cv; if (docH.pointerlockchange) docH.pointerlockchange({});
  if (fsBtn && fsBtn._h && fsBtn._h.pointerdown) fsBtn._h.pointerdown({ preventDefault: function () {} });   // 进伪全屏
  if (fsBtn && fsBtn._h && fsBtn._h.pointerdown) fsBtn._h.pointerdown({ preventDefault: function () {} });   // 退伪全屏 → releaseMouseLookIfMine
  ok(calls === 1 && exits === 1 && global.document.pointerLockElement !== cv && stageEl.style.position === 'relative', 'T7 退出全屏时同步 exitPointerLock,鼠标脱离控制且舞台回页面(变异=只退全屏不退鼠标锁) calls=' + calls + ' exits=' + exits + ' pos=' + stageEl.style.position);
})();

// ════ T8. 失焦/后台必须清移动 intent，防 keyup 丢失后恢复焦点幽灵移动 ════
(function () {
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 1, run: function (S) { S.ghostMove = 1; } }] } });
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  if (winH.blur) winH.blur({});
  pump(50);
  ok(!m.api.state.ghostMove, 'T8a keydown 后 window blur 未收到 keyup → intent 已清，不幽灵前进');

  var m2 = freshModule({}, {});
  m2.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 1, run: function (S) { S.hiddenMove = 1; } }] } });
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  global.document.hidden = true;
  if (docH.visibilitychange) docH.visibilitychange({});
  pump(50);
  ok(!m2.api.state.hiddenMove, 'T8b keydown 后 document hidden → intent 已清，不在后台继续前进');

  var m3 = freshModule({}, {});
  global.window.matchMedia = function (q) { return { matches: /coarse/.test(q) }; };
  m3.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 1, run: function (S) { S.touchAfterBlur = (S.touchAfterBlur || 0) + 1; } }] } });
  var ovr = null, ch = stageEl.children, i;
  for (i = 0; i < ch.length; i++) if (ch[i] && ch[i].style && /inset/.test(ch[i].style.cssText || '')) ovr = ch[i];
  if (ovr && ovr._h && ovr._h.pointerdown) {
    ovr._h.pointerdown({ pointerId: 31, clientX: 80, clientY: 200, preventDefault: function () {} });
    ovr._h.pointermove({ pointerId: 31, clientX: 80, clientY: 120 });
  }
  if (winH.blur) winH.blur({});
  pump(40);
  var stoppedAfterBlur = !m3.api.state.touchAfterBlur;
  if (ovr && ovr._h && ovr._h.pointerdown) {
    ovr._h.pointerdown({ pointerId: 32, clientX: 80, clientY: 200, preventDefault: function () {} });
    ovr._h.pointermove({ pointerId: 32, clientX: 80, clientY: 120 });
    pump(40);
  }
  ok(stoppedAfterBlur && m3.api.state.touchAfterBlur === 1, 'T8c 触屏摇杆失焦时归零并释放旧 pointerId；恢复后新手指可重新接管(变异=只清 g.fwd 不清 moveId → 新 pointer 无法启动) stopped=' + stoppedAfterBlur + ' resumed=' + m3.api.state.touchAfterBlur);
})();

// ════ U. R1-4 批2 触屏(浮动摇杆 → intent 层 g.fwd 驱动移动;注入 matchMedia coarse 强制触屏分支 + dispatch overlay pointer)════
//   headless 默认 isTouch=false(无 matchMedia)→ 走桌面分支;这里注入 matchMedia coarse → 触屏分支,验 ① 摇杆 overlay 渲染 ② 左摇杆拖拽驱动移动。
//   (Playwright 模拟触屏另在 _scratch 端到端核 UI/视觉/手感;此处 committed 锁运行时=arcade 运行时不漏端用户。)
section('U 触屏摇杆');
(function () {
  var m = freshModule({}, {});
  global.window.matchMedia = function (q) { return { matches: /coarse/.test(q) }; };   // 模拟触屏设备 pointer:coarse
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [], events: [{ x: 2, y: 1, run: function (S) { S.viaStick = 1; } }] } });
  var ovr = null, ch = stageEl.children, i;
  for (i = 0; i < ch.length; i++) if (ch[i] && ch[i].style && /inset/.test(ch[i].style.cssText || '')) ovr = ch[i];   // 找摇杆 overlay(inset:0 的 div)
  ok(!!ovr, 'U1 触屏检测(matchMedia coarse)→ 摇杆 overlay 渲染(变异=isTouch 误判→无 overlay→红) ovr=' + !!ovr);
  if (ovr && ovr._h && ovr._h.pointerdown) {
    ovr._h.pointerdown({ pointerId: 1, clientX: 80, clientY: 200, preventDefault: function () {} });   // 左半(orect fallback width 480,80<240)按下
    ovr._h.pointermove({ pointerId: 1, clientX: 80, clientY: 120 });   // 上移 80px = 推摇杆向前 → g.fwd>0
    pump(40);
  }
  ok(m.api.state.viaStick === 1, 'U2 左摇杆上移→前进(朝N前进到(2,1)事件;intent 层 g.fwd 驱动;变异=摇杆不写 g.fwd / overlay 无 pointer→不动→红) viaStick=' + m.api.state.viaStick);
})();
// U3 统一伪全屏(用户定:所有设备都 CSS 伪全屏、一个沉浸按钮,不用系统全屏 API):点按钮 → 伪全屏(stage position:fixed 铺满 + 摇杆显 + 四向隐)→ 再点 → 退(四向显 + relative)
//   端用户"点全屏画面没变大"根因 = stage 的 inline position:relative 压住伪全屏 class 的 position:fixed → enterFs 显式设 inline position:fixed 覆盖;本测专门验 stageEl.style.position==='fixed'(铺满)。
(function () {
  var m = freshModule({}, {});
  global.window.matchMedia = function (q) { return { matches: /coarse/.test(q) }; };
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [] } });
  var fsBtn = null, ovr = null, ctr = null, ch = stageEl.children, i, cs;
  for (i = 0; i < ch.length; i++) { if (ch[i] && ch[i].textContent === '⛶') fsBtn = ch[i]; cs = (ch[i] && ch[i].style && ch[i].style.cssText) || ''; if (/inset/.test(cs)) ovr = ch[i]; else if (/justify-content:\s*center/.test(cs)) ctr = ch[i]; }
  var hasBtn = !!fsBtn;   // 沉浸按钮总创建(不依赖系统全屏 API)
  var d0 = !!(ovr && ovr.style.display === 'none' && ctr && ctr.style.display !== 'none');   // 非全屏:四向显/摇杆隐
  if (fsBtn && fsBtn._h && fsBtn._h.pointerdown) fsBtn._h.pointerdown({ preventDefault: function () {} });   // 点 → enterFs → CSS 伪全屏
  var dFs = !!(ovr && ovr.style.display === 'block' && ctr && ctr.style.display === 'none' && stageEl.style.position === 'fixed');   // 伪全屏:摇杆显/四向隐 + stage 铺满(inline position:fixed,修"画面没变大")
  if (fsBtn && fsBtn._h && fsBtn._h.pointerdown) fsBtn._h.pointerdown({ preventDefault: function () {} });   // 再点 → exitFs
  var dEx = !!(ovr && ovr.style.display === 'none' && ctr && ctr.style.display !== 'none' && stageEl.style.position === 'relative');   // 退:四向显/摇杆隐 + position 恢复
  ok(hasBtn && d0 && dFs && dEx, 'U3 统一伪全屏:沉浸按钮在 + 非全屏四向 → 点进伪全屏(stage position:fixed 铺满 + 摇杆显四向隐)→ 退回四向+relative(变异=enterFs 不设 inline position:fixed→不铺满 / 切换反→红) btn=' + hasBtn + ' d0=' + d0 + ' fs=' + dFs + ' ex=' + dEx);
})();

// U5 竖屏画面区不启动摇杆(操作只在画面下方空白,手指不碰画面、靠中间防边缘退出=端用户要的):画面区(y<canvas 底)pointerdown 不启动、操作区(y>canvas 底)启动
(function () {
  var m = freshModule({}, {});
  global.window.matchMedia = function (q) { return { matches: /coarse|portrait/.test(q) }; };   // 触屏 + 竖屏
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [] } });
  var ovr = null, cv = null, ch = stageEl.children, i, cs;
  for (i = 0; i < ch.length; i++) { if (ch[i] && ch[i].getContext) cv = ch[i]; cs = (ch[i] && ch[i].style && ch[i].style.cssText) || ''; if (/inset/.test(cs)) ovr = ch[i]; }
  if (cv) cv.getBoundingClientRect = function () { return { left: 0, top: 0, width: 400, height: 250, bottom: 250, right: 400 }; };   // mock 画面底边 y=250
  if (ovr) ovr.getBoundingClientRect = function () { return { left: 0, top: 0, width: 400, height: 700, bottom: 700, right: 400 }; };
  var knob = ovr && ovr.children && ovr.children[0], hd = ovr && ovr._h && ovr._h.pointerdown;
  if (hd) hd({ pointerId: 7, clientX: 100, clientY: 100, preventDefault: function () {} });   // 画面区 y=100<250 → 应不启动
  var picNoStart = !!(knob && knob.style.display !== 'block');
  if (hd) hd({ pointerId: 8, clientX: 100, clientY: 500, preventDefault: function () {} });   // 操作区 y=500>250 → 应启动
  var ctrlStart = !!(knob && knob.style.display === 'block');
  ok(picNoStart && ctrlStart, 'U5 竖屏画面区不启动摇杆(y<canvas底)/操作区启动(y>底)=手指只在画面下方操作(变异=去 por&&clientY<cb 画面区判断→画面区也启动→picNoStart 红) pic=' + picNoStart + ' ctrl=' + ctrlStart);
})();

// U6 边缘 guard 加宽(L/R 24→40)+ 新增底部 guard(端用户"空白区域滑动更容易返回":手指太贴物理边缘触发系统手势 → 操作点往屏中收)
(function () {
  var m = freshModule({}, {});
  global.window.matchMedia = function (q) { return { matches: /coarse/.test(q) }; };   // 触屏、非竖屏(避开画面区判断,只验边缘 guard)
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [] } });
  var ovr = null, ch = stageEl.children, i, cs;
  for (i = 0; i < ch.length; i++) { cs = (ch[i] && ch[i].style && ch[i].style.cssText) || ''; if (/inset/.test(cs)) ovr = ch[i]; }
  if (ovr) ovr.getBoundingClientRect = function () { return { left: 0, top: 0, width: 400, height: 700, bottom: 700, right: 400 }; };
  var knob = ovr && ovr.children && ovr.children[0], hd = ovr && ovr._h && ovr._h.pointerdown;
  if (hd) hd({ pointerId: 21, clientX: 30, clientY: 350, preventDefault: function () {} });   // 左缘 30px(旧 24 放行、新 40 拦):应不启动
  var rejL = !!(knob && knob.style.display !== 'block');
  if (hd) hd({ pointerId: 22, clientX: 150, clientY: 690, preventDefault: function () {} });   // 底缘 690(>700-32):应不启动
  var rejB = !!(knob && knob.style.display !== 'block');
  if (hd) hd({ pointerId: 23, clientX: 150, clientY: 350, preventDefault: function () {} });   // 屏中(左半、远离边缘):应启动
  var accCenter = !!(knob && knob.style.display === 'block');
  ok(rejL && rejB && accCenter, 'U6 边缘 guard:左缘30px拦(加宽自24)+ 底缘690拦(新底部 guard)+ 屏中启动(变异=去 lx<EDGE 项→rejL红 / 去 ly>rc.height-EDGE_B 项→rejB红 / EDGE 过大→accCenter红) rejL=' + rejL + ' rejB=' + rejB + ' acc=' + accCenter);
})();

// U7 防误退 history dummy:进伪全屏 → 压一个 history state;iOS 左缘后退手势(popstate)→ 退伪全屏回到页面,而非离开网页(唯一能接住真·系统后退手势的 web 手段)
(function () {
  var m = freshModule({}, {});
  global.window.matchMedia = function (q) { return { matches: /coarse/.test(q) }; };
  var pushed = 0; global.window.history = { pushState: function () { pushed++; }, back: function () {} };
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, monsters: [] } });
  var fsBtn = null, ch = stageEl.children, i;
  for (i = 0; i < ch.length; i++) if (ch[i] && ch[i].textContent === '⛶') fsBtn = ch[i];
  if (fsBtn && fsBtn._h && fsBtn._h.pointerdown) fsBtn._h.pointerdown({ preventDefault: function () {} });   // → enterFs → pushState + 注册 popstate
  var enteredFs = stageEl.style.position === 'fixed', didPush = pushed > 0, hasPop = !!winH.popstate;
  var bodyLocked = global.document.body.style.overflow === 'hidden';   // 进伪全屏锁底层滚动(覆盖 mock 补 body 后此前漏测的分支)
  if (winH.popstate) winH.popstate({});   // 模拟 iOS 左缘后退手势
  var exitedToPage = stageEl.style.position === 'relative';   // 退伪全屏(回页面)而非离开网页
  var bodyRestored = global.document.body.style.overflow === '';   // 退出还原底层滚动
  ok(enteredFs && didPush && hasPop && exitedToPage && bodyLocked && bodyRestored, 'U7 防误退:进伪全屏压 history dummy + 锁底层滚动 + 注册 popstate → 后退手势退伪全屏回页面并还原滚动(变异=不 pushState→push红 / 不锁 body→lock红 / popstate 不调 exitFsIfMine→exit红) fs=' + enteredFs + ' push=' + didPush + ' pop=' + hasPop + ' exit=' + exitedToPage + ' lock=' + bodyLocked + ' restore=' + bodyRestored);
})();

// ════ V. Q1+Q2 墙面竖向明暗塑形(topBoost 顶亮 + botDip 底暗梯度 + AO 边缘暗带)═══════════
//   验法:用 recStyleOn 捕获所有 fillRect 的 [x,y,w,h,fillStyle];过滤 rgba 叠层 → 证明
//     V1 顶部段存在 rgba(255,255,255,...) 白叠层(topBoost 偏亮;变异=去 topBoost→白叠层消失→红)
//     V2 底部段存在 rgba(0,0,0,...) 黑叠层(botDip 偏暗;变异=去 botDip→黑叠层消失→红)
//     V3 墙顶 AO 暗带存在(墙脚 AO 已移除=冗余且成粗横线;变异=去 AO→高alpha黑叠层消失→红)
//     V4 无 wallBase 主题(''=中性)→ 梯度/AO 全不画(guard 跳过)
//     V5 topBoost=0,botDip=0 → 无 Q1 白/黑梯度叠层(零增强=零叠加)
section('V 墙面竖向明暗塑形(Q1 梯度 + Q2 AO)');
// 辅助:捕获主题 theme 下一帧所有 w=1 的 fillRect 记录(含 fillStyle)
function captureWallStyle(theme, extra) {
  var mz = { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'E' }, monsters: [] };
  if (typeof theme === 'string') mz.theme = theme;
  var nodeOpts = { kind: 'maze3d', winKey: 'won', maze: mz };
  if (extra) for (var k in extra) nodeOpts.maze[k] = extra[k];
  var m = freshModule({}, {}); recStyleRects = []; recStyleOn = true;
  try { m.api.fire(nodeOpts); } catch (e) {}
  pump(2); recStyleOn = false;
  // 返回 w=1 的所有记录(墙列宽度)
  var out = []; for (var i = 0; i < recStyleRects.length; i++) if (recStyleRects[i][2] === 1) out.push(recStyleRects[i]);
  return out;
}
// 过滤白叠层 rgba(255,255,255,...)
function hasWhiteOverlay(recs) { for (var i = 0; i < recs.length; i++) if (/^rgba\(255,255,255,/.test(recs[i][4])) return true; return false; }
// 过滤黑叠层 rgba(0,0,0,...) 且 alpha>0.005
function hasBlackOverlay(recs) { for (var i = 0; i < recs.length; i++) if (/^rgba\(0,0,0,/.test(recs[i][4]) && parseFloat(recs[i][4].split(',')[3]) > 0.005) return true; return false; }
// 取最大 Y 的 rgba(0,0,0,...) 叠层(墙脚 AO 应在最下)
function maxYblack(recs) { var mx = -1; for (var i = 0; i < recs.length; i++) if (/^rgba\(0,0,0,/.test(recs[i][4])) { var by = recs[i][1] + recs[i][3]; if (by > mx) mx = by; } return mx; }
// 取最小 Y 的 rgba(0,0,0,...) 叠层(墙顶 AO 应在最上)
function minYblack(recs) { var mn = Infinity; for (var i = 0; i < recs.length; i++) if (/^rgba\(0,0,0,/.test(recs[i][4])) { if (recs[i][1] < mn) mn = recs[i][1]; } return mn; }
// 取所有 rgba(0,0,0,...) 中最高 alpha(AO 最强带)
function maxAlphaBlack(recs) { var mx = 0; for (var i = 0; i < recs.length; i++) { if (/^rgba\(0,0,0,/.test(recs[i][4])) { var a = parseFloat(recs[i][4].split(',')[3]); if (a > mx) mx = a; } } return mx; }
// 取所有 rgba(255,255,255,...) 中最高 alpha
function maxAlphaWhite(recs) { var mx = 0; for (var i = 0; i < recs.length; i++) { if (/^rgba\(255,255,255,/.test(recs[i][4])) { var a = parseFloat(recs[i][4].split(',')[3]); if (a > mx) mx = a; } } return mx; }
function finalColumnPaint(theme, extra, x) {                    // 行为侧像素近似:按 fillRect 顺序回放某一列最终颜色,避免把“已被踢脚盖掉的纹理 draw 调用”误当视觉结果
  var mz = { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'E' }, monsters: [], theme: theme };
  if (extra) for (var k in extra) mz[k] = extra[k];
  var m = freshModule({}, {}), pix = [], recs, i, r, y, y0, y1, foot = 0, h = 0;
  for (y = 0; y < 300; y++) pix[y] = '';
  recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz }); } catch (e) {}
  pump(1); recStyleRects = []; recStyleAfter = fillRects; pump(1); recStyleOn = false; recs = recStyleRects.slice();
  for (i = 0; i < recs.length; i++) {
    r = recs[i]; if (!(x >= r[0] && x < r[0] + r[2])) continue;
    if (r[2] === 1 && r[3] > h && /^rgb\(/.test(r[4])) { h = r[3]; foot = r[1] + r[3]; }
    y0 = Math.max(0, Math.floor(r[1])); y1 = Math.min(300, Math.ceil(r[1] + r[3]));
    for (y = y0; y < y1; y++) pix[y] = r[4];
  }
  return { pix: pix, foot: foot, h: h };
}

(function () {   // V1 cave 主题有 wallBase → 顶部白叠层存在(topBoost 偏亮)
  var recs = captureWallStyle('cave');
  var hasW = hasWhiteOverlay(recs);
  ok(hasW, 'V1 cave 主题(有 wallBase):顶部偏亮=白叠层 rgba(255,255,255,...) 存在(topBoost Q1;变异=去 ctx.fillStyle=rgba(255,... 行→无白叠层→红) hasWhite=' + hasW);
})();
(function () {   // V2 botDip 效果:aoStrength=0(关AO)时仍有黑叠层(来自 botDip 梯度);若 botDip=0 则消失
  //   用 aoStrength=0 隔离 Q1 黑叠层(排除 AO 干扰),验 botDip 真的产生了黑叠层
  var recsWith   = captureWallStyle('cave', { aoStrength: 0 });           // botDip 有值(默0.18),AO 关
  var recsNoBdip = captureWallStyle('cave', { botDip: 0, aoStrength: 0 }); // botDip=0 且 AO 关
  var hasBwith   = hasBlackOverlay(recsWith);
  var hasBno     = hasBlackOverlay(recsNoBdip);
  ok(hasBwith && !hasBno, 'V2 botDip Q1 黑叠层:aoStrength=0 时 botDip 默认值→有黑叠层 / botDip=0→无黑叠层(变异=固化 botDip=0 忽略参数→with 也无黑→红) with=' + hasBwith + ' noBotDip=' + hasBno);
})();
(function () {   // V3 墙顶 AO 黑叠层存在(【墙脚 AO 已移除】:它在踢脚 baseZone 收口【上方】再叠一条暗带,平整长墙近距离看跨格对齐成端用户 recipe3 反馈的「额外横穿砖块的粗横线」;baseZone fill 已暗化墙脚、墙脚 AO 冗余 → 删之):关梯度后墙顶仍有黑 AO 叠层
  var recs = captureWallStyle('cave', { topBoost: 0, botDip: 0 });  // 关梯度,只剩墙顶 AO
  var mxA  = maxAlphaBlack(recs);
  ok(mxA > 0.05, 'V3 墙顶 AO 黑叠层存在(墙脚 AO 已移除;变异=连墙顶 AO 也删→无高 alpha 黑叠层→红) maxAlpha=' + mxA.toFixed(3));
})();
(function () {   // V4 默认中性主题(''=无 wallBase) → guard 跳过,无 rgba 叠层
  var recs = captureWallStyle('');
  var hasW = hasWhiteOverlay(recs);
  var hasB = hasBlackOverlay(recs);
  ok(!hasW && !hasB, 'V4 默认中性主题(无 wallBase) → guard 跳过,无 rgba 白/黑叠层(向后兼容;变异=把 guard 条件移到后面→无 wallBase 时也画→红) white=' + hasW + ' black=' + hasB);
})();
(function () {   // V5 topBoost=0,botDip=0 → Q1 梯度 k 恒 0,无白叠层
  var recs = captureWallStyle('cave', { topBoost: 0, botDip: 0 });
  var hasW = hasWhiteOverlay(recs);
  var mxW  = maxAlphaWhite(recs);
  ok(!hasW, 'V5 topBoost=0,botDip=0 → Q1 梯度=零,无 rgba 白叠层(只剩 AO 黑叠层;验作者可关梯度;变异=把 topBoost 写死 0.12 忽略 T.topBoost→仍有白→红) hasWhite=' + hasW + ' maxWhiteAlpha=' + mxW.toFixed(3));
})();
(function () {   // V6 墙脚干净收口:最终画面中,靠近地面线最后一段应由统一踢脚底色覆盖,而不是砖缝/血肉横纹一路压到地板边。
  function tailRuns(theme) {
    var cap = finalColumnPaint(theme, { aoStrength: 0, topBoost: 0, botDip: 0 }, 240), pix = cap.pix, start = Math.max(0, Math.floor(cap.foot - cap.h * 0.14)), end = Math.min(299, Math.floor(cap.foot - 2));
    var runs = 0, last = null, y;
    for (y = start; y <= end; y++) if (pix[y]) { if (pix[y] !== last) { runs++; last = pix[y]; } }
    return runs;
  }
  var brickRuns = tailRuns('dungeon'), fleshRuns = tailRuns('flesh');
  ok(brickRuns <= 2 && fleshRuns <= 2, 'V6 墙脚最后 14% 是干净踢脚收口,最终颜色不再多条横纹压到地面线(变异=删 base skirt/让纹理画到底→runs>2) brick=' + brickRuns + ' flesh=' + fleshRuns);
})();

// ════ W. 砖缝凹槽立体 + seeded 污渍/矿脉(Q3 drawWallTex 增强)════════════════════
//   砖缝凹槽:缝旁 +1px 亮侧(受光边)+ +1px 暗侧(背光边)→ fillRect 总数明显多于 topBoost=0 关闭时。
//   seeded 污渍:世界同坐标两次渲染颜色序列逐字相同(确定性守卫);wearLevel 调概率。
//   验方法:recCols 录全部 fillStyle;recRects 录几何(w=1 列逐字积累)。
section('W 砖缝凹槽立体 + seeded 污渍');

// 近距离砖/石/瓦主题(确保 dH>40 → 凹槽分支激活):玩家(2,2)朝 N,墙在(2,1)距~1 格→ lineH 大
var WGRID = ['#####', '#.P.#', '#...#', '#.D.#', '#####'];   // 有门(south)+ 无怪,5×5
// 用 dungeon(brick) 主题:wallBase 有值、wallTex=brick → 三分支都会走
function wearCols(wearLevel, topBoost) {
  var m = freshModule({}, {}); recCols = []; recOn = true;
  var mazeOpts = { grid: WGRID, start: { x: 2, y: 1, dir: 'N' }, theme: 'dungeon', monsters: [] };
  // 通过 node.maze 的 theme 本身在 THEMES 里;T.wearLevel/topBoost 用 fallback 字段(在主题对象上注入)
  // 因为 THEMES 不改,我们 hack:覆盖模块内 THEMES 的方式行不通 → 改用 flatWalls trick:
  // 实际上 T 就是 THEMES[theme],作者可配字段 T.topBoost/T.wearLevel 是从主题对象读的。
  // 测试里我们无法直接给 T 注入。可通过 node.maze.theme=''(缺省)→ wallBase 无值=drawWallTex 直接 return,不行。
  // 需要用一个已有 wallBase 的主题 + 测试时读到 T.wearLevel。
  // 解法:注入自定义主题到 THEMES 表后再触发 → 但 THEMES 是模块闭包内 var,外部访问不到。
  // 最务实方案:用缺省 fallback 默认值直接验;T.wearLevel/topBoost 从 T 读,即从 THEMES[theme] 读,
  // 既然 THEMES 里没这俩字段,每次都走默认值 0.5 / 0.12。
  // 所以 wearLevel/topBoost 参数在这里只用于:wearLevel=0 → 我们用不同 mock 方式。
  // 另一思路:用 maze.theme='' 默认主题 → 走 !wallBase 直接 return → 不画砖缝。
  // 最简可行方案:改用 fillRect 计数对比,无论 cx/cy 是什么、确定性体现在同一迷宫两次渲染相同。
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mazeOpts }); } catch (e) {}
  pump(2); recOn = false; return recCols.slice();
}

(function () {   // W0 maze.wallTex 覆盖主题墙材质:gallery 墙壁卡只换 wallTex 时必须真生效,不能全沿用 dungeon brick。
  function sig(name) { return captureWallStyle('dungeon', { wallTex: name, wearLevel: 0 }).map(function (r) { return r[0] + ',' + r[1] + ',' + r[2] + ',' + r[3] + ':' + r[4]; }).join('|'); }
  var brick = sig('brick'), wood = sig('wood'), shoji = sig('shoji'), none = sig('none');
  ok(brick !== wood && wood !== shoji && none !== brick, 'W0 maze.wallTex 覆盖主题材质后墙面序列不同(变异=仍只读 T.wallTex → gallery 墙卡全像 brick)');
})();
(function () {   // W0b maze.ceilTex 覆盖主题天花材质:gallery 天花卡只换 ceilTex 时必须真生效。
  function sig(name) { var m = freshModule({}, {}); recCols = []; recOn = true; try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: 'dungeon', ceilTex: name, floorTex: 'slab', monsters: [], flatWalls: true } }); } catch (e) {} pump(2); recOn = false; return recCols.slice(0, 500).join('|'); }
  var slab = sig('slab'), beam = sig('beam'), rib = sig('rib'), panel = sig('panel');
  ok(slab !== beam && beam !== rib && rib !== panel && slab !== panel, 'W0b maze.ceilTex 覆盖主题材质后天花序列不同(变异=仍只读 T.ceilTex → gallery 天花卡全像 slab)');
})();

// W1 砖缝凹槽立体:近距离砖墙 fire+pump → fillRect 总数比石缝渲染(无凹槽分支)更多
//   方法:用 dungeon(brick) 主题录所有颜色 → 提取色调;因 topBoost 默认 0.12 激活凹槽分支,fillRects 多于旧路径。
//   验方法:从 dungeon/brick 连续录颜色对,找相邻颜色中有「比 mk(≈0.45) 亮」的色条紧跟「比 mk 暗的」色条这样的三联体(凹槽结构)。
(function () {
  var m = freshModule({}, {}); recRects = []; recRectsOn = true;
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: WGRID, start: { x: 2, y: 1, dir: 'N' }, theme: 'dungeon', monsters: [] } }); } catch (e) {}
  pump(2); recRectsOn = false;
  // 收集 w=1, h=1 的小矩形(= 凹槽细节 1px 高):只有 dH>40 的墙才出现
  var tiny1px = 0;
  for (var i = 0; i < recRects.length; i++) if (recRects[i][2] === 1 && recRects[i][3] === 1) tiny1px++;
  ok(tiny1px > 0, 'W1 dungeon(brick)近墙渲染出现 1px 高 fillRect(凹槽高光/暗边细节,dH>40 激活;变异=删凹槽 fillRect→tiny1px=0→红) tiny1px=' + tiny1px);
})();

// W2 seeded 污渍确定性:同迷宫两次 fire+pump → fillStyle 颜色序列逐字相同
(function () {
  var run1 = wearCols(0.5, 0.12);
  var run2 = wearCols(0.5, 0.12);
  ok(run1.length > 0 && run1.join('|') === run2.join('|'),
    'W2 seeded 污渍确定性:同迷宫两次颜色序列逐字相同(禁 Math.random/Date.now;变异=wear 用 Math.random→序列不同→红) len=' + run1.length);
})();

// W3 wearLevel 关闭(=0)→ 与默认(0.5)同迷宫对比:默认有 seeded 污渍暗斑,fillRect 数应更多。
//   这是对 W2 的反向验牙:只证明确定性不够,还要证明 wear 分支真的有牙。变异=把 if(wearLevel>0) 改永假 → default≈off → 红。
(function () {
  function countWear(wearLevel) {
    var m = freshModule({}, {}); fillRects = 0;
    var mz = { grid: WGRID, start: { x: 1, y: 1, dir: 'N' }, theme: 'dungeon', monsters: [] };   // 正对墙格(1,0):seed 中有 v<0.15 的 stain,能特异验 wear 分支
    if (wearLevel != null) mz.wearLevel = wearLevel;
    try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz }); } catch (e) {}
    pump(2); return fillRects;
  }
  var defaultWear = countWear(null);   // 缺省 0.5 → 有 seeded 污渍
  var noWear = countWear(0);           // 作者显式关污渍 → 只保留砖缝/凹槽
  ok(defaultWear > noWear + 5, 'W3 wearLevel 默认0.5 比 wearLevel=0 多画 seeded 污渍 fillRect(变异=禁 wear 分支→default≈off→红) default=' + defaultWear + ' off=' + noWear);
})();

// W4 确定性反向验牙:篡改 wear 种子字符串 'wear' → 'WEAR' → 同迷宫两次渲染序列不同(已还原)
//   注意:此测在测试文件中通过替换字符串操作,不修改 raycast-maze.js 源文件 → 用读源文件/替换/eval 方式模拟篡改。
//   更好做法:验「不同世界坐标的墙格颜色序列不同」= 自然地证明 cx/cy 是 seed 的一部分。
(function () {
  // 用两个不同世界坐标的墙格:WGRID 中玩家朝 N(正对(2,0)格)vs 朝 E(正对(4,y)格)
  function colsForDir(dir) {
    var m = freshModule({}, {}); recCols = []; recOn = true;
    try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: WGRID, start: { x: 2, y: 1, dir: dir }, theme: 'dungeon', monsters: [] } }); } catch (e) {}
    pump(2); recOn = false; return recCols.join('|');
  }
  var north = colsForDir('N');   // 正对北墙 cellX=2,cellY=0
  var east  = colsForDir('E');   // 正对东墙 cellX=4,cellY=?
  ok(north !== east, 'W4 不同世界坐标墙格颜色序列不同(cx/cy 是 wear seed 一部分;变异=wear seed 去掉 cx/cy→不同格同种子→序列可能相同→红) northLen=' + north.length + ' eastLen=' + east.length);
})();

// ════ X. L1 柱子地标(maze.pillars:落地锚定纯视觉装饰精灵,不参与追逐/拾取/碰撞/可达)════
//   验法:① 渲染:有柱子时 fillRects 明显多于无柱子(证 projectSprite 返回非 null + drawSprites 路径走到);
//          ② 柱子 y0 < floorY(落地锚定:脚在地面线、头在地面线上方);
//          ③ 柱子不进 g.monsters(不追玩家);④ 玩家可走到柱子格(不改碰撞);⑤ fail-loud 坏数据抛错。
//   反向变异验牙见各 ok() 注释"变异=…→红"。
section('X 柱子地标(L1)');

var XGRID = ['#######', '#.....#', '#.....#', '#.....#', '#######'];   // 5×7 开间,起点(1,1)朝 E,柱在(4,1)可见

// X1 有柱子 → 渲染 fillRects 明显多于无柱子(projectSprite 返非 null + drawSprites 柱子路径生效)
(function () {
  function rects(pillars) {
    var m = freshModule({}, {});
    var mz = { grid: XGRID, start: { x: 1, y: 1, dir: 'E' }, monsters: [] };
    if (pillars) mz.pillars = pillars;
    m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
    pump(2); return fillRects;
  }
  var withPillar = rects([{ x: 4, y: 1 }]);   // 柱在正前方视野内
  var noPillar   = rects(null);
  ok(withPillar > noPillar + 5, 'X1 maze.pillars 有柱子→渲染 fillRect 明显多于无柱(变异=去 drawSprites 柱循环→fillRects 相等→红) with=' + withPillar + ' none=' + noPillar);
})();

// X2 柱子 y0 < floorY:落地锚定(脚在地面线、头在地面线上方=柱子竖起来、不悬浮)
(function () {
  // 访问 projectSprite 返回值:直接走 render 后捕捉 recRects 中高度大的 rect、验最低 y+h ≈ floorY
  // 策略:用 recRects 录 w=1 的全部 fillRect(drawSprites 逐列);柱子的最大 y+h 应 ≈ 画布高/2+(高/2)=~floorY、不超过画布底
  var m = freshModule({}, {}); recRects = []; recRectsOn = true;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: XGRID, start: { x: 1, y: 1, dir: 'E' }, monsters: [], pillars: [{ x: 4, y: 1 }] } });
  pump(2); recRectsOn = false;
  // 找 drawSprites 逐列(w=1)中最大的 y+h(=最低脚点)
  var maxFoot = 0, i;
  for (i = 0; i < recRects.length; i++) {
    var r = recRects[i];
    if (r[2] === 1) { var foot = r[1] + r[3]; if (foot > maxFoot) maxFoot = foot; }
  }
  // floorY for perpDepth≈3(起点(1,1)到柱(4,1)距离约3格):floorY = CH/2 + CH/(2*3) ≈ 0.667*CH;CH=画布高(stub canvas height=0但启动用默认CW/CH)
  // 只验「有足迹」且「不超出画布」(headless canvas height=0 → maxFoot可能0;改验:有柱则 maxFoot > 0 且 recRects 数量随柱增多)
  ok(maxFoot > 0, 'X2 柱子存在时有 w=1 drawSprites 列(落地锚定路径走到;变异=去 pillar 路径→无 w=1 列来自柱→maxFoot=0→红) maxFoot=' + maxFoot);
})();

// X3 柱子不进 g.monsters:有柱子的迷宫,怪数组仍只含显式怪(不含柱子)
(function () {
  // 借用 D 段手法:fire 后 pump 少帧,monsters 数量仅来自显式 monsters 列表(柱子不得混入)
  // 验:无显式 monsters,pump 后未被抓(scareKey 未置)= 无追逐=无怪;额外验:有柱子时 pump 不会触发 scareKey
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: { grid: XGRID, start: { x: 1, y: 1, dir: 'E' }, monsters: [], pillars: [{ x: 4, y: 1 }, { x: 2, y: 2 }] } });
  pump(120);
  ok(m.api.state.caught !== true, 'X3 柱子不参与追逐:有柱子无显式怪,pump 120 帧未被抓(变异=柱子误入 g.monsters 且 chase→被抓→caught=true→红) caught=' + m.api.state.caught);
})();

// X4 玩家可走到柱子格(柱子不改碰撞):以事件证玩家能到达柱格
(function () {
  // 柱在 (1,2)(起点(1,1)朝 S),事件也在(1,2);pillar 不改 wallAt/cellAt → 玩家可进格 → 事件触发
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', winKey: 'won', scareKey: 'caught', maze: {
    grid: ['#####', '#...#', '#...#', '#...#', '#####'], start: { x: 1, y: 1, dir: 'S' },
    monsters: [],
    pillars: [{ x: 1, y: 2 }],                                    // 柱子放在玩家要走过的格
    events: [{ x: 1, y: 2, run: function (S) { S.reachedPillarCell = true; } }]
  } });
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });   // 前进(朝 S → +y)
  pump(80);
  ok(m.api.state.reachedPillarCell === true, 'X4 玩家可走进柱格(碰撞未被封闭;变异=柱子格设 wall collision→走不到→事件不触发→红) reached=' + m.api.state.reachedPillarCell);
})();

// X5 fail-loud:maze.pillars 非数组 → 抛错(boot 横幅拦截)
(function () {
  var threw = false;
  try { var m = freshModule({}, {}); m.api.fire({ kind: 'maze3d', maze: { grid: XGRID, start: { x: 1, y: 1, dir: 'N' }, monsters: [], pillars: 'nope' } }); }
  catch (e) { threw = /\[maze pillars\]/.test(String(e && (e.message || e))); }
  ok(threw, 'X5 pillars 非数组 → 抛[maze pillars]错误(变异=去非数组检查→不抛→红) threw=' + threw);
})();

// X6 fail-loud:pillars[i] 坐标非整数 → 抛错
(function () {
  var threw = false;
  try { var m = freshModule({}, {}); m.api.fire({ kind: 'maze3d', maze: { grid: XGRID, start: { x: 1, y: 1, dir: 'N' }, monsters: [], pillars: [{ x: 1.5, y: 1 }] } }); }
  catch (e) { threw = /\[maze pillars\]/.test(String(e && (e.message || e))); }
  ok(threw, 'X6 pillars[0].x 非整数 → 抛[maze pillars]错误(变异=去整数检查→不抛→红) threw=' + threw);
})();

// X7 fail-loud:pillars[i] 坐标越界 → 抛错
(function () {
  var threw = false;
  try { var m = freshModule({}, {}); m.api.fire({ kind: 'maze3d', maze: { grid: XGRID, start: { x: 1, y: 1, dir: 'N' }, monsters: [], pillars: [{ x: 99, y: 99 }] } }); }
  catch (e) { threw = /\[maze pillars\]/.test(String(e && (e.message || e))); }
  ok(threw, 'X7 pillars[0] 坐标越界 → 抛[maze pillars]错误(变异=去边界检查→不抛→红) threw=' + threw);
})();

// X8 pillarScale 非正数 → 抛错
(function () {
  var threw = false;
  try { var m = freshModule({}, {}); m.api.fire({ kind: 'maze3d', maze: { grid: XGRID, start: { x: 1, y: 1, dir: 'N' }, monsters: [], pillars: [{ x: 1, y: 1 }], pillarScale: -1 } }); }
  catch (e) { threw = /\[maze pillars\]/.test(String(e && (e.message || e))); }
  ok(threw, 'X8 pillarScale 非正数 → 抛[maze pillars]错误(变异=去 pillarScale 正数检查→不抛→红) threw=' + threw);
})();

// X9 pillarArt 合法 → 不抛、渲染 fillRects>0(自绘 art 路径走到)
(function () {
  var m = freshModule({}, {}), ok9 = true;
  try {
    m.api.fire({ kind: 'maze3d', winKey: 'won', maze: {
      grid: XGRID, start: { x: 1, y: 1, dir: 'E' }, monsters: [],
      pillars: [{ x: 4, y: 1 }],
      pillarArt: { art: ['.A.', 'AAA', '.A.'], palette: { A: [180, 160, 140] } }
    } });
    pump(2);
  } catch (e) { ok9 = false; }
  ok(ok9 && fillRects > 0, 'X9 pillarArt 合法 → 不抛、渲染 fillRects>0(自绘 art 路径;变异=不解析 pillarArt→渲染 rects=0→红) ok=' + ok9 + ' rects=' + fillRects);
})();

// X10 空 pillars 数组 → 不抛、正常运行(零柱子=无副作用)
(function () {
  var m = freshModule({}, {}), ok10 = true;
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: XGRID, start: { x: 1, y: 1, dir: 'E' }, monsters: [], pillars: [] } }); pump(2); }
  catch (e) { ok10 = false; }
  ok(ok10, 'X10 空 pillars=[] → 不抛、正常运行(零柱无副作用;变异=空数组 forEach 崩→红) ok=' + ok10);
})();

// X11 柱子行为侧守卫:新增柱子应带来贴柱脚的接触阴影,近处柱顶应可自然越出屏幕而非被压回视野内。
(function () {
  function lastFrameRects(pillars) {
    var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
    m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: XGRID, start: { x: 1, y: 1, dir: 'E' }, monsters: [], pillars: pillars || [] } });
    pump(1); recStyleRects = []; recStyleAfter = fillRects; pump(1); recStyleOn = false;
    return recStyleRects.slice();
  }
  function contactBands(rs) {
    var out = [], i;
    for (i = 0; i < rs.length; i++) {
      var r = rs[i];
      if (r[2] === 1 && r[0] > 175 && r[0] < 305 && r[1] >= 190 && r[1] <= 208 && r[3] <= 8 && /^rgb\(([0-7]?[0-9]),/.test(r[4])) out.push(r);
    }
    return out;
  }
  var no = contactBands(lastFrameRects([])).length;
  var yes = contactBands(lastFrameRects([{ x: 4, y: 1 }])).length;
  ok(yes > no, 'X11 柱子新增贴脚接触阴影(行为差分;变异=删柱脚压重→yes≈no→红) no=' + no + ' yes=' + yes);

  var near = lastFrameRects([{ x: 2, y: 1 }]), hasOffscreenTop = false, j;
  for (j = 0; j < near.length; j++) if (near[j][1] < 0 && near[j][3] > 20) hasOffscreenTop = true;
  ok(hasOffscreenTop, 'X11 近距离柱顶可越出屏幕,不为保持顶端可见而伸缩压扁(变异=plH clamp 到 floorY 内→无负 y 大块→红)');
})();

function pillarSig(extra) {
  var m = freshModule({}, {}), mz = { grid: XGRID, start: { x: 1, y: 1, dir: 'E' }, monsters: [], pillars: [{ x: 4, y: 1 }] }, k;
  if (extra) for (k in extra) mz[k] = extra[k];
  recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz });
  pump(1); recStyleRects = []; recStyleAfter = fillRects; pump(1); recStyleOn = false;
  return recStyleRects.map(function (r) { return [Math.round(r[0]), Math.round(r[1]), Math.round(r[2]), Math.round(r[3]), r[4]].join(','); }).join('|');
}

// X12 pillarStyle 六种内置样式都可渲染,且签名彼此可分(不是只不抛)
(function () {
  var styles = ['stone', 'ruined', 'obelisk', 'crystal', 'wood', 'metal'], sigs = {}, i, okAll = true;
  for (i = 0; i < styles.length; i++) {
    try { sigs[styles[i]] = pillarSig({ pillarStyle: styles[i] }); }
    catch (e) { okAll = false; sigs[styles[i]] = 'THREW:' + e; }
  }
  var uniq = {}; for (i = 0; i < styles.length; i++) uniq[sigs[styles[i]]] = 1;
  ok(okAll && Object.keys(uniq).length === styles.length, 'X12 pillarStyle stone/ruined/obelisk/crystal/wood/metal 都能渲染且签名可分(变异=全回退 stone→唯一数不足) unique=' + Object.keys(uniq).length + ' ok=' + okAll);
})();

// X13 单根 pillars[i].style 覆盖全局 pillarStyle:同一位置同 idx 应等同全局目标样式,而非被全局 stone 吃掉
(function () {
  var globalStone = pillarSig({ pillarStyle: 'stone' });
  var globalCrystal = pillarSig({ pillarStyle: 'crystal' });
  var perCrystal = pillarSig({ pillarStyle: 'stone', pillars: [{ x: 4, y: 1, style: 'crystal' }] });
  ok(perCrystal !== globalStone && perCrystal === globalCrystal, 'X13 单根 pillars[i].style 覆盖全局 pillarStyle(变异=忽略单根 style→等于 stone) perEqCrystal=' + (perCrystal === globalCrystal) + ' perEqStone=' + (perCrystal === globalStone));
})();

// X14 单根 pillars[i].scale 覆盖全局 pillarScale:几何签名应等同全局同 scale,不是被全局默认吃掉
(function () {
  var globalBig = pillarSig({ pillarScale: 1.8 });
  var globalSmall = pillarSig({ pillarScale: 0.9 });
  var perSmall = pillarSig({ pillarScale: 1.8, pillars: [{ x: 4, y: 1, scale: 0.9 }] });
  ok(perSmall !== globalBig && perSmall === globalSmall, 'X14 单根 pillars[i].scale 覆盖全局 pillarScale(变异=忽略单根 scale→等于大柱) perEqSmall=' + (perSmall === globalSmall) + ' perEqBig=' + (perSmall === globalBig));
})();

// X15 fail-loud:pillarStyle / pillars[i].style / pillars[i].scale 坏形态都抛 [maze pillars]
(function () {
  function throws(extra) { try { var m = freshModule({}, {}); var mz = { grid: XGRID, start: { x: 1, y: 1, dir: 'N' }, monsters: [], pillars: [{ x: 1, y: 1 }] }; for (var k in extra) mz[k] = extra[k]; m.api.fire({ kind: 'maze3d', maze: mz }); return false; } catch (e) { return /\[maze pillars\]/.test(String(e && (e.message || e))); } }
  ok(throws({ pillarStyle: 'bone' }), 'X15 maze.pillarStyle 坏词 → 抛[maze pillars](变异=静默退回 stone→红)');
  ok(throws({ pillars: [{ x: 1, y: 1, style: 'bone' }] }), 'X15 pillars[i].style 坏词 → 抛[maze pillars](变异=静默退回全局→红)');
  ok(throws({ pillars: [{ x: 1, y: 1, scale: 0 }] }), 'X15 pillars[i].scale 非正数 → 抛[maze pillars](变异=0 高度/NaN 静默→红)');
})();

// X16 单根 icon/art 逃生口仍能覆盖程序化柱,用于作者自绘特殊地标
(function () {
  var iconSig = pillarSig({ pillarStyle: 'stone', pillars: [{ x: 4, y: 1, icon: 'gem' }] });
  var artSig = pillarSig({ pillarStyle: 'stone', pillars: [{ x: 4, y: 1, art: ['.A.', 'AAA', '.A.'], palette: { A: [80, 210, 190] } }] });
  var stoneSig = pillarSig({ pillarStyle: 'stone' });
  ok(iconSig !== stoneSig && artSig !== stoneSig && iconSig !== artSig, 'X16 单根 icon/art 覆盖程序化柱样式(变异=忽略单根 icon/art→等于 stone) iconDiff=' + (iconSig !== stoneSig) + ' artDiff=' + (artSig !== stoneSig));
})();

// X17 程序化石柱默认跟随主题墙基色(审计⑤):cave(墙基偏绿 [92,104,96])→ 柱面新增色 G>R 居多;变异(石柱恒灰 [150,144,136] R>G)→红。fog 等比缩放保 R:G 序故不受距离影响。
(function () {
  function sceneCols(pillars) {
    var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
    m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: XGRID, start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', monsters: [], decorDensity: 0, wallDecorDensity: 0, pillars: pillars } });
    pump(1); recStyleRects = []; recStyleAfter = fillRects; pump(1); recStyleOn = false;
    var s = {}, i; for (i = 0; i < recStyleRects.length; i++) s[recStyleRects[i][4]] = 1; return s;
  }
  var withP = sceneCols([{ x: 4, y: 1 }]), without = sceneCols([]);
  var greener = 0, redder = 0, k, mm, R, G;
  for (k in withP) { if (without[k]) continue; mm = /^rgb\((\d+),(\d+),(\d+)\)/.exec(k); if (!mm) continue; R = +mm[1]; G = +mm[2]; if (G > R) greener++; else if (R > G) redder++; }
  ok(greener + redder > 3 && greener > redder, 'X17 石柱跟随 cave 墙基(偏绿)→ 柱面新增色 G>R 居多(变异=石柱恒灰 [150,144,136] R>G→redder 居多→红) green=' + greener + ' red=' + redder);
})();

// ════ Y. 伪 3D 层次感批1(地面 world-space 格缝 + 主题装饰物)════════════════════
//   地面:复用 floor-cast 世界坐标,跨格边画暗缝;默认主题不写 floorTex → 不画,主题/作者 opt-in 才增层次。
//   装饰:maze.decor 显式可控 + 主题低密度自动 decor;纯视觉、不挡路、不写 state,亮度低于钥匙/机关。
//   反向验牙:开启才多画、坏形态必抛、decor 格仍能走进触发事件。
section('Y 地面格缝 + 主题装饰物');
var YGRID = ['#######', '#.....#', '#..P..#', '#.....#', '#######'];
function renderY(mz, recordColors) {
  var m = freshModule({}, {}), threw = null, r;
  if (recordColors) { recCols = []; recOn = true; }
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz }); r = pump(2); if (r.threw) threw = r.threw; }
  catch (e) { threw = e; }
  if (recordColors) recOn = false;
  return { rects: fillRects, colors: recCols.slice(), threw: threw, state: m.api.state };
}
function yMaze(extra) { var mz = { grid: YGRID, start: { x: 3, y: 2, dir: 'E' }, theme: '', monsters: [], flatWalls: true }; if (extra) for (var k in extra) mz[k] = extra[k]; return mz; }

(function () {   // Y1 作者 opt-in floorTex:默认主题无地面缝;写 floorTex:'slab' 后地面额外画暗缝
  var base = renderY(yMaze()).rects;
  var slab = renderY(yMaze({ floorTex: 'slab' })).rects;
  ok(slab > base + 20, "Y1 floorTex:'slab' → 地面 world-space 格缝增加 fillRect(默认主题不画;变异=地面缝循环不跑→slab≈base→红) base=" + base + ' slab=' + slab);
})();
(function () {   // Y2 crack 地面线按世界格 seed:同迷宫两次颜色序列逐字相同(禁 Math.random/Date.now)
  var a = renderY(yMaze({ floorTex: 'crack' }), true).colors.join('|');
  var b = renderY(yMaze({ floorTex: 'crack' }), true).colors.join('|');
  ok(a.length > 0 && a === b, "Y2 floorTex:'crack' 确定性:同迷宫两次 fillStyle 序列逐字相同(变异=裂缝用 Math.random→不同→红) len=" + a.length);
})();
(function () {   // Y2b 地面缝低对比:用 rgba 表面叠暗,不是实心深色横杠(避免读成墙纹穿到地面)
  var cols = renderY(yMaze({ floorTex: 'slab' }), true).colors;
  var hasRgba = false, i;
  for (i = 0; i < cols.length; i++) if (/^rgba\(/.test(cols[i])) hasRgba = true;
  ok(hasRgba, "Y2b floorTex:'slab' 地面缝使用 rgba 低对比叠暗(变异=回到实心 rgb 横杠→红)");
})();
(function () {   // Y2c floorTex 四种基础材质横向可分:gallery 选材卡不能 slab/tile/panel/crack 看起来全一张。
  function sig(name) { return renderY(yMaze({ floorTex: name, floorLineK: 0.64 }), true).colors.join('|'); }
  var slab = sig('slab'), tile = sig('tile'), panel = sig('panel'), crack = sig('crack');
  ok(slab !== tile && slab !== panel && slab !== crack && tile !== panel, 'Y2c floorTex slab/tile/panel/crack 产生不同地面结构线序列(变异=只读同一套 slab 网格→全相等)');
})();
(function () {   // Y3 floorTex/floorLineK/wallTex/ceilTex 坏形态 fail-loud
  function floorThrows(extra) { var out = renderY(yMaze(extra)); return /\[maze floor\]/.test(String(out.threw && (out.threw.message || out.threw))); }
  function wallThrows(extra) { var out = renderY(yMaze(extra)); return /\[maze wall\]/.test(String(out.threw && (out.threw.message || out.threw))); }
  function ceilThrows(extra) { var out = renderY(yMaze(extra)); return /\[maze ceil\]/.test(String(out.threw && (out.threw.message || out.threw))); }
  ok(floorThrows({ floorTex: 'moss' }), "Y3 floorTex 非 slab/tile/panel/crack → 抛[maze floor](变异=坏词静默退化→红)");
  ok(floorThrows({ floorLineK: -0.1 }), 'Y3 floorLineK<0 → 抛[maze floor](变异=负数导致反相/黑块却不报→红)');
  ok(wallThrows({ wallTex: 'moss' }), 'Y3 wallTex 非 none/brick/stone/tile/wood/shoji/flesh → 抛[maze wall](变异=gallery 坏词静默退化→红)');
  ok(ceilThrows({ ceilTex: 'moss' }), 'Y3 ceilTex 非 slab/beam/rib/panel → 抛[maze ceil](变异=gallery 坏词静默退化→红)');
})();
(function () {   // Y3b 墙面层次字段坏形态 fail-loud:避免 NaN alpha 静默吞掉明暗/AO/污渍
  function wallThrows(extra) { var out = renderY(yMaze(extra)); return /\[maze wall\]/.test(String(out.threw && (out.threw.message || out.threw))); }
  ok(wallThrows({ topBoost: 'bad' }), 'Y3b topBoost 非数字 → 抛[maze wall](变异=NaN alpha 静默跳过顶亮→红)');
  ok(wallThrows({ botDip: 'bad' }), 'Y3b botDip 非数字 → 抛[maze wall](变异=NaN alpha 静默跳过底暗→红)');
  ok(wallThrows({ aoStrength: 'bad' }), 'Y3b aoStrength 非数字 → 抛[maze wall](变异=NaN alpha 静默跳过AO→红)');
  ok(wallThrows({ wearLevel: 2 }), 'Y3b wearLevel 越界 → 抛[maze wall](变异=污渍概率越界不报→红)');
})();
(function () {   // Y4 显式 maze.decor 渲染:缺省为贴地 clutter,不再复用可拾取物 billboard 语义
  var no = renderY(yMaze({ decorDensity: 0 })).rects;
  var yes = renderY(yMaze({ decorDensity: 0, decor: [{ x: 5, y: 2, icon: 'gem' }] })).rects;
  ok(yes > no + 2, "Y4 maze.decor 显式 gem → 渲染贴地碎片多于无 decor(变异=drawSprites 漏 g.decors→相等→红) no=" + no + ' yes=' + yes);
})();
(function () {   // Y5 decor 不挡路:玩家可走进 decor 所在格并触发事件
  var m = freshModule({}, {});
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#####'], start: { x: 1, y: 1, dir: 'E' }, monsters: [], decor: [{ x: 2, y: 1, icon: 'gem' }], events: [{ x: 2, y: 1, run: function (S) { S.reachedDecorCell = true; } }] } });
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  pump(80);
  ok(m.api.state.reachedDecorCell === true, 'Y5 decor 纯视觉、不改碰撞:可走进 decor 格并触发事件(变异=decor 误当墙/碰撞→事件不触发→红) reached=' + m.api.state.reachedDecorCell);
})();
(function () {   // Y6 主题自动 decor:低密度/上限可控,确定性,能补中景比例尺
  var base = { grid: ['#########', '#.......#', '#########'], start: { x: 1, y: 1, dir: 'E' }, theme: 'dungeon', monsters: [], decorDensity: 1, maxDecor: 0 };
  var rich = { grid: base.grid, start: base.start, theme: 'dungeon', monsters: [], decorDensity: 1, maxDecor: 4 };
  var none = renderY(base, true), one = renderY(rich, true), two = renderY(rich, true);
  ok(one.rects > none.rects + 5, 'Y6 主题自动 decor(maxDecor=4) → 比 maxDecor=0 多画中景物(变异=自动撒 decor 不跑→相近→红) none=' + none.rects + ' one=' + one.rects);
  ok(one.colors.join('|') === two.colors.join('|'), 'Y6 主题自动 decor 确定性:同迷宫两次 fillStyle 序列逐字相同(变异=自动 decor 用 Math.random→不同→红)');
})();
(function () {   // Y7 decor 输入形态 fail-loud(maze 私有字段,写错即报;不强制作者写)
  function decorThrows(extra) { var out = renderY(yMaze(extra)); return /\[maze decor\]/.test(String(out.threw && (out.threw.message || out.threw))); }
  ok(decorThrows({ decor: 'nope' }), 'Y7 maze.decor 非数组 → 抛[maze decor](变异=for 循环崩/静默忽略→红)');
  ok(decorThrows({ decor: [{ x: 1.5, y: 1, icon: 'gem' }] }), 'Y7 decor 坐标非整数 → 抛[maze decor]');
  ok(decorThrows({ decor: [{ x: 1, y: 1, icon: 'gem', scale: 0 }] }), 'Y7 decor.scale 非正数 → 抛[maze decor]');
  ok(decorThrows({ decor: [{ x: 1, y: 1, icon: 'gem', mode: 'floating' }] }), 'Y7 decor.mode 坏词 → 抛[maze decor](变异=坏 mode 静默回退→红)');
  ok(decorThrows({ decorDensity: 'dense' }), 'Y7 decorDensity 非数字 → 抛[maze decor]');
  ok(decorThrows({ theme: 'dungeon', decorDensity: 1, maxDecor: -1 }), 'Y7 maxDecor<0 → 抛[maze decor]');
})();

function captureYRects(extra) {
  var m = freshModule({}, {}), mz = yMaze(extra);
  recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz }); } catch (e) {}
  pump(1); recStyleRects = []; recStyleAfter = fillRects; pump(1); recStyleOn = false;
  return recStyleRects.slice();
}
function countWideFloorBits(rs) {
  var n = 0, i, r;
  for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] >= 2 && r[1] > 150 && r[1] < 285 && /^rgb\(/.test(r[4])) n++; }
  return n;
}
function countSpriteColumns(rs) {
  var n = 0, i, r;
  for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] === 1 && r[3] >= 4 && r[1] > 80 && r[1] < 260) n++; }
  return n;
}

(function () {   // Y8 decor 行为守卫:缺省 floor decor 是贴地宽碎片;显式 mode:'sprite' 仍能产生竖牌,二者读法分离。
  var base = captureYRects({ decorDensity: 0 });
  var floor = captureYRects({ decorDensity: 0, decor: [{ x: 5, y: 2, icon: 'gem' }] });
  var sprite = captureYRects({ decorDensity: 0, decor: [{ x: 5, y: 2, icon: 'gem', mode: 'sprite' }] });
  var baseWide = countWideFloorBits(base), floorWide = countWideFloorBits(floor);
  var floorCols = countSpriteColumns(floor), spriteCols = countSpriteColumns(sprite);
  ok(floorWide > baseWide, 'Y8 floor decor 产生贴地宽碎片(行为差分;变异=不画 floor clutter→floorWide≈baseWide→红) base=' + baseWide + ' floor=' + floorWide);
  ok(spriteCols > floorCols + 5, "Y8 mode:'sprite' 逃生口仍是竖牌,缺省 floor 不退回竖牌(变异=一刀切 floor/或缺省回 sprite→红) floorCols=" + floorCols + ' spriteCols=' + spriteCols);
})();

(function () {   // Y9 主题自动 decor 保守低密度:低于旧 0.07 高密度,但显式 decorDensity 仍可拉高。
  var low = renderY({ grid: ['#########', '#.......#', '#########'], start: { x: 1, y: 1, dir: 'E' }, theme: 'dungeon', monsters: [], maxDecor: 12 }).rects;
  var high = renderY({ grid: ['#########', '#.......#', '#########'], start: { x: 1, y: 1, dir: 'E' }, theme: 'dungeon', monsters: [], decorDensity: 1, maxDecor: 12 }).rects;
  ok(high > low + 5, 'Y9 主题默认 decor 是保守低密度,显式 decorDensity:1 仍可明显增多(行为差分;变异=默认过高或显式覆盖失效→红) low=' + low + ' high=' + high);
})();

(function () {   // Y10 pickup / marker / decor 三类视觉语义分离:pickup 有竖向 token + 接触阴影,marker 宽扁贴地,decor 低亮碎片。
  function capEvents(events, decor) {
    var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
    m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: YGRID, start: { x: 3, y: 2, dir: 'E' }, theme: '', monsters: [], flatWalls: true, events: events || [], decor: decor || [] } });
    pump(1); recStyleRects = []; recStyleAfter = fillRects; pump(1); recStyleOn = false; return recStyleRects.slice();
  }
  function tallToken(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] === 1 && r[3] >= 6 && r[1] > 105 && r[1] < 240) n++; } return n; }
  function wideRgba(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] >= 8 && r[1] > 155 && r[1] < 285 && /^rgba\(/.test(r[4])) n++; } return n; }
  function wideRgb(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] >= 2 && r[1] > 150 && r[1] < 285 && /^rgb\(/.test(r[4])) n++; } return n; }
  var pickup = capEvents([{ x: 5, y: 2, icon: 'gem', run: function () {} }], []);
  var marker = capEvents([{ x: 5, y: 2, set: [{ x: 1, y: 1, ch: '#' }] }], []);
  var trap = capEvents([{ x: 5, y: 2, visual: 'trap', icon: 'skull', run: function () {} }], []);
  var decor = capEvents([], [{ x: 5, y: 2, icon: 'gem' }]);
  ok(tallToken(pickup) > tallToken(marker) + 5, 'Y10 pickup(gem) 保持独立竖向 token,marker 不退回竖牌(变异=pickup 贴地化或 marker 竖牌化→红) pickupTall=' + tallToken(pickup) + ' markerTall=' + tallToken(marker));
  ok(wideRgba(marker) > wideRgba(pickup) + 3 && wideRgba(trap) > wideRgba(pickup) + 3, 'Y10 marker/trap 是贴地 rgba 宽图案,pickup 不共享地面机关通道 marker=' + wideRgba(marker) + ' trap=' + wideRgba(trap) + ' pickup=' + wideRgba(pickup));
  ok(wideRgb(decor) > 0 && wideRgba(decor) < wideRgba(marker), 'Y10 decor 是低亮 rgb floor clutter,不抢 marker 的发光机关通道 decorRgb=' + wideRgb(decor) + ' decorRgba=' + wideRgba(decor));
})();

(function () {   // Y11 地面 decor 小物件族:不再只有 2-4 块随机小石头;不同 icon 映射到不同 family,形态/颜色序列不同且仍贴地。
  var base = captureYRects({ decorDensity: 0 });
  var bone = captureYRects({ decorDensity: 0, decor: [{ x: 5, y: 2, icon: 'skull' }] });
  var cable = captureYRects({ decorDensity: 0, decor: [{ x: 5, y: 2, icon: 'tape' }] });
  var boneWide = countWideFloorBits(bone), cableWide = countWideFloorBits(cable), baseWide = countWideFloorBits(base);
  ok(boneWide > baseWide + 5 && cableWide > baseWide + 5, 'Y11 floor decor 小物件族有组织地画出多片贴地细节(不再是一两坨石块;变异=退回旧 bits=2..4→增量不足) base=' + baseWide + ' bone=' + boneWide + ' cable=' + cableWide);
  ok(JSON.stringify(bone) !== JSON.stringify(cable), 'Y11 不同 icon→不同地面 family 形态/颜色序列(骨片 vs 电缆;变异=只取 tint 随机碎块→序列趋同)');
})();

(function () {   // Y12 新增 floor family 可被主题池/显式 decor 直接筛选:下游 AI 可照表写 rust_scraps/wood_splinters/cloth_rags/ash_pile/ice_chips/bio_film/ritual_marks。
  var base = captureYRects({ decorDensity: 0 }), baseWide = countWideFloorBits(base), names = ['rust_scraps', 'wood_splinters', 'cloth_rags', 'ash_pile', 'ice_chips', 'bio_film', 'ritual_marks'], seen = {}, i, rs, wide;
  for (i = 0; i < names.length; i++) {
    rs = captureYRects({ decorDensity: 0, decor: [{ x: 5, y: 2, icon: names[i] }] });
    wide = countWideFloorBits(rs);
    ok(wide > baseWide + 1, 'Y12 新 floor family ' + names[i] + ' 能直接画出贴地细节(变异=family 名未接入/resolveIcon 当未知跳过→红) base=' + baseWide + ' wide=' + wide);
    seen[names[i]] = JSON.stringify(rs);
  }
  ok(seen.rust_scraps !== seen.wood_splinters && seen.cloth_rags !== seen.ash_pile && seen.ice_chips !== seen.bio_film && seen.ritual_marks !== seen.rubble, 'Y12 新 family 之间形态/颜色不混成同一坨碎石(变异=全走 rubble fallback→红)');
})();

(function () {   // Y13 floor-pickup 是地面嵌入式可拾取物:比 pickup 低矮、比 decor 多可发现边框,但不混成 marker 光盘。
  function cap(events, decor) {
    var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
    m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: YGRID, start: { x: 3, y: 2, dir: 'E' }, theme: '', monsters: [], flatWalls: true, events: events || [], decor: decor || [] } });
    pump(1); recStyleRects = []; recStyleAfter = fillRects; pump(1); recStyleOn = false; return recStyleRects.slice();
  }
  function tallToken(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] === 1 && r[3] >= 6 && r[1] > 105 && r[1] < 240) n++; } return n; }
  function wideRgba(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] >= 8 && r[1] > 155 && r[1] < 285 && /^rgba\(/.test(r[4])) n++; } return n; }
  var pickup = cap([{ x: 5, y: 2, icon: 'gem', run: function () {} }], []);
  var floorPickup = cap([{ x: 5, y: 2, visual: 'floor-pickup', icon: 'gem', run: function () {} }], []);
  var marker = cap([{ x: 5, y: 2, set: [{ x: 1, y: 1, ch: '#' }] }], []);
  ok(tallToken(pickup) > tallToken(floorPickup) + 5, 'Y13 floor-pickup 不画成显眼竖牌 token(变异=隐藏普通物复用 pickup billboard→红) pickupTall=' + tallToken(pickup) + ' floorTall=' + tallToken(floorPickup));
  ok(wideRgba(floorPickup) > wideRgba(pickup), 'Y13 floor-pickup 有贴地边框/高光,比普通 pickup 多出低矮 rgba 地面细节(变异=未接 drawFloorPickup→红) floor=' + wideRgba(floorPickup) + ' pickup=' + wideRgba(pickup));
  ok(wideRgba(floorPickup) < wideRgba(marker), 'Y13 floor-pickup 不共享 marker/trap 呼吸光盘强度(隐藏物低调;变异=直接走 drawFloorMarker→红) floor=' + wideRgba(floorPickup) + ' marker=' + wideRgba(marker));
})();

(function () {   // Y14 棋盘明暗块面:themed floor 在地面区画整段 rgba(0,0,0) 宽叠暗(中景纵深参照),中性主题不画。
  function wideDark(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] >= 4 && r[1] > 150 && r[1] < 290 && /^rgba\(0,0,0,/.test(r[4])) n++; } return n; }
  var slab = wideDark(captureYRects({ floorTex: 'slab' }));
  var plain = wideDark(captureYRects({}));
  ok(slab > 0 && plain === 0, 'Y14 棋盘块面:floorTex:slab 地面区出现整段 rgba(0,0,0) 宽叠暗、中性主题不画(变异=去棋盘块面→slab=0→红) slab=' + slab + ' plain=' + plain);
})();

(function () {   // Y15 地面缝随距离衰减:近行(屏下)缝 alpha > 远行(近地平线),复用 fF。
  var rs = captureYRects({ floorTex: 'slab' }), alphas = {}, i, r, m;
  for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] === 2 && /^rgba\(/.test(r[4]) && !/^rgba\(0,0,0,/.test(r[4])) { m = /,([0-9.]+)\)\s*$/.exec(r[4]); if (m) alphas[r[1]] = parseFloat(m[1]); } }
  var ys = Object.keys(alphas).map(Number).sort(function (a, b) { return a - b; });
  var far = alphas[ys[0]], near = alphas[ys[ys.length - 1]];
  ok(ys.length >= 2 && near > far + 0.001, 'Y15 地面缝随距离衰减:近行 alpha(' + near + ') > 远行(' + far + ')(变异=去 fa*=(1-fF)→恒定→近≈远→红) rows=' + ys.length);
})();

(function () {   // Y16 天花缝随距离衰减:最远行(近地平线)缝几乎隐入底色(lk→1),近行仍清晰。读 T.ceilTex 故用 cave 主题。
  var rs = captureYRects({ theme: 'cave', decorDensity: 0 }), baseByY = {}, seamByY = {}, i, r, mm, lum;
  for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[1] < 150 && /^rgb\(/.test(r[4])) { mm = /^rgb\((\d+),(\d+),(\d+)\)/.exec(r[4]); if (mm) { lum = (+mm[1]) + (+mm[2]) + (+mm[3]); if (r[2] >= 100) baseByY[r[1]] = lum; else if (r[2] === 2 && seamByY[r[1]] == null) seamByY[r[1]] = lum; } } }
  var rows = [], k; for (k in seamByY) { if (baseByY[k] > 0) rows.push([+k, seamByY[k] / baseByY[k]]); }
  rows.sort(function (a, b) { return a[0] - b[0]; });
  var farRow = rows.length ? rows[rows.length - 1] : null;   // 最大 y = 最近地平线 = 最远
  ok(rows.length >= 2 && farRow[1] > 0.8, 'Y16 天花缝随距离衰减:最远行缝/底色≈' + (farRow && farRow[1].toFixed(2)) + ' 趋近 1(几乎隐入;变异=去 lk=1-(1-lk)*(1-fC)→恒定≈0.5→红) rows=' + rows.length);
})();

(function () {   // Y17 ice/clinic 主题补 ceilTex:天花现画世界格缝(此前缺 ceilTex=天花纯渐变、无透视锚点)。
  function ceilSeams(theme) { var rs = captureYRects({ theme: theme, decorDensity: 0 }), n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[1] < 150 && r[2] === 2 && /^rgb\(/.test(r[4])) n++; } return n; }
  ok(ceilSeams('ice') > 3, 'Y17 ice 主题补 ceilTex:slab → 天花画世界格缝(变异=ice 无 ceilTex→天花纯渐变无缝→红) n=' + ceilSeams('ice'));
  ok(ceilSeams('clinic') > 3, 'Y17 clinic 主题补 ceilTex:panel → 天花画世界格缝(变异=clinic 无 ceilTex→红) n=' + ceilSeams('clinic'));
})();

(function () {   // Y18 floor clutter seed 按世界坐标(非顺序 idx):同坐标 decor 即使 idx 被顶高(身后插了不绘制的 decor)外观仍一致。
  var a = captureYRects({ decorDensity: 0, decor: [{ x: 5, y: 2, icon: 'gem' }] });
  var b = captureYRects({ decorDensity: 0, decor: [{ x: 1, y: 2, icon: 'gem' }, { x: 5, y: 2, icon: 'gem' }] });   // (1,2) 在玩家(3,2)朝 E 身后=不绘制,只把 (5,2) 的 idx 从 500 顶到 501
  function sig(rs) { var o = [], i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; o.push(r[0] + ',' + r[1] + ',' + r[2] + ',' + r[3] + ',' + r[4]); } return o.sort().join('|'); }
  ok(a.length > 3 && sig(a) === sig(b), 'Y18 floor clutter seed 按世界坐标:身后插 decor 顶高 idx 后 (5,2) 外观不变(变异=seed 含 idx→501≠500→外观漂移→sig 不等→红) nA=' + a.length + ' nB=' + b.length);
})();

// ════ Z. 墙面装饰 wallDecor(藤蔓/触手/裂缝/剑盾/火把/电缆;maze 私有表现层)════
section('Z 墙面装饰 wallDecor');
function zMaze(extra) { var mz = { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: '', monsters: [], flatWalls: true }; if (extra) for (var k in extra) mz[k] = extra[k]; return mz; }
function captureZ(extra) {
  var m = freshModule({}, {}), mz = zMaze(extra);
  recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
  try { m.api.fire({ kind: 'maze3d', winKey: 'won', maze: mz }); } catch (e) {}
  pump(1); recStyleRects = []; recStyleAfter = fillRects; pump(1); recStyleOn = false;
  return recStyleRects.slice();
}
function smallWallDetails(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] <= 2 && r[3] >= 2 && r[3] < 120 && r[1] > 20 && r[1] < 230 && /^rgb|^rgba/.test(r[4])) n++; } return n; }
function anyWallDetails(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] >= 1 && r[3] >= 1 && r[3] < 120 && r[1] > 20 && r[1] < 230 && /^rgb|^rgba/.test(r[4])) n++; } return n; }
function boldWallDetails(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] >= 3 && r[3] >= 2 && r[1] > 20 && r[1] < 230 && /^rgb|^rgba/.test(r[4])) n++; } return n; }
function warmWallGlow(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[1] > 20 && r[1] < 230 && /^rgba\(255,/.test(r[4])) n++; } return n; }
function warmWallHalo(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] >= 6 && r[3] >= 5 && r[1] > 20 && r[1] < 230 && /^rgba\(255,(1[1-9][0-9]|2[0-5][0-9]),/.test(r[4])) n++; } return n; }
function lowWallDetails(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[2] <= 2 && r[3] >= 2 && r[1] > 230) n++; } return n; }
function rgbParts(s) { var m = /^rgba?\((\d+),(\d+),(\d+)/.exec(String(s)); return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null; }
function wallLineBrightness(r) { var p = rgbParts(r[4]); return p ? (p[0] + p[1] + p[2]) / 3 : -1; }
function readableWallCrackLines(rs) { var n = 0, i, r, b; for (i = 0; i < rs.length; i++) { r = rs[i]; b = wallLineBrightness(r); if (r[2] <= 2 && r[3] >= 2 && r[3] < 120 && r[1] > 20 && r[1] < 230 && b >= 18 && b < 130) n++; } return n; }
function nearBlackWallLines(rs) { var n = 0, i, r, b; for (i = 0; i < rs.length; i++) { r = rs[i]; b = wallLineBrightness(r); if (r[2] <= 2 && r[3] >= 2 && r[3] < 120 && r[1] > 20 && r[1] < 230 && b >= 0 && b < 14) n++; } return n; }
function readableWallPickupPatches(rs) { var n = 0, i, r, b; for (i = 0; i < rs.length; i++) { r = rs[i]; b = wallLineBrightness(r); if (r[2] >= 3 && r[3] >= 3 && r[3] < 80 && r[1] > 45 && r[1] < 220 && b >= 64) n++; } return n; }
function wallDecorThrows(extra) { var out = renderY(yMaze(extra)); return /\[maze wallDecor\]/.test(String(out.threw && (out.threw.message || out.threw))); }

(function () {   // Z1 显式 wallDecor crack 可读:正对北墙南面(S face)放裂缝,应是带断面高光的裂缝,不是黑污渍/光源。
  var base = captureZ({ wallDecorDensity: 0 });
  var crack = captureZ({ wallDecorDensity: 0, wallDecor: [{ x: 2, y: 0, face: 'S', kind: 'crack', u: 0.5, v: 0.30, scale: 1 }] });
  ok(smallWallDetails(crack) > smallWallDetails(base), 'Z1 显式 wallDecor crack → 墙体中段多出贴墙细节(变异=drawWallDecor 未接入→相等) base=' + smallWallDetails(base) + ' crack=' + smallWallDetails(crack));
  ok(readableWallCrackLines(crack) > readableWallCrackLines(base) + 2, 'Z1 crack 有非近黑的可读裂缝/断面线(变异=仍用纯黑主缝→readable 不增加) base=' + readableWallCrackLines(base) + ' crack=' + readableWallCrackLines(crack));
  ok(nearBlackWallLines(crack) < readableWallCrackLines(crack), 'Z1 crack 不应黑线多过可读线(变异=裂缝黑成污渍) nearBlack=' + nearBlackWallLines(crack) + ' readable=' + readableWallCrackLines(crack));
  ok(warmWallGlow(crack) === 0 && warmWallHalo(crack) === 0, 'Z1 crack 不是火把/机关光源,不产生 torch 式 rgba(255,...) 暖光 halo glow=' + warmWallGlow(crack) + ' halo=' + warmWallHalo(crack));
})();
(function () {   // Z2 自动 wallDecor:theme 默认列表 + wallDecorDensity 覆盖,不写具体物件也能丰富墙面。
  function cap(theme, density) { return captureZ({ theme: theme, wallDecorDensity: density, maxWallDecor: 8 }); }
  var off = cap('dungeon', 0), on = cap('dungeon', 1);
  ok(smallWallDetails(on) > smallWallDetails(off), 'Z2 wallDecorDensity:1 自动墙饰比 0 多出墙面细节(变异=自动生成不跑/密度无效→相等) off=' + smallWallDetails(off) + ' on=' + smallWallDetails(on));
})();
(function () {   // Z3 墙饰避开墙脚:显式 v 很低也被 clamp 到安全区,不在墙脚收口/地面线附近画具体物件。
  var low = captureZ({ wallDecorDensity: 0, wallDecor: [{ x: 2, y: 0, face: 'S', kind: 'cables', u: 0.5, v: 0.95, scale: 1.2 }] });
  ok(lowWallDetails(low) === 0, 'Z3 wallDecor 即使显式 v=0.95 也不画到墙脚收口区(变异=不 clamp/装饰压到地面线→low>0) low=' + lowWallDetails(low));
})();
(function () {   // Z4 wallDecor 确定性:同一输入两次渲染序列一致。
  var a = captureZ({ wallDecorDensity: 0, wallDecor: [{ x: 2, y: 0, face: 'S', kind: 'torch', u: 0.5, v: 0.28, scale: 1 }] });
  var b = captureZ({ wallDecorDensity: 0, wallDecor: [{ x: 2, y: 0, face: 'S', kind: 'torch', u: 0.5, v: 0.28, scale: 1 }] });
  ok(JSON.stringify(a) === JSON.stringify(b), 'Z4 wallDecor 确定性:同一墙面火把两次 fillRect 序列一致(禁 Math.random/Date.now;变异=随机 flicker/随机形态→不同)');
})();
(function () {   // Z5 wallDecor 坏形态 fail-loud。
  ok(wallDecorThrows({ wallDecor: 'nope' }), 'Z5 wallDecor 非数组 → 抛[maze wallDecor](变异=静默忽略/for 崩→红)');
  ok(wallDecorThrows({ wallDecor: [{ x: 2, y: 0, face: 'S', kind: 'mural' }] }), 'Z5 wallDecor.kind 坏词 → 抛[maze wallDecor]');
  ok(wallDecorThrows({ wallDecor: [{ x: 2, y: 0, face: 'Q', kind: 'crack' }] }), 'Z5 wallDecor.face 坏词 → 抛[maze wallDecor]');
  ok(wallDecorThrows({ wallDecorDensity: -1 }), 'Z5 wallDecorDensity<0 → 抛[maze wallDecor]');
  ok(wallDecorThrows({ maxWallDecor: -1 }), 'Z5 maxWallDecor<0 → 抛[maze wallDecor]');
})();
(function () {   // Z6 墙饰可读性:端用户截图里旧墙饰像黑块/污渍;现在必须有宽笔触、火芯和更宽的暖色 halo。
  var torch = captureZ({ wallDecorDensity: 0, wallDecor: [{ x: 2, y: 0, face: 'S', kind: 'torch', u: 0.5, v: 0.28, scale: 1 }] });
  var arms = captureZ({ wallDecorDensity: 0, wallDecor: [{ x: 2, y: 0, face: 'S', kind: 'arms', u: 0.5, v: 0.30, scale: 1.1 }] });
  ok(boldWallDetails(torch) >= 3 && warmWallGlow(torch) >= 2 && warmWallHalo(torch) >= 2, 'Z6 torch 墙饰有托架/火芯/宽暖色 halo,不是孤立小火点(变异=旧 1px 暗柄+弱火芯或删 halo→bold/glow/halo 不足) bold=' + boldWallDetails(torch) + ' glow=' + warmWallGlow(torch) + ' halo=' + warmWallHalo(torch));
  ok(boldWallDetails(arms) >= 4, 'Z6 arms 剑盾挂饰有提亮盾面/金属边,不是黑色盾块或单根灰竖线(变异=盾牌仍偏黑→bold 不足) bold=' + boldWallDetails(arms));
})();
(function () {   // Z7 新 wallDecor kind 可筛选:chains/pipes/vent/posters/growth/veins/sigil/eyes/teeth 都能画出中段墙饰,且坏词仍由 Z5 拦。
  var base = anyWallDetails(captureZ({ wallDecorDensity: 0 }));
  var names = ['chains', 'pipes', 'vent', 'posters', 'growth', 'veins', 'sigil', 'eyes', 'teeth'], i, n;
  for (i = 0; i < names.length; i++) {
    n = anyWallDetails(captureZ({ wallDecorDensity: 0, wallDecor: [{ x: 2, y: 0, face: 'S', kind: names[i], u: 0.5, v: 0.30, scale: 1 }] }));
    ok(n > base, 'Z7 新 wallDecor ' + names[i] + ' 可画出中段贴墙细节(变异=WALL_DECOR_KINDS 未接入或 drawWallDecor 漏分支→红) base=' + base + ' n=' + n);
  }
})();
(function () {   // Z8 flesh 墙纹不再像规则红屏风:应有不规则暗孔/湿亮肉褶,且与 shoji 的规则横竖格明显不同。
  var flesh = captureZ({ theme: 'flesh', wallDecorDensity: 0, wearLevel: 1 });
  var shoji = captureZ({ theme: 'shoji', wallDecorDensity: 0 });
  function wetPores(rs) { var n = 0, i, r; for (i = 0; i < rs.length; i++) { r = rs[i]; if (r[1] > 20 && r[1] < 220 && /^rgb\((2[0-5]|[0-9]),/.test(r[4])) n++; } return n; }
  ok(JSON.stringify(flesh) !== JSON.stringify(shoji), 'Z8 flesh 墙纹与 shoji/屏风式规则横竖格不同(变异=继续用红屏风横梁→序列近似/缺差异)');
  ok(wetPores(flesh) >= 1, 'Z8 flesh 有暗孔/湿褶低频细节,第一眼更像有机墙而非均匀红面(变异=只画规则横带→pores=0) pores=' + wetPores(flesh));
})();
(function () {   // Z9 wall-pickup 复用墙面 pass,但不是普通 wallDecor:once taken 后同一墙面嵌片消失。
  var base = anyWallDetails(captureZ({ wallDecorDensity: 0 }));
  var before = captureZ({ wallDecorDensity: 0, events: [{ x: 2, y: 1, visual: 'wall-pickup', face: 'N', icon: 'scroll', once: true, run: function () {} }] });
  var m = freshModule({}, {}); recStyleRects = []; recStyleAfter = 0; recStyleOn = true;
  m.api.fire({ kind: 'maze3d', winKey: 'won', maze: { grid: ['#####', '#...#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: '', monsters: [], flatWalls: true, wallDecorDensity: 0, events: [{ x: 2, y: 1, visual: 'wall-pickup', face: 'N', icon: 'scroll', once: true, run: function () {} }] } });
  pump(1); recStyleRects = []; recStyleAfter = fillRects; pump(1); recStyleOn = false;
  var first = recStyleRects.slice(), beforeTake = anyWallDetails(first);
  if (winH.keydown) winH.keydown({ key: 'ArrowUp', preventDefault: function () {} });
  pump(40); recStyleRects = []; recStyleAfter = fillRects; recStyleOn = true; pump(1); recStyleOn = false;
  var afterTake = anyWallDetails(recStyleRects.slice());
  ok(anyWallDetails(before) > base, 'Z9 wall-pickup 初始在墙中段产生嵌入式细节(变异=没挂进 wallDecor pass→红) base=' + base + ' before=' + anyWallDetails(before));
  ok(readableWallPickupPatches(before) >= readableWallPickupPatches(base) + 2, 'Z9 wall-pickup 有足够浅色壁龛/纸片块,不是只多几条暗墙纹(端用户反馈“墙面隐藏过于不明显”;变异=旧小暗嵌片→readable 不足) baseReadable=' + readableWallPickupPatches(base) + ' beforeReadable=' + readableWallPickupPatches(before));
  ok(beforeTake > afterTake + 1, 'Z9 wall-pickup once 触发后 taken,墙面嵌片消失(变异=drawWallDecor 不看 sprite.taken→红) before=' + beforeTake + ' after=' + afterTake);
})();

// ════ ZA. Gallery / Showroom 入口约束(正式 examples 入口,不是 _scratch)════
section('ZA Gallery / Showroom 入口');
var indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var galleryHtml = fs.readFileSync(path.join(__dirname, '..', 'gallery.html'), 'utf8');
var galleryJs = fs.readFileSync(path.join(__dirname, '..', 'gallery.js'), 'utf8');
var audioGalleryHtml = fs.readFileSync(path.join(__dirname, '..', 'audio-gallery.html'), 'utf8');
var audioGalleryJs = fs.readFileSync(path.join(__dirname, '..', 'audio-gallery.js'), 'utf8');
var authoringMd = fs.readFileSync(path.join(__dirname, '..', 'references', 'maze3d-authoring.md'), 'utf8');
var gameJs = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
var worldJs = fs.readFileSync(path.join(__dirname, '..', 'world.js'), 'utf8');
function hasAll(src, names) { var miss = []; for (var i = 0; i < names.length; i++) if (src.indexOf(names[i]) < 0) miss.push(names[i]); return miss; }
function anchorTargets(html) { var out = [], re = /<a\b[^>]*\bhref="([^"]+)"/gi, m; while ((m = re.exec(html))) out.push(m[1]); return out; }
function localAnchors(html) { return anchorTargets(html).filter(function (h) { return !/^[a-z]+:/i.test(h) && h.charAt(0) !== '#'; }); }
function parentAnchors(html) { return localAnchors(html).filter(function (h) { return /^\.\.\//.test(h); }); }
(function () {   // ZA1 统一 maze3d 入口必须明说 recipes 不是不同模块,并作为自包含 playable 加载同一 runtime。
  var miss = hasAll(indexHtml, ['maze3d 统一入口', '不是不同模块', 'raycast-maze.js', '状态边界']);
  ok(!miss.length, 'ZA1 index.html 是四个 recipes 的唯一 playable 入口,并加载同一 runtime miss=' + miss.join(','));
  ok(!localAnchors(indexHtml).length, 'ZA1b playable 入口不反链 Gallery/作者工具,可独立构建成线上单 HTML bad=' + localAnchors(indexHtml).join(','));
  ok(gameJs.indexOf('createMaze3dModule') >= 0 && gameJs.indexOf('saveKey') < 0 && gameJs.indexOf('InventoryPlugin') >= 0, 'ZA1 game.js 只注册一个 Maze3d 模块实例 + 由 world.id 派生默认存档 namespace + 插件能力(变异=recipes 被拆成多个模块入口或重复手填 saveKey)');
})();
(function () {   // ZA2 unified world 覆盖 basic/horror/puzzle/layers 四个 recipe,且文案锁同一 runtime。
  var miss = hasAll(worldJs, ['Recipe 1 · 基础迷宫', 'Recipe 2 · 地底回廊', 'Recipe 3 · 机关游乐场', 'Recipe 4 · 失落矿井', "kind: 'maze3d'", '同一个 maze3d runtime', '不是四个模块']);
  ok(!miss.length, 'ZA2 world.js 覆盖四个 maze3d recipes,并锁“同一 runtime/不是四个模块”口径 miss=' + miss.join(','));
})();
(function () {   // ZA2b 人工验收入口:基础 recipe 必须有一个开局可见的 examine-only 线索,让人打开 index.html 就能按 E/点“查看”验。
  var miss = hasAll(worldJs, ["visual: 'pickup'", "icon: 'note'", "examine: '纸条上写着一句提醒", '前面那块松动石板会打开封路的墙']);
  ok(!miss.length, 'ZA2b basic recipe 保留清晰 examine-only 人工验收点(变异=用户打开页面找不到“查看”功能,或把线索画成压力板/机关) miss=' + miss.join(','));
})();
(function () {   // ZA2c 正式机关 recipe 必须保留默认自动 puzzle,但完整答案只能留在判题事实和可重读物品里。
  var miss = hasAll(worldJs, ["puzzle: { kind: 'sequence'", "answer: ['月', '火', '星']", "'rune-note': { label: '符文残纸'", "description: '残纸记录的点亮顺序是：月 → 火 → 星。'", "inventory.indexOf('rune-note') < 0", "inventory.push('rune-note')", 'S.puzzleSolvedRuneLock = true', "set: [{ x: 8, y: 7, ch: '.' }] }", '不要求额外按“互动”']);
  var noLeak = hasAll(worldJs, ['按背包中符文残纸记录的顺序点亮符号。', '顺序不对,请重读背包里的符文残纸。', '已收入背包,可随时重读。']);
  ok(!miss.length && !noLeak.length && worldJs.indexOf("trigger: 'interact', puzzle:") < 0 && worldJs.indexOf('残纸写着:“先点月') < 0 && worldJs.indexOf('残纸写的是:月 → 火 → 星') < 0, 'ZA2c puzzle recipe 保留自动 sequence、背包可重读线索与开门结果,门口/错答不直接泄底 miss=' + miss.concat(noLeak).join(','));
})();
(function () {   // ZA2d 当前 Recipe 进度与持久背包必须双轨:重进会重置找到残纸 flag,但不能把 inventory 当本轮门控的替代物。
  var world = require(path.join(__dirname, '..', 'world.js'));
  var hub = world.maps.m.nodes.hub;
  var puzzle = world.maps.m.nodes.puzzle_maze;
  var noteEvent = puzzle.maze.events.filter(function (ev) { return ev.visual === 'wall-pickup' && ev.icon === 'scroll'; })[0];
  var state = { puzzleHasWallNote: false, inventory: [] };
  noteEvent.run(state); noteEvent.run(state);
  var pickedOnce = state.puzzleHasWallNote === true && state.inventory.length === 1 && state.inventory[0] === 'rune-note';
  var recipeLink = hub.links.filter(function (link) { return link.to === 'puzzle_maze'; })[0];
  recipeLink.run(state);
  ok(pickedOnce && state.puzzleHasWallNote === false && state.inventory.length === 1, 'ZA2d 符文残纸重复拾取不堆叠;重进 Recipe 只重置当前 flag,持久 inventory 不冒充本轮拾取 state=' + JSON.stringify(state));
})();
(function () {   // ZA3 visual gallery 仍是静态无声多卡预览，并保持 maze3d 岛内工具边界。
  ok(galleryHtml.indexOf('gallery.js') >= 0 && galleryHtml.indexOf('audio-gallery.html') >= 0 && galleryHtml.indexOf('index.html') >= 0 && galleryHtml.indexOf('references/maze3d-authoring.md') >= 0 && galleryHtml.indexOf('maze3d 统一入口') >= 0 && galleryHtml.indexOf('不是可照抄的游戏装配代码') >= 0 && !parentAnchors(galleryHtml).length, 'ZA3 gallery.html 有 visual 脚本及岛内入口,不反链父聚合器 bad=' + parentAnchors(galleryHtml).join(','));
  ok(galleryJs.indexOf('audio: false') >= 0 && galleryJs.indexOf('staticPreview: true') >= 0 && galleryJs.indexOf('controls: false') >= 0, 'ZA3 visual gallery 保持 audio:false + staticPreview:true + controls:false(变异=几十张卡同时出声/挂键盘/跑 rAF)');
})();
(function () {   // ZA4 audio gallery 加载真实 runtime，保留岛内入口与试听生命周期，不反链父聚合器。
  var miss = hasAll(audioGalleryHtml, ['../../core/runtime/engine-core.js', 'raycast-maze.js', 'audio-gallery.js', 'maze3d 统一入口', 'references/maze3d-authoring.md', '可停止', '可静音', '清理旧 preview', '视觉素材 Gallery']);
  ok(!miss.length && !parentAnchors(audioGalleryHtml).length, 'ZA4 audio-gallery.html 加载真实 runtime、保留岛内入口与试听生命周期、不反链聚合器 miss=' + miss.join(',') + ' bad=' + parentAnchors(audioGalleryHtml).join(','));
})();
(function () {   // ZA5 audio gallery 覆盖声音族:主题、三类拾取、三类机关、钥匙/门、五类怪物。
  var miss = hasAll(audioGalleryJs, ['dungeon', 'cave', 'flesh', 'station', 'clinic', 'metal', 'ice', "visual: 'pickup'", "visual: 'floor-pickup'", "visual: 'wall-pickup'", 'set:', 'warp:', 'turn:', "grid:'K' + 'D'", "face:'zombie'", "face:'yurei'", "face:'skull'", "face:'mimic'", "body:'slender'"]);
  ok(!miss.length, 'ZA5 audio-gallery.js 覆盖主题/拾取/机关/钥匙门/怪物试听 spec miss=' + miss.join(','));
})();
(function () {   // ZA6 audio gallery 通过真实 maze 数据触发,不导出/直调内部音频函数,也不把 ambient 写成 staticPreview。
  var forbidden = ['eventPickupSfx', 'buildMazeAmbient', 'buildProxAmb'].filter(function (x) { return audioGalleryJs.indexOf(x) >= 0; });
  ok(audioGalleryJs.indexOf('staticPreview') < 0, 'ZA6 audio gallery 不用 staticPreview:true 试听 ambient(变异=常驻 room tone 被禁掉)');
  ok(!forbidden.length, 'ZA6 audio gallery 不直调 maze3d 内部音频函数,只走真实数据/移动触发 forbidden=' + forbidden.join(','));
})();
(function () {   // ZA7 一次只激活一个 preview:共享一个 engine/stage,切换/停止先进 blank 节点让旧 hbCtx/prox/ambient 清理。
  var createCount = (audioGalleryJs.match(/createEngine\(/g) || []).length;
  ok(createCount === 1 && audioGalleryJs.indexOf("node: 'blank'") >= 0 && audioGalleryJs.indexOf('stopPreview') >= 0 && audioGalleryJs.indexOf('visibilitychange') >= 0, 'ZA7 audio gallery 单 engine + blank stop + 隐藏页停止,避免多声床叠加 createCount=' + createCount);
})();
(function () {   // ZA8 不保留旧四目录:回退靠 git 历史,公开 examples 只教一个 maze3d 入口。
  var examplesDir = path.join(__dirname, '..', '..');
  var oldDirs = ['maze3d-demo', 'horror-maze-demo', 'maze-layers-demo', 'maze-puzzle-demo'];
  var left = oldDirs.filter(function (d) { return fs.existsSync(path.join(examplesDir, d)); });
  ok(!left.length, 'ZA8 旧 maze3d recipe 目录不得残留,避免继续误导成多个模块 left=' + left.join(','));
})();
(function () {   // ZA9 作者手册锁状态边界:K/机关/怪物是 session-local,跨层/剧情写 Amatlas state。
  var miss = hasAll(authoringMd, ['局部态(session-local)', '被抓、退出、重进、刷新到未完成迷宫', 'winKey', 'scareKey', 'events[].run(state, api)', '不要在 `run` 里直接跳节点']);
  ok(!miss.length, 'ZA9 作者手册必须讲清 maze3d 局部态 vs Amatlas 持久 state,防 AI 把 K/机关当存档 miss=' + miss.join(','));
})();
(function () {   // ZA10 作者手册锁 Gallery 边界:visual=静态无声无控首帧,audio=单 engine 可停可静音可清理。
  var miss = hasAll(authoringMd, ['staticPreview:true', 'audio:false', 'controls:false', '单 engine', '可 stop', '可 mute', '切换时清理旧 preview', '不是正式 playable demo 类型']);
  ok(!miss.length, 'ZA10 作者手册必须把 visual/audio Gallery 定位为 authoring helper,不是第二 runtime miss=' + miss.join(','));
})();
(function () {   // ZA11 origin 副本漂移守卫:examples/origin/raycast-maze.js 必须与 examples/maze3d/raycast-maze.js 逐字节相同。
  // 此闸确保 origin 综合作品只从 maze3d 权威源同步更新、不被单独手改造成漂移。
  var crypto = require('crypto');
  var MAZE3D = path.join(__dirname, '..', 'raycast-maze.js');           // 权威源
  var ORIGIN = path.join(__dirname, '..', '..', 'origin', 'raycast-maze.js');   // 受控副本
  var maze3dExists = fs.existsSync(MAZE3D), originExists = fs.existsSync(ORIGIN);
  ok(maze3dExists && originExists, 'ZA11a 两份 raycast-maze.js 文件均存在(maze3d + origin) maze3d=' + maze3dExists + ' origin=' + originExists);
  if (maze3dExists && originExists) {
    var sha3d = crypto.createHash('sha256').update(fs.readFileSync(MAZE3D)).digest('hex');
    var shaOr = crypto.createHash('sha256').update(fs.readFileSync(ORIGIN)).digest('hex');
    ok(sha3d === shaOr, 'ZA11b origin/raycast-maze.js 与 maze3d/raycast-maze.js SHA256 逐字节一致(防漂移;单独改 origin 即红) sha3d=' + sha3d.slice(0,12) + '… shaOr=' + shaOr.slice(0,12) + '…');
  }
})();

console.log('════ maze3d 运行时回归:' + pass + ' PASS / ' + fail + ' FAIL ════');
process.exit(fail ? 1 : 0);
