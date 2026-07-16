# Audit Checklist

> 文字冒险游戏的**验证清单**(怎么验、过没过);每项有 pass/fail 标准。
> **与 `bug-prevention.md` 分工**:bug-prevention 讲「为什么 + 怎么写对」(创作时读),本清单讲「怎么验、过没过」(交付前读)——同一条规则不在两处重复 grep。
> **确定性检测已沉淀进自动闸**:结构类跑 `graph-audit.mjs`、装配/挂载点/CSS 跑 `assembly-probe.mjs`、残留 TODO/乱码/`{{` 跑 `static-lint.mjs`(都接 Stop hook、违约即报)。本清单据此**只标「跑哪个闸 + PASS/FAIL 判据」,不再重复大段 grep/comm**;标「人工」的项才是闸判不了、需读码/实跑/读文的。依据见 `docs/design-principles.md` §10。
> **模块化形状**:游戏 = `world.js`(数据:`maps.<map>.nodes.<node>` 带 `kind:'scene'/look/links/events/scene/audio`)+ `game.js`(组装)+ `index.html`(模板),经 `node pipeline/build/build.mjs src/index.html` 构建成单 HTML。审计针对 **`world.js`(结构)** 与 **构建产物 HTML(运行时/呈现)** 两个层面。

> **工具说明(重要)**:结构审计以 `node core/tooling/graph-audit.mjs world.js` 为准——它直接解析数据驱动世界模型(`maps/nodes/kind/links.to/exits`/`checks[].success.to/fail.to`〔v12 检定边〕),做死链 / 可达性 / 死胡同检查,**P0(死链 / 起点缺失)退出码非零,必须先修**。结构层也被 `pipeline/build/build.mjs` 的硬准入门复用一道(fail-closed)。下面的 grep 模板是人工快速核查的补充。
> ⚠️ 切勿用"纯静态 grep 只认 inline 定义"判定死链/孤儿——模块化里入边可能来自模块 `actions()` 动态产出的移动动作、或大型游戏拆分的多个 `world.js` 片段构建前合并,纯静态 grep 会把真实可达场景误报成孤儿/死链(本项目最大教训:某纯静态脚本在 96 节点真实游戏上只认出 65 个、误报 31 个假死链;见 `structural-bug-validation.md`)。**结构判定永远以 `graph-audit.mjs` 解析真实 `world.js` 为准。**

---

## Structural Checks(以 `graph-audit.mjs` 为准 + grep 辅助)

### 1. Dead Links(死链)
**所有 link 的 `to` 目标都必须有对应的节点定义。**

```bash
# 权威:解析 world.js 的 maps/nodes/links.to,报死链(P0,退出码非零)
node core/tooling/graph-audit.mjs path/to/world.js

# JSON 形式(便于脚本消费)
node core/tooling/graph-audit.mjs path/to/world.js --json
```
(不再列手动 grep 辅助:它只认 inline 定义、漏报跨图 `to:{map,node}` 与 `actions()` 动态入口——死链一律以 graph-audit 解析真实 world.js 为准。)
- **PASS:** `graph-audit.mjs` 报 0 死链(退出码 0)
- **FAIL:** 任意 link 的 `to` 指向未定义节点(P0,退出码非零)
- **NOTE:** 跨图链接 `to:{map:'X',node:'Y'}` 由 graph-audit 正确解析;手动 grep 易漏,以工具为准

---

### 2. Orphan Nodes(孤儿节点)
**每个节点都应被至少一条 link `to`、或模块 `actions()` 产出的移动动作引用到(起点除外)。**

```bash
# 权威:graph-audit 的可达性分析(从 start 出发 BFS,报不可达节点)
node core/tooling/graph-audit.mjs path/to/world.js
```
- **PASS:** 每个节点都从 `start` 可达(0 个不可达节点)
- **FAIL:** 节点存在但 0 入边且无动态入口
- **NOTE:** 模块化里没有运行时改 `SCENES{}` 那套;"条件出现的去处"要么是节点上带 `requires` 的 link(满足条件才解锁,但 link 本身静态存在=可被 graph-audit 看到),要么是模块 `actions()` 产出的移动动作。后者若 graph-audit 报孤儿,需人工确认动态入口真实存在(见 `structural-bug-validation.md`)

