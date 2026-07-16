# 插件开发指引(创建新模块 / 呈现器 / 能力插件)

> 本指引**通用**(不限文字冒险)。**动手前先按 `.claude/rules/building-discipline.md` 写出你的计划**(目标 / 步骤 / 每步"做完长什么样"),再开始——尤其守住三条:**不假设(说出假设)、从最小可工作版本起、写一个测一个**。

Amatlas = 通用核心(`core/`,**类型无关、不要改它**)+ 叠加的插件。三类插件共用同一入口 `engine.use(...)`(契约 §2.2):
- **玩法模块**:定义一种 `node.kind` 的含义 + 玩法 + `render`(如 text-adventure / tabletop / minimal)。
- **呈现器(presenter)**:消费 `View`(含 `scene`/`audio` 意图)产出画面/声音(如 present-dom / present-svg / present-audio)。
- **能力插件**:订阅核心事件、加 UI(如 save / minimap / achievement)。

写实现前先读契约 `core/module-interface.md`(View 形状 `{mapname?,title,body,status,scene?,audio?}`、`api` 表面、`scene/audio` 词汇)。

---

## 第一部分:决策树(先判断该做什么)

```
用户想做什么?
├─ 用现有模块做游戏
│  ├─ 叙事 / 对话 / 探索 / 互动小说  → 走 text-adventure-game SKILL 的 5 阶段工作流
│  └─ 检定 / 资源管理 / 角色卡(跑团)→ 参考 modules/tabletop/references/few-shot.md
├─ 需要引擎里没有的**玩法类型**(横版射击 / 模拟经营 / 卡牌 / 打地鼠…)
│  └→ 创建新的**玩法模块**(§第二部分;先看 Level 1)
├─ 需要引擎里没有的**视觉/听觉表现**(Canvas 2D / WebGL / 像素风…)
│  └→ 创建新的**呈现器**(§呈现器)
├─ 需要引擎里没有的**辅助功能**(排行榜 / 多语言 / 教程引导…)
│  └→ 创建新的**能力插件**(§能力插件)
└─ 以上组合 → 分别创建,各自经 use() 注册(组合范例见 examples/tabletop-demo/game.js)
```

**不确定?** 先用 minimal 模块(或文字冒险)做一个能跑的原型,再决定要不要换/加模块——别卡在"先设计完美架构"。

---

## 第二部分:核心策略——复制最接近的现有示例,再修改

> **依据**:Scaffolding Skill(Claude Code 官方推荐)的核心思路是"**找最接近的现有示例作模板,复制再修改**",比"给抽象骨架从头填"可靠得多——AI 擅长改已有代码、不擅长从空白推导。ETH Zurich 实证:过度复杂的指令会拖垮弱模型。
> **三级是同一条路径的自然延伸**:走到 **Level 1 就能交付能跑的东西**(保底);更复杂时再上 Level 2 / 3。

### Level 1(保底,任何模型都能做):复制 minimal 模块 → 改名 → 逐步替换

引擎自带 `modules/minimal/`(一个完整、能跑、~30 行的计数器模块)+ `examples/minimal-demo/`。照下面**每步都跑验证**:

```
步骤 1 · 复制 + 登记
  cp -r modules/minimal modules/<你的类型>          # 如 modules/whack
  cp -r examples/minimal-demo examples/<你的类型>-demo
  在 test/run.cjs 的 TESTS 数组加一行:['<你的类型>/module','modules/<你的类型>/test/<你的类型>.test.cjs']
  (把复制进来的 minimal.test.cjs 改名成 <你的类型>.test.cjs)
  跑:node test/run.cjs   → 期望:仍全绿(复制品 = 原始版,只是换了位置)

步骤 2 · 改名(机制性)
  grep 复制目录里的 minimal / Minimal / MINIMAL / counter,逐处改成你的名字:
    id:'minimal'→你的id  nodeKinds:['counter']→['你的kind']  Amatlas.Minimal→Amatlas.你的名
    createMinimalModule→create你的Module  MINIMAL_WORLD→你的_WORLD  world.js 节点 kind:'counter'→'你的kind'
  跑:node test/run.cjs
  → 期望:**先红**(test 还在查旧 kind/id)→ 同步把 test 里的断言也改成新名 → **再绿**。
  (这一红一绿正是"写一个测一个":测试在告诉你哪里还没改干净。)

步骤 3 · 改 render(产出你的 View)
  把 render 改成返回你的内容(title/body/status;要画面/声音再加 scene/audio)。
  跑:node test/run.cjs  → 改 test 断言验证 View 含你的内容 → 绿。

步骤 4 · 改 actions(你的玩法动作)
  把 inc 动作换成你的动作(run(st) 里改状态)。
  跑:node test/run.cjs  → 断言"点动作后状态如期变化" → 绿。
  ⚠️ 若你的 actions 复用 api.linkActions(node,state)(免费获得 links 出口/门控/灰显),**必须**同时包装捕获
  link.run 的返回字符串并在 render 里显示一行(契约 §4.3:返回 string=本次回应文本;模块各自捕获——
  照抄 renderer.js / tabletop.js 的逐字对称写法,否则纯动作点击"没反应")。

步骤 5 · 改 world.js(你的关卡数据)+ 构建
  在 <你的类型>-demo/world.js 写你的节点(多节点就给节点加 exits,核心自动生成移动动作)。
  跑:node pipeline/build/build.mjs examples/<你的类型>-demo/index.html
  → 期望:exit 0、产物 dist/index.html 残留外链 0 → 双击它即玩。
```

