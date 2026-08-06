'use strict';
/* Maze3D Puzzle & Route Kit tests-first 闸：只锁 world 数据与既有结算语义，不实现 world。 */
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');

var WORLD_PATH = path.join(__dirname, '..', 'world.js');
var RUNTIME_PATH = path.join(__dirname, '..', 'raycast-maze.js');
var RECIPE_TEST_PATH = path.join(__dirname, 'recipe-dogfood.test.cjs');
var FPS_TEST_PATH = path.join(__dirname, 'fps-encounter-kit.test.cjs');
var CORE_PATH = path.join(__dirname, '..', '..', '..', 'core', 'runtime', 'engine-core.js');
var RESET_PLUGIN_PATH = path.join(__dirname, '..', '..', '..', 'plugins', 'reset.js');

/*
 * BASELINE 只能由 focused 命令显式授权。正式 runner 不设置该变量，所以旧 world 接入后
 * 必须保持红；实施时把唯一阶段切为 PUZZLE_KIT，并一次性填写下方四个 KIT 交易值。
 */
var ACTIVE_PHASE = 'PUZZLE_KIT';
var BASELINE_ENV = 'ATLAS_MAZE_PUZZLE_KIT_BASELINE';
var PHASE_TRANSACTIONS = {
  BASELINE: {
    puzzleProjectionSha256: 'ff7b9afa247fb3e215fa33c2b740be10c67c67bc0d2b3ef69b831a76e5d4116a',
    worldEnvelopeSha256: 'a3c6a85c26a6b197daeb3fdfb687cd99325308b4956fba8efacdc591782a47e6',
    presentationSha256: 'a7c5d0c4591123d36b810b972d05e7ddd764ac2d74c505435ca53ab5371dc7a6',
    hashTradeSha256: '12d237aad4f284004b6629cfd2e64768ba7c00c97dad0750856734134e8ca8a4'
  },
  PUZZLE_KIT: {
    puzzleProjectionSha256: '74e7d2560a5b4a48d2af57e91684cc019c10be602801789ca9f9db02b48d810e',
    worldEnvelopeSha256: '54b50b9b432328b37e45a5a486c7fdaa0610a577ccaddce180fd05420e3e6cd0',
    presentationSha256: 'd4a9b58a889b73ad7ca0dfe816e72f142d49fde425b82d43db09608ac1355886',
    hashTradeSha256: '255af12f11fe4238aa2b5fab0162de8284e57f1bdbc172e35ff7947f4130c522'
  }
};

var RUNTIME_SHA256 = 'df9436e9b4e511983acb9b5e87b6529e3dfdb4ae14aee3d9a9cd6357d6bc0fa8';
var NON_TARGET_SHA256 = 'd93ecd5049b62b0684dca532632c62769384ae7dbebcb9fa33e0c3f1d6f86526';
var GRID = [
  '###############',
  '#...#.........#',
  '#####.###.###.#',
  '#...#...#.....#',
  '#.#####.#.###.#',
  '#.............#',
  '#.###.#.#####.#',
  '#...#.........#',
  '###############',
  '#######D#######',
  '###############'
];
var PRESENTATION = {
  theme: 'dungeon', wallTex: 'stone', floorTex: 'slab', ceilTex: 'rib',
  decorDensity: 0.015, maxDecor: 2, wallDecorDensity: 0.025, maxWallDecor: 2,
  decor: [{ x: 7, y: 3, icon: 'ritual_marks', scale: 1.15 }],
  wallDecor: [{ x: 8, y: 4, face: 'W', kind: 'sigil', u: 0.5, v: 0.30, scale: 1.2 }],
  exitStyle: 'portcullis', pillarStyle: 'ruined',
  pillars: [
    { x: 6, y: 5, style: 'ruined', scale: 1.35 },
    { x: 8, y: 5, style: 'ruined', scale: 1.35 },
    { x: 11, y: 1, style: 'crystal', scale: 1.20 },
    { x: 11, y: 7, style: 'obelisk', scale: 1.30 }
  ]
};
var PRESENTATION_KEYS = [
  'theme', 'wallTex', 'floorTex', 'ceilTex', 'decorDensity', 'maxDecor',
  'wallDecorDensity', 'maxWallDecor', 'decor', 'wallDecor', 'exitStyle',
  'pillarStyle', 'pillars'
];
var CLUE_KEYS = ['puzzleHasGem', 'puzzleHasFloorRelic', 'puzzleHasWallNote'];
var PUZZLE_KEYS = ['puzzleEscaped'].concat(CLUE_KEYS, ['puzzleSolvedRuneLock']);

var pass = 0, fail = 0;
function ok(condition, message, detail) {
  if (condition) { pass++; console.log('  ok  ' + message); }
  else { fail++; console.log('  FAIL ' + message + (detail ? ' -> ' + detail : '')); }
}
function own(value, key) { return Object.prototype.hasOwnProperty.call(value || {}, key); }
function fresh(modulePath) { delete require.cache[require.resolve(modulePath)]; return require(modulePath); }
function loadWorld() { return fresh(WORLD_PATH); }
function puzzleNode(world) { return world.maps.m.nodes.puzzle_maze; }
function puzzleEntry(world) { return world.maps.m.nodes.hub.links.filter(function (link) { return link.to === 'puzzle_maze'; })[0]; }
function coordKey(x, y) { return x + ',' + y; }

