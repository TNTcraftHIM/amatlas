# maze3d 作者手册

> 适用对象:写 `kind:'maze3d'` 节点的人类作者与 AI 作者。
> 核心边界:`maze3d` 是 Amatlas 的模块私有 runtime,不是公共 `module-interface.md` 契约。下列字段只在 `engine/examples/maze3d/raycast-maze.js` 这一类第一人称迷宫里有效。
>
> 当前可玩入口是 `engine/examples/maze3d/`：basic / horror / puzzle / layers 都是同一个 `maze3d` runtime 的 recipes，不是不同模块。引擎总选材入口是 `engine/examples/showroom/index.html`；它单向嵌入本页与两个 helper，本页不需要反向导航。

## 0. 先记住这四句话

1. **底层永远是二维 grid。** 第一人称画面只是呈现层;作者写格子、门、钥匙、坐标事件和状态。
2. **出口永远是 `D` 门。** `exitStyle` 只换门的样子,不改变路线;分支和层间移动用外层 `links.requires` / 多个 `maze3d` 节点表达。
3. **迷宫内局部态不入档。** 玩家位置、已踩机关、已拿迷宫内钥匙、怪物局部状态都是本次进入迷宫的 runtime 状态;被抓、退出、重进会重置。
4. **持久剧情写 Amatlas state。** 逃出写 `winKey`;被抓写 `scareKey`;跨迷宫钥匙、剧情分支、结局条件用普通 `run` / `flags` / `links.requires`。

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

自己做游戏时,先抄一个 `kind:'maze3d'` 节点骨架,再接入自己的 world/map/links。

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

## 7. 装饰与地标

### 7.1 柱子 `maze.pillars`

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

### 7.2 地面杂物 `maze.decor`

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
| `decor[i].mode` | `'floor'|'sprite'` | 默认贴地;显式 `sprite` 才做竖牌。 |

地杂物 family / 别名可用:

```txt
bone_shards / rubble / paper_scrap / cable_coil / moss_patch / flesh_nodule /
crystal_cluster / glass_shards / rust_scraps / wood_splinters / cloth_rags /
ash_pile / ice_chips / bio_film / ritual_marks
```

### 7.3 墙饰 `maze.wallDecor`

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

## 8. 状态边界:什么会保留,什么会重置

### 8.1 迷宫内局部态(session-local)

这些状态只属于“本次进入这个 `maze3d` 节点”的 runtime 会话:

- 玩家当前坐标和朝向。
- 已拿的 `K` 钥匙。
- `events[].once` 是否触发过。
- `set` 改过的 grid。
- `warp` / `turn` 后的位置朝向。
- 怪物位置、激活/停用、追逐过程。

被抓、退出、重进、刷新到未完成迷宫时,这些局部态都会按节点数据重新开始。不要把 grid 里的 `K`、踩过的压力板或怪物是否已被停用当成跨节点存档。

### 8.2 Amatlas 持久 state

这些才会跨节点、跨普通剧情承接:

- `winKey` 写入的通关 flag。
- `scareKey` 写入的被抓 flag。
- `events[].run(state, api)` 显式写入的 `state` / `state.flags` / `state.inventory`。
- 普通 scene / encounter / tabletop 节点写入的状态。

规则很简单:迷宫内部手感和机关过程留在 maze3d runtime;剧情事实、跨层钥匙、结局条件写 Amatlas state,再用普通 `links.requires` 承接。

### 8.3 错误写法 vs 正确写法

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

## 9. 四个 cookbook skeleton

这些是“可复制骨架”,故意不包含 demo hub、reset 函数、Gallery 链接或示例专属插件配置。

### 9.1 最小逃出:一个迷宫 + 一个出口

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

### 9.2 钥匙恐怖:K + D + 怪物 + 双结局

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

### 9.3 机关解谜:set / warp / turn / when

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

### 9.4 多层结构:多个 maze3d 节点 + 普通节点串联

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

