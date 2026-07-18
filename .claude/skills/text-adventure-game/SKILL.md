---
name: text-adventure-game
description: "Use when building text adventure / interactive fiction / choice-based narrative games as single self-contained HTML files. Guides a 5-phase workflow from design to audit on the Amatlas engine (data-driven nodes, procedural SVG scenes, Web Audio music/ambience); automatic structural gates catch dead links, soft-locks and assembly bugs so the game runs. Supports Chinese and English narrative."
version: 3.0.0
author: TNTcraftHIM
license: MIT
metadata:
  tags: [creative, game, html, interactive-fiction, text-adventure, chinese, narrative, choice-based]
---

# Text Adventure Game — 一次性生产级工作流

## Overview

本 skill 整合了一款 60 万字中文互动小说（《制图师的挽歌》）10 轮迭代的完整经验。
目标：让 agent 拿到"做一个文字冒险游戏"的需求后，一次性产出 80% 完成度的作品，
跳过所有踩过的坑。

**模块化源码**(`world.js` 世界数据 + `game.js` 组装 + `index.html` 模板)经 `pipeline/build` 构建成**单 all-in-one HTML**(CSS+JS 全内联、零外链、断网可玩)。
默认用 `Amatlas.boot(WORLD, manifest)` 装配:boot 按内置 kind(`scene`/`encounter`)自动拉文字冒险/跑团模块,按 manifest 叠加文字/SVG/音频呈现器 + 存档/小地图/成就插件;自定义 kind 走 `manifest.modules`,底层 `engine.use(...)` 仍是高级 escape hatch。

## When to Use

- 用户提到：文字冒险、interactive fiction、文字游戏、text adventure、
  choice-based game、互动小说、选择驱动叙事、visual novel 风格、
  浏览器故事游戏
- 不适用于：Unity/Godot 等引擎项目、纯视觉小说（图片为主）、
  多人在线游戏、需要后端服务器的游戏

## 类型路由（先判断再走分支）

本 skill 专精**文字冒险 / 互动小说**。收到"做一个游戏"的需求,**先判断类型,别默认所有游戏都用文字冒险**:

> **素材形态先于类型**:用户**自带大纲/章节梗概/完整成文故事**(贴对话里、或指了 `story.md` 这类文件)→ 走
> **改编流程** `references/story-adaptation.md`(canon 从原文提取非自创/先问忠实度选档〔正典线+增殖分支·重写浓缩·
> 松改编〕/按故事形态选分支结构/delayed branching 挖选择点/原作结局保证可达);阶段 3-5 与原创相同。

- **文字冒险 / 互动小说 / 选择驱动叙事 / visual novel 风** → 下面的 5 阶段工作流(本 skill 主线)。
- **跑团 / 检定 / 资源管理 / 角色卡** → 用 `modules/tabletop` 模块:先读 `modules/tabletop/references/tabletop-design.md`(**怎么设计**:何时掷骰 / 角色卡 / 资源时钟平衡 / 定 DC),再照 `modules/tabletop/references/few-shot.md`(填好的 schema 例子)动手(表现层叠加同 `examples/tabletop-demo`)。**骰子外观/换皮**(骰形随面数、暴击/大失败特效、材质/配色/真 3D)见 `modules/tabletop/references/dice-styles.md`。
  - **混合(文字冒险 + 跑团)**:scene 节点照常写,**需要数值鉴定/掷骰的节点用 tabletop 的 `kind:'encounter'`**(`Amatlas.boot` 会按 world 里出现的 `scene`/`encounter` 自动拉文字冒险与 Tabletop;index.html 仍须引两个模块脚本,manifest 里给 `sheet`)。**掷骰一律用模块的 `api.dice`**(种子化、随存档可复现、有检定 UI + 可动画骰子);**绝不在 `look`/`run` 里塞 `Math.random()`**——不可复现(玩家重载存档结果就变)、没检定 UI、也不触发骰子动画(showcase round6:模型为省事用 `Math.random` 假掷骰 → 用户根本没看到"数值鉴定")。哪怕只有一处检定也走 `encounter`,别自己造轮子。**encounter 节点格式照抄 `examples/tabletop-demo` / new-game 模板:`checks:[{skill,dc,dice,cost?,success:{text,set?,flag?,clock?,to?},fail:{…}}]` + `exits:[]`(v12:`success.to`/`fail.to`=检定结果直接移动——失败也可以去新节点=fail forward,防"原地无限重掷"磨档,详见 tabletop-design §4b)——⚠️ 别自创 `check`(单数)/`on_success`/`on_failure`/`modifiers`(引擎不认、检定静默失效、graph-audit 报"跑团检定格式错";showcase round8 实测:模型自创格式→构建报"不可达"→误判成"引擎不支持"→砍掉整个跑团)。**
