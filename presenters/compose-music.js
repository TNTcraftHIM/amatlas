/* ════════════════════════════════════════════════════════════════════════
   Amatlas 可插拔表现层 · 作曲层 (presenters/compose-music.js) — 音乐系统 v8
   ════════════════════════════════════════════════════════════════════════
   把 AI 制作时生成的「中层骨架」MusicSpec(调式/和弦进行/情绪/配器意图)
   程序化展开成**确定性的音符事件列表**,供 present-audio 的合成器排定发声。

   设计依据 docs/audio-music-design.md(三路深度调研收敛):
   - AI 出和弦进行/情绪(它强项),程序出旋律/节奏(音阶约束→不跑调)。
   - **纯函数**:同 spec → 同 events(种子 PRNG,非 Math.random);可 node 断言,
     与 present-svg 的 buildSceneSVG 同范式(算内容 ≠ 碰 Web Audio)。
   - 校验:结构违约(mode 非枚举/progression 乱写/类型错)→ throw(fail-loud);
     内容偏差(tempo 越界/音级超范围)→ clamp/回绕(优雅修)。
   - 零依赖、轻量:乐理用本文件 ~50 行常量,不引 tonal/Tone.js/scribbletune。

   本文件**只产数据**(不碰 AudioContext);合成由 present-audio.js 复用其现有
   振荡器/滤波/LFO/混响节点完成(衔接见 audio-music-design §5,第 3 步落地)。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else { var _m = factory(), _A = (global.Amatlas = global.Amatlas || {}); _A.composeMusic = _m.composeMusic; _A.resolveMusic = _m.resolveMusic; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // batch 4:命名和弦库接入(双路径:node require / 浏览器 window.Amatlas)。库未加载时命名解析返回 null → normalizeSpec 抛 fail-loud 提示作者引 script。
  //   【惰性回查·根除装载顺序敏感(音乐批2 根因修 2026-07-02)】:原为装载时一次性抓句柄的 IIFE——浏览器里若
  //   compose-music.js 先于 progressions.js 装载,抓取时 window.Amatlas.resolveProgression 尚 undefined → 抓空后**永久**坏、
  //   所有命名进行崩(试听页 v0 实撞、Playwright 复现)。改为**首次用到命名进行时现查**(ensureProgressions):node require
  //   幂等自带缓存、window.Amatlas 只要已挂就取到 → 脚本装载顺序无关;查到成功句柄即缓存不再重查,查不到(库还没装)下次再试。
  //   仍未加载 → PROGS_RESOLVE 保持 null → 下方 normalizeSpec fail-loud 提示引 script(行为不变)。
  var PROGS_RESOLVE = null, PROGS_MODECHECK = null;
  function ensureProgressions() {
    if (typeof PROGS_RESOLVE === 'function') return;   // 已成功缓存 → 幂等短路,不重查
    try {
      if (typeof require === 'function' && typeof module !== 'undefined') {
        var P = require('./progressions.js');
        PROGS_RESOLVE = P && P.resolveProgression;
        PROGS_MODECHECK = P && P.checkProgressionMode;
      } else if (typeof window !== 'undefined' && window.Amatlas) {
        PROGS_RESOLVE = window.Amatlas.resolveProgression;
        PROGS_MODECHECK = window.Amatlas.checkProgressionMode;
      }
    } catch (e) { /* 库未加载 → 命名解析时 fail-loud */ }
  }

  // ── 乐理基础(~50 行硬编码常量;零依赖、确定性)──────────────────────────────
  // 调式 → 半音音程(相对主音)。性质从音阶自动推导(取 1/3/5 度 → 大/小/增三和弦)。
  var MODES = {
    major:      [0, 2, 4, 5, 7, 9, 11],
    minor:      [0, 2, 3, 5, 7, 8, 10],
    dorian:     [0, 2, 3, 5, 7, 9, 10],
    phrygian:   [0, 1, 3, 5, 7, 8, 10],
    lydian:     [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    wholetone:  [0, 2, 4, 6, 8, 10],
    pentatonic: [0, 2, 4, 7, 9]
  };
  // 调主音名 → MIDI 号(C4=60 作中央八度基准;含等音)
  var KEYS = {
    'C': 60, 'C#': 61, 'Db': 61, 'D': 62, 'D#': 63, 'Eb': 63, 'E': 64, 'F': 65,
    'F#': 66, 'Gb': 66, 'G': 67, 'G#': 68, 'Ab': 68, 'A': 69, 'A#': 70, 'Bb': 70, 'B': 71
  };
  // 罗马数字 → 音阶度数(0-based);大小写仅可读(性质从音阶推导,不靠大小写)
  var ROMAN = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
  // 每调式的默认和弦进行(AI 没给 progression 时用;按度数)
  var DEFAULT_PROG = {
    major: ['I', 'V', 'vi', 'IV'], minor: ['i', 'VI', 'III', 'VII'],
    dorian: ['i', 'IV', 'i', 'VII'], phrygian: ['i', 'II', 'i', 'v'],
    lydian: ['I', 'II', 'I', 'V'], mixolydian: ['I', 'VII', 'IV', 'I'],
    wholetone: ['I', 'II', 'I', 'III'], pentatonic: ['I', 'V', 'I', 'IV']
  };
  var DEFAULT_INSTR = ['pad', 'bass'];
  // intensity 门控:每层在 intensity ≥ 阈值时才发声(参数驱动垂直分层)
  var LAYER_GATE = { pad: 0, bass: 0.15, arp: 0.45, lead: 0.5, perc: 0.7, drone: 0 };

  // ── A4 和声终止式(gameplay-expressiveness-plan.md §三 A4)────────────────────────
  //   铁边界:只重塑**引擎自给**的段末和弦——即 spec.progression 缺省(null)或空数组(回退默认)
  //   时用的 DEFAULT_PROG[mode];作者显式写的 progression 数组、或用命名字符串(如 'eerie'/'lament')
  //   选的进行,一个字节不动(见 applyCadenceEnding 调用点:只在 normalizeSpec 判定 isEngineDefault=true
  //   的分支调用,数组/命名两条路径永不触达)。
  //   C2b(变化记号 b/#、借用和弦)已被红队 kill(见 gameplay-expressiveness-plan.md §三 C2b)——
  //   本引擎和声 100% diatonic(和弦性质完全由 mode 音阶推导,ROMAN 大小写只可读、不影响实际半音,
  //   已用 chordNotes 逐 mode 验证:'V' 与 'v' 产出完全相同的音);故不存在"小调 V 升导音变大三"的
  //   传统调性和声手法——本实现是**diatonic 弱版**:每个终止式只在**该 mode 音阶固有的**级数三和弦间
  //   选择,不引入任何变化音。下方 cadenceRoman/degreeQuality 按各 mode 音阶**实测**三和弦性质决定
  //   罗马数字大小写(不是按"这个 mode 整体偏大调/小调"粗分——dorian 的 IV 就是反例:mode 本身小调
  //   性格,IV 度却是大三和弦,是其标志性色彩音;若只按 mode 名分大小写会把这个大三和弦误写成小写
  //   iv,虽不影响实际发声但会造成自相矛盾的记谱,已在实现中修正为逐度数真实性质计算)。
  //
  //   四型定义(§三 A4 原文):authentic(V→I / 小调 v→i)、plagal(IV→I / iv→i)、half(→V,phrase 收在
  //   属功能、不解决回主音——刻意开放式收尾)、deceptive(V→vi)。类型按 **mode 固定**选择(非随机、非
  //   per-seed;同一 mode 的引擎默认进行终止式恒定,可预测、可测试;若想要"per 曲子变化的终止式"属于
  //   deceptive 家族的艺术处理,留给作者显式写 progression 数组表达——不属于本 diatonic 弱版范围)。
  //   选择依据(逐 mode 用 chordNotes 实测三和弦性质表,非拍脑袋——见 mutationChecks 附表):
  //     major     → authentic(V maj→I maj,教科书最强收束)
  //     minor     → authentic(v min→i min,§三 A4 原文明确例子"小调 v→i";本引擎无导音升高机制,
  //                 这是可达到的最强收束形态)
  //     dorian    → plagal(IV maj→i min;dorian 的 IV 是其标志性"明亮"色彩和弦——modal 民谣/爵士常见
  //                 i-IV-i vamp 收尾手法;V 在 dorian 是 min,弱属、不用)
  //     phrygian  → plagal(iv min→i min;phrygian 的 V 是减三和弦,无法用作收束和弦,iv 是唯一干净的
  //                 前主音选择)
  //     lydian    → half(收在 V maj,不解回 I;lydian 特征音级〔升四〕本就制造"悬浮不定"感,IV 在
  //                 lydian 是减三和弦无法 plagal,V 虽 maj 但强行回 I 会掩盖 lydian 本身开放式的调式
  //                 性格——半终止=刻意让乐句留白,呼应该 mode 与生俱来的不解决感;DEFAULT_PROG.lydian
  //                 本就以 'I','V' 收尾〔非 'V','I'〕,half 型是把这个既有方向坐实、非另起炉灶)
  //     mixolydian→ plagal(IV maj→I maj;V 在 mixolydian 是 min,弱属;IV→I 是 mixolydian/blues 里
  //                 经典的"阿门终止"plagal 手法)
  //     wholetone → 跳过(全音阶六个三和弦全部是增三和弦,没有主-属功能关系,终止式概念不适用)
  //     pentatonic→ 跳过(五声阶缺 4/7 度,chordNotes 取出的不是标准三度叠置和弦,终止式概念不适用)
  var CADENCE_TYPE = {
    major: 'authentic', minor: 'authentic', dorian: 'plagal', phrygian: 'plagal',
    lydian: 'half', mixolydian: 'plagal'
    // wholetone/pentatonic:有意不列 → 下方 applyCadenceEnding 查不到型 = 原样返回(跳过)
  };
  // degreeQuality(modeArr,degIdx):该 mode 音阶上、该 0-based 度数三和弦的性质('maj'/'min'/其它)。
  //   与文件顶部 chordNotes 用同一取音逻辑(根/三/五度从音阶取),只判音程性质、不产实际 MIDI。
  //   供 cadenceRoman 决定罗马数字大小写——**大小写只影响可读性、不影响 chordNotes 实际产音**(已用
  //   'V' vs 'v' 逐 mode 验证字节相同事件);但要与文件既有 DEFAULT_PROG 的书写惯例一致(逐条核对:
  //   全表零例外——大写=maj、小写=非 maj〔min/dim/aug〕),写错大小写虽不影响声音、但会造成"代码自称
  //   IV 是明亮大三和弦、实际却写了小写 iv"这种自相矛盾的注释/命名接缝,故仍需按真实性质算,不能凭
  //   "这个 mode 整体偏小调" 之类粗糙分类猜(dorian 的 IV 正是这类反例:mode 本身是小调性格,但其
  //   IV 度是大三和弦——特征色彩音)。
  function degreeQuality(modeArr, degIdx) {
    var L = modeArr.length;
    function sc(i) { var oct = Math.floor(i / L), idx = ((i % L) + L) % L; return 12 * oct + modeArr[idx]; }
    var r = sc(degIdx), t3 = sc(degIdx + 2), t5 = sc(degIdx + 4);
    var i1 = t3 - r, i2 = t5 - t3;
    return (i1 === 4 && i2 === 3) ? 'maj' : (i1 === 3 && i2 === 4) ? 'min' : (i1 === 3 && i2 === 3) ? 'dim' : (i1 === 4 && i2 === 4) ? 'aug' : '?';
  }
  // cadenceRoman(modeArr,degIdx):按 ROMAN 反查该度数的罗马数字符号,大小写按 degreeQuality 真实性质
  //   (maj→大写,其它→小写)——与 DEFAULT_PROG 全表书写惯例一致(见上方注释,零例外核对过)。
  var ROMAN_NAME = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii'];   // 0-based 度数 → 罗马数字词根(大小写另定)
  function cadenceRoman(modeArr, degIdx) {
    var name = ROMAN_NAME[((degIdx % 7) + 7) % 7];
    return (degreeQuality(modeArr, degIdx) === 'maj') ? name.toUpperCase() : name;
  }
  // cadenceDegrees(mode,type):返回该型的度数罗马数字(大小写按 cadenceRoman 真实性质算,不影响音响
  //   ——ROMAN/chordNotes 已验证大小写只可读)。authentic/plagal 返回 [pre, tonic](2 个和弦,替换末
  //   2 个);half 返回 [dominant](1 个和弦,替换末 1 个)。度数索引:i=0/ii=1/iii=2/iv=3/v=4/vi=5/vii=6
  //   (对齐文件顶部 ROMAN 表)。
  //   deceptive(V→vi)本表未使用(§三 A4 四型仅 major/minor 传统和声语境下最典型,本 diatonic 弱版按
  //   上方 CADENCE_TYPE 注释逐 mode 实测选定;deceptive 需要更强的"预期违背"叙事语境,本批不派用场,
  //   函数仍留供未来 mode 扩表或作者自定进行库参考——非契约、纯内部小写工具)。
  function cadenceDegrees(mode, type) {
    var modeArr = MODES[mode];
    if (!modeArr) return null;
    var tonic = cadenceRoman(modeArr, 0);
    if (type === 'authentic') return [cadenceRoman(modeArr, 4), tonic];         // V/v → I/i
    if (type === 'plagal') return [cadenceRoman(modeArr, 3), tonic];            // IV/iv → I/i
    if (type === 'half') return [cadenceRoman(modeArr, 4)];                     // → V/v(不解决)
    if (type === 'deceptive') return [cadenceRoman(modeArr, 4), cadenceRoman(modeArr, 5)];   // V/v → VI/vi
    return null;
  }
  // applyCadenceEnding(prog, mode):只在**引擎自给进行**(normalizeSpec 判定 isEngineDefault)时调用。
  //   prog 至少 2 个和弦(DEFAULT_PROG 全部 mode 恒为 4 个,此处仍防御性判空)→ 替换末 1-2 个和弦的度数;
  //   其余和弦(段落前部)一字不动——终止式只管"乐句怎么收",不重写整个进行的和声骨架。
  //   查不到 CADENCE_TYPE(wholetone/pentatonic)→ 原样返回(不变异)。
  function applyCadenceEnding(prog, mode) {
    var type = CADENCE_TYPE[mode];
    if (!type || !Array.isArray(prog) || prog.length < 2) return prog;
    var deg2 = cadenceDegrees(mode, type);
    if (!deg2) return prog;
    var out = prog.slice();
    for (var k = 0; k < deg2.length; k++) out[out.length - deg2.length + k] = deg2[k];
    return out;
  }

  function mtof(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }   // MIDI 号 → 频率(平均律)
  function hashStr(s) { var h = 2166136261 >>> 0; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // 在 key+mode 音阶上取第 i 度音(0-based;八度回绕,适配任意音阶长度:wholetone 6 音/pentatonic 5 音)
  function scaleNote(keyMidi, modeArr, i) {
    var L = modeArr.length, oct = Math.floor(i / L), idx = ((i % L) + L) % L;
    return keyMidi + 12 * oct + modeArr[idx];
  }
  // 某度数的和弦音(根/三/五度,从音阶内取 → 大/小/增三和弦自动正确)
  function chordNotes(keyMidi, modeArr, degree) {
    return [scaleNote(keyMidi, modeArr, degree), scaleNote(keyMidi, modeArr, degree + 2), scaleNote(keyMidi, modeArr, degree + 4)];
  }

  // ── A3 pad 声部最小移动八度归属 voice leading(gameplay-expressiveness-plan.md §三 A3)────────
  //   出处(双核实):Tymoczko 最小声部进行(minimal/crossing-free voice leading,和弦切换时每个声部
  //   走可能范围内最短距离)+ tonal.js minimalVoiceMovement 同构实现(按音级排序后逐位对应求最近八度)。
  //   纯函数、只改**八度归属**(音级集合/性质不变 → 在调测试天然守恒),不做完整 voicing 档(不换声部数/
  //   不加转位选项——窄版,仅 pad 用;bass 有自己的 walking/oompah 节奏设计,不接入本函数)。
  //   crossing-free 做法:notes/prevVoicing 均先按 MIDI 升序对齐(chordNotes 本就升序),逐位求"该音全部
  //   八度候选中离对应前声部最近的一个",最终结果再排序一次兜底——排序对齐保证声部不交叉(标准简化技巧,
  //   等价于对三声部三角和弦做 crossing-free 最小移动;不追加"最优排列搜索"避免过度设计)。
  //   prevVoicing=null(该曲/该段第一个和弦,无前声部可比)→ 原样返回 notes(root position,现状行为)。
  function voiceLeadPad(notes, prevVoicing) {
    if (!Array.isArray(notes) || !notes.length) return notes;
    if (!Array.isArray(prevVoicing) || !prevVoicing.length) return notes.slice();
    var out = [];
    for (var i = 0; i < notes.length; i++) {
      var target = prevVoicing[i % prevVoicing.length];   // 前声部数与本和弦音数不同(理论上不会,chordNotes 恒 3 音)时安全回绕
      var pc = notes[i], best = pc, bestDist = Math.abs(pc - target);
      for (var oct = -2; oct <= 2; oct++) {                // 八度候选窗口(±2 足够——和弦音本就同八度内,穷举更远无意义)
        var cand = pc + 12 * oct, dist = Math.abs(cand - target);
        if (dist < bestDist) { bestDist = dist; best = cand; }
      }
      out.push(best);
    }
    out.sort(function (a, b) { return a - b; });           // 排序对齐 = crossing-free(逐位对应后声部升序,不交叉)
    return out;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ── 校验/规范化:结构违约 throw(fail-loud);内容偏差 clamp/回绕(优雅修)── 见 §3 ──
  function normalizeSpec(spec) {
    if (spec == null) throw new Error('composeMusic: spec 不能为空');
    if (typeof spec !== 'object' || Array.isArray(spec)) throw new Error('composeMusic: spec 必须是对象(字符串预设须先 resolve;数组/布尔/数字非法——镜像 AmbientSpec/SfxSpec 顶层类型闸,数组 typeof==="object" 曾漏网被当 spec 静默处理)');
    var s = {};
    // mode(枚举):结构违约 → throw
    s.mode = spec.mode == null ? 'major' : String(spec.mode);
    if (!MODES[s.mode]) throw new Error('composeMusic: 未知 mode "' + s.mode + '"(可选:' + Object.keys(MODES).join('/') + ')');
    // key(音名):非法 → throw
    s.key = spec.key == null ? 'C' : String(spec.key);
    if (KEYS[s.key] == null) throw new Error('composeMusic: 非法 key "' + s.key + '"');
    // tempo:类型错 → throw;越界 → clamp(内容偏差)
    if (spec.tempo != null && typeof spec.tempo !== 'number') throw new Error('composeMusic: tempo 必须是数');
    s.tempo = clamp(spec.tempo == null ? 100 : spec.tempo, 40, 200);
    // progression(罗马数字数组):类型错/非罗马数字 → throw
    // batch 4:progression 一字段两形态——字符串名(查 PROGRESSIONS 命名库展开)或罗马数组(透传)。
    //   命名拼错 → throw(fail-loud over fail-silent,§9 命名接缝防御);借用调(modeHint !== spec.mode)→ warn-once、不抛(§11)。
    //   spec.progression == null → 沿用 DEFAULT_PROG[mode](字节恒等)。
    // A4:isEngineDefault 只在两处判 true——① spec.progression 本就 == null(本行判定)、② 作者给的
    //   非空但解析后是空数组回退默认(下方 prog.length===0 分支,与既有 G2 测试"空数组=回退默认"同语义)。
    //   作者的数组/命名进行(无论内容是否恰好与 DEFAULT_PROG 相同)一律 isEngineDefault=false——
    //   终止式只碰引擎自己给的。
    var isEngineDefault = spec.progression == null;
    var prog = isEngineDefault ? DEFAULT_PROG[s.mode] : spec.progression;
    if (typeof prog === 'string') {
      ensureProgressions();   // 惰性回查(装载顺序无关):首次遇命名进行才查库;已缓存则短路返回
      var P = (typeof PROGS_RESOLVE === 'function') ? PROGS_RESOLVE(prog) : null;
      if (P == null) throw new Error('composeMusic: progression 必须是数组或命名(progressions.js 未加载,作者写命名时务必在 index.html 引 presenters/progressions.js)');
      prog = P;
      if (typeof PROGS_MODECHECK === 'function') PROGS_MODECHECK(spec.progression, s.mode);   // 借用调 warn-once(不抛)
    }
    if (!Array.isArray(prog)) throw new Error('composeMusic: progression 必须是命名字符串或罗马数组,收到 ' + (typeof prog));
    if (prog.length === 0) { prog = DEFAULT_PROG[s.mode]; isEngineDefault = true; }
    for (var i = 0; i < prog.length; i++) if (ROMAN[String(prog[i]).toLowerCase()] == null) throw new Error('composeMusic: progression 含非罗马数字 "' + prog[i] + '"');
    // A4 和声终止式:只在 isEngineDefault(见上方两处判定)时重塑末 1-2 个和弦度数;作者显式给的
    // 数组/命名进行(isEngineDefault=false)在此原样透传、一个字节不动。
    if (isEngineDefault) prog = applyCadenceEnding(prog, s.mode);
    s.progression = prog;
    // instruments(开放词,未知忽略):类型错 → throw
    if (spec.instruments != null && !Array.isArray(spec.instruments)) throw new Error('composeMusic: instruments 必须是数组');
    s.instruments = (spec.instruments && spec.instruments.length) ? spec.instruments.slice() : DEFAULT_INSTR.slice();
    // melody:类型/取值
    s.melody = spec.melody == null ? 'sparse' : String(spec.melody);
    // intensity:越界 clamp
    if (spec.intensity != null && typeof spec.intensity !== 'number') throw new Error('composeMusic: intensity 必须是数');
    s.intensity = clamp(spec.intensity == null ? 0.6 : spec.intensity, 0, 1);
    s.feel = Array.isArray(spec.feel) ? spec.feel.slice() : [];
    // timbre 音色板(呈现器消费；完整现役列表以 module-interface §4.2 + present-audio KNOWN 为准)。
    //   形态 fail-loud(非对象/值非串=违约即抛);**板名**开放(未知名呈现器 warn+回退默认,不抛——音色降级可接受,同 art 预设先例)。
    if (spec.timbre != null) {
      if (typeof spec.timbre !== 'object' || Array.isArray(spec.timbre)) throw new Error('composeMusic: timbre 必须是对象(如 {pad:"organ", lead:"pluck"}),收到 ' + (Array.isArray(spec.timbre) ? '数组' : typeof spec.timbre));
      s.timbre = {};
      for (var tk in spec.timbre) {
        if (!Object.prototype.hasOwnProperty.call(spec.timbre, tk)) continue;
        if (typeof spec.timbre[tk] !== 'string') throw new Error('composeMusic: timbre.' + tk + ' 必须是音色板名字符串,收到 ' + typeof spec.timbre[tk]);
        s.timbre[tk] = spec.timbre[tk];
        // A3 fail-loud(对称 warnUnknownPreset):timbre 指定的声部不在 instruments → 该声部从不排音 = 音色完全无效(静默)。
        //   showcase 实测:{preset:'sacral', timbre:{lead:'brass'}} —— sacral.instruments=['pad','bass'] 无 lead → brass 静默丢失。
        if (s.instruments.indexOf(tk) < 0 && !warnedTimbreRole[tk] && typeof console !== 'undefined' && console.warn) {
          warnedTimbreRole[tk] = 1;
          console.warn('composeMusic: timbre.' + tk + ' 设了音色,但声部 "' + tk + '" 不在 instruments(' + s.instruments.join('/') + ')→ 该声部不演奏、音色无效。把 "' + tk + '" 加进 instruments,或改用已启用的声部。');
        }
      }
    }
    // seed:缺省由 key|mode|progression|feel 哈希(确定性)
    s.seed = (typeof spec.seed === 'number') ? (spec.seed >>> 0) : hashStr(s.key + '|' + s.mode + '|' + s.progression.join(',') + '|' + s.feel.join(','));
    // batch 3:rhythm/padContour 字段透传(让作者覆盖 DNA 旋钮,见 deriveGenreDNA);缺省=undefined,跳过覆盖=字节恒等
    s.rhythm = (spec.rhythm && typeof spec.rhythm === 'object' && !Array.isArray(spec.rhythm)) ? spec.rhythm : null;
    if (typeof spec.padContour === 'number') s.padContour = clamp(spec.padContour, 0, 1);
    return s;
  }

  // hasLayer(spec, role):结构层 LAYER_GATE 判定(instruments 声明 + intensity 门槛)。
  //   〔C2 声部登场表已回滚 2026-07-03:曾加 seg/dna 双参做"低强度慢曲 arp/lead 延后登场并渐入"——端用户裁决
  //   「哪个曲风第几段进哪个声部」这种细粒度编排属于终端作者的具体需求、不该引擎侧手调写死 → 整机制移除;
  //   若未来作者真需要,应走契约级设计(作者可写字段)而非引擎内置表。〕
  function hasLayer(spec, role) {
    return spec.instruments.indexOf(role) >= 0 && spec.intensity >= (LAYER_GATE[role] || 0);
  }
  function deg(roman) { return ROMAN[String(roman).toLowerCase()]; }

  // ── 旋律多变性 第一批(组件二 arp + 组件一 contour)· 设计稿 docs/melody-variety-design.md ──
  //   档 A:零契约(不加 MusicSpec 字段)、确定性(独立种子流 mulberry32(seed^常量),绝不消费 lead 主 rng → 守 L2)、
  //   可测、向后兼容路线甲(flowing/sparse 默认升级;motif:/none/segIndex/perc/beatsPerChord 守住 → M6/D1/segDur/L9 不破)。

  // deriveGenreDNA:把 spec 既有字段(feel/mode/tempo/intensity/seed)映射成本批旋钮(查表、数据驱动、易调)。
  //   产物仅 contour/arp 旋钮;无明确曲风走通用基线(§4:arch + pStep0.72 + up·8th·1oct·gate0.9)。
  //   各 feel→DNA 依 §4 表;feel 是数组,取首个命中的曲风(同 feel 多词时优先靠前的曲风词)。
  // 第二批扩展(组件四 phrase + 组件三 rhythm):每条加 phrasePlan('period'|'sentence'|'static')
  //   + rhythmProfile{swing('straight'|'light'|'triplet'|'shuffle'),density(0..1),bassPattern('block'|'oompah'|'dotted'|'walking')}。
  //   依设计稿 §4 表:synthwave straight·sentence;baroque moto-perpetuo(density高·sentence·下行 sequence);
  //   jazz-noir triplet swing·walking·fragmentation;march dotted·oompah·period;chase 高 density·极碎;romance/lullaby 慢长音·period…
  var GENRE_DNA = {
    synthwave: { contourKind: 'arch',        pStep: 0.7,  arpPattern: 'up',         arpRate: 16, arpOctaves: 2, arpGate: 0.5,  phrasePlan: 'sentence', rhythm: { swing: 'straight', density: 0.7, bassPattern: 'pulse' } },
    retro:     { contourKind: 'arch',        pStep: 0.7,  arpPattern: 'up',         arpRate: 16, arpOctaves: 2, arpGate: 0.5,  phrasePlan: 'sentence', rhythm: { swing: 'straight', density: 0.7, bassPattern: 'pulse' } },
    baroque:   { contourKind: 'wave',        pStep: 0.75, arpPattern: 'alberti',    arpRate: 16, arpOctaves: 1, arpGate: 0.85, phrasePlan: 'sentence', rhythm: { swing: 'straight', density: 0.95, bassPattern: 'walking' } },
    ornate:    { contourKind: 'wave',        pStep: 0.75, arpPattern: 'alberti',    arpRate: 16, arpOctaves: 1, arpGate: 0.85, phrasePlan: 'sentence', rhythm: { swing: 'straight', density: 0.95, bassPattern: 'walking' } },
    romance:   { contourKind: 'arch',        pStep: 0.78, arpPattern: 'broken',     arpRate: 8,  arpOctaves: 1, arpGate: 0.85, phrasePlan: 'period',   rhythm: { swing: 'straight', density: 0.35, bassPattern: 'block' } },
    tender:    { contourKind: 'arch',        pStep: 0.78, arpPattern: 'broken',     arpRate: 8,  arpOctaves: 1, arpGate: 0.85, phrasePlan: 'period',   rhythm: { swing: 'straight', density: 0.35, bassPattern: 'block' } },
    march:     { contourKind: 'ascending',   pStep: 0.6,  arpPattern: 'up',         arpRate: 8,  arpOctaves: 1, arpGate: 0.9,  phrasePlan: 'period',   rhythm: { swing: 'straight', density: 0.6, bassPattern: 'oompah' } },
    martial:   { contourKind: 'ascending',   pStep: 0.6,  arpPattern: 'up',         arpRate: 8,  arpOctaves: 1, arpGate: 0.9,  phrasePlan: 'period',   rhythm: { swing: 'straight', density: 0.6, bassPattern: 'oompah' } },
    chase:     { contourKind: 'wave',        pStep: 0.7,  arpPattern: 'up',         arpRate: 16, arpOctaves: 1, arpGate: 0.6,  phrasePlan: 'sentence', rhythm: { swing: 'straight', density: 0.9, bassPattern: 'pulse' } },
    'jazz-noir': { contourKind: 'wave',      pStep: 0.65, arpPattern: 'broken',     arpRate: 8,  arpOctaves: 1, arpGate: 0.8,  phrasePlan: 'sentence', rhythm: { swing: 'triplet', density: 0.55, bassPattern: 'walking' } },
    noir:      { contourKind: 'wave',        pStep: 0.65, arpPattern: 'randomWalk', arpRate: 8,  arpOctaves: 1, arpGate: 0.8,  phrasePlan: 'sentence', rhythm: { swing: 'triplet', density: 0.55, bassPattern: 'walking' } },
    smoky:     { contourKind: 'wave',        pStep: 0.65, arpPattern: 'broken',     arpRate: 8,  arpOctaves: 1, arpGate: 0.8,  phrasePlan: 'sentence', rhythm: { swing: 'triplet', density: 0.55, bassPattern: 'walking' } },
    scherzo:   { contourKind: 'updown',      pStep: 0.6,  arpPattern: 'updown',     arpRate: 8,  arpOctaves: 1, arpGate: 0.4,  phrasePlan: 'sentence', rhythm: { swing: 'light', density: 0.7, bassPattern: 'block' } },
    playful:   { contourKind: 'updown',      pStep: 0.6,  arpPattern: 'updown',     arpRate: 8,  arpOctaves: 1, arpGate: 0.4,  phrasePlan: 'sentence', rhythm: { swing: 'light', density: 0.7, bassPattern: 'block' } },
    mischief:  { contourKind: 'updown',      pStep: 0.6,  arpPattern: 'updown',     arpRate: 8,  arpOctaves: 1, arpGate: 0.4,  phrasePlan: 'sentence', rhythm: { swing: 'light', density: 0.7, bassPattern: 'block' } },
    lullaby:   { contourKind: 'arch',        pStep: 0.82, arpPattern: 'alberti',    arpRate: 8,  arpOctaves: 1, arpGate: 0.8,  phrasePlan: 'period',   rhythm: { swing: 'straight', density: 0.3, bassPattern: 'block' } },
    gentle:    { contourKind: 'arch',        pStep: 0.82, arpPattern: 'broken',     arpRate: 8,  arpOctaves: 1, arpGate: 0.8,  phrasePlan: 'period',   rhythm: { swing: 'straight', density: 0.3, bassPattern: 'block' } },
    grief:     { contourKind: 'descending',  pStep: 0.78, arpPattern: 'down',       arpRate: 8,  arpOctaves: 1, arpGate: 0.9,  phrasePlan: 'period',   padContour: 0.5, rhythm: { swing: 'straight', density: 0.3, bassPattern: 'pedal' } },
    mourning:  { contourKind: 'descending',  pStep: 0.78, arpPattern: 'down',       arpRate: 8,  arpOctaves: 1, arpGate: 0.9,  phrasePlan: 'period',   padContour: 0.5, rhythm: { swing: 'straight', density: 0.3, bassPattern: 'pedal' } },
    sad:       { contourKind: 'descending',  pStep: 0.78, arpPattern: 'down',       arpRate: 8,  arpOctaves: 1, arpGate: 0.9,  phrasePlan: 'period',   padContour: 0.5, rhythm: { swing: 'straight', density: 0.3, bassPattern: 'pedal' } },
    solemn:    { contourKind: 'descending',  pStep: 0.8,  arpPattern: 'up',         arpRate: 8,  arpOctaves: 1, arpGate: 0.95, phrasePlan: 'period',   padContour: 0.1, rhythm: { swing: 'straight', density: 0.25, bassPattern: 'block' } },
    eerie:     { contourKind: 'wave',        pStep: 0.6,  arpPattern: 'random',     arpRate: 8,  arpOctaves: 1, arpGate: 0.7,  phrasePlan: 'static',   padContour: 0.7, rhythm: { swing: 'straight', density: 0.4, bassPattern: 'syncopated' } },
    // batch 3:沉静恐怖预设 feel 词条目(stealth/desolate/mystery/tense/calm 之前走通用 BASE = 无 DNA;现在默认启用 padContour + 适配的 bassPattern,无 lead 也能听到差异)
    sneaking:  { contourKind: 'wave',        pStep: 0.65, arpPattern: 'random',     arpRate: 8,  arpOctaves: 1, arpGate: 0.7,  phrasePlan: 'static',   padContour: 0.3, rhythm: { swing: 'straight', density: 0.4, bassPattern: 'pedal' } },
    stealth:   { contourKind: 'wave',        pStep: 0.65, arpPattern: 'random',     arpRate: 8,  arpOctaves: 1, arpGate: 0.7,  phrasePlan: 'static',   padContour: 0.3, rhythm: { swing: 'straight', density: 0.4, bassPattern: 'pedal' } },   // R2 二轮:'stealth'/'sneaking' 同义,TONE_MAP 两者皆有、GENRE_DNA 独漏 stealth → 直接 feel:['stealth'] 只得音色不得曲式(接缝)。镜像 sneaking 补齐(stealth 预设经 feel:['sneaking'] 本就无碍,不受影响)
    empty:     { contourKind: 'descending',  pStep: 0.8,  arpPattern: 'down',       arpRate: 8,  arpOctaves: 1, arpGate: 0.95, phrasePlan: 'static',   padContour: 0.4, rhythm: { swing: 'straight', density: 0.25, bassPattern: 'pedal' } },
    vast:      { contourKind: 'descending',  pStep: 0.8,  arpPattern: 'down',       arpRate: 8,  arpOctaves: 1, arpGate: 0.95, phrasePlan: 'static',   padContour: 0.4, rhythm: { swing: 'straight', density: 0.25, bassPattern: 'pedal' } },
    curious:   { contourKind: 'wave',        pStep: 0.7,  arpPattern: 'broken',     arpRate: 8,  arpOctaves: 1, arpGate: 0.8,  phrasePlan: 'period',   padContour: 0.6, rhythm: { swing: 'straight', density: 0.5, bassPattern: 'block' } },
    tense:     { contourKind: 'wave',        pStep: 0.7,  arpPattern: 'up',         arpRate: 16, arpOctaves: 1, arpGate: 0.7,  phrasePlan: 'sentence', padContour: 0.5, rhythm: { swing: 'straight', density: 0.6, bassPattern: 'syncopated' } },
    calm:      { contourKind: 'arch',        pStep: 0.75, arpPattern: 'broken',     arpRate: 8,  arpOctaves: 1, arpGate: 0.85, phrasePlan: 'period',   padContour: 0.3, rhythm: { swing: 'straight', density: 0.4, bassPattern: 'pedal' } },
    warm:      { contourKind: 'arch',        pStep: 0.75, arpPattern: 'broken',     arpRate: 8,  arpOctaves: 1, arpGate: 0.85, phrasePlan: 'period',   padContour: 0.3, rhythm: { swing: 'straight', density: 0.4, bassPattern: 'pedal' } },
    driving:   { contourKind: 'wave',        pStep: 0.7,  arpPattern: 'up',         arpRate: 16, arpOctaves: 1, arpGate: 0.7,  phrasePlan: 'sentence', rhythm: { swing: 'straight', density: 0.8, bassPattern: 'pulse' } },
    festive:   { contourKind: 'wave',        pStep: 0.68, arpPattern: 'up',         arpRate: 8,  arpOctaves: 1, arpGate: 0.8,  phrasePlan: 'period',   rhythm: { swing: 'straight', density: 0.7, bassPattern: 'oompah' } },
    joyful:    { contourKind: 'wave',        pStep: 0.68, arpPattern: 'up',         arpRate: 8,  arpOctaves: 1, arpGate: 0.8,  phrasePlan: 'period',   rhythm: { swing: 'straight', density: 0.7, bassPattern: 'oompah' } }
  };
  // A2(乐句级力度弧 dynArc)振幅旋钮:内部常量,非契约字段。DNA_BASE 缺省 0.15(用户拍板"默认全预设开、强度保守")；
  //   GENRE_DNA 各条目目前均未覆盖 → deriveGenreDNA 的 hit[k]!=null?hit[k]:DNA_BASE[k] 回退全部走 0.15(全预设统一强度)；
  //   未来若某曲风想要更强/更弱的力度弧,可在该 GENRE_DNA 条目加 dynArc:X 覆盖(可选覆盖键,同 padContour 先例)。
  var DNA_BASE = { contourKind: 'arch', pStep: 0.72, arpPattern: 'up', arpRate: 8, arpOctaves: 1, arpGate: 0.9, phrasePlan: 'period', padContour: 0, dynArc: 0.15, leadTone: null, arpTone: null, padTone: null, bassTone: null, rhythm: { swing: 'straight', density: 0.55, bassPattern: 'block' } };
  //   kick/snare/hihat 循环逐字节相同)。作者可经既有 spec.rhythm 透传口(:276/:411-415)覆盖,不新增契约词汇。

  // batch 6:曲风 → 全声部默认音色(feel 词 → present-audio 的 timbre.{lead,arp,pad,bass} 板名)。取代 batch5 的 BASS_TONE(bass 列内联)。
  //   治"换曲风像同一首":lead/arp/pad 此前只靠预设硬编码,纯 feel 作者得全默认(lead=soft)→ 主调永远一样。一张表一眼审全声部音色协调。
  //   保守:不确定的声部留 null=默认(soft/pluck/warm),宁缺省勿乱派(选错主旋律乐器毁曲)。lead 取乐器情绪学保守版(L1);arp/pad 衬底点缀不抢主奏。
  //   板名须与 present-audio KNOWN.{lead,arp,pad,bass} 逐字一致。命中=注入 spec.timbre.X(渲染层),events 字节恒等;作者写 timbre.X / 预设自带 timbre.X 均优先(注入前 !(spec.timbre.X) 守卫)。
  var TONE_MAP = {
    // 电子/驱动系
    'synthwave': { lead: 'pulse', arp: 'pluck', pad: 'warm',    bass: 'synth' },
    'retro':     { lead: 'pulse', arp: 'pluck', pad: 'warm',    bass: 'synth' },
    'driving':   { lead: 'pulse', arp: 'pluck', pad: 'warm',    bass: 'synth' },
    // 追逐/进行系
    'chase':     { lead: null,    arp: 'bell',  pad: 'warm',    bass: 'synth' },   // lead 留默认:preset chase 已 brass;裸 feel 不锚定
    'march':     { lead: 'brass', arp: 'pluck', pad: 'warm',    bass: 'picked' },
    'martial':   { lead: 'brass', arp: 'pluck', pad: 'warm',    bass: 'picked' },
    // 巴洛克/装饰系
    'baroque':   { lead: 'harp',  arp: 'pluck', pad: 'organ',   bass: 'upright' },
    'ornate':    { lead: 'harp',  arp: 'pluck', pad: 'organ',   bass: 'upright' },
    // 爵士/烟雾系(feel 兜底用 reed 沉黑;preset jazz-noir 自带 brass 优先)
    'jazz-noir': { lead: 'reed',  arp: 'bell',  pad: 'warm',    bass: 'upright' },
    'noir':      { lead: 'reed',  arp: 'bell',  pad: 'warm',    bass: 'upright' },
    'smoky':     { lead: 'reed',  arp: 'bell',  pad: 'warm',    bass: 'upright' },
    // 浪漫/抒情系
    'romance':   { lead: 'soft',  arp: 'harp',  pad: 'strings', bass: 'sine-pluck' },
    'tender':    { lead: 'flute', arp: 'harp',  pad: 'strings', bass: 'sine-pluck' },
    // 欢快/谐谑系
    'scherzo':   { lead: 'pluck', arp: 'pluck', pad: 'warm',    bass: 'picked' },
    'playful':   { lead: 'pluck', arp: 'pluck', pad: 'warm',    bass: 'picked' },
    'mischief':  { lead: 'pluck', arp: 'pluck', pad: 'warm',    bass: 'picked' },
    'festive':   { lead: null,    arp: 'bell',  pad: 'warm',    bass: 'picked' },  // preset festive 自带 pulse;裸 feel 不锚定
    'joyful':    { lead: null,    arp: 'bell',  pad: 'warm',    bass: 'picked' },
    // 摇篮/温柔系
    'lullaby':   { lead: 'flute', arp: 'bell',  pad: 'warm',    bass: null },
    'gentle':    { lead: 'flute', arp: 'bell',  pad: 'warm',    bass: 'sine-pluck' },
    'calm':      { lead: 'soft',  arp: null,    pad: 'warm',    bass: 'sine-pluck' },
    'warm':      { lead: 'soft',  arp: null,    pad: 'warm',    bass: 'sine-pluck' },
    // 哀伤/庄严系
    'grief':     { lead: 'soft',  arp: 'soft',  pad: 'organ',   bass: 'sub' },
    'mourning':  { lead: 'soft',  arp: 'soft',  pad: 'organ',   bass: 'sub' },
    'sad':       { lead: 'soft',  arp: 'soft',  pad: 'strings', bass: 'sub' },
    'solemn':    { lead: 'soft',  arp: 'soft',  pad: 'organ',   bass: 'organ' },
    // 神秘/恐怖系
    'eerie':     { lead: 'bell',  arp: 'harp',  pad: 'air',     bass: 'sub' },
    'sneaking':  { lead: null,    arp: 'harp',  pad: 'air',     bass: 'sub' },     // 潜行 lead 极弱→默认
    'stealth':   { lead: null,    arp: 'harp',  pad: 'air',     bass: 'sub' },
    'curious':   { lead: null,    arp: 'harp',  pad: 'air',     bass: null },      // bell 有"节庆"歧义→留默认 soft
    // 空旷/紧张系
    'empty':     { lead: 'soft',  arp: 'soft',  pad: 'air',     bass: 'sub' },
    'vast':      { lead: 'soft',  arp: 'soft',  pad: 'air',     bass: 'sub' },
    'tense':     { lead: null,    arp: 'pluck', pad: 'air',     bass: 'sub' }      // tense lead 克制→默认;不用亮 pulse 破悬疑
  };
  function mergeRhythm(hit) {            // rhythm 子对象逐键回退基线(每个旋钮独立可缺省;返回新对象不共享引用)
    var r = {}, src = (hit && hit.rhythm) || {};
    for (var k in DNA_BASE.rhythm) if (Object.prototype.hasOwnProperty.call(DNA_BASE.rhythm, k)) r[k] = src[k] != null ? src[k] : DNA_BASE.rhythm[k];
    return r;
  }
  function deriveGenreDNA(spec) {
    var feel = spec.feel || [];
    var dna = null;
    for (var i = 0; i < feel.length; i++) {
      var key = String(feel[i]).toLowerCase();
      if (GENRE_DNA[key]) {
        var hit = GENRE_DNA[key]; dna = {};
        for (var k in DNA_BASE) if (Object.prototype.hasOwnProperty.call(DNA_BASE, k) && k !== 'rhythm') dna[k] = hit[k] != null ? hit[k] : DNA_BASE[k];
        dna.rhythm = mergeRhythm(hit);
        break;
      }
    }
    if (!dna) {
      dna = {};
      for (var bk in DNA_BASE) if (Object.prototype.hasOwnProperty.call(DNA_BASE, bk) && bk !== 'rhythm') dna[bk] = DNA_BASE[bk];
      dna.rhythm = mergeRhythm(null);     // 通用基线 rhythm(全部缺省 → straight/0.55/block)
    }
    // batch 3:spec.rhythm 显式覆盖 dna.rhythm 旋钮(无 lead 预设也能拿到 pad/bass 多变性升级);
    //   作者可写 `{preset:'stealth', rhythm:{bassPattern:'pedal'}}` 强制 bass 走持续低音、不再 block 死板。
    //   spec 不带 rhythm 字段 = 字节恒等(向后兼容铁律)。
    if (spec.rhythm && typeof spec.rhythm === 'object') {
      for (var rk in spec.rhythm) if (Object.prototype.hasOwnProperty.call(spec.rhythm, rk) && spec.rhythm[rk] != null) {
        dna.rhythm[rk] = spec.rhythm[rk];
      }
    }
    // batch 3:spec.padContour 顶级覆盖(测试 / 预览页 A/B 对比时强制 0 = 关闭升级模拟旧行为)
    if (typeof spec.padContour === 'number') dna.padContour = spec.padContour;
    // batch 6:据 feel 查 TONE_MAP(取首个命中,与 GENRE_DNA 一致),供 composeMusic 注入 spec.timbre.{lead,arp,pad,bass}。无命中 → 全 null。
    for (var ti = 0; ti < feel.length; ti++) {
      var th = TONE_MAP[String(feel[ti]).toLowerCase()];
      if (th) { dna.leadTone = th.lead || null; dna.arpTone = th.arp || null; dna.padTone = th.pad || null; dna.bassTone = th.bass || null; break; }
    }
    return dna;
  }

  // ── 组件二:琶音 arp(§3.1 + §四 草案)──────────────────────────────────────
  // ARP_PATTERNS:索引序列生成器。入参 N=展开后音池长度(octaves 已计入);返回 [0..N-1] 内的索引数组。
  //   只 random* 用 rng;其余纯几何确定。updown=inclusive 周期 2N-2(顶/底各只取一次);
  //   alberti=低-高-中-高 [0,2,1,2](按 §四,音池≥3 才有意义,N<3 退化时回绕);broken=隔位拆;
  //   converge=两端向中收;diverge=中向两端散;pinkyUp=每隔一音夹最高;thumbUp=每隔一音夹最低。
  var ARP_PATTERNS = {
    up: function (N) { var s = []; for (var i = 0; i < N; i++) s.push(i); return s; },
    down: function (N) { var s = []; for (var i = N - 1; i >= 0; i--) s.push(i); return s; },
    updown: function (N) { if (N <= 1) return [0]; var s = []; for (var i = 0; i < N; i++) s.push(i); for (var j = N - 2; j >= 1; j--) s.push(j); return s; },
    downup: function (N) { if (N <= 1) return [0]; var s = []; for (var i = N - 1; i >= 0; i--) s.push(i); for (var j = 1; j <= N - 2; j++) s.push(j); return s; },
    alberti: function (N) { if (N < 3) { var t = []; for (var i = 0; i < N; i++) t.push(i); return t; } return [0, 2, 1, 2]; },
    broken: function (N) { var s = [], i; for (i = 0; i < N; i += 2) s.push(i); for (i = 1; i < N; i += 2) s.push(i); return s; },
    converge: function (N) { var s = [], lo = 0, hi = N - 1; while (lo < hi) { s.push(lo++); s.push(hi--); } if (lo === hi) s.push(lo); return s; },
    diverge: function (N) { var s = [], mid = (N - 1) / 2, lo = Math.floor(mid), hi = Math.ceil(mid); if (lo === hi) { s.push(lo); lo--; hi++; } while (lo >= 0 || hi < N) { if (lo >= 0) s.push(lo--); if (hi < N && hi !== lo + 1) s.push(hi++); } return s; },
    pinkyUp: function (N) { if (N <= 1) return [0]; var s = [], top = N - 1; for (var i = 0; i < top; i++) { s.push(i); s.push(top); } return s; },
    thumbUp: function (N) { if (N <= 1) return [0]; var s = []; for (var i = 1; i < N; i++) { s.push(0); s.push(i); } return s; },
    random: function (N, rng) { var s = []; for (var i = 0; i < N; i++) s.push(Math.floor((rng ? rng() : 0) * N) % N); return s; },
    randomWalk: function (N, rng) { var s = [], cur = 0; for (var i = 0; i < N; i++) { s.push(cur); var step = (rng ? rng() : 0) < 0.5 ? -1 : 1; cur += step; if (cur < 0) cur = 1 < N ? 1 : 0; if (cur > N - 1) cur = N - 2 >= 0 ? N - 2 : 0; } return s; }
  };
  // arpSequence:notes=和弦音(MIDI),按 octaves 展开音池(∪ note+12·o),按 pattern 生成索引,rate 定每和弦步数(8/16),
  //   gate 定 dur 占比。返回 [{idxNote(MIDI), step}]——step 是该和弦内第几步(0-based),供主循环算 t/dur。
  function arpSequence(notes, opts) {
    opts = opts || {};
    var octaves = Math.max(1, opts.octaves || 1), rate = (opts.rate === 16 ? 16 : 8);
    var gate = opts.gate != null ? opts.gate : 0.9;
    var rng = (typeof opts.seed === 'number') ? mulberry32(opts.seed >>> 0) : null;
    var pool = [];
    for (var o = 0; o < octaves; o++) for (var i = 0; i < notes.length; i++) pool.push(notes[i] + 12 * o);
    var N = pool.length || 1;
    var gen = ARP_PATTERNS[opts.pattern] || ARP_PATTERNS.up;
    var idxSeq = gen(N, rng);
    var steps = rate;            // 每和弦发声步数(=每和弦音符数)
    var out = [];
    for (var k = 0; k < steps; k++) { var pi = idxSeq[k % idxSeq.length]; if (pi == null) pi = 0; out.push({ midi: pool[pi % N], step: k, gate: gate, rate: rate }); }
    return out;
  }

  // ── Eno 不可公约循环(arp 层 · audio-arrange-design §Eno)────────────────────
  //   arpSequence 的确定性音型(up/down/updown…)忽略 seed → 光重 seed 改不了 arp;真变化=**按段轮转音型本身**。
  //   以 genre 主音型为锚 + 旋律安全邻居组成 **3 段循环**音型集 → arp 每段轮转、每 3 段复现 = "循环但漂移"的复现层
  //   (Music for Airports);与 lead 连续段间发展(segMix)错速 = 多层不可公约。phase 0(=seg0 / seg%3==0)= 主音型(字节恒等)。
  // ARP_KIN:每个主音型 → 3 段循环音型集(主型在首=seg0/seg3 复现 + 字节恒等),邻居**按性格同族**(降进不翻成上行 / 随机仍无序 / alberti 保琶分)。
  //   ★ 修审计 wg2yunxe5 的 §11 违规:旧 ARP_SAFE 固定 [up,...] 把 grief(down)/eerie(random)/baroque(alberti) 在 seg1 强翻成 up = 静默改作者性格。
  //   全族长度 3 = period 3(与 bass period 2 互质=多层不可公约保持)。12 内置音型全覆盖;未列(理论)→ [home,updown,broken] 兜底。
  var ARP_KIN = {
    up: ['up', 'updown', 'downup'], down: ['down', 'downup', 'broken'],           // 升系 / 降系(downup 仍降起、broken 中性,不翻上行)
    updown: ['updown', 'downup', 'up'], downup: ['downup', 'updown', 'down'],
    alberti: ['alberti', 'broken', 'updown'], broken: ['broken', 'alberti', 'downup'],   // 琶分系
    converge: ['converge', 'diverge', 'broken'], diverge: ['diverge', 'converge', 'broken'],   // 聚散系
    pinkyUp: ['pinkyUp', 'thumbUp', 'updown'], thumbUp: ['thumbUp', 'pinkyUp', 'updown'],   // 踏板系
    random: ['random', 'randomWalk', 'random'], randomWalk: ['randomWalk', 'random', 'randomWalk']   // 无序系(seed 经 segMix 变=重复槽也产不同音;保无序性格)
  };
  function arpCycle(home) { return ARP_KIN[home] || [home, 'updown', 'broken']; }   // 同族 3 型(主型在首);未知主型兜底
  // Eno v2(bass 层):节奏型仍按 **2 段循环**轮转(period 2 ⊥ arp 3 ⊥ lead 线性)，但只能在职责同族内变化。
  // 旧 BASS_SAFE 把 support block 在 seg1 强制翻成 melodic walking，令没有主旋律的默认曲突然由 bass「唱起来」。
  var BASS_KIN = {
    pedal: ['pedal', 'block'], block: ['block', 'pulse'],
    pulse: ['pulse', 'syncopated'], syncopated: ['syncopated', 'pulse'],
    oompah: ['oompah', 'dotted'], dotted: ['dotted', 'oompah'],
    walking: ['walking', 'walking-alt'], 'walking-alt': ['walking-alt', 'walking']
  };
  function bassCycle(home) { return BASS_KIN[home] || [home, 'block']; }
  function bassFold(midi) { while (midi > 55) midi -= 12; return midi; }   // 非 melodic 的硬上限 G3；melodic 也复用，统一待在低音车道


  // ── 组件一:旋律轮廓 contour(§3.2)──────────────────────────────────────────
  // CONTOURS:解析曲线 target(x)→[lo..hi] 浮点目标音级(x∈[0,1]);lo/hi 为该和弦的音级游走范围。
  //   arch=单峰 sin πx;ascending 线性升;descending 线性降;wave=mid+amp·sin(2πk·x);
  //   pendulum 大振幅、末点收 lo;concave 凹形(中段最低)。
  var CONTOURS = {
    arch:       function (x, lo, hi) { return lo + (hi - lo) * Math.sin(Math.PI * x); },
    ascending:  function (x, lo, hi) { return lo + (hi - lo) * x; },
    descending: function (x, lo, hi) { return hi - (hi - lo) * x; },
    wave:       function (x, lo, hi) { var mid = (lo + hi) / 2, amp = (hi - lo) / 2; return mid + amp * Math.sin(2 * Math.PI * 1.5 * x); },
    pendulum:   function (x, lo, hi) { var mid = (lo + hi) / 2, amp = (hi - lo) / 2; return (x >= 0.999) ? lo : mid + amp * Math.sin(2 * Math.PI * 1.25 * x); },
    concave:    function (x, lo, hi) { return hi - (hi - lo) * Math.sin(Math.PI * x); },
    updown:     function (x, lo, hi) { return lo + (hi - lo) * (x < 0.5 ? 2 * x : 2 * (1 - x)); }
  };
  // contourMelody:dna(contourKind/pStep)+ chordDegs(该和弦的根/三/五度数,用于强拍吸附)+ N(音符数)+ rng(独立流)。
  //   ① 由 contourKind 选 target(x);② 浮点目标吸附到最近调内音级(强拍优先 chordDegs);
  //   ③ 叠 step-inertia(上步步进→0.7 同向续)+ post-skip-reversal(上步跳≥2→0.85 反向且步长≤2)+ 步跳比(pStep);
  //   ④ arch/concave 单峰强制后处理(峰唯一)。返回音级数组(交主循环 scaleNote → 在调)。
  function contourMelody(dna, chordDegs, N, rng) {
    if (N < 1) N = 1;
    var kind = dna.contourKind || 'arch';
    var curve = CONTOURS[kind] || CONTOURS.arch;
    var base = chordDegs[0];
    var lo = base - 2, hi = base + 5;             // 该和弦的音级游走范围(约一个八度内)
    var pStep = dna.pStep != null ? dna.pStep : 0.72;
    var out = [], prev = null, prevDir = 0, prevWasSkip = false;
    for (var i = 0; i < N; i++) {
      var x = N > 1 ? i / (N - 1) : 0;
      var targetF = curve(x, lo, hi);
      var deg = Math.round(targetF);              // 浮点目标 → 最近整数音级
      var strong = (i % 2 === 0);                 // 强拍(偶数步)优先吸附到 chordDegs
      if (prev != null) {
        var raw = deg - prev, dir = raw > 0 ? 1 : raw < 0 ? -1 : 0, mag = Math.abs(raw);
        // post-skip reversal:上一步是跳进(≥2)→ 0.85 概率反向、步长收到 ≤2
        if (prevWasSkip && rng() < 0.85) { var rd = -prevDir || (rng() < 0.5 ? 1 : -1); deg = prev + rd * (1 + Math.floor(rng() * 2)); }
        // step-inertia:上一步是级进 → 0.7 续同向一步(若目标本就同向则尊重)
        else if (!prevWasSkip && prevDir !== 0 && rng() < 0.7 && dir !== prevDir) { deg = prev + prevDir; }
        // 步/跳比:pStep 概率把跳进收成级进(收创造性留 1-pStep 给跳进)
        else if (mag >= 2 && rng() < pStep) { deg = prev + dir; }
      }
      // 强拍吸附:把 deg 吸到最近的 chordDeg(只在强拍且偏离不大时,保旋律骨架=和弦音)
      if (strong) {
        var best = chordDegs[0], bd = 99;
        for (var c = 0; c < chordDegs.length; c++) { var d = Math.abs(chordDegs[c] - deg); if (d < bd) { bd = d; best = chordDegs[c]; } }
        if (bd <= 1) deg = best;
      }
      if (prev != null) { var nr = deg - prev; prevDir = nr > 0 ? 1 : nr < 0 ? -1 : prevDir; prevWasSkip = Math.abs(nr) >= 2; }
      prev = deg;
      out.push(deg);
    }
    // 单峰强制后处理(arch/concave):若出现多个等于全局极值的位置,只保留中段一个,其余拉回邻级
    if (kind === 'arch' || kind === 'concave') {
      var ext = kind === 'arch' ? Math.max.apply(null, out) : Math.min.apply(null, out);
      var peakIdx = -1, mid = (N - 1) / 2, bestDist = 99;
      for (var pi = 0; pi < out.length; pi++) if (out[pi] === ext) { var dist = Math.abs(pi - mid); if (dist < bestDist) { bestDist = dist; peakIdx = pi; } }
      for (var qi = 0; qi < out.length; qi++) if (out[qi] === ext && qi !== peakIdx) out[qi] = ext + (kind === 'arch' ? -1 : 1);
    }
    return out;
  }

  // ── 组件四:乐句发展 phrase(§3.3 + §四 草案)──────────────────────────────────
  //   六动机变形算子:纯音级数组函数(输入/输出都是音级数组,相对当前调音阶的级偏移;不碰 MIDI/频率)。
  //   音级是离散整数 → 倒影/逆行在音级空间做(modal 倒影=调内反射,不离调;scaleNote 八度回绕保在调)。
  //   设计稿 §二乐理 + §五代数律(retrograde∘retrograde=id、invert∘invert=id、retrograde∘invert=retrogradeInvert)。
  var MOTIF_OPS = {
    // transpose:整体平移 n 个音级(模进/重复用;n 可负)
    transpose: function (m, n) { n = n || 0; return m.map(function (d) { return d + n; }); },
    // invert(modal 倒影):绕轴 axis(缺省首音)反射,d' = 2·axis - d → 留在音级整数格 = 调内(scaleNote 回绕)
    invert: function (m, axis) { if (!m.length) return []; var a = (axis == null) ? m[0] : axis; return m.map(function (d) { return 2 * a - d; }); },
    // retrograde:逆行(时间倒序)
    retrograde: function (m) { return m.slice().reverse(); },
    // retrogradeInvert:逆行倒影(= invert 后 retrograde;代数律 retrograde∘invert)
    retrogradeInvert: function (m, axis) { return MOTIF_OPS.retrograde(MOTIF_OPS.invert(m, axis)); },
    // sequence:模进——把动机重复 reps 次、每次整体移 stepDeg 音级(下行 sequence 用负 stepDeg);返回拼接序列
    sequence: function (m, reps, stepDeg) { reps = Math.max(1, reps || 2); stepDeg = (stepDeg == null) ? -1 : stepDeg; var out = []; for (var r = 0; r < reps; r++) { var seg = MOTIF_OPS.transpose(m, stepDeg * r); for (var i = 0; i < seg.length; i++) out.push(seg[i]); } return out; },
    // fragment:碎片——取前 frac 比例(缺省前半);至少留 1 音
    fragment: function (m, frac) { if (!m.length) return []; frac = (frac == null) ? 0.5 : frac; var n = Math.max(1, Math.round(m.length * frac)); return m.slice(0, n); },
    // augment:增时——每音重复 factor 次(音数变多=时值拉长的音级层近似;factor≥2 整数)
    augment: function (m, factor) { factor = Math.max(2, Math.round(factor || 2)); var out = []; for (var i = 0; i < m.length; i++) for (var f = 0; f < factor; f++) out.push(m[i]); return out; },
    // diminish:减时——隔 factor 取一音(音数变少=时值压缩的音级层近似;factor≥2 整数);至少留 1 音
    diminish: function (m, factor) { if (!m.length) return []; factor = Math.max(2, Math.round(factor || 2)); var out = []; for (var i = 0; i < m.length; i += factor) out.push(m[i]); return out.length ? out : [m[0]]; }
  };

  // ── 段间变奏(audio-arrange-design · 破"乐句发展封顶 2-4 种"封顶)─────────────────────
  //   SEG_MULT:段索引乘子(Math.imul(seg, SEG_MULT) → segMix,折入 phraseSeed/rhythmSeed)。与既有 7 个异或常量
  //   (0x27d4eb2f/0xb5297a4d/0x85ebca6b/0x9e3779b9/0x68e31da4/0xc2b2ae35/0x1b56c4e9)两两互异(测试 SEG-8 把守,防漂移耦合)。
  var SEG_MULT = 0x9e3779b1;   // 注:乘子(非异或掩码),与 perc 的异或常量 0x9e3779b9 不同值、不同用途。

  // 音乐 overhaul 批 B:外层 4 段 arrangement arc。它与 ci%4 的和弦内 dynArc 正交。
  // 人耳否决“跨四个完整循环慢慢补齐”：statement 从第一秒就是完整音乐，answer 只轻换关系；
  // peak/breath 的增减只落在末和弦短窗口。static 的第 3 段仍叫 texture，且只换已有纹理、不凭空加戏。
  var ARR_PHASES = ['statement', 'answer', 'peak', 'breath'];
  var ARR_DYNAMIC = {
    pad:    [{ density: 1, gain: 1 }, { density: 1, gain: 1.00 }, { density: 1,    gain: 1.06 }, { density: 1,    gain: 0.90 }],
    drone:  [{ density: 1, gain: 1 }, { density: 1, gain: 1.00 }, { density: 1,    gain: 1.02 }, { density: 1,    gain: 0.94 }],
    bass:   [{ density: 1, gain: 1 }, { density: 1, gain: 0.99 }, { density: 1,    gain: 1.01 }, { density: 0.86, gain: 0.96 }],
    arp:    [{ density: 1, gain: 1 }, { density: 1, gain: 0.98 }, { density: 1,    gain: 1.08 }, { density: 0.72, gain: 0.82 }],
    lead:   [{ density: 1, gain: 1 }, { density: 1, gain: 0.98 }, { density: 1,    gain: 1.08 }, { density: 0.72, gain: 0.82 }],
    perc:   [{ density: 1, gain: 1 }, { density: 1, gain: 0.98 }, { density: 1,    gain: 1.04 }, { density: 0.72, gain: 0.82 }]
  };
  var ARR_STATIC = {
    pad:    [{ density: 1, gain: 1 }, { density: 1, gain: 1.00 }, { density: 1,    gain: 0.99 }, { density: 1,    gain: 0.90 }],
    drone:  [{ density: 1, gain: 1 }, { density: 1, gain: 1.00 }, { density: 1,    gain: 1.00 }, { density: 1,    gain: 0.94 }],
    bass:   [{ density: 1, gain: 1 }, { density: 1, gain: 0.99 }, { density: 1,    gain: 0.99 }, { density: 0.86, gain: 0.96 }],
    arp:    [{ density: 1, gain: 1 }, { density: 1, gain: 0.98 }, { density: 0.94, gain: 0.98 }, { density: 0.72, gain: 0.82 }],
    lead:   [{ density: 1, gain: 1 }, { density: 1, gain: 0.98 }, { density: 0.94, gain: 0.98 }, { density: 0.72, gain: 0.82 }],
    perc:   [{ density: 1, gain: 1 }, { density: 1, gain: 0.98 }, { density: 0.94, gain: 0.98 }, { density: 0.72, gain: 0.82 }]
  };
  function arrangementPhase(seg, phrasePlan) {
    var index = (seg >>> 0) % 4, isStatic = phrasePlan === 'static';
    return { index: index, name: isStatic && index === 2 ? 'texture' : ARR_PHASES[index], isStatic: isStatic, table: isStatic ? ARR_STATIC : ARR_DYNAMIC };
  }
  function arrangementRole(role) { return role === 'kick' || role === 'snare' || role === 'hihat' || role === 'timpani' ? 'perc' : role; }
  function arrangementHash(spec, seg, role, e, index) {
    // 声部存在与否不能改变其它声部的密度选择：不用全局 events index，只用事件自身与 role-local 次序。
    return hashStr('arr|' + spec.seed + '|' + seg + '|' + role + '|' + index + '|' + e.t.toFixed(6) + '|' + e.dur.toFixed(6) + '|' + e.freq.toFixed(3));
  }
  function pickArrangementEvents(items, quota, spec, seg, role) {
    if (quota >= items.length) return items.map(function (x) { return x.index; });
    if (quota < 1) quota = 1;
    var ranked = items.slice().sort(function (a, b) {
      if (a.local === 0 && b.local !== 0) return -1;   // 每个 role/和弦的首击是身份锚,不让 hash 抽掉根基
      if (b.local === 0 && a.local !== 0) return 1;
      return arrangementHash(spec, seg, role, a.event, a.roleIndex) - arrangementHash(spec, seg, role, b.event, b.roleIndex);
    });
    return ranked.slice(0, quota).map(function (x) { return x.index; });
  }
  function applyArrangementPhase(events, spec, seg, phase, chordDur, segDur) {
    var keep = {}, groups = {}, roleSeen = {}, i;
    // statement/answer 是完整基线；peak/breath 也只在末和弦进入宏观窗口，避免玩家等几十秒才听到完整织体。
    var windowStart = Math.max(0, segDur - chordDur);
    for (i = 0; i < events.length; i++) {
      var e = events[i], role = arrangementRole(e.role), prof = phase.table[role];
      var roleIndex = roleSeen[role] || 0; roleSeen[role] = roleIndex + 1;
      var logicalT = typeof e._gridT === 'number' ? e._gridT : e.t;
      if (!prof || (phase.index >= 2 && logicalT < windowStart - 1e-7)) { keep[i] = 1; continue; }
      e.gain *= prof[phase.index].gain;
      if (role === 'pad' || role === 'drone' || prof[phase.index].density >= 1) { keep[i] = 1; continue; }
      var chord = role === 'bass' ? Math.max(0, Math.floor((e.t + 1e-7) / chordDur)) : 0;
      var key = role + '#' + chord;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ index: i, event: e, local: groups[key].length, roleIndex: roleIndex });
    }
    for (var key in groups) if (Object.prototype.hasOwnProperty.call(groups, key)) {
      var items = groups[key], roleName = key.split('#')[0], density = phase.table[roleName][phase.index].density;
      var min = roleName === 'bass' && items.length >= 2 ? 2 : 1;
      var quota = Math.max(min, Math.round(items.length * density));
      var chosen = pickArrangementEvents(items, quota, spec, seg, roleName);
      for (var c = 0; c < chosen.length; c++) keep[chosen[c]] = 1;
    }
    return events.filter(function (_, index) { return !!keep[index]; }).map(function (e) {
      if (!Object.prototype.hasOwnProperty.call(e, '_gridT')) return e;
      delete e._gridT;
      return e;
    });
  }
  function uniquePadNotes(notes) {
    var out = [], seen = {};
    for (var i = 0; i < notes.length; i++) if (!seen[notes[i]]) { seen[notes[i]] = 1; out.push(notes[i]); }
    return out;
  }
  function padPhasePlan(padNotes, padContour, phase, isLastChord) {
    var root = padNotes[0], third = padNotes[1], fifth = padNotes[2], plan = [];
    function statementPlan() {
      if (padContour < 0.2) plan.push({ notes: padNotes.slice(), at: 0, dur: 4 });
      else {
        plan.push({ notes: padNotes.slice(), at: 0, dur: 2 });
        var si = padContour >= 0.5 ? 1 : 2, swap = padNotes.slice();
        if (swap.length > si) swap[0] = swap[si];
        plan.push({ notes: uniquePadNotes(swap), at: 2, dur: 2 });
      }
    }
    if (phase.index === 0) statementPlan();   // statement:批 B 前 pad 字节形态作为完整身份锚
    else if (phase.index === 1) {   // answer:沿用 statement 的起音/时值，只把每个完整三音槽位转位
      var answerNotes = uniquePadNotes([third, fifth, root + 12]);
      if (padContour < 0.2) plan.push({ notes: answerNotes, at: 0, dur: 4 });
      else {
        plan.push({ notes: answerNotes.slice(), at: 0, dur: 2 });
        var ai = padContour >= 0.5 ? 1 : 2, answerSwap = answerNotes.slice();
        if (answerSwap.length > ai) answerSwap[0] = answerSwap[ai];
        plan.push({ notes: uniquePadNotes(answerSwap), at: 2, dur: 2 });
      }
    } else if (!isLastChord) statementPlan();   // peak/breath 只落在末和弦短窗口，前三和弦保持完整陈述
    else if (phase.index === 2 && !phase.isStatic) {   // peak:末和弦开放 voicing + 半程色彩,不新增第四声部
      plan.push({ notes: padNotes.slice(), at: 0, dur: 2 });
      plan.push({ notes: uniquePadNotes([root, third, fifth + 12]), at: 2, dur: 2 });
    } else if (phase.index === 2) {   // static texture:只在末和弦低位转位换色,不做动态高潮
      plan.push({ notes: uniquePadNotes([fifth - 12, root, third]), at: 0, dur: 4 });
    } else {   // breath:只在末和弦收成外声部 dyad，并提前一拍结束给下一循环留真空隙
      plan.push({ notes: uniquePadNotes([root, fifth]), at: 0, dur: 3 });
    }
    return plan;
  }
  function pick(prng, arr) { return arr[Math.floor(prng() * arr.length) % arr.length]; }
  // PHASE_OPS:三个乐句功能位(respond 回应 / develop 展开 / cadence 终止)各一【算子候选池】——全部复用 MOTIF_OPS,
  //   但段≥1 时由 prng 在更宽的「主算子 × 参数」空间取值(破二值开关封顶)。所有 develop 的模进类算子【先 fragment 再 sequence】
  //   (对齐旧实现护栏),令 6 音动机输出 ≤12 音 ≤16 网格槽 → 不溢出/不被 leadRhythm 截断(配合 lead 循环 mi<rh.length 兜底)。
  var PHASE_OPS = {
    respond: [   // 回应(consequent):近原样的呼应——倒影/移调/逆行,长度≈动机(不爆炸)
      function (m, r) { return MOTIF_OPS.invert(m, pick(r, [m[0], m[m.length - 1], m[m.length >> 1]])); },
      function (m, r) { return MOTIF_OPS.transpose(m, pick(r, [-3, -2, -1, 1, 2, 3])); },
      function (m, r) { return MOTIF_OPS.retrograde(m); },
      function (m, r) { return MOTIF_OPS.retrogradeInvert(m, pick(r, [m[0], m[m.length >> 1]])); }
    ],
    develop: [   // 展开(Fortspinnung):碎片 + 模进续展(先 fragment 封顶长度,再 sequence/augment)
      function (m, r) { return MOTIF_OPS.sequence(MOTIF_OPS.fragment(m, pick(r, [0.4, 0.5, 0.6])), pick(r, [2, 3]), pick(r, [-2, -1, 1])); },
      function (m, r) { return MOTIF_OPS.sequence(MOTIF_OPS.fragment(m, 0.5), pick(r, [2, 3]), pick(r, [-1, 1, 2])); },
      function (m, r) { return MOTIF_OPS.transpose(MOTIF_OPS.fragment(m, pick(r, [0.5, 0.75])), pick(r, [-2, -1, 1, 2])); },
      function (m, r) { return MOTIF_OPS.augment(MOTIF_OPS.fragment(m, pick(r, [0.4, 0.5])), 2); }
    ],
    cadence: [   // 终止(cadence):减时/碎片落主音
      function (m, r) { return MOTIF_OPS.diminish(m, pick(r, [2, 3])); },
      function (m, r) { return MOTIF_OPS.fragment(m, pick(r, [0.4, 0.5, 0.6])); },
      function (m, r) { return MOTIF_OPS.transpose(MOTIF_OPS.diminish(m, 2), pick(r, [-2, -1, 0, 1])); },
      function (m, r) { return MOTIF_OPS.invert(MOTIF_OPS.fragment(m, 0.6), m[0]); }
    ]
  };
  // PLAN_ROLES:phrasePlan → 4 段功能位序列(段0=null=锚=种子动机原样,作品一体性铁锚)。
  var PLAN_ROLES = { period: [null, 'respond', 'develop', 'cadence'], sentence: [null, 'respond', 'develop', 'develop'] };

  // ── 组件五:乐句级力度弧 dynArc(gameplay-expressiveness-plan.md §三 A2)─────────────
  //   与 intensity(LAYER_GATE 门控——决定"哪些声部发不发声")是两个不同概念:dynArc 只在已发声的
  //   pad/bass/arp/lead 事件上乘一个 gain 因子(决定"同一声部内力度怎么起伏"),drone/perc 不动
  //   (perc 已有自己的 humanization 独立种子流,概念分开,见上方 pHit 注释)。
  //   纯函数、无新随机流:因子只是(段功能角色, 事件在其和弦段内的相对位置 x)的确定性曲线,
  //   同 seed 两次调用天然字节相等(不需要额外确定性保证)。
  var DYNARC_LO = 0.85, DYNARC_HI = 1.15;   // 保守钳制界(用户拍板;develop 段渐强/cadence 段渐弱不超此范围)
  // dynArcFactor(role, x, amp):role='develop'→渐强(x:0→1 映 1→1+amp);role='cadence'→渐弱(x:0→1 映 1→1-amp);
  //   其它(null=陈述锚/respond/static/未知)→基线不变(1)。**两条曲线都从基线 1.0 起(x=0)**——这是段边界连续性
  //   的设计关键(见下方 dynArcMul 注释):任意段的力度弧总在段头"回落到基线"(乐句收束回落再起,§三 A2 红队语义),
  //   段尾才可能偏离到 amp 的量级,故相邻段边界跳变 ≤ amp(由本函数结构直接保证,非经验观察)。
  function dynArcFactor(role, x, amp) {
    if (amp == null) amp = 0;
    var xc = x < 0 ? 0 : x > 1 ? 1 : x;   // x 理论上已在 [0,1](见 dynArcMul),此处再夹一次防御
    if (role === 'develop') return 1 + amp * xc;
    if (role === 'cadence') return 1 - amp * xc;
    return 1;
  }
  // dynArcRoleFor(plan, ci):与 developPhrase 的 phase 计算同源(ci%4 循环、static→null),避免另起一套判断漂移。
  //   段0(phase 0)恒为 null=基线(与"陈述锚,段间恒定"精神一致——乐句的第一次陈述不该被力度弧染色)。
  function dynArcRoleFor(plan, ci) {
    if (plan === 'static') return null;
    var roles = PLAN_ROLES[plan];
    return roles ? roles[ci % 4] : null;
  }
  // dynArcMul(t, dur, ct, chordDur, role, amp):算一个事件的力度弧乘数。x 取事件**中点**(t+dur/2)相对和弦段头 ct 的
  //   归一位置(而非纯 onset)——理由:pad 常是横跨整个和弦/半和弦的长音符,若只用 onset(恒为段头 x=0)力度弧将对它
  //   永远不起作用;用中点则长音符也能反映"它在段内偏前还是偏后"。对同一和弦内同角色的多个事件(arp/lead/bass 多击型),
  //   中点顺序与 onset 顺序一致(既有非重叠不变量保证,见批注设计稿),故 develop 段内 gain 序列仍单调不减。
  //   最终经 clamp(DYNARC_LO,DYNARC_HI)夹一次——**这个 clamp 本身就是段边界跳变的硬上界**:无论 amp 被设成多大,
  //   段头(x→0 恒为基线 1.0,clamp 后仍是 1.0)与段尾(clamp 后落在 [0.85,1.15])的最大差值恒 ≤ 0.15,不依赖 amp 取值。
  function dynArcMul(t, dur, ct, chordDur, role, amp) {
    var x = chordDur > 0 ? (t + dur / 2 - ct) / chordDur : 0;
    return clamp(dynArcFactor(role, x, amp), DYNARC_LO, DYNARC_HI);
  }

  // developPhrase:按 phrasePlan 给 progLen 个和弦各分配一个确定性「变形角色」,产出逐和弦音级序列数组。
  //   seedMotif=种子动机(短音级数组,3-6 音);贯穿全曲(统一)+ 每段不同变形(发展)= 作品一体性。
  //   phraseSeed=独立种子流(不消费 lead 主 rng,守 L2);只在算子需小随机选择(reps/移位方向)时用。
  //   护栏:动机短;一段一主算子;sequence 段数≤3;每乐句 ≥1 次近原样 repetition 作锚(段 0 = presentation,原样)。
  //   period(起承转合):段0 原样(陈述)→段1 倒影/parallel 重复(回应)→段2 fragment+下行 sequence(展开)→段3 diminish 落主音(终止)。
  //   sentence(陈述-续展):段0 原样 basic idea→段1 transpose 重复→段2 fragment 提速→段3 fragment+sequence 续展碎裂。
  //   static:全段原样(stealth/eerie 不强加发展)。
  function developPhrase(plan, seedMotif, progLen, phraseSeed, seg) {
    if (!(Array.isArray(seedMotif) && seedMotif.length)) {       // 空种子动机(melody=none / motif:[])→ 各段空、不出 lead(守 I1/N19)
      var empty = []; for (var e = 0; e < progLen; e++) empty.push([]); return empty;
    }
    var motif = seedMotif.slice(0, 6);                           // 护栏:动机短(≤6)
    var prng = mulberry32((phraseSeed >>> 0) ^ 0x27d4eb2f);   // 独立种子流(不动 lead rng)
    var legacy = !(seg > 0);                                     // seg0/无参 → 旧实现逐字保留(字节等价);seg≥1 → 宽算子空间(段间发展)
    var roles = PLAN_ROLES[plan];                                // period/sentence → 功能位序列;static/未知 plan → undefined(走 legacy)
    var out = [];
    for (var ci = 0; ci < progLen; ci++) {
      var phase = (plan === 'static') ? -1 : (ci % 4);   // 4 和弦一组(>4 和弦循环复用 4 段角色);static → 全原样
      var seq;
      if (plan === 'static' || phase === 0) {
        seq = motif.slice();                                                   // 段0 / static:原样(repetition 锚;段间恒定=作品一体性铁锚,不消费 prng)
      } else if (legacy || !roles) {
        // 旧实现逐字保留(seg0/无参,或无功能位映射的 plan)——prng 消费顺序与改动前完全一致 → 字节等价
        if (plan === 'period') {
          if (phase === 1) seq = MOTIF_OPS.invert(motif);                        // 段1:倒影回应(consequent)
          else if (phase === 2) seq = MOTIF_OPS.sequence(MOTIF_OPS.fragment(motif), Math.min(3, 2 + (prng() < 0.5 ? 0 : 1)), -1); // 段2:fragment + 下行 sequence(展开;reps≤3)
          else seq = MOTIF_OPS.diminish(motif, 2);                               // 段3:diminish 落主音(cadence)
        } else { // sentence
          if (phase === 1) seq = MOTIF_OPS.transpose(motif, (prng() < 0.5 ? 1 : -1));   // 段1:transpose 重复(同动机变奏)
          else if (phase === 2) seq = MOTIF_OPS.fragment(motif);                 // 段2:fragment 提速
          else seq = MOTIF_OPS.sequence(MOTIF_OPS.fragment(motif), Math.min(3, 2 + (prng() < 0.5 ? 0 : 1)), -1);   // 段3:fragment + sequence 续展碎裂
        }
      } else {
        // seg≥1:从该功能位算子池选(段间不同主算子 + 更宽参数)= 真正的动机发展(破 2-4 封顶)。
        var op = pick(prng, PHASE_OPS[roles[phase]]);
        seq = op(motif, prng);
      }
      if (!seq.length) seq = motif.slice();
      out.push(seq);
    }
    return out;
  }

  // ── 组件三:节奏 rhythm(§3.4 + §四 草案)──────────────────────────────────────
  //   leadRhythm:把 noteCount 个音锁到八分音网格上(onset/时值=GRID 整数倍)——时值不再均分、但**绝不缩放/漂格**。
  //     LHL(Longuet-Higgins & Lee 1984):落整拍=强拍偏长音(四分/附点/二分)、反拍弱拍偏短(八分),受 density 调。
  //     时值=网格步数:1步=八分(0.5拍)、2=四分(1拍)、3=附点四分(1.5拍)、4=二分(2拍)。不混 1/3 三连(避免与二进制脉冲打架)。
  //     swing 离散档:反拍(非整拍位)onset 后移 swing 拍(triplet 1/6、shuffle 1/4),与 arp/hihat 同向;straight=0。
  //     **修复(原 scale=chordLen/totalBeats 任意拉伸 → lead 漂出网格、与和弦/bass 对不齐=听感混乱)**:改网格预算填充,
  //     onset 恒为 GRID 整数倍 + 固定 swing 偏移 → 锁脉冲;音排不下作休止;末音 clamp 不越和弦边界(段长由和弦调度守恒,与 lead 无关)。
  //   返回 [{t, dur}](相对和弦起点秒);确定性(rhythmSeed 独立流,不消费 lead 主 rng)。
  var DUR_POOL = { quarter: 1, dottedQuarter: 1.5, eighth: 0.5, triplet: 1 / 3, half: 2 };
  var SWING_FRAC = { straight: 0, light: 0.04, triplet: 1 / 6, shuffle: 0.25 };   // ★单位钉死=**拍**(lead 与 arp 共用同一物理时长,别再当"步长比例"):反拍后移 N 拍。triplet 1/6 拍≈直八变 2:1 三连;shuffle 1/4 拍
  function leadRhythm(noteCount, beatsPerChord, spb, dna, rhythmSeed) {
    if (noteCount < 1) return [];
    var prof = (dna && dna.rhythm) || DNA_BASE.rhythm;
    var prng = mulberry32((rhythmSeed >>> 0) ^ 0xb5297a4d);
    var swing = SWING_FRAC[prof.swing] != null ? SWING_FRAC[prof.swing] : 0;
    var density = prof.density != null ? prof.density : 0.55;   // 高 density → 更短促碎、低 → 偏长音
    // ★锁网格:onset/时值全为八分网格(GRID 拍)整数倍 → 与 bass/arp/perc 同脉冲对齐(不缩放=不漂格)。
    //   时值 = 网格步数(1步=八分/2=四分/3=附点四分/4=二分);LHL:落整拍=强拍偏长、反拍弱拍偏短(受 density 调)。
    //   swing:反拍(非整拍位)onset 后移 swing 拍(与 arp/hihat 同向摇摆);音排不下→作休止(不溢出和弦)。
    var bar = beatsPerChord;                                   // 总拍数(不缩放)
    var GRID = noteCount > bar * 2 ? 0.25 : 0.5;              // 八分网格;音多到放不下时退十六分
    var barSec = bar * spb, out = [], pos = 0, i;            // pos 以拍计、恒为 GRID 整数倍
    for (i = 0; i < noteCount; i++) {
      if (pos >= bar - 1e-9) break;                            // 满了:剩余音作休止(防溢出)
      var slotsLeft = Math.round((bar - pos) / GRID);
      var notesLeft = noteCount - i;
      var maxSteps = slotsLeft - (notesLeft - 1);             // 给后续每音至少留 1 槽
      if (maxSteps < 1) maxSteps = 1;
      var onStrong = (Math.abs(pos - Math.round(pos)) < 1e-9); // 落整拍=强拍
      var steps;                                               // 占几个网格步
      if (onStrong) steps = (density < 0.5) ? (prng() < 0.5 ? 4 : 3) : (prng() < 0.5 ? 2 : 1);
      else          steps = (density > 0.6) ? 1 : (prng() < 0.5 ? 2 : 1);
      if (steps > maxSteps) steps = maxSteps;
      if (steps < 1) steps = 1;
      var sw = onStrong ? 0 : swing;                           // 反拍才 swing 后移
      var t = (pos + sw) * spb;
      var dur = steps * GRID * spb * 0.92;                     // 0.92 留微隙(legato 不黏)
      if (t + dur > barSec) dur = barSec - t;                  // 不越和弦边界
      if (dur < 0) dur = 0;
      out.push({ t: t, dur: dur });
      pos += steps * GRID;
    }
    return out;
  }

  // ── 旋律(melody):在和弦音/音阶上走音,音级表示 → 天然在调(不跑调)──────────
  // seedMotifFor:取一首曲的「种子动机」(短音级数组,绝对调内度数;贯穿全曲 → 作品一体性)。
  //   motif:[...] → 解析为种子动机(现在走发展);flowing/sparse → 用 contourMelody 在第 0 和弦产出短动机(3-4 音);none → 空。
  //   绝对度数(scaleNote(key,mode,deg) 不加和弦根)= 与旧 motif 语义一致(I2/M6 锚)。
  function seedMotifFor(spec, dna) {
    if (spec.melody === 'none') return [];
    if (/^motif:/.test(spec.melody)) {
      var m; try { m = JSON.parse(spec.melody.slice(6)); } catch (e) { m = []; }
      if (!Array.isArray(m)) m = [];
      var arr = [];
      for (var k = 0; k < m.length; k++) { var n = parseInt(m[k], 10); arr.push(isFinite(n) ? n : 0); }
      return arr;
    }
    // flowing/sparse:种子动机来自第 0 和弦的 contour(独立种子流,不消费 lead 主 rng);取 3-4 音作短动机。
    var seedRng = mulberry32((spec.seed ^ 0x85ebca6b) >>> 0);
    var firstDeg = deg(spec.progression[0]) || 0;
    var chordDegs = [firstDeg, firstDeg + 2, firstDeg + 4];
    var motifLen = 3 + (seedRng() < 0.5 ? 0 : 1);   // 3-4 音(护栏:短动机)
    return contourMelody(dna, chordDegs, motifLen, seedRng);
  }

  // ── 主函数:MusicSpec → 确定性音符事件列表 ──────────────────────────────────
  // event = { role, freq, t, dur, gain }(t 相对段起点的秒数);供合成器 osc.start(base+t) 排定。
  // 返回 { events, segDur, spec }(segDur=一个和弦进行循环的秒长;spec=规范化后的)。
  function composeMusic(rawSpec, segIndex) {
    var spec = normalizeSpec(rawSpec);
    // 段循环索引(段间变奏 · audio-arrange-design):缺省/非有限 → 0;seg=0 → segMix=0 → 各种子流 ^0 恒等 → 与现状逐字节相同(向后兼容铁律)。
    var seg = (typeof segIndex === 'number' && isFinite(segIndex) && segIndex > 0) ? (segIndex >>> 0) : 0;
    var segMix = Math.imul(seg, SEG_MULT) >>> 0;   // 折入 phraseSeed/rhythmSeed 的段混合量(只喂 prng,绝不进时序网格=守 lesson 82)
    var keyMidi = KEYS[spec.key], modeArr = MODES[spec.mode];
    var spb = 60 / spec.tempo, beatsPerChord = 4, stepsPerBeat = 2;   // 每和弦 4 拍、八分音分辨率
    var rng = mulberry32(spec.seed);
    var dna = deriveGenreDNA(spec);   // 旋律多变性 第一批:曲风 DNA(contour/arp 旋钮),供 lead/arp 派生
    var arrPhase = arrangementPhase(seg, dna.phrasePlan);   // 批 B:外层 4 段通用 role phase；不按 genre 写登场表
    // batch 5/6:曲风派生默认全声部音色 → 注入 spec.timbre.{lead,arp,pad,bass}(渲染层,present-audio 消费)。
    //   每声部三重守卫:① dna.XTone 非 null ② hasLayer(声部存在+过 intensity 门槛)③ !(spec.timbre.X)(作者/预设自带优先)。
    //   events 不含 timbre → 字节恒等(测试不红)。治"换曲风像同一首":lead/arp/pad 不再永远默认 soft/pluck/warm。
    if (dna.bassTone && hasLayer(spec, 'bass') && !(spec.timbre && spec.timbre.bass)) { if (!spec.timbre) spec.timbre = {}; spec.timbre.bass = dna.bassTone; }
    if (dna.leadTone && hasLayer(spec, 'lead') && !(spec.timbre && spec.timbre.lead)) { if (!spec.timbre) spec.timbre = {}; spec.timbre.lead = dna.leadTone; }
    if (dna.arpTone  && hasLayer(spec, 'arp')  && !(spec.timbre && spec.timbre.arp))  { if (!spec.timbre) spec.timbre = {}; spec.timbre.arp  = dna.arpTone; }
    if (dna.padTone  && hasLayer(spec, 'pad')  && !(spec.timbre && spec.timbre.pad))  { if (!spec.timbre) spec.timbre = {}; spec.timbre.pad  = dna.padTone; }
    // ── A2 鼓机律动 humanization(治机器感;**独立种子流**,不动 lead 的 rng → pad/bass/arp/lead 事件字节不变)──
    //   独立 PRNG = mulberry32(seed ^ 常量):同 spec 同序列 → events 字节级相同(守 D1 确定性)。
    //   ① swing:整曲一个固定摇摆量(8-16%,种子定),作用于八分音网格的"反拍"(pt+spb/2)→ 后移成三连感、非死板对齐。
    //   ② micro-timing:每个鼓点 ±~8ms 抖动(种子,非 Math.random)→ 人手的细微不齐。
    //   ③ velocity:gain ±~13% 起伏 → 力度有呼吸(clamp 防爆/防消失)。仅作用 perc(kick/snare/hihat),不碰旋律声部。
    var prng = mulberry32((spec.seed ^ 0x9e3779b9) >>> 0);
    var swingFrac = 0.08 + prng() * 0.08;                              // 反拍后移占八分音长的比例(8-16%,整曲恒定)
    function pHit(role, t, dur, gain, offbeat) {                       // 一个鼓点事件 + humanization(swing/jitter/velocity)
      var swing = offbeat ? (spb / 2) * swingFrac : 0;                 // 反拍 swing 后移(八分音网格)
      prng();                                                          // 原逐击 jitter 的消费位保留(弃值;保 velocity 流序=既有力度逐字节不变)
      // ★同刻鼓击共享微抖(端用户实听「冾冾双重」根因):原每击独立 ±8ms 抖动,同一拍上 kick(自带 4k 噪声 click)/
      //   snare(宽频噪声)/hihat(7k 噪声)被各自抖开 5~16ms → 两个尖锐噪声瞬态相隔≈flam 阈值=听成"双击"。
      //   真鼓手四肢同落=同刻转写为同一偏移:抖动改按【落点时刻】种子派生(同 t+swing → 同 jitter → 瞬态对齐融为一击;
      //   不同拍仍各有偏移=humanize 保留)。确定性:hashStr 种子、无 Math.random。
      var jitter = (mulberry32(hashStr('phj' + (t + swing).toFixed(4)))() * 2 - 1) * 0.008;
      var vel = gain * (1 + (prng() * 2 - 1) * 0.13);                  // velocity ±13%(力度起伏,仍逐击独立)
      var tt = t + swing + jitter; if (tt < 0) tt = 0;                // 绝不排进段前(负 t)
      return { role: role, freq: 0, t: tt, dur: dur, gain: vel, _gridT: t + swing };
    }
    var events = [], prog = spec.progression;
    // ── 组件四 乐句发展:全曲一个种子动机 → 经 phrasePlan 派生逐和弦音级序列(同动机贯穿 + 各段变形 = 作品一体性)。
    //   phraseSeed/rhythmSeed 各自独立种子流(不消费 lead 主 rng,守 L2);melody=none/无 lead 时种子动机为空、不影响。
    var seedMotif = hasLayer(spec, 'lead') ? seedMotifFor(spec, dna) : [];
    var phraseSeqs = developPhrase(dna.phrasePlan, seedMotif, prog.length, (spec.seed ^ 0x68e31da4 ^ segMix) >>> 0, seg);   // 折 segMix + 透传 seg:段间乐句发展(seg=0 → ^0 + legacy 分支 → 字节等价)
    // 组件三 arp swing:反拍(奇数步)后移 arpSwing 个**拍**(与 lead 同单位=拍,治"lead/arp 摇摆深度不齐");cap 不越下一步
    var arpSwing = SWING_FRAC[(dna.rhythm && dna.rhythm.swing)] != null ? SWING_FRAC[dna.rhythm.swing] : 0;
    // Eno 不可公约循环:seg>0 时 arp 音型按 3 段循环轮转(见上 arpCycle);seg0/无 arp → null → 主音型(字节恒等、向后兼容)。
    var arpRing = (hasLayer(spec, 'arp') && seg > 0) ? arpCycle(dna.arpPattern) : null;
    // Eno v2:bass 节奏型按 2 段循环轮转(period 2 ⊥ arp 3 = 真多层不可公约);seg0/无 → 主型(字节恒等)。bass 纯确定(无 seed),靠换 pattern 变。
    var bassRing = (hasLayer(spec, 'bass') && seg > 0) ? bassCycle((dna.rhythm && dna.rhythm.bassPattern) || 'block') : null;
    var chordDur = beatsPerChord * spb;   // 和弦段总时长(ci 不变量,供组件五 dynArc 算段内相对位置 x)
    var segDur = prog.length * beatsPerChord * spb;   // 整段(一次和弦进行循环)总时长(返回值,供 present-audio 段循环排定)
    var prevPadVoicing = null;   // A3 voice leading:pad 声部跨和弦的"上一次实际使用的八度归属"(段/曲开头=null=重置,ci=0 保根位置)
    for (var ci = 0; ci < prog.length; ci++) {
      var ct = ci * beatsPerChord * spb, notes = chordNotes(keyMidi, modeArr, deg(prog[ci]));
      var evStart = events.length;   // A2 dynArc:记录本和弦段events起点,段末统一后处理(见循环尾)——不逐个push site插桩,降低出错面
      // pad:整和弦持续铺底(padContour<0.2 = 旧行为字节恒等保"留白本性";≥0.2 = batch 3 在和弦半程切换根音→三/五度,长音不变碎)
      //   阈值 0.2:让 sacral 这类 padContour=0.1 的"极克制"预设保旧行为,sad/eerie/desolate 等 ≥0.3 才升级 → padContour 真实反映"克制 vs 活跃"光谱
      if (hasLayer(spec, 'pad')) {
        // A3(gameplay-expressiveness-plan.md §三 A3):**先 voiceLead 定八度、后 contour 换音**——padNotes 是本和弦
        //   voice-led 后的三个和弦音(音名集合与 notes 完全相同,只八度归属可能不同),batch 3 的换音分支在其基础上做
        //   (不改动 voiceLeadPad 本身的选择——contour 只替换某一位置的音,不影响其它位置已选定的八度)。
        //   prevPadVoicing 只跟踪"voice-led 后的基础三和弦"(不含 contour 换音结果)——两个变换正交:voice leading 只关心
        //   和弦到和弦的三和弦本身如何最省力移动,contour 换音是叠加在其上的独立音色/织体效果,不应互相污染对方状态。
        var padNotes = voiceLeadPad(notes, prevPadVoicing);
        var pc = (dna && typeof dna.padContour === 'number') ? dna.padContour : 0;
        var ppPlan = padPhasePlan(padNotes, pc, arrPhase, ci === prog.length - 1);
        for (var ppn = 0; ppn < ppPlan.length; ppn++) for (var ppi = 0; ppi < ppPlan[ppn].notes.length; ppi++) {
          events.push({ role: 'pad', freq: mtof(ppPlan[ppn].notes[ppi]), t: ct + ppPlan[ppn].at * spb, dur: ppPlan[ppn].dur * spb, gain: 0.10 });
        }
        prevPadVoicing = padNotes;   // 下一和弦的 voice leading 目标 = 本和弦 voice-led 后的三和弦(不含 phase 换色)
      }
      // drone:根音低八度长持续(氛围)。**有 bass 时再沉一个八度**(端用户实听「乐器双重」根因之二:
      //   drone 与 bass 根音同为 notes[0]-12=两条持续低音**完全同频**齐奏〔stealth/elegy 实测各 4/13 处〕;
      //   drone 沉到 bass 之下=管弦排布标准做法,同频双重消失、低频分层更清晰)。bass 的活跃与 seg 无关
      //   (登场表只延 arp/lead)→ 用 2 参 hasLayer 判定=整曲 drone 八度恒定、不会中途跳变。
      if (hasLayer(spec, 'drone')) events.push({ role: 'drone', freq: mtof(notes[0] - (hasLayer(spec, 'bass') ? 24 : 12)), t: ct, dur: beatsPerChord * spb, gain: 0.08 });
      // bass:默认只负责根基与脉冲；walking 是 jazz-noir/baroque 明确保留的 melodic 例外。
      // 所有候选先折回 G3 以下；力度统一退到 lead 基线附近，弱拍再让位。
      if (hasLayer(spec, 'bass')) {
        var bassMidi = bassFold(notes[0] - 12), lowerFifth = bassFold(notes[2] - 24);   // 用和弦真实五度（减五度调式也不被强改成调外纯五度）
        while (lowerFifth >= bassMidi) lowerFifth -= 12;   // 两音独立 fold 只保证 ≤G3；再锁“下方”，防 Bb2 根配出更高的 F3
        var lowThird = bassFold(notes[1] - 12), lowFifth = bassFold(notes[2] - 12);
        var bp = bassRing ? bassRing[seg % bassRing.length] : ((dna.rhythm && dna.rhythm.bassPattern) || 'block');
        if (bp === 'oompah') {
          for (var bo = 0; bo < beatsPerChord; bo++) { var bm = (bo % 2 === 0) ? bassMidi : lowerFifth; events.push({ role: 'bass', freq: mtof(bm), t: ct + bo * spb, dur: spb * 0.9, gain: bo % 2 === 0 ? 0.09 : 0.07 }); }
        } else if (bp === 'dotted') {
          for (var bd = 0; bd < beatsPerChord; bd++) { var on = (bd % 2 === 0); events.push({ role: 'bass', freq: mtof(bassMidi), t: ct + bd * spb, dur: on ? spb * 1.45 : spb * 0.5, gain: on ? 0.088 : 0.068 }); }
        } else if (bp === 'walking' || bp === 'walking-alt') {
          // 三击内保留和弦色彩，第四拍明确休止；alt 改变经过顺序而不跳出 melodic 族。
          var walk = bp === 'walking' ? [bassMidi, lowThird, lowFifth] : [bassMidi, lowFifth, lowThird];
          for (var bw = 0; bw < walk.length; bw++) events.push({ role: 'bass', freq: mtof(walk[bw]), t: ct + bw * spb, dur: spb * 0.72, gain: bw === 0 ? 0.10 : 0.082 });
        } else if (bp === 'pedal') {
          events.push({ role: 'bass', freq: mtof(bassMidi), t: ct, dur: spb * 3.4, gain: 0.088 });
          events.push({ role: 'bass', freq: mtof(bassMidi), t: ct + spb * 3.5, dur: spb * 0.45, gain: 0.065 });
        } else if (bp === 'pulse') {
          events.push({ role: 'bass', freq: mtof(bassMidi), t: ct, dur: spb * 0.72, gain: 0.09 });
          events.push({ role: 'bass', freq: mtof(lowerFifth), t: ct + spb * 2, dur: spb * 0.72, gain: 0.075 });
        } else if (bp === 'syncopated') {
          events.push({ role: 'bass', freq: mtof(bassMidi), t: ct, dur: spb * 1.0, gain: 0.09 });
          events.push({ role: 'bass', freq: mtof(bassMidi), t: ct + spb * 1.5, dur: spb * 0.5, gain: 0.07 });
          events.push({ role: 'bass', freq: mtof(bassMidi), t: ct + spb * 2.5, dur: spb * 0.5, gain: 0.068 });
        } else {
          for (var b = 0; b < beatsPerChord; b += 2) events.push({ role: 'bass', freq: mtof(bassMidi), t: ct + b * spb, dur: spb * 1.65, gain: b === 0 ? 0.09 : 0.072 });
        }
      }
      // arp:按曲风 DNA 生成琶音音型(组件二·设计稿 §3.1)+ 组件三 swing 反拍后移(离散档)——独立种子流,不消费 lead 主 rng(守 L2)。
      //   rate 决定每和弦步数(8/16),步均分该和弦时长(总长守恒);gate 决定 dur 占比;swing 把奇数步后移、clamp 不溢出。
      if (hasLayer(spec, 'arp')) {
        var arpSeed = (spec.seed ^ 0xc2b2ae35 ^ (ci << 8) ^ segMix) >>> 0;   // 折 segMix:random/randomWalk 音型段间也变(seg0 → ^0 恒等;arpSeq 自有独立流不消费 lead rng=守 L2)
        var arpPat = arpRing ? arpRing[seg % arpRing.length] : dna.arpPattern;   // Eno:seg>0 按 3 段循环轮转音型(seg%3);seg0/无 ring → 主音型(字节恒等)
        var aseq = arpSequence(notes, { pattern: arpPat, octaves: dna.arpOctaves, rate: dna.arpRate, gate: dna.arpGate, seed: arpSeed });
        var astep = (beatsPerChord * spb) / dna.arpRate;   // 每步时长(rate=8 → 八分音;rate=16 → 十六分音)
        for (var a = 0; a < aseq.length; a++) {
          var asw = (aseq[a].step % 2 === 1) ? Math.min(arpSwing * spb, astep * 0.49) : 0;   // 反拍后移 arpSwing 拍(=lead 同单位);cap astep*0.49 防越下一步(细分 arp 安全)
          var chordEnd = ct + beatsPerChord * spb;
          var at = ct + aseq[a].step * astep + asw; if (at > chordEnd) at = chordEnd;
          var adur = astep * dna.arpGate; if (at + adur > chordEnd) adur = chordEnd - at;   // 时值也 clamp(对齐 lead):swung 末步 + dur 不越和弦边界
          if (adur > 0) events.push({ role: 'arp', freq: mtof(aseq[a].midi), t: at, dur: adur, gain: 0.07 });
        }
      }
      // lead:消费乐句发展序列 phraseSeqs[ci](音级→在调内音高)+ 组件三 leadRhythm(时值池/LHL/swing,段总时长守恒)。
      //   none → phraseSeqs 段为空(seedMotif 空)→ 无 lead(守 N19);motif → seedMotif=数组、走发展(M6 新行为)。
      if (hasLayer(spec, 'lead')) {
        var mel = phraseSeqs[ci] || [];
        if (mel.length) {
          var rhythmSeed = (spec.seed ^ 0x1b56c4e9 ^ (ci << 8) ^ segMix) >>> 0;   // 折 segMix:段间节奏面貌也变(seg=0 → ^0 → 字节等价)
          var rh = leadRhythm(mel.length, beatsPerChord, spb, dna, rhythmSeed);
          // mi < rh.length(非 mel.length):rh 可短于音级数(音多到放不下→作休止,leadRhythm 截断)→ 越界则尾音作休止,不读 undefined。
          //   对现状/seg0 等价:旧旋律 ≤9 音 ≤16 槽 → rh.length===mel.length(此改对 HEAD 字节不变);仅防宽算子池长动机溢出崩(audio-arrange-design §五 P0)。
          for (var mi = 0; mi < rh.length; mi++) events.push({ role: 'lead', freq: mtof(scaleNote(keyMidi, modeArr, mel[mi])), t: ct + rh[mi].t, dur: rh[mi].dur, gain: 0.09 });
        }
      }
      // perc:euclid 节奏鼓点(kick 1/3 拍、snare 2/4、hihat 八分);role 区分 kind 供合成器选音色。
      //   全部经 pHit() humanize:正拍(kick/snare/正拍 hihat)只抖动+力度;反拍 hihat(pt+spb/2)额外 swing 后移。
      //   〔C1 鼓组节奏型族已回滚 2026-07-03:曾按曲风分派 march/four-on-floor/ride-swing/sixteenth-chase 鼓型+4 段环 fill——
      //   端用户实听三报「鼓声双重」后裁决回退,恢复本行批前原版;pHit 的「同刻鼓击共享微抖」修复独立保留(治假 flam)。〕
      if (hasLayer(spec, 'perc')) for (var pp = 0; pp < beatsPerChord; pp++) { var pt = ct + pp * spb; if (pp % 2 === 0) events.push(pHit('kick', pt, 0.28, 0.5, false)); if (pp === 1 || pp === 3) events.push(pHit('snare', pt, 0.18, 0.3, false)); events.push(pHit('hihat', pt, 0.05, 0.18, false)); events.push(pHit('hihat', pt + spb / 2, 0.05, 0.16, true)); }
      // 组件五 dynArc(A2):本和弦段内刚推入的 pad/bass/arp/lead 事件统一后处理乘力度弧因子(drone/perc 不碰,见上方注释)。
      //   只改 gain,不碰 t/dur/freq/role → 音高/时序/事件数零影响;role 判定按事件自身 role 字段(与推入顺序/分支无关,覆盖全部声部形态)。
      var dynRole = dynArcRoleFor(dna.phrasePlan, ci);
      for (var dyi = evStart; dyi < events.length; dyi++) {
        var dyr = events[dyi].role;
        if (dyr === 'pad' || dyr === 'bass' || dyr === 'arp' || dyr === 'lead') {
          // bass 是根基而非第二主线：只取通用 dynArc 的 40%（默认 ±6%），lead/arp/pad 仍保原 ±15%。
          var dynAmp = dyr === 'bass' ? dna.dynArc * 0.4 : dna.dynArc;
          events[dyi].gain = events[dyi].gain * dynArcMul(events[dyi].t, events[dyi].dur, ct, chordDur, dynRole, dynAmp);
        }
      }
    }
    events = applyArrangementPhase(events, spec, seg, arrPhase, chordDur, segDur);
    return { events: events, segDur: segDur, spec: spec };
  }

  // ── 预设(few-shot 锚点 + 兜底;**绝非唯一选项**,AI 可自由给任意 spec)── 见 §6 ──
  //    两个维度:mood 5(calm/tense/eerie/heroic/sad)+ 题材/风格 8(v12 扩容——showcase 实测模型把 5 个 mood
  //    全用上、整局气质仍单一:池子缺的是风格轴)。差异靠 调式×速度×编制×律动 拉开;选乐速查表见
  //    references/audio-system.md;音色质变(ADSR/鼓机)在编曲后半 backlog。
  var PRESET = {
    calm:   { mode: 'major', key: 'C', tempo: 72, feel: ['calm', 'warm'], progression: ['I', 'V', 'vi', 'IV'], instruments: ['pad', 'bass', 'arp'], melody: 'sparse' },
    // tense/heroic 补显式 intensity(v12 修自家 fail-silent:声明了 perc 但默认 intensity 0.6 < 鼓门槛 0.7 → 鼓永远不响=预设里的死数据)
    tense:  { mode: 'minor', key: 'A', tempo: 120, feel: ['tense'], progression: ['i', 'VI', 'III', 'VII'], instruments: ['pad', 'bass', 'arp', 'perc'], melody: 'sparse', intensity: 0.75 },
    eerie:  { mode: 'wholetone', key: 'D', tempo: 60, feel: ['eerie'], progression: ['I', 'II', 'I', 'III'], instruments: ['pad', 'arp'], melody: 'sparse', timbre: { pad: 'air' } },
    heroic: { mode: 'major', key: 'G', tempo: 124, feel: ['heroic'], progression: ['I', 'IV', 'V', 'I'], instruments: ['pad', 'bass', 'arp', 'perc', 'lead'], melody: 'flowing', intensity: 0.8, timbre: { lead: 'brass' } },
    sad:    { mode: 'minor', key: 'E', tempo: 64, feel: ['sad'], progression: ['i', 'iv', 'VI', 'V'], instruments: ['pad', 'bass'], melody: 'sparse' },
    pastoral: { mode: 'lydian',     key: 'F', tempo: 84,  feel: ['bright', 'open'],  progression: ['I', 'II', 'I', 'V'],   instruments: ['pad', 'arp', 'lead'],          melody: 'flowing', intensity: 0.6, timbre: { pad: 'strings' } },
    sacral:   { mode: 'major',      key: 'C', tempo: 46,  feel: ['solemn'],          progression: ['I', 'IV', 'I', 'V'],   instruments: ['pad', 'bass'],                 melody: 'sparse', timbre: { pad: 'organ' } },
    battle:   { mode: 'phrygian',   key: 'E', tempo: 140, feel: ['driving'],         progression: ['i', 'II', 'i', 'v'],   instruments: ['bass', 'perc', 'lead', 'pad'], melody: 'flowing', intensity: 0.85, timbre: { lead: 'pulse' } },
    mystery:  { mode: 'dorian',     key: 'D', tempo: 92,  feel: ['curious'],         progression: ['i', 'IV', 'i', 'VII'], instruments: ['pad', 'bass', 'arp'],          melody: 'sparse', timbre: { arp: 'harp' } },
    festive:  { mode: 'mixolydian', key: 'G', tempo: 132, feel: ['joyful'],          progression: ['I', 'VII', 'IV', 'I'], instruments: ['bass', 'arp', 'lead', 'perc'], melody: 'flowing', intensity: 0.8, timbre: { lead: 'pulse' } },
    desolate: { mode: 'minor',      key: 'D', tempo: 50,  feel: ['empty', 'vast'],   progression: ['i', 'VI', 'i', 'v'],   instruments: ['pad'],                         melody: 'sparse', timbre: { pad: 'air' } },
    eastern:  { mode: 'pentatonic', key: 'D', tempo: 76,  feel: ['serene'],          progression: ['I', 'V', 'I', 'IV'],   instruments: ['arp', 'lead', 'pad'],          melody: 'flowing', intensity: 0.6, timbre: { arp: 'pluck', lead: 'pluck', pad: 'air' } },
    lullaby:  { mode: 'major',      key: 'A', tempo: 56,  feel: ['gentle'],          progression: ['I', 'vi', 'IV', 'V'],  instruments: ['pad', 'arp'],                  melody: 'sparse', timbre: { arp: 'bell' } },
    // v15 题材/风格扩容(av-diversity-signoff 一·音乐曲风,收 9):mode/key/roman/timbre 全在现有常量表内,纯数据加法、零函数改动。
    synthwave:   { mode: 'minor', key: 'G#', tempo: 128, feel: ['driving', 'retro'], progression: ['i', 'III', 'VI', 'VII'], instruments: ['pad', 'bass', 'arp', 'perc', 'lead'], melody: 'flowing', intensity: 0.8, timbre: { lead: 'pulse', pad: 'warm' } },
    'jazz-noir': { mode: 'minor', key: 'A', tempo: 84, feel: ['smoky', 'noir'], progression: ['i', 'ii', 'v', 'i'], instruments: ['pad', 'bass', 'arp', 'lead', 'perc'], melody: 'flowing', intensity: 0.7, timbre: { lead: 'brass', pad: 'warm', arp: 'bell' } },
    march:       { mode: 'major', key: 'Bb', tempo: 120, feel: ['martial'], progression: ['I', 'IV', 'I', 'V'], instruments: ['pad', 'bass', 'perc', 'lead'], melody: 'flowing', intensity: 0.8, timbre: { lead: 'brass' } },
    chase:       { mode: 'minor', key: 'C', tempo: 168, feel: ['chase', 'driving', 'urgent'], progression: ['i', 'VII', 'VI', 'v'], instruments: ['arp', 'bass', 'perc', 'lead', 'pad'], melody: 'sparse', intensity: 0.9, timbre: { lead: 'brass' } },
    romance:     { mode: 'major', key: 'F', tempo: 68, feel: ['warm', 'tender'], progression: ['I', 'IV', 'V', 'vi'], instruments: ['pad', 'bass', 'arp', 'lead'], melody: 'flowing', intensity: 0.6, timbre: { pad: 'strings', lead: 'soft' } },
    scherzo:     { mode: 'major', key: 'D', tempo: 152, feel: ['playful', 'mischief'], progression: ['I', 'V', 'vi', 'iii'], instruments: ['pad', 'bass', 'arp', 'perc'], melody: 'sparse', intensity: 0.75, timbre: { arp: 'pluck' } },
    stealth:     { mode: 'phrygian', key: 'E', tempo: 58, feel: ['sneaking', 'tense'], progression: ['i', 'II', 'i', 'II'], instruments: ['drone', 'pad', 'bass'], melody: 'none', timbre: { pad: 'air' } },
    elegy:       { mode: 'minor', key: 'C', tempo: 48, feel: ['mourning', 'grief'], progression: ['i', 'VI', 'iv', 'V'], instruments: ['pad', 'drone', 'bass', 'lead'], melody: 'motif:[4,3,2,0]', intensity: 0.6, timbre: { pad: 'organ' } },
    baroque:     { mode: 'major', key: 'D', tempo: 108, feel: ['ornate', 'driving'], progression: ['vi', 'ii', 'V', 'I'], instruments: ['pad', 'bass', 'arp', 'lead'], melody: 'flowing', intensity: 0.7, timbre: { pad: 'organ', arp: 'pluck', lead: 'harp' } }
  };
  var FALLBACK = 'calm';   // 未知预设名 / 无法解析 → 回退中性(不静默无声,延续"轻量≠沉默")
  var warnedPreset = {};   // 未知预设 warn-once 账本(同 present-audio warnedPal 先例,防每帧渲染刷屏)
  var warnedTimbreRole = {};   // A3 fail-loud:timbre 指向 instruments 外的声部 warn-once(防逐段刷屏)
  function shallowClone(o) { var c = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) c[k] = o[k]; return c; }
  // C16(showcase 前瞻审计):未知预设 warn-once。原仅【字符串】路径 warn、对象 {preset:'typo'} 路径静默回退兜底曲
  //   = fail-silent 不对称(typo 不该无声变曲风)。两路径共用此助手 → 对称 fail-loud(对齐 art/timbre/string-music 先例)。
  function warnUnknownPreset(name) {
    if (!PRESET[name] && !warnedPreset[name]) {
      warnedPreset[name] = 1;
      if (typeof console !== 'undefined' && console.warn) console.warn('[amatlas] audio.music 未知预设 "' + name + '"(可选:' + Object.keys(PRESET).join('/') + ')→ 用默认。');
    }
  }
  // string|MusicSpec → 原始 spec 对象(交 composeMusic 的 normalizeSpec 规范化/补默认)。
  // 三形态:string=预设名(未知→warn-once+FALLBACK,对齐 art/timbre 先例:typo 不该无声变兜底曲风);对象带 preset=取该预设为基底再覆盖;完整/部分对象=原样。
  function resolveMusic(music) {
    if (typeof music === 'string') {
      warnUnknownPreset(music);
      return shallowClone(PRESET[music] || PRESET[FALLBACK]);
    }
    if (music && typeof music === 'object') {
      if (music.preset != null) {
        warnUnknownPreset(music.preset);          // C16:对象形 {preset:'typo'} 也 warn-once(原静默回退兜底=fail-silent)
        var out = shallowClone(PRESET[music.preset] || PRESET[FALLBACK]);
        for (var k in music) if (k !== 'preset' && Object.prototype.hasOwnProperty.call(music, k)) out[k] = music[k];
        return out;
      }
      return music;                              // 完整/部分对象 → normalizeSpec 补默认
    }
    // R2 二轮:unknown 预设名会 warn(上),但布尔/数字/其它基本类型此前静默回退默认曲(fail-silent 不对称)。非 null 基本类型 warn-once。
    if (music != null && !resolveMusic._warnedType && typeof console !== 'undefined' && console.warn) {
      resolveMusic._warnedType = true;
      console.warn('composeMusic/resolveMusic: audio.music 应为预设名(字符串)或 MusicSpec(对象),收到 ' + typeof music + ' → 回退默认曲');
    }
    return shallowClone(PRESET[FALLBACK]);        // null/其它 → 兜底中性
  }

  return {
    composeMusic: composeMusic,
    resolveMusic: resolveMusic,
    normalizeSpec: normalizeSpec,   // 暴露供测试/复用
    PRESET: PRESET, MODES: MODES, KEYS: KEYS,
    _scaleNote: scaleNote, _chordNotes: chordNotes, _mtof: mtof,   // 测试辅助
    // 旋律多变性 第一批:暴露纯函数/常量供测试(组件二 arp + 组件一 contour)
    _deriveGenreDNA: deriveGenreDNA, _arpSequence: arpSequence, _contourMelody: contourMelody,
    _ARP_PATTERNS: ARP_PATTERNS, _CONTOURS: CONTOURS, _arpCycle: arpCycle, _bassCycle: bassCycle,
    // 旋律多变性 第二批:暴露纯函数/常量供测试(组件四 phrase + 组件三 rhythm)
    _MOTIF_OPS: MOTIF_OPS, _developPhrase: developPhrase, _seedMotifFor: seedMotifFor,
    _leadRhythm: leadRhythm, _DUR_POOL: DUR_POOL, _SWING_FRAC: SWING_FRAC, _GENRE_DNA: GENRE_DNA,
    // 音乐 overhaul 批 B:外层四段 arrangement arc（内部测试面，非作者契约）
    _ARR_PHASES: ARR_PHASES, _ARR_DYNAMIC: ARR_DYNAMIC, _ARR_STATIC: ARR_STATIC,
    _arrangementPhase: arrangementPhase, _applyArrangementPhase: applyArrangementPhase, _padPhasePlan: padPhasePlan,
    // A2:暴露纯函数/常量供测试(组件五 力度弧 dynArc)
    _dynArcFactor: dynArcFactor, _dynArcRoleFor: dynArcRoleFor, _dynArcMul: dynArcMul,
    _DYNARC_LO: DYNARC_LO, _DYNARC_HI: DYNARC_HI, _PLAN_ROLES: PLAN_ROLES,
    // A3:暴露纯函数供测试(pad 最小移动八度归属 voice leading)
    _voiceLeadPad: voiceLeadPad,
    _DNA_BASE: DNA_BASE,   // 测试用:反向变异验牙需要直接改 dynArc 振幅常量(同 _GENRE_DNA 先例,非作者可见字段)
    // A4:暴露纯函数/常量供测试(和声终止式)
    _applyCadenceEnding: applyCadenceEnding, _cadenceDegrees: cadenceDegrees, _CADENCE_TYPE: CADENCE_TYPE,
    _DEFAULT_PROG: DEFAULT_PROG,   // 测试用:反向变异验牙需要读取"关掉终止式"时的原始度数基线
    _hasLayer: hasLayer,
    _LAYER_GATE: LAYER_GATE
  };
});