### Level 2(中等模型):复制最接近的**现有模块**

minimal 太简单时(你要做的比计数器复杂得多),复制和你想做的**最像的**现有模块:
- 要做**叙事 / 对话 / 探索 / 首次-重访 / 一次性事件** → 复制 `modules/text-adventure`(`runtime/renderer.js`)。
- 要做**检定 / 资源 / 角色卡 / 骰子 + scene·audio 意图** → 复制 `modules/tabletop`(`runtime/tabletop.js`)。

复制它的目录结构,逐步替换成你的逻辑。**保留它的测试骨架**(改断言内容、不改 ok()/spawn 结构)——比从零写测试可靠得多。步骤同 Level 1 的"复制→登记→改名→逐步替换→build",只是起点更接近你的目标。

### Level 3(强模型,复杂模块):在 Level 2 基础上拆子系统

模块涉及 **≥3 个独立子系统**(如横版射击的物理 / 精灵 / 关卡 / 相机)时,在替换过程中把逻辑拆到子文件,各自独立 `export` + 独立测:

```
modules/<你的类型>/
  runtime/
    main.js        ← 主文件:组装子系统 + 导出 plugin(对外仍是一个 use-able 插件)
    physics.js     ← 子系统(可独立 import 测、可独立改)
    sprites.js     ← 子系统
  test/<你的类型>.test.cjs   ← 各子系统可独立 require 测
```

好处:用户说"改碰撞手感" → 只改 `physics.js`,其它子系统的测试不受影响。

### 呈现器和能力插件同理(也是三级:复制 minimal 级别的 → 复制最像的 → 拆子系统)

- **新呈现器**:复制 `presenters/present-svg.js` 的"**纯函数(`buildSceneSVG`:View→SVG 字符串)+ 薄 DOM 包装(工厂返回的对象带 `install`,经 `engine.use(createXPresenter())` 注册、内部 `api.addPresenter` 挂上)**"分离模式——纯函数易测,DOM 包装只管挂。要做 Canvas/WebGL 就把"画 SVG 字符串"换成"画到 canvas"。
- **新能力插件**:复制 `plugins/save.js`(导出/导入)或 `plugins/achievement.js`(`on:'enter'/'action'` + `when` 条件 + 解锁弹窗)的"**use 注册 + 订阅核心事件(`api.on`)+ 渲染到约定插槽**"模式。

---

## 第三部分:集成与构建

1. **文件放哪**:玩法模块 → `modules/<类型>/runtime/`+`test/`;呈现器 → `presenters/`;能力插件 → `plugins/`。
2. **注册**:默认在 `game.js` 的 `Amatlas.boot(WORLD, manifest)` 里声明——玩法模块放 `manifest.modules:[你的工厂()]`,呈现器/能力插件按 boot 支持的 manifest 项配置;工厂返回的对象仍是带 `install` 的 use-able plugin(内部按需 `api.registerModule(mod)` / `api.addPresenter(...)` / `api.on(...)`)。需要底层手写时,再用 `engine.use(你的工厂())` 这个 escape hatch。
3. **测试**:测试文件放 `test/`,在 `test/run.cjs` 的 `TESTS` 数组登记一行 → `node test/run.cjs` 自动发现并跑(纯 node、零依赖、静默成功)。
4. **构建单 HTML**:`index.html` 的 `<script src>` 指向你的文件,`build.mjs` 会**自动内联**所有它们 → 一个 all-in-one HTML(离线双击)。构建前过**硬准入门**(死链/坏 start = P0 拒绝;P1/P2 仅警告不阻断)。**index.html 的 CSS 要精致**(不是裸默认样式)→ 默认接入共享 `ui/amatlas-skins.css` + `data-ui`,按 `references/ui-skins.md` 调 token;完全自定义时再参考 `references/game-design-guide.md` §5。
5. **契约**:View 形状 / `api`(`dice`/`clock`/`on`/`emit`/`firstTime`…)/ `scene`·`audio` 词汇见 `core/module-interface.md`——**用足现有词汇,真不够再走契约变更**,别硬塞。

## 常见坑(动手前知道,省一轮)
- **别改 `core/runtime/engine-core.js`**:核心类型无关、有意不读 View 字段;新能力一律经 `use()` 在外层叠加(契约 §2.2)。改核心 = 走错了层。
- **单节点世界**会被 graph-audit 报 **P2「死胡同」**(可疑级,**不阻断构建**);给节点加 `exits` 即消除。
- **世界数据必须 Node-require 得出且 UMD 导出 `{id,start,maps}`**(build 靠这个找世界);`id` 是创建游戏时生成一次并长期保持的 UUID v4，复制模块 demo 做另一款游戏时换新 UUID。照抄 minimal/tabletop 的 world.js UMD 头即可。
- **移动是免费的**:节点写了 `exits`,核心自动生成移动动作——模块不必自己产移动动作(见 minimal 注释)。
- 验证失败先**读懂为什么**再改(`building-discipline` 第 3 条),别盲目重试。

> 做完后若形成了可复用的风格/模式/流程,考虑固化成你自己的 skill —— 见 `references/creating-skills.md`。
