# 翻译流水线（Translation Pipeline）

将中文互动小说翻译为英文的完整流程，基于一个 97 节点、72K 中文字符的实战项目提炼。

> 模块化下，**翻译对象是 `world.js` 数据**（节点的 `name` / `look` / `links[].label` / `events[].run` 文案 / `scene` 文案等），不是构建后的单 HTML。
> world.js 是结构化数据，可直接 `require`/`import` 遍历——**不需要正则去爬源码**。翻译完重新 `node pipeline/build/build.mjs` 构建即得英文版单 HTML。

## 架构

```
world.js (中文数据)
  ↓ 提取节点文案
batch_1.json + batch_2.json + batch_3.json
  ↓ 子代理翻译 (3 并行)
translated_batch_1.txt + translated_batch_2.txt + translated_batch_3.txt
  ↓ 合并回数据
world.en.js (英文数据)
  ↓ node pipeline/build/build.mjs
game_en.html (英文成品)
```

## Step 1: 提取节点文案

直接 `require` world.js，遍历地图图，把每个节点里带中文的可译字段收集出来。模块化下 `look` 可能是字符串、`{first,return}` 对象，或 `(S,first)=>string` 函数——函数体里的字面量也要译。下面对前两种（数据形）做自动提取，函数形的 `look` 单独列出交人/子代理处理：

```js
const fs = require('fs');
const world = require('./world.js');   // 模块化的图就是结构化数据

const hasCn = s => typeof s === 'string' && ((s.match(/[一-鿿]/g) || []).length > 5);

// 收集每个节点的可译文案，键 = "map/node"
const scenes = {};      // 数据形 look / name（可机翻后合并）
const funcLooks = [];   // 函数形 look（含条件分支，需人/子代理读函数体翻译）

for (const [mapId, map] of Object.entries(world.maps)) {
  for (const [nodeId, node] of Object.entries(map.nodes)) {
    const key = `${mapId}/${nodeId}`;
    const fields = {};
    if (hasCn(node.name)) fields.name = node.name;

    if (typeof node.look === 'string') {
      if (hasCn(node.look)) fields.look = node.look;
    } else if (node.look && typeof node.look === 'object') {
      // {first, return}（首次/重访两段正文，模块化用它替代旧的 {{if}} 条件文本）
      if (hasCn(node.look.first))  fields.look_first  = node.look.first;
      if (hasCn(node.look.return)) fields.look_return = node.look.return;
    } else if (typeof node.look === 'function') {
      funcLooks.push(key);   // 函数形：把整个函数体交给翻译者，原样保留逻辑、只译字面量
    }

    if (Object.keys(fields).length) {
      const cn = JSON.stringify(fields).match(/[一-鿿]/g).length;
      scenes[key] = { fields, cn_chars: cn };
    }
  }
}

// Split into 3 batches
const sorted_ids = Object.keys(scenes).sort();
const batch_size = Math.floor((sorted_ids.length + 2) / 3);
for (let i = 0; i < 3; i++) {
  const batch_ids = sorted_ids.slice(i * batch_size, (i + 1) * batch_size);
  const batch = {};
  for (const sid of batch_ids) batch[sid] = scenes[sid];
  fs.writeFileSync(`batch_${i + 1}.json`, JSON.stringify(batch, null, 2));
}
console.log('函数形 look（需单独翻译函数体内字面量）:', funcLooks);
```

### 关键：检查遗漏文案

模块化下，正文不止在 `look`——还可能藏在 `links[].label`（选项文字，Step 5 专门处理）、`events[].run` 返回的 beat 文本、`scene` 意图里的人/物 `ref` 中文名等。提取后验证整份数据里**还有多少中文没进任何 batch**：

```js
// 把整个 world 序列化，数其中文总量，对比已收集量，确认无遗漏维度
const allCn  = (JSON.stringify(world, (k, v) => typeof v === 'function' ? v.toString() : v)
                .match(/[一-鿿]/g) || []).length;
const gotCn  = Object.values(scenes).reduce((n, s) => n + s.cn_chars, 0);
console.log(`world 总中文 ${allCn} / 已进 batch ${gotCn} → 差额在 links.label / events.run / 函数体 / scene.ref`);
```

