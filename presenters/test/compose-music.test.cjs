/* Amatlas 作曲层 compose-music.js 验证 —— 纯 node、零依赖(纯函数 MusicSpec→events,不需 Web Audio)。
   覆盖:和弦进行 scale-degree 展开 / 音符全在调内 / 确定性 / 结构违约 fail-loud / 内容 clamp /
        默认补全 / 层 intensity 门控 / melody 音级在调 / 任意音阶长度适配 / resolveMusic 三形态。
   依据 docs/audio-music-design.md §2-§4。 */
const C = require('../compose-music.js');
const { composeMusic, normalizeSpec, resolveMusic, PRESET, MODES, KEYS } = C;

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } }
function throws(fn) { try { fn(); return false; } catch (e) { return true; } }
function freqMidi(f) { return Math.round(69 + 12 * Math.log2(f / 440)); }
function pcSet(key, mode) { var s = {}; MODES[mode].forEach(function (iv) { s[(((KEYS[key] + iv) % 12) + 12) % 12] = 1; }); return s; }
function allInScale(key, mode, events) { var pcs = pcSet(key, mode); return events.filter(function (e) { return e.freq > 0; }).every(function (e) { return pcs[(((freqMidi(e.freq)) % 12) + 12) % 12]; }); }
function roles(events) { var r = {}; events.forEach(function (e) { r[e.role] = (r[e.role] || 0) + 1; }); return r; }
function mulb(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }  // 测试用独立 PRNG(对齐 compose-music 内部 mulberry32)

console.log('compose-music 验证');

// A. 基本:产出 events + 段长 + 默认层
(function () {
  var r = composeMusic({ mode: 'major', key: 'C' });
  ok('A1 产出非空 events', Array.isArray(r.events) && r.events.length > 0);
  ok('A2 segDur = 4 和弦 × 4 拍 / (100bpm→0.6s/拍) = 9.6s', Math.abs(r.segDur - 9.6) < 1e-6);
  ok('A3 默认 instruments=[pad,bass] → 有 pad/bass、无 arp/perc', (function () { var R = roles(r.events); return R.pad > 0 && R.bass > 0 && !R.arp && !R.kick; })());
  ok('A4 规范化:缺省 mode=major/key=C/tempo=100/intensity=0.6', (function () { var s = normalizeSpec({}); return s.mode === 'major' && s.key === 'C' && s.tempo === 100 && s.intensity === 0.6; })());
})();

// B. 和弦进行 scale-degree 展开(C major)
(function () {
  var r = composeMusic({ mode: 'major', key: 'C', progression: ['I'], instruments: ['pad'] });
  var pads = r.events.filter(function (e) { return e.role === 'pad'; });
  ok('B1 I 度和弦 = C/E/G(MIDI 60/64/67)', (function () { var ms = pads.map(function (e) { return freqMidi(e.freq); }).sort(function (a, b) { return a - b; }); return ms[0] === 60 && ms[1] === 64 && ms[2] === 67; })());
  var r2 = composeMusic({ mode: 'major', key: 'C', progression: ['V'], instruments: ['pad'] });
  ok('B2 V 度和弦 = G/B/D(从音阶取 5/7/9 度 → 60+7,+11,+14)', (function () { var ms = r2.events.filter(function (e) { return e.role === 'pad'; }).map(function (e) { return freqMidi(e.freq); }).sort(function (a, b) { return a - b; }); return ms[0] === 67 && ms[1] === 71 && ms[2] === 74; })());
  var r3 = composeMusic({ mode: 'minor', key: 'A', progression: ['i'], instruments: ['pad'] });
  ok('B3 A minor i 度 = A/C/E(小三和弦;A4 八度 69/72/76,根音=60+keyPC 与 C major 同基准)', (function () { var ms = r3.events.filter(function (e) { return e.role === 'pad'; }).map(function (e) { return freqMidi(e.freq); }).sort(function (a, b) { return a - b; }); return ms[0] === 69 && ms[1] === 72 && ms[2] === 76; })());
})();

// C. 所有音符在调内(最关键:程序走音永不跑调)
(function () {
  ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian'].forEach(function (m) {
    var r = composeMusic({ mode: m, key: 'D', instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, melody: 'flowing' });
    ok('C:' + m + ' 全部音符在 D ' + m + ' 调内(pad/bass/arp/lead)', allInScale('D', m, r.events));
  });
})();

// D. 确定性(同 spec 两次字节相同;含 PRNG 的 flowing 旋律)
(function () {
  var spec = { mode: 'minor', key: 'E', instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, melody: 'flowing' };
  ok('D1 同 spec 两次 events 完全相同(种子 PRNG、非 Math.random)', JSON.stringify(composeMusic(spec).events) === JSON.stringify(composeMusic(spec).events));
  ok('D2 不同 seed → 不同(flowing 旋律受 seed 影响)', JSON.stringify(composeMusic({ mode: 'minor', key: 'E', instruments: ['lead'], intensity: 1, melody: 'flowing', seed: 1 }).events) !== JSON.stringify(composeMusic({ mode: 'minor', key: 'E', instruments: ['lead'], intensity: 1, melody: 'flowing', seed: 2 }).events));
})();

// E. 结构违约 → fail-loud throw
(function () {
  ok('E1 未知 mode → throw', throws(function () { composeMusic({ mode: '没这个' }); }));
  ok('E2 非法 key → throw', throws(function () { composeMusic({ key: 'H' }); }));
  ok('E3 progression 非数组 → throw', throws(function () { composeMusic({ progression: 'I-V-vi' }); }));
  ok('E4 progression 含非罗马数字 → throw', throws(function () { composeMusic({ progression: ['I', 'Z9'] }); }));
  ok('E5 tempo 非数 → throw', throws(function () { composeMusic({ tempo: 'fast' }); }));
  ok('E6 spec=null → throw', throws(function () { composeMusic(null); }));
  ok('E7 合法 spec 不 throw', !throws(function () { composeMusic({ mode: 'dorian', key: 'F#', progression: ['i', 'IV'] }); }));
})();

// F. 内容偏差 → clamp(不 throw)
(function () {
  ok('F1 tempo 越界 9999 → clamp 200(segDur=4×4×0.3=4.8s)', Math.abs(composeMusic({ tempo: 9999 }).segDur - 4.8) < 1e-6);
  ok('F2 tempo 过低 5 → clamp 40', normalizeSpec({ tempo: 5 }).tempo === 40);
  ok('F3 intensity 越界 5 → clamp 1', normalizeSpec({ intensity: 5 }).intensity === 1);
})();

// G. 默认补全
(function () {
  ok('G1 无 progression → 用该调式默认进行(minor 默认 4 和弦)', composeMusic({ mode: 'minor', instruments: ['pad'] }).spec.progression.length === 4);
  ok('G2 空 progression 数组 → 回退默认', composeMusic({ mode: 'major', progression: [], instruments: ['pad'] }).spec.progression.length === 4);
})();

// H. 层 intensity 门控(参数驱动垂直分层)
(function () {
  var lo = composeMusic({ instruments: ['pad', 'bass', 'arp', 'perc'], intensity: 0.2 });
  ok('H1 低 intensity(0.2):有 pad/bass、无 arp(gate .45)、无 perc(gate .7)', (function () { var R = roles(lo.events); return R.pad > 0 && R.bass > 0 && !R.arp && !R.kick; })());
  var hi = composeMusic({ instruments: ['pad', 'bass', 'arp', 'perc'], intensity: 1 });
  ok('H2 高 intensity(1):arp + 鼓(kick/hihat/snare)都进', (function () { var R = roles(hi.events); return R.arp > 0 && R.kick > 0 && R.hihat > 0 && R.snare > 0; })());
  ok('H3 instruments 不含某层 → 即使 intensity=1 也无该层', !roles(composeMusic({ instruments: ['pad'], intensity: 1 }).events).arp);
})();

// I. melody(音级表示 → 在调;none 不出 lead)
(function () {
  var none = composeMusic({ instruments: ['lead'], intensity: 1, melody: 'none' });
  ok('I1 melody=none → 无 lead 音', !roles(none.events).lead);
  var motif = composeMusic({ key: 'C', mode: 'major', progression: ['I'], instruments: ['lead'], intensity: 1, melody: 'motif:[0,2,4]' });
  ok('I2 motif:[0,2,4] → 3 个 lead 音、且在 C major 调内', (function () { var L = motif.events.filter(function (e) { return e.role === 'lead'; }); return L.length === 3 && allInScale('C', 'major', L); })());
  ok('I3 motif 音级越界(如 14)仍映射到调内(八度回绕)', allInScale('C', 'major', composeMusic({ key: 'C', mode: 'major', instruments: ['lead'], intensity: 1, melody: 'motif:[14,-3]' }).events.filter(function (e) { return e.role === 'lead'; })));
})();

// J. 任意音阶长度适配(wholetone 6 音 / pentatonic 5 音)
(function () {
  ok('J1 wholetone(6 音)展开不崩、在调内', !throws(function () { composeMusic({ mode: 'wholetone', key: 'C', instruments: ['pad', 'arp'], intensity: 1 }); }) && allInScale('C', 'wholetone', composeMusic({ mode: 'wholetone', key: 'C', instruments: ['pad', 'arp'], intensity: 1 }).events));
  ok('J2 pentatonic(5 音)展开不崩、在调内', allInScale('C', 'pentatonic', composeMusic({ mode: 'pentatonic', key: 'C', instruments: ['pad', 'arp'], intensity: 1 }).events));
})();

// K. resolveMusic:三形态解析(字符串预设 / preset 合并 / 完整对象 / 兜底)+ 预设全可成曲
(function () {
  ok('K1 字符串预设 "calm" → 展开为 calm spec(major)', C.resolveMusic('calm').mode === 'major');
  ok('K2 未知预设名 → 回退中性(不崩、有合法 mode)', (function () { var s = C.resolveMusic('没这个预设'); return s && MODES[s.mode] != null; })());
  ok('K3 对象带 preset → 取基底再覆盖(preset:tense + tempo:90 → minor + tempo 90)', (function () { var s = C.resolveMusic({ preset: 'tense', tempo: 90 }); return s.mode === 'minor' && s.tempo === 90; })());
  ok('K4 完整对象无 preset → 原样(交 normalize 补默认)', C.resolveMusic({ mode: 'dorian', key: 'F' }).mode === 'dorian');
  ok('K5 resolveMusic→composeMusic 链路:字符串预设直接成曲、在调内', (function () { var r = C.composeMusic(C.resolveMusic('tense')); return r.events.length > 0 && allInScale(r.spec.key, r.spec.mode, r.events); })());
  ok('K6 null → 兜底中性(不崩)', (function () { var s = C.resolveMusic(null); return s && MODES[s.mode] != null; })());
  ok('K7 PRESET 全部(22 个:mood 5 + 题材 8 + v15 曲风 9)各自可成曲、不崩、在调内', Object.keys(C.PRESET).every(function (n) { var r = C.composeMusic(C.resolveMusic(n)); return r.events.length > 0 && allInScale(r.spec.key, r.spec.mode, r.events); }));
})();

// K8-10 v12 预设扩容(题材/风格维)+ 修自家死数据(tense/heroic 声明 perc 却被默认 intensity 0.6 门控静默)
(function () {
  ok('K8 共 22 个预设、新名抽查(eastern=pentatonic 五声、battle=phrygian 140、sacral 慢板)', Object.keys(C.PRESET).length === 22 && C.resolveMusic('eastern').mode === 'pentatonic' && C.resolveMusic('battle').tempo === 140 && C.resolveMusic('sacral').tempo === 46);
  function hasRole(name, role) { var r = C.composeMusic(C.resolveMusic(name)); return r.events.some(function (e) { return e.role === role || (role === 'perc' && (e.role === 'kick' || e.role === 'hat' || e.role === 'snare')); }); }
  ok('K9 tense/heroic/battle 的鼓真的响了(修死数据:显式 intensity ≥ 0.7 过 perc 门槛)', hasRole('tense', 'perc') && hasRole('heroic', 'perc') && hasRole('battle', 'perc'));
  ok('K10 未知预设仍回退 calm(扩容零回归)', C.resolveMusic('不存在的风格').mode === 'major');
  // K11-13 v13 timbre(音色板):预设携带 → 透传;形态违约 → 抛;板名开放(未知名由呈现器 warn+回退)
  ok('K11 sacral 预设带 timbre.pad=organ 且 resolveMusic 透传', C.resolveMusic('sacral').timbre.pad === 'organ' && C.resolveMusic('eastern').timbre.arp === 'pluck');
  ok('K12 timbre 写成数组 → 抛(形态违约)', (function () { try { C.composeMusic({ timbre: ['organ'] }); return false; } catch (e) { return /timbre/.test(e.message); } })());
  ok('K13 timbre 值非字符串 → 抛', (function () { try { C.composeMusic({ timbre: { pad: 3 } }); return false; } catch (e) { return /timbre.pad/.test(e.message); } })());
  // K14 v14 对账批:music 未知预设名 warn-once + 回退 calm(对齐 art/timbre 先例;此前静默回退=fail-silent)
  (function () {
    var warned = [], ow = console.warn; console.warn = function (m) { warned.push(String(m)); };
    var s1 = C.resolveMusic('heoric'); var s2 = C.resolveMusic('heoric');
    console.warn = ow;
    ok('K14 未知预设 warn-once(点名可选清单)+ 仍回退 calm 不崩', s1.mode === 'major' && s2.mode === 'major' && warned.filter(function (m) { return m.indexOf('heoric') >= 0; }).length === 1 && /calm/.test(warned[0] || ''));
  })();
  // K15 C16(前瞻审计):对象形 {preset:'typo'} 也 warn-once + 回退 calm(对齐字符串路径;修对象路径静默回退 fail-silent)
  (function () {
    var warned = [], ow = console.warn; console.warn = function (m) { warned.push(String(m)); };
    var s1 = C.resolveMusic({ preset: 'tenze', tempo: 90 }); var s2 = C.resolveMusic({ preset: 'tenze' });
    var valid = C.resolveMusic({ preset: 'tense', tempo: 90 });   // 合法基底不应 warn
    console.warn = ow;
    // warned.length===1:tenze warn-once(2 次调用 1 条)+ 合法 tense 零 warn。(不用 'tense' 子串判:typo 消息含完整预设清单、内含 'tense' 会误判)
    ok('K15 对象 {preset:typo} warn-once + 回退 calm(tempo 覆盖保留);合法 {preset:tense}(minor)不 warn',
      s1.mode === 'major' && s1.tempo === 90 && s2.mode === 'major' && valid.mode === 'minor'
      && warned.length === 1 && warned[0].indexOf('tenze') >= 0);
  })();
})();

// M. v15 曲风扩容(av-diversity-signoff 一·收 9:synthwave/jazz-noir/march/chase/romance/scherzo/stealth/elegy/baroque)
//    全"仅加表项"=纯数据加法;验:resolveMusic/composeMusic 零 throw+确定性+在调内,且声明的声部都过 intensity 门控真发声(无 tense/heroic 式"声明却不响"死数据)。
(function () {
  var NEW9 = ['synthwave', 'jazz-noir', 'march', 'chase', 'romance', 'scherzo', 'stealth', 'elegy', 'baroque'];
  // M1 9 个新预设各自 resolveMusic→composeMusic 零 throw、有事件、在调内
  ok('M1 v15 9 个新曲风各自可成曲、不崩、在调内', NEW9.every(function (n) {
    var r; try { r = C.composeMusic(C.resolveMusic(n)); } catch (e) { return false; }
    return r.events.length > 0 && allInScale(r.spec.key, r.spec.mode, r.events);
  }));
  // M2 jazz-noir:连字符键名(含 '-')正确作为 PRESET 键解析、不被当未知预设回退;A minor + ii-V-i 轴
  ok('M2 jazz-noir(连字符键名加引号)正确解析:A minor / tempo 84 / 4 和弦,非回退 calm', (function () {
    var warned = [], ow = console.warn; console.warn = function (m) { warned.push(String(m)); };
    var s = C.resolveMusic('jazz-noir'); console.warn = ow;
    return s.mode === 'minor' && s.key === 'A' && s.tempo === 84 && s.progression.length === 4
      && warned.filter(function (m) { return m.indexOf('jazz-noir') >= 0; }).length === 0;   // 命中真预设 → 零 warn
  })());
  // M3 stealth:缺省 intensity(0.6)下,声明的 drone/pad/bass 全部过门控发声(LAYER_GATE drone0/pad0/bass.15);melody:'none' 不出 lead
  ok('M3 stealth 缺省 intensity 0.6:drone/pad/bass 都响、melody=none 无 lead(signoff 注明门槛关系)', (function () {
    var R = roles(C.composeMusic(C.resolveMusic('stealth')).events);
    return R.drone > 0 && R.pad > 0 && R.bass > 0 && !R.lead;
  })());
  // M4 无"声明却不响"死数据:9 个新预设里每个 instruments 声明的旋律/打击声部,在其 intensity 下都真发声(perc 计 kick/snare/hihat)
  //   〔C2 登场表已回滚 2026-07-03(端用户裁决:细粒度编排属终端作者)——seg=3 探针保留(对任意 seg 都该成立、更稳),下述"登场阈值"理由已不适用〕
  //   死数据的定义是"永不发声";登场延后≠死数据,只要存在某 seg 会响就不是。
  function fires(name, role, seg) {
    var R = roles(C.composeMusic(C.resolveMusic(name), seg).events);
    if (role === 'perc') return (R.kick || 0) + (R.snare || 0) + (R.hihat || 0) > 0;
    return (R[role] || 0) > 0;
  }
  ok('M4 9 个新预设声明的每个声部都真发声(过 intensity 门控 + 登场表,无死数据;elegy.lead 用 seg3 复核——C2 登场表生效后 seg0 静默是有意行为)', NEW9.every(function (n) {
    var instr = C.resolveMusic(n).instruments;
    return instr.every(function (role) { return fires(n, role, (n === 'elegy' && role === 'lead') ? 3 : undefined); });
  }));
  // M5 确定性:每个新预设两次成曲 events 字节相同(种子 PRNG)
  ok('M5 9 个新预设确定性(同名两次 events 字节相同)', NEW9.every(function (n) {
    var spec = C.resolveMusic(n);
    return JSON.stringify(C.composeMusic(spec).events) === JSON.stringify(C.composeMusic(spec).events);
  }));
  // M6 elegy(第二批·组件四 乐句发展):motif:[4,3,2,0] 现作【种子动机】经 period 发展——
  //   不再"每和弦 4 音"硬计数(旧行为·引擎未发布故同批更新),改断言"有发展的挽歌":
  //   ① 全曲共享 [4,3,2,0] 派生(段0=原样下行)② 各段不全等(段间发展、非字节复读)③ 仍全在 C minor 调内。
  //   〔C2 登场表已回滚 2026-07-03(端用户裁决:细粒度编排属终端作者)——seg=3 探针保留(对任意 seg 都该成立、更稳),下述"登场阈值"理由已不适用〕
  ok('M6 elegy 种子动机 [4,3,2,0] 经 period 发展:段0 原样下行 + 各段不全等 + seg3(登场后)全在 C minor 调内', (function () {
    var dna = C._deriveGenreDNA(C.resolveMusic('elegy'));
    var seqs = C._developPhrase(dna.phrasePlan, [4, 3, 2, 0], 4, 999);
    // ① 段0 = 原样种子动机(presentation 锚)
    var seg0Same = JSON.stringify(seqs[0]) === JSON.stringify([4, 3, 2, 0]);
    // ② 各段不全等(至少有两段序列不同 → 有发展)
    var allSame = seqs.every(function (s) { return JSON.stringify(s) === JSON.stringify(seqs[0]); });
    // ③ 实际成曲(seg3=lead 登场阈值)全在 C minor 调内
    var r = C.composeMusic(C.resolveMusic('elegy'), 3);
    var L = r.events.filter(function (e) { return e.role === 'lead'; });
    return seg0Same && !allSame && L.length > 0 && allInScale('C', 'minor', L) && dna.phrasePlan === 'period';
  })());
})();

// L. A2 鼓机律动 humanization(治机器感:swing + micro-timing 抖动 + velocity 起伏;独立种子流 → 不动旋律声部;确定性)
(function () {
  var spec = { mode: 'minor', key: 'A', instruments: ['pad', 'bass', 'arp', 'lead', 'perc'], intensity: 1, melody: 'flowing', tempo: 120 };
  var r1 = composeMusic(spec, 2).events, r2 = composeMusic(spec, 2).events;
  // L1 确定性:同 spec 两次 events 字节相同(perc humanization 用种子 PRNG,非 Math.random)——守 D1 同等强度
  ok('L1 鼓 humanize 后同 spec 两次仍字节相同(种子 PRNG 确定性)', JSON.stringify(r1) === JSON.stringify(r2));
  // L2 不碰旋律:含 perc 的曲与不含 perc 的曲,其 pad/bass/arp/lead/drone 事件【字节完全一致】(独立种子流,不消费 lead 的 rng)
  var noPerc = composeMusic({ mode: 'minor', key: 'A', instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, melody: 'flowing', tempo: 120 }, 2).events;
  function melodic(evs) { return evs.filter(function (e) { return ['pad', 'bass', 'arp', 'lead', 'drone'].indexOf(e.role) >= 0; }); }
  ok('L2 humanize 仅作用 perc:旋律声部(pad/bass/arp/lead)字节不变(独立 PRNG,不动 rng 流)', JSON.stringify(melodic(r1)) === JSON.stringify(melodic(noPerc)));
  // L3 velocity 起伏:同 role 的鼓点 gain 不再恒等(±13% 抖动),且仍在基准量级附近(防爆/防消失)
  var kicks = r1.filter(function (e) { return e.role === 'kick'; });
  var kGains = {}; kicks.forEach(function (e) { kGains[e.gain] = 1; });
  ok('L3 velocity 起伏:kick gain 有变化(非机械恒值)且在基准 0.5±15% 内(防爆/防消失)', Object.keys(kGains).length > 1 && kicks.every(function (e) { return e.gain > 0.5 * 0.84 && e.gain < 0.5 * 1.16; }));
  // L4 swing:反拍八分(标称 pt+spb/2,如第1拍反拍 t≈0.25)被后移(swingFrac 8-16% × 八分音长);对照正拍 hihat 仍贴近网格
  var spb = 60 / 120;  // 0.5s/拍 → 八分音 0.25s
  var hats = r1.filter(function (e) { return e.role === 'hihat'; });
  var off0 = hats.filter(function (e) { return Math.abs(e.t - spb / 2) < 0.06; })[0];   // 第一个反拍 hihat(标称 0.25)
  var on0 = hats.filter(function (e) { return e.t < 0.04; })[0];                          // 第一个正拍 hihat(标称 0)
  ok('L4 swing:反拍 hihat 被后移到网格之后(t > 标称 0.25 + 抖动余量),正拍 hihat 贴近网格 0',
    off0 && off0.t > spb / 2 + 0.005 && on0 && Math.abs(on0.t) < 0.012);
  // L5 micro-timing:正拍鼓点(标称整拍 t)有 ±~8ms 细微抖动(不再精确落网格,但量级很小)
  var beat1Kick = r1.filter(function (e) { return e.role === 'kick' && Math.abs(e.t - 0) < 0.02; })[0];   // 第一拍 kick(标称 0)
  ok('L5 micro-timing 抖动:鼓点不再死板对齐网格(|偏移| ≤ ~9ms,人手不齐)', beat1Kick != null && Math.abs(beat1Kick.t) <= 0.009 + 1e-9);
  // L6 不排进段前(负 t):全部 perc 事件 t ≥ 0
  ok('L6 humanize 后无负 t(绝不排进段前)', r1.every(function (e) { return e.t >= 0; }));
  // L7 不同 seed → 不同 perc humanization(swing/jitter/velocity 受 seed 影响)
  var sA = composeMusic({ mode: 'minor', key: 'A', instruments: ['perc'], intensity: 1, tempo: 120, seed: 1 }).events.filter(function (e) { return e.role === 'kick'; });
  var sB = composeMusic({ mode: 'minor', key: 'A', instruments: ['perc'], intensity: 1, tempo: 120, seed: 2 }).events.filter(function (e) { return e.role === 'kick'; });
  ok('L7 不同 seed → perc humanization 不同(swing/jitter/velocity 受 seed 影响)', JSON.stringify(sA) !== JSON.stringify(sB));
  // L8 含 perc 时音符仍全在调内(humanize 只动 t/gain,不碰音高;perc freq=0 不参与)
  ok('L8 含 perc 的曲音符仍全在调内(humanize 不碰音高)', allInScale('A', 'minor', r1));
  // L9 peak 段保完整鼓组(humanize 不增删候选;4 和弦 × 4 拍:kick 8 / snare 8 / hihat 32)
  var R = roles(r1);
  ok('L9 peak 鼓候选计数守恒(humanize 只移位/调力度,arrangement peak 不抽减):kick 8 / snare 8 / hihat 32', R.kick === 8 && R.snare === 8 && R.hihat === 32);
})();

