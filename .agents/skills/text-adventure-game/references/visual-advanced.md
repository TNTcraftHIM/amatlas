# Visual System — 进阶 / 呈现器内部

> **何时读这页**:你想**扩** `present-svg.js` 加一个我们没预设的效果(极光、流星…)、写**粒子插件**、或要**构图 / 调参 / 文字动画 / 渐进式揭示**的生产配方时。
> **作者日常创作只需** [`visual-system.md`](visual-system.md)(region/mood/elements/art/transition 词汇)。这页是**深层实现智慧**,给强模型「融会贯通」用——预设给地板、扩呈现器给天花板。

实现锚点:`presenters/present-svg.js`、`examples/horror-demo/`(演出压测:眼睛/黑边/过场)、`examples/text-adventure-demo/`(beach/forest 基础场景)、契约 `core/module-interface.md` §4.2 / §10.2。

---

## 路②:扩 `present-svg.js`(加我们没预设的效果)

`present-svg.js` **不是神圣核心**——它是打进**这个游戏**单 HTML 的呈现代码,可为这个游戏改/扩(`CLAUDE.md`/SKILL 已立此原则)。想要一个我们没做的 mood 效果(如**极光**):

1. **加触发词表**(仿 `LIGHT_MOODS`/`WEATHER`/`FILM_GRADE`/`DISPLACE`,mood-gated → 不触发时字节不变)。
2. **复制/改一个生成函数**:剪影看 `buildSilhouette`、氛围点缀/辉光看 `buildAtmosphere`、光柱看 `godRays`、天气看 `buildWeather`、调色看 `filmGradeFilter`、扭曲看 `displaceFilter`。
3. 在 `buildSceneSVG` 里按分层(见下方 5 层构图)**条件注入**。

**守现有范式即天然安全**(照这些做,三闸照样验证它能跑——`node test/run.cjs` + graph-audit + 装配探针,改完跑一遍):
- **确定性**:用内置 `mulberry32` 种子 PRNG,seed 从 `region+mood` 的 `hashStr`,**绝不用随机数发生器/时间戳**(否则不可测、不可复现)。
- **停止态可见**:SMIL / `forwards` 动画停在**可见末帧**(无障碍 + probe 可测);`prefers-reduced-motion` 下 `stripSmil()` 会剥除 SMIL,基线属性须仍可见。
- **别写字面 `#000`**:用派生色(`shade()` 等),保 letterbox 纯黑检查与既有字节计数。
- 用既有图元类型(circle/line/polygon/path),别引入会破坏精确计数测试的新原语。

> 约束的只是**形式契约**(确定性 / 安全 / 可测),放开的是**你画什么、谱什么**(见 `docs/design-principles.md` §11)。

---

## 5 层构图哲学

程序化场景画用**深色低饱和**调色板,经典 5 层叠加,从远到近、从静到动:

```
Layer 1: 天空 / 背景渐变      (region 背景色)
Layer 2: 远景地形剪影          (地平线、远山、海平面)
Layer 3: 中景特征              (树丛、屋舍、礁石、巨眼)
Layer 4: 前景细节              (浪花、火光、漂浮物、骰子)
Layer 5: 大气覆盖              (雾、光束、mood 色调、画幅黑边)
```

这个分层是 present-svg 内部的构图逻辑(背景 → 地平线 → 行内图元 → mood 色调 → letterbox 置顶)。**想丰富某分区的画面**(如给森林加萤火虫层、给海岸加月光倒影),在 present-svg 里按这套分层加绘制代码,**不要回到 world.js 手写 SVG**。

> **CSS 变量调色**:present-svg 画 SVG 时可让填充走 CSS 变量(如 `fill="var(--color-canopy, #0d2d0d)"`),再在 `index.html`/外壳 CSS 的 `:root` 里集中定义各分区颜色 → 换主题只改一处变量、不改 presenter 绘制代码。这是「presenter 映射」之外的第二层调色入口。

### 各分区构图要点(从生产稿提炼,供扩展 presenter 时参考)

