'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Authoring = require('../authoring/compile-performance.js');
var Timeline = require('../../../presenters/present-timeline.js');
var Cutscene = require('../runtime/cutscene.js');

var pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; }
  catch (error) { fail++; console.error('  X  ' + name + '\n     ' + (error && error.stack || error)); }
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function part(id, parent, rest) {
  return {
    id: id,
    parent: parent,
    art: 'ship',
    pivot: { x: 0, y: 0 },
    rest: Object.assign({ x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 }, rest || {})
  };
}
function staticRig() {
  return {
    parts: [
      part('torso', null, { x: 104, y: 108 }),
      part('leg_l', 'torso', { x: -7, y: 14, rotate: 2 }),
      part('leg_r', 'torso', { x: 7, y: 14, rotate: -2 }),
      part('arm_l_upper', 'torso', { x: -13, y: -14, rotate: 12 }),
      part('arm_l_fore', 'arm_l_upper', { y: 20, rotate: -4 }),
      part('hand_l', 'arm_l_fore', { y: 18 }),
      part('arm_r_upper', 'torso', { x: 13, y: -14, rotate: -12 }),
      part('arm_r_fore', 'arm_r_upper', { y: 20, rotate: 4 }),
      part('hand_r', 'arm_r_fore', { y: 18 }),
      part('eyes', 'torso', { y: -30 })
    ],
    drawOrder: ['leg_l', 'leg_r', 'arm_l_upper', 'arm_l_fore', 'hand_l', 'torso', 'eyes',
      'arm_r_upper', 'arm_r_fore', 'hand_r'],
    tracks: [],
    variants: [],
    secondary: [
      { type: 'blink', target: 'eyes', property: 'scaleY', closedValue: 0.08,
        windowMs: 1800, durationMs: 100, chance: 0.65, seed: 324508639 }
    ]
  };
}
function profile() {
  return {
    kind: 'cutout-biped-v1',
    authoredFacing: 'right',
    root: 'torso',
    legs: { left: 'leg_l', right: 'leg_r' },
    arms: {
      left: { upper: 'arm_l_upper', fore: 'arm_l_fore', hand: 'hand_l' },
      right: { upper: 'arm_r_upper', fore: 'arm_r_fore', hand: 'hand_r' }
    }
  };
}
function phase2Rig() {
  var rig = staticRig();
  rig.parts.push(part('head', 'torso', { y: -28 }));
  rig.parts.push(part('mouth', 'head', { y: 6 }));
  rig.drawOrder.push('head', 'mouth');
  rig.variants.push({
    target: 'mouth',
    base: 'rest',
    states: [{ id: 'A', art: 'ship' }, { id: 'O', art: 'ship' }],
    keys: []
  });
  return rig;
}
function phase2Profile(authoredFacing) {
  var value = profile();
  value.authoredFacing = authoredFacing || 'right';
  value.head = 'head';
  value.mouth = 'mouth';
  return value;
}
function phase2Spec(sequence, run) {
  var spec = goldenSpec(run || function () {});
  spec.actors[0].rig = phase2Rig();
  spec.actors[0].profile = phase2Profile();
  spec.anchors.push({ id: 'back', x: 40, y: 108, facing: 'left', capacity: 0 });
  spec.shots[0].sequence = sequence;
  return spec;
}
function goldenSpec(run) {
  return {
    version: 1,
    actors: [{ id: 'warden', rig: staticRig(), profile: profile() }],
    anchors: [
      { id: 'start', x: 104, y: 108, facing: 'right' },
      { id: 'mark', x: 160, y: 108, facing: 'right' },
      { id: 'focus', x: 240, y: 72, capacity: 0 }
    ],
    shots: [{
      id: 'walk_and_point',
      cast: [{ actor: 'warden', at: 'start' }],
      sequence: [
        { do: 'walkTo', actor: 'warden', to: 'mark', dur: 2.8 },
        { do: 'pointAt', actor: 'warden', target: 'focus', hand: 'right', dur: 0.55 },
        { do: 'wait', dur: 0.85 }
      ],
      scene: { region: 'coast', elements: [{ kind: 'mist', opacity: 0.3 }] },
      audio: { music: 'calm' },
      run: run
    }]
  };
}
function track(plan, target, property) {
  for (var i = 0; i < plan.tracks.length; i++) {
    if (plan.tracks[i].target === target && plan.tracks[i].property === property) return plan.tracks[i];
  }
  return null;
}
function variant(plan, target) {
  for (var i = 0; i < plan.variants.length; i++) {
    if (plan.variants[i].target === target) return plan.variants[i];
  }
  return null;
}
function recursivelyFrozen(value, seen) {
  if (!value || typeof value === 'function' || typeof value !== 'object') return true;
  seen = seen || [];
  if (seen.indexOf(value) >= 0) return true;
  seen.push(value);
  return Object.isFrozen(value) && Object.keys(value).every(function (key) {
    return recursivelyFrozen(value[key], seen);
  });
}
function expectPerf(spec, code, expectedPath, label, options) {
  var error = null;
  try { Authoring.compilePerformance(spec, options); }
  catch (caught) { error = caught; }
  assert(error, label + ': expected an error');
  assert.strictEqual(error.code, code, label + ': code');
  assert.strictEqual(error.path, expectedPath, label + ': path; message=' + error.message);
  assert(error.message.indexOf('[' + code + ']') === 0, label + ': message starts with stable code');
  return error;
}

test('UMD/CommonJS export is the closed CutsceneAuthoring API and load order fails loud', function () {
  assert.deepStrictEqual(Object.keys(Authoring), ['compilePerformance']);
  var compilerPath = path.join(__dirname, '..', 'authoring', 'compile-performance.js');
  var timelinePath = path.join(__dirname, '..', '..', '..', 'presenters', 'present-timeline.js');
  var compilerSource = fs.readFileSync(compilerPath, 'utf8');
  assert.throws(function () { vm.runInNewContext(compilerSource, {}); }, /present-timeline\.js -> compile-performance\.js -> world\.js/);
  var context = {};
  vm.runInNewContext(fs.readFileSync(timelinePath, 'utf8'), context);
  vm.runInNewContext(compilerSource, context);
  assert.strictEqual(typeof context.Amatlas.CutsceneAuthoring.compilePerformance, 'function');
});

