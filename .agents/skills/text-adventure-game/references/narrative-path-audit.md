# 叙事路径审计方法论

## 概述

分支叙事游戏最隐蔽的 bug 不在代码里，在路径里。玩家走了一条你没想过的路，
遇到没见过的角色，读到不合理的故事——这是叙事路径 bug。

## 方法：节点图 + BFS

> 结构层（死链 / 不可达 / 死胡同）由引擎自带的 `node core/tooling/graph-audit.mjs world.js`
> 自动卡死（P0 死链退出码非零，并入构建准入门）。本方法论解决的是 graph-audit
> **有意不做**的**叙事层**问题——「图是连通的，但某条路径上的故事不合理」。
> 下面用同一套 BFS/路径分析在 `world.js` 数据上做叙事推理，是对结构审计的补充。

### 第一步：提取节点图

模块化游戏的图就写在 `world.js` 里——直接 `require`/`import` 这份数据，
遍历 `maps.<map>.nodes.<node>.links[]`，把每条带 `to` 的链接（移动边）收进有向图：

```js
// 直接读 world.js 数据（不需要正则爬源码——模块化下图就是结构化数据）
const world = require('./world.js');   // 或构建前合并的多片段

const graph = {};
const add = (from, to) => (graph[from] ??= new Set()).add(to);

// 跨图 to 归一成 "map/node" 键；同图 to 是字符串
const key = (mapId, to) =>
  typeof to === 'string' ? `${mapId}/${to}` : `${to.map}/${to.node}`;

for (const [mapId, map] of Object.entries(world.maps)) {
  for (const [nodeId, node] of Object.entries(map.nodes)) {
    const from = `${mapId}/${nodeId}`;
    for (const link of node.links ?? []) {
      if (link.to == null) continue;          // 纯动作（run/once）不是边，跳过
      add(from, key(mapId, link.to));
    }
  }
}
```

> 注：纯动作链接（只有 `label`+`run`、无 `to`）不移动玩家，不计入图——
> 这和 `graph-audit.mjs` 的边定义一致。

### 第二步：BFS 遍历

从起点节点（`world.start` = `{map,node}`，键 `'map/node'`）做 BFS，记录每个可达节点的最短路径：

```js
const start = `${world.start.map}/${world.start.node}`;
const visited = new Map();
const queue = [[start, 0, [start]]];
while (queue.length) {
  const [node, depth, path] = queue.shift();
  if (visited.has(node)) continue;
  visited.set(node, [depth, path]);
  for (const t of graph[node] ?? new Set()) {
    if (!visited.has(t)) queue.push([t, depth + 1, [...path, t]]);
  }
}
```

### 第三步：路径分析

对每个关键节点，检查路径上是否包含必要的前置节点（节点用 `'map/node'` 键）：

```js
function findAllPaths(start, target, visited = new Set(), maxDepth = 20, path = []) {
  path = [...path, start];
  if (start === target) return [path];
  if (visited.has(start) || path.length > maxDepth) return [];
  visited.add(start);
  const results = [];
  for (const t of graph[start] ?? new Set()) {
    results.push(...findAllPaths(t, target, new Set(visited), maxDepth, path));
  }
  return results;
}

// 检查：到达 village/storm_arrives 的路径是否都经过了 village/village_conflict？
const paths = findAllPaths(start, 'village/storm_arrives');
const bypass = paths.filter(p => !p.includes('village/village_conflict'));
console.log(`绕过 village_conflict 的路径: ${bypass.length}`);
```

### 第四步：requires 门控检查

上面的图分析只看「边存不存在」，**不看** `requires` 门控（一条边在数据上存在，但运行时
可能被 `requires:(S)=>…` 挡住）。门控直接写在链接上，遍历数据即可核对：

```js
// 列出每个节点入边携带的门控：哪些链接有 requires（gate），哪些是裸边（无保护）
for (const [mapId, map] of Object.entries(world.maps)) {
  for (const [nodeId, node] of Object.entries(map.nodes)) {
    for (const link of node.links ?? []) {
      if (link.to == null) continue;
      const dest = typeof link.to === 'string' ? `${mapId}/${link.to}` : `${link.to.map}/${link.to.node}`;
      const gated = typeof link.requires === 'function';   // 模块化：requires 是 (S)=>bool 函数
      console.log(`${mapId}/${nodeId} → ${dest}  ${gated ? '[gated]' : '[裸边]'}`);
    }
  }
}

// 关键节点（如 village/storm_arrives）若存在任何一条「裸边」入口，
// 就是叙事黑洞候选——玩家可绕过门控直达。
```

> 模块化下 `requires` 是写在链接上的 `(S)=>bool` 函数（见 demo 的
> `requires: function (S) { return S.flags.readNotes; }`）；它返回真值才放行。
> 不满足且 `showWhenLocked:true` → 灰显并显示 `lockHint`；不满足且无该标记 → 隐藏（防剧透）。

## 常见叙事路径 Bug