function canonicalize(value) {
  if (value === undefined) return { '$undefined': true };
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('canonicalizer rejects non-finite number');
  if (typeof value === 'number' && Object.is(value, -0)) return { '$number': '-0' };
  if (typeof value === 'function') return { '$function': Function.prototype.toString.call(value) };
  if (Array.isArray(value)) {
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('canonicalizer rejects array symbol fields');
    var allowed = { length: true }, arrayOut = new Array(value.length);
    for (var arrayIndex = 0; arrayIndex < value.length; arrayIndex++) {
      var arrayKey = String(arrayIndex), descriptor = Object.getOwnPropertyDescriptor(value, arrayKey);
      if (!descriptor) throw new TypeError('canonicalizer rejects sparse array slot:' + arrayKey);
      allowed[arrayKey] = true; arrayOut[arrayIndex] = canonicalize(descriptor.value);
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
function worldEnvelope(world) {
  var out = {};
  ['id', 'start', 'seed', 'initState', 'items'].forEach(function (key) { if (own(world, key)) out[key] = world[key]; });
  return out;
}
function presentationProjection(world) {
  var maze = puzzleNode(world).maze, out = {};
  PRESENTATION_KEYS.forEach(function (key) { if (own(maze, key)) out[key] = maze[key]; });
  return out;
}
function puzzleProjection(world) {
  return { entry: puzzleEntry(world), node: puzzleNode(world) };
}
function nonTargetProjection(world) {
  var maps = {};
  Object.keys(world.maps || {}).forEach(function (mapId) {
    var map = world.maps[mapId], nodes = {};
    Object.keys(map.nodes || {}).forEach(function (nodeId) {
      if (mapId === 'm' && (nodeId === 'puzzle_maze' || nodeId === 'puzzle_done')) return;
      if (mapId === 'm' && nodeId === 'hub') {
        var hub = copyWithout(map.nodes[nodeId], { links: true });
        hub.links = map.nodes[nodeId].links.filter(function (link) { return link.to !== 'puzzle_maze'; });
        nodes[nodeId] = hub;
      } else nodes[nodeId] = map.nodes[nodeId];
    });
    maps[mapId] = { name: map.name, nodes: nodes };
  });
  return maps;
}

function cellAt(grid, x, y) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || y < 0 || y >= grid.length || x < 0 || x >= grid[y].length) return null;
  return grid[y][x];
}
function setCell(grid, x, y, ch) { grid[y] = grid[y].slice(0, x) + ch + grid[y].slice(x + 1); }
function applySet(grid, actions) { (actions || []).forEach(function (item) { setCell(grid, item.x, item.y, item.ch); }); }
function blockedAt(item) { var out = {}; if (item) out[coordKey(item.x, item.y)] = true; return out; }
function distanceValue(value) { return Number.isFinite(value) ? value : 'unreachable'; }
function bfsDistance(grid, start, goal, blocked) {
  blocked = blocked || {};
  if (!start || !goal || blocked[coordKey(start.x, start.y)] || blocked[coordKey(goal.x, goal.y)] || cellAt(grid, start.x, start.y) === '#' || cellAt(grid, goal.x, goal.y) === '#') return Infinity;
  var queue = [{ x: start.x, y: start.y, distance: 0 }], seen = {};
  seen[coordKey(start.x, start.y)] = true;
  for (var index = 0; index < queue.length; index++) {
    var current = queue[index];
    if (current.x === goal.x && current.y === goal.y) return current.distance;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (delta) {
      var x = current.x + delta[0], y = current.y + delta[1], key = coordKey(x, y);
      if (!seen[key] && !blocked[key] && cellAt(grid, x, y) != null && cellAt(grid, x, y) !== '#') {
        seen[key] = true; queue.push({ x: x, y: y, distance: current.distance + 1 });
      }
    });
  }
  return Infinity;
}
function shortestWarpPath(maze, grid, start, goal, blocked) {
  blocked = blocked || {};
  var warps = {};
  (maze.events || []).forEach(function (event) { if (event.warp) warps[coordKey(event.x, event.y)] = event.warp; });
  var queue = [{ x: start.x, y: start.y, path: [coordKey(start.x, start.y)] }], seen = {};
  seen[coordKey(start.x, start.y)] = true;
  for (var index = 0; index < queue.length; index++) {
    var current = queue[index];
    if (current.x === goal.x && current.y === goal.y) return queue[index].path;
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (delta) {
      var enteredX = current.x + delta[0], enteredY = current.y + delta[1], enteredKey = coordKey(enteredX, enteredY);
      if (blocked[enteredKey] || cellAt(grid, enteredX, enteredY) == null || cellAt(grid, enteredX, enteredY) === '#') return;
      var warp = warps[enteredKey], x = warp ? warp.x : enteredX, y = warp ? warp.y : enteredY, key = coordKey(x, y);
      if (blocked[key] || cellAt(grid, x, y) == null || cellAt(grid, x, y) === '#' || seen[key]) return;
      seen[key] = true; queue.push({ x: x, y: y, path: current.path.concat([enteredKey], warp ? [key] : []) });
    });
  }
  return null;
}
function findEvent(maze, predicate) { return (maze.events || []).filter(predicate)[0]; }
function eventAt(maze, x, y) { return findEvent(maze, function (event) { return event.x === x && event.y === y; }); }
function clueCount(state) { return CLUE_KEYS.reduce(function (sum, key) { return sum + (state[key] ? 1 : 0); }, 0); }
function activePage(pages, state) {
  var selected = null, index = -1;
  (pages || []).forEach(function (page, pageIndex) {
    if (!page.when || page.when(state)) { selected = page; index = pageIndex; }
  });
  return { page: selected, index: index };
}
function stateWith(world, patch) {
  var state = JSON.parse(JSON.stringify(world.initState || {}));
  Object.keys(patch || {}).forEach(function (key) { state[key] = patch[key]; });
  return state;
}
function actionDelta(action, state, grid, ledger, eventId, once) {
  if (action && typeof action.run === 'function') action.run(state);
  if (action && action.set) applySet(grid, action.set);
  if (once) { ledger.consumed[eventId] = true; ledger.history.push(eventId); }
}
function settlePuzzleAttempt(event, page, mode, state, grid, ledger) {
  if (mode === 'cancel') return { feedback: '' };
  if (mode === 'wrong') return { feedback: page.fail && page.fail.hint || '' };
  actionDelta(page.success, state, grid, ledger, coordKey(event.x, event.y), !!event.once);
  return { feedback: page.success && page.success.hint || '' };
}
function settleConditionalEvent(event, state, grid, ledger) {
  if (event.when && !event.when(state)) return false;
  actionDelta(event, state, grid, ledger, coordKey(event.x, event.y), !!event.once);
  return true;
}
function changedKeys(before, after) {
  var keys = {}, changed = [];
  Object.keys(before).concat(Object.keys(after)).forEach(function (key) { keys[key] = true; });
  Object.keys(keys).sort().forEach(function (key) { if (canonicalString(before[key]) !== canonicalString(after[key])) changed.push(key); });
  return changed;
}

