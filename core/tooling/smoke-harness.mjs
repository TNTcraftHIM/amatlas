#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   smoke-harness.mjs — 类型无关的「运行时烟雾」夹具(jsdom,比 Playwright 轻)
   ════════════════════════════════════════════════════════════════════════
   对**任意** all-in-one HTML 游戏(核心 + 任一模块构建出的单文件)做最小运行时校验,
   查 `node -c`(语法)和 graph-audit(静态图)都查不到的运行时问题:
     1. 加载即崩(JS 运行时错误)
     2. 没渲染出内容
     3. 没有可点击的交互入口
     4. 点一下不切换(界面无变化)
     5. 存档未触发(localStorage)—— 降级为**警告**(file:// 下本就可能不可用,见 lessons ⑦)

   **有意只放类型无关的检查**:不查「残留 {{}} 条件文本标记」——那是文字冒险散文模板专属,
   归 modules/text-adventure/(其 audit/skill 负责)。本夹具对跑团/任何模块同样适用。

   既可当 CLI(`node smoke-harness.mjs game.html`),也可被 import 复用 `runSmoke(html)`
   (模块侧可在其上叠加自己的专属检查,如文字冒险的 {{}} 标记检查)。

   依赖 jsdom(即装即删,绝不入库/打包);没装会提示。
   注:jsdom 只查 JS 逻辑层,最终仍需真浏览器(CSS/音视频/移动端)。
   退出码:有失败=1;否则 0(警告不算失败)。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'fs';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const require = createRequire(import.meta.url);

// jsdom 的 beforeParse stub:把 jsdom 没实现的浏览器 API 打成 no-op,
// 以免「jsdom 限制」被误判为「游戏 bug」(见 lessons ②)。
function installStubs(w, reportRuntimeError) {
  // beforeParse 会在任何内联脚本执行前调用；错误通道必须在这里先装，不能等 new JSDOM() 返回。
  if (typeof reportRuntimeError === 'function') {
    w.addEventListener('error', (e) => {
      reportRuntimeError(e && (e.error || e.message));
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
    });
    w.addEventListener('unhandledrejection', (e) => {
      reportRuntimeError(e && e.reason);
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
    });
  }
  let raf = 0;
  w.requestAnimationFrame = (cb) => (raf++ < 60 ? setTimeout(cb, 0) : 0); // 限帧:防自循环动画跑飞
  w.cancelAnimationFrame = () => {};
  w.scrollTo = () => {};
  if (w.Element) w.Element.prototype.scrollIntoView = () => {};
  const ctx = new Proxy({}, { get: () => () => {} });                     // canvas 2d/webgl no-op
  if (w.HTMLCanvasElement) w.HTMLCanvasElement.prototype.getContext = () => ctx;
  w.confirm = () => true;
  w.alert = () => {};
  w.HTMLMediaElement && (w.HTMLMediaElement.prototype.play = () => Promise.resolve());
  w.HTMLMediaElement && (w.HTMLMediaElement.prototype.pause = () => {});
  const audio = new Proxy(function () {}, {                               // Web Audio 递归假节点
    get(_t, p) {
      if (p === 'currentTime') return 0;
      if (p === 'state') return 'running';
      if (p === 'sampleRate') return 44100;
      if (p === 'value') return 1;
      if (['gain', 'frequency', 'Q', 'detune', 'destination', 'pan'].includes(p)) return audio;
      return () => audio;
    },
    apply() { return audio; }
  });
  w.AudioContext = function () { return audio; };
  w.webkitAudioContext = w.AudioContext;
}

export async function runSmoke(html, options = {}) {
  const r = { pass: 0, fail: 0, warn: 0, lines: [] };
  const settleMs = options.settleMs == null ? 700 : options.settleMs;
  const actionWaitMs = options.actionWaitMs == null ? 700 : options.actionWaitMs;
  const ok = (n, c, d = '') => { if (c) { r.lines.push('  ✅ ' + n); r.pass++; } else { r.lines.push('  ❌ ' + n + ' ' + d); r.fail++; } };
  const wn = (n) => { r.lines.push('  ⚠️ ' + n); r.warn++; };

  let JSDOM;
  // createRequire 同时支持随项目就近安装与 CI/E2E 的 NODE_PATH 外部依赖根；
  // 原生 ESM import 不读取 NODE_PATH，会让仓库内 runner 认出 jsdom、仓库外 smoke 子进程却报未安装。
  try { ({ JSDOM } = require('jsdom')); }
  catch (e) { r.lines.push('  ❌ 需要 jsdom。运行: npm install jsdom'); r.fail++; return r; }

  let runtimeError = null;
  const errorMessage = (err) => {
    if (runtimeError) return;
    runtimeError = err && err.message ? err.message : String(err || '未知运行时错误');
  };
  // jsdom 的 Promise rejection 走 Node 进程通道而非稳定派发 window.unhandledrejection；
  // smoke CLI 是专用进程，运行期间临时接住并在结束时移除，避免坏页面直接杀掉裁判。
  const processRejection = (reason) => errorMessage(reason);
  process.on('unhandledRejection', processRejection);
  const removeProcessRejection = () => process.removeListener('unhandledRejection', processRejection);
  let dom;
  try {
    dom = new JSDOM(html, {
      runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
      beforeParse: (w) => installStubs(w, errorMessage)
    });
  } catch (e) {
    removeProcessRejection();
    r.lines.push('  ❌ 加载即崩溃: ' + (e && e.message)); r.fail++; return r;
  }
  const { window } = dom;
  const { document } = window;

  await new Promise((res) => setTimeout(res, settleMs));

  // 1. 无加载期运行时错误
  ok('1. 无加载期运行时错误', !runtimeError, '(' + runtimeError + ')');

  // 2. 渲染了内容
  const bodyText = document.body.textContent || '';
  ok('2. 页面渲染了内容', bodyText.length > 50, '(仅' + bodyText.length + '字符)');

  // 3. 有可点击入口
  const getChoices = () => [...document.querySelectorAll('#choices button, button, .choice, [data-next], a.choice')]
    .filter((b) => (b.textContent || '').trim().length > 0);
  ok('3. 渲染了可点击入口', getChoices().length >= 1, '(找到' + getChoices().length + '个)');

  // 4. 点一下能切换(避开菜单/存读档类按钮);先尽量点「开始/继续」过标题屏
  const norm = (b) => (b.textContent || '').replace(/\s+/g, '');
  const isMenuBtn = (b) => /重新开始|重启|restart|章节选择|菜单|menu|设置|settings|存档|读档|读取|save|load|导入|导出|关于|about|音乐|音效|sound|music|静音|mute/i.test(norm(b));
  // 插件控件(存档/地图/成就工具栏按钮 + 浮窗里的按钮)不是游戏选项——一律跳过,别点它当"切换"。
  //   (工具栏默认放 #app 顶部后,这些按钮在 DOM 里排在游戏选项前,否则 story[0] 兜底会误点到工具按钮 → 假"未切换"警告)
  const isPluginBtn = (b) => !!(b.closest && (b.closest('#plugin-bar') || b.closest('.amatlas-plugin-panel'))) || /amatlas-plugin/.test((b.className && b.className.toString && b.className.toString()) || '');
  const main = document.querySelector('#scene-text, .scene-text, #story, #app, main') || document.body;
  const sig = () => (main ? main.textContent : '') + '||' + (document.body.textContent || '').slice(0, 400);
  for (let i = 0; i < 2; i++) {
    const start = getChoices().find((b) => !isMenuBtn(b) && !isPluginBtn(b) && /^(开始|进入|newgame|begin|start)/i.test(norm(b)));
    if (!start) break;
    try { start.click(); } catch (e) { errorMessage(e); }
    await new Promise((res) => setTimeout(res, actionWaitMs));
  }
  let transitioned = false;
  let choices = getChoices();
  for (let i = 0; i < 4 && choices.length && !transitioned; i++) {
    const story = choices.filter((b) => !isMenuBtn(b) && !isPluginBtn(b));
    if (!story.length) break;
    const before = sig();
    const btn = story.find((b) => /继续|next|前往|进入|走|去|回/i.test(norm(b))) || story[0];
    try { btn.click(); } catch (e) { errorMessage(e); break; }
    await new Promise((res) => setTimeout(res, actionWaitMs));
    if (sig() !== before) transitioned = true;
    choices = getChoices();
  }
  // installStubs 已提供 Web Audio 假节点；此后仍抛出的错误就是游戏/呈现器问题。
  // 不能按消息含 gainNode/oscillator 等词猜成 jsdom 限制，否则 ReferenceError 会被判绿。
  if (runtimeError) {
    ok('4. 点一下能切换且不崩', false, '(运行时错误: ' + runtimeError + ')');
  } else if (transitioned) {
    ok('4. 点一下能切换且不崩', true);
  } else {
    wn('4. 未检测到切换(也没崩)。可能 jsdom 驱动不了此游戏交互流程,请真浏览器确认');
  }

  // 5. 存档(localStorage)—— 警告级(file:// 下本就可能不可用)
  let saved = false;
  try { saved = !!(window.localStorage && window.localStorage.length >= 1); } catch (e) {}
  if (saved) ok('5. 触发了存档(localStorage)', true);
  else wn('5. 未检测到 localStorage 存档(可能用别的键名/未到存档点/file:// 受限)');

  removeProcessRejection();
  return r;
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) { console.error('用法: node smoke-harness.mjs game.html'); process.exit(2); }
  if (!fs.existsSync(file)) { console.error('文件不存在: ' + file); process.exit(2); }
  const html = fs.readFileSync(file, 'utf8');
  console.log('\n=== 运行时烟雾(类型无关): ' + file + ' ===\n');
  const r = await runSmoke(html);
  r.lines.forEach((l) => console.log(l));
  console.log('\n结果: ' + r.pass + ' 通过, ' + r.fail + ' 失败, ' + r.warn + ' 警告');
  console.log('注:jsdom 只查 JS 逻辑层,最终仍需真浏览器实玩。');
  process.exit(r.fail > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