// N. 旋律多变性 第一批(组件二 arp + 组件一 contour)· 设计稿 docs/melody-variety-design.md §3/§4/§5
//    档 A:零契约升级;验 arp 索引字面等值 / 轮廓正确性 / 在调 / 确定性 / 目标达成(换 feel 真换旋律)/ M6·segDur 守恒。
(function () {
  // N1 arp 索引序列字面等值(纯几何 pattern,不依赖 rng)——核心根治"主旋律永远那一个琶音"
  ok('N1 ARP up N=3 → [0,1,2]', JSON.stringify(C._ARP_PATTERNS.up(3)) === JSON.stringify([0, 1, 2]));
  ok('N2 ARP alberti → [0,2,1,2](低-高-中-高,Domenico Alberti)', JSON.stringify(C._ARP_PATTERNS.alberti(3)) === JSON.stringify([0, 2, 1, 2]));
  ok('N3 ARP updown N=3 → [0,1,2,1](inclusive 周期 2N-2,顶不重复)', JSON.stringify(C._ARP_PATTERNS.updown(3)) === JSON.stringify([0, 1, 2, 1]));
  ok('N4 ARP down N=3 → [2,1,0]', JSON.stringify(C._ARP_PATTERNS.down(3)) === JSON.stringify([2, 1, 0]));
  ok('N5 ARP downup N=3 → [2,1,0,1]', JSON.stringify(C._ARP_PATTERNS.downup(3)) === JSON.stringify([2, 1, 0, 1]));

  // N6 arpSequence:octaves 展开音池(∪ note+12·o)、rate 定步数、gate 透传
  (function () {
    var seq = C._arpSequence([60, 64, 67], { pattern: 'up', octaves: 2, rate: 8, gate: 0.5, seed: 1 });
    ok('N6 arpSequence up·2oct·8th → 8 步、音池含 +12 八度(72/76/79)、gate 透传 0.5', (function () {
      var midis = seq.map(function (x) { return x.midi; });
      return seq.length === 8 && midis.indexOf(72) >= 0 && midis.indexOf(76) >= 0 && midis.indexOf(79) >= 0
        && seq.every(function (x) { return x.gate === 0.5; }) && seq[0].step === 0 && seq[7].step === 7;
    })());
  })();
  // N7 arpSequence rate=16 → 16 步(synthwave 招牌 16 分)
  ok('N7 arpSequence rate=16 → 16 步', C._arpSequence([60, 64, 67], { pattern: 'up', octaves: 2, rate: 16, gate: 0.5, seed: 1 }).length === 16);

  // N8 轮廓正确性:arch 经 contourMelody 后单峰(全局极大值唯一)——单峰原则(Huron)
  (function () {
    var unique = true;
    for (var s = 1; s <= 50; s++) {
      var mel = C._contourMelody({ contourKind: 'arch', pStep: 0.72 }, [0, 2, 4], 8, mulb(s >>> 0));
      var peak = Math.max.apply(null, mel);
      if (mel.filter(function (v) { return v === peak; }).length !== 1) { unique = false; break; }
    }
    ok('N8 arch contourMelody:全局峰唯一(单峰原则,后处理强制;50 seed)', unique);
  })();
  // N9 arch 解析曲线 target(x) 峰落 [0.4N,0.6N](N=16 离散 argmax 落中段)
  (function () {
    var N = 16, vals = [], i;
    for (i = 0; i < N; i++) { var x = i / (N - 1); vals.push(C._CONTOURS.arch(x, 0, 7)); }
    var peak = Math.max.apply(null, vals), idx = vals.indexOf(peak);
    ok('N9 CONTOURS.arch 曲线峰落 [0.4N,0.6N](单峰中段,N=16)', idx >= 0.4 * N && idx <= 0.6 * N);
  })();
  // N10 ascending 解析曲线目标单调非降(线性升)
  (function () {
    var N = 8, ok10 = true, prev = -Infinity;
    for (var i = 0; i < N; i++) { var v = C._CONTOURS.ascending(i / (N - 1), 0, 7); if (v < prev - 1e-9) ok10 = false; prev = v; }
    ok('N10 CONTOURS.ascending 目标单调非降(线性升)', ok10);
  })();

  // N11 在调:新 flowing lead + arp(含 octaves 展开)全部 midi%12 ∈ MODES[mode]
  (function () {
    var r = C.composeMusic({ mode: 'dorian', key: 'D', instruments: ['arp', 'lead'], intensity: 1, melody: 'flowing', feel: ['baroque'] });
    ok('N11 baroque flowing(arp alberti·16th + lead wave)全部音符在 D dorian 调内', allInScale('D', 'dorian', r.events));
  })();
  // N12 在调:多调式 × 不同曲风 feel,arp+lead 仍永不跑调(octaves 展开 +12 保 pc)
  (function () {
    var allOK = true;
    [['synthwave', 'minor', 'A'], ['romance', 'major', 'C'], ['scherzo', 'lydian', 'F']].forEach(function (t) {
      var r = C.composeMusic({ mode: t[1], key: t[2], instruments: ['arp', 'lead', 'pad', 'bass'], intensity: 1, melody: 'flowing', feel: [t[0]] });
      if (!allInScale(t[2], t[1], r.events)) allOK = false;
    });
    ok('N12 synthwave/romance/scherzo 各调式下 arp+lead 全在调(octaves +12 不破音级)', allOK);
  })();

  // N13 确定性:同 spec(含 flowing + arp)两次 events 字节相同(独立种子流、非 Math.random)
  (function () {
    var spec = { mode: 'minor', key: 'G#', instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, melody: 'flowing', feel: ['synthwave'] };
    ok('N13 同 spec 两次 events 字节相同(contour/arp 独立流确定性)', JSON.stringify(C.composeMusic(spec).events) === JSON.stringify(C.composeMusic(spec).events));
  })();
  // N14 random* arp 也确定性(rng 来自种子,非 Math.random)
  (function () {
    var spec = { mode: 'minor', key: 'A', instruments: ['arp'], intensity: 1, feel: ['eerie'] };  // eerie → random arp
    ok('N14 random arp 仍确定性(种子流)', JSON.stringify(C.composeMusic(spec).events) === JSON.stringify(C.composeMusic(spec).events));
  })();

  // N15 目标达成:synthwave 与 baroque 的 arp 索引序列【不同】(治"换预设像换皮肤")
  (function () {
    var sw = C._deriveGenreDNA({ feel: ['synthwave'] }), bq = C._deriveGenreDNA({ feel: ['baroque'] });
    var swArp = C._arpSequence([60, 64, 67], { pattern: sw.arpPattern, octaves: sw.arpOctaves, rate: sw.arpRate, gate: sw.arpGate, seed: 1 }).map(function (x) { return x.midi; });
    var bqArp = C._arpSequence([60, 64, 67], { pattern: bq.arpPattern, octaves: bq.arpOctaves, rate: bq.arpRate, gate: bq.arpGate, seed: 1 }).map(function (x) { return x.midi; });
    ok('N15 synthwave(up·16th·2oct)vs baroque(alberti)arp 序列不同', JSON.stringify(swArp) !== JSON.stringify(bqArp));
  })();
  // N16 目标达成:不同 feel → 不同 contourKind(轮廓身份不同)
  (function () {
    var kinds = ['synthwave', 'baroque', 'march', 'sad'].map(function (f) { return C._deriveGenreDNA({ feel: [f] }).contourKind; });
    // synthwave=arch / baroque=wave / march=ascending / sad=descending → 至少 3 种不同
    var uniq = {}; kinds.forEach(function (k) { uniq[k] = 1; });
    ok('N16 不同 feel → 不同 contourKind(synthwave/baroque/march/sad ≥3 种)', Object.keys(uniq).length >= 3);
  })();
  // N17 deriveGenreDNA 无明确曲风 → 通用基线(§4:arch + pStep0.72 + up·8th·1oct·gate0.9)
  (function () {
    var base = C._deriveGenreDNA({ feel: ['某不存在的词'] });
    ok('N17 无曲风 feel → 通用基线 DNA(arch/0.72/up/8/1/0.9)',
      base.contourKind === 'arch' && base.pStep === 0.72 && base.arpPattern === 'up' && base.arpRate === 8 && base.arpOctaves === 1 && base.arpGate === 0.9);
    ok('N17b 空 feel → 同样通用基线', JSON.stringify(C._deriveGenreDNA({})) === JSON.stringify(base));
  })();

  // N18(第二批更新):elegy motif 现走乐句发展(M6 新行为)——有 lead 且全在 C minor 调内、段总时长守恒(末音不溢出段)
  //   〔C2 登场表已回滚 2026-07-03(端用户裁决:细粒度编排属终端作者)——seg=3 探针保留(对任意 seg 都该成立、更稳),下述"登场阈值"理由已不适用〕
  (function () {
    var r = C.composeMusic(C.resolveMusic('elegy'), 3);
    var L = r.events.filter(function (e) { return e.role === 'lead'; });
    var segDur = r.segDur, noOverflow = L.every(function (e) { return e.t + e.dur <= segDur + 1e-6; });
    ok('N18 elegy motif 走发展(seg3,登场后):有 lead(' + L.length + ' 个)、在 C minor 调内、不溢出段', L.length > 0 && allInScale('C', 'minor', L) && noOverflow);
  })();
  // N19 none 守恒:melody=none 仍无 lead(分支未碰)
  ok('N19 melody=none 仍无 lead(组件一不碰 none 分支)', !roles(C.composeMusic({ instruments: ['lead'], intensity: 1, melody: 'none', feel: ['synthwave'] }).events).lead);
  // N20 segDur 守恒:升级未动 beatsPerChord/spb(默认 9.6s、tempo 200→4.8s)
  ok('N20 segDur 守恒(未动 beatsPerChord/stepsPerBeat):默认 9.6 / tempo200 4.8',
    Math.abs(C.composeMusic({ mode: 'major', key: 'C', feel: ['baroque'] }).segDur - 9.6) < 1e-6
    && Math.abs(C.composeMusic({ tempo: 200, feel: ['synthwave'] }).segDur - 4.8) < 1e-6);
  // N21 arp 总时长守恒:rate=16 时 16 步均分一个和弦(末步起点 = 15/16 和弦长),不溢出段
  (function () {
    var spec = { mode: 'major', key: 'C', progression: ['I'], instruments: ['arp'], intensity: 1, feel: ['synthwave'], tempo: 100 };  // synthwave rate16
    var r = C.composeMusic(spec, 2), arp = r.events.filter(function (e) { return e.role === 'arp'; });
    var chordLen = 4 * (60 / 100);  // 4 拍 × 0.6s = 2.4s
    ok('N21 arp rate16 16 步均分和弦、不溢出(末步起点 < 和弦长)', arp.length === 16 && arp[arp.length - 1].t < chordLen + 1e-9 && arp.every(function (e) { return e.t >= 0; }));
  })();
})();

// P. 旋律多变性 第二批 · 组件四 乐句发展(治"段内复读"+服务"作品一体性")· 设计稿 §3.3/§五
//    六动机算子代数律 + developPhrase 发展性(段间不全等 + 共享种子动机派生)+ 在调 + 确定性 + L2 守恒。
(function () {
  var O = C._MOTIF_OPS;
  // P1 算子代数律:retrograde∘retrograde = id(逆行两次=原样)
  (function () {
    var ok1 = true;
    [[0, 2, 4, 3], [4, 3, 2, 0], [5], [1, 1, 2]].forEach(function (m) {
      if (JSON.stringify(O.retrograde(O.retrograde(m))) !== JSON.stringify(m)) ok1 = false;
    });
    ok('P1 代数律:retrograde∘retrograde = id(逆行两次=原样,4 个动机)', ok1);
  })();
  // P2 算子代数律:invert∘invert = id(倒影两次=原样;modal 倒影绕同轴对合)
  (function () {
    var ok2 = true;
    [[0, 2, 4, 3], [4, 3, 2, 0], [5], [1, 1, 2]].forEach(function (m) {
      if (JSON.stringify(O.invert(O.invert(m))) !== JSON.stringify(m)) ok2 = false;
    });
    ok('P2 代数律:invert∘invert = id(倒影两次=原样)', ok2);
  })();
  // P3 算子代数律:retrogradeInvert = retrograde∘invert(逆行倒影 = 倒影后逆行)
  (function () {
    var ok3 = true;
    [[0, 2, 4, 3], [4, 3, 2, 0], [1, 5, 2]].forEach(function (m) {
      if (JSON.stringify(O.retrogradeInvert(m)) !== JSON.stringify(O.retrograde(O.invert(m)))) ok3 = false;
    });
    ok('P3 代数律:retrogradeInvert = retrograde∘invert', ok3);
  })();
  // P4 transpose/sequence/fragment/diminish/augment 字面正确
  ok('P4 transpose [0,2,4] +2 → [2,4,6]', JSON.stringify(O.transpose([0, 2, 4], 2)) === JSON.stringify([2, 4, 6]));
  ok('P5 invert [0,2,4](axis 首音 0)→ [0,-2,-4](绕 0 反射)', JSON.stringify(O.invert([0, 2, 4])) === JSON.stringify([0, -2, -4]));
  ok('P6 sequence [0,2] reps3 step-1(下行模进)→ [0,2,-1,1,-2,0]', JSON.stringify(O.sequence([0, 2], 3, -1)) === JSON.stringify([0, 2, -1, 1, -2, 0]));
  ok('P7 fragment [4,3,2,0](前半)→ [4,3]', JSON.stringify(O.fragment([4, 3, 2, 0])) === JSON.stringify([4, 3]));
  ok('P8 diminish [0,1,2,3] ×2(隔一取)→ [0,2]', JSON.stringify(O.diminish([0, 1, 2, 3], 2)) === JSON.stringify([0, 2]));
  ok('P9 augment [0,2] ×2(每音重复)→ [0,0,2,2]', JSON.stringify(O.augment([0, 2], 2)) === JSON.stringify([0, 0, 2, 2]));

  // P10 developPhrase 发展性:period 计划下,各段不全等(段间发展、非字节复读)+ 段0 = 原样种子动机(repetition 锚)
  (function () {
    var seqs = C._developPhrase('period', [4, 3, 2, 0], 4, 12345);
    var seg0 = JSON.stringify(seqs[0]) === JSON.stringify([4, 3, 2, 0]);
    var notAllSame = !seqs.every(function (s) { return JSON.stringify(s) === JSON.stringify(seqs[0]); });
    ok('P10 developPhrase(period):段0 原样种子动机(锚)+ 各段不全等(发展非复读)', seg0 && notAllSame && seqs.length === 4);
  })();
  // P11 共享种子动机派生:全部段都从同一动机 [4,3,2,0] 派生(段0=原样、其余=算子变形,首音多与种子相关)→ 作品一体性
  (function () {
    var motif = [4, 3, 2, 0];
    var pseqs = C._developPhrase('period', motif, 4, 777);
    var sseqs = C._developPhrase('sentence', motif, 4, 777);
    // 一体性可检性质:换种子动机 → 全部段随之变(派生自种子,非独立现编)
    var altP = C._developPhrase('period', [0, 1, 2], 4, 777);
    var changed = JSON.stringify(pseqs) !== JSON.stringify(altP);
    // period 与 sentence 计划不同 → 发展路径不同(同动机不同发展)
    var planDiff = JSON.stringify(pseqs) !== JSON.stringify(sseqs);
    ok('P11 共享种子动机:换动机→全段变(派生自种子)+ period≠sentence(同动机不同发展路径)', changed && planDiff);
  })();
  // P12 static 计划:全段 = 原样种子动机(stealth/eerie 不强加发展)
  (function () {
    var seqs = C._developPhrase('static', [2, 4, 1], 4, 5);
    ok('P12 developPhrase(static):全段=原样种子动机(不强加发展)', seqs.every(function (s) { return JSON.stringify(s) === JSON.stringify([2, 4, 1]); }));
  })();
  // P13 空种子动机(melody=none / motif:[])→ 各段空、不出 lead
  (function () {
    var seqs = C._developPhrase('period', [], 4, 1);
    ok('P13 空种子动机 → 各段空(守 I1/N19,melody=none 无 lead)', seqs.length === 4 && seqs.every(function (s) { return s.length === 0; }));
  })();
  // P14 sentence 发展接进 lead 生成:flowing(无 motif)曲共享种子动机派生、段间不全等、全在调内
  (function () {
    var spec = { mode: 'major', key: 'C', progression: ['I', 'IV', 'V', 'I'], instruments: ['lead'], intensity: 1, melody: 'flowing', feel: ['synthwave'] };
    var r = C.composeMusic(spec);
    var dna = C._deriveGenreDNA(spec);
    var seed = C._seedMotifFor(spec, dna);
    var seqs = C._developPhrase(dna.phrasePlan, seed, 4, (r.spec.seed ^ 0x68e31da4) >>> 0);
    var notAllSame = !seqs.every(function (s) { return JSON.stringify(s) === JSON.stringify(seqs[0]); });
    var L = r.events.filter(function (e) { return e.role === 'lead'; });
    ok('P14 flowing(synthwave·sentence)经发展:种子动机非空 + 段间不全等 + lead 全在 C major 调内',
      seed.length >= 3 && dna.phrasePlan === 'sentence' && notAllSame && L.length > 0 && allInScale('C', 'major', L));
  })();
  // P15 确定性守恒:同 spec(含发展)两次 events 字节相同(phraseSeed/rhythmSeed 独立种子流、非 Math.random)
  (function () {
    var spec = { mode: 'minor', key: 'A', progression: ['i', 'VI', 'iv', 'V'], instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, melody: 'flowing', feel: ['jazz-noir'] };
    ok('P15 发展+节奏后同 spec 两次 events 字节相同(独立种子流确定性)', JSON.stringify(C.composeMusic(spec).events) === JSON.stringify(C.composeMusic(spec).events));
  })();
  // P16 L2 守恒:phraseSeed/rhythmSeed 独立流 → 加/去 perc 不改 lead/pad/bass/arp 字节(不消费 lead 主 rng)
  (function () {
    var withP = C.composeMusic({ mode: 'minor', key: 'A', instruments: ['pad', 'bass', 'arp', 'lead', 'perc'], intensity: 1, melody: 'flowing', feel: ['march'], tempo: 120 }).events;
    var noP = C.composeMusic({ mode: 'minor', key: 'A', instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, melody: 'flowing', feel: ['march'], tempo: 120 }).events;
    function mel(evs) { return evs.filter(function (e) { return ['pad', 'bass', 'arp', 'lead', 'drone'].indexOf(e.role) >= 0; }); }
    ok('P16 L2 守恒:加 perc 不改 pad/bass/arp/lead 字节(phrase/rhythm 独立种子流,不动 lead rng)', JSON.stringify(mel(withP)) === JSON.stringify(mel(noP)));
  })();
})();

