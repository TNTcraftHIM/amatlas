# Visual System — 作者必读核心

> **作者只声明意图,不写一行 SVG。** 节点上写 `scene:{ region, mood, elements, transition }`,
> 呈现器 `presenters/present-svg.js` 据此画 SVG——零素材、零依赖、`file://` 可跑。
> **world.js 里不写 SVG / Canvas / 滤镜。** 没挂 SVG 呈现器时 `scene` 无人消费 → 优雅退化为纯文字。

**深层绘制内部 / 扩呈现器加新效果 / 构图配方 / 粒子插件 / 文字动画 CSS / 渐进式揭示 → [`visual-advanced.md`](visual-advanced.md)**

---

## 节点里怎么写 scene

```javascript
// world.js —— 节点只声明意图,不写实现
shore: {
  kind: 'scene', name: '海岸',
  scene: { region: 'beach', mood: 'calm', elements: [ { kind: 'character', ref: '提灯人' } ], transition: 'fade' },
  audio: { music: 'pastoral' },
  look: { first: '你睁开眼,被冲上一片黑色的沙滩。', return: '熟悉的黑沙滩。' },
  links: [ { label: '走向森林', to: { map: 'forest', node: 'edge' } } ]
}
```

| 字段 | 作用 |
|---|---|
| `region` | 背景基色 + 地形剪影 + 氛围点缀 + 光柱几何(场所感) |
| `mood` | 半透明色调 **+ 触发的演出效果**(光柱/天气/雾/调色/扭曲) |
| `elements` | 语义图元数组(角色/物品/危险/出口/骰子/眼睛/黑边) |
| `transition` | 进入此节点时的过场(fade/slam/cut) |

---

## region(13 个,逐字抄)

| region | 适合场景 |
|---|---|
| `beach` | 黑沙/暖沙海岸 |
| `sea` | 海面 / 退潮礁石 |
| `forest` | 紫色 / 深绿森林 |
| `night` | 夜林 / 夜路 / 深处 |
| `cave` | 洞穴 / 地下 |
| `room` | 室内 / 醒转角落 |
| `ruins` | 神庙 / 遗迹 |
| `town` | 村落 / 城镇 |
| `desert` | 沙漠 / 沙丘 / 荒漠 |
| `snowfield` | 雪原 / 冰原 / 苔原 |
| `volcano` | 火山 / 熔岩 |
| `skyclouds` | 天空 / 云海 |
| `swamp` | 沼泽 / 湿地 |

> **常见近义词(中英 + CJK)会被归族识别**(`village`/`村庄`→town、`dungeon`/`矿洞`→cave、`ocean`/`湖`→sea、`temple`/`神殿`→ruins、`dune`/`沙丘`→desert、`glacier`/`冰原`→snowfield…,全表见 advanced)。**完全未知的词**(如拿章节名 `heart`/`ending` 当 region)→ 只得确定性深色调色板、**没有剪影/点缀**。要完整场景感请用上表 13 词或其近义词。**注:自定义 region 词本身合法**——得确定性深色基调(无剪影点缀),适合极简/抽象/室内/超现实风;这与"误拿章节名当 region 却期待场景感"不同(后者是把章节/主题放节点名/地图名的反模式)。即:想要剪影点缀=用 13 词;想要极简纯色基调=随便命名也行。

---

## mood(色调 + 触发的演出效果)

`mood` 先叠一层**半透明色调**(`MOOD_TINT`,常驻):

| mood | 氛围 |
|---|---|
| `calm` | 平静(冷蓝) |
| `cold` | 冷峻(浅蓝) |
| `warm` | 温暖(暖橙;篝火/村落) |
| `eerie` | 诡异(紫) |
| `tense` | 紧张(暗红) |
| `dread` | 恐惧(近黑红) |
| `horror-climax` | 恐怖高潮(血红) |

mood 还会**触发程序化演出效果**(作者只写对触发词,效果自动出现,不写一行滤镜)。**克制用**:契合调性才上(回忆场景上 `memory`、教堂上 `holy`),别一个场景堆光柱+雨+扭曲+调色。主路径仍是「氛围场景 + 文字叙事」。**`mood` 是开放词汇,不是枚举**:下面列出的词有配套演出效果;你也可以写**表外的任意情绪词**(`nostalgic`/`surreal`/`claustrophobic`… 自由命名)——场景照常渲染、不报错,**只是没有那层叠加演出**(静默退化)。即创作不受词表限制,词表只是"有现成演出的那些"。

**体积光柱 / god-rays**(神圣/黎明/天井透光):
`holy` `divine` `sacred` `radiant` `glory` `heavenly` `ethereal` `godlight` · `dawn` `sunlit` `sunbeam` `shafts` `hope`