- **海/海滩**:天空渐变 → 海平面剪影 → 浪形路径(`Q` 贝塞尔) → 浪花描边 → 月光圆 + 水面反射椭圆。暖砂海岸再加沙滩弧线与漂流木/贝壳点缀。
- **森林**:深绿天 → 远处树干(可程序化随机 x 抖动) → 树冠椭圆群(不同 opacity 拉开层次) → 地表植被路径 → 萤火虫点(随机 r/opacity)。
- **村落**(`town`):暖天 → 远山 → 屋舍剪影(矩形 + 三角屋顶) → 篝火双层径向辉光 → 烟缕(`Q` 路径 + 圆头描边)。
- **洞穴/神庙**(`cave`/`ruins`):纯黑 → 顶部钟乳石三角 → 两侧岩壁路径 → 晶体高光三角 → 生物荧光点。
- **核心/高潮**:深黑 → 径向金辉(`radialGradient`) → 放射线(等角生成) → 同心圆环 → 中心核光。
- **结局变体**:按情绪取主色(逃离=蓝 / 留下=金 / 融合=紫 / 拒绝=红),深黑底 + 该色径向辉光 + 随机散点。

---

## 背景级氛围调参原则(从旧手搓背景动画提炼)

慢移/脉动这类**背景级 CSS 动画**(`@keyframes` 渐变位移、内阴影呼吸)属于**游戏外壳样式**,放 `index.html`/`game-design-guide` 的 CSS 里给 `#scene` 容器,与 presenter 画的 SVG 叠加。挑 region/mood 与扩 presenter 时,这些手感值仍适用:

- **海/海滩**:蓝→黑的纵向渐变,慢「波浪」位移(8s);情绪偏 `calm`/`cold`。
- **森林**:深绿基底,缓慢绿色内阴影「脉动」(12s);`eerie`(紫色诡林)或 `tense`(夜林)。
- **村落**(`town`):暖色径向渐变 + 篝火「呼吸」亮度(4s);`warm`。
- **洞穴/神庙**(`cave`/`ruins`):近黑 + 紫色内辉光漂浮(10s);`dread`。
- **核心/高潮地带**(不是 region 词——用 `cave`/`ruins`/`night` + mood `horror-climax`/`sacred` 组合):金色径向旋转(15s)或血红。

> 想加新分区或改某分区配色 = 在 `present-svg.js` 的 `REGION_BG` / `MOOD_TINT` 里加/改一行;**world 数据不写背景动画**。

---

## region 家族近义词全表(开放词汇归族)

`region` 是**开放词汇、不 fail-loud**(内容自由 §11);写已知词或其近义词,拿到该族**全套**(基色/剪影/点缀/光柱几何)。`present-svg.js` 的 `REGION_FAMILY` 归族规则(中英 + CJK):

| 归入 | 近义词(任写其一即归族) |
|---|---|
| `cave` | dungeon · mine · tunnel · underground · cavern · 洞 · 窟 · 矿 |
| `beach` | shore · coast · 滩 |
| `swamp` | marsh · bog · fen · mire · bayou · wetland · 沼 · 泽 · 湿地 |
| `sea` | ocean · lake · river · harbour · 海 · 湖 · 河 |
| `ruins` | ruin · temple · shrine · tomb · sanctum · crypt · 遗迹 · 神殿 · 殿 · 庙 · 墓 |
| `forest` | wood · grove · jungle · 林 · 森 |
| `town` | village · city · market · hamlet · plaza · square · street · 城 · 镇 · 村 · 市 · 街 |
| `night` | midnight · 夜 |
| `desert` | dune · sand · wasteland · 沙漠 · 沙丘 · 荒漠 · 戈壁 |
| `snowfield` | snow · tundra · glacier · arctic · frost · frozen · 雪 · 冰原 · 苔原 · 冻土 |
| `volcano` | volcanic · lava · magma · crater · caldera · 火山 · 熔岩 · 岩浆 |
| `skyclouds` | sky · cloud · skies · heaven · aerial · 苍穹 · 云 |

**完全未知的词**(如拿章节名 `heart`/`ending` 当 region)→ 确定性哈希深色调色板(hue 从词名 hash、低饱和暗底),天空渐变/暗角/光柱/文字对比全成立,但**没有剪影/点缀**。要完整场景感请用上表词;**章节/主题放节点名/地图名,别放 region**。