- **过场演出(intro / outro / 结局 / 章节过渡)** → 用 `modules/cutscene`:节点 `kind:'cutscene'` + `beats:[{dur秒 | hold:true, text?, scene?, audio?, run?}]` 按时间轴自动推进(**dur 单位是秒**,别写毫秒);每拍复用既有 scene/audio 词汇——画幅黑边=`elements:[{kind:'letterbox'}]`、音乐走 v15 缺键继承(第 0 拍起乐、后面的拍不写 audio 就一直播)、拍不写 scene=继承上一拍(画面连续不闪,写新 scene=重建出场)。首拍/中间拍动作面只有「▸」逐拍即时快进，**末拍才显示 `links` 出口**；连续点 ▸ 仍会按序经过每拍并执行对应 `run`，不能绕过中间状态。**出口用 `links`、别写 exits(fail-loud 拦)**;「看完过场」成就用 `on:'action'` 查末拍 run 置的 flag(演出期间不再发 enter)。手册 `modules/cutscene/references/cutscene-authoring.md`,范例照抄 `examples/cutscene-demo`(intro→正文→结局三段全示范)。
- **恐怖游戏** → 恐怖是**基调(tone)横切所有玩法,不是单一玩法类型**——别一听"恐怖"就上迷宫。先分流:**① 纯叙事/心理恐怖**(阅读/悬疑慢热/克苏鲁/邮件体/visual novel 风/不可名状)= **走上面文字冒险主线**,恐怖靠表现层(present-svg `eyes`/`dread`/`letterbox`/`transition` 见 `references/visual-system.md` + `ambient-unease` 见 `references/audio-system.md` + mood `dread`/`eerie`/`horror-climax`),**不用 maze3d**。**② 第一人称迷宫探险/怪物实时追逐/贴脸 jump-scare** = 读 `references/horror-game-design.md` 用 `maze3d`(先看 `examples/maze3d/index.html`:一个统一入口内含 basic / horror / puzzle / layers recipes;追逐参考 horror recipe,视觉素材看 `examples/maze3d/gallery.html`,声音核听看 `examples/maze3d/audio-gallery.html`;这些 recipes 都是同一 `raycast-maze.js` runtime,不是不同模块;主题/怪物/proxFx/突脸/deathFx 全数据驱动;Wolf3D 级 fillRect lo-fi、非手绘贴图但声画演出到位)。**③ 恐怖检定**(理智/逃跑 DC)= 叠 tabletop `encounter`。**多数完整恐怖短篇 = 混合**:大量 scene 铺心理叙事 + 1-3 个 maze3d 节点做追逐高潮 + 可选检定;maze3d 是**可选高潮武器**非默认形态(纯堆迷宫=游戏感盖过恐怖叙事)。题材→theme/face 速配表见 `horror-game-design.md` §0/§8。
- **谜题 / 小游戏关卡(组合锁 / 拨号锁 / 序列·Simon / 撬锁检定 / 实时 arcade 如贪吃蛇)** → 先读 `references/puzzles-and-minigames.md`。小游戏=一等可组合内嵌玩法模块,与正常玩法混排。**分层**:多数谜题(组合锁/序列)=节点图 + 门控写法(**零引擎改动**、§A,照抄即可);张力检定走 tabletop;真·实时 arcade 写自定义玩法模块(与内置模块**同一等机制**,引擎一行不加),照抄 `examples/arcade-demo`(最小贪吃蛇,§B)。⚠️ 逃生口必须**无条件 + to 别的节点**(`to:self` 清零不算逃生口、会掩盖真 soft-lock);闸不验证谜题逻辑可解性,靠人工试玩。**小游戏别 `enter` 即起局**(前置 ready 待机屏让玩家 opt-in);**限次/锁死必 fail-forward**(锁一扇门=同时开另一扇,别接死墙)——见 §B.7。
- **引擎里没有的玩法类型**(横版射击 / 模拟经营 / 卡牌 / 打地鼠…)→ 先读 `references/plugin-development.md` 创建新模块(Level 1 复制 minimal 起步),再做游戏。
- **新的视觉/听觉表现 或 辅助功能**(Canvas/像素风 / 排行榜 / 多语言…)→ `references/plugin-development.md` 的呈现器 / 能力插件分支。
- **不确定** → 先用文字冒险(或 `modules/minimal`)做一个能跑的原型,再决定换/加模块。

无论走哪条:**动手前先写出计划:目标 / 步骤 / 每步检查点**,再开始(Claude Code 随包 `.claude/rules/building-discipline.md`,会自动加载;其他工具照此原则手动写一份即可)。

## 修改分层(想改东西时,先想清楚改哪一层)

游戏做出来后要调整,**先判断属于哪一层,改对应的地方**——别什么都往世界数据里塞,也别以为 presenter 不能动。

| 想改什么 | 改哪里 | 例子 |
|---|---|---|
| **玩法 / 机制** | 模块(写新模块 / 换模块 / 改模块逻辑) | "从文字冒险加上检定玩法" → 加 `tabletop` 模块 |
| **内容 / 意图** | `world.js` 数据(节点的 `look`/`scene`/`audio`/`checks`/`exits`) | "这里 BGM 换舒缓的" → 改该节点 `audio.bgm` 的值 |
| **普通 UI 外观** | `index.html` 的 `data-ui` / `--amatlas-*` token / 本作 CSS | "整体想更像档案袋" → 换 `data-ui` 或覆盖 token,不改 presenter |
| **场景/声音呈现细节** | **这个游戏自己那份 presenter 代码**(映射表) | "forest 背景太深" → 改 `presenters/present-svg.js` 的 `REGION_BG.forest` |
| 引擎核心 | **不碰** `core/runtime/engine-core.js` | —(类型无关核心,改它=改引擎本身) |

**关键**:presenter(`presenters/present-svg.js` / `present-audio.js`、文字 `present-dom.js`)**不是神圣的引擎核心**——它是会被打进**这个游戏成品**里的呈现代码。改它的映射表(区域配色、音色合成、图元画法)就是在调**这个游戏**的表现,天经地义。真正不碰的只有 `engine-core.js`(类型无关、所有游戏共用的解释器)。

判断不准时:**内容/数值**改 `world.js`,**普通 UI 换皮**改 `index.html` / `--amatlas-*` token,**场景 SVG/声音长什么样**才改 presenter 映射,**新玩法**才动模块。

**改完铁律(无论改哪层;命令均在引擎根目录执行)**:重跑三闸(`node core/tooling/graph-audit.mjs src/world.js` + `node core/tooling/assembly-probe.mjs src/index.html`)→ **重建**(`node pipeline/build/build.mjs src/index.html`)→ 告诉用户重开 `src/dist/index.html`。改了源不重建=用户玩的还是旧版(showcase 实测高频坑);改了平衡后照 `references/review-report-response.md` §资源经济重平衡复核经济、改了剧情/重访后照 `references/revisit-consistency-audit.md` 复核一致性(Claude Code 用户可用 `/balance-check`/`/revisit-check` 便捷跑同款检查)。

