'use strict';

var T = require('../present-timeline.js');
var pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  X  ' + msg); }
}
function close(a, b, msg) { ok(Math.abs(a - b) < 1e-6, msg + ' (got ' + a + ', expected ' + b + ')'); }
function throws(fn, needle, msg) {
  try { fn(); fail++; console.log('  X  ' + msg + ' (未抛错)'); }
  catch (e) { ok(!needle || String(e.message).indexOf(needle) >= 0, msg + ' (错误路径不含 ' + needle + ')'); }
}

var plan = T.normalizeMotionPlan({
  layers: [
    { id: 'ship', art: 'ship', x: 0, y: 10, scale: 1, rotate: 0, opacity: 0.5 },
    { id: 'lamp', art: 'lantern', x: 4 }
  ],
  tracks: [
    { target: 'ship', property: 'x', keys: [
      { at: 1, value: 100, ease: 'linear' },
      { at: 2, value: 200, ease: 'ease-in-out' }
    ] },
    { target: 'ship', property: 'opacity', keys: [
      { at: 1, value: 1, ease: 'ease-out' }
    ] },
    { target: 'lamp', property: 'y', keys: [
      { at: 2, value: 20, ease: 'ease' }
    ] }
  ]
}, { durationMs: 2000, path: 'motion' });

ok(plan.tracks[0].baseKey.atMs === 0 && plan.tracks[0].keys[1].atMs === 2000,
  'A1 normalize author seconds to integer ms and implicit t=0 base key');
close(T.sampleTrack(plan.tracks[0], -10), 0, 'A2 sample before t=0 clamps to base');
close(T.sampleTrack(plan.tracks[0], 0), 0, 'A3 sample at t=0');
close(T.sampleTrack(plan.tracks[0], 999), 99.9, 'A4 sample just before first key');
close(T.sampleTrack(plan.tracks[0], 1000), 100, 'A5 sample at first key');
close(T.sampleTrack(plan.tracks[0], 1500), 150, 'A6 sample linear midpoint');
close(T.sampleTrack(plan.tracks[0], 2000), 200, 'A7 sample at endpoint');
close(T.sampleTrack(plan.tracks[0], 999999), 200, 'A8 sample after endpoint clamps to final');
var easeIntervalPlan = T.normalizeMotionPlan({
  layers: [{ id: 'easeLayer', art: 'ship', x: 0 }],
  tracks: [{ target: 'easeLayer', property: 'x', keys: [
    { at: 1, value: 100, ease: 'linear' },
    { at: 2, value: 200, ease: 'ease-in' }
  ] }]
});
close(T.sampleTrack(easeIntervalPlan.tracks[0], 1500),
  100 + 100 * T.EASING['ease-in'](0.5), 'A9 ease belongs to the following key interval');

var easeNames = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];
easeNames.forEach(function (name) {
  ok(T.EASING[name](0) === 0 && T.EASING[name](1) === 1, 'A10 ' + name + ' endpoints exact');
});
var frame0 = T.sampleMotion(plan, 0), frameMid = T.sampleMotion(plan, 1500), frameEnd = T.sampleMotion(plan, 2000);
ok(frame0.ship.x === 0 && frame0.ship.opacity === 0.5 && frame0.lamp.y === 0, 'B1 sampleMotion returns all layer initial values');
close(frameMid.ship.x, 150, 'B2 sampleMotion samples absolute track time');
ok(frameEnd.ship.x === 200 && frameEnd.ship.opacity === 1 && frameEnd.lamp.y === 20, 'B3 sampleMotion reaches every endpoint');
var repeatA = JSON.stringify(T.sampleMotion(plan, 1375));
var repeatB = JSON.stringify(T.sampleMotion(plan, 1375));
ok(repeatA === repeatB, 'B4 repeated plan+t sampling is byte-stable');
ok(JSON.stringify(plan.layers[0]) === '{"id":"ship","art":"ship","x":0,"y":10,"scale":1,"rotate":0,"opacity":0.5}' &&
  Object.keys(frame0.ship).join(',') === 'x,y,scale,rotate,opacity',
  'P4a-A1 legacy normalized layer and sampled frame gain no axis fields');

var axisPlan = T.normalizeMotionPlan({
  layers: [{ id: 'drop', art: 'rock', x: 160, y: 24, scale: 0.8, rotate: 0, opacity: 1 }],
  tracks: [
    { target: 'drop', property: 'scaleX', keys: [
      { at: 0.2, value: 0.6 }, { at: 0.4, value: 1.2 }, { at: 0.6, value: 0.8 }
    ] },
    { target: 'drop', property: 'scaleY', keys: [
      { at: 0.2, value: 1 }, { at: 0.4, value: 0.5 }, { at: 0.6, value: 0.8 }
    ] }
  ]
}, { durationMs: 600, path: 'motion' });
ok(axisPlan.tracks[0].baseKey.value === 0.8 && axisPlan.tracks[1].baseKey.value === 0.8 &&
  !Object.prototype.hasOwnProperty.call(axisPlan.layers[0], 'scaleX') &&
  !Object.prototype.hasOwnProperty.call(axisPlan.layers[0], 'scaleY'),
  'P4a-A2 both axis base keys inherit the sole layer.scale without extending layer schema');
var axisBefore = T.sampleMotion(axisPlan, -10).drop;
var axisStart = T.sampleMotion(axisPlan, 0).drop;
var axisMid = T.sampleMotion(axisPlan, 100).drop;
var axisKey = T.sampleMotion(axisPlan, 400).drop;
var axisEnd = T.sampleMotion(axisPlan, 600).drop;
var axisAfter = T.sampleMotion(axisPlan, 999999).drop;
ok(axisBefore.scaleX === 0.8 && axisBefore.scaleY === 0.8 &&
  axisStart.scaleX === 0.8 && axisStart.scaleY === 0.8,
  'P4a-A3 axis sampling clamps before t=0 and starts from inherited base');
close(axisMid.scaleX, 0.7, 'P4a-A4 scaleX samples its scalar midpoint independently');
close(axisMid.scaleY, 0.9, 'P4a-A5 scaleY samples its scalar midpoint independently');
ok(axisKey.scaleX === 1.2 && axisKey.scaleY === 0.5,
  'P4a-A6 exact axis key time preserves distinct X/Y values');
ok(axisEnd.scaleX === 0.8 && axisEnd.scaleY === 0.8 &&
  axisAfter.scaleX === 0.8 && axisAfter.scaleY === 0.8,
  'P4a-A7 axis endpoint and out-of-range sample hold the final values');
ok(JSON.stringify(T.sampleMotion(axisPlan, 333)) === JSON.stringify(T.sampleMotion(axisPlan, 333)),
  'P4a-A8 repeated axis plan+t sampling is byte-stable');

var singleAxisPlan = T.normalizeMotionPlan({
  layers: [{ id: 'single', art: 'lantern', scale: 0.65 }],
  tracks: [{ target: 'single', property: 'scaleX', keys: [{ at: 0.2, value: 0.9 }] }]
}, { durationMs: 200, path: 'motion' });
var singleAxisFrame = T.sampleMotion(singleAxisPlan, 200).single;
ok(singleAxisFrame.scale === 0.65 && singleAxisFrame.scaleX === 0.9 && singleAxisFrame.scaleY === 0.65,
  'P4a-A9 a single axis track leaves the other axis at layer.scale');
ok(T.MOTION_PROPERTIES.join('/') === 'x/y/scale/scaleX/scaleY/rotate/opacity',
  'P4a-A10 exported flat motion track property list includes both axes');

[0, -1, NaN, Infinity].forEach(function (value, index) {
  throws(function () { T.normalizeMotionPlan({
    layers: [{ id: 'drop', art: 'rock', scale: 0.8 }],
    tracks: [{ target: 'drop', property: index % 2 ? 'scaleY' : 'scaleX', keys: [{ at: 0.2, value: value }] }]
  }, { durationMs: 200, path: 'motion' }); }, '.keys[0].value',
  'P4a-A' + (11 + index) + ' axis key rejects zero/negative/NaN/Infinity with leaf path');
});
throws(function () { T.normalizeMotionPlan({
  layers: [{ id: 'drop', art: 'rock' }],
  tracks: [
    { target: 'drop', property: 'scale', keys: [{ at: 0.1, value: 1.1 }] },
    { target: 'drop', property: 'scaleX', keys: [{ at: 0.2, value: 0.9 }] }
  ]
}, { path: 'motion' }); }, 'motion.tracks[1].property',
'P4a-A15 uniform then axis conflict names the later property path');
throws(function () { T.normalizeMotionPlan({
  layers: [{ id: 'drop', art: 'rock' }],
  tracks: [
    { target: 'drop', property: 'scaleY', keys: [{ at: 0.1, value: 0.9 }] },
    { target: 'drop', property: 'scale', keys: [{ at: 0.2, value: 1.1 }] }
  ]
}, { path: 'motion' }); }, 'motion.tracks[1].property',
'P4a-A16 axis then uniform conflict names the later property path');
throws(function () { T.normalizeMotionPlan({
  layers: [{ id: 'drop', art: 'rock', scaleX: 1 }], tracks: []
}, { path: 'motion' }); }, 'motion.layers[0].scaleX',
'P4a-A17 layers do not accept axis initial values');

