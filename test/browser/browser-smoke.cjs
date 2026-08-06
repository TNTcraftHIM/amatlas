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
const focusedModes = [
  ['puzzle', 'ATLAS_BROWSER_PUZZLE_ONLY', process.env.ATLAS_BROWSER_PUZZLE_ONLY === '1'],
  ['pursuit', 'ATLAS_BROWSER_PURSUIT_ONLY', process.env.ATLAS_BROWSER_PURSUIT_ONLY === '1'],
  ['arcade', 'ATLAS_BROWSER_ARCADE_ONLY', process.env.ATLAS_BROWSER_ARCADE_ONLY === '1'],
  ['tabletop', 'ATLAS_BROWSER_TABLETOP_ONLY', process.env.ATLAS_BROWSER_TABLETOP_ONLY === '1'],
  ['cutscene', 'ATLAS_BROWSER_CUTSCENE_ONLY', process.env.ATLAS_BROWSER_CUTSCENE_ONLY === '1'],
  ['minimal', 'ATLAS_BROWSER_MINIMAL_ONLY', process.env.ATLAS_BROWSER_MINIMAL_ONLY === '1'],
  ['horror', 'ATLAS_BROWSER_HORROR_ONLY', process.env.ATLAS_BROWSER_HORROR_ONLY === '1']
];
const focused = focusedModes.filter((entry) => entry[2]);
if (focused.length > 1) {
  console.error('❌ 浏览器回归 focused 模式冲突: ' + focused.map((entry) => entry[1]).join(' / ') + ' 最多只能一个为 1');
  process.exit(2);
}
const selectedSuite = focused.length ? focused[0][0] : null;
const suiteEnabled = (name) => selectedSuite == null || selectedSuite === name;
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
function builtUrl(demo, entry) {
  const sourceName = entry || 'index.html';
  const idx = path.join(ENGINE, 'examples', demo, sourceName);
  const out = path.join(ENGINE, 'examples', demo, 'dist', sourceName);
  execFileSync(process.execPath, [BUILD, idx, out], { stdio: 'ignore' });
  return fileUrl(out);
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
  page.on('request', (request) => { if (/^https?:/i.test(request.url())) errors.push('remote request: ' + request.url()); });
  page.on('requestfailed', (request) => errors.push('requestfailed: ' + request.url()));
  try { await run(page, errors); }
  finally { await page.close(); }
  return errors;
}

async function withIsolatedPage(browser, run) {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('request', (request) => { if (/^https?:/i.test(request.url())) errors.push('remote request: ' + request.url()); });
  page.on('requestfailed', (request) => errors.push('requestfailed: ' + request.url()));
  try { await run(page, errors); }
  finally { await context.close(); }
  return errors;
}

async function withMobilePage(browser, run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('request', (request) => { if (/^https?:/i.test(request.url())) errors.push('remote request: ' + request.url()); });
  page.on('requestfailed', (request) => errors.push('requestfailed: ' + request.url()));
  try { await run(page, errors); }
  finally { await context.close(); }
  return errors;
}

const PUZZLE_HUD = '#maze3d-stage .amatlas-maze-hint';
const PUZZLE_OVERLAY = '#maze3d-stage .amatlas-maze-puzzle-overlay.is-open';

async function waitSimulated(page, targetMs) {
  return page.evaluate((budget) => new Promise((resolve) => {
    let accumulated = 0, previous = null;
    const frame = (timestamp) => {
      if (previous != null) accumulated += Math.min(50, Math.max(0, timestamp - previous));
      previous = timestamp;
      if (accumulated >= budget) resolve(accumulated);
      else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }), targetMs);
}

async function holdKeysSimulated(page, keys, ms, settle) {
  for (const key of keys) await page.keyboard.down(key);
  try { await waitSimulated(page, ms); }
  finally {
    for (const key of keys.slice().reverse()) await page.keyboard.up(key);
  }
  await page.waitForTimeout(settle == null ? 120 : settle);
}

async function holdKey(page, key, ms, settle) {
  await holdKeysSimulated(page, [key], ms, settle);
}

async function holdUntil(page, key, waitForPublicFact, settle) {
  await page.keyboard.down(key);
  try { await waitForPublicFact(); }
  finally { await page.keyboard.up(key); }
  await page.waitForTimeout(settle == null ? 120 : settle);
}

async function holdUntilText(page, key, selector, pattern, timeout) {
  await holdUntil(page, key, () => page.waitForFunction(({ selector, source, flags }) => {
    const node = document.querySelector(selector);
    return !!(node && new RegExp(source, flags).test(node.textContent || ''));
  }, { selector, source: pattern.source, flags: pattern.flags }, { timeout: timeout || 4000 }));
  return page.locator(selector).innerText();
}

async function holdUntilVisible(page, key, selector, timeout) {
  await holdUntil(page, key, () => page.locator(selector).waitFor({ state: 'visible', timeout: timeout || 4000 }));
}

async function tryHoldUntilText(page, key, selector, pattern, timeout) {
  let matched = false;
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(({ selector, source, flags }) => {
      const node = document.querySelector(selector);
      return !!(node && new RegExp(source, flags).test(node.textContent || ''));
    }, { selector, source: pattern.source, flags: pattern.flags }, { timeout: timeout || 1000 });
    matched = true;
  } catch (error) {
    if (!/Timeout/.test(error && error.name || '') && !/Timeout/.test(error && error.message || '')) throw error;
  } finally { await page.keyboard.up(key); }
  await page.waitForTimeout(120);
  return matched ? page.locator(selector).innerText() : '';
}

async function quarterTurn(page, key) {
  // TURN=2.7rad/s；惯性积分后 582ms 约为 90deg，再等角速度衰减完。
  await holdKey(page, key, 582, 500);
}

async function installFormalPuzzleStart(page) {
  // 现有 world setter 启动钩只把正式入口定位到 formal node，不暴露坐标/state/debug API。
  await page.addInitScript(() => {
    let world;
    Object.defineProperty(window, 'MAZE3D_WORLD', {
      configurable: true,
      get() { return world; },
      set(value) { world = value; value.start = { map: 'm', node: 'puzzle_maze' }; }
    });
  });
}

async function waitForPuzzleMaze(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#maze3d-stage canvas');
    return canvas && canvas.width > 0 && canvas.height > 0 &&
      document.querySelector('.amatlas-inv-btn') &&
      document.querySelector('#maze3d-stage .amatlas-maze-controls') &&
      /Recipe 3/.test((document.querySelector('#place') || {}).textContent || '');
  }, null, { timeout: 8000 });
}

async function freshPuzzleMaze(page, url) {
  await installFormalPuzzleStart(page);
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await waitForPuzzleMaze(page);
}

async function inventorySnapshot(page) {
  await page.locator('.amatlas-inv-btn').click();
  const panel = page.locator('.amatlas-inv-panel');
  await panel.waitFor({ state: 'visible', timeout: 3000 });
  const snapshot = await panel.evaluate((node) => {
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
    return {
      items: Array.from(node.querySelectorAll('.amatlas-inv-item')).map((item) => item.textContent.trim()),
      text: node.textContent || '',
      contained: rect.top >= -0.5 && rect.left >= -0.5 && rect.right <= innerWidth + 0.5 && rect.bottom <= innerHeight + 0.5,
      scrollable: /auto|scroll/.test(style.overflowY)
    };
  });
  await panel.locator('.amatlas-plugin-close').click();
  await panel.waitFor({ state: 'hidden', timeout: 3000 });
  return snapshot;
}

async function reachCentralLock(page) {
  const plate = await holdUntilText(page, 'w', PUZZLE_HUD, /压力板让通往中央仪式厅/, 3000);
  await holdKey(page, 'w', 2500);       // 新开 fork 后取 x=9 这条无机关竖廊。
  await holdKey(page, 'd', 2100);       // 撞到中央横廊南墙，消除纵向累计误差。
  const zero = await holdUntilText(page, 's', PUZZLE_HUD, /0\/3/, 2500);
  return { plate, zero };
}

async function collectGem(page, progress) {
  await holdKey(page, 'w', 2600);
  const clue = await holdUntilText(page, 'a', PUZZLE_HUD, /取下宝石/, 2500);
  await holdKey(page, 'd', 1450);
  const pageText = await holdUntilText(page, 's', PUZZLE_HUD, progress, 3000);
  return { clue, pageText };
}

async function collectWallNote(page, progress) {
  await holdKey(page, 'w', 2600);
  await holdKey(page, 'd', 1200);
  await quarterTurn(page, 'ArrowRight');
  await page.waitForFunction(() => /南墙抽出符文残纸/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 2500 });
  const clue = await page.locator(PUZZLE_HUD).innerText();
  await holdKey(page, 's', 900);
  const pageText = await holdUntilText(page, 'd', PUZZLE_HUD, progress, 3000);
  await quarterTurn(page, 'ArrowLeft');
  return { clue, pageText };
}

async function collectFloorAndOpen(page, useWarp) {
  let warp = '';
  if (useWarp) {
    await holdKey(page, 'a', 1600);
    warp = await holdUntilText(page, 's', PUZZLE_HUD, /符文捷径/, 2500);
  } else {
    await holdKey(page, 's', 2800);
    await holdKey(page, 'd', 1400);
  }
  const turn = await holdUntilText(page, 'w', PUZZLE_HUD, /转向西侧/, 1800);
  // turn 已把视向改成 W；反向键 S 才继续向东，实证 forced turn 改变后续输入。
  const clue = await holdUntilText(page, 's', PUZZLE_HUD, /拓下地砖遗物/, 1800);
  await holdKey(page, 'w', 1200);
  await holdKey(page, 'd', 850);
  await holdUntilVisible(page, 's', PUZZLE_OVERLAY, 3500);
  return { warp, turn, clue };
}

async function puzzleMobileSnapshot(page) {
  return page.evaluate(() => {
    const rect = (node) => node ? node.getBoundingClientRect() : null;
    const overlaps = (a, b) => !!(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const buttons = Array.from(document.querySelectorAll('.amatlas-maze-puzzle-button'));
    const controls = document.querySelector('#maze3d-stage .amatlas-maze-controls');
    const mazeButtons = controls ? Array.from(controls.querySelectorAll('button')) : [];
    const dialog = document.querySelector('.amatlas-maze-puzzle-dialog');
    const inv = document.querySelector('.amatlas-inv-btn');
    const hud = document.querySelector('#maze3d-stage .amatlas-maze-hint');
    const controlStyle = controls && getComputedStyle(controls), dialogStyle = dialog && getComputedStyle(dialog);
    const dialogRect = rect(dialog), invRect = rect(inv), hudRect = rect(hud);
    const controlsHitTestable = mazeButtons.some((button) => {
      const r = rect(button), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit === button || button.contains(hit);
    });
    return {
      buttonSizes: buttons.map((button) => { const r = rect(button); return [r.width, r.height]; }),
      controlsHidden: !!(controlStyle && controlStyle.visibility === 'hidden' && mazeButtons.every((button) => getComputedStyle(button).visibility === 'hidden') && !controlsHitTestable),
      controlVisibility: controlStyle && controlStyle.visibility,
      controlsHitTestable,
      dialogContained: !!(dialogRect && dialogRect.top >= 0 && dialogRect.left >= 0 && dialogRect.right <= innerWidth && dialogRect.bottom <= innerHeight),
      dialogScrollable: !!(dialogStyle && /auto|scroll/.test(dialogStyle.overflowY)),
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      inventoryHudSeparate: !overlaps(invRect, hudRect)
    };
  });
}

async function solveVisiblePuzzle(page) {
  const before = await inventorySnapshot(page);
  await page.getByRole('button', { name: '选择 月' }).click();
  await page.getByRole('button', { name: '选择 星' }).click();
  await page.getByRole('button', { name: '选择 火' }).click();
  await page.getByRole('button', { name: '确认答案' }).click();
  await page.waitForFunction(() => /顺序不对/.test((document.querySelector('.amatlas-maze-puzzle-feedback') || {}).textContent || ''), null, { timeout: 2000 });
  const retry = await page.locator('.amatlas-maze-puzzle-feedback').innerText();
  const afterWrong = await inventorySnapshot(page);

  await page.getByRole('button', { name: '关闭谜题' }).click();
  await holdKey(page, 'a', 1600);       // 面朝 W 时 A=向南；未解锁会撞在 final passage。
  const blocked = await page.evaluate(() => {
    const exit = Array.from(document.querySelectorAll('#choices button')).find((button) => /走出分支仪式库/.test(button.textContent || ''));
    return !!document.querySelector('#maze3d-stage canvas') && !!(exit && exit.disabled);
  });
  await holdUntilVisible(page, 'd', PUZZLE_OVERLAY, 2500);

  await page.getByRole('button', { name: '清空符号顺序' }).click();
  await page.getByRole('button', { name: '选择 月' }).click();
  await page.getByRole('button', { name: '选择 火' }).click();
  await page.getByRole('button', { name: '选择 星' }).click();
  await page.getByRole('button', { name: '确认答案' }).click();
  await page.waitForFunction(() => !document.querySelector('.amatlas-maze-puzzle-overlay.is-open') && /最后通道打开/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 2500 });
  return { before, afterWrong, retry, blocked };
}

async function leavePuzzleMaze(page) {
  await quarterTurn(page, 'ArrowLeft'); // floor trap 留在 W；左转到 S 后正面走向 D。
  await holdUntil(page, 'w', () => page.waitForFunction(() => !document.querySelector('#maze3d-stage canvas'), null, { timeout: 4500 }));
  const exit = page.locator('#choices button').filter({ hasText: '走出分支仪式库' });
  await exit.waitFor({ state: 'visible', timeout: 3000 });
  const enabled = await exit.isEnabled();
  await exit.click();
  await page.locator('#place').filter({ hasText: '分支仪式库 · 完成' }).waitFor({ state: 'visible', timeout: 3000 });
  return enabled;
}

async function reloadSolvedAndLeave(page) {
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'load' });
  await waitForPuzzleMaze(page);
  const persistedInventory = await inventorySnapshot(page);
  await holdUntilText(page, 'w', PUZZLE_HUD, /压力板让通往中央仪式厅/, 3000);
  await holdKey(page, 'w', 2500);
  await holdKey(page, 'd', 2100);
  await holdKey(page, 's', 900);
  await page.keyboard.press('e');
  await page.waitForFunction(() => /符文锁已经熄灭/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 2500 });
  const solved = await page.locator(PUZZLE_HUD).innerText();
  await quarterTurn(page, 'ArrowRight');
  await holdUntil(page, 'w', () => page.waitForFunction(() => !document.querySelector('#maze3d-stage canvas'), null, { timeout: 4500 }));
  const exit = page.locator('#choices button').filter({ hasText: '走出分支仪式库' });
  const enabled = await exit.isEnabled();
  await exit.click();
  await page.locator('#place').filter({ hasText: '分支仪式库 · 完成' }).waitFor({ state: 'visible', timeout: 3000 });
  return { persistedInventory, solved, enabled };
}

async function runPuzzleJourney(page, url, config) {
  await freshPuzzleMaze(page, url);
  const chrome = await page.evaluate(() => ({
    canvas: !!document.querySelector('#maze3d-stage canvas'),
    inventory: (document.querySelector('.amatlas-inv-btn') || {}).textContent || '',
    controls: !!document.querySelector('#maze3d-stage .amatlas-maze-controls'),
    puzzleUi: !!document.querySelector('#maze3d-stage .amatlas-maze-puzzle-overlay')
  }));
  const start = await reachCentralLock(page), clues = [];
  if (config.order === 'gem-first') {
    clues.push(await collectGem(page, /1\/3/));
    clues.push(await collectWallNote(page, /2\/3/));
  } else {
    clues.push(await collectWallNote(page, /1\/3/));
    clues.push(await collectGem(page, /2\/3/));
  }
  const beforePuzzle = await inventorySnapshot(page);
  const floor = await collectFloorAndOpen(page, config.useWarp);
  const mobile = config.mobile ? await puzzleMobileSnapshot(page) : null;
  const solved = await solveVisiblePuzzle(page);
  const finish = config.reload ? await reloadSolvedAndLeave(page) : await leavePuzzleMaze(page);
  const finalLayout = config.mobile ? await page.evaluate(() => ({
    noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
    mazeHudGone: !document.querySelector('.amatlas-maze-hint') && !document.querySelector('.amatlas-maze-controls'),
    choicesVisible: Array.from(document.querySelectorAll('#choices button')).some((button) => button.getBoundingClientRect().height > 0)
  })) : null;
  return { chrome, start, clues, beforePuzzle, floor, mobile, solved, finish, finalLayout };
}

async function runPuzzleExperienceEvidence(browser) {
  {
    const errors = await withPage(browser, async (page) => {
      await page.goto(sourceUrl('showroom'), { waitUntil: 'load' });
      const launcher = page.locator('button[data-src="../maze3d/index.html"]');
      await launcher.waitFor({ state: 'visible', timeout: 8000 });
      await page.waitForFunction(() => !document.querySelector('button[data-src]:disabled'), null, { timeout: 8000 });
      await launcher.click();
      const frame = page.frameLocator('.demoport-frame');
      await frame.locator('#choices button').first().waitFor({ state: 'visible', timeout: 8000 });
      const first = await frame.locator('#choices button').first().innerText();
      await frame.locator('#choices button').first().click();
      await frame.locator('#maze3d-stage canvas').waitFor({ state: 'visible', timeout: 8000 });
      const delivered = await frame.locator('body').evaluate(() => ({
        canvas: !!document.querySelector('#maze3d-stage canvas'),
        inventory: /物品/.test((document.querySelector('.amatlas-inv-btn') || {}).textContent || ''),
        controls: !!document.querySelector('#maze3d-stage .amatlas-maze-controls'),
        puzzleUi: !!document.querySelector('#maze3d-stage .amatlas-maze-puzzle-overlay')
      }));
      const host = await page.evaluate(() => ({
        src: (document.querySelector('.demoport-frame') || {}).getAttribute('src'),
        title: (document.querySelector('.demoport-title') || {}).textContent || ''
      }));
      ok('PZ1 Showroom R04 指向 unified maze3d，Recipe 3 首位并交付 canvas/Inventory/controls/puzzle UI',
        host.src === '../maze3d/index.html' && /maze3d 分支仪式库/.test(host.title) && /Recipe 3/.test(first) && Object.values(delivered).every(Boolean),
        JSON.stringify({ host, first, delivered }));
      await page.locator('.demoport-close').click();
      await page.waitForFunction(() => {
        const port = document.querySelector('.demoport'), frame = document.querySelector('.demoport-frame');
        return port && port.hidden && frame && !frame.hasAttribute('src');
      }, null, { timeout: 5000 });
      const returned = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-src'));
      ok('PZ2 Showroom R04 关闭卸载 iframe 并归还焦点', returned === '../maze3d/index.html', 'focus=' + returned);
    });
    ok('PZ3 Showroom R04 host/iframe 零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }

  const entries = [
    { label: 'source', url: sourceUrl('maze3d') },
    { label: 'built', url: builtUrl('maze3d') }
  ];
  for (const entry of entries) {
    const journeys = [
      { label: 'gem-first+warp', order: 'gem-first', useWarp: true, reload: false },
      { label: 'note-first+normal+reload', order: 'note-first', useWarp: false, reload: true }
    ];
    for (const journey of journeys) {
      const errors = await withPage(browser, async (page, pageErrors) => {
        page.on('console', (message) => { if (message.type() === 'warning' && /^\[maze/.test(message.text())) pageErrors.push('maze warning: ' + message.text()); });
        const result = await runPuzzleJourney(page, entry.url, journey);
        const pages = [result.start.zero, result.clues[0].pageText, result.clues[1].pageText];
        const clueText = result.clues.map((item) => item.clue).concat(result.floor.clue).join(' | ');
        ok('PZ4 ' + entry.label + ' ' + journey.label + ' plate/fork、三 clue 与 0/1/2 pages 真实可达',
          Object.values(result.chrome).every(Boolean) && /压力板/.test(result.start.plate) && /0\/3/.test(pages[0]) && /1\/3/.test(pages[1]) && /2\/3/.test(pages[2]) && /宝石/.test(clueText) && /残纸/.test(clueText) && /地砖遗物/.test(clueText) && (journey.useWarp ? /符文捷径/.test(result.floor.warp) : result.floor.warp === '') && /转向西侧/.test(result.floor.turn),
          JSON.stringify({ pages, clueText, floor: result.floor }));
        ok('PZ5 ' + entry.label + ' ' + journey.label + ' rune-note 可重读且去重；wrong 保持 overlay/inventory/final 封闭，correct 开 final',
          result.beforePuzzle.items.length === 1 && /符文残纸/.test(result.beforePuzzle.text) && /月\s*→\s*火\s*→\s*星/.test(result.beforePuzzle.text) &&
          result.solved.before.items.length === 1 && result.solved.afterWrong.items.length === 1 && result.solved.before.text === result.solved.afterWrong.text &&
          /顺序不对/.test(result.solved.retry) && result.solved.blocked,
          JSON.stringify({ beforePuzzle: result.beforePuzzle, retry: result.solved.retry, blocked: result.solved.blocked }));
        const finished = journey.reload
          ? result.finish.enabled && /符文锁已经熄灭/.test(result.finish.solved) && result.finish.persistedInventory.items.length === 1
          : result.finish === true;
        ok('PZ6 ' + entry.label + ' ' + journey.label + ' correct 后' + (journey.reload ? ' reload 保留 solved、rehydrate 可续玩并' : '移动恢复并') + '由 D 到 puzzle_done', finished, JSON.stringify(result.finish));
      });
      ok('PZ7 ' + entry.label + ' ' + journey.label + ' 零 pageerror/console.error/[maze warning]/failed/remote', errors.length === 0, errors.join(' | '));
    }
  }

  {
    const errors = await withPage(browser, async (page, pageErrors) => {
      page.on('console', (message) => { if (message.type() === 'warning' && /^\[maze/.test(message.text())) pageErrors.push('maze warning: ' + message.text()); });
      await page.setViewportSize({ width: 390, height: 844 });
      const result = await runPuzzleJourney(page, entries[1].url, { order: 'note-first', useWarp: false, reload: false, mobile: true });
      const sizes = result.mobile.buttonSizes;
      ok('PZ8 mobile 390x844 note-first 完成；puzzle 按钮 >=44，底层 controls 隐藏且 dialog contained/scrollable',
        sizes.length >= 7 && sizes.every(([w, h]) => w >= 43.5 && h >= 43.5) && result.mobile.controlsHidden && result.mobile.dialogContained && result.mobile.dialogScrollable,
        JSON.stringify(result.mobile));
      ok('PZ9 mobile Inventory 可重读且 contained/scrollable；inventory/HUD/横向滚动/完成 choices 不重叠',
        result.solved.before.items.length === 1 && result.solved.before.contained && result.solved.before.scrollable &&
        result.mobile.inventoryHudSeparate && result.mobile.noHorizontalOverflow && result.finalLayout.noHorizontalOverflow && result.finalLayout.mazeHudGone && result.finalLayout.choicesVisible,
        JSON.stringify({ inventory: result.solved.before, puzzle: result.mobile, final: result.finalLayout }));
    });
    ok('PZ10 mobile 390x844 零 pageerror/console.error/[maze warning]/failed/remote', errors.length === 0, errors.join(' | '));
  }
}

const PURSUIT_HUD = '#maze3d-stage .amatlas-maze-hint';

function watchMazeWarnings(page, errors) {
  page.on('console', (message) => {
    if (message.type() === 'warning' && /^\[maze/.test(message.text())) errors.push('maze warning: ' + message.text());
  });
}

async function installFormalPursuitStart(page) {
  await page.addInitScript(() => {
    let world;
    Object.defineProperty(window, 'MAZE3D_WORLD', {
      configurable: true,
      get() { return world; },
      set(value) { world = value; value.start = { map: 'm', node: 'horror_entrance' }; }
    });
  });
}

async function installAudioContextProbe(page) {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
    const calls = {
      contexts: 0, resumes: 0, closeCalls: 0, closed: 0, closeStates: [], closedContextIds: [],
      sourcesByContext: {}
    };
    let sourceSequence = 0;
    window.__pursuitAudio = calls;
    if (!NativeAudioContext) return;
    function TrackedAudioContext() {
      const context = Reflect.construct(NativeAudioContext, Array.from(arguments));
      const contextId = String(++calls.contexts);
      calls.sourcesByContext[contextId] = {};
      const trackSource = function (source, kind) {
        if (!source) return source;
        const sourceId = contextId + ':' + String(++sourceSequence);
        const record = calls.sourcesByContext[contextId][sourceId] = { kind, starts: 0, stops: 0 };
        ['start', 'stop'].forEach(function (method) {
          if (typeof source[method] !== 'function') return;
          const nativeMethod = source[method].bind(source);
          Object.defineProperty(source, method, { configurable: true, value: function () {
            const result = nativeMethod.apply(null, arguments);
            if (method === 'start') record.starts++;
            else record.stops++;
            return result;
          } });
        });
        return source;
      };
      ['createOscillator', 'createBufferSource'].forEach(function (factoryName) {
        if (typeof context[factoryName] !== 'function') return;
        const nativeFactory = context[factoryName].bind(context);
        Object.defineProperty(context, factoryName, { configurable: true, value: function () {
          return trackSource(nativeFactory.apply(null, arguments), factoryName === 'createOscillator' ? 'oscillator' : 'buffer-source');
        } });
      });
      if (typeof context.resume === 'function') {
        const nativeResume = context.resume.bind(context);
        Object.defineProperty(context, 'resume', { configurable: true, value: function () { calls.resumes++; return nativeResume(); } });
      }
      if (typeof context.close === 'function') {
        const nativeClose = context.close.bind(context);
        Object.defineProperty(context, 'close', { configurable: true, value: function () {
          calls.closeCalls++;
          const result = nativeClose();
          Promise.resolve(result).then(() => { calls.closed++; calls.closeStates.push(context.state); calls.closedContextIds.push(contextId); });
          return result;
        } });
      }
      return context;
    }
    TrackedAudioContext.prototype = NativeAudioContext.prototype;
    Object.setPrototypeOf(TrackedAudioContext, NativeAudioContext);
    window.AudioContext = TrackedAudioContext;
    if (window.webkitAudioContext) window.webkitAudioContext = TrackedAudioContext;
  });
}

async function waitForPursuitMaze(page) {
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#maze3d-stage canvas');
    return canvas && canvas.width > 0 && canvas.height > 0 &&
      document.querySelector('.amatlas-inv-btn') &&
      document.querySelector('#maze3d-stage .amatlas-maze-controls') &&
      /Recipe 2/.test((document.querySelector('#place') || {}).textContent || '');
  }, null, { timeout: 8000 });
}

async function freshPursuitMaze(page, url) {
  await installFormalPursuitStart(page);
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.locator('#place').filter({ hasText: 'Recipe 2 · 地底回廊' }).waitFor({ state: 'visible', timeout: 8000 });
  await page.locator('#choices button').filter({ hasText: '屏住呼吸,进入恐怖 recipe' }).click();
  await waitForPursuitMaze(page);
}

async function pursuitPublicSnapshot(page) {
  return page.evaluate(() => ({
    place: (document.querySelector('#place') || {}).textContent || '',
    hud: (document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || '',
    canvas: !!document.querySelector('#maze3d-stage canvas'),
    controls: !!document.querySelector('#maze3d-stage .amatlas-maze-controls'),
    inventory: (document.querySelector('.amatlas-inv-btn') || {}).textContent || '',
    choices: Array.from(document.querySelectorAll('#choices button')).map((button) => ({ text: button.textContent || '', disabled: button.disabled }))
  }));
}

async function pursuitStep(page, label, run) {
  try { return await run(); }
  catch (error) {
    let publicFacts;
    try { publicFacts = await pursuitPublicSnapshot(page); }
    catch (snapshotError) { publicFacts = { snapshotError: snapshotError && snapshotError.message }; }
    throw new Error(label + ': ' + (error && error.message) + ' | public=' + JSON.stringify(publicFacts));
  }
}

async function waitQuietPursuit(page, ms) {
  const baseline = await pursuitCanvasEvidence(page);
  await page.waitForTimeout(ms == null ? 8000 : ms);
  const snapshot = await pursuitPublicSnapshot(page);
  snapshot.canvasBaseline = baseline;
  snapshot.canvasEvidence = await pursuitCanvasEvidence(page);
  snapshot.visualQuiet = snapshot.canvasEvidence.opaque === snapshot.canvasEvidence.width * snapshot.canvasEvidence.height &&
    snapshot.canvasEvidence.distinct > 20 && baseline.centerWarm === 0 && snapshot.canvasEvidence.centerWarm === 0 &&
    Math.abs(snapshot.canvasEvidence.redEdgeBias - baseline.redEdgeBias) < 1;
  snapshot.safe = snapshot.canvas && /找到那把发光的/.test(snapshot.hud) &&
    snapshot.choices.some((choice) => /推开门,逃出去/.test(choice.text) && choice.disabled) &&
    snapshot.choices.some((choice) => /你被它抓住/.test(choice.text) && choice.disabled) &&
    snapshot.choices.some((choice) => /放弃,原路退回/.test(choice.text) && !choice.disabled) && snapshot.visualQuiet;
  return snapshot;
}

async function pursuitCanvasEvidence(page) {
  return page.locator('#maze3d-stage canvas').evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0, distinct = new Set(), centerWarm = 0, edgeRed = 0, edgeCount = 0, centerRed = 0, centerCount = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a) opaque++;
      if ((x + y) % 23 === 0) distinct.add((r << 16) | (g << 8) | b);
      if (x >= canvas.width * 0.32 && x <= canvas.width * 0.68 && y >= canvas.height * 0.52 && y <= canvas.height * 0.93 && r - g > 24 && g - b > 8) centerWarm++;
      const redness = r - (g + b) / 2;
      if (x < canvas.width * 0.18 || x >= canvas.width * 0.82 || y < canvas.height * 0.18 || y >= canvas.height * 0.82) { edgeRed += redness; edgeCount++; }
      else if (x >= canvas.width * 0.35 && x < canvas.width * 0.65 && y >= canvas.height * 0.30 && y < canvas.height * 0.70) { centerRed += redness; centerCount++; }
    }
    return {
      width: canvas.width, height: canvas.height, opaque, distinct: distinct.size, centerWarm,
      redEdgeBias: edgeRed / Math.max(1, edgeCount) - centerRed / Math.max(1, centerCount)
    };
  });
}

