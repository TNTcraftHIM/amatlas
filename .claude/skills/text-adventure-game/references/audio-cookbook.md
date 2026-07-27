# 音乐配方手册 (Audio Cookbook)

> **不懂乐理也能用** — 8 条完整 `MusicSpec` 配方,对应 8 个游戏场景,**逐字抄进 `world.js` 的 `audio.music` 字段即可**。
> 改不出风格?看每条末尾的 **微调旋钮** —— 改一两个参数就换味道。

## 怎么用

1. 找一条最像你场景的配方
2. 复制 `spec` 整段到 `world.js` 的节点 `audio.music`
3. 想换味道,看 **微调旋钮**,改一两个字段
4. 整段照抄绝不会崩 — 引擎守 fail-loud 契约,字段错就报错告诉你

```js
// world.js 节点例子
audio: { music: { /* 这里粘贴配方 spec */ } }
```

---

## ① 废墟探索 (Desolate Exploration)

```js
{
  key: 'D', mode: 'minor', tempo: 52,
  feel: ['empty', 'vast', 'mysterious'],
  progression: 'lament',                    // 或 ['vi','IV','I','V']
  instruments: ['pad','bass','drone'],
  melody: 'none',
  intensity: 0.4,
  timbre: { pad: 'air' },
  padContour: 0.4,
  rhythm: { swing: 'straight', density: 0.25, bassPattern: 'pedal' }
}
```

**为什么这样写**:小调 + tempo 52(最慢档)+ 无旋律 = 极度克制的荒凉感。`bassPattern: 'pedal'` 让低音整 4 拍长音、末尾轻触(像心脏起搏器)。`intensity 0.4` 自动只保 pad/bass/drone,不会冒出鼓和琶音破坏空旷感。

**微调旋钮**:
- 更凄冷 → `key: 'E'`, `tempo: 48`, `feel: ['desolate']`
- 加诡异 → `progression: 'dread'`, `mode: 'phrygian'`
- 微弱生机 → 加 `'arp'` 到 instruments, `intensity: 0.55`
- 极端 dark ambient → `tempo: 40`, `padContour: 0.6`, 删 drone

---

## ② 雨夜街头 (Rain-soaked Street)

```js
{
  key: 'G', mode: 'dorian', tempo: 88,
  feel: ['calm', 'introspective', 'noir'],
  progression: ['i','IV','i','VII'],
  instruments: ['pad','bass','arp'],
  melody: 'sparse',
  intensity: 0.55,
  timbre: { pad: 'strings', arp: 'bell' },
  rhythm: { swing: 'triplet', density: 0.45, bassPattern: 'walking' }
}
```

**为什么这样写**:Dorian 调式 = 小调带大六度,天生有夜景柔和感(没有纯小调那么悲)。`swing: 'triplet'` 加爵士三连感重音。`walking bass` 用三击和弦色彩、第四拍休止模拟步行节奏；它是本配方有意选择的 melodic bass，不是所有夜景都该套。`bell` 音色 + `sparse` 旋律 = 远处灯光若隐若现。

**微调旋钮**:
- 更忧伤 → `feel: ['sad','noir']`, `progression: ['i','VI','iv','V']`
- 加张力 → `intensity: 0.7`, `tempo: 98`, 加 `'perc'`
- 更爵士 → `tempo: 76`, `swing: 'shuffle'`, `arp: 'broken'`
- 雨声幻想 → `melody: 'flowing'`, `pad: 'air'`, density 0.6

---

## ③ 教堂哀悼 (Cathedral Requiem)

```js
{
  key: 'C', mode: 'minor', tempo: 48,
  feel: ['mourning', 'grief', 'solemn'],
  progression: ['i','VI','iv','V'],
  instruments: ['pad','drone','bass','lead'],
  melody: 'motif:[4,3,2,0]',
  intensity: 0.6,
  timbre: { pad: 'organ', lead: 'soft' },
  padContour: 0.5,
  rhythm: { swing: 'straight', density: 0.3, bassPattern: 'pedal' }
}
```

**为什么这样写**:`motif:[4,3,2,0]` = C 小调里 G-F-Eb-C 下行(悼歌标志动机),引擎会按 period 乐句结构自动变形(段0原样 → 段1倒影 → 段2下行 → 段3落主音)。`pad: 'organ'` 是教堂管风琴。`lead: 'soft'` 像呜咽。drone 全程根音 C 深低音承托，bass 用 `pedal` 只提供地基，不与这条下行动机争当第二主旋律。

