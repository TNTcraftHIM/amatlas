# cutscene 过场演出 · 作者手册

给 intro / outro / 结局 / 章节过渡做「按时间轴自动推进的演出」:黑幕起乐 → 字幕浮现 → 场景亮起 → 等玩家确认。
范例照抄 `examples/cutscene-demo`:这是唯一正式 cutscene example,主体保持普通文字冒险,开局、关键剧情和结尾才由 cutscene 临时接管舞台。设计原理见仓库 `docs/cutscene-design.md`(端用户包里没有,不影响使用)。

## 一分钟上手

```js
intro: {
  kind: 'cutscene', title: '序章',
  beats: [
    { dur: 3, text: '海雾压低了海岸线。浪声像从黑幕背后涌来。',       // 第 0 拍:3 秒;文字自足,首拍静音也能读懂
      scene: { region: 'night', mood: 'tense' },                      // 外层 CSS 舞台已给画幅感,不要再叠内部黑边
      audio: { music: 'elegy', ambient: 'waves' } },                  // 主轨 + BGS/环境声同起
    { dur: 4, text: ['灯塔沉默了三十年。', '今晚,雾里先亮起一条裂缝。'] }, // 不写 scene/audio = 画面延续、音乐/ambient 继续
    { dur: 4, text: '白光扫过海面。', scene: { region: 'sea', mood: 'mystic' } },      // 换 scene = 重建出场
    { hold: true, text: '点正文面板结束演出,或选择下方出口进入。',       // hold = 等玩家确认,不计时
      run: function (S) { S.flags.intro_seen = true; } }              // 状态副作用(进入该拍时执行)
  ],
  links: [{ to: 'harbor', label: '进入游戏' }]                         // 出口:必须用 links(见坑 #2)
},
harbor: {
  kind: 'scene', title: '港口',
  audio: { music: false, ambient: false },                            // 过场主轨/海浪不该串到正文 → 显式停
  look: '港口安静下来。'
}
```

world 里出现 `kind:'cutscene'` → `Amatlas.boot` 自动拉过场模块(manifest 零新增键);index.html 加一行
`<script src="../modules/cutscene/runtime/cutscene.js"></script>`(漏引会 fail-loud 指路)。

## 字段表(仅字段存在才校验;违约 throw 点名正确形态)

| 字段 | 类型 | 语义 |
|---|---|---|
| `dur` | 有限正数,**单位秒** | 本拍持续时长,到点自动进下一拍。**别写毫秒**(`dur:3000` = 50 分钟一拍,引擎不猜你的意图) |
| `hold` | 布尔 | `true` = 本拍不计时,等玩家激活正文面板才推进(鼠标/触屏点击,或聚焦后按 Enter/Space;文字重的拍推荐用,也满足无障碍定时可调)。与 dur 同写时 **hold 优先、dur 被忽略**(会 warn) |
| `text` | string \| string[] \| object | 普通 string/string[] 字节级保持整句字幕；对象形见下方 `typewriter` 说明。 |
| `motion` | object | 本拍的扁平关键帧计划，见下方 `beat.motion`。可用于 `dur` 拍或无 `cast` 的 `hold` 拍。 |
| `cast` | object[] | 最多 4 个角色的私有 FK rig 实例；只允许有限正 `dur` 拍，`hold` 拍禁止。完整闭合 schema 见下方。 |
| `speaker` | string | 当前说话者的 `cast[].id`；只与对象形 typewriter 正文同用，并要求该角色具备闭合口型轨。 |
| `scene` | scene 意图对象 | 与 `node.scene` 同词汇(region/mood/elements/transition)。**不写 = 继承上一拍**(画面字节不变 → SMIL 动画相位连续不闪);写了新的 = 整图重建出场(region/mood/elements 任一变都重建) |
| `audio` | audio 意图对象 | 与 `node.audio` 同词汇。**不写 = 全继承**(主轨/ambient 继续播);主轨是 `music` 或 `bgm` 二选一,`ambient` 是可并行的 BGS/空间声;要停主轨写 `music:false`,要停环境声写 `ambient:false`。`sfx` 是逐渲染一次性(该拍每次被渲染都响;要"全局只响一次"改用 run 置 flag 门控) |
| `run` | `(state)=>void` | 该拍开始时执行一次的状态副作用(置 flag / 给物品)。**有账本防重复**:重看/读档重播不再执行 |

