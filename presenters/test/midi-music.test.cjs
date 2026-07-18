/* midi-music.js 验证 —— 纯 node、零依赖。手搓 SMF 字节流覆盖规范边角(调研双源核实):
   VLQ / running status(F0/F7/FF 取消)/ note-on vel=0=off / 中途变速段累计 / format1 多轨归并 /
   GM program→voice 折表 / ch10 鼓映射 / 重叠 note-on / EOT 强制关音 / fail-loud(坏文件即报)。 */
'use strict';
const { parseMidi, gmVoice, gmDrum } = require('../midi-music.js');

let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name + (detail ? '  → ' + detail : '')); } }
function throwsMsg(fn, re) { try { fn(); return false; } catch (e) { return re.test(e.message); } }

/* ── SMF 字节流构造器 ── */
function u16(v) { return [v >> 8 & 255, v & 255]; }
function u32(v) { return [v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255]; }
function vlq(v) { var out = [v & 0x7F]; while ((v >>= 7)) out.unshift(0x80 | (v & 0x7F)); return out; }
function trk(events) { var body = [].concat.apply([], events); return [].concat([0x4D, 0x54, 0x72, 0x6B], u32(body.length + 4), body, [0x00, 0xFF, 0x2F, 0x00]); }
function smf(format, division, tracks) {
  var out = [].concat([0x4D, 0x54, 0x68, 0x64], u32(6), u16(format), u16(tracks.length), u16(division));
  for (var i = 0; i < tracks.length; i++) out = out.concat(tracks[i]);
  return new Uint8Array(out);
}
const on = (dt, ch, n, v) => [].concat(vlq(dt), [0x90 | ch, n, v]);
const off = (dt, ch, n) => [].concat(vlq(dt), [0x80 | ch, n, 0]);
const prog = (dt, ch, p) => [].concat(vlq(dt), [0xC0 | ch, p]);
const tempo = (dt, us) => [].concat(vlq(dt), [0xFF, 0x51, 0x03, us >> 16 & 255, us >> 8 & 255, us & 255]);
const cc = (dt, ch, num, val) => [].concat(vlq(dt), [0xB0 | ch, num, val]);
function ev(r, f) { return r.events.filter(f); }

// M1 基础:PPQ480 缺省 120BPM,A4(69) 持续 480tick=0.5s;program 0(钢琴族)→ pluck
(function () {
  var r = parseMidi(smf(0, 480, [trk([].concat(on(0, 0, 69, 100), off(480, 0, 69)))]));
  ok('M1 A4 → freq 440、t=0、dur=0.5s(缺省 500000μs/四分)、voice=pluck(GM 钢琴族)',
    r.events.length === 1 && Math.abs(r.events[0].freq - 440) < 0.01 && r.events[0].t === 0 && Math.abs(r.events[0].dur - 0.5) < 1e-9 && r.events[0].voice === 'pluck', JSON.stringify(r.events));
})();

// M2 Program Change → GM 族折表(16→organ / 56→brass / 46→harp / 33→bass / 121→跳过)
(function () {
  var r = parseMidi(smf(0, 480, [trk([].concat(
    prog(0, 0, 16), on(0, 0, 60, 100), off(240, 0, 60),
    prog(0, 0, 56), on(0, 0, 62, 100), off(240, 0, 62),
    prog(0, 0, 46), on(0, 0, 64, 100), off(240, 0, 64),
    prog(0, 0, 33), on(0, 0, 40, 100), off(240, 0, 40),
    prog(0, 0, 121), on(0, 0, 60, 100), off(240, 0, 60)
  ))]));
  ok('M2 GM 折表:organ/brass/harp/bass 各一 + SFX 族(121)跳过(skipped=1)',
    ev(r, e => e.voice === 'organ').length === 1 && ev(r, e => e.voice === 'brass').length === 1 && ev(r, e => e.voice === 'harp').length === 1 && ev(r, e => e.voice === 'bass').length === 1 && r.skipped === 1, JSON.stringify(r.events.map(e => e.voice)));
})();