var textPlan = T.compileReveal({
  mode: 'typewriter',
  lines: [{ cps: 10, chunks: [
    { text: 'A😀', pauseAfter: 0.2 },
    { text: 'BC', cps: 20 }
  ] }]
});
ok(textPlan.graphemes.length === 4, 'C1 grapheme count keeps emoji as one grapheme');
ok(T.revealCount(textPlan, -1) === 0, 'C2 reveal before start is empty');
ok(T.revealCount(textPlan, 0) === 1, 'C3 first grapheme appears at t=0');
ok(T.revealCount(textPlan, 99) === 1, 'C4 before second grapheme');
ok(T.revealCount(textPlan, 100) === 2, 'C5 second grapheme appears at its scheduled time');
ok(T.revealCount(textPlan, 299) === 2, 'C6 explicit pause keeps count unchanged');
ok(T.revealCount(textPlan, 400) === 3, 'C7 next chunk starts after pause');
ok(T.revealCount(textPlan, 999999) === 4, 'C8 reveal after end is complete');
var counts = [0, 0, 1, 1, 2, 2, 3, 4].map(function (_, i) { return T.revealCount(textPlan, [-1, 0, 50, 99, 100, 399, 400, 10000][i]); });
ok(counts.every(function (value, i) { return i === 0 || value >= counts[i - 1]; }), 'C9 revealCount monotonic');

throws(function () { T.normalizeMotionPlan({ layers: [{ id: 'a', art: 'ship' }], tracks: [{ target: 'missing', property: 'x', keys: [{ at: 1, value: 1 }] }] }); }, 'target', 'D1 missing target rejected');
throws(function () { T.normalizeMotionPlan({ layers: [{ id: 'a', art: 'ship' }], tracks: [{ target: 'a', property: 'x', keys: [] }] }); }, '.keys', 'D2 empty keys rejected');
throws(function () { T.normalizeMotionPlan({ layers: [{ id: 'a', art: 'ship' }], tracks: [
  { target: 'a', property: 'x', keys: [{ at: 1, value: 1 }] },
  { target: 'a', property: 'x', keys: [{ at: 2, value: 2 }] }
] }); }, '重复', 'D3 duplicate track rejected');
throws(function () { T.normalizeMotionPlan({ layers: [{ id: 'a', art: 'ship' }], tracks: [{ target: 'a', property: 'x', keys: [{ at: 1.2345, value: 1 }] }] }); }, '三位', 'D4 over-precise seconds rejected');
throws(function () { T.normalizeMotionPlan({ layers: [{ id: 'a', art: 'ship' }], tracks: [{ target: 'a', property: 'x', keys: [{ at: 1, value: 1, ease: 'bogus' }] }] }); }, 'ease', 'D5 unknown easing rejected');
throws(function () { T.compileReveal({ mode: 'typewriter', lines: [{ chunks: [{ text: 'x' }] }] }); }, 'cps', 'D6 missing cps rejected');
throws(function () { T.compileReveal({ mode: 'typewriter', lines: [{ cps: 1, chunks: [{ text: 'x', pauseAfter: 0.0001 }] }] }); }, '三位', 'D7 over-precise pause rejected');

function rigFixture() {
  return {
    // child 故意声明在 parent 前；拓扑不能依赖作者数组顺序。
    parts: [
      { id: 'child', parent: 'root', art: [{ shape: 'circle', cx: 0, cy: 0, r: 1, fill: '#fff' }],
        pivot: { x: 0, y: 0 }, rest: { x: 10, y: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 0.5 } },
      { id: 'root', parent: null, art: [{ shape: 'rect', x: -1, y: -1, w: 2, h: 2, fill: '#fff' }],
        pivot: { x: 0, y: 0 }, rest: { x: 100, y: 50, rotate: 0, scaleX: 1, scaleY: 1, opacity: 0.8 } }
    ],
    drawOrder: ['child', 'root'],
    tracks: [
      { target: 'root', property: 'x', keys: [
        { at: 1, value: 120, ease: 'linear' },
        { at: 2, value: 140, ease: 'linear' }
      ] },
      { target: 'child', property: 'y', keys: [ { at: 1, value: 10, ease: 'linear' } ] }
    ],
    variants: [],
    secondary: []
  };
}
function copyRig(rig) { return JSON.parse(JSON.stringify(rig)); }
function rigPart(frame, id) {
  for (var i = 0; i < frame.parts.length; i++) if (frame.parts[i].id === id) return frame.parts[i];
  return null;
}
function closeMatrix(actual, expected, msg) {
  ok(actual.length === 6 && actual.every(function (value, i) { return Math.abs(value - expected[i]) < 1e-6; }),
    msg + ' (got [' + actual.join(',') + '], expected [' + expected.join(',') + '])');
}

var rigAuthor = rigFixture();
var rigAuthorBytes = JSON.stringify(rigAuthor);
var rigPlan = T.normalizeRigPlan(rigAuthor, { path: 'beat.rig', durationMs: 2000 });
ok(JSON.stringify(rigAuthor) === rigAuthorBytes && Object.isFrozen(rigPlan) && Object.isFrozen(rigPlan.parts[0].art),
  'R1 normalizeRigPlan does not mutate author data and returns deeply read-only cloned semantics');
rigAuthor.parts[0].art[0].r = 99;
ok(rigPlan.parts[0].art[0].r === 1, 'R2 normalized art is a deep copy, not an author reference');
ok(rigPlan.topoParts.map(function (part) { return part.id; }).join(',') === 'root,child' &&
  rigPlan.drawOrder.join(',') === 'child,root',
  'R3 parent may follow child in declaration while topo and independent drawOrder remain exact');

[
  { t: -20, root: [1, 0, 0, 1, 100, 50], child: [1, 0, 0, 1, 110, 50] },
  { t: 999, root: [1, 0, 0, 1, 119.98, 50], child: [1, 0, 0, 1, 129.98, 59.99] },
  { t: 1000, root: [1, 0, 0, 1, 120, 50], child: [1, 0, 0, 1, 130, 60] },
  { t: 1500, root: [1, 0, 0, 1, 130, 50], child: [1, 0, 0, 1, 140, 60] },
  { t: 2000, root: [1, 0, 0, 1, 140, 50], child: [1, 0, 0, 1, 150, 60] },
  { t: 999999, root: [1, 0, 0, 1, 140, 50], child: [1, 0, 0, 1, 150, 60] }
].forEach(function (sample, index) {
  var frame = T.sampleRig(rigPlan, sample.t);
  closeMatrix(rigPart(frame, 'root').matrix, sample.root, 'R4.' + index + ' root local/world at t=' + sample.t);
  closeMatrix(rigPart(frame, 'child').matrix, sample.child, 'R5.' + index + ' child world at t=' + sample.t);
});
var rigMid = T.sampleRig(rigPlan, 500);
ok(rigMid.parts.map(function (part) { return part.id; }).join(',') === 'child,root' &&
  rigPart(rigMid, 'root').matrix[5] === 50 && rigPart(rigMid, 'child').matrix[5] === 55,
  'R6 sample projects drawOrder; parent motion reaches child while child local motion does not feed back to parent');
close(rigPart(rigMid, 'root').opacity, 0.8, 'R7 root world opacity');
close(rigPart(rigMid, 'child').opacity, 0.4, 'R8 child world opacity multiplies parent and local opacity');
ok(rigMid.parts.every(function (part) { return part.variant === null; }), 'R9 parts without a variant slot sample null');

var pivotPlan = T.normalizeRigPlan({
  parts: [{ id: 'pivoted', parent: null, art: 'ship', pivot: { x: 3, y: -2 },
    rest: { x: 100, y: 60, rotate: 90, scaleX: 2, scaleY: 3, opacity: 1 } }],
  drawOrder: ['pivoted'], tracks: [], variants: [], secondary: []
}, { path: 'pivot.rig', durationMs: 1000 });
closeMatrix(T.sampleRig(pivotPlan, 0).parts[0].matrix, [0, 2, -3, 0, 97, 52],
  'R10 asymmetric pivot and non-uniform scale lock T*T*R*S*T matrix order and SVG [a,b,c,d,e,f] order');

var worldOrderPlan = T.normalizeRigPlan({
  parts: [
    { id: 'child', parent: 'root', art: 'ship', pivot: { x: 0, y: 0 },
      rest: { x: 10, y: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } },
    { id: 'root', parent: null, art: 'ship', pivot: { x: 0, y: 0 },
      rest: { x: 100, y: 50, rotate: 90, scaleX: 1, scaleY: 1, opacity: 1 } }
  ],
  drawOrder: ['child', 'root'], tracks: [], variants: [], secondary: []
}, { path: 'world-order.rig', durationMs: 1000 });
closeMatrix(rigPart(T.sampleRig(worldOrderPlan, 0), 'child').matrix, [0, 1, -1, 0, 100, 60],
  'R11 child world matrix locks Wparent*L (not L*Wparent)');

