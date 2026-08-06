'use strict';
/* FPS Encounter Kit tests-first 机械闸：纯 Node 数据、零 runtime 私有探针。 */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var MAZE_WORLD_PATH = path.join(__dirname, '..', 'world.js');
var ORIGIN_WORLD_PATH = path.join(__dirname, '..', '..', 'origin', 'world.js');
var MAZE_RUNTIME_PATH = path.join(__dirname, '..', 'raycast-maze.js');
var ORIGIN_RUNTIME_PATH = path.join(__dirname, '..', '..', 'origin', 'raycast-maze.js');
var DOGFOOD_TEST_PATH = path.join(__dirname, 'recipe-dogfood.test.cjs');

/*
 * BASELINE 只能由 focused 命令显式授权；engine/test/run.cjs 不设置该变量，所以旧 world
 * 接入正式 runner 后保持红。实施时必须把唯一阶段切成 KIT，并填入 KIT 单态交易值；
 * KIT 阶段反过来拒绝 baseline 环境变量，不能长期兼容两种状态。
 */
var ACTIVE_PHASE = 'KIT';
var BASELINE_ENV = 'ATLAS_FPS_ENCOUNTER_KIT_BASELINE';
var PHASE_TRANSACTIONS = {
  BASELINE: {
    allowedSurfaceSha256: 'b936f05c5d14137e5f3aa234d3500219671cc5bf8748964e70ac1a4c5d0167c9',
    closeSignatureSha256: 'e52a3b95947142a9d19858858a162d13cd921d29982b3b8b5053425da2450e39',
    resourceSignatureSha256: 'e52a3b95947142a9d19858858a162d13cd921d29982b3b8b5053425da2450e39',
    dogfood: {
      industrialTarget: 'c5e084afabbffb7ea71b0816ff6b0a3c7776b5c3ae990be6f20892db5f38c4e0',
      mazeWorld: 'dfe4c943d411d1e24ff8407961f0d94ce256002cef562294c0af4453795c489d',
      originWorld: '9d99199ecd7016a32f85fe077cbf325583607c5ff1e6ff7bbc53b13431dcfec6'
    }
  },
  KIT: {
    allowedSurfaceSha256: 'dbe31c09cb9169b2e63983e39fc94a4d409bf4ac165569cdb5e66d125203733c',
    closeSignatureSha256: '83c674ac76cebbc5ecd6995cd63f026b2841be79560de14c343200c1a7f211e9',
    resourceSignatureSha256: '2c047cfa97a706a851d18a0329df8e661870c5f93806998ae5d1e8f7b4424a74',
    dogfood: {
      industrialTarget: '7defa79d107f34a1bd7dc73b5f5365a1d87c58f65f76a0dcc1e5d72bf43d3943',
      mazeWorld: 'bbd368208381e0fba183b22e9ffeac6aa512e6ad3cd934cd210e4cecf7d84ba7',
      originWorld: 'f84bf51037f4e8dd024cf21cf3456c481d2e4d4c5c975dbc58b72db51517a2d5'
    }
  }
};

var WORLD_ENVELOPES = {
  maze3d: '54b50b9b432328b37e45a5a486c7fdaa0610a577ccaddce180fd05420e3e6cd0',
  origin: 'c50b3b64b0f25083be9402426f7e90e425d14a9329b813f3aeaee34fd7760022'
};
var FROZEN_WORLD_PROJECTIONS = {
  maze3d: '6d5470608429a7a88278f38747297f7b8e446ffc41a8c9a2d3589e95e477d443',
  origin: '6fa1b0468d375cecb21cf3a497c8e14c742217027db9d551e6e1f5c92c078504'
};
var DOGFOOD_PROTECTED_SOURCE_SHA256 = '629a1be1cbdffaad79ab968135b736e71f3d8575643e4f05480d181c816b3638';
var RUNTIME_SHA256 = 'df9436e9b4e511983acb9b5e87b6529e3dfdb4ae14aee3d9a9cd6357d6bc0fa8';
var PRECISION_DAMAGE = 20;
var SCATTER_DAMAGE = 40;
var SCATTER_RANGE = 6;
var PRECISION_RANGE = 12;
var PRECISION_COOLDOWN = 0.32;

var TARGETS = {
  maze3d: { map: 'm', node: 'fps_range', results: ['fps_range_done', 'fps_range_death'] },
  origin: { map: 'atlas', node: 'first_world_trial', results: ['first_world_fall', 'first_world'] }
};
var pass = 0, fail = 0;
function ok(condition, message, detail) {
  if (condition) { pass++; console.log('  ok  ' + message); }
  else { fail++; console.log('  FAIL ' + message + (detail ? ' -> ' + detail : '')); }
}
function hasIssue(errors, prefix) { return errors.some(function (error) { return error.indexOf(prefix) === 0; }); }
function own(value, key) { return Object.prototype.hasOwnProperty.call(value || {}, key); }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function loadWorlds() { return { maze3d: fresh(MAZE_WORLD_PATH), origin: fresh(ORIGIN_WORLD_PATH) }; }
function targetNode(worlds, worldName) {
  var target = TARGETS[worldName];
  return worlds[worldName].maps[target.map].nodes[target.node];
}

