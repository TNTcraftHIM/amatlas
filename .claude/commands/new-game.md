---
description: 做一个新游戏(自动判断类型、选择合适的模块和工作流;支持自带大纲/成文故事的改编)
argument-hint: [游戏描述/题材,或:改编 story.md]
---

做一个新游戏。需求:$ARGUMENTS

## 第 0 步:`src/` 已有游戏?(防覆盖,最先查)
若 `src/world.js` 已存在 = 项目里已有一部进行中/完成的作品。**先停下问用户**三选一:
① 继续改旧作(改用 `/polish-game`)② 归档旧作(整个 `src/` 改名挪到 `archive/<游戏名>/`,连同项目根的 `canon.md`/`PROGRESS.md` 一起挪)③ 用户明确说覆盖才覆盖。
**别不问就覆盖**——端用户包没有 git,覆盖=整部作品不可逆丢失。要再做一部新游戏,推荐做法是把整个引擎文件夹复制一份(一份引擎 = 一部游戏,存档天然隔离;见 README「做第二部游戏」)。

## 素材形态判断(用户给的是题材,还是自带故事?)
- **一句话题材/点子** → 直接走下面的类型判断(原创流程)。
- **自带大纲 / 章节梗概 / 完整成文故事**(贴在对话里、或指了 `story.md` 这类文件、或话里说"我写好了故事/大纲")→
  **改编流程**:先读 `text-adventure-game` skill 的 `references/story-adaptation.md`——canon 从原文**提取**而非自创、
  先问用户**忠实度选档**(正典线+增殖分支〔默认〕/ 重写浓缩保骨架 / 松改编)、按故事形态选分支结构、
  delayed branching 挖选择点、原作结局保证可达。长文让用户放项目根 `story.md` 再 `/new-game 改编 story.md`。
  改编流程的阶段 3-5(装配/审计/构建)与原创相同,仍走下面的类型路由选模块。

## 类型判断(先做,别默认文字冒险)
1. 读 `text-adventure-game` skill 的 SKILL.md「类型路由」,判断需求匹配哪个分支。
2. **动手前先按 `.claude/rules/building-discipline.md` 写出计划**(目标 / 步骤 / 每步检查点),再开始。
3. 路由:
   - **文字冒险 / 互动小说 / 选择驱动叙事** → 走下面「文字冒险分支」(调用 `text-adventure-game` skill 的 5 阶段工作流)。
   - **跑团 / 检定 / 资源 / 角色卡** → 用 `modules/tabletop` 模块:先读 `modules/tabletop/references/tabletop-design.md`(怎么设计:何时掷骰/角色卡/资源时钟/定 DC),再照 `modules/tabletop/references/few-shot.md`(schema 例子)做。
   - **过场演出(intro / 结局 / 章节过渡的时间轴演出)** → 用 `modules/cutscene`:节点 `kind:'cutscene'` + `beats` 节拍数组(每拍 `{dur秒 | hold:true, text?, scene?, audio?, run?}`),按时间轴自动推进。首拍/中间拍只有「▸」逐拍即时快进，**末拍才显示 `links` 出口**；每次快进仍按序执行目标拍 `run`。先读 `modules/cutscene/references/cutscene-authoring.md`,范例照抄 `examples/cutscene-demo`。**出口用 `links`(写 exits 会 fail-loud 拦)**;index.html 加 `<script src="../modules/cutscene/runtime/cutscene.js"></script>`(world 有 cutscene 节点 → boot 自动拉模块)。
   - **引擎里没有的玩法类型**(横版射击 / 模拟经营 / 卡牌 / 打地鼠…)→ 先读 text-adventure-game skill 的 `references/plugin-development.md` 创建新模块(Level 1 复制 `modules/minimal` 起步),再做游戏。
   - **混合类型** → boot 自动拉 world 用到的内置 kind(scene/encounter),自定义模块加进 `manifest.modules:[...]`;一句 `A.boot(WORLD, manifest)` 全装配(范例 `examples/tabletop-demo/game.js`)。
   - **不确定** → 先用文字冒险(或 `modules/minimal`)做能跑的原型,再决定换/加。

   > **跑团/混合 · 检定节点照抄即用**(⚠️ **别自创 `check`/`on_success`/`on_failure`/`modifiers`——引擎不认、检定静默失效,graph-audit 报"跑团检定格式错"**;真契约只有 `checks`/`success`/`fail` + `exits`,照抄下面或 `examples/tabletop-demo`):
   > ```js
   > // ① game.js 的 boot manifest 里加 sheet(world 有 kind:'encounter' → boot **自动拉**跑团模块,无需手写 use):
   > //    A.boot(WORLD, { sheet:{ name:'调查者', skills:{ 感知:2, 体魄:1 }, resources:{ 状态:3 } }, save:true, minimap:{ mode:'toggle', layout:'spatial' }, achievements:[] })
   > // ② index.html 的 <script> 仍要加(boot 从 window.Amatlas 读它;在 renderer.js 后):<script src="../modules/tabletop/runtime/tabletop.js"></script>
   > // ③ world.js 检定节点 = kind:'encounter' + checks[](掷骰 vs DC)+ exits[](移动;成功后开门用 available 门控):
   > crystal: { kind:'encounter', title:'水晶共鸣', look:'你拿起水晶,它开始发热……',
   >   checks: [ { id:'decipher', label:'破译古文', skill:'感知', dc:6, dice:'2d6',
   >     cost:{ res:'状态', amount:1 },                        // 消耗资源(可选)
   >     success:{ text:'你读懂了符号。', set:{ understood:true }, clock:1 },   // 后果:文本 + 置 flag/state + 推时钟;另可 to:'节点id' = 成功直接移动(v12)
   >     fail:{ text:'符号一片模糊。', clock:1 } } ],                           // fail 也可带 to = 失败送去新处境(fail forward,防原地无限重掷磨档;to 必须指向真实节点!详见 tabletop-design §4b)
   >   exits: [ { to:'chamber', label:'继续深入', available:(S)=>!!(S.flags&&S.flags.understood) } ] }
   > ```

