# Writing Quality Reference — Interactive Fiction

Quick-reference for generation and review. If a word or pattern appears here, replace or remove it.

---

## Anti-Slop Tier 1 — Kill on Sight

These words are **never** the best choice in interactive fiction. Find them, delete them, rewrite the sentence.

| Word | Why it's dead | Replace with |
|------|--------------|--------------|
| delve | "Delve into" says nothing | explore, dig, search, pry open |
| utilize | Pretentious "use" | use |
| leverage (verb) | Corporate jargon | use, exploit, work with |
| facilitate | Bureaucratic | help, enable, make possible |
| elucidate | "Elucidate the mystery" is irony | explain, reveal, uncover |
| embark | "Embark on a journey" — every LLM ever | start, set out, leave |
| endeavor | "Endeavor to" = try | try, attempt, push |
| encompass | "Encompassing many" = vague | include, cover, span |
| multifaceted | Filler adjective | [delete, be specific] |
| tapestry | "Tapestry of X" — zero meaning | [delete, describe the thing] |
| testament | "A testament to" — throat-clearing | [delete, show the evidence directly] |
| paradigm | Academic filler | model, pattern, way of thinking |
| synergy | Corporate | [just delete] |
| holistic | Vague | whole, complete, all-encompassing (only if needed) |
| catalyze | Chemistry metaphor nobody asked for | trigger, spark, start |
| juxtapose | "Juxtapose X with Y" — show the contrast instead | [describe both, let reader compare] |
| nuanced (filler) | "A nuanced situation" = I have nothing to say | [delete, add actual detail] |
| realm | "The realm of magic" — every fantasy LLM | world, land, place, kingdom |
| landscape (metaphorical) | "The political landscape" — corporate | [delete, be concrete] |
| myriad | "Myriad of" is wrong; standalone is pretentious | many, countless, hundreds of |
| plethora | "A plethora of" = too many, usually wrong | many, too many, a flood of |

**Hard rule:** 0 Tier-1 words per scene. If you find one, rewrite the sentence.

---

## Anti-Slop Tier 2 — Suspicious in Clusters

OK once per scene. If two or more appear in the same paragraph, rewrite.

`robust` · `comprehensive` · `seamless` · `innovative` · `intricate` · `pivotal` · `crucial` · `foster` · `underscore` · `moreover` · `furthermore` · `notably` · `remnants` · `undercurrent` · `interplay` · `indeed`

**Check:** `grep -iE '(robust|comprehensive|seamless|innovative|intricate|pivotal|crucial|foster|underscore|moreover|furthermore|notably|remnants|undercurrent|interplay|indeed)' world.js`

If ≥3 hits in one node's `look` text, that scene needs an editing pass.

---

## Structural Slop Patterns

These are sentence-level and paragraph-level templates that signal LLM autopilot.

| Pattern | Example | Fix |
|---------|---------|-----|
| **"Not just X, but Y"** | "Not just a sword, but a symbol of hope." — most overused LLM rhetorical device | Pick one. Commit. |
| **"It's worth noting that…"** | "It's worth noting that the door is locked." | "The door is locked." |
| **"This is where X comes in"** | "This is where your training comes in." | Just introduce X. |
| **"At its core…" / "In essence…"** | "At its core, the spell is simple." | "The spell is simple." — delete throat-clearing |
| **"X is a Y that Z"** | "The sword is a blade that glows with eldritch power." — Wikipedia opening | "The blade glows with eldritch power." |
| **Triple structure repeated** | Para 1: "A, B, and C." Para 2: "D, E, and F." Para 3: "G, H, and I." | Vary list length and position |
| **Uniform paragraph length** | Every paragraph 4–5 sentences | Break the rhythm. One sentence. Then eight. Then three. |
| **Same template every para** | [Topic sentence]. [Detail]. [Detail]. [Transition.] | Shuffle structure per paragraph |

**Litmus test:** Read any two adjacent paragraphs. If they feel like they were written by the same template, rewrite one.

---

## Anti-Patterns (Ranked by Frequency from Adversarial Editing)

