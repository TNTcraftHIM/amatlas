# 精致游戏外壳设计指南(authoring · index.html 的 CSS;**通用**,非文字冒险专属)

> **质量基线**:用户拿到的是**精致成品**,不是工程原型。做新游戏时,`index.html` 的 CSS **必须**达到"能拿出去展示引擎实力"的水平——不是裸 `<button>` + 裸文本 + 零排版。
> 这不是架构限制(引擎核心/模块完全不管表现),纯粹是**模板要够好**。从共享 `../ui/amatlas-skins.css` 起步(它兜住 class 接缝+精致度地板),但**按题材选一套 `data-ui`、别所有游戏都停在 `amatlas-dark`**,再覆盖 `--amatlas-*` token 做专属外观;完整换皮说明见 `ui-skins.md`。本文 §5 保留为**完全自定义页面模板**时的起点 CSS,不是新游戏默认路径。
> **⚠️「照抄/复制」只圈定机械接缝**:本文(及 SKILL / new-game)凡说"照抄/复制",**只针对让游戏能跑的技术契约**——呈现器/插件输出的 class 名(`.choice`/`.amatlas-*`)、挂载点 id、`<script>` 装配。**视觉本身(配色 / 排版 / 布局 / 动效 / 气质)是你的创作自由区**:§5 起点 CSS 是"能跑的基线、防裸样式",**不是"该长这样"的标准**——强模型应大胆超越它、做出 demo 没有的视觉。规则只有一条:**换皮换色随意、别改 class 名**(§3),其余尽情发挥。
> **想要更强、但更不可控的效果?走 opt-in 增强**:有些能力"效果更强、但保证不了人人一样"(如 `present-dice3d` 真 3D 骰子 / 更重的呈现器)。引擎对这类用 **opt-in + 自动回退可靠地板** 的模式:**默认永远是可控可复现的地板**(SVG 骰子等),增强是你**知情**的选择(换更强效果、接受它的不可控/可能退化)。别因"它违了某条零依赖/确定铁律"就否决——先问**能不能优雅回退到地板**。判据与正典见 `docs/design-principles.md` §11.7。
> **活样例**(直接看真代码):`examples/horror-demo/index.html`(沉浸/电影感:衬线 + 暗色 + 画幅)、`examples/text-adventure-demo/index.html`(全插件插槽布局)、`examples/tabletop-demo/index.html`(场景 + 检定行)。

## 1. CSS 能挂在哪(present-dom 产出的结构 + 约定插槽)

`index.html` 放这些**约定 id 插槽**(没挂对应能力的插槽 `:empty` 时自动隐藏 → 优雅退化):
`#mapname`(地名/面包屑)· `#place`(场景标题)· `#scene`(SVG 场景,挂了 SVG presenter 才有内容)· `#look`(正文)· `#choices`(选项)· `#status`(状态栏)· `#plugin-bar`/`#plugin-minimap`/`#plugin-overlay`(存档/小地图/成就/重开插件)。重开按钮走 `manifest.reset:true` 自动挂进 `#plugin-bar`,不要再手写 `#reset`。

