'use strict';
/* Maze3D Pursuit & Escape Kit tests-first 闸：锁消费者体验，不实现 formal world。 */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var WORLD_PATH = path.join(__dirname, '..', 'world.js');
var ORIGIN_WORLD_PATH = path.join(__dirname, '..', '..', 'origin', 'world.js');
var RUNTIME_PATH = path.join(__dirname, '..', 'raycast-maze.js');
var ORIGIN_RUNTIME_PATH = path.join(__dirname, '..', '..', 'origin', 'raycast-maze.js');
var CORE_PATH = path.join(__dirname, '..', '..', '..', 'core', 'runtime', 'engine-core.js');
var INTERFACE_PATH = path.join(__dirname, '..', '..', '..', 'core', 'module-interface.md');
var RESET_PLUGIN_PATH = path.join(__dirname, '..', '..', '..', 'plugins', 'reset.js');
var RECIPE_TEST_PATH = path.join(__dirname, 'recipe-dogfood.test.cjs');
var FPS_TEST_PATH = path.join(__dirname, 'fps-encounter-kit.test.cjs');
var PUZZLE_TEST_PATH = path.join(__dirname, 'puzzle-experience.test.cjs');

/* BASELINE 只由 focused 命令授权；正式 runner 必须因这一项保持红。 */
var ACTIVE_PHASE = 'PURSUIT_KIT';
var BASELINE_ENV = 'ATLAS_MAZE_PURSUIT_KIT_BASELINE';
var PHASE_TRANSACTIONS = {
  BASELINE: {
    targetProjectionSha256: 'e57a5b009d24e3ce00c0ae90c6faaade50d1337fd3ac11e19687188beb3a88b2',
    nonTargetProjectionSha256: '59f3ee13016e187a9fd3afd428f30f4d1ddc37a08be2c5fee1a60f1e20c279f5',
    worldEnvelopeSha256: '54b50b9b432328b37e45a5a486c7fdaa0610a577ccaddce180fd05420e3e6cd0',
    hashTradeSha256: 'ab0ab82e83b296a50b49b57c2bdf1cb7bbae212363ba67bf0c6645b0fea8af69'
  },
  PURSUIT_KIT: {
    targetProjectionSha256: '54b63ffbfb3fb7de57dbcf4b73054af412eaf5e9d0b1d8752a8133530e37309e',
    nonTargetProjectionSha256: '59f3ee13016e187a9fd3afd428f30f4d1ddc37a08be2c5fee1a60f1e20c279f5',
    worldEnvelopeSha256: '54b50b9b432328b37e45a5a486c7fdaa0610a577ccaddce180fd05420e3e6cd0',
    hashTradeSha256: 'b97074ef41a27b7358b4d5b15255a8d7195e3cd3d2a399bd5456e32ae2bf119c'
  }
};

var PLANNED_TARGET_SHA256 = '54b63ffbfb3fb7de57dbcf4b73054af412eaf5e9d0b1d8752a8133530e37309e';
var ORIGIN_WORLD_SHA256 = '113b91c641bcb5e05456e690468653f814b13ed2a6ef9d103be1f69d2418ffb5';
var EXPECTED_BUDGETS = {
  sequence: { set: 180, activate: 180, monsterStep: 180, acquire: 181 },
  cadences: [
    {
      dt: 0.008333,
      quiet: { frames: 2401, moved: 0, maxProx: 0, caught: false },
      alwaysOn: { frames: 781, moved: 9.7625, caughtBy: 'project-depth' },
      escape: { frames: 3245, centerMargin: 2.073184, projectMargin: 2.876667, maxProx: 0.88514, visibleFrames: 8, moved: 13.8125, finalFacing: 1.570796 },
      caught: { frames: 916, caughtBy: 'project-depth', centerMargin: 0.099959, projectMargin: -0.030083, moved: 7.05 }
    },
    {
      dt: 0.016667,
      quiet: { frames: 1200, moved: 0, maxProx: 0, caught: false },
      alwaysOn: { frames: 391, moved: 9.775, caughtBy: 'project-depth' },
      escape: { frames: 1658, centerMargin: 1.935318, projectMargin: 2.92, maxProx: 0.895745, visibleFrames: 3, moved: 14.125, finalFacing: 1.570796 },
      caught: { frames: 465, caughtBy: 'project-depth', centerMargin: 0.111121, projectMargin: -0.018912, moved: 7.15 }
    },
    {
      dt: 0.05,
      quiet: { frames: 400, moved: 0, maxProx: 0, caught: false },
      alwaysOn: { frames: 132, moved: 9.9, caughtBy: 'project-depth' },
      escape: { frames: 554, centerMargin: 1.954529, projectMargin: 2.87, maxProx: 0.894267, visibleFrames: 1, moved: 14.175, finalFacing: 1.570796 },
      caught: { frames: 156, caughtBy: 'project-depth', centerMargin: -0.073866, projectMargin: -0.203884, moved: 7.275 }
    }
  ]
};
var RUNTIME_SHA256 = 'df9436e9b4e511983acb9b5e87b6529e3dfdb4ae14aee3d9a9cd6357d6bc0fa8';
var CORE_SHA256 = '053446e11c840a25d676a3677ea8d26644d4dfea32cbdb2037950281edb77529';
var INTERFACE_SHA256 = 'ce5ec8c8590e61d4569238799667f22a277b84cb62a89021dcde6abf58324f48';
var PLANNED_GRID = [
  '###########',
  '#.........#',
  '#.#.#####.#',
  '#.#.....#.#',
  '#.#.###.#.#',
  '#.#.#...#.#',
  '#.#.#.#.#.#',
  '#.#...#.#.#',
  '#.#####.#.#',
  '#.#.....#D#',
  '###########'
];
var BASELINE_GRID = [
  '###########',
  '#.........#',
  '#.#######.#',
  '#.#.....#.#',
  '#.#.###.#.#',
  '#.#.#...#.#',
  '#.#.#.#.#.#',
  '#.#...#.#.#',
  '#.#####.#.#',
  '#K......#D#',
  '###########'
];
var CADENCES = [1 / 120, 1 / 60, 0.05];

var pass = 0, fail = 0;
function ok(condition, message, detail) {
  if (condition) { pass++; console.log('  ok  ' + message); }
  else { fail++; console.log('  FAIL ' + message + (detail ? ' -> ' + detail : '')); }
}
function own(value, key) { return Object.prototype.hasOwnProperty.call(value || {}, key); }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function loadWorld() { return fresh(WORLD_PATH); }
function horrorNodes(world) { return world.maps.m.nodes; }
function horrorNode(world) { return horrorNodes(world).horror_maze; }
function onlyMonster(maze) { return Array.isArray(maze.monsters) && maze.monsters.length === 1 ? maze.monsters[0] : null; }
function horrorEntry(world) {
  return (horrorNodes(world).hub.links || []).filter(function (link) { return link.to === 'horror_entrance'; })[0];
}
function coordKey(x, y) { return x + ',' + y; }
function functionSource(fn) { return Function.prototype.toString.call(fn); }