These are scene-level failures. Most common → least common.

### 1. OVER-EXPLAIN (~32% of all edits)
**Problem:** Narrator explains what the scene already showed.

> ❌ The door slams shut. You realize that you are now trapped inside the room with no way out. The situation seems dire.
>
> ✅ The door slams shut. The lock clicks.

**Test:** After every narrator comment, ask: "Did the previous sentence already convey this?" If yes, delete.

### 2. REDUNDANT (~26%)
**Problem:** Same insight restated 3–4 times with different words.

> ❌ The forest was dark. Shadows filled every gap between the trees. Darkness pressed in from all sides. You could barely see.
>
> ✅ The canopy swallowed the last light. You walked by touch.

**Test:** Highlight every adjective/phrase that means "dark/scary/big." Keep the best one. Delete the rest.

### 3. CHECKLIST OF YESES
**Problem:** Every NPC agrees. No friction. No refusal.

> ❌ "Can you help me?" → "Of course!" → "Where do I go?" → "Follow me!" → "Thank you!"

**Fix:** At least one NPC per hub should refuse, misdirect, demand payment, lie, or be too busy.

### 4. UNIFORM PACING
**Problem:** Every scene follows the same rhythm — arrive, describe, interact, leave.

**Fix:** Some scenes are 2 sentences. Some are 12 paragraphs. Some have no choices (ride the rails). Some are pure dialogue. Vary deliberately.

### 5. EMOTIONAL MONOTONE
**Problem:** Same intensity for a greeting and a death scene.

**Fix:** Map emotional intensity (1–10) per scene. Adjacent scenes should differ by ≥2 points.

---

## Chinese-Specific Slop Patterns (中文反模式)

### Banned Phrases — Hard Cap

Keep **total** occurrences under **20 per 100,000 characters**:

| Phrase | English equivalent | Why it's slop |
|--------|-------------------|---------------|
| 不是X而是Y | "not X, but Y" | Same as English Tier 1 structural slop |
| 某种 | "some kind of" | Vague filler |
| 你从未 | "you've never" | Telling, not showing |
| 你感觉到 | "you feel that" | Filter verb — cut it |
| 你知道 | "you know" | Filter verb — cut it |
| 你意识到 | "you realize" | Filter verb — cut it |
| 深吸一口气 | "take a deep breath" | LLM tic in every tense scene |

### Core Principle

> **能省掉「你+感知动词」就省掉，让描写直接呈现。**
>
> Whenever you can remove "you + sensory verb," do it. Let the description stand on its own.

> ❌ 你感觉到空气中弥漫着腐烂的气息。
> ✅ 空气中弥漫着腐烂的气息。

> ❌ 你知道这座桥随时可能断裂。
> ✅ 脚下的木板发出不祥的断裂声。

### Quick Scan Command

```bash
grep -cE '(不是.{1,10}而是|某种|你从未|你感觉到|你知道|你意识到|深吸一口气)' world.js
```

---

## Chinese Grammar Errors — 12 Types

Watch for these during generation. Affects readability even when meaning is clear.

| ID | Error | Frequency | Example |
|----|-------|-----------|---------|
| A | **Missing 是** — copula dropped in equative sentences | ~8 per 60K chars | ❌ 他最强大的战士 ✅ 他**是**最强大的战士 |
| B | **Missing 而是** — contrast connector dropped | ~11 per 60K chars | ❌ 不是魔法，某种古老的力量 ✅ 不是魔法，**而是**某种古老的力量 |
| C | **Comma truncation** — sentence ends with comma instead of period | ~3 per 60K chars | ❌ 你推开门， ✅ 你推开门**。** |
| D | **Text duplication** — repeated phrase or sentence | ~3 per 60K chars | ❌ 你走进房间。你走进房间，环顾四周。 |
| E | **POV drift** — switches between second-person and third-person | Rare, severe | ❌ 他看着你。你觉得自己… |
| F | **Sensory mismatch** — describe touch when vision is active, etc. | Rare | ❌ 你闻到了远处尖塔的形状 |
| G | **flag routing error** — a `run` sets a flag/attribute but a later node's `look`/branch ignores it | High when merging `world.js` fragments | `run` set `S.flags.ally=true` but a later node's `look` still describes the NPC as hostile |
| H | **Encoding corruption (mojibake)** — garbled Unicode | Low | ❌ ä½ å¥½ ✅ 你好 |