function canonicalize(value) {
  if (value === undefined) return { '$undefined': true };
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('canonicalizer rejects non-finite number');
  if (typeof value === 'number' && Object.is(value, -0)) return { '$number': '-0' };
  if (typeof value === 'function') return { '$function': Function.prototype.toString.call(value) };
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('canonicalizer rejects array symbol fields');
    var allowed = { length: true }, arrayOut = new Array(value.length), lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!lengthDescriptor || lengthDescriptor.get || lengthDescriptor.set || lengthDescriptor.enumerable || lengthDescriptor.configurable || !lengthDescriptor.writable)
      throw new TypeError('canonicalizer rejects non-standard array length descriptor');
    for (var arrayIndex = 0; arrayIndex < value.length; arrayIndex++) {
      var arrayKey = String(arrayIndex), arrayDescriptor = Object.getOwnPropertyDescriptor(value, arrayKey);
      if (!arrayDescriptor) throw new TypeError('canonicalizer rejects sparse array slot:' + arrayKey);
      if (arrayDescriptor.get || arrayDescriptor.set || !arrayDescriptor.enumerable || !arrayDescriptor.configurable || !arrayDescriptor.writable)
        throw new TypeError('canonicalizer rejects non-standard array slot descriptor:' + arrayKey);
      allowed[arrayKey] = true;
      arrayOut[arrayIndex] = canonicalize(arrayDescriptor.value);
    }
    Object.getOwnPropertyNames(value).forEach(function (key) {
      if (!allowed[key]) throw new TypeError('canonicalizer rejects extra array own property:' + key);
    });
    return arrayOut;
  }
  if (value && typeof value === 'object') {
    var proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new TypeError('canonicalizer only accepts plain objects');
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('canonicalizer rejects symbol fields');
    var out = {};
    Object.getOwnPropertyNames(value).sort().forEach(function (key) {
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || descriptor.get || descriptor.set) throw new TypeError('canonicalizer rejects accessor:' + key);
      out[key] = canonicalize(descriptor.value);
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
function copyWithout(value, omitted) {
  var out = {};
  Object.getOwnPropertyNames(value || {}).forEach(function (key) { if (!omitted[key]) out[key] = value[key]; });
  return out;
}
function coordKey(x, y) { return x + ',' + y; }
function cellAt(grid, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= grid.length || x < 0 || x >= grid[y].length) return null;
  return grid[y][x];
}
function setCell(grid, x, y, value) { grid[y] = grid[y].slice(0, x) + value + grid[y].slice(x + 1); }
function exitCells(grid) {
  var exits = [];
  (grid || []).forEach(function (row, y) {
    for (var x = 0; x < row.length; x++) if (row[x] === 'D') exits.push({ x: x, y: y });
  });
  return exits;
}
function bfsDistance(grid, start, goal, blocked) {
  if (!start || !goal) return Infinity;
  blocked = blocked || {};
  var startKey = coordKey(start.x, start.y), goalKey = coordKey(goal.x, goal.y);
  if (blocked[startKey] || blocked[goalKey] || cellAt(grid, start.x, start.y) === '#' || cellAt(grid, goal.x, goal.y) === '#') return Infinity;
  var queue = [{ x: start.x, y: start.y, distance: 0 }], seen = {};
  seen[startKey] = true;
  for (var index = 0; index < queue.length; index++) {
    var current = queue[index];
    if (current.x === goal.x && current.y === goal.y) return current.distance;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (offset) {
      var x = current.x + offset[0], y = current.y + offset[1], key = coordKey(x, y);
      if (!seen[key] && !blocked[key] && cellAt(grid, x, y) != null && cellAt(grid, x, y) !== '#') {
        seen[key] = true; queue.push({ x: x, y: y, distance: current.distance + 1 });
      }
    });
  }
  return Infinity;
}
function blockedAt(item) { var blocked = {}; if (item) blocked[coordKey(item.x, item.y)] = true; return blocked; }
function pickupOf(combat, kind, weapon) {
  return (combat && combat.pickups || []).filter(function (pickup) {
    return pickup && pickup.kind === kind && (weapon === undefined || pickup.weapon === weapon);
  })[0];
}
function damageBudget(combat) {
  var withoutAmmo = 0, withAmmo = 0;
  (combat.loadout || []).forEach(function (slot) {
    var damage = slot.kind === 'precision' ? PRECISION_DAMAGE : slot.kind === 'scatter' ? SCATTER_DAMAGE : 0;
    withoutAmmo += slot.ammo * damage;
  });
  (combat.pickups || []).forEach(function (pickup) {
    var damage = pickup.weapon === 'precision' ? PRECISION_DAMAGE : pickup.weapon === 'scatter' ? SCATTER_DAMAGE : 0;
    if (pickup.kind === 'weapon') withoutAmmo += pickup.ammo * damage;
  });
  withAmmo = withoutAmmo;
  (combat.pickups || []).forEach(function (pickup) {
    var damage = pickup.weapon === 'precision' ? PRECISION_DAMAGE : pickup.weapon === 'scatter' ? SCATTER_DAMAGE : 0;
    if (pickup.kind === 'ammo') withAmmo += pickup.amount * damage;
  });
  return { withoutAmmo: withoutAmmo, withAmmo: withAmmo, guardHp: combat.guard.hp };
}
function requiresState(link, winKey, deathKey, win, death) {
  if (!link || typeof link.requires !== 'function') return false;
  var state = {}; state[winKey] = !!win; state[deathKey] = !!death;
  try { return !!link.requires(state); } catch (error) { return false; }
}
function runClears(link, winKey, deathKey) {
  if (!link || typeof link.run !== 'function') return false;
  var state = {}; state[winKey] = true; state[deathKey] = true;
  try { link.run(state); } catch (error) { return false; }
  return state[winKey] === false && state[deathKey] === false;
}
function closureSummary(world, mapId, nodeId) {
  var nodes = world.maps[mapId].nodes, node = nodes[nodeId], combat = node.maze.combat;
  var links = node.links || [], winKey = node.winKey, deathKey = combat.deathKey;
  function isDeath(link) { return requiresState(link, winKey, deathKey, false, true) && !requiresState(link, winKey, deathKey, false, false) && !requiresState(link, winKey, deathKey, true, false); }
  function isWin(link) { return requiresState(link, winKey, deathKey, true, false) && !requiresState(link, winKey, deathKey, false, false) && !requiresState(link, winKey, deathKey, false, true); }
  var deathRoute = links.filter(function (link) { return link.to !== nodeId && isDeath(link); })[0];
  var result = deathRoute && nodes[deathRoute.to];
  return {
    exitRequiresClear: combat.exitRequires === 'clear',
    exitCount: exitCells(node.maze.grid).length,
    directDeathReset: links.some(function (link) { return link.to === nodeId && isDeath(link) && runClears(link, winKey, deathKey); }),
    deathRoute: !!deathRoute,
    deathResultReset: !!(result && (result.links || []).some(function (link) { return link.to === nodeId && runClears(link, winKey, deathKey); })),
    winRoute: links.some(isWin)
  };
}
function topologyFacts(node) {
  var maze = node.maze, combat = maze.combat, start = maze.start, guard = combat.guard, exit = exitCells(maze.grid)[0];
  var scatter = pickupOf(combat, 'weapon', 'scatter'), ammo = pickupOf(combat, 'ammo', 'precision');
  var guardBlocked = blockedAt(guard), scatterBlocked = blockedAt(scatter);
  function detour(pickup, goal) {
    if (!pickup || !goal) return Infinity;
    return bfsDistance(maze.grid, start, pickup) + bfsDistance(maze.grid, pickup, goal) - bfsDistance(maze.grid, start, goal);
  }
  return {
    start: start, guard: { x: guard.x, y: guard.y }, exit: exit,
    startToGuard: bfsDistance(maze.grid, start, guard),
    startToExit: bfsDistance(maze.grid, start, exit),
    guardCut: bfsDistance(maze.grid, start, exit, guardBlocked) === Infinity,
    scatterToGuard: scatter ? bfsDistance(maze.grid, scatter, guard) : Infinity,
    scatterCutsGuard: scatter ? bfsDistance(maze.grid, start, guard, scatterBlocked) === Infinity : false,
    scatterCutsExit: scatter ? bfsDistance(maze.grid, start, exit, scatterBlocked) === Infinity : false,
    ammoGuardDetour: detour(ammo, guard),
    ammoExitDetour: detour(ammo, exit),
    guardCanReturnToAmmo: ammo ? bfsDistance(maze.grid, guard, ammo) < Infinity : false
  };
}
function normalizedBehaviorData(world, mapId, nodeId) {
  var node = world.maps[mapId].nodes[nodeId], maze = node.maze, combat = maze.combat, facts = topologyFacts(node);
  function distanceValue(value) { return Number.isFinite(value) ? value : 'unreachable'; }
  return {
    topology: {
      grid: maze.grid, start: facts.start, guard: facts.guard, exit: facts.exit,
      guardCut: facts.guardCut, scatterCutsGuard: facts.scatterCutsGuard, scatterCutsExit: facts.scatterCutsExit,
      shortest: { startGuard: distanceValue(facts.startToGuard), startExit: distanceValue(facts.startToExit), scatterGuard: distanceValue(facts.scatterToGuard) },
      detour: { ammoGuard: distanceValue(facts.ammoGuardDetour), ammoExit: distanceValue(facts.ammoExitDetour), returnable: facts.guardCanReturnToAmmo }
    },
    arsenal: {
      loadout: combat.loadout, equipped: combat.equipped,
      pickups: (combat.pickups || []).map(function (pickup) { return copyWithout(pickup, {}); }),
      budget: damageBudget(combat)
    },
    ai: {
      sight: combat.guard.ai.sight, hear: combat.guard.ai.hear, moveSpeed: combat.guard.ai.moveSpeed,
      attackRange: combat.guard.ai.attackRange, windup: combat.guard.ai.windup, cooldown: combat.guard.ai.cooldown
    },
    closure: closureSummary(world, mapId, nodeId)
  };
}
function normalizedBehaviorSignature(world, mapId, nodeId) { return sha256(normalizedBehaviorData(world, mapId, nodeId)); }