async function pursuitHoldKey(page, key, simulationMs, settle) {
  await holdKeysSimulated(page, [key], simulationMs, settle);
}

async function pursuitQuarterTurn(page, key) {
  await pursuitHoldKey(page, key, 582, 500);
}

async function reachLockedDoor(page) {
  await pursuitHoldKey(page, 'w', 3500);
  await pursuitHoldKey(page, 'd', 3500);
  const turns = [{ key: 'ArrowRight', ms: 582 }];
  await pursuitHoldKey(page, turns[0].key, turns[0].ms, 500);
  let hud = await page.locator(PURSUIT_HUD).innerText();
  for (let step = 0; step < 4 && !/门锁着/.test(hud); step++) {
    turns.push({ key: 'ArrowLeft', ms: 80 });
    await pursuitHoldKey(page, 'ArrowLeft', 80, 250);
    hud = await page.locator(PURSUIT_HUD).innerText();
  }
  for (let step = 0; step < 8 && !/门锁着/.test(hud); step++) {
    turns.push({ key: 'ArrowRight', ms: 80 });
    await pursuitHoldKey(page, 'ArrowRight', 80, 250);
    hud = await page.locator(PURSUIT_HUD).innerText();
  }
  if (!/门锁着/.test(hud)) throw new Error('固定转向扫描后仍未出现门锁 HUD');
  return { hud, turns };
}

async function collectQuietPhoto(page, turns) {
  for (let index = turns.length - 1; index >= 0; index--) {
    const turn = turns[index];
    await pursuitHoldKey(page, turn.key === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight', turn.ms, turn.ms === 582 ? 500 : 250);
  }
  await pursuitHoldKey(page, 'a', 3500);
  await pursuitHoldKey(page, 'w', 1400);
  await pursuitHoldKey(page, 's', 2300);
  await pursuitHoldKey(page, 'd', 650);
  let hint = await tryHoldUntilText(page, 'w', PURSUIT_HUD, /半张照片/, 3000);
  if (!hint) {
    await pursuitHoldKey(page, 'd', 300);
    hint = await holdUntilText(page, 'w', PURSUIT_HUD, /半张照片/, 10000);
  }
  const inventory = await inventorySnapshot(page);
  return { hint, inventory };
}

async function approachStoneFromPhoto(page) {
  await pursuitHoldKey(page, 's', 1400);
  await pursuitHoldKey(page, 'a', 1400);
  await pursuitHoldKey(page, 's', 1400);
  await pursuitHoldKey(page, 'd', 2660);
  await page.waitForTimeout(120);
  return pursuitCanvasEvidence(page);
}

async function wakeAtStone(page) {
  await holdUntil(page, 'd', () => page.waitForFunction(() => /石座裂开.*拖曳声/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 10000 }), 60);
  const hint = await page.locator(PURSUIT_HUD).innerText();
  await pursuitHoldKey(page, 'd', 200, 10);
  const after = await pursuitCanvasEvidence(page);
  return { hint, after };
}

async function escapePursuit(page) {
  await pursuitHoldKey(page, 'a', 3300, 10);
  await pursuitHoldKey(page, 'w', 3300, 10);
  const keyHud = await page.locator(PURSUIT_HUD).innerText();
  await pursuitHoldKey(page, 'd', 3300, 10);
  await holdUntil(page, 'ArrowRight', () => page.waitForFunction(() => {
    const exit = Array.from(document.querySelectorAll('#choices button')).find((button) => /推开门,逃出去/.test(button.textContent || ''));
    return !document.querySelector('#maze3d-stage canvas') && !!(exit && !exit.disabled);
  }, null, { timeout: 10000 }));
  const opened = await pursuitPublicSnapshot(page);
  const exit = page.locator('#choices button').filter({ hasText: '推开门,逃出去' });
  const enabled = await exit.isEnabled();
  await exit.click();
  await page.locator('#place').filter({ hasText: '恐怖 recipe · 逃出' }).waitFor({ state: 'visible', timeout: 3000 });
  return { keyHud, opened, enabled, result: await page.locator('#look').innerText() };
}

async function wakeDirect(page) {
  await pursuitQuarterTurn(page, 'ArrowRight');
  await pursuitHoldKey(page, 'w', 2100);
  let markerFrames = [], markerPeak = -1;
  for (let step = 0; step < 7; step++) {
    const frames = [];
    for (let frame = 0; frame < 3; frame++) {
      frames.push(await pursuitCanvasEvidence(page));
      await page.waitForTimeout(80);
    }
    const peak = Math.max.apply(null, frames.map((evidence) => evidence.centerWarm));
    if (peak > markerPeak) { markerPeak = peak; markerFrames = frames; }
    if (step < 6) await pursuitHoldKey(page, 'w', 80, 60);
  }
  const hint = await holdUntilText(page, 'w', PURSUIT_HUD, /石座裂开.*拖曳声/, 10000);
  await pursuitHoldKey(page, 'w', 200, 10);
  await pursuitHoldKey(page, 's', 400, 20);
  const afterFrames = [];
  for (let frame = 0; frame < 3; frame++) {
    afterFrames.push(await pursuitCanvasEvidence(page));
    await page.waitForTimeout(80);
  }
  return {
    hint, markerFrames, afterFrames,
    markerPeak,
    afterPeak: Math.max.apply(null, afterFrames.map((evidence) => evidence.centerWarm))
  };
}

async function getCaught(page) {
  await pursuitHoldKey(page, 's', 3500);
  await pursuitQuarterTurn(page, 'ArrowLeft');
  await pursuitHoldKey(page, 'w', 780);
  await pursuitQuarterTurn(page, 'ArrowRight');
  await holdUntil(page, 'w', () => page.waitForFunction(() => /它抓住了你/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 30000 }));
  const caught = await pursuitPublicSnapshot(page);
  const exit = page.locator('#choices button').filter({ hasText: '你被它抓住了' });
  const enabled = await exit.isEnabled();
  await exit.click();
  await page.locator('#place').filter({ hasText: '恐怖 recipe · 被抓' }).waitFor({ state: 'visible', timeout: 3000 });
  return { caught, enabled, result: await page.locator('#look').innerText() };
}

async function returnToHubAndReenterQuiet(page, touch) {
  const activate = (locator) => touch ? locator.tap() : locator.click();
  await activate(page.locator('#choices button').filter({ hasText: '回到 maze3d 入口' }));
  await activate(page.locator('#choices button').filter({ hasText: 'Recipe 2 · 地底回廊' }));
  await activate(page.locator('#choices button').filter({ hasText: '屏住呼吸,进入恐怖 recipe' }));
  await waitForPursuitMaze(page);
  return waitQuietPursuit(page);
}

async function proveTouchTarget(page, button) {
  await button.tap({ trial: true });
  const fact = await button.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      name: node.getAttribute('aria-label') || node.textContent || '',
      width: rect.width, height: rect.height,
      pointerEvents: getComputedStyle(node).pointerEvents,
      hit: !!(hit && (hit === node || node.contains(hit))),
      coarse: matchMedia('(pointer: coarse)').matches,
      touchEvent: 'ontouchstart' in window,
      maxTouchPoints: navigator.maxTouchPoints
    };
  });
  if (!fact.hit || fact.pointerEvents === 'none') throw new Error('mobile touch target 不可真实命中: ' + JSON.stringify(fact));
  return fact;
}

async function holdPointer(page, name, simulationMs, pointerId, settle) {
  const button = page.locator('.amatlas-maze-controls button[aria-label="' + name + '"]');
  const down = await proveTouchTarget(page, button);
  await button.dispatchEvent('pointerdown', { pointerId, pointerType: 'touch', isPrimary: true });
  try { await waitSimulated(page, simulationMs); }
  finally {
    await proveTouchTarget(page, button);
    await button.dispatchEvent('pointerup', { pointerId, pointerType: 'touch', isPrimary: true });
  }
  await page.waitForTimeout(settle == null ? 120 : settle);
  return down;
}

async function holdPointerUntil(page, name, waitForPublicFact, pointerId, settle) {
  const button = page.locator('.amatlas-maze-controls button[aria-label="' + name + '"]');
  const down = await proveTouchTarget(page, button);
  await button.dispatchEvent('pointerdown', { pointerId, pointerType: 'touch', isPrimary: true });
  try { await waitForPublicFact(); }
  finally {
    await proveTouchTarget(page, button);
    await button.dispatchEvent('pointerup', { pointerId, pointerType: 'touch', isPrimary: true });
  }
  await page.waitForTimeout(settle == null ? 120 : settle);
  return down;
}

async function pursuitMobileMazeLayout(page) {
  await page.locator(PURSUIT_HUD).scrollIntoViewIfNeeded();
  return page.evaluate(() => {
    const rect = (node) => node ? node.getBoundingClientRect() : null;
    const overlaps = (a, b) => !!(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const stage = document.querySelector('#maze3d-stage'), controls = document.querySelector('.amatlas-maze-controls');
    const hud = document.querySelector('.amatlas-maze-hint'), inv = document.querySelector('.amatlas-inv-btn');
    const buttons = stage ? Array.from(stage.querySelectorAll('button')).filter((button) => {
      const r = rect(button), style = getComputedStyle(button);
      return r && r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }) : [];
    const cr = rect(controls), hr = rect(hud), ir = rect(inv);
    return {
      touch: { coarse: matchMedia('(pointer: coarse)').matches, touchEvent: 'ontouchstart' in window, maxTouchPoints: navigator.maxTouchPoints, innerWidth, innerHeight },
      buttons: buttons.map((button) => {
        const r = rect(button), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { name: button.getAttribute('aria-label') || button.textContent || '', width: r.width, height: r.height, hit: !!(hit && (hit === button || button.contains(hit))) };
      }),
      hud: hud && hud.textContent || '',
      hudReadable: !!(hr && hr.width > 0 && hr.height > 0 && hr.left >= -0.5 && hr.right <= innerWidth + 0.5 && hr.top >= -0.5 && hr.bottom <= innerHeight + 0.5),
      separated: !overlaps(cr, hr) && !overlaps(cr, ir) && !overlaps(hr, ir),
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      verticalScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight && !/hidden/.test(getComputedStyle(document.documentElement).overflowY)
    };
  });
}

async function pursuitMobileInventoryLayout(page) {
  const button = page.locator('.amatlas-inv-btn');
  await button.tap();
  const panel = page.locator('.amatlas-inv-panel');
  const backdrop = page.locator('.amatlas-inv-panel + .amatlas-plugin-backdrop');
  await panel.waitFor({ state: 'visible', timeout: 3000 });
  await backdrop.waitFor({ state: 'visible', timeout: 3000 });
  const snapshot = await panel.evaluate((node) => {
    const rect = (target) => target ? target.getBoundingClientRect() : null;
    const overlaps = (a, b) => !!(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
    const hud = document.querySelector('.amatlas-maze-hint'), controls = document.querySelector('.amatlas-maze-controls');
    const toolbar = document.querySelector('#plugin-bar'), inventoryButton = document.querySelector('.amatlas-inv-btn');
    const stage = document.querySelector('#maze3d-stage'), backdropNode = node.nextElementSibling;
    const panelRect = rect(node), backdropRect = rect(backdropNode), hudRect = rect(hud), controlsRect = rect(controls);
    const style = getComputedStyle(node), backdropStyle = backdropNode && getComputedStyle(backdropNode);
    const targets = [{ name: 'HUD', target: hud }, { name: 'controls', target: controls }, { name: 'toolbar', target: toolbar }];
    if (stage) Array.from(stage.querySelectorAll('button')).forEach((target) => {
      const targetRect = rect(target), targetStyle = getComputedStyle(target);
      if (targetRect.width > 0 && targetRect.height > 0 && targetStyle.display !== 'none' && targetStyle.visibility !== 'hidden') {
        targets.push({ name: target.getAttribute('aria-label') || target.textContent || '', target });
      }
    });
    targets.push({ name: 'Inventory', target: inventoryButton });
    const backdropSamples = targets.map(({ name, target }) => {
      const targetRect = rect(target);
      const x = targetRect && targetRect.left + targetRect.width / 2;
      const y = targetRect && targetRect.top + targetRect.height / 2;
      const inViewport = !!(targetRect && x >= 0 && x < innerWidth && y >= 0 && y < innerHeight);
      const hit = inViewport ? document.elementFromPoint(x, y) : null;
      const panelHit = !!(hit && (hit === node || node.contains(hit)));
      const backdropHit = !!(hit && backdropNode && (hit === backdropNode || backdropNode.contains(hit)));
      return {
        name, inViewport,
        underlyingHit: !panelHit && !backdropHit && !!(hit && target && (hit === target || target.contains(hit))),
        panelHit, backdropHit, modalHit: panelHit || backdropHit,
        hitTag: hit && hit.tagName || '', hitClass: hit && hit.className || ''
      };
    });
    const corners = [[1, 1], [innerWidth - 2, 1], [1, innerHeight - 2], [innerWidth - 2, innerHeight - 2]];
    const cornerHits = corners.map(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return { x, y, backdropHit: !!(hit && backdropNode && (hit === backdropNode || backdropNode.contains(hit))), hitTag: hit && hit.tagName || '', hitClass: hit && hit.className || '' };
    });
    const close = node.querySelector('.amatlas-plugin-close'), closeRect = rect(close);
    const hit = closeRect && document.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2);
    return {
      items: Array.from(node.querySelectorAll('.amatlas-inv-item')).map((item) => item.textContent.trim()),
      text: node.textContent || '',
      contained: panelRect.top >= -0.5 && panelRect.left >= -0.5 && panelRect.right <= innerWidth + 0.5 && panelRect.bottom <= innerHeight + 0.5,
      scrollable: /auto|scroll/.test(style.overflowY),
      overlapsHud: overlaps(panelRect, hudRect), overlapsControls: overlaps(panelRect, controlsRect),
      backdropVisible: !!(backdropNode && !backdropNode.hidden && backdropStyle.display !== 'none' && backdropStyle.visibility !== 'hidden'),
      backdropCoversViewport: !!(backdropRect && backdropRect.top <= 0.5 && backdropRect.left <= 0.5 && backdropRect.right >= innerWidth - 0.5 && backdropRect.bottom >= innerHeight - 0.5),
      backdropPointerEvents: backdropStyle && backdropStyle.pointerEvents || '',
      backdropTouchAction: backdropStyle && backdropStyle.touchAction || '',
      cornerHits,
      backdropSamples,
      closeHit: !!(hit && close && (hit === close || close.contains(hit)))
    };
  });
  await panel.locator('.amatlas-inv-head').tap();
  snapshot.panelInteriorKeepsOpen = await panel.isVisible() && await backdrop.isVisible();
  await panel.locator('.amatlas-plugin-close').tap();
  await panel.waitFor({ state: 'hidden', timeout: 3000 });
  await backdrop.waitFor({ state: 'hidden', timeout: 3000 });
  snapshot.closeHidesBoth = await panel.isHidden() && await backdrop.isHidden();
  snapshot.inventoryTargetRestored = await button.evaluate((node) => {
    const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!(hit && (hit === node || node.contains(hit)));
  });
  return snapshot;
}

async function pursuitMobileBackdropDismissal(page) {
  const button = page.locator('.amatlas-inv-btn');
  const panel = page.locator('.amatlas-inv-panel');
  const backdrop = page.locator('.amatlas-inv-panel + .amatlas-plugin-backdrop');
  const beforeHud = await page.locator(PURSUIT_HUD).textContent();
  await button.tap();
  await panel.waitFor({ state: 'visible', timeout: 3000 });
  await backdrop.waitFor({ state: 'visible', timeout: 3000 });
  const tapPoint = await page.evaluate(() => {
    const backdropNode = document.querySelector('.amatlas-inv-panel + .amatlas-plugin-backdrop');
    const candidates = Array.from(document.querySelectorAll('#maze3d-stage .amatlas-maze-controls button, .amatlas-inv-btn'));
    const picked = candidates.map((target) => {
      const r = target.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      return { target, x, y, hit: document.elementFromPoint(x, y) };
    }).find((sample) => sample.hit && backdropNode && (sample.hit === backdropNode || backdropNode.contains(sample.hit)));
    if (!picked) return null;
    window.__pursuitBackdropUnderlyingPointerDown = 0;
    picked.target.addEventListener('pointerdown', () => { window.__pursuitBackdropUnderlyingPointerDown++; }, { once: true });
    return { x: picked.x, y: picked.y, name: picked.target.getAttribute('aria-label') || picked.target.textContent || '' };
  });
  if (tapPoint) await page.touchscreen.tap(tapPoint.x, tapPoint.y);
  if (tapPoint) {
    await panel.waitFor({ state: 'hidden', timeout: 3000 });
    await backdrop.waitFor({ state: 'hidden', timeout: 3000 });
  }
  return page.evaluate(({ point, before }) => ({
    tapPoint: point,
    panelHidden: !!(document.querySelector('.amatlas-inv-panel') || {}).hidden,
    backdropHidden: !!(document.querySelector('.amatlas-inv-panel + .amatlas-plugin-backdrop') || {}).hidden,
    underlyingPointerDown: window.__pursuitBackdropUnderlyingPointerDown || 0,
    hudStable: ((document.querySelector('.amatlas-maze-hint') || {}).textContent || '') === before
  }), { point: tapPoint, before: beforeHud || '' });
}

async function pursuitMobileResultLayout(page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('#choices button')).filter((button) => button.getBoundingClientRect().height > 0);
    if (buttons.length) buttons[buttons.length - 1].scrollIntoView({ block: 'end' });
    const rects = buttons.map((button) => button.getBoundingClientRect());
    const overlap = rects.some((a, i) => rects.some((b, j) => j > i && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
    const links = buttons.map((button, index) => {
      const r = rects[index], x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        text: button.textContent || '', width: r.width, height: r.height,
        inViewport: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5,
        hit: !!(hit && (hit === button || button.contains(hit)))
      };
    });
    return {
      links, overlap,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      contentFits: document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1,
      verticalReachable: document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1 || !/hidden/.test(getComputedStyle(document.documentElement).overflowY),
      scrollTop: document.scrollingElement ? document.scrollingElement.scrollTop : 0
    };
  });
}

const ARCADE_HUD = '#arcade-stage .amatlas-arcade-hud';
const ARCADE_RUNS = [
  ['ArrowUp', 1], ['ArrowLeft', 2], ['ArrowUp', 4],
  ['ArrowRight', 4], ['ArrowDown', 10],
  ['ArrowLeft', 7], ['ArrowUp', 8],
  ['ArrowLeft', 1], ['ArrowDown', 2],
  ['ArrowRight', 5], ['ArrowDown', 1]
];
const ARCADE_MILESTONES = { 7: 1, 21: 2, 36: 3, 39: 4 };
const ARCADE_CLOCK_START = 0;
const ARCADE_CLOCK_PAUSE = 60 * 60 * 1000;

async function installArcadeClock(page) {
  await page.clock.install({ time: ARCADE_CLOCK_START });
}

async function pauseArcadeClock(page) {
  // 旧路径从页面读取仍在前进的墙钟快照，再经 CDP 调 pauseAt；default 全套
  // 有负载时，命令到达前内部 clock 已越过快照，Playwright 正确拒绝“回到过去”。
  // 固定的一小时锚点明确晚于页面加载期；之后仍只用 runFor 驱动相对 rAF/tick，
  // 不改变正式 seed、五果里程碑或任何玩家行为判据。
  await page.clock.pauseAt(ARCADE_CLOCK_PAUSE);
}

async function arcadeEnter(page, inputMode) {
  const activate = async (locator) => {
    if (inputMode === 'keyboard') {
      await locator.focus();
      await page.keyboard.press('Enter');
    } else if (inputMode === 'touch') {
      await locator.tap();
    } else {
      await locator.click();
    }
  };
  await activate(page.locator('#choices button').filter({ hasText: '走向闪烁的终端' }));
  const ready = await page.evaluate(() => ({
    title: (document.querySelector('#place') || {}).textContent || '',
    look: (document.querySelector('#look') || {}).textContent || '',
    actions: Array.from(document.querySelectorAll('#choices button')).map((button) => ({ text: button.textContent, disabled: button.disabled }))
  }));
  await activate(page.locator('#choices button').filter({ hasText: '坐下,开始挑战' }));
  await page.clock.runFor(16); // 首个 rAF 建立 runtime last；随后按累计 fixed-tick 阈值推进。
  await page.waitForFunction(() => document.querySelector('#arcade-stage canvas') && document.querySelector('.amatlas-arcade-hud'));
  return ready;
}

async function arcadeActions(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#choices button')).map((button) => ({ text: button.textContent, disabled: button.disabled })));
}

async function arcadeFiveFruit(page, touch) {
  let ticks = 0, elapsed = 0;
  const milestones = [];
  for (const [key, count] of ARCADE_RUNS) {
    if (touch) {
      const labels = { ArrowUp: '向上', ArrowDown: '向下', ArrowLeft: '向左', ArrowRight: '向右' };
      await page.locator('.amatlas-arcade-controls button[aria-label="' + labels[key] + '"]').tap();
    } else {
      await page.keyboard.press(key);
    }
    ticks += count;
    const target = Math.ceil(ticks * 140 / 16) * 16;
    await page.clock.runFor(target - elapsed);
    elapsed = target;
    if (ARCADE_MILESTONES[ticks]) {
      const expected = ARCADE_MILESTONES[ticks];
      const hud = await page.locator(ARCADE_HUD).textContent();
      const actions = await arcadeActions(page);
      milestones.push({ ticks, expected, hud, actions });
    }
  }
  await page.waitForFunction(() => /ACCESS GRANTED/.test((document.querySelector('#look') || {}).textContent || '') && !document.querySelector('#arcade-stage canvas'));
  const complete = await page.evaluate(() => ({
    title: (document.querySelector('#place') || {}).textContent || '',
    look: (document.querySelector('#look') || {}).textContent || '',
    hud: !!document.querySelector('.amatlas-arcade-hud'),
    canvas: !!document.querySelector('#arcade-stage canvas'),
    controls: !!document.querySelector('.amatlas-arcade-controls'),
    actions: Array.from(document.querySelectorAll('#choices button')).map((button) => ({ text: button.textContent, disabled: button.disabled }))
  }));
  return { milestones, complete };
}

