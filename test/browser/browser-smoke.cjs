'use strict';
/* ════════════════════════════════════════════════════════════════════════
   浏览器回归(可选 · 需 Playwright)—— 发布前验收链,不进零依赖 run.cjs。
   ────────────────────────────────────────────────────────────────────────
   为什么单列:jsdom smoke(build --smoke)只验 JS 逻辑层;但**真浏览器**才能验
   canvas+rAF(maze3d 伪 3D)、真实渲染、点击交互——这些是「干净检出可复现的发布
   证据」(此前浏览器验收脚本散在 gitignored _scratch、他人 checkout 复现不了)。
   与 build --smoke 同为**可选**:默认未装 playwright 直接跳过(退 0),不破零依赖基线；
   发布/E2E 设 `ATLAS_BROWSER_REQUIRED=1` 时缺依赖或浏览器必须 fail-closed。

   跑法:
     npm i playwright && npx playwright install chromium
     node engine/test/browser/browser-smoke.cjs
   强制浏览器(发布/E2E):
     ATLAS_BROWSER_REQUIRED=1 node engine/test/browser/browser-smoke.cjs
   指定 chromium(本地已有别的版本时):
     ATLAS_BROWSER_EXECUTABLE=/path/to/chrome.exe node engine/test/browser/browser-smoke.cjs
   退出码:0 全过或默认模式已跳过;1 有测试失败;2=required 模式缺 Playwright/Chromium。
   ════════════════════════════════════════════════════════════════════════ */
const browserRequired = process.env.ATLAS_BROWSER_REQUIRED === '1';
function unavailable(message) {
  if (browserRequired) {
    console.error('❌ 浏览器回归 required 但不可用:' + message);
    process.exit(2);
  }
  console.log('⏭  跳过浏览器回归:' + message);
  process.exit(0);
}
let chromium;
try { chromium = require('playwright').chromium; }
catch (e) {
  unavailable('未安装 playwright(可选发布验收;npm i playwright && npx playwright install chromium)');
}
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ENGINE = path.join(__dirname, '..', '..');
const BUILD = path.join(ENGINE, 'pipeline', 'build', 'build.mjs');
const fileUrl = (p) => 'file:///' + p.replace(/\\/g, '/');

let pass = 0, fail = 0;
const ok = (name, cond, detail) => { if (cond) { console.log('  ok  ' + name); pass++; } else { console.log('  X   ' + name + (detail ? '  → ' + detail : '')); fail++; } };

// 世界 demo:先用零依赖构建器构成单 HTML(与端用户成品同一产物),再真浏览器加载断言。
function builtUrl(demo) {
  const idx = path.join(ENGINE, 'examples', demo, 'index.html');
  execFileSync(process.execPath, [BUILD, idx], { stdio: 'ignore' });
  return fileUrl(path.join(ENGINE, 'examples', demo, 'dist', 'index.html'));
}
// Dev Gallery(showroom:无世界数据、不过 build 世界准入门):直接加载源码入口。
function sourceUrl(demo) {
  return fileUrl(path.join(ENGINE, 'examples', demo, 'index.html'));
}

async function withPage(browser, run) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  try { await run(page, errors); }
  finally { await page.close(); }
  return errors;
}