function hashStr(value) {
  var hash = 2166136261 >>> 0; value = String(value);
  for (var index = 0; index < value.length; index++) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash >>> 0;
}
function mulberry32(seed) {
  return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var value = Math.imul(seed ^ seed >>> 15, 1 | seed); value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value; return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}
var THEME_DECOR = { crystal: ['crystal_cluster', 'ice_chips', 'gem'], industrial: ['rust_scraps', 'cable_coil', 'glass_shards'] };
function floorCoordinateErrors(node) {
  var errors = [], maze = node.maze, combat = maze.combat, grid = maze.grid, reserved = {}, occupied = {};
  function reserve(item, reason) { if (item) reserved[coordKey(item.x, item.y)] = reason; }
  reserve(maze.start, 'start');
  exitCells(grid).forEach(function (item) { reserve(item, 'exit'); });
  reserve(combat.guard, 'guard');
  (combat.pickups || []).forEach(function (item, index) { reserve(item, 'pickup[' + index + ']'); });
  (maze.decor || []).concat(maze.pillars || []).forEach(function (item, index) {
    var key = coordKey(item.x, item.y);
    if (cellAt(grid, item.x, item.y) !== '.') errors.push('explicit-floor-cell:' + index);
    if (reserved[key]) errors.push('explicit-floor-reserved:' + reserved[key]);
    if (occupied[key]) errors.push('explicit-floor-sibling:' + key);
    occupied[key] = true;
  });
  var runtimeBlocked = {};
  reserve(maze.start, 'start');
  runtimeBlocked[coordKey(maze.start.x, maze.start.y)] = true;
  exitCells(grid).forEach(function (item) { runtimeBlocked[coordKey(item.x, item.y)] = true; });
  (maze.events || []).forEach(function (item) { runtimeBlocked[coordKey(item.x, item.y)] = true; });
  (maze.monsters || []).forEach(function (item) { runtimeBlocked[coordKey(item.x, item.y)] = true; });
  Object.keys(occupied).forEach(function (key) { runtimeBlocked[key] = true; });
  var list = THEME_DECOR[maze.theme] || [], density = maze.decorDensity || 0, max = maze.maxDecor == null ? 12 : maze.maxDecor, count = 0;
  for (var y = 0; y < grid.length && count < max; y++) {
    var row = grid[y] || '';
    for (var x = 0; x < row.length && count < max; x++) {
      var key = coordKey(x, y);
      if (cellAt(grid, x, y) !== '.' || runtimeBlocked[key]) continue;
      if (mulberry32(hashStr('decor' + maze.theme + '_' + x + '_' + y + '_' + grid.length + '_' + row.length))() >= density) continue;
      if (reserved[key]) errors.push('auto-floor-reserved:' + reserved[key] + ':' + key);
      runtimeBlocked[key] = true; count++;
    }
  }
  return errors;
}