/* JSON.stringify 会吞 undefined/空槽/额外字段；冻结 hash 必须先经过严格 byte grammar。 */
function canonicalize(value) {
  if (value === undefined) throw new TypeError('canonicalizer rejects undefined');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('canonicalizer rejects non-finite number');
  if (typeof value === 'number' && Object.is(value, -0)) return { '$number': '-0' };
  if (typeof value === 'function') return { '$function': functionSource(value) };
  if (typeof value === 'symbol' || typeof value === 'bigint') throw new TypeError('canonicalizer rejects unsupported scalar');
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('canonicalizer rejects array symbol fields');
    var allowed = { length: true }, outArray = new Array(value.length);
    var lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!lengthDescriptor || lengthDescriptor.get || lengthDescriptor.set || lengthDescriptor.enumerable || lengthDescriptor.configurable || !lengthDescriptor.writable)
      throw new TypeError('canonicalizer rejects non-standard array length descriptor');
    for (var index = 0; index < value.length; index++) {
      var key = String(index), descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) throw new TypeError('canonicalizer rejects sparse array slot:' + key);
      if (descriptor.get || descriptor.set || !descriptor.enumerable || !descriptor.configurable || !descriptor.writable)
        throw new TypeError('canonicalizer rejects non-standard array slot descriptor:' + key);
      allowed[key] = true; outArray[index] = canonicalize(descriptor.value);
    }
    Object.getOwnPropertyNames(value).forEach(function (arrayKey) {
      if (!allowed[arrayKey]) throw new TypeError('canonicalizer rejects extra array own property:' + arrayKey);
    });
    return outArray;
  }
  if (value && typeof value === 'object') {
    var proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError('canonicalizer only accepts plain objects');
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('canonicalizer rejects symbol fields');
    var out = {};
    Object.getOwnPropertyNames(value).sort().forEach(function (objectKey) {
      var descriptor = Object.getOwnPropertyDescriptor(value, objectKey);
      if (!descriptor || descriptor.get || descriptor.set) throw new TypeError('canonicalizer rejects accessor:' + objectKey);
      if (!descriptor.enumerable || !descriptor.configurable || !descriptor.writable)
        throw new TypeError('canonicalizer rejects non-standard object descriptor:' + objectKey);
      out[objectKey] = canonicalize(descriptor.value);
    });
    return out;
  }
  return value;
}
function canonicalString(value) { return JSON.stringify(canonicalize(value)); }
function sha256(value) {
  var bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : canonicalString(value), 'utf8');
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
function canonicalCoreBytes(bytes) {
  return Buffer.from(bytes.toString('utf8').replace(/var AMATLAS_VERSION = '[^']*';/, "var AMATLAS_VERSION = '__AMATLAS_VERSION__';"), 'utf8');
}
function descriptorClone(value, omit) {
  var clone = Object.create(Object.getPrototypeOf(value));
  Object.getOwnPropertyNames(value).forEach(function (key) {
    if (!omit || !omit[key]) Object.defineProperty(clone, key, Object.getOwnPropertyDescriptor(value, key));
  });
  Object.getOwnPropertySymbols(value).forEach(function (key) { Object.defineProperty(clone, key, Object.getOwnPropertyDescriptor(value, key)); });
  return clone;
}
function worldEnvelope(world) {
  var out = {};
  ['id', 'start', 'seed', 'initState', 'items'].forEach(function (key) { if (own(world, key)) out[key] = world[key]; });
  return out;
}
function targetProjection(world) {
  var nodes = horrorNodes(world), entry = horrorEntry(world);
  return {
    entry: entry,
    entrance: nodes.horror_entrance,
    maze: nodes.horror_maze,
    escaped: nodes.horror_escaped,
    taken: nodes.horror_taken,
    fled: nodes.horror_fled,
    resetHorrorSource: entry && typeof entry.run === 'function' ? functionSource(entry.run) : null
  };
}
function nonTargetProjection(world) {
  var maps = {};
  Object.getOwnPropertyNames(world.maps || {}).forEach(function (mapId) {
    var map = world.maps[mapId], mapCopy = descriptorClone(map, { nodes: true }), nodes = {};
    Object.getOwnPropertyNames(map.nodes || {}).forEach(function (nodeId) {
      if (mapId === 'm' && ['horror_entrance', 'horror_maze', 'horror_escaped', 'horror_taken', 'horror_fled'].indexOf(nodeId) >= 0) return;
      if (mapId === 'm' && nodeId === 'hub') {
        var hub = descriptorClone(map.nodes[nodeId], { links: true });
        Object.defineProperty(hub, 'links', {
          value: map.nodes[nodeId].links.filter(function (link) { return link.to !== 'horror_entrance'; }),
          enumerable: true, configurable: true, writable: true
        });
        nodes[nodeId] = hub;
      } else nodes[nodeId] = map.nodes[nodeId];
    });
    Object.defineProperty(mapCopy, 'nodes', { value: nodes, enumerable: true, configurable: true, writable: true });
    maps[mapId] = mapCopy;
  });
  return maps;
}

function capture(source, pattern, label) {
  var match = pattern.exec(source);
  if (!match) throw new Error('hash transaction anchor missing:' + label);
  return match[1];
}
function block(source, pattern, label) { return capture(source, pattern, label); }
function targetHashes(source) {
  var matches = [], pattern = /recipe: '([^']+)'[^\r\n]*hash: '([0-9a-f]{64})'/g, match;
  while ((match = pattern.exec(source))) matches.push({ recipe: match[1], sha256: match[2] });
  if (matches.length !== 5) throw new Error('expected five dogfood target hashes, got ' + matches.length);
  return matches;
}
function hashTradeSnapshot(sources) {
  var recipeWorld = block(sources.recipe, /var WORLD_HASHES = \{([\s\S]*?)\n\};/, 'recipe-world-block');
  var recipeEnvelope = block(sources.recipe, /var ENVELOPES = \{([\s\S]*?)\n\};/, 'recipe-envelope-block');
  var fpsBaseline = block(sources.fps, /BASELINE: \{([\s\S]*?)\n  \},\n  KIT:/, 'fps-baseline-block');
  var fpsKit = block(sources.fps, /KIT: \{([\s\S]*?)\n  \}\n\};/, 'fps-kit-block');
  var fpsEnvelopes = block(sources.fps, /var WORLD_ENVELOPES = \{([\s\S]*?)\n\};/, 'fps-envelope-block');
  var fpsProjections = block(sources.fps, /var FROZEN_WORLD_PROJECTIONS = \{([\s\S]*?)\n\};/, 'fps-projection-block');
  var puzzleBaseline = block(sources.puzzle, /BASELINE: \{([\s\S]*?)\n  \},\n  PUZZLE_KIT:/, 'puzzle-baseline-block');
  var puzzleKit = block(sources.puzzle, /PUZZLE_KIT: \{([\s\S]*?)\n  \}\n\};/, 'puzzle-kit-block');
  return {
    allowedFive: {
      recipeMazeWorld: capture(recipeWorld, /maze3d: '([0-9a-f]{64})'/, 'recipe maze world'),
      fpsMazeProjection: capture(fpsProjections, /maze3d: '([0-9a-f]{64})'/, 'fps maze projection'),
      fpsKitMazeWorld: capture(fpsKit, /mazeWorld: '([0-9a-f]{64})'/, 'fps kit maze world'),
      puzzleNonTarget: capture(sources.puzzle, /var NON_TARGET_SHA256 = '([0-9a-f]{64})'/, 'puzzle non-target'),
      puzzleKitHashTrade: capture(puzzleKit, /hashTradeSha256: '([0-9a-f]{64})'/, 'puzzle kit hash trade')
    },
    frozen: {
      recipeTargets: targetHashes(sources.recipe),
      recipeMazeEnvelope: capture(recipeEnvelope, /maze3d: '([0-9a-f]{64})'/, 'recipe maze envelope'),
      recipeOriginEnvelope: capture(recipeEnvelope, /origin: '([0-9a-f]{64})'/, 'recipe origin envelope'),
      recipeOriginWorld: capture(recipeWorld, /origin: '([0-9a-f]{64})'/, 'recipe origin world'),
      recipePresentation: capture(sources.recipe, /EXPECTED_PRESENTATION_SIGNATURE = '([^']+)'/, 'recipe presentation'),
      recipeGallery: capture(sources.recipe, /EXPECTED_GALLERY_RECIPE_SHA256 = '([0-9a-f]{64})'/, 'recipe gallery'),
      recipeRuntime: capture(sources.recipe, /RUNTIME_SHA256 = '([0-9a-f]{64})'/, 'recipe runtime'),
      fpsBaseline: fpsBaseline.match(/[0-9a-f]{64}/g),
      fpsKitAllowedSurface: capture(fpsKit, /allowedSurfaceSha256: '([0-9a-f]{64})'/, 'fps kit allowed surface'),
      fpsKitClose: capture(fpsKit, /closeSignatureSha256: '([0-9a-f]{64})'/, 'fps kit close'),
      fpsKitResource: capture(fpsKit, /resourceSignatureSha256: '([0-9a-f]{64})'/, 'fps kit resource'),
      fpsKitIndustrialTarget: capture(fpsKit, /industrialTarget: '([0-9a-f]{64})'/, 'fps kit industrial'),
      fpsKitOriginWorld: capture(fpsKit, /originWorld: '([0-9a-f]{64})'/, 'fps kit origin world'),
      fpsWorldEnvelopes: fpsEnvelopes.match(/[0-9a-f]{64}/g),
      fpsOriginProjection: capture(fpsProjections, /origin: '([0-9a-f]{64})'/, 'fps origin projection'),
      fpsDogfoodProtected: capture(sources.fps, /DOGFOOD_PROTECTED_SOURCE_SHA256 = '([0-9a-f]{64})'/, 'fps dogfood protected'),
      fpsRuntime: capture(sources.fps, /RUNTIME_SHA256 = '([0-9a-f]{64})'/, 'fps runtime'),
      puzzleBaseline: puzzleBaseline.match(/[0-9a-f]{64}/g),
      puzzleKitProjection: capture(puzzleKit, /puzzleProjectionSha256: '([0-9a-f]{64})'/, 'puzzle kit projection'),
      puzzleKitEnvelope: capture(puzzleKit, /worldEnvelopeSha256: '([0-9a-f]{64})'/, 'puzzle kit envelope'),
      puzzleKitPresentation: capture(puzzleKit, /presentationSha256: '([0-9a-f]{64})'/, 'puzzle kit presentation'),
      puzzleRuntime: capture(sources.puzzle, /RUNTIME_SHA256 = '([0-9a-f]{64})'/, 'puzzle runtime')
    }
  };
}
function currentHashes(world, sources) {
  return {
    targetProjectionSha256: sha256(targetProjection(world)),
    nonTargetProjectionSha256: sha256(nonTargetProjection(world)),
    worldEnvelopeSha256: sha256(worldEnvelope(world)),
    hashTradeSha256: sha256(hashTradeSnapshot(sources))
  };
}
function phaseComplete(transaction) {
  return transaction && Object.keys(transaction).length === 4 && Object.keys(transaction).every(function (key) {
    return /^[0-9a-f]{64}$/.test(String(transaction[key] || ''));
  });
}