**Audit command (B-type):**
```bash
grep -nE '不是[^，。]{1,15}，[^而]' world.js
```

---

## Reviewer Loop Checklist

Run this **every 15 scenes**. Copy-paste and fill in.

```markdown
## Reviewer Checkpoint — Scenes [__] to [__]

### 1. Word Count Drift
- First 3 scenes avg word count: ____
- Last 3 scenes avg word count: ____
- Delta: ____%  (threshold: >25% shorter = rewrite last 3)

### 2. Choice Density
- First half avg choices per scene: ____
- Second half avg choices per scene: ____
- If second half has fewer → add branches

### 3. Sensory Spot-Check (pick 3 random scenes)
- [ ] Scene __: has ≥2 senses? __  has 1 surprising detail? __
- [ ] Scene __: has ≥2 senses? __  has 1 surprising detail? __
- [ ] Scene __: has ≥2 senses? __  has 1 surprising detail? __

### 4. Tier 1 Slop Scan
- grep -iE '(delve|utilize|leverage|facilitate|elucidate|embark|endeavor|encompass|multifaceted|tapestry|testament|paradigm|synergy|holistic|catalyze|juxtapose|nuanced|realm|landscape|myriad|plethora)' world.js
- Hits: ____

### 5. Over-Explain Spot-Check
- [ ] Scene __: narrator comment after shown event? __
- [ ] Scene __: narrator comment after shown event? __
- [ ] Scene __: narrator comment after shown event? __

### 6. Placeholder Scan
- grep -iE '(TODO|TBD|PLACEHOLDER|FIXME|XXX|INSERT)' world.js
- Hits: ____
```

---

## Quick Reference Card

```
TIER 1 (0 per scene): delve utilize leverage facilitate elucidate embark endeavor encompass
                       multifaceted tapestry testament paradigm synergy holistic catalyze
                       juxtapose nuanced realm landscape myriad plethora

TIER 2 (≤1 per paragraph, ≤2 per scene): robust comprehensive seamless innovative intricate
                       pivotal crucial foster underscore moreover furthermore notably remnants
                       undercurrent interplay indeed

STRUCTURAL (rewrite on sight): "Not just X but Y" · "It's worth noting" ·
                       "This is where X comes in" · "At its core" · "In essence" ·
                       "X is a Y that Z" · triple lists · uniform paragraph length

CN (≤20 per 100K chars): 不是X而是Y · 某种 · 你从未 · 你感觉到 · 你知道 · 你意识到 · 深吸一口气
```

---

## 检测优于禁令:对抗式反 slop 方法(2026 更新)

> 来源:NousResearch/autonovel(ANTI-SLOP.md / ANTI-PATTERNS.md / CRAFT.md)、ICLR 2026 ANTISLOP 论文、Rettberg & Wigers 2025。这一节是对上面词表的方法论升级。

### 为什么不能只靠"指令里禁用词表"

ICLR 2026 ANTISLOP 论文结论:**把禁用词表当写作指令是脆弱且低效的**——
- token banning 有附带损害(禁 "catatonic" 会连带禁掉所有以 "cat" 开头分词的词);
- 指令式回避会触发**"粉红大象"效应**(越叫模型别想某词越想)。

所以上面的 Tier 1/2 词表的正确用法是**审查阶段扫描检测**,不是写作时死记硬背。真正有效的是**事后对抗式检测 + 重写**。

### 三种对抗式检测法(词表/正则查不到结构性 slop)