function rejectsRig(change, needle, msg) {
  var rig = rigFixture();
  change(rig);
  throws(function () { T.normalizeRigPlan(rig, { path: 'mut.rig', durationMs: 2000 }); }, needle, msg);
}
rejectsRig(function (rig) { rig.parts[0].parent = 'missing'; }, '.parts[0].parent', 'R12 missing parent id rejected with leaf path');
rejectsRig(function (rig) { rig.parts[1].parent = 'child'; }, '根', 'R13 mutual parent cycle rejected');
rejectsRig(function (rig) { rig.parts[0].parent = null; }, '恰好一个', 'R14 second null root rejected');
rejectsRig(function (rig) { rig.drawOrder.pop(); }, '.drawOrder', 'R15 drawOrder missing item rejected');
rejectsRig(function (rig) { rig.drawOrder = ['root', 'root']; }, '重复', 'R16 drawOrder duplicate rejected');
rejectsRig(function (rig) { rig.parts[0].rest.scaleY = 0; }, '.parts[0].rest.scaleY', 'R17 scaleY=0 rejected with exact leaf path');
rejectsRig(function (rig) { rig.variants.push({}); }, '.variants[0].target', 'R18 malformed variant slot fails at its missing target');
rejectsRig(function (rig) { rig.secondary.push({}); }, '.secondary[0].type', 'R19 malformed Step 2 secondary rejected at its missing type');
rejectsRig(function (rig) { rig.extra = true; }, '.extra', 'R20 unknown rig root field rejected');
rejectsRig(function (rig) { rig.tracks[0].keys[0].extra = true; }, '.tracks[0].keys[0].extra', 'R21 unknown numeric key field rejected');
rejectsRig(function (rig) { rig.tracks.push(copyRig(rig.tracks[0])); }, '重复', 'R22 duplicate target+property rejected');
rejectsRig(function (rig) { rig.tracks[0].keys[0].value = Infinity; }, '.tracks[0].keys[0].value', 'R23 non-finite track value rejected');
rejectsRig(function (rig) { rig.tracks[0].keys[0].at = 2.001; }, '越过', 'R24 key beyond rig duration rejected');
rejectsRig(function (rig) { rig.tracks[0].keys[0].at = 1.0001; }, '三位', 'R25 over-precise rig key time rejected');
rejectsRig(function (rig) { rig.tracks[0].property = 'scale'; }, '.property', 'R26 flat scale property is not accepted by rig');
throws(function () { T.normalizeRigPlan(rigFixture(), { path: 'budget.rig', durationMs: 60001 }); }, '硬上限', 'R27 rig duration hard budget enforced');
rejectsRig(function (rig) { rig.tracks = new Array(65).fill({}); }, '硬上限 64', 'R28 numeric track hard budget enforced before parsing');
rejectsRig(function (rig) { rig.tracks[0].keys = new Array(513).fill({}); }, '硬上限 512', 'R29 numeric key hard budget enforced before parsing');
rejectsRig(function (rig) { rig.tracks = [{ target: 'root', property: 'opacity', keys: [{ at: 2, value: 0.005 }] }]; }, '终态根 world opacity', 'R30 terminal poster rejects nearly transparent root');
throws(function () { T.sampleRig(rigPlan, NaN); }, 'sampleRig.tMs', 'R31 sampleRig rejects non-finite time');

function variantFixture() {
  var rig = rigFixture();
  rig.variants = [
    { target: 'child', base: 'rest', states: [
      { id: 'alt', art: [{ shape: 'ellipse', cx: 0, cy: 0, rx: 2, ry: 1, fill: '#fff' }] },
      { id: 'O', art: [{ shape: 'ellipse', cx: 0, cy: 0, rx: 1, ry: 2, fill: 'none', stroke: '#fff' }] }
    ], keys: [
      { at: 0.5, value: 'alt' },
      { at: 1, value: 'rest' },
      { at: 1.5, value: 'O' }
    ] },
    { target: 'root', base: 'idle', states: [
      { id: 'alt', art: [{ shape: 'circle', cx: 0, cy: 0, r: 2, fill: '#fff' }] }
    ], keys: [] }
  ];
  return rig;
}
function variantOf(plan, tMs, id) { return rigPart(T.sampleRig(plan, tMs), id).variant; }
function rejectsVariant(change, needle, msg) {
  var rig = variantFixture();
  change(rig);
  throws(function () { T.normalizeRigPlan(rig, { path: 'variant-mut.rig', durationMs: 2000 }); }, needle, msg);
}

var variantAuthor = variantFixture();
var variantPlan = T.normalizeRigPlan(variantAuthor, { path: 'variant.rig', durationMs: 2000 });
ok(variantPlan.variants.length === 2 && Object.isFrozen(variantPlan.variants[0].states[0].art),
  'V1 variant slots/states/keys normalize into deeply read-only plan data');
variantAuthor.variants[0].states[0].art[0].rx = 99;
ok(variantPlan.variants[0].states[0].art[0].rx === 2,
  'V2 variant state art is deep-copied, not retained from author data');
ok(variantPlan.tracks.some(function (track) { return track.target === 'child' && track.property === 'y'; }) &&
  variantPlan.variants[0].target === 'child' && variantPlan.variants[0].states[0].id === variantPlan.variants[1].states[0].id,
  'V3 legal contrast: variant target may also have a transform track and different parts may reuse a state id');
ok(variantOf(variantPlan, 499, 'child') === 'rest' && variantOf(variantPlan, 500, 'child') === 'alt' &&
  variantOf(variantPlan, 501, 'child') === 'alt',
  'V4 discrete key is right-continuous at first key (1ms before/exact/1ms after)');
ok(variantOf(variantPlan, 999, 'child') === 'alt' && variantOf(variantPlan, 1000, 'child') === 'rest' &&
  variantOf(variantPlan, 1001, 'child') === 'rest',
  'V5 later key switches immediately and may return to base');
ok(variantOf(variantPlan, 2000, 'child') === 'O' && variantOf(variantPlan, 999999, 'child') === 'O' &&
  variantOf(variantPlan, 1200, 'root') === 'idle',
  'V6 terminal sample holds the final state while an empty-key slot remains at base');
var variantDirect = JSON.stringify(T.sampleRig(variantPlan, 1500));
[1700, 10, 999, 1500, 500, 1500].forEach(function (t) { T.sampleRig(variantPlan, t); });
ok(JSON.stringify(T.sampleRig(variantPlan, 1500)) === variantDirect &&
  JSON.stringify(T.sampleRig(variantPlan, 1500)) === JSON.stringify(T.sampleRig(variantPlan, 1500)),
  'V7 repeated and out-of-order seeks cannot change variant sampling');

var mouthAuthor = rigFixture();
mouthAuthor.parts[0].id = 'mouth';
mouthAuthor.drawOrder[0] = 'mouth';
mouthAuthor.tracks[1].target = 'mouth';
mouthAuthor.variants = [{ target: 'mouth', base: 'rest', states: [
  { id: 'A', art: 'ship' }, { id: 'O', art: 'lantern' }
], keys: [
  { at: 0.5, value: 'A' }, { at: 1, value: 'O' }, { at: 2, value: 'rest' }
] }];
var mouthPlan = T.normalizeRigPlan(mouthAuthor, { path: 'dialogue.cast[0].rig', durationMs: 2000 });
function mouthAt(tMs) { return variantOf(mouthPlan, tMs, 'mouth'); }
ok(mouthAt(499) === 'rest' && mouthAt(500) === 'A' && mouthAt(501) === 'A' &&
  mouthAt(999) === 'A' && mouthAt(1000) === 'O' && mouthAt(1001) === 'O',
  'MV1 mouth A/O keys are right-continuous at 1ms-before/exact/1ms-after samples');
ok(mouthAt(1999) === 'O' && mouthAt(2000) === 'rest' && mouthAt(2001) === 'rest',
  'MV2 mouth returns to rest exactly at durationMs and remains rest after endpoint clamp');
function sampledMouthAtCadence(stepMs, targetMs) {
  for (var t = 0; t < targetMs; t += stepMs) T.sampleRig(mouthPlan, t);
  return mouthAt(targetMs);
}
ok(sampledMouthAtCadence(1000 / 60, 1333) === mouthAt(1333) &&
  sampledMouthAtCadence(1000 / 120, 1333) === mouthAt(1333),
  'MV3 60Hz and 120Hz access histories produce the same mouth state at the same absolute t');

var singleCastAuthor = variantFixture();
var singleLegacyPlan = T.normalizeRigPlan(singleCastAuthor, { path: 'legacy.rig', durationMs: 2000 });
var singleCastPlan = T.normalizeCastPlan([{ id: 'actor', rig: singleCastAuthor }], {
  path: 'beat.cast', durationMs: 2000
});
ok(singleCastPlan.length === 1 && singleCastPlan[0].id === 'actor' &&
  Object.isFrozen(singleCastPlan) && Object.isFrozen(singleCastPlan[0]) && Object.isFrozen(singleCastPlan[0].rig),
  'CST1 normalizeCastPlan preserves member order and deeply freezes the container');
ok([-20, 0, 500, 2000, 999999].every(function (tMs) {
  return JSON.stringify(T.sampleRig(singleCastPlan[0].rig, tMs)) === JSON.stringify(T.sampleRig(singleLegacyPlan, tMs));
}), 'CST2 single cast matrix/opacity/variant equals the legacy single-rig fixture at t=0/key/end/out-of-range');
singleCastAuthor.parts[0].rest.x = 999;
ok(singleCastPlan[0].rig.parts[0].rest.x === 10,
  'CST3 cast normalization retains per-rig deep-copy semantics');
