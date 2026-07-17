# Amatlas — 互动游戏引擎作者指南（工具中立版）

> **测试版本(0.1.x)**:1.0 前契约 / 接口可能有较大变动,甚至大型重构,升级不保证平滑;破坏性变更以 CHANGELOG.md 为准。

本文件给 Codex 等 AI 工具读，帮你用 Amatlas 引擎做互动游戏，**不依赖 Claude Code 专属机制**（无斜杠命令、无 hooks）。Claude Code 用户请看 `CLAUDE.md`；本文件与之互补，不重复。

> 说明:本文引用的作者手册在 `.agents/skills/`——Codex 原生从 cwd 向上扫描的 skill 位置(可用 `/skills` 列出、隐式匹配)。它是 `.claude/skills/`(Claude Code 源)的**自动生成镜像**,两者都随包、内容等价;手册正文里偶见的 `.claude/...` 交叉引用在包内同样可解析。

## 引擎是什么

**Amatlas** 是数据驱动、模块化、编译成单个 HTML 文件的互动游戏引擎。  
**游戏 = 数据，引擎 = 固定解释器** —— 作者只写世界数据，不手搓引擎逻辑，AI 能可靠地编写与审计。  
成品是一个 all-in-one HTML：CSS + JS 全内联，双击即玩，离线，无服务器。  
公共 API 入口：`window.Amatlas.boot(WORLD, manifest)`。

## 游戏由三个源文件构成

| 文件 | 职责 |
|---|---|
| `src/world.js` | 世界数据：`{ id, start, maps:{ nodes:{ kind, look, links, events?, scene?, audio? } } }` |
| `src/game.js` | 启动胶水：`window.Amatlas.boot(WORLD, manifest)` 一句声明式装配 |
| `src/index.html` | HTML 模板 + CSS + 按序 `<script src>` 引擎脚本 |

构建器把三文件内联成 `src/dist/index.html`（单文件，双击即玩）。  
**起步：把 `examples/text-adventure-demo/` 的三个源文件复制到新建的 `src/` 工位，再只改 `src/`。**`examples/` 是只读教材，不是新游戏工位；做新游戏时不得直接修改、审计或重建 demo 来代替原创产物。

```powershell
New-Item -ItemType Directory -Force src | Out-Null
Copy-Item examples/text-adventure-demo/world.js,examples/text-adventure-demo/game.js,examples/text-adventure-demo/index.html src/
```

```bash
mkdir -p src
cp examples/text-adventure-demo/{world.js,game.js,index.html} src/
```

> **布局说明（重要）**：随包 `examples/*/` 为了可直接打开而把源文件平铺在各自目录；你的游戏仍固定写进根 `src/`。三道闸只认你传给它的路径，所以新游戏统一跑 `src/world.js` / `src/index.html`，不要把 demo 的平铺布局继续复制成新的目录惯例。

## 工作流（五步）

### 第一步：生成游戏身份

每个游戏在 `world.js` 顶层 `id` 写一个 UUID v4（存档隔离键，缺失即 fail-loud 报错）：

```bash
node -e "console.log(require('crypto').randomUUID())"
```

复制 demo 做新游戏**必须换新 UUID**，否则两款游戏碰撞存档。

### 第二步：确定游戏类型，选模块

`boot()` 按 world 里出现的内置 `kind` 自动拉对应模块：

| 类型 | kind | 起步参考 |
|---|---|---|
| 文字冒险 / 互动小说 | `'scene'` | `examples/text-adventure-demo/`，手册见 `.agents/skills/text-adventure-game/SKILL.md` |
| 跑团 / 掷骰检定 | `'encounter'` | `examples/tabletop-demo/`，设计指南见 `modules/tabletop/references/tabletop-design.md` |
| 过场演出（时间轴） | `'cutscene'` | `examples/cutscene-demo/`，写法见 `modules/cutscene/references/cutscene-authoring.md` |
| 引擎没有的玩法 | 自定义 `kind` | 复制 `modules/minimal`，读 `.agents/skills/text-adventure-game/references/plugin-development.md` |

不确定先用文字冒险做原型。混合类型（如「叙事 + 掷骰」）可在同一 world 里混用多个内置 kind，`boot()` 会自动拉全部所需模块。

### 第三步：写世界数据（`world.js`）

最小骨架：