function resetPuzzle(S) { S.puzzleEscaped = false; S.puzzleHasGem = false; S.puzzleHasFloorRelic = false; S.puzzleHasWallNote = false; S.puzzleSolvedRuneLock = false; }
function makePuzzleKitWorld() {
  var world = loadWorld();
  delete world.initState.puzzleOpenedFinalDoor;
  var entry = puzzleEntry(world), hubLinks = world.maps.m.nodes.hub.links;
  entry.label = 'Recipe 3 · 分支仪式库:三线索、可选捷径、符文锁';
  entry.run = resetPuzzle;
  hubLinks.splice(hubLinks.indexOf(entry), 1); hubLinks.unshift(entry);
  var node = puzzleNode(world), maze = node.maze;
  node.title = 'Recipe 3 · 分支仪式库';
  node.look = '先踩压力板打开中央分支,再以任意顺序找齐宝石、地砖遗物与墙上残纸。三条支路汇回中央的三槽符文锁;残纸会收入背包,可随时重读符号的点亮顺序。\n\n地砖支路有一条可选 warp 捷径,但普通路线同样可达。符文锁会逐项回执 0/3、1/3、2/3;三项齐全后才开放可重试的 sequence。答错不会消耗线索或改变通道。';
  node.wonText = '最后一道闸门打开。三条线索支路在中央符文锁汇合,前方唯一的门通向仪式库外。';
  maze.grid = GRID.slice();
  maze.start = { x: 1, y: 1, dir: 'E' };
  PRESENTATION_KEYS.forEach(function (key) { maze[key] = PRESENTATION[key]; });
  var done = world.maps.m.nodes.puzzle_done;
  done.title = '分支仪式库 · 完成';
  done.look = '三条支路汇回中央符文锁。你可以换一个线索顺序再来：先看见锁，自由找齐三线索，回到中枢解谜，最后由唯一出口收口。';
  maze.events = [
    { x: 3, y: 1, once: true, visual: 'plate', hint: '压力板让通往中央仪式厅的石墙沉下。', set: [{ x: 4, y: 1, ch: '.' }] },
    { x: 5, y: 3, visual: 'marker', hint: '符文捷径把你送到地砖支路入口。', warp: { x: 1, y: 7, dir: 'E' } },
    { x: 2, y: 7, visual: 'trap', hint: '旋转地砖把你转向西侧。', turn: 'W' },
    { x: 3, y: 7, once: true, visual: 'floor-pickup', icon: 'ritual_marks', hint: '你拓下地砖遗物。', run: function (S) { S.puzzleHasFloorRelic = true; } },
    { x: 13, y: 1, once: true, visual: 'pickup', icon: 'gem', hint: '你取下宝石。', run: function (S) { S.puzzleHasGem = true; } },
    { x: 13, y: 7, once: true, visual: 'wall-pickup', face: 'S', icon: 'scroll', hint: '你从南墙抽出符文残纸,已收入背包。', run: function (S) { S.puzzleHasWallNote = true; var inventory = S.inventory || (S.inventory = []); if (inventory.indexOf('rune-note') < 0) inventory.push('rune-note'); } },
    { x: 7, y: 5, visual: 'plate', pages: [
      { hint: '三处凹槽仍暗着:0/3。' },
      { when: function (S) { return Number(!!S.puzzleHasGem) + Number(!!S.puzzleHasFloorRelic) + Number(!!S.puzzleHasWallNote) === 1 && !S.puzzleSolvedRuneLock; }, hint: '一处凹槽亮起:1/3。' },
      { when: function (S) { return Number(!!S.puzzleHasGem) + Number(!!S.puzzleHasFloorRelic) + Number(!!S.puzzleHasWallNote) === 2 && !S.puzzleSolvedRuneLock; }, hint: '两处凹槽亮起:2/3。' },
      { when: function (S) { return !!(S.puzzleHasGem && S.puzzleHasFloorRelic && S.puzzleHasWallNote && !S.puzzleSolvedRuneLock); }, examine: '三处凹槽齐亮,符文锁等待点亮顺序。', puzzle: { kind: 'sequence', prompt: '按背包中符文残纸记录的顺序点亮符号。', choices: ['月', '星', '火'], answer: ['月', '火', '星'] }, success: { hint: '三枚符号依次亮起,最后通道打开。', run: function (S) { S.puzzleSolvedRuneLock = true; }, set: [{ x: 7, y: 8, ch: '.' }] }, fail: { hint: '符号熄灭。顺序不对,请重读背包里的符文残纸。' } },
      { when: function (S) { return !!S.puzzleSolvedRuneLock; }, examine: '符文锁已经熄灭,最后通道保持开启。' }
    ] },
    { x: 7, y: 7, visual: 'none', when: function (S) { return !!S.puzzleSolvedRuneLock; }, set: [{ x: 7, y: 8, ch: '.' }] }
  ];
  return world;
}

function baselineErrors(world) {
  var errors = [], node = puzzleNode(world), maze = node.maze, opened = maze.grid.slice();
  var opening = eventAt(maze, 3, 1), gem = findEvent(maze, function (event) { return event.visual === 'pickup' && event.icon === 'gem'; });
  var floor = findEvent(maze, function (event) { return event.visual === 'floor-pickup'; });
  var note = findEvent(maze, function (event) { return event.visual === 'wall-pickup'; });
  var lock = findEvent(maze, function (event) { return Array.isArray(event.pages); });
  if (canonicalString(maze.grid) !== canonicalString(['#############', '#....#......#', '###########.#', '#...........#', '#############', '#...........#', '###########.#', '#D......#...#'])) errors.push('baseline-grid');
  if (!opening || canonicalString(opening.set) !== canonicalString([{ x: 5, y: 1, ch: '.' }])) errors.push('baseline-opening');
  else applySet(opened, opening.set);
  var pathToLock = lock && shortestWarpPath(maze, opened, maze.start, lock, {});
  var gemIndex = pathToLock && pathToLock.indexOf(coordKey(gem.x, gem.y));
  var floorIndex = pathToLock && pathToLock.indexOf(coordKey(floor.x, floor.y));
  if (!gem || !floor || !note || !lock || floor.x !== note.x || floor.y !== note.y || !pathToLock || gemIndex < 0 || floorIndex < 0 || !(gemIndex < floorIndex)) errors.push('baseline-linear-order');
  if (lock && gem && shortestWarpPath(maze, opened, maze.start, lock, blockedAt(gem)) !== null) errors.push('baseline-gem-not-mandatory');
  if (lock && floor && shortestWarpPath(maze, opened, maze.start, lock, blockedAt(floor)) !== null) errors.push('baseline-floor-not-mandatory');
  var pages = lock && lock.pages || [], states = [
    {}, { puzzleHasGem: true }, { puzzleHasGem: true, puzzleHasFloorRelic: true },
    { puzzleHasGem: true, puzzleHasFloorRelic: true, puzzleHasWallNote: true },
    { puzzleHasGem: true, puzzleHasFloorRelic: true, puzzleHasWallNote: true, puzzleSolvedRuneLock: true }
  ];
  var pageIndexes = states.map(function (state) { return activePage(pages, state).index; });
  if (pages.length !== 3 || canonicalString(pageIndexes) !== canonicalString([0, 0, 0, 1, 2])) errors.push('baseline-coarse-pages');
  var duplicate = own(world.initState, 'puzzleOpenedFinalDoor'), entryState = { puzzleOpenedFinalDoor: true }, successState = {};
  if (puzzleEntry(world) && puzzleEntry(world).run) puzzleEntry(world).run(entryState);
  var success = pages[1] && pages[1].success;
  if (success && success.run) success.run(successState);
  if (!duplicate || entryState.puzzleOpenedFinalDoor !== false || successState.puzzleOpenedFinalDoor !== true || successState.puzzleSolvedRuneLock !== true) errors.push('baseline-duplicate-solved-state');
  return errors;
}