function cellAt(grid, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= grid.length || x < 0 || x >= grid[y].length) return null;
  return grid[y][x];
}
function setCell(grid, x, y, ch) { grid[y] = grid[y].slice(0, x) + ch + grid[y].slice(x + 1); }
function isBlocked(grid, x, y) { var ch = cellAt(grid, x, y); return ch == null || ch === '#' || ch === 'D'; }
function blockedAt(item) { var out = {}; if (item) out[coordKey(item.x, item.y)] = true; return out; }
function bfsPath(grid, start, goal, blocked) {
  blocked = blocked || {};
  if (!start || !goal || blocked[coordKey(start.x, start.y)] || blocked[coordKey(goal.x, goal.y)] || isBlocked(grid, start.x, start.y) || isBlocked(grid, goal.x, goal.y)) return null;
  var queue = [{ x: start.x, y: start.y }], seen = {}, came = {};
  seen[coordKey(start.x, start.y)] = true;
  for (var index = 0; index < queue.length; index++) {
    var current = queue[index], currentKey = coordKey(current.x, current.y);
    if (current.x === goal.x && current.y === goal.y) {
      var pathOut = [current], walk = currentKey;
      while (came[walk]) { walk = came[walk]; var parts = walk.split(','); pathOut.push({ x: +parts[0], y: +parts[1] }); }
      return pathOut.reverse();
    }
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (delta) {
      var x = current.x + delta[0], y = current.y + delta[1], key = coordKey(x, y);
      if (!seen[key] && !blocked[key] && !isBlocked(grid, x, y)) { seen[key] = true; came[key] = currentKey; queue.push({ x: x, y: y }); }
    });
  }
  return null;
}
function bfsDistance(grid, start, goal, blocked) { var result = bfsPath(grid, start, goal, blocked); return result ? result.length - 1 : Infinity; }
function eventAt(maze, x, y) { return (maze.events || []).filter(function (event) { return event.x === x && event.y === y; })[0]; }
function linkTo(node, destination) { return (node.links || []).filter(function (link) { return link.to === destination; })[0]; }
function countGrid(grid, ch) {
  var count = 0; grid.forEach(function (row) { for (var x = 0; x < row.length; x++) if (row[x] === ch) count++; }); return count;
}
function walkableNeighbors(grid, point) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(function (delta) { return { x: point.x + delta[0], y: point.y + delta[1] }; })
    .filter(function (candidate) { return !isBlocked(grid, candidate.x, candidate.y); });
}

function addPhotoOnce(state) {
  state.flags = state.flags || {};
  if (!state.flags.foundPhoto) { state.flags.foundPhoto = true; (state.inventory || (state.inventory = [])).push('photo'); }
}
function makePursuitKitWorld() {
  var world = loadWorld(), nodes = horrorNodes(world), entry = horrorEntry(world), node = nodes.horror_maze;
  entry.label = 'Recipe 2 · 地底回廊:安静探路、触石唤醒、持钥回程';
  nodes.horror_entrance.look = '先在安静的地底回廊辨认锁门与路线。触碰深处石座会放出骨钥匙,也会唤醒唯一的伪人;拿上钥匙,沿刚走过的路回到出口。';
  node.look = '先在安静中认路、预访锁门并查看血照片。触碰石座会放出骨钥匙并唤醒伪人;下一刻拿到钥匙后,沿熟悉路线回门。';
  node.wonText = '你带着骨钥匙撞开门。拖曳声在门后停住,回廊终于安静下来。';
  node.caughtText = '回程的拖曳声突然贴近。一张几乎是人的脸从黑暗里压了上来。';
  node.maze.grid = PLANNED_GRID.slice();
  node.maze.start = { x: 1, y: 1, dir: 'E' };
  node.maze.monsters = [{ x: 5, y: 5, face: 'mimic', active: false }];
  node.maze.chaseSpeed = 1.5;
  delete node.maze.combat;
  node.maze.events = [
    { x: 5, y: 3, once: true, visual: 'pickup', icon: 'photo', hint: '脚下踩到半张照片,浸透了血。', run: addPhotoOnce },
    { x: 1, y: 9, once: true, visual: 'marker', hint: '石座裂开,骨钥匙浮出。内环深处响起拖曳声——拿上钥匙,回到你见过的那扇门。', set: [{ x: 1, y: 9, ch: 'K' }], activateMonsters: [0] }
  ];
  nodes.horror_escaped.look = function (state) { return '你瘫坐在出口外,终于听不见回廊里的拖曳声。' + (state.flags && state.flags.foundPhoto ? '\n\n那半张血照片仍在你手里。' : ''); };
  nodes.horror_taken.look = '黑暗吞掉了回程。被抓事实来自同一只在石座事件后苏醒的伪人。';
  nodes.horror_fled.look = '你在终局前主动退回石阶。回廊的环境声和追逐音乐都在这里停止。';
  nodes.horror_fled.audio = { ambient: false, music: false };
  return world;
}

function baselineErrors(world) {
  var errors = [], node = horrorNode(world), maze = node.maze, monster = onlyMonster(maze), photo = eventAt(maze, 5, 1);
  if (canonicalString(maze.grid) !== canonicalString(BASELINE_GRID)) errors.push('baseline:grid');
  if (canonicalString(maze.start) !== canonicalString({ x: 1, y: 1, dir: 'E' })) errors.push('baseline:start');
  if (countGrid(maze.grid, 'K') !== 1 || cellAt(maze.grid, 1, 9) !== 'K') errors.push('baseline:static-key');
  if (!Array.isArray(maze.monsters) || maze.monsters.length !== 1 || !monster || monster.x !== 5 || monster.y !== 5 || monster.face !== 'mimic' || own(monster, 'active')) errors.push('baseline:always-on-monster');
  if (maze.chaseSpeed !== 1.5 || own(maze, 'combat')) errors.push('baseline:ordinary-speed');
  if (!photo || !photo.once || photo.visual !== 'pickup' || photo.icon !== 'photo' || typeof photo.run !== 'function' || (maze.events || []).length !== 1) errors.push('baseline:photo-only');
  if (eventAt(maze, 1, 9)) errors.push('baseline:no-wake-event');
  if (own(horrorNodes(world).horror_fled, 'audio')) errors.push('baseline:fled-inherits-audio');
  var state = { flags: {}, inventory: [] }; if (photo && photo.run) { photo.run(state); photo.run(state); }
  if (!state.flags.foundPhoto || canonicalString(state.inventory) !== canonicalString(['photo'])) errors.push('baseline:photo-dedupe');
  return errors;
}

