# Audio System — 作者必读核心

> **作者只声明意图,不写合成代码。** 节点上写 `audio:{ music:'…', ambient:'…', sfx:['…'] }`,
> 呈现器 `presenters/present-audio.js` 负责所有合成——零素材、零依赖、`file://` 可跑。
> **world.js 里不写 Web Audio。**

**试听入口**:`examples/showroom/audio-preview.html` 是正式随包的通用 Audio Workbench:可试听 `music` 预设、`MusicSpec` 配方、timbre 乐器/低音、内置 MIDI 示例、`ambient`、`sfx` 和组合场景;`_scratch/` 里的旧试听页只作历史验证,别当作者入口。MIDI 示例用既有 `{music:{midi:'<base64>'}}` 写法,不是上传工具或新字段。

**深层合成原理 / MIDI 解析内部 / 编曲细节 → [`audio-advanced.md`](audio-advanced.md)** · **给引擎加新乐器音色/和弦进行/曲风(改源码) → [`audio-extending.md`](audio-extending.md)**

---

## 节点里怎么写音频

```javascript
// 推荐:music(程序配乐)+ ambient(环境声景)并行
hall: {
  kind: 'scene',
  name: '大殿',
  audio: { music: 'tense', ambient: 'waves' },
  look: '…'
}

// 简单场景:只用 music
forest: { audio: { music: 'pastoral', sfx: ['birds'] } }

// 恐怖/诡异场景(重要!见下方警示)
dungeon: { audio: { music: 'eerie', ambient: 'ambient-unease' } }
```

**四个字段:**
| 字段 | 含义 | 值形态 |
|---|---|---|
| `music` | 程序作曲背景音(旋律/和声/鼓,丰富) | 预设名 \| `{preset,…}` \| `{midi:'…'}` |
| `ambient` | 环境声景/BGS,与 music **并行同响** | 预设名 \| AmbientSpec 对象 |
| `bgm` | 单主题持续音(最简 legacy) | 主题名字符串 |
| `sfx` | 一次性音效名数组,本次 render 触发 | `['名称', …]` |

---

## v15 缺省继承语义(重要:别每节点重复写)

- 节点**不写** `music`/`ambient` → **继承上一曲继续播**(整个 `audio:{}` 不写 = 全继承)
- **换曲** → 写 `music:'新名'`
- **停曲** → 写 `music:false`(或 `null`)
- `sfx` 无继承,每节点独立触发

**实践**: 只在**换/停**时才写 audio,音乐自动过场延续。`music` 优先于 `bgm`;`music:false` 连带停 `bgm`。**注:`bgm` 只接受字符串预设名**(写成对象会静默产生错音调、不报错)——要自定义请走 `music:MusicSpec`(程序作曲)或 `ambient:AmbientSpec`(环境音),别给 `bgm` 传对象。

- ⚠️ **继承的反面(结局/转调最常踩)**:不写 `ambient` = **上一节点的 ambient 继续播**。所以一个紧张的 `ambient`(如 `heartbeat`/`ambient-unease`)会**一路带进只换了 `music` 的平静节点/结局**(showcase 实测:对话节点 `ambient:'heartbeat'` → 结局只写 `audio:{music:'romance'}`、漏写 ambient → 心跳在温情结局里还在响)。**转调或结局想换/停氛围,必须显式写** `ambient:'新名'` 或 `ambient:false`(停)——别只换 `music` 就以为氛围也跟着变。

---

## music 预设名(22 个,逐字抄)

