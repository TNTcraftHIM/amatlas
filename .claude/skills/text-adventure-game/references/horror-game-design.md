# 恐怖游戏制作指引(maze3d 第一人称恐怖为主)

> **⚠️ 先认清:恐怖是「基调」,不是「玩法类型」。** 文字冒险能恐怖、跑团能恐怖、迷宫能恐怖。**别一听"恐怖"就上 maze3d** —— 很多最好的恐怖是**纯文字/心理恐怖**(慢热、阅读、悬疑、克苏鲁、邮件体、visual novel 风),它们**不该用 maze3d**。**本文专讲「第一人称迷宫/怪物实时追逐/贴脸 jump-scare」这一类**(maze3d)。先按 §0 判断你这局是哪种恐怖,选错就走错路。

## 0. 这是哪种恐怖?(先分流,再决定读不读本文其余部分)

| 你想做的恐怖 | 走哪条 | 用 maze3d? |
|---|---|---|
| **纯叙事 / 心理恐怖**(阅读体验、悬疑慢热、克苏鲁、邮件体、恐怖 visual novel、低语/不可名状) | **回文字冒险主线(5 阶段)**,恐怖靠**表现层**:present-svg 的 `eyes`/`letterbox` + `transition`(见 `references/visual-system.md`)+ `ambient-unease` 氛围音(见 `references/audio-system.md`)+ mood 选 `dread`/`eerie`/`horror-climax` + dramatic 打字机/淡入节奏 | ❌ **不用**——读完 §0 就回主线,本文其余跳过 |
| **跑团式恐惧检定**(理智 SAN / 逃跑 / 抵抗 DC) | scene + tabletop `encounter`(`references/tabletop-design.md`) | 可选(关键场景叠 maze3d 更沉浸) |
| **第一人称迷宫探险 + 怪物实时追逐 + 贴脸 jump-scare** | **本文 + `maze3d`**(`examples/maze3d/index.html` 里的 horror recipe) | ✅ **就是它**——继续读 §1+ |
| **一两个恐怖瞬间**(梦境/闪回/一闪而过的怪) | scene + present-svg 演出 + ambient-unease | ❌ 整局 maze3d 太重,表现层够了 |
| **混合**(多数完整恐怖短篇都是) | 文字 scene 铺心理 + **1-3 个 maze3d 节点做追逐高潮** + 可选检定加张力 | ✅ 部分节点用 |

**关键**:maze3d 是恐怖的一种**可选高潮武器**(实时移动+怪追+突脸,冲击大),**不是恐怖的默认形态**。一局完整恐怖短篇通常 = 大量 scene 铺心理/叙事 + 1-3 个 maze3d 节点(地下室/迷宫/树林追逐)做高潮。**纯靠 maze3d 堆砌 = 游戏感盖过恐怖叙事**(恐怖的力量在"未知"和"节奏",不在迷宫本身)。

**maze3d = 重武器**:写代码量小(全在 world.js 数据),但**玩家体验冲击大**。下面 §1+ 都是 maze3d 专属(纯文字恐怖不需要)。

> **⚠️ maze3d 也能做非恐怖(探索/解谜)——别把恐怖语气带进去**:迷宫不写 `monsters`(无怪物)= 纯探索/解谜(找钥匙、走机关、看风景)。这时**look 用探索语气、别提"追赶"**:
> - ❌ 别写「黑暗的迷宫」「它在追你」「没有追赶的东西」(否定式提"追赶"反而强化焦虑,端用户实测踩过)。
> - ✅ 写正向探索:「齿轮与铜管的走廊,找到那扇发光的门」「用方向键移动,在管道间寻路」。
> - 引擎已配合:**无 `monsters` 时默认 look 自动用中性探索语气**(你不写 look 也不会冒出"黑暗的迷宫");有 `monsters` 才用恐怖默认。**基调一致性靠你写的 look + scene.mood**(轻松探索用 `calm`/`eerie` 别用 `horror-climax`;视觉别用 `eyes:bleeding`/`swarm` 等恐怖演出——那是 §4.1 死亡演出专用)。

## 1. 节点骨架(照抄,改字)

```js
horror_basement: {
  kind: 'maze3d',
  title: '地下回廊',
  winKey: 'escapedBasement',        // 走到 'D' 出口门 → 写这个 key
  scareKey: 'caughtBelow',           // 被怪贴脸 → 写这个 key + 自动播 scareSfx
  scareSfx: 'horror-screech',        // 被抓瞬间的 jump-scare 音(声画同时,默认 'horror-sting')
  scareAmbient: 'heartbeat',         // 可选:探索全程持续心跳 BGS;不写=只在怪靠近时模块自带心跳(多数情况够,见 §6)
  look: '潮湿的回廊。找到那扇【发光的门】,走过去推开。\n但你不是一个人——它在追你。',
  wonText: '门后是光。你跌出去,门在身后合拢。',
  caughtText: '一张几乎是人的脸贴了上来——眼睛是两个空洞的黑洞。然后,什么都没有了。',
  maze: {
    grid: [                          // '#'墙 '.'地板 'D'出口门('K'=钥匙,进阶玩法见 §13;怪物经 monsters[] 摆放、不入 grid)
      '###########',
      '#.........#',
      '#.#######.#',
      '#.#.....#.#',
      '#.#.###.#.#',
      '#.#.#...#.#',
      '#.#.#.#.#.#',
      '#.#...#.#.#',
      '#.#####.#.#',
      '#.......#D#',
      '###########'
    ],
    start: { x: 1, y: 1, dir: 'E' },
    theme: 'cave',                   // 主题:cave/dungeon/shoji/flesh/metal(协调地板天花+墙涂装+门)
    monsters: [{ x: 5, y: 5, face: 'mimic' }],  // 怪物类型见 §3;默认 chase:true 会用 A* 追玩家
    chaseSpeed: 2.0,                 // 可选:怪物追逐速度(格/秒,默认 2.0;玩家移速 2.6 → 调高更难逃、调低更宽松)
    events: [                        // 可选:坐标事件钩子(§14)——走到某格触发,打开"迷宫内叙事"(不再是黑盒孤岛)
      { x: 9, y: 1, once: true, hint: '脚下有半张照片', run: function (S) { S.flags.foundPhoto = true; } }
    ]
  },
  links: [
    // 1. 逃出:winKey 门控
    { to: 'aboveground', requires: function (s) { return !!s.escapedBasement; },
      showWhenLocked: true, lockHint: '你还没找到出口的门', label: '推开门,逃出去' },
    // 2. 被抓:scareKey 门控(被抓后唯一活的链接;走向结局节点)
    { to: 'consumed_ending', requires: function (s) { return !!s.caughtBelow; },
      showWhenLocked: true, lockHint: '——', label: '……(你被它抓住了)' },
    // 3. 放弃:无条件保底出口(无 soft-lock P0;探针走得出)
    { to: 'fled_ending', label: '放弃,原路退回' }
  ]
}
```

**关键铁律(违反 → 闸报 P0 / P1 或 jump-scare 失效)**:
- `winKey` / `scareKey` **必须在 `initState` 里声明为 false**:`initState: { escapedBasement: false, caughtBelow: false }`(否则 graph-audit 报死键)。
- 逃出 / 被抓 / 放弃三条 links 都建议写清。maze3d 进度发生在 canvas 内,graph-audit 不会把全条件 maze3d links 当普通 scene soft-lock,但复杂迷宫最好仍给一条“放弃/撤回”保底路,让玩家和测试都能离场。
- **「再玩一次」要回迷宫?必须在 link 的 `run` 里重置 winKey/scareKey**:结局通常是**终局场景**,玩家用工具栏「重新开始」重玩(引擎 `reset` 自动清所有 flag)。但**如果你写一条 link 从结局/中途**回到迷宫或迷宫前的节点,**必须**在那条 link 的 `run` 里把这个迷宫的 winKey/scareKey 清回 false——否则 `winKey` 残留为 true,重进迷宫会**直接显"通关"文字而不重玩**(winKey 是世界 flag、会持续;引擎不替你清,因为它常兼作跨节点进度门控)。写法:`{ to:'porch', label:'再玩一次', run:function(s){ s.escapedBasement=false; s.caughtBelow=false; } }`。
- `scareSfx` 是字符串,不是数组(present-audio 内部包成 sfx 数组)。

