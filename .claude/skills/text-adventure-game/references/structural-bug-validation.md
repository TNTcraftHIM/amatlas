# 审计报告结构性 Bug 验证方法论

## 核心原则

**永远不要在没有验证的情况下接受「这个节点不可达/这个 flag 未设置/这个结局锁死」的结论。**

实测数据：一份 14 项审计报告中 4/4 个「致命」结构性 bug 全部是误判。

> 在 Amatlas 模块化模型里，游戏 = `world.js`（数据：maps/nodes/links/events）+ `game.js`（组装）+
> `index.html`（模板），经 `node pipeline/build/build.mjs` 构建成单 HTML。验证审计报告时**读 `world.js` 源数据**，
> 而不是去 grep 构建产物——数据是真相，产物是它的渲染。结构层（死链/不可达/死胡同）另有
> `node core/tooling/graph-audit.mjs world.js` 自动卡死（P0 死链退出码非零，并入构建准入门）；
> 本方法论解决的是 graph-audit 卡不住的**语义层**误判（条件入口、flag 来源、动态分支、fallback）。

## 四种常见误判

### 1. 「孤儿节点」——实际有条件入口

报告说某节点「没有任何链接指向它」，但实际通过门控链接（`requires:`）或模块运行时机制接入：
不满足条件时该链接被隐藏，遍历时容易漏看。

```bash
# 验证：在 world.js 里找所有指向该节点的链接（包括被 requires 门控、当前隐藏的）
grep -n "to:.*'$NODE_ID'" engine/path/to/world.js       # 同图字符串目标
grep -n "node:.*'$NODE_ID'" engine/path/to/world.js      # 跨图 { map, node } 目标
# 再人工核对每条链接的 requires/showWhenLocked：门控不等于没有入口
```

**注意：** graph-audit 把没有 `.to` 的 link（纯 `run`/`once` 动作）不计入图边；而被 `requires` 门控的
链接**仍是图边**（只是运行时按 flag 隐藏/灰显）。报告若把「当前看不见的门控入口」当成「无入口」就是误判——
确认链接的 `requires` 条件**能否被满足**，而不是它当下是否可见。

### 2. 「flag 未设置」——实际在节点 event 的 run 中

报告说某 flag「从未被设置」，但实际在某个节点的 `events[].run` 函数体里设置
（进入节点时由引擎自动触发，作者不手写调用）。

```bash
# 验证：在 world.js 里找所有设置该 flag 的位置
grep -n "flags\.$FLAG_NAME" engine/path/to/world.js
# 它可能出现在：
# - 链接动作: links:[{ label, run:(S)=>{ S.flags.$FLAG_NAME = true; } }]
# - 节点事件: events:[{ id, run:(S)=>{ S.flags.$FLAG_NAME = true; } }]
# - 模块 actions() 里按状态生成的临时动作
```

> flag 的来源是 `run` 函数体里对 `S.flags.X` 的赋值（`S` = 引擎传入的 state）。
> 进入节点时引擎自动跑该节点 `events`（`when` 为真且未被 `once` 锁掉时），无需作者显式调用。
> 报告若只盯着链接、漏了事件里的赋值，就会误判「未设置」。

### 3. 「结局不可达」——实际由门控/模块动作动态决定

报告说某结局的确认链接指向了错误的结局，但实际是按状态条件**动态决定**走哪条：
满足条件走主路径（→ 正确结局），不满足走降级路径（→ 其他结局或返回）。

```bash
# 验证：在 world.js 里读该「检定/确认」节点的所有 links 及其 requires
grep -n "requires:" engine/path/to/world.js
# 然后读每条链接的条件，确认主路径 vs 降级路径
```

典型结构（模块化：用门控链接表达「条件分支」，无运行时改写节点）：

```js
// world.js —— 某个 "check_ending_xxx" 节点
check_ending_xxx: {
  kind: 'scene', name: '抉择之门',
  look: (S, first) => S.understanding >= 15
    ? '门后的光稳定下来——你已经看懂了一切。'
    : '门只开了一道缝，你还缺了点什么。',
  links: [
    // 主路径：满足全部条件才出现 → 正确的结局
    { label: '推开门，走进去', to: 'ending_xxx',
      requires: (S) => S.understanding >= 15 && S.flags.readNotes,
      showWhenLocked: true, lockHint: '你总觉得还没准备好' },
    // 降级路径：始终可走 → 其他结局或返回
    { label: '尝试其他方式', to: 'check_ending_yyy' },
    { label: '回到选择之前', to: 'the_choice' }
  ]
}
```

> 旧模型靠运行时改写 `choices` 来切分支；模块化**不在运行时改 `world`**——同一节点并列写出
> 主路径与降级路径的链接，由 `requires:(S)=>bool` 决定哪条对玩家可见/可走。需要更复杂的
> 「按状态生成临时选项」时，放进模块 `actions()`。报告若只读到一条链接、没核对其 `requires`，
> 就会把「条件分支」误判成「写死指向错结局」。

### 4. 「链接指向错误结局」——是 fallback/降级路径

报告说确认链接「应该去 ending_A 但去了 ending_B」，但实际是故意的
fallback 设计：当玩家不满足 ending_A 的全部条件时，降级到 ending_B。

**区分主路径和 fallback：**
- 主路径：带 `requires:(S)=>满足全部条件` 的那条链接（条件满足才可走）。
- fallback：无门控、始终可走的那条链接（通常配「你还没准备好」之类的 `lockHint` 或节点散文提示）。

## 验证流程模板

```
收到审计报告
├── 列出所有声称的结构性 bug
├── 对每个 bug：
│   ├── 读 world.js 源数据，验证问题是否真实存在
│   ├── 检查条件机制（门控链接 requires / 事件 run / 模块 actions()）
│   ├── 检查条件能否被满足（门控隐藏 ≠ 无入口；flag 在 event.run 里赋值）
│   └── 分类：确认 / 误判 / 部分误判
├── 修复确认的 bug
├── 记录误判的 bug（标注「已验证，非 bug」）
└── 继续下一项
```

## 关键 grep 命令速查

> 一律针对游戏的 `world.js`（源数据），而非构建产物。结构层先跑
> `node core/tooling/graph-audit.mjs world.js`（死链 P0、孤儿 P1、死胡同 P2），
> 再用下面这些核对 graph-audit 卡不住的语义层。

```bash
# 找所有指向某节点的入口（含被 requires 门控、当前隐藏的）
grep -n "to:.*'$NODE_ID'\|node:.*'$NODE_ID'" world.js

# 找所有设置某 flag 的位置（链接 run / 事件 run / actions）
grep -n "flags\.$FLAG" world.js

# 找所有门控链接（条件分支的入口）
grep -n "requires:" world.js

# 找 fallback/降级提示（节点散文或 lockHint 里的「还没准备好」线索）
grep -n "lockHint\|还没准备好\|缺少\|尚未" world.js
```
