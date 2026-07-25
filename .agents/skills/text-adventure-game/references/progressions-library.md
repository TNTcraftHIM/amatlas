# 进行库 (Progressions Library) — 18 条命名和弦进行

> **不懂乐理也能选** — 18 条命名进行,每条配「感觉」「场景」「示例」,挑诗意名字写进 `audio.music.progression` 字段即可。
> 罗马数字内部细节见 §3(底层 escape hatch,一般作者不用看)。

## 怎么用

```js
// world.js 节点
{
  audio: {
    music: {
      mode: 'minor',
      progression: 'lament',           // 直接写名字!
      // ...其它字段
    }
  }
}
```

引擎查表把 `'lament'` 转成罗马数字 `['vi','IV','I','V']`,按当前 `mode` 生成实际和弦。

**fail-loud**:写错名字立刻报错告诉你库里有哪些(**不会**静默回退)。

---

## §1 18 条进行卡片

### 哀伤族 (Sorrow)

#### `lament` — 悲歌
- **罗马数字**: `['vi','IV','I','V']`
- **调式建议**: major(借用感伤)
- **感觉**: 降落如枯叶,悼念逝去的温暖
- **适用场景**: 葬礼、失落时刻、离别独白、怀旧回忆
- **别用在**: 欢快场景、胜利时刻 — 会削弱高度
- **原型**: The xx - Intro

#### `introspection` — 沉思
- **罗马数字**: `['i','VII','VI','VII']`
- **调式建议**: minor
- **感觉**: 在暗中徘徊,寻找那盏灯
- **适用场景**: 夜间独处、自我对话、迷茫的承认、接纳过去
- **别用在**: 紧急行动、战斗场景 — 节奏太迟缓
- **原型**: Radiohead - Pyramid Song

#### `tearful` — 忧伤
- **罗马数字**: `['i','III','VI','VII']`
- **调式建议**: minor
- **感觉**: 哭泣时每个字都无法完整
- **适用场景**: 失恋独白、遗憾梦境、最后告白、记忆闪回
- **别用在**: 战斗 BGM、胜利庆典、活力剧情
- **原型**: Adele - Someone Like You

### 紧张族 (Tension)

#### `conflict` — 冲突
- **罗马数字**: `['i','V','i','V']`
- **调式建议**: minor
- **感觉**: 两股力量在体内扭打,无法和解
- **适用场景**: 内心对抗、选择困境、推拉关系、冲突前夜
- **别用在**: 柔和场景、需要平静的时刻
- **原型**: Trent Reznor - The Perfect Girl

#### `dread` — 恐怖
- **罗马数字**: `['i','II','i','II']`
- **调式建议**: phrygian(最佳),minor 也可
- **感觉**: 黑暗里有东西在靠近,呼吸声越来越清晰
- **适用场景**: 鬼屋、危险逼近、诡异出现、被追赶
- **别用在**: 友好 NPC、温馨团圆场景
- **原型**: Akira Yamaoka - Silent Hill

#### `oppression` — 压抑
- **罗马数字**: `['vi','IV','vi','IV']`
- **调式建议**: major(借用窒息)
- **感觉**: 天空压得很低,每一步都很沉重
- **适用场景**: 末日前夜、绝望处境、逃脱失败、陷阱触发
- **别用在**: 轻松对话、游戏教学
- **原型**: Ennio Morricone - The Good, The Bad And The Ugly

### 史诗族 (Epic)

#### `heroic` — 英雄
- **罗马数字**: `['I','V','vi','IV']`
- **调式建议**: major
- **感觉**: 长剑挥起,天地为之倾斜
- **适用场景**: 战场冲锋、拯救时刻、誓言宣言、命运决战
- **别用在**: 害怕、逃避、内疚的独白
- **原型**: Hans Zimmer - Man of Steel

#### `triumph` — 凯旋
- **罗马数字**: `['I','IV','V','I']`
- **调式建议**: major
- **感觉**: 艰辛过后,终于可以停下来呼吸
- **适用场景**: 击败敌人、完成任务、逃出生天、梦想成真
- **别用在**: 失败结局、牺牲悼念
- **原型**: John Williams - Star Wars Main Theme