| 预设 | 气质 | 适合场景 |
|---|---|---|
| `calm` | 大调温暖 | 日常 / 安全屋 / 序章 |
| `tense` | 小调快+鼓 | 潜入 / 追查 / 倒计时 |
| `eerie` | 全音阶飘忽 | 异界 / 怪谈 / 失重感 |
| `heroic` | 大调进行曲 | 高潮 / 胜利 / 出征 |
| `sad` | 小调慢 | 离别 / 挽歌 / 雨夜 |
| `pastoral` | 利底亚明亮飘 | 田园 / 晨光 / 旅途 |
| `sacral` | 极慢庄严 | 教堂 / 神殿 / 仪式 |
| `battle` | 弗里几亚 140+鼓 | 战斗 / 对决 / 逃亡 |
| `mystery` | 多利亚游移 | 侦探 / 解谜 / 线索 |
| `festive` | 混合利底亚欢快 | 集市 / 节庆 / 酒馆 |
| `desolate` | 极慢空 pad | 废土 / 雪原 / 遗迹 |
| `eastern` | 五声音阶(东方味) | 武侠 / 江湖 / 山水 |
| `lullaby` | 大调轻摇 | 回忆 / 童年 / 安眠 |
| `synthwave` | 小调电子驱动 128bpm | 赛博/霓虹/复古未来 |
| `jazz-noir` | 小调三连音爵士 | 侦探酒吧 / 雨夜都市 |
| `march` | 大调进行曲铜管 | 军队 / 仪仗 / 誓师 |
| `chase` | 小调极快 168bpm | 追逐 / 逃脱 / 时限 |
| `romance` | 大调弦乐慢板 | 爱情 / 温柔 / 告白 |
| `scherzo` | 大调快活谐谑 | 喜剧 / 恶作剧 / 市井 |
| `stealth` | 弗里几亚极慢无旋律 | 潜伏 / 监视 / 密室 |
| `elegy` | 小调哀歌慢 | 悼亡 / 葬礼 / 永别 |
| `baroque` | 大调赋格驱动 | 古典宫廷 / 精密机关 |

**选乐守则**: 同一章/区域用**同一个**名稳定——逐节点换名会每点触发重切,听感割裂。只在剧情/氛围转折处换。

## 给 AI 的音乐创新框架：先分职责，再加变化

> 这是一组**创作判据，不是第九条固定配方**。预设和 cookbook 只是可拆的 few-shot 锚点；不要只换预设名或堆更多乐器来冒充创新。

### 1. 先决定谁是前景

把同一时刻的声音按职责想，而不是按乐器数量想：

- **焦点**：`lead` 或少数情况下的 melodic bass，承担玩家会哼出的线；
- **根基**：bass / drone，给重心和脉搏；
- **和声场**：pad，维持调性与空间；
- **运动**：arp / perc，制造推进；
- **环境**：ambient，交代材质、天气和心理压力；
- **叙事前景**：对白、脚步、交互提示——它们需要出现时，音乐应主动留位。

一个声部可以兼任两种职责，但**同一时刻不要让多条声部都争当焦点**。层次感来自音区、密度、音色、空间和休止的对比，不来自“所有 instruments 全开”。加了 lead，就让 bass 更稳、arp 更疏；决定让 bass 唱，就删弱 lead，而不是让两条旋律互相抢。

### 2. bass 先选角色，再选 pattern

- **support 族**：`pedal` / `block` / `pulse` / `syncopated` / `oompah` / `dotted`。适合绝大多数叙事配乐：它们提供地板、脉搏或行进感，但不逐拍解释和弦。
- **melodic 族**：`walking` / `walking-alt`。只在 bass 本身就是风格角色时使用，例如 noir 或 baroque；当前 walking 是三击和弦色彩 + 第四拍整拍休止，不是旧式四拍填满。

内置 composer 会把 bass 控制在 G3（MIDI 55）以下，并让默认 support/melodic 只在各自族内轮换；但作者显式写 `rhythm.bassPattern` 仍是在做编曲决定。**不要因为“爵士=walking”就机械套用**：先问场景是否真的需要 bass 被听见为一条线，以及 lead/对白是否给它留了空间。

### 3. 从六个正交轴创新，每次保留一个锚

1. **和声**：`mode` / `key` / `progression`；
2. **时间**：`tempo` / `rhythm.swing` / `rhythm.density` / `rhythm.bassPattern`；
3. **旋律**：`melody` 与是否启用 `lead`；
4. **音色**：`timbre`；
5. **织体**：`instruments` / `intensity` / `padContour`；
6. **空间与材质**：`ambient`，或更深层的 MIDI / 自定义 presenter。

一次重点改变一两个轴，同时保留动机、和弦进行或核心音色中的至少一个作身份锚。**全轴一起变通常不是 development，而是突然换了一首歌。** `feel` 是有顺序的：第一个被识别的词决定主要编曲 DNA 与默认音色，后续词只在前词未命中时接管；把最重要的职责词放最前。