### `beat.motion`（扁平关键帧）

`motion` 是本拍私有的有限关键帧计划，不接受 HTML、CSS selector、属性名字符串、函数、事件或 `run`。形状只有 `layers` 与 `tracks`：

```js
motion: {
  layers: [
    { id: 'ship', art: 'ship', x: 52, y: 132, scale: 0.55, rotate: -4, opacity: 0 }
  ],
  tracks: [
    { target: 'ship', property: 'x', keys: [
      { at: 1.8, value: 242, ease: 'ease-in-out' }
    ] }
  ]
}
```

- `layers[].id` 是本拍内唯一的受限标识符；`art` 沿用 SVG presenter 的预设名或受限 art-spec。`x/y/rotate` 默认 `0`，`scale` 默认 `1`，`opacity` 默认 `1`。layer 不接受 `scaleX/scaleY`；`scale` 是两轴唯一的初始比例。
- `tracks[]` 每条只控制一个 `target + property`。属性白名单是 `x/y/scale/scaleX/scaleY/rotate/opacity`；layer 初值是隐式 `t=0` key，`keys[].at` 是后续绝对时间，不是相邻 delta。`scaleX` 与 `scaleY` 的隐式 base 都继承目标 layer 的 `scale`；只写一轴时，另一轴始终保持该 base。
- 同一 target 可以同时写 `scaleX` 与 `scaleY`，但任一轴向 track 与 uniform `scale` track 不得共存；无论数组顺序，后出现 track 的 `.property` 会 fail-loud。旧 uniform 数据仍输出单参数 `scale(s)`，只有存在 axis track 的 layer 才输出 `scale(sx sy)`。
- `keys[].at`、`beat.dur` 都用作者秒，最多三位小数，解析成整数毫秒；`at` 必须大于 0、严格递增，非 `hold` 拍不得超过 `dur`。`opacity` 必须在 `[0,1]`，`scale/scaleX/scaleY` 必须大于 0，所有数必须有限。
- `ease` 白名单是 `linear`、`ease`、`ease-in`、`ease-out`、`ease-in-out`，省略时为 `linear`；常量严格采用 CSS cubic-bezier 定义。
- layer/track/key 的未知字段、重复 id/轨道、缺失 target、空 keys 和错误形状都会在解析期带完整路径抛错。

落地 squash/stretch 用两条标量轨道显式写审美，不会自动保体积。下面同一拍先纵向拉伸，再在触地时横向压缩，最后回到 `layers[].scale`；`y` 轨道与两轴共享同一拍的绝对时间：

```js
motion: {
  layers: [{ id: 'rock', art: 'rock', x: 160, y: 38, scale: 0.9 }],
  tracks: [
    { target: 'rock', property: 'y', keys: [
      { at: 0.42, value: 88, ease: 'ease-in' },
      { at: 0.56, value: 108, ease: 'ease-in' },
      { at: 1.08, value: 108, ease: 'ease-out' }
    ] },
    { target: 'rock', property: 'scaleX', keys: [
      { at: 0.42, value: 0.78 }, { at: 0.56, value: 1.16 }, { at: 1.08, value: 0.9 }
    ] },
    { target: 'rock', property: 'scaleY', keys: [
      { at: 0.42, value: 1.08 }, { at: 0.56, value: 0.66 }, { at: 1.08, value: 0.9 }
    ] }
  ]
}
```

### 对象形 `beat.text`（逐字计划）

