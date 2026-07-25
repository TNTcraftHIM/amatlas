# UI skins 快速卡

从共享 skin **起步**(别裸手搓 UI——它替你兜住 class 命名接缝和精致度地板),但**按题材选一套、别所有游戏都停在 `amatlas-dark`**:8 套里挑贴气质的一套,再覆盖 `--amatlas-*` token 做本作专属外观,或完全自定义 CSS。不同游戏该有不同气质。完整作者手册见 `engine/docs/ui-skins.md`;选材页见 `examples/showroom/ui-skins-gallery.html`。

## 起步模板(把 data-ui 换成贴题材的那套)

`src/index.html`:

```html
<!doctype html>
<html lang="zh-CN" data-ui="amatlas-dark">   <!-- 选一套:amatlas-dark/parchment/terminal/casefile/rust-zine/occult-margins/neon-noir/field-notes;或删本属性走完全自定义 -->
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>你的游戏名</title>
<link rel="stylesheet" href="../ui/amatlas-skins.css">
<style>
  /* 放在共享 CSS 后:只改 token 或本作专属材质。 */
  html[data-ui="amatlas-dark"] {
    --amatlas-accent: #d7a85f;
    --amatlas-accent-2: #82b7d8;
  }
</style>
</head>
```

`pipeline/build/build.mjs src/index.html` 会把 `../ui/amatlas-skins.css` 内联到成品单 HTML。

## 内置 id

`amatlas-dark` / `parchment` / `terminal` / `casefile` / `rust-zine` / `occult-margins` / `neon-noir` / `field-notes`

## 最安全的改法

只覆盖 token:

```css
html[data-ui="amatlas-dark"] {
  --amatlas-bg: #0c1119;
  --amatlas-bg-soft: #101827;
  --amatlas-panel: #121a26;
  --amatlas-ink: #e8edf4;
  --amatlas-muted: #8fa0b5;
  --amatlas-accent: #b89b6a;
  --amatlas-accent-2: #6a8fa8;
  --amatlas-line: #263449;
  --amatlas-radius: 12px;
  --amatlas-body-bg: radial-gradient(circle at 18% 0%, #1b2b43 0, #0c1119 42rem);
}
```

可加少量材质:

```css
html[data-ui="amatlas-dark"] #app { box-shadow: 0 20px 58px rgba(0,0,0,.48); }
html[data-ui="amatlas-dark"] .choice.move::before { content: "✦ "; color: var(--amatlas-accent-2); }
```

## 不要做

- 不在 `world.js` 写页面换皮用的 `theme:` / `skin:` / `ui:`;模块已有玩法字段另算,不要把 UI skin 混进剧情数据。
- 不让 View 返回 skin 字段。
- 不改 `engine-core`。
- 不改 class/id 名:保留 `#app/#mapname/#place/#scene/#look/#choices/#status/#plugin-bar`、`.choice/.locked/.lock-hint/.amatlas-plugin-btn`。
- 内置 skin 默认不改 `#app` 宽度/内边距、字体度量、按钮 padding/min-height、`#scene` aspect-ratio、Gallery grid。

## 场景条件换色

`present-dom` 会在 `<html>` 写 `data-node` / `data-map` / `data-node-kind` / `data-mood` / `data-region`:

```css
html[data-mood="dread"] { --amatlas-accent: #d06a7c; }
html[data-region="cave"] #scene { filter: saturate(.75) brightness(.82); }
html[data-node-kind="cutscene"] #app { box-shadow: none; }
```

## 验证

普通游戏改完:

```bash
node core/tooling/assembly-probe.mjs src/index.html
node pipeline/build/build.mjs src/index.html --smoke
```

人工看桌面 + 手机:无横向滚动、按钮不挤压、插件按钮可见。