### 4. 区分“轮换”与“发展”

内置 composer 不只做确定性的段间动机/arp/bass 变奏，还会让同一个生成式 `audio.music` 循环经历默认的 **statement → answer → peak → breath** 四段弧。但这不是“等四个循环才补齐一首歌”：statement 从第一秒就是完整音乐；answer 只轻换陪衬关系；peak 与 breath 只在末和弦短暂增强或收口，静态曲风则用 texture 换色而不强加高潮或旋律。这个默认弧只解决一首完整曲子内部的短呼吸；剧情转折仍可有意调整 `intensity`、`instruments`、`timbre` 或整个 MusicSpec，并保留前述身份锚。超长过场/ED 若需要几十秒慢铺陈，应由具体作品显式编排 MusicSpec 或 MIDI，不让所有普通场景共同承担前期残缺。微观演奏法、乐句/四段发展、场景级配器变化是三个不同时间尺度，不要用随机音符代替它们。

### 5. 留白也是作者数据

- 静默、整拍休止、删掉一个声部，都是真正的编曲选择；
- 高密度只给高潮或明确的机械/追逐质感，不把 `intensity:1` 当“质量更高”；
- 对白/关键交互前后，优先减 lead、arp 与有强起音的 bass；
- 手机扬声器会削弱次低频，不能只靠“把 bass 压得很低”解决抢位：还要控制中高频起音、密度和音符职责。

### 6. 用耳朵裁决层级，用自动闸裁决契约

至少用耳机和手机扬声器各听一个完整段，问三件事：①第一耳听到的是否真是预定焦点；②没有焦点的段落是否仍有方向而非空转；③循环回来时是熟悉中有变化，还是机械复读。自动测试能证明在调、确定性、路由与退化，**不能证明层次自然**。

现有词汇不够时，不要把不支持的语义伪装成预设：精确音符走 MIDI；新音色/进行/曲风按 [`audio-extending.md`](audio-extending.md) 扩展；完全不同的声音系统走自定义 presenter。创新优先发生在作者数据或可替换呈现层，不把某一款游戏的具体配器硬编码进核心。

---

## ambient 预设名(逐字抄)

**自然/天气(8):** `wind` `waves` `rain` `storm` `forest` `stream` `night` `snow`

**场所/室内(5):** `campfire` `tavern` `town` `cave` `underwater`

**恐怖/dread(2):** `ambient-unease`(低频不协和 drone,与 music 并行同响 → 旋律铺底;详见下节)· `heartbeat`(心跳低频,紧张/恐怖场景;maze 也用)

---

## 恐怖/dread 场景:推荐(非必须)叠 `ambient-unease`

```javascript
// 想要"被压下来"的恐怖氛围:music 旋律 + ambient dread drone 叠层(推荐组合)
horror_room: {
  audio: { music: 'eerie', ambient: 'ambient-unease' }
}
```

`ambient-unease` = 低频不协和 dread drone(ambient 预设之一,**与 music 并行同响**=旋律铺底 drone),产生真正令人不安的氛围层。drone 层能把恐怖感"压"下来(端用户实测好评)。**但这是推荐不是必须**:不写引擎照常运行(无 fail-loud);若你的恐怖**不需要 drone**(静默恐惧 / 空洞 / 克苏鲁式不可名状 / 极简留白),只用 music、或自定义 `AmbientSpec`、或干脆不加 ambient,**都是合法的创作选择**。可与任意 music 叠(`{music:'eerie', ambient:'ambient-unease'}`);也可单独 `bgm:'ambient-unease'` 作纯 drone 床(无旋律)。

---

## sfx 音效名(可用)

`success` `fail` `dice-roll` `pickup` `click` `door` `impact` `magic` `birds` `thunder`

*(其中 `success`/`fail`/`dice-roll`/`pickup`/`click` 有专用音色;其余走哈希回退,总能出声)*