---

## 文字冒险分支(匹配文字冒险时走这里)

调用 `text-adventure-game` skill,严格走它的 5 阶段工作流(SKILL.md)。要点:

## 起步(模块化架构 —— 写数据 + 组装插件,不手搓引擎、不用旧单文件模板)

> **动手第一件事:生成本作的游戏身份 UUID。** 跑 `node -e "console.log(require('crypto').randomUUID())"`,把输出写进 `world.js` 顶层 `id`(存档隔离键,缺失/非法引擎会直接 fail-loud 报错)。**复制 demo 或另做一部时必须换新 UUID**——否则两款同骨架游戏在 `file://` 下碰撞存档。(仅"同一游戏的翻译/发行变体、有意共享进度"才保留原 ID。)

- 阶段 1(设计)必须产出 `canon.md`(时间线/世界规则/角色状态+声音速写/物品语义/环境细节)。模板见 `references/canon-tracking.md`。**写作全程持续更新,每 5 场景追加新事实。**
- **(空间/探索类游戏)阶段 1 在 canon 之后、写事件之前,先定地图骨架**:地点 + 出口(相邻关系,约定对称双向)+ region;**再把事件布到地图上——先世界,后填充**,别先写一堆事件再用边勉强连(那正是"无限循环/重复插页/空转"的根源)。详见 `references/world-model-and-process.md`。
- **阶段 2 用模块化架构**(逻辑/写法照抄 `examples/text-adventure-demo/`,但**文件一律建在 `src/` 目录**:`src/world.js` + `src/game.js` + `src/index.html`,构建产物落 `src/dist/`。**别放项目根、也别放 `games/<名>/` 等别处**——结束前的审计闸只在 `src/` 查,放别处等于没验):
  1. **`world.js`** — 世界数据:`{ id, start, initState?, maps:{ <map>:{ name, nodes:{ <node>:{ kind:'scene', name, look, links, events?, scene?, audio? } } } } }`。作者只写数据。**先运行 `node -e "console.log(require('crypto').randomUUID())"` 生成一次 UUID v4 写进顶层 `id`，以后内容升级不改；复制 demo 做另一款游戏时必须换新 UUID**（若只是同一游戏的翻译/发行变体且明确要共享进度，才保留原 ID）。**自定义数值/状态(体力、理解、物品…)的初始值写在顶层 `initState`**(如 `initState:{ stamina:3, understanding:0, inventory:[] }`)——**任何被 `run`/`events` 里 `S.x -= n` 这类算术读写的字段,必须先在 `initState` 给初值**,否则 `undefined - n = NaN`、之后所有 `S.x >= n` 门控恒 false、游戏卡死(契约 §3.1;别和跑团 `sheet.resources` 同名)。
  2. **`game.js`** — 启动胶水:用 `A.boot(WORLD, manifest)` 声明式装配——boot 按 world 用到的**内置 kind** 自动拉玩法模块(scene→文字冒险 / encounter→跑团),自定义 kind 仍走 `manifest.modules`,同时挂 manifest 声明的呈现器/插件、跑 `start()`、返回 engine(escape hatch)。**删 manifest 里一项 = 关掉那能力**。⚠️ boot 只省掉手写装配,**不改 index.html**:它从 `window.Amatlas` 读各工厂,故 index.html 仍须引全部模块/呈现器/插件 `<script>`(只多加一行 `preset/boot.js`)。**逐字抄下面的块,按需改 manifest**:
```js
// game.js — 逐字抄,按需改 manifest 项。boot 自动拉内置玩法模块(scene/encounter)、挂呈现器/插件、跑 start、返回 engine。
// 铁律:index.html 仍须引各模块/呈现器/插件的 <script>(boot 从 window.Amatlas 读它们)+ 一行 preset/boot.js;
//       每挂一个带 slot 的能力,index.html 就要有对应挂载点 id(删 manifest 项也删对应 <script> 与 div,否则功能静默消失)。
(function () {
  function boot() {
    var A = window.Amatlas;                                            // 唯一命名空间
    var WORLD = window.MY_WORLD;                                     // 你的世界数据(见 world.js；必填稳定 UUID v4 id)
    var engine = A.boot(WORLD, {                                     // 一句声明式装配；存档 namespace 自动由 WORLD.id 稳定派生
      status: function (S) {                                         // 状态条 → 填 #status(别自己 setInterval 轮询 _engine.state)
        var bits = [];                                              // 按 initState 字段加(字段名必须和 initState/run 里**逐字一致**,拼不一样 → 状态条静默空白);无自定义状态就返回 []
        if (S.stamina != null) bits.push({ label: '体力', value: String(S.stamina) });
        // 跑团角色卡资源(混合游戏)= 裸 `S.sheet.resources.<名>`(不是 `S._sheet`!`sheet` 是公共字段同 `inventory`;
        //   `_` 前缀只用于插件私有 namespace 如 `_achievement`)。详见 references/tabletop-design.md。
        if (S.sheet && S.sheet.resources && S.sheet.resources['精力'] != null) bits.push({ label: '精力', value: String(S.sheet.resources['精力']) });
        return bits;
      },
      // 以下全可选,删掉一项 = 关掉那能力(并删 index.html 对应 <script> 与挂载点):
      save: true,                                                   // 💾 存档(多槽:autosave+3 手动槽+导入/导出)→ 默认挂 #plugin-bar
      minimap: { mode: 'toggle', layout: 'spatial' },               // 🗺️ 小地图(工具栏 toggle;**默认玩家视图**=给节点标 node.map:{x,y} 摆位+探索雾+实时锁+标签 hover;查结构改 layout:'ring';mode:'inline' 则常驻 #plugin-minimap)
      achievements: [],                                             // 🏆 成就(简写;每条 { id, title, description, on:'enter'|'action', when:(S)=>bool, hidden? }——description=面板小字说明【务必写,只有 title 很干瘪】;hidden:true=未解锁显 ❓??? 防剧透)→ 默认挂 #plugin-overlay;成就**跨 reset/重开持久**(插件账本从 WORLD.id 的核心 namespace 派生,已解锁不重复弹窗)——按『跨周目元进度』来设计
      reset: true                                                   // ↻ 重新开始(挂 #plugin-bar 工具栏,同 save/minimap 形态)→ 自动 confirm 二次确认 + engine.reset()。**推荐写 true**;不写就不挂(老作者自己写 <button id="reset"> + onclick 仍可作 escape hatch)
      // ⚠️ when 里判「到访过某节点」**首选读你自己在 world 里 set 的 flag**(单一真相,最稳):如 `when:(S)=>!!(S.flags&&S.flags.foundSeal)`。
      //    **别去拼 S.seen 的子键猜格式**——seen 的键是 `'map/node'`(**斜杠**,见契约 §3;不是冒号 `'map:node'`!写错=永远查不到=成就静默永不解锁,且三闸都抓不到)。
      //    要「踏足全部 N 处」这类计数,用 `Object.keys(S.seen||{}).length >= N`(见 examples/text-adventure-demo 成就),别逐个写 seen 子键。
      // present: { svg:false, audio:false }                        // svg/audio 默认挂(引了对应 <script> 才生效);要关就显式 false
      // 跑团:world 有 kind:'encounter' → boot 自动拉 Tabletop,这里加 sheet:{ name, skills, resources }(见上「类型路由」检定模板)
      // 过场:world 有 kind:'cutscene' → boot 自动拉过场模块(manifest 零新增键;见「类型路由」过场行 + modules/cutscene/references/cutscene-authoring.md)
      // 自定义玩法:modules:[ A.YourModule.createYourModule({...}) ](见 examples/minimal-demo)
    });
    window._engine = engine;             // 供「结束前装配探针」验首屏(推荐;重开按钮已由 manifest.reset:true 挂工具栏,无需手写)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
```
  3. **`src/index.html`** — 完整 HTML:**给这个游戏一个自己的视觉身份**——共享 UI skin(`../ui/amatlas-skins.css`,8 套 `data-ui`;作者手册 `docs/ui-skins.md`,AI 短卡 `references/ui-skins.md`)是**可选起点**:选一套贴题材的 skin、覆盖 `--amatlas-*` token 做本作专属外观、**或**干脆写自己的 CSS(`references/game-design-guide.md` §5)。**别所有游戏都默认同一套 `amatlas-dark`**——那会让不同游戏长一个样(引擎只给钩子、样式归你,多样才对)。要素是「有精致视觉」,不是「用哪套皮肤」。+ **下面这套完整 `<body>` 骨架(挂载点 id 照抄、别自创)** + 按序 `<script src>`。**这些 id 是呈现器/插件的挂载点 ——`game.js` 挂了哪个能力就必须保留对应 id;删了 id,对应功能会"静默消失"(引擎找不到挂载点不报错、只 no-op,这是 showcase 实测把整套 UI 写崩的根因)**:
```html
<!doctype html>
<html lang="zh-CN" data-ui="amatlas-dark">   <!-- 选一套贴题材的 skin(见 docs/ui-skins.md 8 套:amatlas-dark/parchment/terminal/casefile/rust-zine/occult-margins/neon-noir/field-notes),或删掉本属性走完全自定义 CSS;别每个游戏都照抄 amatlas-dark -->
<head>
<meta charset="utf-8">                <!-- 必须:少了=中文乱码(file:// 无 HTTP 头兜底) -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">  <!-- 必须:少了=手机按 980px 桌面宽缩放、字小到没法读 -->
<title>你的游戏名</title>
<link rel="stylesheet" href="../ui/amatlas-skins.css">
<style>/* 可选:放在共享 CSS 后面,只改 --amatlas-* token 或本作专属材质;别改挂载点 id/class */</style>
</head>
<body>
<main id="app">
  <div id="plugin-bar"></div>    <!-- 工具栏:存档💾/地图🗺️/成就🏆/↻ 重开/🎒 物品栏 全挂这。**放 #app 顶部**(常驻控件惯例;别放最底或 #app 外——全屏布局下会被推出屏看不见)-->
  <div id="mapname"></div>      <!-- 地图名(DomPresenter 填)-->
  <h1 id="place"></h1>           <!-- 当前地点标题(DomPresenter 填)-->
  <div id="scene"></div>         <!-- SVG 场景(挂 SvgPresenter 才有;:empty 时 CSS 隐藏)-->
  <div id="look"></div>          <!-- 正文(必需)-->
  <div id="choices"></div>       <!-- 选项(必需)-->
  <div id="status"></div>        <!-- 状态条(DomPresenter 据 status 选项填;别用 setInterval 轮询 _engine.state)-->
</main>
<!-- ↻ 重开按钮由 manifest.reset:true → ResetPlugin 自动挂进 #plugin-bar(不再手写 <button id="reset">) -->
<div id="plugin-minimap"></div>  <!-- 小地图 inline 模式插槽(默认 toggle 时地图按钮进 #plugin-bar、此 div 空) -->
<div id="plugin-overlay"></div>  <!-- 成就弹窗插件 -->

<!-- 引擎脚本用 ../ 指上一级(游戏在 src/、引擎在项目根);world.js/game.js 同目录无前缀 -->
<script src="../core/runtime/engine-core.js"></script>
<script src="../modules/text-adventure/runtime/renderer.js"></script>  <!-- 跑团再加 ../modules/tabletop/runtime/tabletop.js;过场再加 ../modules/cutscene/runtime/cutscene.js -->
<script src="../presenters/present-dom.js"></script>
<script src="../presenters/present-svg.js"></script>     <!-- 可选 -->
<script src="../presenters/progressions.js"></script>    <!-- 可选·命名和弦库(progression:'lament' 等);compose-music 之前 -->
<script src="../presenters/compose-music.js"></script>   <!-- 可选·用 audio.music 时 -->
<script src="../presenters/midi-music.js"></script>      <!-- 可选·audio.music 用 {midi:...} 嵌 MIDI 时 -->
<script src="../presenters/present-audio.js"></script>   <!-- 可选 -->
<script src="../plugins/save.js"></script>               <!-- 可选:存档 -->
<script src="../plugins/minimap.js"></script>            <!-- 可选:小地图 -->
<script src="../plugins/achievement.js"></script>        <!-- 可选:成就 -->
<script src="../plugins/reset.js"></script>              <!-- 推荐:↻ 重新开始(manifest.reset:true 触发挂载) -->
<script src="world.js"></script>
<script src="../preset/boot.js"></script>   <!-- ⚠️ game.js 用 A.boot 就必须引它!漏了 = window.Amatlas.boot 未定义 → 「A.boot is not a function」→ 整页白屏 -->
<script src="game.js"></script>
</body>
</html>
```
     ⚠️ 引擎脚本用 `../`(你的游戏在 `src/`);`examples/text-adventure-demo/` 在 `examples/<名>/` 才用 `../../`——**别照抄 demo 的层级前缀**。**插件 `use` 行 ↔ 挂载点 id 必须配对**(挂 minimap 就留 `#plugin-minimap`,删 minimap 就把它的 `use` 行和该 div 一起删)。整个 `<body>` 结构可直接抄 `examples/text-adventure-demo/index.html`。⚠️ 但 `examples/text-adventure-demo/index.html` **不含 `midi-music.js`**(它不嵌 MIDI);你上面的骨架已含此行——用 `audio.music:{midi:…}` 嵌现成曲就必须保留它(漏引运行时会报错提示加),不用 MIDI 则可省。
  4. **构建**:`node pipeline/build/build.mjs src/index.html`(过准入门:死链/schema → 单 HTML),双击 `src/dist/index.html` 实玩。
  - **不要复制旧的单文件模板、也不要从空白手搓引擎。** 核心 / 模块 / 呈现器都现成,你只写 `world.js` + `game.js` + `index.html` 三个文件。
