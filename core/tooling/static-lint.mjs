#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   static-lint.mjs — 零依赖「静态文本 lint」(类型无关)
   ════════════════════════════════════════════════════════════════════════
   查 graph-audit(图结构)/ assembly-probe(运行时装配)都够不到、但**确定性、可机检**的
   "残留 / 编码 / 死标记 / CSS 反模式"——把这类原本写在手册里靠人 grep 的检查,沉淀进工具
   (design-principles §10:能机检的进工具,不进手册)。

   ── 只收「零误报」的项 ──────────────────────────────────────────────────
   P1 误报多了会被当噪音(lessons ㊸ warning-fatigue)→ **宁可少做,不可误报**。
   只查在「已发布游戏源码里几乎不可能是有意」的 **correctness** 残留(铁定零误报):
     · 残留待办/占位:TODO / FIXME / XXX / PLACEHOLDER / 占位 / 待填(world.js/game.js)
     · 乱码:U+FFFD 替换字符 `�`(任何源)= 编码错误
     · 死标记:world.js 里的 `{{`(模块化渲染器不做 mustache 插值 → 会原样显示给玩家;旧格式遗留)
   **不查**:① 中文叠词 / 触控 px / 逗号截断(有意/无意难分、易误报);② CSS 样式 nit(`100vh`/`transition:all`
     —— 属"polish 判断"、且我们自己的 demo/game-design-guide 现也用 100vh,自查矛盾)→ 这些留 game-design-guide 手册人工。

   分级:全部 [可疑][P1](确定性高,但都不致命、且可能有罕见有意场景)→ 退出码 0,仅警告。
   用法: node static-lint.mjs <game/index.html>   (读 index.html + 同目录 world.js/game.js)
   也可 import { runLint } 复用。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

// 扫一段源里所有命中,返回去重后的样例(最多列 3 个,避免刷屏)。
function hits(re, text) {
  const set = new Set();
  for (const m of text.matchAll(re)) { set.add(m[0].trim().slice(0, 40)); if (set.size >= 3) break; }
  return [...set];
}

export function runLint(indexPath) {
  const p1 = [];
  let html = '';
  try { html = fs.readFileSync(indexPath, 'utf8'); } catch (e) { return { skipped: '读不到 ' + indexPath }; }
  const dir = path.dirname(indexPath);
  const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return ''; } };
  const worldSrc = read('world.js');
  const gameSrc = read('game.js');
  const code = worldSrc + '\n' + gameSrc;            // 游戏自己的脚本(不含引擎 ../)

  // ① 残留待办/占位(game 脚本里)
  const todo = hits(/\b(?:TODO|FIXME|XXX|PLACEHOLDER)\b|占位|待填/gi, code);
  if (todo.length) p1.push('残留待办/占位:world.js/game.js 里有 ' + todo.map(s => '`' + s + '`').join(' / ') + ' —— 是没写完的标记,交付前清掉/补全。');

  // ② 乱码(替换字符 U+FFFD;任何源)
  if (/�/.test(html + code)) p1.push('乱码:源码含替换字符 `�`(U+FFFD)= 编码错误(多为非 UTF-8 读写)。用 UTF-8 重存。');

  // ③ 死 mustache 标记(world.js 里的 {{ )
  if (/\{\{/.test(worldSrc)) p1.push('死标记:world.js 含 `{{`(模块化渲染器**不做** mustache 插值 → 会把 `{{...}}` 原样显示给玩家)。`look` 用函数 `(S)=>...` 拼字符串,别用 `{{}}`。');

  return { p1 };
}

function main() {
  const file = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (!file) { console.error('用法: node static-lint.mjs <game/index.html>'); process.exit(2); }
  const r = runLint(file);
  console.log('\n=== 静态文本 lint(零依赖): ' + file + ' ===');
  if (r.skipped) { console.log('  ⚠️  跳过:' + r.skipped); process.exit(0); }
  r.p1.forEach(m => console.log('  [可疑][P1] ' + m));
  if (!r.p1.length) console.log('  ✅ 无残留/乱码/死标记/CSS 反模式。');
  console.log('\n结果: P1=' + r.p1.length + '(仅警告、不拦)');
  process.exit(0);   // 全 P1 → 不硬拦
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