**自定义音效(SfxSpec 对象,v19)**:`sfx` 数组项也可写对象做非预设音效,如 `sfx: [{ freq:880, freqEnd:220, dur:0.15, type:'sawtooth' }]`(激光扫频)。可选字段:`type`(sine/square/triangle/sawtooth)·`freq`·`freqEnd`(扫频终点)·`noise:true`(噪声打击/气声)·`hpFreq`·`lpFreq`·`dur`·`gain`·`distort`·ADSR(`attack`/`decay`/`sustain`/`release`),全可选有缺省;字段**类型**错即抛(fail-loud)。但**数值无硬范围校验**(超界不抛、可大胆试验):`gain`>1 放大、`sustain`>1 长延音、`freqEnd`>`freq` 上扫 / <`freq` 下扫、极短 `dur` 做点击——尽管试。

**条件 / 仅首次音效(函数形,v22)**:`sfx` 数组项也可写成函数 `(S, first) => [...]`(与 `look` 的 `(S, first)` 对称,**节点进入时**按状态求值)——`sfx:[ (S,first)=>first?['thunder']:[] ]` = 只在首次进入响一声雷;`sfx:[ (S)=>S.flags.alarm?['alarm']:[] ]` = 满足条件才响。返回数组(可含预设名或 SfxSpec 对象);返回非数组即抛(fail-loud)。**注**:sfx 在**进入节点**时求值,不是点某个选项时——要"点 A 选项才响某音效",目前拆一个中转节点(A → 中转〔带 `sfx`〕→ 目标)。

---

## 音色板 timbre(一般不用写,预设已内置)

预设各自带好音色。需要定制时才写 `timbre`:

```javascript
audio: { music: { preset: 'calm', timbre: { pad: 'organ' } } }  // 教堂里的平静
```

**pad 合法值:** `warm`(默认) | `organ` | `air` | `strings` | `choir` | `glass`
**lead 合法值:** `soft`(默认) | `pulse` | `bell` | `pluck` | `brass` | `harp` | `flute` | `reed` | `chant`(单线无词吟咏)
**arp 合法值:** `pluck`(默认) | `bell` | `soft` | `harp` | `kalimba`
**bass 合法值:** (默认柔化锯齿) | `sub`(圆润正弦) | `organ`(教堂踏板) | `upright`(原声拨弦) | `picked`(电贝斯) | `synth`(合成器) | `sine-pluck`(柔拨)

> ⚠️ **`'drone'` 不是 pad 音色板名**。写 `timbre:{pad:'drone'}` 会 warn 并退化成 warm。
> 想要低频持续氛围:用 `ambient:'ambient-unease'`(不协和 drone)或 `pad:'warm'`/`'air'`。
> ⚠️ **timbre 只对该预设 `instruments` 里已启用的声部生效**(端用户实测踩点):写 `timbre:{lead:'reed'}` 但预设没 `lead` 声部 → **静默不响**(只 console.warn,作者看不到)。**各预设默认 instruments**(没 `lead` 的预设你写 `timbre.lead` 不会响):
> | 含 `lead`(可设 timbre.lead) | 不含 `lead`(写 timbre.lead 无效) |
> |---|---|
> | heroic/pastoral/battle/festive/eastern/synthwave/jazz-noir/march/chase/romance/elegy/baroque | calm/tense/eerie/sad/sacral/mystery/desolate/lullaby/scherzo/stealth |
> 想给"不含 lead 的预设"加主奏音色 → 显式写全 `instruments:['pad','bass','lead']` 把 lead 加进去(或直接用完整 MusicSpec / cookbook 配方,自己声明 instruments 最可靠)。`arp`/`bass`/`pad` 同理:多数预设有 pad+bass,arp 见上表(eerie/mystery/lullaby 等有 arp)。
> **bass 音色按曲风自动选**(jazz→upright/synthwave→synth/sad→sub/march→picked/romance→sine-pluck…),想覆盖写 `timbre:{bass:'sub'}`;不写就跟曲风走、各预设低音各异(不再"全都一样的咚")。
> **`lead:'chant'` 是无词吟咏，不是 TTS/歌词。** 想要“合唱铺底 + 一条吟咏主句”，显式启用 `instruments:['pad','lead']`，再写 `timbre:{pad:'choir',lead:'chant'}`；如果预设本身没有 lead（例如 sacral），只写 timbre 不会凭空增加声部。

未知板名 → console.warn + 回退默认(不崩)。

---

