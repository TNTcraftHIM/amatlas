# Progressive Reveal + 文字颤抖演出

## Progressive Reveal（渐进揭示）

A Dark Room 原则：「最好的视听效果是在正确的时刻突然出现的新元素」。

### 实现：把「揭示节奏」写进每个节点的 scene/audio 意图

模块化里**没有运行时按场景 id 开关视听**的环节——不再用 `loadScene` 里一张 `Set`
查表去 `style.display='none'` 关粒子、`replace()` 删 SVG、改 `gain.value` 压音量。
渐进揭示是**作者数据的属性**：序章节点就**少声明甚至不声明** scene/audio（present-svg
看到稀疏意图自然画得克制），越往后的节点声明越丰富的 `mood`/`elements`/`audio`。
present-svg.js / present-audio.js 据此呈现，**怎么画、怎么动、怎么合成全是 presenter 的事**。

`world.js`（每个 stage 的节点都自带它的揭示强度）：

```js
// 序章:只有文字 —— 不声明 scene/audio,呈现器自然退化为纯文字(让文字先说话)
prologue: {
  kind: 'scene', name: '序章',
  look: { first: '……', return: '……' },
  links: [ { label: '醒来', to: 'beach_awakening' } ]
},

// 海滩觉醒:第一幅 SVG(日出)出现 —— 声明 region/mood,音频回到正常
beach_awakening: {
  kind: 'scene', name: '海滩觉醒',
  scene: { region: 'beach', mood: 'warm' },      // 第一次有视觉
  audio: { bgm: 'theme-beach' },
  look: { first: '……', return: '……' },
  links: [ { label: '走向森林', to: { map: 'forest', node: 'edge' } } ]
},

// 森林入口:环境氛围全面展开 —— 补 elements(环境图元)
forest_entrance: {
  kind: 'scene', name: '森林入口',
  scene: { region: 'forest', mood: 'eerie', elements: [ { kind: 'hazard', ref: '光点' } ] },
  audio: { bgm: 'theme-forest' },
  look: { first: '……', return: '……' },
  links: [ /* … */ ]
},

// 岛屿之心:最高感官密度 —— 最浓 mood + 最多 elements + 最满 audio
island_heart: {
  kind: 'scene', name: '岛屿之心',
  scene: { region: 'cave', mood: 'tense', elements: [ { kind: 'character', ref: '核心形态' } ] },
  audio: { bgm: 'theme-night', sfx: [ 'pickup' ] },
  look: { first: '……', return: '……' },
  links: [ /* … */ ]
}
```

要随阶段调"序章降音量 40%"这种**呈现策略**(而非数据),改 present-audio.js 的映射
(如按 `mood`/缺省 bgm 决定基础增益),**world 数据里不写 gain**——同 region 配色改在
present-svg.js 的 `REGION_BG`、音色改在 present-audio.js(修改分层:表现→presenter)。

### 渐进揭示路线

| 阶段 | 节点 | 声明的 scene | elements | audio | 呈现效果 |
|------|------|------|-----|------|------|
| 0 | prologue, shipwreck | 不声明 | — | 不声明(纯文字退化) | 只有文字 + 微弱海浪声 → 纯粹叙事 |
| 1 | beach_awakening, camp_setup | region+mood | — | bgm 正常 | 第一幅 SVG(日出)→ 视觉叙事开始 |
| 2 | forest_entrance+ | region+mood | 有(光点/角色等) | bgm+sfx | 环境图元启动 → 氛围全面展开 |

### 设计效果

- 序章：只有文字 + 微弱海浪声 → 纯粹的叙事
- 海滩觉醒：第一幅 SVG（日出）出现 → 视觉叙事开始
- 森林入口：环境图元启动 → 环境氛围全面展开
- 岛屿之心：最浓 mood + 全部 elements → 最高感官密度
- 结局：所有意图收束 → 节点不再声明 scene/audio → 归于沉默 → 只剩文字

## text-shake 文字颤抖演出

### 两种方案对比

| 方案 | 视觉效果 | 适用场景 |
|------|----------|----------|
| feTurbulence + feDisplacementMap | 有机字形扭曲，像文字在颤抖 | 恐惧、超自然、精神冲击、岛屿重排 |
| transform: translate() | 位置位移，像纸面在抖 | 地震、物理冲击、船撞击 |

**用户测试结论：** 小幅度 translate（±2px）看起来像"字体故障"而非"地震"，
feTurbulence 的有机扭曲反而更有沉浸感。但 scale 必须 ≤3，>6 是精神污染。

### 模块化:文字颤抖是 presenter 的事,作者只声明意图

