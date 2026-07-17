# Bug Prevention Checklist

> Extracted from 52 numbered rules in SKILL.md. 每条保留 **为什么 + 怎么写**;**确定性检测已沉淀进自动闸**(`graph-audit` / `assembly-probe` / `static-lint` / 引擎抛错,接 Stop hook),违约即报、无需手动 grep。本清单不再罗列大段 grep/comm —— 标 **闸** 的项指向对应工具(它会自动报,你只要看懂为什么+怎么写对),标 **人工** 的项是工具判不了、需读码/实跑的。依据见 `docs/design-principles.md` §10(A 类自动检查 vs B 类指引文本)。
>
> **模块化形态**:游戏 = `world.js`(数据)+ `game.js`(组装)+ `index.html`(模板),经 `node pipeline/build/build.mjs` 构建成单 HTML。核心/模块/呈现器都现成(参考 `examples/text-adventure-demo/`)。下面的检查多数针对 `world.js`(数据层 bug)或构建产物 `dist/<game>.html`(集成层 bug)。**核心 `engine-core.js` 的执行顺序、存档、过滤、`_once` 去重等是引擎职责,作者不重写**——许多旧版要手写的守卫,模块化里是核心保证的不变量,本清单据此重写。

---

## 1. Syntax & Engine

- **模板字符串里中文对白用 「」 不用引号(Rule 1)**:JS 模板字符串里嵌 `"`/弯引号会破坏语法。`node -c world.js` 查语法;`grep -n '`[^`]*"' world.js` 辅助定位。
- **条件叙事写在 `look` 里、不用 `{{}}` 标记(Rules 31/49)**:`look` 是普通 JS——`{first:'…', return:'…'}`(首次/重访由引擎访问计数自动判定,无需手写 visited flag)或 `look:(S,first)=>…`(任意 if/else/三元/嵌套,可读 flags/属性/clock,想怎么分支都行)。**模块化呈现器不解析 `{{if}}`/`{{else}}`/`{{endif}}`**——写了会原样显示给玩家。**闸**:`static-lint.mjs`(接 Stop hook)扫 world.js 的 `{{` → P1;构建期 schema-shape 同样不解析。
- **设 flag 用 `run:(S)=>{ S.flags.x=… }`(Rule 29G)**:link/event 的 `run` 函数体里直接改状态;不用旧的 `flags_set`/`effects:{flags:{…}}` 声明式对象(那种写错字段名整个静默不生效)。函数体里写错就是普通 JS 错,没有「看起来像但其实无效」的伪字段。

---

## 2. Save System

- **存档是核心职责,作者不手写格式/解析/迁移(Rules 37/39/44)**:`engine.exportCode()`/`importCode()` 把整个 `state`(`pos/clock/rngSeed/seen/flags/_once` + 模块组件 + 账本)序列化成 base64,存档插件参考 `plugins/save.js`。**作者不重写**,也就没有旧格式「忘取 `.state`」「`save` vs `parsed` 变量名不一致」「手写 `migrateSave` 迁移」这类经典 bug。防刷用核心 `once:true`(§7),`_once`/`_eventsDone` 账本随档自动序列化、读老档缺字段核心兜底。
- **Check**:`grep -n 'JSON.parse\|continueGameWithPreview\|migrateSave\|sceneEffectsApplied' world.js game.js` 应为 0(都走核心存档)。

---

## 3. Audio

> **模块化形态**:音频是**意图**,不是手写 Web Audio。节点声明 `audio: { bgm, sfx:[…] }`(名,不是音频数据),`presenters/present-audio.js` 据此合成。**改音色 = 改 presenter,不改 world**;world 作者只声明意图。合成细节(几层、什么噪声、什么滤波)是呈现器的实现智慧——**全部生产验证过的配方与避坑已逐条收进 `references/audio-system.md`(可选·按需读)+ `audio-advanced.md`**,本节只留作者侧要点 + 指针,不再重复。

### ✅ 作者侧只需三条(world.js 的 audio 意图)
- **① 配乐层用 `audio.music`(22 预设/MusicSpec/`{midi}`,`bgm` 是最简后备)+ 声景层用 `audio.ambient`(13 预设/AmbientSpec)**——**两层并行同响是有意设计**,「下雨的海岸」= `music:'…'`+`ambient:'rain'`(或 AmbientSpec 拼 雨+浪)。
- **② 同一层内一个节点只声明一个名**(同层不叠两套;music/bgm 走 crossfade、同名不重启,名相同则所有场景听起来一样)。
- **③ 一次性音效走 `audio.sfx:[名]`,别混进持续层**——sfx 是 fire-and-forget,呈现器分开追踪(混了会被 crossfade 误杀)。词汇表见 audio-system.md。

### ✅ 合成配方与避坑(呈现器侧 · 可选·按需)
怎么合成 / 淡变 / 压限全是 `presenters/present-audio.js` 的事,**改音色 = 改 presenter,不改 world**。**只在扩展或审计 present-audio.js 时**才需要这些——全部生产验证过的 DSP 配方与避坑逐条收在 **`references/audio-system.md`(可选·按需)** + `audio-advanced.md`,含:7 层暴风(rain mid/high、wind、rumble、thunder crack/rumble/sub)、**beach 用 pink 非 brown noise**(brown 太多低频像雷暴)、**cave 水滴 600–1000Hz**(1200-2000Hz 像浴室)、forest 鸟鸣、village 4 层篝火、heart FM 合成、ending HPF、**crossfade 无条件清理(无 fadeId 机制)**、所有音频经 `_compressor` 防爆音、AudioContext 须在用户手势里 `resume()`。world 作者无需读这些;只声明 bgm/sfx 意图即可,缺哪个名呈现器优雅退化。

---

## 4. Visual

> **模块化形态**:视觉是**意图**,不是手写 SVG。节点声明 `scene: { region, mood, elements:[{kind,ref,state}] }`,`presenters/present-svg.js` 据 region/mood/elements 画。**改某 region 配色 = 改 presenter 映射表(如 `REGION_BG`),world 数据里不写 SVG**。作者视觉**词汇**(region/mood/elements/art/transition)见 **`references/visual-system.md`**;深层视觉**方法论**(5 层构图、各分区构图要点、粒子调性、文字动画 CSS、过场手感、戏剧模式)已逐条收进 **`references/visual-advanced.md`(可选·按需)**(渐进揭示见 `progressive-reveal.md`、外壳 CSS 见 `visual-css-techniques.md`),本节不重复。下面只留**针对 index.html/game.js 外壳 CSS 的构建产物检查**(作者确实会改的那层)。

### ✅ CSS selector must match HTML element ID (Rule 27)
- **Problem:** CSS `#vignette-overlay` 但 HTML `id="vignette"` → 效果完全失效(命名接缝,见 design-principles §9)。
- **闸**:`assembly-probe.mjs` 查 DomPresenter 标准挂载点(`#look`/`#choices`/`#status`/`#plugin-minimap`…)齐全 + CSS class 近似误写(`.choice-btn`↔`.choice` 等);泛化的「每个 CSS `#id` 都有对应元素」仍可 `diff` 两份 id 清单人工核。

### ✅ transition: all → specific properties (Rule 9)
- **Problem:** `transition: all` 每次属性变都触发 layout recalc。性能杀手。
- **Fix:** `transition: opacity 0.3s, transform 0.3s`(仅指定属性)。针对 `index.html` 与 game.js 壳层 CSS。
- **查**:index.html/外壳 CSS 无 `transition: all`(只列具体属性)。

### ✅ 全屏固定壳层别锁死移动端视口(Rules 3, 10)
- **Problem:** 手写 `height:100vh` + `body{overflow:hidden}` 会在 iOS/移动浏览器把底部内容或 `#plugin-bar` 推到视口外。
- **Fix:** 普通阅读流用共享 `amatlas-skins.css` 的 `#app{min-height:100vh}` 并允许页面滚动;真全屏玩法壳层才用 `100dvh`,且要确保工具栏/退出控件仍可见。
- **查**:重点查 `height:100vh`/`overflow:hidden`,不要把共享阅读框里的 `min-height:100vh` 当错误。

### ✅ Mobile: 375px 保持功能可达,不要靠隐藏按钮省空间(Rule 38)
- **Problem:** 旧式 600px/375px 断点会隐藏地图/成就/存档等低频按钮,并把按钮缩到 36px/32px;这会让触屏玩家找不到功能或难以点中。
- **Fix:** 用共享 `amatlas-skins.css` 的可换行 `#plugin-bar` 与插件面板;窄屏下允许换行/滚动,但存档/地图/成就/重开按钮仍可见可点,触屏命中高度 ≥44px(推荐 48px)。
- **查**:375px 宽下无横向滚动,正文/选项不被挤压,插件按钮不隐藏、不缩成 32px 小图标。

### ✅ Progressive reveal: 早期场景克制效果(Rule 19)
- **Problem:** 所有效果从一开始全开 → 玩家永远注意不到新元素出现。
- **Fix:** 渐进揭示靠节点意图逐步加码:早期 `scene` 朴素(少 `elements`、`calm` mood),后期渐强(多 `elements`、`tense`/`dread` mood);揭示节奏由数据顺序表达,**不需要**旧格式 `EARLY_SCENES`/`MID_SCENES` 这类 Set 硬门控(模块化没有 `loadScene` 可门控)。
- **配方**:分阶段策略表(背景/elements/粒子/音量/文字/过场按早中后期递增)详见 `references/visual-advanced.md`「渐进式揭示」节(可选·按需)。

### ✅ prefers-reduced-motion disables animations (CSS audit)
- **查**:index.html 与 `present-svg.js` 都有 `@media (prefers-reduced-motion)` 关闭动画(含 present-svg 的 SMIL `<animate>`)。

### ✅ Touch targets >= 44px (Hard Constraint 3)
- **查**:所有可交互元素高 ≥ 44px(移动端最小 36px,推荐 48px)。

### ✅ SVG filter ID matches CSS reference (Rule 18)
- **模块化:** SVG 由 `present-svg.js` 程序化生成,filter 定义/引用都在呈现器内(作者不写);扩展 present-svg 时 filter `id` ↔ `url(#id)` 引用要对上。SVG 构图/扩呈现器配方见 `references/visual-advanced.md`(可选·按需)。仅当 index.html 模板手写了 SVG filter 才需人工核 id 匹配。

---

## 5. Narrative

> **形态说明**:叙事检查针对 `world.js` 的节点内容(`look` 文本、`links` 结构、`events`)。链接字段是 `link.to`(移动目标),不是旧格式的 `next`。

### ✅ 剧情 link 可直接消耗资源——不必非走检定(§4.3 run)
- **常见误解**:以为「扣资源 = 只能用 tabletop `checks.cost`」→ 把「花香火换记忆」做成了免费动作。
- **事实**:`link.run(S)` 拿到整个 state,`S.sheet.resources.X -= n` 直接生效——`state` 是唯一真相,模块间经 state 共享是契约允许的,不破坏模块隔离。
- **写法**:
  ```js
  { label: '燃香(消耗 1 香火)',
    requires: (S) => (S.sheet && S.sheet.resources ? S.sheet.resources.incense : 0) >= 1,
    lockHint: '香火不足', showWhenLocked: true,
    run: (S) => { S.sheet.resources.incense -= 1; S.flags.memorySeen = true; },
    to: 'memory_node' }
  ```
- **前提**:`S.sheet` 只在游戏挂了 tabletop 模块时才存在——**纯文字冒险**(没 tabletop)里 `S.sheet` 是 `undefined`,上面 run 里写 `S.sheet.resources` 会抛。所以:**纯文字冒险**把资源放 `world.initState` + `run:(S)=>{ S.incense -= 1; }`(顶层 `S.X`);**跑团/混合**才用 `S.sheet.resources`(且像上面 requires 那样先判 `S.sheet && S.sheet.resources`)。别两套同名(§3.1 警告)。

### ✅ Don't reference NPCs before they're introduced (Rules 30, 33)
- **Problem:** 第一夜的场景引用「卡伊说」,但卡伊在村庄才登场。
- **Fix:** 从开局 BFS;检查每个 NPC 提及的节点只在其登场节点之后可达。
- **Check:**
  ```bash
  # 找每个 NPC 名,定位首次登场节点,再查所有更早可达的节点
  grep -n '卡伊\|科尔\|赛琳\|雷纳' world.js | head -30
  # Manual: 验证每处提及的节点只在 NPC 登场节点之后可达
  ```

### ✅ Hub 节点需首次/重访分支文本(Rules 45, 48)
- **Problem:** Hub 节点(5+ 入边或多 `link.to` 出口)只有单块文本 = 「重访破坏沉浸」。
- **Fix:** 在该节点 `look` 里写首次/重访分支:`look: { first: '首次抵达措辞', return: '重访措辞' }`(或函数式据 `first`)。首次/重访由引擎访问计数自动判定,无需手写 visited flag。
- **Check:**
  ```bash
  # 找 hub 节点(高入度):统计 link.to 指向次数
  grep -oP 'to:\s*["\x27`]?\K\w+' world.js | sort | uniq -c | sort -rn | head
  # 对高入度节点:确认 look 是 {first,return} 或函数式分支,而非单块字符串
  grep -n -A 3 'look:' world.js | head -40
  ```

### ✅ 时间描述只放首次分支(Rules 45, 50)
- **Problem:** 「日落」「走了两小时」出现在重访 = 时间穿越。
- **Fix:** 时间描述只放 `look` 的首次(`first`)分支,重访(`return`)分支不重复。
- **Check:**
  ```bash
  grep -n '日落\|太阳\|傍晚\|走了.*小时\|天色' world.js
  # Manual: 验证每处都在 look 的首次分支(first)里
  ```

### ✅ Softlock: 每节点至少 1 个无条件出口(Rule 34)
- **Problem:** 所有 link 都有 `requires:` → 玩家面对全灰按钮卡死。
- **Fix:** 至少 1 个 link 无条件(或验证所有路径都能满足条件)。注:核心有安全网(节点若无任何可点动作,模块会把锁定项灰显出来),但作者仍应保证每节点有无条件出口。
- **闸**:`graph-audit.mjs`「无保底出口」——节点出口全带条件 → **[P0] 硬拦**;该节点某出口标 `lockHint`(显式有意单程)才降 P1。一次性出口(`once:true`)消耗后不算保底。无需手数 requires。

### ✅ 高潮后路由不要指回高潮前节点(Rule 46)
- **Problem:** `storm_aftermath` 的 link `to: 'village_conflict'`(暴风前)= 时间线崩塌。
- **Fix:** 高潮后节点必须路由到高潮后版本。
- **Check:**
  ```bash
  # Manual: 画事件时间线,检查高潮后节点的 link.to 不指向高潮前目标
  grep -n -A 3 'storm_aftermath\|act3_start' world.js | grep 'to:'
  ```

### ✅ 方向矛盾需解释(Rule 51)
- **Problem:** 世界有异常方向(日落 NNW 30°)但场景写「太阳正东升起」。
- **Fix:** 加一句解释。无需条件文本——是 worldbuilding 解释,直接写进 `look`。
- **Check:**
  ```bash
  grep -n '正东\|正西\|正南\|正北' world.js
  # Manual: 验证与世界规则一致(日落 NNW 30°)
  ```

### ✅ 结局分支文本的语气要配结局氛围(Rule 40)
- **Problem:** 悲剧结局配自信/正面的分支文本 = 语气割裂。
- **Fix:** 模块化里结局也是节点;`look` 里若按累积状态分支(函数式),各分支语气都要配结局主调。
- **Check:** Read 每个结局节点的 `look` 分支;把分支文本与结局主文一起读,验证情绪一致。

### ✅ 命名/术语过早引入(Rule 32)
- **Problem:** 「活墨水」在它被命名的场景之前就用了。
- **Fix:** 命名场景之前:「那瓶墨水」/「那种墨水」;之后:正式名。
- **Check:**
  ```bash
  # 找正式命名节点,再在所有更早节点搜该名
  grep -n '活墨水' world.js | head -20
  # Manual: 验证首次出现在命名节点处或之后
  ```

### ✅ 场景前两句回答「在哪」「是谁」(Narrative consistency)
- **Check:** Read 每个节点 `look` 的开头。必须建立空间与角色上下文。

### ✅ 不要零效果选择(Hard Constraint 4)
- **Problem:** 选项文字暗示有后果,但既不移动也没 `run`,玩家点了什么都不变。
- **Fix:** 每个非移动选项都该有 `run:(S)=>{...}`(哪怕 `S.understanding = (S.understanding||0)+1`);移动选项靠 `to` 自身就是后果。
- **闸**:`graph-audit.mjs`「假选择」——同节点 ≥2 个无 `run`/`requires`/`once` 的纯移动指向同一 `to`(玩法等价)→ P1。无需手动 grep label。

---

## 6. Expansion / 大型游戏维护

> **模块化形态**:没有运行时改 `SCENES` 这回事。要加内容 = 直接在 `world.js` 加节点 / 加 link;条件出现的选项放模块 `actions()` 或用 `requires`。大型游戏拆成多个 `world.js` 片段、构建前合并。下面的「覆盖」「重复」类 bug 在模块化里**大多从模型层消失**(没有内联+后覆盖的双重定义),保留的是其背后的内容一致性原理。

### ✅ Chinese text duplication: 一种一种, 了了 (Rule 13)
- **Problem:** LLM systematic error. ~14 instances per 60K characters is typical.
- **Fix:** `sed -i 's/一种一种/一种/g' world.js` and `sed -i 's/了了/了/g' world.js`
- **Check:**
  ```bash
  grep -c '一种一种' world.js
  # Expected: 0
  grep -c '了了' world.js
  # Expected: 0
  ```

### ✅ 合并多个 world.js 片段时的重复(Rule 14)
- **Problem:** 大型游戏拆多个 `world.js` 片段、构建前合并;合并时新文本与旧文本重叠。
- **Fix:** 合并后逐路径走查,找同句内重复短语(len > 10)。
- **Check:**
  ```bash
  # Manual: 走查所有主线路径找内部重复
  # Automated (partial): 提取 look 文本,在同段落找 len>10 重复子串
  ```

### ✅ 加内容直接改 world.js,不存在运行时覆盖(Rule 43)
- 模块化**没有运行时改世界**:节点/link 在 `world.js` 静态声明,要加就直接加;条件选项用 `requires:(S)=>bool`(+ `showWhenLocked`/`lockHint`)或模块 `actions()`,不往数组 push。旧的 `.choices.push`/`.splice`/`applyExpansion(SCENES)` 这套 API 在模块化根本不存在 → 写了即引用未定义、跑不起来,**装配探针即报**。「后定义覆盖前定义」「push 被 = 摧毁」这类 bug 在模型层消失。

### ✅ 结局节点不要被遗漏/孤立(Rule 37b, 47)
- **闸**:`graph-audit.mjs` 死链/孤儿/可达性——结局不可达 → 报孤儿;孤儿率 >1/3 且 ≥3 → 结构断裂 **[P0]**。接 Stop hook。改完验证 `check_ending_*` → `ending_*` 引导链都可达。

### ✅ 编辑 JS 对象结构后验证语法(Rule 12)
- 替换 link/node 文本漏了外层 `{}` 会破坏花括号平衡;Edit 时匹配**完整对象**(含 `{`/`}`)。**闸**:`node -c world.js` + 构建准入门(`build.mjs` fail-closed)双卡,语法坏了构建不出 HTML。

---

## 7. Anti-Farming

### ✅ 防刷靠核心 once 账本,不靠手写守卫(Rule 44)
- **Problem:** 旧格式 `loadScene` 无条件应用 `scene.effects` → 玩家反复进出场景刷属性;要手写 `sceneEffectsApplied` 数组守卫。
- **Fix:** 模块化里一次性效果用核心 `once: true`:
  ```js
  // link:点开一次后被核心 _once 账本过滤,不再出现
  { label: '撬开锈箱(只能一次)', once: true, run: function (S) { S.understanding = (S.understanding||0)+1; } }
  // event:进入即触发一次,核心 _eventsDone 记账,重访不复触发
  { id: 'find_case', once: true, when: function (S) { return !S.flags.foundCase; },
    run: function (S) { S.flags.foundCase = true; return '你摸到一只旧皮箱…'; } }
  ```
  核心 `apply()`/`enter()` 据 `_once`/`_eventsDone` 自动去重,**作者不写 `sceneEffectsApplied` 守卫,也不写读档迁移**。
- **注**:一次性出口(`once:true`)被消耗后不再算「保底出口」——graph-audit 的无保底出口检测已据此排除一次性出口(见 §5 softlock 的闸说明)。

---

## 8. Miscellaneous

### ✅ Flag 只设不用 / 只用不设(Rules 17, 28)
- **Problem:** flag 在 `look`/`requires`/`when` 里被读,但从没在任何 `run` 里设为 true → 死门(`requires` 恒 false、该选项永不可点;只靠它到达的节点 softlock)。
- **闸**:`graph-audit.mjs`「死 flag」——被 `S.flags.X` 读、从不写 → P1,**并合并扫同目录 `game.js`**(连 achievement 的 `when` 读的死 flag 也抓)。无需手写 `comm` 差集。「只设不读」不一定是 bug(留作将来用),工具有意不报。

### ✅ region/mood 映射完整(Rule 20)
- 氛围写在节点自己的 `scene.region`/`scene.mood`/`audio.bgm` 里(**不是**旧的外部 `SCENE_ZONES` 映射表——那会「漏加映射→默认 ocean→氛围错」)。未声明的节点优雅退化(presenter 中性背景/确定性默认音),不会错配。检查点 = 每个该有氛围的节点是否声明了 `scene`/`audio`(`grep -n 'region:\|mood:' world.js`);region 词汇核对见 `visual-system.md`。

### ✅ requires 用函数,不用 flag 对象语法(Rule 33)
- **Problem:** 旧格式 `requires: { flags: { name: true } }` 不生效,只有 `{ flag: "name" }` 这种特定形状才行——是易错的声明式 schema。
- **Fix:** 模块化的 `requires` 是普通谓词函数:`requires: function (S) { return S.flags.name; }`。写错就是普通 JS 错,没有「形状对了才生效」的伪字段陷阱。
- **闸**:`engine-core.js` 过滤选项时,`requires`/`available` 存在但**非函数** → **立刻抛**(违约即报,不再把对象/字符串静默当恒真/恒假——那等于锁形同虚设)。写错跑不起来,装配探针即报 P0。

### ✅ Mojibake / encoding corruption (Rule 29H)
- **Problem:** 编码损坏产生替换字符 `�`(U+FFFD),玩家会看到乱码。
- **闸**:`static-lint.mjs`(接 Stop hook)扫 `�` → 报「乱码」P1。

### ✅ TODO/placeholder check (Hard Constraint 6)
- **Problem:** 交付物里残留 `TODO`/`FIXME`/占位/待填文本。
- **闸**:`static-lint.mjs`(接 Stop hook)扫 TODO/FIXME/XXX/PLACEHOLDER/占位/待填 → P1。

### ✅ Duplicate paragraph detection
- **Check:**
  ```bash
  # 提取 look 文本,找重复段落
  grep -oP "look:.*" world.js | awk 'NF{if(seen[$0]++) print NR": "$0}' | head -20
  ```

### ✅ localStorage try/catch (Common trap 4)
- **Note:** 模块化里 localStorage 访问通常封装在核心/存档插件(`plugins/save.js`)与 `game.js` 的 storage 探测里(`try { return window.localStorage; } catch (e) { return null; }`,见 `examples/text-adventure-demo/game.js`)。
- **Check:**
  ```bash
  grep -n 'localStorage' game.js plugins/save.js | grep -v 'try\|catch'
  # 所有 localStorage 访问应包在 try/catch(file:// 下可能不可用)
  ```

---

## 工具速查(模块化)

| 旧脚本(已废) | 模块化等价 |
|---|---|
| `audit.mjs game.html` | `node core/tooling/graph-audit.mjs world.js`(死链/可达/死胡同;P0 退出码非零) |
| `find-fake-choices.mjs` | `graph-audit.mjs`「假选择」自动 P1(同节点 ≥2 个无 run/requires/once 纯移动同 to);纯叙事分叉是否有意仍人工判 |
| `smoke-test.mjs` | `node pipeline/build/build.mjs src/index.html --smoke`(jsdom 探针) |
| `canon-scan.mjs` | 直接读 `world.js`:数入边找高入度(重访候选)、扫时间线/近似人名 |

结构问题另被构建准入门(`build.mjs` 复用 graph-audit P0 + 薄 schema-shape,fail-closed)卡一道。

## 模板速查(模块化)

旧模板 `templates/world-engine.html` / `engine-skeleton.html` / `svg-generator.js` / `detail-map.js` **已删**。改成:照抄 `examples/text-adventure-demo/` 三文件(`world.js`/`game.js`/`index.html`);视觉用 `present-svg`;地图 UI 用插件(参考 `plugins/minimap.js`)。

---

## Priority Order

本表是历史规则编号索引;当前优先级以 `graph-audit` / `assembly-probe` / 静态闸输出为准。

| Priority | Category | Rules |
|----------|----------|-------|
| P0 | Dead links, syntax errors, encoding | 5, 29H, hard constraints |
| P1 | Path gaps, premature naming, softlock | 30, 32, 33, 34, 43, 46 |
| P2 | Audio, layout, save system | 21-26, 27, 37-39 |
| P3 | Narrative quality, tone | 40, 41, 45, 45b, 50, 51 |
| P4 | Visual polish, progressive reveal | 18, 19, 20 |

---

## 运行时顺序 bug:effect 与正文渲染的先后(只有实跑才查得到)

### 真实案例(本框架骨架自身曾有此 bug)
旧版引擎骨架的 `loadScene` 曾经**先应用 effect,再渲染正文**。某场景用「首次/重访」分支演示重访,而它自己的 effect 把「来过」flag 设成 true。结果:**首次访问就显示「你来过这里」**——因为渲染前 effect 已把 flag 设成 true。

语法检查和结构检查**都查不到**这个 bug——它是运行时的执行顺序问题。只有在浏览器(或 jsdom)里实际点进该场景才暴露。这正是「能跑就跑」原则的意义。

**模块化的根除**:在 Amatlas 里,「正文(`look`)在 effect 之前渲染、选项在 effect 之后渲染」是**核心 `engine-core.js` 的不变量**,作者写 `world.js` 时不重写 `loadScene`,因此这个执行顺序 bug 在数据层不可能再引入。但理解这个语义仍重要(下面),因为它决定了 `look`/`requires`/`run` 各自看到的状态。

### 正确的引擎语义(核心保证)
**正文描述「到达时所见」(effect 之前);选项和数值反映「本场景所得」(effect 之后)。**

核心 `enter`/`render` 的顺序(引擎职责,作者无需实现,理解即可):
1. 标记位置 / `seen` 计数(首次/重访由它判定)
2. 触发进入 events(beat,带 `once` 去重守卫)—— 注意:event 的 `run` 会改状态
3. 渲染配图(presenter 据 `scene` 意图)
4. **渲染正文**(`look(S, first)`)
5. 渲染选项(`links`/`actions`,`requires` 需看到本场景所得的状态)
6. 更新状态条 / autoSave

要点:`look` 的 `first` 参数由访问计数(`visits<=1`)决定,首次为 `first=true`;若某 event 在进入时改了 flag,`look` 里读那个 flag 要想清楚是想看「改之前」还是「改之后」——多数叙事用 `first` 判首次即可,不依赖 event 的副作用。

### 防护:首次访问/重访逻辑必须运行时测试
任何用 `look: {first, return}` 或 `look:(S,first)=>...` 做「首次 vs 重访」的节点,**必须实际点进去两次**验证:
- 第一次显示首次措辞、第二次显示重访措辞。
- 用轻量的 jsdom 脚本(`runScripts:'dangerously'` + `url` 提供 localStorage)实跑构建产物;或直接 `node pipeline/build/build.mjs src/index.html --smoke` 跑可加载探针;要真浏览器自动化可选装 webapp-testing skill(见 README『可选扩展』)。
- 检查渲染输出元素(如 `#look`)的 textContent,**不要检查整个 `document.body`**——body 含 `<script>` 源码,里面的节点定义会造成假阳性。