`present-dom` 渲染时往这些插槽产出带 **语义 class** 的元素(给你精细挂载点):
- `#look > div.line.line-<type>` —— 每行正文;`type` ∈ `prose`/`event`/`check`/`outcome`(`event` 另保留旧 `.event` 别名)。**跑团的检定机械结果是 `.line-check`、叙事后果是 `.line-outcome`**——务必分开样式,否则它们和正文长一样、丢失层次。
- `#choices > button.choice`(移动项加 `.move`、锁定项加 `.locked` + `span.lock-hint`)。
- `#status > span.status-item`(值在内层 `<b>`)。
- **能力插件自己渲染控件进插槽,你只放空容器 + 写 CSS——别自造 💾/🗺️/🏆 图标按钮**(插件已经渲染了控件;你自造的 `<button>` 没在 game.js 接 onclick = 点了没反应,装配探针会报"悬空按钮")。各插件产出的 class:存档 `#plugin-bar > button.amatlas-plugin-btn`(导出/导入)+ `textarea.amatlas-save-code`;小地图(默认 `mode:'toggle'`)`#plugin-bar > button.amatlas-plugin-btn`(🗺️ 地图)+ 点开 `div.amatlas-plugin-panel.amatlas-map-panel`(内含 `svg.amatlas-minimap`),`mode:'inline'` 才常驻 `#plugin-minimap > svg.amatlas-minimap`;成就 `#plugin-overlay > div.amatlas-achievement`(解锁 toast)+ **round7 起**常驻 `#plugin-bar > button.amatlas-plugin-btn`(🏆 成就 N/M 按钮)+ 点开的 `div.amatlas-plugin-panel`(成就列表)。**给这些 class 写样式**(§5 已给)。
> ⚠️ **class 名逐字写**:CSS 选择器必须和上面的输出 class **完全一致**——常见错:写 `.choice-btn`(实际 `.choice`)、`.plugin-btn`(实际 `.amatlas-plugin-btn`)、`.achievement-toast`/`.achievement`(实际 `.amatlas-achievement`)、**给核心 class 误加 `amatlas-` 前缀**(`.amatlas-link`/`.amatlas-status-item`/`.amatlas-lock-hint` 全错 —— **核心呈现器输出 `.choice`/`.status-item`/`.lock-hint` 无前缀,只有插件 save/minimap/achievement 才带 `amatlas-`**;尤其 `.amatlas-link.locked` 不命中 → **locked 选项不灰显**,present-dom 给 locked 按钮原生 `disabled` 拦点击、自定义灰显样式靠 `.choice.locked`)→ 样式静默不命中。**这些 class 是引擎契约、不是你的命名自由**,别"改得更顺眼"。现状(v18 对账):**插件控件自带默认样式**——误写 `.amatlas-*` 不会"裸",只是你的覆盖不生效;装配探针对核心 `.choice` 无样式报 **P1** 提醒。**最稳 = 接入共享 `amatlas-skins.css` 并只改 `--amatlas-*` token;完全自定义时才复制 §5 起点 CSS / `examples/text-adventure-demo/index.html`,别重写这些 class 名。**

## 2. 排版(最影响"精致感")

- **正文用衬线**(Georgia / "Songti SC" / serif)= 叙事书卷质感;**UI 用无衬线**(system-ui)= 按钮/状态栏/地名。两种字体拉开"叙事 vs 界面"的层次。
- **行高 1.6–1.8**(正文 1.75 左右最舒服),正文字号 16–18px。
- **字号层级**要明显:标题(`#place` ~24px 粗)> 正文(~17px)> 状态/机械结果(~12–14px)。
- 地名用 `letter-spacing` + `text-transform:uppercase` 做"电影感小标"。

## 3. 配色 / 按钮 / 布局 / 动效

- **配色**:**全部用 CSS 变量**定义在 `:root`(换肤只改一处,还能按 `scene.mood`/`region` 整体调色)。**暗色背景 + 浅色文字**=沉浸游戏感;留一个 `--accent` 强调色专给交互/高亮。
  - **按节点/区域/气氛整页换样式(`<html>` dataset 钩子)**:present-dom 每次渲染把当前 `data-node`/`data-map`/`data-region`/`data-mood` 写到 **`<html>` 根**(**不是 `<body>`**)——可写 `html[data-region="cave"]{ --bg:#0b1a1a }` / `html[data-mood="dread"] #place{ color:#c33 }` / `html[data-node="ending_lost"]{…}` 让整页背景/标题随场景、气氛、节点变(只暴露"你在哪",样式你定)。**选择器写 `html[data-…]` 不是 `body[data-…]`**(常见踩坑:试 `body[data-region]` 不生效就以为做不到)。
