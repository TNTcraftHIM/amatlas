---
description: 审计当前 src/ 游戏(world.js 结构 + 构建产物运行时),找死链/刷属性/重访出戏/假选择/叙事矛盾
---

审计当前项目的固定工位 `src/`。本命令不接受目标路径参数；一份引擎目录只审其中这一部游戏，避免标题说审 A、实际命令却固定跑 B。

严格按 `.claude/rules/auditing-principles.md` 执行。模块化游戏 = `src/world.js`(数据)+ `src/game.js`(组装)+ `src/index.html`,构建成单 HTML。审计分**结构**(world.js)与**运行时**(构建产物)两层。

## 1. 先校准 + 跑工具(不要跳过)
- 先读 `world.js`,搞清它用了哪些机制:`look` 函数 / `{first,return}`、`links`(`to`/`run`/`once`/`requires`/`showWhenLocked`)、`events`(`when`/`once`)。条件内容是 **JS 函数/对象**,不是 `{{if}}` 标记。
- 跑结构审计:`node core/tooling/graph-audit.mjs src/world.js`
  - 退出码非零 = 有 P0(死链/坏 start),最高优先。
  - 类型无关、看核心契约的图结构(`exits[].to` + `links[].to`);死链/可达/死胡同以它为准。
- 跑零依赖装配探针:`node core/tooling/assembly-probe.mjs src/index.html`(boot/挂载点/首屏/自动游玩运行时错误；发布包只需 Node 即可跑)。
- 跑构建准入门，先用 `node -e "require.resolve('jsdom')"` 检测：
  - 已安装 jsdom → **直接**跑 `node pipeline/build/build.mjs src/index.html --smoke`。它在同目录候选上完成静态门+烟雾，全绿后才原子替换 `dist/index.html`；不要先跑默认构建覆盖 canonical output。
  - 未安装 jsdom → 跑 `node pipeline/build/build.mjs src/index.html`（死链/schema → 单 HTML；基础链不要求额外依赖），并在报告明确写“jsdom smoke 未安装，已跳过”。不要把缺可选依赖报成游戏失败；如用户愿意可在引擎目录自行 `npm install jsdom` 后补跑。
- 查 JS 语法:`node -c src/world.js`(和 `game.js`)。
- **假选择**(同一节点多个 `links` 指向同一 `to` 却无 `run` 差异):graph-audit 不查,人工读 `world.js` 的 `links` 判断——每个选项(含默认)都该有真正的状态改变。
- 注:assembly-probe/jsdom smoke 只查逻辑层,最终仍需真浏览器**双击 `dist/index.html` 实玩**(CSS/音视频/移动端)。

## 2. 人工核验(脚本查不到的)
按 `references/audit-checklist.md` 逐层过,重点人工判断:
- **Canon 一致性**(防"跑火车"):读 `canon.md`(如存在),全文搜关键数字/名字/设定,确认无矛盾。特别关注多入口汇流节点(从不同路径进同一节点,角色状态可能不同)。详见 `references/canon-tracking.md`。
- **路径前提假设**:节点正文(`look`)是否引用了"只有某条来路才经历过"的事件/NPC/地点?多入口节点要用 `look` 的 `first`/函数按 flag 分流。详见 `references/consistency-guardrails.md` 第八节。
- **角色连续性**:角色名全场一致?(grep 变体拼写) NPC 首次出场前有铺垫?路径分叉后角色状态(活/死/离开)用 `look` 函数按 flag 分流?详见第九节。
- **重访文字一致性**:多入口枢纽节点是否写死"第一次到达/把玩家当新人/固定时点"。(可先用 `/revisit-check`)
- **属性门槛平衡**:可重入数值用 `once:true` 守卫 + 门槛是否合理。(可先用 `/balance-check`)
- **叙事时序**:多入口汇流是否有矛盾(角色死后又复活之类)。
- **内容重复 / NPC 铺垫**:相邻节点是否重述同一事件;NPC 首次出场前是否已引入。

## 3. 报告格式
- 按严重度 P0→P3 排序。
- 每条标 **[确认]**(跑通/逐行核对过)或 **[待确认-需运行验证]**。
- 每条给:位置(节点 id)、问题、**后果(为什么是问题)**、具体修法、验证方式。
- 结尾明确列出"**已确认健康、无需改动**"的部分。
- 凡 graph-audit 报"不可达/死胡同":先确认不是有意的(纯动作节点 / 分支末端),**不要直接当孤儿建议删**。

## 4. 修复(若用户要求)
- 条件内容用 `look` 函数 / `{first,return}` + flags,**不用 `{{if}}` 标记**(呈现器不解析,会把 `{{…}}` 原样显示)。
- 改 `world.js` 后 `node -c` + 重跑 `graph-audit.mjs` + `build.mjs` 验证。
- 多轮迭代时,动手前先确认问题是否仍存在(可能已修过),用 grep 拿证据。