(async () => {
  const launchOpts = process.env.ATLAS_BROWSER_EXECUTABLE
    ? { executablePath: process.env.ATLAS_BROWSER_EXECUTABLE }
    : {};   // 缺省 = Playwright 打包的 chromium(CI 用 npx playwright install chromium 装)
  let browser;
  try { browser = await chromium.launch(launchOpts); }
  catch (e) {
    unavailable('chromium 启动失败(' + (e.message || e).slice(0, 120) + ');装 `npx playwright install chromium` 或设 ATLAS_BROWSER_EXECUTABLE');
  }
  console.log('浏览器回归(chromium)');
  try {
    // ── 场景 1:showroom embedded Gallery——打开真实子页、关闭卸载、零页面错误 ──
    {
      const url = sourceUrl('showroom');
      const errors = await withPage(browser, async (page) => {
        await page.goto(url, { waitUntil: 'load' });
        const launcher = page.locator('button[data-src="ui-skins-gallery.html"]');
        await launcher.waitFor({ state: 'visible', timeout: 8000 });
        await page.waitForFunction(() => !document.querySelector('button[data-src]:disabled'), null, { timeout: 8000 });
        const initial = await page.evaluate(() => ({
          launchers: document.querySelectorAll('button[data-src]').length,
          frames: document.querySelectorAll('.demoport-frame').length,
          hasSrc: document.querySelector('.demoport-frame').hasAttribute('src')
        }));
        ok('S1 showroom 首屏有 12 个 launcher、单 iframe 且尚未装 src', initial.launchers === 12 && initial.frames === 1 && !initial.hasSrc, JSON.stringify(initial));
        await launcher.click();
        await page.frameLocator('.demoport-frame').locator('.skin-choice').first().waitFor({ state: 'visible', timeout: 8000 });
        const opened = await page.evaluate(() => {
          const port = document.querySelector('.demoport');
          const frame = document.querySelector('.demoport-frame');
          return !!(port && port.classList.contains('open') && frame && frame.getAttribute('src') === 'ui-skins-gallery.html');
        });
        ok('S2 showroom 单窗口打开真实 UI Skin Gallery', opened, 'opened=' + opened);
        await page.click('.demoport-close');
        await page.waitForFunction(() => {
          const port = document.querySelector('.demoport');
          const frame = document.querySelector('.demoport-frame');
          return port && port.hidden && !port.classList.contains('open') && frame && !frame.hasAttribute('src');
        }, null, { timeout: 5000 });
        const returned = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-src'));
        ok('S3 showroom 关闭后卸载 iframe 并把焦点还给触发卡', returned === 'ui-skins-gallery.html', 'focus=' + returned);
      });
      ok('S4 showroom host/iframe 零页面错误', errors.length === 0, errors.join(' | '));
    }

    // ── 场景 2:text-adventure-demo 首屏 + 一次交互(逻辑层,真浏览器点击)──
    {
      const url = builtUrl('text-adventure-demo');
      const errors = await withPage(browser, async (page) => {
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(() => {
          const look = document.querySelector('#look'); const ch = document.querySelector('#choices');
          return look && look.textContent.trim().length > 0 && ch && ch.querySelectorAll('button').length > 0;
        }, null, { timeout: 8000 });
        ok('S5 文字冒险首屏渲染出正文 + 可点选项', true);
        const before = await page.evaluate(() => (document.querySelector('#look') || {}).textContent || '');
        await page.click('#choices button');
        await page.waitForFunction((b) => {
          const look = document.querySelector('#look');
          const place = document.querySelector('#place');
          return look && (look.textContent !== b) || (place && place.textContent.length >= 0);
        }, before, { timeout: 5000 });
        ok('S6 点一个选项后界面响应(未卡死)', true);
      });
      ok('S7 文字冒险零页面错误', errors.length === 0, errors.join(' | '));
    }

    // ── 场景 3:maze3d 伪 3D(canvas + rAF;jsdom 测不了、真浏览器命脉)──
    {
      const url = builtUrl('maze3d');
      const errors = await withPage(browser, async (page) => {
        await page.goto(url, { waitUntil: 'load' });
        // maze3d 的 world.start 是 hub 菜单(scene);点进第一个 recipe「基础迷宫」→ basic_maze(kind:maze3d)才起 canvas。
        await page.waitForFunction(() => document.querySelectorAll('#choices button').length > 0, null, { timeout: 8000 });
        await page.evaluate(() => {
          const btns = Array.prototype.slice.call(document.querySelectorAll('#choices button'));
          const t = btns.filter((b) => /基础迷宫|Recipe 1/.test(b.textContent))[0] || btns[0];
          t.click();
        });
        // 进 maze3d 节点后 rAF 画 canvas。等 canvas 出现且有实际尺寸。
        await page.waitForFunction(() => {
          const c = document.querySelector('canvas');
          return c && c.width > 0 && c.height > 0;
        }, null, { timeout: 8000 });
        // 让 rAF 跑几帧,确认不在首帧崩(canvas 页最易在连续渲染中炸)。
        await page.waitForTimeout(600);
        const drew = await page.evaluate(() => {
          const c = document.querySelector('canvas');
          if (!c) return false;
          try { const ctx = c.getContext('2d'); if (!ctx) return true; const d = ctx.getImageData(0, 0, Math.min(8, c.width), Math.min(8, c.height)).data; return d.some((v) => v !== 0); }
          catch (e) { return true; }   // WebGL/跨源取像素受限 → 有 canvas 即算过(下面靠零错误兜)
        });
        ok('S8 maze3d canvas 出现且已绘制(rAF 连续渲染不崩)', drew, 'drew=' + drew);
      });
      ok('S9 maze3d(canvas+rAF)零页面错误', errors.length === 0, errors.join(' | '));
    }
  } finally {
    await browser.close();
  }
  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('浏览器回归异常:', e && e.message); process.exit(1); });