## 外壳要精致(别交工程原型)

游戏的 `index.html` CSS **必须**达到精致成品水平,不是裸 `<button>` + 裸文本。从共享 `../ui/amatlas-skins.css` 起步(它兜住 class 命名接缝+精致度地板),但**按题材选一套 `data-ui`、别所有游戏都停在 `amatlas-dark`**,再覆盖 `--amatlas-*` token 做本作专属外观(不同游戏该有不同气质);先读 `references/ui-skins.md`。要完全自定义页面模板时再参考 `references/game-design-guide.md` §5。`present-dom` 产出的 `.line`/`.line-prose`/`.line-event`/`.line-check`/`.line-outcome`、`.choice`/`.move`/`.locked`、`.status-item` 都是 CSS 挂载点(跑团的 `.line-check`/`.line-outcome` 务必分开样式)。

## Hard Constraints（不可违反）

1. **单文件**：所有 CSS+JS 内联，零 CDN/外部链接，离线可玩
2. **存档**：autosave + 3 手动槽 + JSON 导出导入 + 设置持久化
3. **移动端**：普通阅读流可滚动 + safe-area + 48px 最小触摸高度;真全屏玩法壳层才用 100dvh
4. **真实选择**：每个选择(link)必须导向不同节点或带不同的 `run` 状态改变，不允许假选择。**纯动作的 `run` 务必 `return '回应文本'`**(自动显示,与 event.run 对称——不 return 玩家点了看不到任何反应);**可重复的增益动作必须 `once:true` 或 `requires` 门控**(否则无限刷属性,graph-audit 会 P1 提醒)
5. **零死链**：所有 link 的 `to` 目标对应有效节点(`graph-audit.mjs` 会卡)
6. **零占位符**：无 TODO/TBD/FIXME/placeholder/lorem

---

## 工作流：5 阶段

### 阶段 0：调研选题

1. 搜索 Goodreads/豆瓣/IFDB/itch.io 高评价作品
2. 选题标准：
   - 世界观深度足够 3-4 小时游玩
   - 天然适合分支叙事（有多个有意义的分歧点）
   - 纯文字表现力强（不需要图片也能沉浸）
3. 参考 Sam Kabo Ashwell 的分支结构分类，选择 **Branch-and-Bottleneck**
   （Inkle/Choice of Games 验证的最佳模式）
4. 输出选题报告（500 字）：题材、世界观、核心冲突、预估规模

### 阶段 1：设计

> **规模服从用户，不服从本手册默认值。**用户明确给出节点数、字数、结局数或“简陋/最小原型”时，它们是硬上限；不要为了达到下方长篇默认而擅自扩张，也不要额外创建未要求的 `canon.md`。**≤8 节点短原型 fast path**：只读本 SKILL、`AGENTS.md` 与 `examples/text-adventure-demo/` 三个源文件，直接在根 `src/` 完成 1–2 个结局并跑三闸；音频、视觉、叙事专项 references 仅在需求实际涉及时按需读取。

1. **世界观文档**：时间/地点/规则/历史/文化
2. **三幕结构**：Act 1 建立(15%) → Act 2 发展(60%) → Act 3 高潮+结局(25%)
3. **场景节点图**：每 8-12 场景设一个汇流瓶颈点
4. **角色表**：名字、动机、声音特征、与主角关系
5. **物品/属性系统**：flags、inventory items、hidden attributes。**可见物品栏(🎒)**=可选 `inventory` 插件(`engine.use`/`manifest.use` 挂):游戏在 `run` 里 `(S.inventory||(S.inventory=[])).push('id')` 拾取持久物、插件只读渲染 `state.inventory`+可选 `world.items` 显示字典;持久物 vs 迷宫局部临时(`g.*`)分清、隐藏结局道具用 `flag+requires`——完整三步配套与范例见 `examples/text-adventure-demo/`(`world.js` 里 `S.inventory.push(...)` 拾取 + `game.js` status 显示)与 `examples/maze3d/` horror recipe(🎒 富 UI 面板)〔Claude Code 用户亦可用 `/new-game`「物品栏」段〕。**资源经济平衡**(让稀缺资源真有压力:典型路径净额≈0、全做<0,逼玩家取舍;调整初始量/获取/消耗)的设计与算法见 `references/review-report-response.md` §资源经济重平衡。
6. **结局设计**：4-6 个结局，明确达成条件。**从易到难的 `requires` 递进配方**(control 无门槛 → transcend 最高;至少 4 个低门槛可达,别全锁)见 `references/bug-prevention.md` §结局 requires 递进模型。
7. **长篇默认规模（仅用户未指定规模时）**：40-60 场景，60,000-80,000 字，4-6 结局
8. **长篇产出 `canon.md`**（项目根，全程维护；≤8 节点短原型无需创建）：把上面的时间线/世界规则/角色状态+声音速写/物品语义整合进去。模板见 `references/canon-tracking.md`。这是后续防"跑火车"的依据——写作时每 5 场景更新,reviewer 循环交叉核对。

### 阶段 2：引擎(世界模型)+ 表现层(视觉/音频)

0. **先读 `references/world-model-and-process.md`** —— 这是引擎的**底层逻辑**:状态驱动 + 一切基于地图。
   它决定整个结构:**先建地图(地点 + 连接,地图之间用传送相连)→ 再把内容/事件挂在地点上**(内容 = 状态的函数)。
   **不要**用"场景→场景的边 + 在场景里 if 判断来路"的旧节点图思路。