## 2. 主题(theme):一字定全风格

写一个 `theme` 字符串,引擎自动协调**地板透视雾 + 天花结构(虚假高度顶面)+ 墙涂装 + 出口门 + 暗角**——你不用动 CSS、不用画图。

| theme | 调性 | 出口门 | 用法 |
|---|---|---|---|
| `cave` | 冷灰绿石窟、暗角、石方格天花 | 铁吊闸密格栅 | **horror 首选**——地下迷宫/洞窟/墓穴 |
| `dungeon` | 错缝赤褐砖、暖光透出、石拱顶 | 竖铁栅 + 后面橙火 | 中世纪地牢、监狱、城堡密室 |
| `shoji` | 米白障子木格、明亮、木梁天花 | 障子拉门(纸+木格) | **和式凶宅**(贞子/伽椰子)、神社、传统旅馆 |
| `flesh` | 暗红血肉脉络、紫红顶、肉肋天花 | 中央菱形发光肉裂口 | 噩梦/生物体内/血肉迷宫 |
| `metal` | 灰瓷砖 + 黑缺损洞、黄黑警示、金属密格顶 | 气闸金属门 + 黄黑斜条 | **SCP/赛博惊悚**、废弃设施、太空站 |
| 缺省(不写 theme) | 中性暖灰、纯雾顶 | 暖橙金辉光门 | 普适、未明确题材 |

**未知 theme 值优雅退化到中性默认**——但写错主题名 graph-audit 不会报(开放词汇),所以**照表抄、别自创**(像 `'horror'` / `'spooky'` 不存在,会回到中性灰)。

> **天花板 = 虚假高度(伪3d 顶面)**:每个主题自动给一层随你走动/转身**正确移动的网格顶**(石方格/木梁/肉肋/金属密格),一点透视收敛到地平线 → 营造「有顶的封闭空间」纵深(重返德军总部式,仍是伪3d、无俯仰)。**你不用设置**——选了 theme 就有;默认主题(不写 theme)是纯雾顶。

### 2.1 环境装饰:地面小物件 + 墙面 wallDecor

`theme` 会自动给少量**地面背景小物件**和**墙面装饰**:洞穴有骨片/苔藓/藤蔓/裂缝,地牢有碎砖/破布/剑盾/火把/铁链/低亮刻印,血肉迷宫有肉瘤/黏液膜/血管/触手/眼点,科技主题有电缆/锈片/管道/通风口。它们都是**环境层**,不挡路、不拾取、不触发事件。

- 总入口:`examples/maze3d/index.html` 是 maze3d 的统一入口:basic / horror / puzzle / layers 都是同一 `raycast-maze.js` runtime 的 recipes,不是不同模块。作者手册在 `examples/maze3d/references/maze3d-authoring.md`,先读它确认字段和状态边界。选材入口:`examples/maze3d/gallery.html` 是 maze3d 素材总览页。先打开它看全套 `theme`、`wallTex`、`floorTex`、`ceilTex`、`wallDecor`、地面 decor、`events[i].visual`、出口和柱子,再把对应字段抄进 `maze:{...}`。gallery 是作者预览页,不是新玩法流程。

- 出口样式:`maze.exitStyle:'archway'` / `'portal'` / `'stairs'` / `'elevator'` / `'portcullis'` / `'iron-bars'` / `'shoji'` / `'sphincter'` / `'blast-door'` / `'glow'`。`theme` 会给默认门,`exitStyle` 可按单个迷宫覆盖。它**只换 D 出口视觉**:仍是网格里的 `'D'`,仍正对贴近通关,仍受 `'K'` 钥匙门控;不要把它当“不同出口去不同节点”的玩法字段。

- 柱子地标:`maze.pillars:[{x:4,y:3,style:'ruined',scale:1.2}]`。内置 `style` 可写 `stone` / `ruined` / `obelisk` / `crystal` / `wood` / `metal`;也可用 `pillarStyle` 做全局默认。柱子只是氛围和方向锚点,不挡路、不拾取、不触发事件;要做可拿线索仍用 `events[i].visual:'pickup'|'floor-pickup'|'wall-pickup'`。

- 调密度:`maze.decorDensity` / `maze.maxDecor` 控地面普通 decor;`maze.wallDecorDensity` / `maze.maxWallDecor` 控墙饰。写 `0` 可关。常用档位:
  - 清爽教学:`decorDensity:0.01,maxDecor:3,wallDecorDensity:0.03,maxWallDecor:4`
  - 标准探索:`decorDensity:0.03,maxDecor:10,wallDecorDensity:0.08,maxWallDecor:12`
  - 主题强化:`decorDensity:0.05,maxDecor:16,wallDecorDensity:0.14,maxWallDecor:20`
  - 追逐恐怖:地面低、墙饰中等,让怪物/钥匙/陷阱更醒目。
- 显式地面背景物:`maze.decor:[{x,y,icon:'rust_scraps'|'wood_splinters'|'cloth_rags'|'ash_pile'|'ice_chips'|'bio_film'|'ritual_marks'|...}]`。这些 family 仍是背景 decor,不是可拿物。
- 显式墙饰(进阶):`maze.wallDecor:[{x:墙格x,y:墙格y,face:'N'|'S'|'E'|'W',kind:'vines'|'tentacle'|'crack'|'arms'|'torch'|'cables'|'chains'|'pipes'|'vent'|'posters'|'growth'|'veins'|'sigil'|'eyes'|'teeth',u?:0..1,v?:0..1,scale?:number}]`。坐标必须是 `'#'` 墙格,face 要朝向玩家能走到的地板面;写错会报错或 warn 后跳过。
- 主题筛选表(给下游 AI 直接抄):
  - `cave`:地面 `moss_patch/bone_shards/crystal_cluster/rubble`;墙 `vines/growth/crack`。
  - `dungeon`:地面 `rubble/bone_shards/ash_pile/cloth_rags/ritual_marks`;墙 `crack/arms/torch/chains/sigil`。
  - `shoji`:地面 `paper_scrap/wood_splinters/cloth_rags`;墙 `posters/sigil/crack`。
  - `flesh`:地面 `flesh_nodule/bio_film/bone_shards/ritual_marks`;墙 `tentacle/veins/growth/eyes/crack`,强冲击 `teeth` 建议显式摆放。
  - `metal/station`:地面 `cable_coil/rust_scraps/glass_shards`;墙 `cables/pipes/vent/crack`。
  - `ice`:地面 `ice_chips/crystal_cluster`;墙 `crack/growth`。
  - `clinic`:地面 `glass_shards/paper_scrap/cloth_rags`;墙 `pipes/posters/crack`。
- `torch` **是墙面火把物件**:它有火芯和局部暖色 halo,但仍不是动态光源系统;不会改变全局照明。迷宫已有主题 torch 暖光/门光,别把墙饰火把当新光照 API。
- 想放**显眼关键道具**别用普通 decor,用 §14 的 `events[i].visual:'pickup'` + `icon`。想放**隐藏普通线索/加成物**(后续检定降 DC、隐藏结局条件、补证据),用 `events[i].visual:'floor-pickup'` + `icon/art` 或 `events[i].visual:'wall-pickup'` + `face` + `icon/art`——它们得贴近才拿,不会像钥匙一样抢眼。想放**竖立雕像/路牌**这种背景物,用 `maze.decor:[{x,y,icon:'idol',mode:'sprite'}]` 逃生口。

## 3. 怪物(monsters):face 或 body 二选一

每只怪物写**一行**:`{ x, y, face?:'...', body?:'...', chase?:true }`。**face/body 互斥**(同时写 body 优先)。

### face(大脸 billboard,贴脸杀)

| face | 视觉 | 适合 |
|---|---|---|
| 缺省(`face` 不写) | 不对称腐脸 zombie,獠牙暗红泪痕 | 普适、僵尸末日 |
| `'yurei'` | 冷蓝白长脸 + 垂黑发遮 80% + 发缝单只惨白瞪眼 | 日式凶宅、《咒怨》《午夜凶铃》 |
| `'skull'` | 骨白颅 + 对称黑空眼窝 + 鼻腔 + 整齐方牙 | 墓穴、亡灵主题 |
| `'mimic'` | 正常人脸 + 双纯黑空眼 + 裂口齐牙 | 伪人、analog horror、曼德拉记录 |

### body(全身像 billboard,落地锚定)