test('golden lowers 56px/4-step walk then right point with deterministic ms samples', function () {
  var runCount = 0;
  var run = function () { runCount++; };
  var spec = goldenSpec(run);
  var before = JSON.stringify(spec);
  var first = Authoring.compilePerformance(spec, { path: 'world.maps.coast.nodes.turning.performance' });
  var second = Authoring.compilePerformance(spec, { path: 'world.maps.coast.nodes.turning.performance' });
  assert.deepStrictEqual(first, second);
  assert.strictEqual(JSON.stringify(spec), before);
  assert.strictEqual(runCount, 0);
  assert.strictEqual(first.beats[0].run, run);
  assert.strictEqual(Object.isFrozen(run), false);
  assert(recursivelyFrozen(first.beats));
  assert(recursivelyFrozen(first.trace));
  assert.notStrictEqual(first.beats[0].scene, spec.shots[0].scene);
  assert.notStrictEqual(first.beats[0].scene.elements, spec.shots[0].scene.elements);

  var beat = first.beats[0];
  assert.strictEqual(beat.dur, 4.2);
  assert.deepStrictEqual(beat.cast.map(function (member) { return member.id; }), ['warden']);
  assert.strictEqual(beat.cast[0].stage.facing, 'as-authored');
  var plan = Timeline.normalizeCastPlan(beat.cast, {
    path: 'world.maps.coast.nodes.turning.performance.shots[0].cast', durationMs: 4200
  })[0].rig;
  var rootX = track(plan, 'torso', 'x');
  var rootY = track(plan, 'torso', 'y');
  var legLeft = track(plan, 'leg_l', 'rotate');
  var upperRight = track(plan, 'arm_r_upper', 'rotate');
  var foreRight = track(plan, 'arm_r_fore', 'rotate');
  var handRight = track(plan, 'hand_r', 'rotate');
  assert.strictEqual(Timeline.sampleTrack(rootX, 700), 118);
  assert.strictEqual(Timeline.sampleTrack(rootX, 2800), 160);
  assert.strictEqual(Timeline.sampleTrack(rootX, 4200), 160);
  assert.strictEqual(Timeline.sampleTrack(rootY, 350), 106);
  assert.strictEqual(Timeline.sampleTrack(rootY, 700), 108);
  assert.strictEqual(Timeline.sampleTrack(legLeft, 350), -20);
  assert.strictEqual(Timeline.sampleTrack(legLeft, 1050), 20);
  assert.strictEqual(Timeline.sampleTrack(legLeft, 2800), 2);
  assert.strictEqual(Timeline.sampleTrack(upperRight, 2800), -12);
  assert.strictEqual(Timeline.sampleTrack(upperRight, 3350), -96);
  assert.strictEqual(Timeline.sampleTrack(upperRight, 4200), -96);
  assert.strictEqual(Timeline.sampleTrack(foreRight, 3350), 4);
  assert.strictEqual(Timeline.sampleTrack(handRight, 3350), -8);

  var traceShot = first.trace.shots[0];
  assert.strictEqual(traceShot.durationMs, 4200);
  assert.deepStrictEqual(traceShot.actions.map(function (action) {
    return [action.do, action.startMs, action.endMs];
  }), [['walkTo', 0, 2800], ['pointAt', 2800, 3350], ['wait', 3350, 4200]]);
  assert.deepStrictEqual(traceShot.actions[0].defaults,
    [{ field: 'steps', value: 4, source: 'distance-14px-v1' }]);
  assert.deepStrictEqual(traceShot.actions[0].resources, [
    'actor:warden.root', 'actor:warden.locomotion', 'actor:warden.leg.left',
    'actor:warden.leg.right', 'actor:warden.arm.left', 'actor:warden.arm.right'
  ]);
  assert.deepStrictEqual(traceShot.slots, [
    { anchor: 'mark', actor: 'warden', startMs: 0, endMs: 2800, phase: 'reserved' },
    { anchor: 'mark', actor: 'warden', startMs: 2800, endMs: 4200, phase: 'occupied' }
  ]);

  var view = Cutscene.createCutsceneModule().render({}, {
    id: 'compiled', kind: 'cutscene', title: 'compiled', beats: first.beats, links: []
  });
  assert.strictEqual(view.cutscenePlayback.durationMs, 4200);
  assert.strictEqual(view.cutscenePlayback.cast[0].id, 'warden');
});

test('explicit steps, delayed walk hold key, mirror facing and source order remain stable', function () {
  var spec = goldenSpec(function () {});
  spec.actors[0].profile.authoredFacing = 'left';
  spec.shots[0].cast[0].facing = 'right';
  spec.shots[0].sequence = [
    { do: 'wait', dur: 0.2 },
    { do: 'walkTo', actor: 'warden', to: 'mark', dur: 0.8, steps: 2 },
    { do: 'wait', dur: 0.1 }
  ];
  var out = Authoring.compilePerformance(spec);
  assert.strictEqual(out.beats[0].cast[0].stage.facing, 'mirror-x');
  assert.deepStrictEqual(out.trace.shots[0].actions[1].defaults, []);
  var sourceTrack = out.beats[0].cast[0].rig.tracks.filter(function (item) {
    return item.target === 'torso' && item.property === 'x';
  })[0];
  assert.deepStrictEqual(sourceTrack.keys.slice(0, 2).map(function (key) { return [key.at, key.value]; }),
    [[0.2, 104], [0.6, 132]]);
});

