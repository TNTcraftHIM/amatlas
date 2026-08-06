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
var smokeSource = fs.readFileSync(SCRIPT, 'utf8');
function helperSource(name, nextName) {
  var start = smokeSource.indexOf('async function ' + name + '(');
  var end = smokeSource.indexOf('\nasync function ' + nextName + '(', start);
  return start >= 0 && end > start ? smokeSource.slice(start, end) : '';
}
function compactSource(source) {
  return source.replace(/\s+/g, '');
}
var cutsceneStart = smokeSource.indexOf('async function cutsceneSnapshot');
var cutsceneEnd = smokeSource.indexOf('\n(async () =>', cutsceneStart);
var cutsceneHelper = cutsceneStart >= 0 && cutsceneEnd > cutsceneStart ? smokeSource.slice(cutsceneStart, cutsceneEnd) : '';
ok(cutsceneHelper && cutsceneHelper.indexOf('_engine') < 0 && !/Timeline\.playback\.inspect\s*\(/.test(cutsceneHelper),
  'BR0 Cutscene focused helper 必须保持 _engine / Timeline.playback.inspect 私探针为0');
var minimalStart = smokeSource.indexOf('async function minimalSnapshot');
var minimalEnd = smokeSource.indexOf('\nasync function cutsceneSnapshot', minimalStart);
var minimalHelper = minimalStart >= 0 && minimalEnd > minimalStart ? smokeSource.slice(minimalStart, minimalEnd) : '';
ok(minimalHelper && minimalHelper.indexOf('_engine') < 0,
  'BR0b Minimal focused helper 必须保持 _engine 私探针为0');
var horrorStart = smokeSource.indexOf('async function horrorSnapshot');
var horrorEnd = smokeSource.indexOf('\nasync function minimalSnapshot', horrorStart);
var horrorHelper = horrorStart >= 0 && horrorEnd > horrorStart ? smokeSource.slice(horrorStart, horrorEnd) : '';
ok(horrorHelper && horrorHelper.indexOf('_engine') < 0,
  'BR0c Horror focused helper 必须保持 _engine 私探针为0');
// Arcade 虚拟时钟必须在安装时直接固定；旧版先实跑、reload 后拿 Date.now()
// 二次 pause，会在 default 全套负载下竞态成 “fast-forward to the past”。
var installClockHelper = helperSource('installArcadeClock', 'pauseArcadeClock');
var pauseClockHelper = helperSource('pauseArcadeClock', 'arcadeEnter');
ok(/ARCADE_CLOCK_START\s*=\s*0/.test(smokeSource) &&
   /ARCADE_CLOCK_PAUSE\s*=\s*60\s*\*\s*60\s*\*\s*1000/.test(smokeSource) &&
   /page\.clock\.install\(\{\s*time:\s*ARCADE_CLOCK_START\s*\}\)/.test(installClockHelper) &&
   /page\.clock\.pauseAt\(ARCADE_CLOCK_PAUSE\)/.test(pauseClockHelper) &&
   pauseClockHelper.indexOf('Date.now') < 0,
  'BR0d Arcade helper 必须从固定 epoch 到固定未来锚点，不得二次暂停实跑墙钟快照');
var simulatedHelper = compactSource(helperSource('waitSimulated', 'holdKeysSimulated'));
var holdKeysHelper = compactSource(helperSource('holdKeysSimulated', 'holdKey'));
var holdKeyHelper = compactSource(helperSource('holdKey', 'holdUntil'));
var holdUntilHelper = compactSource(helperSource('holdUntil', 'holdUntilText'));
var tryHoldHelper = compactSource(helperSource('tryHoldUntilText', 'quarterTurn'));
var pursuitHoldHelper = compactSource(helperSource('pursuitHoldKey', 'pursuitQuarterTurn'));
var pointerHoldHelper = compactSource(helperSource('holdPointer', 'holdPointerUntil'));
var pointerUntilHelper = compactSource(helperSource('holdPointerUntil', 'pursuitMobileMazeLayout'));
ok(simulatedHelper.indexOf('Math.min(50,Math.max(0,timestamp-previous))') >= 0 &&
   simulatedHelper.indexOf('requestAnimationFrame(frame)') >= 0 &&
   holdKeysHelper.indexOf('try{awaitwaitSimulated(page,ms);}') >= 0 &&
   holdKeysHelper.indexOf('awaitpage.waitForTimeout(settle==null?120:settle);') >= 0 &&
   holdKeyHelper.indexOf('awaitholdKeysSimulated(page,[key],ms,settle);') >= 0 &&
   pursuitHoldHelper.indexOf('awaitholdKeysSimulated(page,[key],simulationMs,settle);') >= 0 &&
   pointerHoldHelper.indexOf('try{awaitwaitSimulated(page,simulationMs);}') >= 0 &&
   pointerHoldHelper.indexOf('awaitpage.waitForTimeout(settle==null?120:settle);') >= 0 &&
   holdUntilHelper.indexOf('awaitpage.waitForTimeout(settle==null?120:settle);') >= 0 &&
   tryHoldHelper.indexOf('awaitpage.waitForTimeout(120);') >= 0 &&
   pointerUntilHelper.indexOf('awaitpage.waitForTimeout(settle==null?120:settle);') >= 0 &&
   smokeSource.indexOf("const hold = async (key, ms)") < 0 &&
   smokeSource.indexOf("const holdKeys = async (keys, ms)") < 0 &&
   smokeSource.indexOf("await hold('") < 0 && smokeSource.indexOf('await holdKeys(') < 0,
  'BR0e Maze持续输入必须统一委托rAF模拟时间；释放后的UI settle保留墙钟等待且不得有局部hold旁路');
var missing = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-browser-missing-'));
try {
  var modes = [
    ['Puzzle', 'ATLAS_BROWSER_PUZZLE_ONLY'],
    ['Pursuit', 'ATLAS_BROWSER_PURSUIT_ONLY'],
    ['Arcade', 'ATLAS_BROWSER_ARCADE_ONLY'],
    ['Tabletop', 'ATLAS_BROWSER_TABLETOP_ONLY'],
    ['Cutscene', 'ATLAS_BROWSER_CUTSCENE_ONLY'],
    ['Minimal', 'ATLAS_BROWSER_MINIMAL_ONLY'],
    ['Horror', 'ATLAS_BROWSER_HORROR_ONLY']
  ];
  var conflicts = [];
  for (var mask = 1; mask < (1 << modes.length); mask++) {
    var picked = modes.filter(function (_, i) { return !!(mask & (1 << i)); });
    if (picked.length < 2) continue;
    var env = {}, names = [], pattern = [];
    picked.forEach(function (mode) { names.push(mode[0]); env[mode[1]] = '1'; pattern.push(mode[1].replace('ATLAS_BROWSER_', '')); });
    conflicts.push([names.join('/'), env, new RegExp(pattern.join('.*'))]);
  }
  conflicts.forEach(function (entry) {
    var conflict = run(Object.assign({ NODE_PATH: missing, ATLAS_BROWSER_REQUIRED: '1' }, entry[1]));
    ok(conflict.status === 2 && /focused 模式冲突/.test(conflict.stderr) && entry[2].test(conflict.stderr) && !/未安装 playwright/.test(conflict.stderr),
      'BR0 ' + entry[0] + ' focused 同开必须在加载 Playwright 前明确退出 2');
  });
  ok(conflicts.length === 120, 'BR0a 七个 focused 标志完整覆盖全部120个大小≥2冲突子集');

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
