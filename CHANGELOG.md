# 更新日志 · Amatlas 引擎

本文件记录 Amatlas 引擎的显著变更,遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与 [语义化版本 SemVer](https://semver.org/lang/zh-CN/)。

> **版本轴说明**:发布号是 SemVer。**0.x 阶段**:公共 API 尚未冻结,任何时候任何事都可能变——破坏性变更可以落在次版本(0.y)。引擎内部另有两条**独立、不对外映射**的版本轴:存档格式 `SAVE_VERSION`、模块↔核心契约 `module-interface` 版本;它们只在本日志的说明里提及,不与发布号混用。

## [0.1.0] — 2026-07-16

首个对外版本。此前引擎从未公开发布,故**无历史存量需要迁移**。

本版为**测试版本**,欢迎试用与反馈。1.0 前处于快速迭代期:契约 / 接口可能有较大变动,甚至大型重构,跨版本升级不保证平滑——升级前先读目标版本的「破坏性」小节(步骤见 README.md「升级引擎到新版本」)。

### 破坏性(0.x:破坏性变更可落在次版本)
- **`world.id` 现为必填的 UUID v4**——每款游戏须在 `world.id` 写一个 UUID v4(游戏身份,用于存档隔离);缺失或非法即 fail-loud 报错。**复制 demo 做新游戏必须换新 UUID**,否则两款同骨架游戏会碰撞存档。引擎已内嵌生成命令:`node -e "console.log(require('crypto').randomUUID())"`。
- **存档格式 `SAVE_VERSION` = 2**——首版基线;v1 从未公开发布,无历史存档需迁移。

### 新增(首版能力面)
- **核心**:类型无关状态机、可种子确定性 RNG、v2 存档身份(`world.id` 派生键 + 存档信封 gameId 绑定,防跨游戏串档 / 跨游戏导入互灌)、模块生命周期(注册唯一性 / init 抛错回滚 / 读档 restore 挂钩)。
- **玩法模块**:`text-adventure`(文字冒险,主范本)、`tabletop`(跑团检定)、`cutscene`(过场演出)、`crawler` / `minimal`(离散迷宫 / 计数器模板);`examples/maze3d/` 伪 3D 迷宫示例岛(自定义 runtime,**非公共模块**)。cutscene 首拍/中间拍只提供逐拍即时快进，最后一拍才显示 `links` 出口；手动推进失败不伪装完成，自动时间轴仍可容错继续。maze3d 的 grid K 同时支持近距自动拾取与 E/Enter/触屏上下文按钮主动“拾取”，两路共用一次性结算；主动目标受前向、距离及 DDA 墙体遮挡约束，仍保持会话局部、不进入 Inventory。
- **呈现器**:present-dom(正文 / 选项)、present-svg(程序化 SVG 场景 + SMIL 动画 + 天气 / 雾 / 视差)、present-audio(生成式音乐 / 环境声 / 音效 + MIDI；含 `timbre.lead:'chant'` 确定性无词吟咏音色及稀疏的内建下倚音/上回音；默认低音采用 support/melodic 职责分族、G3 音区护栏和专属 trim，不再自动抢作第二主旋律，柔拨 `sine-pluck` 兼有短 FM 起音与克制的持续低频主体；22 个默认音乐预设从第一段即保有完整织体，后续 statement→answer→peak→breath 只做轻回应和末和弦短峰值/收口呼吸，静态曲风以 texture 变化代替强加高潮；soft/flute/reed/brass、拨弦、pad 与 bass 各有稀疏且确定性的家族演奏法，不把同一转音复制给所有乐器；作者音频手册提供职责分层、六个正交创作轴、发展/留白与人耳验收框架，鼓励下游组合创新而非照抄固定配方)。
- **能力插件**:存档(多槽 + 导入导出)、小地图、成就、重新开始、物品栏。
- **工具链(随包发布,零依赖)**:graph-audit(结构审计:死链 / 可达 / 无保底出口)、assembly-probe(装配探针 + 自动游玩)、build(内联成单 HTML + 硬准入门)、smoke-harness(可选 jsdom 运行时烟雾；支持从 CI/E2E 的外部 `NODE_PATH` 依赖根解析 jsdom，不要求把 `node_modules` 放进引擎包)。
- **UI**:8 套可选皮肤(`ui/amatlas-skins.css`,`data-ui` 切换)——只提供审美起点,样式仍 100% 归作者。
- **作者面**:`.claude/skills/text-adventure-game`(技能手册)+ 斜杠命令(`/new-game`、`/audit-game`、`/build`、`/polish-game`、`/translate-game`、`/revisit-check`、`/balance-check`);另有 `AGENTS.md`(工具中立作者指南,支持 Codex 等非 Claude Code 工具)。**Codex 兼容**:技能手册自动镜像到 Codex 原生可发现的 `.agents/skills/`——由 `core/tooling/codex-parity.mjs` 从 `.claude/skills/`(单一真相源)生成,配 fail-loud 校验闸(`--check`)防漂移,随包发布并在测试/打包链上把关。
- **发布卫生**:构建产物单 HTML 顶部自动注入 MIT 许可证声明(SPDX 行 + 全文);版本戳可注入 SemVer(诊断更直观)。

### 已知限制
- `examples/maze3d/` 是示例岛、不是内置公共模块(不进 `manifest.modules`)。
- 外部 skill `skill-creator` / `webapp-testing` 是可选、需另装依赖,**不随发布包**(dev 仓库仅留参考)。
- 用 `audio.music: { midi: … }` 嵌 MIDI 时须在 index.html 单独引入 `presenters/midi-music.js`。
- 契约基线 `module-interface` v42;存档格式 `SAVE_VERSION` 2。
- `boot()` 对 world 中用到的内置 kind(`scene`/`encounter`/`cutscene`)一律自动认领对应内置模块、无 opt-out →「自定义模块覆盖内置 kind」在推荐 boot 路径下不可用(已知边界;需完全绕开 boot、改用底层 `createEngine`+`engine.use` 手写装配)。
- `crawler` 模块随包但**无 demo**;`boot()` 不自动装配 `node.kind='maze'`(自建离散迷宫游戏请从 `text-adventure`/`tabletop`/`cutscene`/`minimal` 复制模板起步,crawler 作为底层原语按需引入)。
- `graph-audit` 硬编了内置模块知识(scene/encounter/cutscene/crawler 的字段与 kind 路径)、无第三方审计插件钩子 → 全新自定义模块类型在结构闸上覆盖较弱(死 flag / soft-lock 等深层检查需手动补充)。

[0.1.0]: https://github.com/TNTcraftHIM/amatlas/releases/tag/v0.1.0