test('Phase 2 stage actions and authored-local look/point lower through the active cast plan', function () {
  var spec = phase2Spec([
    { do: 'enter', actor: 'warden', from: 'left', dur: 0.4 },
    { parallel: [
      { do: 'lookAt', actor: 'warden', target: 'focus', dur: 0.3 },
      { do: 'pointAt', actor: 'warden', target: 'focus', hand: 'right', dur: 0.3 }
    ] },
    { do: 'wait', dur: 0.2 },
    { do: 'exit', actor: 'warden', to: 'right', dur: 0.5 }
  ]);
  var out = Authoring.compilePerformance(spec);
  var beat = out.beats[0];
  assert.deepStrictEqual(beat.cast[0].stage, {
    facing: 'as-authored',
    enter: { offset: { x: -320, y: 0 }, dur: 0.4, ease: 'ease-out' },
    exit: { offset: { x: 320, y: 0 }, dur: 0.5, ease: 'ease-in' }
  });
  var plan = Timeline.normalizeCastPlan(beat.cast, {
    path: 'performance.shots[0].cast', durationMs: 1400
  })[0];
  assert.strictEqual(plan.stage.enter.durationMs, 400);
  assert.strictEqual(plan.stage.exit.startMs, 900);
  assert.strictEqual(Timeline.sampleTrack(track(plan.rig, 'head', 'rotate'), 700), -8);
  assert.strictEqual(Timeline.sampleTrack(track(plan.rig, 'arm_r_upper', 'rotate'), 700), -96);
  assert.deepStrictEqual(out.trace.shots[0].actions.map(function (action) {
    return [action.do, action.startMs, action.endMs, action.resources];
  }), [
    ['enter', 0, 400, ['actor:warden.stage', 'actor:warden.root', 'actor:warden.locomotion']],
    ['lookAt', 400, 700, ['actor:warden.head']],
    ['pointAt', 400, 700, ['actor:warden.arm.right']],
    ['wait', 700, 900, []],
    ['exit', 900, 1400, ['actor:warden.stage', 'actor:warden.root', 'actor:warden.locomotion']]
  ]);
  assert.deepStrictEqual(out.trace.shots[0].slots, [
    { anchor: 'start', actor: 'warden', startMs: 0, endMs: 400, phase: 'reserved' },
    { anchor: 'start', actor: 'warden', startMs: 400, endMs: 900, phase: 'occupied' },
    { anchor: 'start', actor: 'warden', startMs: 900, endMs: 1400, phase: 'occupied' }
  ]);

  spec = phase2Spec([{ parallel: [
    { do: 'lookAt', actor: 'warden', target: 'focus', dur: 0.5 },
    { do: 'pointAt', actor: 'warden', target: 'focus', hand: 'right', dur: 0.5 }
  ] }]);
  spec.actors[0].profile.authoredFacing = 'left';
  var mirrored = Authoring.compilePerformance(spec).beats[0];
  assert.strictEqual(mirrored.cast[0].stage.facing, 'mirror-x');
  plan = Timeline.normalizeCastPlan(mirrored.cast, {
    path: 'performance.shots[0].cast', durationMs: 500
  })[0].rig;
  assert.strictEqual(Timeline.sampleTrack(track(plan, 'head', 'rotate'), 500), 8,
    'screen-right maps back to authored-local left under mirror-x');
  assert.strictEqual(Timeline.sampleTrack(track(plan, 'arm_r_upper', 'rotate'), 500), 72,
    'anatomical right hand keeps its authored-local pose under mirror-x');

  var vertical = Authoring.compilePerformance(phase2Spec([
    { do: 'enter', actor: 'warden', from: 'above', dur: 0.2 },
    { do: 'exit', actor: 'warden', to: 'below', dur: 0.2 }
  ])).beats[0].cast[0].stage;
  assert.deepStrictEqual(vertical.enter.offset, { x: 0, y: -180 });
  assert.deepStrictEqual(vertical.exit.offset, { x: 0, y: 180 });
});

test('enter/exit typestate rejects non-edge timing, parallel overlap and post-exit actor actions', function () {
  var spec = phase2Spec([
    { do: 'wait', dur: 0.1 },
    { do: 'enter', actor: 'warden', from: 'left', dur: 0.2 }
  ]);
  expectPerf(spec, 'PERF_STATE', 'performance.shots[0].sequence[1]', 'enter after zero');

  spec = phase2Spec([
    { do: 'exit', actor: 'warden', to: 'right', dur: 0.2 },
    { do: 'wait', dur: 0.1 }
  ]);
  expectPerf(spec, 'PERF_STATE', 'performance.shots[0].sequence[0]', 'exit before tail window');

  spec = phase2Spec([{ parallel: [
    { do: 'enter', actor: 'warden', from: 'left', dur: 0.5 },
    { do: 'lookAt', actor: 'warden', target: 'focus', dur: 0.5 }
  ] }]);
  expectPerf(spec, 'PERF_STATE', 'performance.shots[0].sequence[0].parallel[1].actor',
    'look while entering');

  spec = phase2Spec([{ parallel: [
    { do: 'exit', actor: 'warden', to: 'right', dur: 0.5 },
    { do: 'lookAt', actor: 'warden', target: 'focus', dur: 0.5 }
  ] }]);
  var parallelExit = expectPerf(spec, 'PERF_STATE',
    'performance.shots[0].sequence[0].parallel[1]', 'look while exiting');
  assert.strictEqual(parallelExit.detail.actor, 'warden');
  assert.strictEqual(parallelExit.detail.exit.path,
    'performance.shots[0].sequence[0].parallel[0]');

  spec = phase2Spec([
    { do: 'exit', actor: 'warden', to: 'right', dur: 0.5 },
    { do: 'lookAt', actor: 'warden', target: 'focus', dur: 0.2 }
  ]);
  var afterExit = expectPerf(spec, 'PERF_STATE', 'performance.shots[0].sequence[1].actor', 'action after exit');
  assert.deepStrictEqual(afterExit.detail.transition, {
    do: 'exit', path: 'performance.shots[0].sequence[0]', startMs: 0, endMs: 500
  });

  spec = phase2Spec([
    { do: 'say', actor: 'warden', lines: [{ cps: 10, chunks: [{ text: 'A' }] }], mouth: ['A'] },
    { do: 'enter', actor: 'warden', from: 'left', dur: 0.2 }
  ]);
  expectPerf(spec, 'PERF_STATE', 'performance.shots[0].sequence[0].actor', 'say before enter');

  spec = phase2Spec([{ do: 'enter', actor: 'warden', from: 'front', dur: 0.2 }]);
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].from', 'bad enter direction');

  spec = phase2Spec([{ do: 'exit', actor: 'warden', to: 'front', dur: 0.2 }]);
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].to', 'bad exit direction');
});