| body | 视觉 | 适合 |
|---|---|---|
| `'slender'` | 异常高瘦 + 苍白小圆头无脸 + 黑西装 + 背后下垂触手 | Slenderman、林间、creepypasta |

(更多 body 留 backlog。`body` 字段是开放词汇可扩展。)

### chase 行为

- `chase: true`(默认):**A\* 网格寻路追玩家**(绕墙找最短路),速度 2.0 格/秒 < 玩家 2.6 → 可逃可被堵。
- `chase: false`:静止守位(适合"看到一个就吓人,不动",或场景演出)。

### 自定义外观(进阶 · `art` + `palette` + `mirror`)—— 内置 5 种不够时,自己画一只

内置 5 种 face/body 是**零成本地板**(打磨好、可靠);想要它们没有的怪,给这只 monster 写一张 **ASCII 像素网格**,引擎纯 fillRect 渲染(和内置怪同管线:雾/遮挡/突脸/缩放全自动,方像素)。

- **`art: string[]`** —— 每字符 = 一个像素格,**所有行必须等长**;`'.'` 和空格 = 透明(透出墙/雾)。
- **`palette: { 字符: [r,g,b] }`** —— 每个非透明字符 → 3 个 `0..255` 整数。(`'.'`/空格保留给透明、**不能**写进 palette;想要纯黑就用 `[0,0,0]`。)
- **`mirror: true`(可选)** —— 你只写**左半**,引擎左右翻成对称(脸大多对称 → 省一半工 + 不会画歪)。

**★ 最重要的写法(否则大概率画歪)**:盲写大网格极易错位——**改下面的范本**,别从零编坐标。保持小(建议 ≤ ~16 宽 × ~20 高;**硬上限 32×32**,超了 boot 报错)。3-6 种颜色足够(更多=噪声不是细节)。

**范本 ①·瓷娃娃面具(改色/改五官即得新怪)**:
```js
{ x:5, y:3, face:'zombie', art:[
  '..HHHHHH..','.HHCCCCHH.','.HCCCCCCH.','HCCCCCCCCH',
  'HCCEECCEEH','HCCEECCEEH','HCCCCCCCCH','HCCCRRCCCH',
  'HCCCCCCCCH','HCCMMMMCCH','HCCWWWWCCH','.HCCCCCCH.','.HHCCCCHH.','..HHHHHH..'
], palette:{ H:[28,22,30], C:[222,212,198], E:[8,6,10], R:[150,120,110], M:[40,6,10], W:[232,226,210] } }
```
**范本 ②·镜像角魔(只写左半 7 列 + `mirror:true` → 引擎翻成 14 列对称)**:
```js
{ x:8, y:3, mirror:true, art:[
  '...KKKK','..RRRRR','.RRRRRR','RRRRRRR','RRYYRRR','RRYYRRR',
  'RRRRRRR','RRRMMMM','RRRMWMW','.RRRRRR','..RRRRR','...RRRR'
], palette:{ K:[60,40,46], R:[150,40,42], Y:[240,210,90], M:[30,8,10], W:[230,220,200] } }
```

- **坏数据 = 响亮报错、不是静默退化**:行不等长 / palette 值不是 3 个 `0..255` 整数 / 用了没声明的字符 / 超 32×32 → **boot 抛错 + 页顶横幅**。**注意:maze 是 canvas 孤岛,这些错 graph-audit 看不到、只在真打开页面/boot 时报** → 写完**务必真开一次页面看**,别只跑静态闸就当完成。
- **没写 art = 用内置 `face`/`body`**(逐字节同今天、完全向后兼容);范本里仍带 `face:'zombie'` = 万一以后删了 art 也有兜底。
- **声音 / 靠近特效 / 死亡演出 = 写 `face:'<内置>'` 借用**:`art` **只换外观**;引擎的**靠近压迫 drone + 靠近特效(proxFx)+ 死亡演出**仍由 `face`(或 `body`)决定。所以自定义怪**同时写 `face:'skull'`**(`yurei`/`skull`/`zombie`/`slender`/`mimic` 任选)= 你的外观 + 那套**全套音效/靠近特效**。(音色是合成的、不能像像素那样"画一个",所以**从这 5 套里挑**——诚实限制。)
- **自定义念白 `lines:['…','…']`(可选)**:带 `lines` 的怪靠近时**开口念你写的话**(像伪人那样轮换、不连珠炮)。走浏览器 **TTS(任意文字)** → **需 `createMaze3dModule({ mimicVoice:'speech' })` 或有 TTS 的环境**(恐怖 demo 默认已是 speech);没 TTS 时退回通用呢喃。配 `face:'mimic'` 还叠"湿肉电话腔"底噪。例:
```js
{ x:5, y:3, art:[/*你的网格*/], palette:{/*…*/}, face:'mimic',
  lines:['你终于来了…','别走、陪陪我…','我等了好久好久…'] }
```

## 4. 自动联动的恐怖演出(你不写代码,引擎自动给)

写 `monsters` + `theme` + `scareSfx` 即可,**所有演出自动联动**:

1. **靠近预兆 proxFx**(玩家走到 ~3-4 格内):
   - 屏幕四周暗角收拢(tunnel-vision)、随心跳脉动
   - 该鬼专属画面特效淡显:yurei=黑雾、skull=人魂、zombie=腐瘴、mimic=信号故障、slender=故障+黑暗
   - 心跳声渐快渐强
   - 该鬼专属压迫 drone(yurei=女声呜咽、skull=骨响、zombie=喉音咆哮、mimic=拍频嗡鸣、slender=电视静电)
2. **两段突脸**(被抓瞬间):
   - 0.45s 定格看清那张脸 / 那个全身像(jump-scare 第一击)
   - 0.5s 加速扑上来,头部/全脸**铺满屏幕**(jump-scare 第二击;`body` 类自动切到头部聚焦特写)
3. **死亡演出 deathFx**(被抓后持续):
   - 全屏血色 / 黑暗 wash + 重暗角
   - 该鬼专属:zombie/mimic 血流垂下、skull 蓝白人魂飘升、yurei 黑雾、slender 吞没

**作者无需写代码** —— 写好怪物的 `face`/`body` 字符串,所有演出和声音自动按鬼类型匹配。这是数据驱动开放词汇 + 优雅退化的设计哲学。

### 4.1 死亡 / 结局演出词汇(present-svg 预设;选 1-2 个组合用,别全部堆)

针对**不同恐怖结局**的视觉差异化(端用户实测:两个死亡都用 eyes.bleeding 会视觉雷同),预设 5 个 `eyes.state` + 2 个 `element.kind` 覆盖主语义:

| 词汇 | 语义 | 视觉 | 用例 |
|---|---|---|---|
| `eyes:{state:'watching'}` | 活眼盯人 | 派生深色单眼 + 瞳孔扫视 + catchlight | "它看着你"普通注视 |
| `eyes:{state:'bleeding'}` | 器质性恐怖 | 充血血丝 + 瞳孔骤缩骤扩 + 多股血泪 | 暴力 / 病变 / body horror |
| `eyes:{state:'closed'}` | 死寂 / 默哀 / 永闭 | 派生肉色眼皮 + 上眼睑弧 + 中线缝(克制、静止) | 你失去意识 / 默哀 / 安息 |
| `eyes:{state:'crying'}` | 哀悼 / 同情 | 蓝白透明泪滴(2-3 条克制)+ 垂目瞳孔 + 无血丝 | 玩家做了无法挽回的事 / 自责 |
| `eyes:{state:'swarm'}` | 集合意识 / 无处不在 | 10 只小眼大小错落 + 各自独立扫视 | SCP / Lovecraft / 虫群感 |
| `{kind:'claw'}` | 被攻击 / 怪物残留 | 3-4 道平行斜痕 + 深红血色(静态) | 被抓伤 / 攻击痕迹 |
| `{kind:'swallow'}` | 被吞噬 / 坠入虚空 | 同心暗色椭圆 + 缓慢旋转(漩涡) | 沉没 / 黑洞 / 失去意识 |

**怎么选 = 看你想表达什么感觉,不是堆视觉元素**:
- 死寂 / 永眠 → `closed` + `mood:'sad'/'desolate'`
- 哀悼自己造成的死 → `crying` + `mood:'sad'`
- 被注视至发疯 → `swarm` + `mood:'eerie'/'dread'`
- 被怪物撕碎 → `claw` + `mood:'horror-climax'`
- 沉入深渊 → `swallow` + `mood:'horror-climax'/'dread'`