---

## 粒子层(可选表现层插件)

旧实现用全屏 `<canvas>` 画分区专属粒子。模块化里这属于**表现层**:写成 presenter 插件(工厂 `createParticlePresenter()` 返回带 `install` 的对象,经 `engine.use(createParticlePresenter())` 注册),订阅 `view().scene` 拿当前 `region`,据此起停粒子;核心/模块/world 数据完全不碰 Canvas。粒子是「氛围意图」的另一种消费者,与 SVG 呈现器并列(参考 `present-svg.js` 插件形态:`install: function(api){ api.addPresenter(present); }`)。**非默认,不挂则游戏照常跑(优雅退化)。**

### 各分区粒子调性(设计智慧,逐条保留)

数量控制在 **50–80**(性能与氛围平衡点);提供**开关**(`particlesEnabled`)以便低端设备关闭。每个 presenter 在节点变化时据 `scene.region` 切粒子池,用 `requestAnimationFrame` 驱动、切场景时 `cancelAnimationFrame` 清理(RAF 生命周期必须成对,否则多套循环叠加卡顿——生产踩过的坑)。

| region | 粒子类型 | 行为 | 颜色 |
|---|---|---|---|
| `beach`/`sea` | 气泡 | 上浮 + 轻微横移,出界回底 | 淡蓝 `rgba(150,200,255,…)` |
| `forest` | 萤火虫 | 游走 + 正弦呼吸辉光,边界反弹 | 绿 `rgba(100,255,100,…)` |
| `town` | 火星 | 上升 + 横移 + 渐隐,熄灭后回底重生 | 橙红 `#ff6a00`/`#ff4400` |
| `cave`/`ruins` | 光尘 | 缓慢上浮,极低 opacity | 紫/蓝 `#6644cc`/`#4488ff` |
| `heart`(核心) | 螺旋 | 绕中心旋转 + 向外扩张,超 maxDistance 回收 | 金 `#ffd700` |

**实现要点(从生产稿保留)**:
- **气泡/光尘**:`y -= speed`,出顶回底并随机化 x;辉光用 `createRadialGradient`。
- **萤火虫**:独立 `speedX/speedY` + `phase` 正弦控制辉光明灭;碰边界 `speed *= -1`。
- **火星**:从底部生成,`opacity -= 0.001/帧` 渐隐,熄灭即重生;十六进制颜色转 `rgba` 时按位解析。
- **螺旋**:每粒子初始等角分布,`angle += speed`、`distance += expandSpeed`,超出 `maxDistance` 重置到内圈。
- **dt 归一化**:`dt = (now - last) / 16.67` 让运动与帧率解耦(~60fps 基准),避免高刷屏过快。
- **性能开关**:`startParticles` 入口先查 `settings.particlesEnabled`,关则 `stopParticles` 并 return。

---

## 文字效果 CSS(游戏外壳样式)

文字级动画(抖动/浮现/辉光/打字机)属于**游戏外壳样式**:写成 CSS class,放 `index.html` / `game-design-guide` 起点 CSS,作用于 present-dom 渲染出的文字元素(present-dom additive 留了 `.line-*` 挂载点)。**触发哪种**可由节点 `scene.mood` 暗示(`tense`→抖动、`eerie`→浮现),呈现层据 mood 决定加哪个 class。纸张质感 / 墨水扩散 hover / 内心声音 `.line-inner` 等**外壳 CSS 配方**见专文 [`visual-css-techniques.md`](visual-css-techniques.md)。

### 抖动 / 颤抖(地震 / 恐惧 / 精神冲击)

`.text-shake` 有 **feTurbulence 有机扭曲** 与 **translate 物理抖动** 两套方案 + 调参(scale ≤3,>6 是精神污染),完整 CSS / SVG filter / 常见 bug 见 [`progressive-reveal.md`](progressive-reveal.md) § text-shake。由节点 `transition:'slam'` / `mood:'horror-climax'` 暗示。

### 浮现(记忆涌起)

```css
.text-fade-in { animation: textFadeIn 2s ease-in forwards; opacity: 0; }
@keyframes textFadeIn {
  0%   { opacity: 0; filter: blur(4px); }
  60%  { opacity: 0.7; filter: blur(1px); }
  100% { opacity: 1; filter: blur(0); }
}
```