test('say reuses compileReveal with initial delay, exact body, authored mouth timing and frozen output', function () {
  var runCount = 0;
  var run = function () { runCount++; };
  var spec = phase2Spec([
    { do: 'wait', dur: 0.2 },
    { do: 'say', actor: 'warden', lines: [{ cps: 10, chunks: [
      { text: '', pauseAfter: 0.1 },
      { text: 'A😀', pauseAfter: 0.2 }
    ] }], mouth: ['A', 'O'], dur: 1 },
    { do: 'wait', dur: 0.3 }
  ], run);
  var before = JSON.stringify(spec);
  var first = Authoring.compilePerformance(spec);
  var second = Authoring.compilePerformance(spec);
  assert.deepStrictEqual(first, second);
  assert.strictEqual(JSON.stringify(spec), before);
  assert.strictEqual(first.beats[0].run, run);
  assert.strictEqual(runCount, 0);
  assert(recursivelyFrozen(first.beats));
  assert(recursivelyFrozen(first.trace));

  var beat = first.beats[0];
  assert.strictEqual(beat.speaker, 'warden');
  assert.deepStrictEqual(beat.text.lines[0].chunks[0], { text: '', cps: 10, pauseAfter: 0.2 });
  var reveal = Timeline.compileReveal(beat.text, { path: 'compiled.text' });
  assert.strictEqual(reveal.durationMs, 700);
  assert.deepStrictEqual(reveal.graphemes.map(function (item) { return [item.text, item.atMs]; }),
    [['A', 300], ['😀', 400]], 'empty author/lowering chunks produce no grapheme');
  var mouth = variant(beat.cast[0].rig, 'mouth');
  assert.deepStrictEqual(mouth.keys, [
    { at: 0.366, value: 'A' },
    { at: 0.533, value: 'O' },
    { at: 0.7, value: 'rest' },
    { at: 1.5, value: 'rest' }
  ]);
  var normalized = Timeline.normalizeCastPlan(beat.cast, {
    path: 'performance.shots[0].cast', durationMs: 1500
  })[0].rig;
  assert.strictEqual(variant(normalized, 'mouth').keys.slice(-1)[0].atMs, 1500);
  assert.strictEqual(variant(normalized, 'mouth').keys.slice(-1)[0].value, 'rest');

  var view = Cutscene.createCutsceneModule().render({}, {
    id: 'dialogue', kind: 'cutscene', title: 'dialogue', beats: first.beats, links: []
  });
  assert.strictEqual(view.body[0].text, 'A😀');
  assert.strictEqual(view.cutscenePlayback.speaker, 'warden');
  assert.strictEqual(view.cutscenePlayback.text.graphemes.length, 2);
});

test('omitted text dur follows reveal, caption never fabricates speaker or mouth motion', function () {
  var spoken = phase2Spec([{ do: 'say', actor: 'warden',
    lines: [{ cps: 4, chunks: [{ text: 'AB' }] }], mouth: ['A'] }]);
  var spokenOut = Authoring.compilePerformance(spoken);
  assert.strictEqual(spokenOut.beats[0].dur, 0.5);
  assert.deepStrictEqual(spokenOut.trace.shots[0].actions[0].defaults,
    [{ field: 'dur', value: 0.5, source: 'reveal-duration-v1' }]);
  assert.deepStrictEqual(variant(spokenOut.beats[0].cast[0].rig, 'mouth').keys,
    [{ at: 0.25, value: 'A' }, { at: 0.5, value: 'rest' }]);

  var caption = phase2Spec([
    { do: 'wait', dur: 0.25 },
    { do: 'caption', lines: [{ cps: 4, chunks: [{ text: 'OK' }] }] }
  ]);
  var captionOut = Authoring.compilePerformance(caption);
  assert.strictEqual(captionOut.beats[0].dur, 0.75);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(captionOut.beats[0], 'speaker'), false);
  assert.deepStrictEqual(variant(captionOut.beats[0].cast[0].rig, 'mouth').keys, []);
  var captionReveal = Timeline.compileReveal(captionOut.beats[0].text);
  assert.strictEqual(captionReveal.graphemes[0].atMs, 250);
  var view = Cutscene.createCutsceneModule().render({}, {
    id: 'caption', kind: 'cutscene', title: 'caption', beats: captionOut.beats, links: []
  });
  assert.strictEqual(view.body[0].text, 'OK');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(view.cutscenePlayback, 'speaker'), false);
});

test('walk+say and point+say remain legal while action resources stay disjoint', function () {
  var walking = phase2Spec([{ parallel: [
    { do: 'walkTo', actor: 'warden', to: 'mark', dur: 1, steps: 2 },
    { do: 'say', actor: 'warden', lines: [{ cps: 4, chunks: [{ text: 'AB' }] }], mouth: ['A'] }
  ] }]);
  var walkOut = Authoring.compilePerformance(walking);
  assert.strictEqual(walkOut.beats[0].dur, 1);
  assert.strictEqual(Timeline.sampleTrack(Timeline.normalizeCastPlan(walkOut.beats[0].cast, {
    path: 'performance.shots[0].cast', durationMs: 1000
  })[0].rig.tracks.filter(function (item) {
    return item.target === 'torso' && item.property === 'x';
  })[0], 1000), 160);
  assert.strictEqual(walkOut.beats[0].speaker, 'warden');

  var pointing = phase2Spec([{ parallel: [
    { do: 'pointAt', actor: 'warden', target: 'focus', hand: 'right', dur: 0.5 },
    { do: 'say', actor: 'warden', lines: [{ cps: 4, chunks: [{ text: 'AB' }] }], mouth: ['O'] }
  ] }]);
  var pointOut = Authoring.compilePerformance(pointing);
  assert.strictEqual(pointOut.beats[0].dur, 0.5);
  assert.deepStrictEqual(pointOut.trace.shots[0].actions.map(function (action) { return action.resources; }), [
    ['actor:warden.arm.right'],
    ['actor:warden.mouth', 'global.text', 'global.speaker']
  ]);
});