### 同类运行时 bug(静态检查都查不到,需实跑)
- `look` 函数读「本场景 event 改过的数值」——正文会看到 event 之后的值(`look` 在 events 之后渲染);多数情况想清楚要哪个版本即可。
- 选项 `requires` 基于「本场景所得的数值」——核心在 effect 之后渲染选项,故 `requires` 能看到本场景授予的状态,这是核心保证的正确行为。
- 按累积状态做结局分流的 `look`/`actions`——要测多条路径汇入时分流是否正确。

---

## flag-gate softlock(真实游戏审计的教训)

### flag-gate softlock——requires 的门可能永远打不开
选项的 `requires:(S)=>S.flags.X` 只在 flag X 为 true 时通过。两类 bug 普通可达性查不到(它把所有选项当边,flag 盲):
- **死门**:requires 读的 flag 全文从没在任何 `run` 里设为 true(拼写错 / 忘了设)→ 这个选项永远无法通过。若某节点只能经这个门到达 → 该节点 softlock。
- **顺序死锁**:flag X 只在区域 A 设置,但通往 A 的唯一路径又要求 X → 死循环。

防护:
- 用上面「Flag 只设不用 / 只用不设」的检查找死门(读了但从没设的 flag)。
- 这是 Twine 社区反复强调的「$hasKey 门变死胡同」问题。
- 加 `requires` gate 后**务必重跑 `node core/tooling/graph-audit.mjs world.js`**,确认没把关键节点/结局锁死(graph-audit 报结构性不可达;flag 感知的逻辑死锁仍要靠上面的 flag 设/读差集人工核)。