#### `solemn` — 庄严
- **罗马数字**: `['I','vi','IV','V']`
- **调式建议**: major
- **感觉**: 宝座前,一切声音都要屏住呼吸
- **适用场景**: 加冕仪式、神圣殿堂、历史叙述、人物介绍
- **别用在**: 调皮、嬉戏、轻松冒险
- **原型**: Vangelis - Chariots of Fire

### 抒情温暖族 (Warmth)

#### `romance` — 爱意
- **罗马数字**: `['I','vi','IV','V']`
- **调式建议**: major
- **感觉**: 眼神相接,整个世界都软化了
- **适用场景**: 初次相识、手牵手、共舞时刻、告白前夜
- **别用在**: 激烈冲突、欺骗揭露
- **原型**: Ed Sheeran - Thinking Out Loud
- **注**: 与 `solemn` 罗马数字相同 — 差异由 tempo/timbre/density 拉开(慢+strings = 庄严,中速+pad = 爱意)

#### `tender` — 柔情
- **罗马数字**: `['I','IV','I','V']`
- **调式建议**: major
- **感觉**: 多年后,还能记得你轻声的笑
- **适用场景**: 夫妻重逢、看顾孩子、家园回忆、细节温度
- **别用在**: 陌生初遇、激情时刻
- **原型**: Bon Iver - Re: Stacks

#### `lullaby` — 摇篮曲
- **罗马数字**: `['IV','I','IV','I']`
- **调式建议**: major
- **感觉**: 妈妈的歌声,让所有害怕都变小了
- **适用场景**: 入睡时刻、安抚哭泣、梦幻转换、回忆童年
- **别用在**: 战斗、逃亡、紧迫剧情
- **原型**: Brahms - Wiegenlied

### 神秘恐怖族 (Mystery)

#### `eerie` — 诡异
- **罗马数字**: `['i','III','VII','i']`
- **调式建议**: minor
- **感觉**: 万物都长出了不该有的角度
- **适用场景**: 怪物出现、精神错乱、魔法诅咒、现实扭曲
- **别用在**: 人类剧情、正常对话背景
- **原型**: Hideki Naganuma - Hot Wind

#### `void` — 空寂
- **罗马数字**: `['vi','IV','vi','IV']`
- **调式建议**: major
- **感觉**: 房间很大,只有风声,没有回音
- **适用场景**: 荒废废墟、孤独漂泊、失业夜晚、镇压不住的虚空
- **别用在**: 热闹场景、人群互动
- **原型**: Mahito Yokota - Gusty Garden Galaxy
- **注**: 与 `oppression` 罗马数字相同 — 差异由 instruments/density 拉开(drone+sparse = 空寂,鼓+full = 压抑)

#### `descent` — 幽谷
- **罗马数字**: `['i','VI','III','VII']`
- **调式建议**: minor
- **感觉**: 峡谷深处有光芒,但越往下温度越冷
- **适用场景**: 地下秘密、古老遗迹、灵魂交易、诱惑陷阱
- **别用在**: 快乐场景、孩子视角
- **原型**: Austin Wintory - Apotheosis (Journey)

### 轻快活泼族 (Playful)

#### `festive` — 欢乐
- **罗马数字**: `['I','IV','I','IV']`
- **调式建议**: major
- **感觉**: 太阳在头顶,所有人都在唱同一首歌
- **适用场景**: 节日庆典、朋友重聚、团队胜利、街头舞蹈
- **别用在**: 悲伤独白、绝望时刻
- **原型**: Foo Fighters - Walk

#### `mischief` — 调皮
- **罗马数字**: `['I','ii','V','I']`
- **调式建议**: major
- **感觉**: 计划中的意外,全是装出来的无辜
- **适用场景**: 淘气孩子、捉弄朋友、聪慧逃脱、搞笑反转
- **别用在**: 严肃决策、悲伤告别
- **原型**: Adventure Time - Main Theme