模块化里**作者不在游戏 HTML 里手写 SVG `<filter>` 或 `@keyframes`**。颤抖是「猛烈/精神
冲击」这一**意图**的呈现——作者在节点上声明 `mood`(如 `'horror-climax'`)和/或
`transition`(如 `'slam'` 猛切),present-svg.js 据此放过场动画/扭曲(它把 transition 的
CSS 注入 `document.head`、据节点变化加一次性 class)。怎么实现颤抖(feTurbulence 还是
translate)是 **presenter 的自由**(契约 §10.2-Q1)。horror-demo 即如此:

`world.js`(作者只说意图,一行动画码都没写):

```js
beyond: {
  kind: 'scene', name: '门后',
  // 高潮:transition:'slam' 猛切(presenter 决定具体抖动) + mood 推到 horror-climax。
  scene: { region: 'night', mood: 'horror-climax',
           elements: [ { kind: 'letterbox' }, { kind: 'eyes', state: 'bleeding', ref: 'fullscreen' } ],
           transition: 'slam' },
  audio: { bgm: null, sfx: [ 'horror-sting' ] },
  look: { first: '……', return: '……' },
  links: [ /* … */ ]
}
```

要把「slam 的颤抖」从 translate 改成 feTurbulence 有机扭曲(下面的方法论),改 present-svg.js
里 `slam` 过场的 CSS / SVG filter 映射即可,**所有节点统一受益、world 数据零改**。
present-svg.js 现有 `slam` 过场用 translate + brightness;下面两套方案是给 presenter 作者的
设计依据(选 feTurbulence 还是 translate、怎么调参)。

### 推荐方案:feTurbulence(有机扭曲)—— presenter 里这样实现

presenter 把这段 CSS 注入 `document.head`、给 `#scene`(或文字容器)挂 `.text-shake` class：

```css
.text-shake {
  filter: url(#glitch);
  animation: glitch-flicker 0.15s steps(2) infinite;
}
@keyframes glitch-flicker {
  0%   { opacity: 1; filter: url(#glitch); }
  50%  { opacity: 0.92; filter: url(#glitch) brightness(1.05); }
  100% { opacity: 1; filter: url(#glitch); }
}
```

配套 SVG filter 定义——由 presenter 注入（不再由作者手写进游戏 HTML）：
```html
<filter id="glitch">
  <feTurbulence type="turbulence" baseFrequency="0.02 0.05" numOctaves="2" result="noise" seed="0">
    <animate attributeName="seed" values="0;100" dur="0.5s" repeatCount="indefinite"/>
  </feTurbulence>
  <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G"/>
</filter>
```

### 备选方案:translate(物理抖动)—— presenter 里这样实现

```css
.text-shake {
  animation: shake-text 0.4s ease-in-out 3;
}
@keyframes shake-text {
  0%, 100% { transform: translate(0, 0); }
  15% { transform: translate(-2px, 1px); }
  30% { transform: translate(2px, -1px); }
  45% { transform: translate(-1px, 2px); }
  60% { transform: translate(1px, -2px); }
  75% { transform: translate(-2px, 0); }
  90% { transform: translate(1px, 1px); }
}
```

### 关键参数

- **feTurbulence scale**：≤3（细腻扭曲）；4-6（明显扭曲）；>6（精神污染）
- **translate 频率**：0.3-0.5s（2-3Hz）= 自然抖动；<0.2s = glitch
- **translate 幅度**：1-3px = 微震；4-6px = 强震；>6px = 过度
- **translate 次数**：3 次 = 短暂冲击；infinite = 持续（慎用）
- **prefers-reduced-motion**：`.text-shake { filter: none !important; animation: none !important; }`

### 常见 Bug

- presenter 注入的 SVG filter 定义了 `id="glitch"`，但 CSS 引用了 `url(#glitch-filter)`（名字不匹配 → filter 不生效）
- presenter 同时定义了 SVG filter 又用了 translate animation（filter 被浪费，两种效果都不生效）
- scale 设为 6+ 时文字不可读（降低到 3）
- 作者在节点上声明了一个 present-svg.js `MOOD_TINT` / 过场表里没有的 `mood`/`transition` 值
  → 呈现器优雅退化（无颤抖），不是 bug 但意图落空：要么用已支持的值，要么在 presenter 映射表里补一条

### 使用场景

- 船撞上礁石 → 节点声明 `transition:'slam'`（presenter 用 feTurbulence，超自然冲击）
- 重排地震 → 节点 `mood:'horror-climax'` + `transition:'slam'`（presenter 用 feTurbulence，岛屿力量）
- 预期：可配合 `text-glow`（核心形态对话）和 `text-fade-in`（记忆浮现）等 presenter 文字效果