### 路径前提:绕行路径检查
某选项文字写「回到 X」时,要判断 X 是不是必经节点:
- X 是必经节点(所有玩家都去过)→ 选项合理。
- 存在绕过 X 的路径 → 该选项可能让玩家引用没去过的地方。用 `graph-audit` 的可达性 + 人工 BFS 确认是否存在绕行路径。
- 语义提醒:选项文字提到的「地点」可能是一个区域(多节点)而非单个目标节点,后者可能仍合理——需人工判断。

## 叙事/编辑 craft 模板(从 SKILL «常见陷阱» relocate,逐字保全)
> 这些是 bug-prevention 原本没有、其它 ref 也没有的具体修复模板/例子,从旧 SKILL 常见陷阱段移来,一字不删。

### ✅ Edit 破坏 link 对象:`} } }` 三重闭花括号陷阱(Rule 12 补充)
> bug-prevention §6「编辑 JS 对象结构后验证语法」已有「匹配完整对象 + `node -c` 验证」原则;下面这个具体反例是它缺的。

用 Edit 修改 link 对象时,如果 `old_string` 只匹配对象的**一部分**(不含外层 `{}`),替换后会破坏花括号平衡。

**反例:**
```
# 原始: { label: '我是遇难者', to: 'meet_chief' }
# 想加 run,但 old_string 只取了 label/to 片段,new_string 末尾多了一个 }
old_string: "label: '我是遇难者', to: 'meet_chief'"
new_string: "label: '我是遇难者', to: 'meet_chief', run:(S)=>{ S.flags.x=true; } }"
# 结果: 多出一个 }，JS 花括号失衡，语法错误
```