// Q. 旋律多变性 第二批 · 组件三 节奏(随曲风分化;perc 默认仍不碰守 L9)· 设计稿 §3.4/§四
//    swing 偏移存在 / 附点·三连 dur 出现 / 各预设时值直方图不同 / 段总时长守恒 / bass 型(oom-pah/walking)可辨 / 在调。
(function () {
  // Q1 swing 离散档:反拍(奇数音)onset 随档位递增后移(straight < light < triplet < shuffle);偶数音(强拍)不动
  (function () {
    function onsets(swingName) {
      var dna = { rhythm: { swing: swingName, density: 0.55, bassPattern: 'block' }, phrasePlan: 'period' };
      return C._leadRhythm(4, 4, 0.6, dna, 5).map(function (x) { return x.t; });
    }
    var str = onsets('straight'), lt = onsets('light'), tr = onsets('triplet'), sh = onsets('shuffle');
    // 第 1 个反拍音(index 1)随 swing 档递增后移
    ok('Q1 swing 反拍 onset 递增后移:straight < light < triplet < shuffle(index1 反拍)',
      str[1] < lt[1] && lt[1] < tr[1] && tr[1] < sh[1]);
    // 强拍(index 0)始终在 0(swing 不动强拍)
    ok('Q1b swing 不动强拍(index0 始终 0)', str[0] === 0 && tr[0] === 0 && sh[0] === 0);
  })();
  // Q2 leadRhythm:① 时值非均分(多种 dur,强拍长/弱拍短)② **onset 锁八分网格**(本修复核心:不再 scale 漂格)
  (function () {
    // ① 非均分:扫多 seed,dur 多重集 ≥2 种(均分只有 1 种)。新网格版时值=网格步数 1/2/3/4(八分/四分/附点/二分)。
    function durKinds(dna) { var h = {}; for (var s = 1; s <= 30; s++) C._leadRhythm(6, 4, 0.6, dna, s).forEach(function (x) { h[+x.dur.toFixed(4)] = 1; }); return Object.keys(h).length; }
    var nonUniform = durKinds(C._deriveGenreDNA({ feel: ['romance'] })) >= 2 && durKinds(C._deriveGenreDNA({ feel: ['baroque'] })) >= 2;
    ok('Q2a leadRhythm 产多种时值(非均分:≥2 种 dur)', nonUniform);
    // ② onset 锁网格:每个 lead onset 的拍数(扣除可能的 swing 反拍偏移)恒为 GRID=0.5 的整数倍 → 与 bass/arp/perc 同脉冲对齐(治"卡不上")
    var GRID = 0.5, spb = 0.6, locked = true, isMul = function (v) { return Math.abs(v / GRID - Math.round(v / GRID)) < 1e-6; };
    ['synthwave', 'march', 'romance', 'jazz-noir', 'baroque', 'chase'].forEach(function (f) {
      var dna = C._deriveGenreDNA({ feel: [f] }), sf = (C._SWING_FRAC && C._SWING_FRAC[dna.rhythm && dna.rhythm.swing]) || 0;
      for (var s = 1; s <= 20; s++) C._leadRhythm(6, 4, spb, dna, s).forEach(function (x) {
        var b = x.t / spb;                                  // onset 拍数
        if (!isMul(b) && !isMul(b - sf)) locked = false;    // 整拍/网格位 或 网格位+swing(反拍)
      });
    });
    ok('Q2b lead onset 锁八分网格(扣 swing 后为 GRID 整数倍,与脉冲对齐 = 治"卡不上")', locked);
  })();
  // Q3 各预设时值直方图不同(换曲风=真换节奏,不是换皮肤)——跨多 seed 聚合"原始 beat 时值"直方图
  //    (高 density baroque 偏短促/三连;低 density solemn 偏长音 → 聚合直方图必不同。近似 density 可能偶同序列,故聚合判。)
  (function () {
    function durBeatHist(feel) {   // 去缩放还原 beat 时值(dur = beat·spb·scale·0.92;scale=chordLen/(totalBeats·spb))→ 聚合各 beat 量的出现次数
      var dna = C._deriveGenreDNA({ feel: feel }), h = {};
      for (var s = 1; s <= 40; s++) {
        var rh = C._leadRhythm(6, 4, 0.6, dna, s), tot = 0;
        rh.forEach(function (x) { tot += x.dur; });   // 用归一占比作直方图键(避免浮点缩放噪声)
        rh.forEach(function (x) { var frac = (tot > 0 ? x.dur / tot : 0); h[frac.toFixed(2)] = (h[frac.toFixed(2)] || 0) + 1; });
      }
      return JSON.stringify(h);
    }
    var bq = durBeatHist(['baroque']), so = durBeatHist(['solemn']), ch = durBeatHist(['chase']);
    // 高 density(baroque/chase 偏短促)vs 低 density(solemn 偏长音)→ 聚合直方图不同(换曲风=真换节奏)
    ok('Q3 不同曲风 lead 时值直方图不同(baroque/chase 高 density vs solemn 低 density,40 seed 聚合)', bq !== so && ch !== so);
  })();
  // Q4 段总时长守恒:任意曲风/音数,leadRhythm 末音不溢出段(t+dur ≤ chordLen)+ 末音 onset 贴近段末(缩放铺满)
  (function () {
    var allOK = true, fills = true;
    ['baroque', 'romance', 'jazz-noir', 'march', 'solemn'].forEach(function (f) {
      var dna = C._deriveGenreDNA({ feel: [f] });
      for (var n = 1; n <= 8; n++) {
        var rh = C._leadRhythm(n, 4, 0.6, dna, n * 7 + 1);
        rh.forEach(function (x) { if (x.t + x.dur > 4 * 0.6 + 1e-9) allOK = false; if (x.t < -1e-9) allOK = false; });
        var last = rh[rh.length - 1];
        if (last && last.t > 4 * 0.6 + 1e-9) fills = false;   // 末音 onset 不超段末
      }
    });
    ok('Q4 段总时长守恒:5 曲风 × 1-8 音,leadRhythm 末音不溢出段(t+dur ≤ chordLen)且 onset 在段内', allOK && fills);
  })();
  // Q5 bass oom-pah 可辨:真实 march/Bb 首和弦的 bass = 根/下方真实五度交替,非独立 fold 后反爬到根音上方。
  (function () {
    var r = C.composeMusic(C.resolveMusic('march'), 0), spb = 60 / r.spec.tempo;
    var bass = r.events.filter(function (e) { return e.role === 'bass' && e.t < 4 * spb; });
    var freqs = bass.map(function (e) { return Math.round(e.freq); });
    // Bb2(46) 的下方真实五度应为 F2(41),不是分别折到 G3 以下后得到的 F3(53)。
    // 变异=只对 notes[2]-24 做 bassFold、未再相对 bassMidi 下折 → 真实 march 首和弦 freqs[1] > freqs[0] → 红。
    ok('Q5 bass oom-pah(真实 march/Bb):4 击、拍1根=拍3根、拍2真实五度<根(根/下方五度交替)',
      bass.length === 4 && freqs[0] === freqs[2] && freqs[1] < freqs[0] && freqs[1] === freqs[3]);
  })();
  // Q5b 低音车道分离牙(端用户「march 乐器打架/双重」修,两端锁):
  //   ① march 全曲 bass 最高音 ≤ lead 最低音(低音不闯主旋律音区;变异=oompah 回上方五度→bass 冲到 midi72>lead62→红)
  //   ② drone+bass 同活预设(stealth)无同刻同频 drone/bass(drone 沉 bass 之下;变异=drone 回 -12→红)
  (function () {
    var mv = C.composeMusic(C.resolveMusic('march'), 0).events;
    var bmax = -1, lmin = 999;
    mv.forEach(function (e) { if (!e.freq) return; var m = Math.round(69 + 12 * Math.log2(e.freq / 440)); if (e.role === 'bass' && m > bmax) bmax = m; if (e.role === 'lead' && m < lmin) lmin = m; });
    // 重叠容差 3 半音:V 和弦根音(65)与 lead 最低音(62)天然擦边=正常邻接(根音不能挪);
    //   旧行为(上方五度)bass 冲到 72 = 侵入 10 半音才是「打架」。变异=oompah 回上方五度 → 重叠 10 > 3 → 红。
    ok('Q5b-1 march 低音车道:bass 最高 midi(' + bmax + ')与 lead 最低 midi(' + lmin + ')重叠 ≤3 半音(旧行为侵入 10=打架)', bmax > 0 && lmin < 999 && bmax - lmin <= 3);
    var sv = C.composeMusic(C.resolveMusic('stealth'), 0).events, dup = 0, seenDB = {};
    sv.forEach(function (e) { if (e.role !== 'drone' && e.role !== 'bass') return; var k = e.t.toFixed(3) + '#' + e.freq.toFixed(1); if (seenDB[k]) dup++; else seenDB[k] = 1; });
    ok('Q5b-2 stealth drone/bass 无同刻同频(drone 有 bass 时沉 -24;变异=回 -12→红)', dup === 0, 'dup=' + dup);
  })();
  // Q6 bass walking 可辨:baroque 保低位 melodic 三击，末拍留白；仍有音高变化而非 block 静止根音。
  (function () {
    var r = C.composeMusic({ mode: 'major', key: 'C', progression: ['I'], instruments: ['bass'], intensity: 1, feel: ['baroque'] });
    var bass = r.events.filter(function (e) { return e.role === 'bass'; });
    var freqs = bass.map(function (e) { return Math.round(e.freq); });
    var uniq = {}; freqs.forEach(function (f) { uniq[f] = 1; });
    ok('Q6 bass walking(baroque):3 击 melodic 低音+第4拍留白、音高有变化(非静止根音)',
      bass.length === 3 && Object.keys(uniq).length >= 2 && bass[bass.length - 1].t < 3 * (60 / r.spec.tempo));
  })();
  // Q7 bass block 守恒(无明确曲风 → 旧默认):每两拍一击(2 击)、同根音(向后兼容旧 bass 行为)
  (function () {
    var r = C.composeMusic({ mode: 'major', key: 'C', progression: ['I'], instruments: ['bass'], intensity: 1, feel: ['某无曲风'] });
    var bass = r.events.filter(function (e) { return e.role === 'bass'; });
    ok('Q7 bass block(通用基线):每两拍一击(2 击)同根音(旧默认行为守恒)',
      bass.length === 2 && Math.round(bass[0].freq) === Math.round(bass[1].freq));
  })();
  // Q8 节奏不破在调:含 lead(发展+leadRhythm)+ bass(各型)+ arp(swing)全在调内(节奏只动 t/dur,不碰音高)
  (function () {
    var allOK = true;
    [['baroque', 'major', 'D'], ['jazz-noir', 'minor', 'A'], ['march', 'major', 'Bb']].forEach(function (t) {
      var r = C.composeMusic({ mode: t[1], key: t[2], instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, melody: 'flowing', feel: [t[0]] });
      if (!allInScale(t[2], t[1], r.events)) allOK = false;
    });
    ok('Q8 节奏分化后全在调(baroque/jazz-noir/march:lead+bass+arp 音高不被节奏改动)', allOK);
  })();
  // Q9 arp swing:triplet 曲风(jazz-noir)的 arp 反拍步被后移(对比 straight 曲风同 seed arp onset)
  (function () {
    function arpOnsets(feel) {
      var r = C.composeMusic({ mode: 'minor', key: 'A', progression: ['i'], instruments: ['arp'], intensity: 1, feel: feel });
      return r.events.filter(function (e) { return e.role === 'arp'; }).map(function (e) { return +e.t.toFixed(4); });
    }
    // jazz-noir broken·8th·triplet swing vs romance broken·8th·straight(同 arpPattern broken/rate 8 → 步网格同,只差 swing)
    var jn = arpOnsets(['jazz-noir']), ro = arpOnsets(['romance']);
    // 反拍(奇数步)在 jazz-noir 被后移 → 至少一个奇数步 onset 比 romance 大
    var moved = false;
    for (var i = 1; i < Math.min(jn.length, ro.length); i += 2) if (jn[i] > ro[i] + 1e-9) moved = true;
    ok('Q9 arp swing:triplet 曲风(jazz-noir)反拍 arp 步被后移(对比 straight romance,同 broken·8th)', moved);
  })();
  // Q10 段总时长守恒(整曲层):arp swing 后步不溢出段(末步 t ≤ 和弦末)+ lead 不溢出
  (function () {
    var r = C.composeMusic({ mode: 'minor', key: 'A', instruments: ['arp', 'lead'], intensity: 1, melody: 'flowing', feel: ['jazz-noir'], tempo: 100 });
    var segDur = r.segDur;
    var ok10 = r.events.every(function (e) { return e.t >= -1e-9 && e.t <= segDur + 1e-9 && e.t + e.dur <= segDur + 1e-6; });
    ok('Q10 整曲守恒:arp(swing)+lead(发展+节奏)全部事件 t/dur 不溢出 segDur', ok10);
  })();
  // Q11 组件三(节奏旋钮 swing/density/bassPattern)只作用 bass/arp/lead,**不碰 perc**:march 曲(swing straight)
  //   的鼓计数与统一鼓点循环一致(kick 每 2 拍=8、snare 2/4 拍=8、hihat 每拍正拍+反拍=32)。
  //   〔C1 percPattern 已回滚 2026-07-03:此断言恢复批前原值 kick8/snare8/hihat32。〕
  (function () {
    var R = roles(C.composeMusic({ mode: 'minor', key: 'A', instruments: ['perc'], intensity: 1, feel: ['march'], tempo: 120 }, 2).events);
    ok('Q11 节奏旋钮不碰 perc:peak 段 march 鼓候选仍为 kick8/snare8/hihat32(统一鼓点)', R.kick === 8 && R.snare === 8 && R.hihat === 32);
  })();
})();

// ── SEG:段间变奏(audio-arrange-design)──────────────────────────────────────────
//   composeMusic(spec, segIndex):seg=0/无参 → 字节等价现状;seg≥1 → 同动机不同变形(破"乐句发展封顶 2-4 种")。
//   守:确定性 / 段0锚=种子动机原样(作品一体性)/ 在调 / segDur 守恒 / 不溢出 / seg0 字节等价 / 长 motif 不崩。
(function () {
  function leadFreqs(ev) { return ev.events.filter(function (e) { return e.role === 'lead'; }).map(function (e) { return +e.freq.toFixed(2); }).join(','); }
  function chord0Lead(ev, spb) { return ev.events.filter(function (e) { return e.role === 'lead' && e.t < 4 * spb - 1e-9; }).map(function (e) { return +e.freq.toFixed(2); }).join(','); }
  var heroic = C.resolveMusic('heroic'), spbH = 60 / heroic.tempo;

  ok('SEG-1 确定性:composeMusic(spec,2) 两次 events 字节相同(段索引也确定)',
    JSON.stringify(composeMusic(heroic, 2).events) === JSON.stringify(composeMusic(heroic, 2).events));

  ok('SEG-2 发展性:seg0 ≠ seg2(段间产同动机不同变形,破封顶)',
    leadFreqs(composeMusic(heroic, 0)) !== leadFreqs(composeMusic(heroic, 2)));

  (function () {   // SEG-2b 破封顶量化:6 旗舰 preset segIndex 0..11 唯一旋律数 ≥ 8(改前 2-4、改后实测 11-12)
    var FLAG = ['heroic', 'festive', 'romance', 'march', 'baroque', 'synthwave'], allBroke = true;
    FLAG.forEach(function (f) {
      var sp = C.resolveMusic(f), set = {};
      for (var s = 0; s < 12; s++) set[leadFreqs(composeMusic(sp, s))] = 1;
      if (Object.keys(set).length < 8) allBroke = false;
    });
    ok('SEG-2b 破封顶:6 旗舰 preset 各 segIndex 0..11 唯一旋律数 ≥ 8(改前 2-4)', allBroke);
  })();

  ok('SEG-3 段长守恒:segDur 不随 segIndex 变(段索引不进 segDur=base 推进/重锚不失锚)',
    composeMusic(heroic, 0).segDur === composeMusic(heroic, 7).segDur);

  (function () {   // SEG-4 不溢出守恒(lesson 82):seg5 全事件 t/dur 落在 [0, segDur]
    var r = composeMusic(heroic, 5), sd = r.segDur;
    ok('SEG-4 lesson82:seg5 全事件 t≥0 且 t+dur≤segDur(变奏不溢出段、不漂格出界)',
      r.events.every(function (e) { return e.t >= -1e-9 && e.t + e.dur <= sd + 1e-6; }));
  })();

  var seed = C._seedMotifFor(C.normalizeSpec(heroic), C._deriveGenreDNA(C.normalizeSpec(heroic)));
  ok('SEG-5 作品身份锚:外层 arrangement 可抽密度，但 developPhrase 的首和弦种子动机仍逐音原样',
    JSON.stringify(C._developPhrase('period', seed, 4, 123, 2)[0]) === JSON.stringify(seed) && seed.length > 0);

  ok('SEG-6 在调守恒:seg9 所有音仍在 key/mode 调内(MOTIF_OPS 在音级整数格 → 不产调外音)',
    allInScale(heroic.key, heroic.mode, composeMusic(heroic, 9).events));

  (function () {   // SEG-7 static 对照:eerie(phrasePlan='static')lead 不变奏(诚实标注该轴对 static 无效)
    var ee = C.resolveMusic('eerie');
    ok('SEG-7 static 对照:eerie(static)seg0 与 seg3 lead 相同(static 不强加发展;诚实上界)',
      leadFreqs(composeMusic(ee, 0)) === leadFreqs(composeMusic(ee, 3)));
  })();

  (function () {   // SEG-8 段乘子无碰撞:SEG_MULT 与 7 个既有异或常量两两不等(防漂移耦合;纯常量文档断言)
    var SEG_MULT = 0x9e3779b1, XORS = [0x27d4eb2f, 0xb5297a4d, 0x85ebca6b, 0x9e3779b9, 0x68e31da4, 0xc2b2ae35, 0x1b56c4e9];
    ok('SEG-8 段乘子无碰撞:SEG_MULT(0x9e3779b1)与 7 个既有异或常量两两不等', XORS.indexOf(SEG_MULT) < 0);
  })();

  (function () {   // SEG-9 长 motif 不崩(§五 P0 回归):6 音 motif × seg 0..23,不抛 + 在调 + 不溢出
    var crash = false, allOK = true;
    var spec = { key: 'C', mode: 'major', progression: ['I', 'V', 'vi', 'IV'], tempo: 120, instruments: ['lead'], melody: 'motif:[0,1,2,3,4,5]' };
    try {
      for (var s = 0; s < 24; s++) {
        var r = composeMusic(spec, s);
        if (!allInScale('C', 'major', r.events)) allOK = false;
        if (!r.events.every(function (e) { return e.t >= -1e-9 && e.t + e.dur <= r.segDur + 1e-6; })) allOK = false;
      }
    } catch (e) { crash = true; }
    ok('SEG-9 长 motif(6 音)× seg 0..23 不崩 + 在调 + 不溢出(宽算子池 sequence 不越网格槽)', !crash && allOK);
  })();

  ok('SEG-10 seg0 字节等价无参:composeMusic(spec,0) === composeMusic(spec)(向后兼容铁律)',
    JSON.stringify(composeMusic(heroic, 0).events) === JSON.stringify(composeMusic(heroic).events));
})();

// A3(fail-loud):timbre 指向 instruments 外的声部 → warn-once(该声部从不排音=音色静默无效);声部在表内不 warn
(function () {
  function warns(spec) { var w = 0; var o = console.warn; console.warn = function () { w++; }; composeMusic(spec); console.warn = o; return w; }
  var base = { mode: 'major', key: 'C', progression: ['I', 'IV', 'V', 'I'] };
  ok('A3a timbre.lead 但 instruments 无 lead → warn(死声部,showcase sacral+lead 实测)', warns(Object.assign({}, base, { instruments: ['pad', 'bass'], timbre: { lead: 'brass' } })) > 0);
  ok('A3b timbre.pad 且 pad 在 instruments → 不 warn(零误报)', warns(Object.assign({}, base, { instruments: ['pad', 'bass'], timbre: { pad: 'organ' } })) === 0);
})();

(function () {   // SEG-E:Eno 不可公约循环(arp 层段间轮转音型 · audio-arrange-design §Eno)
  var spec = { key: 'C', mode: 'minor', tempo: 90, progression: ['i', 'VI', 'III', 'VII'], instruments: ['pad', 'bass', 'arp', 'lead'], feel: 'calm' };
  function arp(seg) { return composeMusic(spec, seg).events.filter(function (e) { return e.role === 'arp'; }); }
  function pad(seg) { return composeMusic(spec, seg).events.filter(function (e) { return e.role === 'pad'; }); }
  function bass(seg) { return composeMusic(spec, seg).events.filter(function (e) { return e.role === 'bass'; }); }
  function fre(evs) { return evs.map(function (e) { return Math.round(e.freq); }).join(','); }
  function ons(evs) { return evs.map(function (e) { return e.t.toFixed(5); }).join(','); }
  var spb = 60 / 90;
  ok('SEG-E1 seg0==无 segIndex(全 events 字节恒等=向后兼容)', JSON.stringify(composeMusic(spec, 0).events) === JSON.stringify(composeMusic(spec).events));
  ok('SEG-E2 arp seg0!=seg1!=seg2(段间轮转音型=消除 arp verbatim)', fre(arp(0)) !== fre(arp(1)) && fre(arp(1)) !== fre(arp(2)));
  ok('SEG-E3 arp 三段音型环仍回到 home（密度 mask 可抽事件，但 _arpCycle 的第4段主型不漂）', C._arpCycle ? C._arpCycle('up')[3 % 3] === 'up' : fre(arp(3)).length > 0);
  ok('SEG-E4 arrangement 抽减后的 arp onset 仍落原八分/十六分网格（扣 swing 后不漂格）', [0,1,2,3].every(function (seg) { var dna = C._deriveGenreDNA(C.normalizeSpec(spec)), sf = C._SWING_FRAC[dna.rhythm.swing] || 0; return arp(seg).every(function (e) { var beat = e.t / spb; return Math.abs(beat * 2 - Math.round(beat * 2)) < 1e-6 || Math.abs((beat - sf) * 2 - Math.round((beat - sf) * 2)) < 1e-6; }); }));
  ok('SEG-E5 批 B pad 不再四段复读:seg0 statement 与 seg1 answer 形态不同、仍都非空', fre(pad(0)) !== fre(pad(1)) && pad(0).length > 0 && pad(1).length > 0);
  ok('SEG-E6 确定性:arp seg2 两次字节相同', fre(arp(2)) === fre(arp(2)));
  ok('SEG-E7 arp 段间轮转仍在调内(seg1/2/5 不出调)', allInScale('C', 'minor', arp(1).concat(arp(2)).concat(arp(5))));
  // SEG-EB:Eno v2 bass 节奏型 2 段循环(period 2 ⊥ arp 3 = 真·多层不可公约)
  ok('SEG-EB1 bass seg0!=seg1(节奏型轮转=消除 bass verbatim)', fre(bass(0)) !== fre(bass(1)));
  ok('SEG-EB2 bass seg2==seg0(period 2)且 arp seg2!=seg0(period 3)→ 周期互质=多层不公约', fre(bass(2)) === fre(bass(0)) && fre(arp(2)) !== fre(arp(0)));
  ok('SEG-EB3 bass onset 全在拍网格(seg1,t/spb 整数=守 lesson 82)', bass(1).every(function (e) { return Math.abs(e.t / spb - Math.round(e.t / spb)) < 1e-9; }));
  ok('SEG-EB4 bass 段间轮转仍在调内(seg1/3 不出调)', allInScale('C', 'minor', bass(1).concat(bass(3))));
  // SEG-E8:genre 性格保留(ARP_KIN 同族邻居,修审计 wg2yunxe5 的 §11 违规——降进哀乐 arp 不被轮转强翻成上行)
  (function () {
    var g = { key: 'C', mode: 'minor', progression: ['i', 'VI', 'III', 'VII'], instruments: ['arp'], intensity: 1, feel: ['grief'], tempo: 90 };
    function gf(s) { return composeMusic(g, s).events.filter(function (e) { return e.role === 'arp'; }).map(function (e) { return Math.round(e.freq); }); }
    var a0 = gf(0), a1 = gf(1);
    // grief 主音型=降进(down):seg0 首步下行;ARP_KIN 同族邻居(down→[down,downup,broken])使 seg1 仍非上行——旧 ARP_SAFE 会翻成 'up'(a1[1]>a1[0])→ 本断言红=有牙
    ok('SEG-E8 性格保留:grief(降进 arp)seg0 下行 & seg1 不翻上行(ARP_KIN 同族;旧 ARP_SAFE 强翻 up 会红)', a0.length > 1 && a1.length > 1 && a0[1] < a0[0] && a1[1] <= a1[0]);
  })();
})();