function shapeErrors(world) {
  var errors = [], node = horrorNode(world), maze = node && node.maze || {}, grid = maze.grid || [], monster = onlyMonster(maze);
  if (!node || node.kind !== 'maze3d' || node.winKey !== 'horrorEscaped' || node.scareKey !== 'horrorCaught') errors.push('shape:node-contract');
  if (canonicalString(grid) !== canonicalString(PLANNED_GRID)) errors.push('shape:grid');
  if (canonicalString(maze.start) !== canonicalString({ x: 1, y: 1, dir: 'E' })) errors.push('shape:start');
  if (cellAt(grid, 3, 2) !== '.' || cellAt(grid, 2, 9) !== '#') errors.push('shape:topology-trade');
  if (countGrid(grid, 'K') !== 0) errors.push('shape:initial-static-key');
  if (countGrid(grid, 'D') !== 1 || cellAt(grid, 9, 9) !== 'D') errors.push('shape:single-door');
  if (!Array.isArray(maze.monsters) || maze.monsters.length !== 1 || canonicalString(monster || {}) !== canonicalString({ x: 5, y: 5, face: 'mimic', active: false })) errors.push('shape:single-inactive-monster');
  if (own(maze, 'combat')) errors.push('shape:no-combat');
  if (!(typeof maze.chaseSpeed === 'number' && Number.isFinite(maze.chaseSpeed) && maze.chaseSpeed === 1.5)) errors.push('shape:chase-speed');
  var photo = eventAt(maze, 5, 3), stone = eventAt(maze, 1, 9);
  if (!Array.isArray(maze.events) || maze.events.length !== 2 || !photo || photo.once !== true || photo.visual !== 'pickup' || photo.icon !== 'photo' || typeof photo.run !== 'function') errors.push('shape:photo-event');
  if (!stone) errors.push('shape:stone-missing');
  else {
    if (stone.once !== true) errors.push('shape:stone-once');
    if (stone.visual !== 'marker') errors.push('shape:stone-marker');
    if (typeof stone.hint !== 'string' || !stone.hint.trim()) errors.push('shape:stone-hint');
    if (canonicalString(stone.set || []) !== canonicalString([{ x: 1, y: 9, ch: 'K' }])) errors.push('shape:stone-same-cell-key');
    if (canonicalString(stone.activateMonsters || []) !== canonicalString([0])) errors.push('shape:stone-activation-index');
    if (own(stone, 'run') || own(stone, 'deactivateMonsters')) errors.push('shape:stone-session-only');
  }
  if (own(world.initState, 'horrorPursuitStarted') || own(world.initState, 'hasKey') || own(world.initState, 'triggered') || own(world.initState, 'monsterActive')) errors.push('shape:no-durable-session-state');
  return errors;
}
function topologyErrors(world) {
  var errors = [], maze = horrorNode(world).maze, grid = maze.grid, start = maze.start;
  var stone = { x: 1, y: 9 }, door = { x: 9, y: 8 }, photo = { x: 5, y: 3 };
  var distances = [
    bfsDistance(grid, start, stone), bfsDistance(grid, start, door), bfsDistance(grid, stone, door),
    bfsDistance(grid, start, photo), bfsDistance(grid, photo, stone),
    bfsDistance(grid, start, photo, blockedAt(stone)), bfsDistance(grid, start, door, blockedAt(photo))
  ];
  var normalizedDistances = distances.map(function (distance) { return Number.isFinite(distance) ? distance : 'unreachable'; });
  if (canonicalString(normalizedDistances) !== canonicalString([8, 15, 23, 6, 14, 6, 15])) errors.push('topology:blocked-bfs');
  if (canonicalString(walkableNeighbors(grid, stone)) !== canonicalString([{ x: 1, y: 8 }])) errors.push('topology:stone-dead-end');
  var stoneEvent = eventAt(maze, stone.x, stone.y);
  if (!stoneEvent || cellAt(grid, stone.x, stone.y) !== '.' || cellAt(grid, 5, 5) !== '.' || cellAt(grid, 5, 3) !== '.' || cellAt(grid, 9, 8) !== '.') errors.push('topology:functional-floor');
  if (!stoneEvent || !(stoneEvent.set || []).some(function (set) { return set.ch === 'K'; })) errors.push('topology:need-key-from-event');
  return errors;
}