> 注：旧版引擎的「expansion 覆盖文本」(`SCENES["x"].text = ...` 运行时改写) 在模块化里**不存在**——没有运行时改 SCENES 这回事。条件出现的正文写在节点 `look` 的 `{first,return}` / 函数分支里、条件出现的选项用 `requires` 门控，全是**静态数据**，一次遍历就拿全，不会有「漏掉被覆盖版本」的隐患。

## Step 2: 子代理翻译

### 使用文本格式（不用 JSON！）

JSON 因翻译文本中的未转义引号而损坏。使用简单文本格式：

```
===NODE: map/node | field===
[translated English text, preserving all HTML tags]
===END===
```

> `field` 是 `name` / `look` / `look_first` / `look_return` 之一，对应 Step 1 收集的字段。

### 子代理提示模板

```
Translate Chinese game node text to English.
Read: /path/to/batch_N.json   (keys are "map/node", each has a `fields` object)
Character names: 艾拉·沃斯=Ella Voss, 赛琳=Selin, 族长=Chief, ...
Key terms: 重排=the Shift, 活墨水=living ink, 制图师=cartographer, ...
Style: literary, atmospheric, varied sentences, sensory details.
No AI slop (no delve/tapestry/myriad/not just X but Y).
Keep HTML tags exactly as-is.
Write to: /path/to/translated_batch_N.txt
Format: ===NODE: map/node | field=== ... ===END===
```

### 批次大小

- 每批 10-15 节点（不要超过 20）
- 每批 ~10K 中文字符
- 子代理超时 600s — 大批次会超时

## Step 3: 合并翻译回数据

模块化下不在源码字符串里做位置替换，而是**按 "map/node | field" 键，把译文写回 world 数据结构对应字段**，再序列化成新的 world.en.js。这天然规避了旧版「backtick 边界 / 反向位置替换 / script 标签叠加」那一整类脆弱性——因为我们改的是数据对象，不是源码字符串。

```js
const fs = require('fs');
const world = require('./world.js');

// 收集所有译文：键 "map/node|field" → English
const trans = {};
for (const txt_file of ["translated_batch_1.txt", "translated_batch_2.txt", "translated_batch_3.txt"]) {
  const raw = fs.readFileSync(txt_file, "utf8");
  for (const m of raw.matchAll(/===NODE:\s*([^|]+?)\s*\|\s*(\w+)===\n([\s\S]*?)\n===END===/g)) {
    trans[`${m[1].trim()}|${m[2]}`] = m[3].trim();
  }
}

// 写回 world 数据结构
let replaced = 0;
for (const [mapId, map] of Object.entries(world.maps)) {
  for (const [nodeId, node] of Object.entries(map.nodes)) {
    const at = field => trans[`${mapId}/${nodeId}|${field}`];
    if (at('name') != null) { node.name = at('name'); replaced++; }
    if (typeof node.look === 'string' && at('look') != null) { node.look = at('look'); replaced++; }
    if (node.look && typeof node.look === 'object') {
      if (at('look_first')  != null) { node.look.first  = at('look_first');  replaced++; }
      if (at('look_return') != null) { node.look.return = at('look_return'); replaced++; }
    }
    // 函数形 look：函数体里的字面量需在源码里手动替换（见 Step 1 funcLooks 清单）
  }
}
console.log(`replaced ${replaced} fields`);

// 序列化回 world.en.js（保留 UMD 包装，函数原样 toString）
const body = JSON.stringify(world, (k, v) => typeof v === 'function' ? v.toString() : v, 2)
  .replace(/"(function[\s\S]*?})"/g, (_, fn) => JSON.parse(`"${fn}"`));  // 还原函数字面量
fs.writeFileSync('world.en.js',
  `module.exports = ${body};\nif (typeof window !== 'undefined') window.GAME_WORLD = module.exports;\n`);
```