function projectionErrors(world) {
  var errors = [], node = puzzleNode(world), maze = node.maze;
  if (node.kind !== 'maze3d' || node.winKey !== 'puzzleEscaped') errors.push('projection:node-contract');
  if (canonicalString(maze.grid) !== canonicalString(GRID)) errors.push('projection:grid');
  if (canonicalString(maze.start) !== canonicalString({ x: 1, y: 1, dir: 'E' })) errors.push('projection:start');
  var expected = [
    [3, 1, 'plate'], [5, 3, 'marker'], [2, 7, 'trap'], [3, 7, 'floor-pickup'],
    [13, 1, 'pickup'], [13, 7, 'wall-pickup'], [7, 5, 'plate'], [7, 7, 'none']
  ];
  if ((maze.events || []).length !== expected.length || expected.some(function (item) {
    var event = eventAt(maze, item[0], item[1]); return !event || event.visual !== item[2];
  })) errors.push('projection:functional-coordinates');
  var exits = [];
  maze.grid.forEach(function (row, y) { for (var x = 0; x < row.length; x++) if (row[x] === 'D') exits.push({ x: x, y: y }); });
  if (canonicalString(exits) !== canonicalString([{ x: 7, y: 9 }])) errors.push('projection:single-exit');
  return errors;
}

function bfsErrors(world) {
  var errors = [], maze = puzzleNode(world).maze, initial = maze.grid.slice(), opened = initial.slice(), solved;
  var opening = eventAt(maze, 3, 1), warp = eventAt(maze, 5, 3), turn = eventAt(maze, 2, 7), floor = eventAt(maze, 3, 7);
  var gem = eventAt(maze, 13, 1), note = eventAt(maze, 13, 7), lock = eventAt(maze, 7, 5), exit = { x: 7, y: 9 }, door = { x: 7, y: 8 };
  if (!opening || canonicalString(opening.set) !== canonicalString([{ x: 4, y: 1, ch: '.' }]) || !opening.once) errors.push('bfs:opening-set');
  if (!warp || canonicalString(warp.warp) !== canonicalString({ x: 1, y: 7, dir: 'E' })) errors.push('bfs:warp-target');
  if (!turn || turn.turn !== 'W' || own(turn, 'once')) errors.push('bfs:forced-turn');
  if (cellAt(initial, 7, 8) !== '#') errors.push('bfs:initial-passage');
  if (bfsDistance(initial, maze.start, lock) !== Infinity || bfsDistance(initial, maze.start, exit) !== Infinity) errors.push('bfs:initial-gates');
  if (opening) applySet(opened, opening.set);
  var openedFacts = [
    bfsDistance(opened, maze.start, gem), bfsDistance(opened, maze.start, floor),
    bfsDistance(opened, maze.start, note), bfsDistance(opened, maze.start, lock),
    bfsDistance(opened, maze.start, exit), bfsDistance(opened, { x: 1, y: 7 }, floor),
    bfsDistance(opened, { x: 5, y: 3 }, floor), bfsDistance(opened, maze.start, { x: 1, y: 7 }),
    bfsDistance(opened, maze.start, floor, blockedAt(warp))
  ];
  if (canonicalString(openedFacts.map(distanceValue)) !== canonicalString([12, 20, 18, 10, 'unreachable', 2, 14, 18, 24])) errors.push('bfs:opened-distances');
  [gem, floor, note].forEach(function (clue, clueIndex) {
    if (!clue) { errors.push('branch:missing-clue-' + clueIndex); return; }
    var blocked = blockedAt(clue);
    [gem, floor, note].forEach(function (other, otherIndex) {
      if (otherIndex !== clueIndex && other && bfsDistance(opened, maze.start, other, blocked) === Infinity) errors.push('branch:clue-dominates-' + clueIndex + '-' + otherIndex);
    });
    if (lock && bfsDistance(opened, maze.start, lock, blocked) === Infinity) errors.push('branch:clue-dominates-lock-' + clueIndex);
  });
  if (bfsDistance(opened, maze.start, floor, blockedAt(warp)) === Infinity || bfsDistance(opened, { x: 1, y: 7 }, floor) >= bfsDistance(opened, { x: 5, y: 3 }, floor)) errors.push('bfs:warp-optional');
  var lockPage = lock && activePage(lock.pages, { puzzleHasGem: true, puzzleHasFloorRelic: true, puzzleHasWallNote: true }).page;
  solved = opened.slice();
  if (lockPage && lockPage.success) applySet(solved, lockPage.success.set);
  if (bfsDistance(solved, maze.start, door) !== 13 || bfsDistance(solved, maze.start, exit) !== 14) errors.push('bfs:solved-distances');
  return errors;
}

function clueAndPageErrors(world) {
  var errors = [], maze = puzzleNode(world).maze, gem = eventAt(maze, 13, 1), floor = eventAt(maze, 3, 7), note = eventAt(maze, 13, 7), lock = eventAt(maze, 7, 5);
  var clueEvents = { gem: gem, floor: floor, note: note };
  [['gem', 'floor', 'note'], ['note', 'gem', 'floor'], ['floor', 'note', 'gem']].forEach(function (order, orderIndex) {
    var state = stateWith(world, {});
    order.forEach(function (name) { if (clueEvents[name] && typeof clueEvents[name].run === 'function') clueEvents[name].run(state); });
    if (clueCount(state) !== 3) errors.push('clues:order-' + orderIndex);
  });
  CLUE_KEYS.forEach(function (key, keyIndex) {
    var event = [gem, floor, note][keyIndex], state = stateWith(world, {});
    if (event && event.run) event.run(state);
    if (!state[key]) errors.push('clues:write-' + key);
  });
  if (!lock || !Array.isArray(lock.pages) || lock.pages.length !== 5) { errors.push('pages:shape'); return errors; }
  var states = [stateWith(world, {}), stateWith(world, { puzzleHasGem: true }), stateWith(world, { puzzleHasGem: true, puzzleHasFloorRelic: true }), stateWith(world, { puzzleHasGem: true, puzzleHasFloorRelic: true, puzzleHasWallNote: true }), stateWith(world, { puzzleHasGem: true, puzzleHasFloorRelic: true, puzzleHasWallNote: true, puzzleSolvedRuneLock: true })];
  var indexes = states.map(function (state) { return activePage(lock.pages, state).index; });
  if (canonicalString(indexes) !== canonicalString([0, 1, 2, 3, 4])) errors.push('pages:state-projection');
  for (var mask = 0; mask < 8; mask++) {
    var patch = {}, count = 0;
    CLUE_KEYS.forEach(function (key, bit) { patch[key] = !!(mask & (1 << bit)); if (patch[key]) count++; });
    var active = activePage(lock.pages, stateWith(world, patch));
    if (active.index !== count || (count < 3 && active.page && active.page.puzzle)) errors.push('pages:partial-mask-' + mask);
  }
  var puzzlePage = lock.pages[3], successKeys = Object.keys(puzzlePage.success || {}).sort(), failKeys = Object.keys(puzzlePage.fail || {}).sort();
  if (!puzzlePage.puzzle || puzzlePage.puzzle.kind !== 'sequence' || canonicalString(puzzlePage.puzzle.answer) !== canonicalString(['月', '火', '星'])) errors.push('pages:puzzle-answer');
  if (canonicalString(successKeys) !== canonicalString(['hint', 'run', 'set']) || canonicalString(failKeys) !== canonicalString(['hint']) || !puzzlePage.fail.hint) errors.push('pages:outcome-fields');
  if (canonicalString(puzzlePage.success.set) !== canonicalString([{ x: 7, y: 8, ch: '.' }])) errors.push('pages:success-set');
  return errors;
}

