#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   art-spec-preview.mjs — art-spec / ART_PRESETS 即时预览工具
   ════════════════════════════════════════════════════════════════════════
   解决"盲写坐标"问题:作者把 art-spec 图元数组(或内置预设名)喂给本工具,
   生成一个独立 HTML(内联 present-svg、渲染居中 SVG 场景 + ±15 坐标参考网格)
   → 浏览器打开即看,改了重跑即可,**不必构建整个游戏**。

   使用方式:
     # 从文件读 art-spec(JSON 数组)
     node art-spec-preview.mjs art.json              # → stdout
     node art-spec-preview.mjs art.json preview.html # → 写文件

     # 从 stdin 读(管道/heredoc)
     echo '[{"shape":"circle","cx":0,"cy":0,"r":10,"fill":"#e87aa0"}]' \
       | node art-spec-preview.mjs - preview.html

     # 内置预设名(字符串 JSON)
     echo '"ship"' | node art-spec-preview.mjs -

     # 显示所有内置预设名
     node art-spec-preview.mjs --list

   选项:
     -r, --region <r>   scene.region(影响背景色 + 剪影,默认 room)
     -m, --mood   <m>   scene.mood(影响色调/氛围,默认留空)
     --list             列出所有 ART_PRESETS 名字并退出
     -h, --help         显示帮助并退出

   坐标参考网格:
     画布 viewBox 与引擎相同(320×180)。art-spec 用**本地居中坐标**,
     物件以 (0,0) 为中心、范围约 ±15 单位。网格在预览中叠在居中位置:
       - 每 5 单位一条淡灰辅助线(覆盖 ±15 范围即可)
       - X/Y 轴用红线高亮(显示"这里是原点")
       - 坐标标注(±5/±10/±15)帮助对位

   实现策略:
     工具在 Node 侧先用 require(present-svg) 校验 art-spec 合法性
     (fail-loud:非法即打印错误并退出 1),再把 present-svg 整文件
     **内联进生成的 HTML** 让浏览器驱动 buildSceneSVG → 自包含单文件
     (与引擎"all-in-one HTML"哲学一致;不依赖外部 cdn/server)。

   零第三方依赖:仅 Node 内置 fs/path/url/module + 读 present-svg(同仓库)。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));
// present-svg 相对本工具的路径:core/tooling/ → ../../presenters/
const PRESENTER_PATH = path.join(SELF_DIR, '../../presenters/present-svg.js');

// ── 参数解析 ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('-h') || args.includes('--help')) {
  process.stdout.write([
    'art-spec-preview.mjs — art-spec 即时预览工具',
    '',
    '用法:',
    '  node art-spec-preview.mjs <art.json|-> [output.html] [选项]',
    '  node art-spec-preview.mjs --list',
    '',
    '  art.json    : 含 art-spec 数组(或内置预设名字符串)的 JSON 文件',
    '  -           : 从 stdin 读',
    '  output.html : 可选,写到文件(默认 stdout)',
    '',
    '选项:',
    '  -r, --region <r>   scene.region(默认 room)',
    '  -m, --mood   <m>   scene.mood(默认留空)',
    '  --list             列出所有内置 ART_PRESETS 名字',
    '  -h, --help         显示帮助',
    '',
    '示例:',
    '  echo \'[{"shape":"circle","cx":0,"cy":0,"r":10,"fill":"#e87aa0"}]\' | node art-spec-preview.mjs -',
    '  node art-spec-preview.mjs art.json preview.html --region forest --mood calm',
    '  echo \'"ship"\' | node art-spec-preview.mjs -',
  ].join('\n') + '\n');
  process.exit(0);
}

// 解析具名选项,收集剩余位置参数
let regionOpt = 'room';
let moodOpt = '';
const posArgs = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '-r' || args[i] === '--region') { regionOpt = args[++i] || 'room'; }
  else if (args[i] === '-m' || args[i] === '--mood') { moodOpt = args[++i] || ''; }
  else if (args[i] === '--list') {
    // --list:先加载 present-svg,打印预设名
    let svg;
    try { svg = require(PRESENTER_PATH); } catch (e) { fatal('加载 present-svg 失败: ' + e.message); }
    const keys = Object.keys(svg.ART_PRESETS);
    process.stdout.write('ART_PRESETS 内置预设(' + keys.length + ' 个):\n  ' + keys.join('  ') + '\n');
    process.exit(0);
  }
  else { posArgs.push(args[i]); }
}

const inputArg = posArgs[0];   // 文件路径 | '-' | undefined
const outputArg = posArgs[1];  // 输出文件路径(可选)

if (!inputArg) {
  fatal('缺少输入参数。用 -h 查看帮助。');
}

