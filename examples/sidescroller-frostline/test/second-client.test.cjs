'use strict';
/* 第二客户只消费冻结的 sidescroller 私有 runtime：锁独立数据、闭引用与固定 tick。 */
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..');
var RUNTIME = path.join(ROOT, '..', 'sidescroller', 'sidescroller-module.js');
var FROZEN_RUNTIME_SHA256 = 'a85ef8afe136b3c32caa125f4fd0656d1c51bd5d35782570ac375ac93128f33d';
var SIDE = require(RUNTIME);
var FIRST_WORLD = require(path.join(ROOT, '..', 'sidescroller', 'world.js'));
var WORLD = require(path.join(ROOT, 'world.js'));
var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  X  ' + msg); } }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function spec() { return clone(WORLD.maps.frostline.nodes.slope.sidescroller); }

console.log('── sidescroller 第二客户 ──');
var node = WORLD.maps.frostline.nodes.slope;
var firstSpec = FIRST_WORLD.maps.coast.nodes.run.sidescroller;
var plan = SIDE.compileLevel(spec(), 'sidescroller ?frostline/slope');
SIDE.validateClearLink(plan, node, 'sidescroller ?frostline/slope');
ok(WORLD.id === '8b45b7fd-0644-4818-8bb4-066feae290b0' && WORLD.start.map === 'frostline', 'C1 第二客户有独立 UUID 与 map');
ok(plan.width > plan.viewport.w && node.sidescroller.map.rows.join('\n') !== firstSpec.map.rows.join('\n') && node.sidescroller.map.rows[0].length !== firstSpec.map.rows[0].length && node.sidescroller.player.health !== firstSpec.player.health && node.sidescroller.player.run !== firstSpec.player.run && node.sidescroller.player.jump !== firstSpec.player.jump && plan.sentry.id === 'relay-warden', 'C2 不同地图宽度/平台布局与玩家参数经同一 compiler 形成冻结计划');
ok(plan.player.weapon.damage === 2 && node.sidescroller.player.weapon.cooldownTicks !== firstSpec.player.weapon.cooldownTicks && plan.sentry.health === 4 && node.sidescroller.sentry.fireEveryTicks !== firstSpec.sentry.fireEveryTicks && node.sidescroller.sentry.projectileSpeed !== firstSpec.sentry.projectileSpeed && plan.clear.exposeLink === 'ascend', 'C3 不同武器/目标时序参数与clear id保持双引用闭合');
ok(node.links.some(function (link) { return link.id === 'retreat' && link.to === 'relay' && !link.once && !link.requires; }), 'C4 始终存在无条件撤退出口');

function trace(frameMs) {
  var sim = SIDE.createSimulation(plan);
  var drive = SIDE.createFixedDriver(plan, sim);
  var now = 0;
  function inputAtTick(tick) { return { right: true, jumpPressed: tick === 22 }; }
  drive.frame(now, inputAtTick);
  while (now < 2600) { now = Math.min(2600, now + frameMs); drive.frame(now, inputAtTick); }
  return SIDE.simulationSnapshot(sim);
}
var t30 = trace(1000 / 30), t60 = trace(1000 / 60), t144 = trace(1000 / 144);
ok(JSON.stringify(t30) === JSON.stringify(t60) && JSON.stringify(t60) === JSON.stringify(t144), 'C5 30/60/144Hz 第二地图同 trace 终态一致');
ok(t60.tick === 156 && t60.x > plan.player.spawnXQ && t60.cameraX > 0, 'C6 第二地图真实跑跳并推进相机');

var indexSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
var worldSource = fs.readFileSync(path.join(ROOT, 'world.js'), 'utf8');
ok(/\.\.\/sidescroller\/sidescroller-module\.js/.test(indexSource) && /src="game\.js"/.test(indexSource), 'C7 第二客户直接引用冻结 runtime 并使用自己的薄启动胶水');
ok(!fs.existsSync(path.join(ROOT, 'sidescroller-module.js')) && fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8').indexOf('createSidescrollerModule()') >= 0, 'C8 第二客户目录没有 runtime 副本或玩法分支');
ok(worldSource.indexOf('gate-sentry') < 0 && worldSource.indexOf("'continue'") < 0 && worldSource.indexOf('海堤') < 0, 'C9 第二客户不沿用首作 ID 与题材文案');
ok(Object.keys(node.sidescroller).sort().join(',') === 'clear,map,player,sentry,viewport', 'C10 第二客户没有新增作者字段或 callback 逃生口');
var runtimeSha = require('crypto').createHash('sha256').update(fs.readFileSync(RUNTIME)).digest('hex');
ok(runtimeSha === FROZEN_RUNTIME_SHA256, 'C11 第二客户实现后 runtime 仍是 Step 0 冻结字节');

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