> 提示：函数形 `look` / `links[].run` 里返回的中文 beat 文本，最干净的做法是**在源码层手动替换字面量**（它们逻辑不能动、只能换引号内文字），按 Step 1 打印的 `funcLooks` 清单逐个过。序列化-反序列化函数容易丢闭包/格式，能手改就手改。

## Step 4: 界面（外壳）文本翻译

游戏外壳（标题、按钮、菜单）的中文在 `index.html` 模板和 `game.js` 组装层里，不在 world 数据里。独立处理：

```js
// index.html 模板里的静态 UI 文本
let html = fs.readFileSync('index.html', 'utf8');
const ui_map = {
  "制图师的挽歌": "The Cartographer's Elegy",
  "开始新游戏": "New Game",
  "继续游戏": "Continue",
  // ... 50+ UI strings
};
for (const [zh, en] of Object.entries(ui_map)) html = html.split(zh).join(en);
fs.writeFileSync('index.html', html);
```

> 提示：状态条标签（如 demo `game.js` 里 `{ label: '时刻', value: ... }`）也是 UI 文本，在 `game.js` 的 `status:` 回调里——一并按 ui_map 替换。

## Step 5: 选项文本翻译

选项是 world 数据里 `links[].label`（不是嵌在正文中的字符串）。直接遍历数据改字段，最稳：

```js
const choice_map = {
  "冲上甲板看看发生了什么": "Rush up to the deck",
  "先收拾好制图工具再上去": "Pack your mapping tools first",
  // ... all link labels
};
for (const map of Object.values(world.maps)) {
  for (const node of Object.values(map.nodes)) {
    for (const link of node.links || []) {
      if (link.label && choice_map[link.label]) link.label = choice_map[link.label];
      if (link.lockHint && choice_map[link.lockHint]) link.lockHint = choice_map[link.lockHint]; // 锁定提示也是玩家可见文案
    }
  }
}
```

> 提示：`requires` / `run` 是逻辑函数，**绝不翻译**；只译 `label` 和 `lockHint` 这类玩家可见字符串。门控选项（`requires`+`showWhenLocked`）的 `lockHint`（灰显提示）容易漏，记得带上。

## Step 6: 验证

```bash
# 1) 构建英文版（数据 → 单 HTML），构建本身带结构准入门，结构坏会 fail-closed
node pipeline/build/build.mjs <英文游戏目录>/index.html

# 2) 结构审计（死链/可达/死胡同）：翻译不该改图，跑一遍确认没误伤 link 的 to
node core/tooling/graph-audit.mjs <英文游戏目录>/world.en.js   # P0 退出码非零=有死链

# 3) world.en.js 语法检查
node --check <英文游戏目录>/world.en.js

# 4) 残留中文检查（数据层 + 构建产物各查一遍）
node -e "const w=require('./world.en.js');const cn=(JSON.stringify(w,(k,v)=>typeof v==='function'?v.toString():v).match(/[一-鿿]/g)||[]).length;console.log('world.en.js 残留中文: '+cn)"
node -e "const fs=require('fs');const cn=(fs.readFileSync('game_en.html','utf8').match(/[一-鿿]/g)||[]).length;console.log('成品残留中文: '+cn)"
```

## 常见失败模式

| 失败 | 症状 | 修复 |
|------|------|------|
| JSON 引号未转义 | `JSON.parse` 抛 `SyntaxError` | 翻译产物用文本格式（`===NODE===`）替代 JSON |
| 子代理超时 | batch 文件缺失 | 拆分为更小批次 |
| 漏译函数形 look | 运行时仍显示中文 | 按 Step 1 `funcLooks` 清单手改函数体字面量 |
| 漏译 link 的 lockHint | 灰显选项仍是中文 | Step 5 一并译 `lockHint` |
| 改坏了 link 的 `to` | graph-audit 报新死链 | `to` 是节点 ID，**绝不翻译**；只译 `label`/`lockHint` |
| 改坏了 flag 名 | requires 永远 false / 剧情断 | `requires`/`run` 里的 flag 名、属性名**绝不翻译** |
| 角色名不一致 | 赛琳/赛琳娜混用 | 先确认是同角色还是不同角色，再统一 glossary |