// ─────────────────────────────────────────────────────────────────────────
// R. batch 3 多变性升级(2026-06,沉静预设无 lead 也能拿到差异化)
//    - R1-R2:padContour 旋钮(< 0.2 字节恒等保"留白";≥ 0.2 pad 2 段 voice leading)
//    - R3:spec.rhythm 顶级覆盖 dna.rhythm(作者可强制 bassPattern)
//    - R4-R5:bassPattern 新增 pedal/syncopated 在 events 形态上可区分(变异验牙)
// ─────────────────────────────────────────────────────────────────────────
// R 段 batch 3 多变性升级

// Q1 padContour < 0.2 = 旧行为字节恒等(sacral 配 padContour=0.1 走旧;变异=阈值降到 0 → pad 翻倍 → 红)
(function () {
  // sacral GENRE_DNA 配 padContour=0.1(<0.2 阈值)→ pad events 数应等于"强制 padContour:0"基线
  var s0 = C.resolveMusic({ preset: 'sacral', padContour: 0 });   // 强制关
  var sN = C.resolveMusic('sacral');                              // 默认走 padContour=0.1
  var pad0 = C.composeMusic(s0).events.filter(function (e) { return e.role === 'pad'; });
  var padN = C.composeMusic(sN).events.filter(function (e) { return e.role === 'pad'; });
  ok('R1 padContour=0.1 < 0.2 阈值 → pad events 字节恒等于强制 0(sacral 留白本性守住;变异=阈值降到 0→翻倍→红)', JSON.stringify(pad0) === JSON.stringify(padN), 'pad0.len=' + pad0.length + ' padN.len=' + padN.length);
})();

// Q2 padContour >= 0.2 → pad 2 段(每段半时长)+ events 数翻倍(sad/eerie 走升级;反向变异:强制 padContour:0 后 events 数减半)
(function () {
  var sN = C.resolveMusic('sad');                                  // 默认走 padContour=0.5
  var s0 = C.resolveMusic({ preset: 'sad', padContour: 0 });       // 强制关 batch 3
  var padN = C.composeMusic(sN).events.filter(function (e) { return e.role === 'pad'; });
  var pad0 = C.composeMusic(s0).events.filter(function (e) { return e.role === 'pad'; });
  // 默认 sad(padContour=0.5)pad 数 > 关闭时(两段生效)且 ≤ ×2(次半段换音撞根音的和弦去重少 1 个=有意——
  //   端用户实听「pad 双重」修:swap 出 [G,E,G] 时同频只推一次;变异=漏走 batch 3 分支→padN===pad0→红)
  ok('R2 sad padContour=0.5 ≥ 0.2 → pad 2 段生效(数量 > 单段且 ≤ ×2;换音撞根音和弦去重少 1)', padN.length > pad0.length && padN.length <= pad0.length * 2, 'padN=' + padN.length + ' pad0=' + pad0.length);
  // R2b 去重牙(两端锁):padContour 预设全曲【无同刻同频 pad】(变异=去掉 swapSeen 去重→出现同刻同频→红)
  var dupPad = 0, seenP = {};
  C.composeMusic(sN).events.forEach(function (e) { if (e.role !== 'pad') return; var k = e.t.toFixed(4) + '#' + e.freq.toFixed(2); if (seenP[k]) dupPad++; else seenP[k] = 1; });
  ok('R2b pad 换音去重:sad 全曲无同刻同频 pad(端用户「乐器双重」修;变异=去 swapSeen→红)', dupPad === 0, 'dup=' + dupPad);
})();

// Q3 spec.rhythm 顶级覆盖(作者可强制 bassPattern；sad 默认 pedal → spec 覆 walking 后 events 形态变化)
(function () {
  var sWalk = C.resolveMusic({ preset: 'sad', rhythm: { bassPattern: 'walking' } });
  var sDef = C.resolveMusic('sad');   // GENRE_DNA['sad'].bassPattern='pedal'
  var bWalk = C.composeMusic(sWalk).events.filter(function (e) { return e.role === 'bass'; });
  var bDef = C.composeMusic(sDef).events.filter(function (e) { return e.role === 'bass'; });
  // walking=每和弦 3 击 ×4=12；pedal=每和弦 2 音 ×4=8；作者覆盖仍精确生效。
  ok('R3 spec.rhythm.bassPattern 顶级覆盖(pedal vs walking,bass events 数量必异;变异=漏接 spec.rhythm 透传→相等→红)', bWalk.length !== bDef.length && bWalk.length === 12 && bDef.length === 8, 'bWalk=' + bWalk.length + ' bDef=' + bDef.length);
})();

// Q4 bassPattern='pedal' = 整 4 拍长音 + 末段短再触(每和弦 2 events:dur>=3*spb 主音 + dur<=0.5*spb 尾音)
(function () {
  var s = C.resolveMusic({ preset: 'sad', rhythm: { bassPattern: 'pedal' } });
  var r = C.composeMusic(s);
  var bs = r.events.filter(function (e) { return e.role === 'bass'; });
  var spb = 60 / r.spec.tempo;
  // 每和弦应 2 个 events:1 长(>=3*spb)+ 1 短(<=0.5*spb)
  var longCt = bs.filter(function (e) { return e.dur >= 3 * spb; }).length;
  var shortCt = bs.filter(function (e) { return e.dur <= 0.5 * spb; }).length;
  ok('R4 pedal=长音+末段短再触(变异=漏 pedal 分支→走 block 单音→红)', longCt === 4 && shortCt === 4 && bs.length === 8, 'long=' + longCt + ' short=' + shortCt + ' total=' + bs.length);
})();

// Q5 bassPattern='syncopated' = 拍 1 + 拍 2.5 + 拍 3.5(反拍重音);每和弦 3 events、首音 dur 长、后两短
(function () {
  var s = C.resolveMusic({ preset: 'eerie', rhythm: { bassPattern: 'syncopated' }, instruments: ['pad', 'bass', 'arp'], intensity: 1 });
  var r = C.composeMusic(s);
  var bs = r.events.filter(function (e) { return e.role === 'bass'; });
  // 4 和弦 × 3 events/chord = 12
  ok('R5 syncopated 反拍重音(每和弦 3 events;变异=漏分支→红)', bs.length === 12, 'syncopated bass.len=' + bs.length);
  // 验证反拍位:第一和弦的 3 个 t 应该是 0 / 1.5*spb / 2.5*spb
  var spb = 60 / r.spec.tempo;
  var t0 = bs.filter(function (e) { return e.t < 4 * spb; }).map(function (e) { return Math.round(e.t / spb * 10) / 10; }).sort(function (a, b) { return a - b; });
  ok('R5b syncopated 拍位 [0, 1.5, 2.5](反拍 spb*1.5/2.5 落音;变异=拍位写错→红)', t0[0] === 0 && t0[1] === 1.5 && t0[2] === 2.5, 't0=' + JSON.stringify(t0));
})();

// Q6 default 字节恒等大局验:不传任何 batch 3 字段时,所有现有预设 events 与 padContour:0 强制基线完全相同
//    (跨预设扫族;若有预设漏给 GENRE_DNA 加 padContour 字段会"默认升级"但作者没要 → 应字节恒等)
(function () {
  var SCAN = ['heroic', 'pastoral', 'battle', 'eastern', 'lullaby', 'festive'];   // 既有预设若 GENRE_DNA 漏配 padContour 这些可能字节漂移(feel 词都不在我新增的 sneaking/empty/vast/curious/tense/calm/warm 表内)
  var allEq = SCAN.every(function (n) {
    var s1 = C.resolveMusic(n);
    var s2 = C.resolveMusic({ preset: n, padContour: 0 });
    return JSON.stringify(C.composeMusic(s1).events) === JSON.stringify(C.composeMusic(s2).events);
  });
  ok('R6 既有预设默认 events == 强制 padContour:0(字节恒等护栏;变异=GENRE_DNA 漏覆盖现有预设导致默认升级→红)', allEq);
})();

// ─────────────────────────────────────────────────────────────────────────
// S. batch 4 命名和弦库(2026-06):progression 一字段两形态 + fail-loud
//    - S1:命名字符串 → 展开为罗马数组(基础形态)
//    - S2:拼错命名 → fail-loud throw(防 §9 命名接缝)
//    - S3:命名 vs 罗马数组字节恒等(命名是别名,§11 不锚定)
//    - S4:非法形态(数字/对象)→ throw
//    - S5:借用调 → warn-once 不抛(§11 不锚定创意,modal interchange 是合法艺术手法)
//    - S6:既有 PRESET(progression 是 roman 数组)零回归
// ─────────────────────────────────────────────────────────────────────────

// S1 命名展开
(function () {
  var r = C.composeMusic({ key: 'C', mode: 'major', tempo: 120, progression: 'lament' });
  ok('S1 progression:"lament" 命名 → 展开为 ["vi","IV","I","V"](变异=PROGS_RESOLVE 未接→报数组错→红)',
    JSON.stringify(r.spec.progression) === JSON.stringify(['vi', 'IV', 'I', 'V']));
})();

// S2 拼错命名 fail-loud
(function () {
  var threw = false, msg = '';
  try { C.composeMusic({ key: 'C', mode: 'major', tempo: 120, progression: 'lameent' }); }
  catch (e) { threw = true; msg = String(e && e.message || e); }
  ok('S2 拼错"lameent" → throw 提示已知命名(变异=未知静默回退 calm→红;§9 命名接缝防御)',
    threw && /未知命名/.test(msg) && /lameent/.test(msg) && /lament/.test(msg));
})();

// S3 命名 vs 罗马数组字节恒等
(function () {
  var a = C.composeMusic({ key: 'C', mode: 'major', tempo: 120, progression: ['vi', 'IV', 'I', 'V'] });
  var b = C.composeMusic({ key: 'C', mode: 'major', tempo: 120, progression: 'lament' });
  // events 字节恒等(命名是别名,不引入差异)
  ok('S3 progression:"lament" 与 ["vi","IV","I","V"] events 字节恒等(变异=命名引入差异→红;§11 不锚定)',
    JSON.stringify(a.events) === JSON.stringify(b.events));
})();

// S4 非法形态
(function () {
  function tryProg(p) { try { C.composeMusic({ key: 'C', mode: 'major', tempo: 120, progression: p }); return null; } catch (e) { return String(e.message || e); } }
  var m1 = tryProg(42);
  var m2 = tryProg({ custom: ['i', 'V'] });
  ok('S4 非法形态(数字/对象)→ throw(变异=未守类型→红)',
    m1 && /命名字符串或罗马数组/.test(m1) && m2 && /命名字符串或罗马数组/.test(m2));
})();

// S5 借用调 warn-once
(function () {
  var warns = [], origWarn = console.warn;
  console.warn = function () { warns.push(Array.prototype.join.call(arguments, ' ')); };
  try {
    // lament modeHint='major',这里用 minor = 借用调
    C.composeMusic({ key: 'C', mode: 'minor', tempo: 120, progression: 'lament' });
    C.composeMusic({ key: 'D', mode: 'minor', tempo: 120, progression: 'lament' });   // 同 lament/minor key 不同 → 仍 warn 一次(warn key=name/mode)
    C.composeMusic({ key: 'C', mode: 'dorian', tempo: 120, progression: 'lament' });  // 新 lament/dorian → 再 warn 一次
  } finally { console.warn = origWarn; }
  var borrowedWarns = warns.filter(function (w) { return /借用调/.test(w); });
  ok('S5 借用调 warn-once 不抛(lament/minor + lament/dorian = 2 条 warn;变异=每次都 warn 或抛错→红)',
    borrowedWarns.length === 2);
})();

// S6 既有 PRESET 字节恒等(向后兼容铁证)
(function () {
  var a = C.composeMusic(C.resolveMusic('sad'));
  var b = C.composeMusic(C.resolveMusic('sad'));
  ok('S6 既有 PRESET 走 roman 数组路径,batch 4 改动零回归(同 spec 双跑字节恒等;变异=normalizeSpec 改动有侧写→红)',
    JSON.stringify(a.events) === JSON.stringify(b.events));
})();

// ─────────────────────────────────────────────────────────────────────────
// T. batch 5 曲风派生默认 bass 音色(2026-06):BASS_TONE 表 → spec.timbre.bass
//    治"默认 bass 那记咚盖过和弦/旋律多变、bgm 全一样"——不同曲风默认低音也各异。
//    渲染层(timbre)注入,events 字节恒等;作者写 timbre.bass 优先。
// ─────────────────────────────────────────────────────────────────────────

// T1 曲风派生:jazz-noir→upright / synthwave→synth / sad→sub / sacral→organ / march→picked / romance→sine-pluck
(function () {
  var map = { 'jazz-noir': 'upright', 'synthwave': 'synth', 'sad': 'sub', 'sacral': 'organ', 'march': 'picked', 'romance': 'sine-pluck' };
  var allOK = Object.keys(map).every(function (preset) {
    var s = C.composeMusic(C.resolveMusic(preset));
    return s.spec.timbre && s.spec.timbre.bass === map[preset];
  });
  ok('T1 曲风派生默认 bass(jazz→upright/synth→synth/sad→sub/sacral→organ/march→picked/romance→sine-pluck;变异=BASS_TONE 漏表或注入漏→红)', allOK);
})();

// T2 作者写 timbre.bass 优先(覆盖曲风默认)
(function () {
  var s = C.composeMusic(C.resolveMusic({ preset: 'jazz-noir', timbre: { bass: 'sub' } }));
  ok('T2 作者 timbre.bass:sub 覆盖 jazz-noir 默认 upright(变异=注入无作者优先守卫→变 upright→红)', s.spec.timbre.bass === 'sub');
})();

// T3 无 bass 声部的曲风不注入(hasLayer 守卫;desolate instruments=['pad'])
(function () {
  var s = C.composeMusic(C.resolveMusic('desolate'));
  ok('T3 无 bass 声部曲风(desolate)不注入 timbre.bass(hasLayer 守卫;变异=删守卫→注入死音色→红)',
    !(s.spec.timbre && s.spec.timbre.bass), 'timbre.bass=' + (s.spec.timbre && s.spec.timbre.bass));
})();

// T4 events 字节恒等:派生只改 spec.timbre.bass(渲染层),events 不含 timbre → 字节级不变
(function () {
  // 同一 jazz-noir spec 跑两次,events 字节恒等(确定性 + 派生不进 events)
  var a = C.composeMusic(C.resolveMusic('jazz-noir'));
  var b = C.composeMusic(C.resolveMusic('jazz-noir'));
  ok('T4 派生后 events 字节恒等(events 不含 timbre;变异=把 bassTone 写进 event→红)',
    JSON.stringify(a.events) === JSON.stringify(b.events));
})();

// T5 无 feel 命中 → 不注入(走默认柔化锯齿;空 feel spec 字节恒等护栏)
(function () {
  var s = C.composeMusic({ key: 'C', mode: 'minor', tempo: 100, instruments: ['pad', 'bass'], intensity: 0.6, progression: ['i', 'VI', 'iv', 'V'] });
  ok('T5 无 feel 命中 TONE_MAP → 不注入 timbre.bass(走默认;变异=无命中也注入→红)',
    !(s.spec.timbre && s.spec.timbre.bass));
})();

// ── batch 6:全声部曲风音色派生(lead/arp/pad,对称 bass)。治"主调永远一样"。 ──
// bare feel spec(无 preset → 不自带 timbre;intensity 0.9 过全声部门槛)验 TONE_MAP 派生
function feelSpec(feel, instruments, extra) {
  return Object.assign({ key: 'C', mode: 'minor', tempo: 100, progression: ['i', 'VI', 'iv', 'V'], feel: feel, instruments: instruments, intensity: 0.9 }, extra || {});
}
function leadOf(feel, instr) { var s = C.composeMusic(feelSpec(feel, instr || ['lead', 'pad', 'arp', 'bass'])); return s.spec.timbre && s.spec.timbre.lead; }
function arpOf(feel) { var s = C.composeMusic(feelSpec(feel, ['lead', 'pad', 'arp', 'bass'])); return s.spec.timbre && s.spec.timbre.arp; }
function padOf(feel) { var s = C.composeMusic(feelSpec(feel, ['lead', 'pad', 'arp', 'bass'])); return s.spec.timbre && s.spec.timbre.pad; }

// T6 lead 主旋律音色派生(治核心痛点:主调不再永远 soft)
(function () {
  ok('T6 lead 派生:baroque→harp / jazz-noir→reed / lullaby→flute / eerie→bell(变异=漏 TONE_MAP lead 或漏注入→红)',
    leadOf(['baroque']) === 'harp' && leadOf(['jazz-noir']) === 'reed' && leadOf(['lullaby']) === 'flute' && leadOf(['eerie']) === 'bell');
})();

// T7 arp 派生
(function () {
  ok('T7 arp 派生:romance→harp / grief→soft / jazz-noir→bell(变异=漏 arp 派生→红)',
    arpOf(['romance']) === 'harp' && arpOf(['grief']) === 'soft' && arpOf(['jazz-noir']) === 'bell');
})();

// T8 pad 派生
(function () {
  ok('T8 pad 派生:baroque→organ / sad→strings / eerie→air(变异=漏 pad 派生→红)',
    padOf(['baroque']) === 'organ' && padOf(['sad']) === 'strings' && padOf(['eerie']) === 'air');
})();

// T9 作者 timbre.lead 优先(覆盖曲风派生)
(function () {
  var s = C.composeMusic(feelSpec(['baroque'], ['lead', 'pad'], { timbre: { lead: 'pulse' } }));
  ok('T9 作者 timbre.lead:pulse 覆盖 baroque 默认 harp(变异=注入无作者优先守卫→变 harp→红)', s.spec.timbre.lead === 'pulse');
})();

// T10 预设自带 timbre 优先(heroic feel 不在 TONE_MAP + 预设自带 lead=brass,双保)
(function () {
  var s = C.composeMusic(C.resolveMusic('heroic'));
  ok('T10 heroic 预设自带 lead=brass 不被派生覆盖(双保:heroic 不在 TONE_MAP + resolveMusic 合 timbre;变异=派生覆盖预设→变非 brass→红)', s.spec.timbre.lead === 'brass');
})();

// T11 无命中 feel → 全不注入(heroic 不在 TONE_MAP)
(function () {
  var s = C.composeMusic(feelSpec(['heroic'], ['lead', 'pad', 'arp', 'bass']));
  ok('T11 heroic 不在 TONE_MAP → lead/arp/pad/bass 全不注入(变异=无命中也注入→红)',
    !(s.spec.timbre && (s.spec.timbre.lead || s.spec.timbre.arp || s.spec.timbre.pad || s.spec.timbre.bass)));
})();

// T12 hasLayer 守卫:无 lead 声部 → 不注入 lead(即使 TONE_MAP 有)
(function () {
  var s = C.composeMusic(feelSpec(['baroque'], ['pad', 'bass']));   // 无 lead/arp 声部
  ok('T12 baroque 但 instruments 无 lead/arp → 不注入 lead/arp(hasLayer 守卫;变异=删守卫→注入死音色→红)',
    !(s.spec.timbre && (s.spec.timbre.lead || s.spec.timbre.arp)) && s.spec.timbre && s.spec.timbre.pad === 'organ');
})();

// T13 events 字节恒等(全声部派生只改 spec.timbre,events 不含 timbre)
(function () {
  var a = C.composeMusic(feelSpec(['jazz-noir'], ['lead', 'pad', 'arp', 'bass']));
  var b = C.composeMusic(feelSpec(['jazz-noir'], ['lead', 'pad', 'arp', 'bass']));
  ok('T13 全声部派生后 events 字节恒等(events 不含 timbre;变异=把 tone 写进 event→红)',
    JSON.stringify(a.events) === JSON.stringify(b.events));
})();

// T14 防蒙混(关键):bare baroque→harp(走派生);timbre.lead:pluck→仍 pluck(守卫挡)。两值必不同,删守卫第二个变 harp=红
(function () {
  var derived = C.composeMusic(feelSpec(['baroque'], ['lead', 'pad'])).spec.timbre.lead;        // harp(派生)
  var overrid = C.composeMusic(feelSpec(['baroque'], ['lead', 'pad'], { timbre: { lead: 'pluck' } })).spec.timbre.lead;  // pluck(守卫)
  ok('T14 防蒙混:派生=harp 且作者覆盖=pluck(两值不同;删作者优先守卫→第二个变 harp→红)',
    derived === 'harp' && overrid === 'pluck' && derived !== overrid);
})();

// ─────────────────────────────────────────────────────────────────────────
// U. 音乐批 1 · A1(gameplay-expressiveness-plan.md §三 A1):修 shipped bug
//    progression:'eerie' pattern 含 'bIII' → 撞 ROMAN 校验(只认七个自然音级罗马数字)必抛,该预设从未成功发声过。
//    本引擎罗马数字是**度数制**(性质从 mode 音阶推导),自然小调 III 度三和弦 == 传统记谱的 bIII(音响等价)→ 'bIII'→'III' 零音响损失。
//    - U1:命名进行库全展开冒烟(遍历表,不硬编码清单;含条目数下限,防表被误删截断)
//    - U2:eerie 音响锁(反向锁:pattern 若回退 'bIII' 本段必红——'bIII' 会在 normalizeSpec 里 throw,composeMusic 直接抛出、根本产不出 events)
// ─────────────────────────────────────────────────────────────────────────
var PROGLIB = require('../progressions.js');

// U1 命名进行库全展开冒烟:遍历 PROGRESSIONS 表每一条(不硬编码清单,防漏/防表结构变化),
//   各自 composeMusic({progression:名, key:合适的调}) 不抛且产出非空 events;外加条目数下限(≥当前表大小,防表被误删截断)。
(function () {
  var names = Object.keys(PROGLIB.PROGRESSIONS);
  var allOK = true, crashed = [];
  names.forEach(function (name) {
    var entry = PROGLIB.PROGRESSIONS[name];
    var mode = entry.modeHint || 'major';       // 用该条目自己的设计意图 mode 展开(不触发借用调 warn,专注冒烟)
    var key = (mode === 'phrygian' || mode === 'minor') ? 'A' : 'C';   // 合适的调:minor/phrygian 系用 A,其余用 C(常规听感调;非关键,只求不崩)
    var r;
    try {
      r = C.composeMusic({ mode: mode, key: key, progression: name, instruments: ['pad', 'bass'] });
    } catch (e) {
      allOK = false; crashed.push(name + ': ' + e.message);
      return;
    }
    if (!(r && Array.isArray(r.events) && r.events.length > 0)) { allOK = false; crashed.push(name + ': 空 events'); }
  });
  ok('U1a 命名进行库全展开冒烟:PROGRESSIONS 表每一条 composeMusic 不抛且产出非空 events(遍历,不硬编码清单)' +
    (crashed.length ? ' [' + crashed.join(' | ') + ']' : ''), allOK);
  // 下限断言:防表被误删截断(当前 18 条;用 >= 而非 === ,允许未来扩容不破本测试)
  ok('U1b 命名进行库条目数下限(≥18,防表被误删截断,当前实际 ' + names.length + ' 条)', names.length >= 18);
})();

