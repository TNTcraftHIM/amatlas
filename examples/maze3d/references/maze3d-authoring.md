# maze3d 作者手册

> 适用对象:写 `kind:'maze3d'` 节点的人类作者与 AI 作者。
> 核心边界:`maze3d` 是 Amatlas 的模块私有 runtime,不是公共 `module-interface.md` 契约。下列字段只在 `engine/examples/maze3d/raycast-maze.js` 这一类第一人称迷宫里有效。
>
> 当前有两个可玩入口：`engine/examples/maze3d/index.html` 是 basic / horror / puzzle / layers / fps-range 的统一 recipes 入口，`engine/examples/maze3d/fps.html` 是直接从同一 `world.js` 派生 `start=fps_range` 的玩家入口。二者加载同一个 `raycast-maze.js` runtime，FPS 不是不同模块。Showroom 优先嵌入 `fps.html`；两个 Gallery 仍是作者 helper。

## 0. 先记住这五句话

1. **底层永远是二维 grid。** 第一人称画面只是呈现层;作者写格子、门、钥匙、坐标事件和状态。
2. **出口永远是 `D` 门。** `exitStyle` 只换门的样子,不改变路线;分支和层间移动用外层 `links.requires` / 多个 `maze3d` 节点表达。
3. **普通追逐与 FPS 战斗二选一。** 普通怪写 `maze.monsters`;FPS 最多一个守卫写闭合的 `maze.combat.guard`;同一节点不能双写。
4. **迷宫内局部态不入档。** 玩家位置、已踩机关、已拿迷宫内钥匙、怪物状态，以及 combat 的 HP / 弹药 / 补给消费都是本次进入迷宫的 runtime 状态;被抓、退出、重进会重置。
5. **持久剧情写 Amatlas state。** 逃出写 `winKey`;普通追逐被抓写 `scareKey`;combat 阵亡写 `deathKey`;跨迷宫钥匙、剧情分支、结局条件用普通 `run` / `flags` / `links.requires`。

## 1. 最小节点骨架

```js
some_maze: {
  kind: 'maze3d',
  title: '地底回廊',
  winKey: 'escapedMaze',
  look: '走到发光门 D 前,正对它推开。',
  wonText: '你推开门,回到了光里。',
  maze: {
    grid: [
      '#######',
      '#.....#',
      '#.###D#',
      '#.....#',
      '#######'
    ],
    start: { x: 1, y: 1, dir: 'E' },
    theme: 'dungeon'
  },
  links: [
    { to: 'after_maze', label: '走出迷宫', requires: function (S) { return !!S.escapedMaze; }, showWhenLocked: true, lockHint: '先找到出口门 D' },
    { to: 'hub', label: '先退回入口' }
  ]
}
```

要点:

- `x` 是列,`y` 是行,左上角是 `(0,0)`。
- `dir` 是 `N` / `E` / `S` / `W`。
- `D` 是实心门:挡路、可见、正对贴近后通关;有钥匙时会先锁住。
- maze3d 内部通关只写 `winKey`;真正跳到下一个剧情节点仍靠外层 `links`。

## 2. grid 字符

| 字符 | 语义 | 作者注意 |
|---|---|---|
| `#` | 墙,挡路,raycaster 会画成墙面 | 外圈建议全封闭,避免作者和玩家读不懂边界。 |
| `.` | 可走地板 | 玩家、怪物、事件、装饰一般放在地板格。 |
| `D` | 出口门,实心挡路 | 正对贴近后写 `winKey`;门样式用 `exitStyle` 改,路线不用它改。 |
| `K` | 迷宫内钥匙,可走地板上的发光物 | 只在本次进入迷宫内有效;拿到后可开本迷宫的 `D` 门。 |

不要使用未列出的 grid 字符。旧文档或草稿里出现过的其它字符,不等于当前稳定作者面。

## 3. 节点字段

| 字段 | 类型 | 语义 |
|---|---|---|
| `kind` | `'maze3d'` | 必填。由 Maze3d 模块认领。 |
| `title` | string | 当前节点标题。 |
| `look` | string/function | 未通关/未被抓时的正文说明。 |
| `winKey` | string | 玩家推开 `D` 门后写入 `state[winKey]=true`。 |
| `wonText` | string | 已通关后 render 出来的说明。 |
| `scareKey` | string | 被怪抓住后写入 `state[scareKey]=true`。 |
| `caughtText` | string | 已被抓后的说明。 |
| `scareSfx` | string | 被抓瞬间交给通用 audio presenter 播放;不写走默认惊吓音。 |
| `scareAmbient` | string/false | 探索迷宫时若要叠通用 ambient 可写;默认 maze3d 自己接管实时声音并停旧主轨/氛围。 |
| `stageId` | string | 高级用法:指定 canvas 挂载点。普通游戏用默认 `maze3d-stage` 或装配时统一传 `stageId`。 |
| `links` | Action[] | 仍是 Amatlas 普通链接。通关/被抓后的去向写在这里。 |

### 不要误抄 demo 胶水

`engine/examples/maze3d/game.js` 里的这些是示例入口专用,不是每个游戏都要抄:

- `stageId:'maze3d-stage'` 的具体命名
- `mimicVoice:'speech'`
- demo 的 `sheet`、`InventoryPlugin`、hub/reset 函数
- `gallery.html` / `audio-gallery.html` 链接

自己做游戏时,先抄一个 `kind:'maze3d'` 节点骨架,再接入自己的 world/map/links。maze3d 是示例私有的**自定义 kind**,不是 boot 内置模块，装配时三件事缺一不可:

1. 把 `examples/maze3d/raycast-maze.js` 复制到 `src/`，在 `src/index.html` 中于 `world.js/game.js` 之前引 `<script src="raycast-maze.js"></script>`。
2. `src/index.html` 保留 `<div id="maze3d-stage"></div>`，并用本作 CSS 安排 canvas 与触屏控件。
3. `src/game.js` 的 manifest 显式写 `modules:[A.Maze3d.createMaze3dModule({stageId:'maze3d-stage'})]`。只写 `kind:'maze3d'` 而漏掉这个实例会 fail-loud 报“无模块认领”。

完整 recipes 装配从 `examples/maze3d/index.html` / `game.js` 取；玩家直达但不复制关卡的派生方式从 `examples/maze3d/fps.html` / `fps-game.js` 取。只复制数据节点而不复制 runtime 不会得到 FPS。不要把这条私有装配写成 boot 自动拉取，也不要另建一个 `fps` 模块冒充 Recipe 5。

## 4. `maze` 字段总览

### 4.1 基础结构

| 字段 | 类型 | 语义 |
|---|---|---|
| `grid` | string[] | 行数组,**必须矩形**(每行等长)——graph-audit 发布闸按矩形硬校验,非矩形报 P0。(runtime 本身按行读字符、越界当墙能容忍,但发布前必须矩形才过闸。) |
| `start` | `{x,y,dir}` | 起点格与朝向。起点应在可走地板或钥匙格,不要放墙/门。 |
| `theme` | string | 协调画面、门、雾、地面/墙面装饰和默认 idle 文案。 |
| `idleHint` | string | 覆盖无事件提示时的 HUD 氛围句。 |