**正确做法:** 匹配完整的 link 对象(包含 `{` 和 `}`),或匹配包含上下文的更大块。修改后必须用 `node -c world.js` 验证 JS 语法。

**额外陷阱:** 替换后可能产生 `} } }`(三重闭花括号)。例:`run:(S)=>{ S.understanding++; } } }` — 最后的 `}` 是多余的。grep `} } }` 检查,如果箭头函数体没有嵌套对象,括号数应配平。

### ✅ 改写与原文内部重复:具体例子(Rule 14 补充)
> bug-prevention §6「合并多个 world.js 片段时的重复」已有检测原则(找同段 len>10 重复子串);下面这些是它缺的真实样例,用于校准"句内重复长什么样"。

当你在 `look` 里重写一段描写、却没删干净旧句时,新文本可能与旧文本部分重叠,产生句子内部的冗余:
- `清脆的、像水滴落入浅潭的声音。——一种清脆的、像水滴落入浅潭的声音。`
- `小屋比其他房屋更大——墙壁上挂满了织物...小屋比其他房屋更大——它的墙壁上挂满了织物`
- `水面平静得像一面镜子...池子的直径大约有十米，水面平静得像一面镜子`
- `岩石更少，沙滩更宽——岩石更少，沙滩更宽`
- `瓶壁温热得像一颗心脏...瓶壁在你的手掌中温热得像一颗心脏`

