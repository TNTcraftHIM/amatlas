# 跑团模块 · 作者 few-shot 范例(authoring)

> 给 AI / 作者一个**填好的**例子(不止 schema)。跑团游戏 = **数据**(world)+ 角色卡(plugin 配置);
> 引擎是解释器。节点 `kind:'encounter'` 由 `tabletop` 模块负责。可运行实例见 `examples/tabletop-demo/`。
> **先读 `tabletop-design.md`**(设计原则:何时掷骰 / 角色卡 / 资源时钟平衡 / 定 DC)再照本文填——本文给"怎么写",那份给"为什么这么写"。

## 1. 怎么装上(默认走 `A.boot` 声明式装配)

```js
var A = window.Amatlas;
var engine = A.boot(WORLD, {                                 // world 有 kind:'encounter' → boot 自动拉 Tabletop
  sheet: { name: '醒转者', skills: { 体魄: 1, 感知: 2, 交涉: 1 }, resources: { 状态: 3 } },
  save: true, minimap: { mode: 'toggle', layout: 'spatial' }, achievements: []
});
// index.html 仍引全部 <script>(含 modules/tabletop/runtime/tabletop.js + preset/boot.js;boot 从 window.Amatlas 读它们)
```

escape hatch 手写等价（同样由必填 `WORLD.id` 派生稳定存档命名空间；正常游戏不另写 `saveKey`）:

```js
var A = window.Amatlas;
var engine = A.createEngine(WORLD, { storage: window.localStorage });
engine.use(A.Tabletop.createTabletopModule({                 // 玩法模块经统一 use 注册(核心零改)
  sheet: { name: '醒转者', skills: { 体魄: 1, 感知: 2, 交涉: 1 }, resources: { 状态: 3 } }
}));
// 叠加可插拔表现层 / 能力(各自可选,注释即关):
engine.use(A.DomPresenter.createDomPresenter({ document: document }));   // 文字(复用 present-dom)
engine.use(A.SvgPresenter.createSvgPresenter({ slot: '#scene' }));       // SVG 场景 + 骰子
engine.use(A.AudioPresenter.createAudioPresenter());                     // 检定音效
engine.start();
```

- **角色卡 = 组件**:`sheet` 经 plugin 注入,引擎在进入时懒初始化进 `state.sheet`(→ **随存档往返**)。
  `skills` 是技能调整值,`resources` 是可消耗资源(检定 `cost` 从这里扣)。

## 2. 节点 schema(`kind:'encounter'`)

```js
node = {
  kind: 'encounter',
  title: '坍缩的气闸',
  look: '散文',                       // 或 { first, return }(首次/重访),或 (state, isFirst) => '散文'
  scene: { region: 'cave', mood: 'tense' },   // 视觉意图(SVG presenter 消费;可缺省 → 纯文字退化)
  audio: { bgm: 'theme-tense' },               // 听觉意图(Audio presenter 消费)
  checks: [ /* 见下:技能检定 */ ],
  exits: [ /* 核心移动:{ to, label?, available?(state) }。需门控就给 available */ ]
}
```

- **移动**用核心 `exits`(类型无关的"门");需要门控就写 `available:(s)=>...`。**检定**用 `checks`(跑团专属)。
- `scene`/`audio` 是**意图非素材**:声明"要什么",presenter 决定怎么画/发声;世界数据里不出现 SVG/音频。

## 3. 检定 schema(`api.dice(NdS)` + 技能调整 vs DC)

```js
{ id: 'force', label: '撬开舱门',
  skill: '体魄',          // 取 sheet.skills[skill] 作调整值
  dc: 8,                  // 难度:roll + 调整 >= dc → 成功
  dice: '2d6',            // 缺省 '2d6';用核心确定性 RNG(同存档逐抽复现)
  cost: { res: '状态', amount: 1 },     // 每次尝试先扣资源(资源不足则该检定不可点 → 自然挡住重试)
  success: { text: '门让开一道缝。', flag: 'gateOpen', clock: 1 },  // 后果:置 flag / 推进时钟 / set:{k:v} / to:'节点id'(v12 直接移动)
  fail:    { text: '纹丝不动。', clock: 1 } }
```

- **成功/失败后果**可含:`text`(叙事)、`flag`(置 `state.flags[flag]=true`,用于门控后续 exits)、`clock`(推进时钟 N)、`set`(批量写 flags)、**`to:'节点id'`(或 `{map,node}` 跨图;v12:检定结果直接移动——先结算 text/set/flag/clock 再移动;`fail.to`=失败送去新处境 = fail forward,防原地无限重掷,见 tabletop-design §4b)**。
- 检定会 `emit('check', {skill,dc,roll,mod,total,ok})` —— 任何插件可 `api.on('check', fn)` 订阅(成就/记录/连锁)。
- **置了 `success.flag` 的检定在成功后自动隐去**(不再重复掷);否则可重试(直到资源耗尽)。

## 4. 完整范例:一个节点(撬闸)

```js
gate: {
  kind: 'encounter',
  title: '坍缩的气闸',
  scene: { region: 'cave', mood: 'tense' },
  audio: { bgm: 'theme-tense' },
  look: '一道变形的合金门半卡在轨道上,门缝里漏出幽蓝的光。',
  checks: [
    { id: 'force', label: '撬开舱门', skill: '体魄', dc: 8, dice: '2d6',
      cost: { res: '状态', amount: 1 },
      success: { text: '金属呻吟着让开一道缝。', flag: 'gateOpen', clock: 1 },
      fail:    { text: '门纹丝不动,你的肩膀撞得生疼。', clock: 1, to: 'bay' } }   // v12 fail forward:失败摔回醒转舱(不写 to = 原地可重试)
  ],
  exits: [
    { to: 'bay',  label: '退回醒转舱' },
    { to: 'core', label: '钻过缝隙,深入堆芯', available: function (s) { return !!s.flags.gateOpen; } }  // 撬开后才出现
  ]
}
```

**检定当帧**,模块自动产出 `scene.elements:[{kind:'dice', ref:骰值, sides:面数, state:'success'|'fail'|'crit'|'fumble'}]` + `audio.sfx:['dice-roll', 成败音]`——
SVG 据 `sides` 选骰形(d6 等距立方 / d20 六边形…)、据 `state` 着色(自然最大→暴击金光 / 自然最小→大失败红裂),Audio 出检定音效;这是"呈现帧产物",只显示一次、不入存档。作者**无需**手写动画或音频;**骰子外观/换皮**(材质/配色/HTML div 真 3D)见 `dice-styles.md`。