对象形文本只接受 `mode:'typewriter'` 与非空 `lines`。每行有 `chunks`，行级 `cps` 可作为默认值，chunk 可覆盖；`pauseAfter` 是该 chunk 完整出现后的显式秒停顿：

```js
text: {
  mode: 'typewriter',
  lines: [{
    cps: 18,
    chunks: [
      { text: '雾先分开。', pauseAfter: 0.28 },
      { text: '一盏灯从海面升起。', cps: 12 }
    ]
  }]
}
```

字素由 `Intl.Segmenter(locale,{granularity:'grapheme'})` 切分，不能用 `split('')` 代替。逐字计划和 motion 计划会挂到模块私有的 `view.cutscenePlayback`，正文 `body` 仍保留完整文本；非 `hold` 拍若逐字总时长超过 `dur` 会 fail-loud。普通 string/string[] 不产生该私有字段。

`hold` 拍没有作者 `dur`，但表现层仍使用 compiler 写入私有 playback envelope 的共享有限 `durationMs`：取 motion 最后一个 key 与 typewriter 总揭示时长的较大值。motion-only 取尾 key，typewriter-only 取揭示时长，空 motion + typewriter 也不会退化成 `0ms`；DOM/SVG presenter 不各自猜时长。非 `hold` 拍始终使用 `beat.dur`。

`presenters/present-timeline.js` 负责 schema 校验、秒到整数毫秒编译、纯采样与唯一 playback manager；它自身不操作 DOM。内置 SVG/DOM presenters 注册为同一 manager 的 consumer，共享一张表现层 rAF：SVG patch motion/cast stage，DOM patch typewriter；cutscene 自己的拍推进时钟仍是另一项职责，不因 stage 动画新增时钟。脚本闭包按作者语义配套：对象形 typewriter 需要 timeline + DOM；声明 motion/cast/speaker 还必须加载 SVG、保留 `#scene` 且不得用 `present.svg:false` 禁用。推荐顺序与正式范例一致：cutscene runtime → DOM → timeline → SVG → world → boot → game。缺 `Intl.Segmenter` 或 timeline 会由 runtime fail-loud；官方 A.boot 路径若声明 motion/cast 却缺 SVG executor/root，则由 assembly-probe 作为 P0 拒绝，不再让文字正常而角色静默消失。

边界要诚实：这是一组稳定矢量实例的 **Flash 式属性补间**，不是重造 Flash/Animate；MVP 不支持嵌套 MovieClip、逐帧手绘、shape hints、任意 path morph、帧脚本或采样级音画锁定。

### `beat.cast[]`、`rig` 与 `speaker`（私有角色骨骼）

`cast` 只允许出现在有限正 `dur` 拍，**禁止与 `hold:true` 同用**。每个成员是闭合的 `{id, rig, stage?}`；`id` 在本拍唯一，并使用 `[A-Za-z_][A-Za-z0-9_-]*` 受限标识符。`rig` 的五个数组 `parts/drawOrder/tracks/variants/secondary` 全部必填；未知字段、重复 id、悬空引用和错误形状都 fail-loud。

下面是一份可直接复制再换 art/坐标的最小双部件说话角色。`speaker` 必须精确等于一个 `cast[].id`，并与非空对象形 typewriter 正文同用：

```js
{
  dur: 2,
  cast: [{
    id: 'guide',
    stage: { facing: 'as-authored' },
    rig: {
      parts: [
        {
          id: 'body', parent: null, art: 'figure', pivot: { x: 0, y: 0 },
          rest: { x: 160, y: 106, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 }
        },
        {
          id: 'mouth', parent: 'body',
          art: [{ shape: 'line', x1: -4, y1: 0, x2: 4, y2: 0, stroke: '#681f32', sw: 1 }],
          pivot: { x: 0, y: 0 },
          rest: { x: 0, y: -14, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 }
        }
      ],
      drawOrder: ['body', 'mouth'],
      tracks: [],
      variants: [{
        target: 'mouth', base: 'rest',
        states: [
          { id: 'A', art: [{ shape: 'line', x1: -4, y1: -2, x2: 4, y2: 2, stroke: '#681f32', sw: 2 }] },
          { id: 'O', art: [{ shape: 'circle', cx: 0, cy: 0, r: 3, fill: '#681f32' }] }
        ],
        keys: [
          { at: 0.3, value: 'A' },
          { at: 0.7, value: 'O' },
          { at: 2, value: 'rest' }
        ]
      }],
      secondary: []
    }
  }],
  speaker: 'guide',
  text: { mode: 'typewriter', lines: [{ cps: 8, chunks: [{ text: '雾里有人回答。' }] }] }
}
```