**检测:** 读 `world.js` 的 `look` 文本 → 找同句内 len>10 的重复短语。手动走查 6 条主要路径时也会发现。
**修复:** 保留更完整的版本,删除重复部分。用 Edit 包含足够上下文确保唯一匹配。

### ✅ 所有选项通向同一剧情触发点(Systematic Funnel)— 退路修复模板(Rule 16b)
> multi-phase-audit.md §1 已点出 Funnel 概念;下面的实测案例 + 退路 link 修复模板是它缺的具体 craft。

多个探索节点的所有 link 都直接通向同一个剧情高潮节点(如 first_shift),玩家在"探索"中没有真正的选择——无论点哪个都会触发高潮。

**实测案例:** tide_pools(4 link 中 3 → first_shift)、tidal_mystery(2 link 全 → first_shift)、coral_reef(3 link 全 → first_shift)。玩家从白天潮池探索直接跳到夜晚重排,中间没有"回营地"或"继续探索别处"的选项。

**修复:** 每个探索节点至少有 1 个非剧情触发的退路 link:
- `{ label:'天色已晚，先回营地休息', to:'first_night' }`(或 camp_setup)
- `{ label:'带着对XX的记忆回营地', to:'first_night', run:(S)=>{ S.understanding=(S.understanding||0)+1; } }`
- `{ label:'记录完数据，先回营地整理思路', to:'first_night', run:(S)=>{ S.understanding=(S.understanding||0)+1; } }`

