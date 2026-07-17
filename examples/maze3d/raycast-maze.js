/* ════════════════════════════════════════════════════════════════════════
   raycast-maze.js(maze3d 伪3D 迷宫 runtime)· 本文件在 examples/maze3d/ 与 examples/origin/ 各存一份,须逐字节一致(以 maze3d/ 为正本,改后同步 origin;ZA11 漂移守卫强制)
   ════════════════════════════════════════════════════════════════════════
   认领 node.kind==='maze3d',在节点里跑一段【实时 raycasting 伪 3D 迷宫】(Wolfenstein/Doom 同款
   DDA 光线投射:逐屏幕列投射一条射线、撞墙算距离、画竖墙条,近大远小+距离雾)。自由移动(方向键/WASD
   或屏上按钮连续走动转身)。出口是一扇**发光的门('D' 格,实心挡路)**——走到门前【正对它贴近】即
   接触判定自动推开通关(无需按键:普通出口=走到+正对即触发;**仍要求"正对"**,不是纯距离误判)。
   R1-b1 `examine` 是只读检视线索;R1-b2 `trigger:'interact'` 把改状态事件改成 E/Enter 或“互动”按钮主动触发,进格/贴近只暴露上下文目标。通关一次 api.apply 回写 winKey。

   ── arcade「孤岛」类(同 snake-module;非数据驱动离散模块)──────────────────────
   · Amatlas 核心回合制无帧循环 → 真实时 3D 自带 canvas+rAF+输入,Amatlas 在外包叙事/存档/打包,边界(推门)同步。
   · 隔离:loop 内部态留模块局部 g(不入档);通关一次 api.apply 回写。
   · 闸优雅退化:探针 getElementById 恒 null / jsdom 无完整 canvas 2D → startMaze 拿不到挂载点/绘图方法即 return,
     不起 loop、不崩;可达性/保底出口由 world 数据(node.links:走出=winKey 门控、放弃=无条件)声明式保证。
   · 输入:键盘挂 window(最稳)+ 点画面给页面焦点;屏上 ↰▲▼↱ 按钮(鼠标/触屏,不依赖键盘焦点)。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).Maze3d = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── 确定性 PRNG(逐字复刻 present-svg.js:347-349;同 seed 同序列,禁 Math.random/Date.now)──
  function hashStr(s) { var h = 2166136261 >>> 0; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function lerpRGB(a, b, t) { return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')'; }
  function rgbK(b, k) { var r = b[0] * k, g = b[1] * k, bl = b[2] * k; return 'rgb(' + (r > 255 ? 255 : Math.round(r)) + ',' + (g > 255 ? 255 : Math.round(g)) + ',' + (bl > 255 ? 255 : Math.round(bl)) + ')'; }
  // 自定义怪物外观:校验 + 镜像展开 `art`(等长字符网格)+ `palette`(字符→[r,g,b]);'.'/' '=透明保留。
  //   坏数据 **fail-loud throw**(maze 是 arcade 孤岛、graph-audit/probe/smoke 看不进 → 解析时抛 → boot 错误横幅暴露;同 present-svg parse-don't-validate)。
  //   设计稿 docs/custom-monster-appearance-design.md(用户签字);engine-core/公共契约零改=maze 私有词汇。
  function parseMonsterArt(m, idx) {
    var who = (idx === 'keyArt') ? '钥匙(keyArt)' : (typeof idx === 'string' ? idx : ('怪物[' + idx + ']')), art = m.art, pal = m.palette, rows, w = null, r, c, k;
    if (!Array.isArray(art) || !art.length) throw new Error('[maze art] ' + who + '.art 必须是非空字符串数组');
    rows = art.length;
    for (r = 0; r < rows; r++) {
      if (typeof art[r] !== 'string' || !art[r].length) throw new Error('[maze art] ' + who + '.art 第 ' + r + ' 行必须是非空字符串');
      if (w === null) w = art[r].length;
      else if (art[r].length !== w) throw new Error('[maze art] ' + who + '.art 各行必须等长:第 ' + r + ' 行宽 ' + art[r].length + '、应为 ' + w + '(不自动补齐/裁剪——把每行补到等长)');
    }
    if (!pal || typeof pal !== 'object' || Array.isArray(pal)) throw new Error('[maze art] ' + who + '.palette 必须是 {字符:[r,g,b]} 对象');
    for (k in pal) {
      if (!Object.prototype.hasOwnProperty.call(pal, k)) continue;
      if (k === '.' || k === ' ') throw new Error('[maze art] ' + who + '.palette 不能声明 ' + (k === ' ' ? "' '(空格)" : "'.'") + '——保留给透明');
      var v = pal[k];
      if (!Array.isArray(v) || v.length !== 3) throw new Error('[maze art] ' + who + ".palette['" + k + "'] 必须是 3 个数 [r,g,b]");
      for (c = 0; c < 3; c++) { var n = v[c]; if (typeof n !== 'number' || !isFinite(n) || n !== Math.floor(n) || n < 0 || n > 255) throw new Error('[maze art] ' + who + ".palette['" + k + "'][" + c + '] 必须是 0..255 整数,得到 ' + n); }
    }
    var used = {};
    for (r = 0; r < rows; r++) { var row = art[r]; for (c = 0; c < w; c++) { var ch = row[c];
      if (ch === '.' || ch === ' ') continue;
      if (!Object.prototype.hasOwnProperty.call(pal, ch)) throw new Error('[maze art] ' + who + '.art 第 ' + r + ' 行第 ' + c + " 列字符 '" + ch + "' 未在 palette 声明(补这个键?或改成 '.' 透明)");
      used[ch] = 1;
    } }
    for (k in pal) { if (Object.prototype.hasOwnProperty.call(pal, k) && !used[k] && typeof console !== 'undefined' && console.warn) console.warn('[maze art] ' + who + ".palette['" + k + "'] 声明了但 art 没用到(typo?)"); }
    var full = art;
    if (m.mirror) { full = []; for (r = 0; r < rows; r++) { var rr = art[r]; full.push(rr + rr.split('').reverse().join('')); } w = w * 2; }   // 镜像:左半 + 反转左半 = 左右对称(减半对齐负担、白拿对称)
    if (w > 32 || rows > 32) throw new Error('[maze art] ' + who + '.art 尺寸 ' + w + '×' + rows + ' 超上限 32×32' + (m.mirror ? '(镜像后)' : '') + '——太大盲写易错/rect 暴涨,拆小或简化');
    return { art: full, cols: w, rows: rows, pal: pal };
  }

  // ── 主题库(node.maze.theme 开放词汇选一套;一套同时驱动 地板/天花/墙涂装/门,确保协调)──
  //   T 字段:ceil/floor Near/Far=透视雾两端色;wallBase=墙基色([r,g,b],缺省→走原暖灰公式=中性零变化);
  //   sideScale=侧面衰减;wallTex=墙纹理名;door=门样式名;fogRange=雾深;vignette=可选氛围叠加(步8);
  //   ceilTex=天花结构(缺省→只底雾=默认逐字节不变;'slab'=石方格/'beam'=单向木梁/'rib'=肉肋/'panel'=金属密格)→ render() 里 world-space 投射网格缝=「虚假高度」纵深。
  //   floorTex=地面结构(缺省 null=不画;'slab'=石板/'tile'=瓷砖/'panel'=金属面板/'crack'=冰裂/碎石裂纹)→ 与 ceilTex 同源 floor-cast,给脚下到远处的透视参照线。
  //   decor/decorDensity=主题默认地面碎片(贴地、低矮、不挡路/不可拾取;低密度、确定性、让中景有比例尺;显式 maze.decor 可用 mode:'sprite' 逃生为立牌)。
  //   torch=火把光照(缺省→原线性雾;{range,warm}=二次径向衰减 + 近处暖色偏移 + 8Hz seeded 摇曳 → 玩家自带火把的暖光圈/脚下光池;per-theme opt-in、各主题自定光色,见 docs/torch-lighting-design.md)。
  //   '' = 中性默认:floor/ceil 用现有横带两端色复刻(透视雾全局生效=用户拍板),墙不给 wallBase→原公式逐字节不变。
  var THEMES = {
    '':        { ceilNear: [12, 17, 25], ceilFar: [24, 34, 47], floorNear: [36, 31, 24], floorFar: [58, 52, 42], wallTex: 'none', door: 'glow', fogRange: 9 },
    cave:      { wallBase: [92, 104, 96], sideScale: 0.72, ceilNear: [16, 23, 31], ceilFar: [18, 26, 34], ceilLineK: 0.40, floorNear: [40, 34, 26], floorFar: [26, 30, 30], wallTex: 'stone', door: 'portcullis', fogRange: 9, vignette: true, ceilTex: 'slab', floorTex: 'crack', floorLineK: 0.56, decor: ['moss_patch', 'crystal', 'skull', 'rubble'], decorDensity: 0.035, wallDecor: ['vines', 'growth', 'crack'], wallDecorDensity: 0.085, torch: { range: 0.70, warm: [30, 11, 0] } },
    dungeon:   { wallBase: [122, 86, 70], sideScale: 0.74, ceilNear: [22, 19, 18], ceilFar: [26, 22, 20], ceilLineK: 0.40, floorNear: [58, 50, 40], floorFar: [40, 35, 30], wallTex: 'brick', door: 'iron-bars', fogRange: 10, vignette: true, ceilTex: 'slab', floorTex: 'slab', floorLineK: 0.50, decor: ['rubble', 'skull', 'ash_pile', 'cloth_rags'], decorDensity: 0.035, wallDecor: ['crack', 'arms', 'torch', 'chains', 'sigil'], wallDecorDensity: 0.095, torch: { range: 0.70, warm: [32, 12, 0] } },
    shoji:     { wallBase: [200, 188, 164], sideScale: 0.82, ceilNear: [40, 32, 26], ceilFar: [58, 47, 38], floorNear: [150, 134, 104], floorFar: [118, 106, 84], wallTex: 'shoji', door: 'shoji', fogRange: 11, vignette: true, ceilTex: 'beam', floorTex: 'slab', floorLineK: 0.70, decor: ['paper_scrap', 'wood_splinters', 'cloth_rags'], decorDensity: 0.025, wallDecor: ['posters', 'crack', 'sigil'], wallDecorDensity: 0.045, torch: { range: 0.78, warm: [34, 20, 6] } },
    flesh:     { wallBase: [128, 42, 52], sideScale: 0.70, ceilNear: [34, 15, 23], ceilFar: [46, 18, 28], ceilLineK: 0.42, floorNear: [48, 20, 22], floorFar: [32, 14, 18], wallTex: 'flesh', door: 'sphincter', fogRange: 8, vignette: true, ceilTex: 'rib', floorTex: 'crack', floorLineK: 0.62, decor: ['flesh_nodule', 'bio_film', 'skull'], decorDensity: 0.03, wallDecor: ['tentacle', 'veins', 'growth', 'crack', 'eyes'], wallDecorDensity: 0.13, torch: { range: 0.62, warm: [38, 6, 4] } },
    metal:     { wallBase: [96, 104, 112], sideScale: 0.76, ceilNear: [20, 24, 28], ceilFar: [34, 40, 46], floorNear: [44, 46, 50], floorFar: [30, 33, 37], wallTex: 'plate', door: 'blast-door', fogRange: 10, vignette: true, ceilTex: 'panel', floorTex: 'panel', floorLineK: 0.58, decor: ['cable_coil', 'rust_scraps', 'glass_shards'], decorDensity: 0.03, wallDecor: ['cables', 'pipes', 'vent', 'crack'], wallDecorDensity: 0.085, torch: { range: 0.72, warm: [12, 14, 20] } },
    // ── R1-2 泛用主题(非恐怖向;门发光走 per-theme doorGlow → 冷主题门不再暖橙出戏。设计稿 docs/maze-theme-generalization-design.md)──
    station:   { wallBase: [88, 104, 124], sideScale: 0.80, ceilNear: [16, 22, 34], ceilFar: [28, 38, 56], floorNear: [34, 40, 52], floorFar: [22, 27, 38], wallTex: 'tile', door: 'blast-door', fogRange: 11, vignette: true, ceilTex: 'panel', floorTex: 'panel', floorLineK: 0.58, decor: ['cable_coil', 'rust_scraps', 'glass_shards'], decorDensity: 0.03, wallDecor: ['cables', 'pipes', 'vent', 'crack'], wallDecorDensity: 0.085, torch: { range: 0.74, warm: [8, 14, 22] }, doorGlow: [120, 210, 235] },   // 太空站:冷蓝金属舱 + 冷光削弱照明(Blake Stone/System Shock);复用 tile+blast-door,亮青门光
    ice:       { wallBase: [150, 195, 215], sideScale: 0.82, ceilNear: [30, 42, 58], ceilFar: [50, 70, 92], floorNear: [165, 190, 205], floorFar: [120, 150, 175], wallTex: 'ice', door: 'glow', fogRange: 11, vignette: true, ceilTex: 'slab', floorTex: 'crack', floorLineK: 0.76, decor: ['ice_chips', 'crystal', 'gem'], decorDensity: 0.025, wallDecor: ['crack', 'growth'], wallDecorDensity: 0.06, doorGlow: [150, 220, 245] },   // 冰窟:光泽冰面(专属 wallTex 'ice':光滑冰壁+树枝状裂纹网+冷白霜光高光,差异化 cave 的小块粗石 stone)+ 冷亮无暖光(EOB2 aqua glossy)、关 torch,冷青白门光
    clinic:    { wallBase: [158, 184, 170], sideScale: 0.84, ceilNear: [48, 56, 54], ceilFar: [70, 80, 76], floorNear: [120, 134, 128], floorFar: [88, 100, 96], wallTex: 'smalltile', door: 'glow', fogRange: 12, vignette: false, ceilTex: 'panel', floorTex: 'tile', floorLineK: 0.72, decor: ['glass_shards', 'paper_scrap', 'cloth_rags'], decorDensity: 0.025, wallDecor: ['pipes', 'posters', 'crack'], wallDecorDensity: 0.06, doorGlow: [190, 230, 205] },   // 医院:无菌薄荷绿釉砖 + 平冷荧光无暗角(Silent Hill 2 冷蓝绿=暗牢反面);专属 wallTex 'smalltile'(密网小白瓷砖+亮白洁净填缝,与 station 大砖格 tile 明显差分),淡绿白门光
    // ── R1-2 第二批(设计稿 docs/maze-theme-generalization-design.md + docs/maze-themes-batch2-design.md 批2a)──
    industrial: { wallBase: [104, 96, 78], sideScale: 0.76, ceilNear: [18, 20, 16], ceilFar: [32, 34, 27], floorNear: [40, 38, 30], floorFar: [26, 25, 20], wallTex: 'panel', door: 'blast-door', fogRange: 10, vignette: true, ceilTex: 'panel', floorTex: 'panel', floorLineK: 0.56, wearLevel: 0.75, decor: ['rust_scraps', 'cable_coil', 'glass_shards'], decorDensity: 0.032, wallDecor: ['pipes', 'cables', 'vent', 'crack'], wallDecorDensity: 0.10, torch: { range: 0.66, warm: [26, 12, 2] }, doorGlow: [200, 90, 30] },   // 工业废墟:锈橄榄灰金属 + 高 wearLevel 战损感(Half-Life idbase/Quake 工业区锈蚀铆钉);复用 tile+blast-door,暗橙警示门光(与 station 亮青对拉)、暖锈色摇曳灯代替冷光
    tomb:      { wallBase: [176, 148, 96], sideScale: 0.80, ceilNear: [30, 24, 15], ceilFar: [46, 38, 25], ceilLineK: 0.40, floorNear: [96, 80, 52], floorFar: [66, 55, 36], wallTex: 'sandstone', door: 'archway', fogRange: 10, vignette: true, ceilTex: 'slab', floorTex: 'crack', floorLineK: 0.54, decor: ['rubble', 'bone_shards', 'ritual_marks'], decorDensity: 0.035, wallDecor: ['sigil', 'crack'], wallDecorDensity: 0.09, torch: { range: 0.70, warm: [36, 16, 4] } },   // 古墓:暖沙黄石(PowerSlave/Serious Sam Temple of Hatshepsut)+ archway 厚石框出口 + sigil 线刻符带≈象形文字;复用 stone,暖火把光(非 dungeon 暖红棕、非冷色)
    // ── R1-2 第二批2b(设计稿 docs/maze-themes-batch2-design.md 批2b;红队 FIX 已补精确 RGB 表)──
    crystal:   { wallBase: [86, 62, 118], sideScale: 0.80, ceilNear: [26, 16, 46], ceilFar: [42, 26, 74], ceilLineK: 0.40, floorNear: [54, 40, 84], floorFar: [36, 26, 58], wallTex: 'crystal', door: 'portal', fogRange: 11, vignette: true, ceilTex: 'slab', floorTex: 'crack', floorLineK: 0.70, decor: ['crystal_cluster', 'ice_chips', 'gem'], decorDensity: 0.040, wallDecor: ['crystals', 'growth', 'crack'], wallDecorDensity: 0.09, doorGlow: [170, 120, 235] },   // 水晶洞:冷紫晶洞石(Grimrock 2 Crystal Mine)+ portal 竖裂隙出口(能量感)+ 紫色门光(与 GLYPHS.crystal[150,120,225]同族=环境/拾取物色语义一致);复用 stone,**关 torch**(同 ice 先例·防暖光浑浊冷紫调)、新 wallDecor 'crystals' 半透明切面晶簇差异化 ice(冷紫 R-G>0 vs ice R-G<0、更亮更饱和,详设计稿 §开放问题4)
    neon:      { wallBase: [46, 32, 74], sideScale: 0.78, ceilNear: [11, 4, 27], ceilFar: [10, 20, 55], floorNear: [24, 14, 42], floorFar: [10, 10, 30], wallTex: 'circuit', door: 'portal', fogRange: 10, vignette: true, ceilTex: 'panel', floorTex: 'panel', floorLineK: 0.58, decor: ['cable_coil', 'glass_shards'], decorDensity: 0.030, wallDecor: ['cables', 'crack'], wallDecorDensity: 0.08, doorGlow: [225, 58, 106] },   // 赛博霓虹:近黑深蓝紫底 + 新 wallTex 'circuit'(暗面板+自发光青/品红竖线,技法=暗底+灯光注入非整墙染色)+ portal 门(复用)+ 品红门光(Lospec Cyberpunk Neons 11 色板已核:#0b001b/#08173d 底、#53ebe4 青、#e13a6a 品红→RGB);**关 torch**(霓虹=冷人工光非暖火把,同 station/ice/clinic 先例)
    // ── R1-2 第二批2c(设计稿 docs/maze-themes-batch2-design.md 批2c;金属系第 4 员——靠幽绿冷灰底 + 幽绿门光 + 新门 wheel-hatch + 加重雾拉开 metal/station/industrial)──
    submarine: { wallBase: [66, 100, 88], sideScale: 0.78, ceilNear: [10, 18, 16], ceilFar: [18, 34, 30], floorNear: [22, 34, 30], floorFar: [12, 20, 18], wallTex: 'hull', door: 'wheel-hatch', fogRange: 9, fogTint: [14, 26, 24], fogMix: 0.60, vignette: true, ceilTex: 'panel', floorTex: 'panel', floorLineK: 0.58, wearLevel: 0.70, decor: ['rust_scraps', 'cable_coil', 'ice_chips'], decorDensity: 0.030, wallDecor: ['pipes', 'cables', 'vent', 'crack'], wallDecorDensity: 0.095, torch: { range: 0.72, warm: [6, 16, 14] }, doorGlow: [90, 200, 160] }   // 潜艇:幽绿冷灰底(G 为主导通道,G-max(R,B)=+12>0,与 metal 中性灰[96,104,112]/station 冷蓝[88,104,124]/industrial 暖锈[104,96,78]三两两可分——三者该判据均<0)+ wearLevel 0.70 锈蚀铆接(Iron Lung/System Shock 2 Von Braun)+ fogRange 9(略密于 metal/station 的 10/11,同 industrial 相近)+ fogTint/fogMix 加重深海压迫(远墙向幽绿雾淡入更快)+ 亮度锚在与三金属系同一量级(近墙不发暗,核可玩能见度)+ 新门 wheel-hatch(圆舱门+十字轮阀+密封铆接环)+ 幽绿门光(与墙底同族但更亮更饱和,复用暖橙金公式的冷色路径)、torch.warm 走冷幽绿(非真暖光,同 station 个人光源惯例)
  };

  // ── 命名物品库(GLYPHS;maze 私有词汇,同 monsters/keyArt——不进公共契约)────────────────────────
  //   作者用 `keyIcon:'gem'` / `events[i].icon:'scroll'` 即得对应程序化精灵,不必手画。每条=一套 art/palette 像素网格
  //   (与 keyArt/monsters 自定义外观【同格式同校验】)→ 经 parseMonsterArt 校验 → 走现有 artLayers 渲染(零新增渲染码)。
  //   设计抉择:用【数据表 + 复用 artLayers】而非 if-else glyphLayers 或 registerGlyph() API ——更"数据驱动"、更少代码、
  //   16 个 glyph 当数据维护远易于 16 个手写 fillRect;本文件已有 THEMES/FORMANT_SEQ 内部数据表先例(§10 红线指"别建可扩展插件 API",静态数据表不是那个)。
  //   固定语义调色板(金钥匙/红血瓶/冷蓝卡):语义物品有固有色,固定色更易辨,faceFog 距离雾自然融进场景(不写 6×N 主题配色矩阵=§10)。
  //   默认金钥匙保留手工 fillRect 的 keyLayers(品质更高),仅作 'key' 别名/缺省;其余 glyph 走 art-grid。设计稿 docs/maze-item-library-design.md。
  var GLYPHS = {
    keycard:  { art: ['.HHHHHHHH.', 'HCCCCCCCCH', 'HCPPCCMMCH', 'HCPPCCMMCH', 'HCCCCCCCCH', '.HHHHHHHH.'],
                palette: { H: [120, 130, 145], C: [178, 188, 202], P: [70, 150, 195], M: [44, 48, 58] } },          // 科技:卡片+照片区+磁条
    bone_key: { art: ['.BBB....', 'BBBBB...', 'BB.BB...', 'BBBBB...', '.BBB....', '..B.....', '..B.....', '..BBB...', '..B.B...'],
                palette: { B: [224, 216, 196] } },                                                                   // 恐怖/地牢:骨白钥匙(圆头带孔+柄+齿)
    gem:      { art: ['...G...', '..GGG..', '.GGGGG.', 'GGGGGGG', '.WGGGW.', '..GGG..', '...G...'],
                palette: { G: [80, 200, 170], W: [200, 255, 235] } },                                                // 古墓/宝物:多面宝石
    crystal:  { art: ['..W..', '.WCW.', '.WCC.', 'WCCCW', 'WCCCW', '.CCC.', '.CCC.', '..C..'],
                palette: { C: [150, 120, 225], W: [225, 205, 255] } },                                               // 奇幻:竖立水晶簇
    coin:     { art: ['.YYYY.', 'YGGGGY', 'YGGWGY', 'YGGGGY', 'YGGGGY', '.YYYY.'],
                palette: { Y: [210, 170, 60], G: [235, 200, 90], W: [255, 240, 180] } },                             // 宝物:暖金圆币+高光
    scroll:   { art: ['EPPPPPPE', 'EPttttPE', 'EPPPPPPE', 'EPttttPE', 'EPPPPPPE', 'EPPPPPPE'],
                palette: { E: [120, 90, 50], P: [225, 210, 165], t: [140, 110, 70] } },                             // 文件/线索:卷轴+卷边+文字横线
    note:     { art: ['WWWWWW', 'WtttWW', 'WWWWWW', 'CCCCCC', 'WtttWW', 'WWWWWW'],
                palette: { W: [235, 232, 222], t: [120, 120, 120], C: [180, 178, 170] } },                          // 文件/线索:折叠便条+折痕
    photo:    { art: ['.WWWWWW.', 'WWFFFFWW', 'WFFFBFFW', 'WFBBBFFW', 'WBBBBFWW', '.WbBWWW.', '..bb....'],
                palette: { W: [214, 208, 192], F: [124, 118, 106], B: [150, 26, 20], b: [92, 16, 13] } },           // 恐怖/线索:照片+偏左下不规则血迹+血滴
    tape:     { art: ['DDDDDDDD', 'DLLLLLLD', 'DOOddOOD', 'DOOddOOD', 'DDDDDDDD', '.DDDDDD.'],
                palette: { D: [55, 58, 66], L: [150, 150, 160], O: [90, 94, 104], d: [30, 32, 38] } },              // 科技/恐怖:磁带壳+双卷盘
    vial:     { art: ['.CC..', '.NN..', '.GG..', 'GLLG.', 'GLLHG', 'GLLLG', 'GLLLG', '.GGG.'],
                palette: { C: [150, 110, 70], N: [180, 200, 210], G: [150, 200, 215], L: [200, 40, 40], H: [255, 180, 180] } },  // 消耗品:瓶塞+瓶颈+红液+高光
    rune:     { art: ['SSRSSSS', 'SSRRSSS', 'SSRSRSS', 'SSRSSRS', 'SSRSRSS', 'SSRRSSS', 'SSRSSSS'],
                palette: { S: [90, 92, 98], R: [210, 90, 40] } },                                                    // 谜题:石板+角形符文刻痕(ᚦ 形,非十字)
    idol:     { art: ['..III..', '.IIIII.', '.IHHI..', '.IIIII.', '..III..', '.IIIII.', 'IIIIIII', '.IIIII.', '.II.II.'],
                palette: { I: [150, 140, 110], H: [70, 60, 45] } },                                                  // 谜题/宝物:神像剪影
    lantern:  { art: ['..HH..', '.M..M.', '.MMMM.', 'MFFFFM', 'MFOOFM', 'MFFFFM', '.MMMM.', '..MM..'],
                palette: { H: [120, 110, 90], M: [90, 80, 60], F: [255, 200, 90], O: [255, 150, 40] } },            // 光源:灯框+内核暖光+提梁
    battery:  { art: ['.TT..', 'BBBBB', 'BGGGB', 'BGGGB', 'BBBBB', 'BGGGB', 'BGGGB', 'BBBBB'],
                palette: { T: [200, 205, 215], B: [40, 120, 190], G: [120, 230, 255] } },                           // 科技:电池+正极+电量条
    skull:    { art: ['.SSSSS.', 'SSSSSSS', 'SHHSHHS', 'SSSSSSS', 'SSNSNSS', '.SS.SS.'],
                palette: { S: [220, 214, 196], H: [40, 36, 32], N: [90, 84, 76] } },                                // 恐怖/地牢:头骨+眼窝+齿
    compass:  { art: ['...G...', '..GGG..', '.G.G.G.', 'GGGCGGG', '.G.G.G.', '..GGG..', '...G...'],
                palette: { G: [60, 190, 110], C: [210, 255, 225] } }                                                 // 机关·转向:翠绿罗盘玫瑰(四向星)=方向/旋转语义
  };
  // ── 机关默认视觉(ACTION_GLYPH;maze 私有内部表,同 THEMES/KEY_HUD_EMOJI——§10 静态表非可扩展 API)────────────
  //   set/warp/turn 机关没写 icon/art 时,按动作类型取一个 glyph 的【语义色】,但默认不再画竖牌:机关=贴地 marker/plate,
  //   可拾取物=竖立 token,装饰=低亮 floor clutter。这个三分法来自端用户反馈+Dungeon Master/Grimrock 调研:板是地面结构,物品是独立物体。
  //   set→rune(石板刻痕暖橙)/ warp→crystal(冷紫传送)/ turn→compass(翠绿方向)。作者可显式 visual:'pickup' 或 icon/art 走 pickup 逃生口;纯 hint 默认无可见物。
  var ACTION_GLYPH = { set: 'rune', warp: 'crystal', turn: 'compass' };
  var EVENT_VISUALS = { pickup: 1, 'floor-pickup': 1, 'wall-pickup': 1, marker: 1, plate: 1, trap: 1, none: 1 };
  // ── 地面/墙面环境装饰语义表(maze 私有表现层,不是公共契约)──
  //   floor decor 仍是「贴地、低亮、不可拾取、非机关」:这里把既有 GLYPH/主题名映射到可辨认的小物件族,不从 run/hint/flag 猜语义。
  //   wall decor 是贴墙物件(vines/tentacle/crack/arms/torch/cables/chains/pipes/vent/posters/growth/veins/sigil/eyes/teeth),只画在墙体中上段,不改变碰撞/光照/玩法。
  var FLOOR_DECOR_FAMILIES = { bone_shards: 1, rubble: 1, paper_scrap: 1, cable_coil: 1, moss_patch: 1, flesh_nodule: 1, crystal_cluster: 1, glass_shards: 1, rust_scraps: 1, wood_splinters: 1, cloth_rags: 1, ash_pile: 1, ice_chips: 1, bio_film: 1, ritual_marks: 1 };
  var FLOOR_DECOR_ALIAS = {
    skull: 'bone_shards', bone_key: 'bone_shards', rune: 'ritual_marks', idol: 'rubble', coin: 'rubble', lantern: 'ash_pile', compass: 'rubble',
    scroll: 'paper_scrap', note: 'paper_scrap', photo: 'paper_scrap', tape: 'cable_coil', battery: 'cable_coil', keycard: 'cable_coil',
    crystal: 'crystal_cluster', gem: 'crystal_cluster', vial: 'glass_shards', key: 'rubble',
    moss_patch: 'moss_patch', rubble: 'rubble', bone_shards: 'bone_shards', paper_scrap: 'paper_scrap', cable_coil: 'cable_coil', flesh_nodule: 'flesh_nodule', crystal_cluster: 'crystal_cluster', glass_shards: 'glass_shards', rust_scraps: 'rust_scraps', wood_splinters: 'wood_splinters', cloth_rags: 'cloth_rags', ash_pile: 'ash_pile', ice_chips: 'ice_chips', bio_film: 'bio_film', ritual_marks: 'ritual_marks'
  };
  var FLOOR_DECOR_THEME_FALLBACK = { cave: 'moss_patch', dungeon: 'rubble', shoji: 'paper_scrap', flesh: 'flesh_nodule', metal: 'cable_coil', station: 'cable_coil', ice: 'crystal_cluster', clinic: 'glass_shards' };
  var WALL_DECOR_KINDS = { vines: 1, tentacle: 1, crack: 1, arms: 1, torch: 1, cables: 1, chains: 1, pipes: 1, vent: 1, posters: 1, growth: 1, veins: 1, sigil: 1, eyes: 1, teeth: 1, crystals: 1 };
  var EXIT_STYLES = { glow: 1, portcullis: 1, 'iron-bars': 1, shoji: 1, sphincter: 1, 'blast-door': 1, archway: 1, portal: 1, stairs: 1, elevator: 1, 'wheel-hatch': 1 };
  function normalizeExitStyle(style, who) {
    if (style == null || style === '') return null;
    if (typeof style !== 'string' || !Object.prototype.hasOwnProperty.call(EXIT_STYLES, style)) throw new Error('[maze exit] ' + who + " 必须是 'glow'/'portcullis'/'iron-bars'/'shoji'/'sphincter'/'blast-door'/'archway'/'portal'/'stairs'/'elevator'/'wheel-hatch' 之一,得到 " + style);
    return style;
  }
  var PILLAR_STYLES = { stone: 1, ruined: 1, obelisk: 1, crystal: 1, wood: 1, metal: 1 };
  function normalizePillarStyle(style, who) {
    if (style == null || style === '') return null;
    if (typeof style !== 'string' || !Object.prototype.hasOwnProperty.call(PILLAR_STYLES, style)) throw new Error('[maze pillars] ' + who + " 必须是 'stone'/'ruined'/'obelisk'/'crystal'/'wood'/'metal' 之一,得到 " + style);
    return style;
  }
  function floorDecorFamily(icon, theme) {
    if (theme === 'flesh' && icon === 'vial') return 'flesh_nodule';
    return FLOOR_DECOR_ALIAS[icon] || FLOOR_DECOR_THEME_FALLBACK[theme] || 'rubble';
  }
  // ── 各主题漫游氛围句(THEME_IDLE;maze 私有内部表)──HUD 无事件时显示,替换生硬命令式"走动转身找门"。
  //   用第二人称环境观察句把"该去哪"藏进场景感知(show don't tell,参 Outer Wilds/Antichamber);作者可写 maze.idleHint 覆盖。
  var THEME_IDLE = {
    '':      '走廊在你面前延伸,远处似乎有什么在静静等待……',
    cave:    '石壁的冷意顺着脚底爬上来,远处似乎有微光在呼吸……',
    dungeon: '火把把影子投在墙上扭动,走廊深处透来一线凉风。',
    shoji:   '纸障后透出朦胧的光晕,脚下的木板轻轻作响。',
    flesh:   '墙壁在你的呼吸间微微起伏,温热而潮湿地裹着你。',
    metal:   '金属回廊里嗡嗡低鸣,通风口送来一阵说不清来路的冷风。',
    station: '舱壁的金属泛着冷光,通风系统的低鸣是这片走廊唯一的声响。',
    ice:     '冰封的墙壁折射出幽蓝微光,你的呼吸在面前凝成白雾。',
    clinic:  '走廊的荧光灯白得发冷,脚步声在光洁的瓷砖上清晰地回响。',
    industrial: '锈蚀的管道在头顶蜿蜒,某处阀门在滴水,远处金属结构发出沉闷的呻吟。',
    tomb:    '砂岩壁上的刻痕在火光里若隐若现,空气干涩,尘封了不知多少岁月。',
    crystal: '晶簇在幽暗中泛着紫光,你的脚步声被折射成细碎的回响。',
    neon:    '霓虹沿着墙面的电路纹路流淌,青与品红在黑暗里明明灭灭。',
    submarine: '舱壁渗着水珠,幽绿的应急灯下,深海的压力在钢板外无声地挤压。'
  };
  // glyph 代表色(取 palette 里最饱和的色=语义色,供机关呼吸光晕用;rune→暖橙/crystal→紫/compass→绿)。纯函数、禁 Math.random。
  function glyphTint(pal) { if (!pal) return null; var best = null, bs = -1, k; for (k in pal) { if (!Object.prototype.hasOwnProperty.call(pal, k)) continue; var c = pal[k]; if (!Array.isArray(c) || c.length < 3) continue; var sat = Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]); if (sat > bs) { bs = sat; best = c; } } return best ? [best[0], best[1], best[2]] : null; }
  // HUD 文案 emoji(钥匙提示):按 `maze.keyIcon` 派生 → 与 3D 实物视觉一致(治"实物是宝石、HUD 提示却说🔑"接缝)。
  //   表里没的(或 maze.keyArt 自绘、keyIcon 未填)→ 回退 🔑(默认金钥匙)。要自定义新名→在自定义 maze.icons 同时加这表(下游扩展接口)。
  var KEY_HUD_EMOJI = {
    keycard: '💳', bone_key: '🦴', gem: '💎', crystal: '💠', coin: '🔶',
    scroll: '📜', note: '📝', tape: '📼', vial: '🧪', rune: '🔮',
    idol: '🗿', lantern: '🏮', battery: '🔋', skull: '💀'
  }; // keycard→💳/coin→🔶/rune→🔮 替换 Emoji 13/14 冷门码位(Android Noto/Win10 Segoe 可能 tofu);▲▼←→💎🦴等覆盖良好保留
  function resolveKeyHudEmoji(maze) { return (maze && maze.keyIcon && KEY_HUD_EMOJI[maze.keyIcon]) || '🔑'; }
  // ── 假高度墙(R1-3 多层装饰):墙按格坐标得「视觉高度」scale≥1(纯渲染、锚脚向上拉伸;碰撞/可达零改=grid 数据不变)──
  //   三档:maze.wallScale(整场景等比拔高=大厅/高墙感,≥1,全场统一高度=无逐格阶梯) > maze.wallHeights{"x,y":scale} 逐格精确标(场景内局部中庭/塔) > 缺省=平整。
  //   【评估后移除逐格随机起伏】:raycaster 每格只能画单一高度,相邻格不同高=阶梯(非平滑斜坡)→ 窄走廊里读作「乱」+ 踢脚线高度不齐 + 砖纹课错位切块,不读作纵深;真纵深靠地面棋盘/格缝/透视/雾。maze.flatWalls=true 仍可显式声明平整(=现默认)。
  function wallScaleAt(maze, cx, cy) {
    if (!maze || maze.flatWalls) return 1;
    var wh = maze.wallHeights;
    if (wh) { var v = wh[cx + ',' + cy]; if (v != null) { var wv = +v; return Math.max(1, isFinite(wv) ? wv : 1); } }   // 逐格作者标(≥1;非数字/Infinity 回退 1=防 dH=Infinity 静默黑条)优先
    return Math.max(1, +maze.wallScale || 1);   // 缺省 1=平整;maze.wallScale=整场景等比拔高(大厅/高墙感,≥1)→ 全场统一墙高=无逐格阶梯乱、踢脚线齐、砖纹课对齐;要场景内局部中庭/塔才用 maze.wallHeights 逐格标
  }
  // 场景房高 = 天花板平面高度(真·穹顶:天花 cast 随 wallScale 升 + 柱子顶到天花)。只取 per-scene wallScale(天花是 per-row cast、无法逐列区分 per-cell wallHeights);flatWalls/无 wallScale → 1=普通房。
  function sceneCeilH(maze) { return (!maze || maze.flatWalls) ? 1 : Math.max(1, +maze.wallScale || 1); }

  // icon 名 → 解析结果:{art,cols,rows,pal}=glyph(自定义表或内置库)| 'key'=显式默认金钥匙(keyLayers)| null=未指定/空/未知
  //   (退化:钥匙→keyLayers 金钥匙;事件→无精灵但 hint 仍工作)。未知名 warn(列已知名单,从表键动态读=防漂移 lessons 77);非字符串 throw(形态错 §11)。
  //   custom=作者自定义物品表 `maze.icons`(下游扩展接口,**先查它再查内置**=可新增也可同名覆盖;同 keyArt 一样纯数据、不动引擎)。
  function resolveIcon(icon, who, custom) {
    if (icon == null || icon === '') return null;
    if (typeof icon !== 'string') throw new Error('[maze icon] ' + who + '.icon 必须是字符串(物品名,如 keycard/gem/scroll… 或你 maze.icons 里自定义的名),得到 ' + (typeof icon));
    if (custom && Object.prototype.hasOwnProperty.call(custom, icon)) return parseMonsterArt(custom[icon], 'maze.icons["' + icon + '"]');   // 作者自定义/覆盖优先(坏数据 throw→boot 横幅)
    if (icon === 'key') return 'key';
    if (Object.prototype.hasOwnProperty.call(GLYPHS, icon)) return parseMonsterArt(GLYPHS[icon], '物品[' + icon + ']');
    if (typeof console !== 'undefined' && console.warn) console.warn('[maze icon] ' + who + ' 未知物品名 "' + icon + '" → 退化(钥匙=金钥匙、事件=无精灵)。已知:key/' + Object.keys(GLYPHS).join('/') + (custom ? '/' + Object.keys(custom).join('/') + '(自定义)' : ''));
    return null;
  }

  var PUZZLE_STYLE_ID = 'amatlas-maze-puzzle-style';
  var PUZZLE_CSS =
    ':where(.amatlas-maze-puzzle-overlay){position:absolute;inset:0;z-index:4;display:none;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;background:rgba(0,0,0,.42);background:color-mix(in srgb,var(--amatlas-bg,#0c1119) 72%,transparent);pointer-events:auto;touch-action:none;-webkit-user-select:none;user-select:none}' +
    ':where(.amatlas-maze-puzzle-active) :where(.amatlas-maze-controls){visibility:hidden;pointer-events:none}' +
    ':where(.amatlas-maze-puzzle-dialog){width:min(92%,400px);max-height:calc(100% - 24px);overflow:auto;overscroll-behavior:contain;border:1px solid var(--amatlas-line,#263449);border-radius:calc(var(--amatlas-radius,12px) + 2px);background:var(--amatlas-panel,#121a26);box-shadow:0 18px 60px var(--amatlas-shadow,rgba(0,0,0,.55));padding:18px;box-sizing:border-box;color:var(--amatlas-ink,#e8edf4);font:15px/1.5 var(--amatlas-ui-font,system-ui,sans-serif);text-align:left}' +
    ':where(.amatlas-maze-puzzle-prompt){font-weight:700;margin:0 0 12px;font-size:16px}' +
    ':where(.amatlas-maze-puzzle-readout){min-height:44px;box-sizing:border-box;padding:10px 12px;margin-bottom:12px;border-radius:var(--amatlas-radius,12px);background:var(--amatlas-panel-2,#172334);color:var(--amatlas-accent,#b89b6a);text-align:center;font-weight:700;letter-spacing:.08em}' +
    ':where(.amatlas-maze-puzzle-controls){display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:12px}' +
    ':where(.amatlas-maze-puzzle-button){appearance:none;min-width:44px;height:44px;box-sizing:border-box;padding:0 12px;border-radius:var(--amatlas-radius,9px);border:1px solid var(--amatlas-line,#263449);background:var(--amatlas-panel-2,#172334);color:var(--amatlas-ink,#e8edf4);font:600 15px/1 var(--amatlas-ui-font,system-ui,sans-serif);cursor:pointer;touch-action:manipulation}' +
    ':where(.amatlas-maze-puzzle-button):hover{border-color:var(--amatlas-accent,#b89b6a)}' +
    ':where(.amatlas-maze-puzzle-button):focus-visible{outline:3px solid var(--amatlas-accent-2,#6a8fa8);outline-offset:2px}' +
    ':where(.amatlas-maze-puzzle-toggle[aria-pressed="true"]){background:var(--amatlas-accent-2,#6a8fa8);color:var(--amatlas-bg,#0c1119);border-color:var(--amatlas-accent-2,#6a8fa8)}' +
    ':where(.amatlas-maze-puzzle-feedback){min-height:24px;margin:2px 0 10px;color:var(--amatlas-danger,#c87b6a);text-align:center}' +
    ':where(.amatlas-maze-puzzle-actions){display:flex;gap:8px;justify-content:flex-end}' +
    ':where(.amatlas-maze-puzzle-confirm){background:var(--amatlas-accent,#b89b6a);color:var(--amatlas-bg,#0c1119);border-color:var(--amatlas-accent,#b89b6a)}';

  function injectPuzzleStyles(doc) {
    if (!doc || !doc.head || !doc.createElement) return;
    if (doc.getElementById && doc.getElementById(PUZZLE_STYLE_ID)) return;
    var style = doc.createElement('style');
    if (!style) return;
    style.id = PUZZLE_STYLE_ID;
    style.textContent = PUZZLE_CSS;
    if (doc.head.insertBefore) doc.head.insertBefore(style, doc.head.firstChild);
    else if (doc.head.appendChild) doc.head.appendChild(style);
  }

  function createMaze3dModule(opts) {
    opts = opts || {};
    var STAGE = opts.stageId || 'maze3d-stage';
    var MIMIC_VOICE = opts.mimicVoice || 'formant';   // 伪人「开口」声:'formant'(A·默认·formant+韵律错·可控确定·能加混响) | 'speech'(B·Web Speech 真人嗓·靠"怪脸×真人嗓"反差·跨机器嗓不一/不能加混响/非确定,无 voice 回退 formant)
    var CW = opts.width || 480, CH = opts.height || 300;
    var FOV = (opts.fov || 66) * Math.PI / 180;
    var MOVE = opts.moveSpeed || 2.6;     // 格/秒
    var TURN = opts.turnSpeed || 2.7;     // 弧度/秒
    var ENABLE_AUDIO = opts.audio !== false;       // gallery 静态预览可关内部 AudioContext;正式 demo 默认保持有声
    var ENABLE_CONTROLS = opts.controls !== false; // gallery 一页多 canvas 时关掉方向键/按钮/全屏/HUD,避免 UI 堆叠
    var STATIC_PREVIEW = opts.staticPreview === true; // gallery 用:渲染首帧后冻结,不持续 rAF
    var RAD = 0.22;                       // 碰撞半径(格)

    var api = null, rafId = 0, running = false, loopGeneration = 0, hostDoc = null;
    var globalListeners = [], sessionTeardown = null, sessionStage = null;   // 当前迷宫局拥有的 window/document listener、沉浸态与 stage；统一登记，stop 精确撤回
    var hudEl = null, interactBtn = null, puzzleOverlayEl = null;   // HUD 提示=挂在 stage 内、悬在画面顶部的 DOM 浮层;interactBtn=R1-b 上下文按钮,有 examine 或 trigger:'interact' 目标时显;puzzleOverlayEl=R1-b4 私有谜题面板。module 级供 stop 清理。
    var hbCtx = null, hbMaster = null;   // 靠近怪物的"心跳":模块内 AudioContext(arcade 孤岛自带实时声;module 级供 stop() 关闭)
    var proxBus = null, proxFace = null, proxPanner = null, proxRearGain = null, proxRearFilter = null, proxRearConv = null;   // 靠近时按鬼类型的特有压迫 ambience(连续 drone,gain ∝ 靠近度);proxPanner=左右声像;proxRear*=身后湿声暗示支路(非 HRTF,只补前后歧义);随 hbCtx 关闭销毁
    var ambBus = null;   // 常驻氛围床(主角喘息 + 低频 room tone;全程播、不靠近也有=压迫/沉浸;随 hbCtx 关闭销毁)
    var tensionBus = null;   // 高频细弦张力层(常驻建一次,gain ∝ 靠近度由 loop 驱动;高频带=不掩低 drone;随 hbCtx 关闭销毁)

    function dirToAngle(ch) { return { N: -Math.PI / 2, E: 0, S: Math.PI / 2, W: Math.PI }[(ch || 'N').toUpperCase()] || 0; }
    function faceDx(face) { return face === 'W' ? -1 : face === 'E' ? 1 : 0; }
    function faceDy(face) { return face === 'N' ? -1 : face === 'S' ? 1 : 0; }
    function oppositeFace(face) { return { N: 'S', S: 'N', E: 'W', W: 'E' }[face] || 'S'; }
    function cellAt(grid, cx, cy) { if (cy < 0 || cy >= grid.length) return '#'; var row = grid[cy] || ''; if (cx < 0 || cx >= row.length) return '#'; return row[cx]; }
    function isWall(grid, cx, cy) { var c = cellAt(grid, cx, cy); return c === '#' || c === 'D'; }   // 门 'D' 也是实心(挡路、可见、可交互)
    function isDoor(grid, cx, cy) { return cellAt(grid, cx, cy) === 'D'; }
    var CHASE = 2.0;   // 怪物追逐速度(格/秒;< 玩家 2.6 → 可逃,但会被逼近/拐角堵=被猎杀感)
    // ── 靠近怪物 → 心跳渐强渐快(proximity;模块内 Web Audio 实时出声=arcade 孤岛,§八)──
    function hbEnsure() {
      if (!ENABLE_AUDIO) return null;
      if (hbCtx) return hbCtx;
      var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return null;
      try { hbCtx = new AC(); hbMaster = hbCtx.createGain(); hbMaster.gain.value = 1.5; hbMaster.connect(hbCtx.destination);
        if (hbCtx.createStereoPanner) { proxPanner = hbCtx.createStereoPanner(); proxPanner.pan.value = 0; proxPanner.connect(hbMaster); }   // 最近怪压迫 drone 的方位声像(L/R);老浏览器无 createStereoPanner → proxPanner 留 null、buildProxAmb 直连 hbMaster 退化(同 present-audio bgsPanner 先例);声像效果留耳机实听
      } catch (e) { hbCtx = null; }
      return hbCtx;
    }
    function hbMuted() { try { return typeof localStorage !== 'undefined' && localStorage.getItem('amatlas-muted') === '1'; } catch (e) { return false; } }
    // ★ 首次用户手势里【同步】创建+resume AudioContext。严格浏览器 / file:// 只认手势事件处理器里同步调的 resume,
    //   不认 rAF loop 里的(Chrome sticky-activation 宽松、但 Edge/Firefox/file:// 可能严格)→ 否则真机永远静音(mock/headless 测不到=旧"mock 验过没真机出声"的根因)。挂在键盘/画布/按钮手势上。
    function unlockAudio() {
      if (hbMuted()) return;
      if (hbEnsure() && hbCtx.resume) { try { hbCtx.resume(); } catch (e) {} }
    }
    function hbBeat(vol) {                                       // 一记心跳(低频体 + 中频"咚";靠近→ vol 升、节律由 loop 控)
      if (!hbEnsure() || hbMuted()) return;
      if (hbCtx.resume) { try { hbCtx.resume(); } catch (e) {} }
      var tt = hbCtx.currentTime;
      var lo = hbCtx.createOscillator(), lg = hbCtx.createGain(); lo.type = 'sine';
      lo.frequency.setValueAtTime(82, tt); if (lo.frequency.exponentialRampToValueAtTime) lo.frequency.exponentialRampToValueAtTime(46, tt + 0.13);
      lg.gain.setValueAtTime(vol, tt); lg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.18);
      lo.connect(lg); lg.connect(hbMaster); lo.start(tt); lo.stop(tt + 0.2);
      var mid = hbCtx.createOscillator(), mg = hbCtx.createGain(); mid.type = 'sine'; mid.frequency.value = 142;   // 中频"咚"=小喇叭可闻
      mg.gain.setValueAtTime(vol * 0.5, tt); mg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.08);
      mid.connect(mg); mg.connect(hbMaster); mid.start(tt); mid.stop(tt + 0.1);
    }
    function keyChime() {                                        // 拾取钥匙:明亮上扬"叮"(复用 hbCtx;headless 无 AudioContext → 静默退化)
      if (!hbEnsure() || hbMuted()) return;
      if (hbCtx.resume) { try { hbCtx.resume(); } catch (e) {} }
      var tt = hbCtx.currentTime, o = hbCtx.createOscillator(), gn = hbCtx.createGain(); o.type = 'triangle';
      o.frequency.setValueAtTime(880, tt); if (o.frequency.exponentialRampToValueAtTime) o.frequency.exponentialRampToValueAtTime(1320, tt + 0.12);
      gn.gain.setValueAtTime(0.0001, tt); gn.gain.exponentialRampToValueAtTime(0.5, tt + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, tt + 0.4);
      o.connect(gn); gn.connect(hbMaster); o.start(tt); o.stop(tt + 0.42);
    }
    function eventPickupSfx(visual) {                             // 坐标事件拾取反馈:复用既有 visual 语义,不从 hint/run 猜。显眼物=亮叮;地面隐藏=低 tap/scrape;墙缝隐藏=纸片/石屑 scrape。机关仍走 mech* 声,默认不把 plate/marker/trap 当拾取。
      if (visual !== 'pickup' && visual !== 'floor-pickup' && visual !== 'wall-pickup') return;   // 纯 hint / none / marker 不应为了“无声事件”创建 AudioContext。
      if (!hbEnsure() || hbMuted()) return;
      if (hbCtx.resume) { try { hbCtx.resume(); } catch (e) {} }
      var t = hbCtx.currentTime, o, g1, n, bp, ng;
      if (visual === 'floor-pickup') {                             // 地面嵌入线索:低、短、贴地,像从砖缝拓下/捻起小物;不做亮铃,避免把隐藏普通物读成关键宝石。
        n = hbCtx.createBufferSource(); n.buffer = hbNoiseBuf(); bp = hbCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 720; bp.Q.value = 1.8;
        ng = hbCtx.createGain(); ng.gain.setValueAtTime(0.11, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        n.connect(bp); bp.connect(ng); ng.connect(hbMaster); n.start(t); n.stop(t + 0.14);
        o = hbCtx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); if (o.frequency.exponentialRampToValueAtTime) o.frequency.exponentialRampToValueAtTime(82, t + 0.10);
        g1 = hbCtx.createGain(); g1.gain.setValueAtTime(0.08, t); g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.13); o.connect(g1); g1.connect(hbMaster); o.start(t); o.stop(t + 0.14);
      } else if (visual === 'wall-pickup') {                       // 墙缝纸片/壁龛徽记:高频轻擦 + 一点浅亮确认,让玩家知道“贴墙拿到了”,但不把墙面隐藏物做成发光机关。
        n = hbCtx.createBufferSource(); n.buffer = hbNoiseBuf(); bp = hbCtx.createBiquadFilter(); bp.type = 'highpass'; bp.frequency.value = 1700; bp.Q.value = 0.8;
        ng = hbCtx.createGain(); ng.gain.setValueAtTime(0.09, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        n.connect(bp); bp.connect(ng); ng.connect(hbMaster); n.start(t); n.stop(t + 0.20);
        o = hbCtx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(620, t + 0.03); if (o.frequency.exponentialRampToValueAtTime) o.frequency.exponentialRampToValueAtTime(930, t + 0.12);
        g1 = hbCtx.createGain(); g1.gain.setValueAtTime(0.0001, t + 0.02); g1.gain.linearRampToValueAtTime(0.10, t + 0.05); g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.24); o.connect(g1); g1.connect(hbMaster); o.start(t + 0.02); o.stop(t + 0.26);
      } else if (visual === 'pickup') {                            // 显眼可拿物:比钥匙轻的上扬短铃,告诉玩家“物品已入手”;K 钥匙仍保留 keyChime 的更亮主反馈。
        o = hbCtx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(660, t); if (o.frequency.exponentialRampToValueAtTime) o.frequency.exponentialRampToValueAtTime(990, t + 0.10);
        g1 = hbCtx.createGain(); g1.gain.setValueAtTime(0.0001, t); g1.gain.linearRampToValueAtTime(0.18, t + 0.015); g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.26); o.connect(g1); g1.connect(hbMaster); o.start(t); o.stop(t + 0.28);
        var o2 = hbCtx.createOscillator(), g2 = hbCtx.createGain(); o2.type = 'sine'; o2.frequency.value = 1320; g2.gain.setValueAtTime(0.0001, t + 0.06); g2.gain.linearRampToValueAtTime(0.07, t + 0.08); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.30); o2.connect(g2); g2.connect(hbMaster); o2.start(t + 0.05); o2.stop(t + 0.32);
      }
    }
    // ── 靠近时按鬼类型的特有压迫 ambience(连续 drone;心跳之外的"这只鬼"的声)──
    function hbNoiseBuf() {                                       // 1s 循环噪声(seeded 确定性;arcade 实时声、非可测渲染)
      var len = Math.floor(hbCtx.sampleRate * 1), buf = hbCtx.createBuffer(1, len, hbCtx.sampleRate), d = buf.getChannelData(0), nr = mulberry32(0x9E3779B1), i;
      for (i = 0; i < len; i++) d[i] = nr() * 2 - 1;
      return buf;
    }
    function hbDistCurve(k) { var n = 256, c = new Float32Array(n), i, x; for (i = 0; i < n; i++) { x = i / (n - 1) * 2 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); } return c; }
    function mazeReverbIR(seconds, decay) {                      // 程序混响 IR:指数衰减种子噪声(复刻 present-audio makeReverbIR、ctx→hbCtx;确定性零样本)
      var sr = hbCtx.sampleRate || 44100, len = Math.max(1, Math.floor(sr * seconds)), s = 0x9e3779b9 >>> 0, ch, i;
      function r() { s = (s + 0x6D2B79F5) | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 * 2 - 1; }
      var buf = hbCtx.createBuffer(2, len, sr);
      if (buf.getChannelData) for (ch = 0; ch < 2; ch++) { var d = buf.getChannelData(ch); for (i = 0; i < len; i++) d[i] = r() * Math.pow(1 - i / len, decay); }
      return buf;
    }
    function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
    function setParamTarget(param, val, tc) { if (!param) return; try { if (param.setTargetAtTime) param.setTargetAtTime(val, hbCtx.currentTime, tc); else param.value = val; } catch (e) { try { param.value = val; } catch (e2) {} } }
    function relSpatial(mon, g) {                                 // 最近怪相对玩家的快照:side=左右声像, rear=身后强度。前后不伪 HRTF,只给身后湿声/暗化 cue。
      if (!mon || !g) return { pan: 0, rear: 0 };
      var rel = Math.atan2(mon.sy - g.py, mon.sx - g.px) - g.a;
      return { pan: Math.sin(rel), rear: clamp01((-Math.cos(rel) - 0.18) / 0.82) };   // 正前≈0,侧后渐显,正后=1;0.18 死区防侧面误糊
    }
    function connectRearCue() {                                  // proxBus 的 additive 身后支路:湿、暗、尾音,不是 3D 定位。缺高级节点即退化,不影响主干 dry/pan。
      proxRearGain = proxRearFilter = proxRearConv = null;
      if (!proxBus || !hbCtx.createGain || !hbCtx.createBiquadFilter || !hbCtx.createConvolver) return;
      try {
        proxRearFilter = hbCtx.createBiquadFilter(); proxRearFilter.type = 'lowpass'; proxRearFilter.frequency.value = 1800; proxRearFilter.Q.value = 0.55;
        proxRearConv = hbCtx.createConvolver(); proxRearConv.normalize = true; proxRearConv.buffer = mazeReverbIR(0.72, 2.8);
        proxRearGain = hbCtx.createGain(); proxRearGain.gain.value = 0;
        proxBus.connect(proxRearFilter); proxRearFilter.connect(proxRearConv); proxRearConv.connect(proxRearGain); proxRearGain.connect(hbMaster);
      } catch (e) { proxRearGain = proxRearFilter = proxRearConv = null; }
    }
    function disconnectProxChain() {                              // 换最近怪 face/离开时断开 dry+rear 输出;连续源仍随旧 proxBus 失去输出,不再漏到主混音。
      if (proxBus) { try { proxBus.disconnect(); } catch (e) {} }
      if (proxRearFilter) { try { proxRearFilter.disconnect(); } catch (e) {} }
      if (proxRearConv) { try { proxRearConv.disconnect(); } catch (e) {} }
      if (proxRearGain) { try { proxRearGain.disconnect(); } catch (e) {} }
      proxBus = null; proxFace = null; proxRearGain = proxRearFilter = proxRearConv = null;
    }
    // ── 伪人「开口」:formant 合成「hello? … I love you」无生气人声(参照 Lobotomy Corp「Nothing There」O-06-20:复制声音外壳、不懂意义)。
    //   源-滤波器:声门源(1/n² 谱倾斜)→ 3 并联 bandpass 共振峰(频率按音素时间线移动)→ 轻 ring 镀电子膜 → speakOut → hbMaster
    //   (离散事件、不挂 proxBus:连续 drone 会被听觉适应退化成嗡鸣)。无生气=F0 钉死 110Hz 零语调 + 「hello?」句尾不上扬(不懂疑问)
    //   + 机械等长停顿 + 皮下湿噪(见 mimic drone)。可懂度档≈DECtalk:辅音粗近似听感"机器人说话"恰好是 mimic 要的。一次性、确定性、headless guard。
    function glottalWave() {
      var N = 22, real = new Float32Array(N), imag = new Float32Array(N), n;
      for (n = 1; n < N; n++) imag[n] = 1 / (n * n);             // -12dB/oct 声门倾斜(裸 saw 仅 -6)→ formant 滤得人声;改 F0 不改谱包络
      return hbCtx.createPeriodicWave(real, imag, { disableNormalization: true });
    }
    function warpWave() {                                        // 传送"水晶/以太"谱:1/n^1.5 幂律(比 glottalWave 的 1/n² 明亮)+ 偶次谐波小实部偏移=非谐水晶感(warp 机关专用,照 glottalWave 范式)
      var N = 12, real = new Float32Array(N), imag = new Float32Array(N), n;
      for (n = 1; n < N; n++) { imag[n] = 1 / Math.pow(n, 1.5); if (n % 2 === 0) real[n] = 0.15 / n; }
      return hbCtx.createPeriodicWave(real, imag, { disableNormalization: true });
    }
    // 伪人台词(NT 考据 af98bfd:语音不止 hello/I love you;轮换+偶尔卡住复读更像它"捡来的碎句"。Goodbye 留扑杀、不进闲时轮换)。
    var MIMIC_TEXTS = ['I... love... you.', 'hello?', 'come back...', "it's me.", "I've been... waiting for you.", "don't... leave me."];   // 策略 B(TTS)轮换池('...'=TTS 停顿)。参 NT"无生气念亲昵话诱捕"、原创贴本作语境(非照搬 LobCorp 专有台词如 ah man / there is nothing we can do)
    // 策略 A(formant)轮换池:带音素时间线。帧=[off,F1,F2,F3,srcGain,noiseGain];★逐词放置 + 拉长元音(=可懂)+ 词间停顿(NT"逐词拼读")+ 低平单调。长句只给 B。
    var FORMANT_SEQ = {
      'I love you': [
        [0.00, 700, 1150, 2600, 0.5,  0.00],  // /ɑ/ "I"起
        [0.18, 700, 1150, 2600, 1.0,  0.00],  // ɑ hold(拉长=可懂)
        [0.42, 380, 2050, 2750, 1.0,  0.00],  // →/ɪ/ "I"收(F2 升=辨义)
        [0.60, 380, 2050, 2750, 0.0,  0.00],  // 词间停顿(源→0)
        [1.00, 320, 1100, 2800, 0.4,  0.05],  // /l/ "love"起(F3 高 + 轻噪;love 前停顿最长=NT"搜词")
        [1.16, 640, 1220, 2500, 1.0,  0.00],  // /ʌ/ 元音
        [1.46, 640, 1220, 2500, 1.0,  0.00],  // ʌ hold(拉长)
        [1.62, 480,  950, 2300, 1.0,  0.10],  // /v/ 摩擦噪
        [1.78, 480,  950, 2300, 0.0,  0.00],  // 词间停顿
        [2.10, 300, 2250, 2850, 0.4,  0.00],  // /j/ "you"起(高 F2)
        [2.26, 350,  760, 2400, 1.0,  0.00],  // /u/ 元音(圆唇低 F2)
        [2.56, 350,  760, 2400, 1.0,  0.00],  // u hold(拉长)
        [2.86, 350,  760, 2400, 0.0,  0.00]   // 收尾
      ],
      'hello': [
        [0.00, 500, 1700, 2500, 0.05, 0.16],  // /h/ 起音噪
        [0.12, 540, 1820, 2500, 1.0,  0.00],  // /ɛ/ "he"
        [0.36, 540, 1820, 2500, 1.0,  0.00],  // ɛ hold(拉长)
        [0.52, 320, 1100, 2800, 1.0,  0.05],  // /l/(F3 高)
        [0.66, 430,  860, 2400, 1.0,  0.00],  // /oʊ/ "lo"(圆唇)
        [0.92, 430,  860, 2400, 1.0,  0.00],  // o hold(拉长)
        [1.20, 430,  860, 2400, 0.0,  0.00]   // 收尾
      ],
      'come back': [
        [0.00, 600, 1200, 2400, 0.10, 0.12],  // /k/ 起音噪(brief stop)
        [0.10, 600, 1200, 2400, 1.0,  0.00],  // /ʌ/ "come"元音
        [0.32, 600, 1200, 2400, 1.0,  0.00],  // ʌ hold(拉长)
        [0.46, 280, 1100, 2300, 0.7,  0.00],  // /m/ 鼻音(低)
        [0.62, 280, 1100, 2300, 0.0,  0.00],  // 词间停顿
        [0.96, 760, 1700, 2500, 0.15, 0.10],  // /b/起→/æ/ "back"
        [1.08, 780, 1720, 2500, 1.0,  0.00],  // /æ/ 元音
        [1.34, 780, 1720, 2500, 1.0,  0.00],  // æ hold(拉长)
        [1.52, 600, 1250, 2400, 0.25, 0.12],  // /k/ 收(stop+noise)
        [1.64, 600, 1250, 2400, 0.0,  0.00]   // 收尾
      ]
    };
    function mimicSpeak(text, spatial) {                         // 分发:自定义台词(非内置 formant 短语)需 TTS → 优先 speech;内置短语按 MIMIC_VOICE('speech' B / 'formant' A 默认)
      var canSpeech = (typeof window !== 'undefined' && window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined');
      if ((MIMIC_VOICE === 'speech' || !FORMANT_SEQ[text]) && canSpeech) return mimicSpeakSpeech(text, spatial);
      if (!FORMANT_SEQ[text]) return;   // formant 只能念内置短语;自定义台词又无 TTS → 静默(诚实限制:任意词的音色不能盲合成,不盲替英文内置呢喃误导作者)
      return mimicSpeakFormant(text, spatial);   // 内置短语 → formant 念;spatial 是开口瞬间快照,不随玩家转身漂移
    }
    function mimicSpeakSpeech(text, spatial) {                   // 策略 B:浏览器内置 TTS 念"正常"人声(轮换 NT 台词、放慢)+ 同时铺 Web Audio 床(混响尾+低频喘息)= "被处理过/落在潮湿低频空间"的反差(TTS 本身进不了 Web Audio,只让床层按身后快照变湿)。
      if (hbMuted()) return;
      try {
        var ss = window.speechSynthesis; if (ss.speaking) return;          // 不叠播
        var u = new SpeechSynthesisUtterance(text || 'I... love... you.');
        u.rate = 0.78; u.pitch = 0.92; u.volume = 0.95;                    // 放慢(NT 语速没那么快)+ 略降调(低沉单调);'...'=TTS 停顿
        var vs = ss.getVoices ? ss.getVoices() : [], pick = null, j, nm;
        for (j = 0; j < vs.length; j++) { nm = (vs[j].name || '').toLowerCase(); if (/female|zira|samantha|susan|hazel|woman|girl/.test(nm)) { pick = vs[j]; break; } }   // 优先女声(跨机器不保证)
        if (!pick) for (j = 0; j < vs.length; j++) { if (/^en/i.test(vs[j].lang || '')) { pick = vs[j]; break; } }
        if (pick) u.voice = pick;
        ss.speak(u); speakBed(spatial);                                      // 同时铺 Web Audio 床;TTS 本体不能进 Web Audio,床层只作诚实空间陪衬
      } catch (e) {}
    }
    function speakBed(spatial) {                                  // B 专用:TTS 说话时铺的 Web Audio 床(低频喘息嗡鸣 + 混响尾)→ "被处理过"的空间感;停顿期间床继续"呼吸"
      if (!hbEnsure() || hbMuted()) return;
      if (hbCtx.resume) { try { hbCtx.resume(); } catch (e) {} }
      var t0 = hbCtx.currentTime, rear = spatial ? clamp01(spatial.rear || 0) : 0;
      var o = hbCtx.createOscillator(); o.type = 'sine'; o.frequency.value = 62 - rear * 8;        // 低频喘息嗡鸣;身后略低更暗,但不冒充 TTS 本体空间化
      var og = hbCtx.createGain(); og.gain.setValueAtTime(0.0001, t0); og.gain.linearRampToValueAtTime(0.13 + rear * 0.05, t0 + 0.4); og.gain.linearRampToValueAtTime(0.0001, t0 + 3.4);
      var lf = hbCtx.createOscillator(); lf.type = 'sine'; lf.frequency.value = 0.5; var lfg = hbCtx.createGain(); lfg.gain.value = 0.05; lf.connect(lfg); lfg.connect(og.gain);   // 呼吸 LFO
      o.connect(og); og.connect(hbMaster); o.start(t0); lf.start(t0); o.stop(t0 + 3.5); lf.stop(t0 + 3.5);
      if (hbCtx.createConvolver) {                                                       // 混响尾(空间残响);rear 越强越湿,但仍只是床层
        var nz = hbCtx.createBufferSource(); nz.buffer = hbNoiseBuf(); var nbp = hbCtx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = 900 - rear * 260; nbp.Q.value = 0.8;
        var ng = hbCtx.createGain(); ng.gain.setValueAtTime(0.0001, t0); ng.gain.linearRampToValueAtTime(0.05 + rear * 0.035, t0 + 0.1); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3 + rear * 0.4);
        var conv = hbCtx.createConvolver(); conv.normalize = true; try { conv.buffer = mazeReverbIR(1.4 + rear * 0.55, 2.4); } catch (e) {}
        var cg = hbCtx.createGain(); cg.gain.value = 0.5 + rear * 0.25; nz.connect(nbp); nbp.connect(ng); ng.connect(conv); conv.connect(cg); cg.connect(hbMaster); nz.start(t0); nz.stop(t0 + 1.4 + rear * 0.4);
      }
    }
    function mimicSpeakFormant(text, spatial) {
      if (!hbEnsure() || hbMuted()) return;
      if (hbCtx.resume) { try { hbCtx.resume(); } catch (e) {} }
      var t0 = hbCtx.currentTime, k, i;
      var src = hbCtx.createOscillator();                        // 声门源(F0=110 钉死=零语调)
      try { src.setPeriodicWave(glottalWave()); } catch (e) { src.type = 'sawtooth'; }
      src.frequency.value = 110;
      var w1 = hbCtx.createOscillator(); w1.type = 'sine'; w1.frequency.value = 5.3; var w1g = hbCtx.createGain(); w1g.gain.value = 7; w1.connect(w1g); w1g.connect(src.detune);   // 轻 wow:慢 LFO 微调 detune(±cents)→ 钉死 F0 微飘="活物在不稳发声"
      var w2 = hbCtx.createOscillator(); w2.type = 'sine'; w2.frequency.value = 7.9; var w2g = hbCtx.createGain(); w2g.gain.value = 4; w2.connect(w2g); w2g.connect(src.detune);   // 第二慢 LFO(互质频、确定性)
      var srcG = hbCtx.createGain(); srcG.gain.value = 0; src.connect(srcG);   // 振幅包络(辅音/停顿压低)
      var sum = hbCtx.createGain(); sum.gain.value = 1;
      var BP = [], G = [0.9, 0.5, 0.26], QB = [9, 14, 18];       // 3 共振峰:F1 主、F2/F3 递弱(频率携带元音=可懂);gain 固定
      for (k = 0; k < 3; k++) {
        var bpf = hbCtx.createBiquadFilter(); bpf.type = 'bandpass'; bpf.Q.value = QB[k];
        var gf = hbCtx.createGain(); gf.gain.value = G[k];
        srcG.connect(bpf); bpf.connect(gf); gf.connect(sum); BP.push(bpf);
      }
      var nz = hbCtx.createBufferSource(); nz.buffer = hbNoiseBuf(); nz.loop = true;   // 辅音/气声噪(/h/ 起音、/v/ 摩擦)
      var nbp = hbCtx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = 1620; nbp.Q.value = 1.2;
      var nG = hbCtx.createGain(); nG.gain.value = 0; nz.connect(nbp); nbp.connect(nG); nG.connect(sum);
      var ring = hbCtx.createGain(); ring.gain.value = 0.9; sum.connect(ring);          // 轻 ring(0.9±0.1 @70Hz):镀电子膜、保可懂
      var rc = hbCtx.createOscillator(); rc.type = 'sine'; rc.frequency.value = 70;
      var rd = hbCtx.createGain(); rd.gain.value = 0.1; rc.connect(rd); rd.connect(ring.gain);
      var out = hbCtx.createGain(); out.gain.value = 0.5; ring.connect(out);                // ≤ 心跳峰值 0.66:让位给心跳
      var sp = spatial || {}, rear = clamp01(sp.rear || 0), speakDest = hbMaster;
      if (hbCtx.createStereoPanner) { try { var speakPan = hbCtx.createStereoPanner(); speakPan.pan.value = clamp01((sp.pan || 0) * 0.5 + 0.5) * 2 - 1; speakPan.connect(hbMaster); speakDest = speakPan; } catch (e) { speakDest = hbMaster; } }   // 开口瞬间快照左右位置;不随玩家转头漂移
      var dry = hbCtx.createGain(); dry.gain.value = 0.74 - rear * 0.22; out.connect(dry); dry.connect(speakDest);   // 做旧:肉腔暗混响;rear 时干声略少,但保可懂度
      if (hbCtx.createConvolver) {                                                          // 湿路:短暗窄 IR + 低通=肉腔无明亮反射(无 convolver → 仅干声、退化不崩)
        var conv = hbCtx.createConvolver(); conv.normalize = true; try { conv.buffer = mazeReverbIR(0.20 + rear * 0.42, 3.2); } catch (e) {}
        var wlp = hbCtx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 2100 - rear * 650; var wetG = hbCtx.createGain(); wetG.gain.value = 0.50 + rear * 0.30;
        out.connect(conv); conv.connect(wlp); wlp.connect(wetG); wetG.connect(speakDest);
      }
      // ── 音素时间线(来自 FORMANT_SEQ[text]:逐词放置 + 拉长元音 + 词间停顿);全 t0+off 绝对排定,无 setTimeout ──
      var seq = FORMANT_SEQ[text] || FORMANT_SEQ['I love you'];
      for (k = 0; k < 3; k++) {                                  // 共振峰频率:首帧锚 + 机械等速 linearRamp(robot)
        BP[k].frequency.setValueAtTime(seq[0][1 + k], t0);
        for (i = 1; i < seq.length; i++) BP[k].frequency.linearRampToValueAtTime(seq[i][1 + k], t0 + seq[i][0]);
      }
      srcG.gain.setValueAtTime(seq[0][4], t0);                   // 源振幅包络
      for (i = 1; i < seq.length; i++) srcG.gain.linearRampToValueAtTime(seq[i][4], t0 + seq[i][0]);
      nbp.frequency.setValueAtTime(1620, t0);                    // 辅音噪带通跟 F2
      for (i = 1; i < seq.length; i++) nbp.frequency.linearRampToValueAtTime(seq[i][2], t0 + seq[i][0]);
      nG.gain.setValueAtTime(seq[0][5], t0);                     // 辅音噪(每条台词自带:col 5)
      for (i = 1; i < seq.length; i++) nG.gain.linearRampToValueAtTime(seq[i][5], t0 + seq[i][0]);
      var tEnd = t0 + seq[seq.length - 1][0] + 0.3;              // 一次性事件、按台词长度(hbCtx.close 整体回收,无需额外清理)
      src.start(t0); nz.start(t0); rc.start(t0); w1.start(t0); w2.start(t0);
      src.stop(tEnd); nz.stop(tEnd); rc.stop(tEnd); w1.stop(tEnd); w2.stop(tEnd);
    }
    function buildProxAmb(face) {                                 // 按鬼类型建连续压迫源(全连 proxBus → hbMaster;gain 由 proxAmbient 控)
      proxRearGain = proxRearFilter = proxRearConv = null;
      proxBus = hbCtx.createGain(); proxBus.gain.value = 0; proxBus.connect(proxPanner || hbMaster);   // dry 主干:左右声像照旧;rear cue 是额外湿支路,不替代 dry
      connectRearCue();
      var t = hbCtx.currentTime, o, o2, g1, lfo, lg, ns, bp, lp, ws, ng;
      if (face === 'yurei') {                                     // 日式幽灵:幽幽气声为主 + 一缕低柔哀鸣(去 520Hz 纯哨音 + 5.5Hz 快颤=电子味 → 低柔、极慢飘、克制)
        o = hbCtx.createOscillator(); o.type = 'sine'; o.frequency.value = 300;
        lfo = hbCtx.createOscillator(); lfo.frequency.value = 0.35; lg = hbCtx.createGain(); lg.gain.value = 11; lfo.connect(lg); lg.connect(o.frequency);   // 极慢轻飘(非 5.5Hz 快颤)
        g1 = hbCtx.createGain(); g1.gain.value = 0.12; o.connect(g1); g1.connect(proxBus);   // 弱、藏在气声里
        ns = hbCtx.createBufferSource(); ns.buffer = hbNoiseBuf(); ns.loop = true; bp = hbCtx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 760; bp.Q.value = 0.7;   // 软气声(低通,非 2600 高嘶)
        ng = hbCtx.createGain(); ng.gain.value = 0.17; ns.connect(bp); bp.connect(ng); ng.connect(proxBus);
        o.start(t); lfo.start(t); ns.start(t);
      } else if (face === 'skull') {                              // 骷髅:深空洞鸣 + 软低风(去 3400 高通嘶 + 锯齿 buzz=电子味 → 深 sine + 软风、克制)
        o = hbCtx.createOscillator(); o.type = 'sine'; o.frequency.value = 60; lp = hbCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;   // 深空洞(sine 非锯齿 buzz)
        g1 = hbCtx.createGain(); g1.gain.value = 0.24; o.connect(lp); lp.connect(g1); g1.connect(proxBus);
        o2 = hbCtx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 90.4; var sg2 = hbCtx.createGain(); sg2.gain.value = 0.06; o2.connect(sg2); sg2.connect(proxBus);   // 极弱泛音=枯井空腔
        ns = hbCtx.createBufferSource(); ns.buffer = hbNoiseBuf(); ns.loop = true; bp = hbCtx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 240;   // 软低风(低通,非 3400 高通嘶)
        ng = hbCtx.createGain(); ng.gain.value = 0.10; ns.connect(bp); bp.connect(ng); ng.connect(proxBus);
        o.start(t); o2.start(t); ns.start(t);
      } else if (face === 'zombie') {                             // 僵尸:低沉稳定的喉鸣(去 0.5Hz 大喘息=海浪感 → 稳定、更暗、失真更轻、克制)
        o = hbCtx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 56; ws = hbCtx.createWaveShaper(); ws.curve = hbDistCurve(4); lp = hbCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 440;
        g1 = hbCtx.createGain(); g1.gain.value = 0.34; o.connect(ws); ws.connect(lp); lp.connect(g1); g1.connect(proxBus);
        ns = hbCtx.createBufferSource(); ns.buffer = hbNoiseBuf(); ns.loop = true; bp = hbCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 1.2;
        ng = hbCtx.createGain(); ng.gain.value = 0.10; ns.connect(bp); bp.connect(ng); ng.connect(proxBus);   // 固定弱、无大 LFO=不再像海浪
        o.start(t); ns.start(t);
      } else if (face === 'mimic') {                              // 伪人:皮下「湿肉电话腔」连续底噪(它一直在附近;「开口」人声走 mimicSpeak、挂 hbMaster)
        ns = hbCtx.createBufferSource(); ns.buffer = hbNoiseBuf(); ns.loop = true; bp = hbCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 3.5;   // 电话腔窄带静电
        ng = hbCtx.createGain(); ng.gain.value = 0.16; ns.connect(bp); bp.connect(ng); ng.connect(proxBus);
        o = hbCtx.createOscillator(); o.type = 'sine'; o.frequency.value = 90; g1 = hbCtx.createGain(); g1.gain.value = 0.22; o.connect(g1); g1.connect(proxBus);   // 低频"在场"压迫
        var wns = hbCtx.createBufferSource(); wns.buffer = hbNoiseBuf(); wns.loop = true; var wlp = hbCtx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 340; wlp.Q.value = 6;   // 皮下湿肉:低频噪
        var wg = hbCtx.createGain(); wg.gain.value = 0.12; lfo = hbCtx.createOscillator(); lfo.frequency.value = 0.6; lg = hbCtx.createGain(); lg.gain.value = 0.09; lfo.connect(lg); lg.connect(wg.gain);   // 慢 LFO 调 gain=喉咙里有液体蠕动
        wns.connect(wlp); wlp.connect(wg); wg.connect(proxBus);
        o.start(t); ns.start(t); wns.start(t); lfo.start(t);
      } else if (face === 'slender') {                            // Slenderman:电视静电/无线电噪声 + 低频耳鸣("在场"压迫,无旋律)
        ns = hbCtx.createBufferSource(); ns.buffer = hbNoiseBuf(); ns.loop = true; bp = hbCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.6;
        ng = hbCtx.createGain(); ng.gain.value = 0.4; ns.connect(bp); bp.connect(ng); ng.connect(proxBus);
        o = hbCtx.createOscillator(); o.type = 'sine'; o.frequency.value = 70; g1 = hbCtx.createGain(); g1.gain.value = 0.3; o.connect(g1); g1.connect(proxBus);
        o.start(t); ns.start(t);
      } else { disconnectProxChain(); return; }   // 无/未知:不建特有源(仍有心跳)
      proxFace = face;
    }
    function buildMazeAmbient(themeName) {                       // 常驻 room tone:按 maze theme 做极少量程序化分型(空间/状态语言),不新增作者字段、不走公共 audio 契约。建一次,随 hbCtx.close 回收;静音由 loop 的 hbMaster.gain 同步管。
      if (ambBus || !hbEnsure()) return;
      var t = hbCtx.currentTime, p = { humF: 52, humG: 0.030, noiseType: 'lowpass', noiseF: 150, noiseQ: 1, noiseG: 0.025, tensionF: 2400, tensionQ: 2 };
      if (themeName === 'dungeon') p = { humF: 48, humG: 0.032, noiseType: 'lowpass', noiseF: 190, noiseQ: 1.1, noiseG: 0.026, tensionF: 2300, tensionQ: 2.2 };            // 石室:低 rumble + 短冷空气
      else if (themeName === 'cave') p = { humF: 44, humG: 0.028, noiseType: 'lowpass', noiseF: 360, noiseQ: 0.7, noiseG: 0.030, tensionF: 2150, tensionQ: 1.8 };             // 洞穴:更暗的气流/潮湿感,不随机滴水(避免素材式打地鼠)
      else if (themeName === 'flesh') p = { humF: 58, humG: 0.035, noiseType: 'lowpass', noiseF: 260, noiseQ: 5.5, noiseG: 0.032, wobble: 0.055, tensionF: 1900, tensionQ: 2.8 }; // 血肉:慢湿低频调制,仍克制不盖怪物声
      else if (themeName === 'station' || themeName === 'clinic' || themeName === 'metal') p = { humF: 92, humG: 0.020, noiseType: 'bandpass', noiseF: 840, noiseQ: 0.8, noiseG: 0.018, auxF: 49, auxG: 0.014, tensionF: 2850, tensionQ: 2.4 }; // 设施:冷窄频电气底噪
      else if (themeName === 'ice') p = { humF: 72, humG: 0.018, noiseType: 'bandpass', noiseF: 1180, noiseQ: 1.2, noiseG: 0.014, tensionF: 3100, tensionQ: 2.6 };             // 冰场:薄、高、冷,留白多
      ambBus = hbCtx.createGain(); ambBus.gain.value = 1; ambBus.connect(hbMaster);
      var rt = hbCtx.createOscillator(); rt.type = 'sine'; rt.frequency.value = p.humF; var rtg = hbCtx.createGain(); rtg.gain.value = p.humG; rt.connect(rtg); rtg.connect(ambBus);   // 很低的房间嗡鸣
      var rn = hbCtx.createBufferSource(); rn.buffer = hbNoiseBuf(); rn.loop = true; var rnlp = hbCtx.createBiquadFilter(); rnlp.type = p.noiseType; rnlp.frequency.value = p.noiseF; rnlp.Q.value = p.noiseQ; var rng = hbCtx.createGain(); rng.gain.value = p.noiseG; rn.connect(rnlp); rnlp.connect(rng); rng.connect(ambBus);   // 极弱噪声层=空气/风道/电气/潮湿
      rt.start(t); rn.start(t);
      if (p.auxF) { var aux = hbCtx.createOscillator(); aux.type = 'sine'; aux.frequency.value = p.auxF; var ag = hbCtx.createGain(); ag.gain.value = p.auxG; aux.connect(ag); ag.connect(ambBus); aux.start(t); }   // 设施低频二次嗡鸣(电机/通风管)
      if (p.wobble) { var wl = hbCtx.createOscillator(); wl.type = 'sine'; wl.frequency.value = 0.22; var wg = hbCtx.createGain(); wg.gain.value = p.wobble; wl.connect(wg); wg.connect(rng.gain); wl.start(t); }   // 血肉/潮湿主题的极慢呼吸式调制,只调底噪 gain
      // 高频细弦张力层(危险升→loop 渐显其 gain;两支微失谐高音 + 小二度不协和=影院弦乐张力,经 bandpass 细飘;高频带=不掩低 drone、克制上限 0.06)
      tensionBus = hbCtx.createGain(); tensionBus.gain.value = 0; tensionBus.connect(hbMaster);
      var tbp = hbCtx.createBiquadFilter(); tbp.type = 'bandpass'; tbp.frequency.value = p.tensionF; tbp.Q.value = p.tensionQ; tbp.connect(tensionBus);
      var tf = [1318.5, 1396.9], ti;   // E6 + F6(小二度=不安)
      for (ti = 0; ti < 2; ti++) {
        var to = hbCtx.createOscillator(); to.type = 'sawtooth'; to.frequency.value = tf[ti];
        var tl = hbCtx.createOscillator(); tl.frequency.value = 0.2 + ti * 0.13; var tlg = hbCtx.createGain(); tlg.gain.value = 4; tl.connect(tlg); tlg.connect(to.detune);   // 慢 LFO 微飘(确定性互质频)
        var tg = hbCtx.createGain(); tg.gain.value = 0.5; to.connect(tg); tg.connect(tbp); to.start(t); tl.start(t);
      }
    }
    function proxAmbient(face, prox, pan, rear) {                 // 每帧:音量∝靠近度 + 左右声像 + 身后湿声 cue。rear 不是 HRTF,只解决正前/正后同居中的物理歧义。
      if (!hbEnsure() || hbMuted()) return;
      if (hbCtx.resume) { try { hbCtx.resume(); } catch (e) {} }
      if (!face) { if (proxBus) { try { proxBus.gain.setTargetAtTime(0, hbCtx.currentTime, 0.2); } catch (e) {} } setParamTarget(proxRearGain && proxRearGain.gain, 0, 0.18); return; }
      if (proxFace !== face) { if (proxBus) disconnectProxChain(); buildProxAmb(face); }
      if (proxBus) { try { proxBus.gain.setTargetAtTime(Math.min(0.5, prox * 0.5), hbCtx.currentTime, 0.15); } catch (e) {} }
      if (proxPanner && proxPanner.pan) { try { proxPanner.pan.setTargetAtTime(pan || 0, hbCtx.currentTime, 0.08); } catch (e) {} }   // 声像平滑(0.08s 比 gain 的 0.15s 快=玩家转身跟得上);gain 管距离、panner 只管左右=各司其职
      rear = clamp01(rear || 0);
      setParamTarget(proxRearGain && proxRearGain.gain, Math.min(0.38, prox * rear * 0.34), 0.18);   // 身后才显湿尾,上限克制防把 face 特征洗没
      setParamTarget(proxRearFilter && proxRearFilter.frequency, 2100 - rear * 950, 0.18);           // 越在身后越暗,用遮蔽/尾音而非伪定位
    }

    function activateMaze(state, node) {
      if (!node || node.kind !== 'maze3d') return;
      if (node.winKey && state[node.winKey]) return;
      if (node.scareKey && state[node.scareKey]) return;
      try { startMaze(node); }
      catch (e) { stop(); throw e; }
    }

    function handleEnter(state, ev) {
      stop();
      activateMaze(state, ev && ev.node);
    }

    function handleRestore(state, ev) {
      if (!ev || ev.phase === 'deactivate') { stop(); return; }
      if (ev.phase === 'activate' && ev.current) activateMaze(state, ev.current.node);
    }

    var mod = {
      id: 'maze3d',
      nodeKinds: ['maze3d'],
      systems: [
        { on: 'enter', run: handleEnter },
        { on: 'restore', run: handleRestore }
      ],
      render: function (state, node) {
        var won = node.winKey && state[node.winKey];
        var caught = node.scareKey && state[node.scareKey];
        // 默认 look 据「有无怪物」分语气(Q1 修:探索基调 maze 不该硬套恐怖默认):有怪=恐怖、无怪=中性探索。作者写了 node.look 则覆盖(此处仅兜底)。
        var hasMon = !!(node.maze && Array.isArray(node.maze.monsters) && node.maze.monsters.length > 0);
        var text = caught ? (node.caughtText || '它抓住了你。一切归于黑暗。')
          : won ? (node.wonText || '门开了,你走出了迷宫。从下面的选项继续。')
            : (node.look || (hasMon ? '黑暗在四面合拢,某处有什么在缓缓移动。走廊深处透着一线微光——那是出口,正对它走过去就能推开。'
              : '一条石砌回廊在你面前展开,不见尽头。留意脚下与墙面,深处似乎有微光在静静等待——走到那扇发光的门前、正对它推开。'));
        var view = { title: node.title || '迷宫', body: [{ type: 'prose', text: text }], status: [] };
        // 被抓瞬间(scareEnd 的 api.apply 触发本次重渲染)→ View 带 sfx → present-audio 当场播。
        // 声画同时 = jump-scare 命脉(不延后到玩家点链接;sfx 一次性即触发,present-audio.js)。
        // 被抓:停氛围(死寂)+ 惊吓音(作者 node.scareSfx 选,默认 horror-sting;richBus 令其比背景响)。
        // **迷宫期间模块自有 hbCtx 出心跳/drone/人声 → present-audio 主轨/氛围默认显式停**(否则契约 v15「缺键继承」让上一场景 bgm/ambient〔如入口 ambient-unease〕继续播,和迷宫心跳叠成双层氛围床 → 张力被旧 drone 盖住)。
        // **BGM 按需开(maze3d 泛用化后,见 docs/maze-audio-design.md §11)**:作者在 maze3d 节点写 `audio.music`(如神圣晶体回廊要 sacral)才点播 BGM,没写=默认 false(恐怖迷宫维持静默 + 堵继承)。ambient 仍单独控(作者 scareAmbient 才叠 present-audio 恐怖 BGS)。被抓永远 music:false(死/败静默 + 让惊吓 sfx 突出)。
        var mazeMusic = (node.audio && node.audio.music) || false;
        if (caught) view.audio = { ambient: false, music: false, sfx: [node.scareSfx || 'horror-sting'] };
        else if (won) view.audio = { ambient: false, music: mazeMusic };       // 逃出/通关:作者点播则续奏(胜利涌起)、否则死寂
        else view.audio = { ambient: node.scareAmbient || false, music: mazeMusic };   // 探索:作者点播则铺底 BGM、否则停旧主轨(迷宫自有声);scareAmbient 才叠恐怖 BGS
        // 实时会话只由 critical enter/restore 生命周期建立；render 保持纯读取，不创建 canvas/rAF/listener/audio。
        return view;
      },
      actions: function (state, node) { return api ? api.linkActions(node, state) : []; },
      install: function (a) {
        api = a;
        a.registerModule(mod);
        hostDoc = (typeof document !== 'undefined') ? document : null;
        injectPuzzleStyles(hostDoc);
        // 玩法启停由 mod.systems 的 critical enter 生命周期承担；api.on 只用于可隔离 observer。
        // startMaze 的数据/DOM 初始化异常必须传播，不能被 observer catch 后留下 running=true 的半局。
      }
    };

    function cancelSpeech() { if (typeof window !== 'undefined' && window.speechSynthesis && window.speechSynthesis.cancel) { try { window.speechSynthesis.cancel(); } catch (e) {} } }   // 取消伪人 TTS 念白:speechSynthesis 是独立全局队列、hbCtx.close 管不到 → 不取消则中途离开/通关/被抓时那句话会飘到结局画面继续念
    function listenGlobal(target, type, handler) {
      if (!target || !target.addEventListener) return;
      target.addEventListener(type, handler);
      globalListeners.push([target, type, handler]);
    }
    function removeGlobalListeners() {
      for (var i = globalListeners.length - 1; i >= 0; i--) {
        var x = globalListeners[i];
        if (x[0] && x[0].removeEventListener) x[0].removeEventListener(x[1], x[2]);
      }
      globalListeners.length = 0;
    }
    function stop(keepAudio) {   // keepAudio=true(仅 winNow 通关时):保 hbCtx 让开门音效响完,其余照常清理;离开节点 enter→stop() 无参再真正关闭
      loopGeneration++;
      running = false;
      if (rafId && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId);
      rafId = 0;
      if (sessionTeardown) { try { sessionTeardown(); } catch (e) {} }
      sessionTeardown = null;
      removeGlobalListeners();
      if (!keepAudio && hbCtx && hbCtx.close) { try { hbCtx.close(); } catch (e) {} }   // 关心跳/压迫 AudioContext(被抓/逃出/离开节点);keepAudio=通关:不关,让开门音效响完
      cancelSpeech();   // 离开/通关/被抓 → 掐掉还在念的伪人 TTS(否则飘到结局画面继续念)
      if (hudEl && hudEl.parentNode) { try { hudEl.parentNode.removeChild(hudEl); } catch (e) {} } hudEl = null;   // 移除 HUD 提示浮层 DOM
      if (puzzleOverlayEl && puzzleOverlayEl.parentNode) { try { puzzleOverlayEl.parentNode.removeChild(puzzleOverlayEl); } catch (e) {} } puzzleOverlayEl = null;   // 移除 R1-b4 谜题面板 DOM,避免离开/重进时旧 overlay 留在 stage
      if (interactBtn && interactBtn.parentNode) { try { interactBtn.parentNode.removeChild(interactBtn); } catch (e) {} } interactBtn = null;   // 移除 R1-b 上下文按钮,避免重进同一模块时旧按钮留在 stage
      if (sessionStage) { sessionStage.textContent = ''; while (sessionStage.children && sessionStage.children.length) sessionStage.removeChild(sessionStage.children[0]); }
      sessionStage = null;
      if (!keepAudio) { hbCtx = null; hbMaster = null; proxBus = null; proxFace = null; proxPanner = null; proxRearGain = null; proxRearFilter = null; proxRearConv = null; ambBus = null; tensionBus = null; }   // keepAudio 时保留这些句柄(开门音效仍在响);离开节点再清
    }

    function startMaze(node) {
      if (!hostDoc || !hostDoc.getElementById) return;          // 无 DOM(探针)→ 退化
      var stage = hostDoc.getElementById(node.stageId || STAGE);
      if (!stage) return;                                       // 无挂载点 → 退化
      sessionStage = stage;
      var canvas = hostDoc.createElement('canvas');
      canvas.width = CW; canvas.height = CH;
      canvas.setAttribute('aria-label', '第一人称迷宫画面');
      canvas.setAttribute('tabindex', '0');
      var ctx = canvas.getContext && canvas.getContext('2d');
      stage.textContent = '';
      var mScreen = hostDoc.createElement('div'); mScreen.className = 'amatlas-maze-screen';   // 画面壳:边框/比例/准星挂它上;D-pad 排它「下方」不遮 3D 视野(用户要求手机控件到画面外);全屏时由 fs-style 令它铺满
      mScreen.appendChild(canvas); stage.appendChild(mScreen);
      if (!ctx || typeof ctx.fillRect !== 'function') return;   // 无 2D / stub 缺绘图方法 → 不起 loop,闸安全
      var sc0 = hostDoc.getElementById('scene'); if (sc0) sc0.textContent = '';   // 进迷宫→清 SVG 场景窗(否则与 canvas 同屏=双窗口)

      var maze = node.maze || {};
      var customIcons = maze.icons;   // 作者自定义物品表(下游扩展接口;{名字:{art,palette[,mirror]}});传给 resolveIcon 优先于内置库
      if (customIcons != null && (typeof customIcons !== 'object' || Array.isArray(customIcons))) throw new Error('[maze icons] maze.icons 必须是 {名字:{art,palette}} 对象');
      if (maze.grid != null && (!Array.isArray(maze.grid) || !maze.grid.length)) throw new Error('[maze] maze.grid 必须是非空字符串数组(每行一个字符串:# 墙 / . 地板 / D 门 / K 钥匙)');
      var grid = (maze.grid || ['###', '#.#', '###']).slice();   // 浅拷贝:运行时 events 的 set 改格只动副本,不污染作者 world 的 maze.grid(被抓重进/重载→startMaze 重跑→机关复位;行是不可变字符串,改格靠整行替换)
      var start = maze.start || { x: 1, y: 1, dir: 'N' };
      var theme = (maze.theme && typeof maze.theme === 'string') ? maze.theme : '';   // 防作者误写 theme:'' / 未知值 → 统一空串 key 走中性默认
      if (theme && !THEMES[theme] && typeof console !== 'undefined' && console.warn)   // maze 私有 runtime warn(非 graph-audit 静态闸——孤岛分层有摩擦):未知主题名退化但提示作者
        console.warn('[maze theme] 未知主题 "' + theme + '",退化到中性默认。已知:' + Object.keys(THEMES).filter(function (k) { return k; }).join('/'));
      var T = THEMES[theme] || THEMES[''];
      if (maze.wallTex != null && ['none', 'brick', 'stone', 'tile', 'smalltile', 'wood', 'shoji', 'flesh', 'circuit', 'panel', 'hull', 'sandstone', 'crystal', 'ice', 'plate'].indexOf(maze.wallTex) < 0) throw new Error('[maze wall] wallTex 必须是 none/brick/stone/tile/smalltile/wood/shoji/flesh/circuit/panel/hull/sandstone/crystal/ice/plate 之一,得到 ' + maze.wallTex);
      if (maze.ceilTex != null && ['slab', 'beam', 'rib', 'panel'].indexOf(maze.ceilTex) < 0) throw new Error('[maze ceil] ceilTex 必须是 slab/beam/rib/panel 之一,得到 ' + maze.ceilTex);
      var exitStyleOverride = normalizeExitStyle(maze.exitStyle, 'maze.exitStyle');
      // gallery/作者选材卡可只覆盖基础材质/出口样式,仍复用 theme 的基色/雾/装饰池;浅拷贝避免把单张卡写回 THEMES。
      if (maze.wallTex != null || maze.ceilTex != null || exitStyleOverride != null) { var T0 = T; T = {}; for (var tk in T0) if (Object.prototype.hasOwnProperty.call(T0, tk)) T[tk] = T0[tk]; if (maze.wallTex != null) T.wallTex = maze.wallTex; if (maze.ceilTex != null) T.ceilTex = maze.ceilTex; if (exitStyleOverride != null) T.door = exitStyleOverride; }
      if (maze.floorTex != null && ['slab', 'tile', 'panel', 'crack'].indexOf(maze.floorTex) < 0) throw new Error('[maze floor] floorTex 必须是 slab/tile/panel/crack 之一,得到 ' + maze.floorTex);
      if (maze.floorLineK != null && !(typeof maze.floorLineK === 'number' && isFinite(maze.floorLineK) && maze.floorLineK >= 0)) throw new Error('[maze floor] floorLineK 必须是 >=0 数字,得到 ' + maze.floorLineK);
      if (maze.topBoost != null && !(typeof maze.topBoost === 'number' && isFinite(maze.topBoost) && maze.topBoost >= 0)) throw new Error('[maze wall] topBoost 必须是 >=0 数字,得到 ' + maze.topBoost);
      if (maze.botDip != null && !(typeof maze.botDip === 'number' && isFinite(maze.botDip) && maze.botDip >= 0)) throw new Error('[maze wall] botDip 必须是 >=0 数字,得到 ' + maze.botDip);
      if (maze.aoStrength != null && !(typeof maze.aoStrength === 'number' && isFinite(maze.aoStrength) && maze.aoStrength >= 0)) throw new Error('[maze wall] aoStrength 必须是 >=0 数字,得到 ' + maze.aoStrength);
      if (maze.wallScale != null && !(typeof maze.wallScale === 'number' && isFinite(maze.wallScale) && maze.wallScale >= 1)) throw new Error('[maze wall] wallScale 必须是 >=1 数字(整场景墙等比拔高=大厅/高墙感;<1 矮墙会误导「能跨过去」故不许),得到 ' + maze.wallScale);
      if (maze.wallTexMode != null && maze.wallTexMode !== 'tile' && maze.wallTexMode !== 'stretch') throw new Error("[maze wall] wallTexMode 必须是 'tile'(砖块自然大小·随墙拔高多贴几排,默认)或 'stretch'(整面纹路随墙等比放大),得到 " + maze.wallTexMode);
      if (maze.wearLevel != null && !(typeof maze.wearLevel === 'number' && isFinite(maze.wearLevel) && maze.wearLevel >= 0 && maze.wearLevel <= 1)) throw new Error('[maze wall] wearLevel 必须是 0..1 数字,得到 ' + maze.wearLevel);
      if (maze.wallDecorDensity != null && !(typeof maze.wallDecorDensity === 'number' && isFinite(maze.wallDecorDensity) && maze.wallDecorDensity >= 0)) throw new Error('[maze wallDecor] wallDecorDensity 必须是 >=0 数字,得到 ' + maze.wallDecorDensity);
      if (maze.maxWallDecor != null && !(typeof maze.maxWallDecor === 'number' && isFinite(maze.maxWallDecor) && maze.maxWallDecor >= 0)) throw new Error('[maze wallDecor] maxWallDecor 必须是 >=0 数字,得到 ' + maze.maxWallDecor);
      if (maze.wallDecor != null && !Array.isArray(maze.wallDecor)) throw new Error('[maze wallDecor] maze.wallDecor 必须是数组(每项 {x,y,face,kind,u?,v?,scale?})');
      var torchFlick = 1;   // 火把摇曳系数(render() 每帧算、shadeWall/faceFog/地板共用;无 torch 主题恒 1=零影响)
      var reducedMotion = (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || false;   // 无障碍:用户要求减少动态 → 关震屏/头部晃动(转身惯性=输入平滑,保留);headless 无 matchMedia → false(typeof + && guard)
      var g = { px: start.x + 0.5, py: start.y + 0.5, a: dirToAngle(start.dir), won: false, atDoor: false, tw: 0, hbAcc: 0, prox: 0,
        mimicNext: 0, mimicRng: mulberry32(hashStr((node.scareKey || node.title || 'mimic') + ':speak')),   // 伪人「开口」计时(会话局部·种子确定性·禁 Math.random/Date.now)
        mimicLast: null, mimicRep: 0, mimicWasNear: false, lastMuted: false,    // 台词轮换状态(不立刻重复/偶尔卡住复读)+ 刚进范围标记(先静默再开口)+ 静音态(实时跟工具栏)
        // 怪物(billboard 精灵;缺省 [] → 普通迷宫零行为变化=向后兼容)。sx/sy=格中心(追逐时被 loop 改);chase=是否追玩家(默认开,缺省静止守)
        monsters: (maze.monsters || []).map(function (m, i) {
          var sp = { sx: m.x + 0.5, sy: m.y + 0.5, active: m.active !== false, fadeAlpha: (m.fadeAlpha != null ? m.fadeAlpha : 1), chase: m.chase !== false, face: m.face, body: m.body, idx: i };
          if (m.art != null) { var pa = parseMonsterArt(m, i); sp.art = pa.art; sp.artCols = pa.cols; sp.artRows = pa.rows; sp.artPal = pa.pal; }   // 自定义外观(opt-in;校验+镜像展开;坏则 throw→boot 横幅)
          if (m.lines != null) {                                  // 自定义念白台词(opt-in;有 lines 的怪靠近会开口念,走 TTS;音色不可盲合成=诚实限制,文字可)
            if (!Array.isArray(m.lines) || !m.lines.length || !m.lines.every(function (s) { return typeof s === 'string' && s.length; })) throw new Error('[maze voice] 怪物[' + i + '].lines 必须是非空字符串数组(自定义念白台词)');
            sp.lines = m.lines;
          }
          return sp;
        }),
        caught: false };
      var keys = {};
      // ── 钥匙拾取(maze 私有玩法):网格 'K' = 地上的钥匙(对移动/raycast = 可走地板,isWall 只挡 '#'/'D')→ 发光钥匙精灵。
      //   有 'K' = 此迷宫"需钥匙",门锁到拾取(g.hasKey)。**会话局部、不入档**:被抓/离开→ g 重置 → 重找(被追时找钥匙的张力)。
      g.items = []; g.hasKey = false;
      // 钥匙外观三级:keyArt 自绘(最高,逃生口)> keyIcon 命名库 glyph > 默认金钥匙 keyLayers。一套共享=所有 'K' 同款(钥匙可互换)。
      var keyArt = (maze.keyArt != null) ? parseMonsterArt(maze.keyArt, 'keyArt') : null;   // 复用怪物 art 管线+校验+镜像;坏则 throw→boot 横幅
      var keyIcoR = (maze.keyArt == null) ? resolveIcon(maze.keyIcon, 'maze.keyIcon', customIcons) : null;   // keyArt 优先 → 有 keyArt 时不解析 keyIcon;customIcons=作者自定义表优先
      if (maze.keyArt != null && maze.keyIcon != null && typeof console !== 'undefined' && console.warn) console.warn('[maze] keyArt 与 keyIcon 同写 → keyArt 优先,keyIcon 被忽略(typo?删其一)');
      var keyArtObj = keyArt || (keyIcoR && keyIcoR !== 'key' ? keyIcoR : null);   // 最终给 'K' 精灵的 art(null → keyLayers 金钥匙;keyIcon:'key' 也→null→keyLayers)
      for (var ky0 = 0; ky0 < grid.length; ky0++) { var krow = grid[ky0] || ''; for (var kx0 = 0; kx0 < krow.length; kx0++) { if (krow[kx0] === 'K') { var kit = { sx: kx0 + 0.5, sy: ky0 + 0.5, taken: false, isKey: true, idx: g.items.length }; if (keyArtObj) { kit.art = keyArtObj.art; kit.artCols = keyArtObj.cols; kit.artRows = keyArtObj.rows; kit.artPal = keyArtObj.pal; } g.items.push(kit); } } }
      // needKey 静态扫描(迷宫批1 M5):grid 已有 'K' **或** 任一 events[].set 含 ch:'K'(机关运行时放出钥匙)→ 门从一开始就锁
      //   ("先解机关、钥匙才现身"编排;HUD 三态文案自动正确)。此刻在 maze.events 校验循环之前(events 尚未逐项 fail-loud 检查)、
      //   只做**只读、宽容的形状嗅探**(不假设已验证)——真正的坏数据仍由下方 events 主校验循环 throw,这里漏检/多检都不影响 fail-loud 覆盖面。
      function setEndsWithKey(arr) {                                // 同一 set[] 按序执行;同格 K 后又覆写时,最终没有钥匙,不能据中间值把出口永久锁死。
        if (!Array.isArray(arr)) return false;
        var last = {};
        for (var ski0 = 0; ski0 < arr.length; ski0++) { var so0 = arr[ski0]; if (so0 && typeof so0.x === 'number' && typeof so0.y === 'number') last[so0.x + ',' + so0.y] = so0.ch; }
        for (var slk in last) if (Object.prototype.hasOwnProperty.call(last, slk) && last[slk] === 'K') return true;
        return false;
      }
      var needKeyFromEvents = false;
      if (Array.isArray(maze.events)) {
        for (var nkE = 0; nkE < maze.events.length && !needKeyFromEvents; nkE++) {
          var nkEv = maze.events[nkE], nkSets = nkEv && [nkEv.set, nkEv.success && nkEv.success.set];
          if (nkSets) { for (var nkA = 0; nkA < nkSets.length && !needKeyFromEvents; nkA++) if (setEndsWithKey(nkSets[nkA])) needKeyFromEvents = true; }
          if (nkEv && Array.isArray(nkEv.pages)) { for (var nkP = 0; nkP < nkEv.pages.length && !needKeyFromEvents; nkP++) { var nkPg = nkEv.pages[nkP], nkPageSets = nkPg && [nkPg.set, nkPg.success && nkPg.success.set]; if (nkPageSets) { for (var nkPA = 0; nkPA < nkPageSets.length && !needKeyFromEvents; nkPA++) if (setEndsWithKey(nkPageSets[nkPA])) needKeyFromEvents = true; } } }
        }
      }
      g.needKey = g.items.length > 0 || needKeyFromEvents;
      function isDenseArray(a) {                                     // Array.every 会跳过空槽;谜题答案/怪物索引含洞会静默通过形状闸。
        if (!Array.isArray(a)) return false;
        for (var dai = 0; dai < a.length; dai++) if (!(dai in a)) return false;
        return true;
      }
      function validateEventActions(obj, label) {                    // R1-b3 pages 与顶层事件共用同一动作形状闸;字段路径进错误文案,避免 page 漏校验。
        var finalSetCh = {};                                         // settle 固定先按序 set、再 warp;同格多写取最后值,warp 必须按结算时真实格判断。
        if (obj.set != null) {
          if (!Array.isArray(obj.set)) throw new Error('[maze event] ' + label + '.set 必须是数组(每项 {x,y,ch}:触发时把格 (x,y) 改成 ch=开/关/破/立)');
          for (var ski = 0; ski < obj.set.length; ski++) { var sc = obj.set[ski] || {};
            if (typeof sc.x !== 'number' || sc.x !== Math.floor(sc.x) || typeof sc.y !== 'number' || sc.y !== Math.floor(sc.y)) throw new Error('[maze event] ' + label + '.set[' + ski + '].x/.y 必须是整数格坐标,得到 x=' + sc.x + ' y=' + sc.y);
            if (sc.y < 0 || sc.y >= grid.length || sc.x < 0 || sc.x >= (grid[sc.y] || '').length) throw new Error('[maze event] ' + label + '.set[' + ski + '] 坐标 (' + sc.x + ',' + sc.y + ') 超出 grid 范围');
            if (sc.ch !== '#' && sc.ch !== '.' && sc.ch !== 'D' && sc.ch !== 'K') throw new Error("[maze event] " + label + '.set[' + ski + "].ch 只支持 '#'(立墙封路)/'.'(开门·破墙=变可走地板)/'D'(关门·立门)/'K'(机关放出钥匙,迷宫批1 M5),得到 " + JSON.stringify(sc.ch));
            finalSetCh[sc.x + ',' + sc.y] = sc.ch;
          }
        }
        if (obj.warp != null) { var wp = obj.warp;
          if (typeof wp !== 'object' || Array.isArray(wp) || typeof wp.x !== 'number' || wp.x !== Math.floor(wp.x) || typeof wp.y !== 'number' || wp.y !== Math.floor(wp.y)) throw new Error('[maze event] ' + label + '.warp 必须是 {x,y[,dir]} 整数格坐标(把玩家传送到该格),得到 ' + JSON.stringify(wp));
          if (wp.y < 0 || wp.y >= grid.length || wp.x < 0 || wp.x >= (grid[wp.y] || '').length) throw new Error('[maze event] ' + label + '.warp 坐标 (' + wp.x + ',' + wp.y + ') 超出 grid 范围');
          var wpk = wp.x + ',' + wp.y;
          var wcell = Object.prototype.hasOwnProperty.call(finalSetCh, wpk) ? finalSetCh[wpk] : cellAt(grid, wp.x, wp.y);
          if (wcell === '#' || wcell === 'D') throw new Error('[maze event] ' + label + '.warp 目标 (' + wp.x + ',' + wp.y + ') 在同次 set 结算后是' + (wcell === '#' ? '墙' : '门') + '、玩家会卡住 → 传送目标最终必须是可走地板(.)或钥匙(K)格');
          if (wp.dir != null && 'NESW'.indexOf(String(wp.dir).toUpperCase()) < 0) throw new Error('[maze event] ' + label + '.warp.dir 必须是 N/E/S/W 之一,得到 ' + wp.dir);
        }
        if (obj.turn != null && 'NESW'.indexOf(String(obj.turn).toUpperCase()) < 0) throw new Error('[maze event] ' + label + '.turn 必须是 N/E/S/W 之一(原地强制转向,spinner),得到 ' + obj.turn);
        if (obj.activateMonsters != null) { var amOk = obj.activateMonsters === true || (isDenseArray(obj.activateMonsters) && obj.activateMonsters.every(function (v) { return typeof v === 'number' && v === Math.floor(v); }));
          if (!amOk) throw new Error('[maze event] ' + label + '.activateMonsters 必须是 true(全部)或整数索引数组,得到 ' + JSON.stringify(obj.activateMonsters));
          if (Array.isArray(obj.activateMonsters)) { for (var ami = 0; ami < obj.activateMonsters.length; ami++) { var amk = obj.activateMonsters[ami]; if (amk < 0 || amk >= g.monsters.length) throw new Error('[maze event] ' + label + '.activateMonsters[' + ami + ']=' + amk + ' 越界(monsters 共 ' + g.monsters.length + ' 个)'); } }
        }
        if (obj.deactivateMonsters != null) { var dmOk = obj.deactivateMonsters === true || (isDenseArray(obj.deactivateMonsters) && obj.deactivateMonsters.every(function (v) { return typeof v === 'number' && v === Math.floor(v); }));
          if (!dmOk) throw new Error('[maze event] ' + label + '.deactivateMonsters 必须是 true(全部)或整数索引数组,得到 ' + JSON.stringify(obj.deactivateMonsters));
          if (Array.isArray(obj.deactivateMonsters)) { for (var dmi = 0; dmi < obj.deactivateMonsters.length; dmi++) { var dmk = obj.deactivateMonsters[dmi]; if (dmk < 0 || dmk >= g.monsters.length) throw new Error('[maze event] ' + label + '.deactivateMonsters[' + dmi + ']=' + dmk + ' 越界(monsters 共 ' + g.monsters.length + ' 个)'); } }
        }
      }
      function validatePuzzleSpec(puz, label) {                    // R1-b4 固定数据模板:只收可审计字段,不允许任意 JS/canvas/rAF 小游戏或拼错字段静默失效。
        if (puz == null) return;
        if (typeof puz !== 'object' || Array.isArray(puz)) throw new Error('[maze puzzle] ' + label + ' 必须是对象');
        if (puz.kind !== 'code' && puz.kind !== 'sequence' && puz.kind !== 'toggle') throw new Error("[maze puzzle] " + label + ".kind 必须是 'code'/'sequence'/'toggle' 之一,得到 " + JSON.stringify(puz.kind));
        if (typeof puz.prompt !== 'string' || !puz.prompt.trim()) throw new Error('[maze puzzle] ' + label + '.prompt 必须是非空字符串');
        var allowed = puz.kind === 'code' ? { kind: 1, prompt: 1, answer: 1, maxLength: 1 } : puz.kind === 'sequence' ? { kind: 1, prompt: 1, choices: 1, answer: 1 } : { kind: 1, prompt: 1, labels: 1, answer: 1 };
        for (var pk in puz) if (Object.prototype.hasOwnProperty.call(puz, pk) && !allowed[pk]) throw new Error('[maze puzzle] ' + label + '.' + pk + ' 不是 ' + puz.kind + ' 模板字段;谜题只接受固定数据,不能嵌入任意逻辑');
        if (puz.kind === 'code') {
          var code = String(puz.answer == null ? '' : puz.answer);
          if ((typeof puz.answer !== 'string' && typeof puz.answer !== 'number') || !/^\d{1,8}$/.test(code) || (typeof puz.answer === 'number' && (!isFinite(puz.answer) || puz.answer !== Math.floor(puz.answer) || puz.answer < 0))) throw new Error('[maze puzzle] ' + label + '.answer 必须是 1–8 位数字 string/number,得到 ' + JSON.stringify(puz.answer));
          var maxLen = puz.maxLength == null ? code.length : puz.maxLength;
          if (typeof maxLen !== 'number' || maxLen !== Math.floor(maxLen) || maxLen < 1 || maxLen > 8 || maxLen < code.length) throw new Error('[maze puzzle] ' + label + '.maxLength 必须是 1–8 的整数且不能短于答案长度 ' + code.length + ',得到 ' + JSON.stringify(puz.maxLength));
        } else if (puz.kind === 'sequence') {
          if (!isDenseArray(puz.choices) || !puz.choices.length || puz.choices.length > 8 || !puz.choices.every(function (v) { return typeof v === 'string' && !!v.trim(); })) throw new Error('[maze puzzle] ' + label + '.choices 必须是 1–8 项无空槽的非空字符串数组');
          if (!isDenseArray(puz.answer) || !puz.answer.length || puz.answer.length > 8 || !puz.answer.every(function (v) { return typeof v === 'string' && puz.choices.indexOf(v) >= 0; })) throw new Error('[maze puzzle] ' + label + '.answer 必须是 1–8 项无空槽数组,且每项来自 choices');
        } else {
          if (!isDenseArray(puz.labels) || !puz.labels.length || puz.labels.length > 8 || !puz.labels.every(function (v) { return typeof v === 'string' && !!v.trim(); })) throw new Error('[maze puzzle] ' + label + '.labels 必须是 1–8 项无空槽的非空字符串数组');
          if (!isDenseArray(puz.answer) || !isDenseArray(puz.labels) || puz.answer.length !== puz.labels.length || !puz.answer.every(function (v) { return typeof v === 'boolean'; })) throw new Error('[maze puzzle] ' + label + '.answer 必须是与 labels 等长、无空槽的 boolean 数组');
        }
      }
      function validatePuzzleOutcome(obj, label, isFail) {          // success 复用普通事件动作子集;fail v1 只给可见反馈,不暗写状态/改格。
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('[maze puzzle] ' + label + ' 必须是对象');
        var allowed = isFail ? { hint: 1 } : { hint: 1, run: 1, set: 1, warp: 1, turn: 1, activateMonsters: 1, deactivateMonsters: 1 };
        for (var oky in obj) if (Object.prototype.hasOwnProperty.call(obj, oky) && !allowed[oky]) throw new Error('[maze puzzle] ' + label + '.' + oky + ' 不允许;谜题结果只接受 ' + Object.keys(allowed).join('/'));
        if (obj.hint != null && (typeof obj.hint !== 'string' || !obj.hint.trim())) throw new Error('[maze puzzle] ' + label + '.hint 存在时必须是非空字符串');
        if (isFail) { if (!obj.hint || !obj.hint.trim()) throw new Error('[maze puzzle] ' + label + '.hint 必须是非空字符串(取消不执行 fail,答错才显示反馈)'); return; }
        if (obj.run != null && typeof obj.run !== 'function') throw new Error('[maze puzzle] ' + label + '.run 存在但不是函数(签名 (state,api)=>void)');
        validateEventActions(obj, label);
        var hasSet = Array.isArray(obj.set) && obj.set.length > 0;
        var hasActivate = obj.activateMonsters === true || (Array.isArray(obj.activateMonsters) && obj.activateMonsters.length > 0);
        var hasDeactivate = obj.deactivateMonsters === true || (Array.isArray(obj.deactivateMonsters) && obj.deactivateMonsters.length > 0);
        if (obj.run == null && !hasSet && obj.warp == null && obj.turn == null && !hasActivate && !hasDeactivate && !obj.hint) throw new Error('[maze puzzle] ' + label + ' 须至少有非空 hint/run/set/warp/turn/activateMonsters/deactivateMonsters 之一,否则解谜成功没有可见结果');
      }
      // ── 坐标事件钩子(maze.events[],可选;缺省无 → 向后兼容零行为变化)──maze 私有词汇:玩家走进格 (x,y) → run(state,api)(同 link.run 族,只写 flag / 推进叙事;**别在 run 里调 api.go 跳节点**=canvas 孤岛中途弹出会割裂,叙事走通关/被抓后的 links 出口)。
      //   触发=**边缘进格**(格变化那帧才触发,非每帧;Dungeon Master / RPG Maker Player Touch 语义,格内转身不重触发)。once=本次进迷宫只触发一次(g.triggered 会话局部、不入档,同 hasKey;被抓/重进重置;持久不重复靠 run 写 state flag 自守)。
      var evList = [];
      if (maze.events != null) {
        if (!Array.isArray(maze.events)) throw new Error('[maze event] maze.events 必须是数组');
        for (var evi = 0; evi < maze.events.length; evi++) {
          var ev0 = maze.events[evi] || {};
          var evHasPages = ev0.pages != null, evPageHasSet = false, evPageHasWarp = false, evPageHasTurn = false;
          if (ev0.run != null && typeof ev0.run !== 'function') throw new Error('[maze event] events[' + evi + '].run 存在但不是函数(玩家进格/互动时调,签名 (state,api)=>void),得到 ' + typeof ev0.run);
          if (ev0.examine != null && typeof ev0.examine !== 'string') throw new Error('[maze event] events[' + evi + '].examine 存在但不是字符串(按 E/Enter 检视时显示的只读线索),得到 ' + typeof ev0.examine);
          if (ev0.trigger != null && ev0.trigger !== 'interact') throw new Error("[maze event] events[" + evi + "].trigger 只支持 'interact'(进格/贴近只暴露上下文,按 E/Enter 或按钮才触发动作),得到 " + JSON.stringify(ev0.trigger));
          if (!evHasPages && ev0.puzzle == null && (ev0.success != null || ev0.fail != null)) throw new Error('[maze puzzle] events[' + evi + '] 写了 success/fail 却没有 puzzle;谜题结果不能脱离谜题静默存在');
          if (!evHasPages && ev0.puzzle != null && (ev0.run != null || ev0.set != null || ev0.warp != null || ev0.turn != null || ev0.activateMonsters != null || ev0.deactivateMonsters != null || ev0.hint != null)) throw new Error('[maze puzzle] events[' + evi + '] 写了 puzzle 时,同层不能再写 hint/run/set/warp/turn/activateMonsters/deactivateMonsters;成功后果必须写进 success,否则会变成打开面板前先执行动作');
          if (!evHasPages && ev0.puzzle != null) validatePuzzleSpec(ev0.puzzle, 'events[' + evi + '].puzzle');
          if (!evHasPages && ev0.puzzle != null) { validatePuzzleOutcome(ev0.success, 'events[' + evi + '].success', false); validatePuzzleOutcome(ev0.fail, 'events[' + evi + '].fail', true); }
          if (!evHasPages && ev0.run == null && ev0.set == null && ev0.warp == null && ev0.turn == null && ev0.activateMonsters == null && ev0.deactivateMonsters == null && ev0.puzzle == null && (ev0.hint == null || ev0.hint === '') && (ev0.examine == null || ev0.examine === '')) throw new Error('[maze event] events[' + evi + '] 须至少有 run/set/warp/turn/activateMonsters/deactivateMonsters(动作)或 puzzle(谜题面板)或 hint(进格/互动提示文字)或 examine(主动检视线索)之一——否则是空事件');
          if (evHasPages) {
            if (!Array.isArray(ev0.pages) || !ev0.pages.length) throw new Error('[maze event] events[' + evi + '].pages 必须是非空数组(默认页放前、状态页放后;后匹配优先)');
            if (ev0.when != null || ev0.run != null || ev0.set != null || ev0.warp != null || ev0.turn != null || ev0.activateMonsters != null || ev0.deactivateMonsters != null || ev0.hint != null || ev0.examine != null || ev0.puzzle != null || ev0.success != null || ev0.fail != null) throw new Error('[maze event] events[' + evi + '].pages 存在时,文本/动作/when/puzzle/success/fail 必须写进 page,顶层只放 x/y/visual/icon/art/face/trigger/once 等锚点字段,避免默认页和状态页双重触发');
            ev0._pages = [];
            for (var epi = 0; epi < ev0.pages.length; epi++) {
              var pg = ev0.pages[epi];
              if (!pg || typeof pg !== 'object' || Array.isArray(pg)) throw new Error('[maze event] events[' + evi + '].pages[' + epi + '] 必须是对象');
              var badPageFields = ['x', 'y', 'once', 'visual', 'icon', 'art', 'palette', 'mirror', 'face'];
              for (var bpfi = 0; bpfi < badPageFields.length; bpfi++) { var bpf = badPageFields[bpfi]; if (pg[bpf] != null) throw new Error('[maze event] events[' + evi + '].pages[' + epi + '].' + bpf + ' 不允许写在 page 上;R1-b3 只允许 page 改文本/动作/trigger,视觉和坐标仍归顶层事件'); }
              if (pg.when != null && typeof pg.when !== 'function') throw new Error('[maze event] events[' + evi + '].pages[' + epi + '].when 存在但不是函数(签名 (state)=>boolean),得到 ' + typeof pg.when);
              if (pg.run != null && typeof pg.run !== 'function') throw new Error('[maze event] events[' + evi + '].pages[' + epi + '].run 存在但不是函数(签名 (state,api)=>void),得到 ' + typeof pg.run);
              if (pg.examine != null && typeof pg.examine !== 'string') throw new Error('[maze event] events[' + evi + '].pages[' + epi + '].examine 存在但不是字符串,得到 ' + typeof pg.examine);
              if (pg.trigger != null && pg.trigger !== 'interact') throw new Error("[maze event] events[" + evi + "].pages[" + epi + "].trigger 只支持 'interact',得到 " + JSON.stringify(pg.trigger));
              if (pg.puzzle == null && (pg.success != null || pg.fail != null)) throw new Error('[maze puzzle] events[' + evi + '].pages[' + epi + '] 写了 success/fail 却没有 puzzle');
              if (pg.puzzle != null && (pg.run != null || pg.set != null || pg.warp != null || pg.turn != null || pg.activateMonsters != null || pg.deactivateMonsters != null || pg.hint != null)) throw new Error('[maze puzzle] events[' + evi + '].pages[' + epi + '] 写了 puzzle 时,同层不能再写 hint/run/set/warp/turn/activateMonsters/deactivateMonsters;成功后果必须写进 success');
              if (pg.puzzle != null) validatePuzzleSpec(pg.puzzle, 'events[' + evi + '].pages[' + epi + '].puzzle');
              if (pg.puzzle != null) { validatePuzzleOutcome(pg.success, 'events[' + evi + '].pages[' + epi + '].success', false); validatePuzzleOutcome(pg.fail, 'events[' + evi + '].pages[' + epi + '].fail', true); }
              if (pg.run == null && pg.set == null && pg.warp == null && pg.turn == null && pg.activateMonsters == null && pg.deactivateMonsters == null && pg.puzzle == null && (pg.hint == null || pg.hint === '') && (pg.examine == null || pg.examine === '')) throw new Error('[maze event] events[' + evi + '].pages[' + epi + '] 须至少有 run/set/warp/turn/activateMonsters/deactivateMonsters 或 puzzle 或 hint/examine 之一;trigger/when 本身不是事件内容');
              pg._pageIndex = epi; ev0._pages.push(pg);
              if (pg.set != null) evPageHasSet = true;
              if (pg.warp != null) evPageHasWarp = true;
              if (pg.turn != null) evPageHasTurn = true;
            }
          }
          if (typeof ev0.x !== 'number' || ev0.x !== Math.floor(ev0.x) || typeof ev0.y !== 'number' || ev0.y !== Math.floor(ev0.y)) throw new Error('[maze event] events[' + evi + '].x/.y 必须是整数格坐标,得到 x=' + ev0.x + ' y=' + ev0.y);
          if (ev0.x < 0 || ev0.x >= (grid[0] || '').length || ev0.y < 0 || ev0.y >= grid.length) throw new Error('[maze event] events[' + evi + '] 坐标 (' + ev0.x + ',' + ev0.y + ') 超出 grid 范围');
          var ecell = cellAt(grid, ev0.x, ev0.y);
          if ((ecell === '#' || ecell === 'D') && typeof console !== 'undefined' && console.warn) console.warn('[maze event] events[' + evi + '] 坐标 (' + ev0.x + ',' + ev0.y + ') 在' + (ecell === '#' ? '墙' : '门') + '格、玩家走不到 → 永不触发(typo?)');
          // 可选可见精灵:先定【视觉角色】再定外观。默认规则保持读法分离:
          //   pickup=显眼关键物(独立 token,可拿走) / floor-pickup|wall-pickup=嵌入式隐藏物(贴近才拿) / marker|trap|plate=贴地机关/陷阱(踩触发) / none=隐形触发。
          //   不从 run/hint 猜“陷阱/隐藏物”——作者若要普通线索不抢眼,显式 visual:'floor-pickup' 或 'wall-pickup';默认 icon/art 仍是醒目 pickup。
          var evVisual = ev0.visual;
          if (evVisual != null) {
            if (typeof evVisual !== 'string' || !Object.prototype.hasOwnProperty.call(EVENT_VISUALS, evVisual)) throw new Error("[maze event visual] events[" + evi + "].visual 必须是 'pickup'/'floor-pickup'/'wall-pickup'/'marker'/'plate'/'trap'/'none' 之一(maze 私有视觉角色),得到 " + evVisual);
          } else {
            evVisual = (ev0.art != null || ev0.icon != null) ? 'pickup' : (ev0.set != null || evPageHasSet || ev0.warp != null || evPageHasWarp || ev0.turn != null || evPageHasTurn) ? 'marker' : 'none';
          }
          var isFloorPickupVisual = evVisual === 'floor-pickup', isWallPickupVisual = evVisual === 'wall-pickup';
          var wallPickupFace = null, wallPickupWallX = null, wallPickupWallY = null;
          if (isWallPickupVisual) {
            wallPickupFace = String(ev0.face || '').toUpperCase();
            if ('NSEW'.indexOf(wallPickupFace) < 0) throw new Error("[maze event visual] events[" + evi + "].face 必须是 N/S/E/W 之一(visual:'wall-pickup' 需要说明物品嵌在哪面墙),得到 " + ev0.face);
            if (ecell === '#' || ecell === 'D') throw new Error("[maze event visual] events[" + evi + "] visual:'wall-pickup' 的 x/y 必须是玩家可站的地板格,得到 " + ecell);
            wallPickupWallX = ev0.x + faceDx(wallPickupFace); wallPickupWallY = ev0.y + faceDy(wallPickupFace);
            var wc0 = cellAt(grid, wallPickupWallX, wallPickupWallY);
            if (wc0 !== '#') throw new Error("[maze event visual] events[" + evi + "] visual:'wall-pickup' 的 face 必须指向相邻墙格#,当前是 " + wc0);
          }
          var evMarkerKind = evVisual === 'trap' ? 'trap' : (ev0.set != null || evPageHasSet) ? 'set' : (ev0.warp != null || evPageHasWarp) ? 'warp' : (ev0.turn != null || evPageHasTurn) ? 'turn' : (evVisual === 'plate' ? 'set' : 'marker');
          var actG = evMarkerKind === 'trap' ? 'skull' : (ev0.set != null || evPageHasSet) ? ACTION_GLYPH.set : (ev0.warp != null || evPageHasWarp) ? ACTION_GLYPH.warp : (ev0.turn != null || evPageHasTurn) ? ACTION_GLYPH.turn : null;
          var iconName = ev0.icon;
          if (iconName == null && (evVisual === 'marker' || evVisual === 'plate' || evVisual === 'trap')) iconName = actG || (evVisual === 'trap' ? 'skull' : 'rune');   // 贴地 marker 只借 glyph 取语义色,不画竖牌
          if (iconName == null && (evVisual === 'pickup' || isFloorPickupVisual || isWallPickupVisual) && actG) iconName = actG;   // escape hatch:作者显式 pickup/嵌入拾取可让机关物品化
          var directPickupFamily = isFloorPickupVisual && ev0.art == null && typeof iconName === 'string' && Object.prototype.hasOwnProperty.call(FLOOR_DECOR_FAMILIES, iconName);
          if ((isFloorPickupVisual || isWallPickupVisual) && iconName == null && ev0.art == null) throw new Error("[maze event visual] events[" + evi + "] visual:'" + evVisual + "' 必须配 icon 或 art,否则隐藏物品没有可发现的嵌入形态");
          var evArt = (ev0.art != null) ? parseMonsterArt(ev0, '事件[' + evi + '].art') : null;   // art 坏数据→throw→boot 横幅
          var evIcoR = (ev0.art == null && iconName != null && !directPickupFamily) ? resolveIcon(iconName, '事件[' + evi + ']', customIcons) : null;       // art 优先 → 有 art 时不解析 icon;customIcons=作者自定义表优先;floor family 名可直接做嵌入小物
          if ((isFloorPickupVisual || isWallPickupVisual) && ev0.art == null && !directPickupFamily && !evIcoR) throw new Error("[maze event visual] events[" + evi + "] visual:'" + evVisual + "' 的 icon 未知或不可画,嵌入式拾取物必须有可发现形态");
          if (ev0.art != null && ev0.icon != null && typeof console !== 'undefined' && console.warn) console.warn('[maze event] events[' + evi + '] art 与 icon 同写 → art 优先,icon 被忽略(typo?删其一)');
          if (evVisual === 'none' && (ev0.art != null || ev0.icon != null) && typeof console !== 'undefined' && console.warn) console.warn("[maze event visual] events[" + evi + "].visual='none' → 忽略 art/icon,只保留触发逻辑");
          var evArtObj = evArt || (evIcoR && evIcoR !== 'key' ? evIcoR : null);
          if (evVisual !== 'none' && (evArtObj || evIcoR === 'key' || directPickupFamily)) {   // 有可见形态:pickup 画立牌 token;floor/wall-pickup 画嵌入物;marker/trap/plate 只取 art/icon 的颜色画贴地机关
            var isMarkerVisual = evVisual === 'marker' || evVisual === 'plate' || evVisual === 'trap';
            ev0._sprite = { sx: ev0.x + 0.5, sy: ev0.y + 0.5, isItem: true, taken: false, idx: 100 + evi, isMarker: isMarkerVisual, markerKind: evMarkerKind, markerVisual: evVisual, isFloorPickup: isFloorPickupVisual, isWallPickup: isWallPickupVisual, wallFace: wallPickupFace, wallDecorFace: oppositeFace(wallPickupFace), wallX: wallPickupWallX, wallY: wallPickupWallY, decorIcon: iconName || '', decorFamily: directPickupFamily ? iconName : floorDecorFamily(iconName || '', theme) };
            if (evArtObj) { ev0._sprite.art = evArtObj.art; ev0._sprite.artCols = evArtObj.cols; ev0._sprite.artRows = evArtObj.rows; ev0._sprite.artPal = evArtObj.pal; }
          }
          ev0._visual = evVisual;   // 声音反馈只读作者显式/默认视觉角色:pickup/floor-pickup/wall-pickup 有拾取声,机关仍走 set/warp/turn 声,不从 hint/run 猜语义。
          ev0._eventIndex = evi;   // R1-b1 上下文检视需要按事件级 once 状态过滤;仍复用既有 g.triggered[evj] 粒度,不引入 page/item 级新状态。
          ev0._touchPickup = isFloorPickupVisual || isWallPickupVisual;   // 嵌入式隐藏物不用“进格即拿”,后面按贴近/朝向边缘触发。
          // ── 声明式动作字段(maze 私有;在 loop 事件块经 api.apply 回调执行=有 grid/g/st 闭包,见 fireMazeEvent)。坏数据解析时 fail-loud throw → boot 横幅(arcade 孤岛,三闸看不进)──
          if (ev0.when != null && typeof ev0.when !== 'function') throw new Error('[maze event] events[' + evi + '].when 存在但不是函数(签名 (state)=>boolean;坐标匹配后再查、为真才触发整条事件——做条件机关/顺序谜题),得到 ' + typeof ev0.when);
          validateEventActions(ev0, 'events[' + evi + ']');
          if (evHasPages) for (var vpi = 0; vpi < ev0._pages.length; vpi++) validateEventActions(ev0._pages[vpi], 'events[' + evi + '].pages[' + vpi + ']');
          evList.push(ev0);
        }
      }
      g.triggered = {}; g.touchingEvents = {}; g.eventHint = null; g.eventHintT = 0; g.puzzleOpen = false; g.puzzleEvent = null; g.prevCX = -999; g.prevCY = -999;   // 坐标事件状态:triggered/eventHint/puzzleOpen 会话局部(同 hasKey 不入档);puzzleOpen 暂停移动/怪物/坐标事件;touchingEvents 让嵌入式拾取只在贴近边缘触发一次;eventHintT=hint 到期时刻(g.tw);prevC=上一帧格(边缘检测;-999=首帧进起点格也算"进入")
      // ── 怪速可调(maze.chaseSpeed 覆盖默认 CHASE;可选正数,格/秒)──
      if (maze.chaseSpeed != null && !(typeof maze.chaseSpeed === 'number' && isFinite(maze.chaseSpeed) && maze.chaseSpeed > 0)) throw new Error('[maze] chaseSpeed 必须是正数(格/秒),得到 ' + maze.chaseSpeed);
      var chase = (maze.chaseSpeed != null) ? maze.chaseSpeed : CHASE;
      // 被抓死亡演出参数(确定性预生成;血流 rivulets 从顶垂下 + 灵魂 hitodama 蓝白飘升)
      var dseed = mulberry32(0xB100D5 ^ grid.length), bi2, wi2;
      g.blood = []; for (bi2 = 0; bi2 < 7; bi2++) g.blood.push({ x: Math.floor(dseed() * CW), w: 2 + Math.floor(dseed() * 5), speed: 70 + dseed() * 150, delay: dseed() * 0.55, max: CH * (0.5 + dseed() * 0.55) });
      g.wisps = []; for (wi2 = 0; wi2 < 8; wi2++) g.wisps.push({ x: (wi2 % 2 ? 0.70 + dseed() * 0.26 : 0.04 + dseed() * 0.26), rise: 0.08 + dseed() * 0.12, sway: 0.03 + dseed() * 0.06, swRate: 1.4 + dseed() * 2.4, r: CH * (0.018 + dseed() * 0.026), ph: dseed() * 6.28 });   // 偏屏幕两侧周边飘(不挡中央脸)

      function occupiedVisualCell(x, y) {
        var ii;
        if (Math.floor(g.px) === x && Math.floor(g.py) === y) return true;              // 起点/当前格:不撒装饰挡第一视野脚下
        if (isDoor(grid, x, y) || cellAt(grid, x, y) === 'K') return true;              // 门/钥匙是功能物,不和 decor 抢读法
        for (ii = 0; ii < g.monsters.length; ii++) if (Math.floor(g.monsters[ii].sx) === x && Math.floor(g.monsters[ii].sy) === y) return true;
        for (ii = 0; ii < g.items.length; ii++) if (!g.items[ii].taken && Math.floor(g.items[ii].sx) === x && Math.floor(g.items[ii].sy) === y) return true;
        for (ii = 0; ii < evList.length; ii++) if (evList[ii].x === x && evList[ii].y === y) return true;
        return false;
      }

      // ── 柱子地标(maze.pillars:装饰性落地锚定精灵;不追玩家/不可拾取/不挡路/纯视觉)──────────────────────────────────
      //   作者字段:maze.pillars=[{x,y,style?,scale?,icon?,art?,palette?}](格坐标数组)。外观优先级:单根 art > 单根 icon > 全局 pillarArt > 全局 pillarIcon > 单根 style > 全局 pillarStyle > stone。
      //   maze.pillarScale(默认 1.8):柱子比怪高耸(1.0=一格墙高,1.8=高出地平线约0.8格);不参与碰撞/可达/追逐。
      //   style 是 maze3d 私有视觉词汇(stone/ruined/obelisk/crystal/wood/metal),只改变程序化外观,不改变碰撞或玩法。
      g.pillars = [];
      if (maze.pillars != null) {
        if (!Array.isArray(maze.pillars)) throw new Error('[maze pillars] maze.pillars 必须是数组(每项 {x,y} 格坐标)');
        var pillarScale = (maze.pillarScale != null ? maze.pillarScale : 1.8);   // 作者 maze.pillarScale > 默认 1.8(柱子比怪高耸;不复用墙面塑形的 topBoost)
        if (typeof pillarScale !== 'number' || !isFinite(pillarScale) || pillarScale <= 0) throw new Error('[maze pillars] maze.pillarScale 必须是正数,得到 ' + maze.pillarScale);
        var defaultPillarStyle = normalizePillarStyle(maze.pillarStyle, 'maze.pillarStyle') || 'stone';
        // 全局柱子外观:pillarArt(自绘) > pillarIcon(GLYPHS 名) > 程序化 pillarStyle。单根 art/icon 可覆盖全局。
        var pillarArtObj = null;
        if (maze.pillarArt != null) { pillarArtObj = parseMonsterArt(maze.pillarArt, 'maze.pillarArt'); }   // 自绘 art(坏则 throw→boot 横幅)
        var pillarIcoR = (maze.pillarArt == null && maze.pillarIcon != null) ? resolveIcon(maze.pillarIcon, 'maze.pillarIcon', customIcons) : null;   // 仅作者显式 pillarIcon 才解析 GLYPHS;都不给→走 pillarLayers 程序化柱子
        var pillarArtFinal = pillarArtObj || (pillarIcoR && pillarIcoR !== 'key' ? pillarIcoR : null);
        for (var pli = 0; pli < maze.pillars.length; pli++) {
          var plp = maze.pillars[pli];
          if (!plp || typeof plp.x !== 'number' || plp.x !== Math.floor(plp.x) || typeof plp.y !== 'number' || plp.y !== Math.floor(plp.y)) throw new Error('[maze pillars] pillars[' + pli + '].x/.y 必须是整数格坐标,得到 x=' + (plp && plp.x) + ' y=' + (plp && plp.y));
          if (plp.x < 0 || plp.x >= (grid[0] || '').length || plp.y < 0 || plp.y >= grid.length) throw new Error('[maze pillars] pillars[' + pli + '] 坐标 (' + plp.x + ',' + plp.y + ') 超出 grid 范围');
          var plCell = cellAt(grid, plp.x, plp.y);
          if (plCell === '#' || plCell === 'D') (typeof console !== 'undefined' && console.warn) && console.warn('[maze pillars] pillars[' + pli + '] 坐标 (' + plp.x + ',' + plp.y + ') 在' + (plCell === '#' ? '墙' : '门') + '格、视觉会被遮挡(typo?)');
          var plScale = (plp.scale != null) ? plp.scale : pillarScale;
          if (typeof plScale !== 'number' || !isFinite(plScale) || plScale <= 0) throw new Error('[maze pillars] pillars[' + pli + '].scale 必须是正数,得到 ' + plp.scale);
          var plStyle = normalizePillarStyle(plp.style, 'pillars[' + pli + '].style') || defaultPillarStyle;
          var plArtFinal = pillarArtFinal;
          if (plp.art != null) plArtFinal = parseMonsterArt({ art: plp.art, palette: plp.palette, mirror: plp.mirror }, 'pillars[' + pli + '].art');
          else if (plp.icon != null) { var plIconR = resolveIcon(plp.icon, 'pillars[' + pli + '].icon', customIcons); plArtFinal = (plIconR && plIconR !== 'key') ? plIconR : null; }
          var plSp = { sx: plp.x + 0.5, sy: plp.y + 0.5, isPillar: true, pillarScale: plScale, pillarStyle: plStyle, idx: pli };
          if (plArtFinal) { plSp.art = plArtFinal.art; plSp.artCols = plArtFinal.cols; plSp.artRows = plArtFinal.rows; plSp.artPal = plArtFinal.pal; }
          g.pillars.push(plSp);
        }
      }

      // ── 主题装饰物(maze.decor + 低密度自动 decor):纯视觉中景层,不挡路/不可拾取/不写 state ──
      //   目的:补「地面太空 / 中景缺比例尺」,但不把装饰变玩法。主题自动 decor 默认是【贴地低矮碎片】,不复用钥匙/道具的竖直 billboard 语义;
      //   显式 maze.decor 仍可写 mode:'sprite' 逃生成竖牌(作者有意识放地标/雕像时用)。两者都只撒在空地板、避开起点/门/钥匙/怪/事件/柱子。
      g.decors = [];
      function decorBlocked(x, y) {
        if (occupiedVisualCell(x, y)) return true;
        for (var pi = 0; pi < g.pillars.length; pi++) if (Math.floor(g.pillars[pi].sx) === x && Math.floor(g.pillars[pi].sy) === y) return true;
        for (var di = 0; di < g.decors.length; di++) if (Math.floor(g.decors[di].sx) === x && Math.floor(g.decors[di].sy) === y) return true;
        return false;
      }
      function pushDecor(x, y, icon, artSpec, scale, who, idx, mode) {
        if (typeof x !== 'number' || x !== Math.floor(x) || typeof y !== 'number' || y !== Math.floor(y)) throw new Error('[maze decor] ' + who + '.x/.y 必须是整数格坐标,得到 x=' + x + ' y=' + y);
        if (x < 0 || x >= (grid[0] || '').length || y < 0 || y >= grid.length) throw new Error('[maze decor] ' + who + ' 坐标 (' + x + ',' + y + ') 超出 grid 范围');
        if (scale != null && !(typeof scale === 'number' && isFinite(scale) && scale > 0)) throw new Error('[maze decor] ' + who + '.scale 必须是正数,得到 ' + scale);
        var decorMode = mode || (artSpec != null ? 'sprite' : 'floor');   // 自绘 art 默认尊重作者形状走竖牌;命名库/自动 decor 默认贴地碎片
        if (decorMode !== 'floor' && decorMode !== 'sprite') throw new Error("[maze decor] " + who + ".mode 必须是 'floor' 或 'sprite',得到 " + decorMode);
        var c = cellAt(grid, x, y);
        if (c === '#' || c === 'D') (typeof console !== 'undefined' && console.warn) && console.warn('[maze decor] ' + who + ' 坐标 (' + x + ',' + y + ') 在' + (c === '#' ? '墙' : '门') + '格、视觉会被遮挡(typo?)');
        var decoArt = artSpec != null ? parseMonsterArt(artSpec, who + '.art') : null;
        var directFamily = artSpec == null && typeof icon === 'string' && Object.prototype.hasOwnProperty.call(FLOOR_DECOR_FAMILIES, icon);
        var decoIco = (artSpec == null && !directFamily) ? resolveIcon(icon, who, customIcons) : null;
        var artFinal = decoArt || (decoIco && decoIco !== 'key' ? decoIco : null);
        if (!directFamily && !artFinal && decoIco !== 'key') return;   // 未知 icon 已由 resolveIcon warn;不画无形 decor;内置 family 名是纯地面痕迹,不经 GLYPHS。
        var tint = artFinal ? glyphTint(artFinal.pal) : (decoIco === 'key' ? [210, 170, 60] : [130, 120, 100]);
        var sp = { sx: x + 0.5, sy: y + 0.5, isDecor: true, decorMode: decorMode, decorScale: scale || (decorMode === 'floor' ? 0.62 : 0.72), decorTint: tint, decorIcon: icon || '', decorFamily: floorDecorFamily(icon || '', theme), idx: 500 + idx };
        if (decorMode === 'sprite' && artFinal) { sp.art = artFinal.art; sp.artCols = artFinal.cols; sp.artRows = artFinal.rows; sp.artPal = artFinal.pal; }
        g.decors.push(sp);
      }
      if (maze.decor != null) {
        if (!Array.isArray(maze.decor)) throw new Error("[maze decor] maze.decor 必须是数组(每项 {x,y,icon?/art?,scale?,mode?};mode 缺省 'floor',需要竖牌才写 'sprite')");
        for (var dei = 0; dei < maze.decor.length; dei++) {
          var de = maze.decor[dei] || {};
          pushDecor(de.x, de.y, de.icon || (T.decor && T.decor[dei % T.decor.length]) || 'rune', de.art != null ? de : null, de.scale, 'maze.decor[' + dei + ']', dei, de.mode);
        }
      }
      var decoList = Array.isArray(T.decor) ? T.decor : [];
      var decoDensity = (maze.decorDensity != null) ? maze.decorDensity : (T.decorDensity || 0);
      if (decoDensity != null && !(typeof decoDensity === 'number' && isFinite(decoDensity) && decoDensity >= 0)) throw new Error('[maze decor] decorDensity 必须是 >=0 数字,得到 ' + decoDensity);
      if (decoList.length && decoDensity > 0) {
        var maxDecor = (maze.maxDecor != null) ? maze.maxDecor : 12;
        if (!(typeof maxDecor === 'number' && isFinite(maxDecor) && maxDecor >= 0)) throw new Error('[maze decor] maxDecor 必须是 >=0 数字,得到 ' + maxDecor);
        var made = 0;
        for (var dyc = 0; dyc < grid.length; dyc++) {
          var drow = grid[dyc] || '';
          for (var dxc = 0; dxc < drow.length; dxc++) {
            if (made >= maxDecor) break;
            if (cellAt(grid, dxc, dyc) !== '.') continue;
            if (decorBlocked(dxc, dyc)) continue;
            var drng = mulberry32(hashStr('decor' + theme + '_' + dxc + '_' + dyc + '_' + grid.length + '_' + drow.length));
            if (drng() >= decoDensity) continue;
            var ico = decoList[Math.floor(drng() * decoList.length) % decoList.length];
            pushDecor(dxc, dyc, ico, null, 0.58 + drng() * 0.22, 'theme.decor[' + made + ']', 1000 + made);
            made++;
          }
        }
      }

      // ── 墙面装饰物(maze.wallDecor + 低密度自动 wallDecor):贴墙中上段,不改光照/碰撞/门逻辑 ──
      //   这是 wallTex(材质)与 wallBands(结构)之后的「具体墙饰」层:藤蔓/触手/裂缝/剑盾/火把/电缆。只按 wall face 定位,不从 run/hint 猜。
      g.wallDecorByFace = {};
      function faceOpen(wx, wy, face) { var dx = face === 'W' ? -1 : face === 'E' ? 1 : 0, dy = face === 'N' ? -1 : face === 'S' ? 1 : 0; return !isWall(grid, wx + dx, wy + dy); }
      function pushWallDecor(wd, who, autoIdx) {
        if (!wd || typeof wd !== 'object' || Array.isArray(wd)) throw new Error('[maze wallDecor] ' + who + ' 必须是对象 {x,y,face,kind,u?,v?,scale?}');
        var wx = wd.x, wy = wd.y, face = String(wd.face || '').toUpperCase(), kind = wd.kind;
        if (typeof wx !== 'number' || wx !== Math.floor(wx) || typeof wy !== 'number' || wy !== Math.floor(wy)) throw new Error('[maze wallDecor] ' + who + '.x/.y 必须是整数墙格坐标,得到 x=' + wx + ' y=' + wy);
        if (wy < 0 || wy >= grid.length || wx < 0 || wx >= (grid[wy] || '').length) throw new Error('[maze wallDecor] ' + who + ' 坐标 (' + wx + ',' + wy + ') 超出 grid 范围');
        if ('NSEW'.indexOf(face) < 0) throw new Error('[maze wallDecor] ' + who + ".face 必须是 N/S/E/W 之一,得到 " + wd.face);
        if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(WALL_DECOR_KINDS, kind)) throw new Error('[maze wallDecor] ' + who + '.kind 必须是 ' + Object.keys(WALL_DECOR_KINDS).join('/') + ' 之一,得到 ' + kind);
        if (wd.u != null && !(typeof wd.u === 'number' && isFinite(wd.u) && wd.u >= 0 && wd.u <= 1)) throw new Error('[maze wallDecor] ' + who + '.u 必须是 0..1 数字,得到 ' + wd.u);
        if (wd.v != null && !(typeof wd.v === 'number' && isFinite(wd.v) && wd.v >= 0 && wd.v <= 1)) throw new Error('[maze wallDecor] ' + who + '.v 必须是 0..1 数字,得到 ' + wd.v);
        if (wd.scale != null && !(typeof wd.scale === 'number' && isFinite(wd.scale) && wd.scale > 0)) throw new Error('[maze wallDecor] ' + who + '.scale 必须是正数,得到 ' + wd.scale);
        var wc = cellAt(grid, wx, wy);
        if (wc !== '#') { (typeof console !== 'undefined' && console.warn) && console.warn('[maze wallDecor] ' + who + ' 坐标 (' + wx + ',' + wy + ') 不是墙格# → 跳过(墙饰只贴墙,不贴门/地板)'); return; }
        if (!faceOpen(wx, wy, face)) { (typeof console !== 'undefined' && console.warn) && console.warn('[maze wallDecor] ' + who + ' face ' + face + ' 外侧不是开放地板 → 跳过(玩家看不到或贴到墙背面)'); return; }
        var sr = mulberry32(hashStr('wallDecor' + theme + '_' + wx + '_' + wy + '_' + face + '_' + kind + '_' + autoIdx));
        var u = wd.u != null ? wd.u : (0.22 + sr() * 0.56), v = wd.v != null ? wd.v : (0.18 + sr() * 0.38), scale = wd.scale || (0.78 + sr() * 0.42);
        v = Math.max(0.10, Math.min(0.66, v));   // 墙脚 0.72 以下留给干净踢脚收口;显式 v 也 clamp 到安全区,防穿帮。
        var key = wx + ',' + wy + ',' + face;
        (g.wallDecorByFace[key] || (g.wallDecorByFace[key] = [])).push({ x: wx, y: wy, face: face, kind: kind, u: u, v: v, scale: scale, seed: autoIdx });
      }
      if (maze.wallDecor) for (var wdi = 0; wdi < maze.wallDecor.length; wdi++) pushWallDecor(maze.wallDecor[wdi], 'maze.wallDecor[' + wdi + ']', wdi);
      var wallList = Array.isArray(T.wallDecor) ? T.wallDecor : [];
      var wallDecorDensity = (maze.wallDecorDensity != null) ? maze.wallDecorDensity : (T.wallDecorDensity || 0);
      var maxWallDecor = (maze.maxWallDecor != null) ? maze.maxWallDecor : 18;
      if (wallList.length && wallDecorDensity > 0 && maxWallDecor > 0) {
        var wmade = 0, faces = ['N', 'E', 'S', 'W'];
        for (var wy0 = 0; wy0 < grid.length; wy0++) { var wrow = grid[wy0] || '';
          for (var wx0 = 0; wx0 < wrow.length; wx0++) {
            if (wmade >= maxWallDecor) break;
            if (cellAt(grid, wx0, wy0) !== '#') continue;
            for (var fi = 0; fi < faces.length; fi++) {
              if (wmade >= maxWallDecor) break;
              var wf = faces[fi]; if (!faceOpen(wx0, wy0, wf)) continue;
              var wrng = mulberry32(hashStr('wdecor' + theme + '_' + wx0 + '_' + wy0 + '_' + wf + '_' + grid.length + '_' + wrow.length));
              if (wrng() >= wallDecorDensity) continue;
              var wk = wallList[Math.floor(wrng() * wallList.length) % wallList.length];
              pushWallDecor({ x: wx0, y: wy0, face: wf, kind: wk }, 'theme.wallDecor[' + wmade + ']', 1000 + wmade);
              wmade++;
            }
          }
        }
      }

      // ── 坐标事件触发(loop 边缘进格时调;统一 when 条件 + run 状态钩子 + 声明式动作 set/warp/turn + hint + once)──
      //   声明式动作不把 grid/g 暴露给作者函数(run 签名只 (state,api)、拿不到内部态),而是作者写纯数据字段、引擎在此执行=更可测 + 更安全(对抗裁决纠正的实现路径)。
      function addWallPickupDecor(evx) {
        var sp = evx._sprite; if (!sp || !sp.isWallPickup) return;
        var sr = mulberry32(hashStr('wallPickup' + sp.wallX + '_' + sp.wallY + '_' + sp.wallDecorFace + '_' + sp.idx));
        // 教学实测:墙面隐藏物若和普通墙饰一样小,即使文案提示也像“墙面纹理”。它仍不发光、不改触发距离,但用更靠近玩家视线的固定壁龛位置 + 更大嵌片 + 浅色纸片默认 tint,让“这面墙有东西”先被看见。
        var u = 0.46 + sr() * 0.08, v = 0.30 + sr() * 0.08, scale = 1.04 + sr() * 0.12;
        var key = sp.wallX + ',' + sp.wallY + ',' + sp.wallDecorFace;
        (g.wallDecorByFace[key] || (g.wallDecorByFace[key] = [])).push({ x: sp.wallX, y: sp.wallY, face: sp.wallDecorFace, kind: 'pickup', u: u, v: v, scale: scale, seed: sp.idx, sprite: sp, tint: glyphTint(sp.artPal) || [226, 214, 174] });
      }
      for (var evwi = 0; evwi < evList.length; evwi++) addWallPickupDecor(evList[evwi]);

      function facingFace(face) { return Math.cos(g.a) * faceDx(face) + Math.sin(g.a) * faceDy(face) > 0.72; }
      function nearWallFace(face) { var fx = face === 'W' ? (g.px - Math.floor(g.px)) : face === 'E' ? (Math.floor(g.px) + 1 - g.px) : face === 'N' ? (g.py - Math.floor(g.py)) : (Math.floor(g.py) + 1 - g.py); return fx <= 0.38; }
      function touchPickupReady(evx) {                             // 嵌入式隐藏物=贴近才拿;显眼 pickup/机关仍走旧“进格触发”。
        if (!evx._touchPickup) return true;
        var cx = evx.x + 0.5, cy = evx.y + 0.5, dx = g.px - cx, dy = g.py - cy;
        if (evx._sprite && evx._sprite.isFloorPickup) return dx * dx + dy * dy < 0.20;   // <~0.45 格:不是刚跨进格边缘就捡
        if (evx._sprite && evx._sprite.isWallPickup) return Math.floor(g.px) === evx.x && Math.floor(g.py) === evx.y && facingFace(evx._sprite.wallFace) && nearWallFace(evx._sprite.wallFace);
        return true;
      }
      function clearMoveIntent() {                                  // 持续输入的统一中断边界:puzzle/退全屏/失焦/进后台都可能吞掉松手事件；键盘、按钮、摇杆、增量转向和惯性必须同族归零。
        keys.fwd = keys.back = keys.left = keys.right = keys.strafeL = keys.strafeR = 0;
        g.fwd = 0; g.strafe = 0; g.turnRate = 0; g.turnDelta = 0; g.av = 0; g.wasBlocked = false; g.stepAcc = 0.40;
        if (g._clearTouchIntent) g._clearTouchIntent();
      }
      function selectEventPage(evx, st) {                            // R1-b3 极简事件页:后匹配优先;没有匹配页=当前不可见/不可触发。
        if (!evx._pages) return null;
        var match = null;
        for (var pi = 0; pi < evx._pages.length; pi++) {
          var pg = evx._pages[pi];
          try { if (!pg.when || pg.when(st || api.state)) match = pg; }
          catch (e) { if (typeof console !== 'undefined' && console.error) console.error('[maze event] events[' + evx._eventIndex + '].pages[' + pi + '].when 抛错:', e); return null; }
        }
        return match;
      }
      function activeEvent(evx, st) {                                  // 返回当前状态下真正参与触发/检视的事件对象;pages 只覆盖文本/动作/trigger,坐标/视觉/once 仍继承顶层锚点。
        if (!evx._pages) return evx;
        var pg = selectEventPage(evx, st); if (!pg) return null;
        var out = {}, k;
        for (k in evx) if (Object.prototype.hasOwnProperty.call(evx, k) && k !== 'pages' && k !== '_pages') out[k] = evx[k];
        for (k in pg) if (Object.prototype.hasOwnProperty.call(pg, k) && k !== '_pageIndex') out[k] = pg[k];
        out._pageIndex = pg._pageIndex;
        return out;
      }
      function contextReady(evx) {                                  // R1-b 共用上下文距离:examine 与 trigger:'interact' 不另造两套阈值,避免作者看到物件却按不到。
        if (evx.once && g.triggered && g.triggered[evx._eventIndex]) return false;   // 已被 once 消耗的物件不再显示上下文按钮,避免看见已拿走/已使用的线索或机关。
        if (evx._touchPickup) return Math.floor(g.px) === evx.x && Math.floor(g.py) === evx.y && touchPickupReady(evx);
        var cx = evx.x + 0.5, cy = evx.y + 0.5, dx = cx - g.px, dy = cy - g.py, d2 = dx * dx + dy * dy;
        if (d2 > 1.45) return false;                                // 普通可见物/地面 marker:只读“身边或面前一格”,不让 E 变远程扫描。
        return d2 < 0.20 || (Math.cos(g.a) * dx + Math.sin(g.a) * dy) > 0.35;   // 贴近可用;稍远则必须大致在视线前方。
      }
      function hasTriggerContent(evx) { return !!(evx && (evx.puzzle || evx.run || evx.set || evx.warp || evx.turn || evx.activateMonsters != null || evx.deactivateMonsters != null || evx.hint)); }
      function isInteractTarget(evx) { return !!(evx && evx.trigger === 'interact' && hasTriggerContent(evx)); }
      function acquireKey(item) {                                    // grid K 的唯一结算口:主动 E/按钮与 loop 自动接触都走这里,防 taken/hasKey/chime 分叉后重复响或状态漂移。
        if (!item || item.taken || g.hasKey) return false;
        item.taken = true; g.hasKey = true; keyChime();
        return true;
      }
      function keyContextScore(item) {                               // K 是 runtime-private 上下文目标,不伪装成作者 events[]。稍远可主动拿,但必须在前方且 DDA 首墙不比钥匙近。
        if (!item || item.taken || g.hasKey) return null;
        var dx = item.sx - g.px, dy = item.sy - g.py, d2 = dx * dx + dy * dy;
        if (d2 > 2.25) return null;                                  // 最远 1.5 格:含对角近邻,不让 E 变远程吸附。
        var front = Math.cos(g.a) * dx + Math.sin(g.a) * dy; if (front <= 0.35) return null;
        var dist = Math.sqrt(d2), hit = castRay(g.px, g.py, Math.atan2(dy, dx));
        if (hit && hit.dist + 0.035 < dist) return null;              // 小容差只吸收格边浮点误差;墙/门先命中则不可隔墙拾取。
        return front * 2 - d2 + 1.4;                                 // 动作优先于旁边只读 examine；同为动作仍由正前方+距离裁决。
      }
      function findContextTarget() {                                // 归一成私有候选描述，避免把 event 对象误传 acquireKey 或把 K 塞进 world schema。
        var best = null, bestScore = -999;
        for (var ei = 0; ei < evList.length; ei++) {
          var base = evList[ei], evx = activeEvent(base, api.state); if (!evx || (!evx.examine && !isInteractTarget(evx)) || !contextReady(evx)) continue;
          var cx = evx.x + 0.5, cy = evx.y + 0.5, dx = cx - g.px, dy = cy - g.py;
          var d2 = dx * dx + dy * dy, front = Math.cos(g.a) * dx + Math.sin(g.a) * dy;
          var score = front * 2 - d2 + (evx._sprite && evx._sprite.isWallPickup ? 0.8 : 0) + (isInteractTarget(evx) ? 1.2 : 0);   // 同范围内优先可用机关,否则玩家按 E 却只读旁边纸条会误导。
          if (score > bestScore) { bestScore = score; best = { kind: 'event', event: evx }; }
        }
        if (g.needKey && !g.hasKey) for (var ki = 0; ki < g.items.length; ki++) {
          var ks = keyContextScore(g.items[ki]);
          if (ks != null && ks > bestScore) { bestScore = ks; best = { kind: 'key', item: g.items[ki] }; }
        }
        return best;
      }
      function syncInteractButton() {                                // 触屏上下文按钮=同一主动 intent 的可见入口;显隐/文案只读当前上下文,不写玩法状态。
        if (!interactBtn) return;
        var target = (!g.caught && !g.won && !g.puzzleOpen) ? findContextTarget() : null;
        interactBtn.style.display = target ? 'block' : 'none';
        if (target) {
          var key = target.kind === 'key', use = !key && isInteractTarget(target.event);
          interactBtn.textContent = key ? '拾取' : (use ? '互动' : '查看');
          interactBtn.setAttribute('aria-label', key ? '拾取' : (use ? '互动' : '查看')); // 与可见文本一致(rank15 fix: '检视'→'查看')
        }
      }
      function useContextTarget() {
        if (g.caught || g.won) return false;
        var target = findContextTarget(); if (!target) return false;
        if (target.kind === 'key') {
          if (!acquireKey(target.item)) return false;
          syncInteractButton(); render();
          return true;
        }
        var evx = target.event;
        if (isInteractTarget(evx)) {                                  // 主动互动:进格/贴近只选中目标;真正 puzzle/run/set/warp/turn/hint/once 只在这里执行。
          triggerMazeEvent(evx, evx._eventIndex);
          syncInteractButton();
          render();
          return true;
        }
        if (!evx.examine) return false;
        g.eventHint = evx.examine;                                   // 只读线索:不走 fireMazeEvent(),不 run/set/warp/turn,不 once,不让 sprite taken。
        g.eventHintT = g.tw + Math.max(2.6, evx.examine.length * 0.12);
        syncInteractButton();
        render();
        return true;
      }
      function mazeEventNeedsState(evx) {
        return !!(evx && (evx.when || evx.run || evx.set || evx.warp || evx.turn || evx.activateMonsters != null || evx.deactivateMonsters != null));   // 有条件/状态钩子/改格/传送/转向/怪物激活停用 → 必须走 api.apply 回调(有 st + grid/g 闭包;且 api.apply 的渲染广播→物品栏等 Amatlas 侧 UI 即时刷新、拾取持久物入档,否则 canvas 孤岛 loop 内不触发引擎渲染=用户实测 bug);纯 hint 事件不走(省一次引擎渲染)。**M1 两键必须计入此处**——漏计=纯 activateMonsters/deactivateMonsters 事件被误判 hint-only、settle() 从不被调用、静默不生效(总方案点名的头号坑,反向变异见测试)。
      }
      function settleMazeEventActions(evx, evj, st) {               // R1-b4:普通事件与 puzzle.success 共享这一套动作结算;避免 run/set/warp/turn/怪物启停/once 分裂成两套执行器。
        if (evx.when && !evx.when(st)) return;                 // 条件不满足 → 整条事件(动作/hint/once)均不触发(下次条件满足再来)
        if (evx.run) evx.run(st, api);                          // 作者状态钩子(写 flag/推 inventory;别在此 api.go 跳节点=孤岛割裂)
        if (evx.set) {
          for (var si = 0; si < evx.set.length; si++) {
            var s = evx.set[si], row = grid[s.y]; if (row == null) continue;
            var prevCh = row[s.x];
            grid[s.y] = row.slice(0, s.x) + s.ch + row.slice(s.x + 1);   // 整行替换;isWall/castRay/A*/doorAhead 共享 grid 引用、每帧重读 → 当帧渲染 + 怪寻路同步生效
            if (s.ch === 'K' && prevCh !== 'K') {   // 机关放出钥匙(迷宫批1 M5):新钥匙精灵,字段形状与解析期 grid 'K' 建项一致(共享外观三级,钥匙可互换)
              var mkit = { sx: s.x + 0.5, sy: s.y + 0.5, taken: false, isKey: true, idx: g.items.length };
              if (keyArtObj) { mkit.art = keyArtObj.art; mkit.artCols = keyArtObj.cols; mkit.artRows = keyArtObj.rows; mkit.artPal = keyArtObj.pal; }
              g.items.push(mkit); g.needKey = true;   // needKey 已在解析期静态扫过本事件、此处冗余置真只为防御(会话内不回退,见下方覆写分支的注释)
            } else if (prevCh === 'K' && s.ch !== 'K') {   // 覆写掉当前是 'K' 的格(写别的 ch):同步移除该格未拾取精灵(防墙里幽灵钥匙)
              for (var rmI = 0; rmI < g.items.length; rmI++) { var rmIt = g.items[rmI]; if (!rmIt.taken && rmIt.sx === s.x + 0.5 && rmIt.sy === s.y + 0.5) { rmIt.taken = true; break; } }
              // needKey 不回退:此把钥匙消失后场上可能再无 'K',但 g.needKey 已在本次进迷宫时定过(同 g.hasKey 一样只在重进/重置时重算)——
              //   若这是唯一钥匙,玩家将再也拿不到而门永锁 = 会话内软锁,这是作者内容自由范畴(见 §14 指引警告),非引擎缺陷。
            }
          }
          mechSetSfx(evx);   // 踩板声 + 远程距离调制(被改格远→闷+回响=远处某处动了)
        }
        if (evx.warp) { g.px = evx.warp.x + 0.5; g.py = evx.warp.y + 0.5; if (evx.warp.dir) g.a = dirToAngle(evx.warp.dir); g.prevCX = evx.warp.x; g.prevCY = evx.warp.y; g.suppressPrev = true; mechWarpSfx(); }   // 传送=改会话局部位置;prevC 设目标格 + 抑制 loop 覆盖 → 传送是「放置」不算「走进」(不误触目标格事件;玩家走出再回正常触发)
        if (evx.turn) { g.a = dirToAngle(evx.turn); mechTurnSfx(); }   // spinner 原地强制转向(改会话局部朝向)
        // M1 怪物激活/停用:固定顺序=先 deactivateMonsters 后 activateMonsters(两键同现时,同一下标最终态=激活;设计稿拍板顺序,勿颠倒)。
        // v1 瞬时开关:只写 active,不碰 fadeAlpha(作者配置什么就是什么,缺省 1;渐隐/渐显留后续批次)。
        // 多特性叠加(先定死,红队要求):g.chaseMult(批2 M3)是全局乘子、与单怪 active 无关;停用怪不参与任何速度/节奏计算——下方 loop 的 `if (!m.active) continue` 天然过滤(:2526),此处无需额外判断。
        if (evx.deactivateMonsters != null) { if (evx.deactivateMonsters === true) { for (var dma = 0; dma < g.monsters.length; dma++) g.monsters[dma].active = false; } else { for (var dmb = 0; dmb < evx.deactivateMonsters.length; dmb++) g.monsters[evx.deactivateMonsters[dmb]].active = false; } }
        if (evx.activateMonsters != null) { if (evx.activateMonsters === true) { for (var ama = 0; ama < g.monsters.length; ama++) g.monsters[ama].active = true; } else { for (var amb = 0; amb < evx.activateMonsters.length; amb++) g.monsters[evx.activateMonsters[amb]].active = true; } }
        if (!evx.set && !evx.warp && !evx.turn) eventPickupSfx(evx._visual);   // 只有纯拾取语义才响拾取反馈;机关继续由 mech* 负责,避免一格双响把反馈糊成噪声。activateMonsters/deactivateMonsters-only 事件 evVisual 默认 'none'(未在 P 段 marker 派生表内新增),eventPickupSfx 已按 visual 二次把关,不会误响拾取声。
        if (evx.hint) { g.eventHint = evx.hint; g.eventHintT = g.tw + Math.max(2.6, evx.hint.length * 0.12); }   // 进格 hint;持续时长【按字数算阅读时间】(每字~0.12s、下限 2.6s;中文 ~8 字/秒 Netflix 字幕级 → 长提示也读得完,治"显示太短")
        if (evx.once) { g.triggered[evj] = true; if (evx._sprite) evx._sprite.taken = true; }   // once=消耗:锁后续 + 可见精灵消失(被"拾取"那样东西)
      }
      function fireMazeEvent(evx, evj) {
        if (mazeEventNeedsState(evx)) { try { api.apply({ run: function (st) { settleMazeEventActions(evx, evj, st); } }); } catch (e) { if (typeof console !== 'undefined' && console.error) console.error('[maze event] events[' + evj + '] 触发抛错:', e); } }   // 隔离 run/动作抛错(rAF loop 无 try/catch、抛则冻屏)=同 engine-core per-presenter 分层:fail-loud(console.error)不崩整体
        else settleMazeEventActions(evx, evj, null);                                        // 纯 hint 事件:无 when/run/动作 → 不读 st、不走 api.apply(省渲染),直接结算 hint/once
      }

      // ── 机关音效(端用户:踩机关该有声;尤其远程机关看不到变化、靠声知道触发)。hbCtx 孤岛实时合成,同 keyChime/footstep 范式;
      //   headless 无 AudioContext 静默退化、确定性固定参数、峰值 ≤0.22 让位心跳(0.36)/压迫 drone(0.5)/开门 thud(0.3)——机关声是离散短瞬态(~0.2-0.7s),与连续声床天然时域错峰、不喧宾夺主。
      //   set 踩板=冲击瞬态(石块 thud + 高频"咔")+【远程距离调制】:据被改格离玩家多远,远→低通变闷 + 长混响 + wet/dry 联动(几乎只剩回响)=声学距离感(高频被石墙吸收、大空间长尾)=玩家凭闷度/回响知道"远处某处动了"。
      function mechSetSfx(evx) {
        if (!hbEnsure() || hbMuted()) return;
        if (hbCtx.resume) { try { hbCtx.resume(); } catch (e) {} }
        if (!g.stepNoise) g.stepNoise = hbNoiseBuf();
        var t = hbCtx.currentTime;
        // body:石板模态合成——3 个非谐 sine(频率比≈1:1.51:2.33),各自衰减时长递减(高频先消失=音色随时间变暗)+ staggered start(包络峰错开=有机),复刻石块真实共振、非单 sine 蜂鸣
        var mf = [[90, 40, 0.20, 0.22], [136, 100, 0.11, 0.14], [210, 180, 0.06, 0.09]], mi;   // [起频,落频,峰 gain,衰减时长]
        for (mi = 0; mi < mf.length; mi++) {
          var mo = hbCtx.createOscillator(); mo.type = 'sine'; mo.frequency.setValueAtTime(mf[mi][0], t); if (mo.frequency.exponentialRampToValueAtTime) mo.frequency.exponentialRampToValueAtTime(mf[mi][1], t + mf[mi][3] * 0.6);
          var mg = hbCtx.createGain(); mg.gain.setValueAtTime(mf[mi][2], t + mi * 0.003); mg.gain.exponentialRampToValueAtTime(0.0001, t + mf[mi][3]);
          mo.connect(mg); mg.connect(hbMaster); mo.start(t); mo.stop(t + mf[mi][3] + 0.02);
        }
        // 激励-共振器:短噪爆发激出"嗡"body(借 mimicSpeakFormant 高 Q bandpass 共振峰=石板被压下的腔体共振)
        var rn = hbCtx.createBufferSource(); rn.buffer = g.stepNoise; var rbp = hbCtx.createBiquadFilter(); rbp.type = 'bandpass'; rbp.frequency.value = 480; rbp.Q.value = 18;
        var rg = hbCtx.createGain(); rg.gain.setValueAtTime(0.12, t); rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        rn.connect(rbp); rbp.connect(rg); rg.connect(hbMaster); rn.start(t); rn.stop(t + 0.37);
        // sub:低频物理重量(衰减比 body 略慢=石板质量感)
        var sub = hbCtx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 48; var slp = hbCtx.createBiquadFilter(); slp.type = 'lowpass'; slp.frequency.value = 100;
        var sg = hbCtx.createGain(); sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.12, t + 0.005); sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
        sub.connect(slp); slp.connect(sg); sg.connect(hbMaster); sub.start(t); sub.stop(t + 0.32);
        // texture:石质 grind(sawtooth → WaveShaper 粗糙 + lowpass 频率包络从开放到闭合=高频被石质吸收)
        var gr = hbCtx.createOscillator(); gr.type = 'sawtooth'; gr.frequency.setValueAtTime(330, t); if (gr.frequency.exponentialRampToValueAtTime) gr.frequency.exponentialRampToValueAtTime(120, t + 0.24);
        var gws = hbCtx.createWaveShaper(); gws.curve = hbDistCurve(6); var grlp = hbCtx.createBiquadFilter(); grlp.type = 'lowpass'; grlp.frequency.setValueAtTime(1800, t); if (grlp.frequency.exponentialRampToValueAtTime) grlp.frequency.exponentialRampToValueAtTime(220, t + 0.28);
        var grg = hbCtx.createGain(); grg.gain.setValueAtTime(0.0001, t); grg.gain.linearRampToValueAtTime(0.14, t + 0.03); grg.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
        gr.connect(gws); gws.connect(grlp); grlp.connect(grg); grg.connect(hbMaster); gr.start(t); gr.stop(t + 0.32);
        // transient:高频"咔"(石板下沉到位的冲击)
        var kn = hbCtx.createBufferSource(); kn.buffer = g.stepNoise; var khp = hbCtx.createBiquadFilter(); khp.type = 'highpass'; khp.frequency.value = 1800; khp.Q.value = 1.4;
        var kg = hbCtx.createGain(); kg.gain.setValueAtTime(0.18, t); kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        kn.connect(khp); khp.connect(kg); kg.connect(hbMaster); kn.start(t); kn.stop(t + 0.07);
        // tail:近端短暗石腔混响(石头硬表面密集反射;与远程段的"远处石门"混响分工)
        if (hbCtx.createConvolver) { var nc = hbCtx.createConvolver(); nc.normalize = true; try { nc.buffer = mazeReverbIR(0.35, 2.5); } catch (e) {} var ncg = hbCtx.createGain(); ncg.gain.value = 0.22; rg.connect(nc); nc.connect(ncg); ncg.connect(hbMaster); }
        // 远程:被改格离玩家越远 → 越闷 + 越长混响 + wet/dry 联动("远处石门错动")。minD=最近被改格距离。
        if (!hbCtx.createConvolver || !(evx.set && evx.set.length)) return;
        var minD = Infinity, i; for (i = 0; i < evx.set.length; i++) { var dx = (evx.set[i].x + 0.5) - g.px, dy = (evx.set[i].y + 0.5) - g.py, d = Math.sqrt(dx * dx + dy * dy); if (d < minD) minD = d; }
        if (minD < 2.5) return;                                   // 近(脚边)→只近端踩板声,不加远处回响
        var far = Math.min(1, (minD - 2.5) / 8), t2 = t + 0.10 + far * 0.12;   // far:0(中)→1(很远);pre-delay 越远越长
        var fo = hbCtx.createOscillator(); fo.type = 'sine'; fo.frequency.setValueAtTime(110, t2); if (fo.frequency.exponentialRampToValueAtTime) fo.frequency.exponentialRampToValueAtTime(55, t2 + 0.5);   // 远处低频石质摩擦
        var fog2 = hbCtx.createGain(); fog2.gain.setValueAtTime(0.0001, t2); fog2.gain.linearRampToValueAtTime(0.16 * (1 - far * 0.45), t2 + 0.05); fog2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.6);
        var fn = hbCtx.createBufferSource(); fn.buffer = g.stepNoise; var flp = hbCtx.createBiquadFilter(); flp.type = 'lowpass'; flp.frequency.value = 600 - far * 420;   // 近 600Hz / 远 180Hz=越远越闷(高频被石墙吸收)
        var fng = hbCtx.createGain(); fng.gain.value = 0.10 * (1 - far * 0.3);
        var conv = hbCtx.createConvolver(); conv.normalize = true; try { conv.buffer = mazeReverbIR(1.1 + far * 0.9, 2.2 + far); } catch (e) {}   // 越远混响越长越空
        var wet = hbCtx.createGain(); wet.gain.value = 0.5 + far * 0.3; var dry = hbCtx.createGain(); dry.gain.value = 0.4 - far * 0.34;   // wet/dry 联动:远→几乎只剩混响尾=远处感物理核心
        fo.connect(fog2); fog2.connect(conv); fog2.connect(dry); fn.connect(flp); flp.connect(fng); fng.connect(conv);
        conv.connect(wet); wet.connect(hbMaster); dry.connect(hbMaster);
        fo.start(t2); fo.stop(t2 + 0.7); fn.start(t2); fn.stop(t2 + 0.7);
      }
      function mechWarpSfx() {                                     // 传送:水晶泛音谱(warpWave PeriodicWave)+ 3 条微失谐去单薄 + 失真加厚 + filter LFO 微颤(不稳定空间)+ 双段混响(吸入窄管→弹出开阔冷亮)=魔法空间,对应 crystal 立牌
        if (!hbEnsure() || hbMuted()) return;
        if (hbCtx.resume) { try { hbCtx.resume(); } catch (e) {} }
        if (!g.stepNoise) g.stepNoise = hbNoiseBuf();
        var t = hbCtx.currentTime, t2 = t + 0.12, dt = [0, 11, -17], i;   // 3 条固定微失谐(互质 cents、确定性、避免规律拍频)
        var wv = null; try { wv = warpWave(); } catch (e) {}             // 水晶谐波谱(失败退 triangle)
        var ws = hbCtx.createWaveShaper(); ws.curve = hbDistCurve(6);     // 魔法厚重谐波密度(复用 zombie 范式)
        var wlp = hbCtx.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 4200; ws.connect(wlp); wlp.connect(hbMaster);   // 失真后接 lowpass 防刺
        var lfo = hbCtx.createOscillator(); lfo.frequency.value = 5.5; var lg = hbCtx.createGain(); lg.gain.value = 700; lfo.connect(lg); lg.connect(wlp.frequency); lfo.start(t); lfo.stop(t2 + 0.26);   // filter 微颤=异度空间共鸣不稳定(借 mimicSpeakFormant wow)
        var og1 = hbCtx.createGain(); og1.gain.setValueAtTime(0.0001, t); og1.gain.linearRampToValueAtTime(0.12, t + 0.04); og1.gain.exponentialRampToValueAtTime(0.0001, t + 0.13); og1.connect(ws);   // 入口段(被吸入,下扫)
        var og2 = hbCtx.createGain(); og2.gain.setValueAtTime(0.0001, t2); og2.gain.linearRampToValueAtTime(0.12, t2 + 0.04); og2.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.22); og2.connect(ws);   // 出口段(弹出,上扫)
        for (i = 0; i < 3; i++) {
          var o1 = hbCtx.createOscillator(); if (wv) { try { o1.setPeriodicWave(wv); } catch (e) { o1.type = 'triangle'; } } else o1.type = 'triangle'; o1.detune.value = dt[i]; o1.frequency.setValueAtTime(300, t); if (o1.frequency.exponentialRampToValueAtTime) o1.frequency.exponentialRampToValueAtTime(80, t + 0.12);
          o1.connect(og1); o1.start(t); o1.stop(t + 0.14);
          var o2 = hbCtx.createOscillator(); if (wv) { try { o2.setPeriodicWave(wv); } catch (e) { o2.type = 'triangle'; } } else o2.type = 'triangle'; o2.detune.value = dt[i]; o2.frequency.setValueAtTime(80, t2); if (o2.frequency.exponentialRampToValueAtTime) o2.frequency.exponentialRampToValueAtTime(1200, t2 + 0.18);
          o2.connect(og2); o2.start(t2); o2.stop(t2 + 0.24);
        }
        var an = hbCtx.createBufferSource(); an.buffer = g.stepNoise; var abp = hbCtx.createBiquadFilter(); abp.type = 'bandpass'; abp.frequency.value = 2200; abp.Q.value = 0.4;   // 空气穿越噪(bandpass=更"嘶")
        var ag = hbCtx.createGain(); ag.gain.setValueAtTime(0.08, t + 0.04); ag.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
        an.connect(abp); abp.connect(ag); ag.connect(hbMaster); an.start(t + 0.04); an.stop(t + 0.38);
        if (hbCtx.createConvolver) {   // 双段混响:入口窄管短暗 + 出口开阔冷亮长尾(空间叙事:被吸进管道→弹出开阔)
          var c1 = hbCtx.createConvolver(); c1.normalize = true; try { c1.buffer = mazeReverbIR(0.2, 3.5); } catch (e) {} var bp1 = hbCtx.createBiquadFilter(); bp1.type = 'bandpass'; bp1.frequency.value = 400; bp1.Q.value = 3; var c1g = hbCtx.createGain(); c1g.gain.value = 0.18; og1.connect(bp1); bp1.connect(c1); c1.connect(c1g); c1g.connect(hbMaster);
          var c2 = hbCtx.createConvolver(); c2.normalize = true; try { c2.buffer = mazeReverbIR(0.9, 1.8); } catch (e) {} var c2g = hbCtx.createGain(); c2g.gain.value = 0.55; og2.connect(c2); c2.connect(c2g); c2g.connect(hbMaster);
        }
      }
      function mechTurnSfx() {                                     // 转向:FM 双振荡器(金属齿轮咬合,非整数比侧带)+ 失真 + 末尾棘轮三连"卡哒"(锁定渐紧)+ 短亮金属腔混响=机械精密,对应 compass 立牌
        if (!hbEnsure() || hbMuted()) return;
        if (hbCtx.resume) { try { hbCtx.resume(); } catch (e) {} }
        if (!g.stepNoise) g.stepNoise = hbNoiseBuf();
        var t = hbCtx.currentTime, i;
        // body:FM——carrier 旋转音高弧(加速→制动)× modulator(非整数比 1:1.5=金属 inharmonic 侧带);modGain(调制深度)随减速由强到弱
        var car = hbCtx.createOscillator(); car.type = 'sine'; car.frequency.setValueAtTime(200, t); if (car.frequency.linearRampToValueAtTime) car.frequency.linearRampToValueAtTime(340, t + 0.08); if (car.frequency.exponentialRampToValueAtTime) car.frequency.exponentialRampToValueAtTime(95, t + 0.28);
        var mod = hbCtx.createOscillator(); mod.type = 'sine'; mod.frequency.setValueAtTime(300, t); if (mod.frequency.linearRampToValueAtTime) mod.frequency.linearRampToValueAtTime(510, t + 0.08); if (mod.frequency.exponentialRampToValueAtTime) mod.frequency.exponentialRampToValueAtTime(142, t + 0.28);
        var modG = hbCtx.createGain(); modG.gain.setValueAtTime(120, t); modG.gain.exponentialRampToValueAtTime(20, t + 0.28); mod.connect(modG); modG.connect(car.frequency);   // FM:modulator→modGain→carrier.frequency
        var ws = hbCtx.createWaveShaper(); ws.curve = hbDistCurve(8);   // 金属失真(复用 zombie WaveShaper 范式;k=8 比 zombie 4 重=金属刺感)
        var tlp = hbCtx.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 850;   // WaveShaper 后接 lowpass 防刷耳
        var og = hbCtx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.linearRampToValueAtTime(0.20, t + 0.03); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
        car.connect(ws); ws.connect(tlp); tlp.connect(og); og.connect(hbMaster); car.start(t); car.stop(t + 0.32); mod.start(t); mod.stop(t + 0.32);
        var gear = hbCtx.createOscillator(); gear.type = 'sawtooth'; gear.frequency.setValueAtTime(203, t); if (gear.frequency.exponentialRampToValueAtTime) gear.frequency.exponentialRampToValueAtTime(98, t + 0.28);   // 第二条微失谐(差~3Hz 拍频=齿轮抖动,照 skull 双振)
        var gearG = hbCtx.createGain(); gearG.gain.setValueAtTime(0.0001, t); gearG.gain.linearRampToValueAtTime(0.07, t + 0.03); gearG.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
        gear.connect(gearG); gearG.connect(tlp); gear.start(t); gear.stop(t + 0.28);
        // lock:末尾棘轮三连"卡哒"(滑过小齿→咬住、渐紧;借 doorOpenSound 时序偏移分层)
        for (i = 0; i < 3; i++) {
          var cn = hbCtx.createBufferSource(); cn.buffer = g.stepNoise; var chp = hbCtx.createBiquadFilter(); chp.type = 'highpass'; chp.frequency.value = 3000 + i * 400; chp.Q.value = 1.2;
          var ct = t + 0.16 + i * 0.022, cg = hbCtx.createGain(); cg.gain.setValueAtTime(0.0001, ct); cg.gain.linearRampToValueAtTime(0.10 + i * 0.05, ct + 0.006); cg.gain.exponentialRampToValueAtTime(0.0001, ct + 0.03);
          cn.connect(chp); chp.connect(cg); cg.connect(hbMaster); cn.start(ct); cn.stop(ct + 0.04);
        }
        // tail:短亮金属腔混响(RT60 最短最亮,与石踩板的闷重混响成材质对比)
        if (hbCtx.createConvolver) { var conv = hbCtx.createConvolver(); conv.normalize = true; try { conv.buffer = mazeReverbIR(0.18, 3.8); } catch (e) {} var rg = hbCtx.createGain(); rg.gain.value = 0.20; tlp.connect(conv); conv.connect(rg); rg.connect(hbMaster); }
      }

      // ── 接触判定:走到门前【正对它】贴近 → 自动推开通关(无需按键;仍要求"正对",非纯距离)──
      function doorAhead(probe) {                                // 正前方 probe 格处是门?用 g.a → 必须正对(看向它)才命中
        var fx = Math.floor(g.px + Math.cos(g.a) * probe), fy = Math.floor(g.py + Math.sin(g.a) * probe);
        return isDoor(grid, fx, fy);
      }
      function isFs() { return !!g.pseudoFs; }   // 统一 CSS 伪全屏(用户定:不用系统全屏 API、所有设备一致;iOS Safari 本就不支持元素全屏)
      function releaseMouseLookIfMine() {                       // 离开沉浸态(退全屏/通关/被抓)时,若鼠标仍被 Pointer Lock 捕获,同步释放;否则结果页看得到但鼠标还被控制=端用户反馈的“逃离/被抓后鼠标没出来”。Pointer Lock 仍是可选增强,失败只降级。
        var d = g._mouseLookDoc || (canvas && canvas.ownerDocument) || hostDoc;
        var locked = !!(d && d.pointerLockElement === canvas);
        if (locked && d.exitPointerLock) { g._pointerUnlocking = true; try { d.exitPointerLock(); } catch (e) { g._pointerUnlocking = false; } }
        if (d && d.removeEventListener && g._mouseLookMoveH) { try { d.removeEventListener('mousemove', g._mouseLookMoveH); } catch (e) {} }
        g.mouseLook = false; g.turnDelta = 0;
        if (!locked) g._pointerUnlocking = false;
      }
      function clearPuzzleOverlayDom() {
        if (!puzzleOverlayEl) return;
        while (puzzleOverlayEl.children && puzzleOverlayEl.children.length) puzzleOverlayEl.removeChild(puzzleOverlayEl.children[0]);
        puzzleOverlayEl.innerHTML = '';
      }
      function closePuzzleOverlay() {                              // 取消/关闭只回到迷宫:不执行 fail、不消耗 once;fail 只由“确认了错误答案”触发。
        if (!g.puzzleOpen) return false;
        g.puzzleOpen = false; g.puzzleEvent = null; g.puzzleInput = null;
        clearMoveIntent();
        if (puzzleOverlayEl) { puzzleOverlayEl.style.display = 'none'; if (puzzleOverlayEl.classList) puzzleOverlayEl.classList.remove('is-open'); }
        if (stage && stage.classList) stage.classList.remove('amatlas-maze-puzzle-active');
        syncInteractButton();
        render();
        return true;
      }
      function puzzleButton(label, aria, fn) {                     // click 同时覆盖鼠标、触屏与键盘激活;几何/skin 由模块私有稳定 class 负责,不另起输入循环。
        var b = hostDoc.createElement('button'); b.className = 'amatlas-maze-puzzle-button'; b.textContent = label; b.setAttribute('type', 'button'); if (aria) b.setAttribute('aria-label', aria);
        b.addEventListener('click', function (e) { if (e && e.preventDefault) e.preventDefault(); fn(); });
        return b;
      }
      function renderPuzzleInput() {
        var q = g.puzzleInput; if (!q) return;
        if (q.kind === 'code') q.readout.textContent = q.code || '—';
        else if (q.kind === 'sequence') q.readout.textContent = q.sequence.length ? q.sequence.join(' → ') : '尚未选择';
        else for (var i = 0; i < q.toggles.length; i++) { var on = q.toggles[i]; q.toggleButtons[i].textContent = q.puzzle.labels[i] + '：' + (on ? '开' : '关'); q.toggleButtons[i].setAttribute('aria-pressed', on ? 'true' : 'false'); }
      }
      function changePuzzleInput(kind, value) {
        var q = g.puzzleInput; if (!q || q.kind !== kind) return false;
        q.feedback.textContent = '';
        if (kind === 'code') {
          var maxLen = q.puzzle.maxLength == null ? String(q.puzzle.answer).length : q.puzzle.maxLength;
          if (value === 'back') q.code = q.code.slice(0, -1); else if (value === 'clear') q.code = ''; else if (/^\d$/.test(value) && q.code.length < maxLen) q.code += value; else return false;
        } else if (kind === 'sequence') {
          if (value === 'back') q.sequence.pop(); else if (value === 'clear') q.sequence = []; else if (q.sequence.length < q.puzzle.answer.length) q.sequence.push(value); else return false;
        } else {
          if (typeof value !== 'number' || value < 0 || value >= q.toggles.length) return false;
          q.toggles[value] = !q.toggles[value];
        }
        renderPuzzleInput();
        return true;
      }
      function settlePuzzleSuccess(evx) {                           // 结果动作仍走普通事件唯一结算器;只把事件级 once/视觉身份补回 success 动作对象。
        var action = {}, sk, src = evx.success || {};
        for (sk in src) if (Object.prototype.hasOwnProperty.call(src, sk)) action[sk] = src[sk];
        action.once = evx.once; action._sprite = evx._sprite; action._visual = evx._visual; action.x = evx.x; action.y = evx.y;
        if (mazeEventNeedsState(action)) api.apply({ run: function (st) { settleMazeEventActions(action, evx._eventIndex, st); } });
        else settleMazeEventActions(action, evx._eventIndex, null);
      }
      function confirmPuzzleAnswer() {
        var q = g.puzzleInput, evx = g.puzzleEvent; if (!q || !evx) return false;
        var answer = q.puzzle.answer, right = q.kind === 'code' ? q.code === String(answer) : q.kind === 'sequence' ? q.sequence.length === answer.length && q.sequence.every(function (v, i) { return v === answer[i]; }) : q.toggles.length === answer.length && q.toggles.every(function (v, i) { return v === answer[i]; });
        if (!right) { q.feedback.textContent = evx.fail.hint; return false; }   // 答错只改 overlay 文案:不进 api.apply、不写 state、不改 grid、不消耗 once。
        try { settlePuzzleSuccess(evx); }
        catch (e) { if (typeof console !== 'undefined' && console.error) console.error('[maze puzzle] events[' + evx._eventIndex + '] 成功结算抛错:', e); q.feedback.textContent = '机关没有响应。'; return false; }
        closePuzzleOverlay();
        return true;
      }
      function openPuzzleOverlay(evx) {                            // R1-b4 三种模板共用一个私有 DOM 表单;所有操作有 ≥44px 触屏按钮,code 另支持数字键盘。
        if (!evx || !evx.puzzle || g.caught || g.won) return false;
        if (!puzzleOverlayEl) return false;
        releaseMouseLookIfMine();
        clearMoveIntent();
        g.puzzleOpen = true; g.puzzleEvent = evx;
        var puz = evx.puzzle;
        clearPuzzleOverlayDom();
        var card = hostDoc.createElement('div'); card.className = 'amatlas-maze-puzzle-dialog'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', puz.prompt);
        var h = hostDoc.createElement('div'); h.className = 'amatlas-maze-puzzle-prompt'; h.textContent = puz.prompt;
        var readout = hostDoc.createElement('div'); readout.className = 'amatlas-maze-puzzle-readout'; readout.setAttribute('aria-live', 'polite');
        var controls = hostDoc.createElement('div'); controls.className = 'amatlas-maze-puzzle-controls';
        var feedback = hostDoc.createElement('div'); feedback.className = 'amatlas-maze-puzzle-feedback'; feedback.setAttribute('role', 'status'); feedback.setAttribute('aria-live', 'assertive');
        var q = { kind: puz.kind, puzzle: puz, code: '', sequence: [], toggles: [], toggleButtons: [], readout: readout, feedback: feedback }; g.puzzleInput = q;
        var i, b;
        if (puz.kind === 'code') {
          for (i = 1; i <= 9; i++) controls.appendChild(puzzleButton(String(i), '数字 ' + i, (function (n) { return function () { changePuzzleInput('code', String(n)); }; })(i)));
          controls.appendChild(puzzleButton('清空', '清空密码', function () { changePuzzleInput('code', 'clear'); }));
          controls.appendChild(puzzleButton('0', '数字 0', function () { changePuzzleInput('code', '0'); }));
          controls.appendChild(puzzleButton('退格', '退格', function () { changePuzzleInput('code', 'back'); })); // ⌫(U+232B) tofu 风险→纯文字
        } else if (puz.kind === 'sequence') {
          for (i = 0; i < puz.choices.length; i++) controls.appendChild(puzzleButton(puz.choices[i], '选择 ' + puz.choices[i], (function (v) { return function () { changePuzzleInput('sequence', v); }; })(puz.choices[i])));
          controls.appendChild(puzzleButton('撤销', '撤销上一个符号', function () { changePuzzleInput('sequence', 'back'); }));
          controls.appendChild(puzzleButton('清空', '清空符号顺序', function () { changePuzzleInput('sequence', 'clear'); }));
        } else {
          q.toggles = puz.labels.map(function () { return false; });
          for (i = 0; i < puz.labels.length; i++) { b = puzzleButton('', '切换 ' + puz.labels[i], (function (ti) { return function () { changePuzzleInput('toggle', ti); }; })(i)); b.className += ' amatlas-maze-puzzle-toggle'; q.toggleButtons.push(b); controls.appendChild(b); }
        }
        var actions = hostDoc.createElement('div'); actions.className = 'amatlas-maze-puzzle-actions';
        var cancel = puzzleButton('关闭', '关闭谜题', function () { closePuzzleOverlay(); }); cancel.className += ' amatlas-maze-puzzle-cancel';
        var confirm = puzzleButton('确认', '确认答案', function () { confirmPuzzleAnswer(); }); confirm.className += ' amatlas-maze-puzzle-confirm';
        actions.appendChild(cancel); actions.appendChild(confirm);
        card.appendChild(h); card.appendChild(readout); card.appendChild(controls); card.appendChild(feedback); card.appendChild(actions); puzzleOverlayEl.appendChild(card);
        renderPuzzleInput();
        puzzleOverlayEl.style.display = 'flex';
        if (puzzleOverlayEl.classList) puzzleOverlayEl.classList.add('is-open');
        if (stage && stage.classList) stage.classList.add('amatlas-maze-puzzle-active');
        syncInteractButton();
        render();
        return true;
      }
      function triggerMazeEvent(evx, evj) {
        if (evx && evx.puzzle) {
          try { if (evx.when && !evx.when(api.state)) return false; }
          catch (e) { if (typeof console !== 'undefined' && console.error) console.error('[maze puzzle] events[' + evj + '] 条件判断抛错:', e); return false; }
          return openPuzzleOverlay(evx);
        }
        fireMazeEvent(evx, evj); return true;
      }
      function fitCanvas() {   // 伪全屏 canvas 按 viewport+比例显式定 px(CSS vw/aspect-ratio 在 canvas+flex+mobile 下不可靠 → JS 算最准):竖屏宽铺满、高=宽/AR 且 ≤64% 高(留下方操作区)、横屏高铺满居中
        var w = winRef || (typeof window !== 'undefined' ? window : null);
        if (!g.pseudoFs || !canvas || !w || !w.innerWidth) return;
        var W = w.innerWidth, H = w.innerHeight, AR = (canvas.width || 480) / (canvas.height || 300), cw, ch;
        if (H >= W) { cw = W; ch = W / AR; if (ch > H * 0.64) { ch = H * 0.64; cw = ch * AR; } }   // 竖屏:宽铺满、高 ≤64vh 留操作区
        else { ch = H; cw = H * AR; if (cw > W) { cw = W; ch = W / AR; } }                          // 横屏:高铺满、宽不溢出
        canvas.style.width = Math.round(cw) + 'px'; canvas.style.height = Math.round(ch) + 'px';
      }
      function enterFs() {   // CSS 伪全屏:stage inline 铺满 viewport + canvas JS 适配(竖屏顶部留操作区/横屏居中)+ resize/转屏重算 + 防误退(锁底层滚动 + history dummy)
        g.pseudoFs = true; if (stage.classList) stage.classList.add('amatlas-maze-pseudofs');
        var s = stage.style; s.position = 'fixed'; s.left = s.top = s.right = s.bottom = '0'; s.width = '100vw'; s.height = '100vh'; s.zIndex = '9999'; s.margin = '0';
        s.maxHeight = 'none'; s.minHeight = '0'; s.aspectRatio = 'auto';   // 内联释放皮肤对 stage 的 max-height/aspect-ratio 约束(ID 选择器 max-height 会把伪全屏 height:100vh 掐死成小框=承星者手机实测;内联优先级最高盖过任何皮肤 CSS)
        s.touchAction = 'none'; s.overscrollBehavior = 'none';   // 防浏览器把空白处拖拽当滚动/橡皮筋回弹(端用户读作"页面动了/返回")
        var bd = hostDoc && hostDoc.body, de = hostDoc && hostDoc.documentElement;   // 锁底层页面滚动:伪全屏期间空白处滑动不带动 body 滚动/overscroll(端用户"空白区域滑动更容易返回"主因之一)
        if (bd && bd.style) { g._bodyOv = bd.style.overflow; g._bodyOsb = bd.style.overscrollBehavior; bd.style.overflow = 'hidden'; bd.style.overscrollBehavior = 'none'; }
        if (de && de.style) { g._htmlOsb = de.style.overscrollBehavior; de.style.overscrollBehavior = 'none'; }
        fitCanvas();
        var w = winRef || (typeof window !== 'undefined' ? window : null);
        if (w && w.addEventListener && !g._fitBound) { listenGlobal(w, 'resize', fitCanvas); listenGlobal(w, 'orientationchange', fitCanvas); g._fitBound = 1; }
        if (w && w.history && w.history.pushState) {   // 防误退:压一个 history dummy → iOS 左缘"后退"手势触发 popstate 时弹掉它,我们退伪全屏(回到页面)而非离开网页;只压一个不重压(第二次后退真离开,不困住用户)
          try { if (!g._fsHist) { w.history.pushState({ atlasMazeFs: 1 }, ''); g._fsHist = 1; } } catch (e) {}
          if (w.addEventListener && !g._popBound) { g._popH = function () { if (g.pseudoFs) { g._fsHist = 0; exitFsIfMine(true); } }; listenGlobal(w, 'popstate', g._popH); g._popBound = 1; }
        }
        if (g._syncTouch) g._syncTouch();
      }
      function exitFsIfMine(fromPop) {   // 退出伪全屏(通关/被抓也调):清 stage+canvas inline + 恢复底层滚动 + 释放 Pointer Lock;fromPop=true 表 popstate(后退手势)已弹 dummy
        releaseMouseLookIfMine();
        if (!g.pseudoFs) return; g.pseudoFs = false;
        if (stage.classList) stage.classList.remove('amatlas-maze-pseudofs');
        var s = stage.style; s.position = 'relative'; s.left = s.top = s.right = s.bottom = s.width = s.height = s.zIndex = s.margin = s.touchAction = s.overscrollBehavior = s.maxHeight = s.minHeight = s.aspectRatio = '';
        var bd = hostDoc && hostDoc.body, de = hostDoc && hostDoc.documentElement;
        if (bd && bd.style) { bd.style.overflow = g._bodyOv || ''; bd.style.overscrollBehavior = g._bodyOsb || ''; }
        if (de && de.style) { de.style.overscrollBehavior = g._htmlOsb || ''; }
        if (canvas) { canvas.style.width = ''; canvas.style.height = ''; }
        if (!fromPop && g._fsHist) { g._fsHist = 0; var w = winRef || (typeof window !== 'undefined' ? window : null); if (w && w.history && w.history.back) try { w.history.back(); } catch (e) {} }   // 按钮/通关退出:消费掉压入的 dummy(history.back 触发 popstate,但 g.pseudoFs 已 false → g._popH 空转)
        if (g._syncTouch) g._syncTouch();
      }
      sessionTeardown = function () { exitFsIfMine(true); };   // stop/重进统一释放 Pointer Lock、mousemove 与伪全屏页面样式；节点导航期间不另触发 history.back
      function pickMimicText(mon) {                             // 台词轮换:不立刻重复 + 偶尔卡住复读(NT"复读碎句"病态);种子确定性。优先怪自带 lines(自定义念白),否则 A 池=FORMANT_SEQ 键 / B 池=MIMIC_TEXTS
        var pool = (mon && mon.lines && mon.lines.length) ? mon.lines : (MIMIC_VOICE === 'speech' ? MIMIC_TEXTS : Object.keys(FORMANT_SEQ));
        if (!pool.length) return 'I love you';
        if (g.mimicLast != null && pool.indexOf(g.mimicLast) >= 0 && g.mimicRep < 2 && g.mimicRng() < 0.3) { g.mimicRep++; return g.mimicLast; }   // 偶尔卡住复读
        var cand = [], ci; for (ci = 0; ci < pool.length; ci++) if (pool[ci] !== g.mimicLast) cand.push(pool[ci]);
        if (!cand.length) cand = pool;
        var pick = cand[Math.floor(g.mimicRng() * cand.length)]; g.mimicLast = pick; g.mimicRep = 0; return pick;
      }
      // ── 脚步声(走动时按主题材质出声;走路原本无声=最大沉浸缺口)。一次性、headless 无 AudioContext 静默退化、确定性(种子噪声 + 左右脚奇偶变音高,禁 Math.random)──
      function footstep() {
        if (!hbEnsure() || hbMuted()) return;
        if (hbCtx.resume) { try { hbCtx.resume(); } catch (e) {} }
        var t = hbCtx.currentTime, tex = T.wallTex;
        var mat = (tex === 'flesh') ? 'wet' : (tex === 'shoji' || tex === 'wood') ? 'soft' : (tex === 'stone' || tex === 'brick' || tex === 'tile' || tex === 'smalltile' || tex === 'panel' || tex === 'hull' || tex === 'sandstone' || tex === 'crystal' || tex === 'ice' || tex === 'plate') ? 'hard' : 'default';
        g.stepParity = (g.stepParity || 0) ^ 1;                  // 左右脚交替:轻微音高差(走动节律真实、非机械重复)
        var vary = g.stepParity ? 1 : 0.92;
        if (!g.stepNoise) g.stepNoise = hbNoiseBuf();            // 噪声 buffer 建一次复用(每步不重建,省 GC)
        var ns = hbCtx.createBufferSource(); ns.buffer = g.stepNoise;
        var bp = hbCtx.createBiquadFilter(), ng = hbCtx.createGain(), bf, q, dec, vol, thudF;
        if (mat === 'hard') { bp.type = 'highpass'; bf = 2200; q = 0.7; dec = 0.07; vol = 0.13; thudF = 120; }       // 石/砖/瓷:清脆高频踏 + 短促
        else if (mat === 'wet') { bp.type = 'lowpass'; bf = 700; q = 1.2; dec = 0.13; vol = 0.15; thudF = 70; }       // 血肉:低闷湿黏 + 拖长
        else if (mat === 'soft') { bp.type = 'lowpass'; bf = 1400; q = 0.6; dec = 0.09; vol = 0.10; thudF = 95; }      // 木/纸:柔和中频
        else { bp.type = 'bandpass'; bf = 1100; q = 0.8; dec = 0.08; vol = 0.11; thudF = 100; }                       // 默认
        bp.frequency.value = bf * vary; bp.Q.value = q;
        ng.gain.setValueAtTime(vol, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + dec);
        ns.connect(bp); bp.connect(ng); ng.connect(hbMaster); ns.start(t); ns.stop(t + dec + 0.02);
        var o = hbCtx.createOscillator(), og = hbCtx.createGain(); o.type = 'sine';   // 低频"重量"thud(脚落地)
        o.frequency.setValueAtTime(thudF * vary, t); if (o.frequency.exponentialRampToValueAtTime) o.frequency.exponentialRampToValueAtTime(thudF * 0.6 * vary, t + 0.06);
        og.gain.setValueAtTime(vol * 0.7, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
        o.connect(og); og.connect(hbMaster); o.start(t); o.stop(t + 0.12);
      }
      // ── 开门音效(通关情绪峰值;按门材质 grind/swish/squelch + 重门 thud + 门外透光的上行解脱音)。winNow 调,stop(true) 保 hbCtx 让它响完;headless 静默退化 ──
      function doorOpenSound() {
        if (!hbEnsure() || hbMuted()) return;
        if (hbCtx.resume) { try { hbCtx.resume(); } catch (e) {} }
        var t = hbCtx.currentTime, style = T.door, wet = (style === 'sphincter'), soft = (style === 'shoji' || style === 'portal');
        if (ambBus) { try { ambBus.gain.setTargetAtTime(0, t, 0.2); } catch (e) {} }     // 通关→压住迷宫氛围床(松一口气)
        if (proxBus) { try { proxBus.gain.setTargetAtTime(0, t, 0.2); } catch (e) {} }   // 通关→压住压迫声
        if (!g.stepNoise) g.stepNoise = hbNoiseBuf();
        var ns = hbCtx.createBufferSource(); ns.buffer = g.stepNoise; ns.loop = true;    // 开门"动作"噪声(~0.7s)
        var bp = hbCtx.createBiquadFilter(), ng = hbCtx.createGain();
        if (wet) { bp.type = 'lowpass'; bp.frequency.setValueAtTime(900, t); if (bp.frequency.exponentialRampToValueAtTime) bp.frequency.exponentialRampToValueAtTime(300, t + 0.7); bp.Q.value = 1.5; }   // 肉门:湿撕裂下沉
        else if (soft) { bp.type = 'bandpass'; bp.frequency.setValueAtTime(1800, t); bp.frequency.linearRampToValueAtTime(2600, t + 0.5); bp.Q.value = 0.6; }   // 障子:纸滑
        else { bp.type = 'bandpass'; bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(180, t + 0.7); bp.Q.value = 1; }                  // 石/铁:沉重 grind 下沉
        ng.gain.setValueAtTime(0.0001, t); ng.gain.linearRampToValueAtTime(soft ? 0.12 : 0.2, t + 0.1); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        ns.connect(bp); bp.connect(ng); ng.connect(hbMaster); ns.start(t); ns.stop(t + 0.85);
        if (!soft) {                                                                     // 硬门/肉门:重门落定 thud
          var o = hbCtx.createOscillator(), og = hbCtx.createGain(); o.type = 'sine';
          o.frequency.setValueAtTime(wet ? 90 : 140, t + 0.5); if (o.frequency.exponentialRampToValueAtTime) o.frequency.exponentialRampToValueAtTime(wet ? 50 : 60, t + 0.85);
          og.gain.setValueAtTime(0.0001, t + 0.5); og.gain.linearRampToValueAtTime(0.3, t + 0.56); og.gain.exponentialRampToValueAtTime(0.0001, t + 1);
          o.connect(og); og.connect(hbMaster); o.start(t + 0.5); o.stop(t + 1.05);
        }
        var r = hbCtx.createOscillator(), rg = hbCtx.createGain(); r.type = 'triangle';  // 门外透进的光=上行解脱音(所有门;通关=松一口气+希望)
        r.frequency.setValueAtTime(330, t + 0.35); if (r.frequency.exponentialRampToValueAtTime) r.frequency.exponentialRampToValueAtTime(660, t + 0.9);
        rg.gain.setValueAtTime(0.0001, t + 0.35); rg.gain.linearRampToValueAtTime(0.16, t + 0.55); rg.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
        r.connect(rg); rg.connect(hbMaster); r.start(t + 0.35); r.stop(t + 1.35);
      }
      function winNow() {                                       // 推开门、通关、停 loop(canvas 停在"门开了"帧;玩家点「走出迷宫」继续)
        if (g.won) return;
        if (g.needKey && !g.hasKey) return;                     // 门锁:此迷宫有钥匙('K')但未拾取 → 不开(HUD 提示去找钥匙)
        g.won = true; doorOpenSound(); render();                // 开门音效在 stop 前触发(stop(true) 保 hbCtx 让它响完)
        api.apply({ run: function (st) { if (node.winKey) st[node.winKey] = true; } });   // win-link 据此解锁
        exitFsIfMine();                                         // 选项变化(「走出迷宫」link 出现)→ 退出全屏,回到选项
        stop(true);                                             // 通关:停 loop/监听,但保 hbCtx(keepAudio)让开门音效响完;离开节点时 install 'enter'→stop() 再关闭
      }
      function scareEnd(m) {                                     // 被抓=惊吓结局:镜头猛转向鬼脸 → 突脸 + 死亡演出(血流/灵魂)+ 写 scareKey
        if (g.caught || g.won) return;
        g.caught = true; g.caughtAt = g.tw; g.trauma = 1;        // 记被抓时刻 → 死亡演出按相对时间动;被抓=最大震屏(随即衰减=暴力一击后归于死寂)
        cancelSpeech();                                         // 被抓瞬间掐掉伪人念白(否则突脸 sting 被半句呢喃糊住;此处 stop() 延迟 2.6s 才调)
        if (m) { g.a = Math.atan2(m.sy - g.py, m.sx - g.px); g.lunge = m; }   // 镜头转向抓住你的鬼(背后抓也回头)→ 极近+居中=脸满屏(突脸)
        render();                                               // 立刻画突脸首帧(若全屏→满屏突脸)
        api.apply({ run: function (st) { if (node.scareKey) st[node.scareKey] = true; } });   // → 模块 render() 带 audio.sfx → 当场播惊叫(声画同时)
        // 被抓不立即退全屏:让突脸+死亡演出满屏播完(~2.6s 后由 loop 退出);否则突脸被缩回小窗
        // 不 stop():保留 rAF 让死亡演出(血流垂下 / 灵魂飘升)继续动;离开节点时 install 的 'enter' 处理器会 stop() 清理
      }

      // ── 键盘:挂 window(最稳;document 兜底)。移动/转身是持续 intent;R1-b 上下文动作(E/Enter)是离散 intent,不进 keys 表,防按住键每帧误触发。──
      if (ENABLE_CONTROLS) {
        var kbTarget = (typeof window !== 'undefined' && window.addEventListener) ? window : hostDoc;
        var keyDownH = function (e) {
          unlockAudio();
          if (g.puzzleOpen) {
            var used = false;
            if (e.key === 'Escape') used = closePuzzleOverlay();
            else if (e.key === 'Enter' && !(e && e.repeat)) { confirmPuzzleAnswer(); used = true; }
            else if (g.puzzleInput && g.puzzleInput.kind === 'code' && /^\d$/.test(e.key || '')) used = changePuzzleInput('code', e.key);
            else if (g.puzzleInput && g.puzzleInput.kind === 'code' && (e.key === 'Backspace' || e.key === 'Delete')) used = changePuzzleInput('code', e.key === 'Backspace' ? 'back' : 'clear');
            if (used && e.preventDefault) e.preventDefault(); return;
          }
          if ((e.key === 'e' || e.key === 'E' || e.key === 'Enter') && !(e && e.repeat)) { if (useContextTarget() && e.preventDefault) e.preventDefault(); return; }
          var k = mapKey(e.key); if (k) { keys[k] = 1; e.preventDefault(); }
        };
        var keyUpH = function (e) { var k = mapKey(e.key); if (k) keys[k] = 0; };
        listenGlobal(kbTarget, 'keydown', keyDownH); listenGlobal(kbTarget, 'keyup', keyUpH);
        var intentBlurTarget = (typeof window !== 'undefined' && window.addEventListener) ? window : null;
        listenGlobal(intentBlurTarget, 'blur', function () { clearMoveIntent(); });
        var intentVisibilityTarget = hostDoc && hostDoc.addEventListener ? hostDoc : null;
        listenGlobal(intentVisibilityTarget, 'visibilitychange', function () { if (intentVisibilityTarget.hidden) clearMoveIntent(); });
      }

      // ── 屏上控制(鼠标/触屏按住即走 → 不依赖键盘焦点)+ 点画面给焦点 ──
      try { if (ENABLE_CONTROLS) {
        if (canvas.addEventListener) canvas.addEventListener('pointerdown', function () { unlockAudio(); try { canvas.focus(); } catch (e) {} });
        // ── 鼠标 mouselook(R1-4·opt-in:点 canvas 进 Pointer Lock 沉浸转向、ESC 退出;锁定时 movementX→g.turnDelta 增量转向) ──
        //   未锁时 movementX 不可信(MDN)→ 只在锁定时挂 mousemove;headless mock canvas 无 requestPointerLock → 整块跳过(退化不抛)。
        if (canvas.requestPointerLock) {
          g.canMouseLook = true;   // 桌面支持 Pointer Lock → HUD 显 mouselook 提示(触屏无此 API、不显、改用摇杆〔批2〕)
          var mlDoc = canvas.ownerDocument || hostDoc;
          var onMML = function (e) { g.turnDelta = (g.turnDelta || 0) + (e.movementX || 0) * 0.0025; };   // 0.0025 弧度/像素(three.js 量级);累加进增量转向意图、与右半屏 swipe 共用手感
          g._mouseLookDoc = mlDoc; g._mouseLookMoveH = onMML;
          var mlLastExitT = -99, mlLastDenyT = -99;                 // Chrome/Edge:用户刚 ESC 退出 Pointer Lock 后,同一小段时间内再 request 会拒绝并走 Promise rejection;用游戏时钟冷却,不让可选 mouselook 报到全局错误横幅。
          function requestMouseLook() {
            if (mlDoc.pointerLockElement === canvas) return;
            if (g.tw - mlLastExitT < 0.85 || g.tw - mlLastDenyT < 0.45) return;   // 退出锁定后的短冷却:避免“刚退出立即重进”触发浏览器安全拒绝;用户再次点画面稍等一拍即可重进。
            try { var req = canvas.requestPointerLock(); if (req && typeof req.catch === 'function') req.catch(function () { mlLastDenyT = g.tw; }); }
            catch (e) { mlLastDenyT = g.tw; }                      // Pointer Lock 是沉浸增强,失败只退回键盘/按钮/触屏转向,不能炸游戏。
          }
          canvas.addEventListener('pointerdown', requestMouseLook);
          if (mlDoc.addEventListener) { listenGlobal(mlDoc, 'pointerlockchange', function () {
            if (mlDoc.pointerLockElement === canvas) { g._pointerUnlocking = false; if (!g.mouseLook) listenGlobal(mlDoc, 'mousemove', onMML); g.mouseLook = true; }   // 进入(ESC 退出由浏览器强制 → pointerlockchange 在此同步 g.mouseLook)；状态未变时重复事件不重复登记
            else { if (mlDoc.removeEventListener) mlDoc.removeEventListener('mousemove', onMML); if (g.mouseLook && !g._pointerUnlocking) mlLastExitT = g.tw; g.mouseLook = false; g._pointerUnlocking = false; }
          }); listenGlobal(mlDoc, 'pointerlockerror', function () { mlLastDenyT = g.tw; g.mouseLook = false; g._pointerUnlocking = false; }); }
        }
        if (stage.style) stage.style.position = 'relative';
        var winRef = hostDoc.defaultView || (typeof window !== 'undefined' ? window : null);
        var isTouch = !!(winRef && ((winRef.matchMedia && winRef.matchMedia('(pointer: coarse)').matches) || ('ontouchstart' in winRef)));   // 触屏设备(headless 无 matchMedia/ontouchstart → false → 走桌面分支退化)
        // ── 四向按钮(坦克模式/十字 D-pad):桌面 escape hatch + 触屏默认控件(用户要求保留;触屏全屏后让位摇杆) ──
        //   十字布局:前进居顶中/后退居底中/左右分居中间两侧,前进→后退不相邻防误触(rank19 fix)。
        //   ↰↱(U+21B0/21B1) 换回覆盖良好的 ←→(C 批 tofu fix)。
        var ctrls = hostDoc.createElement('div');
        ctrls.className = 'amatlas-maze-controls';
        ctrls.style.cssText = 'display:grid;justify-content:center;gap:5px;margin:10px auto 2px;pointer-events:auto;touch-action:none';   // 流式排在画面壳「下方」(不再 absolute 浮在 canvas 上=不遮视野);margin auto 居中
        ctrls.style.gridTemplateColumns = 'repeat(3,48px)';
        ctrls.style.gridTemplateRows = 'repeat(3,44px)';
        ctrls.style.gridTemplateAreas = '". fwd ." "left . right" ". back ."';
        var DPAD_LABEL = { left: '←', fwd: '▲', back: '▼', right: '→' };
        var DPAD_ARIA  = { left: '左转', fwd: '前进', back: '后退', right: '右转' };
        var mkBtn = function (dir) {
          var b = hostDoc.createElement('button');
          b.className = 'amatlas-maze-dpad amatlas-touchpad-key';   // 共享皮肤感知键帽(长相/按下/焦点/降噪在 ui/touch-controls.css);amatlas-maze-dpad 保留作行为/测试钩
          b.textContent = DPAD_LABEL[dir]; b.setAttribute('aria-label', DPAD_ARIA[dir]);
          // 只留尺寸/功能:D-pad 已排在画面壳「下方」不遮视野;touch-action 内联保留(功能性,防 CSS 缺失吞滑动)。
          b.style.cssText = 'pointer-events:auto;width:48px;height:44px;touch-action:none';
          b.style.gridArea = dir;
          var set = function (e) { unlockAudio(); keys[dir] = 1; if (e && e.preventDefault) e.preventDefault(); if (b.classList) b.classList.add('is-pressed'); };
          var clr = function () { keys[dir] = 0; if (b.classList) b.classList.remove('is-pressed'); };
          b.addEventListener('pointerdown', set); b.addEventListener('pointerup', clr);
          b.addEventListener('pointerleave', clr); b.addEventListener('pointercancel', clr);
          b.addEventListener('click', function () { unlockAudio(); keys[dir] = 1; setTimeout(function () { keys[dir] = 0; }, 100); }); // 键盘 Enter/Space 可达
          return b;
        };
        ctrls.appendChild(mkBtn('fwd')); ctrls.appendChild(mkBtn('left')); ctrls.appendChild(mkBtn('right')); ctrls.appendChild(mkBtn('back'));
        var ib = hostDoc.createElement('button');
        ib.textContent = '查看'; ib.setAttribute('aria-label', '查看'); // aria-label 与可见文本一致(rank15 fix)
        ib.className = 'amatlas-touchpad-key';   // 共享皮肤感知键帽(与 D-pad 同一套系统)
        ib.style.cssText = 'display:none;margin:2px auto 0;min-width:56px;height:46px;padding:0 16px;font-size:14px;touch-action:none';   // 流式:有检视目标时显示在 D-pad 下方;min-width:56px/height:46px 保命中区(测试锁),font-size 覆盖共享类 19px
        ib.addEventListener('pointerdown', function (e) { unlockAudio(); if (useContextTarget() && e && e.preventDefault) e.preventDefault(); });
        ib.addEventListener('click', function () { unlockAudio(); useContextTarget(); }); // 键盘/辅助技术可达(rank9/14)
        var pov = hostDoc.createElement('div'); pov.className = 'amatlas-maze-puzzle-overlay'; pov.style.display = 'none';
        stage.appendChild(ctrls); stage.appendChild(ib); stage.appendChild(pov); interactBtn = ib; puzzleOverlayEl = pov;
        syncInteractButton();
        if (isTouch) {
          // ── 触屏(R1-4 批2):全屏后启用 左手浮动摇杆(移动·8 向斜走) + 右半屏 swipe-look(转向) → intent 层 g.fwd/g.strafe/g.turnDelta ──
          //   默认隐藏、全屏才显(用户定:非全屏用四向按钮坦克;全屏=浏览器边缘手势被屏蔽=滑动安全 + 沉浸斜走);四向按钮全屏时让位。左移右看=行业肌肉记忆。
          var ovr = hostDoc.createElement('div');
          ovr.style.cssText = 'position:absolute;inset:0;z-index:2;display:none;touch-action:none;-webkit-user-select:none;user-select:none';   // 默认 display:none(全屏切显);touch-action:none 防浏览器把拖拽当平移/缩放
          var knob = hostDoc.createElement('div');   // 浮动摇杆底座(首触显示在落点;隐形摇杆玩家难感知 → 给视觉引导)
          knob.style.cssText = 'position:absolute;width:96px;height:96px;margin:-48px;border-radius:50%;border:2px solid rgba(255,255,255,.3);background:rgba(16,24,36,.35);display:none;pointer-events:none';
          var stick = hostDoc.createElement('div');
          stick.style.cssText = 'position:absolute;width:44px;height:44px;left:26px;top:26px;border-radius:50%;background:rgba(220,230,240,.5)';
          knob.appendChild(stick); ovr.appendChild(knob);
          var thint = hostDoc.createElement('div');
          thint.textContent = '画面下方空白处拖动(手指靠中间) · 左半 = 移动(可斜走) · 右半 = 转向';
          thint.style.cssText = 'position:absolute;left:0;right:0;bottom:10px;text-align:center;font:11px system-ui,sans-serif;color:rgba(221,230,240,.55);pointer-events:none';
          ovr.appendChild(thint);
          stage.appendChild(ovr);
          var moveId = null, moveOX = 0, moveOY = 0, turnId = null, turnLX = 0, RR = 48, EDGE = 40, EDGE_B = 32;   // moveId/turnId 各记一指(按 pointerId 早退不串);RR=摇杆半径;EDGE=左/右边缘忽略宽(避 iOS 左缘后退/安卓边缘返回)、EDGE_B=底部忽略高(避 iOS 底部 home 条上滑);加宽自 24(端用户实测空白区滑动仍易触发系统手势→操作点往屏中收)
          var orect = function () { return ovr.getBoundingClientRect ? ovr.getBoundingClientRect() : { left: 0, top: 0, width: 480, height: 300 }; };
          ovr.addEventListener('pointerdown', function (e) {
            var rc = orect(), lx = e.clientX - rc.left, ly = e.clientY - rc.top;
            if (lx < EDGE || lx > rc.width - EDGE || ly > rc.height - EDGE_B) return;   // 避开左/右/底物理边缘(系统边缘手势区);操作点往屏中收 = 治端用户"空白区域滑动更容易返回"(手指太贴边触发系统手势;网页 JS 拦不死系统手势→只能不让手指落在边缘)
            var por = !!(winRef && winRef.matchMedia && winRef.matchMedia('(orientation: portrait)').matches);
            var cb = canvas.getBoundingClientRect ? canvas.getBoundingClientRect().bottom : 0;   // 画面(canvas)底边
            if (por && cb && e.clientY < cb) return;   // 竖屏:画面区(canvas 上)不启动操作 → 手指只在画面下方空白处操作(不碰画面、靠中间、远离边缘=用户要的);横屏 canvas 铺满则全响应(摇杆叠画面,无伤大雅)
            unlockAudio();
            if (lx < rc.width / 2 && moveId === null) { moveId = e.pointerId; moveOX = e.clientX; moveOY = e.clientY; knob.style.left = lx + 'px'; knob.style.top = ly + 'px'; knob.style.display = 'block'; }   // 左半 → 浮动摇杆(落点即中心)
            else if (turnId === null) { turnId = e.pointerId; turnLX = e.clientX; }   // 右半 → swipe 转向
            if (ovr.setPointerCapture) try { ovr.setPointerCapture(e.pointerId); } catch (er) {}   // 拖出边界仍收事件
            if (e.preventDefault) e.preventDefault();
          });
          ovr.addEventListener('pointermove', function (e) {
            if (e.pointerId === moveId) {
              var dx = (e.clientX - moveOX) / RR, dy = (e.clientY - moveOY) / RR, mag = Math.sqrt(dx * dx + dy * dy);
              if (mag > 1) { dx /= mag; dy /= mag; }   // clamp 到摇杆半径内
              var dead = 0.15;   // 径向死区(归一后过滤手抖)
              g.strafe = Math.abs(dx) > dead ? dx : 0; g.fwd = Math.abs(dy) > dead ? -dy : 0;   // 屏 y 向下 → 前进取负;横纵同时给值 = 斜走
              stick.style.left = (26 + dx * RR * 0.5) + 'px'; stick.style.top = (26 + dy * RR * 0.5) + 'px';
            } else if (e.pointerId === turnId) { g.turnDelta = (g.turnDelta || 0) + (e.clientX - turnLX) * 0.006; turnLX = e.clientX; }   // swipe 帧间增量 → 转向(与鼠标 mouselook 共用 g.turnDelta、同手感)
          });
          var clearTouchIntent = function () { moveId = turnId = null; g.fwd = 0; g.strafe = 0; knob.style.display = 'none'; stick.style.left = '26px'; stick.style.top = '26px'; };
          g._clearTouchIntent = clearTouchIntent;   // 让统一中断边界也能释放局部 pointerId/摇杆视觉；否则 blur 后旧 pointerId 会占住下一次触摸。
          var relT = function (e) { if (e.pointerId === moveId) { moveId = null; g.fwd = 0; g.strafe = 0; knob.style.display = 'none'; stick.style.left = '26px'; stick.style.top = '26px'; } if (e.pointerId === turnId) turnId = null; };   // 松手归零(防意图量卡住)
          ovr.addEventListener('pointerup', relT); ovr.addEventListener('pointercancel', relT);   // pointercancel(来电/系统手势中断)同等处理
          // 全屏切换:进全屏 → 摇杆显 + 四向按钮隐(沉浸 + 边缘手势屏蔽);退全屏 → 摇杆隐 + 四向显(坦克),并重置摇杆态防意图量卡住
          var syncTouchMode = function () { var fs = isFs(); ovr.style.display = fs ? 'block' : 'none'; ctrls.style.display = fs ? 'none' : 'grid'; if (!fs) clearTouchIntent(); }; // 十字 D-pad 是 grid,恢复时用 'grid' 而非 'flex'
          g._syncTouch = syncTouchMode;   // 挂给 enterFs/exitFs(CSS 伪全屏切换时手动调,因伪全屏无 fullscreenchange 事件)
          syncTouchMode();   // 初始化非全屏态(摇杆隐 / 四向显;显式设 style.display,不只依赖 cssText 字符串)
          if (hostDoc.addEventListener) { listenGlobal(hostDoc, 'fullscreenchange', syncTouchMode); listenGlobal(hostDoc, 'webkitfullscreenchange', syncTouchMode); }
        }
        // 全屏(沉浸):⛶ 按钮进/出全屏(用户手势);通关/被抓=选项变化时自动退出(见 winNow/scareEnd)。canvas 等比放大、像素化保 lo-fi。opts.fullscreen:false 关。
        if (opts.fullscreen !== false) {   // 统一伪全屏:总给沉浸按钮(不依赖系统全屏 API,iOS/安卓/桌面一致;opts.fullscreen:false 关)
          if (hostDoc.getElementById && !hostDoc.getElementById('amatlas-maze-fs-style') && hostDoc.head) {
            var fst = hostDoc.createElement('style'); fst.id = 'amatlas-maze-fs-style';
            fst.textContent = '.amatlas-maze-pseudofs{position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:flex-start}.amatlas-maze-pseudofs canvas{image-rendering:pixelated;display:block;flex:none}.amatlas-maze-pseudofs .amatlas-maze-screen{position:absolute;inset:0;width:auto;height:auto;max-height:none;aspect-ratio:auto;margin:0;border:0;border-radius:0;box-shadow:none;overflow:hidden;background:#000}.amatlas-maze-pseudofs .amatlas-maze-screen::after{display:none}@media (orientation:landscape){.amatlas-maze-pseudofs{justify-content:center}}';   // D-pad 键帽长相/按下/焦点/降噪已移到共享类 .amatlas-touchpad-key(ui/touch-controls.css);此处只留伪全屏 + 画面壳铺满
            if (hostDoc.head.appendChild) hostDoc.head.appendChild(fst);
          }
          if (stage.classList) stage.classList.add('amatlas-maze-stage');
          var fsBtn = hostDoc.createElement('button');
          // ⛶(U+26F6) tofu 风险(rank4) → 内联 SVG 全屏图标;pointerdown→click 让键盘 Enter/Space 可达(rank9)
          fsBtn.setAttribute('aria-label', '全屏');
          fsBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" focusable="false" aria-hidden="true" style="pointer-events:none;display:block"><path d="M1 1h4v2H3v2H1zm10 0h4v4h-2V3h-2zM1 11h2v2h2v2H1zm12 2h-2v2h4v-4h-2z"/></svg>';
          fsBtn.style.cssText = 'position:absolute;top:8px;right:8px;z-index:3;pointer-events:auto;width:44px;height:40px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;border:1.5px solid rgba(200,170,115,.48);background:linear-gradient(180deg,rgba(46,39,28,.4),rgba(18,14,9,.42));color:#f4dcaa;cursor:pointer;touch-action:none;-webkit-user-select:none;user-select:none;box-shadow:0 1px 4px rgba(0,0,0,.4)';
          fsBtn.addEventListener('click', function (e) { unlockAudio(); if (e && e.preventDefault) e.preventDefault(); if (isFs()) exitFsIfMine(); else enterFs(); }); // click 覆盖鼠标/触屏/键盘三路(rank9)
          stage.appendChild(fsBtn);
        }
        // (声音开关不在迷宫里做:它是引擎级工具栏控件 = present-audio 的 🔊 进 #plugin-bar、和 save/map 同排、控全局 amatlas-muted〔maze 也读〕,给所有游戏用。迷宫音频在玩家与迷宫交互〔键/画面/移动键〕时由 unlockAudio 解锁。)
        // HUD 提示=挂在 stage 内、悬在画面顶部的浮层(position:absolute,stage 已 position:relative)。
        //   普通模式悬在 canvas 顶、全屏时 stage 即全屏元素同样悬顶 → 一套两用,不再分裂「stage 外文字行 + :fullscreen 浮层」
        //   (旧分裂法:全屏看不到 / 普通模式下方灰字太弱=用户实测两头都不显眼 → 根治)。半透明渐变底=暗场也读得清、不挡中央画面。
        if (hostDoc.getElementById && !hostDoc.getElementById('amatlas-maze-hint-style') && hostDoc.head) {
          var hst = hostDoc.createElement('style'); hst.id = 'amatlas-maze-hint-style';
          hst.textContent = '.amatlas-maze-hint{position:absolute;top:0;left:0;right:0;padding:9px 14px 18px;text-align:center;font:14px/1.4 system-ui,sans-serif;color:#eef3f8;text-shadow:0 1px 3px #000,0 0 6px #000;background:linear-gradient(180deg,rgba(8,11,18,.82),rgba(8,11,18,0));pointer-events:none;z-index:2;min-height:1.2em}';
          if (hostDoc.head.appendChild) hostDoc.head.appendChild(hst);
        }
        var he = hostDoc.createElement('div'); he.className = 'amatlas-maze-hint';
        if (stage.appendChild) { stage.appendChild(he); hudEl = he; }   // 挂 stage 内(悬画面顶);无 appendChild → hudEl 留 null(退化、不崩)
      } } catch (e) { /* 按钮是增强,stub DOM 创建失败不影响键盘/退化 */ }

      // 距离明暗系数(**单一真相**:墙底色 / 纹理缝 drawWallTex / 门叠层 drawDoorOverlay 共用 → torch 摇曳/二次衰减时三者同步、不脱节)。
      //   torch=二次径向衰减(近骤亮→远绵延暗)× 8Hz 摇曳;无 torch 主题=逐字节原线性雾。
      function distF(dist) {
        if (T.torch) { var ratio = Math.min(1, dist / ((T.fogRange || 9) * (T.torch.range || 0.7))); return Math.max(0.10, 1 - ratio * ratio) * torchFlick; }
        return Math.max(0.12, 1 / (1 + dist * (3.0 / (T.fogRange || 9))));   // 无 torch 主题:双曲线衰减(近骤亮、远绵延暗=「光源在身上」)替代线性截断的「均匀变灰」
      }
      // 派生色(近亮远暗距离雾;门=暖光)
      function shadeWall(side, dist, door) {
        var torch = T.torch, f = distF(dist);
        if (door) {
          if (T.doorGlow) { var dg = T.doorGlow, lf = 0.17 + 0.83 * f; return 'rgb(' + Math.min(255, Math.round(dg[0] * lf)) + ',' + Math.min(255, Math.round(dg[1] * lf)) + ',' + Math.min(255, Math.round(dg[2] * lf)) + ')'; }   // per-theme 门发光(冷主题门随题材协调、不恒暖橙;lf 含 0.17 底色=远门暗微光不全黑,守"找发光的门")
          var dv = Math.round(150 * f) + 30; return 'rgb(' + (dv + 40) + ',' + Math.round(dv * 0.78) + ',' + Math.round(dv * 0.34) + ')';   // 缺省暖橙金(各主题统一;不设 doorGlow → 逐字节不变=向后兼容)
        }
        if (T.wallBase) {                                   // 主题墙:逐通道基色 × 雾 × 侧面衰减(side 面=1,正面更暗)+ 大气透视(远向 fogTint 淡入)
          var ss = (T.sideScale != null ? T.sideScale : 0.78), sc = side ? (1 + (1 - ss) * 0.35) : ss, b = T.wallBase;   // N/S 面(side=1)亮化:补全 Doom「假对比」另一半(原只压暗 E/W,N/S 恒 1=平)→ 走廊棱角/门洞纵深感
          var w = torch ? (torch.warm || [0, 0, 0]) : [0, 0, 0], ff = torch ? f * f : 0;   // torch 暖色偏移:f² 衰减=只近处暖(无 torch 主题 ff=0=不加暖)
          var tint = T.fogTint || T.ceilFar || [0, 0, 0], mix = (1 - f) * (T.fogMix != null ? T.fogMix : 0.55);   // 大气透视:远墙(f→0)向主题远色〔ceilFar〕淡入=去饱和+有色雾(治"远墙一律压成黑"的平板感、融进同一氛围);近墙(f→1)mix→0 → 逐字节同原公式
          return 'rgb(' + Math.min(255, Math.round((b[0] * f * sc + w[0] * ff) * (1 - mix) + tint[0] * mix)) + ',' + Math.min(255, Math.round((b[1] * f * sc + w[1] * ff) * (1 - mix) + tint[1] * mix)) + ',' + Math.min(255, Math.round((b[2] * f * sc + w[2] * ff) * (1 - mix) + tint[2] * mix)) + ')';
        }
        var v = Math.round((side ? 110 : 86) * f) + 16;     // 中性默认(无 wallBase):逐字节复刻原暖灰公式 = 零行为变化
        return 'rgb(' + (v + 8) + ',' + (v + 2) + ',' + Math.round(v * 0.86) + ')';
      }

      // ── 墙面程序化纹理(只用 fillRect,叠加在 shadeWall 底色上)──
      //   world-stable:横缝按世界高 v=r/rows(墙=1 格高,透视由 lineH 给)、竖缝按 wallX(命中点沿墙小数坐标)。
      //   随机=每特征独立 mulberry32(hashStr(世界坐标键))→ 同墙块从任何视角看一致、不随屏幕列漂移(R2 决定性铁律)。
      // cx/cy = 命中墙格世界整数坐标(seeded 污渍/矿脉用;同一块从任何视角看一致)
      function drawWallTex(i, y0, h, w, perp, side, T, cx, cy, hsc) {
        var b = T.wallBase; if (!b) return;
        hsc = hsc || 1; var natH = h / hsc;   // 高墙自然平铺:纹路/踢脚尺寸恒定、只多贴几排(端用户「墙变高不该等比放大纹路」)。natH=单元自然高度(=lineH);hsc=1 → natH=h、下方全部 /hsc·natH 逐字节退化回原式
        var f = distF(perp);   // 与 shadeWall 底色同一 distF → 纹理缝跟 torch 摇曳/二次衰减同步(不脱节)
        var ss = (T.sideScale != null ? T.sideScale : 0.78), sc = side ? (1 + (1 - ss) * 0.35) : ss, fk = f * sc;   // 同 shadeWall N/S 亮化(纹理缝跟墙底色一致)
        var tex = T.wallTex, r, off, local;
        // 作者可配:maze.wearLevel(每迷宫覆盖)>T.wearLevel(主题级)>0.5;0=无污渍/1=多。seeded 污渍按墙格稳定;凹槽受光边提亮=固定细节。
        var grooveLight = 0.12;   // 砖缝凹槽受光边提亮量(细节固定)
        var wearLevel = (maze.wearLevel != null ? maze.wearLevel : (T.wearLevel != null ? T.wearLevel : 0.5));
        var footClearV = 1 - 0.20 / hsc;     // 踢脚收口线:底部留【自然固定高度】踢脚(0.20 单元),高墙不按比例加厚;hsc=1 → 0.80=brick rows=5 行边界(不横穿砖块中段=端用户「厚横线」修);仍把墙纹收口、不画到地面线
        if (tex === 'brick' || tex === 'stone' || tex === 'tile') {
          var rows = Math.round((tex === 'brick' ? 5 : 4) * hsc), cols = tex === 'tile' ? 3 : 2, bw = 1 / cols;   // 行数×hsc=高墙多贴几排砖(砖高恒定);cols=横向不随高变;hsc=1 → 原行数
          var stagger = tex === 'brick' ? 0.5 : 0, jit = tex === 'stone' ? 1 : 0;
          var mk = fk * 0.45, vthr = 0.06;
          for (r = 1; r < rows; r++) {                          // 横缝(全宽横线 = 主砖感;石加 seeded 高度抖动=不规则)
            var cv = r / rows + (jit ? (mulberry32(hashStr('h' + r))() - 0.5) * 0.045 : 0);
            if (cv >= footClearV) continue;                         // 靠墙脚的横缝交给干净踢脚收口,不把高对比纹理压到地面线
            var mortarH = Math.max(1, natH * 0.007);   // 砖缝厚度按自然单元(高墙缝不变粗);0.007≈2px 细缝=正常砖砌(原 0.022 太粗成「粗横线」)
            // 凹槽立体:亮侧(缝上方+1px)→ 受光边;暗侧(缝下方+1px)→ 背光边
            if (h > 40) {                                       // 墙够高才加凹槽细节(远/矮墙跳过=不喧宾)
              ctx.fillStyle = rgbK(b, mk + grooveLight); ctx.fillRect(i, y0 + cv * h - 1, 1, 1);   // 亮侧(缝正上方)
              ctx.fillStyle = rgbK(b, mk * 0.55);     ctx.fillRect(i, y0 + cv * h + mortarH, 1, 1);   // 暗侧(缝正下方)
            }
            ctx.fillStyle = rgbK(b, mk); ctx.fillRect(i, y0 + cv * h, 1, mortarH);
          }
          for (r = 0; r < rows; r++) {                          // 竖缝(逐课错缝;仅近边界列画本课段=砖块边)
            if (r / rows >= footClearV) continue;                 // 竖缝同样不到墙脚收口区,避免底部竖线和地面格缝连成“穿模网格”
            off = (stagger && (r % 2)) ? bw * stagger : 0;
            local = ((((w - off) / bw) % 1) + 1) % 1;
            if (local < vthr || local > 1 - vthr) {
              // 凹槽立体竖缝:暗侧(缝宽内已暗)+亮边(缝左侧+1px 受光)
              ctx.fillStyle = rgbK(b, mk); ctx.fillRect(i, y0 + r / rows * h, 1, Math.min(Math.ceil(h / rows) + 1, Math.max(1, y0 + footClearV * h - (y0 + r / rows * h))));
            }
          }
          // seeded 污渍/矿脉(world-stable:seeded by 墙格世界坐标 cx/cy → 同墙块从任何视角看一致)
          if (wearLevel > 0) {
            var wearThr = wearLevel * 0.30;                     // 0..0.30 范围出现概率(wearLevel=0.5→≈15%每砖)
            var wcols = cols * 3;                               // 比砖更细的横向分格(brick cols=2 → 6 格):污渍逐细格 seed
            for (r = 0; r < rows; r++) {
              if (r / rows >= footClearV) continue;             // 污渍也不进入踢脚收口区,底部保持整洁
              // ★修「额外的粗横线」根因:原 seed = hashStr('wear'+cx+'_'+cy+'_'+r),【只含墙格世界坐标+行,无逐列项】→ 同一墙面所有屏幕列拿到相同 v1/v2/v3 → 每列在同一 y 画 stainH 高的暗块 → 污渍连成一条【贯穿整墙宽】的横条(端用户:正常角度/视角偶尔出现、横穿砖块中间)。隔壁 'miss' 特征本就把 tcol 并进 seed=逐砖独立,污渍漏了。修法:把横格索引 wcell 并入 seed → 各细格独立判定+独立纵向位置 → 污渍成局部竖斑/矿脉,不再对齐成横杠。
              var wcell = Math.floor((((w % 1) + 1) % 1) * wcols);
              var wr2 = mulberry32(hashStr('wear' + cx + '_' + cy + '_' + r + '_' + wcell));
              var v1 = wr2(), v2 = wr2(), v3 = wr2(), v4 = wr2();
              if (v1 < wearThr * 0.55) {                        // 细格更密 → 降单格概率,整墙污渍量与原相近
                var luw = (((w * wcols) % 1) + 1) % 1;          // 当前列在本细格内横向小数
                if (Math.abs(luw - (0.25 + v4 * 0.50)) <= 0.07 + v2 * 0.06) {   // 只占细格内一窄竖条 = 矿脉/水渍下渗感,不铺满(竖条 ≠ 横条)
                  var stainY = y0 + (r / rows + 0.10 / hsc + v4 * 0.55 / rows) * h;   // 砖面随机纵向位置(砖内偏移 /hsc=自然;hsc=1 → 0.10)
                  var stainCap = y0 + footClearV * h - stainY;                  // ★污渍封到踢脚收口线(footClearV):原 stainY+stainH 可达 v≈1.11、越过墙脚 dY+dH 把污渍画到【地板】上(墙拔高后 stainH 等比放大 → 踢脚线以下漏出做旧纹理=端用户报;竖缝/miss 早有此封顶、独污渍漏了=同族接缝)
                  if (stainCap > 1) {                                           // 起点已在收口线以下 → 整条跳过(不画进踢脚/地板)
                    var stainH = Math.min(Math.max(1, (0.22 + v3 * 0.26) / rows * h), stainCap);   // 高度封顶=底部不越收口线
                    ctx.fillStyle = rgbK(b, fk * (0.32 + v2 * 0.16));           // 暗斑/矿脉:比底色暗(0.32~0.48 系数)
                    ctx.fillRect(i, stainY, 1, stainH);
                  }
                }
              }
            }
          }
          if (tex === 'tile') {                                 // 偶发缺损砖=暗洞(seeded by 块世界坐标→稳定)
            var tcol = Math.floor(w * cols);
            for (r = 0; r < rows; r++) { if (r / rows < footClearV && mulberry32(hashStr('miss' + tcol + '_' + r))() < 0.09) { ctx.fillStyle = rgbK(b, fk * 0.22); ctx.fillRect(i, y0 + r / rows * h + natH * 0.012, 1, Math.min(Math.ceil(h / rows) - 1, Math.max(1, y0 + footClearV * h - (y0 + r / rows * h)))); } }
          }
        } else if (tex === 'smalltile') {                       // 医院/地铁站小白瓷砖:密集小方砖(6 列×~9 行=比 tile 大砖格更小更多)+ 细而亮的【白色洁净填缝】(clean grout,与 tile 的暗凹缝相反=洁净感)+ 冷白薄荷底(派生 wallBase)+ 极少 seeded 污渍/裂纹(医院=洁净,wearLevel 低表现)+ 个别砖轻微高光反光。要一眼"密网小白瓷砖",与 station 的大砖格 tile(暗缝、大格)明显不同。
          var smtCols = 6, smtRows = Math.round(9 * hsc), smtBw = 1 / smtCols;   // 密网:列多行多(tile 是 3 列×4 行大砖格);行数×hsc=高墙多贴几排、砖尺寸恒定
          var smtGroutK = Math.min(fk * 1.55, fk + 0.42);        // ★洁净亮填缝:比砖面【更亮】(clean white grout,与 tile 暗缝相反=无菌感);上限防近处过曝
          var smtGroutShade = fk * 0.62, smtVthr = 0.05;         // 亮缝一侧薄暗边(凹陷填缝的立体感,亮缝主导)
          for (r = 1; r < smtRows; r++) {                        // 横向亮填缝(全宽细白线)
            var smtHv = r / smtRows; if (smtHv >= footClearV) continue;
            var smtGH = Math.max(1, natH * 0.006);               // 细缝(比 tile 缝更细=小砖密网感)
            if (h > 40) { ctx.fillStyle = rgbK(b, smtGroutShade); ctx.fillRect(i, y0 + smtHv * h + smtGH, 1, 1); }   // 亮缝正下方一道薄暗边=填缝略凹(受光在缝、阴影在缝沿)
            ctx.fillStyle = rgbK(b, smtGroutK); ctx.fillRect(i, y0 + smtHv * h, 1, smtGH);
          }
          for (r = 0; r < smtCols; r++) {                        // 竖向亮填缝(逐砖直缝,无错缝=瓷砖规整贴)
            var smtLocal = ((((w) / smtBw) % 1) + 1) % 1;
            if (smtLocal < smtVthr || smtLocal > 1 - smtVthr) {
              ctx.fillStyle = rgbK(b, smtGroutK); ctx.fillRect(i, y0, 1, h * footClearV);
            }
          }
          // 个别砖轻微高光反光:逐砖(细格=6 列×行)seeded 抽选少数砖,其上缘一小片冷白光泽(釉面反光;窄条不铺满、上限低=反光而非光源)
          if (h > 36) {
            var smtScol = Math.floor((((w % 1) + 1) % 1) * smtCols);
            for (r = 0; r < smtRows; r++) {
              var smtRv = r / smtRows; if (smtRv >= footClearV) continue;
              var smtSr = mulberry32(hashStr('stshn' + cx + '_' + cy + '_' + smtScol + '_' + r)), sh1 = smtSr(), sh2 = smtSr();
              if (sh1 < 0.14) {                                  // ≈14% 砖有一处釉面高光
                var smtSlocal = (((w * smtCols) % 1) + 1) % 1;
                if (smtSlocal > 0.18 && smtSlocal < 0.42) {      // 高光偏砖左上=统一受光向
                  var smtSy = y0 + (smtRv + 0.10 / smtRows) * h, smtScap = y0 + footClearV * h - smtSy;
                  if (smtScap > 1) { ctx.fillStyle = rgbK(b, Math.min(fk * 1.28, fk + 0.16)); ctx.fillRect(i, smtSy, 1, Math.min(Math.max(1, natH * (0.020 + sh2 * 0.020)), smtScap)); }   // 冷白釉面光泽(派生底、略亮=瓷砖反光)
                }
              }
            }
          }
          // 极少 seeded 污渍(医院=洁净,wearLevel 低表现):逐细格 seed,概率远低于 tile 的做旧、只占窄竖条=偶见水渍/污点,不铺满
          if (wearLevel > 0) {
            var smtWcols = smtCols * 2, smtWcell = Math.floor((((w % 1) + 1) % 1) * smtWcols);
            for (r = 0; r < smtRows; r++) {
              var smtWband = r / smtRows; if (smtWband >= footClearV) continue;
              var smtWr = mulberry32(hashStr('stgrime' + cx + '_' + cy + '_' + smtWcell + '_' + r)), sg1 = smtWr(), sg2 = smtWr(), sg3 = smtWr();
              if (sg1 < wearLevel * 0.05) {                      // 概率极低(wearLevel=0.5→≈2.5%,远低于 tile wear 的 30%)=洁净感
                var smtWlocal = (((w * smtWcols) % 1) + 1) % 1;
                if (Math.abs(smtWlocal - (0.3 + sg3 * 0.4)) < 0.06) {
                  var smtWy = y0 + (smtWband + 0.06 / smtRows + sg3 * 0.30 / smtRows) * h, smtWcap = y0 + footClearV * h - smtWy;
                  if (smtWcap > 1) { ctx.fillStyle = rgbK(b, fk * (0.60 + sg2 * 0.14)); ctx.fillRect(i, smtWy, 1, Math.min(Math.max(1, natH * (0.016 + sg3 * 0.018)), smtWcap)); }   // 淡暗污点(派生底、微暗=水渍/污点,非重做旧)
                }
              }
            }
          }
          // 极少 seeded 裂纹(个别一道砖上细发丝裂;概率低=洁净墙偶有裂痕):逐细格 seed,短暗竖段
          var smtCcell = Math.floor((((w % 1) + 1) % 1) * (smtCols * 2));
          var smtCr = mulberry32(hashStr('stcrk' + cx + '_' + cy + '_' + smtCcell)), sc1 = smtCr(), sc2 = smtCr(), sc3 = smtCr();
          if (sc1 < 0.05) {                                      // ≈5% 细格有一道发丝裂
            var smtClocal = (((w * (smtCols * 2)) % 1) + 1) % 1;
            if (Math.abs(smtClocal - (0.4 + sc3 * 0.2)) < 0.03) {
              var smtCy = y0 + (0.10 / hsc + sc2 * (footClearV - 0.20)) * h, smtCcap = y0 + footClearV * h - smtCy;
              if (smtCcap > 1) { ctx.fillStyle = rgbK(b, fk * 0.42); ctx.fillRect(i, smtCy, 1, Math.min(Math.max(1, natH * (0.05 + sc3 * 0.06)), smtCcap)); }   // 暗发丝裂(比底暗=裂痕,短段窄条)
            }
          }
        } else if (tex === 'wood' || tex === 'shoji') {
          var pn = tex === 'shoji' ? 4 : 5, pcol = Math.floor(w * pn), pl = ((w * pn) % 1 + 1) % 1;
          if (pl < 0.05 || pl > 0.95) { ctx.fillStyle = rgbK(b, fk * 0.5); ctx.fillRect(i, y0, 1, h * footClearV); }   // 板缝/竖格条止于墙脚收口区
          if (tex === 'wood') {                                 // 木纹横线(每板 seeded 派生暗)
            var wr = mulberry32(hashStr('wood' + pcol)), nWood = Math.round(4 * hsc);
            for (r = 0; r < nWood; r++) { var wy = (0.12 + 0.24 * r + (wr() - 0.5) * 0.06) / hsc; if (wy >= footClearV) continue; ctx.fillStyle = rgbK(b, fk * 0.66); ctx.fillRect(i, y0 + wy * h, 1, Math.max(1, natH * 0.012)); }   // 木纹横线数×hsc=高墙多贴、间距/厚度按自然单元;hsc=1 → 4 条原式
          } else {                                              // 障子:规则横木梁(无 PRNG)
            var nSh = Math.round(4 * hsc);
            for (r = 1; r < nSh; r++) { var syv = r / (4 * hsc); if (syv >= footClearV) continue; ctx.fillStyle = rgbK(b, fk * 0.55); ctx.fillRect(i, y0 + syv * h, 1, Math.max(1, natH * 0.02)); }   // 横梁数/间距按自然单元×hsc;hsc=1 → 3 梁原式
          }
        } else if (tex === 'flesh') {                           // 血肉:用断续弯曲肉索/湿膜/暗孔,避免大块规则竖板读成红色屏风。
          var fn = 4, fkcol = Math.floor(w * fn), fl = ((w * fn) % 1 + 1) % 1, fr = mulberry32(hashStr('flesh' + cx + '_' + cy + '_' + fkcol));
          var phase0 = fr() * Math.PI * 2, width0 = 0.035 + fr() * 0.020, nFl = Math.round(9 * hsc);   // 肉索段数×hsc=高墙多贴几段(段高/间距按自然单元);hsc=1 → 9 段原式
          for (r = 0; r < nFl; r++) {                               // 断续肉索:中心随高度摆动,每段短画;横看是弯的,不是整条矩形屏风竖带。
            var segV = (0.10 + r * 0.065 + (fr() - 0.5) * 0.018) / hsc;
            if (segV >= footClearV) continue;
            var center = 0.50 + Math.sin(phase0 + r * 1.37 + cy * 0.29) * 0.23;
            var dcore = Math.abs(fl - center);
            if (dcore < width0) {
              var kseg = 0.34 + (1 - dcore / width0) * 0.28;
              ctx.fillStyle = rgbK([74, 12, 24], fk * kseg); ctx.fillRect(i, y0 + segV * h, 2, Math.max(2, natH * (0.055 + fr() * 0.035)));
              if (dcore < width0 * 0.45) { ctx.fillStyle = rgbK([226, 98, 110], fk * 0.86); ctx.fillRect(i + 1, y0 + (segV + 0.012 / hsc) * h, 1, Math.max(1, natH * 0.030)); }
            }
          }
          var membrane = Math.sin((w * 17.0 + cx * 0.37 + cy * 0.19) * Math.PI * 2);   // 低频湿膜斑块,不随时间动。
          if (membrane > 0.70) { var my = (0.14 + (membrane - 0.70) * 0.80) / hsc; if (my < footClearV) { ctx.fillStyle = rgbK([92, 18, 30], fk * 0.58); ctx.fillRect(i, y0 + my * h, 1, Math.max(2, natH * 0.075)); ctx.fillStyle = rgbK([210, 84, 96], fk * 0.45); ctx.fillRect(i + 1, y0 + (my + 0.01 / hsc) * h, 1, Math.max(1, natH * 0.028)); } }
          var pore = mulberry32(hashStr('pore' + cx + '_' + cy + '_' + Math.floor(w * 19)))();
          if (pore < wearLevel * 0.16) { var py = (0.16 + pore / Math.max(0.01, wearLevel * 0.16) * 0.48) / hsc; ctx.fillStyle = rgbK([28, 2, 8], fk * 1.05); ctx.fillRect(i, y0 + py * h, 2, Math.max(1, natH * 0.034)); ctx.fillStyle = rgbK([242, 124, 132], fk * 0.72); ctx.fillRect(i + 1, y0 + py * h - 1, 1, 1); }
        } else if (tex === 'circuit') {                         // 赛博电路板:暗面板网格(同 tile 结构)+ seeded 自发光青/品红竖线注入线缝;不整墙染色(暗底占主导,发光只占窄缝)=避免墙读成光源。
          var cpCols = 3, cpBw = 1 / cpCols;                       // 同 tile 面板分格(3 列)
          var cpMk = fk * 0.42;                                    // 暗接缝深度(略深于 tile 的 0.45×fk,面板更"哑光电路板"感)
          for (r = 1; r < Math.round(4 * hsc); r++) {              // 横向面板接缝(暗色,非发光——发光只留给竖向电路线,避免满墙网格都亮)
            var chv = r / Math.round(4 * hsc); if (chv >= footClearV) continue;
            ctx.fillStyle = rgbK(b, cpMk); ctx.fillRect(i, y0 + chv * h, 1, Math.max(1, natH * 0.006));
          }
          for (r = 0; r < cpCols; r++) {                           // 竖向面板边界(暗缝,面板结构本身)
            var cpOff = ((((w) / cpBw) % 1) + 1) % 1;
            if (cpOff < 0.05 || cpOff > 0.95) { ctx.fillStyle = rgbK(b, cpMk); ctx.fillRect(i, y0, 1, h * footClearV); }
          }
          // seeded 电路发光线:每个细分格(比面板更细)独立判定是否是一条"通电"竖线;青/品红二选一(Lospec 双色),固定宽度下限保证小尺寸不糊成噪点。
          var cpFineCols = cpCols * 5, cpCell = Math.floor((((w % 1) + 1) % 1) * cpFineCols);
          var cpR = mulberry32(hashStr('circuit' + cx + '_' + cy + '_' + cpCell)), cpV1 = cpR(), cpV2 = cpR(), cpV3 = cpR();
          if (cpV1 < 0.16) {                                       // ≈16% 细格通电(暗底主导、发光线是点缀非主体)
            var cpLocal = (((w * cpFineCols) % 1) + 1) % 1;
            if (cpLocal > 0.42 && cpLocal < 0.58) {                 // 每条通电线只占细格中央窄缝(避免"整块面板发光"读成光源)
              var cpCyan = cpV2 < 0.55;                             // Lospec 双色交替:青 #53ebe4 / 品红 #e13a6a(真实取自 Cyberpunk Neons 色板,见 THEMES.neon 注释)
              var cpGlow = cpCyan ? [83, 235, 228] : [225, 58, 106];
              var cpTopV = (0.06 + cpV3 * (footClearV - 0.10)) / hsc, cpLen = Math.max(natH * 0.10, natH * (0.14 + cpV3 * 0.18));   // 竖线起点随机、长度不定长(电路走线感,非贯通整墙的均匀条纹)
              var cpA1 = Math.min(1, 0.62 * f + 0.18), cpA2 = Math.min(0.55, 0.30 * f + 0.10);   // 保底 alpha(0.18/0.10)=近旁小尺寸仍可辨(自查:最小 1px 宽仍与暗底 cpMk<<1 形成强对比,非灰阶噪点),仍受距离雾调制(近亮远暗)
              ctx.fillStyle = 'rgba(' + cpGlow[0] + ',' + cpGlow[1] + ',' + cpGlow[2] + ',' + cpA1.toFixed(3) + ')';
              ctx.fillRect(i, y0 + cpTopV * h, 1, Math.min(Math.max(1, cpLen), y0 + footClearV * h - (y0 + cpTopV * h)));
              ctx.fillStyle = 'rgba(' + cpGlow[0] + ',' + cpGlow[1] + ',' + cpGlow[2] + ',' + cpA2.toFixed(3) + ')';   // 线左侧 1px 弱晕(自发光扩散,强化"这是光源细节非纹理噪点"的读法)
              ctx.fillRect(i - 1, y0 + cpTopV * h, 1, Math.min(Math.max(1, cpLen * 0.7), y0 + footClearV * h - (y0 + cpTopV * h)));
            }
          }
        } else if (tex === 'panel') {                           // 工业铆接金属板:大块面板(2 列×~3 行,比 tile 小格大)+ 粗接缝(受光边+暗凹槽)+ 板角铆钉 + seeded 锈蚀战损竖痕。要一眼"铆接金属板"而非小瓷砖。
          var pnCols = 2, pnRows = Math.round(3 * hsc), pnBw = 1 / pnCols;   // 面板行数×hsc=高墙多贴几排(板尺寸恒定);2 列大板
          var pnMk = fk * 0.42, pnEdge = 0.055;                   // 接缝暗度略深(重工业)、pnEdge=竖接缝半宽(占板宽比例,粗缝)
          var pnCol = Math.floor((((w % 1) + 1) % 1) * pnCols), pnLocal = ((w * pnCols % 1) + 1) % 1;   // 当前列所在面板索引 + 板内横向小数
          for (r = 1; r < pnRows; r++) {                          // 粗横接缝(全宽):暗凹槽 + 上缘受光高光边(立体)
            var pnHv = r / pnRows; if (pnHv >= footClearV) continue;
            var pnSeamH = Math.max(1, natH * 0.014);              // 粗缝(比 brick 的 0.007 粗一倍=厚金属板接缝)
            if (h > 40) { ctx.fillStyle = rgbK(b, pnMk + grooveLight); ctx.fillRect(i, y0 + pnHv * h - 1, 1, 1); }   // 缝上受光边
            ctx.fillStyle = rgbK(b, pnMk); ctx.fillRect(i, y0 + pnHv * h, 1, pnSeamH);
            if (h > 40) { ctx.fillStyle = rgbK(b, pnMk * 0.5); ctx.fillRect(i, y0 + pnHv * h + pnSeamH, 1, 1); }   // 缝下背光边
          }
          if (pnLocal < pnEdge || pnLocal > 1 - pnEdge) {         // 粗竖接缝(板与板之间):暗凹槽整柱
            ctx.fillStyle = rgbK(b, pnMk); ctx.fillRect(i, y0, 1, h * footClearV);
            if (h > 40 && pnLocal < pnEdge) { ctx.fillStyle = rgbK(b, pnMk + grooveLight * 0.7); ctx.fillRect(i - 1, y0, 1, h * footClearV); }   // 左侧受光边
          }
          if (h > 40 && pnLocal > 0.5 - pnEdge && pnLocal < 0.5 + pnEdge) { ctx.fillStyle = rgbK(b, pnMk * 1.05); ctx.fillRect(i, y0, 1, h * footClearV); }   // 板中一道加强筋(工业板纵向筋)
          // 板角铆钉:每块面板顶/底靠竖接缝处各一排亮点(seeded 微抖亮度,金属反光)
          if (pnLocal > 0.5 - pnEdge - 0.02 && pnLocal < 0.5 - pnEdge + 0.02) {   // 铆钉横向落在加强筋两侧一窄条(命中即画=逐列,不铺满)
            for (r = 0; r < pnRows; r++) {
              var pnRy = r / pnRows; if (pnRy >= footClearV) continue;
              var pnRr = mulberry32(hashStr('rivet' + cx + '_' + cy + '_' + pnCol + '_' + r))();
              var pnTop = y0 + (pnRy + 0.06 / hsc) * h, pnBot = y0 + (pnRy + (1 / pnRows) - 0.10 / hsc) * h;   // 板顶/底铆钉
              if (h > 34) {
                ctx.fillStyle = rgbK(b, Math.min(fk * (1.35 + pnRr * 0.25), fk + grooveLight * 1.6)); ctx.fillRect(i, pnTop, 1, Math.max(1, natH * 0.020));
                if (pnBot < y0 + footClearV * h) { ctx.fillStyle = rgbK(b, Math.min(fk * (1.30 + pnRr * 0.25), fk + grooveLight * 1.5)); ctx.fillRect(i, pnBot, 1, Math.max(1, natH * 0.020)); }
              }
            }
          }
          if (wearLevel > 0) {                                    // 锈蚀战损:seeded 暗橙锈竖痕(rgba,从板缝下渗;wearLevel 门控,industrial 高 wear=多)
            var pnWcols = pnCols * 4, pnWcell = Math.floor((((w % 1) + 1) % 1) * pnWcols);
            var pnWr = mulberry32(hashStr('pnl' + cx + '_' + cy + '_' + pnWcell)), pnW1 = pnWr(), pnW2 = pnWr(), pnW3 = pnWr();
            if (pnW1 < wearLevel * 0.22) {                        // 锈痕概率随 wearLevel
              var pnWlocal = (((w * pnWcols) % 1) + 1) % 1;
              if (Math.abs(pnWlocal - (0.3 + pnW3 * 0.4)) < 0.10) {   // 只占细格内窄竖条=下渗锈痕(非横条)
                var pnWy = y0 + (0.08 / hsc + pnW2 * 0.30) * h, pnWlen = Math.max(natH * 0.10, natH * (0.20 + pnW3 * 0.28));
                var pnWcap = y0 + footClearV * h - pnWy;
                if (pnWcap > 1) { ctx.fillStyle = 'rgba(120,58,22,' + (0.18 + pnW2 * 0.16).toFixed(3) + ')'; ctx.fillRect(i, pnWy, 1, Math.min(Math.max(1, pnWlen), pnWcap)); }   // 暗橙锈色(固定,非派生;半透明叠在板上=锈斑非染墙)
              }
            }
          }
        } else if (tex === 'hull') {                            // 潜艇船体:横向铆接钢板条带(水平强调,与 panel 网格明显不同)+ 每道板缝一排铆钉 + 可选 seeded 渗水暗痕。幽绿冷调派生自 wallBase。
          var hlN = Math.round(4 * hsc);                          // 横向厚钢板条带数×hsc(高墙多贴、板高恒定)
          var hlMk = fk * 0.44;
          for (r = 1; r < hlN; r++) {                             // 横向强钢板接缝(水平主特征):暗凹槽 + 上缘受光高光(强化条带感)
            var hlHv = r / hlN; if (hlHv >= footClearV) continue;
            var hlSeamH = Math.max(1, natH * 0.016);              // 厚缝
            if (h > 40) { ctx.fillStyle = rgbK(b, hlMk + grooveLight); ctx.fillRect(i, y0 + hlHv * h - 1, 1, 1); }
            ctx.fillStyle = rgbK(b, hlMk); ctx.fillRect(i, y0 + hlHv * h, 1, hlSeamH);
            if (h > 40) { ctx.fillStyle = rgbK(b, hlMk * 0.5); ctx.fillRect(i, y0 + hlHv * h + hlSeamH, 1, 1); }
          }
          // 每道板缝上方一排铆钉(横向密排;逐列 seeded 命中即画,沿板缝走)
          if (h > 34) {
            var hlRcols = 12, hlRcell = Math.floor((((w % 1) + 1) % 1) * hlRcols);
            var hlRon = mulberry32(hashStr('hull' + cx + '_' + cy + '_' + hlRcell))() < 0.55;   // ≈半数细格有铆钉=沿板缝成排(非连续实线)
            if (hlRon) for (r = 0; r < hlN; r++) {
              var hlRv = r / hlN; if (hlRv >= footClearV) continue;
              var hlRy = y0 + (hlRv + 0.04 / hsc) * h;   // 铆钉贴板缝下方
              if (hlRy < y0 + footClearV * h) { ctx.fillStyle = rgbK(b, Math.min(fk * 1.32, fk + grooveLight * 1.5)); ctx.fillRect(i, hlRy, 1, Math.max(1, natH * 0.018)); }
            }
          }
          // seeded 渗水暗痕:自某道板缝向下的一条深色湿痕(rgba 冷调,幽深潮湿;概率低=一处)
          var hlWcell = Math.floor((((w % 1) + 1) % 1) * 6);
          var hlWr = mulberry32(hashStr('seep' + cx + '_' + cy + '_' + hlWcell)), hlW1 = hlWr(), hlW2 = hlWr();
          if (hlW1 < 0.10) {
            var hlWlocal = (((w * 6) % 1) + 1) % 1;
            if (Math.abs(hlWlocal - (0.35 + hlW2 * 0.3)) < 0.09) {
              var hlWy = y0 + (0.05 / hsc + hlW2 * 0.12) * h, hlWlen = Math.max(natH * 0.20, natH * (0.40 + hlW2 * 0.30));
              var hlWcap = y0 + footClearV * h - hlWy;
              if (hlWcap > 1) { ctx.fillStyle = 'rgba(20,44,38,' + (0.22 + hlW2 * 0.14).toFixed(3) + ')'; ctx.fillRect(i, hlWy, 1, Math.min(Math.max(1, hlWlen), hlWcap)); }   // 幽绿深色渗水痕(半透明,长而窄,自上而下)
            }
          }
        } else if (tex === 'sandstone') {                       // 古墓砂岩:大块石课(比 brick/stone 更大更少,~3 行大块)+ 宽而浅风化缝 + seeded 风化剥落麻点 + 横向沉积层理。暖调。要"大块+层理"区别 stone 的小块不规则。
          var saRows = Math.round(3 * hsc), saCols = 2, saBw = 1 / saCols;   // 大块:行少列少
          var saStag = 0.5, saMk = fk * 0.40;                     // 错缝砌 + 缝浅(风化钝缝,非锐利砖缝)
          for (r = 1; r < saRows; r++) {                          // 宽而浅的水平风化缝(大石课边界;seeded 微高度抖动=非直线)
            var saCv = r / saRows + (mulberry32(hashStr('sand' + cx + '_' + cy + '_h' + r))() - 0.5) * 0.03;
            if (saCv >= footClearV) continue;
            var saSeamH = Math.max(1, natH * 0.010);
            if (h > 40) { ctx.fillStyle = rgbK(b, saMk + grooveLight * 0.6); ctx.fillRect(i, y0 + saCv * h - 1, 1, 1); }   // 缝上受光(浅=钝)
            ctx.fillStyle = rgbK(b, saMk); ctx.fillRect(i, y0 + saCv * h, 1, saSeamH);
          }
          for (r = 0; r < saRows; r++) {                          // 竖缝(错缝;大石课竖向接缝)
            if (r / saRows >= footClearV) continue;
            var saOff = (r % 2) ? saBw * saStag : 0, saL = ((((w - saOff) / saBw) % 1) + 1) % 1;
            if (saL < 0.045 || saL > 0.955) { ctx.fillStyle = rgbK(b, saMk); ctx.fillRect(i, y0 + r / saRows * h, 1, Math.min(Math.ceil(h / saRows) + 1, Math.max(1, y0 + footClearV * h - (y0 + r / saRows * h)))); }
          }
          // 横向沉积层理(砂岩特征细横纹,浅浅一层层;固定间距、暖淡,不随机=沉积走向一致)
          var saLayN = Math.round(9 * hsc);
          for (r = 1; r < saLayN; r++) {
            var saLy = r / saLayN; if (saLy >= footClearV) continue;
            if (r % 3 === 0) continue;   // 跳过与石课缝重合的密度(留呼吸)
            ctx.fillStyle = rgbK(b, fk * (0.86 + (r % 2) * 0.05)); ctx.fillRect(i, y0 + saLy * h, 1, Math.max(1, natH * 0.006));   // 细浅横纹(比底色略暗一点点=层理,不喧宾)
          }
          // seeded 风化剥落麻点:小暗斑成簇(砂岩风化坑洞;逐细格 seed,散点非横条)
          if (wearLevel > 0) {
            var saPcols = saCols * 4, saPcell = Math.floor((((w % 1) + 1) % 1) * saPcols);
            for (r = 0; r < saRows * 2; r++) {   // 比石课更细的纵向分格 → 麻点密度
              var saPband = r / (saRows * 2); if (saPband >= footClearV) continue;
              var saPr = mulberry32(hashStr('pit' + cx + '_' + cy + '_' + saPcell + '_' + r)), sp1 = saPr(), sp2 = saPr(), sp3 = saPr();
              if (sp1 < wearLevel * 0.16) {
                var saPlocal = (((w * saPcols) % 1) + 1) % 1;
                if (Math.abs(saPlocal - (0.2 + sp3 * 0.6)) < 0.05 + sp2 * 0.04) {
                  var saPy = y0 + (saPband + 0.04 / hsc + sp3 * 0.08) * h, saPcap = y0 + footClearV * h - saPy;
                  if (saPcap > 1) { ctx.fillStyle = rgbK(b, fk * (0.5 + sp2 * 0.18)); ctx.fillRect(i, saPy, 1, Math.min(Math.max(1, natH * (0.014 + sp3 * 0.02)), saPcap)); }   // 暖暗麻点(派生自砂黄底、偏暗=风化坑)
                }
              }
            }
          }
        } else if (tex === 'crystal') {                         // 水晶洞墙体:斜向晶面(对角切面线 + 面间明暗交界)+ seeded 冷紫白晶面高光(类 circuit 保底 alpha 发光)。底色偏紫。要"棱角斜面+微光"区别 stone,与墙饰 crystals 晶簇呼应但是墙体本身。
          var crBands = Math.round(3 * hsc);                      // 纵向晶面带数×hsc
          var crMk = fk * 0.5;
          for (r = 0; r < crBands; r++) {                         // 每条晶面带:一道斜向切面线(对角,斜率交替=晶体棱面朝向不同)
            var crV0 = r / crBands; if (crV0 >= footClearV) continue;
            var crDir = (r % 2) ? 1 : -1;                         // 斜向交替
            var crSlope = 0.55 * crDir;                           // 斜面在带内的对角位移(相对带高)
            var crEdgeX = 0.5 + crSlope * ((((w % 1) + 1) % 1) - 0.5) * 2;   // 该屏幕列在本带内切面线纵向位置(随 wallX 斜移)=对角
            crEdgeX = ((crEdgeX % 1) + 1) % 1;
            var crLineV = crV0 + crEdgeX / crBands;
            if (crLineV < footClearV) { ctx.fillStyle = rgbK(b, crMk); ctx.fillRect(i, y0 + crLineV * h, 1, Math.max(1, natH * 0.010)); }   // 斜切面暗线(棱)
            // 面间明暗交界:切面线一侧稍亮(受光面)、另一侧稍暗(背光面)→ 立体棱角
            if (h > 36) {
              var crHi = crLineV - 0.03 / hsc; if (crHi > crV0 && crHi < footClearV) { ctx.fillStyle = rgbK(b, Math.min(fk * 1.18, fk + grooveLight)); ctx.fillRect(i, y0 + crHi * h, 1, Math.max(1, natH * 0.012)); }   // 受光棱边(冷紫更亮)
            }
          }
          // seeded 晶面高光:冷紫白亮点缀(类 circuit 保底 alpha,冷紫白非青;窄条=晶体反光的一小面)
          var crFine = 12, crCell = Math.floor((((w % 1) + 1) % 1) * crFine);
          var crR = mulberry32(hashStr('crys' + cx + '_' + cy + '_' + crCell)), crV1 = crR(), crV2 = crR(), crV3 = crR();
          if (crV1 < 0.14) {                                       // ≈14% 细格有一处晶面反光
            var crLocal = (((w * crFine) % 1) + 1) % 1;
            if (crLocal > 0.4 && crLocal < 0.6) {                  // 反光只占细格中央窄缝
              var crGlow = crV2 < 0.5 ? [206, 178, 244] : [176, 150, 230];   // 冷紫白 / 淡紫(晶体高光二色)
              var crTopV = (0.08 + crV3 * (footClearV - 0.14)) / hsc, crLen = Math.max(natH * 0.06, natH * (0.10 + crV3 * 0.14));
              var crA1 = Math.min(1, 0.5 * f + 0.16), crA2 = Math.min(0.5, 0.26 * f + 0.10);   // 保底 alpha(小尺寸不糊成噪点=与暗底强对比)
              ctx.fillStyle = 'rgba(' + crGlow[0] + ',' + crGlow[1] + ',' + crGlow[2] + ',' + crA1.toFixed(3) + ')';
              ctx.fillRect(i, y0 + crTopV * h, 1, Math.min(Math.max(1, crLen), y0 + footClearV * h - (y0 + crTopV * h)));
              ctx.fillStyle = 'rgba(' + crGlow[0] + ',' + crGlow[1] + ',' + crGlow[2] + ',' + crA2.toFixed(3) + ')';   // 右侧 1px 弱晕(自发光扩散)
              ctx.fillRect(i + 1, y0 + crTopV * h, 1, Math.min(Math.max(1, crLen * 0.7), y0 + footClearV * h - (y0 + crTopV * h)));
            }
          }
        } else if (tex === 'ice') {                             // 冰面:光滑冰壁(无规则砖缝)+ 不规则树枝状裂纹网(斜向 seeded 短裂段,非砖块直缝)+ 少数冰层横向断裂线 + seeded 冷白/淡青霜光高光(类 circuit 保底 alpha,冷色)。要与 cave 的 stone 小块粗石明显不同=光滑+裂纹+霜光。
          var icMk = fk * 0.5;                                     // 裂纹暗度(冰裂缝比石缝更锐更暗一点)
          // ① 冰层横向断裂线(少数几道,seeded 微高度抖动=非直尺;疏,留大片光滑冰面呼吸)
          var icLayN = Math.round(4 * hsc);
          for (r = 1; r < icLayN; r++) {
            var icLv = r / icLayN + (mulberry32(hashStr('iceh' + cx + '_' + cy + '_' + r))() - 0.5) * 0.05; if (icLv >= footClearV) continue;
            if (r % 2 === 0) continue;   // 隔行留白=不是密横纹(区别 sandstone 层理)
            if (h > 40) { ctx.fillStyle = rgbK(b, Math.min(fk * 1.16, fk + grooveLight)); ctx.fillRect(i, y0 + icLv * h - 1, 1, 1); }   // 断裂线上缘冷白受光(冰的光泽)
            ctx.fillStyle = rgbK(b, icMk); ctx.fillRect(i, y0 + icLv * h, 1, Math.max(1, natH * 0.006));
          }
          // ② 不规则斜向/树枝状裂纹:逐细格 seeded 决定是否有一条斜裂段穿过本列;斜率随机(树枝走向不一)、短段、位置随机 → 裂纹网非直缝
          var icFine = 10, icCell = Math.floor((((w % 1) + 1) % 1) * icFine);
          var icR = mulberry32(hashStr('icecr' + cx + '_' + cy + '_' + icCell)), icV1 = icR(), icV2 = icR(), icV3 = icR(), icV4 = icR();
          if (icV1 < 0.30) {                                       // ≈30% 细格有一段裂纹(密度=网状但不铺满)
            var icSlope = (icV2 - 0.5) * 1.8;                      // 斜率(含正负=斜向交错,|slope|<0.9)=树枝/放射走向,不是水平直线
            var icLocal = (((w * icFine) % 1) + 1) % 1;            // 当前列在本细格内横向小数
            var icTopV = (0.06 + icV3 * (footClearV - 0.16)) / hsc;   // 裂纹段起点(随机高度)
            var icCv = icTopV + icSlope * (icLocal - 0.5) / icFine;   // 斜裂:纵向位置随列横移(=对角段)
            icCv = ((icCv % 1) + 1) % 1;
            if (icCv > 0.02 && icCv < footClearV) {
              var icLen = Math.max(1, natH * (0.02 + icV4 * 0.05));   // 短段(不贯通整墙=断续裂纹)
              ctx.fillStyle = rgbK(b, icMk); ctx.fillRect(i, y0 + icCv * h, 1, Math.min(icLen, y0 + footClearV * h - (y0 + icCv * h)));
              if (h > 36) { ctx.fillStyle = rgbK(b, Math.min(fk * 1.12, fk + grooveLight * 0.8)); ctx.fillRect(i, y0 + icCv * h - 1, 1, 1); }   // 裂缝上缘 1px 冷白受光(冰裂的高光棱)
            }
          }
          // ③ seeded 冷白/淡青霜光高光(类 circuit 保底 alpha;冷色 rgba,窄斑=冰面反光的一小面,非发光光源)
          var icGCell = Math.floor((((w % 1) + 1) % 1) * (icFine + 2));
          var icGR = mulberry32(hashStr('icefr' + cx + '_' + cy + '_' + icGCell)), icG1 = icGR(), icG2 = icGR(), icG3 = icGR();
          if (icG1 < 0.16) {                                       // ≈16% 细格一处霜光
            var icGLocal = (((w * (icFine + 2)) % 1) + 1) % 1;
            if (icGLocal > 0.4 && icGLocal < 0.6) {                // 霜光只占细格中央窄缝
              var icFrost = icG2 < 0.5 ? [210, 235, 255] : [190, 220, 240];   // 冷白 / 淡青霜光二色
              var icGTopV = (0.08 + icG3 * (footClearV - 0.14)) / hsc, icGLen = Math.max(natH * 0.05, natH * (0.08 + icG3 * 0.12));
              var icA1 = Math.min(0.85, 0.42 * f + 0.14), icA2 = Math.min(0.45, 0.22 * f + 0.08);   // 保底 alpha(小尺寸不糊成噪点=与底强对比,受距离雾调制;上限低于发光墙=冰面反光而非光源)
              ctx.fillStyle = 'rgba(' + icFrost[0] + ',' + icFrost[1] + ',' + icFrost[2] + ',' + icA1.toFixed(3) + ')';
              ctx.fillRect(i, y0 + icGTopV * h, 1, Math.min(Math.max(1, icGLen), y0 + footClearV * h - (y0 + icGTopV * h)));
              ctx.fillStyle = 'rgba(' + icFrost[0] + ',' + icFrost[1] + ',' + icFrost[2] + ',' + icA2.toFixed(3) + ')';   // 右侧 1px 弱晕(反光扩散)
              ctx.fillRect(i + 1, y0 + icGTopV * h, 1, Math.min(Math.max(1, icGLen * 0.7), y0 + footClearV * h - (y0 + icGTopV * h)));
            }
          }
        } else if (tex === 'plate') {                           // 金属菱纹板/网纹钢板(tread/diamond plate):规则斜向交叉的凸起菱格纹(工业金属地板/墙板经典)+ 冷灰调 + 板缝铆钉。要与 industrial 的 panel(大方格+锈)、submarine 的 hull(横向条带)明显不同=菱形网纹质感,冷灰(非暖锈)。
          var plMk = fk * 0.44;                                    // 菱纹凹槽暗度
          var plNx = 6, plNy = Math.round(6 * hsc);                // 横向菱格数×纵向菱格数(×hsc=高墙多贴、菱格尺寸恒定);Ny≈Nx 使菱形近似方正
          var plW = (((w % 1) + 1) % 1);                           // 当前列 wall-x 小数
          // 菱纹 = 两族斜脊('/' 与 '\')交叉成凸起菱格。逐列求本列命中的两族斜脊纵向位置,画凹槽 + 上缘受光高光(凸起感)。
          var kd, plv, plHi;
          for (kd = 0; kd <= plNy + plNx; kd++) {                  // '/' 族斜脊:u*Nx + v*Ny = kd → v = (kd - u*Nx)/Ny
            plv = (kd - plW * plNx) / plNy; if (plv <= 0.02 || plv >= footClearV) continue;
            ctx.fillStyle = rgbK(b, plMk); ctx.fillRect(i, y0 + plv * h, 1, Math.max(1, natH * 0.010));   // 斜脊凹槽
            if (h > 34) { plHi = plv - 0.012 / hsc; if (plHi > 0.02) { ctx.fillStyle = rgbK(b, Math.min(fk * 1.20, fk + grooveLight)); ctx.fillRect(i, y0 + plHi * h, 1, Math.max(1, natH * 0.008)); } }   // 脊上缘冷白高光(凸起金属反光)
          }
          for (kd = -plNx; kd <= plNy; kd++) {                     // '\' 族斜脊:u*Nx - v*Ny = kd → v = (u*Nx - kd)/Ny
            plv = (plW * plNx - kd) / plNy; if (plv <= 0.02 || plv >= footClearV) continue;
            ctx.fillStyle = rgbK(b, plMk); ctx.fillRect(i, y0 + plv * h, 1, Math.max(1, natH * 0.010));
            if (h > 34) { plHi = plv - 0.012 / hsc; if (plHi > 0.02) { ctx.fillStyle = rgbK(b, Math.min(fk * 1.20, fk + grooveLight)); ctx.fillRect(i, y0 + plHi * h, 1, Math.max(1, natH * 0.008)); } }
          }
          // 板缝:每若干菱格一道全宽横板缝 + 竖板缝(把整墙分成几块钢板,菱纹在板内)
          var plPRows = Math.round(2 * hsc), plPCols = 2, plPBw = 1 / plPCols;
          for (r = 1; r < plPRows; r++) {
            var plPv = r / plPRows; if (plPv >= footClearV) continue;
            var plSeamH = Math.max(1, natH * 0.012);
            if (h > 40) { ctx.fillStyle = rgbK(b, plMk + grooveLight); ctx.fillRect(i, y0 + plPv * h - 1, 1, 1); }
            ctx.fillStyle = rgbK(b, plMk * 1.15); ctx.fillRect(i, y0 + plPv * h, 1, plSeamH);   // 板缝比菱纹深一点(结构缝)
            if (h > 40) { ctx.fillStyle = rgbK(b, plMk * 0.5); ctx.fillRect(i, y0 + plPv * h + plSeamH, 1, 1); }
          }
          var plPLocal = ((w * plPCols % 1) + 1) % 1;
          if (plPLocal < 0.045 || plPLocal > 0.955) { ctx.fillStyle = rgbK(b, plMk * 1.15); ctx.fillRect(i, y0, 1, h * footClearV); }   // 竖板缝
          // 板角铆钉:每块钢板四角靠板缝处一排亮铆钉(seeded 微抖亮度,冷金属反光;逐列命中窄条即画)
          if (h > 34 && (plPLocal < 0.06 || plPLocal > 0.94)) {
            for (r = 0; r <= plPRows; r++) {
              var plRy = r / plPRows; if (plRy >= footClearV) continue;
              var plRr = mulberry32(hashStr('plriv' + cx + '_' + cy + '_' + Math.floor(plW * plPCols) + '_' + r))();
              ctx.fillStyle = rgbK(b, Math.min(fk * (1.30 + plRr * 0.25), fk + grooveLight * 1.5)); ctx.fillRect(i, y0 + (plRy + 0.02 / hsc) * h, 1, Math.max(1, natH * 0.018));
            }
          }
        }
      }

      // ── 墙面具体装饰物:贴在 world face 上的藤蔓/触手/裂缝/剑盾/火把/电缆,避开墙脚收口区 ──
      //   逐列绘制:每个装饰有 u/v/scale,当前 wallX 落进横向范围才画;所有选择由 x/y/face seed,转身/移动不漂移。
      function drawWallDecor(i, y0, h, wallX, perp, side, T, cx, cy, face, hsc) {
        var list = g.wallDecorByFace && g.wallDecorByFace[cx + ',' + cy + ',' + face]; if (!list || !list.length || h < 28) return;   // h<28 用原始 dH(屏幕高度 LOD)
        hsc = hsc || 1; var natH = h / hsc; var decoLift = hsc > 1 ? natH * 0.20 : 0; y0 = y0 + (h - natH) - decoLift; h = natH;   // 墙饰不随墙拔高变巨/拉长:重锚到墙脚上方 natH 的自然带,按自然单元尺寸绘制(下方函数体全用 h/y0=自然值,零改)。平铺高墙(hsc>1)再抬 0.20 自然单元 → 装饰坐在踢脚线【上方】,向下延伸的火把/拾取物不再压到踢脚(修「装饰拦腰卡踢脚」)。hsc=1(普通墙/stretch)→ decoLift=0 且 h-natH=0 → y0/h 逐字节不变
        var b = T.wallBase || [110, 96, 82], f = distF(perp), ss = (T.sideScale != null ? T.sideScale : 0.78), sc = side ? (1 + (1 - ss) * 0.35) : ss, fk = f * sc;
        var decorK = Math.max(0.32, fk);   // 端用户截图反馈:墙饰若完全吃墙面雾/侧面暗度,近处也会糊成黑块;给墙饰保底轮廓,但仍不 fullbright。
        function col(rgb, k) { var kk = decorK * k; return 'rgb(' + Math.min(255, Math.round(rgb[0] * kk)) + ',' + Math.min(255, Math.round(rgb[1] * kk)) + ',' + Math.min(255, Math.round(rgb[2] * kk)) + ')'; }
        function rgba(rgb, a) { var aa = Math.max(0, Math.min(1, a * Math.max(0.42, f))); return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + aa.toFixed(3) + ')'; }
        function hitBand(d, half) { return Math.abs(wallX - d.u) <= half * d.scale; }
        function vy(v) { return y0 + v * h; }
        var di, d, du, yy, yA, yB, xk, phase, flick, slant, stepY;
        for (di = 0; di < list.length; di++) { d = list[di]; if (d.sprite && d.sprite.taken) continue; du = Math.abs(wallX - d.u) / Math.max(0.001, d.scale); if (du > 0.30) continue;
          var seed = hashStr('wdeco' + d.x + '_' + d.y + '_' + d.face + '_' + d.kind + '_' + d.seed), rng = mulberry32(seed), edge = 1 - Math.min(1, du / 0.30);
          if (d.kind === 'pickup') {                                  // 墙壁嵌入式拾取物:壁龛/纸片/徽记,可拿但不发光成机关、不压墙脚;比普通墙饰更有浅色轮廓,否则玩家会把它读成墙纹。
            yy = vy(d.v); var tint = d.tint || [226, 214, 174], hi = [Math.min(255, tint[0] + 44), Math.min(255, tint[1] + 44), Math.min(255, tint[2] + 36)], shade = [Math.max(28, Math.round(b[0] * 0.30)), Math.max(26, Math.round(b[1] * 0.30)), Math.max(24, Math.round(b[2] * 0.30))];
            if (hitBand(d, 0.24)) { ctx.fillStyle = col(shade, 1.12); ctx.fillRect(i - 2, yy - h * 0.055, 7, Math.max(4, h * 0.20 * d.scale)); }
            if (hitBand(d, 0.18)) { ctx.fillStyle = rgba([12, 10, 8], 0.18 * edge); ctx.fillRect(i - 3, yy - h * 0.070, 9, Math.max(5, h * 0.24 * d.scale)); }
            if (hitBand(d, 0.15)) { ctx.fillStyle = col(tint, 1.16); ctx.fillRect(i - 1, yy - h * 0.012, 5, Math.max(3, h * 0.115 * d.scale)); ctx.fillStyle = rgba(hi, 0.36 * edge); ctx.fillRect(i, yy - h * 0.040, 3, Math.max(1, h * 0.035 * d.scale)); ctx.fillStyle = col([108, 74, 46], 0.82); ctx.fillRect(i, yy + h * 0.040, 3, 1); }
          } else if (d.kind === 'crack') {                                  // 裂缝:随墙基色派生深中间调 + 1px 断面高光;不是黑污渍,也不是光源/机关。
            yy = vy(d.v); var crackMain = [Math.max(60, Math.round(b[0] * 0.56)), Math.max(52, Math.round(b[1] * 0.56)), Math.max(48, Math.round(b[2] * 0.56))], crackCore = [Math.max(34, Math.round(b[0] * 0.30)), Math.max(30, Math.round(b[1] * 0.30)), Math.max(28, Math.round(b[2] * 0.30))], crackHi = [Math.max(138, Math.round(b[0] * 1.20)), Math.max(116, Math.round(b[1] * 1.16)), Math.max(92, Math.round(b[2] * 1.08))];
            if (hitBand(d, 0.13)) { ctx.fillStyle = col(crackMain, 1.38); ctx.fillRect(i, yy, 2, Math.max(2, h * 0.30 * d.scale * edge)); }
            if (hitBand(d, 0.055)) { ctx.fillStyle = col(crackCore, 1.24); ctx.fillRect(i, yy + h * (0.05 + rng() * 0.09), 1, Math.max(2, h * 0.12)); ctx.fillStyle = rgba(crackHi, 0.18 * edge); ctx.fillRect(i + 1, yy + h * 0.02, 1, Math.max(1, h * 0.18 * d.scale)); }
          } else if (d.kind === 'vines') {                           // 藤蔓:垂挂主茎 + 成对叶片;加最低亮度后不再只像墙上一条黑污渍。
            yA = vy(Math.max(0.10, d.v - 0.14 * d.scale)); yB = vy(Math.min(0.68, d.v + 0.40 * d.scale)); if (hitBand(d, 0.16)) { ctx.fillStyle = col([44, 118, 48], 1.05); ctx.fillRect(i, yA, 2, Math.max(2, yB - yA)); }
            if (hitBand(d, 0.085)) { ctx.fillStyle = col([108, 166, 70], 1.10); for (xk = 0; xk < 4; xk++) ctx.fillRect(i + (xk % 2 ? 1 : -2), yA + (xk + 1) * (yB - yA) / 5, 4, Math.max(2, h * 0.018)); }
          } else if (d.kind === 'tentacle') {                        // 血肉触手:粗暗红索 + 亮湿高光 + 小吸盘;仍是墙饰,不改 flesh 墙材质。
            yA = vy(Math.max(0.12, d.v - 0.10 * d.scale)); yB = vy(Math.min(0.68, d.v + 0.38 * d.scale)); if (hitBand(d, 0.15)) { ctx.fillStyle = col([98, 24, 42], 1.10); ctx.fillRect(i, yA, 2, Math.max(2, yB - yA)); }
            if (hitBand(d, 0.06)) { ctx.fillStyle = col([198, 72, 84], 0.90); ctx.fillRect(i, yA + h * 0.04, 1, Math.max(2, (yB - yA) * 0.44)); ctx.fillStyle = rgba([236, 128, 132], 0.38); for (xk = 0; xk < 3; xk++) ctx.fillRect(i + 1, yA + (xk + 1) * (yB - yA) / 4, 2, 2); }
          } else if (d.kind === 'arms') {                            // 剑盾:盾面提亮+银/金边,暗墙上仍读得出是挂饰而非黑块。
            yy = vy(d.v); slant = (wallX - d.u) * h * 0.55 / Math.max(0.2, d.scale); if (hitBand(d, 0.20)) { ctx.fillStyle = col([188, 196, 206], 1.20); ctx.fillRect(i, yy - h * 0.13 + slant, 1, Math.max(2, h * 0.30 * d.scale)); }
            if (hitBand(d, 0.11)) { ctx.fillStyle = col([112, 116, 122], 1.08); ctx.fillRect(i, yy - h * 0.05, 4, Math.max(2, h * 0.19 * d.scale)); ctx.fillStyle = col([218, 204, 152], 1.22); ctx.fillRect(i - 1, yy - h * 0.045, 1, Math.max(2, h * 0.17 * d.scale)); ctx.fillRect(i + 3, yy - h * 0.035, 1, Math.max(2, h * 0.15 * d.scale)); ctx.fillStyle = col([232, 184, 86], 1.16); ctx.fillRect(i - 1, yy + h * 0.01, 5, Math.max(2, h * 0.08)); }
          } else if (d.kind === 'torch') {                           // 火把:托架 + 火芯 + 局部暖色 halo;仍是墙饰视觉,不升级成全局光照 API。
            yy = vy(d.v); if (hitBand(d, 0.15)) { ctx.fillStyle = col([94, 62, 34], 1.04); ctx.fillRect(i, yy + h * 0.08, 2, Math.max(2, h * 0.18 * d.scale)); }
            phase = (seed % 628) / 100; flick = reducedMotion ? 1 : (0.78 + 0.22 * Math.sin(g.tw * 7 + phase));
            if (hitBand(d, 0.24)) { ctx.fillStyle = rgba([255, 132, 38], 0.12 * edge * flick); ctx.fillRect(i - 4, yy - h * 0.13, 11, Math.max(6, h * 0.30 * d.scale)); }
            if (hitBand(d, 0.18)) { ctx.fillStyle = rgba([255, 172, 64], 0.18 * edge * flick); ctx.fillRect(i - 3, yy - h * 0.10, 8, Math.max(5, h * 0.24 * d.scale)); ctx.fillStyle = rgba([255, 118, 34], 0.10 * edge * flick); ctx.fillRect(i - 2, yy + h * 0.05, 6, Math.max(2, h * 0.12 * d.scale)); }
            if (hitBand(d, 0.105)) { ctx.fillStyle = rgba([255, 126, 36], 0.42 * flick); ctx.fillRect(i - 1, yy - h * 0.07, 4, Math.max(3, h * 0.18 * d.scale)); ctx.fillStyle = 'rgba(255,184,74,' + (0.88 * Math.max(0.50, f) * flick).toFixed(3) + ')'; ctx.fillRect(i, yy - h * 0.055, 3, Math.max(2, h * 0.12 * d.scale)); ctx.fillStyle = 'rgba(255,236,156,' + (0.76 * Math.max(0.50, f) * flick).toFixed(3) + ')'; ctx.fillRect(i + 1, yy - h * 0.015, 1, Math.max(2, h * 0.055)); }
          } else if (d.kind === 'cables') {                          // 电缆/管线:粗暗线 + 青/橙接头;科技墙面一眼可辨。
            yy = vy(d.v); if (hitBand(d, 0.16)) { ctx.fillStyle = col([28, 34, 42], 1.10); ctx.fillRect(i, yy, 2, Math.max(2, h * 0.25 * d.scale)); }
            if (hitBand(d, 0.13)) { ctx.fillStyle = col([80, 176, 220], 1.00); ctx.fillRect(i - 1, yy + h * 0.10, 4, Math.max(2, h * 0.026)); ctx.fillStyle = col([222, 144, 42], 0.98); ctx.fillRect(i, yy + h * 0.18, 3, Math.max(2, h * 0.040)); }
          } else if (d.kind === 'chains') {                          // 铁链:重复链节 + 冷金属高光,地牢/监牢主题比普通裂缝更有人工痕迹。
            yA = vy(Math.max(0.10, d.v - 0.12 * d.scale)); yB = vy(Math.min(0.68, d.v + 0.42 * d.scale)); stepY = Math.max(3, h * 0.055);
            if (hitBand(d, 0.12)) { ctx.fillStyle = col([48, 46, 44], 1.06); for (xk = 0; xk < 7 && yA + xk * stepY < yB; xk++) ctx.fillRect(i + (xk % 2 ? 1 : -1), yA + xk * stepY, 3, Math.max(2, h * 0.028)); }
            if (hitBand(d, 0.055)) { ctx.fillStyle = col([182, 170, 138], 1.05); ctx.fillRect(i, yA + stepY * 0.4, 1, Math.max(2, yB - yA - stepY * 0.8)); }
          } else if (d.kind === 'pipes') {                           // 管道:粗横/竖管 + 接头,与细 cables 分开。
            yy = vy(d.v); if (hitBand(d, 0.20)) { ctx.fillStyle = col([60, 72, 78], 1.08); ctx.fillRect(i, yy, 3, Math.max(2, h * 0.23 * d.scale)); }
            if (hitBand(d, 0.11)) { ctx.fillStyle = col([132, 150, 154], 0.95); ctx.fillRect(i - 2, yy + h * 0.08, 7, Math.max(2, h * 0.040)); ctx.fillStyle = col([78, 92, 96], 1.10); ctx.fillRect(i - 1, yy + h * 0.15, 5, Math.max(2, h * 0.045)); }
          } else if (d.kind === 'vent') {                            // 通风口:规则百叶矩形,科技/医院墙一眼读成人造设施。
            yy = vy(d.v); if (hitBand(d, 0.18)) { ctx.fillStyle = col([36, 46, 52], 1.12); ctx.fillRect(i - 1, yy - h * 0.03, 5, Math.max(3, h * 0.16 * d.scale)); }
            if (hitBand(d, 0.13)) { ctx.fillStyle = col([138, 154, 160], 0.95); for (xk = 0; xk < 4; xk++) ctx.fillRect(i - 2, yy + xk * h * 0.035, 7, Math.max(1, h * 0.010)); }
          } else if (d.kind === 'posters') {                         // 告示/符纸:浅色小纸片,远处先读成纸面,近处再靠 theme 解释为符纸/病历/海报。
            yy = vy(d.v); if (hitBand(d, 0.17)) { ctx.fillStyle = col([226, 214, 174], 0.92); ctx.fillRect(i - 1, yy, 5, Math.max(4, h * 0.18 * d.scale)); }
            if (hitBand(d, 0.09)) { ctx.fillStyle = col([118, 74, 52], 0.82); ctx.fillRect(i, yy + h * 0.05, 3, 1); ctx.fillRect(i, yy + h * 0.10, 2, 1); }
          } else if (d.kind === 'sigil') {                            // 刻印/符号:低亮墙面线刻,服务仪式/符纸感;不用发光盘,避免混成功能 marker。
            yy = vy(d.v); if (hitBand(d, 0.17)) { ctx.fillStyle = col([156, 104, 64], 1.02); ctx.fillRect(i, yy - h * 0.05, 2, Math.max(2, h * 0.22 * d.scale)); }
            if (hitBand(d, 0.095)) { ctx.fillStyle = col([216, 160, 92], 0.76); ctx.fillRect(i - 3, yy + h * 0.015, 8, Math.max(1, h * 0.010)); ctx.fillRect(i - 2, yy + h * 0.095, 6, Math.max(1, h * 0.010)); ctx.fillStyle = col([94, 48, 38], 0.86); ctx.fillRect(i + 1, yy + h * 0.04, 1, Math.max(2, h * 0.12)); }
          } else if (d.kind === 'eyes') {                             // 肉壁眼点/暗孔:暗孔 + 湿亮边,高冲击但低密度;仍是墙饰,不变成可互动提示。
            yy = vy(d.v); if (hitBand(d, 0.15)) { ctx.fillStyle = col([38, 8, 16], 1.18); ctx.fillRect(i - 1, yy - h * 0.025, 5, Math.max(3, h * 0.085 * d.scale)); }
            if (hitBand(d, 0.075)) { ctx.fillStyle = col([190, 64, 82], 0.96); ctx.fillRect(i, yy - h * 0.010, 3, Math.max(2, h * 0.045 * d.scale)); ctx.fillStyle = rgba([246, 152, 156], 0.24); ctx.fillRect(i + 1, yy - h * 0.018, 1, Math.max(1, h * 0.024)); }
          } else if (d.kind === 'teeth') {                            // 齿/骨刺:墙面中段短刺,显式摆放优先;不碰墙脚,不参与碰撞。
            yy = vy(d.v); if (hitBand(d, 0.18)) { ctx.fillStyle = col([208, 196, 166], 0.92); for (xk = 0; xk < 4; xk++) ctx.fillRect(i + (xk % 2 ? 1 : -2), yy + xk * h * 0.055, 3, Math.max(2, h * (0.045 + rng() * 0.035))); }
            if (hitBand(d, 0.075)) { ctx.fillStyle = col([116, 42, 42], 0.82); ctx.fillRect(i, yy + h * 0.18, 3, Math.max(1, h * 0.018)); }
          } else if (d.kind === 'growth') {                          // 菌丝/霉斑/霜痕:不规则簇状边缘,给洞穴/冰窟/血肉主题做“蔓延”感。
            yA = vy(Math.max(0.12, d.v - 0.10 * d.scale)); yB = vy(Math.min(0.66, d.v + 0.30 * d.scale)); if (hitBand(d, 0.18)) { ctx.fillStyle = col(T.wallTex === 'flesh' ? [128, 32, 46] : [72, 116, 80], 0.92); for (xk = 0; xk < 7; xk++) ctx.fillRect(i + (rng() > 0.5 ? 1 : -2), yA + (xk / 7) * (yB - yA), 3, Math.max(2, h * (0.014 + rng() * 0.018))); }
            if (hitBand(d, 0.08)) { ctx.fillStyle = rgba(T.wallTex === 'flesh' ? [230, 108, 116] : [152, 190, 128], 0.24); ctx.fillRect(i, yA + h * 0.05, 2, Math.max(2, (yB - yA) * 0.34)); }
          } else if (d.kind === 'veins') {                           // 粗血管/肉索:比 tentacle 更贴墙,主要服务 flesh 主题墙体读法。
            yA = vy(Math.max(0.10, d.v - 0.12 * d.scale)); yB = vy(Math.min(0.68, d.v + 0.44 * d.scale)); if (hitBand(d, 0.17)) { ctx.fillStyle = col([86, 12, 26], 1.20); ctx.fillRect(i, yA, 3, Math.max(2, yB - yA)); }
            if (hitBand(d, 0.075)) { ctx.fillStyle = col([206, 70, 86], 0.96); ctx.fillRect(i + 2, yA + h * 0.04, 1, Math.max(2, (yB - yA) * 0.54)); ctx.fillStyle = rgba([250, 132, 138], 0.30); ctx.fillRect(i - 1, yA + h * 0.10, 2, Math.max(2, (yB - yA) * 0.24)); }
          } else if (d.kind === 'crystals') {                        // 水晶簇:壁生半透明切面晶体(与 growth 的圆润苔痕/霜痕不同——角状分层收窄=晶体感,给 crystal 与 ice(同 stone+冷色)做差异化)。色语义同 GLYPHS.crystal([150,120,225]/高光[225,205,255])= 环境与拾取物色一致。
            yA = vy(Math.max(0.08, d.v - 0.16 * d.scale)); yB = vy(Math.min(0.64, d.v + 0.26 * d.scale));   // 晶簇纵向范围(比 growth 更收窄=挺立感非蔓延感)
            if (hitBand(d, 0.20)) { ctx.fillStyle = rgba([150, 120, 225], 0.30 + rng() * 0.10); ctx.fillRect(i - 1, yA, 3, Math.max(2, yB - yA)); }   // 半透明底切面(宽、淡)
            for (xk = 0; xk < 5; xk++) {                                                             // 逐层向内收窄的角状晶尖(切面分层,非圆润簇)
              var czt = (xk + 1) / 6, czw = Math.max(1, 3 - xk * 0.5);
              if (hitBand(d, 0.15 - xk * 0.02)) { ctx.fillStyle = rgba([132, 100, 205], 0.42 + rng() * 0.08); ctx.fillRect(i + (xk % 2 ? 1 : -1), yA + czt * (yB - yA), czw, Math.max(2, h * (0.020 + rng() * 0.014))); }
            }
            if (hitBand(d, 0.06)) { ctx.fillStyle = rgba([225, 205, 255], 0.55); ctx.fillRect(i, yA + h * 0.03, 1, Math.max(2, (yB - yA) * 0.30)); }   // 顶尖 1px 亮高光(晶面反光,不透明——最锐利的一笔给"这是晶体不是苔藓"的读法)
          }
        }
      }

      // ── 墙面垂直分层(R1-3 配套):檐口(顶部压顶高光线 + 暗下沿)+ 踢脚(底部暗带),给拉高的墙建筑结构、不是纯色高条 ──
      //   纯 fillRect 叠在墙列 [dY,dH] 内、按 dH 比例(随距离/高度缩放);仅设 wallBase 的主题 + 够高的墙画(矮/远墙跳过=不喧宾、默认中性主题不变)。确定性、无 PRNG。
      //   Q1 竖向亮度梯度:把墙列分 6 段,顶段偏亮(叠半透白)底段偏暗(叠半透黑),alpha 按 distF 远弱近强=远墙不过曝。
      //   Q2 伪 AO:墙脚 ~6% + 墙顶 ~4% 额外集中暗带(alpha 0→aoStrength 渐变=边缘更实),比整体梯度更聚边缘。
      //   新字段(maze.xxx 覆盖 > T.xxx 主题级 > 硬编码默认;不改 THEMES 表本身):topBoost(默0.12)/botDip(默0.18)/aoStrength(默0.35)。
      //   作者可在主题对象加字段(T.topBoost)或直接在 maze 节点加(maze.topBoost)覆盖当前迷宫——两级都支持。
      function drawWallBands(i, dY, dH, perp, side, T, hsc) {
        if (!T.wallBase || dH < 28) return;
        hsc = hsc || 1; var natH = dH / hsc;   // 檐口/踢脚/顶AO=建筑结构,按自然单元(高墙不加厚);Q1 竖向亮度梯度=光照,仍跨满 dH。hsc=1 → natH=dH 逐字节不变
        var f = distF(perp), b = T.wallBase, ss = (T.sideScale != null ? T.sideScale : 0.78), sc = side ? (1 + (1 - ss) * 0.35) : ss, fk = f * sc;
        ctx.fillStyle = rgbK(b, fk * 1.25); ctx.fillRect(i, dY + natH * 0.05, 1, Math.max(1, natH * 0.014));    // 檐口压顶高光线(贴墙顶、自然厚度)
        ctx.fillStyle = rgbK(b, fk * 0.65); ctx.fillRect(i, dY + natH * 0.075, 1, Math.max(1, natH * 0.012));   // 檐口暗下沿(高光下方=立体压顶;0.42→0.65 软化:平整墙上原高对比深线跨格对齐成「粗横线」)
        // 墙脚改成“干净踢脚/收口”:底部最后一截统一刷同墙基色略暗,盖住砖缝/血肉横纹靠地面线的高对比尾巴;暗线只放在收口上缘,不贴地板画黑横杠。
        var baseZone = Math.max(3, natH * 0.20), baseY = dY + dH - baseZone;   // 踢脚高度=自然单元的 0.20(高墙不加厚),锚在墙脚(dY+dH);0.20 = 1 - footClearV;hsc=1 → dH*0.20 原式(不横穿砖块中段=端用户「厚横线」修)
        // Q1 竖向亮度梯度(6 段,每段相对高度 v=0 顶~1 底;k>0 叠白/k<0 叠黑,alpha×distF 远弱)
        // 优先级:maze.xxx(每迷宫覆盖)> T.xxx(主题级)> 硬编码默认(maze 是 startMaze 闭包变量)
        var topBoost = (maze.topBoost != null ? maze.topBoost : (T.topBoost != null ? T.topBoost : 0.12));
        var botDip   = (maze.botDip   != null ? maze.botDip   : (T.botDip   != null ? T.botDip   : 0.18));
        var N = 16, seg, v, k, a, sy, sh;   // 6→16 段:每段边界色差从 ~10(>JND 4)降到 ~3.5(<JND)→ 平整墙上原 5 条阶梯横带消失成平滑渐变(ultracode 定位的「粗横线」主因之一);多 10 次 fillRect/列可忽略
        for (seg = 0; seg < N; seg++) {
          v  = (seg + 0.5) / N;                          // 段中心相对高度 [0顶..1底]
          k  = topBoost * (1 - v) - botDip * v;         // >0=偏亮, <0=偏暗
          a  = Math.abs(k) * f;                          // alpha 按 distF 调制(远弱、防过曝)
          if (a < 0.005) continue;
          sy = Math.round(dY + seg / N * dH);
          sh = Math.max(1, Math.round(dH / N));
          if (k > 0) {
            ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';  // 偏亮叠白
          } else {
            ctx.fillStyle = 'rgba(0,0,0,' + a.toFixed(3) + ')';        // 偏暗叠黑
          }
          ctx.fillRect(i, sy, 1, sh);
        }
        ctx.fillStyle = rgbK(b, fk * 0.86); ctx.fillRect(i, baseY, 1, baseZone);                             // 干净踢脚底色:最后盖过底部纹理/梯度,给墙脚留一块不“串线”的收口
        ctx.fillStyle = rgbK(b, fk * 0.80); ctx.fillRect(i, baseY, 1, Math.max(1, natH * 0.012));             // 踢脚上缘压线(自然厚度;0.55→0.80 软化:近 baseZone fill 的 0.86=几乎融入;baseZone fill 已建立踢脚区不靠它)
        // Q2 伪 AO(墙脚 ~6% + 墙顶 ~4%,3 子带渐变,alpha 从边缘向内 0→aoStrength)
        var aoStrength = (maze.aoStrength != null ? maze.aoStrength : (T.aoStrength != null ? T.aoStrength : 0.18));   // 0.35→0.18:墙脚 AO 暗带在平整长走廊上跨格对齐成连续「横粗黑线」(端用户在机关游乐场走廊见到),且与已有踢脚 baseZone 收口重叠冗余,故压淡
        var nAO = 3, ai, aoZone, aoSeg, aoA;
        // 墙脚 AO 已移除:它在踢脚 baseZone 收口【上方】再叠一条暗带 → 平整长墙近距离看会跨格对齐成「额外的、横穿砖块的粗横线」(端用户 recipe3 截图)。踢脚 baseZone fill 已提供墙脚暗化、AO 冗余,删之,墙脚只留干净收口。
        // 墙顶 AO(~4% 高,从顶向下 alpha 递减)
        aoZone = natH * 0.04;   // 墙顶 AO 自然厚度(高墙不加厚)
        for (ai = 0; ai < nAO; ai++) {
          aoA = aoStrength * (nAO - ai) / nAO * f;      // 最顶最暗、向下渐淡
          if (aoA < 0.005) continue;
          aoSeg = aoZone / nAO;
          ctx.fillStyle = 'rgba(0,0,0,' + aoA.toFixed(3) + ')';
          ctx.fillRect(i, Math.round(dY + ai * aoSeg), 1, Math.max(1, Math.round(aoSeg)));
        }
      }

      // ── 门样式叠加(纯视觉,叠在 shadeWall 暖橙门底色上;通关逻辑 doorAhead/winNow/castRay.door/zbuf 全零改)──
      //   逐列 1px:竖结构按 wallX、横结构按世界高 v;门始终比墙亮/醒目="找发光的门"指引不破。glow 默认=不叠加=中性门字节不变。
      function drawDoorOverlay(i, y0, h, w, perp, T) {
        var f = distF(perp), style = T.door, r;   // 同 shadeWall distF → 门叠层跟 torch 摇曳同步
        function warm(k) { if (T.doorGlow) { var dg = T.doorGlow, lf = (0.17 + 0.83 * f) * k; return 'rgb(' + Math.min(255, Math.round(dg[0] * lf)) + ',' + Math.min(255, Math.round(dg[1] * lf)) + ',' + Math.min(255, Math.round(dg[2] * lf)) + ')'; } var dv = Math.round(150 * f) + 30; return 'rgb(' + Math.min(255, Math.round((dv + 40) * k)) + ',' + Math.round(dv * 0.78 * k) + ',' + Math.round(dv * 0.34 * k) + ')'; }   // 门部位色:doorGlow 派生(冷主题)/ 缺省暖橙(warm(1)=现有门色;不设 doorGlow 逐字节不变)
        function iron(k) { var v = Math.round(66 * f * k); return 'rgb(' + v + ',' + Math.round(v * 1.04) + ',' + Math.round(v * 1.12) + ')'; }   // 冷铁(偏蓝灰)
        if (style === 'iron-bars' || style === 'portcullis') {
          var nb = style === 'portcullis' ? 7 : 5, bl = ((w * nb) % 1 + 1) % 1;
          if (bl < 0.30) { ctx.fillStyle = iron(1); ctx.fillRect(i, y0, 1, h); }                          // 竖铁条
          else { ctx.fillStyle = warm(1.18); ctx.fillRect(i, y0 + h * 0.06, 1, h * 0.88); }               // 条间透暖光(比墙亮=指引)
          ctx.fillStyle = iron(0.9); ctx.fillRect(i, y0, 1, Math.max(1, h * 0.06)); ctx.fillRect(i, y0 + h * 0.94, 1, Math.max(1, h * 0.06));   // 顶/底横梁
          if (style === 'portcullis') for (r = 1; r < 4; r++) { ctx.fillStyle = iron(0.95); ctx.fillRect(i, y0 + r / 4 * h, 1, Math.max(1, h * 0.03)); }   // 横铁条=密格栅
        } else if (style === 'shoji') {
          ctx.fillStyle = 'rgb(' + Math.round(216 * f) + ',' + Math.round(208 * f) + ',' + Math.round(178 * f) + ')'; ctx.fillRect(i, y0, 1, h);   // 亮米白纸(比墙亮=自带指引)
          var wl = ((w * 4) % 1 + 1) % 1, wood = rgbK([120, 96, 64], f);
          if (wl < 0.07 || wl > 0.93) { ctx.fillStyle = wood; ctx.fillRect(i, y0, 1, h); }                // 竖木格
          for (r = 0; r <= 3; r++) { ctx.fillStyle = wood; ctx.fillRect(i, y0 + Math.min(h - 2, r / 3 * h), 1, Math.max(1, h * 0.025)); }   // 横木梁(含顶底)
        } else if (style === 'sphincter') {
          var open = Math.max(0.02, 0.20 * (1 - Math.abs(w - 0.5) * 1.6));                                // 中心开口大、两侧收拢(letterbox 收口)
          ctx.fillStyle = rgbK([92, 30, 34], f); ctx.fillRect(i, y0, 1, h);                               // 暗肉唇整列
          ctx.fillStyle = 'rgb(' + Math.round(214 * f) + ',' + Math.round(120 * f) + ',' + Math.round(72 * f) + ')';
          ctx.fillRect(i, y0 + (0.5 - open) * h, 1, Math.max(1, 2 * open * h));                            // 裂缝透暖光(指引)
          for (r = 1; r < 4; r++) { ctx.fillStyle = rgbK([58, 18, 22], f); ctx.fillRect(i, y0 + r / 4 * h, 1, 1); }   // 水平肉唇纹
        } else if (style === 'blast-door') {
          ctx.fillStyle = rgbK([112, 118, 126], f); ctx.fillRect(i, y0, 1, h);                            // 冷灰金属(覆暖底)
          var hz = ((w * 5) % 1 + 1) % 1 < 0.5;
          ctx.fillStyle = hz ? 'rgb(' + Math.round(208 * f) + ',' + Math.round(172 * f) + ',' + Math.round(32 * f) + ')' : rgbK([34, 30, 24], f);
          ctx.fillRect(i, y0, 1, Math.max(1, h * 0.11)); ctx.fillRect(i, y0 + h * 0.89, 1, Math.max(1, h * 0.11));   // 顶底黄黑警示条
          ctx.fillStyle = rgbK([64, 68, 76], f); ctx.fillRect(i, y0 + h * 0.49, 1, Math.max(1, h * 0.03));   // 中央接缝
          var rl = ((w * 6) % 1 + 1) % 1; if (rl < 0.12) { ctx.fillStyle = rgbK([156, 162, 170], f); ctx.fillRect(i, y0 + h * 0.22, 1, 2); ctx.fillRect(i, y0 + h * 0.72, 1, 2); }   // 铆钉
        } else if (style === 'archway') {
          var edge = Math.abs(w - 0.5), openTop = 0.10 + Math.pow(Math.min(1, edge * 2.0), 1.7) * 0.38;
          if (edge > 0.39 || openTop > 0.34) { ctx.fillStyle = rgbK([80, 72, 58], f); ctx.fillRect(i, y0, 1, h); }   // 两侧/拱顶厚石框
          else { ctx.fillStyle = warm(1.24); ctx.fillRect(i, y0 + openTop * h, 1, h * (0.90 - openTop)); }          // 中央亮开口=出口身份
          ctx.fillStyle = rgbK([42, 34, 28], f); ctx.fillRect(i, y0 + Math.max(1, openTop * h - h * 0.03), 1, Math.max(1, h * 0.03));
        } else if (style === 'portal') {
          var pe = Math.abs(w - 0.5), ring = pe > 0.30 && pe < 0.43;
          ctx.fillStyle = ring ? warm(1.45) : (pe < 0.24 ? warm(1.22) : rgbK([28, 24, 42], f));
          ctx.fillRect(i, y0 + h * 0.08, 1, h * 0.84);                                  // 发光竖裂隙 + 两侧暗幕
          if (((w * 11) % 1 + 1) % 1 < 0.09) { ctx.fillStyle = warm(1.65); ctx.fillRect(i, y0 + h * 0.22, 1, h * 0.56); }   // 能量束
        } else if (style === 'stairs') {
          ctx.fillStyle = rgbK([34, 30, 28], f); ctx.fillRect(i, y0, 1, h);              // 深井/楼梯洞底
          if (Math.abs(w - 0.5) < 0.34) { ctx.fillStyle = warm(1.10); ctx.fillRect(i, y0 + h * 0.06, 1, h * 0.44); }   // 远端亮口
          for (r = 3; r < 8; r++) { ctx.fillStyle = rgbK(r % 2 ? [128, 116, 96] : [68, 58, 48], f); ctx.fillRect(i, y0 + h * (r / 9), 1, Math.max(1, h * 0.025)); }   // 阶梯横踏步
          if (Math.abs(w - 0.5) > 0.36) { ctx.fillStyle = rgbK([62, 52, 42], f); ctx.fillRect(i, y0, 1, h); }       // 两侧墙/扶壁
        } else if (style === 'elevator') {
          ctx.fillStyle = rgbK([86, 96, 106], f); ctx.fillRect(i, y0, 1, h);             // 升降梯门板
          var seam = Math.abs(w - 0.5) < 0.018;
          if (seam) { ctx.fillStyle = warm(1.25); ctx.fillRect(i, y0 + h * 0.10, 1, h * 0.80); }                   // 中缝透光
          var band = ((w * 4) % 1 + 1) % 1; if (band < 0.07 || band > 0.93) { ctx.fillStyle = rgbK([34, 40, 48], f); ctx.fillRect(i, y0, 1, h); }
          for (r = 1; r < 4; r++) { ctx.fillStyle = rgbK([148, 160, 172], f); ctx.fillRect(i, y0 + r / 4 * h, 1, Math.max(1, h * 0.018)); }   // 水平舱门线
        } else if (style === 'wheel-hatch') {                // 潜艇圆舱门:冷铁舱壁底 + 圆形密封轮廓 + 中心十字轮阀 + 外圈铆接密封环(Iron Lung/System Shock 2 Von Braun)。
          var hcx = 0.5, hcy = 0.5, dw = w - hcx;             // 门以自身宽度归一坐标系居中(w:0..1 横向;v 纵向用 (纵向位置-y0)/h 归一,下方逐行算)
          ctx.fillStyle = rgbK([44, 58, 54], f); ctx.fillRect(i, y0, 1, h);             // 冷铁舱壁底(幽绿偏灰,呼应主题冷铁但比墙暗=舱门是嵌入结构)
          for (r = 0; r < 24; r++) {                          // 逐行扫纵向 24 格,算该行与圆心的归一化距离 → 圆形密封轮廓/中心开口/十字轮阀都按半径判定(近似圆,fillRect 逐行拼出)
            var hv = (r + 0.5) / 24, hdy = hv - hcy, hrr = Math.sqrt(dw * dw + hdy * hdy);   // hrr = 到门中心的归一化半径(横纵同尺度,门是方形取景框但视觉读作圆)
            var hy0 = y0 + hv * h - h / 24 / 2, hyh = Math.max(1, h / 24);
            if (hrr < 0.15) { ctx.fillStyle = warm(1.30); ctx.fillRect(i, hy0, 1, hyh); }              // 中心圆形开口:门光(指引色,证"这是出口")
            else if (hrr < 0.40) {                            // 舱门圆面(密封轮廓内):暗铁灰,偏绿呼应主题
              ctx.fillStyle = rgbK([58, 76, 70], f); ctx.fillRect(i, hy0, 1, hyh);
              if (Math.abs(dw) < 0.035 || Math.abs(hdy) < 0.035) { ctx.fillStyle = warm(1.05); ctx.fillRect(i, hy0, 1, hyh); }   // 十字轮阀(横+竖两条窄条穿过圆面,门光色=醒目但不喧宾)
            } else if (hrr < 0.46) { ctx.fillStyle = iron(1.1); ctx.fillRect(i, hy0, 1, hyh); }        // 密封轮廓圈(冷铁亮边,圆的可读边界)
          }
          var hAng = ((w * 14) % 1 + 1) % 1; if (hAng < 0.10) { ctx.fillStyle = iron(0.85); ctx.fillRect(i, y0 + h * 0.06, 1, Math.max(1, h * 0.030)); ctx.fillRect(i, y0 + h * 0.90, 1, Math.max(1, h * 0.030)); }   // 外圈铆接密封环(周向稀疏铆钉,顶/底各一圈=锈蚀铆接感,同 blast-door 铆钉手法)
        }
      }

      // ── 发光门光晕(god-ray/bloom;纯加性 rgba 软辉光,render() 里墙后、精灵前调)──
      //   门是导航灯塔("找发光的门")→ 在门的屏幕 bbox 外扩几层暖色半透明矩形=柔光晕,中心最亮向外淡出(光从门口渗到周边墙)。
      //   近门更亮、远门微光(>6 格几乎无→不喧宾夺主);**静态不随 g.tw 脉动**(守 I2a「torchFlick 是静态场景唯一 g.tw 变量」不变式);
      //   确定性(纯门屏幕 bbox+距离的函数,无 PRNG);加性 fillRect(A 段计数下限安全)。各门样式统一暖金(同 shadeWall 门色族=统一"发光门"身份)。
      function drawDoorGlow(x0, x1, ty, by, perp) {
        if (x1 < x0) return;                                  // 无可见门列
        var near = Math.max(0, Math.min(1, (10 - perp) / 9));  // 视野内(≤10 格)门都泛光:远门=暗中的小暖灯塔(指引最需要、暗背景里最显)、近门=门口暖洗;>10 跳过
        if (near <= 0.02) return;
        var cx = (x0 + x1) / 2, cy = (ty + by) / 2, w = (x1 - x0) + 2, h = (by - ty), n = 5, k, dg = T.doorGlow || [255, 186, 92];   // dg=辉光色(per-theme doorGlow / 缺省暖橙金,不设 → 逐字节不变)
        for (k = n; k >= 1; k--) {                            // 外层大而淡 → 内层小而亮(source-over 叠出柔辉,小亮层最后画=居中);略偏竖=光从门口向上下渗
          var ex = k / n, gw = w * (0.7 + ex * 1.7), gh = h * (0.55 + ex * 0.95);
          ctx.fillStyle = 'rgba(' + dg[0] + ',' + dg[1] + ',' + dg[2] + ',' + (0.12 * near * (1 - (k - 1) / n)).toFixed(3) + ')';   // doorGlow 色族(缺省暖橙金)
          ctx.fillRect(Math.round(cx - gw / 2), Math.round(cy - gh / 2), Math.round(gw), Math.round(gh));
        }
      }

      // ── 动态演出(纯 rgba/fillRect)──────────────────────────────────────────
      function dreadVignette(rgb, maxA, depthFrac) {            // 边缘渐暗收拢(tunnel-vision/环境光遮蔽压迫;外深内浅)
        var k, n = 7, vw = CW * depthFrac / n, vh = CH * depthFrac / n, pre = 'rgba(' + rgb + ',';
        for (k = 0; k < n; k++) {
          ctx.fillStyle = pre + (maxA * (n - k) / n).toFixed(3) + ')';
          ctx.fillRect(k * vw, 0, Math.ceil(vw) + 1, CH); ctx.fillRect(CW - (k + 1) * vw, 0, Math.ceil(vw) + 1, CH);   // 左右
          ctx.fillRect(0, k * vh, CW, Math.ceil(vh) + 1); ctx.fillRect(0, CH - (k + 1) * vh, CW, Math.ceil(vh) + 1);   // 上下
        }
      }
      function drawBlood(t) {                                   // 血流:多条不同速度血痕从顶垂下(t=被抓后秒数)
        for (var i = 0; i < g.blood.length; i++) {
          var b = g.blood[i], tt = t - b.delay; if (tt <= 0) continue;
          var len = Math.min(b.max, tt * b.speed);
          ctx.fillStyle = 'rgba(158,12,16,0.96)'; ctx.fillRect(b.x, 0, b.w, len);                         // 主流鲜红(提亮=洗不没)
          ctx.fillStyle = 'rgba(96,0,4,0.97)'; ctx.fillRect(b.x - 1, len - b.w - 1, b.w + 2, b.w + 3);    // 流头将滴的水珠
          ctx.fillStyle = 'rgba(235,90,90,0.6)'; ctx.fillRect(b.x + b.w - 1, 0, 1, len);                  // 边缘高光
        }
      }
      function drawWisps(t, amp) {                              // 灵魂出窍:蓝白 hitodama 人魂(t=时间;amp 强度默认1,靠近时<1=淡显预兆)
        amp = amp == null ? 1 : amp;
        for (var i = 0; i < g.wisps.length; i++) {
          var w = g.wisps[i];
          var prog = ((t * w.rise + w.ph / 6.283) % 1 + 1) % 1;                       // 0→1 上升循环
          var yy = (0.92 - prog * 1.05) * CH;                                          // 由下而上飘出屏顶
          var sx = (w.x + Math.sin(t * w.swRate + w.ph) * w.sway) * CW;               // 横向摇曳
          var a = Math.min(1, t * 0.7) * (0.30 + 0.55 * Math.sin(prog * Math.PI)) * amp;    // 中途最亮、首尾淡入淡出
          if (a <= 0.02) continue;
          var rr = w.r * (0.82 + 0.36 * Math.sin(t * 5 + w.ph));                       // 轻微脉动
          ctx.fillStyle = 'rgba(70,150,195,' + (a * 0.55).toFixed(3) + ')'; ctx.fillRect(sx - rr * 1.2, yy - rr * 1.2, rr * 2.4, rr * 2.4);   // 外晕(蓝)
          ctx.fillStyle = 'rgba(110,210,210,' + (a * 0.5).toFixed(3) + ')'; ctx.fillRect(sx - rr / 3, yy, rr * 0.7, rr * 2.6);        // 尾焰(向下拖)
          ctx.fillStyle = 'rgba(150,225,240,' + a.toFixed(3) + ')'; ctx.fillRect(sx - rr / 2, yy - rr / 2, rr, rr);                   // 青白核(满亮)
          ctx.fillStyle = 'rgba(225,250,255,' + (a * 0.95).toFixed(3) + ')'; ctx.fillRect(sx - rr / 5, yy - rr / 5, rr * 0.4, rr * 0.4);   // 高光芯
        }
      }
      function wash(r, gg, b, a) { ctx.fillStyle = 'rgba(' + r + ',' + gg + ',' + b + ',' + a.toFixed(3) + ')'; ctx.fillRect(0, 0, CW, CH); }
      // ── 死亡演出(用户拍板:突脸冲入后【屏幕黑掉 + 单独渲染眼睛 + 保留血/氛围】;按鬼分化、纯 fillRect、确定性微动)──
      //   设计依据(ultracode 调研):隔离=黑底只剩眼=最压迫;眼大占比 15-25%;微动(瞳孔颤来自 eyeLayers 的 twx/twy + 罕见慢眨);暖红血与眼同族。
      //   **眼睛直接复用 eyeLayers**(= faceLayers 脸内同一画法)→ 单一真相、永不与脸漂移(用户拍板)。
      function drawDeathEyes(m, t, ea) {                        // 黑底大眼=放大居中调用 eyeLayers(怪物自己的眼睛画法)
        var face = (m && (m.face === 'yurei' || m.face === 'skull' || m.face === 'mimic')) ? m.face : 'zombie';
        var S = CH * 1.6, cyF = CH * 0.46 + S * 0.22, idx = m && m.idx;   // 眼区(eyeLayers 约 cy−0.2s 处)放大居中、略偏上
        var layers = eyeLayers(face, CW / 2, cyF, S, idx), i, ly, c;
        for (i = 0; i < layers.length; i++) { ly = layers[i]; c = ly.blackRgb || ly.rgb; ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + ea.toFixed(3) + ')'; ctx.fillRect(ly.x, ly.y, ly.w, ly.h); }   // 黑底用 blackRgb(黑洞眼→苍白巩膜),脸内用 rgb(零变化)
        if (face === 'zombie') {                                // 右眼血泪垂到屏底(连 drawBlood;沿用 faceLayers 血泪起点 cx+0.18s)
          var th = Math.min(CH, Math.max(0, t - 1.05) * 220), bx = CW / 2 + S * 0.18, by = cyF - S * 0.07;
          ctx.fillStyle = 'rgba(120,12,14,' + ea.toFixed(3) + ')'; ctx.fillRect(bx, by, S * 0.022, th);
          ctx.fillStyle = 'rgba(176,32,32,' + (0.7 * ea).toFixed(3) + ')'; ctx.fillRect(bx + S * 0.022, by, 1, th);
        }
        var bl = Math.sin(t * 0.7);                             // 罕见慢眨=活着(上下眼睑黑带收合)
        if (bl > 0.93) { var cl = (bl - 0.93) / 0.07, tB = CH * 0.2, bndH = CH * 0.66; ctx.fillStyle = 'rgba(0,0,0,' + ea.toFixed(3) + ')'; ctx.fillRect(0, tB, CW, bndH / 2 * cl); ctx.fillRect(0, tB + bndH - bndH / 2 * cl, CW, bndH / 2 * cl); }
      }
      function drawEyesInDark(m, dt2) {                          // 突脸冲入后:屏幕黑掉 → 眼睛渐睁 → 保留各鬼血/氛围在黑底上
        var bk = Math.min(1, Math.max(0, (dt2 - 0.85) / 0.35));  // 0.85→1.2 黑屏渐入(替代原 wash)
        if (bk <= 0) return;                                     // 仍在突脸冲入阶段:让 face billboard 露出(攻击动作)
        wash(0, 0, 0, bk);                                       // 屏幕黑掉(复用 wash)
        var ea = Math.min(1, Math.max(0, (dt2 - 1.05) / 0.5));   // 1.05→1.55 眼睛渐睁(混乱后的寂静注视)
        var isBody = !!(m && m.body), face = m && m.face;
        if (ea > 0 && !isBody) drawDeathEyes(m, dt2, ea);        // 有脸的鬼才画眼(drawDeathEyes 内部按 m.face 选;未知→zombie,与 faceLayers 一致)
        var at = Math.max(0, dt2 - 0.85);                        // 死亡氛围从黑屏起算、在黑底上(原 wash 已被黑屏取代)
        if (isBody) drawGlitch(at, 1.3);                         // 全身怪(slender)无脸:吞入黑暗 + 信号噪
        else if (face === 'yurei') drawBlackMist(at * 0.8);
        else if (face === 'skull') drawWisps(at);
        else if (face === 'mimic') { drawGlitch(at); drawBlood(at); }
        else { drawMiasma(at * 0.7); drawBlood(at); }            // zombie/默认:腐瘴 + 血
      }
      function proxFx(face, prox, t) {                          // 鬼靠近时的画面预兆(死亡演出的淡显版,强度 ∝ 靠近;远处只有暗角)
        if (prox < 0.72) return;                                // 只有贴近(<3-4 格)才显形,远处只有暗角=不干扰看见鬼
        var amp = (prox - 0.72) / 0.28 * 0.55;                  // 0.72 起淡显 → 贴近 ~0.55(克制、偏周边、不挡视野)
        if (face === 'yurei') drawBlackMist(t, amp);            // 黑雾从周边渗入
        else if (face === 'skull') drawWisps(t, amp);           // 蓝白人魂飘
        else if (face === 'zombie') drawMiasma(t, amp);         // 腐绿瘴气
        else if (face === 'mimic' || face === 'slender') drawGlitch(t, amp * 1.2);   // 信号故障闪烁(伪人/Slenderman:略强=醒目)
      }
      function drawBlackMist(t, amp) {                           // 幽灵:黑雾升腾(比人魂大而柔、冷蓝边;怨灵化黑烟;amp 强度默认1)
        amp = amp == null ? 1 : amp;
        for (var i = 0; i < g.wisps.length; i++) {
          var w = g.wisps[i];
          var prog = ((t * w.rise * 0.7 + w.ph / 6.283) % 1 + 1) % 1;
          var yy = (0.96 - prog * 1.12) * CH, sx = (w.x + Math.sin(t * w.swRate * 0.6 + w.ph) * w.sway * 1.7) * CW;
          var a = Math.min(1, t * 0.6) * (0.22 + 0.5 * Math.sin(prog * Math.PI)) * amp; if (a <= 0.02) continue;
          var rr = w.r * (2.3 + 0.5 * Math.sin(t * 2 + w.ph));
          ctx.fillStyle = 'rgba(5,4,9,' + (a * 0.5).toFixed(3) + ')'; ctx.fillRect(sx - rr, yy - rr, rr * 2, rr * 2.4);
          ctx.fillStyle = 'rgba(16,14,24,' + (a * 0.4).toFixed(3) + ')'; ctx.fillRect(sx - rr * 0.6, yy - rr * 0.4, rr * 1.2, rr * 1.9);
          ctx.fillStyle = 'rgba(44,52,74,' + (a * 0.16).toFixed(3) + ')'; ctx.fillRect(sx - rr * 0.3, yy - rr, rr * 0.6, rr * 0.5);
        }
      }
      function drawMiasma(t, amp) {                              // 僵尸:腐绿瘴气 + 尸虫黑点(amp 强度默认1)
        amp = amp == null ? 1 : amp;
        for (var i = 0; i < g.wisps.length; i++) {
          var w = g.wisps[i];
          var prog = ((t * w.rise * 0.85 + w.ph / 6.283) % 1 + 1) % 1;
          var yy = (0.95 - prog * 1.05) * CH, sx = (w.x + Math.sin(t * w.swRate * 0.8 + w.ph) * w.sway * 1.3) * CW;
          var a = Math.min(1, t * 0.6) * (0.28 + 0.5 * Math.sin(prog * Math.PI)) * amp; if (a <= 0.02) continue;
          var rr = w.r * (1.7 + 0.4 * Math.sin(t * 3 + w.ph));
          ctx.fillStyle = 'rgba(68,94,28,' + (a * 0.42).toFixed(3) + ')'; ctx.fillRect(sx - rr, yy - rr, rr * 2, rr * 2);
          ctx.fillStyle = 'rgba(108,138,48,' + (a * 0.28).toFixed(3) + ')'; ctx.fillRect(sx - rr * 0.5, yy - rr * 0.5, rr, rr);
          ctx.fillStyle = 'rgba(8,10,5,' + (a * 0.55).toFixed(3) + ')'; ctx.fillRect(sx + Math.sin(t * 7 + w.ph) * rr, yy + Math.cos(t * 6 + w.ph) * rr * 0.5, 2, 2);
        }
      }
      function drawGlitch(t, amp) {                              // 伪人:模拟信号故障(静电条 + RGB 分离 + 闪烁,Mandela analog horror;amp 强度默认1)
        amp = amp == null ? 1 : amp;
        var q = Math.floor(t * 9), i, s;
        for (i = 0; i < g.wisps.length; i++) {
          var gr = mulberry32(hashStr('glitch' + i + '_' + q));
          if (gr() > 0.62) continue;
          var by = gr() * CH, bh = 3 + gr() * 16, bx = gr() * CW * 0.35, bw = CW * (0.3 + gr() * 0.55), seg = 8 + Math.floor(gr() * 10);
          ctx.fillStyle = 'rgba(220,40,40,' + (0.26 * amp).toFixed(3) + ')'; ctx.fillRect(bx - 3, by, bw, bh);    // 红左移
          ctx.fillStyle = 'rgba(40,220,220,' + (0.22 * amp).toFixed(3) + ')'; ctx.fillRect(bx + 3, by, bw, bh);   // 青右移
          for (s = 0; s < seg; s++) { var v = gr() > 0.5 ? 215 : 25; ctx.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + ((0.3 + gr() * 0.45) * amp).toFixed(3) + ')'; ctx.fillRect(bx + s / seg * bw, by, bw / seg + 1, bh); }
        }
      }

      // ── billboard 精灵(怪物):世界坐标→屏幕投影 + 逐列 z-buffer 遮挡 + 纯 fillRect 程序化画"贴脸的脸" ──
      //   投影与投墙同相机模型(g.a + FOV + tan/atan 互逆);perpDepth 与墙 perp 同坐标系才能逐列比深度。
      function floorYAtDepth(depth) { return CH / 2 + CH / (2 * depth); }
      function projectSprite(sp) {
        var dx = sp.sx - g.px, dy = sp.sy - g.py;
        var dist = Math.sqrt(dx * dx + dy * dy); if (dist < 0.05) dist = 0.05;
        var ang = Math.atan2(dy, dx) - g.a;                     // 相对玩家朝向的角差
        while (ang < -Math.PI) ang += 2 * Math.PI;
        while (ang > Math.PI) ang -= 2 * Math.PI;
        if (Math.abs(ang) > FOV * 0.75) return null;            // 视野外(留余量,贴脸半身入画仍画)
        var perpDepth = dist * Math.cos(ang); if (perpDepth < 0.05) perpDepth = 0.05;
        var screenX = Math.floor(CW * (0.5 + Math.tan(ang) / (2 * Math.tan(FOV / 2))));   // 与投墙 cameraX=atan(..) 互逆
        if (sp.isKey || (sp.isItem && !sp.isDecor && !sp.isFloorPickup && !sp.isWallPickup)) {            // 钥匙/坐标事件道具:可拾取物=独立 token,但底部锚到地面线并加接触阴影;不是普通地面贴花,也不再像 UI 图标漂在空中。
          var kh = Math.min(CH * 2, CH / perpDepth) * 0.46, kbob = Math.sin(g.tw * 2.2 + (sp.idx || 0)) * kh * 0.045;   // bob 保留“可拿”注意力,幅度降小=落地感优先
          var kW = kh * 0.62, itemFloorY = floorYAtDepth(perpDepth), kY0 = itemFloorY - kh + kbob;   // 底部≈floorY,轻微 bob 围绕地面线;玩家读作“落在地上的小物体”
          return { screenX: screenX, depth: perpDepth, h: kh, w: kW, floorY: itemFloorY, x0: Math.floor(screenX - kW / 2), x1: Math.floor(screenX + kW / 2), y0: Math.floor(kY0), sp: sp };
        }
        if (sp.isPillar) {                                      // 柱子地标:落地锚定(脚在地面线)、pillarScale 控高度;宽度按占地体块而非简单 billboard 固定比例,避免近景像竖图放大
          var plFloorY = floorYAtDepth(perpDepth);
          var plScale = sceneCeilH(maze) * (sp.pillarScale != null ? sp.pillarScale : 1);   // 柱高=场景房高×pillarScale(默认1=正好顶到天花板;<1=残柱、>1=戳穿)→ 高厅里柱子随天花拔高
          var plH = plScale * Math.min(CH * 4, CH / perpDepth);   // 柱高=柱比例×【墙同款高度】min(CH*4,CH/perp),与墙【同步生长】→ 靠近不再被 plFloorY 夹住而相对墙萎缩(端用户「柱子伸缩」);贴图随之等比、不抽搐
          var plW = Math.max(3, CH * 0.42 / perpDepth);        // 柱宽=固定占地投影(只随【距离】、不随【柱高】等比→ 拔高的柱子=细高石柱、非粗块)
          var plY0 = plFloorY - plH;
          return { screenX: screenX, depth: perpDepth, h: plH, w: plW, floorY: plFloorY, x0: Math.floor(screenX - plW / 2), x1: Math.floor(screenX + plW / 2), y0: Math.floor(plY0), sp: sp };
        }
        if (sp.isDecor) {                                      // 主题装饰物:默认贴地低矮碎片(floor),显式 mode:'sprite' 才走竖牌逃生;二者都低亮度、不 bob、不抢功能物
          var dFloorY = floorYAtDepth(perpDepth);
          if (sp.decorMode === 'sprite') {
            var dh = Math.min(CH * 1.0, CH / perpDepth) * (sp.decorScale || 0.60);
            var dW = dh * 0.56;
            return { screenX: screenX, depth: perpDepth, h: dh, w: dW, floorY: dFloorY, x0: Math.floor(screenX - dW / 2), x1: Math.floor(screenX + dW / 2), y0: Math.floor(dFloorY - dh), sp: sp };
          }
          var fw = Math.max(5, CH * (sp.decorScale || 0.62) / perpDepth * 0.62), fh = Math.max(2, fw * 0.28);
          return { screenX: screenX, depth: perpDepth, h: fh, w: fw, floorY: dFloorY, x0: Math.floor(screenX - fw / 2), x1: Math.floor(screenX + fw / 2), y0: Math.floor(dFloorY - fh / 2), sp: sp };
        }
        if (sp.isFloorPickup) {                                  // 嵌入式隐藏拾取:贴地、低矮、无 bob/fullbright,但仍是可拿事件物(区别于纯 decor)
          var fpFloorY = floorYAtDepth(perpDepth);
          var fpW = Math.max(7, CH * 0.48 / perpDepth), fpH = Math.max(2, fpW * 0.24);
          return { screenX: screenX, depth: perpDepth, h: fpH, w: fpW, floorY: fpFloorY, x0: Math.floor(screenX - fpW / 2), x1: Math.floor(screenX + fpW / 2), y0: Math.floor(fpFloorY - fpH / 2), sp: sp };
        }
        var spriteH, y0, spriteW;
        if (sp.body) {                                          // 全身像(Slenderman 等):落地锚定(脚在地面线)、异常高瘦
          var floorY = CH / 2 + CH / (2 * perpDepth);           // 该距离的地面线(=1 格墙底投影)
          spriteH = 1.45 * CH / perpDepth;                      // 1.45× 1格高(头从地平线上方稍高=异常但不破坏远小)
          if (spriteH > floorY * 0.96) spriteH = floorY * 0.96; // 极近时才 clamp 防溢出屏顶
          y0 = floorY - spriteH;                                // 头顶(脚锚地面 → 远距离整体自然变小)
          spriteW = spriteH * 0.18;                             // 极瘦削
        } else {                                                // 脸 billboard(竖直居中)
          spriteH = Math.min(CH * 4, CH / perpDepth);           // 同墙 lineH(近大远小)
          if (perpDepth < 0.85 && Math.abs(screenX - CW / 2) < CW / 5) spriteH *= 1 + (0.85 - perpDepth) * 2.2;   // 贴脸夸张放大(眼睛暴大)
          y0 = CH / 2 - spriteH / 2;
          spriteW = spriteH;
        }
        if (g.lunge === sp) {                                   // 突脸/扑身两段:先定格看全(~0.45s)→ 再加速扑上来放大到满屏
          screenX = Math.floor(CW / 2);
          var lt = Math.max(0, g.tw - (g.caughtAt != null ? g.caughtAt : g.tw));
          var k = lt <= 0.45 ? 0 : Math.min(1, (lt - 0.45) / 0.5), ek = k * k;   // 0.45s 定格 → 0.5s 加速扑(ease-in)
          if (sp.body) {
            // 全身像扑上来:第一段照常看全身(身高=floorY 入画),第二段切到「头部聚焦」=只画头满屏(电影特写,jump-scare 焦点)
            if (ek === 0) {                                     // 定格阶段:看全身原比例,放大 1.35x
              spriteH *= 1.35; spriteW *= 1.35; y0 = floorY - spriteH;
            } else {                                            // 扑近阶段:头部为锚,放大头到满屏(头宽=肩×0.6,头高=spriteH*0.055;反推让头满屏)
              sp.lungeFocus = 'head';                            // → bodyLayers 据此切到头部特写
              // 让 bodyLayers 的"头部+背景触手"区域充满屏。spriteH 用一个伪值让 bodyLayers 各 px 维度按它算
              var headScale = 1 + ek * 12;                       // 头大小放大 ~13x → 占满屏
              spriteH = CH * (0.88 + ek * 3.7) * 1.35;
              spriteW = spriteH * 0.5;
              y0 = CH / 2 - spriteH / 2;
              sp.lungeScale = headScale;
            }
          } else {                                              // 脸 billboard:直接放大冲入(jump-scare 攻击动作;眼睛定格改由死亡演出「黑屏 + 单独画眼 + 保留血」处理)
            spriteH = CH * (0.88 + ek * 3.7);
            spriteW = spriteH;
            y0 = CH / 2 - spriteH / 2;
          }
        } else { sp.lungeFocus = null; sp.lungeScale = 1; }
        return { screenX: screenX, depth: perpDepth, h: spriteH, w: spriteW,
          x0: Math.floor(screenX - spriteW / 2), x1: Math.floor(screenX + spriteW / 2),
          y0: Math.floor(y0), sp: sp };
      }
      function faceFog(depth) { return T.torch ? Math.max(0.10, Math.min(1, 3.2 / (depth * depth))) * torchFlick : Math.max(0.13, Math.min(1, 2.4 / depth)); }   // 近清晰远暗(派生色,不写字面 #000);torch 主题=二次曲线+摇曳=与墙一致(治远精灵比远墙亮)
      function fogColor(rgb, f) { return 'rgb(' + Math.round(rgb[0] * f) + ',' + Math.round(rgb[1] * f) + ',' + Math.round(rgb[2] * f) + ')'; }
      // ── 眼睛层(单一真相:faceLayers 脸内 与 死亡黑屏 drawDeathEyes **共用同一画法**;void 眼〔skull/mimic〕附极简骨/皮框 → 黑底也可见,脸内被颅骨/肤覆盖=零视觉变化)──
      function eyeLayers(face, cx, cy, s, idx) {
        var L = [], twx, twy;
        if (face === 'yurei') {                                  // 发缝单只瞪眼(逐字复刻 yureiLayers s>=14 块)
          var rng = mulberry32(0xCAFE0000 | ((idx | 0) & 0xFFFF)), es = (rng() - 0.5) * s * 0.04;
          twx = Math.sin(g.tw * 6.1) * s * 0.010; twy = Math.cos(g.tw * 4.3) * s * 0.009;
          if (s >= 14) {
            L.push({ x: cx + s * 0.05 + es, y: cy - s * 0.10 + twy, w: s * 0.10, h: s * 0.085, rgb: [208, 218, 230] });   // 发缝单眼白
            L.push({ x: cx + s * 0.075 + es + twx * 0.5, y: cy - s * 0.09 + twy, w: s * 0.055, h: s * 0.060, rgb: [6, 5, 10] });   // 空洞瞳
          }
          return L;
        }
        if (face === 'skull') {                                  // 双对称空眼窝(+ 骨框;复刻 skullLayers L618-619)
          if (s >= 10) [-0.32, 0.08].forEach(function (ex) {
            L.push({ x: cx + s * ex - s * 0.02, y: cy - s * 0.18 - s * 0.02, w: s * 0.28, h: s * 0.26, rgb: [198, 192, 168] });   // 骨眶框(脸内被颅骨覆盖=零变化;黑底=框出空洞)
            L.push({ x: cx + s * ex, y: cy - s * 0.18, w: s * 0.24, h: s * 0.22, rgb: [10, 8, 6] });                              // 空眼窝黑洞
          });
          return L;
        }
        if (face === 'mimic') {                                  // 双纯黑空眼(+ 人皮框;复刻 mimicLayers s>=10 块,同步游移)
          twx = Math.sin(g.tw * 5.7) * s * 0.012; twy = Math.cos(g.tw * 4.1) * s * 0.010;
          if (s >= 10) [-0.30, 0.08].forEach(function (ex) {
            L.push({ x: cx + s * ex - s * 0.025, y: cy - s * 0.31 - s * 0.025, w: s * 0.27, h: s * 0.25, rgb: [198, 182, 164] });   // 人皮眶框(脸内被肤覆盖;黑底=框出空眼)
            L.push({ x: cx + s * ex + twx, y: cy - s * 0.31 + twy, w: s * 0.22, h: s * 0.20, rgb: [4, 3, 5] });                     // 纯黑空眼
          });
          return L;
        }
        // zombie(默认/未知):不对称双眼(逐字复刻 faceLayers s>=10 块)
        twx = Math.sin(g.tw * 7.3) * s * 0.013; twy = Math.cos(g.tw * 5.1) * s * 0.011;
        if (s >= 10) {
          L.push({ x: cx - s * 0.33, y: cy - s * 0.19, w: s * 0.31, h: s * 0.27, rgb: [6, 5, 7], blackRgb: [112, 106, 84] });   // 左眼窝(大;脸内=黑洞,黑底=病态苍白巩膜→成形)
          L.push({ x: cx + s * 0.11, y: cy - s * 0.29, w: s * 0.18, h: s * 0.16, rgb: [6, 5, 7], blackRgb: [112, 106, 84] });   // 右眼窝(小、偏高=不对称)
          L.push({ x: cx - s * 0.27 + twx, y: cy - s * 0.10 + twy, w: s * 0.13, h: s * 0.11, rgb: [202, 206, 184] });    // 左眼白(大)
          L.push({ x: cx + s * 0.145 + twx, y: cy - s * 0.255 + twy, w: s * 0.085, h: s * 0.082, rgb: [202, 206, 184] }); // 右眼白(小、偏高)
          L.push({ x: cx - s * 0.205 + twx * 1.7, y: cy - s * 0.075, w: s * 0.05, h: s * 0.062, rgb: [8, 6, 10] });      // 左瞳(偏内)
          L.push({ x: cx + s * 0.17 + twx * 0.4, y: cy - s * 0.245, w: s * 0.038, h: s * 0.05, rgb: [8, 6, 10] });       // 右瞳(偏外=斜视失焦)
        }
        return L;
      }
      function faceLayers(p) {                                   // 脸分派:开放词汇 p.sp.face 选脸;未知/缺省 → zombie(下方原代码一行不改=向后兼容)
        var fc = p.sp && p.sp.face;
        if (fc === 'yurei') return yureiLayers(p);
        if (fc === 'skull') return skullLayers(p);
        if (fc === 'mimic') return mimicLayers(p);
        // ── zombie(现状,缺省/未知值):不对称怪诞脸(uncanny:左右眼不一/斜视/歪口不齐牙/暗红泪痕)+ 微颤(活体感)──
        var cx = p.screenX, cy = p.y0 + p.h / 2, s = p.h, L = [];
        L.push({ x: cx - s * 0.35, y: cy - s * 0.55, w: s * 0.70, h: s * 1.08, rgb: [52, 56, 47] });   // 拉长惨白病态头
        L.push.apply(L, eyeLayers('zombie', cx, cy, s, p.sp && p.sp.idx));   // 眼=共享 eyeLayers(脸内 / 死亡黑屏同一画法)
        if (s >= 22) {
          L.push({ x: cx - s * 0.25, y: cy + s * 0.17, w: s * 0.52, h: s * 0.21, rgb: [28, 2, 4] });    // 歪斜大黑口
          var teeth = [[0.00, 0.052, 0.11], [0.105, 0.034, 0.065], [0.165, 0.058, 0.14], [0.25, 0.03, 0.055], [0.305, 0.05, 0.10], [0.385, 0.04, 0.085]];
          for (var ti = 0; ti < teeth.length; ti++) L.push({ x: cx - s * 0.22 + s * teeth[ti][0], y: cy + s * 0.17, w: s * teeth[ti][1], h: s * teeth[ti][2], rgb: [170, 168, 142] });   // 不齐獠牙(宽窄高低各异)
          L.push({ x: cx + s * 0.18, y: cy - s * 0.07, w: s * 0.022, h: s * 0.42, rgb: [72, 4, 6] });   // 右眼下暗红泪痕/裂
        }
        return L;
      }

      // ── 日式幽灵 yurei:冷蓝白长脸 + 垂黑发遮 ~80% + 发缝单只瞪眼(Ringu 贞子/Ju-On 伽椰子)。诚实:竖黑条近似垂发、无飘动 ──
      function yureiLayers(p) {
        var cx = p.screenX, cy = p.y0 + p.h / 2, s = p.h, L = [];
        var rng = mulberry32(0xCAFE0000 | ((p.sp.idx | 0) & 0xFFFF)), eyeShift = (rng() - 0.5) * s * 0.04;
        L.push({ x: cx - s * 0.28, y: cy - s * 0.62, w: s * 0.56, h: s * 1.24, rgb: [176, 188, 198] });   // 冷蓝白长脸(窄高)
        L.push({ x: cx - s * 0.30, y: cy - s * 0.70, w: s * 0.25, h: s * 1.45, rgb: [8, 7, 12] });        // 左垂发(超脸底=拖曳)
        L.push({ x: cx - s * 0.01, y: cy - s * 0.70, w: s * 0.06, h: s * 1.45, rgb: [8, 7, 12] });        // 中发缕
        L.push({ x: cx + s * 0.16 + eyeShift, y: cy - s * 0.70, w: s * 0.16, h: s * 1.45, rgb: [8, 7, 12] });   // 右垂发(留发缝)
        L.push.apply(L, eyeLayers('yurei', cx, cy, s, p.sp && p.sp.idx));   // 眼=共享 eyeLayers(脸内 / 死亡黑屏同一画法)
        if (s >= 22) L.push({ x: cx - s * 0.12, y: cy + s * 0.22, w: s * 0.24, h: s * 0.055, rgb: [22, 8, 10] });   // 发下张口缝
        return L;
      }

      // ── 骷髅 skull:暖骨白颅 + 对称圆空眼窝 + 鼻腔倒梯形 + 整齐方牙网(死物=无微颤)──
      function skullLayers(p) {
        var cx = p.screenX, cy = p.y0 + p.h / 2, s = p.h, L = [], t, x;
        var rng = mulberry32(0xD00D0000 | ((p.sp.idx | 0) & 0xFFFF)), toothCount = 4 + Math.floor(rng() * 2);
        var BONE = [198, 192, 168], SHADOW = [138, 132, 112], CAVITY = [10, 8, 6], TOOTH = [208, 204, 182];
        L.push({ x: cx - s * 0.34, y: cy - s * 0.62, w: s * 0.68, h: s * 0.74, rgb: BONE });   // 颅顶
        L.push({ x: cx - s * 0.25, y: cy + s * 0.12, w: s * 0.50, h: s * 0.38, rgb: BONE });   // 下颌
        L.push({ x: cx - s * 0.38, y: cy - s * 0.05, w: s * 0.08, h: s * 0.28, rgb: SHADOW }); // 左颞阴影
        L.push({ x: cx + s * 0.30, y: cy - s * 0.05, w: s * 0.08, h: s * 0.28, rgb: SHADOW }); // 右颞阴影
        if (s >= 10) {
          L.push.apply(L, eyeLayers('skull', cx, cy, s, p.sp && p.sp.idx));   // 眼=共享 eyeLayers(骨框 + 空洞;脸内被颅骨覆盖=零变化)
          L.push({ x: cx - s * 0.08, y: cy + s * 0.06, w: s * 0.16, h: s * 0.07, rgb: CAVITY });   // 鼻腔倒梯形 1
          L.push({ x: cx - s * 0.06, y: cy + s * 0.13, w: s * 0.12, h: s * 0.05, rgb: CAVITY });   // 鼻腔 2
          L.push({ x: cx - s * 0.04, y: cy + s * 0.18, w: s * 0.08, h: s * 0.04, rgb: CAVITY });   // 鼻腔 3
        }
        if (s >= 22) {
          var totalTW = s * 0.42, tw = totalTW / (toothCount * 1.22), gw = tw * 0.22;
          L.push({ x: cx - totalTW / 2, y: cy + s * 0.36, w: totalTW, h: s * 0.02, rgb: CAVITY });   // 齿龈暗线
          for (t = 0; t < toothCount; t++) {
            x = cx - totalTW / 2 + t * (tw + gw);
            L.push({ x: x, y: cy + s * 0.27, w: tw, h: s * 0.09, rgb: TOOTH });            // 上牙列
            L.push({ x: x + gw * 0.5, y: cy + s * 0.37, w: tw, h: s * 0.07, rgb: TOOTH }); // 下牙列(错位)
          }
        }
        return L;
      }

      // ── 伪人 mimic:乍看正常人脸(肤色椭圆头+眉+鼻梁),植入三处错误(纯黑空眼/裂口笑/机械齐牙)= uncanny(曼德拉记录)──
      function mimicLayers(p) {
        var cx = p.screenX, cy = p.y0 + p.h / 2, s = p.h, L = [], t, x;
        var SKIN = [198, 182, 164];
        L.push({ x: cx - s * 0.22, y: cy - s * 0.58, w: s * 0.44, h: s * 0.10, rgb: SKIN });   // 椭圆头 6 行近似
        L.push({ x: cx - s * 0.31, y: cy - s * 0.48, w: s * 0.62, h: s * 0.10, rgb: SKIN });
        L.push({ x: cx - s * 0.36, y: cy - s * 0.38, w: s * 0.72, h: s * 0.44, rgb: SKIN });   // 最宽
        L.push({ x: cx - s * 0.33, y: cy + s * 0.06, w: s * 0.66, h: s * 0.14, rgb: SKIN });
        L.push({ x: cx - s * 0.24, y: cy + s * 0.20, w: s * 0.48, h: s * 0.12, rgb: SKIN });
        L.push({ x: cx - s * 0.14, y: cy + s * 0.32, w: s * 0.28, h: s * 0.08, rgb: SKIN });   // 下巴
        L.push({ x: cx - s * 0.30, y: cy - s * 0.35, w: s * 0.22, h: s * 0.04, rgb: [118, 96, 78] });   // 左眉(脑识别"人脸")
        L.push({ x: cx + s * 0.08, y: cy - s * 0.35, w: s * 0.22, h: s * 0.04, rgb: [118, 96, 78] });   // 右眉
        L.push({ x: cx - s * 0.025, y: cy - s * 0.18, w: s * 0.05, h: s * 0.20, rgb: [168, 152, 134] }); // 鼻梁
        L.push.apply(L, eyeLayers('mimic', cx, cy, s, p.sp && p.sp.idx));   // 错误①双纯黑空眼=共享 eyeLayers(人皮框 + 空洞;脸内被肤覆盖=零变化)
        if (s >= 22) {
          L.push({ x: cx - s * 0.45, y: cy + s * 0.22, w: s * 0.90, h: s * 0.13, rgb: [18, 4, 6] });   // 错误②裂口笑底(咧到 ~95% 头宽)
          for (t = 1; t <= 3; t++) {                                                                    // 嘴角向上翘
            L.push({ x: cx - s * 0.45 - s * 0.015 * t, y: cy + s * (0.22 - 0.05 * t), w: s * 0.10, h: s * 0.045, rgb: [18, 4, 6] });
            L.push({ x: cx + s * 0.35 + s * 0.015 * t, y: cy + s * (0.22 - 0.05 * t), w: s * 0.10, h: s * 0.045, rgb: [18, 4, 6] });
          }
          for (t = 0; t < 8; t++) {                                                                     // 错误③机械等宽齐牙(过整齐=uncanny)
            x = cx - s * 0.37 + t * s * 0.113;
            L.push({ x: x, y: cy + s * 0.225, w: s * 0.075, h: s * 0.10, rgb: [228, 224, 210] });
          }
        }
        return L;
      }
      // ── 全身站立像(billboard 全身;落地锚定 → 远处=黑暗里一个异常高瘦的人影,近处=扑上来糊屏)──
      function bodyLayers(p, type) {                            // 开放词汇 type(未知 → slender)
        // slender(查证 creepypasta canon):异常高瘦(6-14ft)/ 苍白圆头【完全无五官】/ 黑西装白衬衫 / **背后伸出黑触手(标志特征)**
        var cx = p.screenX, top = p.y0, H = p.h, W = p.w, L = [];
        var SUIT = [12, 12, 18], HEAD = [248, 246, 240], SHIRT = [228, 228, 232], TIE = [6, 6, 9], TENT = [4, 4, 8], HALO = [2, 2, 4];   // HEAD 提到接近纯白(对 shoji 米墙仍亮),HALO=头周围深暗轮廓让头在任何背景上凸出
        // ★ 突脸阶段切到头部聚焦:只画放大的空白圆头 + 几条延伸出屏的触手(jump-scare 焦点,跟脸 billboard 体验对齐)
        if (p.sp.lungeFocus === 'head') {
          var scale = p.sp.lungeScale || 1;
          var hcx = cx, hcy = CH / 2;
          var hH = CH * Math.min(1.3, 0.18 * scale);            // 头满屏(限不溢出过多)
          var hW = hH * 0.92;                                   // 圆头(略宽 SQ)
          L.push({ x: hcx - hW / 2, y: hcy - hH / 2, w: hW, h: hH, rgb: HEAD });                                          // 苍白圆头(满屏空白=无脸 jump-scare)
          L.push({ x: hcx - hW / 2, y: hcy - hH * 0.30, w: hW * 0.10, h: hH * 0.55, rgb: [188, 184, 176] });               // 左阴影=圆感
          L.push({ x: hcx + hW / 2 - hW * 0.10, y: hcy - hH * 0.30, w: hW * 0.10, h: hH * 0.55, rgb: [188, 184, 176] });   // 右阴影
          L.push({ x: hcx - hW / 2, y: hcy + hH / 2, w: hW, h: hH * 0.08, rgb: [188, 184, 176] });                         // 下颌阴影
          // 触手从头后延伸出 4 个角(画面外延=被包围感)
          var tents2 = [[-0.85,-0.55],[0.85,-0.55],[-0.85,0.65],[0.85,0.65]], j, u, tcx, tcy;
          for (var ti2 = 0; ti2 < tents2.length; ti2++) {
            var te = tents2[ti2], sgn = te[0] < 0 ? -1 : 1;
            for (j = 0; j < 10; j++) {
              u = j / 9; tcx = hcx + (te[0] * CW * 0.6) * u; tcy = hcy + (te[1] * CH * 0.6) * u + Math.sin(u * Math.PI) * 24 * sgn;
              var twW = hW * (0.16 - 0.13 * u);
              L.push({ x: tcx - twW / 2, y: tcy, w: twW, h: CH * 0.025, rgb: TENT });
            }
          }
          return L;
        }
        // 用「肩宽」S 作所有比例基准(W=spriteW 已经很瘦)。整体瘦削:S = W * 0.95
        var S = W * 0.95;
        // 头:稍大可辨但仍不成比例小(肩宽 90%、身高 7%);完全空白苍白
        var headW = S * 0.9, headH = H * 0.07;
        L.push({ x: cx - headW / 2 - 2, y: top - 2, w: headW + 4, h: headH + 4, rgb: HALO });   // 深暗轮廓(墙背景同色仍凸出)
        L.push({ x: cx - headW / 2, y: top, w: headW, h: headH, rgb: HEAD });
        L.push({ x: cx - headW / 2, y: top + headH * 0.20, w: headW * 0.16, h: headH * 0.55, rgb: [208, 200, 184] }); // 头左侧阴影=圆感
        L.push({ x: cx + headW / 2 - headW * 0.16, y: top + headH * 0.20, w: headW * 0.16, h: headH * 0.55, rgb: [208, 200, 184] }); // 头右
        // 脖子(细长)
        L.push({ x: cx - headW * 0.18, y: top + headH, w: headW * 0.36, h: H * 0.022, rgb: HEAD });
        // 躯干(西装,极瘦长)
        var torsoTop = top + headH + H * 0.022, torsoH = H * 0.45;
        L.push({ x: cx - S / 2, y: torsoTop, w: S, h: torsoH, rgb: SUIT });
        L.push({ x: cx - S * 0.18, y: torsoTop, w: S * 0.36, h: torsoH * 0.18, rgb: SHIRT });   // 白衬衫 V
        L.push({ x: cx - S * 0.08, y: torsoTop + torsoH * 0.05, w: S * 0.16, h: torsoH * 0.6, rgb: TIE });   // 黑领带
        // 双臂(贴身、垂至大腿,极细)
        var armTop = torsoTop + torsoH * 0.04, armH = torsoH * 1.05, armW = S * 0.20;
        L.push({ x: cx - S / 2 - armW, y: armTop, w: armW, h: armH, rgb: SUIT });
        L.push({ x: cx + S / 2, y: armTop, w: armW, h: armH, rgb: SUIT });
        L.push({ x: cx - S / 2 - armW, y: armTop + armH, w: armW * 1.1, h: H * 0.020, rgb: HEAD });   // 苍白长手
        L.push({ x: cx + S / 2 - armW * 0.1, y: armTop + armH, w: armW * 1.1, h: H * 0.020, rgb: HEAD });
        // 双腿(极瘦长)
        var legTop = torsoTop + torsoH, legH = H - (legTop - top), legW = S * 0.40;
        L.push({ x: cx - legW - S * 0.02, y: legTop, w: legW, h: legH, rgb: SUIT });
        L.push({ x: cx + S * 0.02, y: legTop, w: legW, h: legH, rgb: SUIT });
        // ★ 背后伸出黑触手(从腰背后伸出、向下后方下垂、末梢从腿外侧若隐若现——而非向两侧伸像翅膀)
        if (H >= 70) {                                          // 太远看不清,触手省略=远处只剩瘦人影
          var tents = [
            { sx: -0.3, ex: -1.1, sy: 0.45, ey: 0.95, n: 9 },   // 左侧后方下垂触手(从腰后→腿外侧低处)
            { sx: 0.3, ex: 1.1, sy: 0.45, ey: 0.95, n: 9 },     // 右侧后方
            { sx: -0.2, ex: -0.8, sy: 0.50, ey: 1.05, n: 7 },   // 左副触手(略短,从腿后绕出)
            { sx: 0.2, ex: 0.8, sy: 0.50, ey: 1.05, n: 7 }      // 右副触手
          ];
          for (var ti = 0; ti < tents.length; ti++) {
            var te = tents[ti], j;
            for (j = 0; j < te.n; j++) {
              var u = j / (te.n - 1), curl = Math.sin(u * Math.PI) * 0.12;    // 弧度更小
              var tx = cx + S * (te.sx + (te.ex - te.sx) * u + curl * (te.sx < 0 ? -1 : 1));
              var ty = torsoTop + torsoH * (te.sy + (te.ey - te.sy) * u);
              var tw = S * (0.12 - 0.10 * u);                   // 根细、末更细
              L.push({ x: tx - tw / 2, y: ty, w: tw, h: H * 0.018, rgb: TENT });
            }
          }
        }
        return L;
      }
      function keyLayers(p) {                                    // 金色钥匙剪影(纯 fillRect 派生暖金;圆头带孔+杆+齿+暗金描边,lo-fi 同墙纹理风格)
        var cx = p.screenX, cy = p.y0 + p.h / 2, s = p.h, L = [];
        var GOLD = [240, 202, 92], BRIGHT = [255, 236, 158], EDGE = [128, 96, 32], HOLE = [34, 26, 14];
        var bcy = cy - s * 0.26, bw = s * 0.40;                                                       // bow 圆头:中心 + 最大宽
        L.push({ x: cx - bw * 0.5 - s * 0.03, y: bcy - bw * 0.5 - s * 0.03, w: bw + s * 0.06, h: bw + s * 0.06, rgb: EDGE });   // 圆头暗金描边(衬底=发光感,非大块)
        L.push({ x: cx - bw * 0.30, y: bcy - bw * 0.50, w: bw * 0.60, h: bw * 0.16, rgb: GOLD });     // 圆头三段近似圆:上窄
        L.push({ x: cx - bw * 0.50, y: bcy - bw * 0.34, w: bw, h: bw * 0.68, rgb: GOLD });            //   中宽
        L.push({ x: cx - bw * 0.30, y: bcy + bw * 0.34, w: bw * 0.60, h: bw * 0.16, rgb: GOLD });     //   下窄
        L.push({ x: cx - bw * 0.18, y: bcy - bw * 0.20, w: bw * 0.36, h: bw * 0.40, rgb: HOLE });     // 中孔(暗)
        L.push({ x: cx - bw * 0.42, y: bcy - bw * 0.28, w: bw * 0.18, h: bw * 0.30, rgb: BRIGHT });   // 左上弧高光
        var stop = bcy + bw * 0.50, sw = s * 0.13, sh = s * 0.42;                                     // 杆 shaft
        L.push({ x: cx - sw * 0.5 - s * 0.02, y: stop, w: sw + s * 0.04, h: sh, rgb: EDGE });         // 杆描边
        L.push({ x: cx - sw * 0.5, y: stop, w: sw, h: sh, rgb: GOLD });
        L.push({ x: cx - sw * 0.5, y: stop, w: sw * 0.34, h: sh, rgb: BRIGHT });                      // 杆左缘高光
        L.push({ x: cx + sw * 0.5, y: stop + sh * 0.55, w: s * 0.16, h: s * 0.075, rgb: GOLD });      // 齿 1(右侧)
        L.push({ x: cx + sw * 0.5, y: stop + sh * 0.78, w: s * 0.10, h: s * 0.075, rgb: GOLD });      // 齿 2
        return L;
      }
      function artLayers(p) {                                    // 自定义怪外观:已校验的字符网格(p.sp.art/artCols/artRows/artPal,startMaze 解析)→ 和内置一样的 {x,y,w,h,rgb} 层
        var art = p.sp.art, cols = p.sp.artCols, rows = p.sp.artRows, pal = p.sp.artPal;
        var ch = p.h / rows, cw = ch;                            // 方像素(保网格宽高比;不被 billboard 方框拉伸,同 PoC 验过的手感)
        var x0 = p.screenX - cols * cw / 2, y0 = p.y0, L = [], r, c;
        for (r = 0; r < rows; r++) {
          var row = art[r];
          for (c = 0; c < cols;) {
            var k = row[c];
            if (k === '.' || k === ' ') { c++; continue; }       // 透明:不画(墙/雾透过)
            var run = 1; while (c + run < cols && row[c + run] === k) run++;   // 行内同色 run → 一个 rect(控 rect 数)
            L.push({ x: x0 + c * cw, y: y0 + r * ch, w: run * cw + 0.5, h: ch + 0.5, rgb: pal[k] });   // +0.5 补亚像素缝
            c += run;
          }
        }
        return L;
      }
      function stonePillarLayers(p) {                             // 程序化石柱(Minecraft 式方柱):前亮面 + 右暗侧面=立方体厚度错觉、横向砌块缝、顶帽底座;纯 fillRect、确定性、headless 安全。
        var wb = T.wallBase;   // 程序化石柱默认跟随主题墙基色(审计⑤:石柱不再恒灰、跨主题协调);styled 柱(crystal/wood/metal/obelisk)保留自身身份色。无 wallBase(中性主题)→ 原石色逐字节不变。
        function mk(base) { if (!wb) return base; var bl = (base[0] + base[1] + base[2]) / 3, wl = ((wb[0] + wb[1] + wb[2]) / 3) || 1, k = bl / wl, t = 0.55; return [Math.min(255, Math.round(base[0] * (1 - t) + wb[0] * k * t)), Math.min(255, Math.round(base[1] * (1 - t) + wb[1] * k * t)), Math.min(255, Math.round(base[2] * (1 - t) + wb[2] * k * t))]; }   // 各层保亮度、色相向 wallBase 拉 55%(wallBase 先缩到该层亮度→不破立方体 3D 明暗)
        var FRONT = mk([150, 144, 136]), SIDE = mk([101, 96, 90]), TOP = mk([184, 178, 170]), SEAM = mk([66, 62, 58]), CAP = mk([168, 162, 154]), BASE = mk([120, 114, 107]);
        var cx = p.screenX, y0 = p.y0, h = p.h, w = p.w, L = [], i;
        var capH = Math.max(2, h * 0.07), baseH = Math.max(2, h * 0.06);
        var bodyTop = y0 + capH, bodyH = h - capH - baseH;
        var lx = cx - w * 0.5, frontW = w * 0.72, sideX = lx + frontW, sideW = w - frontW;
        L.push({ x: cx - w * 0.58, y: y0, w: w * 1.16, h: capH, rgb: CAP });
        L.push({ x: cx - w * 0.58, y: y0, w: w * 1.16, h: Math.max(1, capH * 0.45), rgb: TOP });
        L.push({ x: lx, y: bodyTop, w: frontW, h: bodyH, rgb: FRONT });
        L.push({ x: sideX, y: bodyTop, w: sideW, h: bodyH, rgb: SIDE });
        L.push({ x: sideX, y: bodyTop, w: Math.max(1, w * 0.03), h: bodyH, rgb: SEAM });
        var seams = Math.max(3, Math.round(bodyH / (h * 0.2)));
        for (i = 1; i < seams; i++) L.push({ x: lx, y: bodyTop + bodyH * i / seams, w: w, h: Math.max(1, h * 0.014), rgb: SEAM });
        L.push({ x: cx - w * 0.62, y: y0 + h - baseH, w: w * 1.24, h: baseH, rgb: BASE });
        L.push({ x: cx - w * 0.62, y: y0 + h - Math.max(1, baseH * 0.3), w: w * 1.24, h: Math.max(1, baseH * 0.3), rgb: SEAM });
        var contactH = Math.max(1, h * 0.018), footY = (p.floorY || (y0 + h)) - contactH;
        L.push({ x: cx - w * 0.54, y: footY, w: w * 1.08, h: contactH, rgb: [70, 62, 52] });
        return L;
      }
      function ruinedPillarLayers(p) {                             // 破损石柱:保留落地体块,但用错位断块/裂缝/缺口读成遗迹残柱。
        var L = stonePillarLayers(p), cx = p.screenX, y0 = p.y0, h = p.h, w = p.w, i, rng = mulberry32(hashStr('pillarRuined' + (p.sp.idx || 0)));
        for (i = 0; i < 5; i++) L.push({ x: cx - w * (0.42 - rng() * 0.08), y: y0 + h * (0.18 + rng() * 0.58), w: Math.max(1, w * (0.08 + rng() * 0.06)), h: Math.max(2, h * (0.035 + rng() * 0.035)), rgb: [54, 50, 48] });
        L.push({ x: cx - w * 0.58, y: y0 + h * 0.06, w: w * 0.38, h: h * 0.08, rgb: [44, 40, 38] });   // 顶部缺口
        L.push({ x: cx + w * 0.20, y: y0 + h * 0.74, w: w * 0.33, h: h * 0.05, rgb: [190, 182, 166] });  // 断面亮边
        return L;
      }
      function obeliskPillarLayers(p) {                            // 方尖碑:细高、收尖、刻线;仍用矩形阶梯近似斜边,不引 path/gradient。
        var cx = p.screenX, y0 = p.y0, h = p.h, w = p.w, L = [], i, seg = 8;
        for (i = 0; i < seg; i++) { var t0 = i / seg, t1 = (i + 1) / seg, ww = w * (0.34 + 0.36 * t1), yy = y0 + h * t0, hh = h / seg + 1; L.push({ x: cx - ww * 0.52, y: yy, w: ww * 0.68, h: hh, rgb: [116, 106, 126] }); L.push({ x: cx + ww * 0.16, y: yy, w: ww * 0.28, h: hh, rgb: [72, 64, 84] }); }
        L.push({ x: cx - w * 0.52, y: y0 + h * 0.86, w: w * 1.04, h: h * 0.10, rgb: [88, 80, 92] });
        L.push({ x: cx - w * 0.07, y: y0 + h * 0.22, w: Math.max(1, w * 0.035), h: h * 0.48, rgb: [190, 172, 132] });
        L.push({ x: cx - w * 0.22, y: y0 + h * 0.38, w: w * 0.44, h: Math.max(1, h * 0.018), rgb: [190, 172, 132] });
        L.push({ x: cx - w * 0.44, y: (p.floorY || (y0 + h)) - Math.max(1, h * 0.018), w: w * 0.88, h: Math.max(1, h * 0.018), rgb: [48, 42, 50] });
        return L;
      }
      function crystalPillarLayers(p) {                            // 晶体柱:多面切割 + 冷色高光;比石柱更窄,适合冰窟/魔法地标。
        var cx = p.screenX, y0 = p.y0, h = p.h, w = p.w, L = [], i, seg = 9;
        for (i = 0; i < seg; i++) { var t = i / seg, ww = w * (0.42 + 0.22 * Math.sin(t * Math.PI)); L.push({ x: cx - ww * 0.52, y: y0 + h * t, w: ww * 0.46, h: h / seg + 1, rgb: [92, 142, 190] }); L.push({ x: cx - ww * 0.06, y: y0 + h * t, w: ww * 0.38, h: h / seg + 1, rgb: [152, 218, 236] }); L.push({ x: cx + ww * 0.32, y: y0 + h * t, w: ww * 0.22, h: h / seg + 1, rgb: [55, 92, 142] }); }
        L.push({ x: cx - w * 0.08, y: y0 + h * 0.08, w: Math.max(1, w * 0.055), h: h * 0.70, rgb: [222, 250, 255] });
        L.push({ x: cx - w * 0.50, y: (p.floorY || (y0 + h)) - Math.max(1, h * 0.018), w: w, h: Math.max(1, h * 0.018), rgb: [32, 46, 70] });
        return L;
      }
      function woodPillarLayers(p) {                               // 木柱:暖棕主干 + 竖向木纹 + 金属/绳束带;适合 shoji/旧宅。
        var cx = p.screenX, y0 = p.y0, h = p.h, w = p.w, L = [], i;
        L.push({ x: cx - w * 0.42, y: y0 + h * 0.03, w: w * 0.62, h: h * 0.90, rgb: [118, 78, 45] });
        L.push({ x: cx + w * 0.20, y: y0 + h * 0.03, w: w * 0.20, h: h * 0.90, rgb: [70, 44, 28] });
        for (i = 0; i < 4; i++) L.push({ x: cx - w * (0.32 - i * 0.16), y: y0 + h * 0.07, w: Math.max(1, w * 0.025), h: h * 0.78, rgb: i % 2 ? [156, 104, 60] : [74, 48, 30] });
        for (i = 0; i < 3; i++) L.push({ x: cx - w * 0.50, y: y0 + h * (0.22 + i * 0.24), w: w, h: Math.max(1, h * 0.035), rgb: [52, 44, 36] });
        L.push({ x: cx - w * 0.50, y: (p.floorY || (y0 + h)) - Math.max(1, h * 0.018), w: w, h: Math.max(1, h * 0.018), rgb: [38, 28, 20] });
        return L;
      }
      function metalPillarLayers(p) {                              // 金属/设施柱:冷灰面板 + 横向箍环 + 蓝色状态条;适合 station/metal。
        var cx = p.screenX, y0 = p.y0, h = p.h, w = p.w, L = [], i;
        L.push({ x: cx - w * 0.48, y: y0 + h * 0.04, w: w * 0.70, h: h * 0.88, rgb: [112, 122, 132] });
        L.push({ x: cx + w * 0.22, y: y0 + h * 0.04, w: w * 0.24, h: h * 0.88, rgb: [58, 66, 76] });
        for (i = 0; i < 5; i++) L.push({ x: cx - w * 0.56, y: y0 + h * (0.12 + i * 0.16), w: w * 1.12, h: Math.max(1, h * 0.025), rgb: [42, 48, 56] });
        L.push({ x: cx - w * 0.30, y: y0 + h * 0.28, w: w * 0.10, h: h * 0.42, rgb: [96, 210, 230] });
        L.push({ x: cx - w * 0.45, y: y0 + h * 0.90, w: w * 0.90, h: h * 0.07, rgb: [72, 78, 84] });
        L.push({ x: cx - w * 0.52, y: (p.floorY || (y0 + h)) - Math.max(1, h * 0.018), w: w * 1.04, h: Math.max(1, h * 0.018), rgb: [24, 28, 34] });
        return L;
      }
      function pillarLayers(p) {
        var style = (p.sp && p.sp.pillarStyle) || 'stone';
        if (style === 'ruined') return ruinedPillarLayers(p);
        if (style === 'obelisk') return obeliskPillarLayers(p);
        if (style === 'crystal') return crystalPillarLayers(p);
        if (style === 'wood') return woodPillarLayers(p);
        if (style === 'metal') return metalPillarLayers(p);
        return stonePillarLayers(p);
      }
      // ── 机关/陷阱贴地形态(画在机关格脚下的地板上、透视压扁=贴地不悬空)──
      //   端用户反馈+调研结论:可拾取物是独立 token;压力板/陷阱/传送阵是地面结构。这里按 markerKind 分三类图案:
      //   set/plate=嵌入式踏板(宽扁板+边框+内阴影); warp=符文环; turn=罗盘/方向盘; trap=危险裂缝/尖齿。颜色只是辅助手段,形态才是主语义。
      //   ⚠️ 边界:这是小型 marker 近似,中心列 z-test=被墙挡整盘不画;不是通用 floor-decal API,不承诺大面积地毯/血泊级遮挡。
      function drawFloorMarker(p, tint, ffog, zbuf) {
        var depth = p.depth, cx = p.screenX, cxi = Math.max(0, Math.min(CW - 1, Math.round(cx)));
        if (zbuf[cxi] !== undefined && depth >= zbuf[cxi]) return;
        var floorY = floorYAtDepth(depth), kind = p.sp.markerKind || 'marker';
        var rw = Math.max(6, p.w * (kind === 'trap' ? 1.18 : 1.08)), rh = rw * (kind === 'set' || kind === 'plate' ? 0.30 : 0.36);
        var phase = (hashStr((p.sp.idx || 0) + '_glow') % 628) / 100;
        var puls = reducedMotion ? 1 : (0.66 + 0.34 * Math.sin(g.tw * (kind === 'trap' ? 3.0 : 2.1) + phase));
        var bright = [Math.min(255, tint[0] + 70), Math.min(255, tint[1] + 70), Math.min(255, tint[2] + 70)];
        var dark = [Math.max(0, tint[0] * 0.38), Math.max(0, tint[1] * 0.38), Math.max(0, tint[2] * 0.38)];
        var ey, t, rowW, yy, rgb, a, ringT, top = Math.ceil(rh);
        for (ey = -top; ey <= top; ey++) {
          t = ey / rh; if (t < -1 || t > 1) continue;
          rowW = rw * Math.sqrt(1 - t * t);
          yy = Math.round(floorY + ey); if (yy < 0 || yy >= CH) continue;
          ringT = Math.abs(t);
          if (kind === 'set' || kind === 'plate') {
            rgb = ringT > 0.70 ? bright : (ringT < 0.26 ? dark : tint);
            a = (ringT > 0.70 ? 0.36 : 0.20) * puls * ffog;
          } else if (kind === 'trap') {
            rgb = ringT > 0.58 ? bright : dark;
            a = (ringT > 0.58 ? 0.40 : 0.28) * puls * ffog;
          } else {
            rgb = ringT > 0.62 ? bright : tint;
            a = 0.32 * puls * ffog * (0.45 + 0.55 * ringT);
          }
          ctx.fillStyle = 'rgba(' + Math.round(rgb[0]) + ',' + Math.round(rgb[1]) + ',' + Math.round(rgb[2]) + ',' + a.toFixed(3) + ')';
          ctx.fillRect(Math.round(cx - rowW), yy, Math.max(1, Math.round(rowW * 2)), 1);
        }
        if (kind === 'turn') {
          ctx.fillStyle = 'rgba(' + bright.map(Math.round).join(',') + ',' + (0.42 * puls * ffog).toFixed(3) + ')';
          ctx.fillRect(Math.round(cx - rw * 0.08), Math.round(floorY - rh * 0.84), Math.max(1, Math.round(rw * 0.16)), Math.max(1, Math.round(rh * 1.68)));
          ctx.fillRect(Math.round(cx - rw * 0.54), Math.round(floorY - 1), Math.max(1, Math.round(rw * 1.08)), 2);
        } else if (kind === 'warp') {
          ctx.fillStyle = 'rgba(' + bright.map(Math.round).join(',') + ',' + (0.34 * puls * ffog).toFixed(3) + ')';
          ctx.fillRect(Math.round(cx - rw * 0.50), Math.round(floorY - rh * 0.10), Math.max(1, Math.round(rw)), 1);
          ctx.fillRect(Math.round(cx - rw * 0.32), Math.round(floorY + rh * 0.18), Math.max(1, Math.round(rw * 0.64)), 1);
        } else if (kind === 'trap') {
          ctx.fillStyle = 'rgba(' + bright.map(Math.round).join(',') + ',' + (0.46 * puls * ffog).toFixed(3) + ')';
          for (var i = -2; i <= 2; i++) ctx.fillRect(Math.round(cx + i * rw * 0.20 - rw * 0.04), Math.round(floorY - rh * (0.18 + (i & 1) * 0.18)), Math.max(1, Math.round(rw * 0.08)), Math.max(1, Math.round(rh * 0.50)));
        } else if (kind === 'set' || kind === 'plate') {
          ctx.fillStyle = 'rgba(' + dark.map(Math.round).join(',') + ',' + (0.32 * ffog).toFixed(3) + ')';
          ctx.fillRect(Math.round(cx - rw * 0.58), Math.round(floorY), Math.max(1, Math.round(rw * 1.16)), 1);
        }
      }
      function drawFloorClutter(p, zbuf, ffog) {                       // 主题自动 decor:贴地小物件族,不是可拾取 token、也不是发光机关 marker。
        var depth = p.depth, cx = p.screenX, cxi = Math.max(0, Math.min(CW - 1, Math.round(cx)));
        if (zbuf[cxi] !== undefined && depth >= zbuf[cxi]) return;
        var floorY = p.floorY || floorYAtDepth(depth), tint = p.sp.decorTint || [120, 110, 95], family = p.sp.decorFamily || floorDecorFamily(p.sp.decorIcon || '', theme);
        var dcx = Math.floor(p.sp.sx), dcy = Math.floor(p.sp.sy);   // seed 按世界格坐标(非顺序 idx):编辑/重排/插入 decor 不再让既有 decor 外观整体漂移(与墙稳定 seed 一致、审计⑥)
        var seed = hashStr('clutter' + family + '_' + (p.sp.decorIcon || '') + '_' + dcx + '_' + dcy), rng = mulberry32(seed);
        var rw = Math.max(7, p.w), rh = Math.max(2, p.h), fogK = 0.72 + Math.max(0.24, Math.min(0.46, ffog || 0.34)) * 0.55;
        function color(rgb, k) { return 'rgb(' + Math.round(Math.min(255, rgb[0] * k * fogK)) + ',' + Math.round(Math.min(255, rgb[1] * k * fogK)) + ',' + Math.round(Math.min(255, rgb[2] * k * fogK)) + ')'; }
        function rr(dx, dy, ww, hh, rgb, k) {
          var x = Math.round(cx + dx), y = Math.round(floorY + dy), w = Math.max(1, Math.round(ww)), h = Math.max(1, Math.round(hh));
          if (y < 0 || y >= CH) return;
          ctx.fillStyle = color(rgb || tint, k == null ? 0.62 : k); ctx.fillRect(x, y, w, h);
        }
        var i, ox, oy, w, h, c;
        if (family === 'bone_shards') {                              // 骨片:几条骨白细条 + 暗断口,低矮但比随机小石头有方向性。
          c = [218, 210, 188];
          for (i = 0; i < 4; i++) { ox = (rng() - 0.55) * rw * 0.75; oy = -rh * (0.30 + rng() * 0.34); w = rw * (0.22 + rng() * 0.18); h = Math.max(1, rh * 0.16); rr(ox, oy, w, h, c, 0.86); rr(ox + w * 0.78, oy + h, w * 0.20, 1, [70, 62, 52], 0.50); }
        } else if (family === 'paper_scrap') {                       // 破纸/卷轴:浅色纸片 + 细墨线,不发光不 bob。
          c = [224, 210, 166];
          for (i = 0; i < 2; i++) { ox = (i ? 0.08 : -0.42) * rw + (rng() - 0.5) * rw * 0.12; oy = -rh * (0.52 - i * 0.18); w = rw * (0.34 + rng() * 0.10); h = Math.max(2, rh * (0.34 + rng() * 0.10)); rr(ox, oy, w, h, c, 0.82); rr(ox + w * 0.14, oy + h * 0.35, w * 0.64, 1, [120, 92, 60], 0.48); rr(ox + w * 0.18, oy + h * 0.62, w * 0.46, 1, [120, 92, 60], 0.43); }
        } else if (family === 'wood_splinters') {                    // 木屑/断木片:棕色细长碎片,服务 shoji/破屋,低矮不竖成道具。
          c = [138, 92, 52];
          for (i = 0; i < 6; i++) { ox = (rng() - 0.55) * rw * 0.80; oy = -rh * (0.18 + rng() * 0.46); w = rw * (0.18 + rng() * 0.22); h = Math.max(1, rh * (0.10 + rng() * 0.12)); rr(ox, oy, w, h, c, 0.62 + rng() * 0.18); if (i < 3) rr(ox, oy, w * 0.70, 1, [212, 156, 86], 0.46); }
        } else if (family === 'cloth_rags') {                        // 破布/绷带:低饱和布片 + 污迹,区分纸片的规整矩形。
          c = [166, 148, 124];
          for (i = 0; i < 3; i++) { ox = (rng() - 0.55) * rw * 0.70; oy = -rh * (0.26 + rng() * 0.38); w = rw * (0.24 + rng() * 0.22); h = Math.max(2, rh * (0.18 + rng() * 0.16)); rr(ox, oy, w, h, c, 0.58 + rng() * 0.18); rr(ox + w * 0.18, oy + h * 0.55, w * 0.55, 1, [82, 58, 48], 0.44); }
        } else if (family === 'ash_pile') {                          // 灰烬/烧痕:暗灰扁斑 + 少量暖炭点,火把地牢可读但不发光成机关。
          c = [64, 60, 56];
          for (i = 0; i < 7; i++) { ox = (rng() - 0.55) * rw * 0.76; oy = -rh * (0.12 + rng() * 0.44); rr(ox, oy, rw * (0.12 + rng() * 0.20), Math.max(1, rh * (0.12 + rng() * 0.12)), c, 0.48 + rng() * 0.18); }
          rr(-rw * 0.18, -rh * 0.24, rw * 0.10, 1, [194, 82, 42], 0.54); rr(rw * 0.12, -rh * 0.36, rw * 0.08, 1, [218, 118, 54], 0.42);
        } else if (family === 'ritual_marks') {                      // 仪式残痕:低亮粉笔/血符短线,贴地背景痕迹;不用 rgba 光盘,避免混成功能 marker/plate/trap。
          c = theme === 'flesh' ? [150, 42, 52] : [172, 132, 86];
          for (i = 0; i < 5; i++) { ox = (rng() - 0.55) * rw * 0.72; oy = -rh * (0.18 + rng() * 0.42); w = rw * (0.14 + rng() * 0.20); rr(ox, oy, w, 1, c, 0.54 + rng() * 0.16); if (i < 3) rr(ox + w * 0.45, oy - rh * 0.10, 1, Math.max(1, rh * (0.16 + rng() * 0.10)), c, 0.46 + rng() * 0.12); }
          rr(-rw * 0.20, -rh * 0.32, rw * 0.42, 1, [92, 44, 36], 0.44);
        } else if (family === 'cable_coil') {                        // 电缆/断线:几段暗线 + 彩色接头,科技主题一眼不同于碎石。
          c = [42, 48, 56];
          for (i = 0; i < 4; i++) { ox = -rw * 0.42 + i * rw * 0.22 + (rng() - 0.5) * rw * 0.05; oy = -rh * (0.58 - (i % 2) * 0.18); rr(ox, oy, rw * 0.18, Math.max(1, rh * 0.18), c, 0.82); }
          rr(-rw * 0.34, -rh * 0.36, rw * 0.18, Math.max(1, rh * 0.22), [70, 170, 210], 0.76); rr(rw * 0.18, -rh * 0.50, rw * 0.14, Math.max(1, rh * 0.20), [210, 150, 40], 0.72);
        } else if (family === 'rust_scraps') {                       // 锈片/螺栓:冷灰小条 + 橙锈点,比 cables 更像废金属碎屑。
          c = [82, 88, 92];
          for (i = 0; i < 5; i++) { ox = (rng() - 0.55) * rw * 0.78; oy = -rh * (0.18 + rng() * 0.48); rr(ox, oy, rw * (0.10 + rng() * 0.18), Math.max(1, rh * (0.16 + rng() * 0.14)), c, 0.58 + rng() * 0.18); }
          rr(-rw * 0.25, -rh * 0.34, rw * 0.12, 1, [190, 92, 36], 0.58); rr(rw * 0.16, -rh * 0.22, rw * 0.10, 1, [154, 70, 34], 0.52);
        } else if (family === 'moss_patch') {                        // 苔藓/潮湿斑:横向簇状绿斑,贴在地表不抢功能物。
          c = [66, 108, 55];
          for (i = 0; i < 6; i++) { ox = (rng() - 0.55) * rw * 0.82; oy = -rh * (0.18 + rng() * 0.45); rr(ox, oy, rw * (0.16 + rng() * 0.18), Math.max(1, rh * (0.16 + rng() * 0.16)), c, 0.60 + rng() * 0.18); }
        } else if (family === 'flesh_nodule') {                      // 肉瘤/血肉结节:暗红扁圆块 + 细脉络,和 trap 的亮裂缝区分。
          c = [116, 38, 44];
          for (i = 0; i < 4; i++) { ox = (rng() - 0.55) * rw * 0.62; oy = -rh * (0.35 + rng() * 0.28); rr(ox, oy, rw * (0.18 + rng() * 0.20), rh * (0.24 + rng() * 0.20), c, 0.62 + rng() * 0.16); }
          rr(-rw * 0.34, -rh * 0.22, rw * 0.64, 1, [70, 12, 18], 0.58); rr(rw * 0.08, -rh * 0.48, rw * 0.30, 1, [170, 72, 76], 0.52);
        } else if (family === 'bio_film') {                          // 黏液膜/湿痕:扁平暗红/暗绿光泽,贴地不凸起,补 flesh/cave 的湿润感。
          c = theme === 'flesh' ? [92, 18, 30] : [54, 86, 58];
          for (i = 0; i < 6; i++) { ox = (rng() - 0.55) * rw * 0.86; oy = -rh * (0.10 + rng() * 0.34); rr(ox, oy, rw * (0.16 + rng() * 0.24), Math.max(1, rh * (0.10 + rng() * 0.10)), c, 0.46 + rng() * 0.14); }
          rr(-rw * 0.28, -rh * 0.28, rw * 0.54, 1, theme === 'flesh' ? [210, 82, 92] : [132, 170, 112], 0.42);
        } else if (family === 'crystal_cluster') {                   // 低矮晶簇:短尖片,不做可拾取水晶那种高 token。
          c = [150, 120, 225];
          for (i = 0; i < 5; i++) { ox = -rw * 0.34 + i * rw * 0.16 + (rng() - 0.5) * rw * 0.06; h = rh * (0.42 + rng() * 0.55); rr(ox, -h, rw * 0.08, h, c, 0.82); rr(ox + rw * 0.02, -h, rw * 0.05, h * 0.42, [225, 205, 255], 0.76); }
        } else if (family === 'ice_chips') {                         // 冰屑/霜片:冷蓝短斜片 + 微高光,比晶簇更低更碎。
          c = [178, 218, 232];
          for (i = 0; i < 6; i++) { ox = (rng() - 0.55) * rw * 0.78; oy = -rh * (0.18 + rng() * 0.44); rr(ox, oy, rw * (0.08 + rng() * 0.10), Math.max(1, rh * (0.18 + rng() * 0.16)), c, 0.72 + rng() * 0.18); if (i < 3) rr(ox + rw * 0.02, oy, rw * 0.06, 1, [230, 250, 255], 0.62); }
        } else if (family === 'glass_shards') {                      // 玻璃/药瓶碎片:淡青短斜片 + 暗瓶影。
          c = [168, 202, 205];
          for (i = 0; i < 5; i++) { ox = (rng() - 0.55) * rw * 0.78; oy = -rh * (0.22 + rng() * 0.42); rr(ox, oy, rw * (0.08 + rng() * 0.12), Math.max(1, rh * (0.20 + rng() * 0.20)), c, 0.74 + rng() * 0.18); }
          rr(-rw * 0.18, -rh * 0.30, rw * 0.22, 1, [82, 96, 94], 0.55);
        } else {                                                     // rubble 默认:碎砖/石屑,比旧随机小石头多边缘和分组,但仍是背景环境痕迹。
          c = tint;
          for (i = 0; i < 6; i++) { ox = (rng() - 0.58) * rw * 0.82; oy = -rh * (0.16 + rng() * 0.58); w = rw * (0.12 + rng() * 0.18); h = rh * (0.18 + rng() * 0.22); rr(ox, oy, w, h, c, 0.48 + rng() * 0.22); if (i < 3) rr(ox, oy, w * 0.75, 1, [190, 175, 145], 0.42); }
        }
      }
      function drawFloorPickup(p, zbuf, ffog) {                    // 嵌入式地面拾取物:比 decor 更有边框/高光,但不竖起、不呼吸发光=隐藏普通物。
        var depth = p.depth, cx = p.screenX, cxi = Math.max(0, Math.min(CW - 1, Math.round(cx)));
        if (zbuf[cxi] !== undefined && depth >= zbuf[cxi]) return;
        var floorY = p.floorY || floorYAtDepth(depth), tint = glyphTint(p.sp.artPal) || [184, 148, 86], family = p.sp.decorFamily || floorDecorFamily(p.sp.decorIcon || '', theme);
        var rw = Math.max(7, p.w), rh = Math.max(2, p.h), fogK = Math.max(0.36, Math.min(0.62, ffog || 0.42));
        function fill(dx, dy, ww, hh, rgb, a) { var x = Math.round(cx + dx), y = Math.round(floorY + dy), w = Math.max(1, Math.round(ww)), h = Math.max(1, Math.round(hh)); if (y < 0 || y >= CH) return; ctx.fillStyle = 'rgba(' + Math.round(rgb[0] * fogK) + ',' + Math.round(rgb[1] * fogK) + ',' + Math.round(rgb[2] * fogK) + ',' + a.toFixed(3) + ')'; ctx.fillRect(x, y, w, h); }
        var seed = hashStr('floorPickup' + family + '_' + (p.sp.idx || 0)), rng = mulberry32(seed), i, ox, oy;
        fill(-rw * 0.46, -rh * 0.55, rw * 0.92, rh * 0.26, [32, 28, 24], 0.24);   // 浅槽阴影:嵌在地表,不是漂浮 token
        fill(-rw * 0.40, -rh * 0.62, rw * 0.80, 1, tint, 0.44); fill(-rw * 0.36, -rh * 0.18, rw * 0.72, 1, tint, 0.30);   // 边框/高光=可发现
        for (i = 0; i < 4; i++) { ox = (rng() - 0.55) * rw * 0.58; oy = -rh * (0.25 + rng() * 0.34); fill(ox, oy, rw * (0.10 + rng() * 0.16), Math.max(1, rh * (0.12 + rng() * 0.10)), tint, 0.34 + rng() * 0.16); }
        fill(-rw * 0.12, -rh * 0.42, rw * 0.26, 1, [235, 218, 154], 0.28);   // 低调闪边:提示“可拿”,但不抢钥匙/机关。
      }
      function drawSprites(zbuf) {                               // 墙画完后叠加;逐列 z-test(精灵比该列墙近才画 → 墙遮挡精灵)
        if (!g.monsters.length && !(g.items && g.items.length) && !evList.length && !(g.pillars && g.pillars.length) && !(g.decors && g.decors.length)) return;
        var list = [], s, m, pr;
        for (s = 0; s < g.monsters.length; s++) { m = g.monsters[s]; if (!m.active || m.fadeAlpha <= 0) continue; pr = projectSprite(m); if (pr) list.push(pr); }
        if (g.items) for (s = 0; s < g.items.length; s++) { var it = g.items[s]; if (it.taken) continue; pr = projectSprite(it); if (pr) list.push(pr); }   // 钥匙精灵(同 z-buffer 逐列遮挡)
        for (s = 0; s < evList.length; s++) { var es = evList[s]._sprite; if (!es || es.taken || es.isWallPickup) continue; pr = projectSprite(es); if (pr) list.push(pr); }   // 坐标事件可见精灵(art;once 触发后 taken=true 消失=被"拾取");wall-pickup 随墙面 pass 画
        if (g.pillars) for (s = 0; s < g.pillars.length; s++) { pr = projectSprite(g.pillars[s]); if (pr) list.push(pr); }   // 柱子地标(落地锚定、永不 taken、不参与追逐/拾取)
        if (g.decors) for (s = 0; s < g.decors.length; s++) { pr = projectSprite(g.decors[s]); if (pr) list.push(pr); }   // 主题装饰物(中景比例尺;纯视觉、不挡路)
        list.sort(function (a, b) { return b.depth - a.depth; });   // 远→近(画家序兜底,z-buffer 主导遮挡)
        for (var k = 0; k < list.length; k++) {
          var p = list[k], lunge = (p.sp === g.lunge);
          var ffog = faceFog(p.depth);
          if (p.sp.isKey || (p.sp.isItem && !p.sp.isFloorPickup && !p.sp.isWallPickup)) ffog = Math.max(0.5, ffog);   // floor 物品(钥匙/事件道具)可见性下限(Doom fullbright 惯例):远处也辨得清;嵌入式隐藏物保持低调
          if (p.sp.isDecor) ffog = Math.min(0.42, Math.max(0.28, ffog)); // decor 是氛围/比例尺,亮度低于钥匙/机关/柱子,不抢功能物
          if (p.sp.isPillar) ffog = Math.max(0.45, ffog);              // 柱子地标可见性下限(远处仍辨得清地标,比道具略低=柱子是背景不用全亮)
          if (p.sp.isMarker) {   // ── 机关 = 贴地发光光盘(画在机关格脚下的地板、透视压扁;不立牌)──形态区别于可拾取立牌:踏板/符文阵/旋转地砖是地面的东西、不该悬空(端用户反馈);颜色区分类型。
            drawFloorMarker(p, glyphTint(p.sp.artPal) || [220, 200, 120], ffog, zbuf);
            continue;   // 机关只画贴地光盘、不画立牌精灵(与宝石/钥匙立牌形态分明)
          }
          if (p.sp.isFloorPickup) {
            drawFloorPickup(p, zbuf, ffog);
            continue;   // 嵌入式隐藏拾取物:可拿,但读法低调贴地;不共享 marker 呼吸光盘或 pickup 立牌
          }
          if (p.sp.isDecor && p.sp.decorMode !== 'sprite') {
            drawFloorClutter(p, zbuf, ffog);
            continue;   // 自动 decor 是贴地小物件族/环境痕迹,不走钥匙/道具竖牌路径
          }
          if ((p.sp.isKey || (p.sp.isItem && !p.sp.isMarker && !p.sp.isDecor && !p.sp.isFloorPickup && !p.sp.isWallPickup)) && p.floorY != null) {   // pickup 接触阴影:独立 token 仍保持“能拿”高可见性,但脚点压在地面上,不再像 UI 图标漂浮
            var shC = Math.max(0, Math.min(CW - 1, Math.round(p.screenX)));
            if (zbuf[shC] === undefined || p.depth < zbuf[shC]) {        // 阴影也要守 z-buffer;否则物品主体被墙逐列遮住时,脚下阴影会穿墙漏出
              var shW = Math.max(2, p.w * 0.62), shH = Math.max(1, p.h * 0.035), shA = (0.24 * ffog).toFixed(3);
              ctx.fillStyle = 'rgba(0,0,0,' + shA + ')';
              ctx.fillRect(Math.round(p.screenX - shW / 2), Math.round(p.floorY - shH * 0.45), Math.max(1, Math.round(shW)), Math.max(1, Math.round(shH)));
            }
          }
          var layers;
          if (p.sp.isPillar) {
            layers = p.sp.art ? artLayers(p) : pillarLayers(p);        // 柱子:自定义外观 or 内置程序化柱(厚重石柱感,不用 keyLayers/faceLayers)
          } else if (p.sp.isDecor && p.sp.decorMode === 'sprite') {
            layers = p.sp.art ? artLayers(p) : keyLayers(p);           // 显式 sprite decor 是作者逃生口:可竖牌,但仍不用 isItem/fullbright 语义
          } else {
            layers = (p.sp.isKey || (p.sp.isItem && !p.sp.isFloorPickup && !p.sp.isWallPickup)) ? (p.sp.art ? artLayers(p) : keyLayers(p)) : (p.sp.art ? artLayers(p) : (p.sp.body ? bodyLayers(p, p.sp.body) : faceLayers(p)));   // 钥匙/事件道具带 art → 自定义外观;否则金钥匙(§11.7 地板)
          }
          var fog = lunge ? 1 : ffog * (p.sp.fadeAlpha != null ? p.sp.fadeAlpha : 1);   // 突脸:满亮清晰
          for (var Li = 0; Li < layers.length; Li++) {
            var ly = layers[Li], lx0 = Math.max(0, Math.floor(ly.x)), lx1 = Math.min(CW - 1, Math.floor(ly.x + ly.w) - 1);
            var ry = Math.floor(ly.y), rh = Math.max(1, Math.ceil(ly.h));
            ctx.fillStyle = fogColor(ly.rgb, fog);
            for (var col = lx0; col <= lx1; col++) { if (lunge || zbuf[col] === undefined || p.depth < zbuf[col]) ctx.fillRect(col, ry, 1, rh); }   // 突脸不被墙遮挡=全脸揭示
          }
        }
      }

      function render() {
        // 天花/地板:逐行透视雾(lodev floor-cast 行距 rowDist = camH·CH/|y−horizon|,近亮远暗;只用 fillRect、headless 不崩)。
        //   天花在底雾上叠加 **world-space 网格缝**(梁/嵌缝):每行用 lodev 相机平面恢复世界坐标 (wx,wy),跨整数世界格边处画暗缝。
        //   随玩家位移(g.px/g.py)+转向(g.a)正确移动 = 真实顶面 → 一点透视收敛到地平线 = 「虚假高度」纵深(重返德军总部式、仍伪3d)。
        //   纯 fillRect、确定性(缝抖动只按世界整数格 seed、转视点不游移)、量化行程(只画缝、底雾即面板)。**注:伪3d 无俯仰**——不可俯仰,horizon 恒 CH/2(精灵/地面线/门光晕锚点不变);但天花板【高度】可由场景 wallScale 决定=真·穹顶(天花 posZ=roomH-camH、地板 posZ=camH,Lodev/ShadowCaster 标准做法)。
        var horizon = CH / 2, camH = 0.5, fy, roomH = sceneCeilH(maze);   // roomH=场景房高=天花板平面高度(真·穹顶;roomH=1 时 (roomH-camH)=camH=0.5 → rdC 逐字节不变)
        // ── 震屏 + 头部晃动(手感批):整帧 translate(**不动 horizon → 天/地行循环次数不变=A 段 fillRect 计数守恒**,红队修法);确定性(seeded by g.tw、禁 Math.random);reduced-motion 关 ──
        var shake = (!reducedMotion && g.trauma > 0) ? g.trauma * g.trauma : 0, shook = false, shdx = 0, shdy = 0;
        var doBob = (g.walkBob > 0.001 && !reducedMotion && !g.caught && !g.won);
        if (ctx.save && (shake > 0.001 || doBob)) {
          if (shake > 0.001) { var skr = mulberry32(0x5AFE12 ^ (Math.floor(g.tw * 60) & 0xFFFF)); shdx = (skr() - 0.5) * shake * 12; shdy = (skr() - 0.5) * shake * 12; }   // 撞墙/被抓震屏:±6px(trauma² 落差快)
          if (doBob) shdy += Math.sin(g.tw * 9) * g.walkBob * 2.5;   // 头部晃动:走路上下晃 ±2.5px(只竖直 translate、不改 horizon)
          shdx = Math.round(shdx); shdy = Math.round(shdy);   // 【整像素量化·走路闪烁主修】整帧 translate 用非整数偏移→canvas 合成器对所有 fillRect 亚像素混合→1px 地面格缝逐帧抖动=「地板闪」的放大器(ultracode 调研定位的根因);量化到整像素后整像素合成、晃动步进 1px 对 ±2.5px 振幅几乎无感、不破确定性
          ctx.fillStyle = 'rgb(0,0,0)'; ctx.fillRect(0, 0, CW, CH);   // 平移前清屏(void)→ 震/晃边缘不露上一帧
          ctx.save(); ctx.translate(shdx, shdy); shook = true;
        }
        torchFlick = 1;                                       // 火把摇曳:8Hz 量化 seeded(禁 Math.random/Date.now,只读 g.tw=帧内恒定→不消费主 PRNG、确定性守恒);±7% 微颤非高频闪。无 torch 主题恒 1=零影响
        if (T.torch) { var tfr = mulberry32(0xF1A2E3 ^ (Math.floor(g.tw * 8) & 0xFFFF)); torchFlick = 0.93 + tfr() * 0.07; }
        var cosA = Math.cos(g.a), sinA = Math.sin(g.a), tanH = Math.tan(FOV / 2);                 // lodev 相机平面 ⊥ 视向、长 tan(FOV/2)(与投墙 tan 因子一致 → 墙顶接缝对齐;rdC=垂直深度故不可再除 cos)
        var planeX = -sinA * tanH, planeY = cosA * tanH;
        var rLx = cosA - planeX, rLy = sinA - planeY, rRx = cosA + planeX, rRy = sinA + planeY;   // 最左/最右列射线方向
        var dCx = (rRx - rLx) / CW, dCy = (rRy - rLy) / CW;                                        // 逐屏像素世界步进(×rdC=该行实际步)
        var ceilTex = T.ceilTex, lineK = (T.ceilLineK != null) ? T.ceilLineK : 0.5;               // 缝色 = 局部底色×lineK(凹陷阴影、非 #000;用局部底色 → 各深度对比一致;暗主题可低到更显)
        var floorTex = (maze.floorTex != null ? maze.floorTex : T.floorTex), floorLineK = (maze.floorLineK != null ? maze.floorLineK : (T.floorLineK != null ? T.floorLineK : 0.56));   // 地面 world-space 格缝:给脚下到远处的透视参照;默认空主题不画
        var oneAxis = (ceilTex === 'beam'), jit = (ceilTex === 'slab' || ceilTex === 'rib'), sp = (ceilTex === 'panel' || ceilTex === 'rib') ? 0.5 : 1, cStep = 2;   // beam=单向梁;rib=密肋+横向接缝,避免 gallery 里和 beam 混成同一张。
        for (fy = 0; fy < horizon; fy++) {                    // 天花:y=0 头顶(近)→ 地平线(远);fy<horizon → 分母≥1 无除零
          var rdC = (roomH - camH) * CH / (horizon - fy), fC = rdC <= 1 ? 0 : (rdC >= 8 ? 1 : (rdC - 1) / 7);   // 真·穹顶:平面距离用 (roomH-camH)(普通房 roomH=1→=camH=0.5 逐字节不变);天花随房高升、墙顶已锚在此高度→接缝处 rdC=perp 无缝
          var cr = T.ceilNear[0] + (T.ceilFar[0] - T.ceilNear[0]) * fC, cg = T.ceilNear[1] + (T.ceilFar[1] - T.ceilNear[1]) * fC, cb = T.ceilNear[2] + (T.ceilFar[2] - T.ceilNear[2]) * fC;
          ctx.fillStyle = 'rgb(' + Math.round(cr) + ',' + Math.round(cg) + ',' + Math.round(cb) + ')'; ctx.fillRect(0, fy, CW, 1);   // 底雾(默认主题=逐字节同 lerpRGB)
          if (!ceilTex || rdC >= 7) continue;                 // 默认主题(无 ceilTex)+ 远行(缝会亚像素):只底雾 → 默认逐字节不变
          var wx = g.px + rdC * rLx, wy = g.py + rdC * rLy, sx = rdC * dCx * cStep, sy = rdC * dCy * cStep, col, pkx = Math.floor(wx / sp), pky = Math.floor(wy / sp);
          var cCheck = (ceilTex === 'slab' || ceilTex === 'rib'), ccA = 0.06 * (1 - fC) * (1 - fC), csegX = 0, csegPar = (pkx + pky) & 1;   // 天花棋盘块面(对称地板 fcA、冷、半强度):奇格整段叠淡黑 → 给头顶格结构(暗主题原是黑平板=不显眼);仅 slab/rib 石质天花(beam/panel 各有其纹),近(fC=0)最强、远平方淡出=不闪;不消费 PRNG(缝随机序列不变)
          for (col = cStep; col <= CW; col += cStep) {
            wx += sx; wy += sy;
            var kx = Math.floor(wx / sp), ky = Math.floor(wy / sp);
            if (kx !== pkx || (!oneAxis && ky !== pky)) {       // 跨世界格边 = 一道缝(梁/接合)
              if (cCheck && csegPar && ccA > 0.003) { ctx.fillStyle = 'rgba(0,0,0,' + ccA.toFixed(3) + ')'; ctx.fillRect(csegX, fy, (col - cStep) - csegX, 1); }   // 收口上一格:奇格整段叠淡黑 = 棋盘块面(冷,不加暖)
              var lk = jit ? lineK * (0.82 + mulberry32(hashStr('ceil' + kx + '_' + ky))() * 0.30) : lineK;   // 石/肋:按世界整数格 seed 抖动暗度(确定性、视点稳)
              lk = 1 - (1 - lk) * (1 - fC);   // 缝随距离衰减:近暗清晰、远处淡出到底色(近清远糊;复用 fC、不消费 PRNG)
              ctx.fillStyle = 'rgb(' + Math.round(cr * lk) + ',' + Math.round(cg * lk) + ',' + Math.round(cb * lk) + ')';
              ctx.fillRect(col - cStep, fy, cStep, 1);
              csegX = col - cStep; csegPar = (kx + ky) & 1;   // 新格起点 + 奇偶
            }
            pkx = kx; pky = ky;
          }
          if (cCheck && csegPar && ccA > 0.003) { ctx.fillStyle = 'rgba(0,0,0,' + ccA.toFixed(3) + ')'; ctx.fillRect(csegX, fy, CW - csegX, 1); }   // 末格收口
        }
        for (fy = horizon; fy < CH; fy++) {                   // 地板:地平线(远)→ y=CH 脚下(近)
          var rdF = camH * CH / (fy - horizon + 0.0001), fF = rdF <= 1 ? 0 : (rdF >= 8 ? 1 : (rdF - 1) / 7);
          var fr0 = T.floorNear[0] + (T.floorFar[0] - T.floorNear[0]) * fF, fg0 = T.floorNear[1] + (T.floorFar[1] - T.floorNear[1]) * fF, fb0 = T.floorNear[2] + (T.floorFar[2] - T.floorNear[2]) * fF;
          if (T.torch) { fr0 *= torchFlick; fg0 *= torchFlick; fb0 *= torchFlick; }   // 地板底色整体随火把摇曳(对齐墙面 distF×torchFlick;原仅暖光增量在摇 → 现三面同一束光,天花保持冷静止=纵深对照)
          if (T.torch) {                                       // 近地板暖光池(火把照脚下;rdF<2.5 格才暖 × 摇曳;各通道钳 255)
            var fw = T.torch.warm || [0, 0, 0], wfr = Math.max(0, 1 - rdF / 3.0) * torchFlick * 1.3;   // 脚下暖光池增强(更宽 2.5→3 格 + 更亮 1.3×;火把照脚下;各通道钳 255)
            fr0 = Math.min(255, fr0 + fw[0] * wfr); fg0 = Math.min(255, fg0 + fw[1] * wfr); fb0 = Math.min(255, fb0 + fw[2] * wfr);
          }
          ctx.fillStyle = 'rgb(' + Math.round(fr0) + ',' + Math.round(fg0) + ',' + Math.round(fb0) + ')';
          ctx.fillRect(0, fy, CW, 1);
          if (!floorTex || rdF >= 7) continue;                 // 地平线远处缝会亚像素闪烁 → 跳过;默认主题 floorTex 空 → 逐字节保持旧地板
          var fsp = floorTex === 'tile' ? 0.5 : (floorTex === 'panel' ? 0.75 : 1), fStep = 2, fOneAxis = (floorTex === 'panel');   // slab=大方格,tile=小方砖,panel=单向金属板缝,crack=不规则裂纹;gallery 横看不再混成同一张。
          var fwx = g.px + rdF * rLx, fwy = g.py + rdF * rLy, fsx = rdF * dCx * fStep, fsy = rdF * dCy * fStep, fpkx = Math.floor(fwx / fsp), fpky = Math.floor(fwy / fsp), fcol;
          var fCheck = !fOneAxis, fcA = 0.12 * (1 - fF) * (1 - fF), segX = 0, segPar = (fpkx + fpky) & 1;   // 棋盘明暗块面(Lodev floor-cast):奇格整段叠淡暗;衰减改【平方】(原线性)→ 中远处块面更快淡出=会闪的密度区振幅压低、近处(fF=0)全亮保留观感;panel 单向不做;确定性(整数格、无 PRNG)
          for (fcol = fStep; fcol <= CW; fcol += fStep) {
            fwx += fsx; fwy += fsy;
            var fkx = Math.floor(fwx / fsp), fky = Math.floor(fwy / fsp);
            if (fkx !== fpkx || (!fOneAxis && fky !== fpky)) {       // 跨世界格边 = 地砖/面板/裂缝;随位移/转向收束到地平线,补地面层次感
              if (fCheck && segPar && fcA > 0.003) { ctx.fillStyle = 'rgba(0,0,0,' + fcA.toFixed(3) + ')'; ctx.fillRect(segX, fy, (fcol - fStep) - segX, 1); }   // 收口上一格:奇格整段叠暗 = 棋盘块面
              var flk = floorLineK, fa = 0.30;
              if (floorTex === 'tile') { flk *= 0.88; fa = 0.24; }
              else if (floorTex === 'panel') { flk *= 1.08; fa = 0.26; }
              else if (floorTex === 'crack') { flk *= (0.58 + mulberry32(hashStr('floor' + fkx + '_' + fky))() * 0.62); fa = 0.38; }   // 裂纹/碎石线深浅不一,但按世界格稳定
              fa *= (1 - fF) * (1 - fF);   // 缝随距离【平方】衰减(近清远糊+中远处快速淡出降闪烁;复用 fF、不消费 PRNG)
              // 地面缝只做低对比的表面刻痕:用半透明叠暗,不再画实心深色横杠。否则在墙脚/柱脚附近会被读成“墙体贴图穿到地板上”。
              ctx.fillStyle = 'rgba(' + Math.round(fr0 * flk) + ',' + Math.round(fg0 * flk) + ',' + Math.round(fb0 * flk) + ',' + fa.toFixed(3) + ')';
              ctx.fillRect(fcol - fStep, fy, fStep, 1);
              if (floorTex === 'panel' && Math.abs(fky % 2) === 1 && (fkx !== fpkx || (!fOneAxis && fky !== fpky))) { ctx.fillStyle = 'rgba(' + Math.round(fr0 * floorLineK * 1.35) + ',' + Math.round(fg0 * floorLineK * 1.35) + ',' + Math.round(fb0 * floorLineK * 1.35) + ',' + (0.120 * (1 - fF)).toFixed(3) + ')'; ctx.fillRect(fcol - fStep, fy, fStep, 1); }
              segX = fcol - fStep; segPar = (fkx + fky) & 1;   // 新格起点 + 奇偶
            }
            fpkx = fkx; fpky = fky;
          }
          if (fCheck && segPar && fcA > 0.003) { ctx.fillStyle = 'rgba(0,0,0,' + fcA.toFixed(3) + ')'; ctx.fillRect(segX, fy, CW - segX, 1); }   // 末格收口
        }
        var zbuf = new Array(CW);                                // per-column z-buffer(每帧重建;存校正垂直墙距 perp)
        var dMinX = CW, dMaxX = -1, dTopY = CH, dBotY = 0, dPerp = Infinity;   // 发光门屏幕 bbox + 最近门距(门光晕用;循环里累积,无门→dMaxX<0 跳过)
        for (var i = 0; i < CW; i++) {
          var cameraX = (2 * i / CW) - 1;
          var rayA = g.a + Math.atan(cameraX * Math.tan(FOV / 2));
          var hit = castRay(g.px, g.py, rayA);
          var perp = hit.dist * Math.cos(rayA - g.a); if (perp < 0.02) perp = 0.02;
          zbuf[i] = perp;
          var lineH = Math.min(CH * 4, CH / perp), y0 = (CH - lineH) / 2;
          var sc = hit.door ? 1 : wallScaleAt(maze, hit.cellX, hit.cellY);   // 假高度墙:门保持标准(出口标志+暖光指引不破),墙按格高度;门/平整 sc=1 → dY/dH 退化回 y0/lineH(逐字节不变)
          var dH = lineH * sc, dY = (y0 + lineH) - dH;                        // 锚脚拉伸:墙脚(y0+lineH)不动=与地板衔接零穿帮、墙顶向上长 sc 倍(只向上;天花板已整片铺满、露出部分自然显示)
          var texHsc = ((maze.wallTexMode != null ? maze.wallTexMode : T.wallTexMode) === 'stretch') ? 1 : sc;   // 纹理模式(maze.wallTexMode > T 主题级 > 默认 tile):tile→传真实墙高比=砖平铺多贴几排;stretch→传 1=纹路/装饰按拉伸高度等比放大(改动前效果)。墙体几何 dH 两模式都一样高,只画法不同;墙+装饰同一开关(装饰跟随)
          ctx.fillStyle = shadeWall(hit.side, perp, hit.door);
          ctx.fillRect(i, dY, 1, dH);
          var hitX = g.px + Math.cos(rayA) * hit.dist, hitY = g.py + Math.sin(rayA) * hit.dist;   // 命中世界点(dist=欧氏射线距离)
          var wallX = ((hit.side === 1 ? (hitY - Math.floor(hitY)) : (hitX - Math.floor(hitX))) % 1 + 1) % 1;   // 沿墙小数坐标(亲验 7/7);墙纹理+门样式共用
          if (hit.door) {
            if (i < dMinX) dMinX = i; if (i > dMaxX) dMaxX = i; if (dY < dTopY) dTopY = dY; if (dY + dH > dBotY) dBotY = dY + dH; if (perp < dPerp) dPerp = perp;   // 累积门屏幕范围(门光晕;门 sc=1 → dY/dH=y0/lineH)
            if (T.door && T.door !== 'glow' && dH >= 6) drawDoorOverlay(i, dY, dH, wallX, perp, T);   // 门样式(glow 默认=不叠加=中性门字节不变)
          } else if (T.wallTex && T.wallTex !== 'none' && dH >= 20) {
            drawWallTex(i, dY, dH, wallX, perp, hit.side, T, hit.cellX, hit.cellY, texHsc);                      // 墙纹理(texHsc:tile→高墙多贴几排砖·砖尺寸恒定 / stretch→纹路等比放大;远墙 dH<20 跳过;cx/cy=世界坐标→seeded 污渍稳定)
          }
          if (!hit.door) { drawWallBands(i, dY, dH, perp, hit.side, T, texHsc); drawWallDecor(i, dY, dH, wallX, perp, hit.side, T, hit.cellX, hit.cellY, hit.face, texHsc); }   // 墙面分层 + 具体墙饰(texHsc:tile→檐口/踢脚自然尺寸·墙饰锚踢脚线上方不变巨 / stretch→随墙等比放大);墙饰避开墙脚收口区
        }
        if (dMaxX >= 0) drawDoorGlow(dMinX, dMaxX, dTopY, dBotY, dPerp);   // 发光门光晕(墙后、精灵前:玩家与门之间的怪正确盖住光晕)
        drawSprites(zbuf);                                       // 精灵 pass(墙后、HUD 前;逐列被墙遮挡)
        if (T.vignette) {                                        // 暗角:边缘渐暗(rgba 叠加,聚焦中央=压迫感;色调取主题远色×0.5)
          var vc = T.ceilFar || [4, 4, 6], vp = 'rgba(' + Math.round(vc[0] * 0.5) + ',' + Math.round(vc[1] * 0.5) + ',' + Math.round(vc[2] * 0.5) + ',', vk, vsw = CW * 0.16 / 6, vsh = CH * 0.16 / 4;
          for (vk = 0; vk < 6; vk++) { ctx.fillStyle = vp + (0.085 * (6 - vk)).toFixed(3) + ')'; ctx.fillRect(vk * vsw, 0, vsw + 1, CH); ctx.fillRect(CW - (vk + 1) * vsw, 0, vsw + 1, CH); }
          for (vk = 0; vk < 4; vk++) { ctx.fillStyle = vp + (0.085 * (4 - vk)).toFixed(3) + ')'; ctx.fillRect(0, vk * vsh, CW, vsh + 1); ctx.fillRect(0, CH - (vk + 1) * vsh, CW, vsh + 1); }
        }
        // ── 动态演出:鬼靠近压迫(tunnel vision)/ 被抓死亡(血流 + 灵魂出窍)──
        if (g.caught) {
          drawEyesInDark(g.lunge, Math.max(0, g.tw - (g.caughtAt || 0)));   // 突脸冲入 → 黑屏 + 单独画眼(按鬼)+ 保留血/氛围
        } else if (g.prox > 0.02) {
          var pulse = 1 + 0.16 * Math.sin(g.tw * (3 + g.prox * 8));   // 越近脉动越快(随心跳)
          dreadVignette(Math.round(34 * g.prox) + ',0,0', Math.min(0.9, g.prox * 0.94 * pulse), 0.30 + g.prox * 0.22);   // 边缘暗+略血色,越近收拢越多
          proxFx(g.nearFace, g.prox, g.tw);                          // 该鬼的画面预兆(黑雾/人魂/瘴气/故障 淡显,强度 ∝ 靠近)
        }
        if (shook) ctx.restore();   // 解除震屏/头部晃动 translate(HUD 是 DOM 浮层、不受 canvas transform 影响)
        var lockedDoor = g.atDoor && g.needKey && !g.hasKey;
        var kE = resolveKeyHudEmoji(maze);   // HUD 钥匙 emoji 派生自 maze.keyIcon(治"实物 keycard、提示却🔑"接缝);缺省/未知 → 🔑(金钥匙默认)
        // ── 角落常驻目标锚(canvas 左上,小字半透明)──长期目标移到这里,不再用整句漫游提示反复唠叨;给方向感而不说教(氛围观察式)。
        if (!g.caught && !g.won) {
          // ◎(U+25CE) tofu 风险(rank4) → ●(U+25CF 基本圆点,覆盖良好);先 strokeText 暗描边再 fillText 亮字,亮主题近墙不被吃掉(rank16)
          var objHint = (g.needKey && !g.hasKey) ? '● 先找那把 ' + kE
            : (g.needKey && g.hasKey) ? '● ' + kE + ' 在手,去开门'
              : '● 寻找出口';
          ctx.save(); ctx.globalAlpha = 0.6; ctx.font = '12px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
          if (ctx.strokeText) { ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeText(objHint, 9, 9); }   // 亮主题对比描边(headless stub 无 strokeText → guard)
          ctx.fillStyle = 'rgb(238,243,248)'; ctx.fillText(objHint, 9, 9); ctx.restore();   // headless ctx 是 stub,save/restore/fillText 退化无操作
          if (g.canMouseLook) {   // 桌面 mouselook 提示(左上目标锚下方、触屏不显;避开右上角全屏按钮 DOM 浮层):点画面锁鼠标转向 / 已锁则 ESC 退出
            // 🖱(U+1F5B1) tofu 风险(rank4) → 纯文字;同加 strokeText 暗描边(rank16)
            var mlHint = g.mouseLook ? 'ESC 退出鼠标转向' : '点击画面锁定鼠标转向';
            ctx.save(); ctx.globalAlpha = 0.5; ctx.font = '11px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            if (ctx.strokeText) { ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeText(mlHint, 9, 28); }
            ctx.fillStyle = 'rgb(238,243,248)'; ctx.fillText(mlHint, 9, 28); ctx.restore();
          }
        }
        var hud = g.caught ? '它抓住了你 —— 从下面的选项离开'
          : g.won ? '门开了 —— 从下面「走出迷宫」继续'
            : lockedDoor ? '🔒 门锁着 —— 先找到那把' + kE
              : g.atDoor ? '▸ 那扇发光的门就在眼前,向前走过去 ◂'
                : (g.needKey && !g.hasKey) ? '找到那把发光的 ' + kE + ',再去开门'
                  : (g.needKey && g.hasKey) ? kE + ' 已在手 —— 找到那扇发光的门'
                    : (maze.idleHint || THEME_IDLE[theme] || '走廊在你面前延伸,远处似乎有什么在静静等待……');   // 漫游(无钥匙任务=纯探索)=氛围观察句(替换生硬命令式);有钥匙任务保留钥匙引导(含派生 emoji、治接缝);角落锚另给长期目标;maze.idleHint 覆盖 > 主题默认 > 兜底
        if (g.eventHint && !g.caught && !g.won && !lockedDoor) hud = g.eventHint;   // 坐标事件 hint / R1-b1 检视线索:覆盖常规漫游提示;被抓/通关/锁门这些关键态优先级更高,故不被盖。
        if (hudEl && hudEl.textContent !== hud) hudEl.textContent = hud;   // HUD 提示=悬画面顶的浮层(普通+全屏同款;DOM 非 canvas=不糊)
        syncInteractButton();
      }

      function castRay(px, py, a) {
        var dx = Math.cos(a), dy = Math.sin(a);
        var mapX = Math.floor(px), mapY = Math.floor(py);
        var dDX = Math.abs(1 / (dx || 1e-9)), dDY = Math.abs(1 / (dy || 1e-9));
        var stepX = dx < 0 ? -1 : 1, stepY = dy < 0 ? -1 : 1;
        var sideDX = (dx < 0 ? (px - mapX) : (mapX + 1 - px)) * dDX;
        var sideDY = (dy < 0 ? (py - mapY) : (mapY + 1 - py)) * dDY;
        var side = 0, guard = 0;
        while (guard++ < 64) {
          if (sideDX < sideDY) { sideDX += dDX; mapX += stepX; side = 1; }
          else { sideDY += dDY; mapY += stepY; side = 0; }
          if (isWall(grid, mapX, mapY)) break;
        }
        var dist = side === 1 ? (sideDX - dDX) : (sideDY - dDY);
        var face = side === 1 ? (stepX > 0 ? 'W' : 'E') : (stepY > 0 ? 'N' : 'S');   // 命中墙面的朝向:仅供 wallDecor 贴墙定位,不改 DDA/碰撞/门逻辑
        return { dist: Math.max(0.02, dist), side: side, door: isDoor(grid, mapX, mapY), cellX: mapX, cellY: mapY, face: face };   // cellX/cellY=命中墙格(假高度墙按格查高度;纯附加、不改光线/碰撞)
      }

      function tryMove(nx, ny) {
        if (!isWall(grid, Math.floor(nx + (nx > g.px ? RAD : -RAD)), Math.floor(g.py))) g.px = nx;
        if (!isWall(grid, Math.floor(g.px), Math.floor(ny + (ny > g.py ? RAD : -RAD)))) g.py = ny;
      }

      // ── 经典 A* 网格寻路(Manhattan 启发):怪物绕墙找向玩家的最短路,返回下一步格 [x,y](无路/同格→null)──
      //   等权网格上 A* 与 BFS 给同一最短路;A* 用启发少展开节点(大迷宫更快)。每帧每怪算一次(121 格=瞬间)。
      //   贪心直线追会卡墙(怪物上/左是墙时不会先绕远)=之前"追不过来"的真因(node 实测已证)。
      function astarNext(sx, sy, tx, ty) {
        if (sx === tx && sy === ty) return null;
        var open = [[sx, sy]], gsc = {}, fsc = {}, came = {}, inO = {}, st = sx + ',' + sy, guard = 0;
        gsc[st] = 0; fsc[st] = Math.abs(sx - tx) + Math.abs(sy - ty); inO[st] = 1;
        while (open.length && guard++ < 4000) {
          var bi = 0; for (var i = 1; i < open.length; i++) if (fsc[open[i][0] + ',' + open[i][1]] < fsc[open[bi][0] + ',' + open[bi][1]]) bi = i;
          var cur = open.splice(bi, 1)[0], ck = cur[0] + ',' + cur[1]; inO[ck] = 0;
          if (cur[0] === tx && cur[1] === ty) { var node = ck; while (came[node] && came[node] !== st) node = came[node]; var pp = node.split(','); return [+pp[0], +pp[1]]; }   // 回溯到"父=起点"的格=第一步
          var nb = [[cur[0] + 1, cur[1]], [cur[0] - 1, cur[1]], [cur[0], cur[1] + 1], [cur[0], cur[1] - 1]];
          for (var j = 0; j < 4; j++) { var nx = nb[j][0], ny = nb[j][1]; if (isWall(grid, nx, ny)) continue; var nk = nx + ',' + ny, tg = gsc[ck] + 1; if (gsc[nk] == null || tg < gsc[nk]) { came[nk] = ck; gsc[nk] = tg; fsc[nk] = tg + Math.abs(nx - tx) + Math.abs(ny - ty); if (!inO[nk]) { open.push([nx, ny]); inO[nk] = 1; } } }
        }
        return null;   // 无路(被墙完全隔开)→ 不动
      }

      running = true;
      var generation = loopGeneration;
      var last = 0;
      function loop(ts) {
        if (
          !running ||
          generation !== loopGeneration
        ) return;
        if (!last) last = ts;
        var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
        g.tw += dt;                          // 脸微颤相位(始终推进;loop 停=冻结最后一帧)
        if (g.trauma) g.trauma = Math.max(0, g.trauma - dt * 1.6);   // 创伤(震屏强度)衰减(~0.6s 归零;撞墙/被抓→震屏,随即平息)
        if (!STATIC_PREVIEW) buildMazeAmbient(theme);             // 常驻主题化氛围床;gallery 静态预览禁音频/禁持续 loop,只看素材
        if (!STATIC_PREVIEW && !g.won && !g.caught && !g.puzzleOpen) {
          // ── intent 层(R1-4):三种输入(方向键坦克 / WASD+鼠标 / 触屏摇杆〔批2〕)只写意图量,loop 只读 → 互不打架 ──
          var turnRate = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + (g.turnRate || 0);   // 持续转向(方向键 ←→ + 触屏右摇杆〔批2 写 g.turnRate〕)
          g.av = (g.av || 0) + (turnRate * TURN - (g.av || 0)) * Math.min(1, dt * 8);      // 转身惯性:角速度朝目标平滑(按住渐加速、松开滑停=重量感)
          g.a += g.av * dt + (g.turnDelta || 0);   // 持续转向(惯性×dt) + 增量转向(鼠标 movementX / 右半屏 swipe,已含时间、不乘 dt)
          g.turnDelta = 0;                          // 增量转向用完即清(鼠标/swipe)
          var fwd = (keys.fwd ? 1 : 0) - (keys.back ? 1 : 0) + (g.fwd || 0);                // 前后意图(↑↓ / W·S + 摇杆纵〔批2〕)
          var stf = (keys.strafeR ? 1 : 0) - (keys.strafeL ? 1 : 0) + (g.strafe || 0);     // 侧移意图(WASD A/D + 摇杆横〔批2〕);侧移不改 g.a = 与转向的本质区别
          var moved = false;
          if (fwd || stf) {
            var fx = Math.cos(g.a), fy = Math.sin(g.a), rx = -Math.sin(g.a), ry = Math.cos(g.a);   // 前向量(cos,sin) + 右向量(视向转+90°=(-sin,cos))
            var dx = fx * fwd + rx * stf, dy = fy * fwd + ry * stf, dl = Math.sqrt(dx * dx + dy * dy);
            if (dl > 1) { dx /= dl; dy /= dl; }     // 对角归一:斜走(前+侧合成)不比直走快 √2 倍
            var pxb = g.px, pyb = g.py;
            tryMove(g.px + dx * MOVE * dt, g.py + dy * MOVE * dt);   // tryMove 逐轴查 → 贴墙可滑行
            moved = (g.px !== pxb || g.py !== pyb);
            if (moved) {                                         // 真走动了(没撞墙原地)→ 脚步声按 ~0.4s 步频(材质化)
              g.stepAcc = (g.stepAcc || 0) + dt;
              if (g.stepAcc >= 0.40) { g.stepAcc = 0; footstep(); }
            }
          } else g.stepAcc = 0.40;                               // 站定:下次一迈步立刻出声(不等一个步频);也使站定不响(脚步只在移动时)
          var blocked = (fwd || stf) && !moved;                  // 有移动意图但没动=撞墙(贴墙滑行有一轴动 moved=true、不算撞)
          if (blocked && !g.wasBlocked) g.trauma = Math.min(0.4, (g.trauma || 0) + 0.3);   // 撞墙瞬间(仅入墙那帧、非每帧)→ 轻震屏(撞击反馈)
          g.wasBlocked = blocked;
          g.walkBob = (g.walkBob || 0) + ((moved ? 1 : 0) - (g.walkBob || 0)) * Math.min(1, dt * 6);   // 走路晃动强度:走→渐显、停→渐隐(head-bob 用)
          if (g.needKey && !g.hasKey) {   // 钥匙拾取:走近未拾取的钥匙(<0.5 格)→ 持有 + 移除精灵 + 轻响(会话局部,不入档)
            for (var iti = 0; iti < g.items.length; iti++) {
              var it = g.items[iti]; if (it.taken) continue;
              var idx2 = g.px - it.sx, idy2 = g.py - it.sy;
              if (idx2 * idx2 + idy2 * idy2 < 0.25) { if (acquireKey(it)) break; }
            }
          }
          // ── 坐标事件触发(仅"进入新格"那帧;hint 持续 ~2.6s 走过也读得到;run 抛错隔离不冻结 rAF loop)──
          var ecx = Math.floor(g.px), ecy = Math.floor(g.py), cellChg = (ecx !== g.prevCX || ecy !== g.prevCY);
          if (cellChg) {                                               // 边缘检测:格变化那帧才触发(非每帧;Dungeon Master / RPG Maker Player Touch 语义,格内转身/站定不重复)
            for (var evj = 0; evj < evList.length; evj++) {
              var baseEv = evList[evj]; if (baseEv.x !== ecx || baseEv.y !== ecy || baseEv._touchPickup) continue;
              if (baseEv.once && g.triggered[evj]) continue;              // once 已触发过 → 整条事件(when/run/set/warp/turn/hint/可见精灵)不再触发
              var evx = activeEvent(baseEv, api.state); if (!evx || evx.trigger === 'interact') continue;
              if (!hasTriggerContent(evx)) continue;                   // R1-b1 examine-only / R1-b3 examine-only page 是只读线索,不能因进入坐标而被 once 消耗或响拾取声。
              triggerMazeEvent(evx, evj);                                 // 触发:条件 + 状态钩子 + 声明式动作(改格/传送/转向)+ hint + once(详见 fireMazeEvent 定义;函数提取=正确捕获 evx,避免 var 循环闭包陷阱)
              if (g.puzzleOpen) break;                                    // puzzle 打开即成为当前交互焦点:未解/取消时不让同格后续事件抢跑,避免同一帧“开面板+跑机关/消耗 once”。
            }
          }
          if (g.puzzleOpen) { if (g.suppressPrev) g.suppressPrev = false; else { g.prevCX = ecx; g.prevCY = ecy; } }   // 自动进格打开 puzzle 后,当帧立刻停住后续接触/门/怪物逻辑;同时记录当前格,关闭面板后不会原地反复弹窗。
          else for (var evti = 0; evti < evList.length; evti++) {            // 嵌入式隐藏拾取物:需要贴近/朝向,因此每帧检查接触阈值;once 仍会话局部。
            var baseEvt = evList[evti]; if (!baseEvt._touchPickup || baseEvt.x !== ecx || baseEvt.y !== ecy) { g.touchingEvents[evti] = false; continue; }
            if (baseEvt.once && g.triggered[evti]) continue;
            var ready = touchPickupReady(baseEvt), evt = activeEvent(baseEvt, api.state);
            if (ready && evt && evt.trigger !== 'interact' && hasTriggerContent(evt) && !g.touchingEvents[evti]) triggerMazeEvent(evt, evti);   // 边缘式接触:贴上去那一刻触发;examine-only 与 interact 都不自动触发/不 once。
            g.touchingEvents[evti] = ready;
          }
          if (!g.puzzleOpen) { if (g.suppressPrev) g.suppressPrev = false; else { g.prevCX = ecx; g.prevCY = ecy; } }   // 记录当前格(边缘检测基准);warp 当帧已把 prevC 设为目标格 → 抑制覆盖,使传送=「放置」不算「走进」(不误触目标格事件;玩家走出再回正常触发)
          if (g.eventHint && g.tw >= g.eventHintT) g.eventHint = null;  // hint 到期清(走过也读得到 ~2.6s 后消失)
          if (g.puzzleOpen) { g.walkBob = 0; clearMoveIntent(); }        // 面板打开后当帧立刻停住,不再继续推门/追逐/抓取。
          else {
            g.atDoor = doorAhead(0.55);     // 正对门且贴近?(用 g.a → 必须正对)
            if (g.atDoor) winNow();         // 接触判定:正对门贴近即自动推开(winNow 内含钥匙门控:有 'K' 未拾取则不开)
            // 怪物追逐(经典 A* 网格寻路绕墙朝玩家)+ 抓住=被抓 + 最近距离驱动心跳
            var nearest = Infinity, nearFace = null, nearMon = null;
            for (var mi = 0; mi < g.monsters.length && !g.won && !g.caught; mi++) {
              var m = g.monsters[mi]; if (!m.active) continue;
              if (m.chase) {
                var mcx = Math.floor(m.sx), mcy = Math.floor(m.sy), pcx = Math.floor(g.px), pcy = Math.floor(g.py), tx = m.sx, ty = m.sy;
                if (mcx === pcx && mcy === pcy) { tx = g.px; ty = g.py; }                       // 同格 → 直接逼近玩家精确位置
                else { var nc = astarNext(mcx, mcy, pcx, pcy); if (nc) { tx = nc[0] + 0.5; ty = nc[1] + 0.5; } }   // 否则朝 A* 下一步格中心走
                var ddx = tx - m.sx, ddy = ty - m.sy, dl = Math.sqrt(ddx * ddx + ddy * ddy);
                if (dl > 0.001) { var stp = Math.min(dl, chase * dt); m.sx += ddx / dl * stp; m.sy += ddy / dl * stp; }   // min 防过冲格心(chase=maze.chaseSpeed 覆盖默认 CHASE)
              }
              var dd = Math.sqrt((g.px - m.sx) * (g.px - m.sx) + (g.py - m.sy) * (g.py - m.sy));
              if (dd < nearest) { nearest = dd; nearFace = m.body || m.face || (m.art ? 'zombie' : null); nearMon = m; }   // 鬼"种类"=body/face → 驱动压迫声/画面预兆;自定义怪(有 art 无 face)默认 zombie 基线(与死亡演出 :633 zombie 默认一致、不再静默;作者写 face 覆盖);nearMon=最近怪对象(取其念白 lines)
              var mpr = projectSprite(m);
              if ((mpr && mpr.depth < 0.55) || dd < 0.42) { scareEnd(m); break; }   // 正对贴脸 或 被任意方向抓住 → 被抓(传 m:镜头转向它=突脸)
            }
            if (nearest < 14 && !g.caught) {   // 靠近怪物 → 心跳渐快渐强 + 屏幕边缘环境光遮蔽收拢(tunnel-vision 压迫)
              var prox = Math.max(0, Math.min(1, (14 - nearest) / 13));   // 0 远 → 1 贴近
              g.prox = prox;                                              // → render 据此画动态压迫暗角
              if (tensionBus) { try { tensionBus.gain.setTargetAtTime(prox > 0.45 ? (prox - 0.45) / 0.55 * 0.06 : 0, hbCtx.currentTime, 0.3); } catch (e) {} }   // 高频弦张力层:贴近(prox>0.45)才渐显、上限 0.06(细、不抢心跳;远处不响)
              g.hbAcc += dt;
              if (g.hbAcc >= 1.2 - prox * 0.88) { g.hbAcc = 0; hbBeat(0.16 + prox * 0.5); }   // 间隔 1.2s(远)→ 0.32s(近);音量 0.16→0.66(明显)
              g.nearFace = nearFace;                                     // → render 据此画该鬼画面预兆(proxFx)
              var sp = relSpatial(nearMon, g);
              proxAmbient(nearFace, prox, sp.pan, sp.rear);              // 该鬼压迫声:左右走 pan;身后走湿声/暗化 cue。前后歧义是 StereoPanner 物理上限,不 over-claim 成 HRTF。
              if ((nearFace === 'mimic' || (nearMon && nearMon.lines)) && prox > 0.35) {   // 伪人 或 带自定义念白 lines 的怪 在「开口」阈值内
                if (!g.mimicWasNear) { g.mimicWasNear = true; g.mimicNext = g.tw + 1.4 + g.mimicRng() * 0.8; }   // 刚进范围→先静默 1~2 拍(沉默更瘆)再开口
                else if (g.tw >= g.mimicNext) {                          // 到点→轮换一句台词(离散事件、挂 hbMaster)
                  mimicSpeak(pickMimicText(nearMon), sp);
                  g.mimicNext = g.tw + 3.5 + (1 - prox) * 6 + g.mimicRng() * 2.2;   // 说完留 3.5~9.5s 不规则间隔(NT 不连珠炮)
                }
              } else { g.mimicWasNear = false; }                          // 退出伪人阈值→重置(下次再进先静默)
            } else if (!g.caught) { g.prox = 0; proxAmbient(null, 0, 0); g.mimicWasNear = false; if (tensionBus) { try { tensionBus.gain.setTargetAtTime(0, hbCtx.currentTime, 0.4); } catch (e) {} } }   // 远离 → 压迫声渐隐 + 张力层归零 + 重置伪人开口
          }
        }
        if (hbMaster && hbCtx) { var nmt = hbMuted(); if (nmt !== g.lastMuted) { try { hbMaster.gain.setTargetAtTime(nmt ? 0 : 1.5, hbCtx.currentTime, 0.04); } catch (e) {} g.lastMuted = nmt; } }   // 实时跟工具栏静音:path-A 连续 drone/心跳/人声跟着停/恢复(hbMuted 只拦发声函数入口=拦不住已在播的连续源 → 工具栏静音对迷宫"没用")
        if (g.caught && g.caughtAt != null && g.tw - g.caughtAt > 2.6) exitFsIfMine();   // 突脸+死亡演出播完(~2.6s)→ 退出全屏,回到选项(被抓时不立即退、让突脸满屏)
        render();
        if (
          !STATIC_PREVIEW &&
          generation === loopGeneration
        ) rafId = requestAnimationFrame(loop);
      }
      render();
      try { canvas.focus(); } catch (e) { /* 聚焦失败不影响(还有按钮) */ }
      if (!STATIC_PREVIEW) rafId = requestAnimationFrame(loop);
    }

    function mapKey(k) {
      if (k === 'ArrowUp' || k === 'w' || k === 'W') return 'fwd';
      if (k === 'ArrowDown' || k === 's' || k === 'S') return 'back';
      if (k === 'a' || k === 'A') return 'strafeL';     // WASD:A/D = 侧移 strafe(现代 FPS,配鼠标转向)
      if (k === 'd' || k === 'D') return 'strafeR';
      if (k === 'ArrowLeft') return 'left';             // 方向键:←→ = 原地转向(经典 Doom 坦克式)
      if (k === 'ArrowRight') return 'right';
      return null;
    }

    return mod;
  }

  return { createMaze3dModule: createMaze3dModule };
});