test('text resources are shot-exclusive even at serial boundaries and say+caption cannot overlap', function () {
  var spec = phase2Spec([
    { do: 'caption', lines: [{ cps: 10, chunks: [{ text: 'A' }] }] },
    { do: 'caption', lines: [{ cps: 10, chunks: [{ text: 'B' }] }] }
  ]);
  var serial = expectPerf(spec, 'PERF_CONFLICT', 'performance.shots[0].sequence[1]',
    'serial captions in one shot');
  assert.strictEqual(serial.detail.resource, 'global.text');
  assert.strictEqual(serial.detail.scope, 'shot');

  spec = phase2Spec([
    { do: 'say', actor: 'warden', lines: [{ cps: 10, chunks: [{ text: 'A' }] }], mouth: ['A'] },
    { do: 'say', actor: 'warden', lines: [{ cps: 10, chunks: [{ text: 'B' }] }], mouth: ['O'] }
  ]);
  var serialSay = expectPerf(spec, 'PERF_CONFLICT', 'performance.shots[0].sequence[1]',
    'serial says in one shot');
  assert.strictEqual(serialSay.detail.resource, 'global.text');
  assert.strictEqual(serialSay.detail.scope, 'shot');

  spec = phase2Spec([{ parallel: [
    { do: 'say', actor: 'warden', lines: [{ cps: 10, chunks: [{ text: 'A' }] }], mouth: ['A'] },
    { do: 'caption', lines: [{ cps: 10, chunks: [{ text: 'B' }] }] }
  ] }]);
  var overlap = expectPerf(spec, 'PERF_CONFLICT',
    'performance.shots[0].sequence[0].parallel[1]', 'say plus caption');
  assert.strictEqual(overlap.detail.resource, 'global.text');
  assert.strictEqual(overlap.detail.scope, 'shot');
});

test('Phase 2 capability, RevealLine, duration and explicit mouth contracts fail at source paths', function () {
  var spec = phase2Spec([{ do: 'lookAt', actor: 'warden', target: 'focus', dur: 0.2 }]);
  delete spec.actors[0].profile.head;
  expectPerf(spec, 'PERF_CAPABILITY', 'performance.shots[0].sequence[0].actor', 'look without head');

  spec = phase2Spec([{ do: 'say', actor: 'warden',
    lines: [{ cps: 10, chunks: [{ text: 'A' }] }], mouth: ['A'] }]);
  delete spec.actors[0].profile.mouth;
  expectPerf(spec, 'PERF_CAPABILITY', 'performance.shots[0].sequence[0].actor', 'say without mouth profile');

  spec = phase2Spec([{ do: 'say', actor: 'warden',
    lines: [{ cps: 2, chunks: [{ text: 'AB' }] }], mouth: ['A'], dur: 0.5 }]);
  var short = expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].dur', 'say shorter than reveal');
  assert.deepStrictEqual(short.detail, { durationMs: 500, revealDurationMs: 1000 });

  spec = phase2Spec([{ do: 'say', actor: 'warden',
    lines: [{ cps: 10, chunks: [{ text: '' }] }], mouth: ['A'], dur: 0.5 }]);
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].lines', 'empty say body');

  spec = phase2Spec([{ do: 'caption',
    lines: [{ cps: 10, chunks: [{ text: 'A', html: '<b>A</b>' }] }] }]);
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].lines[0].chunks[0].html',
    'RevealLine unknown field');

  spec = phase2Spec([{ do: 'say', actor: 'warden',
    lines: [{ cps: 10, chunks: [{ text: 'A' }] }], mouth: [] }]);
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].mouth', 'empty mouth pattern');

  spec = phase2Spec([{ do: 'say', actor: 'warden',
    lines: [{ cps: 10, chunks: [{ text: 'A' }] }], mouth: new Array(1) }]);
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].mouth[0]', 'sparse mouth pattern');

  spec = phase2Spec([{ do: 'say', actor: 'warden',
    lines: [{ cps: 10, chunks: [{ text: 'A' }] }], mouth: ['A', 'E'] }]);
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].mouth[1]', 'unknown mouth shape');

  spec = phase2Spec([{ do: 'say', actor: 'warden',
    lines: [{ cps: 1000, chunks: [{ text: 'A' }] }], mouth: ['A'] }]);
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].mouth',
    'mouth pattern cannot collapse onto reveal rest');

  var maxPattern = [];
  for (var i = 0; i < 32; i++) maxPattern.push(i % 2 ? 'O' : 'A');
  spec = phase2Spec([{ do: 'say', actor: 'warden',
    lines: [{ cps: 1, chunks: [{ text: 'A' }] }], mouth: maxPattern }]);
  var maxOut = Authoring.compilePerformance(spec);
  assert.strictEqual(variant(maxOut.beats[0].cast[0].rig, 'mouth').keys.length, 33,
    '32 authored shapes plus the deduplicated reveal/shot terminal rest');

  spec = phase2Spec([{ do: 'say', actor: 'warden',
    lines: [{ cps: 1, chunks: [{ text: 'A' }] }], mouth: maxPattern.concat(['A']) }]);
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].mouth', '33 mouth shapes');
});

