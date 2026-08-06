'use strict';
/* Maze3D recipe dogfood 机械闸：先锁 baseline，再由同一检查器验收 presentation 实施。 */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var MAZE_WORLD_PATH = path.join(__dirname, '..', 'world.js');
var ORIGIN_WORLD_PATH = path.join(__dirname, '..', '..', 'origin', 'world.js');
var GALLERY_PATH = path.join(__dirname, '..', 'gallery.js');
var MAZE_RUNTIME_PATH = path.join(__dirname, '..', 'raycast-maze.js');
var ORIGIN_RUNTIME_PATH = path.join(__dirname, '..', '..', 'origin', 'raycast-maze.js');
var RUNTIME_SHA256 = 'df9436e9b4e511983acb9b5e87b6529e3dfdb4ae14aee3d9a9cd6357d6bc0fa8';

var PRESENTATION_KEYS = [
  'theme', 'wallTex', 'floorTex', 'ceilTex',
  'decorDensity', 'maxDecor', 'wallDecorDensity', 'maxWallDecor',
  'decor', 'wallDecor', 'exitStyle', 'pillars', 'pillarStyle', 'flatWalls'
];
var TARGETS = [
  { recipe: 'dungeon ritual hall', world: 'maze3d', map: 'm', node: 'puzzle_maze', hash: 'c4cff0019f84f3969b7f7514dd6765a7bab7402c7340d4eb7947461e6350c550' },
  { recipe: 'flesh nest corridor', world: 'maze3d', map: 'm', node: 'layers_maze3', hash: 'd6dcb49ffe245c656a826089b76337879a1bfbc3dc421e29ad5786eedf858698' },
  { recipe: 'industrial checkpoint', world: 'maze3d', map: 'm', node: 'fps_range', hash: '7defa79d107f34a1bd7dc73b5f5365a1d87c58f65f76a0dcc1e5d72bf43d3943' },
  { recipe: 'crystal observatory', world: 'origin', map: 'atlas', node: 'unlit_corridor', hash: '4c6de9a7b169710cff8fb266118bf5fb01ddf828f72475856c6bd60770437ddf' },
  { recipe: 'ice resource fork', world: 'maze3d', map: 'm', node: 'layers_maze1', hash: 'b19d7ee8629d3bba29240d062d6d49764b8c2649c116365c75facdd0ffdaaf69' }
];
var ENVELOPES = {
  maze3d: '54b50b9b432328b37e45a5a486c7fdaa0610a577ccaddce180fd05420e3e6cd0',
  origin: 'c50b3b64b0f25083be9402426f7e90e425d14a9329b813f3aeaee34fd7760022'
};

/*
 * 这是唯一需要在后续 world dogfood 实施时切换的 presentation 常量。
 * baseline:<sha> 明确只祝福实施前现状；改为 dogfood:<新 sha> 才会开启五套落地断言和
 * Origin 单 append 断言。检查器不会自动接受 baseline/dogfood 两种状态，避免假绿。
 */
var EXPECTED_PRESENTATION_SIGNATURE = 'dogfood:82a2bb15d747fca14520fe9d25399d4f3096893ab184b821dbd9f420eea8d580';
var EXPECTED_GALLERY_RECIPE_SHA256 = 'd77053c751abb65eab31a57700b3ef5b477053d126d4c049304ad0b672ec17f6';

var ORIGIN_OLD_ARRAYS = {
  pillars: [
    { x: 9, y: 1, style: 'crystal', scale: 0.9 },
    { x: 11, y: 1, style: 'crystal', scale: 0.9 },
    { x: 8, y: 7, style: 'crystal', scale: 1.05 }
  ],
  wallDecor: [
    { x: 3, y: 0, face: 'S', kind: 'sigil', u: 0.5, v: 0.36, scale: 1.05 },
    { x: 7, y: 0, face: 'S', kind: 'crystals', u: 0.5, v: 0.5, scale: 0.9 },
    { x: 12, y: 3, face: 'W', kind: 'sigil', u: 0.48, v: 0.34, scale: 0.9 },
    { x: 0, y: 7, face: 'E', kind: 'crystals', u: 0.52, v: 0.52, scale: 1.05 }
  ],
  decor: [
    { x: 3, y: 1, icon: 'ritual_marks' },
    { x: 7, y: 7, icon: 'ritual_marks' }
  ]
};

var pass = 0, fail = 0;
function ok(cond, message, detail) {
  if (cond) { pass++; console.log('  ok  ' + message); }
  else { fail++; console.log('  FAIL ' + message + (detail ? ' -> ' + detail : '')); }
}
function own(value, key) { return Object.prototype.hasOwnProperty.call(value || {}, key); }
function descriptorClone(value, omit) {
  var clone = Object.create(Object.getPrototypeOf(value));
  Object.getOwnPropertyNames(value).forEach(function (key) {
    if (!omit || !omit[key]) Object.defineProperty(clone, key, Object.getOwnPropertyDescriptor(value, key));
  });
  Object.getOwnPropertySymbols(value).forEach(function (key) { Object.defineProperty(clone, key, Object.getOwnPropertyDescriptor(value, key)); });
  return clone;
}
function fresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