**写法**:
```js
// 死亡结局节点
deathNode: {
  kind: 'scene',
  scene: {
    region: 'cave',                                  // 任意 region
    mood: 'horror-climax',                           // 任意 mood
    elements: [
      { kind: 'letterbox' },                         // 黑边电影感(推荐)
      { kind: 'eyes', state: 'closed', ref: 'fullscreen' }  // 或 claw / swallow / crying / swarm
    ],
    transition: 'slam'                               // 强冲击进场
  },
  audio: { music: false, ambient: false, sfx: ['horror-sting'] },
  look: '声音停了。\n\n你看不见了。',                // 陈述句(非问句"重来吗?")=结局收束
  links: []                                          // 终点
}
```

**不要做的**:
- ❌ 两个死亡结局都用 `bleeding`(视觉雷同)→ 至少用两个不同 state(closed+bleeding / crying+swarm)
- ❌ 死亡 look 写"重来还是放弃?"(问句让玩家以为还能玩;改陈述句"你被认识了""共鸣还在")
- ❌ 同节点叠加 claw+swallow+eyes(过载;每节点 1 主视觉 + letterbox 框定即可)

**想要更多词汇**(`wide-open` 狂喜眼、`drowned` 没顶氛围…):**fork `engine/presenters/present-svg.js`** 同 watching/bleeding 范式加分支(引擎未发布、改源即扩展点)。或者用现有词汇组合(state×ref×region×mood×transition)拼新感觉——多数死亡氛围都能拼出来。

## 5. jump-scare 音效库(scareSfx 选一个)

| scareSfx | 类型 | 音色 |
|---|---|---|
| `'horror-sting'`(默认) | 尖啸+下扫 | 经典 jump scream,带粗糙度调制(模拟杏仁核激活) |
| `'horror-stab'` | 惊魂记弦乐刀刺 | 高音不协和弦乐快速下弓 ×4(Psycho 同款) |
| `'horror-screech'` | 金属尖啸 | Silent Hill 非谐金属共振(刮擦+上扫)** 端用户两次夸"不错"** |
| `'horror-braam'` | Inception 低频 | 厚重低频 brass 齐奏轰鸣 |
| `'horror-shriek'` | 类人尖叫(声门 source-filter) | formant 共振峰 + jitter/vibrato/breath + rasp,**短但拟人**(端用户:震撼力一般、可选) |

**richBus ×2.2 加成** → 所有 jump-scare 比背景乐响一档(物理频段对、不撞压缩器)。

## 6. BGS 氛围(scareAmbient,可选)

- `'heartbeat'`:lub-dub 循环 ~65 BPM 心跳(标志恐怖 BGS);**默认 maze3d 怪靠近时模块内自动给心跳(proximity)**,所以**通常不需要再写 `scareAmbient: 'heartbeat'`**——除非你想要走在迷宫里"无论是否靠近怪都听见心跳"(心理压迫,更恐怖)。
- `'ambient-unease'`:低频不安音 + 滴水稀疏;适合 maze3d 之前的铺垫节点。

## 7. 恐怖节奏结构(给 Sonnet 的故事模板)

最小恐怖游戏 = **5 节点**(entrance → maze3d → 3 结局):

```
entrance(scene)            ← 铺垫:你为什么进来?ambient-unease,present-svg eyes/dread/night
   ↓ "走进黑暗"
horror_maze(maze3d)        ← 高潮:猫鼠游戏,找门 vs 被追,3 个 link(逃/被抓/放弃)
   ├ 逃出 → escaped(scene)    ← 重见天光,calm/dawn,留余韵或反转
   ├ 被抓 → consumed(scene)   ← jump-scare 已响过,定格余韵:letterbox + 渗血巨眼 + slam transition
   └ 放弃 → fled(scene)       ← 你逃了但门还在,某种东西还在等你
```

**进阶**(混跑团检定):
- 进 maze 前 encounter:"屏住呼吸"DC 10 → 失败=被听见 → maze 节点写 monsters 多 1 只 / chase 加速。
- 中途 scene:你听到墙后有声音,看 vs 躲(scene 选择改 flag → 影响接下来 maze 怪物配置)。

**多场 maze3d**(完整短篇):
```
家中(scene)→ 阁楼听见声(scene)→ 上去(maze3d:阁楼,无怪)→ 找到日记(scene 揭谜)
→ 地下室(maze3d:cave + mimic 追)→ 抓到/逃出
```

## 8. 题材速配(从概念到 theme/face 的"翻译表")

| 用户想做 | theme | 主怪物 | 配套音 / 氛围 |
|---|---|---|---|
| 《咒怨》/日式凶宅 | `shoji` | `face:'yurei'` | `scareSfx:'horror-shriek'`,scene 节点用 `region:'town'` + `mood:'eerie'` |
| 地下墓穴/克苏鲁地下 | `cave` | `face:'skull'` 或 `'zombie'` | `scareSfx:'horror-braam'`,scene 用 `region:'cave'` + `mood:'dread'` |
| 林间 Slenderman / 童年怪谈 | `cave` 或不写 | `body:'slender'` | `scareSfx:'horror-screech'`,scene 用 `region:'forest'` + `mood:'night'` |
| 噩梦/血肉迷宫(Doom/Silent Hill) | `flesh` | `face:'mimic'` | `scareSfx:'horror-screech'`,scene 用 `region:'cave'` + `mood:'horror-climax'` |
| SCP 设施/赛博惊悚 | `metal` | `face:'mimic'` | `scareSfx:'horror-stab'`,scene 用 `region:'ruins'` + `mood:'eerie'` |
| 中世纪城堡密室 | `dungeon` | `face:'zombie'` 或 `'skull'` | `scareSfx:'horror-sting'`,scene 用 `mood:'dread'` |

## 9. 装配(game.js / index.html)

先从 `examples/maze3d/index.html` 选 recipe:basic / horror / puzzle / layers 都在同一个外部入口里,且都用同一份 `raycast-maze.js` runtime。追逐照抄 horror recipe,多层/多主题照抄 layers recipe,机关/隐藏物照抄 puzzle recipe,基础闭环照抄 basic recipe。**不要**把这些 recipe 当成不同模块;模块边界看 `modules/` 与 `manifest.modules`。