当前已知主题:

```txt
'' / cave / dungeon / shoji / flesh / metal / station / ice / clinic /
industrial / tomb / crystal / neon / submarine
```

未知主题会退回中性默认并 warn。作者优先选主题,不要从零手配一堆颜色。

### 4.2 材质、门、墙高

| 字段 | 类型 | 可选值 / 语义 |
|---|---|---|
| `wallTex` | string | `none` / `brick` / `stone` / `tile` / `smalltile` / `wood` / `shoji` / `flesh` / `circuit` / `panel` / `hull` / `sandstone` / `crystal` / `ice` / `plate` |
| `floorTex` | string | `slab` / `tile` / `panel` / `crack` |
| `ceilTex` | string | `slab` / `beam` / `rib` / `panel` |
| `exitStyle` | string | `glow` / `portcullis` / `iron-bars` / `shoji` / `sphincter` / `blast-door` / `archway` / `portal` / `stairs` / `elevator` / `wheel-hatch` |
| `wallScale` | number >= 1 | 整场景墙体视觉拔高,适合大厅/高墙感;不改变碰撞。 |
| `wallHeights` | object | 高级用法:`{'x,y': scale}` 单格视觉拔高;不要拿它做真楼层。 |
| `flatWalls` | bool | 强制平整墙高。 |
| `wallTexMode` | `'tile'|'stretch'` | 高墙纹理平铺还是拉伸。 |
| `wearLevel` | 0..1 | 污损程度。 |
| `topBoost` / `botDip` / `aoStrength` | number >= 0 | 墙面边缘/脚部暗带微调;普通作者少用。 |
| `floorLineK` | number >= 0 | 地面格缝强度。 |

边界:这些都是视觉字段。它们不改变 `grid`、不制造可走高低差、不让玩家跨墙。

### 4.3 钥匙外观与 icon 库

| 字段 | 类型 | 语义 |
|---|---|---|
| `keyIcon` | string | 给所有 `K` 钥匙换命名图标。 |
| `keyArt` | `{art,palette,mirror?}` | 自绘钥匙外观;优先级高于 `keyIcon`。 |
| `icons` | object | 自定义/覆盖命名图标表。 |

内置 icon 名:

```txt
key / keycard / bone_key / gem / crystal / coin / scroll / note / photo /
tape / vial / rune / idol / lantern / battery / skull / compass
```

自绘 art 格式:

```js
{
  art: [
    '.AA.',
    'AAAA',
    '.AA.'
  ],
  palette: { A: [240, 200, 90] },
  mirror: false
}
```

规则:

- `art` 每行等长,非空。
- `palette` 是字符到 `[r,g,b]` 的表。
- `.` 和空格保留为透明。
- 镜像后尺寸上限仍是 32×32。
- 坏 art 会 fail-loud 抛错,不要靠“差不多能画”蒙混。

## 5. 坐标事件 `maze.events[]`

事件是 maze3d 的解谜底座:玩家进入某格,可显示提示、写状态、改格、传送、强制转向、启停怪物;也可以给可见物写只读 `examine` 线索,让玩家按 `E` / `Enter` 或点“查看”先观察。默认推荐仍是走过去、踩上去、贴上去就触发,因为这最简单、最像网格迷宫;只有下游确实需要“拉一下 / 使用 / 阅读 / 插入”这种主动确认时,才写 `trigger:'interact'`。

### 5.1 基本形态

```js
events: [
  {
    x: 3, y: 1,
    once: true,
    visual: 'plate',
    hint: '你踩上一块松动石板,远处石墙沉下。',
    set: [{ x: 5, y: 1, ch: '.' }]
  }
]
```

| 字段 | 类型 | 语义 |
|---|---|---|
| `x`, `y` | int | 触发格坐标。 |
| `once` | bool | 本次进入迷宫内只触发一次。不是持久去重。 |
| `hint` | string | HUD 提示。 |
| `examine` | string | 只读检视线索。玩家按 `E` / `Enter` 或点“查看”时显示,不触发动作、不消耗 `once`。 |
| `trigger` | `'interact'` | 可选主动互动逃生口。默认不写;写了以后进入/贴近只显示上下文目标,按 `E` / `Enter` 或点“互动”才执行 `hint/run/set/warp/turn/activateMonsters/deactivateMonsters` 并消耗 `once`。目前只支持这个值,拼错会 fail-loud。 |
| `when` | `(state)=>boolean` | 条件为真才触发整条事件。 |
| `run` | `(state, api)=>void` | 写 Amatlas state / flags / inventory。不要在里面跳节点。 |
| `set` | `{x,y,ch}[]` | 改 grid: `#` 立墙,`.` 开路,`D` 立门,`K` 放出钥匙。 |
| `warp` | `{x,y,dir?}` | 传送到可走格,可选重设朝向。 |
| `turn` | `N/E/S/W` | 强制转向。 |
| `activateMonsters` | `true|int[]` | 启用全部怪或指定下标怪。 |
| `deactivateMonsters` | `true|int[]` | 停用全部怪或指定下标怪。 |
| `visual` | string | 事件在画面里的视觉角色。 |
| `icon` | string | 视觉物使用的命名 icon。 |
| `art` / `palette` / `mirror` | object fields | 自绘事件视觉物。 |
| `face` | `N/E/S/W` | `visual:'wall-pickup'` 必填,表示物品嵌在哪面相邻墙。 |
| `pages` | object[] | 可选状态页。默认页放前,更具体状态页放后;同一事件按 state 选择当前页。详见 5.5。 |

### 5.2 `visual` 怎么选

| visual | 用途 | 触发心智 |
|---|---|---|
| `pickup` | 显眼关键物,例如宝石、卡片、重要文件 | 走到格内拿。 |
| `floor-pickup` | 地面嵌入式隐藏普通物,例如符文拓印 | 必须配 `icon` 或 `art`,贴近格中心才拿。 |
| `wall-pickup` | 墙面隐藏物,例如墙缝纸片 | 必须配 `face` + `icon/art`;站在地板格内、面向并贴近那面墙才拿。 |
| `marker` | 贴地机关标记 | 踩触发,一般不读作可拿物。 |
| `plate` | 压力板 | 踩触发,适合开门/破墙。 |
| `trap` | 陷阱 | 踩触发,适合转向/伤害/写 flag。 |
| `none` | 完全隐藏触发器 | 谨慎用;必须给足别处线索,避免无提示撞墙。 |

好习惯:

- 不要从 `run` / `hint` 猜视觉。想要隐藏物就显式写 `floor-pickup` 或 `wall-pickup`。
- 机关优先用声明式 `set` / `warp` / `turn`,少用 `run` 直接处理玩法。
- `wall-pickup` 的 `x/y` 是玩家站的地板格,`face` 指向的相邻格必须是 `#` 墙。

### 5.3 只读检视 `examine`