// M3 ch10(0 基 ch9)鼓:36 kick / 38 snare / 42 闭镲(dur 0.05)/ 46 开镲(0.3)/ 49 crash(0.9)/ 60(bongo)跳过
(function () {
  var r = parseMidi(smf(0, 480, [trk([].concat(
    on(0, 9, 36, 100), off(10, 9, 36), on(0, 9, 38, 100), off(10, 9, 38),
    on(0, 9, 42, 100), off(10, 9, 42), on(0, 9, 46, 100), off(10, 9, 46),
    on(0, 9, 49, 100), off(10, 9, 49), on(0, 9, 60, 100), off(10, 9, 60)
  ))]));
  var hh = ev(r, e => e.voice === 'hihat');
  ok('M3 鼓映射:kick+snare+hihat×3(0.05/0.3/0.9)+ 拉丁器跳过', ev(r, e => e.voice === 'kick').length === 1 && ev(r, e => e.voice === 'snare').length === 1 && hh.length === 3 && Math.abs(hh[0].dur - 0.05) < 1e-9 && Math.abs(hh[1].dur - 0.3) < 1e-9 && Math.abs(hh[2].dur - 0.9) < 1e-9 && r.skipped === 1, JSON.stringify(r.events));
})();

// M4 note-on vel=0 = note-off(野外极普遍)
(function () {
  var r = parseMidi(smf(0, 480, [trk([].concat(on(0, 0, 69, 100), on(480, 0, 69, 0)))]));
  ok('M4 vel=0 当 off:dur=0.5s 而非吊死', r.events.length === 1 && Math.abs(r.events[0].dur - 0.5) < 1e-9);
})();

// M5 running status:状态字节后连续 data 对;FF meta 取消之 → 后续必须带显式状态
(function () {
  var body = [].concat(
    vlq(0), [0x90, 60, 100],          // 显式 note-on
    vlq(0), [64, 100],                // running:再开 64
    vlq(480), [60, 0],                // running + vel0=off 60
    vlq(0), [64, 0]                   // running off 64
  );
  var r = parseMidi(smf(0, 480, [trk([body])]));
  ok('M5 running status:两音各 0.5s', r.events.length === 2 && r.events.every(e => Math.abs(e.dur - 0.5) < 1e-9), JSON.stringify(r.events));
  ok('M5b 轨首无状态字节 → fail-loud', throwsMsg(() => parseMidi(smf(0, 480, [trk([[0x00, 60, 100]])])), /无状态字节/));
})();

// M6 中途变速(段累计):0.5s 处 tempo 减半 → 第二音 t=0.5+480tick×250000/(1e6×480)=0.75
(function () {
  var r = parseMidi(smf(0, 480, [trk([].concat(
    on(0, 0, 60, 100), off(480, 0, 60),
    tempo(0, 250000),
    on(480, 0, 62, 100), off(240, 0, 62)
  ))]));
  ok('M6 变速段累计:第二音 t=1.0?不,tick960 → 0.5+480×0.25/480=0.75… 实际 ' + r.events[1].t.toFixed(3), Math.abs(r.events[1].t - 0.75) < 1e-9 && Math.abs(r.events[1].dur - 0.125) < 1e-9, JSON.stringify(r.events));
})();

// M7 format1 多轨归并:track0 只 tempo(240000),track1 音符按该 tempo 换算(全轨收集 tempo)
(function () {
  var r = parseMidi(smf(1, 480, [
    trk([tempo(0, 240000)]),
    trk([].concat(on(480, 0, 69, 100), off(480, 0, 69)))
  ]));
  ok('M7 format1:tempo 跨轨生效(t=480×0.24/480=0.24、dur 同)', Math.abs(r.events[0].t - 0.24) < 1e-9 && Math.abs(r.events[0].dur - 0.24) < 1e-9 && r.trackCount === 2, JSON.stringify(r.events));
})();

