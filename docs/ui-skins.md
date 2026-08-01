# UI skin 作者手册

UI skin 是 Amatlas 普通页面 chrome 的换皮能力:同一套 `#mapname/#place/#scene/#look/#choices/#status`、选项按钮和插件工具栏,通过 `html[data-ui]` 与 CSS custom properties 切换外观。它属于 HTML/CSS 模板层,不是新模块,也不是 world/View schema 字段。

## 什么时候用

- 想让同一个文字冒险/跑团/普通 scene 页面有不同气质:深色、纸页、终端、档案、zine、神秘学、霓虹、野外笔记。
- 想在不同节点/区域/氛围下换颜色或细节:用 `<html>` 上的 `data-region` / `data-mood` / `data-node` / `data-node-kind` 钩子。
- 不适合把 skin 写进 `world.js`:剧情数据只表达地点、状态、scene/audio 意图;页面外观留在 HTML/CSS。

## 快速接入

`src/index.html` 里引共享 CSS,并在 `<html>` 上选择一个 skin:

```html
<!doctype html>
<html lang="zh-CN" data-ui="amatlas-dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>你的游戏名</title>
<link rel="stylesheet" href="../ui/amatlas-skins.css">
<style>
  /* 放在共享 CSS 后面:只覆盖 token 或少量本作专属材质。 */
  html[data-ui="amatlas-dark"] {
    --amatlas-accent: #d7a85f;
    --amatlas-accent-2: #83b7d8;
    --amatlas-body-bg: radial-gradient(circle at 18% 0%, #22334c 0, #0c1119 42rem);
  }
</style>
</head>
```

`pipeline/build/build.mjs src/index.html` 会把本地 CSS link 内联进最终单 HTML;成品仍离线可玩。

## 内置 skin

| id | 气质 | 适合 |
|---|---|---|
| `amatlas-dark` | 默认深色叙事 UI | 普通文字冒险基线 |
| `parchment` | 羊皮纸/书页 | 幻想、历史、童话 |
| `terminal` | 终端/设施日志 | 科幻、黑客、异常档案 |
| `casefile` | 证据板/侦探档案 | 悬疑、调查、轻恐怖 |
| `rust-zine` | 锈色剪贴杂志 | 废土、反叛、脏乱手册 |
| `occult-margins` | 边注符号与仪式感 | 神秘学、古宅、异端研究 |
| `neon-noir` | 霓虹夜城与高对比玻璃 | 赛博、都市、追逃 |
| `field-notes` | 野外笔记/网格纸 | 探索、调查、自然志 |

看实际效果：打开 `examples/showroom/index.html`，在 embedded Gallery 中选择 **UI Skin Gallery**。选材页仍可独立打开，并通过真实 `Amatlas.boot` 展示正文、按钮、锁定提示、状态栏、小地图、存档、成就等插件 chrome。

## 可覆盖的 token

这些 token 是作者最安全的换皮入口:

```css
html[data-ui="amatlas-dark"] {
  --amatlas-bg: #0c1119;        /* 页面深背景 */
  --amatlas-bg-soft: #101827;   /* #app / 插件面板背景基底 */
  --amatlas-panel: #121a26;     /* 按钮 / 面板 */
  --amatlas-panel-2: #172334;   /* 次级面板 */
  --amatlas-ink: #e8edf4;       /* 正文/按钮文字 */
  --amatlas-muted: #8fa0b5;     /* 弱文本 */
  --amatlas-accent: #b89b6a;    /* 标题/重点/hover */
  --amatlas-accent-2: #6a8fa8;  /* 次强调 */
  --amatlas-line: #263449;      /* 边线 */
  --amatlas-danger: #c87b6a;    /* 危险/删除/失败 */
  --amatlas-shadow: rgba(0,0,0,.42);
  --amatlas-radius: 12px;
  --amatlas-body-bg: radial-gradient(circle at 18% 0%, #1b2b43 0, #0c1119 42rem);
}
```

内置 skin 刻意把 `--amatlas-app-max`、`--amatlas-ui-font`、`--amatlas-body-font` 统一为稳定值,避免切 skin 时正文行长、按钮宽度和移动端布局跳动。下游作者如果要做完全不同的版式,可以在自己的游戏里改,但那已经是“自定义页面模板”,不要把它当成通用 skin 的默认范式。

## 稳定 DOM 与 CSS 钩子

### 普通页面插槽

- `#plugin-bar`:存档/小地图/成就/重开/物品栏按钮。
- `#mapname`:地图名。
- `#place`:当前地点标题。
- `#scene`:SVG 场景图。
- `#look`:正文。
- `#choices`:选项按钮。
- `#status`:状态栏。
- `#plugin-minimap` / `#plugin-overlay`:小地图 inline 插槽、成就 toast。

### 语义 class

- `#look > .line.line-prose` / `.line-event` / `.line-check` / `.line-outcome`。
- `#choices > button.choice`。
- 移动选项 `.choice.move`。
- 锁定选项 `.choice.locked` + `.lock-hint`。
- 插件按钮 `.amatlas-plugin-btn`。
- 插件浮窗 `.amatlas-plugin-panel`、关闭按钮 `.amatlas-plugin-close`。

class 名是契约,不要重命名。换皮只写 CSS。

### `<html>` dataset 钩子

`data-ui` 由页面模板或 Gallery 控件选择,`present-dom` 不会覆盖它。`present-dom` 每帧只在 `<html>` 上刷新当前内容事实:

- `data-node`:当前节点 id。
- `data-map`:当前 map id。
- `data-node-kind`:当前节点的 `kind`,例如 `scene` / `encounter` / `cutscene`。
- `data-mood`:当前 `scene.mood`。
- `data-region`:当前 `scene.region`。

例子:

```css
html[data-ui="neon-noir"][data-mood="dread"] {
  --amatlas-accent: #ff6b7d;
}
html[data-region="cave"] #scene { filter: saturate(.75) brightness(.82); }
html[data-node-kind="cutscene"] #app { box-shadow: none; }
```

## 可改 / 慎改 / 不改

### 可改:安全材质层

- 颜色 token、渐变背景、纹理背景。
- `box-shadow` / `text-shadow`。
- `border-color`、`border-radius`。
- `filter`、`backdrop-filter`。
- `text-decoration`。
- 不参与文档流的 `position:absolute` 装饰伪元素。
- 短符号前缀,例如 `※`、`◇`、`◎`。

### 慎改:只在本作模板里用,改完真机看

- 字体族、字号、行高。
- `#app` 最大宽度和内边距。
- `.choice` padding / min-height / font。
- `#scene` 的真实 border 宽度或 aspect ratio。
- 长按钮前缀、uppercase。
- `transform: rotate(...)`。
- Gallery / 多栏布局的 grid。

这些会影响阅读宽度、移动端换行、按钮命中区和插件控件位置。内置 skin 不使用它们改通用骨架。

### 不改:通用 skin 默认禁止项

- 不在 `world.js` 新增 `theme` / `skin` / `ui` 这类页面换皮字段。已有模块自己的玩法字段(例如 maze3d 的 `maze.theme`)不是 UI skin,不要混淆。
- 不让模块 View 返回 `skin` 字段。
- 不改 `engine-core` 来支持换皮。
- 不为 skin 新建 `kind` 或新 demo 目录。
- 不把 Gallery 的展示布局套回正式 playable。

## 新建一个自己的 skin

下面是**本作模板自定义**示例。你可以为自己的游戏更自由地加材质,但随包内置 skin 仍应遵守稳定骨架,不要用 skin 改正式 playable 的宽度、内边距、字体度量或按钮命中区。

1. 复制一个最接近的 token 块,改 id:

```css
html[data-ui="my-ink"] {
  color-scheme: dark;
  --amatlas-bg: #08090c;
  --amatlas-bg-soft: #101018;
  --amatlas-panel: #171420;
  --amatlas-panel-2: #211b2e;
  --amatlas-ink: #f2ecdc;
  --amatlas-muted: #a99c87;
  --amatlas-accent: #d5a657;
  --amatlas-accent-2: #8db3ce;
  --amatlas-line: rgba(213,166,87,.24);
  --amatlas-danger: #d06a68;
  --amatlas-shadow: rgba(0,0,0,.56);
  --amatlas-radius: 12px;
  --amatlas-app-max: 720px;
  --amatlas-ui-font: -apple-system, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  --amatlas-body-font: -apple-system, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  --amatlas-body-bg: radial-gradient(circle at 18% 0%, rgba(213,166,87,.18), transparent 30rem), var(--amatlas-bg);
}
```

2. 只加材质层覆盖:

```css
html[data-ui="my-ink"] #app {
  position: relative;
  border-color: rgba(213,166,87,.28);
  background: linear-gradient(180deg, rgba(23,20,32,.94), rgba(8,9,12,.92));
  box-shadow: inset 0 0 0 1px rgba(213,166,87,.10), 0 20px 58px var(--amatlas-shadow);
}
html[data-ui="my-ink"] .choice {
  border-color: rgba(213,166,87,.26);
  background: linear-gradient(90deg, rgba(23,20,32,.96), rgba(33,27,46,.88));
}
html[data-ui="my-ink"] .choice.move::before { content: "✦ "; color: var(--amatlas-accent); }
```

3. 在你的 `src/index.html` 里用:

```html
<html lang="zh-CN" data-ui="my-ink">
```

如果要把它加入随包 Gallery,还要在 `examples/showroom/ui-skins-gallery.js` 的 `SKINS` 数组和 `engine/ui/amatlas-skins.css` 双侧登记,并补测试。

## 验证清单

做完换皮至少跑:

```bash
node pipeline/build/build.mjs src/index.html --smoke
node core/tooling/assembly-probe.mjs src/index.html
```

人工看两档:

- 桌面宽屏:正文行长舒服、插件按钮在顶部可见、浮窗不遮死。
- 手机宽度:无横向滚动、选项按钮不被挤压、skin 切换不让标题/控件掉出屏幕。

开发引擎或改内置 skin 时,还要跑维护者侧回归。注意这些命令是引擎仓库内的维护流程,不是端用户做游戏时必须执行的步骤:

```bash
node examples/showroom/test/showroom.test.cjs
python ../_scratch/ui-skin-c/playwright-skin-matrix.py
```

## 设计理由

Amatlas 的核心思路是“游戏=数据,引擎=解释器,表现层可替换”。UI skin 因此只应提供稳定 hook 和可复制范本,而不是把视觉偏好写进剧情数据或核心契约。内置 skin 的职责是给作者足够多的审美起点,同时守住可用性地板:切换外观不应改变行长、按钮命中区、Gallery 控件宽度或移动端布局。