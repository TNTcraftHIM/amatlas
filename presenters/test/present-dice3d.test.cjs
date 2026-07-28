/* Amatlas 真 3D d6 可选呈现器 验证 —— 纯 node、零依赖(纯函数 cubeHTML + mock 容器 present + 源码保证)。
   契约见 ../../core/module-interface.md §4.2(dice 元素 kind/ref/sides/state;本呈现器只消费、零契约改动)。 */
const fs = require('fs');
const path = require('path');
const D3 = require('../present-dice3d.js');
const createDice3dPresenter = D3.createDice3dPresenter, cubeHTML = D3.cubeHTML;

let pass = 0, fail = 0;
function ok(n, c) { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n); } }
function count(h, n) { return h.split(n).length - 1; }
function topFace(html) { var m = /a3d-face a3d-top">([\s\S]*?)<\/div>/.exec(html); return m ? m[1] : ''; }

console.log('present-dice3d 验证');

// A. cubeHTML 纯函数:6 面 + 顶面显结果 + 求和数字 + 成败/暴击
(function () {
  var h = cubeHTML(4, 'success');
  ok('A1 立方体 6 面', count(h, 'a3d-face') === 6);
  ok('A2 顶面 = 落定结果(4 → 4 点)', count(topFace(h), 'a3d-pip') === 4);
  ok('A3 成败 state class(a3d-success)', h.indexOf('a3d-cube a3d-success') >= 0);
  ok('A4 求和 >6 → 顶面用数字(9)非点数(单颗立方显示不了 9 点)', (function () { var g = cubeHTML(9, 'fail'); return topFace(g).indexOf('a3d-num">9<') >= 0 && count(topFace(g), 'a3d-pip') === 0; })());
  ok('A5 crit → 金光 halo(a3d-critglow)', cubeHTML(6, 'crit').indexOf('a3d-critglow') >= 0);
})();

// B. present:mock 容器写入 / 清空 / 非 d6 退回 / 求和+暴击
(function () {
  function snap(els) { return { view: { scene: els ? { elements: els } : undefined } }; }
  var mock = { innerHTML: 'X' };
  var p = createDice3dPresenter({ container: mock });
  p.present(snap([{ kind: 'dice', ref: '3', sides: 6, state: 'success' }]));
  ok('B1 d6 检定 → 写入 3D 立方(a3d-cube + 顶面 3 点)', mock.innerHTML.indexOf('a3d-cube') >= 0 && count(topFace(mock.innerHTML), 'a3d-pip') === 3);
  p.present(snap(null));
  ok('B2 无骰子 → 清空 slot(交回 present-svg)', mock.innerHTML === '');
  p.present(snap([{ kind: 'dice', ref: '13', sides: 20, state: 'success' }]));
  ok('B3 非 d6(sides=20)→ 不接管、清空(SVG 切面宝石照旧)', mock.innerHTML === '');
  p.present(snap([{ kind: 'dice', ref: '12', sides: 6, state: 'crit' }]));
  ok('B4 d6 求和 12 + crit → 顶面数字 12 + 金光', topFace(mock.innerHTML).indexOf('a3d-num">12<') >= 0 && mock.innerHTML.indexOf('a3d-critglow') >= 0);
})();

// C. install / 无 slot 退化
(function () {
  var captured = null;
  var p = createDice3dPresenter({ container: { innerHTML: '' } });
  p.install({ addPresenter: function (fn) { captured = fn; } });
  ok('C1 install → addPresenter(present)', captured === p.present);
  var p2 = createDice3dPresenter({});   // 无 container、node 无 document
  ok('C2 无 slot → no-op 不抛(退化为纯 2.5D)', (function () { try { p2.present({ view: { scene: { elements: [{ kind: 'dice', ref: '4', sides: 6 }] } } }); return true; } catch (e) { return false; } })());
})();

// D. 源码保证:真 3D(preserve-3d)+ 由快到慢 + reduced-motion 落定可测
(function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'present-dice3d.js'), 'utf8');
  ok('D1 用 preserve-3d(真 3D,非 SVG 假透视)', src.indexOf('transform-style:preserve-3d') >= 0);
  ok('D2 翻滚 @keyframes(由快到慢 ease-out)', src.indexOf('@keyframes a3d-roll') >= 0 && src.indexOf('cubic-bezier(.1,.82,.16,1)') >= 0);
  ok('D3 reduced-motion 守卫(静止落定,不伤可测)', /prefers-reduced-motion[\s\S]*a3d-cube\{animation:none\}/.test(src));
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