var OPEN_GRID = ['#############', '#...........#', '#...........#', '#..........D#', '#...........#', '#...........#', '#############'];
var CLOSE_GRID = ['#############', '#.....#.....#', '#.....#.....#', '#..........D#', '#.....#.....#', '#.....#.....#', '#############'];
function exactLoadout(combat) {
  var slot = combat.loadout && combat.loadout[0];
  return combat.loadout.length === 1 && slot.kind === 'precision' && slot.ammo === 2 && slot.maxAmmo === 6 && combat.equipped === 'precision';
}
function closureErrors(summary) {
  var errors = [];
  Object.keys(summary).forEach(function (key) { if (key === 'exitCount' ? summary[key] !== 1 : summary[key] !== true) errors.push('closure:' + key); });
  return errors;
}
function closeBreachErrors(worlds) {
  var node = targetNode(worlds, 'origin'), maze = node.maze, combat = maze.combat, facts = topologyFacts(node), errors = [];
  var scatter = pickupOf(combat, 'weapon', 'scatter'), ammo = pickupOf(combat, 'ammo', 'precision'), health = pickupOf(combat, 'health');
  if (canonicalString(maze.grid) !== canonicalString(CLOSE_GRID)) errors.push('close-grid');
  if (maze.start.x !== 1 || maze.start.y !== 3 || maze.start.dir !== 'E') errors.push('close-start');
  if (combat.guard.x !== 6 || combat.guard.y !== 3) errors.push('close-guard-position');
  if (!facts.guardCut) errors.push('close-guard-cut');
  if (!scatter || !facts.scatterCutsGuard || !facts.scatterCutsExit) errors.push('close-scatter-mandatory');
  if (!scatter || facts.scatterToGuard !== 1 || facts.scatterToGuard > SCATTER_RANGE) errors.push('close-scatter-distance');
  if (!scatter || scatter.x !== 5 || scatter.y !== 3 || scatter.ammo !== 1 || scatter.maxAmmo !== 4) errors.push('close-scatter-pickup');
  if (combat.guard.hp !== 60 || combat.guard.ai.moveSpeed !== 0) errors.push('close-static-guard');
  if (ammo) errors.push('close-no-precision-ammo');
  if (!health || health.x !== 2 || health.y !== 2 || health.amount !== 20) errors.push('close-health');
  if (!exactLoadout(combat)) errors.push('close-loadout');
  if (maze.decorDensity !== 0.03 || maze.maxDecor !== 2) errors.push('close-decor-budget');
  errors = errors.concat(closureErrors(closureSummary(worlds.origin, TARGETS.origin.map, TARGETS.origin.node)));
  errors = errors.concat(floorCoordinateErrors(node));
  return errors;
}
function resourceFacts(worlds) {
  var node = targetNode(worlds, 'maze3d'), facts = topologyFacts(node), budget = damageBudget(node.maze.combat);
  return { topology: facts, budget: budget };
}
function resourceDetourErrors(worlds) {
  var node = targetNode(worlds, 'maze3d'), maze = node.maze, combat = maze.combat, facts = topologyFacts(node), budget = damageBudget(combat), errors = [];
  var scatter = pickupOf(combat, 'weapon', 'scatter'), ammo = pickupOf(combat, 'ammo', 'precision'), health = pickupOf(combat, 'health');
  if (canonicalString(maze.grid) !== canonicalString(OPEN_GRID)) errors.push('resource-grid');
  if (maze.start.x !== 1 || maze.start.y !== 3 || maze.start.dir !== 'E') errors.push('resource-start');
  if (combat.guard.x !== 7 || combat.guard.y !== 3 || combat.guard.hp !== 100) errors.push('resource-guard');
  if (!ammo || ammo.x !== 1 || ammo.y !== 1 || ammo.amount !== 3) errors.push('resource-ammo');
  if (!ammo || facts.ammoGuardDetour !== 4 || facts.ammoGuardDetour <= 0) errors.push('resource-detour-guard');
  if (!ammo || facts.ammoExitDetour !== 4 || facts.ammoExitDetour <= 0) errors.push('resource-detour-exit');
  if (!facts.guardCanReturnToAmmo) errors.push('resource-ammo-recoverable');
  if (!scatter || scatter.x !== 2 || scatter.y !== 3 || scatter.ammo !== 1 || scatter.maxAmmo !== 4) errors.push('resource-scatter');
  if (!health || health.x !== 1 || health.y !== 5 || health.amount !== 20) errors.push('resource-health');
  if (!exactLoadout(combat)) errors.push('resource-loadout');
  if (budget.withoutAmmo !== 80 || !(budget.withoutAmmo < budget.guardHp)) errors.push('resource-budget-without-ammo');
  if (budget.withAmmo !== 140 || !(budget.withAmmo >= budget.guardHp)) errors.push('resource-budget-with-ammo');
  errors = errors.concat(closureErrors(closureSummary(worlds.maze3d, TARGETS.maze3d.map, TARGETS.maze3d.node)));
  errors = errors.concat(floorCoordinateErrors(node));
  return errors;
}

function makeKitWorlds() {
  var worlds = loadWorlds(), close = targetNode(worlds, 'origin').maze, resource = targetNode(worlds, 'maze3d').maze;
  close.grid = CLOSE_GRID.slice(); close.start = { x: 1, y: 3, dir: 'E' }; close.maxDecor = 2;
  close.combat.guard.x = 6; close.combat.guard.y = 3; close.combat.guard.hp = 60; close.combat.guard.ai.moveSpeed = 0;
  close.combat.pickups = [
    { x: 5, y: 3, kind: 'weapon', weapon: 'scatter', ammo: 1, maxAmmo: 4 },
    { x: 2, y: 2, kind: 'health', amount: 20 }
  ];
  resource.grid = OPEN_GRID.slice(); resource.start = { x: 1, y: 3, dir: 'E' }; resource.combat.guard.hp = 100;
  resource.combat.pickups = [
    { x: 2, y: 3, kind: 'weapon', weapon: 'scatter', ammo: 1, maxAmmo: 4 },
    { x: 1, y: 1, kind: 'ammo', weapon: 'precision', amount: 3 },
    { x: 1, y: 5, kind: 'health', amount: 20 }
  ];
  return worlds;
}

