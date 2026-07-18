#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   assembly-probe.mjs — 零依赖「装配探针」(类型无关运行时闸)
   ════════════════════════════════════════════════════════════════════════
   把一个**源 index.html**(带 <script src> 的模块化游戏,非 build 单文件)在 Node 里
   「装配着跑到 view()」,抓 `node -c`/graph-audit/build-schema 都查不到的**运行时装配错**:
   语法合法但 API 接不上(如 `A.createEngine is not a function`、工厂名臆造、模块没注册)。

   ── 为什么零依赖能行(靠引擎三个既有性质,无需 jsdom)──────────────────────
   1. 用 `vm` 把每个 <script src> 源**按序** eval 进同一 context;context 里无 `module`,
      故 UMD 走 `else (global.Amatlas=…)` 分支 → 像浏览器一样累积全局(`window.Amatlas.*`)。
   2. context 的 `document.querySelector/getElementById` **恒返回 null**;三个 presenter
      在「无插槽」时全**优雅退化**(`present-dom`:`if(!box)return`;svg/audio:容器 null → no-op),
      故首帧 render 不碰真 DOM 也不崩。**前提**:presenter 必须保持「无插槽优雅退化」(设计原则)。
   3. `view()` 在核心层、**不碰 DOM**,故能验「首屏有没有内容/入口」。

   ── 分级(沿用 graph-audit 的 [确认][P0] / [可疑][P1];见 docs/s11-c-assembly-probe-design.md)──
   · **[确认][P0] 装配崩/运行时崩 → 退出码 1(硬,零误报)**:某 <script> eval 抛 / `Amatlas.createEngine`
     非函数 / `view()` 抛错 / **浅层自动游玩走步撞运行时 NaN 或抛错(④)**。都是确定性 bug(Haiku `game.js:23`
     的 `A.createEngine is not a function`、或 showcase 走 1 步 `S.stamina-=1` 而 stamina 未初始化 → NaN,均属此类),必须修。
   · **空渲染 / 起点死局(③④,design-principles §6a)**:boot 不崩,但首屏 `view.body` 空 → [可疑][P1](可能是有意开场白);
     **起点 `actions` 空 → [确认][P0]**(从 world.start 全新跑,第一屏就无任何选项 = 死局,不可能有意);拿不到 `window._engine` → [可疑][P1](无法验内容,不硬拦)。
   · **挂载点缺失(⑤,静态;design-principles §6a/§6b)**:`game.js` 挂了带 `slot`(或省略 slot 用内部默认)的呈现器/插件、或用了 DomPresenter,但 `index.html` 没有对应的 `id`(挂载点)→ 该能力**静默失效**(引擎找不到挂载点不报错只 no-op,showcase 把 minimap/成就/状态条/重开写没的根因)。**核心挂载点 `#look`/`#choices` 缺 → [确认][P0]**(没内容 / 没法操作 = 不可玩);其余(状态/地图/插件位)→ [可疑][P1](可能有意精简)。
   · **不验**(留 `--smoke` / 人工):真实 DOM 渲染、CSS 布局、出画出声、插槽视觉。

   ── 边界 ──────────────────────────────────────────────────────────────────
   这是「逻辑装配闸」,不是「完整视觉/运行时闸」。它主要覆盖脚本装配、首屏 View、挂载点和浅层自动游玩;
   真实 DOM 视觉/交互/出声仍需 `node pipeline/build/build.mjs <index.html> --smoke`(jsdom,即装即删)或真浏览器。
   提示:game.js 暴露 `window._engine = engine;` 可启用 P1 首屏内容检查(demo 皆如此)。

   退出码:0 = 无 P0(通过;P1 仅警告);1 = 有 P0(装配崩,需修);2 = 用法错。
   既可 CLI(`node assembly-probe.mjs <index.html>`),也可 `import { runProbe }` 复用。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { pathToFileURL, fileURLToPath } from 'url';

