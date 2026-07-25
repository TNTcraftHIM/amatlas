/* static-lint.mjs 验证(纯 node,无需 jsdom;随 test/run.cjs)。
   静态文本 lint 只查零误报的 correctness 残留:TODO/占位 · 乱码 U+FFFD · world.js 里的 {{ 死标记。
   全 P1(退出码 0、不硬拦)。clean game 零报;三类残留各自触发。 */
'use strict';
var spawnSync = require('child_process').spawnSync, fs = require('fs'), path = require('path');
var TOOL = path.join(__dirname, '..', 'static-lint.mjs');
var TMP = path.join(__dirname, 'fixtures', '_slint_tmp');
var pass = 0, fail = 0;
function ok(n, c, d) { if (c) { console.log('  ok  ' + n); pass++; } else { console.log('  X   ' + n + (d ? '  → ' + d : '')); fail++; } }
function write(world) {
  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, 'index.html'), '<!doctype html><body><div id="look"></div><script src="world.js"></script></body>');
  fs.writeFileSync(path.join(TMP, 'world.js'), world);
}
function run() { var r = spawnSync(process.execPath, [TOOL, path.join(TMP, 'index.html')], { encoding: 'utf8' }); return { out: (r.stdout || '') + (r.stderr || ''), status: r.status }; }

console.log('static-lint 验证');
try {
  write('module.exports={start:{map:"m",node:"a"},maps:{m:{nodes:{a:{kind:"scene",look:function(S){return "干净的散文";}}}}}};');
  var clean = run();
  ok('A 干净 game → 无 P1、退出 0', /P1=0/.test(clean.out) && clean.status === 0, clean.out.replace(/\n/g, ' ').slice(0, 160));
  write('module.exports={maps:{m:{nodes:{a:{look:"开场。TODO: 补结局"}}}}};');
  ok('B TODO → 报残留待办(P1 不拦)', /残留待办/.test(run().out));
  write('module.exports={maps:{m:{nodes:{a:{look:"你看到 {{flags.found}} 的箱子"}}}}};');
  ok('C world.js 含 {{ → 报死标记(模块化不插值)', /死标记/.test(run().out));
  write('module.exports={maps:{m:{nodes:{a:{look:"乱�码"}}}}};');
  ok('D U+FFFD 替换字符 → 报乱码', /乱码/.test(run().out));
  ok('E 全部 P1、退出码 0(不硬拦)', run().status === 0);
} finally { fs.rmSync(TMP, { recursive: true, force: true }); }

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
