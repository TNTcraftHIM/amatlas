/* ════════════════════════════════════════════════════════════════════════
   Amatlas 可插拔表现层 · SVG 场景呈现器 (presenters/present-svg.js) — S8.5
   ════════════════════════════════════════════════════════════════════════
   消费 View 的 **scene 意图词汇**(契约 §4.2,已定稿冻结),程序化画一个最小场景:
   region→背景色、mood→色调覆盖、elements→简单图元。**意图非素材**:这里把语义
   意图映射成具体视觉;模块/世界数据里不出现任何 SVG。零素材(纯画)、零依赖、file:// 可跑。

   **类型无关**:任何模块只要在 render 里产出 `view.scene`,本呈现器即可消费;故住
   `engine/presenters/`(可插拔表现层),不绑文字冒险。core 仍 DOM-free——呈现器才碰 DOM。
   `present-dom.js`(通用 HTML 呈现器)现同住本目录——三个呈现器都是类型无关的可插拔表现层。

   用法(经统一入口 use——返回对象带 install,engine.use 直接吃):
     engine.use(createSvgPresenter({ slot: '#scene' }));

   设计可测性:把"算 SVG 字符串"(纯函数 buildSceneSVG,node 可断言)与"塞进 DOM"
   (薄 present 包装)分离——同核心"DOM-free 逻辑 + 呈现器碰 DOM"的分层哲学。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).SvgPresenter = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var W = 320, H = 180;                 // 场景画布(viewBox);随容器缩放
  // region → 背景色(最小映射;未知 region 用中性色)。这些是"意图→视觉"的呈现器决定,可换。
  var REGION_BG = {
    beach: '#e9d8a6', forest: '#386641', cave: '#36332e', town: '#9aa0a6',
    sea: '#1d6a8f', night: '#0f1b2d', room: '#2a2622', ruins: '#5b5346',
    // 场景生态 region 收 5(signoff 三):desert 饱和暖赭金 / snowfield 高明度冷白蓝 / volcano 暗红黑 / skyclouds 日间天青蓝 / swamp 暗哑浑浊橄榄绿
    desert: '#cf8b3a', snowfield: '#e3ecf5', volcano: '#2a1410', skyclouds: '#5b9bd5', swamp: '#33402b'
  };
  // mood → 半透明色调覆盖(氛围)。未知 mood 不覆盖。S10 补 dread/horror-climax(恐怖压测)。
  // round12《烈焰与咸风》:天气 mood(rain/storm/drizzle)此前只有粒子层、无色调 → 雨丝落在「晴天亮蓝海面」
  //   上两层语义矛盾、像没渲染完。补冷暗色调(叠在粒子层之下)把阴雨/暴风天的场景真正压暗压灰。
  // 视觉批1-V2(docs/gameplay-expressiveness-plan.md §二 V2):补 sad/desolate 两词 —— 两词已是
  //   `audio-system.md`/`compose-music.js` 的正式预设名,且 `horror-game-design.md:217-218` 把它们当
  //   `mood:` 值教学示例〔`closed + mood:'sad'/'desolate'`〕,但此前七张表全零命中 → 写了却"无演出"的
  //   静默退化,与 `visual-system.md:87` 明写的"没有专门的 sad/somber 色调"缺口一致(详见测试文件 QQ 段注释)。
  //   sad = 哀伤/离别(灰蓝、比 cold 更浊更暗,与 calm/cold/eerie 色相区分)。
  //   desolate = 荒芜/废土(尘褐灰,与蓝色族〔sad/calm/cold〕、紫色族〔eerie〕均不同色相——避免与已有词混淆)。
  var MOOD_TINT = {
    tense: 'rgba(170,30,30,.18)', calm: 'rgba(40,90,170,.14)',
    eerie: 'rgba(80,30,120,.18)', warm: 'rgba(210,140,30,.14)', cold: 'rgba(120,160,200,.14)',
    dread: 'rgba(20,0,0,.30)', 'horror-climax': 'rgba(120,0,0,.34)',
    rain: 'rgba(40,55,78,.24)', drizzle: 'rgba(58,70,90,.16)', storm: 'rgba(24,34,56,.36)',
    sad: 'rgba(70,80,95,.20)', desolate: 'rgba(120,110,96,.22)'
  };
  // V1 暗角光照呼吸(表现力升级):张力/氛围 mood 下,vignette 外圈 stop-opacity 极缓 SMIL 往返
  //   (如烛火/心跳缓慢明暗呼吸)→ 整场氛围"活"。**mood-gated**(仅下列张力词)→ 其余 mood / 无 mood
  //   场景 vignette 字节完全不变(保 B2/K7/N9/O9 等精确计数 + 无 mood 字节安全)。词取自 MOOD_TINT 的
  //   张力族(tense/dread/eerie/horror-climax)——恐怖压测已验它们是氛围/张力语义。
  //   实现细节:SMIL <animate>(非 @keyframes,保 H7/M5);#avig 用 stop-color="#000"(非 fill="#000"→不破 I1);
  //   静止态=stop-opacity 0.42 基线(stripSmil 落定;reduced-motion / jsdom 探针直接见静止暗角)。
  var VIG_BREATHE = { tense: 1, dread: 1, eerie: 1, 'horror-climax': 1 };
  // element.kind → 图元形状。S10 additive 补 eyes/letterbox(恐怖演出;未知 kind 仍退化 circle)。
  var GLYPH = { character: 'circle', item: 'rect', hazard: 'tri', exit: 'door', dice: 'dice', eyes: 'eyes', letterbox: 'letterbox', claw: 'claw', swallow: 'swallow' };
  // 词汇表说明:character/item/hazard/exit/dice 走 placeable 行内图元,eyes/letterbox/claw/swallow 走 overlay(不占 slot)。
  //   死亡演出预设(2026-06):eyes.state 五态(watching/bleeding/closed/crying/swarm)+ claw(抓痕/被攻击)+ swallow(漩涡/被吞噬)。
  //   未知 kind 退化 circle(开放词汇);**下游扩展**:fork 本文件加 GLYPH 条目 + 对应 build*函数(同 buildEyes/buildClaw 范式)。
  // dice element.state → 骰子着色(检定成败的视觉反馈;S9 跑团首用,非 dice 元素不受影响)
  var DICE_FILL = { success: '#3a7d44', fail: '#9e2a2b', rolling: '#e9c46a', crit: '#46a05a', fumble: '#9e2a2b' };   // v7:crit=亮绿(+金光叠加)/ fumble=红(+红裂叠加)

  // ── 开放词汇 region 治理:家族识别 + 哈希氛围调色板(治"未知词→无特征灰板"静默降级)─────────────
  // 缘起(Sonnet showcase run2 实测):模型把 region 当主题标签写(village/heart/ending,47% 节点)→ 旧逻辑
  //   兜底平灰 #cfd2d6 且无剪影/点缀 → 半个游戏是无特征灰白板;god-rays 打上面更冲白。词汇泄漏源=指引散文
  //   还带挽歌旧 zone 词(村落/核心),模型照散文写、呈现器不认识。
  // 治法(region 仍开放词汇、不 fail-loud——内容自由 §11;只让退化"有氛围"):
  //   ① 家族识别:常见近义词(中英)按关键词归入已知 region 家族 → 拿到该族全套(基色/剪影/点缀/光柱几何)。
  //      先例:present-audio chordThird() 按 bgm 名关键词选大小三度。顺序有意:beach 先于 sea(海滩→beach)。
  //   ② 仍未知(heart/ending 这类主题词)→ **确定性哈希深色调色板**(hue 从词名 hash、低饱和暗底)替代平灰:
  //      天空渐变/暗角/光柱/文字对比在深色底上全部成立、不再"无特征"。先例:present-audio hashFreq()(未知
  //      bgm 名→确定性音高,非静音);调研:identicon/dither-avatar 业界惯例=hue from string hash。
  //   ③ region 为空/未声明 → 维持中性 #cfd2d6(没声明=不猜)。data-region 始终保留作者原词(CSS 钩子)。
  var REGION_FAMILY = [
    [/cave|dungeon|mine|tunnel|underground|cavern|洞|窟|矿/i, 'cave'],
    [/beach|shore|coast|滩/i, 'beach'],
    // swamp **必须在 sea 之前**:sea 含 lake/river 会抢 bog/marsh(湿地近义词);先匹配沼泽语义(signoff 三 · swamp)
    [/swamp|marsh|bog|fen|mire|bayou|wetland|沼|泽|湿地/i, 'swamp'],
    [/sea|ocean|lake|river|harbou?r|海|湖|河/i, 'sea'],
    [/ruin|temple|shrine|tomb|sanctum|crypt|遗迹|神殿|殿|庙|墓/i, 'ruins'],
    [/forest|wood|grove|jungle|林|森/i, 'forest'],
    [/town|village|city|market|hamlet|plaza|square|street|城|镇|村|市|街/i, 'town'],
    [/night|midnight|夜/i, 'night'],
    // 场景生态 region 收 5(signoff 三):近义词与上方 8 条零交集
    [/desert|dune|sand|wasteland|沙漠|沙丘|荒漠|戈壁/i, 'desert'],
    [/snow|tundra|glacier|arctic|frost|frozen|雪|冰原|苔原|冻土/i, 'snowfield'],
    [/volcano|volcanic|lava|magma|crater|caldera|火山|熔岩|岩浆/i, 'volcano'],
    [/sky|cloud|skies|heaven|aerial|苍穹|云/i, 'skyclouds'],
    [/room|inn|library|hall|chamber|house|study|cellar|屋|室|馆|房|厅/i, 'room']
  ];
  function resolveRegionFamily(region) {
    if (region == null || region === '') return null;
    if (REGION_BG[region]) return region;                          // 已知词:原样(既有场景字节不变)
    region = String(region);
    for (var i = 0; i < REGION_FAMILY.length; i++) if (REGION_FAMILY[i][0].test(region)) return REGION_FAMILY[i][1];
    return null;                                                    // 真未知 → 哈希调色板(buildSceneSVG)
  }
  function hashRegionColor(region) {                                // 未知词 → 确定性深色低饱和氛围基色(绝不平灰、不写 #000)
    var h = hashStr(String(region) + '|rgn');
    return hslToHex(h % 360, 0.30, 0.20 + ((h >>> 9) % 8) * 0.01); // l∈[0.20,0.27]:深底(文字/光柱/暗角全成立)
  }

  // ── S10 表现力升级(动画/演出全在 presenter,模块零动画代码;契约 §10.2-Q1)──────────────
  var BAR = 26;   // letterbox 画幅黑边高度(上下各一条,置于最上层)
  // 眼睛动画 CSS:**嵌入 SVG <style>**(仅在场景含 eyes 时注入,保旧场景字节不变)。
  // watching 眨眼=CSS @keyframes amatlas-blink(平时透明=睁,偶尔不透明=眨);**每眼内联 animation-delay/duration 错相**
  //   (杀同步眨眼=头号 uncanny;用 CSS 而非 SMIL=避 CSS 动画覆盖 SMIL 的冲突)。瞳孔扫视用 SMIL(见 oneEye)。
  //   rect base opacity=0(睁眼)→ reduced-motion(animation:none)下=睁眼盯人可见,非默认覆盖(修既有 reduced-motion 眼不可见坑)。
  var EYE_STYLE = '<style>.amatlas-lid{animation:amatlas-blink 4.8s ease-in-out infinite}'
    + '@keyframes amatlas-blink{0%,90%,100%{opacity:0}94%,97%{opacity:1}}'
    + '@media(prefers-reduced-motion:reduce){.amatlas-lid{animation:none}}</style>';
  // 骰子掷动动画 CSS(showcase round6:用户要"有动画、不是点一下就出结果"的紧张感)。仅场景含 dice 时注入(保旧场景字节不变)。
  // 业界(Foundry Dice So Nice)做法=结果先定、动画延迟揭示;我们零依赖版:骰子掉落+翻滚~0.9s→定格,"?"隐去、真值 pop 入、去色转成败色。
  // **resting 态 = 最终结果**(动画用 forwards 停在末帧;reduced-motion / 无 CSS 引擎的 jsdom 探针直接看到最终骰面与成败色 → 不伤可测性)。
  var DICE_STYLE = '<style>'
    // 整组:立体翻滚(perspective rotateX + rotate 模拟骰子翻转;不支持 3D 的浏览器优雅退化为 2D 旋转)→ 收敛正面。
    + '.amatlas-die{transform-box:fill-box;transform-origin:center;animation:amatlas-die-tumble 1.1s cubic-bezier(.2,.8,.25,1) forwards}'
    + '.amatlas-die-box{animation:amatlas-die-hue 1.1s ease-out forwards}'                               // 滚动中去色(中性悬念)→ 落定显成/败色
    // 数字卷轴:竖直数字条飞速上滚 → ease-out 越来越慢 → 停在末格真值(用户要"摇数字越来越慢最后固定")。
    + '.amatlas-die-reel{animation:amatlas-die-reel 1.1s cubic-bezier(.12,.62,.15,1) forwards}'
    + '.amatlas-die-face{transform-box:fill-box;transform-origin:center;animation:amatlas-die-pop 1.1s ease-out forwards}'
    + '.amatlas-die-shadow{transform-box:fill-box;transform-origin:center;animation:amatlas-die-shadow 1.1s cubic-bezier(.2,.8,.25,1) forwards}'  // 真值落定瞬间 pop 强调
    // 着地感(showcase 反馈「像吊空中晃两下」→ 改为掉落+着地+squash+弹收):从上方旋转掉落 → 40% 砸到桌面(压扁 scaleY<1)→ 56% 弹起(拉伸)→ 72% 二次轻砸 → 微弹 → 定格。translateY 提供垂直落地,rotate 单向减速=滚动而非摆动。
    // 掉落位移用 %(transform-box:fill-box → 相对骰子自身 bbox)而非 px:SVG 内 CSS transform 的 px 不随 viewBox 缩放(被当渲染像素),小屏渲染时绝对位移相对骰子过大会冲出画框、动画显示不全(showcase 反馈)。% → 始终按骰子比例掉落,任意缩放不溢出。
    + '@keyframes amatlas-die-tumble{0%{transform:translateY(-160%) rotate(-430deg) scale(.78)}40%{transform:translateY(0) rotate(-14deg) scaleX(1.06) scaleY(.94)}56%{transform:translateY(-28%) rotate(5deg) scaleX(.98) scaleY(1.03)}72%{transform:translateY(0) rotate(-2deg) scaleX(1.02) scaleY(.99)}86%{transform:translateY(-7%) rotate(1deg) scale(1)}100%{transform:translateY(0) rotate(0) scale(1)}}'   /* squash/stretch 收敛(≤6%):有重量的真骰落定,非橡皮/动漫弹性 */
    + '@keyframes amatlas-die-hue{0%,38%{filter:grayscale(1) brightness(1.4)}72%{filter:none}}'
    + '@keyframes amatlas-die-reel{0%{transform:translateY(208px)}100%{transform:translateY(0)}}'       // 208 = 8 噪声格 × 26;从首格滚到真值格(translateY 0 = 真值在窗口)
    + '@keyframes amatlas-die-pop{0%,74%{opacity:.9;transform:scale(1)}82%{opacity:1;transform:scale(1.5)}100%{opacity:1;transform:scale(1)}}'
    // 地面投影:骰子落地→投影放大变实、弹起→缩小变淡,与 tumble 的 40/56/72 着地节拍同步 → 强化"落在桌面"
    + '@keyframes amatlas-die-shadow{0%{transform:scaleX(.45) scaleY(.6);opacity:0}40%{transform:scale(1);opacity:.4}56%{transform:scaleX(.82) scaleY(.82);opacity:.3}72%{transform:scale(1);opacity:.36}100%{transform:scale(.96);opacity:.32}}'
    // v7 暴击/大失败:金光迸现 / 红裂浮现(forwards 停在可见末帧 → reduced-motion / 无 CSS 的 jsdom 探针直接见特效)
    + '.amatlas-die-crit{transform-box:fill-box;transform-origin:center;animation:amatlas-die-crit 1.1s ease-out forwards}'
    + '.amatlas-die-fumble{animation:amatlas-die-fumble 1.1s ease-out forwards}'
    + '@keyframes amatlas-die-crit{0%,58%{opacity:0;transform:scale(.3) rotate(-40deg)}80%{opacity:1;transform:scale(1.25) rotate(8deg)}100%{opacity:.9;transform:scale(1) rotate(0)}}'
    + '@keyframes amatlas-die-fumble{0%,55%{opacity:0}72%{opacity:1}100%{opacity:1}}'
    + '@media(prefers-reduced-motion:reduce){.amatlas-die,.amatlas-die-box,.amatlas-die-reel,.amatlas-die-face,.amatlas-die-crit,.amatlas-die-fumble,.amatlas-die-shadow{animation:none}.amatlas-die-reel{transform:translateY(0)}}'  // 静止落最终值(可测/无障碍)
    + '</style>';
  // transition 过场动画 CSS:注入 document.head(一次),作用于 #scene 容器(present() 据节点变化加一次性 class)。
  // reduced-motion:slam 震屏/fade 都尊重系统偏好(IFTF 无障碍;SMIL 点缀另在 present() 字符串级剥除——
  //   SMIL 不吃 CSS animation:none,只能不注入)。
  var FX_CSS = '.amatlas-fx-fade{animation:amatlas-fx-fade .8s ease-out}'
    + '.amatlas-fx-slam{animation:amatlas-fx-slam .5s steps(3,end)}'
    + '@keyframes amatlas-fx-fade{from{opacity:0}to{opacity:1}}'
    + '@keyframes amatlas-fx-slam{0%{filter:brightness(5)}12%{transform:translate(-7px,5px)}'
    + '26%{transform:translate(6px,-4px);filter:brightness(1)}44%{transform:translate(-4px,3px)}'
    + '70%{transform:translate(2px,-2px)}100%{transform:translate(0,0);filter:none}}'
    + '@media(prefers-reduced-motion:reduce){.amatlas-fx-fade,.amatlas-fx-slam{animation:none}}';

  // 一只眼睛:眼白椭圆 + 瞳孔。state 五态:
  //   watching → SMIL 左右游移 + CSS 眨眼睑(活眼盯人,默认)
  //   bleeding → 充血血丝 + 瞳孔骤缩骤扩 + 多股血泪 + 轻微不对称(器质性恐怖)
  //   closed   → 眼皮闭合 + 中线小痕(沉睡/默哀/永闭,静止)
  //   crying   → 透明蓝白泪 + 垂目瞳孔(哀悼/同情;同 bleeding drip 框架换色减条数)
  //   swarm    → 见 buildEyes(增多眼数 + jitter 分布,单眼仍用 watching 画法)
  // **怎么画/怎么动是 presenter 的自由**(契约 §10.2-Q1);模块只说 {kind:'eyes',state:'…'}。seed=区域+情绪派生(确定性,见 buildEyes)。
  // **扩展路径(下游)**:更多 state 想扩,有两条路——① 复用 watching/bleeding 框架在本文件加分支(本地 fork,引擎未发布无存量游戏要护)② 把 region/mood/transition/letterbox/ref 等开放词汇组合出新视觉(无需碰源码)。
  // 5 个预设打底覆盖主语义:活眼/器质恐怖/死寂/哀悼/集合意识——再要"睁大狂喜/瞳孔横切/虫眼"等表演态走扩展路径。未知 state warn-once + 退化 watching(开放词汇语义)。
  function oneEye(cx, cy, r, state, bg, seed) {
    var bleeding = (state === 'bleeding');
    var closed = (state === 'closed');
    var crying = (state === 'crying');
    // ─ closed:眼皮闭合 + 中线 + 轻微红肿;静止(死寂感最强);H1 共享、不出白睛/瞳孔/catchlight(变异验牙)
    //   视觉要求:眼皮椭圆轮廓在任何 region/mood 下可见(派生亮派生暗肉色 + 粗 stroke);否则只剩中线="一根孤零零的线"
    if (closed) {
      var rngC = mulberry32((seed || 0) >>> 0);
      var rxC = r * (1 + (rngC() - 0.5) * 0.06), ryC = r * 0.62 * (1 + (rngC() - 0.5) * 0.06);
      var lidPathC = 'M' + (cx - rxC).toFixed(1) + ' ' + cy.toFixed(1) + ' A' + rxC.toFixed(1) + ' ' + ryC.toFixed(1) + ' 0 1 1 ' + (cx + rxC).toFixed(1) + ' ' + cy.toFixed(1) + ' A' + rxC.toFixed(1) + ' ' + ryC.toFixed(1) + ' 0 1 1 ' + (cx - rxC).toFixed(1) + ' ' + cy.toFixed(1) + ' Z';
      var lidCol = hslToHex(20, 0.30, 0.62 + rngC() * 0.05);   // 派生肉色暖调(亮度 0.62 让椭圆轮廓在任何深色背景上都看得出来;非纯白但够亮)
      var sC = ['<g class="amatlas-eye">'];
      sC.push('<path class="amatlas-lid" d="' + lidPathC + '" fill="' + lidCol + '" stroke="#1a1010" stroke-width="2.2"/>');
      // 上眼睑弧:在椭圆上半内画一条弧(显"上眼皮压下"的封闭感)
      sC.push('<path class="amatlas-lid-upper" d="M' + (cx - rxC * 0.92).toFixed(1) + ' ' + (cy - ryC * 0.12).toFixed(1) + ' Q' + cx + ' ' + (cy - ryC * 0.55).toFixed(1) + ' ' + (cx + rxC * 0.92).toFixed(1) + ' ' + (cy - ryC * 0.12).toFixed(1) + '" fill="none" stroke="#1a1010" stroke-width="1.4" stroke-linecap="round" stroke-opacity="0.55"/>');
      // 闭眼缝线:中线短弧 path,显"闭着"非"空白"
      sC.push('<path class="amatlas-lid-line" d="M' + (cx - rxC * 0.85).toFixed(1) + ' ' + cy.toFixed(1) + ' Q' + cx + ' ' + (cy + ryC * 0.15).toFixed(1) + ' ' + (cx + rxC * 0.85).toFixed(1) + ' ' + cy.toFixed(1) + '" fill="none" stroke="#1a1010" stroke-width="1.8" stroke-linecap="round"/>');
      sC.push('</g>');
      return sC.join('');
    }
    // ─ crying:复用 bleeding 的 drip 框架但减条数(2-3 条克制 vs bleeding ≥3)+ 蓝白泪(.amatlas-tear ≠ .amatlas-drip 红血)+ 垂目瞳孔(向下看,不集中)+ 无充血血丝(crying≠器质性)
    if (crying) {
      var rngR = mulberry32((seed || 0) >>> 0);
      var jxR = (rngR() - 0.5) * r * 0.10, jyR = r * 0.18;      // jy 正值=瞳孔向下(垂目)
      var rxR = r * (1 + (rngR() - 0.5) * 0.06), ryR = r * 0.62 * (1 + (rngR() - 0.5) * 0.06);
      var pupilRR = r * 0.42;
      var sqR = ryR / rxR;
      var sR = ['<g class="amatlas-eye">'];
      sR.push('<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rxR.toFixed(1) + '" ry="' + ryR.toFixed(1) + '" fill="#d8d4cc" stroke="#0a0a0a" stroke-width="1.5"/>');   // 唯一白睛 ellipse(保 H5);柔泛白(非 bleeding 的红浊)
      // 瞳孔(垂目静止;不做骤缩骤扩=哀而不躁)
      sR.push('<circle cx="' + (cx + jxR).toFixed(1) + '" cy="' + (cy + jyR).toFixed(1) + '" r="' + pupilRR.toFixed(1) + '" fill="#1a2a3a"/>');   // 瞳孔暗蓝(非纯黑,派生)
      // 泪滴:2-3 条(rngR 决定),透明蓝白,从下半眼缘渗出
      var MT = 2 + Math.floor(rngR() * 2);   // 2 or 3
      for (var dt = 0; dt < MT; dt++) {
        var oxT = cx + (rngR() - 0.5) * rxR * 1.0, oyT = cy + ryR * (0.4 + rngR() * 0.3);
        var dropT = r * (1.2 + rngR() * 0.9), swayT = (rngR() - 0.5) * r * 0.3;
        var pthT = 'M' + oxT.toFixed(1) + ' ' + oyT.toFixed(1) + ' q' + swayT.toFixed(1) + ' ' + (dropT * 0.5).toFixed(1) + ' ' + (swayT * 0.4).toFixed(1) + ' ' + dropT.toFixed(1);
        sR.push('<path class="amatlas-tear" d="' + pthT + '" fill="none" stroke="#a8c5d8" stroke-width="' + (1.6 + rngR() * 1.4).toFixed(1) + '" stroke-linecap="round" stroke-opacity="0.55" stroke-dasharray="' + Math.ceil(dropT) + '" stroke-dashoffset="' + Math.ceil(dropT * 0.4) + '">');
        sR.push('<animate attributeName="stroke-dashoffset" values="' + Math.ceil(dropT) + ';0" dur="' + (4.5 + rngR() * 1.5).toFixed(1) + 's" repeatCount="indefinite"/>');   // ~5s 慢生长(vs bleeding 2-3s,克制)
        sR.push('</path>');
      }
      sR.push('</g>');
      return sR.join('');
    }
    if (!bleeding) {
      // watching 恐怖升级(端用户"三只眼一般";调研出处见 journal 阶段91):消费 buildEyes 已传的 per-eye seed →
      //   ① 每眼异质(深度=尺寸/高低/亮度 + 整体 opacity;数个不同距离的窥视者,SCP Eyes-in-the-Dark)
      //   ② 扫视跳动(ballistic saccade:hold→snap→【长时居中直视盯人=Mona Lisa】,calcMode=discrete;真静态扫视是弹道跳变非正弦)
      //   ③ catchlight 高光(固定光源反射=活眼;无高光=死/玩偶眼)
      //   ④ 眨眼错相(CSS per-eye animation-delay/duration 内联;非 SMIL=避 CSS 覆盖 SMIL);base opacity=0=睁眼(reduced-motion 可见)
      var rng = mulberry32((seed || 0) >>> 0);
      var dr = r * (0.78 + rng() * 0.62), rx = dr, ry = dr * 0.62, pupilR = dr * 0.4;
      var ecy = cy + (rng() - 0.5) * r;                                  // 高低错落(不同距离的观察者)
      var depth = 0.30 + rng() * 0.58;                                   // 0=远暗 1=近亮
      var white = hslToHex(38, 0.12, 0.30 + depth * 0.55);               // 近眼明、远眼暗(看得见才瘆人;派生暗色非 #000)
      var pcx0 = cx + (rng() - 0.5) * rx * 0.8, pcx2 = cx + (rng() - 0.5) * rx * 0.8;   // 扫视落点(±0.4rx,可见弹跳)
      var bd = (0.3 + rng() * 3.5).toFixed(1), bdur = (4.0 + rng() * 2.6).toFixed(1);   // 眨眼错相:恒非零负偏移 + 各眼不同周期
      var s0 = ['<g class="amatlas-eye" opacity="' + (0.55 + depth * 0.45).toFixed(2) + '">'];   // 景深:远眼整体更淡
      s0.push('<ellipse cx="' + cx + '" cy="' + ecy.toFixed(1) + '" rx="' + rx.toFixed(1) + '" ry="' + ry.toFixed(1) + '" fill="' + white + '" stroke="#0a0a0a" stroke-width="1.5"/>');
      // 瞳孔扫视:hold pcx0 → snap 居中直视(长时盯人)→ snap pcx2 → 回;基线 cx=cx(静止居中直视=最压迫,可见可测)。仍 <animate cx>(保 H2)。
      s0.push('<circle cx="' + cx + '" cy="' + ecy.toFixed(1) + '" r="' + pupilR.toFixed(1) + '" fill="#0a0a0a">');
      s0.push('<animate attributeName="cx" values="' + pcx0.toFixed(1) + ';' + pcx0.toFixed(1) + ';' + cx + ';' + cx + ';' + pcx2.toFixed(1) + ';' + pcx0.toFixed(1) + '" keyTimes="0;0.3;0.32;0.78;0.8;1" calcMode="discrete" dur="' + (5.0 + rng() * 3).toFixed(1) + 's" repeatCount="indefinite" begin="-' + bd + 's"/>');
      s0.push('</circle>');
      // catchlight(固定光源反射,eye 左上;circle 不计入 ellipse 保 H3/H5,派生亮色非 #000)
      s0.push('<circle cx="' + (cx - rx * 0.3).toFixed(1) + '" cy="' + (ecy - ry * 0.4).toFixed(1) + '" r="' + (pupilR * 0.3).toFixed(1) + '" fill="' + hslToHex(40, 0.12, Math.min(0.92, 0.55 + depth * 0.4)) + '" opacity="0.85"/>');
      // 眨眼睑:**眼形 path**(椭圆路径,非 rect)→ 闭眼=眼形暗斑(像眨/隐去),错相后单眼闭也不会是生硬方块。
      //   CSS @keyframes amatlas-blink(保 H1)+ per-eye 内联 animation-delay/duration 错相;base opacity=0(睁眼);path 不计入 ellipse(保 H3)。
      var lidPath = 'M' + (cx - rx).toFixed(1) + ' ' + ecy.toFixed(1) + ' A' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' 0 1 1 ' + (cx + rx).toFixed(1) + ' ' + ecy.toFixed(1) + ' A' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' 0 1 1 ' + (cx - rx).toFixed(1) + ' ' + ecy.toFixed(1) + ' Z';
      s0.push('<path class="amatlas-lid" d="' + lidPath + '" fill="' + bg + '" opacity="0" style="animation-delay:-' + bd + 's;animation-duration:' + bdur + 's"/>');
      s0.push('</g>');
      return s0.join('');
    }
    // bleeding:种子 PRNG 驱动的器质性恐怖眼(确定性、纯 path/circle/ellipse、无字面 #000、唯一白睛 ellipse 保 H5)。
    var rng = mulberry32((seed || 0) >>> 0);
    var jx = (rng() - 0.5) * r * 0.10, jy = (rng() - 0.5) * r * 0.08;            // 不对称:瞳孔轻微偏移(uncanny)
    var rx = r * (1 + (rng() - 0.5) * 0.06), ry = r * 0.62 * (1 + (rng() - 0.5) * 0.06);
    var pupilR = r * 0.5;                                                         // 静息渗血瞳孔(大);SMIL 在此基线上做骤缩→骤扩
    var sq = ry / rx;
    var s = ['<g class="amatlas-eye">'];
    s.push('<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx.toFixed(1) + '" ry="' + ry.toFixed(1) + '" fill="#cdb0aa" stroke="#0a0a0a" stroke-width="1.5"/>');   // 唯一白睛 ellipse(保 H5);泛红浊白=病态
    // 充血血丝:从虹膜外缘向眼白辐射的二次贝塞尔,密度随眼半径缩放(小眼少=不糊;红队 §10 防堆元素)。派生暗红、绝不 #000。
    var N = Math.max(3, Math.round(r / 5));
    for (var k = 0; k < N; k++) {
      var a = rng() * 6.2832, ir = pupilR * 1.15, len = ry * (0.6 + rng() * 0.5);
      var x0 = cx + Math.cos(a) * ir, y0 = cy + Math.sin(a) * sq * ir;
      var x1 = cx + Math.cos(a) * (ir + len), y1 = cy + Math.sin(a) * sq * (ir + len);
      var mx = (x0 + x1) / 2 + (rng() - 0.5) * len * 0.4, my = (y0 + y1) / 2 + (rng() - 0.5) * len * 0.4;
      var red = hslToHex(0, 0.62, 0.30 + rng() * 0.08), sw = ((0.6 + rng() * 0.6) * (r / 40)).toFixed(2);
      s.push('<path d="M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + '" fill="none" stroke="' + red + '" stroke-width="' + sw + '" stroke-opacity="' + (0.45 + rng() * 0.35).toFixed(2) + '" stroke-linecap="round"/>');
    }
    // 瞳孔骤缩→骤扩(惊跳反射:收缩定住 → 突然散瞳盯人 → 回静息)。基线 r=pupilR(静息渗血瞳孔=大);stripSmil/reduced-motion 落静息态(可见、可测、仍盯人)。
    s.push('<circle cx="' + (cx + jx).toFixed(1) + '" cy="' + (cy + jy).toFixed(1) + '" r="' + pupilR.toFixed(1) + '" fill="#0a0a0a">');
    s.push('<animate attributeName="r" values="' + pupilR.toFixed(1) + ';' + (pupilR * 0.5).toFixed(1) + ';' + (pupilR * 0.5).toFixed(1) + ';' + (pupilR * 1.25).toFixed(1) + ';' + pupilR.toFixed(1) + '" keyTimes="0;0.55;0.86;0.93;1" dur="3.2s" repeatCount="indefinite" calcMode="spline" keySplines="0.4 0 0.6 1;0 0 1 1;0.9 0 1 1;0.2 0.8 0.3 1"/>');
    s.push('</circle>');
    // 多股血泪(渗血主体):从【下半眼/下眼睑】不同点渗出、略横移向画幅下方淌(沿路径生长);粗、多股、长。
    //   保 class="amatlas-drip"+#9e2a2b 满足 H4/H11(≥3 条);条数/粗细随眼半径缩放(小眼不糊)。
    //   基线 stroke-dashoffset=ceil(drop*0.35)=静止态露≈65% 血(stripSmil/reduced-motion 下血依然醒目),SMIL 在此上做 drip 生长。
    var M = Math.max(3, Math.round(r / 12));
    for (var d = 0; d < M; d++) {
      var ox = cx + (rng() - 0.5) * rx * 1.2, oy = cy + ry * (0.25 + rng() * 0.5);   // 从下半眼渗出(不被瞳孔遮)
      var drop = r * (1.5 + rng() * 1.3), sway = (rng() - 0.5) * r * 0.45;
      var pth = 'M' + ox.toFixed(1) + ' ' + oy.toFixed(1) + ' q' + sway.toFixed(1) + ' ' + (drop * 0.5).toFixed(1) + ' ' + (sway * 0.4).toFixed(1) + ' ' + drop.toFixed(1);
      s.push('<path class="amatlas-drip" d="' + pth + '" fill="none" stroke="#9e2a2b" stroke-width="' + (2.2 + rng() * 2.8).toFixed(1) + '" stroke-linecap="round" stroke-dasharray="' + Math.ceil(drop) + '" stroke-dashoffset="' + Math.ceil(drop * 0.35) + '">');
      s.push('<animate attributeName="stroke-dashoffset" values="' + Math.ceil(drop) + ';0" dur="' + (2.4 + rng() * 1.2).toFixed(1) + 's" repeatCount="indefinite"/>');   // 沿路径下淌生长(末态淌满);静止露大部分
      s.push('</path>');
    }
    s.push('</g>');
    return s.join('');
  }
  // eyes 元素 → 眼睛群。ref='fullscreen'→ 全屏巨眼(占画幅中心);ref=数字 N→ 上方暗处 N 只小眼均布(默认 2,封顶 6)。
  // swarm state 例外:数量更多(默认 6)、jitter 分布(非均匀网格)、尺寸 0.5x-1.2x 派生 → "成群暗处窥视者"
  // seed=region+mood 哈希(与剪影/氛围同源、加 '|eyes' 派生独立流);多眼各 XOR 去相位 → 不对称、血丝序列各异。
  // 未知 state warn-once + 退化 watching(开放词汇 fail-loud over fail-silent);**下游扩展**:fork 本文件加分支(同 watching/bleeding 范式)。
  var _warnedEyeRef = {};   // A2 fail-loud(对称 renderElementArt 未知预设名 warn):无效 eyes.ref 静默退化只 warn 一次/值
  var _warnedEyeState = {}; // 同 _warnedEyeRef:未知 state 退化 watching 只 warn 一次/state
  var EYE_STATES = { watching: 1, bleeding: 1, closed: 1, crying: 1, swarm: 1 };
  function buildEyes(e, bg, region, mood) {
    var state = e.state || 'watching';
    if (state !== 'watching' && !EYE_STATES[state] && typeof console !== 'undefined' && console.warn && !_warnedEyeState[state]) {
      _warnedEyeState[state] = 1;
      console.warn('present-svg: eyes.state "' + state + '" 未知 → 退化 watching(已知:watching/bleeding/closed/crying/swarm;想要更多 fork present-svg.js 同 watching/bleeding 范式加分支)。');
      state = 'watching';
    } else if (!EYE_STATES[state]) {
      state = 'watching';   // 静默退化(已 warn 过本值)
    }
    var seed = hashStr((region || '') + '|' + (mood || '') + '|eyes');
    var isSwarm = (state === 'swarm');
    if (e.ref === 'fullscreen' && !isSwarm) return oneEye(W / 2, H / 2, 54, state, bg, seed);
    // A2:ref 给了但既非 'fullscreen' 也非正整数(如实体名 '天裂之眼')→ parseInt=NaN → 静默退化为 2 只眼。
    //   作者常以为写了内容标签就得到全屏巨眼,实际是 2 只小眼。对称 art 预设名 warn,提示有效值。
    if (e.ref != null && e.ref !== 'fullscreen' && !(parseInt(e.ref, 10) > 0)) {
      var _rk = String(e.ref);
      if (!_warnedEyeRef[_rk] && typeof console !== 'undefined' && console.warn) {
        _warnedEyeRef[_rk] = 1;
        console.warn('present-svg: eyes.ref "' + _rk + '" 无效(应为 "fullscreen"=全屏巨眼,或正整数字符串如 "3"=眼睛数量);已退化为 2 只眼。');
      }
    }
    // swarm:数量翻倍 + jitter + 尺寸派生;watching/bleeding/closed/crying:沿用旧均布(向后兼容)
    if (isSwarm) {
      var nS = parseInt(e.ref, 10); if (!(nS > 0)) nS = 6; if (nS > 12) nS = 12;
      if (e.ref === 'fullscreen') nS = 10;   // fullscreen swarm = 填满 10 只
      var rngS = mulberry32(seed >>> 0);
      var outS = [];
      for (var iS = 0; iS < nS; iS++) {
        // 错落分布:H/3 上下带,jitter ±20px;尺寸 11-22px(0.5x-1.2x of 18)
        var xS = ((iS + 0.5) / nS) * W + (rngS() - 0.5) * (W / nS) * 0.6;
        var yS = 40 + rngS() * (H * 0.35);   // 上半 40-H*0.35 区
        var rS = 11 + rngS() * 11;
        outS.push(oneEye(xS, yS, rS, 'watching', bg, (seed ^ (iS * 0x85EBCA77)) >>> 0));   // 单眼复用 watching 画法
      }
      return outS.join('');
    }
    var n = parseInt(e.ref, 10); if (!(n > 0)) n = 2; if (n > 6) n = 6;
    var out = [];
    for (var i = 0; i < n; i++) out.push(oneEye((W * (i + 1)) / (n + 1), 56, 16, state, bg, (seed ^ (i * 0x9E3779B1)) >>> 0));
    return out.join('');
  }

  // claw 元素 → 3-4 道平行斜痕(wolf claw mark)。从画面一角向对角斜向延伸 + 末端尖锐渐细 + 深红血色。
  //   静态(已发生的痕迹、不动反而更恐怖);seed=region+mood+'|claw' 派生独立流。语义:被攻击残留 / 怪物路过的痕迹。
  function buildClaw(e, region, mood) {
    var seed = hashStr((region || '') + '|' + (mood || '') + '|claw');
    var rng = mulberry32(seed >>> 0);
    var nC = 3 + Math.floor(rng() * 2);   // 3 或 4 道
    var mirror = rng() > 0.5;             // 左上→右下 / 右上→左下
    var s = ['<g class="amatlas-claw">'];
    // 每道痕迹:Q 贝塞尔 + stroke-linecap='round' + 末端 stroke-width 渐细(用三段不同 stroke-width 路径模拟)
    for (var k = 0; k < nC; k++) {
      var off = (k - (nC - 1) / 2) * 24;                                                     // 每道平行间隔 24px
      var x1 = mirror ? (W - 20 - rng() * 30) : (20 + rng() * 30);
      var y1 = 20 + off + rng() * 12;
      var x2 = mirror ? (40 + rng() * 30) : (W - 40 - rng() * 30);
      var y2 = H - 30 + off + rng() * 12;
      var mx = (x1 + x2) / 2 + (mirror ? -1 : 1) * 18 + (rng() - 0.5) * 14;                  // 控制点偏移(弧度)
      var my = (y1 + y2) / 2 + (rng() - 0.5) * 14;
      var pth = 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
      // 主痕迹(粗、深红)
      s.push('<path class="amatlas-claw-mark" d="' + pth + '" fill="none" stroke="#9e2a2b" stroke-width="' + (3.2 + rng() * 1.5).toFixed(1) + '" stroke-linecap="round" stroke-opacity="0.85"/>');
      // 内层亮红高光(细、亮)→ 立体感
      s.push('<path class="amatlas-claw-hl" d="' + pth + '" fill="none" stroke="#c43a3c" stroke-width="' + (1.0 + rng() * 0.6).toFixed(1) + '" stroke-linecap="round" stroke-opacity="0.7"/>');
    }
    s.push('</g>');
    return s.join('');
  }

  // swallow 元素 → 中心向内的暗色漩涡(同心椭圆 5-7 圈 + 缓慢旋转;reduced-motion 落静态)。语义:被吞噬 / 坠入虚空 / 黑洞。
  //   seed=region+mood+'|swallow' 派生独立流;不写 #000(派生暗色),中心最暗、外圈渐褪。
  function buildSwallow(e, bg, region, mood) {
    var seed = hashStr((region || '') + '|' + (mood || '') + '|swallow');
    var rng = mulberry32(seed >>> 0);
    var nRings = 6;                                                                          // 5-7 圈;固定 6 保 H 段精确(可见但不密)
    var cx = W / 2, cy = H / 2;
    var rotDur = (10 + rng() * 4).toFixed(1);   // 10-14s/圈 缓慢旋转
    var s = ['<g class="amatlas-swallow" transform-origin="' + cx + ' ' + cy + '">'];
    s.push('<animateTransform attributeName="transform" type="rotate" from="0 ' + cx + ' ' + cy + '" to="360 ' + cx + ' ' + cy + '" dur="' + rotDur + 's" repeatCount="indefinite"/>');
    // 同心椭圆:5-7 圈,半径递增 + 透明度递减;每圈轻微 rx/ry 差(非纯圆=扭曲感)
    for (var ri = 0; ri < nRings; ri++) {
      var t = (ri + 1) / nRings;                                                              // 0..1 由内到外
      var rx = 18 + t * 110, ry = rx * (0.78 + (rng() - 0.5) * 0.18);                         // 主轴渐增 + 椭率 jitter
      var op = (0.88 - t * 0.65).toFixed(2);                                                  // 中心最暗 0.88,外圈淡 0.23
      var col = hslToHex(15, 0.15, Math.max(0.05, 0.04 + t * 0.06));                          // 派生暗红黑(非 #000)
      var rot = (rng() - 0.5) * 16;
      s.push('<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx.toFixed(1) + '" ry="' + ry.toFixed(1) + '" fill="' + col + '" opacity="' + op + '" transform="rotate(' + rot.toFixed(1) + ' ' + cx + ' ' + cy + ')"/>');
    }
    s.push('</g>');
    return s.join('');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 物件 ref 标签:不是内容正文,是 SVG 小标牌。旧版直接 `<text y=cy+28>` 一行贴底,
  // 在 21:9 cutscene 舞台中会被 #scene overflow 裁掉;长中文也可能横向出框。
  // 这里做 presenter 内部排版:1-2 行、超长省略、x 安全夹取、半透明底板;不改 scene.elements 契约。
  function labelUnit(ch) {
    return (/^[\x00-\x7F]$/.test(ch)) ? 0.55 : 1;
  }
  function trimLabelLine(s, maxUnits) {
    var out = '', u = 0;
    for (var i = 0; i < s.length; i++) {
      var cu = labelUnit(s.charAt(i));
      if (u + cu > maxUnits) break;
      out += s.charAt(i); u += cu;
    }
    return out;
  }
  function labelLines(raw) {
    var text = String(raw == null ? '' : raw).trim();
    if (!text) return [];
    var maxUnits = 6, maxLines = 2, lines = [], line = '', u = 0, clipped = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i), cu = labelUnit(ch);
      if (line && u + cu > maxUnits) {
        lines.push(line); line = ''; u = 0;
        if (lines.length >= maxLines) { clipped = true; break; }
      }
      line += ch; u += cu;
    }
    if (!clipped && line) lines.push(line);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); clipped = true; }
    if (clipped || i < text.length) {
      var last = trimLabelLine(lines[maxLines - 1] || '', maxUnits - 1);
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }
  function elementLabel(cx, y, raw) {
    var lines = labelLines(raw);
    if (!lines.length) return '';
    var maxU = 0;
    for (var i = 0; i < lines.length; i++) {
      var u = 0; for (var j = 0; j < lines[i].length; j++) u += labelUnit(lines[i].charAt(j));
      if (u > maxU) maxU = u;
    }
    var w = Math.max(20, Math.min(40, Math.ceil(maxU * 5 + 8)));
    var lineH = 9, h = lines.length * lineH + 5;
    var x = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, cx));
    // 120/112 是给 21:9 舞台裁切留的保守底线;两行更早上提,防底部被裁。
    var yMax = lines.length > 1 ? 112 : 120;
    y = Math.max(16, Math.min(yMax, y));
    var top = y - 8;
    var s = '<g class="amatlas-element-label"><rect x="' + (x - w / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + w + '" height="' + h + '" rx="4" fill="rgba(12,16,22,.64)" stroke="rgba(255,255,255,.18)" stroke-width="0.6"/>';
    s += '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" font-size="8.5" text-anchor="middle" fill="#f3ead8" stroke="#0b1018" stroke-width="1.8" paint-order="stroke" style="paint-order:stroke">';
    for (var k = 0; k < lines.length; k++) s += '<tspan x="' + x.toFixed(1) + '" dy="' + (k ? lineH : 0) + '">' + esc(lines[k]) + '</tspan>';
    return s + '</text></g>';
  }

  // ── Phase 3 骰子(契约 v7):据 sides 选骰形 + 等距立体 + 暴击/大失败 ───────────────────────
  // 设计:sides 缺省 → 通用圆角方块(现状不破);d6 → 等距立方(三面明度=体积感);其余 → N 边形轮廓
  // 近似多面体侧影(诚实:SVG 内无法 preserve-3d 画真多面体,真 3D 见 references/dice-styles.md 换皮)。
  function dieShapeKind(sides) {
    if (sides == null) return 'box';   // 通用(向后兼容:无 sides 的旧 dice 元素 → 字节级不变)
    if (sides <= 4) return 'tri';      // d4 → 三角(四面体侧影)
    if (sides === 6) return 'cube';    // d6 → 等距立方(三面明度立体)
    if (sides <= 8) return 'diamond';  // d8 → 菱形(八面体侧影)
    if (sides <= 12) return 'penta';   // d10/d12 → 五边形
    return 'hexa';                     // d20+ → 六边形(二十面体近似)
  }
  // 明度调整(amt 正→提亮、负→压暗)做立方体三面体积感;只处理 #rrggbb(DICE_FILL 值与默认皆是)。
  function shade(hex, amt) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return hex;
    function ch(h) { var v = parseInt(h, 16); v = amt >= 0 ? v + (255 - v) * amt : v * (1 + amt); v = Math.max(0, Math.min(255, Math.round(v))); return ('0' + v.toString(16)).slice(-2); }
    return '#' + ch(m[1]) + ch(m[2]) + ch(m[3]);
  }
  // ── 视觉批1-V1(docs/gameplay-expressiveness-plan.md §二 V1):剪影远层大气透视色相分量 ──────────
  // 缘起:shade() 只调明度轴,做不出"大气透视"标准绘画理论描述的"远景偏蓝灰、近景保原色"(空气中悬浮
  // 颗粒对短波光〔蓝〕散射更强,望向远处地平线因而蒙一层冷灰蓝雾——风景画技法称"aerial/atmospheric
  // perspective",与 shade() 已用的明度衰减是同一现象的两个分量:明度只管"远淡",这里补"远冷"。
  // 局部小工具(零依赖,故意不复用文件尾部 opt-in gradeSVG/tintHue 那套——那是**作者选用**的整场后处理管线、
  // 默认关闭〔见 :1721 createSvgPresenter opts.grade〕;这里是**默认开**的剪影远层构造期分量,调用点在
  // silMountains 等函数内部、比 gradeSVG 早得多的阶段,两者服务不同生命周期、无需共享实现)。
  // 非法输入原样返回 = 与 shade() 同容错(调用方按 #rrggbb 传参,formatting 错就不崩、原样吐回)。
  function hexToHslLocal(hex) {
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
  function hslLocalToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    function f(n) {
      var k = (n + h / 30) % 12;
      var a = s * Math.min(l, 1 - l);
      var c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
      return Math.round(255 * c);
    }
    function hx(v) { v = Math.max(0, Math.min(255, v)); return ('0' + v.toString(16)).slice(-2); }
    return '#' + hx(f(0)) + hx(f(8)) + hx(f(4));
  }
  var FAR_HUE_SHIFT = 11, FAR_SAT_SCALE = 0.85;   // 保守常量(区间 8-14°/~0.85 量级,截图核后定;region 基色仍主导——只挪不炖)
  // 只【正向】旋色相(+FAR_HUE_SHIFT):本引擎全部有剪影的 region 基色相 ∈[0°,226°](已列表核验,见 deviations),
  // 单调正向旋转在此区间内恒向 红→黄→绿→青→蓝 弧推进、不会绕经 360°/0° 撞回暖端——用固定符号偏移即可保证
  // "总是偏冷弧"而不必按起始色相判断方向(判断方向〔如"取最短路径转向目标蓝色相"〕在暖色附近会出现两条路径
  // 距离相近、结果落回红/品红端的反效果,已实测排除,见 deviations)。配合降饱和(冷灰化)完成"远处偏蓝灰"。
  function coolFar(hex) {
    var hsl = hexToHslLocal(hex);
    if (!hsl) return hex;   // 非 #rrggbb 原样返回(与 shade() 同容错)
    return hslLocalToHex(hsl[0] + FAR_HUE_SHIFT, hsl[1] * FAR_SAT_SCALE, hsl[2]);
  }
  function regularPolygon(cx, cy, r, n, rotDeg) {
    var pts = [], rot = (rotDeg == null ? -90 : rotDeg) * Math.PI / 180;
    for (var i = 0; i < n; i++) { var a = rot + i * 2 * Math.PI / n; pts.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1)); }
    return pts.join(' ');
  }
  // 数字卷轴(round7 机制):噪声数字飞滚 → ease-out 停在末格真值。(cx,cy)=数字中心,窗口随之。
  // **描边光晕**(paint-order:stroke,白字 + 深 halo 贴字形)+ dominant-baseline 居中 → 数字优雅浮于骰面、压得住棱线、居中,
  // 不用难看的底盘圆(调研:paint-order halo 既贴字形又高对比,优于"框住数字"的 plate;O'Reilly/MDN)。
  function numberReel(cx, cy, faceVal) {
    var REEL = ['7', '2', '15', '9', '4', '18', '11', '6'], n = REEL.length;   // 固定噪声(→可测、非真随机);真值在末格
    var A = 'dominant-baseline="central" text-anchor="middle" font-size="16" font-weight="800" fill="#fff" stroke="#1a1a1a" stroke-width="3" paint-order="stroke" style="paint-order:stroke"';
    var rh = '';
    for (var ri = 0; ri < n; ri++) rh += '<text x="13" y="' + (ri * 26 + 13) + '" ' + A + '>' + REEL[ri] + '</text>';
    rh += '<text class="amatlas-die-face" x="13" y="' + (n * 26 + 13) + '" ' + A + '>' + faceVal + '</text>';
    // 数字裁剪用 clipPath 几何裁剪,不依赖嵌套 svg 的 overflow/viewport ——
    // **showcase 真机实测**:`overflow="hidden"` 被作者 `#scene svg{height:auto}` 一刀切干扰后失效、8 个候选数字全溢出在骰面上方;
    // 嵌套 svg 的 overflow 裁剪依赖 viewport 行为(易被作者 CSS 破坏),clipPath 是 SVG 底层几何裁剪 → clip rect 在 viewBox 用户坐标系、
    // 与 text 同坐标系 → 相对位置固定、不受 svg 缩放/CSS height 影响。裁剪框套在不动的外层 <g>,内层 .amatlas-die-reel 动画 translateY 进出固定窗口。
    // id 用坐标(slot 递增→cx 唯一、无随机=可测);保留 overflow="hidden" 作不支持 clip 时的降级。
    var cid = 'arc' + cx + '_' + cy;
    return '<svg x="' + (cx - 13) + '" y="' + (cy - 13) + '" width="26" height="26" viewBox="0 ' + (n * 26) + ' 26 26" overflow="hidden">'
      + '<clipPath id="' + cid + '"><rect x="0" y="' + (n * 26) + '" width="26" height="26"/></clipPath>'
      + '<g clip-path="url(#' + cid + ')"><g class="amatlas-die-reel">' + rh + '</g></g></svg>';
  }
  // 切面顶点(数组,供切面宝石算棱面)
  function dieVerts(cx, cy, r, n, rotDeg) {
    var v = [], rot = (rotDeg == null ? -90 : rotDeg) * Math.PI / 180;
    for (var i = 0; i < n; i++) { var a = rot + i * 2 * Math.PI / n; v.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return v;
  }
  function ptsStr(v) { return v.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); }
  // 切面宝石(多面骰 2.5D 立体感):外轮廓 + 斜切棱面(按高低明暗)+ 顶面(最亮,数字落其上)。纯 SVG、轻量、覆盖任意面数;业界骰子图标画法。
  function gemBody(cx, cy, R, n, df, rotDeg) {
    var outer = dieVerts(cx, cy, R, n, rotDeg), inner = dieVerts(cx, cy, R * 0.55, n, rotDeg);
    var s = '<g class="amatlas-die-box">';                                   // 整组随掷动去色(中性悬念)→ 落定显成/败色
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n, midY = (outer[i][1] + outer[j][1] + inner[i][1] + inner[j][1]) / 4, t = (cy - midY) / R;   // 上方 +、下方 −
      s += '<polygon points="' + ptsStr([outer[i], outer[j], inner[j], inner[i]]) + '" fill="' + shade(df, 0.22 * t - 0.06) + '" stroke="rgba(0,0,0,.32)" stroke-width="1"/>';   // 棱面:上亮下暗
    }
    s += '<polygon points="' + ptsStr(inner) + '" fill="' + shade(df, 0.24) + '" stroke="rgba(0,0,0,.32)" stroke-width="1"/>';   // 顶面(最亮)
    return s + '<polygon points="' + ptsStr(outer) + '" fill="none" stroke="#222" stroke-width="1.5"/></g>';                       // 外轮廓
  }
  // 骰身(据骰形画;fill=成败/极值色)。box 与 round7 字节一致、cube 三面明度 → 旧测试零回归;多面骰=切面宝石。
  function dieBody(kind, cx, cy, df) {
    if (kind === 'box') return '<rect class="amatlas-die-box" x="' + (cx - 14) + '" y="' + (cy - 14) + '" width="28" height="28" rx="5" fill="' + df + '" stroke="#222" stroke-width="2"/>';
    if (kind === 'cube') {
      var a = 19, b = 9, d = 19, topY = cy - 14;   // 放大(数字不压边)
      var top = cx + ',' + (topY - b) + ' ' + (cx + a) + ',' + topY + ' ' + cx + ',' + (topY + b) + ' ' + (cx - a) + ',' + topY;
      var left = (cx - a) + ',' + topY + ' ' + cx + ',' + (topY + b) + ' ' + cx + ',' + (topY + b + d) + ' ' + (cx - a) + ',' + (topY + d);
      var right = cx + ',' + (topY + b) + ' ' + (cx + a) + ',' + topY + ' ' + (cx + a) + ',' + (topY + d) + ' ' + cx + ',' + (topY + b + d);
      return '<g class="amatlas-die-box">'                                            // 整组去色动画(滚动中中性悬念)
        + '<polygon points="' + left + '" fill="' + df + '" stroke="#222" stroke-width="1.5"/>'
        + '<polygon points="' + right + '" fill="' + shade(df, -0.24) + '" stroke="#222" stroke-width="1.5"/>'
        + '<polygon points="' + top + '" fill="' + shade(df, 0.28) + '" stroke="#222" stroke-width="1.5"/>'
        + '</g>';
    }
    var n = kind === 'tri' ? 3 : kind === 'diamond' ? 4 : kind === 'penta' ? 5 : 6;   // 轮廓边数
    return gemBody(cx, cy, 22, n, df, -90);                                            // 切面宝石(R22:骰身放大,数字不压边);比平轮廓立体、纯 SVG、覆盖任意面数(d4/d8/d10/d12/d20)
  }

  function critStar(x, y, r) {   // 四角闪烁星(暴击点缀)
    return '<polygon points="' + x + ',' + (y - r * 2.4).toFixed(1) + ' ' + (x + r * 0.5).toFixed(1) + ',' + (y - r * 0.5).toFixed(1) + ' ' + (x + r * 2.4).toFixed(1) + ',' + y + ' ' + (x + r * 0.5).toFixed(1) + ',' + (y + r * 0.5).toFixed(1) + ' ' + x + ',' + (y + r * 2.4).toFixed(1) + ' ' + (x - r * 0.5).toFixed(1) + ',' + (y + r * 0.5).toFixed(1) + ' ' + (x - r * 2.4).toFixed(1) + ',' + y + ' ' + (x - r * 0.5).toFixed(1) + ',' + (y - r * 0.5).toFixed(1) + '" fill="#fff3c4"/>';
  }
  // 暴击金光(华丽):柔光晕 + 12 道放射星芒 + **贴骰形**金描边(加粗) + 闪烁星。全在 .amatlas-die-crit(随落定迸现 + 旋入)。
  function critAura(sk, cx, cy) {
    var outline;
    if (sk === 'box') outline = '<rect x="' + (cx - 20) + '" y="' + (cy - 20) + '" width="40" height="40" rx="8" fill="none" stroke="#f6c945" stroke-width="3"/>';
    else if (sk === 'cube') { var a = 24, b = 12, d = 24, ty = cy - 18; var hull = cx + ',' + (ty - b) + ' ' + (cx + a) + ',' + ty + ' ' + (cx + a) + ',' + (ty + d) + ' ' + cx + ',' + (ty + b + d) + ' ' + (cx - a) + ',' + (ty + d) + ' ' + (cx - a) + ',' + ty; outline = '<polygon points="' + hull + '" fill="none" stroke="#f6c945" stroke-width="3"/>'; }
    else { var n = sk === 'tri' ? 3 : sk === 'diamond' ? 4 : sk === 'penta' ? 5 : 6; outline = '<polygon points="' + regularPolygon(cx, cy, 28, n, -90) + '" fill="none" stroke="#f6c945" stroke-width="3"/>'; }
    var rays = '';
    for (var i = 0; i < 12; i++) { var a = i * 30 * Math.PI / 180, r1 = 30, r2 = (i % 2 ? 37 : 43); rays += '<line x1="' + (cx + r1 * Math.cos(a)).toFixed(1) + '" y1="' + (cy + r1 * Math.sin(a)).toFixed(1) + '" x2="' + (cx + r2 * Math.cos(a)).toFixed(1) + '" y2="' + (cy + r2 * Math.sin(a)).toFixed(1) + '" stroke="#ffe07a" stroke-width="' + (i % 2 ? 1.5 : 2.5) + '" stroke-linecap="round"/>'; }
    return '<g class="amatlas-die-crit">'
      + '<circle cx="' + cx + '" cy="' + cy + '" r="33" fill="#f6c945" opacity="0.15"/>'                                  // 柔光晕
      + rays + outline
      + critStar(cx + 29, cy - 25, 3.4) + critStar(cx - 31, cy - 12, 2.4) + critStar(cx + 25, cy + 23, 2.8)               // 闪烁星
      + '</g>';
  }

  // ── 表现力升级(调研 A4,docs/expressiveness-upgrade.md):程序化剪影构图 ─────────────────────
  // 缘起:强模型探上限发现 region 只画"纯色渐变 + 抽象图元",缺场景感。中点位移(midpoint displacement,
  // 经典地形算法:线段取中点 + 递归减半的位移扰动)生成山脊/树线/钟乳石/天际线/海浪 → 闭合 path 填充,
  // 多层不同明度叠加做景深(远淡近深=大气透视)。**确定性**:呈现器是纯函数,故用内置 PRNG(seed 从
  // region+mood hash),同场景每次渲染字节相同 → 纯函数可测 + 同一 region 风格一致;非 Math.random。
  // 纯生成 path、静态(无动画)、零依赖。**只对已知户外 region 画**(下表);room/未知 → ''(不画,
  // 室内/中性保持现状,亦使旧测试"无 region"场景零影响)。fill 用 region 派生深色(逆光剪影)。
  var REGION_TERRAIN = {
    forest: 'trees', cave: 'cave', town: 'towers', ruins: 'towers',
    sea: 'waves', beach: 'mountains', night: 'mountains',
    // 场景生态 region 收 5(signoff 三):desert 圆润沙丘 / skyclouds 云岸(各需新剪影);snowfield/volcano 复用 mountains、swamp 复用 trees(零新剪影函数)
    desert: 'dunes', snowfield: 'mountains', volcano: 'mountains', skyclouds: 'clouds', swamp: 'trees'
  };
  // FNV-1a 字符串 hash → 32 位 seed(确定性、零依赖)
  function hashStr(s) { var h = 2166136261 >>> 0; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  // mulberry32:32 位 seed → [0,1) 确定性 PRNG(同 seed 同序列,标准实现)
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // 中点位移:[0,W] 上生成起伏轮廓点(2^iters+1 个);位移向上(y 减小)、clamp 到 [minY, baseY]。
  function midpoints(rng, baseY, amp, rough, iters, minY) {
    var pts = [[0, baseY], [W, baseY]], disp = amp;
    for (var it = 0; it < iters; it++) {
      var nx = [pts[0]];
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - rng() * disp;
        if (my < minY) my = minY; else if (my > baseY) my = baseY;
        nx.push([mx, my], b);
      }
      pts = nx; disp *= rough;
    }
    return pts;
  }
  // C09 表现力升级(调研 Shan-Shui-inf / GenSVG / SVG 笔触):剪影从直线平涂 → **贝塞尔笔触**。
  //   通过点的平滑曲线——每个原顶点作二次贝塞尔控制点、相邻顶点中点作锚点 → 折线棱角化为流畅山脊/树线/波脊。
  //   顶点本就由 mulberry32 中点位移生成,这里只改"连线方式"L→Q、**不引入新随机** → 确定性守恒(K5/L8/M6/T29)。
  //   返回顶缘 path 命令串(不含闭合);silPath 据此封底成填充剪影,silRim 据此描受光脊线。
  function smoothTopPath(pts) {
    if (pts.length < 3) {   // 点太少 → 退化直线(防御;midpoints 实际恒 ≥17 点)
      var dd = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
      for (var j = 1; j < pts.length; j++) dd += ' L' + pts[j][0].toFixed(1) + ',' + pts[j][1].toFixed(1);
      return dd;
    }
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (var i = 1; i < pts.length - 1; i++) {   // 顶点 pts[i]=控制点,锚点=mid(pts[i],pts[i+1]) → 在 pts[i] 处圆角
      var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += ' Q' + pts[i][0].toFixed(1) + ',' + pts[i][1].toFixed(1) + ' ' + mx.toFixed(1) + ',' + my.toFixed(1);
    }
    return d + ' L' + pts[pts.length - 1][0].toFixed(1) + ',' + pts[pts.length - 1][1].toFixed(1);
  }
  // 轮廓点 → 闭合填充 path(底边封到画布底 H;顶缘=贝塞尔山脊)。op<1 透出天空渐变 = 大气透视(远景更淡)。
  function silPath(pts, fill, op) {
    var d = smoothTopPath(pts) + ' L' + W + ',' + H + ' L0,' + H + ' Z';
    return '<path d="' + d + '" fill="' + fill + '"' + (op != null ? ' opacity="' + op + '"' : '') + '/>';
  }
  // C09 顶缘受光:沿剪影【最近层】脊线描一道淡光 stroke(承接天空/逆光)→ 平涂剪影有"受光边"、增体积/立体。
  //   **stroke-only(fill="none")、不闭合** → 不被 gradeSVG/Q8 的 `fill="#hex"` 远近分级捕获、不破远近层 fill 计数;
  //   stroke 色用 shade(bg, 正)派生【提亮】色(逆光顶缘)、绝不写字面 #000(保 K7/L7/N10)。
  function silRim(pts, color) {
    return '<path d="' + smoothTopPath(pts) + '" fill="none" stroke="' + color + '" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>';
  }
  // ── 视觉批3-V6(docs/gameplay-expressiveness-plan.md §二 V6):深度带视差 SMIL 漂移 ─────────────
  // 缘起:剪影已有多层(V1 远冷近暖 + V3 皴法 + V4 毛边)撑出"静态纵深",但画面仍是一帧定格——真实视差
  //   (parallax)靠"近快远慢"的相对运动感强化纵深,是横版卷轴/2.5D 背景的经典手法(Super Mario Bros 多层
  //   卷动背景、迪士尼多平面摄影机 multiplane camera 皆此原理:摄影机/视点移动时,远层因视差角变化更小
  //   而移动更慢)。此处场景本身不卷动(单帧静态构图),故用「极缓横向往返」模拟同一直觉——远层位移小、
  //   周期长(几乎不可察觉的漂移);近层位移稍大、周期短(更活跃)——对比出"近快远慢"的相对速度差。
  // 做法:对已构造好的自封闭 <path .../> 做字符串手术(同 stripSmil 的既有手法,不改 silPath/near 坐标
  //   本身)——把结尾 `/>` 换成 `><animateTransform .../></path>`,包一层水平 additive="sum" 往返位移。
  //   **改的是呈现方式(动画包裹),不改路径几何**(d 属性字节不变,"视觉①的多层/明度差撑纵深"的静态骨架
  //   原封不动;视差只是叠加的"活"层,reduced-motion 剥离后退回纯静态多层构图,满足"视差不许当唯一纵深
  //   来源"的边界)。count(s,'<path') 不受影响 —— `</path>` 子串不含 `<path`(实测校验,见测试 SS 段)。
  // additive="sum" translate(仿 :1140 groundfogLayer 的横向往返写法)而非改 <path d>:避免与既有依赖
  //   d 首字符判断几何类型的代码(K8 的 `<path d="M[^"]*Q[^"]*"` 等)产生耦合,变换是纯呈现层叠加。
  // 参数确定性:dur/begin/px 全部从**该剪影已就位的 rng**(全函数唯一入口,见 buildSilhouette)在 far/
  //   near/cun/rim 层完整算出后再抽一个独立 `|par` 语义的 subSeed 流派生(同 V3/V4 "far/near 已物化完毕才
  //   抽新流"的既有规矩)——不消费/不影响 V1-V5 任何一层的既有 rng 序列与产出字节。
  // px 位移取个位(1-4px 量级,近景略大远景略小,呼应"近处看起来动得更明显"的直觉);dur 远层显著长于
  //   近层(远 18-30s / 近 8-14s 区间,互不重叠→"far dur > near dur"恒成立、可稳定断言)。
  function driftPar(pathSvg, px, dur, begin) {
    var anim = '<animateTransform attributeName="transform" type="translate" additive="sum" values="'
      + (-px).toFixed(1) + ',0;' + px.toFixed(1) + ',0;' + (-px).toFixed(1) + ',0" dur="' + dur.toFixed(1)
      + 's" begin="' + begin.toFixed(1) + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>';
    return pathSvg.replace(/\/>$/, '>' + anim + '</path>');
  }
  // 深度带 dur 派生:远(索引 0)取长区间、近(末索引)取短区间,中间层线性插值——3 段(waves/clouds)与
  //   2 段(mountains/dunes/trees/towers 的 far/near)共用同一插值,`n===1` 时退化取远端值(防除零)。
  var PAR_FAR_DUR = [18, 30], PAR_NEAR_DUR = [8, 14], PAR_FAR_PX = [1, 2], PAR_NEAR_PX = [2.4, 4];
  function parDurAt(rng, t) {   // t∈[0,1]:0=最远、1=最近
    var lo = PAR_FAR_DUR[0] + (PAR_NEAR_DUR[0] - PAR_FAR_DUR[0]) * t, hi = PAR_FAR_DUR[1] + (PAR_NEAR_DUR[1] - PAR_FAR_DUR[1]) * t;
    return lo + rng() * (hi - lo);
  }
  function parPxAt(rng, t) {
    var lo = PAR_FAR_PX[0] + (PAR_NEAR_PX[0] - PAR_FAR_PX[0]) * t, hi = PAR_FAR_PX[1] + (PAR_NEAR_PX[1] - PAR_FAR_PX[1]) * t;
    return lo + rng() * (hi - lo);
  }
  // 给单层剪影包视差(2 层 far/near 场景用):prng 为该场景专属的独立 |par 流,t=0 远/1 近。
  function withPar(prng, pathSvg, t) {
    return driftPar(pathSvg, parPxAt(prng, t), parDurAt(prng, t), -prng() * 20);
  }
  // ── 视觉批2-V3(docs/gameplay-expressiveness-plan.md §二 V3):皴法式多层剪影 ─────────────────
  // 缘起:平涂 far/near 两层是"色块",缺内部层次;山水画「皴法」= 在山体表面叠加多道由淡渐浓/由远及近
  // 收缩的墨痕纹理笔触,勾出体积与肌理(而非再造一层远景)。向量化做法(zverok's Shan-Shui Day16,已核实:
  // num_layers 分层 + expansion 逐层收缩 + 噪声防机械规整)= 在 near 层的可见山面上,叠 N 道向内(朝山脊)
  // 收缩的轮廓层,expansion=1-i/N 递减(层号越大、越贴近脊线、振幅越窄)。
  // **画在 near 之后(近层"表面"上,而非远近之间)**——原因双重:① 语义:皴法纹理是刻在最前景可见山体表面
  // 的笔触,不是新增的远景深度带;② 测试兼容:silFills(K12/K12b)按出现顺序取 fills[0]=远层/fills[1]=近层,
  // 新层必须排在两者之后,才不移位既有断言引用的索引(核心思想八条#6:引擎未发布允许更新断言,但优先零改)。
  // **独立 `|cun` 种子流**(与 far/near 所在的主 rng 完全隔离,见 buildSilhouette 调用处)——因此:
  // ① far/near 的 `d` 与其消耗的 rng 序列字节不变(旧断言 K10/K14/K15/BB17/BB19 天然守恒,未被本层触碰);
  // ② 新层自身的形状随机与 far/near 无关,不会因为"多算了几次 rng()"而让 far/near 悄悄漂移。
  // fill 用 shade(bg, amt) 在 near 与 rim 提亮色之间插值 amt(非新写 hex 混合工具——沿用 far/near 现成的
  // "shade() 明度轴"范式,免造字节级新依赖);opacity 逐层降低(0.5→0.2 量级),让 near 底色透出、读作
  // "叠加纹理笔触"而非"整体换色"。**为何不是叠在多变形状上的固定尺寸 overlay(阶段92 artRimLight 教训)**:
  // 这里每层的顶缘坐标由 midpoints() 按该 region 自身的 near 层参数(baseY/minY 插值)现算,天然贴合该地形
  // 轮廓本身的宽窄——不存在"通用固定尺寸套多变形状"的错配,是剪影自身的分层描绘、不是套上去的装饰。
  function cunLayers(rng, N, near, nearAmt, rimAmt, bg) {
    var out = '';
    for (var i = 1; i <= N; i++) {
      var t = i / (N + 1);                                             // (0,1) 均匀分布,不复用 near 自身坐标(层间独立噪声,防机械规整)
      var expansion = 1 - i / N * 0.55;                                // 山水皴法核心:层号越大越向内收缩(振幅/竖直跨度按比例变窄)
      var baseY = near.baseY - t * (near.baseY - near.minY) * 0.30;    // 底缘略向脊线抬升(贴近层逐渐"缩"向山脊)
      var minY = near.minY + (near.baseY - near.minY) * (1 - expansion) * 0.5;   // 顶缘随 expansion 收窄可达高度
      var amp = near.amp * expansion, rough = near.rough * (0.94 + rng() * 0.08);   // 幅度收缩 + 独立子流微扰(防各层衰减率整齐划一)
      var pts = midpoints(rng, baseY, amp, rough, near.iters, minY);
      var amt = nearAmt + (rimAmt - nearAmt) * t * 0.5;                // 明度插在 near 与 rim 提亮色之间(仅走到一半,不越过 rim 本身的提亮量)
      out += silPath(pts, shade(bg, amt), (0.5 - t * 0.28).toFixed(2));
    }
    return out;
  }
  // ── 视觉批2-V4(docs/gameplay-expressiveness-plan.md §二 V4):多遍抖动笔触(手绘毛边)────────────
  // 缘起:silRim 单道 stroke 是机器直线般的精确描边;真手绘山水笔触会有轻微来回颤抖、深浅不匀。
  // 做法:同一顶缘 path 描 2-3 遍,每遍独立 `|rim` 子流对每个顶点做 ±0.3-0.6px 微抖(不改变原始
  // pts 数组、只在描边这一遍临时生成扰动副本)+ 各遍 opacity/宽度略有差异,叠出笔触边缘的绒毛感。
  // **改的是剪影自身的 stroke(沿既有 near 层顶缘走),不是叠在 art 物件上的固定尺寸 overlay**——与阶段92
  // artRimLight(固定 13px 弧套 14 个宽窄不一的物件预设、游离成噪声)的失败模式不同:这里的每一遍抖动都是
  // 对**同一条**已知顶缘曲线的微扰描边,曲线本身来自该地形当次生成的真实轮廓,不存在"通用参数不合形状"
  // 的错配——只是让这条曲线的呈现方式从"单一精确描边"变成"多遍略颤描边",贴合度不受影响。
  // 低 opacity(0.5 降至末遍更低)+ 小抖幅(≤0.6px)守克制,防滑向过度装饰(核心思想八条#4/#8)。
  function mottledRim(rng, pts, color, passes) {
    var out = '';
    for (var p = 0; p < passes; p++) {
      var jp = pts.map(function (pt) { return [pt[0] + (rng() - 0.5) * 1.0, pt[1] + (rng() - 0.5) * 1.0]; });   // ±0.5px 抖动(独立 |rim 子流)
      var op = (0.5 - p * 0.14).toFixed(2), sw = (1.2 - p * 0.25).toFixed(2);
      out += '<path d="' + smoothTopPath(jp) + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round" opacity="' + op + '"/>';
    }
    return out;
  }
  // V3/V4 独立种子流的取法:**在 far/near(或 towers 的 farD/nearD)已完整算出之后**,从同一个已就位的 rng
  // 再各抽一个 32 位 token 去播种 cunLayers/mottledRim 各自的 mulberry32 子流——因为 JS 数组/字符串是立即
  // 求值(非惰性),far/near 的点数组 far/near 在这行之前已完全物化,之后再动 rng 不会改动它们已产出的字节;
  // 且 buildSilhouette 传入的这个 rng 全程只服务本函数(buildAtmosphere/godRays/buildWeather 各自另开独立
  // rng,见其调用处 `|a`/`|rays`/`|w` 后缀,从不共享/续用剪影的 rng)→ 抽这两个 token 不会外溢污染其它层。
  // 舍弃"hashStr(数组长度)"的写法:midpoints() 在给定 iters 时无论内容如何、点数恒为 2^iters+1(纯递归结构
  // 决定,与实际随机取值无关)→ 那种写法会退化成常量种子(同一 region 不同 mood 仍产出同一皴法/毛边形状,
  // 违 buildSilhouette 注释"mood 混入 seed → 同 region 不同 mood 形状微变"的既有设计原则),故改用此法。
  function subSeed(rng) { return (rng() * 4294967296) >>> 0; }
  function silMountains(rng, bg) {   // 远山 + 近山(山脊)+ 近山顶缘受光(V4 多遍毛边)+ V3 皴法内层纹理。先算 far 再算 near:rng 消耗顺序同旧版(只改连线/加 rim)
    var farOpt = { baseY: 118, amp: 40, rough: 0.55, iters: 5, minY: 74 }, nearOpt = { baseY: 132, amp: 56, rough: 0.52, iters: 5, minY: 90 };
    var far = midpoints(rng, farOpt.baseY, farOpt.amp, farOpt.rough, farOpt.iters, farOpt.minY);
    var near = midpoints(rng, nearOpt.baseY, nearOpt.amp, nearOpt.rough, nearOpt.iters, nearOpt.minY);
    var crng = mulberry32(subSeed(rng)), rrng = mulberry32(subSeed(rng)), prng = mulberry32(subSeed(rng));   // V3/V4/V6 独立种子流(far/near 已物化完毕,见上方总注释)
    return withPar(prng, silPath(far, coolFar(shade(bg, -0.30)), 0.85), 0) + withPar(prng, silPath(near, shade(bg, -0.52), null), 1)   // V1:远层叠色相分量(近层不动);V6:远慢近快视差
      + cunLayers(crng, 5, nearOpt, -0.52, 0.34, bg)                                             // V3:5 层皴法(山体肌理感最强的族)
      + mottledRim(rrng, near, shade(bg, 0.34), 3);                                              // V4:3 遍毛边(替代旧单遍 silRim)
  }
  function silDunes(rng, bg) {   // 沙漠圆润沙丘(休止角 30-35° 风积):低 amp + 高 rough(慢衰减→缓坡圆脊,与尖山脊对照)。先 far 再 near:rng 消耗顺序同其它剪影
    var farOpt = { baseY: 124, amp: 26, rough: 0.66, iters: 5, minY: 96 }, nearOpt = { baseY: 138, amp: 34, rough: 0.64, iters: 5, minY: 110 };
    var far = midpoints(rng, farOpt.baseY, farOpt.amp, farOpt.rough, farOpt.iters, farOpt.minY);
    var near = midpoints(rng, nearOpt.baseY, nearOpt.amp, nearOpt.rough, nearOpt.iters, nearOpt.minY);
    var crng = mulberry32(subSeed(rng)), rrng = mulberry32(subSeed(rng)), prng = mulberry32(subSeed(rng));
    return withPar(prng, silPath(far, coolFar(shade(bg, -0.24)), 0.85), 0) + withPar(prng, silPath(near, shade(bg, -0.44), null), 1)   // V1:远层叠色相分量;V6:远慢近快视差
      + cunLayers(crng, 3, nearOpt, -0.44, 0.30, bg)                                             // V3:3 层(圆润沙丘缓坡,层次比尖山脊克制)
      + mottledRim(rrng, near, shade(bg, 0.30), 2);                                              // V4:2 遍(风积缓坡毛边更淡)
  }
  function silTrees(rng, bg) {   // 高 roughness(慢衰减)→ 保持高频参差树冠;近层树线顶缘受光(V4 毛边)+ V3 树冠皴层
    var farOpt = { baseY: 116, amp: 30, rough: 0.7, iters: 6, minY: 78 }, nearOpt = { baseY: 130, amp: 42, rough: 0.68, iters: 6, minY: 90 };
    var far = midpoints(rng, farOpt.baseY, farOpt.amp, farOpt.rough, farOpt.iters, farOpt.minY);
    var near = midpoints(rng, nearOpt.baseY, nearOpt.amp, nearOpt.rough, nearOpt.iters, nearOpt.minY);
    var crng = mulberry32(subSeed(rng)), rrng = mulberry32(subSeed(rng)), prng = mulberry32(subSeed(rng));
    return withPar(prng, silPath(far, coolFar(shade(bg, -0.22)), 0.8), 0) + withPar(prng, silPath(near, shade(bg, -0.44), null), 1)   // V1:远层叠色相分量;V6:远慢近快视差
      + cunLayers(crng, 3, nearOpt, -0.44, 0.30, bg)                                            // V3:3 层(树冠参差本身已高频,层数克制避免糊成一团)
      + mottledRim(rrng, near, shade(bg, 0.30), 2);                                             // V4:2 遍
  }
  function silWaves(rng, bg) {   // 多层低振幅水平起伏(远淡近深)+ 最近层波脊受光(V4 毛边)+ V3 近层水纹皴 + V6 三段深度带视差
    var out = '', ys = [104, 118, 132], ops = [0.5, 0.66, 0.86], near = null, nearOpt = null, pieces = [];
    for (var k = 0; k < ys.length; k++) {
      var opt = { baseY: ys[k], amp: 9, rough: 0.6, iters: 4, minY: ys[k] - 12 };
      var pk = midpoints(rng, opt.baseY, opt.amp, opt.rough, opt.iters, opt.minY);
      near = pk; nearOpt = opt;
      var fk = shade(bg, -0.18 - k * 0.13);
      pieces.push(silPath(pk, k === 0 ? coolFar(fk) : fk, ops[k]));   // V1:仅最远层(k=0)叠色相分量
    }
    var crng = mulberry32(subSeed(rng)), rrng = mulberry32(subSeed(rng)), prng = mulberry32(subSeed(rng));   // 全部 ys 循环已跑完(near/nearOpt=最近层)才抽 token,不扰 3 段深度带的既有 rng 消耗
    for (var pk2 = 0; pk2 < pieces.length; pk2++) out += withPar(prng, pieces[pk2], pk2 / (pieces.length - 1));   // V6:3 段 t=0/0.5/1 线性插值远慢近快
    return out + cunLayers(crng, 2, nearOpt, -0.18 - 2 * 0.13, 0.20, bg)   // V3:2 层(水面已有 3 段深度带,皴层克制,读作近浪细纹而非再添一段水域)
      + mottledRim(rrng, near, shade(bg, 0.20), 2);                        // V4:2 遍(波光毛边)
  }
  // towers 版毛边:天际线是直线阶梯(非 midpoints() 曲线),用直线抖动(非 smoothTopPath 的 Q 贝塞尔——保持
  // 建筑轮廓的硬朗棱角,不把方正楼群画成软山脊)沿同一组顶点描 2-3 遍,风格与 mottledRim 一致但连线方式匹配
  // 该地形自身的折线特征(呼应 V4 设计原则:笔触贴合该剪影自身的线型,非套用另一种地形的连线方式)。
  function mottledRimStraight(rng, xs, ys, color, passes) {
    var out = '';
    for (var p = 0; p < passes; p++) {
      var d = '';
      for (var i = 0; i < xs.length; i++) {
        var jx = (xs[i] + (rng() - 0.5) * 1.0).toFixed(1), jy = (ys[i] + (rng() - 0.5) * 1.0).toFixed(1);
        d += (i === 0 ? 'M' : ' L') + jx + ',' + jy;
      }
      var op = (0.5 - p * 0.14).toFixed(2), sw = (1.2 - p * 0.25).toFixed(2);
      out += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + sw + '" stroke-linecap="round" opacity="' + op + '"/>';
    }
    return out;
  }
  function silTowers(rng, bg) {   // 阶梯天际线(随机段宽 + 平顶高度);path 折线,不用 rect;V3 加内层建筑轮廓(更密天际线纹理)+ V4 直线毛边
    var nearXs = [], nearYs = [];   // 记录 near 天际线顶缘顶点(供 V4 描边;far/near 自身 d 字符串不受影响)
    function skyline(baseY, minTop, maxTop, record) {
      var d = 'M0,' + baseY, x = 0;
      if (record) { nearXs.push(0); nearYs.push(baseY); }
      while (x < W) {
        var w = 16 + rng() * 32, top = minTop + rng() * (maxTop - minTop), x2 = Math.min(x + w, W);
        d += ' L' + x.toFixed(1) + ',' + top.toFixed(1) + ' L' + x2.toFixed(1) + ',' + top.toFixed(1);
        if (record) { nearXs.push(x, x2); nearYs.push(top, top); }
        x = x2;
      }
      return d + ' L' + W + ',' + baseY + ' L' + W + ',' + H + ' L0,' + H + ' Z';
    }
    var farD = skyline(122, 64, 104, false), nearD = skyline(132, 84, 116, true);
    var crng = mulberry32(subSeed(rng)), rrng = mulberry32(subSeed(rng)), prng = mulberry32(subSeed(rng));   // V3/V4/V6 独立种子流(farD/nearD 已物化完毕,同上方总注释)
    var cun = '';                                                                             // 内层建筑轮廓(更窄段宽、更高、贴近 near 天际线主体的密集感,读作前景楼群细部而非再添一层远景)
    for (var i = 1; i <= 3; i++) {
      var t = i / 4, baseY = 132 - t * 6, top1 = 96 - t * 10, top2 = 122 - t * 12;
      var d = 'M0,' + baseY, x = 0;
      while (x < W) {
        var w = 10 + crng() * 18, top = top1 + crng() * (top2 - top1), x2 = Math.min(x + w, W);
        d += ' L' + x.toFixed(1) + ',' + top.toFixed(1) + ' L' + x2.toFixed(1) + ',' + top.toFixed(1);
        x = x2;
      }
      d += ' L' + W + ',' + baseY + ' L' + W + ',' + H + ' L0,' + H + ' Z';
      cun += '<path d="' + d + '" fill="' + shade(bg, -0.54 - t * 0.12) + '" opacity="' + (0.5 - t * 0.1).toFixed(2) + '"/>';
    }
    return withPar(prng, '<path d="' + farD + '" fill="' + coolFar(shade(bg, -0.34)) + '" opacity="0.8"/>', 0)   // V1:远层(第一次 skyline)叠色相分量;V6:远慢视差
      + withPar(prng, '<path d="' + nearD + '" fill="' + shade(bg, -0.54) + '"/>', 1)          // V6:近快视差
      + cun                                                                                    // V3:3 层内密天际线(城市轮廓的"层叠楼群"读法,补足平面天际线缺的纵深纹理)
      + mottledRimStraight(rrng, nearXs, nearYs, shade(bg, 0.30), 2);                           // V4:2 遍直线毛边(楼顶轮廓的风化/大气柔化感,克制)
  }
  function silCave(rng, bg) {   // 上垂钟乳石 + 下立石笋(尖齿带)
    function teeth(anchorY, dir, minLen, maxLen) {   // dir=+1 向下(钟乳石)/ -1 向上(石笋)
      var d = 'M0,' + anchorY, x = 0;
      while (x < W) {
        var w = 16 + rng() * 22, len = minLen + rng() * (maxLen - minLen), x2 = Math.min(x + w, W);
        d += ' L' + ((x + x2) / 2).toFixed(1) + ',' + (anchorY + dir * len).toFixed(1) + ' L' + x2.toFixed(1) + ',' + anchorY;
        x = x2;
      }
      return dir > 0 ? d + ' L' + W + ',0 L0,0 Z' : d + ' L' + W + ',' + H + ' L0,' + H + ' Z';
    }
    return '<path d="' + teeth(BAR, 1, 12, 40) + '" fill="' + shade(bg, -0.32) + '" opacity="0.9"/>'
      + '<path d="' + teeth(140, -1, 10, 34) + '" fill="' + shade(bg, -0.5) + '"/>';
  }
  function silClouds(rng, bg) {   // 日间积云成层云岸:仿 silWaves 多层,但**正向 shade(亮云)**——云被光照比天空更亮(逆于其它逆光深色剪影);云带抬高、近层云脊受光 + V6 三段深度带视差
    var out = '', ys = [78, 96, 114], ops = [0.55, 0.7, 0.88], near = null, pieces = [];
    for (var k = 0; k < ys.length; k++) { var pk = midpoints(rng, ys[k], 16, 0.62, 5, ys[k] - 22); near = pk; var fk = shade(bg, 0.30 + k * 0.16); pieces.push(silPath(pk, k === 0 ? coolFar(fk) : fk, ops[k])); }   // V1:仅最远层(k=0)叠色相分量(亮云同理受大气透视——远云仍偏冷灰)
    var prng = mulberry32(subSeed(rng));   // 3 段云带已物化完毕(near=最近层)才抽 token,不扰既有 rng 消耗
    for (var pk2 = 0; pk2 < pieces.length; pk2++) out += withPar(prng, pieces[pk2], pk2 / (pieces.length - 1));   // V6:远慢近快
    return out + silRim(near, shade(bg, 0.62));
  }
  // region → 剪影层(背景远景);未知/室内 region → ''(不画)。mood 混入 seed → 同 region 不同 mood 形状微变。
  function buildSilhouette(region, mood, bg) {
    var kind = REGION_TERRAIN[region];
    if (!kind) return '';
    var rng = mulberry32(hashStr(region + '|' + (mood || '')));
    if (kind === 'trees') return silTrees(rng, bg);
    if (kind === 'cave') return silCave(rng, bg);
    if (kind === 'towers') return silTowers(rng, bg);
    if (kind === 'waves') return silWaves(rng, bg);
    if (kind === 'dunes') return silDunes(rng, bg);      // 场景生态 region:desert 圆润沙丘
    if (kind === 'clouds') return silClouds(rng, bg);    // 场景生态 region:skyclouds 亮云岸
    return silMountains(rng, bg);
  }

  // ── 表现力升级(挽歌样例 generateXxxArt + 调研 V4/V7):程序化氛围点缀 + 辉光 ────────────────
  // 缘起:剪影给了"地形轮廓",但场景仍缺"生命"。挽歌用种子 PRNG 拼 星空/月/林间光斑/发光矿物/窗户暖光
  // → 场景"有氛围"。全零依赖纯生成、确定性(种子 PRNG,非 Math.random)、**静态**(无动画 → 可测 + 无障碍)。
  // 发光感=同心圆递减 opacity(挽歌月做法,无需滤镜) + 月叠辉光滤镜(feGaussianBlur+feMerge,调研 V4)。
  // 只对已知 region 加(同剪影,room/未知→空);用 circle/line(不用 ellipse/rect/text → 保 H/B/C 段精确计数);
  // fill 用彩色(绝不写字面 #000 → 保 letterbox I1)。
  var GLOW_FILTER = '<filter id="aglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b"><animate attributeName="stdDeviation" values="2;3.6;2" dur="5s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/></feGaussianBlur><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';   // 辉光呼吸(调研 C1:animate stdDeviation → 月/发光元素自动"呼吸")

  // ── 物件具体化 · 场景融合(治用户反馈"突兀/悬浮/扁平"):软投影 + 体积塑形 ──────────────────────
  // 缘起:背景层(剪影/渐变/暗角/天气/光)已很丰富,但 element.art 物件原样"贴"在场景上 —— 无投影=悬浮、
  //   纯色填充=扁平、与逆光低饱和氛围割裂(高饱和像贴纸)。两招(全 presenter 端,art 数据/DSL 不变,
  //   保 renderArtSpec 字节 → T6-T12/T29 守恒;仅在 element 循环的 art 放置处包裹):
  //   ① 软自影滤镜 aart:模糊深色副本下偏 → 物件离背景"浮起"有体积,且软边把物件从剪影/雾里分离(不再像玻璃上画)。
  //   ② 接地椭圆:物件脚下投在地面的柔影 → 锚定地面、消"悬浮"(仿 dice 的 .amatlas-die-shadow)。
  //   (曾有第③招 mood 轮廓光弧 artRimLight,但对又高又窄的人影读成游离的白/黑半弧、帮倒忙 → 端用户实测拍板移除。)
  //   仅在场景含 art 物件时注入滤镜定义(hasArt;保无 art 场景字节不变)。色用派生深色,绝不写字面 #000。
  // 软自影:模糊 + 下偏 + 压暗(feColorMatrix 把副本变半透明深色)→ feMerge 叠回原图下层。x/y 扩区防裁。
  var ART_SHADOW_FILTER = '<filter id="aart" x="-40%" y="-25%" width="180%" height="170%">'
    + '<feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="bl"/>'
    + '<feOffset in="bl" dx="0.8" dy="2.4" result="off"/>'
    + '<feColorMatrix in="off" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.42 0" result="sh"/>'   // 副本→半透明深色阴影(纯 alpha,无字面 #000)
    + '<feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
  // 接地柔影:物件脚下椭圆(rgba 不写字面 #000);ry 扁、宽随物件 → 贴地。bottomY=物件本地下沿(art 约 +14)。
  function artGroundShadow(cx, cy) {
    return '<ellipse cx="' + cx + '" cy="' + (cy + 16) + '" rx="15" ry="3.6" fill="rgba(0,0,0,.28)"/>';
  }
  // 发光点:同心圆递减(外大淡 r×2.4 + 内小亮 = 自发光感,挽歌月/光斑做法)
  function glowDot(cx, cy, r, color) {
    return '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (r * 2.4).toFixed(1) + '" fill="' + color + '" opacity="0.07"/>'
      + '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + color + '" opacity="0.5"/>';
  }
  // SMIL 缓慢明灭/呼吸(调研 A1/C3:**克制**——opacity 微变、dur 长、停止态=元素自身 opacity 仍可见、非闪烁)。begin 负=错开相位。
  function pulse(lo, hi, dur, begin) {
    return '<animate attributeName="opacity" values="' + lo.toFixed(2) + ';' + hi.toFixed(2) + ';' + lo.toFixed(2) + '" dur="' + dur.toFixed(1) + 's" begin="' + begin.toFixed(1) + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>';
  }
  // 萤火蜿蜒小闭环路径(调研 D1:固定形状 + PRNG 缩放,回起点 Z 无缝循环;供 animateMotion,calcMode spline 变速飘)
  function driftPath(rng) {
    var s = 0.6 + rng() * 0.9; function u(v) { return (v * s).toFixed(1); }
    return 'M0,0 q' + u(14) + ',-' + u(10) + ' ' + u(20) + ',' + u(3) + ' q' + u(8) + ',' + u(13) + ' -' + u(7) + ',' + u(15) + ' q-' + u(18) + ',' + u(4) + ' -' + u(13) + ',-' + u(18) + ' Z';
  }
  // region → 氛围点缀 {sky, ground}(sky=星月在剪影后;ground=萤火/矿物/窗光/波光在剪影前)。**动态**:SMIL 让点缀"活"
  // (星闪/萤火飘/矿物·窗光·波光脉动/辉光月呼吸),全用 GPU 合成的 SMIL(非 CSS @keyframes → 保 H7)、参数全 PRNG(确定性)、停止态可见。
  function buildAtmosphere(region, mood) {
    if (!REGION_TERRAIN[region]) return { sky: '', ground: '' };   // 同剪影:只对已知户外 region
    var rng = mulberry32(hashStr(region + '|' + (mood || '') + '|a')), sky = '', ground = '', i, n, op, du;
    if (region === 'night') {                                      // 星空(缓慢明灭)+ 可选辉光月(呼吸)
      n = 7 + Math.floor(rng() * 8);
      for (i = 0; i < n; i++) {
        op = 0.3 + rng() * 0.5; du = 2.6 + rng() * 2.8;
        sky += '<circle cx="' + (rng() * W).toFixed(1) + '" cy="' + (rng() * 56).toFixed(1) + '" r="' + (0.5 + rng() * 0.9).toFixed(1) + '" fill="#d8d0c0" opacity="' + op.toFixed(2) + '">' + pulse(op * 0.35, Math.min(1, op * 1.7), du, -rng() * du) + '</circle>';
      }
      if (rng() > 0.4) sky += '<g filter="url(#aglow)">' + glowDot(40 + rng() * (W - 80), 18 + rng() * 22, 7, '#e8d8b0') + '</g>';
    }
    if (region === 'forest') {                                     // 林间萤火(animateMotion 飘 + 明灭)
      n = 4 + Math.floor(rng() * 4);
      for (i = 0; i < n; i++) {
        du = 7 + rng() * 5;
        ground += '<g>' + glowDot(56 + rng() * (W - 112), 58 + rng() * 50, 1.3 + rng() * 1, '#c8f0a8')
          + '<animateMotion dur="' + du.toFixed(1) + 's" begin="' + (-rng() * du).toFixed(1) + 's" repeatCount="indefinite" calcMode="spline" keyPoints="0;0.5;1" keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" path="' + driftPath(rng) + '"/>'
          + pulse(0.3, 1, du * 0.7, -rng() * du) + '</g>';
      }
    }
    if (region === 'cave') {                                       // 发光矿物(缓慢脉动)
      n = 4 + Math.floor(rng() * 4);
      for (i = 0; i < n; i++) { du = 3.5 + rng() * 3; ground += '<g>' + glowDot(36 + rng() * (W - 72), 66 + rng() * 52, 1.4 + rng() * 1.1, rng() > 0.5 ? '#9a7ad8' : '#6aa6d8') + pulse(0.45, 1, du, -rng() * du) + '</g>'; }
    }
    if (region === 'town' || region === 'ruins') {                 // 窗户暖光(缓慢明灭似烛火)
      n = 5 + Math.floor(rng() * 6);
      for (i = 0; i < n; i++) { du = 2.5 + rng() * 3; ground += '<g>' + glowDot(18 + rng() * (W - 36), 96 + rng() * 22, 1 + rng() * 0.8, '#f0b860') + pulse(0.55, 1, du, -rng() * du) + '</g>'; }
    }
    if (region === 'sea' || region === 'beach') {                  // 海面波光(缓慢粼动)
      n = 5 + Math.floor(rng() * 4);
      for (i = 0; i < n; i++) {
        op = 0.2 + rng() * 0.3; du = 2.8 + rng() * 2.5;
        ground += '<circle cx="' + (rng() * W).toFixed(1) + '" cy="' + (96 + rng() * 16).toFixed(1) + '" r="' + (0.6 + rng() * 0.8).toFixed(1) + '" fill="#e8e0c8" opacity="' + op.toFixed(2) + '">' + pulse(op * 0.4, Math.min(1, op * 1.8), du, -rng() * du) + '</circle>';
      }
    }
    // ── 场景生态 region 收 5(signoff 三):点缀分支(全 circle/line + SMIL,确定性 PRNG;绝不字面 #000)──
    if (region === 'desert') {                                     // 暮空稀星(比 night 更少更高;暖白 #f0e2c0,缓慢明灭)
      n = 4 + Math.floor(rng() * 4);
      for (i = 0; i < n; i++) {
        op = 0.25 + rng() * 0.4; du = 2.8 + rng() * 2.6;
        sky += '<circle cx="' + (rng() * W).toFixed(1) + '" cy="' + (rng() * 40).toFixed(1) + '" r="' + (0.5 + rng() * 0.8).toFixed(1) + '" fill="#f0e2c0" opacity="' + op.toFixed(2) + '">' + pulse(op * 0.35, Math.min(1, op * 1.7), du, -rng() * du) + '</circle>';
      }
    }
    if (region === 'snowfield') {                                  // 雪面冰晶反光(仿波光;冷蓝白 #dfeeff,地表 y118 附近,缓慢粼动)
      n = 5 + Math.floor(rng() * 4);
      for (i = 0; i < n; i++) {
        op = 0.2 + rng() * 0.3; du = 2.8 + rng() * 2.5;
        ground += '<circle cx="' + (rng() * W).toFixed(1) + '" cy="' + (118 + rng() * 16).toFixed(1) + '" r="' + (0.6 + rng() * 0.8).toFixed(1) + '" fill="#dfeeff" opacity="' + op.toFixed(2) + '">' + pulse(op * 0.4, Math.min(1, op * 1.8), du, -rng() * du) + '</circle>';
      }
    }
    if (region === 'volcano') {                                    // 飞溅余烬(熔岩温度色 #ff6a3c/#e84a2a 交替,贴地脉动)
      n = 5 + Math.floor(rng() * 5);
      for (i = 0; i < n; i++) { du = 2.4 + rng() * 2.6; ground += '<g>' + glowDot(20 + rng() * (W - 40), 100 + rng() * 30, 1.2 + rng() * 1.2, rng() > 0.5 ? '#ff6a3c' : '#e84a2a') + pulse(0.4, 1, du, -rng() * du) + '</g>'; }
    }
    if (region === 'skyclouds') {                                  // 高空阳光斑(暖白 #fff4d0,缓慢明灭)+ 远处飞鸟(双 line 拼 V,沿闭环飘——氛围层只用 circle/line)
      n = 3 + Math.floor(rng() * 3);
      for (i = 0; i < n; i++) { du = 4 + rng() * 3; sky += '<g>' + glowDot(28 + rng() * (W - 56), 18 + rng() * 30, 2 + rng() * 1.6, '#fff4d0') + pulse(0.5, 1, du, -rng() * du) + '</g>'; }
      n = 2 + Math.floor(rng() * 3);
      for (i = 0; i < n; i++) {
        var bx = 30 + rng() * (W - 60), by = 26 + rng() * 40, bw = 3 + rng() * 2.5, bd = 9 + rng() * 6;   // 一只鸟=两条短 line 拼成的 V(海鸥剪影标记)
        sky += '<g opacity="0.55"><line x1="' + bx.toFixed(1) + '" y1="' + by.toFixed(1) + '" x2="' + (bx - bw).toFixed(1) + '" y2="' + (by + bw * 0.7).toFixed(1) + '" stroke="#3a4a5a" stroke-width="0.9" stroke-linecap="round"/>'
          + '<line x1="' + bx.toFixed(1) + '" y1="' + by.toFixed(1) + '" x2="' + (bx + bw).toFixed(1) + '" y2="' + (by + bw * 0.7).toFixed(1) + '" stroke="#3a4a5a" stroke-width="0.9" stroke-linecap="round"/>'
          + '<animateMotion dur="' + bd.toFixed(1) + 's" begin="' + (-rng() * bd).toFixed(1) + 's" repeatCount="indefinite" calcMode="spline" keyPoints="0;0.5;1" keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" path="' + driftPath(rng) + '"/></g>';
      }
    }
    if (region === 'swamp') {                                      // 鬼火/磷火(will-o'-the-wisp 甲烷冷蓝焰 #6ad0c0 + foxfire 荧光真菌绿 #8ad06a;贴水面飘 + 明灭,rng 消耗顺序与 forest 同构)
      n = 4 + Math.floor(rng() * 4);
      for (i = 0; i < n; i++) {
        du = 7 + rng() * 5;
        ground += '<g>' + glowDot(40 + rng() * (W - 80), 96 + rng() * 36, 1.4 + rng() * 1.1, rng() > 0.5 ? '#8ad06a' : '#6ad0c0')
          + '<animateMotion dur="' + du.toFixed(1) + 's" begin="' + (-rng() * du).toFixed(1) + 's" repeatCount="indefinite" calcMode="spline" keyPoints="0;0.5;1" keyTimes="0;0.5;1" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" path="' + driftPath(rng) + '"/>'
          + pulse(0.3, 1, du * 0.7, -rng() * du) + '</g>';
      }
    }
    return { sky: sky, ground: ground };
  }

  // ── 表现力升级(调研 B1,docs/expressiveness-upgrade.md §四 backlog):feTurbulence 流动雾 ──────────
  // 缘起:剪影+点缀给了"场景+生命",仍缺"大气体积/纵深"。feTurbulence fractalNoise 程序生成雾团,
  // <animate baseFrequency>(SMIL)让雾缓慢翻腾流动(调研 MDN feTurbulence / Codrops);feColorMatrix
  // 把噪声单色化成雾色 + alpha 跟随噪声 → 疏密雾团。**条件注入**(仿 hasEyes/hasDice/needGlow):只在
  // "氛围 mood"(eerie/dread/cold + 开放雾词 mist/fog/foggy/misty/haze)注入 → 无 mood / 非雾 mood 场景
  // 字节不变(保 B2/K7/M5 无 mood 精确计数 + H7)。**不含 horror-climax**(让恐怖高潮巨眼清晰、零交互最稳)。
  // 纯 mood-gated 不绑 region(室内也可起雾/烟,雾是 mood 语义;别打地鼠绑 region)。确定性:feTurbulence
  // seed 从 region+mood hash、animate 参数固定 → 纯函数可测(feTurbulence/animate 在 jsdom 不渲染,Edge 真机验)。
  // 雾承载 rect 用 fill="#fff"(绝不字面 #000 → 保 I1/K7);filter 是 <filter>(不增 rect/circle/ellipse/path,仅 1 承载 rect)。
  // 视觉批1-V2:补 desolate(废土/雪原/遗迹的经典氛围搭配=尘霾;荒芜之地起雾比"晴朗荒原"更贴合类型片视觉惯例)。
  //   不补 sad——哀伤不必然伴随雾(雨夜哀伤已有 MOOD_TINT 的 rain 冷暗色调覆盖,起雾会喧宾夺主,语义不够明确故不加)。
  var FOG_TINT = {
    eerie: '#aeb6ae', dread: '#8c8c92', cold: '#c2d0de', desolate: '#cdc4b0',
    mist: '#d2dadd', fog: '#d2dadd', foggy: '#d2dadd', misty: '#d2dadd', haze: '#dcd4c2'
  };
  function hexUnit(hex) {   // #rrggbb → [r,g,b] ∈ [0,1](feColorMatrix 用单位颜色值)
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return [0.82, 0.85, 0.87];
    return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
  }
  // 雾滤镜:fractalNoise 噪声 → feColorMatrix 固定雾色 + alpha=0.85×噪声(疏密雾团);animate baseFrequency 缓慢翻腾。
  function fogFilter(color, seed) {
    var c = hexUnit(color);
    return '<filter id="afog" x="-10%" y="-10%" width="120%" height="120%">'
      + '<feTurbulence type="fractalNoise" baseFrequency="0.009 0.013" numOctaves="3" seed="' + seed + '" stitchTiles="stitch" result="n">'
      + '<animate attributeName="baseFrequency" values="0.009 0.013;0.013 0.010;0.009 0.013" dur="26s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>'
      + '</feTurbulence>'
      + '<feColorMatrix in="n" type="matrix" values="0 0 0 0 ' + c[0].toFixed(3) + ' 0 0 0 0 ' + c[1].toFixed(3) + ' 0 0 0 0 ' + c[2].toFixed(3) + ' 0 0 0 0.85 0"/>'
      + '</filter>';
  }

  // ── 表现力升级(调研:体积光 / god-rays;{Shan,Shui} 启发 + W3C/Codrops 滤镜光照)─────────────
  // 缘起:活雾给了"大气",仍缺"光"——体积光柱(丁达尔效应)是高端场景标志(教堂/林冠/矿洞天井)。
  // 做法:单一光源 (sx,sy) 放射多条细长半透明 polygon 光束 + 径向渐变(光源亮→远端透明=体积衰减);
  //   <g mix-blend-mode:screen>(Edge 支持→增辉;不支持→当普通半透明叠加,优雅退化)。
  //   SMIL:整组绕光源缓摆(rotate 微角)+ 明暗呼吸(opacity)= 尘埃浮动的体积感(静止态 g opacity=.92 可见)。
  // **mood-gated(仿活雾,保字节)**:仅"光感 mood"注入 → 无 mood / 普通 mood 场景字节不变(保 B2/K7/N9 计数)。
  //   几何按 region 取 RAY_CFG(林冠斜光 / 矿洞窄天井 / 海面宽斜射…),无配置 region 用 RAY_CFG_DEF(顶部暖光)。
  //   确定性:种子 PRNG(region+mood hash);gid='gr_'+region 唯一(无随机 id → 可测)。
  //   只用 <polygon>+<radialGradient>(不增 rect/circle/ellipse/path → 不破既有精确计数);色用 cfg.color 不写字面 #000。
  var LIGHT_MOODS = { holy: 1, divine: 1, sacred: 1, radiant: 1, dawn: 1, sunlit: 1, godlight: 1, glory: 1, hope: 1, heavenly: 1, ethereal: 1, shafts: 1, sunbeam: 1 };
  var RAY_CFG = {
    forest: { sx: 0.30, sy: -0.04, ang: 78, spread: 26, color: '#fff3c8' },   // 树冠缝隙暖光(自左上斜下)
    ruins:  { sx: 0.62, sy: 0.02,  ang: 96, spread: 20, color: '#ffe9bf' },   // 破窗/裂顶残光(近竖直略偏)
    town:   { sx: 0.46, sy: -0.02, ang: 90, spread: 22, color: '#ffedc4' },   // 巷口天光
    cave:   { sx: 0.52, sy: -0.06, ang: 90, spread: 12, color: '#cfe6ff' },   // 矿洞天井(窄而强的冷光)
    sea:    { sx: 0.40, sy: -0.05, ang: 72, spread: 30, color: '#dff1ff' }    // 水面宽扇斜射冷光
  };
  var RAY_CFG_DEF = { sx: 0.48, sy: -0.05, ang: 90, spread: 18, color: '#ffedc4' };   // 兜底:顶部暖光(beach/night/room 等无专属配置)
  // 一束光柱:光源 (sx,sy) 沿 [a1,a2]° 张成的细长 polygon,延伸到 L(端点落画布外保证铺满)。
  function beam(sx, sy, a1, a2, L, fill, op) {
    var r1 = Math.PI * a1 / 180, r2 = Math.PI * a2 / 180;
    return '<polygon points="' + sx.toFixed(1) + ',' + sy.toFixed(1)
      + ' ' + (sx + L * Math.cos(r1)).toFixed(1) + ',' + (sy + L * Math.sin(r1)).toFixed(1)
      + ' ' + (sx + L * Math.cos(r2)).toFixed(1) + ',' + (sy + L * Math.sin(r2)).toFixed(1)
      + '" fill="' + fill + '" opacity="' + op.toFixed(3) + '"/>';
  }
  // god-rays:返回 {defs(径向渐变), body(光束组+SMIL)}。非光感 mood → {'',''}(字节不变)。纯函数 + 种子 PRNG。
  // 亮度自适应(Sonnet run2 实测亮底冲白;调研:体积光=**对比度现象**——GPU Gems 3 / crepuscular rays,
  // 加性/screen 混合在亮背景无头部空间必 washout,业界标准缓解=按背景亮度缩放强度):
  // k 随底色 luminance 反向缩放(暗底全强 k=1、亮底收敛至 0.30),作用于径向渐变 stop 与每束 opacity;
  // 组 opacity="0.92" 不变(O4 静止态可见)。几何/色按家族 fam 取(village+sacred → town 巷口天光)。
  function godRays(fam, region, mood, bg) {
    if (!mood || !LIGHT_MOODS[mood]) return { defs: '', body: '' };
    var cfg = RAY_CFG[fam] || RAY_CFG_DEF;
    var u = hexUnit(bg || '#777777'), lum = 0.2126 * u[0] + 0.7152 * u[1] + 0.0722 * u[2];
    var k = Math.max(0.30, Math.min(1, 1.18 - 1.15 * lum));
    var rng = mulberry32(hashStr((region || '') + '|' + mood + '|rays'));
    var sx = cfg.sx * W, sy = cfg.sy * H, L = 1.6 * H;
    var baseAng = cfg.ang + (rng() - 0.5) * 8, spread = cfg.spread + (rng() - 0.5) * 6;
    var n = 4 + Math.floor(rng() * 4);                              // 4..7 条光束
    var gid = 'gr_' + (fam || 'u' + (hashStr(String(region || '')) % 100000));   // id 安全:未知词(可含空格/CJK)用哈希后缀
    var defs = '<radialGradient id="' + gid + '" cx="' + (sx / W).toFixed(3) + '" cy="' + (sy / H).toFixed(3) + '" r="0.95" gradientUnits="objectBoundingBox">'
      + '<stop offset="0" stop-color="' + cfg.color + '" stop-opacity="' + (0.9 * k).toFixed(3) + '"/>'
      + '<stop offset="0.4" stop-color="' + cfg.color + '" stop-opacity="' + (0.45 * k).toFixed(3) + '"/>'
      + '<stop offset="1" stop-color="' + cfg.color + '" stop-opacity="0"/></radialGradient>';
    var beams = '';
    for (var i = 0; i < n; i++) {
      var t = n > 1 ? i / (n - 1) : 0.5;
      var center = baseAng - spread + 2 * spread * t + (rng() - 0.5) * 4;   // 该束中心角
      var halfW = 1.6 + rng() * 3.2, op = (0.14 + rng() * 0.22) * k;        // 该束半宽(细长)/ 基础不透明 × 亮度因子
      beams += beam(sx, sy, center - halfW, center + halfW, L, 'url(#' + gid + ')', op);
    }
    var swing = 1.4 + rng() * 1.2, sdur = 7 + rng() * 4, odur = 5 + rng() * 3;
    var body = '<g style="mix-blend-mode:screen" opacity="0.92">'
      + '<animateTransform attributeName="transform" attributeType="XML" type="rotate" values="'
      +   (-swing).toFixed(2) + ' ' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ';'
      +   swing.toFixed(2) + ' ' + sx.toFixed(1) + ' ' + sy.toFixed(1) + ';'
      +   (-swing).toFixed(2) + ' ' + sx.toFixed(1) + ' ' + sy.toFixed(1) + '" '
      +   'dur="' + sdur.toFixed(1) + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>'
      + '<animate attributeName="opacity" values="0.7;1;0.7" dur="' + odur.toFixed(1) + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>'
      + beams + '</g>';
    return { defs: defs, body: body };
  }

  // ── 表现力升级(调研:雨雪天气粒子;路线图 #2)─────────────────────────────────────
  // 天气 mood(rain/drizzle/storm / snow/flurry/blizzard)→ 前景粒子层(SMIL 动态、种子 PRNG、零依赖)。
  // 雨=斜细 line 快落(animateTransform translate 斜向);雪=小 circle 慢飘 + 左右摇摆(双 additive translate=蜿蜒);storm 含雷闪全屏脉冲。
  // staggered begin 负相位 → 一开始铺满无"齐发";停止态粒子(line/circle)仍在画面(probe/单帧可见)。
  // **mood-gated 新天气词**(不在 MOOD_TINT/FOG_TINT/LIGHT_MOODS → 既有场景字节不变);用 line/circle/rect(rgba 色不写字面 #000)。
  var WEATHER = {
    rain:     { kind: 'rain', n: 34, speed: [0.5, 0.8],  len: [10, 18], tilt: 7,  color: 'rgba(174,194,214,0.55)', wid: 1.1 },
    drizzle:  { kind: 'rain', n: 20, speed: [0.7, 1.1],  len: [6, 11],  tilt: 5,  color: 'rgba(180,198,214,0.42)', wid: 0.9 },
    storm:    { kind: 'rain', n: 60, speed: [0.32, 0.5], len: [16, 30], tilt: 13, color: 'rgba(190,205,222,0.62)', wid: 1.4, lightning: true },
    snow:     { kind: 'snow', n: 30, speed: [4.5, 8],    rad: [1.2, 2.8], color: 'rgba(245,248,252,0.92)' },
    flurry:   { kind: 'snow', n: 16, speed: [5, 9],      rad: [1, 2.2],   color: 'rgba(244,247,252,0.8)' },
    blizzard: { kind: 'snow', n: 64, speed: [2.4, 4.5],  rad: [1.4, 3.4], color: 'rgba(248,250,255,0.96)', wind: 26 },
    // 表现力升级:服务新 region 的特色天气粒子(火山落灰/飞烬/沙暴/落叶/地面雾带;mood 开放词,沿 rain/snow 同模式;
    //   **统一用 speed:[min,max] 时长键 = 根除 NaN 命名接缝**;方向/语义差异靠 layer 函数实现,不靠键名)
    ash:       { kind: 'ash',   n: 42, speed: [8, 16],   rad: [0.6, 1.6], sway: [3, 7], swayDur: [5, 9], windDx: 6, colors: ['rgba(150,140,132,0.55)', 'rgba(120,112,108,0.42)', 'rgba(168,156,146,0.6)'] },   // 火山落灰:慢沉降+蜿蜒(circle 不旋转——圆旋转无视觉、绕原点 rotate 反甩出大弧)
    ember:     { kind: 'ember', n: 22, speed: [3, 7],    rad: [0.5, 1.4], sway: [6, 14], swayDur: [1.0, 2.2], flick: [0.4, 1.2], riseDx: 8, colors: ['rgba(255,150,40,0.9)', 'rgba(255,90,20,0.55)'] },   // 飞烬:反向上升+湍流横摆+明灭闪烁
    sandstorm: { kind: 'sand',  n: 60, speed: [0.4, 1.0], len: [14, 30], dy: [2, 8], wid: [0.8, 1.4], color: 'rgba(195,165,108,0.5)', fine: 'rgba(178,150,98,0.4)' },   // 沙暴:近水平快扫(line+细 circle 三 y 带)
    leaves:    { kind: 'leaf',  n: 20, speed: [4, 9],    drift: [18, 46], rot: [180, 400], sway: [10, 24], swayDur: [2.4, 4.4], palette: ['rgba(190,110,40,0.85)', 'rgba(160,70,30,0.8)', 'rgba(150,130,50,0.8)', 'rgba(110,120,60,0.75)'] },   // 落叶:慢落+翻转/摆动(path 绕本地原点真翻转)
    groundfog: { kind: 'groundfog', bands: 4, yBase: [0.62, 0.92], speed: [12, 24], drift: [10, 30], rh: [10, 22], breath: [0.18, 0.32], colors: ['rgba(210,216,222,0.26)', 'rgba(200,210,215,0.22)', 'rgba(206,214,220,0.30)'] }   // 地面雾带:贴地横向极缓漂(path 丘形带,不用 rect)
  };
  // 别名(同 cfg 引用,沿 drizzle/flurry 模式;**雾词收敛**:groundfog 不设别名 = 避免与 FOG_TINT 全屏雾 fog/mist/haze 混淆)
  WEATHER.ashfall = WEATHER.volcanicash = WEATHER.ash;
  WEATHER.embers = WEATHER.cinders = WEATHER.ember;
  WEATHER.sandblast = WEATHER.dustsquall = WEATHER.sandstorm;
  WEATHER.leaffall = WEATHER.fallingleaves = WEATHER.leaves;
  function rainLayer(rng, cfg) {                                          // 斜雨线群:每滴 line + translate 斜落,begin 负相位错开
    var s = '<g class="amatlas-weather-rain">', tilt = cfg.tilt, i;
    for (i = 0; i < cfg.n; i++) {
      var x = rng() * (W + 40) - 20, len = cfg.len[0] + rng() * (cfg.len[1] - cfg.len[0]);
      var dur = cfg.speed[0] + rng() * (cfg.speed[1] - cfg.speed[0]), begin = -rng() * dur, op = 0.5 + rng() * 0.5;
      s += '<line x1="' + x.toFixed(1) + '" y1="0" x2="' + (x + tilt).toFixed(1) + '" y2="' + len.toFixed(1) + '" stroke="' + cfg.color + '" stroke-width="' + cfg.wid + '" stroke-linecap="round" opacity="' + op.toFixed(2) + '">'
        + '<animateTransform attributeName="transform" type="translate" additive="sum" from="' + (-tilt * 1.4).toFixed(1) + ',' + (-len - 6).toFixed(1) + '" to="' + (tilt * ((H + len + 12) / len)).toFixed(1) + ',' + (H + 12).toFixed(1) + '" dur="' + dur.toFixed(2) + 's" begin="' + begin.toFixed(2) + 's" repeatCount="indefinite"/>'
        + '</line>';
    }
    return s + '</g>';
  }
  function snowLayer(rng, cfg) {                                          // 雪花群:circle 慢落(+暴雪斜风)+ 横向摇摆(双 translate additive=蜿蜒飘)
    var s = '<g class="amatlas-weather-snow">', wind = cfg.wind || 0, i;
    for (i = 0; i < cfg.n; i++) {
      var x = rng() * W, r = cfg.rad[0] + rng() * (cfg.rad[1] - cfg.rad[0]);
      var fall = cfg.speed[0] + rng() * (cfg.speed[1] - cfg.speed[0]), beginF = -rng() * fall;
      var sway = 5 + rng() * 9, swayDur = 1.8 + rng() * 2.2, beginS = -rng() * swayDur, op = 0.65 + rng() * 0.35;
      s += '<circle cx="' + x.toFixed(1) + '" cy="0" r="' + r.toFixed(1) + '" fill="' + cfg.color + '" opacity="' + op.toFixed(2) + '">'
        + '<animateTransform attributeName="transform" type="translate" additive="sum" from="0,-' + (r + 4).toFixed(1) + '" to="' + wind + ',' + (H + r + 6).toFixed(1) + '" dur="' + fall.toFixed(2) + 's" begin="' + beginF.toFixed(2) + 's" repeatCount="indefinite"/>'
        + '<animateTransform attributeName="transform" type="translate" additive="sum" values="' + (-sway).toFixed(1) + ',0;' + sway.toFixed(1) + ',0;' + (-sway).toFixed(1) + ',0" dur="' + swayDur.toFixed(2) + 's" begin="' + beginS.toFixed(2) + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>'
        + '</circle>';
    }
    return s + '</g>';
  }
  // 分叉闪电几何:种子【中点位移】生成竖向折线(顶→中下,5 层二分、中点水平偏移、disp 每层半减)+ 1-2 条更短分支。
  //   纯几何 + seeded rng(坐标 .toFixed(1) 量化保确定性);midpoints(:水平地形)不复用——闪电是竖向主偏 x。返回 path d 串(主干 + 分支多段 M)。
  function boltPath(rng) {
    var x0 = W * (0.3 + rng() * 0.4), y0 = 2;                           // 顶部起点
    var x1 = x0 + (rng() - 0.5) * 60, y1 = H * (0.55 + rng() * 0.3);    // 中下目标
    var pts = [[x0, y0], [x1, y1]], disp = 38, lvl, i, np, a, b;
    for (lvl = 0; lvl < 5; lvl++) {                                     // 5 层细分 → 33 点折线
      np = [];
      for (i = 0; i < pts.length - 1; i++) {
        a = pts[i]; b = pts[i + 1];
        np.push(a, [(a[0] + b[0]) / 2 + (rng() - 0.5) * disp, (a[1] + b[1]) / 2]);
      }
      np.push(pts[pts.length - 1]); pts = np; disp *= 0.5;
    }
    function poly(arr) {
      var d = 'M' + arr[0][0].toFixed(1) + ',' + arr[0][1].toFixed(1), k;
      for (k = 1; k < arr.length; k++) d += ' L' + arr[k][0].toFixed(1) + ',' + arr[k][1].toFixed(1);
      return d;
    }
    var d = poly(pts), nbr = 1 + ((rng() * 2) | 0), bI, base, bx, by;
    for (bI = 0; bI < nbr; bI++) {                                      // 1-2 条斜分支(从主干随机点插出、更短)
      base = pts[2 + ((rng() * (pts.length - 4)) | 0)];
      bx = base[0] + (rng() - 0.5) * 70; by = base[1] + 18 + rng() * 38;
      d += ' ' + poly([base, [(base[0] + bx) / 2 + (rng() - 0.5) * 20, (base[1] + by) / 2], [bx, by]]);
    }
    return d;
  }
  function lightningLayer(rng, cfg) {                                   // 雷闪(storm):全屏补光 rect(保留 #eaf0ff 不降档,P3/P7 不动)+ 分叉 bolt 双层描边
    var period = 7 + rng() * 5, delay = rng() * period;                 // period/delay 先算(与旧版同 rng 序)→ 全屏 rect 字节不变
    var flash = '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#eaf0ff" opacity="0"><animate attributeName="opacity" values="0;0;0.72;0.12;0.5;0;0" keyTimes="0;0.90;0.915;0.925;0.94;0.96;1" dur="' + period.toFixed(2) + 's" begin="' + delay.toFixed(2) + 's" repeatCount="indefinite"/></rect>';
    var d = boltPath(rng);                                              // bolt 几何在 period/delay 之后消费 rng(不扰全屏 rect)
    // 双层描边:外辉蓝紫(粗淡,自带 stroke 不走 #aglow→不改 needGlow/破 P7)+ 内芯白蓝(细亮);同 d。
    // 主闪(0.915-0.94 与全屏 rect 同步)+ 1 次微回闪(0.978);group base opacity=0 → reduced-motion/stripSmil 落"无闪"=防闪光癫痫(雷闪是瞬态非常驻氛围,与常驻粒子的"停止态可见"取舍不同,有意如此)。
    var boltAnim = '<animate attributeName="opacity" values="0;0;1;0.45;0.9;0;0;0.4;0;0" keyTimes="0;0.905;0.915;0.925;0.94;0.955;0.972;0.978;0.985;1" dur="' + period.toFixed(2) + 's" begin="' + delay.toFixed(2) + 's" repeatCount="indefinite"/>';
    var bolt = '<g class="amatlas-weather-bolt" opacity="0">'
      + '<path d="' + d + '" fill="none" stroke="rgba(150,170,255,0.55)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<path d="' + d + '" fill="none" stroke="rgba(235,245,255,0.95)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>'
      + boltAnim + '</g>';
    return flash + bolt;
  }
  // ── 表现力升级:新增天气粒子层(火山落灰/飞烬/沙暴/落叶/地面雾带)──────────────────────────────
  //   全部沿 rainLayer/snowLayer 范式:入参 (rng,cfg);<g class="amatlas-weather-X">…;mulberry32 seed;begin 负相位铺满;
  //   元素属性写非零 opacity(stripSmil/reduced-motion/probe 单帧仍可见);rgba 色绝不写字面 #000;坐标 .toFixed(1)、dur/begin .toFixed(2);
  //   只用 circle/line/path(不增 rect/ellipse → 护 I1/计数断言)。SMIL animateTransform/animate(非 @keyframes,保 H7)。
  function ashLayer(rng, cfg) {                                          // 火山落灰:circle 慢沉降(主 translate)+ 蜿蜒(additive translate);三档灰轮选(不旋转——圆旋转无视觉)
    var s = '<g class="amatlas-weather-ash">', cols = cfg.colors, nc = cols.length, i;
    for (i = 0; i < cfg.n; i++) {
      var x = rng() * W, r = cfg.rad[0] + rng() * (cfg.rad[1] - cfg.rad[0]);
      var dur = cfg.speed[0] + rng() * (cfg.speed[1] - cfg.speed[0]), begin = -rng() * dur;
      var sway = cfg.sway[0] + rng() * (cfg.sway[1] - cfg.sway[0]), swayDur = cfg.swayDur[0] + rng() * (cfg.swayDur[1] - cfg.swayDur[0]), beginS = -rng() * swayDur;
      var col = cols[(rng() * nc) | 0], op = (0.4 + rng() * 0.4).toFixed(2);
      s += '<circle cx="' + x.toFixed(1) + '" cy="0" r="' + r.toFixed(1) + '" fill="' + col + '" opacity="' + op + '">'
        + '<animateTransform attributeName="transform" type="translate" additive="sum" from="0,' + (-r - 4).toFixed(1) + '" to="' + cfg.windDx.toFixed(1) + ',' + (H + r + 6).toFixed(1) + '" dur="' + dur.toFixed(2) + 's" begin="' + begin.toFixed(2) + 's" repeatCount="indefinite"/>'
        + '<animateTransform attributeName="transform" type="translate" additive="sum" values="' + (-sway).toFixed(1) + ',0;' + sway.toFixed(1) + ',0;' + (-sway).toFixed(1) + ',0" dur="' + swayDur.toFixed(2) + 's" begin="' + beginS.toFixed(2) + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>'
        + '</circle>';
    }
    return s + '</g>';
  }
  function emberLayer(rng, cfg) {                                        // 飞烬:circle 反向上升(主 translate 向上)+ 湍流横摆(additive translate)+ 明灭(animate opacity,首末非零=停止态可见)
    var s = '<g class="amatlas-weather-ember">', cols = cfg.colors, nc = cols.length, i;
    for (i = 0; i < cfg.n; i++) {
      var x = rng() * W, r = cfg.rad[0] + rng() * (cfg.rad[1] - cfg.rad[0]);
      var dur = cfg.speed[0] + rng() * (cfg.speed[1] - cfg.speed[0]), begin = -rng() * dur;
      var sway = cfg.sway[0] + rng() * (cfg.sway[1] - cfg.sway[0]), swayDur = cfg.swayDur[0] + rng() * (cfg.swayDur[1] - cfg.swayDur[0]), beginS = -rng() * swayDur;
      var flick = cfg.flick[0] + rng() * (cfg.flick[1] - cfg.flick[0]), beginF = -rng() * flick;
      var col = cols[(rng() * nc) | 0], op = (0.55 + rng() * 0.35).toFixed(2);
      s += '<circle cx="' + x.toFixed(1) + '" cy="0" r="' + r.toFixed(1) + '" fill="' + col + '" opacity="' + op + '">'
        + '<animateTransform attributeName="transform" type="translate" additive="sum" from="0,' + (H + r + 6).toFixed(1) + '" to="' + cfg.riseDx.toFixed(1) + ',' + (-r - 10).toFixed(1) + '" dur="' + dur.toFixed(2) + 's" begin="' + begin.toFixed(2) + 's" repeatCount="indefinite"/>'
        + '<animateTransform attributeName="transform" type="translate" additive="sum" values="' + (-sway).toFixed(1) + ',0;' + (sway * 0.6).toFixed(1) + ',0;' + (-sway * 0.8).toFixed(1) + ',0;' + sway.toFixed(1) + ',0;' + (-sway).toFixed(1) + ',0" dur="' + swayDur.toFixed(2) + 's" begin="' + beginS.toFixed(2) + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.25;0.5;0.75;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1;0.42 0 0.58 1"/>'
        + '<animate attributeName="opacity" values="' + op + ';1;0.35;0.85;0.25;' + op + '" dur="' + flick.toFixed(2) + 's" begin="' + beginF.toFixed(2) + 's" repeatCount="indefinite"/>'
        + '</circle>';
    }
    return s + '</g>';
  }
  function sandLayer(rng, cfg) {                                         // 沙暴:近水平快扫;每粒按 seed 落 3 y 带之一(上=细 circle 悬尘更淡 / 中下=短 line 拉丝);主横扫 + 跃移 additive
    var s = '<g class="amatlas-weather-sand">', i;
    for (i = 0; i < cfg.n; i++) {
      var band = (rng() * 3) | 0;
      var y = (band === 0 ? 0.30 : band === 1 ? 0.55 : 0.78) * H + (rng() - 0.5) * 18;
      var len = cfg.len[0] + rng() * (cfg.len[1] - cfg.len[0]);
      var dur = cfg.speed[0] + rng() * (cfg.speed[1] - cfg.speed[0]), begin = -rng() * dur;
      var dy = (cfg.dy[0] + rng() * (cfg.dy[1] - cfg.dy[0])) * (rng() < 0.5 ? -1 : 1);
      var dyb = 2 + rng() * 4, jDur = 0.5 + rng() * 0.6, beginJ = -rng() * jDur;
      var op = (0.4 + rng() * 0.4).toFixed(2);
      var anim = '<animateTransform attributeName="transform" type="translate" additive="sum" from="' + (-len - 20).toFixed(1) + ',0" to="' + (W + len + 20).toFixed(1) + ',' + dy.toFixed(1) + '" dur="' + dur.toFixed(2) + 's" begin="' + begin.toFixed(2) + 's" repeatCount="indefinite"/>'
        + '<animateTransform attributeName="transform" type="translate" additive="sum" values="0,' + (-dyb).toFixed(1) + ';0,' + dyb.toFixed(1) + ';0,' + (-dyb).toFixed(1) + '" dur="' + jDur.toFixed(2) + 's" begin="' + beginJ.toFixed(2) + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>';
      if (band === 0) {
        var rr = (0.5 + rng() * 0.8).toFixed(1);
        s += '<circle cx="0" cy="' + y.toFixed(1) + '" r="' + rr + '" fill="' + cfg.fine + '" opacity="' + op + '">' + anim + '</circle>';
      } else {
        var wid = (cfg.wid[0] + rng() * (cfg.wid[1] - cfg.wid[0])).toFixed(2);
        s += '<line x1="0" y1="' + y.toFixed(1) + '" x2="' + len.toFixed(1) + '" y2="' + (y + 1).toFixed(1) + '" stroke="' + cfg.color + '" stroke-width="' + wid + '" stroke-linecap="round" opacity="' + op + '">' + anim + '</line>';
      }
    }
    return s + '</g>';
  }
  function leafLayer(rng, cfg) {                                         // 落叶:小叶 path(绕本地原点画 → rotate=真翻转);慢落+横漂 + 大幅蜿蜒 + 翻转(tumble 整周 / flutter 摆动,seed 定)
    var s = '<g class="amatlas-weather-leaf">', pal = cfg.palette, np = pal.length, i;
    for (i = 0; i < cfg.n; i++) {
      var x = rng() * W, sz = 2.4 + rng() * 2.6;
      var dur = cfg.speed[0] + rng() * (cfg.speed[1] - cfg.speed[0]), begin = -rng() * dur;
      var drift = (cfg.drift[0] + rng() * (cfg.drift[1] - cfg.drift[0])) * (rng() < 0.5 ? -1 : 1);
      var sway = cfg.sway[0] + rng() * (cfg.sway[1] - cfg.sway[0]), swayDur = cfg.swayDur[0] + rng() * (cfg.swayDur[1] - cfg.swayDur[0]), beginS = -rng() * swayDur;
      var rotDur = swayDur * (0.8 + rng() * 0.8), beginR = -rng() * rotDur, tumble = rng() < 0.6;
      var col = pal[(rng() * np) | 0], op = (0.7 + rng() * 0.25).toFixed(2);
      var a = sz.toFixed(1), na = (-sz).toFixed(1), h = (sz * 0.62).toFixed(1), nh = (-sz * 0.62).toFixed(1);
      var d = 'M0,' + na + ' Q' + h + ',0 0,' + a + ' Q' + nh + ',0 0,' + na + ' Z';
      var rotVals = tumble ? '0;360' : '-34;34;-34';
      s += '<path d="' + d + '" fill="' + col + '" opacity="' + op + '">'
        + '<animateTransform attributeName="transform" type="translate" additive="sum" from="' + x.toFixed(1) + ',' + (-sz - 4).toFixed(1) + '" to="' + (x + drift).toFixed(1) + ',' + (H + sz + 6).toFixed(1) + '" dur="' + dur.toFixed(2) + 's" begin="' + begin.toFixed(2) + 's" repeatCount="indefinite"/>'
        + '<animateTransform attributeName="transform" type="translate" additive="sum" values="' + (-sway).toFixed(1) + ',0;' + sway.toFixed(1) + ',0;' + (-sway).toFixed(1) + ',0" dur="' + swayDur.toFixed(2) + 's" begin="' + beginS.toFixed(2) + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>'
        + '<animateTransform attributeName="transform" type="rotate" additive="sum" values="' + rotVals + '" dur="' + rotDur.toFixed(2) + 's" begin="' + beginR.toFixed(2) + 's" repeatCount="indefinite"/>'
        + '</path>';
    }
    return s + '</g>';
  }
  function groundfogLayer(rng, cfg) {                                    // 地面雾带:bands 条宽扁丘形 path(贴下缘,不用 rect 护计数)极缓横向往返 + 微呼吸;低透明冷灰白
    var s = '<g class="amatlas-weather-groundfog">', cols = cfg.colors, nc = cols.length, b;
    for (b = 0; b < cfg.bands; b++) {
      var yc = (cfg.yBase[0] + (cfg.yBase[1] - cfg.yBase[0]) * (cfg.bands > 1 ? b / (cfg.bands - 1) : 0.5)) * H;
      var rh = cfg.rh[0] + rng() * (cfg.rh[1] - cfg.rh[0]);
      var dur = cfg.speed[0] + rng() * (cfg.speed[1] - cfg.speed[0]), begin = -rng() * dur;
      var drift = cfg.drift[0] + rng() * (cfg.drift[1] - cfg.drift[0]);
      var col = cols[b % nc], opN = cfg.breath[0] + rng() * (cfg.breath[1] - cfg.breath[0]), op = opN.toFixed(2);
      var breathDur = (dur * 0.7).toFixed(2), beginB = -rng() * dur;
      var w2 = W + 80, x0 = -40;
      var c1x = (x0 + w2 * 0.3).toFixed(1), c2x = (x0 + w2 * 0.7).toFixed(1);
      var topY = (yc - rh).toFixed(1), botY = (yc + rh * 0.5).toFixed(1);
      var d = 'M' + x0.toFixed(1) + ',' + yc.toFixed(1) + ' Q' + c1x + ',' + topY + ' ' + (x0 + w2 * 0.5).toFixed(1) + ',' + (yc - rh * 0.6).toFixed(1) + ' Q' + c2x + ',' + topY + ' ' + (x0 + w2).toFixed(1) + ',' + yc.toFixed(1) + ' L' + (x0 + w2).toFixed(1) + ',' + botY + ' L' + x0.toFixed(1) + ',' + botY + ' Z';
      s += '<path d="' + d + '" fill="' + col + '" opacity="' + op + '">'
        + '<animateTransform attributeName="transform" type="translate" additive="sum" values="' + (-drift).toFixed(1) + ',0;' + drift.toFixed(1) + ',0;' + (-drift).toFixed(1) + ',0" dur="' + dur.toFixed(2) + 's" begin="' + begin.toFixed(2) + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>'
        + '<animate attributeName="opacity" values="' + op + ';' + (opN * 1.4).toFixed(2) + ';' + op + '" dur="' + breathDur + 's" begin="' + beginB.toFixed(2) + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>'
        + '</path>';
    }
    return s + '</g>';
  }
  // 天气层:mood → 粒子层(seed 从 region+mood)。非天气 mood → ''(字节不变)。
  function buildWeather(region, mood) {
    var cfg = WEATHER[mood];
    if (!cfg) return '';
    var rng = mulberry32(hashStr((region || '') + '|' + mood + '|w'));
    switch (cfg.kind) {
      case 'rain': var out = rainLayer(rng, cfg); if (cfg.lightning) out += lightningLayer(rng, cfg); return out;
      case 'snow': return snowLayer(rng, cfg);
      case 'ash': return ashLayer(rng, cfg);
      case 'ember': return emberLayer(rng, cfg);
      case 'sand': return sandLayer(rng, cfg);
      case 'leaf': return leafLayer(rng, cfg);
      case 'groundfog': return groundfogLayer(rng, cfg);
      default: return '';
    }
  }
  // 背景天气层(纵深·§10 克制:仅密集的 ash/sand 双层;ember/leaf/groundfog 稀疏→单层不必)。
  //   远层=派生 cfg(更小/更慢/更密但封顶 64/整体更淡)+ **独立 |w-far seed**(区别前景 |w,避免两层同相重合)+ class 加 -far 后缀。
  //   注入在剪影之前(z 序更靠里);其余 mood/kind → ''(字节不变)。
  function buildWeatherBack(region, mood) {
    var cfg = WEATHER[mood];
    if (!cfg || (cfg.kind !== 'ash' && cfg.kind !== 'sand')) return '';
    var rng = mulberry32(hashStr((region || '') + '|' + mood + '|w-far')), far, layer;
    if (cfg.kind === 'ash') {
      far = { kind: 'ash', n: Math.min(64, Math.round(cfg.n * 1.2)), speed: [cfg.speed[0] * 1.5, cfg.speed[1] * 1.6], rad: [cfg.rad[0] * 0.5, cfg.rad[1] * 0.6], sway: [cfg.sway[0] * 0.6, cfg.sway[1] * 0.7], swayDur: [cfg.swayDur[0] * 1.2, cfg.swayDur[1] * 1.3], windDx: cfg.windDx * 0.6, colors: cfg.colors };
      layer = ashLayer(rng, far);
    } else {
      far = { kind: 'sand', n: Math.min(64, Math.round(cfg.n * 1.0)), speed: [cfg.speed[0] * 1.4, cfg.speed[1] * 1.5], len: [cfg.len[0] * 0.6, cfg.len[1] * 0.7], dy: cfg.dy, wid: [cfg.wid[0] * 0.7, cfg.wid[1] * 0.8], color: cfg.color, fine: cfg.fine };
      layer = sandLayer(rng, far);
    }
    layer = layer.replace('class="amatlas-weather-' + cfg.kind + '"', 'class="amatlas-weather-' + cfg.kind + '-far"');   // 远层 class 加 -far(测试/换皮钩;唯一 class 占位 → 单次 replace 命中)
    return '<g opacity="0.55">' + layer + '</g>';                       // 远层整体更淡 = 大气透视纵深
  }

  // ── 视觉路线图收尾 #1:feColorMatrix 整场电影调色(mood-gated;原型 _preview-colormatrix.html)──────
  // 缘起(docs/expressiveness-upgrade.md 路线图):色相分级(gradeSVG)只重映射天空/剪影 hex,缺"整场定调"
  //   的电影滤镜——回忆 sepia / 异界色相流转 / 濒死去色 / 毒雾绿移 / 魔法紫移。做法=把全部内容层包进一层
  //   <g filter="url(#agrade)">,filter 内用 <feColorMatrix> 对**渲染结果**(含天空渐变/剪影/图元/雾/光)统一
  //   调色 → 一次性给整场定调。letterbox 黑边留在 <g> 外(不被调色,保 I1 纯黑)。
  // **mood-gated 开放词**(仿 FOG_TINT:每类给数个语义近义 mood;未列 → 不调色 null = 向后兼容字节不变)。
  //   这些 mood 全不在 MOOD_TINT/FOG_TINT/LIGHT_MOODS/WEATHER → 既有场景字节安全;与 MOOD_TINT 正交(可叠)。
  // 确定性:配方固定;hueRotate 用 SMIL <animate> 让色相缓慢流转(异界感),非 CSS @keyframes(保 H7)。
  //   color-interpolation-filters="sRGB" 避免线性空间偏色(原型已验)。停止态=动画首帧调色仍生效(probe 可见)。
  var FILM_GRADE = {
    // 回忆/梦境/闪回:sepia 棕褐矩阵(去饱和 + 发黄)。经典 sepia 矩阵(W3C 推荐值)。
    memory:    { kind: 'matrix', values: '0.393 0.769 0.189 0 0  0.349 0.686 0.168 0 0  0.272 0.534 0.131 0 0  0 0 0 1 0' },
    flashback: { kind: 'matrix', values: '0.393 0.769 0.189 0 0  0.349 0.686 0.168 0 0  0.272 0.534 0.131 0 0  0 0 0 1 0' },
    sepia:     { kind: 'matrix', values: '0.393 0.769 0.189 0 0  0.349 0.686 0.168 0 0  0.272 0.534 0.131 0 0  0 0 0 1 0' },
    // 异世界/精灵/星界:hueRotate 色相偏移 + SMIL 流转(色相缓慢旋转一周)
    otherworld:{ kind: 'hueRotate', deg: 150, animate: true },
    fae:       { kind: 'hueRotate', deg: 90,  animate: true },
    astral:    { kind: 'hueRotate', deg: 200, animate: true },
    // V2 环境色相极缓流转(表现力升级):天色/极光自然色温漂移 —— 非异界整周旋转,而是窄幅 ±15° 极缓往返
    //   (天黄昏渐暖/极光冷绿流动/梦境微醺)。复用 hueRotate + SMIL,新增 sweep:true → filmGradeFilter 走窄幅往返分支。
    //   **新词与 MOOD_TINT/FOG_TINT/LIGHT_MOODS/WEATHER/FILM_GRADE/DISPLACE 六表逐一对照无撞**(dusk≠dawn、dreamlike≠dream/warp)。
    dusk:      { kind: 'hueRotate', deg: 18,  animate: true, sweep: true },   // 黄昏:暖偏移基线,极缓 ±15° 色温漂移
    aurora:    { kind: 'hueRotate', deg: 120, animate: true, sweep: true },   // 极光:冷绿基线,极缓 ±15° 流动
    dreamlike: { kind: 'hueRotate', deg: 60,  animate: true, sweep: true },   // 梦境:中间色偏移,极缓 ±15° 微醺
    // 恐怖/濒死/麻木:去色冷调(saturate 降低 + 蓝移矩阵压暖色)→ 濒死失血感
    dying:     { kind: 'desat-cold', sat: 0.18 },
    shock:     { kind: 'desat-cold', sat: 0.25 },
    numb:      { kind: 'desat-cold', sat: 0.30 },
    // 视觉批1-V2:哀伤同族但克制得多(去色而非濒死"最沉";sat 高于上三者=颜色留得更多,只是"黯淡"非"抽干")
    sad:       { kind: 'desat-cold', sat: 0.42 },
    // 毒雾/魔法:绿移 / 紫移(自定义 4×5 矩阵 → 对应色域 + 强化)
    poison:    { kind: 'tone', values: '0.5 0.9 0.2 0 0  0.2 1.1 0.2 0 0  0.2 0.6 0.4 0 0  0 0 0 1 0' },
    venom:     { kind: 'tone', values: '0.5 0.9 0.2 0 0  0.2 1.1 0.2 0 0  0.2 0.6 0.4 0 0  0 0 0 1 0' },
    toxic:     { kind: 'tone', values: '0.5 0.9 0.2 0 0  0.2 1.1 0.2 0 0  0.2 0.6 0.4 0 0  0 0 0 1 0' },
    magic:     { kind: 'tone', values: '0.9 0.2 0.7 0 0  0.3 0.5 0.6 0 0  0.7 0.2 1.0 0 0  0 0 0 1 0' },
    arcane:    { kind: 'tone', values: '0.9 0.2 0.7 0 0  0.3 0.5 0.6 0 0  0.7 0.2 1.0 0 0  0 0 0 1 0' }
  };
  // 调色滤镜(纯函数,id=agrade)。按配方类型生成对应 feColorMatrix(matrix/hueRotate/desat-cold/tone);
  //   异界 hueRotate 叠 SMIL animate 角度 → 色相缓慢流转(类比 fogFilter 的 animate baseFrequency)。
  function filmGradeFilter(grade) {
    var inner;
    if (grade.kind === 'hueRotate') {
      inner = '<feColorMatrix type="hueRotate" values="' + grade.deg + '">';
      if (grade.animate) {
        if (grade.sweep)   // V2 环境窄幅往返:deg-15 → deg+15 → deg-15(极缓 dur,自然色温漂移;非整周旋转)
          inner += '<animate attributeName="values" values="' + (grade.deg - 15) + ';' + (grade.deg + 15) + ';' + (grade.deg - 15) + '" dur="36s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>';
        else               // 异界整周流转(otherworld/fae/astral 现状字节不变)
          inner += '<animate attributeName="values" values="' + grade.deg + ';' + (grade.deg + 360) + '" dur="18s" repeatCount="indefinite"/>';
      }
      inner += '</feColorMatrix>';
    } else if (grade.kind === 'desat-cold') {                                   // 先 saturate 降饱和,再叠冷调矩阵(轻压红、抬蓝)→ 濒死/恐怖
      inner = '<feColorMatrix type="saturate" values="' + grade.sat + '" result="d"/>'
            + '<feColorMatrix in="d" type="matrix" values="0.9 0 0 0 0  0 0.95 0 0 0  0 0 1.15 0 0.02  0 0 0 1 0"/>';
    } else {                                                                     // matrix(sepia)/ tone(毒绿/魔法紫)= 直接自定义 4×5 矩阵
      inner = '<feColorMatrix type="matrix" values="' + grade.values + '"/>';
    }
    return '<filter id="agrade" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' + inner + '</filter>';
  }

  // ── 视觉路线图收尾 #2:feDisplacementMap 画面扭曲(mood-gated;调研 MDN/Codrops/Smashing/Red Stapler)──
  // 缘起:有了调色,仍缺"画面被介质扰动"的物理感——热浪/水下/梦境/海市蜃楼。做法(调研标准范式):
  //   <feTurbulence> 生成 Perlin 噪声 → <feDisplacementMap in="SourceGraphic" in2="噪声" scale=N> 按噪声
  //   逐像素位移渲染结果 → SMIL <animate baseFrequency>(+seed)让扭曲缓慢流动(像隔着热气/水波看场景)。
  //   公式 P'(x,y)=P(x+scale·(R-0.5), y+scale·(G-0.5));scale 控强度(调研:别过大糊到看不清→克制 4-12)。
  // **mood-gated 新词**(全不在 MOOD_TINT/FOG_TINT/LIGHT_MOODS/WEATHER/FILM_GRADE → 字节安全;heat/underwater/
  //   mirage/warp/ripple/shimmer)。**有意避开 haze(已属 FOG_TINT)与 dream(可留作未来)**——防与既有词撞触发。
  // 配方按物理(调研要点):热浪 fractalNoise 平滑、低频偏竖向扰动(模拟上升热气)、scale 小;水下/海市蜃楼
  //   turbulence 略乱、scale 略大、动得慢。**滤镜区扩边 x=-20% width=140% height=140%** 防位移把边缘裁掉
  //   (调研:位移向外推像素,不扩区会被裁)。确定性:seed 从 region+mood hash;animate 参数固定 → 纯函数可测。
  var DISPLACE = {
    heat:       { type: 'fractalNoise', bf: '0.012 0.05',  bf2: '0.018 0.07',  scale: 6,  oct: 2, dur: 5 },   // 热浪:竖向偏强、平滑、动快、位移小
    shimmer:    { type: 'fractalNoise', bf: '0.014 0.05',  bf2: '0.02 0.072',  scale: 5,  oct: 2, dur: 4 },   // 微颤(同热浪族,更弱更快)
    underwater: { type: 'turbulence',   bf: '0.018 0.028', bf2: '0.026 0.02',  scale: 11, oct: 3, dur: 9 },   // 水下:两向接近、略乱、位移大、动慢
    ripple:     { type: 'turbulence',   bf: '0.02 0.03',   bf2: '0.03 0.022',  scale: 9,  oct: 2, dur: 8 },   // 水波(同水下族,略弱)
    mirage:     { type: 'turbulence',   bf: '0.01 0.04',   bf2: '0.016 0.055', scale: 8,  oct: 2, dur: 7 },   // 海市蜃楼:偏竖向、中等位移、中速
    warp:       { type: 'turbulence',   bf: '0.022 0.022', bf2: '0.03 0.016',  scale: 13, oct: 3, dur: 10 }   // 梦境/空间扭曲:各向同性、最大位移、最慢
  };
  // 扭曲滤镜(纯函数,id=adisp)。feTurbulence 噪声 + animate baseFrequency(SMIL 流动)→ feDisplacementMap
  //   位移 SourceGraphic(整组渲染结果)。扩边防裁;xChannelSelector=R/yChannelSelector=G(调研标准 2D 位移)。
  function displaceFilter(cfg, seed) {
    return '<filter id="adisp" x="-20%" y="-20%" width="140%" height="140%">'
      + '<feTurbulence type="' + cfg.type + '" baseFrequency="' + cfg.bf + '" numOctaves="' + cfg.oct + '" seed="' + seed + '" stitchTiles="stitch" result="dn">'
      + '<animate attributeName="baseFrequency" values="' + cfg.bf + ';' + cfg.bf2 + ';' + cfg.bf + '" dur="' + cfg.dur + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>'
      + '</feTurbulence>'
      + '<feDisplacementMap in="SourceGraphic" in2="dn" scale="' + cfg.scale + '" xChannelSelector="R" yChannelSelector="G"/>'
      + '</filter>';
  }

  // ── scene 物件具体化(契约 v9):element.art = Preset 名 | art-spec DSL ─────────────────────
  // 缘起(用户洞察):背景层(剪影/氛围/光/天气/调色/扭曲)已很丰富,但**主体物件**仍是抽象 glyph
  //   (character→圆 / item→方),"一艘船=圆"→ 割裂。方向(approach A)=可组合 art + 图标锚:
  //   ① **预设图标(anchor,意图非素材)**:作者写 art:'ship' → 引擎画(few-shot 可靠锚);
  //   ② **art-spec(Spec,焦点物件的创作内容/escape hatch)**:强 AI 给受限图元画自定义物件——
  //      "约束形式(DSL schema)放开内容(画什么)",守 §11。仅用于**焦点物件**(背景仍呈现器驱动)。
  //   与 audio.ambient/audio.music 的 Preset|Spec 二元一致。fallback:无 art/未知预设名 → 现有 glyph。
  // **坐标系**:art-spec 在**本地居中坐标**(约 ±15 单位,~30px),引擎在 element 循环包
  //   `<g transform="translate(slotX,slotY)">` 放到 scene 槽位(同现有 glyph 槽位)。AI 只管以 (0,0) 画物件。

  // art-spec 受限图元白名单:shape → 必需 attr(数值类)。通用可选:fill/stroke/sw(stroke-width)/op(opacity)。
  var ART_SHAPES = {
    path:    { num: [],                     str: ['d'],      svg: 'path' },     // d 是路径串(限受白名单字符,见 validateArtSpec)
    circle:  { num: ['cx', 'cy', 'r'],      str: [],         svg: 'circle' },
    rect:    { num: ['x', 'y', 'w', 'h'],   str: [],         svg: 'rect' },     // w/h → width/height
    line:    { num: ['x1', 'y1', 'x2', 'y2'], str: [],       svg: 'line' },
    polygon: { num: [],                     str: ['points'], svg: 'polygon' },  // points 是 "x,y x,y…" 串
    ellipse: { num: ['cx', 'cy', 'rx', 'ry'], str: [],       svg: 'ellipse' }
  };
  // 颜色串校验:#hex(3/4/6/8 位)/ rgb()/rgba()/hsl()/hsla()/ 具名色(纯字母,如 gold/steelblue)。
  //   绝不允许 url()/含 < 等(防注入)。'none'/'transparent' 亦放行(常用)。
  var NAMED_COLOR = /^[a-z]+$/i, HEX_COLOR = /^#[0-9a-f]{3,8}$/i, FUNC_COLOR = /^(rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s]+\)$/i;
  function isColorStr(v) {
    if (typeof v !== 'string') return false;
    var s = v.trim();
    if (s === 'none' || s === 'transparent') return true;
    return HEX_COLOR.test(s) || FUNC_COLOR.test(s) || NAMED_COLOR.test(s);
  }
  // path d / polygon points 串:只允许数字、坐标分隔符、路径命令字母(MLHVCSQTAZ + 小写),绝禁 <、(、; 等注入面。
  var GEOM_STR = /^[\sMLHVCSQTAZmlhvcsqtaz0-9.,\-+eE]*$/;
  // 防注入:任何键含 on*(事件)、值含 < / <script / href / url( / javascript: → 拒。仅认白名单 attr,故未知 attr 直接报。
  function assertSafeKey(k, where) {
    if (/^on/i.test(k)) throw new Error(where + ': 禁止事件属性 "' + k + '"(防注入)');
  }
  function assertSafeStr(v, where) {
    var s = String(v);
    if (/[<>]|href|url\s*\(|javascript:|<script/i.test(s)) throw new Error(where + ': 值含非法字符/注入面("' + s.slice(0, 40) + '")');
  }
  // 渲染单个 art-spec 图元(已校验)→ SVG 串。本地坐标(调用方包 translate)。属性顺序固定 → 确定性可测。
  function renderArtPrim(prim, where) {
    var def = ART_SHAPES[prim.shape];
    if (!def) throw new Error(where + ': 未知 shape "' + prim.shape + '"(允许:' + Object.keys(ART_SHAPES).join('/') + ')');
    var attrs = '';
    // 几何 attr(数值)——逐项校验非空且为数;w/h → width/height(SVG 名)。
    for (var i = 0; i < def.num.length; i++) {
      var nk = def.num[i], nv = prim[nk];
      if (typeof nv !== 'number' || !isFinite(nv)) throw new Error(where + ': ' + prim.shape + ' 的 "' + nk + '" 必须是有限数(收到 ' + JSON.stringify(nv) + ')');
      var svgName = nk === 'w' ? 'width' : nk === 'h' ? 'height' : nk;
      attrs += ' ' + svgName + '="' + (+nv.toFixed(2)) + '"';
    }
    // 几何 attr(字符串:d / points)——校验只含安全几何字符。
    for (var j = 0; j < def.str.length; j++) {
      var sk = def.str[j], sv = prim[sk];
      if (typeof sv !== 'string' || !sv) throw new Error(where + ': ' + prim.shape + ' 的 "' + sk + '" 必须是非空字符串');
      if (!GEOM_STR.test(sv)) throw new Error(where + ': ' + prim.shape + ' 的 "' + sk + '" 含非法字符(只允许路径/坐标数字与命令字母,防注入)');
      attrs += ' ' + sk + '="' + sv + '"';
    }
    // 通用可选样式 attr:fill/stroke(颜色串)/ sw→stroke-width(数)/ op→opacity(数)。
    if (prim.fill != null) { if (!isColorStr(prim.fill)) throw new Error(where + ': fill 必须是颜色串(#hex/rgb()/具名色;收到 ' + JSON.stringify(prim.fill) + ')'); attrs += ' fill="' + prim.fill + '"'; }
    if (prim.stroke != null) { if (!isColorStr(prim.stroke)) throw new Error(where + ': stroke 必须是颜色串(收到 ' + JSON.stringify(prim.stroke) + ')'); attrs += ' stroke="' + prim.stroke + '"'; }
    if (prim.sw != null) { if (typeof prim.sw !== 'number' || !isFinite(prim.sw)) throw new Error(where + ': sw(stroke-width)必须是数'); attrs += ' stroke-width="' + (+prim.sw.toFixed(2)) + '"'; }
    if (prim.op != null) { if (typeof prim.op !== 'number' || !isFinite(prim.op)) throw new Error(where + ': op(opacity)必须是数'); attrs += ' opacity="' + (+prim.op.toFixed(3)) + '"'; }
    return '<' + def.svg + attrs + '/>';
  }
  // 渲染一组 art-spec 图元(数组)→ SVG 串(本地坐标)。fail-loud:非数组/空/含非对象/非法图元 → throw。
  function renderArtSpec(spec, where) {
    where = where || 'art-spec';
    if (!Array.isArray(spec)) throw new Error(where + ': art-spec 必须是图元数组');
    if (spec.length === 0) throw new Error(where + ': art-spec 不能为空数组');
    var out = '';
    for (var i = 0; i < spec.length; i++) {
      var prim = spec[i];
      if (prim == null || typeof prim !== 'object' || Array.isArray(prim)) throw new Error(where + '[' + i + ']: 图元必须是对象 {shape,…}');
      for (var k in prim) if (Object.prototype.hasOwnProperty.call(prim, k)) { assertSafeKey(k, where + '[' + i + ']'); if (typeof prim[k] === 'string') assertSafeStr(prim[k], where + '[' + i + '].' + k); }
      out += renderArtPrim(prim, where + '[' + i + ']');
    }
    return out;
  }

  // ── ~12 预设图标锚(引擎 procedural;**本身用上面 DSL 写=dogfood + few-shot 样板**)─────────────
  // 每个 = 一组 DSL 图元(派生色、确定性、~30px 本地居中 ±15)。既是可靠图标,又是教 AI 写 art-spec 的活样板。
  // **绝不写字面 #000**(派生深色用 #2a2a2a/#3a2a1a 等);本地坐标以 (0,0) 为中心。
  var ART_PRESETS = {
    // 船:船身(梯形 polygon)+ 桅杆 + 三角帆 + 水线
    ship: [
      { shape: 'polygon', points: '-13,4 13,4 9,12 -9,12', fill: '#6b4a2b', stroke: '#3a2a1a', sw: 1 },
      { shape: 'line', x1: 0, y1: 4, x2: 0, y2: -14, stroke: '#3a2a1a', sw: 1.5 },
      { shape: 'polygon', points: '1,-13 11,1 1,1', fill: '#e8e0cf', stroke: '#9a8f78', sw: 0.8 },
      { shape: 'polygon', points: '-1,-9 -9,1 -1,1', fill: '#d8cfc0', stroke: '#9a8f78', sw: 0.8 }
    ],
    // 提灯:吊环 + 灯笼框(梯形)+ 暖光芯
    lantern: [
      { shape: 'path', d: 'M -3 -13 A 3 3 0 0 1 3 -13', fill: 'none', stroke: '#7a6a3a', sw: 1.5 },
      { shape: 'polygon', points: '-7,-9 7,-9 9,9 -9,9', fill: '#5a4a22', stroke: '#3a2e15', sw: 1 },
      { shape: 'rect', x: -5, y: -6, w: 10, h: 13, fill: '#ffd96b', stroke: '#caa23a', sw: 0.8 },
      { shape: 'circle', cx: 0, cy: 0, r: 2.4, fill: '#fff4c2' }
    ],
    // 祭坛:台座(rect)+ 台面 + 顶部火盆/凹槽
    altar: [
      { shape: 'rect', x: -12, y: -2, w: 24, h: 13, fill: '#8a8276', stroke: '#4a463e', sw: 1 },
      { shape: 'rect', x: -14, y: -6, w: 28, h: 5, fill: '#a39a8b', stroke: '#4a463e', sw: 1 },
      { shape: 'ellipse', cx: 0, cy: -6, rx: 7, ry: 2.2, fill: '#5a554c', stroke: '#3a362f', sw: 0.8 },
      { shape: 'path', d: 'M 0 -8 q -3 -5 0 -9 q 3 4 0 9 Z', fill: '#ff8c3a', stroke: '#d8641a', sw: 0.6 }
    ],
    // 树:树干 + 三层树冠(圆)
    tree: [
      { shape: 'rect', x: -2.5, y: 2, w: 5, h: 12, fill: '#6b4a2b', stroke: '#3a2a1a', sw: 0.8 },
      { shape: 'circle', cx: 0, cy: -7, r: 9, fill: '#3f7a3a', stroke: '#27521f', sw: 0.8 },
      { shape: 'circle', cx: -6, cy: -1, r: 7, fill: '#4a8a44', stroke: '#27521f', sw: 0.8 },
      { shape: 'circle', cx: 6, cy: -1, r: 7, fill: '#4a8a44', stroke: '#27521f', sw: 0.8 }
    ],
    // 钥匙:环(圆)+ 柄 + 齿
    key: [
      { shape: 'circle', cx: -7, cy: -6, r: 6, fill: 'none', stroke: '#caa23a', sw: 3 },
      { shape: 'line', x1: -4, y1: -3, x2: 9, y2: 10, stroke: '#caa23a', sw: 3 },
      { shape: 'line', x1: 5, y1: 6, x2: 10, y2: 1, stroke: '#caa23a', sw: 2.4 },
      { shape: 'line', x1: 9, y1: 10, x2: 13, y2: 6, stroke: '#caa23a', sw: 2.4 }
    ],
    // 宝箱:箱体(rect)+ 弧形盖 + 锁扣
    chest: [
      { shape: 'rect', x: -12, y: -1, w: 24, h: 13, fill: '#7a5230', stroke: '#3a2a1a', sw: 1 },
      { shape: 'path', d: 'M -12 -1 A 12 9 0 0 1 12 -1 Z', fill: '#8a6238', stroke: '#3a2a1a', sw: 1 },
      { shape: 'line', x1: -12, y1: 4, x2: 12, y2: 4, stroke: '#caa23a', sw: 1.5 },
      { shape: 'rect', x: -2.5, y: 1, w: 5, h: 6, fill: '#e8c24a', stroke: '#3a2a1a', sw: 0.8 }
    ],
    // 剑:刃(三角窄 polygon)+ 护手 + 柄 + 柄头
    sword: [
      { shape: 'polygon', points: '0,-14 2.5,4 -2.5,4', fill: '#c8ccd2', stroke: '#5a5e64', sw: 0.8 },
      { shape: 'rect', x: -7, y: 4, w: 14, h: 2.8, fill: '#8a6238', stroke: '#3a2a1a', sw: 0.6 },
      { shape: 'rect', x: -1.6, y: 6.8, w: 3.2, h: 7, fill: '#6b4a2b', stroke: '#3a2a1a', sw: 0.6 },
      { shape: 'circle', cx: 0, cy: 14, r: 2.4, fill: '#caa23a', stroke: '#3a2a1a', sw: 0.6 }
    ],
    // 火:外焰 + 内焰(双层火舌 path)
    fire: [
      { shape: 'path', d: 'M 0 13 q -11 -6 -6 -16 q -1 5 3 6 q -4 -9 3 -16 q -1 8 4 11 q 4 3 2 9 q 7 -1 4 -9 q 5 7 -1 15 q -4 5 -13 0 Z', fill: '#ff7a1a', stroke: '#d8540a', sw: 0.6 },
      { shape: 'path', d: 'M 0 13 q -6 -4 -3 -10 q 0 4 2 4 q -2 -6 2 -10 q 0 6 3 8 q 2 3 -1 8 Z', fill: '#ffd64a' }
    ],
    // 雕像:基座 + 身躯(梯形)+ 头(圆)
    statue: [
      { shape: 'rect', x: -9, y: 11, w: 18, h: 3.5, fill: '#9a9488', stroke: '#4a463e', sw: 0.8 },
      { shape: 'polygon', points: '-6,-2 6,-2 8,11 -8,11', fill: '#b3ab9c', stroke: '#4a463e', sw: 0.8 },
      { shape: 'circle', cx: 0, cy: -8, r: 5, fill: '#c2bbac', stroke: '#4a463e', sw: 0.8 }
    ],
    // 水晶:核心菱形(polygon)+ 两侧小棱
    crystal: [
      { shape: 'polygon', points: '0,-14 7,-2 0,13 -7,-2', fill: '#7ad0e8', stroke: '#3a8aa8', sw: 1 },
      { shape: 'polygon', points: '0,-14 0,13 -7,-2', fill: '#a8e4f2', stroke: '#3a8aa8', sw: 0.6 },
      { shape: 'polygon', points: '-11,2 -7,-4 -7,7', fill: '#8ad8ec', stroke: '#3a8aa8', sw: 0.6 },
      { shape: 'polygon', points: '11,2 7,-4 7,7', fill: '#6ac4dc', stroke: '#3a8aa8', sw: 0.6 }
    ],
    // 井:井口(椭圆)+ 井身 + 屋顶(两斜线)+ 立柱
    well: [
      { shape: 'rect', x: -10, y: 1, w: 20, h: 12, fill: '#8a8276', stroke: '#4a463e', sw: 1 },
      { shape: 'ellipse', cx: 0, cy: 1, rx: 10, ry: 3.2, fill: '#2e3a44', stroke: '#4a463e', sw: 1 },
      { shape: 'line', x1: -8, y1: -3, x2: 0, y2: -13, stroke: '#6b4a2b', sw: 2 },
      { shape: 'line', x1: 8, y1: -3, x2: 0, y2: -13, stroke: '#6b4a2b', sw: 2 }
    ],
    // 头骨:颅顶(上宽下收 path,比纯圆更像头骨)+ 大眼窝(椭圆)+ 鼻腔(倒三角)+ 下颌牙缝(竖线)
    skull: [
      { shape: 'path', d: 'M 0 -13 C 8 -13 11 -7 11 -1 C 11 4 8.5 6 6.5 7 L 6 11 L -6 11 L -6.5 7 C -8.5 6 -11 4 -11 -1 C -11 -7 -8 -13 0 -13 Z', fill: '#e6e1d4', stroke: '#a89e88', sw: 0.9 },
      { shape: 'ellipse', cx: -4.6, cy: -3, rx: 3, ry: 3.5, fill: '#2e2a26' },
      { shape: 'ellipse', cx: 4.6, cy: -3, rx: 3, ry: 3.5, fill: '#2e2a26' },
      { shape: 'polygon', points: '0,1 -2,5 2,5', fill: '#2e2a26' },
      { shape: 'line', x1: -3, y1: 7.5, x2: -3, y2: 11, stroke: '#a89e88', sw: 0.7 },
      { shape: 'line', x1: 0, y1: 7.5, x2: 0, y2: 11, stroke: '#a89e88', sw: 0.7 },
      { shape: 'line', x1: 3, y1: 7.5, x2: 3, y2: 11, stroke: '#a89e88', sw: 0.7 }
    ],
    // 书:封面(rect)+ 书脊 + 页缘
    book: [
      { shape: 'rect', x: -10, y: -12, w: 20, h: 24, fill: '#7a2e2e', stroke: '#4a1a1a', sw: 1 },
      { shape: 'rect', x: -10, y: -12, w: 4, h: 24, fill: '#5a1f1f', stroke: '#4a1a1a', sw: 0.8 },
      { shape: 'line', x1: 9, y1: -10, x2: 9, y2: 10, stroke: '#e8e0cf', sw: 2 },
      { shape: 'rect', x: -2, y: -4, w: 8, h: 1.6, fill: '#e8c24a' }
    ],
    // 药水:瓶身(圆)+ 瓶颈 + 瓶塞 + 液面
    potion: [
      { shape: 'circle', cx: 0, cy: 5, r: 8, fill: '#9a5ad0', stroke: '#5a2a8a', sw: 1 },
      { shape: 'rect', x: -2.5, y: -10, w: 5, h: 8, fill: '#b07ad8', stroke: '#5a2a8a', sw: 0.8 },
      { shape: 'rect', x: -3.5, y: -13, w: 7, h: 3.5, fill: '#6b4a2b', stroke: '#3a2a1a', sw: 0.6 },
      { shape: 'path', d: 'M -7 3 a 7 7 0 0 0 14 0 Z', fill: '#c89af0', op: 0.6 }
    ],

    // ── 自然/天气物件(round12《烈焰与咸风》:海/天气 hazard 之前无预设可用 → 退化占位三角)──
    //   云/浪/礁是 outdoor/海洋题材最常缺的物件;作者写 art:'cloud'/'wave'/'reef'(reef→rock 同款)即可。
    // 云:平底云团(浅灰白多瓣;暴风天靠 mood 暗色调压成乌云)
    cloud: [
      { shape: 'ellipse', cx: 0, cy: 3, rx: 13, ry: 5, fill: '#cdd3da', stroke: '#9aa2ac', sw: 0.8 },
      { shape: 'circle', cx: -6, cy: 0, r: 6, fill: '#d6dbe1', stroke: '#9aa2ac', sw: 0.8 },
      { shape: 'circle', cx: 2, cy: -4, r: 7.5, fill: '#dfe3e8', stroke: '#9aa2ac', sw: 0.8 },
      { shape: 'circle', cx: 9, cy: -1, r: 5.5, fill: '#d6dbe1', stroke: '#9aa2ac', sw: 0.8 }
    ],
    // 浪:两道波峰线(蓝)+ 浪沫点
    wave: [
      { shape: 'path', d: 'M -14 1 q 7 -9 14 0 q 7 9 14 0', fill: 'none', stroke: '#3a8ec0', sw: 2.6 },
      { shape: 'path', d: 'M -14 8 q 7 -7 14 0 q 7 7 14 0', fill: 'none', stroke: '#2a6f96', sw: 2.2 },
      { shape: 'circle', cx: -7, cy: -4, r: 1.5, fill: '#eaf4f8' }
    ],
    // 礁石/巨岩:多面棱角灰岩(polygon)+ 受光面(reef 同款)
    rock: [
      { shape: 'polygon', points: '-12,12 -8,-2 0,-9 9,-4 12,12', fill: '#8a8e92', stroke: '#54585c', sw: 1 },
      { shape: 'polygon', points: '0,-9 9,-4 4,4 -2,1', fill: '#9ca0a4', stroke: '#54585c', sw: 0.6 }
    ],
    // 远山:三角峰 + 雪顶
    mountain: [
      { shape: 'polygon', points: '-14,13 0,-13 14,13', fill: '#6a7180', stroke: '#3f4550', sw: 1 },
      { shape: 'polygon', points: '0,-13 5,-4 0,-1 -5,-4', fill: '#e8edf2', stroke: '#b8c0c8', sw: 0.6 }
    ],
    // 太阳:八向光芒(line)+ 日盘(circle,后画在上)
    sun: [
      { shape: 'line', x1: 0, y1: -14, x2: 0, y2: -9, stroke: '#f2c33a', sw: 1.6 },
      { shape: 'line', x1: 0, y1: 9, x2: 0, y2: 14, stroke: '#f2c33a', sw: 1.6 },
      { shape: 'line', x1: -14, y1: 0, x2: -9, y2: 0, stroke: '#f2c33a', sw: 1.6 },
      { shape: 'line', x1: 9, y1: 0, x2: 14, y2: 0, stroke: '#f2c33a', sw: 1.6 },
      { shape: 'line', x1: -10, y1: -10, x2: -6.5, y2: -6.5, stroke: '#f2c33a', sw: 1.4 },
      { shape: 'line', x1: 10, y1: -10, x2: 6.5, y2: -6.5, stroke: '#f2c33a', sw: 1.4 },
      { shape: 'line', x1: -10, y1: 10, x2: -6.5, y2: 6.5, stroke: '#f2c33a', sw: 1.4 },
      { shape: 'line', x1: 10, y1: 10, x2: 6.5, y2: 6.5, stroke: '#f2c33a', sw: 1.4 },
      { shape: 'circle', cx: 0, cy: 0, r: 7, fill: '#ffd84a', stroke: '#e0a82a', sw: 0.8 }
    ],
    // 月:弯月(外弧 + 内弧 path)
    moon: [
      { shape: 'path', d: 'M 4 -12 a 12 12 0 1 0 0 24 a 9 9 0 1 1 0 -24 Z', fill: '#e6e9d2', stroke: '#b8bca0', sw: 0.8 }
    ],
    // 飞鸟:海鸥双翼(一道双峰 path)
    bird: [
      { shape: 'path', d: 'M -13 2 Q -6 -7 0 1 Q 6 -7 13 2', fill: 'none', stroke: '#3a3f46', sw: 2 }
    ],
    // 花:五瓣环绕(circle)+ 花心 + 茎
    flower: [
      { shape: 'line', x1: 0, y1: 0, x2: 0, y2: 14, stroke: '#3f7a3a', sw: 1.6 },
      { shape: 'circle', cx: 0, cy: -8, r: 4, fill: '#e87aa0', stroke: '#c0507a', sw: 0.6 },
      { shape: 'circle', cx: -6, cy: -3, r: 4, fill: '#e87aa0', stroke: '#c0507a', sw: 0.6 },
      { shape: 'circle', cx: 6, cy: -3, r: 4, fill: '#e87aa0', stroke: '#c0507a', sw: 0.6 },
      { shape: 'circle', cx: -3.5, cy: 3, r: 4, fill: '#e87aa0', stroke: '#c0507a', sw: 0.6 },
      { shape: 'circle', cx: 3.5, cy: 3, r: 4, fill: '#e87aa0', stroke: '#c0507a', sw: 0.6 },
      { shape: 'circle', cx: 0, cy: -2, r: 3, fill: '#f2c84a', stroke: '#c89a2a', sw: 0.6 }
    ],

    // ── 常用物件(round12 补:treasure/document/building/cargo/combat/nautical 常缺的素材)──
    // 金币堆:层叠椭圆 + 立起一枚(coin/gold)
    coin: [
      { shape: 'ellipse', cx: 0, cy: 9, rx: 11, ry: 3.5, fill: '#e0b23a', stroke: '#9a7618', sw: 0.8 },
      { shape: 'ellipse', cx: -3, cy: 4, rx: 8, ry: 3, fill: '#e8c24a', stroke: '#9a7618', sw: 0.8 },
      { shape: 'ellipse', cx: 3, cy: 0, rx: 7, ry: 2.8, fill: '#f0cc5a', stroke: '#9a7618', sw: 0.8 },
      { shape: 'circle', cx: 5, cy: -6, r: 5, fill: '#f0cc5a', stroke: '#9a7618', sw: 0.8 },
      { shape: 'circle', cx: 5, cy: -6, r: 2, fill: 'none', stroke: '#c89a2a', sw: 0.8 }
    ],
    // 卷轴/书信/海图:羊皮纸 + 两端卷边 + 字行(scroll/letter/map)
    scroll: [
      { shape: 'rect', x: -9, y: -8, w: 18, h: 16, fill: '#e8dcc0', stroke: '#b89a6a', sw: 0.8 },
      { shape: 'rect', x: -12, y: -10, w: 4, h: 20, fill: '#d8c8a0', stroke: '#9a7e4a', sw: 0.9 },
      { shape: 'rect', x: 8, y: -10, w: 4, h: 20, fill: '#d8c8a0', stroke: '#9a7e4a', sw: 0.9 },
      { shape: 'line', x1: -5, y1: -3, x2: 5, y2: -3, stroke: '#a8895a', sw: 0.8 },
      { shape: 'line', x1: -5, y1: 1, x2: 5, y2: 1, stroke: '#a8895a', sw: 0.8 },
      { shape: 'line', x1: -5, y1: 5, x2: 3, y2: 5, stroke: '#a8895a', sw: 0.8 }
    ],
    // 旗帜/三角旗:旗杆 + 三角旗面(banner/flag)
    banner: [
      { shape: 'line', x1: -7, y1: -13, x2: -7, y2: 14, stroke: '#6b4a2b', sw: 1.8 },
      { shape: 'polygon', points: '-7,-13 11,-10 -7,-3', fill: '#a83232', stroke: '#7a1f1f', sw: 0.9 }
    ],
    // 盾:纹章盾形(path)+ 十字饰(shield)
    shield: [
      { shape: 'path', d: 'M 0 -12 L 11 -8 L 11 2 Q 11 11 0 14 Q -11 11 -11 2 L -11 -8 Z', fill: '#4a6a9a', stroke: '#2a3f5e', sw: 1 },
      { shape: 'line', x1: 0, y1: -10, x2: 0, y2: 13, stroke: '#d8c24a', sw: 1.4 },
      { shape: 'line', x1: -10, y1: -3, x2: 10, y2: -3, stroke: '#d8c24a', sw: 1.4 }
    ],
    // 房屋/小屋:墙体 + 坡屋顶 + 门窗(house/hut/building)
    house: [
      { shape: 'rect', x: -10, y: -1, w: 20, h: 14, fill: '#c2a878', stroke: '#7a5e3a', sw: 0.9 },
      { shape: 'polygon', points: '-12,-1 0,-13 12,-1', fill: '#9a4a3a', stroke: '#6a2e22', sw: 0.9 },
      { shape: 'rect', x: -3, y: 5, w: 6, h: 8, fill: '#6b4a2b', stroke: '#3a2a1a', sw: 0.6 },
      { shape: 'rect', x: 4, y: 2, w: 4, h: 4, fill: '#e8dca0', stroke: '#3a2a1a', sw: 0.5 }
    ],
    // 木桶/酒桶:桶身(中鼓 path)+ 顶盖 + 铁箍(barrel/cask)
    barrel: [
      { shape: 'path', d: 'M -8 -11 Q -12 0 -8 11 L 8 11 Q 12 0 8 -11 Z', fill: '#8a5e34', stroke: '#4a2e18', sw: 0.9 },
      { shape: 'ellipse', cx: 0, cy: -11, rx: 8, ry: 2.6, fill: '#9a6e44', stroke: '#4a2e18', sw: 0.8 },
      { shape: 'line', x1: -10, y1: -4, x2: 10, y2: -4, stroke: '#5a3e22', sw: 1.6 },
      { shape: 'line', x1: -10, y1: 4, x2: 10, y2: 4, stroke: '#5a3e22', sw: 1.6 }
    ],
    // 锚:吊环 + 锚杆 + 横档 + 双爪(anchor;海洋题材)。中深钢色 #5e6b7a:浅背景(沙滩/港镇)够暗可见、深背景比底色亮可见(原 #9aa2ac 太浅、撞浅背景隐形)
    anchor: [
      { shape: 'circle', cx: 0, cy: -11, r: 3, fill: 'none', stroke: '#5e6b7a', sw: 1.8 },
      { shape: 'line', x1: 0, y1: -8, x2: 0, y2: 11, stroke: '#5e6b7a', sw: 2.4 },
      { shape: 'line', x1: -7, y1: -4, x2: 7, y2: -4, stroke: '#5e6b7a', sw: 2.4 },
      { shape: 'path', d: 'M 0 11 Q -10 11 -10 1', fill: 'none', stroke: '#5e6b7a', sw: 2.4 },
      { shape: 'path', d: 'M 0 11 Q 10 11 10 1', fill: 'none', stroke: '#5e6b7a', sw: 2.4 },
      { shape: 'polygon', points: '-10,1 -13,2 -10,5', fill: '#5e6b7a' },
      { shape: 'polygon', points: '10,1 13,2 10,5', fill: '#5e6b7a' }
    ],

    // ── 剪影人物/生物预设(silhouette figures;诚实:身份主走 look() 文本,这些只是"有人/兽在此"的存在标记)──
    //   风格 = 暗派生色填充(绝不字面 #000)+ 可读的人/兽轮廓(头+躯干+四肢/袍/兜帽);与场景剪影逆光美学一致。
    //   会自动获得接地影/软自影/mood 轮廓光(element 循环融场三招),融入场景。本地居中 ±15,头在上(y≈-11)。
    // 通用人影:头(圆)+ 收腰躯干(polygon)+ 两臂(line)+ 两腿(line)
    figure: [
      { shape: 'circle', cx: 0, cy: -10, r: 3.6, fill: '#2c2c34', stroke: '#1a1a20', sw: 0.8 },
      { shape: 'polygon', points: '-4,-6 4,-6 3,6 -3,6', fill: '#2c2c34', stroke: '#1a1a20', sw: 0.8 },
      { shape: 'line', x1: -3.5, y1: -5, x2: -7, y2: 2, stroke: '#2c2c34', sw: 2.4 },
      { shape: 'line', x1: 3.5, y1: -5, x2: 7, y2: 2, stroke: '#2c2c34', sw: 2.4 },
      { shape: 'line', x1: -2, y1: 6, x2: -3.5, y2: 14, stroke: '#2c2c34', sw: 2.8 },
      { shape: 'line', x1: 2, y1: 6, x2: 3.5, y2: 14, stroke: '#2c2c34', sw: 2.8 }
    ],
    // 法袍/祭司:头(圆)+ 宽下摆长袍(梯形 polygon,垂地)+ 两袖(斜 polygon)
    robed: [
      { shape: 'circle', cx: 0, cy: -10, r: 3.6, fill: '#2e2a36', stroke: '#1a1822', sw: 0.8 },
      { shape: 'polygon', points: '-4,-6 4,-6 9,14 -9,14', fill: '#322c3e', stroke: '#1a1822', sw: 0.9 },
      { shape: 'polygon', points: '-4,-5 -9,5 -6,6 -3,-2', fill: '#2a2632', stroke: '#1a1822', sw: 0.6 },
      { shape: 'polygon', points: '4,-5 9,5 6,6 3,-2', fill: '#2a2632', stroke: '#1a1822', sw: 0.6 }
    ],
    // 兜帽(盗贼/教徒):尖兜帽罩头(path,脸藏阴影)+ 斗篷躯干(梯形)+ 帽下暗脸
    hooded: [
      { shape: 'polygon', points: '-5,-4 5,-4 8,13 -8,13', fill: '#26282c', stroke: '#16181c', sw: 0.9 },
      { shape: 'path', d: 'M 0 -14 q 6 1 5.5 8 q -5.5 2 -11 0 q -0.5 -7 5.5 -8 Z', fill: '#2a2c30', stroke: '#16181c', sw: 0.8 },
      { shape: 'ellipse', cx: 0, cy: -7, rx: 2.6, ry: 3, fill: '#16181c' }
    ],
    // 披甲士兵:头盔(圆)+ 宽肩护甲(polygon)+ 躯干 + 可选长矛(竖 line)+ 矛尖
    guard: [
      { shape: 'circle', cx: 0, cy: -10, r: 3.4, fill: '#2b2e33', stroke: '#191b1f', sw: 0.8 },
      { shape: 'polygon', points: '-8,-3 8,-3 5,3 -5,3', fill: '#33373d', stroke: '#191b1f', sw: 0.9 },
      { shape: 'polygon', points: '-5,3 5,3 4,14 -4,14', fill: '#2b2e33', stroke: '#191b1f', sw: 0.8 },
      { shape: 'line', x1: 9, y1: -13, x2: 9, y2: 14, stroke: '#3a2a1a', sw: 1.6 },
      { shape: 'polygon', points: '9,-15 11,-11 7,-11', fill: '#8a8276', stroke: '#191b1f', sw: 0.5 }
    ],
    // 四足生物剪影:躯干(椭圆)+ 头(圆)+ 四腿(line)+ 尾(line)
    beast: [
      { shape: 'ellipse', cx: 0, cy: 2, rx: 11, ry: 5.5, fill: '#2a2622', stroke: '#161310', sw: 0.9 },
      { shape: 'circle', cx: -10, cy: -3, r: 4, fill: '#2a2622', stroke: '#161310', sw: 0.8 },
      { shape: 'line', x1: -7, y1: 6, x2: -8, y2: 14, stroke: '#2a2622', sw: 2.4 },
      { shape: 'line', x1: -3, y1: 7, x2: -3.5, y2: 14, stroke: '#2a2622', sw: 2.4 },
      { shape: 'line', x1: 4, y1: 7, x2: 4, y2: 14, stroke: '#2a2622', sw: 2.4 },
      { shape: 'line', x1: 8, y1: 6, x2: 9, y2: 14, stroke: '#2a2622', sw: 2.4 },
      { shape: 'line', x1: 11, y1: 0, x2: 15, y2: -5, stroke: '#2a2622', sw: 1.8 }
    ],
    // 戴冠贵族/王:头(圆)+ 王冠(锯齿 polygon)+ 长袍躯干(梯形)
    crowned: [
      { shape: 'polygon', points: '-4,-8 4,-8 8,14 -8,14', fill: '#2c2832', stroke: '#181620', sw: 0.9 },
      { shape: 'circle', cx: 0, cy: -8, r: 3.6, fill: '#2c2832', stroke: '#181620', sw: 0.8 },
      { shape: 'polygon', points: '-4.5,-11 -4.5,-13 -2.5,-11.5 0,-14 2.5,-11.5 4.5,-13 4.5,-11', fill: '#c8a23a', stroke: '#7a5e18', sw: 0.6 }
    ]
  };

  // element.art 派发:字符串 → 查预设库(**未知名 → 退化 glyph + console.warn,不 throw**);
  //   数组 → 校验 + 渲染 art-spec(**非法 → throw**)。返回 SVG 串(本地坐标,调用方包 translate)
  //   或 null(=未知预设名 → 调用方退化为该 kind 的 glyph)。
  function renderElementArt(art, where) {
    where = where || 'element.art';
    if (typeof art === 'string') {
      var preset = ART_PRESETS[art];
      if (!preset) {
        if (typeof console !== 'undefined' && console.warn) console.warn('present-svg: 未知 art 预设名 "' + art + '"(优雅退化为 glyph;可选:' + Object.keys(ART_PRESETS).join('/') + ' 或给 art-spec 图元数组)');
        return null;   // 退化:调用方画 kind 的 glyph
      }
      return renderArtSpec(preset, where + "('" + art + "')");   // 预设也走同一渲染路径(dogfood)
    }
    return renderArtSpec(art, where);   // 数组(或其它非法类型)→ renderArtSpec 校验(非法即 throw)
  }

  // ── 多物件深度构图(治"多物件挤成等高一行")──────────────────────────────────────────────
  //   缘起:多个物件原样排在 cx=40,100,160…、同 cy=108、同尺寸 = 死板一行。placeElements 给 N≥2 物件
  //   **物理默认**布局:沿 x 不重叠均布(+种子抖动)+ 近大远小(scale/y 按深度 t)。**只做物理默认、不做主观构图**
  //   (无三分/黄金分割吸附 = 不锚定 §11;作者 art/glyph 造型与位置语义不碰)。**确定性**:独立 `|place` 种子流
  //   (绝不续用主场景 rng → 不扰 silhouette/atmosphere/eyes 的 K5/L8/M6/T29 等确定性断言)。
  //   n≤1 → 返回 canonical {40,108,1}(单物件/dice/无物件场景走旧 slot 位 = 字节不变)。
  //   返回数组按 k 升序(k=0 最远 t=0 → 最近 t=1)→ 调用方按 els 顺序发出即"远先画近后画"画家序。
  function placeElements(n, rng) {
    if (n <= 1) return [{ x: 40, y: 108, scale: 1 }];
    var out = [], mL = 32, seg = (W - 64) / n, k, t, x, s, feetY;
    for (k = 0; k < n; k++) {
      t = k / (n - 1);                                                  // 0 远 .. 1 近
      x = mL + (k + 0.5) * seg + (rng() - 0.5) * seg * 0.5;             // 均布 + 种子抖动(防机械等距)
      s = 0.62 + t * 0.38;                                              // 近大远小:scale 0.62(远)→1.0(近)
      feetY = 118 + t * 10;                                             // **脚踩"后退地平线"** 118(远·近地平线/小)→128(近·前景/大)=接地不浮空
      out.push({ x: Math.max(20, Math.min(W - 20, x)), y: feetY - 14 * s, scale: s });   // y=center;脚(canonical center+14)经 wrapper 落 feetY → 物件始终立在地面线上,不再窜上房顶/天空
    }
    return out;
  }

  // 纯函数:scene 意图 → SVG 字符串。无 scene(模块没声明)→ ''(退化:不画)。可在纯 node 断言。
  function buildSceneSVG(scene) {
    if (!scene || typeof scene !== 'object') return '';
    var fam = resolveRegionFamily(scene.region);                       // 开放词汇治理:已知词原样 / 近义词归族 / 真未知→null
    var bg = fam ? REGION_BG[fam] : (scene.region ? hashRegionColor(scene.region) : '#cfd2d6');   // 未知非空→哈希深色氛围底(治灰板);未声明→中性
    var skyTop = shade(bg, 0.22), skyBot = shade(bg, -0.30);   // 表现力升级(调研 A1):region 基色 → 天空渐变(顶提亮/底压暗;中段保留原色)。零滤镜开销、最大氛围跃升
    // C04(showcase 前瞻审计·命名/形态接缝同母类):scene.elements 写成非数组(对象/字符串)→ 旧版静默吞成 []=整场物件不画。
    //   与内层 renderArtSpec(:716 非数组即抛)对称:形态写错就 fail-loud,别静默退化(运行时此抛由 boot 错误横幅兜;
    //   装配探针够不到 SVG 渲染 → graph-audit 另有静态闸提前抓)。未声明/undefined → 仍 [](合法:无物件场景);仅"声明了却不是数组"才抛。
    if (scene.elements != null && !Array.isArray(scene.elements)) throw new Error('present-svg: scene.elements 必须是图元数组(收到 ' + (typeof scene.elements) + ');空场景用 elements:[] 或省略该字段。');
    var els = Array.isArray(scene.elements) ? scene.elements : [];
    var hasEyes = false, hasDice = false, hasArt = false;
    for (var k = 0; k < els.length; k++) {
      var ek = els[k], gk = ek && GLYPH[ek.kind];
      if (gk === 'eyes') hasEyes = true; else if (gk === 'dice') hasDice = true;
      // 物件具体化场景融合(下方治"突兀/悬浮/扁平"):有 art 物件(非 dice 特殊渲染)才注入软投影+体积滤镜(保无 art 场景字节不变)
      if (ek && (ek.art != null || ek.kind === 'character') && gk !== 'dice') hasArt = true;   // character 无 art 也走人影(默认升级,见下)→ 同样需要 #aart 融场滤镜
    }
    var atmo = buildAtmosphere(fam, scene.mood);                                                // 表现力升级:region(家族)→氛围点缀(星/月/萤火/矿物/窗光/波光)
    var needGlow = (atmo.sky + atmo.ground).indexOf('url(#aglow)') >= 0;                        // 有发光元素(辉光月)才注入辉光滤镜(保字节)
    var fogColor = scene.mood ? FOG_TINT[scene.mood] : null;                                    // 表现力升级(B1):氛围 mood → 流动雾(条件注入;无 mood/非雾 mood→null=字节不变)
    var hasFog = !!fogColor;
    var fogSeed = hasFog ? hashStr((scene.region || '') + '|' + scene.mood) % 97 : 0;            // 确定性 seed(从 region+mood;feTurbulence 同 seed 同雾形)
    var gr = godRays(fam, scene.region, scene.mood, bg);                                        // 表现力升级:光感 mood → 体积光柱(几何按家族、强度按底色亮度;非光感 mood→{'',''} 字节不变)
    var hasRays = !!gr.body;
    var weather = buildWeather(scene.region, scene.mood);                                        // 表现力升级 #2:天气 mood → 前景雨雪粒子(非天气 mood→'' 字节不变)
    var hasWeather = !!weather;
    var weatherBack = buildWeatherBack(scene.region, scene.mood);                                 // 背景天气层(仅 ash/sand 双层纵深;其余→'' 字节不变)
    var hasWeatherBack = !!weatherBack;
    var filmGrade = scene.mood ? FILM_GRADE[scene.mood] : null;                                   // 收尾 #1:feColorMatrix 整场电影调色(mood-gated;非调色 mood/无 mood→null 字节不变)
    var hasFilmGrade = !!filmGrade;
    var dispCfg = scene.mood ? DISPLACE[scene.mood] : null;                                       // 收尾 #2:feDisplacementMap 画面扭曲(mood-gated;非扭曲 mood/无 mood→null 字节不变)
    var hasDisplace = !!dispCfg;
    var dispSeed = hasDisplace ? hashStr((scene.region || '') + '|' + scene.mood + '|disp') % 97 : 0;   // 确定性 seed(从 region+mood;feTurbulence 同 seed 同扭曲)
    // V1 暗角光照呼吸:仅张力 mood 给 vignette 外圈 stop 挂 SMIL 明暗呼吸(其余 mood / 无 mood → 静态 avig 字节不变)。
    //   dur 从 region+mood hash 取 20-40s 区间(确定性、烛火/心跳级缓慢);base 0.42、峰 0.50(克制起伏,只让暗角微微"活")。
    var vigBreathe = scene.mood ? VIG_BREATHE[scene.mood] : null;
    var avig;
    if (vigBreathe) {
      var vigDur = 20 + (hashStr((scene.region || '') + '|' + scene.mood + '|vig') % 21);   // 20..40s(整数;确定性)
      avig = '<radialGradient id="avig" cx="0.5" cy="0.5" r="0.72"><stop offset="0.5" stop-color="#000" stop-opacity="0"/>'
        + '<stop offset="1" stop-color="#000" stop-opacity="0.42">'
        + '<animate attributeName="stop-opacity" values="0.42;0.50;0.42" dur="' + vigDur + 's" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.42 0 0.58 1;0.42 0 0.58 1"/>'
        + '</stop></radialGradient>';
    } else {
      avig = '<radialGradient id="avig" cx="0.5" cy="0.5" r="0.72"><stop offset="0.5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.42"/></radialGradient>';
    }
    var p = [];
    // 根 svg 用 height:auto 自算 16:9(=viewBox W:H),不依赖容器写死的高度 → 永不内部 pillarbox(左右黑边)。
    //   内联 style 优先级高于外部 `#scene svg{}`,即使作者残留旧 height:100% 也压不过、不会复发黑边。
    //   逃生口(§11):16:9 是【呈现器自身画幅】(把 320×180 语义画布映射到容器),非作者 C 类视觉。想换画幅
    //   → 作者域改 #scene 的 aspect-ratio(SVG 自适应任意容器宽、永不再 pillarbox),或自写 presenter 接管 scene。
    //   (旧版 width=100% height=100% 让 SVG 填满容器、再被 meet 居中,容器比例 ≠16:9 时左右露 background → 黑边。)
    p.push('<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto"'
      + ' xmlns="http://www.w3.org/2000/svg" class="amatlas-scene"'
      + ' data-region="' + esc(scene.region || '') + '" data-mood="' + esc(scene.mood || '') + '">');
    if (hasEyes) p.push(EYE_STYLE);                                                           // S10:仅有眼睛时注入动画 CSS(保旧场景字节不变)
    if (hasDice) p.push(DICE_STYLE);                                                          // round6:仅有骰子时注入掷动动画 CSS
    p.push('<defs>'                                                                            // 表现力升级:天空渐变 + 暗角 vignette(纯生成 SVG、零依赖)
      + '<linearGradient id="asky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + skyTop + '"/><stop offset="0.5" stop-color="' + bg + '"/><stop offset="1" stop-color="' + skyBot + '"/></linearGradient>'
      + avig                                                                                     // V1:张力 mood→呼吸 avig(SMIL stop-opacity 往返)/ 其余→静态 avig 字节不变
      + (needGlow ? GLOW_FILTER : '')                                                          // 辉光滤镜(feGaussianBlur+feMerge;仅有发光点缀=辉光月时注入)
      + (hasArt ? ART_SHADOW_FILTER : '')                                                       // 物件软自影滤镜(仅场景含 art 物件时注入;保无 art 场景字节不变)
      + (hasFog ? fogFilter(fogColor, fogSeed) : '')                                            // 流动雾滤镜(feTurbulence+animate baseFrequency;仅氛围 mood 时注入)
      + (hasRays ? gr.defs : '')                                                                 // god-rays 径向渐变(仅光感 mood 时注入)
      + (hasFilmGrade ? filmGradeFilter(filmGrade) : '')                                         // 收尾 #1:feColorMatrix 整场调色滤镜(仅调色 mood 时注入)
      + (hasDisplace ? displaceFilter(dispCfg, dispSeed) : '')                                   // 收尾 #2:feDisplacementMap 扭曲滤镜(仅扭曲 mood 时注入)
      + '</defs>');
    // 收尾 #1/#2:把全部内容层包进调色/扭曲 <g>(滤镜作用于整场渲染结果);letterbox 黑边留在 <g> 外(不被调色/不被位移裁出空隙)。
    // 调色外、扭曲内(nest):先按噪声位移渲染结果,再对位移后的画面整场调色——两滤镜可同时生效,无冲突(单元素仅一 filter,故嵌套)。
    if (hasFilmGrade) p.push('<g filter="url(#agrade)">');
    if (hasDisplace) p.push('<g filter="url(#adisp)">');
    p.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#asky)"/>');      // 背景=region 基色天空渐变(替代纯色块)
    if (atmo.sky) p.push(atmo.sky);                                                            // 天空点缀(星/月):在剪影后=天空深处
    if (hasWeatherBack) p.push(weatherBack);                                                    // 背景天气层(ash/sand 远层):在剪影【之前】=投在地形后、被剪影遮=纵深(z 序更靠里)
    p.push(buildSilhouette(fam, scene.mood, bg));                                               // 表现力升级(A4):region(家族)→程序化地形/建筑剪影(背景远景层;室内/真未知→'')
    if (atmo.ground) p.push(atmo.ground);                                                      // 地表点缀(萤火/矿物/窗光/波光):在剪影前=近景
    if (hasFog) p.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#fff" filter="url(#afog)" opacity="0.42"/>');  // 表现力升级(B1):流动雾(中景层=柔化剪影/远景点缀;前景地平线/图元在其上清晰;0.42=笼罩氛围而不盖死)
    p.push('<rect x="0" y="126" width="' + W + '" height="54" fill="rgba(0,0,0,.12)"/>');       // 地平线(地面;半透明黑叠在剪影根部=融入地面)
    var slot = 0, hasLetterbox = false;                                                         // slot 只为行内图元递增;overlay(eyes/letterbox)不占位
    // 多物件深度构图:预扫"可见物件"(非 dice/letterbox/eyes)→ P≥2 时按 placeElements 排布(独立 |place 种子,不扰主 rng)
    var placeable = [], diceN = 0;
    for (var pi = 0; pi < els.length; pi++) { var psh = GLYPH[(els[pi] || {}).kind] || 'circle'; if (psh === 'dice') diceN++; if (psh !== 'letterbox' && psh !== 'eyes' && psh !== 'dice') placeable.push(pi); }
    var P = placeable.length;
    var diceStep = diceN > 5 ? (W - 68) / (diceN - 1) : 60;        // >5 骰:压缩间距使全部入幅(首骰 cx=40、末骰 cx=W-28=292);≤5 骰→60=与旧布局字节恒等
    var places = placeElements(P, mulberry32(hashStr((scene.region || '') + '|' + (scene.mood || '') + '|place')));
    var placeOf = {}; for (var pk = 0; pk < placeable.length; pk++) placeOf[placeable[pk]] = places[pk];
    for (var i = 0; i < els.length; i++) {
      var e = els[i] || {}, shape = GLYPH[e.kind] || 'circle';
      if (shape === 'letterbox') { hasLetterbox = true; continue; }                            // 画幅黑边:延后到 tint 之上画
      if (shape === 'eyes') { p.push(buildEyes(e, bg, scene.region, scene.mood)); continue; }   // 眼睛:overlay,不占 slot、不画底部 ref 标签;传 region/mood 派生确定性 seed(充血/血泪/瞳孔)
      if (shape === 'claw') { p.push(buildClaw(e, scene.region, scene.mood)); continue; }       // 抓痕:overlay,3-4 道平行斜痕(被攻击残留),静态
      if (shape === 'swallow') { p.push(buildSwallow(e, bg, scene.region, scene.mood)); continue; }  // 漩涡:overlay,同心暗色椭圆 + 缓慢旋转(被吞噬/坠入虚空)
      // dice:沿用 slot 位、不缩放、不参与深度排布(保 numberReel/clipPath 几何与 G2-G24)
      if (shape === 'dice') {
        var cxd = Math.min(W - 28, Math.round(40 + slot * diceStep)), cyd = 108; slot++;   // 防溢出:>5 骰压缩间距+末骰 clamp 至 W-28(box/gem/reel 全入 320 幅);≤5 骰 cx≤280→字节恒等
        var df = DICE_FILL[e.state] || '#f4f4f4';                             // 落定色:success/crit→绿 / fail/fumble→红 / rolling→琥珀 / 其它→白
        var sides = (e.sides != null) ? e.sides : null;                       // 契约 v7:面数(缺省 null → 通用方块)
        var sk = dieShapeKind(sides);
        var faceVal = esc(e.ref != null ? e.ref : '');
        var extra = '';
        if (e.state === 'crit') extra = critAura(sk, cxd, cyd);              // 自然最大:金光描边(暴击)
        else if (e.state === 'fumble') extra = '<polyline class="amatlas-die-fumble" points="' + (cxd - 11) + ',' + (cyd - 12) + ' ' + (cxd - 2) + ',' + (cyd - 2) + ' ' + (cxd + 4) + ',' + (cyd + 1) + ' ' + (cxd - 1) + ',' + (cyd + 13) + '" fill="none" stroke="#5a0d10" stroke-width="2.5"/>';   // 大失败:暗红裂纹
        p.push('<ellipse class="amatlas-die-shadow" cx="' + cxd + '" cy="' + (cyd + 20) + '" rx="15" ry="4" fill="#000" opacity="0.32"/>');   // 地面投影
        p.push('<g class="amatlas-die"' + (sides != null ? ' data-sides="' + sides + '"' : '') + '>'
          + dieBody(sk, cxd, cyd, df) + numberReel(cxd, (sk === 'cube' ? cyd - 4 : cyd), faceVal) + extra + '</g>');
        continue;
      }
      // 可见物件:P≥2 → 深度排布(canonical 40,108 渲染 → <g translate/scale> 包裹定位+近大远小;画家序=els 序、k=0 远先画);P≤1 → 旧 slot 位字节不变
      var multi = (P >= 2);
      var cx = multi ? 40 : (40 + slot * 60), cy = 108; slot++;
      // 契约 v9:element.art(预设名 | art-spec DSL);character 缺省走剪影人影 'figure'(怎么画是 presenter 自由,§10.2-Q1;art 内部以 (0,0) 为中心)。
      var artVal = (e.art != null) ? e.art : (e.kind === 'character' ? 'figure' : null);
      var pieces = [];
      if (artVal != null) {
        var artSvg = renderElementArt(artVal, 'elements[' + i + '].art');   // 字符串预设(未知→null)/ 数组 art-spec(非法→throw)
        if (artSvg == null && e.kind === 'character') artSvg = renderElementArt('figure');   // character 未知预设名也退人影(比裸圆更"有人在此")
        if (artSvg != null) {                                               // 场景融合两招:接地柔影 + 软自影滤镜(整体由 wrapper 同步缩放,远物小影、近物大影自洽)
          pieces.push(artGroundShadow(cx, cy));
          pieces.push('<g transform="translate(' + cx + ',' + cy + ')" filter="url(#aart)">' + artSvg + '</g>');
          pieces.push(elementLabel(cx, cy + 24, e.ref));
        }
      }
      if (!pieces.length) {                                                 // 未走 art(无 artVal 或未知预设名)→ 抽象 glyph(同款接地影+体积,保形状语义=不锚定)
        if (shape === 'rect') pieces.push(artGroundShadow(cx, cy)
          + '<rect x="' + (cx - 12) + '" y="' + (cy - 12) + '" width="24" height="24" fill="#e8e2d4" stroke="#4a443a"/>'
          + '<rect x="' + (cx - 12) + '" y="' + (cy + 7) + '" width="24" height="5" fill="#bdb4a4"/>');
        else if (shape === 'tri') pieces.push(artGroundShadow(cx, cy)
          + '<polygon points="' + cx + ',' + (cy - 14) + ' ' + (cx - 12) + ',' + (cy + 10) + ' ' + (cx + 12) + ',' + (cy + 10) + '" fill="#d9a23a" stroke="#7a5a1a" stroke-width="1.2"/>'
          + '<polygon points="' + cx + ',' + (cy - 8) + ' ' + (cx - 7) + ',' + (cy + 7) + ' ' + (cx + 7) + ',' + (cy + 7) + '" fill="#c08a26" opacity="0.55"/>');
        else if (shape === 'door') pieces.push(artGroundShadow(cx, cy)
          + '<rect x="' + (cx - 10) + '" y="' + (cy - 16) + '" width="20" height="32" fill="#5b3a1a" stroke="#2e2014"/>'
          + '<rect x="' + (cx - 7) + '" y="' + (cy - 13) + '" width="14" height="26" fill="none" stroke="#7a5a32" stroke-width="1"/>'
          + '<circle cx="' + (cx + 5) + '" cy="' + (cy + 2) + '" r="1.6" fill="#c9a86a"/>');
        else pieces.push(artGroundShadow(cx, cy) + '<circle cx="' + cx + '" cy="' + cy + '" r="13" fill="#e4ded2" stroke="#4a443a"/>');   // 未知 kind 兜底圆
        pieces.push(elementLabel(cx, cy + 24, e.ref));
      }
      var objStr = pieces.join('');                                         // N=1:join 后单次 push = 与旧多次 push 字节相同
      if (multi) { var pl = placeOf[i], s = pl.scale; p.push('<g transform="translate(' + (pl.x - s * cx).toFixed(1) + ',' + (pl.y - s * cy).toFixed(1) + ') scale(' + s.toFixed(3) + ')">' + objStr + '</g>'); }
      else p.push(objStr);
    }
    var tint = MOOD_TINT[scene.mood];
    if (tint) p.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + tint + '"/>');  // mood→色调覆盖
    if (hasRays) p.push(gr.body);                                                            // god-rays 光束组:叠 mood tint 之上、vignette 之下(受暗角笼罩,贴合分层)
    p.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#avig)"/>');   // 暗角 vignette:聚焦视线、电影感(调研 A1;叠 mood tint 之上、letterbox 之下)
    if (hasWeather) p.push(weather);                                                             // 表现力升级 #2:雨雪粒子=前景(叠 vignette 之上、letterbox 之下)
    if (hasDisplace) p.push('</g>');                                                             // 收尾 #2:闭合扭曲组(内层先闭,letterbox 留组外)
    if (hasFilmGrade) p.push('</g>');                                                            // 收尾 #1:闭合调色组(外层后闭)
    if (hasLetterbox) {                                                                          // S10:画幅黑边置于最上层(过场/眼睛之上)
      p.push('<rect x="0" y="0" width="' + W + '" height="' + BAR + '" fill="#000"/>');
      p.push('<rect x="0" y="' + (H - BAR) + '" width="' + W + '" height="' + BAR + '" fill="#000"/>');
    }
    p.push('</svg>');
    return p.join('');
  }

  // ── 视觉路线图 #3:HSL 冷暖景深分级(opt-in 后处理;buildSceneSVG 本身零改动)──────────────
  // 缘起(docs/expressiveness-upgrade.md 路线图):强模型探上限发现配色平,缺电影级纵深。**大气透视**=
  // 远处偏冷(蓝青)、近处偏暖(橙黄)→ Teal-Orange 调色。做法不是把色相硬转到固定角度(那会让蓝绕进紫、
  // 黄绕进绿),而是按景深 depth 把基色**混合**向冷/暖叠加色(RGB 插值,只染不盖,保色相个性)+ 明度还原
  // (要色相纵深、不要洗白)+ 远景微提亮(被空气洗淡)。纯色计算、零依赖、确定性(同输入同输出)。
  // **设计为 opt-in 后处理**(gradeSVG 套在 buildSceneSVG 字符串外):buildSceneSVG 被 118 条测试逐字断言,
  //   绝不动其输出;默认 OFF(createSvgPresenter 不传 grade)→ 既有游戏/测试字节完全不变。
  // hex #rrggbb → [h(0-360), s(0-1), l(0-1)];非 hex → null(供 tintHue 原样保护 #000/rgba)
  function hexToHsl(hex) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return null;
    var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0, s = 0, l = (mx + mn) / 2;
    if (d !== 0) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
      else if (mx === g) h = ((b - r) / d + 2);
      else h = ((r - g) / d + 4);
      h *= 60;
    }
    return [h, s, l];
  }
  // [h,s,l] → hex #rrggbb
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    function f(n) {
      var k = (n + h / 30) % 12;
      var a = s * Math.min(l, 1 - l);
      var c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
      return Math.round(255 * c);
    }
    function hx(v) { v = Math.max(0, Math.min(255, v)); return ('0' + v.toString(16)).slice(-2); }
    return '#' + hx(f(0)) + hx(f(8)) + hx(f(4));
  }
  // 两 hex 在 RGB 空间线性插值(t=0→a, 1→b);非 hex → 原样返回 a
  function blendHex(a, b, t) {
    var ma = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(a);
    var mb = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(b);
    if (!ma || !mb) return a;
    function m(i) { return Math.round(parseInt(ma[i], 16) * (1 - t) + parseInt(mb[i], 16) * t); }
    function hx(v) { v = Math.max(0, Math.min(255, v)); return ('0' + v.toString(16)).slice(-2); }
    return '#' + hx(m(1)) + hx(m(2)) + hx(m(3));
  }
  var GRADE_COOL = '#2a6f7f';   // 青(远)叠加色
  var GRADE_WARM = '#d98a3a';   // 橙(近)叠加色
  // tintHue:按景深 depth(0=最远/冷,1=最近/暖)做 Teal-Orange 冷暖分级。强度随"离中点距离"(中段 depth≈0.5
  //   几乎不偏=平滑过渡,两端最强)× amt 总控(0=不变)。**只重算颜色,输出仍是 #rrggbb;非 hex(rgba/#000
  //   简写)原样返回 → 保护 vignette #000 / mood tint rgba**。
  function tintHue(hex, depth, amt) {
    var hsl = hexToHsl(hex);
    if (!hsl) return hex;                              // 非 #rrggbb → 原样返回(保护 vignette #000 / rgba mood tint)
    if (amt == null) amt = 0.5;
    var k = Math.abs(depth - 0.5) * 2 * amt;           // 偏移强度:0(中段)→ amt(两端)
    var overlay = depth < 0.5 ? GRADE_COOL : GRADE_WARM;
    var blended = blendHex(hex, overlay, k * 0.6);     // 把基色染向冷/暖叠加色(×0.6=克制,只染不盖)
    var bh = hexToHsl(blended);                        // 取染后的色相 + 饱和
    var dl = (0.5 - depth) * 0.07 * amt * 2;           // 大气透视:远景(depth 小)微提亮(被空气洗淡)
    var nl = Math.max(0, Math.min(1, hsl[2] + dl));    // 明度还原到原值附近(要色相纵深、不要洗白)
    return hslToHex(bh[0], bh[1], nl);
  }
  // gradeSVG:后处理 buildSceneSVG 输出——把"天空渐变 #asky 三 stop"+"剪影各层 path fill"的 hex 经 tintHue
  //   重映射。其余(vignette #avig 的 #000、图元 fill="#fff" 等)一律不碰。
  //   · 天空渐变 #asky:顶 stop(offset 0)=depth 0.05(最冷,天空深处)、中(0.5)=0.5(中性,保 region 基色感)、
  //     底(1)=0.85(暖,近地面)。· 剪影 path:按出现顺序赋 depth——第 1 个(远层)=0.2、第 2+ 个(近层)=0.8。
  function gradeSVG(svg, amt) {
    if (typeof svg !== 'string' || !svg) return svg;
    // 1) 天空渐变 #asky:精确锁定该 linearGradient 块,只改其内 3 个 stop-color 的 hex。
    svg = svg.replace(/(<linearGradient id="asky"[^>]*>)([\s\S]*?)(<\/linearGradient>)/, function (_, open, body, close) {
      var depthByOffset = { '0': 0.05, '0.5': 0.5, '1': 0.85 };
      body = body.replace(/<stop offset="([0-9.]+)" stop-color="(#[0-9a-f]{6})"\/>/gi, function (m, off, hex) {
        var d = depthByOffset[off]; if (d == null) d = 0.5;
        return '<stop offset="' + off + '" stop-color="' + tintHue(hex, d, amt) + '"/>';
      });
      return open + body + close;
    });
    // 2) 剪影 path fill:按顺序远→近赋 depth(只匹配 #rrggbb 的 path fill;vignette 是 radialGradient 不在此列)。
    var idx = 0;
    svg = svg.replace(/(<path d="[^"]*" fill=")(#[0-9a-f]{6})(")/gi, function (_, pre, hex, post) {
      var depth = idx === 0 ? 0.2 : 0.8;   // 第一层=远(冷)、第二层及之后=近(暖)
      idx++;
      return pre + tintHue(hex, depth, amt) + post;
    });
    return svg;
  }

  // 呈现器:把 scene 画进约定容器(selector 默认 '#scene';也可直接传 container 对象,便于测试)。
  // 无容器(没挂插槽)→ no-op:优雅退化为纯文字。snap = view() 信封 {view, actions, pos}。
  function createSvgPresenter(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var slot = opts.slot || '#scene';   // S11-b-ex:挂载点参数统一为 slot(与 save/minimap/achievement 一致)
    // 视觉路线图 #3:HSL 冷暖景深分级(opt-in 后处理)。grade 缺省 undefined/false=OFF(字节不变);
    //   true=默认强度 0.6;数值 0-1=自定强度。设置时,present() 在 buildSceneSVG 字符串外套一层 gradeSVG。
    var gradeAmt = (opts.grade === true) ? 0.6 : (typeof opts.grade === 'number' ? opts.grade : null);
    var lastPosKey = null;     // 上次渲染所在节点(map:node);transition 仅"节点变了"才放(纯动作 re-render 不重放)
    var fxInjected = false;
    function resolve() {
      if (opts.container) return opts.container;
      return doc ? doc.querySelector(slot) : null;
    }
    // 过场动画 CSS 注入 document.head(一次);无真 DOM(测试 / 无插槽)→ 跳过、不崩。
    function ensureFxStyles() {
      if (fxInjected) return;
      if (!doc || !doc.head || typeof doc.createElement !== 'function') return;
      if (doc.getElementById && doc.getElementById('amatlas-svg-fx')) { fxInjected = true; return; }
      var st = doc.createElement('style'); st.id = 'amatlas-svg-fx'; st.textContent = FX_CSS;
      doc.head.appendChild(st); fxInjected = true;
    }
    // 放一次性过场:给容器加 amatlas-fx-<tr> class(CSS 动画),~760ms 后移除。旧 mock 容器无 classList→退化不崩。
    function playFx(el, tr) {
      if (!el.classList || typeof el.classList.add !== 'function') return;
      ensureFxStyles();
      var cls = 'amatlas-fx-' + tr;
      el.classList.add(cls);
      if (typeof setTimeout === 'function') setTimeout(function () { try { el.classList.remove(cls); } catch (e) {} }, 760);
    }
    // reduced-motion(易用性审计批):骰子是 CSS 动画、media query 管得住;场景点缀(星明灭/萤火/
    //   雨雪/活雾/god-rays/闪电)全是 SMIL——SMIL 不吃 CSS animation:none,唯一可靠手段是不注入。
    //   每次 present 现查(系统偏好可live切换);无 matchMedia(node/旧环境)→ 不剥(向后兼容)。
    function prefersReduced() {
      try { return !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
      catch (e) { return false; }
    }
    function stripSmil(svg) {
      return svg
        .replace(/<animate(?:Transform|Motion)?\b[^>]*\/>/g, '')
        .replace(/<animate(?:Transform|Motion)?\b[^>]*>[\s\S]*?<\/animate(?:Transform|Motion)?>/g, '');
    }
    var lastSvg = null;   // 同节点同内容跳过重建:innerHTML 全量重建会重置全部 SMIL 相位(雾/雨/萤火闪跳)
    function present(snap) {
      var el = resolve();
      if (!el) return;                                  // 无插槽 → 退化,不画
      var scene = snap && snap.view && snap.view.scene;
      var svg = buildSceneSVG(scene);                   // 无 scene → '' → 清空(避免残留上一场景)
      if (gradeAmt != null) svg = gradeSVG(svg, gradeAmt);   // opt-in HSL 冷暖分级后处理(默认 OFF → 字节不变)
      if (prefersReduced()) svg = stripSmil(svg);       // 元素基线属性即停止态(M 组既有约定:停止态可见)
      var pos = snap && snap.pos;
      var posKey = pos ? (pos.map + ':' + pos.node) : null;
      // 同节点 + 产出字节相同(构造是确定性纯函数,M6)→ 跳过 innerHTML:纯动作 re-render 不再把
      //   全部 SMIL 动画推倒重来(相位闪跳/骰子误重放);状态变了(检定结果/elements/mood)→ 字串必变 → 正常重建。
      if (!(posKey === lastPosKey && svg === lastSvg)) el.innerHTML = svg;
      lastSvg = svg;
      // S10 transition:仅"进了新节点"(snap.pos 变)才放一次过场;纯动作 re-render→pos 不变→不重放;cut=直切不放。
      // 注:故意按"节点变了"而非设计稿 §10.2-Q3 的"transition 值变了"——后者会让连续两个同值过场(如皆 fade)漏触发。
      var tr = scene && scene.transition;
      if (tr && tr !== 'cut' && posKey !== lastPosKey) playFx(el, tr);
      lastPosKey = posKey;
    }
    return {
      id: 'svg-presenter',
      install: function (api) { api.addPresenter(present); },  // S11-b-ex:返回 use-able 插件 → engine.use(createSvgPresenter(opts));已删 .plugin
      present: present,
      buildSVG: buildSceneSVG                            // 暴露纯构造器(测试/复用)
    };
  }

  // 视觉路线图 #3:额外暴露 gradeSVG(+ tintHue),供预览/测试用(opt-in 分级的纯函数面)。
  // 契约 v9:暴露 art 渲染纯函数(renderElementArt 派发 / renderArtSpec 校验渲染 / ART_PRESETS 预设清单)供测试/预览。
  return { createSvgPresenter: createSvgPresenter, buildSceneSVG: buildSceneSVG, gradeSVG: gradeSVG, tintHue: tintHue,
    placeElements: placeElements,
    renderElementArt: renderElementArt, renderArtSpec: renderArtSpec, ART_PRESETS: ART_PRESETS };
});
