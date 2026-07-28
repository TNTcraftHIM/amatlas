'use strict';
/* Origin 综合 dogfood 接缝回归：只锁公开作者数据、装配顺序和镜像，不读取 maze3d runtime 私有会话。 */
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..');
var WORLD_PATH = path.join(ROOT, 'world.js');
var INDEX_PATH = path.join(ROOT, 'index.html');
var ORIGIN_MAZE = path.join(ROOT, 'raycast-maze.js');
var REFERENCE_MAZE = path.join(ROOT, '..', 'maze3d', 'raycast-maze.js');
var CORE_PATH = path.join(ROOT, '..', '..', 'core', 'runtime', 'engine-core.js');
var CUTSCENE_PATH = path.join(ROOT, '..', '..', 'modules', 'cutscene', 'runtime', 'cutscene.js');
var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' -> ' + detail : '')); }
}
function freshWorld() {
  delete require.cache[require.resolve(WORLD_PATH)];
  return require(WORLD_PATH);
}
function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj || {}, key); }
function keys(obj) { return Object.keys(obj || {}).sort().join(','); }
function startCutscene(world, nodeId) {
  var scoped = {
    id: world.id,
    start: { map: 'atlas', node: nodeId },
    initState: world.initState,
    maps: { atlas: { name: world.maps.atlas.name, nodes: {} } }
  };
  scoped.maps.atlas.nodes[nodeId] = world.maps.atlas.nodes[nodeId];
  var engine = require(CORE_PATH).createEngine(scoped, { storage: null });
  engine.use(require(CUTSCENE_PATH).createCutsceneModule());
  engine.start();
  return engine.view();
}