---

## ⚠️ 关键补充(从本项目审计教训中提炼)

### 全维度提取(和 graph-audit 同源的教训)

旧版那个误报 31 个假死链的 audit 脚本，错在**只认 inline 定义、靠正则爬源码**。模块化把这类隐患从根上消掉了：图和文案都是 `world.js` 的结构化数据,直接 `require` 遍历即得全集——没有「藏在 `applyExpansion()` 里被覆盖、正则爬不到」这回事。

但提取仍要**覆盖所有可译维度**,别只盯 `look`。一份节点的玩家可见中文可能分布在:
- `node.name`(节点标题)
- `node.look`(正文:字符串 / `{first,return}` / 函数分支三态)
- `node.links[].label` 与 `link.lockHint`(选项与灰显提示)
- `node.events[].run` 返回的 beat 文本(函数体里的字面量)
- `node.scene.elements[].ref`(若用了中文语义名,如 `{kind:'character', ref:'提灯人'}`)

漏掉任一维度,该处运行时仍显示中文。Step 1 末尾的「差额」检查就是用来兜住这些维度的。

### 首次/重访两段文本的翻译(模块化用 look,不用条件标记)

模块化**没有** `{{if:flags:X}}...{{else}}...{{endif}}` 这类正文内条件标记——呈现器不解析 `{{}}`,写了也原样显示。首次见 / 重访 的不同正文,写在节点 `look` 里:

```js
// 数据形:首次一段、重访一段(引擎按访问计数自动选,firstTime = visits<=1)
look: { first: '这是你第一次来到此地。', return: '你又回到了这里。' }

// 函数形:更复杂的条件(读 flags/属性)在函数体里用普通 if 表达
look: (S, first) => first
  ? '你第一次踏进礁石潮池,水里有细小的发光生物。'
  : (S.flags.drained ? '潮池已干涸。' : '潮池还在,小生物随你的影子缩回石缝。')
```

翻译这种节点时:
- **逻辑结构(`first`/`return` 键、函数里的 `if`、`S.flags.X` 条件表达式)原样保留,一个字符都不改**
- 只翻译引号之间的**文字**
- 翻译后验证:`{first,return}` 两键都在、函数的条件分支数量与原文一致(别把一个分支译没了)

```
原文 look.return: 你又回到了这里。
译文 look.return: You return to this place.
错误: 把 look 整个改成单字符串 → 丢了首次/重访的区分
```

给翻译子代理的指令里必须明确说:「节点 `look` 的 `first`/`return` 两段、以及函数体里的 `if` 逻辑与 `S.flags.X` 条件,是引擎结构,原样保留;只译引号内的叙事文字。」

### glossary 一致性(从 canon.md 自动生成)

如果项目有 `canon.md`,从中提取所有角色名/地名/术语,建 `glossary.md`。翻译全程每个子代理都拿到同一份 glossary。

这防止:第一批翻「赛琳=Selin」、第二批翻「赛琳=Celine」、第三批翻「赛琳=Saline」。

### 翻译后的结构验证

翻译后**必须重跑 `node core/tooling/graph-audit.mjs world.en.js`**——翻译可能不小心改了 flag 名、节点 ID 或 link 的 `to`(特别是半自动替换时),graph-audit 会立刻发现新引入的死链/不可达。这也是为什么 `to`/`requires`/`run` 里的标识符**绝不翻译**:它们一旦被当文案译掉,图就断了。

翻译后也必须重跑**假选择复核**(模块化没有专用脚本,直接读 `world.en.js`:同一节点若有多条 `links` 指向同一个 `to`、且没有 `run` 差异,就是假选择)。翻译可能改了选项 `label` 却没意识到两条选项本质等价——或者揭示了原本就有的假选择。把这条并进翻译后的人工复核清单。