ok(Object.keys(singleCastPlan[0]).join(',') === 'id,rig' &&
  JSON.stringify(singleCastPlan) === JSON.stringify([{ id: 'actor', rig: singleLegacyPlan }]),
  'CST3a omitted stage preserves the legacy normalized member bytes and identity behavior');

var mirrorStageAuthor = { facing: 'mirror-x' };
var mirrorCastPlan = T.normalizeCastPlan([{ id: 'actor', stage: mirrorStageAuthor, rig: variantFixture() }], {
  path: 'mirror.cast', durationMs: 2000
});
mirrorStageAuthor.facing = 'as-authored';
ok(mirrorCastPlan[0].stage.facing === 'mirror-x' && Object.isFrozen(mirrorCastPlan[0].stage),
  'CST3b explicit mirror-x stage is copied and deeply frozen');
var authoredCastPlan = T.normalizeCastPlan([{ id: 'actor', stage: { facing: 'as-authored' }, rig: variantFixture() }], {
  path: 'authored.cast', durationMs: 2000
});
ok(authoredCastPlan[0].stage.facing === 'as-authored' &&
  Object.keys(authoredCastPlan[0].stage).join(',') === 'facing',
  'CST3c explicit as-authored stage remains a legal identity facing and omitted enter/exit add no normalized fields');
throws(function () { T.normalizeCastPlan([{ id: 'actor', stage: { facing: 'left' }, rig: rigFixture() }], {
  path: 'bad.cast', durationMs: 2000
}); }, 'bad.cast[0].stage.facing', 'CST3d unknown stage facing is rejected at the enum leaf');
throws(function () { T.normalizeCastPlan([{ id: 'actor', stage: { facing: 'mirror-x', extra: true }, rig: rigFixture() }], {
  path: 'bad.cast', durationMs: 2000
}); }, 'bad.cast[0].stage.extra', 'CST3e unknown stage field is rejected');
throws(function () { T.normalizeCastPlan([{ id: 'actor', stage: {}, rig: rigFixture() }], {
  path: 'bad.cast', durationMs: 2000
}); }, 'bad.cast[0].stage.facing', 'CST3f stage facing is required when stage is present');
throws(function () { T.normalizeCastPlan([{ id: 'actor', stage: 'mirror-x', rig: rigFixture() }], {
  path: 'bad.cast', durationMs: 2000
}); }, 'bad.cast[0].stage', 'CST3g non-object stage is rejected');

var enterStageAuthor = { facing: 'mirror-x', enter: {
  offset: { x: 64, y: -18 }, dur: 0.6
} };
var enterCastPlan = T.normalizeCastPlan([{ id: 'actor', stage: enterStageAuthor, rig: rigFixture() }], {
  path: 'enter.cast', durationMs: 2000
});
enterStageAuthor.enter.offset.x = 1;
enterStageAuthor.enter.dur = 1;
ok(enterCastPlan[0].stage.facing === 'mirror-x' && enterCastPlan[0].stage.enter.offset.x === 64 &&
  enterCastPlan[0].stage.enter.offset.y === -18 && enterCastPlan[0].stage.enter.durationMs === 600 &&
  enterCastPlan[0].stage.enter.ease === 'ease-out' && !Object.prototype.hasOwnProperty.call(enterCastPlan[0].stage, 'exit') &&
  Object.isFrozen(enterCastPlan[0].stage.enter) && Object.isFrozen(enterCastPlan[0].stage.enter.offset),
  'C3b-T1 stage.enter is unchanged/additive when exit is omitted, deep-copied/frozen, and defaults to ease-out');
throws(function () { T.normalizeCastPlan([{ id: 'actor', stage: {
  enter: { offset: { x: 320, y: -180 }, dur: 2, ease: 'linear' }
}, rig: rigFixture() }], { path: 'enter-only.cast', durationMs: 2000 }); },
  'enter-only.cast[0].stage.facing', 'C3b-T2 enter-only stage rejects at the complete required facing path');
var boundaryPlan = T.normalizeCastPlan([{ id: 'actor', stage: { facing: 'as-authored',
  enter: { offset: { x: 320, y: -180 }, dur: 2, ease: 'linear' }
}, rig: rigFixture() }], { path: 'boundary.cast', durationMs: 2000 });
ok(boundaryPlan[0].stage.facing === 'as-authored' && boundaryPlan[0].stage.enter.offset.x === 320 &&
  boundaryPlan[0].stage.enter.offset.y === -180,
  'C3b-T2b exact 320x180 offset boundaries remain legal with required facing');
var enterPlan = enterCastPlan[0].stage.enter;
var enterStart = T.sampleStageEnter(enterPlan, 0);
var enterMid = T.sampleStageEnter(enterPlan, 300);
var enterEnd = T.sampleStageEnter(enterPlan, 600);
var enterBefore = T.sampleStageEnter(enterPlan, -999);
var enterAfter = T.sampleStageEnter(enterPlan, 999999);
var enterMidProgress = T.EASING['ease-out'](0.5);
ok(enterStart.offset.x === 64 && enterStart.offset.y === -18 && enterStart.opacity === 0 &&
  enterBefore.offset.x === 64 && enterBefore.offset.y === -18 && enterBefore.opacity === 0,
  'C3b-T3 t=0 and negative time clamp to the authored offset with zero opacity');
close(enterMid.offset.x, 64 * (1 - enterMidProgress), 'C3b-T4 midpoint x follows existing ease-out');
close(enterMid.offset.y, -18 * (1 - enterMidProgress), 'C3b-T5 midpoint y follows existing ease-out');
close(enterMid.opacity, enterMidProgress, 'C3b-T6 midpoint opacity follows the same easing');
ok(enterEnd.offset.x === 0 && enterEnd.offset.y === 0 && enterEnd.opacity === 1 &&
  enterAfter.offset.x === 0 && enterAfter.offset.y === 0 && enterAfter.opacity === 1,
  'C3b-T7 exact end and post-end clamp to the completed state');

function rejectsEnter(change, needle, msg) {
  var member = { id: 'actor', stage: { facing: 'as-authored', enter: {
    offset: { x: 64, y: 0 }, dur: 0.6, ease: 'ease-out'
  } }, rig: rigFixture() };
  change(member);
  throws(function () { T.normalizeCastPlan([member], { path: 'bad-enter.cast', durationMs: 2000 }); }, needle, msg);
}
rejectsEnter(function (member) { member.stage.enter = null; }, 'bad-enter.cast[0].stage.enter', 'C3b-T8 enter must be an object');
rejectsEnter(function (member) { delete member.stage.enter.offset; }, 'bad-enter.cast[0].stage.enter.offset', 'C3b-T9 missing offset reports its complete path');
rejectsEnter(function (member) { member.stage.enter.offset = []; }, 'bad-enter.cast[0].stage.enter.offset', 'C3b-T10 offset array is rejected as a bad shape');
rejectsEnter(function (member) { member.stage.enter.offset.extra = 1; }, 'bad-enter.cast[0].stage.enter.offset.extra', 'C3b-T11 unknown offset field reports its leaf');
rejectsEnter(function (member) { delete member.stage.enter.offset.x; }, 'bad-enter.cast[0].stage.enter.offset.x', 'C3b-T12 missing offset.x reports its leaf');
rejectsEnter(function (member) { delete member.stage.enter.offset.y; }, 'bad-enter.cast[0].stage.enter.offset.y', 'C3b-T13 missing offset.y reports its leaf');
rejectsEnter(function (member) { member.stage.enter.offset.x = NaN; }, 'bad-enter.cast[0].stage.enter.offset.x', 'C3b-T14 non-finite offset.x is rejected');
rejectsEnter(function (member) { member.stage.enter.offset.y = Infinity; }, 'bad-enter.cast[0].stage.enter.offset.y', 'C3b-T15 non-finite offset.y is rejected');
rejectsEnter(function (member) { member.stage.enter.offset.x = 320.001; }, 'bad-enter.cast[0].stage.enter.offset.x', 'C3b-T16 x beyond the 320-wide stage is rejected');
rejectsEnter(function (member) { member.stage.enter.offset.y = -180.001; }, 'bad-enter.cast[0].stage.enter.offset.y', 'C3b-T17 y beyond the 180-high stage is rejected');
rejectsEnter(function (member) { delete member.stage.enter.dur; }, 'bad-enter.cast[0].stage.enter.dur', 'C3b-T18 missing dur reports its leaf');
rejectsEnter(function (member) { member.stage.enter.dur = 0; }, 'bad-enter.cast[0].stage.enter.dur', 'C3b-T19 zero dur is rejected');
rejectsEnter(function (member) { member.stage.enter.dur = Infinity; }, 'bad-enter.cast[0].stage.enter.dur', 'C3b-T20 non-finite dur is rejected');
rejectsEnter(function (member) { member.stage.enter.dur = 0.6001; }, 'bad-enter.cast[0].stage.enter.dur', 'C3b-T21 dur uses the exact integer-ms rule');
rejectsEnter(function (member) { member.stage.enter.dur = 2.001; }, 'bad-enter.cast[0].stage.enter.dur', 'C3b-T22 enter dur beyond beat duration is rejected');
rejectsEnter(function (member) { member.stage.enter.ease = 1; }, 'bad-enter.cast[0].stage.enter.ease', 'C3b-T23 non-string ease is rejected');
rejectsEnter(function (member) { member.stage.enter.ease = 'spring'; }, 'bad-enter.cast[0].stage.enter.ease', 'C3b-T24 unknown ease reuses the existing easing enum');
rejectsEnter(function (member) { member.stage.enter.ease = undefined; }, 'bad-enter.cast[0].stage.enter.ease', 'C3b-T24b explicit undefined ease is a bad shape rather than the omitted ease-out default');
rejectsEnter(function (member) { member.stage.enter.extra = true; }, 'bad-enter.cast[0].stage.enter.extra', 'C3b-T25 unknown enter field reports its leaf');

