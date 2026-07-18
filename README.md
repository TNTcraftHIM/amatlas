# Amatlas — 互动游戏引擎(轻量 · 模块化 · AI 驱动)

用 AI 编码代理(**Claude Code** 或 **Codex**)**做**自包含单文件 HTML 互动游戏的引擎。三个特点:**数据驱动**(游戏=数据,引擎=固定解释器 → AI 能可靠地编写与审计)、**模块化**(类型无关的通用核心 + 可叠加的类型模块)、**极致轻量**(成品尽量一个 all-in-one HTML,双击即玩、离线、无服务器)。

> **测试版说明**:Amatlas 目前是**测试版本**(0.1.x),欢迎试用与反馈(GitHub Issues:https://github.com/TNTcraftHIM/amatlas/issues)。1.0 之前处于快速迭代期,**契约 / 接口可能有较大变动,甚至大型重构**,升级不保证平滑——升级前先读 `CHANGELOG.md` 的「破坏性」条目。

> **现在能做什么(诚实说明)**:引擎核心**类型无关**,游戏类型以**模块**叠加。`text-adventure`(文字冒险 / 互动小说)是当前最成熟的主范本,本包命令 / skill 主要服务它;`tabletop`(跑团 / 检定)、`minimal`(保底计数器模板)、`crawler`(离散迷宫)也可用。引擎里没有的玩法用 `.claude/skills/text-adventure-game/references/plugin-development.md` 复制 minimal 自建;`examples/maze3d/` 是自定义 `maze3d` runtime 示例岛,不是内置模块。不夸大:今天它是一个建在通用核心上、以互动小说为主、可扩展到更多类型的工作台。

## 首次设置

```bash
node -v                 # 预检:需 Node.js ≥18;没有就先从 nodejs.org 装一次(基础审计/构建只依赖它)
tar -xzf amatlas.tar.gz   # 解包你拿到的引擎
cd amatlas/               # 进入解包出的目录
claude                  # 启动 Claude Code,自动加载 CLAUDE.md + rules/
codex                   # 或用 Codex:自动读取 AGENTS.md,技能手册在 .agents/skills/
```

**基础能力只依赖 Node.js**:Stop hook、graph-audit、assembly-probe、默认构建和 `/audit-game` 的必跑链均为纯 Node 零依赖。可选的 `build --smoke` 运行时烟雾需要另装 `jsdom`；未安装时 `/audit-game` 会明确跳过该增强，不影响基础审计与构建。注意 Claude Code 的原生安装器**不带** `node` 命令——`node -v` 报“找不到命令”就去 [nodejs.org](https://nodejs.org) 装一次,之后解包即可使用基础能力。

> **Windows 用户**:本工具包的脚本已通过 `.gitattributes` 强制 LF 换行,避免 Windows CRLF 破坏。

## 用 Claude Code 还是 Codex?

两个都行。本引擎为 AI 协作设计,随包自带两套代理集成,内容同源、质量闸相同:

| | Claude Code | Codex |
|---|---|---|
| 启动 | 引擎目录里运行 `claude` | 引擎目录里运行 `codex` |
| 作者指南 | `CLAUDE.md` + `.claude/rules/`(自动加载) | `AGENTS.md`(自动读取,工具中立) |
| 技能手册 | `.claude/skills/text-adventure-game/` | `.agents/skills/text-adventure-game/`(自动生成的等价镜像) |
| 附加机制 | 7 条斜杠命令(`/new-game` 等)、Stop hook 强制审计、审查子代理 | 无本包斜杠命令 / hooks——直接用自然语言提需求,按 `AGENTS.md` 的五步工作流走 |

无论走哪条路,审计与构建都是同一套纯 Node 脚本(graph-audit、assembly-probe、build),产出同一种单文件 HTML。技能手册的**单一真相源是 `.claude/skills/`**;`.agents/skills/` 由 `core/tooling/codex-parity.mjs` 生成并带防漂移校验,**不要手改**(说明见 `.agents/GENERATED.md`)。

## 使用

终端里只敲一条命令:`claude`(启动 Claude Code)。下面这些**斜杠命令是在 Claude Code 的对话框里输入的**,不是 shell 命令(游戏文件固定在 `src/`):

```text
/new-game 一个发生在深海空间站的悬疑文字冒险   # 做新游戏
/new-game 改编 story.md                        # 自带大纲/成文故事?先放进项目根 story.md
/audit-game                                    # 审计游戏(固定 src/ 的结构 + 构建产物运行时)
/build                                         # 快速构建:改完 src/ 一键跑三闸 + 重建单 HTML(只验证+重建,不碰叙事)
/polish-game 地图太挤,第二章 BGM 不够阴森      # 精修(文案/平衡/视觉/音乐/成就/分支;改完自动重验重建)
/translate-game src/world.js en                # 翻译游戏(中→英)
/revisit-check src/world.js                    # 专项:重访文字一致性
/balance-check src/world.js                    # 专项:属性门槛平衡
```

**用 Codex?** 上面这些斜杠命令是 Claude Code 专属;Codex 用户直接说需求(例:「帮我做一个雨夜灯塔的文字冒险」),它会按 AGENTS.md 的五步工作流建 src/、跑同一套三道闸。

## 做游戏的工作流(模块化)

一个游戏 = **三个源文件**,构建器内联成单 HTML(范例照抄 `examples/text-adventure-demo/`):

```bash
src/world.js      # 世界数据:id(UUID v4,游戏身份) / start / maps / nodes(kind/look/links/events/scene/audio)
src/game.js       # 组装:var engine = window.Amatlas.boot(WORLD, manifest) 一句声明式装配(内置 scene/encounter 自动拉;自定义 kind 走 manifest.modules;手写 createEngine+use 是 escape hatch)
src/index.html    # HTML 模板 + 精致 CSS + 按序 <script src>
node pipeline/build/build.mjs src/index.html   # → src/dist/index.html(单文件,双击即玩)
```

`/new-game` 会带你走完这套流程(文字冒险走 text-adventure-game skill 的 5 阶段)。**不手搓引擎**——核心 / 模块 / 呈现器都现成,你只写这三个文件。

## 看 demo / gallery 去哪里

先打开 `examples/showroom/index.html` —— 这是随包发布的 Gallery / Preview / Workbench 目录：所有卡片都在同一页的 embedded window 中打开，UI skin、视觉 Gallery、声音试听、可复制范本与综合作品保持分区。

| 入口 | 用途 |
|---|---|
| `examples/showroom/index.html` | Embedded Gallery:用单一 iframe 窗口集中 UI skin、通用 Audio Workbench、maze3d visual/audio gallery、7 个 playable references 与 Origin 综合作品 |
| `examples/showroom/ui-skins-gallery.html` | 普通页面 UI Skin Gallery:同一套 `#mapname/#place/#scene/#look/#choices/#status` 与插件 chrome 的 8 套 HTML/CSS 外观;作者用法见 `docs/ui-skins.md`,不是新模块或 demo |
| `examples/showroom/audio-preview.html` | 通用 Audio Workbench:普通文字冒险 / 跑团也能用的 `MusicSpec` 配方、timbre 乐器/低音、MIDI、`ambient`、`sfx` 和“开场即完整、段尾短呼吸”的发展试听(需用户手势解锁声音) |
| `examples/maze3d/index.html` | maze3d 统一入口:同一 `raycast-maze.js` runtime 的 basic / horror / puzzle / layers recipes,不是四个模块 |
| `examples/maze3d/gallery.html` | maze3d 视觉素材 Gallery(作者选材页) |
| `examples/maze3d/audio-gallery.html` | maze3d 私有声音试听 Gallery(需用户手势解锁声音) |

`_scratch/` 只放临时截图、A/B preview 和一次性核验页;正式给下游作者 / AI 看的入口只看 `examples/`,不要把 `_scratch` 页当成随包发布资产。

`examples/maze3d/` 是唯一 maze3d 可玩示例入口:一个 `maze3d` runtime,内部多种 recipes;同目录 `gallery.html` / `audio-gallery.html` 是素材试听辅助页,不是新 runtime。模块边界以 `modules/` 与 manifest.modules 为准。

`examples/cutscene-demo/` 是唯一正式 cutscene example:主体保持普通文字冒险,开局、关键剧情和结尾才由 cutscene 临时接管舞台。

其余 `minimal-demo` / `arcade-demo` / `tabletop-demo` / `horror-demo` 也都由 `examples/showroom/index.html` 单向索引并嵌入打开；子页本身不反向依赖 Gallery（`horror-demo` 是底层手写装配的 escape-hatch 对照，非新游戏默认起点）。

## 分享你的游戏

成品就是 `src/dist/index.html` **一个文件**(CSS/JS 全内联、断网可玩):

- **发给朋友**:直接把这个 HTML 文件发过去(微信/邮件/网盘都行),对方双击即玩,什么都不用装。
- **上架 itch.io**(单 HTML 是小型互动小说的事实标准发行链):新建项目 → *Kind of project* 选 **HTML** → 上传你的 `index.html` → 勾选 *This file will be played in the browser* → Embed 建议选 click-to-launch + 允许全屏。首次保存默认 **Draft**(草稿,不会误公开),确认能玩再切 Public。
- **注意**:存档/成就存在玩家浏览器的 localStorage 里——换浏览器/清缓存会丢,游戏内的「导出码」可以手动备份进度。

## 做第二部游戏

**一份引擎 = 一部游戏**(`src/` 是唯一工位,审计闸只认它)。想再做一部:**把整个引擎文件夹复制一份**(或重新解包 amatlas.tar.gz),在新文件夹里 `claude` + `/new-game`——两部游戏的源文件、记忆文件(canon/PROGRESS)、存档互不干扰。别在同一个 `src/` 里直接开新作:那会覆盖旧作,而本包没有 git 兜底(`/new-game` 发现 `src/` 已有游戏时也会先停下来问你)。

## 升级引擎到新版本

引擎按"一份引擎 = 一个工作区"分发,升级 = **换引擎、留你的源文件**:

1. 把新版 `amatlas.tar.gz` 解包到一个**新目录**(别覆盖旧目录,留作回退)。
2. 把旧项目的 `src/`(`world.js` / `game.js` / `index.html`,以及 `canon.md` 等记忆文件)拷进新目录。
3. **升级前先读 `CHANGELOG.md` 的「破坏性」条目**——某版若改了作者面字段(如 `world.id` 首版起为必填 UUID),按提示调整 `src/`。
4. 在新目录 `claude` + `/audit-game`,让 AI 按新版重审重建。

每个成品单 HTML 顶部注释和浏览器 `console` 都印引擎版本号(`Amatlas engine: X`),报 bug 时附上即可定位版本。**显著变更、破坏性与已知限制都在 `CHANGELOG.md`。**

## 项目结构

**引擎架构(通用核心 + 类型模块 + 生产管线)** —— 给人读的总览;`.claude/` 自动加载层有意不放目录树(精炼普适)。

| 目录 | 作用 |
|---|---|
| `core/` | **类型无关内核**:数据驱动状态机 + 地图世界模型 + 回合循环 + render/action **dispatch** + 核心服务(可种子 RNG / 时钟 / 事件总线)+ 存档导出兜底。模块↔核心契约见 `core/module-interface.md` |
| `core/tooling/` | 类型无关审计:`graph-audit.mjs`(死链/可达/死 flag/刷点/字段错位)+ `assembly-probe.mjs`(装配探针:boot 崩/挂载点/自动游玩)+ `smoke-harness.mjs`(jsdom 运行时烟雾)+ `static-lint.mjs` |
| `modules/text-adventure/` | **主范本文字冒险模块**:`runtime/`(scene 渲染器)+ `test/`。另有 `modules/tabletop/`(跑团)、`modules/minimal/`(保底模板)、`modules/crawler/`(离散迷宫) |
| `presenters/` | 呈现器(消费 View 快照、可叠加):`present-dom.js`(文字/选项)· `present-svg.js`(程序化场景/骰子)· `present-audio.js`(BGM/环境音/SFX)· `compose-music.js`(程序作曲:22 预设/MusicSpec/完整基线内的四段短呼吸/音色板)· `midi-music.js`(MIDI 导入:`{midi:'<base64>'}` 零依赖解析,GM 折表→音色库)· `present-dice3d.js`(可选 3D 骰) |
| `plugins/` | 能力插件:`save.js`(多槽存档)· `minimap.js`(小地图)· `achievement.js`(成就,跨周目持久) |
| `preset/` | pit-of-success 装配:`boot.js`(`Amatlas.boot(WORLD,manifest)`,内置 `scene`/`encounter` 自动拉;自定义 kind 走 `manifest.modules`;每游戏存档键) |
| `pipeline/build/` | 零依赖**单文件构建器**:模块化源码 → all-in-one HTML,**含硬准入门**(不合规不出成品) |
| `examples/` | 可运行样例(模块化源码 `world.js` + `game.js` + `index.html`):`text-adventure-demo`(主范本)· `tabletop-demo`(跑团)· `cutscene-demo`(唯一正式过场集成范本)· `minimal-demo`(最小模块起点)· `arcade-demo`(自定义模块示范)· `maze3d`(自定义 runtime 示例岛,非公共模块)· `horror-demo`(presenter 演出 / 底层手写装配 escape-hatch 对照)· `showroom`(Gallery / Preview / Workbench Hub) |
| `test/run.cjs` | 一键纯 node 回归(核心 + 模块 + 工具 + 构建) |

**AI 代理集成(做游戏的资产 + 强制机制)**

| 何时加载 | 内容 |
|---|---|
| 自动加载(每次会话) | `CLAUDE.md`(导航 + 通用理念)、`.claude/rules/`(创作 / 审计 / 引擎规则,3 文件) |
| 按需 | `.claude/skills/text-adventure-game/`(核心 skill:模块化工作流 + 经验文档 references)、`.claude/commands/`(7 斜杠命令)、`.claude/agents/`(narrative-auditor / reviewer)、`.claude/hooks/`(Stop 强制审计 + SessionStart / PreCompact 抗压缩) |
| 人读参考 | `SOUL.md`(工作哲学全文)、`docs/`(审查清单 + 《制图师的挽歌》审计实录) |

**Codex 走同源镜像**:AGENTS.md(自动读取的工具中立作者指南)+ .agents/skills/(由 .claude/skills/ 单源生成,core/tooling/codex-parity.mjs --check 防漂移)。

## 关键命令行工具

```bash
# 结构审计(类型无关:死链/可达/死胡同;在引擎根目录执行)
node core/tooling/graph-audit.mjs src/world.js

# 零依赖装配探针 + 构建成单 HTML(过硬准入门)
node core/tooling/assembly-probe.mjs <游戏目录>/index.html
node pipeline/build/build.mjs <游戏目录>/index.html

# 可选增强:已安装 jsdom 时再跑运行时烟雾
node -e "require.resolve('jsdom')" && node pipeline/build/build.mjs <游戏目录>/index.html --smoke

# 一键回归(核心 + 模块 + 工具 + 构建)
node test/run.cjs
```

## 做长项目时怎么管理 session(让信息不丢)

做一部完整的游戏是**长任务**。Claude Code 的对话上下文满了会**自动压缩**(auto-compact),这个过程**有损**,可能丢掉"刚才写到哪、为什么这么定"。本工具包已把关键状态用**进度文件 + hook** 留在文件里(`PROGRESS.md` 进度块、SessionStart 新会话自动回灌、PreCompact 压缩前落盘快照),所以**不会"失忆到没法继续"**——但下面的好习惯能让体验更顺,无论你偏好哪种工作方式:

- **想一直在一个窗口聊**:可以。压缩后 `PROGRESS.md` + hook 会帮你接续。**每做完一小步、看到进度更新了,就是一个安全点**;感觉 Claude 回应开始变迟钝时,主动敲一句 `/compact "保留 PROGRESS 进度块与 canon 关键事实"`,别干等它自动压。
- **想分多次会话**:在一个**干净的完成点**(一幕 / 一批场景写完、刚 audit 过)开新会话最顺——新会话会自动读回 `PROGRESS.md`,接着干。
- **判断"何时该开新会话"的最佳时机**:不是"按章节/功能",而是**"刚做完一小步、状态刚记录下来时"**——这时无论压缩还是换会话,信息都最完整。
- **超长的游戏怎么做**:不必(也不该)指望一个会话做完整部游戏;它本就被切成小步,你可以在**任意小步边界**停下/换会话,下次开一个新会话说"继续"就接着来。

## 项目可移植性

这是一个**通用工具包**——你下载它,在文件夹里做你自己的游戏。

当你用它做游戏时,Claude 会在**项目文件夹根目录**生成这些记忆文件(都由 agent 手动维护):
- `PROGRESS.md` — 上次停在哪 / 下一步
- `canon.md` — 故事圣经(时间线/角色/世界规则)
- `glossary.md` — 翻译术语表

**它们被 `.gitignore` 忽略**(因为工具包是通用的,不该追踪某个具体游戏的记忆)。但**可移植性不受影响**:迁移时**拷贝/打包整个文件夹**(tar/zip 会包含被 gitignore 的文件),Claude 在新机器上不失忆。只有 `git clone` 才不会带上这些——这正是我们想要的(克隆工具包时不带无关游戏记忆)。

## 不提交到 git 的文件(已在 .gitignore)

- 用户游戏的记忆/状态(`PROGRESS.md`/`canon.md`/`glossary.md`)— 通用工具包不追踪具体游戏
- 用户游戏的构建产物(各游戏目录的 `dist/`,即 `build.mjs` 生成的单 HTML;旧 `game.html`/`game_*.html`/存档也忽略)
- `.claude/python-path` — 机器特定(仅可选的外部 Python skill 用,见下「可选扩展」)
- `.claude/settings.local.json` / `.claude/projects/` — Claude Code 内部
- `DEBUG` / `PIPELINE-LOG*.md` — 调试模式开关与诊断日志(见下)

## 调试模式(可选 · 给管线诊断用)

想帮我们诊断 / 改进引擎管线时,可开启调试模式:在项目根 `touch DEBUG`(空文件即可)。开启后,Claude 每完成一个有意义的步骤,会把"读了什么 / 做了什么决策 / 在哪卡住"追加到 `PIPELINE-LOG.md`(**写到文件、不占对话上下文**),精准暴露"管线哪一步指引不够"。关掉就 `rm DEBUG`。`DEBUG` 和 `PIPELINE-LOG.md` 都被 `.gitignore`,不进版本库、不影响成品。

## 可选扩展:外部 skill(高级 · 按需安装)

Amatlas 引擎本身**只需 Node**——做游戏 / 审计 / 构建的全部功能零 Python 依赖。

有些 Anthropic 官方 skill(用 Python / Playwright 实现)**没有随包发布**,以保持本包"解包即用、只依赖 Node",并让你装到**最新版**而非打包时的快照。需要时一条命令装回(联网一次):

```bash
/plugin marketplace add anthropics/skills
/plugin install example-skills@anthropic-agent-skills   # 含 skill-creator、webapp-testing 等
```

- **skill-creator** — 系统化创建 / 优化你自己的 skill(让引擎"越用越顺手"的进阶路径,配合 `.claude/skills/text-adventure-game/references/creating-skills.md`)。
- **webapp-testing** — Playwright 驱动真浏览器做自动化测试(截图 / 控制台 / 点击)。Amatlas 已自带 jsdom 烟雾测试(`core/tooling/smoke-harness.mjs`,经 `pipeline/build/build.mjs --smoke` 调用)覆盖逻辑层;真浏览器视觉/音频确认平时**双击 `file://` 成品**即可,只有要**自动化**真浏览器测试时才需要它。

装好的 skill 位于用户级 `~/.claude/`(跨项目可用)。若某个外部 skill 需要 Python,运行 `bash setup-python.sh` 配置解释器;webapp-testing 还需 `pip install playwright && playwright install`(下载浏览器内核)。

## 来源

核心 skill 源自 10 万字中文互动小说的 10+ 轮实战迭代。反 slop 方法论参考 NousResearch/autonovel + ICLR 2026 ANTISLOP。一致性防护基于 ACL 2026 ConStory-Bench。官方 skill 来自 [anthropics/skills](https://github.com/anthropics/skills)。

## 许可证

MIT(见 `LICENSE`)——引擎本体、你构建的成品游戏(内联了引擎代码)均可自由复制 / 修改 / 再分发。