`examine` 是“先看一眼”的线索,不是触发器。玩家在上下文目标旁按 `E` / `Enter`,或在触屏/鼠标上点画面里的“查看”按钮,HUD 会显示这段文字。

```js
events: [
  {
    x: 2, y: 3,
    visual: 'wall-pickup', face: 'N', icon: 'scroll',
    examine: '墙缝里夹着一张发黄纸片。',
    hint: '你抽出纸片,上面画着三枚星形符号。',
    once: true,
    run: function (S) { S.hasStarNote = true; }
  }
]
```

规则:

- `examine` 可以单独存在;这类事件只提供线索,不会因为玩家走进格子自动触发。
- `examine` 不调用 `run`,不执行 `set/warp/turn`,不启停怪物,不消耗 `once`,也不会让可见物消失。
- 对 `floor-pickup` / `wall-pickup`,检视距离复用拾取距离:地面物要贴近格中心;墙面物要站在该格、面向并贴近指定墙面。
- HUD 关键态优先:被抓、通关、锁门提示不会被检视文案盖掉。
- 隐藏机关或暗门最好先给 `examine`,让玩家有可读线索,再用 `hint/run/set` 表达真正拿取或触发。

### 5.4 可选主动互动 `trigger:'interact'`

`trigger:'interact'` 是下游可选逃生口,不是官方 recipe 的默认写法。大多数 maze3d 机关优先用“走过去 / 踩上去 / 贴上去”触发,更少按键、更少 UI,也更符合当前网格迷宫的简单心智。只有当作者确实需要玩家主动确认——例如拉杆、门槽、按钮、文件柜、读碑文后的确认动作——才写 `trigger:'interact'`。它和普通踩格事件的区别是:玩家走到格上或贴近物件时只会出现上下文目标,不会自动执行动作;只有按 `E` / `Enter` 或点击画面里的“互动”按钮,才会执行 `hint/run/set/warp/turn/activateMonsters/deactivateMonsters` 并消耗 `once`。

```js
events: [
  {
    x: 9, y: 7,
    visual: 'marker', icon: 'rune',
    trigger: 'interact',
    examine: '门前符文没有被踩亮,似乎要主动按下。',
    once: true,
    when: function (S) { return !!S.hasGem; },
    hint: '你按亮符文,前方石门滑开。',
    set: [{ x: 8, y: 7, ch: '.' }]
  }
]
```

规则:

- 默认不要写 `trigger`。能靠走近、贴近或踩上去自然触发的机关,就保持自动触发。
- 目前 `trigger` 只支持 `'interact'`;写成 `'touch'`、`'use'` 等会 fail-loud。
- `trigger:'interact'` 本身不是事件内容。事件仍必须至少有 `hint/run/set/warp/turn/activateMonsters/deactivateMonsters` 之一;只写 `{ trigger:'interact' }` 是空事件。
- 同范围内有主动互动和只读线索时,按钮优先指向可互动机关,避免玩家按 E 只读旁边纸条却没触发面前机关。
- `E` / `Enter` 是离散输入;按住键盘产生的 repeat 不会反复触发。
- 如果要“没钥匙时提示缺钥匙、有钥匙时开门”,不要把失败文案塞进 `when` false;用 `pages` 表达默认页/成功页。当前 `when` false 的语义是整条动作不触发、不消耗 `once`。

### 5.5 状态页 `pages`

`pages` 用来表达“同一个格子 / 同一个物件在不同 state 下显示不同文本或执行不同行为”。它不是新对象系统:坐标、视觉、墙面朝向仍写在事件顶层;page 只覆盖文本、动作、条件和可选 `trigger`。

```js
events: [
  {
    x: 9, y: 7,
    visual: 'plate',
    pages: [
      {
        hint: '石板上有三个凹槽,你还缺少能放进去的线索。'
      },
      {
        when: function (S) { return !!(S.hasGem && S.hasRune && !S.finalDoorOpen); },
        hint: '三处凹槽同时亮起,前方石门滑开。',
        run: function (S) { S.finalDoorOpen = true; },
        set: [{ x: 8, y: 7, ch: '.' }]
      },
      {
        when: function (S) { return !!S.finalDoorOpen; },
        examine: '石板已经沉下,门洞里透出出口的光。'
      }
    ]
  }
]
```

选择规则:

- `pages` 必须是非空数组。
- 从前往后检查 page;`when` 为空或返回 `true` 的 page 算匹配,**最后一个匹配 page 生效**。
- 默认页放前,更具体的状态页放后。上例中第一页是“缺线索反馈”,第二页是“条件齐全开门”,第三页是“已开门后的只读状态”。
- 没有任何 page 匹配时,该事件当前不可见、不可触发,也不会显示“查看 / 互动”按钮。graph-audit 会把“所有 page 都有 `when`、没有默认页”报为 P1,提醒你确认是不是漏了失败反馈。
- page 可写字段只有:`when`、`examine`、`hint`、`run`、`set`、`warp`、`turn`、`activateMonsters`、`deactivateMonsters`、`trigger`、`puzzle`、`success`、`fail`。其中 `success/fail` 只能和同一 page 的 `puzzle` 配套。
- page 不允许写 `x/y/once/visual/icon/art/palette/mirror/face`。这些是顶层锚点或解析期视觉字段,不跟 state 动态切换。
- `once` 仍是事件级。若 pages 事件顶层写了 `once:true`,任何会触发动作或 `hint` 的匹配页都会消耗整条事件;所以“默认失败反馈 + 成功开门”的 pages 通常不要写顶层 `once`,而是用 `run` 写一个 `finalDoorOpen` 之类的 state,再用已完成页覆盖成功页。
- 顶层可写 `trigger:'interact'`,让所有 page 默认都需要主动确认;某个 page 也可单独写 `trigger:'interact'`。官方 recipe 默认仍优先自动触发,主动互动只作为少数下游机关的 escape hatch。

### 5.6 数据驱动小谜题 `puzzle`

`puzzle` 用来表达“打开一个固定小面板,答对后开门 / 改格 / 写状态,答错只给反馈”。它仍是 `events[]` 或当前 page 的数据动作,不是任意 JS/canvas 小游戏。v1 支持 `code`、`sequence`、`toggle` 三种模板。

#### 例一:踩近自动打开的数字密码锁

这是推荐的默认触发方式:不写 `trigger`,玩家走到机关格就打开面板。答案用 string 写,这样 `0314` 之类带前导零的密码不会丢零。

```js
events: [
  {
    x: 5, y: 1,
    visual: 'marker', icon: 'rune',
    examine: '石门旁有四个数字轮,附近壁画依次画着 3、1、4、2 颗星。',
    once: true,
    puzzle: {
      kind: 'code',
      prompt: '输入壁画暗示的四位密码。',
      answer: '3142',
      maxLength: 4
    },
    success: {
      hint: '数字轮同时下沉,石门滑进墙里。',
      set: [{ x: 6, y: 1, ch: '.' }]
    },
    fail: {
      hint: '锁芯咔哒一声复位,壁画上的星数也许就是顺序。'
    }
  }
]
```