function worldEnvelope(world) {
  var envelope = {};
  ['id', 'start', 'seed', 'initState', 'items'].forEach(function (key) { if (own(world, key)) envelope[key] = world[key]; });
  return envelope;
}
function projectedNode(worldName, mapId, nodeId, node) {
  var target = TARGETS[worldName], copyKeys = { title: true, look: true, wonText: true };
  if (mapId === target.map && nodeId === target.node) {
    var projected = copyWithout(node, copyKeys);
    projected.maze = copyWithout(node.maze, { grid: true, start: true, combat: true, decorDensity: true, maxDecor: true });
    projected.maze.combat = { exitRequires: node.maze.combat.exitRequires, deathKey: node.maze.combat.deathKey };
    return projected;
  }
  if (mapId === target.map && target.results.indexOf(nodeId) >= 0) return copyWithout(node, copyKeys);
  return node;
}
function frozenWorldProjection(world, worldName) {
  var root = copyWithout(world, { maps: true }), maps = {};
  Object.getOwnPropertyNames(world.maps || {}).forEach(function (mapId) {
    var map = world.maps[mapId], mapCopy = copyWithout(map, { nodes: true }), nodes = {};
    Object.getOwnPropertyNames(map.nodes || {}).forEach(function (nodeId) { nodes[nodeId] = projectedNode(worldName, mapId, nodeId, map.nodes[nodeId]); });
    mapCopy.nodes = nodes; maps[mapId] = mapCopy;
  });
  root.maps = maps; return root;
}
function allowedSurfaceSnapshot(worlds) {
  var snapshot = {};
  Object.keys(TARGETS).forEach(function (worldName) {
    var target = TARGETS[worldName], nodes = worlds[worldName].maps[target.map].nodes, node = nodes[target.node];
    snapshot[worldName] = {
      targetCopy: { title: node.title, look: node.look, wonText: node.wonText },
      maze: {
        grid: node.maze.grid, start: node.maze.start, combat: node.maze.combat,
        decorDensity: node.maze.decorDensity, maxDecor: node.maze.maxDecor
      },
      resultCopy: target.results.map(function (nodeId) {
        var result = nodes[nodeId];
        return { node: nodeId, title: result && result.title, look: result && result.look, wonText: result && result.wonText };
      })
    };
  });
  return snapshot;
}
function dogfoodTransaction(source) {
  var target = /recipe: 'industrial checkpoint'[^\r\n]*hash: '([0-9a-f]{64})'/.exec(source);
  var blockMatch = /var WORLD_HASHES = \{([\s\S]*?)\n\};/.exec(source), block = blockMatch && blockMatch[1] || '';
  var maze = /maze3d: '([0-9a-f]{64})'/.exec(block), origin = /origin: '([0-9a-f]{64})'/.exec(block);
  return { industrialTarget: target && target[1], mazeWorld: maze && maze[1], originWorld: origin && origin[1] };
}
function protectedDogfoodSource(source) {
  source = source.replace(/(recipe: 'industrial checkpoint'[^\r\n]*hash: ')[0-9a-f]{64}(')/, '$1<ENCOUNTER_KIT_TARGET_HASH>$2');
  return source.replace(/var WORLD_HASHES = \{([\s\S]*?)\n\};/, function (whole) {
    return whole.replace(/(maze3d: ')[0-9a-f]{64}(')/, '$1<ENCOUNTER_KIT_MAZE_HASH>$2')
      .replace(/(origin: ')[0-9a-f]{64}(')/, '$1<ENCOUNTER_KIT_ORIGIN_HASH>$2');
  });
}
function runtimeErrors(mazeBytes, originBytes) {
  var errors = [];
  if (sha256(mazeBytes) !== RUNTIME_SHA256) errors.push('runtime-sha:maze3d');
  if (sha256(originBytes) !== RUNTIME_SHA256) errors.push('runtime-sha:origin');
  if (!Buffer.from(mazeBytes).equals(Buffer.from(originBytes))) errors.push('runtime-mirror');
  return errors;
}
function frozenProjectionErrors(worlds) {
  var errors = [];
  Object.keys(TARGETS).forEach(function (worldName) {
    if (sha256(frozenWorldProjection(worlds[worldName], worldName)) !== FROZEN_WORLD_PROJECTIONS[worldName]) errors.push('frozen-world:' + worldName);
  });
  return errors;
}
function freezeErrors(worlds, mazeBytes, originBytes, dogfoodSource, transaction) {
  var errors = frozenProjectionErrors(worlds);
  Object.keys(WORLD_ENVELOPES).forEach(function (worldName) {
    if (sha256(worldEnvelope(worlds[worldName])) !== WORLD_ENVELOPES[worldName]) errors.push('world-envelope:' + worldName);
  });
  errors = errors.concat(runtimeErrors(mazeBytes, originBytes));
  if (sha256(protectedDogfoodSource(dogfoodSource)) !== DOGFOOD_PROTECTED_SOURCE_SHA256) errors.push('dogfood-protected-source');
  if (!transaction || !transaction.dogfood || canonicalString(dogfoodTransaction(dogfoodSource)) !== canonicalString(transaction.dogfood)) errors.push('dogfood-three-hash-transaction');
  if (!transaction || !transaction.allowedSurfaceSha256 || sha256(allowedSurfaceSnapshot(worlds)) !== transaction.allowedSurfaceSha256) errors.push('allowed-surface-transaction');
  return errors;
}