- **条件内容**(首次/重访、按 flag 变化)写在 `look` 里:`{ first:'…', return:'…' }`,或函数 `look: (S, first) => first ? '…' : ('…' + (S.flags.x ? '…' : ''))`。**没有 `{{if:flags}}` 标记语法**——模块化呈现器不解析它,会把 `{{…}}` 原样显示给玩家。
- **场景焦点物件**:`character` 元素**默认已画剪影人影**(`art:'robed'/'guard'…` 可换造型);item/hazard 默认抽象 glyph。加 `art:'<预设名>'`(**20 个内置**:物件 14〔ship/altar/chest/sword/fire/crystal…〕+ 剪影人物/生物 6〔figure/robed/hooded/guard/beast/crowned〕)或 `art:[{shape,…}]`(art-spec DSL,本地居中坐标)画**具体物件**。清单/DSL/范例见 `references/visual-system.md`「物件具体化」(背景由呈现器画,art 只画焦点物件)。
- **多图拆分**:**单个 map ~30 节点内**,大游戏按章节/区域拆多个 `maps`(引擎原生支持、小地图只渲染当前图;塞一图=地图拥挤,graph-audit 会 P2 提示)。
- **音频(推荐默认双层)**:节点 `audio:{ music:'calm', ambient:'wind' }` ——`music`=程序作曲配乐(**预设 22 个**〔气质 calm/tense/eerie/heroic/sad/sacral/desolate… + 曲风 synthwave/jazz-noir/march/chase/romance/scherzo/stealth/elegy/baroque…,全 22 清单逐字抄见 audio-system.md〕,或 `{preset:基底,…微调}` 或 MusicSpec〔可选 `timbre` 音色板换 pad/lead/arp 发声体〕,**或 `{midi:'<base64>',loop?,gain?}` 嵌 .mid 现成曲**〔须引 presenters/midi-music.js,模板已含〕),`ambient`=环境声景(13 预设 waves/wind/rain/cave… 或 AmbientSpec),**两层并行同响**;`bgm` 是最简后备。清单/Spec/范例见 `references/audio-system.md`「作者意图词汇」。**v15 缺省继承**:不写某层=继承上一曲继续播,**换曲写 `music:'新名'`、停曲写 `music:false`,不变就别写**(音乐自动过场延续,不再漏写就全停)。**预设名逐字抄清单**(graph-audit 会静态查 typo:ambient 写错真机每帧报错、music 写错被换成默认曲)。引擎自动在 `#plugin-bar` 挂 **🔊 静音钮**(玩家可关声,IFTF 无障碍惯例;不想要 → manifest `present:{audio:{control:false}}`)。**`scene.region` 用已知 13 词或其近义词**(beach/sea/forest/night/cave/room/ruins/town/desert/snowfield/volcano/skyclouds/swamp;village→town 这类会归族;拿章节名当 region 只得深色底、无剪影)。
- `links` 选项 schema:`{ label, to }` 移动 · `{ label, run }` 纯动作 · `once:true` 一次性 · `requires:(S)=>bool` 解锁 · `showWhenLocked:true` + `lockHint` 灰显 affordance。**玩家动作的状态改变写在该选项的 `run` 里**;`events` 只放"进入节点时自动触发的旁白/后果",**别把玩家要点的动作逻辑塞进 `events`、再留一个空 `run` 的按钮——那样点击毫无反应**(showcase 实测坑)。**`run` 返回字符串 = 本次回应文本**(自动显示给玩家,与 event.run 对称——纯动作务必 return 回应,否则点了"没反应");**可重复的增益动作记得 `once:true` 或 `requires`**(否则玩家反复点同一选项无限刷属性,graph-audit 会 P1 提醒)。

