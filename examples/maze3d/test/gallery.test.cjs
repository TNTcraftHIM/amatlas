'use strict';
/* Visual Gallery inventory：Node 无 DOM 加载、协调 recipe/FPS family 与复制单源。 */
var path = require('path');
var GALLERY = require(path.join(__dirname, '..', 'gallery.js'));
var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  X  ' + msg); } }
function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

console.log('── maze3d Visual Gallery inventory ──');
var groups = GALLERY.groups, specs = GALLERY.specs;
var recipes = specs.filter(function (s) { return s.group === 'recipes'; });
var combat = specs.filter(function (s) { return s.group === 'combat'; });
ok(Array.isArray(groups) && groups.length === 10 && groups.some(function (g) { return g.id === 'recipes'; }) && groups.some(function (g) { return g.id === 'combat'; }), 'G1 inventory有10分区并纳入recipes/combat');
var atoms = specs.filter(function (s) { return s.group !== 'recipes' && s.group !== 'combat'; });
ok(atoms.length === 92 && specs.length === 103 && recipes.length === 6 && combat.length === 5, 'G2 原子92、recipe6、combat5，总计103张');
ok(recipes.map(function (s) { return s.name; }).join('|') === 'dungeon ritual hall|flesh nest corridor|industrial checkpoint|crystal observatory|ice resource fork|submarine maintenance hatch', 'G3 六个冻结协调recipe齐全且顺序稳定');
var allowedRecipe = { grid: 1, start: 1, theme: 1, wallTex: 1, floorTex: 1, ceilTex: 1, decorDensity: 1, maxDecor: 1, wallDecorDensity: 1, maxWallDecor: 1, decor: 1, wallDecor: 1, exitStyle: 1, pillars: 1, pillarStyle: 1, flatWalls: 1 };
ok(recipes.every(function (s) { return Object.keys(s.maze).every(function (k) { return allowedRecipe[k]; }) && s.maze.theme && s.maze.wallTex && s.maze.floorTex && s.maze.ceilTex && (s.maze.decor || s.maze.wallDecor) && (s.maze.exitStyle || s.maze.pillars); }), 'G4 recipe只组合现役主题/材质/密度/显式装饰/出口柱子字段');
ok(combat.map(function (s) { return s.family + ':' + s.maze.theme; }).join('|') === 'ordnance:industrial|relic:dungeon|organic:flesh|energy:neon|energy:crystal', 'G5 四行为family加crystal特化卡映射稳定');
ok(combat.every(function (s) {
  var c = s.maze.combat;
  return Object.keys(c).sort().join(',') === 'deathKey,equipped,guard,loadout,player' &&
    Object.keys(c.player).sort().join(',') === 'health,maxHealth' && c.loadout.length === 1 && c.loadout[0].kind === 'precision' && c.equipped === 'precision' &&
    Object.keys(c.guard).sort().join(',') === 'ai,hitRadius,hp,x,y' && Object.keys(c.guard.ai).sort().join(',') === 'attackRange,cooldown,damage,hear,moveSpeed,sight,windup' &&
    c.guard.x === 7 && c.guard.y === 2 && s.maze.start.dir === 'E';
}), 'G6 combatPreviewMaze只用最小闭合combat schema并固定正前方单guard');
ok(specs.every(function (s) { return !hasOwn(s, 'code') && !hasOwn(s.maze, 'presentation') && !hasOwn(s.maze, 'skin') && !hasOwn(s.maze, 'weaponArt') && !hasOwn(s.maze, 'crosshair') && !hasOwn(s.maze, 'sfx'); }), 'G7 inventory无手写code真相或伪造表现字段');
var code = GALLERY.serializeMaze(recipes[0].maze), combatCode = GALLERY.cardCode(combat[0]);
ok(code === JSON.stringify(recipes[0].maze, null, 2) && GALLERY.cardCode(recipes[0]) === code && code.indexOf('"theme": "dungeon"') >= 0 && combatCode.indexOf('"theme": "industrial"') >= 0 && combatCode.indexOf('Recipe 5') >= 0 && combatCode.indexOf('"combat"') < 0 && combatCode.indexOf('galleryCombatDeath') < 0, 'G8 recipe复制完整spec.maze；combat只复制theme并路由Recipe 5');
ok(recipes.every(function (s) {
  var d = s.maze.wallDecor && s.maze.wallDecor[0], offset = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[d && d.face];
  return d && s.maze.grid[d.y][d.x] === '#' && offset && s.maze.grid[d.y + offset[1]][d.x + offset[0]] === '.';
}), 'G9 六recipe显式墙饰都贴#墙且朝向开放地板，不被真实runtime跳过');
var a = GALLERY.combatPreviewMaze('industrial'), b = GALLERY.combatPreviewMaze('crystal'); a.combat.player.health = 1;
ok(b.theme === 'crystal' && b.combat.player.health === 40, 'G10 combatPreviewMaze每次深分离且只换theme');

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