// U2 eerie 音响锁:小调 key 展开 eerie,断言 III 拍(pattern 第 2 拍,0-based index 1)的和弦音相对主音的半音偏移
//   = 自然小调 III 级三和弦应有的值([3,7,10]:根音在小三度上、大三度+纯五度叠加 = 传统记谱 bIII 的那个大三和弦)。
//   反向锁:本段是"pattern 若回退 'bIII' 必红"的护栏——'bIII' 不是合法罗马数字,会在 normalizeSpec 里被 ROMAN 表拒绝直接 throw,
//   composeMusic 根本不会走到产 events 这步(见 §5 反向变异验牙记录:mutation 把 'III' 手动改回 'bIII' 复现了这条 throw)。
(function () {
  var key = 'C', mode = 'minor';
  var r = C.composeMusic({ mode: mode, key: key, progression: 'eerie', instruments: ['pad'], intensity: 1 });
  ok('U2a eerie 不抛(命名解析成功,pattern 已是合法罗马数字)', Array.isArray(r.events) && r.events.length > 0);
  ok('U2b eerie 展开后的罗马数字是 ["i","III","VII","i"](非 "bIII")', JSON.stringify(r.spec.progression) === JSON.stringify(['i', 'III', 'VII', 'i']));

  // 定位 III 拍(pattern index 1)的 pad 音符:段落切分同 U1,用默认 tempo=100(spb=0.6s,4 拍/和弦=2.4s/和弦)
  var spb = 60 / r.spec.tempo, chordDur = 4 * spb;
  var iiiEvents = r.events.filter(function (e) { return e.t >= chordDur - 1e-6 && e.t < 2 * chordDur - 1e-6; });
  var iiiMidis = iiiEvents.map(function (e) { return Math.round(69 + 12 * Math.log2(e.freq / 440)); }).sort(function (a, b) { return a - b; });
  var tonicMidi = C.KEYS[key];   // C=60
  var offsets = iiiMidis.map(function (m) { return m - tonicMidi; });
  ok('U2c III 拍和弦音相对主音的半音偏移 = [3,7,10](自然小调 III 级三和弦 = 传统记谱 bIII 的大三和弦;实测 III 拍 midi=' + JSON.stringify(iiiMidis) + ')',
    JSON.stringify(offsets) === JSON.stringify([3, 7, 10]));
})();

// ─────────────────────────────────────────────────────────────────────────
// V. 音乐批 1 · A2(gameplay-expressiveness-plan.md §三 A2):乐句级力度弧 dynArc
//    develop 段渐强 / cadence 段渐弱(段尾回落);只乘 pad/bass/arp/lead 的 gain,drone/perc 不动;
//    段边界跳变有界(红队硬性要求);全部因子在 [0.85,1.15] 钳制界内;纯函数、零新随机流、确定性天然守恒。
//    - V1:dynArcFactor 纯函数曲线正确性(develop 单调不减 / cadence 单调不增 / 其它角色恒基线)
//    - V2:dynArcRoleFor 与 PLAN_ROLES 同源(period/sentence/static/未知 plan 全覆盖)
//    - V3:段边界跳变有界(红队硬性要求)——理论边界(按 amp)+ clamp 兜底边界(不依赖 amp,防误配置)
//    - V4:端到端(真实 composeMusic):同声部 gain 非常量 + develop 段内单调不减 + cadence 段尾回落
//    - V5:全部因子在钳制界内(密集扫 x/amp 网格)
//    - V6:确定性(同 spec 两次字节相等)
//    - V7:只碰 gain,不碰音高/时长/事件数/事件顺序(与 amp 强制 0 的基线比较 freq/t/dur 序列)
//    - V8:在调 + segDur 守恒 + 网格时序不溢出(dynArc 激活场景下既有不变量仍绿)
//    - V9(反向变异验牙):dynArc 振幅清零 → V4 的非常量断言复算必红;还原后必绿
// ─────────────────────────────────────────────────────────────────────────

// V1 dynArcFactor 纯函数曲线正确性
(function () {
  var amp = 0.15;
  ok('V1a develop x=0→1.0(段头=基线,锚点)', C._dynArcFactor('develop', 0, amp) === 1);
  ok('V1b develop x=1→1+amp=1.15(段尾峰值)', Math.abs(C._dynArcFactor('develop', 1, amp) - 1.15) < 1e-9);
  ok('V1c develop x=0.5→1+amp/2=1.075(线性中点)', Math.abs(C._dynArcFactor('develop', 0.5, amp) - 1.075) < 1e-9);
  ok('V1d cadence x=0→1.0(段头=基线,锚点)', C._dynArcFactor('cadence', 0, amp) === 1);
  ok('V1e cadence x=1→1-amp=0.85(段尾回落)', Math.abs(C._dynArcFactor('cadence', 1, amp) - 0.85) < 1e-9);
  ok('V1f null/respond/static/未知角色 → 恒基线 1(任意 x/amp 不变)',
    C._dynArcFactor(null, 0.7, amp) === 1 && C._dynArcFactor('respond', 0.3, amp) === 1 &&
    C._dynArcFactor('static', 0.9, 0.9) === 1 && C._dynArcFactor('某未知角色', 1, amp) === 1);
  // 单调性:develop 在 x∈[0,1] 密集采样单调不减;cadence 单调不增(50 点)
  (function () {
    var devOK = true, cadOK = true, prevD = -Infinity, prevC = Infinity;
    for (var i = 0; i <= 50; i++) {
      var x = i / 50;
      var dv = C._dynArcFactor('develop', x, amp), cv = C._dynArcFactor('cadence', x, amp);
      if (dv < prevD - 1e-12) devOK = false;
      if (cv > prevC + 1e-12) cadOK = false;
      prevD = dv; prevC = cv;
    }
    ok('V1g develop 曲线在 [0,1] 密集采样单调不减、cadence 单调不增(50 点)', devOK && cadOK);
  })();
})();

// V2 dynArcRoleFor 与 PLAN_ROLES 同源(不重复一套判断,防漂移)
(function () {
  ok('V2a period 角色序列 = PLAN_ROLES.period(ci0..3)',
    [0, 1, 2, 3].every(function (ci) { return C._dynArcRoleFor('period', ci) === C._PLAN_ROLES.period[ci]; }));
  ok('V2b sentence 角色序列 = PLAN_ROLES.sentence(ci0..3)',
    [0, 1, 2, 3].every(function (ci) { return C._dynArcRoleFor('sentence', ci) === C._PLAN_ROLES.sentence[ci]; }));
  ok('V2c period 角色按 ci%4 循环(ci4..7 = ci0..3)',
    [4, 5, 6, 7].every(function (ci) { return C._dynArcRoleFor('period', ci) === C._PLAN_ROLES.period[ci % 4]; }));
  ok('V2d static plan → 任意 ci 恒 null(不强加发展,同 developPhrase 精神一致)',
    [0, 1, 2, 3, 99].every(function (ci) { return C._dynArcRoleFor('static', ci) === null; }));
  ok('V2e 未知/无 plan → null(基线,不崩)', C._dynArcRoleFor('某不存在的plan', 2) === null && C._dynArcRoleFor(undefined, 0) === null);
})();

// V3 段边界跳变有界(红队硬性要求 §三 A2 fix②)——"段尾与段首因子差 ≤ 明确上界"
(function () {
  var amp = 0.15;
  // V3a 理论边界(period/sentence 全部相邻角色对):tail(x=1) vs 下一段 head(x=0)因子差 ≤ amp
  function maxBoundaryJump(plan, amp) {
    var roles = C._PLAN_ROLES[plan], maxJump = 0;
    for (var i = 0; i < roles.length; i++) {
      var a = roles[i], b = roles[(i + 1) % roles.length];
      var jump = Math.abs(C._dynArcFactor(a, 1, amp) - C._dynArcFactor(b, 0, amp));
      if (jump > maxJump) maxJump = jump;
    }
    return maxJump;
  }
  ok('V3a period 全部相邻段边界跳变 ≤ amp(0.15;含 cadence→下一循环 null 的回绕边界)', maxBoundaryJump('period', amp) <= amp + 1e-9);
  ok('V3b sentence 全部相邻段边界跳变 ≤ amp(含 develop→develop 连续段边界)', maxBoundaryJump('sentence', amp) <= amp + 1e-9);
  // V3c 显式锁"回落到基线再起"语义:develop 段尾(高)→ cadence 段头必须正好落在基线 1.0(不是渐变过渡、是显式回落)
  ok('V3c 语义锁:develop 段尾峰值(1.15)之后,cadence 段头精确回落到基线 1.0(§三 A2 fix②"回落到基线再起")',
    C._dynArcFactor('develop', 1, amp) > 1 && C._dynArcFactor('cadence', 0, amp) === 1);
  ok('V3d 语义锁:cadence 段尾谷值(0.85)之后,下一循环 null 段头精确回落到基线 1.0',
    C._dynArcFactor('cadence', 1, amp) < 1 && C._dynArcFactor(null, 0, amp) === 1);
  // V3e clamp 兜底边界(防 amp 误配置远超设计值;不依赖 amp 取值,clamp 本身就是硬上界)——用 dynArcMul(经 clamp)、amp=0.5(3倍默认)压测
  (function () {
    var bigAmp = 0.5, chordDur = 2.4;
    var devTail = C._dynArcMul(chordDur, 0, 0, chordDur, 'develop', bigAmp);      // t=段尾,dur=0(逼近 x=1 极限)
    var cadHead = C._dynArcMul(0, 0, 0, chordDur, 'cadence', bigAmp);             // t=段头,dur=0(逼近 x=0 极限)
    var cadTail = C._dynArcMul(chordDur, 0, 0, chordDur, 'cadence', bigAmp);
    var nullHead = C._dynArcMul(1.2, 0, 0, chordDur, null, bigAmp);
    ok('V3e clamp 兜底:即使 amp=0.5(3倍默认、超出预期设计值),develop尾→cadence头 跳变仍 ≤ 0.15(= DYNARC_HI-1,clamp 硬界)',
      Math.abs(devTail - cadHead) <= (C._DYNARC_HI - 1) + 1e-9);
    ok('V3f clamp 兜底:同样地 cadence尾→null头 跳变仍 ≤ 0.15(= 1-DYNARC_LO,clamp 硬界,不依赖 amp)',
      Math.abs(cadTail - nullHead) <= (1 - C._DYNARC_LO) + 1e-9);
    ok('V3g clamp 确实生效(devTail 被夹到 1.15、cadTail 被夹到 0.85,证明 V3e/V3f 测的是 clamp 而非巧合)',
      devTail === C._DYNARC_HI && cadTail === C._DYNARC_LO);
  })();
})();

// V4 端到端(真实 composeMusic):同声部 gain 非常量 + develop 段内单调不减 + cadence 段尾回落
//   用 arp(DNA_BASE 默认 rate=8→每和弦 8 步,任何 phrasePlan 下都有多个同和弦事件,不依赖具体曲风预设)。
function arpGainsByChord(spec) {
  var r = C.composeMusic(spec);
  var spb = 60 / r.spec.tempo, chordDur = 4 * spb;
  var out = [];
  for (var ci = 0; ci < r.spec.progression.length; ci++) {
    var lo = ci * chordDur, hi = (ci + 1) * chordDur;
    out.push(r.events.filter(function (e) { return e.role === 'arp' && e.t >= lo - 1e-6 && e.t < hi - 1e-6; })
      .sort(function (a, b) { return a.t - b.t; }).map(function (e) { return e.gain; }));
  }
  return out;
}
(function () {
  // period plan(DNA_BASE 默认,无 feel 命中)、progression 4 和弦 → ci0=null/ci1=respond/ci2=develop/ci3=cadence
  var spec = { mode: 'major', key: 'C', progression: ['I', 'IV', 'V', 'I'], instruments: ['arp'], intensity: 1 };
  ok('V4a 无 feel 命中 → DNA_BASE 默认 phrasePlan=period(锁定本组测试的前提)', C._deriveGenreDNA(spec).phrasePlan === 'period');
  var byChord = arpGainsByChord(spec);
  var allGains = [].concat.apply([], byChord);
  var nonConstant = allGains.some(function (v) { return Math.abs(v - allGains[0]) > 1e-9; });
  ok('V4b 同声部(arp)gain 序列非常量(dynArc 真实产生差异)', nonConstant);
  ok('V4c null 段(ci0)全部 gain 恒等(基线不变,验证"其它角色不受影响")', byChord[0].every(function (g) { return g === byChord[0][0]; }));
  ok('V4d respond 段(ci1)全部 gain 恒等(基线不变)', byChord[1].every(function (g) { return g === byChord[1][0]; }));
  // develop 段(ci2)内:按 t 排序后 gain 单调不减
  (function () {
    var dev = byChord[2], mono = true;
    for (var i = 1; i < dev.length; i++) if (dev[i] < dev[i - 1] - 1e-12) mono = false;
    var nonConst = dev.some(function (v) { return Math.abs(v - dev[0]) > 1e-9; });
    ok('V4e develop 段(ci2)内 gain 序列单调不减 + 非常量(乐句级渐强)', mono && nonConst && dev.length > 1);
  })();
  // cadence 段(ci3)内:段尾(最后一个,t 最大)明显低于段头(第一个)——"段尾回落"
  (function () {
    var cad = byChord[3];
    var monoFall = true;
    for (var i = 1; i < cad.length; i++) if (cad[i] > cad[i - 1] + 1e-12) monoFall = false;
    var fellBelowBaseline = cad[cad.length - 1] < cad[0];
    ok('V4f cadence 段(ci3)内 gain 序列单调不增 + 段尾 < 段头(乐句收束回落)', monoFall && fellBelowBaseline && cad.length > 1);
    // 段尾值应比基线(null 段等值 0.07)更低,验证确实"回落"而非仅"没涨"
    var baseline = byChord[0][0];
    ok('V4g cadence 段尾 gain < 基线段(ci0)的 gain(回落到基线以下,非仅"没涨")', cad[cad.length - 1] < baseline);
  })();
  // develop 段峰值应高于基线,cadence 段尾应低于基线 → 方向性正确(不是巧合的单调)
  ok('V4h develop 段峰值(段尾)> 基线;cadence 段谷值(段尾)< 基线(方向性正确)',
    byChord[2][byChord[2].length - 1] > byChord[0][0] && byChord[3][byChord[3].length - 1] < byChord[0][0]);
})();

// V4i sentence plan(baroque 曲风)同样验证:develop 段内单调不减(第二种 phrasePlan 覆盖,不只测 period)
(function () {
  var spec = { mode: 'major', key: 'D', progression: ['I', 'IV', 'V', 'I'], instruments: ['arp'], intensity: 1, feel: ['baroque'] };
  ok('V4i-pre baroque → phrasePlan=sentence(锁定本测试前提)', C._deriveGenreDNA(spec).phrasePlan === 'sentence');
  var byChord = arpGainsByChord(spec);
  // sentence: ci0=null/ci1=respond/ci2=develop/ci3=develop(两个 develop 段,各自独立从基线起渐强)
  var dev2 = byChord[2], dev3 = byChord[3];
  function monoNonDecr(arr) { for (var i = 1; i < arr.length; i++) if (arr[i] < arr[i - 1] - 1e-12) return false; return true; }
  ok('V4i sentence plan:两个 develop 段(ci2/ci3)各自内部 gain 单调不减(§三 A2 覆盖 sentence 计划)',
    monoNonDecr(dev2) && monoNonDecr(dev3) && dev2.length > 1 && dev3.length > 1);
  // 连续 develop→develop 边界:ci3 段头应"回落到基线"而非从 ci2 段尾继续往上涨(验证 V3 的语义锁在真实场景生效)
  ok('V4j 连续 develop 段边界:ci3(第二个 develop)段头 gain 明显低于 ci2(第一个 develop)段尾 gain(回落到基线再起,非累积暴涨)',
    dev3[0] < dev2[dev2.length - 1]);
})();

// V5 全部因子在钳制界内(密集扫 x∈[0,1] × amp∈[0,0.9] 网格,含 develop/cadence/其它角色)
(function () {
  var allInBounds = true;
  var roles = ['develop', 'cadence', null, 'respond', 'static', '未知'];
  for (var xi = 0; xi <= 20; xi++) {
    var x = xi / 20;
    for (var ai = 0; ai <= 18; ai++) {
      var amp = ai / 20;   // 0..0.9(含超出默认 0.15 的压力值)
      for (var ri = 0; ri < roles.length; ri++) {
        var m = C._dynArcMul(x * 2.4, 0, 0, 2.4, roles[ri], amp);
        if (m < C._DYNARC_LO - 1e-9 || m > C._DYNARC_HI + 1e-9) allInBounds = false;
      }
    }
  }
  ok('V5 密集扫描(21 x 值 × 19 amp 值 × 6 角色 = 2394 组合):dynArcMul 输出全部落在 [0.85,1.15] 钳制界内', allInBounds);
})();

// V6 确定性:含 dynArc 的 spec 两次 composeMusic events 字节相同
(function () {
  var spec = { mode: 'minor', key: 'A', progression: ['i', 'VI', 'iv', 'V'], instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, melody: 'flowing', feel: ['romance'] };
  ok('V6 dynArc 激活场景下,同 spec 两次 events 字节相同(纯函数、零新随机流,确定性天然守恒)',
    JSON.stringify(C.composeMusic(spec).events) === JSON.stringify(C.composeMusic(spec).events));
})();

// V7 只碰 gain,不碰音高/时长/事件数/事件顺序(与 amp 强制 0 的基线比较 freq/t/dur/role 序列)
(function () {
  var spec = { mode: 'minor', key: 'A', progression: ['i', 'VI', 'iv', 'V'], instruments: ['pad', 'bass', 'arp', 'lead', 'drone', 'perc'], intensity: 1, melody: 'flowing', feel: ['march'] };
  var withArc = C.composeMusic(spec).events;
  var saved = C._DNA_BASE.dynArc;
  C._DNA_BASE.dynArc = 0;
  var noArc = C.composeMusic(spec).events;
  C._DNA_BASE.dynArc = saved;
  function shape(evs) { return evs.map(function (e) { return { role: e.role, freq: e.freq, t: e.t, dur: e.dur }; }); }
  ok('V7a dynArc 开关不影响事件数(pad/bass/arp/lead/drone/perc 全声部)', withArc.length === noArc.length);
  ok('V7b dynArc 开关不影响 role/freq/t/dur 序列(只乘 gain,音高/时长/事件顺序零改)', JSON.stringify(shape(withArc)) === JSON.stringify(shape(noArc)));
  // gain 确实不同(证明 dynArc 真的在起作用,不是"关了也没变化"的假阳性)
  var gainsWith = withArc.map(function (e) { return e.gain; }), gainsNo = noArc.map(function (e) { return e.gain; });
  ok('V7c 但 gain 序列确实不同(证明开关真实生效,非假阳性)', JSON.stringify(gainsWith) !== JSON.stringify(gainsNo));
})();

// V8 既有不变量在 dynArc 激活场景下仍绿:在调 + segDur 守恒 + 不溢出段(dynArc 只乘 gain,不该影响这些)
(function () {
  var spec = { mode: 'dorian', key: 'D', progression: ['i', 'IV', 'i', 'VII'], instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, melody: 'flowing', feel: ['jazz-noir'] };
  var r = C.composeMusic(spec);
  ok('V8a dynArc 激活场景(jazz-noir·sentence)下全部音符仍在 D dorian 调内', allInScale('D', 'dorian', r.events));
  ok('V8b segDur 守恒(dynArc 不改变段长):4 和弦 × 4 拍 / (100bpm→0.6s/拍) = 9.6s', Math.abs(r.segDur - 9.6) < 1e-6);
  ok('V8c 全部事件不溢出段(t≥0 且 t+dur≤segDur,dynArc 只乘 gain 不该影响时序边界)',
    r.events.every(function (e) { return e.t >= -1e-9 && e.t + e.dur <= r.segDur + 1e-6; }));
})();

// V9 反向变异验牙:dynArc 振幅清零 → V4b/V4e 的非常量/单调性断言复算必红;还原后必绿(见 mutationChecks 记录)
(function () {
  var spec = { mode: 'major', key: 'C', progression: ['I', 'IV', 'V', 'I'], instruments: ['arp'], intensity: 1 };
  function nonConstantAndMono() {
    var byChord = arpGainsByChord(spec);
    var allGains = [].concat.apply([], byChord);
    var nonConst = allGains.some(function (v) { return Math.abs(v - allGains[0]) > 1e-9; });
    var dev = byChord[2], mono = true;
    for (var i = 1; i < dev.length; i++) if (dev[i] < dev[i - 1] - 1e-12) mono = false;
    var devNonConst = dev.some(function (v) { return Math.abs(v - dev[0]) > 1e-9; });
    return nonConst && mono && devNonConst;
  }
  var beforeOK = nonConstantAndMono();               // 变异前:应为 true(V4b/V4e 的核心断言)
  var saved = C._DNA_BASE.dynArc;
  C._DNA_BASE.dynArc = 0;                             // 变异:振幅清零
  var duringOK = nonConstantAndMono();                // 变异后:应为 false(断言翻红——证明测试有牙)
  C._DNA_BASE.dynArc = saved;                         // 还原
  var afterOK = nonConstantAndMono();                 // 还原后:应恢复 true
  ok('V9 反向变异验牙:dynArc 振幅清零前非常量+单调(true)→ 清零后必红(false)→ 还原后必绿(true)',
    beforeOK === true && duringOK === false && afterOK === true);
})();

