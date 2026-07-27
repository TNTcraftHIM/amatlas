# Visual CSS Techniques — 零外部依赖的视觉增强

## Paper Texture（纸张质感）

给正文容器 `#look`（present-dom 把每行正文渲染进的插槽）加背景纹理，模拟旧纸张的纤维颗粒感。

```css
#look {
  background:
    repeating-radial-gradient(circle at 17% 32%, transparent 0, rgba(180,160,130,0.02) 1px, transparent 2px),
    repeating-radial-gradient(circle at 73% 61%, transparent 0, rgba(160,140,110,0.015) 1px, transparent 3px),
    radial-gradient(ellipse at 50% 0%, rgba(139,115,85,0.04) 0%, transparent 70%);
  border-radius: 4px;
  padding: 4px 0;
}
```

**原理：** 两层 `repeating-radial-gradient` 在不同位置生成不同粒度的半透明圆点（模拟纤维），
一层 `radial-gradient` 做顶部暖光渐变（模拟纸张受光）。

**暗色主题调参：** opacity 0.02-0.03（极淡，不干扰阅读）。
**亮色主题调参：** opacity 0.04-0.06（可以稍明显）。

---

## Ink Spread Hover（墨水扩散 hover）

选项按钮 hover 时模拟墨水在纸上洇开的效果。

```css
.choice { position: relative; overflow: hidden; }
.choice::after {
  content: '';
  position: absolute;
  left: 0; top: 50%; bottom: 50%;
  width: 0; height: 0;
  background: radial-gradient(ellipse at left center, var(--accent-glow), transparent 70%);
  opacity: 0;
  transition: width 0.5s ease, height 0.5s ease, top 0.5s ease, bottom 0.5s ease, opacity 0.5s ease;
  pointer-events: none;
  border-radius: 8px;
}
.choice:hover::after {
  width: 100%; height: 100%; top: 0; bottom: 0;
  opacity: 1;
}
```

**关键点：**
- `overflow: hidden` — 光晕不超出按钮边界
- `pointer-events: none` — 不阻挡按钮点击
- `top: 50%; bottom: 50%` → `top: 0; bottom: 0` — 从中心线向上下展开
- `radial-gradient(ellipse at left center)` — 从左侧中心扩散（模拟从选项编号开始）

**替代方案（box-shadow 版，更轻量）：**
```css
.choice:hover {
  box-shadow: inset 0 0 20px var(--accent-glow), 0 0 10px var(--accent-glow);
}
```

---

## Inner Voice（内心声音）— 推荐方式

> **模块化呈现前提**：present-dom 把节点 `look` 产出的每行正文按 `#look > div.line.line-<type>` 渲染，
> 且用 `textContent`（自动转义）——所以**正文里写 `<span class="...">` 不会被当 HTML，会原样显示**。
> 内心声音因此不是「句中插标签」，而是**让那句话单独成一行正文，给它一个语义 type → `.line-inner`**：
> 在节点 `look` 函数里把内心独白拆成自己的一段，模块据 type 渲染成 `.line-inner` 行（同 `.line-event`/`.line-check` 的做法）。

### ❌ 不推荐：把「内心」当句中标签

```
但你还活着。内心：这是最重要的事。
```

问题：`内心` 作为说话人标签插在句子中间，读起来像有人在你脑子里打了个标签。
在中文散文中，说话人标签只用于对话前（`「你好」他说`），不用于内心独白。

### ✅ 推荐：Inner-Voice 单独成行 + 语义 class

`#look > .line-inner` 行的 CSS（present-dom 给每行加 `line line-<type>`，直接挂 `.line-inner`）：

```css
.line-inner {
  color: #a09880;
  font-style: italic;
  opacity: 0.88;
  text-shadow: 0 0 12px rgba(160,152,128,0.08);
}
```

在 `world.js` 节点 `look` 里把内心独白拆成自己的一段（叙述与内心独白分行），让模块产出一行 `type:'inner'`：

```js
// world.js —— look 返回分段正文;内心独白单独一段(由模块/渲染器标成 type:'inner')
look: (S, first) => first
  ? '但你还活着。\n@inner 这是最重要的事。'
  : '海浪还在拍打礁石。'
// 说明:正文以换行分段;约定前缀(如本例 '@inner ')由你的 look 组装/小工具翻成
// body 行的 type,present-dom 即渲染成 #look>.line-inner。纯叙述段保持默认 type:'prose'。
```

**效果：** 内心独白行有微弱的色彩偏移和斜体，暗示这些话来自角色内心而非叙述者。
没有打断阅读流——读者自然地从叙述过渡到内心独白。**层次靠「整行的语义 class」实现，而非句中 span。**

### 使用场景（全文 ≤7 处）

- 生死关头的第一反应（beach_awakening: "这是最重要的事"）
- 重大发现的内心判断（first_shift: "你感到的是一种奇异的敬畏"）
- 关键回忆浮现（the_choice: "你回想起了一切"）
- 与超自然共鸣（heart_of_island: "也许是一分钟，也许是一个小时"）
- 终极领悟（ending_transcend: "你不是在控制岛屿"）

**不适合：** 常规叙述、观察描写、NPC对话前的过渡。
每 5000 字最多 1 处，过多则失去冲击力。

### 叙述者补充 vs 角色声音 的区分

两种「非主线叙述」的声音，别混为一谈、别在同一段里混用：

- **叙述者的补充说明**（背景知识）→ 这是**条件出现的散文**：在节点 `look:(S)=>…` 里按状态决定要不要带上这段
  （`S.flags.knowsTruth ? '（你想起那本日记提到过…）' : ''`），它仍是普通正文段（`type:'prose'`），
  可另给一个语义 type（如 `.line-aside`）做淡化样式。
- **角色的声音**（「角色在想什么」）→ 上面的 `.line-inner`，单独成行、斜体偏色。

要点：补充说明=叙述者口吻、随状态条件出现；内心声音=角色口吻、克制使用。两者样式与语气都要拉开。

---

## SVG Filter: text-shake（feTurbulence 有机扭曲）

详见 `references/progressive-reveal.md` § text-shake CSS 效果。

关键参数：scale ≤ 3（>6 是精神污染），0.15s flicker。
SVG filter id 必须与 CSS `url(#xxx)` 匹配。

---

## 组合使用

这些 CSS 技巧可以叠加。下面是 present-dom 渲染后 `#look` 的实际 DOM 形状——
每行正文是 `div.line.line-<type>`，你的 CSS 据 type 挂效果（行级 class，不是句中 span）：

```html
<div id="look">  <!-- 纸张质感背景挂在容器 #look 上 -->
  <div class="line line-prose text-shake">船撞上礁石的那一刻...</div>  <!-- feTurbulence 扭曲 -->
  <div class="line line-prose text-fade-in">你想起了童年的某个下午...</div>  <!-- 记忆浮现 -->
  <div class="line line-prose text-glow">核心形态在你面前旋转...</div>  <!-- 金色光晕 -->
  <div class="line line-inner">你明白了。</div>  <!-- 内心声音(单独成行) -->
</div>
```

`.text-shake`/`.text-fade-in`/`.text-glow` 这类「单行特效 class」由你的呈现层按行的语义 type 追加
（如某 type 的行额外加 `.text-shake`），world 数据里只声明意图、不写 DOM。
`#choices > button.choice` hover 时自动触发上面的墨水扩散效果。
