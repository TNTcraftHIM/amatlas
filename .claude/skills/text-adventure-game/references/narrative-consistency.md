# Narrative Consistency Audit Reference

## Full-File Conditional Audit Protocol

When a game has optional paths, audit ALL references to optional areas.

### Step 1: Find all references
扫 `world.js` 里所有 `look` / `events` 的散文,找提及可选区域的句子:
```bash
grep -n "你在森林里\|你去了森林" world.js
```
(模块化呈现器不解析 `{{}}` 标记——条件由 `look` 函数体里读 `S.flags` 决定,所以这里直接读 `world.js` 数据,不再过滤标记。)

### Step 2: Classify each reference
- **Observational** (远处的森林在移动) → No change
- **Experiential** (你在森林里见过的符号) → Condition on a flag inside `look`
- **NPC quote** (「他去了森林里」) → No change
- **In-scene** (你站在森林的入口处) → No change

### Step 3: Check reachability
If scene is ONLY reachable through that area, refs are OK. Otherwise condition them.

### Step 4: Apply fixes
Strategy A (preferred): Generalize — `一种来自地底深处的震动`
Strategy B (fallback): 把那句写进 `look` 函数,按 flag 分支:
```js
look: (S, first) =>
  (S.flags.entered_forest ? '你在森林里见过的' : '岛上其他地方出现的') + '符号又闪了一下。'
```

## Hub Scene Identification
数 `links` 的 `to` 目标,入度高的就是枢纽节点。`to` 可为字符串(同图 node id)或 `{map,node}`(跨图):
```bash
grep -oP "to:\s*['\"](\w+)['\"]" world.js | sort | uniq -c | sort -rn | head -20
```
Opening rule: Only describe "where you are" and "what you see". Never reference past actions.

## Hub Scene First-Visit vs Revisit (Critical Pattern)

Scenes with 5+ inbound links MUST distinguish first visit from revisit.

引擎按访问计数自动判定首次/重访(`firstTime`,`visits<=1`)——**作者不必手动设 flag、也不必手写「来路判断」**。直接用 `look` 的 first/return 双形态(或函数的 `first` 参数):

**Template:**
```js
look: {
  first:  '你来到[地点]。[完整的首次到达描写]',
  return: '你回到了[地点]。[简短的2-3句重访描写]'
}
// 或函数形态,可再叠别的 flag 条件:
look: (S, first) => first
  ? '[完整的首次到达描写]'
  : '你回到了[地点]。[简短的2-3句重访描写]'
```

**Rules:**
1. 首次/重访由引擎访问计数(`first` 参数 / `firstTime()`)自动给出——**无需**靠 flag 区分到没到过
2. Time descriptions (sunset, "walked 2 hours") go ONLY in first-visit branch (`first===true`)
3. 若要叠加「来自哪里」之类的额外条件,读一个来自**别的**场景的 flag(village_entrance 自己进过就够了用 `first`;想区分「见过族长没」则读 `S.flags.met_chief`),不要为「到没到过本场景」再造 flag
4. Revisit text should be 30-50% shorter but still evocative
5. Include at least one new detail in revisit text

**Tested examples:**
- camp_setup (9 entries): first="搭建遮棚+日落" / revisit="遮棚还在,海图摊在石头上"
- deep_forest (9 entries): first="跋涉两小时+发现倒木" / revisit="你知道规律了"
- village_market (5 entries): first="卡伊带你参观" / revisit="卡伊不在"
- village_entrance (4 entries): first="菌门+初见村庄" / revisit="菌门认出你"

## NPC Transition Checklist
1. First sentence establishes who is present?
2. If NPC moved from previous scene, transition added?
3. If NPC might not be encountered yet, reference conditional?

## Ending Reflection Pattern
Each ending gets 2-3 flag-conditional sentences BEFORE the outcome — 写在结局节点的 `look` 函数里,按 `S.flags.X` 拼接(见下方「写法」)。