function lineOfSight(grid, from, to) {
  var dx = to.x - from.x, dy = to.y - from.y, steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 8);
  for (var index = 1; index < steps; index++) {
    var x = Math.floor(from.x + 0.5 + dx * index / steps), y = Math.floor(from.y + 0.5 + dy * index / steps);
    if (cellAt(grid, x, y) === '#') return false;
  }
  return true;
}
function isPrecisionLane(world, mapId, nodeId) {
  var node = world.maps[mapId].nodes[nodeId], maze = node && node.maze, combat = maze && maze.combat;
  if (!combat || !combat.guard || !Array.isArray(combat.loadout)) return false;
  var precision = combat.loadout.filter(function (slot) { return slot.kind === 'precision'; })[0];
  var scatter = combat.loadout.filter(function (slot) { return slot.kind === 'scatter'; })[0];
  var dx = combat.guard.x - maze.start.x, dy = combat.guard.y - maze.start.y, distance = Math.sqrt(dx * dx + dy * dy);
  var window = (distance - combat.guard.ai.attackRange) / combat.guard.ai.moveSpeed + combat.guard.ai.windup;
  var closure = closureSummary(world, mapId, nodeId);
  return distance > SCATTER_RANGE && distance <= PRECISION_RANGE && lineOfSight(maze.grid, maze.start, combat.guard) &&
    precision && precision.ammo >= 2 && scatter && scatter.ammo >= 1 && combat.equipped === 'precision' && combat.guard.hp === 40 &&
    combat.guard.ai.sight >= distance && combat.guard.ai.moveSpeed > 0 && window > PRECISION_COOLDOWN && !(combat.pickups || []).length &&
    closure.exitRequiresClear && closure.exitCount === 1 && closure.directDeathReset && closure.deathRoute && closure.deathResultReset && closure.winRoute;
}
function precisionStopErrors(worlds) {
  var errors = [], allowed = { 'maze3d/m/fps_range': true, 'origin/atlas/first_world_trial': true };
  Object.keys(worlds).forEach(function (worldName) {
    Object.keys(worlds[worldName].maps || {}).forEach(function (mapId) {
      Object.keys(worlds[worldName].maps[mapId].nodes || {}).forEach(function (nodeId) {
        var node = worlds[worldName].maps[mapId].nodes[nodeId], key = worldName + '/' + mapId + '/' + nodeId;
        if (node && node.maze && node.maze.combat && !allowed[key]) errors.push('non-target-combat:' + key);
        if (node && node.maze && node.maze.combat && isPrecisionLane(worlds[worldName], mapId, nodeId)) errors.push('precision-formal-target:' + key);
      });
    });
  });
  return errors;
}
function makePrecisionCandidateWorld() {
  function reset(state) { state.won = false; state.dead = false; }
  var node = {
    kind: 'maze3d', winKey: 'won',
    maze: {
      grid: ['###############', '#.............#', '#............D#', '#.............#', '###############'],
      start: { x: 1, y: 2, dir: 'E' },
      combat: {
        exitRequires: 'clear', deathKey: 'dead', player: { maxHealth: 60, health: 60 },
        loadout: [{ kind: 'precision', ammo: 2, maxAmmo: 6 }, { kind: 'scatter', ammo: 1, maxAmmo: 4 }], equipped: 'precision',
        guard: { x: 9, y: 2, hp: 40, hitRadius: 0.34, ai: { sight: 8, hear: 8, attackRange: 1.35, moveSpeed: 1.1, damage: 20, windup: 0.55, cooldown: 0.75 } }
      }
    },
    links: [
      { to: 'lane', requires: function (state) { return !!state.dead; }, run: reset },
      { to: 'lane_death', requires: function (state) { return !!state.dead; } },
      { to: 'lane_done', requires: function (state) { return !!state.won; } }
    ]
  };
  return { maps: { m: { nodes: { lane: node, lane_death: { links: [{ to: 'lane', run: reset }] }, lane_done: { links: [] } } } } };
}

console.log('FPS Encounter Kit tests-first 机械闸');
var worlds = loadWorlds(), transaction = PHASE_TRANSACTIONS[ACTIVE_PHASE];
var baselineAuthorized = process.env[BASELINE_ENV] === '1';
ok(ACTIVE_PHASE === 'BASELINE' || ACTIVE_PHASE === 'KIT', 'K0 阶段只能是唯一 BASELINE 或 KIT', ACTIVE_PHASE);
ok(ACTIVE_PHASE === 'BASELINE' ? baselineAuthorized : !baselineAuthorized,
  'K1 BASELINE 仅 focused 显式授权；KIT 硬拒 baseline 授权（正式 runner 不会永久接受旧状态）',
  'phase=' + ACTIVE_PHASE + ' ' + BASELINE_ENV + '=' + String(process.env[BASELINE_ENV]));
ok(!!transaction && (ACTIVE_PHASE === 'BASELINE' || (transaction.allowedSurfaceSha256 && transaction.closeSignatureSha256 && transaction.resourceSignatureSha256 && transaction.dogfood)),
  'K2 当前阶段交易值必须完整，KIT 不得复用或回退到 baseline');

var closeSignature = normalizedBehaviorSignature(worlds.origin, TARGETS.origin.map, TARGETS.origin.node);
var resourceSignature = normalizedBehaviorSignature(worlds.maze3d, TARGETS.maze3d.map, TARGETS.maze3d.node);
ok(!!transaction && closeSignature === transaction.closeSignatureSha256 && resourceSignature === transaction.resourceSignatureSha256,
  'K3 两个正式 cadence 各自唯一命中当前阶段 normalized behavior signature',
  'close=' + closeSignature + ' resource=' + resourceSignature);