// 引擎版本戳(易用性审计批):从同包 engine-core 源抓 AMATLAS_VERSION → 报告头打印,端用户跑探针即知包版本。
const PROBE_DIR = path.dirname(fileURLToPath(import.meta.url));
function engineVersion() {
  try {
    const src = fs.readFileSync(path.join(PROBE_DIR, '../runtime/engine-core.js'), 'utf8');
    const m = src.match(/AMATLAS_VERSION\s*=\s*'([^']+)'/);
    if (m) return (m[1].charAt(0) === '_') ? 'dev' : m[1];
  } catch (e) { /* 拿不到 → unknown */ }
  return 'unknown';
}

// 极薄元素 stub:presenter 在 querySelector=null 时本就 return,createElement 极少被走到;
// 仍给够字段(textContent/className/appendChild/classList/setAttribute…)以防个别路径触达。
function makeEl() {
  const e = {
    textContent: '', innerHTML: '', className: '', value: '', style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    appendChild() { return e; }, removeChild() { return e; }, insertBefore() { return e; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, children: []
  };
  let oc = null; Object.defineProperty(e, 'onclick', { get() { return oc; }, set(v) { oc = v; } });
  return e;
}

// 极简 window/document context:querySelector 恒 null(→ presenter 优雅退化);无 AudioContext。
function makeContext() {
  const doc = {
    readyState: 'complete',
    querySelector() { return null; }, getElementById() { return null; },
    querySelectorAll() { return []; },
    createElement() { return makeEl(); }, createTextNode(t) { return { textContent: t }; },
    addEventListener() {}, removeEventListener() {},
    head: makeEl(), body: makeEl()
  };
  const mem = {};
  const storage = {
    getItem(k) { return k in mem ? mem[k] : null; },
    setItem(k, v) { mem[k] = String(v); }, removeItem(k) { delete mem[k]; },
    clear() { for (const k in mem) delete mem[k]; }, get length() { return Object.keys(mem).length; }
  };
  const noop = () => {};
  const s = {
    document: doc, localStorage: storage,
    console: { log: noop, warn: noop, error: noop, info: noop },
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0, cancelAnimationFrame: noop,
    btoa: (s2) => Buffer.from(String(s2), 'binary').toString('base64'),
    atob: (s2) => Buffer.from(String(s2), 'base64').toString('binary')
  };
  s.window = s; s.globalThis = s; s.self = s;
  return s;
}

function attrsOf(raw) {
  const attrs = {};
  raw.replace(/([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g, function (_m, key, dq, sq, bare) {
    attrs[String(key).toLowerCase()] = dq != null ? dq : (sq != null ? sq : (bare != null ? bare : ''));
    return '';
  });
  return attrs;
}
function cleanLocalRef(ref) { return String(ref || '').split('#')[0].split('?')[0]; }
function isExternalRef(ref) { return /^(?:https?:)?\/\//i.test(ref) || /^data:/i.test(ref); }

// 抽 index.html 的 <script src> 顺序；HTML 合法的双引号、单引号、裸属性都支持。
function scriptSrcs(html) {
  const out = [];
  html.replace(/<script\b([^>]*?)>/gi, function (_tag, raw) {
    const src = attrsOf(raw).src;
    if (src) out.push(src);
    return '';
  });
  return out;
}

function linkedCssText(html, dir, p1) {
  let css = '';
  html.replace(/<link\b([^>]*?)>/gi, function (_tag, raw) {
    const attrs = attrsOf(raw);
    const rel = String(attrs.rel || '').toLowerCase().split(/\s+/);
    const href = attrs.href || '';
    if (rel.indexOf('stylesheet') === -1 || !href || isExternalRef(href)) return '';
    try { css += '\n' + fs.readFileSync(path.join(dir, cleanLocalRef(href)), 'utf8'); }
    catch (e) { p1.push(`stylesheet 读不到:${href}——source 探针无法检查这份 CSS;build 会 fail-closed。`); }
    return '';
  });
  return css;
}

// 提取 `Amatlas.boot( … )` 的实参文本(括号配对扫描)。boot 形态(S12)下,要从 manifest 探测启用了哪些能力,
//   只在【这段实参区】grep 键 → 避开 world.js 数据里的同名键(降误报)。字符串内括号极罕见、只影响 P1 不影响 P0。
function bootArgsText(src) {
  const m = /\b(?:Amatlas|A)\s*\.\s*boot\s*\(/.exec(src);
  if (!m) return '';
  let depth = 1, i = m.index + m[0].length; const start = i;
  for (; i < src.length && depth > 0; i++) { const c = src[i]; if (c === '(') depth++; else if (c === ')') depth--; }
  return src.slice(start, i - 1);
}

/* 主探针:返回 { p0:[…], p1:[…], skipped?:reason }。p0 非空 = 装配崩(硬);p1 = 警告(软)。 */
export function runProbe(indexPath) {
  const p0 = [], p1 = [];
  let html;
  try { html = fs.readFileSync(indexPath, 'utf8'); }
  catch (e) { return { skipped: '读不到 ' + indexPath }; }       // 降级:非游戏错 → 调用方 warn 不拦
  const srcs = scriptSrcs(html);
  if (!srcs.length) return { skipped: 'index.html 无 <script src>(可能已是 build 单文件,无需源装配探针)' };

  const dir = path.dirname(indexPath);

  // ⑤ 挂载点齐全性(静态,先于装配查):game.js 挂了带 slot 的呈现器/插件,index.html 却没对应 id
  //    → 该能力**静默失效**(引擎找不到挂载点不报错、只 no-op;showcase 把 minimap/成就/状态条/重开写没的根因)。P1 提醒。
  {
    const ids = new Set([...html.matchAll(/id\s*=\s*["']([^"']+)["']/g)].map(m => m[1]));
    const gameSrc = srcs.filter(s => !/^\.\.\//.test(s) && !/^https?:|^\/\//i.test(s))   // 游戏自己的脚本(world.js/game.js),排引擎 ../ 与外链
      .map(s => { try { return fs.readFileSync(path.join(dir, cleanLocalRef(s)), 'utf8'); } catch (e) { return ''; } }).join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');   // 剥注释:注释里提到的 Amatlas.boot(/createXxx(对照/示例/说明文字)不是真调用,否则 usesBoot/能力探测误判(showcase:horror 对照注释写 "Amatlas.boot(S12)" 被误判用 boot → boot.js 缺失误报)。同 graph-audit kindModuleIssues 的剥注释。
    // ── S12 能力探测(手写 grep 工厂 / boot 读 manifest;两形态走同一套判定)──────────────────
    //   boot 形态(game.js 用 `Amatlas.boot(WORLD, manifest)`)把工厂调用收进 preset 层 → 旧版只 grep `createXxx`
    //   会【失明】(挂载点/CSS 检查全不触发);而 index.html 仍手写、挂载点仍可能缺(round3/8)、CSS 接缝仍高频
    //   (round4/6/9)→ 不能丢。故:某能力是否在用 = 手写工厂名 OR boot manifest 启用。
    const hasScript = (re) => srcs.some((s) => re.test(cleanLocalRef(s)));
    const usesBoot = /\b(?:Amatlas|A)\s*\.\s*boot\s*\(/.test(gameSrc);   // 认 Amatlas.boot( 与 A.boot(（A=window.Amatlas 别名）
    // 用 A.boot 装配但没引 preset/boot.js → window.Amatlas.boot 未定义、game.js 一跑就「A.boot is not a function」崩白屏
    //   (S12-4 showcase 实测:模型照 game.js 模板用 A.boot、却漏抄 index.html 的 boot.js script)。静态早抓 + 明确指引(比 eval 的通用崩信息更早更准)。
    if (usesBoot && !hasScript(/preset\/boot/)) p0.push('装配崩:game.js 用 A.boot(...) 装配,但 index.html 没用 script 标签加载 preset/boot.js → window.Amatlas.boot 未定义、game.js 一跑就「A.boot is not a function」、白屏。在 index.html 加载 preset/boot.js(放 world.js 之后、game.js 之前)。');
    // audio.music 由 compose-music.js 解析；present-audio 会惰性回查 Amatlas，故依赖可前加载也可后加载，
    // 但整页漏引会在真浏览器首次发声时 fail-loud。本探针没有 AudioContext，走不到该路径，静态补抓。
    // 自定义音频呈现器可合法自行消费 music → 有合法反例，按 §11.2 只报 P1，不升 P0。
    // 只在同一 audio 对象的浅层正文内找 music；遇到首个 `}` 即停，避免把后续 credits.music 跨对象拼进来。
    // 复杂变量引用仍由真机 presenter 的 fail-loud 兜底，本静态 P1 不假装完整 JS 解析器。
    const usesMusic = /\baudio\s*:\s*\{[^}]*\bmusic\s*:/.test(gameSrc);
    if (usesMusic && !hasScript(/compose-music/)) {
      p1.push('audio.music 已声明但 index.html 没加载 presenters/compose-music.js → 内置 present-audio 真机首次发声会抛「需要 presenters/compose-music.js」。用 script 标签加载它（present-audio.js 之前或之后均可）；若你用自定义音频呈现器自行消费 music 可忽略本条。');
    }
    // v14:audio.music 第三形态 {midi:'<base64>'} 还需要 presenters/midi-music.js。
    if (/music\s*:\s*\{[^}]*\bmidi\s*:/.test(gameSrc) && !hasScript(/midi-music/)) {
      p1.push('audio.music 用了 {midi:...}(MIDI 导入)但 index.html 没加载 presenters/midi-music.js → 真机首次渲染即抛「需要 presenters/midi-music.js」。在 present-audio.js 之前加该 script;若你用自定义音频呈现器自行消费 midi 可忽略本条。');
    }
    const manifestText = usesBoot ? bootArgsText(gameSrc) : '';                 // 仅 boot 实参区 → 避开 world 数据同名键
    const onKey = (k) => new RegExp('\\b' + k + '\\s*:\\s*(?!false\\b)').test(manifestText);  // manifest 里 key: 非 false
    const useDom  = /createDomPresenter/.test(gameSrc) || usesBoot;             // boot 必挂 DomPresenter
    const useSvg  = /createSvgPresenter/.test(gameSrc) || (usesBoot && hasScript(/present-svg/) && !/svg\s*:\s*false/.test(manifestText));  // boot 的 svg 默认开但【宽容】:没引 present-svg.js 就不挂(不抛)→ 没引则不报缺 #scene
    const useSave = /createSavePlugin/.test(gameSrc) || onKey('save');          // manifest 要 save 却没引 save.js → boot fail-loud 抛(eval 阶段 P0),不归这里
    const useMap  = /createMinimapPlugin/.test(gameSrc) || onKey('minimap');
    const useAch  = /createAchievementPlugin/.test(gameSrc) || /\bachievements?\s*:\s*(?!false\b)/.test(manifestText);
    const useInv  = /createInventoryPlugin/.test(gameSrc) || onKey('inventory');     // 物品栏插件默认 slot 也是 #plugin-bar(只用 inventory、不用 save/ach 时也得报缺 #plugin-bar)
    const useReset = onKey('reset');                                                  // ↻ 重开插件(ResetPlugin)也挂 #plugin-bar——对称兄弟(save/minimap/achievement/inventory/reset 同族挂 #plugin-bar);漏它=旧 maze3d 示例 reset:true 但缺 #plugin-bar 静默消失没被抓的根因(lessons 136 接缝)

    // 显式配的 slot(`slot:'#x'`/`buttonSlot:'#x'`,两形态都可能写)= 强意图 → 缺 = 拼错真 bug → 升 P0(改 A)。
    const explicit = new Set([...gameSrc.matchAll(/(?:slot|buttonSlot)\s*:\s*["']#([\w-]+)["']/g)].map((m) => m[1]));
    // 核心挂载点(缺=不可玩)P0;辅助/缺省挂载点(缺=可能有意精简、优雅退化)P1。
    const core = new Set(), aux = new Set();
    if (useDom) { ['look', 'choices'].forEach((x) => core.add(x)); ['mapname', 'place', 'status'].forEach((x) => aux.add(x)); }
    if (useSvg) aux.add('scene');
    if (useSave) aux.add('plugin-bar');
    if (useInv) aux.add('plugin-bar');
    if (useReset) aux.add('plugin-bar');
    if (useMap) aux.add('plugin-minimap');
    if (useAch) aux.add('plugin-overlay');

    const missCore = [...core].filter((id) => !ids.has(id));
    const missExplicit = [...explicit].filter((id) => !ids.has(id) && !core.has(id));             // 显式 slot 缺(非核心)→ P0(改 A)
    const missAux = [...aux].filter((id) => !ids.has(id) && !explicit.has(id) && !core.has(id));  // 缺省挂载点缺 → P1
    if (missCore.length) p0.push(`核心挂载点缺失:index.html 没有 ${missCore.map((x) => '#' + x).join(' / ')} —— DomPresenter 缺 #look 就没内容、缺 #choices 就没法操作 → 游戏不可玩。必须在 <body> 补上(照 examples/text-adventure-demo/index.html 的完整骨架)。`);
    if (missExplicit.length) p0.push(`显式 slot 挂载点缺失:game.js/manifest 明确配了 slot ${missExplicit.map((x) => '#' + x).join(' / ')},但 index.html 没有对应 id —— 显式 slot=强意图,拼错/漏挂 = 该能力**静默失效**。在 <body> 补对应挂载点 id(或核对 slot 拼写)。`);
    if (missAux.length) p1.push(`挂载点缺失:index.html 没有 ${missAux.map((x) => '#' + x).join(' / ')} —— 挂的呈现器/插件找不到挂载点会**静默失效**(功能消失但不报错)。照 examples/text-adventure-demo/index.html 补全 <body> 挂载点 id。`);

    const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 悬空按钮(showcase round4 问题①;A 类事后校验 · P1):index.html 静态 <button id=X>,但 game.js 从不引用 X
    //   → 点了没反应(模型自造存档/地图/成就图标按钮却没接 onclick;真正的控件由插件渲染进 slot)。
    //   **只校验形式正确性**(留了交互控件就得接上),不限制能加什么 UI → 不伤创造力;P1 提醒(有意的纯装饰 button 可忽略)。
    const btnIds = [...html.matchAll(/<button\b[^>]*\bid\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
    const dangling = btnIds.filter(id => !new RegExp('getElementById\\(\\s*["\']' + reEsc(id) + '["\']|["\']#' + reEsc(id) + '(?![\\w-])').test(gameSrc));
    if (dangling.length) p1.push(`悬空按钮:index.html 的 ${dangling.map(x => '#' + x).join(' / ')} 是 <button> 但 game.js 从不引用(没接 onclick)→ 点了没反应。`
      + `存档/小地图/成就的控件由插件**自己**渲染进 slot(#plugin-bar/#plugin-minimap/#plugin-overlay)——别自造图标按钮;要自定义就在 game.js 把它接到插件 API / engine。`);

    // CSS class 不匹配(showcase round4 问题②;A 类事后校验 · P1):呈现器/插件输出固定 class,作者 CSS 用了高频"近似误写"
    //   却无正确 class → 样式静默不命中、元素裸显示(present-dom 输出 button.choice,模型常写 .choice-btn)。
    //   **只校验选择器对不对得上呈现器输出**(技术接口,像 API 名),不限制样式怎么设计 → 不伤创造力;P1。
    const linkedCss = linkedCssText(html, dir, p1);
    const styleText = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n') + '\n' + linkedCss + '\n' + gameSrc;
    const classRe = (cls) => new RegExp('\\.' + reEsc(cls) + '(?![\\w-])');         // 精确 class(右值:呈现器/插件真实输出名)
    const nearRe = (cls) => new RegExp('\\.' + reEsc(cls) + '[\\w-]*');             // 近似 class(左值:作者误写,含复合名如 .achievement-toast — showcase round6:`(?![\\w-])` 漏了 .achievement-toast)
    // present-dom 选项按钮:核心呈现器**不自带样式**(选项=游戏内容、作者创作),误写 class → 裸显示(按钮仍可点)→ P1。
    //   注(§11 治本,2026-06):插件控件(.amatlas-plugin-btn/.amatlas-achievement/.amatlas-minimap 等)的「误写名 / 完全没写」检查**已删** ——
    //   save/minimap/achievement 插件 install 时**自带默认样式**(:where 零特异、var fallback,作者可覆盖换皮),无论作者写不写/写错都不裸 → 接缝消失。只留 present-dom 选项 .choice(它不自带、是创作)。
    [
      { wrong: 'choice-btn', right: 'choice', what: 'present-dom 选项按钮(button.choice)' },
      { wrong: 'choice-button', right: 'choice', what: 'present-dom 选项按钮(button.choice)' }
    ].forEach((c) => {
      if ('need' in c && !c.need) return;   // 该插件没用(手写没 grep 到工厂 / boot manifest 没启用)→ 不查它的输出 class
      if (nearRe(c.wrong).test(styleText) && !classRe(c.right).test(styleText)) {
        const msg = `CSS class 不匹配:CSS 写了 \`.${c.wrong}\` 类,但 ${c.what} 的实际 class 是 \`.${c.right}\` → 样式不命中、控件裸显示。改用 \`.${c.right}\`(class 逐字照抄 examples/text-adventure-demo/index.html,别自造名)。`;
        (c.p0 ? p0 : p1).push(msg);
      }
    });

    // 插件控件类**完全没写**(非写错名,是压根没样式)→ 工具按钮/面板/列表裸显示(round9 haiku 根因:模型自写 CSS、没抄 §5 的 .amatlas-* 样式块)。
    //   旧版只查"写错近似名",漏了"一个都没写"。**仅当页面真有 <style>**(写了 CSS 却漏插件类才算陷阱;裸夹具/无样式页不查)+ 按插件用量 gate + 每插件只查一个**主类**(长尾类可省)
    //   → demo 全有不触发、horror-demo(不用插件)被 gate 掉、纯 mount-point 测试夹具(无 <style>)不触发。P1(裸样式=退化非崩)。
    if (/<style[^>]*>[\s\S]*?\S[\s\S]*?<\/style>/i.test(html) || linkedCss.trim()) {
      // 注(§11 治本):插件控件(.amatlas-*)的「完全没写样式」检查已删 —— 插件 install 自带默认样式,无论写不写都不裸。只留 present-dom 选项 .choice(核心呈现器不自带)。
      // 核心呈现器选项 class(showcase 实测:haiku 把 .choice 误写成 .amatlas-link —— 给核心 class 加了只有插件才有的 amatlas- 前缀)。
      //   present-dom 输出 button.choice / 锁定项 .choice.locked;CSS 没 .choice 样式 → 选项裸 + **locked 选项不灰显**(present-dom 给 locked 不接 onclick、灰显全靠 .choice.locked)→ 玩家以为能点、**点了没反应**。
      //   普适查"核心类有没有样式"(不枚举误写名,比旧版只查 .choice-btn 覆盖广);useDom gate + 有 <style>;P1(裸/困惑,非崩)。demo 等写 .choice → 命中不报。
      if (useDom && !classRe('choice').test(styleText)) {
        p1.push('选项按钮无样式:present-dom 输出 `button.choice`(锁定项 `.choice.locked`),CSS 里却找不到 `.choice` 的样式 → 选项裸显示,且 **locked 选项不灰显、点了没反应**(present-dom 不给 locked 按钮接 onclick、灰显全靠 `.choice.locked`)。选项样式写 `.choice`(**核心呈现器输出 .choice/.status-item/.lock-hint 都无 amatlas- 前缀;只有 save/minimap/achievement 插件才带 amatlas-**)。照抄 examples/text-adventure-demo/index.html。');
      }
    }
  }

  const ctx = makeContext();
  vm.createContext(ctx);
  for (const src of srcs) {
    if (/^https?:|^\/\//i.test(src)) continue;                   // 外部脚本跳过(离线探针不取网)
    const f = path.join(dir, cleanLocalRef(src));
    let code;
    try { code = fs.readFileSync(f, 'utf8'); }
    catch (e) { p1.push(`脚本读不到:${src}(<script src> 指向的文件不存在;若关键脚本缺失,下方 createEngine 检查会兜底为 P0)`); continue; }
    try { vm.runInContext(code, ctx, { filename: f }); }
    catch (e) {
      p0.push(`装配崩:加载 ${src} 时抛错 — ${e && e.message}`);  // eval 抛 = 确定性装配错
      return { p0, p1 };                                          // 后续依赖它,停
    }
  }

  // ① 命名空间就绪(boot 后 Amatlas.createEngine 应是函数)
  const A = ctx.window && ctx.window.Amatlas;
  if (!A || typeof A.createEngine !== 'function') {
    p0.push('装配崩:window.Amatlas.createEngine 不是函数(引擎核心未加载 / 命名空间未就绪 / boot 未跑通)');
    return { p0, p1 };
  }
  // ② 拿引擎实例(约定 window._engine);拿不到 → P1(无法验内容,不硬拦)
  const eng = ctx.window._engine;
  if (!eng || typeof eng.view !== 'function') {
    p1.push('未验首屏渲染:没找到 window._engine(在 game.js 里 `window._engine = engine;` 即可启用首屏内容检查)');
    return { p0, p1 };
  }
  // ③ view() 不抛(抛=P0)+ 首屏有内容/入口(空=P1)
  let view;
  try { view = eng.view(); }
  catch (e) { p0.push(`装配崩:engine.view() 抛错 — ${e && e.message}`); return { p0, p1 }; }
  const body = view && view.view && Array.isArray(view.view.body) ? view.view.body.length : 0;
  const acts = view && Array.isArray(view.actions) ? view.actions.length : 0;
  if (body === 0) p1.push('空渲染:首屏 view.body 为空(可能是有意的开场;请 --smoke/人工确认)');
  // ④ design-principles §6a:这是**起点**首屏(probe 从 world.start 全新跑)。起点无任何动作 = 第一屏就死局,
  //    不可能是有意的"结局式开场"(玩家根本没法开始)→ P0。非起点的"走到无出口"由下方自动游玩 break 处理(可能是结局,不在此 P0)。
  if (acts === 0) p0.push('起点死局:world.start 节点首屏无任何动作/选项 —— 玩家第一屏就卡死(不可能是有意的结局)。给起点至少一个可点出口/动作。');

  // ④ 浅层自动游玩:沿"无条件可点"动作贪心走最多 N 步,撞**运行时 NaN / 抛错**即报(P0)。
  //    首屏 OK ≠ 全程 OK:showcase 首屏正常,走 1 步 events 里 `S.stamina -= 1` 而 stamina 没在 initState
  //    初始化 → undefined-1 = NaN → 此后 `S.stamina>=1` 门控恒 false → soft-lock。NaN 几乎只来自未初始化
  //    字段参与算术(零误报)→ P0。静态可达性交 graph-audit;此处抓运行时:NaN、view/apply 抛错,
  //    + **原地打转 soft-lock**(round7 #5):优先走 move 出口前进,若停在「声明了出口却走不出」的节点、
  //    连续 ≥8 步只能原地动作(如反复检定)→ P0。无条件出口必可点(不会误 stuck);会 stuck 的「无保底出口」graph-audit 也已 P0。N=30 上限防 A⇄B 循环。
  function findNaN(o, p, seen) {
    if (o == null || typeof o === 'string' || typeof o === 'boolean') return null;
    if (typeof o === 'number') return (o !== o) ? p : null;             // NaN !== NaN
    if (typeof o !== 'object' || seen.indexOf(o) >= 0) return null;
    seen.push(o);
    for (const k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      const hit = findNaN(o[k], p ? p + '.' + k : k, seen);
      if (hit) return hit;
    }
    return null;
  }
  let stuckKey = null, stuckCount = 0;   // round7 #5 兜底:连续停在同一「有出口却走不出」节点的步数
  for (let step = 0; step < 30; step++) {
    const nan = eng.state ? findNaN(eng.state, 'state', []) : null;
    if (nan) {
      p0.push(`运行时 NaN:${nan} = NaN(自动游玩第 ${step} 步)。几乎一定是未初始化的自定义数值参与算术`
        + `(如 \`S.stamina -= 1\` 而 stamina 没在 world.initState 给初值)→ 此后数值门控恒 false、soft-lock。用 world.initState 给初值。`);
      break;
    }
    let snap;
    try { snap = eng.view(); }
    catch (e) { p0.push(`运行时崩:自动游玩第 ${step} 步 view() 抛错 — ${e && e.message}`); break; }
    const open = (snap.actions || []).filter(a => !a.locked);
    if (!open.length) break;                                             // 无任何可点(结局/死局)→ 停;死局交 graph-audit
    const moves = open.filter(a => a.to != null);                        // 可点移动出口(真正前进的动作)
    if (!moves.length) {
      // 无可点移动出口、只剩原地动作(检定/纯 act)。若节点**声明了出口**却走不出 → 可能 soft-lock(round7 #5)。
      const pos = snap.pos || (eng.state && eng.state.pos) || {};
      const node = eng.world && eng.world.maps && eng.world.maps[pos.map] && eng.world.maps[pos.map].nodes[pos.node];
      // 只算**带 to 的移动出口**:纯动作 link(无 to,如「等待」计数器)是合法的原地节点、非 soft-lock(零误报关键)。
      const declared = node && ((node.links || []).some(l => l && l.to != null) || (node.exits || []).some(e => e && e.to != null));
      // cutscene 的 cutscene:next 是 runtime-owned 有界进度：末拍才暴露 links 时，probe 必须逐拍 apply。
      // 只认当前 kind + 精确 action id，不能把普通原地 act 或全部 cutscene 一概豁免。
      const cutsceneNext = node && node.kind === 'cutscene' && open.find(a => a && a.id === 'cutscene:next');
      if (cutsceneNext) {
        stuckKey = null; stuckCount = 0;
        try { eng.apply(cutsceneNext); }
        catch (e) { p0.push(`运行时崩:自动游玩第 ${step} 步 apply(「${cutsceneNext.label}」)抛错 — ${e && e.message}`); break; }
        continue;
      }
      // round13:迷宫(kind:'maze')节点移动是【节点内格导航】(pos.node 不变=正常)、对外出口在 node.maze.cells[*].exit、
      //   探针贪心走法不会解迷宫(找不到出口格)→ 不适用"原地打转 soft-lock"启发,否则转几步必误报。
      //   迷宫的结构可达性由 graph-audit 读 maze.cells 出边校验;探针对迷宫仍验崩溃/NaN(本块之外)。
      const isMaze = node && (node.kind === 'maze' || node.maze);
      if (declared && !isMaze) {
        const key = pos.map + '/' + pos.node;
        if (key === stuckKey) stuckCount++; else { stuckKey = key; stuckCount = 1; }
        if (stuckCount >= 8) {                                           // 点了 8 步原地动作仍无移动出口 → 走不出去
          p0.push(`soft-lock:节点 '${key}' 声明了出口(links/exits)但自动游玩点了 ${stuckCount} 步原地动作(如反复检定)仍无任何可点移动出口 —— 玩家走不出去。`
            + `检查出口是否被门控全锁(无保底出口)、或 encounter 误用了只渲染检定、把移动出口吞掉的写法。`);
          break;
        }
      }
      try { eng.apply(open[0]); }                                        // 点原地动作(检定),尝试推进/解锁出口
      catch (e) { p0.push(`运行时崩:自动游玩第 ${step} 步 apply(「${open[0].label}」)抛错 — ${e && e.message}`); break; }
      continue;
    }
    stuckKey = null; stuckCount = 0;                                     // 有移动出口 → 前进、清 stuck
    try { eng.apply(moves[0]); }
    catch (e) { p0.push(`运行时崩:自动游玩第 ${step} 步 apply(「${moves[0].label}」)抛错 — ${e && e.message}`); break; }
  }
  return { p0, p1 };
}

function main() {
  const file = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!file) { console.error('用法: node assembly-probe.mjs <game/index.html>'); process.exit(2); }
  const r = runProbe(file);
  console.log('\n=== 装配探针(零依赖运行时闸): ' + file + '  (引擎 ' + engineVersion() + ') ===');
  if (r.skipped) { console.log('  ⚠️  跳过(非游戏错误,放行):' + r.skipped); process.exit(0); }
  r.p0.forEach(m => console.log('  [确认][P0] ' + m));
  r.p1.forEach(m => console.log('  [可疑][P1] ' + m));
  if (!r.p0.length && !r.p1.length) console.log('  ✅ 装配通过:createEngine 就绪、boot 不崩、首屏有内容与入口。');
  console.log(`\n结果: P0=${r.p0.length} P1=${r.p1.length}  → ` +
    (r.p0.length ? '有 P0(装配崩/控件裸显示/死局等,退出 1、需修)' : '通过(P1 仅警告、不拦)'));
  process.exit(r.p0.length ? 1 : 0);                              // P0→1 硬;P1→0 软
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