// M8 fail-loud:坏 magic / format2 / division=0 / 截断
(function () {
  ok('M8a 非 SMF → 抛(点名给 .mid 的 base64)', throwsMsg(() => parseMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])), /MThd/));
  ok('M8b format 2 → 抛(教另存 format 0/1)', throwsMsg(() => parseMidi(smf(2, 480, [trk([])])), /format 2/));
  ok('M8c division=0 → 抛', throwsMsg(() => parseMidi(smf(0, 0, [trk([])])), /division=0/));
  ok('M8d MTrk 长度越界 → 抛', throwsMsg(() => { var b = smf(0, 480, [trk([on(0, 0, 60, 100)])]); var cut = b.slice(0, b.length - 6); return parseMidi(cut); }, /越界|截断/));
})();

// M9 重叠 note-on 先关旧;EOT 遗留开音强制关闭(无 off 也不产 NaN/无限 dur)
(function () {
  var r = parseMidi(smf(0, 480, [trk([].concat(
    on(0, 0, 60, 100), on(240, 0, 60, 100), off(240, 0, 60),   // 同音重叠:旧音 dur=0.25
    on(0, 0, 72, 100)                                           // 永不 off → EOT 收尾
  ))]));
  ok('M9 重叠先关旧(0.25s)+ EOT 关遗留(dur 有限>0)', Math.abs(r.events[0].dur - 0.25) < 1e-9 && r.events[2].dur > 0 && isFinite(r.events[2].dur), JSON.stringify(r.events));
})();

// M10 base64 入口(node Buffer 路)+ velocity→gain 单调
(function () {
  var bytes = smf(0, 480, [trk([].concat(on(0, 0, 69, 127), off(240, 0, 69), on(0, 0, 69, 30), off(240, 0, 69)))]);
  var b64 = Buffer.from(bytes).toString('base64');
  var r = parseMidi(b64);
  ok('M10 base64 解析 + vel 127 比 30 响', r.events.length === 2 && r.events[0].gain > r.events[1].gain && r.events[1].gain > 0);
  ok('M10b 坏 base64 → 抛', throwsMsg(() => parseMidi('!!!不是base64@@@'), /base64|MThd|过短/));
})();

// M11 gmVoice/gmDrum 导出可独立用(下游扩展点)
(function () {
  ok('M11 gmVoice(0)=pluck / gmVoice(19)=organ / gmDrum(36).voice=kick', gmVoice(0) === 'pluck' && gmVoice(19) === 'organ' && gmDrum(36).voice === 'kick');
})();

// ── 音色扩展批(MIDI extensibility):接通"已造但 MIDI 够不到"的音色板 + 定音鼓 + 混音 CC + 抬上限 ──

// M12 新 GM→音色 折射:Choir 52-54→choir / Reed 64-71→reed / Pipe 72-79→flute / Kalimba 108→kalimba / Timpani 47+Taiko/Tom 116-117→timpani
(function () {
  var choir = gmVoice(52) === 'choir' && gmVoice(53) === 'choir' && gmVoice(54) === 'choir';
  var reed = gmVoice(64) === 'reed' && gmVoice(68) === 'reed' && gmVoice(71) === 'reed';
  var flute = gmVoice(72) === 'flute' && gmVoice(73) === 'flute' && gmVoice(79) === 'flute';
  var kal = gmVoice(108) === 'kalimba';
  var timp = gmVoice(47) === 'timpani' && gmVoice(116) === 'timpani' && gmVoice(117) === 'timpani';
  // 边界:切出点不殃及邻居(55 仍 strings、63 仍 brass、80 仍 pulse、107/109 仍 pluck、118 仍 bell)
  var nb = gmVoice(55) === 'strings' && gmVoice(63) === 'brass' && gmVoice(80) === 'pulse' && gmVoice(107) === 'pluck' && gmVoice(109) === 'pluck' && gmVoice(118) === 'bell';
  ok('M12 choir/reed/flute/kalimba/timpani 折射全对 + 切出点不殃及邻居', choir && reed && flute && kal && timp && nb);
})();

