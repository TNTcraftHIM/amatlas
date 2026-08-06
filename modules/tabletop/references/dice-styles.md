# 骰子外观与换皮(dice styling)

> 配套 `tabletop-design.md`(何时掷骰)/ `few-shot.md`(检定 schema)。**这份只讲骰子"长什么样、怎么换皮"**。
> 一句话:**骰子有一个自动生效、零配置的素基底;想要更高级的外观,纯 CSS 换皮即可,不碰呈现器代码**(同存档面板、玩家地图的设计语言)。

## 1. 素基底:你什么都不用做,就已经有的

只要你用 `kind:'encounter'` + `api.dice`(即正常写检定),掷骰当帧模块就产出
`scene.elements:[{ kind:'dice', ref:骰值, sides:面数, state:成败 }]`,present-svg 自动画出:

- **据 `sides` 选骰形**:d6 → 等距立方(三面明度=体积感)、d4 → 三角、d20 → 六边形…(见 §3)。
- **翻滚 + 数字卷轴**:骰子立体翻滚约 1.1s,数字飞速上滚 → 越来越慢 → 定格在真值(showcase round6/7 的"紧张感"机制)。
- **据 `state` 着色 + 极值特效**:成功→绿 / 失败→红;**自然最大(所有骰满)且成功 → 暴击金光**、**自然最小且失败 → 大失败红裂**。
- **resting = 真值**:动画用 `forwards` 停在末帧;`prefers-reduced-motion` / 无障碍 / 自动测试直接看到最终骰面与成败色(可测、不晕眩)。

> 作者**不写任何 SVG、动画、CSS**——这些全是呈现器的职责(契约「意图非素材」)。你只决定**掷什么骰**(`dice:'NdS'`)和**成败后果**。

## 2. 你能(在契约层)控制的

| 你写的 | 决定 |
|---|---|
| `dice:'2d6'` / `'1d20'` / `'3d8'` … | 骰子**面数 `sides`**(=`S`)→ 选骰形;骰子**数量 `n`**→ 暴击/大失败的阈值(`n×S` / `n`) |
| `dc` + 角色卡 `skills` | 成败(`roll+调整 ≥ dc`)→ `state` 成/败 |
| —— | `state` 的 `crit`/`fumble` 由引擎据"是否自然最大/最小且与成败一致"自动判,**你无需也无法手填**(诚实:见 `tabletop.js performCheck`) |

## 3. 骰形对照(`sides` → 形状)

| `dice` | `sides` | 骰形 | 说明 |
|---|---|---|---|
| 缺省 / `2d6` | 6 | **等距立方**(三面明度) | 唯一画出"体积感"的骰形 |
| `1d4` | 4 | 三角 | 四面体侧影 |
| `1d8` | 8 | 菱形 | 八面体侧影 |
| `1d10`/`1d12` | 10/12 | 五边形 | —— |
| `1d20`、更大 | ≥13 | 六边形 | 二十面体**近似** |
| (无 `sides` 的旧元素) | — | 圆角方块 | 向后兼容,字节级不变 |

> **诚实的硬限制**(对抗式自我推翻,同玩家地图 lesson):`transform-style:preserve-3d` 在 **SVG 内容里几乎所有浏览器都不支持**——所以 SVG 内的骰子是**等距 2.5D**,N 边形是多面体的**侧影近似**,不是真多面体几何。要真 3D 翻滚,只能脱离 SVG 用 HTML `<div>`（引擎已内置可选呈现器 `present-dice3d.js`,见 §5-C)。

## 4. 换皮挂载点(present-svg 暴露的语义钩子)

纯 CSS 选择器即可挂,**不改呈现器代码**:

| 选择器 | 是什么 |
|---|---|
| `.amatlas-scene` | 场景根 `<svg>`(带 `data-region`/`data-mood`) |
| `.amatlas-die` | 骰子整组(翻滚动画;带 `data-sides="N"` → 可按面数分别换皮) |
| `.amatlas-die-box` | 骰身(滚动中去色的那层) |
| `.amatlas-die-face` | 定格的真值数字 |
| `.amatlas-die-reel` | 数字卷轴 |
| `.amatlas-die-crit` / `.amatlas-die-fumble` | 暴击金光 / 大失败红裂 |

