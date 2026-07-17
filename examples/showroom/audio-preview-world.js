/* Amatlas Showroom · 通用 Audio Workbench 世界数据
   这份脚本导出真实 {start,maps} world,让构建准入门/graph-audit 能像普通游戏一样检查本试听页。
   正式页只展示公共 audio 意图;_scratch 里的实验台只作历史参考,不直接搬运。 */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.AUDIO_PREVIEW_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function item(id, name, kind, audio, note, code) { return { id: id, name: name, kind: kind, audio: audio, note: note, code: code }; }
  function musicSpec(preset, extra) { var out = { preset: preset }; for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k]; return out; }

  var MIDI = {
    flute: 'TVRoZAAAAAYAAAABAeBNVHJrAAAAMgD/UQMHoSAAwEgAkDxgg2CAPAAAkEBcg2CAQAAAkENgg2CAQwAAkEhah0CASAAA/y8A',
    brassBass: 'TVRoZAAAAAYAAQADAeBNVHJrAAAACwD/UQMGihsA/y8ATVRyawAAAC8AwDgAsApQAJBDZINggEMAAJBIZINggEgAAJBKZINggEoAAJBPZIdAgE8AAP8vAE1UcmsAAAAmAMEhALEKMACRJFqHQIEkAACRK1qHQIErAACRKVqHQIEpAAD/LwA=',
    kalimbaDrums: 'TVRoZAAAAAYAAAABAeBNVHJrAAAASQD/UQMGGoAAwGwAkEhagXCASAAAmSRkeIkkAHiZKkY8iSoAPJBMVoFwgEwAAJkmWniJJgB4mS5GPIkuADyQT1iDYIBPAAD/LwA='
  };
  var midiDemos = [
    { id: 'midi-flute', label: '笛声短句', midi: MIDI.flute, note: 'GM 长笛单旋律,证明 MIDI 路径能接到 lead/flute 音色。' },
    { id: 'midi-brass-bass', label: '铜管 + 低音', midi: MIDI.brassBass, note: 'format 1 多轨:铜管旋律 + 低音声部 + pan,展示 MIDI 编曲可超出程序预设。' },
    { id: 'midi-kalimba-drums', label: '卡林巴 + 鼓', midi: MIDI.kalimbaDrums, note: '卡林巴旋律叠 GM 鼓轨,展示 MIDI 的打击乐与特殊音色折表。' }
  ];

  var musicPresets = [
    ['calm', '平静', '平静、安全、整理线索。'], ['tense', '紧张', '追问、倒计时、危险临近。'], ['eerie', '诡异', '未知、梦境、不可名状。'],
    ['heroic', '英雄', '开阔、胜利、正向推进。'], ['sad', '哀伤', '失落、告别、失败余韵。'], ['pastoral', '田园', '明亮开阔,适合田野、村庄、清晨。'],
    ['sacral', '神圣', '教堂、仪式、庄严留白。'], ['battle', '战斗', '高压冲突、Boss 前奏。'], ['mystery', '谜团', '侦探、机关、秘密房间。'],
    ['festive', '节庆', '市集、庆典、轻松热闹。'], ['desolate', '空旷', '废土、遗迹、无人之地。'], ['eastern', '东方', '五声音阶、旅馆、神社或东方奇幻。'],
    ['lullaby', '摇篮曲', '温柔、回忆、虚假的安宁。'], ['synthwave', '合成波', '霓虹、赛博、夜路疾行。'], ['jazz-noir', '黑色爵士', '雨夜、烟雾、侦探独白。'],
    ['march', '进行曲', '队伍、军势、仪仗。'], ['chase', '追逐', '奔跑、追赶、时间压力。'], ['romance', '浪漫', '柔软、告白、温暖场景。'],
    ['scherzo', '谐谑', '轻快、恶作剧、小机关。'], ['stealth', '潜行', '潜行、躲避、屏息。'], ['elegy', '挽歌', '悼念、牺牲、终章。'],
    ['baroque', '巴洛克', '华丽、宫廷、机械钟表。']
  ];
  var ambientPresets = [
    ['wind', '风', '连续阵风,适合高地、窗缝。'], ['waves', '海浪', '远浪低吼 + 近浪拍碎。'], ['rain', '雨', '雨体 + 细密雨滴。'], ['storm', '暴风', '重雨、怒风、次低吼。'],
    ['forest', '森林', '树叶风声 + 稀疏鸟鸣。'], ['stream', '溪流', '潺潺流水与碎沫。'], ['night', '夜晚', '低暗涌动 + 虫鸣。'], ['campfire', '营火', '火焰 rumble + 火花。'],
    ['town', '城镇', '远处人群与低嗡鸣。'], ['cave', '洞穴', '低频洞穴氛围 + 滴水。'], ['snow', '雪', '细微飘雪 + 闷风。'], ['tavern', '酒馆', '暖 murmur + 壁炉噼啪。'],
    ['underwater', '水下', '闷水压 + 气泡。'], ['heartbeat', '心跳', '低频 lub-dub 恐惧脉冲。'], ['ambient-unease', '不安', '不协和 drone + 心跳 + 稀疏刺点。']
  ];
  var sfxPresets = [
    ['success', '成功', '检定成功、机关打开。'], ['fail', '失败', '检定失败、资源不足。'], ['dice-roll', '掷骰', '跑团检定前反馈。'], ['pickup', '拾取', '拿到物品、证据入手。'],
    ['click', '点击', '按钮、切换、轻确认。'], ['door', '门', '开门、暗门、关卡切换。'], ['impact', '冲击', '撞击、坠落、重物。'], ['magic', '魔法', '仪式、法术、异常现象。'],
    ['birds', '鸟', '短促鸟鸣,也可配 forest。'], ['thunder', '雷', '雷声、惊吓前兆。'], ['horror-sting', '惊吓', '经典 jump-scare 尖啸。'], ['flesh-tear', '撕裂', '血肉、裂口、黏腻恐怖。'],
    ['horror-stab', '刺击', '短促重击。'], ['horror-braam', '低吼', '沉重低频惊吓。'], ['horror-screech', '尖啸', '刺耳贴脸杀。'], ['horror-shriek', '尖叫', '更亮、更人声化的惊吓。']
  ];

  var presetItems = musicPresets.map(function (p) {
    return item('music-' + p[0].replace(/[^a-z0-9]+/g, '-'), p[1] + ' ' + p[0], 'music preset', { music: p[0], ambient: false }, p[2], "audio: { music: '" + p[0] + "', ambient: false }");
  });

  var groups = [
    { id: 'music-preset', label: '预设', title: 'audio.music · 快速预设', note: '最安全的作者入口:直接写预设名,下游 AI 不需要懂乐理也能选对气质。', items: presetItems },
    { id: 'music-spec', label: '配方', title: 'MusicSpec · 可复制配方', note: '同一公共 music 字段的对象形态:调式、速度、和弦、声部、旋律、音色全在现有契约内。', items: [
      item('spec-noir-rain', '黑色爵士配方', 'MusicSpec', { music: musicSpec('jazz-noir', { key: 'A', mode: 'minor', tempo: 84, progression: 'romance', instruments: ['pad','bass','lead','perc'], melody: 'flowing', intensity: 0.72, timbre: { lead: 'reed', bass: 'upright' }, seed: 3101 }), ambient: false }, '用 preset 作底,覆盖 lead/bass 音色与命名和弦。', "audio: { music: { preset:'jazz-noir', key:'A', mode:'minor', tempo:84, progression:'romance', instruments:['pad','bass','lead','perc'], melody:'flowing', intensity:0.72, timbre:{lead:'reed', bass:'upright'}, seed:3101 }, ambient:false }"),
      item('spec-sacral-organ', '神殿管风琴', 'MusicSpec', { music: musicSpec('sacral', { key: 'C', mode: 'major', tempo: 48, progression: 'solemn', instruments: ['pad','bass'], melody: 'sparse', intensity: 0.55, timbre: { pad: 'organ', bass: 'organ' }, seed: 3102 }), ambient: false }, 'pad/bass 都用 organ,展示同一场景里铺底与低音可分开指定。', "audio: { music: { preset:'sacral', progression:'solemn', instruments:['pad','bass'], timbre:{pad:'organ', bass:'organ'} } }"),
      item('spec-heroic-brass', '铜管英雄主题', 'MusicSpec', { music: musicSpec('heroic', { key: 'G', mode: 'major', tempo: 124, progression: 'heroic', instruments: ['pad','bass','lead','perc'], melody: 'flowing', intensity: 0.84, timbre: { lead: 'brass', bass: 'picked' }, seed: 3103 }), ambient: false }, '高强度 lead + perc,适合高潮推进。', "audio: { music: { preset:'heroic', progression:'heroic', instruments:['pad','bass','lead','perc'], timbre:{lead:'brass', bass:'picked'} } }"),
      item('spec-eerie-air', '空房间诡异 drone', 'MusicSpec', { music: musicSpec('eerie', { key: 'D', mode: 'wholetone', tempo: 58, progression: 'void', instruments: ['pad','arp'], melody: 'sparse', intensity: 0.5, timbre: { pad: 'air', arp: 'harp' }, seed: 3104 }), ambient: 'ambient-unease' }, 'MusicSpec + ambient-unease 组合,展示“旋律层 + dread 氛围层”。', "audio: { music: { preset:'eerie', progression:'void', timbre:{pad:'air', arp:'harp'} }, ambient:'ambient-unease' }")
    ]},
    { id: 'timbre', label: '乐器', title: 'Timbre · 乐器 / 声部矩阵', note: '吸收旧 timbre preview 的四声部思路:每张卡都显式启用对应 instruments,避免设了音色却不响。', items: [
      item('timbre-pad-choir', 'Pad · choir 人声垫', 'timbre.pad', { music: musicSpec('calm', { instruments: ['pad'], melody: 'none', intensity: 0.58, timbre: { pad: 'choir' }, seed: 3201 }), ambient: false }, '人声垫适合仪式、回忆、圣歌感。', "music:{ preset:'calm', instruments:['pad'], melody:'none', timbre:{pad:'choir'} }"),
      item('timbre-pad-glass', 'Pad · glass 玻璃垫', 'timbre.pad', { music: musicSpec('mystery', { instruments: ['pad'], melody: 'none', intensity: 0.55, timbre: { pad: 'glass' }, seed: 3202 }), ambient: false }, '玻璃质感适合梦境、魔法、冰雪。', "music:{ preset:'mystery', instruments:['pad'], melody:'none', timbre:{pad:'glass'} }"),
      item('timbre-lead-flute', 'Lead · flute 长笛', 'timbre.lead', { music: musicSpec('pastoral', { instruments: ['pad','lead'], melody: 'flowing', intensity: 0.68, timbre: { pad: 'strings', lead: 'flute' }, seed: 3203 }), ambient: false }, '长笛主奏适合自然、旅途、温柔线索。', "music:{ preset:'pastoral', instruments:['pad','lead'], timbre:{lead:'flute'} }"),
      item('timbre-lead-reed', 'Lead · reed 簧片', 'timbre.lead', { music: musicSpec('jazz-noir', { instruments: ['pad','bass','lead'], melody: 'flowing', intensity: 0.7, timbre: { lead: 'reed', bass: 'upright' }, seed: 3204 }), ambient: false }, '簧片音色比 brass 更暗,适合侦探 / noir。', "music:{ preset:'jazz-noir', instruments:['pad','bass','lead'], timbre:{lead:'reed'} }"),
      item('timbre-lead-chant', 'Lead · chant 无词吟咏', 'timbre.lead', { music: musicSpec('sacral', { instruments: ['pad','lead'], melody: 'motif:[0,2,4,2]', intensity: 0.62, timbre: { pad: 'choir', lead: 'chant' }, seed: 3207 }), ambient: false }, 'choir 铺和声长垫,chant 走单线元音主句；不生成歌词,也不是 TTS。', "music:{ preset:'sacral', instruments:['pad','lead'], melody:'motif:[0,2,4,2]', timbre:{pad:'choir',lead:'chant'} }"),
      item('timbre-arp-kalimba', 'Arp · kalimba 卡林巴', 'timbre.arp', { music: musicSpec('eastern', { instruments: ['pad','arp'], melody: 'sparse', intensity: 0.62, timbre: { arp: 'kalimba', pad: 'air' }, seed: 3205 }), ambient: false }, '非谐金属拨片,适合机关、异域小物。', "music:{ preset:'eastern', instruments:['pad','arp'], timbre:{arp:'kalimba'} }"),
      item('timbre-arp-harp', 'Arp · harp 竖琴', 'timbre.arp', { music: musicSpec('lullaby', { instruments: ['pad','arp'], melody: 'sparse', intensity: 0.56, timbre: { arp: 'harp', pad: 'warm' }, seed: 3206 }), ambient: false }, '柔和琶音,适合回忆、梦、温暖过场。', "music:{ preset:'lullaby', instruments:['pad','arp'], timbre:{arp:'harp'} }")
    ]},
    { id: 'bass', label: '低音', title: 'Bass · 低音声部对照', note: '低音不是新字段:用 instruments 启用 bass,再用 timbre.bass 选择已有低音板。', items: [
      item('bass-sub', 'Sub · 圆润低频', 'timbre.bass', { music: musicSpec('tense', { instruments: ['pad','bass'], melody: 'none', intensity: 0.72, timbre: { pad: 'air', bass: 'sub' }, seed: 3301 }), ambient: false }, '圆润低频,适合潜行、恐惧、厚重地板。', "music:{ preset:'tense', instruments:['pad','bass'], timbre:{bass:'sub'} }"),
      item('bass-upright', 'Upright · 原声贝斯', 'timbre.bass', { music: musicSpec('jazz-noir', { instruments: ['pad','bass','lead'], melody: 'sparse', intensity: 0.68, timbre: { bass: 'upright', lead: 'reed' }, seed: 3302 }), ambient: false }, '木质拨弦,适合 noir / 酒吧 / 夜雨。', "music:{ preset:'jazz-noir', instruments:['pad','bass','lead'], timbre:{bass:'upright'} }"),
      item('bass-picked', 'Picked · 电贝斯', 'timbre.bass', { music: musicSpec('march', { instruments: ['pad','bass','lead','perc'], melody: 'flowing', intensity: 0.78, timbre: { bass: 'picked', lead: 'brass' }, seed: 3303 }), ambient: false }, '有中频拨弦感,适合进行曲、动作、队列。', "music:{ preset:'march', instruments:['pad','bass','lead','perc'], timbre:{bass:'picked'} }"),
      item('bass-synth', 'Synth · 合成器低音', 'timbre.bass', { music: musicSpec('synthwave', { instruments: ['pad','bass','arp','lead','perc'], melody: 'flowing', intensity: 0.82, timbre: { bass: 'synth', lead: 'pulse' }, seed: 3304 }), ambient: false }, '电子感更强,适合赛博、追逐、霓虹。', "music:{ preset:'synthwave', instruments:['pad','bass','arp','lead','perc'], timbre:{bass:'synth'} }"),
      item('bass-sine-pluck', 'Sine-pluck · 柔拨低音', 'timbre.bass', { music: musicSpec('romance', { instruments: ['pad','bass','lead'], melody: 'flowing', intensity: 0.6, timbre: { bass: 'sine-pluck', pad: 'strings' }, seed: 3305 }), ambient: false }, '干净柔拨,适合温柔、爱情、告别。', "music:{ preset:'romance', instruments:['pad','bass','lead'], timbre:{bass:'sine-pluck'} }")
    ]},
    { id: 'midi', label: 'MIDI', title: 'MIDI · 内置短曲示例', note: 'MIDI 也是现有 audio.music 形态:把 .mid 转 base64 内联。这里只做内置示例,不是上传器。', items: [
      item('midi-flute', 'MIDI 笛声短句', 'midi', { music: { midi: MIDI.flute, loop: true, gain: 0.58 }, ambient: false }, midiDemos[0].note, "audio: { music: { midi: '<base64 .mid>', loop: true, gain: 0.58 }, ambient: false }"),
      item('midi-brass-bass', 'MIDI 铜管 + 低音', 'midi', { music: { midi: MIDI.brassBass, loop: true, gain: 0.55 }, ambient: false }, midiDemos[1].note, "audio: { music: { midi: '<base64 .mid>', loop: true, gain: 0.55 }, ambient: false }"),
      item('midi-kalimba-drums', 'MIDI 卡林巴 + 鼓', 'midi', { music: { midi: MIDI.kalimbaDrums, loop: true, gain: 0.52 }, ambient: false }, midiDemos[2].note, "audio: { music: { midi: '<base64 .mid>', loop: true, gain: 0.52 }, ambient: false }")
    ]},
    { id: 'ambient', label: '环境音', title: 'audio.ambient · BGS / 声景', note: '环境音与 music 并行同响。单独试听时会停主音乐,方便听清声景层。', items: ambientPresets.map(function (p) { return item('ambient-' + p[0], p[1] + ' ' + p[0], 'ambient', { music: false, ambient: p[0] }, p[2], "audio: { music: false, ambient: '" + p[0] + "' }"); }) },
    { id: 'sfx', label: '音效', title: 'audio.sfx · 一次性反馈', note: 'SFX 是 fire-and-forget,每次点击卡片都会重新触发。持续声音要用 music / ambient。', items: sfxPresets.map(function (p) { return item('sfx-' + p[0], p[1] + ' ' + p[0], 'sfx', { music: false, ambient: false, sfx: [p[0]] }, p[2], "audio: { music: false, ambient: false, sfx: ['" + p[0] + "'] }"); }).concat([
      item('sfx-custom-sweep', '自定义扫频 SfxSpec', 'SfxSpec', { music: false, ambient: false, sfx: [{ type: 'sawtooth', freq: 880, freqEnd: 220, dur: 0.18, gain: 0.35, distort: 4 }] }, '对象形 SfxSpec,适合激光、机关、魔法扫频。', "audio: { sfx: [{ type:'sawtooth', freq:880, freqEnd:220, dur:0.18, gain:0.35, distort:4 }] }")
    ])},
    { id: 'combo', label: '组合', title: '组合示例 · music + ambient + sfx', note: '这些卡片展示持续音乐、环境声景和一次性音效如何叠加。', items: [
      item('combo-noir-rain', '雨夜侦探', 'combo', { music: 'jazz-noir', ambient: 'rain', sfx: ['click'] }, '黑色爵士 + 雨声 + 轻点击。', "audio: { music: 'jazz-noir', ambient: 'rain', sfx: ['click'] }"),
      item('combo-synth-town', '霓虹城镇', 'combo', { music: 'synthwave', ambient: 'town', sfx: ['pickup'] }, '合成波 + 城市低嗡鸣。', "audio: { music: 'synthwave', ambient: 'town', sfx: ['pickup'] }"),
      item('combo-cave-dread', '洞穴恐惧', 'combo', { music: 'eerie', ambient: 'ambient-unease', sfx: ['horror-sting'] }, '诡异音乐 + 不安 drone + 惊吓。', "audio: { music: 'eerie', ambient: 'ambient-unease', sfx: ['horror-sting'] }"),
      item('combo-romance-waves', '海边告别', 'combo', { music: 'romance', ambient: 'waves', sfx: ['success'] }, '浪漫主题 + 海浪 + 温柔确认。', "audio: { music: 'romance', ambient: 'waves', sfx: ['success'] }")
    ]}
  ];

  var workbenchOptions = {
    presets: musicPresets.map(function (p) { return { value: p[0], label: p[1] + ' ' + p[0] }; }),
    keys: ['C','D','E','F','G','A','Bb','D#','G#'],
    modes: ['major','minor','dorian','phrygian','lydian','mixolydian','pentatonic','wholetone'],
    progressions: ['','lament','introspection','conflict','dread','heroic','triumph','solemn','romance','tender','lullaby','eerie','void','descent','festive','mischief','dance'],
    melodies: ['sparse','flowing','none','motif:[4,3,2,0]'],
    instruments: ['pad','bass','arp','lead','perc','drone'],
    timbre: {
      pad: ['', 'warm','organ','air','strings','choir','glass'],
      lead: ['', 'soft','pulse','bell','pluck','brass','harp','flute','reed','chant'],
      arp: ['', 'pluck','bell','soft','harp','kalimba'],
      bass: ['', 'sub','organ','upright','picked','synth','sine-pluck']
    },
    ambient: [''].concat(ambientPresets.map(function (p) { return p[0]; })),
    sfx: [''].concat(sfxPresets.map(function (p) { return p[0]; })),
    midi: midiDemos
  };

  var maps = {
    index: {
      name: 'Amatlas Audio Workbench',
      nodes: {
        blank: {
          kind: 'scene', name: '静音',
          look: '选择卡片或工作台按钮试听。页面加载时不会自动播放声音;声音需要用户点击或按键后才会被浏览器允许。',
          audio: { music: false, bgm: false, ambient: false, sfx: [] },
          links: [{ label: '工作台动态试听', to: { map: 'workbench', node: 'preview' } }]
        }
      }
    },
    workbench: {
      name: '工作台动态试听',
      nodes: {
        preview: {
          kind: 'scene', name: '工作台试听',
          look: '工作台会在播放前把本节点替换成当前 audio 意图,再通过真实 Amatlas View 触发声音。',
          audio: { music: false, bgm: false, ambient: false, sfx: [] },
          links: [{ label: '回到试听列表', to: { map: 'index', node: 'blank' } }]
        }
      }
    }
  };
  groups.forEach(function (g) {
    maps[g.id] = { name: g.title, nodes: {} };
    g.items.forEach(function (s) {
      s.group = g.id;
      maps.index.nodes.blank.links.push({ label: '试听:' + s.name, to: { map: g.id, node: s.id } });
      maps[g.id].nodes[s.id] = {
        kind: 'scene', name: s.name,
        look: s.note + '\n\n' + s.code,
        audio: s.audio,
        links: [{ label: '回到试听列表', to: { map: 'index', node: 'blank' } }]
      };
    });
  });

  return {
    id: 'c5f92265-4240-48f0-9e8f-3e8ae99a7add',
    start: { map: 'index', node: 'blank' },
    seed: 20260629,
    maps: maps,
    previewGroups: groups,
    workbenchOptions: workbenchOptions,
    midiDemos: midiDemos
  };
});
