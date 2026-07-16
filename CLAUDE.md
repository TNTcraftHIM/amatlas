# CLAUDE.md — 用 Amatlas 引擎做互动游戏

**Amatlas** = 轻量 · 模块化 · AI 驱动的互动游戏引擎:**数据驱动**(游戏=数据,引擎=固定解释器 → AI 能可靠地写与审)、**通用核心 `core/` + 类型模块 `modules/` + 可插拔呈现器 `presenters/` + 能力插件 `plugins/`**;成品是**一个 all-in-one HTML**(双击即玩、离线、无服务器)。

## 架构(先懂这个:做游戏 = 写数据 + 组装插件,不手搓引擎)
一个游戏 = **三个源文件**,构建器把它们内联成单 HTML:
1. **`world.js`** — 世界数据 `{ id, start, maps:{ nodes:{ kind, look, links, events, scene?, audio? } } }`;作者只写数据。`id` 是创建游戏时生成一次并长期保持的 UUID v4；复制 demo 做另一款游戏必须换新 UUID。
2. **`game.js`** — 启动胶水:**`var engine = window.Amatlas.boot(WORLD, manifest)`** 一句声明式装配——boot 只按内置 kind **自动拉玩法模块**(scene→文字冒险 / encounter→跑团),自定义 kind(如 maze3d)必须放进 `manifest.modules`;boot 同时挂 manifest 声明的呈现器/插件(存档·小地图·成就)、跑 start;删 manifest 一项 = 关那个能力(index.html 须多引一行 `preset/boot.js`)。底层 `A.createEngine + engine.use(...)` 手写装配仍可用(高级 escape hatch,对照 `examples/horror-demo/`)。
3. **`index.html`** — HTML 模板 + 精致 CSS + 按序 `<script src>`。
构建:**`node pipeline/build/build.mjs <game/index.html> [--smoke]`** → 过硬准入门(死链/schema,fail-closed)→ 单 HTML。**新游戏起点照抄 `examples/text-adventure-demo/`(文字冒险,主范本)· `examples/tabletop-demo/`(跑团)。`examples/horror-demo/` 是 presenter 演出压测 + 底层 `createEngine`+`engine.use` 手写装配的 escape-hatch 对照,非新游戏默认起点(新游戏起点见 text-adventure-demo / SKILL 路由)。**

## 模块(按类型选;修改分层与新建见 text-adventure-game skill 的 `references/plugin-development.md`)
- **`text-adventure`(主范本模块)** — 文字冒险/互动小说:`kind:'scene'` + `look`(内容=f(状态),写成字符串 / `{first,return}` / `(S,first)=>string`)+ `links`(选项=状态转移)+ `events`(进入 beat)。这是最成熟的默认创作路线之一,本指引主要服务它(源自 10 万字中文互动小说《制图师的挽歌》多轮迭代)。
- **`tabletop`** — 跑团/检定:角色卡 + `api.dice` vs DC + 资源时钟。
- **`minimal`** — 保底计数器模板(新玩法复制它起步)。
- **引擎里没有的玩法** → 读 text-adventure-game skill 的 `references/plugin-development.md`,复制 minimal → 改名 → 逐步替换。

## 做游戏
- **`/new-game <描述>`** — 自动判类型 + 选模块 + 走工作流(文字冒险走 `text-adventure-game` skill 的 5 阶段)。
- 审计/翻译/重访/平衡:`/audit-game` · `/translate-game` · `/revisit-check` · `/balance-check`。
- **校验(类型无关)**:必跑零依赖链=`node core/tooling/graph-audit.mjs src/world.js`(死链/可达/死胡同,P0 退出码非零)+ `node core/tooling/assembly-probe.mjs src/index.html`(装配/自动游玩)+ `node pipeline/build/build.mjs src/index.html`(构建准入)+ `node test/run.cjs`(回归)。`build --smoke` 是已安装 jsdom 时的可选增强；未安装须明确记录跳过，不把可选依赖缺失当游戏失败。

## 修改分层(改对地方)
玩法规则 → 模块;内容/文案/地图 → `world.js`;视觉/听觉 → presenter 映射(意图非素材,世界数据里不出现 SVG 路径/音频 buffer);**核心 `core/runtime/engine-core.js` 不碰**(PreToolUse hook 物理保护)。

## 关键规则(自动加载,详见 `.claude/rules/`)
- `building-discipline` — 不假设先校准 / 最小可工作版起步 / 增量验证 / 目标驱动(所有任务)。
- `auditing-principles` — 先校准工具再下结论;能跑就跑;区分确认/待确认。
- `craft-and-autonomy` — 自主协议(不请示、自导航)+ 抗 compact 落盘纪律。
- `debug-pipeline-log` — `DEBUG` 文件在时每步追加 `PIPELINE-LOG.md`(Stop hook 强制)。
> text-adventure 的**写作 / 反 slop / 一致性方法论**是类型专属 → 在 `text-adventure-game` skill(按需加载)+ 其 `references/`,不占自动加载。

## 强制机制
- **Stop hook** — 完成前自动跑 graph-audit(`world.js` 有 P0 死链/坏 start → 阻止结束、退出码 2、原因回灌)。
- **narrative-reviewer 子代理** — 文字内容每幕/中段做反 slop + 一致性对抗审查(隔离 context)。

## 协作偏好 + 参考
诚实 > 乐观粉饰:用代码证据(grep/读码/跑测试)回应"修了吗",不口头声明;改完 `node -c` / `run.cjs` 验证。按需读:`SOUL.md`(工作哲学)· `docs/case-study-cartographer.md`(每条规则的真实代价)· `core/module-interface.md`(核心↔模块契约;版本以该文件头为准)。

## Compact 指令(压缩会话时,逐字保留,勿抽象化)
做游戏是长任务,auto-compact 会丢细节。压缩时**原样保留**:① `PROGRESS.md` 进度块 ② canon 关键事实 / 未释放的伏笔 ③ 当前写到的节点 + 下一步 ④ 未完成的验证(audit / 实玩)。**compact / 新会话后第一件事**:重读 `PROGRESS.md`(SessionStart hook 已回灌 + `git status`;PreCompact hook 把压缩前 git 差异快照到 `.claude/last-precompact.txt`),并主动重唤 `text-adventure-game` skill 与相关 references。手动压缩用 `/compact "保留 PROGRESS 进度块与 canon 关键事实"`。