**同时解决时间线问题:** 从白天节点直接进入夜晚剧情时,link 的 `label` 应包含时间过渡暗示("天色渐暗""天色已经完全暗了")。

**检测:** 对每个节点,检查是否所有 `links` 的 `to` 都指向同一个节点。如果是 → 该节点是"假探索",需要加退路。

### ✅ scene.region 判定原则(Rule 20 补充)
> bug-prevention §8 已讲 region 是节点意图、未声明优雅退化;下面这份"按内容判 region"的速查表是它缺的具体 craft。

写节点时随手填 `scene.region` 不核实节点实际发生地,会导致音频播错、氛围色错、SVG 用错区域模板、小地图区域标记错误(present-svg/present-audio/minimap 都按 region 分流)。

**region 判定原则:**
- 海滩/潮间带/海面/退潮礁石 → `beach` / `sea`(按场景在岸上还是海上选)
- 森林/树木/桥 → `forest`
- 夜林/夜路/黑暗深处 → `night`
- 村庄/集市/长老/织工/城镇 → `town`(旧口语 `village` 会被归族到 town,但新作品优先写 `town`)
- 洞穴/地下河/地底核心/守卫者/真相揭露 → `cave` 或按实际场所写 `ruins` / `room`;不要把章节名 `heart` 当 region
- 神庙/遗迹 → `ruins`;室内醒转/房间 → `room`
- 结局节点按**画面发生地**选上面的 13 个 region;若只想抽象纯色,可自定义 region,但不要期待 presenter 画出专属剪影
- 节点在洞穴中但做的是"在海滩开始的事"(如观星)→ 按**行为发生地**判定