`code.answer` 可以是 1–8 位数字 string,也可以是非负整数;推荐始终写 string。`maxLength` 是 1–8 的整数,并且不能短于答案。

#### 例二:放在状态页里的符号顺序

有前置线索或完成后状态时,把谜题写进具体 page。默认页先给反馈;拿到线索后,后面的 page 覆盖默认页并自动打开谜题;答对写 state 并开门;最后一页再覆盖谜题页,避免重复弹出。

```js
events: [
  {
    x: 7, y: 3,
    visual: 'plate',
    pages: [
      {
        hint: '机关盘上有月、星、火三枚符号,但你还不知道顺序。'
      },
      {
        when: function (S) {
          return !!(S.hasRuneNote && !S.runeDoorOpen);
        },
        examine: '纸条写着:“星先于月,火在最后。”',
        puzzle: {
          kind: 'sequence',
          prompt: '依次点亮三个符号。',
          choices: ['月', '星', '火'],
          answer: ['星', '月', '火']
        },
        success: {
          hint: '三个符号连成一道光,前方石门打开了。',
          run: function (S) { S.runeDoorOpen = true; },
          set: [{ x: 8, y: 3, ch: '.' }]
        },
        fail: {
          hint: '光路在中途熄灭。再看一眼纸条上的先后关系。'
        }
      },
      {
        when: function (S) { return !!S.runeDoorOpen; },
        examine: '机关盘已经熄灭,敞开的门洞通向前方。'
      }
    ]
  }
]
```

`sequence.choices` 必须是 1–8 个非空字符串;`answer` 也必须有 1–8 项,每一项都来自 `choices`。答案可以重复使用某个 choice,但数组不能有空槽。

#### 例三:明确需要“使用”的拉杆组合

主动互动只是可选 escape hatch。只有终端、拉杆或插槽这类物件确实需要玩家确认使用时,才写 `trigger:'interact'`;玩家靠近后按 `E` / `Enter` 或点“互动”打开面板。

```js
events: [
  {
    x: 3, y: 5,
    visual: 'plate',
    trigger: 'interact',
    examine: '配电盘上三只拉杆分别标着“泵”“灯”“锁”。',
    once: true,
    puzzle: {
      kind: 'toggle',
      prompt: '按墙上的检修记录设置拉杆。',
      labels: ['泵', '灯', '锁'],
      answer: [true, false, true]
    },
    success: {
      hint: '泵与门锁同时启动,积水后的闸门缓缓升起。',
      set: [{ x: 4, y: 5, ch: '.' }]
    },
    fail: {
      hint: '保险丝发出嗡鸣。检修记录要求关闭照明回路。'
    }
  }
]
```

`toggle.labels` 必须是 1–8 个非空字符串;`answer` 必须是等长、无空槽的 boolean 数组。不要用 `0/1` 冒充 `false/true`。

#### 组合规则与审计边界

- `puzzle` 可写在事件顶层,也可写在 `pages[]` 的某一页。有 `pages` 时,顶层不要再混写 `puzzle/success/fail`;三者应一起放进具体 page。
- 缺省不写 `trigger`,沿用走近、踩上或贴近自动触发。只有作者明确写 `trigger:'interact'` 时才要求主动确认。
- 写了 `puzzle` 的同一层只能再配 `when/examine/trigger/success/fail`;不要直接混写 `hint/run/set/warp/turn/activateMonsters/deactivateMonsters`。答对后的后果全部写进 `success`。
- `success` 允许 `hint/run/set/warp/turn/activateMonsters/deactivateMonsters`,并且必须至少有一个实际结果。空 `set:[]` 或空怪物索引数组不算结果。
- `fail` v1 只允许非空 `hint`;答错不写 state、不改格、不惩罚、不消耗 `once`。取消/关闭面板也不执行 `fail`。
- 事件级 `once:true` 只在答对并完成 `success` 后消耗;答错或取消仍可重试。若 pages 要显示“已完成”状态,通常不要用 `once`,而应像例二那样由 `success.run` 写 state,再让后页覆盖。
- 面板打开时 runtime 会暂停玩家移动、怪物追逐和坐标事件触发;关闭后恢复。三种模板都支持键盘和触屏输入。
- 给谜题一个可见 `visual`,或至少给隐藏机关非空 `examine` / 外部线索。无视觉又无 `examine` 的谜题会被 graph-audit 报 P1。
- graph-audit 会检查模板字段、答案形状、成功/失败动作、同层混写、坐标与静态通关结果;它不会执行完整 `pages[].when(state)` 状态空间,也不会证明散文线索足够推导答案。作者仍须实际走一遍“找到线索 → 答错 → 重试 → 答对 → 机关生效”。
- 不要把任意 JS、canvas、rAF 循环或自定义小游戏对象塞进 `puzzle`;需要第四种模板时应先扩 maze3d 私有 DSL 和审计闸。

## 6. 怪物 `maze.monsters[]`

```js
monsters: [
  { x: 5, y: 5, face: 'mimic', chase: true }
]
```

| 字段 | 类型 | 语义 |
|---|---|---|
| `x`, `y` | int | 怪物出生格。 |
| `face` | string | 大脸 billboard。稳定值:`zombie` / `yurei` / `skull` / `mimic`。 |
| `body` | string | 全身 billboard。稳定值:`slender`。`body` 优先于 `face` 的表现。 |
| `chase` | bool | 是否追玩家;默认 `true`。 |
| `active` | bool | 是否初始启用;默认 `true`。 |
| `fadeAlpha` | number | 半透明程度。 |
| `lines` | string[] | 自定义念白台词;浏览器 TTS 可用时使用。 |
| `art` / `palette` / `mirror` | object fields | 自绘怪物外观。 |

全局字段:

| 字段 | 类型 | 语义 |
|---|---|---|
| `chaseSpeed` | number > 0 | 怪物追逐速度,单位格/秒。 |

注意:

- 怪物属于 maze3d runtime 局部态;被抓/退出/重进会重置。
- `lines` 的真实发声受浏览器语音能力影响;不要把 TTS 当确定性剧情承载。关键剧情仍写文本 `hint` / `look` / 普通节点。
- 自绘怪物同样走 32×32 art 校验。
- 这一节是普通追逐怪物。FPS 的 HP、命中半径和攻击 AI 写在下一节的 `maze.combat.guard`;同一节点不能同时声明 `maze.monsters` 与 `maze.combat.guard`。

## 7. FPS 战斗 `maze.combat`

`maze.combat` 是当前 `fps-range` Recipe 5 使用的闭合私有作者面:AI 只声明玩家资源、武器数值、敌人 AI 和固定补给;runtime 独占输入边沿、hitscan、墙遮挡、追逐/攻击状态机、clamp、单次消费与出口门控。它仍是二维 grid 上的 raycast 战斗,不是 WebGL、DOOM sector 或公共 FPS 模块。

### 7.1 可复制的最小闭环

