# 玩家地图(minimap 插件)— 调试视图 vs 玩家地图 + 换皮样式库

> S11-c。引擎给**最素可靠基底**(一个 `buildMinimapSVG` + 双视图 + toggle),进阶风格作**可换皮 CSS 样式库**(本文档),引擎不强加。合中心思想:不限创造力、给足检查;**素基底 + 可换皮**(design-principles §10「分层不删、可选按需」)。

## 0. 一句话
小地图插件默认 toggle(`🗺️ 地图` 按钮进 `#plugin-bar`)。两套视图**共用同一渲染管线、差别只在「坐标从哪来」**:
- `layout:'spatial'`(**默认 = 玩家视图**)= **给玩家的真实地图**:用作者标的 `node.map` 坐标摆出空间感 + **探索雾**(默认 `fog:'hide'`:严格只显已探索/当前;`'frontier'` 额外显一度直连邻居淡显)+ **节点标签 hover** + **连线实时锁定**。没标 `node.map` → 静默回退环形(见 §2)。
- `layout:'ring'` = **调试视图**:节点环形均布,一眼看清连通/死链/孤儿,**给作者查设计**——画全部节点、无探索雾。

> 选哪个:做"给玩家的沉浸地图"=**默认即可**(记得标 `node.map`);开发时想看全图结构 → 传 `layout:'ring'`。

## 1. 切换视图与挂载
```js
// 默认:toggle + 玩家视图(spatial + hide 探索雾:严格只显已探索/当前)。记得给节点标 node.map(见 §2),否则回退环形
engine.use(A.MinimapPlugin.createMinimapPlugin({}));
// 调试环形(开发期核对结构;画全部节点、无探索雾)
engine.use(A.MinimapPlugin.createMinimapPlugin({ layout: 'ring' }));
// 前沿揭示:显已探索 + 一度直连邻居(未探索淡显)、二度+ 不画 —— 想让玩家看到「下一步去哪」用它
engine.use(A.MinimapPlugin.createMinimapPlugin({ fog: 'frontier' }));
// 整张图都显(不藏未探索,仍靠 CSS 淡显):fog:'off'
engine.use(A.MinimapPlugin.createMinimapPlugin({ fog: 'off' }));
// 方块房间(节点 rect + **方向驱动网格** + 正交走廊「横平竖直」;连接可标 dir、缺省由 node.map 推断,见 §2):glyph:'box'
engine.use(A.MinimapPlugin.createMinimapPlugin({ glyph: 'box' }));
// 常驻角标(不要 toggle 按钮):mode:'inline' → 画进 #plugin-minimap
engine.use(A.MinimapPlugin.createMinimapPlugin({ mode: 'inline' }));
```
- **toggle 模式**(默认):按钮进 `#plugin-bar`(与存档💾/成就🏆 同一工具栏),点开浮层面板看地图。无 `#plugin-bar` → 自动退化成常驻 `#plugin-minimap`。
- **inline 模式**:常驻 `#plugin-minimap`(经典角标小地图)。
- **挂载点契约**:`#plugin-bar`(toggle 按钮)/ `#plugin-minimap`(inline 角标)——`index.html` 骨架已含;删了对应 id,功能静默消失(引擎找不到挂载点只 no-op)。

## 2. 给玩家地图标坐标(`node.map`)

> **两条路(先选一条再往下读)**
> - **圆点 + 坐标(默认)**:`glyph:'circle'` → 每个节点标 `node.map:{x,y}`(0–100 归一)+ 引擎防重叠自动微调;空间感强、坐标自由,**代价是手填每个节点的 x/y**。适合少量节点或想精确控制位置的图。
> - **方块房间 + 方向(零手算坐标)**:`glyph:'box'` → **连接标 `dir`(上/下/左/右,见本节末尾)就够,引擎自动把房间落整数网格 + 正交走廊**,完全不用填 `node.map`。适合走廊/房间/地牢这类带方向的图。
> - 在为很多节点手算 `x/y` 发愁 → 直接改用 `glyph:'box'` + `dir`,跳到本节末尾 box 示例。

