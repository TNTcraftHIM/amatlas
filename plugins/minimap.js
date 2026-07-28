/* ════════════════════════════════════════════════════════════════════════
   Amatlas 能力插件 · 小地图(plugins/minimap.js)— S8.5 / S11-c 双视图 + toggle
   ════════════════════════════════════════════════════════════════════════
   验证统一插件模型读"**世界结构 + 位置**"的通用性:用 `api.world`(地图图)+ `api.state.pos`
   + `api.on('enter')` 刷新,画 SVG 小地图(当前节点高亮)。**不写 state**(纯派生)。
   **类型无关**:任何跑在核心上的数据驱动游戏都有 maps/nodes,故通用。
   **双视图**(同一渲染管线、差别只在坐标来源):`layout:'spatial'`(**默认=玩家视图**,优先作者标的
   `node.map:{x,y}` 0–100 归一坐标、全缺静默回退 ring)/ `'ring'`(**调试视图**,环形,查节点设计/死链)。
   **玩家好默认**(S11-c 地图打磨):① 默认 spatial(给玩家真实空间地图)② `fog:'hide'`(玩家视图默认探索雾:
   严格只显已探索/当前;`'frontier'` 则额外显**一度**出口邻居〔未探索·CSS 淡显、二度+ 不画〕、`'off'` 全图)③ **节点标签 hover**(读 `node.title‖name‖id`,
   当前节点常显)④ **连线实时锁定**(算 `requires`/`available` 门控,当前为假才 `data-locked`,跟随状态变化)
   ⑤ **密度自适应半径**(round10:节点 >28 时按 usable/√n 缩小节点圆与最小间距,大图不再挤成一团;≤28 零回归)
   ⑥ **重绘订 render 广播**(round10:读档 load/loadLocal 不发 enter → 旧版读档后地图陈旧;现 enter/action/load/reset 全跟随)。
   语义钩子交 CSS 发挥:节点组 `.amatlas-node`(内 circle `data-current`/`data-seen`、标签 `text.amatlas-node-label`)、连线 `data-locked`。
   **toggle**:默认 `mode:'toggle'` 渲染 `🗺️ 地图` 按钮(进 `#plugin-bar`)+ 点开面板;`mode:'inline'`
   则常驻 `#plugin-minimap`(无 `#plugin-bar` 时 toggle 也退化常驻)。纯函数 `buildMinimapSVG(world,pos,opts)` 可纯 node 断言。
   进阶样式(手绘/地牢/极简)见 player-map 文档 —— 共享数据、只换色/线型/滤镜/雾,引擎不强加风格。

   用法:engine.use(createMinimapPlugin({}));   // 默认玩家视图;查结构传 { layout:'ring' };经典角标传 { mode:'inline' };方块房间传 { glyph:'box' }
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).MinimapPlugin = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 插件控件默认样式(自带,§11:插件控件 UI ≠ 游戏内容创作 → 引擎兜底默认外观、作者可覆盖换皮;治本反复"工具栏裸")。
  //   :where() 零特异性 → 作者 index.html 任何 .amatlas-* 规则都覆盖;var(--x, fallback) → 作者定义了主题变量就跟随、没定义用中性深色不裸。
  //   共享块(按钮/浮窗,四插件共用)用幂等 id 只注一次;地图专属另一份(SVG 锁线/雾/节点标签)。注入到 head 最前 → 作者样式在后、自然覆盖。
  var SHARED_CSS = ':where(.amatlas-plugin-btn){appearance:none;font:13px var(--ui,system-ui,sans-serif);background:var(--panel,#121a26);color:var(--ink,#e8edf4);border:1px solid var(--line,#222e40);border-radius:8px;padding:7px 12px;cursor:pointer;transition:.2s}:where(.amatlas-plugin-btn):hover{border-color:var(--accent,#b89b6a);color:var(--accent,#b89b6a)}:where(.amatlas-plugin-panel){position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:60;width:92%;max-width:440px;max-height:82vh;overflow:auto;background:var(--panel,#121a26);color:var(--ink,#e8edf4);border:1px solid var(--line,#222e40);border-radius:14px;padding:24px 22px;box-shadow:0 24px 70px rgba(0,0,0,.6);font:13px var(--ui,system-ui,sans-serif)}:where(.amatlas-plugin-panel)[hidden]{display:none}:where(.amatlas-plugin-panel)::before{content:"";position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:-1}:where(.amatlas-plugin-close){position:absolute;top:14px;right:16px;background:none;border:none;color:var(--dim,#8a99ad);font-size:18px;line-height:1;cursor:pointer;padding:2px 7px;border-radius:6px}:where(.amatlas-plugin-close):hover{color:var(--accent,#b89b6a)}';
  var MAP_CSS = ':where(.amatlas-map-panel){max-width:560px}:where(.amatlas-map-panel) svg{display:block;width:100%;height:auto;max-width:512px;margin:0 auto}:where(.amatlas-minimap) line[data-locked]{stroke:var(--danger,#c87b6a);stroke-width:1.6;stroke-dasharray:3 2}:where(.amatlas-minimap) [data-current]{stroke:#fff;stroke-width:1.6}:where(.amatlas-minimap) [data-node]:not([data-seen]){opacity:.32}:where(.amatlas-node-label){fill:var(--ink,#e8edf4);font-family:var(--ui,system-ui,sans-serif);font-weight:600;opacity:0;transition:opacity .15s;pointer-events:none;paint-order:stroke;stroke:var(--panel,#121a26);stroke-width:2}:where(.amatlas-node):hover .amatlas-node-label,:where(.amatlas-node-label.current){opacity:1}@media (hover:none){:where(.amatlas-node-label){opacity:1}}';   // 触屏无 hover → 标签常显(雾仍遮未探索;工具类控件 a11y,§11 授权域)
  function injectStyles(doc) {
    if (!doc || !doc.head || !doc.createElement) return;   // 容 stub DOM:不全则优雅退化、不崩
    function once(id, css) {
      if (doc.getElementById && doc.getElementById(id)) return;
      var s = doc.createElement('style'); if (!s) return; s.id = id; s.textContent = css;
      if (doc.head.insertBefore) doc.head.insertBefore(s, doc.head.firstChild); else if (doc.head.appendChild) doc.head.appendChild(s);
    }
    once('amatlas-plugin-shared', SHARED_CSS);   // 四插件共用(按钮/浮窗),幂等→只注一次
    once('amatlas-plugin-map', MAP_CSS);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // 环形布局(调试视图;无坐标时的保底回退):节点均匀分布在圆周上。
  function ringLayout(ids, W, H) {
    var cx = W / 2, cy = H / 2, r = 44, at = {};
    for (var i = 0; i < ids.length; i++) {
      var ang = (ids.length === 1) ? -Math.PI / 2 : (-Math.PI / 2 + 2 * Math.PI * i / ids.length);
      at[ids[i]] = { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
    }
    return at;
  }
  // 力导向防重叠(showcase Sonnet/Opus 实测:circle spatial 直接按 node.map 摆,作者把多节点坐标设得接近〔如主线 x 都=50〕→ 节点圆重叠挤成一团)。
  //   几轮松弛:把距离 < minDist 的节点对沿连线互推开各半,保持相对布局(空间语义不破)、仅消除重叠。完全重合→确定性微扰(基于索引奇偶,非 Math.random,保可测)。
  function relaxOverlap(at, ids, minDist, W, H, margin) {
    var n = ids.length;
    for (var it = 0; it < 60; it++) {
      var moved = false;
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          var a = at[ids[i]], b = at[ids[j]];
          var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy);
          if (d >= minDist) continue;
          moved = true;
          if (d < 0.01) { dx = (i % 2 ? 1 : -1); dy = (j % 2 ? 1 : -1); d = Math.sqrt(dx * dx + dy * dy); }   // 完全重合 → 确定性微扰(索引奇偶,非随机)
          var push = (minDist - d) / 2, ux = dx / d, uy = dy / d;
          a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
        }
      }
      for (var k = 0; k < n; k++) {                                  // clamp 回面板内(推开别冲出 viewBox)
        var pp = at[ids[k]];
        pp.x = Math.max(margin, Math.min(W - margin, pp.x));
        pp.y = Math.max(margin, Math.min(H - margin, pp.y));
      }
      if (!moved) break;                                             // 无重叠 → 提前收敛
    }
    return at;
  }
  // 坐标三级(当前实现两级 + backlog):spatial 且**全节点**标了 node.map:{x,y}(0–100 归一,模块私有、核心不读)
  //   → 真空间布局;任一缺坐标 → 静默回退环形(装饰性增强、非门控,不 fail-loud)。link.dir 方向推断网格(Trizbort 式)记 backlog。
  function layoutNodes(nodes, ids, spatial, W, H, margin, minDist) {
    if (spatial) {
      var allCoords = ids.every(function (id) { var m = nodes[id] && nodes[id].map; return m && typeof m.x === 'number' && typeof m.y === 'number'; });
      if (allCoords) {
        var at = {};
        for (var i = 0; i < ids.length; i++) {
          var m = nodes[ids[i]].map;
          at[ids[i]] = { x: margin + (m.x / 100) * (W - 2 * margin), y: margin + (m.y / 100) * (H - 2 * margin) };
        }
        return relaxOverlap(at, ids, minDist || 18, W, H, margin);   // 防重叠:坐标近的节点圆会挤成一团 → 力导向推开(保相对布局)
      }
    }
    return ringLayout(ids, W, H);
  }
  // 方块房间网格布局(glyph:'box';Trizbort/IF 式):**方向驱动 BFS** 把房间落整数网格,正交走廊才干净。
  //   方向来源:连接 `dir`('n'/'s'/'e'/'w'/'ne'/'nw'/'se'/'sw',模块私有装饰字段)优先;没标→两端 node.map 的 atan2 推断 8 向;都没有→就近找空格。
  //   冲突(格被占):沿该方向顺延找最近空格(Inform「绝不叠放」+ Mudlet「沿轴 stretch」);环/矛盾→先到先得、那条边只连不挪(小图够用)。
  //   依据:Trizbort/Inform7/MUD automapper 一致以方向为方块布局一等输入;纯坐标量化会重叠+走廊歪(调研见 journal)。返回 {at, r}(r=按密度缩的房间半尺寸)。
  function boxGridLayout(world, nodes, ids, pos, W, H, R, margin) {
    var DIRV = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };
    var SECT = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];  // E,SE,S,SW,W,NW,N,NE(SVG y 向下)
    function infer(u, v) {                                      // 两端 node.map → 8 罗盘向;缺坐标/同点 → null
      var mu = nodes[u].map, mv = nodes[v].map;
      if (!(mu && mv && typeof mu.x === 'number' && typeof mv.x === 'number') || (mu.x === mv.x && mu.y === mv.y)) return null;
      return SECT[((Math.round(Math.atan2(mv.y - mu.y, mv.x - mu.x) / (Math.PI / 4)) % 8) + 8) % 8];
    }
    var cell = {}, occ = {}, idk;                              // cell[id]=[gx,gy];occ['gx,gy']=id
    function put(id, gx, gy) { cell[id] = [gx, gy]; occ[gx + ',' + gy] = id; }
    // 稳定根:本图含 world.start.node 用它,否则首个节点(插入序稳定)→ 布局不随玩家移动变
    var root = (world.start && world.start.map === pos.map && nodes[world.start.node]) ? world.start.node : ids[0];
    put(root, 0, 0);
    var q = [root], qi = 0;
    while (qi < q.length) {
      var u = q[qi++], uc = cell[u], conns = [].concat(nodes[u].exits || [], nodes[u].links || []);
      for (var k = 0; k < conns.length; k++) {
        var c = conns[k], v = (c && typeof c.to === 'string') ? c.to : null;
        if (!v || !nodes[v] || cell[v]) continue;              // 跨图/缺/已放 → 跳过(边稍后照画)
        var dv = (c.dir && DIRV[c.dir]) ? DIRV[c.dir] : infer(u, v), gx, gy, ok = false;
        if (dv) {                                              // 有方向:相邻格;占了沿轴顺延找空格
          gx = uc[0] + dv[0]; gy = uc[1] + dv[1];
          for (var st = 0; occ[gx + ',' + gy] && st < ids.length; st++) { gx += dv[0]; gy += dv[1]; }
          ok = !occ[gx + ',' + gy];
        }
        if (!ok) { for (var n8 = 0; n8 < 8; n8++) { var nx = uc[0] + SECT[n8][0], ny = uc[1] + SECT[n8][1]; if (!occ[nx + ',' + ny]) { gx = nx; gy = ny; ok = true; break; } } }
        if (ok) { put(v, gx, gy); q.push(v); }                 // 极满放不下 → 不放、边仍画
      }
    }
    var maxGy = 0; for (idk in cell) maxGy = Math.max(maxGy, cell[idk][1]);   // 失联节点泊到底部行
    var park = 0; for (var i = 0; i < ids.length; i++) if (!cell[ids[i]]) put(ids[i], park++, maxGy + 2);
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, c2;   // 归一 → viewBox(等比缩放 + 居中,保网格方正)
    for (idk in cell) { c2 = cell[idk]; if (c2[0] < minx) minx = c2[0]; if (c2[0] > maxx) maxx = c2[0]; if (c2[1] < miny) miny = c2[1]; if (c2[1] > maxy) maxy = c2[1]; }
    var sx = maxx - minx, sy = maxy - miny;
    var cs = Math.min(sx > 0 ? (W - 2 * margin) / sx : 1e9, sy > 0 ? (H - 2 * margin) / sy : 1e9);
    if (!isFinite(cs)) cs = 0;                                 // 单节点
    var rb = (cs > 0) ? Math.max(3, Math.min(R, cs * 0.4)) : R, offx = (W - sx * cs) / 2, offy = (H - sy * cs) / 2, at = {};
    for (idk in cell) { c2 = cell[idk]; at[idk] = (cs > 0) ? { x: offx + (c2[0] - minx) * cs, y: offy + (c2[1] - miny) * cs } : { x: W / 2, y: H / 2 }; }
    return { at: at, r: rb };
  }

  // 纯函数:当前地图的节点布局 + 同图连接连线 + 当前节点高亮 → SVG 字符串。无位置/空图 → ''。
  // opts(可选):
  //   layout:'ring'(调试视图,环形,查节点设计/死链) | 'spatial'(玩家视图,优先 node.map、全缺回退 ring)
  //   fog:'hide'(玩家视图默认:严格只显已探索/当前) | 'frontier'(+ 一度出口邻居〔未探索·CSS 淡显〕,二度+ 不画) | 'off'/缺省(全画;data-seen 交 CSS 淡显)
  //   glyph:'circle'(默认,圆点·按 node.map 直线连接) | 'box'(方块房间=**方向驱动网格布局**〔boxGridLayout〕 + rect + 正交肘形走廊;连接可标 `dir` 覆盖、缺省由 node.map 推断方向)
  //   state:当前 state——**实时锁定**(算门控)+ 探索雾;缺省则锁定退化为结构性、雾全无
  // 语义钩子(交 CSS 发挥):节点形状(circle 或 rect)带 data-node/data-current/data-seen → **着色用 `[data-node]`/`[data-current]` 选属性、不绑标签**(圆/方都命中);标签 text.amatlas-node-label(hover 显、当前常显);连线 data-locked(实时:门控当前为假)。
  function buildMinimapSVG(world, pos, opts) {
    if (!world || !world.maps || !pos || !world.maps[pos.map]) return '';
    var nodes = world.maps[pos.map].nodes || {}, ids = Object.keys(nodes);
    if (!ids.length) return '';
    opts = opts || {};
    var W = 120, H = 120, R = 8, state = opts.state || null;
    var seen = (state && state.seen) || {}, fog = opts.fog, glyph = opts.glyph === 'box' ? 'box' : 'circle';
    // 密度自适应半径(round10 showcase《奥术神座》:1 图 39 节点、作者坐标已满铺 x:[5,100] y:[10,96] 仍"挤"——
    //   根因**不是坐标聚集**〔拉伸归一无效〕,是 n×(2R+2)² 超画布容量:39×18²=12636 > 可用 96²,固定 R=8 只为
    //   ~10 节点小图设计,relaxOverlap 推不开只能留 ~1px 缝)。网格估算每节点可分格边 cell≈usable/√n,
    //   R=(cell-gap)/2 夹 [3,8]:**n≤28 → gap=2、R=8 与旧值逐字节一致(demo/旧测试零回归)**;大图 gap=6
    //   (round11《奥术之始》51 节点实测 gap=2 仍贴边连串=packing 近饱和)→ 39→4、51→3=真留白。
    //   minDist=2R+2 同步缩 → 满铺坐标几乎不再被强推 = 更忠实作者布局。box 不走此路(boxGridLayout 自带密度缩放 rb)。
    if (glyph !== 'box') {
      var cell = (W - 2 * (R + 4)) / Math.sqrt(ids.length);
      var gap = ids.length > 28 ? 6 : 2;
      R = Math.max(3, Math.min(R, Math.floor((cell - gap) / 2)));
    }
    var margin = R + 4;
    // 布局:box → 方向驱动网格(boxGridLayout,返回位置 + 房间半尺寸);否则 spatial(node.map)/ring。
    var boxLay = (glyph === 'box') ? boxGridLayout(world, nodes, ids, pos, W, H, R, margin) : null;
    var at = boxLay ? boxLay.at : layoutNodes(nodes, ids, opts.layout === 'spatial', W, H, margin, 2 * R + 2);
    var nodeR = boxLay ? boxLay.r : R;
    // 探索雾可见集:'frontier'(已探索/当前 + 其**一度**出口邻居〔未探索→CSS 淡显〕,**二度+ 不画**)/
    //   'hide'(严格:仅已探索/当前)/ 其它(全画)。vis=null 表全可见。
    var vis = null;
    if (fog === 'hide' || fog === 'frontier') {
      vis = {};
      var seed = [];                                             // 种子=已探索/当前节点
      for (var v = 0; v < ids.length; v++) { if (ids[v] === pos.node || seen[pos.map + '/' + ids[v]]) { vis[ids[v]] = 1; seed.push(ids[v]); } }
      if (fog === 'frontier') {                                  // 只加种子的一度出口目标(不递归 → 二度不显)
        for (var f = 0; f < seed.length; f++) {
          var fc = [].concat(nodes[seed[f]].exits || [], nodes[seed[f]].links || []);
          for (var g = 0; g < fc.length; g++) { var ft = fc[g] && fc[g].to; if (typeof ft === 'string' && nodes[ft]) vis[ft] = 1; }
        }
      }
    }
    function shown(id) { return !vis || !!vis[id]; }
    // 实时锁定:镜像 engine-core 的门控求值(link.requires / exit.available 都是 (state)=>bool)。
    //   有 state → 调门控、为假=当前锁;无 state(纯函数 / start 前)→ 结构性回退(有门控即显锁、不调函数防抛)。
    //   地图是**装饰派生、非门控**(见顶部):门控抛错时降级显锁、绝不让地图崩掉整局(真错由引擎严格门控暴露)。
    function isLocked(c) {
      var fn = (typeof c.requires === 'function') ? c.requires : (typeof c.available === 'function' ? c.available : null);
      if (!fn) return false;
      if (!state) return true;
      try { return !fn(state); } catch (e) { return true; }
    }
    var p = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" class="amatlas-minimap">'];
    for (var i = 0; i < ids.length; i++) {                       // 连线:exits + links 的同图 string 引用(两端都画才画;实时锁 → data-locked)
      if (!shown(ids[i])) continue;
      var n = nodes[ids[i]], from = at[ids[i]], conns = [].concat(n.exits || [], n.links || []);
      for (var j = 0; j < conns.length; j++) {
        var c = conns[j], to = c && c.to, tid = (typeof to === 'string') ? to : null;
        if (!(tid && at[tid] && shown(tid))) continue;
        var b = at[tid], lk = isLocked(c) ? ' data-locked="1"' : '';
        if (glyph === 'box') {                                   // 方块房间=正交肘形走廊(横→竖→横,过竖中线;双向精确重合,盒子盖住中心残段=边到边)
          var mx = ((from.x + b.x) / 2).toFixed(1), fx = from.x.toFixed(1), fy = from.y.toFixed(1), bx = b.x.toFixed(1), by = b.y.toFixed(1);
          p.push('<line x1="' + fx + '" y1="' + fy + '" x2="' + mx + '" y2="' + fy + '" stroke="#456" stroke-width="1"' + lk + '/>');
          p.push('<line x1="' + mx + '" y1="' + fy + '" x2="' + mx + '" y2="' + by + '" stroke="#456" stroke-width="1"' + lk + '/>');
          p.push('<line x1="' + mx + '" y1="' + by + '" x2="' + bx + '" y2="' + by + '" stroke="#456" stroke-width="1"' + lk + '/>');
        } else {
          p.push('<line x1="' + from.x.toFixed(1) + '" y1="' + from.y.toFixed(1) + '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) + '" stroke="#456" stroke-width="1"' + lk + '/>');
        }
      }
    }
    // 节点拆双层(端用户实测:标签在各节点自己的 <g> 里 → SVG 纯画序,后画节点的圆会盖住先画节点的标签):
    //   下层 = 可见形状(data-node/data-current/data-seen 钩子在此,换皮属性选择器不变);
    //   顶层 = <g.amatlas-node>(透明命中区 + 标签)统一排在所有形状之后 → 标签永不被任何节点圆遮挡,
    //   CSS `.amatlas-node:hover .amatlas-node-label` 语义照旧(命中区与标签同组)。命中区 fill=transparent
    //   (接收 pointer-events;fill=none 不接)且**不带 data 钩子**(防换皮 [data-current]{fill} 把透明层双涂)。
    var topLabels = [];
    for (var i = 0; i < ids.length; i++) {
      if (!shown(ids[i])) continue;
      var pt = at[ids[i]], cur = (ids[i] === pos.node), wasSeen = !!seen[pos.map + '/' + ids[i]], nd = nodes[ids[i]];
      var label = nd.title != null ? nd.title : (nd.name != null ? nd.name : ids[i]);
      var ly = (pt.y > H * 0.66) ? (pt.y - nodeR - 4) : (pt.y + nodeR + 8);   // 底部节点标签上移,避开 viewBox 裁切
      var fill = cur ? '#b89b6a' : '#22314a';                    // 着色由属性给(无 CSS 也有底色);皮再用 [data-node]/[data-current] 钩子加强
      var hooks = ' data-node="' + esc(ids[i]) + '"' + (cur ? ' data-current="1"' : '') + (wasSeen ? ' data-seen="1"' : '');
      var shape = (glyph === 'box')                              // box=方块房间(rect,网格布局见 boxGridLayout;连线走正交肘形)。缺省 circle
        ? '<rect x="' + (pt.x - nodeR).toFixed(1) + '" y="' + (pt.y - nodeR).toFixed(1) + '" width="' + (nodeR * 2).toFixed(1) + '" height="' + (nodeR * 2).toFixed(1) + '" rx="2" fill="' + fill + '" stroke="#89a" stroke-width="1"' + hooks + '/>'
        : '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="' + nodeR + '" fill="' + fill + '" stroke="#89a" stroke-width="1"' + hooks + '/>';
      // 命中区用 <path>(同 present-svg「纯 path 保精确计数」先例:circle/rect 计数 = 可见节点数,旧测试/换皮零影响)
      var hx = (pt.x - nodeR).toFixed(1), hr = nodeR, hit = (glyph === 'box')
        ? '<path d="M' + hx + ',' + (pt.y - nodeR).toFixed(1) + 'h' + (hr * 2) + 'v' + (hr * 2) + 'h-' + (hr * 2) + 'Z" fill="transparent" stroke="none"/>'
        : '<path d="M' + hx + ',' + pt.y.toFixed(1) + 'a' + hr + ',' + hr + ' 0 1,0 ' + (hr * 2) + ',0a' + hr + ',' + hr + ' 0 1,0 -' + (hr * 2) + ',0Z" fill="transparent" stroke="none"/>';
      p.push(shape);
      topLabels.push('<g class="amatlas-node">'
        + hit
        + '<text class="amatlas-node-label' + (cur ? ' current' : '') + '" x="' + pt.x.toFixed(1) + '" y="' + ly.toFixed(1) + '" font-size="5" text-anchor="middle">' + esc(label) + '</text>'
        + '</g>');
    }
    p.push(topLabels.join(''));                                  // 标签层最后画 = 永在最上(含当前节点常显标签)
    p.push('</svg>');
    return p.join('');
  }

  function createMinimapPlugin(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var mode = opts.mode || 'toggle';                    // 'toggle'(默认,🗺️ 按钮进工具栏)|'inline'(常驻插槽)
    var slot = opts.slot || '#plugin-minimap';           // inline 常驻插槽(toggle 无工具栏时也退化到这)
    var buttonSlot = opts.buttonSlot || '#plugin-bar';   // toggle 触发按钮的插槽
    var layout = opts.layout || 'spatial';               // **默认玩家视图**(给玩家好默认;无 node.map 静默回退 ring)。查结构传 layout:'ring'
    var fog = opts.fog || (layout === 'spatial' ? 'hide' : 'off');   // 玩家视图默认探索雾=严格只显已探索/当前;'frontier' 额外显一度邻居淡显(二度+ 不画)、'off' 全图
    var glyph = opts.glyph || 'circle';                  // 'circle'(默认,圆点)|'box'(方块房间)
    var api = null, btnEl = null, panelEl = null, closeEl = null, mapBox = null;

    function svg() { return buildMinimapSVG(api.world, api.state && api.state.pos, { layout: layout, fog: fog, glyph: glyph, state: api.state }); }
    // toggle 已挂 → 面板展开时才刷新(省渲染);否则(inline / toggle 无工具栏退化)→ 画常驻插槽。无 state(start 前)→ ''。
    function paint() {
      if (!doc || !api) return;
      if (panelEl) { if (!panelEl.hidden && mapBox) mapBox.innerHTML = svg(); return; }   // 只刷新地图容器、不覆盖 ✕ 关闭按钮
      var el = doc.querySelector(slot); if (el) el.innerHTML = svg();
    }
    function mountToggle() {                              // 抄 achievement:🗺️ 按钮(进 #plugin-bar)+ toggle 面板
      var bar = doc.querySelector(buttonSlot); if (!bar) return;          // 无工具栏 → panelEl 仍 null → paint 退化常驻
      injectStyles(doc);   // 自带默认样式(工具栏按钮/浮窗/SVG 锁线/雾/标签不裸;作者 .amatlas-* 覆盖换皮)
      btnEl = doc.createElement('button'); btnEl.className = 'amatlas-plugin-btn amatlas-map-btn'; btnEl.textContent = '🗺️ 地图';
      panelEl = doc.createElement('div'); panelEl.className = 'amatlas-plugin-panel amatlas-map-panel'; panelEl.hidden = true;
      closeEl = doc.createElement('button'); closeEl.className = 'amatlas-plugin-close'; closeEl.textContent = '✕'; closeEl.setAttribute('title', '关闭'); closeEl.onclick = function () { panelEl.hidden = true; };   // ✕ 关浮窗(对齐 save/achievement;此前 minimap 漏了关闭按钮)
      mapBox = doc.createElement('div');   // 地图内容容器:与 ✕ 分离 → svg 刷新只更新它、不覆盖关闭按钮(旧版 panelEl.innerHTML=svg() 会把 ✕ 冲掉)
      panelEl.appendChild(closeEl); panelEl.appendChild(mapBox);
      btnEl.onclick = function () { panelEl.hidden = !panelEl.hidden; if (!panelEl.hidden) mapBox.innerHTML = svg(); };
      bar.appendChild(btnEl); bar.appendChild(panelEl);
    }
    return {
      id: 'minimap',
      install: function (a) {
        api = a;
        if (mode === 'toggle' && doc) mountToggle();     // 失败(无 #plugin-bar)→ panelEl 仍 null → paint 退化常驻 #plugin-minimap
        // round10:重绘改订 render 广播(enter/action/load/reset 后必到)> 仅 'enter'——load/loadLocal 不发 enter
        //   (engine-core 有意防读档污染 seen),旧订阅读档后常驻地图/开着的面板停在旧位置;action 改门控后锁线也即时跟随。
        //   无 doc → 不注册 presenter(不强迫 logic-only 引擎在 render 时跑 view 分派,保契约旧语义),维持旧 enter 订阅。
        if (doc && typeof a.addPresenter === 'function') a.addPresenter(function () { paint(); });
        else a.on('enter', paint);
        paint();
      },
      buildSVG: buildMinimapSVG, paint: paint
    };
  }

  return { createMinimapPlugin: createMinimapPlugin, buildMinimapSVG: buildMinimapSVG };
});