test('sparse sequence and data-only intent arrays fail before lowering', function () {
  var spec = phase2Spec([{ do: 'wait', dur: 0.1 }]);
  spec.shots[0].sequence = new Array(1);
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0]', 'sparse sequence');

  spec = phase2Spec([{ do: 'wait', dur: 0.1 }]);
  spec.shots[0].scene = { elements: new Array(1) };
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].scene.elements[0]', 'sparse scene intent array');

  spec = phase2Spec([{ do: 'wait', dur: 0.1 }]);
  spec.shots[0].audio = { sfx: new Array(1) };
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].audio.sfx[0]', 'sparse audio intent array');

  spec = phase2Spec([{ do: 'wait', dur: 0.1 }]);
  spec.shots[0].scene = { elements: [{ kind: 'item', ref: '灯' }] };
  spec.shots[0].audio = { sfx: ['click'] };
  var out = Authoring.compilePerformance(spec);
  assert.deepStrictEqual(out.beats[0].scene.elements, [{ kind: 'item', ref: '灯' }]);
  assert.deepStrictEqual(out.beats[0].audio.sfx, ['click']);
});

test('shot action count has a bounded fail-loud budget', function () {
  var limit = 512;
  var spec = phase2Spec(Array.from({ length: limit }, function () { return { do: 'wait', dur: 0.001 }; }));
  assert.strictEqual(Authoring.compilePerformance(spec).trace.shots[0].actions.length, limit);

  spec = phase2Spec(Array.from({ length: limit + 1 }, function () { return { do: 'wait', dur: 0.001 }; }));
  expectPerf(spec, 'PERF_LIMIT', 'performance.shots[0].sequence', 'action budget overflow');

  spec = phase2Spec([{ parallel: Array.from({ length: limit + 1 }, function () { return { do: 'wait', dur: 0.001 }; }) }]);
  expectPerf(spec, 'PERF_LIMIT', 'performance.shots[0].sequence', 'parallel action budget overflow');
});

test('sparse RevealLine and colon-bearing diagnostic roots fail with stable complete source paths', function () {
  var spec = phase2Spec([
    { do: 'wait', dur: 0.1 },
    { do: 'caption', lines: [
      { cps: 10, chunks: new Array(1) },
      { cps: 10, chunks: [{ text: 'A' }] }
    ] }
  ]);
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[1].lines[0].chunks[0]',
    'sparse first RevealLine chunks');

  spec = phase2Spec([{ do: 'caption', lines: [{ chunks: [{ text: 'A' }] }] }]);
  expectPerf(spec, 'PERF_SCHEMA', 'world:node.shots[0].sequence[0].lines[0].chunks[0].cps',
    'colon-bearing diagnostic root', { path: 'world:node' });
});

test('root pivot is relocated to the named anchor without rejecting legal boundary anchors', function () {
  var spec = phase2Spec([{ do: 'enter', actor: 'warden', from: 'left', dur: 0.2 }]);
  var root = spec.actors[0].rig.parts.filter(function (item) { return item.id === 'torso'; })[0];
  root.pivot.x = 10;
  root.rest.x = 100;
  spec.anchors[0].x = 320;
  var beat = Authoring.compilePerformance(spec).beats[0];
  var normalized = Timeline.normalizeCastPlan(beat.cast, {
    path: 'performance.shots[0].cast', durationMs: 200
  })[0].rig;
  var frameRoot = Timeline.sampleRig(normalized, 200).parts.filter(function (item) { return item.id === 'torso'; })[0];
  var pivotWorldX = frameRoot.matrix[0] * root.pivot.x + frameRoot.matrix[2] * root.pivot.y + frameRoot.matrix[4];
  assert.strictEqual(pivotWorldX, 320);
});

test('speaker profile keeps the active exact mouth id/base/A/O contract', function () {
  var spec = phase2Spec([{ do: 'wait', dur: 0.1 }]);
  spec.actors[0].rig.parts.push(part('lips', 'head', { y: 6 }));
  spec.actors[0].rig.drawOrder.push('lips');
  spec.actors[0].profile.mouth = 'lips';
  expectPerf(spec, 'PERF_CAPABILITY', 'performance.actors[0].profile.mouth', 'mouth id remap');

  spec = phase2Spec([{ do: 'wait', dur: 0.1 }]);
  spec.actors[0].rig.variants[0].states = [{ id: 'A', art: 'ship' }];
  expectPerf(spec, 'PERF_CAPABILITY', 'performance.actors[0].profile.mouth', 'mouth missing O');
});

function twoActorSpec(capacity) {
  return {
    version: 1,
    actors: [
      { id: 'alpha', rig: staticRig(), profile: profile() },
      { id: 'beta', rig: staticRig(), profile: profile() }
    ],
    anchors: [
      { id: 'alpha_start', x: 60, y: 108, facing: 'right' },
      { id: 'beta_start', x: 120, y: 108, facing: 'right' },
      { id: 'shared', x: 160, y: 108, capacity: capacity, facing: 'right' }
    ],
    shots: [{
      id: 'parallel_walk',
      cast: [{ actor: 'alpha', at: 'alpha_start' }, { actor: 'beta', at: 'beta_start' }],
      sequence: [
        { parallel: [
          { do: 'walkTo', actor: 'alpha', to: 'shared', dur: 1 },
          { do: 'walkTo', actor: 'beta', to: 'shared', dur: 2 }
        ] },
        { do: 'wait', dur: 0.5 }
      ]
    }]
  };
}

test('one-level parallel joins all and capacity 2 admits reservation plus occupancy', function () {
  var out = Authoring.compilePerformance(twoActorSpec(2));
  var shot = out.trace.shots[0];
  assert.strictEqual(shot.durationMs, 2500);
  assert.deepStrictEqual(shot.actions.map(function (action) { return [action.actor, action.startMs, action.endMs]; }),
    [['alpha', 0, 1000], ['beta', 0, 2000], [undefined, 2000, 2500]]);
  assert.strictEqual(shot.slots.filter(function (slot) {
    return slot.anchor === 'shared' && slot.startMs === 1000 && slot.phase === 'occupied';
  }).length, 1);
  assert.deepStrictEqual(out.beats[0].cast.map(function (member) { return member.id; }), ['alpha', 'beta']);
});

