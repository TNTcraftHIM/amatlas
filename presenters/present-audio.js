/* ════════════════════════════════════════════════════════════════════════
   Amatlas 可插拔表现层 · Web Audio 呈现器 (presenters/present-audio.js) — S8.5
   ════════════════════════════════════════════════════════════════════════
   消费 View 的 **audio 意图词汇**(契约 §4.2,已定稿冻结):
   · `audio.bgm`(名)→ 用振荡器合成一段持续背景音(改名才换、同名不重启;换名时旧 release 1.2s
     与新 attack 1.5s **重叠交叉淡变**——端用户反馈逐节点换主题像"每步重播/割裂",故拉长淡变)。
   · `audio.sfx`(名数组)→ 每次 render 触发的一次性音效(短促包络)。
   **意图非素材**:模块只声明"要什么音",怎么合成是呈现器的事——零素材(纯合成)、零依赖、file:// 可跑。

   ── 浏览器 autoplay 政策(重要,已按平台规范实现)──────────────────────────
   浏览器(Chrome/Safari/Firefox,http 与 file:// 皆然)规定:**未经用户手势创建/启动的
   AudioContext 处于 'suspended',不出声**;须在一次用户手势(click/keydown/touchstart)里
   `ctx.resume()` 才解锁。本呈现器据此:**惰性**创建 AudioContext(首次需要发声时),且 `plugin`
   会在 document 上挂一次性手势监听 → `unlock()`(resume)。故:start() 时若起点有 bgm,振荡器已
   排好但静默;玩家**首次点击**(选项/重开按钮)即解锁出声。**作者无需关心**——挂上即可。

   ── teardown(§8 ❓ 的评估结论)────────────────────────────────────────────
   bgm 的"重开归零"**无需核心加事件**:`engine.reset()` → `enter(start)` → `render()` 会把起点
   的快照广播给本呈现器,present 的 bgm 变更检测自然 停/换(起点无 bgm 则停)。故 **core 零改**。
   仅"整体卸载呈现器"才需显式清理 → 提供 `dispose()`(停 bgm + 关 AudioContext)。

   可测性:合成参数映射(bgmFreq/sfxSpec)是纯函数;AudioContext 可经 opts 注入(测试传 mock),
   故合成驱动逻辑可在纯 node 断言(jsdom 无 Web Audio、CLI 无 GUI 浏览器 → 真机出声须人工双击核)。

   用法:engine.use(createAudioPresenter());   // S11-b-ex:返回对象带 install(自动挂手势解锁);已删 .plugin
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).AudioPresenter = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // bgm 名 → 基频(Hz)。已知主题给定;未知名用字符串哈希落到音乐音域,保证确定性(同名同频)。
  // S10:ambient-unease 低频(58Hz,低于哈希下限 160)=恐怖氛围 drone 的基频。
  var BGM_FREQ = { 'theme-forest': 196.00, 'theme-beach': 220.00, 'theme-tense': 110.00, 'theme-calm': 261.63, 'theme-night': 146.83, 'ambient-unease': 58.27 };
  // sfx 名 → 合成参数(波形/频率/时长/增益)。未知名用默认短 beep(频率由哈希定,确定性)。
  var SFX_SPEC = {
    'dice-roll': { type: 'square',   freq: 330, dur: 0.14, gain: 0.06 },
    'click':     { type: 'sine',     freq: 660, dur: 0.05, gain: 0.05 },
    'success':   { type: 'triangle', freq: 880, dur: 0.18, gain: 0.06 },
    'fail':      { type: 'sawtooth', freq: 160, dur: 0.22, gain: 0.06 },
    'pickup':    { type: 'sine',     freq: 990, dur: 0.10, gain: 0.05 }
  };
  function hashFreq(name) { var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0; return 160 + (Math.abs(h) % 24) * 12; }
  function bgmFreq(name) { return BGM_FREQ[name] != null ? BGM_FREQ[name] : hashFreq(String(name)); }
  function sfxSpec(name) { return SFX_SPEC[name] || { type: 'square', freq: hashFreq(String(name)), dur: 0.08, gain: 0.05 }; }
  // bgm 名情绪 → 和弦三度半音(B5,据名关键词、非新契约字段):暗(tense/night/dread…)→ 小三度(+3) / 亮 → 大三度(+4)。
  function chordThird(name) { return /tense|night|dread|dark|fear|unease|grief|sad|minor|void|abyss/i.test(String(name)) ? 3 : 4; }
  function semis(base, n) { return base * Math.pow(2, n / 12); }   // 半音 → 频率比(平均律)

  // 音色家族演奏法(音乐 overhaul 批 C):composer 的音符网格不变，presenter 只对少数事件
  // 做与发声体相称的力度/时值/包络/亮度细节。事件身份只含 segIndex+段内 t+freq+dur+role/palette，
  // 绝不读取 AudioContext.currentTime/Math.random；返回值是 presenter-private profile，不扩 MusicSpec。
  function performanceHash(role, pal, segIndex, eventT, freq, dur) {
    var s = [role || '', pal || '', segIndex >>> 0, (+eventT || 0).toFixed(6), (+freq || 0).toFixed(3), (+dur || 0).toFixed(6)].join('|');
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function performanceProfile(role, pal, segIndex, eventT, freq, dur) {
    role = role || '';
    pal = pal || (role === 'pad' ? 'warm' : role === 'arp' ? 'pluck' : role === 'lead' ? 'soft' : 'default');
    var h = performanceHash(role, pal, segIndex, eventT, freq, dur);
    var p = { family: role + ':' + pal, action: 'plain', gain: 1, duration: 1, attack: 1, release: 1, brightness: 1, pitch: 0 };

    if (role === 'lead') {
      if (pal === 'chant') return p;                    // chant 自有元音/小转音语法，禁止叠第二套
      if (h % 7 !== 0) return p;                        // 约七音一记；不是逐音技巧
      if (pal === 'soft') { p.action = 'lean'; p.gain = 0.96; p.attack = 0.78; p.pitch = -42; }
      else if (pal === 'flute') { p.action = 'breath'; p.gain = 0.92; p.attack = 1.22; p.release = 1.15; p.brightness = 0.90; }
      else if (pal === 'reed') { p.action = 'tongue'; p.gain = 1.04; p.duration = 0.90; p.attack = 0.72; p.brightness = 1.05; }
      else if (pal === 'brass') { p.action = 'lift'; p.gain = 1.05; p.attack = 0.82; p.brightness = 1.12; p.pitch = -28; }
      else if (pal === 'bell') return p;               // bell 已有固定 FM 金属衰减；不声明未接线的第二套 glint
      else if (pal === 'pluck' || pal === 'harp') { p.action = 'ghost'; p.gain = 0.70; p.duration = 0.84; }
      else if (pal === 'pulse') { p.action = 'accent'; p.gain = 1.04; p.duration = 0.92; }
      return p;
    }

    if (role === 'arp') {
      if (h % 6 !== 0) return p;
      if (pal === 'bell') return p;                    // bellVoice 固定 FM 衰减已有自身 articulation
      if (pal === 'harp') { p.action = 'harp-ring'; p.gain = 0.78; p.duration = 1.14; p.release = 1.12; }
      else if (pal === 'kalimba') { p.action = 'thumb-ghost'; p.gain = 0.66; p.duration = 0.82; p.attack = 0.78; }
      else { p.action = 'pluck-ghost'; p.gain = 0.70; p.duration = 0.86; p.release = 0.88; }
      return p;                                         // 拨弦家族只动动力/时值，pitch 永远 0
    }

    if (role === 'pad') {
      // 同一和弦所有音共享 t/dur/seg，但 palette/freq 仍让宽度有轻微声部差；没有音高装饰。
      if (h % 4 !== 0) return p;
      if (pal === 'air') { p.action = 'air-inhale'; p.gain = 0.94; p.attack = 1.20; p.release = 1.18; p.brightness = 1.08; }
      else if (pal === 'strings') { p.action = 'bow-bloom'; p.gain = 1.02; p.attack = 0.88; p.release = 1.15; p.brightness = 1.06; }
      else if (pal === 'choir') { p.action = 'choir-breath'; p.gain = 0.94; p.attack = 1.16; p.release = 1.20; p.brightness = 0.94; }
      else { p.action = 'warm-bloom'; p.gain = 0.96; p.attack = 1.12; p.release = 1.14; p.brightness = 1.04; }
      return p;
    }

    if (role === 'bass') {
      if (h % 7 !== 0) return p;
      p.action = pal === 'upright' ? 'muted-finger' : pal === 'organ' ? 'pedal-breath' : 'root-ghost';
      p.gain = pal === 'organ' ? 0.86 : 0.72;
      p.duration = pal === 'organ' ? 0.92 : 0.80;
      p.attack = 1.08; p.release = 0.90; p.brightness = pal === 'picked' || pal === 'synth' ? 0.82 : 0.90;
      return p;                                         // 低音灵气来自轻重/滤波/留白，不做 pitch ornament
    }
    return p;
  }

  // ── S10 恐怖音色升级(Web Audio 原生节点合成,零外部库 / 零样本;契约 §10.2-Q4)──────────────
  // 这些名字走"丰富合成"分路(distortion / filter / 噪声 / LFO);其余 sfx/bgm 仍走上面的简单振荡器路径(字节不变)。
  var RICH_SFX = { 'horror-sting': true, 'flesh-tear': true, 'horror-stab': true, 'horror-braam': true, 'horror-screech': true, 'horror-shriek': true };   // jump-scare 多套(性格各异,作者按场景选/轮换;均零契约开放词汇)
  var RICH_BGM = { 'ambient-unease': true };
  // WaveShaper distortion 曲线(标准公式;k=失真量)。Float32Array 浏览器/node 皆有。
  function makeDistortionCurve(k) {
    var n = 256, curve = new Float32Array(n), deg = Math.PI / 180; k = k || 50;
    for (var i = 0; i < n; i++) { var x = (i * 2) / n - 1; curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x)); }
    return curve;
  }
  function pulseCurve() {                              // 锯齿→方波 sign 整形:输入<0→-1 / ≥0→+1。配合"锯齿 + DC 偏移"喂入 → 偏移移动过零点=可调占空比脉冲(真 PWM 核心,非双方波近似)
    var n = 257, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) curve[i] = ((i * 2) / (n - 1) - 1) < 0 ? -1 : 1;
    return curve;
  }

  function createAudioPresenter(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var Ctor = opts.AudioContext || (typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null);
    var ctx = opts.context || null;
    // ── 玩家侧音量/静音(易用性审计批):IFTF 无障碍指南=有声音就要给独立于系统音量的控制;此前
    //    master gain 只能作者构造期一次性配置,玩家运行时无任何关 BGM 手段。muted 是设备级偏好
    //    (非游戏进度)→ 全局键 'amatlas-muted' 跨游戏记忆;隐私模式访问 localStorage 会抛 → try/catch。
    var vol = (opts.volume != null ? opts.volume : 0.5), muted = false, audioBtn = null;
    var disposed = false, installed = false, removePresenter = null, unlockHandler = null;
    var prefStore = (function () { if (opts.storage !== undefined) return opts.storage; try { return (typeof localStorage !== 'undefined') ? localStorage : null; } catch (e) { return null; } })();
    try { muted = !!(prefStore && prefStore.getItem && prefStore.getItem('amatlas-muted') === '1'); } catch (e) {}
    var master = null, mDry = null, bgmOsc = null, bgmExtra = [], bgmGain = null, currentBgm = null;   // mDry:打击/低音干总线(不进混响,治瞬态"双重";见 ensureCtx);bgmExtra:和弦附属音+LFO+ambient 簇/心跳/刺点(随 bgm 一起停);bgmGain:供起停斜坡
    var richBus = null;   // jump-scare 提升总线(RICH_SFX 经它 → 比直连 master 的背景乐响一档;用户:"jump scare 要比背景响一些")
    var bgmTimer = [];   // ambient dread bed 稀疏刺点 setTimeout 续排句柄;**必须在 stopBgm 清空**=不漏 timer(镜像 bgsTimer)
    var bgsMaster = null;   // BGS 子总线:全部 BGS 经此一处汇 master → 单点统一环境音音量(opts.bgsVolume,缺省 1.0=透明),与 bgm/music 平衡;持久不随 stopBgs 拆
    var bgsSrc = null, bgsExtra = [], bgsGain = null, currentBgs = null;   // BGS 环境音:与 bgm/music **并行独立**的声景层(noise+filter+LFO;各自状态、独立 gain 汇 bgsMaster)
    var bgsTimer = [];   // 瞬态层(droplet/crackle/cricket/bird)的 setTimeout 句柄数组;**必须在 stopBgs 清空**=不漏 timer

    // 程序混响脉冲响应(表现力 A1):指数衰减噪声(Moorer 经典结论),**种子 PRNG 填充=确定性**(非 Math.random)、零样本。
    function makeReverbIR(seconds, decay) {
      var sr = ctx.sampleRate || 44100, len = Math.max(1, Math.floor(sr * seconds)), s = 0x9e3779b9 >>> 0;
      function r() { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 * 2 - 1; }
      var buf = ctx.createBuffer(2, len, sr);
      if (buf.getChannelData) for (var ch = 0; ch < 2; ch++) { var d = buf.getChannelData(ch); for (var i = 0; i < len; i++) d[i] = r() * Math.pow(1 - i / len, decay); }
      return buf;
    }
    function ensureCtx() {
      if (disposed) return null;
      if (!ctx && Ctor) ctx = new Ctor();
      if (ctx && !master) {
        master = ctx.createGain(); master.gain.value = muted ? 0 : vol;   // 尊重持久化的静音偏好/运行时音量
        // v13:总线尾端挂 DynamicsCompressor 安全限幅(音色库多声部叠加=主削波源;threshold -10/knee 12/
        //   ratio 12/attack 3ms/release .25s=防御档,常驻深压会泵感——前级增益预算才是主防线)。无能力 → 直连。
        var sink = ctx.destination;
        if (ctx.createDynamicsCompressor) {
          try {
            var comp = ctx.createDynamicsCompressor();
            if (comp.threshold) comp.threshold.value = -10; if (comp.knee) comp.knee.value = 12;
            if (comp.ratio) comp.ratio.value = 12; if (comp.attack) comp.attack.value = 0.003; if (comp.release) comp.release.value = 0.25;
            comp.connect(ctx.destination); sink = comp;
          } catch (e) { sink = ctx.destination; }
        }
        master.connect(sink);                                              // 干路:经压缩器(或直达)
        if (ctx.createConvolver) {                                         // 湿路:程序混响(空间感;调研 A1)→ 旋律声部经 master 自动获混响
          var conv = ctx.createConvolver(); conv.normalize = true; conv.buffer = makeReverbIR(2.4, 2.6);   // normalize 须在赋 buffer 前
          var wet = ctx.createGain(); wet.gain.value = 0.45;               // 干湿混合(wet 0.45)
          master.connect(conv); conv.connect(wet); wet.connect(sink);
          // ★打击/低音干总线(端用户实听「冾冾双重」终局根因):镲/军鼓/底鼓 click 都是几 ms 尖噪声瞬态,
          //   经 2.4s 混响 wet 0.45 → 湿声=紧跟原声的第二记"冾"(长音被掩盖、瞬态全暴露=「部分乐器双重」;
          //   A/B 两侧 present-audio 同字节 → 曲谱怎么修都"还是这样")。混音标准做法:鼓(尤其镲)与低音不进混响。
          //   mDry 与 master 同音量/静音(applyVol 同步)、直达 sink、不喂 conv;无 Convolver 时不建(无混响可躲)。
          mDry = ctx.createGain(); mDry.gain.value = muted ? 0 : vol; mDry.connect(sink);
        }
        if (ctx.createGain) { richBus = ctx.createGain(); richBus.gain.value = 2.2; richBus.connect(master); }   // jump-scare 提升总线(×2.2 → 明显比直连 master 的背景响;仍在压缩器 headroom 内)
      }
      if (ctx && !bgsMaster) {                                             // BGS 子总线:统一环境音音量(缺省透明)→ 经 master 仍获混响
        bgsMaster = ctx.createGain(); bgsMaster.gain.value = (opts.bgsVolume != null ? opts.bgsVolume : 1.0);
        bgsMaster.connect(master);
      }
      return ctx;
    }
    // bgm 升级(表现力 B1/B3):单振荡器 → 多振荡器和弦(根+三度+五度)+ detune 拍频 + 低通滤波 + LFO 呼吸 + attack 斜坡。
    // 据 bgm 名情绪选大/小三度(B5)。RICH_BGM(ambient-unease)仍走 startAmbient。**契约零改**:作者仍写 audio.bgm 名,合成更丰富。
    function startBgm(name) {
      if (!ensureCtx()) return;
      if (RICH_BGM[name]) { startAmbient(name); return; }                  // S10:氛围 bgm 走 LFO drone(下)
      var root = bgmFreq(name), t = (ctx.currentTime || 0), target = 0.05;
      var filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 760; if (filter.Q) filter.Q.value = 6;   // 温暖:削尖锐谐波
      var g = ctx.createGain(); g.gain.value = target; filter.connect(g); g.connect(master);
      var voices = [{ f: root, d: -6 }, { f: semis(root, chordThird(name)), d: 5 }, { f: semis(root, 7), d: 8 }];   // 根 / 三度 / 五度;各微 detune(cent)→ 缓慢拍频(drone 流动)
      var oscs = [];
      for (var i = 0; i < voices.length; i++) {
        var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = voices[i].f;   // triangle:谐波适中、过低通温暖
        if (o.detune) o.detune.value = voices[i].d;
        o.connect(filter); o.start(t); oscs.push(o);
      }
      var lfo = ctx.createOscillator(), lg = ctx.createGain();             // LFO 慢正弦 → 调 filter.frequency = 呼吸
      lfo.type = 'sine'; lfo.frequency.value = 0.08; lg.gain.value = 260;
      lfo.connect(lg); lg.connect(filter.frequency); lfo.start(t);
      if (g.gain.setValueAtTime && g.gain.linearRampToValueAtTime) {       // attack 斜坡(防 start 咔哒);mock 无 linearRamp 时已 value=target(有声基线)
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(target, t + 1.5);   // attack 1.5s:与 stopBgm release 1.2s 重叠成交叉淡变(攻略长于释=等响度感;原 0.4s 配 0.25s release 近硬切,端用户反馈换主题"割裂")
      }
      bgmOsc = oscs[0]; bgmExtra = oscs.slice(1).concat([lfo]); bgmGain = g; currentBgm = name;
    }
    // ambient 刺点确定性 PRNG:种子=bgm 名哈希(present 只透传名,无 region/mood → 名即唯一可用熵;同名同序列)
    function ambHash(name) { var h = 0x2f6e1b97 >>> 0; name = String(name); for (var i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) | 0; return h >>> 0; }
    function startAmbient(name) {                                          // S10→阶段91 dread bed:不协和低频簇+detune拍频+AM粗糙度+sub心跳+慢扫滤波+稀疏刺点;零素材、确定性、节点全收进 bgmExtra(stopBgm 能停)
      var t = (ctx.currentTime || 0), base = bgmFreq(name);                // ambient-unease=58.27Hz
      var g = ctx.createGain(); g.gain.value = 0.05;                       // 单一 gain 总线:stopBgm release 斜坡作用其上 → 簇/AM/心跳一并淡停
      var filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 320; if (filter.Q) filter.Q.value = 4;   // 暗、闷
      filter.connect(g); g.connect(master);
      // ① 不协和低频簇(根 + 小二度 +1 + 三全音 +6;堆叠未解决张力)+ detune 拍频(微失谐 → 缓慢起伏)
      var voices = [ { n: 0, d: -7 }, { n: 1, d: 8 }, { n: 6, d: -4 } ], oscs = [];
      for (var i = 0; i < voices.length; i++) { var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = semis(base, voices[i].n); if (o.detune) o.detune.value = voices[i].d; o.connect(filter); o.start(t); oscs.push(o); }
      // ② AM 粗糙度(~55Hz 振幅调制 → 杏仁核 threat cue,Arnal 2021)
      var am = ctx.createOscillator(), amg = ctx.createGain(); am.type = 'sine'; am.frequency.value = 55; amg.gain.value = 0.018; am.connect(amg); amg.connect(g.gain); am.start(t);
      // ③ 滤波呼吸(慢 LFO 0.07Hz 调 lowpass 截止;静止态=基础截止 320)
      var fl = ctx.createOscillator(), flg = ctx.createGain(); fl.type = 'sine'; fl.frequency.value = 0.07; flg.gain.value = 180; fl.connect(flg); flg.connect(filter.frequency); fl.start(t);
      // ④ sub 心跳(~50bpm lub-dub 包络,sine 55Hz → g 总线;诚实:笔记本/手机内置扬声器 <60Hz 近不可闻=耳机体感)
      var hb = ctx.createOscillator(), hbg = ctx.createGain(); hb.type = 'sine'; hb.frequency.value = 55; hbg.gain.value = 0; hb.connect(hbg); hbg.connect(g); hb.start(t);
      if (hbg.gain.setValueAtTime && hbg.gain.linearRampToValueAtTime) {    // 心跳网格(确定性 setValueAtTime);**滚动续排**——原 bug:只排一批 ~40s 后静默;改为窗末前续下一窗=连续不断
        var hbPeriod = 1.2, hbWin = 40;
        var scheduleHeart = function (from) {                              // 排定 [from, from+hbWin) 一窗心跳网格 + 窗末前续排下一窗(句柄入 bgmTimer,stopBgm 能清)
          var beats = Math.ceil(hbWin / hbPeriod), k, bt;
          for (k = 0; k < beats; k++) { bt = from + k * hbPeriod; try {
            hbg.gain.setValueAtTime(0.0001, bt); hbg.gain.linearRampToValueAtTime(0.06, bt + 0.04); hbg.gain.linearRampToValueAtTime(0.0001, bt + 0.12);   // lub
            hbg.gain.setValueAtTime(0.0001, bt + 0.22); hbg.gain.linearRampToValueAtTime(0.045, bt + 0.26); hbg.gain.linearRampToValueAtTime(0.0001, bt + 0.36); // dub
          } catch (e) {} }
          // 续下一窗:**guard 在回调内**(currentBgm 此刻〔心跳块在 currentBgm=name 之前〕尚未赋值,不能在此判;回调 36s 后触发时已赋值,换/停 → 不续);提前 4s 与上一窗尾重叠=无缝
          if (typeof setTimeout !== 'undefined') bgmTimer.push(setTimeout(function () { if (currentBgm === name) scheduleHeart((ctx.currentTime || 0)); }, (hbWin - 4) * 1000));
        };
        scheduleHeart(t);                                                  // 首批**无条件**(envelope 必跑;修原"只排一批"bug + 修"guard 误拦首批")
      }
      if (g.gain.setValueAtTime && g.gain.linearRampToValueAtTime) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 1.5); }   // attack 斜坡(防咔哒;与 stopBgm release 1.2s 重叠)
      bgmOsc = oscs[0]; bgmExtra = oscs.slice(1).concat([am, fl, hb]); bgmGain = g; currentBgm = name;   // 簇3 + am + fl + hb = 6 osc(bgmOsc + bgmExtra 5)
      // ⑤ 稀疏随机刺点(高 Q 谐振 ping;首批同步 spawn〔可测〕+ setTimeout 续排〔句柄入 bgmTimer〕;种子 PRNG)
      var seed = ambHash(name), rnd = function () { seed = (seed + 0x6D2B79F5) | 0; var z = Math.imul(seed ^ seed >>> 15, 1 | seed); z = (z + Math.imul(z ^ z >>> 7, 61 | z)) ^ z; return ((z ^ z >>> 14) >>> 0) / 4294967296; };
      function ping(at) {                                                  // 高 Q 谐振 blip → 走 master(刺点要透出 filter);进 bgmExtra → stopBgm 能停
        var po = ctx.createOscillator(), bp = ctx.createBiquadFilter(), pg = ctx.createGain();
        var f = 1400 + rnd() * 2200, dur = 0.18 + rnd() * 0.5, gv = 0.03 + rnd() * 0.04;
        po.type = 'sine'; po.frequency.value = f; bp.type = 'bandpass'; bp.frequency.value = f; if (bp.Q) bp.Q.value = 18;
        pg.gain.value = gv; po.connect(bp); bp.connect(pg); pg.connect(master); po.start(at);
        if (pg.gain.setValueAtTime && pg.gain.exponentialRampToValueAtTime) { try { pg.gain.setValueAtTime(0.0001, at); pg.gain.exponentialRampToValueAtTime(gv, at + 0.01); pg.gain.exponentialRampToValueAtTime(0.0001, at + dur); } catch (e) {} }
        if (po.stop) po.stop(at + dur + 0.05); bgmExtra.push(po);
      }
      ping(t + rnd() * 1.2);                                               // 首批同步 1 颗(可断言;+1 osc → 共 7 osc)
      if (typeof setTimeout !== 'undefined') {
        var loop = function () { if (currentBgm !== name) return;          // 已换/停 → 不续(双保险,timer 也会清)
          if (bgmExtra.length > 600) bgmExtra.splice(0, bgmExtra.length - 300);   // 长会话防句柄无限增长(刺点按时序停完;同 armTransient)
          ping((ctx.currentTime || 0) + rnd() * 0.2);
          bgmTimer.push(setTimeout(loop, 3000 + rnd() * 12000));           // 3-15s 种子抖动(anticipatory fear)
        };
        bgmTimer.push(setTimeout(loop, 3000 + rnd() * 12000));
      }
    }
    function stopBgm() {
      var t = (ctx && ctx.currentTime) || 0, rel = 1.2, all = bgmOsc ? [bgmOsc].concat(bgmExtra) : [];   // release 1.2s(原 0.25s 近硬切):旧和弦响到 release 末、与新主题 attack 1.5s 重叠 = 平滑交叉淡变
      for (var j = 0; j < bgmTimer.length; j++) { try { clearTimeout(bgmTimer[j]); } catch (e) {} } bgmTimer = [];   // 清 ambient dread bed 稀疏刺点续排 timer=不漏(镜像 stopBgs);否则换场景后幽灵刺点仍响
      if (bgmGain && bgmGain.gain.setValueAtTime && bgmGain.gain.linearRampToValueAtTime) {   // release 斜坡(防 stop 咔哒);mock 无 linearRamp 时瞬停
        try { bgmGain.gain.setValueAtTime(bgmGain.gain.value, t); bgmGain.gain.linearRampToValueAtTime(0.0001, t + rel); } catch (e) {}
      }
      for (var i = 0; i < all.length; i++) { try { all[i].stop(t + rel); } catch (e) {} }   // 延迟到 release 末停(不立即 disconnect,否则切断淡出);停后节点引用置空自然 GC
      bgmOsc = null; bgmExtra = []; bgmGain = null; currentBgm = null;
    }
    // ── BGS / 环境音(背景声景;调研 audio-strategy §9:零样本程序合成,与视觉 buildAtmosphere 对称)─────────
    // 配方:种子着色噪声(白/粉/棕)→ biquad 滤波塑形 → LFO 慢扫截止(呼吸/阵风)+ LFO 慢调增益(海浪涌动)→ master。
    // **永不重复**(长循环 buffer + 双 LFO 非公约周期相位漂移)。与 bgm/music **并行独立**(自有状态、独立 gain)=
    // "音乐 + 环境音同响"。**确定性**:噪声用种子 PRNG(同 makeReverbIR、非 Math.random),测试查图结构非样本值。
    // **触发**:本步仅 presenter 内部 + 直接 API(startBgs/stopBgs);present() 读 `audio.ambient` 字段=契约级、待用户确认(§9.3-A)。
    var noiseBufferCache = {}, noiseBufferCtx = null;
    function makeNoiseBuffer(seconds, color) {
      if (noiseBufferCtx !== ctx) { noiseBufferCache = {}; noiseBufferCtx = ctx; }
      var key = seconds + ':' + color;
      if (noiseBufferCache[key]) return noiseBufferCache[key];
      var sr = ctx.sampleRate || 44100, len = Math.max(1, Math.floor(sr * seconds)), s = 0x1a2b3c4d >>> 0;
      function r() { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 * 2 - 1; }
      var buf = ctx.createBuffer(1, len, sr);
      if (!buf.getChannelData) { noiseBufferCache[key] = buf; return buf; }    // mock 无 getChannelData → 空 buffer(测试只查图结构)
      var d = buf.getChannelData(0), i;
      if (color === 'brown') {                                               // 棕噪(积分白噪 −12dB/oct):海浪低吼 / 强风
        var last = 0; for (i = 0; i < len; i++) { last = (last + 0.02 * r()) / 1.02; d[i] = Math.max(-1, Math.min(1, last * 3.5)); }
      } else if (color === 'pink') {                                         // 粉噪(Paul Kellet −3dB/oct):落雨 / 树叶
        var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (i = 0; i < len; i++) {
          var w = r();
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
          b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        }
      } else { for (i = 0; i < len; i++) d[i] = r(); }                       // 白噪
      noiseBufferCache[key] = buf;
      return buf;
    }
    // 环境音纹理:每种是独立 builder(噪声层 + LFO + 起伏),构建进出口 gain out、并行汇 master。
    // **区分关键**(调研 + 挽歌 v4 参考):风=连续阵风(gain-LFO gust、无周期);浪=周期涌碎(慢 swell + 远浪低吼/近浪喷溅双层);
    // 雨=带通中频"体"(挽歌 light rain 手法,非高通嘶声=治"像电磁干扰")+ 微高频片雨;storm=雨+风+30Hz 次低吼三层。
    // StereoPanner 空间声场(沉浸感):**必须 guard** —— 缺 createStereoPanner(mock / 老浏览器)则返回 null,
    // 调用方退化为直连(向后兼容)。克制声像(幅度 ~0.3-0.6,别硬 L/R)。pan ∈ [-1,1]。
    function bgsPanner(pan) {
      if (!ctx.createStereoPanner) return null;                             // guard:缺失 → 直连退化
      var p = ctx.createStereoPanner(); if (p.pan) p.pan.value = pan || 0;
      return p;
    }
    function bgsLayer(color, ftype, ff, fq, gv, out, pan) {                  // 一条噪声层:noise → biquad → gain → [panner] → out;pan 给定且支持时插声像
      var src = ctx.createBufferSource(); src.buffer = makeNoiseBuffer(3, color); src.loop = true;
      var f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = ff; if (f.Q) f.Q.value = fq;
      var g = ctx.createGain(); g.gain.value = gv;
      var pn = (pan != null) ? bgsPanner(pan) : null;                       // 仅当显式要求声像才建(默认 path 字节不变)
      src.connect(f); f.connect(g);
      if (pn) { g.connect(pn); pn.connect(out); } else { g.connect(out); }  // panner 缺失/未要求 → 直连退化
      return { src: src, f: f, g: g, pan: pn };
    }
    function bgsLfo(rate, depth, target, t) {                              // 慢 LFO → 某 AudioParam(滤波扫频 / 增益起伏);返回 osc(可停)
      var o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.value = rate; og.gain.value = depth;
      o.connect(og); og.connect(target); o.start(t);
      return o;
    }
    // ── 瞬态层(patter):稀疏随机短事件 — 雨滴/火花/虫鸣/鸟鸣 ─────────────────────────────────
    // 连续噪声床缺"颗粒感";瞬态层在床之上 spawn 短促事件(谐振 blip / 噪声爆 pop / 节律脉冲 / 短扫频)。
    // **确定性**:呈现器级种子 PRNG(bgsRand,每次 startBgs 重置=同纹理同序列)、绝不用 Math.random。
    // **首批事件在 startBgs 内同步 spawn**(让测试能立即断言);后续靠 setTimeout 续排(句柄进 bgsTimer,stopBgs 清)。
    var bgsSeed = 0x2f6e1b97 >>> 0;
    function bgsRand() {                                                    // mulberry32(同 makeReverbIR 算法,独立 seed 流;0..1)
      bgsSeed = (bgsSeed + 0x6D2B79F5) | 0; var t = Math.imul(bgsSeed ^ bgsSeed >>> 15, 1 | bgsSeed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
    function rrange(lo, hi) { return lo + bgsRand() * (hi - lo); }          // 种子均匀 [lo,hi)
    // 瞬态事件的声像汇出:每个事件用 bgsRand 落一个随机 L/R 声像(雨滴散布立体声场 / 鸟鸣·虫鸣有方位)。
    // panner 缺失(mock/老浏览器)→ 直连退化。spread=声像幅度上限(克制,默认 ~0.6)。返回挂在 g 之后、连向 out 的入口。
    function panOut(g, out, spread) {
      var pn = bgsPanner((bgsRand() * 2 - 1) * (spread == null ? 0.6 : spread));   // 随机散布 [-spread,spread]
      if (pn) { g.connect(pn); pn.connect(out); } else { g.connect(out); }
    }
    // 瞬态事件 spawner 表:fn(out, t) 在 out 上挂一个短事件、把可停节点 push 进 bgsExtra(随 stopBgs 停)。
    var TRANSIENT = {
      droplet: function (out, t) {                                         // 雨滴:高 Q 谐振 sine blip(随机 ~800-2600Hz)+ 极短指数衰减(~0.02-0.05s)
        var osc = ctx.createOscillator(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
        var f = rrange(800, 2600), dur = rrange(0.02, 0.05), gv = rrange(0.04, 0.1);
        osc.type = 'sine'; osc.frequency.value = f;
        bp.type = 'bandpass'; bp.frequency.value = f; if (bp.Q) bp.Q.value = 8;   // 谐振:水滴的"叮"
        g.gain.value = gv; osc.connect(bp); bp.connect(g); panOut(g, out, 0.6);   // 雨滴散布立体声场
        osc.start(t);
        if (g.gain.setValueAtTime && g.gain.exponentialRampToValueAtTime) { try { g.gain.setValueAtTime(gv, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); } catch (e) {} }
        osc.stop(t + dur + 0.02); bgsExtra.push(osc);
      },
      crackle: function (out, t) {                                         // 火花:极短噪声爆 pop(随机 gain + 极短衰减)
        var dur = rrange(0.01, 0.04), gv = rrange(0.05, 0.16);
        var src = ctx.createBufferSource(); src.buffer = makeNoiseBuffer(0.06, 'white');
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rrange(1200, 4200); if (bp.Q) bp.Q.value = 1.2;
        var g = ctx.createGain(); g.gain.value = gv; src.connect(bp); bp.connect(g); panOut(g, out, 0.5);   // 火花轻散布(围炉感、别太开)
        if (src.start) src.start(t);
        if (g.gain.setValueAtTime && g.gain.exponentialRampToValueAtTime) { try { g.gain.setValueAtTime(gv, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); } catch (e) {} }
        if (src.stop) src.stop(t + dur + 0.02); bgsExtra.push(src);
      },
      cricket: function (out, t) {                                         // 虫鸣:节律高频脉冲 osc(~4kHz,一串极短颤音)
        var base = rrange(3600, 4600), reps = 3 + (bgsRand() * 4 | 0), gap = rrange(0.03, 0.06), gv = rrange(0.012, 0.03);
        var pn = bgsPanner((bgsRand() * 2 - 1) * 0.6), bus = pn || out;     // 整串虫鸣同方位(一只虫子有定点);panner 缺失→直连
        if (pn) pn.connect(out);
        for (var k = 0; k < reps; k++) {
          var osc = ctx.createOscillator(), g = ctx.createGain(), tt = t + k * gap, d = 0.018;
          osc.type = 'square'; osc.frequency.value = base; g.gain.value = gv;
          osc.connect(g); g.connect(bus); osc.start(tt);
          if (g.gain.setValueAtTime && g.gain.exponentialRampToValueAtTime) { try { g.gain.setValueAtTime(gv, tt); g.gain.exponentialRampToValueAtTime(0.0001, tt + d); } catch (e) {} }
          osc.stop(tt + d + 0.01); bgsExtra.push(osc);
        }
      },
      bird: function (out, t) {                                            // 鸟鸣:短扫频 osc 音符(随机起止频,稀疏)
        var osc = ctx.createOscillator(), g = ctx.createGain(), dur = rrange(0.08, 0.18), gv = rrange(0.02, 0.05);
        var f0 = rrange(1800, 3200), f1 = f0 * rrange(1.15, 1.9);          // 上扬啁啾(或下,随机)
        if (bgsRand() < 0.4) { var tmp = f0; f0 = f1; f1 = tmp; }
        osc.type = 'sine'; osc.frequency.value = f0;
        if (osc.frequency.setValueAtTime && osc.frequency.exponentialRampToValueAtTime) { try { osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f1, t + dur); } catch (e) {} }
        g.gain.value = gv; osc.connect(g); panOut(g, out, 0.7); osc.start(t);   // 鸟鸣有方位(可较开 0.7)
        if (g.gain.setValueAtTime && g.gain.exponentialRampToValueAtTime) { try { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gv, t + dur * 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); } catch (e) {} }
        osc.stop(t + dur + 0.02); bgsExtra.push(osc);
      }
    };
    // 在 out 上装瞬态层:**同步 spawn 首批**(测试可立即断言),再用 setTimeout 续排(节律由 PRNG 抖动;句柄入 bgsTimer)。
    // density=平均事件率(次/秒)的粗略尺度;实际间隔 = 种子抖动,故"永不规整"。
    function armTransient(kind, out, density) {
      var spawn = TRANSIENT[kind]; if (!spawn) return;
      var burst = density >= 6 ? 3 : density >= 2 ? 2 : 1;                  // 首批同步事件数(密集纹理多撒几颗,稀疏只一颗)
      var now = (ctx.currentTime || 0);
      for (var i = 0; i < burst; i++) spawn(out, now + rrange(0, 0.12));    // 同步首批
      if (typeof setTimeout === 'undefined') return;                       // 无 setTimeout 环境 → 仅首批(向后兼容)
      var loop = function () {
        if (currentBgs == null) return;                                    // 已 stop → 不再续(双保险,timer 也会被清)
        if (bgsExtra.length > 1600) bgsExtra.splice(0, bgsExtra.length - 800);   // 长会话防句柄无限增长(瞬态按时序 spawn → 头部早已停完;同 pruneMusicNodes)
        spawn(out, (ctx.currentTime || 0) + rrange(0, 0.05));
        var ms = (1000 / density) * rrange(0.5, 1.6);                      // 下次延迟:均值随 density、±种子抖动
        bgsTimer.push(setTimeout(loop, ms));
      };
      bgsTimer.push(setTimeout(loop, (1000 / density) * rrange(0.5, 1.6)));
    }
    // builder(out,t,nodes) → 构建该纹理图、把可停节点 push 进 nodes、返回出口基础音量。
    function heartThump(out, t, vel) {                                     // 一记心跳"咚":低频体(好设备体感)+ 中频 thud(小喇叭可闻;同 braam/jump-scare 频段教训)
      var lo = ctx.createOscillator(), lg = ctx.createGain();
      lo.type = 'sine'; lo.frequency.value = 60;
      if (lo.frequency.setValueAtTime && lo.frequency.exponentialRampToValueAtTime) { try { lo.frequency.setValueAtTime(78, t); lo.frequency.exponentialRampToValueAtTime(42, t + 0.13); } catch (e) {} }   // 微降=心搏下沉
      lg.gain.value = 0.18 * vel; lo.connect(lg); lg.connect(out); lo.start(t);
      if (lg.gain.setValueAtTime && lg.gain.exponentialRampToValueAtTime) { try { lg.gain.setValueAtTime(0.18 * vel, t); lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.17); } catch (e) {} }
      lo.stop(t + 0.19); bgsExtra.push(lo);
      var mid = ctx.createOscillator(), mg = ctx.createGain();
      mid.type = 'sine'; mid.frequency.value = 130; mg.gain.value = 0.08 * vel; mid.connect(mg); mg.connect(out); mid.start(t);   // 130Hz thud:小喇叭可闻
      if (mg.gain.setValueAtTime && mg.gain.exponentialRampToValueAtTime) { try { mg.gain.setValueAtTime(0.08 * vel, t); mg.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); } catch (e) {} }
      mid.stop(t + 0.11); bgsExtra.push(mid);
    }
    var BGS_BUILD = {
      wind: function (out, t, nodes) {                                     // 连续阵风:粉噪带通 + gain-LFO 阵风(挽歌手法)+ 缓滤波扫 + 慢 pan 漂移(阵风掠过);无周期感
        var L = bgsLayer('pink', 'bandpass', 380, 0.6, 0.10, out, 0);      // 带声像(初始居中)
        nodes.push(L.src, bgsLfo(0.10, 0.06, L.g.gain, t), bgsLfo(0.07, 180, L.f.frequency, t));
        if (L.pan && L.pan.pan) nodes.push(bgsLfo(0.037, 0.4, L.pan.pan, t));   // 慢 pan 漂移(~27s,阵风掠过感)
        L.src.start(t); return 0.9;
      },
      waves: function (out, t, nodes) {                                    // 周期涌碎:远浪(棕噪低吼慢涌,居中)+ 近浪(白噪喷溅,峰处涌入=拍碎,声像横扫)双层,同周期 swell
        var far = bgsLayer('brown', 'lowpass', 360, 0.5, 0.10, out);       // 远浪居中(默认无 panner)
        var close = bgsLayer('white', 'bandpass', 1100, 0.7, 0.05, out, 0);// 近浪带声像(初始居中)
        nodes.push(far.src, close.src);
        nodes.push(bgsLfo(0.09, 0.06, far.g.gain, t));                     // 远浪慢涌(~11s/浪)
        nodes.push(bgsLfo(0.09, 0.06, close.g.gain, t));                   // 近浪喷溅同周期涌入(基线低、峰处涌起)
        if (close.pan && close.pan.pan) nodes.push(bgsLfo(0.045, 0.5, close.pan.pan, t));   // 近浪慢 pan LFO(~22s 横扫 L↔R = "浪横扫而过")
        far.src.start(t); close.src.start(t); return 1.0;
      },
      rain: function (out, t, nodes) {                                     // 雨:带通中频"体"(挽歌手法,非高通嘶)+ 微高频片雨 + 极缓密度起伏 + 雨滴瞬态 patter
        var body = bgsLayer('white', 'bandpass', 520, 0.9, 0.10, out);
        var sheet = bgsLayer('white', 'highpass', 2400, 0.5, 0.022, out);
        nodes.push(body.src, sheet.src, bgsLfo(0.3, 0.018, body.g.gain, t));
        body.src.start(t); sheet.src.start(t);
        armTransient('droplet', out, 9);                                   // 密集雨滴
        return 0.85;
      },
      storm: function (out, t, nodes) {                                    // 暴风雨:重雨 + 怒风 + 30Hz 次低吼(挽歌 storm 三层)
        var rain = bgsLayer('white', 'bandpass', 600, 0.8, 0.11, out);
        var hiss = bgsLayer('white', 'highpass', 2000, 0.5, 0.03, out);
        var wind = bgsLayer('pink', 'bandpass', 350, 0.5, 0.06, out, 0);   // 怒风带声像(初始居中)
        nodes.push(rain.src, hiss.src, wind.src, bgsLfo(0.28, 0.05, wind.g.gain, t));
        if (wind.pan && wind.pan.pan) nodes.push(bgsLfo(0.041, 0.45, wind.pan.pan, t));   // 怒风慢 pan 漂移(掠过)
        var sub = ctx.createOscillator(), sg = ctx.createGain();           // 次低吼(30Hz)+ 缓振幅
        sub.type = 'sine'; sub.frequency.value = 30; sg.gain.value = 0.05; sub.connect(sg); sg.connect(out); sub.start(t);
        nodes.push(sub, bgsLfo(0.08, 0.03, sg.gain, t));
        rain.src.start(t); hiss.src.start(t); wind.src.start(t); return 0.95;
      },
      forest: function (out, t, nodes) {                                   // 林间:风过树叶(粉噪带通高频、缓滤波扫 + 缓起伏)+ 稀疏鸟鸣瞬态
        var L = bgsLayer('pink', 'bandpass', 1700, 0.4, 0.06, out);
        nodes.push(L.src, bgsLfo(0.08, 350, L.f.frequency, t), bgsLfo(0.06, 0.03, L.g.gain, t));
        L.src.start(t);
        armTransient('bird', out, 0.5);                                    // 稀疏鸟鸣(~2s 一只)
        return 0.85;
      },
      stream: function (out, t, nodes) {                                   // 溪流:中频带通 + 较快轻起伏(潺潺)+ 高频细碎水沫
        var L = bgsLayer('white', 'bandpass', 900, 0.7, 0.07, out);
        var hi = bgsLayer('white', 'highpass', 3000, 0.6, 0.015, out);
        nodes.push(L.src, hi.src, bgsLfo(0.7, 140, L.f.frequency, t), bgsLfo(0.9, 0.02, L.g.gain, t));
        L.src.start(t); hi.src.start(t); return 0.8;
      },
      night: function (out, t, nodes) {                                    // 夜:极低棕噪暗涌 + 稀薄高频气感 + 虫鸣瞬态(节律颤音)
        var L = bgsLayer('brown', 'lowpass', 280, 0.5, 0.07, out);
        var air = bgsLayer('pink', 'highpass', 4000, 0.5, 0.008, out);
        nodes.push(L.src, air.src, bgsLfo(0.05, 0.03, L.g.gain, t));
        L.src.start(t); air.src.start(t);
        armTransient('cricket', out, 1.2);                                 // 虫鸣(~0.8s 一串)
        return 0.8;
      },
      // ── 新增纹理(additive)──────────────────────────────────────────────────────────────
      campfire: function (out, t, nodes) {                                 // 营火:低频火 rumble(棕噪低通)+ 中频燃烧 hiss + 火花 crackle 瞬态
        var rumble = bgsLayer('brown', 'lowpass', 220, 0.6, 0.10, out);
        var hiss = bgsLayer('pink', 'bandpass', 1400, 0.5, 0.035, out);
        nodes.push(rumble.src, hiss.src, bgsLfo(0.13, 0.04, rumble.g.gain, t), bgsLfo(0.5, 0.02, hiss.g.gain, t));
        rumble.src.start(t); hiss.src.start(t);
        armTransient('crackle', out, 7);                                   // 密集噼啪火花
        return 0.85;
      },
      town: function (out, t, nodes) {                                     // 城镇/人群:低 murmur(滤波白噪低通)+ 慢调制(人声团块起伏)+ 远处嗡鸣层
        var murmur = bgsLayer('white', 'lowpass', 480, 0.4, 0.10, out);
        var body = bgsLayer('pink', 'bandpass', 700, 0.5, 0.05, out);
        nodes.push(murmur.src, body.src, bgsLfo(0.18, 0.05, murmur.g.gain, t), bgsLfo(0.11, 90, body.f.frequency, t));
        murmur.src.start(t); body.src.start(t); return 0.8;
      },
      cave: function (out, t, nodes) {                                     // 洞穴:极低洞穴氛围(棕噪超低通)+ 稀薄气感 + 偶发滴水瞬态(经 out→master 自带混响)
        var amb = bgsLayer('brown', 'lowpass', 180, 0.6, 0.09, out);
        var air = bgsLayer('pink', 'highpass', 3000, 0.4, 0.006, out);
        nodes.push(amb.src, air.src, bgsLfo(0.04, 0.03, amb.g.gain, t));
        amb.src.start(t); air.src.start(t);
        armTransient('droplet', out, 0.4);                                 // 偶发回响滴水(~2.5s 一滴;混响来自 master 链)
        return 0.8;
      },
      snow: function (out, t, nodes) {                                     // 雪:极柔高通嘶(细微飘雪)+ 闷风(棕噪低通缓阵)= 安静寒冷
        var hiss = bgsLayer('pink', 'highpass', 5000, 0.4, 0.01, out);
        var wind = bgsLayer('brown', 'lowpass', 300, 0.4, 0.06, out);
        nodes.push(hiss.src, wind.src, bgsLfo(0.06, 0.03, wind.g.gain, t), bgsLfo(0.09, 0.004, hiss.g.gain, t));
        hiss.src.start(t); wind.src.start(t); return 0.75;
      },
      tavern: function (out, t, nodes) {                                   // 酒馆:暖 murmur(粉噪带通中低)+ 较快人声团块起伏 + 偶发噼啪(壁炉火)
        var murmur = bgsLayer('pink', 'bandpass', 550, 0.5, 0.09, out);
        var warm = bgsLayer('brown', 'lowpass', 360, 0.5, 0.05, out);
        nodes.push(murmur.src, warm.src, bgsLfo(0.22, 0.05, murmur.g.gain, t), bgsLfo(0.14, 120, murmur.f.frequency, t));
        murmur.src.start(t); warm.src.start(t);
        armTransient('crackle', out, 1.5);                                 // 壁炉偶发噼啪
        return 0.82;
      },
      underwater: function (out, t, nodes) {                               // 水下:全低通(闷)+ 极低涌动 + 气泡瞬态(droplet 在低频域=咕噜)
        var low = bgsLayer('brown', 'lowpass', 200, 0.7, 0.11, out);
        var mid = bgsLayer('pink', 'lowpass', 420, 0.5, 0.04, out);
        nodes.push(low.src, mid.src, bgsLfo(0.07, 0.05, low.g.gain, t), bgsLfo(0.12, 60, low.f.frequency, t));
        low.src.start(t); mid.src.start(t);
        armTransient('droplet', out, 2.2);                                 // 上浮气泡(droplet blip;频率域偏高但稀疏=咕噜泡)
        return 0.82;
      },
      heartbeat: function (out, t, nodes) {                              // 心跳:lub-dub 双脉冲循环(~65 BPM);低频体感 + 中频"咚";恐怖氛围 BGS(用户提议)。轻抖=活体感
        function beat(t0) { heartThump(out, t0, 1.0); heartThump(out, t0 + 0.17, 0.6); }   // lub(强)→ dub(弱)
        beat(t + 0.04);                                                  // 首拍同步(测试可断言)
        if (typeof setTimeout !== 'undefined') {
          var period = 0.92, loop = function () {                        // ~65 BPM
            if (currentBgs == null) return;                              // 已 stopBgs → 不再续(双保险,timer 也清)
            if (bgsExtra.length > 1600) bgsExtra.splice(0, bgsExtra.length - 800);
            beat((ctx.currentTime || 0) + 0.02);
            bgsTimer.push(setTimeout(loop, period * rrange(0.93, 1.07) * 1000));   // ±7% 轻抖(非死板节拍器)
          };
          bgsTimer.push(setTimeout(loop, period * 1000));
        }
        return 0.95;
      },
      'ambient-unease': function (out, t, nodes) {   // v20:dread drone 并行层(忠实复刻 startAmbient,出口走 out→bgsMaster 与 music 并行;同合成参数=与 bgm:'ambient-unease' 听感一致)
        var base = bgmFreq('ambient-unease');                                            // 58.27Hz
        var filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 320; if (filter.Q) filter.Q.value = 4; filter.connect(out);
        var voices = [{ n: 0, d: -7 }, { n: 1, d: 8 }, { n: 6, d: -4 }];                  // ① 不协和低频簇(根/小二度/三全音)+ detune 拍频
        for (var i = 0; i < voices.length; i++) { var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = semis(base, voices[i].n); if (o.detune) o.detune.value = voices[i].d; o.connect(filter); o.start(t); nodes.push(o); }
        var am = ctx.createOscillator(), amg = ctx.createGain(); am.type = 'sine'; am.frequency.value = 55; amg.gain.value = 0.018; am.connect(amg); amg.connect(out.gain); am.start(t); nodes.push(am);   // ② AM 粗糙度(调 out.gain=startAmbient 的 g)
        var fl = ctx.createOscillator(), flg = ctx.createGain(); fl.type = 'sine'; fl.frequency.value = 0.07; flg.gain.value = 180; fl.connect(flg); flg.connect(filter.frequency); fl.start(t); nodes.push(fl);   // ③ 滤波呼吸 LFO
        var hb = ctx.createOscillator(), hbg = ctx.createGain(); hb.type = 'sine'; hb.frequency.value = 55; hbg.gain.value = 0; hb.connect(hbg); hbg.connect(out); hb.start(t); nodes.push(hb);          // ④ sub 心跳
        if (hbg.gain.setValueAtTime && hbg.gain.linearRampToValueAtTime) {
          var hbPeriod = 1.2, hbWin = 40;
          var scheduleHeart = function (from) {                                          // lub-dub 网格 + 窗末续排(bgsTimer + currentBgs guard,镜像 startAmbient)
            var beats = Math.ceil(hbWin / hbPeriod), k, bt;
            for (k = 0; k < beats; k++) { bt = from + k * hbPeriod; try {
              hbg.gain.setValueAtTime(0.0001, bt); hbg.gain.linearRampToValueAtTime(0.06, bt + 0.04); hbg.gain.linearRampToValueAtTime(0.0001, bt + 0.12);
              hbg.gain.setValueAtTime(0.0001, bt + 0.22); hbg.gain.linearRampToValueAtTime(0.045, bt + 0.26); hbg.gain.linearRampToValueAtTime(0.0001, bt + 0.36);
            } catch (e) {} }
            if (typeof setTimeout !== 'undefined') bgsTimer.push(setTimeout(function () { if (currentBgs === 'ambient-unease') scheduleHeart((ctx.currentTime || 0)); }, (hbWin - 4) * 1000));
          };
          scheduleHeart(t);
        }
        var seed = ambHash('ambient-unease'), rnd = function () { seed = (seed + 0x6D2B79F5) | 0; var z = Math.imul(seed ^ seed >>> 15, 1 | seed); z = (z + Math.imul(z ^ z >>> 7, 61 | z)) ^ z; return ((z ^ z >>> 14) >>> 0) / 4294967296; };   // ⑤ 稀疏刺点(种子 PRNG=确定性)
        function ping(at) {
          var po = ctx.createOscillator(), bp = ctx.createBiquadFilter(), pg = ctx.createGain();
          var f = 1400 + rnd() * 2200, dur = 0.18 + rnd() * 0.5, gv = 0.03 + rnd() * 0.04;
          po.type = 'sine'; po.frequency.value = f; bp.type = 'bandpass'; bp.frequency.value = f; if (bp.Q) bp.Q.value = 18;
          pg.gain.value = gv; po.connect(bp); bp.connect(pg); pg.connect(bgsMaster || master); po.start(at);   // ping → bgsMaster(并行层透出、不受 out 包络;对齐 startAmbient ping→master)
          if (pg.gain.setValueAtTime && pg.gain.exponentialRampToValueAtTime) { try { pg.gain.setValueAtTime(0.0001, at); pg.gain.exponentialRampToValueAtTime(gv, at + 0.01); pg.gain.exponentialRampToValueAtTime(0.0001, at + dur); } catch (e) {} }
          if (po.stop) po.stop(at + dur + 0.05); bgsExtra.push(po);
        }
        ping(t + rnd() * 1.2);                                                            // 首批同步 1 颗(可断言;簇3+am+fl+hb+ping=6 osc)
        if (typeof setTimeout !== 'undefined') {
          var loop = function () { if (currentBgs !== 'ambient-unease') return;            // 已换/停 → 不续(双保险,bgsTimer 也清)
            if (bgsExtra.length > 600) bgsExtra.splice(0, bgsExtra.length - 300);
            ping((ctx.currentTime || 0) + rnd() * 0.2);
            bgsTimer.push(setTimeout(loop, 3000 + rnd() * 12000));
          };
          bgsTimer.push(setTimeout(loop, 3000 + rnd() * 12000));
        }
        return 0.05;                                                                      // 出口基础音量(对齐 startAmbient g=0.05)
      }
    };
    // 公用脚手架:出口 gain → bgsMaster、清旧 timer、重置瞬态 PRNG、跑 builder(填 nodes + armTransient 填 bgsExtra)、attack 斜坡。
    // **预设(startBgs)与 spec(startAmbience)共用此脚手架** → 同一生命周期/状态(bgsSrc/bgsExtra/bgsGain/currentBgs),与 bgm/music 并行。
    // key:存进 currentBgs 供变更检测(预设=名,spec=由 present() 传 JSON.stringify 计算的稳定键)。
    function runBgsBuild(builder, key) {
      var t = (ctx.currentTime || 0);
      // 幂等 re-start(R2 二轮 P1):此前只清旧 timer、却把 bgsExtra 直接置 [](见下)丢弃旧节点引用而不停音——
      //   经 present() 无碍(:1596 先 stopAmbience 再 startAmbience),但直接连调公开 API startBgs/startAmbience 两次
      //   会让旧声景源/LFO/瞬态节点永久连在 bgsMaster 上播放(泄漏 + 双播、且引用已丢再也停不掉)。先停旧再建新,
      //   使裸 re-start 也安全;present() 路径此时 bgs* 已空 → 条件假、近 no-op,不重复停。
      if (bgsExtra.length || bgsSrc || bgsGain) stopBgs();
      var out = ctx.createGain(); out.gain.value = 0.0001; out.connect(bgsMaster || master);   // 出口 gain:attack/release 斜坡 + 汇 bgsMaster(统一音量)→ master(获混响)
      for (var k0 = 0; k0 < bgsTimer.length; k0++) { try { clearTimeout(bgsTimer[k0]); } catch (e) {} }   // 防裸 re-start(未 stopBgs)漏旧瞬态 timer
      bgsTimer = [];
      bgsSrc = out; bgsExtra = []; bgsGain = out; currentBgs = key;         // 先就位:builder 经 armTransient 同步 spawn 首批瞬态会 push 进 bgsExtra,故须先重置
      bgsSeed = 0x2f6e1b97 >>> 0;                                          // 重置瞬态 PRNG seed:同纹理同序列(确定性);避免跨 start 序列漂移
      var nodes = [];
      var lvl = builder(out, t, nodes);                                    // builder 构建纹理图、填 nodes(床的源+LFO)、armTransient 填 bgsExtra(瞬态)、返回基础音量
      bgsExtra = bgsExtra.concat(nodes);                                   // 合并:床节点 + 已同步 spawn 的瞬态节点(均随 stopBgs 停)
      if (out.gain.setValueAtTime && out.gain.linearRampToValueAtTime) {   // attack 斜坡(防咔哒);mock 无 ramp → 留基线
        out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(lvl, t + 1.4);
      } else { out.gain.value = lvl; }
    }
    function startBgs(name) {
      if (!ensureCtx()) return;
      var build = BGS_BUILD[name]; if (!build) return;                     // 未知纹理 → 静默(向后兼容)
      runBgsBuild(build, name);
    }
    function stopBgs() {
      var t = (ctx && ctx.currentTime) || 0, rel = 0.7;
      currentBgs = null;                                                   // 先置空:瞬态 setTimeout loop 据此停止续排(双保险,timer 也会被清)
      for (var k = 0; k < bgsTimer.length; k++) { try { clearTimeout(bgsTimer[k]); } catch (e) {} }   // **清除全部瞬态 timer**=不漏 timer
      bgsTimer = [];
      if (bgsGain && bgsGain.gain.setValueAtTime && bgsGain.gain.linearRampToValueAtTime) {   // release 斜坡(防咔哒)
        try { bgsGain.gain.setValueAtTime(bgsGain.gain.value, t); bgsGain.gain.linearRampToValueAtTime(0.0001, t + rel); } catch (e) {}
      }
      for (var i = 0; i < bgsExtra.length; i++) { try { bgsExtra[i].stop(t + rel); } catch (e) {} }   // 停所有源 + LFO + 瞬态节点
      bgsSrc = null; bgsExtra = []; bgsGain = null;
    }
    // ── audio.ambient · Preset|Spec 二元(audio-strategy §10:每意图 预设名 | 可组合 spec)──────────────
    // 预设名(BGS_BUILD 的 15 个,如 'rain'/'waves')= few-shot 锚点 + 弱模型安全路径;
    // AmbientSpec 对象 = 强模型组合面(理解原语 layers/transients → 拼下游专属声景,如"暴雨远处篝火+近处滴水")。
    // 与 music/bgm **并行叠加**(独立 gain → bgsMaster),实现"音乐 + 环境音同响"。**fail-loud**:未知预设名 / 非法 spec → throw(§11,不静默)。
    // AmbientSpec = { layers:[{color:'white|pink|brown', filter:{type,freq,q}, gainLfo:{rate,depth}?, filterLfo:{rate,depth}?, pan?, level?}],
    //                 transients?:[{kind:'droplet|crackle|cricket|bird', density?}], level? }
    var AMBIENT_COLORS = { white: 1, pink: 1, brown: 1 };
    var AMBIENT_FILTERS = { lowpass: 1, highpass: 1, bandpass: 1, lowshelf: 1, highshelf: 1, peaking: 1, notch: 1, allpass: 1 };
    function finiteNumber(value) { return typeof value === 'number' && isFinite(value); }
    function validateAmbientLfo(value, path) {
      if (value == null) return;
      if (!value || typeof value !== 'object' || Array.isArray(value) || !finiteNumber(value.rate) || !finiteNumber(value.depth)) {
        throw new Error('buildAmbience: ' + path + ' 必须是对象 {rate,depth}，且两者都是有限数字');
      }
    }
    // 把 AmbientSpec 转成一个 builder(out,t,nodes)→level,复用 bgsLayer/bgsLfo/armTransient/bgsPanner;故可塞进 runBgsBuild 脚手架。
    // **校验(fail-loud)**:spec 非对象 / layers 非数组或空 / layer 缺 color|filter / color 非枚举 / filter 缺 type|freq → throw(带清晰消息)。
    function buildAmbience(spec) {
      if (spec == null || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('buildAmbience: AmbientSpec 必须是对象');
      var layers = spec.layers;
      if (!Array.isArray(layers) || layers.length === 0) throw new Error('buildAmbience: spec.layers 必须是非空数组');
      var trans = spec.transients;
      if (trans != null && !Array.isArray(trans)) throw new Error('buildAmbience: spec.transients 必须是数组');
      if (spec.level != null && !finiteNumber(spec.level)) throw new Error('buildAmbience: spec.level 必须是有限数字');
      for (var li = 0; li < layers.length; li++) {                          // 先全量校验(发声前 fail-loud,不留半成品图)
        var L = layers[li];
        if (L == null || typeof L !== 'object') throw new Error('buildAmbience: layers[' + li + '] 必须是对象');
        if (L.color == null || !AMBIENT_COLORS[L.color]) throw new Error('buildAmbience: layers[' + li + '].color 必须是 white|pink|brown(收到 "' + L.color + '")');
        if (L.filter == null || typeof L.filter !== 'object') throw new Error('buildAmbience: layers[' + li + '].filter 必须是对象 {type,freq,q?}');
        if (!AMBIENT_FILTERS[L.filter.type]) throw new Error('buildAmbience: layers[' + li + '].filter.type 必须是 lowpass|highpass|bandpass|lowshelf|highshelf|peaking|notch|allpass');
        if (!finiteNumber(L.filter.freq)) throw new Error('buildAmbience: layers[' + li + '].filter.freq 必须是有限数字');
        if (L.filter.q != null && !finiteNumber(L.filter.q)) throw new Error('buildAmbience: layers[' + li + '].filter.q 必须是有限数字');
        if (L.level != null && !finiteNumber(L.level)) throw new Error('buildAmbience: layers[' + li + '].level 必须是有限数字');
        if (L.pan != null && !finiteNumber(L.pan)) throw new Error('buildAmbience: layers[' + li + '].pan 必须是有限数字');
        validateAmbientLfo(L.gainLfo, 'layers[' + li + '].gainLfo');
        validateAmbientLfo(L.filterLfo, 'layers[' + li + '].filterLfo');
      }
      for (var ti = 0; trans && ti < trans.length; ti++) {
        var T = trans[ti];
        if (T == null || typeof T !== 'object' || !TRANSIENT[T.kind]) throw new Error('buildAmbience: transients[' + ti + '].kind 必须是 droplet|crackle|cricket|bird(收到 "' + (T && T.kind) + '")');
        if (T.density != null && !finiteNumber(T.density)) throw new Error('buildAmbience: transients[' + ti + '].density 必须是有限数字');
      }
      return function (out, t, nodes) {                                     // builder:逐层构建(噪声→滤波→gain→[pan])+ 可选双 LFO + 瞬态;复用现有原语
        for (var i = 0; i < layers.length; i++) {
          var la = layers[i], f = la.filter, lvl = (la.level != null ? la.level : 0.08);
          var lay = bgsLayer(la.color, f.type, f.freq, (f.q != null ? f.q : 0.5), lvl, out, (la.pan != null ? la.pan : null));
          nodes.push(lay.src);
          if (la.gainLfo) nodes.push(bgsLfo(la.gainLfo.rate, la.gainLfo.depth, lay.g.gain, t));          // 增益起伏(涌动/呼吸)
          if (la.filterLfo) nodes.push(bgsLfo(la.filterLfo.rate, la.filterLfo.depth, lay.f.frequency, t)); // 滤波扫频(阵风)
          lay.src.start(t);
        }
        for (var k = 0; trans && k < trans.length; k++) armTransient(trans[k].kind, out, (trans[k].density != null ? trans[k].density : 1));   // 瞬态层(雨滴/火花/虫鸣/鸟鸣)
        return (spec.level != null ? spec.level : 0.85);                    // 整体出口基础音量
      };
    }
    // string|AmbientSpec → { name?, builder? }(镜像 resolveMusic):字符串=预设名(BGS_BUILD 存在则用,否则 throw);对象=交 buildAmbience。
    // **fail-loud**:未知预设名 / 非字符串非对象 → throw(不静默,§11)。
    function resolveAmbient(nameOrSpec) {
      if (typeof nameOrSpec === 'string') {
        if (!BGS_BUILD[nameOrSpec]) throw new Error('resolveAmbient: 未知 ambient 预设名 "' + nameOrSpec + '"(可选:' + Object.keys(BGS_BUILD).join('/') + ' 或给 AmbientSpec 对象)');
        return { name: nameOrSpec, builder: BGS_BUILD[nameOrSpec] };
      }
      if (nameOrSpec && typeof nameOrSpec === 'object' && !Array.isArray(nameOrSpec)) return { builder: buildAmbience(nameOrSpec) };
      throw new Error('resolveAmbient: audio.ambient 必须是预设名(字符串)或 AmbientSpec(对象)');
    }
    // 统一入口:name 走 BGS_BUILD 预设(复用 startBgs 路径)、spec 走 buildAmbience builder;均经 runBgsBuild 脚手架 → 独立状态、与 bgm/music 并行。
    function startAmbience(nameOrSpec) {
      var r = resolveAmbient(nameOrSpec);                                   // 先校验作者意图，再探测发声能力；无 AudioContext 只允许合法 spec 静默退化
      if (!ensureCtx()) return;
      runBgsBuild(r.builder, r.name != null ? r.name : 'spec');
    }
    function stopAmbience() { stopBgs(); }                                  // 独立状态沿用 bgs*(含瞬态 timer 清空);与 stopBgs 同
    function playSfx(nameOrSpec) {
      var custom = nameOrSpec && typeof nameOrSpec === 'object' && !Array.isArray(nameOrSpec) ? resolveSfx(nameOrSpec) : null;
      if (!custom && typeof nameOrSpec !== 'string') throw new Error('playSfx: sfx 必须是预设名(字符串)或 SfxSpec(对象),收到 ' + (nameOrSpec === null ? 'null' : typeof nameOrSpec));   // 先校验作者意图，再探测 AudioContext；无发声能力不能把坏 spec 吞成“静默退化”
      if (!ensureCtx()) return;
      if (custom) { playSfxSpec(custom); return; }                            // 契约 v19:自定义 SfxSpec(对象)→ 校验+合成;字符串路径下方逐字节不变
      var name = nameOrSpec;
      if (RICH_SFX[name]) { playRichSfx(name); return; }                   // S10:恐怖音效走丰富合成(下)
      var spec = sfxSpec(name), osc = ctx.createOscillator(), g = ctx.createGain(), t = (ctx.currentTime || 0);
      osc.type = spec.type; osc.frequency.value = spec.freq;
      g.gain.value = spec.gain; osc.connect(g); g.connect(master);
      osc.start(t);
      if (g.gain.setValueAtTime && g.gain.exponentialRampToValueAtTime) {   // 衰减包络(真机更顺;mock 下为 no-op)
        g.gain.setValueAtTime(spec.gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + spec.dur);
      }
      osc.stop(t + spec.dur);
    }
    // 契约 v19:自定义 SfxSpec 校验(全字段可选、类型错即抛;镜像 resolveAmbient fail-loud)
    function resolveSfx(spec) {
      if (spec.type != null && ['sine', 'square', 'triangle', 'sawtooth'].indexOf(spec.type) < 0) throw new Error('SfxSpec.type 必须是 sine|square|triangle|sawtooth,收到 ' + JSON.stringify(spec.type));
      if (spec.noise != null && typeof spec.noise !== 'boolean') throw new Error('SfxSpec.noise 必须是布尔');
      var nums = ['freq', 'freqEnd', 'hpFreq', 'dur', 'gain', 'attack', 'decay', 'sustain', 'release', 'lpFreq', 'distort'];
      for (var i = 0; i < nums.length; i++) { var k = nums[i]; if (spec[k] != null && (typeof spec[k] !== 'number' || !isFinite(spec[k]))) throw new Error('SfxSpec.' + k + ' 必须是有限数,收到 ' + (typeof spec[k] === 'number' ? String(spec[k]) : JSON.stringify(spec[k]))); }   // number 分支用 String() = NaN/Infinity 如实显示(JSON.stringify(NaN)==='null' 误导修)
      return spec;
    }
    // 契约 v19:SfxSpec 合成(复用 mkOsc/mkLp/makeDistortionCurve/envADSR;noise 路内联薄版连 master、不进 musicNodes=一次性,区别于 noiseHit 的鼓/音乐总线生命周期)
    function playSfxSpec(spec) {
      var t = (ctx.currentTime || 0);
      // R2 二轮 P1:mkOsc/mkLp/envADSR 是与 musicVoice 共享的 helper,按 module 级 voicePerformance 缩放音高/亮度/增益/包络。
      //   musicVoice 每音符写它、SFX 路却从不复位 → 上一段合成音乐残留的演奏 profile 会静默缩放作者指定的 SfxSpec
      //   gain/attack/release(实测 gain 0.5→0.48、attack 0.01→0.0078),作者零报错信号。SFX 是离散事件、无演奏 profile → 置 null 走中性 fallback。
      voicePerformance = null;
      var dur = (spec.dur != null ? spec.dur : 0.12), gain = (spec.gain != null ? spec.gain : 0.06);
      var A = (spec.attack != null ? spec.attack : 0.003), D = (spec.decay != null ? spec.decay : dur * 0.8), S = (spec.sustain != null ? spec.sustain : 0), R = (spec.release != null ? spec.release : 0.05);
      var g = ctx.createGain();
      if (spec.noise) {                                                    // 噪声路(打击/气声/爆):种子噪声 → 高通 → ADSR → master
        var nb = sharedNoise(); if (!nb || !ctx.createBufferSource) return;
        var src = ctx.createBufferSource(); src.buffer = nb;
        var nf = ctx.createBiquadFilter ? (function () { var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = (spec.hpFreq != null ? spec.hpFreq : 1000); return f; })() : null;
        src.connect(nf || g); if (nf) nf.connect(g); g.connect(master);
        envADSR(g, t, gain, A, D, S, R, dur);
        src.start(t); if (src.stop) src.stop(t + dur + R + 0.05);
        return;
      }
      var osc = mkOsc(spec.type || 'square', spec.freq != null ? spec.freq : 440), head = osc;   // 振荡器路
      if (spec.distort != null && ctx.createWaveShaper) { var sh = ctx.createWaveShaper(); sh.curve = makeDistortionCurve(spec.distort); head.connect(sh); head = sh; }
      if (spec.lpFreq != null) { var lp = mkLp(spec.lpFreq, 1); if (lp) { head.connect(lp); head = lp; } }
      head.connect(g); g.connect(master);
      if (spec.freqEnd != null && osc.frequency.setValueAtTime && osc.frequency.exponentialRampToValueAtTime) {   // 扫频(laser/zap/上升下降)
        try { osc.frequency.setValueAtTime(spec.freq != null ? spec.freq : 440, t); osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.freqEnd), t + dur); } catch (e) {}
      }
      envADSR(g, t, gain, A, D, S, R, dur);
      osc.start(t); osc.stop(t + dur + R + 0.05);
    }
    // 恐怖音效确定性 PRNG(撕裂颗粒位置/微音高;替 flesh-tear 旧 Math.random=同时修确定性破口)。同 mulberry32 算法族。
    function fxRand(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) | 0; var z = Math.imul(s ^ s >>> 15, 1 | s); z = (z + Math.imul(z ^ z >>> 7, 61 | z)) ^ z; return ((z ^ z >>> 14) >>> 0) / 4294967296; }; }
    function playRichSfx(name) {                                           // S10:恐怖音效=原生节点合成;阶段90 升级(端用户"渗血/撕裂不够吓人";调研:roughness/不协和簇/sub-bass/granular,出处见 journal 阶段90)
      var master = richOut();                                              // jump-scare 走提升总线(比背景响);局部遮蔽外层 master → 下面各套 connect(master) 自动经它
      var t = (ctx.currentTime || 0);
      // ── flesh-tear:种子噪声(修 Math.random 确定性破口)+ 强失真粗糙度(k=280≫sting,Arnal 尖叫粗糙度激活杏仁核)+ subharmonic sideband + 7 颗 pitch-crack 颗粒(撕裂的颗粒感)──
      if (name === 'flesh-tear') {
        var rng = fxRand(0x5eaf100d), dur = 0.5, nb = sharedNoise();    // sharedNoise=确定性种子噪声(替 Math.random)
        var src = ctx.createBufferSource(); if (nb) src.buffer = nb;
        var shaper = ctx.createWaveShaper && ctx.createWaveShaper();    // guard:缺→直连 bp
        if (shaper) shaper.curve = makeDistortionCurve(280);
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; if (bp.Q) bp.Q.value = 3.5;
        if (bp.frequency.setValueAtTime && bp.frequency.exponentialRampToValueAtTime) { bp.frequency.setValueAtTime(1400, t); bp.frequency.exponentialRampToValueAtTime(420, t + dur); }   // 带通下扫=撕裂下沉
        var gn = ctx.createGain(); gn.gain.value = 0.18;
        src.connect(shaper || bp); if (shaper) shaper.connect(bp); bp.connect(gn); gn.connect(master);
        if (src.start) src.start(t);
        if (ctx.createOscillator) {                                     // subharmonic LFO → 振幅 sideband(器质性颤动)
          var lfo = ctx.createOscillator(), lg = ctx.createGain();
          lfo.type = 'sawtooth'; lfo.frequency.value = 34; lg.gain.value = 0.07;
          lfo.connect(lg); lg.connect(gn.gain); if (lfo.start) lfo.start(t); if (lfo.stop) lfo.stop(t + dur);
        }
        if (gn.gain.setValueAtTime && gn.gain.exponentialRampToValueAtTime) { gn.gain.setValueAtTime(0.18, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
        if (src.stop) src.stop(t + dur);
        if (nb && ctx.createBufferSource) for (var k = 0; k < 7; k++) {  // pitch-crack:固定 7 颗(可测)、种子定位置/微音高;gain≤0.08 防总线压缩器削波泵感(红队增益护栏:削波反削惊跳)
          var gt = t + rng() * dur * 0.7, gd = 0.02 + rng() * 0.05;
          var gs = ctx.createBufferSource(); if (nb) gs.buffer = nb; if (gs.playbackRate) gs.playbackRate.value = 0.6 + rng() * 1.8;   // playbackRate guard:mock 无此属性
          var gbq = ctx.createBiquadFilter(); gbq.type = 'bandpass'; gbq.frequency.value = 600 + rng() * 2600; if (gbq.Q) gbq.Q.value = 6;
          var gg = ctx.createGain(); gg.gain.value = 0.04 + rng() * 0.04;   // ≤0.08(护栏)
          gs.connect(gbq); gbq.connect(gg); gg.connect(master);
          if (gs.start) gs.start(gt);
          if (gg.gain.setValueAtTime && gg.gain.exponentialRampToValueAtTime) { gg.gain.setValueAtTime(gg.gain.value, gt); gg.gain.exponentialRampToValueAtTime(0.0001, gt + gd); }
          if (gs.stop) gs.stop(gt + gd + 0.02);
        }
        return;
      }
      // ── horror-stab:高音不协和弦乐快速重复下弓 stab(Bernard Herrmann《惊魂记》刀刺弦乐)──
      if (name === 'horror-stab') {
        var stabBase = 880, stabSemis = [0, 1, 6], nStab = 4;            // 高音 / 根·小二度·三全音(不协和)/ 4 刀
        for (var qi = 0; qi < nStab; qi++) {
          var qt = t + qi * 0.135, qg = ctx.createGain(); qg.connect(master);   // 每 135ms 一刀
          if (qg.gain.setValueAtTime && qg.gain.linearRampToValueAtTime && qg.gain.exponentialRampToValueAtTime) {
            qg.gain.setValueAtTime(0.0001, qt); qg.gain.linearRampToValueAtTime(0.10, qt + 0.008); qg.gain.exponentialRampToValueAtTime(0.0001, qt + 0.12);   // 快起快落=下弓
          }
          for (var qj = 0; qj < stabSemis.length; qj++) {
            var qo = ctx.createOscillator(); qo.type = 'sawtooth'; qo.frequency.value = semis(stabBase, stabSemis[qj]); if (qo.detune) qo.detune.value = (qj - 1) * 6;
            qo.connect(qg); if (qo.start) qo.start(qt); if (qo.stop) qo.stop(qt + 0.13);
          }
        }
        return;
      }
      // ── horror-braam:低频 brass 齐奏轰鸣(Inception BRAAAM;多锯齿同音+detune→低通暗 + sub,慢起、长、压迫)──
      if (name === 'horror-braam') {
        var brDur = 1.3, brBase = 65, brLp = ctx.createBiquadFilter && ctx.createBiquadFilter();
        if (brLp) { brLp.type = 'lowpass'; brLp.frequency.value = 1100; if (brLp.Q) brLp.Q.value = 0.7; }   // 1100(原 560):放更多中频过 → 小喇叭也有"咆哮"存在感,不全靠放不出的 <80Hz
        var brSh = ctx.createWaveShaper && ctx.createWaveShaper(); if (brSh) brSh.curve = makeDistortionCurve(70);   // 失真泛音=中频"咬"(brass 在小喇叭的可闻部分)
        var brg = ctx.createGain(); if (brLp) brLp.connect(brg); brg.connect(master);
        if (brSh) brSh.connect(brLp || brg);
        var brIn = brSh || brLp || brg, brDet = [-10, -4, 3, 9];
        for (var ri = 0; ri < brDet.length; ri++) { var ro = ctx.createOscillator(); ro.type = 'sawtooth'; ro.frequency.value = brBase; if (ro.detune) ro.detune.value = brDet[ri]; ro.connect(brIn); if (ro.start) ro.start(t); if (ro.stop) ro.stop(t + brDur); }
        var brSub = ctx.createOscillator(), brSg = ctx.createGain(); brSub.type = 'sine'; brSub.frequency.value = brBase / 2; brSub.connect(brSg); brSg.connect(master); brSg.gain.value = 0.09; if (brSub.start) brSub.start(t); if (brSub.stop) brSub.stop(t + brDur);
        if (brg.gain.setValueAtTime && brg.gain.linearRampToValueAtTime && brg.gain.exponentialRampToValueAtTime) { brg.gain.setValueAtTime(0.0001, t); brg.gain.linearRampToValueAtTime(0.12, t + 0.07); brg.gain.exponentialRampToValueAtTime(0.0001, t + brDur); }   // 慢起(brass)→ 衰
        if (brSg.gain.setValueAtTime && brSg.gain.exponentialRampToValueAtTime) { brSg.gain.setValueAtTime(0.09, t + 0.05); brSg.gain.exponentialRampToValueAtTime(0.0001, t + brDur); }
        return;
      }
      // ── horror-screech:金属尖啸(Silent Hill 工业;非谐部分音=钟/盘 inharmonic ratio + 刮擦噪声上扫;混响尾经 master 自动)──
      if (name === 'horror-screech') {
        var scDur = 0.85, scBase = 320, scParts = [1, 2.76, 5.40, 8.93], scg = ctx.createGain(); scg.connect(master);
        for (var ci = 0; ci < scParts.length; ci++) {
          var co = ctx.createOscillator(); co.type = 'square'; co.frequency.value = scBase * scParts[ci];
          var cog = ctx.createGain(); cog.gain.value = 0.065 * (1 - ci * 0.12); co.connect(cog); cog.connect(scg); if (co.start) co.start(t); if (co.stop) co.stop(t + scDur);   // 高分音衰缓=更亮的金属泛音(原 0.05/(i+1) 衰太快)
        }
        var scn = sharedNoise();
        if (scn && ctx.createBufferSource) {
          var scs = ctx.createBufferSource(); scs.buffer = scn;
          var scbp = ctx.createBiquadFilter && ctx.createBiquadFilter();
          if (scbp) { scbp.type = 'bandpass'; scbp.frequency.value = 2600; if (scbp.Q) scbp.Q.value = 8; if (scbp.frequency.setValueAtTime && scbp.frequency.exponentialRampToValueAtTime) { scbp.frequency.setValueAtTime(2600, t); scbp.frequency.exponentialRampToValueAtTime(5200, t + scDur); } }   // 刮擦上扫=金属摩擦
          var scng = ctx.createGain(); scng.gain.value = 0.10; scs.connect(scbp || scng); if (scbp) scbp.connect(scng); scng.connect(master);
          if (scs.start) scs.start(t); if (scs.stop) scs.stop(t + scDur);
          if (scng.gain.setValueAtTime && scng.gain.exponentialRampToValueAtTime) { scng.gain.setValueAtTime(0.10, t); scng.gain.exponentialRampToValueAtTime(0.0001, t + scDur); }
        }
        if (scg.gain.setValueAtTime && scg.gain.linearRampToValueAtTime && scg.gain.exponentialRampToValueAtTime) { scg.gain.setValueAtTime(0.0001, t); scg.gain.linearRampToValueAtTime(1, t + 0.008); scg.gain.exponentialRampToValueAtTime(0.0001, t + scDur); }
        return;
      }
      // ── horror-shriek:类人尖叫(source-filter 声门模型 + 真声带"不完美")──
      //   调研:纯净规则波形=机械;真人声靠 jitter(F0 周期微扰)/vibrato(~5.6Hz 颤)/breathiness(气声)/
      //   非线性(subharmonic 次谐波 + rasp 失真)才像人。声门源 → rasp → /a/ 元音共振峰 → + 气声层。详见 lessons 107。
      if (name === 'horror-shriek') {
        var shDur = 0.62, jr = fxRand(0x5c7ea3d1);                          // 种子 PRNG → jitter(确定性,非 Math.random)
        var shG = ctx.createGain(); shG.connect(master);
        var shSh = ctx.createWaveShaper && ctx.createWaveShaper(); if (shSh) shSh.curve = makeDistortionCurve(110);   // 声带 rasp(非线性失真)
        var src = ctx.createGain();                                         // 源汇集(声门 + subharmonic)→ rasp → 共振峰
        var glot = ctx.createOscillator(); glot.type = 'sawtooth'; glot.frequency.value = 660;   // 声门源
        if (glot.frequency.setValueAtTime) { for (var ji = 0; ji * 0.022 < shDur; ji++) { var pr = ji * 0.022 / shDur, bf = 560 + 430 * Math.sin(pr * Math.PI * 0.85); try { glot.frequency.setValueAtTime(bf * (1 + (jr() - 0.5) * 0.05), t + ji * 0.022); } catch (e) {} } }   // F0 弓形上扬 + ±2.5% jitter(去机械)
        glot.connect(src);
        var vib = ctx.createOscillator(), vibG = ctx.createGain(); vib.type = 'sine'; vib.frequency.value = 5.6; vibG.gain.value = 26; vib.connect(vibG); if (glot.detune) vibG.connect(glot.detune);   // vibrato 颤音(人声签名)
        var sub = ctx.createOscillator(), subG = ctx.createGain(); sub.type = 'sawtooth'; sub.frequency.value = 330; subG.gain.value = 0.45; sub.connect(subG); subG.connect(src);   // subharmonic(F0/2,嘶哑/野兽)
        if (shSh) src.connect(shSh); var fIn = shSh || src;
        var shForm = [820, 1180, 2750], shQ = [8, 9, 8], shGn = [0.85, 0.62, 0.42], hasBp = false;   // /a/ 元音三共振峰(Q 调低+增益提高=更多能量透出、更响)
        for (var hi = 0; hi < shForm.length; hi++) { var bp = ctx.createBiquadFilter && ctx.createBiquadFilter(); if (!bp) break; hasBp = true; bp.type = 'bandpass'; bp.frequency.value = shForm[hi]; if (bp.Q) bp.Q.value = shQ[hi]; var fg = ctx.createGain(); fg.gain.value = shGn[hi]; fIn.connect(bp); bp.connect(fg); fg.connect(shG); }
        if (!hasBp) fIn.connect(shG);
        var nb = sharedNoise();                                            // breath(aspiration 气声)= 真人尖叫的"嘶"
        if (nb && ctx.createBufferSource) { var bs = ctx.createBufferSource(); bs.buffer = nb; var bbp = ctx.createBiquadFilter && ctx.createBiquadFilter(); if (bbp) { bbp.type = 'bandpass'; bbp.frequency.value = 2200; if (bbp.Q) bbp.Q.value = 1; } var bg = ctx.createGain(); bg.gain.value = 0.05; bs.connect(bbp || bg); if (bbp) bbp.connect(bg); bg.connect(shG); if (bs.start) bs.start(t); if (bs.stop) bs.stop(t + shDur); }
        glot.start(t); if (glot.stop) glot.stop(t + shDur);
        if (vib.start) vib.start(t); if (vib.stop) vib.stop(t + shDur);
        sub.start(t); if (sub.stop) sub.stop(t + shDur);
        if (shG.gain.setValueAtTime && shG.gain.linearRampToValueAtTime && shG.gain.exponentialRampToValueAtTime) { shG.gain.setValueAtTime(0.0001, t); shG.gain.linearRampToValueAtTime(0.3, t + 0.02); shG.gain.exponentialRampToValueAtTime(0.0001, t + shDur); }   // 极快起(惊叫)→ 衰(0.3=更响)
        return;
      }
      // ── horror-sting(增强 jump-scare;端用户"不够吓人"):高频噪声爆发(3ms 刺啦瞬态)+ 不协和簇(根/三全音/小二度,
      //    波形异质 saw/square + detune 拍频粗糙度)+ 多声部反向滑(Penderecki 楔形)+ sub-bass 下行 60→20Hz glissando + 65Hz body thump ──
      //   次声 20Hz 多数设备听不到(体感靠 65Hz thump);不 over-claim"次声震撼"(延续既有诚实)。增益守 ≤0.18 护栏防总线削波泵感(削波反削惊跳)。
      var dur2 = 0.7, base = 220;
      // 改①:高频噪声爆发——3ms 极速 attack 的"刺啦"瞬态 = jump-scare 命脉(沿用确定性 sharedNoise,非 Math.random)
      var nb = sharedNoise();
      if (nb && ctx.createBufferSource) {
        var ns = ctx.createBufferSource(); ns.buffer = nb;
        var nhp = ctx.createBiquadFilter && ctx.createBiquadFilter();
        if (nhp) {
          nhp.type = 'bandpass'; nhp.frequency.value = 4800; if (nhp.Q) nhp.Q.value = 1.4;   // 刺啦在 3-8kHz 敏感带
          if (nhp.frequency.setValueAtTime && nhp.frequency.exponentialRampToValueAtTime) { nhp.frequency.setValueAtTime(4800, t); nhp.frequency.exponentialRampToValueAtTime(1400, t + 0.12); }   // 下扫=尖啸下沉(scream 非线性)
        }
        var ng = ctx.createGain();
        ns.connect(nhp || ng); if (nhp) nhp.connect(ng); ng.connect(master);
        if (ns.start) ns.start(t);
        if (ng.gain.setValueAtTime) {
          ng.gain.setValueAtTime(0.0001, t);
          if (ng.gain.linearRampToValueAtTime) ng.gain.linearRampToValueAtTime(0.18, t + 0.003);   // 3ms 冲击(中高频"刺啦"=可闻命脉,顶护栏)
          if (ng.gain.exponentialRampToValueAtTime) ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        }
        if (ns.stop) ns.stop(t + 0.09);
      }
      var shaper2 = ctx.createWaveShaper && ctx.createWaveShaper();
      if (shaper2) shaper2.curve = makeDistortionCurve(300);            // 改③:k 140→300(对标 flesh-tear,更粗砺)
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 200;   // 旧 700→200:让低频透出
      var g2 = ctx.createGain(); g2.gain.value = 0.13;
      if (shaper2) shaper2.connect(hp); hp.connect(g2); g2.connect(master);
      var clusterIn = shaper2 || hp;
      var voices = [ { semi: 0, dir: -8, type: 'sawtooth', det: -9 }, { semi: 6, dir: 5, type: 'square', det: 8 }, { semi: 1, dir: -10, type: 'sawtooth', det: -13 } ];   // 改②:波形异质 + detune 拍频粗糙度(根/三全音 square/小二度)
      for (var v = 0; v < voices.length; v++) {
        var o = ctx.createOscillator(); o.type = voices[v].type;
        var f0 = semis(base, voices[v].semi), f1 = Math.max(40, semis(base, voices[v].semi + voices[v].dir));
        o.frequency.value = f0; if (o.detune) o.detune.value = voices[v].det;
        if (o.frequency.setValueAtTime && o.frequency.exponentialRampToValueAtTime) { o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur2); }
        o.connect(clusterIn); if (o.start) o.start(t); if (o.stop) o.stop(t + dur2);
      }
      // 改⑤(最高杠杆 · Arnal 2015):尖叫"粗糙度"= 30–150Hz 振幅调制,直击杏仁核(绕过听觉皮层;普通声只 4–5Hz 调制)。
      //   70Hz LFO 调制簇增益 g2.gain → 让不协和簇带上"人声尖叫"质感(同 flesh-tear 34Hz subharmonic LFO 先例)。
      if (ctx.createOscillator) {
        var rlfo = ctx.createOscillator(), rlg = ctx.createGain();
        rlfo.type = 'sawtooth'; rlfo.frequency.value = 70; rlg.gain.value = 0.06;   // 70Hz=粗糙度频段中段;深度 0.06(叠在 g2 包络上,峰≈0.17<护栏)
        rlfo.connect(rlg); rlg.connect(g2.gain); if (rlfo.start) rlfo.start(t); if (rlfo.stop) rlfo.stop(t + dur2);
      }
      var sub = ctx.createOscillator(), sg = ctx.createGain(); sub.type = 'sine'; sub.frequency.value = 60;   // 改④:sub-bass 下行 60→20Hz glissando(坠落/撞地;旁路 highpass 直入)
      if (sub.frequency.setValueAtTime && sub.frequency.exponentialRampToValueAtTime) { sub.frequency.setValueAtTime(60, t); sub.frequency.exponentialRampToValueAtTime(20, t + 0.22); }
      sg.gain.value = 0.10; sub.connect(sg); sg.connect(master); if (sub.start) sub.start(t); if (sub.stop) sub.stop(t + dur2);
      var thump = ctx.createOscillator(), tg = ctx.createGain(); thump.type = 'sine'; thump.frequency.value = 65;   // 改④:65Hz body thump(撞击体感,~100ms 短)
      thump.connect(tg); tg.connect(master); if (thump.start) thump.start(t); if (thump.stop) thump.stop(t + 0.12);
      if (tg.gain.setValueAtTime && tg.gain.exponentialRampToValueAtTime) { tg.gain.setValueAtTime(0.08, t); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); }
      if (g2.gain.setValueAtTime && g2.gain.exponentialRampToValueAtTime) { g2.gain.setValueAtTime(0.13, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur2); }
      if (sg.gain.setValueAtTime && sg.gain.exponentialRampToValueAtTime) { sg.gain.setValueAtTime(0.10, t); sg.gain.exponentialRampToValueAtTime(0.0001, t + dur2); }
    }
    // ── audio.music(表现力 C):作曲层 compose-music.js 排定发声。music 优先于 bgm;无 music → bgm 回落(向后兼容)。──
    // 浏览器每次使用时惰性回查 Amatlas，既支持后加载，也让首次缺依赖持续 fail-loud而不毒化 key。
    var CM = (typeof require !== 'undefined' && typeof module !== 'undefined')
      ? require('./compose-music')
      : null;
    function composer() {
      var c = CM || ((typeof globalThis !== 'undefined' ? globalThis : this).Amatlas || {});
      if (!c.composeMusic) throw new Error('[amatlas] audio.music 需要 presenters/compose-music.js —— 在 index.html 用 script 标签加载它（present-audio.js 之前或之后均可）。');
      return c;
    }
    // v14:MIDI 导入层(可选;audio.music = { midi:'<base64>' } 时用)。node 同目录 require;浏览器经 Amatlas。
    var MM = (typeof require !== 'undefined' && typeof module !== 'undefined')
      ? (function () { try { return require('./midi-music'); } catch (e) { return {}; } })()
      : ((typeof globalThis !== 'undefined' ? globalThis : this).Amatlas || {});
    var currentMusicKey = null, musicNodes = [], musicTimer = null, musicSession = 0, musicBus = null;   // session token 使已出队旧 timer 在换曲后也失效；musicBus:每曲一个总线 gain
    var musicDryBus = null, bassBus = null;   // 每曲干总线；bass 再经专属 trim 退到支撑位，鼓不受其影响
    var DRY_ROLES = { kick: 1, snare: 1, hihat: 1, timpani: 1, bass: 1 };   // 走干路的声部:噪声瞬态(鼓)+低频(bass 进混响=糊);drone/pad/lead/arp 保留混响空间感
    var currentAmbientKey = null;   // audio.ambient 变更检测键(字符串名 或 JSON.stringify(spec));与 music/bgm 并行独立
    /* ── v13 音色库(端用户实测:"风格变了音色没变,还是 8bit"——旧版全声部=单裸振荡器+指数衰减)。
       每声部专属节点图(调研双源核实参数,留痕 docs/expressiveness-upgrade.md):
       pad=detune 锯齿 unison+低通+慢 ADSR〔warm〕/ PeriodicWave 加法谐波 Hammond 拉杆〔organ〕/ 三角轻飘〔air〕;
       bass=锯齿低通滤波包络下扫 + 正弦 sub;pluck=Karplus-Strong 真拨弦(≤330Hz——spec 钳延迟环 ≥128 采样;
       高音转 2-op FM 拨弦感);lead=锯齿→WaveShaper sign 整形真 PWM + 0.28Hz 占空比 LFO 涌动〔pulse〕/ FM 铃〔bell〕/ 三角+锯齿混〔soft 默认〕;
       鼓=正弦 150Hz 指数扫频 kick(+噪声 click)/ 高通噪声+三角鼓体 snare / 7kHz 高通噪声 hihat(经典配方)。
       全部确定性排定(setValueAtTime/ramp/setTargetAtTime 与 osc.start(t) 同构);极简 mock 缺节点 → 逐级降级不崩。 */
    var noiseBuf = null, organWave = null, reedWave = null, noiseCtx = null, warnedPal = {};   // reedWave:lead-reed 单簧管奇次 PeriodicWave 缓存(镜像 organWave)
    function sharedNoise() {                       // 固定 44100 生成(跨设备同形,源 buffer 自动重采样)+ 种子 PRNG(确定性,同 makeReverbIR 思路)
      if (noiseCtx !== ctx) { noiseBuf = null; organWave = null; reedWave = null; noiseCtx = ctx; }   // ctx 切换 → 一并失效缓存的 PeriodicWave
      if (noiseBuf || !ctx.createBuffer) return noiseBuf;
      try {
        noiseBuf = ctx.createBuffer(1, 44100, 44100);
        if (noiseBuf.getChannelData) {
          var d = noiseBuf.getChannelData(0), s = 0x9e3779b9 >>> 0;
          for (var i = 0; i < d.length; i++) { s = (s + 0x6D2B79F5) | 0; var z = Math.imul(s ^ (s >>> 15), 1 | s); z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z; d[i] = (((z ^ (z >>> 14)) >>> 0) / 4294967296) * 2 - 1; }
        }
      } catch (e) { noiseBuf = null; }
      return noiseBuf;
    }
    function vOut() { return musicBus || master; }
    function vDry() { return musicDryBus || mDry || vOut(); }   // 干路出口:每曲干总线 > 全局干总线 > 退化回湿路(无 Convolver 时 mDry 不存在=无混响可躲,走原路零变化)
    function vBass() { return bassBus || vDry(); }              // 专属 trim 只在 mDry 存在时建；缺能力/无混响直接安全回旧路
    function richOut() { return richBus || master; }   // jump-scare 出口:提升总线优先(比背景响),缺失退化 master
    // ── A1 乐音声部立体声声场(沉浸感)──────────────────────────────────────────────
    // 各声部固定声像铺开空间:pad/bass/drone 居中(0,根基稳)、lead 偏右(+0.3)、arp 偏左(-0.3,与 lead 对称分离)、
    //   鼓微散开(kick 0 居中=低频不偏、snare +0.2、hihat -0.25)。复用 bgsPanner(pan) guard(缺 createStereoPanner → null → 直连退化)。
    //   panner 介于 voice 的 gain 与 vOut() 之间(g → panner → musicBus/master)→ 不破混响发送/换曲淡出链(仍经 vOut())。
    var VOICE_PAN = { pad: 0, bass: 0, drone: 0, lead: 0.3, arp: -0.3, kick: 0, snare: 0.2, hihat: -0.25, timpani: 0 };
    // MIDI CC10 声像可达硬 ±1(野外编曲常把声部摆得很开);**渲染层**收窄宽度,避免「独奏暴露段」偏一侧听感(如卡农交错进入:
    //   开头只有右摆的通奏低音独奏=明显偏右)同时保留合奏的左右分离。解析层 ev.pan 仍存**忠实** CC10(-1..+1),宽度是混音渲染选择。
    var MIDI_PAN_WIDTH = 0.6;
    var voiceRole = null;   // musicVoice 分发前置位 → voiceOut() 据此取声像(同步执行、无 async,安全)
    var voicePerformance = null;   // 当前合成事件的 presenter-private performance profile；同步分发后即被下一事件覆盖
    var midiPan = null;     // MIDI 事件显式声像(ev.pan,来自 CC10):非空时**覆盖** VOICE_PAN 角色表(per-channel 立体声铺开;作曲路恒 null=走角色表)
    // 取当前声部的声像出口:有 panner 能力 → 新建 panner(pan=VOICE_PAN[role] 或 MIDI 覆盖)→ vOut();缺失/居中 0 → 直连 vOut()(退化/字节经济)
    function voiceOut(role) {
      var rr = role != null ? role : voiceRole;
      var out = rr === 'bass' ? vBass() : DRY_ROLES[rr] ? vDry() : vOut();   // bass 再过专属 trim；打击仍只走干路
      var pan = (midiPan != null) ? midiPan * MIDI_PAN_WIDTH : VOICE_PAN[rr];   // MIDI 声像按宽度收窄(作曲路 VOICE_PAN 已是适中值、不收)
      if (!pan) return out;                            // 居中(0)或未知 role → 直连(向后兼容、不多建居中 panner)
      var pn = bgsPanner(pan);                          // 复用 BGS guard:缺 createStereoPanner → null
      if (!pn) return out;                              // 老浏览器/mock 无 panner → 直连退化
      pn.connect(out);                                  // panner → 对应总线(保换曲淡出链)
      return pn;
    }
    function perfValue(name, fallback) { var v = voicePerformance && voicePerformance[name]; return typeof v === 'number' ? v : fallback; }
    function mkOsc(type, freq, det) {
      var o = ctx.createOscillator(); o.type = type; if (freq > 0) o.frequency.value = freq;
      var center = det || 0, pitch = perfValue('pitch', 0);
      if (o.detune) o.detune.value = center;
      // 普通 lead 仅允许稀疏、不到半音的器乐滑入；缺 automation 保名义音高有声退化。
      if (pitch && o.detune && o.detune.setValueAtTime && o.detune.linearRampToValueAtTime) {
        try { o.detune.setValueAtTime(center + pitch, voicePerformance._start); o.detune.linearRampToValueAtTime(center, voicePerformance._start + 0.075); } catch (e) {}
      }
      return o;
    }
    function mkLp(freq, q) {
      if (!ctx.createBiquadFilter) return null;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq * perfValue('brightness', 1); if (f.Q) f.Q.value = (q == null ? 1 : q); return f;
    }
    // ADSR(调研⑤:锚点 setValueAtTime → linearRamp 到峰 → setTargetAtTime 衰到 S → hold 后 setTargetAtTime 0,τ=时长/3)
    function envADSR(g, t, peak, A, D, S, R, hold) {
      peak *= perfValue('gain', 1); A *= perfValue('attack', 1); R *= perfValue('release', 1); hold *= perfValue('duration', 1);
      var gg = g.gain;
      if (!gg || !gg.setValueAtTime || !gg.linearRampToValueAtTime) { if (gg) gg.value = peak * (S || 1); return; }
      try {
        gg.setValueAtTime(0, t);
        gg.linearRampToValueAtTime(peak, t + A);
        if (gg.setTargetAtTime) {
          if (S < 1) gg.setTargetAtTime(S * peak, t + A, Math.max(0.01, D / 3));
          gg.setTargetAtTime(0, t + hold, Math.max(0.02, R / 3));
        } else if (gg.exponentialRampToValueAtTime) {   // 极简 mock 无 setTargetAtTime → 指数近似(不能到 0,用 0.0001)
          gg.exponentialRampToValueAtTime(Math.max(0.0001, S * peak), t + A + Math.max(0.01, D));
          gg.exponentialRampToValueAtTime(0.0001, t + hold + R);
        }
      } catch (e) { gg.value = peak; }
    }
    function vibrato(t, targets) {                  // 延迟颤音:5.5Hz ±6 cents,起音 0.12s 后渐入(直上颤音=廉价感)
      var lfo = mkOsc('sine', 5.5), lg = ctx.createGain(); lg.gain.value = 0;
      if (lg.gain.setValueAtTime && lg.gain.linearRampToValueAtTime) { try { lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(6, t + 0.35); } catch (e) {} } else lg.gain.value = 6;
      lfo.connect(lg);
      for (var i = 0; i < targets.length; i++) { if (targets[i].detune) { try { lg.connect(targets[i].detune); } catch (e) {} } }
      lfo.start(t); return lfo;
    }
    function padVoice(t, dur, freq, peak, pal) {
      if (pal === 'organ') {                        // Hammond 拉杆 868800004 教堂感(谐波下标=16' 系,基频减半)
        var o = ctx.createOscillator(); o.frequency.value = freq / 2;
        if (ctx.createPeriodicWave && o.setPeriodicWave) {
          try {
            if (!organWave) { var re = new Float32Array(17), im = new Float32Array(17); im[1] = 1; im[2] = 0.5; im[3] = 1; im[4] = 1; im[16] = 0.25; organWave = ctx.createPeriodicWave(re, im); }
            o.setPeriodicWave(organWave);
          } catch (e) { o.type = 'sine'; o.frequency.value = freq; }
        } else { o.type = 'sine'; o.frequency.value = freq; }
        var g = ctx.createGain(); o.connect(g); g.connect(voiceOut());
        envADSR(g, t, peak * 1.15, 0.02, 0.1, 1, 0.15, dur * 0.92);
        o.start(t); o.stop(t + dur + 0.6); musicNodes.push(o);
        return;
      }
      if (pal === 'choir') {                        // 人声合唱:多锯齿宽失谐 unison + 并联 bandpass 共振峰(formant "ah")+ 慢攻长释 + 复用 vibrato 颤音
        var ctypes = ['sawtooth', 'sawtooth', 'sawtooth'], cdets = [0, 12, -12];   // 更宽 detune=多人不齐
        var cg = ctx.createGain(); cg.connect(voiceOut());
        var formants = [], centers = [600, 1040, 2250];   // F1/F2/F3 元音 "ah"(Csound Appendix D)
        if (ctx.createBiquadFilter) {
          for (var ci = 0; ci < centers.length; ci++) {
            try { var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = centers[ci]; if (bp.Q) bp.Q.value = 5; bp.connect(cg); formants.push(bp); } catch (e) {}
          }
        }
        var cdest = formants.length ? formants : [mkLp(1400, 1)];   // 无 bandpass → 退化 lowpass 1400(有声基线)
        if (!formants.length && cdest[0]) cdest[0].connect(cg);
        var coscs = [];
        for (var cj = 0; cj < ctypes.length; cj++) {
          var co = mkOsc(ctypes[cj], freq, cdets[cj]), cog = ctx.createGain(); cog.gain.value = 1 / ctypes.length;
          co.connect(cog);
          for (var ck = 0; ck < cdest.length; ck++) { if (cdest[ck]) cog.connect(cdest[ck]); }   // 各 osc fan-out 到所有 formant(或退化 lowpass)
          co.start(t); co.stop(t + dur + 1.4); musicNodes.push(co); coscs.push(co);
        }
        var clfo = vibrato(t, coscs); clfo.stop(t + dur + 1.4); musicNodes.push(clfo);   // 颤音(随声部停)
        envADSR(cg, t, peak, Math.min(1.0, dur * 0.35), 0.4, 0.8, 1.4, dur * 0.9);   // 慢攻长释高 sustain
        return;
      }
      if (pal === 'glass') {                        // 玻璃晶莹:三角+正弦底色 + 第三层高八度 shimmer + 轻 chorus 失谐 + 高截止低通(5000Hz 保亮)+ 慢攻长释高 sustain
        var gtypes = ['triangle', 'sine', 'sine'], gdets = [0, -4, 4], gocts = [1, 1, 2];   // 第3层高八度 shimmer
        var gf = mkLp(5000, 0.5), gg2 = ctx.createGain();   // 高截止保亮(air 偏暗无高八度)
        if (gf) gf.connect(gg2); gg2.connect(voiceOut());
        for (var gi = 0; gi < gtypes.length; gi++) {
          var go2 = mkOsc(gtypes[gi], freq * gocts[gi], gdets[gi]), gog = ctx.createGain();
          gog.gain.value = (gocts[gi] === 2 ? 0.5 : 1) / gtypes.length;   // 高八度 gain 略弱=高光不刺
          go2.connect(gog); gog.connect(gf || gg2);
          go2.start(t); go2.stop(t + dur + 1.2); musicNodes.push(go2);
        }
        envADSR(gg2, t, peak, Math.min(0.9, dur * 0.3), 0.4, 0.85, 1.2, dur * 0.9);
        return;
      }
      var air = (pal === 'air'), strings = (pal === 'strings');
      var types = air ? ['triangle', 'sine'] : ['sawtooth', 'sawtooth', 'sawtooth'];
      var dets = air ? [0, 6] : strings ? [0, 7, -7] : [0, 5, -5];   // strings 板 detune 略宽=合奏感
      var f = mkLp(air ? 1600 : strings ? 1400 : 750, strings ? 0 : 1), g = ctx.createGain();
      if (f) f.connect(g); g.connect(voiceOut());
      for (var i = 0; i < types.length; i++) {
        var o = mkOsc(types[i], freq, dets[i]), og = ctx.createGain(); og.gain.value = 1 / types.length;
        o.connect(og); og.connect(f || g);
        o.start(t); o.stop(t + dur + 1.2); musicNodes.push(o);
      }
      envADSR(g, t, peak, Math.min(strings ? 1.2 : 0.9, dur * (strings ? 0.35 : 0.3)), 0.4, 0.8, strings ? 1.4 : 1.0, dur * 0.9);
    }
    function bassVoice(t, dur, freq, peak, pal) {   // 锯齿低通下扫(1200→基频上方,0.15s)+ 正弦 sub = 有体有皮
      if (pal === 'sub') {                          // sub-bass:纯正弦(无谐波→低通无效,与默认锯齿+下扫对立)+ 八度下 808 + 轻 WaveShaper 软饱和;慢攻高 sustain
        var o0 = mkOsc('sine', freq), sub0 = mkOsc('sine', freq / 2), sg0 = ctx.createGain(); sg0.gain.value = 0.5;
        var g0 = ctx.createGain();
        var shaper = (ctx.createWaveShaper) ? (function () { try { var s = ctx.createWaveShaper(); s.curve = makeDistortionCurve(8); return s; } catch (e) { return null; } })() : null;   // k≈8 克制软饱和;缺能力→跳过直连
        if (shaper) { o0.connect(shaper); shaper.connect(g0); } else { o0.connect(g0); }   // shaper 缺失 → 直连(有声基线)
        sub0.connect(sg0); sg0.connect(g0); g0.connect(voiceOut());
        envADSR(g0, t, peak, 0.012, 0.18, 0.85, 0.18, dur * 0.85);
        o0.start(t); sub0.start(t); o0.stop(t + dur + 0.4); sub0.stop(t + dur + 0.4);
        musicNodes.push(o0); musicNodes.push(sub0);
        return;
      }
      if (pal === 'organ') {                        // 管风琴踏板(16′ Bourdon):复用 organWave 作 16′(freq 不减半=踏板已在 bass 域)+ 8′ 加固(高八度正弦)+ 连续供风 S=1 全持续
        var o16 = ctx.createOscillator(); o16.frequency.value = freq;
        if (ctx.createPeriodicWave && o16.setPeriodicWave) {
          try {
            if (!organWave) { var re = new Float32Array(17), im = new Float32Array(17); im[1] = 1; im[2] = 0.5; im[3] = 1; im[4] = 1; im[16] = 0.25; organWave = ctx.createPeriodicWave(re, im); }
            o16.setPeriodicWave(organWave);
          } catch (e) { o16.type = 'sine'; }        // 能力失效 → 退回正弦(有声基线)
        } else { o16.type = 'sine'; }
        var o8 = mkOsc('sine', freq * 2), o8g = ctx.createGain(); o8g.gain.value = 0.5;   // 8′ 高八度加固
        var go = ctx.createGain(); o16.connect(go); o8.connect(o8g); o8g.connect(go); go.connect(voiceOut());
        envADSR(go, t, peak, 0.02, 0.1, 1, 0.12, dur * 0.92);   // S=1=按住即满音量持续(对比默认 bass S0.7+下扫)
        o16.start(t); o8.start(t); o16.stop(t + dur + 0.4); o8.stop(t + dur + 0.4);
        musicNodes.push(o16); musicNodes.push(o8);
        return;
      }
      // ── batch 5 扩 bass 音色板(4 个;曲风派生默认或作者 timbre.bass 选)。全复用现有工具函数(mkOsc/mkLp/envADSR/makeDistortionCurve/sharedNoise),零新接口,缺能力降级有声。 ──
      if (pal === 'upright') {   // 原声贝斯(jazz/noir):Karplus-Strong 拨弦(复用 pluckVoice KS 路;bass 域 freq≤330 走 KS 主路;无 createDelay → FM 拨弦降级)+ 同频正弦 sub 补体感;快攻无 sustain=木质拨奏
        var nbU = sharedNoise();
        if (ctx.createDelay && nbU && freq > 0 && freq <= 330) {
          var srcU = ctx.createBufferSource(); srcU.buffer = nbU;
          var burU = ctx.createGain();
          var dlU = ctx.createDelay(0.05); if (dlU.delayTime) dlU.delayTime.value = 1 / freq + 60 / 44100;
          var fbU = ctx.createGain(); fbU.gain.value = 0.965;   // <0.999 防自激;短延音
          var lpU = mkLp(Math.min(2200, freq * 5), -6);          // -6dB Q=过阻尼无峰(防 KTV 啸叫,沿 pluckVoice 注释)
          var gU = ctx.createGain();
          srcU.connect(burU); burU.connect(lpU || gU); if (lpU) lpU.connect(gU);
          gU.connect(dlU); dlU.connect(fbU); fbU.connect(gU);   // KS 反馈环
          gU.connect(voiceOut());
          var subU = mkOsc('sine', freq), sgU = ctx.createGain(); sgU.gain.value = 0.3; subU.connect(sgU); sgU.connect(voiceOut());
          // burst:10ms 噪声激励;envADSR 整体快衰
          if (burU.gain.setValueAtTime) { try { burU.gain.setValueAtTime(peak, t); burU.gain.exponentialRampToValueAtTime(0.0001, t + 0.01); } catch (e) {} }
          envADSR(sgU, t, peak * 0.3, 0.003, 0.12, 0, 0.15, dur * 0.85);
          if (fbU.gain.setTargetAtTime) { try { fbU.gain.setTargetAtTime(0, t + dur, 0.1); } catch (e) {} }   // 杀环防泄漏
          srcU.start(t); subU.start(t); srcU.stop(t + dur + 0.4); subU.stop(t + dur + 0.4);
          musicNodes.push(srcU); musicNodes.push(subU);
          return;
        }
        // 降级:无 delay → 走默认锯齿(有声基线)
      }
      if (pal === 'picked') {   // 电贝斯(rock/funk/march):三角主 + 高八度锯齿弱叠 + 滤波上扫 bite + 轻软饱和;中频拨弦感,有存在不轰低频
        var oP = mkOsc('triangle', freq), o2P = mkOsc('sawtooth', freq * 2), o2gP = ctx.createGain(); o2gP.gain.value = 0.25;
        var fP = mkLp(800, 1.5), gP = ctx.createGain();
        var shP = (ctx.createWaveShaper) ? (function () { try { var s = ctx.createWaveShaper(); s.curve = makeDistortionCurve(12); return s; } catch (e) { return null; } })() : null;
        if (fP) { if (shP) { fP.connect(shP); shP.connect(gP); } else { fP.connect(gP); }
          if (fP.frequency.setValueAtTime && fP.frequency.exponentialRampToValueAtTime) { try { fP.frequency.setValueAtTime(800, t); fP.frequency.exponentialRampToValueAtTime(2000, t + 0.04); } catch (e) {} } }
        else { if (shP) shP.connect(gP); }
        oP.connect(fP || (shP || gP)); o2P.connect(o2gP); o2gP.connect(fP || (shP || gP));
        gP.connect(voiceOut());
        envADSR(gP, t, peak, 0.006, 0.18, 0.55, 0.22, dur * 0.85);
        oP.start(t); o2P.start(t); oP.stop(t + dur + 0.4); o2P.stop(t + dur + 0.4);
        musicNodes.push(oP); musicNodes.push(o2P);
        return;
      }
      if (pal === 'synth') {   // 合成器贝斯(synthwave/chase/tense):方波 + 短滤波 sweep(克制版,比默认柔)+ 正弦 sub;电子感但不喧宾
        var oS = mkOsc('square', freq), fS = mkLp(800, 1.5), gS = ctx.createGain();
        if (fS) { fS.connect(gS); if (fS.frequency.setValueAtTime && fS.frequency.exponentialRampToValueAtTime) { try { fS.frequency.setValueAtTime(800, t); fS.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 1.2), t + 0.08); } catch (e) {} } }
        gS.connect(voiceOut());
        oS.connect(fS || gS);
        var subS = mkOsc('sine', freq), sgS = ctx.createGain(); sgS.gain.value = 0.5; subS.connect(sgS); sgS.connect(gS);
        envADSR(gS, t, peak, 0.005, 0.18, 0.75, 0.2, dur * 0.85);
        oS.start(t); subS.start(t); oS.stop(t + dur + 0.4); subS.stop(t + dur + 0.4);
        musicNodes.push(oS); musicNodes.push(subS);
        return;
      }
      if (pal === 'sine-pluck') {   // 柔拨(ballad/romance/calm):正弦 body + 极快 FM burst(50ms 起音后消退)；拨感克制，但 pedal 仍须托住低频根基
        var oSP = mkOsc('sine', freq), modSP = mkOsc('sine', freq * 2), mgSP = ctx.createGain();
        var fSP = mkLp(Math.max(120, freq * 3), 0.5), gSP = ctx.createGain();
        mgSP.gain.value = freq * 1.8; modSP.connect(mgSP);
        if (mgSP.gain.setValueAtTime) { try { mgSP.gain.setValueAtTime(Math.max(0.01, freq * 1.8), t); mgSP.gain.exponentialRampToValueAtTime(Math.max(0.01, freq * 0.02), t + 0.05); } catch (e) {} }
        if (oSP.frequency) mgSP.connect(oSP.frequency);   // FM:mod → carrier.frequency
        if (fSP) { fSP.connect(gSP); oSP.connect(fSP); } else { oSP.connect(gSP); }
        gSP.connect(voiceOut());
        envADSR(gSP, t, peak, 0.002, 0.1, 0.48, 0.12, dur * 0.85);
        oSP.start(t); modSP.start(t); oSP.stop(t + dur + 0.4); modSP.stop(t + dur + 0.4);
        musicNodes.push(oSP); musicNodes.push(modSP);
        return;
      }
      // 默认锯齿 bass(batch 5 柔化):起始 1200→700Hz(去中高频亮刺)、Q 4→2(共振峰减半)、下扫 1.6x/0.15s→1.4x/0.09s(坡缓)、attack 0.01→0.02(与 sub 同级)。
      //   端用户实测:旧参数那记"咚"喧宾夺主、盖过和弦/旋律多变让 bgm 听感全一样。柔化后"咚"变"颠",保留低音 body 但不抢主音。sub/organ 分支(无下扫)不受影响。
      var f = mkLp(700, 2), g = ctx.createGain();
      if (f) { f.connect(g); if (f.frequency.setValueAtTime && f.frequency.exponentialRampToValueAtTime) { try { f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(Math.max(100, freq * 1.4), t + 0.09); } catch (e) {} } }
      g.connect(voiceOut());
      var o = mkOsc('sawtooth', freq); o.connect(f || g);
      var sub = mkOsc('sine', freq), sg = ctx.createGain(); sg.gain.value = 0.6; sub.connect(sg); sg.connect(g);
      envADSR(g, t, peak, 0.02, 0.2, 0.7, 0.2, dur * 0.85);
      o.start(t); sub.start(t); o.stop(t + dur + 0.4); sub.stop(t + dur + 0.4);
      musicNodes.push(o); musicNodes.push(sub);
    }
    function pluckVoice(t, dur, freq, peak, pal) {
      var harp = (pal === 'harp');                              // 竖琴板:柔 burst(低 cutoff)+ 长延音(fb 0.99)
      var nb = sharedNoise();
      if (ctx.createDelay && nb && freq > 0 && freq <= 330) {   // Karplus-Strong 真拨弦(延迟环被 spec 钳 ≥128 采样 → 高音走 FM)
        var src = ctx.createBufferSource(); src.buffer = nb;
        var burst = ctx.createGain();
        var dl = ctx.createDelay(0.05); if (dl.delayTime) dl.delayTime.value = 1 / freq + 60 / 44100;   // 音准经验修正(ryukau)
        var fb = ctx.createGain(); fb.gain.value = harp ? 0.99 : 0.985;   // <0.999 防失控;越大延音越长
        // ⚠️ 环内滤波 Q 必须 ≤0(Web Audio lowpass 的 Q 单位是 **dB 共振量**!正值=截止频率处增益>1 →
        //   环路增益 0.985×10^(Q/20) > 1 = 自激啸叫——端用户实测"KTV 麦克风怼音箱"正是此 bug;-6dB=过阻尼无峰)。
        var lpf = mkLp(harp ? Math.min(2500, freq * 6) : Math.min(6000, freq * 8), -6);   // cutoff≈f0*8 亮=古筝/钢弦;harp 低 cutoff=尼龙柔
        var g = ctx.createGain();
        src.connect(burst); burst.connect(dl);
        dl.connect(lpf || fb); if (lpf) lpf.connect(fb);
        try { fb.connect(dl); } catch (e) {}                    // 反馈环(环内必须有 DelayNode)
        fb.connect(g); g.connect(voiceOut());
        if (burst.gain.setValueAtTime && burst.gain.setTargetAtTime) { try { burst.gain.setValueAtTime(1, t); burst.gain.setTargetAtTime(0, t + 0.01, 0.004); } catch (e) {} } else burst.gain.value = 1;   // 10ms 噪声 burst
        if (fb.gain.setTargetAtTime) { try { fb.gain.setTargetAtTime(0, t + Math.min(dur, 1.2), 0.05); } catch (e) {} }   // 杀环(KS 是活反馈,不能只靠 stop)
        envADSR(g, t, peak * 1.3, 0.002, Math.min(dur, 0.8), 0.25, 0.2, Math.min(dur, 1.2));
        src.start(t); if (src.stop) src.stop(t + 0.06);
        musicNodes.push(src);
        return;
      }
      // FM 拨弦感(1:1 调制短爆 + 快衰;高音/无 delay 能力时的同族音色;harp 板 index 更低=更柔)
      var car = mkOsc('sine', freq), mod = mkOsc('sine', freq), mg = ctx.createGain();
      mg.gain.value = freq * (harp ? 1.2 : 2);                   // index 2 / harp 1.2
      mod.connect(mg); try { if (car.frequency && mg.connect) mg.connect(car.frequency); } catch (e) {}
      if (mg.gain.setTargetAtTime) { try { mg.gain.setTargetAtTime(0, t, 0.04); } catch (e) {} }   // 调制 50ms 内消失=拨弦"叮"
      var g = ctx.createGain(); car.connect(g); g.connect(voiceOut());
      envADSR(g, t, peak * 1.15, 0.003, 0.18, 0.05, 0.15, Math.min(dur, 0.5) * 0.9);
      car.start(t); mod.start(t); car.stop(t + dur + 0.4); mod.stop(t + dur + 0.4);
      musicNodes.push(car); musicNodes.push(mod);
    }
    function bellVoice(t, dur, freq, peak) {        // 2-op FM 铃:ratio 1.4 圆润,index 6 指数衰减=亮→纯
      var car = mkOsc('sine', freq), mod = mkOsc('sine', freq * 1.4), mg = ctx.createGain();
      mg.gain.value = freq * 1.4 * 6;
      mod.connect(mg); try { if (car.frequency && mg.connect) mg.connect(car.frequency); } catch (e) {}
      if (mg.gain.setValueAtTime && mg.gain.exponentialRampToValueAtTime) { try { mg.gain.setValueAtTime(freq * 1.4 * 6, t); mg.gain.exponentialRampToValueAtTime(0.0001, t + 1.6); } catch (e) {} }
      var g = ctx.createGain(); car.connect(g); g.connect(voiceOut());
      if (g.gain.setValueAtTime && g.gain.linearRampToValueAtTime && g.gain.setTargetAtTime) {
        try { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.005); g.gain.setTargetAtTime(0, t + 0.01, 0.5); } catch (e) {}
      } else g.gain.value = peak;
      car.start(t); mod.start(t); car.stop(t + 2.0); mod.stop(t + 2.0);
      musicNodes.push(car); musicNodes.push(mod);
    }
    function kalimbaVoice(t, dur, freq, peak) {     // 卡林巴/姆比拉拨片体鸣:2-op FM 非整数比≈4.8(逼近 5x 主泛音=非谐金属)+ index 快衰(亮→暖"叮")+ 极快攻短衰近无 sustain + 拇指 click(noiseHit 高通)
      var car = mkOsc('sine', freq), mod = mkOsc('sine', freq * 4.8), mg = ctx.createGain();
      mg.gain.value = freq * 4.8 * 1.2;             // index 1.2 稀疏金属(< bell 的 6)
      mod.connect(mg); try { if (car.frequency && mg.connect) mg.connect(car.frequency); } catch (e) {}
      if (mg.gain.setValueAtTime && mg.gain.exponentialRampToValueAtTime) { try { mg.gain.setValueAtTime(freq * 4.8 * 1.2, t); mg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); } catch (e) {} }   // index 指数衰到 0.35s
      var g = ctx.createGain(); car.connect(g); g.connect(voiceOut());
      envADSR(g, t, peak * 1.15, 0.002, Math.min(dur, 0.45), 0.04, 0.18, Math.min(dur, 0.45) * 0.9);   // 极快攻短衰近无 sustain
      car.start(t); mod.start(t); car.stop(t + dur + 0.4); mod.stop(t + dur + 0.4);
      musicNodes.push(car); musicNodes.push(mod);
      noiseHit(t, 0.015, 3500, peak * 0.35, 'highpass');   // 拇指 click(可降级)
    }
    // 定音鼓/太鼓/旋律鼓(音高膜鸣):4 正弦谐振模(壶鼓膜 (1,1):(2,1):(3,1):(4,1) 非谐比 1/1.5/1.98/2.44)+ 权 5:4:3:1
    //   + **模差衰减**(基音最长=音高在 (1,1) 模上听得清、高模快死)+ 击打瞬间**向下滑音**(硬击使膜变硬→模频升、随振幅松弛回落=定音鼓签名)
    //   + 高通噪声起音瞬态。全确定性(setValueAtTime/ramp + 种子 noiseHit);mock 无 ramp 能力 → 停在名义频率不崩。来源:Sound on Sound《Practical Percussion Synthesis: Timpani》。
    function timpaniVoice(t, dur, freq, peak) {
      var ratios = [1.00, 1.50, 1.98, 2.44], wts = [1.0, 0.8, 0.6, 0.2], decw = [1.0, 0.7, 0.55, 0.45];
      var base = freq > 0 ? freq : 147;                    // 理论上 MIDI 必带音高;兜底 D3
      var decay0 = Math.min(1.4, Math.max(0.25, dur * 1.6));   // 基音衰减(上限 1.4s 受 12s 调度窗约束)
      var bus = ctx.createGain(); bus.connect(voiceOut());     // 单总线 → 一次 voiceOut()=一个 panner(MIDI 声像/居中)
      for (var i = 0; i < ratios.length; i++) {
        var pf = base * ratios[i], o = mkOsc('sine', pf), pg = ctx.createGain();
        if (o.frequency.setValueAtTime && o.frequency.exponentialRampToValueAtTime) {   // 向下滑音:+~2 半音起音 → 名义,60ms;mock 无能力→停名义(可测)
          try { o.frequency.setValueAtTime(pf * 1.15, t); o.frequency.exponentialRampToValueAtTime(pf, t + 0.06); } catch (e) {}
        }
        o.connect(pg); pg.connect(bus);
        var d = decay0 * decw[i];
        envADSR(pg, t, peak * wts[i], 0.002, d, 0, d, 0.002);   // 快攻 / 无 sustain / 指数衰(高模衰更快=模差)
        o.start(t); o.stop(t + d + 0.2); musicNodes.push(o);
      }
      noiseHit(t, 0.018, Math.max(800, base * 2.5), peak * 0.4, 'highpass');   // 膜击瞬态(可降级)
    }
    // 无词吟咏(chant-timbre-design):tenor a/e/i/o/u 的 F1-F3〔freq Hz,relative dB,bw Hz〕。
    // 来源:Csound Appendix D Formant Values。只合成元音 articulation，不生成歌词/语言，也不冒称 Gregorian chant。
    var CHANT_VOWELS = {
      a: [[650, 0, 80], [1080, -6, 90], [2650, -7, 120]],
      e: [[400, 0, 70], [1700, -14, 80], [2600, -12, 100]],
      i: [[290, 0, 40], [1870, -15, 90], [2800, -18, 100]],
      o: [[400, 0, 70], [800, -10, 80], [2600, -12, 100]],
      u: [[350, 0, 40], [600, -20, 60], [2700, -17, 100]]
    };
    var CHANT_CONTOURS = [['a', 'o'], ['o', 'u'], ['e', 'a'], ['i', 'e']];
    function dbGain(db) { return Math.pow(10, db / 20); }
    function chantHash(phraseT, dur, freq) {           // 所有吟咏变化共用段内事件身份；绝不读 AudioContext 绝对时钟
      var a = Math.round(freq * 100), b = Math.round((phraseT || 0) * 1000), c = Math.round(dur * 1000);
      return (Math.imul(a, 31) ^ Math.imul(b, 131) ^ Math.imul(c, 17)) >>> 0;
    }
    function chantContour(phraseT, dur, freq) { return CHANT_CONTOURS[chantHash(phraseT, dur, freq) % CHANT_CONTOURS.length]; }
    function chantOrnament(phraseT, dur, freq) {        // 稀疏内建演唱法:约每 5-8 音一记；段首/短音保持干净
      if (dur < 0.55 || !phraseT) return null;
      var pick = ((chantHash(phraseT, dur, freq) ^ Math.imul(16, 0x9e37)) >>> 0) % 10;
      if (pick === 0) return 'scoop';                  // 下倚音:-140c → 主音,约 110ms
      if (pick === 1 && dur >= 0.85) return 'turn';    // 长音上回音:0 → +160c → 0,约 140ms
      return null;
    }
    function applyChantOrnament(oscs, kind, t, dur) {
      if (!kind) return;
      for (var i = 0; i < oscs.length; i++) {
        var p = oscs[i].detune;
        if (!p || !p.setValueAtTime || !p.linearRampToValueAtTime) continue;
        try {
          var center = (typeof p.value === 'number') ? p.value : 0;   // 保住副声门源原有 +4c，不让转音收束后两源塌成同音
          if (kind === 'scoop') { p.setValueAtTime(center - 140, t); p.linearRampToValueAtTime(center, t + Math.min(0.11, dur * 0.22)); }
          else { var mid = t + Math.min(dur * 0.58, Math.max(0.34, dur * 0.48)); p.setValueAtTime(center, mid); p.linearRampToValueAtTime(center + 160, mid + 0.07); p.linearRampToValueAtTime(center, mid + 0.14); }
        } catch (e) {}                                  // 无 detune automation → 只保原 chant + vibrato
      }
    }
    function chantVoice(t, dur, freq, peak, phraseT) {
      var contour = chantContour(phraseT, dur, freq), from = CHANT_VOWELS[contour[0]], to = CHANT_VOWELS[contour[1]];
      var out = ctx.createGain(); out.connect(voiceOut());
      var source = ctx.createGain(), o1 = mkOsc('sawtooth', freq), o2 = mkOsc('triangle', freq, 4);
      var o1g = ctx.createGain(), o2g = ctx.createGain(); o1g.gain.value = 0.65; o2g.gain.value = 0.35;
      o1.connect(o1g); o2.connect(o2g); o1g.connect(source); o2g.connect(source);
      var formed = false, transitionAt = t + dur * 0.35, arrivedAt = t + dur * 0.70;
      if (ctx.createBiquadFilter) {
        for (var fi = 0; fi < 3; fi++) {
          try {
            var bp = ctx.createBiquadFilter(), fg = ctx.createGain(); bp.type = 'bandpass';
            var f0 = from[fi][0], f1 = to[fi][0], q0 = f0 / from[fi][2], q1 = f1 / to[fi][2];
            var a0 = dbGain(from[fi][1]), a1 = dbGain(to[fi][1]);
            bp.frequency.value = f0; if (bp.Q) bp.Q.value = q0; fg.gain.value = a0;
            // ≥0.22s 才做双元音：前 35% 稳态，中间 35% 平滑换口型，尾部保持；短音固定首元音。
            if (dur >= 0.22 && bp.frequency.setValueAtTime && bp.frequency.linearRampToValueAtTime) {
              bp.frequency.setValueAtTime(f0, t); bp.frequency.setValueAtTime(f0, transitionAt); bp.frequency.linearRampToValueAtTime(f1, arrivedAt);
              if (bp.Q && bp.Q.setValueAtTime && bp.Q.linearRampToValueAtTime) { bp.Q.setValueAtTime(q0, t); bp.Q.setValueAtTime(q0, transitionAt); bp.Q.linearRampToValueAtTime(q1, arrivedAt); }
              if (fg.gain.setValueAtTime && fg.gain.linearRampToValueAtTime) { fg.gain.setValueAtTime(a0, t); fg.gain.setValueAtTime(a0, transitionAt); fg.gain.linearRampToValueAtTime(a1, arrivedAt); }
            }
            source.connect(bp); bp.connect(fg); fg.connect(out); formed = true;
          } catch (e) { /* 单个 formant 能力失败 → 其余照建；全失败时下方退化直连 */ }
        }
      }
      if (!formed) source.connect(out);                // 无 filter → 双声门源有声基线；不伪装仍有元音 articulation
      applyChantOrnament([o1, o2], chantOrnament(phraseT, dur, freq), t, dur);   // 大幅转音与下方微幅 vibrato 在 detune 参数上相加
      var vlfo = vibrato(t, [o1, o2]);
      var attack = Math.min(0.09, Math.max(0.05, dur * 0.18)), release = Math.min(0.45, Math.max(0.25, dur * 0.4));
      envADSR(out, t, peak * 0.5, attack, 0.12, 0.8, release, Math.max(0.08, dur * 0.88));   // formant 并联留 headroom，避免压缩器泵动
      o1.start(t); o2.start(t); o1.stop(t + dur + release); o2.stop(t + dur + release); vlfo.stop(t + dur + release);
      musicNodes.push(o1); musicNodes.push(o2); musicNodes.push(vlfo);
    }
    function leadVoice(t, dur, freq, peak, pal, phraseT) {
      if (pal === 'chant') return chantVoice(t, dur, freq, peak, phraseT);
      if (pal === 'bell') return bellVoice(t, dur, freq, peak);
      if (pal === 'pluck' || pal === 'harp') return pluckVoice(t, dur, freq, peak, pal);
      if (pal === 'flute') {                        // 长笛:近正弦基波(sine 主+微失谐)+ 暖低通 + 5Hz 亮度颤音(LFO→filter.frequency,非音高;无 filter 退回 vibrato)+ 极轻气声 chiff
        var ffl = mkLp(Math.max(1100, freq * 4), 0.7), gfl = ctx.createGain();
        if (ffl) ffl.connect(gfl); gfl.connect(voiceOut());
        var fo1 = mkOsc('sine', freq), fo2 = mkOsc('sine', freq, 5), fg2 = ctx.createGain(); fg2.gain.value = 0.35;
        fo1.connect(ffl || gfl); fo2.connect(fg2); fg2.connect(ffl || gfl);
        var fluteLfos = [];
        if (ffl && ffl.frequency && ffl.frequency.value != null) {   // 亮度颤音:5Hz LFO → filter.frequency(气流亮度,不弯音高)
          var blfo = mkOsc('sine', 5), blg = ctx.createGain(), bdep = Math.max(120, freq * 0.6);
          if (blg.gain.setValueAtTime && blg.gain.linearRampToValueAtTime) { try { blg.gain.setValueAtTime(0, t); blg.gain.linearRampToValueAtTime(bdep, t + 0.4); } catch (e) { blg.gain.value = bdep; } } else blg.gain.value = bdep;
          blfo.connect(blg); try { blg.connect(ffl.frequency); } catch (e) {}
          blfo.start(t); blfo.stop(t + dur + 0.5); musicNodes.push(blfo); fluteLfos.push(blfo);
        } else {                                    // 无 filter 能力 → 退回音高 vibrato(有声基线)
          var vlfo = vibrato(t, [fo1, fo2]); vlfo.stop(t + dur + 0.5); musicNodes.push(vlfo); fluteLfos.push(vlfo);
        }
        var nbf = sharedNoise();                    // 气声 chiff:attack-gated 噪声带通,~80ms 衰掉
        if (nbf && ctx.createBufferSource) {
          var csrc = ctx.createBufferSource(); csrc.buffer = nbf;
          var cbp = mkLp(Math.max(1600, freq * 3), 0.5), cg2 = ctx.createGain(); cg2.gain.value = peak * 0.06;
          csrc.connect(cbp || cg2); if (cbp) cbp.connect(cg2); cg2.connect(voiceOut());
          if (cg2.gain.setValueAtTime && cg2.gain.setTargetAtTime) { try { cg2.gain.setValueAtTime(peak * 0.06, t); cg2.gain.setTargetAtTime(0, t, 0.025); } catch (e) {} }
          csrc.start(t); if (csrc.stop) csrc.stop(t + 0.12); musicNodes.push(csrc);
        }
        envADSR(gfl, t, peak, 0.06, 0.05, 0.85, 0.16, dur * 0.9);   // 柔起音高 sustain
        fo1.start(t); fo2.start(t); fo1.stop(t + dur + 0.5); fo2.stop(t + dur + 0.5);
        musicNodes.push(fo1); musicNodes.push(fo2);
        return;
      }
      if (pal === 'reed') {                          // 单簧管:闭管奇次列 1:3:5:7(偶次强衰=空心木质)→ 显式奇次 PeriodicWave(reedWave,镜像 organWave)+ 带通木质共振峰 + 适中起音高 sustain
        var ro1 = ctx.createOscillator(); ro1.frequency.value = freq;
        if (ctx.createPeriodicWave && ro1.setPeriodicWave) {
          try {
            if (!reedWave) { var rre = new Float32Array(9), rim = new Float32Array(9); rim[1] = 1; rim[3] = 1 / 3; rim[5] = 1 / 5; rim[7] = 1 / 7; reedWave = ctx.createPeriodicWave(rre, rim); }
            ro1.setPeriodicWave(reedWave);
          } catch (e) { ro1.type = 'square'; }      // 能力失效 → square(单方波亦含奇次,有声基线)
        } else { ro1.type = 'square'; }
        var rbp = null;                              // 木质共振峰带通 ~1100Hz Q≈1;缺 → null 直连
        if (ctx.createBiquadFilter) { try { rbp = ctx.createBiquadFilter(); rbp.type = 'bandpass'; rbp.frequency.value = 1100; if (rbp.Q) rbp.Q.value = 1; } catch (e) { rbp = null; } }
        var rg = ctx.createGain(); ro1.connect(rbp || rg); if (rbp) rbp.connect(rg); rg.connect(voiceOut());
        envADSR(rg, t, peak, 0.04, 0.12, 0.75, 0.2, dur * 0.88);   // 适中起音高 sustain
        ro1.start(t); ro1.stop(t + dur + 0.5); musicNodes.push(ro1);
        return;
      }
      if (pal === 'pulse') {                            // 真占空比脉冲波:锯齿 → WaveShaper 方波整形,DC 偏移控占空比 + LFO 扫占空比 = 经典 PWM/SID 涌动(替旧"双方波 detune 近似";参 pendragon-andyh PulseOscillator)
        var psaw = mkOsc('sawtooth', freq, 0);
        var pf = mkLp(2600, 1), pg = ctx.createGain();
        if (pf) pf.connect(pg); pg.connect(voiceOut());
        var shaper = ctx.createWaveShaper ? ctx.createWaveShaper() : null;
        if (shaper) {                                   // 有 WaveShaper → 真脉冲整形
          shaper.curve = pulseCurve();
          var psum = ctx.createGain(); psum.gain.value = 1; psaw.connect(psum); psum.connect(shaper); shaper.connect(pf || pg);
          var pdc = ctx.createConstantSource ? ctx.createConstantSource() : null;
          if (pdc) {                                    // DC 偏移移动锯齿过零点=占空比;LFO 扫之=PWM 涌动(无 ConstantSource → 退化定占空比方波,仍真整形不崩)
            pdc.offset.value = -0.2; pdc.connect(psum); pdc.start(t);
            var plfo = mkOsc('sine', 0.28), plfg = ctx.createGain(); plfg.gain.value = 0.4;   // 0.28Hz 固定 = 确定性,无 Math.random
            plfo.connect(plfg); plfg.connect(pdc.offset);
            plfo.start(t); plfo.stop(t + dur + 0.5); musicNodes.push(plfo);
            pdc.stop(t + dur + 0.5); musicNodes.push(pdc);
          }
        } else { psaw.connect(pf || pg); }              // 无 WaveShaper → 退化为锯齿(有声、不崩)
        envADSR(pg, t, peak, 0.005, 0.13, 0.62, 0.22, dur * 0.88);
        psaw.start(t); psaw.stop(t + dur + 0.5); musicNodes.push(psaw);
        return;
      }
      var pulse = (pal === 'pulse'), brass = (pal === 'brass');   // 注:pulse 已在上面真 PWM 分支提前 return → 此处 pulse 恒 false,后续仅 brass/soft 两路(逐字节不变=向后兼容)
      var f = mkLp(pulse ? 2600 : brass ? 500 : 1900, 1), g = ctx.createGain();
      // brass 板:滤波包络**上扫**(500→2200,0.08s)= 铜管起音的"blat"(滤波包络方向决定族感:下扫=拨弦/上扫=铜管)
      if (f && brass && f.frequency.setValueAtTime && f.frequency.exponentialRampToValueAtTime) { try { f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.08); } catch (e) {} }
      if (f) f.connect(g); g.connect(voiceOut());
      var o1 = mkOsc(brass ? 'sawtooth' : pulse ? 'square' : 'triangle', freq, brass ? 4 : 0);
      var o2 = mkOsc(pulse ? 'square' : 'sawtooth', freq, pulse ? -7 : brass ? -4 : 0);
      var g2 = ctx.createGain(); g2.gain.value = pulse ? 0.5 : brass ? 0.6 : 0.25;
      o1.connect(f || g); o2.connect(g2); g2.connect(f || g);
      var lfo = vibrato(t, [o1, o2]);
      envADSR(g, t, peak, brass ? 0.03 : pulse ? 0.005 : 0.01, brass ? 0.1 : 0.13, brass ? 0.7 : 0.62, 0.22, dur * 0.88);
      o1.start(t); o2.start(t);
      o1.stop(t + dur + 0.5); o2.stop(t + dur + 0.5); lfo.stop(t + dur + 0.5);
      musicNodes.push(o1); musicNodes.push(o2); musicNodes.push(lfo);
    }
    function noiseHit(t, dur, hpFreq, peak, type) { // 鼓的噪声路:种子噪声 → 高/带通 → 指数衰减
      var nb = sharedNoise(); if (!nb || !ctx.createBufferSource) return false;
      var src = ctx.createBufferSource(); src.buffer = nb;
      var f = null;
      if (ctx.createBiquadFilter) { f = ctx.createBiquadFilter(); f.type = type || 'highpass'; f.frequency.value = hpFreq; }
      var g = ctx.createGain(); g.gain.value = peak;
      src.connect(f || g); if (f) f.connect(g); g.connect(voiceOut());
      if (g.gain.setValueAtTime && g.gain.exponentialRampToValueAtTime) { try { g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.01, t + dur); } catch (e) {} }
      src.start(t); if (src.stop) src.stop(t + dur + 0.05);
      musicNodes.push(src); return true;
    }
    function drumVoice(t, dur, peak, role) {
      if (role === 'kick') {                        // 正典:sine 150Hz 指数扫频 + 同窗增益衰减(+噪声 click 增 punch)
        var o = mkOsc('sine', 150), g = ctx.createGain();
        var win = Math.min(0.45, dur * 1.6);
        if (o.frequency.setValueAtTime && o.frequency.exponentialRampToValueAtTime) { try { o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + win); } catch (e) {} }
        g.gain.value = peak * 1.8; o.connect(g); g.connect(voiceOut());
        if (g.gain.setValueAtTime && g.gain.exponentialRampToValueAtTime) { try { g.gain.setValueAtTime(peak * 1.8, t); g.gain.exponentialRampToValueAtTime(0.01, t + win); } catch (e) {} }
        o.start(t); o.stop(t + win + 0.05); musicNodes.push(o);
        noiseHit(t, 0.012, 4000, peak * 0.5, 'highpass');        // click 层(可降级)
        return;
      }
      if (role === 'snare') {                       // 高通噪声(1k,0.2s)+ 三角 100Hz 鼓体(0.1s,鼓皮模式衰减快一倍)
        if (!noiseHit(t, 0.2, 1000, peak * 2.2, 'highpass')) {   // 无 buffer 能力 → 方波近似(旧路兜底)
          var so = mkOsc('square', 220), sg0 = ctx.createGain(); sg0.gain.value = peak; so.connect(sg0); sg0.connect(voiceOut());
          if (sg0.gain.setValueAtTime && sg0.gain.exponentialRampToValueAtTime) { try { sg0.gain.setValueAtTime(peak, t); sg0.gain.exponentialRampToValueAtTime(0.01, t + dur); } catch (e) {} }
          so.start(t); so.stop(t + dur); musicNodes.push(so);
        }
        var body = mkOsc('triangle', 100), bg = ctx.createGain(); bg.gain.value = peak * 1.4;
        body.connect(bg); bg.connect(voiceOut());
        if (bg.gain.setValueAtTime && bg.gain.exponentialRampToValueAtTime) { try { bg.gain.setValueAtTime(peak * 1.4, t); bg.gain.exponentialRampToValueAtTime(0.01, t + 0.1); } catch (e) {} }
        body.start(t); body.stop(t + 0.12); musicNodes.push(body);
        return;
      }
      // hihat:7kHz 高通噪声短衰(闭镲);无 buffer → 8kHz 方波近似
      if (!noiseHit(t, Math.max(0.04, dur), 7000, peak * 1.2, 'highpass')) {
        var ho = mkOsc('square', 8000), hg = ctx.createGain(); hg.gain.value = peak; ho.connect(hg); hg.connect(voiceOut());
        if (hg.gain.setValueAtTime && hg.gain.exponentialRampToValueAtTime) { try { hg.gain.setValueAtTime(peak, t); hg.gain.exponentialRampToValueAtTime(0.01, t + dur); } catch (e) {} }
        ho.start(t); ho.stop(t + dur); musicNodes.push(ho);
      }
    }
    // 单个音符事件 → 按声部/音色板分发(timbre 来自 spec,未知板名 → warn 一次 + 回退默认,不静默)
    function musicVoice(ev, base, timbre, segIndex) {
      var t = base + ev.t, dur = ev.dur, peak = ev.gain, role = ev.role;
      voiceRole = ev.voice || role;                              // A1:置位声像 role(MIDI 走 ev.voice、合成走 role)→ voiceOut() 据此铺声场
      midiPan = (typeof ev.pan === 'number') ? ev.pan : null;    // MIDI CC10 声像覆盖(作曲路无 ev.pan → null → 走 VOICE_PAN 角色表)
      voicePerformance = null;                                  // MIDI 忠实播放不偷偷改表演；只增强 composer 生成的默认音乐
      if (ev.voice) {                                            // v14:MIDI 事件直带音色(gmVoice/gmDrum 已按 GM 族折好)
        var vc = ev.voice;
        if (vc === 'bass') return bassVoice(t, dur, ev.freq, peak);
        if (vc === 'kick' || vc === 'snare' || vc === 'hihat') return drumVoice(t, dur, peak, vc);
        if (vc === 'timpani') return timpaniVoice(t, dur, ev.freq, peak);   // 定音鼓/太鼓/旋律鼓:音高膜鸣(旧折 kick/bell 丢音高)
        if (vc === 'bell') return bellVoice(t, dur, ev.freq, peak);
        if (vc === 'kalimba') return kalimbaVoice(t, dur, ev.freq, peak);   // 卡林巴:此前 MIDI 够不到的金属拨片
        if (vc === 'pluck' || vc === 'harp') return pluckVoice(t, dur, ev.freq, peak, vc);
        if (vc === 'organ' || vc === 'air' || vc === 'strings' || vc === 'warm' || vc === 'choir' || vc === 'glass') return padVoice(t, dur, ev.freq, peak, vc === 'warm' ? null : vc);   // +choir(人声 formant)/glass(此前 MIDI 够不到)
        return leadVoice(t, dur, ev.freq, peak, vc);             // brass/pulse/soft/flute/reed(flute/reed 此前 MIDI 够不到、经 leadVoice palette 还原)
      }
      var pal = timbre && timbre[role === 'arp' ? 'arp' : role];
      voicePerformance = performanceProfile(role, pal, segIndex || 0, ev.t, ev.freq, ev.dur);
      voicePerformance._start = t;                               // 仅供 AudioParam 排相对起音；profile 选择本身不含绝对设备时钟
      var KNOWN = { pad: { warm: 1, organ: 1, air: 1, strings: 1, choir: 1, glass: 1 }, lead: { soft: 1, pulse: 1, bell: 1, pluck: 1, brass: 1, harp: 1, flute: 1, reed: 1, chant: 1 }, arp: { pluck: 1, bell: 1, soft: 1, harp: 1, kalimba: 1 }, bass: { sub: 1, organ: 1, upright: 1, picked: 1, synth: 1, 'sine-pluck': 1 } };
      if (pal && KNOWN[role] && !KNOWN[role][pal] && !warnedPal[role + ':' + pal]) {
        warnedPal[role + ':' + pal] = 1;
        if (typeof console !== 'undefined' && console.warn) console.warn('[amatlas] audio.music timbre.' + role + ' 未知音色板 "' + pal + '"(可选:' + Object.keys(KNOWN[role]).join('/') + ')→ 用默认。');
      }
      if (role === 'pad') return padVoice(t, dur, ev.freq, peak, pal);
      if (role === 'bass') return bassVoice(t, dur, ev.freq, peak, pal);   // pal=sub/organ → 专属底座;缺省/其它 → 默认锯齿下扫(字节级等价)
      if (role === 'arp') { if (pal === 'bell') return bellVoice(t, dur, ev.freq, peak * 0.8); if (pal === 'soft') return leadVoice(t, dur, ev.freq, peak, 'soft'); if (pal === 'kalimba') return kalimbaVoice(t, dur, ev.freq, peak * 0.85); return pluckVoice(t, dur, ev.freq, peak, pal); }   // 默认拨弦=质感主升级;'harp' 透传柔板;'kalimba' 非谐金属拨片
      if (role === 'lead') return leadVoice(t, dur, ev.freq, peak, pal, ev.t);   // chant 元音轮廓只读段内相对时刻，不读设备绝对时钟
      if (role === 'kick' || role === 'snare' || role === 'hihat') return drumVoice(t, dur, peak, role);
      // drone/未知 role:旧极简路(单振荡器+指数衰减)
      var osc = mkOsc(role === 'drone' ? 'sine' : 'triangle', ev.freq > 0 ? ev.freq : 220), g = ctx.createGain();
      g.gain.value = peak; osc.connect(g); g.connect(voiceOut());
      osc.start(t);
      if (g.gain.setValueAtTime && g.gain.exponentialRampToValueAtTime) { try { g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); } catch (e) {} }
      osc.stop(t + dur);
      musicNodes.push(osc);
    }
    // segIndex(段循环索引):透传给 composeMusic 驱动段间变奏(audio-arrange-design);缺省/旧两参调用 → 0 = 与现状字节相同。
    function scheduleSegment(spec, base, segIndex, prepared) { var built = prepared || composer().composeMusic(spec, segIndex || 0), voicedSpec = built.spec || spec; for (var i = 0; i < built.events.length; i++) musicVoice(built.events[i], base, voicedSpec && voicedSpec.timbre, segIndex || 0); return built.segDur; }
    var midiCache = { key: null, parsed: null };                         // 解析缓存(同一 base64 不重复解析;跨曲保留)
    function startMusic(music) {
      var isMidi = !!(music && typeof music === 'object' && music.midi != null);   // v14:第三形态 { midi:'<base64>', loop?, gain? }
      var spec = null, prepared = null, P = null, mkey = null;
      if (isMidi) {
        if (!MM.parseMidi) throw new Error('[amatlas] audio.music.midi 需要 presenters/midi-music.js —— 在 index.html 用 script 标签引它(present-audio.js 之前)。');
        mkey = String(music.midi);   // 完整输入才是精确身份；长度+前缀会让后半不同的 MIDI 碰撞并绕过 parse 校验
        if (midiCache.key !== mkey) midiCache = { key: mkey, parsed: MM.parseMidi(music.midi) };   // 先校验坏 MIDI，再探测 AudioContext
        P = midiCache.parsed;
      } else {
        var C = composer();
        spec = C.resolveMusic ? C.resolveMusic(music) : music;
        prepared = C.composeMusic(spec, 0);                               // normalize/compose 是纯数据步骤：先校验 MusicSpec；无 AudioContext 只让合法意图静默退化
      }
      if (!ensureCtx()) return;
      var session = ++musicSession;                              // 每次直接/经 present 启动都拥有独立身份；stop/换曲会使旧回调失效
      // v13 修真 bug:musicBus 必须在 ensureCtx **之后**建——旧序在「注入 context」路径(测试/嵌入/OfflineAudioContext
      //   诊断)里 master 仍为 null → 真浏览器 connect(null) 抛 Overload resolution failed(mock 的 connect 忽略参数=测试瞒过)。
      // 每曲独立总线(供换曲淡出/淡入)。**新曲淡入**(0→1,1.0s):与 stopMusic 旧曲淡出(1→0,1.0s)形成真交叉淡变 —
      //   治端用户报"新场景 bgm 前几个音符撞上一场景残响打架"(此前 musicBus.gain=1 立即满音量硬起 → 无淡入侧)。
      //   无 ramp 能力(极简 mock)→ 立即满音量(降级,同 stopMusic)。首次起曲也淡入 = 软开场不突兀。
      if (ctx.createGain) {
        musicBus = ctx.createGain(); musicBus.connect(master);
        var tIn = (ctx.currentTime || 0);
        if (musicBus.gain.setValueAtTime && musicBus.gain.linearRampToValueAtTime) {
          try { musicBus.gain.setValueAtTime(0.0001, tIn); musicBus.gain.linearRampToValueAtTime(1, tIn + 1.0); } catch (e) { musicBus.gain.value = 1; }
        } else { musicBus.gain.value = 1; }
        if (mDry) {   // 每曲干总线(打击/低音;与 musicBus 同步淡入,换曲交叉淡变两条一致)→ mDry(不进混响)
          musicDryBus = ctx.createGain(); musicDryBus.connect(mDry);
          if (musicDryBus.gain.setValueAtTime && musicDryBus.gain.linearRampToValueAtTime) {
            try { musicDryBus.gain.setValueAtTime(0.0001, tIn); musicDryBus.gain.linearRampToValueAtTime(1, tIn + 1.0); } catch (e) { musicDryBus.gain.value = 1; }
          } else { musicDryBus.gain.value = 1; }
          try { bassBus = ctx.createGain(); bassBus.gain.value = 0.76; bassBus.connect(musicDryBus); } catch (e) { bassBus = null; }   // 固定保守 trim；建不了则 vBass 回退 musicDryBus
        }
      }
      if (isMidi) {
        // ── MIDI 路:滚动窗排定(调研定稿:音符仍是绝对时间 osc.start(t) 确定性,只有「排定动作」分批,
        //    防长曲一次排几千节点;窗 12s、每 8s 推进、按 ctx.currentTime 重算=timer 迟到不啃安全余量)──
        var mScale = (typeof music.gain === 'number' ? music.gain : 1), doLoop = music.loop !== false;
        var mBase = (ctx.currentTime || 0) + 0.06, mIdx = 0;
        var pump = function (until) {
          for (;;) {
            if (mIdx >= P.events.length) {
              if (!doLoop) return false;
              mIdx = 0; mBase += Math.max(P.totalDur, 0.5) + 0.4;        // 整曲循环(尾留 0.4s 呼吸)
            }
            var ev = P.events[mIdx];
            if (mBase + ev.t >= until) return true;
            musicVoice(mScale === 1 ? ev : { voice: ev.voice, freq: ev.freq, t: ev.t, dur: ev.dur, gain: ev.gain * mScale }, mBase);
            mIdx++;
          }
        };
        var more = pump(mBase + 12);                                     // 同步排首窗(测试可立即断言)
        if (typeof setTimeout !== 'undefined' && more) {
          var mloop = function () {
            if (session !== musicSession) return;
            pruneMusicNodes();                                           // 长曲防句柄无限增长(见 pruneMusicNodes)
            if (pump(((ctx.currentTime || 0)) + 12)) musicTimer = setTimeout(mloop, 8000);
          };
          musicTimer = setTimeout(mloop, 8000);
        }
        return;
      }
      var segIndex = 0;                                                  // 段循环索引(本曲局部;新曲每次 startMusic 天然从 0 重置)
      var base = (ctx.currentTime || 0) + 0.06, seg = scheduleSegment(spec, base, segIndex, prepared);   // 首段复用校验阶段的纯数据结果，不重复 compose
      if (typeof setTimeout !== 'undefined' && seg > 0) {                // 段末续排下一段(异步;测试不依赖)
        // 按 ctx.currentTime 重同步(对齐 MIDI pump 的既定标准):纯 `base += seg` 在 timer 迟到累积后
        //   会把音符排进过去 → 浏览器立即并发触发=音符向段首挤压、成簇爆发(长会话/后台标签实测形态)。
        var loop = function () {
          if (session !== musicSession) return;
          base += seg;
          var nowT = (ctx.currentTime || 0);
          if (base < nowT + 0.05) base = nowT + 0.05;                    // timer 迟到吃光余量 → 重锚,绝不排进过去
          pruneMusicNodes();
          segIndex++;                                                    // 段间变奏:第 1 段起 segIndex≥1 → composeMusic 产同动机不同变形(seg0 仍同步首段=现状)
          scheduleSegment(spec, base, segIndex);
          musicTimer = setTimeout(loop, Math.max(200, (base + seg - nowT - 0.5) * 1000));   // 下次唤醒按真实时钟算
        };
        musicTimer = setTimeout(loop, seg * 1000);
      }
    }
    // 句柄数组防无限增长(长会话审计):音符按时序排定 → 最早 push 的早已停完;砍头保尾
    //   (pending 的全在尾部,≤ 一个排定窗)。只为 stopMusic 能停"还在响/将响"的节点服务。
    function pruneMusicNodes() { if (musicNodes.length > 1600) musicNodes.splice(0, musicNodes.length - 800); }
    function stopMusic() {
      musicSession++;                                             // 先使已出队 callback 失效，再清仍可取消的 handle
      if (musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
      // music 换名/撤销不再硬切(新世界全用 music,逐节点换曲的割裂主战场):旧曲经自己的 musicBus
      // 1.0s 淡出、节点延迟停;新曲 startMusic 的包络随即起 = 真交叉淡变。无 ramp 能力(极简 mock)→ 立即停。
      // 淡出后旧总线必须 disconnect(长会话审计):每换一曲漏一个常驻挂在 master 上的 gain 结点 → 越玩越占。
      var oldBus = musicBus, oldDry = musicDryBus, oldBass = bassBus;
      var tF = (ctx && ctx.currentTime) || 0, rel = 1.0;
      if (oldBus && oldBus.gain && oldBus.gain.setValueAtTime && oldBus.gain.linearRampToValueAtTime) {
        try { oldBus.gain.setValueAtTime(oldBus.gain.value, tF); oldBus.gain.linearRampToValueAtTime(0.0001, tF + rel); } catch (e) {}
        if (oldDry && oldDry.gain && oldDry.gain.setValueAtTime && oldDry.gain.linearRampToValueAtTime) {   // 干总线同步淡出(鼓/低音与旋律同拍收场,不留干声独响)
          try { oldDry.gain.setValueAtTime(oldDry.gain.value, tF); oldDry.gain.linearRampToValueAtTime(0.0001, tF + rel); } catch (e) {}
        }
        for (var f = 0; f < musicNodes.length; f++) { try { musicNodes[f].stop(tF + rel); } catch (e) {} }
        musicBus = null; musicDryBus = null; bassBus = null; musicNodes = []; currentMusicKey = null;
        if (typeof setTimeout !== 'undefined') setTimeout(function () { try { if (oldBus.disconnect) oldBus.disconnect(); } catch (e) {} try { if (oldBass && oldBass.disconnect) oldBass.disconnect(); } catch (e) {} try { if (oldDry && oldDry.disconnect) oldDry.disconnect(); } catch (e) {} }, (rel + 0.2) * 1000);
        return;
      }
      musicBus = null; musicDryBus = null; bassBus = null;
      var t = (ctx && ctx.currentTime) || 0;
      for (var i = 0; i < musicNodes.length; i++) { try { musicNodes[i].stop(t); } catch (e) {} }
      musicNodes = []; currentMusicKey = null;
      if (oldBus && oldBus.disconnect) { try { oldBus.disconnect(); } catch (e) {} }   // 无 ramp 路径=立即摘除
      if (oldBass && oldBass.disconnect) { try { oldBass.disconnect(); } catch (e) {} }
      if (oldDry && oldDry.disconnect) { try { oldDry.disconnect(); } catch (e) {} }
    }
    function present(snap) {
      if (disposed) return;
      var audio = snap && snap.view && snap.view.audio;
      var hasAudio = !!(audio && typeof audio === 'object');
      // 契约 v15「缺省继承」(audio-inherit-design.md):每层(主轨 music/bgm、ambient)——
      //   **键缺失 = 继承**(不动该层、继续播)/ **值 = 设置或换** / **false|null = 显式停**。
      //   `'k' in audio` 判键存在性(renderer 传原始 node.audio、键存在性保真);整个 audio 缺失 = 全继承。
      //   动机:修「漏写 audio → 戛然全停 + 整曲重播」毛刺,且让作者少记一条规则(默认继承=更省、非新约束)。
      function has(k) { return hasAudio && Object.prototype.hasOwnProperty.call(audio, k); }
      function isStop(v) { return v === false || v === null; }            // 显式停 token(false 推荐 / null 兼容)

      // ── 主轨:music ⊕ bgm 互斥,music 优先;两键都缺 → 继承(不动)──
      if (has('music')) {
        var m = audio.music;
        if (isStop(m)) { if (currentMusicKey) stopMusic(); stopBgm(); }   // music:false → 停主轨(连带停 bgm)
        else {
          var key = (typeof m === 'string') ? m : JSON.stringify(m);
          // key 在 startMusic **成功后**才提交(与 ambient 既定策略对齐):startMusic 可抛(对象 spec 违约/
          //   缺 midi-music.js/坏 midi)——旧序先提交 key 抛一次后同 key 恒跳过=永久静音;现在每次 render 都抛、错误持续可见。
          if (key !== currentMusicKey) { stopBgm(); stopMusic(); startMusic(m); currentMusicKey = key; }
        }
      } else if (has('bgm')) {                                            // 无 music 键、有 bgm 键 → bgm 治主轨(向后兼容)
        var b = audio.bgm;
        if (currentMusicKey) stopMusic();                                 // bgm 治轨 → 先让 music 让位
        if (isStop(b)) { if (currentBgm) stopBgm(); }                     // bgm:false/null → 停(horror-demo node3 实例)
        else if (b !== currentBgm) { stopBgm(); if (b) startBgm(b); }     // 改名才换、同名不重启
      }
      // else: music 与 bgm 键都缺 → 继承主轨(不动 music/bgm)

      // ── ambient(环境音/BGS · 与主轨并行,§10)──
      if (has('ambient')) {
        var amb = audio.ambient;
        if (isStop(amb)) { if (currentAmbientKey) { stopAmbience(); currentAmbientKey = null; } }
        else {
          var ak = (typeof amb === 'string') ? amb : JSON.stringify(amb);
          if (ak !== currentAmbientKey) { stopAmbience(); startAmbience(amb); currentAmbientKey = ak; }   // key 成功后才提交 → 非法名每帧 fail-loud
        }
      }
      // else: ambient 键缺 → 继承

      var sfx = [];
      if (has('sfx')) {
        if (!Array.isArray(audio.sfx)) throw new Error('[amatlas] audio.sfx 必须是数组（即使只有一个音效也写 sfx:["click"]）。');
        sfx = audio.sfx;
      }
      for (var i = 0; i < sfx.length; i++) playSfx(sfx[i]);
    }
    function unlock() { var c = ensureCtx(); if (c && c.resume) c.resume(); }       // autoplay 解锁(用户手势里调)
    function removeUnlockListeners() {
      if (!unlockHandler || !doc || !doc.removeEventListener) return;
      doc.removeEventListener('click', unlockHandler);
      doc.removeEventListener('keydown', unlockHandler);
      doc.removeEventListener('touchstart', unlockHandler);
      unlockHandler = null;
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (removePresenter) { removePresenter(); removePresenter = null; }
      removeUnlockListeners();
      if (audioBtn) {
        audioBtn.onclick = null;
        if (audioBtn.parentNode && audioBtn.parentNode.removeChild) audioBtn.parentNode.removeChild(audioBtn);
        else if (audioBtn.remove) audioBtn.remove();
        audioBtn = null;
      }
      stopBgm(); stopMusic(); stopBgs(); currentAmbientKey = null;
      if (ctx && ctx.close) {
        try {
          var closing = ctx.close();
          if (closing && typeof closing.catch === 'function') closing.catch(function () {});
        } catch (e) {}
      }
    }

    // ── 玩家侧音量/静音 API + 🔊 工具栏控件(易用性审计批)──────────────────────
    //    控件=工具类 UI(同 💾🗺️🏆 三插件按钮,§11/阶段64 先例:引擎给默认外观不越界、作者可覆盖);
    //    opts.control:false 关、opts.controlSlot 换插槽;无 #plugin-bar(作者没给工具栏)→ 跳过,同三插件约定。
    function applyVol() { if (master && master.gain) { try { master.gain.value = muted ? 0 : vol; } catch (e) {} } if (mDry && mDry.gain) { try { mDry.gain.value = muted ? 0 : vol; } catch (e) {} } }   // 干总线与 master 同步音量/静音(🔊/🔇 控件对鼓/低音同样生效)
    function setVolume(v) { v = +v; if (!(v >= 0)) v = 0; if (v > 1) v = 1; vol = v; applyVol(); }
    function getVolume() { return vol; }
    function isMuted() { return muted; }
    function setMuted(m) {
      muted = !!m;
      try { if (prefStore && prefStore.setItem) { if (muted) prefStore.setItem('amatlas-muted', '1'); else prefStore.removeItem('amatlas-muted'); } } catch (e) {}
      applyVol(); refreshAudioBtn();
    }
    function toggleMute() { setMuted(!muted); return muted; }
    function refreshAudioBtn() {
      if (!audioBtn) return;
      audioBtn.textContent = muted ? '🔇 静音' : '🔊 声音';
      if (audioBtn.setAttribute) audioBtn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    }
    function mountControl() {
      if (opts.control === false || !doc || !doc.querySelector || !doc.createElement) return;
      var bar = doc.querySelector(opts.controlSlot || '#plugin-bar');
      if (!bar || !bar.appendChild) return;                                // 无工具栏 → 跳过(与三插件同约定)
      // 按钮默认样式:与三插件 SHARED_CSS 的 .amatlas-plugin-btn 规则保持一致(此处只含按钮两条;
      //   用独立 style id,不占用 'amatlas-plugin-shared'——否则先注子集会让后装插件 once() 跳过全量浮窗样式)。
      if (doc.getElementById && !doc.getElementById('amatlas-audio-style') && doc.head) {
        var st = doc.createElement('style'); st.id = 'amatlas-audio-style';
        st.textContent = ':where(.amatlas-plugin-btn){appearance:none;font:13px var(--ui,system-ui,sans-serif);background:var(--panel,#121a26);color:var(--ink,#e8edf4);border:1px solid var(--line,#222e40);border-radius:8px;padding:7px 12px;cursor:pointer;transition:.2s}:where(.amatlas-plugin-btn):hover{border-color:var(--accent,#b89b6a);color:var(--accent,#b89b6a)}';
        if (doc.head.appendChild) doc.head.appendChild(st);
      }
      audioBtn = doc.createElement('button');
      audioBtn.className = 'amatlas-plugin-btn amatlas-audio-btn';
      if (audioBtn.setAttribute) audioBtn.setAttribute('title', '音乐/音效 开关');
      audioBtn.onclick = function () { unlock(); toggleMute(); };          // 点击本身是手势 → 顺带解锁 autoplay
      refreshAudioBtn();
      bar.appendChild(audioBtn);
    }

    return {
      id: 'audio-presenter',
      install: function (api) {                            // S11-b-ex:返回 use-able 插件 → engine.use(createAudioPresenter());已删 .plugin
        if (disposed) throw new Error('[amatlas] audio-presenter 已 dispose，不能再次 install。');
        if (installed) throw new Error('[amatlas] 同一 audio-presenter 实例不能重复 install；请复用已安装实例或新建一个 presenter。');
        installed = true;
        removePresenter = api.addPresenter(present);
        if (doc && doc.addEventListener) {                // 一次性手势解锁(autoplay 政策)
          unlockHandler = function () { unlock(); removeUnlockListeners(); };
          doc.addEventListener('click', unlockHandler); doc.addEventListener('keydown', unlockHandler); doc.addEventListener('touchstart', unlockHandler);
        }
        mountControl();                                   // 🔊/🔇 工具栏控件(玩家静音手段;opts.control:false 关)
      },
      present: present, startMusic: startMusic, stopMusic: stopMusic, startBgs: startBgs, stopBgs: stopBgs,
      startAmbience: startAmbience, stopAmbience: stopAmbience, resolveAmbient: resolveAmbient, buildAmbience: buildAmbience,   // §10 ambient(测试/集成)
      unlock: unlock, dispose: dispose,
      setVolume: setVolume, getVolume: getVolume, setMuted: setMuted, toggleMute: toggleMute, isMuted: isMuted,   // 玩家侧音量/静音(易用性审计批)
      bgmFreq: bgmFreq, sfxSpec: sfxSpec, chordThird: chordThird   // 暴露纯映射(测试/复用)
    };
  }

  return { createAudioPresenter: createAudioPresenter, bgmFreq: bgmFreq, sfxSpec: sfxSpec, chordThird: chordThird, _performanceProfile: performanceProfile, _performanceHash: performanceHash };
});
