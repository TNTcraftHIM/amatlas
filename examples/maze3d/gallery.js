/* eslint-env browser */
(function () {
  'use strict';

  var A = window.Amatlas || {};
  var root = document.getElementById('gallery');
  var nav = document.querySelector('.tabs');
  var CARD_W = 260;
  var CARD_H = 162;

  var groups = [
    { id: 'themes', label: '主题', title: '主题总览', note: '每张卡展示 theme 默认墙色、地板、天花、门样式和少量默认装饰。' },
    { id: 'walls', label: '墙壁', title: '墙壁基础贴图 wallTex', note: '固定视角和基础色,只换墙面材质,方便横向比较。' },
    { id: 'floors', label: '地板', title: '地板基础贴图 floorTex', note: '地板线来自 world-space floor-cast;是脚下透视参照,不是可拾取物。' },
    { id: 'ceilings', label: '天花', title: '天花基础贴图 ceilTex', note: '当前 maze3d 只有天花基础纹理,没有独立 ceilingDecor 字段。' },
    { id: 'wall-decor', label: '墙饰', title: '墙面附加物 wallDecor', note: '显式贴在正前方墙上;torch 现在包含火芯和局部暖色 halo。' },
    { id: 'floor-decor', label: '地杂物', title: '地面环境杂物 decor family', note: '这些是低矮背景杂物,不可拾取、不 bob、不 fullbright。' },
    { id: 'semantics', label: '机关', title: '功能性视觉语义 events[i].visual', note: 'pickup 是显眼关键物;floor/wall-pickup 是贴近才拿的隐藏普通物;marker/plate/trap 是贴地机关。' },
    { id: 'structure', label: '结构', title: '出口 / 柱子结构素材', note: '出口样式可用 maze.exitStyle 单迷宫覆盖;柱子是纯视觉地标,不参与碰撞或追逐。' }
  ];

  var themeNames = ['', 'cave', 'dungeon', 'shoji', 'flesh', 'metal', 'station', 'ice', 'clinic', 'industrial', 'tomb', 'crystal', 'neon', 'submarine'];
  var wallTex = ['none', 'brick', 'stone', 'tile', 'smalltile', 'wood', 'shoji', 'flesh', 'circuit', 'panel', 'hull', 'sandstone', 'crystal', 'ice', 'plate'];
  var floorTex = ['slab', 'tile', 'panel', 'crack'];
  var ceilTex = ['slab', 'beam', 'rib', 'panel'];
  var wallDecor = ['vines', 'tentacle', 'crack', 'arms', 'torch', 'cables', 'chains', 'pipes', 'vent', 'posters', 'growth', 'veins', 'sigil', 'eyes', 'teeth', 'crystals'];
  var floorDecor = ['bone_shards', 'rubble', 'paper_scrap', 'cable_coil', 'moss_patch', 'flesh_nodule', 'crystal_cluster', 'glass_shards', 'rust_scraps', 'wood_splinters', 'cloth_rags', 'ash_pile', 'ice_chips', 'bio_film', 'ritual_marks'];
  var semantics = ['pickup', 'floor-pickup', 'wall-pickup', 'marker', 'plate', 'trap'];
  var pillarStyles = ['stone', 'ruined', 'obelisk', 'crystal', 'wood', 'metal'];
  var exitStyles = ['glow', 'portcullis', 'iron-bars', 'shoji', 'sphincter', 'blast-door', 'archway', 'portal', 'stairs', 'elevator', 'wheel-hatch'];

  function stageId(name, idx) { return 'maze-gallery-' + name.replace(/[^a-z0-9]+/gi, '-') + '-' + idx; }
  function baseWorld(id, maze) {
    return { id: '77777777-7777-4777-8777-777777777777', start: { map: 'm', node: 'preview' }, maps: { m: { nodes: { preview: { kind: 'maze3d', title: id, stageId: id, maze: maze } } } } };
  }
  function gridDoorFront() { return ['#######', '#.....#', '#.P..D#', '#.....#', '#######']; }
  function gridWallFront() { return ['#####', '#...#', '#.P.#', '#...#', '#####']; }
  function gridLongView() { return ['#############', '#...........#', '#...........#', '#.P.........#', '#...........#', '#...........#', '#############']; }
  function commonMaze(extra) {
    var m = { grid: gridWallFront(), start: { x: 2, y: 2, dir: 'N' }, theme: 'dungeon', monsters: [], flatWalls: true, decorDensity: 0, wallDecorDensity: 0 };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
    return m;
  }
  function planeMaze(extra) {                         // floorTex/ceilTex 看的是天地面,用长廊视角拉开透视;近墙视角会把画面误读成 wallTex。
    var m = commonMaze({ grid: gridLongView(), start: { x: 2, y: 3, dir: 'E' }, flatWalls: true, decorDensity: 0, wallDecorDensity: 0 });
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
    return m;
  }
  function cardSpec(group, name, code, maze, note) { return { group: group, name: name, code: code, maze: maze, note: note || '' }; }

  var specs = [];
  themeNames.forEach(function (name) {
    specs.push(cardSpec('themes', name || 'default', 'maze.theme: ' + JSON.stringify(name || ''), commonMaze({ theme: name, flatWalls: false, decorDensity: 0.08, maxDecor: 6, wallDecorDensity: 0.18, maxWallDecor: 8 }), '主题默认素材池与门/雾色协调展示。'));
  });
  wallTex.forEach(function (name) {
    specs.push(cardSpec('walls', name, 'wallTex: ' + JSON.stringify(name), commonMaze({ theme: 'dungeon', wallTex: name, wearLevel: name === 'none' ? 0 : 0.5 }), '只换墙面基础材质。'));
  });
  floorTex.forEach(function (name) {
    specs.push(cardSpec('floors', name, 'floorTex: ' + JSON.stringify(name), planeMaze({ theme: 'cave', floorTex: name, ceilTex: null, floorLineK: 0.64, wallTex: 'none' }), '长廊视角突出脚下地板结构线。'));
  });
  ceilTex.forEach(function (name) {
    specs.push(cardSpec('ceilings', name, 'ceilTex: ' + JSON.stringify(name), planeMaze({ theme: 'dungeon', ceilTex: name, floorTex: null, wallTex: 'none' }), '长廊视角突出头顶天花纹理;无独立 ceilingDecor 字段。'));
  });
  wallDecor.forEach(function (name) {
    var wTheme = name === 'tentacle' || name === 'veins' || name === 'eyes' || name === 'teeth' ? 'flesh' : name === 'cables' || name === 'pipes' || name === 'vent' ? 'metal' : name === 'crystals' ? 'crystal' : name === 'sigil' ? 'dungeon' : 'dungeon';
    var wNote = name === 'torch' ? '火把含火芯、外圈暖色 halo 与贴墙暖光。' : name === 'crack' ? '裂缝有可读断面高光,但不是光源。' : name === 'sigil' ? '低亮墙面刻印,不要混成功能 marker。' : name === 'eyes' ? '肉壁暗孔/湿亮眼点,适合低密度显式摆放。' : name === 'teeth' ? '齿状骨刺/肉刺,冲击强,优先显式使用。' : name === 'crystals' ? '半透明切面晶簇,角状分层收窄=挺立感(区别 growth 的圆润蔓延)。' : '显式贴墙装饰。';
    specs.push(cardSpec('wall-decor', name, 'wallDecor.kind: ' + JSON.stringify(name), commonMaze({ theme: wTheme, wallDecor: [{ x: 2, y: 0, face: 'S', kind: name, u: 0.5, v: 0.28, scale: 1.18 }] }), wNote));
  });
  floorDecor.forEach(function (name) {
    specs.push(cardSpec('floor-decor', name, 'decor.icon: ' + JSON.stringify(name), commonMaze({ theme: name === 'flesh_nodule' || name === 'bio_film' ? 'flesh' : name === 'ice_chips' ? 'ice' : name === 'cable_coil' || name === 'rust_scraps' || name === 'glass_shards' ? 'metal' : 'dungeon', decor: [{ x: 2, y: 1, icon: name, scale: 1.25 }] }), name === 'ritual_marks' ? '低亮仪式残痕,是背景 decor,不是发光机关。' : '贴地背景杂物 family。'));
  });
  semantics.forEach(function (name) {
    var ev = { x: 2, y: 1, visual: name, once: false, hint: name };
    var mazeExtra = { theme: name === 'trap' ? 'dungeon' : 'cave', events: [ev] };
    var note = '贴地触发结构。';
    if (name === 'pickup') { ev.icon = 'gem'; note = '显眼关键物:独立 token,远处也该一眼看见。'; }
    if (name === 'floor-pickup') { ev.icon = 'ritual_marks'; note = '地面嵌入式隐藏物:低调但可发现,贴近中心才拿。'; }
    if (name === 'wall-pickup') { ev.icon = 'scroll'; ev.face = 'N'; note = '墙壁嵌入式隐藏物:在相邻墙面,面向并贴近才拿。'; }
    if (name === 'marker') ev.set = [{ x: 3, y: 1, ch: '.' }];
    if (name === 'plate') ev.set = [{ x: 3, y: 1, ch: '.' }];
    if (name === 'trap') ev.run = function (S) { S.galleryTrap = true; };
    specs.push(cardSpec('semantics', name, 'events[i].visual: ' + JSON.stringify(name), commonMaze(mazeExtra), note));
  });
  exitStyles.forEach(function (name) {
    var eTheme = name === 'shoji' ? 'shoji' : name === 'sphincter' ? 'flesh' : name === 'blast-door' || name === 'elevator' ? 'metal' : name === 'portal' ? 'ice' : name === 'stairs' || name === 'archway' || name === 'portcullis' ? 'cave' : name === 'wheel-hatch' ? 'submarine' : 'dungeon';
    specs.push(cardSpec('structure', 'exit: ' + name, 'maze.exitStyle: ' + JSON.stringify(name), commonMaze({ grid: gridDoorFront(), start: { x: 2, y: 2, dir: 'E' }, theme: eTheme, exitStyle: name, flatWalls: false }), '正前方出口样式;仍是 D 门、走近正对通关,只换视觉类型。'));
  });
  pillarStyles.forEach(function (name) {
    specs.push(cardSpec('structure', 'pillar: ' + name, 'maze.pillarStyle: ' + JSON.stringify(name), commonMaze({ theme: name === 'crystal' ? 'ice' : name === 'metal' ? 'metal' : name === 'wood' ? 'shoji' : 'cave', pillars: [{ x: 2, y: 1, style: name, scale: 0.95 }], pillarStyle: name, wallTex: 'none', decorDensity: 0, wallDecorDensity: 0 }), '内置柱子样式:纯视觉地标,不挡路、不拾取。'));
  });
  specs.push(cardSpec('structure', 'pillars: mixed', 'maze.pillars[].style', commonMaze({ theme: 'cave', grid: ['#######', '#.....#', '#.P...#', '#.....#', '#######'], start: { x: 2, y: 2, dir: 'E' }, pillars: [{ x: 4, y: 1, style: 'stone', scale: 0.85 }, { x: 5, y: 2, style: 'crystal', scale: 0.80 }, { x: 4, y: 3, style: 'metal', scale: 0.75 }], pillarStyle: 'ruined', wallTex: 'none', decorDensity: 0, wallDecorDensity: 0 }), '同一迷宫里每根柱子可单独覆盖 style/scale;仍只是地标。'));

  function makeCard(spec, idx) {
    var id = stageId(spec.group + '-' + spec.name, idx);
    var card = document.createElement('article');
    card.className = 'card';
    card.dataset.group = spec.group;
    card.innerHTML = '<div class="shot"><div id="' + id + '"></div></div><div class="meta"><strong></strong><code></code><p></p></div>';
    card.querySelector('strong').textContent = spec.name;
    card.querySelector('code').textContent = spec.code;
    card.querySelector('p').textContent = spec.note;
    root.querySelector('[data-section="' + spec.group + '"] .grid').appendChild(card);

    var world = baseWorld(id, spec.maze);
    var engine = A.createEngine(world, { storage: null });   // Gallery 卡片无持久化；固定 world.id 只满足可运行 world 契约。
    engine.use(A.Maze3d.createMaze3dModule({ stageId: id, width: CARD_W, height: CARD_H, fullscreen: false, controls: false, audio: false, staticPreview: true }));
    engine.start();
  }

  function build() {
    if (!root || !nav || !A.createEngine || !A.Maze3d || !A.Maze3d.createMaze3dModule) {
      var e = document.createElement('div'); e.className = 'error'; e.textContent = 'maze3d gallery 启动失败:缺少 Amatlas core 或 Maze3d runtime。'; document.body.appendChild(e); return;
    }
    nav.innerHTML = '<button type="button" data-filter="all" aria-pressed="true">全部</button>' + groups.map(function (g) { return '<button type="button" data-filter="' + g.id + '" aria-pressed="false">' + g.label + '</button>'; }).join('');
    root.innerHTML = groups.map(function (g) { return '<section data-section="' + g.id + '"><h2>' + g.title + '</h2><p class="section-note">' + g.note + '</p><div class="grid"></div></section>'; }).join('');
    specs.forEach(makeCard);
    nav.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest('button[data-filter]'); if (!b) return;
      var f = b.getAttribute('data-filter');
      Array.prototype.forEach.call(nav.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      Array.prototype.forEach.call(root.querySelectorAll('section'), function (s) { s.classList.toggle('hidden', f !== 'all' && s.dataset.section !== f); });
    });
  }

  build();
})();