#### `dance` — 舞蹈
- **罗马数字**: `['V','I','V','I']`
- **调式建议**: major
- **感觉**: 节拍就是心跳,无法停下的靠近
- **适用场景**: 舞池旋转、音乐节狂欢、肢体表达、陶醉境界
- **别用在**: 沉思时刻、逃亡紧张
- **原型**: Daft Punk - Get Lucky

---

## §2 进行族对照速查表

| 族 | 进行 | 典型场景 |
|---|---|---|
| 哀伤 | lament / introspection / tearful | 葬礼、独白、回忆 |
| 紧张 | conflict / dread / oppression | 对峙、追逐、绝境 |
| 史诗 | heroic / triumph / solemn | 战斗、胜利、加冕 |
| 抒情温暖 | romance / tender / lullaby | 爱情、家园、入睡 |
| 神秘恐怖 | eerie / void / descent | 怪物、废墟、深渊 |
| 轻快活泼 | festive / mischief / dance | 庆典、嬉闹、舞会 |

---

## §3 罗马数字 escape hatch(底层细节)

如果 18 条不够用,**直接写罗马数字数组**:

```js
progression: ['i','VI','iv','V']   // 完全等效于命名查表
```

### §3.1 罗马大小写不影响和弦性质

引擎从 `mode + 度数` 推导和弦性质,**大小写仅为可读**:

```js
{ mode:'minor', progression:['i','VI','iv','V'] }    // 推荐写法(易读)
{ mode:'minor', progression:['I','vi','IV','v'] }    // 等价!大小写被忽略
```

你只要保证 **罗马数字** 是七个自然音级之一就行(I/II/III/IV/V/VI/VII,大小写不影响性质)。**不支持** `b`/`#` 变化音前缀(如 `bIII`/`#iv`)——引擎按**度数制**推导和弦(性质从当前 `mode` 音阶自动算出),不是传统调性和声的变化音记谱制;写变化音前缀会被 fail-loud 拒绝(`composeMusic: progression 含非罗马数字`)。传统记谱里的"降三级/升四级"和弦,在这里等价于直接写对应的自然度数(如自然小调下 `III` 本身音响上就是传统记谱的 `bIII`——因为音是从音阶取的,不是从大调基准算变化音)。

### §3.2 mode 与 progression 的兼容性(warn-once,不抛)

引擎设计:
- `mode` 决定**音阶**(每个度数实际是什么音)
- `progression` 决定**和弦走向**(度数序列)

两者可以「不匹配」做借用调:

```js
// 设计意图:lament 是 major 进行,你用 minor 借用 → 听感更哀
{ mode:'minor', progression:'lament' }
```

引擎 `console.warn` 一次:`progression "lament" 设计意图为 major,实际用了 minor(借用调 modal interchange,合法艺术手法,有意?)` —— 但**不抛**(借用调是合法艺术手法,§11 不锚定创意)。

### §3.3 进行长度

- 4 弦一循环(与 PRESET 现有 progression 一致)
- 引擎按段落自动反复
- 自定义长度也支持(任意长度数组),但 < 2 弦时建议加大 tempo 避免单调

### §3.4 fail-loud 三种错法

```js
progression: 'lameent'                       // 拼错 → throw: 未知命名 "lameent" → 已知:lament/...
progression: { custom: ['i','VI'] }          // 对象 → throw: 必须是命名字符串或罗马数组
progression: 42                              // 非串非数组 → throw
```

### §3.5 与 PRESET 的优先级

`audio.music = { preset: 'tense', progression: 'dread' }` —— 进行字段会**覆盖**预设里的进行,其它字段(tempo/timbre 等)继承预设。

---

## §4 设计哲学(给好奇的作者)

- **为什么 18 条而不是 60 条?** §10「不堆抽象」— 18 条覆盖 6 大情绪族 × 3 变异,再多就成乐理百科了
- **为什么允许借用调?** §11「不锚定创意」— 系统给建议(`modeHint`),不强制(只 warn)。Adele 的 `tearful` 用 major 也能哭出花
- **为什么命名 + 罗马并存?** 命名给场景思维的作者(80% 用户),罗马给乐理思维的作者(20% 高级);**真要精确**控制每一音 → 走 `audio.music.midi` 嵌 .mid 文件(见 [audio-advanced.md](./audio-advanced.md))