/* 设计冻结的 canonical byte grammar；所有结构 hash/比较只复用这一份实现。 */
function canonicalize(value) {
  if (value === undefined) return { '$undefined': true };
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('canonicalizer 拒绝非有限数字');
  if (typeof value === 'number' && Object.is(value, -0)) return { '$number': '-0' };
  if (typeof value === 'function') return { '$function': Function.prototype.toString.call(value) };
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('canonicalizer 拒绝数组 symbol 自有字段');
    var allowed = { length: true }, arrayOut = new Array(value.length), lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!lengthDescriptor || lengthDescriptor.get || lengthDescriptor.set || lengthDescriptor.enumerable || lengthDescriptor.configurable || !lengthDescriptor.writable)
      throw new TypeError('canonicalizer 拒绝非标准数组 length descriptor');
    for (var arrayIndex = 0; arrayIndex < value.length; arrayIndex++) {
      var arrayKey = String(arrayIndex), arrayDescriptor = Object.getOwnPropertyDescriptor(value, arrayKey);
      if (!arrayDescriptor) throw new TypeError('canonicalizer 拒绝稀疏数组槽:' + arrayKey);
      if (arrayDescriptor.get || arrayDescriptor.set || !arrayDescriptor.enumerable || !arrayDescriptor.configurable || !arrayDescriptor.writable)
        throw new TypeError('canonicalizer 拒绝非标准数组槽 descriptor:' + arrayKey);
      allowed[arrayKey] = true;
      arrayOut[arrayIndex] = canonicalize(arrayDescriptor.value);
    }
    Object.getOwnPropertyNames(value).forEach(function (key) {
      if (!allowed[key]) throw new TypeError('canonicalizer 拒绝数组额外自有字段:' + key);
    });
    return arrayOut;
  }
  if (value && typeof value === 'object') {
    var proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError('canonicalizer 只接受普通对象，得到 ' + Object.prototype.toString.call(value));
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('canonicalizer 拒绝 symbol 自有字段');
    var out = {};
    Object.getOwnPropertyNames(value).sort().forEach(function (key) {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || descriptor.get || descriptor.set) throw new TypeError('canonicalizer 拒绝 accessor 字段:' + key);
      out[key] = canonicalize(descriptor.value);
    });
    return out;
  }
  return value;
}
function canonicalString(value) { return JSON.stringify(canonicalize(value)); }
function canonicalBytes(value) { return Buffer.from(canonicalString(value), 'utf8'); }
function canonicalSha256(value) { return crypto.createHash('sha256').update(canonicalBytes(value)).digest('hex'); }

function loadWorlds() { return { maze3d: fresh(MAZE_WORLD_PATH), origin: fresh(ORIGIN_WORLD_PATH) }; }
function targetNode(worlds, target) {
  var world = worlds[target.world];
  return world && world.maps && world.maps[target.map] && world.maps[target.map].nodes && world.maps[target.map].nodes[target.node];
}
function nodeFingerprint(node) {
  var omit = {};
  PRESENTATION_KEYS.forEach(function (key) { omit[key] = true; });
  var root = descriptorClone(node);
  Object.defineProperty(root, 'maze', { value: descriptorClone(node.maze, omit), enumerable: true, configurable: true, writable: true });
  return canonicalSha256(root);
}
function worldEnvelope(world) {
  var envelope = {};
  ['id', 'start', 'seed', 'initState', 'items'].forEach(function (key) {
    if (own(world, key)) envelope[key] = world[key];
  });
  return envelope;
}
function protectedWorld(world, worldName) {
  var root = descriptorClone(world), maps = descriptorClone(world.maps || {}), omit = {};
  PRESENTATION_KEYS.forEach(function (key) { omit[key] = true; });
  Object.getOwnPropertyNames(world.maps || {}).forEach(function (mapId) {
    var map = world.maps[mapId], mapCopy = descriptorClone(map), nodes = descriptorClone(map.nodes || {});
    Object.getOwnPropertyNames(map.nodes || {}).forEach(function (nodeId) {
      var node = map.nodes[nodeId], nodeCopy = descriptorClone(node), isTarget = TARGETS.some(function (target) { return target.world === worldName && target.map === mapId && target.node === nodeId; });
      if (isTarget && node.maze) Object.defineProperty(nodeCopy, 'maze', { value: descriptorClone(node.maze, omit), enumerable: true, configurable: true, writable: true });
      Object.defineProperty(nodes, nodeId, { value: nodeCopy, enumerable: true, configurable: true, writable: true });
    });
    Object.defineProperty(mapCopy, 'nodes', { value: nodes, enumerable: true, configurable: true, writable: true });
    Object.defineProperty(maps, mapId, { value: mapCopy, enumerable: true, configurable: true, writable: true });
  });
  Object.defineProperty(root, 'maps', { value: maps, enumerable: true, configurable: true, writable: true });
  return root;
}
var WORLD_HASHES = {
  maze3d: 'bbd368208381e0fba183b22e9ffeac6aa512e6ad3cd934cd210e4cecf7d84ba7',
  origin: 'f84bf51037f4e8dd024cf21cf3456c481d2e4d4c5c975dbc58b72db51517a2d5'
};
function fingerprintErrors(worlds) {
  var errors = [];
  TARGETS.forEach(function (target) {
    var node = targetNode(worlds, target);
    if (!node) errors.push('missing-node:' + target.recipe);
    else if (nodeFingerprint(node) !== target.hash) errors.push('node-hash:' + target.recipe);
  });
  Object.keys(ENVELOPES).forEach(function (worldName) {
    if (canonicalSha256(worldEnvelope(worlds[worldName])) !== ENVELOPES[worldName]) errors.push('envelope:' + worldName);
    if (canonicalSha256(protectedWorld(worlds[worldName], worldName)) !== WORLD_HASHES[worldName]) errors.push('world-hash:' + worldName);
  });
  return errors;
}