**天气粒子**(户外/物理临场):
`rain` `drizzle` `storm`(暴雨+雷闪) · `snow` `flurry` `blizzard` · `ash`/`ashfall`(火山落灰) · `ember`/`embers`(飞烬) · `sandstorm`/`sandblast`(沙暴) · `leaves`/`leaffall`(落叶) · `groundfog`(地面雾带)

**流动雾**(诡异/阴冷/起雾;室内外皆可):
`mist` `fog` `foggy` `misty` `haze` · `eerie` `dread` `cold`(这三同时是 MOOD_TINT → 雾 + 色调一起来)

**电影调色**(整场统一调色,一次性定调):
`memory`/`flashback`/`sepia`(棕褐回忆) · `otherworld`/`fae`/`astral`(异界色相流转) · `dusk`/`aurora`/`dreamlike`(色温极缓漂移) · `dying`/`shock`/`numb`(去色冷调/濒死) · `poison`/`venom`/`toxic`(毒绿) · `magic`/`arcane`(魔法紫)

**画面扭曲**(物理介质扰动):
`heat`/`shimmer`(热浪) · `underwater`/`ripple`(水下/水波) · `mirage`(海市蜃楼) · `warp`(梦境/空间扭曲,最强)

**未识别的 mood = 开放词汇、优雅退化(showcase round13 实测踩空)**:上面这些是会**触发效果**的词。写一个表外的词(`sacral`、章节情绪名…)**不报错、场景照常渲染**(region 基色+剪影+点缀),只是**没有那层色调/光柱/天气叠加**——所以"写了 mood 却看不出区别"多半是词没在表上。要某种确定氛围,就从上面挑词;常见踩空 + 该用的:
- **悲伤/低沉**:`sad`(灰蓝压暗+去饱和冷调)/ `desolate`(尘褐压暗+尘霾雾)已有专属色调(与同名 bgm 预设音画一致);更沉用 `dying`(去色冷调,最沉);`somber` 仍无专调 → 用 `sad`。
- **神圣**:用 `sacred` / `holy` / `divine`(**不是 `sacral`** —— 差一个字母就没光柱)。
- **想要飘落的雪/雨**:mood 必须填**天气词** `snow`/`blizzard`/`rain`(才出粒子);`cold` 只给冷色调、**一片雪都不下**。一个 `mood` 只能填一个值 → 雪山段想看见雪,填 `snow`/`blizzard`,别填 `cold`(色调由 snowfield region 基色+暗角已经够冷)。

> **冷暖景深(`grade`,game.js 选项,非 mood)**:`engine.use(Amatlas.SvgPresenter.createSvgPresenter({ slot:'#scene', grade:0.6 }))` 给整部游戏加「远青近橙」电影级大气透视(默认 OFF=字节不变)。

---

## elements(语义图元)

`element.kind → 图元`(`ref` 是标签/数量,`state` 给状态着色):

| kind | 图元 | 用途 |
|---|---|---|
| `character` | 剪影人影(默认 `figure`) | NPC / 角色(`ref`=名;加 `art:'robed'/'guard'…` 换造型) |
| `item` | 方块 | 物品 / 道具 |
| `hazard` | 三角 | 危险 / 异象(抽象标记) |
| `exit` | 门 | 出口 / 通道(抽象标记) |
| `dice` | 骰子(`ref`=点数,`sides`=面数,`state`=success/fail/crit/fumble→着色+特效)。**跑团检定时引擎自动注入并播掷动动画——别在 `elements` 里手写骰子当装饰**(一进节点就会"滚"出来;且真检定时会与自动注入的骰子重叠成两个)。要桌面骰子摆设,用 `art:[…]` art-spec 画静态骰子 | 跑团检定反馈(引擎自动注入,作者通常不手写) |
| `eyes` | 眼睛(`state`=watching/bleeding/closed/crying/swarm;`ref`=数字串/`fullscreen`) | 恐怖演出 5 态:活眼注视/渗血/死寂闭目/哀悼/虫群窥视(用例见 horror-game-design §4.1)。⚠️ **基调自检**:`bleeding`(渗血 body-horror)/ `swarm`(漫天虫群眼)是**重恐怖**演出——轻松/治愈/探索基调**别用**(端用户实测:治愈系游戏里出现渗血眼/漫天眼很违和)。轻松题材想要"被注视感"用 `watching`(克制)、伤感收尾用 `crying`/`closed`。 |
| `letterbox` | 上下画幅黑边 | 电影感 / 高潮 overlay |
| `claw` | 3-4 道平行斜痕(深红;静态) | 被攻击残留 / 怪物路过痕迹 |
| `swallow` | 同心暗色椭圆 + 缓慢旋转 | 被吞噬 / 坠入虚空 / 沉没结局 |

