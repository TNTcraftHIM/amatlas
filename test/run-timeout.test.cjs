/* engine/test/run.cjs 子进程超时验证。
   可登记进 runner：本测试启动的内层 runner带 ATLAS_TEST_RUNNER_TEST_FILE，
   会把列表替换成唯一临时脚本，不会再运行本测试。锁正常完成与永久句柄超时两端。 */
'use strict';
var spawnSync = require('child_process').spawnSync;
var fs = require('fs');
var os = require('os');
var path = require('path');

var RUNNER = path.join(__dirname, 'run.cjs');
var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-runner-timeout-'));
var healthy = path.join(dir, 'healthy.cjs');
var hanging = path.join(dir, 'hanging.cjs');
var descendant = path.join(dir, 'descendant.cjs');
var marker  = path.join(dir, 'descendant-marker.txt');   // marker-A: detached 孙进程写(自成新进程组)
var markerB = path.join(dir, 'descendant-marker-b.txt'); // marker-B: 非 detached 孙进程写(在被测脚本进程组内)
fs.writeFileSync(healthy, "console.log('HEALTHY_DONE');\n");
fs.writeFileSync(hanging, "setInterval(function(){},1000);\n");
// descendant.cjs 启动两个孙进程:
//   A (detached:true + unref): 在 POSIX 自成新进程组 → kill(-pgid) 无法跨组杀(§161 平台硬限,无 cgroup/Job Object)
//   B (默认非 detached):       继承 descendant.cjs 的进程组 → kill(-pgid) 和 taskkill /t 两平台都能清掉
fs.writeFileSync(descendant,
  "var cp=require('child_process'),fs=require('fs');" +
  "cp.spawn(process.execPath,['-e',\"setTimeout(function(){require('fs').writeFileSync(\"+JSON.stringify(" + JSON.stringify(marker) + ")+\",'SURVIVED')},1500)\"],{detached:true,stdio:'ignore'}).unref();" +
  "cp.spawn(process.execPath,['-e',\"setTimeout(function(){require('fs').writeFileSync(\"+JSON.stringify(" + JSON.stringify(markerB) + ")+\",'SURVIVED')},1500)\"],{stdio:'ignore'});" +
  "setInterval(function(){},1000);\n");

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name); pass++; }
  else { console.log('  X   ' + name + (detail ? '  → ' + detail : '')); fail++; }
}
function run(file, timeout) {
  var env = Object.assign({}, process.env, {
    ATLAS_TEST_RUNNER_TEST_FILE: file,
    ATLAS_TEST_TIMEOUT_MS: String(timeout)
  });
  var r = spawnSync(process.execPath, [RUNNER], { encoding: 'utf8', env: env, timeout: 3000 });
  return { status: r.status, signal: r.signal, error: r.error, out: (r.stdout || '') + (r.stderr || '') };
}

console.log('test runner 超时验证');
var good = run(healthy, 500);
ok('A1 健康脚本在阈值内通过', good.status === 0 && /全部 1 通过/.test(good.out), 'status=' + good.status + ' ' + good.out);

var hung = run(hanging, 50);
ok('A2 挂起脚本由 runner 自己超时退出 1,不是外层 watchdog 杀死', hung.status === 1 && !(hung.error && hung.error.code === 'ETIMEDOUT'), 'status=' + hung.status + ' signal=' + hung.signal + ' outer=' + (hung.error && hung.error.code) + ' ' + hung.out);
ok('A3 超时报告点名路径与 50ms 阈值', /测试超时/.test(hung.out) && hung.out.indexOf(hanging) >= 0 && /50ms/.test(hung.out), hung.out);

var desc = run(descendant, 80);
spawnSync(process.execPath, ['-e', 'setTimeout(function(){},1800)'], { timeout: 2500 });
// A4 portable 断言:marker-B(非 detached 孙进程,在被测脚本进程组内)必须被进程组/树杀清 ——
//   POSIX: descendant.cjs 以 detached:true 启动故是进程组长,kill(-pgid) 连同组内所有非 detached 子孙一起杀
//   Windows: taskkill /t 按 ppid 树杀,同样清掉组内后代
// marker-A(detached 孙进程,自成新进程组):POSIX 不断言其死亡 —— 零依赖下跨组强杀不可达(§161 平台硬限);
//   Windows 用 taskkill /t 按 ppid 树能连它一起杀,故仅在 win32 补断言。
ok('A4 超时清理进程树：组内非 detached 后代两平台都必须死（marker-B）',
  desc.status === 1 && !fs.existsSync(markerB),
  'markerB=' + fs.existsSync(markerB) + ' desc.status=' + desc.status + ' ' + desc.out);
if (process.platform === 'win32') {
  // taskkill /t /f 按 ppid 树,能杀到 detached 孙进程(§161);POSIX 上此后代逃逸是文档化约束,不断言
  ok('A4-win detached 孙进程在 Windows 也必须死（taskkill /t 按 ppid 树）',
    !fs.existsSync(marker),
    'marker=' + fs.existsSync(marker));
}

try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