玩家视图(`spatial`)优先用**作者在节点上标的归一坐标**:
```js
maps: { island: { nodes: {
  beach:  { kind:'scene', name:'海滩', map:{ x:20, y:80 }, links:[{ to:'forest', label:'走进林子' }] },
  forest: { kind:'scene', name:'密林', map:{ x:50, y:40 }, links:[{ to:'peak', label:'登顶' }] },
  peak:   { kind:'scene', name:'山顶', map:{ x:80, y:15 } }
}}}
```
- `map:{x,y}` 取值 **0–100 归一**(0=左/上,100=右/下),引擎按面板尺寸缩放。
- `node.map` 是**模块私有字段**:核心不读、**不进契约、不影响玩法**,纯给地图呈现用。拼错/不标都不会报错(它是装饰增强、非门控)。
- **自动回退承诺**:`layout:'spatial'` 但该地图**任一**节点没标 `node.map` → **静默回退环形**(不报错、不留白)。所以可以**渐进标注**:先全环形跑通,再逐张地图补坐标。
- **方块房间(`glyph:'box'`)的网格摆位**:box 模式**不直接拿 node.map 当坐标**,而是**方向驱动**把房间落到整数网格(走廊才横平竖直,Trizbort/IF 式)。方向来源两级:① 连接标 `dir`(`'n'/'s'/'e'/'w'/'ne'/'nw'/'se'/'sw'`,**模块私有装饰字段**——核心不读、不进契约、不影响玩法)→ 精确控制谁在谁哪个方向;② 没标 `dir` → 由两端 `node.map` 的角度**自动推断** 8 向(所以标了 `node.map` 的图直接切 box 也能出网格、无需额外标)。`dir` 拼错=当没标、回退推断(装饰字段、不报错)。

```js
// 例:用 dir 精确控制方块房间网格(从起点 BFS:书房在门厅正北、厨房在正东)
start: { map:'manor', node:'hall' },
maps: { manor: { nodes: {
  hall:    { kind:'scene', name:'门厅', links:[ { to:'library', dir:'n' }, { to:'kitchen', dir:'e' } ] },
  library: { kind:'scene', name:'书房' },
  kitchen: { kind:'scene', name:'厨房' }
}}}
```

## 3. 语义钩子(样式靠这些发挥)
`buildMinimapSVG` 产出的 SVG 带这些属性,CSS 选择器据此发挥(两视图都有):
- `<svg class="amatlas-minimap">` — 根,换皮总入口。
- `g.amatlas-node` — **节点组**(含形状 + 标签);hover 它即触发标签显隐。
- `[data-node="id"]` — **节点形状**:默认 `<circle>`;`glyph:'box'` 时为 `<rect>`(方块房间)。`[data-current="1"]` 当前所在。**着色一律用属性选择器 `[data-node]`/`[data-current]`、别绑 `circle` 标签**——这样圆/方都命中(换皮库已照此写)。
- `text.amatlas-node-label` — **节点名标签**(读 `node.title‖name‖id`):默认隐,`g.amatlas-node:hover` 时显;当前节点的标签带 `.current` 类**常显**。改字号/颜色/要不要常显都在这条 CSS(短名最佳,过长会被 viewBox 裁切)。
- `[data-seen="1"]` — **已探索**(读 `state.seen`,玩家走过引擎自动记)。**玩家视图默认 `fog:'hide'`**:只画已探索/当前(连带它们之间的连线),未探索节点根本不画。`fog:'frontier'` = 额外画**一度**直连邻居(未探索 → 没 `data-seen` → 靠 `[data-node]:not([data-seen])` CSS 淡显)、二度+ 仍不画(走到才揭示);`fog:'off'` = 整张图都显(未探索仍 CSS 淡显)。雾来源引擎自动维护,作者不用管。
- `line[data-locked="1"]` — **当前**锁住的连接(**实时**:引擎按当前状态算 `requires`/`available` 门控,满足了自动去掉 `data-locked`)→ 可画虚线/灰显。

## 4. 换皮样式库(复制即用 · 只改 CSS、不碰插件/HTML)
三套主题都基于 `circle`+`line`+`text` 图元,**只换颜色/线型/滤镜/雾/标签**。挑一套粘进 `<style>`(覆盖 game-design-guide §5 的默认 `.amatlas-minimap`/`.amatlas-node-label` 着色即可)。

### A 手绘羊皮纸风(探索向)
```html
<!-- index.html <body> 里放一次(隐藏的滤镜定义;feTurbulence/feDisplacementMap 把直线抖成手绘,零依赖) -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <filter id="map-rough"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2"/></filter>
</defs></svg>
```
```css
.amatlas-map-panel{background:#ece0c2;border-color:#b59f76}
.amatlas-minimap{filter:url(#map-rough)}                 /* 线条/节点抖成手绘(整张图过位移滤镜)*/
.amatlas-minimap line{stroke:#6b5836;stroke-width:1.6}
.amatlas-minimap line[data-locked]{stroke:#9c2b16;stroke-width:1.8;stroke-dasharray:3 2;opacity:.8}  /* 锁住的路:暗红虚线 */
.amatlas-minimap [data-node]{fill:#dcc89a;stroke:#6b5836;stroke-width:1.4}   /* [data-node]=节点形状(圆/方通用) */
.amatlas-minimap [data-current]{fill:#c0392b;stroke:#6e2016;stroke-width:1.8}
.amatlas-minimap [data-node]:not([data-seen]){opacity:.28}     /* 探索雾:fog:'frontier'/'off' 时生效(默认 hide 直接不画未探索) */
.amatlas-minimap .amatlas-node-label{fill:#43331c;stroke:#ece0c2;font-family:Georgia,"Songti SC",serif}  /* 衬线手写感,描边光晕用米底色 */
```