- **按钮**:绝不裸 `<button>`。要 **圆角 + `:hover` 变色/亮边 + `:active` 下沉(`translateY(1px)`) + `.locked` 灰化/虚线 + `transition` 过渡**。
- **布局**:**单列阅读流**——`#app` 用 `max-width:680px` 限阅读宽度 + `margin:0 auto` 居中(场景/正文/选项/状态栏从上到下顺排),移动端留 `padding-bottom: env(safe-area-inset-bottom)`。**别用 `display:flex` 把页面切成左右两栏**(尤其别把 `#scene` 设成 `flex:0 0 45%` 占左半——SVG 是 320×180 小横图,塞进高瘦侧栏会留一大片灰色空白);场景区按下条全宽固定高。
- **插件槽别盖正文**(`#plugin-minimap` 角标**仅 `mode:'inline'` 时**用;**默认 `toggle` 地图是 `#plugin-bar` 按钮 + 居中浮窗、`#plugin-minimap` 恒空**):inline 时 `#plugin-minimap`/`#plugin-overlay` 用 `position:fixed` 钉屏幕角(minimap 左上、overlay 右下),**都要 `pointer-events:none`**(见 §5)让点击穿透容器;**minimap 别钉右上/右侧**——会盖住单列正文。
- **工具栏 `#plugin-bar` 放 `#app` 顶部**(存档💾/地图🗺️/成就🏆 都渲染进它,是 in-flow 普通元素、不是 fixed):**常驻控件惯例在顶部**;放最底对全屏 app 布局别扭、且(下一条)容易被推出屏。**两条死规**:① 必须在 `#app` **内部**——**别**把 `#app` 设 `height:100vh/100dvh`+`body{overflow:hidden}` 再把 `#plugin-bar` 放 `#app` 外,否则工具栏被挤出屏幕、**三控件全看不见点不到**(showcase 实测翻车:插件都正常工作、只是被布局藏了;**布局闸看不到、只有真机/人能发现**);② **`<body>` 骨架(各 slot 容器 + 嵌套)= 素基底、照抄 demo 别重排;换皮 = 改配色/字体/质感,不改结构。**
- **文字淡入**:正文行加 `animation:fadeIn` 轻微淡入上浮(见 §5 `@keyframes`),比硬切更有质感(克制:别太慢/太花)。
- **SVG 场景区**:`#scene` **全宽 + `aspect-ratio:16/9`**(`width:100%;aspect-ratio:16/9`,见 §5;**必须 16/9 = 场景 SVG 的 viewBox 比例**,否则左右会留 pillarbox 黑边;**不要设成侧栏占百分比宽、不要写死 `height:NNNpx`**),背景**贴近页面底色**(如比 `--bg` 略深)+ 细边框 + 圆角 + `overflow:hidden`,让它和正文**融为一体**而非突兀拼接;SVG 自带 `height:auto` 会按容器宽自算 16:9 撑满,**无需**再写 `#scene svg{}` 规则;`#scene:empty{display:none}` 没挂 SVG 时不留空框。

## 4. 做新游戏时怎么用

1. 默认在 `index.html` 接入 `<link rel="stylesheet" href="../ui/amatlas-skins.css">` 与 `<html data-ui="amatlas-dark">`。
2. 按题材改 `--amatlas-accent` / `--amatlas-bg` / `--amatlas-body-bg` 等 token(恐怖=暗红、海洋=青蓝、温暖=琥珀),详见 `ui-skins.md`。
3. 跑团游戏务必确认 `.line-check`/`.line-outcome` 有区分样式(共享 skin 已覆盖;完全自定义时照 §5 保留)。
4. 想再升级:加 `region`/`mood` → 主题色映射、打字机效果、过场。只有要完全摆脱共享 skin 时,才复制 §5 起点 CSS 自建模板。

## 5. 完全不用共享 skin 时才复制的起点 CSS(~50 行;粘进 `<style>` 即用)