**验证:** 通读 world.js,逐个节点核对 `scene.region` 是否匹配正文描写。graph-audit 查图结构,region 语义对不对要人工读。

### ✅ 结局 requires 递进模型(Rule 36)
> narrative-consistency.md §Requires System Audit 已有"6 个结局至少 4 个无门槛"原则;下面这份从易到难的 6 结局递进配方是它缺的具体 craft。

6 个结局应形成"越特殊越需要积累"的递进,而非全部自由可选。这让属性系统有意义,提升重玩价值。

**推荐递进(从易到难):**
- control(控制):无门槛("默认"结局,任何人可选)
- truth(真相):`requires:(S)=> (S.understanding||0) >= 5`(需要一定理解)
- destroy(放下):`requires:(S)=> (S.understanding||0) >= 8`(需要更多智慧)
- coexist(共存):`requires:(S)=> !!S.flags.learned_flow`(需要特定任务)
- synthesis(融合):`requires:(S)=> (S.understanding||0) >= 10 && (S.inventory||[]).includes('刻符石板')`(需要收集)
- transcend(超越):`requires:(S)=> (S.understanding||0) >= 15`(最高理解)

**原则:** 6 个结局中至少 4 个应无门槛或低门槛可达。只有最特殊的 1-2 个需要高积累。门槛未满足时给友好提示:该 link 配 `showWhenLocked:true` + `lockHint:'需要更深的理解'`(呈现器据此灰显、不接点击)。