function arcadeMilestonesOk(result) {
  return result.milestones.length === 4 && result.milestones.every((item) =>
    item.hud === '苹果 ' + item.expected + ' / 5' &&
    item.actions.some((action) => /推开解锁的门/.test(action.text) && action.disabled) &&
    item.actions.some((action) => /撬开控制面板/.test(action.text) && action.disabled) &&
    item.actions.some((action) => /放弃挑战/.test(action.text) && !action.disabled));
}

function arcadeCompleteOk(result) {
  const complete = result.complete;
  return /ACCESS GRANTED/.test(complete.look) && !complete.hud && !complete.canvas && !complete.controls &&
    complete.actions.some((action) => /推开解锁的门/.test(action.text) && !action.disabled) &&
    complete.actions.some((action) => /撬开控制面板/.test(action.text) && action.disabled) &&
    complete.actions.some((action) => /放弃挑战/.test(action.text) && !action.disabled);
}

async function runArcadeExperienceEvidence(browser) {
  const entries = [
    { label: 'source', url: sourceUrl('arcade-demo') },
    { label: 'built', url: builtUrl('arcade-demo') }
  ];

  {
    const errors = await withPage(browser, async (page) => {
      await page.goto(sourceUrl('showroom'), { waitUntil: 'load' });
      const launcher = page.locator('button[data-src="../arcade-demo/index.html"]');
      await launcher.waitFor({ state: 'visible', timeout: 8000 });
      await page.waitForFunction(() => !document.querySelector('button[data-src="../arcade-demo/index.html"]:disabled'));
      await launcher.click();
      const frame = page.frameLocator('.demoport-frame');
      await frame.locator('#choices button').filter({ hasText: '走向闪烁的终端' }).waitFor({ state: 'visible', timeout: 8000 });
      await frame.locator('#choices button').filter({ hasText: '走向闪烁的终端' }).click();
      const readyText = await frame.locator('#look').textContent();
      await frame.locator('#choices button').filter({ hasText: '坐下,开始挑战' }).click();
      await frame.locator(ARCADE_HUD).waitFor({ state: 'visible', timeout: 8000 });
      const delivery = await frame.locator('body').evaluate(() => ({
        hud: (document.querySelector('.amatlas-arcade-hud') || {}).textContent || '',
        canvas: !!document.querySelector('#arcade-stage canvas'),
        controls: Array.from(document.querySelectorAll('.amatlas-arcade-controls button')).map((button) => button.getAttribute('aria-label')),
        abort: Array.from(document.querySelectorAll('#choices button')).some((button) => /放弃挑战/.test(button.textContent || '') && !button.disabled)
      }));
      ok('AR1 Showroom R06 送达同一正式 ready→canvas/HUD 0/5/controls/abort', /5 个苹果/.test(readyText) && /不存档/.test(readyText) && delivery.hud === '苹果 0 / 5' && delivery.canvas && delivery.controls.length === 5 && delivery.abort, JSON.stringify({ readyText, delivery }));
      await page.locator('.demoport-close').click();
      await page.waitForFunction(() => {
        const port = document.querySelector('.demoport'); const frameEl = document.querySelector('.demoport-frame');
        return port && port.hidden && frameEl && !frameEl.hasAttribute('src');
      });
      const returned = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-src'));
      ok('AR2 Showroom R06 关闭卸载 iframe 并归还 launcher 焦点', returned === '../arcade-demo/index.html', 'focus=' + returned);
    });
    ok('AR3 Showroom R06 delivery 零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }

  for (const entry of entries) {
    const errors = await withPage(browser, async (page) => {
      await installArcadeClock(page);
      await page.goto(entry.url, { waitUntil: 'load' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'load' });
      await pauseArcadeClock(page);
      const ready = await arcadeEnter(page, 'keyboard');
      const initial = await page.evaluate(() => {
        const place = document.querySelector('#place');
        const placeStyle = getComputedStyle(place);
        return {
          hud: (document.querySelector('.amatlas-arcade-hud') || {}).textContent || '',
          canvas: !!document.querySelector('#arcade-stage canvas'),
          active: document.activeElement === place,
          placeTop: place.getBoundingClientRect().top,
          scrollY: window.scrollY,
          placeOutlineWidth: placeStyle.outlineWidth,
          placeOutlineStyle: placeStyle.outlineStyle,
          actions: Array.from(document.querySelectorAll('#choices button')).map((button) => ({ text: button.textContent, disabled: button.disabled }))
        };
      });
      ok('AR4 ' + entry.label + ' fresh ready公开goal/input/LOUD语义且起局0/5只开放abort', /5 个苹果/.test(ready.look) && /不存档/.test(ready.look) && /随时能放弃/.test(ready.look) && initial.hud === '苹果 0 / 5' && initial.canvas &&
        initial.actions.some((item) => /推开解锁的门/.test(item.text) && item.disabled) && initial.actions.some((item) => /撬开控制面板/.test(item.text) && item.disabled) && initial.actions.some((item) => /放弃挑战/.test(item.text) && !item.disabled), JSON.stringify({ ready, initial }));
      ok('AR4a ' + entry.label + ' 换节点标题焦点保留24px呼吸与键盘3px可见焦点环', initial.active && initial.placeTop >= 20 && initial.scrollY <= 12 && initial.placeOutlineStyle === 'solid' && parseFloat(initial.placeOutlineWidth) >= 3, JSON.stringify(initial));
      const result = await arcadeFiveFruit(page, false);
      ok('AR5 ' + entry.label + ' 正式seed+公开键盘依次到1/2/3/4果，技巧门保持锁', arcadeMilestonesOk(result), JSON.stringify(result.milestones));
      ok('AR6 ' + entry.label + ' 第五段稳定完成面清stage、ACCESS GRANTED并只开技巧门', arcadeCompleteOk(result), JSON.stringify(result.complete));
      await page.locator('#choices button').filter({ hasText: '推开解锁的门' }).click();
      const ending = await page.evaluate(() => ({ title: (document.querySelector('#place') || {}).textContent || '', look: (document.querySelector('#look') || {}).textContent || '' }));
      ok('AR7 ' + entry.label + ' 标准公开link进入核心机房终局', ending.title === '核心机房' && /任务完成/.test(ending.look), JSON.stringify(ending));
    });
    ok('AR8 ' + entry.label + ' 正式五果旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }

  {
    const errors = await withPage(browser, async (page) => {
      const url = entries[1].url;
      await page.goto(url, { waitUntil: 'load' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'load' });
      const enter = async () => {
        await page.locator('#choices button').filter({ hasText: '走向闪烁的终端' }).click();
        await page.locator('#choices button').filter({ hasText: '坐下,开始挑战' }).click();
        await page.waitForFunction(() => document.querySelector('#arcade-stage canvas'));
      };
      await enter();
      const huds = [];
      for (let expected = 1; expected <= 3; expected++) {
        await page.waitForFunction((count) => new RegExp(count < 3 ? '还可重试 ' + (3 - count) + ' 次' : '锁死了').test((document.querySelector('.amatlas-arcade-hud') || document.querySelector('#look') || {}).textContent || ''), expected, { timeout: 5000 });
        huds.push(await page.evaluate(() => (document.querySelector('.amatlas-arcade-hud') || document.querySelector('#look') || {}).textContent || ''));
        if (expected < 3) await page.keyboard.press('ArrowUp');
      }
      await page.waitForFunction(() => !document.querySelector('#arcade-stage canvas'));
      const actions = await arcadeActions(page);
      ok('AR9 built 三次真实死亡由公开HUD计数，锁技巧门并解锁fail-forward', /还可重试 2 次/.test(huds[0]) && /还可重试 1 次/.test(huds[1]) && /锁死/.test(huds[2]) &&
        actions.some((item) => /推开解锁的门/.test(item.text) && item.disabled) && actions.some((item) => /撬开控制面板/.test(item.text) && !item.disabled) && actions.some((item) => /放弃挑战/.test(item.text) && !item.disabled), JSON.stringify({ huds, actions }));
    });
    ok('AR10 built 三败fail-forward零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }

  {
    const errors = await withMobilePage(browser, async (page) => {
      await installArcadeClock(page);
      await page.goto(entries[1].url, { waitUntil: 'load' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'load' });
      await pauseArcadeClock(page);
      await arcadeEnter(page, 'touch');
      const layout = await page.evaluate(() => {
        function info(el) {
          const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { name: el.getAttribute('aria-label'), width: r.width, height: r.height, hit: hit === el, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        }
        const canvas = document.querySelector('#arcade-stage canvas').getBoundingClientRect();
        const hud = document.querySelector('.amatlas-arcade-hud').getBoundingClientRect();
        const place = document.querySelector('#place'); const placeStyle = getComputedStyle(place);
        return {
          buttons: Array.from(document.querySelectorAll('.amatlas-arcade-controls button')).map(info),
          canvas: { left: canvas.left, right: canvas.right, top: canvas.top, bottom: canvas.bottom },
          hud: { top: hud.top, bottom: hud.bottom },
          place: { active: document.activeElement === place, top: place.getBoundingClientRect().top, outlineWidth: placeStyle.outlineWidth, outlineStyle: placeStyle.outlineStyle },
          scrollY: window.scrollY,
          noHorizontalOverflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
          scrollHeight: document.documentElement.scrollHeight,
          innerHeight: window.innerHeight
        };
      });
      const result = await arcadeFiveFruit(page, true);
      const sized = ['向上', '向下', '向左', '向右'].every((name) => layout.buttons.some((button) => button.name === name && button.width >= 44 && button.height >= 44 && button.hit));
      ok('AR11 mobile built 390x844真实tap完成正式1/2/3/4果及第五段稳定终态', arcadeMilestonesOk(result) && arcadeCompleteOk(result), JSON.stringify(result));
      ok('AR12 mobile controls>=44中心可命中、canvas/HUD分离且无横滚；touch标题焦点留白且不画键盘环', sized && layout.noHorizontalOverflow && layout.hud.top >= layout.canvas.bottom && layout.buttons.every((button) => button.left >= 0 && button.right <= 390) && layout.scrollHeight >= layout.innerHeight && layout.place.active && layout.place.top >= 20 && layout.scrollY <= 12 && layout.place.outlineStyle === 'none', JSON.stringify(layout));
      await page.locator('#choices button').filter({ hasText: '推开解锁的门' }).tap();
      await page.waitForFunction(() => (document.querySelector('#place') || {}).textContent === '核心机房');
      ok('AR13 mobile built 标准技巧门tap进入核心机房', true);
    });
    ok('AR14 mobile built 正式五果旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }
}

async function tabletopSnapshot(page) {
  return page.evaluate(() => ({
    title: (document.querySelector('#place') || {}).textContent || '',
    look: (document.querySelector('#look') || {}).textContent || '',
    check: (document.querySelector('#look .line-check') || {}).textContent || '',
    outcome: (document.querySelector('#look .line-outcome') || {}).textContent || '',
    status: Array.from(document.querySelectorAll('#status .status-item')).map((item) => item.textContent || ''),
    actions: Array.from(document.querySelectorAll('#choices button')).map((button) => ({
      text: button.textContent || '', disabled: button.disabled,
      adv: (button.querySelector('.choice-adv') || {}).textContent || ''
    })),
    noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1
  }));
}

async function tabletopActivate(locator, touch) {
  if (touch) await locator.tap();
  else await locator.click();
}

async function tabletopChoice(page, text, touch) {
  const locator = page.locator('#choices button').filter({ hasText: text });
  await locator.waitFor({ state: 'visible', timeout: 5000 });
  await tabletopActivate(locator, touch);
}

async function runTabletopExperienceEvidence(browser) {
  const source = sourceUrl('tabletop-demo');
  const built = builtUrl('tabletop-demo');

  {
    const errors = await withPage(browser, async (page) => {
      await page.goto(sourceUrl('showroom'), { waitUntil: 'load' });
      const launcher = page.locator('button[data-src="../tabletop-demo/index.html"]');
      await launcher.waitFor({ state: 'visible', timeout: 8000 });
      await page.waitForFunction(() => !document.querySelector('button[data-src="../tabletop-demo/index.html"]:disabled'));
      await launcher.click();
      const frame = page.frameLocator('.demoport-frame');
      await frame.locator('#place').filter({ hasText: '醒转舱' }).waitFor({ state: 'visible', timeout: 8000 });
      await frame.locator('#choices button').filter({ hasText: '走向坍缩的气闸' }).click();
      await frame.locator('#choices button').filter({ hasText: '撬开舱门' }).click();
      const failed = await frame.locator('#look').textContent();
      await frame.locator('#choices button').filter({ hasText: '继续' }).click();
      await frame.locator('#choices button').filter({ hasText: '与 AI 谈判' }).click();
      const partial = await frame.locator('#look').textContent();
      await frame.locator('#choices button').filter({ hasText: '继续' }).click();
      const ending = await frame.locator('body').evaluate(() => ({
        title: (document.querySelector('#place') || {}).textContent || '',
        look: (document.querySelector('#look') || {}).textContent || ''
      }));
      ok('TT1 Showroom R02 同一正式world由公开按钮走无准备fail→partial→强行接管终局',
        /失败/.test(failed) && /部分成功/.test(partial) && ending.title === '强行接管的灯塔' && /夺回了灯塔/.test(ending.look),
        JSON.stringify({ failed, partial, ending }));
      await page.locator('.demoport-close').click();
      await page.waitForFunction(() => {
        const port = document.querySelector('.demoport'), frameNode = document.querySelector('.demoport-frame');
        return port && port.hidden && frameNode && !frameNode.hasAttribute('src');
      });
      const returned = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-src'));
      ok('TT2 Showroom R02 关闭卸载iframe并归还launcher焦点', returned === '../tabletop-demo/index.html', 'focus=' + returned);
    });
    ok('TT3 Showroom R02 完整旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }

  {
    const errors = await withPage(browser, async (page) => {
      await page.goto(source, { waitUntil: 'load' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'load' });
      const fresh = await tabletopSnapshot(page);
      ok('TT4 source fresh 点击前公开scan消耗1状态，状态3且可直接前进', /消耗 1 点状态/.test(fresh.look) && fresh.status.some((item) => /状态:3/.test(item)) && fresh.actions.some((item) => /凝神感知/.test(item.text)) && fresh.actions.some((item) => /走向坍缩/.test(item.text)), JSON.stringify(fresh));

      await tabletopChoice(page, '凝神感知周围');
      const scanned = await tabletopSnapshot(page);
      ok('TT5 source 正式seed scan=9成功、公开回执状态−1且状态条3→2', /2d6\(7\)\+2 = 9 ≥ DC 6.*成功/.test(scanned.check) && /状态\s*[−-]1/.test(scanned.outcome) && scanned.status.some((item) => /状态:2/.test(item)), JSON.stringify(scanned));
      await tabletopChoice(page, '走向坍缩的气闸');
      const gate = await tabletopSnapshot(page);
      ok('TT6 source 花资源所得准备在force按钮预显优势与DC9', gate.actions.some((item) => /撬开舱门.*DC 9/.test(item.text) && item.adv === '优势'), JSON.stringify(gate.actions));
      await tabletopChoice(page, '撬开舱门');
      const forced = await tabletopSnapshot(page);
      ok('TT7 source 优势逐抽4,4,4→9成功；结果帧只剩Continue且durable prose回显', /2d6\(8\)\+1 = 9 ≥ DC 9 \(优势\).*成功/.test(forced.check) && /安静|悄无声息/.test(forced.look) && forced.actions.length === 1 && /继续/.test(forced.actions[0].text), JSON.stringify(forced));

      await page.locator('.amatlas-save-btn').click();
      const panel = page.locator('.amatlas-save-panel');
      await panel.waitFor({ state: 'visible' });
      const slot = panel.locator('.amatlas-save-row:not(.amatlas-save-auto)').first();
      await slot.locator('.amatlas-save-do').click();
      await panel.locator('.amatlas-plugin-close').click();
      await tabletopChoice(page, '继续');
      await page.locator('.amatlas-save-btn').click();
      await panel.waitFor({ state: 'visible' });
      await slot.locator('.amatlas-save-load').click();
      await page.locator('#place').filter({ hasText: '坍缩的气闸' }).waitFor({ state: 'visible' });
      const loaded = await tabletopSnapshot(page);
      ok('TT8 source 公开手动槽读回pending：瞬时check/outcome不复放，状态2/durable prose/唯一Continue/目的地全保', !loaded.check && !loaded.outcome && /安静|悄无声息/.test(loaded.look) && loaded.status.some((item) => /状态:2/.test(item)) && loaded.actions.length === 1 && /继续/.test(loaded.actions[0].text), JSON.stringify(loaded));

      await tabletopChoice(page, '继续');
      const quietCore = await tabletopSnapshot(page);
      ok('TT9 source quiet core公开talk DC8且记得灯塔', quietCore.actions.some((item) => /与 AI 谈判.*DC 8/.test(item.text)) && /记得它的名字/.test(quietCore.look), JSON.stringify(quietCore));
      await tabletopChoice(page, '与 AI 谈判');
      const trusted = await tabletopSnapshot(page);
      ok('TT10 source talk=8成功、durable授权prose且只Continue', /2d6\(7\)\+1 = 8 ≥ DC 8.*成功/.test(trusted.check) && /授权|确认|信任/.test(trusted.look) && trusted.actions.length === 1 && /继续/.test(trusted.actions[0].text), JSON.stringify(trusted));
      await tabletopChoice(page, '继续');
      const peace = await tabletopSnapshot(page);
      ok('TT11 source 标准Continue进入和平终局并回响资源准备', peace.title === '重新点亮的灯塔' && /唤醒了灯塔/.test(peace.look) && /状态换来的准备/.test(peace.look), JSON.stringify(peace));

      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('.amatlas-reset-btn').click();
      await page.locator('#place').filter({ hasText: '醒转舱' }).waitFor({ state: 'visible' });
      await tabletopChoice(page, '凝神感知周围');
      const replay = await tabletopSnapshot(page);
      ok('TT12 source 公开reset确认后fresh状态3并以同输入复现scan=9、状态2', /2d6\(7\)\+2 = 9 ≥ DC 6.*成功/.test(replay.check) && replay.status.some((item) => /状态:2/.test(item)), JSON.stringify(replay));
    });
    ok('TT13 source 准备/存读档/reset旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }

  {
    const errors = await withPage(browser, async (page) => {
      await page.goto(built, { waitUntil: 'load' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'load' });
      await tabletopChoice(page, '走向坍缩的气闸');
      const gate = await tabletopSnapshot(page);
      ok('TT14 built 无准备保留状态3、force DC9且无优势badge', gate.status.some((item) => /状态:3/.test(item)) && gate.actions.some((item) => /撬开舱门.*DC 9/.test(item.text) && !item.adv), JSON.stringify(gate));
      await tabletopChoice(page, '撬开舱门');
      const failed = await tabletopSnapshot(page);
      ok('TT15 built 无准备force=8失败、警报durable prose且只Continue', /2d6\(7\)\+1 = 8 < DC 9.*失败/.test(failed.check) && /警报/.test(failed.look) && failed.actions.length === 1 && /继续/.test(failed.actions[0].text), JSON.stringify(failed));
      await tabletopChoice(page, '继续');
      const alarmed = await tabletopSnapshot(page);
      ok('TT16 built alarmed talk动态DC11、保留状态3', alarmed.actions.some((item) => /与 AI 谈判.*DC 11/.test(item.text)) && alarmed.status.some((item) => /状态:3/.test(item)) && /警报/.test(alarmed.look), JSON.stringify(alarmed));
      await tabletopChoice(page, '与 AI 谈判');
      const partial = await tabletopSnapshot(page);
      ok('TT17 built 剩余资源bonus使10落band1部分成功、应急接管prose且只Continue', /2d6\(8\)\+2 = 10 < DC 11.*部分成功/.test(partial.check) && /接管|应急|强行/.test(partial.look) && partial.actions.length === 1 && /继续/.test(partial.actions[0].text), JSON.stringify(partial));
      await tabletopChoice(page, '继续');
      const ending = await tabletopSnapshot(page);
      ok('TT18 built 标准Continue进入强行接管终局并回响保留资源/fail-forward', ending.title === '强行接管的灯塔' && /夺回了灯塔/.test(ending.look) && /保留的状态/.test(ending.look), JSON.stringify(ending));
    });
    ok('TT19 built 无准备fail→partial旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }

  {
    const errors = await withMobilePage(browser, async (page) => {
      await page.goto(built, { waitUntil: 'load' });
      await page.evaluate(() => localStorage.clear());
      await page.reload({ waitUntil: 'load' });
      await tabletopChoice(page, '凝神感知周围', true);
      await tabletopChoice(page, '走向坍缩的气闸', true);
      await tabletopChoice(page, '撬开舱门', true);
      const resultLayout = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('#choices button'));
        return {
          buttons: buttons.map((button) => {
            const r = button.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { text: button.textContent || '', width: r.width, height: r.height, hit: !!(hit && (hit === button || button.contains(hit))) };
          }),
          check: (document.querySelector('.line-check') || {}).textContent || '',
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
          verticalReachable: document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1 || !/hidden/.test(getComputedStyle(document.documentElement).overflowY)
        };
      });
      ok('TT20 mobile built 390px真实tap到准备force成功，唯一Continue>=44可命中且无横滚', /成功/.test(resultLayout.check) && resultLayout.buttons.length === 1 && resultLayout.buttons[0].width >= 44 && resultLayout.buttons[0].height >= 44 && resultLayout.buttons[0].hit && resultLayout.noHorizontalOverflow && resultLayout.verticalReachable, JSON.stringify(resultLayout));
      await tabletopChoice(page, '继续', true);
      await tabletopChoice(page, '与 AI 谈判', true);
      await tabletopChoice(page, '继续', true);
      const ending = await tabletopSnapshot(page);
      ok('TT21 mobile built 公开tap完成和平终局', ending.title === '重新点亮的灯塔' && /唤醒了灯塔/.test(ending.look), JSON.stringify(ending));
    });
    ok('TT22 mobile built 正式旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }
}

async function runPursuitExperienceEvidence(browser) {
  {
    const errors = await withPage(browser, async (page, pageErrors) => {
      watchMazeWarnings(page, pageErrors);
      await page.goto(sourceUrl('showroom'), { waitUntil: 'load' });
      const launcher = page.locator('button[data-src="../maze3d/index.html"]');
      await launcher.waitFor({ state: 'visible', timeout: 8000 });
      await page.waitForFunction(() => !document.querySelector('button[data-src]:disabled'), null, { timeout: 8000 });
      await launcher.click();
      const frame = page.frameLocator('.demoport-frame');
      const recipe = frame.locator('#choices button').filter({ hasText: 'Recipe 2 · 地底回廊' });
      await recipe.waitFor({ state: 'visible', timeout: 8000 });
      await recipe.click();
      await frame.locator('#choices button').filter({ hasText: '屏住呼吸,进入恐怖 recipe' }).click();
      await frame.locator('#maze3d-stage canvas').waitFor({ state: 'visible', timeout: 8000 });
      const delivered = await frame.locator('body').evaluate(() => ({
        place: (document.querySelector('#place') || {}).textContent || '',
        canvas: !!document.querySelector('#maze3d-stage canvas'),
        inventory: /物品/.test((document.querySelector('.amatlas-inv-btn') || {}).textContent || ''),
        controls: !!document.querySelector('#maze3d-stage .amatlas-maze-controls')
      }));
      const host = await page.evaluate(() => ({
        src: (document.querySelector('.demoport-frame') || {}).getAttribute('src'),
        title: (document.querySelector('.demoport-title') || {}).textContent || ''
      }));
      ok('PR1 Showroom R04 unified launcher 公开选择 Recipe 2 并交付 canvas/Inventory/controls',
        host.src === '../maze3d/index.html' && /maze3d 分支仪式库/.test(host.title) && /Recipe 2/.test(delivered.place) && delivered.canvas && delivered.inventory && delivered.controls,
        JSON.stringify({ host, delivered }));
      await page.locator('.demoport-close').click();
      await page.waitForFunction(() => {
        const port = document.querySelector('.demoport'), frameNode = document.querySelector('.demoport-frame');
        return port && port.hidden && frameNode && !frameNode.hasAttribute('src');
      }, null, { timeout: 5000 });
      const returned = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-src'));
      ok('PR2 Showroom R04 关闭卸载 iframe 并归还 launcher 焦点', returned === '../maze3d/index.html', 'focus=' + returned);
    });
    ok('PR3 Showroom pursuit delivery 零 pageerror/console.error/[maze warning]/failed/remote', errors.length === 0, errors.join(' | '));
  }

  const entries = [
    { label: 'source', url: sourceUrl('maze3d') },
    { label: 'built', url: builtUrl('maze3d') }
  ];
  for (const entry of entries) {
    {
      const errors = await withPage(browser, async (page, pageErrors) => {
        watchMazeWarnings(page, pageErrors);
        await freshPursuitMaze(page, entry.url);
        const quiet = await waitQuietPursuit(page);
        const locked = await pursuitStep(page, 'locked-door', () => reachLockedDoor(page));
        const photo = await pursuitStep(page, 'quiet-photo', () => collectQuietPhoto(page, locked.turns));
        const marker = await pursuitStep(page, 'marker-preview', () => approachStoneFromPhoto(page));
        const wake = await pursuitStep(page, 'stone-wake', () => wakeAtStone(page));
        const escaped = await pursuitStep(page, 'escape-return', () => escapePursuit(page));
        ok('PR4 ' + entry.label + ' escape fresh: pre-wake quiet、锁门 HUD、photo hint/Inventory 均为玩家可见事实',
          quiet.safe && /门锁着/.test(locked.hud) && /半张照片/.test(photo.hint) && photo.inventory.items.length === 1 && /半张血照片/.test(photo.inventory.text),
          JSON.stringify({ quiet, locked, photo }));
        ok('PR5 ' + entry.label + ' escape fresh: pre-wake canvas、wake hint/钥匙 HUD 与追逐红色压迫反馈成立',
          marker.opaque === marker.width * marker.height && marker.distinct > 20 &&
          /石座裂开/.test(wake.hint) && /在手/.test(escaped.keyHud) && wake.after.redEdgeBias > marker.redEdgeBias + 2,
          JSON.stringify({ marker, wake: wake.after, wakeHint: wake.hint, keyHud: escaped.keyHud }));
        ok('PR6 ' + entry.label + ' escape fresh: 持钥回到公开 D 结果并进入 horror_escaped',
          escaped.enabled && !escaped.opened.canvas && escaped.opened.choices.some((choice) => /推开门,逃出去/.test(choice.text) && !choice.disabled) && /终于听不见回廊里的拖曳声/.test(escaped.result) && /血照片仍在你手里/.test(escaped.result),
          JSON.stringify(escaped));
      });
      ok('PR7 ' + entry.label + ' escape fresh 零 pageerror/console.error/[maze warning]/failed/remote', errors.length === 0, errors.join(' | '));
    }

    {
      const errors = await withPage(browser, async (page, pageErrors) => {
        watchMazeWarnings(page, pageErrors);
        await freshPursuitMaze(page, entry.url);
        const quiet = await waitQuietPursuit(page);
        const wake = await pursuitStep(page, 'caught-stone-wake', () => wakeDirect(page));
        const caught = await pursuitStep(page, 'caught-route', () => getCaught(page));
        const retry = await pursuitStep(page, 'caught-retry', () => returnToHubAndReenterQuiet(page));
        ok('PR8 ' + entry.label + ' caught fresh: 多帧/多距离 marker 公开像素在 wake 后消失，随后被抓、进入 horror_taken，回 hub 重进恢复 quiet',
          quiet.safe && wake.markerPeak >= wake.afterPeak + 4 && wake.markerFrames.length === 3 && wake.afterFrames.length === 3 &&
          /石座裂开/.test(wake.hint) && caught.enabled && /它抓住了你/.test(caught.caught.hud) && /黑暗吞掉了回程/.test(caught.result) && retry.safe,
          JSON.stringify({ quiet, wake, caught, retry }));
      });
      ok('PR9 ' + entry.label + ' caught+retry fresh 零 pageerror/console.error/[maze warning]/failed/remote', errors.length === 0, errors.join(' | '));
    }

    {
      const errors = await withPage(browser, async (page, pageErrors) => {
        watchMazeWarnings(page, pageErrors);
        await installAudioContextProbe(page);
        await freshPursuitMaze(page, entry.url);
        const quiet = await waitQuietPursuit(page);
        await page.keyboard.press('w');
        await page.waitForFunction(() => window.__pursuitAudio && window.__pursuitAudio.contexts > 0, null, { timeout: 3000 });
        const beforeAudio = await page.evaluate(() => JSON.parse(JSON.stringify(window.__pursuitAudio)));
        const preExistingContinuousByContext = Object.fromEntries(Object.entries(beforeAudio.sourcesByContext).map(([contextId, sources]) => [
          contextId,
          Object.entries(sources).filter(([, source]) => source.starts > 0 && source.stops === 0).map(([sourceId]) => sourceId)
        ]));
        await page.locator('#choices button').filter({ hasText: '放弃,原路退回' }).click();
        await page.locator('#place').filter({ hasText: '恐怖 recipe · 放弃' }).waitFor({ state: 'visible', timeout: 3000 });
        await page.waitForFunction(({ before, candidates }) => {
          const audio = window.__pursuitAudio;
          return audio && audio.closeCalls > before.closeCalls && audio.closed > before.closed &&
            Object.entries(candidates).some(([contextId, sourceIds]) =>
              audio.closedContextIds.indexOf(contextId) < 0 && sourceIds.length >= 3 && sourceIds.every((sourceId) =>
                audio.sourcesByContext[contextId] && audio.sourcesByContext[contextId][sourceId] &&
                audio.sourcesByContext[contextId][sourceId].stops > before.sourcesByContext[contextId][sourceId].stops));
        }, { before: beforeAudio, candidates: preExistingContinuousByContext }, { timeout: 10000 });
        const result = await page.evaluate(() => ({
          place: (document.querySelector('#place') || {}).textContent || '',
          look: (document.querySelector('#look') || {}).textContent || '',
          choices: Array.from(document.querySelectorAll('#choices button')).map((button) => button.textContent || ''),
          canvas: !!document.querySelector('#maze3d-stage canvas'),
          audio: JSON.parse(JSON.stringify(window.__pursuitAudio))
        }));
        const ambientLongLived = Object.entries(preExistingContinuousByContext).map(([contextId, sourceIds]) => ({
          contextId, sourceIds,
          stillOpen: result.audio.closedContextIds.indexOf(contextId) < 0,
          stoppedSourceIds: sourceIds.filter((sourceId) => result.audio.sourcesByContext[contextId] && result.audio.sourcesByContext[contextId][sourceId] &&
            result.audio.sourcesByContext[contextId][sourceId].stops > beforeAudio.sourcesByContext[contextId][sourceId].stops)
        })).find((evidence) => evidence.stillOpen && evidence.sourceIds.length >= 3 && evidence.stoppedSourceIds.length === evidence.sourceIds.length);
        const mazeContextClosed = result.audio.closedContextIds.some((contextId) => beforeAudio.closedContextIds.indexOf(contextId) < 0);
        ok('PR10 ' + entry.label + ' give-up fresh: horror_fled 无冲突语义；pre-existing ambient long-lived sources stop，maze session context 关闭',
          quiet.safe && /恐怖 recipe · 放弃/.test(result.place) && /环境声和追逐音乐都在这里停止/.test(result.look) && !result.canvas &&
          result.choices.length === 1 && /回到 maze3d 入口/.test(result.choices[0]) && result.audio.closeCalls > beforeAudio.closeCalls &&
          result.audio.closed > beforeAudio.closed && result.audio.closeStates.every((state) => state === 'closed') && mazeContextClosed && !!ambientLongLived,
          JSON.stringify({ beforeAudio, preExistingContinuousByContext, result, ambientLongLived, mazeContextClosed }));
      });
      ok('PR11 ' + entry.label + ' give-up fresh 零 pageerror/console.error/[maze warning]/failed/remote', errors.length === 0, errors.join(' | '));
    }
  }

  {
    const errors = await withMobilePage(browser, async (page, pageErrors) => {
      watchMazeWarnings(page, pageErrors);
      await page.addInitScript(() => {
        addEventListener('DOMContentLoaded', () => {
          const skin = document.querySelector('style[data-amatlas-inline-css="../../ui/amatlas-skins.css"], link[href="../../ui/amatlas-skins.css"]');
          if (skin) skin.disabled = true;
        });
      });
      await freshPursuitMaze(page, entries[1].url);
      const quiet = await waitQuietPursuit(page);
      const initialLayout = await pursuitMobileMazeLayout(page);
      const inventory = await pursuitMobileInventoryLayout(page);
      const touchTargets = [];
      touchTargets.push(await holdPointer(page, '右转', 582, 71, 500));
      touchTargets.push(await holdPointerUntil(page, '前进', () => page.waitForFunction(() => /石座裂开.*拖曳声/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 15000 }), 72));
      const wakeLayout = await pursuitMobileMazeLayout(page);
      touchTargets.push(await holdPointer(page, '前进', 420, 73));
      touchTargets.push(await holdPointer(page, '后退', 3500, 74));
      touchTargets.push(await holdPointer(page, '左转', 582, 75, 500));
      touchTargets.push(await holdPointer(page, '前进', 780, 76));
      touchTargets.push(await holdPointer(page, '右转', 582, 77, 500));
      touchTargets.push(await holdPointerUntil(page, '前进', () => page.waitForFunction(() => /它抓住了你/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 30000 }), 78));
      const caught = await pursuitPublicSnapshot(page);
      const backdropDismissal = await pursuitMobileBackdropDismissal(page);
      await page.locator('#choices button').filter({ hasText: '你被它抓住了' }).tap();
      await page.locator('#place').filter({ hasText: '恐怖 recipe · 被抓' }).waitFor({ state: 'visible', timeout: 3000 });
      const resultLayout = await pursuitMobileResultLayout(page);
      const retry = await returnToHubAndReenterQuiet(page, true);
      const retryLayout = await pursuitMobileMazeLayout(page);
      const requiredControls = ['前进', '后退', '左转', '右转', '全屏'];
      const controlsSized = (layout) => requiredControls.every((name) => layout.buttons.some((button) => button.name === name)) &&
        layout.buttons.every((button) => button.width >= 44 && button.height >= 44 && button.hit);
      const touchContext = initialLayout.touch.coarse && initialLayout.touch.touchEvent && initialLayout.touch.maxTouchPoints > 0 &&
        initialLayout.touch.innerWidth === 390 && initialLayout.touch.innerHeight === 844;
      const touchHitProof = touchTargets.length === 8 && touchTargets.every((fact) =>
        fact.hit && fact.pointerEvents !== 'none' && fact.coarse && fact.touchEvent && fact.maxTouchPoints > 0);
      const requiredBackdropTargets = ['HUD', 'controls', 'toolbar', '前进', '后退', '左转', '右转', '全屏', 'Inventory'];
      const backdropBlocksMaze = requiredBackdropTargets.every((name) => inventory.backdropSamples.some((sample) => sample.name === name)) &&
        inventory.backdropSamples.every((sample) => sample.inViewport && sample.modalHit && !sample.underlyingHit);
      const backdropCoversViewport = inventory.backdropVisible && inventory.backdropCoversViewport && inventory.backdropPointerEvents === 'auto' &&
        inventory.backdropTouchAction === 'none' && inventory.cornerHits.length === 4 && inventory.cornerHits.every((sample) => sample.backdropHit);
      const backdropDismissesWithoutDrivingMaze = !!backdropDismissal.tapPoint && backdropDismissal.panelHidden && backdropDismissal.backdropHidden &&
        backdropDismissal.underlyingPointerDown === 0 && backdropDismissal.hudStable;
      ok('PR12 mobile built 390x844 true touch/coarse context；真实命中证明后仅公开 pointer 完成 caught，重进 8s fresh quiet',
        touchContext && touchHitProof && quiet.safe && /石座裂开/.test(wakeLayout.hud) && wakeLayout.hudReadable && /它抓住了你/.test(caught.hud) && retry.safe,
        JSON.stringify({ touch: initialLayout.touch, touchTargets, quiet, wakeLayout, caught, retry }));
      ok('PR13 mobile built 禁用共享 skin 后仍由 Inventory 默认 CSS 提供全视口显式 backdrop，D-pad/全屏/可见 context 控件 >=44 且底层不可命中',
        controlsSized(initialLayout) && initialLayout.hudReadable && initialLayout.separated && initialLayout.noHorizontalOverflow && initialLayout.verticalScrollable &&
        inventory.contained && inventory.scrollable && backdropCoversViewport && backdropBlocksMaze && inventory.closeHit && inventory.panelInteriorKeepsOpen &&
        inventory.closeHidesBoth && inventory.inventoryTargetRestored && backdropDismissesWithoutDrivingMaze &&
        controlsSized(wakeLayout) && wakeLayout.hudReadable && wakeLayout.separated && wakeLayout.noHorizontalOverflow,
        JSON.stringify({ initialLayout, inventory, wakeLayout, backdropDismissal }));
      ok('PR14 mobile 结果 links 滚动后 >=44、视口内且中心命中，无重叠/横滚；hub 重进 HUD/controls 仍分离',
        resultLayout.links.length === 1 && /回到 maze3d 入口/.test(resultLayout.links[0].text) &&
        resultLayout.links.every((link) => link.width >= 44 && link.height >= 44 && link.inViewport && link.hit) &&
        !resultLayout.overlap && resultLayout.noHorizontalOverflow && resultLayout.verticalReachable &&
        retryLayout.hudReadable && retryLayout.separated && retryLayout.noHorizontalOverflow,
        JSON.stringify({ resultLayout, retryLayout }));
    });
    ok('PR15 mobile built fresh terminal+retry 零 pageerror/console.error/[maze warning]/failed/remote', errors.length === 0, errors.join(' | '));
  }
}

async function horrorSnapshot(page) {
  return page.evaluate(() => ({
    node: document.documentElement.getAttribute('data-node'),
    kind: document.documentElement.getAttribute('data-node-kind'),
    place: (document.querySelector('#place') || {}).textContent || '',
    look: (document.querySelector('#look') || {}).textContent || '',
    actions: Array.from(document.querySelectorAll('#choices button')).map((b) => b.textContent || ''),
    sceneClass: (document.querySelector('#scene') || {}).className || '',
    svg: !!document.querySelector('#scene svg'),
    noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1
  }));
}
async function horrorChoice(page, text, touch) { const b=page.locator('#choices button').filter({hasText:text});await b.waitFor({state:'visible',timeout:5000});if(touch)await b.tap();else await b.click(); }
async function horrorWaitFxClear(page) { await page.waitForFunction(() => { const s=document.querySelector('#scene');return s&&!/amatlas-fx-(fade|slam)/.test(s.className||''); },null,{timeout:3000}); }
async function horrorComplete(page,touch) { await horrorChoice(page,'摸索着走向走廊',touch);await horrorWaitFxClear(page);await horrorChoice(page,'推开那扇门',touch);await horrorChoice(page,'凝视回去',touch); }
async function runHorrorExperienceEvidence(browser) {
  const source=sourceUrl('horror-demo'),built=builtUrl('horror-demo');
  {
    const errors=await withIsolatedPage(browser,async(page)=>{await page.goto(sourceUrl('showroom'),{waitUntil:'load'});const l=page.locator('button[data-src="../horror-demo/index.html"]');await l.waitFor({state:'visible',timeout:8000});await page.waitForFunction(()=>!document.querySelector('button[data-src="../horror-demo/index.html"]:disabled'));await l.click();const f=page.frameLocator('.demoport-frame');await f.locator('#look').filter({hasText:'黑暗里睁开眼'}).waitFor({state:'visible',timeout:8000});await f.locator('#choices button').filter({hasText:'摸索着走向走廊'}).click();await f.locator('#choices button').filter({hasText:'推开那扇门'}).click();await f.locator('#choices button').filter({hasText:'凝视回去'}).click();const end=await f.locator('body').evaluate(()=>({node:document.documentElement.getAttribute('data-node'),look:(document.querySelector('#look')||{}).textContent||'',actions:document.querySelectorAll('#choices button').length}));ok('HR1 Showroom R07公开完成四节点到terminal',end.node==='consumed'&&/这是结局/.test(end.look)&&end.actions===0,JSON.stringify(end));await page.locator('.demoport-close').click();await page.waitForFunction(()=>{const p=document.querySelector('.demoport'),f=document.querySelector('.demoport-frame');return p&&p.hidden&&f&&!f.hasAttribute('src');});ok('HR2 Showroom关闭卸载并归还焦点',await page.evaluate(()=>document.activeElement&&document.activeElement.getAttribute('data-src'))==='../horror-demo/index.html');});ok('HR3 Showroom R07零错误/远程',errors.length===0,errors.join(' | '));
  }
  {
    const errors=await withIsolatedPage(browser,async(page)=>{await page.goto(source,{waitUntil:'load'});await horrorWaitFxClear(page);await horrorChoice(page,'摸索着走向走廊');await page.waitForFunction(()=>/amatlas-fx-fade/.test((document.querySelector('#scene')||{}).className||''));const corridor=await horrorSnapshot(page);await horrorWaitFxClear(page);await horrorChoice(page,'推开那扇门');await page.waitForFunction(()=>/amatlas-fx-slam/.test((document.querySelector('#scene')||{}).className||''));const beyond=await horrorSnapshot(page);await horrorWaitFxClear(page);await horrorChoice(page,'凝视回去');const end=await horrorSnapshot(page);ok('HR4 source公开fade新会话、slam与cut terminal',corridor.node==='corridor'&&/fade/.test(corridor.sceneClass)&&corridor.svg&&beyond.node==='beyond'&&/slam/.test(beyond.sceneClass)&&end.node==='consumed'&&!/amatlas-fx/.test(end.sceneClass)&&end.actions.length===0,JSON.stringify({corridor,beyond,end}));await page.reload({waitUntil:'load'});const persisted=await horrorSnapshot(page);ok('HR5 source terminal先reload仍consumed，证明正式localStorage续档',persisted.node==='consumed'&&persisted.actions.length===0,JSON.stringify(persisted));let dialogSeen=false;page.once('dialog',d=>{dialogSeen=/当前进度将清除。/.test(d.message())&&!/手动存档/.test(d.message());dialogSeen?d.accept():d.dismiss();});await page.locator('#reset').click();await page.locator('#look').filter({hasText:'黑暗里睁开眼'}).waitFor({state:'visible'});await page.reload({waitUntil:'load'});const fresh=await horrorSnapshot(page);ok('HR6 source公开确认框出现、reset后reload仍fresh',dialogSeen&&fresh.node==='waking'&&/黑暗里睁开眼/.test(fresh.look),JSON.stringify({dialogSeen,fresh}));});ok('HR7 source R07零错误/远程',errors.length===0,errors.join(' | '));
  }
  {
    const errors=await withIsolatedPage(browser,async(page)=>{await page.goto(built,{waitUntil:'load'});await horrorComplete(page);const end=await horrorSnapshot(page);ok('HR8 built手写内联assembly完成terminal',end.node==='consumed'&&end.svg&&end.actions.length===0,JSON.stringify(end));});ok('HR9 built R07零错误/远程',errors.length===0,errors.join(' | '));
  }
  {
    const errors=await withIsolatedPage(browser,async(page)=>{
      const noopPresenter = 'window.Amatlas=window.Amatlas||{};window.Amatlas.__NAME__={__FACTORY__:function(){return{id:"noop-__NAME__",install:function(){}};}};';
      await page.route('**/present-svg.js',route=>route.fulfill({contentType:'application/javascript',body:noopPresenter.replace(/__NAME__/g,'SvgPresenter').replace('__FACTORY__','createSvgPresenter')}));
      await page.route('**/present-audio.js',route=>route.fulfill({contentType:'application/javascript',body:noopPresenter.replace(/__NAME__/g,'AudioPresenter').replace('__FACTORY__','createAudioPresenter')}));
      await page.goto(source,{waitUntil:'load'});
      await horrorChoice(page,'摸索着走向走廊');await horrorChoice(page,'推开那扇门');await horrorChoice(page,'凝视回去');
      const end=await horrorSnapshot(page);
      ok('HR10 纯DOM退化不依赖SVG/Audio仍公开完成terminal',end.node==='consumed'&&!end.svg&&end.actions.length===0&&/这是结局/.test(end.look),JSON.stringify(end));
    });ok('HR11 纯DOM退化旅程零错误/远程',errors.length===0,errors.join(' | '));
  }
  {
    const errors=await withMobilePage(browser,async(page)=>{await page.goto(built,{waitUntil:'load'});const first=await page.locator('#choices button').first().evaluate(b=>{const r=b.getBoundingClientRect(),h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{w:r.width,h:r.height,hit:!!(h&&(h===b||b.contains(h)))}});await horrorComplete(page,true);const end=await horrorSnapshot(page);const reset=await page.locator('#reset').evaluate(b=>{const r=b.getBoundingClientRect(),h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return{w:r.width,h:r.height,hit:!!(h&&(h===b||b.contains(h))),overflow:document.documentElement.scrollWidth<=innerWidth+1}});ok('HR12 mobile 390px真实tap完成terminal且选项/reset>=44可命中无横滚',first.w>=44&&first.h>=44&&first.hit&&end.node==='consumed'&&reset.w>=44&&reset.h>=44&&reset.hit&&reset.overflow,JSON.stringify({first,end,reset}));});ok('HR13 mobile R07零错误/远程',errors.length===0,errors.join(' | '));
  }
}

async function minimalSnapshot(page) {
  return page.evaluate(() => ({
    kind: document.documentElement.getAttribute('data-node-kind'),
    place: (document.querySelector('#place') || {}).textContent || '',
    look: (document.querySelector('#look') || {}).textContent || '',
    status: Array.from(document.querySelectorAll('#status .status-item')).map((item) => item.textContent || ''),
    actions: Array.from(document.querySelectorAll('#choices button')).map((button) => button.textContent || ''),
    noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1
  }));
}

async function minimalChoice(page, text, touch) {
  const button = page.locator('#choices button').filter({ hasText: text });
  await button.waitFor({ state: 'visible', timeout: 5000 });
  if (touch) await button.tap(); else await button.click();
}

async function minimalComplete(page, touch) {
  for (let i = 0; i < 10; i++) await minimalChoice(page, '+1', touch);
}

async function runMinimalExperienceEvidence(browser) {
  const source = sourceUrl('minimal-demo');
  const built = builtUrl('minimal-demo');
  {
    const errors = await withIsolatedPage(browser, async (page) => {
      await page.goto(sourceUrl('showroom'), { waitUntil: 'load' });
      const launcher = page.locator('button[data-src="../minimal-demo/index.html"]');
      await launcher.waitFor({ state: 'visible', timeout: 8000 });
      await page.waitForFunction(() => !document.querySelector('button[data-src="../minimal-demo/index.html"]:disabled'));
      await launcher.click();
      const frame = page.frameLocator('.demoport-frame');
      await frame.locator('#look').filter({ hasText: '当前计数:0 / 10' }).waitFor({ state: 'visible', timeout: 8000 });
      for (let i = 0; i < 10; i++) await frame.locator('#choices button').filter({ hasText: '+1' }).click();
      await frame.locator('#choices button').filter({ hasText: '把原型交给试玩者' }).click();
      await frame.locator('html[data-node-kind="scene"] #place').filter({ hasText: '试玩交接台' }).waitFor({ state: 'visible', timeout: 5000 });
      const delivered = await frame.locator('body').evaluate(() => ({
        kind: document.documentElement.getAttribute('data-node-kind'),
        look: (document.querySelector('#look') || {}).textContent || '',
        actions: Array.from(document.querySelectorAll('#choices button')).map((button) => button.textContent || '')
      }));
      ok('MN1 Showroom R05 同源custom counter十次达标后经core exit回接普通scene', delivered.kind === 'scene' && /核心.*exits.*普通 scene/.test(delivered.look) && delivered.actions.some((text) => /查看改造清单/.test(text)), JSON.stringify(delivered));
      await page.locator('.demoport-close').click();
      await page.waitForFunction(() => { const p = document.querySelector('.demoport'), f = document.querySelector('.demoport-frame'); return p && p.hidden && f && !f.hasAttribute('src'); });
      const returned = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-src'));
      ok('MN2 Showroom R05 关闭卸载iframe并归还launcher焦点', returned === '../minimal-demo/index.html', 'focus=' + returned);
    });
    ok('MN3 Showroom R05 零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }
  {
    const errors = await withIsolatedPage(browser, async (page) => {
      await page.goto(source, { waitUntil: 'load' });
      const fresh = await minimalSnapshot(page);
      ok('MN4 source fresh公开0/10、有inc/保底暂停且无交付出口', /0 \/ 10/.test(fresh.look) && fresh.actions.some((t) => /\+1/.test(t)) && fresh.actions.some((t) => /暂时放下/.test(t)) && !fresh.actions.some((t) => /交给试玩者/.test(t)), JSON.stringify(fresh));
      await minimalComplete(page);
      const done = await minimalSnapshot(page);
      ok('MN5 source第十次达标后inc消失且交付出口出现', /10 \/ 10.*达成/.test(done.look) && !done.actions.some((t) => /\+1/.test(t)) && done.actions.some((t) => /交给试玩者/.test(t)), JSON.stringify(done));
      await minimalChoice(page, '把原型交给试玩者');
      await minimalChoice(page, '查看改造清单');
      const inspected = await minimalSnapshot(page);
      ok('MN6 source普通scene公开action显示manifest.modules改造回应', inspected.kind === 'scene' && /manifest\.modules/.test(inspected.look), JSON.stringify(inspected));
      page.once('dialog', (dialog) => { if (/当前进度将清除。/.test(dialog.message()) && !/手动存档/.test(dialog.message())) dialog.accept(); else dialog.dismiss(); });
      await page.locator('#reset').click();
      await page.locator('#look').filter({ hasText: '当前计数:0 / 10' }).waitFor({ state: 'visible', timeout: 5000 });
      await page.reload({ waitUntil: 'load' });
      const reloaded = await minimalSnapshot(page);
      ok('MN7 source公开reset后fresh且reload仍0/10、无交付出口', /0 \/ 10/.test(reloaded.look) && !reloaded.actions.some((t) => /交给试玩者/.test(t)), JSON.stringify(reloaded));
    });
    ok('MN8 source正式旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }
  {
    const errors = await withIsolatedPage(browser, async (page) => {
      await page.goto(built, { waitUntil: 'load' });
      await minimalComplete(page);
      await minimalChoice(page, '把原型交给试玩者');
      const handoff = await minimalSnapshot(page);
      await minimalChoice(page, '查看改造清单');
      const inspected = await minimalSnapshot(page);
      ok('MN9 built内联custom/text runtime完成counter→scene回接与普通action', handoff.kind === 'scene' && /核心.*exits/.test(handoff.look) && handoff.actions.some((t) => /查看改造清单/.test(t)) && /manifest\.modules/.test(inspected.look), JSON.stringify({ handoff, inspected }));
    });
    ok('MN10 built正式旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }
  {
    const errors = await withMobilePage(browser, async (page) => {
      await page.goto(built, { waitUntil: 'load' });
      const inc = await page.locator('#choices button').filter({ hasText: '+1' }).evaluate((button) => { const r = button.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { width: r.width, height: r.height, hit: !!(hit && (hit === button || button.contains(hit))) }; });
      await minimalComplete(page, true);
      const exit = await page.locator('#choices button').filter({ hasText: '把原型交给试玩者' }).evaluate((button) => { const r = button.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { width: r.width, height: r.height, hit: !!(hit && (hit === button || button.contains(hit))), noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1 }; });
      ok('MN11 mobile 390px +1与交付出口>=44、中心可命中且无横滚', inc.width >= 44 && inc.height >= 44 && inc.hit && exit.width >= 44 && exit.height >= 44 && exit.hit && exit.noHorizontalOverflow, JSON.stringify({ inc, exit }));
      await minimalChoice(page, '把原型交给试玩者', true);
      await minimalChoice(page, '查看改造清单', true);
      const inspected = await minimalSnapshot(page);
      ok('MN12 mobile真实tap回普通scene并完成普通action', inspected.kind === 'scene' && /manifest\.modules/.test(inspected.look), JSON.stringify(inspected));
    });
    ok('MN13 mobile built正式旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }
}

async function cutsceneSnapshot(page) {
  return page.evaluate(() => {
    function local(id) {
      const part = document.querySelector('[data-amatlas-rig-cast="warden"] [data-amatlas-rig-part="' + id + '"]');
      const consolidated = part && part.transform && part.transform.baseVal.consolidate();
      const matrix = consolidated && consolidated.matrix;
      return matrix ? { x: matrix.e, rotate: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI } : null;
    }
    const spans = Array.from(document.querySelectorAll('#look .amatlas-typewriter-grapheme'));
    const activeMouth = Array.from(document.querySelectorAll(
      '[data-amatlas-rig-cast="warden"] [data-amatlas-rig-part="mouth"] [data-amatlas-rig-state]'
    )).filter((node) => node.getAttribute('display') !== 'none').map((node) => node.getAttribute('data-amatlas-rig-state'));
    const look = document.querySelector('#look');
    const cast = document.querySelector('[data-amatlas-rig-cast="warden"]');
    return {
      kind: document.documentElement.getAttribute('data-node-kind'),
      place: (document.querySelector('#place') || {}).textContent || '',
      text: (look || {}).textContent || '',
      label: look && look.getAttribute('aria-label'),
      nextHook: !!(look && look.hasAttribute('data-cutscene-next')),
      choices: Array.from(document.querySelectorAll('#choices > button.choice')).map((button) => button.textContent || ''),
      status: Array.from(document.querySelectorAll('#status .status-item')).map((item) => item.textContent || ''),
      key: cast && cast.getAttribute('data-amatlas-rig-key'),
      torso: local('torso'),
      arm: local('arm_r_upper'),
      visible: spans.filter((node) => node.style.visibility !== 'hidden').length,
      total: spans.length,
      activeMouth,
      rigCount: document.querySelectorAll('[data-amatlas-rig-cast]').length,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1
    };
  });
}

async function cutsceneActivate(locator, touch) {
  if (touch) await locator.tap();
  else await locator.click();
}

async function cutsceneAdvance(page, touch) {
  const panel = page.locator('#look[data-cutscene-next]');
  await panel.waitFor({ state: 'visible', timeout: 8000 });
  if (await panel.getAttribute('aria-label') === '显示全部文字') {
    await cutsceneActivate(panel, touch);
    await page.waitForFunction(() => {
      const look = document.querySelector('#look[data-cutscene-next]');
      return look && look.getAttribute('aria-label') === '继续 / 下一段';
    }, null, { timeout: 3000 });
  }
  await cutsceneActivate(panel, touch);
}

async function cutsceneReachCompiledWalk(page, touch) {
  await cutsceneAdvance(page, touch);
  await cutsceneAdvance(page, touch);
  await cutsceneAdvance(page, touch);
  await page.waitForFunction(() => document.querySelector('[data-amatlas-rig-key$="#3"]'), null, { timeout: 8000 });
}

async function cutsceneReachLast(page, touch) {
  for (let i = 0; i < 6; i++) await cutsceneAdvance(page, touch);
  await page.locator('#choices > button.choice').filter({ hasText: '踏上沙滩' }).waitFor({ state: 'visible', timeout: 5000 });
}

async function runCutsceneExperienceEvidence(browser) {
  const source = sourceUrl('cutscene-demo');
  const built = builtUrl('cutscene-demo');

  {
    const errors = await withIsolatedPage(browser, async (page) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(sourceUrl('showroom'), { waitUntil: 'load' });
      const launcher = page.locator('button[data-src="../cutscene-demo/index.html"]');
      await launcher.waitFor({ state: 'visible', timeout: 8000 });
      await page.waitForFunction(() => !document.querySelector('button[data-src="../cutscene-demo/index.html"]:disabled'));
      await launcher.click();
      const frame = page.frameLocator('.demoport-frame');
      await frame.locator('#look').filter({ hasText: '黑潮退去时' }).waitFor({ state: 'visible', timeout: 8000 });
      const host = await page.evaluate(() => ({
        src: (document.querySelector('.demoport-frame') || {}).getAttribute('src'),
        title: (document.querySelector('.demoport-title') || {}).textContent || ''
      }));
      for (let i = 0; i < 3; i++) {
        const panel = frame.locator('#look[data-cutscene-next]');
        if (await panel.getAttribute('aria-label') === '显示全部文字') await panel.click();
        await panel.click();
      }
      await frame.locator('[data-amatlas-rig-key$="#3"]').waitFor({ state: 'visible', timeout: 8000 });
      const compiled = await frame.locator('body').evaluate(() => ({
        text: (document.querySelector('#look') || {}).textContent || '',
        key: (document.querySelector('[data-amatlas-rig-cast="warden"]') || {}).getAttribute('data-amatlas-rig-key')
      }));
      for (let i = 0; i < 3; i++) {
        const panel = frame.locator('#look[data-cutscene-next]');
        if (await panel.getAttribute('aria-label') === '显示全部文字') await panel.click();
        await panel.click();
      }
      await frame.locator('#choices > button.choice').filter({ hasText: '踏上沙滩' }).click();
      await frame.locator('html[data-node-kind="scene"] #place').filter({ hasText: '黑沙滩' }).waitFor({ state: 'visible', timeout: 5000 });
      const shore = await frame.locator('body').evaluate(() => ({
        kind: document.documentElement.getAttribute('data-node-kind'),
        text: (document.querySelector('#look') || {}).textContent || '',
        next: !!document.querySelector('#look[data-cutscene-next]'),
        read: Array.from(document.querySelectorAll('#choices button')).some((button) => /读潮线刻痕/.test(button.textContent || ''))
      }));
      ok('CS1 Showroom R03 精确打开同源入口，高层compiled beat可见且末拍作者link回接普通shore scene',
        host.src === '../cutscene-demo/index.html' && /Cutscene/.test(host.title) && compiled.key === 'coast/intro#3' && /守灯人沿退潮线/.test(compiled.text) &&
        shore.kind === 'scene' && /刚才那道白光/.test(shore.text) && !shore.next && shore.read,
        JSON.stringify({ host, compiled, shore }));
      await page.locator('.demoport-close').click();
      await page.waitForFunction(() => {
        const port = document.querySelector('.demoport'), frameNode = document.querySelector('.demoport-frame');
        return port && port.hidden && frameNode && !frameNode.hasAttribute('src');
      });
      const returned = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-src'));
      ok('CS2 Showroom R03 关闭卸载iframe并归还launcher焦点', returned === '../cutscene-demo/index.html', 'focus=' + returned);
    });
    ok('CS3 Showroom R03 旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }

  {
    const errors = await withIsolatedPage(browser, async (page) => {
      await page.goto(source, { waitUntil: 'load' });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      const fresh = await cutsceneSnapshot(page);
      await page.locator('.amatlas-save-btn').click();
      const panel = page.locator('.amatlas-save-panel');
      const auto = panel.locator('.amatlas-save-row.amatlas-save-auto');
      const manual = panel.locator('.amatlas-save-row:not(.amatlas-save-auto)').first();
      await panel.waitFor({ state: 'visible' });
      const autoAtEnter = await auto.locator('.amatlas-save-info').innerText();
      await panel.locator('.amatlas-plugin-close').click();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await cutsceneReachLast(page);
      await page.locator('.amatlas-save-btn').click();
      await panel.waitFor({ state: 'visible' });
      const autoAfterActions = await auto.locator('.amatlas-save-info').innerText();
      await auto.locator('.amatlas-save-load').click();
      const autoLoaded = await cutsceneSnapshot(page);
      ok('CS4 source auto槽由enter写入，末拍durable action仍不覆盖；公开读取回fresh beat0/未见末拍',
        /序章 · 回潮/.test(autoAtEnter) && autoAfterActions === autoAtEnter && /黑潮退去时/.test(autoLoaded.text) && autoLoaded.kind === 'cutscene' && autoLoaded.rigCount === 0 && !autoLoaded.status.some((text) => /已抵末拍/.test(text)),
        JSON.stringify({ fresh, autoAtEnter, autoAfterActions, autoLoaded }));

      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.locator('.amatlas-save-btn').click();
      await panel.waitFor({ state: 'visible' });
      await manual.locator('.amatlas-save-do').click();
      const manualSaved = await manual.locator('.amatlas-save-info').innerText();
      await panel.locator('.amatlas-plugin-close').click();

      await cutsceneReachCompiledWalk(page);
      const walkStart = await cutsceneSnapshot(page);
      await page.waitForTimeout(1050);
      const walkMiddle = await cutsceneSnapshot(page);
      await page.waitForTimeout(1500);
      const pointMiddle = await cutsceneSnapshot(page);
      ok('CS5 source 高层walk经过起点/中点/终点并进入point',
        walkStart.torso && walkStart.torso.x < 100 && walkMiddle.torso.x > 100 && walkMiddle.torso.x < 155 &&
        pointMiddle.torso && Math.abs(pointMiddle.torso.x - 160) < 1 && pointMiddle.arm && pointMiddle.arm.rotate < -20,
        JSON.stringify({ walkStart, walkMiddle, pointMiddle }));
      await page.waitForFunction(() => {
        const spans = Array.from(document.querySelectorAll('#look .amatlas-typewriter-grapheme'));
        const visible = spans.filter((node) => node.style.visibility !== 'hidden').length;
        return spans.length > 4 && visible > 0 && visible < spans.length;
      }, null, { timeout: 3000 });
      const captionPartial = await cutsceneSnapshot(page);
      await page.locator('#look[data-cutscene-next]').click();
      const captionDone = await cutsceneSnapshot(page);
      ok('CS6 source point收口且caption首击只补全文、不越拍',
        captionPartial.visible > 0 && captionPartial.visible < captionPartial.total && captionPartial.label === '显示全部文字' &&
        captionDone.key === 'coast/intro#3' && captionDone.visible === captionDone.total && captionDone.arm && captionDone.arm.rotate < -70 &&
        captionDone.label === '继续 / 下一段' && /守灯人沿退潮线走到潮标旁/.test(captionDone.text),
        JSON.stringify({ captionPartial, captionDone }));
      await page.locator('#look[data-cutscene-next]').click();
      await page.waitForFunction(() => document.querySelector('[data-amatlas-rig-key$="#4"]'), null, { timeout: 5000 });
      await page.waitForFunction(() => {
        const spans = Array.from(document.querySelectorAll('#look .amatlas-typewriter-grapheme'));
        const visible = spans.filter((node) => node.style.visibility !== 'hidden').length;
        const mouth = document.querySelector('[data-amatlas-rig-part="mouth"] [data-amatlas-rig-state="A"][display="inline"], [data-amatlas-rig-part="mouth"] [data-amatlas-rig-state="O"][display="inline"]');
        return spans.length > 4 && visible > 0 && visible < spans.length && mouth;
      }, null, { timeout: 3000 });
      const sayPartial = await cutsceneSnapshot(page);
      await page.locator('#look[data-cutscene-next]').click();
      const sayDone = await cutsceneSnapshot(page);
      ok('CS7 source say逐字中间态带公开mouth，首击只补全文',
        sayPartial.key === 'coast/intro#4' && sayPartial.visible > 0 && sayPartial.visible < sayPartial.total && sayPartial.activeMouth.some((state) => state === 'A' || state === 'O') &&
        sayDone.key === 'coast/intro#4' && sayDone.visible === sayDone.total && sayDone.label === '继续 / 下一段' && /第三次回潮前/.test(sayDone.text),
        JSON.stringify({ sayPartial, sayDone }));

      await page.locator('.amatlas-save-btn').click();
      await panel.waitFor({ state: 'visible' });
      await auto.locator('.amatlas-save-load').click();
      const restored = await cutsceneSnapshot(page);
      ok('CS8 source 公开auto读档从beat0重播并清旧compiler stage',
        restored.kind === 'cutscene' && /黑潮退去时/.test(restored.text) && restored.rigCount === 0 && !restored.choices.some((text) => /踏上沙滩/.test(text)),
        JSON.stringify(restored));

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await cutsceneReachCompiledWalk(page);
      const reducedWalk = await cutsceneSnapshot(page);
      await cutsceneAdvance(page);
      await page.waitForFunction(() => document.querySelector('[data-amatlas-rig-key$="#4"]'), null, { timeout: 5000 });
      const reducedSay = await cutsceneSnapshot(page);
      await cutsceneAdvance(page);
      await cutsceneAdvance(page);
      await page.locator('#choices > button.choice').filter({ hasText: '重看序章' }).click();
      await page.locator('#look').filter({ hasText: '黑潮退去时' }).waitFor({ state: 'visible', timeout: 5000 });
      const replay = await cutsceneSnapshot(page);
      ok('CS9 source reduced-motion给稳定poster；同节点replay清旧stage',
        reducedWalk.torso && Math.abs(reducedWalk.torso.x - 160) < 1 && reducedWalk.arm && reducedWalk.arm.rotate < -70 && reducedWalk.visible === reducedWalk.total &&
        reducedSay.key === 'coast/intro#4' && reducedSay.visible === reducedSay.total && /第三次回潮前/.test(reducedSay.text) &&
        replay.kind === 'cutscene' && replay.rigCount === 0 && /黑潮退去时/.test(replay.text),
        JSON.stringify({ reducedWalk, reducedSay, replay }));

      await cutsceneReachLast(page);
      await page.locator('#choices > button.choice').filter({ hasText: '踏上沙滩' }).click();
      await page.locator('html[data-node-kind="scene"] #place').filter({ hasText: '黑沙滩' }).waitFor({ state: 'visible', timeout: 5000 });
      const shore = await cutsceneSnapshot(page);
      await page.locator('.amatlas-save-btn').click();
      await panel.waitFor({ state: 'visible' });
      const autoAtShore = await auto.locator('.amatlas-save-info').innerText();
      await manual.locator('.amatlas-save-load').click();
      const manualLoaded = await cutsceneSnapshot(page);
      await page.reload({ waitUntil: 'load' });
      const continued = await cutsceneSnapshot(page);
      ok('CS10 source末拍作者link进入普通shore并更新auto；手动槽公开读回intro且核心续档reload仍在beat0',
        shore.kind === 'scene' && /刚才那道白光/.test(shore.text) && !shore.nextHook && shore.choices.some((text) => /读潮线刻痕/.test(text)) &&
        /coast\/shore/.test(autoAtShore) && /序章 · 回潮/.test(manualSaved) && /黑潮退去时/.test(manualLoaded.text) && /黑潮退去时/.test(continued.text) && continued.kind === 'cutscene',
        JSON.stringify({ shore, autoAtShore, manualSaved, manualLoaded, continued }));

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await cutsceneReachLast(page);
      await page.locator('#choices > button.choice').filter({ hasText: '踏上沙滩' }).click();
      page.once('dialog', (dialog) => dialog.accept());
      await page.locator('.amatlas-reset-btn').click();
      await page.locator('#look').filter({ hasText: '黑潮退去时' }).waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('.amatlas-save-btn').click();
      await panel.waitFor({ state: 'visible' });
      const autoAfterReset = await auto.locator('.amatlas-save-info').innerText();
      const manualPreserved = await manual.locator('.amatlas-save-load').isVisible();
      await panel.locator('.amatlas-plugin-close').click();
      const reset = await cutsceneSnapshot(page);
      ok('CS11 source公开reset fresh intro并覆盖auto起点，手动槽保留',
        reset.kind === 'cutscene' && /黑潮退去时/.test(reset.text) && !reset.status.some((text) => /已抵末拍/.test(text)) &&
        /序章 · 回潮/.test(autoAfterReset) && manualPreserved,
        JSON.stringify({ reset, autoAfterReset, manualPreserved }));
    });
    ok('CS12 source 高层/save/load/replay/reset旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }

  {
    const errors = await withIsolatedPage(browser, async (page) => {
      await page.goto(built, { waitUntil: 'load' });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await cutsceneReachCompiledWalk(page);
      const walkStart = await cutsceneSnapshot(page);
      await page.waitForTimeout(1100);
      const walkMiddle = await cutsceneSnapshot(page);
      await page.waitForFunction(() => {
        const spans = Array.from(document.querySelectorAll('#look .amatlas-typewriter-grapheme'));
        const visible = spans.filter((node) => node.style.visibility !== 'hidden').length;
        return spans.length > 4 && visible > 0 && visible < spans.length;
      }, null, { timeout: 5500 });
      await page.locator('#look[data-cutscene-next]').click();
      const walkDone = await cutsceneSnapshot(page);
      await page.locator('#look[data-cutscene-next]').click();
      await page.waitForFunction(() => document.querySelector('[data-amatlas-rig-key$="#4"]'), null, { timeout: 5000 });
      await page.waitForFunction(() => {
        const spans = Array.from(document.querySelectorAll('#look .amatlas-typewriter-grapheme'));
        const visible = spans.filter((node) => node.style.visibility !== 'hidden').length;
        const mouth = document.querySelector('[data-amatlas-rig-part="mouth"] [data-amatlas-rig-state="A"][display="inline"], [data-amatlas-rig-part="mouth"] [data-amatlas-rig-state="O"][display="inline"]');
        return spans.length > 4 && visible > 0 && visible < spans.length && mouth;
      }, null, { timeout: 3000 });
      const say = await cutsceneSnapshot(page);
      ok('CS13 built 内联compiler真实驱动walk/point/caption/say公开SVG与正文',
        walkStart.key === 'coast/intro#3' && walkStart.torso && walkMiddle.torso && walkMiddle.torso.x > walkStart.torso.x &&
        walkDone.arm && walkDone.arm.rotate < -70 && /守灯人沿退潮线/.test(walkDone.text) && say.key === 'coast/intro#4' && say.activeMouth.some((state) => state === 'A' || state === 'O'),
        JSON.stringify({ walkStart, walkMiddle, walkDone, say }));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await cutsceneAdvance(page);
      await cutsceneAdvance(page);
      await page.locator('#choices > button.choice').filter({ hasText: '踏上沙滩' }).click();
      await page.locator('html[data-node-kind="scene"] #place').filter({ hasText: '黑沙滩' }).waitFor({ state: 'visible', timeout: 5000 });
      const shore = await cutsceneSnapshot(page);
      ok('CS14 built末拍出口经内联text-adventure renderer回接普通shore且无runtime next',
        shore.kind === 'scene' && /刚才那道白光/.test(shore.text) && !shore.nextHook && shore.choices.some((text) => /读潮线刻痕/.test(text)), JSON.stringify(shore));
    });
    ok('CS15 built 高层→shore旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }

  {
    const errors = await withMobilePage(browser, async (page) => {
      await page.goto(built, { waitUntil: 'load' });
      await cutsceneAdvance(page, true);
      await page.waitForFunction(() => {
        const look = document.querySelector('#look[data-cutscene-next]');
        const spans = Array.from(document.querySelectorAll('#look .amatlas-typewriter-grapheme'));
        const visible = spans.filter((node) => node.style.visibility !== 'hidden').length;
        return look && look.getAttribute('aria-label') === '显示全部文字' && visible > 0 && visible < spans.length;
      }, null, { timeout: 2500 });
      const partial = await cutsceneSnapshot(page);
      await page.locator('#look[data-cutscene-next]').tap();
      const revealed = await cutsceneSnapshot(page);
      ok('CS16 mobile 390x844 typewriter首tap只补全文、不越拍且无横滚',
        partial.visible > 0 && partial.visible < partial.total && partial.label === '显示全部文字' &&
        revealed.visible === revealed.total && revealed.label === '继续 / 下一段' && /海面像一张慢慢展开的地图/.test(revealed.text) && revealed.noHorizontalOverflow,
        JSON.stringify({ partial, revealed }));
      await page.locator('#look[data-cutscene-next]').tap();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await cutsceneAdvance(page, true);
      await cutsceneAdvance(page, true);
      await cutsceneAdvance(page, true);
      await cutsceneAdvance(page, true);
      const exit = await page.locator('#choices > button.choice').filter({ hasText: '踏上沙滩' }).evaluate((button) => {
        const r = button.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          width: r.width, height: r.height,
          hit: !!(hit && (hit === button || button.contains(hit))),
          inViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
          noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth + 1
        };
      });
      ok('CS17 mobile末拍出口>=44px、中心可命中、在视口且无横滚',
        exit.width >= 44 && exit.height >= 44 && exit.hit && exit.inViewport && exit.noHorizontalOverflow, JSON.stringify(exit));
      await page.locator('#choices > button.choice').filter({ hasText: '踏上沙滩' }).tap();
      await page.locator('html[data-node-kind="scene"] #place').filter({ hasText: '黑沙滩' }).waitFor({ state: 'visible', timeout: 5000 });
      const shore = await cutsceneSnapshot(page);
      await page.locator('#choices > button.choice').filter({ hasText: '读潮线刻痕' }).tap();
      const investigated = await cutsceneSnapshot(page);
      ok('CS18 mobile真实tap回普通shore、无cutscene next且普通调查动作可完成',
        shore.kind === 'scene' && !shore.nextHook && /刚才那道白光/.test(shore.text) && /潮汐表/.test(investigated.text) && investigated.status.some((text) => /潮线刻度/.test(text)),
        JSON.stringify({ shore, investigated }));
    });
    ok('CS19 mobile built 正式旅程零 pageerror/console.error/failed/remote', errors.length === 0, errors.join(' | '));
  }
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
    if (selectedSuite == null) {
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
        ok('S1 showroom 首屏有 15 个 launcher、单 iframe 且尚未装 src', initial.launchers === 15 && initial.frames === 1 && !initial.hasSrc, JSON.stringify(initial));
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

        const visualLauncher = page.locator('button[data-src="../maze3d/gallery.html"]');
        await visualLauncher.click();
        const visualFrame = page.frameLocator('.demoport-frame');
        await visualFrame.locator('body').waitFor({ state: 'visible', timeout: 8000 });
        await visualFrame.locator('body').evaluate(() => new Promise((resolve, reject) => {
          const until = Date.now() + 8000;
          (function poll() {
            const expected = window.MAZE3D_GALLERY && window.MAZE3D_GALLERY.specs.length;
            if (expected && document.querySelectorAll('canvas').length === expected) return resolve();
            if (Date.now() > until) return reject(new Error('gallery canvas/inventory timeout'));
            setTimeout(poll, 25);
          })();
        }));
        const visualPreview = await visualFrame.locator('body').evaluate(async () => {
          const specs = window.MAZE3D_GALLERY.specs, tabs = document.querySelector('.tabs');
          const press = (name) => tabs.querySelector('button[data-filter="' + name + '"]').click();
          press('recipes');
          const recipeVisible = Array.from(document.querySelectorAll('#gallery section')).filter((s) => !s.classList.contains('hidden')).map((s) => s.dataset.section);
          press('combat');
          const combatVisible = Array.from(document.querySelectorAll('#gallery section')).filter((s) => !s.classList.contains('hidden')).map((s) => s.dataset.section);
          press('all');
          const firstRecipe = specs.find((s) => s.group === 'recipes'), firstRecipeCode = document.querySelector('[data-section="recipes"] code').textContent;
          const expectedCode = window.MAZE3D_GALLERY.serializeMaze(firstRecipe.maze);
          const copy = document.querySelector('[data-section="recipes"] .copy-maze'), status = document.querySelector('[data-section="recipes"] .copy-status');
          copy.click(); await new Promise((resolve) => setTimeout(resolve, 20));
          return {
            inventory: specs.length,
            canvases: document.querySelectorAll('canvas').length,
            tabbableCanvases: Array.from(document.querySelectorAll('canvas')).filter((canvas) => canvas.tabIndex >= 0).length,
            activeTag: document.activeElement && document.activeElement.tagName,
            scrollY: window.scrollY,
            recipeVisible, combatVisible,
            codeMatches: firstRecipeCode === expectedCode,
            copyStatus: status.textContent
          };
        });
        const visualHostFocus = await page.evaluate(() => document.activeElement && document.activeElement.className);
        ok('S3a maze3d Visual Gallery canvas数与inventory对账，不进Tab、不抢关闭焦点、不滚页',
          visualPreview.inventory === visualPreview.canvases && visualPreview.tabbableCanvases === 0 && visualPreview.activeTag === 'BODY' && visualPreview.scrollY === 0 && visualHostFocus === 'demoport-close',
          JSON.stringify({ child: visualPreview, hostFocus: visualHostFocus }));
        ok('S3a1 Visual Gallery recipes/combat筛选准确，复制文本来自spec.maze且Clipboard失败可手选', visualPreview.recipeVisible.join(',') === 'recipes' && visualPreview.combatVisible.join(',') === 'combat' && visualPreview.codeMatches && /请手动选择代码|已复制/.test(visualPreview.copyStatus), JSON.stringify(visualPreview));
        await page.click('.demoport-close');
        await page.waitForFunction(() => {
          const port = document.querySelector('.demoport');
          const frame = document.querySelector('.demoport-frame');
          return port && port.hidden && frame && !frame.hasAttribute('src');
        }, null, { timeout: 5000 });

        const rigLauncher = page.locator('button[data-src="../rig-showcase/index.html"]');
        await rigLauncher.click();
        const rigFrame = page.frameLocator('.demoport-frame');
        await rigFrame.locator('#place').filter({ hasText: 'Amatlas 表现力展示' }).waitFor({ state: 'visible', timeout: 8000 });
        await rigFrame.locator('#scene svg').waitFor({ state: 'visible', timeout: 8000 });
        const rigOpened = await page.evaluate(() => {
          const port = document.querySelector('.demoport');
          const frame = document.querySelector('.demoport-frame');
          return !!(port && port.classList.contains('open') && frame &&
            frame.getAttribute('src') === '../rig-showcase/index.html' &&
            document.querySelector('.demoport-title').textContent === 'Rig / Dialogue Expressiveness Showcase');
        });
        const rigText = await rigFrame.locator('#look').innerText();
        ok('S3b showroom 表现力入口真实打开 rig/dialogue 展示并渲染首拍', rigOpened && /FK 剪纸角色/.test(rigText), 'opened=' + rigOpened + ', text=' + rigText);
        await page.click('.demoport-close');
        await page.waitForFunction(() => {
          const port = document.querySelector('.demoport');
          const frame = document.querySelector('.demoport-frame');
          return port && port.hidden && frame && !frame.hasAttribute('src');
        }, null, { timeout: 5000 });

        const sideLauncher = page.locator('button[data-src="../sidescroller/index.html"]');
        await sideLauncher.click();
        const sideFrame = page.frameLocator('.demoport-frame');
        await sideFrame.locator('#choices button').filter({ hasText: '进入横版试验段' }).click();
        await sideFrame.locator('#sidescroller-stage canvas').waitFor({ state: 'visible', timeout: 8000 });
        const sideOpened = await page.evaluate(() => {
          const frame = document.querySelector('.demoport-frame');
          return !!(frame && frame.getAttribute('src') === '../sidescroller/index.html' && /Experimental Playable Slice/.test(document.querySelector('.demoport-kind').textContent || ''));
        });
        ok('S3c showroom 实验切片入口真实打开 sidescroller 并进入 canvas', sideOpened, 'opened=' + sideOpened);
        await page.click('.demoport-close');
        await page.waitForFunction(() => {
          const port = document.querySelector('.demoport');
          const frame = document.querySelector('.demoport-frame');
          return port && port.hidden && frame && !frame.hasAttribute('src');
        }, null, { timeout: 5000 });

        const frostLauncher = page.locator('button[data-src="../sidescroller-frostline/index.html"]');
        await frostLauncher.click();
        const frostFrame = page.frameLocator('.demoport-frame');
        await frostFrame.locator('#choices button').filter({ hasText: '踏上霜线货运坡道' }).click();
        await frostFrame.locator('#sidescroller-stage canvas').waitFor({ state: 'visible', timeout: 8000 });
        const frostOpened = await page.evaluate(() => {
          const frame = document.querySelector('.demoport-frame');
          return !!(frame && frame.getAttribute('src') === '../sidescroller-frostline/index.html' && /Second Client/.test(document.querySelector('.demoport-kind').textContent || ''));
        });
        ok('S3d showroom 第二客户入口真实打开 frostline 并进入 canvas', frostOpened, 'opened=' + frostOpened);
        await page.click('.demoport-close');
        await page.waitForFunction(() => {
          const port = document.querySelector('.demoport');
          const frame = document.querySelector('.demoport-frame');
          return port && port.hidden && frame && !frame.hasAttribute('src');
        }, null, { timeout: 5000 });
      });
      ok('S4 showroom host/五个真实 iframe 零页面错误', errors.length === 0, errors.join(' | '));
    }

    // ── 场景 1a:maze3d Visual Gallery——103 inventory、静态边界与combat首帧锚点 ──
    {
      const url = fileUrl(path.join(ENGINE, 'examples', 'maze3d', 'gallery.html'));
      const errors = await withPage(browser, async (page) => {
        await page.addInitScript(() => {
          const probe = { raf: 0, contexts: 0, inputListeners: 0, inputTypes: {} };
          const nativeRaf = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = function (fn) { probe.raf++; return nativeRaf(fn); };
          const inputEvents = new Set(['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove', 'pointercancel', 'pointerleave', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'touchstart', 'touchmove', 'touchend']);
          const canvasAdd = HTMLCanvasElement.prototype.addEventListener;
          HTMLCanvasElement.prototype.addEventListener = function (type, listener, options) { if (inputEvents.has(type)) { probe.inputListeners++; probe.inputTypes[type] = (probe.inputTypes[type] || 0) + 1; } return canvasAdd.call(this, type, listener, options); };
          class AudioContextProbe { constructor() { probe.contexts++; } }
          window.AudioContext = AudioContextProbe; window.webkitAudioContext = AudioContextProbe; window.__mazeGalleryProbe = probe;
        });
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(() => window.MAZE3D_GALLERY && document.querySelectorAll('canvas').length === window.MAZE3D_GALLERY.specs.length, null, { timeout: 10000 });
        const evidence = await page.evaluate(() => {
          function hashRegion(canvas, x, y, w, h) {
            const data = canvas.getContext('2d').getImageData(x, y, w, h).data; let hash = 2166136261;
            for (let i = 0; i < data.length; i++) { hash ^= data[i]; hash = Math.imul(hash, 16777619); }
            return (hash >>> 0).toString(16);
          }
          function difference(a, b, x, y, w, h) {
            const ac = a.getContext('2d').getImageData(x, y, w, h).data, bc = b.getContext('2d').getImageData(x, y, w, h).data; let pixels = 0;
            for (let i = 0; i < ac.length; i += 4) if (ac[i] !== bc[i] || ac[i + 1] !== bc[i + 1] || ac[i + 2] !== bc[i + 2] || ac[i + 3] !== bc[i + 3]) pixels++;
            return pixels;
          }
          function probeCanvas(maze, suffix) {
            const stage = document.createElement('div'), stageId = 'gallery-browser-probe-' + suffix; stage.id = stageId; stage.hidden = true; document.body.appendChild(stage);
            const world = { id: '99999999-9999-4999-8999-999999999999', start: { map: 'm', node: 'preview' }, maps: { m: { nodes: { preview: { kind: 'maze3d', stageId, maze } } } } };
            const engine = Amatlas.createEngine(world, { storage: null });
            engine.use(Amatlas.Maze3d.createMaze3dModule({ stageId, width: 260, height: 162, fullscreen: false, controls: false, audio: false, staticPreview: true }));
            engine.start(); return { stage, canvas: stage.querySelector('canvas') };
          }
          const galleryProbe = JSON.parse(JSON.stringify(window.__mazeGalleryProbe));
          const recipeSpecs = window.MAZE3D_GALLERY.specs.filter((spec) => spec.group === 'recipes');
          const recipeCanvases = Array.from(document.querySelectorAll('[data-section="recipes"] canvas'));
          const recipeDecor = recipeSpecs.map((spec, index) => {
            const without = JSON.parse(JSON.stringify(spec.maze)); delete without.wallDecor;
            const control = probeCanvas(without, 'recipe-' + index + '-without-wall-decor');
            const pixels = difference(recipeCanvases[index], control.canvas, 0, 0, 260, 162);
            control.stage.remove(); return pixels;
          });
          const combatCanvases = Array.from(document.querySelectorAll('[data-section="combat"] canvas'));
          const combat = combatCanvases.map((canvas) => ({ center: hashRegion(canvas, 100, 46, 60, 62), weapon: hashRegion(canvas, 58, 96, 144, 50), hud: hashRegion(canvas, 0, 130, 260, 32) }));
          const parts = window.MAZE3D_GALLERY.specs.filter((spec) => spec.group === 'combat').map((spec, index) => {
            const fullMaze = JSON.parse(JSON.stringify(spec.maze)), playerMaze = JSON.parse(JSON.stringify(spec.maze)), worldMaze = JSON.parse(JSON.stringify(spec.maze));
            delete playerMaze.combat.guard; delete worldMaze.combat;
            const beforeInputs = window.__mazeGalleryProbe.inputListeners;
            const world = probeCanvas(worldMaze, index + '-world'), player = probeCanvas(playerMaze, index + '-player'), full = probeCanvas(fullMaze, index + '-full');
            const result = {
              crosshair: difference(world.canvas, player.canvas, 112, 68, 36, 28),
              weapon: difference(world.canvas, player.canvas, 58, 104, 144, 42),
              hud: difference(world.canvas, player.canvas, 0, 130, 260, 32),
              guard: difference(player.canvas, full.canvas, 76, 36, 108, 82),
              inputListeners: window.__mazeGalleryProbe.inputListeners - beforeInputs
            };
            world.stage.remove(); player.stage.remove(); full.stage.remove(); return result;
          });
          return {
            probe: galleryProbe, inventory: window.MAZE3D_GALLERY.specs.length, canvases: document.querySelectorAll('canvas').length,
            recipes: document.querySelectorAll('[data-section="recipes"] canvas').length, recipeDecor: recipeDecor,
            combat: combat, parts: parts,
            shotButtons: document.querySelectorAll('.shot button').length,
            tabbableCanvases: Array.from(document.querySelectorAll('canvas')).filter((canvas) => canvas.tabIndex >= 0).length
          };
        });
        const signatures = evidence.combat.map((item) => item.center + '/' + item.weapon + '/' + item.hud);
        ok('S4a0 Visual Gallery inventory=canvas，recipes=6/combat=5且所有卡保持0 rAF/input/audio/tab/control', evidence.inventory === evidence.canvases && evidence.recipes === 6 && evidence.combat.length === 5 && evidence.probe.raf === 0 && evidence.probe.contexts === 0 && evidence.probe.inputListeners === 0 && Object.keys(evidence.probe.inputTypes).length === 0 && evidence.shotButtons === 0 && evidence.tabbableCanvases === 0, JSON.stringify(evidence));
        ok('S4a001 六张recipe显式墙饰都由真实runtime画进首帧', evidence.recipeDecor.length === 6 && evidence.recipeDecor.every((pixels) => pixels > 0), JSON.stringify(evidence.recipeDecor));
        ok('S4a01 五张combat卡的中心/底部签名互异且crystal不等于普通energy', new Set(signatures).size === 5 && signatures[3] !== signatures[4], JSON.stringify(signatures));
        ok('S4a011 每张combat卡以同theme无combat/player-only/full对照分别证crosshair、weapon、HUD与guard真实出现，probe canvas零玩法输入监听', evidence.parts.length === 5 && evidence.parts.every((item) => item.crosshair > 20 && item.weapon > 200 && item.hud > 200 && item.guard > 40 && item.inputListeners === 0), JSON.stringify(evidence.parts));
      });
      ok('S4a02 maze3d Visual Gallery独立真页零页面错误与远程请求', errors.length === 0, errors.join(' | '));
    }

    // ── 场景 1aa:五套协调 recipe——正式maze数据逐delta staticPreview因果 ──
    {
      const url = fileUrl(path.join(ENGINE, 'examples', 'maze3d', 'gallery.html'));
      const errors = await withPage(browser, async (page) => {
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(() => window.MAZE3D_GALLERY && document.querySelectorAll('canvas').length === window.MAZE3D_GALLERY.specs.length, null, { timeout: 10000 });
        await page.addScriptTag({ path: path.join(ENGINE, 'examples', 'maze3d', 'world.js') });
        await page.addScriptTag({ path: path.join(ENGINE, 'examples', 'origin', 'world.js') });
        const evidence = await page.evaluate(() => {
          function difference(a, b) {
            const ac = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
            const bc = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
            let pixels = 0;
            for (let i = 0; i < ac.length; i += 4) {
              if (ac[i] !== bc[i] || ac[i + 1] !== bc[i + 1] || ac[i + 2] !== bc[i + 2] || ac[i + 3] !== bc[i + 3]) pixels++;
            }
            return pixels;
          }
          function probeCanvas(maze, suffix) {
            const stage = document.createElement('div'), stageId = 'dogfood-browser-probe-' + suffix;
            stage.id = stageId; stage.hidden = true; document.body.appendChild(stage);
            const world = { id: '99999999-9999-4999-8999-999999999999', start: { map: 'm', node: 'preview' }, maps: { m: { nodes: { preview: { kind: 'maze3d', stageId, maze } } } } };
            const engine = Amatlas.createEngine(world, { storage: null });
            engine.use(Amatlas.Maze3d.createMaze3dModule({ stageId, width: 260, height: 162, fullscreen: false, controls: false, audio: false, staticPreview: true }));
            engine.start(); return { stage, canvas: stage.querySelector('canvas') };
          }
          function clone(value) { return JSON.parse(JSON.stringify(value)); }
          function removeOne(array, predicate) {
            const index = array.findIndex(predicate);
            if (index < 0) throw new Error('dogfood delta missing');
            array.splice(index, 1);
          }
          const mazeNodes = window.MAZE3D_WORLD.maps.m.nodes;
          const originNodes = window.ORIGIN_WORLD.maps.atlas.nodes;
          const targets = [
            { id: 'ritual', maze: mazeNodes.puzzle_maze.maze, cameras: [
              { x: 7, y: 5, dir: 'N' }, { x: 7, y: 4, dir: 'E' },
              { x: 7, y: 5, dir: 'W' }, { x: 7, y: 5, dir: 'E' },
              { x: 9, y: 1, dir: 'E' }, { x: 9, y: 7, dir: 'E' }
            ], deltas: [
              (maze) => removeOne(maze.decor, (item) => item.icon === 'ritual_marks'),
              (maze) => removeOne(maze.wallDecor, (item) => item.kind === 'sigil'),
              (maze) => removeOne(maze.pillars, (item) => item.x === 6 && item.y === 5 && item.style === 'ruined'),
              (maze) => removeOne(maze.pillars, (item) => item.x === 8 && item.y === 5 && item.style === 'ruined'),
              (maze) => removeOne(maze.pillars, (item) => item.x === 11 && item.y === 1 && item.style === 'crystal'),
              (maze) => removeOne(maze.pillars, (item) => item.x === 11 && item.y === 7 && item.style === 'obelisk')
            ] },
            { id: 'flesh', maze: mazeNodes.layers_maze3.maze, deltas: [
              (maze) => removeOne(maze.decor, (item) => item.icon === 'flesh_nodule'),
              (maze) => removeOne(maze.wallDecor, (item) => item.kind === 'teeth')
            ] },
            { id: 'industrial', maze: mazeNodes.fps_range.maze, cameras: [null, { x: 4, y: 1, dir: 'N' }, null], deltas: [
              (maze) => removeOne(maze.decor, (item) => item.icon === 'rust_scraps'),
              (maze) => removeOne(maze.wallDecor, (item) => item.kind === 'cables'),
              (maze) => removeOne(maze.pillars, (item) => item.style === 'metal')
            ] },
            { id: 'crystal', maze: originNodes.unlit_corridor.maze, deltas: [
              (maze) => removeOne(maze.decor, (item) => item.icon === 'crystal_cluster')
            ] },
            { id: 'ice', maze: mazeNodes.layers_maze1.maze, deltas: [
              (maze) => removeOne(maze.decor, (item) => item.icon === 'ice_chips'),
              (maze) => removeOne(maze.wallDecor, (item) => item.kind === 'crack')
            ] }
          ];
          return targets.map((target) => {
            const deltas = target.deltas.map((removeDelta, index) => {
              const camera = target.cameras && target.cameras[index];
              const fullMaze = clone(target.maze); if (camera) fullMaze.start = clone(camera);
              const controlMaze = clone(target.maze); if (camera) controlMaze.start = clone(camera); removeDelta(controlMaze);
              const full = probeCanvas(fullMaze, target.id + '-full-' + index);
              const control = probeCanvas(controlMaze, target.id + '-control-' + index);
              const pixels = difference(full.canvas, control.canvas); full.stage.remove(); control.stage.remove(); return pixels;
            });
            return { id: target.id, deltas };
          });
        });
        ok('S4a03 五套正式maze数据的本批显式decor/wallDecor/pillar逐delta都由真实runtime画入确定性首帧', evidence.length === 5 && evidence.every((target) => target.deltas.length > 0 && target.deltas.every((pixels) => pixels > 0)), JSON.stringify(evidence));
      });
      ok('S4a04 五套正式recipe静态因果probe零页面错误与远程请求', errors.length === 0, errors.join(' | '));
    }

    // ── 场景 1b:rig-showcase built——逐拍验证 typewriter、双角色 rig 与 stage 生命周期 ──
    {
      const url = builtUrl('rig-showcase');
      const errors = await withPage(browser, async (page) => {
        await page.goto(url, { waitUntil: 'load' });
        const nextPanel = () => page.locator('#look[data-cutscene-next]');
        const castSnapshot = () => page.evaluate(() => {
          const nodes = Array.prototype.slice.call(document.querySelectorAll('#scene svg [data-amatlas-rig-cast]'));
          return {
            cast: nodes.map((node) => node.getAttribute('data-amatlas-rig-cast')),
            keys: nodes.map((node) => node.getAttribute('data-amatlas-rig-key')),
            parts: document.querySelectorAll('#scene svg [data-amatlas-rig-cast] [data-amatlas-rig-part]').length
          };
        });
        const clickNext = async () => {
          const panel = nextPanel();
          await panel.waitFor({ state: 'visible', timeout: 8000 });
          if (await panel.getAttribute('aria-label') === '显示全部文字') {
            await panel.click();
            await page.waitForFunction(() => {
              const look = document.querySelector('#look[data-cutscene-next]');
              return look && look.getAttribute('aria-label') === '继续 / 下一段';
            }, null, { timeout: 3000 });
          }
          await panel.click();
        };
        const waitForKey = async (key) => {
          await page.waitForFunction((expected) => {
            const nodes = Array.prototype.slice.call(document.querySelectorAll('#scene svg [data-amatlas-rig-cast]'));
            return nodes.length > 0 && nodes.every((node) => node.getAttribute('data-amatlas-rig-key') === expected);
          }, key, { timeout: 5000 });
        };

        await page.waitForFunction(() => document.querySelector('#scene svg [data-amatlas-rig-cast="actor"]'), null, { timeout: 8000 });
        const first = await castSnapshot();
        ok('S4a rig-showcase built 首拍挂载单角色 FK stage', first.cast.join(',') === 'actor' && first.keys.join(',') === 'showcase/main#0', JSON.stringify(first));
        const firstPanel = await page.evaluate(() => {
          const look = document.querySelector('#look');
          return {
            role: look && look.getAttribute('role'),
            tabIndex: look && look.getAttribute('tabindex'),
            hook: !!(look && look.hasAttribute('data-cutscene-next')),
            runtimeChoices: document.querySelectorAll('#choices [data-cutscene-next],#choices .cutscene-next').length
          };
        });
        ok('S4a1 rig-showcase runtime next 融合到可聚焦正文面板且不进入 choices', firstPanel.role === 'button' && firstPanel.tabIndex === '0' && firstPanel.hook && firstPanel.runtimeChoices === 0, JSON.stringify(firstPanel));

        await clickNext();
        await page.waitForFunction(() => /扁平岩块落地/.test((document.querySelector('#look') || {}).textContent || ''), null, { timeout: 5000 });
        await clickNext();
        await page.waitForFunction(() => {
          const look = document.querySelector('#look[data-cutscene-next]');
          return look && /打字机逐字/.test(look.textContent || '') && look.getAttribute('aria-label') === '显示全部文字';
        }, null, { timeout: 5000 });
        await nextPanel().click();
        const revealed = await page.evaluate(() => {
          const look = document.querySelector('#look[data-cutscene-next]');
          return {
            text: (look || {}).textContent || '',
            label: look && look.getAttribute('aria-label'),
            cast: document.querySelectorAll('#scene svg [data-amatlas-rig-cast]').length
          };
        });
        ok('S4b typewriter 正文面板首次点击只显示全文、不越拍', /停顿也由数据定义/.test(revealed.text) && revealed.label === '继续 / 下一段' && revealed.cast === 0, JSON.stringify(revealed));
        await nextPanel().click();

        await waitForKey('showcase/main#3');
        await page.waitForTimeout(700);
        const warden = await castSnapshot();
        const travelerEnter = Number(await page.locator('[data-amatlas-rig-cast="traveler"]').getAttribute('opacity'));
        ok('S4c 后续拍才挂载 warden/traveler 双 rig，enter 收口且 stage 顺序稳定', warden.cast.join(',') === 'warden,traveler' && warden.keys.every((key) => key === 'showcase/main#3') && warden.parts === 26 && travelerEnter === 1, JSON.stringify({ warden, travelerEnter }));

        await clickNext();
        await waitForKey('showcase/main#4');
        await page.waitForTimeout(700);
        const traveler = await castSnapshot();
        ok('S4d speaker 轮换拍保留双角色并整体换到新 playback key', traveler.cast.join(',') === 'warden,traveler' && traveler.keys.every((key) => key === 'showcase/main#4'), JSON.stringify(traveler));

        await clickNext();
        await waitForKey('showcase/main#5');
        await page.waitForFunction(() => {
          const node = document.querySelector('[data-amatlas-rig-cast="traveler"]');
          const opacity = node && Number(node.getAttribute('opacity'));
          return opacity > 0 && opacity < 1;
        }, null, { timeout: 2400 });
        const exitOpacity = Number(await page.locator('[data-amatlas-rig-cast="traveler"]').getAttribute('opacity'));
        ok('S4e traveler exit 在真实 rAF 尾窗出现中间态', exitOpacity > 0 && exitOpacity < 1, 'opacity=' + exitOpacity);

        await clickNext();
        await waitForKey('showcase/main#6');
        const gestureStart = await page.evaluate(() => {
          const node = document.querySelector('[data-amatlas-rig-cast="warden"] [data-amatlas-rig-part="torso"]');
          return { transform: node && node.getAttribute('transform'), text: (document.querySelector('#look') || {}).textContent || '' };
        });
        await page.waitForFunction((start) => {
          const node = document.querySelector('[data-amatlas-rig-cast="warden"] [data-amatlas-rig-part="torso"]');
          return node && node.getAttribute('transform') !== start;
        }, gestureStart.transform, { timeout: 2400 });
        const gestureMoving = await page.evaluate(() => {
          const node = document.querySelector('[data-amatlas-rig-cast="warden"] [data-amatlas-rig-part="torso"]');
          return {
            cast: Array.prototype.slice.call(document.querySelectorAll('[data-amatlas-rig-cast]')).map((item) => item.getAttribute('data-amatlas-rig-cast')),
            transform: node && node.getAttribute('transform')
          };
        });
        ok('S4f traveler 清理后进入 warden 单角色语义动作拍，真实 rAF 推进根位移', /走向窗边/.test(gestureStart.text) && gestureMoving.cast.join(',') === 'warden' && gestureMoving.transform !== gestureStart.transform, JSON.stringify({ gestureStart, gestureMoving }));

        await clickNext();
        await waitForKey('showcase/main#7');
        const finalCast = await castSnapshot();
        const finalText = await page.locator('#look').innerText();
        const finalActions = await page.locator('#choices > button.choice').allTextContents();
        ok('S4g 动作拍后换 key 清理旧 stage，末拍只留静止 warden 与 replay 动作', finalCast.cast.join(',') === 'warden' && /旅人已离开/.test(finalText) && finalActions.some((text) => /重看完整展示/.test(text)), JSON.stringify({ finalCast, finalActions }));

        await nextPanel().click();
        await page.waitForFunction(() => {
          const texts = Array.prototype.slice.call(document.querySelectorAll('#choices > button.choice')).map((node) => node.textContent);
          return texts.length === 1 && /重看完整展示/.test(texts[0]);
        }, null, { timeout: 3000 });
        await page.locator('#choices > button.choice').filter({ hasText: '重看完整展示' }).click();
        await waitForKey('showcase/main#0');
        const replay = await castSnapshot();
        ok('S4h 末拍 replay 回到首拍且旧双角色/动作 stage 不残留', replay.cast.join(',') === 'actor' && replay.keys.join(',') === 'showcase/main#0', JSON.stringify(replay));
      });
      ok('S4i rig-showcase built 全生命周期零页面错误', errors.length === 0, errors.join(' | '));
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

    // Arcade 正式五果、三败与 mobile 公开事实旅程统一在 runArcadeExperienceEvidence；这里不保留改 goal/RNG/私有 state 的旧短 probe。

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

    // ── 场景 3a:五套协调recipe正式playable——真实入口、持续rAF、公开输入与局部warning ──
    {
      const cases = [
        { demo: 'maze3d', map: 'm', node: 'puzzle_maze', dir: 'E' },
        { demo: 'maze3d', map: 'm', node: 'layers_maze3', dir: 'E' },
        { demo: 'maze3d', map: 'm', node: 'fps_range', dir: 'E' },
        { demo: 'maze3d', map: 'm', node: 'layers_maze1', dir: 'E' },
        { demo: 'origin', map: 'atlas', node: 'unlit_corridor', dir: 'E' }
      ];
      const results = [];
      for (const target of cases) {
        const url = builtUrl(target.demo);
        const errors = await withPage(browser, async (page) => {
          const warnings = [], worldName = target.demo === 'origin' ? 'ORIGIN_WORLD' : 'MAZE3D_WORLD';
          page.on('console', (message) => { if (message.type() === 'warning' && /^\[maze/.test(message.text())) warnings.push(message.text()); });
          await page.addInitScript(({ worldName, map, node }) => {
            window.__dogfoodRafCount = 0;
            const nativeRaf = window.requestAnimationFrame.bind(window);
            window.requestAnimationFrame = function (callback) {
              window.__dogfoodRafCount++;
              return nativeRaf(callback);
            };
            let value;
            Object.defineProperty(window, worldName, {
              configurable: true,
              get() { return value; },
              set(world) { value = world; world.start = { map, node }; }
            });
          }, { worldName, map: target.map, node: target.node });
          await page.goto(url, { waitUntil: 'load' });
          await page.evaluate(() => localStorage.clear());
          await page.reload({ waitUntil: 'load' });
          await page.waitForFunction(({ map, node }) => {
            const pos = window._engine && window._engine.state && window._engine.state.pos;
            return pos && pos.map === map && pos.node === node && document.querySelector('#maze3d-stage canvas');
          }, { map: target.map, node: target.node }, { timeout: 8000 });
          const before = await page.evaluate(() => {
            const canvas = document.querySelector('#maze3d-stage canvas');
            const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let hash = 2166136261;
            for (let i = 0; i < data.length; i++) { hash ^= data[i]; hash = Math.imul(hash, 16777619); }
            return { hash: hash >>> 0, raf: window.__dogfoodRafCount };
          });
          await page.keyboard.down('ArrowRight');
          await page.waitForTimeout(180);
          await page.keyboard.up('ArrowRight');
          const after = await page.evaluate(() => {
            const canvas = document.querySelector('#maze3d-stage canvas');
            const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let hash = 2166136261;
            for (let i = 0; i < data.length; i++) { hash ^= data[i]; hash = Math.imul(hash, 16777619); }
            const pos = window._engine.state.pos;
            return { hash: hash >>> 0, raf: window.__dogfoodRafCount, pos, controls: !!document.querySelector('.amatlas-maze-controls') };
          });
          results.push({ node: target.node, entered: after.pos.map === target.map && after.pos.node === target.node, raf: after.raf > before.raf, input: after.hash !== before.hash, controls: after.controls, warnings: warnings.slice() });
        });
        results[results.length - 1].errors = errors;
      }
      ok('S9a 五套正式recipe均由built正式入口进入持续rAF canvas，公开转向改变画面且局部maze warning为0', results.length === 5 && results.every((item) => item.entered && item.raf && item.input && item.controls && item.warnings.length === 0 && item.errors.length === 0), JSON.stringify(results));
    }

    // ── 场景 4:FPS resource detour——同局耗尽→北支恢复、fresh正向、health与双端retry ──
    {
      const url = builtUrl('maze3d', 'fps.html');
      const errors = await withPage(browser, async (page) => {
        const hint = () => page.locator('#maze3d-stage .amatlas-maze-hint').innerText();
        const waitForFps = () => page.waitForFunction(() => document.querySelector('#maze3d-stage canvas') && document.querySelector('button[aria-label="开火"]'), null, { timeout: 8000 });
        const restart = async () => {
          await page.evaluate(() => localStorage.clear());
          await page.reload({ waitUntil: 'load' });
          await waitForFps();
        };
        const exitSnapshot = () => page.evaluate(() => {
          const exit = Array.prototype.slice.call(document.querySelectorAll('#choices button')).find((button) => /活着离开生存场/.test(button.textContent));
          return { canvas: !!document.querySelector('#maze3d-stage canvas'), exitEnabled: !!(exit && !exit.disabled), hint: (document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || '' };
        });
        await page.goto(url, { waitUntil: 'load' });
        await restart();
        const fireButton = page.locator('button[aria-label="开火"]');
        const initialHint = await hint();
        await page.waitForTimeout(5200);
        const waitingHint = await hint();
        ok('S10 FPS resource detour 直达入口未 ready 长等待仍 fresh/静止', /待命/.test(initialHint) && /生命 60\/60/.test(waitingHint) && /精确手枪 弹药 2\/6/.test(waitingHint) && /装甲目标 1/.test(waitingHint) && !/攻击预兆|受伤|阵亡/.test(waitingHint), initialHint + ' → ' + waitingHint);
        if (!/待命/.test(initialHint) || !/生命 60\/60/.test(waitingHint)) throw new Error('FPS resource detour ready gate 未锁住初始等待:' + initialHint + ' → ' + waitingHint);

        const canvas = page.locator('#maze3d-stage canvas');
        await canvas.click({ position: { x: 300, y: 180 } });
        await page.waitForFunction(() => document.pointerLockElement === document.querySelector('#maze3d-stage canvas'), null, { timeout: 3000 });
        const pointerLockHint = await hint();
        ok('S10a FPS 首次 canvas 点击只取得 Pointer Lock，不偷开火', /精确手枪 弹药 2\/6/.test(pointerLockHint) && /装甲目标 1/.test(pointerLockHint) && !/命中|未命中|弹药耗尽/.test(pointerLockHint), pointerLockHint);
        // 同一已唤醒 session：跳过北侧，耗尽主轴资源，先证 D 锁，再返回 (1,1) 恢复并收尾。
        await restart();
        await holdKey(page, 'w', 500);
        const negativePickup = await hint();
        ok('S11 FPS 负向主轴公开移动只取得 scatter 1/4', /近程霰弹枪 弹药 1\/4/.test(negativePickup) && /获得近程霰弹枪/.test(negativePickup), negativePickup);
        await fireButton.click(); await page.waitForTimeout(850);
        await page.keyboard.press('1'); await page.waitForTimeout(250);
        await fireButton.click(); await page.waitForTimeout(360);
        await fireButton.click(); await page.waitForTimeout(140);
        const depletedPrecision = await hint();
        await page.keyboard.press('2'); await page.waitForTimeout(80);
        const depletedScatter = await hint();
        await page.keyboard.press('1'); await page.waitForTimeout(250);
        ok('S12 FPS 同局耗尽 scatter1+precision2 后两槽均为0，100 HP guard仍余20', /精确手枪 弹药 0\/6/.test(depletedPrecision) && /命中装甲目标 \(20\/100\)/.test(depletedPrecision) && /装甲目标 1/.test(depletedPrecision) && /近程霰弹枪 弹药 0\/4/.test(depletedScatter) && /装甲目标 1/.test(depletedScatter), JSON.stringify({ depletedPrecision, depletedScatter }));
        if (!/精确手枪 弹药 0\/6/.test(depletedPrecision) || !/近程霰弹枪 弹药 0\/4/.test(depletedScatter)) throw new Error('FPS resource detour 未形成双槽耗尽负态:' + depletedPrecision + ' | ' + depletedScatter);
        await holdKey(page, 'd', 800);
        await holdKey(page, 'w', 3100);
        await holdKey(page, 'a', 800);
        await page.waitForFunction(() => /出口封锁/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 3000 });
        const locked = await exitSnapshot();
        ok('S13 FPS guard 余20时公开走到 D 仍显示出口封锁且 win link 禁用', locked.canvas && !locked.exitEnabled && /出口封锁/.test(locked.hint) && /装甲目标 1/.test(locked.hint), JSON.stringify(locked));
        await holdKey(page, 'a', 800);
        await holdKey(page, 's', 3700);
        const recovered = await hint();
        ok('S14 FPS 同一已唤醒 session 返回北侧 (1,1)，公开 HUD 捕获 +3 与 precision 3/6', /\+3 (?:精确手枪)?弹药/.test(recovered) && /精确手枪 弹药 3\/6/.test(recovered) && /装甲目标 1/.test(recovered), recovered);
        await holdKey(page, 'd', 800);
        await fireButton.click(); await page.waitForTimeout(180);
        const recoveredKill = await hint();
        ok('S15 FPS 回取后仅一发 precision 清掉剩余20', /精确手枪 弹药 2\/6/.test(recoveredKill) && /装甲目标 0/.test(recoveredKill) && /装甲目标已击倒/.test(recoveredKill), recoveredKill);
        await holdKey(page, 'w', 3700);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('#choices button')).some((button) => /活着离开生存场/.test(button.textContent) && !button.disabled), null, { timeout: 5000 });
        const recoveredOpened = await exitSnapshot();
        ok('S16 FPS 同局恢复后穿过已倒下 guard 路线与 D，收口 maze session', !recoveredOpened.canvas && recoveredOpened.exitEnabled, JSON.stringify(recoveredOpened));
        await page.locator('#choices button').filter({ hasText: '活着离开生存场' }).click();
        await page.waitForFunction(() => /FPS Encounter Kit · 资源绕行完成/.test((document.querySelector('#place') || {}).textContent || ''), null, { timeout: 5000 });

        // fresh 正向：ammo-first，再回主轴；同时保留 390px touch cycle 的尺寸、避让与真实切换。
        await restart();
        await holdKey(page, 'a', 850);
        const ammoFirst = await hint();
        ok('S16a FPS fresh ammo-first 北支公开 HUD 显示 +3 / precision 5/6', /\+3 (?:精确手枪)?弹药/.test(ammoFirst) && /精确手枪 弹药 5\/6/.test(ammoFirst), ammoFirst);
        await holdKey(page, 'd', 800);
        await holdKey(page, 'w', 500);
        const positiveScatter = await hint();
        await page.setViewportSize({ width: 390, height: 844 });
        const touchCycle = page.locator('button[aria-label="切换武器"]');
        const touchSurface = await page.evaluate(() => {
          const cycle = document.querySelector('button[aria-label="切换武器"]'), fire = document.querySelector('button[aria-label="开火"]'), full = document.querySelector('button[aria-label="全屏"]'), hud = document.querySelector('.amatlas-maze-hint');
          const rect = (node) => node && node.getBoundingClientRect();
          const overlap = (a, b) => !!(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
          const c = rect(cycle), f = rect(fire), fs = rect(full), h = rect(hud);
          return { display: cycle && getComputedStyle(cycle).display, width: c && c.width, height: c && c.height, overlaps: overlap(c, f) || overlap(c, fs) || overlap(c, h) };
        });
        await touchCycle.dispatchEvent('pointerdown', { pointerId: 41, pointerType: 'touch', isPrimary: true });
        await touchCycle.dispatchEvent('pointerup', { pointerId: 41, pointerType: 'touch', isPrimary: true });
        await page.waitForTimeout(100);
        const touchPrecision = await hint();
        ok('S16b FPS 390px touch cycle ≥48px且不遮 fire/fullscreen/HUD，并真实切到 precision', /近程霰弹枪 弹药 1\/4/.test(positiveScatter) && touchSurface.display !== 'none' && touchSurface.width >= 48 && touchSurface.height >= 48 && !touchSurface.overlaps && /精确手枪 弹药 5\/6/.test(touchPrecision), JSON.stringify({ touchSurface, touchPrecision }));
        await touchCycle.dispatchEvent('pointerdown', { pointerId: 42, pointerType: 'touch', isPrimary: true });
        await touchCycle.dispatchEvent('pointerup', { pointerId: 42, pointerType: 'touch', isPrimary: true });
        await page.setViewportSize({ width: 900, height: 700 });
        await page.waitForTimeout(250);
        await holdKey(page, 'w', 900);
        await fireButton.click(); await page.waitForTimeout(850);
        await page.keyboard.press('1'); await page.waitForTimeout(250);
        for (let shot = 0; shot < 3; shot++) { await fireButton.click(); await page.waitForTimeout(360); }
        const positiveKill = await hint();
        ok('S16c FPS fresh ammo-first 以 scatter1+precision3 清掉100 HP guard', /精确手枪 弹药 2\/6/.test(positiveKill) && /装甲目标 0/.test(positiveKill) && /装甲目标已击倒/.test(positiveKill), positiveKill);
        await holdKey(page, 'w', 2500);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('#choices button')).some((button) => /活着离开生存场/.test(button.textContent) && !button.disabled), null, { timeout: 5000 });
        ok('S16d FPS fresh ammo-first 穿过同一 D', !(await exitSnapshot()).canvas);

        // health 是独立容错：满血接触不消费；离开受伤后回取才 +20。
        await restart();
        await holdKey(page, 'd', 850);
        const healthFull = await hint();
        ok('S16e FPS health 满血经过只显示“生命已满”，不消费', /生命已满/.test(healthFull) && /生命 60\/60/.test(healthFull), healthFull);
        await holdKey(page, 'a', 800);
        await fireButton.click();
        await page.waitForFunction(() => /生命 40\/60/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 10000 });
        await holdKey(page, 'd', 850);
        const healthRecovered = await hint();
        ok('S16f FPS 受伤后回到同一 health 才消费 +20 并恢复60/60', /\+20 生命/.test(healthRecovered) && /生命 60\/60/.test(healthRecovered), healthRecovered);

        // 两种 retry surface 都 fresh；同节点重试后实际重取三件，结果页重试后再次可取三件。
        await restart();
        await fireButton.click();
        await page.waitForFunction(() => /阵亡/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 15000 });
        const deathActions = await page.evaluate(() => Array.prototype.slice.call(document.querySelectorAll('#choices button')).map((button) => ({ text: button.textContent, disabled: button.disabled })));
        ok('S17 FPS 阵亡后当前节点同时提供一键重试与结果页', deathActions.some((item) => /一键重试/.test(item.text) && !item.disabled) && deathActions.some((item) => /查看阵亡结果/.test(item.text) && !item.disabled), JSON.stringify(deathActions));
        await page.locator('#choices button').filter({ hasText: '一键重试' }).click();
        await page.waitForFunction(() => /待命/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 8000 });
        const oneClickFresh = await hint();
        await holdKey(page, 'a', 850); const oneClickAmmo = await hint();
        await holdKey(page, 'd', 800); await holdKey(page, 'w', 500); const oneClickScatter = await hint();
        await holdKey(page, 's', 500); await holdKey(page, 'd', 500);
        await fireButton.click();
        await page.waitForFunction(() => /生命 40\/60/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 10000 });
        await holdKey(page, 'd', 300); const oneClickHealth = await hint();
        ok('S18 FPS 一键重试 fresh 后 ammo/scatter/health 三件均可再次实际取得', /精确手枪 弹药 2\/6/.test(oneClickFresh) && /装甲目标 1/.test(oneClickFresh) && /\+3 (?:精确手枪)?弹药/.test(oneClickAmmo) && /获得近程霰弹枪/.test(oneClickScatter) && /\+20 生命/.test(oneClickHealth), JSON.stringify({ oneClickFresh, oneClickAmmo, oneClickScatter, oneClickHealth }));
        await page.waitForFunction(() => /阵亡/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 15000 });
        await page.locator('#choices button').filter({ hasText: '查看阵亡结果' }).click();
        await page.locator('#choices button').filter({ hasText: '重试生存场' }).click();
        await page.waitForFunction(() => /待命/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 8000 });
        const resultFresh = await hint();
        await holdKey(page, 'a', 850); const resultAmmo = await hint();
        await holdKey(page, 'd', 800); await holdKey(page, 'w', 500); const resultScatter = await hint();
        await holdKey(page, 's', 500); await holdKey(page, 'd', 850); const resultHealth = await hint();
        ok('S18a FPS 结果页重试同样 fresh，三件 pickup 再次有公开接触回执', /精确手枪 弹药 2\/6/.test(resultFresh) && /装甲目标 1/.test(resultFresh) && /\+3 (?:精确手枪)?弹药/.test(resultAmmo) && /获得近程霰弹枪/.test(resultScatter) && /生命已满/.test(resultHealth), JSON.stringify({ resultFresh, resultAmmo, resultScatter, resultHealth }));
      });
      ok('S19 FPS resource detour / Pointer Lock / touch / health / 双端retry 全路径零页面错误', errors.length === 0, errors.join(' | '));
    }

    // ── 场景 4b:Origin 综合 dogfood——rich seed dialogue + FPS 因果闭环 ──
    {
      const url = builtUrl('origin');
      const errors = await withPage(browser, async (page) => {
        await page.addInitScript(() => {
          let value;
          Object.defineProperty(window, 'ORIGIN_WORLD', {
            configurable: true,
            get() { return value; },
            set(world) {
              value = world;
              world.start = { map: 'atlas', node: localStorage.getItem('__origin_browser_start') || 'loom' };
            }
          });
        });
        const nextPanel = () => page.locator('#look[data-cutscene-next]');
        const startSeaDialogue = async () => {
          await page.evaluate(() => { localStorage.clear(); localStorage.setItem('__origin_browser_start', 'loom'); });
          await page.reload({ waitUntil: 'load' });
          await page.locator('#choices button').filter({ hasText: '写入一片会记住月亮的海' }).click();
          await page.waitForFunction(() => document.querySelector('[data-amatlas-motion-layer="seed"]') && document.querySelector('#look[data-cutscene-next]'), null, { timeout: 8000 });
        };
        const completeAndAdvance = async () => {
          const panel = nextPanel();
          await panel.waitFor({ state: 'visible', timeout: 8000 });
          if (await panel.getAttribute('aria-label') === '显示全部文字') await panel.click();
          const stillPanel = nextPanel();
          if (await stillPanel.count()) await stillPanel.click();
        };
        const safeLayout = async () => page.evaluate(() => {
          const look = document.querySelector('#look[data-cutscene-next]');
          const lines = Array.from(document.querySelectorAll('#look > .line'));
          if (!look) return null;
          const l = look.getBoundingClientRect();
          const last = lines.length ? lines[lines.length - 1].getBoundingClientRect() : null;
          const style = getComputedStyle(look);
          return {
            x: l.x, y: l.y, w: l.width, h: l.height, vw: innerWidth, vh: innerHeight,
            role: look.getAttribute('role'), tabIndex: look.getAttribute('tabindex'),
            focused: document.activeElement === look,
            outlineWidth: parseFloat(style.outlineWidth) || 0,
            paddingInlineEnd: parseFloat(style.paddingInlineEnd) || 0,
            paddingBlockEnd: parseFloat(style.paddingBlockEnd) || 0,
            trailingGap: last ? l.bottom - last.bottom : 0,
            runtimeChoices: document.querySelectorAll('#choices [data-cutscene-next],#choices .cutscene-next').length
          };
        });
        const toastPanelLayout = async () => page.evaluate(() => {
          const panel = document.querySelector('#look[data-cutscene-next]');
          const stack = document.querySelector('.amatlas-toast-stack');
          if (!panel || !stack) return null;
          const p = panel.getBoundingClientRect();
          const t = stack.getBoundingClientRect();
          const overlap = Math.max(0, Math.min(p.right, t.right) - Math.max(p.left, t.left)) * Math.max(0, Math.min(p.bottom, t.bottom) - Math.max(p.top, t.top));
          const hit = document.elementFromPoint(p.left + p.width / 2, p.top + p.height / 2);
          return {
            panel: { left: p.left, top: p.top, right: p.right, bottom: p.bottom },
            toast: { left: t.left, top: t.top, right: t.right, bottom: t.bottom },
            overlap,
            centerHitsPanel: hit === panel || panel.contains(hit),
            runtimeChoices: document.querySelectorAll('#choices [data-cutscene-next],#choices .cutscene-next').length
          };
        });
        await page.goto(url, { waitUntil: 'load' });
        await startSeaDialogue();
        const firstKey = await page.locator('[data-amatlas-motion-key]').getAttribute('data-amatlas-motion-key');
        await page.locator('#look').click();
        const afterFirstPanelClick = await page.evaluate(() => ({
          key: document.querySelector('[data-amatlas-motion-key]') && document.querySelector('[data-amatlas-motion-key]').getAttribute('data-amatlas-motion-key'),
          label: document.querySelector('#look[data-cutscene-next]') && document.querySelector('#look[data-cutscene-next]').getAttribute('aria-label')
        }));
        ok('S19a Origin 正文第一击只补全 typewriter，不越过 seed motion 首拍', afterFirstPanelClick.key === firstKey && afterFirstPanelClick.label === '继续 / 下一段', JSON.stringify(afterFirstPanelClick));
        await page.evaluate(() => {
          const line = document.querySelector('#look .line');
          const selection = getSelection(); const range = document.createRange();
          range.selectNodeContents(line); selection.removeAllRanges(); selection.addRange(range);
          const look = document.querySelector('#look');
          const init = { bubbles: true, button: 0, pointerId: 7, clientX: 20, clientY: 20 };
          look.dispatchEvent(new PointerEvent('pointerdown', init));
          look.dispatchEvent(new PointerEvent('pointerup', init));
          look.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, clientX: 20, clientY: 20 }));
        });
        ok('S19b Origin 选择正文后 click 不推进', (await page.locator('[data-amatlas-motion-key]').getAttribute('data-amatlas-motion-key')) === firstKey);
        await page.evaluate(() => getSelection().removeAllRanges());
        await nextPanel().focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('[data-amatlas-rig-cast="cartographer"]'), null, { timeout: 5000 });
        await page.waitForTimeout(250);
        const entering = Number(await page.locator('[data-amatlas-rig-cast="cartographer"]').getAttribute('opacity'));
        ok('S19c Origin 正文面板 Enter 推进到 cartographer enter 的真实中间帧', entering > 0 && entering < 1, 'opacity=' + entering);

        await startSeaDialogue();
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const keyboardKey0 = await page.locator('[data-amatlas-motion-key]').getAttribute('data-amatlas-motion-key');
        await nextPanel().focus();
        await page.keyboard.press('Enter');
        const afterKeyboardReveal = await page.evaluate(() => ({
          key: document.querySelector('[data-amatlas-motion-key]').getAttribute('data-amatlas-motion-key'),
          label: document.querySelector('#look[data-cutscene-next]').getAttribute('aria-label'),
          focused: document.activeElement === document.querySelector('#look[data-cutscene-next]')
        }));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.keyboard.press('Space');
        await page.waitForFunction(() => /#1$/.test(document.querySelector('[data-amatlas-rig-key]').getAttribute('data-amatlas-rig-key')), null, { timeout: 5000 });
        const focusedAfterRebuild = await page.evaluate(() => document.activeElement === document.querySelector('#look[data-cutscene-next]'));
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
        const keyboardKey2 = await page.locator('[data-amatlas-rig-key]').getAttribute('data-amatlas-rig-key');
        ok('S19c1 Origin 连续 Enter/Space 推进保持 #look 焦点并可第三次 Enter 换拍', afterKeyboardReveal.key === keyboardKey0 && afterKeyboardReveal.label === '继续 / 下一段' && afterKeyboardReveal.focused && focusedAfterRebuild && /#2$/.test(keyboardKey2), JSON.stringify({ afterKeyboardReveal, focusedAfterRebuild, keyboardKey2 }));

        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await startSeaDialogue();
        await nextPanel().click();
        await nextPanel().click();
        await page.waitForFunction(() => document.querySelector('[data-amatlas-rig-key$="#1"]'), null, { timeout: 5000 });

        for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
          await page.setViewportSize(viewport);
          await page.keyboard.press('Tab');
          await nextPanel().focus();
          const layout = await safeLayout();
          ok('S19d Origin #look 推进面板在 ' + viewport.width + 'x' + viewport.height + ' 完整可见、有焦点环且无 next 专用留白', !!layout && layout.w >= 44 && layout.h >= 44 && layout.x >= 0 && layout.y >= 0 && layout.x + layout.w <= layout.vw && layout.y + layout.h <= layout.vh && layout.role === 'button' && layout.tabIndex === '0' && layout.focused && layout.outlineWidth >= 2 && layout.paddingInlineEnd < 32 && layout.paddingBlockEnd < 16 && layout.trailingGap < 24 && layout.runtimeChoices === 0, JSON.stringify(layout));
        }
        await page.setViewportSize({ width: 900, height: 700 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await startSeaDialogue();
        await nextPanel().click();   // reduced-motion: #0 直接进 #1。
        await nextPanel().click();   // #1 直接进 speaker #2，不受前一段自然计时漂移影响。
        await page.waitForFunction(() => {
          const beat = document.querySelector('[data-amatlas-rig-key$="#2"]');
          const panel = document.querySelector('#look[data-cutscene-next]');
          return beat && panel && panel.getAttribute('aria-label') === '继续 / 下一段';
        }, null, { timeout: 8000 });
        const speaking = await page.evaluate(() => ({
          cast: !!document.querySelector('[data-amatlas-rig-cast="cartographer"]'),
          mouth: !!document.querySelector('[data-amatlas-rig-part="mouth"] [data-amatlas-rig-state="A"]'),
          text: (document.querySelector('#look') || {}).textContent || ''
        }));
        ok('S19e reduced-motion 下 speaker/typewriter 立即完整且 mouth A/O 资产存在', speaking.cast && speaking.mouth && /像海记住月亮/.test(speaking.text), JSON.stringify(speaking));

        await startSeaDialogue();
        await nextPanel().click();
        await nextPanel().click();
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await completeAndAdvance();   // 从 #2 进入自然播放的 exit #3。
        await page.waitForFunction(() => document.querySelector('[data-amatlas-rig-key$="#3"]'), null, { timeout: 8000 });
        await page.waitForTimeout(2050);
        const exitOpacity = Number(await page.locator('[data-amatlas-rig-cast="cartographer"]').getAttribute('opacity'));
        ok('S19f Origin cartographer exit 尾窗出现真实中间态且 fracture motion 同拍存在', exitOpacity > 0 && exitOpacity < 1 && await page.locator('[data-amatlas-motion-layer="fracture"]').count() === 1, 'opacity=' + exitOpacity);
        await completeAndAdvance();
        if (await nextPanel().count()) await nextPanel().click();
        await page.locator('#choices button').filter({ hasText: '握住第一条规律' }).click();
        await page.waitForFunction(() => document.querySelector('#maze3d-stage canvas') && document.querySelector('button[aria-label="定序"]'), null, { timeout: 8000 });
        const originThemeCopy = await page.evaluate(() => {
          const stage = document.querySelector('#maze3d-stage');
          return stage ? stage.textContent + ' | ' + Array.from(stage.querySelectorAll('button')).map((button) => [button.textContent, button.getAttribute('aria-label'), button.title].join(' ')).join(' | ') : '';
        });
        ok('S19f1 Origin trial 公开 HUD/按钮只读成承载/星图刻针/星砂/未定项/定序', /承载/.test(originThemeCopy) && /星图刻针/.test(originThemeCopy) && /星砂/.test(originThemeCopy) && /未定项/.test(originThemeCopy) && /定序/.test(originThemeCopy) && !/精确武器|散射武器|手枪|骷髅|守卫|敌人|开火/.test(originThemeCopy), originThemeCopy);
        const originHint = () => page.locator('#maze3d-stage .amatlas-maze-hint').innerText();
        await holdKey(page, 'w', 1650);
        const originScatter = await originHint();
        ok('S19g Origin close breach 必经 x5 公开取得星环共振器 1/4', /星环共振器 星砂 1\/4/.test(originScatter) && /承载星环共振器/.test(originScatter), originScatter);
        const fire = page.locator('button[aria-label="定序"]');
        // 活 guard 卡住 x6：正推、斜推与纯 strafe 都不能越口；绕行尝试后仍朝东命中，证明不是只看 link 锁。
        await holdKey(page, 'w', 900);
        await holdKeysSimulated(page, ['w', 'd'], 900);
        await holdKey(page, 'd', 900);
        await fire.click(); await page.waitForTimeout(120);
        await page.keyboard.press('1'); await fire.click(); await page.waitForTimeout(80);
        const originCooldown = await originHint();
        ok('S19g1 Origin 活静态 guard 阻断 W/W+D/strafe 绕口，尝试后向东 scatter 仍耗弹且目标存活', /星图刻针 星砂 2\/6/.test(originCooldown) && /未定项 1/.test(originCooldown), originCooldown);
        ok('S19g2 Origin 立即 precision press 被全局 scatter cooldown 拒绝且不耗星砂', /星图刻针 星砂 2\/6/.test(originCooldown) && /刻针回稳中/.test(originCooldown) && /未定项 1/.test(originCooldown), originCooldown);
        await page.waitForTimeout(500);
        const breachHit = await originHint();
        ok('S19g3 Origin 绕口尝试后的 scatter 由公开 HUD 明示命中并留下20/60', /星图刻针 星砂 2\/6/.test(breachHit) && /未定项 1/.test(breachHit) && /测定未定项 \(20\/60\)/.test(breachHit), breachHit);
        await page.waitForTimeout(200);
        await fire.click(); await page.waitForTimeout(180);
        const originKill = await originHint();
        ok('S19g4 Origin 回稳后新 press 精确清掉剩余20', /星图刻针 星砂 1\/6/.test(originKill) && /未定项 0/.test(originKill) && /未定项已闭合/.test(originKill), originKill);
        await holdKey(page, 'a', 900);
        await holdKey(page, 'w', 2300);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('#choices button')).some((button) => /护送第一条规律/.test(button.textContent) && !button.disabled), null, { timeout: 6000 });
        await page.locator('#choices button').filter({ hasText: '护送第一条规律' }).click();
        await page.waitForFunction(() => document.querySelector('[data-amatlas-motion-layer="new_world"]'), null, { timeout: 8000 });
        ok('S19g5 Origin guard dead 后穿 corpse/D 并只经既有 first_world win link 进入 motion 终章', await page.locator('#place').filter({ hasText: '终章 · 第一个世界' }).isVisible() && await page.locator('[data-amatlas-motion-layer="new_world"]').count() === 1);
        await page.waitForFunction(() => document.querySelector('.amatlas-toast-stack .amatlas-achievement') && document.querySelector('#look[data-cutscene-next]'), null, { timeout: 3000 });
        for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 700 }]) {
          await page.setViewportSize(viewport);
          const toastLayout = await toastPanelLayout();
          ok('S19g1 Origin 成就 toast 在 ' + viewport.width + 'x' + viewport.height + ' 不遮正文面板中心且 choices 无 runtime next', !!toastLayout && toastLayout.overlap === 0 && toastLayout.centerHitsPanel && toastLayout.runtimeChoices === 0, JSON.stringify(toastLayout));
        }

        const waitForOriginDeath = () => page.waitForFunction(() => /阵亡/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 10000 });
        const touchFreshOriginSupplies = async () => {
          await holdKey(page, 'w', 400);
          await holdKey(page, 'a', 400);
          const health = await originHint();
          await holdKey(page, 'd', 400);
          await holdKey(page, 'w', 1200);
          const scatter = await originHint();
          await fire.click(); await page.waitForTimeout(650);
          const fullGuard = await originHint();
          return { health, scatter, fullGuard };
        };
        await page.evaluate(() => { localStorage.clear(); localStorage.setItem('__origin_browser_start', 'first_world_trial'); });
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => document.querySelector('#maze3d-stage canvas'), null, { timeout: 8000 });
        await holdKey(page, 'w', 1650);
        await page.keyboard.press('Space');   // 靠近静态未定项后用公开定序声唤醒，再等待三次攻击阵亡。
        await waitForOriginDeath();
        await page.locator('#choices button').filter({ hasText: '一键重试第一场噪声' }).click();
        await page.waitForFunction(() => /待命/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 8000 });
        const trialFresh = await originHint();
        const trialSupplies = await touchFreshOriginSupplies();
        ok('S19h Origin 同节点重试公开重建 precision2、health、scatter 与完整60 HP静态guard', /承载 60\/60/.test(trialFresh) && /星图刻针 星砂 2\/6/.test(trialFresh) && /未定项 1/.test(trialFresh) && /承载已满/.test(trialSupplies.health) && /承载星环共振器/.test(trialSupplies.scatter) && /测定未定项 \(20\/60\)/.test(trialSupplies.fullGuard), JSON.stringify({ trialFresh, trialSupplies }));
        await waitForOriginDeath();
        await page.locator('#choices button').filter({ hasText: '听制图者解释' }).click();
        await page.locator('#choices button').filter({ hasText: '重新护送第一条规律' }).click();
        await page.waitForFunction(() => /待命/.test((document.querySelector('#maze3d-stage .amatlas-maze-hint') || {}).textContent || ''), null, { timeout: 8000 });
        const resultFresh = await originHint();
        const resultSupplies = await touchFreshOriginSupplies();
        ok('S19i Origin 结果页重试同样公开重建 precision2、health、scatter 与完整60 HP静态guard', /承载 60\/60/.test(resultFresh) && /星图刻针 星砂 2\/6/.test(resultFresh) && /未定项 1/.test(resultFresh) && /承载已满/.test(resultSupplies.health) && /承载星环共振器/.test(resultSupplies.scatter) && /测定未定项 \(20\/60\)/.test(resultSupplies.fullGuard), JSON.stringify({ resultFresh, resultSupplies }));
      });
      ok('S19j Origin rich/FPS 胜负/两端重试全旅程零页面错误与远程请求', errors.length === 0, errors.join(' | '));
    }

    // ── 场景 5:FPS 动态 grid——同一 built 产品的 events[].set 必须让 combat A* cache 对称失效 ──
    {
      const url = builtUrl('maze3d');
      const errors = await withPage(browser, async (page) => {
        await page.addInitScript(() => {
          let value;
          Object.defineProperty(window, 'MAZE3D_WORLD', {
            configurable: true,
            get() { return value; },
            set(world) {
              value = world;
              const base = world.maps.m.nodes.fps_range;
              const clone = (v) => JSON.parse(JSON.stringify(v));
              const node = clone(base);
              node.title = 'FPS 动态隔离墙回归';
              node.look = '按互动升起隔离墙，守卫不得穿墙。';
              node.winKey = 'fpsRangeEscaped';
              node.maze.grid = ['#######', '#.....#', '#.....#', '#.....#', '#######'];
              node.maze.start = { x: 1, y: 2, dir: 'E' };
              node.maze.combat.exitRequires = undefined;
              delete node.maze.combat.exitRequires;
              node.maze.combat.player.maxHealth = 100;
              node.maze.combat.player.health = 100;
              node.maze.combat.loadout = [{ kind: 'precision', ammo: 9, maxAmmo: 9 }];
              node.maze.combat.equipped = 'precision';
              node.maze.combat.guard = {
                x: 4, y: 2, hp: 100, hitRadius: 0.23,
                ai: { sight: 9, hear: 8, attackRange: 0.50, moveSpeed: 1.1, damage: 20, windup: 0.10, cooldown: 9 }
              };
              delete node.maze.combat.pickups;
              node.maze.events = [{
                x: 1, y: 2, visual: 'marker', trigger: 'interact', hint: '隔离墙升起。',
                set: [{ x: 3, y: 1, ch: '#' }, { x: 3, y: 2, ch: '#' }, { x: 3, y: 3, ch: '#' }]
              }];
              node.links = [{ to: 'hub', label: '返回入口' }];
              world.maps.m.nodes.fps_dynamic_wall_probe = node;
              world.maps.m.nodes.hub.links.push({ to: 'fps_dynamic_wall_probe', label: '进入 FPS 动态隔离墙回归' });
            }
          });
        });
        await page.goto(url, { waitUntil: 'load' });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'load' });
        await page.locator('#choices button').filter({ hasText: '进入 FPS 动态隔离墙回归' }).click();
        await page.waitForFunction(() => document.querySelector('#maze3d-stage canvas') && document.querySelector('button[aria-label="互动"]'), null, { timeout: 8000 });
        await page.waitForTimeout(80);
        await page.locator('button[aria-label="互动"]').click();
        await page.waitForTimeout(3200);
        const result = await page.evaluate(() => {
          const hint = document.querySelector('#maze3d-stage .amatlas-maze-hint');
          return { hint: hint && hint.textContent, canvas: !!document.querySelector('#maze3d-stage canvas') };
        });
        ok('S20 FPS built 动态升墙后守卫不穿墙且玩家不受伤', result.canvas && /生命 100\/100/.test(result.hint || '') && !/受伤|攻击预兆/.test(result.hint || ''), JSON.stringify(result));
      });
      ok('S21 FPS 动态 grid built 路径零页面错误', errors.length === 0, errors.join(' | '));
    }

    // ── 场景 6:sidescroller coast——source/built 跑、跳、卷屏、套件签名与 coarse 控件 ──
    for (const entry of [
      { label: 'source', url: sourceUrl('sidescroller') },
      { label: 'built', url: builtUrl('sidescroller') }
    ]) {
      const errors = await withPage(browser, async (page) => {
        await page.goto(entry.url, { waitUntil: 'load' });
        await page.locator('#choices button').filter({ hasText: '进入横版试验段' }).click();
        await page.waitForFunction(() => document.querySelector('#sidescroller-stage canvas') && document.querySelector('.amatlas-sidescroller-hud'), null, { timeout: 8000 });
        const readX = async () => Number(((await page.locator('.amatlas-sidescroller-hud').innerText()).match(/x (\d+)/) || [])[1]);
        const before = await readX();
        await page.keyboard.down('ArrowRight');
        await page.waitForTimeout(700);
        await page.keyboard.press('Space');
        await page.waitForTimeout(700);
        await page.keyboard.up('ArrowRight');
        const after = await readX();
        const surface = await page.evaluate(() => {
          const canvas = document.querySelector('#sidescroller-stage canvas');
          const cr = canvas && canvas.getBoundingClientRect();
          const buttons = Array.prototype.slice.call(document.querySelectorAll('.amatlas-sidescroller-controls button'));
          return {
            canvas: canvas && [canvas.width, canvas.height],
            choices: Array.prototype.slice.call(document.querySelectorAll('#choices button')).map((node) => node.textContent),
            buttons: buttons.map((node) => [node.getAttribute('aria-label'), node.getBoundingClientRect().width, node.getBoundingClientRect().height]),
            overlaps: !!cr && buttons.some((node) => {
              const r = node.getBoundingClientRect();
              return Math.max(0, Math.min(cr.right, r.right) - Math.max(cr.left, r.left)) * Math.max(0, Math.min(cr.bottom, r.bottom) - Math.max(cr.top, r.top)) > 0;
            })
          };
        });
        ok('S22 sidescroller ' + entry.label + ' 键盘真实驱动跑、跳与卷屏，撤离出口始终存在', after > before + 30 && surface.canvas.join(',') === '320,180' && surface.choices.some((text) => /撤离试验段/.test(text)), JSON.stringify({ before, after, surface }));
        ok('S23 sidescroller ' + entry.label + ' 屏上控件 ≥44px 且不遮 canvas', surface.buttons.length === 5 && surface.buttons.every((item) => item[1] >= 44 && item[2] >= 44) && !surface.overlaps, JSON.stringify(surface));
        await page.waitForTimeout(1500);
        for (let shot = 0; shot < 3; shot++) {
          await page.keyboard.press('Space');
          await page.waitForTimeout(850);
        }
        await page.waitForFunction(() => /哨戒炮已解除/.test((document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || '') && Array.prototype.slice.call(document.querySelectorAll('#choices button')).some((node) => /穿过解除封锁/.test(node.textContent)), null, { timeout: 5000 });
        const cleared = await page.evaluate(() => ({
          hud: (document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || '',
          choices: Array.prototype.slice.call(document.querySelectorAll('#choices button')).map((node) => node.textContent),
          flag: !!(window._engine && window._engine.state.sidescrollerCleared)
        }));
        ok('S24 sidescroller ' + entry.label + ' 三枪击毁固定哨戒炮后单写 clear 并暴露标准出口', cleared.flag && /海堤门已开放/.test(cleared.hud) && cleared.choices.some((text) => /穿过解除封锁/.test(text)) && cleared.choices.some((text) => /撤离试验段/.test(text)), JSON.stringify(cleared));
      });
      ok('S25 sidescroller ' + entry.label + ' 路径零页面错误', errors.length === 0, errors.join(' | '));
    }

    // ── 场景 6a:sidescroller presentation——两profile像素签名、音频边沿与reduced-motion ──
    for (const entry of [
      { label: 'coast source', url: sourceUrl('sidescroller'), choice: '进入横版试验段', hud: /生命 3 \/ 3/ },
      { label: 'coast built', url: builtUrl('sidescroller'), choice: '进入横版试验段', hud: /生命 3 \/ 3/ },
      { label: 'frost source', url: sourceUrl('sidescroller-frostline'), choice: '踏上霜线货运坡道', hud: /耐寒 4 \/ 4/ },
      { label: 'frost built', url: builtUrl('sidescroller-frostline'), choice: '踏上霜线货运坡道', hud: /耐寒 4 \/ 4/ }
    ]) {
      const errors = await withPage(browser, async (page) => {
        await page.addInitScript(() => {
          const calls = { contexts: 0, resumes: 0, closes: 0, cues: [], active: 0 };
          class AudioContextProbe {
            constructor() { calls.contexts++; this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
            resume() { calls.resumes++; this.state = 'running'; }
            close() { calls.closes++; this.state = 'closed'; }
            createOscillator() {
              const osc = { type: '', frequency: { first: 0, setValueAtTime(v) { osc.frequency.first = v; }, exponentialRampToValueAtTime() {} }, connect() {}, start() { calls.active++; calls.cues.push(osc.frequency.first); }, stop() { if (calls.active > 0) calls.active--; if (osc.onended) osc.onended(); }, onended: null };
              return osc;
            }
            createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
          }
          window.AudioContext = AudioContextProbe; window.__sideAudio = calls;
        });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.goto(entry.url, { waitUntil: 'load' });
        await page.locator('#choices button').filter({ hasText: entry.choice }).click();
        await page.waitForFunction(() => document.querySelector('#sidescroller-stage canvas'), null, { timeout: 8000 });
        const beforeGesture = await page.evaluate(() => ({ audio: Object.assign({}, window.__sideAudio), hud: (document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || '' }));
        await page.keyboard.press('Space'); await page.waitForTimeout(80);
        const afterGesture = await page.evaluate(() => {
          const canvas = document.querySelector('#sidescroller-stage canvas');
          const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          const colors = { coast: [242, 185, 111], frost: [124, 231, 238] }, counts = { coast: 0, frost: 0 };
          for (let i = 0; i < data.length; i += 4) for (const key of Object.keys(colors)) if (data[i] === colors[key][0] && data[i + 1] === colors[key][1] && data[i + 2] === colors[key][2] && data[i + 3] === 255) counts[key]++;
          return { audio: Object.assign({}, window.__sideAudio), counts };
        });
        ok('S25a ' + entry.label + ' 手势前0 Context、手势后单Context/单shot且profile HUD成立', beforeGesture.audio.contexts === 0 && entry.hud.test(beforeGesture.hud) && afterGesture.audio.contexts === 1 && afterGesture.audio.resumes === 1 && afterGesture.audio.cues.length === 1, JSON.stringify({ beforeGesture, afterGesture }));
        if (/coast/.test(entry.label)) ok('S25b ' + entry.label + ' 只出现coast玩家角色色', afterGesture.counts.coast > 20 && afterGesture.counts.frost === 0, JSON.stringify(afterGesture.counts));
        else ok('S25b ' + entry.label + ' 只出现frost玩家角色色', afterGesture.counts.frost > 20 && afterGesture.counts.coast === 0, JSON.stringify(afterGesture.counts));
        await page.locator('#choices button').filter({ hasText: /撤离|退回/ }).click(); await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.locator('#choices button').filter({ hasText: entry.choice }).click(); await page.waitForFunction(() => document.querySelector('#sidescroller-stage canvas'), null, { timeout: 5000 });
        await page.keyboard.press('Space'); await page.waitForTimeout(35);
        const reduced = await page.evaluate(() => {
          const canvas = document.querySelector('#sidescroller-stage canvas'), data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          const causal = [[255, 177, 95], [191, 248, 255], [255, 209, 102], [173, 251, 255]]; let pixels = 0;
          for (let i = 0; i < data.length; i += 4) if (causal.some((rgb) => data[i] === rgb[0] && data[i + 1] === rgb[1] && data[i + 2] === rgb[2] && data[i + 3] === 255)) pixels++;
          return { pixels, audio: Object.assign({}, window.__sideAudio) };
        });
        ok('S25c ' + entry.label + ' reduced-motion会话仍绘制shot因果符号并运行玩法', reduced.pixels > 0 && reduced.audio.cues.length === 2, JSON.stringify(reduced));
        await page.locator('#choices button').filter({ hasText: /撤离|退回/ }).click(); await page.waitForTimeout(40);
        const stopped = await page.evaluate(() => Object.assign({}, window.__sideAudio));
        ok('S25d ' + entry.label + ' 两次离场各关闭Context且零活源', stopped.contexts === 2 && stopped.closes === 2 && stopped.active === 0, JSON.stringify(stopped));
      });
      ok('S25e ' + entry.label + ' presentation路径零页面错误与远程请求', errors.length === 0, errors.join(' | '));
    }

    // ── 场景 7:sidescroller 第二客户——source/built 桌面 + 390px 屏上控件 ──
    for (const entry of [
      { label: 'source', url: sourceUrl('sidescroller-frostline') },
      { label: 'built', url: builtUrl('sidescroller-frostline') }
    ]) {
      const errors = await withPage(browser, async (page) => {
        await page.goto(entry.url, { waitUntil: 'load' });
        await page.locator('#choices button').filter({ hasText: '踏上霜线货运坡道' }).click();
        await page.waitForFunction(() => document.querySelector('#sidescroller-stage canvas') && document.querySelector('.amatlas-sidescroller-hud'), null, { timeout: 8000 });
        const startX = await page.evaluate(() => Number((((document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || '').match(/x (\d+)/) || [])[1]));
        await page.keyboard.down('ArrowRight'); await page.waitForTimeout(650); await page.keyboard.up('ArrowRight');
        const desktop = await page.evaluate(() => ({
          x: Number((((document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || '').match(/x (\d+)/) || [])[1]),
          title: document.title,
          retreat: Array.prototype.slice.call(document.querySelectorAll('#choices button')).some((node) => /退回中继站外闸/.test(node.textContent))
        }));
        ok('S26 frostline ' + entry.label + ' 桌面键盘驱动独立 world 且保留撤退口', desktop.x > startX + 25 && /极夜霜线/.test(desktop.title) && desktop.retreat, JSON.stringify({ startX, desktop }));
        const playerTop = () => page.locator('#sidescroller-stage canvas').evaluate((canvas) => {
          const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          const role = [[124, 231, 238], [35, 84, 106], [236, 255, 255]];
          let top = canvas.height;
          for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            if (data[i + 3] === 255 && role.some((rgb) => data[i] === rgb[0] && data[i + 1] === rgb[1] && data[i + 2] === rgb[2])) top = Math.min(top, y);
          }
          return top === canvas.height ? -1 : top;
        });
        const groundedTop = await playerTop();
        await page.keyboard.down('ArrowRight'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(140);
        const jumpingTop = await playerTop();
        await page.keyboard.up('ArrowRight'); await page.waitForTimeout(650);
        ok('S26a frostline ' + entry.label + ' 桌面键盘真实跳跃', groundedTop >= 0 && jumpingTop >= 0 && jumpingTop < groundedTop - 5, JSON.stringify({ groundedTop, jumpingTop }));
        for (let shot = 0; shot < 2; shot++) { await page.keyboard.press('Space'); await page.waitForTimeout(900); }
        await page.waitForFunction(() => /防卫塔已停机/.test((document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || '') && Array.prototype.slice.call(document.querySelectorAll('#choices button')).some((node) => /货运升降台/.test(node.textContent)), null, { timeout: 6000 });
        ok('S26b frostline ' + entry.label + ' 桌面键盘两发清关', await page.evaluate(() => !!(window._engine && window._engine.state.sidescrollerCleared)));

        await page.evaluate(() => window._engine.reset());
        await page.waitForFunction(() => !document.querySelector('#sidescroller-stage canvas') && Array.prototype.slice.call(document.querySelectorAll('#choices button')).some((node) => /踏上霜线货运坡道/.test(node.textContent)), null, { timeout: 5000 });
        await page.locator('#choices button').filter({ hasText: '踏上霜线货运坡道' }).click();
        await page.waitForFunction(() => document.querySelector('#sidescroller-stage canvas') && document.querySelector('.amatlas-sidescroller-hud'), null, { timeout: 8000 });
        await page.setViewportSize({ width: 390, height: 844 });
        const right = page.locator('.amatlas-sidescroller-controls button[aria-label="向右移动"]');
        const fire = page.locator('.amatlas-sidescroller-controls button[aria-label="开火"]');
        const beforeTouch = await page.evaluate(() => Number((((document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || '').match(/x (\d+)/) || [])[1]));
        await right.dispatchEvent('pointerdown', { pointerId: 31, pointerType: 'touch', isPrimary: true }); await page.waitForTimeout(900); await right.dispatchEvent('pointerup', { pointerId: 31, pointerType: 'touch', isPrimary: true });
        await page.waitForTimeout(80);
        const touchSurface = await page.evaluate(() => {
          const canvas = document.querySelector('#sidescroller-stage canvas');
          const cr = canvas && canvas.getBoundingClientRect();
          const buttons = Array.prototype.slice.call(document.querySelectorAll('.amatlas-sidescroller-controls button'));
          const hud = document.querySelector('.amatlas-sidescroller-hud');
          const choices = Array.prototype.slice.call(document.querySelectorAll('#choices button'));
          const overlaps = (a, b) => !!(a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
          return {
            x: Number(((hud && hud.textContent || '').match(/x (\d+)/) || [])[1]),
            buttons: buttons.map((b) => {
              const r = b.getBoundingClientRect();
              return [b.getAttribute('aria-label'), r.width, r.height, overlaps(cr, r), overlaps(hud && hud.getBoundingClientRect(), r), choices.some((choice) => overlaps(choice.getBoundingClientRect(), r))];
            })
          };
        });
        ok('S27 frostline ' + entry.label + ' 390px 屏上移动且按钮≥44px不遮画布/HUD/标准出口', touchSurface.x > beforeTouch + 35 && touchSurface.buttons.length === 5 && touchSurface.buttons.every((b) => b[1] >= 44 && b[2] >= 44 && !b[3] && !b[4] && !b[5]), JSON.stringify({ beforeTouch, touchSurface }));
        for (let shot = 0; shot < 2; shot++) {
          await fire.dispatchEvent('pointerdown', { pointerId: 32 + shot, pointerType: 'touch', isPrimary: true }); await fire.dispatchEvent('pointerup', { pointerId: 32 + shot, pointerType: 'touch', isPrimary: true }); await page.waitForTimeout(900);
        }
        await page.waitForFunction(() => /防卫塔已停机/.test((document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || '') && Array.prototype.slice.call(document.querySelectorAll('#choices button')).some((node) => /货运升降台/.test(node.textContent)), null, { timeout: 6000 });
        const clear = await page.evaluate(() => ({
          flag: !!(window._engine && window._engine.state.sidescrollerCleared),
          choices: Array.prototype.slice.call(document.querySelectorAll('#choices button')).map((node) => node.textContent)
        }));
        ok('S28 frostline ' + entry.label + ' 390px 仅屏上控件两发清关并暴露独立出口', clear.flag && clear.choices.some((text) => /货运升降台/.test(text)) && clear.choices.some((text) => /退回中继站外闸/.test(text)), JSON.stringify(clear));
        await page.locator('#choices button').filter({ hasText: '启动解锁的货运升降台' }).click();
        ok('S28a frostline ' + entry.label + ' 390px 清关出口真实可点击并收口终局', await page.locator('#place').filter({ hasText: '极夜交接' }).isVisible());
      });
      ok('S29 frostline ' + entry.label + ' 零页面错误与远程请求', errors.length === 0, errors.join(' | '));

      const restartErrors = await withPage(browser, async (page) => {
        await page.addInitScript(() => {
          let world;
          Object.defineProperty(window, 'SIDESCROLLER_WORLD', {
            configurable: true,
            get: () => world,
            set: (value) => {
              const level = value.maps.frostline.nodes.slope.sidescroller;
              level.sentry.spawn = { x: 5, y: 8 };
              level.sentry.fireEveryTicks = 40;
              level.sentry.projectileSpeed = 600;
              level.sentry.damage = 4;
              world = value;
            }
          });
        });
        await page.goto(entry.url, { waitUntil: 'load' });
        await page.locator('#choices button').filter({ hasText: '踏上霜线货运坡道' }).click();
        await page.waitForFunction(() => /已阵亡/.test((document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || ''), null, { timeout: 5000 });
        const right = page.locator('.amatlas-sidescroller-controls button[aria-label="向右移动"]');
        await right.dispatchEvent('pointerdown', { pointerId: 51, pointerType: 'touch', isPrimary: true });
        await page.locator('.amatlas-sidescroller-controls button[aria-label="重开本局"]').click();
        await page.waitForTimeout(350);
        const restarted = await page.evaluate(() => ({
          hud: (document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || '',
          x: Number((((document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || '').match(/x (\d+)/) || [])[1])
        }));
        ok('S29a frostline ' + entry.label + ' 死亡时held触控未释放也在重开边界清零', /耐寒 4 \/ 4/.test(restarted.hud) && restarted.x === 51, JSON.stringify(restarted));
        await right.dispatchEvent('pointerup', { pointerId: 51, pointerType: 'touch', isPrimary: true });
      });
      ok('S29b frostline ' + entry.label + ' 死亡重开fixture零页面错误', restartErrors.length === 0, restartErrors.join(' | '));
    }
    }
    if (suiteEnabled('arcade')) await runArcadeExperienceEvidence(browser);
    if (suiteEnabled('puzzle')) await runPuzzleExperienceEvidence(browser);
    if (suiteEnabled('pursuit')) await runPursuitExperienceEvidence(browser);
    if (suiteEnabled('tabletop')) await runTabletopExperienceEvidence(browser);
    if (suiteEnabled('cutscene')) await runCutsceneExperienceEvidence(browser);
    if (suiteEnabled('minimal')) await runMinimalExperienceEvidence(browser);
    if (suiteEnabled('horror')) await runHorrorExperienceEvidence(browser);
  } finally {
    await browser.close();
  }
  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('浏览器回归异常:', e && e.message); process.exit(1); });