`rig` 的闭合 schema 与合法值：

- `parts[]`：每项必须完整写 `{id,parent,art,pivot,rest}`。`parent` 是另一个 part id 或根节点专用的 `null`；**单 rig 恰好一个 `parent:null` 根**，整棵树连通、无环、深度最多 16。`pivot:{x,y}` 与 `rest:{x,y,rotate,scaleX,scaleY,opacity}` 均为有限数；两轴 scale 必须 `>0`，opacity 在 `[0,1]`。
- `drawOrder[]`：必须是所有 part id 的精确排列，不增、不漏、不重复；它只决定 SVG 前后顺序，不改变 parent FK 层级。
- `tracks[]`：形状为 `{target,property,keys:[{at,value,ease?}]}`。`property` 只允许 `x/y/rotate/scaleX/scaleY/opacity`，同一 `target+property` 只能一条；`at` 用秒、`>0`、最多三位小数、严格递增且不超过 `beat.dur`。`ease` 只允许 `linear/ease/ease-in/ease-out/ease-in-out`；scale 值 `>0`，opacity 值在 `[0,1]`。
- `variants[]`：形状为 `{target,base,states:[{id,art}],keys:[{at,value}]}`，每个 target 最多一个 slot。`base` 是 part 当前 art 的语义状态名，不能与非空 `states[].id` 重名；key 的 value 只能是 base 或 state id，时间规则同 tracks，keys 可为空。
- `secondary[]`：同一 `target+property` 最多一项，只允许下面四种确定性类型。每项都必须在整个 beat 内证明叠加后 scale 仍 `>0`、opacity 仍在 `[0,1]`；`x/y/rotate/scaleX/scaleY/opacity` 的最大绝对附加量依次为 `64/64/180/0.5/0.5/1`。

四种 `secondary` 合法形状：

```js
{ type: 'follow', source: { target: 'body', property: 'y' }, target: 'mouth', property: 'y', delayMs: 80, gain: 0.4, min: -4, max: 4 }
{ type: 'oscillate', target: 'body', property: 'rotate', periodMs: 1800, amplitude: 2, phase: 0 }
{ type: 'blink', target: 'body', property: 'scaleY', closedValue: 0.08, windowMs: 2400, durationMs: 120, chance: 0.7, seed: 7 }
{ type: 'noise', target: 'body', property: 'x', windowMs: 160, amplitude: 1.5, seed: 11 }
```

- `follow`：source 不能就是目标属性；`delayMs` 为 `1..2000` 整数，`gain` 在 `[0,2]`，`min<=0<=max`。
- `oscillate`：`periodMs` 为 `100..60000` 整数，`amplitude>0`，`phase` 在 `[0,1)`。
- `blink`：property 固定 `scaleY`；`closedValue` 在 `(0,1]`，`windowMs` 为 `250..10000` 整数，`durationMs` 为 `40..500` 且小于 window，`chance` 在 `(0,1]`，`seed` 是 uint32。
- `noise`：`windowMs` 为 `16..60000` 整数，`amplitude>0`，`seed` 是 uint32。