### B 暗黑霓虹风(科幻/赛博向)
```css
.amatlas-map-panel{background:#04070d;border-color:#1c3a4a}
.amatlas-minimap line{stroke:#1f6f8b;stroke-width:1.3}
.amatlas-minimap line[data-locked]{stroke:#ff3b6b;stroke-width:1.8;stroke-dasharray:2 3;filter:drop-shadow(0 0 2px #ff3b6b)}  /* 锁住的路:品红辉光虚线 */
.amatlas-minimap [data-node]{fill:#0a1a24;stroke:#2aa6c8;stroke-width:1.4;filter:drop-shadow(0 0 2px #2aa6c8)}
.amatlas-minimap [data-current]{fill:#2aa6c8;stroke:#bdf6ff;stroke-width:1.6;filter:drop-shadow(0 0 5px #2aa6c8)}
.amatlas-minimap [data-node]:not([data-seen]){opacity:.35}     /* 仅 fog:'frontier'/'off' 时生效 */
.amatlas-minimap .amatlas-node-label{fill:#bdf6ff;stroke:#04070d}
```

### C 极简线稿风(文艺/极简向)
```css
.amatlas-map-panel{background:#ffffff;border-color:#ddd}
.amatlas-minimap line{stroke:#c2c2c2;stroke-width:.9}
.amatlas-minimap line[data-locked]{stroke:#d4342a;stroke-width:1.2;stroke-dasharray:1.5 2}  /* 锁住的路:红点虚线 */
.amatlas-minimap [data-node]{fill:#ffffff;stroke:#9a9a9a;stroke-width:1.2}
.amatlas-minimap [data-current]{fill:#1a1a1a;stroke:#1a1a1a}
.amatlas-minimap [data-node]:not([data-seen]){opacity:.4;stroke-dasharray:1.5 1.5}   /* 仅 fog:'frontier'/'off' 时生效 */
.amatlas-minimap .amatlas-node-label{fill:#333;stroke:#fff}
```

## 5. 更激进的风格(诚实标清)
- **方块房间盒 ✅ 已支持**:`glyph:'box'`(§1)→ **方向驱动 BFS 网格布局**(房间落整数网格、§2 的 `dir`/`node.map` 定方向)+ `<rect>` 房间 + **正交肘形走廊**(横平竖直、双向精确重合、盒子盖住中心残段=边到边);着色用 `[data-node]`/`[data-current]` 钩子(§3),任何主题通用。**依据**:Trizbort/Inform7/MUD automapper 一致以方向为方块布局一等输入,纯坐标量化会重叠+走廊歪。**仍 backlog**:走廊避让穿过房间、真正全局最优网格(NP-hard、所有工具都靠"先到先得+拒叠放"近似)、`up/down` 楼梯方向、房间四边精确开门 port——当前小图(几~十几房间)效果好,复杂大图/环必然不完美(行业共识)。
- **跨图分区 · 模块预留、未做**(Citizen Sleeper 式把 `world.maps` 整个世界铺开):当前 `buildMinimapSVG` 只画当前 map(`world.maps[pos.map]`)、跨图边(`to:{map,node}`)不画。**布局和风格交给作者定**——要做时让 AI **照本文档 + `examples/` demo 模板**设计:遍历 `world.maps`、每张图当一个分区团摆位、连 `to:{map,node}` 跨图边(团级坐标作者标或自动布局)。属"要时按需扩展"的能力,引擎不预设布局/审美。
> §4 三主题 + 方块,都基于现有图元(circle/rect/line)、纯 CSS 或单参可换——诚实的"能换的皮",不画饼;跨图是"要时让 AI 照文档+模板接着写"的预留位。

## 来源(查证真实)
- [Trizbort](https://trizbort.genstein.net/help/) — IF 地图标准:房间盒 + 罗盘端口连线,坐标来自作者手摆(印证 `node.map` 作者标坐标)。
- [Twine 导航](https://twinery.org/reference/en/editing-stories/navigating.html) — 自动布局是痛点、玩家地图需作者干预。
- [Citizen Sleeper(Game UI DB)](https://www.gameuidatabase.com/gameData.php?id=1462) — 空间布局 + 探索雾(已/未探索)+ 门控连接 + 当前位置(印证 `data-seen`/`data-locked`/`data-current`)。
- [MDN feTurbulence](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence) — 手绘纹理零依赖原理(§4A)。