### ✅ 时间线矛盾:新近 vs 风化描述的修复原则(Rule 41 补充)
> canon-tracking.md / consistency-guardrails.md 已有时间线一致性审计方法论;下面这条"角色离开多久 → 痕迹该多新/多旧"的具体修复原则是它们缺的。

场景文本中的时间描述与已建立的世界观时间线冲突。

**典型 bug:**
- 雷纳 1895 年失踪(2 年前),但 deep_forest 描述他的刻痕"很新,没有愈合"
- echo_chamber 署名 1894,但制图笔记日期 1895

**关键 grep:**
```bash
grep -n "很新\|最近\|刚.*过\|刚刚\|没有愈合" world.js  # 找"新近"描述
grep -n "1894\|1895\|1896\|1897\|两年前\|一年前" world.js  # 找日期引用
```

**修复原则:** 如果角色 X 年前就离开了,刻痕/笔记/痕迹必须描述为"已经风化/模糊/被苔藓覆盖",不能是"很新/刚留下的"。

### ✅ NPC 重出场需要条件分支(Rule 45b)
> narrative-consistency.md §NPC Transition Checklist + multi-phase-audit.md §2 已有概念清单;下面的 kol_challenge→choose_side 实测案例 + 修复模板 + 检测是它们缺的具体 craft。

当 NPC 在场景 A 首次出场,然后在场景 B(从 A 可达)再次出现时,如果 B 也有从其他路径进入的可能,B 的开头必须区分"刚见过"和"首次见"。

**典型 bug:** kol_challenge(画图比试,科尔出场)→ choose_side(科尔再次"眼睛一亮从人群走出来")。玩家从 kol_challenge 来会觉得科尔出场了两遍。

**修复模板:** B 节点的 `look` 按 flag 分流(呈现器不解析 `{{}}`,条件写进 look):
```js
look: (S) => S.flags.npc_encountered ? '承接版（引用之前的互动）' : '首次版（完整出场描写）'
```
前提:NPC 首次出场节点用 `events` beat 或某 link 的 `run:(S)=>{ S.flags.npc_encountered = true }` 设上该 flag。

**检测:** 找到 NPC 首次出场场景,检查所有从该场景可达的目标场景是否也有其他入口。如果有 → 该目标场景需要条件分支。