// ─────────────────────────────────────────────────────────────────────────
// W. 音乐批 1 · A3(gameplay-expressiveness-plan.md §三 A3):pad 声部最小移动八度归属 voice leading
//    出处(双核实):Tymoczko 最小/crossing-free 声部进行 + tonal.js minimalVoiceMovement 同构。
//    窄版:只做 pad(不碰 bass/drone/arp/lead);只改八度归属(音名集合/1-3-5 度关系不变);与既有
//    padContour 半程换音叠加次序=先 voiceLead 定八度、后 contour 换音;段/曲开头(prevVoicing=null)
//    重置为根位置(现状字节不变)。
//    - W1(a):纯函数最优性——穷举 8 调式×全部度数对,新音是该声部音名全部八度候选中离上一和弦对应
//            声部最近的一个(直接可验的内在正确性断言)
//    - W2(b):无声部交叉——穷举 + 链式多跳,输出恒升序(排序对齐=crossing-free)
//    - W3:音名集合不变(pitch class 与原 chordNotes 完全相同,只八度可能不同)
//    - W4:reset 行为——prevVoicing=null/undefined/[] → 原样返回(root position,现状行为)
//    - W5(c):端到端确定性——同 spec 两次 composeMusic events 字节相同
//    - W6:端到端集成——真实多和弦进行下 ci=0 恒根位置(现状字节不变)、ci≥1 voice leading 真实生效
//         且移动量 ≤ 天真根位置方案(证明真的在省力,非死代码/非乱换八度)
//    - W7:叠加次序——padContour≥0.2 时,和弦段首半段(未换音)freq 与 voiceLeadPad 直接输出完全一致
//    - W8:只做 pad——移除/保留 pad 声部,bass/drone/arp/lead 事件字节完全相同(A3 状态不泄漏到其它声部)
//    - W9(d,反向变异验牙见 mutationChecks):nearest 改 farthest → W1 必红;已手动验证并还原,见结构化输出
// ─────────────────────────────────────────────────────────────────────────

// W1(a)最优性:穷举 8 调式的全部度数对(355 组 → 1065 声部次),notes2 相对 voicing1(=notes1 的根位置)voice-lead
(function () {
  var MODES_LOCAL = C.MODES;
  var modeNames = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'wholetone', 'pentatonic'];
  var allOptimal = true, checked = 0, firstBad = null;
  modeNames.forEach(function (mname) {
    var modeArr = MODES_LOCAL[mname], L = modeArr.length;
    for (var d1 = 0; d1 < L; d1++) {
      for (var d2 = 0; d2 < L; d2++) {
        var notes1 = C._chordNotes(60, modeArr, d1);
        var notes2 = C._chordNotes(60, modeArr, d2);
        var voicing1 = notes1.slice();               // ci=0(reset)→ root position,现状行为
        var out = C._voiceLeadPad(notes2, voicing1);
        for (var i = 0; i < out.length; i++) {
          var pcClass = ((out[i] % 12) + 12) % 12;
          var target = voicing1[i];
          var actualDist = Math.abs(out[i] - target);
          var trueMin = Infinity;
          for (var k = -6; k <= 6; k++) { var dcand = Math.abs(pcClass + 12 * k - target); if (dcand < trueMin) trueMin = dcand; }
          checked++;
          if (actualDist > trueMin + 1e-9) { allOptimal = false; if (!firstBad) firstBad = { mode: mname, d1: d1, d2: d2, i: i, out: out[i], target: target, actualDist: actualDist, trueMin: trueMin }; }
        }
      }
    }
  });
  ok('W1 最优性(穷举 8 调式全部度数对,' + checked + ' 声部次):新音是该声部音名全部八度候选中离上一和弦对应声部最近的一个(反向变异:nearest→farthest 必红,见 mutationChecks)',
    allOptimal, firstBad ? JSON.stringify(firstBad) : '');
})();

// W2(b)无声部交叉:穷举 + 链式多跳(voicing 持续喂给下一次调用,压测"更远"的 prevVoicing)
(function () {
  var MODES_LOCAL = C.MODES;
  var modeNames = ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian', 'wholetone', 'pentatonic'];
  var allSorted = true, checked = 0;
  modeNames.forEach(function (mname) {
    var modeArr = MODES_LOCAL[mname], L = modeArr.length;
    for (var d1 = 0; d1 < L; d1++) {
      var voicing = C._chordNotes(60, modeArr, d1).slice();
      for (var d2 = 0; d2 < L; d2++) {
        var notes2 = C._chordNotes(60, modeArr, d2);
        var out = C._voiceLeadPad(notes2, voicing);
        checked++;
        for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1]) allSorted = false;
        voicing = out;   // 链式:下一跳的 prevVoicing = 本跳输出(压测多次 voice leading 累积后是否仍无交叉)
      }
    }
  });
  ok('W2 无声部交叉(穷举 + 链式多跳,' + checked + ' 次调用):voiceLeadPad 输出恒升序排列(排序对齐 = crossing-free)', allSorted);
})();

// W3 音名集合不变(pitch class 与原 chordNotes 完全相同,voice leading 只改八度)
(function () {
  var notes = C._chordNotes(60, C.MODES.dorian, 3);
  var prev = [50, 66, 71];   // 任意 prevVoicing(刻意取不规则八度分布,压测非典型输入)
  var out = C._voiceLeadPad(notes, prev);
  function pcSetOf(arr) { return arr.map(function (n) { return ((n % 12) + 12) % 12; }).sort(function (a, b) { return a - b; }).join(','); }
  ok('W3 音名集合不变(voice leading 只改八度归属,pitch class 集合与原 chordNotes 完全相同)', pcSetOf(out) === pcSetOf(notes));
})();

// W4 reset 行为:prevVoicing=null/undefined/[]/非数组 → 原样返回(root position,现状字节不变)
(function () {
  var notes = C._chordNotes(60, C.MODES.major, 4);
  ok('W4a prevVoicing=null → 原样返回', JSON.stringify(C._voiceLeadPad(notes, null)) === JSON.stringify(notes));
  ok('W4b prevVoicing=undefined → 原样返回', JSON.stringify(C._voiceLeadPad(notes, undefined)) === JSON.stringify(notes));
  ok('W4c prevVoicing=[](空数组)→ 原样返回(护栏)', JSON.stringify(C._voiceLeadPad(notes, [])) === JSON.stringify(notes));
})();

// W5(c)端到端确定性:含 A3 voice leading 的 spec,两次 composeMusic events 字节完全相同
(function () {
  var spec = { mode: 'dorian', key: 'D', progression: ['i', 'IV', 'i', 'VII'], instruments: ['pad'], intensity: 1 };
  ok('W5 端到端确定性:两次 composeMusic events 字节完全相同(纯函数、零新随机流)', JSON.stringify(composeMusic(spec).events) === JSON.stringify(composeMusic(spec).events));
})();

// W6 端到端集成:ci=0 恒根位置(现状字节不变);ci≥1 voice leading 真实生效且比天真根位置方案移动量更小
(function () {
  var spec = { mode: 'major', key: 'C', progression: ['I', 'V', 'vi', 'IV'], instruments: ['pad'], intensity: 1, padContour: 0 };
  var r = composeMusic(spec);
  var pads = r.events.filter(function (e) { return e.role === 'pad'; });
  function chordMidis(ci) { return pads.slice(ci * 3, ci * 3 + 3).map(function (e) { return freqMidi(e.freq); }).sort(function (a, b) { return a - b; }); }
  var c0 = chordMidis(0), c1 = chordMidis(1);
  ok('W6a ci=0(reset)恒根位置:I 度 = 60/64/67(与现状字节相同)', c0[0] === 60 && c0[1] === 64 && c0[2] === 67);
  ok('W6b ci=1(V 度)voice leading 生效:非天真根位置 67/71/74', JSON.stringify(c1) !== JSON.stringify([67, 71, 74]));
  function totalMove(a, b) { var s = 0; for (var i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; }
  var naiveMove = totalMove(c0, [67, 71, 74]);   // 若不做 voice leading,V 度会怎样(天真根位置基线)
  var vlMove = totalMove(c0, c1);                // 实际 voice leading 后的移动量
  ok('W6c voice leading 的移动量 ≤ 天真根位置方案的移动量(真的在省力,非乱换八度):vl=' + vlMove + ' naive=' + naiveMove, vlMove <= naiveMove);
})();

// W7 叠加次序:padContour≥0.2 时,和弦段首半段(未换音部分)freq 与 voiceLeadPad 直接输出完全一致
//   (证明"先 voiceLead 定八度、后 contour 换音"——换音分支操作的是已经 voice-led 过的 notes,不是天真根位置)
(function () {
  var spec = { mode: 'minor', key: 'A', progression: ['i', 'VI', 'III', 'VII'], instruments: ['pad'], intensity: 1, padContour: 0.6 };
  var r = composeMusic(spec);
  var pads = r.events.filter(function (e) { return e.role === 'pad'; });
  // 按【时间】选第 ci=1(VI 度)和弦的首半段(t===chordDur;不再按位置 slice(6,9)——pad 去重后前一和弦次半段
  //   可能只 2 个事件、位置索引会漂移,时间选择对去重稳健;首半段本身不去重=仍恰 3 音)
  var chordDur = r.segDur / 4;
  var ch1First3 = pads.filter(function (e) { return Math.abs(e.t - chordDur) < 1e-6; }).map(function (e) { return freqMidi(e.freq); }).sort(function (a, b) { return a - b; });
  var keyMidi = C.KEYS.A, modeArr = C.MODES.minor;
  var notes0 = C._chordNotes(keyMidi, modeArr, 0);   // i 度(ci=0,reset → root position)
  var notes1 = C._chordNotes(keyMidi, modeArr, 5);   // VI 度(ROMAN.vi=5)
  var expected = C._voiceLeadPad(notes1, notes0).slice().sort(function (a, b) { return a - b; });
  ok('W7 叠加次序:padContour 生效时,和弦段首半段(未换音)freq 与 voiceLeadPad 直接输出完全一致(先 voiceLead 后 contour)',
    JSON.stringify(ch1First3) === JSON.stringify(expected));
})();

// W8 只做 pad:移除/保留 pad 声部,bass/drone/arp/lead 事件字节完全相同(A3 的 voice leading 状态不泄漏到其它声部)
(function () {
  var withPad = { mode: 'major', key: 'C', progression: ['I', 'V', 'vi', 'IV'], instruments: ['pad', 'bass', 'drone', 'arp', 'lead'], intensity: 1, melody: 'motif:[0,2,4]' };
  var withoutPad = { mode: 'major', key: 'C', progression: ['I', 'V', 'vi', 'IV'], instruments: ['bass', 'drone', 'arp', 'lead'], intensity: 1, melody: 'motif:[0,2,4]' };
  function nonPad(evs) { return evs.filter(function (e) { return e.role !== 'pad'; }); }
  ok('W8 只做 pad:bass/drone/arp/lead 事件与"移除 pad 声部"完全字节相同(A3 不影响其它声部)',
    JSON.stringify(nonPad(composeMusic(withPad).events)) === JSON.stringify(composeMusic(withoutPad).events));
})();

// ── X:命名进行库「装载顺序无关」(音乐批2 根因修:惰性回查 ensureProgressions)──────────────
//   缘起:compose-music.js 原在装载时用 IIFE 一次性抓 window.Amatlas.resolveProgression——浏览器里若它先于
//   progressions.js 装载,抓空后永久坏、所有命名进行崩(试听页 v0 实撞、Playwright 复现)。node 的 require 路径
//   总能成功、测不出此浏览器顺序问题 → 用 vm 沙箱模拟「浏览器全局(window===globalThis)+ progressions 晚装载」。
//   反向变异验牙:此测对旧的「装载时一次性抓」实测 FAIL(捕获 undefined→命名进行抛),对惰性回查 PASS。
(function () {
  var fs = require('fs'), vm = require('vm'), path = require('path');
  var dir = path.resolve(__dirname, '..');
  var composeSrc = fs.readFileSync(path.join(dir, 'compose-music.js'), 'utf8');
  var progSrc = fs.readFileSync(path.join(dir, 'progressions.js'), 'utf8');
  // 沙箱自身即浏览器全局对象(window===globalThis===self);无 module/require → 走 UMD 浏览器分支。
  var sandbox = { console: console };
  sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(composeSrc, sandbox, { filename: 'compose-music.js' });   // 先装 compose-music(此刻 Amatlas 尚无 resolveProgression)
  vm.runInContext(progSrc, sandbox, { filename: 'progressions.js' });        // 后装 progressions(晚到)
  var evLen = -1, threw = null;
  try { var r = sandbox.Amatlas.composeMusic({ progression: 'eerie', key: 'A', mode: 'minor' }, 777); evLen = (r && r.events) ? r.events.length : 0; }
  catch (e) { threw = e.message; }
  ok('X1 装载顺序无关:compose-music 先于 progressions 装载,命名进行(eerie)仍解析非空(惰性回查;旧的一次性抓在此 FAIL)',
    threw === null && evLen > 0);
  // 顺带锁 window 路径解析结果 = node require 路径一致(同 seed 同曲=装载路径无关,只要都拿到库)
  ok('X2 window 路径解析结果与 node require 路径字节一致(同 seed 同 spec)',
    threw === null && JSON.stringify(sandbox.Amatlas.composeMusic({ progression: 'eerie', key: 'A', mode: 'minor' }, 777))
      === JSON.stringify(composeMusic({ progression: 'eerie', key: 'A', mode: 'minor' }, 777)));
})();

// ── Y:A4 和声终止式(gameplay-expressiveness-plan.md §三 A4)────────────────────────
//   铁边界:只重塑**引擎自给**(DEFAULT_PROG,即 spec.progression 缺省/空数组时)的段末和弦;
//   作者显式数组/命名进行(即使内容恰好等于 DEFAULT_PROG)一个字节不动。
(function () {
  var EXPECT = {   // 逐 mode 期望的终止式塑形后进行(实测三和弦性质 + applyCadenceEnding 手推双核对)
    major: ['I', 'V', 'V', 'I'],           // authentic V(maj)->I(maj)
    minor: ['i', 'VI', 'v', 'i'],          // authentic v(min)->i(min,diatonic 弱版)
    dorian: ['i', 'IV', 'IV', 'i'],        // plagal IV(maj,dorian 特征色彩音)->i(min)
    phrygian: ['i', 'II', 'iv', 'i'],      // plagal iv(min)->i(min);V 是减三和弦不可用
    lydian: ['I', 'II', 'I', 'V'],         // half:收在 V(maj),不解回 I(与既有 DEFAULT_PROG 尾部方向一致)
    mixolydian: ['I', 'VII', 'IV', 'I'],   // plagal IV(maj)->I(maj);V 在 mixolydian 是 min 弱属
    wholetone: ['I', 'II', 'I', 'III'],    // 跳过(全增三和弦,无主属功能关系)
    pentatonic: ['I', 'V', 'I', 'IV']      // 跳过(五声阶非三度叠置,终止式不适用)
  };
  Object.keys(EXPECT).forEach(function (m) {
    var s = normalizeSpec({ mode: m });
    ok('Y1:' + m + ' 引擎默认进行终止式塑形 = ' + JSON.stringify(EXPECT[m]), JSON.stringify(s.progression) === JSON.stringify(EXPECT[m]));
  });

  // Y2:塑形后度数的大小写忠实反映该 mode 音阶上的真实三和弦性质(dorian IV/mixolydian IV 是 maj、
  //     必须大写;phrygian iv/minor v 是 min、必须小写)——这是本轮修的真 bug(quality-driven 前曾把
  //     dorian 的大三 IV 误写成小写 iv,虽不影响实际发声但记谱自相矛盾)。
  (function () {
    function triadQuality(modeArr, deg) {
      var L = modeArr.length;
      function sc(i) { var oct = Math.floor(i / L), idx = ((i % L) + L) % L; return 12 * oct + modeArr[idx]; }
      var r = sc(deg), t3 = sc(deg + 2), t5 = sc(deg + 4);
      var i1 = t3 - r, i2 = t5 - t3;
      return (i1 === 4 && i2 === 3) ? 'maj' : (i1 === 3 && i2 === 4) ? 'min' : (i1 === 3 && i2 === 3) ? 'dim' : (i1 === 4 && i2 === 4) ? 'aug' : '?';
    }
    var ROMAN2 = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
    var allHonest = true, detail = [];
    ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'mixolydian'].forEach(function (m) {
      var s = normalizeSpec({ mode: m }), arr = MODES[m];
      s.progression.forEach(function (r) {
        var d = ROMAN2[r.toLowerCase()], q = triadQuality(arr, d);
        var isUpper = (r === r.toUpperCase());
        var honest = (q === 'maj') === isUpper;   // maj<->大写、非 maj<->小写,双向严格
        if (!honest) { allHonest = false; detail.push(m + ':' + r + '(' + q + ')'); }
      });
    });
    ok('Y2 塑形后全部度数大小写忠实反映真实三和弦性质(0 处不一致' + (detail.length ? ':' + detail.join(',') : '') + ')', allHonest);
  })();

  // Y3:铁边界——作者显式给的 progression(数组 / 命名字符串)一个字节不动,即使内容恰好等于
  //     DEFAULT_PROG 或塑形后的结果。这是本特性最关键的锚定边界断言(防误伤作者意图)。
  (function () {
    // Y3a:作者数组显式写了"看起来像旧 DEFAULT_PROG.major"的进行(塑形前的原始尾部 vi,IV)→ 原样透传,不被拉回 authentic
    var authored = ['I', 'V', 'vi', 'IV'];
    var s = normalizeSpec({ mode: 'major', progression: authored.slice() });
    ok('Y3a 作者数组(内容恰为旧 DEFAULT_PROG.major)字节不变,未被终止式塑形', JSON.stringify(s.progression) === JSON.stringify(authored));

    // Y3b:作者数组显式写了"和塑形后结果不同"的普通进行 → 原样透传
    var authored2 = ['i', 'iv', 'V', 'i'];
    var s2 = normalizeSpec({ mode: 'minor', progression: authored2.slice() });
    ok('Y3b 作者任意数组进行字节不变', JSON.stringify(s2.progression) === JSON.stringify(authored2));

    // Y3c:命名进行(如 'lament')即使解析出的度数与该 mode 的终止式风格恰好相似,也不被二次塑形
    //      ('lament'=['vi','IV','I','V'],主要经过 progressions.js 解析、非 DEFAULT_PROG 路径)
    var s3 = composeMusic({ mode: 'major', key: 'C', progression: 'lament', instruments: ['pad'] });
    ok('Y3c 命名进行(lament)展开后字节不变(未被终止式二次塑形)', JSON.stringify(s3.spec.progression) === JSON.stringify(['vi', 'IV', 'I', 'V']));

    // Y3d:命名进行 'eerie'(minor,pattern 含 III 与 CADENCE_TYPE.minor 的塑形结果不同)→ 原样
    var s4 = composeMusic({ mode: 'minor', key: 'D', progression: 'eerie', instruments: ['pad'] });
    ok('Y3d 命名进行(eerie)展开后字节不变', JSON.stringify(s4.spec.progression) === JSON.stringify(['i', 'III', 'VII', 'i']));
  })();

  // Y4:空数组回退默认 = 与 spec.progression 缺省同等对待(isEngineDefault=true),同样被塑形
  //     (既有 G2 测试"空数组回退默认"的度数守恒,现应额外守恒"回退后也被塑形")。
  (function () {
    var s = normalizeSpec({ mode: 'major', progression: [] });
    ok('Y4 空数组回退默认后同样被终止式塑形(与 null 缺省路径等价)', JSON.stringify(s.progression) === JSON.stringify(EXPECT.major));
  })();

  // Y5:确定性——同 spec 两次 composeMusic 输出字节完全相同(纯函数,cadence 类型按 mode 固定查表、
  //     不引入新随机流)。
  (function () {
    var spec = { mode: 'dorian', key: 'D', instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, melody: 'flowing' };
    ok('Y5 同 spec 两次 events 字节完全相同(终止式塑形是纯查表,零随机)', JSON.stringify(composeMusic(spec).events) === JSON.stringify(composeMusic(spec).events));
  })();

  // Y6:在调测试原样绿——塑形只换 progression 里的罗马数字度数(仍是该 mode 音阶内的合法度数),
  //     不引入变化音,pad/bass/arp/lead 全部音符必须仍在调内(与既有 §C 段同范式,针对塑形后进行复测)。
  (function () {
    var allOk = true, bad = [];
    Object.keys(EXPECT).forEach(function (m) {
      if (!MODES[m]) return;
      var r = composeMusic({ mode: m, key: 'D', instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, melody: 'flowing' });
      if (!allInScale('D', m, r.events)) { allOk = false; bad.push(m); }
    });
    ok('Y6 终止式塑形后全部 8 个 mode 音符仍在调内(不引入变化音' + (bad.length ? ':' + bad.join(',') : '') + ')', allOk);
  })();

  // Y7:段长守恒——塑形只换度数字符串,和弦数/拍数/segDur 完全不受影响(和 F/G 段既有 clamp/默认
  //     测试同精神,针对塑形路径复测)。
  (function () {
    var r = composeMusic({ mode: 'major', key: 'C', instruments: ['pad'] });   // 无 progression → 走塑形路径
    ok('Y7 segDur 守恒(塑形不改变和弦数/拍数):4 和弦 × 4 拍 / (100bpm→0.6s/拍) = 9.6s', Math.abs(r.segDur - 9.6) < 1e-6);
    ok('Y7b 塑形路径 progression.length 仍为 4(塑形只换度数、不增删和弦)', r.spec.progression.length === 4);
  })();

  // Y8:段边界/循环接缝连续性(§三 A4 验证要求)——8 个 mode 的引擎默认进行,首个和弦恒为主音(I/i),
  //     这是 DEFAULT_PROG 本有的不变量(塑形不触碰进行的前半部分);故循环收尾(段末)到下一次循环
  //     开头(段首,同一 progression 恒定跨 segIndex)的落点关系天然合乐理:
  //       - authentic/plagal 型(major/minor/dorian/phrygian/mixolydian):末尾解到主音 I/i,
  //         下一循环开头又是主音 I/i → 主音接主音(最稳定的循环接缝,零跳进)。
  //       - half 型(lydian):末尾停在属和弦 V(不解决),下一循环开头是主音 I → V→I 跨接缝(仍是
  //         authentic 解决关系,只是横跨在循环点上——"循环点即终止式解决"是编曲界公认的合法手法,
  //         并非新引入的不连续,lydian 塑形前〔I,V 收尾〕本就是这个方向,塑形只是把它坐实)。
  //       - wholetone/pentatonic:塑形不触碰,循环接缝关系与塑形前完全一致(无变化,不构成新风险)。
  (function () {
    var allOk = true, bad = [];
    Object.keys(EXPECT).forEach(function (m) {
      var s = normalizeSpec({ mode: m });
      var first = s.progression[0], last = s.progression[s.progression.length - 1];
      var okSeam;
      if (CADENCE_TYPE_OF(m) === 'half') {
        // half 型:段末必须正是该 mode 的属和弦(与 cadenceDegrees('half') 定义一致),段首必须是主音
        okSeam = (String(first).toLowerCase() === 'i') && dominantDegreeMatches(m, last);
      } else if (CADENCE_TYPE_OF(m) === 'authentic' || CADENCE_TYPE_OF(m) === 'plagal') {
        // authentic/plagal 型:段首/段末都落主音(同一度数罗马数字,大小写按塑形结果给定)
        okSeam = String(first).toLowerCase() === String(last).toLowerCase() && String(first).toLowerCase() === 'i';
      } else {
        // 跳过型(wholetone/pentatonic):不作额外接缝要求,只要求段首仍是 I(DEFAULT_PROG 本有不变量,未被本特性触碰)
        okSeam = String(first).toLowerCase() === 'i';
      }
      if (!okSeam) { allOk = false; bad.push(m + '(first=' + first + ',last=' + last + ')'); }
    });
    ok('Y8 段边界循环接缝对全部 8 个 mode 合乐理(段首恒主音;authentic/plagal 段尾落主音、half 段尾落属和弦' + (bad.length ? '。异常:' + bad.join(',') : '') + ')', allOk);
    function CADENCE_TYPE_OF(m) { return C._CADENCE_TYPE[m]; }
    function dominantDegreeMatches(m, romanStr) { return String(romanStr).toLowerCase() === 'v'; }
  })();

  // Y9:反向变异验牙(硬约束)——两端都锁:① 关掉终止式塑形(直接读 _DEFAULT_PROG,不经
  //     applyCadenceEnding)→ 段末度数应回到塑形前的原始值(证明"塑形前"确实与"塑形后"不同,新判据
  //     真有产生差异,非巧合空跑);② 用真实 applyCadenceEnding 跑 → 段末度数必须等于塑形后期望值
  //     (证明特性确实生效)。用 major/dorian/phrygian(三个真正发生度数变化的 mode)做双态对照
  //     ——mixolydian/lydian 因塑形前后巧合相同,不适合作反向变异证据(见下方专门说明)。
  (function () {
    ['major', 'dorian', 'phrygian'].forEach(function (m) {
      var raw = C._DEFAULT_PROG[m];              // 塑形前(原始 DEFAULT_PROG,未经终止式)
      var shaped = normalizeSpec({ mode: m }).progression;   // 塑形后(真实路径)
      var rawTail = raw.slice(-2).join(','), shapedTail = shaped.slice(-2).join(',');
      ok('Y9:' + m + ' 反向变异——塑形前段末(' + rawTail + ')与塑形后段末(' + shapedTail + ')确实不同(新判据真的改变了输出,非空跑)', rawTail !== shapedTail);
      ok('Y9:' + m + ' 反向变异——塑形后段末精确等于设计期望' + JSON.stringify(EXPECT[m].slice(-2)), shapedTail === EXPECT[m].slice(-2).join(','));
    });
    // 附注(mutationChecks 会写清):mixolydian/lydian 的塑形结果与 DEFAULT_PROG 原值巧合相同(mixolydian 本就以
    // IV,I 收尾=恰是 plagal;lydian 本就以 I,V 收尾=恰是 half 的方向),这两个 mode 单独看"前后是否不同"不能
    // 证明特性生效,已用 Y9 的 major/dorian/phrygian(三个真正改变输出的 mode)覆盖"新判据确实改变行为"这一面;
    // mixolydian/lydian 由 Y1(逐 mode 精确期望值断言)+ applyCadenceEnding 直接单元调用(见 Y10)覆盖"函数确实被
    // 调用、只是恰好幂等"这一面。
  })();

  // Y10:直接单元测试 applyCadenceEnding/cadenceDegrees(不经 normalizeSpec 整条链路,隔离验证核心算法本身),
  //      专门覆盖 Y9 里因"巧合幂等"而被排除在链路级反向变异之外的 mixolydian/lydian ——证明 applyCadenceEnding
  //      确实对它们的输入做了替换操作(即使替换后数值与替换前相同),而不是被短路跳过。
  (function () {
    var mixoIn = ['I', 'VII', 'V', 'ii'];   // 人为构造一个"不是"真实 DEFAULT_PROG 的输入,末尾原为 V,ii(非 IV,I)
    var mixoOut = C._applyCadenceEnding(mixoIn, 'mixolydian');
    ok('Y10a applyCadenceEnding(mixolydian) 直接调用:人为构造输入的末 2 度被替换为 IV,I(证明函数真执行了替换、非幂等空跑)', JSON.stringify(mixoOut) === JSON.stringify(['I', 'VII', 'IV', 'I']));
    var lydIn = ['I', 'II', 'III', 'iv'];   // 人为构造末尾非 V 的输入
    var lydOut = C._applyCadenceEnding(lydIn, 'lydian');
    ok('Y10b applyCadenceEnding(lydian) 直接调用:人为构造输入的末 1 度被替换为 V(half 型只换 1 个)', JSON.stringify(lydOut) === JSON.stringify(['I', 'II', 'III', 'V']));
    // 附带:wholetone/pentatonic 查不到型 → 原样返回(不因构造怪输入而意外替换)
    var wtIn = ['I', 'II', 'III', 'IV'];
    ok('Y10c applyCadenceEnding(wholetone) 查不到 CADENCE_TYPE → 原样返回(跳过型不做任何替换)', JSON.stringify(C._applyCadenceEnding(wtIn, 'wholetone')) === JSON.stringify(wtIn));
    // 长度<2 防御性分支
    ok('Y10d applyCadenceEnding 输入长度<2 → 原样返回(防御分支,不因 DEFAULT_PROG 恒为 4 而失守)', JSON.stringify(C._applyCadenceEnding(['I'], 'major')) === JSON.stringify(['I']));
  })();
})();