硬预算按 **单 rig / cast 聚合** 两层同时计算：角色最多 `4`；parts `32 / 64`；tracks `64 / 96`；numeric keys `512 / 512`；variant slots `8 / 16`；variant states `32 / 48`；variant keys `128 / 192`；secondary `16 / 32`。每个 rig 的最长时间轴是 **60 秒**。单 rig 的 base + 全部 variant art primitives 合计最多 `256`；同拍 cast 聚合最多 `512`；preset 按展开后的图元数计入，而不是只算一个 preset 名或当前可见 variant。超限会在创建任何 cast stage 前 fail-loud，不能靠“只显示一个状态”绕过。终帧还必须保证根节点 world opacity `>=0.01`，根 pivot 的 world 坐标留在 `x:[0,320]`、`y:[0,180]` 海报边界内。

`beat.speaker` 有额外口型硬约束：说话角色必须有 id 为 `mouth` 的 part，以及 target 为 `mouth`、base 为 `rest` 的 variant slot；states 必须同时含 `A`、`O`，keys 非空、实际使用 `rest/A/O`，最后一 key 必须精确位于 `beat.dur` 且回到 `rest`。非 speaker 角色的 mouth keys 禁止使用 A/O。系统不做自动 lip sync，作者显式写口型节奏。

#### 作者侧语义动作配方

角色动作重复出现时，可以在自己的 `world.js` 写一个有剧情意图的纯函数，例如 `makeWalkAndPointRig(rootX, bodyFill, seed)`，由它返回上面五个数组齐全的闭合 Rig；beat 只调用这个名字清楚的配方，不必每次展开整套 parts/tracks。引擎不会识别 `walk-and-point`、`gesture`、`action` 或 `clip` 字段，也没有公共动作 registry：helper 只是作者数据的确定性构造器，输出仍会经过同一套 schema、poster 与预算闸。

完整可运行写法见 `examples/rig-showcase/world.js`。优先把 helper 留在作品或正式 example 内，按角色比例、画风与舞台重写；不要复制一份通用 humanoid 后把它误当所有作品必须依赖的内置模板，也不要在 helper 里创建 timer、rAF、DOM 操作或跨拍角色状态。

### `beat.cast[].stage`（角色朝向、入场与尾窗退场）

`stage` 存在时 `facing` 必填，只能是 `as-authored` 或 `mirror-x`。`enter` 与 `exit` 都是闭合 schema；作者只能写以下字段：

```js
stage: {
  facing: 'mirror-x',
  enter: { offset: { x: 64, y: 0 }, dur: 0.6, ease: 'ease-out' }, // ease 缺省 ease-out
  exit:  { offset: { x: 64, y: 0 }, dur: 0.6, ease: 'ease-in' }   // ease 缺省 ease-in
}
```

- `offset` 必须同时含有限数 `x/y`，且 `|x|<=320`、`|y|<=180`；`dur` 是有限正秒并须精确转为整数毫秒。`ease` 仍只接受 `linear/ease/ease-in/ease-out/ease-in-out`。
- `exit` 不接受 `at` 或任何未知字段。它固定占据 beat 尾窗：内部 `startMs = beat.durationMs - exit.durationMs`，作者不重复填写起点。
- 同时写 `enter/exit` 时，两者时长之和不得超过 `beat.dur`；精确相接合法，重叠直接报错。每帧把两者 offset 相加、opacity 相乘，mirror 仍围绕该帧角色根 pivot，角色内部 FK 不变。
- exit 只是视觉效果，不写 state、不执行 `run`、不发完成事件，也不门控正文推进或末拍出口。逐拍快进可以直接跳过剩余退场；对象形正文的“立即显示”只完成文字揭示，不换 playback key，退场时钟继续。
- `prefers-reduced-motion` 下直接采 beat 终点，带 exit 的角色会立即处于作者 offset 且不可见，不启动额外动画帧。因此正文必须在没有退场动作过程时仍能独立说明剧情。

玩家动作面(引擎自动给,不用写):首拍/中间拍由正文面板承担推进；**到最后一拍才在 `#choices` 出现 `links` 出口**。runtime 内部仍使用 `cutscene:next` 动作,但 DOM 不渲染独立 next 按钮。玩家可连续点击正文或聚焦后按 Enter/Space 逐拍快进,但不能绕过中间拍的 `run` 直接离场；没有“锁住必看”的开关。