| Ending | Theme | Best flags |
|--------|-------|-----------|
| control | "你也曾想控制" | rechecked_case, touched_tree |
| coexist | "你学会了跟随" | visited_shrine, learned_flow |
| truth | "你追求真相" | has_journal, visited_shrine |
| destroy | "你本能保护" | saved_ink_first, touched_tree |
| transcend | "你与岛屿连接" | entered_forest, found_ink_spring |
| synthesis | "你收集碎片" | 石板, heard_elder_tales |

**Extended flag pool for endings (use 2-3 per ending, rotate across endings):**
- `sided_with_kol` → "科尔会理解你的选择"
- `sided_with_chief` → "族长的智慧在你脑中回响"
- `sided_with_nobody` → "你不站在任何一边"
- `witnessed_shift` → "你亲眼看过重排"
- `visited_echo_chamber` → "回声之室里前人的声音还在回响"
- `know_renar_fate` → "你知道了雷纳的命运"
| `has_journal` → "雷纳的笔记你已经读了很多遍"
| `entered_forest` → "你想起第一次走进森林时的感觉"

**Selection principle per ending:**
- Choose flags that create **thematic irony** or **emotional resonance** with that ending's moral
- ending_control + sided_with_kol = "科尔会理解" (you both believed in control)
- ending_destroy + visited_echo_chamber = "前人的声音回响...你选择了第七种方式：放下"
- ending_coexist + sided_with_chief = "族长的智慧...跟随不是被动的"
- Don't use more than 3-4 flags per ending — dilution weakens the effect

**写法(在结局节点的 `look` 里拼条件句):**
```js
ending_control: {
  kind: 'scene', name: '尾声 · 控制',
  look: (S) => [
    S.flags.rechecked_case ? '你也曾想控制——像当初反复核对那只皮箱。' : '',
    S.flags.touched_tree   ? '指尖触树的那一刻你以为掌握了什么。' : '',
    '——但岛屿不属于任何人。'   // outcome 永远在最后
  ].filter(Boolean).join('\n')
}
```

## Flag Audit: Checked-But-Never-Set

A flag READ in some `look` (e.g. `S.flags.xxx`) that no `run:` ever WRITES (`S.flags.xxx = true`) is a dead condition — always false. (Flags 读在 `look`/`requires`,写在 link/event 的 `run` 函数里。)

```bash
# Extract all read flags (出现在 look/requires 里读取)
grep -oP "S\.flags\.\K\w+" world.js | sort -u > /tmp/read.txt
# Extract all written flags (出现在 run 里赋值)
grep -oP "S\.flags\.\K\w+(?=\s*=)" world.js | sort -u > /tmp/set.txt
# Find read but never written
comm -23 /tmp/read.txt /tmp/set.txt
```

Fix: 在合适场景的 link/event `run` 里把该 flag 写成 true。Example: `visited_ruins` 应在 `ancient_ruins` 节点(进入事件或抵达它的 link)的 `run:(S)=>{ S.flags.visited_ruins = true; }` 里设上。

## Requires System Audit

The engine supports conditional options via `requires:`(一个返 bool 的函数,接 state),but it's easy to forget entirely (0 usage is common).

```bash
# Check how many options use requires
grep -c "requires:" world.js
```

If count is 0, the entire flag/attribute system is decorative — player choices don't actually gate content.