```js
var MY_WORLD = {
  id: '替换成你的 UUID-v4',
  start: { map: 'main', node: 'intro' },
  maps: {
    main: {
      name: '主线',
      nodes: {
        intro: {
          kind: 'scene',
          name: '开头',
          look: '你站在门口。',          // 字符串 / {first,return} / (S,first)=>string
          links: [
            { label: '推开门', to: 'hall' }
          ]
        },
        hall: {
          kind: 'scene',
          name: '大厅',
          look: '大厅空无一人。',
          links: []                       // 结局节点：空 links
        }
      }
    }
  }
};
```

**关键规则**：
- 条件内容用 JS 函数（`look:(S,first)=>…`）或 `{first:'…', return:'…'}`，**没有 `{{if}}` 模板语法**（引擎不解析，会原样显示给玩家）。
- 每个非结局节点至少一个**无条件出口**（防玩家被锁死）。
- 自定义数值初始值写在顶层 `initState`（如 `initState:{ stamina:3 }`），否则 `undefined - 1 = NaN`。

详细写法：`.agents/skills/text-adventure-game/SKILL.md`（完整工作流 + 类型路由）。  
音频词汇：`.agents/skills/text-adventure-game/references/audio-system.md`（22 个音乐预设 / 15 个环境音预设）。  
视觉词汇：`.agents/skills/text-adventure-game/references/visual-system.md`。  
模块 ↔ 核心完整契约：`core/module-interface.md`（字段定义权威来源）。

### 第四步：写装配文件（`game.js` + `index.html`）

照抄 `examples/text-adventure-demo/game.js` 和 `examples/text-adventure-demo/index.html`，改 manifest 和 CSS。  
`game.js` 核心模式：

```js
var engine = window.Amatlas.boot(MY_WORLD, {
  status: function(S) { return []; },   // 状态条（可选）
  save: true,                           // 多槽存档
  minimap: { mode:'toggle', layout:'spatial' },
  achievements: [],
  reset: true
});
```

**注意**：`index.html` 里的挂载点 id（`#look`、`#choices`、`#plugin-bar` 等）必须与 manifest 配对。删掉 manifest 一项 = 同时删对应 `<script>` 和挂载 `div`，否则功能静默消失。

### 第五步：跑三道闸（必须，每次改完都要跑）

在引擎根目录（解包后的 `amatlas/`）执行：

```bash
# 闸 1：结构审计 — 死链 / 不可达节点 / 无保底出口（P0 退出码非零 = 不可发布）
node core/tooling/graph-audit.mjs src/world.js

# 闸 2：装配探针 — boot 路径 / 挂载点 / 首屏渲染 / 自动游玩运行时错误
node core/tooling/assembly-probe.mjs src/index.html

# 闸 3：构建准入门 — schema 静态检查 + 内联成单 HTML
node pipeline/build/build.mjs src/index.html
```

三道闸均为**零外部依赖**，只需 Node.js ≥18。**退出码非零即停，修复后重跑**。

可选增强（需先 `npm install jsdom`）：

```bash
node pipeline/build/build.mjs src/index.html --smoke   # 运行时烟雾：加载崩溃 / 残留占位符
```

三闸全绿后打开 `src/dist/index.html` 浏览器实玩。

## Fail-Loud 纪律

Amatlas 对非法数据**立即抛错，不静默退化**：

- `world.id` 缺失或非法 UUID → 启动即抛
- `to` 指向不存在的节点 → graph-audit P0 / 运行时抛
- boot 选项 / 模块字段错形态 → 运行时抛，错误信息含修法提示
- 字段写到错的层（如 `exit` 上写 `requires`）→ 立即抛
- 未知 ambient / sfx 预设名 → 抛（不静默降级为无声）

**遇到报错，读报错信息**；错误消息是修法指引，不要绕过。

## 关键参考文件索引

| 文件 | 内容 |
|---|---|
| `core/module-interface.md` | 模块 ↔ 核心契约（字段 / 生命周期 / 版本） |
| `.agents/skills/text-adventure-game/SKILL.md` | 完整工作流主手册（类型路由 / 5 阶段 / 规则） |
| `.agents/skills/text-adventure-game/references/` | 各专项参考：音频 / 视觉 / 插件开发 / 故事改编 / 审计 |
| `modules/tabletop/references/tabletop-design.md` | 跑团检定设计（掷骰 / DC / 角色卡 / 资源时钟） |
| `modules/cutscene/references/cutscene-authoring.md` | 过场演出写法（节拍 / 逐拍快进 / 末拍出口 / 状态一致性） |
| `examples/text-adventure-demo/` | 文字冒险主范本（复制起步） |
| `examples/showroom/index.html` | Embedded Gallery：单窗口打开 UI 皮肤 / 音频试听 / 可玩范本 / 综合作品 |