1. **Adversarial editing(对抗式编辑)**:让一个 reviewer(本项目用 `narrative-reviewer` 子代理)**尝试从一段里砍掉约 500 字,并分类它砍的是什么**。在 autonovel 的真实数据里,**OVER-EXPLAIN 类型每次都排第一**。把 reviewer 砍的真正删掉。
2. **Sentence-level grading(句子级评级)**:把每句标 **STRONG / FINE / WEAK / CUT**。**看分布,不看均值**——标准 1-10 评分无论怎么校准都会塌缩成 2 分带,失去区分度;而 STRONG/WEAK/CUT 的分布能直接告诉你哪些场景该重写。
3. **Comparative ranking(对比排序)**:章节/场景之间做**头对头**比较(Swiss-style Elo 锦标赛,约 4 轮),逼出 judge 在单独打分时会回避的判别,得到真实的优劣排序,据此定位最弱的内容去重写。

### 学术根因:AI 偏好稳定而非改变(Rettberg & Wigers 2025)

> **AI 生成的故事系统性地"偏好稳定胜过改变"——这对小说是致命的。**

具体表现 + 对策:
- **信息经济缺失**(立刻揭示一切,无法维持悬念/延迟回报)→ **扣住信息**,读者不该知道一切。
- **情绪室温**(一切停在同一温度)→ **变化情绪强度**:安静、爆发、恐惧、解脱、无聊、惊奇、恐怖,不是平线。
- **一切都被修复**(没有不可逆的损失)→ **让坏事保持坏**;允许不可逆的决定和损失。
- **道德全清晰**(总有明确"正确"选择)→ **制造真正的道德两难**,让"正确"不明确;若一个选择没有真实代价,它就不是真选择。

### 怎么用(工作流)

写作时正常写(别死记词表回避);每完成一幕/约15场景,**调 `narrative-reviewer` 子代理**做上述对抗式检测,它只返回具体 gaps(带位置+改法),主会话直接修。这把"反 slop"从"写作时的自我审查"变成"隔离 context 里的事后对抗审查",效果远好于前者。

## Anti-Slop Edit Residue（编辑残留 — 高危模式）

Anti-slop 编辑（删除 LLM-ism、改善文风）最容易引入的 bug 是**句子重复**:编辑写了新版本但忘了删除旧版本。这是整个开发过程中最常被审计发现的问题(对应 Chinese Grammar Errors 表的 Type D,但成因/模式/修复在此展开)。

### 已知残留模式

- `"新句。旧句。"` — 新句加在前面,旧句未删
- `"新描述。,旧描述。"` — 注意中间的残留标点
- `"——改写版。——改写版。"` — em-dash 改写时旧版存活
- `"整段A。整段A。"` — 整段复制

### 检测脚本

对 `world.js` 各节点的 look 文案做重复句检测——取出每个节点的 look 文本(`{first,return}` 取 first/return 两段,函数则就其返回的字符串)→ split on `。` → 找 len>15 的重复句。

### 修复:用 `Edit` 工具

用 `Edit` 工具,`old_string` 含 20+ 字符上下文确保唯一匹配。不要靠行号切片。

**`Edit` 的重复字符串陷阱:** `world.js` 里不同节点可能有完全相同/高度相似的文案。`Edit` 默认只替换第一个匹配,若多处都要改,必须:

1. 用 `replace_all: true`(当所有相同处都要同样的改动时);
2. 或用更长的、含上下文的唯一 `old_string` 分别定位每处;
3. 改完用 `grep -n` 验证目标确实被改。

例:两个节点都有"你在森林里见过的符号"。第一次 `Edit` 只匹配了前一个,后一个没改。办法:对后一个用更长的上下文串 `"但这里的符号更大"` 来唯一定位。

**验证 patch 成功的方法:**

```bash
# 修复后立即 grep 目标文本,确认在正确行号
grep -n "修改后的关键词" world.js
# 如果目标行号不对,说明 patch 匹配了错误的实例
```

### 角色名一致性

当故事有相似角色名(如 赛琳 vs 赛琳娜)时,先确认是同一角色还是不同角色,再决定是否全局替换。搜索明确的名字介绍(如"第四个来的人叫赛琳娜" vs "记录者的真名叫赛琳")。