## 10. Gallery / audio-gallery 边界

`engine/examples/maze3d/` 里只有一个可玩的统一入口：`index.html`。`gallery.html` 和 `audio-gallery.html` 是作者工具页，用来选材和核听，不是新的玩法类型；两者可在总 Gallery 中嵌入打开，也保留独立运行能力。

| 页面 | 用途 | 必须保持的边界 |
|---|---|---|
| `index.html` | 统一 playable 入口;basic / horror / puzzle / layers 都是同一个 `raycast-maze.js` runtime 的 recipes | 可以给玩家试玩;不要拆回多个平级 demo 目录。 |
| `gallery.html` | 视觉素材参考页 | 只用真实 runtime 的 `staticPreview:true` 画首帧;必须 `audio:false`、`controls:false`,不挂输入、不跑持续 rAF、不一页几十个声音。 |
| `audio-gallery.html` | 声音试听页 | 用真实 maze 数据触发声音;单 engine / 可 stop / 可 mute / 切换时清理旧 preview;不直调 `raycast-maze.js` 内部音频函数。 |

两种 Gallery 都是 authoring helper,不是正式 playable demo 类型,也不是第二个 maze3d runtime。作者可以用它们选 `theme`、`wallTex`、`floorTex`、`ceilTex`、`exitStyle`、`events[i].visual`、怪物声音方向,再把字段抄进 `maze:{...}`;不要把 gallery 的页面装配代码、卡片循环或试听控制台照抄进游戏。

自动化已经锁住这层边界:`raycast-maze.test.cjs` 的 A6/ZA 段会检查 visual gallery 的 `staticPreview:true + audio:false + controls:false`,以及 audio gallery 的单 engine、stop/mute/切换清理口径。改 Gallery 页面时先跑测试,不要只靠浏览器看起来正常。

## 11. 常见坑

1. **把 recipes 当模块。** basic/horror/puzzle/layers 是同一 runtime 的四种数据写法。
2. **把 `K` 当持久钥匙。** `K` 只在本次迷宫内有效;跨层钥匙用 state flag。
3. **把 `exitStyle` 当路由。** 它只换门面;路线靠 `links`。
4. **在 `run` 里跳节点。** maze3d 正在 canvas/rAF 孤岛内运行,中途 `api.go` 会割裂;写 flag,让通关/被抓后的 `links` 承接叙事。
5. **事件放墙里。** 普通坐标事件在墙/门格玩家走不到;`wall-pickup` 的 `x/y` 也必须是玩家站的地板格。
6. **隐藏物没有形态。** `floor-pickup` / `wall-pickup` 必须配 `icon` 或 `art`。
7. **装饰误当玩法。** `decor`、`wallDecor`、`pillars` 都是纯视觉,不挡路、不拾取、不写 state。
8. **过度相信静态闸。** maze3d 是实时 canvas 孤岛,graph-audit 看不透所有 runtime 软锁;复杂迷宫要实际跑一次。
9. **过度追求真 3D。** 伪 3D 的优势是 grid-first、轻量、可审计;不要写任意 mesh / 跳跃 / 真高低差。
10. **忘记保底退出。** 教学或复杂迷宫最好给一个“退回/放弃”链接,避免玩家或测试被困住。

## 12. 修改后至少怎么验

只改文档或 world 数据时,至少跑:

```bash
node engine/examples/maze3d/test/raycast-maze.test.cjs
node engine/test/run.cjs
```

改了 maze3d 示例入口或构建链时,再跑:

```bash
node engine/core/tooling/graph-audit.mjs engine/examples/maze3d/world.js
node engine/core/tooling/assembly-probe.mjs engine/examples/maze3d/index.html
node engine/pipeline/build/build.mjs engine/examples/maze3d/index.html --smoke
```

视觉/触屏/动画改动必须用 Playwright Chromium 或真浏览器核一次;canvas+rAF 不能只靠静态读码判断。