/* 以下只镜像当前 runtime 的决定性逐帧语义；runtime bytes 另由 SHA 锁死。 */
function astarNext(grid, sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return null;
  var open = [[sx, sy]], gsc = {}, fsc = {}, came = {}, inOpen = {}, start = coordKey(sx, sy), guard = 0;
  gsc[start] = 0; fsc[start] = Math.abs(sx - tx) + Math.abs(sy - ty); inOpen[start] = true;
  while (open.length && guard++ < 4000) {
    var best = 0;
    for (var i = 1; i < open.length; i++) if (fsc[coordKey(open[i][0], open[i][1])] < fsc[coordKey(open[best][0], open[best][1])]) best = i;
    var current = open.splice(best, 1)[0], currentKey = coordKey(current[0], current[1]); inOpen[currentKey] = false;
    if (current[0] === tx && current[1] === ty) {
      var walk = currentKey; while (came[walk] && came[walk] !== start) walk = came[walk];
      var parts = walk.split(','); return [+parts[0], +parts[1]];
    }
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (delta) {
      var x = current[0] + delta[0], y = current[1] + delta[1]; if (isBlocked(grid, x, y)) return;
      var key = coordKey(x, y), tentative = gsc[currentKey] + 1;
      if (gsc[key] == null || tentative < gsc[key]) {
        came[key] = currentKey; gsc[key] = tentative; fsc[key] = tentative + Math.abs(x - tx) + Math.abs(y - ty);
        if (!inOpen[key]) { open.push([x, y]); inOpen[key] = true; }
      }
    });
  }
  return null;
}
function normalizedAngle(angle) { while (angle < -Math.PI) angle += Math.PI * 2; while (angle > Math.PI) angle -= Math.PI * 2; return angle; }
function projectDepth(session, monster) {
  var dx = monster.sx - session.px, dy = monster.sy - session.py, distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < 0.05) distance = 0.05;
  var angle = normalizedAngle(Math.atan2(dy, dx) - session.a), fov = 66 * Math.PI / 180;
  if (Math.abs(angle) > fov * 0.75) return null;
  var depth = distance * Math.cos(angle); return depth < 0.05 ? 0.05 : depth;
}
function eventSetsKey(events) {
  return (events || []).some(function (event) { return (event.set || []).some(function (set) { return set.ch === 'K'; }); });
}
function makeSession(world, forcedActive) {
  var node = horrorNode(world), maze = node.maze, grid = maze.grid.slice(), items = [];
  grid.forEach(function (row, y) { for (var x = 0; x < row.length; x++) if (row[x] === 'K') items.push({ sx: x + 0.5, sy: y + 0.5, taken: false }); });
  var session = {
    node: node, maze: maze, grid: grid, px: maze.start.x + 0.5, py: maze.start.y + 0.5, a: 0, prevCX: maze.start.x, prevCY: maze.start.y,
    monsters: (maze.monsters || []).map(function (monster) { return { sx: monster.x + 0.5, sy: monster.y + 0.5, active: forcedActive == null ? monster.active !== false : forcedActive, chase: monster.chase !== false }; }),
    items: items, needKey: items.length > 0 || eventSetsKey(maze.events), hasKey: false, triggered: {}, state: { flags: {}, inventory: [], horrorEscaped: false, horrorCaught: false },
    won: false, caught: false, atDoor: false, prox: 0, frameIndex: 0, trace: [], maxProx: 0, visibleFrames: 0, monsterDistanceMoved: 0,
    minCenterMargin: Infinity, minProjectMargin: Infinity, caughtBy: null, lockedDoorSeen: false, wrongFacingRejected: false
  };
  return session;
}
function hasKeyContextTarget(session) {
  return session.items.some(function (item) {
    if (item.taken || session.hasKey) return false;
    var dx = item.sx - session.px, dy = item.sy - session.py, distance2 = dx * dx + dy * dy;
    return distance2 <= 2.25 && Math.cos(session.a) * dx + Math.sin(session.a) * dy > 0.35;
  });
}
function settleEvent(session, event, eventIndex) {
  if (event.run) event.run(session.state);
  if (event.set) event.set.forEach(function (set) {
    var previous = cellAt(session.grid, set.x, set.y); setCell(session.grid, set.x, set.y, set.ch);
    if (set.ch === 'K' && previous !== 'K') { session.items.push({ sx: set.x + 0.5, sy: set.y + 0.5, taken: false }); session.needKey = true; session.trace.push({ frame: session.frameIndex, action: 'set-K' }); }
  });
  if (event.deactivateMonsters != null) {
    var deactivated = event.deactivateMonsters === true ? session.monsters.map(function (_, i) { return i; }) : event.deactivateMonsters;
    deactivated.forEach(function (index) { if (session.monsters[index]) session.monsters[index].active = false; });
  }
  if (event.activateMonsters != null) {
    var activated = event.activateMonsters === true ? session.monsters.map(function (_, i) { return i; }) : event.activateMonsters;
    activated.forEach(function (index) { if (session.monsters[index]) session.monsters[index].active = true; });
    session.trace.push({ frame: session.frameIndex, action: 'activate' });
  }
  if (event.once) session.triggered[eventIndex] = true;
}
function doorAhead(session) {
  var x = Math.floor(session.px + Math.cos(session.a) * 0.55), y = Math.floor(session.py + Math.sin(session.a) * 0.55);
  return cellAt(session.grid, x, y) === 'D';
}
function stepSession(session, inputDt, target, facing) {
  if (session.won || session.caught) return;
  var dt = Math.min(0.05, inputDt); session.frameIndex++;
  if (target) {
    var tx = target.x + 0.5, ty = target.y + 0.5, dx = tx - session.px, dy = ty - session.py, distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 1e-9) {
      var step = Math.min(distance, 2.6 * dt); session.a = Math.atan2(dy, dx); session.px += dx / distance * step; session.py += dy / distance * step;
    }
  }
  if (facing != null) session.a = facing;
  if (session.needKey && !session.hasKey) for (var itemIndex = 0; itemIndex < session.items.length; itemIndex++) {
    var item = session.items[itemIndex]; if (item.taken) continue;
    var itemDx = session.px - item.sx, itemDy = session.py - item.sy;
    if (itemDx * itemDx + itemDy * itemDy < 0.25) { item.taken = true; session.hasKey = true; session.trace.push({ frame: session.frameIndex, action: 'acquire-K' }); break; }
  }
  var cellX = Math.floor(session.px), cellY = Math.floor(session.py), cellChanged = cellX !== session.prevCX || cellY !== session.prevCY;
  if (cellChanged) (session.maze.events || []).forEach(function (event, eventIndex) {
    if (event.x === cellX && event.y === cellY && !(event.once && session.triggered[eventIndex])) settleEvent(session, event, eventIndex);
  });
  session.prevCX = cellX; session.prevCY = cellY;
  session.atDoor = doorAhead(session);
  if (session.atDoor && session.needKey && !session.hasKey) session.lockedDoorSeen = true;
  if (session.atDoor && (!session.needKey || session.hasKey)) { session.won = true; session.state[session.node.winKey] = true; return; }
  var nearest = Infinity;
  for (var monsterIndex = 0; monsterIndex < session.monsters.length && !session.won && !session.caught; monsterIndex++) {
    var monster = session.monsters[monsterIndex]; if (!monster.active) continue;
    var beforeX = monster.sx, beforeY = monster.sy;
    if (monster.chase) {
      var mcx = Math.floor(monster.sx), mcy = Math.floor(monster.sy), pcx = Math.floor(session.px), pcy = Math.floor(session.py), chaseX = monster.sx, chaseY = monster.sy;
      if (mcx === pcx && mcy === pcy) { chaseX = session.px; chaseY = session.py; }
      else { var next = astarNext(session.grid, mcx, mcy, pcx, pcy); if (next) { chaseX = next[0] + 0.5; chaseY = next[1] + 0.5; } }
      var chaseDx = chaseX - monster.sx, chaseDy = chaseY - monster.sy, chaseDistance = Math.sqrt(chaseDx * chaseDx + chaseDy * chaseDy);
      if (chaseDistance > 0.001) { var monsterStep = Math.min(chaseDistance, session.maze.chaseSpeed * dt); monster.sx += chaseDx / chaseDistance * monsterStep; monster.sy += chaseDy / chaseDistance * monsterStep; }
    }
    var moved = Math.sqrt((monster.sx - beforeX) * (monster.sx - beforeX) + (monster.sy - beforeY) * (monster.sy - beforeY));
    session.monsterDistanceMoved += moved;
    if (moved > 0) session.trace.push({ frame: session.frameIndex, action: 'monster-step' });
    var dd = Math.sqrt((session.px - monster.sx) * (session.px - monster.sx) + (session.py - monster.sy) * (session.py - monster.sy));
    if (dd < nearest) nearest = dd;
    var depth = projectDepth(session, monster); if (depth != null) session.visibleFrames++;
    session.minCenterMargin = Math.min(session.minCenterMargin, dd - 0.42);
    if (depth != null) session.minProjectMargin = Math.min(session.minProjectMargin, depth - 0.55);
    if ((depth != null && depth < 0.55) || dd < 0.42) {
      session.caught = true; session.caughtBy = depth != null && depth < 0.55 ? 'project-depth' : 'center-distance'; session.state[session.node.scareKey] = true; break;
    }
  }
  if (nearest < 14 && !session.caught) session.prox = Math.max(0, Math.min(1, (14 - nearest) / 13)); else if (!session.caught) session.prox = 0;
  session.maxProx = Math.max(session.maxProx, session.prox);
}
function runPath(session, pathValue, dt, facing, travelFacing) {
  if (!pathValue) return false;
  for (var pathIndex = 1; pathIndex < pathValue.length && !session.won && !session.caught; pathIndex++) {
    var target = pathValue[pathIndex], guard = 0;
    while (!session.won && !session.caught && Math.sqrt(Math.pow(session.px - (target.x + 0.5), 2) + Math.pow(session.py - (target.y + 0.5), 2)) > 1e-8 && guard++ < 2000)
      stepSession(session, dt, target, travelFacing == null ? null : travelFacing);
  }
  if (!session.won && !session.caught && facing != null) stepSession(session, dt, null, facing);
  return !session.caught;
}
function pump(session, seconds, dt) { for (var elapsed = 0; elapsed < seconds && !session.won && !session.caught; elapsed += Math.min(0.05, dt)) stepSession(session, dt, null, null); }
function actionFrame(session, action) { var item = session.trace.filter(function (entry) { return entry.action === action; })[0]; return item && item.frame; }
function route(world, from, to) { return bfsPath(horrorNode(world).maze.grid, from, to); }
function sequenceProbe(world, dt) {
  var session = makeSession(world), maze = horrorNode(world).maze, stone = { x: 1, y: 9 };
  var adjacent = makeSession(world); adjacent.px = 1.5; adjacent.py = 8.5; adjacent.a = Math.PI / 2;
  var preWakeNoKey = adjacent.needKey && adjacent.items.length === 0 && !hasKeyContextTarget(adjacent);
  runPath(session, route(world, maze.start, stone), dt, null);
  var stoneIndex = (maze.events || []).indexOf(eventAt(maze, 1, 9));
  return {
    session: session,
    preWakeNoKey: preWakeNoKey,
    setFrame: actionFrame(session, 'set-K'), activateFrame: actionFrame(session, 'activate'), stepFrame: actionFrame(session, 'monster-step'), acquireFrame: actionFrame(session, 'acquire-K'),
    markerGone: !!session.triggered[stoneIndex], keyCount: session.items.filter(function (item) { return !item.taken; }).length + (session.hasKey ? 1 : 0)
  };
}
function escapeProbe(world, dt) {
  var maze = horrorNode(world).maze, session = makeSession(world), start = maze.start, door = { x: 9, y: 8 }, photo = { x: 5, y: 3 }, stone = { x: 1, y: 9 };
  runPath(session, route(world, start, door), dt, 0);
  var locked = session.lockedDoorSeen && !session.won;
  runPath(session, route(world, door, photo), dt, null);
  runPath(session, route(world, photo, stone), dt, null);
  var returnPath = route(world, stone, door);
  runPath(session, returnPath.slice(0, -1), dt, null);
  runPath(session, returnPath.slice(-2), dt, null, 0);
  var wrongFacingRejected = !session.won && !session.caught;
  if (wrongFacingRejected) stepSession(session, dt, null, Math.PI / 2);
  session.wrongFacingRejected = wrongFacingRejected;
  return { session: session, locked: locked, photo: !!session.state.flags.foundPhoto };
}
function caughtProbe(world, dt) {
  var maze = horrorNode(world).maze, session = makeSession(world), stone = { x: 1, y: 9 }, inner = { x: 3, y: 7 };
  runPath(session, route(world, maze.start, stone), dt, null);
  runPath(session, route(world, stone, inner), dt, null);
  if (!session.caught) pump(session, 8, dt);
  return session;
}
function runtimeSourceErrors(runtimeSource) {
  var required = [
    'var dt = Math.min(0.05, (ts - last) / 1000);',
    'if (g.needKey && !g.hasKey)',
    'function keyContextScore(item)',
    'if (evx.run) evx.run(st, api);',
    'if (evx.set) {',
    'if (evx.activateMonsters != null)',
    'if (!m.active) continue;',
    'var stp = Math.min(dl, chase * dt);',
    'var mpr = projectSprite(m);',
    'if ((mpr && mpr.depth < 0.55) || dd < 0.42)',
    'g.atDoor = doorAhead(0.55);',
    'if (g.atDoor) winNow();'
  ];
  var errors = [];
  required.forEach(function (needle) { if (runtimeSource.indexOf(needle) < 0) errors.push('runtime-source:' + needle); });
  var keyOrder = runtimeSource.indexOf('if (g.needKey && !g.hasKey)'), eventOrder = runtimeSource.indexOf('var ecx = Math.floor(g.px)'), monsterOrder = runtimeSource.indexOf('var nearest = Infinity');
  var runOrder = runtimeSource.indexOf('if (evx.run) evx.run(st, api);'), setOrder = runtimeSource.indexOf('if (evx.set) {'), activateOrder = runtimeSource.indexOf('if (evx.activateMonsters != null)');
  if (!(keyOrder >= 0 && keyOrder < eventOrder && eventOrder < monsterOrder)) errors.push('runtime-source:frame-order');
  if (!(runOrder >= 0 && runOrder < setOrder && setOrder < activateOrder)) errors.push('runtime-source:event-order');
  return errors;
}
function runtimeOracleErrors(world, runtimeSource) {
  var errors = runtimeSourceErrors(runtimeSource), sequence = sequenceProbe(world, 1 / 60);
  if (!sequence.preWakeNoKey || !(sequence.setFrame && sequence.setFrame === sequence.activateFrame && sequence.activateFrame === sequence.stepFrame && sequence.acquireFrame > sequence.stepFrame)) errors.push('runtime:stone-order');
  if (!sequence.markerGone || sequence.keyCount !== 1 || !sequence.session.hasKey) errors.push('runtime:marker-key-handoff');
  CADENCES.forEach(function (dt) {
    var quiet = makeSession(world); pump(quiet, 20, dt);
    if (quiet.caught || quiet.monsterDistanceMoved !== 0 || quiet.maxProx !== 0) errors.push('runtime:quiet:' + dt);
    var alwaysOn = makeSession(world, true); pump(alwaysOn, 20, dt);
    if (!alwaysOn.caught || alwaysOn.monsterDistanceMoved <= 0) errors.push('runtime:always-on-control:' + dt);
    var escape = escapeProbe(world, dt), escaped = escape.session;
    if (!escape.locked || !escape.photo || !escaped.hasKey || !escaped.won || escaped.caught || !escaped.state.horrorEscaped) errors.push('runtime:escape:' + dt);
    if (!escaped.wrongFacingRejected || Math.abs(normalizedAngle(escaped.a - Math.PI / 2)) > 1e-12 || !doorAhead(escaped)) errors.push('runtime:door-facing:' + dt);
    if (!(escaped.minCenterMargin > 0.08 && escaped.minProjectMargin > 0.08)) errors.push('runtime:escape-margin:' + dt);
    if (!(escaped.maxProx >= 0.35 || escaped.visibleFrames > 0)) errors.push('runtime:perceptibility:' + dt);
    var caught = caughtProbe(world, dt);
    if (!caught.caught || caught.won || !caught.state.horrorCaught || caught.monsterDistanceMoved <= 0 || !caught.caughtBy) errors.push('runtime:caught:' + dt);
  });
  var clamped = makeSession(world); stepSession(clamped, 0.08, null, null);
  if (clamped.frameIndex !== 1) errors.push('runtime:dt-clamp');
  return errors;
}