function presentationSnapshot(worlds) {
  return TARGETS.map(function (target) {
    var node = targetNode(worlds, target), maze = node && node.maze || {}, picked = {};
    PRESENTATION_KEYS.forEach(function (key) { if (own(maze, key)) picked[key] = maze[key]; });
    return { recipe: target.recipe, world: target.world, map: target.map, node: target.node, maze: picked };
  });
}
function parsePresentationSignature() {
  var match = /^(baseline|dogfood):([0-9a-f]{64})$/.exec(EXPECTED_PRESENTATION_SIGNATURE);
  return match && { phase: match[1], sha256: match[2] };
}
function hasWallKind(maze, kind) { return Array.isArray(maze.wallDecor) && maze.wallDecor.some(function (item) { return item && item.kind === kind; }); }
function hasDecorIcon(maze, icon) { return Array.isArray(maze.decor) && maze.decor.some(function (item) { return item && item.icon === icon; }); }
function hasPillarStyle(maze, style) { return Array.isArray(maze.pillars) && maze.pillars.some(function (item) { return item && (item.style || maze.pillarStyle) === style; }); }
function fieldsEqual(maze, expected) { return Object.keys(expected).every(function (key) { return maze[key] === expected[key]; }); }
function dogfoodPresentationErrors(worlds) {
  var errors = [], byRecipe = {};
  TARGETS.forEach(function (target) { byRecipe[target.recipe] = targetNode(worlds, target).maze; });
  var dungeon = byRecipe['dungeon ritual hall'];
  if (!fieldsEqual(dungeon, { theme: 'dungeon', wallTex: 'stone', floorTex: 'slab', ceilTex: 'rib', exitStyle: 'portcullis' }) ||
      !hasWallKind(dungeon, 'sigil') || !hasDecorIcon(dungeon, 'ritual_marks') || !hasPillarStyle(dungeon, 'ruined')) errors.push('dogfood:dungeon');
  var flesh = byRecipe['flesh nest corridor'];
  if (!fieldsEqual(flesh, { theme: 'flesh', wallTex: 'flesh', floorTex: 'crack', ceilTex: 'rib', exitStyle: 'sphincter' }) ||
      !hasWallKind(flesh, 'teeth') || !hasWallKind(flesh, 'veins') || !hasWallKind(flesh, 'tentacle') || !hasWallKind(flesh, 'growth') || !hasDecorIcon(flesh, 'flesh_nodule')) errors.push('dogfood:flesh');
  var industrial = byRecipe['industrial checkpoint'];
  if (!fieldsEqual(industrial, { theme: 'industrial', wallTex: 'panel', floorTex: 'panel', ceilTex: 'beam', exitStyle: 'blast-door' }) ||
      !hasWallKind(industrial, 'cables') || !hasDecorIcon(industrial, 'rust_scraps') || !hasPillarStyle(industrial, 'metal')) errors.push('dogfood:industrial');
  var crystal = byRecipe['crystal observatory'];
  if (!fieldsEqual(crystal, { theme: 'crystal', wallTex: 'crystal', floorTex: 'panel', ceilTex: 'beam', exitStyle: 'portal' }) ||
      !hasWallKind(crystal, 'crystals') || !hasDecorIcon(crystal, 'ritual_marks') || !hasDecorIcon(crystal, 'crystal_cluster') || !hasPillarStyle(crystal, 'crystal')) errors.push('dogfood:crystal');
  var ice = byRecipe['ice resource fork'];
  if (!fieldsEqual(ice, { theme: 'ice', wallTex: 'ice', floorTex: 'crack', ceilTex: 'slab', exitStyle: 'stairs' }) ||
      !hasWallKind(ice, 'crack') || !hasDecorIcon(ice, 'ice_chips') || !hasPillarStyle(ice, 'stone')) errors.push('dogfood:ice');
  return errors;
}

