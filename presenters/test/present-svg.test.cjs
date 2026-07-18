/* Amatlas S8.5 SVG 场景呈现器 验证 —— 纯 node、零依赖(测纯构造器 + mock 容器,不需 jsdom)。
   覆盖:buildSceneSVG 意图→SVG 映射(region/mood/elements/退化/转义)/ createSvgPresenter 容器写入·清空·
        无容器退化·plugin 经 addPresenter 注册。DOM 集成(挂真 DOM、与 dom 呈现器并存)留 -f demo jsdom 烟雾。
   契约见 ../../core/module-interface.md §4.2(scene 已冻结;v9 加 element.art = Preset 名 | art-spec DSL)·§4.6(多呈现器)。 */
const { createSvgPresenter, buildSceneSVG, placeElements } = require('../present-svg.js');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } }
function throws(fn) { try { fn(); return false; } catch (e) { return true; } }
function count(hay, needle) { return hay.split(needle).length - 1; }

console.log('S8.5 present-svg 验证');

// A. buildSceneSVG:基本映射(region→背景色 + 根 <svg> + data-* 钩子)
(function () {
  var s = buildSceneSVG({ region: 'beach' });
  ok('A1 产出 <svg> 根', s.indexOf('<svg') === 0);
  ok('A1b 根 svg 用 height:auto 自算 16:9(永不内部 pillarbox;不依赖容器写死高度;内联 style 压过外部 #scene svg{} 旧 height:100%)', s.indexOf('style="display:block;width:100%;height:auto"') >= 0 && s.indexOf('width="100%" height="100%"') < 0);
  ok('A2 region=beach → 背景色 #e9d8a6', s.indexOf('#e9d8a6') >= 0);
  ok('A3 data-region 钩子', s.indexOf('data-region="beach"') >= 0);
  ok('A4 未知 region("没这个")→ 确定性哈希深色调色板(非旧平灰 #cfd2d6、非 #000;治"无特征灰板"静默降级)', (function () { var s1 = buildSceneSVG({ region: '没这个' }); return s1 === buildSceneSVG({ region: '没这个' }) && s1.indexOf('#cfd2d6') < 0 && s1.indexOf('fill="#000"') < 0 && s1.indexOf('url(#asky)') >= 0; })());
  ok('A4b region 未声明(空 scene)→ 仍中性 #cfd2d6(没声明=不猜)', buildSceneSVG({}).indexOf('#cfd2d6') >= 0);
})();

// B. mood → 色调覆盖
(function () {
  ok('B1 mood=tense → 覆盖色 + data-mood', (function () { var s = buildSceneSVG({ region: 'beach', mood: 'tense' }); return s.indexOf('rgba(170,30,30,.18)') >= 0 && s.indexOf('data-mood="tense"') >= 0; })());
  ok('B2 无 mood → 不加 mood tint(背景渐变 + 地平线 + vignette = 3 rect,无 mood 色覆盖)', count(buildSceneSVG({ region: 'beach' }), '<rect') === 3);  // 表现力升级:vignette 成新基线层(总加),无 mood 仍不加 MOOD_TINT
  ok('B3 表现力升级:region 基色天空渐变(linearGradient#asky 中段保留原色)+ 暗角 vignette(radialGradient#avig)', (function () { var s = buildSceneSVG({ region: 'cave' }); return s.indexOf('<linearGradient id="asky"') >= 0 && s.indexOf('stop-color="#36332e"') >= 0 && s.indexOf('url(#asky)') >= 0 && s.indexOf('<radialGradient id="avig"') >= 0 && s.indexOf('url(#avig)') >= 0; })());
})();

// C. elements → 图元(形状按 kind + 转义的 ref 标签)
(function () {
  var s = buildSceneSVG({ region: 'forest', elements: [ { kind: 'character', ref: 'selene' }, { kind: 'item', ref: 'lantern' } ] });
  ok('C1 character → 默认剪影人影(art:figure 路由:translate g + #aart 融场;告别裸圆占位)', s.indexOf('filter="url(#aart)"') >= 0 && /<g transform="translate\(40,108\)"[^>]*>/.test(s));
  ok('C2 item → rect 图元(连背景/地平线/物品共 ≥3 个 rect)', count(s, '<rect') >= 3);
  ok('C3 两个 ref 标签都画出', s.indexOf('>selene<') >= 0 && s.indexOf('>lantern<') >= 0);
  ok('C4 两个 ref 标签用安全标牌渲染(不再裸贴底 text)', count(s, 'class="amatlas-element-label"') === 2 && count(s, '<text') === 2);
  ok('C5 hazard → 三角 / exit → 门', (function () { var t = buildSceneSVG({ elements: [ { kind: 'hazard' }, { kind: 'exit' } ] }); return t.indexOf('<polygon') >= 0 && t.indexOf('#5b3a1a') >= 0; })());
  var long = buildSceneSVG({ elements: [ { kind: 'item', ref: '超长蓝火潮池标签会出框截断测试' } ] });
  ok('C6 长中文 ref → 两行 tspan + 省略号', count(long, '<tspan') === 2 && long.indexOf('…') >= 0);
  ok('C7 长 ref 标牌上提到底部安全区(y≤112,底板也在 viewBox 内)', (function () {
    var tm = /<text x="([\d.]+)" y="([\d.]+)"/.exec(long);
    var rm = /class="amatlas-element-label"><rect x="([\d.]+)" y="([\d.]+)" width="(\d+)" height="(\d+)"/.exec(long);
    if (!tm || !rm) return false;
    var y = parseFloat(tm[2]), rx = parseFloat(rm[1]), ry = parseFloat(rm[2]), rw = parseFloat(rm[3]), rh = parseFloat(rm[4]);
    return y <= 112 && rx >= 0 && rx + rw <= 320 && ry >= 0 && ry + rh <= 180;
  })());
  var many = buildSceneSVG({ elements: [ { kind: 'item', ref: '左侧超长标签' }, { kind: 'item', ref: '中间超长标签' }, { kind: 'item', ref: '右侧超长标签' } ] });
  ok('C8 多物件 ref 标牌 x 夹在安全区内(无负 x、无超出 320 的底板)', (function () {
    var okAll = true;
    many.replace(/class="amatlas-element-label"><rect x="([\d.]+)" y="([\d.]+)" width="(\d+)"/g, function (_, x, y, w) {
      x = parseFloat(x); w = parseFloat(w); if (x < 0 || x + w > 320 || parseFloat(y) < 0) okAll = false; return _;
    });
    return okAll && count(many, 'class="amatlas-element-label"') === 3;
  })());
})();

// D. 退化 + 转义
(function () {
  ok('D1 无 scene(undefined)→ 空串(退化:不画)', buildSceneSVG(undefined) === '');
  ok('D2 scene 非对象 → 空串', buildSceneSVG('beach') === '' && buildSceneSVG(null) === '');
  ok('D3 空 scene 对象 {} → 仍画默认背景(有 <svg>)', buildSceneSVG({}).indexOf('<svg') === 0);
  var hacked = buildSceneSVG({ elements: [ { kind: 'character', ref: '<x>&"' } ] });
  ok('D4 ref 转义:无裸 <x>', hacked.indexOf('<x>') === -1);
  ok('D5 ref 转义:有 &lt;x&gt;', hacked.indexOf('&lt;x&gt;') >= 0);
})();

// E. createSvgPresenter:写入 mock 容器 / 清空 / 无容器退化
(function () {
  var mock = { innerHTML: 'INIT' };
  var p = createSvgPresenter({ container: mock });
  p.present({ view: { scene: { region: 'beach' } } });
  ok('E1 present 写入容器(含 <svg> + beach 色)', mock.innerHTML.indexOf('<svg') >= 0 && mock.innerHTML.indexOf('#e9d8a6') >= 0);
  p.present({ view: {} });   // 当前节点无 scene
  ok('E2 无 scene → 容器清空(不残留上一场景)', mock.innerHTML === '');
  ok('E3 present(null) 不抛(健壮)', !throws(function () { p.present(null); }) && mock.innerHTML === '');
  var p2 = createSvgPresenter({});   // 无 document、无 container
  ok('E4 无容器 → no-op 不抛(退化为纯文字)', !throws(function () { p2.present({ view: { scene: { region: 'cave' } } }); }));
})();

// F. install:经 use→addPresenter 注册(用假 api 捕获)
(function () {
  var captured = null;
  var fakeApi = { addPresenter: function (fn) { captured = fn; } };
  var p = createSvgPresenter({ container: { innerHTML: '' } });
  p.install(fakeApi);
  ok('F1 install 调 addPresenter 注册 present', captured === p.present);
})();