FPS 不是只抄一个 combat 节点就结束：阵亡会把 `deathKey` 写进持久 state，故还要有已声明的初值、真实存在的胜利/阵亡目标节点，以及清掉旧胜负键的重试动作。把下段 helper 放在 world 对象之前；把 `FPS_RECIPE_INIT_STATE` 的两项并入顶层 `initState`，把 `FPS_RECIPE_NODES` 的三项并入目标 map 的 `nodes`。节点 id 可统一改名，但每个 `links[].to` 必须随之逐字改到真实目标。

```js
// FPS-RECIPE-START
var FPS_RECIPE_INIT_STATE = {
  rangeEscaped: false,
  rangeDeath: false
};

function resetRange(S) {
  S.rangeEscaped = false;
  S.rangeDeath = false;
}

var FPS_RECIPE_NODES = {
  fps_range: {
    kind: 'maze3d',
    title: 'Recipe 5 · FPS 最小生存场',
    winKey: 'rangeEscaped',
    look: '先拿弹药,击倒守卫,再走到 D 出口。',
    maze: {
      grid: [
        '#############',
        '#...........#',
        '#...........#',
        '#..........D#',
        '#...........#',
        '#...........#',
        '#############'
      ],
      start: { x: 1, y: 3, dir: 'E' },
      theme: 'industrial',
      combat: {
        exitRequires: 'clear',
        deathKey: 'rangeDeath',
        player: {
          maxHealth: 60,
          health: 60,
          ammo: 1,
          maxAmmo: 6
        },
        pistol: {
          damage: 20,
          range: 12,
          cooldown: 0.32,
          recoil: 2
        },
        guard: {
          x: 7, y: 3,
          face: 'skull',
          hp: 40,
          hitRadius: 0.34,
          ai: {
            sight: 9,
            hear: 8,
            attackRange: 1.35,
            moveSpeed: 1.1,
            damage: 20,
            windup: 0.55,
            cooldown: 0.75
          }
        },
        supplies: [
          { x: 2, y: 3, kind: 'ammo', amount: 3 },
          { x: 1, y: 2, kind: 'health', amount: 20 }
        ]
      }
    },
    links: [
      { to: 'fps_range', label: '一键重试', requires: function (S) { return !!S.rangeDeath; }, run: resetRange },
      { to: 'range_death', label: '查看阵亡结果', requires: function (S) { return !!S.rangeDeath; } },
      { to: 'range_done', label: '活着离开', requires: function (S) { return !!S.rangeEscaped; } },
    ]
  },

  range_done: {
    kind: 'scene',
    title: '生存场脱离',
    look: '你越过出口；本轮 HP、弹药、敌人与补给状态已经结束。',
    links: []
  },

  range_death: {
    kind: 'scene',
    title: '阵亡',
    look: '这一轮已经结束。',
    links: [
      { to: 'fps_range', label: '清除阵亡事实并重试', run: resetRange }
    ]
  }
};
// FPS-RECIPE-END
```

这个三节点骨架的因果才是闭合的：初始 1 发 + 固定 `+3` ammo → 两枪击倒 40 HP 守卫 → `exitRequires:'clear'` 让同一个 `D` 只在守卫倒下后开放；阵亡后当前 `fps_range` 直接显示“一键重试”，先清 durable 胜负键再原节点重建 session，`range_death` 只保留为可选结果页。医疗包只在 HP 真能增加时消费。可以调 grid、坐标、HP、damage、range、cooldown、recoil 与 AI 数值，但不能恢复旧复数容器或引用字段；`attackRange` 必须 >= 0.50。

### 7.2 闭 schema 与引用规则

| 层 | 必填/可选 | 规则 |
|---|---|---|
| `combat` | `deathKey/player/pistol` 必填;`guard/supplies/exitRequires` 可选 | 完整形状是 `combat={deathKey,player,pistol,guard?,supplies?,exitRequires?}`。未知字段 fail-loud；`deathKey` 必须是独立的 boolean 剧情事实名，不得与 `pos/clock/rngSeed/seen/flags/_once`、原型键或已有非 boolean state 同名；`exitRequires` 若写只允许严格 `'clear'`，且必须同时声明 `guard`。 |
| `player` | `maxHealth/health/ammo` 必填;有 ammo supply 时 `maxAmmo` 必填 | `health <= maxHealth`;`player.ammo/maxAmmo` 为 number 且是非负/正整数，初始 ammo 不得超过 cap。旧 `weapon` 与对象 ammo 形状精确报错。 |
| `pistol` | `damage/range/cooldown/recoil` 全部必填 | `pistol` 只接受 `damage/range/cooldown/recoil`；没有 id、ammo 引用、spread 或 sfx。 |
| `guard` | 整体可选；存在时 `x/y/hp/hitRadius/ai` 必填，`face` 可选 | `guard` 整体可选，作者级数量只能是 0..1。runtime 内部固定 id 为 `guard`；`ai` 只接受 `sight/hear/attackRange/moveSpeed/damage/windup/cooldown`，`attackRange` 必须 >= 0.50。 |
| `supplies[]` | `x/y/kind/amount` 全部必填 | `supplies[]` 不接受 `id` 或 `ammo`；kind 只允许 `'ammo'|'health'`，只能放在 `.` 格，不能与 start、guard、event、兄弟 supply 同格。 |
| `player.maxAmmo` | 只在 `supplies` 含 ammo 时允许且必填 | 标量正整数；没有 ammo supply 时禁止声明。 |

额外边界:

- `maze.monsters` 与 `maze.combat.guard` 禁止同写;不要维护两份敌人真相。旧 `combat.weapons`、`combat.monsters`、`player.weapon`、对象 ammo/maxAmmo、`pistol.ammo/spread`、`supplies[].id/ammo` 都是闭 schema 未知字段，不做兼容转换。
- `D` 仍是最终出口。`exitRequires:'clear'` 只给这个既有出口增加派生清场条件,不创建普通门、door state 或 objective ledger。
- combat 首帧先渲染为待命态，AI / 攻击计时不推进；首次移动、转向、Space、开火按钮或首次画面点击会原子 ready。Space / 开火按钮的同一事件会继续提交第一枪；首次画面点击若只用于 Pointer Lock，只 ready、不偷开火。这是 runtime 固定礼仪，不是 `maze.ready` 作者字段。
- 玩家开火只用 Space、Pointer Lock 后主键或 runtime 提供的“开火”按钮；冷却中按下会被丢弃，不耗弹、不缓冲，并短显“手枪回位中”。作者不写每帧 callback、位置函数、碰撞函数或完成 callback。
- `pistol.sfx` 与 `pistol.spread` 未进入闭 schema，写入任何值都会按未知字段 fail-loud。有效开火与玩家受伤各有一个 runtime 固定程序化短音，复用 maze3d 既有音频生命周期；无 AudioContext 时静默退化。它们不是作者可配置的战斗音频字段。
- `hitRadius` 只控制 hitscan 命中容错，不是身体大小。存活 guard 的身体半径由私有 runtime 固定，不接受 `bodyRadius` 或其它作者碰撞字段。

### 7.3 会话态与持久态分账

以下全部是 **session-local**，离开、阵亡后重试、重进会从节点数据重建；最容易误持久化的一族就是“玩家 HP、弹药、敌人 HP / AI 状态、补给 consumed”:

- 玩家坐标/朝向、玩家 HP、弹药、冷却、ready 状态与输入 latch。
- 敌人 HP / AI 状态、位置、windup/commit/recover、dead/corpse。
- 补给 consumed / 接触边沿。
- 本次 `K`、事件 once、改过的 grid。

只有 `winKey` / `deathKey` 和作者显式通过普通 `events[].run(state, api)` 写入的剧情事实进入 Amatlas 持久 state。不要把实时 HP、ammo、敌人数组或 supply consumed 写入 `state`；若未来真的要 combat checkpoint,应另做设计,不能把 session 对象图塞进存档。

### 7.4 Recipe 5 的停止线

Recipe 5 已闭合一把 pistol、一个追击 guard、ammo/health 两种固定补给、ready/cooldown 回执、固定开火/受伤短音、阵亡同节点重试与清场后的既有 `D`。复制它做同类短关卡时,先只改 grid、坐标、文案和现有数值；不加普通门、objective、第二敌人 archetype、作者可配置战斗音频或另一把武器。出现这些真实需求时应先扩私有 DSL + validator + 反向测试,而不是在 world 里塞 callback 或发明字段。

### 7.5 存活 guard 的实体占位

combat 玩家与 guard 不是可互相穿过的精灵。私有 runtime 固定玩家半径 0.22、`COMBAT_GUARD_RAD=0.28`，所以 `active && !dead` guard 与玩家中心至少相距 0.50；正面持续前进会停在 guard 身前，W+D 仍可沿圆包络边缘滑动绕过。guard 追击同样不能靠大 `dt` 穿进玩家。

击倒后 guard 会变成 dead/inactive corpse，不再阻挡；离开并重进节点会从作者数据重建存活 guard，因此重新阻挡。这个生命周期仍是 session-local，不写入 Amatlas state。不要用 `hitRadius` 调身体大小：它只改变中心线射击的命中容错。若作者把 `attackRange` 写到 0.50 以下，runtime 会在 canvas 创建前 fail-loud；不要绕过这条准入。

### 7.6 combat 与动态改格

既有 `maze.events[].set` 可以和 `maze.combat` 合法组合，例如互动后升起 `#` 隔离墙、或把 `#` 恢复为 `.` 重新开放走廊。`set` 结算完成时，runtime 会同时失效普通追逐怪与 combat guard 的 A* 缓存；因此双方整数格未变化也会按新 grid 重算，存活 guard 不会沿旧 `cachedNext` 穿进新墙，重新开墙也不会永久停在旧的 `cachedNext:null`。

这不是普通门或 combat door API：作者仍只写既有 `set` 字符，碰撞、raycast、hitscan 与两族 A* 都读取同一份 session grid。若关墙把玩家或 guard 当场包进实体格、或开关后仍没有可达路线，那是作者布局问题；先在 source/built 真浏览器走一遍事件前后路径，不要用 callback 手改怪物坐标或 cache。

## 8. 装饰与地标

### 8.1 柱子 `maze.pillars`

```js
pillars: [
  { x: 4, y: 1, style: 'stone', scale: 1.2 },
  { x: 6, y: 3, style: 'crystal' }
]
```

| 字段 | 类型 | 语义 |
|---|---|---|
| `pillars` | array | 纯视觉落地地标,不挡路、不拾取、不追逐。 |
| `pillarStyle` | string | 全局样式:`stone` / `ruined` / `obelisk` / `crystal` / `wood` / `metal`。 |
| `pillarScale` | number > 0 | 全局大小。 |
| `pillarIcon` / `pillarArt` | string/object | 全局外观逃生口。 |
| `pillars[i].style/scale/icon/art/palette/mirror` | mixed | 单根覆盖。 |

### 8.2 地面杂物 `maze.decor`

```js
decor: [
  { x: 2, y: 3, icon: 'rubble' },
  { x: 5, y: 2, icon: 'idol', mode: 'sprite', scale: 1.1 }
]
```

| 字段 | 类型 | 语义 |
|---|---|---|
| `decor` | array | 纯视觉环境杂物。 |
| `decorDensity` | number >= 0 | 主题自动撒地杂物密度。 |
| `maxDecor` | number >= 0 | 自动杂物上限。 |
| `decor[i].mode` | `'floor'|'sprite'` | 默认贴地;显式 `sprite` 只给真正有竖牌外观的 glyph/art。 |

**视觉角色矩阵（默认作者路径）**：

| 你要表达的东西 | 默认使用 | 屏幕读法 / 行为 |
|---|---|---|
| 建筑柱、方尖碑、大型水晶地标 | `maze.pillars` + `style`/`art` | 世界体块、落地、不可拾取。 |
| 地面碎片、污渍、残骸 | `maze.decor` 默认 `mode:'floor'` | 低矮背景、不可拾取。 |
| 雕像、路牌等竖立背景 | `maze.decor` + 有竖牌 art 的 `icon` 或自绘 `art`,再写 `mode:'sprite'` | 背景竖牌、不可拾取。 |
| 显眼关键物 | `events[].visual:'pickup'` + `icon/art` | 独立 token，可主动/进格拾取。 |
| 隐藏普通物 | `floor-pickup` / `wall-pickup` | 嵌入地面/墙面，贴近才拿。 |
| 机关/陷阱 | `marker` / `plate` / `trap` | 贴地可踩，不读作可拿。 |

只有贴地碎片外观的 family（下表这些名字）不能配 `mode:'sprite'`；写了会 fail-loud。这个硬闸只拒绝当前管线确定画不成竖牌的组合：需要竖立水晶可用 `icon:'crystal'`，需要大型水晶地标可用 `pillars[].style:'crystal'`，也可直接提供自绘 `art`。`scale` 只改变尺寸，不改变角色或行为；要做巨型可拾取物仍用 `visual:'pickup'`，要做物品造型的雕塑则用背景角色并显式提供对应 `art`。

同一组收藏物（例如三枚星痕）至少应共享一种稳定家族线索，如主剪影、材质/色族、徽记或一致的呈现语法。复用同一 `icon` 或同一份 `maze.icons` art 是最省接缝的默认写法，不是强制同形；剧情若要求某枚异变，可以改变形状/尺度/颜色，但应保留其它可读线索，让差异显得有意而非误用了不相干 glyph。

地杂物 family / 别名可用:

```txt
bone_shards / rubble / paper_scrap / cable_coil / moss_patch / flesh_nodule /
crystal_cluster / glass_shards / rust_scraps / wood_splinters / cloth_rags /
ash_pile / ice_chips / bio_film / ritual_marks
```

### 8.3 墙饰 `maze.wallDecor`

```js
wallDecor: [
  { x: 2, y: 0, face: 'S', kind: 'torch', u: 0.5, v: 0.28, scale: 1.1 }
]
```

