# 谜题与小游戏(puzzles & mini-games)

> 做"组合锁 / 序列谜题 / 撬锁检定 / 实时小游戏关卡"时读本文。
>
> **第一人称空间谜题先分流**：需求包含“机关迷宫 / 空间分支 / 走廊里找多项线索 / 第一人称符文锁”时，不用下面普通 scene 节点锁；先读 `examples/maze3d/references/maze3d-authoring.md` §5.5–§5.6，并从正式 Recipe 3 分支仪式库复制 `grid/events/pages/puzzle/set/warp/turn` cookbook。它仍是现役 maze3d 私有数据，不是 custom puzzle module。
>
> **核心立场:小游戏 = 一等可组合内嵌玩法模块**——和 text-adventure(scene)/ tabletop(encounter)是**同一等机制**,可与正常玩法在同一部游戏里组合内嵌(混合游戏)。组合范式就一种、好记:**① 复用同一状态机循环 ② 结果写回共享 state ③ 主线用门控读结果分流**(与 Ink tunnel / RPG Maker 开关回主线 / Ren'Py call screen 同构)。
>
> **分层(便利 ↔ 自由,不是二选一)**:
> - **§A 声明式主路径(便利·覆盖绝大多数)**:组合锁 / 序列 / 检定 = 节点图 + 门控,**零引擎改动、继承结构闸**,照抄即可。先看这里。
> - **§B 自定义模块逃生口(自由·罕见)**:真·实时 arcade(贪吃蛇那类)写一个自定义玩法模块(经 `manifest.modules` 平权注册,与内置模块同一等),**引擎一行不加**;可任意自行设计。范例:`examples/arcade-demo`(最小贪吃蛇,照抄改 `stepLogic/draw` 即换成你的小游戏)。
>
> **诚实边界(先记住)**:结构闸(graph-audit/装配探针)只保证**图可达 + 装配不崩 + 死读检查**,**不验证谜题逻辑可解性**(密码能否凑出、序列能否走通)、也**玩不了实时 loop**(探针 stub 掉 rAF)。逻辑可解 / 关卡可玩靠你写对 + 人工试玩 + 真机核,不靠闸。

---

## §A 离散谜题(常用·零代码·节点图写法)

业界(Inform 7 / ChoiceScript / Ink)一致:离散谜题 = 状态变量 + 条件分支,引擎不为谜题加专门 API。Amatlas 同理——`world.initState` + `links`/`exits` 的 `requires`/`run` + `flags`。

### A.1 组合锁 / 拨号锁

```js
// world.initState: { dial:'', code:'4271' }   ← 目标密码声明在 initState
'safe-room': {
  kind: 'scene',
  look: (S) => `保险箱面板显示:${S.dial || '----'}`,
  links: [
    { label:'按 4', run:(S)=>{ S.dial = (S.dial + '4').slice(-4); } },
    { label:'按 2', run:(S)=>{ S.dial = (S.dial + '2').slice(-4); } },
    // …更多数字…
    { label:'清空', run:(S)=>{ S.dial = ''; } },                       // ⚠ to:self 清零 —— 不是逃生口!(见 A.4)
    { label:'开锁', to:'vault', requires:(S)=>S.dial === S.code },      // 通关出口(条件)
    { label:'离开房间', to:'corridor' },                                // ★ 逃生口:无条件 + to 别的节点
  ],
}
```

### A.2 有序序列 / Simon 谜题

一个 `step` 计数器 flag;每步判断当前 step、对则 +1、错则重置:

```js
'rune-door': {
  kind:'scene',
  look:(S)=>`已点亮 ${S.flags.seq||0}/3 个符文`,
  links:[
    { label:'按 红', run:(S)=>{ S.flags.seq = (S.flags.seq===0)?1:0; } },   // 第一步对→1,否则重置 0
    { label:'按 蓝', run:(S)=>{ S.flags.seq = (S.flags.seq===1)?2:0; } },
    { label:'按 绿', run:(S)=>{ S.flags.seq = (S.flags.seq===2)?3:0; } },
    { label:'推门', to:'inner', requires:(S)=>S.flags.seq===3 },           // 通关
    { label:'重置', run:(S)=>{ S.flags.seq=0; } },                         // ⚠ to:self 重置 —— 绝不能 once!(见 A.4)
    { label:'退后', to:'hall' },                                           // ★ 逃生口
  ],
}
```

### A.3 张力检定(撬锁 / 黑客)——**用 tabletop,今天已是,净工作≈0**

tabletop 模块就是"风险小游戏"引擎,骰子翻滚/暴击动画已提供撬锁那种触觉戏剧性(细节见 `modules/tabletop/references/tabletop-design.md`):

```js
'locked-door': {
  kind:'encounter',
  checks:[{
    skill:'lockpicking', dc:12, dice:'2d6',
    cost:{ res:'lockpicks', amount:1 },
    success:{ text:'锁芯一转,门开了。', to:'beyond' },     // success.to/fail.to = 检定结果直接移动
    fail:{ text:'撬针断了。', set:{ alarmed:true } },
  }],
  exits:[{ to:'corridor', label:'放弃,走开' }],            // ★ 逃生口(移动用 exits;encounter 的检定+exits 都被闸认作可达边)
}
```

### A.4 两条硬约束(红队实证·照做否则真 soft-lock 闸抓不到)

**约束 1 —— 逃生口必须「无条件 + `to` 指向别的节点」**:
- `graph-audit` 的"无保底出口"判据**不区分 `to:self` 与 `to:别的节点`**。所以 `{to:self 清空}`/`{to:self 重置}` 会被误当成"保底出口"、**掩盖真 soft-lock**(玩家不知道密码就只能原地循环,而审计报零问题——实证:只有 `{to:self 拨号}{to:self 清零}{to:vault requires:()=>false}` 的节点 graph-audit 报"零问题",其实是死局)。
- 每个谜题节点**必须**至少一条逃生口:**无条件**(无 `requires`/`available`)、**非 `once`**、且 **`to` 指向别的节点**(不是回到自己)。

**约束 2 —— reset / 清零出口绝不能 `once`**:`once` 消耗一次后该边失效,玩家重置一次就再也不能重置 = soft-lock,且静态闸抓不到。

> 这不是"闸会帮你拦",而是"闸在这一类恰好失明,所以你必须自己照做 + 人工试一遍能不能走出去"。

---

## §B 实时 arcade(自由层·罕见·自定义玩法模块)

要做**真·实时小游戏**(贪吃蛇/躲避/计时反应)作为关卡时用本节。引擎**不内置具体小游戏**(那会把玩法锚死成几个成品)——你写一个**自定义玩法模块**:它和 text-adventure/tabletop 用**同一等机制**(`engine.use` / `manifest.modules` + `nodeKinds` 路由),核心零改动,你可任意自行设计。这是业界共识(Ren'Py CDD / PICO-8 `_update/_draw` / Decker contraption / WarioWare 函数指针表全是此路:薄 host + 作者填逻辑 + 范例,无人内置小游戏目录)。
**先按玩法类型选可跑范例**：离散格子的最小贪吃蛇照抄 `examples/arcade-demo`，改 `snake-module.js` 的 `stepLogic`/`draw`；需要固定 tick、tile AABB、跑跳、弹池与关底清关的 2D 横版起点，读本节 B.8 并从 `examples/sidescroller` 复制。两者都是 example 私有自定义模块，不是内置公共玩法；通用做法见 `plugin-development.md` Level 3。本节讲实时岛**特有的隔离纪律 + 桥回边界**(照做才保住可测/可审计/无障碍)。

> ⚠ **能力边界(必须知道)**:装配探针把 `requestAnimationFrame`/`setTimeout`/`setInterval` 全 stub 成空操作 → **探针玩不了你的实时循环**。所以对 arcade 节点,**"三闸通过 ≠ 关卡能玩"**——探针只能证 boot 不崩 + 逃生口真实可走,**证不了小游戏可通关**。可玩性靠你写可测逻辑核(B.3)+ 人工试玩 + Edge headless 验离线可玩。

### B.1 隔离纪律(Bitsy / Ren'Py 同款·破之则失确定性/可测/存档)

实时层只做两件事:**(a) 固定帧率渲染/动画 (b) 采集输入**。世界状态只在离散边界变:

1. **loop 只读 `api.state` 一次**(进入关卡时),小游戏内部态留**模块局部变量**(类比骰子的待定值,不入档)。
2. **绝不在 rAF loop 里持续写 `engine.state` 或调 `render()`** —— 那会撕裂"View=f(State) 离散快照",破坏存档与确定性测试。
3. 只在「**通关 / 认输 / 退出**」三个离散边界各调**一次** `api.apply(...)` 回写。
4. **存档只存"是否通关"布尔**,不存中途态(中途刷新=从头玩该关,符合街机语义)。

### B.2 桥回边界：只在离散结果时 `api.apply({run})`；图边继续写在 `node.links`

推荐把通关目的地继续声明在普通 `node.links`，实时 loop 只在胜利边沿经 `api.apply({run})` 一次写 durable 结果；模块的 `actions()` 根据该结果暴露对应 link。这样 graph-audit 从 world 的真实 links 收图边，runtime 不另藏一条不可见目的地。若你的自定义模块确实选择“胜利立即跳转”，才用 `api.apply({to,run})`，并确保同一个 `to` 仍在 world 数据中有可审计来源。

```js
// ✅ 推荐:loop 通关边沿只写结果；world 的 links 已声明真实目的地
function onWin() {
  running = false;                                   // 先停 loop
  api.apply({
    run: (st) => { st.flags.arcadeWon = true; }      // 只写一次 durable 结果
  });
  // actions() 重算后，node.links 中 requires arcadeWon 的标准出口出现
}
```

```js
// ❌ 禁止:monkey-patch 引擎公共 API(脆弱、不可审计)
api.apply = function(action){ /*…*/ };
// ❌ 禁止:loop 里裸改 engine.state(引擎全盲、破坏离散快照与存档)
api.state.flags.won = true;
```

小游戏内部若需随机,用 **`api.rng`**(种子 PRNG)而非 `Math.random` → 逻辑核可复现。

### B.3 可测逻辑核(Ren'Py CDD 教训)

把小游戏逻辑写成**与 engine/DOM 隔离、按固定 tick 可重放的逻辑核**。它可以返回新对象，也可以像 `examples/sidescroller` 一样原地更新会话私有 `sim`；关键不是函数式语法，而是相同编译计划 + tick 输入得到相同结果，且逻辑核不碰 engine/DOM/rAF：

```js
function step(sim, input) {              // 固定 tick；只改会话私有 sim
  // …整数/确定性推进…
  return sim;
}
```

这样即便装配探针玩不了 rAF,逻辑核**仍能用固定 dt + 种子 rng 单测复现**。reduced-motion / 探针直接落最终态(沿用骰子 resting=真值纪律)。

### B.4 无条件认输出口(替代"探针豁免"·关键)

arcade 节点**必须**写一条**普通无条件认输/跳过 link**(数据驱动真出口):

```js
'arcade-snake': {
  kind:'arcade',                                    // 自定义 kind,经 manifest.modules 注入
  links:[
    { label:'通关后继续', to:'level-cleared', requires:(S)=>S.flags.arcadeWon },  // loop 置 flag 后才亮(主要给图可达性)
    { label:'放弃本关,直接走', to:'gave-up' },        // ★ 无条件、to 别的节点、非 once
  ],
}
```

- graph-audit:`gave-up` 无条件非 once → 认作**保底出口**、零 P0;两个 `to` 目标都被静态边收 → 无 orphan。
- 装配探针:`gave-up` 无条件 → 第一步就走出去 → **零误报**(不需要任何"arcade 豁免"机制)。
- ⚠ **认输口必须无条件裸写**:别写成 `{to:'retry', requires:(S)=>!S.flags.won}`——这种**有条件**写法会被渲成 locked、被探针滤掉 → 探针走不出 → **误报 soft-lock P0**(红队实证)。

### B.5 canvas 挂载:用 present-dom 不碰的专用挂载点

present-dom 只管 `#mapname/#place/#look/#choices/#status`(每帧清空重建)。**canvas/小游戏 DOM 必须挂在 present-dom 不碰的专用挂载点**(否则每帧被冲掉):

```html
<!-- index.html:加一个 present-dom 不管的挂载点 -->
<div id="arcade-stage"></div>
```

```js
// 自定义 arcade 模块(完整接口见 plugin-development.md Level 3)
function createArcadeModule(opts) {
  var api = null, running = false, rafId = 0;
  var mod = {
    id:'arcade', nodeKinds:['arcade'],
    render: function(state, node){
      return { title: node.title || '小游戏',
               body: [{ type:'prose', text:'小游戏进行中——如果画面没出来,点下面"放弃本关"。' }],
               status: [] };                         // ← 别用 {type:'canvas'}!present-dom 不认,只渲染空 div
    },
    actions: function(){ return []; },               // 移动靠 node.links(认输口);此处无额外动作
    install: function(a){
      api = a; a.registerModule(mod);
      a.on('enter', function(ev){
        if (!ev.node || ev.node.kind !== 'arcade') { running = false; return; }
        var stage = (typeof document!=='undefined') && document.getElementById('arcade-stage');
        if (!stage) return;                          // 无挂载点 → 优雅退化(玩家用认输口离开)
        // …建 canvas、读 api.state 一次、起 rAF loop(用 step() 推进)…
        // …通关 → onWin()(B.2);认输由 node.links 的"放弃本关"走标准移动…
      });
    }
  };
  return mod;
}
// game.js:engine = Amatlas.boot(WORLD, { modules:[ createArcadeModule({}) ], … });
```

### B.6 无障碍(实时关卡必做·WCAG SC 2.2.1)

> 注:计时可调是 **WCAG SC 2.2.1 (Timing Adjustable, Level A)**(不是 2.2.2,那是 Pause/Stop/Hide)。

1. **默认可跳过**:认输口(B.4)= "放弃 → 纯叙事路径";把实时纯当装饰增强,而非通关必需(比 Hi-Fi Rush 更激进——它因节奏挑战不能整段跳过被无障碍媒体点名)。
2. **计时可调/可关**(SC 2.2.1:可关闭 / 可调至默认 10×):若有计时。
3. **reduced-motion 落最终态**:`prefers-reduced-motion` 剥动画、落最终值(沿用骰子/SMIL 纪律)。
4. **存档语义 LOUD**(Ren'Py 教训):进关卡前**显式告知玩家"本局中途态不会保存"**——蛇身/苹果/计时等局部态不入档,中途离开或刷新会重玩本局;外层通关标记、失败计数等 Amatlas state 仍可保存。不告知=fail-silent 落到玩家身上。

---

### B.7 挑战引入(opt-in)+ 限次锁死必 fail-forward(范例 `examples/arcade-demo`)

调研(WarioWare / Yakuza / Ren'Py / Skyrim / Disco Elysium / LucasArts / NSMB Super Guide / Hades)归纳两条:

**① 进入挑战是 opt-in,不是"踏进节点就开打"**(治"猝不及防自动起局")。
- 别让 `enter` 即起 loop。**最简法=前置一个 ready/待机屏 scene 节点**:讲清目标(吃满几个/几位密码)、操作、**"本局中途态不保存、外层结果会保存"(LOUD)**,给「开始挑战」(→ 真正的 arcade 节点,模块这时才起局)和「再想想,离开」(无条件保底口)。`examples/arcade-demo` 的 `terminal-intro` 即范本。
- 首次完整说明、之后简短:`initState` 一个 `seenRules` flag + ready 节点 `look:(S)=>S.seenRules?简短:完整`,「开始」link 的 run 置 true(对应 Tomb Raider 首次教程后可跳)。
- ⚠ ready 屏的「开始」必须真 `to` 到挑战节点、「离开」真 `to` 出去;别写成 `to:self` 循环或 `once`(否则把"准备"步骤变成新死局)。

**② 限次/锁死必须 fail-forward——锁一扇门 = 同时开另一扇,绝不接死墙**(铁律级)。
- 这是无死路哲学在挑战设计上的体现。**反例**:Disco Elysium 的 Shivers bottleneck(主线唯一解、不过就卡死)被公认是 fail-forward 破功;限次直接接 game over = LucasArts 无死路反面教材。
- **正解(任选,均纯数据 + 模块边界回写,零引擎改动)**:
  - **冷却**(FO4/DXHR):`initState{tries:N}`,失败 `run:S.tries--`,重试口 `requires:S=>S.tries>0`(灰显而非锁节点);**无条件认输口始终在**。
  - **降级岔路**(推荐,arcade-demo 用法):失败 N 次后这个选项**锁死**(模块读 `state[failKey]>=node.lockAfter` 不再起局、render 显 lockedText),**同时**一条 `requires:(S)=>S.failKey>=N` 的**降级出口**解锁(如「撬开面板硬闯,警报会响但门开了」→ 通关节点)。"锁住技巧门 = 开蛮力门"。
  - **难度缓解 / 自动通关**(Celeste/NSMB Super Guide):失败越多模块把速度调慢/目标降低/给无敌,或开一条「终端自动跑一遍」的放行出口。
- **失败计数用顶层 state 键 + `initState` 声明**(如 `snakeFails:0`)→ graph-audit 死键检查跳过(零误报),模块在"撞死/认输"离散边界 `api.apply({run:S=>{S[failKey]++}})` 回写(同 winKey 固定形态)。
- **清晰呈现剩余次数**,别让锁死显得像 bug(arcade-demo 在 HUD 显"还可重试 N 次"/"锁死了——看下面的选项")。

正式 R·06 范例把 `world.seed` 显式写为固定整数，并用公开方向输入完成真实 `goal:5`：HUD 稳定观察 `1/5…4/5`，第五果与 `stop()+api.apply` 在同一 rAF task，完成证据改看 stage 清理、`ACCESS GRANTED` 与标准 link 解锁，不强截瞬时 `5/5`。这是**测试可复现纪律**，不是让所有小游戏照抄同一 seed/路线：你的玩法应自己选 seed/输入计划；浏览器测试不得改 goal、覆盖 `api.rng`、注入目标或读写引擎私有状态来伪造通关。

**自检铁律(每个限次/检定/小游戏门控节点)**:失败 / 次数耗尽后,本节点是否仍有**一条无条件、非 `once`、`to` 指向别处**的出口?有=合规(限次=岔向);无=soft-lock,graph-audit 无保底出口 P0 会拦。

### B.8 2D 横版固定 tick 切片（实验性 example，不是公共模块）

`examples/sidescroller` 与第二客户 `examples/sidescroller-frostline` 复用同一个 example 私有 runtime，是比贪吃蛇更严格的一组实时岛教学材料。两份作品证明现有闭合数据面可以换 UUID、地图、参数、目标 ID 与清关出口；它仍不是公共模块，也不承诺超出这条窄 profile：

- 作者数据只有闭合的 `viewport/map/player/sentry/clear`，武器参数嵌在 `player.weapon`；还可选 `presentation:{profile:'coast'|'frost'}` 选择整套表现，缺失时走不猜题材的私有 `neutral` 兼容 preset。`rows` 是等长 `.`/`#` tile，`clear.defeat` 必须引用 `sentry.id`，`clear.exposeLink` 必须引用真实 `node.links[].id`。
- `coast` 适合海岸设施/工业海堤，`frost` 适合极地中继/冰原设施；只选最接近的协调套件，不自创 profile，也不增加 palette/sprite/VFX/SFX 字段。背景、地形、角色、目标、HUD 与 `shot/hit/hurt/clear` 短音都由 runtime preset 成套拥有；声音无 Web Audio 或处于静音偏好时会静默退化，作者没有音频旋钮。
- 禁写 `onTick/update/think/steer/collision/onHit/onDamage`、作者 rAF/timer、函数式 spawn 或每帧坐标更新；这些细节由私有 runtime 的固定 `60Hz` tick、整数定点、逐轴 tile AABB、稳定弹池和微步碰撞负责。
- 活动 `sim` 只在节点会话内；只在哨戒炮被击毁的离散边沿一次 `api.apply({run})` 写 durable clear。玩家死亡只重开 local sim；durable clear 重进不得复活炮。
- 至少保留一个无条件 abort link；主要 clear link 在胜利前由模块 `actions()` 隐藏，胜利后仍走标准 link 导航。
- 当前玩法 profile 只有“跑/跳/向右半自动射击/单固定目标/死亡重开/清关”；HP、速度、伤害和目标 ID 可由数据调整，但**没有** waves、boss phases、拾取、多武器、checkpoint、shmup 或 beat-em-up profile。不要把内置表现 SFX 误认成作者音频系统，也不要根据文件名猜这些能力存在。
- 两个 world 各自只有一个 sidescroller 关，runtime 的 durable 完成键仍是 `sidescrollerCleared`；同一 world 需要多关独立完成态时不要硬套，先回模块设计。

复制前先同时读 `examples/sidescroller/world.js`、`examples/sidescroller-frostline/world.js` 与唯一 `examples/sidescroller/sidescroller-module.js`。只复制作品壳和 world，直接引用该 runtime，**不要复制/fork runtime**；修改数据后运行：

```bash
node examples/sidescroller/test/sidescroller.test.cjs
node examples/sidescroller-frostline/test/second-client.test.cjs
node core/tooling/graph-audit.mjs <你的项目>/world.js
node core/tooling/assembly-probe.mjs <你的项目>/index.html
node pipeline/build/build.mjs <你的项目>/index.html <你的项目>/dist/index.html --smoke
```

三闸不能玩 canvas/rAF；最终仍要用真浏览器走键盘和窄屏触控的通关、死亡、重开、离场/重进，确认零 pageerror/console.error/远程请求。

---

## 为什么不内置"arcade 模块"(留痕·防误解)

不内置的真因 = **§10 反过度工程 + §11 不锚定 + 触发器未到**(escape hatch 已能支持),**不是**"rAF 非确定/探针盲破确定性"——确定性在"内置"与"escape-hatch"之间**无差别**(两形态实时层都跑 rAF、探针都失明),真正保住确定性的是 §B.1 隔离纪律 + §B.4 数据驱动逃生口。触发器=**≥2 个真实游戏反复重抄一大段隔离样板**时,才评估内置 module(届时契约设计稿先行 + 用户拍板)。设计稿全文见 `docs/minigame-design.md`。
