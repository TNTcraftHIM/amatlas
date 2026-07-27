/* ════════════════════════════════════════════════════════════════════════
   build.mjs 验证(纯 node,无需 jsdom;随 test/run.cjs)。
   测 CLI 契约 + 准入门语义(S6 验收关卡):
     · 好世界(真 demo)→ 退出 0、全内联(0 残留外链)、自包含。
     · 坏世界夹具(缺 kind + 死链)→ 退出 1、报明确错、**不产出文件**(fail-closed)。
     · 缺参数 → 退出 2(用法错误,区别于「拒绝」的 1)。
   jsdom 可加载探针(--smoke)**有意不在此**——它需 jsdom(即装即删),归 run.cjs 之外。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
var spawnSync = require('child_process').spawnSync;
var path = require('path');
var fs = require('fs');
var os = require('os');

var BUILD = path.join(__dirname, '..', 'build.mjs');
var DEMO_INDEX = path.join(__dirname, '..', '..', '..', 'examples', 'text-adventure-demo', 'index.html');
var BAD_INDEX = path.join(__dirname, 'fixtures', 'bad.html');

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name); pass++; }
  else { console.log('  X   ' + name + (detail ? '  → ' + detail : '')); fail++; }
}
function run(args, options) {
  options = options || {};
  var r = spawnSync(process.execPath, [BUILD].concat(args), {
    encoding: 'utf8',
    env: Object.assign({}, process.env, options.env || {}),
    timeout: options.timeout
  });
  return {
    status: r.status,
    error: r.error,
    out: (r.stdout || '') + (r.stderr || '')
  };
}
function tmp(name) { return path.join(os.tmpdir(), name); }

console.log('build 验证');

// A. 好世界(真 demo)→ 过门 + 全内联 + 退出 0
var goodOut = tmp('amatlas-build-demo.' + process.pid + '.html');
try { fs.unlinkSync(goodOut); } catch (e) {}
var good = run([DEMO_INDEX, goodOut]);
ok('A1 demo 构建退出码 0', good.status === 0, 'status=' + good.status + ' | ' + good.out);
ok('A2 输出文件已产出', fs.existsSync(goodOut));
var built = fs.existsSync(goodOut) ? fs.readFileSync(goodOut, 'utf8') : '';
ok('A3 成品 0 残留外链 <script src>', built.length > 0 && built.indexOf('<script src=') === -1, 'len=' + built.length);
// A4:内联脚本数 = demo 实际声明的 <script src> 数(从 demo 派生,不写死——demo 会随版本增减脚本)。
var demoSrcCount = (fs.readFileSync(DEMO_INDEX, 'utf8').match(/<script src=/g) || []).length;
var inlinedM = good.out.match(/内联 (\d+) 段脚本/);
var inlinedN = inlinedM ? Number(inlinedM[1]) : -1;
ok('A4 内联脚本数 = demo 声明的 <script src> 数(' + demoSrcCount + ')', inlinedN === demoSrcCount && demoSrcCount >= 5, '内联=' + inlinedN + ' 期望=' + demoSrcCount + ' | ' + good.out);
ok('A5 核心+世界确已内联进来', /createEngine/.test(built) && /TEXT_ADVENTURE_DEMO_WORLD/.test(built));
// A6 版本戳:产物顶部有引擎版本注释 + 构建输出报版本(诊断:端用户发回 dist 即知引擎版本)。
//   用 [^)]+ 而非 \S+:发布包注入的版本含空格(哈希 空格 ISO日期),\S+ 会在空格处断、在发布包里假失败。
ok('A6 产物顶部含引擎版本注释 + 构建输出报版本', /^<!-- Amatlas engine: [^>]+-->/.test(built) && /引擎 [^)]+\)/.test(good.out), built.slice(0, 70) + ' | ' + (good.out.match(/引擎 [^)]*\)/) || ['?'])[0]);

// B. 坏世界(缺 kind + 死链)→ 准入门拒绝、退出 1、不产出文件
var badOut = tmp('amatlas-build-bad.' + process.pid + '.html');
try { fs.unlinkSync(badOut); } catch (e) {}
var bad = run([BAD_INDEX, badOut]);
ok('B1 坏世界退出码 1(准入门拒绝)', bad.status === 1, 'status=' + bad.status);
ok('B2 报 schema 缺 kind', /缺合法 kind/.test(bad.out), bad.out);
ok('B3 报图死链(复用 graph-audit)', /死链/.test(bad.out), bad.out);
ok('B4 无旧产物时拒绝不写文件,且文案明确目标不存在', !fs.existsSync(badOut) && /本次未写入,目标文件不存在/.test(bad.out), '文件不该存在 | ' + bad.out.slice(0, 300));

// B5. 已有上次成功产物时,坏构建保留 last-known-good 但必须明确“本次未更新”。
var staleOut = tmp('amatlas-build-stale.' + process.pid + '.html');
fs.writeFileSync(staleOut, 'LAST_KNOWN_GOOD');
var stale = run([BAD_INDEX, staleOut]);
ok('B5 已有旧产物时坏构建不覆盖/不删除 sentinel', stale.status === 1 && fs.readFileSync(staleOut, 'utf8') === 'LAST_KNOWN_GOOD', 'status=' + stale.status + ' content=' + fs.readFileSync(staleOut, 'utf8'));
ok('B6 文案明确“本次未更新,旧产物仍在”并给路径', /本次未更新,旧产物仍在/.test(stale.out) && stale.out.indexOf(staleOut) >= 0, stale.out.slice(0, 500));
try { fs.unlinkSync(staleOut); } catch (e) {}

// B7. 默认（非 smoke）构建也必须先写同目录候选再 rename，不能直接截断 last-known-good。
var buildSource = fs.readFileSync(BUILD, 'utf8');
ok('B7 默认构建使用统一候选+rename 事务，不直接把 canonical 交给 buildToFile',
  /const candidatePath = path\.join\(path\.dirname\(outPath\), '\.' \+ path\.basename\(outPath\)/.test(buildSource) &&
  /fs\.renameSync\(candidatePath, outPath\)/.test(buildSource) && !/const candidatePath = smoke\s*\?/.test(buildSource),
  '默认路径仍可能直接 writeFileSync(outPath)');

// B8. buildToFile 是导出 API；同进程重建同一路径时必须先清 require.cache，再审磁盘新 world。
ok('B8 loadWorld 每次 require 前清缓存，不能审旧 world 却内联新坏源码',
  /delete require\.cache\[require\.resolve\(p\)\][\s\S]{0,160}require\(p\)/.test(buildSource),
  'loadWorld 未清 require.cache');

// C. 缺参数 → 退出 2(用法错误,区别于拒绝的 1)
ok('C1 缺参数退出码 2', run([]).status === 2);

// C2. graph/build 同源 event.when 闸:真实 node.events[] 坏形状拒绝；私有同名字段放行。
(function () {
  function writeWorld(dir, body) {
    fs.writeFileSync(path.join(dir, 'world.js'),
      "(function(g,f){if(typeof module!=='undefined'&&module.exports)module.exports=f();else g.W=f();})(typeof globalThis!=='undefined'?globalThis:this,function(){return " + body + ";});\n");
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><body><script src="world.js"></script></body>\n');
  }

  var badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-event-when-bad-'));
  writeWorld(badDir, "{id:'10101010-1010-4010-8010-101010101010',start:{map:'m',node:'a'},maps:{m:{nodes:{a:{kind:'custom',events:[{when:'enter',run:function(){}}],links:[{label:'回',to:'a'}]}}}}}");
  var badEventOut = path.join(badDir, 'dist', 'index.html');
  var badEvent = run([path.join(badDir, 'index.html'), badEventOut]);
  ok('C2a events[].when 字符串 → build 复用 graph P0 拒绝', badEvent.status === 1 && /event\.when 写成字符串 'enter'/.test(badEvent.out), 'status=' + badEvent.status + ' ' + badEvent.out.slice(0, 400));
  ok('C2b event.when 拒绝时不产生新产物', !fs.existsSync(badEventOut), '文件不该存在');

  var goodDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-event-when-private-'));
  writeWorld(goodDir, "{id:'20202020-2020-4020-8020-202020202020',start:{map:'m',node:'a'},maps:{m:{nodes:{a:{kind:'custom',meta:{when:'manual'},events:[{when:function(){return true;},run:function(){}}],links:[{label:'回',to:'a'}]}}}}}");
  var privateOut = path.join(goodDir, 'dist', 'index.html');
  var privateWhen = run([path.join(goodDir, 'index.html'), privateOut]);
  ok('C2c 私有 meta.when 字符串 → build 放行、不误报 event.when', privateWhen.status === 0 && fs.existsSync(privateOut) && !/event\.when/.test(privateWhen.out), 'status=' + privateWhen.status + ' ' + privateWhen.out.slice(0, 400));

  try { fs.rmSync(badDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(goodDir, { recursive: true, force: true }); } catch (e) {}
})();

// C2d. graph CLI 的其余项目级 P0 也必须与 build 同源，不能只修 event.when 一项。
(function () {
  var fixtureRoot = path.join(__dirname, '..', '..', '..', 'core', 'tooling', 'test', 'fixtures');

  var deadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-build-dead-state-'));
  fs.copyFileSync(path.join(fixtureRoot, 'dead-statekey-world.js'), path.join(deadDir, 'world.js'));
  fs.writeFileSync(path.join(deadDir, 'index.html'), '<!doctype html><body><script src="world.js"></script></body>\n');
  var deadOut = path.join(deadDir, 'dist', 'index.html');
  var dead = run([path.join(deadDir, 'index.html'), deadOut]);
  ok('C2d graph 的死 state 键 P0 → build 同样拒绝', dead.status === 1 && /死 state 键 'understanding'/.test(dead.out) && !fs.existsSync(deadOut), 'status=' + dead.status + ' ' + dead.out.slice(0, 700));

  var kindDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-build-kind-module-'));
  fs.copyFileSync(path.join(fixtureRoot, 'kind-mismatch', 'world.js'), path.join(kindDir, 'world.js'));
  fs.copyFileSync(path.join(fixtureRoot, 'kind-mismatch', 'game.js'), path.join(kindDir, 'game.js'));
  fs.writeFileSync(path.join(kindDir, 'index.html'), '<!doctype html><body><script src="world.js"></script><script src="game.js"></script></body>\n');
  var kindOut = path.join(kindDir, 'dist', 'index.html');
  var kind = run([path.join(kindDir, 'index.html'), kindOut]);
  ok('C2e graph 的 kind↔模块 P0 → build 同样拒绝', kind.status === 1 && /没有模块认领/.test(kind.out) && !fs.existsSync(kindOut), 'status=' + kind.status + ' ' + kind.out.slice(0, 700));

  try { fs.rmSync(deadDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(kindDir, { recursive: true, force: true }); } catch (e) {}
})();

// C3. 本地 script 解析/内联/remaining 同源:纯语法差异可内联；语义属性/非空 body/远程脚本 fail-closed。
(function () {
  function worldSource() {
    return "(function(g,f){if(typeof module!=='undefined'&&module.exports)module.exports=f();else g.W=f();})(typeof globalThis!=='undefined'?globalThis:this,function(){return {id:'30303030-3030-4030-8030-303030303030',start:{map:'m',node:'a'},maps:{m:{nodes:{a:{kind:'custom',links:[{label:'回',to:'a'}]}}}}};});\n";
  }

  var syntaxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-script-syntax-'));
  fs.writeFileSync(path.join(syntaxDir, 'world.js'), worldSource());
  fs.writeFileSync(path.join(syntaxDir, 'index.html'), "<!doctype html><body><SCRIPT   SRC = 'world.js' >  </SCRIPT></body>\n");
  var syntaxOut = path.join(syntaxDir, 'dist', 'index.html');
  var syntax = run([path.join(syntaxDir, 'index.html'), syntaxOut]);
  var syntaxBuilt = fs.existsSync(syntaxOut) ? fs.readFileSync(syntaxOut, 'utf8') : '';
  ok('C3a script 大小写/空白/单引号纯语法差异仍安全内联', syntax.status === 0 && fs.existsSync(syntaxOut) && /g\.W=f\(\)/.test(syntaxBuilt), 'status=' + syntax.status + ' ' + syntax.out.slice(0, 400));
  ok('C3b 语法变体内联后无带 src 的 script 标签、remaining=0', !/<script\b[^>]*\bsrc\b/i.test(syntaxBuilt) && /残留外链 0/.test(syntax.out), syntax.out.slice(0, 400));

  var unclosedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-script-unclosed-'));
  fs.writeFileSync(path.join(unclosedDir, 'world.js'), worldSource());
  fs.writeFileSync(path.join(unclosedDir, 'extra.js'), 'globalThis.EXTRA = true;\n');
  fs.writeFileSync(path.join(unclosedDir, 'index.html'), '<!doctype html><body><script src="world.js"></script><script src="extra.js">\n');
  var unclosedOut = path.join(unclosedDir, 'dist', 'index.html');
  var unclosed = run([path.join(unclosedDir, 'index.html'), unclosedOut]);
  ok('C3c 未闭合外部 script 必须 fail-closed，不能残留 src 却报告 remaining=0', unclosed.status === 1 && !fs.existsSync(unclosedOut) && /script/.test(unclosed.out), 'status=' + unclosed.status + ' ' + unclosed.out.slice(0, 700));

  var unsupportedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-script-unsupported-'));
  fs.writeFileSync(path.join(unsupportedDir, 'world.js'), worldSource());
  fs.writeFileSync(path.join(unsupportedDir, 'side.js'), 'globalThis.SIDE = true;\n');
  fs.writeFileSync(path.join(unsupportedDir, 'module.js'), 'export const x = 1;\n');
  fs.writeFileSync(path.join(unsupportedDir, 'fallback.js'), 'globalThis.FALLBACK = true;\n');
  fs.writeFileSync(path.join(unsupportedDir, 'dup.js'), 'globalThis.DUP = true;\n');
  fs.writeFileSync(path.join(unsupportedDir, 'index.html'),
    '<!doctype html><body>\n' +
    '<script src="world.js"></script>\n' +
    '<script defer src="side.js"></script>\n' +
    '<script src="module.js" type="module"></script>\n' +
    '<script src="fallback.js">fallback body</script>\n' +
    '<script src="dup.js" src="side.js"></script>\n' +
    '<script src="https://cdn.example.com/remote.js"></script>\n' +
    '</body>\n');
  var unsupportedOut = path.join(unsupportedDir, 'dist', 'index.html');
  var unsupported = run([path.join(unsupportedDir, 'index.html'), unsupportedOut]);
  ok('C3d defer/type=module 额外属性不静默丢语义 → fail-closed 点名', unsupported.status === 1 && /side\.js[^\n]*额外属性[^\n]*defer/.test(unsupported.out) && /module\.js[^\n]*额外属性[^\n]*type/.test(unsupported.out), 'status=' + unsupported.status + ' ' + unsupported.out.slice(0, 1000));
  ok('C3e 非空 body / 重复 src / 远程 src 都被拒绝', /fallback\.js[^\n]*标签体必须为空/.test(unsupported.out) && /side\.js[^\n]*src 属性重复/.test(unsupported.out) && /remote\.js[^\n]*远程脚本/.test(unsupported.out), unsupported.out.slice(0, 1600));
  ok('C3f 五个未内联 script 统一计 remaining=5 且不产物', /仍残留 5 个/.test(unsupported.out) && !fs.existsSync(unsupportedOut), unsupported.out.slice(0, 1600));

  var missingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-script-missing-'));
  fs.writeFileSync(path.join(missingDir, 'world.js'), worldSource());
  fs.writeFileSync(path.join(missingDir, 'index.html'), '<!doctype html><body><script src="world.js"></script><script src="missing.js"></script></body>\n');
  var missingOut = path.join(missingDir, 'dist', 'index.html');
  var missing = run([path.join(missingDir, 'index.html'), missingOut]);
  ok('C3g 本地 script 缺失 → 明确 fail-closed、remaining=1、不崩裸 ENOENT', missing.status === 1 && /script 读不到:missing\.js/.test(missing.out) && /仍残留 1 个/.test(missing.out) && !/node:fs/.test(missing.out) && !fs.existsSync(missingOut), 'status=' + missing.status + ' ' + missing.out.slice(0, 800));

  try { fs.rmSync(syntaxDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(unclosedDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(unsupportedDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(missingDir, { recursive: true, force: true }); } catch (e) {}
})();

// D. 易用性审计批:字面 </script> 转义 + 非自包含资产 warn
(function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-esc-'));
  // world 正文故意含字面 </script>(作者在 look 里写 HTML 教程文本=合法内容)+ 一个外链 img
  fs.writeFileSync(path.join(dir, 'world.js'),
    "(function(g,f){if(typeof module!=='undefined'&&module.exports)module.exports=f();else g.MY_WORLD=f();})(typeof globalThis!=='undefined'?globalThis:this,function(){\n" +
    "return { id:'40404040-4040-4040-8040-404040404040', start:{map:'m',node:'a'}, maps:{ m:{ name:'M', nodes:{\n" +
    "  a:{ kind:'demo', look:'他低声说:「别在正文里写 </" + "script> 标签」', links:[{to:'b',label:'走'}] },\n" +
    "  b:{ kind:'demo', look:'安全了', links:[{to:'a',label:'回'}] }\n" +
    "} } } };});\n");
  fs.writeFileSync(path.join(dir, 'index.html'),
    '<body><img src="https://cdn.example.com/cover.png"><div id="look"></div>\n' +
    '<script src="world.js"></script>\n</body>\n');
  var out = path.join(dir, 'dist', 'index.html');
  var r = run([path.join(dir, 'index.html'), out]);
  var built2 = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  // 转义后成品内不允许出现「字面 </script 后还跟正文」导致的脚本块提前终止:
  // 检法=取每个 <script> 块,块内不得再含未转义的 </script(除收尾标签本身)。
  var bodies = built2.split(/<script>/).slice(1).map(function (s) { return s.split(/<\/script>/)[0]; });
  var leaked = bodies.some(function (b) { return /<\/script/i.test(b); });
  ok('D1 字面 </' + 'script> 已转义为 <\\/script(脚本块不再被正文提前终止)', built2.length > 0 && !leaked && /<\\\/script/.test(built2), 'len=' + built2.length);
  ok('D2 转义后世界数据仍可运行(产物含转义形文本)', /别在正文里写/.test(built2));
  ok('D3 外链 <img src> → warn 提示非自包含(不阻断构建)', r.status === 0 && /非自包含资产/.test(r.out) && /cdn\.example\.com/.test(r.out), r.out.slice(0, 300));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
})();

// E. 本地 stylesheet link → 内联为 <style>;CSS 二级资产 warn;缺 CSS fail-closed。
(function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-css-'));
  fs.mkdirSync(path.join(dir, 'styles'));
  fs.writeFileSync(path.join(dir, 'world.js'),
    "(function(g,f){if(typeof module!=='undefined'&&module.exports)module.exports=f();else g.MY_WORLD=f();})(typeof globalThis!=='undefined'?globalThis:this,function(){\n" +
    "return { id:'50505050-5050-4050-8050-505050505050', start:{map:'m',node:'a'}, maps:{ m:{ name:'M', nodes:{\n" +
    "  a:{ kind:'scene', look:'起点', links:[{to:'b',label:'走'}] },\n" +
    "  b:{ kind:'scene', look:'终点', links:[{to:'a',label:'回'}] }\n" +
    "} } } };});\n");
  fs.writeFileSync(path.join(dir, 'styles', 'site.css'), '.choice{color:red}\n@import "print.css";\n#scene{background:url(images/card.png)}\n');
  fs.writeFileSync(path.join(dir, 'index.html'),
    '<!doctype html><html><head><link href="styles/site.css" rel="stylesheet"></head><body><div id="look"></div><div id="choices"></div>\n' +
    '<script src="world.js"></script></body></html>');
  var out = path.join(dir, 'dist', 'index.html');
  var r = run([path.join(dir, 'index.html'), out]);
  var cssBuilt = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  ok('E1 本地 stylesheet link 已内联成 <style>(成品无本地 CSS link)', r.status === 0 && /1 段样式/.test(r.out) && /data-amatlas-inline-css="styles\/site\.css"/.test(cssBuilt) && cssBuilt.indexOf('<link href="styles/site.css"') === -1, r.out.slice(0, 300));
  ok('E2 CSS 二级 @import/url → warn 提示非自包含(不阻断构建)', r.status === 0 && /CSS @import/.test(r.out) && /print\.css/.test(r.out) && /CSS url\(\)/.test(r.out) && /images\/card\.png/.test(r.out), r.out.slice(0, 500));

  fs.writeFileSync(path.join(dir, 'print.css'), '.print-only{display:block}\n');
  fs.writeFileSync(path.join(dir, 'print.html'), '<!doctype html><head><link rel="stylesheet" href="print.css" media="print"></head><body><script src="world.js"></script></body>');
  var printOut = path.join(dir, 'dist', 'print.html');
  var printBuild = run([path.join(dir, 'print.html'), printOut]);
  var printHtml = fs.existsSync(printOut) ? fs.readFileSync(printOut, 'utf8') : '';
  ok('E3 stylesheet 的 media 条件内联后必须保留', printBuild.status === 0 && /<style[^>]*media="print"/.test(printHtml), printHtml.slice(0, 250));

  fs.writeFileSync(path.join(dir, 'missing.html'),
    '<!doctype html><html><head><link rel="stylesheet" href="missing.css"></head><body>\n' +
    '<script src="world.js"></script></body></html>');
  var badOut = path.join(dir, 'dist', 'missing.html');
  var bad = run([path.join(dir, 'missing.html'), badOut]);
  ok('E4 本地 CSS 缺失 → 退出 1 且不产物(fail-closed)', bad.status === 1 && /stylesheet 读不到:missing\.css/.test(bad.out) && !fs.existsSync(badOut), 'status=' + bad.status + ' ' + bad.out.slice(0, 300));
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
})();

// F. --smoke 输出事务 + 硬 timeout（仅安装 jsdom 时执行；基础 runner 无依赖仍可跳过）。
(function () {
  var hasJsdom = false;
  try { require.resolve('jsdom'); hasJsdom = true; } catch (e) {}
  if (!hasJsdom) return;

  function smokeGame(script) {
    var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-build-smoke-tx-'));
    fs.writeFileSync(path.join(dir, 'world.js'),
      "(function(g,f){if(typeof module!=='undefined'&&module.exports)module.exports=f();else g.W=f();})(typeof globalThis!=='undefined'?globalThis:this,function(){return {id:'60606060-6060-4060-8060-606060606060',start:{map:'m',node:'a'},maps:{m:{nodes:{a:{kind:'custom',links:[{label:'继续',to:'a'}]}}}}};});\n");
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><body><main id="app">这是一段足够长的烟雾事务测试正文，确保页面内容检查不会盖住脚本错误。</main><button>继续</button><script src="world.js"></script><script>' + script + '</script></body>\n');
    return dir;
  }

  var badDir = smokeGame("throw new Error('SMOKE_BAD_OUTPUT')");
  var badOut = path.join(badDir, 'out.html');
  fs.writeFileSync(badOut, 'OLD_LAST_KNOWN_GOOD');
  var badSmoke = run([path.join(badDir, 'index.html'), badOut, '--smoke']);
  ok('F1 smoke 失败不覆盖 last-known-good', badSmoke.status === 1 && fs.readFileSync(badOut, 'utf8') === 'OLD_LAST_KNOWN_GOOD' && /本次未更新,旧产物仍在/.test(badSmoke.out), 'status=' + badSmoke.status + ' ' + badSmoke.out.slice(-900));
  ok('F2 smoke 失败清理同目录候选文件', !fs.readdirSync(badDir).some(function (n) { return /\.smoke-.*\.tmp$/.test(n); }), fs.readdirSync(badDir).join(','));

  var loopDir = smokeGame('while(true){}');
  var loopOut = path.join(loopDir, 'out.html');
  var loop = run([path.join(loopDir, 'index.html'), loopOut, '--smoke'], { env: { AMATLAS_SMOKE_TIMEOUT_MS: '300' }, timeout: 3000 });
  ok('F3 同步死循环由 smoke 子进程硬 timeout 收口', loop.status === 1 && !(loop.error && loop.error.code === 'ETIMEDOUT') && /smoke 超时\(300ms\)/.test(loop.out), 'status=' + loop.status + ' err=' + (loop.error && loop.error.code) + ' ' + loop.out.slice(-900));
  ok('F4 smoke 超时无旧产物时不留下坏 canonical output', !fs.existsSync(loopOut) && /本次未写入,目标文件不存在/.test(loop.out), fs.readdirSync(loopDir).join(',') + ' | ' + loop.out.slice(-500));

  try { fs.rmSync(badDir, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(loopDir, { recursive: true, force: true }); } catch (e) {}
})();

// G. D1：<link href> P0 block + 单引号 / 无引号扩展（反向变异 + 防误伤）
// 反向变异锁:G1-G3 在旧实现（P1 warn）下必须红；改为 P0 block 后绿。G4 双边守恒（防误伤:合法全内联仍过）。
(function () {
  function worldJs(id) {
    return "(function(g,f){if(typeof module!=='undefined'&&module.exports)module.exports=f();else g.W=f();})(typeof globalThis!=='undefined'?globalThis:this,function(){return {id:'" + id + "',start:{map:'m',node:'a'},maps:{m:{nodes:{a:{kind:'custom',links:[{label:'回',to:'a'}]}}}}};});\n";
  }

  // G1: <link href="..."> 双引号外链 → D1 后 P0 block（变异:改回 warn 即红）
  var g1Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-link-dq-'));
  fs.writeFileSync(path.join(g1Dir, 'world.js'), worldJs('71717171-7171-4171-8171-717171717171'));
  fs.writeFileSync(path.join(g1Dir, 'index.html'),
    '<!doctype html><head><link rel="icon" href="favicon.ico"></head><body><script src="world.js"></script></body>\n');
  var g1Out = path.join(g1Dir, 'dist', 'index.html');
  var g1 = run([path.join(g1Dir, 'index.html'), g1Out]);
  ok('G1 <link href="favicon.ico"> 双引号外链 → P0 block 退出 1 + 无产物',
    g1.status === 1 && /link href/i.test(g1.out) && !fs.existsSync(g1Out),
    'status=' + g1.status + ' | ' + g1.out.slice(0, 500));
  try { fs.rmSync(g1Dir, { recursive: true, force: true }); } catch (e) {}

  // G2: <link href='...'> 单引号外链 → 旧正则根本不识别；D1 后 P0 block
  var g2Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-link-sq-'));
  fs.writeFileSync(path.join(g2Dir, 'world.js'), worldJs('72727272-7272-4272-8272-727272727272'));
  fs.writeFileSync(path.join(g2Dir, 'index.html'),
    "<!doctype html><head><link rel='icon' href='favicon.ico'></head><body><script src=\"world.js\"></script></body>\n");
  var g2Out = path.join(g2Dir, 'dist', 'index.html');
  var g2 = run([path.join(g2Dir, 'index.html'), g2Out]);
  ok("G2 <link href='favicon.ico'> 单引号外链 → P0 block 退出 1 + 无产物",
    g2.status === 1 && /link href/i.test(g2.out) && !fs.existsSync(g2Out),
    'status=' + g2.status + ' | ' + g2.out.slice(0, 500));
  try { fs.rmSync(g2Dir, { recursive: true, force: true }); } catch (e) {}

  // G3: <link href=...> 无引号外链 → 旧正则根本不识别；D1 后 P0 block
  var g3Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-link-nq-'));
  fs.writeFileSync(path.join(g3Dir, 'world.js'), worldJs('73737373-7373-4373-8373-737373737373'));
  fs.writeFileSync(path.join(g3Dir, 'index.html'),
    '<!doctype html><head><link rel=icon href=favicon.ico></head><body><script src="world.js"></script></body>\n');
  var g3Out = path.join(g3Dir, 'dist', 'index.html');
  var g3 = run([path.join(g3Dir, 'index.html'), g3Out]);
  ok('G3 <link href=favicon.ico> 无引号外链 → P0 block 退出 1 + 无产物',
    g3.status === 1 && /link href/i.test(g3.out) && !fs.existsSync(g3Out),
    'status=' + g3.status + ' | ' + g3.out.slice(0, 500));
  try { fs.rmSync(g3Dir, { recursive: true, force: true }); } catch (e) {}

  // G4: 合法全内联页（本地 stylesheet 已内联为 <style>、无残留 <link href>）→ D1 前后仍过（防误伤）
  var g4Dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amatlas-link-inline-'));
  fs.writeFileSync(path.join(g4Dir, 'world.js'), worldJs('74747474-7474-4474-8474-747474747474'));
  fs.writeFileSync(path.join(g4Dir, 'site.css'), 'body{margin:0}\n');
  fs.writeFileSync(path.join(g4Dir, 'index.html'),
    '<!doctype html><head><link rel="stylesheet" href="site.css"></head><body><script src="world.js"></script></body>\n');
  var g4Out = path.join(g4Dir, 'dist', 'index.html');
  var g4 = run([path.join(g4Dir, 'index.html'), g4Out]);
  var g4Built = fs.existsSync(g4Out) ? fs.readFileSync(g4Out, 'utf8') : '';
  ok('G4 合法全内联页（本地 CSS 已内联为 <style>、无残留 <link href>）→ 仍退出 0（防误伤）',
    g4.status === 0 && fs.existsSync(g4Out) && g4Built.indexOf('<link') === -1,
    'status=' + g4.status + ' | ' + g4.out.slice(0, 400));
  try { fs.rmSync(g4Dir, { recursive: true, force: true }); } catch (e) {}
})();

// 清理本测临时产物(只删自己写的)
try { fs.unlinkSync(goodOut); } catch (e) {}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