未知 `kind` 退化为圆,不崩、不漏画。未知 `eyes.state` warn-once + 退化 `watching`(开放词汇 fail-loud over fail-silent)。
**下游扩展**:更多视觉词汇(`wide-open` 狂喜眼 / `vortex-fade` 渐隐漩涡…)→ fork `engine/presenters/present-svg.js` 加分支(同 `buildEyes`/`buildClaw` 范式)。引擎未发布、改源即扩展点;不引入注册接口(§10 不堆抽象)。

**三条铁律(showcase 实测踩过,务必遵守)**:
1. ⚠️ **`eyes.ref` 是数量或 `'fullscreen'`,不是实体名**:写 `ref:'天裂之眼'` → 退化成 2 只眼(并 warn)。全屏单巨眼写 `ref:'fullscreen'`。
2. ⚠️ **`elements[]` 数组顺序 = 景深**:靠后的画得**更近更大更前景**,靠前更远更小。**焦点角色 / 主体物件放数组末项**才会大而突出(放首项会被画成远景小人)。
3. ⚠️ **`hazard`(裸三角)/ `exit`(裸门)是抽象标记,不是精致美术**:大量使用会像占位符(实测:十几个「天裂/巨浪/暴雪」做成黄三角)。**氛围/天象概念**(裂痕、风暴、灰烬)交给 `region`/`mood`/天气词渲染;**需要像具体物件**的焦点用 `art:`(见下)。**round12 补:云/浪/礁/山/锚等自然·海洋物件现已有预设**——焦点的雷云/巨浪/礁石写 `art:'cloud'/'wave'/'rock'`(别再 `kind:'hazard'` 裸三角);整片风暴氛围仍走 `mood:'storm'`(天气粒子+冷暗色调)。

**`eyes` / `letterbox` 的层叠(overlay 特种 kind,不参与上面第 2 条的景深排序)**:
- **`eyes`** 在普通物件之后、`mood` 色调层**之前**画 → 会被 `mood` 色调染色(`dread`/`horror-climax` 给眼睛叠红/黑调=有意氛围;不想要就别设该 `mood`)。
- **`letterbox`** 延后到**所有层之上**(剪影/图元/eyes/mood 色调/天气/暗角/调色之后)=绝对最顶层、始终纯黑;数组里写多个只渲染一次,放首项末项都一样、不受景深顺序影响。

---

## element.art(可选,焦点物件具体化)

> **先定位**:**主路径 = 氛围场景(region/mood)+ 把物件写进 `look()` 叙事文本**(文字能写出质感/气味/历史,远比简笔图标丰富)。`element.art` 是**可选增强**,只给**某个焦点物件**(本节核心道具/主角)一个具体图形用。程序化图标本质是几笔几何形(引擎已自动加接地影/体积/轮廓光),**仍是「图标」级、非精致插画**——别拿它当所有物件默认,滥用会显得简陋。**多数物件留白 + 文本;少数焦点才上 `art`。**

两种写法(与 `audio` 的「预设名 | 自定义」二元一致):

**① `art: '<预设名>'`(字符串=内置图标,首选、可靠、风格统一)。35 个:**
- **物件**:`ship` `lantern` `altar` `tree` `key` `chest` `sword` `fire` `statue` `crystal` `well` `skull` `book` `potion`
- **自然/天气**:`cloud` `wave` `rock`(礁石/巨岩,reef 同用) `mountain` `sun` `moon` `bird` `flower`
- **常用物件**:`coin`(金币堆) `scroll`(卷轴/书信/海图) `banner`(旗) `shield`(盾) `house`(房屋) `barrel`(木桶) `anchor`(锚)
- **6 剪影人物/生物**(焦点 NPC 的「存在标记」,非肖像;身份/相貌靠 `look()` 文本):`figure` `robed` `hooded` `guard` `beast` `crowned`
- **未知预设名 → 退化为抽象 glyph + `console.warn`**(不崩,但物件画不出)→ 照清单写对名字。

**② `art: [ {shape,…}, … ]`(数组=art-spec DSL,画清单里没有的独特焦点物件)。** 约束形式(6 种 shape + 安全 attr),放开内容(画什么):