if (ACTIVE_PHASE === 'BASELINE') {
  var baselineCloseErrors = closeBreachErrors(worlds), baselineResourceErrors = resourceDetourErrors(worlds), baselineResource = resourceFacts(worlds);
  ok(closeSignature === resourceSignature, 'B1 旧 world 两个正式 cadence 归一化后相同（tests-first 克隆红证据）');
  ok(hasIssue(baselineCloseErrors, 'close-guard-cut') && hasIssue(baselineCloseErrors, 'close-scatter-mandatory') && hasIssue(baselineCloseErrors, 'close-static-guard'),
    'B2 旧 Origin 明确不是 close breach：guard 非 cut、scatter 非必经、guard 可离口', baselineCloseErrors.join(','));
  ok(baselineResource.topology.ammoGuardDetour === 0 && baselineResource.topology.ammoExitDetour === 0 &&
    baselineResource.budget.withoutAmmo === 80 && baselineResource.budget.guardHp === 60 &&
    hasIssue(baselineResourceErrors, 'resource-detour-guard') && hasIssue(baselineResourceErrors, 'resource-budget-without-ammo'),
    'B3 旧 Maze 明确不是 resource detour：detour=0，目标条件 80<100 未成立（当前 80<60 为假）', baselineResourceErrors.join(','));
  var plannedKit = makeKitWorlds(), plannedCloseErrors = closeBreachErrors(plannedKit), plannedResourceErrors = resourceDetourErrors(plannedKit);
  ok(plannedCloseErrors.length === 0 && plannedResourceErrors.length === 0 &&
    normalizedBehaviorSignature(plannedKit.origin, TARGETS.origin.map, TARGETS.origin.node) !== normalizedBehaviorSignature(plannedKit.maze3d, TARGETS.maze3d.map, TARGETS.maze3d.node),
    'B4 同一检查器上的预期 KIT 纯数据夹具全绿且两份 cadence 不同（防反变异框架建立在坏夹具上）',
    plannedCloseErrors.concat(plannedResourceErrors).join(','));
} else {
  var kitCloseErrors = closeBreachErrors(worlds), kitResourceErrors = resourceDetourErrors(worlds);
  ok(closeSignature !== resourceSignature, 'K4 KIT 两个正式 normalized cadence 必须不同，行为克隆硬红');
  ok(kitCloseErrors.length === 0, 'K5 Origin close breach guard-cut/scatter必经/静态守口/坐标与 closure 全闭合', kitCloseErrors.join(','));
  ok(kitResourceErrors.length === 0, 'K6 Maze resource detour +4 且 80<100、140>=100、同局可回取', kitResourceErrors.join(','));
}

var precisionErrors = precisionStopErrors(worlds), precisionCandidate = makePrecisionCandidateWorld();
ok(precisionErrors.length === 0 && isPrecisionLane(precisionCandidate, 'm', 'lane'),
  'K7 precision lane 候选签名可表达，但当前无正式 target 且非目标节点禁止 combat', precisionErrors.join(','));

var mazeRuntime = fs.readFileSync(MAZE_RUNTIME_PATH), originRuntime = fs.readFileSync(ORIGIN_RUNTIME_PATH), dogfoodSource = fs.readFileSync(DOGFOOD_TEST_PATH, 'utf8');
var frozen = freezeErrors(worlds, mazeRuntime, originRuntime, dogfoodSource, transaction);
ok(frozen.length === 0,
  'K8 world envelope/initState、target links/key、非目标、结果页非文案例外、runtime SHA/mirror 全冻结；dogfood 只准三个 hash 交易',
  frozen.join(',') + ' projection=' + canonicalString({ maze3d: sha256(frozenWorldProjection(worlds.maze3d, 'maze3d')), origin: sha256(frozenWorldProjection(worlds.origin, 'origin')) }) +
    ' surface=' + sha256(allowedSurfaceSnapshot(worlds)) + ' dogfoodProtected=' + sha256(protectedDogfoodSource(dogfoodSource)));

console.log('反向变异');
function expectKitMutation(message, mutate, inspect, prefix) {
  var changed = makeKitWorlds(); mutate(changed);
  var errors = inspect(changed);
  ok(hasIssue(errors, prefix), message, errors.join(','));
}
expectKitMutation('M1 打开 close 旁路会打红 guard-cut', function (changed) {
  setCell(targetNode(changed, 'origin').maze.grid, 6, 2, '.');
}, closeBreachErrors, 'close-guard-cut');
expectKitMutation('M2 guard 离开窄口/移位会打红', function (changed) {
  targetNode(changed, 'origin').maze.combat.guard.x = 7;
}, closeBreachErrors, 'close-guard-position');
expectKitMutation('M3 guard 恢复 moveSpeed、可离口会打红', function (changed) {
  targetNode(changed, 'origin').maze.combat.guard.ai.moveSpeed = 1.1;
}, closeBreachErrors, 'close-static-guard');
expectKitMutation('M4 scatter 不再必经会打红', function (changed) {
  var scatter = pickupOf(targetNode(changed, 'origin').maze.combat, 'weapon', 'scatter'); scatter.x = 4; scatter.y = 2;
}, closeBreachErrors, 'close-scatter-mandatory');
expectKitMutation('M5 scatter 到 guard 超过 6 格会打红', function (changed) {
  var scatter = pickupOf(targetNode(changed, 'origin').maze.combat, 'weapon', 'scatter'); scatter.x = 1; scatter.y = 5;
}, closeBreachErrors, 'close-scatter-distance');
expectKitMutation('M6 自动 decor 占 scatter/guard/pickup 功能格会打红', function (changed) {
  var maze = targetNode(changed, 'origin').maze; maze.decorDensity = 1; maze.maxDecor = 100;
}, closeBreachErrors, 'auto-floor-reserved:');
expectKitMutation('M7 ammo 移回主轴会打红 detour', function (changed) {
  var ammo = pickupOf(targetNode(changed, 'maze3d').maze.combat, 'ammo', 'precision'); ammo.x = 3; ammo.y = 3;
}, resourceDetourErrors, 'resource-detour-guard');
expectKitMutation('M8 guard HP 降到 80 会打红 80<HP 预算', function (changed) {
  targetNode(changed, 'maze3d').maze.combat.guard.hp = 80;
}, resourceDetourErrors, 'resource-budget-without-ammo');
expectKitMutation('M9 初始 precision 多 1 发会打红无 ammo 预算', function (changed) {
  targetNode(changed, 'maze3d').maze.combat.loadout[0].ammo = 3;
}, resourceDetourErrors, 'resource-budget-without-ammo');
expectKitMutation('M10 取 ammo 后仍伤害不足会打红', function (changed) {
  targetNode(changed, 'maze3d').maze.combat.guard.hp = 150;
}, resourceDetourErrors, 'resource-budget-with-ammo');
expectKitMutation('M11 ammo 支路不可达/耗尽后不能同局回取会打红', function (changed) {
  var grid = targetNode(changed, 'maze3d').maze.grid; setCell(grid, 1, 2, '#'); setCell(grid, 2, 1, '#');
}, resourceDetourErrors, 'resource-ammo-recoverable');