var exitStageAuthor = { facing: 'mirror-x', exit: {
  offset: { x: 64, y: 18 }, dur: 0.6
} };
var exitCastPlan = T.normalizeCastPlan([{ id: 'actor', stage: exitStageAuthor, rig: rigFixture() }], {
  path: 'exit.cast', durationMs: 2000
});
exitStageAuthor.exit.offset.x = 1;
exitStageAuthor.exit.dur = 1;
var exitPlan = exitCastPlan[0].stage.exit;
ok(exitCastPlan[0].stage.facing === 'mirror-x' && exitPlan.offset.x === 64 && exitPlan.offset.y === 18 &&
  exitPlan.durationMs === 600 && exitPlan.startMs === 1400 && exitPlan.ease === 'ease-in' &&
  Object.isFrozen(exitCastPlan[0].stage) && Object.isFrozen(exitPlan) && Object.isFrozen(exitPlan.offset),
  'C3c-T1 stage.exit is deep-copied/deep-frozen, derives its tail start, and defaults to ease-in');
var exitBoundaryPlan = T.normalizeCastPlan([{ id: 'actor', stage: { facing: 'as-authored',
  exit: { offset: { x: 320, y: -180 }, dur: 2, ease: 'linear' }
}, rig: rigFixture() }], { path: 'exit-boundary.cast', durationMs: 2000 });
ok(exitBoundaryPlan[0].stage.exit.offset.x === 320 && exitBoundaryPlan[0].stage.exit.offset.y === -180 &&
  exitBoundaryPlan[0].stage.exit.startMs === 0,
  'C3c-T2 exact offset and full-beat duration boundaries are legal');

var exitBefore = T.sampleStageExit(exitPlan, -999);
var exitStart = T.sampleStageExit(exitPlan, 1400);
var exitMid = T.sampleStageExit(exitPlan, 1700);
var exitEnd = T.sampleStageExit(exitPlan, 2000);
var exitAfter = T.sampleStageExit(exitPlan, 999999);
var exitMidProgress = T.EASING['ease-in'](0.5);
ok(exitBefore.offset.x === 0 && exitBefore.offset.y === 0 && exitBefore.opacity === 1 &&
  exitStart.offset.x === 0 && exitStart.offset.y === 0 && exitStart.opacity === 1,
  'C3c-T3 before and at the derived tail window start remain at identity and fully visible');
close(exitMid.offset.x, 64 * exitMidProgress, 'C3c-T4 midpoint x follows ease-in toward the authored offset');
close(exitMid.offset.y, 18 * exitMidProgress, 'C3c-T5 midpoint y follows ease-in toward the authored offset');
close(exitMid.opacity, 1 - exitMidProgress, 'C3c-T6 midpoint opacity follows the inverse easing');
ok(exitEnd.offset.x === 64 && exitEnd.offset.y === 18 && exitEnd.opacity === 0 &&
  exitAfter.offset.x === 64 && exitAfter.offset.y === 18 && exitAfter.opacity === 0,
  'C3c-T7 exact endpoint and post-end hold the authored offset at zero opacity');

function rejectsExit(change, needle, msg) {
  var member = { id: 'actor', stage: { facing: 'as-authored', exit: {
    offset: { x: 64, y: 0 }, dur: 0.6, ease: 'ease-in'
  } }, rig: rigFixture() };
  change(member);
  throws(function () { T.normalizeCastPlan([member], { path: 'bad-exit.cast', durationMs: 2000 }); }, needle, msg);
}
rejectsExit(function (member) { member.stage.exit = null; }, 'bad-exit.cast[0].stage.exit', 'C3c-T8 exit must be an object');
rejectsExit(function (member) { delete member.stage.exit.offset; }, 'bad-exit.cast[0].stage.exit.offset', 'C3c-T9 missing offset reports its complete path');
rejectsExit(function (member) { member.stage.exit.offset = []; }, 'bad-exit.cast[0].stage.exit.offset', 'C3c-T10 offset array is rejected');
rejectsExit(function (member) { member.stage.exit.offset.extra = 1; }, 'bad-exit.cast[0].stage.exit.offset.extra', 'C3c-T11 unknown offset field reports its leaf');
rejectsExit(function (member) { delete member.stage.exit.offset.x; }, 'bad-exit.cast[0].stage.exit.offset.x', 'C3c-T12 missing offset.x reports its leaf');
rejectsExit(function (member) { delete member.stage.exit.offset.y; }, 'bad-exit.cast[0].stage.exit.offset.y', 'C3c-T13 missing offset.y reports its leaf');
rejectsExit(function (member) { member.stage.exit.offset.x = NaN; }, 'bad-exit.cast[0].stage.exit.offset.x', 'C3c-T14 non-finite offset.x is rejected');
rejectsExit(function (member) { member.stage.exit.offset.y = Infinity; }, 'bad-exit.cast[0].stage.exit.offset.y', 'C3c-T15 non-finite offset.y is rejected');
rejectsExit(function (member) { member.stage.exit.offset.x = 320.001; }, 'bad-exit.cast[0].stage.exit.offset.x', 'C3c-T16 x beyond the stage boundary is rejected');
rejectsExit(function (member) { member.stage.exit.offset.y = -180.001; }, 'bad-exit.cast[0].stage.exit.offset.y', 'C3c-T17 y beyond the stage boundary is rejected');
rejectsExit(function (member) { delete member.stage.exit.dur; }, 'bad-exit.cast[0].stage.exit.dur', 'C3c-T18 missing dur reports its leaf');
rejectsExit(function (member) { member.stage.exit.dur = 0; }, 'bad-exit.cast[0].stage.exit.dur', 'C3c-T19 zero dur is rejected');
rejectsExit(function (member) { member.stage.exit.dur = Infinity; }, 'bad-exit.cast[0].stage.exit.dur', 'C3c-T20 non-finite dur is rejected');
rejectsExit(function (member) { member.stage.exit.dur = 0.6001; }, 'bad-exit.cast[0].stage.exit.dur', 'C3c-T21 dur uses the exact integer-ms rule');
rejectsExit(function (member) { member.stage.exit.dur = 2.001; }, 'bad-exit.cast[0].stage.exit.dur', 'C3c-T22 exit dur beyond beat duration is rejected');
rejectsExit(function (member) { member.stage.exit.ease = 1; }, 'bad-exit.cast[0].stage.exit.ease', 'C3c-T23 non-string ease is rejected');
rejectsExit(function (member) { member.stage.exit.ease = 'spring'; }, 'bad-exit.cast[0].stage.exit.ease', 'C3c-T24 unknown ease reuses the existing easing enum');
rejectsExit(function (member) { member.stage.exit.ease = undefined; }, 'bad-exit.cast[0].stage.exit.ease', 'C3c-T25 explicit undefined ease is not the omitted default');
rejectsExit(function (member) { member.stage.exit.at = 1.4; }, 'bad-exit.cast[0].stage.exit.at', 'C3c-T26 exit is closed and rejects author-supplied at');
rejectsExit(function (member) { member.stage.exit.extra = true; }, 'bad-exit.cast[0].stage.exit.extra', 'C3c-T27 exit rejects every unknown field');

var touchingStage = T.normalizeCastPlan([{ id: 'actor', stage: { facing: 'as-authored',
  enter: { offset: { x: -64, y: 0 }, dur: 1.4 },
  exit: { offset: { x: 64, y: 0 }, dur: 0.6 }
}, rig: rigFixture() }], { path: 'touching.cast', durationMs: 2000 })[0].stage;
ok(touchingStage.enter.durationMs === touchingStage.exit.startMs && touchingStage.exit.startMs === 1400,
  'C3c-T28 enter and exit may meet exactly at the derived tail-window boundary');
throws(function () { T.normalizeCastPlan([{ id: 'actor', stage: { facing: 'as-authored',
  enter: { offset: { x: -64, y: 0 }, dur: 1.401 },
  exit: { offset: { x: 64, y: 0 }, dur: 0.6 }
}, rig: rigFixture() }], { path: 'overlap.cast', durationMs: 2000 }); },
  'overlap.cast[0].stage.exit.dur', 'C3c-T29 a 1ms enter/exit overlap is rejected at the exit duration path');