function mappingErrors(worlds, gallery) {
  var errors = [];
  var expectedMapping = 'dungeon ritual hall=maze3d/m/puzzle_maze|flesh nest corridor=maze3d/m/layers_maze3|industrial checkpoint=maze3d/m/fps_range|crystal observatory=origin/atlas/unlit_corridor|ice resource fork=maze3d/m/layers_maze1';
  var actualMapping = TARGETS.map(function (target) { return target.recipe + '=' + target.world + '/' + target.map + '/' + target.node; }).join('|');
  if (actualMapping !== expectedMapping) errors.push('target-mapping');
  TARGETS.forEach(function (target) {
    var node = targetNode(worlds, target);
    if (!node || node.kind !== 'maze3d') errors.push('target-node:' + target.recipe);
  });
  var recipes = gallery.specs.filter(function (spec) { return spec.group === 'recipes'; });
  if (canonicalSha256(recipes.map(function (spec) { return { name: spec.name, maze: spec.maze }; })) !== EXPECTED_GALLERY_RECIPE_SHA256) errors.push('gallery-recipe-signature');
  var submarine = recipes.filter(function (spec) { return spec.name === 'submarine maintenance hatch'; });
  if (submarine.length !== 1 || TARGETS.some(function (target) { return target.recipe === 'submarine maintenance hatch'; })) errors.push('submarine-stop-mapping');
  Object.keys(worlds).forEach(function (worldName) {
    Object.keys(worlds[worldName].maps || {}).forEach(function (mapId) {
      Object.keys(worlds[worldName].maps[mapId].nodes || {}).forEach(function (nodeId) {
        var node = worlds[worldName].maps[mapId].nodes[nodeId], maze = node && node.kind === 'maze3d' && node.maze;
        if (maze && fieldsEqual(maze, { theme: 'submarine', wallTex: 'hull', floorTex: 'panel', ceilTex: 'beam', exitStyle: 'wheel-hatch' }) && hasWallKind(maze, 'pipes') && hasDecorIcon(maze, 'cable_coil') && hasPillarStyle(maze, 'metal')) errors.push('submarine-formal-target:' + worldName + '/' + mapId + '/' + nodeId);
      });
    });
  });
  var layers2 = worlds.maze3d.maps.m.nodes.layers_maze2;
  var layers2Evidence = [layers2.title, layers2.look, layers2.wonText].join('|');
  if (!layers2.maze || layers2.maze.theme !== 'dungeon' || !/第二层地牢/.test(layers2Evidence) || !/控制室/.test(layers2Evidence)) errors.push('submarine-stop-evidence');
  return errors;
}

function originPrefixErrors(worlds, phase) {
  var errors = [], maze = worlds.origin.maps.atlas.nodes.unlit_corridor.maze;
  ['pillars', 'wallDecor', 'decor'].forEach(function (key) {
    var actual = maze[key], prefix = ORIGIN_OLD_ARRAYS[key];
    if (!Array.isArray(actual) || actual.length < prefix.length || prefix.some(function (item, index) { return canonicalString(actual[index]) !== canonicalString(item); })) errors.push('origin-prefix:' + key);
  });
  if (phase === 'baseline') {
    ['pillars', 'wallDecor', 'decor'].forEach(function (key) {
      if (!Array.isArray(maze[key]) || maze[key].length !== ORIGIN_OLD_ARRAYS[key].length) errors.push('origin-baseline-length:' + key);
    });
  } else if (phase === 'dogfood') {
    if (maze.pillars.length !== ORIGIN_OLD_ARRAYS.pillars.length) errors.push('origin-dogfood-pillars');
    if (maze.wallDecor.length !== ORIGIN_OLD_ARRAYS.wallDecor.length) errors.push('origin-dogfood-wallDecor');
    if (maze.decor.length !== ORIGIN_OLD_ARRAYS.decor.length + 1 || !maze.decor[maze.decor.length - 1] || maze.decor[maze.decor.length - 1].icon !== 'crystal_cluster') errors.push('origin-dogfood-single-append');
  }
  return errors;
}