- **物品栏(可选,🎒)**:想要可见的"已拾取物品"栏,三件配套缺一不可:① `game.js` 的 manifest 加 `use: [A.InventoryPlugin.createInventoryPlugin({})]`(物品栏**不是** boot manifest 键,走 `use:` 挂任意插件;`use` 与 `save/minimap/achievements` 同级)② `index.html` 引 `<script src="../plugins/inventory.js"></script>` ③ 保留 `#plugin-bar` div(已有,与存档/地图/成就共用)。**物品 = 数据**:`world.initState.inventory: []` 预声明(字段名**固定 `inventory`**、是普通作者字段同 `stamina`,**别写成 `_inventory`/`inv`** 否则插件读空栏);拾取在选项的 `link.run` / 迷宫的 `events[i].run` 里 `(S.inventory || (S.inventory = [])).push('gem')`——**插件只读渲染、绝不替你写**(别把拾取塞进插件)。**显示(可选)**:`world.items = { gem: { label:'宝石', icon?, description? } }`(纯数据、引擎只读不校验=开放词汇;**不写也能拾取**、缺条目就显裸 ID);`icon` = emoji 字符串(最简最稳,如 `'🔑'`)**或** art-spec 矢量图元数组(同 `scene.element.art` 的 DSL,需引 `present-svg.js`;迷宫 `GLYPHS` 的像素 `{art,palette}` 格式**不支持**)。**持久 vs 迷宫临时(关键)**:进物品栏的是**持久物**(随存档);迷宫过关钥匙(`'K'`→`g.hasKey`)、将来 FPS 武器/弹药/血量等**迷宫局部临时物留在迷宫、不进栏、被抓/退回自动重置**(判据:"玩家下次会话还找得回它?"→是=持久写 `S.inventory`、否=临时写迷宫 `g.*`,**绝不把迷宫钥匙写进 `S.inventory`**=Doom 钥匙陷阱)。**隐藏结局道具零新机制**:`events[i].run` 写 `S.flags.gotIdol = true` + 结局 `links` 用 `requires: (S) => S.flags.gotIdol` 门控(`graph-audit` 死 flag 检测自动覆盖)。**范例**:`examples/maze3d/` 的 horror recipe(照片拾取进 🎒);更简的"状态条文字版"见 `examples/text-adventure-demo`(inventory 在 status 行显示、不挂插件)。**注**:迷宫里 `events[i].run` 经 `api.apply` 触发引擎渲染(同通关写 winKey 的通道),拾取后物品栏按钮**即时刷新**、并随之自动存档——不必走出迷宫才更新。