**微调旋钮**:
- 激烈悲痛 → `intensity: 0.8`, 加 `'perc'`, `tempo: 56`
- 纯器乐 → `melody: 'none'`, 去掉 lead
- 童谣哭声 → `melody: 'sparse'`, `mode: 'major'`, `key: 'G'`
- 光影交织 → `progression: ['i','III','VI','iv']`, `padContour: 0.8`

> **改 key 时怎么改 motif**:`[4,3,2,0]` 是音阶度数(不是绝对音),换 key 引擎自动按新调音阶取音 — 你不用改 motif 本身。

---

## ④ 复古 8-bit (Chiptune Nostalgia)

```js
{
  key: 'G', mode: 'major', tempo: 140,
  feel: ['retro', 'festive', 'bright'],
  progression: 'heroic',                    // 或 ['I','V','vi','IV']
  instruments: ['arp','lead','perc'],
  melody: 'flowing',
  intensity: 0.8,
  timbre: { arp: 'pluck', lead: 'pulse' },
  rhythm: { swing: 'straight', density: 0.8, bassPattern: 'oompah' }
}
```

**为什么这样写**:`pluck + pulse` = 方波/锯齿波(复古游戏机音色)。`oompah` 节奏 = ump-pah 行进曲律动(拍1根 + 拍2/4五度)。`density 0.8` 高音符密集(复古音乐特有的碎碎念)。无 bass 让 arp+lead 显轻盈。`intensity 0.8` 自动加鼓。

**微调旋钮**:
- 嘻哈节奏 → `bassPattern: 'block'`, density 0.7, 加 `'bass'`
- 8-bit RPG → `tempo: 100`, `melody: 'sparse'`, intensity 0.6
- 街机竞速 → `tempo: 180`, `mode: 'minor'`, `feel: ['driving','chase']`
- 小夜曲 → `tempo: 88`, `mode: 'dorian'`, `arp: 'broken'`

---

## ⑤ 黑色侦探 (Film Noir Detective)

```js
{
  key: 'A', mode: 'minor', tempo: 84,
  feel: ['smoky', 'noir', 'mysterious'],
  progression: ['i','ii','v','i'],
  instruments: ['pad','bass','arp','lead','perc'],
  melody: 'flowing',
  intensity: 0.7,
  timbre: { lead: 'brass', pad: 'warm', arp: 'bell' },
  rhythm: { swing: 'triplet', density: 0.55, bassPattern: 'walking' }
}
```

**为什么这样写**:`triplet swing` = 爵士三连重音(2:1感)。`walking bass` = 慵懒侦探脚步，但三击后主动留一拍，让 `lead:'brass'` 的小号独白仍是焦点；如果场景对白密集，应优先把 bass 改成 `block`/`pedal`，不是继续加声部。`bell` 背景和弦。`i-ii-v-i` 是爵士进行(不是俗套的 i-VI-III-VII)。

**微调旋钮**:
- 冷硬 noir → 去 arp, `feel: ['tense','dread']`, `tempo: 72`
- 谍报追逐 → `intensity: 0.85`, `tempo: 110`
- 蓝调感伤 → `mode: 'dorian'`, `arp: 'broken'`, `swing: 'shuffle'`
- 迷幻线索 → `progression: ['i','III','VI','II']`, `pad: 'air'`

---

## ⑥ 末日逃亡 (Apocalyptic Escape)

```js
{
  key: 'E', mode: 'phrygian', tempo: 148,
  feel: ['tense', 'driving', 'urgent', 'chase'],
  progression: 'dread',                     // 或 ['i','II','i','II']
  instruments: ['bass','perc','lead','pad','arp'],
  melody: 'sparse',
  intensity: 0.9,
  timbre: { lead: 'brass', pad: 'air' },
  rhythm: { swing: 'straight', density: 0.85, bassPattern: 'syncopated' }
}
```

**为什么这样写**:`phrygian` = 中东半音暗黑调,`i-II` 是它的标志。`tempo: 148` 极快逃脱感。`intensity: 0.9` 全部声部都上 = 狂乱。`syncopated bass` = 反拍重音(拍1 + 2.5 + 3.5) = 紧张推进感。`sparse melody + brass` = 喘息呼救。