### Bug 1：绕过 NPC 介绍

**症状：** 后续场景引用了未介绍的 NPC（名字、对话、外貌描写）

**根因：** 关键剧情节点有多条入口，其中一些不经过 NPC 首次出场节点

**修复：** 给绕过路径的那条链接加门控 `requires: (S) => S.flags.met_npc_name`

### Bug 2：跳过关键剧情事件

**症状：** 后续场景假设玩家经历了某个事件（如"村庄冲突"），但路径可以完全绕过

**根因：** 事件节点不是瓶颈点——有多条路径到达后续节点

**修复：** 给后续节点的入口链接加门控 `requires: (S) => S.flags.event_name`

### Bug 3：地点引用不合理

**症状：** "回到村庄" 但玩家从未去过村庄；"你站在广场上" 但从观测台来的玩家不在广场

**根因：** 节点的 `look` 文本假设了特定的空间状态，但路径可能从不同位置到达

**修复：** (a) 把 `look` 写成函数按状态分叉 `look: (S) => S.flags.been_square ? '回到广场…' : '你走进一片陌生的空地…'`
（模块化呈现器不解析 `{{if}}`，条件文本一律走 `look` 函数或 `look:{first,return}`）
(b) 给入口链接加前置 `requires` 门控 (c) 改为不依赖空间状态的通用描述

### Bug 4：命名过早

**症状：** 物品/概念在被正式命名之前就被文本使用了正式名称

**根因：** 后写的节点 `look` 文本使用了物品的最终名称，但叙事上玩家还不知道这个名字

**修复：** 命名前用通用称呼（"那瓶墨水"），命名后用正式名称（"活墨水"）

## requires 门控语法

模块化下 `requires` 是写在链接（link）上的**谓词函数** `(S) => bool`——
返回真值才放行。任意状态都能在函数体里读，比旧的固定对象格式更灵活：

```js
// 在 world.js 某节点的 links[] 里：
{ label: '进入村庄', to: 'village', requires: (S) => S.flags.flag_name }       // 检查 flag
{ label: '解读石碑', to: 'tablet',  requires: (S) => (S.understanding || 0) >= 15 } // 检查理解值
{ label: '撬开石门', to: 'inner',   requires: (S) => (S.inventory || []).includes('刻符石板') } // 检查物品
{ label: '点亮符文', to: 'rune',    requires: (S) => (S.ink || 0) >= 5 }         // 检查资源量

// 组合条件也只是普通布尔表达式：
{ requires: (S) => S.flags.met_chief && (S.understanding || 0) >= 15 }
```

> 谓词返真才放行。配 `showWhenLocked:true` 时不满足则灰显，并显示 `lockHint`
> 自定义提示文字；不配则隐藏（防剧透）。`lockHint` 直接写人话，无需额外的名称映射表。

## 提示文字可读性

灰显时呈现器显示 `lockHint` 文本——直接在链接上写人话即可，技术 flag 名不会泄露给玩家：

```js
{ label: '进入村庄深处', to: 'village_inner',
  requires: (S) => S.flags.village_conflict, showWhenLocked: true,
  lockHint: '你得先了解村庄里发生的事' }   // ← 玩家看到的是这句，不是 flag 名

// 若想在审计/调试里把内部 flag 翻成可读名，自己维护一张映射即可：
const FLAG_NAMES = {
  village_conflict: '村庄冲突事件',
  arrived_village: '到达村庄',
  learned_flow: '学习流动记录',
  met_chief: '见过族长'
};
```

## 实战案例：《制图师的挽歌》路径审计

### 发现的问题

| 节点 | 问题 | 绕过路径 | 修复 |
|------|------|----------|------|
| renar_camp | 绕过村庄 | coastal_path → renar_camp | 入口链接加 `requires: (S) => S.flags.arrived_village` |
| mountain_path | 绕过村庄 | act1_end → mountain_path | 入口链接加 `requires: (S) => S.flags.arrived_village` |
| storm_arrives | 绕过村庄冲突 | observatory → storm_arrives | 入口链接加 `requires: (S) => S.flags.village_conflict` |
| storm_arrives | 引用未介绍的科尔 | observatory → storm_arrives | 入口链接加 `requires: (S) => S.flags.village_conflict` |
| act3_start | 引用未介绍的赛琳 | observatory → shelter_cave | 入口链接加 `requires: (S) => S.flags.village_conflict` |
| observatory | 直达风暴无引导 | observatory → storm_arrives | 改链接 `to` 先指向 village_entrance |

### 关键发现

- 所有 189 条从 prologue 到 act3_start 的路径都跳过了村庄（在 gate 修复前）
- observatory 是最大的叙事黑洞——它可以跳过几乎所有 Act 2 内容
- `arrived_village` flag 不够——只意味着"到了村庄入口"，不意味着"见过关键角色"
- `village_conflict` flag 才是真正的瓶颈标志——它意味着玩家经历了完整的村庄线