function inspect(world, html, originMaze, referenceMaze) {
  var errors = [];
  var nodes = world && world.maps && world.maps.atlas && world.maps.atlas.nodes;
  if (!nodes) return ['world.nodes'];
  var cutsceneAt = html.indexOf('../../modules/cutscene/runtime/cutscene.js');
  var domAt = html.indexOf('../../presenters/present-dom.js');
  var timelineAt = html.indexOf('../../presenters/present-timeline.js');
  var svgAt = html.indexOf('../../presenters/present-svg.js');
  if (!(cutsceneAt >= 0 && cutsceneAt < domAt && domAt < timelineAt && timelineAt < svgAt)) errors.push('timeline-order');
  if (!/<div id="scene"><\/div>/.test(html)) errors.push('scene-root');

  var loomLinks = nodes.loom && nodes.loom.links || [];
  var loomTargets = loomLinks.map(function (link) { return link.to; });
  var seedIds = loomTargets.filter(function (id) { return /^seed_dialogue(?:_|$)/.test(id || ''); });
  var expectedRoutes = {
    shape_sea: { to: 'seed_dialogue', shape: '潮汐会记住每一次选择' },
    shape_city: { to: 'seed_dialogue_city', shape: '每扇门都通向一个真实的选择' },
    shape_path: { to: 'seed_dialogue_path', shape: '失败改变处境，但不终止故事' }
  };
  if (seedIds.length !== 3 || new Set(loomTargets).size !== 3 || loomTargets.indexOf('first_world') >= 0) errors.push('loom-seed-routes');
  loomLinks.forEach(function (link) {
    var expected = expectedRoutes[link.id];
    var state = { insight: 0, worldShape: '', flags: {} };
    if (!expected || link.to !== expected.to || typeof link.run !== 'function') errors.push('loom-route-' + (link.id || '?'));
    else {
      link.run(state);
      if (state.worldShape !== expected.shape) errors.push('loom-shape-' + link.id);
    }
  });
  Object.keys(expectedRoutes).map(function (id) { return expectedRoutes[id].to; }).forEach(function (id) {
    var node = nodes[id], beats = node && node.beats || [];
    var hasMotion = beats.some(function (beat) { return !!beat.motion; });
    var hasCast = beats.some(function (beat) { return Array.isArray(beat.cast) && beat.cast.length > 0; });
    var hasSpeaker = beats.some(function (beat) { return typeof beat.speaker === 'string' && beat.speaker; });
    var hasTypewriter = beats.some(function (beat) { return beat.text && beat.text.mode === 'typewriter'; });
    var hasEnter = beats.some(function (beat) { return (beat.cast || []).some(function (member) { return member.stage && member.stage.enter; }); });
    var hasExit = beats.some(function (beat) { return (beat.cast || []).some(function (member) { return member.stage && member.stage.exit; }); });
    var trialLink = node && node.links && node.links.some(function (link) { return link.to === 'first_world_trial'; });
    if (!(node && node.kind === 'cutscene' && beats.length <= 5 && hasMotion && hasCast && hasSpeaker && hasTypewriter && hasEnter && hasExit && trialLink))
      errors.push('rich-' + id);
  });

  ['seed_dialogue', 'seed_dialogue_city', 'seed_dialogue_path', 'first_world'].forEach(function (id) {
    try {
      var snapshot = startCutscene(world, id);
      var playback = snapshot && snapshot.view && snapshot.view.cutscenePlayback;
      if (!snapshot || !snapshot.pos || snapshot.pos.node !== id || snapshot.nodeKind !== 'cutscene' ||
          !playback || playback.key !== 'atlas/' + id + '#0' || !snapshot.actions.some(function (action) { return action.id === 'cutscene:next'; }))
        errors.push('runtime-view-' + id);
    } catch (error) {
      errors.push('runtime-parse-' + id);
    }
  });

  var init = world.initState || {};
  if (init.firstWorldTrialWon !== false || init.firstWorldTrialDeath !== false) errors.push('trial-init');
  var trial = nodes.first_world_trial;
  var combat = trial && trial.maze && trial.maze.combat;
  if (!(trial && trial.kind === 'maze3d' && trial.winKey === 'firstWorldTrialWon' && combat && combat.deathKey === 'firstWorldTrialDeath'))
    errors.push('trial-keys');
  if (keys(combat) !== 'deathKey,equipped,exitRequires,guard,loadout,pickups,player' || combat.exitRequires !== 'clear' || own(combat, 'pistol') || own(combat, 'supplies') || own(combat, 'weapons') || own(combat, 'monsters'))
    errors.push('combat-v3');
  if (keys(combat && combat.player) !== 'health,maxHealth' || !Array.isArray(combat && combat.loadout) || combat.loadout.length !== 1 ||
      keys(combat.loadout[0]) !== 'ammo,kind,maxAmmo' || combat.loadout[0].kind !== 'precision' || combat.loadout[0].ammo !== 2 || combat.loadout[0].maxAmmo !== 6 || combat.equipped !== 'precision')
    errors.push('combat-player-loadout');
  var pickups = combat && combat.pickups || [], weaponPickup = pickups[0], ammoPickup = pickups[1], healthPickup = pickups[2];
  if (!combat || !combat.guard || combat.guard.hp !== 60 || own(combat.guard, 'face') || combat.guard.ai.sight !== 0 || combat.guard.ai.hear !== 8 || pickups.length !== 3 ||
      !weaponPickup || keys(weaponPickup) !== 'ammo,kind,maxAmmo,weapon,x,y' || weaponPickup.kind !== 'weapon' || weaponPickup.weapon !== 'scatter' || weaponPickup.ammo !== 1 || weaponPickup.maxAmmo !== 4 ||
      !ammoPickup || keys(ammoPickup) !== 'amount,kind,weapon,x,y' || ammoPickup.kind !== 'ammo' || ammoPickup.weapon !== 'precision' || ammoPickup.amount !== 3 ||
      !healthPickup || keys(healthPickup) !== 'amount,kind,x,y' || healthPickup.kind !== 'health' || healthPickup.amount !== 20 || pickups.some(function (pickup) { return own(pickup, 'id'); }))
    errors.push('combat-balance');
  var trialMaze = trial && trial.maze || {}, trialAudio = trial && trial.audio || {};
  var hasTrialPillars = trialMaze.pillarStyle === 'crystal' && Array.isArray(trialMaze.pillars) && trialMaze.pillars.length >= 2;
  var hasTrialSigil = Array.isArray(trialMaze.wallDecor) && trialMaze.wallDecor.some(function (decor) { return decor && decor.kind === 'sigil'; });
  var hasTrialRitual = Array.isArray(trialMaze.decor) && trialMaze.decor.some(function (decor) { return decor && decor.icon === 'ritual_marks'; });
  if (!(trialMaze.theme === 'crystal' && trialMaze.wallTex === 'crystal' && trialMaze.floorTex === 'panel' && trialMaze.ceilTex === 'beam' && trialMaze.exitStyle === 'portal' &&
      hasTrialPillars && hasTrialSigil && hasTrialRitual && trialAudio.music && trialAudio.music.preset === 'tense'))
    errors.push('trial-crystal-space');
  var corridor = nodes.unlit_corridor;
  if (!(corridor && corridor.audio && corridor.audio.music && corridor.audio.music.preset === 'sacral')) errors.push('corridor-sacral');
  var trialCopy = [trial && trial.title, trial && trial.look, trial && trial.wonText].concat((trial && trial.links || []).map(function (link) { return link.label; })).join(' | ');
  if (/精确武器|散射武器|手枪|骷髅|守卫|敌人|开火/.test(trialCopy) || !/星图刻针/.test(trialCopy) || !/星环共振器/.test(trialCopy) || !/未定噪声/.test(trialCopy))
    errors.push('trial-crystal-copy');

  var directRetry = trial && trial.links && trial.links.filter(function (link) { return link.to === 'first_world_trial' && /重试/.test(link.label || ''); })[0];
  var fallLink = trial && trial.links && trial.links.filter(function (link) { return link.to === 'first_world_fall'; })[0];
  var winLink = trial && trial.links && trial.links.filter(function (link) { return link.to === 'first_world'; })[0];
  var fallRetry = nodes.first_world_fall && nodes.first_world_fall.links && nodes.first_world_fall.links.filter(function (link) { return link.to === 'first_world_trial'; })[0];
  if (!(directRetry && directRetry.requires && fallLink && fallLink.requires && winLink && winLink.requires && fallRetry && fallRetry.run))
    errors.push('trial-links');
  [directRetry, fallRetry].forEach(function (link, index) {
    var state = { firstWorldTrialWon: true, firstWorldTrialDeath: true };
    if (link && typeof link.run === 'function') link.run(state);
    if (state.firstWorldTrialWon !== false || state.firstWorldTrialDeath !== false) errors.push('retry-clears-' + index);
  });
  if (trial && trial.links && trial.links.some(function (link) { return link.to === 'first_world' && typeof link.requires !== 'function'; }))
    errors.push('trial-bypass');
  if (!(nodes.first_world && (nodes.first_world.beats || []).some(function (beat) { return !!beat.motion; }))) errors.push('final-motion');
  if (!Buffer.from(originMaze).equals(Buffer.from(referenceMaze))) errors.push('maze-mirror');
  return errors;
}