function resultAndResetErrors(world) {
  var errors = [], nodes = horrorNodes(world), node = nodes.horror_maze, entry = horrorEntry(world);
  var escaped = linkTo(node, 'horror_escaped'), taken = linkTo(node, 'horror_taken'), fled = linkTo(node, 'horror_fled');
  if (!escaped || !taken || !fled) errors.push('results:three-routes');
  if (escaped && (escaped.requires({ horrorEscaped: true }) !== true || escaped.requires({ horrorEscaped: false }) !== false)) errors.push('results:escaped-gate');
  if (taken && (taken.requires({ horrorCaught: true }) !== true || taken.requires({ horrorCaught: false }) !== false)) errors.push('results:caught-gate');
  if (fled && (fled.requires({ horrorEscaped: false, horrorCaught: false }) !== true || fled.requires({ horrorEscaped: true, horrorCaught: false }) !== false || fled.requires({ horrorEscaped: false, horrorCaught: true }) !== false)) errors.push('results:fled-gate');
  ['horror_escaped', 'horror_taken', 'horror_fled'].forEach(function (nodeId) {
    var result = nodes[nodeId]; if (!result || result.kind !== 'scene' || !linkTo(result, 'hub')) errors.push('results:terminal-node:' + nodeId);
  });
  if (!nodes.horror_fled || canonicalString(nodes.horror_fled.audio || {}) !== canonicalString({ ambient: false, music: false })) errors.push('results:fled-audio-release');
  var state = { horrorEscaped: true, horrorCaught: true, inventory: ['photo'], flags: { foundPhoto: true }, unrelated: 7 };
  if (!entry || typeof entry.run !== 'function') errors.push('reset:entry');
  else entry.run(state);
  if (state.horrorEscaped !== false || state.horrorCaught !== false) errors.push('reset:terminal-facts');
  if (canonicalString(state.inventory) !== canonicalString(['photo']) || !state.flags.foundPhoto || state.unrelated !== 7) errors.push('reset:persistent-accounting');
  var photo = eventAt(node.maze, 5, 3), photoState = { flags: {}, inventory: [] };
  if (photo && photo.run) { photo.run(photoState); photo.run(photoState); }
  if (!photoState.flags.foundPhoto || canonicalString(photoState.inventory) !== canonicalString(['photo'])) errors.push('reset:photo-dedupe');
  var createEngine = fresh(CORE_PATH).createEngine, createResetPlugin = fresh(RESET_PLUGIN_PATH).createResetPlugin;
  var resetWorld = {
    id: 'cf554c8b-b7df-45d8-b010-c787dc7b9768', start: { map: 'm', node: 'start' },
    initState: JSON.parse(JSON.stringify(world.initState)),
    maps: { m: { nodes: { start: { kind: 'pursuit-reset-probe', title: 'reset' } } } }
  };
  var engine = createEngine(resetWorld, { storage: null });
  engine.registerModule({ id: 'pursuit-reset-probe', nodeKinds: ['pursuit-reset-probe'], render: function () { return { title: 'reset', body: [] }; } });
  var plugin = createResetPlugin({ document: null, confirm: false }); engine.use(plugin); engine.start();
  var initialInventory = engine.state.inventory; engine.state.inventory.push('photo'); engine.state.horrorEscaped = true; engine.state.horrorCaught = true; plugin.reset();
  if (engine.state.horrorEscaped !== resetWorld.initState.horrorEscaped || engine.state.horrorCaught !== resetWorld.initState.horrorCaught ||
      canonicalString(engine.state.inventory) !== canonicalString(resetWorld.initState.inventory) || engine.state.inventory === initialInventory) errors.push('reset:global-plugin');
  return errors;
}
function freezeErrors(world, sources) {
  var errors = [], expected = ACTIVE_PHASE === 'PURSUIT_KIT' ? PHASE_TRANSACTIONS.PURSUIT_KIT : PHASE_TRANSACTIONS.BASELINE;
  try {
    if (sha256(targetProjection(world)) !== PLANNED_TARGET_SHA256) errors.push('freeze:planned-target');
    if (sha256(nonTargetProjection(world)) !== expected.nonTargetProjectionSha256) errors.push('freeze:non-target');
    if (sha256(worldEnvelope(world)) !== expected.worldEnvelopeSha256) errors.push('freeze:world-envelope');
    if (sha256(hashTradeSnapshot(sources)) !== expected.hashTradeSha256) errors.push('freeze:hash-trade');
  } catch (error) { errors.push('freeze:canonical:' + error.message); }
  return errors;
}
function pursuitKitErrors(world, sources, runtimeSource) {
  var errors = [], checks = [shapeErrors, topologyErrors, function (value) { return runtimeOracleErrors(value, runtimeSource); }, resultAndResetErrors, function (value) { return freezeErrors(value, sources); }];
  checks.forEach(function (check) {
    try { errors = errors.concat(check(world)); } catch (error) { errors.push('checker:exception:' + error.message); }
  });
  return errors;
}
function rounded(value) { return Number.isFinite(value) ? +value.toFixed(6) : String(value); }
function budgetSnapshot(world) {
  var sequence = sequenceProbe(world, 1 / 60);
  return {
    sequence: { set: sequence.setFrame, activate: sequence.activateFrame, monsterStep: sequence.stepFrame, acquire: sequence.acquireFrame },
    cadences: CADENCES.map(function (dt) {
      var escape = escapeProbe(world, dt).session, caught = caughtProbe(world, dt), quiet = makeSession(world), alwaysOn = makeSession(world, true);
      pump(quiet, 20, dt); pump(alwaysOn, 20, dt);
      return {
        dt: rounded(dt),
        quiet: { frames: quiet.frameIndex, moved: rounded(quiet.monsterDistanceMoved), maxProx: rounded(quiet.maxProx), caught: quiet.caught },
        alwaysOn: { frames: alwaysOn.frameIndex, moved: rounded(alwaysOn.monsterDistanceMoved), caughtBy: alwaysOn.caughtBy },
        escape: { frames: escape.frameIndex, centerMargin: rounded(escape.minCenterMargin), projectMargin: rounded(escape.minProjectMargin), maxProx: rounded(escape.maxProx), visibleFrames: escape.visibleFrames, moved: rounded(escape.monsterDistanceMoved), finalFacing: rounded(escape.a) },
        caught: { frames: caught.frameIndex, caughtBy: caught.caughtBy, centerMargin: rounded(caught.minCenterMargin), projectMargin: rounded(caught.minProjectMargin), moved: rounded(caught.monsterDistanceMoved) }
      };
    })
  };
}
function hasIssue(errors, prefix) { return errors.some(function (error) { return error.indexOf(prefix) === 0; }); }