function settlementErrors(world) {
  var errors = [], maze = puzzleNode(world).maze, lock = eventAt(maze, 7, 5), page = lock && lock.pages[3];
  if (!lock || !page) return ['settlement:missing-lock'];
  ['wrong', 'cancel'].forEach(function (mode) {
    var state = stateWith(world, { puzzleHasGem: true, puzzleHasFloorRelic: true, puzzleHasWallNote: true }), grid = maze.grid.slice(), ledger = { consumed: {}, history: [] };
    var before = { state: canonicalString(state), grid: canonicalString(grid), ledger: canonicalString(ledger) };
    settlePuzzleAttempt(lock, page, mode, state, grid, ledger);
    if (before.state !== canonicalString(state) || before.grid !== canonicalString(grid) || before.ledger !== canonicalString(ledger)) errors.push('settlement:' + mode + '-mutated');
  });
  var successState = stateWith(world, { puzzleHasGem: true, puzzleHasFloorRelic: true, puzzleHasWallNote: true }), beforeState = JSON.parse(JSON.stringify(successState));
  var successGrid = maze.grid.slice(), successLedger = { consumed: {}, history: [] }, ledgerBefore = canonicalString(successLedger);
  settlePuzzleAttempt(lock, page, 'correct', successState, successGrid, successLedger);
  if (canonicalString(changedKeys(beforeState, successState)) !== canonicalString(['puzzleSolvedRuneLock']) || cellAt(successGrid, 7, 8) !== '.' || ledgerBefore !== canonicalString(successLedger)) errors.push('settlement:success-delta');
  if (own(successState, 'puzzleOpenedFinalDoor') || own(world.initState, 'puzzleOpenedFinalDoor')) errors.push('retired-state:puzzleOpenedFinalDoor');
  return errors;
}

function resetAndRehydrateErrors(world) {
  var errors = [], maze = puzzleNode(world).maze, note = eventAt(maze, 13, 7), rehydrate = eventAt(maze, 7, 7), entry = puzzleEntry(world);
  var noteState = stateWith(world, { inventory: [] });
  if (note && note.run) { note.run(noteState); note.run(noteState); }
  if (!noteState.puzzleHasWallNote || canonicalString(noteState.inventory) !== canonicalString(['rune-note'])) errors.push('inventory-dedupe');
  var recipeState = stateWith(world, { puzzleEscaped: true, puzzleHasGem: true, puzzleHasFloorRelic: true, puzzleHasWallNote: true, puzzleSolvedRuneLock: true, inventory: ['rune-note'] });
  if (entry && entry.run) entry.run(recipeState);
  if (!entry || typeof entry.run !== 'function' || PUZZLE_KEYS.some(function (key) { return recipeState[key] !== false; }) || canonicalString(recipeState.inventory) !== canonicalString(['rune-note'])) errors.push('reset:recipe-reentry');
  if (!rehydrate || rehydrate.visual !== 'none' || own(rehydrate, 'once') || own(rehydrate, 'hint') || own(rehydrate, 'run') || canonicalString(rehydrate.set) !== canonicalString([{ x: 7, y: 8, ch: '.' }])) errors.push('rehydrate:shape');
  if (rehydrate) {
    var unsolvedState = stateWith(world, {}), unsolvedGrid = maze.grid.slice(), unsolvedLedger = { consumed: {}, history: [] }, unsolvedBefore = canonicalString({ state: unsolvedState, grid: unsolvedGrid, ledger: unsolvedLedger });
    settleConditionalEvent(rehydrate, unsolvedState, unsolvedGrid, unsolvedLedger);
    if (unsolvedBefore !== canonicalString({ state: unsolvedState, grid: unsolvedGrid, ledger: unsolvedLedger })) errors.push('rehydrate:unsolved-action');
    var solvedState = stateWith(world, { puzzleSolvedRuneLock: true }), solvedBefore = JSON.parse(JSON.stringify(solvedState)), solvedGrid = maze.grid.slice(), solvedLedger = { consumed: {}, history: [] };
    settleConditionalEvent(rehydrate, solvedState, solvedGrid, solvedLedger);
    if (canonicalString(solvedState) !== canonicalString(solvedBefore) || cellAt(solvedGrid, 7, 8) !== '.' || solvedLedger.history.length) errors.push('rehydrate:solved-delta');
  }
  return errors;
}

function globalResetErrors(world) {
  var errors = [], createEngine = fresh(CORE_PATH).createEngine, createResetPlugin = fresh(RESET_PLUGIN_PATH).createResetPlugin;
  var resetWorld = {
    id: '8f520625-ec31-4476-971a-9e13d3d05c35', start: { map: 'm', node: 'start' },
    initState: JSON.parse(JSON.stringify(world.initState)),
    maps: { m: { nodes: { start: { kind: 'reset-probe', title: 'reset' } } } }
  };
  var engine = createEngine(resetWorld, { storage: null });
  engine.registerModule({ id: 'reset-probe', nodeKinds: ['reset-probe'], render: function () { return { title: 'reset', body: [] }; } });
  var plugin = createResetPlugin({ document: null, confirm: false });
  engine.use(plugin); engine.start();
  var initialInventory = engine.state.inventory;
  engine.state.inventory.push('rune-note');
  PUZZLE_KEYS.forEach(function (key) { engine.state[key] = true; });
  plugin.reset();
  if (canonicalString(engine.state.inventory) !== canonicalString(resetWorld.initState.inventory) || engine.state.inventory === initialInventory || PUZZLE_KEYS.some(function (key) { return engine.state[key] !== resetWorld.initState[key]; })) errors.push('reset:global-plugin');
  return errors;
}