1. **写三个源文件,一律建在根 `src/` 目录**。随包 `examples/*/` 平铺三个源文件只是为了 demo 可直接打开，**它们是只读教材，不是新游戏工位**；做新游戏不得直接修改、审计或重建 example 来代替原创产物。先新建 `src/`，把 `examples/text-adventure-demo/` 的 `world.js` / `game.js` / `index.html` 复制进去，再只改 `src/`（可执行 PowerShell/bash 命令见根 `AGENTS.md`）。核心 / 模块渲染器 / 呈现器都现成,你不手搓引擎；构建产物固定落 `src/dist/`。**别放项目根、也别放 `games/<名>/`**——结束前审计闸只查 `src/`,放别处等于没验:
   - **`src/world.js`** —— 世界数据:`{ id, start, initState?, maps:{ <map>:{ name, nodes:{ <node>:{ kind:'scene', name, look, links, events?, scene?, audio? } } } } }`。线性/对话游戏也用它(退化成一条地图链)。作者**只写数据**。先运行 `node -e "console.log(require('crypto').randomUUID())"` 生成一次 UUID v4 写进顶层 `id`，内容升级不改；复制 demo 做另一款游戏必须换新 UUID（明确属于同一游戏且要共享进度的翻译/发行变体才保留）。**自定义数值/状态(体力等)的初值写顶层 `initState:{ stamina:3, … }`**——被 `run`/`events` 算术读写的字段必须先在此给初值,否则 `undefined - n = NaN` → 数值门控全失效、卡死(契约 §3.1;别和跑团 `sheet.resources` 同名)。
   - **`src/game.js`** —— 组装:一句 `var engine = window.Amatlas.boot(WORLD, manifest)`——boot 按内置 kind(`scene`/`encounter`) **自动拉**文字冒险/跑团模块,自定义 kind 走 `manifest.modules`,同时挂 manifest 声明的呈现器/插件、跑 `start()`、返回 engine。删 manifest 一项 = 关掉那能力。⚠️ boot 不改 index.html(它从 `window.Amatlas` 读各工厂,故 index.html 仍引全部 `<script>` + 一行 `preset/boot.js`)。完整块见本阶段末「game.js 组装」。
   - **`src/index.html`** —— HTML 模板 + 精致 CSS(见「外壳要精致」)+ 按序 `<script src>`;**引擎脚本用 `../` 指上一级**(游戏在 `src/`、引擎在项目根),`world.js`/`game.js` 同目录无前缀:`../core/runtime/engine-core.js` → `../modules/text-adventure/runtime/renderer.js`(跑团再加 `../modules/tabletop/runtime/tabletop.js`)→ `../presenters/present-dom.js`(+svg/audio 可选;用 `audio.music` 时在 present-audio.js **之前**加 `../presenters/compose-music.js`、嵌 MIDI(`music:{midi:...}`)再加 `../presenters/midi-music.js`)→ `../plugins/save.js`(可选)→ `world.js` → **`../preset/boot.js`**(⚠️ game.js 用 A.boot 就必引!漏 = `A.boot is not a function` 白屏)→ `game.js`。⚠️ `examples/text-adventure-demo/` 在 `examples/<名>/` 用 `../../`、你的在 `src/` 用 `../`,**别照抄 demo 层级**。
2. **表现/能力按需叠加**(默认写进 manifest 的 `present`/`save`/`minimap`/`achievements`;底层 `engine.use(...)` 只作手写 escape hatch,见 `examples/horror-demo` / `references/plugin-development.md`。意图非素材:世界数据只声明 `scene:{region,mood,elements}` / `audio:{bgm,sfx}`,呈现器决定怎么画 / 怎么响):
   - **SVG 场景图** → manifest 默认会挂 `presenters/present-svg.js`;要关就写 `present:{ svg:false }`,要调某 region 配色就改 presenter 映射表。
   - **音频氛围** → manifest 默认会挂 `presenters/present-audio.js`;要关就写 `present:{ audio:false }`,要换曲/环境声在 world 的 `audio` 意图里写。
   - **存档 / 小地图 / 成就** → manifest 写 `save:true` / `minimap:{ mode:'toggle', layout:'spatial' }` / `achievements:[...]`;boot 会挂 `plugins/save.js` / `minimap.js` / `achievement.js` 到对应插槽。
3. **构建 + 验证**:`node pipeline/build/build.mjs src/index.html`(过准入门:死链/schema → 单 HTML);`node core/tooling/graph-audit.mjs src/world.js` 查图结构(并留意 P1「死 flag」=被读却从不写的 flag、逻辑死锁);`node -c src/world.js` 查 JS 语法。**结束前 Stop hook 自动跑 graph-audit + 零依赖装配探针(`assembly-probe.mjs`,把游戏装配着跑到 `view()`)**:装配崩(API 接不上 / 加载即崩,如 `createEngine` 调不到)会被**硬拦、必须修**;空渲染只警告(可能是有意开场)。视觉/交互/出声仍需 `--smoke`(jsdom)或真浏览器。
   **不要复制旧的单文件模板、不要从空白手搓引擎**——只写 world.js + game.js + index.html。

**game.js 组装**:权威 game.js 组装模板 = `examples/text-adventure-demo/game.js`(随包真实文件,逐字抄再按需改 `status`、`sheet`、`achievements`、`present`、`modules` 等 manifest 项;Claude Code 用户也可用 `/new-game` 生成同款)。这里不复制整段,避免两处模板漂移。正常游戏的存档 namespace 由 `WORLD.id` 派生，不在 manifest 重复写 `saveKey`；后者只留给嵌入/人工迁移。