// ── 工具函数 ─────────────────────────────────────────────────────────────
function fatal(msg) {
  process.stderr.write('[art-spec-preview] ' + msg + '\n');
  process.exit(1);
}

// 读 stdin 直到 EOF
function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', reject);
  });
}

// ── 主流程(async IIFE) ──────────────────────────────────────────────────
(async function main() {
  // 1. 加载 present-svg(Node 侧校验用)
  let svg;
  try {
    svg = require(PRESENTER_PATH);
  } catch (e) {
    fatal('加载 present-svg.js 失败(路径: ' + PRESENTER_PATH + '): ' + e.message);
  }

  // 2. 读 JSON 输入
  let rawJson;
  if (inputArg === '-') {
    rawJson = await readStdin();
  } else {
    const absInput = path.resolve(inputArg);
    if (!fs.existsSync(absInput)) fatal('文件不存在: ' + absInput);
    rawJson = fs.readFileSync(absInput, 'utf8');
  }

  // 3. 解析 JSON
  let artSpec;
  try {
    artSpec = JSON.parse(rawJson.trim());
  } catch (e) {
    fatal('JSON 解析失败: ' + e.message);
  }

  // 4. Node 侧校验(fail-loud:抛错立即报告;提供行号/原因帮助作者定位)
  // 预设名(字符串)→ 通过 renderElementArt 校验(会 warn 未知名,但不 throw)
  // 数组(art-spec DSL)→ 通过 renderArtSpec 校验(非法即 throw)
  let nodeValidation = '';  // 校验结论给 HTML 显示
  try {
    if (typeof artSpec === 'string') {
      // 预设名:renderElementArt 返回 null 表示未知(只 warn 不 throw)
      const presetKeys = Object.keys(svg.ART_PRESETS);
      if (!presetKeys.includes(artSpec)) {
        nodeValidation = '⚠️ 未知预设名 "' + artSpec + '",将退化为 glyph。可选: ' + presetKeys.join(', ');
        process.stderr.write('[art-spec-preview] 警告: ' + nodeValidation.replace('⚠️ ', '') + '\n');
      } else {
        nodeValidation = '✅ 内置预设: ' + artSpec;
      }
    } else if (Array.isArray(artSpec)) {
      // art-spec 数组:renderArtSpec 会 throw 于非法图元
      svg.renderArtSpec(artSpec, 'art-spec-preview');
      nodeValidation = '✅ art-spec 校验通过(' + artSpec.length + ' 个图元)';
    } else {
      fatal('art-spec 必须是 JSON 数组(art-spec DSL)或字符串(内置预设名),收到: ' + typeof artSpec);
    }
  } catch (e) {
    // art-spec 校验失败:打印错误、生成带错误提示的 HTML(仍输出,方便作者调试)
    const errMsg = e.message;
    process.stderr.write('[art-spec-preview] art-spec 校验失败: ' + errMsg + '\n');
    nodeValidation = '❌ 校验失败: ' + errMsg;
  }

  // 5. 读 present-svg.js 源码(内联进 HTML)
  const presenterSrc = fs.readFileSync(PRESENTER_PATH, 'utf8');
  // 安全:把源码里可能出现的 </script> 转义,防提前终止 script 标签
  const presenterSrcSafe = presenterSrc.replace(/<\/script/gi, '<\\/scri' + 'pt');

  // 6. art-spec JSON 内联到 HTML 脚本
  const artSpecJson = JSON.stringify(artSpec);
  const regionJson  = JSON.stringify(regionOpt);
  const moodJson    = JSON.stringify(moodOpt);
  const validMsg    = nodeValidation.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 7. 生成 HTML
  // 画布尺寸与引擎一致:viewBox 320×180。预览区放大 2× 显示(640×360)便于观察。
  // 网格叠加:以场景中心(160,90)为 art-spec (0,0) 原点,每 5 单位一格(1 引擎单位 ≈ 显示 2px)
  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>art-spec 预览 — Amatlas</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #1a1a22; color: #d8d0c0; font-family: monospace; min-height: 100vh;
         display: flex; flex-direction: column; align-items: center; padding: 24px 16px; gap: 16px; }
  h1  { font-size: 1rem; color: #a8a0b0; letter-spacing: 0.08em; }
  /* 场景容器 */
  #scene-wrap { position: relative; width: 640px; max-width: 100%; aspect-ratio: 16/9;
                border: 1px solid #3a3850; border-radius: 4px; overflow: hidden; background: #111; }
  #scene-wrap svg { display: block; width: 100%; height: 100%; }
  /* 网格 SVG 覆盖在场景 SVG 上方 */
  #grid-overlay { position: absolute; inset: 0; pointer-events: none; }
  /* 校验/信息条 */
  #info { font-size: 0.82rem; max-width: 640px; width: 100%; background: #14141e;
          border: 1px solid #2a2840; border-radius: 4px; padding: 10px 14px;
          white-space: pre-wrap; word-break: break-all; color: #b8c0c8; line-height: 1.5; }
  /* 图例 */
  #legend { font-size: 0.78rem; color: #7a7888; max-width: 640px; width: 100%; }
  #legend span { display: inline-block; margin-right: 16px; }
  .leg-red    { color: #e87070; }
  .leg-gray   { color: #606070; }
  .leg-yellow { color: #c8b040; }
</style>
</head>
<body>
<h1>Amatlas · art-spec 预览工具</h1>

<div id="scene-wrap">
  <!-- 场景 SVG 由脚本注入 -->
  <div id="scene"></div>
  <!-- 网格覆盖层 -->
  <svg id="grid-overlay" viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"></svg>
</div>

<div id="info">正在渲染…</div>

<div id="legend">
  <span class="leg-red">━ 坐标轴(X/Y)</span>
  <span class="leg-gray">┄ 5 单位辅助线</span>
  <span class="leg-yellow">⬤ 原点 (0,0)</span>
  <span class="leg-gray">画布 320×180 · art-spec 坐标 ±15 单位</span>
</div>

<script>
/* ── 内联 present-svg(UMD,设置 global.Amatlas.SvgPresenter) ── */
${presenterSrcSafe}
</script>
<script>
(function () {
  'use strict';

  /* 从工具注入的参数 */
  var ART_SPEC   = ${artSpecJson};
  var REGION     = ${regionJson};
  var MOOD       = ${moodJson};
  var VALID_MSG  = ${JSON.stringify(nodeValidation)};

  /* 画布尺寸与引擎一致 */
  var W = 320, H = 180;
  /* ── 1. 构造 scene,用 buildSceneSVG 渲染背景 + 物件 ── */
  var svgMod = (typeof Amatlas !== 'undefined' && Amatlas.SvgPresenter) ? Amatlas.SvgPresenter : null;
  /* art-spec 本地原点 = present-svg 实际放置单物件的 slot(placeElements(1)),让 ±15 网格与渲染对齐;
     缺省回退 {40,108}(present-svg 单物件 canonical slot)。修:原硬编码 (160,100) 与实际落点差 120px、会误导坐标对位(对抗审计 P2)。 */
  var __slot = (svgMod && svgMod.placeElements) ? (svgMod.placeElements(1)[0] || {}) : {};
  var ORIGIN_X = (typeof __slot.x === 'number') ? __slot.x : 40, ORIGIN_Y = (typeof __slot.y === 'number') ? __slot.y : 108;
  var sceneSvg = '';
  var renderErr = '';

  if (!svgMod) {
    renderErr = 'present-svg 未加载,无法渲染场景。';
  } else {
    /* 把 art-spec 包成 scene.elements[0],放到 origin 槽位 */
    var el = { kind: 'item', ref: 'preview', art: ART_SPEC };
    try {
      sceneSvg = svgMod.buildSceneSVG({
        region: REGION || 'room',
        mood:   MOOD   || undefined,
        elements: [el]
      });
    } catch (e) {
      renderErr = 'buildSceneSVG 抛出: ' + e.message;
      sceneSvg = '';
    }
  }

  /* 注入场景 SVG */
  var sceneEl = document.getElementById('scene');
  if (sceneSvg) {
    sceneEl.innerHTML = sceneSvg;
  } else {
    /* 渲染失败时显示空底板 */
    sceneEl.innerHTML = '<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">'
      + '<rect width="320" height="180" fill="#2a2622"/>'
      + '<text x="160" y="95" text-anchor="middle" fill="#7a7070" font-family="monospace" font-size="11">渲染失败(见下方信息)</text>'
      + '</svg>';
  }

  /* ── 2. 绘制坐标参考网格(覆盖层 SVG) ── */
  var gridSvg = document.getElementById('grid-overlay');
  var lines = [];

  /* 单位换算:art-spec 1 单位 = 多少 viewBox 像素
     默认 slot translate 在 (ORIGIN_X, ORIGIN_Y);1 art-spec 单位 = 1 viewBox 像素(present-svg 不缩放) */
  var UNIT = 1;  /* 1:1 映射;若将来 present-svg 加缩放,改这里 */
  var RANGE = 15;  /* ±15 单位 */
  var STEP  = 5;   /* 每 5 单位一条线 */

  function px(artCoord, axis) {
    return axis === 'x' ? ORIGIN_X + artCoord * UNIT : ORIGIN_Y + artCoord * UNIT;
  }

  /* 辅助线(每 5 单位,排除轴线) */
  for (var v = -RANGE; v <= RANGE; v += STEP) {
    if (v === 0) continue;  /* 轴线单独画 */
    var gx = px(v, 'x'), gy = px(v, 'y');
    /* 竖线 */
    lines.push('<line x1="' + gx.toFixed(1) + '" y1="' + (ORIGIN_Y - RANGE) + '" x2="' + gx.toFixed(1) + '" y2="' + (ORIGIN_Y + RANGE) + '"'
      + ' stroke="rgba(180,175,200,0.22)" stroke-width="0.5" stroke-dasharray="1.5 2"/>');
    /* 横线 */
    lines.push('<line x1="' + (ORIGIN_X - RANGE) + '" y1="' + gy.toFixed(1) + '" x2="' + (ORIGIN_X + RANGE) + '" y2="' + gy.toFixed(1) + '"'
      + ' stroke="rgba(180,175,200,0.22)" stroke-width="0.5" stroke-dasharray="1.5 2"/>');
    /* 坐标标注 */
    var lbl = String(v);
    lines.push('<text x="' + (gx - 0.3).toFixed(1) + '" y="' + (ORIGIN_Y - RANGE - 2) + '"'
      + ' text-anchor="middle" font-family="monospace" font-size="4" fill="rgba(180,175,200,0.45)">' + lbl + '</text>');
    lines.push('<text x="' + (ORIGIN_X - RANGE - 3) + '" y="' + (gy + 1.5).toFixed(1) + '"'
      + ' text-anchor="end" font-family="monospace" font-size="4" fill="rgba(180,175,200,0.45)">' + lbl + '</text>');
  }

  /* X 轴(红) */
  lines.push('<line x1="' + (ORIGIN_X - RANGE) + '" y1="' + ORIGIN_Y + '" x2="' + (ORIGIN_X + RANGE) + '" y2="' + ORIGIN_Y + '"'
    + ' stroke="rgba(220,80,80,0.55)" stroke-width="0.8"/>');
  /* Y 轴(红) */
  lines.push('<line x1="' + ORIGIN_X + '" y1="' + (ORIGIN_Y - RANGE) + '" x2="' + ORIGIN_X + '" y2="' + (ORIGIN_Y + RANGE) + '"'
    + ' stroke="rgba(220,80,80,0.55)" stroke-width="0.8"/>');

  /* 原点标记(黄色小圆) */
  lines.push('<circle cx="' + ORIGIN_X + '" cy="' + ORIGIN_Y + '" r="1.2"'
    + ' fill="rgba(200,176,64,0.8)"/>');

  /* ±15 边界框(橙色虚线) */
  var bx = ORIGIN_X - RANGE, by = ORIGIN_Y - RANGE, bw = RANGE * 2, bh = RANGE * 2;
  lines.push('<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + bh + '"'
    + ' fill="none" stroke="rgba(200,140,60,0.35)" stroke-width="0.7" stroke-dasharray="3 2"/>');

  gridSvg.innerHTML = lines.join('\\n');

  /* ── 3. 更新信息条 ── */
  var info = [];
  info.push('校验: ' + VALID_MSG);
  if (renderErr) info.push('渲染错误: ' + renderErr);
  info.push('');
  info.push('region: ' + (REGION || '(未指定)') + '  ·  mood: ' + (MOOD || '(未指定)'));
  info.push('原点 (0,0) → 画布位置 (' + ORIGIN_X + ', ' + ORIGIN_Y + ')  ·  1 art-spec 单位 = 1 viewBox 像素');
  info.push('物件 slot: present-svg 单物件落点 (' + ORIGIN_X + ',' + ORIGIN_Y + ')  ·  ±15 单位边界 = 橙色虚线框');
  if (typeof ART_SPEC === 'string') {
    info.push('预设: "' + ART_SPEC + '"(内置 ART_PRESETS)');
  } else if (Array.isArray(ART_SPEC)) {
    info.push('图元数: ' + ART_SPEC.length
      + '  图元: ' + ART_SPEC.map(function (p) { return p && p.shape ? p.shape : '?'; }).join(', '));
  }
  document.getElementById('info').textContent = info.join('\\n');
})();
</script>
</body>
</html>`;

  // 8. 输出
  if (outputArg) {
    const absOut = path.resolve(outputArg);
    fs.writeFileSync(absOut, html, 'utf8');
    process.stderr.write('[art-spec-preview] 已写入: ' + absOut + '\n');
  } else {
    process.stdout.write(html);
  }

})().catch(function (e) {
  process.stderr.write('[art-spec-preview] 意外错误: ' + e.message + '\n' + e.stack + '\n');
  process.exit(1);
});