var THEME_DECOR = { dungeon: ['rubble', 'skull', 'ash_pile', 'cloth_rags'] };
var THEME_WALL_DECOR = { dungeon: ['crack', 'arms', 'torch', 'chains', 'sigil'] };
function hashStr(value) { var hash = 2166136261 >>> 0; value = String(value); for (var i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; } return hash >>> 0; }
function mulberry32(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var value = Math.imul(seed ^ seed >>> 15, 1 | seed); value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value; return ((value ^ value >>> 14) >>> 0) / 4294967296; }; }
function presentationErrors(world) {
  var errors = [], maze = puzzleNode(world).maze, grid = maze.grid, reserved = {}, dynamic = {}, occupied = {}, functionalWalls = {};
  if (canonicalString(presentationProjection(world)) !== canonicalString(PRESENTATION)) errors.push('presentation:exact-projection');
  function reserve(item, reason) { if (item) reserved[coordKey(item.x, item.y)] = reason; }
  reserve(maze.start, 'start');
  grid.forEach(function (row, y) { for (var x = 0; x < row.length; x++) if (row[x] === 'D') reserve({ x: x, y: y }, 'exit'); });
  function scanAction(value) {
    if (Array.isArray(value)) { value.forEach(scanAction); return; }
    if (!value || typeof value !== 'object') return;
    Object.keys(value).forEach(function (key) {
      var child = value[key];
      if (key === 'set' && Array.isArray(child)) child.forEach(function (target) { reserve(target, 'dynamic-set'); dynamic[coordKey(target.x, target.y)] = true; });
      if (key === 'warp' && child && typeof child === 'object') reserve(child, 'warp-target');
      scanAction(child);
    });
  }
  (maze.events || []).forEach(function (event) {
    reserve(event, 'event'); scanAction(event);
    if (event.visual === 'wall-pickup') {
      var offsets = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }, opposite = { N: 'S', S: 'N', E: 'W', W: 'E' }, face = String(event.face || '').toUpperCase(), delta = offsets[face];
      if (delta) functionalWalls[coordKey(event.x + delta[0], event.y + delta[1]) + ',' + opposite[face]] = true;
    }
  });
  (maze.decor || []).concat(maze.pillars || []).forEach(function (item, index) {
    var key = coordKey(item.x, item.y);
    if (cellAt(grid, item.x, item.y) !== '.') errors.push('presentation:floor-cell-' + index);
    if (reserved[key]) errors.push('presentation:floor-reserved-' + reserved[key]);
    if (occupied[key]) errors.push('presentation:floor-sibling-' + key);
    occupied[key] = true;
  });
  var faceOffsets = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }, wallKeys = {};
  function checkWall(item, label) {
    var face = String(item.face || '').toUpperCase(), delta = faceOffsets[face], key = coordKey(item.x, item.y) + ',' + face;
    if (cellAt(grid, item.x, item.y) !== '#') errors.push('presentation:wall-cell-' + label);
    if (!delta || ['#', 'D', null].indexOf(cellAt(grid, item.x + (delta ? delta[0] : 0), item.y + (delta ? delta[1] : 0))) >= 0) errors.push('presentation:wall-hidden-' + label);
    if (dynamic[coordKey(item.x, item.y)]) errors.push('presentation:wall-dynamic-' + label);
    if (functionalWalls[key]) errors.push('presentation:wall-functional-' + label);
    if (wallKeys[key]) errors.push('presentation:wall-sibling-' + label);
    wallKeys[key] = true;
  }
  (maze.wallDecor || []).forEach(function (item, index) { checkWall(item, 'explicit-' + index); });
  var runtimeBlocked = {};
  Object.keys(reserved).forEach(function (key) { runtimeBlocked[key] = true; });
  Object.keys(occupied).forEach(function (key) { runtimeBlocked[key] = true; });
  var floorList = THEME_DECOR[maze.theme] || [], floorCount = 0;
  for (var y = 0; y < grid.length && floorCount < maze.maxDecor; y++) for (var x = 0; x < grid[y].length && floorCount < maze.maxDecor; x++) {
    var floorKey = coordKey(x, y);
    if (cellAt(grid, x, y) !== '.' || runtimeBlocked[floorKey] || !floorList.length) continue;
    if (mulberry32(hashStr('decor' + maze.theme + '_' + x + '_' + y + '_' + grid.length + '_' + grid[y].length))() >= maze.decorDensity) continue;
    if (reserved[floorKey]) errors.push('presentation:auto-floor-reserved-' + reserved[floorKey]);
    runtimeBlocked[floorKey] = true; floorCount++;
  }
  var wallList = THEME_WALL_DECOR[maze.theme] || [], faces = ['N', 'E', 'S', 'W'], wallCount = 0;
  for (var wy = 0; wy < grid.length && wallCount < maze.maxWallDecor; wy++) for (var wx = 0; wx < grid[wy].length && wallCount < maze.maxWallDecor; wx++) {
    if (cellAt(grid, wx, wy) !== '#' || !wallList.length) continue;
    for (var fi = 0; fi < faces.length && wallCount < maze.maxWallDecor; fi++) {
      var wf = faces[fi], wd = faceOffsets[wf], neighbor = cellAt(grid, wx + wd[0], wy + wd[1]);
      if (neighbor == null || neighbor === '#' || neighbor === 'D') continue;
      if (mulberry32(hashStr('wdecor' + maze.theme + '_' + wx + '_' + wy + '_' + wf + '_' + grid.length + '_' + grid[wy].length))() >= maze.wallDecorDensity) continue;
      checkWall({ x: wx, y: wy, face: wf }, 'auto-' + wallCount); wallCount++;
    }
  }
  return errors;
}

function routeAndFreezeErrors(world) {
  var errors = [], node = puzzleNode(world), entry = puzzleEntry(world), hubLinks = world.maps.m.nodes.hub.links || [];
  if (!entry || typeof entry.run !== 'function' || !hubLinks[0] || hubLinks[0].to !== 'puzzle_maze') errors.push('route:entry-reset-order');
  var win = (node.links || []).filter(function (link) { return link.to === 'puzzle_done'; })[0];
  var escape = (node.links || []).filter(function (link) { return link.to === 'hub'; })[0];
  var done = world.maps.m.nodes.puzzle_done;
  if (!win || win.requires({ puzzleEscaped: true }) !== true || win.requires({ puzzleEscaped: false }) !== false || !escape) errors.push('route:win-reset-escape');
  if (!done || !/分支仪式库/.test(done.title || '') || !/三条支路/.test(done.look || '') || !Array.isArray(done.links) || !done.links.some(function (link) { return link.to === 'hub'; })) errors.push('route:done-copy');
  if (sha256(nonTargetProjection(world)) !== NON_TARGET_SHA256) errors.push('freeze:non-target');
  return errors;
}