function cellAt(grid, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= grid.length || x < 0 || x >= grid[y].length) return null;
  return grid[y][x];
}
function coordKey(x, y) { return x + ',' + y; }
function hashStr(value) { var hash = 2166136261 >>> 0; value = String(value); for (var index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619) >>> 0; } return hash >>> 0; }
function mulberry32(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var value = Math.imul(seed ^ seed >>> 15, 1 | seed); value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value; return ((value ^ value >>> 14) >>> 0) / 4294967296; }; }
var THEME_DECOR = {
  dungeon: ['rubble', 'skull', 'ash_pile', 'cloth_rags'], flesh: ['flesh_nodule', 'bio_film', 'skull'], industrial: ['rust_scraps', 'cable_coil', 'glass_shards'],
  crystal: ['crystal_cluster', 'ice_chips', 'gem'], ice: ['ice_chips', 'crystal', 'gem']
};
var THEME_WALL_DECOR = {
  dungeon: ['crack', 'arms', 'torch', 'chains', 'sigil'], flesh: ['tentacle', 'veins', 'growth', 'crack', 'eyes'], industrial: ['pipes', 'cables', 'vent', 'crack'],
  crystal: ['crystals', 'growth', 'crack'], ice: ['crack', 'growth']
};
function addReason(index, x, y, reason) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return;
  var key = coordKey(x, y);
  if (!index[key]) index[key] = [];
  if (index[key].indexOf(reason) < 0) index[key].push(reason);
}
function walkEventActions(value, reserved, dynamic) {
  if (Array.isArray(value)) { value.forEach(function (item) { walkEventActions(item, reserved, dynamic); }); return; }
  if (!value || typeof value !== 'object') return;
  Object.keys(value).forEach(function (key) {
    var child = value[key];
    if (key === 'set' && Array.isArray(child)) child.forEach(function (target) {
      if (!target || !Number.isInteger(target.x) || !Number.isInteger(target.y)) return;
      addReason(reserved, target.x, target.y, 'dynamic-set');
      var at = coordKey(target.x, target.y);
      if (!dynamic[at]) dynamic[at] = [];
      dynamic[at].push(target.ch);
    });
    if (key === 'warp' && child && typeof child === 'object') addReason(reserved, child.x, child.y, 'warp-target');
    walkEventActions(child, reserved, dynamic);
  });
}
function coordinateErrorsFor(target, node) {
  var errors = [], maze = node.maze || {}, grid = maze.grid || [], reserved = {}, dynamic = {}, functionalWalls = {};
  if (maze.start) addReason(reserved, maze.start.x, maze.start.y, 'start');
  grid.forEach(function (row, y) { Array.prototype.forEach.call(row, function (ch, x) { if (ch === 'D' || ch === 'K') addReason(reserved, x, y, 'initial-' + ch); }); });
  (maze.events || []).forEach(function (event, index) {
    addReason(reserved, event.x, event.y, 'event[' + index + ']');
    if (event.visual === 'wall-pickup') {
      var face = String(event.face || '').toUpperCase(), offset = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[face];
      var opposite = { N: 'S', S: 'N', E: 'W', W: 'E' }[face];
      if (offset) functionalWalls[coordKey(event.x + offset[0], event.y + offset[1]) + ',' + opposite] = true;
    }
    walkEventActions(event, reserved, dynamic);
  });
  function reserveEntities(items, reason) {
    (items || []).forEach(function (item, index) { addReason(reserved, item.x, item.y, reason + '[' + index + ']'); });
  }
  reserveEntities(maze.monsters, 'monster');
  var combat = maze.combat || {};
  if (combat.guard) addReason(reserved, combat.guard.x, combat.guard.y, 'combat-guard');
  reserveEntities(combat.monsters, 'combat-monster');
  reserveEntities(combat.pickups, 'combat-pickup');
  reserveEntities(combat.supplies, 'combat-supply');

  var floorObjects = [];
  (maze.decor || []).forEach(function (item, index) { floorObjects.push({ item: item, label: 'decor[' + index + ']' }); });
  (maze.pillars || []).forEach(function (item, index) { floorObjects.push({ item: item, label: 'pillars[' + index + ']' }); });
  var occupied = {};
  floorObjects.forEach(function (entry) {
    var item = entry.item || {}, key = coordKey(item.x, item.y), ch = cellAt(grid, item.x, item.y);
    if (ch !== '.') errors.push('floor-cell:' + target.node + ':' + entry.label);
    (reserved[key] || []).forEach(function (reason) { errors.push('floor-reserved:' + target.node + ':' + entry.label + ':' + reason); });
    if (occupied[key]) errors.push('floor-sibling:' + target.node + ':' + entry.label + ':' + occupied[key]);
    else occupied[key] = entry.label;
  });

  var autoFloor = [], floorList = THEME_DECOR[maze.theme] || [], autoFloorDensity = maze.decorDensity || 0, autoFloorMax = maze.maxDecor != null ? maze.maxDecor : 12;
  var runtimeBlocked = {};
  if (maze.start) runtimeBlocked[coordKey(maze.start.x, maze.start.y)] = true;
  grid.forEach(function (row, y) { Array.prototype.forEach.call(row, function (ch, x) { if (ch === 'D' || ch === 'K') runtimeBlocked[coordKey(x, y)] = true; }); });
  (maze.events || []).forEach(function (event) { runtimeBlocked[coordKey(event.x, event.y)] = true; });
  (maze.monsters || []).forEach(function (monster) { runtimeBlocked[coordKey(monster.x, monster.y)] = true; });
  Object.keys(occupied).forEach(function (key) { runtimeBlocked[key] = true; });
  if (floorList.length && autoFloorDensity > 0 && autoFloorMax > 0) {
    for (var autoY = 0; autoY < grid.length && autoFloor.length < autoFloorMax; autoY++) {
      var autoRow = grid[autoY] || '';
      for (var autoX = 0; autoX < autoRow.length && autoFloor.length < autoFloorMax; autoX++) {
        var autoKey = coordKey(autoX, autoY);
        if (cellAt(grid, autoX, autoY) !== '.' || runtimeBlocked[autoKey]) continue;
        var autoRng = mulberry32(hashStr('decor' + maze.theme + '_' + autoX + '_' + autoY + '_' + grid.length + '_' + autoRow.length));
        if (autoRng() >= autoFloorDensity) continue;
        (reserved[autoKey] || []).forEach(function (reason) { errors.push('auto-floor-reserved:' + target.node + ':' + reason + ':' + autoKey); });
        autoFloor.push(autoKey); runtimeBlocked[autoKey] = true;
      }
    }
  }

  var wallKeys = {};
  function registerWall(item, label) {
    item = item || {};
    var face = String(item.face || '').toUpperCase();
    var offset = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[face];
    var key = coordKey(item.x, item.y) + ',' + face;
    if (cellAt(grid, item.x, item.y) !== '#') errors.push('wall-cell:' + target.node + ':' + label);
    if (!offset || ['#', 'D'].indexOf(cellAt(grid, item.x + (offset ? offset[0] : 0), item.y + (offset ? offset[1] : 0))) >= 0 || cellAt(grid, item.x + (offset ? offset[0] : 0), item.y + (offset ? offset[1] : 0)) == null) errors.push('wall-face-hidden:' + target.node + ':' + label);
    if (dynamic[coordKey(item.x, item.y)]) errors.push('wall-dynamic-anchor:' + target.node + ':' + label);
    if (offset) {
      var neighborChanges = dynamic[coordKey(item.x + offset[0], item.y + offset[1])] || [];
      if (neighborChanges.some(function (ch) { return ch === '#' || ch === 'D'; })) errors.push('wall-dynamic-face:' + target.node + ':' + label);
    }
    if (functionalWalls[key]) errors.push('wall-functional:' + target.node + ':' + label);
    var explicit = label.indexOf('wallDecor[') === 0;
    if (wallKeys[key] && explicit && wallKeys[key].indexOf('wallDecor[') === 0) errors.push('wall-sibling:' + target.node + ':' + label);
    if (!wallKeys[key]) wallKeys[key] = label;
  }
  (maze.wallDecor || []).forEach(function (item, index) { registerWall(item, 'wallDecor[' + index + ']'); });
  var autoWallList = THEME_WALL_DECOR[maze.theme] || [], autoWallDensity = maze.wallDecorDensity || 0, autoWallMax = maze.maxWallDecor != null ? maze.maxWallDecor : 18, autoWalls = 0;
  if (autoWallList.length && autoWallDensity > 0 && autoWallMax > 0) {
    var faces = ['N', 'E', 'S', 'W'], faceOffsets = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
    for (var wallY = 0; wallY < grid.length && autoWalls < autoWallMax; wallY++) {
      var wallRow = grid[wallY] || '';
      for (var wallX = 0; wallX < wallRow.length && autoWalls < autoWallMax; wallX++) {
        if (cellAt(grid, wallX, wallY) !== '#') continue;
        for (var faceIndex = 0; faceIndex < faces.length && autoWalls < autoWallMax; faceIndex++) {
          var autoFace = faces[faceIndex], faceOffset = faceOffsets[autoFace];
          if (['#', 'D'].indexOf(cellAt(grid, wallX + faceOffset[0], wallY + faceOffset[1])) >= 0 || cellAt(grid, wallX + faceOffset[0], wallY + faceOffset[1]) == null) continue;
          var wallRng = mulberry32(hashStr('wdecor' + maze.theme + '_' + wallX + '_' + wallY + '_' + autoFace + '_' + grid.length + '_' + wallRow.length));
          if (wallRng() >= autoWallDensity) continue;
          registerWall({ x: wallX, y: wallY, face: autoFace }, 'auto-wallDecor[' + autoWalls + ']'); autoWalls++;
        }
      }
    }
  }
  return errors;
}
function coordinateErrors(worlds) {
  var errors = [];
  TARGETS.forEach(function (target) { errors = errors.concat(coordinateErrorsFor(target, targetNode(worlds, target))); });
  return errors;
}