---

### 3. Conditional Flag Audit(条件 flag 审计)
**`look` 函数体里读到的每个 `S.flags.X`,都必须有至少一处 link 的 `run` 设置 `S.flags.X`。**
模块化用 `look` 函数 / `look:{first,return}` 表达条件文本,**不用** `{{if}}` 标记(呈现器不解析 `{{}}`,写了原样显示给玩家)。

**闸**:`node core/tooling/graph-audit.mjs world.js`「死 flag」自动报「被 `S.flags.X` 读、从不写」的 flag(并合并扫同目录 `game.js` 的 `achievement.when` 等)——取代手写 comm 差集。
- **PASS:** graph-audit 不报死 flag
- **FAIL:** 某 `look`/`requires`/`when` 读的 flag 从没被任何 `run` 设置(条件恒假、潜在 softlock)
- **WARN:** 设了但从未读的 flag(工具有意不报——可能留作未来用,如供 `requires` 门控)

---

### 4. Requires Audit(门控 flag 审计)
**link 的 `requires:(S)=>...` 里读到的 flag 都必须在游戏里存在(被某处 `run` 设置)。**

**闸**:同上「死 flag」检测覆盖——`requires:(S)=>S.flags.X` 读的 `X` 若从没被 `run` 设置,graph-audit 报死 flag。
- **PASS:** graph-audit 不报 `requires` 读的死 flag
- **FAIL:** `requires` 引用一个从未被设置的 flag(门永远开不了 → 潜在 softlock,见 #27)

---

### 5. TODO/Placeholder Check
**不允许 TODO/TBD/FIXME/placeholder/占位/待填。**
**闸**:`static-lint.mjs`(接 Stop hook)自动扫 → P1。
- **PASS:** static-lint 不报残留待办
- **FAIL:** 任何 TODO/placeholder 残留

---

### 6. Duplicate Paragraph Detection(重复段落)
**同一段叙事不应出现两次(多 `world.js` 片段合并时的残留)。**

```bash
# 在构建产物里剥 HTML 标签,找重复的非空长行
sed 's/<[^>]*>//g' dist/index.html | \
  awk 'NF && length($0)>20 {if(seen[$0]++) print NR": "$0}' | head -20
```
- **PASS:** 0 重复(菜单文本等有意重复除外)
- **FAIL:** 叙事文本里发现重复段落

---

### 7. Chinese Text Duplication(一种一种, 了了)
**LLM 的系统性错误 —— 反 slop 审计抓不到。**

```bash
echo "=== 一种一种 (量词重复) ==="
grep -c '一种一种' world.js

echo "=== 了了 (助词重复) ==="
grep -c '了了' world.js
```
- **PASS:** 两个计数都 = 0
- **FAIL:** 任何一处出现
- **Fix:** 直接在 `world.js` 文本里修 `sed -i 's/一种一种/一种/g' world.js && sed -i 's/了了/了/g' world.js`(改源数据,重新构建)

---

### 8. 无效字段检查(字段拼写)
设 flag 写在 link 的 `run:(S)=>{ S.flags.X=true }` 函数体,非旧的 `flags_set`/`effects:{flags:{…}}` 对象(那些不是有效字段、静默不生效;why 见 bug-prevention §1)。`grep -n 'flags_set\|effects:\s*{' world.js` 应为 0 → 否则改成 `run`。

---

### 9. 条件文本写法检查(不用 `{{}}` 标记)
**呈现器不解析 `{{if}}/{{elif}}/{{endif}}/{{else}}` —— 写了会把原始标记直接显示给玩家。**
条件文本一律写在节点 `look` 里(函数 / `{first,return}` 对象),首访/重访由引擎按 `visits<=1` 自动判定,**不用手写 `_visited` flag**。怎么写见 `bug-prevention.md` §1。
**闸**:`static-lint.mjs` 扫 world.js 里的 `{{` → 报「死标记」P1。
- **PASS:** static-lint 不报死 `{{` 标记
- **FAIL:** 发现任何 `{{...}}` 标记或旧 `processConditionalText`

---

### 10. 防刷守卫(once / 一次性 event)
**进入即给属性/物品的副作用必须只生效一次,防止来回走刷属性。**
模块化用核心 **`once:true`**(`_once` 账本,带 `once` 的动作执行后被 `view()` 过滤掉)或 **一次性 event**(`{ once:true, ... }`,`_eventsDone` 账本)。**不用** 手写 `sceneEffectsApplied` 标志。

```bash
# 给属性/物品的 link(run 改属性/inventory)应带 once:true,或放进 once 的 event
grep -n 'run:\|inventory\|S\.\(understanding\|trust\|hp\)' world.js
```
- **PASS:** 所有"进入即给奖励/属性"的副作用都在 **`once:true` 的 link** 或 **`once:true` 的 event** 里(参考 `examples/text-adventure-demo/world.js`:`find_case` event 带 `once:true`、`open_case` link 带 `once:true`)
- **FAIL:** 副作用挂在普通(可重复)的 link/event 上 → 来回走可无限刷
- **NOTE:** 序列化兜底:引擎把整个 `state`(含 `_once`/`_eventsDone`)存进存档,无需手写迁移(见 #存档)

---

### 11. 条件值相等(用 JS 不用标记)
**条件就是普通 JS**:`S.flags.X`(布尔)、`S.understanding >= 3`(数值)、`(S.inventory||[]).includes('钥匙')`(物品)——自由表达;别回到旧标记 `{{if:X==Y}}`(呈现器原样显示)。
**闸**:与 #9 同——`static-lint.mjs` 扫 `{{` 即报(含 `{{if:X==Y}}`)。

---

### 12. Encoding Corruption(乱码 / Mojibake)
**闸**:`static-lint.mjs` 扫替换字符 `�`(U+FFFD)→ 报「乱码」P1。
- **PASS:** static-lint 不报乱码
- **FAIL:** 任何替换字符(确保 world.js 与构建产物都是 UTF-8)

---

### 13. Comma Truncation(中文逗号截断)

```bash
# 构建产物里:句子以逗号结尾(段落被截断)
grep -n '，</p>' dist/index.html
# 源数据里:文本字符串以逗号结尾
grep -n '，['\''"\x60]' world.js
```
- **PASS:** 0 结果(或确认有意)
- **FAIL:** 句子以逗号而非句号结尾

---

### 14. 呈现器过渡:不留陈旧淡入淡出状态
过渡由呈现器统一无条件清理(present-svg `transition` 按 `snap.pos` 触发 + present-audio bgm 变更检测),数据里**不写** fadeId/计数器之类的状态机。`grep -n 'fadeId\|_fadeCounter' world.js dist/index.html` 应为 0。

---

### 15. CSS Transition: all
(检查构建产物 HTML / `index.html` 模板 / presenter 注入的样式)

```bash
grep -n 'transition.*:.*all' dist/index.html
```
- **PASS:** 0 结果
- **FAIL:** 任何 `transition: all` —— 用具体属性

---

### 16. 全屏高度与 100vh 用法
(检查构建产物 / 模板)

共享 `amatlas-skins.css` 的阅读框使用 `min-height:100vh` 是普通文档流页面的稳定基线,不按本项 FAIL。需要警惕的是**手写全屏固定壳层**把内容锁死在移动端视口外。

```bash
grep -n 'height:\s*100vh\|overflow:\s*hidden' dist/index.html
```
- **PASS:** 没有 `height:100vh` + `body{overflow:hidden}` 这类全屏锁死布局;普通阅读流可滚动,插件工具栏在 `#app` 内可见
- **FAIL:** 手写壳层用 `height:100vh`/`100dvh` + `overflow:hidden` 把正文或 `#plugin-bar` 推出屏幕;应改成文档流 `min-height` 或确保移动端可滚动

---

### 17. requires 写法检查
**`requires` 是 link 上的函数 `requires:(S)=>bool`。** 配套门控字段:`showWhenLocked:true`(灰显而非隐藏)+ `lockHint:'提示'`。
**闸**:引擎在过滤选项时 `requires`/`available` 非函数 → **立刻抛**(装配探针即报 P0),不会静默当恒真/恒假。
- **PASS:** 装配探针不报、游戏正常装配
- **FAIL:** `requires` 写成对象 `{flag:...}` → 运行时抛
- **参考:** `examples/text-adventure-demo/world.js` 的 `open_case`:`requires: (S) => S.flags.foundCase, showWhenLocked: true, lockHint: '...'`

---

## Content Checks(人工复核)

### 18. Scene Opening: "Where" + "Who"
**每个节点 `look` 文本的前 2 句必须回答:(1) 我在哪? (2) 谁在场?**

- **PASS:** 每个节点 `look` 开头建立空间 + 角色语境
- **FAIL:** `look` 开头没交代地点或谁在场
- **Method:** 读每个节点 `look`(首访分支)的前 2 句,检查地点名词与角色指代

---

### 19. Hub Nodes: First vs Revisit Text(枢纽节点首访/重访文本)
**枢纽节点(5+ 入边)必须有首访/重访区分的文本。**
模块化:用 `look:{first:'首访文本',return:'重访文本'}` 或 `look:(S,first)=> first ? ... : ...`,**引擎按 `visits<=1` 自动判定首访**,无需手写 `_visited` flag。

```bash
# 找枢纽节点(被 link to 引用次数 >5)——以 graph-audit 入度统计为准
node core/tooling/graph-audit.mjs world.js --json   # 看每个节点入度
# 辅助:统计 to 目标频次
grep -oP "to:\s*['\"\x60]\K[a-z_]+" world.js | sort | uniq -c | sort -rn | awk '$1>5{print $2}'
```
对每个枢纽节点,人工确认其 `look` 是 `{first,return}` 或函数形式(区分首访/重访),而非单一字符串。
- **PASS:** 所有枢纽节点的 `look` 区分首访/重访
- **FAIL:** 枢纽节点用单一文本块,无论访问次数都一样(重访读到"你第一次见到…"=穿帮)

---

### 20. No Time Descriptions Outside First-Visit Branch(时间描述只在首访分支)
**时间描述(日落, 走了两小时, 傍晚)只能出现在 `look` 的首访分支里。**
重访同一节点不应再读到"走了两小时才到"——那是首访才成立的。模块化用 `look:{first,return}` 或 `look:(S,first)=>...` 把时间描述放进 `first` 分支。

```bash
grep -n '日落\|太阳.*沉\|傍晚\|走了.*小时\|天色.*暗\|天色.*亮' world.js
```
- **PASS:** 所有时间描述都在 `look` 的首访分支(`first` 或 `(S,first)=>first?...`)里
- **FAIL:** 时间描述在无条件文本或重访分支里
- **Method:** 对每个匹配,确认它所在的 `look` 结构把它隔离在首访分支

---

### 21. All Choices Are Meaningful(无零作用 / 假选择)
**同一节点的多条 link 若指向同一 `to` 且 `run` 无差异 = 假选择(玩家选什么都一样)。**
模块化里"有意义"通常体现为 link 的 `run` 改了不同的 `S.flags`/属性,或 `to` 去往不同节点。纯叙事分叉也可接受,但要避免"两个选项导向完全相同的状态与去处"。
**闸**:`graph-audit.mjs`「假选择」——同节点 ≥2 个无 `run`/`requires`/`once` 的纯移动指向同一 `to` → P1。
- **PASS:** graph-audit 不报假选择(或确认是有意的纯叙事分叉)
- **FAIL:** 同一节点 2+ 条 link 同 `to` 且都无 `run` → 选择无意义
- **NOTE:** 旧版"每个选项都要 effects"的硬规则在模块化里软化为"选择要有后果";门控用 `requires`、一次性用 `once`、副作用用 `run`

---

### 22. Ending Nodes Exist and Are Reachable(结局节点存在且可达)
**所有结局节点都必须定义、且从抉择节点可达;结局的视觉/音频由 `scene`/`audio` 意图声明。**
模块化里没有 `SCENE_ZONES`/`ENDING_IDS`/`ENDING_ICONS` 这类全局表——结局就是普通节点(可放在专门的 `endings` 地图),`scene:{region,mood,elements}` 声明视觉意图,`audio:{bgm}` 声明音频意图,图标/标记若需要由插件(参考 `plugins/achievement.js`)处理。
- **闸**:`node core/tooling/graph-audit.mjs world.js` 从 start BFS——结局不可达即报孤儿。
- **PASS:** 所有结局节点已定义、从抉择节点(如 `the_choice`)有 link 指向、graph-audit 报可达
- **FAIL:** 结局缺定义、无入边、或可达性链断裂

---

### 23. Epilogue Covers All Endings(尾声覆盖所有结局)
**尾声节点的 `look` 必须为每个结局分支提供对应文本。**
模块化:尾声节点用 `look:(S)=> S.flags.ending_X ? … : S.flags.ending_Y ? … : …`(按抉择时 `run` 设的结局 flag 选分支),或为每个结局做独立的尾声节点。人工核:每个结局 flag 在尾声 `look` 都有对应分支。
- **PASS:** 尾声 `look` 为每个结局都有条件分支(或每结局独立尾声节点)
- **FAIL:** 缺某结局分支 → 该结局玩家读到错误/空白尾声

---

### 24. Ending Conditional Text Tone Matches Ending Mood(结局条件文本基调匹配)
**结局节点 `look` 里的条件分支基调必须与该结局的情感氛围一致。**

- **PASS:** 悲剧结局 → 反讽/遗憾的分支文本。胜利 → 自豪/感激。中性 → 沉思。`scene.mood` 也应相应(如 `mood:'dread'` 对悲剧)
- **FAIL:** 悲剧结局里出现自信/积极的条件文本
- **Method:** 读每个结局节点 `look` 的条件分支,与该结局主文本 + `scene.mood` 对照

---

### 25. NPC Naming: Not Premature(NPC 命名不提前)
**NPC/物品的正式名,在引入节点之前不得用于叙事文本。**

- **PASS:** 命名节点之前用"那个人"/"那瓶墨水";之后用正式名(参考 `demo`:皮箱先是"一只旧皮箱",`find_case` event 后才入物品名"雷纳的皮箱")
- **FAIL:** 正式名出现在命名节点之前的叙事文本里
- **Method:** 找每个 NPC/物品的命名节点 → grep 其名在所有更早节点的 `look`/`run` 文本里

---

### 26. Post-Climax Node Routing(高潮后节点去向)
**高潮后节点的 link 不应指向高潮前节点。**

- **PASS:** 重大事件(风暴、冲突)后,所有 `to` 去往事件后节点
- **FAIL:** `storm_aftermath` 有 link → `village_conflict`(风暴前)
- **Method:** 画事件时间线 → 核对所有事件后节点的 `to` 目标都是事件后节点(graph-audit 看不出语义先后,需人工)

---

### 27. Softlock Check(死锁检查)
**每个非结局节点必须有至少 1 条「无条件且非一次性(once)」的可用 link。**
模块化:节点不能所有 link 都挂 `requires`(玩家可能都不满足),也不能让唯一的无条件 link 是 `once`(消耗后重访即卡)。**graph-audit 已自动报「无保底出口」——默认 [P0] 硬拦**;该节点某出口显式标 `lockHint`(有意单程)才降 P1。覆盖"全条件"与"唯一无条件出口是 once"两种,无需手动数 link。
- **PASS:** 无「无保底出口」;或报了但标了 `lockHint`(有意单程)/ 确认条件玩家必能满足
- **FAIL:** 报「无保底出口」[P0] 且该节点门控条件玩家可能都不满足 → 玩家卡死
- **Method:** 工具报后**人工确认**该节点所有可达路径能否满足某条出口的条件——工具只查"有没有无条件且非 once 的出口",不验证条件可满足性(需悲观可达模拟,业界共识性价比太低,见 `module-interface.md` 八)

---

## Audio Checks(音频意图 + 呈现器)

> 模块化:节点用 `audio:{music|bgm, ambient?, sfx?}` 声明**意图**(music 22 预设/Spec/`{midi}`,ambient 13 声景,见 audio-system.md),`present-audio.js` 据名合成。改音色/合成结构=改 **presenter**(`present-audio.js` 的 `BGM_FREQ`/`SFX_SPEC`/`RICH_BGM` 映射表),**`world.js` 里不写 Web Audio 合成代码**。审计分两层:数据层(每节点 audio 意图是否合理)+ 呈现器层(各 bgm 名是否有结构不同的合成)。

### 28–34. 音频渲染(呈现器侧 · 仅改 present-audio.js 时核)
作者只声明 `audio:{bgm,sfx}` 意图、**不写合成代码**;下列全是 `present-audio.js` 的职责,**仅当扩展/审计呈现器时**才需核:每个 bgm 名用结构不同的合成(非只换滤波参数)、weather 切换停旧起新(不双播)、切场清节点(stop+disconnect)、单一 master 增益防削波、`RICH_BGM` 分路附属节点随停、重氛围多音源分层、beach 用粉噪非棕噪。
- **验**:游戏侧跑 `node pipeline/build/build.mjs src/index.html --smoke`(可加载探针)+ **人工听**;呈现器侧的全部合成配方/频率选择/避坑(含上述每条)逐条收在 **`references/audio-system.md`(可选·按需)** + `audio-advanced.md`。
- **PASS:** 各 bgm 名合成结构不同、无双播/节点泄漏/削波
- **FAIL:** 按 audio-system.md 对应配方在 presenter 层修(`world.js` 不动)

---

## Visual Checks(视觉意图 + 呈现器 + 构建产物)

> 模块化:节点用 `scene:{region,mood,elements:[{kind,ref,state}]}` 声明视觉**意图**,`present-svg.js` 据 `region`(背景色 `REGION_BG`)/`mood`(色调覆盖 `MOOD_TINT`)/`elements`(图元)画图。改某 region 配色 = 改 `present-svg.js` 的映射表,**`world.js` 里不写 SVG**。构建产物的 CSS/响应式/可访问性检查针对最终 HTML。

### 35. All CSS IDs Match HTML Elements(CSS id 对应 HTML 元素)
**闸**:`assembly-probe.mjs` 查 DomPresenter 标准挂载点齐全 + CSS class 近似误写(命名接缝,见 design-principles §9);泛化的「每个 CSS `#id` 都有对应元素」仍可 `comm` 两份 id 清单人工核。
- **PASS:** 探针不报缺挂载点/class 误写;无 CSS 选择器指向不存在的元素
- **FAIL:** CSS 选择器指向不存在的元素(效果静默失效)

---

### 36. prefers-reduced-motion Disables Animations
**所有 CSS 动画与 present-svg 注入的 SMIL `<animate>` 都必须可禁用。**
- **PASS:** 构建产物有 `@media (prefers-reduced-motion: reduce)` 块禁用所有动画(含 SMIL)
- **FAIL:** 无 reduced-motion 支持

---

### 37. Mobile Layout Works at 375px(375px 移动布局)
- **PASS:** 375px 宽下无横向滚动,正文/选项不被挤压,`#plugin-bar` 内的存档/地图/成就/重开按钮仍可见可点;浮窗不遮死关闭按钮
- **FAIL:** 375px 宽下内容溢出,或为省空间隐藏低频插件按钮导致功能不可达

---

### 38. Touch Targets >= 44px(触控目标)
- **PASS:** 触屏可交互控件命中高度 ≥ 44px(推荐 48px);共享 skin / 插件按钮不得在窄屏缩到 32px
- **FAIL:** 任何触屏交互元素 < 44px,或通过窄屏断点把插件按钮缩成难点的小图标

---

### 39. SVG Filter ID ↔ Reference Match(SVG 滤镜 id 与引用匹配)
SVG 由 present-svg 程序化生成,filter `id` ↔ `url(#id)` 引用都在呈现器内(作者不写);扩展 present-svg 时要对上,配方见 `references/visual-advanced.md`(可选·按需)。仅当构建产物里有手写 SVG filter 才需人工核 id 匹配。
- **PASS:** 无对未定义 SVG 滤镜的引用
- **FAIL:** `filter="url(#glitch)"` 但无 `<filter id="glitch">`(若来自 present-svg,在呈现器修)

---

## 修改分层(改哪一层)

审计发现问题后,按层修(参考 SKILL 的修改分层指引):
- **玩法机制** 缺陷(门控、一次性、回合)→ 模块层(若超出现有模块能力)
- **内容 / 结构**(死链、孤儿、文本、条件、首访/重访)→ **`world.js`** 数据
- **表现**(配色、音色、过渡、SVG 图元)→ **presenter** 映射(`present-svg.js` / `present-audio.js`)
- **核心不碰**(`engine-core.js`)——审计问题几乎从不需要改核心

改完 `world.js` 后**重新构建** `node pipeline/build/build.mjs src/index.html`(可加 `--smoke` 跑 jsdom 可加载探针),再复跑结构/视觉/音频审计。

---

## Final Sign-Off

| Check | Status | Notes |
|-------|--------|-------|
| Dead links (graph-audit 0) | ☐ PASS / ☐ FAIL | |
| Orphan nodes (可达 0 不可达) | ☐ PASS / ☐ FAIL | |
| Flag audit (0 read-never-set) | ☐ PASS / ☐ FAIL | |
| Requires audit (all valid) | ☐ PASS / ☐ FAIL | |
| TODO/placeholder (0) | ☐ PASS / ☐ FAIL | |
| Duplicate paragraphs (0) | ☐ PASS / ☐ FAIL | |
| 一种一种 / 了了 (0) | ☐ PASS / ☐ FAIL | |
| 无效字段 flags_set/effects (0) | ☐ PASS / ☐ FAIL | |
| 无 {{}} 条件标记 (0) | ☐ PASS / ☐ FAIL | |
| once/event 防刷守卫 | ☐ PASS / ☐ FAIL | |
| CSS ID match | ☐ PASS / ☐ FAIL | |
| 枢纽节点首访/重访区分 | ☐ PASS / ☐ FAIL | |
| 结局链完整可达 | ☐ PASS / ☐ FAIL | |
| 音频合成结构区分 | ☐ PASS / ☐ FAIL | |
| 氛围切换不双播 | ☐ PASS / ☐ FAIL | |
| Mobile 375px | ☐ PASS / ☐ FAIL | |
| prefers-reduced-motion | ☐ PASS / ☐ FAIL | |
| Softlock check | ☐ PASS / ☐ FAIL | |
| 无意义/假选择 (0) | ☐ PASS / ☐ FAIL | |
| 呈现器过渡无陈旧 fade 状态 | ☐ PASS / ☐ FAIL | |

**P0 必须 PASS;P1/P2 必须修复或写明有意接受;人工项必须已复核后再交付。**