### 辉光(核心形态的对白)

```css
.text-glow {
  text-shadow:
    0 0 10px rgba(255, 215, 0, 0.4),
    0 0 20px rgba(255, 215, 0, 0.2),
    0 0 40px rgba(255, 215, 0, 0.1);
  animation: textGlow 3s ease-in-out infinite;
}
@keyframes textGlow {
  0%, 100% { text-shadow: 0 0 10px rgba(255, 215, 0, 0.4), 0 0 20px rgba(255, 215, 0, 0.2); }
  50%      { text-shadow: 0 0 15px rgba(255, 215, 0, 0.6), 0 0 30px rgba(255, 215, 0, 0.3), 0 0 50px rgba(255, 215, 0, 0.15); }
}
```

### 打字机速度变体

```css
.text-typewriter-fast { --typewriter-speed: 20ms; } /* 默认 ~40ms */
.text-typewriter-slow { --typewriter-speed: 80ms; }
```

逐字渲染时按 class 取延迟(快 20ms / 慢 80ms / 默认 40ms):平静叙述慢、紧张场景快。打字机由 present-dom 或外壳脚本逐字插入,**不进 world 数据**(world 只给纯文本 `look`)。

---

## 戏剧模式(Dramatic Mode)— 外壳样式 + mood 暗示

高潮场景的「演出模式」:放大文字、压暗背景、虚化场景画,最大化情绪冲击。这是**游戏外壳的 CSS**(放 `index.html`/`game-design-guide`),由节点 `scene.mood`(如 `horror-climax`)或某个 `flag` 暗示呈现层切换 `body.dramatic-mode` class:

```css
.dramatic-mode #game-container { max-width: 90vw; padding: 4rem 3rem; }
.dramatic-mode #narrative-text  { font-size: 1.6rem; line-height: 2; letter-spacing: 0.02em; }
.dramatic-mode #scene           { filter: brightness(0.4) blur(2px); }   /* 压暗虚化场景容器 */
.dramatic-mode .choice          { font-size: 1.2rem; padding: 1rem 2rem; }   /* present-dom 输出 .choice,勿写 .choice-btn */
.dramatic-mode .amatlas-scene     { opacity: 0.3; filter: blur(3px); }     /* 虚化 SVG 场景画 */
```

**触发(不硬编码场景名 Set)**:呈现层据当前 `view.scene.mood` 判断——`mood` 落在高潮档(如 `horror-climax`)就 `document.body.classList.add('dramatic-mode')`,否则移除。新增高潮场景只要在 world 里把 `mood` 设成高潮档即可,不必维护 `DRAMATIC_SCENES` 名单。

---

## 渐进式揭示(Progressive Reveal)— 节奏方法论

> A Dark Room 原则(「最好的视听效果是在正确的时刻突然出现的新元素」)+ 完整的 world.js 分阶段范例(序章纯文字 → 海滩首图 → 森林展开 → 核心满载 → 结局归于沉默)+ 文字颤抖演出,见专文 [`progressive-reveal.md`](progressive-reveal.md)。本节只补一张**跨维度强度表**(那里没有的)。

随玩家深入,视觉复杂度递增:避免开局信息过载,把强度留给高潮。模块化里这是**呈现层据进程调强度的策略**,不需要作者手写 `EARLY_SCENES` 之类的 Set 硬编码场景名——进程信息已在 `state` 里(`clock.t`、`seen` 到访计数、关键 `flags`),呈现层或表现层插件可据此分阶段。

| 特性 | 早期(序章/海滩) | 中期(森林/村落/洞穴) | 后期(神庙/核心/结局) |
|---|---|---|---|
| 分区背景(region/mood) | ✅ | ✅ | ✅ |
| SVG 场景画(elements) | ❌(留白) | ✅ | ✅ |
| 粒子层 | ❌ | ❌ | ✅ |
| 音量(audio) | 30% | 100% | 100% |
| 文字效果 | 克制 | 标准 | 全开 |
| 过场(transition) | `fade`(柔和) | `fade`/`slam` | `slam`/`cut` |