## music 进阶形态(指针)

**预设微调**(`{preset, …覆盖}`):气质对了但速度/编制不合时用:
```javascript
audio: { music: { preset: 'mystery', tempo: 72, key: 'F' } }
```

**完整 MusicSpec**: 自定义 `mode/key/progression/instruments/intensity/melody/timbre/tempo/rhythm/padContour` — 详见 [`audio-advanced.md`](audio-advanced.md#musicspec-完整字段)。

**进行库** (batch 4):`progression` 可写诗意命名(`'lament'`/`'dread'`/`'heroic'`...18 条覆盖 6 情绪族)或罗马数字数组(`['vi','IV','I','V']`),两种等效;**完整 18 条卡片**见 [`progressions-library.md`](./progressions-library.md)。**8 条编曲配方**(废墟探索/雨夜街头/教堂哀悼/复古 8-bit/黑色侦探/末日逃亡/童年回忆/悬疑追查)= 完整可拷贝 spec,见 [`audio-cookbook.md`](./audio-cookbook.md)。**真要精确**控制每一音 → 走 `audio.music.midi` 嵌 .mid(audio-advanced.md)。

**batch 3 编曲微调**(沉静预设也升级):
- `rhythm.bassPattern`:support 族 `pedal`(持续低音+末段轻触)/`block`(默认 2 击)/`pulse`(根音+下方五度脉冲)/`syncopated`(反拍重音)/`oompah`/`dotted`；melodic 族 `walking`/`walking-alt`(三击和弦色彩+第四拍休止)
- `padContour`(0..1):≥0.2 触发 pad 2 段轻微 voice leading(让 desolate/eerie 等无 bass 预设也有变化感);<0.2 走旧"长音留白"
- 范例:`music: { preset: 'sad', rhythm: { bassPattern: 'pedal' }, padContour: 0.4 }`
- 所有沉静预设(stealth/sad/eerie/mystery/tense/calm/desolate)已默认配 padContour + bassPattern,直接 `music: 'sad'` 即得升级版;sacral 故意保留 padContour=0.1 < 阈值 = 神圣留白本性

**MIDI 导入**(`{midi:'<base64>'}`): 现成 .mid 嵌进 world.js,引擎零依赖解析 — 详见 [`audio-advanced.md`](audio-advanced.md#midi-导入)。index.html 须额外引 `presenters/midi-music.js`(漏引会运行时报错告诉你加)。

**AmbientSpec 对象**: 自定义噪声层+瞬态 `{ layers:[{ color:'white'|'pink'|'brown', filter:{type,freq,q?}, gainLfo?, filterLfo?, pan?, level? }, …], transients?:[{ kind:'droplet'|'crackle'|'cricket'|'bird', density? }], level? }`——强模型据此拼下游专属声景(如"暴雨远处篝火+近处滴水")。**完整字段 schema 见 `core/module-interface.md` §4.2「v8 加 audio.ambient」**(audio-advanced.md 暂无此节)。

---

## fail-loud / 构建注意

- `music` 未知预设名 → 回退中性曲(不崩);`ambient` 未知预设名 / 非法 AmbientSpec → **抛错**
- graph-audit 静态检查 ambient 预设名 typo(写错=真机每帧报错)
- `bgm` 名含 `tense/night/dread/dark/fear/unease/grief/sad/minor/void/abyss` → 小三度(低沉);否则大三度(明亮)。**悬疑/恐怖题材别用亮名**,首选 `music:'tense'`/`'eerie'`
- 用 `audio.music` 时 index.html 要引 `compose-music.js`(在 present-audio.js 之前;new-game 模板已含)
- `ambient`/BGS 在 present-audio.js 内,无需额外脚本

---

## 玩家侧自动行为

- 页面有 `#plugin-bar` + 挂了音频呈现器 → 自动加 **🔊/🔇 静音钮**(状态跨刷新记忆)
- 不想要 → manifest `present:{audio:{control:false}}`
- 标签页切后台音频继续播 = **有意行为**;玩家用 🔇 或系统静音即可
- 运行时抛错会在页顶显示横幅,提示把错误发回 Claude Code
- autoplay 解锁由呈现器自动处理(首次用户点击解锁),作者无需关心