| 字段 | 类型 | 语义 |
|---|---|---|
| `wallDecor` | array | 显式贴墙装饰。 |
| `wallDecorDensity` | number >= 0 | 主题自动墙饰密度。 |
| `maxWallDecor` | number >= 0 | 自动墙饰上限。 |
| `wallDecor[i].kind` | string | `vines` / `tentacle` / `crack` / `arms` / `torch` / `cables` / `chains` / `pipes` / `vent` / `posters` / `growth` / `veins` / `sigil` / `eyes` / `teeth` / `crystals` |
| `u`, `v` | 0..1 | 在墙面上的位置。 |
| `scale` | number > 0 | 大小。 |

墙饰只贴 `#` 墙,且 `face` 外侧应是玩家可站的开放格;否则玩家看不到或会被跳过。

## 9. 状态边界:什么会保留,什么会重置

### 9.1 迷宫内局部态(session-local)

这些状态只属于“本次进入这个 `maze3d` 节点”的 runtime 会话:

- 玩家当前坐标和朝向。
- 已拿的 `K` 钥匙。
- `events[].once` 是否触发过。
- `set` 改过的 grid。
- `warp` / `turn` 后的位置朝向。
- 怪物位置、激活/停用、追逐过程。

被抓、退出、重进、刷新到未完成迷宫时,这些局部态都会按节点数据重新开始。不要把 grid 里的 `K`、踩过的压力板或怪物是否已被停用当成跨节点存档。

### 9.2 Amatlas 持久 state

这些才会跨节点、跨普通剧情承接:

- `winKey` 写入的通关 flag。
- `scareKey` 写入的被抓 flag。
- `events[].run(state, api)` 显式写入的 `state` / `state.flags` / `state.inventory`。
- 普通 scene / encounter / tabletop 节点写入的状态。

规则很简单:迷宫内部手感和机关过程留在 maze3d runtime;剧情事实、跨层钥匙、结局条件写 Amatlas state,再用普通 `links.requires` 承接。

### 9.3 错误写法 vs 正确写法

错误:想做“第一层拿钥匙,第三层开门”,于是把第一层 grid 里放 `K`,期望第三层仍然记得。

正确:第一层通关或事件里写持久 flag,第三层外层链接读 flag。

```js
// 第一层 maze3d 通关后写 layerHasKey。
// 注意:这里用 winKey 表示“拿到/带出某个剧情事实”,不是把 grid 里的 K 变成持久物品。
layers_maze1: {
  kind: 'maze3d',
  winKey: 'layerHasKey',
  maze: { grid: ['#####', '#...D#', '#####'], start: { x: 1, y: 1, dir: 'E' } },
  links: [
    { to: 'locked_scene', requires: function (S) { return !!S.layerHasKey; }, label: '带着钥匙深入' }
  ]
}
```

如果必须在迷宫中途写持久事实,只在 `events[].run(state, api)` 里写 state,再让通关后或外层普通节点读取它;不要在 `run` 里直接跳节点。

## 10. 五个 cookbook skeleton

这些是“可复制骨架”,故意不包含 demo hub、reset 函数、Gallery 链接或示例专属插件配置。

### 10.1 最小逃出:一个迷宫 + 一个出口

```js
escape_maze: {
  kind: 'maze3d',
  title: '旧井下方',
  winKey: 'escapedWell',
  look: '找到发光的出口门 D。',
  wonText: '你推开门,风从外面灌进来。',
  maze: {
    grid: [
      '#######',
      '#.....#',
      '#.###D#',
      '#.....#',
      '#######'
    ],
    start: { x: 1, y: 1, dir: 'E' },
    theme: 'cave'
  },
  links: [
    { to: 'after_escape', label: '走出旧井', requires: function (S) { return !!S.escapedWell; }, showWhenLocked: true, lockHint: '先找到出口门 D' },
    { to: 'hub', label: '原路退回' }
  ]
}
```

### 10.2 钥匙恐怖:K + D + 怪物 + 双结局

```js
horror_maze: {
  kind: 'maze3d',
  title: '地底回廊',
  winKey: 'horrorEscaped',
  scareKey: 'horrorCaught',
  scareSfx: 'horror-screech',
  look: '先找到 K 钥匙,再推开 D 门。心跳越快,说明它越近。',
  wonText: '你撞开门,跌进门外的光里。',
  caughtText: '一张几乎是人的脸贴了上来。',
  maze: {
    grid: [
      '#########',
      '#.......#',
      '#.#####.#',
      '#K....#D#',
      '#########'
    ],
    start: { x: 1, y: 1, dir: 'E' },
    theme: 'cave',
    keyIcon: 'bone_key',
    monsters: [{ x: 5, y: 2, face: 'mimic' }],
    chaseSpeed: 1.5
  },
  links: [
    { to: 'escaped', label: '冲出去', requires: function (S) { return !!S.horrorEscaped; }, showWhenLocked: true, lockHint: '门还没打开' },
    { to: 'caught', label: '……', requires: function (S) { return !!S.horrorCaught; }, showWhenLocked: true, lockHint: '——' },
    { to: 'hub', label: '放弃,退回入口', requires: function (S) { return !S.horrorEscaped && !S.horrorCaught; } }
  ]
}
```

### 10.3 机关解谜:set / warp / turn / when

```js
puzzle_maze: {
  kind: 'maze3d',
  title: '机关游乐场',
  winKey: 'puzzleEscaped',
  maze: {
    grid: [
      '#########',
      '#...#...#',
      '#.#####.#',
      '#.......#',
      '#########'
    ],
    start: { x: 1, y: 1, dir: 'E' },
    theme: 'dungeon',
    exitStyle: 'archway',
    events: [
      { x: 3, y: 1, once: true, visual: 'plate', hint: '压力板让封墙沉下。', set: [{ x: 4, y: 1, ch: '.' }] },
      { x: 1, y: 3, visual: 'marker', hint: '脚下符文亮起,你被送到另一段。', warp: { x: 6, y: 3, dir: 'E' } },
      { x: 6, y: 3, once: true, visual: 'trap', hint: '旋转地砖打乱了朝向。', turn: 'W' },
      { x: 7, y: 3, once: true, visual: 'pickup', icon: 'gem', hint: '你拾起一颗宝石。', run: function (S) { S.hasGem = true; } },
      { x: 6, y: 1, once: true, visual: 'plate', when: function (S) { return !!S.hasGem; }, hint: '宝石在门槽中亮起,出口门从墙里浮出。', set: [{ x: 7, y: 1, ch: 'D' }] }
    ]
  },
  links: [
    { to: 'puzzle_done', label: '离开机关游乐场', requires: function (S) { return !!S.puzzleEscaped; }, showWhenLocked: true, lockHint: '还没走到尽头的门' }
  ]
}
```

### 10.4 多层结构:多个 maze3d 节点 + 普通节点串联