## 5. 三档换皮(纯 CSS,真实可复制)

把下面任意一段放进游戏的 `<style>`(或 `game-design-guide` 的外壳 CSS)。

### A. 金属光泽(给骰子加质感,最安全)
```css
.amatlas-scene .amatlas-die { filter: drop-shadow(0 2px 1px rgba(0,0,0,.45)) saturate(1.2) contrast(1.05); }
.amatlas-scene .amatlas-die-face { fill: #fff; paint-order: stroke; stroke: rgba(0,0,0,.5); stroke-width: .4px; }
```
只用 `filter`/描边,不动呈现器据 `state` 设的成败色 → **成败反馈不失真**。

### B. 暗黑石骰主题(整体调暗、保留成败语义)
```css
.amatlas-scene .amatlas-die-box { filter: brightness(.82) contrast(1.18); }
.amatlas-scene .amatlas-die[data-sides="20"] { filter: drop-shadow(0 0 3px #6cf); } /* d20 高亮 */
```
> ⚠️ **别直接改 `fill`**:骰身填充色是呈现器据成/败/暴击/大失败定的**语义色**(绿/红/金/暗红)。CSS 用 `filter`(brightness/contrast/hue-rotate/drop-shadow)做整体风格化是安全的;若用 `fill:` 强行重画,会**抹掉成败的视觉反馈**(玩家看不出成功还是失败)——这是换皮的语义边界。

### C. 进阶:真 3D d6（引擎已内置可选呈现器 `present-dice3d.js`）
SVG 做不了真 3D（§3），但引擎自带一个**可选**的 HTML `<div>` 立方体呈现器——开了它,d6 检定就用真 `preserve-3d` 翻滚、由快到慢、结果面朝上落定;**不开则仍走 §1 的 SVG 2.5D**。启用 = 两步:
```js
// game.js:像其它呈现器一样 use(默认不启用,加这行才开)
engine.use(Amatlas.Dice3dPresenter.createDice3dPresenter({ slot: '#dice3d' }));
```
```html
<!-- index.html:给一个插槽(空时自动隐藏);CSS 把它盖在 #scene 上 -->
<div id="dice3d"></div>
<style>#dice3d{position:absolute;/* 居中盖在 #scene 上 */}#dice3d:empty{display:none}</style>
```
- **只接管 d6**:1-6 显点数、求和(2d6 等)>6 显数字;其它面数 / 没骰子 → **自动让位**给 present-svg 的切面宝石(§3)。
- **诚实代价**:多一层 HTML 叠在 SVG 场景上(要 CSS 定位对齐);真多面体只有 d6 立方划算(d20 仍切面宝石);2d6 是**一颗立方显总和数字**,非两颗各显一面(后者需契约带每颗点数 → 记 backlog)。素基底(§1)对绝大多数游戏已够用——C 档留给"骰子是核心卖点"的游戏。
- **可测/无障碍**:落定姿态=基态,`prefers-reduced-motion` 静止显结果(不伤自动测试)。

## 6. 边界小结(诚实)

- **能改**:质感/光影/描边/整体色调(`filter`)、按 `data-sides` 分骰形换皮、场景底色(`.amatlas-scene`)。
- **不该改**:骰身 `fill` 的成败**语义色**(改了成败反馈失真);N 边形的几何(那是呈现器的固定图元,同玩家地图的 circle+line 限制)。
- **真 3D**:SVG 内不可能 → 要么接受等距 2.5D 素基底,要么走 §5-C 的 HTML div 自接。

## 来源(均已查证)
- [DeSandro · CSS 3D cube](https://3dtransforms.desandro.com/cube) — 纯 CSS d6 六面立方配方
- [magnars · Alea iacta est](https://magnars.com/alea-iacta-est/) — 纯 CSS 骰子翻到结果面
- [Igalia · preserve-3d 在 SVG 的限制](https://blogs.igalia.com/nzimmermann/posts/2019-12-12-3d-transformations/) — 为何 SVG 内做不了真 3D
- [Dice So Nice (Foundry VTT)](https://foundryvtt.com/packages/dice-so-nice/) — 借鉴「结果预定 + 延迟揭示」张力(我们零依赖版:resting=真值)