throws(function () { T.sampleStageExit({ offset: { x: 64, y: 0 }, durationMs: 600,
  startMs: 1400, ease: 'ease-in', at: 1400 }, 1500); }, 'sampleStageExit',
  'C3c-T30 sampler defensively rejects a non-normalized exit plan');

throws(function () { T.normalizeCastPlan([], { path: 'bad.cast', durationMs: 2000 }); }, 'bad.cast',
  'CST4 empty cast is rejected');
throws(function () { T.normalizeCastPlan([{ id: 'same', rig: rigFixture() }, { id: 'same', rig: rigFixture() }], {
  path: 'bad.cast', durationMs: 2000
}); }, 'bad.cast[1].id', 'CST5 duplicate cast id is rejected at the second member');
throws(function () { T.normalizeCastPlan([{ id: 'actor', rig: rigFixture(), extra: true }], {
  path: 'bad.cast', durationMs: 2000
}); }, 'bad.cast[0].extra', 'CST6 unknown cast member field is rejected');
throws(function () { T.normalizeCastPlan([{ id: 'actor', rig: (function () {
  var rig = rigFixture(); rig.parts[0].parent = 'missing'; return rig;
})() }], { path: 'bad.cast', durationMs: 2000 }); }, 'bad.cast[0].rig.parts[0].parent',
  'CST7 every per-rig P0 is preserved with the full cast member path');

function aggregateRig(options, seed) {
  options = options || {};
  seed = seed || 0;
  var trackCount = options.tracks || (options.numericKeys ? 1 : 0);
  var variantCount = options.variants || ((options.states || options.variantKeys) ? 1 : 0);
  var secondaryCount = options.secondary || 0;
  var partCount = Math.max(options.parts || 1, Math.ceil(trackCount / 6), variantCount,
    Math.ceil(secondaryCount / 3), 1);
  var parts = [];
  for (var i = 0; i < partCount; i++) parts.push({
    id: 'p' + i,
    parent: i === 0 ? null : 'p0',
    art: 'ship',
    pivot: { x: 0, y: 0 },
    rest: { x: i === 0 ? 80 + seed * 20 : 0, y: i === 0 ? 60 : 0,
      rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 }
  });
  var properties = ['x', 'y', 'rotate', 'scaleX', 'scaleY', 'opacity'];
  var numericKeyCount = options.numericKeys == null ? trackCount : options.numericKeys;
  var tracks = [];
  for (var ti = 0; ti < trackCount; ti++) {
    var keysForTrack = Math.floor(numericKeyCount / trackCount) + (ti < numericKeyCount % trackCount ? 1 : 0);
    var property = properties[ti % properties.length];
    var keys = [];
    for (var ki = 0; ki < keysForTrack; ki++) keys.push({
      at: (ki + 1) / 1000,
      value: property === 'opacity' ? 0.9 : (property === 'scaleX' || property === 'scaleY' ? 1 : 0)
    });
    tracks.push({ target: 'p' + Math.floor(ti / properties.length), property: property, keys: keys });
  }
  var stateTotal = options.states == null ? variantCount : options.states;
  var variantKeyTotal = options.variantKeys || 0;
  var variants = [];
  for (var vi = 0; vi < variantCount; vi++) {
    var stateCount = Math.floor(stateTotal / variantCount) + (vi < stateTotal % variantCount ? 1 : 0);
    var states = [];
    for (var si = 0; si < stateCount; si++) states.push({ id: 's' + si, art: 'ship' });
    var slotKeys = Math.floor(variantKeyTotal / variantCount) + (vi < variantKeyTotal % variantCount ? 1 : 0);
    var variantKeys = [];
    for (var vki = 0; vki < slotKeys; vki++) variantKeys.push({ at: (vki + 1) / 1000, value: 's0' });
    variants.push({ target: 'p' + vi, base: 'base', states: states, keys: variantKeys });
  }
  var secondary = [];
  var secondaryProperties = ['x', 'y', 'rotate'];
  for (var qi = 0; qi < secondaryCount; qi++) secondary.push({
    type: 'noise', target: 'p' + Math.floor(qi / secondaryProperties.length),
    property: secondaryProperties[qi % secondaryProperties.length], windowMs: 100, amplitude: 0.1, seed: qi + seed * 100
  });
  return { parts: parts, drawOrder: parts.map(function (part) { return part.id; }),
    tracks: tracks, variants: variants, secondary: secondary };
}
function aggregateCast(rigs) {
  return rigs.map(function (rig, i) { return { id: 'actor' + i, rig: rig }; });
}
function rejectsCastBudget(rigs, needle, msg) {
  throws(function () { T.normalizeCastPlan(aggregateCast(rigs), { path: 'budget.cast', durationMs: 2000 }); }, needle, msg);
}
rejectsCastBudget([aggregateRig({}, 0), aggregateRig({}, 1), aggregateRig({}, 2), aggregateRig({}, 3), aggregateRig({}, 4)],
  '硬上限 4', 'CST8 cast member aggregate budget is enforced');
rejectsCastBudget([aggregateRig({ parts: 22 }, 0), aggregateRig({ parts: 22 }, 1), aggregateRig({ parts: 22 }, 2)],
  'parts', 'CST9 parts aggregate budget is enforced');
rejectsCastBudget([aggregateRig({ tracks: 49 }, 0), aggregateRig({ tracks: 49 }, 1)],
  'numeric tracks', 'CST10 numeric tracks aggregate budget is enforced');
rejectsCastBudget([aggregateRig({ numericKeys: 257 }, 0), aggregateRig({ numericKeys: 257 }, 1)],
  'numeric keys', 'CST11 numeric keys aggregate budget is enforced');
rejectsCastBudget([aggregateRig({ variants: 6 }, 0), aggregateRig({ variants: 6 }, 1), aggregateRig({ variants: 6 }, 2)],
  'variant slots', 'CST12 variant slots aggregate budget is enforced');
rejectsCastBudget([aggregateRig({ states: 25 }, 0), aggregateRig({ states: 25 }, 1)],
  'variant states', 'CST13 variant states aggregate budget is enforced');
rejectsCastBudget([aggregateRig({ variantKeys: 97 }, 0), aggregateRig({ variantKeys: 97 }, 1)],
  'variant keys', 'CST14 variant keys aggregate budget is enforced');
rejectsCastBudget([aggregateRig({ secondary: 11 }, 0), aggregateRig({ secondary: 11 }, 1), aggregateRig({ secondary: 11 }, 2)],
  'secondary', 'CST15 secondary aggregate budget is enforced');

rejectsVariant(function (rig) { rig.variants[0].keys[0].value = 'missing'; }, '.keys[0].value',
  'V8 key referencing an undeclared state is rejected');
rejectsVariant(function (rig) { rig.variants[0].states[0].id = 'rest'; }, '.states[0].id',
  'V9 state id matching base is rejected');
rejectsVariant(function (rig) { rig.variants.push(copyRig(rig.variants[0])); }, '.variants[2].target',
  'V10 two slots for one target are rejected');
rejectsVariant(function (rig) { rig.variants[0].states[0].art = []; }, '.states[0].art',
  'V11 empty variant state art is rejected');
rejectsVariant(function (rig) { rig.variants[0].states[0].art = '<svg>'; }, '.states[0].art',
  'V12 injected variant state art is rejected');
rejectsVariant(function (rig) { rig.variants[0].keys[0].ease = 'linear'; }, '.keys[0].ease',
  'V13 variant key rejects ease and every other unknown field');
rejectsVariant(function (rig) { rig.variants = new Array(9).fill(null); }, '硬上限 8',
  'V14 variant slot hard budget is enforced before parsing');
rejectsVariant(function (rig) { rig.variants[0].states = new Array(33).fill(null); }, '硬上限 32',
  'V15 variant state hard budget is enforced before parsing');
rejectsVariant(function (rig) { rig.variants[0].keys = new Array(129).fill(null); }, '硬上限 128',
  'V16 variant key hard budget is enforced before parsing');
rejectsVariant(function (rig) { rig.variants[0].states = []; }, '.states',
  'V17 variant states must be non-empty');
rejectsVariant(function (rig) { rig.variants[0].keys[0].at = 0; }, '.keys[0].at',
  'V18 variant key at=0 is rejected');
rejectsVariant(function (rig) { rig.variants[0].keys[1].at = 0.5; }, '.keys[1].at',
  'V19 variant key times must be strictly increasing');
rejectsVariant(function (rig) { rig.variants[0].keys[0].at = 0.5001; }, '三位',
  'V20 variant key time precision matches numeric tracks');
rejectsVariant(function (rig) { rig.variants[0].keys[2].at = 2.001; }, '越过',
  'V21 variant key may not cross beat duration');