console.log('Origin 综合能力接缝验证');
var html = fs.readFileSync(INDEX_PATH, 'utf8');
var mazeA = fs.readFileSync(ORIGIN_MAZE);
var mazeB = fs.readFileSync(REFERENCE_MAZE);
var baseline = inspect(freshWorld(), html, mazeA, mazeB);
ok('O1 Origin timeline/rich cutscene/FPS v3/双端重试/终章 motion/镜像全部闭合', baseline.length === 0, baseline.join(','));

var themeWorld = freshWorld();
var themeNodes = themeWorld.maps.atlas.nodes;
var themeTrial = themeNodes.first_world_trial;
var themeMaze = themeTrial.maze;
var themeCopy = [themeTrial.title, themeTrial.look, themeTrial.wonText].concat(themeTrial.links.map(function (link) { return link.label; })).join(' | ');
ok('O1a Origin trial 用 crystal panel/beam/portal/pillars/sigil/ritual_marks 与 tense BGM',
  themeMaze.theme === 'crystal' && themeMaze.wallTex === 'crystal' && themeMaze.floorTex === 'panel' && themeMaze.ceilTex === 'beam' && themeMaze.exitStyle === 'portal' &&
  themeMaze.pillarStyle === 'crystal' && Array.isArray(themeMaze.pillars) && themeMaze.pillars.length >= 2 &&
  Array.isArray(themeMaze.wallDecor) && themeMaze.wallDecor.some(function (decor) { return decor.kind === 'sigil'; }) &&
  Array.isArray(themeMaze.decor) && themeMaze.decor.some(function (decor) { return decor.icon === 'ritual_marks'; }) &&
  themeTrial.audio && themeTrial.audio.music && themeTrial.audio.music.preset === 'tense',
  JSON.stringify({ wallTex: themeMaze.wallTex, floorTex: themeMaze.floorTex, ceilTex: themeMaze.ceilTex, exitStyle: themeMaze.exitStyle, pillarStyle: themeMaze.pillarStyle, pillars: themeMaze.pillars, wallDecor: themeMaze.wallDecor, decor: themeMaze.decor, audio: themeTrial.audio }));
