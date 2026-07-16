/* ════════════════════════════════════════════════════════════════════════
   Amatlas 测试一键 runner —— 提交进库,干净环境直接可跑(纯 node、零依赖)。
   ════════════════════════════════════════════════════════════════════════
   逐个 spawn 各纯 node 断言测试(每个自带 process.exit(fail?1:0)),按退出码汇总。
   **默认静默成功**:成功不逐条刷屏,只在失败时回放该测完整输出 + 末尾汇总
   (对标 prior-art/harness 实证——通过测试刷屏会淹没上下文、诱发幻觉;见 docs/improvements-from-prior-art.md C)。
   用法:  node test/run.cjs
   退出码:全绿 0;任一失败 1(可接发布前自检 / CI)。

   测试就近放在它校验的那一层(核心测试随核心、模块测试随模块)——契合
   "通用 vs 专属" 纪律,也让每个模块自带验证、可独立插拔。新增模块时在下方登记其测试。

   jsdom 游戏 smoke(完整 HTML 呈现旅程)不在本 runner 内 —— 跑法仍是
   `node pipeline/build/build.mjs <game/index.html> --smoke`。runner 只在当前环境能 resolve jsdom 时
   加入 smoke-harness 自身的 3 条错误通道单测；未装则跳过，保持发布包 zero-dep 可运行。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
var childProcess = require('child_process');
var spawn = childProcess.spawn;
var spawnSync = childProcess.spawnSync;
var path = require('path');

var ROOT = path.join(__dirname, '..');   // engine/
var HAS_JSDOM = false;
try { require.resolve('jsdom'); HAS_JSDOM = true; } catch (e) {}
var TEST_TIMEOUT_MS = Number(process.env.ATLAS_TEST_TIMEOUT_MS || 120000);
if (!Number.isFinite(TEST_TIMEOUT_MS) || TEST_TIMEOUT_MS <= 0) TEST_TIMEOUT_MS = 120000;
var TESTS = [
  ['core/runtime',            'core/test/core-runtime.test.cjs'],
  ['core/plugin+presenter',   'core/test/plugin.test.cjs'],
  ['core/tooling/graph-audit','core/tooling/test/graph-audit.test.cjs'],
  ['core/tooling/assembly-probe','core/tooling/test/assembly-probe.test.cjs'],
  ['core/tooling/static-lint', 'core/tooling/test/static-lint.test.cjs'],
  ['core/tooling/art-spec-preview', 'core/tooling/test/art-spec-preview.test.cjs'],
  ['core/tooling/package-audit-command', 'core/tooling/test/package-audit-command.test.cjs'],
  ['core/tooling/codex-parity', 'core/tooling/test/codex-parity.test.cjs'],
  ['engine/session-start',     '.claude/hooks/test/session-start.test.cjs'],
  ['engine/test-runner-timeout','test/run-timeout.test.cjs'],
  ['engine/browser-required',  'test/browser/browser-required.test.cjs'],

  ...(HAS_JSDOM ? [['core/tooling/smoke-harness', 'core/tooling/test/smoke-harness.test.cjs']] : []),
  ['text-adventure/renderer', 'modules/text-adventure/test/renderer.test.cjs'],
  ['text-adventure/demo',     'modules/text-adventure/test/demo.test.cjs'],
  ['tabletop/module',         'modules/tabletop/test/tabletop.test.cjs'],
  ['minimal/module',          'modules/minimal/test/minimal.test.cjs'],
  ['crawler/module',          'modules/crawler/test/crawler.test.cjs'],
  ['presenters/corridor',     'presenters/test/present-corridor.test.cjs'],
  ['presenters/svg',          'presenters/test/present-svg.test.cjs'],
  ['presenters/midi-music',   'presenters/test/midi-music.test.cjs'],
  ['presenters/dom',          'presenters/test/present-dom.test.cjs'],
  ['presenters/dice3d',       'presenters/test/present-dice3d.test.cjs'],
  ['presenters/audio',        'presenters/test/present-audio.test.cjs'],
  ['presenters/compose-music','presenters/test/compose-music.test.cjs'],
  ['plugins/save+map+achiev', 'plugins/test/plugins.test.cjs'],
  ['pipeline/build',          'pipeline/build/test/build.test.cjs'],
  ['preset/boot',             'preset/test/boot.test.cjs'],
  ['examples/showroom',       'examples/showroom/test/showroom.test.cjs'],
  ['examples/arcade-runtime', 'examples/arcade-demo/test/snake-module.test.cjs'],   // 自定义 canvas/rAF runtime:锁 coarse/mobile 输入、本局重开与离场清理
  ['examples/maze3d-runtime', 'examples/maze3d/test/raycast-maze.test.cjs'],   // arcade「孤岛」运行时(canvas+rAF):静态闸看不进 → 生命周期/音频/TTS/怪物/钥匙/外观回归
  ['cutscene/module',         'modules/cutscene/test/cutscene.test.cjs']       // 过场模块(C1):beats 解析 fail-loud / rAF 推进 / 跳过一致性 / scene 继承 / 账本 / 引擎集成
];
if (process.env.ATLAS_TEST_RUNNER_TEST_FILE) {
  TESTS = [['runner-self-test', path.resolve(process.env.ATLAS_TEST_RUNNER_TEST_FILE)]];
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    // 超时时直接子进程必然仍存活(是它挂住才触发超时)→ 其 ParentProcessId 树(含尚未被重定父的
    // detached 后代)此刻完整可枚举。taskkill /t /f 是原生工具、约 0.5s 完成,比 PowerShell +
    // Get-CimInstance(WMI 冷查询,满载常 >1.5s)快一倍——稳稳赶在 detached 后代的自毁/写盘死线前
    // 杀灭整棵树。旧版把慢 WMI walk 放主路径,满载时越过后代死线 → run-timeout A4 间歇失败(lessons 161);
    // 且 PowerShell-first 并不更安全:真被重定父的孤儿其 ParentProcessId 已失效,两条路径都按 ParentProcessId
    // 走、同样抓不到(彻底可靠需 Job Object=原生依赖,零依赖约束下不做)。故:taskkill 主、PowerShell 兜底。
    var killed = spawnSync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    if (killed.error || killed.status !== 0) {
      var script = '$root=' + String(pid) + ';$all=@();function Walk($p){$kids=Get-CimInstance Win32_Process -Filter "ParentProcessId=$p" -ErrorAction SilentlyContinue;foreach($k in $kids){Walk $k.ProcessId;$script:all+=@($k.ProcessId)}};Walk $root;foreach($procId in ($all+@($root))){Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue}';
      spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', windowsHide: true });
    }
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch (e) { try { process.kill(pid, 'SIGKILL'); } catch (_e) {} }
}

function runTest(testPath) {
  return new Promise(function (resolve) {
    var out = '', err = '', timedOut = false, settled = false;
    var child = spawn(process.execPath, [testPath], {
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', function (chunk) { out += chunk; });
    child.stderr.on('data', function (chunk) { err += chunk; });
    var timer = setTimeout(function () {
      timedOut = true;
      killTree(child.pid);
    }, TEST_TIMEOUT_MS);
    child.on('error', function (error) {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolve({ status: null, error: error, stdout: out, stderr: err, timedOut: timedOut });
    });
    child.on('exit', function (code) {
      if (settled) return;
      settled = true; clearTimeout(timer);
      resolve({ status: code, stdout: out, stderr: err, timedOut: timedOut });
    });
  });
}

(async function () {
  var failed = 0;
  for (var ti = 0; ti < TESTS.length; ti++) {
    var t = TESTS[ti], label = t[0], rel = t[1];
    var testPath = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
    // 静默成功:捕获输出,通过则不打印;失败才回放完整输出。timeout 杀整个进程树，
    // 防测试脚本再 spawn detached 后代后只杀直接 child、让幽灵进程污染后续测试/机器。
    var r = await runTest(testPath);
    if (r.status !== 0 || r.timedOut || r.error) {
      failed++;
      if (r.timedOut) console.log('\n──── ' + label + '  (' + rel + ')  X 测试超时 (' + TEST_TIMEOUT_MS + 'ms) ────');
      else console.log('\n──── ' + label + '  (' + rel + ')  X 失败 (exit ' + r.status + ') ────');
      if (r.stdout) process.stdout.write(r.stdout);
      if (r.stderr) process.stderr.write(r.stderr);
      if (r.error && !r.timedOut) console.error(r.error);
    }
  }

  console.log('════════════════════════════════════════');
  if (failed) { console.log('测试文件:' + failed + ' / ' + TESTS.length + ' 失败(详情见上)'); process.exit(1); }
  console.log('测试文件:全部 ' + TESTS.length + ' 通过(静默成功;逐条详情可直接跑对应 test 文件)');
  process.exit(0);
})();
