/* ════════════════════════════════════════════════════════════════════════
   Amatlas 可插拔表现层 · MIDI 导入 (presenters/midi-music.js) — 契约 v14
   ════════════════════════════════════════════════════════════════════════
   把 SMF(.mid,base64 内联)解析成与 compose-music 同形的**确定性音符事件列表**
   {voice, freq, t, dur, gain},交 present-audio 的 v13 音色库排定发声。
   → 作者/下游 AI 可用任何 MIDI 编辑器/作曲工具产出复杂音乐,base64 一行嵌进
     world.js(`audio:{ music:{ midi:'TVRoZA...' } }`),零依赖、单 HTML、离线。

   规范依据(调研双源核实,SMF 1.0 规范镜像 midimusic.github.io/tech/midispec.html
   + recordingblogs/soundprogramming/computermusicresource;细节见 expressiveness-upgrade.md):
   · MThd 14 字节大端;format 0/1 支持、2(鼓机 pattern 库,野外极少)fail-loud;
   · division:bit15=0 → PPQ;bit15=1 → SMPTE(每 tick 秒 = 1/(fps×tpf),tempo 不参与);
   · VLQ ≤4 字节;running status 跨 delta 持续、F0/F7/FF 取消之、不可被它们使用;
   · note-on vel=0 = note-off(野外极普遍);meta 0x51 = 微秒/四分音符,**中途变速按段累计**;
   · 多轨各自独立 delta 时钟与 running status,按绝对 tick 稳定归并;tempo 全轨收集全局生效;
   · sysex/未知 meta 按长度字段整块跳过(绝不扫终止符);轨末强制关闭遗留开音(防 dur 无限)。

   fail-loud(作者给的文件坏 = 违约即报,不静默无声):非 MThd / format 2 / division 0 /
   VLQ>4 字节 / 轨首事件无状态 / 越界截断 / 音符数超上限(防巨文件拖死浏览器)。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else { var _m = factory(), _A = (global.Amatlas = global.Amatlas || {}); _A.parseMidi = _m.parseMidi; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MAX_NOTES = 65536;   // 上限:仅防损坏/病态巨文件 OOM。播放成本由 present-audio 的滚动 12s 窗(>1600 节点剪枝)兜底、
                           //   与总音符数无关 → 旧 20000 误杀真·交响组曲(BWV1066=20248 音符/6 分钟正是本轮目标内容)。65536 覆盖几乎所有真实管弦/游戏 BGM 仍留头。

  function mtof(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // GM program(0 基)→ 音色 token。16 族折到 present-audio 的 voice/palette;并把若干"已造但 MIDI 够不到"的
  //   音色板接通(调研 g200kg/tinysynth + GM L1 spec 双源核实,留痕 expressiveness-upgrade.md):
  //   ★ 单列切出(在族 band 前):45 拨奏/46 竖琴/47 定音鼓 · 52-54 人声 · 108 卡林巴 · 116-117 太鼓+旋律鼓。
  //   ★ 改族向(旧折太糙):Reed 64-71 pulse→reed(单/双簧管真音色)· Pipe 72-79 soft→flute(专属笛)。
  function gmVoice(program) {
    var p = program | 0;
    if (p === 45) return 'pluck';        // Pizzicato Strings(拨奏弦,非弓奏)
    if (p === 46) return 'harp';         // Orchestral Harp
    if (p === 47) return 'timpani';      // Timpani → 音高膜鸣(旧折 kick 钉死 150Hz 丢音高;timpaniVoice 还原)
    if (p >= 52 && p <= 54) return 'choir';   // Choir Aahs/Voice Oohs/Synth Voice → 人声(formant 元音;从弦乐 band 切出=本轮最大感知收益)
    if (p === 108) return 'kalimba';     // Kalimba → 非谐金属拨片(从 Ethnic 切出,kalimbaVoice 此前 MIDI 够不到)
    if (p === 116 || p === 117) return 'timpani';   // Taiko Drum / Melodic Tom → 音高膜鸣(从 Percussive band 切出)
    if (p < 8) return 'pluck';           // Piano 族:衰减键音
    if (p < 16) return 'bell';           // Chromatic Percussion(钟琴/钢片琴/颤音琴/八音盒=FM 铃)
    if (p < 24) return 'organ';          // Organ
    if (p < 32) return 'pluck';          // Guitar
    if (p < 40) return 'bass';           // Bass
    if (p < 56) return 'strings';        // Strings + Ensemble:弦垫(弓奏弦;52-54 人声已上面切出)
    if (p < 64) return 'brass';          // Brass
    if (p < 72) return 'reed';           // Reed:萨克斯/双簧管/英国管/巴松/单簧管 → 簧片音(leadVoice 'reed' 奇次列,旧折 pulse 方波)
    if (p < 80) return 'flute';          // Pipe:长笛/短笛/竖笛/排箫… → 专属笛音(leadVoice 'flute' 近正弦+气声,旧折 soft)
    if (p < 88) return (p === 81 ? 'soft' : 'pulse');   // Synth Lead(80 square/81 saw)
    if (p < 96) return 'warm';           // Synth Pad
    if (p < 104) return 'air';           // Synth FX
    if (p < 112) return 'pluck';         // Ethnic(sitar/koto/banjo…;108 kalimba 已切出)
    if (p < 120) return 'bell';          // Percussive(116/117 已切出)
    return null;                         // 120-127 Sound Effects:跳过(非音乐性)
  }
  // GM 鼓(ch10,note 号选音色;域 35-81)→ {voice, dur, scale}。镲类折到 hihat 不同时长。
  function gmDrum(note) {
    var n = note | 0;
    if (n === 35 || n === 36) return { voice: 'kick', dur: 0.28, scale: 0.5 };
    if (n >= 37 && n <= 40) return { voice: 'snare', dur: 0.18, scale: 0.3 };
    if (n === 42 || n === 44) return { voice: 'hihat', dur: 0.05, scale: 0.18 };
    if (n === 46) return { voice: 'hihat', dur: 0.3, scale: 0.18 };                       // 开镲
    if (n === 49 || n === 52 || n === 55 || n === 57) return { voice: 'hihat', dur: 0.9, scale: 0.22 };   // crash 族
    if (n === 51 || n === 53 || n === 59) return { voice: 'hihat', dur: 0.25, scale: 0.15 };              // ride 族
    if (n >= 41 && n <= 50) return { voice: 'kick', dur: 0.22, scale: 0.35 };             // toms → 鼓体(正弦扫频近似)
    return null;                          // 拉丁打击器/域外:跳过(混音更干净)
  }

  function b64ToBytes(s) {
    if (typeof atob !== 'undefined') { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
    return new Uint8Array(Buffer.from(s, 'base64'));
  }

  function parseMidi(input) {
    if (input == null) throw new Error('parseMidi: 输入为空');
    var b;
    if (typeof input === 'string') {
      try { b = b64ToBytes(input.replace(/\s+/g, '')); } catch (e) { throw new Error('parseMidi: base64 解码失败(确认是 .mid 文件的 base64 串)'); }
    } else if (input && input.length != null) b = input instanceof Uint8Array ? input : new Uint8Array(input);
    else throw new Error('parseMidi: 输入须是 base64 字符串或字节数组');
    if (b.length < 14) throw new Error('parseMidi: 文件过短(不足 MThd 头)');

    var pos = 0;
    function u8() { if (pos >= b.length) throw new Error('parseMidi: 越界(文件截断)'); return b[pos++]; }
    function u16() { return (u8() << 8) | u8(); }
    function u32() { return ((u8() << 24) | (u8() << 16) | (u8() << 8) | u8()) >>> 0; }
    function vlq() {   // 规范:7bit/字节、高位续标、≤4 字节(0x0FFFFFFF)
      var v = 0, x, n = 0;
      do { x = u8(); v = (v << 7) | (x & 0x7F); if (++n > 4) throw new Error('parseMidi: VLQ 超 4 字节(文件损坏)'); } while (x & 0x80);
      return v;
    }

    if (!(b[0] === 0x4D && b[1] === 0x54 && b[2] === 0x68 && b[3] === 0x64)) throw new Error('parseMidi: 不是 SMF(缺 MThd 头)——给我 .mid 文件的 base64,不是 mp3/wav');
    pos = 4;
    var hlen = u32(), format = u16(), ntrks = u16(), division = u16();
    for (var sk = 6; sk < hlen; sk++) u8();                       // 头超 6 字节按 length 跳(前向兼容)
    if (format === 2) throw new Error('parseMidi: format 2(独立 pattern 库)不支持——用 DAW 另存为 format 0/1');
    if (ntrks === 0) throw new Error('parseMidi: 0 条轨');
    // division:PPQ(bit15=0)或 SMPTE(bit15=1;每 tick 秒恒定、tempo 事件不参与)
    var smpte = !!(division & 0x8000), ppq = 0, tickSec = 0;
    if (smpte) {
      var fps = -((division >> 8) << 24 >> 24), tpf = division & 0xFF;
      if (!fps || !tpf) throw new Error('parseMidi: SMPTE division 非法');
      tickSec = 1 / (fps * tpf);
    } else {
      ppq = division & 0x7FFF;
      if (!ppq) throw new Error('parseMidi: division=0(文件损坏)');
    }

    // 逐轨解析:每轨独立 delta 时钟 + 独立 running status(不跨 MTrk);产 (绝对tick, 序号) 保稳定归并
    var notes = [];      // {tick, durTick?(后补), ch, note, vel, program}
    var tempos = [{ tick: 0, us: 500000 }];                       // 缺省 120BPM;全轨收集(野外有违规放非首轨的)
    var seq = 0;
    for (var ti = 0; ti < ntrks; ti++) {
      // 找 MTrk(陌生 chunk 按 length 整块跳——规范要求容忍 alien chunks)
      var id, len;
      for (;;) {
        if (pos + 8 > b.length) throw new Error('parseMidi: 轨道数声明 ' + ntrks + ' 但文件提前结束');
        id = String.fromCharCode(u8(), u8(), u8(), u8()); len = u32();
        if (id === 'MTrk') break;
        pos += len;
      }
      var end = pos + len;
      if (end > b.length) throw new Error('parseMidi: MTrk 长度越界(文件截断)');
      var tick = 0, running = 0, open = {};                       // open[(ch<<8)|note] = notes[] 下标
      var prog = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];   // 每通道当前 program
      // 混音类 CC 状态(每通道;**随 prog 同 per-track**——format 1 惯例:每乐器一轨一通道,CC 与音符同轨,note-on 时快照)。
      // GM 默认:CC7=100(非 127!power-on 默认,否则未设通道比设了的吵 ~6dB)/ CC11=127 / CC10=null(未设=居中、留 A1 声场)。
      var cc7 = [], cc11 = [], pan = [];
      for (var pc = 0; pc < 16; pc++) { cc7[pc] = 100; cc11[pc] = 127; pan[pc] = null; }
      while (pos < end) {
        tick += vlq();
        var st = b[pos];
        if (st < 0x80) {                                          // running status(数据字节出现在状态位)
          if (!running) throw new Error('parseMidi: 轨首事件无状态字节(文件损坏)');
          st = running;
        } else { pos++; if (st < 0xF0) running = st; else running = 0; }   // F0/F7/FF 取消 running status
        if (st === 0xFF) {                                        // meta:type + VLQ len;只认 0x51 tempo,其余按长跳
          var mt = u8(), mlen = vlq();
          if (mt === 0x51 && mlen === 3) tempos.push({ tick: tick, us: (u8() << 16) | (u8() << 8) | u8() });
          else pos += mlen;
          continue;
        }
        if (st === 0xF0 || st === 0xF7) { pos += vlq(); continue; }   // sysex/续包:VLQ 长度整块跳
        var hi = st & 0xF0, ch = st & 0x0F;
        var d1 = u8(), d2 = (hi === 0xC0 || hi === 0xD0) ? 0 : u8();   // C/D 族 1 数据字节,其余 2
        if (hi === 0xC0) { prog[ch] = d1; continue; }
        if (hi === 0xB0) {                                        // Control Change:捕获混音类 CC(静态,note-on 快照)
          if (d1 === 7) cc7[ch] = d2;                             // Channel Volume
          else if (d1 === 11) cc11[ch] = d2;                      // Expression
          else if (d1 === 10) pan[ch] = (d2 <= 64 ? (d2 - 64) / 64 : (d2 - 64) / 63);   // Pan:0→-1 / 64→0 / 127→+1(分段,64≠63.5)
          continue;                                               // 其余 CC(含 CC64 踏板=野外仅初始复位)忽略,见 expressiveness-upgrade
        }
        if (hi === 0x90 && d2 > 0) {                              // note-on
          var k = (ch << 8) | d1;
          if (open[k] != null) notes[open[k]].durTick = tick - notes[open[k]].tick;   // 同音重叠:先关旧(惯例)
          open[k] = notes.length;
          // gScale=(CC7/127)²·(CC11/127)²(MIDI.org 40·log10 dB 式的平方/线性形;127=单位增益、值越低越衰、绝不门控);pan 仅在通道实设 CC10 时带(否则 null→留 A1 声场)
          notes.push({ tick: tick, durTick: -1, ch: ch, note: d1, vel: d2, program: prog[ch], seq: seq++,
            gScale: (cc7[ch] / 127) * (cc7[ch] / 127) * (cc11[ch] / 127) * (cc11[ch] / 127), pan: pan[ch] });
          if (notes.length > MAX_NOTES) throw new Error('parseMidi: 音符数超 ' + MAX_NOTES + '(文件过大/损坏;游戏 BGM 通常数百~数千音符)');
        } else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) {    // note-off(含 vel=0 惯例)
          var k2 = (ch << 8) | d1;
          if (open[k2] != null) { notes[open[k2]].durTick = tick - notes[open[k2]].tick; delete open[k2]; }
        }
        // 其余通道消息(0xA0/0xB0/0xE0)字节已消费,忽略内容
      }
      for (var ok in open) if (Object.prototype.hasOwnProperty.call(open, ok)) {   // 轨末强制关闭遗留开音(防 dur 无限)
        var ni = open[ok]; if (notes[ni].durTick < 0) notes[ni].durTick = Math.max(1, tick - notes[ni].tick);
      }
      pos = end;                                                  // chunk length 是权威边界(EOT 缺失也停)
    }

    // tick → 秒:SMPTE 恒定;PPQ 按 tempo 段累计(中途变速正确换算)
    tempos.sort(function (a, c) { return a.tick - c.tick || 0; });
    var segs = [];                                                // {tick, us, sec(段起点累计秒)}
    var accSec = 0, lastTick = 0, curUs = 500000;
    for (var si = 0; si < tempos.length; si++) {
      var tp = tempos[si];
      accSec += smpte ? 0 : (tp.tick - lastTick) * curUs / (1e6 * (ppq || 1));
      lastTick = tp.tick; curUs = tp.us;
      segs.push({ tick: tp.tick, us: curUs, sec: accSec });
    }
    function tickToSec(t) {
      if (smpte) return t * tickSec;
      var s = segs[0];
      for (var i = segs.length - 1; i >= 0; i--) { if (segs[i].tick <= t) { s = segs[i]; break; } }
      return s.sec + (t - s.tick) * s.us / (1e6 * ppq);
    }

    // 产事件(稳定序:tick 同则保原序);velocity^2 感知曲线 × 声部基准增益(对齐 compose-music 量级)
    notes.sort(function (a, c) { return a.tick - c.tick || a.seq - c.seq; });
    var events = [], totalDur = 0, skipped = 0;
    var BASE = { pluck: 0.09, harp: 0.09, bell: 0.08, organ: 0.10, warm: 0.10, air: 0.10, strings: 0.10, brass: 0.09, pulse: 0.09, soft: 0.09, bass: 0.16, choir: 0.10, reed: 0.09, flute: 0.09, kalimba: 0.09, timpani: 0.16 };
    for (var ei = 0; ei < notes.length; ei++) {
      var nn = notes[ei], v2 = (nn.vel / 127) * (nn.vel / 127);
      var t0 = tickToSec(nn.tick), d0 = Math.max(0.05, tickToSec(nn.tick + Math.max(1, nn.durTick)) - t0);
      if (nn.ch === 9) {                                          // GM 鼓通道(0 基 ch9 = 通道 10)
        var dm = gmDrum(nn.note);
        if (!dm) { skipped++; continue; }
        var dev = { voice: dm.voice, freq: 0, t: t0, dur: dm.dur, gain: dm.scale * (0.4 + 0.6 * v2) * nn.gScale };
        if (nn.pan != null) dev.pan = nn.pan;                     // CC10 实设 → 带声像;否则留 A1 鼓声场
        events.push(dev);
        if (t0 + dm.dur > totalDur) totalDur = t0 + dm.dur;
        continue;
      }
      var vc = gmVoice(nn.program);
      if (!vc) { skipped++; continue; }
      var mev = { voice: vc, freq: mtof(nn.note), t: t0, dur: d0, gain: (BASE[vc] || 0.09) * (0.35 + 0.65 * v2) * nn.gScale };
      if (nn.pan != null) mev.pan = nn.pan;                       // CC10 实设 → 带声像(per-channel 立体声铺开=合奏感)
      events.push(mev);
      if (t0 + d0 > totalDur) totalDur = t0 + d0;
    }
    return { events: events, totalDur: totalDur, noteCount: notes.length, skipped: skipped, trackCount: ntrks, format: format, ppq: ppq || null };
  }

  return { parseMidi: parseMidi, gmVoice: gmVoice, gmDrum: gmDrum };
});