console.log('Maze3D Pursuit & Escape Kit tests-first 闸');
var sources = {
  recipe: fs.readFileSync(RECIPE_TEST_PATH, 'utf8'),
  fps: fs.readFileSync(FPS_TEST_PATH, 'utf8'),
  puzzle: fs.readFileSync(PUZZLE_TEST_PATH, 'utf8')
};
var runtimeBytes = fs.readFileSync(RUNTIME_PATH), originRuntimeBytes = fs.readFileSync(ORIGIN_RUNTIME_PATH), runtimeSource = runtimeBytes.toString('utf8');
var coreBytes = fs.readFileSync(CORE_PATH), canonicalCore = canonicalCoreBytes(coreBytes), interfaceBytes = fs.readFileSync(INTERFACE_PATH);
var originWorld = fresh(ORIGIN_WORLD_PATH);
var world = loadWorld(), transaction = PHASE_TRANSACTIONS[ACTIVE_PHASE], baselineAuthorized = process.env[BASELINE_ENV] === '1';
ok(ACTIVE_PHASE === 'BASELINE' || ACTIVE_PHASE === 'PURSUIT_KIT', 'P0 阶段只能是唯一 BASELINE 或 PURSUIT_KIT', ACTIVE_PHASE);
ok(ACTIVE_PHASE === 'BASELINE' ? baselineAuthorized : !baselineAuthorized,
  'P1 BASELINE 仅 focused 显式授权；PURSUIT_KIT 硬拒 baseline 授权（正式 runner 不兼容旧态）',
  'phase=' + ACTIVE_PHASE + ' ' + BASELINE_ENV + '=' + String(process.env[BASELINE_ENV]));
ok(phaseComplete(transaction), 'P2 当前阶段四项冻结交易必须完整');
var hashes = currentHashes(world, sources);
ok(canonicalString(hashes) === canonicalString(transaction), 'P3 当前 formal world 只命中唯一阶段投影/非目标/envelope/hash交易', 'actual=' + canonicalString(hashes) + ' expected=' + canonicalString(transaction));
ok(sha256(runtimeBytes) === RUNTIME_SHA256 && sha256(originRuntimeBytes) === RUNTIME_SHA256 && runtimeBytes.equals(originRuntimeBytes), 'P4 Maze/Origin runtime 各自冻结且逐字节镜像', sha256(runtimeBytes) + '/' + sha256(originRuntimeBytes));
ok(sha256(canonicalCore) === CORE_SHA256 && sha256(interfaceBytes) === INTERFACE_SHA256, 'P5 core runtime（忽略打包器唯一版本戳注入位）与 module-interface 冻结 SHA', sha256(canonicalCore) + '/' + sha256(interfaceBytes));
ok(sha256(originWorld) === ORIGIN_WORLD_SHA256, 'P6 live Origin world 非目标投影冻结', sha256(originWorld));
if (ACTIVE_PHASE === 'BASELINE') {
  var oldErrors = baselineErrors(world);
  ok(oldErrors.length === 0, 'B1 当前 always-on Recipe 2 旧态证据完整', oldErrors.join(','));
} else {
  var formalErrors = pursuitKitErrors(world, sources, runtimeSource);
  ok(formalErrors.length === 0, 'K1 formal world 命中唯一 PURSUIT_KIT 消费者检查器', formalErrors.join(','));
}
var planned = makePursuitKitWorld(), plannedErrors = pursuitKitErrors(planned, sources, runtimeSource), plannedHashes = currentHashes(planned, sources);
ok(plannedErrors.length === 0, 'K2 同一检查器的完整 planned PURSUIT_KIT fixture 全绿', plannedErrors.join(','));
var actualBudgets = budgetSnapshot(planned);
ok(EXPECTED_BUDGETS && canonicalString(actualBudgets) === canonicalString(EXPECTED_BUDGETS), 'K2a 三档逐行等价 runtime oracle 的顺序/caught predicate/project depth/门朝向预算精确冻结', canonicalString(actualBudgets));
var plannedPhaseOk = ACTIVE_PHASE === 'BASELINE'
  ? plannedHashes.targetProjectionSha256 === PLANNED_TARGET_SHA256 && plannedHashes.targetProjectionSha256 !== PHASE_TRANSACTIONS.BASELINE.targetProjectionSha256 &&
    plannedHashes.nonTargetProjectionSha256 === PHASE_TRANSACTIONS.BASELINE.nonTargetProjectionSha256 && plannedHashes.worldEnvelopeSha256 === PHASE_TRANSACTIONS.BASELINE.worldEnvelopeSha256 && plannedHashes.hashTradeSha256 === PHASE_TRANSACTIONS.BASELINE.hashTradeSha256
  : canonicalString(plannedHashes) === canonicalString(PHASE_TRANSACTIONS.PURSUIT_KIT);
ok(plannedPhaseOk,
  'K3 BASELINE只预告目标消费者交易；PURSUIT_KIT切相后planned必须唯一命中正式四项交易', canonicalString(plannedHashes));
var trade = hashTradeSnapshot(sources);
ok(canonicalString(Object.keys(trade.allowedFive).sort()) === canonicalString(['fpsKitMazeWorld', 'fpsMazeProjection', 'puzzleKitHashTrade', 'puzzleNonTarget', 'recipeMazeWorld']),
  'K4 hash-trade 快照精确标出未来允许交易的 5 个位置，并同时纳入所有不得交易常量');

console.log('canonicalizer 反牙');
function canonicalRejects(label, makeValue, pattern) {
  var caught = null; try { canonicalString(makeValue()); } catch (error) { caught = error; }
  ok(!!caught && pattern.test(String(caught.message || caught)), label, caught && caught.message);
}
canonicalRejects('C1 undefined 字段不能被 JSON 静默吞掉', function () { return { a: undefined }; }, /undefined/);
canonicalRejects('C2 稀疏数组不能跳槽', function () { var value = []; value.length = 1; return value; }, /sparse/);
canonicalRejects('C3 对象 symbol 字段不能绕过 hash', function () { var value = {}; value[Symbol('x')] = 1; return value; }, /symbol/);
canonicalRejects('C4 数组 symbol 字段不能绕过 hash', function () { var value = []; value[Symbol('x')] = 1; return value; }, /symbol/);
canonicalRejects('C5 accessor 不能在取值时伪装普通字段', function () { var value = {}; Object.defineProperty(value, 'x', { get: function () { return 1; }, enumerable: true, configurable: true }); return value; }, /accessor/);
canonicalRejects('C6 NaN/Infinity 非有限值不能进入 hash', function () { return { x: NaN }; }, /non-finite/);
canonicalRejects('C7 数组额外 own 字段不能被忽略', function () { var value = [1]; value.extra = 2; return value; }, /extra array/);
canonicalRejects('C8 非标准数组槽 descriptor 不能伪装 dense array', function () { var value = [1]; Object.defineProperty(value, '0', { value: 1, enumerable: true, configurable: false, writable: true }); return value; }, /array slot descriptor/);
canonicalRejects('C9 非普通原型对象不能借继承字段绕过', function () { return Object.create({ inherited: 1 }); }, /plain objects/);