**如何在模块化里落地**:
- **按数据分阶段,不按场景名 Set**:用 `state.clock.t` / 到访计数 / 进度 `flags` 判断阶段(如 `clock.t < 2` = 早期),比硬编码场景名列表更稳——加节点不必回去改 Set。
- **背景始终在**:任何阶段都给 `region`/`mood`(背景是最廉价的氛围)。
- **逐步加码 elements**:早期节点 `scene` 只给 `region`/`mood`、不给 `elements`(留白);中后期再在节点 `scene.elements` 里加角色/危险/巨眼。**这本身就是在 world 数据里逐节点声明的**——天然分阶段,无需运行时门控逻辑。
- **粒子留到后期**:粒子 presenter 插件可在早期 `stopParticles`、后期才起。
- **音量随阶段**:audio presenter 可据进程调主增益(早期压低)。
- **过场随强度升级**:早期 `transition:'fade'`,高潮 `transition:'slam'`/`'cut'`。

> 核心理念:**早期克制留白、后期满载冲击**。落地方式从手写 `getScenePhase(sceneId)` + `Set`,改为「在 world 数据里逐节点选合适的意图强度」+「表现层插件据 `state` 数据分阶段调粒子/音量」。

---

## 过场:触发时机 + 扩展

**触发时机(present-svg 的决定,生产踩坑保留)**:present-svg **仅在「进了新节点」(`snap.pos` 变)时放一次**过场;纯动作 re-render(原地、`pos` 不变)**不重放**。注意是按「节点变了」而非「transition 值变了」触发——否则连续两个同值过场(如皆 `fade`)会漏触发。`cut` 始终不放。

**扩展**:想加新过场类型或改某过场手感(墨水扩散、百叶窗、故障…)= 在 present-svg 的 `FX_CSS` 加一段 `@keyframes` + 在 `transition` 词汇里约定新值;**world 只声明意图名**。`scene.transition` 是冻结词汇(契约 §4.2),未知值退化为不放过场。墨水扩散这类有机过渡可作为 presenter 过场样式实现(`clip-path: circle()` 的 expand/contract),而非让作者手写 `loadScene` 编排。

---

## 完整视觉数据流(模块化)

不再有作者手写的 `loadScene(sceneId)` 流水线——核心驱动循环、presenter 各自消费快照。一次「移动到新节点」的视觉数据流:

```
1. 玩家点击选项 link → engine.apply(action)
2. 核心 enter(目标节点) → 模块 render(state,node) 产出 View
     · 模块 render 原生把 node.scene/node.audio 放进 View(renderer.js / tabletop 皆然)
3. 核心 view() 把 View 装信封 {view, actions, pos},广播给所有已挂 presenter
4. 各 presenter 各取所需(同一快照、互不覆盖):
     · present-dom  读 view.body/status  → 画文字 + 选项
     · present-svg  读 view.scene         → 画 region 背景 + elements 图元 + mood 色调
                                          → snap.pos 变 ⇒ 放一次 transition 过场
     · present-audio 读 view.audio        → music/ambient 变更则切换、sfx 触发一次性音效
     · (粒子插件)   读 view.scene.region → 切换粒子池
5. 呈现层据 mood/进程数据决定:dramatic-mode、文字效果 class、渐进式强度
```

**模块原生产出 scene/audio**:模块的 `render(state,node)` 直接把节点声明的 `scene`/`audio` 意图放进返回的 View——文字冒险模块(`renderer.js`)与跑团模块都如此(节点没声明则不带,呈现器优雅退化为纯文字)。**游戏层无需任何 render 垫片**;默认把 presenter 写进 `Amatlas.boot(WORLD, manifest)` 的 `present` 配置,需要底层手写时再用 `engine.use(...)` 叠加。

**叠加哪些 presenter 由 game.js 决定**:manifest 里关闭 SVG / 音频 / 粒子任一项(或手写形态注释对应 `engine.use`) → 该维度静默,游戏退化为纯文字仍完整可玩(优雅退化是可插拔表现层的核心)。默认组装见 `examples/text-adventure-demo/game.js`,手写对照见 `examples/horror-demo/game.js`。