**`index.html` 的 `<body>` 骨架照抄 `examples/text-adventure-demo/index.html`**(别自创;**连同文件头 `<!doctype html>`+`<meta charset="utf-8">`+`<meta name="viewport"…>` 一起抄——少 charset=中文乱码,少 viewport=手机按 980px 桌面宽缩放**):`#app` 里**顶部先放 `#plugin-bar`(工具栏;放最底容易被布局推出屏,round8 实测)**,再依次 `#mapname #place #scene #look #choices #status`,`#app` 外放 `#plugin-minimap` + `#plugin-overlay`。**重开走 `manifest.reset:true` + `plugins/reset.js`,按钮会自动进 `#plugin-bar`,不要再手写 `<button id="reset">`。**这些 id 是呈现器/插件的挂载点——挂了哪个能力就保留对应 id;删了 id,功能静默消失(引擎找不到挂载点不报错、只 no-op)。状态条用 `#status`+模块 `status` 选项,别自己 `setInterval` 轮询 `_engine.state`。**

### 阶段 3：内容填充

1. **读取** `references/writing-quality.md` 确保写作质量
2. **分批写作 + 变频 reviewer**（中段塌陷协议,见 `references/consistency-guardrails.md`）：场景 1-15 每 15 场景一轮、**16-40 每 10 场景(中段是 ConStory 实测的错误高发区,加密)**、41+ 每 15 场景。每轮做一轮独立的一致性复审(检查项见 `references/consistency-guardrails.md`;Claude Code 用户可调 `narrative-reviewer` 子代理隔离 context,其他工具手动过一遍)。
3. **每 5 场景更新 `canon.md`**（新确立的时间/角色/世界事实追加进去）。
4. **条件内容**：首次/重访、按 flag 变化都写在节点的 `look` 里——`{ first, return }` 或函数 `(S, first) => …`。**不用 `{{if:flags}}` 标记**(模块化呈现器不解析,会把 `{{…}}` 原样显示给玩家)。
5. **视觉/听觉意图**：给节点加 `scene:{ region, mood, elements? }` 和 `audio:{ bgm|music, ambient?, sfx? }`;SVG/音频呈现器据此生成,**世界数据里不写 SVG 路径/音频 buffer**。挂呈现器则有画/声,不挂则优雅退化为纯文字。
   - **音乐/环境音(推荐默认 `music`+`ambient` 双层并行;`bgm`=最简后备)**:`audio.music`(程序作曲配乐,旋律/和声/鼓,比单音色 `bgm` 丰富:**预设 22 个〔气质 calm/tense/eerie/heroic/sad/sacral/desolate… + 曲风 synthwave/jazz-noir/march/chase/romance/scherzo/stealth/elegy/baroque…,全 22 逐字抄见 audio-system.md〕**,或 `{preset:基底,…微调}` 或 MusicSpec 对象(MusicSpec 可选 `timbre:{pad,lead,arp}` 换音色板;**有现成 .mid / 要复杂编曲 → 第三形态 `{midi:'<base64>',loop?,gain?}`**,base64 一行嵌 world.js、零依赖解析,须引 `presenters/midi-music.js`——嵌法与守则见 `references/audio-system.md`))+ `audio.ambient`(环境声景,**与音乐并行同响**:预设名 `waves`/`wind`/`rain`/`storm`/`forest`/`cave`… 共 15 个 或 AmbientSpec)。**⚠️ 按"这一幕在演什么"选乐、别整局只在一两个 mood 里打转**(showcase 实测:只用 tense/sad → 全程气质单一);**选乐速查表、微调样例、Spec、build 注意见 `references/audio-system.md`**。
   - **焦点物件具体化**:`character` **默认已画剪影人影**(figure;`art:'robed'/'guard'…` 换造型),item/hazard 默认抽象方块/三角;给 element 加 `art` 可画**具体物件**——`art:'<预设名>'`(**20 个内置**:物件 14〔ship/altar/chest/sword/fire/crystal/key…〕+ 剪影人物/生物 6〔figure/robed/hooded/guard/beast/crowned〕)或 `art:[{shape,…}]`(art-spec DSL,本地居中坐标画自定义焦点物件)。**清单、DSL、范例、何时用见 `references/visual-system.md`「物件具体化」**(背景仍由呈现器画,art 只画焦点物件)。
6. **大型游戏**：`world.js` 按地图/章节拆多文件再构建前合并,或直接在 `maps` 里加节点;别把内容塞进引擎或呈现器代码。**单个 map 控制在 ~30 节点内**——超了就按章节/区域拆成多个 `maps`(引擎原生支持,小地图只渲染当前图;51 节点塞一图=地图必然拥挤,graph-audit 会 P2 提示)。

### 阶段 4：审计 + 打磨

1. 运行 `node core/tooling/graph-audit.mjs src/world.js` → 图结构审计(死链/可达/死胡同;P0 退出码非零,先修)+「**无保底出口**」(节点所有出口都带条件)默认 **P0 硬拦**(与结构断裂同性质、退出码非零必先修;该节点某出口显式标 `lockHint`〔有意单程/未完成〕才降 P1)+ P1 逻辑死锁:「**死 flag**」(被读却从不写)——soft-lock、人工极难测,确认非有意后修。构建期 `pipeline/build/build.mjs` 的准入门也会再卡一道(死链/schema,fail-closed)。
2. **装配 + 运行时测试**：必跑零依赖 `node core/tooling/assembly-probe.mjs src/index.html`，再跑 `node pipeline/build/build.mjs src/index.html`；已安装 jsdom 时可选追加 `--smoke`，用 `core/tooling/smoke-harness.mjs` 查加载崩溃/运行时报错。未安装要在报告明确写“jsdom smoke 已跳过”，不能把缺可选依赖说成游戏失败；文字冒险特有的“首次显示重访文字、点选项不切换”等以**真浏览器实玩**为终判。**“能跑就跑”的操作化。**
3. 读取 `references/bug-prevention.md` → 逐项验证规则(含运行时顺序 bug 一节)
4. 读取 `references/audit-checklist.md` → 最终确认
5. **叙事路径审计**（必须做）→ 读取 `references/narrative-path-audit.md`
   构建场景图，BFS 遍历，检查所有关键场景是否有前置 requires 保护