// M13 CC7(Channel Volume)衰减:同音同力度,CC7=64 比 CC7=127 增益小 (64/127)² 倍(平方曲线)
(function () {
  var loud = parseMidi(smf(0, 480, [trk([].concat(cc(0, 0, 7, 127), on(0, 0, 69, 100), off(240, 0, 69)))]));
  var soft = parseMidi(smf(0, 480, [trk([].concat(cc(0, 0, 7, 64), on(0, 0, 69, 100), off(240, 0, 69)))]));
  var ratio = soft.events[0].gain / loud.events[0].gain, want = (64 / 127) * (64 / 127);
  ok('M13 CC7=64 增益 = CC7=127 的 (64/127)²≈0.254 倍(平方曲线)', Math.abs(ratio - want) < 1e-6, 'ratio=' + ratio.toFixed(4));
})();

// M14 CC11(Expression)与 CC7 乘性叠加:CC7=127·CC11=64 → (64/127)²
(function () {
  var r = parseMidi(smf(0, 480, [trk([].concat(cc(0, 0, 7, 127), cc(0, 0, 11, 64), on(0, 0, 69, 100), off(240, 0, 69)))]));
  var ref = parseMidi(smf(0, 480, [trk([].concat(cc(0, 0, 7, 127), cc(0, 0, 11, 127), on(0, 0, 69, 100), off(240, 0, 69)))]));
  ok('M14 CC11 乘性:CC11=64 → (64/127)² 衰减', Math.abs(r.events[0].gain / ref.events[0].gain - (64 / 127) * (64 / 127)) < 1e-6);
})();

// M15 CC10(Pan)分段:0→-1 / 64→0 / 127→+1(64≠63.5,必须分段);未设 CC10 → ev.pan 不存在(留 A1 角色声场)
(function () {
  var left = parseMidi(smf(0, 480, [trk([].concat(cc(0, 0, 10, 0), on(0, 0, 60, 100), off(120, 0, 60)))]));
  var mid = parseMidi(smf(0, 480, [trk([].concat(cc(0, 0, 10, 64), on(0, 0, 60, 100), off(120, 0, 60)))]));
  var right = parseMidi(smf(0, 480, [trk([].concat(cc(0, 0, 10, 127), on(0, 0, 60, 100), off(120, 0, 60)))]));
  var none = parseMidi(smf(0, 480, [trk([].concat(on(0, 0, 60, 100), off(120, 0, 60)))]));
  ok('M15 CC10 分段 0→-1/64→0/127→+1 + 未设→无 pan 字段',
    left.events[0].pan === -1 && mid.events[0].pan === 0 && Math.abs(right.events[0].pan - 1) < 1e-9 && none.events[0].pan === undefined,
    JSON.stringify([left.events[0].pan, mid.events[0].pan, right.events[0].pan, none.events[0].pan]));
})();

// M16 GM 默认 CC7=100(非 127):未设 CC7 的音符 = 设 CC7=127 的 (100/127)² 倍
(function () {
  var def = parseMidi(smf(0, 480, [trk([].concat(on(0, 0, 69, 100), off(240, 0, 69)))]));
  var full = parseMidi(smf(0, 480, [trk([].concat(cc(0, 0, 7, 127), on(0, 0, 69, 100), off(240, 0, 69)))]));
  ok('M16 默认 CC7=100(GM power-on,非 127)', Math.abs(def.events[0].gain / full.events[0].gain - (100 / 127) * (100 / 127)) < 1e-6);
})();

// M17 抬上限:20001 音符不再抛(旧 20000 误杀真·交响组曲;播放成本由 present-audio 滚动窗兜底)
(function () {
  var body = [];
  for (var i = 0; i < 20001; i++) body = body.concat(on(0, 0, 60, 100), off(1, 0, 60));   // 20001 个极短音符
  var bytes = smf(0, 480, [trk([body])]);
  var threw = false, n = 0;
  try { n = parseMidi(bytes).noteCount; } catch (e) { threw = true; }
  ok('M17 20001 音符解析不抛(MAX_NOTES 65536)', !threw && n === 20001, threw ? 'THREW' : 'n=' + n);
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