照抄 `examples/maze3d/` 里的**三个文件骨架**:`game.js` + `index.html` + `raycast-maze.js`(迷宫引擎本体——`index.html` 同目录 `<script src="raycast-maze.js"></script>` 引它,**漏复制 = 迷宫白屏、无报错**),再从 `world.js` 中复制你需要的 recipe 节点。**要加存档/地图/成就插件?** 用 `examples/text-adventure-demo/index.html` 的完整骨架(含 `#plugin-bar`/`#plugin-minimap`/`#plugin-overlay`)、再补 `<div id="maze3d-stage"></div>`。**关键**:
- `index.html` 必须有 `<div id="maze3d-stage"></div>`(模块挂载点)+ `<div id="scene"></div>`(present-svg 用,离开 maze 节点显示);两者**互不冲突**,模块进 maze 自动清 scene、离开自动清 stage。
- **混合游戏(scene + maze3d)别让 `.hint` 操作提示常驻**:`<div class="hint">方向键 ↑↓←→...</div>` 是给迷宫看的,在文字节点露出会跳戏。**最简加一行 CSS**:`#maze3d-stage:empty ~ .hint{ display:none }`(`:empty` = 当前非 maze 节点 → 自动隐藏 hint;通用兄弟选择器要求 .hint 与 #maze3d-stage 同父级 main,默认骨架满足)。纯迷宫游戏(全程 maze)不必加。
- `game.js` 用 `Amatlas.boot(WORLD, manifest)`。**maze3d 是自定义 kind,boot 不会自动拉它**——必须在 manifest 里显式传:`modules: [Amatlas.Maze3d.createMaze3dModule({ stageId: 'maze3d-stage' })]`(照 `examples/maze3d/game.js`)。boot **只**对内置 kind 自动拉(`scene`→文字冒险 / `encounter`→跑团);自定义 kind 不传 modules → `start()` 抛「无模块认领」→ 白屏。
- 怪物追玩家时**模块内有独立 AudioContext** 出心跳/压迫声(arcade 孤岛本就是),`amatlas-muted` localStorage 控制是否静音(工具栏 🔊 与 present-audio 同键、尊重用户设置)。
- **迷宫自带极轻氛围床**(低频 room tone)全程播 = 补"远处死寂"的压迫/沉浸;靠近怪物时心跳 + 该鬼专属 drone 再叠上(5 种鬼各有音色,克制不吵)。纯加性、可静音、惠及所有 maze 游戏,**你不用写**。
- **伪人(mimic)开口语音 = 可选 `mimicVoice`**:`createMaze3dModule({ stageId, mimicVoice })` —— `'formant'`(**默认**=合成嗓、语气全错的诡异念白、零依赖确定、跨机器一致、到处都响)| `'speech'`(真人嗓、靠「怪脸 × 真人嗓」反差、**更有特点**;走浏览器内置 TTS → 跨机器嗓不一 / 某些系统可能无声 → **自动回退 formant**)。统一入口的 horror recipe 用 `'speech'`(见 `examples/maze3d/game.js`)。**默认 `'formant'` 是保底**:不指定就用它(对齐 design-principles §11.7「约束=地板不是天花板;能优雅回退就允许 opt-in 超越、默认仍是地板」)。

## 10. 常见错误 / 闸报错对照

| 闸/现象 | 真因 | 修 |
|---|---|---|
| graph-audit 报 `'caughtBelow' 死键(读从不写)` | scareKey 没在 initState 声明 | 加 `initState: { caughtBelow: false }` |
| graph-audit 报 `maze3d 数据错误` / `迷宫不可通关` | grid/start/events/D 门/坐标写坏,或出口门被墙围死 | 跑 `node core/tooling/graph-audit.mjs src/world.js`,按报错修 grid、start、D 门和 events.set/warp |
| probe P0 `maze3d 模块没找到` | manifest **漏传** maze3d(boot 不自动拉自定义 kind) | `Amatlas.boot(WORLD, { modules:[Amatlas.Maze3d.createMaze3dModule({ stageId:'maze3d-stage' })] })`(照 `examples/maze3d/game.js`);**别**写 `Amatlas.boot(WORLD, {})` 指望自动拉 |
| 被抓时听不见 jump-scare | scareSfx 字段写成数组 / 拼错 | 写字符串:`scareSfx: 'horror-sting'`(不是 `['horror-sting']`) |
| 看不到鬼脸/全身像 | monsters 写法错(typo:`monsterz` / `enemies`) | 字段名是 `monsters`(复数 s) |
| 怪物站在墙里不动 | 起始格写了墙(`'#'`)或玩家踩同格 | grid 里那格必须是 `.` 地板 |
| 主题不生效(还是灰墙) | theme 字符串拼错(`'horror'` / `'spooky'` 不存在) | 照 §2 表照抄(`cave`/`dungeon`/...) |

## 11. 诚实告知玩家的 lo-fi 上限

如果用户期待"像 Resident Evil 那种像素手绘贴图"——告诉他**这是 Wolf3D / Doom1 级 fillRect lo-fi**:横向砖缝条 + 矩形阶梯近似的脸/门 + 1px 竖铁条逐列(正对最完整、斜视见几列)。优势是**单文件离线、无依赖、Web 直跑**。

视觉**不是手绘贴图**这一点必须诚实——但**叙事 + 节奏 + 声音 + 演出**给的恐怖感**完全到位**(因为人对节奏和声画同时的响应远大于贴图分辨率)。

---

## 12. 范本完整流程(从 0 到能玩)

1. **想清楚一句话**:这是什么恐怖游戏?(《咒怨》式 / Slenderman / SCP / 噩梦…)
2. **按 §8 速配表选** theme + 主怪物 face/body + scareSfx
3. **5 节点骨架** entrance + maze3d + 3 结局,照 §1 抄改字
4. **试跑闸**:`node core/tooling/graph-audit.mjs src/world.js` → 该绿,有 P0 必修
5. **build + smoke**:`node pipeline/build/build.mjs src/index.html --smoke` → 5/5
6. **真浏览器双击 `dist/index.html` 试玩** → 看效果调字、加 scene 节点铺垫、加跑团检定中段张力
7. **写 1-2 段叙事**铺 entrance 和 3 个结局,别让玩家觉得是"裸 demo 加了张鬼脸"

骨架小、写起来快(一个晚上能出短篇),但**叙事份量决定恐怖效果**——别只写技术,故事/动机/为什么进迷宫/那东西是什么/结局怎么回应一开始的悬念,才让玩家"被吓+被打动"。

---

## 13. 多层迷宫 / 钥匙门 / 机关门(组合范式,**零改 maze 模块**)

想做"三层迷宫,每层不同怪物/主题"、"出口要先过钥匙门 + 机关门"、"先探几个分区再开 Boss 门"?**全部用节点图组合实现,不需要也不应该改 maze 模块。** 这是 Amatlas "组合优于扩展" 的 DNA,已 graph-audit 实测可达 P0=0、有 Doom/Portal/塞尔达/Amnesia/密室逃脱真实背书。

> **完整可跑范本:`examples/maze3d/index.html` 的 layers recipe** —— 三层矿井(cave → dungeon → flesh),含层间侦察 encounter、钥匙门、机关门谜题、多结局和每个门控节点的保底出口;当前是观景版,不放追逐怪物,方便看清地面格缝/柱子/装饰层。**照抄它起步**,要高压版再按下方规则给各层加 `monsters`。

### ★ 核心心智模型(先记住,否则会误判"引擎不支持钥匙门")

> **多层迷宫 = 多个 `maze3d` 节点串联,中间用 scene/encounter/谜题节点衔接。**
> **"钥匙"= 一个全局 boolean flag**,在 maze **外**的 scene/encounter 过场节点取得(`link.run:(s)=>{s.hasKey=true}`);
> **"门"= 下一个 maze 节点入口 link 的 `requires`**(`requires:(s)=>!!s.hasKey`)。
>
> **两种正当钥匙玩法,按需求选(别混)**:
> - **跨层 / 多扇语义门**(红门要钥匙、蓝门直接开;或层与层之间)→ 用上面的**全局 flag + scene 过场**。迷宫里所有 `'D'` 行为相同(走到任一个+正对即整关通关),grid **无法区分**多扇不同语义的门,所以多门/跨层一律走 flag。
> - **同一迷宫内「先找钥匙再开那扇门」**(单扇出口,锁到你在迷宫里捡到钥匙)→ 用 **grid 内 `'K'` 钥匙**(范本见 `examples/maze3d/` 的 horror recipe):网格含 `'K'` 即出口门锁住,走近(<0.5 格)拾取后才开;**会话局部、不入存档、被抓/离开重置**(= 被追时找钥匙的张力)。这是 maze3d **原生支持**的,别用 flag 硬凑。
> - **隐藏普通线索/加成物**(不直接开本迷宫出口,而是影响后续检定/结局/成就)→ 用 §14 的 `visual:'floor-pickup'` / `visual:'wall-pickup'` + `run` 写 `S.flags.X` 或 `S.inventory`。它们不是 grid `'K'` 的替代品: `'K'` 管**本迷宫这扇门**,嵌入式拾取物管**出迷宫后的叙事/检定/隐藏结局**。
>   - **自定义钥匙外观**(可选,三选一,优先级 `keyArt` 自绘 > `keyIcon` 命名库 > 默认金钥匙):
>     - **命名物品库**(最省事)`maze.keyIcon: 'bone_key'` —— 直接选一个内置 glyph 名,不用画。科技迷宫 `keyIcon:'keycard'`、古墓 `'gem'`、奇幻 `'crystal'`、恐怖石窟 `'bone_key'`(全清单见 §14 末「物品库」表)。
>     - **完全自绘** `maze.keyArt: { art:[…字符网格…], palette:{字符:[r,g,b]}, mirror? }`(和怪物 `art` **同格式同校验**,见 §3「自定义外观」;一套共享=所有 `'K'` 同款)。
>     - 两个都不写 = 默认金钥匙剪影。**注意:钥匙外观不会按 `theme` 自动变**——想要主题化钥匙(科技=钥匙卡…)得**显式**写 `keyIcon`(意图清楚、不静默改你看得见的东西)。
>   - **网格自洽 graph-audit 会查**:发光门 `'D'` 被墙围死(从起点走不到门旁)→ **P0 硬拦**(迷宫不可通关);钥匙 `'K'` 全被墙围死(拿不到)→ P1 提醒。手敲 ASCII 网格记得**留一条 `'.'` 通路**从 start 走到门旁、和至少一把钥匙。

### 三类门写法(都是"中间节点写 flag → 下一 maze 入口 requires")

```js
// 【钥匙门】maze1 通关 → 过场拿钥匙 → maze2 入口门控
maze1:    { kind:'maze3d', winKey:'escaped1', scareKey:'caught1', /*…theme/monsters…*/ links:[
            { to:'keyroom',  requires:s=>!!s.escaped1, showWhenLocked:true, lockHint:'还没找到这层的门', label:'走出第一层' },
            { to:'caughtEnd',requires:s=>!!s.caught1,  showWhenLocked:true, lockHint:'——', label:'……(你被它抓住了)' },
            { to:'giveup',   requires:s=>!s.caught1 && !s.escaped1, label:'放弃,爬回去' } ] },   // ← 撤回门控成 !被抓&&!通关 → 被抓/通关后自动消失(否则"被鬼抓住还能退出迷宫"=不合理)。maze3d 节点 graph-audit 豁免「无保底出口」(迷宫本身=保底行动),撤回带 requires 不报 P0。
keyroom:  { kind:'scene', look:'桌上一把黄铜钥匙。', scene:{region:'cave',mood:'eerie'}, links:[
            { to:'maze2', run:s=>{ s.hasKey=true; }, label:'拿起钥匙,下第二层' } ] },

// 【层间检定】进 maze 前的侦察 / SAN 检定 = kind:'encounter'(tabletop;boot 见 encounter 自动拉模块,game.js 要给 sheet)。
//   ⚠️⚠️ encounter 必须写 scene!漏写 = 进入时【没画面】,要等点了检定、骰子才把一个空场景顶出来突兀冒灰底(graph-audit 报 P1)。
//   success/fail 都→下一节点 = 非阻塞,只给氛围 + 资源消耗;encounter 的无条件保底走 exits(不是 links)。
scout:    { kind:'encounter', look:'下井前你贴着井壁听了听,矿道深处有什么在动。', scene:{region:'cave',mood:'dread'},   // ← 别漏 scene!
            checks:[{ id:'scout', label:'侦察(感知 · DC 7)', skill:'感知', dc:7, dice:'2d6', cost:{res:'理智',amount:1},
                      success:{ text:'你摸清了它的巡逻路线,心里有了底。', to:'maze2' }, fail:{ text:'太安静,什么都没听出来。', to:'maze2' } }],
            exits:[{ to:'maze2', label:'不侦察,直接下去' }] },                                  // ← encounter 保底=无条件 exits
maze2:    { kind:'maze3d', /*…*/ },                                  // 入口已被上一步的 run 解锁;或在 maze2 前加 scene 用 requires:s=>!!s.hasKey 门控

// 【机关门】maze 出口 → 谜题节点(组合锁/Simon,见 puzzles-and-minigames.md)→ 解开写 flag → 下一 maze
mechanism:{ kind:'scene', look:'刻满符文的石门。', links:[
            { to:'maze3', run:s=>{ s.leverPulled=true; }, label:'扳下拉杆,石门滑开' } ] },

// 【元门 AND(Boss 门 / 密室多线汇入)】requires 天然支持任意布尔
bossdoor: { kind:'scene', links:[
            { to:'finalmaze', requires:s=>s.hasKey && s.leverPulled && s.sigilFound, showWhenLocked:true, lockHint:'三道封印还差几道', label:'推开最终之门' },
            { to:'hub', label:'回去继续找' } ] },                    // ← 保底出口
```

### 多层结构(纯数据,层层不同)

- **难度递进三轴**:① 怪物 `monsters` 从 `[]`(无怪建立地图记忆)→ 单怪追 → 多怪恐慌;② 主题 `theme` 逐层换(cave→dungeon→flesh,压迫升级);③ 中间 encounter 节点 DC 逐层递增。
- **主题切换 = 每个 maze3d 节点独立写 `theme` + `monsters`**:洞穴(mimic)→ 障子凶宅(yurei)→ 血肉迷宫(slender),中间 scene 节点切 region/mood/audio.bgm 做"进入新地层"过场。
- **节奏 = 奇偶交替**:奇数节点 maze3d(高压闯关)、偶数节点 scene/encounter(减压叙事+检定缓冲)= Amnesia/层层恐惧章节制张力曲线。
- **Hub-Spoke(进阶)**:中央 scene 用多条 requires 不同的 links 通往各分区 maze,各区通关写不同 flag,集齐 → 开 Boss 门。

### escape hatch 铁律(分两种节点)

- **scene / encounter 过场节点**:每个门控 link 必须配一条无条件、非 `once`、指向别节点的保底出口(放弃/退回),否则 graph-audit 报 soft-lock **P0** 硬拦。encounter 的保底走 `exits:[{to,label}]`(无条件,见上面 scout)。
- **maze3d 节点**:进度发生在迷宫内部(走到门=winKey、被怪抓=scareKey,经 api.apply 写 flag),links 只是【事后路由】。**撤回出口必须门控成 `requires:s=>!s.被抓 && !s.通关`**(被抓/通关后自动消失,只剩对应结局),否则"被鬼抓住了还能选退出迷宫"=不合理(showcase 实测 issue④)。maze3d 节点 graph-audit **豁免**「无保底出口」检查(迷宫本身=保底行动),所以三条 link 全带 requires 也不报 P0。
- 所有 win / 钥匙 / 机关 / 被抓 flag **必须在 `initState` 声明为 false**(否则 graph-audit 报死键)。

### 诚实边界(这些做不到 → 不是 bug,是设计取舍,拆成多节点体验等价)

- ⚠️ **多扇不同语义门 + 凭记忆回溯到「特定那一扇」**(RE/Metroidvania 式:记住红门在哪、绕回去开它)——maze3d 所有 `'D'` 等价、内部态不入存档,**这个做不到**。但**单扇出口的「先找钥匙再开门」可以**(grid `'K'`,见上文 + `examples/maze3d/` horror recipe):一扇门、锁到捡起会话局部钥匙。要真正的多门回溯 + 可存档,请走离散 `crawler` 路线。
- ❌ **同一 grid 内多扇语义不同的门、玩家自选顺序**——所有 `'D'` 行为相同。拆成"前置 scene 节点让玩家选进哪个 maze"等价。
- ⚠️ **迷宫内实时拾取(不退出就捡)**——**flag 版现已可做**(§14 `maze.events[]`):"走到道具格 → `run` 写 `S.flags.gotX`"无需退出,出迷宫后据 flag 展开。**进物品栏也已可做**:`run` 里 `(S.inventory || (S.inventory = [])).push('photo')` → 🎒 物品栏插件(`plugins/inventory.js`:多件持久物品 + UI 列表 + 可选 `world.items` 显示字典/图标)在工具栏显示、**随存档**;见 `examples/maze3d/` horror recipe(照片拾取进栏 + 骨钥匙 `'K'` 留迷宫局部 `g.*` 不进栏 = 持久 vs 迷宫临时)。**仍不做**的只是迷宫内**可丢弃 / 格位拖拽**那类重 UI(§10)。

**别因为这些"做不到"就误判"引擎不支持多层迷宫" —— 95% 的多层/钥匙门体验用上面的组合范式都能做,且每节点职责单一、对照抄更友好。**

## 14. 迷宫内坐标事件钩子 `maze.events[]`(走到某格触发 = 迷宫内叙事)

打开"黑盒孤岛":让作者在迷宫**空间内**埋叙事——玩家走进某格即触发。

```js
maze: {
  grid: [/*…*/], start: { x: 1, y: 1, dir: 'E' },
  events: [
    { x: 9, y: 1, once: true, visual: 'pickup', icon: 'photo', hint: '脚下有半张照片', run: function (S, api) { S.flags.foundPhoto = true; } }, // pickup=显眼关键物,远处也该看见
    { x: 4, y: 6, once: true, visual: 'floor-pickup', icon: 'ritual_marks', hint: '地砖缝里藏着一枚细小符号', run: function (S) { S.flags.hasRubbing = true; } }, // floor-pickup=地面嵌入隐藏物,贴近中心才拿
    { x: 2, y: 5, once: true, visual: 'wall-pickup', face: 'N', icon: 'scroll', hint: '墙缝里夹着一页残纸', run: function (S) { S.flags.hasWallNote = true; } }, // wall-pickup=墙壁嵌入隐藏物,面向并贴近 face 才拿
    { x: 5, y: 5, once: true, visual: 'plate', hint: '石板下沉——远处传来石门声。', set: [{ x: 8, y: 1, ch: '.' }] },         // plate/marker/trap=贴地机关,不是可拾取立牌
    { x: 3, y: 7, hint: '墙上有抓痕' }    // 纯氛围提示:run/icon/visual 都可省(floor-text 式)
  ]
}
```

- **`x, y`**(必需整数):格坐标(同 grid,`(0,0)` 左上)。
- **`run(S, api)`**(可选,但 `run`/`hint` 至少有一个):走进该格调用,**只写 flag / 推进 state**(同 `link.run` 族)。
- **`hint`**(可选):走进该格时在迷宫 HUD 叠一行字(氛围 floor-text),**持续约 2.6 秒**(走过该格也读得到、不一闪而过)。
- **`once`**(可选,默认 false):`true`=本次进迷宫只触发一次;`false`=每次"走进"都触发(站着不动不重复,离格再进才再触发)。
- **`icon`**(可选字符串):给道具一个**可见精灵**(命名物品库,清单见下表)——玩家在迷宫里看得见、能走过去,像捡钥匙一样。不写 = 隐形触发格(只有 hint/run,向后兼容)。`once:true` 的道具触发后精灵**消失**(=被拾取);`!once` 常驻地标。想完全自绘用 `art`/`palette`(同怪物格式,优先级 `art` > `icon`)。**拾取给优势**就是「迷宫外用选项选」的等价:`run` 写 `S.flags.X`/计数 → 出迷宫后节点 `requires` / 跑团检定 `dc` 读它。
- **`visual`**(可选字符串,maze 私有视觉角色):不写时引擎按字段自动选视觉:`icon/art` → `pickup`(独立落地 token,能拿),`set/warp/turn` → `marker`(贴地机关),纯 hint → `none`(不可见)。需要明确语义时写:
  - `visual:'pickup'` = 显眼关键物/可拿走的物体(照片、药瓶、宝石、钥匙卡)。底部贴地,但仍是独立 token。
  - `visual:'floor-pickup'` = 地面嵌入式隐藏普通物(符文拓印、碎片证物、后续检定加成线索)。必须有 `icon` 或 `art`;贴近格中心才触发。
  - `visual:'wall-pickup'` = 墙壁嵌入式隐藏普通物(墙缝纸片、壁龛徽记、嵌在砖里的符片)。必须有 `face:'N'|'E'|'S'|'W'` + `icon/art`;`x/y` 是玩家站的地板格,`face` 指向相邻墙,玩家面向并贴近该墙才触发。
  - `visual:'marker'` = 贴地机关/符文/传送阵(按 `set/warp/turn` 自动换踏板、符文环、方向盘)。
  - `visual:'plate'` = 压力板/凹槽/踏板,读作「踩上去触发」。
  - `visual:'trap'` = 危险地面格/陷阱,读作「别踩或踩了会出事」;只是视觉角色,具体玩法仍由 `turn`/`set`/`run` 等字段决定。
  - `visual:'none'` = 隐藏触发器/暗格陷阱(即使写了 icon/art 也隐藏,会 warn 提醒)。

**形态铁律**:关键可拾取物 = 独立 token;隐藏普通物 = 地面/墙面嵌入且贴近才拿;机关/陷阱 = 贴地 marker;decor/wallDecor = 背景。别把压力板、传送阵、地板陷阱画成可拾取立牌;也别把关键宝石/照片压成普通地砖污渍。普通隐藏物才用 `floor-pickup` / `wall-pickup`,颜色只是辅助,形态才是一眼读懂的语义。

**语义 / 铁律**:
- 触发 = **走进格那一刻**(格内转身、站定都不重复;非每帧)。
- **`run` 里只写 flag、别调 `api.go` 跳节点** —— 迷宫是 canvas 实时孤岛,中途弹去叙事节点会割裂(画面残留)。叙事走**通关/被抓后的 links 出口**据 flag 展开(范例:`examples/maze3d/` horror recipe 走到 (5,1) 埋 `foundPhoto` → `horror_escaped.look` 读它多一句)。
- **`once` 是"本次进迷宫"范围**(同钥匙:被抓/退回/重进 → 迷宫重置 → 可再触发)。要**跨会话只一次**,run 里写 `S.flags.X`、下游读它即可(flag 入档持久;迷宫内实时态不入档)。
- `run` 抛错被隔离(`console.error`、不冻结画面),但那是你的 bug、去修。
- 坐标落在墙 `'#'`/门 `'D'` 格(玩家走不到)→ 启动 `console.warn`(typo 提醒);缺 run 且缺 hint / 坐标越界 / x,y 非整数 → 启动**抛**(fail-loud)。

**这条正是解"迷宫只能填数据不能编程"** —— 有了它,迷宫能承载"走到尽头读到日记""踩中机关埋下伏笔"等空间叙事,而非纯逃脱孤岛。

#### 物品库(`events[i].icon` / `maze.keyIcon` 可选值)

内置命名精灵(程序化绘制,直接写名字即用;想自绘用 `art`/`palette`)。**固定语义色,不随主题变**;floor 物品有可见性下限(远处也看得清)。

| icon | 类别 | 外观 |
|---|---|---|
| `key` | 钥匙(默认) | 金钥匙(不写 keyIcon 即此) |
| `bone_key` | 恐怖/地牢 | 骨白骷髅钥匙 |
| `keycard` | 科技 | 卡片+磁条+照片区 |
| `gem` | 古墓/宝物 | 多面宝石(蓝绿) |
| `crystal` | 奇幻 | 紫水晶簇 |
| `coin` | 宝物 | 暖金圆币 |
| `scroll` | 文件/线索 | 卷轴+文字横线 |
| `note` | 文件/线索 | 折叠便条 |
| `photo` | 恐怖/线索 | 带血迹的照片 |
| `tape` | 科技/恐怖 | 磁带 |
| `vial` | 消耗品 | 红液药水瓶 |
| `rune` | 谜题 | 石板+符文刻痕 |
| `idol` | 谜题/宝物 | 神像剪影 |
| `lantern` | 光源 | 提灯(暖光) |
| `battery` | 科技 | 蓝色电池 |
| `skull` | 恐怖/地牢 | 头骨 |

未知名 → 退化(钥匙=金钥匙 / 事件=无精灵)+ 控制台 warn(列出可用名);非字符串 → 报错(fail-loud)。

**自己扩展物品库**(三选一,从轻到重):
1. **一次性自绘**:某个事件/钥匙要独特外观 → 直接给它 `art`/`palette`(同 §3 怪物外观格式),不必进库。
2. **本游戏可复用 / 覆盖内置** → `maze.icons`:作者自己的物品表,**写一次、多处用名字引用**;同名可覆盖内置(如把 `gem` 改成你的红宝石):
   ```js
   maze: {
     icons: { 火把: { art:['.A.','AAA','.A.'], palette:{ A:[240,160,40] } },
              gem:  { art:[…], palette:{…} } },   // 同名=覆盖内置 gem
     keyIcon: '火把',
     events: [{ x:3, y:7, icon:'火把', … }]
   }
   ```
   解析**先查 `maze.icons` 再查内置**;坏数据报错(fail-loud)。这是给下游作者的扩展接口,纯数据、不改引擎。
3. (引擎级新增预设=改 `raycast-maze.js` 的 `GLYPHS` 表,一般不需要——前两条已覆盖。)

#### 运行时机关:`set` 改格 / `warp` 传送 / `turn` 转向 / `activateMonsters`+`deactivateMonsters` 怪物调度(解谜 · 探索 · 节奏)

前面的 `run`/`hint`/`icon` 只改**状态**、放**道具**——碰不到迷宫本身。这些 `events[i]` 可选字段让"走到某格"**改变迷宫几何或怪物状态**,把迷宫从"走廊找门"升级成"解谜开路 / 有节奏地放怪"(你写纯数据,引擎内部执行、不写代码):

- **`set: [{ x, y, ch }]`** —— 把格 `(x,y)` 改成字符 `ch`。`ch:'.'`=开门 / 打通暗墙(变可走);`ch:'D'`=关门 / 立一扇门;`ch:'#'`=立墙封路;`ch:'K'`=**机关放出钥匙**(迷宫批1 M5,见下例)。**一个字段做 开 / 关 / 破 / 立 / 放钥匙**,改完当帧生效(墙变通路、怪的寻路同步更新、钥匙精灵当帧出现)。
- **`warp: { x, y, dir? }`** —— 把玩家**传送**到格 `(x,y)`(可选 `dir` 改朝向 N/E/S/W)。做传送阵、突破网格物理大小的"比迷宫更大的空间"。
- **`turn: 'N'|'E'|'S'|'W'`** —— 原地**强制转向**(spinner),无地图时制造迷失感。
- **`when: (state) => boolean`**(可选)—— 给事件加**条件**:坐标到了、还要 `when` 为真才触发整条事件。做"解对顺序才开门""有撬棍才破墙"这类**真谜题**。不写 = 无条件(踩了就触发)。
- **`activateMonsters` / `deactivateMonsters`**(可选,两键独立、可同现)—— 走到该格时批量**唤醒 / 停用**怪物。两种形态:`true`=作用全部怪;`[0, 2, …]`=整数索引数组,精确到 `maze.monsters` 下标(下标从 0、按数组声明顺序)。停用的怪**当帧起**不追、不渲染、不进最近怪心跳/压迫声场(等同"消失");激活的怪从下一帧起正常追逐。**两键同现时固定顺序=先 deactivate 后 activate**(同一下标两边都写 → 最终态是激活)。经典用法——「进禁区唤醒怪」:入口处怪物 `active:false`(缺省不追),玩家踏入禁区那一格触发 `activateMonsters:true`,怪物瞬间从静止转为追猎;反过来也能做"解开机关后怪物撤退"(`deactivateMonsters`)。v1 是瞬时开关,不做渐隐/渐显动画。

```js
maze: {
  grid: [/* …出口门附近故意用 '#' 封死…(示意占位:下方各事件坐标请按你的真实网格调整——warp/set 目标落在墙上会在进迷宫那一刻直接抛错,fail-loud 保护) */], start: { x: 1, y: 1, dir: 'E' },
  monsters: [{ x: 8, y: 8, body: 'slender', active: false }],   // 禁区守卫:缺省 active:false = 静止不追,埋伏等触发
  events: [
    // 压力板:踩 (3,1) → 远处封路的墙 (5,1) 沉下去变通路。visual:'plate'=贴地踏板,不是可拾取立牌
    { x: 3, y: 1, once: true, visual: 'plate', hint: '石板下沉——某处石墙隆隆让开。', set: [{ x: 5, y: 1, ch: '.' }] },
    // 压力板召唤钥匙(迷宫批1 M5):踩 (2,8) → 远处石台 (8,2) 浮现一把钥匙。此时门早已锁住——
    //   maze.grid 里没写任何 'K',但只要某个 events[].set 含 ch:'K',needKey 就在【进迷宫那一刻】静态扫描为 true,
    //   门从一开始就锁,不必等玩家真的踩中压力板;"先解机关、钥匙才现身"的经典编排,不用另开一把明摆着的钥匙。
    { x: 2, y: 8, once: true, visual: 'plate', hint: '石座震动——远处传来轻微的叮响。', set: [{ x: 8, y: 2, ch: 'K' }] },
    // 顺序谜题终步:前面几格用 run 累加 S.step,终点格 when 满足才开门
    { x: 6, y: 6, visual: 'plate', when: function (S) { return S.step === 3; }, set: [{ x: 6, y: 1, ch: '.' }] },
    // 传送阵 + 旋转/陷阱格
    { x: 2, y: 2, visual: 'marker', hint: '空间扭曲了…', warp: { x: 5, y: 8, dir: 'S' } },
    { x: 4, y: 4, visual: 'trap', turn: 'W', hint: '脚下地砖猛地旋转,你失去了方向。' },
    // 进禁区唤醒怪:踏入 (7,7) → monsters[0] 从静止转为追猎(true=也可换成 [0] 精确到下标)
    { x: 7, y: 7, once: true, visual: 'trap', hint: '警报骤响——黑暗里有什么醒了。', activateMonsters: true }
  ]
}
```

**这一组字段能做**(经典地牢解谜,全靠组合):压力板开门、暗墙 / 密道(贴墙 `hint` 暗示 + 邻格 `set` 打通)、机关联动(踩 A 开远处 B)、**机关放钥匙**(踩 A、远处浮现钥匙 B,见上例)、顺序谜题(`run` 累加 + `when`+`set`)、折返门、传送迷宫、旋转迷失、**埋伏怪节奏**(`monsters[i].active:false` 起始静止 + `activateMonsters` 唤醒 / `deactivateMonsters` 撤退,做"安全区↔追逐区"张弛)。

**铁律 / 诚实**:
- **改格后必须保证两侧仍可达,别用 `set` 把唯一出路封死** = 软锁。审计闸(graph-audit)会**先模拟"所有可达机关都触发"再判门可达**(认 `set`/`warp`),所以"门故意静态围死、踩机关才开"是**合法设计**——但**前提是机关(压力板格)本身玩家走得到**;机关也被围死 → 闸照样报 P0(不可通关)。
- `set` 的 `ch` 只支持 `'#'`/`'.'`/`'D'`/`'K'`;`warp` 目标必须是可走格(不能传进墙里);`activateMonsters`/`deactivateMonsters` 只支持 `true` 或整数索引数组、索引不得越出 `maze.monsters` 范围;写错 → **启动即报错**(fail-loud,boot 横幅)。
- **`ch:'K'` 放钥匙时,`needKey`(门锁)在【进迷宫那一刻】就静态成立**——`maze.grid` 里哪怕一个 `'K'` 都没写,只要任意 `events[].set` 里含 `ch:'K'`,门从一开始就锁,不需要等玩家真的踩中机关(HUD 的"先找钥匙"三态文案自动正确)。反过来,**后续 `set` 把已放出、尚未拾取的 `'K'` 格覆写成别的字符**(比如再一次 `set` 把它变回 `'.'`)会让那把钥匙的精灵**同步消失**——如果这是全场唯一一把钥匙,门就再也开不了(会话内软锁);这是内容自由(想做"陷阱撤回奖励"完全可以),但别无意中把唯一钥匙自己 `set` 掉。
- **机关有自动视觉 + 自动音效 + 远程机关的 hint 措辞**:三种改几何的机关(踩板 set / 传送 warp / 转向 turn)没写 icon/art 也会自动生成**贴地 marker**(踏板/符文环/方向盘),不是可拾取立牌;并各有可区分的程序化音效(踩板的"咔"+石块闷响 / 传送的吸入-弹出弧 / 转向的旋转+卡哒),你不用写。**远程机关**(踩的格和被改的墙/门隔很远、玩家看不到变化):① 引擎自动把踩板声按"被改的格离你多远"调远近(远→低闷 + 大混响、几乎只剩回响 =「远处某处动了」),玩家靠听就知道触发了;② 但 **hint 别写"前方"**(被改的墙可能在背后/拐角后)——写不假设方位的:对「踏板下沉,某处传来低沉的石响…」「迷宫深处有什么动了」;错「前方石墙沉入地面」。warp/turn 同理:「空间折叠,你出现在迷宫另一处」「脚下地砖旋转,把你推向另一方向」。`activateMonsters`/`deactivateMonsters` 本身不自动配音效/marker(hint 自己写,如上例「警报骤响」)。
- `set`/`warp`/`turn`/`activateMonsters`/`deactivateMonsters` 改的是**本次进迷宫**的局部状态(同钥匙):被抓 / 退回 / 重进 → 迷宫**复位**(机关重置、怪物回到 `maze.monsters` 里声明的初始 `active`、重新解)。要跨会话记住"解过了",在 `run` 里写 `S.flags.X`、下游读它。

- **完整可跑范本:`examples/maze3d/` 的 basic recipe** —— 压力板开石门 + 探索死路捡草图,照抄它起步。若不确定该复制哪一个 maze3d 变体,先打开 `examples/maze3d/index.html` 看 basic / horror / puzzle / layers 分流。
