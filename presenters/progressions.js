/* ════════════════════════════════════════════════════════════════════════
   Amatlas BGM 命名和弦库 (PROGRESSIONS) — batch 5(2026-07,音乐②更多曲风预设)
   ════════════════════════════════════════════════════════════════════════
   诗意名和弦走向 — 让**不懂乐理**的作者凭"感觉+场景"就能挑:
       audio: { music: { preset:'sad', progression:'lament' } }   // 直接写名字
       audio: { music: { progression:['vi','IV','I','V'] } }       // escape hatch 罗马数字
   两种写法等效;命名是数组的别名(§11 不锚定创意);命名拼错 fail-loud(§9 命名接缝防御)。
   懂乐理或要精确 → 用 MIDI 路径(audio.music.midi base64)。

   数据结构:
     name → { pattern: 罗马数组, modeHint: 设计意图调式, family: 情绪族, feel: 一句话气质 }
   batch 4 的 6 个情绪族(每族 2-3 条变异,共 18 条):
     sorrow(哀伤) / tension(紧张) / epic(史诗) / warmth(抒情温暖) / mystery(神秘恐怖) / playful(轻快活泼)
   batch 5 新增 2 个族(缺口分析见下,§设计依据):
     exotic(异域调式色彩:dorian/lydian/mixolydian/wholetone/pentatonic 五种非常规 mode,batch4 全 18 条
       modeHint 分布 major×11/minor×6/phrygian×1、这 5 个合法 mode 零覆盖——作者想要"民谣/梦幻/异域/仪式"
       等调式色彩时,库里没有对应命名,只能自己手写罗马数字) /
     groove(曲风化小调进行:GENRE_DNA/TONE_MAP 已有 jazz-noir/chase 等曲风词汇且各自在 PRESET 里内联了
       进行,但库里没有同名可复用条目——补上把这两个已验证的曲风进行升格为可复用命名)

   modeHint 是**设计意图**(典型 mode),作者用其他 mode = 借用调(modal interchange)=
   合法艺术手法,引擎 warn-once 提示"借用调,有意?",**不抛**(§11 不锚定创意)。

   batch 5 只用现有 ROMAN 七个自然音级度数(I-VII,大小写不影响性质)——不引入变化音前缀(b/#),
   与 batch 4 A1(eerie bIII→III)同一约束一脉相承(见 §3.1 度数制 vs 变化音记谱制的等价说明)。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else { var _m = factory(), _A = (global.Amatlas = global.Amatlas || {}); _A.PROGRESSIONS = _m.PROGRESSIONS; _A.resolveProgression = _m.resolveProgression; _A.checkProgressionMode = _m.checkProgressionMode; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PROGRESSIONS = {
    // ━━━ 哀伤族(sorrow)━━━
    'lament':        { pattern: ['vi','IV','I','V'],     modeHint: 'major',    family: 'sorrow',   feel: '降落如枯叶,悼念逝去的温暖' },
    'introspection': { pattern: ['i','VII','VI','VII'],  modeHint: 'minor',    family: 'sorrow',   feel: '在暗中徘徊,寻找那盏灯' },
    'tearful':       { pattern: ['i','III','VI','VII'],  modeHint: 'minor',    family: 'sorrow',   feel: '哭泣时的每一个字都无法完整' },

    // ━━━ 紧张族(tension)━━━
    'conflict':      { pattern: ['i','V','i','V'],       modeHint: 'minor',    family: 'tension',  feel: '两股力量在体内扭打,无法和解' },
    'dread':         { pattern: ['i','II','i','II'],     modeHint: 'phrygian', family: 'tension',  feel: '黑暗里有东西在靠近,呼吸声越来越清晰' },
    'oppression':    { pattern: ['vi','IV','vi','IV'],   modeHint: 'major',    family: 'tension',  feel: '天空压得很低,每一步都很沉重' },

    // ━━━ 史诗族(epic)━━━
    'heroic':        { pattern: ['I','V','vi','IV'],     modeHint: 'major',    family: 'epic',     feel: '长剑挥起,天地为之倾斜' },
    'triumph':       { pattern: ['I','IV','V','I'],      modeHint: 'major',    family: 'epic',     feel: '艰辛过后,终于可以停下来呼吸' },
    'solemn':        { pattern: ['I','vi','IV','V'],     modeHint: 'major',    family: 'epic',     feel: '宝座前,一切声音都要屏住呼吸' },

    // ━━━ 抒情温暖族(warmth)━━━
    'romance':       { pattern: ['I','vi','IV','V'],     modeHint: 'major',    family: 'warmth',   feel: '眼神相接,整个世界都软化了' },
    'tender':        { pattern: ['I','IV','I','V'],      modeHint: 'major',    family: 'warmth',   feel: '多年后还能记得你轻声的笑' },
    'lullaby':       { pattern: ['IV','I','IV','I'],     modeHint: 'major',    family: 'warmth',   feel: '妈妈的歌声,让所有害怕都变小了' },

    // ━━━ 神秘恐怖族(mystery)━━━
    // A1 修复:原 'bIII' 撞校验(ROMAN 表只认七个自然音级罗马数字,见下方 resolveProgression)→ 该预设从未成功发声过。
    //   本引擎罗马数字是**度数制**(性质从 mode 音阶推导,非传统调性和声制)——自然小调(minor)的 III 度三和弦,
    //   就是从音阶第 3 个音起算取 1/3/5 度(chordNotes),音响上**正是**传统记谱法里那个"降三级大三和弦"(bIII,
    //   如 C 自然小调 III = Eb 大三和弦)。所以 'III'(度数制)与 'bIII'(调性制记谱)在 modeHint:minor 下**音响完全等价**,
    //   写 'III' 是零音响损失的等价数据修,不是改设计意图。
    'eerie':         { pattern: ['i','III','VII','i'],   modeHint: 'minor',    family: 'mystery',  feel: '万物都长出了不该有的角度' },
    'void':          { pattern: ['vi','IV','vi','IV'],   modeHint: 'major',    family: 'mystery',  feel: '房间很大,只有风声,没有回音' },
    'descent':       { pattern: ['i','VI','III','VII'],  modeHint: 'minor',    family: 'mystery',  feel: '峡谷深处有光芒,但越往下温度越冷' },

    // ━━━ 轻快活泼族(playful)━━━
    'festive':       { pattern: ['I','IV','I','IV'],     modeHint: 'major',    family: 'playful',  feel: '太阳在头顶,大家唱同一首歌' },
    'mischief':      { pattern: ['I','ii','V','I'],      modeHint: 'major',    family: 'playful',  feel: '计划中的意外,装出来的无辜' },
    'dance':         { pattern: ['V','I','V','I'],       modeHint: 'major',    family: 'playful',  feel: '节拍就是心跳,无法停下的靠近' },

    // ━━━ 异域调式族(exotic,batch 5 新增)━━━
    // 5 条覆盖 batch4 零命中的 dorian/lydian/mixolydian/wholetone/pentatonic;每条用该 mode 音阶自身
    // 最具辨识度的度数关系(见下方各条出处),不是把 major/minor 的套路强行搬过去配色。
    // 出处(可查证的经典乐理概念,非杜撰):
    'groove':        { pattern: ['i','IV','i','IV'],     modeHint: 'dorian',      family: 'exotic',   feel: '小调的忧郁里透出一点不肯下沉的亮色' },
    // ↑ Dorian vamp(i-IV 反复):dorian 音阶的 IV 级是大三和弦(自然小调同位置是小三和弦)——这个"提亮的
    //   第六音"正是 dorian 区别于自然小调的标志性色彩。教科书级用例:Miles Davis "So What"、民谣
    //   "Scarborough Fair"、披头士 "Eleanor Rigby" 均以 i-IV dorian vamp 为骨架(Berklee/爵士乐理教材通用案例)。
    'wonder':        { pattern: ['I','II','I','V'],      modeHint: 'lydian',      family: 'exotic',   feel: '像是踩在半空的云上,一切都轻盈又不真实' },
    // ↑ Lydian 标志性和声是 I-II(大三和弦到大三和弦、根音全音上行):lydian 音阶的升四级让 II 级三和弦
    //   也是大三和弦(自然大调同位置是小三和弦 ii),这个"意外的大三和弦"就是 lydian "漂浮/梦幻感"的来源。
    //   经典参照:约翰·威廉斯配乐、《木偶剧场》主题曲一类"惊奇/悬浮"氛围乐常见的 lydian I-II 进行。
    'wayfarer':      { pattern: ['I','VII','IV','I'],    modeHint: 'mixolydian',  family: 'exotic',   feel: '尘土飞扬的路上,吉他和靴子踩着同一个节拍' },
    // ↑ Mixolydian 标志性和声是 I-bVII(度数制写作 VII,自然大三和弦、根音全音下行到主音):自然大调
    //   同位置的 vii 是减三和弦,mixolydian 的 VII 是大三和弦——这个"降 7 音大三和弦"是摇滚/民谣里
    //   "I-bVII-IV-I" vamp 的根基(如 "Sweet Home Alabama"、Grateful Dead 一类 jam-band 常用进行)。
    'otherworldly':  { pattern: ['I','III','I','V'],     modeHint: 'wholetone',   family: 'exotic',   feel: '所有的边界都模糊了,分不清是梦境还是清醒' },
    // ↑ Wholetone 音阶全由全音构成,任意三度叠加都得到增三和弦(无大小三和弦的稳定感)——这正是德彪西
    //   用全音阶制造"漂浮无重力/超现实"色彩的经典手法(印象派乐理的标准案例,增三和弦=wholetone 的本质)。
    'ritual':        { pattern: ['I','IV','I','V'],      modeHint: 'pentatonic', family: 'exotic',   feel: '古老的调子,像是从很久以前的篝火旁传下来的' },
    // ↑ Pentatonic(五声音阶)缺三度叠置的功能和声骨架,三音叠加出的是开放/含混的音响(非传统大小三和弦)——
    //   这种"去功能化"的开放感正是五声音阶在世界各地民谣/仪式音乐里长期被用来营造"古老/质朴"氛围的原因。
    //   度数沿用引擎既有 DEFAULT_PROG.pentatonic(I,V,I,IV)同款安全度数,只调整顺序适配"仪式"的循环感。

    // ━━━ 曲风化族(groove,batch 5 新增)━━━
    // 2 条把已在 GENRE_DNA/TONE_MAP/PRESET 里存在、但只能通过对应 preset 间接拿到的曲风进行,
    // 升格为可独立复用的命名条目(作者不挂 preset、只想要该曲风的和声骨架时可直接引用)。
    'smoky-blues':   { pattern: ['i','ii','v','i'],      modeHint: 'minor',      family: 'groove',   feel: '烟雾缭绕的酒吧里,萨克斯风在低语一个秘密' },
    // ↑ 与既有 PRESET.jazz-noir 的 progression 逐字节相同(compose-music.js:907)——爵士 minor ii-V-i
    //   缩略进行(engine 度数制下 ii 是自然小调音阶推出的减三和弦,与 jazz-noir 预设已验证的听感一致,
    //   非新造和声;只是把它从"只能靠 preset 拿到"升格为可独立命名引用)。
    'pursuit':       { pattern: ['i','VII','VI','v'],    modeHint: 'minor',      family: 'groove',   feel: '身后的脚步声越来越近,心跳快过了鼓点' },
    // ↑ 与既有 PRESET.chase 的 progression 逐字节相同(compose-music.js:909)——小调下行进行(i-VII-VI-v,
    //   根音级进下行制造"步步紧逼"的驱动感,追逐/紧张场景配乐常见手法),同上升格为独立命名条目。
  };

  // 解析层:把 progression 字段从字符串名展开为罗马数组(数组直通)。
  //   命名拼错 → throw(fail-loud over fail-silent,§9 命名接缝防御);非法形态 → throw。
  function resolveProgression(prog) {
    if (prog == null) return null;                            // null/undefined → 让上游走 DEFAULT_PROG
    if (Array.isArray(prog)) return prog;                     // 罗马数组 → 透传
    if (typeof prog === 'string') {
      var entry = PROGRESSIONS[prog];
      if (!entry) {
        throw new Error(
          '[amatlas] audio.music progression 未知命名: "' + prog + '" → 已知:' +
          Object.keys(PROGRESSIONS).join('/') + ';或直接传罗马数组如 [\'i\',\'VI\',\'iv\',\'V\']。'
        );
      }
      return entry.pattern.slice();                           // 解引用 防作者改了源数据污染表
    }
    throw new Error('[amatlas] audio.music progression 必须是命名字符串或罗马数组,收到 ' + (typeof prog));
  }

  // 借用调 warn-once(modeHint 与实际 mode 不符 = modal interchange = 合法艺术手法,提示但不抛)。
  //   罗马数组直传(无 progName)→ 不查;无 modeHint → 不查;名匹配 mode → 不报。
  var _modeWarnSeen = Object.create(null);
  function checkProgressionMode(progName, actualMode) {
    if (typeof progName !== 'string') return;
    var entry = PROGRESSIONS[progName];
    if (!entry || !entry.modeHint) return;
    if (entry.modeHint === actualMode) return;
    var key = progName + '/' + actualMode;
    if (_modeWarnSeen[key]) return;
    _modeWarnSeen[key] = 1;
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[amatlas] audio.music progression "' + progName + '" 设计意图为 ' + entry.modeHint +
        ',实际用了 ' + actualMode + '(借用调 modal interchange,合法艺术手法,有意?)');
    }
  }

  return { PROGRESSIONS: PROGRESSIONS, resolveProgression: resolveProgression, checkProgressionMode: checkProgressionMode };
});