function secondaryFixture() {
  function part(id, parent, x) {
    return { id: id, parent: parent, art: 'ship', pivot: { x: 0, y: 0 },
      rest: { x: x, y: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } };
  }
  return {
    parts: [
      { id: 'root', parent: null, art: 'figure', pivot: { x: 0, y: 0 },
        rest: { x: 100, y: 50, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } },
      part('source', 'root', 0),
      part('hair', 'root', 10),
      part('breath', 'root', 20),
      part('eyes', 'root', 30),
      part('jitter', 'root', 20)
    ],
    drawOrder: ['source', 'hair', 'breath', 'eyes', 'jitter', 'root'],
    tracks: [
      { target: 'source', property: 'rotate', keys: [
        { at: 1, value: 20, ease: 'linear' },
        { at: 4, value: 30, ease: 'linear' }
      ] },
      { target: 'breath', property: 'scaleY', keys: [
        { at: 2, value: 1.05, ease: 'linear' },
        { at: 4, value: 1, ease: 'linear' }
      ] },
      { target: 'jitter', property: 'x', keys: [
        { at: 2, value: 21, ease: 'linear' },
        { at: 4, value: 20, ease: 'linear' }
      ] }
    ],
    variants: [],
    secondary: [
      { type: 'follow', source: { target: 'source', property: 'rotate' },
        target: 'hair', property: 'rotate', delayMs: 100, gain: 0.5, min: -8, max: 8 },
      { type: 'oscillate', target: 'breath', property: 'scaleY',
        periodMs: 1000, amplitude: 0.1, phase: 0.25 },
      { type: 'blink', target: 'eyes', property: 'scaleY', closedValue: 0.08,
        windowMs: 1000, durationMs: 100, chance: 1, seed: 19088743 },
      { type: 'noise', target: 'jitter', property: 'x',
        windowMs: 600, amplitude: 0.25, seed: 2309737967 },
      // source 自己也有 secondary；follow 必须忽略它，只读 source primary。
      { type: 'noise', target: 'source', property: 'rotate',
        windowMs: 400, amplitude: 1, seed: 324508639 }
    ]
  };
}
function normalizeSecondaryFixture() {
  return T.normalizeRigPlan(secondaryFixture(), { path: 'secondary.rig', durationMs: 4000 });
}
function rigAngle(frame, id) {
  var matrix = rigPart(frame, id).matrix;
  return Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI;
}
function primaryValue(plan, target, property, tMs) {
  for (var i = 0; i < plan.tracks.length; i++) {
    var track = plan.tracks[i];
    if (track.target === target && track.property === property) return T.sampleTrack(track, tMs);
  }
  for (var j = 0; j < plan.parts.length; j++) if (plan.parts[j].id === target) return plan.parts[j].rest[property];
  throw new Error('test primary target missing: ' + target);
}
function specUnitHash(seed, index, salt) {
  var x = (seed ^ Math.imul((index + 1) >>> 0, 0x9e3779b1)
                ^ Math.imul((salt + 1) >>> 0, 0x85ebca6b)) >>> 0;
  x = Math.imul((x ^ (x >>> 16)) >>> 0, 0x7feb352d) >>> 0;
  x = Math.imul((x ^ (x >>> 15)) >>> 0, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

var secondaryPlan = normalizeSecondaryFixture();
ok(secondaryPlan.secondary.length === 5 && Object.isFrozen(secondaryPlan.secondary[0].source),
  'S1 all four secondary types normalize into deeply read-only plan data');
ok(secondaryPlan.tracks.some(function (track) { return track.target === 'breath' && track.property === 'scaleY'; }) &&
  secondaryPlan.secondary.some(function (item) { return item.target === 'breath' && item.property === 'scaleY'; }),
  'S2 legal contrast: a primary track and one additive secondary may share target+property');

var followEarly = T.sampleRig(secondaryPlan, 50);
close(rigAngle(followEarly, 'hair'), -0.5,
  'S3 follow clamps t-delay<0 to t=0 and reads source primary only (source secondary cannot drive it)');
ok(Math.abs(rigAngle(followEarly, 'source') - 1) > 1e-6,
  'S4 fixture source secondary is active, so S3 distinguishes primary-only from secondary-driven follow');

var noiseBoundary = 600;
var noiseIndex = Math.floor(noiseBoundary / 600);
var noiseR = 2 * specUnitHash(2309737967, noiseIndex, 0) - 1;
var expectedNoiseX = 100 + primaryValue(secondaryPlan, 'jitter', 'x', noiseBoundary) + 0.25 * noiseR;
close(rigPart(T.sampleRig(secondaryPlan, noiseBoundary), 'jitter').matrix[4], expectedNoiseX,
  'S5 noise window boundary uses exact unitHash constants and shared adjacent sample');
var noiseAt750 = (function () {
  var t = 750, n = Math.floor(t / 600), u = (t - n * 600) / 600, q = u * u * (3 - 2 * u);
  var r0 = 2 * specUnitHash(2309737967, n, 0) - 1;
  var r1 = 2 * specUnitHash(2309737967, n + 1, 0) - 1;
  return 100 + primaryValue(secondaryPlan, 'jitter', 'x', t) + 0.25 * (r0 + (r1 - r0) * q);
})();
close(rigPart(T.sampleRig(secondaryPlan, 750), 'jitter').matrix[4], noiseAt750,
  'S6 noise smoothstep sample locks exact hash/mixing formula');

var blinkStart = Math.floor(specUnitHash(19088743, 0, 1) * (1000 - 100 + 1));
ok(blinkStart > 0 && rigPart(T.sampleRig(secondaryPlan, blinkStart - 1), 'eyes').matrix[3] === 1,
  'S7 blink is open immediately before the seeded half-open interval');
close(rigPart(T.sampleRig(secondaryPlan, blinkStart), 'eyes').matrix[3], 0.08,
  'S8 blink closes exactly at seeded interval start');
close(rigPart(T.sampleRig(secondaryPlan, blinkStart + 99.999), 'eyes').matrix[3], 0.08,
  'S9 blink remains closed immediately before interval end');
close(rigPart(T.sampleRig(secondaryPlan, blinkStart + 100), 'eyes').matrix[3], 1,
  'S10 blink opens exactly at half-open interval end');

function sampleSequence(times) {
  var plan = normalizeSecondaryFixture(), frame = null;
  times.forEach(function (t) { frame = T.sampleRig(plan, t); });
  return JSON.stringify(frame);
}
function cadence(step, target) {
  var times = [];
  for (var t = 0; t < target; t += step) times.push(t);
  times.push(target);
  return times;
}
var deterministicTarget = 1733;
var directBytes = sampleSequence([deterministicTarget]);
ok(sampleSequence(cadence(17, deterministicTarget)) === directBytes,
  'S11 sequential playback last value equals direct sampleRig(t)');
ok(sampleSequence([3500, 17, 2100, 600, deterministicTarget]) === directBytes,
  'S12 out-of-order seek history cannot change sampleRig(t)');
ok(sampleSequence(cadence(1000 / 60, deterministicTarget)) === directBytes,
  'S13 simulated 60Hz access sequence has the same value at t');
ok(sampleSequence(cadence(1000 / 120, deterministicTarget)) === directBytes,
  'S14 simulated 120Hz access sequence has the same value at t');
ok(JSON.stringify(T.sampleRig(secondaryPlan, 877)) === JSON.stringify(T.sampleRig(secondaryPlan, 877)),
  'S15 same plan/seed/time repeats byte-identically (Math.random mutation detector)');
var sameSeedPlan = normalizeSecondaryFixture();
ok([0, 199, 600, 877, 1501].every(function (t) {
  return JSON.stringify(T.sampleRig(secondaryPlan, t)) === JSON.stringify(T.sampleRig(sameSeedPlan, t));
}), 'S16 separately normalized plans with the same seeds are strictly identical');
var differentSeedRig = secondaryFixture();
differentSeedRig.secondary[3].seed = 2309737968;
var differentSeedPlan = T.normalizeRigPlan(differentSeedRig, { path: 'different-seed.rig', durationMs: 4000 });
ok([0, 199, 600, 877, 1501].some(function (t) {
  return rigPart(T.sampleRig(secondaryPlan, t), 'jitter').matrix[4] !==
    rigPart(T.sampleRig(differentSeedPlan, t), 'jitter').matrix[4];
}), 'S17 changing seed changes at least one sample in the test window');

var primaryOnlyAuthor = secondaryFixture();
primaryOnlyAuthor.secondary = [];
var primaryOnlyPlan = T.normalizeRigPlan(primaryOnlyAuthor, { path: 'primary-only.rig', durationMs: 4000 });
var primaryTerminalBytes = JSON.stringify(T.sampleRig(primaryOnlyPlan, 4000));
var terminalBytes = JSON.stringify(T.sampleRig(secondaryPlan, 4000));
ok(terminalBytes === primaryTerminalBytes &&
  terminalBytes === JSON.stringify(T.sampleRig(secondaryPlan, 999999)),
  'S18 exact endpoint and clamped post-end sample disable all secondary for deterministic poster');
ok(JSON.stringify(T.sampleRig(secondaryPlan, 3999.999)) !== terminalBytes,
  'S19 endpoint shutdown is exact rather than an early terminal clamp');

function rejectsSecondary(change, needle, msg) {
  var rig = secondaryFixture();
  change(rig);
  throws(function () { T.normalizeRigPlan(rig, { path: 'secondary-mut.rig', durationMs: 4000 }); }, needle, msg);
}
rejectsSecondary(function (rig) { delete rig.secondary[2].seed; }, '.secondary[2].seed', 'S20 blink missing seed rejected');
rejectsSecondary(function (rig) { delete rig.secondary[3].seed; }, '.secondary[3].seed', 'S21 noise missing seed rejected');
rejectsSecondary(function (rig) { rig.secondary[3].seed = 1.5; }, '.secondary[3].seed', 'S22 fractional seed rejected');
rejectsSecondary(function (rig) { rig.secondary[1].periodMs = 0; }, '.secondary[1].periodMs', 'S23 oscillate periodMs=0 rejected');
rejectsSecondary(function (rig) { rig.secondary[2].windowMs = 0; }, '.secondary[2].windowMs', 'S24 blink windowMs=0 rejected');
rejectsSecondary(function (rig) { rig.secondary[3].windowMs = 0; }, '.secondary[3].windowMs', 'S25 noise windowMs=0 rejected');
rejectsSecondary(function (rig) { rig.secondary[0].source.target = 'missing'; }, '.secondary[0].source.target', 'S26 missing follow source part rejected');
rejectsSecondary(function (rig) {
  rig.secondary.push({ type: 'noise', target: 'breath', property: 'scaleY', windowMs: 100, amplitude: 0.1, seed: 1 });
}, '最多声明一个', 'S27 two secondary claiming one target+property rejected');
rejectsSecondary(function (rig) {
  rig.parts.filter(function (part) { return part.id === 'breath'; })[0].rest.scaleY = 0.5;
  rig.secondary[1].amplitude = 0.5;
}, '最坏范围', 'S28 worst-case scale reaching exactly zero rejected without per-frame clamp');
rejectsSecondary(function (rig) { rig.secondary[0].source = { target: 'hair', property: 'rotate' }; }, '完全相同', 'S29 self-driven follow source rejected');
rejectsSecondary(function (rig) { rig.secondary[2].property = 'x'; }, '只能是 scaleY', 'S30 blink on non-scaleY property rejected');
rejectsSecondary(function (rig) { rig.secondary[1].extra = true; }, '.secondary[1].extra', 'S31 unknown secondary field rejected');
rejectsSecondary(function (rig) { rig.secondary = new Array(17).fill(null); }, '硬上限 16', 'S32 secondary hard budget enforced before parsing');
rejectsSecondary(function (rig) {
  rig.secondary.push({ type: 'noise', target: 'root', property: 'opacity', windowMs: 100, amplitude: 0.1, seed: 1 });
}, '始终在 [0,1]', 'S33 worst-case opacity outside [0,1] rejected');

function rafHarness() {
  var nextId = 1, queue = {}, requests = 0, cancellations = 0;
  return {
    request: function (callback) { var id = nextId++; queue[id] = callback; requests++; return id; },
    cancel: function (id) { cancellations++; delete queue[id]; },
    fireNext: function (timestamp) {
      var ids = Object.keys(queue).map(Number).sort(function (a, b) { return a - b; });
      if (!ids.length) throw new Error('mock rAF queue empty');
      var callback = queue[ids[0]]; delete queue[ids[0]]; callback(timestamp);
    },
    takeNext: function () {
      var ids = Object.keys(queue).map(Number).sort(function (a, b) { return a - b; });
      if (!ids.length) throw new Error('mock rAF queue empty');
      var callback = queue[ids[0]]; delete queue[ids[0]]; return callback;
    },
    pending: function () { return Object.keys(queue).length; },
    requests: function () { return requests; },
    cancellations: function () { return cancellations; }
  };
}

(function () {
  var raf = rafHarness();
  var manager = T.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  var svgTimes = [], textTimes = [];
  manager.register({ consumerId: 'svg', key: 'beat#0', durationMs: 400, patch: function (t) { svgTimes.push(t); } });
  manager.register({ consumerId: 'text', key: 'beat#0', durationMs: 400, patch: function (t) { textTimes.push(t); } });
  ok(raf.requests() === 1 && raf.pending() === 1, 'E1 all consumers for one playback key share one rAF');
  manager.register({ consumerId: 'svg', key: 'beat#0', durationMs: 400, patch: function (t) { svgTimes.push(t); } });
  ok(raf.requests() === 1 && manager.inspect().activeMs === 0, 'E2 same key re-register patches current time without restarting');

  raf.fireNext(1000);
  raf.fireNext(1100);
  ok(svgTimes[svgTimes.length - 1] === 100 && textTimes[textTimes.length - 1] === 100,
    'E3 consumers receive the same absolute presentation time');
  raf.fireNext(2000);
  ok(svgTimes[svgTimes.length - 1] === 350, 'E4 callback delta is capped at 250ms');
  raf.fireNext(2100);
  ok(svgTimes[svgTimes.length - 1] === 400 && manager.inspect().finished && raf.pending() === 0,
    'E5 duration endpoint is patched exactly and stops the clock');
})();

(function () {
  var raf = rafHarness();
  var manager = T.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  var oldTimes = [], newTimes = [];
  manager.register({ consumerId: 'svg', key: 'old#0', durationMs: 500, patch: function (t) { oldTimes.push(t); } });
  raf.fireNext(10);
  raf.fireNext(130);
  var stale = raf.takeNext();
  manager.register({ consumerId: 'svg', key: 'new#1', durationMs: 500, patch: function (t) { newTimes.push(t); } });
  var beforeStale = oldTimes.length + newTimes.length;
  stale(400);
  ok(oldTimes[oldTimes.length - 1] === 0 && newTimes[0] === 0,
    'F1 changing key resets the old layer to t=0 before starting the new key');
  ok(oldTimes.length + newTimes.length === beforeStale && manager.inspect().key === 'new#1',
    'F2 generation guard makes a dequeued callback from the old key a no-op');
  ok(raf.pending() === 1, 'F3 key replacement still owns exactly one pending rAF');
})();

(function () {
  var raf = rafHarness();
  var manager = T.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  var times = [];
  manager.register({ consumerId: 'svg', key: 'reduce#0', durationMs: 375, patch: function (t) { times.push(t); }, reducedMotion: true });
  ok(times.length === 1 && times[0] === 375 && raf.requests() === 0,
    'G1 reduced motion starts no rAF and patches the terminal sample');

  var noRafTimes = [];
  var noRaf = T.createPlaybackManager({ requestAnimationFrame: null, cancelAnimationFrame: null });
  noRaf.register({ consumerId: 'svg', key: 'headless#0', durationMs: 240, patch: function (t) { noRafTimes.push(t); } });
  ok(noRafTimes.length === 1 && noRafTimes[0] === 240 && noRaf.inspect().finished,
    'G2 environment without rAF patches only the terminal sample synchronously');

  var reducedRigFrames = [];
  manager = T.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  manager.register({ consumerId: 'rig', key: 'rig-reduced#0', durationMs: 4000,
    patch: function (t) { reducedRigFrames.push(JSON.stringify(T.sampleRig(secondaryPlan, t))); }, reducedMotion: true });
  ok(reducedRigFrames.length === 1 && reducedRigFrames[0] === primaryTerminalBytes && raf.requests() === 0,
    'G3 reduced-motion terminal patch has no follow/oscillate/blink/noise offset and requests no rAF');

  var noRafRigFrames = [];
  noRaf = T.createPlaybackManager({ requestAnimationFrame: null, cancelAnimationFrame: null });
  noRaf.register({ consumerId: 'rig', key: 'rig-headless#0', durationMs: 4000,
    patch: function (t) { noRafRigFrames.push(JSON.stringify(T.sampleRig(secondaryPlan, t))); } });
  ok(noRafRigFrames.length === 1 && noRafRigFrames[0] === primaryTerminalBytes,
    'G4 no-rAF terminal patch has no follow/oscillate/blink/noise offset');
})();

(function () {
  var raf = rafHarness();
  var manager = T.createPlaybackManager({ requestAnimationFrame: raf.request, cancelAnimationFrame: raf.cancel });
  var times = [], lifecycleModule = null;
  manager.bindLifecycle({ registerModule: function (mod) { lifecycleModule = mod; } });
  ok(lifecycleModule && lifecycleModule.systems.length === 2 &&
    lifecycleModule.systems[0].on === 'enter' && lifecycleModule.systems[1].on === 'restore',
    'H1 enter invalidation and restore cleanup remain critical systems registered before cutscene lifecycle');
  manager.register({ consumerId: 'svg', key: 'restore#0', durationMs: 500, patch: function (t) { times.push(t); } });
  var stale = raf.takeNext();
  var restoreSystem = lifecycleModule.systems.filter(function (system) { return system.on === 'restore'; })[0];
  restoreSystem.run({}, { phase: 'deactivate' });
  var afterRestore = times.length;
  stale(200);
  ok(times[times.length - 1] === 0 && times.length === afterRestore && manager.inspect().key === null,
    'H2 restore deactivate cancels by generation so a late old rAF cannot patch');

  manager.register({ consumerId: 'svg', key: 'enter#0', durationMs: 500, patch: function (t) { times.push(t); } });
  var staleEnter = raf.takeNext();
  lifecycleModule.systems.filter(function (system) { return system.on === 'enter'; })[0].run({}, {});
  var afterEnter = times.length;
  staleEnter(300);
  ok(times[times.length - 1] === 0 && times.length === afterEnter && manager.inspect().key === null,
    'H3 new node entry invalidates the active generation and cancels late patches');
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail > 0 ? 1 : 0);