6. **Canon + 路径前提 + 角色连续性**（必须做）→ `references/consistency-guardrails.md` 第八、九节：多入口场景正文是否假设特定来路？角色名一致？NPC 无铺垫出场？路径分叉后角色状态用条件文本分流？
7. **中文文本精读**（必须做）→ 逐段手工审读，不用脚本/正则
   用户明确要求："一行行检查，不允许使用工具"
   grep/sed 只用于验证修复结果，不用于发现语义问题
8. **修复优先级**：P0 死链/语法/运行时崩溃 → P1 路径断层/命名过早 → P2 音频/布局/存档/路径前提 → P3 文案 → P4 视觉
9. 最终仍需**真浏览器实玩**（jsdom 烟雾只查 JS 逻辑层，CSS/音视频/移动端手感需真浏览器**双击 `file://` 实测**；要自动化真浏览器测试可选装 webapp-testing skill，见 README『可选扩展』）
10. **完成后 · 固化经验(可选但推荐)**:如果这次做游戏中形成了**值得复用**的风格 / 设计模式 / 叙事约定 / 工作流偏好,现在是把它固化成一个 skill 的好时机——下次 Claude Code 会自动发现并加载,经验越用越顺。见 `references/creating-skills.md`。

---

## Reviewer 循环（强制）

**变频**（中段塌陷协议）：场景 1-15 每 15 场景、**16-40 每 10 场景(加密)**、41+ 每 15 场景。每轮做一轮独立复审——Claude Code 用户可调 `narrative-reviewer` 子代理（隔离 context），其他工具手动过一遍。

完整检查项见 `references/consistency-guardrails.md`（一致性五维 / 反同质化 / 分支收束 / 逐场景量化）+ `references/writing-quality.md`（OVER-EXPLAIN / slop / 句子级 STRONG-WEAK-CUT 评级）〔Claude Code 用户另有 `.claude/agents/narrative-reviewer.md` 汇总同款清单〕,核心是：
1. **Canon 交叉核对**（ConStory 五维：角色/事实/风格/时间线/世界设定）
2. **反同质化**（摩擦配额：每批至少 1 NPC 有摩擦；声音漂移检测）
3. **OVER-EXPLAIN**（AI 小说第一病,占删减 ~32%）+ 句子级 STRONG/FINE/WEAK/CUT 评级（看分布）
4. **REDUNDANT / 结构反模式 / slop 词扫描**
5. **量化**（字数/选项/感官趋势）+ **被遗弃线索** + **分支收束**

发现问题 → 直接修复 → 不问用户 → 继续。

---

### 结构性审计误判验证（关键）

当**外部报告 / 玩家测试 / AI 审查**声称"致命结构性 bug"（flag 未设置、结局锁死、选项指向错）时，
**必须先验证再修复**：条件出现的选项靠 link 的 `requires` 函数和模块 `actions()` 动态生成，
外部审计若只扫 `links[].to` 字面量会漏掉它们。
> ⚠️ **但"节点不可达"是例外、不在此列**：`graph-audit` 的可达性把**所有** `.to` 边都算进图（带 `requires` 的也算可达），所以它报"不可达" = 真的没有任何 `.to` 边（无论条件与否）指向该节点；且当前模块的 `actions()` 只转 `world.js` 里写的 `links`、不凭空产出指向新节点的移动（移动只经 `exits/links.to` **与检定的 `checks[].success.to / fail.to`〔v12,均计入图〕**）。**故 graph-audit 报的不可达/结构断裂是确定的、不是误判** —— 尤其"结构断裂"（大比例孤儿)是 **P0、退出码非零、必先修**（补上漏接的边），别当审计误判放过。

**三种常见误判：**

| 误判类型 | 报告说法 | 实际数据 | 验证方法 |
|---------|---------|---------|---------|
| 孤儿节点 | "无入口，9000字死内容" | **(通常不是误判)** graph-audit 已把带 `requires` 的 `.to` 也算可达；它报"不可达"即真无入口。当前模块 `actions()` 不产动态移动入口 | 直接补一条 `link/exit.to` 指向它（理想带门控）；别当误判放过 —— 尤其"结构断裂"P0 必修 |
| Flag 未设置 | "flag 从未被设置" | 节点 `events[].run` 进入时设 `S.flags.x` | `node core/tooling/graph-audit.mjs world.js` + 读该节点 `events` 的 `run` 体 |
| 结局不可达 | "确认选项指向错误节点" | link 的 `requires` 满足后才出现，或有 fallback 链接 | 读该 link 的 `requires`/`run`，确认条件分支 |

> 详细误判模式表、4-bug 实测案例与逐条 grep 验证模板见 `references/bug-prevention.md`「结构性审计报告误判」+ `references/structural-bug-validation.md`。

**原则：永远不要在没有验证的情况下接受"这个节点不可达"的结论；但 graph-audit 报的结构断裂/不可达是确定的,别反过来当误判放过(showcase round1-9 头号误区)。**

## 常见陷阱(承重短规则;完整分层规则见 references/bug-prevention.md,craft 例子见 narrative-consistency.md / review-report-response.md / chinese-text-audit.md / progressive-reveal.md)

下面 9 条是**作者每次都要守的承重短规则**;违约多数有自动闸(graph-audit / assembly-probe / static-lint / 引擎抛错,接 Stop hook)会报,但写之前先记住:

1. **真实选择,零假选择**:每个非移动选项必有 `run:(S)=>{…}`(哪怕 `S.understanding=(S.understanding||0)+1`);同节点 ≥2 个无 run/requires 纯移动指向同一 `to` = 假选择。
2. **零死链 / 零占位符**:`links[].to` 不指向不存在节点;不留 `{{}}` 标记(呈现器不解析,会原样显示)、TODO、乱码 `�`。条件叙事写进 `look:(S,first)=>…` 或 `look:{first,return}`,**不用 `{{}}`**。
3. **每节点有无保底出口**:至少 1 个无条件**且非 `once`** 的出口;全 requires 或唯一无条件出口是一次性 → softlock(graph-audit 默认 P0 硬拦)。**例外:结局/终局节点 `links:[]`(零出边)合法**——graph-audit 只报 P2「死胡同」(有意结局可忽略)、非 P0。
4. **命名接缝逐字匹配**:CSS class / 元素 id / flag 名 / kind↔module / 资源名 / 技能名,作者写的名必须和引擎期望**逐字一致**——不匹配即静默失效(见 design-principles §9)。
5. **initState 数值字段别和 sheet.resources 同名**:同名两个值会互相覆盖、门控读错值恒 false。
6. **混合游戏用 `api.dice` + `kind:'encounter'`,别自创 check 格式**:别裸 `Math.random`,别写 `check/on_success/modifiers` 等自创字段(引擎不认,encounter 被误判不可达)。
7. **reset 带 confirm**:自动档误点一次即被覆盖、无法挽回。
8. **用 `A.boot` 必在 index.html 引 `preset/boot.js`**:漏引 → `A.boot is not a function` 崩白屏。
9. **中文文本清理是独立步骤**:`一种一种`→`一种`、`了了`→`了`(初始生成就有,非编辑引入;`sed` 批量清在 world.js 源)。

→ **完整分层规则 + 修复模板 + 例子见 `references/bug-prevention.md`**(死链/死flag/softlock/假选择/存档/重访一致性/结构性审计误判等);叙事 craft 例子分散在 `narrative-consistency.md`(误导选项/结局回顾/Hub首访/四种不一致模式)、`review-report-response.md`(假选择差异化/资源经济重平衡)、`chinese-text-audit.md`(中文语法12型/"一种"过度)、`progressive-reveal.md`(text-shake/渐进揭示)。

## 视觉 CSS 技巧

纸张质感 / 墨水扩散 hover / 内心声音(`.line-inner` 整行语义 class,非句中 span)等零依赖视觉增强配方 → 详见 `references/visual-css-techniques.md`。正文挂载点是 `#look`、选项是 `.choice`/`.choice.locked`(别写 `.choice-btn` 等不存在的类名,样式会静默失效)。

## Anti-Slop Edit Residue

**Anti-slop 编辑最常见 bug = 句子重复(新版写了、旧版没删)+ Edit 工具默认只替换首个匹配。** 改完务必 `grep -n` 验证行号正确,多处相同文案用 `replace_all` 或加长上下文唯一定位;相似角色名(赛琳 vs 赛琳娜)先辨同异再决定是否全局替换。残留模式表/检测脚本/修复模板/角色名一致性 → 见 `references/writing-quality.md` § Anti-Slop Edit Residue。语法验证:`node -c world.js && node -c game.js`(构建产物运行时问题用 `node pipeline/build/build.mjs src/index.html --smoke`)。

## 全文审计(阶段 4)

交付前的验证清单(怎么验、过没过、跑哪个闸)→ 详见 `references/audit-checklist.md`。要点:结构类(死链/孤儿/可达/死 flag/softlock/假选择)跑 `node core/tooling/graph-audit.mjs world.js`(P0 退出码非零必先修)、装配/挂载点/CSS 接缝跑 `assembly-probe.mjs`、残留 TODO/乱码/`{{` 跑 `static-lint.mjs`,构建+运行时探针跑 `build.mjs src/index.html --smoke`;内容类(首访/重访、NPC 命名、结局基调、高潮后路由)按清单人工复核。

## 本地化 / 翻译

中↔英翻译是 5 阶段之外的独立工作流。模块化下翻译对象是 **`world.js` 数据**(`name`/`look`/`links[].label`/`lockHint`/`events[].run` 文案),直接 `require` 遍历改字段、不爬源码;`to`/`requires`/`run` 里的标识符**绝不翻译**(译掉图就断),译后必重跑 `graph-audit.mjs` 验结构。完整流水线代码 + 陷阱 → `references/translation-workflow.md`。

## 叙事一致性审查（阶段 3 必做）

分支叙事最大坑：按"最完整路线"写——假设玩家去过每地/拿过每物/见过每 NPC。Hub 场景（入度 >5）开头只写"你在哪、你看到什么"，绝不引用"你之前做过什么"；可选经历一律用 `look:(S)=>` 按 `S.flags` 分流，不留无条件输出。每场景前 2 句必答"我在哪 / 谁在场"。结局插 2-3 句 flag 条件回顾。
→ 四模式速查与修复模板、NPC 过渡铁律、空间跳跃过渡范例、路径走查协议、全文条件审计（观察性 vs 经历性框架 + 必经路径豁免）、物品路径分析、结局回顾写法与插入位置，全见 `references/narrative-consistency.md`；中段塌陷/五维检查表/反同质化/分支收束/Flag 命名/路径前提案例 见 `references/consistency-guardrails.md`。

---

## Reference 文件索引

