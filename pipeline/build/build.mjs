#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   build.mjs — 零依赖单文件构建器 + 硬准入门(Amatlas pipeline/build)
   ════════════════════════════════════════════════════════════════════════
   把「模块化游戏源码」(index.html + 它的 <script src> 图:核心 + 模块运行时 +
   世界数据 + 启动胶水)内联成一个 all-in-one HTML(离线双击即玩、无服务器)。
   对标原则④:开发期多文件、发布期极致轻量单文件(思路同 vite-plugin-singlefile,
   但走更轻的自写零依赖内联器,不引重型工具链)。

   ▍位置:pipeline/ 在 engine 内(与 core/modules 平级)——它随引擎发布,端用户用它
     把自己的游戏构建成单 HTML。故本文件**必须零依赖**(发布包 node_modules 须为 0)。

   ▍硬准入门(对标 prior-art A · G-KMS「生成→验证准入(可加载+schema),不过则丢弃」):
     inline 前先「过门」,**不过则拒绝产出 + 非零退出**——别把不可加载的数据打成成品。
       ① 复用 core/tooling/graph-audit 的 auditWorld:死链/坏 start = P0 → 拒绝;
          可达/死胡同 = P1/P2 可疑 → 仅警告(语义见该工具)。
       ② 补 graph-audit 不查的**薄 schema-shape**:每节点有字符串 kind;每 link 有
          label 且至少有 to/run 之一。**有意不重造重型 schema 引擎**(与 graph-audit
          冗余,见 prior-art G「防冗余」);「未知 kind 没人接」属运行时(契约 dispatch
          在 view 时,见 lessons ⑪)→ 交给可选的 --smoke 探针,不在静态门里硬判。
     **失败即拒绝、不静默修复**(fail-closed):宁可报明确错,也不偷偷补默认而蒙混过门。

   ▍可加载探针(jsdom)= **可选** `--smoke`:静态门(schema/graph)烤进本零依赖构建器、
     恒为硬门;jsdom 是即装即删的重型测试依赖,故可加载探针做**可选**步骤(沿用「jsdom
     绝不入库/打包」纪律)。这是 S5 同型取舍——「理想(探针也进门)让位硬约束(零依赖
     可发布)」,取可行子集(用户定:静态门硬烤入 + 探针可选)。

   用法:  node build.mjs <game/index.html> [out.html] [--smoke]
           缺省 out = <源目录>/dist/index.html;--smoke 需就近装 jsdom(跑完即删)。
   退出码:0 成功;1 准入门拒绝 / --smoke 失败;2 用法错误。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import { pathToFileURL, fileURLToPath } from 'url';
import { auditProject } from '../../core/tooling/graph-audit.mjs';

const require = createRequire(import.meta.url);