```css
:root{
  /* 换肤只改这里;可按 scene.mood / region 调主题色 */
  --bg:#0c1119; --panel:#121a26; --ink:#e8edf4; --dim:#8a99ad;
  --accent:#b89b6a; --accent2:#6a8fa8; --line:#222e40;
  --serif:Georgia,"Songti SC","Times New Roman",serif;                       /* 叙事正文 */
  --ui:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;   /* 界面 */
}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.75 var(--serif)}
#app{max-width:680px;margin:0 auto;padding:28px 20px calc(56px + env(safe-area-inset-bottom));min-height:100vh}
#mapname{font:600 12px/1.4 var(--ui);color:var(--dim);letter-spacing:.3em;text-transform:uppercase;margin-bottom:6px}
#place{font:600 25px/1.3 var(--serif);color:#fff;margin:.1em 0 .6em;letter-spacing:.5px}
#scene{width:100%;aspect-ratio:16/9;margin:6px 0 20px;background:#0a0f17;border:1px solid var(--line);border-radius:12px;overflow:hidden}  /* 16/9 = 场景 SVG viewBox 比例,免左右 pillarbox 黑边;SVG 自带 height:auto 撑满,无需 #scene svg 规则 */
#scene:empty{display:none}
#look>.line{white-space:pre-wrap;margin:0 0 .7em;animation:fadeIn .5s ease both}   /* 每行淡入 */
.line-event{color:var(--accent);font-style:italic;border-left:2px solid var(--accent);padding-left:12px}
.line-check{font:14px/1.6 var(--ui);color:var(--accent2);letter-spacing:.02em}     /* 检定机械结果 */
.line-outcome{font-weight:600}                                                     /* 检定叙事后果。⚠️ 想更显眼用 `border-left:3px solid var(--accent);padding-left:14px;font-style:italic;background:none` 引用块风;**别加 background+border+border-radius=会撞下面 .choice 长得像按不了的灰按钮**(Sonnet《深井回响》实测踩) */
#choices{margin-top:22px;display:flex;flex-direction:column;gap:10px}
.choice{appearance:none;text-align:left;font:15px/1.4 var(--ui);background:var(--panel);color:var(--ink);
  border:1px solid var(--line);border-radius:10px;padding:13px 16px;cursor:pointer;
  transition:border-color .2s,background .2s,transform .05s}
.choice:hover{border-color:var(--accent);background:#16202e}
.choice:active{transform:translateY(1px)}
.choice.move::before{content:"→ ";color:var(--accent2)}
.choice.locked{opacity:.5;cursor:default;border-style:dashed}
.choice.locked:hover{border-color:var(--line);background:var(--panel)}
.lock-hint{font-size:12px;color:var(--dim);margin-left:6px}
#status{margin-top:26px;padding-top:14px;border-top:1px solid var(--line);
  font:12px/1.5 var(--ui);color:var(--dim);display:flex;gap:18px;flex-wrap:wrap}
.status-item b{color:var(--ink);font-weight:600;margin-left:3px}
#plugin-bar{margin-top:18px;display:flex;gap:8px;flex-wrap:wrap;align-items:center} #plugin-bar:empty{display:none}
.amatlas-plugin-btn{appearance:none;font-family:var(--ui,inherit);font-size:13px;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:7px 12px;cursor:pointer;transition:.2s}  /* 工具栏按钮 💾/🏆/🗺️ */
.amatlas-plugin-btn:hover{border-color:var(--accent);color:var(--accent)}
#plugin-minimap{position:fixed;top:12px;left:12px;width:104px;height:104px;border:1px solid var(--line);
  border-radius:10px;background:#0a0f17;opacity:.92} #plugin-minimap:empty{display:none}  /* ↑ 仅 minimap mode:'inline' 角标用;默认 toggle 时地图=#plugin-bar 按钮+居中浮窗(.amatlas-map-panel 自带样式)、#plugin-minimap 恒空 */
#plugin-minimap svg{display:block;width:100%;height:100%}
#plugin-overlay{position:fixed;bottom:12px;right:12px;display:flex;flex-direction:column;gap:8px;align-items:flex-end;z-index:70;pointer-events:none}  /* 容器必须穿透:否则改大/全屏时挡整页点击 */
.amatlas-achievement{background:var(--accent);color:#1a1206;padding:9px 13px;border-radius:9px;font-family:var(--ui,inherit);font-weight:600;font-size:13px;box-shadow:0 6px 20px rgba(0,0,0,.45);pointer-events:auto}  /* 成就解锁 toast */
/* ── 存档/成就/地图浮窗:居中模态 + 背景遮罩 + ✕ 关闭(三控件共用 .amatlas-plugin-panel)── */
.amatlas-plugin-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:60;width:92%;max-width:440px;max-height:82vh;overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:24px 22px;box-shadow:0 24px 70px rgba(0,0,0,.6);font-family:var(--ui,inherit);font-size:13px}
.amatlas-plugin-panel[hidden]{display:none}
.amatlas-plugin-panel::before{content:"";position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);z-index:-1}  /* 遮罩:浮窗自带、无需额外 DOM */
.amatlas-plugin-close{position:absolute;top:14px;right:16px;background:none;border:none;color:var(--dim);font-size:18px;line-height:1;cursor:pointer;padding:2px 7px;border-radius:6px;transition:.2s}  /* ✕ 关闭(插件渲染进 head/面板)*/
.amatlas-plugin-close:hover{color:var(--accent);background:var(--bg)}
.amatlas-ach-head,.amatlas-save-head{font-weight:600;color:var(--accent);letter-spacing:.06em;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--line)}
/* 成就条目 ✓/🔒/❓(hidden 隐藏成就未解锁显 ???)*/
.amatlas-ach-item{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;margin-bottom:8px;background:var(--bg);border:1px solid var(--line);border-radius:8px;transition:opacity .3s,border-color .3s}
.amatlas-ach-item.got{border-color:var(--accent)} .amatlas-ach-item.locked{opacity:.5}
.amatlas-ach-item.secret b{font-style:italic;color:var(--dim);letter-spacing:.12em}
.amatlas-ach-mark{font-size:19px;flex-shrink:0} .amatlas-ach-item b{color:var(--ink)} .amatlas-ach-desc{color:var(--dim);font-size:12px}
/* 存档卡片槽:空槽只 💾 存档;有档 📂 读取 + 悬停该行右侧浮现 🗑 删除(二次确认)*/
.amatlas-save-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:11px 13px;margin-bottom:9px;background:var(--bg);border:1px solid var(--line);border-radius:8px;transition:border-color .2s}
.amatlas-save-row:hover{border-color:var(--accent)} .amatlas-save-row.amatlas-save-auto{border-style:dashed}
.amatlas-save-info{flex:1;min-width:130px;font-size:12px;color:var(--ink)}
.amatlas-save-row .amatlas-plugin-btn{padding:5px 11px;font-size:12px}
.amatlas-save-do{color:var(--accent);border-color:var(--accent)}
.amatlas-save-del{margin-left:auto;border-color:transparent;background:none;color:var(--danger);opacity:0;transition:opacity .2s}
.amatlas-save-row:hover .amatlas-save-del{opacity:.8} .amatlas-save-del:hover{opacity:1;border-color:var(--danger)}
.amatlas-save-del.amatlas-save-confirm{opacity:1;color:#fff;background:var(--danger);border-color:var(--danger)}
.amatlas-save-io{margin-top:14px;padding-top:14px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:7px}
.amatlas-save-code{flex-basis:100%;background:var(--bg);color:var(--dim);border:1px solid var(--line);border-radius:8px;font-family:ui-monospace,monospace;font-size:12px;padding:7px;resize:vertical}
.amatlas-map-panel svg{display:block;width:100%;height:auto;max-width:300px;margin:0 auto}  /* 地图 toggle 浮窗;默认玩家视图=node.map 摆位+探索雾(默认 hide 只显已探索;frontier 多显一度邻居)+实时锁(data-locked)+节点标签 hover;进阶换皮见 player-map.md */
.amatlas-minimap line[data-locked]{stroke:var(--danger,#c87b6a);stroke-width:1.6;stroke-dasharray:3 2}  /* 锁住的路:红虚线(实时;门控满足→自动转常态)*/
.amatlas-minimap [data-current]{stroke:#fff;stroke-width:1.6}  /* 当前节点描白边(circle/rect 通用、按钩子非标签;填充金色由引擎给)*/
.amatlas-minimap [data-node]:not([data-seen]){opacity:.32}  /* 未探索淡显:fog:'frontier' 下=一度邻居;'off' 下=全部未探索(默认 hide 不画未探索、此条不触发)*/
.amatlas-node-label{fill:var(--ink,#e8edf4);font-family:var(--ui,inherit);font-weight:600;opacity:0;transition:opacity .15s;pointer-events:none;paint-order:stroke;stroke:var(--panel,#121a26);stroke-width:2.5;stroke-linejoin:round}  /* 节点名:默认隐,hover/当前显;描边光晕压在线上也清晰 */
.amatlas-node:hover .amatlas-node-label,.amatlas-node-label.current{opacity:1}
@media (hover:none){.amatlas-save-del{opacity:.7}.amatlas-node-label{opacity:1}}  /* 触屏无 hover:删除钮/节点名常显(否则手机玩家删不了档、看不到房间名) */
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
```

> 这是**起点不是终点**:复制后按题材调色、按需加效果。但**交付的 index.html 不该低于这个水平**——裸默认样式 = 没做完。

> **换皮(进阶,可选)**:存档/成就/地图三控件都是「素基底 + 可换皮」——上面是最素样式,要换风格**只改这些 class、不碰插件代码/HTML**。例:存档面板想要**紧凑列表**就收紧 `.amatlas-save-row` 的 `padding`、调小 `.amatlas-save-info` 字号;想要**卡片式**(每槽配存档点小地图缩略图)可在槽行里嵌 `buildMinimapSVG(world, meta.pos)` 的产物当背景。引擎不强加风格,进阶样例随用随加。