## 沉浸过场配方(制图师式舞台感)

沉浸感不是“强制玩家看完”,而是舞台、声场、文字节奏和可跳过信任一起工作。

1. **第一拍建立舞台**
   - 优先让外层 CSS 舞台负责画幅与留白;如果页面已经是 21:9 舞台,不要再叠 `scene.elements:[{kind:'letterbox'}]`,否则会出现双重黑边;
   - 用深色/夜色/mystic/tense 这类 region+mood 建立气质;
   - 首拍文字必须自足:浏览器音频可能因为 autoplay 策略在第一次点击/按键前静音,关键剧情不能只靠声音。

2. **声音分层要写准**
   - 主轨只选一个:`music:'elegy'` 或 `bgm:'ambient-unease'`。不要写成“music + bgm 双主轨”。
   - `ambient:'waves'` / `ambient:'rain'` 是 BGS/空间声,可以和主轨并行。
   - `sfx` 用来点关键事件,不要每拍滥用;它是逐 render 一次性,不负责长期氛围。

3. **离开过场要收声**
   - `audio` 缺省继承是好事:中间拍不写,音乐/海浪就连续不断。
   - 但正文若不该继续过场主轨或海浪/雨声,必须显式 `music:false` / `ambient:false`,或换成正文主轨/环境。
   - 范本推荐在过场后的第一个正文节点写 `audio:{ music:false, ambient:false }`,最清楚。

4. **全屏观感靠 CSS,不要破坏正文控制或作者出口**
   - 唯一可用 next 存在时,`#look` 自动获得 `role="button"`、`tabindex="0"`、`data-cutscene-next` 和双态可访问名称；不要移除焦点环、阻断 pointer/keyboard 事件或覆盖这些现役属性。
   - `#choices` 只渲染作者写的 actions/links。末拍出口仍依赖该挂载点,不可删除、不可 `display:none`、不可 `pointer-events:none`；中间拍 `#choices` 为空是正常现象。
   - 如果写 CSS 动画,给 `@media (prefers-reduced-motion: reduce)` 降级。

5. **文字节奏与动画数据**
   - 普通字幕仍可用短句、多拍、hold 和黑幕/亮场变化；对象形 typewriter 只写上面的结构化 chunks，不在字符串里嵌标签。
   - 当前对象形文本已由 `present-dom` 逐字绘制，并与 SVG motion/cast 共用表现层 playback manager；正文面板在揭示未完成时先立即显示全文，下一击才换拍。不要另写第二套打字机、推进按钮或 rAF。

## run 与逐拍快进(最重要的心智)

**每次进入一拍才执行该拍的 `run`**。连续激活正文面板只是把等待时间压到零，仍按顺序经过每一拍；末拍前没有出口可绕开中间状态。因此:

- 剧情后果(开 flag / 给物品 / 解锁)**全写在对应 beats[i].run 里**；无论自然播放还是连续快进，都会按拍顺序执行。
- 手动激活正文进入目标拍时，目标 `run` 成功后才提交游标和账本；抛错则停在原拍、出口仍隐藏，可修复后重试。自动播放为避免每帧无限重试，保留“记录错误但进入目标拍并继续时间轴”的容错；失败 run 在抛错前已写的副作用无法自动回滚，所以 run 内先校验、后改状态。
- 要"每次经过这个节点都执行"的效果(计数器类)→ 写在**进入该节点的 link.run** 或出口 link.run 上；beats 的 run 一个 state 只执行一次。末拍 `link.run` 可返回非空字符串作为本次回应；引擎先在源过场显示回应，再给「继续 →」导航，避免文字被目标节点吃掉。待继续目的地入档，回应文本本身不入档。

## 存档 / 重进语义(有意设计,不是 bug)