| shape | 必需 attr | shape | 必需 attr |
|---|---|---|---|
| `circle` | `cx, cy, r` | `ellipse` | `cx, cy, rx, ry` |
| `rect` | `x, y, w, h` | `polygon` | `points`(`"x,y x,y …"`) |
| `line` | `x1, y1, x2, y2` | `path` | `d`(仅 `MLHVCSQTAZ`+小写+数字) |

通用可选样式:`fill` · `stroke` · `sw`(描边宽,数) · `op`(透明度,数)。颜色写 `#hex`/`rgb()`/`rgba()`/`hsl()`/具名色/`none`。

**本地居中坐标(±15 约定)**:以 **(0,0) 为物件中心**画,范围约 **±15 单位**;引擎自动包 `<g transform="translate(slotX,slotY)">` 放到 scene 槽位。你只管「以原点为中心画这个物件」。预设图标本身就是用这套 DSL 写的(`ART_PRESETS`)——既是可靠图标,又是教你写 art-spec 的活样板。

> **调试技巧:写 art-spec 不必盲猜坐标。** 把图元数组存成 JSON 文件,跑 `node core/tooling/art-spec-preview.mjs art.json preview.html`,浏览器打开即见 **±15 坐标网格 + 真实渲染**;改了重跑即可,**不必构建整个游戏**。也接受 stdin 管道(`echo '[…]' | node …/art-spec-preview.mjs -`)和内置预设名(`echo '"ship"' | …`);`--list` 列出全部预设名。

```javascript
// 范例:art-spec 画一艘船(船身梯形 + 桅杆 + 三角帆)
{ kind: 'item', ref: '渔船', art: [
  { shape: 'polygon', points: '-13,5 13,5 9,13 -9,13', fill: '#6b4a2b', stroke: '#3a2a1a', sw: 1 },
  { shape: 'line', x1: 0, y1: 5, x2: 0, y2: -14, stroke: '#3a2a1a', sw: 1.5 },
  { shape: 'polygon', points: '1,-13 11,2 1,2', fill: '#e8e0cf', stroke: '#9a8f78', sw: 0.8 }
] }
```

**fail-loud**:非法 art-spec(未知 shape、缺必需 attr、类型错、`fill` 非颜色、`d`/`points` 含非法/注入字符如 `<script`/`on*`/`url(`)→ **throw**(构建/探针会报、必须修)。未知**预设名** → 不 throw,退化 glyph + `console.warn`。

> **哲学**:背景氛围由呈现器画(region/mood);`art` 只画焦点物件。别想用 art 手绘整个背景——那是呈现器的职责;art 是 escape hatch,只为让那「一艘船」真的是一艘船。

---

## transition(过场)

```javascript
waking:   { scene: { region: 'room',  mood: 'eerie',         transition: 'fade' } },
beyond:   { scene: { region: 'night', mood: 'horror-climax', transition: 'slam' } },  // 高潮猛切
consumed: { scene: { region: 'night', mood: 'horror-climax', transition: 'cut'  } }   // 结局直切
```

契约 §4.2 冻结的三个值:
- **`fade`**:柔和淡入(~0.8s)。平静推进、记忆浮现。
- **`slam`**:猛烈冲击(爆闪 + 抖动,~0.5s)。惊吓、高潮转折。
- **`cut`**:直切,**不放过场**。冷峻结局。

present-svg **仅在「进了新节点」时放一次**;纯动作 re-render(原地)不重放。未知值退化为不放过场。(扩新过场类型见 advanced。)

---

## 强 AI:超越预设

预设效果 + 触发词是**快速天花板**。想做我们没预设的效果(极光、流星雨、血月…),两条创新路,都不必退回手搓:

- **路①(零代码,先试)**:用已开放的受限 DSL / Spec 契约拼新东西——`element.art`(art-spec 画自定义焦点物件)、`audio.music`(MusicSpec 程序作曲)/ `audio.ambient`(AmbientSpec 拼声景)。在契约内、三闸天然覆盖、最可靠。
- **路②(扩 present-svg)**:`present-svg.js` 是**这个游戏**的呈现代码,可为它扩(加 mood 触发词表 + 生成函数 + buildSceneSVG 注入,守确定性/停止态可见/别写 `#000`)。**完整步骤、范式、安全约束见 [`visual-advanced.md`](visual-advanced.md)**。

> 约束的只是**形式契约**(确定性 / 安全 / 可测),放开的是**你画什么、谱什么**(`docs/design-principles.md` §11)。

---

> **想丰富画面到下一层**(5 层构图智慧、各分区构图配方、背景调参、粒子插件、文字动画 CSS、戏剧模式、渐进式揭示节奏、完整视觉数据流)→ 全在 [`visual-advanced.md`](visual-advanced.md)。日常创作用本页词汇即可。