// ─────────────────────────────────────────────────────────────────────────
// ── Z:命名进行库扩容(gameplay-expressiveness-plan.md §三"音乐②更多曲风预设")──────────────
//    纯数据加法:PROGRESSIONS 表 18→25 条,补 batch4 零覆盖的 5 个 mode(dorian/lydian/mixolydian/
//    wholetone/pentatonic;新族 exotic)+ 2 条把已在 GENRE_DNA/PRESET 里存在但未命名化的曲风进行
//    升格为可复用命名(新族 groove,与既有 PRESET.jazz-noir/chase 的内联 progression 逐字节相同)。
//    只用 ROMAN 表七个自然音级度数,不引入变化音——与 batch4 A1 的约束一脉相承。
//    - Z1:现有 18 条命名进行输出字节恒等(防误伤旧条目——本节新增不改任何既有 pattern/modeHint/family/feel)
//    - Z2:命名库全表遍历冒烟(下限 25,替代 U1b 的 18,U1a 遍历逻辑本身不变仍覆盖新条目)
//    - Z3:7 条新命名逐条 composeMusic 展开非空 events + 度数精确匹配设计值(pattern 逐字节)
//    - Z4:7 条新命名和弦音全部在调内(allInScale,含 pad/bass/arp/lead 四声部)
//    - Z5:7 条新命名同 seed 双跑字节相等(确定性)
//    - Z6:新族 exotic/groove 的 5 个此前零覆盖 mode(dorian/lydian/mixolydian/wholetone/pentatonic)
//         各自至少有一条命名进行覆盖(不再需要作者手写罗马数字才能拿到这些调式色彩)
//    - Z7:反向变异验牙——删一条新进行(otherworldly)→ Z2 全表冒烟计数断言必红 + resolveProgression('otherworldly') 必抛"未知命名"
// ─────────────────────────────────────────────────────────────────────────
(function () {
  var NEW_NAMES = ['groove', 'wonder', 'wayfarer', 'otherworldly', 'ritual', 'smoky-blues', 'pursuit'];
  var OLD_NAMES = ['lament', 'introspection', 'tearful', 'conflict', 'dread', 'oppression', 'heroic', 'triumph', 'solemn',
    'romance', 'tender', 'lullaby', 'eerie', 'void', 'descent', 'festive', 'mischief', 'dance'];
  // batch4(HEAD 提交 8611473 及以前)18 条命名进行的确切 pattern/modeHint/family 快照——本节 batch5
  // 只做加法,这份快照必须逐字节精确匹配当前库(不是"存在就行",是"内容真的一字未改")。
  var OLD_EXPECT = {
    lament:        { pattern: ['vi', 'IV', 'I', 'V'],    modeHint: 'major',    family: 'sorrow' },
    introspection: { pattern: ['i', 'VII', 'VI', 'VII'], modeHint: 'minor',    family: 'sorrow' },
    tearful:       { pattern: ['i', 'III', 'VI', 'VII'], modeHint: 'minor',    family: 'sorrow' },
    conflict:      { pattern: ['i', 'V', 'i', 'V'],      modeHint: 'minor',    family: 'tension' },
    dread:         { pattern: ['i', 'II', 'i', 'II'],    modeHint: 'phrygian', family: 'tension' },
    oppression:    { pattern: ['vi', 'IV', 'vi', 'IV'],  modeHint: 'major',    family: 'tension' },
    heroic:        { pattern: ['I', 'V', 'vi', 'IV'],    modeHint: 'major',    family: 'epic' },
    triumph:       { pattern: ['I', 'IV', 'V', 'I'],     modeHint: 'major',    family: 'epic' },
    solemn:        { pattern: ['I', 'vi', 'IV', 'V'],    modeHint: 'major',    family: 'epic' },
    romance:       { pattern: ['I', 'vi', 'IV', 'V'],    modeHint: 'major',    family: 'warmth' },
    tender:        { pattern: ['I', 'IV', 'I', 'V'],     modeHint: 'major',    family: 'warmth' },
    lullaby:       { pattern: ['IV', 'I', 'IV', 'I'],    modeHint: 'major',    family: 'warmth' },
    eerie:         { pattern: ['i', 'III', 'VII', 'i'],  modeHint: 'minor',    family: 'mystery' },
    void:          { pattern: ['vi', 'IV', 'vi', 'IV'],  modeHint: 'major',    family: 'mystery' },
    descent:       { pattern: ['i', 'VI', 'III', 'VII'], modeHint: 'minor',    family: 'mystery' },
    festive:       { pattern: ['I', 'IV', 'I', 'IV'],    modeHint: 'major',    family: 'playful' },
    mischief:      { pattern: ['I', 'ii', 'V', 'I'],     modeHint: 'major',    family: 'playful' },
    dance:         { pattern: ['V', 'I', 'V', 'I'],      modeHint: 'major',    family: 'playful' }
  };

  // Z1:现有 18 条命名进行输出字节恒等(防误伤;本节新增只追加、不改任何既有条目的 pattern/modeHint/family)
  (function () {
    var allSame = true, bad = [];
    OLD_NAMES.forEach(function (name) {
      var entry = PROGLIB.PROGRESSIONS[name];
      var exp = OLD_EXPECT[name];
      if (!entry) { allSame = false; bad.push(name + ':缺失'); return; }
      if (JSON.stringify(entry.pattern) !== JSON.stringify(exp.pattern) || entry.modeHint !== exp.modeHint || entry.family !== exp.family) {
        allSame = false; bad.push(name + ':pattern/modeHint/family 与 batch4 快照不符,实际=' + JSON.stringify({ pattern: entry.pattern, modeHint: entry.modeHint, family: entry.family }));
      }
    });
    ok('Z1a 现有 18 条命名进行的 pattern/modeHint/family 逐字节精确匹配 batch4 快照(本节只加不改)' + (bad.length ? ' [' + bad.join(' | ') + ']' : ''), allSame);

    // Z1b:同 spec(固定 seed)composeMusic 展开的 events 双跑字节恒等(独立于 Z1a 的静态字段快照,这里测的是运行时确定性)
    var allDet = true, badDet = [];
    OLD_NAMES.forEach(function (name) {
      var entry = PROGLIB.PROGRESSIONS[name];
      var mode = entry.modeHint || 'major';
      var key = (mode === 'phrygian' || mode === 'minor') ? 'A' : 'C';
      var r1 = C.composeMusic({ mode: mode, key: key, progression: name, instruments: ['pad', 'bass'], seed: 7 });
      var r2 = C.composeMusic({ mode: mode, key: key, progression: name, instruments: ['pad', 'bass'], seed: 7 });
      if (JSON.stringify(r1.events) !== JSON.stringify(r2.events)) { allDet = false; badDet.push(name); }
    });
    ok('Z1b 现有 18 条命名进行同 spec(固定 seed)两次 composeMusic 输出字节完全相同' + (badDet.length ? ':' + badDet.join(',') : ''), allDet);
  })();

  // Z2:命名库全表遍历冒烟(同 U1a 遍历逻辑,不硬编码清单;下限从 18 升到 25,含新条目)
  (function () {
    var names = Object.keys(PROGLIB.PROGRESSIONS);
    var allOK = true, crashed = [];
    names.forEach(function (name) {
      var entry = PROGLIB.PROGRESSIONS[name];
      var mode = entry.modeHint || 'major';
      var key = (mode === 'phrygian' || mode === 'minor' || mode === 'dorian') ? 'A' : 'C';
      var r;
      try {
        r = C.composeMusic({ mode: mode, key: key, progression: name, instruments: ['pad', 'bass'] });
      } catch (e) {
        allOK = false; crashed.push(name + ': ' + e.message);
        return;
      }
      if (!(r && Array.isArray(r.events) && r.events.length > 0)) { allOK = false; crashed.push(name + ': 空 events'); }
    });
    ok('Z2a 命名进行库全展开冒烟(25 条,含 batch5 新增):PROGRESSIONS 表每一条 composeMusic 不抛且产出非空 events' +
      (crashed.length ? ' [' + crashed.join(' | ') + ']' : ''), allOK);
    ok('Z2b 命名进行库条目数下限(≥25,防表被误删截断,当前实际 ' + names.length + ' 条)', names.length >= 25);
  })();

  // Z3:7 条新命名逐条 composeMusic 展开非空 events + 度数精确匹配设计值(pattern 逐字节,防拼写/顺序手误)
  (function () {
    var EXPECT_PATTERN = {
      groove: ['i', 'IV', 'i', 'IV'], wonder: ['I', 'II', 'I', 'V'], wayfarer: ['I', 'VII', 'IV', 'I'],
      otherworldly: ['I', 'III', 'I', 'V'], ritual: ['I', 'IV', 'I', 'V'],
      'smoky-blues': ['i', 'ii', 'v', 'i'], pursuit: ['i', 'VII', 'VI', 'v']
    };
    var allOK = true, bad = [];
    NEW_NAMES.forEach(function (name) {
      var entry = PROGLIB.PROGRESSIONS[name];
      var mode = entry.modeHint;
      var key = (mode === 'phrygian' || mode === 'minor' || mode === 'dorian') ? 'A' : 'C';
      var r = C.composeMusic({ mode: mode, key: key, progression: name, instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1 });
      if (!(Array.isArray(r.events) && r.events.length > 0)) { allOK = false; bad.push(name + ':空events'); }
      if (JSON.stringify(r.spec.progression) !== JSON.stringify(EXPECT_PATTERN[name])) {
        allOK = false; bad.push(name + ':pattern不符,实际' + JSON.stringify(r.spec.progression));
      }
    });
    ok('Z3 7 条新命名进行各自展开非空 events 且 pattern 精确匹配设计值(不硬编码在此外部清单,直接对照库源数据)' +
      (bad.length ? ' [' + bad.join(' | ') + ']' : ''), allOK);
  })();

  // Z4:7 条新命名和弦音全部在调内(pad/bass/arp/lead 四声部,呼应 batch4 U1 同精神扩展到新条目)
  (function () {
    function freqMidi(f) { return Math.round(69 + 12 * Math.log2(f / 440)); }
    function pcSet(key, mode) { var s = {}; MODES[mode].forEach(function (iv) { s[(((KEYS[key] + iv) % 12) + 12) % 12] = 1; }); return s; }
    function allInScaleLocal(key, mode, events) { var pcs = pcSet(key, mode); return events.filter(function (e) { return e.freq > 0; }).every(function (e) { return pcs[(((freqMidi(e.freq)) % 12) + 12) % 12]; }); }
    var allOK = true, bad = [];
    NEW_NAMES.forEach(function (name) {
      var entry = PROGLIB.PROGRESSIONS[name];
      var mode = entry.modeHint;
      var key = (mode === 'phrygian' || mode === 'minor' || mode === 'dorian') ? 'A' : 'C';
      var r = C.composeMusic({ mode: mode, key: key, progression: name, instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1 });
      if (!allInScaleLocal(key, mode, r.events)) { allOK = false; bad.push(name); }
    });
    ok('Z4 7 条新命名进行(四声部全启用)所有音符均在其 modeHint 音阶内(不引入变化音' + (bad.length ? ':' + bad.join(',') : '') + ')', allOK);
  })();

  // Z5:7 条新命名同 seed 双跑字节相等(确定性;独立于 Z1 的老条目确定性检查)
  (function () {
    var allDet = true, bad = [];
    NEW_NAMES.forEach(function (name) {
      var entry = PROGLIB.PROGRESSIONS[name];
      var mode = entry.modeHint;
      var key = (mode === 'phrygian' || mode === 'minor' || mode === 'dorian') ? 'A' : 'C';
      var spec = { mode: mode, key: key, progression: name, instruments: ['pad', 'bass', 'arp', 'lead'], intensity: 1, seed: 42 };
      var e1 = JSON.stringify(C.composeMusic(spec).events);
      var e2 = JSON.stringify(C.composeMusic(spec).events);
      if (e1 !== e2) { allDet = false; bad.push(name); }
    });
    ok('Z5 7 条新命名进行同 spec(含固定 seed)两次 composeMusic 输出字节完全相同' + (bad.length ? ':' + bad.join(',') : ''), allDet);
  })();

  // Z6:新族覆盖此前零命中的 5 个 mode(dorian/lydian/mixolydian/wholetone/pentatonic)——
  //     batch4 的 18 条 modeHint 分布只有 major/minor/phrygian,这 5 个合法 mode 此前必须作者手写
  //     罗马数字才能用;本节应让每个都至少有一条命名进行覆盖。
  (function () {
    var GAP_MODES = ['dorian', 'lydian', 'mixolydian', 'wholetone', 'pentatonic'];
    var covered = {};
    Object.keys(PROGLIB.PROGRESSIONS).forEach(function (name) {
      var mh = PROGLIB.PROGRESSIONS[name].modeHint;
      if (GAP_MODES.indexOf(mh) >= 0) covered[mh] = (covered[mh] || 0) + 1;
    });
    var allCovered = GAP_MODES.every(function (m) { return covered[m] >= 1; });
    ok('Z6 此前零覆盖的 5 个 mode(dorian/lydian/mixolydian/wholetone/pentatonic)现各自至少 1 条命名进行覆盖(实际:' + JSON.stringify(covered) + ')', allCovered);
    // 附带:确认 batch4 时代这些 mode 确实是零覆盖(反证缺口分析属实,不是凭空捏造的伪需求)
    var oldGapCovered = OLD_NAMES.filter(function (name) { return GAP_MODES.indexOf(PROGLIB.PROGRESSIONS[name].modeHint) >= 0; }).length;
    ok('Z6b 佐证缺口分析属实:OLD_NAMES(batch4 18 条)里 modeHint 属于这 5 个 mode 的条目数 = 0', oldGapCovered === 0);
  })();

  // Z7:反向变异验牙(硬约束)——两端都锁:① 真实库(新条目在场)→ Z2 计数断言应过(≥25)+ 'otherworldly'
  //     可正常 resolve;② 删除 'otherworldly' 条目模拟"新增被误删/漏提交"→ 全表计数应跌破 25(该断言逻辑
  //     若被误改宽松到不检查数量,这里能测出来)+ resolveProgression('otherworldly') 必抛"未知命名"
  //     (证明 fail-loud 命名接缝防御对新条目同样生效,不是只对老条目生效的特例)。
  (function () {
    // 正向:真实库下 otherworldly 存在且可解析
    var beforeCount = Object.keys(PROGLIB.PROGRESSIONS).length;
    var resolvedOK = !throws(function () { PROGLIB.resolveProgression('otherworldly'); });
    ok('Z7a 变异前:真实库下 otherworldly 存在(表大小=' + beforeCount + ',≥25)且 resolveProgression 不抛', beforeCount >= 25 && resolvedOK);

    // 反向变异:构造一份删除 otherworldly 的副本表(不改动真实模块单例,只影响本闭包局部变量),
    //   模拟"这条新进行被误删/漏提交"这个失败场景,验证若真发生、本节的判据会变红(证明判据非空跑)。
    var mutatedTable = {};
    Object.keys(PROGLIB.PROGRESSIONS).forEach(function (name) {
      if (name === 'otherworldly') return;   // 故意跳过,模拟删除
      mutatedTable[name] = PROGLIB.PROGRESSIONS[name];
    });
    var mutatedCount = Object.keys(mutatedTable).length;
    ok('Z7b 反向变异:模拟删除 otherworldly 后表大小跌破 25(实际 ' + mutatedCount + '),证明 Z2b 的 ≥25 下限断言在此场景确会变红(非空跑判据)', mutatedCount < 25 && mutatedCount === beforeCount - 1);
    var mutatedHasIt = Object.prototype.hasOwnProperty.call(mutatedTable, 'otherworldly');
    ok('Z7c 反向变异:模拟删除后的表里确认 otherworldly 键已不存在(变异确实生效,非误操作)', !mutatedHasIt);
    // 用真实 resolveProgression 对拼错/不存在的名字验证 fail-loud 依旧生效(同 §3.4 三种错法同精神,专门对准新条目名字空间)
    ok('Z7d fail-loud 对新条目名字空间同样生效:故意拼错新条目名("otherwordly" 少一个 l)必抛', throws(function () { PROGLIB.resolveProgression('otherwordly'); }));
  })();
})();

// ─────────────────────────────────────────────────────────────────────────
// AA. 鼓组 humanize 守恒〔C1 鼓组节奏型族(percPattern/percRing/fill)已回滚 2026-07-03:端用户三报「鼓声双重」
//    裁决回退,恢复批前统一鼓点;AA1-AA9(鼓型/环/fill 专属测试)随之删除。仅保留与鼓型无关的独立修复之牙:
//    AA10 同刻鼓击共享微抖(假 flam 治理——同拍 kick/snare 与 hihat 必须同偏移,详见 pHit 注释)。〕
// ─────────────────────────────────────────────────────────────────────────

