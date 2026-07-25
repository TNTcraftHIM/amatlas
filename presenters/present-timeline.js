/* Atlas presenter timeline: deterministic, DOM-free motion and text plans. */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else {
    var api = factory();
    (global.Amatlas = global.Amatlas || {}).Timeline = api;
    global.Amatlas.TimelinePresenter = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MOTION_LAYER_PROPERTIES = ['x', 'y', 'scale', 'rotate', 'opacity'];
  var MOTION_PROPERTIES = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotate', 'opacity'];
  var MOTION_PROPERTY_SET = { x: 1, y: 1, scale: 1, scaleX: 1, scaleY: 1, rotate: 1, opacity: 1 };
  var RIG_PROPERTIES = ['x', 'y', 'rotate', 'scaleX', 'scaleY', 'opacity'];
  var RIG_PROPERTY_SET = { x: 1, y: 1, rotate: 1, scaleX: 1, scaleY: 1, opacity: 1 };
  var EASING_NAMES = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out'];
  var RIG_MAX_DURATION_MS = 60000;
  var RIG_MAX_PARTS = 32;
  var RIG_MAX_DEPTH = 16;
  var RIG_MAX_TRACKS = 64;
  var RIG_MAX_KEYS = 512;
  var RIG_MAX_VARIANTS = 8;
  var RIG_MAX_VARIANT_STATES = 32;
  var RIG_MAX_VARIANT_KEYS = 128;
  var RIG_MAX_SECONDARY = 16;
  var CAST_MAX_MEMBERS = 4;
  var CAST_MAX_PARTS = 64;
  var CAST_MAX_TRACKS = 96;
  var CAST_MAX_KEYS = 512;
  var CAST_MAX_VARIANTS = 16;
  var CAST_MAX_VARIANT_STATES = 48;
  var CAST_MAX_VARIANT_KEYS = 192;
  var CAST_MAX_SECONDARY = 32;
  var CAST_FACING_NAMES = ['as-authored', 'mirror-x'];
  var CAST_FACING_SET = { 'as-authored': 1, 'mirror-x': 1 };
  var STAGE_MAX_OFFSET_X = 320;
  var STAGE_MAX_OFFSET_Y = 180;
  var RIG_SECONDARY_LIMIT = { x: 64, y: 64, rotate: 180, scaleX: 0.5, scaleY: 0.5, opacity: 1 };

  function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }
  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function fail(where, message) { throw new Error(where + ': ' + message); }
  function ownKeys(obj) { return Object.keys(obj); }
  function assertKnown(obj, allowed, where) {
    ownKeys(obj).forEach(function (key) {
      if (!hasOwn(allowed, key)) fail(where + '.' + key, '未知字段');
    });
  }
  function finiteNumber(value, where) {
    if (typeof value !== 'number' || !isFinite(value)) fail(where, '必须是有限数');
    return value;
  }
  function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (isObject(value)) {
      var out = {};
      ownKeys(value).forEach(function (key) { out[key] = clone(value[key]); });
      return out;
    }
    return value;
  }
  function deepFreeze(value) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || Object.isFrozen(value)) return value;
    Object.freeze(value);
    ownKeys(value).forEach(function (key) { deepFreeze(value[key]); });
    return value;
  }
  function received(value) {
    if (value === undefined) return 'undefined';
    if (typeof value === 'number' && !isFinite(value)) return String(value);
    try { return JSON.stringify(value); } catch (e) { return String(value); }
  }

  /* Number seconds are accepted only when the exact value is representable in ms. */
  function secondsToMs(value, where, label) {
    finiteNumber(value, where);
    var ms = value * 1000;
    if (!isFinite(ms) || Math.round(ms) !== ms || Math.abs(ms) > 9007199254740991)
      fail(where, (label || '秒值') + '必须最多三位小数，且可精确转换为整数毫秒；收到 ' + value);
    return ms;
  }

  function assertIdentifier(value, where) {
    if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value))
      fail(where, '必须是受限 layer id（字母/下划线开头，只含字母数字下划线连字符）');
    if (value === '__proto__' || value === 'constructor' || value === 'prototype')
      fail(where, '保留标识符不可用');
  }

  /* art is existing presenter data. Keep its DSL opaque here, but reject executable/injected values. */
  function assertSafeArt(value, where, seen, rootValue) {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
      fail(where, '不接受函数或可执行值');
    if (typeof value === 'number') { finiteNumber(value, where); return; }
    if (typeof value === 'string') {
      if (/[<>;{}]/.test(value) || /javascript:|url\s*\(/i.test(value) ||
          (rootValue && /[.#\[\]\s>:+~]/.test(value)))
        fail(where, '不接受 HTML/CSS selector/脚本或注入字符串');
      return;
    }
    if (value === null || value === undefined || typeof value === 'boolean') return;
    if (seen.indexOf(value) >= 0) fail(where, '不接受循环数据');
    seen.push(value);
    if (Array.isArray(value)) value.forEach(function (item, i) { assertSafeArt(item, where + '[' + i + ']', seen, false); });
    else ownKeys(value).forEach(function (key) {
      if (/^on/i.test(key) || key === 'run' || key === 'event' || key === 'selector')
        fail(where + '.' + key, '不接受事件、selector 或 run');
      assertSafeArt(value[key], where + '.' + key, seen, false);
    });
    seen.pop();
  }

  function validatePropertyValue(property, value, where) {
    finiteNumber(value, where);
    if (property === 'opacity' && (value < 0 || value > 1)) fail(where, 'opacity 必须在 [0,1]');
    if ((property === 'scale' || property === 'scaleX' || property === 'scaleY') && value <= 0)
      fail(where, property + ' 必须大于 0');
  }

  function validateEase(ease, where) {
    if (ease === undefined) return 'linear';
    if (typeof ease !== 'string' || !hasOwn(EASING, ease))
      fail(where, '未知 ease；允许 ' + EASING_NAMES.join('/'));
    return ease;
  }

  function requireField(obj, key, where) {
    if (!hasOwn(obj, key)) fail(where + '.' + key, '缺少必填字段；收到 undefined');
    return obj[key];
  }
  function rigFinite(value, where) {
    if (typeof value !== 'number' || !isFinite(value)) fail(where, '必须是有限数；收到 ' + received(value));
    return value;
  }
  function validateRigPropertyValue(property, value, where) {
    rigFinite(value, where);
    if ((property === 'scaleX' || property === 'scaleY') && value <= 0)
      fail(where, '必须是大于 0 的有限数；收到 ' + received(value));
    if (property === 'opacity' && (value < 0 || value > 1))
      fail(where, 'opacity 必须在 [0,1]；收到 ' + received(value));
    return value;
  }
  function validateRigArt(value, where) {
    if (typeof value !== 'string' && !Array.isArray(value))
      fail(where, '必须是 art preset 名或非空 art-spec 图元数组；收到 ' + received(value));
    if (typeof value === 'string' && !value)
      fail(where, 'art preset 名不能为空；收到 ' + received(value));
    if (Array.isArray(value) && value.length === 0)
      fail(where, 'art-spec 不能为空数组；收到 []');
    assertSafeArt(value, where, [], true);
    return clone(value);
  }
  function rigIntegerRange(value, min, max, where) {
    if (typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value || value < min || value > max)
      fail(where, '必须是 ' + min + '..' + max + ' 的整数；收到 ' + received(value));
    return value;
  }
  function rigUint32(value, where) {
    if (typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value || value < 0 || value > 4294967295)
      fail(where, '必须是 uint32（0..4294967295 整数）；收到 ' + received(value));
    return value;
  }
  function validateSecondaryMagnitude(property, value, where) {
    var limit = RIG_SECONDARY_LIMIT[property];
    if (Math.abs(value) > limit)
      fail(where, property + ' secondary 绝对值不得超过 ' + limit + '；收到 ' + received(value));
    return value;
  }

  function multiplyRigMatrices(left, right) {
    return [
      left[0] * right[0] + left[2] * right[1],
      left[1] * right[0] + left[3] * right[1],
      left[0] * right[2] + left[2] * right[3],
      left[1] * right[2] + left[3] * right[3],
      left[0] * right[4] + left[2] * right[5] + left[4],
      left[1] * right[4] + left[3] * right[5] + left[5]
    ];
  }
  function composeRigLocalMatrix(pivot, pose) {
    var rad = pose.rotate * Math.PI / 180;
    var c = Math.cos(rad), s = Math.sin(rad);
    var a = c * pose.scaleX;
    var b = s * pose.scaleX;
    var c2 = -s * pose.scaleY;
    var d = c * pose.scaleY;
    return [
      a,
      b,
      c2,
      d,
      pose.x + pivot.x - a * pivot.x - c2 * pivot.y,
      pose.y + pivot.y - b * pivot.x - d * pivot.y
    ];
  }
  function assertFiniteRigResult(value, where) {
    if (typeof value !== 'number' || !isFinite(value))
      throw new Error('sampleRig: ' + where + ' 产生非有限数；收到 ' + received(value));
  }

  function normalizeRigPlan(rig, options) {
    options = options || {};
    var where = options.path || 'rig';
    if (!isObject(rig)) fail(where, '必须是对象；收到 ' + received(rig));
    assertKnown(rig, { parts: 1, drawOrder: 1, tracks: 1, variants: 1, secondary: 1 }, where);

    var durationMs = options.durationMs;
    if (typeof durationMs !== 'number' || !isFinite(durationMs) || Math.round(durationMs) !== durationMs || durationMs <= 0)
      fail(where, '内部 durationMs 必须是正整数毫秒；收到 ' + received(durationMs));
    if (durationMs > RIG_MAX_DURATION_MS)
      fail(where, 'durationMs 超过硬上限 ' + RIG_MAX_DURATION_MS + '；收到 ' + durationMs);

    var sourceParts = requireField(rig, 'parts', where);
    var sourceDrawOrder = requireField(rig, 'drawOrder', where);
    var sourceTracks = requireField(rig, 'tracks', where);
    var sourceVariants = requireField(rig, 'variants', where);
    var sourceSecondary = requireField(rig, 'secondary', where);
    if (!Array.isArray(sourceParts)) fail(where + '.parts', '必须是数组；收到 ' + received(sourceParts));
    if (!Array.isArray(sourceDrawOrder)) fail(where + '.drawOrder', '必须是数组；收到 ' + received(sourceDrawOrder));
    if (!Array.isArray(sourceTracks)) fail(where + '.tracks', '必须是数组；收到 ' + received(sourceTracks));
    if (!Array.isArray(sourceVariants)) fail(where + '.variants', '必须是数组；收到 ' + received(sourceVariants));
    if (!Array.isArray(sourceSecondary)) fail(where + '.secondary', '必须是数组；收到 ' + received(sourceSecondary));
    if (sourceParts.length === 0) fail(where + '.parts', '必须是非空数组');
    if (sourceParts.length > RIG_MAX_PARTS)
      fail(where + '.parts', '超过硬上限 ' + RIG_MAX_PARTS + '；收到长度 ' + sourceParts.length);

    var parts = [];
    var partById = Object.create(null);
    var partIndexById = Object.create(null);
    sourceParts.forEach(function (src, i) {
      var p = where + '.parts[' + i + ']';
      if (!isObject(src)) fail(p, '必须是对象；收到 ' + received(src));
      assertKnown(src, { id: 1, parent: 1, art: 1, pivot: 1, rest: 1 }, p);
      var id = requireField(src, 'id', p);
      assertIdentifier(id, p + '.id');
      if (hasOwn(partById, id)) fail(p + '.id', 'part id 重复: ' + id);
      var parent = requireField(src, 'parent', p);
      if (parent !== null) assertIdentifier(parent, p + '.parent');
      var art = validateRigArt(requireField(src, 'art', p), p + '.art');

      var pivotSrc = requireField(src, 'pivot', p);
      if (!isObject(pivotSrc)) fail(p + '.pivot', '必须是对象；收到 ' + received(pivotSrc));
      assertKnown(pivotSrc, { x: 1, y: 1 }, p + '.pivot');
      var pivot = {
        x: rigFinite(requireField(pivotSrc, 'x', p + '.pivot'), p + '.pivot.x'),
        y: rigFinite(requireField(pivotSrc, 'y', p + '.pivot'), p + '.pivot.y')
      };

      var restSrc = requireField(src, 'rest', p);
      if (!isObject(restSrc)) fail(p + '.rest', '必须是对象；收到 ' + received(restSrc));
      assertKnown(restSrc, { x: 1, y: 1, rotate: 1, scaleX: 1, scaleY: 1, opacity: 1 }, p + '.rest');
      var rest = {};
      RIG_PROPERTIES.forEach(function (property) {
        rest[property] = validateRigPropertyValue(property,
          requireField(restSrc, property, p + '.rest'), p + '.rest.' + property);
      });
      var part = { id: id, parent: parent, art: art, pivot: pivot, rest: rest };
      parts.push(part);
      partById[id] = part;
      partIndexById[id] = i;
    });

    var roots = [];
    var childrenById = Object.create(null);
    parts.forEach(function (part) { childrenById[part.id] = []; });
    parts.forEach(function (part) {
      var p = where + '.parts[' + partIndexById[part.id] + '].parent';
      if (part.parent === null) roots.push(part);
      else {
        if (!hasOwn(partById, part.parent)) fail(p, 'parent 不存在: ' + part.parent);
        if (part.parent === part.id) fail(p, 'part 不得自指');
        childrenById[part.parent].push(part);
      }
    });
    if (roots.length !== 1)
      fail(where + '.parts', '必须恰好一个 parent:null 根；收到 ' + roots.length + ' 个');

    var visited = Object.create(null);
    var active = Object.create(null);
    var topoParts = [];
    function visit(part, depth) {
      var pp = where + '.parts[' + partIndexById[part.id] + '].parent';
      if (active[part.id]) fail(pp, 'parent 图成环');
      if (visited[part.id]) return;
      if (depth > RIG_MAX_DEPTH) fail(pp, 'parent 深度超过硬上限 ' + RIG_MAX_DEPTH);
      active[part.id] = 1;
      visited[part.id] = 1;
      topoParts.push(part);
      childrenById[part.id].forEach(function (child) { visit(child, depth + 1); });
      delete active[part.id];
    }
    visit(roots[0], 1);
    if (topoParts.length !== parts.length) {
      var disconnected = parts.filter(function (part) { return !visited[part.id]; })[0];
      fail(where + '.parts[' + partIndexById[disconnected.id] + '].parent', '未连接到唯一根（断连或 parent 图成环）');
    }

    if (sourceDrawOrder.length !== parts.length)
      fail(where + '.drawOrder', '必须是全部 part id 的精确排列；期望长度 ' + parts.length + '，收到 ' + sourceDrawOrder.length);
    var drawOrderSeen = Object.create(null);
    var drawOrder = sourceDrawOrder.map(function (id, i) {
      var p = where + '.drawOrder[' + i + ']';
      assertIdentifier(id, p);
      if (!hasOwn(partById, id)) fail(p, 'drawOrder 含未知 part: ' + id);
      if (hasOwn(drawOrderSeen, id)) fail(p, 'drawOrder 重复 part: ' + id);
      drawOrderSeen[id] = 1;
      return id;
    });
    parts.forEach(function (part) {
      if (!hasOwn(drawOrderSeen, part.id)) fail(where + '.drawOrder', 'drawOrder 缺少 part: ' + part.id);
    });

    if (sourceTracks.length > RIG_MAX_TRACKS)
      fail(where + '.tracks', '超过硬上限 ' + RIG_MAX_TRACKS + '；收到长度 ' + sourceTracks.length);
    var tracks = [];
    var trackSeen = Object.create(null);
    var totalKeys = 0;
    sourceTracks.forEach(function (src, i) {
      var p = where + '.tracks[' + i + ']';
      if (!isObject(src)) fail(p, '必须是对象；收到 ' + received(src));
      assertKnown(src, { target: 1, property: 1, keys: 1 }, p);
      var target = requireField(src, 'target', p);
      assertIdentifier(target, p + '.target');
      if (!hasOwn(partById, target)) fail(p + '.target', 'target 不存在: ' + target);
      var property = requireField(src, 'property', p);
      if (typeof property !== 'string' || !RIG_PROPERTY_SET[property])
        fail(p + '.property', '未知 property；允许 ' + RIG_PROPERTIES.join('/'));
      var trackKey = target + '\u0000' + property;
      if (hasOwn(trackSeen, trackKey)) fail(p, '同一 target+property 重复声明');
      trackSeen[trackKey] = 1;
      var sourceKeys = requireField(src, 'keys', p);
      if (!Array.isArray(sourceKeys) || sourceKeys.length === 0)
        fail(p + '.keys', '必须是非空数组；收到 ' + received(sourceKeys));
      totalKeys += sourceKeys.length;
      if (totalKeys > RIG_MAX_KEYS) fail(p + '.keys', 'numeric keys 总数超过硬上限 ' + RIG_MAX_KEYS);

      var previousAt = 0;
      var keys = sourceKeys.map(function (key, j) {
        var kp = p + '.keys[' + j + ']';
        if (!isObject(key)) fail(kp, '必须是对象；收到 ' + received(key));
        assertKnown(key, { at: 1, value: 1, ease: 1 }, kp);
        var atMs = secondsToMs(requireField(key, 'at', kp), kp + '.at', 'at');
        if (atMs <= 0) fail(kp + '.at', '必须大于 0 秒；收到 ' + received(key.at));
        if (atMs <= previousAt) fail(kp + '.at', '必须严格递增（按绝对时间）');
        if (atMs > durationMs) fail(kp + '.at', '越过非 hold beat 的 dur');
        var value = validateRigPropertyValue(property, requireField(key, 'value', kp), kp + '.value');
        var ease = validateEase(key.ease, kp + '.ease');
        previousAt = atMs;
        return { atMs: atMs, value: value, ease: ease };
      });
      tracks.push({ target: target, property: property,
        baseKey: { atMs: 0, value: partById[target].rest[property], ease: 'linear' }, keys: keys });
    });

    if (sourceVariants.length > RIG_MAX_VARIANTS)
      fail(where + '.variants', 'variant slots 超过硬上限 ' + RIG_MAX_VARIANTS + '；收到长度 ' + sourceVariants.length);
    var variants = [];
    var variantTargetSeen = Object.create(null);
    var totalVariantStates = 0;
    var totalVariantKeys = 0;
    sourceVariants.forEach(function (src, i) {
      var p = where + '.variants[' + i + ']';
      if (!isObject(src)) fail(p, '必须是对象；收到 ' + received(src));
      assertKnown(src, { target: 1, base: 1, states: 1, keys: 1 }, p);
      var target = requireField(src, 'target', p);
      assertIdentifier(target, p + '.target');
      if (!hasOwn(partById, target)) fail(p + '.target', 'target 不存在: ' + target);
      if (hasOwn(variantTargetSeen, target)) fail(p + '.target', '同一 target 最多声明一个 variant slot: ' + target);
      variantTargetSeen[target] = 1;

      var base = requireField(src, 'base', p);
      assertIdentifier(base, p + '.base');
      var sourceStates = requireField(src, 'states', p);
      if (!Array.isArray(sourceStates) || sourceStates.length === 0)
        fail(p + '.states', '必须是非空数组；收到 ' + received(sourceStates));
      totalVariantStates += sourceStates.length;
      if (totalVariantStates > RIG_MAX_VARIANT_STATES)
        fail(p + '.states', 'variant states 总数超过硬上限 ' + RIG_MAX_VARIANT_STATES);
      var stateSeen = Object.create(null);
      stateSeen[base] = 1;
      var states = sourceStates.map(function (state, j) {
        var sp = p + '.states[' + j + ']';
        if (!isObject(state)) fail(sp, '必须是对象；收到 ' + received(state));
        assertKnown(state, { id: 1, art: 1 }, sp);
        var id = requireField(state, 'id', sp);
        assertIdentifier(id, sp + '.id');
        if (hasOwn(stateSeen, id))
          fail(sp + '.id', id === base ? 'state id 不得与 base 重名: ' + id : 'state id 重复: ' + id);
        stateSeen[id] = 1;
        return { id: id, art: validateRigArt(requireField(state, 'art', sp), sp + '.art') };
      });

      var sourceKeys = requireField(src, 'keys', p);
      if (!Array.isArray(sourceKeys)) fail(p + '.keys', '必须是数组；收到 ' + received(sourceKeys));
      totalVariantKeys += sourceKeys.length;
      if (totalVariantKeys > RIG_MAX_VARIANT_KEYS)
        fail(p + '.keys', 'variant keys 总数超过硬上限 ' + RIG_MAX_VARIANT_KEYS);
      var previousAt = 0;
      var keys = sourceKeys.map(function (key, j) {
        var kp = p + '.keys[' + j + ']';
        if (!isObject(key)) fail(kp, '必须是对象；收到 ' + received(key));
        assertKnown(key, { at: 1, value: 1 }, kp);
        var atMs = secondsToMs(requireField(key, 'at', kp), kp + '.at', 'at');
        if (atMs <= 0) fail(kp + '.at', '必须大于 0 秒；收到 ' + received(key.at));
        if (atMs <= previousAt) fail(kp + '.at', '必须严格递增（按绝对时间）');
        if (atMs > durationMs) fail(kp + '.at', '越过非 hold beat 的 dur');
        var value = requireField(key, 'value', kp);
        assertIdentifier(value, kp + '.value');
        if (!hasOwn(stateSeen, value)) fail(kp + '.value', '必须等于 base 或已声明 state id；收到 ' + received(value));
        previousAt = atMs;
        return { atMs: atMs, value: value };
      });
      variants.push({ target: target, base: base, states: states, keys: keys });
    });

    if (sourceSecondary.length > RIG_MAX_SECONDARY)
      fail(where + '.secondary', '超过硬上限 ' + RIG_MAX_SECONDARY + '；收到长度 ' + sourceSecondary.length);
    var secondary = [];
    var secondarySeen = Object.create(null);
    sourceSecondary.forEach(function (src, i) {
      var p = where + '.secondary[' + i + ']';
      if (!isObject(src)) fail(p, '必须是对象；收到 ' + received(src));
      var type = requireField(src, 'type', p);
      if (type !== 'follow' && type !== 'oscillate' && type !== 'blink' && type !== 'noise')
        fail(p + '.type', '未知 type；允许 follow/oscillate/blink/noise；收到 ' + received(type));

      var allowed = type === 'follow'
        ? { type: 1, source: 1, target: 1, property: 1, delayMs: 1, gain: 1, min: 1, max: 1 }
        : type === 'oscillate'
          ? { type: 1, target: 1, property: 1, periodMs: 1, amplitude: 1, phase: 1 }
          : type === 'blink'
            ? { type: 1, target: 1, property: 1, closedValue: 1, windowMs: 1, durationMs: 1, chance: 1, seed: 1 }
            : { type: 1, target: 1, property: 1, windowMs: 1, amplitude: 1, seed: 1 };
      assertKnown(src, allowed, p);

      var target = requireField(src, 'target', p);
      assertIdentifier(target, p + '.target');
      if (!hasOwn(partById, target)) fail(p + '.target', 'target 不存在: ' + target);
      var property = requireField(src, 'property', p);
      if (typeof property !== 'string' || !RIG_PROPERTY_SET[property])
        fail(p + '.property', '未知 property；允许 ' + RIG_PROPERTIES.join('/'));
      if (type === 'blink' && property !== 'scaleY')
        fail(p + '.property', 'blink property 只能是 scaleY；收到 ' + received(property));
      var secondaryKey = target + '\u0000' + property;
      if (hasOwn(secondarySeen, secondaryKey)) fail(p, '同一 target+property 最多声明一个 secondary');
      secondarySeen[secondaryKey] = 1;

      if (type === 'follow') {
        var source = requireField(src, 'source', p);
        if (!isObject(source)) fail(p + '.source', '必须是对象；收到 ' + received(source));
        assertKnown(source, { target: 1, property: 1 }, p + '.source');
        var sourceTarget = requireField(source, 'target', p + '.source');
        assertIdentifier(sourceTarget, p + '.source.target');
        if (!hasOwn(partById, sourceTarget)) fail(p + '.source.target', 'source target 不存在: ' + sourceTarget);
        var sourceProperty = requireField(source, 'property', p + '.source');
        if (typeof sourceProperty !== 'string' || !RIG_PROPERTY_SET[sourceProperty])
          fail(p + '.source.property', '未知 property；允许 ' + RIG_PROPERTIES.join('/'));
        if (sourceTarget === target && sourceProperty === property)
          fail(p + '.source', 'follow source 与 target 不得是完全相同的 part+property');
        var delayMs = rigIntegerRange(requireField(src, 'delayMs', p), 1, 2000, p + '.delayMs');
        var gain = rigFinite(requireField(src, 'gain', p), p + '.gain');
        if (gain < 0 || gain > 2) fail(p + '.gain', '必须在 [0,2]；收到 ' + received(gain));
        var min = rigFinite(requireField(src, 'min', p), p + '.min');
        var max = rigFinite(requireField(src, 'max', p), p + '.max');
        if (min > 0) fail(p + '.min', '必须小于等于 0；收到 ' + received(min));
        if (max < 0) fail(p + '.max', '必须大于等于 0；收到 ' + received(max));
        if (min > max) fail(p, 'min 必须小于等于 max');
        validateSecondaryMagnitude(property, min, p + '.min');
        validateSecondaryMagnitude(property, max, p + '.max');
        secondary.push({ type: type, source: { target: sourceTarget, property: sourceProperty },
          target: target, property: property, delayMs: delayMs, gain: gain, min: min, max: max });
      } else if (type === 'oscillate') {
        var periodMs = rigIntegerRange(requireField(src, 'periodMs', p), 100, 60000, p + '.periodMs');
        var oscillateAmplitude = rigFinite(requireField(src, 'amplitude', p), p + '.amplitude');
        if (oscillateAmplitude <= 0) fail(p + '.amplitude', '必须大于 0；收到 ' + received(oscillateAmplitude));
        validateSecondaryMagnitude(property, oscillateAmplitude, p + '.amplitude');
        var phase = rigFinite(requireField(src, 'phase', p), p + '.phase');
        if (phase < 0 || phase >= 1) fail(p + '.phase', '必须在 [0,1)；收到 ' + received(phase));
        secondary.push({ type: type, target: target, property: property,
          periodMs: periodMs, amplitude: oscillateAmplitude, phase: phase });
      } else if (type === 'blink') {
        var closedValue = rigFinite(requireField(src, 'closedValue', p), p + '.closedValue');
        if (closedValue <= 0 || closedValue > 1)
          fail(p + '.closedValue', '必须在 (0,1]；收到 ' + received(closedValue));
        var blinkWindowMs = rigIntegerRange(requireField(src, 'windowMs', p), 250, 10000, p + '.windowMs');
        var blinkDurationMs = rigIntegerRange(requireField(src, 'durationMs', p), 40, 500, p + '.durationMs');
        if (blinkDurationMs >= blinkWindowMs)
          fail(p + '.durationMs', '必须小于 windowMs；收到 ' + blinkDurationMs + ' >= ' + blinkWindowMs);
        var chance = rigFinite(requireField(src, 'chance', p), p + '.chance');
        if (chance <= 0 || chance > 1) fail(p + '.chance', '必须在 (0,1]；收到 ' + received(chance));
        var blinkSeed = rigUint32(requireField(src, 'seed', p), p + '.seed');
        secondary.push({ type: type, target: target, property: property, closedValue: closedValue,
          windowMs: blinkWindowMs, durationMs: blinkDurationMs, chance: chance, seed: blinkSeed });
      } else {
        var noiseWindowMs = rigIntegerRange(requireField(src, 'windowMs', p), 16, 60000, p + '.windowMs');
        var noiseAmplitude = rigFinite(requireField(src, 'amplitude', p), p + '.amplitude');
        if (noiseAmplitude <= 0) fail(p + '.amplitude', '必须大于 0；收到 ' + received(noiseAmplitude));
        validateSecondaryMagnitude(property, noiseAmplitude, p + '.amplitude');
        var noiseSeed = rigUint32(requireField(src, 'seed', p), p + '.seed');
        secondary.push({ type: type, target: target, property: property,
          windowMs: noiseWindowMs, amplitude: noiseAmplitude, seed: noiseSeed });
      }
    });

    var primaryRanges = Object.create(null);
    parts.forEach(function (part) {
      RIG_PROPERTIES.forEach(function (property) {
        var value = part.rest[property];
        primaryRanges[part.id + '\u0000' + property] = { min: value, max: value };
      });
    });
    tracks.forEach(function (track) {
      var range = primaryRanges[track.target + '\u0000' + track.property];
      track.keys.forEach(function (key) {
        range.min = Math.min(range.min, key.value);
        range.max = Math.max(range.max, key.value);
      });
    });
    secondary.forEach(function (item, i) {
      if (item.property !== 'scaleX' && item.property !== 'scaleY' && item.property !== 'opacity') return;
      var range = primaryRanges[item.target + '\u0000' + item.property];
      var min = range.min, max = range.max;
      if (item.type === 'follow') { min += item.min; max += item.max; }
      else if (item.type === 'oscillate' || item.type === 'noise') {
        min -= item.amplitude;
        max += item.amplitude;
      } else {
        min = Math.min(min, item.closedValue);
        max = Math.max(max, item.closedValue);
      }
      var p = where + '.secondary[' + i + ']';
      if ((item.property === 'scaleX' || item.property === 'scaleY') && min <= 0)
        fail(p, 'secondary 最坏范围无法证明 ' + item.target + '.' + item.property + ' 始终大于 0；收到 [' + min + ',' + max + ']');
      if (item.property === 'opacity' && (min < 0 || max > 1))
        fail(p, 'secondary 最坏范围无法证明 ' + item.target + '.opacity 始终在 [0,1]；收到 [' + min + ',' + max + ']');
    });

    var plan = {
      durationMs: durationMs,
      parts: parts,
      drawOrder: drawOrder,
      tracks: tracks,
      variants: variants,
      secondary: secondary,
      topoParts: topoParts
    };
    var poster = sampleRig(plan, durationMs);
    var rootPart = roots[0];
    var rootFrame = null;
    poster.parts.forEach(function (part) { if (part.id === rootPart.id) rootFrame = part; });
    if (!rootFrame) fail(where, '终态 poster 缺少根 part: ' + rootPart.id);
    if (rootFrame.opacity < 0.01)
      fail(where + '.poster.root.opacity', '终态根 world opacity 必须大于等于 0.01；收到 ' + rootFrame.opacity);
    var pivotWorldX = rootFrame.matrix[0] * rootPart.pivot.x + rootFrame.matrix[2] * rootPart.pivot.y + rootFrame.matrix[4];
    var pivotWorldY = rootFrame.matrix[1] * rootPart.pivot.x + rootFrame.matrix[3] * rootPart.pivot.y + rootFrame.matrix[5];
    if (pivotWorldX < 0 || pivotWorldX > 320)
      fail(where + '.poster.root.pivot.x', '终态根 pivot world x 必须在 [0,320]；收到 ' + pivotWorldX);
    if (pivotWorldY < 0 || pivotWorldY > 180)
      fail(where + '.poster.root.pivot.y', '终态根 pivot world y 必须在 [0,180]；收到 ' + pivotWorldY);
    return deepFreeze(plan);
  }

  function normalizeCastPlan(cast, options) {
    options = options || {};
    var where = options.path || 'cast';
    if (!Array.isArray(cast)) fail(where, '必须是非空数组；收到 ' + received(cast));
    if (cast.length === 0) fail(where, '必须是非空数组');
    if (cast.length > CAST_MAX_MEMBERS)
      fail(where, 'cast members 超过硬上限 ' + CAST_MAX_MEMBERS + '；收到长度 ' + cast.length);

    var seenIds = Object.create(null);
    var totals = { parts: 0, tracks: 0, keys: 0, variants: 0, states: 0, variantKeys: 0, secondary: 0 };
    function addBudget(name, amount, limit, label) {
      totals[name] += amount;
      if (totals[name] > limit)
        fail(where, label + ' 聚合总数超过硬上限 ' + limit + '；收到 ' + totals[name]);
    }

    var normalized = cast.map(function (member, i) {
      var p = where + '[' + i + ']';
      if (!isObject(member)) fail(p, '必须是对象；收到 ' + received(member));
      assertKnown(member, { id: 1, rig: 1, stage: 1 }, p);
      var id = requireField(member, 'id', p);
      assertIdentifier(id, p + '.id');
      if (hasOwn(seenIds, id)) fail(p + '.id', 'cast id 重复: ' + id);
      seenIds[id] = 1;
      var stage = null;
      if (hasOwn(member, 'stage')) {
        if (!isObject(member.stage)) fail(p + '.stage', '必须是对象；收到 ' + received(member.stage));
        assertKnown(member.stage, { facing: 1, enter: 1, exit: 1 }, p + '.stage');
        var facing = requireField(member.stage, 'facing', p + '.stage');
        if (typeof facing !== 'string' || !hasOwn(CAST_FACING_SET, facing))
          fail(p + '.stage.facing', '未知 facing；允许 ' + CAST_FACING_NAMES.join('/'));
        stage = { facing: facing };
        var enterDurationMs = 0;
        if (hasOwn(member.stage, 'enter')) {
          var enterPath = p + '.stage.enter';
          var sourceEnter = member.stage.enter;
          if (!isObject(sourceEnter)) fail(enterPath, '必须是对象；收到 ' + received(sourceEnter));
          assertKnown(sourceEnter, { offset: 1, dur: 1, ease: 1 }, enterPath);
          var sourceOffset = requireField(sourceEnter, 'offset', enterPath);
          if (!isObject(sourceOffset)) fail(enterPath + '.offset', '必须是对象；收到 ' + received(sourceOffset));
          assertKnown(sourceOffset, { x: 1, y: 1 }, enterPath + '.offset');
          var offsetX = rigFinite(requireField(sourceOffset, 'x', enterPath + '.offset'), enterPath + '.offset.x');
          var offsetY = rigFinite(requireField(sourceOffset, 'y', enterPath + '.offset'), enterPath + '.offset.y');
          if (Math.abs(offsetX) > STAGE_MAX_OFFSET_X)
            fail(enterPath + '.offset.x', '绝对值不得超过舞台宽度 ' + STAGE_MAX_OFFSET_X + '；收到 ' + received(offsetX));
          if (Math.abs(offsetY) > STAGE_MAX_OFFSET_Y)
            fail(enterPath + '.offset.y', '绝对值不得超过舞台高度 ' + STAGE_MAX_OFFSET_Y + '；收到 ' + received(offsetY));
          enterDurationMs = secondsToMs(requireField(sourceEnter, 'dur', enterPath), enterPath + '.dur', 'dur');
          if (enterDurationMs <= 0)
            fail(enterPath + '.dur', 'dur 必须是有限正数秒；收到 ' + received(sourceEnter.dur));
          if (enterDurationMs > options.durationMs)
            fail(enterPath + '.dur', '不得超过 beat duration ' + options.durationMs + 'ms；收到 ' + enterDurationMs + 'ms');
          if (hasOwn(sourceEnter, 'ease') && sourceEnter.ease === undefined)
            fail(enterPath + '.ease', '存在时必须是已知 ease 字符串；收到 undefined');
          stage.enter = {
            offset: { x: offsetX, y: offsetY },
            durationMs: enterDurationMs,
            ease: hasOwn(sourceEnter, 'ease') ? validateEase(sourceEnter.ease, enterPath + '.ease') : 'ease-out'
          };
        }
        if (hasOwn(member.stage, 'exit')) {
          var exitPath = p + '.stage.exit';
          var sourceExit = member.stage.exit;
          if (!isObject(sourceExit)) fail(exitPath, '必须是对象；收到 ' + received(sourceExit));
          assertKnown(sourceExit, { offset: 1, dur: 1, ease: 1 }, exitPath);
          var sourceExitOffset = requireField(sourceExit, 'offset', exitPath);
          if (!isObject(sourceExitOffset)) fail(exitPath + '.offset', '必须是对象；收到 ' + received(sourceExitOffset));
          assertKnown(sourceExitOffset, { x: 1, y: 1 }, exitPath + '.offset');
          var exitOffsetX = rigFinite(requireField(sourceExitOffset, 'x', exitPath + '.offset'), exitPath + '.offset.x');
          var exitOffsetY = rigFinite(requireField(sourceExitOffset, 'y', exitPath + '.offset'), exitPath + '.offset.y');
          if (Math.abs(exitOffsetX) > STAGE_MAX_OFFSET_X)
            fail(exitPath + '.offset.x', '绝对值不得超过舞台宽度 ' + STAGE_MAX_OFFSET_X + '；收到 ' + received(exitOffsetX));
          if (Math.abs(exitOffsetY) > STAGE_MAX_OFFSET_Y)
            fail(exitPath + '.offset.y', '绝对值不得超过舞台高度 ' + STAGE_MAX_OFFSET_Y + '；收到 ' + received(exitOffsetY));
          var exitDurationMs = secondsToMs(requireField(sourceExit, 'dur', exitPath), exitPath + '.dur', 'dur');
          if (exitDurationMs <= 0)
            fail(exitPath + '.dur', 'dur 必须是有限正数秒；收到 ' + received(sourceExit.dur));
          if (exitDurationMs > options.durationMs)
            fail(exitPath + '.dur', '不得超过 beat duration ' + options.durationMs + 'ms；收到 ' + exitDurationMs + 'ms');
          if (enterDurationMs + exitDurationMs > options.durationMs)
            fail(exitPath + '.dur', 'enter duration ' + enterDurationMs + 'ms 与 exit duration ' + exitDurationMs +
              'ms 总和不得超过 beat duration ' + options.durationMs + 'ms');
          if (hasOwn(sourceExit, 'ease') && sourceExit.ease === undefined)
            fail(exitPath + '.ease', '存在时必须是已知 ease 字符串；收到 undefined');
          stage.exit = {
            offset: { x: exitOffsetX, y: exitOffsetY },
            durationMs: exitDurationMs,
            startMs: options.durationMs - exitDurationMs,
            ease: hasOwn(sourceExit, 'ease') ? validateEase(sourceExit.ease, exitPath + '.ease') : 'ease-in'
          };
        }
      }
      var rig = normalizeRigPlan(requireField(member, 'rig', p), {
        path: p + '.rig', durationMs: options.durationMs
      });

      addBudget('parts', rig.parts.length, CAST_MAX_PARTS, 'parts');
      addBudget('tracks', rig.tracks.length, CAST_MAX_TRACKS, 'numeric tracks');
      var numericKeys = 0;
      rig.tracks.forEach(function (track) { numericKeys += track.keys.length; });
      addBudget('keys', numericKeys, CAST_MAX_KEYS, 'numeric keys');
      addBudget('variants', rig.variants.length, CAST_MAX_VARIANTS, 'variant slots');
      var states = 0, variantKeys = 0;
      rig.variants.forEach(function (slot) {
        states += slot.states.length;
        variantKeys += slot.keys.length;
      });
      addBudget('states', states, CAST_MAX_VARIANT_STATES, 'variant states');
      addBudget('variantKeys', variantKeys, CAST_MAX_VARIANT_KEYS, 'variant keys');
      addBudget('secondary', rig.secondary.length, CAST_MAX_SECONDARY, 'secondary');
      var normalizedMember = { id: id, rig: rig };
      if (stage) normalizedMember.stage = stage;
      return normalizedMember;
    });
    return deepFreeze(normalized);
  }

  function unitHash(seed, index, salt) {
    var x = (seed ^ Math.imul((index + 1) >>> 0, 0x9e3779b1)
                  ^ Math.imul((salt + 1) >>> 0, 0x85ebca6b)) >>> 0;
    x = Math.imul((x ^ (x >>> 16)) >>> 0, 0x7feb352d) >>> 0;
    x = Math.imul((x ^ (x >>> 15)) >>> 0, 0x846ca68b) >>> 0;
    x = (x ^ (x >>> 16)) >>> 0;
    return x / 4294967296;
  }

  function sampleRigPrimary(plan, partById, target, property, tMs) {
    var part = partById[target];
    if (!part) throw new Error('sampleRig: primary target 不存在 "' + target + '"');
    for (var i = 0; i < plan.tracks.length; i++) {
      var track = plan.tracks[i];
      if (track.target === target && track.property === property) return sampleTrack(track, tMs);
    }
    return part.rest[property];
  }

  function sampleRig(plan, tMs) {
    if (!plan || !Array.isArray(plan.parts) || !Array.isArray(plan.tracks) ||
        !Array.isArray(plan.variants) ||
        !Array.isArray(plan.drawOrder) || !Array.isArray(plan.topoParts) ||
        typeof plan.durationMs !== 'number' || !isFinite(plan.durationMs))
      throw new Error('sampleRig: 非法计划');
    finiteNumber(tMs, 'sampleRig.tMs');
    var time = Math.max(0, Math.min(plan.durationMs, tMs));
    var primaryById = Object.create(null);
    var localById = Object.create(null);
    var partById = Object.create(null);
    var variantById = Object.create(null);
    plan.parts.forEach(function (part) {
      partById[part.id] = part;
      variantById[part.id] = null;
      primaryById[part.id] = {
        x: part.rest.x,
        y: part.rest.y,
        rotate: part.rest.rotate,
        scaleX: part.rest.scaleX,
        scaleY: part.rest.scaleY,
        opacity: part.rest.opacity
      };
    });
    plan.tracks.forEach(function (track) {
      if (!primaryById[track.target]) throw new Error('sampleRig: track target 不存在 "' + track.target + '"');
      primaryById[track.target][track.property] = sampleTrack(track, time);
    });
    plan.variants.forEach(function (slot) {
      if (!hasOwn(variantById, slot.target)) throw new Error('sampleRig: variant target 不存在 "' + slot.target + '"');
      var current = slot.base;
      for (var i = 0; i < slot.keys.length; i++) {
        if (time < slot.keys[i].atMs) break;
        current = slot.keys[i].value;
      }
      variantById[slot.target] = current;
    });
    plan.parts.forEach(function (part) {
      var primary = primaryById[part.id];
      localById[part.id] = {
        x: primary.x,
        y: primary.y,
        rotate: primary.rotate,
        scaleX: primary.scaleX,
        scaleY: primary.scaleY,
        opacity: primary.opacity
      };
    });

    if (!Array.isArray(plan.secondary)) throw new Error('sampleRig: 非法 secondary 计划');
    if (time < plan.durationMs) plan.secondary.forEach(function (item) {
      var target = localById[item.target];
      var primary = primaryById[item.target];
      if (!target || !primary) throw new Error('sampleRig: secondary target 不存在 "' + item.target + '"');
      if (item.type === 'follow') {
        var now = primaryById[item.source.target][item.source.property];
        var delayed = sampleRigPrimary(plan, partById, item.source.target, item.source.property,
          Math.max(0, time - item.delayMs));
        var delta = Math.max(item.min, Math.min(item.max, (delayed - now) * item.gain));
        target[item.property] = primary[item.property] + delta;
      } else if (item.type === 'oscillate') {
        target[item.property] = primary[item.property] + item.amplitude *
          Math.sin(2 * Math.PI * (time / item.periodMs + item.phase));
      } else if (item.type === 'noise') {
        var n = Math.floor(time / item.windowMs);
        var u = (time - n * item.windowMs) / item.windowMs;
        var q = u * u * (3 - 2 * u);
        var r0 = 2 * unitHash(item.seed, n, 0) - 1;
        var r1 = 2 * unitHash(item.seed, n + 1, 0) - 1;
        target[item.property] = primary[item.property] + item.amplitude * (r0 + (r1 - r0) * q);
      } else if (item.type === 'blink') {
        var windowIndex = Math.floor(time / item.windowMs);
        var local = time - windowIndex * item.windowMs;
        if (unitHash(item.seed, windowIndex, 0) < item.chance) {
          var start = Math.floor(unitHash(item.seed, windowIndex, 1) *
            (item.windowMs - item.durationMs + 1));
          if (start <= local && local < start + item.durationMs) target.scaleY = item.closedValue;
        }
      } else throw new Error('sampleRig: 未知 secondary type "' + item.type + '"');
    });

    var worldById = Object.create(null);
    plan.topoParts.forEach(function (part) {
      var pose = localById[part.id];
      RIG_PROPERTIES.forEach(function (property) { assertFiniteRigResult(pose[property], part.id + '.' + property); });
      var localMatrix = composeRigLocalMatrix(part.pivot, pose);
      var matrix = localMatrix;
      var opacity = pose.opacity;
      if (part.parent !== null) {
        var parentWorld = worldById[part.parent];
        if (!parentWorld) throw new Error('sampleRig: topoParts 不是根到叶顺序，缺 parent "' + part.parent + '"');
        matrix = multiplyRigMatrices(parentWorld.matrix, localMatrix);
        opacity = parentWorld.opacity * pose.opacity;
      }
      matrix.forEach(function (value, i) { assertFiniteRigResult(value, part.id + '.matrix[' + i + ']'); });
      assertFiniteRigResult(opacity, part.id + '.opacity');
      worldById[part.id] = { matrix: matrix, opacity: opacity };
    });

    return { parts: plan.drawOrder.map(function (id) {
      var world = worldById[id];
      if (!world || !partById[id]) throw new Error('sampleRig: drawOrder 含未知 part "' + id + '"');
      return { id: id, matrix: world.matrix.slice(), opacity: world.opacity, variant: variantById[id] };
    }) };
  }

  function normalizeMotionPlan(motion, options) {
    options = options || {};
    var where = options.path || 'motion';
    if (!isObject(motion)) fail(where, '必须是对象');
    assertKnown(motion, { layers: 1, tracks: 1 }, where);
    if (!Array.isArray(motion.layers)) fail(where + '.layers', '必须是数组');
    if (!Array.isArray(motion.tracks)) fail(where + '.tracks', '必须是数组');

    var layers = [];
    var layerById = {};
    motion.layers.forEach(function (src, i) {
      var p = where + '.layers[' + i + ']';
      if (!isObject(src)) fail(p, '必须是对象');
      assertKnown(src, { id: 1, art: 1, x: 1, y: 1, scale: 1, rotate: 1, opacity: 1 }, p);
      if (src.id === undefined) fail(p + '.id', '缺少 layer id');
      assertIdentifier(src.id, p + '.id');
      if (hasOwn(layerById, src.id)) fail(p + '.id', 'layer id 重复: ' + src.id);
      if (src.art === undefined) fail(p + '.art', '缺少 art');
      assertSafeArt(src.art, p + '.art', [], true);

      var layer = { id: src.id, art: clone(src.art), x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 };
      MOTION_LAYER_PROPERTIES.forEach(function (property) {
        if (src[property] !== undefined) {
          validatePropertyValue(property, src[property], p + '.' + property);
          layer[property] = src[property];
        }
      });
      layerById[layer.id] = layer;
      layers.push(layer);
    });

    var durationMs = options.durationMs;
    if (durationMs !== undefined && durationMs !== null && (!isFinite(durationMs) || durationMs <= 0 || Math.round(durationMs) !== durationMs))
      fail(where, '内部 durationMs 必须是正整数毫秒');

    var tracks = [];
    var seenTracks = {};
    var scaleTrackModeByTarget = {};
    motion.tracks.forEach(function (src, i) {
      var p = where + '.tracks[' + i + ']';
      if (!isObject(src)) fail(p, '必须是对象');
      assertKnown(src, { target: 1, property: 1, keys: 1 }, p);
      if (src.target === undefined) fail(p + '.target', '缺少 target');
      assertIdentifier(src.target, p + '.target');
      if (!hasOwn(layerById, src.target)) fail(p + '.target', 'target 不存在: ' + src.target);
      if (typeof src.property !== 'string' || !MOTION_PROPERTY_SET[src.property])
        fail(p + '.property', '未知 property；允许 ' + MOTION_PROPERTIES.join('/'));
      var scaleMode = src.property === 'scale' ? 'uniform'
        : (src.property === 'scaleX' || src.property === 'scaleY') ? 'axis' : null;
      if (scaleMode && hasOwn(scaleTrackModeByTarget, src.target) && scaleTrackModeByTarget[src.target] !== scaleMode)
        fail(p + '.property', '同一 target 的 scale 与 scaleX/scaleY 不得同时声明');
      if (scaleMode) scaleTrackModeByTarget[src.target] = scaleMode;
      var trackKey = src.target + '\u0000' + src.property;
      if (hasOwn(seenTracks, trackKey)) fail(p, '同一 target+property 重复声明');
      seenTracks[trackKey] = 1;
      if (!Array.isArray(src.keys) || src.keys.length === 0) fail(p + '.keys', '必须是非空数组');

      var previousAt = 0;
      var keys = [];
      src.keys.forEach(function (key, j) {
        var kp = p + '.keys[' + j + ']';
        if (!isObject(key)) fail(kp, '必须是对象');
        assertKnown(key, { at: 1, value: 1, ease: 1 }, kp);
        if (key.at === undefined) fail(kp + '.at', '缺少 at');
        var atMs = secondsToMs(key.at, kp + '.at', 'at');
        if (atMs <= 0) fail(kp + '.at', '必须大于 0 秒');
        if (atMs <= previousAt) fail(kp + '.at', '必须严格递增（按绝对时间）');
        if (!options.hold && durationMs != null && atMs > durationMs)
          fail(kp + '.at', '越过非 hold beat 的 dur');
        if (key.value === undefined) fail(kp + '.value', '缺少 value');
        validatePropertyValue(src.property, key.value, kp + '.value');
        var ease = validateEase(key.ease, kp + '.ease');
        keys.push({ atMs: atMs, value: key.value, ease: ease });
        previousAt = atMs;
      });
      var baseValue = (src.property === 'scaleX' || src.property === 'scaleY')
        ? layerById[src.target].scale : layerById[src.target][src.property];
      tracks.push({ target: src.target, property: src.property,
        baseKey: { atMs: 0, value: baseValue, ease: 'linear' }, keys: keys });
    });

    return { layers: layers, tracks: tracks };
  }

  function cubicBezier(x1, y1, x2, y2) {
    function bezier(a, b, c, d, t) {
      var mt = 1 - t;
      return 3 * mt * mt * t * a + 3 * mt * t * t * b + t * t * t * d;
    }
    return function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      var lo = 0, hi = 1, u = 0.5;
      /* Fixed bisection count makes the sampler reproducible across refresh rates. */
      for (var i = 0; i < 30; i++) {
        u = (lo + hi) / 2;
        if (bezier(x1, x2, 1, 1, u) < p) lo = u;
        else hi = u;
      }
      return bezier(y1, y2, 1, 1, u);
    };
  }

  var EASING = {
    linear: function (p) { return p <= 0 ? 0 : p >= 1 ? 1 : p; },
    ease: cubicBezier(0.25, 0.1, 0.25, 1),
    'ease-in': cubicBezier(0.42, 0, 1, 1),
    'ease-out': cubicBezier(0, 0, 0.58, 1),
    'ease-in-out': cubicBezier(0.42, 0, 0.58, 1)
  };

  function sampleStageEnter(enter, tMs) {
    if (!isObject(enter) || !isObject(enter.offset) ||
        typeof enter.offset.x !== 'number' || !isFinite(enter.offset.x) ||
        typeof enter.offset.y !== 'number' || !isFinite(enter.offset.y) ||
        typeof enter.durationMs !== 'number' || !isFinite(enter.durationMs) ||
        enter.durationMs <= 0 || Math.round(enter.durationMs) !== enter.durationMs ||
        typeof enter.ease !== 'string' || !hasOwn(EASING, enter.ease))
      throw new Error('sampleStageEnter: 非法规范化 enter plan');
    finiteNumber(tMs, 'sampleStageEnter.tMs');
    var time = Math.max(0, Math.min(enter.durationMs, tMs));
    if (time === 0) return { offset: { x: enter.offset.x, y: enter.offset.y }, opacity: 0 };
    if (time === enter.durationMs) return { offset: { x: 0, y: 0 }, opacity: 1 };
    var progress = EASING[enter.ease](time / enter.durationMs);
    return {
      offset: { x: enter.offset.x * (1 - progress), y: enter.offset.y * (1 - progress) },
      opacity: progress
    };
  }

  function sampleStageExit(exit, tMs) {
    var validKeys = { offset: 1, durationMs: 1, startMs: 1, ease: 1 };
    var validOffsetKeys = { x: 1, y: 1 };
    if (!isObject(exit) || ownKeys(exit).some(function (key) { return !hasOwn(validKeys, key); }) ||
        !isObject(exit.offset) || ownKeys(exit.offset).some(function (key) { return !hasOwn(validOffsetKeys, key); }) ||
        typeof exit.offset.x !== 'number' || !isFinite(exit.offset.x) || Math.abs(exit.offset.x) > STAGE_MAX_OFFSET_X ||
        typeof exit.offset.y !== 'number' || !isFinite(exit.offset.y) || Math.abs(exit.offset.y) > STAGE_MAX_OFFSET_Y ||
        typeof exit.durationMs !== 'number' || !isFinite(exit.durationMs) ||
        exit.durationMs <= 0 || Math.round(exit.durationMs) !== exit.durationMs ||
        typeof exit.startMs !== 'number' || !isFinite(exit.startMs) ||
        exit.startMs < 0 || Math.round(exit.startMs) !== exit.startMs ||
        exit.startMs + exit.durationMs > 9007199254740991 ||
        typeof exit.ease !== 'string' || !hasOwn(EASING, exit.ease))
      throw new Error('sampleStageExit: 非法规范化 exit plan');
    finiteNumber(tMs, 'sampleStageExit.tMs');
    var endMs = exit.startMs + exit.durationMs;
    if (tMs <= exit.startMs) return { offset: { x: 0, y: 0 }, opacity: 1 };
    if (tMs >= endMs) return { offset: { x: exit.offset.x, y: exit.offset.y }, opacity: 0 };
    var progress = EASING[exit.ease]((tMs - exit.startMs) / exit.durationMs);
    return {
      offset: { x: exit.offset.x * progress, y: exit.offset.y * progress },
      opacity: 1 - progress
    };
  }

  function sampleTrack(track, tMs) {
    if (!track || !track.baseKey || !Array.isArray(track.keys)) throw new Error('sampleTrack: 非法轨道');
    finiteNumber(tMs, 'sampleTrack.tMs');
    if (tMs <= track.baseKey.atMs) return track.baseKey.value;
    var previous = track.baseKey;
    for (var i = 0; i < track.keys.length; i++) {
      var next = track.keys[i];
      if (tMs <= next.atMs) {
        var p = (tMs - previous.atMs) / (next.atMs - previous.atMs);
        p = Math.max(0, Math.min(1, p));
        var ease = EASING[next.ease];
        if (typeof ease !== 'function') throw new Error('sampleTrack: 未知 ease "' + next.ease + '"');
        var eased = ease(p);
        return previous.value + (next.value - previous.value) * eased;
      }
      previous = next;
    }
    return previous.value;
  }

  function sampleMotion(plan, tMs) {
    if (!plan || !Array.isArray(plan.layers) || !Array.isArray(plan.tracks)) throw new Error('sampleMotion: 非法计划');
    finiteNumber(tMs, 'sampleMotion.tMs');
    var out = {};
    var axisTargets = {};
    plan.tracks.forEach(function (track) {
      if (track.property === 'scaleX' || track.property === 'scaleY') axisTargets[track.target] = 1;
    });
    plan.layers.forEach(function (layer) {
      var values = {};
      MOTION_LAYER_PROPERTIES.forEach(function (property) { values[property] = layer[property]; });
      if (hasOwn(axisTargets, layer.id)) {
        values.scaleX = layer.scale;
        values.scaleY = layer.scale;
      }
      out[layer.id] = values;
    });
    plan.tracks.forEach(function (track) {
      if (!out[track.target]) throw new Error('sampleMotion: track target 不存在 "' + track.target + '"');
      out[track.target][track.property] = sampleTrack(track, tMs);
    });
    return out;
  }

  function validateCps(value, where) {
    finiteNumber(value, where);
    if (value <= 0) fail(where, 'cps 必须大于 0');
    return value;
  }

  function compileReveal(textPlan, options) {
    options = options || {};
    var where = options.path || 'text';
    if (!isObject(textPlan)) fail(where, '必须是对象');
    assertKnown(textPlan, { mode: 1, lines: 1 }, where);
    if (textPlan.mode !== 'typewriter') fail(where + '.mode', '必须是 "typewriter"');
    if (!Array.isArray(textPlan.lines) || textPlan.lines.length === 0) fail(where + '.lines', '必须是非空数组');
    if (options.locale !== undefined && typeof options.locale !== 'string') fail(where + '.locale', '必须是字符串');
    if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function')
      fail(where, '当前环境缺少 Intl.Segmenter，Phase 1 不使用 split 回退');
    var segmenter;
    try { segmenter = new Intl.Segmenter(options.locale, { granularity: 'grapheme' }); }
    catch (e) { fail(where + '.locale', '不是有效的 Intl.Segmenter locale'); }

    var cursorMs = 0;
    var graphemes = [];
    var lines = [];
    textPlan.lines.forEach(function (line, li) {
      var lp = where + '.lines[' + li + ']';
      if (!isObject(line)) fail(lp, '必须是对象');
      assertKnown(line, { cps: 1, chunks: 1 }, lp);
      if (!Array.isArray(line.chunks) || line.chunks.length === 0) fail(lp + '.chunks', '必须是非空数组');
      if (line.cps !== undefined) validateCps(line.cps, lp + '.cps');
      var lineChunks = [];
      var lineText = '';
      line.chunks.forEach(function (chunk, ci) {
        var cp = lp + '.chunks[' + ci + ']';
        if (!isObject(chunk)) fail(cp, '必须是对象');
        assertKnown(chunk, { text: 1, cps: 1, pauseAfter: 1 }, cp);
        if (typeof chunk.text !== 'string') fail(cp + '.text', '必须是字符串');
        var cps = chunk.cps !== undefined ? validateCps(chunk.cps, cp + '.cps') : line.cps;
        if (cps === undefined) fail(cp + '.cps', '缺少 cps（chunk 或 line 至少提供一个）');
        var pauseMs = chunk.pauseAfter === undefined ? 0 : secondsToMs(chunk.pauseAfter, cp + '.pauseAfter', 'pauseAfter');
        if (pauseMs < 0) fail(cp + '.pauseAfter', '必须大于等于 0 秒');
        var parts = [];
        var iterator = segmenter.segment(chunk.text);
        for (var part of iterator) parts.push(part.segment);
        var startMs = cursorMs;
        var times = [];
        for (var gi = 0; gi < parts.length; gi++) {
          var atMs = startMs + Math.round(gi * 1000 / cps);
          times.push(atMs);
          graphemes.push({ text: parts[gi], atMs: atMs });
        }
        var endMs = startMs + Math.round(parts.length * 1000 / cps);
        cursorMs = endMs + pauseMs;
        lineText += chunk.text;
        lineChunks.push({ text: chunk.text, cps: cps, pauseAfterMs: pauseMs,
          startMs: startMs, endMs: endMs, graphemes: parts.map(function (part, index) {
            return { text: part, atMs: times[index] };
          }) });
      });
      lines.push({ text: lineText, chunks: lineChunks });
    });
    return { mode: 'typewriter', lines: lines, graphemes: graphemes, durationMs: cursorMs };
  }

  function revealCount(plan, tMs) {
    if (!plan || !Array.isArray(plan.graphemes)) throw new Error('revealCount: 非法计划');
    finiteNumber(tMs, 'revealCount.tMs');
    var lo = 0, hi = plan.graphemes.length;
    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      if (plan.graphemes[mid].atMs <= tMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /* One presenter-layer clock fans a playback key out to every registered patch consumer. */
  function createPlaybackManager(options) {
    options = options || {};
    var session = null;
    var generation = 0;
    var boundApis = [];

    function rafFunction() {
      if (hasOwn(options, 'requestAnimationFrame')) return options.requestAnimationFrame;
      return typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    }
    function cancelFunction() {
      if (hasOwn(options, 'cancelAnimationFrame')) return options.cancelAnimationFrame;
      return typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : null;
    }
    function validateKey(value) {
      if (typeof value !== 'string' || !value) fail('playback.key', '必须是非空字符串');
    }
    function validateDuration(value) {
      if (typeof value !== 'number' || !isFinite(value) || value < 0 || Math.round(value) !== value)
        fail('playback.durationMs', '必须是大于等于 0 的整数毫秒');
    }
    function consumerList(target) {
      return Object.keys(target.consumers).map(function (id) { return target.consumers[id]; });
    }
    function patchAll(target, tMs) {
      consumerList(target).forEach(function (patch) { patch(tMs); });
    }
    function cancelPending(target) {
      if (!target || target.rafId == null) return;
      var cancel = cancelFunction();
      if (typeof cancel === 'function') {
        try { cancel(target.rafId); } catch (e) {}
      }
      target.rafId = null;
    }
    function invalidate(reset) {
      var previous = session;
      generation++;
      session = null;
      cancelPending(previous);
      if (previous && reset !== false) patchAll(previous, 0);
    }
    function schedule(target) {
      if (target !== session || target.rafId != null || target.finished) return;
      var raf = rafFunction();
      if (typeof raf !== 'function') {
        target.activeMs = target.durationMs;
        target.finished = true;
        patchAll(target, target.durationMs);
        return;
      }
      var expectedGeneration = generation;
      target.rafId = raf(function (timestamp) {
        if (expectedGeneration !== generation || target !== session) return;
        target.rafId = null;
        var validTimestamp = typeof timestamp === 'number' && isFinite(timestamp);
        var delta = validTimestamp && target.lastTimestamp !== null
          ? Math.min(Math.max(timestamp - target.lastTimestamp, 0), 250)
          : 0;
        if (validTimestamp) target.lastTimestamp = timestamp;
        target.activeMs = Math.min(target.activeMs + delta, target.durationMs);
        patchAll(target, target.activeMs);
        if (expectedGeneration !== generation || target !== session) return;
        if (target.activeMs >= target.durationMs) target.finished = true;
        else schedule(target);
      });
    }
    function prepare(key) {
      validateKey(key);
      if (session && session.key !== key) invalidate(true);
    }
    function register(config) {
      if (!isObject(config)) fail('playback.register', '必须是对象');
      assertKnown(config, { consumerId: 1, key: 1, durationMs: 1, patch: 1, reducedMotion: 1 }, 'playback.register');
      if (typeof config.consumerId !== 'string' || !config.consumerId)
        fail('playback.consumerId', '必须是非空字符串');
      validateKey(config.key);
      validateDuration(config.durationMs);
      if (typeof config.patch !== 'function') fail('playback.patch', '必须是函数');
      if (config.reducedMotion !== undefined && typeof config.reducedMotion !== 'boolean')
        fail('playback.reducedMotion', '必须是布尔值');

      prepare(config.key);
      if (!session) {
        session = {
          key: config.key,
          durationMs: config.durationMs,
          activeMs: 0,
          lastTimestamp: null,
          consumers: Object.create(null),
          rafId: null,
          finished: config.durationMs === 0
        };
      } else if (session.durationMs !== config.durationMs) {
        fail('playback.durationMs', '同一 playback key 的 durationMs 不一致');
      }

      var target = session;
      target.consumers[config.consumerId] = config.patch;
      var instant = config.reducedMotion || typeof rafFunction() !== 'function';
      if (instant && !target.finished) {
        generation++;
        cancelPending(target);
        target.activeMs = target.durationMs;
        target.finished = true;
        patchAll(target, target.durationMs);
      } else {
        config.patch(target.finished ? target.durationMs : target.activeMs);
      }
      schedule(target);
      return target.activeMs;
    }
    function unregister(consumerId, reset) {
      if (!session || typeof consumerId !== 'string' || !hasOwn(session.consumers, consumerId)) return;
      var patch = session.consumers[consumerId];
      delete session.consumers[consumerId];
      if (reset !== false) patch(0);
      if (Object.keys(session.consumers).length === 0) invalidate(false);
    }
    function bindLifecycle(api) {
      if (!api || typeof api.registerModule !== 'function' || boundApis.indexOf(api) >= 0) return;
      // cutscene 在注册自身 enter system 前先绑定本模块，因此新节点先清旧 playback，
      // 随后的同步 api.apply -> render 才注册新 key；enter/restore 都保留 critical lifecycle 语义。
      api.registerModule({
        id: 'presenter-timeline-lifecycle',
        nodeKinds: [],
        systems: [
          { on: 'enter', run: function () { invalidate(true); } },
          { on: 'restore', run: function (state, event) {
            if (!event || event.phase === 'deactivate') invalidate(true);
          } }
        ]
      });
      boundApis.push(api);
    }
    function inspect() {
      return session ? {
        key: session.key,
        durationMs: session.durationMs,
        activeMs: session.activeMs,
        consumerCount: Object.keys(session.consumers).length,
        running: session.rafId != null,
        finished: session.finished,
        generation: generation
      } : { key: null, consumerCount: 0, running: false, generation: generation };
    }

    return {
      register: register,
      unregister: unregister,
      prepare: prepare,
      invalidate: invalidate,
      bindLifecycle: bindLifecycle,
      inspect: inspect
    };
  }

  var playback = createPlaybackManager();

  return {
    EASING: EASING,
    normalizeMotionPlan: normalizeMotionPlan,
    normalizeRigPlan: normalizeRigPlan,
    normalizeCastPlan: normalizeCastPlan,
    sampleStageEnter: sampleStageEnter,
    sampleStageExit: sampleStageExit,
    sampleTrack: sampleTrack,
    sampleMotion: sampleMotion,
    sampleRig: sampleRig,
    compileReveal: compileReveal,
    revealCount: revealCount,
    createPlaybackManager: createPlaybackManager,
    playback: playback,
    MOTION_PROPERTIES: MOTION_PROPERTIES.slice(),
    RIG_PROPERTIES: RIG_PROPERTIES.slice(),
    EASING_NAMES: EASING_NAMES.slice()
  };
});