**Minimum viable requires (don't over-lock)** —— `requires` 是函数,读 `S` 的属性/flag/inventory 返 bool;配 `showWhenLocked:true` + `lockHint` 灰显:
- Most special ending path → `requires: (S) => S.understanding >= 15` 或 `requires: (S) => S.flags.learned_flow`
- Deep content needing specific item → `requires: (S) => (S.inventory||[]).includes('刻符石板')`
- Advanced NPC dialogue → `requires: (S) => S.understanding >= 8`
- Special skill use → `requires: (S) => S.understanding >= 5`

**Principle:** At least 4 of 6 endings should be reachable without any requires. Only the most special paths should be gated.

## Misleading Option Text Audit

Options that say "return to camp/beach" but trigger plot events (like a shift/earthquake) create a jarring experience — the player expects a mundane action but gets a dramatic event.

```bash
# Find all "return to X" options
grep -n "回到海滩\|回到营地\|回营地\|回海滩" world.js
```

For each result, check if the link's `to` goes to the expected safe destination (camp_setup) or to a plot event (first_shift, act1_end, etc.). 也留意纯动作 link 的 `run` 是否会偷偷推进剧情/改 `S.clock`。

**Fix:** Add unease hints to the option text:
- `"天色渐暗，开始往回走"` (hints at approaching event)
- `"但空气中有什么不对"` (explicit unease)
- `"脚下的地面突然微微震动"` (physical signal)

**Don't** change the destination — the plot event IS what happens next. Just make the option text honest about the transition.

## Chinese-Specific Text Bugs

AI-generated Chinese text has systematic duplication bugs that don't appear in English:
- `一种一种X` → `一种X` (measure word duplication, ~14 per 60K chars)
- `了了` → `了` (particle duplication, usually at sentence end)

These exist in the initial generation, not from editing. Must be cleaned as a separate pass —— 清在**源** `world.js`(散文写在那里),构建会把修订带进单 HTML:
```bash
sed -i 's/一种一种/一种/g' world.js
grep -n "了了" world.js  # check case-by-case, "了解了" is valid
```

## 四种不一致模式（速查 + 修复模板）

分支叙事最容易犯的错误是"按最完整路线写"——假设玩家去过每个地方、拿过每个物品、见过每个 NPC。下面四种模式各配 inline `look` 修复模板。

**模式 A：Hub 场景上下文假设（最常被忽略）**
某些场景被 10+ 条路径指向（如 camp_setup 有 11 个入口），但文本按"最完整路线"写了唯一版本。
**铁律：Hub 场景开头只描述"你在哪、你看到什么"，绝不引用"你之前做过什么"。**
引用过去经历的内容放在 `look` 函数里、用 flag 分流保护：`look:(S)=> '基础描述' + (S.flags.did_x ? '（引用你做过 x）' : '')`。
- 反例：`你穿过逐渐稀疏的树林回到海滩`——走海滩线的玩家没进过树林。
- 正例：`你在海滩高处找了一块平坦的岩石`——所有路径都合理。
- 识别方法：读 world.js，统计每个节点入度（数所有 `links[]` 里 `to === 'scene_id'` 的条数），入度 >5 的就是 Hub 场景，逐一检查其 `look` 开头文本。

**模式 B：空间跳跃无过渡**
场景 A 在森林深处结束 → 场景 B 突然在海滩开始。
修复：B 开头加 1-2 句过渡（"你穿过逐渐稀疏的树林回到海滩"）。多入口场景用 `look` 函数按 flag 分流：
`look:(S)=> (S.flags.entered_forest ? '你穿过逐渐稀疏的树林回到海滩。' : '') + '海滩在你面前展开。'`

**模式 C：引用可选经历**
"和你在森林里看到的一样"——但玩家可能没去过森林。
修复优先级：(a) 改为不依赖特定经历的通用表述 > (b) `look` 按 flag 分流。
例："一种来自地底深处的震动" 优于 "和你在森林里感觉到的一样"。

**模式 D：物品/机制矛盾**
文本说"用铅笔画"但游戏扣墨水。文本说"你拿出笔记本"但玩家没有。
修复：统一描写（铅笔→碳墨笔），可选物品在 `look` 里判：
`look:(S)=> (S.inventory||[]).includes('notebook') ? '你拿出笔记本。' : '你凭记忆描下。'`。

## NPC 过渡铁律：每场景前 2 句回答"我在哪 / 谁在场"

**每个场景的前 2 句话必须回答两个问题：**
1. **我在哪？**（空间定位）
2. **谁在场？**（人物定位）

违反此规则的典型场景切换：
- 上一场景在集市买墨水 → 下一场景卡伊突然在说话（他怎么出现的？）
- 上一场景结束对话 → 下一场景 NPC 突然在翻纸卷（她什么时候走过去的？）
- 上一场景在读日记 → 下一场景赛琳突然出现拿出旧纸（你怎么到她那里的？）

修复模板：在目标场景开头加 1-2 句过渡，交代「从哪来」和「谁在场」。
例：`买完墨水后，卡伊没有离开。他跟在你身边，听到你说...`

## 空间跳跃过渡（具体范例）

场景 A 在位置 X 结束 → 场景 B 在位置 Y 开始，必须有过渡：
- 宴会散场 → 夜市：`宴会的人群渐渐散去。篝火的火焰矮了下去...`
- 地下河 → 墨泉：`你沿着溪流逆流而上，穿过越来越窄的通道...`
- 森林 → 村庄广场：`你穿过被风暴改变的地形，回到了村庄...`

## 路径走查协议（Path Walkthrough Protocol）

写完所有场景后，沿主要路径逐一检查衔接：
1. 读 A 最后 2 段 → 选项 → B 前 2 段
2. 空间连续？时间连续？上下文连续？
3. B 是否引用了这条路径上没发生过的事？
4. NPC 对话是否假设了玩家必经的经历？

## 全文条件审计：观察性 vs 经历性判断框架（补充 Step 2 分类）

（基础四步协议见本文件开头「Full-File Conditional Audit Protocol」。下面是分类判断的细化框架与豁免规则。）

逐一判断每个无条件输出的可选区域引用：
- 该场景是否只在该区域路径上可达？（是 → 无需条件化）
- 该引用是观察性还是经历性？（观察远处的森林 ≠ 在森林里见过符号）
- 需要条件化的 → 在 `look` 里按 flag 分流：`look:(S)=> S.flags.entered_forest ? '你在森林里见过的…' : '岛上其他地方出现的…'`

**观察性 vs 经历性判断框架：**
- ✅ 观察性（无需条件化）：`远处的森林在移动`、`森林那边传来嗡鸣声`、`森林深处的一片空地`
- ❌ 经历性（需要条件化）：`你在森林里见过的符号`、`和你在森林里看到的一样`、`你离开森林后`
- ✅ NPC 引述（无需条件化）：`「他去了森林里」`、`「森林接受了他」`（引用 NPC 的话）
- ✅ 哲学/时间线描述（无需条件化）：`现在它在森林里，五十年后它又回到了海底`

**必经路径场景豁免：**
如果场景 A 只能从区域 B 的路径到达，那么 A 中引用 B 不需要条件化。
例：`village_discovery` 只能从 `deep_forest`/`strange_trees` 到达，所以 `你在森林里见过的符号` 在 village_discovery 中不需要条件化。
判断方法：读 world.js，把指向该节点的 `links[].to` 反查出所有入边，追溯是否所有路径都经过该区域。

替代文本策略：
- **通用化优先**：`一种来自地底深处的震动` 优于 `和你在森林里感觉到的一样`
- **flag 分流兜底**：`look:(S)=> S.flags.entered_forest ? '你在森林里见过的' : '岛上其他地方出现的'`

对每个可选物品/经历都要做同样的审计：读 world.js 各节点 look，看引用特定路径事件/NPC（如"你读了雷纳 / 你去了神殿 / 你看了遗迹"）的文案是否按 flag（或 inventory）分流——无条件输出 = 隐患。

## 物品路径分析

对每个可选物品，确认：
- 在哪个场景获取？是否所有路径都经过？
- 被引用了多少次？哪些引用需要条件化？
- 必经路径上的物品不需要条件文本，可选物品需要。

## 结局旅程回顾：插入位置补充

（完整模式、flag 选取表、写法模板见本文件「Ending Reflection Pattern」。）
**插入位置：** 结局文本的第一个 `<p>` 之前（SVG 之后）。命中的 flag 才追加对应 `<p>`：
```js
look:(S)=> (S.flags.rechecked_case ? '<p>你想起自己也曾想控制它。</p>' : '')
         + (S.flags.touched_tree   ? '<p>你的手指还记得树皮的纹路。</p>' : '')
         + '<p>……结果描写……</p>'
```
