'use strict';
/* 浏览器门语义：默认可选、发布/E2E required 时缺依赖或启动失败必须非零。 */
var fs = require('fs');
var os = require('os');
var path = require('path');
var spawnSync = require('child_process').spawnSync;
var SCRIPT = path.join(__dirname, 'browser-smoke.cjs');
var pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg); }
}
function run(env) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: Object.assign({}, process.env, env),
    timeout: 30000
  });
}

console.log('── 浏览器 required 模式契约 ──');
var missing = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-browser-missing-'));
try {
  var optional = run({ NODE_PATH: missing, ATLAS_BROWSER_REQUIRED: '0' });
  ok(optional.status === 0 && /跳过浏览器回归:未安装 playwright/.test(optional.stdout),
    'BR1 默认模式缺 Playwright 可跳过且退出 0');

  var required = run({ NODE_PATH: missing, ATLAS_BROWSER_REQUIRED: '1' });
  ok(required.status === 2 && /required 但不可用:未安装 playwright/.test(required.stderr),
    'BR2 required 模式缺 Playwright 必须退出 2');

  var fake = path.join(missing, 'playwright');
  fs.mkdirSync(fake);
  fs.writeFileSync(path.join(fake, 'index.js'), "exports.chromium={launch:async()=>{throw new Error('fixture launch failed')}};\n");
  var launchOptional = run({ NODE_PATH: missing, ATLAS_BROWSER_REQUIRED: '0' });
  ok(launchOptional.status === 0 && /跳过浏览器回归:chromium 启动失败/.test(launchOptional.stdout),
    'BR3 默认模式 Chromium 启动失败仍可跳过');

  var launchRequired = run({ NODE_PATH: missing, ATLAS_BROWSER_REQUIRED: '1' });
  ok(launchRequired.status === 2 && /required 但不可用:chromium 启动失败/.test(launchRequired.stderr),
    'BR4 required 模式 Chromium 启动失败必须退出 2');
} finally {
  fs.rmSync(missing, { recursive: true, force: true });
}
console.log('════ 浏览器 required 模式:' + pass + ' PASS / ' + fail + ' FAIL ════');
process.exit(fail ? 1 : 0);