// G. dice 字形(S9 additive):骰面 + 成败着色;不破坏既有 kind 与未知→circle 退化
(function () {
  var s = buildSceneSVG({ elements: [ { kind: 'dice', ref: '13', state: 'success' } ] });   // ref 取不在 REEL 噪声序列中的值,便于断言真值唯一
  ok('G1 dice → 圆角方块骰子(rx)', s.indexOf('rx="5"') >= 0);
  ok('G2 骰面真值 ref 画出', s.indexOf('>13<') >= 0);
  ok('G3 state=success → 绿色填充', s.indexOf('#3a7d44') >= 0);
  ok('G4 state=fail → 红色填充', buildSceneSVG({ elements: [ { kind: 'dice', ref: '5', state: 'fail' } ] }).indexOf('#9e2a2b') >= 0);
  ok('G5 真值 ref 只出现一次(在 .amatlas-die-face,非卷轴噪声)', count(s, '>13<') === 1);
  ok('G6 未知 kind 仍退化为 circle(既有行为不破)', buildSceneSVG({ elements: [ { kind: '没这个' } ] }).indexOf('<circle') >= 0);
  ok('G7 既有 kind 混排不受影响(character→默认人影 + dice 仍骰子)', (function () { var m = buildSceneSVG({ elements: [ { kind: 'character', ref: 'x' }, { kind: 'dice', ref: '7' } ] }); return m.indexOf('url(#aart)') >= 0 && m.indexOf('amatlas-die') >= 0; })());
  // G8-G12. round7 立体翻滚 + 数字卷轴滚动减速定格(用户要"摇数字越来越慢最后固定");resting=真值(reduced-motion/probe 直接见结果)
  ok('G8 dice 注入翻滚+卷轴动画 CSS(@keyframes amatlas-die-tumble + reel)', s.indexOf('amatlas-die-tumble') >= 0 && s.indexOf('amatlas-die-reel') >= 0);
  ok('G9 骰子包在 .amatlas-die 组、真值在 .amatlas-die-face', /<g class="amatlas-die">/.test(s) && /class="amatlas-die-face"[^>]*>13</.test(s));
  ok('G10 数字卷轴存在(.amatlas-die-reel + 噪声数字滚动)', /class="amatlas-die-reel"/.test(s) && s.indexOf('>7<') >= 0);
  ok('G11 reduced-motion 守卫:卷轴落到最终值(.amatlas-die-reel{transform:translateY(0)}、动画 none)', /prefers-reduced-motion[\s\S]*amatlas-die-reel\{transform:translateY\(0\)\}/.test(s));
  ok('G12 无 dice 的场景不注入骰子动画 CSS(保旧场景字节不变)', buildSceneSVG({ elements: [ { kind: 'character', ref: 'x' } ] }).indexOf('amatlas-die-tumble') < 0);
  // G13-G20. Phase 3(契约 v7):sides → 骰形 + 暴击/大失败特效。sides 缺省仍走方块(向后兼容:见 G1/G17)
  var cube = buildSceneSVG({ elements: [ { kind: 'dice', ref: '13', sides: 6, state: 'success' } ] });
  ok('G13 sides=6 → 等距立方(≥3 个 polygon 面=三面明度立体)+ data-sides="6"', count(cube, '<polygon') >= 3 && cube.indexOf('data-sides="6"') >= 0);
  ok('G14 立方仍保留卷轴真值机制(.amatlas-die-reel + 真值恰一次)', /class="amatlas-die-reel"/.test(cube) && count(cube, '>13<') === 1);
  var hexa = buildSceneSVG({ elements: [ { kind: 'dice', ref: '20', sides: 20, state: 'success' } ] });
  ok('G15 sides=20 → 切面宝石(<g.amatlas-die-box> + ≥6 棱面 polygon)+ data-sides="20"', hexa.indexOf('data-sides="20"') >= 0 && /<g class="amatlas-die-box">/.test(hexa) && count(hexa, '<polygon') >= 6);
  var tri = buildSceneSVG({ elements: [ { kind: 'dice', ref: '3', sides: 4, state: 'fail' } ] });
  ok('G16 sides=4 → 切面三角宝石(<g.amatlas-die-box> + ≥3 棱面)+ data-sides="4"', /<g class="amatlas-die-box">/.test(tri) && count(tri, '<polygon') >= 3 && tri.indexOf('data-sides="4"') >= 0);
  ok('G17 sides 缺省 → 仍圆角方块、无 data-sides(向后兼容,与 G1 同源)', s.indexOf('rx="5"') >= 0 && s.indexOf('data-sides') < 0);
  var crit = buildSceneSVG({ elements: [ { kind: 'dice', ref: '12', sides: 6, state: 'crit' } ] });
  ok('G18 state=crit → 金光特效(.amatlas-die-crit + 金色 #f6c945)', /class="amatlas-die-crit"/.test(crit) && crit.indexOf('#f6c945') >= 0);
  var fumble = buildSceneSVG({ elements: [ { kind: 'dice', ref: '2', sides: 6, state: 'fumble' } ] });
  ok('G19 state=fumble → 红裂特效(.amatlas-die-fumble + 暗红 #5a0d10)', /class="amatlas-die-fumble"/.test(fumble) && fumble.indexOf('#5a0d10') >= 0);
  ok('G20 crit/fumble/shadow 纳入 reduced-motion 守卫(动画 none)', /\.amatlas-die-crit,\.amatlas-die-fumble,\.amatlas-die-shadow\{animation:none\}/.test(crit));
  ok('G21 着地感:有地面投影 .amatlas-die-shadow + tumble 含垂直掉落 translateY(-(非"吊空中摇")', s.indexOf('amatlas-die-shadow') >= 0 && /amatlas-die-tumble\{[^}]*translateY\(-/.test(s));
  ok('G22 切面宝石含顶面(最亮)+ 外轮廓(fill=none 描边)→ 立体棱面', hexa.indexOf('fill="none" stroke="#222"') >= 0);
  ok('G23 数字用描边光晕(paint-order:stroke 白字深 halo)浮于骰面、无底盘圆(优雅,调研 paint-order>plate)', s.indexOf('paint-order="stroke"') >= 0 && s.indexOf('<circle') < 0);
  // GX. 注入闸(R2 二轮 P0):dice.sides 契约是正整数,曾原样拼进 data-sides 属性 → 属性型 XSS(同分支兄弟 region/mood/ref 都过 esc、唯 sides 裸拼)。反向变异两端锁。
  function throwsSides(sides) { try { buildSceneSVG({ elements: [ { kind: 'dice', ref: '1', state: 'rolling', sides: sides } ] }); return false; } catch (e) { return true; } }
  ok('GX1 sides 含注入 payload(引号闭合+onmouseover)→ 抛,不逃逸进 data-sides 属性', throwsSides('6" onmouseover="alert(1)'));
  ok('GX2 sides 非正整数(3.7 / 字符串"6" / 0 / -1)一律抛(契约=正整数)', throwsSides(3.7) && throwsSides('6') && throwsSides(0) && throwsSides(-1));
  ok('GX3 合法整数 sides 仍渲染 data-sides(反向变异:别误伤;整数无注入字符)', buildSceneSVG({ elements: [ { kind: 'dice', ref: '1', sides: 8 } ] }).indexOf('data-sides="8"') >= 0);
  ok('GX4 同族兄弟 region/mood/ref 的引号被 esc 成 &quot;(接缝另一端已锁,注入串不逃逸)', (function () { var m = buildSceneSVG({ region: 'a"x', mood: 'b"y', elements: [ { kind: 'dice', ref: '9"z', sides: 6 } ] }); return m.indexOf('a"x') < 0 && m.indexOf('b"y') < 0 && m.indexOf('9"z') < 0 && m.indexOf('&quot;') >= 0; })());
  ok('G24 卷轴用 clipPath 几何裁剪(不依赖 svg overflow/viewport;免疫作者 #scene svg{height:auto} 一刀切致候选溢出;真机实测)', /<clipPath id="arc\d+_\d+"><rect x="0" y="208" width="26" height="26"\/><\/clipPath><g clip-path="url\(#arc\d+_\d+\)"><g class="amatlas-die-reel">/.test(s));
  ok('G25 >5 骰防溢出:6 骰全部 cx≤W-28=292(>5 压缩间距入 320 幅;变异=cxd 退回 40+slot*60→第6骰 cx=340>292 稳定红)', (function () {
    var s6 = buildSceneSVG({ elements: [
      { kind: 'dice', ref: '1' }, { kind: 'dice', ref: '2' }, { kind: 'dice', ref: '3' },
      { kind: 'dice', ref: '4' }, { kind: 'dice', ref: '5' }, { kind: 'dice', ref: '6' } ] });
    var m = s6.match(/amatlas-die-shadow" cx="(\d+(?:\.\d+)?)"/g) || [];
    return m.length === 6 && m.every(function (x) { return parseFloat(x.match(/cx="([\d.]+)"/)[1]) <= 292; });
  })());
  ok('G26 ≤5 骰字节恒等:5 骰首骰 cx=40 末骰 cx=280(diceStep=60、clamp 不触发;PL9 同源向后兼容)', (function () {
    var s5 = buildSceneSVG({ elements: [
      { kind: 'dice', ref: '1' }, { kind: 'dice', ref: '2' }, { kind: 'dice', ref: '3' },
      { kind: 'dice', ref: '4' }, { kind: 'dice', ref: '5' } ] });
    return s5.indexOf('amatlas-die-shadow" cx="40"') >= 0 && s5.indexOf('amatlas-die-shadow" cx="280"') >= 0;
  })());
})();

// H. eyes 图元(S10 additive):眨眼/渗血动画 + 数量/全屏 + 不破旧场景字节
(function () {
  var w = buildSceneSVG({ region: 'night', mood: 'dread', elements: [ { kind: 'eyes', state: 'watching', ref: '3' } ] });
  ok('H1 watching eyes → 注入眨眼动画 CSS(@keyframes amatlas-blink)', w.indexOf('@keyframes amatlas-blink') >= 0);
  ok('H2 eyes → 眼白椭圆 + SMIL 瞳孔游移 + 眼睑', w.indexOf('<ellipse') >= 0 && w.indexOf('<animate attributeName="cx"') >= 0 && w.indexOf('class="amatlas-lid"') >= 0);
  ok('H3 ref=3 → 画 3 只眼(3 个 ellipse)', count(w, '<ellipse') === 3);
  var b = buildSceneSVG({ region: 'night', mood: 'horror-climax', elements: [ { kind: 'eyes', state: 'bleeding', ref: 'fullscreen' } ] });
  ok('H4 bleeding → 渗血(#9e2a2b + amatlas-drip)且无眨眼睑(凝视)', b.indexOf('class="amatlas-drip"') >= 0 && b.indexOf('#9e2a2b') >= 0 && b.indexOf('class="amatlas-lid"') === -1);
  ok('H5 fullscreen 巨眼=1 只 ellipse(占画幅中心)', count(b, '<ellipse') === 1);
  ok('H6 eyes 不画底部 ref 文字标签(无 >fullscreen<)', b.indexOf('>fullscreen<') === -1);
  ok('H7 无 eyes 的场景不注入动画 CSS(保旧场景字节不变)', buildSceneSVG({ region: 'beach' }).indexOf('@keyframes') === -1);
  ok('H8 dread / horror-climax mood → 色调覆盖', buildSceneSVG({ region: 'night', mood: 'dread' }).indexOf('rgba(20,0,0,.30)') >= 0 && b.indexOf('rgba(120,0,0,.34)') >= 0);

  // ── 渗血巨眼恐怖升级(阶段90):充血血丝/瞳孔骤扩 SMIL/多股血泪/不对称;全 additive 锁定新行为(红队 must-fix)──
  var b3 = buildSceneSVG({ region: 'night', mood: 'horror-climax', elements: [ { kind: 'eyes', state: 'bleeding', ref: '3' } ] });
  ok('H9 充血血丝/血泪不引入 ellipse:bleeding fullscreen 仍唯一白睛 ellipse、ref=3 bleeding 仍 3(锁 H5/H3 不被升级破)', count(b, '<ellipse') === 1 && count(b3, '<ellipse') === 3);
  ok('H10 瞳孔骤缩→骤扩 SMIL(animate r + keySplines)且无字面 #000', b.indexOf('<animate attributeName="r"') >= 0 && b.indexOf('keySplines=') >= 0 && b.indexOf('fill="#000"') < 0);
  ok('H11 多股血泪:fullscreen bleeding ≥3 条 class="amatlas-drip" 且无 amatlas-lid(凝视)', count(b, 'class="amatlas-drip"') >= 3 && b.indexOf('class="amatlas-lid"') === -1);
  ok('H12 充血血丝=派生暗红 path(非 #000)、有 stroke-opacity 分层', b.indexOf('<path d="M') >= 0 && b.indexOf('stroke-opacity=') >= 0 && b.indexOf('fill="#000"') < 0);
  ok('H13 确定性:同 region/mood 两次 bleeding 巨眼字节相同(种子 PRNG,非 Math.random)',
    buildSceneSVG({ region: 'night', mood: 'horror-climax', elements: [ { kind: 'eyes', state: 'bleeding', ref: 'fullscreen' } ] }) === b);
  ok('H14 多眼 seed 去相位:ref=2 bleeding 两眼血丝序列不同(非偶然撞同序列)', (function () {
    var two = buildSceneSVG({ region: 'night', mood: 'horror-climax', elements: [ { kind: 'eyes', state: 'bleeding', ref: '2' } ] });
    var eyes = two.split('<g class="amatlas-eye">'); return eyes.length === 3 && eyes[1] !== eyes[2];
  })());

  // ── watching 多眼恐怖升级(阶段91):异质景深 + 扫视盯人 + catchlight + 眨眼错相;additive 锁新行为(治"三眼一般")──
  var w3 = buildSceneSVG({ region: 'night', mood: 'dread', elements: [ { kind: 'eyes', state: 'watching', ref: '3' } ] });
  function eyeSegs(svg) { return svg.split('<g class="amatlas-eye"').slice(1); }
  ok('H15 watching 异质:ref=3 三眼 ellipse rx 不全相同(不同距离的窥视者,非全同尺寸)', (function () {
    var rxs = eyeSegs(w3).map(function (seg) { var m = seg.match(/rx="([\d.]+)"/); return m ? m[1] : null; });
    return rxs.length === 3 && new Set(rxs).size >= 2;
  })());
  ok('H16 扫视=弹道跳变(watching 含 calcMode="discrete" + <animate attributeName="cx",非平滑正弦)', w3.indexOf('calcMode="discrete"') >= 0 && w3.indexOf('<animate attributeName="cx"') >= 0);
  ok('H17 catchlight 活眼:watching 每 amatlas-eye 段 ≥2 个 <circle(瞳孔+高光)且无字面 #000', (function () {
    var segs = eyeSegs(w3); return segs.length === 3 && segs.every(function (s) { return (s.split('<circle').length - 1) >= 2; }) && w3.indexOf('fill="#000"') < 0;
  })());
  ok('H18 watching 确定性:同 region/mood 两次 build 字节相同(种子 PRNG)',
    buildSceneSVG({ region: 'night', mood: 'dread', elements: [ { kind: 'eyes', state: 'watching', ref: '3' } ] }) === w3);
  ok('H19 眨眼/扫视错相:watching ≥2 个不同 begin="-" 负偏移(非同步=杀头号 uncanny)', (function () {
    var bs = (w3.match(/begin="(-[\d.]+s)"/g) || []); return bs.length >= 3 && new Set(bs).size >= 2;
  })());
})();

// I. letterbox 图元(S10):上下黑边、置于 tint 之上、不占行内 slot
(function () {
  var s = buildSceneSVG({ region: 'night', mood: 'horror-climax', elements: [ { kind: 'letterbox' } ] });
  ok('I1 letterbox → 上下两条黑边(2 个 fill="#000")', count(s, 'fill="#000"') === 2);
  ok('I2 letterbox 黑边置于 tint 之上(顺序在 mood 覆盖之后)', s.indexOf('fill="#000"') > s.indexOf('rgba(120,0,0,.34)'));
  var r = buildSceneSVG({ elements: [ { kind: 'letterbox' }, { kind: 'character', ref: 'x' } ] });
  ok('I3 letterbox 不占行内 slot(character 仍在首位 cx=40)', r.indexOf('cx="40"') >= 0);
})();

// J. transition 过场(createSvgPresenter):按"节点变了"放一次,纯动作不重放,cut 不放(挑战 §10.2-Q3)
(function () {
  function mockEl() { var L = []; return { innerHTML: '', classList: { add: function (c) { L.push(c); }, remove: function (c) { var i = L.indexOf(c); if (i >= 0) L.splice(i, 1); }, has: function (c) { return L.indexOf(c) >= 0; }, list: L } }; }
  var el = mockEl(); var p = createSvgPresenter({ container: el });   // 无 document → ensureFxStyles no-op,但 class 仍加(可断言)
  p.present({ view: { scene: { region: 'night', transition: 'slam' } }, pos: { map: 'descent', node: 'beyond' } });
  ok('J1 进新节点 slam → 容器加 amatlas-fx-slam', el.classList.has('amatlas-fx-slam'));
  var len1 = el.classList.list.length;
  p.present({ view: { scene: { region: 'night', transition: 'slam' } }, pos: { map: 'descent', node: 'beyond' } });   // 同节点 re-render(纯动作)
  ok('J2 同节点 re-render 不重放(无新增 class)', el.classList.list.length === len1);
  var el2 = mockEl(); createSvgPresenter({ container: el2 }).present({ view: { scene: { region: 'night', transition: 'cut' } }, pos: { map: 'descent', node: 'consumed' } });
  ok('J3 cut=直切 → 不加过场 class', el2.classList.list.length === 0);
  var el3 = mockEl(); var p3 = createSvgPresenter({ container: el3 });
  p3.present({ view: { scene: { region: 'room', transition: 'fade' } }, pos: { map: 'descent', node: 'waking' } });
  p3.present({ view: { scene: { region: 'night', transition: 'fade' } }, pos: { map: 'descent', node: 'corridor' } });   // 连续同值 fade,但节点变了
  ok('J4 连续两个同值 fade、节点变 → 各触发一次(=2,挑战 §10.2-Q3 的"值变才触发")', el3.classList.list.length === 2);
  var el4 = mockEl(); createSvgPresenter({ container: el4 }).present({ view: { scene: { region: 'beach' } }, pos: { map: 'm', node: 'n' } });
  ok('J5 无 transition → 不加 fx class', el4.classList.list.length === 0);
})();

// K. 程序化剪影构图(表现力升级 A4):region→地形/建筑剪影 path、确定性可测、室内/未知不画、背景层顺序
(function () {
  ok('K1 户外 region(forest)→ 画地形剪影(<path> 轮廓)', buildSceneSVG({ region: 'forest' }).indexOf('<path') >= 0);
  ok('K2 各户外 region 均有剪影(cave/town/sea/night/beach/ruins)', ['cave', 'town', 'sea', 'night', 'beach', 'ruins'].every(function (r) { return buildSceneSVG({ region: r }).indexOf('<path') >= 0; }));
  ok('K3 室内 region(room)→ 不画地形剪影(无 <path>)', buildSceneSVG({ region: 'room' }).indexOf('<path') < 0);
  ok('K4 未知 region / 空 scene → 不画剪影(无 <path>;保旧"无 region"场景零影响)', buildSceneSVG({ region: '没这个' }).indexOf('<path') < 0 && buildSceneSVG({}).indexOf('<path') < 0);
  ok('K5 确定性:同 scene 两次构造字节完全相同(纯函数 + 内置 PRNG,seed 从 region+mood)', buildSceneSVG({ region: 'cave', mood: 'dread' }) === buildSceneSVG({ region: 'cave', mood: 'dread' }));
  ok('K6 剪影是背景远景层:<path> 早于 y="126" 地平线矩形(角色图元盖其上)', (function () { var s = buildSceneSVG({ region: 'forest' }); return s.indexOf('<path') < s.indexOf('y="126"'); })());
  ok('K7 剪影只用 path:night 仍 3 rect(不引入 rect)+ fill 派生深色不写字面 #000(保 B2/I1)', (function () { var s = buildSceneSVG({ region: 'night' }); return count(s, '<rect') === 3 && s.indexOf('fill="#000"') < 0; })());
  // K8-K10 C09 表现力升级:有机地形(山/树/波)贝塞尔笔触 + 最近层顶缘受光(确定性、不破计数、不写 #000)
  ok('K8 有机地形剪影用贝塞尔平滑(<path d 含 Q 命令,非纯折线 L;beach=山脊)', /<path d="M[^"]*Q[^"]*"/.test(buildSceneSVG({ region: 'beach' })));
  ok('K9 最近层顶缘受光 stroke(fill="none" + 派生提亮 stroke、不写 #000;forest=树线)', (function () { var s = buildSceneSVG({ region: 'forest' }); return s.indexOf('fill="none" stroke="#') >= 0 && s.indexOf('fill="#000"') < 0; })());
  ok('K10 C09 不破计数/确定性:beach 仍 3 rect(rim 是 path 非 rect)+ 同 scene 两次字节相同', count(buildSceneSVG({ region: 'beach' }), '<rect') === 3 && buildSceneSVG({ region: 'beach' }) === buildSceneSVG({ region: 'beach' }));
  // K11-K15. 视觉批1-V1(docs/gameplay-expressiveness-plan.md §二 V1):剪影远层大气透视色相分量(远层偏冷降饱和、近层不动)
  //   #rrggbb → [h,s,l](0-360/0-1/0-1);非 hex → null(与 Q 段 hueOf 同构,段内独立小工具,不跨段共享)
  function hslOf(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return null;
    var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0, s = 0, l = (mx + mn) / 2;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  // 按出现顺序取剪影 path 的 fill hex(远层先画、近层后画——与 silMountains 等函数内 far/near 推 push 顺序一致)
  function silFills(svg) { var out = []; svg.replace(/<path d="M[^"]*" fill="(#[0-9a-f]{6})"/g, function (_, h) { out.push(h); return _; }); return out; }
  ok('K11 room/未知/空 scene 剪影字节不变(V1 的 coolFar 只在 silMountains/silDunes/silTrees/silWaves/silTowers/silClouds 内部调用,这些函数只在已知户外 region 才被 buildSilhouette 派发;room/未知/空 → buildSilhouette 提前 return "" 从未进入这些函数 → 天然零影响,与 K3/K4 同证据)', buildSceneSVG({ region: 'room' }).indexOf('<path') < 0 && buildSceneSVG({ region: '没这个' }).indexOf('<path') < 0 && buildSceneSVG({}).indexOf('<path') < 0);
  // 两色相(0-360°)最短有符号夹角,归一到 (-180,180](标准公式;避免 0°/360° 环绕误判 —— 此前一版用错公式恒落
  //   在 ±165-180° 附近、看似"有差"实为归一化 bug,已修正并重新核验全部区域数值,见本轮 deviations)
  function hueSignedDelta(a, b) { var d = (a - b + 180) % 360; if (d < 0) d += 360; return d - 180; }
  ok('K12 远冷:覆盖全部 6 个有远近深度概念的剪影族(mountains/beach·night·snowfield·volcano 复用它、dunes/desert、trees/forest·swamp 复用它、waves/sea、towers/town·ruins 复用它、clouds/skyclouds)——远层(第 1 层)与近层(第 2 层)色相差达可感阈值(≥8°,近层未动、故此差即 coolFar 贡献;实测各族落在 10.3-16.0°,阈值 8° 与 K13 cave 天然噪声-5° 之间留足余量);silCave(cave region)故意排除——石笋/钟乳石是顶/底而非远/近,无深度概念,V1 未改动它', (function () {
    var regions = ['beach', 'desert', 'forest', 'sea', 'town', 'skyclouds'];   // 各代表 mountains/dunes/trees/waves/towers/clouds 六族
    return regions.every(function (r) {
      var fills = silFills(buildSceneSVG({ region: r }));
      if (fills.length < 2) return false;
      var far = hslOf(fills[0]), near = hslOf(fills[1]);
      return Math.abs(hueSignedDelta(far[0], near[0])) >= 8;
    });
  })());
  ok('K12b 远层降饱和:同一 region 的远层 fill(经 coolFar)饱和度低于"若未叠加 V1、仅走 shade() 本会得到的值"(直接对比 coolFar 前后,不与 near 层交叉比较——near 层饱和度由 shade() 独立决定、不构成可靠对照基线,见 K12 变异排查记录)', (function () {
    // 逐区还原 coolFar 前的远层 hex(=shade(bg, farAmt),数值取自源码各 sil* 函数远层 amt),与 buildSceneSVG 实际产出的远层 hex 对比饱和度
    function shadeLocal(hex, amt) {
      var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
      function ch(h) { var v = parseInt(h, 16); v = amt >= 0 ? v + (255 - v) * amt : v * (1 + amt); v = Math.max(0, Math.min(255, Math.round(v))); return ('0' + v.toString(16)).slice(-2); }
      return '#' + ch(m[1]) + ch(m[2]) + ch(m[3]);
    }
    var cases = [   // [region, 基色hex, 远层 shade amt(与源码 sil* 函数一致)]
      ['beach', '#e9d8a6', -0.30], ['desert', '#cf8b3a', -0.24], ['forest', '#386641', -0.22],
      ['sea', '#1d6a8f', -0.18], ['town', '#9aa0a6', -0.34], ['skyclouds', '#5b9bd5', 0.30]
    ];
    return cases.every(function (c) {
      var region = c[0], baseHex = c[1], farAmt = c[2];
      var fills = silFills(buildSceneSVG({ region: region }));
      if (!fills.length) return false;
      var actualFar = hslOf(fills[0]);
      var preV1Far = hslOf(shadeLocal(baseHex, farAmt));
      return actualFar[1] < preV1Far[1] - 1e-6;   // 严格降饱和(FAR_SAT_SCALE<1 恒使饱和度下降,除非原饱和度已为 0)
    });
  })());
  ok('K13 silCave(cave region)不受 V1 影响:钟乳石/石笋两层色相差(实测 -5°,来自 shade() 在低饱和 cave 基色上不同明度 amt 的量化噪声)低于 K12 门槛(无深度概念,V1 有意不碰,两层从未走 coolFar)', (function () {
    var fills = silFills(buildSceneSVG({ region: 'cave' }));
    if (fills.length < 2) return false;
    var top = hslOf(fills[0]), bottom = hslOf(fills[1]);
    return Math.abs(hueSignedDelta(top[0], bottom[0])) < 8;   // 严格 < K12 门槛(≥8°)——证明 cave 两层色相差不构成"可感冷暖分量"
  })());
  ok('K14 确定性:V1 后含剪影场景两次构造字节仍相同(coolFar 纯 hex 数学、不消费 rng,同 K5)', buildSceneSVG({ region: 'beach', mood: 'calm' }) === buildSceneSVG({ region: 'beach', mood: 'calm' }));
  ok('K15 V1 不扰 rng 消耗顺序:含 V1 剪影的完整场景图元计数不受影响 —— beach 仍 3 rect(K10 已验)、night 仍 3 rect(K7 已验)双重锁存', count(buildSceneSVG({ region: 'beach' }), '<rect') === 3 && count(buildSceneSVG({ region: 'night' }), '<rect') === 3);
})();

// L. 氛围点缀(表现力升级:辉光 + 星/月/萤火/矿物/窗光/波光,挽歌样例 generateXxxArt + 调研 V4/V7)
(function () {
  ok('L1 night → 星空(暖白 circle #d8d0c0)', buildSceneSVG({ region: 'night' }).indexOf('fill="#d8d0c0"') >= 0);
  ok('L2 forest → 林间萤火(发光色 #c8f0a8 + 同心圆外淡圈 opacity="0.07")', (function () { var s = buildSceneSVG({ region: 'forest' }); return s.indexOf('#c8f0a8') >= 0 && s.indexOf('opacity="0.07"') >= 0; })());
  ok('L3 cave → 发光矿物(紫 #9a7ad8 或蓝 #6aa6d8)', (function () { var s = buildSceneSVG({ region: 'cave' }); return s.indexOf('#9a7ad8') >= 0 || s.indexOf('#6aa6d8') >= 0; })());
  ok('L4 town → 窗户暖光(#f0b860)', buildSceneSVG({ region: 'town' }).indexOf('#f0b860') >= 0);
  ok('L5 室内/未知 region 不加点缀(room 无萤火/矿物/窗光专属色)', (function () { var s = buildSceneSVG({ region: 'room' }); return s.indexOf('#c8f0a8') < 0 && s.indexOf('#9a7ad8') < 0 && s.indexOf('#f0b860') < 0; })());
  ok('L6 辉光滤镜条件一致:用了 url(#aglow) ⟺ 注入 <filter id="aglow">(无月则两者皆无,保字节)', (function () { var s = buildSceneSVG({ region: 'night', mood: 'eerie' }); return (s.indexOf('url(#aglow)') >= 0) === (s.indexOf('<filter id="aglow"') >= 0); })());
  ok('L7 点缀不破既有计数:night 不引入 ellipse(保 H3/H5)、不写字面 #000(保 I1)', (function () { var s = buildSceneSVG({ region: 'night' }); return s.indexOf('<ellipse') < 0 && s.indexOf('fill="#000"') < 0; })());
  ok('L8 确定性:含点缀场景两次构造字节相同(种子 PRNG)', buildSceneSVG({ region: 'cave', mood: 'eerie' }) === buildSceneSVG({ region: 'cave', mood: 'eerie' }));
})();

// M. 动态氛围(表现力升级:SMIL 让点缀"活"——星闪/萤火飘/矿物·窗光·波光脉动/辉光呼吸;克制、停止态可见、非 @keyframes 保 H7)
(function () {
  ok('M1 night 星空 SMIL 缓慢明灭(<animate attributeName="opacity">)', buildSceneSVG({ region: 'night' }).indexOf('<animate attributeName="opacity"') >= 0);
  ok('M2 forest 萤火沿路径飘(animateMotion + calcMode="spline" 变速)', (function () { var s = buildSceneSVG({ region: 'forest' }); return s.indexOf('<animateMotion') >= 0 && s.indexOf('calcMode="spline"') >= 0; })());
  ok('M3 辉光呼吸:用了辉光(月)则 feGaussianBlur animate stdDeviation', (function () { var s = buildSceneSVG({ region: 'night', mood: 'eerie' }); return (s.indexOf('url(#aglow)') >= 0) ? (s.indexOf('attributeName="stdDeviation"') >= 0) : true; })());
  ok('M4 cave 矿物 / town 窗光脉动(<animate opacity>)', buildSceneSVG({ region: 'cave' }).indexOf('<animate attributeName="opacity"') >= 0 && buildSceneSVG({ region: 'town' }).indexOf('<animate attributeName="opacity"') >= 0);
  ok('M5 动态用 SMIL 非 CSS @keyframes → beach 仍无 @keyframes(保 H7、保旧场景)', buildSceneSVG({ region: 'beach' }).indexOf('@keyframes') < 0);
  ok('M6 确定性:含动画场景两次构造字节相同(动画参数全 PRNG、非 Math.random)', buildSceneSVG({ region: 'forest', mood: 'calm' }) === buildSceneSVG({ region: 'forest', mood: 'calm' }));
  ok('M7 室内/未知仍无点缀(room 无 animate)', buildSceneSVG({ region: 'room' }).indexOf('<animate') < 0);
})();

// N. 流动雾(表现力升级 B1:feTurbulence fractalNoise + animate baseFrequency;氛围 mood 条件注入、确定性、不破计数)
(function () {
  var f = buildSceneSVG({ region: 'cave', mood: 'eerie' });
  ok('N1 氛围 mood(eerie)→ 注入 feTurbulence 雾滤镜(<filter id="afog">)', f.indexOf('<feTurbulence') >= 0 && f.indexOf('id="afog"') >= 0);
  ok('N2 雾流动:animate baseFrequency(SMIL,非 @keyframes)', f.indexOf('attributeName="baseFrequency"') >= 0);
  ok('N3 雾单色化:feColorMatrix(噪声→固定雾色 + alpha 疏密)', f.indexOf('<feColorMatrix') >= 0);
  ok('N4 雾承载 rect:fill="#fff"(非字面 #000)+ filter="url(#afog)"(保 I1/K7)', f.indexOf('fill="#fff" filter="url(#afog)"') >= 0);
  ok('N5 非雾 mood(calm)→ 不注入雾(保字节)', buildSceneSVG({ region: 'cave', mood: 'calm' }).indexOf('id="afog"') < 0);
  ok('N6 无 mood → 不注入雾(保 B2/K7 无 mood 精确计数)', buildSceneSVG({ region: 'cave' }).indexOf('<feTurbulence') < 0);
  ok('N7 horror-climax 不加雾(让恐怖高潮巨眼清晰、零交互保 I1)', buildSceneSVG({ region: 'night', mood: 'horror-climax' }).indexOf('id="afog"') < 0);
  ok('N8 雾确定性:同 scene 两次字节相同(feTurbulence 固定 seed)', buildSceneSVG({ region: 'cave', mood: 'dread' }) === buildSceneSVG({ region: 'cave', mood: 'dread' }));
  ok('N9 雾 mood-gated 不破无 mood 计数:beach 无 mood 仍 3 rect', count(buildSceneSVG({ region: 'beach' }), '<rect') === 3);
  ok('N10 雾不引入 ellipse / 不写字面 #000:cave+dread 无 ellipse、无 #000(保 H/I/K)', (function () { var s = buildSceneSVG({ region: 'cave', mood: 'dread' }); return s.indexOf('<ellipse') < 0 && s.indexOf('fill="#000"') < 0; })());
  ok('N11 开放雾词(foggy)+ 室内亦触发雾(纯 mood-gated 不绑 region、不绑闭集)', buildSceneSVG({ region: 'room', mood: 'foggy' }).indexOf('id="afog"') >= 0);
})();

// O. 体积光 god-rays(表现力升级:光感 mood → polygon 光束 + 径向渐变 + SMIL 摆动/呼吸;mix-blend screen 增辉退化;mood-gated 保字节、确定性、region 几何、不破计数)
(function () {
  var s = buildSceneSVG({ region: 'forest', mood: 'holy' });
  ok('O1 光感 mood(holy)→ 注入 god-rays(<polygon> 光束 + <radialGradient id="gr_forest">)', s.indexOf('<polygon') >= 0 && s.indexOf('id="gr_forest"') >= 0);
  ok('O2 增辉退化:mix-blend-mode:screen(不支持→普通半透明叠加)', s.indexOf('mix-blend-mode:screen') >= 0);
  ok('O3 光束摆动 + 呼吸:animateTransform type="rotate" + animate opacity(SMIL,非 @keyframes)', s.indexOf('type="rotate"') >= 0 && s.indexOf('<animate attributeName="opacity"') >= 0);
  ok('O4 静止态可见:光束组 g opacity="0.92"(reduced-motion / jsdom 探针落定可见)', s.indexOf('mix-blend-mode:screen" opacity="0.92"') >= 0);
  ok('O5 非光感 mood(calm)→ 不注入 god-rays(保字节)', buildSceneSVG({ region: 'forest', mood: 'calm' }).indexOf('id="gr_') < 0);
  ok('O6 无 mood → 不注入 god-rays(保 B2/K7 无 mood 精确计数)', buildSceneSVG({ region: 'forest' }).indexOf('<radialGradient id="gr_') < 0);
  ok('O7 region 几何/色:forest 暖光(#fff3c8) vs cave 冷光(#cfe6ff)', buildSceneSVG({ region: 'forest', mood: 'holy' }).indexOf('#fff3c8') >= 0 && buildSceneSVG({ region: 'cave', mood: 'holy' }).indexOf('#cfe6ff') >= 0);
  ok('O8 无配置 region(beach)+ 光感 mood → 兜底顶部暖光(gr_beach + #ffedc4)', (function () { var b = buildSceneSVG({ region: 'beach', mood: 'dawn' }); return b.indexOf('id="gr_beach"') >= 0 && b.indexOf('#ffedc4') >= 0; })());
  ok('O9 god-rays mood-gated 不破无 mood 计数:beach 无 mood 仍 3 rect', count(buildSceneSVG({ region: 'beach' }), '<rect') === 3);
  ok('O10 god-rays 不引入 rect:beach+dawn 仍 3 rect(只加 polygon/radialGradient)', count(buildSceneSVG({ region: 'beach', mood: 'dawn' }), '<rect') === 3);
  ok('O11 god-rays 不写字面 #000(色用 cfg.color)', buildSceneSVG({ region: 'cave', mood: 'holy' }).indexOf('fill="#000"') < 0);
  ok('O12 确定性:同 scene 两次字节相同(种子 PRNG region+mood)', buildSceneSVG({ region: 'ruins', mood: 'radiant' }) === buildSceneSVG({ region: 'ruins', mood: 'radiant' }));
  ok('O13 god-rays 不引入 ellipse(保 H/L/N 计数;sea+ethereal 无 dice → 无 ellipse)', buildSceneSVG({ region: 'sea', mood: 'ethereal' }).indexOf('<ellipse') < 0);
})();

// P. 雨雪天气粒子(表现力 #2:天气 mood → 前景 SMIL 粒子层;mood-gated 保字节、确定性、雨 line/雪 circle 摇摆/storm 雷闪)
(function () {
  var r = buildSceneSVG({ region: 'town', mood: 'rain' });
  ok('P1 rain mood → 斜雨线群(<line> + amatlas-weather-rain + translate 下落)', r.indexOf('amatlas-weather-rain') >= 0 && r.indexOf('<line') >= 0 && r.indexOf('type="translate"') >= 0);
  var sn = buildSceneSVG({ region: 'town', mood: 'snow' });
  ok('P2 snow mood → 雪花群(amatlas-weather-snow + circle + 双 translate 摇摆 spline)', sn.indexOf('amatlas-weather-snow') >= 0 && sn.indexOf('calcMode="spline"') >= 0);
  var st = buildSceneSVG({ region: 'night', mood: 'storm' });
  ok('P3 storm mood → 雨 + 雷闪(全屏 rect animate opacity 双脉冲 #eaf0ff)', st.indexOf('amatlas-weather-rain') >= 0 && st.indexOf('#eaf0ff') >= 0);
  ok('P4 非天气 mood(calm)→ 不注入天气(保字节)', buildSceneSVG({ region: 'town', mood: 'calm' }).indexOf('amatlas-weather') < 0);
  ok('P5 无 mood → 不注入天气(保 B2/K7 计数)', buildSceneSVG({ region: 'town' }).indexOf('amatlas-weather') < 0);
  ok('P6 beach+rain = 4 rect(3 基线 + 1 MOOD_TINT 冷暗色调;round12 补:雨天压暗海色,雨丝只加 line)', count(buildSceneSVG({ region: 'beach', mood: 'rain' }), '<rect') === 4);
  ok('P7 beach+storm = 5 rect(3 基线 + 1 闪电 + 1 MOOD_TINT 暗色调;round12 补暴风压暗)', count(buildSceneSVG({ region: 'beach', mood: 'storm' }), '<rect') === 5);
  ok('P6b rain/storm 现有 MOOD_TINT 冷暗色调(round12 修「雨落晴海」),drizzle 同补', /rgba\(40,55,78/.test(buildSceneSVG({ region: 'sea', mood: 'rain' })) && /rgba\(24,34,56/.test(buildSceneSVG({ region: 'sea', mood: 'storm' })) && /rgba\(58,70,90/.test(buildSceneSVG({ region: 'sea', mood: 'drizzle' })));
  ok('P8 确定性:同 scene 两次字节相同(种子 PRNG region+mood)', buildSceneSVG({ region: 'ruins', mood: 'blizzard' }) === buildSceneSVG({ region: 'ruins', mood: 'blizzard' }));
  ok('P9 天气不写字面 #000(rgba 粒子色 + #eaf0ff 闪电)', buildSceneSVG({ region: 'sea', mood: 'storm' }).indexOf('fill="#000"') < 0);
  ok('P10 blizzard(雪+斜风)→ snow circle 横向 wind 偏移(to="26,…")', buildSceneSVG({ region: 'ruins', mood: 'blizzard' }).indexOf('to="26,') >= 0);
})();

// Q. HSL 冷暖景深分级(视觉路线图 #3:opt-in 后处理 gradeSVG/tintHue;buildSceneSVG 本身零改动 → 段 A-P 全不破)
(function () {
  var P = require('../present-svg.js');
  var gradeSVG = P.gradeSVG, tintHue = P.tintHue;
  // hex #rrggbb → 色相 H(0-360);非 hex → null
  function hueOf(hex) { var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); if (!m) return null; var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0; if (d !== 0) { if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)); else if (mx === g) h = ((b - r) / d + 2); else h = ((r - g) / d + 4); h *= 60; } return h; }
  // Q1-Q5. gradeSVG:#asky 三 stop 被重映射成 teal-orange 纵深 + #000/rgba 原样 + 确定性。用 night(冷基色)→ 绝对色相清晰
  var raw = buildSceneSVG({ region: 'night', mood: 'dread' });
  var graded = gradeSVG(raw, 0.6);
  var gTop = /<stop offset="0" stop-color="(#[0-9a-f]{6})"/.exec(graded)[1];   // 远 stop(depth 0.05)
  var gBot = /offset="1" stop-color="(#[0-9a-f]{6})"/.exec(graded)[1];          // 近 stop(depth 0.85)
  ok('Q1 gradeSVG 改变了 SVG(#asky 三 stop 被分级,非原样)', graded !== raw && /<linearGradient id="asky"/.test(graded));
  ok('Q2 远 stop(offset 0)偏冷:色相落青蓝区(~180-220°)', (function () { var h = hueOf(gTop); return h >= 175 && h <= 225; })());
  ok('Q3 近 stop(offset 1)偏暖:色相落橙黄区(~10-45°)', (function () { var h = hueOf(gBot); return h >= 8 && h <= 48; })());
  ok('Q4 远冷近暖纵深成立(远 stop 比近 stop 色相更"冷":远≥160° 而近≤50°)', hueOf(gTop) >= 160 && hueOf(gBot) <= 50);
  ok('Q5 vignette #000 / mood tint rgba 原样保留(分级只碰 #asky 与剪影 path、不碰保护色)', graded.indexOf('stop-color="#000"') >= 0 && graded.indexOf('rgba(20,0,0,.30)') >= 0);
  ok('Q6 gradeSVG 确定性(同输入同输出)', gradeSVG(raw, 0.6) === gradeSVG(raw, 0.6));
  ok('Q7 gradeSVG 非字符串 / 空串 → 原样返回(健壮)', gradeSVG('', 0.6) === '' && gradeSVG(undefined, 0.6) === undefined && gradeSVG(null, 0.6) === null);
  // Q8. 剪影 path fill 也被远→近分级(第一层远=冷、第二层近=暖)
  ok('Q8 剪影 path fill 远→近分级:第 1 层(远)色相比第 2 层(近)更冷', (function () {
    var b = gradeSVG(buildSceneSVG({ region: 'beach', mood: 'calm' }), 0.6);
    var fills = []; b.replace(/<path d="[^"]*" fill="(#[0-9a-f]{6})"/g, function (_, h) { fills.push(h); return _; });
    return fills.length >= 2 && hueOf(fills[0]) > hueOf(fills[1]);   // beach 暖沙基色:远层向青偏(色相增大)、近层向橙偏(减小)
  })());
  // Q9-Q11. tintHue 纯函数:depth<0.5 偏冷 / >0.5 偏暖 / 非 hex 原样
  ok('Q9 tintHue depth<0.5 偏冷:中性灰 → 色相落冷区(>140°)', (function () { var h = hueOf(tintHue('#888888', 0.05, 0.6)); return h > 140; })());
  ok('Q10 tintHue depth>0.5 偏暖:中性灰 → 色相落暖区(<60°)', (function () { var h = hueOf(tintHue('#888888', 0.85, 0.6)); return h < 60; })());
  ok('Q11 tintHue 非 #rrggbb 原样返回(保护 #000 简写 / rgba)', tintHue('#000', 0.05, 0.6) === '#000' && tintHue('rgba(0,0,0,.4)', 0.85, 0.6) === 'rgba(0,0,0,.4)');
  ok('Q12 tintHue 输出仍是合法 #rrggbb(amt 总控,中段几乎不偏)', /^#[0-9a-f]{6}$/i.test(tintHue('#36332e', 0.5, 0.6)));
  // Q13-Q15. createSvgPresenter({grade}):present 经分级 vs 不带 grade 字节级等于 buildSceneSVG 原样
  (function () {
    var scene = { region: 'cave', mood: 'eerie' };
    var rawC = buildSceneSVG(scene), gradedC = gradeSVG(rawC, 0.6);
    var m1 = { innerHTML: '' }; createSvgPresenter({ container: m1 }).present({ view: { scene: scene } });
    ok('Q13 不带 grade → 容器 HTML 与 buildSceneSVG 字节级一致(默认 OFF,既有游戏不变)', m1.innerHTML === rawC);
    var m2 = { innerHTML: '' }; createSvgPresenter({ container: m2, grade: 0.6 }).present({ view: { scene: scene } });
    ok('Q14 grade:0.6 → 容器 HTML 经过分级(== gradeSVG 输出,含 tint 后的 stop)', m2.innerHTML === gradedC && m2.innerHTML !== rawC);
    var m3 = { innerHTML: '' }; createSvgPresenter({ container: m3, grade: true }).present({ view: { scene: scene } });
    ok('Q15 grade:true → 用默认强度 0.6(== grade:0.6 结果)', m3.innerHTML === gradedC);
  })();
})();

// R. feColorMatrix 整场电影调色(视觉路线图收尾 #1:mood-gated;原型 _preview-colormatrix.html;feColorMatrix 包整场 <g>、letterbox 留组外、确定性、不破计数/字节)
(function () {
  var sepia = buildSceneSVG({ region: 'forest', mood: 'memory', elements: [ { kind: 'character', ref: 'x' } ] });
  ok('R1 调色 mood(memory)→ 注入 <filter id="agrade"> + feColorMatrix sepia 矩阵', sepia.indexOf('<filter id="agrade"') >= 0 && sepia.indexOf('<feColorMatrix') >= 0 && sepia.indexOf('0.393 0.769 0.189') >= 0);
  ok('R2 内容层包进 <g filter="url(#agrade)">(整场调色)', sepia.indexOf('<g filter="url(#agrade)">') >= 0);
  ok('R3 sRGB 色彩空间(避免线性偏色)', sepia.indexOf('color-interpolation-filters="sRGB"') >= 0);
  var hue = buildSceneSVG({ region: 'sea', mood: 'otherworld' });
  ok('R4 hueRotate mood(otherworld)→ feColorMatrix type="hueRotate" + SMIL animate 色相流转(非 @keyframes)', hue.indexOf('type="hueRotate"') >= 0 && hue.indexOf('<animate attributeName="values"') >= 0);
  ok('R5 异界流转用 SMIL <animate> 非 CSS @keyframes(保 H7;该场景无 eyes/dice → 无 @keyframes)', hue.indexOf('@keyframes') < 0);
  var dying = buildSceneSVG({ region: 'night', mood: 'dying' });
  ok('R6 去色冷调 mood(dying)→ feColorMatrix type="saturate"(降饱和)+ 冷调矩阵', dying.indexOf('type="saturate"') >= 0 && dying.indexOf('0 0 1.15 0 0.02') >= 0);
  var poison = buildSceneSVG({ region: 'cave', mood: 'poison' });
  ok('R7 tone mood(poison/magic)→ 自定义 matrix(毒绿/魔法紫)', poison.indexOf('0.5 0.9 0.2 0 0') >= 0 && buildSceneSVG({ region: 'cave', mood: 'magic' }).indexOf('0.9 0.2 0.7 0 0') >= 0);
  // 字节安全:非调色 mood / 无 mood → 不注入 agrade(保段 A-Q 全不破)
  ok('R8 非调色 mood(calm)→ 不注入 agrade(保字节)', buildSceneSVG({ region: 'forest', mood: 'calm' }).indexOf('agrade') < 0);
  ok('R9 无 mood → 不注入 agrade + 仍 3 rect(保 B2/K7 无 mood 精确计数)', (function () { var s = buildSceneSVG({ region: 'forest' }); return s.indexOf('agrade') < 0 && count(s, '<rect') === 3; })());
  ok('R10 调色 mood 不破 rect 计数:beach+memory 仍 3 rect(只加 filter + 包 <g>,不加 rect)', count(buildSceneSVG({ region: 'beach', mood: 'memory' }), '<rect') === 3);
  // letterbox 校验:含 letterbox 的场景套调色 → 内容包进 <g>、黑边留组外(保 I1 纯黑两条 #000)
  var lb = buildSceneSVG({ region: 'night', mood: 'dying', elements: [ { kind: 'letterbox' } ] });
  ok('R11 letterbox + 调色:黑边留 </g> 后(2 条 fill="#000" 仍在,保 I1 不被调色)', count(lb, 'fill="#000"') === 2 && lb.indexOf('</g><rect x="0" y="0" width="320" height="26" fill="#000"/>') >= 0);
  ok('R12 调色确定性:同 scene 两次构造字节相同', buildSceneSVG({ region: 'forest', mood: 'memory' }) === buildSceneSVG({ region: 'forest', mood: 'memory' }));
  ok('R13 调色与 MOOD_TINT 正交:memory 不在 MOOD_TINT → 无 MOOD_TINT 覆盖色(但有 agrade;horizon rgba(0,0,0,.12) 不算 mood tint)', sepia.indexOf('agrade') >= 0 && sepia.indexOf('rgba(170,30,30') < 0 && sepia.indexOf('rgba(40,90,170') < 0 && sepia.indexOf('rgba(80,30,120') < 0);
  ok('R14 别名同配方:flashback/sepia 与 memory 同 sepia 矩阵', buildSceneSVG({ mood: 'flashback' }).indexOf('0.393 0.769 0.189') >= 0 && buildSceneSVG({ mood: 'sepia' }).indexOf('0.393 0.769 0.189') >= 0);
})();

// S. feDisplacementMap 画面扭曲(视觉路线图收尾 #2:mood-gated;调研 MDN/Codrops/Smashing;feTurbulence→feDisplacementMap 包整场 <g>、SMIL 流动、确定性、扩边防裁、不破计数/字节)
(function () {
  var heat = buildSceneSVG({ region: 'beach', mood: 'heat', elements: [ { kind: 'character', ref: 'x' } ] });
  ok('S1 扭曲 mood(heat)→ 注入 <filter id="adisp"> + feTurbulence + feDisplacementMap', heat.indexOf('<filter id="adisp"') >= 0 && heat.indexOf('<feTurbulence') >= 0 && heat.indexOf('<feDisplacementMap') >= 0);
  ok('S2 内容层包进 <g filter="url(#adisp)">(扭曲整场渲染结果)', heat.indexOf('<g filter="url(#adisp)">') >= 0);
  ok('S3 feDisplacementMap 位移 SourceGraphic(in2=噪声 + R/G 通道)', heat.indexOf('in="SourceGraphic" in2="dn"') >= 0 && heat.indexOf('xChannelSelector="R" yChannelSelector="G"') >= 0);
  ok('S4 SMIL animate baseFrequency 让扭曲流动(非 CSS @keyframes,保 H7;该场景无 eyes/dice)', heat.indexOf('<animate attributeName="baseFrequency"') >= 0 && heat.indexOf('@keyframes') < 0);
  ok('S5 滤镜区扩边防裁(x="-20%" width="140%" height="140%")(调研:位移向外推像素不扩区会被裁)', heat.indexOf('id="adisp" x="-20%" y="-20%" width="140%" height="140%"') >= 0);
  ok('S6 热浪族 fractalNoise(平滑) vs 水下族 turbulence(略乱)', heat.indexOf('type="fractalNoise"') >= 0 && buildSceneSVG({ region: 'sea', mood: 'underwater' }).indexOf('type="turbulence"') >= 0);
  ok('S7 各扭曲词均注入 adisp(shimmer/underwater/mirage/warp/ripple)', ['shimmer', 'underwater', 'mirage', 'warp', 'ripple'].every(function (m) { return buildSceneSVG({ region: 'sea', mood: m }).indexOf('id="adisp"') >= 0; }));
  // 字节安全:扭曲词全不在 MOOD_TINT/FOG_TINT/LIGHT_MOODS/WEATHER → 非扭曲 mood / 无 mood 不注入(保段 A-Q)
  ok('S8 非扭曲 mood(calm)→ 不注入 adisp(保字节)', buildSceneSVG({ region: 'sea', mood: 'calm' }).indexOf('adisp') < 0);
  ok('S9 无 mood → 不注入 adisp + 仍 3 rect(保 B2/K7 无 mood 精确计数)', (function () { var s = buildSceneSVG({ region: 'sea' }); return s.indexOf('adisp') < 0 && count(s, '<rect') === 3; })());
  ok('S10 扭曲 mood 不破 rect 计数:beach+heat 仍 3 rect(只加 filter + 包 <g>,不加 rect)', count(buildSceneSVG({ region: 'beach', mood: 'heat' }), '<rect') === 3);
  ok('S11 扭曲不引入 ellipse / 不写字面 #000:sea+underwater 无 ellipse、无 #000(保 H/I/K)', (function () { var s = buildSceneSVG({ region: 'sea', mood: 'underwater' }); return s.indexOf('<ellipse') < 0 && s.indexOf('fill="#000"') < 0; })());
  // letterbox 校验:含 letterbox 套扭曲 → 黑边留组外(不被位移裁出空隙,保 I1)
  var lb = buildSceneSVG({ region: 'sea', mood: 'underwater', elements: [ { kind: 'letterbox' } ] });
  ok('S12 letterbox + 扭曲:黑边留 </g> 后(2 条 #000 仍满铺、不被位移)', count(lb, 'fill="#000"') === 2 && lb.indexOf('</g><rect x="0" y="0" width="320" height="26" fill="#000"/>') >= 0);
  ok('S13 扭曲确定性:同 scene 两次构造字节相同(feTurbulence 同 seed)', buildSceneSVG({ region: 'sea', mood: 'underwater' }) === buildSceneSVG({ region: 'sea', mood: 'underwater' }));
  ok('S14 扭曲词不在 FOG_TINT:heat 不触发雾(无 afog;避开已属 FOG 的 haze)', heat.indexOf('afog') < 0);
  // 与调色叠加:既扭曲又调色 mood 不存在(各 mood 唯一),但验证两滤镜可嵌套共存(用扭曲 mood + 调色 mood 不可能同时,故验单滤镜不互相注入)
  ok('S15 扭曲 mood 不顺带注入调色(heat 无 agrade)、调色 mood 不顺带注入扭曲(memory 无 adisp)', heat.indexOf('agrade') < 0 && buildSceneSVG({ mood: 'memory' }).indexOf('adisp') < 0);
})();

// T. scene 物件具体化(契约 v9):element.art = Preset 名 | art-spec DSL(预设图标 / DSL 各 shape / 未知名退化 glyph+不抛 / 非法 spec 抛 + 注入防护 / 无 art 字节守恒 / 确定性)
(function () {
  var P = require('../present-svg.js');
  var renderElementArt = P.renderElementArt, renderArtSpec = P.renderArtSpec, ART_PRESETS = P.ART_PRESETS;
  // T1-T4. 预设图标锚:art:'<name>' → 引擎画 + 包 <g translate> 放槽位 + 保留 ref 标签
  var ship = buildSceneSVG({ region: 'sea', elements: [ { kind: 'item', art: 'ship', ref: '船' } ] });
  ok('T1 art:"ship" → 包 <g transform="translate(40,108)…">(放到 slot 槽位,art 本地以 (0,0) 居中;允许附加 filter/融合属性)', /<g transform="translate\(40,108\)"[^>]*>/.test(ship));
  ok('T2 ship 预设特征图元:船身梯形 polygon(points 含 "-13,4")', ship.indexOf('<polygon points="-13,4') >= 0);
  ok('T3 art 仍保留 ref 标签(同 glyph 路径:>船< 的 <text>)', ship.indexOf('>船<') >= 0);
  ok('T4 预设图标库 35(原 20 + round12 补 15 自然/常用)', Object.keys(ART_PRESETS).length >= 35);
  ok('T4b round12 新增自然/常用预设齐全(cloud/wave/rock/mountain/sun/moon/bird/flower/coin/scroll/banner/shield/house/barrel/anchor)',
    ['cloud', 'wave', 'rock', 'mountain', 'sun', 'moon', 'bird', 'flower', 'coin', 'scroll', 'banner', 'shield', 'house', 'barrel', 'anchor'].every(function (k) { return Array.isArray(ART_PRESETS[k]) && ART_PRESETS[k].length >= 1; }));
  // T5. 预设自身合法(dogfood:用 DSL 写、走同一渲染路径,无一抛)+ 不写字面 #000(派生深色)+ 确定性
  ok('T5 全部预设走 renderArtSpec 不抛(dogfood)+ 无字面 #000(派生深色,保 I1 哲学)', (function () {
    for (var k in ART_PRESETS) { var svg; try { svg = renderArtSpec(ART_PRESETS[k]); } catch (e) { return false; } if (svg.indexOf('#000') >= 0) return false; }
    return true;
  })());
  // T6-T11. art-spec DSL:各 shape 渲染(本地坐标,w/h→width/height)+ 通用样式 attr
  ok('T6 art-spec circle:cx/cy/r + fill → <circle ...fill>(不误加 width)', (function () { var c = renderArtSpec([ { shape: 'circle', cx: 0, cy: 0, r: 10, fill: '#abc' } ]); return /<circle cx="0" cy="0" r="10" fill="#abc"\/>/.test(c) && c.indexOf('<circle width') < 0; })());
  ok('T7 art-spec rect:x/y/w/h → width/height(w→width 的语义映射)', /<rect x="-5" y="-5" width="10" height="8"\/>/.test(renderArtSpec([ { shape: 'rect', x: -5, y: -5, w: 10, h: 8 } ])));
  ok('T8 art-spec line:x1/y1/x2/y2 + sw→stroke-width', /<line x1="0" y1="0" x2="10" y2="10" stroke="#333" stroke-width="2"\/>/.test(renderArtSpec([ { shape: 'line', x1: 0, y1: 0, x2: 10, y2: 10, stroke: '#333', sw: 2 } ])));
  ok('T9 art-spec polygon:points 串(只允许几何字符)+ op→opacity', /<polygon points="0,-10 10,8 -10,8" fill="gold" opacity="0.5"\/>/.test(renderArtSpec([ { shape: 'polygon', points: '0,-10 10,8 -10,8', fill: 'gold', op: 0.5 } ])));
  ok('T10 art-spec ellipse:cx/cy/rx/ry', /<ellipse cx="0" cy="0" rx="12" ry="6"\/>/.test(renderArtSpec([ { shape: 'ellipse', cx: 0, cy: 0, rx: 12, ry: 6 } ])));
  ok('T11 art-spec path:d 串(只允许路径命令字母与坐标)', /<path d="M -3 -13 A 3 3 0 0 1 3 -13" fill="none" stroke="#777" stroke-width="1.5"\/>/.test(renderArtSpec([ { shape: 'path', d: 'M -3 -13 A 3 3 0 0 1 3 -13', fill: 'none', stroke: '#777', sw: 1.5 } ])));
  // T12. art 数组经 buildSceneSVG → 包 <g translate> 放槽位(焦点物件创作内容/escape hatch)
  ok('T12 自定义 art-spec 经 buildSceneSVG → 包 <g translate> + 渲染图元(允许场景融合层:接地影/软自影 filter)', (function () { var s = buildSceneSVG({ elements: [ { kind: 'item', art: [ { shape: 'rect', x: -8, y: -8, w: 16, h: 16, fill: '#9a5ad0' }, { shape: 'circle', cx: 0, cy: 0, r: 4, fill: '#fff4c2' } ] } ] }); return /<g transform="translate\(40,108\)"[^>]*>/.test(s) && s.indexOf('<rect x="-8" y="-8" width="16" height="16" fill="#9a5ad0"/>') >= 0 && s.indexOf('<circle cx="0" cy="0" r="4" fill="#fff4c2"/>') >= 0; })());
  // T13-T15. 未知预设名 → 退化该 kind 的 glyph + console.warn(不抛;视觉降级可接受)
  var warned = [], origWarn = console.warn; console.warn = function (m) { warned.push(String(m)); };
  var unknownItem, unknownChar, noThrow = true;
  try { unknownItem = buildSceneSVG({ elements: [ { kind: 'item', art: '不存在的物件' } ] }); unknownChar = buildSceneSVG({ elements: [ { kind: 'character', art: '没这个', ref: 'x' } ] }); } catch (e) { noThrow = false; }
  console.warn = origWarn;
  ok('T13 未知预设名 → 不抛(优雅退化)', noThrow);
  ok('T14 未知预设名退化:item→24×24 rect glyph;character→人影 figure(比裸圆更"有人在此")', unknownItem.indexOf('width="24" height="24"') >= 0 && unknownChar.indexOf('filter="url(#aart)"') >= 0);
  ok('T15 未知预设名 → console.warn(含名 + 提示退化)', warned.some(function (m) { return m.indexOf('不存在的物件') >= 0 && m.indexOf('退化') >= 0; }));
  // T16-T22. 非法 art-spec → throw(fail-loud,§4.7);经 buildSceneSVG 同样抛(管线中拦下坏数据)
  ok('T16 未知 shape → throw', throws(function () { renderArtSpec([ { shape: 'foobar', cx: 0, cy: 0, r: 5 } ]); }));
  ok('T17 缺必需 attr(circle 缺 r)→ throw', throws(function () { renderArtSpec([ { shape: 'circle', cx: 0, cy: 0 } ]); }));
  ok('T18 数值 attr 非数(rect x 是字符串)→ throw', throws(function () { renderArtSpec([ { shape: 'rect', x: 'oops', y: 0, w: 5, h: 5 } ]); }));
  ok('T19 fill 非颜色串(url(#x))→ throw', throws(function () { renderArtSpec([ { shape: 'circle', cx: 0, cy: 0, r: 5, fill: 'url(#evil)' } ]); }));
  ok('T20 空数组 / 非数组 / 非对象图元 → throw', throws(function () { renderArtSpec([]); }) && throws(function () { renderArtSpec('nope'); }) && throws(function () { renderArtSpec([ 42 ]); }));
  ok('T21 经 buildSceneSVG 的非法 art-spec 同样 throw(管线 fail-loud,非静默)', throws(function () { buildSceneSVG({ elements: [ { kind: 'item', art: [ { shape: 'evil' } ] } ] }); }));
  // 注入防护:on* 事件属性 / <script / href / url( / < → throw
  ok('T22 注入防护:onclick 事件属性 → throw', throws(function () { renderArtSpec([ { shape: 'circle', cx: 0, cy: 0, r: 5, onclick: 'evil()' } ]); }));
  ok('T23 注入防护:d 含 <script → throw(防注入)', throws(function () { renderArtSpec([ { shape: 'path', d: '<script>alert(1)</script>' } ]); }));
  ok('T24 注入防护:fill 含 href / 含 < → throw(任何字符串 attr 先过注入面闸)', throws(function () { renderArtSpec([ { shape: 'circle', cx: 0, cy: 0, r: 5, fill: 'href' } ]); }) && throws(function () { renderArtSpec([ { shape: 'polygon', points: '0,0 <x' } ]); }));
  // T25-T28. 无 art → 既有 glyph 路径字节守恒(零回归校验)+ dice/eyes/letterbox 特殊渲染不被 art 接管
  ok('T25 无 art:beach 仍 3 rect(保 B2,无 art 缺省零影响)', count(buildSceneSVG({ region: 'beach' }), '<rect') === 3);
  ok('T26 无 art:item 仍画 24×24 rect glyph(保 C2 既有行为)', buildSceneSVG({ elements: [ { kind: 'item', ref: 'lantern' } ] }).indexOf('width="24" height="24"') >= 0);
  ok('T27 art 不接管 dice:dice+art:"ship" 仍渲染骰子(.amatlas-die,非船身)', (function () { var d = buildSceneSVG({ elements: [ { kind: 'dice', ref: '7', art: 'ship' } ] }); return d.indexOf('amatlas-die') >= 0 && d.indexOf('-13,4') < 0; })());
  ok('T28 art 不接管 eyes/letterbox(overlay 在 art 分支前 continue):eyes+art 仍画眼白椭圆', buildSceneSVG({ region: 'night', elements: [ { kind: 'eyes', state: 'watching', ref: '2', art: 'ship' } ] }).indexOf('<ellipse') >= 0);
  // T29. 确定性:含 art 的场景两次构造字节相同(纯数据→纯 SVG)
  ok('T29 确定性:含 art 场景(预设 + art-spec)两次构造字节相同', buildSceneSVG({ region: 'cave', elements: [ { kind: 'item', art: 'crystal' }, { kind: 'item', art: [ { shape: 'circle', cx: 0, cy: 0, r: 6, fill: '#abc' } ] } ] }) === buildSceneSVG({ region: 'cave', elements: [ { kind: 'item', art: 'crystal' }, { kind: 'item', art: [ { shape: 'circle', cx: 0, cy: 0, r: 6, fill: '#abc' } ] } ] }));
  // T30. renderElementArt 暴露 + 未知名返回 null(供调用方退化)
  var warnedR = console.warn; console.warn = function () {};
  ok('T30 renderElementArt 暴露:预设名→SVG 串、未知名→null(供 glyph 退化)、art-spec→渲染', renderElementArt('ship').indexOf('<polygon') >= 0 && renderElementArt('xx') === null && renderElementArt([ { shape: 'circle', cx: 0, cy: 0, r: 3 } ]).indexOf('<circle') >= 0);
  // T31-T32. 场景融合层(优化:治"突兀/悬浮/扁平";全 presenter 端、art 数据/DSL 不变、仅在场景含 art 物件时注入)
  ok('T31 有 art 物件 → 接地柔影 ellipse(rgba 不写 #000)+ 软自影滤镜 #aart 包裹物件 g', (function () { var a = buildSceneSVG({ region: 'sea', elements: [ { kind: 'item', art: 'ship' } ] }); return a.indexOf('fill="rgba(0,0,0,.28)"') >= 0 && a.indexOf('filter="url(#aart)"') >= 0 && a.indexOf('<filter id="aart"') >= 0; })());
  ok('T32 软自影滤镜 #aart 仅有 art/人物时注入(无 art 场景 / 纯 glyph 物件 item → 无 #aart,字节安全)', buildSceneSVG({ region: 'sea' }).indexOf('id="aart"') < 0 && buildSceneSVG({ region: 'sea', elements: [ { kind: 'item', ref: 'x' } ] }).indexOf('id="aart"') < 0);
  // (原 T33「mood 轮廓光弧」已随 artRimLight 移除——对人影读成游离半弧、帮倒忙,端用户实测拍板删。)
  console.warn = warnedR;
})();

// U. 剪影人物/生物预设(6 个:figure/robed/hooded/guard/beast/crowned)——身份主走文本,剪影="存在标记"。
//    各经 renderArtSpec/renderElementArt 渲染不抛 + 不写字面 #000(派生暗色)+ figure 经 buildSceneSVG 出图(含自动接地影/软自影融场)。
(function () {
  var P = require('../present-svg.js');
  var renderElementArt = P.renderElementArt, renderArtSpec = P.renderArtSpec, ART_PRESETS = P.ART_PRESETS;
  var FIGS = ['figure', 'robed', 'hooded', 'guard', 'beast', 'crowned'];
  ok('U1 ART_PRESETS = 35(14 物件 + 6 剪影人物 + round12 补 15 自然/常用)', Object.keys(ART_PRESETS).length === 35);
  ok('U2 6 个人物预设全部存在(figure/robed/hooded/guard/beast/crowned)', FIGS.every(function (f) { return Array.isArray(ART_PRESETS[f]); }));
  ok('U3 各人物预设经 renderArtSpec 渲染不抛(dogfood,与 14 物件同范式)+ 出真图元', (function () {
    for (var i = 0; i < FIGS.length; i++) { var svg; try { svg = renderArtSpec(ART_PRESETS[FIGS[i]]); } catch (e) { return false; } if (!/<(circle|rect|line|polygon|ellipse|path)\b/.test(svg)) return false; }
    return true;
  })());
  ok('U4 各人物预设无字面 #000(剪影=派生暗色,非纯黑;保 I1 哲学)', FIGS.every(function (f) { return renderArtSpec(ART_PRESETS[f]).indexOf('#000') < 0; }));
  ok('U5 各人物预设经 renderElementArt(预设名)→ SVG 串(非 null、非抛)', FIGS.every(function (f) { var r = renderElementArt(f); return typeof r === 'string' && r.length > 0; }));
  // U6-U7. art:'figure' 经 buildSceneSVG 出图 + 自动场景融合两招(接地影 / 软自影 #aart;原第③招 mood 轮廓光弧已移除)
  var fig = buildSceneSVG({ region: 'ruins', mood: 'eerie', elements: [ { kind: 'character', art: 'figure', ref: '守墓人' } ] });
  ok('U6 art:"figure" 经 buildSceneSVG → 包 <g translate> 放槽位 + 保留 ref 标签(>守墓人<)', /<g transform="translate\(40,108\)"[^>]*>/.test(fig) && fig.indexOf('>守墓人<') >= 0);
  ok('U7 figure 自动获得接地柔影 + 软自影滤镜 #aart(融场两招,与 14 物件同路径)', fig.indexOf('fill="rgba(0,0,0,.28)"') >= 0 && fig.indexOf('filter="url(#aart)"') >= 0 && fig.indexOf('<filter id="aart"') >= 0);
  // U9-U10. 人物预设画的是"人/兽轮廓"(头 + 躯干等多图元)、确定性
  ok('U9 人物剪影是多图元轮廓(figure ≥4 图元=头+躯干+肢;beast 含躯干 ellipse + 多腿 line)', renderArtSpec(ART_PRESETS.figure).match(/<(circle|rect|line|polygon|ellipse|path)\b/g).length >= 4 && renderArtSpec(ART_PRESETS.beast).indexOf('<ellipse') >= 0 && (renderArtSpec(ART_PRESETS.beast).match(/<line\b/g) || []).length >= 4);
  ok('U10 确定性:含人物预设的场景两次构造字节相同', buildSceneSVG({ region: 'night', elements: [ { kind: 'character', art: 'robed' }, { kind: 'character', art: 'beast' } ] }) === buildSceneSVG({ region: 'night', elements: [ { kind: 'character', art: 'robed' }, { kind: 'character', art: 'beast' } ] }));
})();

// V. 开放词汇 region 治理(Sonnet run2 实测 47% 节点用未知词→灰板):家族识别(中英近义词归族)+ 哈希深色调色板 + god-rays 亮度自适应(对比度现象,GPU Gems 3)
(function () {
  ok('V1 近义词归族:village → town 全套(基色 #9aa0a6 + 天际线剪影 <path>)', (function () { var s = buildSceneSVG({ region: 'village' }); return s.indexOf('#9aa0a6') >= 0 && s.indexOf('<path') >= 0; })());
  ok('V2 dungeon → cave 家族(基色 #36332e)', buildSceneSVG({ region: 'dungeon' }).indexOf('#36332e') >= 0);
  ok('V3 中文近义词:村庄→town、矿洞→cave', buildSceneSVG({ region: '村庄' }).indexOf('#9aa0a6') >= 0 && buildSceneSVG({ region: '矿洞' }).indexOf('#36332e') >= 0);
  ok('V4 真未知主题词(heart)→ 哈希深色:确定性 + 无剪影(语义不可猜)+ data-region 保留原词 + 非平灰', (function () { var s = buildSceneSVG({ region: 'heart' }); return s === buildSceneSVG({ region: 'heart' }) && s.indexOf('<path') < 0 && s.indexOf('data-region="heart"') >= 0 && s.indexOf('#cfd2d6') < 0; })());
  ok('V5 已知词零回归:beach 基色/计数不变(#e9d8a6 + 3 rect)', (function () { var s = buildSceneSVG({ region: 'beach' }); return s.indexOf('#e9d8a6') >= 0 && count(s, '<rect') === 3; })());
  ok('V6 god-rays 亮度自适应:beach+dawn(亮底)stop-opacity 收敛 0.270 vs night+holy(暗底)0.900', buildSceneSVG({ region: 'beach', mood: 'dawn' }).indexOf('stop-opacity="0.270"') >= 0 && buildSceneSVG({ region: 'night', mood: 'holy' }).indexOf('stop-opacity="0.900"') >= 0);
  ok('V7 亮度自适应保静止态:光束组 opacity="0.92" 不变(O4 守恒)', buildSceneSVG({ region: 'beach', mood: 'dawn' }).indexOf('mix-blend-mode:screen" opacity="0.92"') >= 0);
  ok('V8 未知词 + 光感 mood(heart+sacred):光柱打在哈希深色底上、gid id-安全(gr_u<hash>)', (function () { var s = buildSceneSVG({ region: 'heart', mood: 'sacred' }); return s.indexOf('<polygon') >= 0 && /id="gr_u\d+"/.test(s); })());
  ok('V9 归族场景确定性:同 scene 两次字节相同(village+calm)', buildSceneSVG({ region: 'village', mood: 'calm' }) === buildSceneSVG({ region: 'village', mood: 'calm' }));
})();

// W. character 默认人影(Sonnet run2 用户实测"还存在 placeholder";意图→图元是 presenter 自由 §10.2-Q1,数据/词汇零改)
(function () {
  var s = buildSceneSVG({ region: 'town', elements: [ { kind: 'character', ref: '卫兵' } ] });
  ok('W1 character 无 art → 剪影人影 + 接地影 + #aart 融场(默认告别裸圆)', s.indexOf('filter="url(#aart)"') >= 0 && s.indexOf('rgba(0,0,0,.28)') >= 0);
  ok('W2 显式 art 优先:character + art:"robed" → 法袍剪影(不被默认 figure 覆盖)', (function () { var r = buildSceneSVG({ elements: [ { kind: 'character', art: 'robed' } ] }); var f = buildSceneSVG({ elements: [ { kind: 'character' } ] }); return r.indexOf('url(#aart)') >= 0 && r !== f; })());
  ok('W3 hazard/item/exit 无 art 仍抽象 glyph(只升级 character;留白哲学不变)', (function () { var h = buildSceneSVG({ elements: [ { kind: 'hazard' }, { kind: 'item' }, { kind: 'exit' } ] }); return h.indexOf('url(#aart)') < 0 && h.indexOf('<polygon') >= 0 && h.indexOf('#5b3a1a') >= 0; })());
  ok('W4 ref 标签保留(人影下方仍标名字)', s.indexOf('>卫兵<') >= 0);
  ok('W5 确定性:同 character 场景两次字节相同', s === buildSceneSVG({ region: 'town', elements: [ { kind: 'character', ref: '卫兵' } ] }));
  // W6-8. 抽象 glyph 质量升级(round11"还有 placeholder":裸三角/白方块像贴纸 → 接地影+体积,保抽象语义不锚定)
  var gq = buildSceneSVG({ elements: [ { kind: 'hazard', ref: '灰雾' }, { kind: 'item', ref: '箱' }, { kind: 'exit' } ] });
  ok('W6 hazard 三角=琥珀警示色+内层(非纯白贴纸)+ 接地影', gq.indexOf('#d9a23a') >= 0 && gq.indexOf('#c08a26') >= 0 && gq.indexOf('rgba(0,0,0,.28)') >= 0);
  ok('W7 item 方块=暖纸色+底部暗条体积(保 24×24 语义尺寸)', gq.indexOf('#e8e2d4') >= 0 && gq.indexOf('#bdb4a4') >= 0 && gq.indexOf('width="24" height="24"') >= 0);
  ok('W8 exit 门=门框线+把手(#c9a86a)、glyph 全员无字面 #000', gq.indexOf('#c9a86a') >= 0 && gq.indexOf('fill="#000"') < 0);
})();

// X. 易用性/逻辑审计批:SMIL reduced-motion 剥除 + 同节点同内容跳过 innerHTML 重建
(function () {
  function countEl() {
    var n = 0, html = '';
    var el = {};
    Object.defineProperty(el, 'innerHTML', { get: function () { return html; }, set: function (v) { html = v; n++; } });
    el._writes = function () { return n; };
    return el;
  }
  // X1 reduced-motion:matchMedia 命中 → 注入容器的 SVG 无任何 SMIL(基线属性=停止态可见)
  global.window = { matchMedia: function (q) { return { matches: /prefers-reduced-motion/.test(q) }; } };
  var elR = countEl(); var pR = createSvgPresenter({ container: elR });
  pR.present({ view: { scene: { region: 'forest' } }, pos: { map: 'm', node: 'a' } });   // forest=萤火 animateMotion 必有
  var noSmil = elR.innerHTML.indexOf('<animate') < 0 && elR.innerHTML.indexOf('<circle') >= 0;
  delete global.window;
  ok('X1 prefers-reduced-motion → SMIL 全剥(萤火/明灭静止可见,非消失)', noSmil);
  // X2/X3 同节点同内容跳过重建(SMIL 相位不再被纯动作 re-render 推倒重来);内容变了照常重建
  var el2 = countEl(); var p2 = createSvgPresenter({ container: el2 });
  var snapA = { view: { scene: { region: 'night' } }, pos: { map: 'm', node: 'a' } };
  p2.present(snapA); p2.present(snapA);
  ok('X2 同节点同 scene 两次 present → innerHTML 只写一次(SMIL 相位保持)', el2._writes() === 1);
  p2.present({ view: { scene: { region: 'night', mood: 'eerie' } }, pos: { map: 'm', node: 'a' } });
  ok('X3 同节点但 scene 变(mood)→ 正常重建', el2._writes() === 2);
})();

// Y. scene.elements 非数组 → fail-loud throw(C04 前瞻审计:与 renderArtSpec 非数组即抛对称,写错形态不静默吞成空场)
(function () {
  ok('Y1 elements 写成对象(非数组)→ throw(与 renderArtSpec 对称 fail-loud)', throws(function () { buildSceneSVG({ elements: { kind: 'character' } }); }));
  ok('Y2 elements 写成字符串 → throw', throws(function () { buildSceneSVG({ elements: 'oops' }); }));
  ok('Y3 省略 elements / 空数组 → 不抛(合法无物件场景,零回归)', !throws(function () { buildSceneSVG({ region: 'beach' }); }) && !throws(function () { buildSceneSVG({ elements: [] }); }));
})();

// Z. V1 暗角光照呼吸(表现力升级:张力 mood → vignette 外圈 stop-opacity 极缓 SMIL 往返;mood-gated 保字节、stripSmil 静止态可见、不破 I1/H7/计数)
(function () {
  // avig 呼吸块正则:外圈 stop(offset 1)挂 <animate stop-opacity values="0.42;0.50;0.42">、dur 20-40s、calcMode spline
  var AVIG_BREATHE = /id="avig"[\s\S]*?<stop offset="1" stop-color="#000" stop-opacity="0.42"><animate attributeName="stop-opacity" values="0.42;0.50;0.42" dur="(\d+)s" repeatCount="indefinite" calcMode="spline"/;
  var tense = buildSceneSVG({ region: 'beach', mood: 'tense' });
  ok('Z1 张力 mood(tense)→ vignette 外圈 stop 挂 SMIL stop-opacity 呼吸(0.42→0.50→0.42)', AVIG_BREATHE.test(tense));
  ok('Z2 四个张力 mood(tense/dread/eerie/horror-climax)均触发呼吸 avig', ['tense', 'dread', 'eerie', 'horror-climax'].every(function (m) { return AVIG_BREATHE.test(buildSceneSVG({ region: 'night', mood: m })); }));
  ok('Z3 呼吸 dur 落 20-40s 区间(确定性 hash;烛火/心跳级缓慢)', (function () { var md = AVIG_BREATHE.exec(tense); var d = +md[1]; return d >= 20 && d <= 40; })());
  // 非张力 mood / 无 mood → 静态 avig 字节完全不变(与旧版逐字相同)
  var STATIC_AVIG = '<radialGradient id="avig" cx="0.5" cy="0.5" r="0.72"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.42"/></radialGradient>';
  ok('Z4 非张力 mood(calm)→ 静态 avig 字节不变(无 stop-opacity 呼吸 animate)', (function () { var s = buildSceneSVG({ region: 'beach', mood: 'calm' }); return s.indexOf(STATIC_AVIG) >= 0 && s.indexOf('values="0.42;0.50;0.42"') < 0; })());
  ok('Z5 无 mood → 静态 avig 字节不变 + 仍 3 rect(保 B2/K7/N9/O9 无 mood 精确计数)', (function () { var s = buildSceneSVG({ region: 'beach' }); return s.indexOf(STATIC_AVIG) >= 0 && count(s, '<rect') === 3 && s.indexOf('values="0.42;0.50;0.42"') < 0; })());
  ok('Z6 呼吸用 SMIL <animate> 非 CSS @keyframes(保 H7;tense 场景无 eyes/dice→无 @keyframes)', tense.indexOf('@keyframes') < 0);
  ok('Z7 呼吸用 stop-color="#000"(非 fill="#000")→ 不破 I1:tense 场景 fill="#000" 计数仍 0', count(tense, 'fill="#000"') === 0);
  ok('Z8 呼吸不引入 rect/ellipse(仅 avig 内加 animate):tense 不引入 ellipse', tense.indexOf('<ellipse') < 0);
  ok('Z9 呼吸确定性:同 scene(region+mood)两次构造字节相同(dur 从 hash、非 Math.random)', buildSceneSVG({ region: 'cave', mood: 'dread' }) === buildSceneSVG({ region: 'cave', mood: 'dread' }));
  // stripSmil(reduced-motion)→ 呼吸 animate 剥除,基线 stop-opacity 0.42 即静止态可见(avig 渐变仍在)
  (function () {
    global.window = { matchMedia: function (q) { return { matches: /prefers-reduced-motion/.test(q) }; } };
    var el = { innerHTML: '' }; createSvgPresenter({ container: el }).present({ view: { scene: { region: 'night', mood: 'dread' } }, pos: { map: 'm', node: 'a' } });
    delete global.window;
    ok('Z10 reduced-motion → 呼吸 animate 剥除、基线 stop-opacity 0.42 静止态可见(avig 渐变仍在)', el.innerHTML.indexOf('attributeName="stop-opacity"') < 0 && el.innerHTML.indexOf('stop-opacity="0.42"') >= 0 && el.innerHTML.indexOf('id="avig"') >= 0);
  })();
})();

// AA. V2 环境色相极缓流转(表现力升级:dusk/aurora/dreamlike → agrade hueRotate + 窄幅 ±15° SMIL 往返;不撞既有词、otherworld 整周不变、确定性、3 rect 不破)
(function () {
  // dusk(deg 18)→ 窄幅往返 values="3;33;3"(18-15;18+15;18-15)、dur 36s、calcMode spline
  var dusk = buildSceneSVG({ region: 'beach', mood: 'dusk' });
  ok('AA1 环境 mood(dusk)→ agrade feColorMatrix hueRotate + 窄幅 ±15° SMIL 往返(values="3;33;3" dur 36s spline)', dusk.indexOf('id="agrade"') >= 0 && dusk.indexOf('type="hueRotate"') >= 0 && dusk.indexOf('<animate attributeName="values" values="3;33;3" dur="36s" repeatCount="indefinite" calcMode="spline"') >= 0);
  ok('AA2 aurora(deg 120)→ 窄幅往返 values="105;135;105"', buildSceneSVG({ region: 'night', mood: 'aurora' }).indexOf('values="105;135;105"') >= 0);
  ok('AA3 dreamlike(deg 60)→ 窄幅往返 values="45;75;45"', buildSceneSVG({ region: 'forest', mood: 'dreamlike' }).indexOf('values="45;75;45"') >= 0);
  ok('AA4 窄幅往返用 SMIL <animate> 非 CSS @keyframes(保 H7;dusk 场景无 eyes/dice→无 @keyframes)', dusk.indexOf('@keyframes') < 0);
  // 关键:既有 otherworld/fae/astral 整周 360° 流转字节不变(只对带 sweep 的新词走窄幅分支)
  var ow = buildSceneSVG({ region: 'sea', mood: 'otherworld' });
  ok('AA5 otherworld 整周流转不变:values="150;510"(deg;deg+360)+ dur 18s(无 sweep 分支侵入)', ow.indexOf('<animate attributeName="values" values="150;510" dur="18s" repeatCount="indefinite"/>') >= 0 && ow.indexOf('dur="36s"') < 0);
  ok('AA6 fae/astral 整周流转不变(values=deg;deg+360、dur 18s、无窄幅)', (function () { var f = buildSceneSVG({ mood: 'fae' }), a = buildSceneSVG({ mood: 'astral' }); return f.indexOf('values="90;450" dur="18s"') >= 0 && a.indexOf('values="200;560" dur="18s"') >= 0 && f.indexOf('dur="36s"') < 0 && a.indexOf('dur="36s"') < 0; })());
  // 内容层包进 <g filter url(agrade)>(整场调色,同 R2)
  ok('AA7 环境 mood 内容层包进 <g filter="url(#agrade)">(整场调色,同 hueRotate 族)', dusk.indexOf('<g filter="url(#agrade)">') >= 0);
  // 不撞六表:dusk/aurora/dreamlike 不触发 MOOD_TINT/FOG_TINT/LIGHT_MOODS/WEATHER/DISPLACE(只 agrade)
  ok('AA8 新词不撞 MOOD_TINT(dusk 无 tint 覆盖色;非 calm/tense/eerie…)', dusk.indexOf('rgba(170,30,30') < 0 && dusk.indexOf('rgba(40,90,170') < 0 && dusk.indexOf('rgba(80,30,120') < 0);
  ok('AA9 新词不撞 FOG_TINT/LIGHT_MOODS/WEATHER/DISPLACE(dusk 无 afog/gr_/amatlas-weather/adisp)', dusk.indexOf('afog') < 0 && dusk.indexOf('gr_') < 0 && dusk.indexOf('amatlas-weather') < 0 && dusk.indexOf('adisp') < 0);
  ok('AA10 dusk≠dawn(dawn=LIGHT_MOODS god-rays;dusk=agrade hueRotate):dawn 注入 god-rays、dusk 注入 agrade', buildSceneSVG({ region: 'beach', mood: 'dawn' }).indexOf('gr_beach') >= 0 && dusk.indexOf('gr_') < 0 && dusk.indexOf('agrade') >= 0);
  // 字节安全:环境 mood 不破 rect 计数(只加 filter + 包 <g>,不加 rect);不写字面 #000
  ok('AA11 环境 mood 不破 rect 计数:beach+dusk 仍 3 rect(只加 filter + 包 <g>)', count(dusk, '<rect') === 3);
  ok('AA12 环境 mood 不引入 ellipse / 不写字面 #000:forest+dreamlike 无 ellipse、无 #000', (function () { var s = buildSceneSVG({ region: 'forest', mood: 'dreamlike' }); return s.indexOf('<ellipse') < 0 && s.indexOf('fill="#000"') < 0; })());
  ok('AA13 环境流转确定性:同 scene 两次构造字节相同', buildSceneSVG({ region: 'night', mood: 'aurora' }) === buildSceneSVG({ region: 'night', mood: 'aurora' }));
  // stripSmil(reduced-motion)→ 窄幅 animate 剥除,基线 hueRotate values=deg 即静止态可见
  (function () {
    global.window = { matchMedia: function (q) { return { matches: /prefers-reduced-motion/.test(q) }; } };
    var el = { innerHTML: '' }; createSvgPresenter({ container: el }).present({ view: { scene: { region: 'beach', mood: 'dusk' } }, pos: { map: 'm', node: 'a' } });
    delete global.window;
    ok('AA14 reduced-motion → 窄幅 animate 剥除、基线 hueRotate values="18" 静止态可见', el.innerHTML.indexOf('<animate attributeName="values"') < 0 && el.innerHTML.indexOf('type="hueRotate" values="18"') >= 0);
  })();
})();

// BB. 场景生态 region 收 5(signoff 三:desert/snowfield/volcano/skyclouds/swamp)——纯加性映射,零新增契约字段;
//     desert/skyclouds 新剪影(silDunes/silClouds),snowfield/volcano 复用 mountains、swamp 复用 trees(零新剪影函数);
//     守:种子 PRNG 确定性 / 仅 path/circle/line 不破元素计数 / 绝不字面 #000 / SMIL 非 @keyframes / 停止态基线可见 / 旧 region 零回归。
(function () {
  // stripSmil 复刻(同 present() 的 reduced-motion 剥除逻辑:基线属性=停止态可见)
  function stripSmil(svg) {
    return svg
      .replace(/<animate(?:Transform|Motion)?\b[^>]*\/>/g, '')
      .replace(/<animate(?:Transform|Motion)?\b[^>]*>[\s\S]*?<\/animate(?:Transform|Motion)?>/g, '');
  }
  // BB1-BB5. 各新 region:基色(linearGradient#asky 中段保留原色)+ data-region 钩子 + 户外 region 画剪影 path
  ok('BB1 desert → 基色 #cf8b3a + data-region + 剪影 <path>', (function () { var s = buildSceneSVG({ region: 'desert' }); return s.indexOf('stop-color="#cf8b3a"') >= 0 && s.indexOf('data-region="desert"') >= 0 && s.indexOf('<path') >= 0; })());
  ok('BB2 snowfield → 基色 #e3ecf5(高明度冷白蓝)+ 剪影 <path>(复用 mountains)', (function () { var s = buildSceneSVG({ region: 'snowfield' }); return s.indexOf('stop-color="#e3ecf5"') >= 0 && s.indexOf('<path') >= 0; })());
  ok('BB3 volcano → 基色 #2a1410(暗红黑)+ 剪影 <path>(复用 mountains)', (function () { var s = buildSceneSVG({ region: 'volcano' }); return s.indexOf('stop-color="#2a1410"') >= 0 && s.indexOf('<path') >= 0; })());
  ok('BB4 skyclouds → 基色 #5b9bd5(日间天青蓝)+ 剪影 <path>(silClouds)', (function () { var s = buildSceneSVG({ region: 'skyclouds' }); return s.indexOf('stop-color="#5b9bd5"') >= 0 && s.indexOf('<path') >= 0; })());
  ok('BB5 swamp → 基色 #33402b(暗哑橄榄绿)+ 剪影 <path>(复用 trees)', (function () { var s = buildSceneSVG({ region: 'swamp' }); return s.indexOf('stop-color="#33402b"') >= 0 && s.indexOf('<path') >= 0; })());
  // BB6-BB8. 家族识别:中英近义词归族 + **swamp 必须在 sea 之前**(sea 含 lake/river 会抢 bog/marsh/wetland)
  ok('BB6 近义词归族(中英):沙漠/dune→desert、glacier/雪原→snowfield、lava/火山→volcano、cloud/苍穹→skyclouds、marsh/沼泽→swamp', (function () {
    var map = { '沙漠': '#cf8b3a', 'dune': '#cf8b3a', 'glacier': '#e3ecf5', '雪原': '#e3ecf5', 'lava field': '#2a1410', '火山': '#2a1410', 'cloud': '#5b9bd5', '苍穹': '#5b9bd5', 'marsh': '#33402b', '沼泽': '#33402b' };
    for (var k in map) if (buildSceneSVG({ region: k }).indexOf('stop-color="' + map[k] + '"') < 0) return false;
    return true;
  })());
  ok('BB7 顺序敏感:swamp 行在 sea 之前 → wetland/bog→swamp(#33402b);lake/river/海→sea(#1d6a8f)不被沼泽抢', (function () {
    return buildSceneSVG({ region: 'wetland' }).indexOf('#33402b') >= 0 && buildSceneSVG({ region: 'bog' }).indexOf('#33402b') >= 0
      && buildSceneSVG({ region: 'lake' }).indexOf('stop-color="#1d6a8f"') >= 0 && buildSceneSVG({ region: 'bog' }).indexOf('stop-color="#1d6a8f"') < 0;
  })());
  ok('BB8 新近义词与既有 8 条零交集:village 仍 town(#9aa0a6)、dungeon 仍 cave(#36332e)(不被新词误吞)', buildSceneSVG({ region: 'village' }).indexOf('#9aa0a6') >= 0 && buildSceneSVG({ region: 'dungeon' }).indexOf('#36332e') >= 0);
  // BB9-BB10. 新剪影 silDunes/silClouds:贝塞尔平滑(midpoints+smoothTopPath→Q 命令)+ silClouds **正向 shade(亮云)**(逆于其它逆光深色剪影)
  ok('BB9 silDunes 圆润沙丘:贝塞尔平滑 <path d 含 Q + 派生深色逆光 + 顶缘受光 stroke(不写字面 #000)', (function () { var s = buildSceneSVG({ region: 'desert' }); return /<path d="M[^"]*Q[^"]*"/.test(s) && s.indexOf('fill="none" stroke="#') >= 0 && s.indexOf('fill="#000"') < 0; })());
  ok('BB10 silClouds 亮云岸:首层云 fill 比天空基色 #5b9bd5 更亮(正向 shade,逆于逆光深色剪影)', (function () {
    var s = buildSceneSVG({ region: 'skyclouds' });
    function lum(h) { return 0.2126 * parseInt(h.slice(1, 3), 16) + 0.7152 * parseInt(h.slice(3, 5), 16) + 0.0722 * parseInt(h.slice(5, 7), 16); }
    var m = /<path d="M[^"]*" fill="(#[0-9a-f]{6})"/i.exec(s);
    return !!m && lum(m[1]) > lum('#5b9bd5');
  })());
  // BB11-BB14. buildAtmosphere 点缀:各 region 专属点缀色 + 只用 circle/line(不引入 ellipse/rect/path → 保 B2/K7/H 计数)
  ok('BB11 desert 暮空稀星(暖白 #f0e2c0)/ snowfield 雪面冰晶反光(冷蓝白 #dfeeff)', buildSceneSVG({ region: 'desert' }).indexOf('#f0e2c0') >= 0 && buildSceneSVG({ region: 'snowfield' }).indexOf('#dfeeff') >= 0);
  ok('BB12 volcano 飞溅余烬(熔岩温度色 #ff6a3c 或 #e84a2a)/ swamp 鬼火磷火(#8ad06a 或 #6ad0c0)', (buildSceneSVG({ region: 'volcano' }).indexOf('#ff6a3c') >= 0 || buildSceneSVG({ region: 'volcano' }).indexOf('#e84a2a') >= 0) && (buildSceneSVG({ region: 'swamp' }).indexOf('#8ad06a') >= 0 || buildSceneSVG({ region: 'swamp' }).indexOf('#6ad0c0') >= 0));
  ok('BB13 skyclouds 高空阳光斑(#fff4d0)+ 远处飞鸟(双 line 拼 V,沿 animateMotion 闭环飘——氛围层只用 circle/line)', (function () { var s = buildSceneSVG({ region: 'skyclouds' }); return s.indexOf('#fff4d0') >= 0 && s.indexOf('<line') >= 0 && s.indexOf('<animateMotion') >= 0; })());
  ok('BB14 点缀只用 circle/line:5 新 region 均不引入 ellipse、不写字面 #000(保 H/I/L/N 计数)', ['desert', 'snowfield', 'volcano', 'skyclouds', 'swamp'].every(function (r) { var s = buildSceneSVG({ region: r }); return s.indexOf('<ellipse') < 0 && s.indexOf('fill="#000"') < 0; }));
  // BB15. rect 计数零回归:5 新 region 无 mood 时均仍 3 rect(背景渐变 + 地平线 + vignette;剪影/点缀全 path/circle/line)
  ok('BB15 rect 计数守恒:5 新 region 无 mood 均仍 3 rect(保 B2/K7 基线,不引入 rect)', ['desert', 'snowfield', 'volcano', 'skyclouds', 'swamp'].every(function (r) { return count(buildSceneSVG({ region: r }), '<rect') === 3; }));
  // BB16. 动态用 SMIL <animate> 非 CSS @keyframes(保 H7;无 eyes/dice 场景不应出现 @keyframes)
  ok('BB16 点缀动态用 SMIL <animate> 非 CSS @keyframes(保 H7):5 新 region(无 eyes/dice)均无 @keyframes 且有 <animate>', ['desert', 'snowfield', 'volcano', 'skyclouds', 'swamp'].every(function (r) { var s = buildSceneSVG({ region: r }); return s.indexOf('@keyframes') < 0 && s.indexOf('<animate') >= 0; }));
  // BB17. 确定性:种子 PRNG(region+mood hash)→ 同 scene 两次构造字节相同(沿 far→near rng 消耗顺序)
  ok('BB17 确定性:5 新 region 各两次构造字节完全相同(种子 PRNG,非 Math.random)', ['desert', 'snowfield', 'volcano', 'skyclouds', 'swamp'].every(function (r) { return buildSceneSVG({ region: r, mood: 'calm' }) === buildSceneSVG({ region: r, mood: 'calm' }); }));
  // BB18. 停止态基线可见:stripSmil(reduced-motion)剥除 SMIL 后,剪影 <path> + 点缀 circle/line 仍在(非消失)
  ok('BB18 停止态基线可见:stripSmil 剥除 SMIL 后,5 新 region 剪影 path + 点缀 circle/line 仍在(reduced-motion/探针单帧可见)', ['desert', 'snowfield', 'volcano', 'skyclouds', 'swamp'].every(function (r) {
    var stripped = stripSmil(buildSceneSVG({ region: r }));
    return stripped.indexOf('<animate') < 0 && stripped.indexOf('<path') >= 0 && (stripped.indexOf('<circle') >= 0 || stripped.indexOf('<line') >= 0);
  }));
  // BB19. 旧 region 零回归:既有户外 region 基色/剪影/rect 计数字节级不变(纯加性,既有场景不受影响)
  ok('BB19 旧 region 零回归:beach 仍 #e9d8a6+3 rect、forest 仍 #386641+剪影 path、night 仍 3 rect(纯加性不影响既有)', (function () {
    var b = buildSceneSVG({ region: 'beach' }), f = buildSceneSVG({ region: 'forest' }), nt = buildSceneSVG({ region: 'night' });
    return b.indexOf('#e9d8a6') >= 0 && count(b, '<rect') === 3 && f.indexOf('#386641') >= 0 && f.indexOf('<path') >= 0 && count(nt, '<rect') === 3;
  })());
})();

// PP. 表现力升级:新增天气粒子(ash/ember/sandstorm/leaves/groundfog)+ ash/sand 背景双层纵深
//     mood 开放词(零碰撞六表 MOOD_TINT/VIG_BREATHE/FOG_TINT/LIGHT_MOODS/WEATHER/FILM_GRADE/DISPLACE)、
//     确定性(seeded mulberry32)、rgba 不写字面 #000、不增 rect/ellipse、SMIL 非 @keyframes、停止态基线可见。
(function () {
  function stripSmil(svg) {
    return svg.replace(/<animate(?:Transform|Motion)?\b[^>]*\/>/g, '').replace(/<animate(?:Transform|Motion)?\b[^>]*>[\s\S]*?<\/animate(?:Transform|Motion)?>/g, '');
  }
  var WX = [
    { m: 'ash',       region: 'volcano', cls: 'amatlas-weather-ash',       prim: '<circle' },
    { m: 'ember',     region: 'volcano', cls: 'amatlas-weather-ember',     prim: '<circle' },
    { m: 'sandstorm', region: 'desert',  cls: 'amatlas-weather-sand',      prim: '<line' },
    { m: 'leaves',    region: 'forest',  cls: 'amatlas-weather-leaf',      prim: '<path' },
    { m: 'groundfog', region: 'swamp',   cls: 'amatlas-weather-groundfog', prim: '<path' }
  ];
  // PP1 各新词触发对应粒子层 + 主图元(ash/ember=circle、sand=line、leaf/groundfog=path)
  ok('PP1 5 新天气词各触发 amatlas-weather-X 层 + 主图元', WX.every(function (w) { var s = buildSceneSVG({ region: w.region, mood: w.m }); return s.indexOf('class="' + w.cls + '"') >= 0 && s.indexOf(w.prim) >= 0; }));
  // PP2 各自核心运动特征:ember 明灭(animate opacity)、leaf 翻转(type=rotate,整周或摆动)、groundfog 往返(负偏移 + spline)、sand 横扫(<line + translate)、ash 沉降(translate)
  ok('PP2 核心运动特征:ember animate opacity / leaf type=rotate(0;360|-34;34;-34)/ groundfog 往返负偏移 spline / ash·sand translate', (function () {
    var ember = buildSceneSVG({ region: 'volcano', mood: 'ember' });
    var leaf = buildSceneSVG({ region: 'forest', mood: 'leaves' });
    var gfog = buildSceneSVG({ region: 'swamp', mood: 'groundfog' });
    var ash = buildSceneSVG({ region: 'volcano', mood: 'ash' });
    return ember.indexOf('<animate attributeName="opacity"') >= 0
      && leaf.indexOf('type="rotate"') >= 0 && (leaf.indexOf('values="0;360"') >= 0 || leaf.indexOf('values="-34;34;-34"') >= 0)
      && gfog.indexOf('calcMode="spline"') >= 0 && /values="-\d[\d.]*,0;/.test(gfog)
      && ash.indexOf('type="translate"') >= 0;
  })());
  // PP3 mood-gated 字节安全:无 mood/非天气 mood 不注入天气;新词不误触六表(无 afog/gr_/agrade/adisp/MOOD_TINT)
  ok('PP3 mood-gated:volcano 无 mood 不含 amatlas-weather-;5 新词均不触发 afog/gr_/agrade/adisp', (function () {
    if (buildSceneSVG({ region: 'volcano' }).indexOf('amatlas-weather-') >= 0) return false;
    return WX.every(function (w) { var s = buildSceneSVG({ region: w.region, mood: w.m }); return s.indexOf('afog') < 0 && s.indexOf('gr_') < 0 && s.indexOf('id="agrade"') < 0 && s.indexOf('id="adisp"') < 0; });
  })());
  // PP4 确定性:各新词同 scene 两次构造字节完全相同(seeded,非 Math.random)
  ok('PP4 确定性:5 新词各两次构造字节相同', WX.every(function (w) { return buildSceneSVG({ region: w.region, mood: w.m }) === buildSceneSVG({ region: w.region, mood: w.m }); }));
  // PP5 不写字面 #000(rgba 粒子色)
  ok('PP5 5 新词均不写字面 fill="#000"(rgba 粒子色)', WX.every(function (w) { return buildSceneSVG({ region: w.region, mood: w.m }).indexOf('fill="#000"') < 0; }));
  // PP6 rect 计数守恒===3(新粒子用 circle/line/path、groundfog 用 path、无 lightning rect;背景层用 <g>+circle/line 不增 rect)
  ok('PP6 rect 计数守恒:5 新词均仍 3 rect(粒子只用 circle/line/path)', WX.every(function (w) { return count(buildSceneSVG({ region: w.region, mood: w.m }), '<rect') === 3; }));
  // PP7 无 ellipse(红队 fix4:堵 leaf/ember 误用 ellipse 回归)
  ok('PP7 5 新词均不引入 <ellipse>', WX.every(function (w) { return buildSceneSVG({ region: w.region, mood: w.m }).indexOf('<ellipse') < 0; }));
  // PP8 无 dur="NaN"(红队 fix1:命名接缝守门——统一 cfg.speed 键,任何混名漏读会现 NaN)
  ok('PP8 5 新词均无 dur="NaN"(统一 speed 键根除 NaN 接缝)', WX.every(function (w) { return buildSceneSVG({ region: w.region, mood: w.m }).indexOf('dur="NaN"') < 0; }));
  // PP9 停止态基线可见(沿 BB18):stripSmil 剥除 SMIL 后各新词粒子图元仍在;ember 火烬 circle 元素属性 opacity 非零(reduced-motion/probe 单帧可见)
  ok('PP9 停止态可见:stripSmil 后 5 新词主图元仍在 + ember circle 元素 opacity 非零', (function () {
    if (!WX.every(function (w) { var st = stripSmil(buildSceneSVG({ region: w.region, mood: w.m })); return st.indexOf('class="' + w.cls + '"') >= 0 && st.indexOf(w.prim) >= 0 && st.indexOf('<animate') < 0; })) return false;
    var se = stripSmil(buildSceneSVG({ region: 'volcano', mood: 'ember' }));
    return /class="amatlas-weather-ember">[\s\S]*?<circle[^>]*opacity="0\.[1-9]/.test(se);
  })());
  // PP10 背景双层纵深(红队 fix3:受控 class 标志比较,绝不用 indexOf('<path')):ash/sand 有 -far 在前景前、在 asky 后;稀疏三词无 -far
  ok('PP10 深度:ash/sand 背景层 amatlas-weather-X-far 在前景 X 之前、在 url(#asky) 之后;ember/leaf/groundfog 无 -far(稀疏单层)', (function () {
    function z(region, mood, kind) {
      var s = buildSceneSVG({ region: region, mood: mood });
      var far = s.indexOf('amatlas-weather-' + kind + '-far"'), fg = s.indexOf('amatlas-weather-' + kind + '"'), asky = s.indexOf('url(#asky)');
      return far >= 0 && fg >= 0 && asky >= 0 && far < fg && far > asky;
    }
    if (!z('volcano', 'ash', 'ash') || !z('desert', 'sandstorm', 'sand')) return false;
    return [['volcano', 'ember'], ['forest', 'leaves'], ['swamp', 'groundfog']].every(function (p) { return buildSceneSVG({ region: p[0], mood: p[1] }).indexOf('-far"') < 0; });
  })());
  // PP11 别名共用 cfg(沿 drizzle/flurry):ashfall/volcanicash→ash、embers/cinders→ember、sandblast/dustsquall→sand、leaffall/fallingleaves→leaf
  ok('PP11 别名触发同款层(ashfall→ash / cinders→ember / dustsquall→sand / fallingleaves→leaf)', (function () {
    return buildSceneSVG({ region: 'volcano', mood: 'ashfall' }).indexOf('amatlas-weather-ash') >= 0
      && buildSceneSVG({ region: 'volcano', mood: 'cinders' }).indexOf('amatlas-weather-ember') >= 0
      && buildSceneSVG({ region: 'desert', mood: 'dustsquall' }).indexOf('amatlas-weather-sand') >= 0
      && buildSceneSVG({ region: 'forest', mood: 'fallingleaves' }).indexOf('amatlas-weather-leaf') >= 0;
  })());
  // PP12 雷闪 bolt(storm)分叉闪电:含 amatlas-weather-bolt + 双层描边 path(外辉蓝紫 + 内芯白蓝)+ 保留全屏 #eaf0ff(P3 不动)
  ok('PP12 雷闪 bolt:storm 含 amatlas-weather-bolt 分叉 path(外辉 rgba(150,170,255)+内芯 rgba(235,245,255))+ 保留 #eaf0ff', (function () {
    var s = buildSceneSVG({ region: 'sea', mood: 'storm' });
    return s.indexOf('class="amatlas-weather-bolt"') >= 0 && s.indexOf('stroke="rgba(150,170,255,0.55)"') >= 0 && s.indexOf('stroke="rgba(235,245,255,0.95)"') >= 0 && s.indexOf('#eaf0ff') >= 0;
  })());
  // PP13 雷闪不破既有断言:storm 含 bolt 后仍确定性 + beach+storm = 5 rect(round12 起:3 基线 + 1 闪电 + 1 MOOD_TINT;bolt 仍是 path 不加 rect)
  ok('PP13 雷闪确定性 + rect 守恒:storm 两次字节相同;beach+storm = 5 rect(bolt=path 不加 rect)', (function () {
    var a = buildSceneSVG({ region: 'sea', mood: 'storm' });
    return a === buildSceneSVG({ region: 'sea', mood: 'storm' }) && count(buildSceneSVG({ region: 'beach', mood: 'storm' }), '<rect') === 5;
  })());
})();

// PL. 多物件深度构图(placeElements:N≥2 物件 x 均布 + 近大远小;canonical 渲染→<g translate/scale> 包裹;画家序;独立 |place 种子)
//     物理默认非主观构图(无三分/黄金分割锚定=§11)、确定性、N=1 字节不变(单物件保 slot 位)、dice 豁免。
(function () {
  var mr = (function () { return function (seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) | 0; var z = Math.imul(s ^ s >>> 15, 1 | s); z = (z + Math.imul(z ^ z >>> 7, 61 | z)) ^ z; return ((z ^ z >>> 14) >>> 0) / 4294967296; }; }; })();
  // PL1 n≤1 → canonical {40,108,1}(单物件/无物件走旧 slot 位字节不变)
  ok('PL1 placeElements(1)=canonical {x:40,y:108,scale:1} / placeElements(0) 同', JSON.stringify(placeElements(1, mr(1))) === '[{"x":40,"y":108,"scale":1}]' && JSON.stringify(placeElements(0, mr(1))) === '[{"x":40,"y":108,"scale":1}]');
  // PL2 近大远小:scale 与 y 随 k 严格递增(strict by t,可测)
  ok('PL2 placeElements(4) scale 与 y 严格递增(近大远小+接地;k=0 远 t=0,脚踩后退地平线)', (function () { var a = placeElements(4, mr(7)); for (var i = 1; i < 4; i++) if (!(a[i].scale > a[i - 1].scale && a[i].y > a[i - 1].y)) return false; return Math.abs(a[0].scale - 0.62) < 1e-9 && Math.abs(a[3].scale - 1) < 1e-9 && a.every(function (o) { return o.y + 14 * o.scale >= 116 && o.y + 14 * o.scale <= 130; }); })());
  // PL3 任意 N 无 NaN + x 在 [20,W-20];确定性(同 seed 两次相等)
  ok('PL3 placeElements(6) 全有限 + x∈[20,300] + 确定性', (function () { var f = mr(3), a = placeElements(6, f), g = placeElements(6, mr(3)); return a.every(function (o) { return isFinite(o.x) && isFinite(o.y) && isFinite(o.scale) && o.x >= 20 && o.x <= 300; }) && JSON.stringify(a) === JSON.stringify(g); })());
  // PL4 N=1 场景保 canonical 位(单物件 art/glyph 仍 translate(40,108)、无 scale wrapper)
  ok('PL4 单物件场景字节保位:item art 仍 translate(40,108)、无 " scale(" wrapper', (function () { var s = buildSceneSVG({ elements: [{ kind: 'item', art: 'ship' }] }); return s.indexOf('translate(40,108)') >= 0 && s.indexOf(') scale(') < 0; })());
  // PL5 N≥2 触发深度 wrapper:出现 <g transform="translate(x,y) scale(s)"> + 两物件都在(两 ref)
  ok('PL5 N≥2 深度 wrapper 出现 + 两物件都渲染', (function () { var s = buildSceneSVG({ region: 'forest', elements: [{ kind: 'character', ref: 'a' }, { kind: 'item', ref: 'b' }] }); return /<g transform="translate\([0-9.]+,[0-9.]+\) scale\([0-9.]+\)">/.test(s) && s.indexOf('>a<') >= 0 && s.indexOf('>b<') >= 0; })());
  // PL6 近大远小真生效:N≥2 场景 ≥2 个不同 scale 值
  ok('PL6 N≥2 ≥2 个不同 scale(近大远小):forest 3 物件', (function () { var s = buildSceneSVG({ region: 'forest', elements: [{ kind: 'item' }, { kind: 'hazard' }, { kind: 'exit' }] }); var m = s.match(/ scale\(([0-9.]+)\)/g) || []; var u = {}; m.forEach(function (x) { u[x] = 1; }); return Object.keys(u).length >= 2; })());
  // PL7 画家序:远(小 scale)wrapper 文档序早于近(大 scale)wrapper(k=0 远先画)
  ok('PL7 画家序:首个 wrapper scale < 末个 wrapper scale(远先画近后画)', (function () { var s = buildSceneSVG({ region: 'forest', elements: [{ kind: 'character' }, { kind: 'item' }, { kind: 'exit' }] }); var m = s.match(/ scale\(([0-9.]+)\)/g); return m && m.length >= 2 && parseFloat(m[0].slice(7)) < parseFloat(m[m.length - 1].slice(7)); })());
  // PL8 独立 |place 种子:加物件不扰背景——同 region 的首个剪影 path 在"有物件"与"无物件"场景字节相同(不破 silhouette/atmosphere 确定性)
  ok('PL8 独立 |place 种子不扰背景:forest 首剪影 path 在 有/无物件 场景字节相同', (function () { function sil(s) { var m = /<path d="M[^"]*" fill="[^"]*"/.exec(s); return m ? m[0] : null; } var a = sil(buildSceneSVG({ region: 'forest' })), b = sil(buildSceneSVG({ region: 'forest', elements: [{ kind: 'item' }, { kind: 'character' }] })); return a && a === b; })());
  // PL9 dice 豁免:dice 不参与深度排布(沿用 slot 位、不缩放);[character,dice] dice 卷轴/clipPath 几何不变(混排零回归)
  ok('PL9 dice 豁免:[item,dice] dice 用 slot 位 cx=100(40+1*60)、未被 scale 包裹', (function () { var s = buildSceneSVG({ elements: [{ kind: 'item' }, { kind: 'dice', ref: '7' }] }); return s.indexOf('class="amatlas-die"') >= 0 && s.indexOf('amatlas-die-shadow" cx="100"') >= 0; })());
})();

// A2(fail-loud):eyes.ref 无效(非 'fullscreen'/非正整数,如实体名)→ warn-once + 退化 2 眼;合法值/缺省不 warn
(function () {
  function warns(ref) { var w = 0; var o = console.warn; console.warn = function () { w++; }; buildSceneSVG({ region: 'night', mood: 'dread', elements: [{ kind: 'eyes', ref: ref }] }); console.warn = o; return w; }
  ok('A2a eyes.ref="天裂之眼"(实体名)→ warn(对称 art 预设名 fail-loud,作者以为全屏巨眼实为 2 眼)', warns('天裂之眼') > 0);
  ok('A2b eyes.ref="fullscreen"/"3"/缺省 → 不 warn(合法值零误报)', warns('fullscreen') === 0 && warns('3') === 0 && warns(undefined) === 0);
})();

// P. 死亡演出词汇扩(2026-06):eyes.state 加 closed/crying/swarm + 新 element.kind claw/swallow
//    每词汇 ≥1 变异验牙(分支泄漏到默认/兄弟态 → 红);H 段精确计数测试零回归(已通过 313 现有)
function eyesSvg(state, ref) {
  return buildSceneSVG({ region: 'cave', mood: 'horror-climax', elements: [{ kind: 'eyes', state: state, ref: ref || 'fullscreen' }] });
}

// P1 closed:无白睛 ellipse / 无瞳孔 circle / 无 catchlight(变异=分支泄漏到 watching→出现→红)
(function () {
  var sC = eyesSvg('closed');
  var sW = eyesSvg('watching');
  ok('P1a closed 出现 amatlas-lid + amatlas-lid-line(闭眼皮 + 缝线;变异=漏画 lid-line→红)', sC.indexOf('amatlas-lid-line') >= 0 && sC.indexOf('amatlas-lid') >= 0);
  ok('P1b closed 不出现 amatlas-drip(变异=分支泄漏到 bleeding→红)', sC.indexOf('amatlas-drip') < 0);
  ok('P1c closed 不出现 amatlas-tear(变异=分支泄漏到 crying→红)', sC.indexOf('amatlas-tear') < 0);
  ok('P1d watching 出现 amatlas-lid 但无 amatlas-lid-line(用 lidPath 做眨眼,不画缝线;反向变异=closed 误写 lid 而漏 lid-line)', sW.indexOf('amatlas-lid') >= 0 && sW.indexOf('amatlas-lid-line') < 0);
})();

// P2 crying:amatlas-tear ≥2 / 无 amatlas-drip 红血 / 蓝白色泪滴
(function () {
  var sR = eyesSvg('crying');
  var tearCount = sR.split('amatlas-tear').length - 1;
  ok('P2a crying 出现 ≥2 条 amatlas-tear(2-3 条克制,vs bleeding ≥3;变异=条数泄漏到 1 或 bleeding 框架→红)', tearCount >= 2, 'tearCount=' + tearCount);
  ok('P2b crying 不出现 amatlas-drip 红血(变异=分支泄漏到 bleeding→红)', sR.indexOf('amatlas-drip') < 0);
  ok('P2c crying 出泪滴蓝白 #a8c5d8(变异=误用 #9e2a2b 红血→红)', sR.indexOf('#a8c5d8') >= 0 && sR.indexOf('#9e2a2b') < 0);
})();

// P3 swarm:数量 ≥6(默认)/ ref='fullscreen' → 10 只(填满)/ 与 watching/bleeding ref=N 互不撞
(function () {
  var sS = eyesSvg('swarm');                 // ref='fullscreen' → swarm 模式 = 10 只
  var sS3 = eyesSvg('swarm', '3');           // ref=N → swarm N 只(显式 3 应 3)
  var sW = eyesSvg('watching', 'fullscreen');
  function eyeCount(svg) { return svg.split('class="amatlas-eye"').length - 1; }
  var nS = eyeCount(sS), nS3 = eyeCount(sS3), nW = eyeCount(sW);
  ok('P3a swarm fullscreen → ≥9 只眼(默认 10;变异=分支泄漏到 watching 全屏=1 只→红)', nS >= 9, 'nS=' + nS);
  ok('P3b swarm ref="3" → 3 只眼(显式 N 不被默认 6 覆盖)', nS3 === 3, 'nS3=' + nS3);
  ok('P3c watching fullscreen → 1 只(单眼巨眼)= 与 swarm 不撞(变异=swarm 误改 watching→红)', nW === 1, 'nW=' + nW);
})();

// P4 claw:≥3 条 amatlas-claw-mark / 出现 amatlas-claw 容器(变异=只画 1 条/分支漏→红)
(function () {
  var sCl = buildSceneSVG({ region: 'cave', mood: 'horror-climax', elements: [{ kind: 'claw' }] });
  var markCount = sCl.split('amatlas-claw-mark').length - 1;
  ok('P4a claw 出现 amatlas-claw 容器(变异=注入分支漏→红)', sCl.indexOf('class="amatlas-claw"') >= 0);
  ok('P4b claw ≥3 道平行斜痕(wolf claw mark;变异=只画 1 条→红)', markCount >= 3, 'markCount=' + markCount);
  ok('P4c claw 用深红 #9e2a2b(变异=色错→红)', sCl.indexOf('#9e2a2b') >= 0);
  ok('P4d 同 region/mood 确定性(同输入字节恒等)', sCl === buildSceneSVG({ region: 'cave', mood: 'horror-climax', elements: [{ kind: 'claw' }] }));
})();

// P5 swallow:≥5 圈同心 ellipse / 出现 amatlas-swallow / 旋转 animateTransform(变异=分支漏/圈数不够→红)
(function () {
  var sSw = buildSceneSVG({ region: 'cave', mood: 'horror-climax', elements: [{ kind: 'swallow' }] });
  ok('P5a swallow 出现 amatlas-swallow 容器(变异=注入分支漏→红)', sSw.indexOf('class="amatlas-swallow"') >= 0);
  ok('P5b swallow 出 animateTransform rotate(缓慢旋转;变异=漏动画→红)', sSw.indexOf('animateTransform') >= 0 && sSw.indexOf('type="rotate"') >= 0);
  var atlasSwallowIdx = sSw.indexOf('amatlas-swallow');
  var ellipses = sSw.slice(atlasSwallowIdx).split('<ellipse').length - 1;
  ok('P5c swallow ≥5 圈同心 ellipse(变异=圈数不够/分支漏→红)', ellipses >= 5, 'ellipses=' + ellipses);
  ok('P5d swallow amatlas-swallow 内不写 #000 字面(派生暗色;变异=便利写 #000→红)', sSw.slice(atlasSwallowIdx, atlasSwallowIdx + 2000).indexOf('fill="#000"') < 0);
})();

// P6 未知 eyes.state warn-once + 退化 watching(fail-loud over fail-silent;开放词汇语义)
(function () {
  var warns = [], oldWarn = console.warn; console.warn = function (s) { warns.push(String(s)); };
  var s1 = eyesSvg('exploding');                                                                   // 未知 state
  var s2 = eyesSvg('exploding');                                                                   // 同 state 第二次
  var sW = eyesSvg('watching');
  console.warn = oldWarn;
  ok('P6a 未知 state warn 一次/state(变异=每次都 warn→红;e.g. 含 exploding 的 warn 数=1)',
    warns.filter(function (w) { return /未知/.test(w) && /exploding/.test(w); }).length === 1, 'warns=' + warns.join('|'));
  ok('P6b 未知 state 退化 watching(s1 字节 === sW 字节;变异=未退化→不等→红)', s1 === sW);
})();

// QQ. 视觉批1-V2(docs/gameplay-expressiveness-plan.md §二 V2):mood 词表补键 sad/desolate ——
//     两词是 `audio-system.md`/`compose-music.js` 的正式预设名(sad="失落、告别、失败余韵",desolate=
//     "废土/雪原/遗迹"),且 `horror-game-design.md:217-218` 把它们当 `mood:` 值教学示例(`closed +
//     mood:'sad'/'desolate'`),但此前七张表全零命中 → 写了却"无演出"的静默退化,`visual-system.md:87`
//     也明写"没有专门的 sad/somber 色调"的缺口。sad → MOOD_TINT(灰蓝哀伤调)+ FILM_GRADE(desat-cold
//     族,比 dying 克制);desolate → MOOD_TINT(尘褐荒芜调)+ FOG_TINT(废土尘霾,类型片视觉惯例)。
//     每词命中 2 族(未顶格 3),故意不给 sad 补雾(哀伤不必然起雾、雨夜哀伤已有 rain 的 MOOD_TINT 覆盖,
//     语义不够明确)、不给 desolate 补 FILM_GRADE(荒芜不等于去色/濒死,语义会跑偏)。
(function () {
  var sad = buildSceneSVG({ region: 'night', mood: 'sad' });
  var deso = buildSceneSVG({ region: 'ruins', mood: 'desolate' });
  // QQ1-QQ4. sad:MOOD_TINT 灰蓝哀伤调 + FILM_GRADE desat-cold 族(与 dying/shock/numb 同 kind、更克制的 sat)
  ok('QQ1 sad → MOOD_TINT 覆盖(rgba(70,80,95,.20)灰蓝调,与 calm/cold/eerie 色相区分)+ data-mood', sad.indexOf('rgba(70,80,95,.20)') >= 0 && sad.indexOf('data-mood="sad"') >= 0);
  ok('QQ2 sad → FILM_GRADE desat-cold 族(<filter id="agrade"> + type="saturate" values="0.42",同 dying/shock/numb kind 但更克制)', sad.indexOf('<filter id="agrade"') >= 0 && sad.indexOf('type="saturate" values="0.42"') >= 0);
  ok('QQ3 sad 内容层包进 <g filter="url(#agrade)">(整场调色,同 R2/dying 族路径)', sad.indexOf('<g filter="url(#agrade)">') >= 0);
  ok('QQ4 sad 不触发雾(有意不补 FOG_TINT,语义不够明确):无 <feTurbulence>/id="afog"', sad.indexOf('<feTurbulence') < 0 && sad.indexOf('id="afog"') < 0);
  // QQ5-QQ8. desolate:MOOD_TINT 尘褐荒芜调 + FOG_TINT 废土尘霾(feColorMatrix 单位色对应 #cdc4b0)
  ok('QQ5 desolate → MOOD_TINT 覆盖(rgba(120,110,96,.22)尘褐调,与 sad/其余色相区分)+ data-mood', deso.indexOf('rgba(120,110,96,.22)') >= 0 && deso.indexOf('data-mood="desolate"') >= 0);
  ok('QQ6 desolate → FOG_TINT 注入(<feTurbulence> + id="afog" + feColorMatrix 单位色对应 #cdc4b0≈0.804/0.769/0.690)', deso.indexOf('<feTurbulence') >= 0 && deso.indexOf('id="afog"') >= 0 && deso.indexOf('0 0 0 0 0.804 0 0 0 0 0.769 0 0 0 0 0.690') >= 0);
  ok('QQ7 desolate 不触发调色(有意不补 FILM_GRADE,语义会跑偏):无 id="agrade"', deso.indexOf('id="agrade"') < 0);
  ok('QQ8 desolate 雾承载 rect fill="#fff"(非字面 #000,保 I1;同既有雾词范式)', deso.indexOf('fill="#fff" filter="url(#afog)"') >= 0);
  // QQ9-QQ11. 字节安全:不撞既有词(calm/cold/eerie/dying 色值不受影响)+ 不写字面 #000 + 不引入 ellipse(保 H/L/N 计数)
  ok('QQ9 不撞既有词:calm/cold/eerie 的 MOOD_TINT 色值不受影响(旧词零回归)', buildSceneSVG({ region: 'beach', mood: 'calm' }).indexOf('rgba(40,90,170,.14)') >= 0 && buildSceneSVG({ region: 'beach', mood: 'cold' }).indexOf('rgba(120,160,200,.14)') >= 0 && buildSceneSVG({ region: 'beach', mood: 'eerie' }).indexOf('rgba(80,30,120,.18)') >= 0);
  ok('QQ10 不撞既有词:dying 仍走原 FILM_GRADE sat=0.18(未被 sad 的新增顶掉)', buildSceneSVG({ region: 'night', mood: 'dying' }).indexOf('type="saturate" values="0.18"') >= 0);
  ok('QQ11 sad/desolate 均不引入 ellipse / 不写字面 #000(保 H/L/N 计数与 I1)', sad.indexOf('<ellipse') < 0 && sad.indexOf('fill="#000"') < 0 && deso.indexOf('<ellipse') < 0 && deso.indexOf('fill="#000"') < 0);
  // QQ12-QQ15. 精确计数:sad 双层(3 基线+1 tint)=4 rect;desolate 三层(3 基线+1 tint+1 雾承载)=5 rect
  //   (对照既有双命中词 eerie:cave+eerie 同为 MOOD_TINT+FOG_TINT 双命中 → 同为 5 rect,验证本批遵循既有叠加模式,非新增分支)
  ok('QQ12 sad 精确计数:night+sad = 4 rect(3 基线 + 1 MOOD_TINT,单命中同既有 rain/storm 模式)', count(sad, '<rect') === 4);
  ok('QQ13 desolate 精确计数:ruins+desolate = 5 rect(3 基线 + 1 MOOD_TINT + 1 雾承载,双命中同既有 eerie 模式)', count(deso, '<rect') === 5);
  ok('QQ14 对照:cave+eerie(既有 MOOD_TINT+FOG_TINT 双命中词)同为 5 rect,证 desolate 遵循既有叠加模式非新分支', count(buildSceneSVG({ region: 'cave', mood: 'eerie' }), '<rect') === 5);
  ok('QQ15 确定性:sad/desolate 场景两次构造字节相同', sad === buildSceneSVG({ region: 'night', mood: 'sad' }) && deso === buildSceneSVG({ region: 'ruins', mood: 'desolate' }));
})();

// RR. 视觉批2-V3/V4(docs/gameplay-expressiveness-plan.md §二 V3/V4):皴法式多层剪影 + 多遍抖动毛边 ——
//     5 地形族(mountains/dunes/trees/waves/towers)各自在 far/near 两层之外,叠 N 道向内收缩的纹理层
//     (cunLayers,expansion=1-i/N 递减、独立 |cun 种子流)+ 顶缘从单遍 silRim 换成 2-3 遍抖动毛边
//     (mottledRim/mottledRimStraight,独立 |rim 种子流)。两层新增均画在 far/near 之后(silFills 按出现
//     顺序取 fills[0]/fills[1] 的既有 K12/K12b 断言天然不受影响,见下方 RR1)。
//     精确计数(<path> 总数 = far+near 固定 2 〔waves 例外,详见 RR3〕 + N〔cun 层数〕+ passes〔毛边遍数〕):
//       mountains(beach/night/snowfield/volcano) N=5 passes=3 → 2+5+3=10
//       dunes(desert)                            N=3 passes=2 → 2+3+2=7
//       trees(forest/swamp)                      N=3 passes=2 → 2+3+2=7
//       waves(sea)                                N=2 passes=2 → 3(三段深度带)+2+2=7
//       towers(town/ruins)                        N=3(内层建筑) passes=2 → 2+3+2=7
(function () {
  function silFills(svg) { var out = []; svg.replace(/<path d="M[^"]*" fill="(#[0-9a-f]{6})"/g, function (_, h) { out.push(h); return _; }); return out; }
  ok('RR1 K12/K12b 引用的 fills[0]/fills[1] 仍是远/近层(新增皴法/毛边层排在两者之后,不移位既有远近断言索引):beach 前两个 fill 命中 K12b 记录的远层 shade(bg,-0.30)/近层 shade(bg,-0.52) 派生值(经 coolFar 后仍分别落在冷偏移域,近层色相与直接 shade 结果一致)',
    (function () { var f = silFills(buildSceneSVG({ region: 'beach' })); return f.length >= 2 && f[1] === '#706850'; })());   // #706850 = shade('#e9d8a6', -0.52) 的既有近层值(K5 vintage 与本次未改的 near 层字节相同,直接核对已知常量)
  ok('RR2 精确图元计数(mountains/dunes/trees/towers 各族总 <path> = 2+N+passes;beach=10/desert=7/forest=7/town=7)',
    count(buildSceneSVG({ region: 'beach' }), '<path') === 10 &&
    count(buildSceneSVG({ region: 'desert' }), '<path') === 7 &&
    count(buildSceneSVG({ region: 'forest' }), '<path') === 7 &&
    count(buildSceneSVG({ region: 'town' }), '<path') === 7);
  ok('RR3 waves 精确图元计数(3 段深度带 + N=2 皴层 + passes=2 毛边 = 7;sea)', count(buildSceneSVG({ region: 'sea' }), '<path') === 7);
  ok('RR4 复用同族的其它 region 计数一致(mountains 族:night/snowfield/volcano 同 beach=10;towers 族:ruins 同 town=7;trees 族:swamp 同 forest=7)',
    count(buildSceneSVG({ region: 'night' }), '<path') === 10 &&
    count(buildSceneSVG({ region: 'snowfield' }), '<path') === 10 &&
    count(buildSceneSVG({ region: 'volcano' }), '<path') === 10 &&
    count(buildSceneSVG({ region: 'ruins' }), '<path') === 7 &&
    count(buildSceneSVG({ region: 'swamp' }), '<path') === 7);
  ok('RR5 room/未知/空 scene 仍无 <path>(cunLayers/mottledRim 只在 buildSilhouette 派发的已知户外 region 函数内部被调用,同 K3/K4/K11 证据链)', buildSceneSVG({ region: 'room' }).indexOf('<path') < 0 && buildSceneSVG({ region: '没这个' }).indexOf('<path') < 0 && buildSceneSVG({}).indexOf('<path') < 0);
  ok('RR6 cave/skyclouds 不受 V3/V4 影响(K13 已证 cave 无远近深度概念、V1 未改;本批同理不扩,计数与改动前一致:cave=2〔钟乳石+石笋两层折线〕、skyclouds=4〔3 段深度带+1 rim,未获 cunLayers/mottledRim〕)',
    count(buildSceneSVG({ region: 'cave' }), '<path') === 2 && count(buildSceneSVG({ region: 'skyclouds' }), '<path') === 4);
  ok('RR7 确定性:5 族各自两次构造字节相同(cunLayers/mottledRim 的 |cun/|rim 子流全部确定性派生自已就位的 rng,非 Math.random)',
    ['beach', 'desert', 'forest', 'sea', 'town'].every(function (r) { return buildSceneSVG({ region: r }) === buildSceneSVG({ region: r }); }));
  // RR8:只比较皴法层本身(far/near 之后、mottledRim 之前的 N 个 <path>),隔离掉"整场因 mood 差异"这个更粗的
  //   信号(MOOD_TINT/FILM_GRADE 等无论如何都会让 calm/tense 整场字节不同,那不能证明 subSeed 真的吃到了
  //   mood 熵——已实测:若把 subSeed 退化写死成常量,整场比较/连 mottledRim 一起比较仍会误判"变了"〔因
  //   mottledRim 抖动的是 near 本身的点、near 早已因主 rng 随 mood 变化〕,只有单独切出 cunLayers 自己重新
  //   生成的点才能真正暴露 subSeed 退化成常量的情形,已用一次性变异验证:subSeed 硬编码返回常量后,本断言
  //   〔仅比较 cunLayers 切片〕由 false 变 true、必红,而"整场比较"/"含 rim 比较"两种写法均测不出该退化)
  ok('RR8 皴法层(cunLayers)本身随 mood 变化,非退化成与 mood 无关的常量种子(仅切出 mountains N=5 层做隔离对比,不掺 far/near/rim)',
    (function () {
      function cunSlice(svg) { var all = svg.match(/<path[^>]*\/>/g) || []; return all.slice(2, 2 + 5).join('|'); }
      return cunSlice(buildSceneSVG({ region: 'beach', mood: 'calm' })) !== cunSlice(buildSceneSVG({ region: 'beach', mood: 'tense' }));
    })());
  ok('RR9 皴法内层 fill/opacity 均从既有 shade()/silPath 生成(不写字面 #000、opacity 严格 < 1,保 K7/I1 与"透出底色读作纹理"设计意图)',
    (function () {
      var s = buildSceneSVG({ region: 'beach' });
      if (s.indexOf('fill="#000"') >= 0) return false;
      var ops = []; s.replace(/<path d="M[^"]*" fill="#[0-9a-f]{6}" opacity="([0-9.]+)"/g, function (_, o) { ops.push(parseFloat(o)); return _; });
      return ops.length > 0 && ops.every(function (o) { return o > 0 && o < 1; });
    })());
  ok('RR10 V4 毛边用 stroke(fill="none")而非 fill 图元:beach 场景恰 3 条 fill="none" 的 <path>(3 遍 mottledRim,不计入 silFills)', (buildSceneSVG({ region: 'beach' }).match(/<path[^>]*fill="none"[^>]*\/>/g) || []).length === 3);
  ok('RR11 towers 毛边为直线折线(无 Q 命令,呼应硬朗建筑棱角、不套用曲线地形连线方式):town 场景末两个 fill="none" path 的 d 属性不含大写 Q', (function () {
    var s = buildSceneSVG({ region: 'town' });
    var rims = s.match(/<path d="[^"]*" fill="none"[^>]*\/>/g) || [];
    return rims.length === 2 && rims.every(function (r) { return r.indexOf('Q') < 0; });
  })());
})();

// SS. 视觉批3-V6(docs/gameplay-expressiveness-plan.md §二 V6):深度带视差 SMIL 漂移 ——
//     far/near(mountains/dunes/trees/towers)与三段深度带(waves/skyclouds)剪影层各自获得极缓横向
//     往返 <animateTransform type="translate" additive="sum">(不改 <path d> 几何,仅字符串手术在既有
//     自封闭 path 尾部包一层动画);dur 从"该剪影已就位的 rng"在 far/near/cun/rim 完整算出后新抽的独立
//     |par 流确定性派生,远层 dur 恒长于近层("远慢近快"视差直觉)。cave(无深度概念,同 V1 既有排除)与
//     room/未知/空 scene 不受影响。
(function () {
  // 抓取剪影层(far/near 或深度带)各自的 <animateTransform type="translate" ...> dur(按出现顺序=远→近,
  // 与 silFills 按出现顺序取远/近层同构;只匹配剪影自身的 translate-additive 视差,不误抓 groundfog/weather
  // 等其它既有 translate additive 动画——这些层不出现在 buildSilhouette 产出的剪影片段内)
  function parDurs(svg) {
    var out = [];
    svg.replace(/<animateTransform attributeName="transform" type="translate" additive="sum" values="[^"]*" dur="([0-9.]+)s"/g, function (_, d) { out.push(parseFloat(d)); return _; });
    return out;
  }
  function parPx(svg) {
    var out = [];
    svg.replace(/<animateTransform attributeName="transform" type="translate" additive="sum" values="-([0-9.]+),0;/g, function (_, px) { out.push(parseFloat(px)); return _; });
    return out;
  }
  ok('SS1 户外剪影(beach=mountains 族)far/near 各自获得横向往返视差(<animateTransform type="translate" additive="sum">,2 层)', (function () {
    var s = buildSceneSVG({ region: 'beach' });
    return parDurs(s).length === 2;
  })());
  ok('SS2 覆盖全部 4 个 far/near 两层族(mountains/beach、dunes/desert、trees/forest、towers/town):远层 dur 严格 > 近层 dur("近快远慢")', (function () {
    return ['beach', 'desert', 'forest', 'town'].every(function (r) {
      var ds = parDurs(buildSceneSVG({ region: r }));
      return ds.length === 2 && ds[0] > ds[1];
    });
  })());
  ok('SS3 三段深度带族(waves/sea、clouds/skyclouds)dur 随深度单调递减(远→中→近,3 段互不相等且远最长、近最短)', (function () {
    return ['sea', 'skyclouds'].every(function (r) {
      var ds = parDurs(buildSceneSVG({ region: r }));
      return ds.length === 3 && ds[0] > ds[1] && ds[1] > ds[2];
    });
  })());
  ok('SS4 远/近 dur 落各自设计区间且互不重叠(远 18-30s、近 8-14s→"远>近"对任意抽样恒成立,非偶然)', (function () {
    var ds = parDurs(buildSceneSVG({ region: 'beach' }));
    return ds[0] >= 18 && ds[0] <= 30 && ds[1] >= 8 && ds[1] <= 14;
  })());
  ok('SS5 复用同族的其它 region 同样获得视差(mountains 族:night/snowfield/volcano;towers 族:ruins;trees 族:swamp)', (function () {
    return ['night', 'snowfield', 'volcano', 'ruins', 'swamp'].every(function (r) { return parDurs(buildSceneSVG({ region: r })).length === 2; });
  })());
  ok('SS6 cave(无远近深度概念,V1/V6 均有意不碰)与 room/未知/空 scene 无视差 animateTransform', (function () {
    return parDurs(buildSceneSVG({ region: 'cave' })).length === 0
      && buildSceneSVG({ region: 'room' }).indexOf('<animateTransform') < 0
      && buildSceneSVG({ region: '没这个' }).indexOf('<animateTransform') < 0
      && buildSceneSVG({}).indexOf('<animateTransform') < 0;
  })());
  ok('SS7 位移振幅取"个位 px"(<10)、近层振幅 ≥ 远层(呼应"近处动得更明显"直觉,非任务硬性要求但设计一致):beach 远/近振幅', (function () {
    var px = parPx(buildSceneSVG({ region: 'beach' }));
    return px.length === 2 && px[0] < 10 && px[1] < 10 && px[1] >= px[0];
  })());
  ok('SS8 视差用 SMIL <animateTransform> 非 CSS @keyframes(保 H7):beach 场景无 eyes/dice → 无 @keyframes', buildSceneSVG({ region: 'beach' }).indexOf('@keyframes') < 0);
  ok('SS9 不新增图元类型:视差本身(<animateTransform> 片段)不含 rect/circle/ellipse/polygon 标签(只追加进既有 <path> 尾部);且 beach 仍 3 rect(既有背景/地平线/暗角基线数,K10 已验)、0 ellipse、0 polygon(视差前后同,circle 计数属既有波光点缀〔L 段〕与本层无关、故不比较)', (function () {
    var s = buildSceneSVG({ region: 'beach' });
    var frags = s.match(/<animateTransform attributeName="transform" type="translate" additive="sum"[^>]*\/>/g) || [];
    var clean = frags.length > 0 && frags.every(function (f) { return f.indexOf('<rect') < 0 && f.indexOf('<circle') < 0 && f.indexOf('<ellipse') < 0 && f.indexOf('<polygon') < 0; });
    return clean && count(s, '<rect') === 3 && count(s, '<ellipse') === 0 && count(s, '<polygon') === 0;
  })());
  ok('SS10 <path> 精确计数不受视差影响(仍是 RR2/RR3/RR4 记录的既有值:beach=10/desert=7/forest=7/town=7/sea=7/night=10)', (function () {
    return count(buildSceneSVG({ region: 'beach' }), '<path') === 10
      && count(buildSceneSVG({ region: 'desert' }), '<path') === 7
      && count(buildSceneSVG({ region: 'forest' }), '<path') === 7
      && count(buildSceneSVG({ region: 'town' }), '<path') === 7
      && count(buildSceneSVG({ region: 'sea' }), '<path') === 7
      && count(buildSceneSVG({ region: 'night' }), '<path') === 10;
  })());
  ok('SS11 视差字符串手术不改 <path d> 几何:beach 全部 <path d="..."> 的 d 属性值与视差引入前逐字相同(独立种子流不外溢污染 far/near 坐标本身)', (function () {
    var s = buildSceneSVG({ region: 'beach' });
    var ds = []; s.replace(/<path d="([^"]*)"/g, function (_, d) { ds.push(d); return _; });
    // K12b 记录的既有近层 fill #706850 对应的 near 层 d 必须仍以既有 near 层参数(baseY:132)起笔 M0.0,132.0(视差未移位/未改写几何,仅追加尾部动画子元素)
    return ds.length === 10 && ds[0].indexOf('M0.0,118.0') === 0 && ds[1].indexOf('M0.0,132.0') === 0;
  })());
  ok('SS12 视差不扰 V3/V4 既有精确计数(RR2 记录值原样保持:beach=10/desert=7/forest=7/town=7,证独立 |par 流未消费/移位 crng/rrng 消耗)', (function () {
    return count(buildSceneSVG({ region: 'beach' }), '<path') === 10 && count(buildSceneSVG({ region: 'desert' }), '<path') === 7
      && count(buildSceneSVG({ region: 'forest' }), '<path') === 7 && count(buildSceneSVG({ region: 'town' }), '<path') === 7;
  })());
  ok('SS13 确定性:5 族各自两次构造字节相同(|par 流全部确定性派生,非 Math.random)', ['beach', 'desert', 'forest', 'sea', 'town'].every(function (r) { return buildSceneSVG({ region: r }) === buildSceneSVG({ region: r }); }));
  ok('SS14 视差随 mood 变化(独立 |par 流仍混入该剪影的 region+mood 主 seed,非退化成与 mood 无关的常量):beach 在 calm/tense 两 mood 下视差 dur 序列不同', (function () {
    var d1 = parDurs(buildSceneSVG({ region: 'beach', mood: 'calm' })).join(','), d2 = parDurs(buildSceneSVG({ region: 'beach', mood: 'tense' })).join(',');
    return d1 !== d2;
  })());
  // stripSmil(reduced-motion)→ 视差 animateTransform 剥除,<path> 基线属性(d/fill/opacity)即静止态可见;
  //   纵深不许仅靠视差撑住 —— K12(远冷)/RR2(皴法+毛边层数)静态多层骨架必须原样仍在,不因视差引入/剥除而消失。
  (function () {
    global.window = { matchMedia: function (q) { return { matches: /prefers-reduced-motion/.test(q) }; } };
    var el = { innerHTML: '' }; createSvgPresenter({ container: el }).present({ view: { scene: { region: 'beach' } }, pos: { map: 'm', node: 'a' } });
    delete global.window;
    var html = el.innerHTML;
    ok('SS15 reduced-motion → 视差 animateTransform 全部剥除(无 <animateTransform>)', html.indexOf('<animateTransform') < 0);
    ok('SS16 剥除后 <path> 基线仍在(仍 10 个,d/fill/opacity 属性完整可见=静止态)', count(html, '<path') === 10 && html.indexOf('fill="#9f9d78" opacity="0.85"') >= 0);
    ok('SS17 纵深不靠视差单独撑住:剥除视差后静态远/近层色相差(V1 大气透视,K12 断言的核心证据)依然存在——远层 fill 首现的色相仍比近层冷(沿用 K12 hueSignedDelta 判据)', (function () {
      function hslOf(hex) { var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); if (!m) return null; var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0; if (d !== 0) { if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; } return h; }
      function hueSignedDelta(a, b) { var d = (a - b + 180) % 360; if (d < 0) d += 360; return d - 180; }
      var fills = []; html.replace(/<path d="M[^"]*" fill="(#[0-9a-f]{6})"/g, function (_, hh) { fills.push(hh); return _; });
      return fills.length >= 2 && Math.abs(hueSignedDelta(hslOf(fills[0]), hslOf(fills[1]))) >= 8;
    })());
  })();
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