function runtimeErrors(mazeBytes, originBytes) {
  var errors = [];
  var mazeSha = crypto.createHash('sha256').update(mazeBytes).digest('hex');
  var originSha = crypto.createHash('sha256').update(originBytes).digest('hex');
  if (mazeSha !== RUNTIME_SHA256) errors.push('runtime-sha:maze3d');
  if (originSha !== RUNTIME_SHA256) errors.push('runtime-sha:origin');
  if (!Buffer.from(mazeBytes).equals(Buffer.from(originBytes))) errors.push('runtime-mirror');
  return errors;
}
function hasIssue(errors, prefix) { return errors.some(function (error) { return error.indexOf(prefix) === 0; }); }

console.log('Maze3D recipe dogfood 机械闸');
var worlds = loadWorlds(), gallery = fresh(GALLERY_PATH), signature = parsePresentationSignature();
var mappings = mappingErrors(worlds, gallery);
ok(mappings.length === 0, 'R1 五套 recipe→正式节点映射与 submarine 无落点停止结论稳定', mappings.join(','));
var fingerprints = fingerprintErrors(worlds);
ok(fingerprints.length === 0, 'R2 五个非 presentation node hash + 两个 world envelope hash 命中冻结基线', fingerprints.join(','));
ok(!!signature && signature.phase === 'dogfood', 'R3 正式总闸只接受 dogfood presentation signature', EXPECTED_PRESENTATION_SIGNATURE);
var actualPresentationSha = canonicalSha256(presentationSnapshot(worlds));
ok(!!signature && actualPresentationSha === signature.sha256,
  'R4 当前 ' + (signature ? signature.phase : 'invalid') + ' presentation signature 唯一命中（不自动兼容双状态）',
  'actual=' + actualPresentationSha + ' expected=' + EXPECTED_PRESENTATION_SIGNATURE);
var dogfoodErrors = signature && signature.phase === 'dogfood' ? dogfoodPresentationErrors(worlds) : [];
ok(!signature || signature.phase !== 'dogfood' || dogfoodErrors.length === 0, 'R5 dogfood 阶段才开启五套协调 presentation 落地断言', dogfoodErrors.join(','));
var coordinates = coordinateErrors(worlds);
ok(coordinates.length === 0, 'R6 五个目标完整动态坐标/功能墙/显式对象冲突扫描通过', coordinates.join(','));
var originPrefix = originPrefixErrors(worlds, signature && signature.phase);
ok(originPrefix.length === 0, 'R7 Origin 旧 pillars/wallDecor/decor 为有序完整前缀，阶段 delta 形状正确', originPrefix.join(','));
var runtimeA = fs.readFileSync(MAZE_RUNTIME_PATH), runtimeB = fs.readFileSync(ORIGIN_RUNTIME_PATH);
var runtimes = runtimeErrors(runtimeA, runtimeB);
ok(runtimes.length === 0, 'R8 两份 runtime 各自命中冻结 SHA 且逐字节一致', runtimes.join(','));

