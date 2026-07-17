/* smoke-harness.mjs 错误通道验证(需 jsdom；由 run.cjs 在依赖可用时执行)。
   核心反向牙：内联脚本同步 throw 发生在 new JSDOM() 构造期间，错误监听必须在 beforeParse
   里先装好；构造完成后才 addEventListener 会把坏成品判绿。 */
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var spawnSync = require('child_process').spawnSync;
var pathToFileURL = require('url').pathToFileURL;

var TOOL = path.join(__dirname, '..', 'smoke-harness.mjs');
var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name); pass++; }
  else { console.log('  X   ' + name + (detail ? '  → ' + detail : '')); fail++; }
}
function page(script) {
  return '<!doctype html><body><main id="app">这是一段足够长的烟雾测试正文，用于确保页面内容检查不会遮住真正的脚本错误。</main>' +
    '<button id="go">继续前往下一处</button><script>' + script + '</script></body>';
}

console.log('smoke-harness 验证');
import(pathToFileURL(TOOL).href).then(async function (mod) {
  var sync = await mod.runSmoke(page("throw new Error('SYNC_BOOM')"), { settleMs: 0, actionWaitMs: 0 });
  ok('A1 构造期同步 throw 被“加载期运行时错误”捕获', sync.fail >= 1 && sync.lines.some(function (line) {
    return /无加载期运行时错误/.test(line) && /SYNC_BOOM/.test(line);
  }), sync.lines.join(' | '));

  var rejected = await mod.runSmoke(page("Promise.reject(new Error('ASYNC_BOOM'))"), { settleMs: 20, actionWaitMs: 0 });
  ok('A2 unhandledrejection 同样进入错误通道', rejected.fail >= 1 && rejected.lines.some(function (line) {
    return /无加载期运行时错误/.test(line) && /ASYNC_BOOM/.test(line);
  }), rejected.lines.join(' | '));

  var healthy = await mod.runSmoke(page("document.getElementById('go').addEventListener('click',function(){document.getElementById('app').textContent='已经安全切换到下一处，正文也随之改变。';});"), { settleMs: 0, actionWaitMs: 0 });
  ok('A3 健康页面加载检查仍通过', healthy.lines.some(function (line) {
    return /✅ 1\. 无加载期运行时错误/.test(line);
  }) && !healthy.lines.some(function (line) { return /SYNC_BOOM|ASYNC_BOOM/.test(line); }), healthy.lines.join(' | '));

  var audioNamedBug = await mod.runSmoke(page("document.getElementById('go').addEventListener('click',function(){throw new Error('gainNode is not defined');});"), { settleMs: 0, actionWaitMs: 0 });
  ok('A4 业务代码错误即使含音频关键词也必须失败，不能按消息猜成 jsdom 限制', audioNamedBug.fail >= 1 && audioNamedBug.lines.some(function (line) {
    return /点一下能切换且不崩/.test(line) && /gainNode is not defined/.test(line) && /❌/.test(line);
  }), audioNamedBug.lines.join(' | '));

  var probe = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-smoke-node-path-'));
  try {
    var isolatedTool = path.join(probe, 'engine', 'core', 'tooling', 'smoke-harness.mjs');
    var runner = path.join(probe, 'probe.mjs');
    fs.mkdirSync(path.dirname(isolatedTool), { recursive: true });
    fs.copyFileSync(TOOL, isolatedTool);
    fs.writeFileSync(runner,
      "import { runSmoke } from './engine/core/tooling/smoke-harness.mjs';\n" +
      "const r=await runSmoke('<!doctype html><main>这是一段足够长的健康正文内容，专门验证仓库外依赖解析。</main><button>继续</button>',{settleMs:0,actionWaitMs:0});\n" +
      "console.log(JSON.stringify(r));\n" +
      "process.exit(r.lines.some(function(line){return line.includes('需要 jsdom');})?9:0);\n",
      'utf8');
    var external = spawnSync(process.execPath, [runner], {
      cwd: probe,
      env: Object.assign({}, process.env, { NODE_PATH: path.dirname(path.dirname(require.resolve('jsdom/package.json'))) }),
      encoding: 'utf8'
    });
    ok('A5 仓库外解包时 NODE_PATH 可提供 jsdom，不要求把 node_modules 拷进 payload', external.status === 0,
      'status=' + external.status + ' stdout=' + external.stdout + ' stderr=' + external.stderr);
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
}).catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