- 播放进度(第几拍)**不入档**:刷新 / 读档回到过场节点 = **从头重播**(A/V 重放;run 有账本不重复)。
- save 插件的 `:auto` 槽停在「进入过场那一刻」(拍推进不发 enter);读 `:auto` 从过场头重播。
- 结局过场:`links: []` → 演完停在末拍帧就是结局画面(graph-audit 报 P2 死胡同 = 有意结局,可忽略)。

## 常见坑(每条都有闸或明确症状)

1. **dur 写了毫秒**:`dur: 3000` = 50 分钟。单位是秒,没有运行时猜测。
2. **出口写成 `exits`** → 解析期 throw。cutscene 只认 `links`；`exits` 会被核心在每拍直接并入动作，绕过末拍门控与 `link.run` 回应包装(门控字段 `available` 改 `requires` 即可)。
3. **「看完过场」成就写 `on:'enter'`** → 永不触发(演出期间不再发 enter)。**用 `on:'action'`** 查末拍 run 置的 flag:每拍推进都是 action、都会查(见 `examples/cutscene-demo/game.js`)。
4. **想要拍间"淡入淡出"写 `scene.transition`** → 不生效(transition 只在**进新节点**时播一次,拍间是同节点重渲染)。拍间视觉语言 = 继承(连续)/ 换 scene(重建出场);要黑幕过渡就写一个黑 mood + letterbox 的拍。进出 cutscene 节点时 transition 照常有效。
5. **index.html 删了 `#look` 或 `#choices`** → `#look` 同时承载正文与 runtime 推进控制,`#choices` 承载作者出口；缺任一挂载点都会丢失对应交互(呈现器找不到挂载点静默 no-op)。要全屏电影观感 → 调整两者 CSS,**别删 id**。
6. **音乐/ambient 串到正文** → 不是 bug,是 v15 继承语义。中间拍不写 audio 会继承;正文不想继承就写 `audio:{ music:false, ambient:false }`、换新主轨/ambient,或只停其中一层。
7. **把 `music` 和 `bgm` 当两条主轨同播** → 错。主轨二选一;要空间声用 `ambient`。
8. **把首拍声音当唯一线索** → 浏览器可能还没解锁音频。关键线索同时写在文字或画面里。
9. **发布后向 beats 中间插/删拍** → 老玩家存档的 run 账本按位置记,会错位(已跑的拍被当没跑/反之)。**只向末尾追加**;要大改就当新节点(换节点 id)。
10. **地图/节点 id 里用 `/` 或 `#`** → 与账本键分隔符冲突,别用(引擎 actionKey 同款约定)。
11. **构建 `--smoke` 的 check4 报"点一下未检测到切换"警告** → 对 cutscene 页**属预期**(jsdom 的限帧 rAF 驱动不了拍推进),不是失败、不阻断构建;真机/双击核实即可。
12. **提前用 CSS/脚本伪造出口** → 会绕过末拍门控。中间拍只有带 `data-cutscene-next` 的正文面板可推进；末拍出现的 `.choice.move` 才是作者出口,可按作品气质调整透明度/位置,但不能隐藏。

## 配方速查

- **intro**:第 0 拍 CSS 舞台 + music/bgm 主轨 + ambient 空间声 + 字幕 → 中间拍换字幕(继承 scene/audio)→ 场景亮起拍(换 scene)→ 末拍 hold + run 置 flag;`links` 指向正文,正文显式 `music:false` / `ambient:false` 或换正文声场。
- **结局 / outro**:`links: []`,末拍 hold(结局画面常驻);run 置 `story_done` 类 flag 供成就查。若不想沿用上个场景声场,第一拍写 `ambient:false` 或新 ambient。
- **章节过渡**:正常 links 进出;想要"每章计数"写在进入它的 link.run(见「run 与跳过」第 3 条)。
- **混排**:cutscene 与 scene/encounter/maze3d 自由连接(links 是全 kind 通用出口);过场里不做检定/移动,那是正文节点的事。