console.log('反向变异');
var dungeonRecipe = gallery.specs.filter(function (spec) { return spec.name === 'dungeon ritual hall'; })[0];
var savedWallTex = dungeonRecipe.maze.wallTex;
delete dungeonRecipe.maze.wallTex;
ok(hasIssue(mappingErrors(worlds, gallery), 'gallery-recipe-signature'), 'M1 删除 recipe 字段会转红');
dungeonRecipe.maze.wallTex = savedWallTex;

var badFaceWorlds = loadWorlds();
badFaceWorlds.maze3d.maps.m.nodes.layers_maze3.maze.wallDecor[0].face = 'N';
ok(hasIssue(coordinateErrors(badFaceWorlds), 'wall-face-hidden:'), 'M2 wallDecor 错 face 会转红');

var initialCellWorlds = loadWorlds();
initialCellWorlds.maze3d.maps.m.nodes.puzzle_maze.maze.decor = [{ x: 7, y: 9, icon: 'ritual_marks' }];
ok(hasIssue(coordinateErrors(initialCellWorlds), 'floor-cell:') && hasIssue(coordinateErrors(initialCellWorlds), 'floor-reserved:'), 'M3 decor 占初始 D 功能格会转红');

var dynamicCellWorlds = loadWorlds();
dynamicCellWorlds.maze3d.maps.m.nodes.puzzle_maze.maze.decor = [{ x: 7, y: 8, icon: 'ritual_marks' }];
ok(coordinateErrors(dynamicCellWorlds).some(function (error) { return /floor-reserved:.*:dynamic-set$/.test(error); }), 'M4 decor 占动态 set 格会转红');

var warpCellWorlds = loadWorlds();
warpCellWorlds.maze3d.maps.m.nodes.puzzle_maze.maze.decor = [{ x: 1, y: 7, icon: 'ritual_marks' }];
ok(coordinateErrors(warpCellWorlds).some(function (error) { return /floor-reserved:.*:warp-target$/.test(error); }), 'M5 decor 占 warp 目标格会转红');

var startCellWorlds = loadWorlds();
startCellWorlds.maze3d.maps.m.nodes.fps_range.maze.decor = [{ x: 1, y: 3, icon: 'rust_scraps' }];
ok(coordinateErrors(startCellWorlds).some(function (error) { return /floor-reserved:.*:start$/.test(error); }), 'M6 decor 占 start 格会转红');

var functionalWallWorlds = loadWorlds();
functionalWallWorlds.maze3d.maps.m.nodes.puzzle_maze.maze.wallDecor = [{ x: 13, y: 8, face: 'N', kind: 'sigil' }];
ok(hasIssue(coordinateErrors(functionalWallWorlds), 'wall-functional:'), 'M7 普通 wallDecor 占 wall-pickup 功能墙面会转红');

