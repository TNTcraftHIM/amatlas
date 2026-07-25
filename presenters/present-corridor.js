/* ════════════════════════════════════════════════════════════════════════
   Amatlas 可插拔表现层 · 第一人称走廊呈现器 (presenters/present-corridor.js)
   ════════════════════════════════════════════════════════════════════════
   消费 View 的 **maze 意图**(伪 3D 网格迷宫模块产出;设计稿 docs/maze-module-design.md §3-§4),
   程序化画一帧 **第一人称走廊 SVG**(Wizardry / Dungeon Master 式块格地牢视图)。
   **意图非素材**:迷宫模块只产"投影数据"(`{facing, depths:[{left,right,front,content?},…]}`),
   本呈现器负责把它画成透视走廊;模块/世界数据里不出现任何 SVG、不含动画代码。

   **类型无关 · 可插拔表现层**:任何模块只要在 render 里产出 `view.maze`,本呈现器即可消费;故住
   `engine/presenters/`(与 present-svg / present-dom / present-audio 同列)。core 仍 DOM-free。
   **与 present-svg 共用 #scene 各画各的**:本呈现器无 `view.maze` → no-op(return),让 present-svg
   消费非迷宫节点的 `view.scene`;反之 present-svg 见迷宫节点无 `scene` → 清空。两者按注册顺序广播、
   各取所需字段(契约 §4.6 多呈现器:"各自取所需字段,互不覆盖")。同一槽位由后注册者最终决定 innerHTML,
   故迷宫游戏应**只挂本呈现器**(或让 present-svg 后挂、迷宫节点不写 scene → present-svg 清空、走廊先被冲掉);
   最稳妥 = 迷宫游戏单挂 present-corridor。

   投影几何(本文件核心难点;原型已 node 验证,见提交说明):
     画布 W×H(320×180),消失点在画布中心 (CX,CY)=(160,90)。遍历 `view.maze.depths`,
     第 d 层(d=0 = 玩家当前格)用收敛比例 **s(d)=1/(d+1)** 定义该层在屏上的「画面框」(inner rim 矩形):
       左/右内沿 x = CX ∓ halfW·s(d)   (halfW=W/2=160)
       上/下内沿 y = CY ∓ halfH·s(d)   (halfH=H/2=90)
     于是 d=0 框 = 整块画布(最近格的画面边沿就是屏幕边),越深的框越向中心收缩 → 远小近大透视。
     相邻两层(d 与 d+1)的框之间填充三类面:
       · 地板带 = 两框【下沿】围成的梯形;天花带 = 两框【上沿】围成的梯形;
       · 左侧:seg.left=true → 画左实墙梯形(连接 d 与 d+1 框的左内沿四点);
               seg.left=false → 画"侧开口"(同几何但派生**暗**色 = 进深的暗凹,不封实墙)+ 阈线标门槛;
       · 右侧:seg.right 同理(镜像)。
     遇 front 层(seg.front=true)→ 在【该层的框】处画前墙矩形封住走廊尽头,并停止更深的层。
   派生色(地板/天花/墙):**近亮远暗**(沿深度衰减明度,模拟纵深大气透视);**确定性、静态**(MVP 无动画/无随机)。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).CorridorPresenter = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var W = 320, H = 180;                 // 走廊画布(viewBox);随容器缩放(preserveAspectRatio slice)
  var CX = W / 2, CY = H / 2;           // 消失点 = 画布中心 (160,90)
  var halfW = W / 2, halfH = H / 2;     // 最近层(d=0,s=1)的框 = 整块画布:左右内沿落屏幕边、上下内沿落屏幕边

  // 基础派生色(走廊三大面 + 尽头墙);**绝不写字面 #000**——天花用接近黑但派生的深褐 #2a2622(同 present-svg
  // 的 room 基色),墙/地板用中性石色。fill 随深度衰减做"近亮远暗"。这些是"意图→视觉"的呈现器决定、可换。
  var WALL_BASE  = '#5a5346';   // 侧墙基色(石灰岩;近处明)
  var FLOOR_BASE = '#3a352c';   // 地板基色(比墙暗、偏暖)
  var CEIL_BASE  = '#2a2622';   // 天花基色(最暗、与 present-svg room 一致;非 #000)
  var OPEN_BASE  = '#1f1c18';   // 侧开口/进深暗凹基色(比天花更暗的派生色 = 暗处;非 #000)
  var EDGE       = '#1c1813';   // 棱线描边(派生极深褐,勾勒透视轮廓;非 #000)

  // round13:移动/转向【入场动画】(SMIL 声明式,同 present-svg 骰子/天气的非-rAF 路线;端用户要"3D 引擎推进感")。
  //   只包住走廊内容的 <g>(背景 rect 在组外不动);**停止态 = identity = 正确静帧**(fill="freeze");
  //   reduced-motion 由 present() 剥掉 <animateTransform> → 直接落静帧(无障碍 + 探针/烟雾落定帧)。
  var EASE = 'calcMode="spline" keySplines="0.16 0.84 0.3 1"';   // ease-out:起步快、收尾缓
  var MOVE_ANIM = {
    // 前进:从消失点(画布中心)放大冲入 = 推进感。scale 0.6→1 约中心(平移 = C·(1-s) = (64,36)→0 与 scale 复合 → 中心不动的缩放)
    forward: '<animateTransform attributeName="transform" type="translate" additive="sum" from="64 36" to="0 0" dur="0.26s" ' + EASE + ' fill="freeze"/>'
           + '<animateTransform attributeName="transform" type="scale" additive="sum" from="0.6" to="1" dur="0.26s" ' + EASE + ' fill="freeze"/>',
    // 左转:走廊从左滑入 + 微逆时针回正(绕中心 160,90)= 转身扫视
    left: '<animateTransform attributeName="transform" type="translate" additive="sum" from="-46 0" to="0 0" dur="0.2s" ' + EASE + ' fill="freeze"/>'
        + '<animateTransform attributeName="transform" type="rotate" additive="sum" from="-6 160 90" to="0 160 90" dur="0.2s" ' + EASE + ' fill="freeze"/>',
    // 右转:镜像(从右滑入 + 微顺时针回正)
    right: '<animateTransform attributeName="transform" type="translate" additive="sum" from="46 0" to="0 0" dur="0.2s" ' + EASE + ' fill="freeze"/>'
         + '<animateTransform attributeName="transform" type="rotate" additive="sum" from="6 160 90" to="0 160 90" dur="0.2s" ' + EASE + ' fill="freeze"/>',
    // 后转:急推回正(scale 1.12→1 约中心)= 180° 转身的一下眩晕
    back: '<animateTransform attributeName="transform" type="translate" additive="sum" from="-19.2 -10.8" to="0 0" dur="0.22s" ' + EASE + ' fill="freeze"/>'
        + '<animateTransform attributeName="transform" type="scale" additive="sum" from="1.12" to="1" dur="0.22s" ' + EASE + ' fill="freeze"/>'
  };

  // 明度调整(amt 正→提亮、负→压暗);只处理 #rrggbb(本文件所有基色皆是)。逐字沿用 present-svg.shade,
  // 保持两呈现器的色彩派生口径一致(同一套"派生深色"惯例)。
  function shade(hex, amt) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return hex;
    function ch(h) { var v = parseInt(h, 16); v = amt >= 0 ? v + (255 - v) * amt : v * (1 + amt); v = Math.max(0, Math.min(255, Math.round(v))); return ('0' + v.toString(16)).slice(-2); }
    return '#' + ch(m[1]) + ch(m[2]) + ch(m[3]);
  }
  // 深度衰减:k = s(d)∈(0,1],k 大=近=亮、k 小=远=暗。把基色按"离最近的远近"压暗(near k≈1 几乎不动、
  //   far k→0 压到约 -0.6)。模拟大气/光照纵深。纯函数 → 同输入同输出(确定性)。
  function fade(base, k) {
    var amt = -(1 - Math.max(0, Math.min(1, k))) * 0.62;   // k=1→0(不动);k→0→ -0.62(显著压暗)
    return shade(base, amt);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 第 d 层的「画面框」(inner rim 矩形,屏幕坐标)。s(d)=1/(d+1):d=0→s=1(整屏)、d=1→0.5、d=2→0.333…
  //   → 各框同心向 (CX,CY) 收敛 = 透视消失点。返回 {l,r,t,b,k}(k=该层收敛比例,供 fade 选明度)。
  function frameAt(d) {
    var k = 1 / (d + 1);
    return {
      l: CX - halfW * k, r: CX + halfW * k,
      t: CY - halfH * k, b: CY + halfH * k,
      k: k
    };
  }
  // 一个四边形 polygon(顶点数组 → points 串;坐标 .toFixed(1) 量化保确定性)。
  function quad(pts, fill, stroke) {
    var s = '';
    for (var i = 0; i < pts.length; i++) s += (i ? ' ' : '') + pts[i][0].toFixed(1) + ',' + pts[i][1].toFixed(1);
    return '<polygon points="' + s + '" fill="' + fill + '"'
      + (stroke ? ' stroke="' + stroke + '" stroke-width="0.6"' : '') + '/>';
  }

  // ── 纯函数 buildCorridorSVG(maze)(导出供测试,同 present-svg.buildSceneSVG 先例)──────────────
  // maze = `view.maze` 意图:{ facing:0-3, depths:[ {left,right,front,content?}, … ] }。
  //   缺失 / depths 非数组 / 空 → 返回 ''(呈现器据此清空槽位;不抛 = 优雅退化)。
  function buildCorridorSVG(maze) {
    if (!maze || !Array.isArray(maze.depths)) return '';   // 非法/缺失输入 → no-op(present() 据此清空槽位)
    // 注:空 depths(退化但合法的迷宫意图)不早返回 → 下方仍输出 <svg> 骨架(背景),不留全空
    var depths = maze.depths;
    var p = [];
    p.push('<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" class="amatlas-corridor">');
    // 背景兜底(远处尽头的黑暗;若走廊不被前墙封住,最远层之外露出此底)。派生极深色,非 #000。
    p.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="' + shade(OPEN_BASE, -0.2) + '"/>');

    // 找前墙:第一个 front=true 的层即走廊尽头,之后的层不可见(被墙挡)。无 front → 画到 depths 末层。
    var frontAt = -1;
    for (var fi = 0; fi < depths.length; fi++) { if (depths[fi] && depths[fi].front) { frontAt = fi; break; } }
    var lastD = frontAt >= 0 ? frontAt : depths.length - 1;

    // **从远到近**绘制(painter's algorithm):远层先画、近层后画覆盖其上 → 正确遮挡 + 近大远小叠放。
    //   每层 d 填充 [d 框, d+1 框] 之间的天花/地板/左/右四条带。
    for (var d = lastD; d >= 0; d--) {
      var seg = depths[d] || {};
      var a = frameAt(d), b = frameAt(d + 1);   // a=近框(大)、b=远框(小)
      var kMid = (a.k + b.k) / 2;               // 该带中点深度 → 取明度(整带统一一档,避免相邻带跳变)
      var kFar = b.k;

      // 天花带:a 与 b 框【上沿】围成的梯形(near-top-L,near-top-R,far-top-R,far-top-L)
      p.push(quad([[a.l, a.t], [a.r, a.t], [b.r, b.t], [b.l, b.t]], fade(CEIL_BASE, kMid)));
      // 地板带:a 与 b 框【下沿】围成的梯形
      p.push(quad([[a.l, a.b], [a.r, a.b], [b.r, b.b], [b.l, b.b]], fade(FLOOR_BASE, kMid)));

      // 左侧:实墙 or 侧开口。两者**同一梯形几何**(连接 d 与 d+1 框的左内沿四点),区别在 fill:
      //   实墙 = 受光石色(fade WALL);开口 = 暗凹(fade OPEN,显著更暗 = "侧通道没入黑暗")+ 远沿阈线标门槛。
      var leftQuad = [[a.l, a.t], [b.l, b.t], [b.l, b.b], [a.l, a.b]];
      if (seg.left) {
        p.push(quad(leftQuad, fade(WALL_BASE, kMid)));
      } else {
        p.push(quad(leftQuad, fade(OPEN_BASE, kMid)));
        // 阈线:远框左沿的竖线 = "墙到此为止,通道往左延伸"的门槛感(派生深色描边,非 #000)。
        p.push('<line x1="' + b.l.toFixed(1) + '" y1="' + b.t.toFixed(1) + '" x2="' + b.l.toFixed(1) + '" y2="' + b.b.toFixed(1) + '" stroke="' + shade(EDGE, (1 - kFar) * -0.3) + '" stroke-width="1"/>');
      }
      // 右侧(镜像):实墙 or 侧开口
      var rightQuad = [[a.r, a.t], [b.r, b.t], [b.r, b.b], [a.r, a.b]];
      if (seg.right) {
        p.push(quad(rightQuad, fade(WALL_BASE, kMid)));
      } else {
        p.push(quad(rightQuad, fade(OPEN_BASE, kMid)));
        p.push('<line x1="' + b.r.toFixed(1) + '" y1="' + b.t.toFixed(1) + '" x2="' + b.r.toFixed(1) + '" y2="' + b.b.toFixed(1) + '" stroke="' + shade(EDGE, (1 - kFar) * -0.3) + '" stroke-width="1"/>');
      }
    }

    // 前墙:在 frontAt 层的框处画矩形封住尽头(前方一格是墙 → 走廊到此为止)。最暗墙色 + 描边勾轮廓。
    //   content 标记(door/exit)→ 在前墙上画一道门(让"可走出的出口格"有视觉提示;意图非素材)。
    if (frontAt >= 0) {
      var f = frameAt(frontAt);
      var fw = f.r - f.l, fh = f.b - f.t;
      p.push('<rect x="' + f.l.toFixed(1) + '" y="' + f.t.toFixed(1) + '" width="' + fw.toFixed(1) + '" height="' + fh.toFixed(1) + '" fill="' + fade(WALL_BASE, f.k) + '" stroke="' + EDGE + '" stroke-width="1"/>');
      var content = depths[frontAt] && depths[frontAt].content;
      if (content === 'door' || content === 'exit') {
        // 门:居中竖长方形 + 把手(派生木色 + 暖光);占前墙中部约 40% 宽、70% 高。
        var dw = fw * 0.4, dh = fh * 0.72;
        var dx = CX - dw / 2, dy = f.b - dh;   // 门底贴前墙底沿
        p.push('<rect x="' + dx.toFixed(1) + '" y="' + dy.toFixed(1) + '" width="' + dw.toFixed(1) + '" height="' + dh.toFixed(1) + '" rx="' + (dw * 0.12).toFixed(1) + '" fill="' + fade('#6b4a2b', f.k) + '" stroke="' + shade('#3a2a1a', 0) + '" stroke-width="0.8"/>');
        p.push('<circle cx="' + (dx + dw * 0.8).toFixed(1) + '" cy="' + (dy + dh * 0.5).toFixed(1) + '" r="' + Math.max(0.8, dw * 0.07).toFixed(1) + '" fill="' + fade('#e8c24a', f.k) + '"/>');
      }
    }

    p.push('</svg>');
    var svg = p.join('');
    // round13:有 move → 把走廊内容(背景 rect 之后、</svg> 之前)包进入场动画 <g>(背景 rect 留组外不动)。
    //   无 move(首屏/静态)→ 字节完全不变(旧测试 + 停止态守恒)。仅一次正则 wrap、确定性。
    var anim = maze.move && MOVE_ANIM[maze.move];
    if (anim) svg = svg.replace(/(<rect\b[^>]*\/>)([\s\S]*)(<\/svg>)$/, '$1<g class="amatlas-corridor-move">' + anim + '$2</g>$3');
    return svg;
  }

  // ── 呈现器:把走廊画进约定容器(slot 默认 '#scene';也可直接传 container 对象,便于测试)──────────
  // 无容器(没挂插槽)→ no-op:优雅退化为纯文字。无 `view.maze` → no-op:让 present-svg 等处理非迷宫节点
  //   (与 present-svg 共用 #scene 时,各画各的意图)。snap = view() 信封 {view, actions, pos}。
  function createCorridorPresenter(opts) {
    opts = opts || {};
    var doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var slot = opts.slot || '#scene';   // 挂载点参数统一为 slot(与 present-svg / save / minimap / achievement 一致)
    var lastSvg = null, lastSeq = -1;   // lastSvg:同帧字节相同省重排;lastSeq:迷宫步序号,变了=新一步 → 强制重渲染重播 SMIL
    function resolve() {
      if (opts.container) return opts.container;
      return doc ? doc.querySelector(slot) : null;
    }
    // 无障碍:prefers-reduced-motion 时剥掉 SMIL → <g> 落 identity = 静帧(同 present-svg 的 reduced-motion 处理)。
    function reduceMotion() {
      try { return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
      catch (e) { return false; }
    }
    function present(snap) {
      var maze = snap && snap.view && snap.view.maze;
      if (!maze) return;                // **无 maze 意图 → no-op**(契约 §4:让其它呈现器处理非迷宫节点)
      var el = resolve();
      if (!el) return;                  // 无插槽 → 退化,不画
      var svg = buildCorridorSVG(maze); // maze 形态非法(无 depths)→ '' → 清空(避免残留上一帧)
      if (svg && reduceMotion()) svg = svg.replace(/<animateTransform\b[^>]*\/>/g, '');   // 减少动效 → 去 SMIL、落静帧
      var seq = maze.seq || 0;
      // 新一步(seq 变)即便 SVG 字节相同(连续同向移动)也重渲染 → SMIL 重播;否则同状态重渲染走 dedup 不抢相位。
      if (svg !== lastSvg || seq !== lastSeq) { el.innerHTML = svg; lastSvg = svg; lastSeq = seq; }
    }
    return {
      id: 'corridor-presenter',
      install: function (api) { api.addPresenter(present); },   // 返回 use-able 插件 → engine.use(createCorridorPresenter(opts))
      present: present,
      buildSVG: buildCorridorSVG        // 暴露纯构造器(测试/复用;同 present-svg 的 buildSVG 别名)
    };
  }

  return { createCorridorPresenter: createCorridorPresenter, buildCorridorSVG: buildCorridorSVG };
});
