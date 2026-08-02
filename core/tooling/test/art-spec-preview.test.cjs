/* art-spec-preview 工具验证 —— 纯 node、零依赖(spawn 工具本身,黑盒查输出)。
   守:① 合法 art-spec → 退 0 + HTML 内联 present-svg(buildSceneSVG)+ 校验通过 + 图元 + ±15 网格;
       ② 非法图元 → fail-loud(stderr 报"未知 shape"+ 列允许值;预览仍生成、错误嵌入);
       ③ 内置预设名 / --list 工作;④ 坏 JSON → 硬失败 exit 1。
   teeth:停止内联 present-svg → A2 红;停止校验 → B 红(present-svg 导出漂移也会被 A2 抓)。 */
'use strict';
var spawnSync = require('child_process').spawnSync;
var path = require('path');
var TOOL = path.join(__dirname, '..', 'art-spec-preview.mjs');
var NODE = process.execPath;

var pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } }
function fromStdin(input, args) { return spawnSync(NODE, [TOOL, '-'].concat(args || []), { input: input, encoding: 'utf8' }); }

console.log('art-spec-preview 工具验证');

// A. 合法 art-spec 数组 → 退 0 + 自包含 HTML(内联 present-svg + 校验通过 + 图元色 + 网格)
var r1 = fromStdin('[{"shape":"circle","cx":0,"cy":0,"r":10,"fill":"#e87aa0"}]');
ok('A1 合法 art-spec 退出码 0', r1.status === 0);
ok('A2 输出 HTML 内联了 present-svg(含 buildSceneSVG 调用)', /buildSceneSVG/.test(r1.stdout || ''));
ok('A3 输出含「校验通过」+ 图元颜色 e87aa0', /校验通过/.test(r1.stdout || '') && /e87aa0/.test(r1.stdout || ''));
ok('A4 输出含 ±15 坐标网格(grid-overlay)', /grid-overlay/.test(r1.stdout || ''));
ok('A5 网格原点跟随 present-svg 单物件落点(placeElements(1),非硬编码 160=与渲染对齐)', /placeElements\(1\)/.test(r1.stdout || '') && !/x≈160/.test(r1.stdout || ''));

// B. 非法图元 → fail-loud(stderr 点名未知 shape + 列允许值);仍生成预览(错误嵌入)、不静默
var r2 = fromStdin('[{"shape":"nope"}]');
ok('B1 非法 shape → stderr 报「未知 shape」并列允许值', /未知 shape/.test(r2.stderr || '') && /circle/.test(r2.stderr || ''));

// C. 内置预设名(字符串)→ 退 0、标 OK 内置预设
var r3 = fromStdin('"ship"');
ok('C1 已知预设名 ship → 退 0 且标「内置预设」', r3.status === 0 && /内置预设/.test(r3.stdout || ''));

// D. 坏 JSON → 硬失败 exit 1(与 art-spec 校验失败的软处理区分)
var r4 = fromStdin('not json');
ok('D1 坏 JSON → exit 1(硬失败)', r4.status === 1 && /JSON 解析失败/.test(r4.stderr || ''));

// E. --list 列出 ART_PRESETS
var r5 = spawnSync(NODE, [TOOL, '--list'], { encoding: 'utf8' });
ok('E1 --list 退 0 且列出预设名(含 ship/figure)', r5.status === 0 && /ship/.test(r5.stdout || '') && /figure/.test(r5.stdout || ''));

console.log('art-spec-preview: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