test('enter reserves its cast anchor from 0ms and participates in the same capacity judge', function () {
  function enteringSpec(capacity) {
    var spec = twoActorSpec(capacity);
    spec.shots[0].cast = [{ actor: 'alpha', at: 'shared' }, { actor: 'beta', at: 'shared' }];
    spec.shots[0].sequence = [{ parallel: [
      { do: 'enter', actor: 'alpha', from: 'left', dur: 0.5 },
      { do: 'enter', actor: 'beta', from: 'right', dur: 0.5 }
    ] }];
    return spec;
  }
  var admitted = Authoring.compilePerformance(enteringSpec(2));
  assert.deepStrictEqual(admitted.trace.shots[0].slots, [
    { anchor: 'shared', actor: 'alpha', startMs: 0, endMs: 500, phase: 'reserved' },
    { anchor: 'shared', actor: 'beta', startMs: 0, endMs: 500, phase: 'reserved' }
  ]);
  var error = expectPerf(enteringSpec(1), 'PERF_CONFLICT',
    'performance.shots[0].sequence[0].parallel[1]', 'enter capacity conflict');
  assert.strictEqual(error.detail.anchor, 'shared');
  assert.strictEqual(error.detail.capacity, 1);
  assert.deepStrictEqual(error.detail.overlap, { startMs: 0, endMs: 500 });
  assert.deepStrictEqual(error.detail.slots.map(function (slot) { return slot.phase; }), ['reserved', 'reserved']);
});

test('resource conflicts fail with stable code/path/detail while exact sequence boundaries are legal', function () {
  var spec = goldenSpec(function () {});
  spec.shots[0].sequence = [{ parallel: [
    { do: 'walkTo', actor: 'warden', to: 'mark', dur: 1 },
    { do: 'pointAt', actor: 'warden', target: 'focus', hand: 'right', dur: 1 }
  ] }];
  var error = expectPerf(spec, 'PERF_CONFLICT',
    'performance.shots[0].sequence[0].parallel[1]', 'walk+point conflict');
  assert.strictEqual(error.detail.resource, 'actor:warden.arm.right');
  assert.deepStrictEqual(error.detail.overlap, { startMs: 0, endMs: 1000 });

  var legal = goldenSpec(function () {});
  legal.shots[0].sequence = [
    { do: 'pointAt', actor: 'warden', target: 'focus', hand: 'right', dur: 0.5 },
    { do: 'pointAt', actor: 'warden', target: 'focus', hand: 'right', dur: 0.5 }
  ];
  assert.strictEqual(Authoring.compilePerformance(legal).beats[0].dur, 1);
});

test('slot capacity conflict reports anchor, actors, action paths and overlap', function () {
  var error = expectPerf(twoActorSpec(1), 'PERF_CONFLICT',
    'performance.shots[0].sequence[0].parallel[1]', 'capacity conflict');
  assert.strictEqual(error.detail.anchor, 'shared');
  assert.strictEqual(error.detail.capacity, 1);
  assert.deepStrictEqual(error.detail.overlap, { startMs: 0, endMs: 1000 });
  assert.strictEqual(error.detail.slots.length, 2);
});

test('closed schema rejects unknown fields at every author layer and Phase 2 action', function () {
  var cases = [
    ['performance.extra', function (spec) { spec.extra = true; }],
    ['performance.actors[0].extra', function (spec) { spec.actors[0].extra = true; }],
    ['performance.actors[0].profile.extra', function (spec) { spec.actors[0].profile.extra = true; }],
    ['performance.anchors[0].extra', function (spec) { spec.anchors[0].extra = true; }],
    ['performance.shots[0].extra', function (spec) { spec.shots[0].extra = true; }],
    ['performance.shots[0].sequence[0].extra', function (spec) { spec.shots[0].sequence[0].extra = true; }]
  ];
  cases.forEach(function (entry) {
    var spec = goldenSpec(function () {});
    entry[1](spec);
    expectPerf(spec, 'PERF_SCHEMA', entry[0], 'unknown ' + entry[0]);
  });
  expectPerf(goldenSpec(function () {}), 'PERF_SCHEMA', 'options.extra', 'unknown options', { extra: true });

  var reserved = goldenSpec(function () {});
  reserved.actors[0].id = '__proto__';
  expectPerf(reserved, 'PERF_SCHEMA', 'performance.actors[0].id', 'reserved id');

  [
    { do: 'enter', actor: 'warden', from: 'left', dur: 0.2 },
    { do: 'exit', actor: 'warden', to: 'right', dur: 0.2 },
    { do: 'lookAt', actor: 'warden', target: 'focus', dur: 0.2 },
    { do: 'say', actor: 'warden', lines: [{ cps: 10, chunks: [{ text: 'A' }] }], mouth: ['A'] },
    { do: 'caption', lines: [{ cps: 10, chunks: [{ text: 'A' }] }] }
  ].forEach(function (action) {
    action.extra = true;
    var phase2 = phase2Spec([action]);
    expectPerf(phase2, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].extra',
      'unknown ' + action.do + ' field');
  });
});

