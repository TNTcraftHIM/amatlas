/* ════════════════════════════════════════════════════════════════════════
   把 examples/text-adventure-demo 的模块化 <script src> 内联成单个 HTML。
   ════════════════════════════════════════════════════════════════════════
   用途:① 供 jsdom smoke-test 在单文件上跑;② 预演 S6 构建器的内联思路。
   默认写到系统临时目录(不污染 engine/、不入库/打包);可传出参覆盖。
   用法:node test/inline-demo.cjs [输出路径]
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');

var demoDir = path.join(__dirname, '..', 'examples', 'text-adventure-demo');
var html = fs.readFileSync(path.join(demoDir, 'index.html'), 'utf8');

html = html.replace(/<script src="([^"]+)"><\/script>/g, function (m, src) {
  var p = path.resolve(demoDir, src);
  return '<script>\n' + fs.readFileSync(p, 'utf8') + '\n</script>';
});

var out = process.argv[2] || path.join(os.tmpdir(), 'amatlas-text-adventure-demo.built.html');
fs.writeFileSync(out, html);
var remaining = (html.match(/<script src=/g) || []).length;
console.log('built ' + out + ' (' + html.length + ' bytes, remaining external scripts: ' + remaining + ')');