console.log('消费者反向变异');
function expectMutation(message, mutate, prefix) {
  var changed = makePursuitKitWorld(); mutate(changed);
  var errors = pursuitKitErrors(changed, sources, runtimeSource);
  ok(hasIssue(errors, prefix), message, errors.join(','));
}
expectMutation('M1 初始 active:true 会打红 quiet 单态', function (changed) { onlyMonster(horrorNode(changed).maze).active = true; }, 'shape:single-inactive-monster');
expectMutation('M2 删除 active:false（runtime 默认常开）会打红', function (changed) { delete onlyMonster(horrorNode(changed).maze).active; }, 'shape:single-inactive-monster');
expectMutation('M3 删除 stone wake event 会打红', function (changed) { var maze = horrorNode(changed).maze; maze.events = maze.events.filter(function (event) { return !(event.x === 1 && event.y === 9); }); }, 'shape:stone-missing');
expectMutation('M4 wake 激活错索引会打红', function (changed) { eventAt(horrorNode(changed).maze, 1, 9).activateMonsters = [1]; }, 'shape:stone-activation-index');
expectMutation('M5 初始静态 K 会打红动态钥匙边界', function (changed) { setCell(horrorNode(changed).maze.grid, 1, 9, 'K'); }, 'shape:initial-static-key');
expectMutation('M6 stone set 不同格会打红同格交接', function (changed) { eventAt(horrorNode(changed).maze, 1, 9).set[0].y = 8; }, 'shape:stone-same-cell-key');
expectMutation('M7 重开 (2,9) 会打红 stone 唯一邻格', function (changed) { setCell(horrorNode(changed).maze.grid, 2, 9, '.'); }, 'shape:grid');
expectMutation('M8 封回 (3,2) 会打红 quiet photo 支路', function (changed) { setCell(horrorNode(changed).maze.grid, 3, 2, '#'); }, 'shape:grid');
expectMutation('M9 删除 stone once 会打红 marker/K 生命周期', function (changed) { delete eventAt(horrorNode(changed).maze, 1, 9).once; }, 'shape:stone-once');
expectMutation('M10 删除 stone marker 会打红可见唤醒锚', function (changed) { delete eventAt(horrorNode(changed).maze, 1, 9).visual; }, 'shape:stone-marker');
expectMutation('M11 stone 偷写 durable run 会打红 session 分账', function (changed) { eventAt(horrorNode(changed).maze, 1, 9).run = function (state) { state.horrorPursuitStarted = true; }; }, 'shape:stone-session-only');
expectMutation('M12 durable started 初态会打红', function (changed) { changed.initState.horrorPursuitStarted = false; }, 'shape:no-durable-session-state');
expectMutation('M13 第二只 ordinary monster 会打红', function (changed) { horrorNode(changed).maze.monsters.push({ x: 7, y: 5, face: 'mimic', active: false }); }, 'shape:single-inactive-monster');
expectMutation('M14 引入 combat guard 会打红停止线', function (changed) { horrorNode(changed).maze.combat = { guard: {} }; }, 'shape:no-combat');
expectMutation("M15 active:'false' 字符串会打红严格布尔", function (changed) { onlyMonster(horrorNode(changed).maze).active = 'false'; }, 'shape:single-inactive-monster');
expectMutation('M16 非有限 chaseSpeed 会打红', function (changed) { horrorNode(changed).maze.chaseSpeed = Infinity; }, 'shape:chase-speed');
expectMutation('M17 过快 chase 让公开回程逃不掉会打红三 cadence', function (changed) { horrorNode(changed).maze.chaseSpeed = 20; }, 'runtime:escape:');
expectMutation('M18 删除 activation 让追逐不可感知/抓不到会打红', function (changed) { delete eventAt(horrorNode(changed).maze, 1, 9).activateMonsters; }, 'runtime:perceptibility:');
expectMutation('M18a 同一 activation 缺口也必须由独立 caught control 打红', function (changed) { delete eventAt(horrorNode(changed).maze, 1, 9).activateMonsters; }, 'runtime:caught:');
expectMutation('M19 删除 escaped 结果会打红三结果闭环', function (changed) { horrorNode(changed).links = horrorNode(changed).links.filter(function (link) { return link.to !== 'horror_escaped'; }); }, 'results:three-routes');
expectMutation('M20 删除 caught 结果会打红三结果闭环', function (changed) { horrorNode(changed).links = horrorNode(changed).links.filter(function (link) { return link.to !== 'horror_taken'; }); }, 'results:three-routes');
expectMutation('M21 删除 fled 结果会打红三结果闭环', function (changed) { horrorNode(changed).links = horrorNode(changed).links.filter(function (link) { return link.to !== 'horror_fled'; }); }, 'results:three-routes');
expectMutation('M22 fled 继承迷宫音频会打红释放契约', function (changed) { delete horrorNodes(changed).horror_fled.audio; }, 'results:fled-audio-release');
expectMutation('M23 Recipe reset 遗留 caught 会打红', function (changed) { horrorEntry(changed).run = function (state) { state.horrorEscaped = false; }; }, 'reset:terminal-facts');
expectMutation('M24 photo 重复 push 会打红 inventory 去重', function (changed) { eventAt(horrorNode(changed).maze, 5, 3).run = function (state) { state.flags.foundPhoto = true; state.inventory.push('photo'); }; }, 'reset:photo-dedupe');
expectMutation('M25 非目标 Puzzle 漂移会打红冻结投影', function (changed) { changed.maps.m.nodes.puzzle_maze.title = 'mutation'; }, 'freeze:non-target');
expectMutation('M26 非目标 FPS 漂移会打红冻结投影', function (changed) { changed.maps.m.nodes.fps_range.maze.combat.guard.hp++; }, 'freeze:non-target');
expectMutation('M27 目标文案外的 projection 漂移会打红 planned target', function (changed) { horrorNode(changed).scareKey = 'mutation'; }, 'shape:node-contract');

var runtimeMutant = Buffer.concat([runtimeBytes, Buffer.from('\n// mutation', 'utf8')]);
ok(sha256(runtimeMutant) !== RUNTIME_SHA256, 'M28 runtime 任一字节漂移会打红 SHA');
ok(!runtimeMutant.equals(originRuntimeBytes), 'M28a runtime 单边漂移会打红 Maze/Origin mirror');
ok(sha256(canonicalCoreBytes(Buffer.concat([coreBytes, Buffer.from('\n', 'utf8')]))) !== CORE_SHA256, 'M29 core runtime 除唯一版本戳注入位外任一字节漂移会打红 SHA');
var stampedCore = Buffer.from(coreBytes.toString('utf8').replace('__AMATLAS_VERSION__', 'candidate-tree-123'), 'utf8');
ok(sha256(canonicalCoreBytes(stampedCore)) === CORE_SHA256, 'M29a 打包器只注入现役 AMATLAS_VERSION 字面量不构成 core 漂移');
ok(sha256(Buffer.concat([interfaceBytes, Buffer.from('\n', 'utf8')])) !== INTERFACE_SHA256, 'M30 module-interface 任一字节漂移会打红 SHA');
var originMutant = descriptorClone(originWorld); originMutant.seed++;
ok(sha256(originMutant) !== ORIGIN_WORLD_SHA256, 'M30a live Origin world 任一非目标漂移会打红');
var allowedSourceMutant = {
  recipe: sources.recipe.replace(/(var WORLD_HASHES = \{[\s\S]*?maze3d: ')[0-9a-f]/, '$10'), fps: sources.fps, puzzle: sources.puzzle
};
ok(sha256(hashTradeSnapshot(allowedSourceMutant)) !== sha256(trade), 'M31 未来允许的 Maze world 交易位变化也必须显式更新 pursuit 阶段快照');
var frozenSourceMutant = {
  recipe: sources.recipe.replace(/(recipe: 'flesh nest corridor'[^\r\n]*hash: ')[0-9a-f]/, '$10'), fps: sources.fps, puzzle: sources.puzzle
};
ok(sha256(hashTradeSnapshot(frozenSourceMutant)) !== sha256(trade), 'M32 不得交易的 dogfood target 常量变化会打红统一快照');

console.log('pursuit-experience: ' + pass + ' 通过, ' + fail + ' 失败 [' + ACTIVE_PHASE + ']');
process.exit(fail ? 1 : 0);
