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
        ok('S1 showroom 首屏有 14 个 launcher、单 iframe 且尚未装 src', initial.launchers === 14 && initial.frames === 1 && !initial.hasSrc, JSON.stringify(initial));
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
        ok('S3a showroom 表现力入口真实打开 rig/dialogue 展示并渲染首拍', rigOpened && /FK 剪纸角色/.test(rigText), 'opened=' + rigOpened + ', text=' + rigText);
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
        ok('S3b showroom 实验切片入口真实打开 sidescroller 并进入 canvas', sideOpened, 'opened=' + sideOpened);
        await page.click('.demoport-close');
        await page.waitForFunction(() => {
          const port = document.querySelector('.demoport');
          const frame = document.querySelector('.demoport-frame');
          return port && port.hidden && frame && !frame.hasAttribute('src');
        }, null, { timeout: 5000 });
      });
      ok('S4 showroom host/三个真实 iframe 零页面错误', errors.length === 0, errors.join(' | '));
    }

    // ── 场景 1b:rig-showcase built——逐拍验证 typewriter、双角色 rig 与 stage 生命周期 ──
    {
      const url = builtUrl('rig-showcase');
      const errors = await withPage(browser, async (page) => {
        await page.goto(url, { waitUntil: 'load' });
        const next = () => page.locator('#choices > button.choice').filter({ hasText: /^▸$/ });
        const castSnapshot = () => page.evaluate(() => {
          const nodes = Array.prototype.slice.call(document.querySelectorAll('#scene svg [data-amatlas-rig-cast]'));
          return {
            cast: nodes.map((node) => node.getAttribute('data-amatlas-rig-cast')),
            keys: nodes.map((node) => node.getAttribute('data-amatlas-rig-key')),
            parts: document.querySelectorAll('#scene svg [data-amatlas-rig-cast] [data-amatlas-rig-part]').length
          };
        });
        const clickNext = async () => {
          const button = next();
          await button.waitFor({ state: 'visible', timeout: 8000 });
          if (await button.getAttribute('aria-label') === '显示全部文字') {
            await button.click();
            await page.waitForFunction(() => {
              const buttons = Array.prototype.slice.call(document.querySelectorAll('#choices > button.choice'));
              const found = buttons.filter((node) => node.textContent.trim() === '▸')[0];
              return found && found.getAttribute('aria-label') === '继续 / 下一段';
            }, null, { timeout: 3000 });
          }
          await button.click();
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

        await clickNext();
        await page.waitForFunction(() => /扁平岩块落地/.test((document.querySelector('#look') || {}).textContent || ''), null, { timeout: 5000 });
        await clickNext();
        await page.waitForFunction(() => {
          const button = Array.prototype.slice.call(document.querySelectorAll('#choices > button.choice')).filter((node) => node.textContent.trim() === '▸')[0];
          return /打字机逐字/.test((document.querySelector('#look') || {}).textContent || '') && button && button.getAttribute('aria-label') === '显示全部文字';
        }, null, { timeout: 5000 });
        await next().click();
        const revealed = await page.evaluate(() => {
          const button = Array.prototype.slice.call(document.querySelectorAll('#choices > button.choice')).filter((node) => node.textContent.trim() === '▸')[0];
          return {
            text: (document.querySelector('#look') || {}).textContent || '',
            label: button && button.getAttribute('aria-label'),
            cast: document.querySelectorAll('#scene svg [data-amatlas-rig-cast]').length
          };
        });
        ok('S4b typewriter 首次点击只显示全文、不越拍', /停顿也由数据定义/.test(revealed.text) && revealed.label === '继续 / 下一段' && revealed.cast === 0, JSON.stringify(revealed));
        await next().click();

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

        await next().click();
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

    // ── 场景 2b:arcade 正式 goal=5 逻辑门 + 短确定性胜利 probe + 三次真实失败 fail-forward ──
    {
      const url = builtUrl('arcade-demo');
      const errors = await withPage(browser, async (page) => {
        const enterTerminal = async () => {
          await page.locator('#choices button').filter({ hasText: '走向闪烁的终端' }).click();
          await page.locator('#choices button').filter({ hasText: '坐下,开始挑战' }).click();
          await page.waitForFunction(() => document.querySelector('#arcade-stage canvas') && document.querySelector('.amatlas-arcade-hud'), null, { timeout: 8000 });
        };
        await page.goto(url, { waitUntil: 'load' });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'load' });
        const formalGoal = await page.evaluate(() => window._engine.world.maps.m.nodes.terminal.goal);
        ok('S7a arcade built 正式作者数据仍锁 goal=5', formalGoal === 5, 'goal=' + formalGoal);
        await page.evaluate(() => {
          const terminal = window._engine.world.maps.m.nodes.terminal;
          terminal.goal = 1;
          const values = [7 / 12 + 0.001, 6 / 12 + 0.001];
          window._engine.rng = () => values.length ? values.shift() : 0;
        });
        await enterTerminal();
        await page.waitForFunction(() => window._engine.state.snakeWon === true, null, { timeout: 4000 });
        const won = await page.evaluate(() => ({
          won: window._engine.state.snakeWon,
          fails: window._engine.state.snakeFails,
          actions: Array.from(document.querySelectorAll('#choices button')).map((button) => ({ text: button.textContent, disabled: button.disabled }))
        }));
        ok('S7b arcade built 短确定性 probe 吃到一果后只写 snakeWon 并解锁技巧出口', won.won === true && won.fails === 0 && won.actions.some((item) => /推开解锁的门/.test(item.text) && !item.disabled), JSON.stringify(won));

        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'load' });
        await enterTerminal();
        for (let expected = 1; expected <= 3; expected++) {
          await page.waitForFunction((count) => window._engine.state.snakeFails === count, expected, { timeout: 4000 });
          if (expected < 3) await page.keyboard.press('ArrowUp');
        }
        await page.waitForFunction(() => !document.querySelector('#arcade-stage canvas'), null, { timeout: 3000 });
        const failed = await page.evaluate(() => ({
          won: window._engine.state.snakeWon,
          fails: window._engine.state.snakeFails,
          actions: Array.from(document.querySelectorAll('#choices button')).map((button) => ({ text: button.textContent, disabled: button.disabled }))
        }));
        ok('S7c arcade built 三次真实死亡精确累加 snakeFails=3，锁技巧门并解锁 fail-forward', failed.won === false && failed.fails === 3 &&
          failed.actions.some((item) => /推开解锁的门/.test(item.text) && item.disabled) &&
          failed.actions.some((item) => /撬开控制面板/.test(item.text) && !item.disabled), JSON.stringify(failed));
      });
      ok('S7d arcade built 短胜利 probe/fail-forward 全旅程零页面错误与远程请求', errors.length === 0, errors.join(' | '));
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

    // ── 场景 4:FPS 玩家直达页——ready 等待→获得 scatter→聚合命中→切 precision 防绕锁收尾→D；阵亡→一键重试 fresh ──
    {
      const url = builtUrl('maze3d', 'fps.html');
      const errors = await withPage(browser, async (page) => {
        await page.goto(url, { waitUntil: 'load' });
        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => document.querySelector('#maze3d-stage canvas') && document.querySelector('button[aria-label="开火"]'), null, { timeout: 8000 });
        const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(100); };
        const initialHint = await page.locator('#maze3d-stage .amatlas-maze-hint').innerText();
        await page.waitForTimeout(5200);
        const waitingHint = await page.locator('#maze3d-stage .amatlas-maze-hint').innerText();
        ok('S10 FPS built 直达入口未 ready 长等待仍保持 fresh/静止', /待命/.test(initialHint) && /生命 60\/60/.test(waitingHint) && /精确手枪 弹药 2\/6/.test(waitingHint) && /装甲目标 1/.test(waitingHint) && !/攻击预兆|受伤|阵亡/.test(waitingHint), initialHint + ' → ' + waitingHint);
        if (!/待命/.test(initialHint) || !/生命 60\/60/.test(waitingHint)) throw new Error('FPS built ready gate 未锁住初始等待:' + initialHint + ' → ' + waitingHint);
        await hold('w', 500);
        const pickupHint = await page.locator('#maze3d-stage .amatlas-maze-hint').innerText();
        ok('S11 FPS built 公开移动获得 scatter 并自动装备', /近程霰弹枪 弹药 1\/4/.test(pickupHint) && /获得近程霰弹枪/.test(pickupHint), initialHint + ' → ' + pickupHint);
        if (!/近程霰弹枪 弹药 1\/4/.test(pickupHint) || !/获得近程霰弹枪/.test(pickupHint)) throw new Error('FPS built 正向闭环未真实触发 scatter weapon pickup:' + pickupHint);
        const fireButton = page.locator('button[aria-label="开火"]');
        await fireButton.click();
        await page.waitForTimeout(120);
        const firstShotHint = await page.locator('#maze3d-stage .amatlas-maze-hint').innerText();
        ok('S12 FPS built scatter 一枪只耗一发并聚合命中装甲目标', /近程霰弹枪 弹药 0\/4/.test(firstShotHint) && /装甲目标 1/.test(firstShotHint) && /命中/.test(firstShotHint), firstShotHint);
        if (!/近程霰弹枪 弹药 0\/4/.test(firstShotHint) || !/装甲目标 1/.test(firstShotHint)) throw new Error('FPS built scatter 第一枪未进入公开命中状态:' + firstShotHint);
        await fireButton.click();
        await page.waitForTimeout(80);
        const cooldownHint = await page.locator('#maze3d-stage .amatlas-maze-hint').innerText();
        ok('S13 FPS built scatter cooldown press 不耗弹且显示确定性回执', /近程霰弹枪 弹药 0\/4/.test(cooldownHint) && /装甲目标 1/.test(cooldownHint) && /近程霰弹枪回稳中/.test(cooldownHint), cooldownHint);
        if (!/近程霰弹枪回稳中/.test(cooldownHint) || !/近程霰弹枪 弹药 0\/4/.test(cooldownHint)) throw new Error('FPS built scatter cooldown press 未给公开回执或错误耗弹:' + cooldownHint);
        await page.keyboard.press('1');
        await fireButton.click();
        await page.waitForTimeout(80);
        const crossLockHint = await page.locator('#maze3d-stage .amatlas-maze-hint').innerText();
        ok('S13a FPS built 切 precision 后立即 press 仍被全局 scatter lock 丢弃', /精确手枪 弹药 2\/6/.test(crossLockHint) && /精确手枪回稳中/.test(crossLockHint) && /装甲目标 1/.test(crossLockHint), crossLockHint);
        await page.waitForTimeout(700);
        await fireButton.click();
        await page.waitForTimeout(180);
        const killedHint = await page.locator('#maze3d-stage .amatlas-maze-hint').innerText();
        ok('S14 FPS built 回稳后 precision 新 press 击倒最后装甲目标', /精确手枪 弹药 1\/6/.test(killedHint) && /装甲目标 0/.test(killedHint) && /装甲目标.*已击倒/.test(killedHint), killedHint);
        if (!/装甲目标 0/.test(killedHint)) throw new Error('FPS built precision 收尾未清场:' + killedHint);
        await page.waitForTimeout(400);
        const beforeDoor = await page.evaluate(() => ({
          canvas: !!document.querySelector('#maze3d-stage canvas'),
          exitEnabled: Array.prototype.slice.call(document.querySelectorAll('#choices button')).some((b) => /活着离开生存场/.test(b.textContent) && !b.disabled)
        }));
        if (!beforeDoor.canvas || beforeDoor.exitEnabled) throw new Error('FPS built 清场后未到 D 就提前通关:' + JSON.stringify(beforeDoor));
        await hold('w', 4300);
        await page.waitForFunction(() => {
          const exit = Array.prototype.slice.call(document.querySelectorAll('#choices button')).filter((b) => /活着离开生存场/.test(b.textContent))[0];
          return !!(exit && !exit.disabled);
        }, null, { timeout: 6000 });
        const opened = await page.evaluate(() => {
          const exit = Array.prototype.slice.call(document.querySelectorAll('#choices button')).filter((b) => /活着离开生存场/.test(b.textContent))[0];
          return { exitEnabled: !!(exit && !exit.disabled), canvasStopped: !document.querySelector('#maze3d-stage canvas') };
        });
        ok('S15 FPS built scatter+precision 清场后同一 D 解锁并收口 maze session', beforeDoor.canvas && !beforeDoor.exitEnabled && opened.exitEnabled && opened.canvasStopped && /装甲目标 0/.test(killedHint), JSON.stringify({ beforeDoor, opened }));
        const exitButton = page.locator('#choices button').filter({ hasText: '活着离开生存场' });
        await exitButton.click();
        await page.waitForFunction(() => /FPS Phase 2a · 生存场脱离/.test((document.querySelector('#place') || {}).textContent || ''), null, { timeout: 5000 });
        ok('S16 FPS built 正向清场链完成通关页', true);

        await page.evaluate(() => localStorage.clear());
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => document.querySelector('#maze3d-stage canvas') && document.querySelector('button[aria-label="开火"]'), null, { timeout: 8000 });
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('Space');   // v3 guard sight=0：先用确定性枪声进入 hear/chase，再原地等待阵亡。
        await page.waitForFunction(() => {
          const hint = document.querySelector('#maze3d-stage .amatlas-maze-hint');
          return hint && /阵亡/.test(hint.textContent);
        }, null, { timeout: 15000 });
        const deathActions = await page.evaluate(() => Array.prototype.slice.call(document.querySelectorAll('#choices button')).map((b) => ({ text: b.textContent, disabled: b.disabled })));
        const oneClickRetry = page.locator('#choices button').filter({ hasText: '一键重试' });
        ok('S17 FPS built 阵亡后当前节点直接出现一键重试并保留可选结果页', deathActions.some((x) => /一键重试/.test(x.text) && !x.disabled) && deathActions.some((x) => /查看阵亡结果/.test(x.text) && !x.disabled), JSON.stringify(deathActions));
        await oneClickRetry.click();
        await page.waitForFunction(() => {
          const hint = document.querySelector('#maze3d-stage .amatlas-maze-hint');
          return document.querySelector('#maze3d-stage canvas') && hint && /待命/.test(hint.textContent) && /生命 60\/60/.test(hint.textContent) && /精确手枪 弹药 2\/6/.test(hint.textContent) && /装甲目标 1/.test(hint.textContent);
        }, null, { timeout: 8000 });
        const retryFresh = await page.locator('#maze3d-stage .amatlas-maze-hint').innerText();
        ok('S18 FPS built 一键重试重建 precision 2/6、未拥有 scatter、1 guard/3 pickups', /待命/.test(retryFresh) && /生命 60\/60/.test(retryFresh) && /精确手枪 弹药 2\/6/.test(retryFresh) && /装甲目标 1/.test(retryFresh) && /Recipe 5/.test(await page.locator('#place').innerText()), retryFresh);
      });
      ok('S19 FPS 玩家直达 built 胜负/重试全路径零页面错误', errors.length === 0, errors.join(' | '));
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
        const nativeNext = () => page.locator('#choices button.cutscene-next');
        const startSeaDialogue = async () => {
          await page.evaluate(() => { localStorage.clear(); localStorage.setItem('__origin_browser_start', 'loom'); });
          await page.reload({ waitUntil: 'load' });
          await page.locator('#choices button').filter({ hasText: '写入一片会记住月亮的海' }).click();
          await page.waitForFunction(() => document.querySelector('[data-amatlas-motion-layer="seed"]') && document.querySelector('#choices button.cutscene-next'), null, { timeout: 8000 });
        };
        const completeAndAdvance = async () => {
          const next = nativeNext();
          await next.waitFor({ state: 'visible', timeout: 8000 });
          if (await next.getAttribute('aria-label') === '显示全部文字') await next.click();
          const stillNext = nativeNext();
          if (await stillNext.count()) await stillNext.click();
        };
        const safeLayout = async () => page.evaluate(() => {
          const button = document.querySelector('#choices button.cutscene-next');
          const look = document.querySelector('#look');
          const lines = Array.from(document.querySelectorAll('#look > .line'));
          if (!button || !look) return null;
          const b = button.getBoundingClientRect();
          const l = look.getBoundingClientRect();
          const last = lines.length ? lines[lines.length - 1].getBoundingClientRect() : null;
          const overlap = lines.some((line) => {
            const r = line.getBoundingClientRect();
            return Math.max(0, Math.min(b.right, r.right) - Math.max(b.left, r.left)) * Math.max(0, Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top)) > 0;
          });
          return {
            x: b.x, y: b.y, w: b.width, h: b.height,
            vw: innerWidth, vh: innerHeight, overlap,
            paddingBlockEnd: parseFloat(getComputedStyle(look).paddingBlockEnd) || 0,
            trailingGap: last ? l.bottom - last.bottom : 0
          };
        });
        const toastNextLayout = async () => page.evaluate(() => {
          const button = document.querySelector('#choices button.cutscene-next');
          const stack = document.querySelector('.amatlas-toast-stack');
          if (!button || !stack) return null;
          const b = button.getBoundingClientRect();
          const t = stack.getBoundingClientRect();
          const overlap = Math.max(0, Math.min(b.right, t.right) - Math.max(b.left, t.left)) * Math.max(0, Math.min(b.bottom, t.bottom) - Math.max(b.top, t.top));
          const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return {
            button: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
            toast: { left: t.left, top: t.top, right: t.right, bottom: t.bottom },
            overlap,
            centerHitsNext: hit === button || button.contains(hit)
          };
        });
        const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(100); };

        await page.goto(url, { waitUntil: 'load' });
        await startSeaDialogue();
        const firstKey = await page.locator('[data-amatlas-motion-key]').getAttribute('data-amatlas-motion-key');
        await page.locator('#look').click();
        const afterFirstPanelClick = await page.evaluate(() => ({
          key: document.querySelector('[data-amatlas-motion-key]') && document.querySelector('[data-amatlas-motion-key]').getAttribute('data-amatlas-motion-key'),
          label: document.querySelector('#choices button.cutscene-next') && document.querySelector('#choices button.cutscene-next').getAttribute('aria-label')
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
        await nativeNext().focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => document.querySelector('[data-amatlas-rig-cast="cartographer"]'), null, { timeout: 5000 });
        await page.waitForTimeout(250);
        const entering = Number(await page.locator('[data-amatlas-rig-cast="cartographer"]').getAttribute('opacity'));
        ok('S19c Origin native button 键盘推进到 cartographer enter 的真实中间帧', entering > 0 && entering < 1, 'opacity=' + entering);

        await startSeaDialogue();
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        const keyboardKey0 = await page.locator('[data-amatlas-motion-key]').getAttribute('data-amatlas-motion-key');
        await nativeNext().focus();
        await page.keyboard.press('Enter');
        const afterKeyboardReveal = await page.evaluate(() => ({
          key: document.querySelector('[data-amatlas-motion-key]').getAttribute('data-amatlas-motion-key'),
          label: document.querySelector('#choices button.cutscene-next').getAttribute('aria-label'),
          focused: document.activeElement === document.querySelector('#choices button.cutscene-next')
        }));
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => /#1$/.test(document.querySelector('[data-amatlas-rig-key]').getAttribute('data-amatlas-rig-key')), null, { timeout: 5000 });
        const focusedAfterRebuild = await page.evaluate(() => document.activeElement === document.querySelector('#choices button.cutscene-next'));
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);
        const keyboardKey2 = await page.locator('[data-amatlas-rig-key]').getAttribute('data-amatlas-rig-key');
        ok('S19c1 Origin 连续键盘推进保持 native next 焦点并可第三次 Enter 换拍', afterKeyboardReveal.key === keyboardKey0 && afterKeyboardReveal.label === '继续 / 下一段' && afterKeyboardReveal.focused && focusedAfterRebuild && /#2$/.test(keyboardKey2), JSON.stringify({ afterKeyboardReveal, focusedAfterRebuild, keyboardKey2 }));

        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await startSeaDialogue();
        await nativeNext().click();
        await nativeNext().click();
        await page.waitForFunction(() => document.querySelector('[data-amatlas-rig-key$="#1"]'), null, { timeout: 5000 });

        for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
          await page.setViewportSize(viewport);
          const layout = await safeLayout();
          ok('S19d Origin fixed next 在 ' + viewport.width + 'x' + viewport.height + ' 安全区内、不压字幕且正文无预留空尾', !!layout && layout.w >= 44 && layout.h >= 44 && layout.x >= 0 && layout.y >= 0 && layout.x + layout.w <= layout.vw && layout.y + layout.h <= layout.vh && !layout.overlap && layout.paddingBlockEnd < 16 && layout.trailingGap < 24, JSON.stringify(layout));
        }
        await page.setViewportSize({ width: 900, height: 700 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await startSeaDialogue();
        await nativeNext().click();   // reduced-motion: #0 直接进 #1。
        await nativeNext().click();   // #1 直接进 speaker #2，不受前一段自然计时漂移影响。
        await page.waitForFunction(() => {
          const beat = document.querySelector('[data-amatlas-rig-key$="#2"]');
          const next = document.querySelector('#choices button.cutscene-next');
          return beat && next && next.getAttribute('aria-label') === '继续 / 下一段';
        }, null, { timeout: 8000 });
        const speaking = await page.evaluate(() => ({
          cast: !!document.querySelector('[data-amatlas-rig-cast="cartographer"]'),
          mouth: !!document.querySelector('[data-amatlas-rig-part="mouth"] [data-amatlas-rig-state="A"]'),
          text: (document.querySelector('#look') || {}).textContent || ''
        }));
        ok('S19e reduced-motion 下 speaker/typewriter 立即完整且 mouth A/O 资产存在', speaking.cast && speaking.mouth && /像海记住月亮/.test(speaking.text), JSON.stringify(speaking));

        await startSeaDialogue();
        await nativeNext().click();
        await nativeNext().click();
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await completeAndAdvance();   // 从 #2 进入自然播放的 exit #3。
        await page.waitForFunction(() => document.querySelector('[data-amatlas-rig-key$="#3"]'), null, { timeout: 8000 });
        await page.waitForTimeout(2050);
        const exitOpacity = Number(await page.locator('[data-amatlas-rig-cast="cartographer"]').getAttribute('opacity'));
        ok('S19f Origin cartographer exit 尾窗出现真实中间态且 fracture motion 同拍存在', exitOpacity > 0 && exitOpacity < 1 && await page.locator('[data-amatlas-motion-layer="fracture"]').count() === 1, 'opacity=' + exitOpacity);
        await completeAndAdvance();
        if (await nativeNext().count()) await nativeNext().click();
        await page.locator('#choices button').filter({ hasText: '握住第一条规律' }).click();
        await page.waitForFunction(() => document.querySelector('#maze3d-stage canvas') && document.querySelector('button[aria-label="定序"]'), null, { timeout: 8000 });
        const originThemeCopy = await page.evaluate(() => {
          const stage = document.querySelector('#maze3d-stage');
          return stage ? stage.textContent + ' | ' + Array.from(stage.querySelectorAll('button')).map((button) => [button.textContent, button.getAttribute('aria-label'), button.title].join(' ')).join(' | ') : '';
        });
        ok('S19f1 Origin trial 公开 HUD/按钮只读成承载/星图刻针/星砂/未定项/定序', /承载/.test(originThemeCopy) && /星图刻针/.test(originThemeCopy) && /星砂/.test(originThemeCopy) && /未定项/.test(originThemeCopy) && /定序/.test(originThemeCopy) && !/精确武器|散射武器|手枪|骷髅|守卫|敌人|开火/.test(originThemeCopy), originThemeCopy);
        await hold('w', 500);
        const fire = page.locator('button[aria-label="定序"]');
        await fire.click(); await page.waitForTimeout(120);
        await page.keyboard.press('1'); await fire.click(); await page.waitForTimeout(700);
        await fire.click(); await page.waitForTimeout(450);
        await hold('w', 4300);
        await page.waitForFunction(() => Array.from(document.querySelectorAll('#choices button')).some((button) => /护送第一条规律/.test(button.textContent) && !button.disabled), null, { timeout: 6000 });
        await page.locator('#choices button').filter({ hasText: '护送第一条规律' }).click();
        await page.waitForFunction(() => document.querySelector('[data-amatlas-motion-layer="new_world"]'), null, { timeout: 8000 });
        ok('S19g Origin scatter 聚合命中→precision 防绕锁收尾→D 后只经 win link 进入带 motion 的既有终章', await page.evaluate(() => window._engine.state.firstWorldTrialWon === true && window._engine.state.firstWorldTrialDeath === false));
        await page.waitForFunction(() => document.querySelector('.amatlas-toast-stack .amatlas-achievement') && document.querySelector('#choices button.cutscene-next'), null, { timeout: 3000 });
        for (const viewport of [{ width: 390, height: 844 }, { width: 900, height: 700 }]) {
          await page.setViewportSize(viewport);
          const toastLayout = await toastNextLayout();
          ok('S19g1 Origin 成就 toast 在 ' + viewport.width + 'x' + viewport.height + ' 上移且 next 中心可命中', !!toastLayout && toastLayout.overlap === 0 && toastLayout.centerHitsNext, JSON.stringify(toastLayout));
        }

        await page.evaluate(() => { localStorage.clear(); localStorage.setItem('__origin_browser_start', 'first_world_trial'); });
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => document.querySelector('#maze3d-stage canvas'), null, { timeout: 8000 });
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('Space');   // sight=0 的未定项由定序声唤醒，随后等待阵亡。
        await page.waitForFunction(() => window._engine.state.firstWorldTrialDeath === true, null, { timeout: 15000 });
        await page.locator('#choices button').filter({ hasText: '一键重试第一场噪声' }).click();
        await page.waitForFunction(() => {
          const hint = document.querySelector('#maze3d-stage .amatlas-maze-hint');
          return hint && /待命/.test(hint.textContent) && /承载 60\/60/.test(hint.textContent) && /星图刻针 星砂 2\/6/.test(hint.textContent) && /未定项 1/.test(hint.textContent);
        }, null, { timeout: 8000 });
        ok('S19h Origin trial 同节点重试双端清键并重建 fresh session', await page.evaluate(() => window._engine.state.firstWorldTrialWon === false && window._engine.state.firstWorldTrialDeath === false));
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('Space');   // sight=0 的未定项由定序声唤醒，随后等待阵亡。
        await page.waitForFunction(() => window._engine.state.firstWorldTrialDeath === true, null, { timeout: 15000 });
        await page.locator('#choices button').filter({ hasText: '听制图者解释' }).click();
        await page.locator('#choices button').filter({ hasText: '重新护送第一条规律' }).click();
        await page.waitForFunction(() => {
          const hint = document.querySelector('#maze3d-stage .amatlas-maze-hint');
          return hint && /待命/.test(hint.textContent) && /承载 60\/60/.test(hint.textContent) && /星图刻针 星砂 2\/6/.test(hint.textContent) && /未定项 1/.test(hint.textContent);
        }, null, { timeout: 8000 });
        ok('S19i Origin fall 结果页重试同样双端清键并重建 fresh session', await page.evaluate(() => window._engine.state.firstWorldTrialWon === false && window._engine.state.firstWorldTrialDeath === false));
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

    // ── 场景 6:sidescroller 子步 A——built 跑、跳、卷屏与 coarse 控件 ──
    {
      const url = builtUrl('sidescroller');
      const errors = await withPage(browser, async (page) => {
        await page.goto(url, { waitUntil: 'load' });
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
        ok('S22 sidescroller built 键盘真实驱动跑、跳与卷屏，撤离出口始终存在', after > before + 30 && surface.canvas.join(',') === '320,180' && surface.choices.some((text) => /撤离试验段/.test(text)), JSON.stringify({ before, after, surface }));
        ok('S23 sidescroller built 屏上控件 ≥44px 且不遮 canvas', surface.buttons.length === 5 && surface.buttons.every((item) => item[1] >= 44 && item[2] >= 44) && !surface.overlaps, JSON.stringify(surface));
        await page.waitForTimeout(1500);
        for (let shot = 0; shot < 3; shot++) {
          await page.keyboard.press('Space');
          await page.waitForTimeout(850);
        }
        await page.waitForFunction(() => /哨戒炮已摧毁/.test((document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || '') && Array.prototype.slice.call(document.querySelectorAll('#choices button')).some((node) => /穿过解除封锁/.test(node.textContent)), null, { timeout: 5000 });
        const cleared = await page.evaluate(() => ({
          hud: (document.querySelector('.amatlas-sidescroller-hud') || {}).textContent || '',
          choices: Array.prototype.slice.call(document.querySelectorAll('#choices button')).map((node) => node.textContent),
          flag: !!(window._engine && window._engine.state.sidescrollerCleared)
        }));
        ok('S24 sidescroller built 三枪击毁固定哨戒炮后单写 clear 并暴露标准出口', cleared.flag && /解除封锁/.test(cleared.hud) && cleared.choices.some((text) => /穿过解除封锁/.test(text)) && cleared.choices.some((text) => /撤离试验段/.test(text)), JSON.stringify(cleared));
      });
      ok('S25 sidescroller built 路径零页面错误', errors.length === 0, errors.join(' | '));
    }
  } finally {
    await browser.close();
  }
  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('浏览器回归异常:', e && e.message); process.exit(1); });
