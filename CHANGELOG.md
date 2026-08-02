# 更新日志 · Amatlas 引擎

本文件记录 Amatlas 引擎的显著变更,遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本 SemVer](https://semver.org/lang/zh-CN/)。

> **版本轴说明**:发布号遵循 SemVer。**0.x 阶段**公共 API 尚未冻结,破坏性变更可以落在次版本(0.y);升级前请读目标版本的变更说明。

## [Unreleased]

## [0.4.3] — 2026-08-02

本补丁把实验性 2D 横版切片的第二个独立作品与复用边界随包交付，并修正死亡重开输入生命周期；公共 core、`module-interface.md`、compiler、presenter、存档格式与公共作者 API 均不变，横版 runtime 仍是 example-private。

### 新增
- **极夜霜线第二客户**：新增 `examples/sidescroller-frostline/`，用独立 UUID、地图、玩家/武器/目标参数和清关链接直接复用唯一 `examples/sidescroller/sidescroller-module.js`。Showroom 在实验性切片分区增加霜线入口，并继续明确两款作品都不是正式 reference 或公共模块。

### 修正
- **死亡重开清除 held input**：玩家阵亡后点击“重开本局”会先清空移动、跳跃与射击输入闩，再重建 local simulation；按住屏上方向键死亡并立即重开时不再从出生点自行滑走。首作专项和两作 source/built 真浏览器路径共同锁定该生命周期边界。
- **私有 runtime 可见文案去首作化**：runtime 自带 HUD 与说明改用“固定目标/清关出口”等玩法中性词，不再把任何复用作品显示成海堤或哨戒炮；首作题材仍由自己的 world 数据表达。

### 作者体验
- **窄横版 profile 优先复用**：Claude/Codex 作者入口现把“跑/跳/向右半自动射击/单固定目标/死亡重开/清关”路由到两份现役 example 和唯一私有 runtime；只有波次、boss、多武器、斜坡、checkpoint 等超界需求才进入新模块开发。随包指引明确闭合 schema、无条件撤退出口、runtime 单源和 graph/assembly/build 验证命令。

### 工程
- **第二客户与移动端回归**：新增两客户参数/地图/clear 差异、冻结 runtime SHA、30/60/144Hz 确定性与错误边界专项；required Chromium 覆盖桌面移动/跳跃/清关、390px 触控移动/开火/清关、按钮 ≥44px、不遮 canvas/HUD/出口、真实出口点击和 source/built 死亡重开。

## [0.4.2] — 2026-08-01

本补丁加固 AI 作者跨会话恢复、旧作品安全门和 Claude/Codex 入口所有权；不改变 runtime、compiler、presenter、公共作者 API、玩法数据、存档格式、core 或 `module-interface.md`。

### 安全
- **作品 current 有界且绑定项目内原文件**：根 `PROGRESS.md` 采用唯一 marker current，整文件最多 64 KiB，只接受项目树内普通文件。合法 current 在 world 创建前后均完整恢复；legacy、损坏、超限、非普通与 tree-external 文件只报告状态、零正文。读取同时把已验证对象身份绑定到实际打开的 descriptor，终项或父目录 pathname 替换不能把树外正文注入 SessionStart 或 PreCompact。
- **恢复子进程和快照失败不再失控**：SessionStart / PreCompact 的 Git 调用及 wrapper baseline 检查均有 timeout 与输出上限，并区分超时、缓冲区溢出、执行失败和普通非零退出。PreCompact 继续原子替换本次快照；写失败会保留旧目标并用非阻断 compact 的可见错误退出。
- **新游戏不会继承归属不明的旧状态**：`/new-game` 发现 `src/world.js` 或 pre-world 根 `PROGRESS.md` / `canon.md` 任一存在时，都会先停下选择继续、归档或明确覆盖，并逐一处置根 current/canon；确认属于旧作的随旧作归档或在覆盖确认后移出根目录，确认无关的保留，归属不确定则停下询问。

### 改进
- **AI 作者入口按需分层且单一所有者**：Claude Code 与 Codex 共享短 `AGENTS.md` 工具中立边界，Claude 专属 `CLAUDE.md` 只叠加 commands/hooks；完整工作流、可执行模板、能力细节和 current 格式分别由 skill、正式 example、references 与 `docs/progress-format.md` 拥有。独立包根提供可直接运行的 Codex mirror sync/check 命令，减少启动上下文重复和旧指引复活。

## [0.4.1] — 2026-07-31

本补丁修正高层 cutscene 下游作者旅程中的通用构建烟雾误报；不改变 runtime、compiler、公共作者 API、core 或 `module-interface.md`。

### 修正
- **通用 smoke 识别融合 cutscene 推进面板**：`smoke-harness` 现把现役 `[data-cutscene-next]` 正文面板视为可点击入口，不再误拒首拍只有融合推进控制的纯 cutscene 游戏；普通按钮、作者 links 与错误通道行为不变。

## [0.4.0] — 2026-07-30

本版新增面向 AI 作者的高层 cutscene 演出编排入口：作者声明角色、具名舞台位置、shot 与闭合语义动作，compiler 确定性生成现役低层 beats。完整低层 motion/cast/speaker 继续作为专家 escape hatch；公共 core、`module-interface.md` 与 playback envelope 均不变。

### 新增
- **高层演出编排 compiler**：新增公共作者入口 `Amatlas.CutsceneAuthoring.compilePerformance(spec, options?)`，用版本化 actor / `cutout-biped-v1` profile / anchor / shot / cast / sequence 描述演出，并确定性 lower 到现役 cutscene beats。V1 提供 `enter`、`walkTo`、`lookAt`、`pointAt`、`say`、`caption`、`wait`、`exit` 八种闭合动作；资源 claim、slot capacity、stage typestate、shot-exclusive 文本、稀疏数组与每 shot 512 action 预算均在编译期带稳定错误码和路径拒绝，不把冲突或无界同步计算留给播放/构建期。

### 改进
- **正式范例 dogfood 高层入口**：`examples/cutscene-demo` 用公共 compiler 演示 walk → point、caption 与 say，同时保留一段完整低层 beat 作为专家 escape hatch 对照。source / built 装配测试锁 timeline → compiler → world 顺序、compiler 内联与零外链，浏览器旅程覆盖动作中点/终点、逐字正文、restore / replay 与 reduced-motion 生命周期。
- **作者入口收口**：cutscene 手册、README、AGENTS 与 Claude/Codex skill 统一把高层 spec 作为常规语义入口，把 `beat.motion/cast/speaker` 定位为按 beat 边界混排的专家逃生口，并同步正式脚本闭包与 focused compiler / 三道闸验证指针。

### 修正
- **逐字 restore 与 Segmenter 单一真相**：same-node restore 会按 playback manager generation 重建 typewriter consumer，不再复用失效注册；字素切分只由编译期 `Intl.Segmenter` fail-loud 完成，DOM 消费 normalized grapheme plan，不再二次探测后静默补全文。
- **不可变计划与毫秒精度**：motion / reveal normalized plan 现递归冻结，作者源对象后续 mutation 不会污染已编译计划；秒转整数毫秒会吸收 IEEE-754 表示噪声，使合法三位小数稳定回环，同时继续拒绝更高精度作者时间。

## [0.3.2] — 2026-07-28

本补丁收紧自定义玩法与演出装配的 fail-loud 边界，修正媒体资产检查和 Showroom 静态 Gallery 的焦点行为，并同步现役 cutscene 作者指引。公共作者数据、core 与 `module-interface.md` 均不变。

### 修正
- **maze3d 装配不再假绿**：`assembly-probe` 会核对显式或默认挂载点；无 DOM 环境也会先校验私有 combat 数据，再做合法退化。缺少 canvas 容器或非法武器 kind 不再被三闸误判为可交付。
- **cutscene 分支演出完整预检**：官方 `A.boot` 路径现按世界结构遍历所有可达 rich cutscene 分支，若 `motion/cast` 缺少 SVG presenter、禁用了 SVG 或缺少 `#scene`，会在装配阶段直接指出，避免只在首个贪心分支通过。
- **tabletop 后果字段别名 fail-loud**：graph 与 runtime 同时拒绝 `checks[]` 中的 camelCase/snake_case 旧式后果字段及 `modifiers`，并在错误中给出完整路径；现役 `success/fail` 对象不受影响。
- **媒体 `src` 检查覆盖完整 HTML 语法**：build 对 `img/audio/video/source` 统一复用属性解析器，单引号、双引号和裸值的本地或联网引用都会得到一致的 P1 自包含警告；`data:` 与锚点仍合法。
- **Showroom 静态 Gallery 不再抢焦点**：maze3d 的静态预览 canvas 不再进入 Tab 顺序、主动聚焦或把 iframe 滚到末尾；正式可操作迷宫仍保留键盘焦点，动态无控件展示仍保持动画。

### 作者体验
- **cutscene 推进口径同步**：`/new-game` 与 Claude/Codex 主 skill 现统一说明首拍和中间拍由正文面板即时推进，支持点击或聚焦后按 Enter/Space，DOM 不显示独立 `▸`；正式 demo 末拍文案也不再引导不存在的按钮。

## [0.3.1] — 2026-07-28

本补丁纠正 0.3.0 对“按钮融合”的误解：不再保留独立 `▸` 推进按钮，cutscene 正文面板本身成为可点击、可聚焦、可用 Enter/Space 操作的唯一推进控制。公共作者数据、core 与 `module-interface.md` 均不变。

### 改进
- **cutscene 推进融合到正文面板**：runtime 仍保留内部 `cutscene:next` 动作,DOM presenter 不再把它渲染为 `#choices` 中的独立按钮；`#choices` 只显示真正的作者 actions/links。唯一可用 next 存在时,`#look` 获得 button role、Tab 焦点、双态可访问名称和 Enter/Space 两击语义；鼠标/触屏继续遵守 selection、交互后代、修饰键、右键、拖动、取消与长按保护。离场或只剩 links 时会精确解绑并恢复既有属性。同步移除 fixed next、安全区侧向留白、choices 抬层和 toast 让位 CSS；公共 core、`module-interface.md` 与作者字段不变。

## [0.3.0] — 2026-07-27

本版把 Origin 的 rich cutscene 与 maze3d 私有 FPS 提升为完整的主题多武器闭环，并将已深验的 sidescroller 纳入官网第八个试玩；公共 core、boot 与 `module-interface.md` 均不变。0.x 用户升级前须阅读下方 FPS 私有作者 DSL 的破坏性变更。

### 破坏性变更
- **maze3d FPS 私有作者契约 v3 clean cut**：`maze.combat` 从 v2 的单数 pistol/supplies 迁为 `player/loadout/equipped/guard?/pickups?`；武器 kind 只允许固定 `precision` / `scatter`，三类 pickup 覆盖 health、定向 ammo 与唯一新武器。旧 v2 字段会按完整路径 fail-loud，不提供 adapter。`maze.theme` 同时驱动枪体、准星、VFX/SFX、HUD、pickup 与 combat guard，但不改变玩法 trace。该变更只属于随包 `examples/maze3d/` 私有 DSL，不新增或宣传公共 FPS 模块，也不改变 core、boot 或 `module-interface.md`。

### 新增
- **Origin 综合 dogfood 闭环**：`loom` 写下第一条规律后，三种主题各进入五拍 rich seed dialogue，真实覆盖 motion、cast、speaker、stage enter/exit 与对象形 typewriter；随后进入 crystal 主题的 maze3d FPS v3 试炼，以星图刻针、星环共振器、星砂与未定噪声闭合获得、scatter 聚合、切回 precision 和清场 D。场景同时使用 panel/beam/portal/pillars/sigil/ritual_marks 与 sacral/tense BGM；战斗只持久 win/death，装备、弹药、guard 与 pickups 均为 session-local，两条重试都清除旧胜负事实。
- **官网第八个试玩**：已深验的 sidescroller 以“海堤 / 横版射击”纳入官网星图；官网现在是八个 demo，加上独立 Origin hero 共九个可玩顶层入口。Pages 仍由 tracked 首页与唯一 ENTRIES 事务组装，不复制第三份首页。

### 改进
- **cutscene 推进目标稳定**：DOM presenter 为 runtime-owned next 保留原生 button，并提供固定安全区槽位；正文面板的鼠标/触屏便利点击与按钮共用同一两击 helper，第一击只补全文、第二击才推进。文本选择、交互控件、修饰键、非主键、已取消事件、拖动、取消与长按均不会误推进，普通 scene 和只剩作者 links 的末帧不绑定该行为。同节点换拍时仅把旧 next 的既有焦点转给新 next，连续 Enter 不再掉到 body；panel listener 与已有 handler 共存并精确解绑，cutscene 成就 toast 也会上移一个 safe-area next 槽。
- **cutscene 正文空挡收紧**：移除 `#look.cutscene-next-panel` 为固定 next 按钮重复预留的底部 padding；按钮继续占独立 safe-area 槽，正文末尾不再留下与内容无关的大块空挡。

### 工程
- **高价值接缝回归**：新增 Origin timeline/rich/FPS/双端清键/maze runtime 镜像专项和反向变异；现役浏览器 smoke 增加 Origin rich/FPS 胜负、两端重试、连续键盘推进与 toast 命中旅程。Arcade 只把正式 `goal=5` 作为逻辑闸，胜利路径明确标为 goal=1/固定 RNG 的短确定性 probe；三次失败仍走正式数据并验证动态键与 fail-forward。
- **样例身份与作者表面对账**：README、Showroom、maze3d authoring、`/new-game`、Claude/Codex skill 与 AGENTS 同步为实际 rich cutscene + 私有 FPS v3 覆盖；Codex 镜像继续由 `.claude/skills` 单源生成。
- **Windows 包装回归预算对齐**：wrapper 总 runner 为完整 package 行为测试保留 3600 秒上限；直接 package 专项仍用自身逐层预算。只避免当前 Windows 上两次真实打包与解包测试合计超过旧 1800 秒时被外层误杀，不放宽其它测试。

## [0.2.1] — 2026-07-25

本补丁修正 Origin 综合作品中可绕过前两枚星痕直接通关的地图拓扑缺陷，并校准 Codex 作者入口的 0.x 测试版口径；公共 API、存档格式和通用 maze3d runtime 均不变。

### 修正
- **Origin 三枚星痕不再绕序通关**：封闭初始左区直达第三枚的绕路，并让第二枚真正打开通往第三枚的必经格；第一枚只开放第二枚、第二枚只开放第三枚，第三枚最后生成中心门。补入分阶段 BFS、反向开墙变异和完整 Chromium 实走证据，防止只验物件坐标却漏掉地图拓扑因果。
- **Codex 作者指南版本口径**：`AGENTS.md` 的测试版提示从写死的 `0.1.x` 改为覆盖现役测试版轴的 `0.x`；游戏制作与运行时行为不变。

## [0.2.0] — 2026-07-25

本版集中交付两条新的可玩表现力路径：cutscene 私有 timeline/FK rig/typewriter/多角色舞台，以及 maze3d 私有 FPS v2；同时加入实验性 2D 横版射击切片，并完成 Origin 综合作品的拾取物、立柱与视觉可供性修正。公共 core/module-interface 没有被 FPS 或横版私有作者面扩张；0.x 用户升级前需重点阅读下方 maze3d FPS DSL 的破坏性变更。

### 破坏性变更
- **maze3d 私有 FPS 作者 DSL 升级到 v2**：`maze.combat` 现要求 `deathKey/player/pistol`，可选 `guard/supplies/exitRequires`；玩家 ammo/maxAmmo 改为标量，pistol 只保留 damage/range/cooldown/recoil，guard 作者基数收窄为 0..1，supply 删除 id/ammo。旧 `weapons/monsters`、`player.weapon`、对象弹药、`pistol.ammo/spread` 与 supply 引用字段会按精确路径 fail-loud；maze 的 `winKey/scareKey/deathKey` 也会拒绝核心状态字段、原型键与已有非 boolean state 冲突，避免真值对象静默跳过整局。该 clean cut 只影响 `examples/maze3d/` 私有 runtime，不改变公共 core、boot 或 `module-interface.md`。

### 新增
- **2D 横版射击首个可玩切片**：新增 `examples/sidescroller/` 私有 runtime 岛，以固定 60Hz tick、整数定点与 tile AABB 提供左右跑、跳跃落地、横向卷屏和向右半自动射击；固定哨戒炮与双方 3 HP、稳定弹池/微步碰撞、死亡重开及击毁后标准清关链接形成完整小闭环。键盘与 ≥44px 屏上控件共用输入意图，离场/restore 会清理旧 rAF、listener 与 canvas；Showroom 将其独立标为“实验性可玩切片”，随包作者手册给出私有数据/固定 tick/清关边界和验证命令，不新增公共模块或 core 契约。

### 改进
- **视觉可供性原则与 Origin 星痕同族化**：开发设计宪法与 maze3d 作者手册现要求默认的数据角色、形态、尺度、行为不互相误导，并给出 pillar/decor/pickup/marker 角色矩阵；硬闸只禁止当前管线确定画不出的字段组合与强玩法图形自动兜底，显式雕塑/诱饵/巨型物件等创意例外仍可表达。同组物件只需稳定家族线索，不强制同形。Origin 三枚星痕仍选择复用一份本游戏 `star_scar` art，第二枚不再无叙事理由地突变为方形 rune 石板；顺序和功能差异由位置、文本与触发后果表达。
- **maze3d 装饰物不再伪装成钥匙**：仅有贴地碎片外观的 decor family（如 `crystal_cluster`）若错误搭配 `mode:'sprite'`，现在解析期 fail-loud，不再落入 `keyLayers` 金钥匙兜底；Origin 原位置改为真正的程序化 `crystal` 立柱，恢复建筑地标的体量、落地锚定与背景亮度，既消除不可拾取假钥匙，也避免用放大的关键物图标继续误导。
- **maze3d 显眼拾取物主动交互一致化**：`visual:'pickup'` 且含实际事件动作的独立 token 现在靠近时显示“拾取”，可由键盘或触屏立即执行现役事件结算；走进格子的自动拾取仍保留，纯 `examine` 线索仍只显示“查看”。修复另一条真实但不同的星痕近距离交互接缝，不新增作者字段或公共契约。
- **cutscene 语义动作配方教学**：正式 rig-showcase 新增作者侧纯函数，将“走向窗边后抬手指向”编译为现役闭合 Rig，并在随包手册说明这种高层配方模式；不新增 `gesture/action/clip` 字段、公共动作库或 runtime/core 契约，AI 可从可运行示例学习如何把剧情意图落到确定性关键帧。
- **富过场装配 fail-loud**：官方 `A.boot` 作者路径若当前可达 cutscene 声明 `motion/cast`，装配探针现会拒绝缺 `present-svg.js`、显式 `present.svg:false` 或缺 `#scene` 的假成品；纯 typewriter 仍可只用 timeline + DOM。`/new-game`、Claude/Codex skill 与工具中立指南已同步脚本闭包和正式加载顺序。
- **rig 作者预算与 runtime 对齐**：随包 cutscene 手册现明确单 rig 的 base + 全部 variant art primitives 合计上限 `256`、同拍 cast 聚合上限 `512`，preset 按展开后的图元数计入；不再把已实施的 presenter 硬预算误写成“没有另一套数量预算”。
- **rig 设计稿现役入口对账**：开发设计稿新增 `RIG:CURRENT` 权威块，并把 current-facing 单角色完整示例迁为 `beat.cast:[{id,rig}]`；顶层 `beat.rig` 与单数 playback rig 明确只作 C1 历史，wrapper 状态闸防旧 few-shot 再冒充现役。
- **rig/dialogue 成品浏览器回归**：发布前 Chromium smoke 现直接构建 rig-showcase all-in-one HTML，并从公开按钮逐拍验证 typewriter 双态、后续双角色挂载、enter/exit、playback key 换代、旧 stage 清理与 replay；不再只停在源码 iframe 首拍。
- **dialogue 设计稿现役事实对账**：开发设计稿新增 `DIALOGUE:CURRENT` 权威块，并把旧的单数 `beat.rig` 代码事实、“未来实现”管线和 C1/C2 待办措辞改为现役 `beat.cast[].{id,rig,stage?}` / `speaker` / playback cast 与历史验收记录；wrapper 状态闸防双真相回归。
- **animation 设计稿现役事实对账**：开发设计稿新增 `ANIMATION:CURRENT` 权威块，把立项前“motion/typewriter 仍非法”、推荐未来落点与 Phase 1–3 待办措辞归入历史，明确现役私有 playback、共享 rAF、轴向 scale 与 Phase 4b+/5 停止线；wrapper 状态闸防旧缺口重现。
- **完整 maze 变异套件预算对齐**：该专项在当前 Windows 实测约 325 秒，普通 engine runner 的局部预算与候选 payload 统一预算现均为 600 秒，包装行为测试单次等待为 900 秒；其它 suite 仍守常规 120 秒，`ATLAS_TEST_TIMEOUT_MS` / `ATLAS_PACKAGE_TEST_TIMEOUT_MS` 继续可显式覆盖。
- FPS 会话继续只由 `g.combatMonsters` 持有可变 guard 状态，长度为 0 或 1；内部 guard id 固定为 `guard`，玩家 HUD 使用通用“守卫”文案。正式 Recipe 5、作者手册、新游戏路由、Claude/Codex skill 镜像与 browser smoke 数据路径已同步到 v2；零 guard 训练场合法，`exitRequires:'clear'` 则必须声明 guard。

## [0.1.2] — 2026-07-19

引擎系统性复审与性能打磨(补丁版本,无破坏性变更;从 0.1.0 / 0.1.1 直接升级即可)。本版收口了一轮覆盖契约、核心、呈现层、玩法模块、示例与构建 / 发布线的增量复审,修正了一批边界、一致性与安全问题,并做了保持行为不变的性能优化;发布前经强 / 弱两个 AI 模型端到端走查验证。

### 安全
- **修正一处属性型 XSS**:场景骰子元素 `scene.elements` 的 `dice.sides` 缺正整数校验时可被构造出注入面;现改为严格正整数校验,关闭该注入路径。用到骰子元素的游戏建议升级。

### 改进
- **伪 3D 迷宫更流畅**:`examples/maze3d/` 的怪物寻路改为仅在玩家 / 怪物跨格时重算(不再每帧重复计算),并复用逐帧深度缓冲——画面与玩法逐格不变,弱设备上更省 CPU。
- **音频进场更顺**:程序生成的环境噪声改为按音频上下文缓存,不再每次播放环境音都重新逐样本合成,减少进入场景时的卡顿(声音字节不变)。

### 修正
- **数据校验更严(fail-loud)**:补齐存档 `rngSeed`、模块 `systems`、`compose-music` 规格等若干非法输入的即时报错,避免坏数据被静默接受后在后续环节出问题。
- **过场演出**:修正播放计时在特定收尾 / 读档路径下可能重挂计时器,以及末拍出口门控的边界问题。
- **音频**:修正环境声重复启动的幂等性与一次性音效的状态复位。
- **跑团检定**:修正暴击结果分支在「已成功不重摇」守卫下的一致性。
- **审计工具更准**:收紧 `graph-audit` 对迷宫类节点、死状态键、软锁口袋与过场出口的判定,减少漏报 / 误报。
- **可玩示例**:修正贪吃蛇按钮在鼠标下的重复触发、迷宫伪全屏在部分皮肤下的画面裁切,以及个别引号 / 字形问题。

### 工程
- 加固发布流水线:公开发布串行化(并发锁)、重复 Release 预检、发布仓库一致性校验、版本注入统一,并新增相应静态校验闸与发布说明校验。

## [0.1.1] — 2026-07-17

触控操作与可玩示例的打磨(补丁版本,无破坏性变更;从 0.1.0 直接升级即可)。

### 改进
- **触屏方向键统一为一套系统**:可玩示例(伪 3D 迷宫、贪吃蛇小游戏)现共用同一套触屏方向键,并**跟随所选界面皮肤自动配色**——换皮肤时控件一起变,不再各自为政。
- **迷宫视野不再被遮挡**:`examples/maze3d/` 的方向键从悬浮在画面上改为排在画面**下方**,3D 视野完整可见(手机上尤其明显)。
- **更好按、更可达**:方向键 / 动作键触摸命中区不小于 44×44,按下有明确反馈,支持键盘焦点与「减少动态」偏好。

### 修正
- 修正若干可玩示例的历史遗留措辞。
- 修正个别界面字符在部分系统 / 字体下显示为方框(tofu)的问题,改用覆盖更广的字形或内联图标。
- 修正贪吃蛇小游戏示例方向键的十字布局。

## [0.1.0] — 2026-07-16

Amatlas 的**首个对外版本**。Amatlas 是用 AI 编码代理(**Claude Code** 或 **Codex**)制作互动游戏的引擎:**数据驱动**(游戏 = 数据,引擎 = 固定解释器,AI 能可靠地编写与审计)、**模块化**(类型无关核心 + 可叠加的玩法模块)、**极致轻量**(成品是一个 all-in-one HTML,零依赖、离线、双击即玩)。此前引擎从未公开发布,**无历史存量需要迁移**。

本版为**测试版本**(0.1.x),欢迎试用与反馈(GitHub Issues:https://github.com/TNTcraftHIM/amatlas/issues)。1.0 之前处于快速迭代期,契约 / 接口可能有较大变动,跨版本升级不保证平滑——升级前先读目标版本的「破坏性」小节(步骤见 README.md「升级引擎到新版本」)。

### 新增
- **引擎核心**:类型无关的数据驱动状态机、可种子的确定性随机数、多槽存档底座(存档按游戏身份隔离,不同游戏互不串档)。
- **玩法模块**:`text-adventure`(文字冒险 / 互动小说,最成熟的主范本)、`tabletop`(跑团 / 掷骰检定)、`cutscene`(过场演出)、`minimal`(最小模板,自建玩法的起点)、`crawler`(离散迷宫底层原语);另附 `examples/maze3d/` 伪 3D 迷宫可玩示例。
- **呈现层**:正文 / 选项渲染、程序化 SVG 场景与动画(天气 / 雾 / 视差)、生成式音频(音乐 / 环境声 / 音效,内置 22 个音乐预设与 15 个环境音预设,支持可选的 MIDI 导入)。
- **能力插件**:多槽存档(含导出 / 导入)、小地图、成就、物品栏、重新开始。
- **工具链(随包发布,零依赖)**:`graph-audit`(结构审计:死链 / 不可达节点 / 无保底出口)、`assembly-probe`(装配探针 + 自动游玩)、`build`(内联成单文件 HTML,硬准入门:不合规不出成品)。只需 Node.js ≥ 18;已装 `jsdom` 时可用 `build --smoke` 追加运行时烟雾测试。
- **双 AI 代理支持**:Claude Code(`/new-game`、`/audit-game`、`/build` 等 7 条斜杠命令 + 技能手册)与 Codex(`AGENTS.md` 作者指南 + 等价的技能手册镜像);两条路径走同一套审计与构建闸。
- **UI**:8 套可选界面皮肤(`ui/amatlas-skins.css`,`data-ui` 一键切换)——只提供审美起点,样式仍 100% 归作者。
- **fail-loud 纪律**:对非法数据立即报错、不静默退化;错误信息就是修法指引。
- **成品分发友好**:构建出的单 HTML 自动附上 MIT 许可证声明与引擎版本号(可自由分发,报 bug 时附版本号即可定位)。

### 作者须知
- 每款游戏须在 `world.js` 顶层 `id` 填一个 **UUID v4**(游戏身份,用于存档隔离;缺失或非法会启动报错)。复制 demo 起步时记得换新 UUID,生成命令:`node -e "console.log(require('crypto').randomUUID())"`。

### 已知限制
- `examples/maze3d/` 是自定义 runtime 的可玩示例,不是内置公共模块。
- `crawler` 模块随包但暂无成品 demo,`boot()` 也不自动装配它;想做离散迷宫,建议先从现有模板复制起步,再按需引入。
- 可选的运行时烟雾测试(`build --smoke`)需要另装 `jsdom`;未安装时会明确跳过,不影响基础审计与构建。
- `boot()` 会自动装配 world 中用到的内置玩法(`scene` / `encounter` / `cutscene`),暂无关闭开关;想用自定义模块顶替内置玩法,需绕开 `boot()`,改用底层手写装配(`createEngine` + `engine.use`)。
- 使用 MIDI 音乐(`audio.music: { midi: … }`)时,须在 index.html 单独引入 `presenters/midi-music.js`。

[0.4.3]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.4.3
[0.4.2]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.4.2
[0.4.1]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.4.1
[0.4.0]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.4.0
[0.3.2]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.3.2
[0.3.1]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.3.1
[0.3.0]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.3.0
[0.2.1]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.2.1
[0.2.0]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.2.0
[0.1.2]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.1.2
[0.1.1]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.1.1
[0.1.0]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.1.0