| 文件 | 内容 | 何时读取 |
|------|------|----------|
| `references/visual-system.md` | **作者视觉词汇核心**:region 13/mood 色调+演出效果触发词(光柱/天气/雾/调色/扭曲)/elements kind+三铁律/art(预设\|art-spec)/transition | 阶段 2 构建视觉时 |
| `references/visual-advanced.md` | 呈现器内部/扩 present-svg 加新效果/5 层构图配方/粒子插件/文字动画 CSS/戏剧模式/渐进式揭示/数据流 | 想超越预设、做深度视觉时(可选·按需) |
| `references/audio-system.md` | **作者音频词汇+创新框架:music 22 预设/职责分层/bass support-vs-melodic/六个正交创作轴/发展与留白/timbre+MIDI / ambient 15 声景 / v15 继承** | 阶段 2-3 配乐/声景时 |
| `references/audio-advanced.md` | 呈现器合成内部/MIDI 解析/编曲/合成踩坑速查/信号流图 | 想超越预设、做深度音频时(可选·按需) |
| `references/writing-quality.md` | Anti-slop/anti-pattern/reviewer/编辑残留 | 阶段 3 写内容时 |
| `references/bug-prevention.md` | bug 预防规则(分层标注:【闸】自动检查 / 【人工】需人读) | 阶段 4 审计时 |
| `references/audit-checklist.md` | 审计清单 + Node 脚本 | 阶段 4 审计时 |
| `references/narrative-consistency.md` | 条件审计/Hub场景首次重访/NPC过渡/结局回顾/四种不一致模式 | 阶段 3+4 叙事审查时 |
| `references/canon-tracking.md` | canon.md 模板 + 交叉核对 + 角色声音一致性 + 分支状态追踪 | 阶段 1 建立、全程维护 |
| `references/story-adaptation.md` | **改编工作流**:自带大纲/成文故事→互动游戏(忠实度三档/Ashwell 结构选型/选择点五类/delayed branching/正典线验收) | 用户自带故事素材时(替换阶段 1-2 开头) |
| `references/consistency-guardrails.md` | 9 类失败模式+对策(ConStory五维/中段塌陷/反同质化/信息经济/路径前提/角色连续性) | 阶段 3 写作 + reviewer 循环 |
| `references/revisit-consistency-audit.md` | Hub场景in-degree审计方法论/visited flag陷阱/时间描写规则 | 阶段 3+4 重访一致性审查时 |
| `references/translation-workflow.md` | 翻译流水线代码+陷阱 | 本地化时 |
| `references/audio-advanced.md` | Brown/Pink noise + FM 合成 + 互质LFO + 天气/cave/ending/BGS 信号链配方 | 阶段 2 音频升级时 |
| `references/progressive-reveal.md` | 渐进揭示设计 + text-shake 修复 | 阶段 2/3 视听设计时 |
| `references/visual-css-techniques.md` | 纸张质感 + 墨水扩散 + 内心声音 `.line-inner` | 阶段 2/3 视觉增强时 |
| `references/chinese-text-audit.md` | 中文叙事文本 12 种错误模式 + 审计检查清单 | 阶段 3+4 中文内容审计时 |
| `references/narrative-path-audit.md` | 叙事路径审计方法论：场景图+BFS+requires 修复 | 阶段 4 路径审计时 |
| `references/review-report-response.md` | 通关测评报告响应方法论：验证→优先级→批量替换→基调审查→时间线 + 假选择差异化 + 资源经济重平衡 | 阶段 4 收到测评报告时 |
| `references/review-report-response-addendum.md` | 用户行为模式：逐项追踪、精确指令、echo_chamber 年份对齐 | 收到用户追问时 |
| `references/multi-phase-audit.md` | 多阶段叙事路径审计方法论：阶段划分、检查清单、常见发现模式 | 大型游戏 QA 审计时 |
| `references/structural-bug-validation.md` | 结构性 bug 误判验证方法论（4 种误判 + grep 模板） | 收到审计报告声称"致命 bug"时 |
| `examples/text-adventure-demo/`(world.js · game.js · index.html) | **模块化文字冒险范例**——照抄起步 | 阶段 2 起点 |
| `examples/tabletop-demo/` | 跑团 / 检定 boot 范例(角色卡、骰子、资源、scene/audio 原生产出) | 做跑团/检定时 |
| `examples/horror-demo/` | presenter 演出压测 + 手写 `createEngine + engine.use` escape hatch 对照 | 学底层手写装配时;不作为新游戏默认起点 |
| `examples/maze3d/`(统一入口 + `references/maze3d-authoring.md` 作者手册 + `gallery.html` 选材 + `audio-gallery.html` 试听) | maze3d 自定义 runtime 的 basic / horror / puzzle / layers recipes(同一 `raycast-maze.js`,非公共模块);手册说明 grid 字段、局部态 vs Amatlas state、Gallery 边界 | 做第一人称迷宫 / 怪物追逐恐怖时 |
| `core/tooling/graph-audit.mjs` | 图结构审计(死链/可达/死胡同,P0 退出码非零) | 阶段 4 + 构建期 |
| `pipeline/build/build.mjs` | 零依赖构建器:内联成单 HTML + 硬准入门 + 可选 `--smoke` | 阶段 2 构建 / 阶段 4 |
| `references/puzzles-and-minigames.md` | 谜题(组合锁/序列/检定=节点图写法)+ 实时 arcade(自定义模块,照抄 `examples/arcade-demo`) | 做谜题 / 小游戏关卡时 |
| `references/plugin-development.md` | 新模块 / 呈现器 / 能力插件(复制 `modules/minimal` 起步) | 扩展引擎玩法/表现时 |
| `references/creating-skills.md` | 把可复用经验固化成 skill | 完成后(可选) |

---

## 地图视觉

地图由 minimap 插件(`A.MinimapPlugin.createMinimapPlugin`)程序化渲染,**作者不手写 SVG**;字号/配色/标签/探索雾/锁定连线全靠 CSS 换皮(`.amatlas-minimap`/`text.amatlas-node-label`/`[data-node]`/`[data-current]`/`[data-seen]`/`line[data-locked]` 钩子)。素基底 + 双视图(玩家 spatial / 调试 ring)+ 三套换皮主题(羊皮纸/暗黑霓虹/极简)+ 方块房间(`glyph:'box'`)→ 详见 `references/player-map.md`。
