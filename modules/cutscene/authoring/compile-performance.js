/* Amatlas cutscene performance authoring compiler: closed V1 DSL -> current beats. */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('../../../presenters/present-timeline.js'));
  } else {
    var atlas = global.Amatlas = global.Amatlas || {};
    atlas.CutsceneAuthoring = factory(atlas.Timeline);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Timeline) {
  'use strict';

  if (!Timeline || typeof Timeline.normalizeRigPlan !== 'function' ||
      typeof Timeline.normalizeCastPlan !== 'function' ||
      typeof Timeline.compileReveal !== 'function') {
    throw new Error('[PERF_OUTPUT] compile-performance: 缺少现役 Timeline API；脚本顺序必须是 ' +
      'present-timeline.js -> compile-performance.js -> world.js');
  }

  var ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
  var RESERVED_IDS = Object.create(null);
  RESERVED_IDS.__proto__ = 1;
  RESERVED_IDS.constructor = 1;
  RESERVED_IDS.prototype = 1;
  var FACING = { left: 1, right: 1 };
  var STAGE_DIRECTION = { left: 1, right: 1, above: 1, below: 1 };
  var SHOT_EXCLUSIVE_RESOURCE = { 'global.text': 1, 'global.speaker': 1 };
  var MAX_SHOT_MS = 60000;
  var MAX_SHOT_ACTIONS = 512;

  function hasOwn(object, key) { return Object.prototype.hasOwnProperty.call(object, key); }
  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function ownKeys(value) { return Object.keys(value); }
  function received(value) {
    if (value === undefined) return 'undefined';
    if (typeof value === 'number' && !isFinite(value)) return String(value);
    if (typeof value === 'function') return '[function]';
    try { return JSON.stringify(value); } catch (error) { return String(value); }
  }

  function makeError(code, path, message, detail) {
    var error = new Error('[' + code + '] ' + path + ': ' + message);
    error.code = code;
    error.path = path;
    if (detail !== undefined) error.detail = detail;
    return error;
  }
  function fail(code, path, message, detail) { throw makeError(code, path, message, detail); }

  function assertObject(value, path, shape) {
    if (!isObject(value))
      fail('PERF_SCHEMA', path, '必须是对象 ' + shape + '；收到 ' + received(value) + '。请按闭合 schema 改写。');
    return value;
  }
  function assertKnown(value, allowed, path) {
    ownKeys(value).forEach(function (key) {
      if (!hasOwn(allowed, key))
        fail('PERF_SCHEMA', path + '.' + key, '未知字段；收到 ' + received(value[key]) +
          '。合法字段为 ' + ownKeys(allowed).join('/') + '，请删除或改成合法字段。');
    });
  }
  function requireField(value, key, path, shape) {
    if (!hasOwn(value, key))
      fail('PERF_SCHEMA', path + '.' + key, '缺少必填字段；收到 undefined。合法形状为 ' + shape + '。');
    return value[key];
  }
  function assertId(value, path) {
    if (typeof value !== 'string' || !ID_RE.test(value) || hasOwn(RESERVED_IDS, value))
      fail('PERF_SCHEMA', path, '必须匹配 ^[A-Za-z_][A-Za-z0-9_-]*$ 且不是保留标识符；收到 ' +
        received(value) + '。请使用稳定的受限 id。');
    return value;
  }
  function assertFacing(value, path) {
    if (typeof value !== 'string' || !hasOwn(FACING, value))
      fail('PERF_SCHEMA', path, '必须是 "left" 或 "right"；收到 ' + received(value) + '。');
    return value;
  }
  function finiteInRange(value, min, max, path, label) {
    if (typeof value !== 'number' || !isFinite(value) || value < min || value > max)
      fail('PERF_SCHEMA', path, (label || '数值') + '必须是 [' + min + ',' + max + '] 内有限数；收到 ' +
        received(value) + '。');
    return value;
  }
  function integerInRange(value, min, max, path, label) {
    if (typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value || value < min || value > max)
      fail('PERF_SCHEMA', path, (label || '数值') + '必须是 ' + min + '..' + max + ' 的整数；收到 ' +
        received(value) + '。');
    return value;
  }
  function assertDenseArray(value, path, allowEmpty) {
    if (!Array.isArray(value))
      fail('PERF_SCHEMA', path, '必须是数组；收到 ' + received(value) + '。');
    if (!allowEmpty && value.length === 0)
      fail('PERF_SCHEMA', path, '必须是非空数组。');
    for (var i = 0; i < value.length; i++) {
      if (!hasOwn(value, i))
        fail('PERF_SCHEMA', path + '[' + i + ']', '数组不得含空位；请提供完整元素或删除该位置。');
    }
    return value;
  }
  function secondsToMs(value, path) {
    if (typeof value !== 'number' || !isFinite(value))
      fail('PERF_SCHEMA', path, 'dur 必须是有限正秒数且最多三位小数；收到 ' + received(value) + '。');
    var product = value * 1000;
    var ms = Math.round(product);
    var tolerance = Number.EPSILON * Math.max(1, Math.abs(product)) * 2;
    if (!isFinite(product) || Math.abs(product - ms) > tolerance || ms <= 0 || Math.abs(ms) > 9007199254740991)
      fail('PERF_SCHEMA', path, 'dur 必须大于 0、最多三位小数并精确转换为整数毫秒；收到 ' +
        received(value) + '。');
    return ms;
  }

  function cloneData(value, path, stack) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!isFinite(value))
        fail('PERF_SCHEMA', path, 'data-only 意图中的数字必须有限；收到 ' + received(value) + '。');
      return value;
    }
    if (typeof value !== 'object')
      fail('PERF_SCHEMA', path, '必须是 data-only 值，不接受函数/undefined/symbol/bigint；收到 ' +
        received(value) + '。');
    if (stack.indexOf(value) >= 0)
      fail('PERF_SCHEMA', path, 'data-only 意图不得成环。请改为有限对象/数组。');
    stack.push(value);
    var out;
    if (Array.isArray(value)) {
      assertDenseArray(value, path, true);
      out = value.map(function (item, index) { return cloneData(item, path + '[' + index + ']', stack); });
    } else {
      out = {};
      ownKeys(value).forEach(function (key) {
        Object.defineProperty(out, key, {
          value: cloneData(value[key], path + '.' + key, stack), enumerable: true, writable: true, configurable: true
        });
      });
    }
    stack.pop();
    return out;
  }

  function cloneTree(value, stack) {
    if (!value || typeof value !== 'object') return value;
    if (stack.indexOf(value) >= 0) throw new Error('cyclic validated tree');
    stack.push(value);
    var out;
    if (Array.isArray(value)) out = value.map(function (item) { return cloneTree(item, stack); });
    else {
      out = {};
      ownKeys(value).forEach(function (key) {
        Object.defineProperty(out, key, {
          value: cloneTree(value[key], stack), enumerable: true, writable: true, configurable: true
        });
      });
    }
    stack.pop();
    return out;
  }

  /* Freeze compiler-owned data while deliberately leaving the author-owned run function untouched. */
  function deepFreezeOutput(value) {
    if (!value || typeof value === 'function' || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.freeze(value);
    ownKeys(value).forEach(function (key) { deepFreezeOutput(value[key]); });
    return value;
  }

  function splitTimelineError(error, fallbackPath) {
    var message = error && error.message ? String(error.message) : String(error);
    var prefix = fallbackPath + ':';
    if (message.indexOf(prefix) === 0)
      return { path: fallbackPath, reason: message.slice(prefix.length).trim() };
    var cursor = message.indexOf(': ');
    return cursor > 0
      ? { path: message.slice(0, cursor), reason: message.slice(cursor + 2).trim() }
      : { path: fallbackPath, reason: message };
  }

  function timelineInputError(error, fallbackPath) {
    var split = splitTimelineError(error, fallbackPath);
    var code = /硬上限|超过.*上限/.test(split.reason) ? 'PERF_LIMIT' :
      (/不存在|未知 part|含未知 part/.test(split.reason) ? 'PERF_REF' : 'PERF_SCHEMA');
    fail(code, split.path, split.reason + '。该 rig 必须先通过现役 normalizeRigPlan，再由高层动作拥有 tracks/variant keys。');
  }

  function timelineRevealError(error, fallbackPath, code) {
    var split = splitTimelineError(error, fallbackPath);
    fail(code, split.path, split.reason + (code === 'PERF_OUTPUT'
      ? '。compiler 生成的 typewriter 未通过现役 compileReveal；这是 compiler bug。'
      : '。RevealLine 必须精确使用 cps/chunks{text,cps?,pauseAfter?}。'));
  }

  function normalizeStaticRig(rig, path) {
    if (isObject(rig) && Array.isArray(rig.tracks) && rig.tracks.length !== 0)
      fail('PERF_SCHEMA', path + '.tracks', 'StaticRig 的 tracks 必须为空；收到长度 ' + rig.tracks.length +
        '。请把已有动画留在低层 Rig beat，或删除后交给 performance compiler。');
    if (isObject(rig) && Array.isArray(rig.variants)) {
      rig.variants.forEach(function (slot, index) {
        if (isObject(slot) && Array.isArray(slot.keys) && slot.keys.length !== 0)
          fail('PERF_SCHEMA', path + '.variants[' + index + '].keys', 'StaticRig 的 variant keys 必须为空；收到长度 ' +
            slot.keys.length + '。请把离散动画留在低层 Rig beat。');
      });
    }
    try {
      return Timeline.normalizeRigPlan(rig, { path: path, durationMs: 1 });
    } catch (error) {
      timelineInputError(error, path);
    }
  }

  function parseProfile(source, path, rigPlan) {
    assertObject(source, path, '{kind,authoredFacing,root,head?,legs?,arms?,mouth?}');
    assertKnown(source, { kind: 1, authoredFacing: 1, root: 1, head: 1, legs: 1, arms: 1, mouth: 1 }, path);
    var kind = requireField(source, 'kind', path, '{kind:"cutout-biped-v1",authoredFacing,root,...}');
    if (kind !== 'cutout-biped-v1')
      fail('PERF_SCHEMA', path + '.kind', '首版只允许 "cutout-biped-v1"；收到 ' + received(kind) + '。');
    var profile = {
      kind: kind,
      authoredFacing: assertFacing(requireField(source, 'authoredFacing', path, 'left|right'), path + '.authoredFacing'),
      root: assertId(requireField(source, 'root', path, 'PartId'), path + '.root'),
      head: null,
      legs: null,
      arms: { left: null, right: null },
      mouth: null
    };
    if (hasOwn(source, 'head')) profile.head = assertId(source.head, path + '.head');
    if (hasOwn(source, 'mouth')) profile.mouth = assertId(source.mouth, path + '.mouth');

    if (hasOwn(source, 'legs')) {
      var legs = assertObject(source.legs, path + '.legs', '{left:PartId,right:PartId}');
      assertKnown(legs, { left: 1, right: 1 }, path + '.legs');
      profile.legs = {
        left: assertId(requireField(legs, 'left', path + '.legs', '{left,right}'), path + '.legs.left'),
        right: assertId(requireField(legs, 'right', path + '.legs', '{left,right}'), path + '.legs.right')
      };
    }
    if (hasOwn(source, 'arms')) {
      var arms = assertObject(source.arms, path + '.arms', '{left?:chain,right?:chain}');
      assertKnown(arms, { left: 1, right: 1 }, path + '.arms');
      ['left', 'right'].forEach(function (hand) {
        if (!hasOwn(arms, hand)) return;
        var chainPath = path + '.arms.' + hand;
        var chain = assertObject(arms[hand], chainPath, '{upper,fore,hand}');
        assertKnown(chain, { upper: 1, fore: 1, hand: 1 }, chainPath);
        profile.arms[hand] = {
          upper: assertId(requireField(chain, 'upper', chainPath, '{upper,fore,hand}'), chainPath + '.upper'),
          fore: assertId(requireField(chain, 'fore', chainPath, '{upper,fore,hand}'), chainPath + '.fore'),
          hand: assertId(requireField(chain, 'hand', chainPath, '{upper,fore,hand}'), chainPath + '.hand')
        };
      });
    }

    var partById = Object.create(null);
    rigPlan.parts.forEach(function (part) { partById[part.id] = part; });
    var refs = [{ id: profile.root, path: path + '.root', semantic: 'root' }];
    if (profile.head) refs.push({ id: profile.head, path: path + '.head', semantic: 'head' });
    if (profile.legs) {
      refs.push({ id: profile.legs.left, path: path + '.legs.left', semantic: 'leg.left' });
      refs.push({ id: profile.legs.right, path: path + '.legs.right', semantic: 'leg.right' });
    }
    ['left', 'right'].forEach(function (hand) {
      var chain = profile.arms[hand];
      if (!chain) return;
      refs.push({ id: chain.upper, path: path + '.arms.' + hand + '.upper', semantic: 'arm.' + hand + '.upper' });
      refs.push({ id: chain.fore, path: path + '.arms.' + hand + '.fore', semantic: 'arm.' + hand + '.fore' });
      refs.push({ id: chain.hand, path: path + '.arms.' + hand + '.hand', semantic: 'arm.' + hand + '.hand' });
    });
    if (profile.mouth) refs.push({ id: profile.mouth, path: path + '.mouth', semantic: 'mouth' });

    var refSeen = Object.create(null);
    refs.forEach(function (ref) {
      if (!hasOwn(partById, ref.id))
        fail('PERF_REF', ref.path, '引用的 part "' + ref.id + '" 不存在。请改为该 actor.rig.parts 中的 id。',
          { kind: 'part', id: ref.id });
      if (hasOwn(refSeen, ref.id))
        fail('PERF_CAPABILITY', ref.path, 'part "' + ref.id + '" 已用于 ' + refSeen[ref.id] +
          '，不能含混复用为 ' + ref.semantic + '。请给每个语义关节独立 part。',
          { part: ref.id, first: refSeen[ref.id], second: ref.semantic });
      refSeen[ref.id] = ref.semantic;
    });

    var actualRoot = null;
    rigPlan.parts.forEach(function (part) { if (part.parent === null) actualRoot = part.id; });
    if (profile.root !== actualRoot)
      fail('PERF_CAPABILITY', path + '.root', '必须引用 rig 唯一 parent:null 根 "' + actualRoot + '"；收到 ' +
        received(profile.root) + '。', { expected: actualRoot, received: profile.root });

    ['left', 'right'].forEach(function (hand) {
      var chain = profile.arms[hand];
      if (!chain) return;
      if (partById[chain.fore].parent !== chain.upper)
        fail('PERF_CAPABILITY', path + '.arms.' + hand + '.fore', 'arm chain 必须满足 fore.parent === upper；收到 parent ' +
          received(partById[chain.fore].parent) + '。请修正 rig parent 拓扑。');
      if (partById[chain.hand].parent !== chain.fore)
        fail('PERF_CAPABILITY', path + '.arms.' + hand + '.hand', 'arm chain 必须满足 hand.parent === fore；收到 parent ' +
          received(partById[chain.hand].parent) + '。请修正 rig parent 拓扑。');
    });

    if (profile.mouth) {
      if (profile.mouth !== 'mouth')
        fail('PERF_CAPABILITY', path + '.mouth', '首版 speaker 契约要求精确引用 id "mouth"；收到 ' +
          received(profile.mouth) + '。');
      var mouthSlot = null;
      rigPlan.variants.forEach(function (slot) { if (slot.target === 'mouth') mouthSlot = slot; });
      var hasA = false, hasO = false;
      if (mouthSlot) mouthSlot.states.forEach(function (state) {
        if (state.id === 'A') hasA = true;
        if (state.id === 'O') hasO = true;
      });
      if (!mouthSlot || mouthSlot.base !== 'rest' || !hasA || !hasO)
        fail('PERF_CAPABILITY', path + '.mouth', 'mouth 必须有 base:"rest" 且 states 同时含 A/O 的 variant slot。请补齐现役 speaker 拓扑。');
    }
    profile.primaryParts = refSeen;
    return profile;
  }

  function validateSecondary(actor, actorPath) {
    actor.rigPlan.secondary.forEach(function (item, index) {
      var path = actorPath + '.rig.secondary[' + index + ']';
      if (item.type !== 'blink')
        fail('PERF_SCHEMA', path + '.type', '高层 V1 secondary 只允许 blink；收到 ' + received(item.type) +
          '。follow/oscillate/noise 请继续使用低层 Rig beat。');
      if (hasOwn(actor.profile.primaryParts, item.target))
        fail('PERF_CONFLICT', path + '.target', 'blink target "' + item.target + '" 是 V1 primary action channel (' +
          actor.profile.primaryParts[item.target] + ')，会形成隐藏 writer。请改用独立 part 或低层 Rig beat。',
          { resource: 'actor:' + actor.id + '.' + actor.profile.primaryParts[item.target], secondaryPath: path });
    });
  }

  function parseActors(source, rootPath) {
    var path = rootPath + '.actors';
    assertDenseArray(source, path, true);
    var list = [], byId = Object.create(null);
    source.forEach(function (item, index) {
      var actorPath = path + '[' + index + ']';
      assertObject(item, actorPath, '{id,rig,profile}');
      assertKnown(item, { id: 1, rig: 1, profile: 1 }, actorPath);
      var id = assertId(requireField(item, 'id', actorPath, '{id,rig,profile}'), actorPath + '.id');
      if (hasOwn(byId, id))
        fail('PERF_SCHEMA', actorPath + '.id', 'actor id 重复: ' + id + '。请为每个 actor 使用唯一 id。');
      var rigPath = actorPath + '.rig';
      var rig = requireField(item, 'rig', actorPath, '{id,rig,profile}');
      var rigPlan = normalizeStaticRig(rig, rigPath);
      var actor = {
        id: id,
        rig: rig,
        rigPlan: rigPlan,
        profile: parseProfile(requireField(item, 'profile', actorPath, '{id,rig,profile}'), actorPath + '.profile', rigPlan)
      };
      validateSecondary(actor, actorPath);
      list.push(actor);
      byId[id] = actor;
    });
    return { list: list, byId: byId };
  }

  function parseAnchors(source, rootPath) {
    var path = rootPath + '.anchors';
    assertDenseArray(source, path, true);
    var list = [], byId = Object.create(null);
    source.forEach(function (item, index) {
      var anchorPath = path + '[' + index + ']';
      assertObject(item, anchorPath, '{id,x,y,facing?,capacity?}');
      assertKnown(item, { id: 1, x: 1, y: 1, facing: 1, capacity: 1 }, anchorPath);
      var id = assertId(requireField(item, 'id', anchorPath, '{id,x,y,...}'), anchorPath + '.id');
      if (hasOwn(byId, id))
        fail('PERF_SCHEMA', anchorPath + '.id', 'anchor id 重复: ' + id + '。请使用唯一 id。');
      var anchor = {
        id: id,
        x: finiteInRange(requireField(item, 'x', anchorPath, '{id,x,y,...}'), 0, 320, anchorPath + '.x', 'x'),
        y: finiteInRange(requireField(item, 'y', anchorPath, '{id,x,y,...}'), 0, 180, anchorPath + '.y', 'y'),
        facing: hasOwn(item, 'facing') ? assertFacing(item.facing, anchorPath + '.facing') : null,
        capacity: hasOwn(item, 'capacity') ? integerInRange(item.capacity, 0, 4, anchorPath + '.capacity', 'capacity') : 1,
        path: anchorPath
      };
      list.push(anchor);
      byId[id] = anchor;
    });
    return { list: list, byId: byId };
  }

  function actorResources(actorId, suffixes) {
    return suffixes.map(function (suffix) { return 'actor:' + actorId + suffix; });
  }

  function requireActionActor(action, path, context, states, requiredPhase) {
    var actorId = assertId(requireField(action, 'actor', path, 'action actor id'), path + '.actor');
    if (!hasOwn(context.actors.byId, actorId))
      fail('PERF_REF', path + '.actor', 'actor "' + actorId + '" 不存在。请引用 performance.actors[].id。',
        { kind: 'actor', id: actorId });
    if (!hasOwn(states, actorId))
      fail('PERF_STATE', path + '.actor', 'actor "' + actorId + '" 不在本 shot.cast，当前不是 onstage。请加入 cast 或拆 shot。',
        { actor: actorId, state: 'offstage' });
    if (requiredPhase && states[actorId].phase !== requiredPhase) {
      var phaseDetail = { actor: actorId, state: states[actorId].phase, required: requiredPhase };
      if (states[actorId].transition) phaseDetail.transition = {
        do: states[actorId].transition.do,
        path: states[actorId].transition.path,
        startMs: states[actorId].transition.startMs,
        endMs: states[actorId].transition.endMs
      };
      fail('PERF_STATE', path + '.actor', 'actor "' + actorId + '" 当前为 ' + states[actorId].phase +
        '，该动作要求 ' + requiredPhase + '。请把 enter 放在 0ms、等待其完成，并在 exit 开始前完成其它动作。',
        phaseDetail);
    }
    return { actor: context.actors.byId[actorId], state: states[actorId] };
  }

  function requireAnchorRef(value, path, context) {
    var id = assertId(value, path);
    if (!hasOwn(context.anchors.byId, id))
      fail('PERF_REF', path, 'anchor "' + id + '" 不存在。请引用 performance.anchors[].id。',
        { kind: 'anchor', id: id });
    return context.anchors.byId[id];
  }

  function requireWalkCapability(actor, path) {
    var missing = [];
    if (!actor.profile.legs) missing.push('profile.legs.left/right');
    if (!actor.profile.arms.left) missing.push('profile.arms.left.upper');
    if (!actor.profile.arms.right) missing.push('profile.arms.right.upper');
    if (missing.length)
      fail('PERF_CAPABILITY', path + '.actor', 'actor "' + actor.id + '" 不能结构性证明 walkTo；缺少 ' +
        missing.join(', ') + '。请补齐 cutout-biped-v1 拓扑或使用低层 Rig beat。',
        { actor: actor.id, action: 'walkTo', missing: missing });
  }

  function requirePointCapability(actor, hand, path) {
    if (!actor.profile.arms[hand])
      fail('PERF_CAPABILITY', path + '.hand', 'actor "' + actor.id + '" 缺少 ' + hand +
        ' upper/fore/hand chain，不能 pointAt。请补齐 profile 或使用低层 Rig beat。',
        { actor: actor.id, action: 'pointAt', hand: hand });
  }

  function requireLookCapability(actor, path) {
    if (!actor.profile.head)
      fail('PERF_CAPABILITY', path + '.actor', 'actor "' + actor.id +
        '" 缺少 profile.head，不能 lookAt。请补齐独立 head part 或使用低层 Rig beat。',
        { actor: actor.id, action: 'lookAt', missing: 'profile.head' });
  }

  function requireSayCapability(actor, path) {
    if (!actor.profile.mouth)
      fail('PERF_CAPABILITY', path + '.actor', 'actor "' + actor.id +
        '" 缺少精确 mouth profile，不能 say。请映射 id:"mouth" 且提供 rest/A/O variant。',
        { actor: actor.id, action: 'say', missing: 'profile.mouth' });
  }

  function assertForward(state, target, path, actionName) {
    var from = state.anchor;
    var forward = state.facing === 'right' ? target.x > from.x : target.x < from.x;
    if (!forward)
      fail('PERF_STATE', path, actionName + ' 目标 "' + target.id + '" 不在 actor 当前 facing ' + state.facing +
        ' 的前方（' + from.x + ' -> ' + target.x + '）。请拆 shot 并显式改 facing，或使用低层 Rig。',
        { facing: state.facing, from: from.id, target: target.id, fromX: from.x, targetX: target.x });
  }

  function assertStageDirection(value, path, field) {
    if (typeof value !== 'string' || !hasOwn(STAGE_DIRECTION, value))
      fail('PERF_SCHEMA', path, field + ' 必须是 left/right/above/below；收到 ' + received(value) + '。');
    return value;
  }

  function authoredLocalDirection(state, target, path) {
    if (target.x === state.anchor.x)
      fail('PERF_STATE', path, 'target "' + target.id + '" 与 actor 当前 anchor "' + state.anchor.id +
        '" 的 x 相同，无法解析 screen-left/right coarse pose。请使用水平分离的 anchor 或低层 Rig。',
        { from: state.anchor.id, target: target.id, x: target.x });
    var screen = target.x > state.anchor.x ? 'right' : 'left';
    if (state.stageFacing === 'mirror-x') return screen === 'right' ? 'left' : 'right';
    return screen;
  }

  function attachActor(record, actorState) {
    record.actor = actorState.actor.id;
    record.actorDef = actorState.actor;
    record.state = actorState.state;
  }

  function parseEnterAction(action, record, context, states) {
    var actorState = requireActionActor(action, record.path, context, states, 'offstage');
    attachActor(record, actorState);
    if (record.startMs !== 0)
      fail('PERF_STATE', record.path, 'enter 必须精确从 shot 0ms 开始；收到 ' + record.startMs +
        'ms。请把 enter 移到 sequence 首步或 0ms parallel。', { startMs: record.startMs, requiredStartMs: 0 });
    record.direction = assertStageDirection(requireField(action, 'from', record.path, 'left|right|above|below'),
      record.path + '.from', 'from');
    record.resources = actorResources(record.actor, ['.stage', '.root', '.locomotion']);
  }

  function parseWalkAction(action, record, context, states) {
    var actorState = requireActionActor(action, record.path, context, states, 'onstage');
    attachActor(record, actorState);
    var destination = requireAnchorRef(requireField(action, 'to', record.path, 'AnchorId'), record.path + '.to', context);
    if (destination.capacity === 0)
      fail('PERF_STATE', record.path + '.to', 'anchor "' + destination.id + '" capacity 为 0，不能作为 walkTo 终点。请选择可站位 anchor。',
        { anchor: destination.id, capacity: 0 });
    requireWalkCapability(actorState.actor, record.path);
    if (actorState.state.anchor.y !== destination.y)
      fail('PERF_STATE', record.path + '.to', 'walkTo V1 只允许同 y 水平 blocking；收到 ' + actorState.state.anchor.y +
        ' -> ' + destination.y + '。请拆 shot 或使用低层 Rig。',
        { from: actorState.state.anchor.id, to: destination.id, fromY: actorState.state.anchor.y, toY: destination.y });
    assertForward(actorState.state, destination, record.path + '.to', 'walkTo');
    var steps;
    if (hasOwn(action, 'steps')) steps = integerInRange(action.steps, 1, 8, record.path + '.steps', 'steps');
    else {
      steps = Math.max(1, Math.min(8, Math.round(Math.abs(destination.x - actorState.state.anchor.x) / 14)));
      record.defaults.push({ field: 'steps', value: steps, source: 'distance-14px-v1' });
    }
    if (record.durationMs < steps * 2)
      fail('PERF_SCHEMA', record.path + '.dur', 'dur ' + record.durationMs + 'ms 无法为 ' + steps +
        ' steps 分配严格递增的半步整数毫秒 key。请延长 dur 或减少 steps。');
    record.steps = steps;
    record.fromAnchor = actorState.state.anchor;
    record.toAnchor = destination;
    record.resources = actorResources(record.actor,
      ['.root', '.locomotion', '.leg.left', '.leg.right', '.arm.left', '.arm.right']);
  }

  function parseLookAction(action, record, context, states) {
    var actorState = requireActionActor(action, record.path, context, states, 'onstage');
    attachActor(record, actorState);
    requireLookCapability(actorState.actor, record.path);
    var target = requireAnchorRef(requireField(action, 'target', record.path, 'AnchorId'), record.path + '.target', context);
    record.targetAnchor = target;
    record.localDirection = authoredLocalDirection(actorState.state, target, record.path + '.target');
    record.resources = actorResources(record.actor, ['.head']);
  }

  function parsePointAction(action, record, context, states) {
    var actorState = requireActionActor(action, record.path, context, states, 'onstage');
    attachActor(record, actorState);
    var hand = requireField(action, 'hand', record.path, 'left|right');
    if (hand !== 'left' && hand !== 'right')
      fail('PERF_SCHEMA', record.path + '.hand', 'hand 必须是 "left" 或 "right"；收到 ' + received(hand) + '。');
    var target = requireAnchorRef(requireField(action, 'target', record.path, 'AnchorId'), record.path + '.target', context);
    requirePointCapability(actorState.actor, hand, record.path);
    assertForward(actorState.state, target, record.path + '.target', 'pointAt');
    record.hand = hand;
    record.targetAnchor = target;
    record.localDirection = authoredLocalDirection(actorState.state, target, record.path + '.target');
    record.resources = actorResources(record.actor, ['.arm.' + hand]);
  }

  function compileRevealInput(lines, path) {
    assertDenseArray(lines, path + '.lines', false);
    lines.forEach(function (line, lineIndex) {
      if (!isObject(line)) return;
      if (Array.isArray(line.chunks)) assertDenseArray(line.chunks, path + '.lines[' + lineIndex + '].chunks', false);
    });
    var text = { mode: 'typewriter', lines: cloneData(lines, path + '.lines', []) };
    try {
      return { text: text, plan: Timeline.compileReveal(text, { path: path }) };
    } catch (error) {
      timelineRevealError(error, path, 'PERF_SCHEMA');
    }
  }

  function parseTextAction(action, record) {
    var reveal = compileRevealInput(requireField(action, 'lines', record.path, 'RevealLine[]'), record.path);
    if (reveal.plan.graphemes.length === 0)
      fail('PERF_SCHEMA', record.path + '.lines', '正文 compileReveal 后必须至少含一个 grapheme；空 chunk 只可用于 pause，不算正文。');
    record.revealDurationMs = reveal.plan.durationMs;
    if (hasOwn(action, 'dur')) {
      record.durationMs = secondsToMs(action.dur, record.path + '.dur');
      if (record.durationMs < record.revealDurationMs)
        fail('PERF_SCHEMA', record.path + '.dur', 'dur ' + record.durationMs + 'ms 短于 reveal duration ' +
          record.revealDurationMs + 'ms。dur 只可延长动作；请增大 dur 或提高 cps/减少 pause。',
          { durationMs: record.durationMs, revealDurationMs: record.revealDurationMs });
    } else {
      record.durationMs = record.revealDurationMs;
      record.defaults.push({ field: 'dur', value: record.durationMs / 1000, source: 'reveal-duration-v1' });
    }
    if (record.durationMs <= 0)
      fail('PERF_SCHEMA', record.path + '.lines', 'reveal duration 必须至少为 1ms，才能形成正时长 action。请降低 cps 或增加 pauseAfter。');

    var loweredText = cloneTree(reveal.text, []);
    if (record.startMs > 0) {
      loweredText.lines[0].chunks.unshift({
        text: '', cps: reveal.plan.lines[0].chunks[0].cps, pauseAfter: record.startMs / 1000
      });
    }
    var loweredPlan;
    try {
      loweredPlan = Timeline.compileReveal(loweredText, { path: record.path });
    } catch (error) {
      timelineRevealError(error, record.path, 'PERF_OUTPUT');
    }
    if (loweredPlan.durationMs !== record.startMs + record.revealDurationMs)
      fail('PERF_OUTPUT', record.path, 'initial reveal delay 未精确保持高层排程；这是 compiler bug。',
        { expectedDurationMs: record.startMs + record.revealDurationMs, receivedDurationMs: loweredPlan.durationMs });
    record.text = loweredText;
    record.revealEndMs = record.startMs + record.revealDurationMs;
  }

  function parseSayAction(action, record, context, states) {
    var actorState = requireActionActor(action, record.path, context, states, 'onstage');
    attachActor(record, actorState);
    requireSayCapability(actorState.actor, record.path);
    parseTextAction(action, record);
    var mouthSource = requireField(action, 'mouth', record.path, 'Array<"A"|"O">');
    if (!Array.isArray(mouthSource) || mouthSource.length < 1 || mouthSource.length > 32)
      fail('PERF_SCHEMA', record.path + '.mouth', 'mouth 必须是长度 1..32 的 A/O 数组；收到 ' + received(mouthSource) + '。');
    assertDenseArray(mouthSource, record.path + '.mouth', false);
    record.mouthPattern = mouthSource.map(function (value, index) {
      if (value !== 'A' && value !== 'O')
        fail('PERF_SCHEMA', record.path + '.mouth[' + index + ']', 'mouth value 只允许 "A" 或 "O"；收到 ' + received(value) + '。');
      return value;
    });
    var previous = record.startMs;
    for (var i = 1; i <= record.mouthPattern.length; i++) {
      var atMs = boundary(record.startMs, record.revealDurationMs, i, record.mouthPattern.length + 1);
      if (atMs <= previous || atMs >= record.revealEndMs)
        fail('PERF_SCHEMA', record.path + '.mouth', 'reveal duration ' + record.revealDurationMs + 'ms 无法为 ' +
          record.mouthPattern.length + ' 个 A/O 与结尾 rest 分配严格递增整数毫秒。请降低 cps、增加 pauseAfter 或缩短 pattern。',
          { revealDurationMs: record.revealDurationMs, patternLength: record.mouthPattern.length });
      previous = atMs;
    }
    record.resources = actorResources(record.actor, ['.mouth']).concat(['global.text', 'global.speaker']);
  }

  function parseCaptionAction(action, record) {
    parseTextAction(action, record);
    record.resources = ['global.text'];
  }

  function parseExitAction(action, record, context, states) {
    var actorState = requireActionActor(action, record.path, context, states, 'onstage');
    attachActor(record, actorState);
    record.direction = assertStageDirection(requireField(action, 'to', record.path, 'left|right|above|below'),
      record.path + '.to', 'to');
    record.resources = actorResources(record.actor, ['.stage', '.root', '.locomotion']);
  }

  var ACTIONS = {
    enter: { fields: { do: 1, actor: 1, from: 1, dur: 1 }, duration: 'required',
      parse: parseEnterAction, lowerActor: lowerEnter },
    walkTo: { fields: { do: 1, actor: 1, to: 1, dur: 1, steps: 1 }, duration: 'required',
      parse: parseWalkAction, lowerActor: lowerWalk },
    lookAt: { fields: { do: 1, actor: 1, target: 1, dur: 1 }, duration: 'required',
      parse: parseLookAction, lowerActor: lowerLook },
    pointAt: { fields: { do: 1, actor: 1, target: 1, hand: 1, dur: 1 }, duration: 'required',
      parse: parsePointAction, lowerActor: lowerPoint },
    say: { fields: { do: 1, actor: 1, lines: 1, mouth: 1, dur: 1 }, duration: 'reveal',
      parse: parseSayAction, lowerActor: lowerSay },
    caption: { fields: { do: 1, lines: 1, dur: 1 }, duration: 'reveal',
      parse: parseCaptionAction, lowerActor: null },
    wait: { fields: { do: 1, dur: 1 }, duration: 'required', parse: null, lowerActor: null },
    exit: { fields: { do: 1, actor: 1, to: 1, dur: 1 }, duration: 'required',
      parse: parseExitAction, lowerActor: lowerExit }
  };

  function parseAction(action, path, startMs, context, states) {
    assertObject(action, path, ownKeys(ACTIONS).join('|') + ' action');
    var kind = requireField(action, 'do', path, '{do:ActionKind,...}');
    if (typeof kind !== 'string' || !hasOwn(ACTIONS, kind))
      fail('PERF_SCHEMA', path + '.do', 'do 必须是 ' + ownKeys(ACTIONS).join('/') + '；收到 ' + received(kind) + '。');
    var definition = ACTIONS[kind];
    assertKnown(action, definition.fields, path);
    var record = {
      path: path, do: kind, startMs: startMs, endMs: null, durationMs: null,
      resources: [], defaults: [], actor: null
    };
    if (definition.duration === 'required')
      record.durationMs = secondsToMs(requireField(action, 'dur', path, 'positive seconds'), path + '.dur');
    if (definition.parse) definition.parse(action, record, context, states);
    record.endMs = record.startMs + record.durationMs;
    return record;
  }

  function resourceConflict(records) {
    for (var i = 0; i < records.length; i++) {
      for (var j = 0; j < i; j++) {
        var later = records[i], earlier = records[j];
        var exclusive = null;
        ownKeys(SHOT_EXCLUSIVE_RESOURCE).some(function (claim) {
          if (later.resources.indexOf(claim) >= 0 && earlier.resources.indexOf(claim) >= 0) {
            exclusive = claim;
            return true;
          }
          return false;
        });
        if (exclusive) {
          fail('PERF_CONFLICT', later.path, exclusive + ' 是 shot-exclusive；' + earlier.path + ' 已声明文本动作。' +
            '现役一拍只有一份 text/一个 speaker，请拆成多个 shot。', {
              resource: exclusive,
              scope: 'shot',
              first: { path: earlier.path, actor: earlier.actor, startMs: earlier.startMs, endMs: earlier.endMs },
              second: { path: later.path, actor: later.actor, startMs: later.startMs, endMs: later.endMs }
            });
        }
        var overlapStart = Math.max(later.startMs, earlier.startMs);
        var overlapEnd = Math.min(later.endMs, earlier.endMs);
        if (overlapStart >= overlapEnd) continue;
        var resource = null;
        later.resources.some(function (claim) {
          if (earlier.resources.indexOf(claim) >= 0) { resource = claim; return true; }
          return false;
        });
        if (!resource) continue;
        var detail = {
          resource: resource,
          first: { path: earlier.path, actor: earlier.actor, startMs: earlier.startMs, endMs: earlier.endMs },
          second: { path: later.path, actor: later.actor, startMs: later.startMs, endMs: later.endMs },
          overlap: { startMs: overlapStart, endMs: overlapEnd }
        };
        fail('PERF_CONFLICT', later.path, resource + ' 在 [' + later.startMs + ',' + later.endMs + ') 与 ' +
          earlier.path + ' 的 [' + earlier.startMs + ',' + earlier.endMs + ') 重叠。改为串行、使用不冲突资源，或拆成低层 Rig beat；不会按数组顺序覆盖。', detail);
      }
    }
  }

  function copyStates(states) {
    var copy = Object.create(null);
    ownKeys(states).forEach(function (id) {
      copy[id] = {
        anchor: states[id].anchor,
        facing: states[id].facing,
        stageFacing: states[id].stageFacing,
        phase: states[id].phase,
        transition: states[id].transition
      };
    });
    return copy;
  }

  function commitRecord(record, states, eventsByActor) {
    if (record.actor === null) return;
    if (record.do === 'enter') {
      states[record.actor].phase = 'onstage';
      states[record.actor].transition = record;
      eventsByActor[record.actor].push(record);
    } else if (record.do === 'walkTo') {
      states[record.actor].anchor = record.toAnchor;
      eventsByActor[record.actor].push(record);
    } else if (record.do === 'exit') {
      states[record.actor].phase = 'offstage';
      states[record.actor].transition = record;
      eventsByActor[record.actor].push(record);
    }
  }

  function validateStageSchedule(records, durationMs) {
    records.forEach(function (record) {
      if (record.do !== 'exit') return;
      if (record.endMs !== durationMs)
        fail('PERF_STATE', record.path, 'exit 必须精确占据 shot 尾窗；收到 [' + record.startMs + ',' + record.endMs +
          ')，shot 终点为 ' + durationMs + 'ms。请把 exit 移到 sequence 最后或调整 parallel join。',
          { startMs: record.startMs, endMs: record.endMs, shotEndMs: durationMs });
      records.forEach(function (other) {
        if (other === record || other.actor !== record.actor || other.endMs <= record.startMs) return;
        fail('PERF_STATE', other.path, 'actor "' + record.actor + '" 的 exit 从 ' + record.startMs +
          'ms 开始后仍有其它动作。请让该 actor 的所有动作在 exit 尾窗前结束。', {
            actor: record.actor,
            exit: { path: record.path, startMs: record.startMs, endMs: record.endMs },
            action: { path: other.path, do: other.do, startMs: other.startMs, endMs: other.endMs }
          });
      });
    });
  }

  function compileSequence(source, shotPath, context, states, eventsByActor) {
    var path = shotPath + '.sequence';
    assertDenseArray(source, path, false);
    var actionCount = 0;
    source.forEach(function (step) {
      actionCount += isObject(step) && Array.isArray(step.parallel) ? step.parallel.length : 1;
    });
    if (actionCount > MAX_SHOT_ACTIONS)
      fail('PERF_LIMIT', path, 'shot action 数量 ' + actionCount + ' 超过硬上限 ' + MAX_SHOT_ACTIONS +
        '。请合并相邻 wait/动作，或拆成多个 shot。', { actions: actionCount, limit: MAX_SHOT_ACTIONS });
    var records = [];
    var cursorMs = 0;
    source.forEach(function (step, index) {
      var stepPath = path + '[' + index + ']';
      if (isObject(step) && hasOwn(step, 'parallel')) {
        assertKnown(step, { parallel: 1, join: 1 }, stepPath);
        if (!Array.isArray(step.parallel) || step.parallel.length === 0)
          fail('PERF_SCHEMA', stepPath + '.parallel', '必须是非空直接 action 数组；首版不接受嵌套 parallel/sequence。');
        assertDenseArray(step.parallel, stepPath + '.parallel', false);
        if (hasOwn(step, 'join') && step.join !== 'all')
          fail('PERF_SCHEMA', stepPath + '.join', '首版 join 只允许 "all"；收到 ' + received(step.join) + '。');
        var snapshot = copyStates(states);
        var parallelRecords = [];
        var longestMs = 0;
        step.parallel.forEach(function (action, actionIndex) {
          var actionPath = stepPath + '.parallel[' + actionIndex + ']';
          if (isObject(action) && hasOwn(action, 'parallel'))
            fail('PERF_SCHEMA', actionPath + '.parallel', '首版 parallel 只接受直接 action，不能嵌套。请拆成相邻 sequence steps。');
          var record = parseAction(action, actionPath, cursorMs, context, snapshot);
          parallelRecords.push(record);
          longestMs = Math.max(longestMs, record.durationMs);
        });
        resourceConflict(records.concat(parallelRecords));
        parallelRecords.forEach(function (record) {
          records.push(record);
          commitRecord(record, states, eventsByActor);
        });
        cursorMs += longestMs;
      } else {
        var record = parseAction(step, stepPath, cursorMs, context, states);
        resourceConflict(records.concat([record]));
        records.push(record);
        commitRecord(record, states, eventsByActor);
        cursorMs = record.endMs;
      }
    });
    if (cursorMs > MAX_SHOT_MS)
      fail('PERF_LIMIT', path, 'shot 总时长 ' + cursorMs + 'ms 超过硬上限 ' + MAX_SHOT_MS +
        'ms。请拆成多个 shot。', { durationMs: cursorMs, limitMs: MAX_SHOT_MS });
    validateStageSchedule(records, cursorMs);
    return { records: records, durationMs: cursorMs };
  }

  function collectEnteringActors(sequence) {
    var entering = Object.create(null);
    if (!Array.isArray(sequence)) return entering;
    sequence.forEach(function (step) {
      var actions = isObject(step) && Array.isArray(step.parallel) ? step.parallel : [step];
      actions.forEach(function (action) {
        if (isObject(action) && action.do === 'enter' && typeof action.actor === 'string') entering[action.actor] = 1;
      });
    });
    return entering;
  }

  function parseCast(source, shotPath, context, enteringActors) {
    var path = shotPath + '.cast';
    assertDenseArray(source, path, true);
    if (source.length > 4)
      fail('PERF_LIMIT', path, 'cast members 超过现役硬上限 4；收到长度 ' + source.length + '。请拆 shot。');
    var list = [], states = Object.create(null), eventsByActor = Object.create(null);
    var initialByAnchor = Object.create(null);
    source.forEach(function (item, index) {
      var castPath = path + '[' + index + ']';
      assertObject(item, castPath, '{actor,at,facing?}');
      assertKnown(item, { actor: 1, at: 1, facing: 1 }, castPath);
      var actorId = assertId(requireField(item, 'actor', castPath, '{actor,at,facing?}'), castPath + '.actor');
      if (!hasOwn(context.actors.byId, actorId))
        fail('PERF_REF', castPath + '.actor', 'actor "' + actorId + '" 不存在。请引用 performance.actors[].id。');
      if (hasOwn(states, actorId))
        fail('PERF_SCHEMA', castPath + '.actor', '同一 actor 在 shot.cast 只能出现一次；重复 "' + actorId + '"。');
      var anchor = requireAnchorRef(requireField(item, 'at', castPath, '{actor,at,facing?}'), castPath + '.at', context);
      if (anchor.capacity === 0)
        fail('PERF_STATE', castPath + '.at', 'anchor "' + anchor.id + '" capacity 为 0，不能作为 cast 站位。');
      var facing = hasOwn(item, 'facing') ? assertFacing(item.facing, castPath + '.facing') : anchor.facing;
      if (!facing)
        fail('PERF_STATE', castPath + '.facing', 'cast 与 anchor 都未声明 facing，compiler 不会猜。请在任一处写 left/right。');
      var startsOffstage = hasOwn(enteringActors, actorId);
      if (!startsOffstage) {
        var prior = initialByAnchor[anchor.id] || [];
        if (prior.length >= anchor.capacity) {
          var first = prior[0];
          fail('PERF_CONFLICT', castPath + '.at', 'anchor "' + anchor.id + '" 初始 cast 数超过 capacity ' +
            anchor.capacity + '；冲突 actor 为 ' + first.actor + ' 与 ' + actorId + '。请改站位或提高 capacity。',
            { anchor: anchor.id, capacity: anchor.capacity, phase: 'initial',
              first: { actor: first.actor, path: first.path }, second: { actor: actorId, path: castPath } });
        }
        prior.push({ actor: actorId, path: castPath });
        initialByAnchor[anchor.id] = prior;
      }
      var actor = context.actors.byId[actorId];
      var member = {
        actor: actorId, actorDef: actor, anchor: anchor, facing: facing,
        stageFacing: actor.profile.authoredFacing === facing ? 'as-authored' : 'mirror-x',
        startsOffstage: startsOffstage, path: castPath
      };
      list.push(member);
      states[actorId] = {
        anchor: anchor,
        facing: facing,
        stageFacing: member.stageFacing,
        phase: startsOffstage ? 'offstage' : 'onstage',
        transition: null
      };
      eventsByActor[actorId] = [];
    });
    return { list: list, states: states, eventsByActor: eventsByActor };
  }

  function buildSlots(cast, eventsByActor, durationMs) {
    var slots = [];
    cast.forEach(function (member) {
      var cursorMs = 0;
      var anchor = member.anchor;
      var path = member.path;
      var onstage = !member.startsOffstage;
      eventsByActor[member.actor].forEach(function (event) {
        if (event.do === 'enter') {
          slots.push({
            anchor: anchor.id, actor: member.actor, startMs: event.startMs, endMs: event.endMs,
            phase: 'reserved', path: event.path
          });
          cursorMs = event.endMs;
          path = event.path;
          onstage = true;
        } else if (event.do === 'walkTo') {
          if (onstage && cursorMs < event.startMs) slots.push({
            anchor: anchor.id, actor: member.actor, startMs: cursorMs, endMs: event.startMs,
            phase: 'occupied', path: path
          });
          slots.push({
            anchor: event.toAnchor.id, actor: member.actor, startMs: event.startMs, endMs: event.endMs,
            phase: 'reserved', path: event.path
          });
          cursorMs = event.endMs;
          anchor = event.toAnchor;
          path = event.path;
        } else if (event.do === 'exit') {
          if (onstage && cursorMs < event.startMs) slots.push({
            anchor: anchor.id, actor: member.actor, startMs: cursorMs, endMs: event.startMs,
            phase: 'occupied', path: path
          });
          slots.push({
            anchor: anchor.id, actor: member.actor, startMs: event.startMs, endMs: event.endMs,
            phase: 'occupied', path: event.path
          });
          cursorMs = event.endMs;
          onstage = false;
        }
      });
      if (onstage && cursorMs < durationMs) slots.push({
        anchor: anchor.id, actor: member.actor, startMs: cursorMs, endMs: durationMs,
        phase: 'occupied', path: path
      });
    });
    return slots;
  }

  function validateSlotCapacity(slots, anchors) {
    anchors.list.forEach(function (anchor) {
      var local = slots.filter(function (slot) { return slot.anchor === anchor.id && slot.startMs < slot.endMs; });
      if (local.length <= anchor.capacity) return;
      var boundaries = [];
      local.forEach(function (slot) { boundaries.push(slot.startMs); boundaries.push(slot.endMs); });
      boundaries.sort(function (a, b) { return a - b; });
      var unique = boundaries.filter(function (value, index) { return index === 0 || value !== boundaries[index - 1]; });
      for (var i = 0; i < unique.length - 1; i++) {
        var startMs = unique[i], endMs = unique[i + 1];
        if (startMs >= endMs) continue;
        var active = local.filter(function (slot) { return slot.startMs <= startMs && slot.endMs > startMs; });
        if (active.length <= anchor.capacity) continue;
        var later = active[anchor.capacity];
        var detailSlots = active.map(function (slot) {
          return { actor: slot.actor, path: slot.path, phase: slot.phase, startMs: slot.startMs, endMs: slot.endMs };
        });
        fail('PERF_CONFLICT', later.path, 'anchor "' + anchor.id + '" capacity ' + anchor.capacity +
          ' 在 [' + startMs + ',' + endMs + ') 被 ' + active.map(function (slot) { return slot.actor; }).join(', ') +
          ' 同时 reservation/occupancy。请改时序、站位或 capacity；compiler 不会自动挪位。',
          { anchor: anchor.id, capacity: anchor.capacity, overlap: { startMs: startMs, endMs: endMs }, slots: detailSlots });
      }
    });
  }

  function createTrackBuilder(rig, shotPath) {
    var byPart = Object.create(null);
    rig.parts.forEach(function (part) { byPart[part.id] = part; });
    var tracks = [], byKey = Object.create(null);
    function get(target, property) {
      var key = target + '\u0000' + property;
      if (!hasOwn(byKey, key)) {
        var track = { target: target, property: property, keys: [], rest: byPart[target].rest[property] };
        tracks.push(track);
        byKey[key] = track;
      }
      return byKey[key];
    }
    function current(track) {
      return track.keys.length ? track.keys[track.keys.length - 1].value : track.rest;
    }
    function add(track, atMs, value, ease, sourcePath) {
      if (atMs <= 0 || Math.round(atMs) !== atMs || !isFinite(value))
        fail('PERF_OUTPUT', sourcePath || shotPath, 'compiler 生成了非法 numeric key；这是 compiler bug。',
          { target: track.target, property: track.property, atMs: atMs, value: value });
      var previous = track.keys.length ? track.keys[track.keys.length - 1] : null;
      if (previous && previous.atMs === atMs) {
        if (previous.value !== value)
          fail('PERF_OUTPUT', sourcePath || shotPath, 'compiler 对同一 canonical target+property+time 生成了冲突值；这是 compiler bug。',
            { target: track.target, property: track.property, atMs: atMs, first: previous.value, second: value });
        return;
      }
      if (previous && previous.atMs > atMs)
        fail('PERF_OUTPUT', sourcePath || shotPath, 'compiler numeric keys 非单调；这是 compiler bug。');
      track.keys.push({ atMs: atMs, value: value, ease: ease });
    }
    function holdCurrent(track, startMs, sourcePath) {
      if (startMs <= 0) return;
      var previous = track.keys.length ? track.keys[track.keys.length - 1] : null;
      if (!previous || previous.atMs < startMs) add(track, startMs, current(track), 'linear', sourcePath);
    }
    function output() {
      return tracks.map(function (track) {
        return {
          target: track.target,
          property: track.property,
          keys: track.keys.map(function (key) { return { at: key.atMs / 1000, value: key.value, ease: key.ease }; })
        };
      });
    }
    return { get: get, add: add, current: current, holdCurrent: holdCurrent, output: output, byPart: byPart };
  }

  function boundary(startMs, durationMs, index, count) {
    return startMs + (index === count ? durationMs : Math.floor(durationMs * index / count));
  }

  function stageOffset(direction) {
    if (direction === 'left') return { x: -320, y: 0 };
    if (direction === 'right') return { x: 320, y: 0 };
    if (direction === 'above') return { x: 0, y: -180 };
    return { x: 0, y: 180 };
  }

  function lowerEnter(record, builder, member) {
    member.stage.enter = {
      offset: stageOffset(record.direction), dur: record.durationMs / 1000, ease: 'ease-out'
    };
  }

  function lowerExit(record, builder, member) {
    member.stage.exit = {
      offset: stageOffset(record.direction), dur: record.durationMs / 1000, ease: 'ease-in'
    };
  }

  function lowerWalk(record, builder) {
    var profile = record.actorDef.profile;
    var root = profile.root;
    var rootX = builder.get(root, 'x');
    var rootY = builder.get(root, 'y');
    builder.holdCurrent(rootX, record.startMs, record.path);
    builder.holdCurrent(rootY, record.startMs, record.path);
    var rootPart = builder.byPart[root];
    var fromRootX = record.fromAnchor.x - rootPart.pivot.x;
    var fromRootY = record.fromAnchor.y - rootPart.pivot.y;
    var toRootX = record.toAnchor.x - rootPart.pivot.x;
    if (builder.current(rootX) !== fromRootX || builder.current(rootY) !== fromRootY)
      fail('PERF_OUTPUT', record.path, 'typestate anchor 与 canonical root pivot track 不一致；这是 compiler bug。');

    var legLeft = builder.get(profile.legs.left, 'rotate');
    var legRight = builder.get(profile.legs.right, 'rotate');
    var armLeft = builder.get(profile.arms.left.upper, 'rotate');
    var armRight = builder.get(profile.arms.right.upper, 'rotate');
    [legLeft, legRight, armLeft, armRight].forEach(function (track) {
      builder.holdCurrent(track, record.startMs, record.path);
    });

    for (var step = 1; step <= record.steps; step++) {
      var wholeAt = boundary(record.startMs, record.durationMs, step, record.steps);
      var x = fromRootX + (toRootX - fromRootX) * step / record.steps;
      builder.add(rootX, wholeAt, x, step === record.steps ? 'ease-out' : 'ease-in-out', record.path);
    }
    for (var half = 1; half <= record.steps * 2; half++) {
      var halfAt = boundary(record.startMs, record.durationMs, half, record.steps * 2);
      builder.add(rootY, halfAt, half % 2 ? fromRootY - 2 : fromRootY,
        half % 2 ? 'ease-out' : 'ease-in', record.path);
      if (half % 2 === 0) continue;
      var stepIndex = (half - 1) / 2;
      var oddStep = stepIndex % 2 === 0;
      builder.add(legLeft, halfAt, legLeft.rest + (oddStep ? -22 : 18),
        stepIndex === 0 ? 'ease-out' : 'ease-in-out', record.path);
      builder.add(legRight, halfAt, legRight.rest + (oddStep ? 22 : -18),
        stepIndex === 0 ? 'ease-out' : 'ease-in-out', record.path);
      builder.add(armLeft, halfAt, armLeft.rest + (oddStep ? 16 : -20),
        stepIndex === 0 ? 'ease-out' : 'ease-in-out', record.path);
      builder.add(armRight, halfAt, armRight.rest + (oddStep ? -16 : 20),
        stepIndex === 0 ? 'ease-out' : 'ease-in-out', record.path);
    }
    [legLeft, legRight, armLeft, armRight].forEach(function (track) {
      builder.add(track, record.endMs, track.rest, 'ease-out', record.path);
    });
  }

  function lowerLook(record, builder) {
    var head = builder.get(record.actorDef.profile.head, 'rotate');
    builder.holdCurrent(head, record.startMs, record.path);
    var sign = record.localDirection === 'right' ? -1 : 1;
    builder.add(head, record.endMs, head.rest + sign * 8, 'ease-out', record.path);
  }

  function lowerPoint(record, builder) {
    var chain = record.actorDef.profile.arms[record.hand];
    var upper = builder.get(chain.upper, 'rotate');
    var fore = builder.get(chain.fore, 'rotate');
    var hand = builder.get(chain.hand, 'rotate');
    [upper, fore, hand].forEach(function (track) { builder.holdCurrent(track, record.startMs, record.path); });
    var sign = record.localDirection === 'right' ? -1 : 1;
    builder.add(upper, record.endMs, upper.rest + sign * 84, 'ease-out', record.path);
    builder.add(fore, record.endMs, fore.rest, 'ease-out', record.path);
    builder.add(hand, record.endMs, hand.rest + sign * 8, 'ease-out', record.path);
  }

  function addVariantKey(slot, atMs, value, path) {
    if (atMs <= 0 || Math.round(atMs) !== atMs)
      fail('PERF_OUTPUT', path, 'compiler 生成了非法 mouth variant key；这是 compiler bug。',
        { atMs: atMs, value: value });
    var previous = slot.keys.length ? slot.keys[slot.keys.length - 1] : null;
    var previousMs = previous ? Math.round(previous.at * 1000) : 0;
    if (previous && previousMs === atMs) {
      if (previous.value !== value)
        fail('PERF_OUTPUT', path, 'compiler 对同一 mouth variant time 生成了冲突值；这是 compiler bug。',
          { atMs: atMs, first: previous.value, second: value });
      return;
    }
    if (previous && previousMs > atMs)
      fail('PERF_OUTPUT', path, 'compiler mouth variant keys 非单调；这是 compiler bug。');
    slot.keys.push({ at: atMs / 1000, value: value });
  }

  function lowerSay(record, builder, member, rig, parsed) {
    var mouth = null;
    rig.variants.forEach(function (slot) { if (slot.target === record.actorDef.profile.mouth) mouth = slot; });
    if (!mouth)
      fail('PERF_OUTPUT', record.path, 'speaker mouth variant 在 validated rig clone 中消失；这是 compiler bug。');
    record.mouthPattern.forEach(function (value, index) {
      addVariantKey(mouth,
        boundary(record.startMs, record.revealDurationMs, index + 1, record.mouthPattern.length + 1),
        value, record.path);
    });
    addVariantKey(mouth, record.revealEndMs, 'rest', record.path);
    addVariantKey(mouth, parsed.schedule.durationMs, 'rest', record.path);
  }

  function validateCastBudgets(cast, shotPath) {
    var totals = { parts: 0, tracks: 0, keys: 0, variants: 0, states: 0, variantKeys: 0, secondary: 0 };
    cast.forEach(function (member) {
      var rig = member.rig;
      var keys = 0, states = 0, variantKeys = 0;
      rig.tracks.forEach(function (track) { keys += track.keys.length; });
      rig.variants.forEach(function (slot) { states += slot.states.length; variantKeys += slot.keys.length; });
      if (rig.tracks.length > 64 || keys > 512)
        fail('PERF_LIMIT', shotPath + '.sequence', '单 actor lowering 超过现役 rig tracks/keys 上限 64/512。请减少动作或拆 shot.',
          { actor: member.id, tracks: rig.tracks.length, keys: keys });
      totals.parts += rig.parts.length;
      totals.tracks += rig.tracks.length;
      totals.keys += keys;
      totals.variants += rig.variants.length;
      totals.states += states;
      totals.variantKeys += variantKeys;
      totals.secondary += rig.secondary.length;
    });
    var limits = { parts: 64, tracks: 96, keys: 512, variants: 16, states: 48, variantKeys: 192, secondary: 32 };
    ownKeys(limits).forEach(function (name) {
      if (totals[name] > limits[name])
        fail('PERF_LIMIT', shotPath + '.cast', 'cast 聚合 ' + name + ' 超过现役硬上限 ' + limits[name] +
          '；收到 ' + totals[name] + '。请减少 cast/动作或拆 shot。',
          { budget: name, value: totals[name], limit: limits[name] });
    });
  }

  function lowerShot(parsed, context) {
    var lowCast = parsed.cast.list.map(function (member) {
      var rig = cloneTree(member.actorDef.rig, []);
      var root = null;
      rig.parts.forEach(function (part) { if (part.id === member.actorDef.profile.root) root = part; });
      root.rest.x = member.anchor.x - root.pivot.x;
      root.rest.y = member.anchor.y - root.pivot.y;
      var builder = createTrackBuilder(rig, parsed.path);
      var lowMember = { id: member.actor, rig: rig, stage: { facing: member.stageFacing } };
      parsed.schedule.records.forEach(function (record) {
        if (record.actor !== member.actor) return;
        var definition = ACTIONS[record.do];
        if (definition.lowerActor) definition.lowerActor(record, builder, lowMember, rig, parsed);
      });
      rig.tracks = builder.output();
      return lowMember;
    });
    validateCastBudgets(lowCast, parsed.path);
    if (lowCast.length) {
      try {
        Timeline.normalizeCastPlan(lowCast, { path: parsed.path + '.cast', durationMs: parsed.schedule.durationMs });
      } catch (error) {
        var split = splitTimelineError(error, parsed.path + '.cast');
        fail('PERF_OUTPUT', split.path, split.reason +
          '。compiler 生成的低层 cast 未通过现役 normalizer；这是 compiler/action-pack bug。');
      }
    }
    var beat = { dur: parsed.schedule.durationMs / 1000 };
    if (lowCast.length) beat.cast = lowCast;
    var textRecord = null;
    parsed.schedule.records.forEach(function (record) {
      if (record.do === 'say' || record.do === 'caption') textRecord = record;
    });
    if (textRecord) {
      try {
        var textPlan = Timeline.compileReveal(textRecord.text, { path: parsed.path + '.text' });
        if (textPlan.durationMs > parsed.schedule.durationMs)
          fail('PERF_OUTPUT', parsed.path + '.text', 'compiler text duration 越过 shot 终点；这是 compiler bug。',
            { textDurationMs: textPlan.durationMs, shotDurationMs: parsed.schedule.durationMs });
      } catch (error) {
        if (error && error.code) throw error;
        timelineRevealError(error, parsed.path + '.text', 'PERF_OUTPUT');
      }
      if (textRecord.do === 'say') beat.speaker = textRecord.actor;
      beat.text = textRecord.text;
    }
    if (parsed.scene !== undefined) beat.scene = parsed.scene;
    if (parsed.audio !== undefined) beat.audio = parsed.audio;
    if (parsed.run !== undefined) beat.run = parsed.run;
    return beat;
  }

  function traceAction(record) {
    var out = {
      path: record.path,
      do: record.do,
      startMs: record.startMs,
      endMs: record.endMs,
      resources: record.resources.slice(),
      defaults: record.defaults.map(function (item) {
        return { field: item.field, value: item.value, source: item.source };
      })
    };
    if (record.actor !== null) {
      var ordered = { path: out.path, do: out.do, actor: record.actor, startMs: out.startMs, endMs: out.endMs,
        resources: out.resources, defaults: out.defaults };
      return ordered;
    }
    return out;
  }

  function parseShot(source, index, context, seenIds) {
    var path = context.rootPath + '.shots[' + index + ']';
    assertObject(source, path, '{id,cast,sequence,scene?,audio?,run?}');
    assertKnown(source, { id: 1, cast: 1, sequence: 1, scene: 1, audio: 1, run: 1 }, path);
    var id = assertId(requireField(source, 'id', path, '{id,cast,sequence,...}'), path + '.id');
    if (hasOwn(seenIds, id))
      fail('PERF_SCHEMA', path + '.id', 'shot id 重复: ' + id + '。请使用唯一 id。');
    seenIds[id] = 1;
    var scene, audio, run;
    if (hasOwn(source, 'scene')) {
      assertObject(source.scene, path + '.scene', '现役 scene intent object');
      scene = cloneData(source.scene, path + '.scene', []);
    }
    if (hasOwn(source, 'audio')) {
      assertObject(source.audio, path + '.audio', '现役 audio intent object');
      audio = cloneData(source.audio, path + '.audio', []);
    }
    if (hasOwn(source, 'run')) {
      if (typeof source.run !== 'function')
        fail('PERF_SCHEMA', path + '.run', '必须是 (state)=>void 函数；收到 ' + received(source.run) + '。');
      run = source.run;
    }
    var sequenceSource = hasOwn(source, 'sequence') ? source.sequence : null;
    var cast = parseCast(requireField(source, 'cast', path, '{id,cast,sequence,...}'), path, context,
      collectEnteringActors(sequenceSource));
    var schedule = compileSequence(requireField(source, 'sequence', path, '{id,cast,sequence,...}'), path,
      context, cast.states, cast.eventsByActor);
    var slots = buildSlots(cast.list, cast.eventsByActor, schedule.durationMs);
    validateSlotCapacity(slots, context.anchors);
    return { id: id, path: path, cast: cast, schedule: schedule, slots: slots, scene: scene, audio: audio, run: run };
  }

  function compilePerformance(spec, options) {
    if (options === undefined) options = {};
    assertObject(options, 'options', '{path?:string}');
    assertKnown(options, { path: 1 }, 'options');
    var rootPath = 'performance';
    if (hasOwn(options, 'path')) {
      if (typeof options.path !== 'string' || options.path.length === 0)
        fail('PERF_SCHEMA', 'options.path', '必须是非空诊断路径字符串；收到 ' + received(options.path) + '。');
      rootPath = options.path;
    }
    assertObject(spec, rootPath, '{version:1,actors:[],anchors:[],shots:[]}');
    assertKnown(spec, { version: 1, actors: 1, anchors: 1, shots: 1 }, rootPath);
    var version = requireField(spec, 'version', rootPath, '{version:1,actors,anchors,shots}');
    if (version !== 1)
      fail('PERF_SCHEMA', rootPath + '.version', '必须精确为 1；收到 ' + received(version) + '。');
    var actors = parseActors(requireField(spec, 'actors', rootPath, '{version:1,actors,anchors,shots}'), rootPath);
    var anchors = parseAnchors(requireField(spec, 'anchors', rootPath, '{version:1,actors,anchors,shots}'), rootPath);
    var sourceShots = requireField(spec, 'shots', rootPath, '{version:1,actors,anchors,shots}');
    assertDenseArray(sourceShots, rootPath + '.shots', false);
    var context = { rootPath: rootPath, actors: actors, anchors: anchors };
    var seenShotIds = Object.create(null);
    var parsedShots = sourceShots.map(function (shot, index) { return parseShot(shot, index, context, seenShotIds); });
    var beats = parsedShots.map(function (shot) { return lowerShot(shot, context); });
    var trace = {
      version: 1,
      compiler: 'cutscene-performance-v1',
      actionPack: 'cutout-biped-v1',
      shots: parsedShots.map(function (shot) {
        return {
          id: shot.id,
          durationMs: shot.schedule.durationMs,
          actions: shot.schedule.records.map(traceAction),
          slots: shot.slots.map(function (slot) {
            return { anchor: slot.anchor, actor: slot.actor, startMs: slot.startMs, endMs: slot.endMs, phase: slot.phase };
          })
        };
      })
    };
    deepFreezeOutput(beats);
    deepFreezeOutput(trace);
    return Object.freeze({ version: 1, beats: beats, trace: trace });
  }

  return Object.freeze({ compilePerformance: compilePerformance });
});