test('time language rejects bad durations, empty/nested parallel, join:any and unsupported actions', function () {
  var spec = goldenSpec(function () {});
  spec.shots[0].sequence[0].dur = 0.0001;
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].dur', 'sub-ms duration');

  spec = goldenSpec(function () {});
  spec.shots[0].sequence = [{ do: 'wait', dur: 1.001 }];
  assert.strictEqual(Authoring.compilePerformance(spec).beats[0].dur, 1.001,
    'three-decimal author duration survives IEEE-754 representation and round-trips through the low-level beat');

  spec = goldenSpec(function () {});
  spec.shots[0].sequence = [{ parallel: [] }];
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].parallel', 'empty parallel');

  spec = goldenSpec(function () {});
  spec.shots[0].cast = [];
  spec.shots[0].sequence = [{ parallel: new Array(1) }];
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].parallel[0]', 'sparse parallel');

  spec = goldenSpec(function () {});
  spec.shots[0].sequence = [{ parallel: [{ parallel: [{ do: 'wait', dur: 1 }] }] }];
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].parallel[0].parallel', 'nested parallel');

  spec = goldenSpec(function () {});
  spec.shots[0].sequence = [{ parallel: [{ do: 'wait', dur: 1 }], join: 'any' }];
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].join', 'join any');

  spec = goldenSpec(function () {});
  spec.shots[0].sequence = [{ do: 'dance', actor: 'warden', dur: 1 }];
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].sequence[0].do', 'unknown action');

  spec = goldenSpec(function () {});
  spec.shots[0].sequence = [{ do: 'wait', dur: 60 }, { do: 'wait', dur: 0.001 }];
  expectPerf(spec, 'PERF_LIMIT', 'performance.shots[0].sequence', 'shot duration limit');
});

test('references, topology capability and onstage/facing typestate fail at source paths', function () {
  var spec = goldenSpec(function () {});
  spec.actors[0].profile.legs.left = 'missing';
  expectPerf(spec, 'PERF_REF', 'performance.actors[0].profile.legs.left', 'profile part ref');

  spec = goldenSpec(function () {});
  spec.shots[0].sequence[0].actor = 'missing';
  expectPerf(spec, 'PERF_REF', 'performance.shots[0].sequence[0].actor', 'action actor ref');

  spec = goldenSpec(function () {});
  spec.shots[0].sequence[0].to = 'missing';
  expectPerf(spec, 'PERF_REF', 'performance.shots[0].sequence[0].to', 'action anchor ref');

  spec = goldenSpec(function () {});
  spec.shots[0].cast = [];
  spec.shots[0].sequence = [{ do: 'pointAt', actor: 'warden', target: 'focus', hand: 'right', dur: 1 }];
  expectPerf(spec, 'PERF_STATE', 'performance.shots[0].sequence[0].actor', 'actor offstage');

  spec = goldenSpec(function () {});
  delete spec.actors[0].profile.legs;
  expectPerf(spec, 'PERF_CAPABILITY', 'performance.shots[0].sequence[0].actor', 'walk capability');

  spec = goldenSpec(function () {});
  spec.actors[0].rig.parts.filter(function (item) { return item.id === 'arm_r_fore'; })[0].parent = 'torso';
  expectPerf(spec, 'PERF_CAPABILITY', 'performance.actors[0].profile.arms.right.fore', 'arm chain');

  spec = goldenSpec(function () {});
  spec.shots[0].cast[0].facing = 'left';
  expectPerf(spec, 'PERF_STATE', 'performance.shots[0].sequence[0].to', 'backward walk');

  spec = goldenSpec(function () {});
  delete spec.anchors[0].facing;
  expectPerf(spec, 'PERF_STATE', 'performance.shots[0].cast[0].facing', 'missing resolved facing');
});

test('StaticRig ownership rejects authored primary keys and unsafe secondary writers', function () {
  var spec = goldenSpec(function () {});
  spec.actors[0].rig.tracks.push({ target: 'torso', property: 'x', keys: [{ at: 1, value: 120 }] });
  expectPerf(spec, 'PERF_SCHEMA', 'performance.actors[0].rig.tracks', 'authored primary track');

  spec = goldenSpec(function () {});
  spec.actors[0].rig.variants.push({ target: 'eyes', base: 'open', states: [{ id: 'closed', art: 'ship' }],
    keys: [{ at: 1, value: 'closed' }] });
  expectPerf(spec, 'PERF_SCHEMA', 'performance.actors[0].rig.variants[0].keys', 'authored variant key');

  spec = goldenSpec(function () {});
  spec.actors[0].rig.secondary = [
    { type: 'oscillate', target: 'eyes', property: 'rotate', periodMs: 1000, amplitude: 1, phase: 0 }
  ];
  expectPerf(spec, 'PERF_SCHEMA', 'performance.actors[0].rig.secondary[0].type', 'non-blink secondary');

  spec = goldenSpec(function () {});
  spec.actors[0].rig.secondary[0].target = 'leg_l';
  expectPerf(spec, 'PERF_CONFLICT', 'performance.actors[0].rig.secondary[0].target', 'hidden primary writer');
});

test('capacity 0 cannot be cast/walk destination, initial occupancy conflicts and capacity defaults to 1', function () {
  var spec = goldenSpec(function () {});
  spec.shots[0].cast[0].at = 'focus';
  expectPerf(spec, 'PERF_STATE', 'performance.shots[0].cast[0].at', 'cast at capacity zero');

  spec = goldenSpec(function () {});
  spec.shots[0].sequence[0].to = 'focus';
  expectPerf(spec, 'PERF_STATE', 'performance.shots[0].sequence[0].to', 'walk to capacity zero');

  spec = twoActorSpec(2);
  spec.shots[0].cast[1].at = 'alpha_start';
  var error = expectPerf(spec, 'PERF_CONFLICT', 'performance.shots[0].cast[1].at', 'initial capacity default');
  assert.strictEqual(error.detail.phase, 'initial');
});

test('data-only scene/audio are cloned and executable/cyclic values fail loud', function () {
  var spec = goldenSpec(function () {});
  spec.shots[0].scene.bad = function () {};
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].scene.bad', 'scene function');

  spec = goldenSpec(function () {});
  spec.shots[0].audio.loop = spec.shots[0].audio;
  expectPerf(spec, 'PERF_SCHEMA', 'performance.shots[0].audio.loop', 'audio cycle');
});

if (fail) {
  console.error('compile-performance: ' + fail + ' failed, ' + pass + ' passed');
  process.exit(1);
}
console.log('compile-performance: all ' + pass + ' groups passed');