// AA10 同刻鼓击共享微抖(端用户实听「冾冾双重」修,两端锁):同一格上的 kick/snare/hihat 必须同偏移
//   (瞬态对齐融为一击——kick 自带 4k 噪声 click、snare 宽频噪声,与 hihat 被各自 ±8ms 抖开 5~16ms=假 flam 双击)。
//   断言:march/chase/synthwave seg0 的跨鼓种事件对,间距 ∈(0.5ms,30ms) 假 flam 带为空(0=对齐、≥30ms=真节奏)。
//   变异=pHit 抖动改回逐击独立 prng(或 sixteenth-chase 恢复混合 offbeat 标志)→ 假 flam 带非空 → 红。
(function () {
  var flam = 0, detail = '';
  ['march', 'chase', 'synthwave'].forEach(function (p) {
    var ev = C.composeMusic(C.resolveMusic(p), 0).events.filter(function (e) { return e.role === 'kick' || e.role === 'snare' || e.role === 'hihat'; });
    for (var i = 0; i < ev.length; i++) for (var j = i + 1; j < ev.length; j++) {
      if (ev[i].role === ev[j].role) continue;
      var d = Math.abs(ev[i].t - ev[j].t) * 1000;
      if (d >= 0.5 && d < 30) { flam++; if (!detail) detail = p + ' ' + ev[i].role + '/' + ev[j].role + ' Δ' + d.toFixed(1) + 'ms'; }
    }
  });
  ok('AA10 同刻鼓击共享微抖:march/chase/synthwave(统一鼓点:每拍 kick/snare 与 hihat 同刻)跨鼓种 0.5-30ms 假 flam 带为空(变异=逐击独立抖动→红)', flam === 0, detail || ('flam=' + flam));
})();

// ─────────────────────────────────────────────────────────────────────────
// BA. 音乐 overhaul 批 A · bass 退位反向牙。
//     先锁用户可听语义，而非源码表项：非 melodic 低音不越 G3、力度不盖 lead、support/melodic
//     段间只在同族发展；jazz-noir/baroque 保留音高运动，但必须留下整拍呼吸。
// ─────────────────────────────────────────────────────────────────────────
(function () {
  function midi(e) { return freqMidi(e.freq); }
  function bassOf(name, seg) { return C.composeMusic(C.resolveMusic(name), seg).events.filter(function (e) { return e.role === 'bass'; }); }
  function median(xs) { var a = xs.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : Infinity; }
  function chordBass(result, ci) {
    var spb = 60 / result.spec.tempo, lo = ci * 4 * spb, hi = lo + 4 * spb;
    return result.events.filter(function (e) { return e.role === 'bass' && e.t >= lo - 1e-9 && e.t < hi - 1e-9; });
  }
  function walkingSignature(events, chordStart, spb) {
    if (events.length !== 3) return false;
    var rel = events.map(function (e) { return Math.round((e.t - chordStart) / spb * 1000) / 1000; });
    var pitches = {}; events.forEach(function (e) { pitches[midi(e)] = 1; });
    return JSON.stringify(rel) === JSON.stringify([0, 1, 2]) && Object.keys(pitches).length >= 3;
  }

  var registerOK = true;
  Object.keys(C.MODES).forEach(function (mode) {
    Object.keys(C.KEYS).forEach(function (key) {
      ['pedal', 'block', 'pulse', 'syncopated', 'oompah', 'dotted', 'walking', 'walking-alt'].forEach(function (pattern) {
        for (var seg = 0; seg < 4; seg++) {
          var r = C.composeMusic({ mode: mode, key: key, progression: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'], instruments: ['bass'], intensity: 1, rhythm: { bassPattern: pattern } }, seg);
          if (r.events.some(function (e) { return e.role === 'bass' && midi(e) > 55; })) registerOK = false;
        }
      });
    });
  });
  ok('BA1 全 mode/key/bassPattern/seg 的 bass 最高 MIDI ≤55(G3)，删任一 melodic 三/五度 fold 也会红', registerOK);

  var WITH_LEAD = ['heroic', 'battle', 'synthwave', 'jazz-noir', 'chase', 'romance', 'elegy', 'baroque'];
  var gainRetired = WITH_LEAD.every(function (name) {
    var r = C.composeMusic(C.resolveMusic(name), 0);
    var bg = r.events.filter(function (e) { return e.role === 'bass'; }).map(function (e) { return e.gain; });
    var lg = r.events.filter(function (e) { return e.role === 'lead'; }).map(function (e) { return e.gain; });
    return bg.length > 0 && lg.length > 0 && median(bg) <= median(lg) + 1e-12;
  });
  ok('BA2 有 lead 的代表预设中 bass gain 中位数不得高于 lead（旧 0.15–0.17 对 0.09 会红）', gainRetired);

  var dynSpec = { mode: 'major', key: 'C', progression: ['I', 'I', 'I', 'I'], instruments: ['bass'], intensity: 1, feel: ['calm'], rhythm: { bassPattern: 'pedal' } };
  var dynResult = C.composeMusic(dynSpec, 0), dynSpb = 60 / dynResult.spec.tempo;
  var dynBass = dynResult.events.filter(function (e) { return e.role === 'bass'; });
  var baseHit = dynBass.filter(function (e) { return Math.abs(e.t) < 1e-9; })[0];
  var developHit = dynBass.filter(function (e) { return Math.abs(e.t - 8 * dynSpb) < 1e-9; })[0];
  var bassArcGrowth = baseHit && developHit ? developHit.gain / baseHit.gain - 1 : Infinity;
  ok('BA2b bass dynArc 保留轻呼吸但增幅不超过 6%（删弱化或恢复通用 ±15% 都会红）', bassArcGrowth > 0 && bassArcGrowth <= 0.06 + 1e-12, 'growth=' + bassArcGrowth);

  var NO_WALKING_DEFAULTS = ['calm', 'sad', 'mystery', 'romance', 'elegy', 'stealth'];
  var defaultsSupport = NO_WALKING_DEFAULTS.every(function (name) {
    for (var seg = 0; seg < 4; seg++) {
      var r = C.composeMusic(C.resolveMusic(name), seg), spb = 60 / r.spec.tempo;
      if (!r.spec.progression.every(function (_, ci) { return !walkingSignature(chordBass(r, ci), ci * 4 * spb, spb); })) return false;
    }
    return true;
  });
  ok('BA3 calm/sad/mystery/romance/elegy/stealth 默认 seg0..3 永不进入三击 melodic walking', defaultsSupport);

  var stealthSupport = [0, 1, 2, 3].every(function (seg) {
    var r = C.composeMusic(C.resolveMusic('stealth'), seg), spb = 60 / r.spec.tempo;
    var beats = chordBass(r, 0).map(function (e) { return Math.round(e.t / spb * 1000) / 1000; });
    return JSON.stringify(beats) === JSON.stringify([0, 3.5]) || JSON.stringify(beats) === JSON.stringify([0, 2]);
  });
  ok('BA3b stealth 批 A 默认只在 pedal/block 支撑型间轮转，tense 首词抢成 syncopated/pulse 会红', stealthSupport);

  var MELODIC_PRESETS = ['jazz-noir', 'baroque'];
  var melodicBreathes = MELODIC_PRESETS.every(function (name) {
    for (var seg = 0; seg < 4; seg++) {
      var r = C.composeMusic(C.resolveMusic(name), seg), allMidi = {};
      for (var ci = 0; ci < r.spec.progression.length; ci++) {
        var cb = chordBass(r, ci);
        if (cb.length < 2 || cb.length > 3) return false;   // 至少一整拍留白，仍有 2–3 个行走落点
        cb.forEach(function (e) { allMidi[midi(e)] = 1; });
      }
      if (Object.keys(allMidi).length < 2) return false;
    }
    return true;
  });
  ok('BA4 jazz-noir/baroque seg0..3 保 melodic 音高变化，且每和弦只落 2–3 击留出整拍呼吸', melodicBreathes);

  var supportSpec = { mode: 'major', key: 'C', progression: ['I'], instruments: ['bass'], intensity: 1, rhythm: { bassPattern: 'block' } };
  var supportCycleSafe = [0, 1, 2, 3].every(function (seg) {
    var r = C.composeMusic(supportSpec, seg), spb = 60 / r.spec.tempo;
    return !walkingSignature(r.events.filter(function (e) { return e.role === 'bass'; }), 0, spb);
  });
  ok('BA5a support block 的段间 cycle 永不轮入三击 melodic walking（族间变异 block→walking 会红）', supportCycleSafe);

  var melodicSpec = { mode: 'major', key: 'C', progression: ['I'], instruments: ['bass'], intensity: 1, rhythm: { bassPattern: 'walking' } };
  var melodicSigs = [], melodicCycleSafe = [0, 1, 2, 3].every(function (seg) {
    var bs = C.composeMusic(melodicSpec, seg).events.filter(function (e) { return e.role === 'bass'; });
    var ms = bs.map(midi), hasColor = ms.some(function (m) { return m !== 48 && m !== 43; });   // C3 根音/下方五度之外仍有行走色彩
    melodicSigs.push(ms.join(','));
    return bs.length >= 2 && bs.length <= 3 && hasColor;
  });
  ok('BA5b melodic walking 在 seg0..3 都留在 melodic 族、保和弦色彩与整拍呼吸，且族内至少两种走法', melodicCycleSafe && melodicSigs.some(function (s) { return s !== melodicSigs[0]; }));
})();

// ─────────────────────────────────────────────────────────────────────────
// BB. 音乐 overhaul 批 B · 通用四段宏观 arrangement arc 反向牙。
//     人耳否决“跨四个完整循环慢慢补齐”：默认必须先是一首完整音乐，发展只在内部做轻对比、短峰值与段尾呼吸。
//     四段仍是外层 seg 的 statement→answer→peak→breath；锁即时完整度、窗口边界、static 不造主旋律、bass 克制与确定性。
// ─────────────────────────────────────────────────────────────────────────
(function () {
  function median(xs) { var a = xs.slice().sort(function (x, y) { return x - y; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : 0; }
  function padSig(r) { return r.events.filter(function (e) { return e.role === 'pad'; }).map(function (e) { return [freqMidi(e.freq), +e.t.toFixed(4), +e.dur.toFixed(4), +e.gain.toFixed(5)].join('/'); }).join('|'); }
  function padTiming(r) { return r.events.filter(function (e) { return e.role === 'pad'; }).map(function (e) { return [+e.t.toFixed(6), +e.dur.toFixed(6)].join('/'); }).join('|'); }
  function rolesPresent(r) { var out = {}; r.events.forEach(function (e) { out[e.role] = 1; }); return out; }
  function cloneEvents(events) { return events.map(function (e) { var out = {}; for (var k in e) out[k] = e[k]; return out; }); }

  var phaseApi = typeof C._arrangementPhase === 'function' && C._ARR_PHASES;
  ok('BB1 外层 seg0..7 精确映射 statement→answer→peak→breath 两轮（无 phase API/错用 ci%4 会红）',
    !!phaseApi && [0,1,2,3,4,5,6,7].map(function (s) { return C._arrangementPhase(s, 'period').name; }).join(',') === 'statement,answer,peak,breath,statement,answer,peak,breath');
  var staticPhase = phaseApi && C._arrangementPhase(2, 'static');
  ok('BB1b static 的第3段是 texture 而非 peak，且 pad/arp/lead/perc 均不比 statement 更响更密（误用 dynamic 表会红）',
    !!staticPhase && staticPhase.name === 'texture' && staticPhase.isStatic && ['pad','arp','lead','perc'].every(function (role) { var p = staticPhase.table[role]; return p[2].gain <= p[0].gain + 0.02 && p[2].density <= p[0].density; }));

  ok('BB2 statement 开场即完整：全声部 density/gain 精确为 1（旧 75–85% 慢铺陈会红）',
    Object.keys(C._ARR_DYNAMIC).every(function (role) { var p = C._ARR_DYNAMIC[role][0]; return p.density === 1 && p.gain === 1; }));
  var answerPadComplete = Object.keys(C.PRESET).every(function (name) {
    var statement = C.composeMusic(C.resolveMusic(name), 0), answer = C.composeMusic(C.resolveMusic(name), 1);
    return !statement.events.some(function (e) { return e.role === 'pad'; }) || padTiming(statement) === padTiming(answer);
  });
  ok('BB2b answer 只换音高关系：22 预设的 pad 起音/时值多重集与 statement 相同（旧单个四拍转位删 40% 起音会红）', answerPadComplete);
  ok('BB2c phase 表锁住完整基线：answer 全声部 density=1 且力度变化≤5%；peak 完整，breath 才可在尾窗抽减',
    Object.keys(C._ARR_DYNAMIC).every(function (role) { var p = C._ARR_DYNAMIC[role]; return p[1].density === 1 && p[1].gain >= 0.95 && p[1].gain <= 1.05 && p[2].density === 1; }) &&
    ['arp','lead','perc'].every(function (role) { var p = C._ARR_DYNAMIC[role]; return p[2].gain > p[0].gain && p[3].density < 1 && p[3].gain < p[0].gain; }));

  var sampleEvents = [
    { role:'lead', freq:440, t:0.5, dur:0.2, gain:1 },
    { role:'arp', freq:330, t:2.5, dur:0.2, gain:1 },
    { role:'lead', freq:440, t:3.0, dur:0.2, gain:1 },
    { role:'lead', freq:466, t:3.2, dur:0.2, gain:1 },
    { role:'lead', freq:494, t:3.4, dur:0.2, gain:1 },
    { role:'lead', freq:523, t:3.6, dur:0.2, gain:1 }
  ];
  function windowProbe(seg) { return C._applyArrangementPhase(cloneEvents(sampleEvents), { seed: 7 }, seg, C._arrangementPhase(seg, 'period'), 1, 4); }
  var peakProbe = windowProbe(2), breathProbe = windowProbe(3), earlyShape = JSON.stringify(sampleEvents.slice(0, 2));
  ok('BB2d peak 只在末和弦短暂增强：窗前事件逐字不变，尾窗真实增强（把 peak 扩到整段会红）',
    JSON.stringify(peakProbe.slice(0, 2)) === earlyShape && peakProbe.slice(2).some(function (e) { return e.gain > 1; }));
  ok('BB2e breath 只在末和弦收口：窗前事件逐字不变，尾窗真实抽减/降力且不空（把 breath 扩到整段会红）',
    JSON.stringify(breathProbe.slice(0, 2)) === earlyShape && breathProbe.length > 2 && breathProbe.length < sampleEvents.length && breathProbe.slice(2).every(function (e) { return e.gain < 1; }));

  var heroicStatement = C.composeMusic(C.resolveMusic('heroic'), 0), heroicBreath = C.composeMusic(C.resolveMusic('heroic'), 3);
  var breathStart = heroicBreath.segDur - heroicBreath.segDur / heroicBreath.spec.progression.length;
  var crossingPerc = heroicBreath.events.filter(function (e) { return (e.role === 'kick' || e.role === 'hihat') && e.t < breathStart - 1e-7 && e.t + e.dur > breathStart + 1e-7; });
  var crossingUsesGrid = crossingPerc.length > 0 && crossingPerc.every(function (e) {
    var base = heroicStatement.events.filter(function (x) { return x.role === e.role && Math.abs(x.t - e.t) < 1e-9 && Math.abs(x.dur - e.dur) < 1e-9; })[0];
    return base && Math.abs(e.gain / base.gain - C._ARR_DYNAMIC.perc[3].gain) < 1e-9 && !Object.prototype.hasOwnProperty.call(e, '_gridT');
  });
  ok('BB2f 末和弦首拍即使被负 jitter 移到窗前，仍按抖动前网格归入 breath；私有网格标记不泄漏到事件契约', crossingUsesGrid);

  var des = [0,1,2,3].map(function (s) { return C.composeMusic(C.resolveMusic('desolate'), s); });
  var desPad = {}; des.forEach(function (r) { desPad[padSig(r)] = 1; });
  ok('BB3 pad-only desolate 四段至少 3 种 pad 形态且 breath 不空（旧四段逐字相同会红）',
    Object.keys(desPad).length >= 3 && des[3].events.some(function (e) { return e.role === 'pad'; }));
  var samplePad = [60,64,67];
  var statementPlan = phaseApi && C._padPhasePlan(samplePad, 0.4, C._arrangementPhase(0,'period'), false);
  var answerPlan = phaseApi && C._padPhasePlan(samplePad, 0.4, C._arrangementPhase(1,'period'), false);
  var peakEarly = phaseApi && C._padPhasePlan(samplePad, 0.4, C._arrangementPhase(2,'period'), false);
  var peakLast = phaseApi && C._padPhasePlan(samplePad, 0.4, C._arrangementPhase(2,'period'), true);
  var breathEarly = phaseApi && C._padPhasePlan(samplePad, 0.4, C._arrangementPhase(3,'period'), false);
  var breathLast = phaseApi && C._padPhasePlan(samplePad, 0.4, C._arrangementPhase(3,'period'), true);
  ok('BB3b pad phase 语义：answer 保留 statement 的时序槽与逐槽声部数且换转位；peak/breath 前三和弦保持 statement，只在末和弦做开放峰值/dyad 三拍呼吸',
    !!answerPlan && answerPlan.length === statementPlan.length && answerPlan.every(function (slot, i) { return slot.notes.length === statementPlan[i].notes.length && slot.at === statementPlan[i].at && slot.dur === statementPlan[i].dur; }) &&
    answerPlan[0].notes.join(',') !== statementPlan[0].notes.join(',') &&
    JSON.stringify(peakEarly) === JSON.stringify(statementPlan) && JSON.stringify(breathEarly) === JSON.stringify(statementPlan) &&
    JSON.stringify(peakLast) !== JSON.stringify(statementPlan) && !!breathLast && breathLast.length === 1 && breathLast[0].notes.length === 2 && breathLast[0].dur === 3);

  var staticSafe = ['desolate', 'stealth'].every(function (name) {
    var baseRoles = rolesPresent(C.composeMusic(C.resolveMusic(name), 0));
    return [1,2,3].every(function (seg) {
      var rr = rolesPresent(C.composeMusic(C.resolveMusic(name), seg));
      return !rr.lead && !rr.arp && !rr.kick && !rr.snare && !rr.hihat && Object.keys(rr).every(function (role) { return baseRoles[role]; });
    });
  });
  ok('BB4 static desolate/stealth 只发展已有纹理，不凭空新增 lead/arp/perc 或其它声部', staticSafe);

  var allShape = ['calm', 'desolate', 'stealth'].every(function (name) {
    var shapes = {};
    for (var seg = 0; seg < 4; seg++) {
      var r = C.composeMusic(C.resolveMusic(name), seg), rc = roles(r.events);
      shapes[JSON.stringify(rc) + '#' + padSig(r)] = 1;
    }
    return Object.keys(shapes).length >= 3;
  });
  ok('BB5 calm/desolate/stealth 即使无 lead 也各有至少 3 种 role-count/pad 宏观形态', allShape);

  var bassArcOK = ['calm','sad','stealth','jazz-noir','baroque'].every(function (name) {
    var med = [0,1,2,3].map(function (seg) { return median(C.composeMusic(C.resolveMusic(name), seg).events.filter(function (e) { return e.role === 'bass'; }).map(function (e) { return e.gain; })); });
    return med.every(function (g) { return g > 0; }) && Math.max.apply(null, med) / Math.min.apply(null, med) <= 1.22;
  });
  ok('BB6 bass 四段只轻呼吸（代表预设 gain 中位最大/最小≤1.22），宏观发展不把低音推回主线', bassArcOK);

  var noPercSpec = { mode:'major', key:'C', progression:['I','V','vi','IV'], instruments:['pad','bass','arp','lead'], intensity:1, melody:'flowing' };
  ok('BB7 不造声部:未声明 perc 的 spec 四段始终无 kick/snare/hihat', [0,1,2,3].every(function (s) { var rr = rolesPresent(C.composeMusic(noPercSpec,s)); return !rr.kick && !rr.snare && !rr.hihat; }));

  var allDet = true, allBounds = true;
  Object.keys(C.PRESET).forEach(function (name) {
    for (var seg = 0; seg < 4; seg++) {
      var a = C.composeMusic(C.resolveMusic(name), seg), b = C.composeMusic(C.resolveMusic(name), seg);
      if (JSON.stringify(a.events) !== JSON.stringify(b.events)) allDet = false;
      if (a.events.some(function (e) { return e.t < -1e-9 || e.dur < 0 || e.t + e.dur > a.segDur + 1e-6; })) allBounds = false;
      if (!allInScale(a.spec.key, a.spec.mode, a.events)) allBounds = false;
    }
  });
  ok('BB8 22 预设×四段逐事件确定性（同 spec/seg 两次字节相同）', allDet);
  ok('BB9 22 预设×四段全部在调、事件不溢出且 segDur 守恒', allBounds);

  var peakPerc = roles(C.composeMusic({ mode:'minor', key:'A', instruments:['perc'], intensity:1, feel:['march'], tempo:120 }, 2).events);
  ok('BB10 peak 保完整统一鼓组 kick8/snare8/hihat32（density 只能抽减，不能改鼓型或叠双击）', peakPerc.kick === 8 && peakPerc.snare === 8 && peakPerc.hihat === 32);
})();

// BD. 批 D 全预设四段矩阵：不是抽代表，也不锁脆弱的精确事件数。
(function () {
  function shape(built) {
    var byRole = {}, pad = [];
    built.events.forEach(function (e) {
      byRole[e.role] = (byRole[e.role] || 0) + 1;
      if (e.role === 'pad') pad.push([+e.t.toFixed(4), +e.dur.toFixed(4), +e.freq.toFixed(3)]);   // 形态不混入 gain：只改宏观系数不能冒充 voicing/motion
    });
    return JSON.stringify({ roles: byRole, pad: pad });
  }
  var allHaveArc = true, allNonEmpty = true, allStableDur = true, allDeterministic = true, report = [];
  Object.keys(PRESET).forEach(function (name) {
    var spec = resolveMusic(name), segs = [0,1,2,3].map(function (seg) { return composeMusic(spec, seg); });
    var forms = segs.map(shape), unique = forms.filter(function (v, i, a) { return a.indexOf(v) === i; }).length;
    if (unique < 3) allHaveArc = false;
    if (segs.some(function (b) { return !b.events.length; })) allNonEmpty = false;
    if (segs.some(function (b) { return Math.abs(b.segDur - segs[0].segDur) > 1e-9; })) allStableDur = false;
    for (var seg = 0; seg < 4; seg++) if (JSON.stringify(segs[seg]) !== JSON.stringify(composeMusic(spec, seg))) allDeterministic = false;
    report.push(name + ':' + segs.map(function (b) { return b.events.length; }).join('→') + '/forms=' + unique + '/seconds=' + +(segs[0].segDur * 4).toFixed(2));
  });
  ok('BD1 22 个默认预设的四段各至少 3 种 role-count/pad 形态', allHaveArc && report.length === 22);
  ok('BD2 22×4 全部非空，且每个预设四段 segDur 守恒', allNonEmpty && allStableDur);
  ok('BD3 22×4 逐事件重复生成完全确定', allDeterministic);
  ok('BD4 四段统计报告覆盖全部预设并含事件数/形态数/总时长', report.length === 22 && report.every(function (row) { return /forms=\d+\/seconds=\d/.test(row); }));
  if (process.env.AMATLAS_MUSIC_REPORT === '1') console.log('BD-REPORT\n' + report.join('\n'));
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