function hashTradeSnapshot(recipeSource, fpsSource) {
  function capture(source, pattern, label) { var match = pattern.exec(source); if (!match) throw new Error('hash transaction anchor missing:' + label); return match[1]; }
  var recipeEnvelope = capture(recipeSource, /var ENVELOPES = \{[\s\S]*?maze3d: '([0-9a-f]{64})'/, 'recipe-envelope');
  var recipeWorld = capture(recipeSource, /var WORLD_HASHES = \{[\s\S]*?maze3d: '([0-9a-f]{64})'/, 'recipe-world');
  var fpsKitBlock = capture(fpsSource, /KIT: \{([\s\S]*?)\n  \}\n\};/, 'fps-kit-block');
  return {
    recipeTarget: capture(recipeSource, /recipe: 'dungeon ritual hall'[^\r\n]*hash: '([0-9a-f]{64})'/, 'recipe-target'),
    recipeEnvelope: recipeEnvelope,
    recipeWorld: recipeWorld,
    recipePresentation: capture(recipeSource, /EXPECTED_PRESENTATION_SIGNATURE = '([^']+)'/, 'recipe-presentation'),
    fpsEnvelope: capture(fpsSource, /var WORLD_ENVELOPES = \{[\s\S]*?maze3d: '([0-9a-f]{64})'/, 'fps-envelope'),
    fpsProjection: capture(fpsSource, /var FROZEN_WORLD_PROJECTIONS = \{[\s\S]*?maze3d: '([0-9a-f]{64})'/, 'fps-projection'),
    fpsDogfoodProtected: capture(fpsSource, /DOGFOOD_PROTECTED_SOURCE_SHA256 = '([0-9a-f]{64})'/, 'fps-dogfood-protected'),
    fpsKitMazeWorld: capture(fpsKitBlock, /mazeWorld: '([0-9a-f]{64})'/, 'fps-kit-maze-world')
  };
}
function phaseTransactionComplete(transaction) {
  return transaction && ['puzzleProjectionSha256', 'worldEnvelopeSha256', 'presentationSha256', 'hashTradeSha256'].every(function (key) { return /^[0-9a-f]{64}$/.test(String(transaction[key] || '')); });
}
function currentHashes(world, recipeSource, fpsSource) {
  return {
    puzzleProjectionSha256: sha256(puzzleProjection(world)),
    worldEnvelopeSha256: sha256(worldEnvelope(world)),
    presentationSha256: sha256(presentationProjection(world)),
    hashTradeSha256: sha256(hashTradeSnapshot(recipeSource, fpsSource))
  };
}
function puzzleKitErrors(world) {
  return projectionErrors(world).concat(bfsErrors(world), clueAndPageErrors(world), settlementErrors(world), resetAndRehydrateErrors(world), globalResetErrors(world), presentationErrors(world), routeAndFreezeErrors(world));
}
function hasIssue(errors, prefix) { return errors.some(function (error) { return error.indexOf(prefix) === 0; }); }

console.log('Maze3D Puzzle & Route Kit tests-first 闸');
var world = loadWorld(), recipeSource = fs.readFileSync(RECIPE_TEST_PATH, 'utf8'), fpsSource = fs.readFileSync(FPS_TEST_PATH, 'utf8');
var runtimeBytes = fs.readFileSync(RUNTIME_PATH), transaction = PHASE_TRANSACTIONS[ACTIVE_PHASE], baselineAuthorized = process.env[BASELINE_ENV] === '1';
ok(ACTIVE_PHASE === 'BASELINE' || ACTIVE_PHASE === 'PUZZLE_KIT', 'P0 阶段只能是唯一 BASELINE 或 PUZZLE_KIT', ACTIVE_PHASE);
ok(ACTIVE_PHASE === 'BASELINE' ? baselineAuthorized : !baselineAuthorized,
  'P1 BASELINE 仅 focused 显式授权；PUZZLE_KIT 硬拒 baseline 授权（正式 runner 不兼容旧态）',
  'phase=' + ACTIVE_PHASE + ' ' + BASELINE_ENV + '=' + String(process.env[BASELINE_ENV]));
ok(phaseTransactionComplete(transaction), 'P2 当前阶段四项受控 hash 交易值必须完整；PUZZLE_KIT 不得复用 baseline');

var hashes = currentHashes(world, recipeSource, fpsSource);
ok(!!transaction && canonicalString(hashes) === canonicalString(transaction),
  'P3 当前 world/projection/presentation/既有 hash 常量只命中唯一阶段交易',
  'actual=' + canonicalString(hashes) + ' expected=' + canonicalString(transaction));
ok(sha256(runtimeBytes) === RUNTIME_SHA256, 'P4 maze3d runtime bytes 保持冻结', sha256(runtimeBytes));
ok(sha256(nonTargetProjection(world)) === NON_TARGET_SHA256, 'P5 非目标 formal nodes 与 FPS Kit cadence 保持冻结', sha256(nonTargetProjection(world)));

if (ACTIVE_PHASE === 'BASELINE') {
  var baseline = baselineErrors(world);
  ok(baseline.length === 0, 'B1 旧 Recipe 3 线性单路、线索合格/必经、粗 pages 与重复 solved 状态证据完整', baseline.join(','));
} else {
  var actualKitErrors = puzzleKitErrors(world);
  ok(actualKitErrors.length === 0, 'K1 正式 world 命中唯一 PUZZLE_KIT projection/BFS/pages/reset/rehydrate/presentation/freeze', actualKitErrors.join(','));
}

var planned = makePuzzleKitWorld(), plannedErrors = puzzleKitErrors(planned), plannedHashes = currentHashes(planned, recipeSource, fpsSource);
ok(plannedErrors.length === 0,
  'K2 同一检查器上的 planned PUZZLE_KIT 纯数据夹具全绿（正向框架非 vacuous）', plannedErrors.join(','));
var plannedPhaseOk = ACTIVE_PHASE === 'BASELINE'
  ? plannedHashes.puzzleProjectionSha256 !== PHASE_TRANSACTIONS.BASELINE.puzzleProjectionSha256 &&
    plannedHashes.worldEnvelopeSha256 !== PHASE_TRANSACTIONS.BASELINE.worldEnvelopeSha256 &&
    plannedHashes.presentationSha256 !== PHASE_TRANSACTIONS.BASELINE.presentationSha256 &&
    plannedHashes.hashTradeSha256 === PHASE_TRANSACTIONS.BASELINE.hashTradeSha256
  : canonicalString(plannedHashes) === canonicalString(transaction);
ok(plannedPhaseOk && sha256(nonTargetProjection(planned)) === NON_TARGET_SHA256,
  'K3 planned delta 在 BASELINE 只预告待交易面；PUZZLE_KIT 切相后必须唯一命中正式交易，非目标始终冻结', canonicalString(plannedHashes));

console.log('反向变异');
function expectKitMutation(message, mutate, prefix) {
  var changed = makePuzzleKitWorld(); mutate(changed);
  var errors = puzzleKitErrors(changed);
  ok(hasIssue(errors, prefix), message, errors.join(','));
}
expectKitMutation('M1 合并两项 clue 到同一 wing/坐标会打红 functional projection', function (changed) {
  var maze = puzzleNode(changed).maze, floor = eventAt(maze, 3, 7); floor.x = 13; floor.y = 1;
}, 'projection:functional-coordinates');
expectKitMutation('M2 让 warp 成为 floor clue 唯一路会打红 optional route', function (changed) {
  setCell(puzzleNode(changed).maze.grid, 1, 6, '#');
}, 'bfs:warp-optional');
expectKitMutation('M3 warp 落点回到 forced-turn 同格会打红落点语义', function (changed) {
  eventAt(puzzleNode(changed).maze, 5, 3).warp.x = 2;
}, 'bfs:warp-target');
expectKitMutation('M4 删除任一 clue write 会打红真实收集顺序', function (changed) {
  eventAt(puzzleNode(changed).maze, 13, 1).run = function () {};
}, 'clues:');
expectKitMutation('M5 两项线索时提前暴露 puzzle 会打红 partial pages', function (changed) {
  eventAt(puzzleNode(changed).maze, 7, 5).pages[3].when = function (state) { return clueCount(state) >= 2 && !state.puzzleSolvedRuneLock; };
}, 'pages:');
expectKitMutation('M6 success 前预开 final passage 会打红 initial gate', function (changed) {
  setCell(puzzleNode(changed).maze.grid, 7, 8, '.');
}, 'bfs:initial-passage');
expectKitMutation('M7 success.set 改错格会打红唯一通道交易', function (changed) {
  eventAt(puzzleNode(changed).maze, 7, 5).pages[3].success.set[0].x = 6;
}, 'pages:success-set');
expectKitMutation('M8 重引 puzzleOpenedFinalDoor 会打红唯一 solved fact', function (changed) {
  changed.initState.puzzleOpenedFinalDoor = false;
}, 'retired-state:');
expectKitMutation('M9 rune-note 重复 push 会打红 inventory dedupe', function (changed) {
  eventAt(puzzleNode(changed).maze, 13, 7).run = function (state) { state.puzzleHasWallNote = true; (state.inventory || (state.inventory = [])).push('rune-note'); };
}, 'inventory-dedupe');
expectKitMutation('M10 wrong/fail 偷带 set 动作会打红零副作用边界', function (changed) {
  eventAt(puzzleNode(changed).maze, 7, 5).pages[3].fail.set = [{ x: 7, y: 8, ch: '.' }];
}, 'pages:outcome-fields');
expectKitMutation('M11 rehydrate 省略 visual:none 会打红隐形幂等形状', function (changed) {
  delete eventAt(puzzleNode(changed).maze, 7, 7).visual;
}, 'projection:functional-coordinates');
expectKitMutation('M12 Recipe 重入误清持久 inventory 会打红分账', function (changed) {
  puzzleEntry(changed).run = function (state) { resetPuzzle(state); state.inventory = []; };
}, 'reset:recipe-reentry');
expectKitMutation('M13 decor/pillar 占 opening event 功能格会打红', function (changed) {
  puzzleNode(changed).maze.decor = [{ x: 3, y: 1, icon: 'ritual_marks', scale: 1.15 }];
}, 'presentation:');
expectKitMutation('M14 wallDecor 占 rune-note 功能墙面会打红', function (changed) {
  puzzleNode(changed).maze.wallDecor = [{ x: 13, y: 8, face: 'N', kind: 'sigil', u: 0.5, v: 0.3, scale: 1.2 }];
}, 'presentation:wall-functional');
expectKitMutation('M15 非目标 basic node 漂移会打红冻结投影', function (changed) {
  changed.maps.m.nodes.basic_maze.title = 'mutation';
}, 'freeze:non-target');
expectKitMutation('M16 FPS cadence/guard HP 漂移会打红非目标冻结', function (changed) {
  changed.maps.m.nodes.fps_range.maze.combat.guard.hp++;
}, 'freeze:non-target');
expectKitMutation('M17 win link 漂移会打红闭环路由', function (changed) {
  puzzleNode(changed).links[0].to = 'hub';
}, 'route:win-reset-escape');
expectKitMutation('M17a Recipe 3 不在 hub 首位会打红推荐顺序', function (changed) {
  var links = changed.maps.m.nodes.hub.links, first = links.shift(); links.push(first);
}, 'route:entry-reset-order');
expectKitMutation('M17b puzzle_done 仍是旧机制目录文案会打红完成教学', function (changed) {
  changed.maps.m.nodes.puzzle_done.look = 'set / warp / turn / pickup / pages';
}, 'route:done-copy');

var runtimeMutation = Buffer.concat([runtimeBytes, Buffer.from('\n// mutation', 'utf8')]);
ok(sha256(runtimeMutation) !== RUNTIME_SHA256, 'M18 runtime 任一字节漂移会打红冻结 SHA');
var tradeBefore = sha256(hashTradeSnapshot(recipeSource, fpsSource));
var allowedTradeMutant = recipeSource.replace("hash: 'c4cff0019f84f3969b7f7514dd6765a7bab7402c7340d4eb7947461e6350c550'", "hash: '04cff0019f84f3969b7f7514dd6765a7bab7402c7340d4eb7947461e6350c550'");
ok(sha256(hashTradeSnapshot(allowedTradeMutant, fpsSource)) !== tradeBefore,
  'M19 设计列出的 dungeon target 常量一旦交易，当前阶段 hash 快照立即转红');
var unlistedTradeMutant = recipeSource.replace("hash: 'd6dcb49ffe245c656a826089b76337879a1bfbc3dc421e29ad5786eedf858698'", "hash: '06dcb49ffe245c656a826089b76337879a1bfbc3dc421e29ad5786eedf858698'");
var mutantPath = path.join(__dirname, 'recipe-dogfood.hash-freeze.mutant.tmp.cjs'), mutantRun = null;
try {
  fs.writeFileSync(mutantPath, unlistedTradeMutant);
  mutantRun = require('child_process').spawnSync(process.execPath, [mutantPath], { encoding: 'utf8' });
} finally {
  try { fs.unlinkSync(mutantPath); } catch (cleanupError) {}
}
var mutantOutput = String(mutantRun && mutantRun.stdout || '') + String(mutantRun && mutantRun.stderr || '');
ok(mutantRun && mutantRun.status !== 0 && mutantOutput.indexOf('FAIL R2') >= 0,
  'M20 未授权第四个 target hash 由既有 dogfood 真检查器拒绝', 'status=' + (mutantRun && mutantRun.status));

console.log('puzzle-experience: ' + pass + ' 通过, ' + fail + ' 失败 [' + ACTIVE_PHASE + ']');
process.exit(fail ? 1 : 0);