var cloneWorlds = makeKitWorlds();
var clonedMaze = JSON.parse(JSON.stringify(targetNode(cloneWorlds, 'origin').maze));
clonedMaze.combat.deathKey = 'fpsRangeDeath';
targetNode(cloneWorlds, 'maze3d').maze = clonedMaze;
ok(normalizedBehaviorSignature(cloneWorlds.maze3d, TARGETS.maze3d.map, TARGETS.maze3d.node) === normalizedBehaviorSignature(cloneWorlds.origin, TARGETS.origin.map, TARGETS.origin.node),
  'M12 克隆任一正式 cadence 会被唯一 normalized signature 判为相同（KIT K4 将转红）');

var labelWorlds = makeKitWorlds(), labelNode = targetNode(labelWorlds, 'origin');
var labelBefore = normalizedBehaviorSignature(labelWorlds.origin, TARGETS.origin.map, TARGETS.origin.node);
labelNode.title = 'mutation title'; labelNode.look = 'mutation look'; labelNode.maze.theme = 'industrial';
ok(labelBefore === normalizedBehaviorSignature(labelWorlds.origin, TARGETS.origin.map, TARGETS.origin.node),
  'M13 只改 title/look/theme 不改变 normalized behavior signature，不能贴标签冒充 encounter');

var nonTargetWorlds = makeKitWorlds(), candidateNode = makePrecisionCandidateWorld().maps.m.nodes.lane;
nonTargetWorlds.maze3d.maps.m.nodes.basic_maze = candidateNode;
ok(hasIssue(precisionStopErrors(nonTargetWorlds), 'non-target-combat:'), 'M14 给非目标正式节点强塞 precision lane combat 会打红停止线');

expectKitMutation('M15 target link 漂移由冻结投影打红', function (changed) {
  targetNode(changed, 'origin').links[0].to = 'first_world';
}, frozenProjectionErrors, 'frozen-world:origin');
expectKitMutation('M16 win/death key 漂移由冻结投影打红', function (changed) {
  targetNode(changed, 'maze3d').winKey = 'mutatedWinKey';
}, frozenProjectionErrors, 'frozen-world:maze3d');
expectKitMutation('M16a combat deathKey 漂移由冻结投影独立打红', function (changed) {
  targetNode(changed, 'origin').maze.combat.deathKey = 'mutatedDeathKey';
}, frozenProjectionErrors, 'frozen-world:origin');
expectKitMutation('M17 结果页 kind/scene/links/状态行为漂移会打红', function (changed) {
  var result = changed.maze3d.maps.m.nodes.fps_range_death; result.kind = 'encounter'; result.scene.mood = 'calm'; result.links[0].run = function () {};
}, frozenProjectionErrors, 'frozen-world:maze3d');
expectKitMutation('M18 §6.1 例外之外的非目标节点漂移会打红', function (changed) {
  changed.origin.maps.atlas.nodes.loom.title = 'mutation';
}, frozenProjectionErrors, 'frozen-world:origin');
var arrayOwnCaught = false;
try {
  var arrayOwnWorlds = makeKitWorlds();
  Object.defineProperty(targetNode(arrayOwnWorlds, 'maze3d').links, 'forEach', { value: function () {}, enumerable: false });
  frozenProjectionErrors(arrayOwnWorlds);
} catch (arrayOwnError) { arrayOwnCaught = /array own property/.test(String(arrayOwnError.message || arrayOwnError)); }
ok(arrayOwnCaught, 'M18a links数组额外own forEach会fail-loud，不能逃过冻结hash并让runtime路由归零');

var copyExceptionWorlds = makeKitWorlds(), copyProjectionBefore = sha256(frozenWorldProjection(copyExceptionWorlds.maze3d, 'maze3d'));
copyExceptionWorlds.maze3d.maps.m.nodes.fps_range_done.title = 'allowed title';
copyExceptionWorlds.maze3d.maps.m.nodes.fps_range_done.look = 'allowed look';
copyExceptionWorlds.maze3d.maps.m.nodes.fps_range_done.wonText = 'allowed wonText';
ok(copyProjectionBefore === sha256(frozenWorldProjection(copyExceptionWorlds.maze3d, 'maze3d')),
  'M19 直接 done/death 结果页仅 title/look/wonText 是明确文案例外');

var envelopeWorlds = loadWorlds(); envelopeWorlds.origin.initState.firstWorldTrialWon = true;
ok(sha256(worldEnvelope(envelopeWorlds.origin)) !== WORLD_ENVELOPES.origin, 'M20 initState/world envelope 漂移会打红');
var runtimeMutation = runtimeErrors(mazeRuntime, Buffer.concat([originRuntime, Buffer.from('\n// mutation', 'utf8')]));
ok(hasIssue(runtimeMutation, 'runtime-sha:origin') && hasIssue(runtimeMutation, 'runtime-mirror'), 'M21 link/key之外 runtime 单边漂移会同时打红 SHA 与 mirror');

var dogfoodMutation = dogfoodSource.replace("hash: 'd6dcb49ffe245c656a826089b76337879a1bfbc3dc421e29ad5786eedf858698'", "hash: '06dcb49ffe245c656a826089b76337879a1bfbc3dc421e29ad5786eedf858698'");
ok(sha256(protectedDogfoodSource(dogfoodMutation)) !== DOGFOOD_PROTECTED_SOURCE_SHA256,
  'M22 当前允许 dungeon/industrial target、Maze world与envelope/presentation交易；其余 target hash 仍会打红');

console.log('fps-encounter-kit: ' + pass + ' 通过, ' + fail + ' 失败 [' + ACTIVE_PHASE + ']');
process.exit(fail ? 1 : 0);