function expectFingerprintMutation(name, mutate, expectedPrefix) {
  var changed = loadWorlds(); mutate(changed);
  ok(hasIssue(fingerprintErrors(changed), expectedPrefix), name);
}
expectFingerprintMutation('M8 改 grid 会转红', function (changed) {
  changed.maze3d.maps.m.nodes.puzzle_maze.maze.grid[0] = '############.';
}, 'node-hash:dungeon ritual hall');
expectFingerprintMutation('M9 改递归 event outcome 会转红', function (changed) {
  changed.maze3d.maps.m.nodes.puzzle_maze.maze.events[6].pages[3].success.set[0].ch = 'D';
}, 'node-hash:dungeon ritual hall');
expectFingerprintMutation('M10 改 combat 会转红', function (changed) {
  changed.maze3d.maps.m.nodes.fps_range.maze.combat.guard.hp++;
}, 'node-hash:industrial checkpoint');
expectFingerprintMutation('M11 改 link 会转红', function (changed) {
  changed.maze3d.maps.m.nodes.layers_maze1.links[0].to = 'hub';
}, 'node-hash:ice resource fork');
expectFingerprintMutation('M12 改 world envelope 会转红', function (changed) {
  changed.maze3d.seed++;
}, 'envelope:maze3d');
expectFingerprintMutation('M12a 改非目标节点因果会由完整 world hash 转红', function (changed) {
  changed.maze3d.maps.m.nodes.basic_maze.maze.grid[1] = '#D...#.D#';
}, 'world-hash:maze3d');
expectFingerprintMutation('M12b 非 presentation 自有 undefined 字段不会被 canonical JSON 吞掉', function (changed) {
  changed.maze3d.maps.m.nodes.fps_range.maze.combat.objective = undefined;
}, 'node-hash:industrial checkpoint');
var nanCaught = false;
try { var nanWorlds = loadWorlds(); nanWorlds.origin.maps.atlas.nodes.seed_dialogue.beats[1].cast[0].rig.parts[0].parent = NaN; fingerprintErrors(nanWorlds); } catch (nanError) { nanCaught = /非有限数字/.test(String(nanError.message || nanError)); }
ok(nanCaught, 'M12b1 null 变 NaN 由 canonicalizer fail-loud，不折叠为同字节');
expectFingerprintMutation('M12b2 nested non-enumerable 自有字段不会逃过hash', function (changed) {
  Object.defineProperty(changed.maze3d.maps.m.nodes.fps_range.maze.combat, 'objective', { value: 1, enumerable: false });
}, 'node-hash:industrial checkpoint');
expectFingerprintMutation('M12b2a 目标maze直接non-enumerable因果字段不会被浅拷贝丢弃', function (changed) {
  Object.defineProperty(changed.maze3d.maps.m.nodes.puzzle_maze.maze, 'monsters', { value: [{ x: 11, y: 1, chase: false }], enumerable: false });
}, 'node-hash:dungeon ritual hall');
var symbolCaught = false;
try { var symbolWorlds = loadWorlds(); symbolWorlds.maze3d.maps.m.nodes.fps_range.maze.combat[Symbol('objective')] = 1; fingerprintErrors(symbolWorlds); } catch (symbolError) { symbolCaught = /symbol/.test(String(symbolError.message || symbolError)); }
ok(symbolCaught, 'M12b3 symbol 自有字段由 canonicalizer fail-loud');
var arrayOwnCaught = false;
try {
  var arrayOwnWorlds = loadWorlds();
  Object.defineProperty(arrayOwnWorlds.maze3d.maps.m.nodes.fps_range.links, 'forEach', { value: function () {}, enumerable: false });
  fingerprintErrors(arrayOwnWorlds);
} catch (arrayOwnError) { arrayOwnCaught = /数组额外自有字段/.test(String(arrayOwnError.message || arrayOwnError)); }
ok(arrayOwnCaught, 'M12b4 links数组额外own forEach由canonicalizer fail-loud，不能移除runtime路由却保持hash');
var submarineWorlds = loadWorlds(), submarineSpec = fresh(GALLERY_PATH).specs.filter(function (spec) { return spec.name === 'submarine maintenance hatch'; })[0];
Object.assign(submarineWorlds.maze3d.maps.m.nodes.basic_maze.maze, JSON.parse(JSON.stringify(submarineSpec.maze)));
ok(hasIssue(mappingErrors(submarineWorlds, fresh(GALLERY_PATH)), 'submarine-formal-target:'), 'M12c 把 submarine 完整协调签名强塞任一正式节点会转红');

var autoFloorWorlds = loadWorlds(), autoFloorMaze = autoFloorWorlds.maze3d.maps.m.nodes.fps_range.maze;
autoFloorMaze.decor = []; autoFloorMaze.pillars = []; autoFloorMaze.decorDensity = 1; autoFloorMaze.maxDecor = 100;
ok(hasIssue(coordinateErrors(autoFloorWorlds), 'auto-floor-reserved:'), 'M12d 自动floor decor按真实runtime候选生成后命中guard/pickup功能格会转红');
var autoWallWorlds = loadWorlds(), autoWallMaze = autoWallWorlds.maze3d.maps.m.nodes.puzzle_maze.maze;
autoWallMaze.wallDecor = []; autoWallMaze.wallDecorDensity = 1; autoWallMaze.maxWallDecor = 1000;
ok(hasIssue(coordinateErrors(autoWallWorlds), 'wall-functional:'), 'M12e 自动wallDecor命中wall-pickup功能墙面会转红');

var noPillarWorlds = loadWorlds();
noPillarWorlds.origin.maps.atlas.nodes.unlit_corridor.maze.pillars.shift();
ok(hasIssue(originPrefixErrors(noPillarWorlds, 'baseline'), 'origin-prefix:pillars'), 'M13 删除 Origin 旧 pillar 会转红');
var reorderedWallWorlds = loadWorlds(), oldWalls = reorderedWallWorlds.origin.maps.atlas.nodes.unlit_corridor.maze.wallDecor;
var firstWall = oldWalls[0]; oldWalls[0] = oldWalls[1]; oldWalls[1] = firstWall;
ok(hasIssue(originPrefixErrors(reorderedWallWorlds, 'baseline'), 'origin-prefix:wallDecor'), 'M14 重排 Origin 旧 wallDecor 会转红');
var noDecorWorlds = loadWorlds();
noDecorWorlds.origin.maps.atlas.nodes.unlit_corridor.maze.decor.shift();
ok(hasIssue(originPrefixErrors(noDecorWorlds, 'dogfood'), 'origin-prefix:decor'), 'M15 删除 Origin 旧 decor 会转红');

var runtimeDrift = Buffer.concat([runtimeB, Buffer.from('\n// mutation', 'utf8')]);
var runtimeMutation = runtimeErrors(runtimeA, runtimeDrift);
ok(hasIssue(runtimeMutation, 'runtime-sha:origin') && hasIssue(runtimeMutation, 'runtime-mirror'), 'M16 runtime 单边漂移会同时打红 SHA 与 mirror');

console.log('recipe-dogfood: ' + pass + ' 通过, ' + fail + ' 失败' + (signature ? ' [' + signature.phase + ']' : ''));
process.exit(fail ? 1 : 0);