```js
mine_floor_1: {
  kind: 'maze3d',
  title: '矿井第一层',
  winKey: 'floor1Cleared',
  look: '第一层通关后,你会得到进入深处的机会。',
  maze: {
    grid: ['#######', '#.....#', '#...D.#', '#######'],
    start: { x: 1, y: 1, dir: 'E' },
    theme: 'cave',
    wallScale: 1.6,
    pillars: [{ x: 3, y: 1, style: 'stone' }]
  },
  links: [
    { to: 'mine_gate', label: '走向更深处', requires: function (S) { return !!S.floor1Cleared; }, showWhenLocked: true, lockHint: '第一层还没走完' }
  ]
},

mine_gate: {
  kind: 'scene',
  title: '上锁闸门',
  look: '这是一段普通 scene,负责层间叙事和持久门控。',
  links: [
    { to: 'mine_floor_2', label: '打开闸门,进入第二层', requires: function (S) { return !!S.floor1Cleared; } }
  ]
},

mine_floor_2: {
  kind: 'maze3d',
  title: '矿井第二层',
  winKey: 'floor2Cleared',
  maze: {
    grid: ['#######', '#.....#', '#.###D#', '#.....#', '#######'],
    start: { x: 1, y: 1, dir: 'E' },
    theme: 'industrial'
  },
  links: [
    { to: 'mine_exit', label: '回到地面', requires: function (S) { return !!S.floor2Cleared; } }
  ]
}
```

多层的重点:层与层之间是 Amatlas 图结构,不是一个 maze 内的真 3D 楼层。

### 10.5 FPS 生存场:combat + supplies + clear

FPS 的完整闭合骨架见 §7.1。Recipe 5 不重复贴第二份代码,避免字段漂移；复制时优先照抄 §7.1 的三节点骨架，或把 `examples/maze3d/world.js` 的 `fps_range`、`fps_range_done`、`fps_range_death`、`resetFpsRange` 与两项 initState 作为完整一族一起复制，并保留 §7.2 的闭 schema 与 §7.3 的状态分账。只抄 `fps_range` 会留下死链和无法清除的 durable deathKey。

## 11. Gallery / audio-gallery 边界

`engine/examples/maze3d/` 有统一 recipes 入口 `index.html` 与 FPS 玩家直达入口 `fps.html`。`fps-game.js` 只派生 start/存档 namespace，复用正式 world 的 `maps`；它不是第二份关卡或第二 runtime。`gallery.html` 和 `audio-gallery.html` 是作者工具页，用来选材和核听，不是新的玩法类型。

| 页面 | 用途 | 必须保持的边界 |
|---|---|---|
| `index.html` | 统一 playable 入口;basic / horror / puzzle / layers / fps-range 都是同一个 `raycast-maze.js` runtime 的 recipes | 可以给玩家试玩;不要拆回多个平级 demo 目录,也不要把 FPS recipe 另起模块。 |
| `fps.html` | 普通玩家直接进入 `fps_range` 的可玩入口 | 只加载正式 `raycast-maze.js + world.js + fps-game.js`；薄装配派生 start，不复制 grid/combat 数据，不污染原 world 的 hub 起点。 |
| `gallery.html` | 视觉素材参考页 | 只用真实 runtime 的 `staticPreview:true` 画首帧;必须 `audio:false`、`controls:false`,不挂输入、不跑持续 rAF、不一页几十个声音。 |
| `audio-gallery.html` | 声音试听页 | 用真实 maze 数据触发声音;单 engine / 可 stop / 可 mute / 切换时清理旧 preview;不直调 `raycast-maze.js` 内部音频函数。 |

两种 Gallery 都是 authoring helper,不是正式 playable demo 类型,也不是第二个 maze3d runtime。作者可以用它们选 `theme`、`wallTex`、`floorTex`、`ceilTex`、`exitStyle`、`events[i].visual`、怪物声音方向,再把字段抄进 `maze:{...}`;不要把 gallery 的页面装配代码、卡片循环或试听控制台照抄进游戏。

自动化已经锁住这层边界:`raycast-maze.test.cjs` 的 A6/ZA 段会检查 visual gallery 的 `staticPreview:true + audio:false + controls:false`,以及 audio gallery 的单 engine、stop/mute/切换清理口径。改 Gallery 页面时先跑测试,不要只靠浏览器看起来正常。

## 12. 常见坑

1. **把 recipes 当模块。** basic/horror/puzzle/layers/fps-range 是同一 runtime 的五种数据写法。
2. **把 `K` 当持久钥匙。** `K` 只在本次迷宫内有效;跨层钥匙用 state flag。
3. **把 `exitStyle` 当路由。** 它只换门面;路线靠 `links`。
4. **在 `run` 里跳节点。** maze3d 正在 canvas/rAF 孤岛内运行,中途 `api.go` 会割裂;写 flag,让通关/被抓后的 `links` 承接叙事。
5. **事件放墙里。** 普通坐标事件在墙/门格玩家走不到;`wall-pickup` 的 `x/y` 也必须是玩家站的地板格。
6. **隐藏物没有形态。** `floor-pickup` / `wall-pickup` 必须配 `icon` 或 `art`。
7. **装饰误当玩法。** `decor`、`wallDecor`、`pillars` 都是纯视觉,不挡路、不拾取、不写 state。
8. **过度相信静态闸。** maze3d 是实时 canvas 孤岛,graph-audit 看不透所有 runtime 软锁;复杂迷宫要实际跑一次。
9. **过度追求真 3D。** 伪 3D 的优势是 grid-first、轻量、可审计;不要写任意 mesh / 跳跃 / 真高低差。
10. **忘记保底退出。** 教学或复杂迷宫最好给一个“退回/放弃”链接,避免玩家或测试被困住。
11. **把 `hitRadius` 当身体半径。** 它只管 hitscan；活 guard 占位固定为私有 0.28，作者只能保证 `attackRange>=0.50`，不能增加 `bodyRadius` 字段。

## 13. 修改后至少怎么验

命令都从**解包后的 Amatlas 引擎根**运行（当前目录里应直接看见 `core/`、`examples/`、`src/`）。先审你自己的 `src`：

```bash
node core/tooling/graph-audit.mjs src/world.js
node core/tooling/assembly-probe.mjs src/index.html
node pipeline/build/build.mjs src/index.html --smoke
```

这三闸能证明世界图、装配与构建链；graph-audit 不复制完整 `maze.combat` validator，jsdom 也不会真实驱动 canvas。**所以三闸绿不等于 combat 字段正确。**改了 FPS 数据后，必须再用真浏览器打开构建后的 `fps.html`：先等待确认未 ready 时 AI/攻击计时静止，再走“移动取弹→冷却按压回执→两枪→D”，并走“阵亡→当前节点一键重试→60 HP / 1 ammo / 1 guard / 2 supplies 全新”。同时保留统一 `index.html` 的 graph/assembly/build，确认旧四 recipe 未被 combat 行为污染。

只有在修改引擎自带的 maze3d runtime / 正式示例 / 作者手册时，才追加维护者回归：

```bash
node examples/maze3d/test/raycast-maze.test.cjs
node test/run.cjs
node core/tooling/graph-audit.mjs examples/maze3d/world.js
node core/tooling/assembly-probe.mjs examples/maze3d/index.html
node pipeline/build/build.mjs examples/maze3d/index.html --smoke
```

视觉/触屏/动画改动必须用 Playwright Chromium 或真浏览器核一次；canvas+rAF 不能只靠静态读码判断。