// ── 1. 内联:把 index.html 的本地 <script src> / stylesheet link 就地内联 ─────
//   经典外部 script 只在「恰有 src、无其它属性、标签体为空」时安全内联；单双/无引号、
//   大小写和属性空白只是语法差异，均支持。defer/async/type=module 等会改变执行时机/作用域，
//   非空 body 也有 fallback 语义——本零依赖构建器不静默删语义，统一 fail-closed 点名。
//   CSS 支持本地 <link rel="stylesheet" href="…">；远程 stylesheet 不抓网，继续作为非自包含资产 warn。
//   script 的内联、srcs/loadWorld 输入和 remaining 均从同一次标签解析派生，禁止再各用一条 regex 漂移。
function parseAttrs(raw) {
  const entries = [];
  const residue = String(raw || '').replace(/([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g, function (_m, key, dq, sq, bare) {
    entries.push({
      name: String(key).toLowerCase(),
      value: dq != null ? dq : (sq != null ? sq : (bare != null ? bare : ''))
    });
    return '';
  }).trim();
  return { entries, residue };
}
function attrsOf(raw) {
  const attrs = {};
  for (const entry of parseAttrs(raw).entries) attrs[entry.name] = entry.value;
  return attrs;
}
function cleanLocalRef(ref) { return String(ref || '').split('#')[0].split('?')[0]; }
function isExternalRef(ref) { return /^(?:https?:)?\/\//i.test(ref) || /^data:/i.test(ref); }
function stylesheetLinks(html) {
  const out = [];
  html.replace(/<link\b([^>]*?)>/gi, function (tag, raw) {
    const attrs = attrsOf(raw);
    const rel = String(attrs.rel || '').toLowerCase().split(/\s+/);
    if (rel.indexOf('stylesheet') !== -1 && attrs.href) out.push({ tag: tag, href: attrs.href });
    return '';
  });
  return out;
}
export function inlineHtml(indexPath) {
  const dir = path.dirname(indexPath);
  const srcs = [];
  const styles = [];
  const styleErrors = [];
  const scriptErrors = [];
  let remaining = 0;
  let html = fs.readFileSync(indexPath, 'utf8');

  html = html.replace(/<link\b([^>]*?)>/gi, function (tag, raw) {
    const attrs = attrsOf(raw);
    const rel = String(attrs.rel || '').toLowerCase().split(/\s+/);
    const href = attrs.href || '';
    if (rel.indexOf('stylesheet') === -1 || !href || isExternalRef(href)) return tag;
    const p = path.resolve(dir, cleanLocalRef(href));
    try {
      const css = fs.readFileSync(p, 'utf8').replace(/<\/style/gi, '<\\/style');
      styles.push(p);
      const media = attrs.media ? ' media="' + String(attrs.media).replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"' : '';
      return '<style data-amatlas-inline-css="' + href.replace(/"/g, '&quot;') + '"' + media + '>\n' + css + '\n</style>';
    } catch (e) {
      styleErrors.push('stylesheet 读不到:' + href + '(来自 ' + path.basename(indexPath) + ',构建必须内联本地 CSS 才能保持单 HTML)。');
      return tag;
    }
  });

  // 先剥 HTML 注释，避免文档注释里提到的 `<script src>` 被当成真实依赖；原注释仍原样留在产物。
  html = html.replace(/<!--[\s\S]*?-->|<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, function (tag, raw, body) {
    if (tag.slice(0, 4) === '<!--') return tag;
    const parsed = parseAttrs(raw);
    const attrs = {}, counts = {};
    for (const entry of parsed.entries) {
      attrs[entry.name] = entry.value;
      counts[entry.name] = (counts[entry.name] || 0) + 1;
    }
    if (!Object.prototype.hasOwnProperty.call(attrs, 'src')) return tag;   // 真内联脚本原样保留，不算外部依赖。
    const src = attrs.src;
    const extra = Object.keys(attrs).filter((name) => name !== 'src');
    const problems = [];
    if (!src) problems.push('src 不能为空');
    if (counts.src > 1) problems.push('src 属性重复');
    if (parsed.residue) problems.push('属性语法无法解析:' + parsed.residue);
    if (extra.length) problems.push('含暂不支持的额外属性 ' + extra.join('/'));
    if (String(body || '').trim()) problems.push('外部 script 标签体必须为空');
    if (isExternalRef(src)) problems.push('远程脚本不抓网、无法内联');
    if (problems.length) {
      remaining++;
      scriptErrors.push(`script 无法安全内联:${src || '(空 src)'} —— ${problems.join('; ')}。改成经典 \`<script src="…"></script>\`,或先由作者显式转换语义。`);
      return tag;
    }

    const p = path.resolve(dir, cleanLocalRef(src));
    let js;
    try {
      // 内联防体:JS 源里字面的脚本结束标签(如 look 正文写了 "</script>")会提前终止 <script> 块、
      //   整页从中断点开始裸奔(经典内联陷阱;boot.js 的 fail-loud 文案当年就为此改写)。HTML 规范
      //   认 "</script" 即收尾、与引号无关 → 统一转义为 "<\/script":在 JS 字符串/正则里语义不变
      //   ("\/"≡"/"),在代码位置本就非法 → 零行为差、根治。
      js = fs.readFileSync(p, 'utf8').replace(/<\/script/gi, '<\\/script');
    } catch (e) {
      remaining++;
      scriptErrors.push(`script 读不到:${src}(来自 ${path.basename(indexPath)},构建必须内联本地脚本才是单 HTML)。`);
      return tag;
    }
    srcs.push(p);                                                        // 只登记确实成功内联的脚本；loadWorld 与产物同源。
    return '<script>\n' + js + '\n</script>';
  });
  // replace 只会看见有闭合标签的 script；任何剩余带 src 的 script（含未闭合标签）都不是单文件产物。
  const leakedScripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(?:["'][^"']*["']|[^\s>]+)/gi)];
  if (leakedScripts.length) {
    remaining += leakedScripts.length;
    scriptErrors.push('仍残留 ' + leakedScripts.length + ' 个带 src 的 script（可能标签未闭合或语法不受支持），构建拒绝。');
  }
  const remainingStyles = stylesheetLinks(html).filter((l) => !isExternalRef(l.href)).length;
  // 引擎版本戳:从内联进来的 engine-core 源抓 AMATLAS_VERSION,写进产物顶部 HTML 注释。诊断价值——
  //   端用户把 dist/index.html 发回时,看顶部一行即知其引擎版本是否陈旧(根治 round9 送达盲区)。
  let version = 'unknown';
  const vm = html.match(/AMATLAS_VERSION\s*=\s*'([^']+)'/);
  if (vm) version = (vm[1].charAt(0) === '_') ? 'dev' : vm[1];
  //   产物首行 = 版本戳单行注释:A6 契约 + assembly-probe 等诊断按 `^<!-- Amatlas engine:` 读首行,勿改此格式。
  const versionComment = '<!-- Amatlas engine: ' + version + ' (构建产物;报 bug 时附上此行即可定位引擎版本) -->';
  // R3-1 MIT 合规:单 HTML 内联了引擎代码 = MIT 定义的「副本」,MIT 要求「版权声明 + 授权声明须含于所有副本」。
  //   注入 engine/LICENSE 原文作第二个 HTML 注释块(单一真相:版权主体在 LICENSE 改、产物自动跟随;打包期
  //   自动、作者零操作)。读不到 LICENSE(极少;引擎包必带)→ 退化为最小 SPDX 行,不因此拒绝构建。
  let licenseText = '';
  try { licenseText = fs.readFileSync(fileURLToPath(new URL('../../LICENSE', import.meta.url)), 'utf8').trim(); } catch (e) { /* 读不到 → 最小声明 */ }
  const licBody = licenseText
    ? 'SPDX-License-Identifier: MIT\n\n' + licenseText + '\n\n以上许可证覆盖内联进本文件的 Amatlas 引擎代码;游戏内容(剧情/美术/音频/世界数据)版权归其作者、不受本声明约束。'
    : 'SPDX-License-Identifier: MIT — Amatlas engine (MIT License). 游戏内容版权归其作者。';
  const licenseComment = '<!--\n' + licBody.split('\n').map((l) => l ? '  ' + l : '').join('\n') + '\n-->';
  html = versionComment + '\n' + licenseComment + '\n' + html;
  return { html, srcs, styles, styleErrors, scriptErrors, remaining, remainingStyles, version };
}

// ── 2. 找世界数据:require 各内联脚本,取导出 {start,maps} 的那个 ───────────────
//   浏览器脚本在 node 里:engine-core/renderer/present-dom 的 UMD 返回各自模块(不匹配),
//   game.js 引用 document 抛错(被吞),唯 world.js(UMD)返回 {start,maps} → 命中。
//   纯 node、零依赖;throw 一律吞掉跳过(只关心「能不能 require 出世界数据」)。
export function loadWorld(srcs) {
  const found = [];
  for (const p of srcs) {
    let m;
    try {
      // buildToFile 可在同一进程重复调用；每次必须审磁盘当前源码，不能让旧 world cache
      // 通过准入门、随后却把新坏源码内联进成品。
      delete require.cache[require.resolve(p)];
      m = require(p);
    } catch (_e) { continue; }
    if (m && typeof m === 'object' && m.start && m.maps) found.push({ p: p, world: m });
  }
  return found;
}

// ── 3. 硬准入门:graph-audit(图)+ 薄 schema-shape(节点/链接形状)──────────────
//   返回 { errors:[硬错→拒绝], warns:[P1/P2 可疑→仅提醒] }。
export function gateWorld(world, worldSource, gameSource, hasGameJs) {
  const errors = [];
  const warns = [];

  // 3a. 复用 graph CLI 同一个完整项目裁决：对象图 + world/game 源文本 P0。
  const audit = auditProject(world, worldSource, gameSource, hasGameJs);
  for (const issue of audit.issues) {
    if (issue.indexOf('[P0]') !== -1) errors.push(issue);
    else warns.push(issue);
  }

  // 3b. graph-audit 不查的薄 schema-shape:kind 必备 + link 形状合法。
  const maps = (world && world.maps) || {};
  for (const mapId of Object.keys(maps)) {
    const nodes = (maps[mapId] && maps[mapId].nodes) || {};
    for (const nodeId of Object.keys(nodes)) {
      const key = mapId + '/' + nodeId;
      const node = nodes[nodeId] || {};
      if (typeof node.kind !== 'string' || !node.kind) {
        errors.push(`[P0] schema:节点 '${key}' 缺合法 kind(需非空字符串——模块按 kind 路由 dispatch)。`);
      }
      checkLinkArray(errors, key, 'links', node.links);
      checkLinkArray(errors, key, 'exits', node.exits);
    }
  }
  return { errors: errors, warns: warns };
}

function checkLinkArray(errors, key, field, arr) {
  if (arr == null) return;                         // 字段可缺省
  if (!Array.isArray(arr)) { errors.push(`[P0] schema:节点 '${key}' 的 ${field} 必须是数组。`); return; }
  arr.forEach(function (lk, i) {
    if (!lk || typeof lk !== 'object') { errors.push(`[P0] schema:'${key}' ${field}[${i}] 不是对象。`); return; }
    if (typeof lk.label !== 'string' || !lk.label) errors.push(`[P0] schema:'${key}' ${field}[${i}] 缺 label(玩家看不到入口文字)。`);
    const hasTo = Object.prototype.hasOwnProperty.call(lk, 'to');
    const hasRun = typeof lk.run === 'function';
    if (!hasTo && !hasRun) errors.push(`[P0] schema:'${key}' ${field}[${i}]「${lk.label || ''}」既无 to 也无 run(此入口无意义)。`);
  });
}

// ── 4. 构建主流程:内联 → 过门 → (过则)写文件。不过门不写,fail-closed。────────────
export function buildToFile(indexPath, outPath) {
  const previousOutputPreserved = (() => {
    try { return fs.statSync(outPath).isFile(); } catch (e) { return false; }
  })();
  const inlined = inlineHtml(indexPath);
  const result = { ok: false, errors: [], warns: [], remaining: inlined.remaining, remainingStyles: inlined.remainingStyles, srcs: inlined.srcs, styles: inlined.styles, bytes: 0, outPath: outPath, version: inlined.version, previousOutputPreserved: previousOutputPreserved };

  const found = loadWorld(inlined.srcs);
  if (found.length === 0) { result.errors.push('准入门:找不到世界数据(应有一个脚本导出 {start,maps})。'); return result; }
  if (found.length > 1) { result.errors.push('准入门:发现多个世界数据脚本(应唯一):' + found.map((f) => path.basename(f.p)).join('、')); return result; }

  const worldPath = found[0].p;
  let worldSource = '';
  let gameSource = '';
  let hasGameJs = false;
  try { worldSource = fs.readFileSync(worldPath, 'utf8'); } catch (e) { /* loadWorld 已成功；拿不到源则项目文本检查无输入 */ }
  try {
    const gamePath = path.join(path.dirname(worldPath), 'game.js');
    if (fs.existsSync(gamePath)) {
      gameSource = fs.readFileSync(gamePath, 'utf8');
      hasGameJs = true;
    }
  } catch (e) { /* 无 game.js → 只裁决 world */ }
  const g = gateWorld(found[0].world, worldSource, gameSource, hasGameJs);
  result.warns = g.warns;
  result.errors = g.errors.slice().concat(inlined.styleErrors || [], inlined.scriptErrors || []);
  if (inlined.remaining > 0) result.errors.push(`内联后仍残留 ${inlined.remaining} 个带 src 的 <script>(应为 0——成品须自包含)。`);
  if (inlined.remainingStyles > 0) result.errors.push(`内联后仍残留 ${inlined.remainingStyles} 个本地 <link rel="stylesheet">(应为 0——本地 CSS 必须内联进单 HTML)。`);
  // 非内联资产残留(易用性审计批):成品承诺「单 HTML、断网可玩」,但 build 只内联 script + 本地 stylesheet——
  //   作者塞的 <img src>/远程 CSS @import/url(...) 会原样留在产物里 → 离线/换机即裂图;
  //   dist/ 落子目录还改变相对路径语义(../x 指错地方)。data: URI 与纯锚点不算。
  //   <img src> / <audio/video src>:P1 warn(不阻断构建,作者有意联网情形仍可接受)。
  //   <link href>:D1 升 P0 block——成品承诺「单文件零外链」,残留 link href 即破坏这一承诺;
  //     正则扩到双引号/单引号/无引号三种写法,防遗漏。
  const assetRe = [
    [/<img\s[^>]*src="(?!data:)([^"]+)"/gi, '<img src>'],
    [/<(?:audio|video|source)\s[^>]*src="(?!data:)([^"]+)"/gi, '<audio/video src>'],
  ];
  for (const [re, label] of assetRe) {
    let m; re.lastIndex = 0;
    while ((m = re.exec(inlined.html))) {
      const target = String(m[1] || m[0]);
      if (/^(?:data:|#)/i.test(target)) continue;
      result.warns.push(`[P1] 非自包含资产:${label} → ${target.slice(0, 80)}(build 只内联 script + 本地 stylesheet;此引用会留在成品里,离线/换机/挪 dist 即失效。改内联 data: URI / 避免二级 CSS 资产,或确认有意联网)。`);
    }
  }
  // D1:<link href> 升 P0 block;正则扩到双引号/单引号/无引号三种写法。
  const linkHrefRe = [
    /<link\b[^>]*href="(?!data:|#)([^"]+)"/gi,
    /<link\b[^>]*href='(?!data:|#)([^']+)'/gi,
    /<link\b[^>]*href=(?!['"]|data:|#)([^\s>]+)/gi,
  ];
  for (const re of linkHrefRe) {
    let m; re.lastIndex = 0;
    while ((m = re.exec(inlined.html))) {
      const target = String(m[1] || m[0]);
      if (/^(?:data:|#)/i.test(target)) continue;
      result.errors.push(`[P0] 非自包含资产:<link href> → ${target.slice(0, 80)}(成品须自包含单 HTML;残留 link href 破坏单文件零外链承诺——改内联 data: URI,或移除此 link)。`);
    }
  }
  const cssText = [...inlined.html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
  const cssAssetRe = [
    [/@import\s+(?:url\()?["']?([^"')]+)["']?\)?/gi, 'CSS @import'],
    [/url\(\s*["']?([^"')]+)["']?\s*\)/gi, 'CSS url()'],
  ];
  for (const [re, label] of cssAssetRe) {
    let m; re.lastIndex = 0;
    while ((m = re.exec(cssText))) {
      const target = String(m[1] || m[0]);
      if (/^(?:data:|#)/i.test(target)) continue;
      result.warns.push(`[P1] 非自包含资产:${label} → ${target.slice(0, 80)}(build 只内联 script + 本地 stylesheet;此引用会留在成品里,离线/换机/挪 dist 即失效。改内联 data: URI / 避免二级 CSS 资产,或确认有意联网)。`);
    }
  }
  if (result.errors.length) return result;          // 不过门:不写文件、不建目录(fail-closed 不留产物)

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, inlined.html);
  result.ok = true;
  result.bytes = Buffer.byteLength(inlined.html, 'utf8'); // 实际 UTF-8 落盘字节(非 JS 字符串长度;中文=3 字节)
  return result;
}

// ── CLI ────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const smoke = argv.indexOf('--smoke') !== -1;
  const positionals = argv.filter((a) => a.charAt(0) !== '-');
  const indexArg = positionals[0];
  if (!indexArg) {
    console.error('用法: node build.mjs <game/index.html> [out.html] [--smoke]');
    process.exit(2);
  }
  const indexPath = path.resolve(indexArg);
  if (!fs.existsSync(indexPath)) { console.error('找不到入口 HTML: ' + indexPath); process.exit(2); }
  const outPath = positionals[1]
    ? path.resolve(positionals[1])
    : path.join(path.dirname(indexPath), 'dist', 'index.html');

  // 所有构建统一使用同目录候选：静态门（以及可选 smoke）全过后才原子替换 canonical output。
  // 这样默认构建遇磁盘写失败也不会先截断 last-known-good。smoke 子进程另设硬 timeout。
  const smokeTimeout = Number(process.env.AMATLAS_SMOKE_TIMEOUT_MS || 30000);
  if (smoke && (!Number.isFinite(smokeTimeout) || smokeTimeout <= 0)) {
    console.error('AMATLAS_SMOKE_TIMEOUT_MS 必须是有限正数毫秒');
    process.exit(2);
  }
  const candidatePath = path.join(path.dirname(outPath), '.' + path.basename(outPath) + (smoke ? '.smoke-' : '.build-') + process.pid + '.tmp');
  try { fs.unlinkSync(candidatePath); } catch (e) { /* 无旧候选 */ }
  const r = buildToFile(indexPath, candidatePath);
  const canonicalExisted = (() => {
    try { return fs.statSync(outPath).isFile(); } catch (e) { return false; }
  })();
  r.outPath = outPath;
  r.previousOutputPreserved = canonicalExisted;

  // 可疑项(P1/P2)始终回显,但不阻断。
  if (r.warns.length) {
    console.log('⚠ ' + r.warns.length + ' 处可疑(P1/P2,需人工确认,不阻断构建):');
    r.warns.forEach((w) => console.log('    ' + w));
  }
  if (!r.ok) {
    try { fs.unlinkSync(candidatePath); } catch (e) { /* 候选不存在也算已清 */ }
    console.error('\n✗ 准入门拒绝(' + r.errors.length + ' 处硬错):');
    r.errors.forEach((e) => console.error('    ' + e));
    if (r.previousOutputPreserved) console.error('    ⚠ 本次未更新,旧产物仍在:' + r.outPath);
    else console.error('    本次未写入,目标文件不存在:' + r.outPath);
    process.exit(1);
  }
  if (!smoke) {
    fs.renameSync(candidatePath, outPath);
    console.log('✓ 构建: ' + outPath + ' (' + r.bytes + ' bytes, 内联 ' + r.srcs.length + ' 段脚本 + ' + (r.styles ? r.styles.length : 0) + ' 段样式, 残留外链 ' + r.remaining + ', 残留本地 CSS ' + (r.remainingStyles || 0) + ', 引擎 ' + r.version + ')');
    process.exit(0);
  }

  console.log('\n── --smoke:可加载探针(jsdom,类型无关运行时烟雾)──');
  const smokeTool = fileURLToPath(new URL('../../core/tooling/smoke-harness.mjs', import.meta.url));
  const sr = spawnSync(process.execPath, [smokeTool, candidatePath], {
    encoding: 'utf8',
    timeout: smokeTimeout,
    killSignal: 'SIGTERM'
  });
  if (sr.stdout) process.stdout.write(sr.stdout);
  if (sr.stderr) process.stderr.write(sr.stderr);
  const timedOut = !!(sr.error && sr.error.code === 'ETIMEDOUT');
  const spawnFailed = !!(sr.error && !timedOut); // 沙箱禁 spawn(EPERM)等:harness 根本没跑起来,别当"smoke 失败"
  if (timedOut || spawnFailed || sr.status !== 0) {
    try { fs.unlinkSync(candidatePath); } catch (e) { /* 候选不存在也算已清 */ }
    if (timedOut) console.error('✗ smoke 超时(' + smokeTimeout + 'ms)，候选产物已删除。');
    else if (spawnFailed) console.error('✗ smoke 无法启动子进程:' + (sr.error.code || '') + ' ' + (sr.error.message || String(sr.error)) + ' —— 多为运行环境禁止 spawn(非构建失败);候选已删除,可直接跑 core/tooling/smoke-harness.mjs 复核。');
    else console.error('✗ smoke 失败(退出码 ' + sr.status + '),候选产物已删除。');
    if (canonicalExisted) console.error('    ⚠ 本次未更新,旧产物仍在:' + outPath);
    else console.error('    本次未写入,目标文件不存在:' + outPath);
    process.exit(1);
  }

  // 同目录 rename：smoke 全绿后才把候选原子落到标准输出路径。
  fs.renameSync(candidatePath, outPath);
  console.log('✓ 构建 + smoke: ' + outPath + ' (' + r.bytes + ' bytes, 引擎 ' + r.version + ')');
  process.exit(0);
}

// 作为脚本直接运行时才执行 main()(被 import 时只导出纯函数,供测试/复用)。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
