/* Amatlas S8.5 Web Audio 呈现器 验证 —— 纯 node、零依赖(注入 mock AudioContext;jsdom 无 Web Audio)。
   覆盖:bgmFreq/sfxSpec 确定性映射 / 惰性创建 ctx / bgm 起停换(同名不重启)/ sfx 一次性 / 无 audio 静默 /
        无 AudioContext 不抛 / unlock·dispose / plugin。**真机出声(file:// autoplay 解锁)是浏览器运行时行为,
        本 CLI 无 GUI 浏览器、jsdom 无 Web Audio → 此处验证合成驱动逻辑,出声须人工双击核(见文件头)。**
   契约见 ../../core/module-interface.md v4 §4.2(audio 已冻结)·§4.6(teardown=render 路径已覆盖)。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const audioModule = require('../present-audio.js');
const { createAudioPresenter, bgmFreq, sfxSpec, chordThird } = audioModule;
const performanceProfile = audioModule._performanceProfile;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } }
function throws(fn) { try { fn(); return false; } catch (e) { return true; } }

// mock AudioContext:记录操作日志,供断言。无声、纯结构。
function makeMockCtx() {
  var log = [];
  function gainNode() { return { gain: { value: 0, setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {}, linearRampToValueAtTime: function (v, t) { log.push('gain.linRamp:' + v + '@' + t); }, setTargetAtTime: function (v, t, tau) { log.push('gain.target:' + v + '@' + t + '/' + tau); } }, connect: function () {}, disconnect: function () {} }; }   // 记录 v@t:供 Q 段断言交叉淡变参数;target 供音色包络持续体反向牙;has() 前缀匹配保旧断言(J4)
  var ctx = {
    currentTime: 0, sampleRate: 44100, destination: {}, state: 'suspended',
    createGain: function () { return gainNode(); },
    createOscillator: function () {
      var o = { type: '', frequency: { value: 0, setValueAtTime: function () {}, exponentialRampToValueAtTime: function (v) { log.push('freq.expRamp:' + v); } }, detune: { value: 0, setValueAtTime: function () {} }, connect: function () {}, disconnect: function () { log.push('osc.disconnect'); },
        setPeriodicWave: function () { log.push('osc.setPeriodicWave'); },   // v13:管风琴(加法谐波)路径断言
        start: function (t) { log.push('osc.start:' + o.frequency.value); }, stop: function (t) { log.push('osc.stop'); if (t != null) log.push('osc.stopAt:' + t); } };   // 'osc.stop' 原样保留(I6 精确计数),另记 stopAt:t 供 Q 段断言延迟停
      log.push('createOscillator'); return o;
    },
    // S10:恐怖合成需要的原生节点(mock 仅记录 + 返回最小结构,无声)
    createWaveShaper: function () { log.push('createWaveShaper'); return { curve: null, connect: function () {}, disconnect: function () {} }; },
    createBiquadFilter: function () { log.push('createBiquadFilter'); return { type: '', frequency: { value: 0 }, Q: { value: 0 }, connect: function () {}, disconnect: function () {} }; },
    createBufferSource: function () { log.push('createBufferSource'); return { buffer: null, connect: function () {}, disconnect: function () {}, start: function () { log.push('src.start'); }, stop: function () { log.push('src.stop'); } }; },
    createBuffer: function (ch, len, sr) { log.push('createBuffer'); return { getChannelData: function () { return new Float32Array(len || 8); } }; },
    createConvolver: function () { log.push('createConvolver'); return { buffer: null, normalize: true, connect: function () {}, disconnect: function () {} }; },
    createStereoPanner: function () { log.push('createStereoPanner'); return { pan: { value: 0, setValueAtTime: function () {} }, connect: function () {}, disconnect: function () {} }; },
    // v13 音色库节点(mock 仅记录;KS 拨弦/FM/管风琴/压缩器路径可断言)
    createDelay: function (max) { log.push('createDelay'); return { delayTime: { value: 0 }, connect: function () {}, disconnect: function () {} }; },
    createDynamicsCompressor: function () { log.push('createDynamicsCompressor'); return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: function () {}, disconnect: function () {} }; },
    createPeriodicWave: function (re, im) { log.push('createPeriodicWave'); return {}; },
    createConstantSource: function () { log.push('createConstantSource'); return { offset: { value: 0, setValueAtTime: function () {}, setTargetAtTime: function () {}, linearRampToValueAtTime: function () {} }, connect: function () {}, disconnect: function () {}, start: function () {}, stop: function () {} }; },   // PWM 占空比 DC 偏移源(pulse 真 PWM 唯一使用)
    resume: function () { log.push('resume'); }, close: function () { log.push('close'); }
  };
  ctx._log = log; return ctx;
}
function nOsc(ctx) { return ctx._log.filter(function (x) { return x === 'createOscillator'; }).length; }
function nPanner(ctx) { return ctx._log.filter(function (x) { return x === 'createStereoPanner'; }).length; }
function has(ctx, e) { return ctx._log.some(function (x) { return x === e || x.indexOf(e) === 0; }); }

console.log('S8.5 present-audio 验证');

// A. 纯映射确定性
(function () {
  ok('A1 已知 bgm → 定值(theme-forest=196)', bgmFreq('theme-forest') === 196.00);
  ok('A2 未知 bgm → 确定性(同名同频)且在音域', bgmFreq('zzz') === bgmFreq('zzz') && bgmFreq('zzz') >= 160 && bgmFreq('zzz') < 460);
  ok('A3 已知 sfx → 定参(dice-roll=square)', sfxSpec('dice-roll').type === 'square');
  ok('A4 未知 sfx → 默认 beep(有 freq/dur/gain)', (function () { var s = sfxSpec('zzz'); return s.type && s.freq > 0 && s.dur > 0 && s.gain > 0; })());
})();

// B. 惰性创建:未发声前不建 ctx
(function () {
  var created = []; function Ctor() { var c = makeMockCtx(); created.push(c); return c; }
  var p = createAudioPresenter({ AudioContext: Ctor });
  ok('B1 创建呈现器时不建 ctx', created.length === 0);
  p.present({ view: {} });                       // 无 audio
  ok('B2 无 audio 的 render 不建 ctx(静默)', created.length === 0);
  p.present({ view: { audio: { bgm: 'theme-forest' } } });
  ok('B3 首次需发声才建 ctx(惰性)', created.length === 1);
})();

// C. bgm:起 / 同名不重启 / 换名 / 停
(function () {
  var ctx = makeMockCtx();
  var p = createAudioPresenter({ context: ctx });
  p.present({ view: { audio: { bgm: 'theme-forest' } } });
  ok('C1 起 bgm:和弦根音 start 在 196(B1 升级后一组和弦=4 振荡器)', has(ctx, 'osc.start:196') && nOsc(ctx) === 4);
  p.present({ view: { audio: { bgm: 'theme-forest' } } });
  ok('C2 同名 bgm 不重启(仍只一组和弦=4 振荡器)', nOsc(ctx) === 4);
  p.present({ view: { audio: { bgm: 'theme-tense' } } });    // 换名
  ok('C3 换名:停旧 + 建新(两组和弦=8、有 stop、新频根音 110)', nOsc(ctx) === 8 && has(ctx, 'osc.stop') && has(ctx, 'osc.start:110'));
  p.present({ view: { audio: {} } });                         // 无 bgm
  ok('C4 无 bgm:停且不再建(振荡器仍 8)', nOsc(ctx) === 8);
})();

// D. teardown via render(§8 评估结论):reset→render 带新快照,bgm 自然停/换,无需核心事件
(function () {
  var ctx = makeMockCtx();
  var p = createAudioPresenter({ context: ctx });
  p.present({ view: { audio: { bgm: 'theme-night' } } });     // 游戏中
  var before = nOsc(ctx);
  p.present({ view: { audio: { bgm: false } } });              // v15:显式停(bgm:false);键缺失=继承,故停要显式写
  ok('D1 显式 bgm:false → 停(无新振荡器、有 stop)', nOsc(ctx) === before && has(ctx, 'osc.stop'));
})();

// E. sfx:一次性(每次 render 触发新振荡器并定时 stop)
(function () {
  var ctx = makeMockCtx();
  var p = createAudioPresenter({ context: ctx });
  p.present({ view: { audio: { sfx: ['dice-roll'] } } });
  ok('E1 sfx 触发:建振荡器 + start + stop', nOsc(ctx) === 1 && has(ctx, 'osc.stop'));
  p.present({ view: { audio: { sfx: ['dice-roll', 'success'] } } });
  ok('E2 两个 sfx → 再建 2 个振荡器(累计 3)', nOsc(ctx) === 3);
  p.present({ view: { audio: {} } });
  ok('E3 无 sfx → 不再建(仍 3)', nOsc(ctx) === 3);
})();

// F. 健壮性:无 AudioContext 不抛;无 audio 静默
(function () {
  var p = createAudioPresenter({});   // 无 context、无 Ctor、无 window
  ok('F1 无 AudioContext 时合法音频意图不抛(静默退化)', !throws(function () { p.present({ view: { audio: { bgm: 'x', sfx: ['y'] } } }); }));
  ok('F2 present(null) / 无 view 不抛', !throws(function () { p.present(null); p.present({}); }));
  ok('F3 无 AudioContext 仍先校验坏 AmbientSpec 并 fail-loud(变异=ensureCtx 早退在 resolve 前→不抛)', throws(function () { p.present({ view: { audio: { ambient: { layers: [] } } } }); }));
  ok('F4 无 AudioContext 仍先校验坏 SfxSpec 并 fail-loud(变异=ensureCtx 早退在 resolve 前→不抛)', throws(function () { p.present({ view: { audio: { sfx: [{ freq: 'high' }] } } }); }));
  ok('F5 无 AudioContext 仍先校验坏 MusicSpec 并 fail-loud(变异=ensureCtx 早退在 resolve 前→不抛)', throws(function () { p.present({ view: { audio: { music: { mode: 'aeolian', key: 'C4' } } } }); }));
})();

// F6/F7 浏览器装配漏 compose-music.js 必须 fail-loud，且失败不能毒化同 key。
(function () {
  var sandbox = { console: console, setTimeout: setTimeout, clearTimeout: clearTimeout };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'present-audio.js'), 'utf8'), sandbox);
  var p = sandbox.Amatlas.AudioPresenter.createAudioPresenter({});
  var bad = { view: { audio: { music: { mode: 'aeolian', key: 'C4' } } } };
  ok('F6 浏览器漏 compose-music.js → audio.music fail-loud 点名装配依赖', throws(function () { p.present(bad); }));
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'progressions.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'compose-music.js'), 'utf8'), sandbox);
  ok('F7 补加载 compose 后同 key 继续真实校验，不被首次缺依赖毒化', throws(function () { p.present(bad); }));
})();

// G. unlock / dispose
(function () {
  var ctx = makeMockCtx();
  var p = createAudioPresenter({ context: ctx });
  p.unlock();
  ok('G1 unlock → ctx.resume(autoplay 解锁)', has(ctx, 'resume'));
  p.present({ view: { audio: { bgm: 'theme-calm' } } });
  p.dispose();
  ok('G2 dispose → 停 bgm + 关 ctx', has(ctx, 'osc.stop') && has(ctx, 'close'));
})();

// H. install:经 use→addPresenter 注册(doc 缺省时不挂监听、不抛)
(function () {
  var captured = null; var fakeApi = { addPresenter: function (fn) { captured = fn; } };
  var p = createAudioPresenter({ context: makeMockCtx() });
  ok('H1 install 调 addPresenter 注册 present(无 doc 不抛)', !throws(function () { p.install(fakeApi); }) && captured === p.present);
})();

// I. 恐怖音色合成(S10 additive):rich sfx / ambient bgm 用原生节点(distortion/filter/噪声/LFO),旧路径不变
(function () {
  var ctx = makeMockCtx(); var p = createAudioPresenter({ context: ctx });
  p.present({ view: { audio: { sfx: ['horror-sting'] } } });
  ok('I1 horror-sting → WaveShaper distortion + Biquad filter(丰富合成)', has(ctx, 'createWaveShaper') && has(ctx, 'createBiquadFilter'));
  var ctx2 = makeMockCtx(); var p2 = createAudioPresenter({ context: ctx2 });
  p2.present({ view: { audio: { sfx: ['flesh-tear'] } } });
  ok('I2 flesh-tear → 噪声 BufferSource + 带通 filter', has(ctx2, 'createBufferSource') && has(ctx2, 'createBuffer') && has(ctx2, 'createBiquadFilter'));
  ok('I3 flesh-tear 触发 src.start/stop(一次性)', has(ctx2, 'src.start') && has(ctx2, 'src.stop'));
  var ctx3 = makeMockCtx(); var p3 = createAudioPresenter({ context: ctx3 });
  p3.present({ view: { audio: { sfx: ['dice-roll'] } } });
  ok('I4 旧 sfx(dice-roll)路径不变:用振荡器、不建 WaveShaper', nOsc(ctx3) === 1 && !has(ctx3, 'createWaveShaper'));
  var ctx4 = makeMockCtx(); var p4 = createAudioPresenter({ context: ctx4 });
  p4.present({ view: { audio: { bgm: 'ambient-unease' } } });
  ok('I5 ambient-unease → dread bed:不协和簇 3 + AM 1 + 滤波呼吸 1 + 心跳 1 + 首批刺点 1 = 7 振荡器(阶段91 升级,旧=2)', nOsc(ctx4) === 7);
  // I11/I12 锁 dread bed 新行为(防静默退化;镜像 I9/I10);I11 用阈值比较规避浮点字符串脆弱(红队 must-fix)
  ok('I11 dread bed 含 <60Hz 低频(不协和簇根 58.27 + AM/心跳 55 = sub/粗糙度;非单 drone)', ctx4._log.filter(function (x) { return x.indexOf('osc.start:') === 0 && parseFloat(x.slice(10)) < 60; }).length >= 3);
  ok('I12 ambient 确定性:同名两次 startAmbient → nOsc 一致(种子 PRNG 刺点确定)', (function () { var c = makeMockCtx(); createAudioPresenter({ context: c }).present({ view: { audio: { bgm: 'ambient-unease' } } }); return nOsc(c) === 7; })());
  p4.present({ view: { audio: { bgm: false } } });   // v15:显式停 bgm(键缺失=继承)
  ok('I6 显式停 dread bed → 全部 7 osc stop + 首批刺点自停 1 = 8 次 osc.stop(簇/AM/滤波/心跳/刺点经 bgmExtra 收齐,无残留)', ctx4._log.filter(function (x) { return x === 'osc.stop'; }).length === 8);
  ok('I6b bgmTimer 不漏:再起 ambient 后停、不抛、不累积幽灵 timer(clearTimeout 镜像 stopBgs)', !throws(function () { ctx4._log.length = 0; p4.present({ view: { audio: { bgm: 'ambient-unease' } } }); p4.present({ view: { audio: { bgm: false } } }); }));
  // I13 心跳滚动续排(修原 bug:心跳只排 ~40s 后静默)→ startAmbient 注册 ≥2 个 setTimeout(ping 续排 + 心跳续排);spy 计数不真排(防 lingering),异步连续性不搭 fake-timer(§10/lesson89,只锁"注册了续排")
  ok('I13 心跳续排:startAmbient 注册 ≥2 setTimeout(ping + 心跳;防回退到 40s 后心跳静默)', (function () { var realST = global.setTimeout, cnt = 0; global.setTimeout = function () { cnt++; return 0; }; try { var c = makeMockCtx(); createAudioPresenter({ context: c }).present({ view: { audio: { bgm: 'ambient-unease' } } }); } finally { global.setTimeout = realST; } return cnt >= 2; })());
  var ctx5 = makeMockCtx(); var p5 = createAudioPresenter({ context: ctx5 });
  p5.present({ view: { audio: { bgm: 'theme-forest' } } });
  ok('I7 普通 bgm(theme-forest)升级为和弦 drone:4 振荡器(根+三度+五度+LFO),非 RICH 路径', nOsc(ctx5) === 4);
  ok('I8 bgmFreq(ambient-unease) 已知低频(<160、确定性)', bgmFreq('ambient-unease') < 160 && bgmFreq('ambient-unease') === bgmFreq('ambient-unease'));
  // ── 恐怖音效升级(阶段90):精确计数锁定新行为(红队 must-fix:防未来误删颗粒/sub/簇无闸可抓)──
  ok('I9 horror-sting 增强 jump-scare:不协和簇 3 + sub 1 + thump 1 + 粗糙度 LFO 1 = 6 振荡器,含 sub 60Hz(下行→20)+ 65Hz thump + 70Hz 粗糙度 AM(Arnal 尖叫签名)+ 高频噪声爆发 BufferSource(刺啦下扫)',
    nOsc(ctx) === 6 && has(ctx, 'osc.start:60') && has(ctx, 'osc.start:65') && has(ctx, 'osc.start:70') && has(ctx, 'createBufferSource'));
  ok('I10 flesh-tear 升级:种子噪声主层 + 7 颗 pitch-crack = 8 BufferSource + 1 subharmonic LFO 振荡器(锁颗粒/LFO;种子替 Math.random=修确定性破口)',
    ctx2._log.filter(function (x) { return x === 'createBufferSource'; }).length === 8 && nOsc(ctx2) === 1);
  // ── jump-scare 多套(I14-16):各取一个真实参考、性格鲜明;锁节点签名防误删/退化(同 I9/I10 先例)──
  var cStab = makeMockCtx(); createAudioPresenter({ context: cStab }).present({ view: { audio: { sfx: ['horror-stab'] } } });
  ok('I14 horror-stab(《惊魂记》弦乐刀刺):4 刀 × 3 声部不协和簇 = 12 振荡器、高音 880(无 sub、无噪声=纯弦乐 stab)',
    nOsc(cStab) === 12 && has(cStab, 'osc.start:880') && !has(cStab, 'createBufferSource'));
  var cBr = makeMockCtx(); createAudioPresenter({ context: cBr }).present({ view: { audio: { sfx: ['horror-braam'] } } });
  ok('I15 horror-braam(Inception 低频轰鸣):4 锯齿齐奏 65Hz + sub 32.5Hz = 5 振荡器 + 低通滤波(brass 暗)',
    nOsc(cBr) === 5 && has(cBr, 'osc.start:65') && has(cBr, 'osc.start:32.5') && has(cBr, 'createBiquadFilter'));
  var cSc = makeMockCtx(); createAudioPresenter({ context: cSc }).present({ view: { audio: { sfx: ['horror-screech'] } } });
  ok('I16 horror-screech(Silent Hill 金属尖啸):4 非谐部分音方波(根 320)= 4 振荡器 + 刮擦噪声 BufferSource',
    nOsc(cSc) === 4 && has(cSc, 'osc.start:320') && has(cSc, 'createBufferSource'));
  var cSh = makeMockCtx(); createAudioPresenter({ context: cSh }).present({ view: { audio: { sfx: ['horror-shriek'] } } });
  ok('I17 horror-shriek(类人尖叫 source-filter 声门模型):声门源 660 + vibrato 5.6 + subharmonic 330 = 3 振荡器 + 共振峰带通 + rasp 失真 + 气声 BufferSource',
    nOsc(cSh) === 3 && has(cSh, 'osc.start:660') && has(cSh, 'createBiquadFilter') && has(cSh, 'createWaveShaper') && has(cSh, 'createBufferSource'));
})();

// J. bgm drone 升级(表现力 B1/B3):普通 bgm 单振荡器 → 多振荡器和弦 + detune + 低通滤波 + LFO 呼吸 + 起停斜坡
(function () {
  var ctx = makeMockCtx(); var p = createAudioPresenter({ context: ctx });
  p.present({ view: { audio: { bgm: 'theme-calm' } } });
  ok('J1 普通 bgm 升级为和弦 drone:根+三度+五度(3 音)+ LFO = 4 振荡器(替代单振荡器)', nOsc(ctx) === 4);
  ok('J2 经低通滤波(温暖,削尖锐谐波)', has(ctx, 'createBiquadFilter'));
  ok('J3 根音仍在基频(theme-calm=261.63;和弦从根音长出、沿用 bgmFreq 向后兼容)', has(ctx, 'osc.start:261.63'));
  ok('J4 起斜坡(attack 防咔哒):gain linearRamp 被调用', has(ctx, 'gain.linRamp'));
  ok('J5 据 bgm 名情绪选三度(B5):暗(night/tense)→小三度+3、亮(calm/forest)→大三度+4', chordThird('theme-night') === 3 && chordThird('theme-tense') === 3 && chordThird('theme-calm') === 4 && chordThird('theme-forest') === 4);
  var c6 = makeMockCtx(); createAudioPresenter({ context: c6 }).present({ view: { audio: { bgm: 'ambient-unease' } } });
  ok('J6 RICH_BGM(ambient-unease)仍走 startAmbient(升级为 dread bed 7 osc)、不被普通和弦路径接管', nOsc(c6) === 7);
})();

// K. 程序混响(表现力 A1):ConvolverNode + 种子噪声合成 IR(零样本),所有声音经 master 获空间感
(function () {
  var ctx = makeMockCtx(); var p = createAudioPresenter({ context: ctx });
  p.present({ view: { audio: { bgm: 'theme-calm' } } });
  ok('K1 发声 → 建程序混响 ConvolverNode', has(ctx, 'createConvolver'));
  ok('K2 混响 IR 用 createBuffer 代码合成(非加载样本、零素材)', has(ctx, 'createBuffer'));
  var n1 = ctx._log.filter(function (x) { return x === 'createConvolver'; }).length;
  p.present({ view: { audio: { bgm: 'theme-calm' } } });
  ok('K3 混响在 ctx 初始化建一次(re-render 不重建,仍 1 个 Convolver)', n1 === 1 && ctx._log.filter(function (x) { return x === 'createConvolver'; }).length === 1);
  ok('K4 无 AudioContext → 不建混响也不抛(优雅退化)', !throws(function () { createAudioPresenter({}).present({ view: { audio: { bgm: 'x' } } }); }));
})();

// L. audio.music(表现力 C):startMusic 经作曲层排定音符发声;music 优先 bgm;向后兼容
(function () {
  var ctx = makeMockCtx(), ap = createAudioPresenter({ context: ctx });
  ap.present({ view: { audio: { music: 'tense' } } });                 // 经 present 传字符串预设
  ok('L1 music 预设名 → 经作曲层排定多振荡器发声', nOsc(ctx) > 3 && has(ctx, 'osc.start'));
  var n1 = nOsc(ctx);
  ap.present({ view: { audio: { music: 'tense' } } });                 // 同 key 不重排
  ok('L2 同 music 不重排(同 key 跳过)', nOsc(ctx) === n1);
  var ctx2 = makeMockCtx();
  createAudioPresenter({ context: ctx2 }).present({ view: { audio: { bgm: 'theme-forest' } } });
  ok('L3 无 music 时 audio.bgm 仍生效(向后兼容)', nOsc(ctx2) > 0);
  var ctx3 = makeMockCtx(), ap3 = createAudioPresenter({ context: ctx3 });
  ap3.startMusic({ mode: 'minor', key: 'A', instruments: ['pad', 'bass', 'arp'], intensity: 0.8 });
  ok('L4 startMusic(对象 spec)→ 排定振荡器', nOsc(ctx3) > 3);
  ok('L5 stopMusic 可调用不抛(清 timer + 停节点)', !throws(function () { ap3.stopMusic(); }));
  var ctx4 = makeMockCtx();
  createAudioPresenter({ context: ctx4 }).startMusic('没这个预设');     // 未知预设 → 兜底
  ok('L6 未知预设名 → 兜底中性仍排定(不崩)', nOsc(ctx4) > 0);

  // PA-SEG 段间变奏透传(audio-arrange-design):首段=segIndex 0(=现状字节等价);seg≥1 变奏在异步续排 loop
  //   (setTimeout、测试不驱动),变奏正确性 + 确定性 + 锚点见 compose-music.test SEG-1..10。这里只验首段透传/换曲重排。
  (function () {
    function startFreqs(c) { return c._log.filter(function (x) { return x.indexOf('osc.start:') === 0; }).join('|'); }
    var spec = { mode: 'major', key: 'G', instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, melody: 'flowing', feel: ['heroic'] };
    var ca = makeMockCtx(), cb = makeMockCtx();
    createAudioPresenter({ context: ca }).startMusic(spec);
    createAudioPresenter({ context: cb }).startMusic(spec);
    ok('PA-SEG-1 首段确定性透传:两 presenter startMusic(同 spec)首段 osc 频率序列相同(首段=segIndex 0、passthrough 确定)',
      startFreqs(ca) === startFreqs(cb) && startFreqs(ca).length > 0);
    var cc = makeMockCtx(), apc = createAudioPresenter({ context: cc });
    apc.present({ view: { audio: { music: 'heroic' } } }); var before = nOsc(cc);
    apc.present({ view: { audio: { music: 'festive' } } });   // 换曲(music key 变)→ stopMusic + 新 startMusic(局部 segIndex 归 0)
    ok('PA-SEG-2 换曲 → 新曲首段重排(新 startMusic 局部 segIndex 归 0、不崩)', nOsc(cc) > before);
  })();

  // PA-SEG-3/4 真 timer 接缝牙：锁 session token，防已出队旧回调在新曲中复活；也锁直接 startMusic 可续排。
  (function () {
    var realSet = global.setTimeout, realClear = global.clearTimeout, timers = [], cleared = {};
    global.setTimeout = function (fn, ms) { var id = timers.length + 1; timers.push({ id: id, fn: fn, ms: ms }); return id; };
    global.clearTimeout = function (id) { cleared[id] = true; };
    try {
      var c = makeMockCtx(), p = createAudioPresenter({ context: c });
      p.present({ view: { audio: { music: 'calm' } } });
      var oldLoop = timers.filter(function (x) { return x.ms > 1000; })[0], beforeSwitch;
      p.present({ view: { audio: { music: 'tense' } } }); beforeSwitch = nOsc(c);
      var timersBeforeLate = timers.length;
      if (oldLoop) oldLoop.fn();
      ok('PA-SEG-3 已出队旧曲回调在换曲后失效，不能排旧声或覆盖新 timer', !!oldLoop && cleared[oldLoop.id] && nOsc(c) === beforeSwitch && timers.length === timersBeforeLate);

      timers.length = 0; cleared = {};
      var c2 = makeMockCtx(), p2 = createAudioPresenter({ context: c2 });
      p2.startMusic({ mode: 'major', key: 'C', tempo: 200, progression: ['I'], instruments: ['pad'], intensity: 0.6 });
      var directLoop = timers.filter(function (x) { return x.ms > 500; })[0], beforeDirect = nOsc(c2);
      if (directLoop) directLoop.fn();
      ok('PA-SEG-4 直接 startMusic 也建立独立播放 session，timer 到期能续排第二段', !!directLoop && nOsc(c2) > beforeDirect);
    } finally { global.setTimeout = realSet; global.clearTimeout = realClear; }
  })();
})();

// M. BGS / 环境音(audio-strategy §9:种子着色噪声 → biquad 塑形 → 双 LFO〔滤波扫频+增益涌动〕;与 bgm/music 并行独立;startBgs/stopBgs API)
(function () {
  var ctx = makeMockCtx(), ap = createAudioPresenter({ context: ctx });
  ap.startBgs('waves');
  ok('M1 startBgs(waves)→ 噪声 BufferSource(循环)+ buffer', has(ctx, 'createBufferSource') && has(ctx, 'createBuffer') && has(ctx, 'src.start'));
  ok('M2 噪声经 biquad 滤波塑形', has(ctx, 'createBiquadFilter'));
  ok('M3 双 LFO(滤波扫频 + 增益涌动)= ≥2 附加振荡器', nOsc(ctx) >= 2);
  var ctx2 = makeMockCtx(), ap2 = createAudioPresenter({ context: ctx2 });
  ap2.startBgs('没这个纹理');
  ok('M4 未知纹理名 → 静默不建源(向后兼容)', !has(ctx2, 'createBufferSource'));
  var ctx3 = makeMockCtx(), ap3 = createAudioPresenter({ context: ctx3 });
  ap3.startBgs('rain');
  ok('M5 stopBgs 可调用不抛(release 斜坡 + 停节点)', !throws(function () { ap3.stopBgs(); }) && has(ctx3, 'src.stop'));
  var ctx4 = makeMockCtx(), ap4 = createAudioPresenter({ context: ctx4 });
  ap4.present({ view: { audio: { bgm: 'theme-x' } } });                  // bgm 起
  var nBgm = nOsc(ctx4);
  ap4.startBgs('wind');                                                  // BGS 叠加(不停 bgm)
  ok('M6 BGS 与 bgm 并行(startBgs 后振荡器增、且新增噪声源,未停 bgm)', nOsc(ctx4) > nBgm && has(ctx4, 'createBufferSource'));
  ok('M7 全部 4 纹理(wind/waves/rain/forest)各自可起、不崩', ['wind', 'waves', 'rain', 'forest'].every(function (n) { var c = makeMockCtx(); createAudioPresenter({ context: c }).startBgs(n); return has(c, 'createBufferSource'); }));
  var cHb = makeMockCtx(); createAudioPresenter({ context: cHb }).startBgs('heartbeat');
  ok('M7b heartbeat BGS(心跳氛围,用户提议):lub-dub 首拍 = 2 记 ×(低频体 60Hz + 中频咚 130Hz)= 4 振荡器(振荡器型、非噪声床)',
    nOsc(cHb) === 4 && has(cHb, 'osc.start:60') && has(cHb, 'osc.start:130'));
  var ctx5 = makeMockCtx();
  createAudioPresenter({ context: ctx5 }).startBgs('rain');
  ok('M8 BGS 经 master(混响链)→ 获空间感(ensureCtx 建 convolver)', has(ctx5, 'createConvolver'));
  function nBuf(c) { return c._log.filter(function (x) { return x === 'createBufferSource'; }).length; }
  ok('M9 共 7 纹理(wind/waves/rain/forest/storm/stream/night)各自可起、不崩', ['wind', 'waves', 'rain', 'forest', 'storm', 'stream', 'night'].every(function (n) { var c = makeMockCtx(); createAudioPresenter({ context: c }).startBgs(n); return nBuf(c) >= 1; }));
  var cw = makeMockCtx(); createAudioPresenter({ context: cw }).startBgs('waves');
  var cwd = makeMockCtx(); createAudioPresenter({ context: cwd }).startBgs('wind');
  ok('M10 浪≠风结构区分:waves 双层(远浪+近浪 ≥2 噪声源)vs wind 单层(1 源)', nBuf(cw) >= 2 && nBuf(cwd) === 1);
  var cst = makeMockCtx(); createAudioPresenter({ context: cst }).startBgs('storm');
  ok('M11 storm 三层(重雨+片雨+风 ≥3 噪声源)+ 30Hz 次低吼振荡器', nBuf(cst) >= 3 && nOsc(cst) >= 1);
  // 新增纹理(additive):campfire/town/cave/snow/tavern/underwater 各自能起、不崩
  ok('M12 6 个新纹理(campfire/town/cave/snow/tavern/underwater)各自可起、建噪声源、不崩',
    ['campfire', 'town', 'cave', 'snow', 'tavern', 'underwater'].every(function (n) { var c = makeMockCtx(); return !throws(function () { createAudioPresenter({ context: c }).startBgs(n); }) && nBuf(c) >= 1; }));
  var ctf = makeMockCtx(); createAudioPresenter({ context: ctf }).startBgs('campfire');
  ok('M13 campfire:火 rumble+hiss 双噪声床(≥2 源)+ 火花 crackle 瞬态(同步首批=额外 BufferSource pop)', nBuf(ctf) >= 3);
  var ctav = makeMockCtx(); createAudioPresenter({ context: ctav }).startBgs('tavern');
  ok('M14 tavern:暖 murmur 双噪声床 + 慢调制 LFO(≥2 振荡器)', nBuf(ctav) >= 2 && nOsc(ctav) >= 2);
  // ── 瞬态层(patter):首批事件在 startBgs 内同步 spawn → 测试可立即断言 ──────────────────────
  var crd = makeMockCtx(); createAudioPresenter({ context: crd }).startBgs('rain');
  var crd0 = makeMockCtx(); createAudioPresenter({ context: crd0 }).startBgs('storm');   // storm 无瞬态层(对照:同有 white-noise 床但不撒雨滴 blip)
  ok('M15 rain 瞬态层:雨滴 droplet 同步首批 spawn → 额外谐振 osc(振荡器数 > 仅床的 LFO 数)', nOsc(crd) > nOsc(crd0) - 1 && nOsc(crd) >= 2);
  var cfire = makeMockCtx(); createAudioPresenter({ context: cfire }).startBgs('campfire');
  function nBufF(c) { return c._log.filter(function (x) { return x === 'createBufferSource'; }).length; }
  ok('M16 fire(campfire)瞬态层:火花 crackle 同步首批 spawn → 噪声爆 BufferSource(数 > 2 个床噪声层)', nBufF(cfire) > 2);
  var cnight = makeMockCtx(); createAudioPresenter({ context: cnight }).startBgs('night');
  ok('M17 night 瞬态层:虫鸣 cricket 同步首批 spawn → 高频脉冲 osc(振荡器数 ≥ 床 LFO 之外的额外脉冲)', nOsc(cnight) >= 3);
  var cforest = makeMockCtx(); createAudioPresenter({ context: cforest }).startBgs('forest');
  ok('M18 forest 瞬态层:鸟鸣 bird 同步首批 spawn → 扫频 osc(振荡器数 > 仅床的 2 LFO)', nOsc(cforest) >= 3);
  // 确定性:同纹理两次 startBgs 产生相同的瞬态序列(节点计数一致;PRNG 每次 startBgs 重置)
  var cdet1 = makeMockCtx(); createAudioPresenter({ context: cdet1 }).startBgs('rain');
  var cdet2 = makeMockCtx(); createAudioPresenter({ context: cdet2 }).startBgs('rain');
  ok('M19 确定性:同纹理(rain)两次 startBgs → 节点计数完全一致(种子 PRNG,非 Math.random)', nOsc(cdet1) === nOsc(cdet2) && nBufF(cdet1) === nBufF(cdet2));
  // 瞬态 timer 不漏:stopBgs 后内部 bgsTimer 清空(经 startBgs→stopBgs 不抛 + 再 start 不累积幽灵 timer)
  var ctmr = makeMockCtx(); var aptmr = createAudioPresenter({ context: ctmr });
  ok('M20 瞬态纹理 startBgs→stopBgs 不抛(timer 清除 + 节点停)', !throws(function () { aptmr.startBgs('rain'); aptmr.stopBgs(); aptmr.startBgs('campfire'); aptmr.stopBgs(); }) && has(ctmr, 'src.stop'));
})();

// N. StereoPanner 空间声场(立体声宽度=沉浸):waves/wind 慢 pan 漂移、瞬态(雨滴/鸟鸣…)每事件随机 L/R;**必须 guard**(缺 createStereoPanner → 直连退化)
(function () {
  var cw = makeMockCtx(); createAudioPresenter({ context: cw }).startBgs('waves');
  ok('N1 waves → 建 StereoPanner(近浪声像 + 慢 pan LFO 横扫,远浪居中)', nPanner(cw) >= 1);
  var cwd = makeMockCtx(); createAudioPresenter({ context: cwd }).startBgs('wind');
  ok('N2 wind → 建 StereoPanner(怒风慢 pan 漂移,阵风掠过)', nPanner(cwd) >= 1);
  var cr = makeMockCtx(); createAudioPresenter({ context: cr }).startBgs('rain');
  ok('N3 rain 瞬态:雨滴 droplet 每事件随机声像 → 多个 StereoPanner(散布立体声场;同步首批 ≥2)', nPanner(cr) >= 2);
  // **guard(向后兼容 + mock/老浏览器安全)**:删 createStereoPanner → BGS 仍构建(直连退化)、不抛、噪声床照旧
  var cg = makeMockCtx(); delete cg.createStereoPanner;
  var apg = createAudioPresenter({ context: cg });
  ok('N4 缺 createStereoPanner(老浏览器/mock)→ 不抛、退化直连(噪声床照常建、无 panner)', !throws(function () { apg.startBgs('waves'); apg.startBgs('rain'); }) && has(cg, 'createBufferSource') && nPanner(cg) === 0);
  // 确定性:声像用 bgsRand(种子 PRNG,非 Math.random)→ 同纹理两次 panner 计数一致
  var cd1 = makeMockCtx(); createAudioPresenter({ context: cd1 }).startBgs('rain');
  var cd2 = makeMockCtx(); createAudioPresenter({ context: cd2 }).startBgs('rain');
  ok('N5 声像确定性:同纹理(rain)两次 → StereoPanner 计数一致(bgsRand 种子 PRNG)', nPanner(cd1) === nPanner(cd2) && nPanner(cd1) >= 2);
})();

// O. BGS 子总线(统一环境音音量):全部 BGS 经一处 bgsMaster gain 汇 master(opts.bgsVolume 调,缺省透明)→ 仍获混响、与 bgm/music 平衡
(function () {
  var c = makeMockCtx(); var ap = createAudioPresenter({ context: c });
  ap.startBgs('wind'); ap.stopBgs(); ap.startBgs('rain'); ap.stopBgs();
  ok('O1 BGS 子总线 startBgs→stopBgs 多轮不抛(bgsMaster 持久、out 经其汇 master)', !throws(function () { ap.startBgs('waves'); ap.stopBgs(); }) && has(c, 'createBufferSource'));
  ok('O2 opts.bgsVolume 透明默认不影响 bgm 路径(bgm 仍走 master、振荡器照常)', (function () { var c2 = makeMockCtx(); createAudioPresenter({ context: c2, bgsVolume: 0.7 }).present({ view: { audio: { bgm: 'theme-forest' } } }); return nOsc(c2) === 4; })());
})();

// P. audio.ambient · Preset|Spec 二元(audio-strategy §10):预设名走 BGS_BUILD、spec 走 buildAmbience;与 bgm/music 并行;fail-loud(未知名/非法 spec throw);变更检测;撤销停
(function () {
  // P1 预设名:present({audio:{ambient:'rain'}}) → 噪声床起(经 BGS_BUILD['rain'])
  var c1 = makeMockCtx(); var p1 = createAudioPresenter({ context: c1 });
  p1.present({ view: { audio: { ambient: 'rain' } } });
  ok('P1 ambient 预设名(rain)→ 噪声 BufferSource 起(经 BGS_BUILD 预设路径)', has(c1, 'createBufferSource') && has(c1, 'src.start'));
  // P2 spec 对象:present({audio:{ambient:{layers:[…]}}}) → buildAmbience 逐层构建
  var c2 = makeMockCtx(); var p2 = createAudioPresenter({ context: c2 });
  var spec = { layers: [{ color: 'brown', filter: { type: 'lowpass', freq: 300, q: 0.5 }, gainLfo: { rate: 0.1, depth: 0.05 } }, { color: 'white', filter: { type: 'bandpass', freq: 1200 }, pan: 0.4 }], transients: [{ kind: 'droplet', density: 4 }] };
  p2.present({ view: { audio: { ambient: spec } } });
  ok('P2 ambient spec → buildAmbience 逐层构建:≥2 噪声源(2 层)+ 瞬态 droplet(额外谐振 osc)', c2._log.filter(function (x) { return x === 'createBufferSource'; }).length >= 2 && nOsc(c2) >= 1);
  ok('P2b spec 的 gainLfo/filterLfo → LFO 振荡器;pan → StereoPanner', nOsc(c2) >= 1 && nPanner(c2) >= 1);
  // P3 ambient 与 bgm 并行(都响):bgm 振荡器 + ambient 噪声源同时存在,互不停
  var c3 = makeMockCtx(); var p3 = createAudioPresenter({ context: c3 });
  p3.present({ view: { audio: { bgm: 'theme-forest', ambient: 'wind' } } });
  ok('P3 ambient 与 bgm 并行(都响):bgm 和弦振荡器(≥4)+ ambient 噪声源同响,无 bgm stop', nOsc(c3) >= 4 && has(c3, 'createBufferSource') && !has(c3, 'osc.stop'));
  // ambient 与 music 并行(都响)
  var c3m = makeMockCtx(); var p3m = createAudioPresenter({ context: c3m });
  p3m.present({ view: { audio: { music: 'tense', ambient: 'rain' } } });
  ok('P3b ambient 与 music 并行(都响):music 振荡器(>3)+ ambient 噪声源同响', nOsc(c3m) > 3 && has(c3m, 'createBufferSource'));
  // P4 未知预设名 → fail-loud throw(不静默)
  var c4 = makeMockCtx(); var p4 = createAudioPresenter({ context: c4 });
  ok('P4 未知预设名 → throw(fail-loud,不静默退化)', throws(function () { p4.present({ view: { audio: { ambient: '没这个预设' } } }); }));
  ok('P4a 同一非法名再 present 仍 throw(key 仅成功后提交,不被"同 key 跳过"吞)', throws(function () { p4.present({ view: { audio: { ambient: '没这个预设' } } }); }));
  ok('P4b resolveAmbient 已知预设名 → 返回 builder;未知 → throw', (function () { var r = p4.resolveAmbient('waves'); return r && typeof r.builder === 'function' && r.name === 'waves'; })() && throws(function () { p4.resolveAmbient('nope'); }));
  // P5 非法 spec → throw(layers 非数组/空、layer 缺 color|filter、color 非枚举、非字符串非对象)
  var c5 = makeMockCtx(); var p5 = createAudioPresenter({ context: c5 });
  ok('P5 非法 spec(layers 缺)→ throw', throws(function () { p5.present({ view: { audio: { ambient: {} } } }); }));
  ok('P5b 非法 spec(layers 非数组)→ throw', throws(function () { p5.buildAmbience({ layers: 'x' }); }));
  ok('P5c 非法 spec(layers 空数组)→ throw', throws(function () { p5.buildAmbience({ layers: [] }); }));
  ok('P5d layer 缺 color → throw', throws(function () { p5.buildAmbience({ layers: [{ filter: { type: 'lowpass', freq: 300 } }] }); }));
  ok('P5e layer color 非枚举 → throw', throws(function () { p5.buildAmbience({ layers: [{ color: 'green', filter: { type: 'lowpass', freq: 300 } }] }); }));
  ok('P5f layer 缺 filter → throw', throws(function () { p5.buildAmbience({ layers: [{ color: 'pink' }] }); }));
  ok('P5g layer filter 缺 freq → throw', throws(function () { p5.buildAmbience({ layers: [{ color: 'pink', filter: { type: 'lowpass' } }] }); }));
  ok('P5h transient kind 非枚举 → throw', throws(function () { p5.buildAmbience({ layers: [{ color: 'pink', filter: { type: 'lowpass', freq: 300 } }], transients: [{ kind: 'explosion' }] }); }));
  ok('P5i ambient 既非字符串非对象(数组)→ throw', throws(function () { p5.startAmbience([1, 2]); }) && throws(function () { p5.resolveAmbient(42); }));
  ok('P5j filter.type 只接受 Web Audio 八种枚举', throws(function () { p5.buildAmbience({ layers: [{ color: 'pink', filter: { type: 'bogus', freq: 300 } }] }); }) &&
    ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'].every(function (type) { return !throws(function () { p5.buildAmbience({ layers: [{ color: 'pink', filter: { type: type, freq: 300, q: 0.5 } }] }); }); }));
  ok('P5k filter.freq/q 必须是有限数字', [NaN, Infinity, -Infinity].every(function (v) { return throws(function () { p5.buildAmbience({ layers: [{ color: 'pink', filter: { type: 'lowpass', freq: v } }] }); }) && throws(function () { p5.buildAmbience({ layers: [{ color: 'pink', filter: { type: 'lowpass', freq: 300, q: v } }] }); }); }) && throws(function () { p5.buildAmbience({ layers: [{ color: 'pink', filter: { type: 'lowpass', freq: 300, q: 'sharp' } }] }); }));
  ok('P5m layer/spec level、pan 与 transient density 必须是有限数字', [NaN, Infinity, -Infinity, '1'].every(function (v) {
    var base = function (extraLayer, extraSpec, transient) {
      var layer = { color: 'pink', filter: { type: 'lowpass', freq: 300 } };
      Object.assign(layer, extraLayer || {});
      var spec = { layers: [layer] };
      Object.assign(spec, extraSpec || {});
      if (transient) spec.transients = [transient];
      return throws(function () { p5.buildAmbience(spec); });
    };
    return base({ level: v }) && base({ pan: v }) && base(null, { level: v }) && base(null, null, { kind: 'droplet', density: v });
  }));
  ok('P5l gainLfo/filterLfo 必须是含有限 rate/depth 的对象', throws(function () { p5.buildAmbience({ layers: [{ color: 'pink', filter: { type: 'lowpass', freq: 300 }, gainLfo: 'slow' }] }); }) && throws(function () { p5.buildAmbience({ layers: [{ color: 'pink', filter: { type: 'lowpass', freq: 300 }, gainLfo: { rate: Infinity, depth: 0.1 } }] }); }) && throws(function () { p5.buildAmbience({ layers: [{ color: 'pink', filter: { type: 'lowpass', freq: 300 }, filterLfo: { rate: 0.1, depth: NaN } }] }); }));
  // P6 ambient 变更检测:同 spec/名不重起、改名/改 spec 才停旧起新
  var c6 = makeMockCtx(); var p6 = createAudioPresenter({ context: c6 });
  p6.present({ view: { audio: { ambient: 'rain' } } });
  var nBuf6 = c6._log.filter(function (x) { return x === 'createBufferSource'; }).length;
  p6.present({ view: { audio: { ambient: 'rain' } } });   // 同名
  ok('P6 同 ambient 名不重起(噪声源计数不变)', c6._log.filter(function (x) { return x === 'createBufferSource'; }).length === nBuf6);
  p6.present({ view: { audio: { ambient: 'wind' } } });   // 换名 → 停旧起新
  ok('P6b 换 ambient 名 → 停旧(src.stop)+ 起新(再建噪声源)', has(c6, 'src.stop') && c6._log.filter(function (x) { return x === 'createBufferSource'; }).length > nBuf6);
  // P7 ambient 显式停(v15:ambient:false;键缺失=继承)
  var c7 = makeMockCtx(); var p7 = createAudioPresenter({ context: c7 });
  p7.present({ view: { audio: { ambient: 'waves' } } });
  p7.present({ view: { audio: { ambient: false } } });   // v15 显式停 ambient
  ok('P7 ambient:false 显式停(src.stop;currentAmbientKey 清,不再续)', has(c7, 'src.stop'));
  ok('P7b 停后再 present 无 ambient 键(继承)不重停/不抛', !throws(function () { p7.present({ view: { audio: {} } }); }));
  // P8 startAmbience/stopAmbience 直接 API + 确定性(同 spec 两次节点计数一致)
  var c8a = makeMockCtx(); createAudioPresenter({ context: c8a }).startAmbience(spec);
  var c8b = makeMockCtx(); createAudioPresenter({ context: c8b }).startAmbience(spec);
  ok('P8 确定性:同 AmbientSpec 两次 startAmbience → 节点计数一致(种子 PRNG)', nOsc(c8a) === nOsc(c8b) && c8a._log.filter(function (x) { return x === 'createBufferSource'; }).length === c8b._log.filter(function (x) { return x === 'createBufferSource'; }).length);
  var c8c = makeMockCtx(); var p8c = createAudioPresenter({ context: c8c });
  ok('P8b startAmbience(预设)→stopAmbience 不抛(release 斜坡 + 停节点)', !throws(function () { p8c.startAmbience('forest'); p8c.stopAmbience(); }) && has(c8c, 'src.stop'));
  // P9 无 AudioContext → ambient 不抛(静默退化;与 F1 一致)
  ok('P9 无 AudioContext → present(ambient) 不抛(静默退化)', !throws(function () { createAudioPresenter({}).present({ view: { audio: { ambient: 'rain' } } }); }));
})();

// Q. bgm 交叉淡变(端用户反馈:逐节点换主题像"每步重播/割裂"):换名时旧 release 1.2s 与新 attack 1.5s 重叠;同名仍不重启
(function () {
  var ctx = makeMockCtx();
  var p = createAudioPresenter({ context: ctx });
  p.present({ view: { audio: { bgm: 'theme-forest' } } });
  ok('Q1 起 bgm:attack 斜坡拉长到 1.5s(linearRamp 0.05@1.5,交叉淡变的进半边)', has(ctx, 'gain.linRamp:0.05@1.5'));
  p.present({ view: { audio: { bgm: 'theme-tense' } } });    // 换名 → 交叉淡变
  ok('Q2 换名:旧和弦 release 斜坡到 0.0001@1.2(非旧版 0.25s 近硬切)', has(ctx, 'gain.linRamp:0.0001@1.2'));
  ok('Q3 换名:旧振荡器延迟到 release 末才 stop(t+1.2,淡出期间继续响)', has(ctx, 'osc.stopAt:1.2'));
  ok('Q4 换名:新主题同瞬已 start(根音 110)→ 新旧重叠期同响 = 交叉淡变', has(ctx, 'osc.start:110'));
  p.present({ view: { audio: { bgm: 'theme-tense' } } });    // 同名
  ok('Q5 同名仍不重启(交叉淡变只发生在换名;振荡器仍 8)', nOsc(ctx) === 8);
})();

// R. music 换名淡出(端用户"每步重播割裂"在 music 路径的主修:旧 stopMusic 硬切 → 曲级 musicBus 1.0s 淡出 + 节点延迟停,与新曲包络重叠=交叉淡变)
(function () {
  var ctx = makeMockCtx(), p = createAudioPresenter({ context: ctx });
  p.present({ view: { audio: { music: 'calm' } } });
  var n1 = nOsc(ctx);
  p.present({ view: { audio: { music: 'tense' } } });          // 换名
  ok('R1 music 换名:旧曲经 musicBus 淡出(linRamp 0.0001@1)而非硬切', has(ctx, 'gain.linRamp:0.0001@1'));
  ok('R2 music 换名:旧节点延迟 1.0s 停(osc.stopAt:1)+ 新曲已排定(振荡器增)', has(ctx, 'osc.stopAt:1') && nOsc(ctx) > n1);
  ok('R3 撤 music → 同样淡出停、不抛;同 key 不重排守恒(L2 已锁)', !throws(function () { p.present({ view: { audio: {} } }); }));
})();

// R4/R5 新曲淡入(交叉淡变的"进半边";治端用户"新场景 bgm 前几音符撞上一场景残响打架")
(function () {
  var ctx = makeMockCtx(), p = createAudioPresenter({ context: ctx });
  p.present({ view: { audio: { music: 'calm' } } });          // 起曲
  ok('R4 起 music:新曲 musicBus 淡入(linRamp 到 1)= 不再满音量硬起(变异=musicBus.gain=1 立即满→无 linRamp:1→红)', has(ctx, 'gain.linRamp:1@'));
  p.present({ view: { audio: { music: 'tense' } } });         // 换曲
  ok('R5 换 music:同帧旧曲淡出(0.0001@)+ 新曲淡入(1@)= 完整交叉淡变(丝滑转场)', has(ctx, 'gain.linRamp:0.0001@') && has(ctx, 'gain.linRamp:1@'));
})();

// T. v13 音色库(端用户:"风格变了音色没变还是 8bit"——全声部裸振荡器 → 每声部专属节点图;调研双源核实参数)
(function () {
  var ctx = makeMockCtx();
  var p = createAudioPresenter({ context: ctx });
  p.present({ view: { audio: { music: 'eastern' } } });
  ok('T1 master 尾端挂 DynamicsCompressor(安全限幅,多声部叠加防削波)', has(ctx, 'createDynamicsCompressor'));
  ok('T2 eastern(pluck 板)→ Karplus-Strong 真拨弦:有 createDelay(反馈环)+ createBufferSource(噪声 burst)', has(ctx, 'createDelay') && has(ctx, 'createBufferSource'));
  var ctx2 = makeMockCtx();
  var p2 = createAudioPresenter({ context: ctx2 });
  p2.present({ view: { audio: { music: 'sacral' } } });
  ok('T3 sacral(organ 板)→ 加法谐波管风琴:createPeriodicWave + osc.setPeriodicWave(Hammond 拉杆 868800004)', has(ctx2, 'createPeriodicWave') && has(ctx2, 'osc.setPeriodicWave'));
  var ctx3 = makeMockCtx();
  var p3 = createAudioPresenter({ context: ctx3 });
  p3.present({ view: { audio: { music: 'tense' } } });
  ok('T4 鼓重做:kick=正弦 150Hz 扫频(osc.start:150)+ snare 鼓体 100Hz 三角(osc.start:100)+ 噪声路(createBuffer)', has(ctx3, 'osc.start:150') && has(ctx3, 'osc.start:100') && has(ctx3, 'createBuffer'));
  ok('T5 音色板经 spec.timbre 透传(resolveMusic 在 compose 层已验;此处链路=排定不抛、节点图建立)', nOsc(ctx3) > 0 && has(ctx3, 'createBiquadFilter'));
  // 未知音色板名 → warn 一次 + 回退默认(不抛=音色降级可接受;同 art 未知预设先例)
  var warned = [], origWarn = console.warn; console.warn = function (m) { warned.push(String(m)); };
  var ctx4 = makeMockCtx();
  var p4 = createAudioPresenter({ context: ctx4 });
  var threw = throws(function () { p4.present({ view: { audio: { music: { preset: 'calm', timbre: { pad: '没这个板' } } } } }); });
  console.warn = origWarn;
  ok('T6 未知音色板名 → 不抛 + console.warn 点名可选板', !threw && warned.some(function (m) { return m.indexOf('未知音色板') >= 0 && m.indexOf('organ') >= 0; }));
  // T7 批A 新板(strings 弦垫 / brass 铜管上扫 / harp 竖琴长延音)排定不抛 + 预设已吃上
  var ctx5 = makeMockCtx();
  var p5 = createAudioPresenter({ context: ctx5 });
  var t7ok = !throws(function () {
    p5.present({ view: { audio: { music: 'pastoral' } } });   // pad strings
    p5.present({ view: { audio: { music: 'heroic' } } });     // lead brass
    p5.present({ view: { audio: { music: 'mystery' } } });    // arp harp(KS 路)
  });
  ok('T7 新音色板 strings/brass/harp 排定不抛(预设 pastoral/heroic/mystery 已带)', t7ok && nOsc(ctx5) > 0 && has(ctx5, 'createDelay'));
  // U. v14 MIDI 路:{midi:base64} 解析→音色库排定;坏文件 fail-loud;loop/gain 选项
  (function () {
    function u16(v){return [v>>8&255,v&255];} function u32(v){return [v>>>24&255,v>>>16&255,v>>>8&255,v&255];}
    var pad=[65,65,65,65,65,65,65,65,65,65,65,65,65,65,65,65,65,65,65,65];
    var body=[0x00,0xFF,0x01,20].concat(pad,[0x00,0x90,57,100, 0x83,0x60,0x80,57,0]); // 前置 meta 把音符推到 base64 前48字符之后
    var tr=[0x4D,0x54,0x72,0x6B].concat(u32(body.length+4),body,[0x00,0xFF,0x2F,0x00]);
    var bytes=new Uint8Array([0x4D,0x54,0x68,0x64].concat(u32(6),u16(0),u16(1),u16(480),tr));
    var b64=Buffer.from(bytes).toString('base64');
    var ctxM=makeMockCtx(); var pM=createAudioPresenter({context:ctxM});
    pM.present({view:{audio:{music:{midi:b64}}}});
    ok('U1 MIDI 路排定(A3=220 经 pluck 进 KS:createDelay+bufferSource)', has(ctxM,'createDelay') && has(ctxM,'createBufferSource'));
    var beforeSame = nOsc(ctxM);
    pM.present({view:{audio:{music:{midi:b64}}}});
    ok('U2 同 midi 同 key 不重排(振荡器数不变)', nOsc(ctxM) === beforeSame);
    var body2 = body.slice(); body2[28] = 58; body2[33] = 58;               // 同长度/前48 base64，后半音符不同
    var tr2=[0x4D,0x54,0x72,0x6B].concat(u32(body2.length+4),body2,[0x00,0xFF,0x2F,0x00]);
    var b642=Buffer.from(new Uint8Array([0x4D,0x54,0x68,0x64].concat(u32(6),u16(0),u16(1),u16(480),tr2))).toString('base64');
    var beforeOther = nOsc(ctxM);
    pM.present({view:{audio:{music:{midi:b642,loop:false}}}});
    ok('U2b 同长度/前缀但内容不同的 MIDI 不碰撞，第二首重新解析排定', b64.length === b642.length && nOsc(ctxM) > beforeOther);
    var ctxB=makeMockCtx(); var pB=createAudioPresenter({context:ctxB});
    ok('U3 坏 midi(非 SMF base64)→ fail-loud 抛', throws(function(){ pB.present({view:{audio:{music:{midi:Buffer.from('hello world!!').toString('base64')}}}}); }));
    var ctxG=makeMockCtx(); var pG=createAudioPresenter({context:ctxG});
    ok('U4 gain 缩放/loop:false 不抛(单遍排定)', !throws(function(){ pG.present({view:{audio:{music:{midi:b64,gain:0.5,loop:false}}}}); }));
  })();
})();

// X. 乐器音色库扩展(av-diversity §二:pad-choir/glass · lead-flute/reed · arp-kalimba · bass-sub/organ)。
//    音色经 spec.timbre[role]='板名' 透传(零新契约字段);现有板字节级不变;新板各有专属节点图特征 + mock 降级不抛 + 停止态(节点延迟 stop)。
(function () {
  function nBuf(c) { return c._log.filter(function (x) { return x === 'createBufferSource'; }).length; }
  function nBiq(c) { return c._log.filter(function (x) { return x === 'createBiquadFilter'; }).length; }
  function nPW(c) { return c._log.filter(function (x) { return x === 'createPeriodicWave'; }).length; }
  function nWS(c) { return c._log.filter(function (x) { return x === 'createWaveShaper'; }).length; }
  function nStop(c) { return c._log.filter(function (x) { return x === 'osc.stop'; }).length; }
  function mk(timbre, role, opts) { var c = makeMockCtx(); var spec = { mode: 'minor', key: 'C', instruments: [role], intensity: 0.6, melody: 'flowing', timbre: timbre }; createAudioPresenter({ context: c }).startMusic(spec); return c; }

  // X1 pad-choir:多锯齿 unison + 并联 bandpass 共振峰(每音 3 osc + vibrato LFO = 4 osc/note;每音 3 个 formant bandpass)
  var cChoir = mk({ pad: 'choir' }, 'pad');
  ok('X1 pad-choir:多锯齿 unison + 并联 bandpass formant(osc>0、有 vibrato、bandpass 三共振峰)+ 节点延迟 stop',
    nOsc(cChoir) > 0 && nBiq(cChoir) > 0 && nBiq(cChoir) % 3 === 0 && has(cChoir, 'osc.stop'));
  // X1b choir 无 createBiquadFilter → 退化 lowpass(不抛、仍发声)
  var cChoirNoBp = makeMockCtx(); delete cChoirNoBp.createBiquadFilter;
  ok('X1b pad-choir 无 createBiquadFilter → 退化 lowpass(不抛、仍建振荡器)',
    !throws(function () { createAudioPresenter({ context: cChoirNoBp }).startMusic({ mode: 'minor', key: 'C', instruments: ['pad'], intensity: 0.6, timbre: { pad: 'choir' } }); }) && nOsc(cChoirNoBp) > 0);

  // X2 pad-glass:三角+正弦 + 高八度 shimmer(每音 3 osc)+ 高截止 lowpass(每音 1 biquad)
  var cGlass = mk({ pad: 'glass' }, 'pad');
  ok('X2 pad-glass:三角+正弦+高八度 shimmer(3 osc/note)+ 高截止 lowpass(biquad)+ 节点延迟 stop',
    nOsc(cGlass) > 0 && nBiq(cGlass) > 0 && has(cGlass, 'osc.stop'));

  // X3 lead-flute:近正弦基波(2 osc)+ 亮度颤音 LFO(第3 osc)+ 气声 chiff(BufferSource)+ 暖低通
  var cFlute = mk({ lead: 'flute' }, 'lead');
  ok('X3 lead-flute:近正弦基波 + 亮度颤音 LFO + 气声 chiff(BufferSource)+ 暖低通(biquad)+ stop',
    nOsc(cFlute) > 0 && nBuf(cFlute) > 0 && nBiq(cFlute) > 0 && has(cFlute, 'osc.stop'));
  // X3b flute 无 createBiquadFilter → 退回音高 vibrato(不抛、仍发声)
  var cFluteNoBp = makeMockCtx(); delete cFluteNoBp.createBiquadFilter;
  ok('X3b lead-flute 无 createBiquadFilter → 退回 vibrato(不抛、仍建振荡器)',
    !throws(function () { createAudioPresenter({ context: cFluteNoBp }).startMusic({ mode: 'major', key: 'C', instruments: ['lead'], intensity: 0.6, melody: 'flowing', timbre: { lead: 'flute' } }); }) && nOsc(cFluteNoBp) > 0);

  // X4 lead-reed:显式奇次 PeriodicWave(reedWave 缓存=仅 1 次 createPeriodicWave 复用全曲)+ setPeriodicWave + 木质带通
  var cReed = mk({ lead: 'reed' }, 'lead');
  ok('X4 lead-reed:奇次 PeriodicWave(reedWave 缓存,仅建 1 次复用)+ osc.setPeriodicWave + 木质带通(biquad)+ stop',
    nPW(cReed) === 1 && has(cReed, 'osc.setPeriodicWave') && nBiq(cReed) > 0 && has(cReed, 'osc.stop'));
  // X4b reed 无 createPeriodicWave → 退化 square(单方波亦含奇次,不抛、仍发声)
  var cReedNoPW = makeMockCtx(); delete cReedNoPW.createPeriodicWave;
  ok('X4b lead-reed 无 createPeriodicWave → 退化 square(不抛、仍建振荡器、不调 setPeriodicWave)',
    !throws(function () { createAudioPresenter({ context: cReedNoPW }).startMusic({ mode: 'major', key: 'C', instruments: ['lead'], intensity: 0.6, melody: 'flowing', timbre: { lead: 'reed' } }); }) && nOsc(cReedNoPW) > 0 && !has(cReedNoPW, 'osc.setPeriodicWave'));

  // X5 arp-kalimba:2-op FM(car+mod=2 osc/note)+ 拇指 click(noiseHit BufferSource)
  var cKal = mk({ arp: 'kalimba' }, 'arp');
  ok('X5 arp-kalimba:2-op FM(car+mod 振荡器)+ 拇指 click(noiseHit BufferSource)+ stop',
    nOsc(cKal) > 0 && nBuf(cKal) > 0 && has(cKal, 'osc.stop'));
  // X5b arp 默认仍 pluck(不给 timbre → 走 KS/FM 拨弦,不走 kalimba)
  var cArpDef = makeMockCtx(); createAudioPresenter({ context: cArpDef }).startMusic({ mode: 'minor', key: 'C', instruments: ['arp'], intensity: 0.6 });
  ok('X5b arp 缺省仍走 pluck(无 timbre → 不接管为 kalimba;有 createDelay=KS 路或 FM 路,排定不抛)',
    !throws(function () {}) && nOsc(cArpDef) > 0);

  // X6 bass-sub:纯正弦 + 八度下 sub(2 osc/note)+ 轻 WaveShaper 软饱和
  var cSub = mk({ bass: 'sub' }, 'bass');
  ok('X6 bass-sub:纯正弦 + 八度下 808(2 osc/note)+ WaveShaper 软饱和 + stop',
    nOsc(cSub) > 0 && nWS(cSub) > 0 && has(cSub, 'osc.stop'));
  var cSadDerived = makeMockCtx(); createAudioPresenter({ context: cSadDerived }).startMusic('sad');
  ok('X6c 预设→composer 派生 timbre→presenter 接缝保真：sad 默认 sub bass 真建 WaveShaper', nWS(cSadDerived) > 0);
  // X6b sub 无 createWaveShaper → 跳过软饱和直连(不抛、仍发声)
  var cSubNoWS = makeMockCtx(); delete cSubNoWS.createWaveShaper;
  ok('X6b bass-sub 无 createWaveShaper → 跳过软饱和直连(不抛、仍建振荡器)',
    !throws(function () { createAudioPresenter({ context: cSubNoWS }).startMusic({ mode: 'minor', key: 'C', instruments: ['bass'], intensity: 0.6, timbre: { bass: 'sub' } }); }) && nOsc(cSubNoWS) > 0 && nWS(cSubNoWS) === 0);

  // X7 bass-organ:16′ organWave(PeriodicWave 缓存,仅 1 次)+ 8′ 加固(2 osc/note)+ setPeriodicWave
  var cBOrg = mk({ bass: 'organ' }, 'bass');
  ok('X7 bass-organ:16′ organWave(PeriodicWave 缓存,仅建 1 次)+ 8′ 加固 + osc.setPeriodicWave + stop',
    nPW(cBOrg) === 1 && has(cBOrg, 'osc.setPeriodicWave') && nOsc(cBOrg) > 0 && has(cBOrg, 'osc.stop'));

  // X8 bass 默认路径字节级等价(无 pal → 锯齿低通下扫 + 正弦 sub,不建 WaveShaper/PeriodicWave)
  var cBDef = makeMockCtx(); createAudioPresenter({ context: cBDef }).startMusic({ mode: 'minor', key: 'C', instruments: ['bass'], intensity: 0.6 });
  ok('X8 bass 默认(无 pal)字节级等价:锯齿下扫(biquad lowpass)+ 正弦 sub,不建 WaveShaper/PeriodicWave',
    nOsc(cBDef) > 0 && nBiq(cBDef) > 0 && nWS(cBDef) === 0 && nPW(cBDef) === 0);

  // X9 未知 bass 板名 → warn 一次 + 回退默认(fail-loud 分层:音色降级 warn 非 throw)
  var warned = [], origWarn = console.warn; console.warn = function (m) { warned.push(String(m)); };
  var cBadBass = makeMockCtx();
  var threwBB = throws(function () { createAudioPresenter({ context: cBadBass }).startMusic({ mode: 'minor', key: 'C', instruments: ['bass'], intensity: 0.6, timbre: { bass: '没这个板' } }); });
  console.warn = origWarn;
  ok('X9 未知 bass 板名 → 不抛 + console.warn 点名可选板(sub/organ),回退默认锯齿',
    !threwBB && nOsc(cBadBass) > 0 && warned.some(function (m) { return m.indexOf('未知音色板') >= 0 && m.indexOf('sub') >= 0 && m.indexOf('organ') >= 0; }));

  // X10 确定性:同板两次 startMusic → 节点计数完全一致(种子 PRNG / role 固定,非 Math.random)
  var cD1 = mk({ pad: 'choir' }, 'pad'), cD2 = mk({ pad: 'choir' }, 'pad');
  ok('X10 确定性:同 pad-choir 两次 → 振荡器/bandpass 计数一致(确定性排定)',
    nOsc(cD1) === nOsc(cD2) && nBiq(cD1) === nBiq(cD2));

  // X11 新板都不抛(全 7 板各自经 spec.timbre 排定不抛 = 端到端链路通)
  var pals = [['pad', 'choir'], ['pad', 'glass'], ['lead', 'flute'], ['lead', 'reed'], ['arp', 'kalimba'], ['bass', 'sub'], ['bass', 'organ']];
  ok('X11 全 7 新板各自经 spec.timbre 排定不抛(端到端链路通)',
    pals.every(function (pr) { var c = makeMockCtx(); var tb = {}; tb[pr[0]] = pr[1]; return !throws(function () { createAudioPresenter({ context: c }).startMusic({ mode: 'minor', key: 'C', instruments: [pr[0]], intensity: 0.6, melody: 'flowing', timbre: tb }); }) && nOsc(c) > 0; }));

  // ── batch 5:4 个新 bass 音色板 ──
  function nBufB(c) { return c._log.filter(function (x) { return x === 'createBufferSource'; }).length; }
  function nDel(c) { return c._log.filter(function (x) { return x === 'createDelay'; }).length; }
  // X12 bass-upright:Karplus-Strong(buffer source + delay 反馈环)+ 正弦 sub;有 createDelay → 走 KS 主路
  var cUp = mk({ bass: 'upright' }, 'bass');
  ok('X12 bass-upright:KS 拨弦(bufferSource + delay 环)+ sub + stop(变异=删 upright 分支→走默认无 delay→红)',
    nBufB(cUp) > 0 && nDel(cUp) > 0 && nOsc(cUp) > 0 && has(cUp, 'osc.stop'));
  // X12b upright 无 createDelay → 降级走默认锯齿(不抛、仍发声)
  var cUpND = makeMockCtx(); delete cUpND.createDelay;
  ok('X12b bass-upright 无 createDelay → 降级默认锯齿(不抛 + 仍建振荡器,无 bufferSource)',
    !throws(function () { createAudioPresenter({ context: cUpND }).startMusic({ mode: 'minor', key: 'C', instruments: ['bass'], intensity: 0.6, timbre: { bass: 'upright' } }); }) && nOsc(cUpND) > 0);
  // X13 bass-picked:三角 + 高八度锯齿 + 滤波上扫 + WaveShaper 软饱和
  var cPk = mk({ bass: 'picked' }, 'bass');
  ok('X13 bass-picked:三角+锯齿(2 osc)+ biquad 上扫 + WaveShaper + stop(变异=删 picked 分支→无 WaveShaper→红)',
    nOsc(cPk) >= 2 && nBiq(cPk) > 0 && nWS(cPk) > 0 && has(cPk, 'osc.stop'));
  // X14 bass-synth:方波 + 短滤波 sweep + 正弦 sub(无 WaveShaper/PW,区别于 picked/organ)
  var cSy = mk({ bass: 'synth' }, 'bass');
  ok('X14 bass-synth:方波 + biquad sweep + sub(2 osc,无 WaveShaper/PW;变异=删 synth 分支→走默认→仍过?靠 X16 锚)',
    nOsc(cSy) >= 2 && nBiq(cSy) > 0 && nWS(cSy) === 0 && nPW(cSy) === 0 && has(cSy, 'osc.stop'));
  // X15 bass-sine-pluck:正弦 + FM 调制(2 osc)+ 低通,无 WaveShaper/PW;最克制但长 pedal 仍须有低频 body。
  var cSP = mk({ bass: 'sine-pluck' }, 'bass');
  ok('X15 bass-sine-pluck:正弦 + FM mod(2 osc)+ biquad,无 WaveShaper/PW + stop(变异=删分支→红)',
    nOsc(cSP) >= 2 && nBiq(cSP) > 0 && nWS(cSP) === 0 && nPW(cSP) === 0 && has(cSP, 'osc.stop'));
  function bodyTargets(c) { return c._log.filter(function (x) { return x.indexOf('gain.target:') === 0; }).map(function (x) { return Number(x.slice(12).split('@')[0]); }).filter(function (v) { return v > 0 && v < 0.1; }); }
  ok('X15b sine-pluck 起音后保留克制的非零低频 body（长 pedal 不退化成约 100ms 瞬态；变异=sustain 回 0→红）', bodyTargets(cSP).length > 0);
  var cCalmDerived = makeMockCtx(); createAudioPresenter({ context: cCalmDerived }).startMusic('calm');
  var cCalmPadOnly = makeMockCtx(); createAudioPresenter({ context: cCalmPadOnly }).startMusic({ preset: 'calm', instruments: ['pad'] });
  ok('X15c calm 预设经 composer 派生的 sine-pluck 真增加持续声路（与同 preset 的 pad-only 差分，pad 自身 sustain 不能替 bass 假绿）',
    bodyTargets(cCalmDerived).length > bodyTargets(cCalmPadOnly).length);
  // X16 KNOWN.bass 含全 4 新键:未知名才 warn,upright/picked/synth/sine-pluck 不 warn(板名逐字一致,接缝防御)
  var warnedB5 = [], owB5 = console.warn; console.warn = function (m) { warnedB5.push(String(m)); };
  ['upright', 'picked', 'synth', 'sine-pluck'].forEach(function (p) { var c = makeMockCtx(); createAudioPresenter({ context: c }).startMusic({ mode: 'minor', key: 'C', instruments: ['bass'], intensity: 0.6, timbre: { bass: p } }); });
  console.warn = owB5;
  ok('X16 4 新 bass 板都在 KNOWN.bass(无"未知音色板"warn;变异=KNOWN 漏加某键→该板 warn→红)',
    !warnedB5.some(function (m) { return m.indexOf('未知音色板') >= 0; }));
})();

// CH. 无词吟咏公共音色(chant-timbre-design):lead 乐句 → 双声门源 + F1-F3 元音 formant 运动。
//     本段先作为反向牙落地:旧 runtime 把 chant 当未知 soft lead，CH1-CH6 必须稳定红；既有 choir/flute/reed 由 CH7 + X1/X3/X4 锁零回归。
(function () {
  function near(a, b) { return Math.abs(a - b) < 1e-6; }
  function chantCtx(opts) {
    opts = opts || {};
    var c = makeMockCtx(); c._filters = []; c._gains = []; c._automation = []; c._oscillators = [];
    function audioParam(kind, initial, canAutomate) {
      var value = initial, rec = { kind: kind, ops: [] }, p = {};
      Object.defineProperty(p, 'value', {
        get: function () { return value; },
        set: function (v) { value = v; rec.ops.push({ op: 'value', value: v }); c._automation.push([kind, 'value', v]); }
      });
      if (canAutomate !== false) {
        p.setValueAtTime = function (v, t) { value = v; rec.ops.push({ op: 'set', value: v, time: t }); c._automation.push([kind, 'set', v, t]); };
        p.linearRampToValueAtTime = function (v, t) { value = v; rec.ops.push({ op: 'linear', value: v, time: t }); c._automation.push([kind, 'linear', v, t]); };
        p.exponentialRampToValueAtTime = function (v, t) { value = v; rec.ops.push({ op: 'exponential', value: v, time: t }); c._automation.push([kind, 'exponential', v, t]); };
        p.setTargetAtTime = function (v, t, tau) { value = v; rec.ops.push({ op: 'target', value: v, time: t, tau: tau }); c._automation.push([kind, 'target', v, t, tau]); };
        p.setValueCurveAtTime = function (vs, t, dur) { var vals = Array.prototype.slice.call(vs || []); if (vals.length) value = vals[vals.length - 1]; rec.ops.push({ op: 'curve', values: vals, time: t, dur: dur }); c._automation.push([kind, 'curve', vals, t, dur]); };
      }
      rec.param = p; return rec;
    }
    c.createGain = function () {
      c._log.push('createGain'); var gr = audioParam('gain', 0, true); c._gains.push(gr);
      return { gain: gr.param, connect: function () {}, disconnect: function () {} };
    };
    c.createOscillator = function () {
      c._log.push('createOscillator');
      var fr = audioParam('osc.frequency', 0, true), de = audioParam('osc.detune', 0, !opts.noDetuneAutomation);
      var o = { type: '', frequency: fr.param, detune: de.param, _freqRec: fr, _detuneRec: de, connect: function () {}, disconnect: function () {}, setPeriodicWave: function () { c._log.push('osc.setPeriodicWave'); }, start: function () {}, stop: function () {} };
      c._oscillators.push(o); return o;
    };
    if (opts.noFilter) delete c.createBiquadFilter;
    else c.createBiquadFilter = function () {
      c._log.push('createBiquadFilter');
      var fr = audioParam('filter.frequency', 350, !opts.noFilterAutomation), qr = audioParam('filter.Q', 1, !opts.noFilterAutomation);
      var f = { type: '', frequency: fr.param, Q: qr.param, _freqRec: fr, _qRec: qr, connect: function () {}, disconnect: function () {} };
      c._filters.push(f); return f;
    };
    return c;
  }
  function longSpec() { return { mode: 'major', key: 'C', tempo: 48, progression: ['I'], instruments: ['lead'], intensity: 0.6, melody: 'motif:[0,2,4]', seed: 42, timbre: { lead: 'chant' } }; }
  function shortSpec() { return { mode: 'major', key: 'C', tempo: 200, progression: ['I'], instruments: ['lead'], intensity: 0.6, melody: 'motif:[0,1,2,3,4,5,6,7,8,9,10,11]', seed: 35, timbre: { lead: 'chant' } }; }
  function bandpasses(c) { return c._filters.filter(function (f) { return f.type === 'bandpass'; }); }
  function filterMoves(c) {
    var out = [];
    bandpasses(c).forEach(function (f) { f._freqRec.ops.forEach(function (op) { if (op.op === 'linear' || op.op === 'exponential' || op.op === 'target' || op.op === 'curve') out.push(op); }); });
    return out;
  }
  function allGainValues(c) {
    var out = [];
    c._gains.forEach(function (g) { g.ops.forEach(function (op) { if (typeof op.value === 'number') out.push(op.value); if (op.values) out = out.concat(op.values); }); });
    return out;
  }
  function ornamentTracks(c) {
    return c._oscillators.map(function (o) { return o._detuneRec.ops.filter(function (op) { return (op.op === 'set' || op.op === 'linear') && Math.abs(op.value) >= 100; }); }).filter(function (ops) { return ops.length; });
  }
  function ornamentSignature(c) {
    return ornamentTracks(c).map(function (ops) { var t0 = ops[0].time; return ops.map(function (op) { return [op.op, op.value, +(op.time - t0).toFixed(6)]; }); });
  }

  // CH1 必须首先运行:旧实现会 warn-once 并缓存 lead:chant；本牙在缓存前锁“chant 是已知板”及无 filter 时的有声退化。
  var c1 = chantCtx({ noFilter: true }), warned1 = [], ow1 = console.warn, threw1 = false;
  console.warn = function (m) { warned1.push(String(m)); };
  try { createAudioPresenter({ context: c1 }).startMusic(longSpec()); } catch (e) { threw1 = true; }
  console.warn = ow1;
  ok('CH1 lead-chant 是 KNOWN 板 + 无 createBiquadFilter 仍有声不抛(旧实现未知板 warn→红)',
    !threw1 && nOsc(c1) > 0 && !warned1.some(function (m) { return m.indexOf('未知音色板') >= 0 && m.indexOf('chant') >= 0; }));

  var c2 = chantCtx(); createAudioPresenter({ context: c2 }).startMusic(longSpec());
  var bp2 = bandpasses(c2), moves2 = filterMoves(c2);
  ok('CH2 lead-chant 建三 formant/音 + 平滑元音 frequency automation(变异=fixed-ah 或 soft lead→红)',
    bp2.length >= 3 && bp2.length % 3 === 0 && nOsc(c2) >= (bp2.length / 3) * 3 && moves2.length >= bp2.length);

  var tenorFreq = [650,1080,2650,400,1700,2600,290,1870,2800,800,350,600,2700];
  var tenorQ = [650/80,1080/90,2650/120,400/70,1700/80,2600/100,290/40,1870/90,2800/100,800/80,350/40,600/60,2700/100];
  var relAmp = [-6,-7,-14,-12,-15,-18,-10,-20,-17].map(function (db) { return Math.pow(10, db / 20); });
  var freqSeen = bp2.some(function (f) { return f._freqRec.ops.some(function (op) { return typeof op.value === 'number' && tenorFreq.some(function (v) { return near(op.value, v); }); }); });
  var qSeen = bp2.some(function (f) { return tenorQ.some(function (v) { return near(f.Q.value, v); }); });
  var ampVals = allGainValues(c2), ampSeen = ampVals.some(function (v) { return relAmp.some(function (want) { return near(v, want); }); });
  var ampMoves = c2._gains.some(function (g) { return g.ops.some(function (op) { return op.op === 'linear' || op.op === 'target' || op.op === 'curve'; }) && g.ops.some(function (op) { return typeof op.value === 'number' && relAmp.some(function (want) { return near(op.value, want); }); }); });
  ok('CH3 chant 真消费 Csound tenor frequency + relative dB→gain + bandwidth→Q，且 formant gain 随元音运动', freqSeen && qSeen && ampSeen && ampMoves);

  var c4 = chantCtx(); createAudioPresenter({ context: c4 }).startMusic(shortSpec());
  ok('CH4 <0.22s 短 lead 音只定首元音、不排第二元音滑动(变异=所有音都滑→红)', bandpasses(c4).length >= 3 && filterMoves(c4).length === 0);

  var c5 = chantCtx({ noFilterAutomation: true }), threw5 = false;
  try { createAudioPresenter({ context: c5 }).startMusic(longSpec()); } catch (e) { threw5 = true; }
  ok('CH5 filter AudioParam 缺 automation → 固定首元音仍有声不抛(不瞬跳末元音)', !threw5 && bandpasses(c5).length >= 3 && nOsc(c5) > 0);

  var c6a = chantCtx(), c6b = chantCtx(); createAudioPresenter({ context: c6a }).startMusic(longSpec()); createAudioPresenter({ context: c6b }).startMusic(longSpec());
  ok('CH6 同 chant spec → formant/增益 automation 日志逐项一致(确定性,无 Math.random)', bandpasses(c6a).length > 0 && c6a._automation.length > 0 && JSON.stringify(c6a._automation) === JSON.stringify(c6b._automation));
  function vowelSignature(c) { return bandpasses(c).map(function (f) { return f._freqRec.ops.map(function (op) { return [op.op, op.value]; }); }); }
  var c6c = chantCtx(); c6c.currentTime = 12.501; createAudioPresenter({ context: c6c }).startMusic(longSpec());
  ok('CH6b 同 chant spec 在不同 AudioContext.currentTime 起播 → 元音轮廓仍一致(不能拿设备绝对时钟选元音)', JSON.stringify(vowelSignature(c6a)) === JSON.stringify(vowelSignature(c6c)));
  var repeatSpec = { mode: 'major', key: 'C', tempo: 48, progression: ['I'], instruments: ['lead'], intensity: 0.6, melody: 'motif:[0,0,0]', seed: 42, timbre: { lead: 'chant' } };
  var c6d = chantCtx(); createAudioPresenter({ context: c6d }).startMusic(repeatSpec);
  var noteStarts = [];
  for (var bi = 0; bi < bandpasses(c6d).length; bi += 3) { var setOp = bandpasses(c6d)[bi]._freqRec.ops.filter(function (op) { return op.op === 'set'; })[0]; noteStarts.push(setOp && setOp.value); }
  ok('CH6c 同音同长的连续 lead 事件仍可随段内位置换元音轮廓(不能整句每音复制同一口型)', noteStarts.filter(function (v, i, a) { return a.indexOf(v) === i; }).length >= 2);

  var ornamentSpec = { preset: 'sacral', tempo: 48, instruments: ['lead'], intensity: 0.62, melody: 'motif:[0,2,4,2]', seed: 3207, timbre: { lead: 'chant' } };
  var c8 = chantCtx(); createAudioPresenter({ context: c8 }).startMusic(ornamentSpec);
  var ot8 = ornamentTracks(c8), voiced8 = c8._oscillators.length / 3;   // 每音 2 声门源 + 1 vibrato LFO；大幅 detune 只会落在前两者
  function relativeTrack(ops) { var cents0 = ops[0].value, time0 = ops[0].time; return ops.map(function (op) { return [op.op, op.value - cents0, +(op.time - time0).toFixed(6)]; }); }
  var paired8 = ot8.length >= 2 && JSON.stringify(relativeTrack(ot8[0])) === JSON.stringify(relativeTrack(ot8[1]));
  var keptDetune8 = ot8.length >= 2 && ot8[1][ot8[1].length - 1].value - ot8[0][ot8[0].length - 1].value === 4;
  ok('CH8 chant 小转音存在但稀疏；两声门源同轨且保留原 +4c 宽度(不能逐音炫技/收窄)', ot8.length >= 2 && ot8.length % 2 === 0 && ot8.length < voiced8 && paired8 && keptDetune8);
  var firstNoteOrnament = ot8.some(function (ops) { return ops.some(function (op) { return op.time < 0.61; }); });
  ok('CH9 段首不转；短音 spec 也完全不排大幅 detune', !firstNoteOrnament && ornamentTracks(c4).length === 0);
  var c10a = chantCtx(), c10b = chantCtx(); c10b.currentTime = 9.875;
  createAudioPresenter({ context: c10a }).startMusic(ornamentSpec); createAudioPresenter({ context: c10b }).startMusic(ornamentSpec);
  ok('CH10 小转音同 spec 确定，且不受 AudioContext.currentTime 绝对起播时钟影响', ornamentSignature(c10a).length > 0 && JSON.stringify(ornamentSignature(c10a)) === JSON.stringify(ornamentSignature(c10b)));
  var c11 = chantCtx({ noDetuneAutomation: true }), threw11 = false;
  try { createAudioPresenter({ context: c11 }).startMusic(ornamentSpec); } catch (e) { threw11 = true; }
  var c11b = chantCtx(); createAudioPresenter({ context: c11b }).startMusic({ mode: 'major', key: 'C', tempo: 48, progression: ['I'], instruments: ['lead'], intensity: 0.6, melody: 'motif:[0,2,4]', seed: 42, timbre: { lead: 'flute' } });
  ok('CH11 detune 无 automation 时 chant 有声不抛；非 chant lead 不排大幅转音', !threw11 && nOsc(c11) > 0 && ornamentTracks(c11).length === 0 && ornamentTracks(c11b).length === 0);

  var c7a = makeMockCtx(), c7b = makeMockCtx(), c7c = makeMockCtx();
  createAudioPresenter({ context: c7a }).startMusic({ mode: 'minor', key: 'C', instruments: ['pad'], intensity: 0.6, timbre: { pad: 'choir' } });
  createAudioPresenter({ context: c7b }).startMusic({ mode: 'major', key: 'C', instruments: ['lead'], intensity: 0.6, melody: 'flowing', timbre: { lead: 'flute' } });
  createAudioPresenter({ context: c7c }).startMusic({ mode: 'major', key: 'C', instruments: ['lead'], intensity: 0.6, melody: 'flowing', timbre: { lead: 'reed' } });
  ok('CH7 同族零回归:既有 choir/flute/reed 节点签名仍成立',
    nOsc(c7a) > 0 && c7a._log.filter(function (x) { return x === 'createBiquadFilter'; }).length % 3 === 0 && nOsc(c7b) > 0 && has(c7b, 'createBufferSource') && has(c7c, 'osc.setPeriodicWave'));
})();

// V. 易用性/逻辑审计批:音量/静音 API + 🔊 控件 + music key 时序 + 旧 musicBus 摘除
(function () {
  function memStore() { var m = {}; return { getItem: function (k) { return (k in m) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, _m: m }; }

  // V1 setMuted → master gain 0;解除 → 回 vol;偏好写入 storage('amatlas-muted')
  var ctx1 = makeMockCtx(), st1 = memStore();
  var masters = []; var oldCG = ctx1.createGain;
  ctx1.createGain = function () { var g = oldCG(); masters.push(g); return g; };
  var p1 = createAudioPresenter({ context: ctx1, storage: st1 });
  p1.present({ view: { audio: { bgm: 'theme-forest' } } });               // 触发 ensureCtx(首个 createGain = master)
  var m1 = masters[0];
  p1.setMuted(true);
  var mutedVal = m1.gain.value;
  var persisted = st1._m['amatlas-muted'] === '1';
  p1.setMuted(false);
  ok('V1 setMuted(true)→master gain=0 且偏好持久化;解除→回音量', mutedVal === 0 && persisted && m1.gain.value === 0.5 && st1._m['amatlas-muted'] == null);

  // V2 setVolume 钳位 + 静音态下调音量不出声
  p1.setVolume(0.8); var v2a = m1.gain.value;
  p1.setMuted(true); p1.setVolume(0.3); var v2b = m1.gain.value; p1.setMuted(false);
  ok('V2 setVolume 生效(0.8)且静音态调音量仍 0、解除后用新值', v2a === 0.8 && v2b === 0 && m1.gain.value === 0.3);

  // V3 持久化偏好:新会话(同 storage)构造 → muted 初始恢复,ensureCtx 后 master gain=0
  var ctx3 = makeMockCtx(), st3 = memStore(); st3.setItem('amatlas-muted', '1');
  var masters3 = []; var oCG3 = ctx3.createGain; ctx3.createGain = function () { var g = oCG3(); masters3.push(g); return g; };
  var p3 = createAudioPresenter({ context: ctx3, storage: st3 });
  p3.present({ view: { audio: { bgm: 'theme-forest' } } });
  ok('V3 上局静音 → 本局开声前即静音(master gain=0)且 isMuted()', masters3[0].gain.value === 0 && p3.isMuted() === true);

  // V4/V5 🔊 控件:install 时挂 #plugin-bar;点击切换 🔇;control:false 不挂
  function barDoc() {
    var appended = [], listeners = {};
    var bar = { appendChild: function (el) { appended.push(el); el.parentNode = bar; }, removeChild: function (el) { var i = appended.indexOf(el); if (i >= 0) appended.splice(i, 1); el.parentNode = null; } };
    return { _appended: appended, _listeners: listeners,
      querySelector: function (s) { return s === '#plugin-bar' ? bar : null; },
      getElementById: function () { return null; },
      createElement: function (tag) { return { tag: tag, className: '', textContent: '', parentNode: null, setAttribute: function () {}, appendChild: function () {} }; },
      head: { appendChild: function () {} },
      addEventListener: function (t, fn) { listeners[t] = fn; },
      removeEventListener: function (t, fn) { if (listeners[t] === fn) delete listeners[t]; } };
  }
  var d4 = barDoc();
  var p4 = createAudioPresenter({ context: makeMockCtx(), document: d4, storage: memStore() });
  p4.install({ addPresenter: function () {} });
  var btn = d4._appended.filter(function (e) { return /amatlas-audio-btn/.test(e.className); })[0];
  var was = btn && btn.textContent;
  if (btn) btn.onclick();
  ok('V4 install 挂 🔊 控件进 #plugin-bar,点击切到 🔇 静音', !!btn && /🔊/.test(was) && /🔇/.test(btn.textContent));
  var d5 = barDoc();
  var p5 = createAudioPresenter({ context: makeMockCtx(), document: d5, storage: memStore(), control: false });
  p5.install({ addPresenter: function () {} });
  ok('V5 opts.control:false → 不挂控件(escape hatch)', d5._appended.length === 0);

  var d5b = barDoc(), removedPresenter = 0;
  var p5b = createAudioPresenter({ context: makeMockCtx(), document: d5b, storage: memStore() });
  p5b.install({ addPresenter: function () { return function () { removedPresenter++; }; } });
  var disposedBtn = d5b._appended.filter(function (e) { return /amatlas-audio-btn/.test(e.className); })[0];
  p5b.dispose(); p5b.dispose();
  ok('V5b dispose 幂等撤 presenter、三手势 listener、按钮与 onclick', removedPresenter === 1 && Object.keys(d5b._listeners).length === 0 && d5b._appended.indexOf(disposedBtn) < 0 && disposedBtn.onclick === null);

  var p5c = createAudioPresenter({ context: makeMockCtx(), document: barDoc(), storage: memStore() });
  var installApi = { addPresenter: function () { return function () {}; } };
  p5c.install(installApi);
  ok('V5c 同一 AudioPresenter 重复 install 必须 fail-loud，不能覆盖 teardown 句柄', throws(function () { p5c.install(installApi); }));

  var asyncCloseHandled = false;
  var ctx5d = makeMockCtx();
  ctx5d.close = function () { return { catch: function (fn) { asyncCloseHandled = typeof fn === 'function'; } }; };
  createAudioPresenter({ context: ctx5d }).dispose();
  ok('V5d dispose 接住 AudioContext.close 的异步拒绝通道', asyncCloseHandled);

  // V6 music key 在 startMusic 成功后才提交:对象 spec 结构违约 → 每次 render 都抛(不再 fail-once 永久静音)
  var ctx6 = makeMockCtx();
  var p6 = createAudioPresenter({ context: ctx6, storage: memStore() });
  var bad = { view: { audio: { music: { mode: 'aeolian', key: 'C4' } } } };   // mode 违约(MODES 闭集)→ normalize 抛
  var t1 = throws(function () { p6.present(bad); });
  var t2 = throws(function () { p6.present(bad); });
  ok('V6 music 对象 spec 违约 → 连续两次 render 都 fail-loud(旧版第二次被同 key 吞=永久静音)', t1 && t2);

  // V7 换曲摘除旧总线:无 ramp mock(立即停路径)→ 旧 musicBus.disconnect 被调
  var disc = 0;
  var ctx7 = makeMockCtx();
  var oCG7 = ctx7.createGain;
  ctx7.createGain = function () { var g = oCG7(); delete g.gain.linearRampToValueAtTime; g.disconnect = function () { disc++; }; return g; };
  var p7 = createAudioPresenter({ context: ctx7, storage: memStore() });
  p7.present({ view: { audio: { music: 'calm' } } });
  p7.present({ view: { audio: { music: 'tense' } } });                    // 换曲 → stopMusic(无 ramp)→ 旧 bus 立即 disconnect
  ok('V7 换曲后旧 musicBus 被 disconnect(长会话不漏常驻结点)', disc >= 1);
})();

// W. 契约 v15「缺省继承」(audio-inherit-design.md):键缺失=继承(不动)/ 值=换 / false|null=停
(function () {
  function memStore() { var m = {}; return { getItem: function (k) { return (k in m) ? m[k] : null; }, setItem: function () {}, removeItem: function () {} }; }
  function nStops(c) { return c._log.filter(function (x) { return x === 'osc.stop' || x === 'src.stop'; }).length; }
  function mk() { return createAudioPresenter({ context: makeMockCtx(), storage: memStore() }); }

  function nBuf(c) { return c._log.filter(function (x) { return x === 'createBufferSource'; }).length; }
  // W1 music 键缺失(只 sfx)→ 继承:currentMusicKey 保留 → 再 present 同曲【不重启】(可靠探针:sfx 自带 stop,
  //   不能用 osc.stop 计数判;改用"再放同曲是否重排"——继承则 key 仍在、同 key 不重启)。
  var ca = makeMockCtx(); var pa = createAudioPresenter({ context: ca, storage: memStore() });
  pa.present({ view: { audio: { music: 'calm' } } });
  pa.present({ view: { audio: { sfx: ['pickup'] } } });   // 无 music 键 → 继承主轨
  var afterGap = nOsc(ca);
  pa.present({ view: { audio: { music: 'calm' } } });     // 再放同曲:若已继承(key 留)→ 不重启;若被停过→重排
  ok('W1 无 music 键(只 sfx)→ 继承(再放同曲不重排=key 未被清)', nOsc(ca) === afterGap);
  // W2 整个 audio 缺失 → 全继承(不停)
  var stopsA2 = nStops(ca);
  pa.present({ view: {} });                                // audio 整个缺失
  ok('W2 audio 整个缺失 → 全继承(不停)', nStops(ca) === stopsA2);
  // W3 显式 music:false → 停
  var cb = makeMockCtx(); var pb = createAudioPresenter({ context: cb, storage: memStore() });
  pb.present({ view: { audio: { music: 'calm' } } });
  var stopsB = nStops(cb);
  pb.present({ view: { audio: { music: false } } });
  ok('W3 music:false → 显式停(有新 stop)', nStops(cb) > stopsB);
  // W4 music:null 同样停(兼容 token)
  var cc = makeMockCtx(); var pc = createAudioPresenter({ context: cc, storage: memStore() });
  pc.present({ view: { audio: { music: 'calm' } } });
  var stopsC = nStops(cc);
  pc.present({ view: { audio: { music: null } } });
  ok('W4 music:null → 显式停(兼容 token)', nStops(cc) > stopsC);
  // W5 同曲名继承不重启;换名才换(沿用既有去重 + 继承不打断)
  var cd = makeMockCtx(); var pd = createAudioPresenter({ context: cd, storage: memStore() });
  pd.present({ view: { audio: { music: 'calm' } } });
  var oscD = nOsc(cd);
  pd.present({ view: { audio: { ambient: 'wind' } } });   // 只动 ambient、music 键缺 → music 继承不重排
  ok('W5 只声明 ambient → music 继承(不重排音乐振荡器)', nOsc(cd) - oscD <= 4);   // 仅新增 ambient 的源,不含重排 music
  // W6 ambient 键缺失 → 继承:再 present 同 ambient【不重排噪声源】(currentAmbientKey 未被清)
  var ce = makeMockCtx(); var pe = createAudioPresenter({ context: ce, storage: memStore() });
  pe.present({ view: { audio: { ambient: 'waves' } } });
  pe.present({ view: { audio: { music: 'calm' } } });     // 无 ambient 键 → ambient 继承
  var bufAfter = nBuf(ce);
  pe.present({ view: { audio: { ambient: 'waves' } } });  // 再放同 ambient:继承则 key 留 → 不重排
  ok('W6 无 ambient 键(只换 music)→ ambient 继承(再放同名不重排=key 未被清)', nBuf(ce) === bufAfter);
})();

// S. A1 乐音声部立体声声场(沉浸感):各 music 声部固定声像铺开(lead +0.3 / arp -0.3 / snare +0.2 / hihat -0.25 / pad·bass·kick 居中 0);
//    复用 bgsPanner guard(缺 createStereoPanner → 直连退化);panner 介于 voice gain 与 vOut() 之间,不破混响/换曲淡出链;确定性。
(function () {
  // 记录每个 panner 的 pan 值(voiceOut 设 p.pan.value=pan)→ 断言按 role 声像
  function pannerRecCtx() {
    var ctx = makeMockCtx(), pans = [];
    var orig = ctx.createStereoPanner;
    ctx.createStereoPanner = function () { var p = orig(); var pv = { v: 0 }; Object.defineProperty(p.pan, 'value', { get: function () { return pv.v; }, set: function (x) { pv.v = x; pans.push(x); } }); return p; };
    ctx._pans = pans; return ctx;
  }
  // S1 music 含 lead/arp(非居中声部)→ 建 StereoPanner 铺声场
  var c1 = pannerRecCtx(); createAudioPresenter({ context: c1 }).present({ view: { audio: { music: 'heroic' } } });   // heroic 含 lead(brass)+ arp + perc
  ok('S1 music(heroic,含 lead/arp/perc)→ 建 StereoPanner 铺立体声场(≥1)', nPanner(c1) >= 1 && nOsc(c1) > 3);
  // S2 按 role 声像:lead 偏右(+0.3)/ arp 偏左(-0.3)/ snare 偏右(+0.2)/ hihat 偏左(-0.25)都出现在 pan 值集合里
  var hasNear = function (arr, v) { return arr.some(function (x) { return Math.abs(x - v) < 1e-9; }); };
  ok('S2 声像按 role 铺开:lead +0.3 / arp -0.3 / snare +0.2 / hihat -0.25 均出现', hasNear(c1._pans, 0.3) && hasNear(c1._pans, -0.3) && hasNear(c1._pans, 0.2) && hasNear(c1._pans, -0.25));
  // S3 居中声部(pad/bass/kick=0)不建 panner(不多建居中 panner=字节经济);calm 只含 pad/bass/arp → 仅 arp(-0.3)建 panner
  var c3 = pannerRecCtx(); createAudioPresenter({ context: c3 }).present({ view: { audio: { music: { mode: 'major', key: 'C', instruments: ['pad', 'bass'], intensity: 0.3 } } } });   // 只 pad+bass(均居中)
  ok('S3 仅居中声部(pad+bass)→ 不建 panner(居中 0 直连,字节经济)', nPanner(c3) === 0 && nOsc(c3) > 0);
  // S4 缺 createStereoPanner(老浏览器/mock)→ 不抛、退化直连(music 仍排定振荡器、无 panner)
  var c4 = makeMockCtx(); delete c4.createStereoPanner;
  var p4 = createAudioPresenter({ context: c4 });
  ok('S4 缺 createStereoPanner → 不抛、退化直连(music 照常排定、0 panner)', !throws(function () { p4.present({ view: { audio: { music: 'heroic' } } }); }) && nPanner(c4) === 0 && nOsc(c4) > 3);
  // S5 确定性:同 music 两次 → panner 计数一致(声像是 role 固定映射,与 PRNG 无关,故必然一致)
  var c5a = pannerRecCtx(); createAudioPresenter({ context: c5a }).present({ view: { audio: { music: 'heroic' } } });
  var c5b = pannerRecCtx(); createAudioPresenter({ context: c5b }).present({ view: { audio: { music: 'heroic' } } });
  ok('S5 确定性:同 music 两次 → StereoPanner 计数一致 + pan 值序列一致(role 固定声像)', nPanner(c5a) === nPanner(c5b) && JSON.stringify(c5a._pans) === JSON.stringify(c5b._pans));
  // S6 bgm 路径(theme-*=和弦 drone,走 startBgm 非 music 声部)不受 A1 影响:仍 4 振荡器、不建 panner(bgm 非 music 声部铺场)
  var c6 = pannerRecCtx(); createAudioPresenter({ context: c6 }).present({ view: { audio: { bgm: 'theme-forest' } } });
  ok('S6 bgm(theme-forest)路径不受 A1 影响:仍 4 振荡器、bgm 不铺声场(0 panner)', nOsc(c6) === 4 && nPanner(c6) === 0);
})();

// Y. MIDI 扩展批:gmVoice 新 token 经 MIDI 路接通"已造但够不到"的音色板 + 定音鼓新声 + CC10 声像。
//    构造单音 SMF(可带 program/CC),经 present({music:{midi}}) 走真实 startMusic→musicVoice 分发(非直调内部)。
(function () {
  function u16(v) { return [v >> 8 & 255, v & 255]; } function u32(v) { return [v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255]; }
  function midiOf(prog, note, ccs) {                       // 单音 SMF base64;ccs=[[num,val],...] 可选(放 note-on 前)
    var body = [];
    if (ccs) for (var i = 0; i < ccs.length; i++) body = body.concat([0x00, 0xB0, ccs[i][0], ccs[i][1]]);
    body = body.concat([0x00, 0xC0, prog, 0x00, 0x90, note, 100, 0x83, 0x60, 0x80, note, 0]);
    var tr = [0x4D, 0x54, 0x72, 0x6B].concat(u32(body.length + 4), body, [0x00, 0xFF, 0x2F, 0x00]);
    return Buffer.from(new Uint8Array([0x4D, 0x54, 0x68, 0x64].concat(u32(6), u16(0), u16(1), u16(480), tr))).toString('base64');
  }
  function play(b64, ctx) { createAudioPresenter({ context: ctx }).present({ view: { audio: { music: { midi: b64 } } } }); }
  function nBuf(c) { return c._log.filter(function (x) { return x === 'createBufferSource'; }).length; }
  function nBiq(c) { return c._log.filter(function (x) { return x === 'createBiquadFilter'; }).length; }
  function nPW(c) { return c._log.filter(function (x) { return x === 'createPeriodicWave'; }).length; }

  var c1 = makeMockCtx(); play(midiOf(47, 50), c1);        // Timpani prog47,低音
  ok('Y1 Timpani(prog47)→ timpaniVoice:≥4 谐振模振荡器 + 噪声起音瞬态(旧折 kick 钉死 150Hz 丢音高)', nOsc(c1) >= 4 && nBuf(c1) >= 1);

  var c2 = makeMockCtx(); play(midiOf(52, 60), c2);        // Choir Aahs prog52
  ok('Y2 Choir(prog52)→ padVoice choir:formant 带通 + 多振荡器(旧 MIDI 折成 strings,无人声字符)', nBiq(c2) >= 1 && nOsc(c2) >= 3);

  var c3 = makeMockCtx(); play(midiOf(68, 60), c3);        // Oboe prog68(Reed 族)
  ok('Y3 Reed(prog68)→ leadVoice reed:奇次 PeriodicWave 簧片(旧 MIDI 折 pulse 方波太糙)', nPW(c3) >= 1);

  var c4 = makeMockCtx(); play(midiOf(73, 72), c4);        // Flute prog73(Pipe 族)
  ok('Y4 Flute(prog73)→ leadVoice flute:振荡器 + 气声 chiff(旧 MIDI 折 soft 非笛)', nOsc(c4) >= 2 && nBuf(c4) >= 1);

  var c5 = makeMockCtx(); play(midiOf(108, 60), c5);       // Kalimba prog108(Ethnic)
  ok('Y5 Kalimba(prog108)→ kalimbaVoice:FM 振荡器 + 拇指 click(此前 MIDI 折 pluck、够不到)', nOsc(c5) >= 2 && nBuf(c5) >= 1);

  function pannerRec() {                                   // 记录每 panner 的 pan 值(镜像 S 段)
    var ctx = makeMockCtx(), pans = []; var orig = ctx.createStereoPanner;
    ctx.createStereoPanner = function () { var p = orig(); var pv = { v: 0 }; Object.defineProperty(p.pan, 'value', { get: function () { return pv.v; }, set: function (x) { pv.v = x; pans.push(x); } }); return p; };
    ctx._pans = pans; return ctx;
  }
  var c6 = pannerRec(); play(midiOf(40, 60, [[10, 0]]), c6);    // strings + CC10=0(忠实 pan=-1)→ 渲染层 ×0.6 宽度
  ok('Y6 CC10=0 → StereoPanner pan=-0.6(忠实 -1 × 渲染宽度 0.6;治独奏暴露段偏一侧、保合奏分离)', nPanner(c6) >= 1 && c6._pans.some(function (x) { return Math.abs(x + 0.6) < 1e-9; }));
  var c6b = pannerRec(); play(midiOf(40, 60), c6b);            // strings 不在 VOICE_PAN、无 CC10 → 居中直连
  ok('Y6b 无 CC10(strings 居中)→ 不建 panner(字节经济、向后兼容)', nPanner(c6b) === 0);

  var c7a = makeMockCtx(); play(midiOf(47, 50, [[10, 100]]), c7a);
  var c7b = makeMockCtx(); play(midiOf(47, 50, [[10, 100]]), c7b);
  ok('Y7 同 MIDI 两次 → 振荡器 + panner 计数一致(确定性,无非种子随机)', nOsc(c7a) === nOsc(c7b) && nPanner(c7a) === nPanner(c7b));
})();

// Z. 真占空比脉冲波 PWM(lead='pulse':锯齿 → WaveShaper sign 整形 + ConstantSource DC 偏移占空比 + 0.28Hz LFO 扫 = 经典 PWM/SID 涌动,替旧"双方波 detune 近似")
(function () {
  var ctx = makeMockCtx(); var p = createAudioPresenter({ context: ctx });
  var threw = null; try { p.present({ view: { audio: { music: 'battle' } } }); } catch (e) { threw = e; }   // battle lead='pulse'
  ok('Z1 pulse lead(battle)PWM 路径无抛错' + (threw ? ': ' + (threw.stack || threw) : ''), !threw);
  ok('Z2 pulse lead 真 PWM:建 ConstantSource(DC 偏移控占空比 + LFO 扫=涌动;createConstantSource 仅 pulse PWM 用 → 变异去 pdc/退回双方波→无 createConstantSource 稳定红)', has(ctx, 'createConstantSource'));
  ok('Z3 pulse lead 经 WaveShaper sign 整形(锯齿→可调占空比方波,真整形非双方波近似;注:brass 也用 WaveShaper(makeDistortionCurve),但 battle 无 brass voice→此处 WaveShaper 唯一来源=pulse,变异 shaper=null→Z3 红已证有牙)', has(ctx, 'createWaveShaper'));
  var ctx2 = makeMockCtx(); createAudioPresenter({ context: ctx2 }).present({ view: { audio: { music: 'heroic' } } });   // heroic lead≠pulse
  ok('Z4 非 pulse lead(heroic)→ 不建 ConstantSource(零误报:只 pulse 走 PWM)', !has(ctx2, 'createConstantSource'));
  var ctx3 = makeMockCtx(); createAudioPresenter({ context: ctx3 }).present({ view: { audio: { music: 'battle' } } });
  ok('Z5 PWM 确定性:battle 两次 ConstantSource 计数一致(0.28Hz LFO 固定、无 Math.random;happy-path 弱测=Z2 先绿才有意义、Z2 验存在性 Z5 验计数确定)', ctx._log.filter(function (x) { return x === 'createConstantSource'; }).length === ctx3._log.filter(function (x) { return x === 'createConstantSource'; }).length);
})();

// SX. 自定义 SfxSpec(契约 v18→v19):对象路合成(锯齿/噪声/扫频/ADSR/滤波/失真)+ fail-loud + 字符串路向后兼容
(function () {
  var c0 = makeMockCtx(); createAudioPresenter({ context: c0 }).present({ view: { audio: { sfx: ['dice-roll'] } } });
  ok('SX1 字符串预设路向后兼容:dice-roll → 1 振荡器、不走对象路(字节恒等,E1 同源守恒)', nOsc(c0) === 1 && !has(c0, 'createBufferSource'));
  var c1 = makeMockCtx(); createAudioPresenter({ context: c1 }).present({ view: { audio: { sfx: [{ type: 'sine', freq: 880, dur: 0.1, gain: 0.05 }] } } });
  ok('SX2 SfxSpec(osc)→ 建振荡器 + ADSR 包络(envADSR linearRamp)', nOsc(c1) === 1 && has(c1, 'gain.linRamp'));
  var c2 = makeMockCtx(); createAudioPresenter({ context: c2 }).present({ view: { audio: { sfx: [{ noise: true, hpFreq: 1500, dur: 0.08, gain: 0.05 }] } } });
  ok('SX3 SfxSpec(noise)→ 种子噪声 BufferSource、0 振荡器(变异 if(spec.noise)→if(false) 走 osc 路→BufferSource 消失稳定红)', has(c2, 'createBufferSource') && nOsc(c2) === 0);
  var c3 = makeMockCtx(); createAudioPresenter({ context: c3 }).present({ view: { audio: { sfx: [{ freq: 440, distort: 60, lpFreq: 1200, dur: 0.1 }] } } });
  ok('SX4 SfxSpec distort→WaveShaper + lpFreq→BiquadFilter(可选链;变异去对应分支→节点消失红)', has(c3, 'createWaveShaper') && has(c3, 'createBiquadFilter'));
  var c4 = makeMockCtx(); var t1 = false; try { createAudioPresenter({ context: c4 }).present({ view: { audio: { sfx: [{ type: 'bad-wave', freq: 440 }] } } }); } catch (e) { t1 = true; }
  ok('SX5 fail-loud:SfxSpec.type 非波形枚举 → 抛(变异去 type 检查→不抛稳定红)', t1);
  var c5 = makeMockCtx(); var t2 = false; try { createAudioPresenter({ context: c5 }).present({ view: { audio: { sfx: [{ freq: 'high' }] } } }); } catch (e) { t2 = true; }
  ok('SX6 fail-loud:SfxSpec.freq 非有限数 → 抛', t2);
  var c6 = makeMockCtx(); var t3 = false; try { createAudioPresenter({ context: c6 }).present({ view: { audio: { sfx: [123] } } }); } catch (e) { t3 = true; }
  ok('SX7 fail-loud:sfx 项既非字符串非对象(数字)→ 抛(对称 resolveAmbient)', t3);
  ok('SX7b audio.sfx 容器必须是真数组，字符串/数字/对象/array-like 均 fail-loud', ['click', 42, {}, { 0: 'click', length: 1 }].every(function (bad) { return throws(function () { createAudioPresenter({}).present({ view: { audio: { sfx: bad } } }); }); }));
  ok('SX7c audio.sfx 空数组合法', !throws(function () { createAudioPresenter({}).present({ view: { audio: { sfx: [] } } }); }));
  var c7 = makeMockCtx(); createAudioPresenter({ context: c7 }).present({ view: { audio: { sfx: [{ type: 'sawtooth', freq: 1200, freqEnd: 200, dur: 0.15 }] } } });
  ok('SX8 SfxSpec freqEnd 扫频:freq.exponentialRamp 被调(laser/zap;变异去 freqEnd 分支→无 freq.expRamp 稳定红)', nOsc(c7) === 1 && has(c7, 'freq.expRamp'));
  var c8 = makeMockCtx(); createAudioPresenter({ context: c8 }).present({ view: { audio: { sfx: [{ noise: true, dur: 0.1, gain: 0.05 }] } } });
  ok('SX9 SfxSpec(noise 无 hpFreq)→ 默认高通 1000、BufferSource、0 振荡器(默认值分支覆盖,补审计 P1)', has(c8, 'createBufferSource') && nOsc(c8) === 0);
  var c9 = makeMockCtx(); createAudioPresenter({ context: c9 }).present({ view: { audio: { sfx: [{ freqEnd: 100, dur: 0.1 }] } } });
  ok('SX10 SfxSpec(freqEnd 无 freq)→ 默认起点 440 扫频、1 振荡器 + freq.expRamp(默认值分支覆盖+有牙,补审计 P1)', nOsc(c9) === 1 && has(c9, 'freq.expRamp'));
})();

// AU. ambient-unease 并行 drone(契约 v19→v20):ambient 字段 drone 与 music 同响(修 showcase 头号 bug——文档系统教 ambient:'ambient-unease' 但原 resolveAmbient 抛)
//   诚实 corner(审计 P1):AU2 验"并行同响"(drone+music osc 同建=用户面收益),但 drone 走 bgsMaster 子总线 vs 误连 master 的**精确路由** mock 测不到(无 DSP、connect 无 target 记录)——这是全引擎音频路由的通用 mock 盲区(present-audio 头注释"真声留耳机实听";同 sfx→master / PWM 总线均不 mock 路由)。bgsVolume 生效/混响路由留真机+人工核。
(function () {
  var cD = makeMockCtx(); var tD = null; try { createAudioPresenter({ context: cD }).present({ view: { audio: { ambient: 'ambient-unease' } } }); } catch (e) { tD = e.message; }
  var droneN = nOsc(cD);
  ok('AU1 ambient:ambient-unease → drone 建(振荡器≥6 + 低通滤波)、无抛(原 resolveAmbient 抛=showcase 头号 bug 修;变异删 builder→抛 AU1 红)', !tD && droneN >= 6 && has(cD, 'createBiquadFilter'));
  var cM = makeMockCtx(); createAudioPresenter({ context: cM }).present({ view: { audio: { music: 'eerie' } } });
  var musicN = nOsc(cM);
  var cMD = makeMockCtx(); var t2 = null; try { createAudioPresenter({ context: cMD }).present({ view: { audio: { music: 'eerie', ambient: 'ambient-unease' } } }); } catch (e) { t2 = e.message; }
  ok('AU2 music + ambient:ambient-unease 并行同响:振荡器 = music + drone 两者之和、无抛(变异=删 BGS_BUILD[ambient-unease]→resolveAmbient 抛 AU2 红;旧引擎此组合抛/互斥)', !t2 && nOsc(cMD) === musicN + droneN);
  var cS = makeMockCtx(); var p3 = createAudioPresenter({ context: cS }); p3.present({ view: { audio: { ambient: 'ambient-unease' } } }); var afterDrone = nOsc(cS); p3.present({ view: { audio: { ambient: false } } });
  ok('AU3 ambient:false → 停 drone(无抛、不新建振荡器)', nOsc(cS) === afterDrone);
  var cI = makeMockCtx(); var p4 = createAudioPresenter({ context: cI }); var t4 = null; try { p4.present({ view: { audio: { music: 'eerie', ambient: 'ambient-unease' } } }); p4.present({ view: { audio: { music: false } } }); } catch (e) { t4 = e.message; }
  ok('AU4 music:false 后 drone 独立续响(ambient 独立层、无抛;停 music 不连带停 drone)', !t4);
  var cB = makeMockCtx(); createAudioPresenter({ context: cB }).present({ view: { audio: { bgm: 'ambient-unease' } } });
  ok('AU5 ambient: 与 bgm: 两路 drone 振荡器数一致(忠实复刻=两字段听感一致;双路并存 Option I)', nOsc(cD) === nOsc(cB) && droneN >= 6);
})();

// ── DR. 打击/低音干路(端用户实听「冾冾双重」终局修):鼓的噪声瞬态经 2.4s 混响 wet 0.45 → 湿声=紧跟的
//    第二记"冾"。修=DRY_ROLES(kick/snare/hihat/timpani/bass)经 musicDryBus→mDry 直达 sink、不喂 Convolver;
//    旋律声部(pad/lead/arp/drone)仍经 master→conv 保空间感。本段用【带连接追踪】的专用 mock 做图可达性断言:
//    hihat 专属 7kHz 高通滤波器 → 前向不可达 conv;pad 振荡器 → 前向可达 conv。
//    反向变异(亲验后还原):voiceOut 去 DRY_ROLES 分流(全走 vOut)→ DR1 红。
(function () {
  function trackCtx() {
    var nodes = [];
    function mk(kind, extra) {
      var n = { _kind: kind, _outs: [], connect: function (t) { this._outs.push(t); }, disconnect: function () {} };
      if (extra) for (var k in extra) n[k] = extra[k];
      nodes.push(n); return n;
    }
    var dest = mk('destination');
    var c = {
      sampleRate: 44100, currentTime: 0, destination: dest, state: 'running',
      resume: function () {}, _nodes: nodes,
      createGain: function () { return mk('gain', { gain: { value: 0, setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {}, linearRampToValueAtTime: function () {}, setTargetAtTime: function () {} } }); },
      createOscillator: function () { return mk('osc', { type: '', frequency: { value: 0, setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} }, detune: { value: 0 }, start: function () {}, stop: function () {} }); },
      createBufferSource: function () { return mk('src', { buffer: null, start: function () {}, stop: function () {} }); },
      createBiquadFilter: function () { return mk('filter', { type: '', frequency: { value: 0 }, Q: { value: 0 } }); },
      createConvolver: function () { return mk('conv', { buffer: null, normalize: true }); },
      createDynamicsCompressor: function () { return mk('comp', { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 } }); },
      createStereoPanner: function () { return mk('panner', { pan: { value: 0, setValueAtTime: function () {} } }); },
      createBuffer: function (chs, len) { return { getChannelData: function () { return new Float32Array(len); } }; },
      createWaveShaper: function () { return mk('shaper', { curve: null }); },
      createDelay: function () { return mk('delay', { delayTime: { value: 0 } }); },
      createConstantSource: function () { return mk('const', { offset: { value: 0, setValueAtTime: function () {}, setTargetAtTime: function () {}, linearRampToValueAtTime: function () {} }, start: function () {}, stop: function () {} }); },
      createPeriodicWave: function () { return {}; }, setPeriodicWave: function () {}
    };
    return c;
  }
  function reaches(from, target, seen) {
    seen = seen || new Set();
    if (from === target) return true;
    if (!from || !from._outs || seen.has(from)) return false;
    seen.add(from);
    for (var i = 0; i < from._outs.length; i++) if (reaches(from._outs[i], target, seen)) return true;
    return false;
  }
  var cT = trackCtx();
  var pT = createAudioPresenter({ context: cT });
  pT.present({ view: { audio: { music: { mode: 'major', key: 'C', progression: ['I'], instruments: ['pad', 'perc'], intensity: 0.8, feel: ['march'], melody: 'none' } } } });
  var conv = cT._nodes.filter(function (n) { return n._kind === 'conv'; })[0];
  var hhFilters = cT._nodes.filter(function (n) { return n._kind === 'filter' && n.frequency.value === 7000; });   // hihat 专属 7kHz 高通(drumVoice)
  var oscs = cT._nodes.filter(function (n) { return n._kind === 'osc' && n._outs.length; });
  var hhWet = hhFilters.filter(function (f) { return reaches(f, conv); }).length;
  var padWet = oscs.filter(function (o) { return reaches(o, conv); }).length;
  ok('DR1 鼓走干路:hihat 7kHz 滤波器 ' + hhFilters.length + ' 个,可达混响 Convolver 的 =0(干)且 ≥1 存在;变异=voiceOut 去 DRY_ROLES 分流→红', !!conv && hhFilters.length >= 1 && hhWet === 0);
  ok('DR2 旋律仍走湿路:pad 振荡器可达 Convolver ≥1(混响空间感保留、非全干)', padWet >= 1);
})();

// BB. 音乐 overhaul 批 A · bassBus 反向牙：低音须在每曲干总线内再过固定 trim，
//     且能力不足时仍沿旧干路有声退化。连接图而非源码字符串锁真实路由。
(function () {
  function trackCtx(opts) {
    opts = opts || {}; var nodes = [];
    function param(v) { var p = { value: v || 0, setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {}, linearRampToValueAtTime: function () {}, setTargetAtTime: function () {} }; if (opts.noRamp) delete p.linearRampToValueAtTime; return p; }
    function mk(kind, extra) { var n = { _kind: kind, _outs: [], _disconnected: 0, connect: function (to) { this._outs.push(to); }, disconnect: function () { this._disconnected++; } }; if (extra) Object.assign(n, extra); nodes.push(n); return n; }
    var c = { currentTime: 0, sampleRate: 44100, destination: mk('destination'), state: 'running', _nodes: nodes,
      createGain: function () { var g = mk('gain', { gain: param(0) }); if (opts.failGainAt && nodes.filter(function (n) { return n._kind === 'gain'; }).length >= opts.failGainAt) throw new Error('gain unavailable'); return g; },
      createOscillator: function () { return mk('osc', { type: '', frequency: param(0), detune: param(0), start: function () {}, stop: function () {}, setPeriodicWave: function () {} }); },
      createBufferSource: function () { return mk('src', { buffer: null, start: function () {}, stop: function () {} }); },
      createBiquadFilter: function () { return mk('filter', { type: '', frequency: param(0), Q: param(0) }); },
      createConvolver: function () { return mk('conv', { buffer: null, normalize: true }); },
      createDynamicsCompressor: function () { return mk('comp', { threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0) }); },
      createBuffer: function (ch, len) { return { getChannelData: function () { return new Float32Array(len); } }; },
      createWaveShaper: function () { return mk('shaper', { curve: null }); }, createDelay: function () { return mk('delay', { delayTime: param(0) }); },
      createPeriodicWave: function () { return {}; }, createStereoPanner: function () { return mk('panner', { pan: param(0) }); }, resume: function () {}
    };
    return c;
  }
  function reaches(from, target, seen) { seen = seen || new Set(); if (from === target) return true; if (!from || !from._outs || seen.has(from)) return false; seen.add(from); return from._outs.some(function (n) { return reaches(n, target, seen); }); }

  var c = trackCtx(), threw = false;
  try { createAudioPresenter({ context: c }).startMusic({ mode: 'major', key: 'C', progression: ['I'], instruments: ['bass', 'perc'], intensity: 0.8 }); } catch (e) { threw = true; }
  var bassOsc = c._nodes.filter(function (n) { return n._kind === 'osc' && Math.abs(n.frequency.value - 130.8127826503) < 0.01; })[0];
  var kickOsc = c._nodes.filter(function (n) { return n._kind === 'osc' && Math.abs(n.frequency.value - 150) < 0.01; })[0];
  var bassTrims = c._nodes.filter(function (n) { return n._kind === 'gain' && Math.abs(n.gain.value - 0.76) < 1e-9; });
  ok('BB1 bass 真实声路经过每曲专属 0.76 trim gain（删 bassBus/直连 musicDryBus 会红）', !threw && !!bassOsc && bassTrims.length === 1 && reaches(bassOsc, bassTrims[0]));
  ok('BB1b bassBus 只 trim bass，kick 不可达该 trim（把全部 DRY_ROLES 接到 vBass 会红）', !!kickOsc && bassTrims.length === 1 && !reaches(kickOsc, bassTrims[0]));

  var cLife = trackCtx({ noRamp: true }), pLife = createAudioPresenter({ context: cLife });
  pLife.startMusic({ mode: 'major', key: 'C', progression: ['I'], instruments: ['bass'], intensity: 0.6 });
  var oldTrim = cLife._nodes.filter(function (n) { return n._kind === 'gain' && Math.abs(n.gain.value - 0.76) < 1e-9; })[0];
  pLife.stopMusic();
  ok('BB1c stopMusic 无 ramp 路径会精确 disconnect 旧 bassBus（只断其它总线会红）', !!oldTrim && oldTrim._disconnected === 1);

  // 退化牙以真实“能力可选”表达：无 Convolver 时没有 mDry，也无需 bassBus；bass 应回 vOut 发声不抛。
  var c2 = trackCtx(); delete c2.createConvolver;
  ok('BB2 无混响/干总线能力时 bass 退化走现有 musicBus、有声不抛', !throws(function () { createAudioPresenter({ context: c2 }).startMusic({ mode: 'minor', key: 'A', progression: ['i'], instruments: ['bass'], intensity: 0.6 }); }) && c2._nodes.some(function (n) { return n._kind === 'osc'; }));
})();

// PC. 音色家族演奏法：只改 presenter 内部发音细节，不改 MusicSpec/音符网格。
//     这些牙先锁纯 profile，再用真实 startMusic 锁退化与跨绝对时钟确定性。
(function () {
  function relProfile(p) {
    return p && {
      action: p.action,
      gain: p.gain,
      duration: p.duration,
      attack: p.attack,
      release: p.release,
      brightness: p.brightness,
      pitch: p.pitch
    };
  }
  function eligible(role, pal, seg) {
    if (typeof performanceProfile !== 'function') return [];
    var out = [];
    for (var i = 0; i < 48; i++) {
      var p = performanceProfile(role, pal, seg, i * 0.25, 220 + (i % 7) * 18, 0.7);
      if (p && p.action !== 'plain') out.push(p);
    }
    return out;
  }

  ok('PC1 presenter 暴露私有 performanceProfile 测试面（不是作者 API）', typeof performanceProfile === 'function');

  var leadFamilies = ['soft', 'flute', 'reed', 'brass'];
  var leadProfiles = leadFamilies.map(function (pal) { return eligible('lead', pal, 2); });
  var leadSigs = leadProfiles.map(function (ps) { return JSON.stringify(ps.map(relProfile)); });
  ok('PC2 soft/flute/reed/brass 各至少一种稀疏微动作，且 family 签名互异',
    leadProfiles.every(function (ps) { return ps.length > 0 && ps.length < 18; }) &&
    leadSigs.filter(function (v, i, a) { return a.indexOf(v) === i; }).length === leadFamilies.length);
  ok('PC2b 四个 lead family 的动作轴真实分化：soft 微滑、flute 气息、reed 吐音、brass 提亮',
    leadProfiles[0].some(function (p) { return p.action === 'lean' && p.pitch === -42; }) &&
    leadProfiles[1].some(function (p) { return p.action === 'breath' && !p.pitch && p.attack === 1.22 && p.brightness === 0.90; }) &&
    leadProfiles[2].some(function (p) { return p.action === 'tongue' && !p.pitch && p.duration === 0.90; }) &&
    leadProfiles[3].some(function (p) { return p.action === 'lift' && p.pitch === -28 && p.brightness === 1.12; }));

  var noScoop = ['pulse', 'bell', 'pluck', 'harp'].every(function (pal) {
    return eligible('lead', pal, 2).every(function (p) { return !p.pitch || Math.abs(p.pitch) < 80; });
  });
  ok('PC3 pulse/bell/pluck/harp 不复制 chant 大幅 scoop/turn，bell 保自身固定 FM 衰减', noScoop && eligible('lead', 'bell', 2).length === 0 && eligible('arp', 'bell', 2).length === 0);

  var plucked = ['pluck', 'harp', 'kalimba'].map(function (pal) { return eligible('arp', pal, 1); });
  ok('PC4 arp 拨弦家族只用力度/时值/包络 ghost，绝不改音高网格',
    plucked.every(function (ps) { return ps.length > 0 && ps.length < 20 && ps.every(function (p) { return !p.pitch; }); }));

  var pads = ['warm', 'air', 'strings', 'choir'].map(function (pal) { return eligible('pad', pal, 3); });
  ok('PC5 pad 家族只有 attack/release/brightness 呼吸，不生旋律装饰',
    pads.every(function (ps) { return ps.length > 0 && ps.every(function (p) { return !p.pitch && (p.attack !== 1 || p.release !== 1 || p.brightness !== 1); }); }));

  var basses = [null, 'sub', 'organ', 'upright', 'picked', 'synth', 'sine-pluck'].map(function (pal) { return eligible('bass', pal, 3); });
  ok('PC6 bass 只做克制 gain/brightness/duration 变化，无大幅 detune',
    basses.every(function (ps) { return ps.length > 0 && ps.length < 18 && ps.every(function (p) { return !p.pitch; }); }));

  var total = 64, moved = 0;
  if (typeof performanceProfile === 'function') for (var i = 0; i < total; i++) if (performanceProfile('lead', 'flute', 1, i * 0.25, 261.63, 0.8).action !== 'plain') moved++;
  ok('PC7 装饰预算显著少于合格事件，不能逐音炫技', moved > 0 && moved <= Math.floor(total * 0.3));

  var absA = [], absB = [];
  if (typeof performanceProfile === 'function') for (var j = 0; j < 24; j++) {
    absA.push(relProfile(performanceProfile('lead', 'reed', 2, j * 0.5, 329.63, 0.9)));
    absB.push(relProfile(performanceProfile('lead', 'reed', 2, j * 0.5, 329.63, 0.9, 17.375)));
  }
  ok('PC8 同 seg/事件在不同 AudioContext.currentTime 下 profile 完全相同', JSON.stringify(absA) === JSON.stringify(absB));

  var fallbackCtx = makeMockCtx(), fallbackThrew = false;
  // 删除可选 automation，保留最小 AudioParam.value；family profile 必须退化为原有名义音高/包络而非抛错。
  var oldOsc = fallbackCtx.createOscillator, oldFilter = fallbackCtx.createBiquadFilter;
  fallbackCtx.createOscillator = function () { var o = oldOsc(); delete o.detune.linearRampToValueAtTime; return o; };
  fallbackCtx.createBiquadFilter = function () { var f = oldFilter(); delete f.frequency.linearRampToValueAtTime; delete f.frequency.exponentialRampToValueAtTime; return f; };
  try { createAudioPresenter({ context: fallbackCtx }).startMusic({ mode: 'major', key: 'C', tempo: 84, progression: ['I'], instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 0.8, melody: 'flowing', seed: 83, timbre: { pad: 'air', bass: 'sine-pluck', arp: 'harp', lead: 'flute' } }); } catch (e) { fallbackThrew = true; }
  ok('PC9 缺 detune/filter automation 时 family articulation 仍有声不抛', !fallbackThrew && nOsc(fallbackCtx) > 0);
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