## 过程纪律
- 按中段塌陷协议(见 `references/consistency-guardrails.md`)跑 reviewer:场景 1-15 每 15 场景;**16-40 每 10 场景(加密);41+ 每 15 场景**。reviewer 必须做 canon 交叉核对(时间线/角色状态/世界规则/声音,见 `references/canon-tracking.md` + `references/consistency-guardrails.md`)。
- 每写完 5 场景更新 `canon.md`(新确立的事实追加进去)。
- 每个场景:≥2 感官 + 1 surprising detail;每个选项(含默认)都要有真正的状态改变(`run`/`to`),不做假选择(多选项同 `to` 无 `run` 差异)。
- 多入口枢纽场景从一开始就用 `look:{ first, return }` 分首次/重访,别等审计阶段补。
- **每个非结局节点至少一条「保底出口」**(无条件、**非一次性(`once`)**、或条件必能满足的 link/exit):别让一个节点的所有出口都靠 flag/资源/检定门控,也别让唯一的无条件出口是 `once`(一次性=不可逆,用掉就没、重访即卡)——否则运气/路径不对就 **soft-lock 卡死**(人工极难测)。这是自 LucasArts 1990《Loom》起的业界共识:玩家不该被设计进「不可通关状态」(反面是 Sierra 早期的 "walking dead")。`graph-audit` 报「无保底出口」**P0 硬拦**(含 once;出口标 `lockHint` 写明有意才降 P1)。**有意**未完成/单程的死路用 `lockHint` 写明(如「本章未完工」),让玩家知道是有意、也让审计区分。
- 中文对话用 `「」` 不用引号(JS 模板字面量里普通引号会语法错误)。

## 收尾(阶段 4)
- 跑 `node core/tooling/graph-audit.mjs src/world.js`,P0(死链/坏 start/**无保底出口**——节点所有出口都带条件;出口标 `lockHint` 写明有意才降 P1)清零;并查 P1 逻辑死锁:「**死 flag**」(被读却从不写的 flag)——soft-lock、人工极难测,确认非有意后修。
- 必跑 `node core/tooling/assembly-probe.mjs src/index.html` + `node pipeline/build/build.mjs src/index.html`；若 `node -e "require.resolve('jsdom')"` 成功，再追加 `--smoke` 查加载崩溃/残留标记，未安装则明确记录可选 smoke 跳过。
- `node test/run.cjs` 回归全绿(若动过模块/呈现器/插件代码)。
- 用 `/balance-check` 核算属性门槛(可重入数值用核心 `once:true` 守卫;门槛落在"浅通关达不到、深挖能达到")。
- 浏览器实玩:存档读档、隐私模式不白屏、移动端、重访文字正确、至少通 2 条不同路径 + 2 个结局。

## 输出
- 构建产物是单个 all-in-one HTML(CSS+JS 全内联,零外链,断网可玩)。
- **index.html 的 CSS 要达到精致成品水平,且有本作专属的视觉身份**:可选一套贴题材的 `data-ui` skin 起步、再覆盖 `--amatlas-*` token 做出专属外观,**或**完全自定义 CSS(`references/game-design-guide.md` §5)。**两条都别踩**:别交裸默认样式(用户拿到的是成品),也别让每个游戏都停在同一套 `amatlas-dark`(不同游戏该有不同气质——引擎只给钩子、审美归你)。

## 完成后(可选但推荐)
- 如果这次形成了**值得复用**的风格 / 设计模式 / 叙事约定 / 工作流偏好,考虑把它固化成一个 skill(下次 Claude Code 自动发现并加载)——见 `references/creating-skills.md`。