**微调旋钮**:
- 更绝望 → 去 lead, `intensity: 1.0`, `tempo: 180`
- 黑暗魔法 → `mode: 'wholetone'`, `key: 'D'`, `feel: ['eerie','driving']`
- 坚定突破 → `mode: 'minor'`, `progression: ['i','VI','III','VII']`
- 生化危机 → `tempo: 165`, density 0.9, 加 drone

---

## ⑦ 童年回忆 (Childhood Memory)

```js
{
  key: 'F', mode: 'lydian', tempo: 76,
  feel: ['gentle', 'warm', 'serene'],
  progression: ['I','II','I','V'],
  instruments: ['pad','arp','lead'],
  melody: 'flowing',
  intensity: 0.6,
  timbre: { pad: 'strings', arp: 'bell', lead: 'soft' },
  padContour: 0.3,
  rhythm: { swing: 'straight', density: 0.4, bassPattern: 'block' }
}
```

**为什么这样写**:Lydian 调(升四度)= 儿童美梦光晕(天生明亮)。`strings + bell + soft` = 柔软质感(玻璃珠/音乐盒)。`density 0.4` 稀疏不急。`tempo 76` 像儿童跑步速度。`I-II-I-V` 重复循环(儿谣特质)。`intensity 0.6` 无鼓只有柔和乐器。

**微调旋钮**:
- 梦幻纯真 → `melody: 'sparse'`, `tempo: 64`, `padContour: 0.5`
- 阳光嬉戏 → `intensity: 0.7`, 加 `'perc'`, `tempo: 88`
- 怀旧音乐盒 → `mode: 'major'`, `tempo: 56`, `arp: 'broken'`
- 成长泪光 → `mode: 'minor'`, `progression: 'tearful'`, `feel: ['sad','nostalgic']`

---

## ⑧ 悬疑追查 (Mystery Unraveling)

```js
{
  key: 'D', mode: 'wholetone', tempo: 96,
  feel: ['eerie', 'curious', 'tense'],
  progression: ['I','II','I','III'],
  instruments: ['pad','arp','bass','perc'],
  melody: 'sparse',
  intensity: 0.65,
  timbre: { pad: 'air', arp: 'pluck' },
  padContour: 0.7,
  rhythm: { swing: 'straight', density: 0.6, bassPattern: 'syncopated' }
}
```

**为什么这样写**:`wholetone` = 全音阶(6 音等距),天生诡异无解(每个和弦音程一样)。`I-II-I-III` 在全音阶里浮动。`tempo 96` 像不安心跳。`padContour 0.7` 垫音激进切换(不和谐感加强)。`syncopated bass` 不规则脚步。`pluck arp` 像弦乐划过。

**微调旋钮**:
- 更诡谲 → `mode: 'dorian'`, `progression: ['i','iv','i','VII']`
- 证据浮现 → `intensity: 0.8`, 加 `'lead'`, `melody: 'flowing'`
- 真相大白 → `tempo: 130`, `mode: 'minor'`, intensity 0.85
- 梦幻悬想 → `mode: 'phrygian'`, `tempo: 68`, `arp: 'random'`

---

## 进行库快选 (Progression Shortcuts)

`progression` 字段除了写罗马数字数组,也可以写**命名快选**(等效):

```js
progression: 'lament'              // = ['vi','IV','I','V']
progression: 'dread'               // = ['i','II','i','II']
progression: 'heroic'              // = ['I','V','vi','IV']
```

完整 18 条命名见 [`progressions-library.md`](./progressions-library.md)。

---

## intensity 触发门控速查

`intensity` 自动决定哪些乐器实际响起(对照内部 `LAYER_GATE`):

| intensity | 实际响起的乐器 |
|---|---|
| 0.0 - 0.14 | 只 pad、drone |
| 0.15 - 0.44 | + bass |
| 0.45 - 0.49 | + arp |
| 0.50 - 0.69 | + lead |
| 0.70 - 1.0 | + perc (全开) |

**意义**:你写 `instruments:['pad','bass','arp','lead','perc']` 但 `intensity: 0.4`,实际只有 pad + bass 响 —— 这是**故意**的(让 intensity 单旋钮控制密度)。要让 lead 响 → intensity ≥ 0.5。

---

## 想精确控制每个音?

8 条配方 + 18 条命名进行 + 22 个预设组合够 95% 场景。剩 5% 想 100% 控制每个音的话 → 用 [`audio-advanced.md`](./audio-advanced.md) 的 **MIDI 路径**(`audio.music.midi: '<base64>'`),把 .mid 文件直接嵌进 world.js。
