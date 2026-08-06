/* eslint-env browser */
(function (global, factory) {
  var inventory = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = inventory;
  else global.MAZE3D_GALLERY = inventory;
  if (global.document) inventory.mount(global);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var groups = [
    { id: 'recipes', label: '配方', title: '协调 Recipes', note: '整套复制的 theme + 材质 + 密度 + 显式装饰 + 出口/柱子组合；先选整套，再做局部调整。' },
    { id: 'combat', label: 'FPS', title: 'FPS Combat Theme Cards', note: '五张主题卡覆盖四个 family 与 crystal 特化；同一最小 precision/单 guard 场只换 maze.theme，枪体、准星、HUD、目标与 SFX 成套变化。' },
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
  function gridRecipe() { return ['#######', '#.....#', '#....D#', '#.....#', '#######']; }
  function commonMaze(extra) {
    var m = { grid: gridWallFront(), start: { x: 2, y: 2, dir: 'N' }, theme: 'dungeon', monsters: [], flatWalls: true, decorDensity: 0, wallDecorDensity: 0 };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
    return m;
  }
  function planeMaze(extra) {
    var m = commonMaze({ grid: gridLongView(), start: { x: 2, y: 3, dir: 'E' }, flatWalls: true, decorDensity: 0, wallDecorDensity: 0 });
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
    return m;
  }
  function recipeMaze(extra) {
    var m = { grid: gridRecipe(), start: { x: 2, y: 2, dir: 'E' }, flatWalls: false, decorDensity: 0.04, maxDecor: 4, wallDecorDensity: 0.08, maxWallDecor: 4 };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
    return m;
  }
  function cardSpec(group, name, maze, note, extra) {
    var spec = { group: group, name: name, maze: maze, note: note || '' };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) spec[k] = extra[k];
    return spec;
  }
  function combatPreviewMaze(theme) {
    return {
      grid: ['###########', '#.........#', '#.........#', '#.........#', '###########'],
      start: { x: 1, y: 2, dir: 'E' }, theme: theme, decorDensity: 0, wallDecorDensity: 0,
      combat: {
        deathKey: 'galleryCombatDeath', player: { maxHealth: 40, health: 40 },
        loadout: [{ kind: 'precision', ammo: 6, maxAmmo: 6 }], equipped: 'precision',
        guard: { x: 7, y: 2, hp: 40, hitRadius: 0.34, ai: { sight: 9, hear: 8, attackRange: 1.35, moveSpeed: 1, damage: 10, windup: 0.55, cooldown: 0.75 } }
      }
    };
  }
  function serializeMaze(maze) { return JSON.stringify(maze, null, 2); }
  function cardCode(spec) {
    return spec.group === 'combat'
      ? JSON.stringify({ theme: spec.maze.theme }, null, 2) + '\n\n// 完整可玩闭环：见 maze3d 作者手册 §7.1 / Recipe 5'
      : serializeMaze(spec.maze);
  }

  var specs = [];
  themeNames.forEach(function (name) {
    specs.push(cardSpec('themes', name || 'default', commonMaze({ theme: name, flatWalls: false, decorDensity: 0.08, maxDecor: 6, wallDecorDensity: 0.18, maxWallDecor: 8 }), '主题默认素材池与门/雾色协调展示。'));
  });

  [
    cardSpec('recipes', 'dungeon ritual hall', recipeMaze({ theme: 'dungeon', wallTex: 'stone', floorTex: 'slab', ceilTex: 'rib', wallDecor: [{ x: 6, y: 1, face: 'W', kind: 'sigil', u: 0.5, v: 0.30, scale: 1.2 }], decor: [{ x: 3, y: 2, icon: 'ritual_marks', scale: 1.15 }], exitStyle: 'portcullis', pillars: [{ x: 4, y: 1, style: 'ruined', scale: 0.82 }], pillarStyle: 'ruined' }), '仪式厅/地下圣所；局部改 decor 密度或显式 sigil，别换散整套。'),
    cardSpec('recipes', 'flesh nest corridor', recipeMaze({ theme: 'flesh', wallTex: 'flesh', floorTex: 'crack', ceilTex: 'rib', decorDensity: 0.10, maxDecor: 6, wallDecorDensity: 0.16, maxWallDecor: 7, wallDecor: [{ x: 6, y: 1, face: 'W', kind: 'teeth', u: 0.5, v: 0.26, scale: 1.12 }], decor: [{ x: 3, y: 2, icon: 'flesh_nodule', scale: 1.1 }], exitStyle: 'sphincter' }), '活体巢道/生物恐怖；保持低数量强轮廓，不堆满 teeth。'),
    cardSpec('recipes', 'industrial checkpoint', recipeMaze({ theme: 'industrial', wallTex: 'panel', floorTex: 'panel', ceilTex: 'beam', wallDecor: [{ x: 6, y: 1, face: 'W', kind: 'cables', u: 0.5, v: 0.24, scale: 1.05 }], decor: [{ x: 3, y: 2, icon: 'rust_scraps', scale: 1.0 }], exitStyle: 'blast-door', pillars: [{ x: 4, y: 1, style: 'metal', scale: 0.86 }], pillarStyle: 'metal' }), '工业检查站/军用设施；优先调整磨损和杂物数量。'),
    cardSpec('recipes', 'crystal observatory', recipeMaze({ theme: 'crystal', wallTex: 'crystal', floorTex: 'tile', ceilTex: 'panel', decorDensity: 0.06, maxDecor: 5, wallDecorDensity: 0.10, maxWallDecor: 5, wallDecor: [{ x: 6, y: 1, face: 'W', kind: 'crystals', u: 0.5, v: 0.24, scale: 1.16 }], decor: [{ x: 3, y: 2, icon: 'crystal_cluster', scale: 1.18 }], exitStyle: 'portal', pillars: [{ x: 4, y: 1, style: 'crystal', scale: 0.9 }], pillarStyle: 'crystal' }), '晶体观测厅/星图设施；保留 crystal 主题统一武器和HUD词汇。'),
    cardSpec('recipes', 'ice resource fork', recipeMaze({ theme: 'ice', wallTex: 'ice', floorTex: 'crack', ceilTex: 'slab', decorDensity: 0.08, maxDecor: 5, wallDecorDensity: 0.06, maxWallDecor: 3, wallDecor: [{ x: 6, y: 1, face: 'W', kind: 'crack', u: 0.5, v: 0.28, scale: 1.05 }], decor: [{ x: 3, y: 2, icon: 'ice_chips', scale: 1.18 }], exitStyle: 'stairs', pillars: [{ x: 4, y: 1, style: 'stone', scale: 0.78 }] }), '冰洞资源岔路/极地遗迹；用显式冰屑提示路径，避免高密度噪声。'),
    cardSpec('recipes', 'submarine maintenance hatch', recipeMaze({ theme: 'submarine', wallTex: 'hull', floorTex: 'panel', ceilTex: 'beam', decorDensity: 0.06, maxDecor: 4, wallDecorDensity: 0.12, maxWallDecor: 6, wallDecor: [{ x: 6, y: 1, face: 'W', kind: 'pipes', u: 0.5, v: 0.24, scale: 1.08 }], decor: [{ x: 3, y: 2, icon: 'cable_coil', scale: 1.08 }], exitStyle: 'wheel-hatch', pillars: [{ x: 4, y: 1, style: 'metal', scale: 0.8 }], pillarStyle: 'metal' }), '潜艇维修舱/水下工业；舱门、管线和缆线作为协调主语。')
  ].forEach(function (spec) { specs.push(spec); });

  [
    ['ordnance', 'industrial', '军械/工业主题；装甲目标、机械枪体与生存场HUD。'],
    ['relic', 'dungeon', '遗物/地牢主题；符文刻针、圣印准星与遗物守像。'],
    ['organic', 'flesh', '活体主题；骨针、孢囊语言与组织体目标。'],
    ['energy', 'neon', '能量主题；能量枪体、几何准星与节点目标。'],
    ['energy', 'crystal', 'energy行为家族的晶体特化；星图刻针、定序场HUD与独立星图画面。']
  ].forEach(function (item) { specs.push(cardSpec('combat', item[0] + ': ' + item[1], combatPreviewMaze(item[1]), item[2], { family: item[0], recipe: 'Recipe 5' })); });

  wallTex.forEach(function (name) {
    specs.push(cardSpec('walls', name, commonMaze({ theme: 'dungeon', wallTex: name, wearLevel: name === 'none' ? 0 : 0.5 }), '只换墙面基础材质。'));
  });
  floorTex.forEach(function (name) {
    specs.push(cardSpec('floors', name, planeMaze({ theme: 'cave', floorTex: name, ceilTex: null, floorLineK: 0.64, wallTex: 'none' }), '长廊视角突出脚下地板结构线。'));
  });
  ceilTex.forEach(function (name) {
    specs.push(cardSpec('ceilings', name, planeMaze({ theme: 'dungeon', ceilTex: name, floorTex: null, wallTex: 'none' }), '长廊视角突出头顶天花纹理;无独立 ceilingDecor 字段。'));
  });
  wallDecor.forEach(function (name) {
    var wTheme = name === 'tentacle' || name === 'veins' || name === 'eyes' || name === 'teeth' ? 'flesh' : name === 'cables' || name === 'pipes' || name === 'vent' ? 'metal' : name === 'crystals' ? 'crystal' : 'dungeon';
    var wNote = name === 'torch' ? '火把含火芯、外圈暖色 halo 与贴墙暖光。' : name === 'crack' ? '裂缝有可读断面高光,但不是光源。' : name === 'sigil' ? '低亮墙面刻印,不要混成功能 marker。' : name === 'eyes' ? '肉壁暗孔/湿亮眼点,适合低密度显式摆放。' : name === 'teeth' ? '齿状骨刺/肉刺,冲击强,优先显式使用。' : name === 'crystals' ? '半透明切面晶簇,角状分层收窄=挺立感(区别 growth 的圆润蔓延)。' : '显式贴墙装饰。';
    specs.push(cardSpec('wall-decor', name, commonMaze({ theme: wTheme, wallDecor: [{ x: 4, y: 1, face: 'W', kind: name, u: 0.5, v: 0.28, scale: 1.18 }] }), wNote));
  });
  floorDecor.forEach(function (name) {
    specs.push(cardSpec('floor-decor', name, commonMaze({ theme: name === 'flesh_nodule' || name === 'bio_film' ? 'flesh' : name === 'ice_chips' ? 'ice' : name === 'cable_coil' || name === 'rust_scraps' || name === 'glass_shards' ? 'metal' : 'dungeon', decor: [{ x: 2, y: 1, icon: name, scale: 1.25 }] }), name === 'ritual_marks' ? '低亮仪式残痕,是背景 decor,不是发光机关。' : '贴地背景杂物 family。'));
  });
  semantics.forEach(function (name) {
    var ev = { x: 2, y: 1, visual: name, once: false, hint: name };
    var mazeExtra = { theme: name === 'trap' ? 'dungeon' : 'cave', events: [ev] };
    var note = '贴地触发结构。';
    if (name === 'pickup') { ev.icon = 'gem'; note = '显眼关键物:独立 token,远处也该一眼看见。'; }
    if (name === 'floor-pickup') { ev.icon = 'ritual_marks'; note = '地面嵌入式隐藏物:低调但可发现,贴近中心才拿。'; }
    if (name === 'wall-pickup') { ev.icon = 'scroll'; ev.face = 'N'; note = '墙壁嵌入式隐藏物:在相邻墙面,面向并贴近才拿。'; }
    if (name === 'marker' || name === 'plate') ev.set = [{ x: 3, y: 1, ch: '.' }];
    if (name === 'trap') ev.turn = 'W';
    specs.push(cardSpec('semantics', name, commonMaze(mazeExtra), note));
  });
  exitStyles.forEach(function (name) {
    var eTheme = name === 'shoji' ? 'shoji' : name === 'sphincter' ? 'flesh' : name === 'blast-door' || name === 'elevator' ? 'metal' : name === 'portal' ? 'ice' : name === 'stairs' || name === 'archway' || name === 'portcullis' ? 'cave' : name === 'wheel-hatch' ? 'submarine' : 'dungeon';
    specs.push(cardSpec('structure', 'exit: ' + name, commonMaze({ grid: gridDoorFront(), start: { x: 2, y: 2, dir: 'E' }, theme: eTheme, exitStyle: name, flatWalls: false }), '正前方出口样式;仍是 D 门、走近正对通关,只换视觉类型。'));
  });
  pillarStyles.forEach(function (name) {
    specs.push(cardSpec('structure', 'pillar: ' + name, commonMaze({ theme: name === 'crystal' ? 'ice' : name === 'metal' ? 'metal' : name === 'wood' ? 'shoji' : 'cave', pillars: [{ x: 2, y: 1, style: name, scale: 0.95 }], pillarStyle: name, wallTex: 'none', decorDensity: 0, wallDecorDensity: 0 }), '内置柱子样式:纯视觉地标,不挡路、不拾取。'));
  });
  specs.push(cardSpec('structure', 'pillars: mixed', commonMaze({ theme: 'cave', grid: ['#######', '#.....#', '#.P...#', '#.....#', '#######'], start: { x: 2, y: 2, dir: 'E' }, pillars: [{ x: 4, y: 1, style: 'stone', scale: 0.85 }, { x: 5, y: 2, style: 'crystal', scale: 0.80 }, { x: 4, y: 3, style: 'metal', scale: 0.75 }], pillarStyle: 'ruined', wallTex: 'none', decorDensity: 0, wallDecorDensity: 0 }), '同一迷宫里每根柱子可单独覆盖 style/scale;仍只是地标。'));

  function mount(host) {
    var doc = host.document, A = host.Amatlas || {}, root = doc.getElementById('gallery'), nav = doc.querySelector('.tabs');
    var CARD_W = 260, CARD_H = 162;
    if (!root || !nav || !A.createEngine || !A.Maze3d || !A.Maze3d.createMaze3dModule) {
      var error = doc.createElement('div'); error.className = 'error'; error.textContent = 'maze3d gallery 启动失败:缺少 Amatlas core 或 Maze3d runtime。'; doc.body.appendChild(error); return;
    }
    nav.innerHTML = '<button type="button" data-filter="all" aria-pressed="true">全部</button>' + groups.map(function (g) { return '<button type="button" data-filter="' + g.id + '" aria-pressed="false">' + g.label + '</button>'; }).join('');
    root.innerHTML = groups.map(function (g) { return '<section data-section="' + g.id + '"><h2>' + g.title + '</h2><p class="section-note">' + g.note + '</p><div class="grid"></div></section>'; }).join('');
    specs.forEach(function (spec, idx) {
      var id = stageId(spec.group + '-' + spec.name, idx), card = doc.createElement('article');
      card.className = 'card'; card.dataset.group = spec.group;
      card.innerHTML = '<div class="shot"><div id="' + id + '"></div></div><div class="meta"><strong></strong><p></p><details><summary>查看 / 复制 maze 对象</summary><pre><code></code></pre><button type="button" class="copy-maze">复制</button><span class="copy-status" aria-live="polite"></span></details></div>';
      card.querySelector('strong').textContent = spec.name;
      card.querySelector('p').textContent = spec.note;
      card.querySelector('code').textContent = cardCode(spec);
      var copy = card.querySelector('.copy-maze'), status = card.querySelector('.copy-status');
      copy.addEventListener('click', function () {
        var text = cardCode(spec), clipboard = host.navigator && host.navigator.clipboard;
        if (!clipboard || !clipboard.writeText) { status.textContent = '请手动选择代码'; return; }
        try { var pending = clipboard.writeText(text); if (pending && pending.then) pending.then(function () { status.textContent = '已复制'; }, function () { status.textContent = '请手动选择代码'; }); else status.textContent = '已复制'; }
        catch (e) { status.textContent = '请手动选择代码'; }
      });
      root.querySelector('[data-section="' + spec.group + '"] .grid').appendChild(card);
      var engine = A.createEngine(baseWorld(id, spec.maze), { storage: null });
      engine.use(A.Maze3d.createMaze3dModule({ stageId: id, width: CARD_W, height: CARD_H, fullscreen: false, controls: false, audio: false, staticPreview: true }));
      engine.start();
    });
    nav.addEventListener('click', function (ev) {
      var button = ev.target && ev.target.closest && ev.target.closest('button[data-filter]'); if (!button) return;
      var filter = button.getAttribute('data-filter');
      Array.prototype.forEach.call(nav.querySelectorAll('button'), function (item) { item.setAttribute('aria-pressed', String(item === button)); });
      Array.prototype.forEach.call(root.querySelectorAll('section'), function (section) { section.classList.toggle('hidden', filter !== 'all' && section.dataset.section !== filter); });
    });
  }

  return { groups: groups, specs: specs, serializeMaze: serializeMaze, cardCode: cardCode, combatPreviewMaze: combatPreviewMaze, mount: mount };
});
