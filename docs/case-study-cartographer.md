# 案例研究:《制图师的挽歌》审计实录

> 这是本项目所有方法论、工具、规则的**经验来源**。一款约 10 万字的中文互动小说(97 场景、6 结局),经过多轮逐场景审计 + 工具迭代。这里浓缩记录"踩了什么坑、学到什么"。读它是为了理解 SOUL.md 和 rules/ 里那些原则**为什么**存在。

## 游戏概况
- 制图师艾拉漂流到一座会移动重排的"活岛",活墨水是核心资源,前任制图师雷纳已与岛融合成守护者。
- 单 HTML、零依赖。引擎用 `SCENES` 字典 + 运行时 `.push()`/`_dynamic()` 拼装,条件文本用 `{{if}}`。

## 第一个、也是最重要的教训:解析器盲区 → 假 bug

最初用自写正则解析器审计,它**只认静态 `choices:[...]` 定义**,漏掉了:
- `.choices.push()` / `.splice()` 运行时接入的场景
- 场景级 `.effects`(进入即设 flag)
- `._dynamic(state)` 函数(运行时生成 text/choices,结局分流用)

结果连续多轮误报:
- "13 个孤儿场景、9000 字死内容"—— 实际全部经 `.push()` 接入。
- "learned_flow / village_conflict flag 从未设置"—— 实际在场景级 effects 里设了。
- "融合结局锁死、指向错误"—— 实际 `_dynamic` 函数有主路径 + fallback 两分支,设计如此。

被开发者反驳"这些全是误判"后,逐行核对代码,**全部撤回**。

→ 这直接诞生了 SOUL.md 第一条 + rules/auditing-principles.md 的"第 0 步:校准工具"。修正后的解析器纳入全部动态机制,才能用。

## 逐场景"真玩"审计发现的真问题

放弃纯脚本、改成逐场景通读 + 对照场景链接/叙事顺序后,发现的真 bug:

1. **重访刷属性(引擎级)**:`loadScene` 的 `applyEffects` 无去重守卫,数值属性纯累加。70+ 场景可重入成环 → 玩家反复进出可把任意属性刷到任意值 → 架空所有结局门槛。
   → 修法:`sceneEffectsApplied` 守卫,场景 effects 只首次应用。

2. **`{{elif}}` 崩坏**:为按结局显示不同尾声,epilogue 写了 5 个 `{{elif:flags:ending==transcend}}`。但引擎只支持 `if/else/endif`,不认 `elif`,也不认 `==` 值判断。非贪婪正则把整段吞掉 → **玩家通关看到满屏原始标记 + 六个结局文字堆叠**。
   → 修法:6 个并列 `{{if:flags:ending_X}}` 块,每个结局 effects 设布尔 flag。
   → 这诞生了"修复必须在引擎能力内"的原则 + engine-constraints.md。

3. **synthesis 死链**:重构时把 `ending_synthesis` 场景删了,但 `check_ending_synthesis._dynamic` 的选项仍 `next: "ending_synthesis"`。玩家达成最难的隐藏结局、点"走进核心形态"→ 跳不存在的场景 → loadScene `if(!scene)return` → **画面卡死**。
   → 这类专坑深度玩家的死链,正是 audit.mjs 必须从 `_dynamic` 函数体里也挖 next 的原因。

4. **重访文字出戏**:多入口枢纽场景写死"第一次"。例:`camp_setup`(9 入口)写死"搭两小时遮棚 + 傍晚日落",玩家上午回营地也重演;`village_market`(5 入口)每次重新介绍卡伊;`village_entrance` 从遗迹回村仍被陌生人当新人"你也是来画地图的"。
   → 诞生了 revisit-consistency 方法论 + `/revisit-check`。

5. **属性门槛形同虚设**:加了防刷守卫后核算,**最短主线 understanding 就已≈22**,而门槛是 truth≥5/destroy≥8/synthesis≥10/transcend≥15 —— 全自动满足。
   → 诞生了"防刷与门槛联动" + `/balance-check`。

6. 其他:相邻场景内容重述(雷纳的话讲两遍)、时间线锚点不一致(雷纳"两年/三年"、日记缺年份)、control 结局害死岛屿却接"岛屿欢快呼吸"的 epilogue、假选择(多选项同 next 无 effects 差异)。

## 工具的"吃狗粮"教训

后来给本项目写 audit.mjs 时,它一开始**把自己注释里举例的 `{{elif}}`、文档里的 `SCENES["x"]` 示例当成了真 bug** —— 又是"扫描范围没校准"。修法:扫描前先剥离 HTML/JS 注释。

→ 这再次印证第 0 条铁律,连工具自身都适用。

## 沉淀

> 注:以下是《挽歌》时期(单文件 + `SCENES`/`{{if}}`)的沉淀;后续引擎化已演进——审计转为 `core/tooling/graph-audit.mjs` + `build.mjs --smoke`,`engine-skeleton.html`/`engine-constraints` 已废(机制并入核心 `once`/`look` 函数)。下列为历史记录。

- 工具:`audit.mjs`(动态感知)、`find-fake-choices.mjs`、`engine-skeleton.html`(内置所有正确机制)。
- 规则:auditing-principles、engine-constraints。
- 命令:`/audit-game`、`/revisit-check`、`/balance-check`、`/new-game`。
- 通用清单:`docs/QA_checklist_prompt.md`。

**一句话:这个项目的每一条原则,背后都有一个具体的、付出过代价的坑。**