ok('O1b Origin 回廊保持 sacral BGM，trial 文案只读成星图刻针/星环共振器/未定噪声',
  themeNodes.unlit_corridor.audio && themeNodes.unlit_corridor.audio.music && themeNodes.unlit_corridor.audio.music.preset === 'sacral' &&
  /星图刻针/.test(themeCopy) && /星环共振器/.test(themeCopy) && /未定噪声/.test(themeCopy) && !/精确武器|散射武器|手枪|骷髅|守卫|敌人|开火/.test(themeCopy),
  themeCopy);

var noTimeline = inspect(freshWorld(), html.replace(/\s*<script src="\.\.\/\.\.\/presenters\/present-timeline\.js"><\/script>/, ''), mazeA, mazeB);
ok('M1 反向删除 timeline script 精确转红', noTimeline.indexOf('timeline-order') >= 0, noTimeline.join(','));

var noSpeakerWorld = freshWorld();
var seedNode = noSpeakerWorld.maps.atlas.nodes.seed_dialogue;
if (seedNode && seedNode.beats && seedNode.beats[2]) delete seedNode.beats[2].speaker;
var noSpeaker = seedNode ? inspect(noSpeakerWorld, html, mazeA, mazeB) : [];
ok('M2 反向删除 seed speaker 精确转红', noSpeaker.indexOf('rich-seed_dialogue') >= 0, noSpeaker.join(','));

var oneEndedWorld = freshWorld();
var trialNode = oneEndedWorld.maps.atlas.nodes.first_world_trial;
var retry = trialNode && trialNode.links.filter(function (link) { return link.to === 'first_world_trial'; })[0];
if (retry) retry.run = function (state) { state.firstWorldTrialDeath = false; };
var oneEnded = retry ? inspect(oneEndedWorld, html, mazeA, mazeB) : [];
ok('M3 反向把同节点重试改成只清 death 精确转红', oneEnded.indexOf('retry-clears-0') >= 0, oneEnded.join(','));

var legacyWorld = freshWorld();
var legacyTrial = legacyWorld.maps.atlas.nodes.first_world_trial;
if (legacyTrial) legacyTrial.maze.combat.weapons = [];
var legacy = legacyTrial ? inspect(legacyWorld, html, mazeA, mazeB) : [];
ok('M4 反向塞回旧 weapons 容器精确转红', legacy.indexOf('combat-v3') >= 0, legacy.join(','));

var badMouthWorld = freshWorld();
var speakingBeat = badMouthWorld.maps.atlas.nodes.seed_dialogue.beats[2];
var mouthKeys = speakingBeat.cast[0].rig.variants.filter(function (variant) { return variant.target === 'mouth'; })[0].keys;
mouthKeys[mouthKeys.length - 1].at = speakingBeat.dur - 0.001;
var badMouth = inspect(badMouthWorld, html, mazeA, mazeB);
ok('M5 反向让 mouth 最后 key 偏离 beat.dur 时真实 runtime parser 精确转红', badMouth.indexOf('runtime-parse-seed_dialogue') >= 0, badMouth.join(','));

var duplicateRouteWorld = freshWorld();
duplicateRouteWorld.maps.atlas.nodes.loom.links[1].to = duplicateRouteWorld.maps.atlas.nodes.loom.links[0].to;
var duplicateRoute = inspect(duplicateRouteWorld, html, mazeA, mazeB);
ok('M6 反向把两个 loom 分支指向同一 seed target 精确转红', duplicateRoute.indexOf('loom-seed-routes') >= 0, duplicateRoute.join(','));

var drift = Buffer.concat([mazeA, Buffer.from('\n// drift')]);
var mirror = inspect(freshWorld(), html, drift, mazeB);
ok('M7 反向制造 Origin runtime 单字节漂移精确转红', mirror.indexOf('maze-mirror') >= 0, mirror.join(','));

var plainTrialWorld = freshWorld();
delete plainTrialWorld.maps.atlas.nodes.first_world_trial.maze.wallTex;
var plainTrial = inspect(plainTrialWorld, html, mazeA, mazeB);
ok('M8 反向删除 trial crystal wallTex 精确转红', plainTrial.indexOf('trial-crystal-space') >= 0, plainTrial.join(','));

var shaA = crypto.createHash('sha256').update(mazeA).digest('hex');
var shaB = crypto.createHash('sha256').update(mazeB).digest('hex');
ok('O2 两份 maze runtime SHA256 一致', shaA === shaB, shaA.slice(0, 12) + ' / ' + shaB.slice(0, 12));

console.log('origin: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
