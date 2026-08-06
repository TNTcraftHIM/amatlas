/* Amatlas example 私有 2D 横版 runtime：固定 tick 跑、跳、tile AABB 与卷屏。 */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).Sidescroller = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var Q = 256;
  var TICK_HZ = 60;
  var TICK_MS = 1000 / TICK_HZ;
  var ALLOWED_ROOT = { viewport: 1, map: 1, player: 1, sentry: 1, clear: 1, presentation: 1 };
  var ALLOWED_PRESENTATION = { profile: 1 };
  var ALLOWED_VIEWPORT = { w: 1, h: 1 };
  var ALLOWED_MAP = { tileSize: 1, rows: 1 };
  var ALLOWED_PLAYER = { spawn: 1, health: 1, run: 1, jump: 1, weapon: 1 };
  var ALLOWED_WEAPON = { cooldownTicks: 1, damage: 1 };
  var ALLOWED_SENTRY = { id: 1, spawn: 1, health: 1, fireEveryTicks: 1, projectileSpeed: 1, damage: 1 };
  var ALLOWED_CLEAR = { defeat: 1, exposeLink: 1 };
  var ALLOWED_POINT = { x: 1, y: 1 };
  var PRESENTATION_PRESETS = {
    neutral: {
      id: 'neutral', hud: { health: '生命', target: '目标', clear: '目标已解除 · 清关出口已开放' },
      colors: { skyTop: '#111827', skyBottom: '#1f2937', far: '#26364a', terrainTop: '#60758e', terrainSide: '#405066', terrainMark: '#7188a1', player: '#e0aa63', playerShade: '#8a6034', playerGlow: '#f7d598', dead: '#8b3945', target: '#c45454', targetShade: '#74343c', targetGlow: '#f28c79', friendly: '#f2c14e', hostile: '#ef6f6c', clear: '#8de2bb' },
      audio: { shot: [220, 120, 'square'], hit: [150, 82, 'triangle'], hurt: [110, 58, 'sawtooth'], clear: [330, 660, 'sine'] }
    },
    coast: {
      id: 'coast', hud: { health: '生命', target: '哨戒炮', clear: '哨戒炮已解除 · 海堤门已开放' },
      colors: { skyTop: '#102a43', skyBottom: '#2d5f73', far: '#1b4856', terrainTop: '#90a9ad', terrainSide: '#4b636b', terrainMark: '#d6c69a', player: '#f2b96f', playerShade: '#714b34', playerGlow: '#fff0bd', dead: '#8b3945', target: '#d05252', targetShade: '#6d2933', targetGlow: '#ffb35f', friendly: '#ffd166', hostile: '#ff6b6b', clear: '#73e0c1' },
      audio: { shot: [180, 92, 'square'], hit: [132, 68, 'triangle'], hurt: [96, 48, 'sawtooth'], clear: [294, 588, 'sine'] }
    },
    frost: {
      id: 'frost', hud: { health: '耐寒', target: '防卫塔', clear: '防卫塔已停机 · 货运升降台已解锁' },
      colors: { skyTop: '#071526', skyBottom: '#193a57', far: '#315b73', terrainTop: '#c8edf4', terrainSide: '#527a91', terrainMark: '#e9fbff', player: '#7ce7ee', playerShade: '#23546a', playerGlow: '#ecffff', dead: '#73536f', target: '#ec5c74', targetShade: '#6a2947', targetGlow: '#bff8ff', friendly: '#adfbff', hostile: '#ff7794', clear: '#e5fbff' },
      audio: { shot: [420, 210, 'triangle'], hit: [300, 140, 'sine'], hurt: [170, 76, 'sawtooth'], clear: [440, 880, 'triangle'] }
    }
  };

  function fail(path, text) { throw new Error(path + ': ' + text); }
  function plainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function fields(value, allowed, path) {
    if (!plainObject(value)) fail(path, '必须是对象');
    Object.keys(value).forEach(function (key) { if (!allowed[key]) fail(path + '.' + key, '未知字段'); });
  }
  function finitePositive(v, path) { if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) fail(path, '必须是有限正数'); return v; }
  function integer(v, path) { if (!Number.isInteger(v)) fail(path, '必须是整数'); return v; }
  function deepFreeze(v) {
    if (!v || typeof v !== 'object' || Object.isFrozen(v)) return v;
    Object.freeze(v); Object.keys(v).forEach(function (k) { deepFreeze(v[k]); }); return v;
  }

  function compileLevel(author, path) {
    path = path || 'sidescroller';
    fields(author, ALLOWED_ROOT, path);
    fields(author.viewport, ALLOWED_VIEWPORT, path + '.viewport');
    fields(author.map, ALLOWED_MAP, path + '.map');
    fields(author.player, ALLOWED_PLAYER, path + '.player');
    fields(author.player.spawn, ALLOWED_POINT, path + '.player.spawn');
    var presentationKey = 'neutral';
    if (Object.prototype.hasOwnProperty.call(author, 'presentation')) {
      fields(author.presentation, ALLOWED_PRESENTATION, path + '.presentation');
      if (typeof author.presentation.profile !== 'string') fail(path + '.presentation.profile', '必须是字符串');
      if (!Object.prototype.hasOwnProperty.call(PRESENTATION_PRESETS, author.presentation.profile) || author.presentation.profile === 'neutral') fail(path + '.presentation.profile', "必须是 'coast' 或 'frost'");
      presentationKey = author.presentation.profile;
    }
    var viewW = integer(finitePositive(author.viewport.w, path + '.viewport.w'), path + '.viewport.w');
    var viewH = integer(finitePositive(author.viewport.h, path + '.viewport.h'), path + '.viewport.h');
    var tile = integer(finitePositive(author.map.tileSize, path + '.map.tileSize'), path + '.map.tileSize');
    var rows = author.map.rows;
    if (!Array.isArray(rows) || rows.length < 2 || typeof rows[0] !== 'string' || rows[0].length < 2) fail(path + '.map.rows', '必须是至少两行的非空等长字符串数组');
    var cols = rows[0].length;
    rows.forEach(function (row, y) {
      if (typeof row !== 'string' || row.length !== cols) fail(path + '.map.rows[' + y + ']', '必须与第一行等长');
      for (var x = 0; x < row.length; x++) if (row[x] !== '.' && row[x] !== '#') fail(path + '.map.rows[' + y + '][' + x + ']', '未知 tile 字符');
    });
    var sx = integer(author.player.spawn.x, path + '.player.spawn.x');
    var sy = integer(author.player.spawn.y, path + '.player.spawn.y');
    if (sy < 0 || sy >= rows.length || sx < 0 || sx >= cols || rows[sy][sx] === '#') fail(path + '.player.spawn', '必须位于地图内的空地');
    var run = finitePositive(author.player.run, path + '.player.run');
    var jump = finitePositive(author.player.jump, path + '.player.jump');
    var health = integer(finitePositive(author.player.health, path + '.player.health'), path + '.player.health');
    var weapon = null, sentry = null, clear = null;
    var combatFields = author.player.weapon != null || author.sentry != null || author.clear != null;
    if (combatFields && (!author.player.weapon || !author.sentry || !author.clear)) fail(path, 'player.weapon、sentry、clear 必须整组声明');
    if (combatFields) {
      fields(author.player.weapon, ALLOWED_WEAPON, path + '.player.weapon');
      fields(author.sentry, ALLOWED_SENTRY, path + '.sentry');
      fields(author.sentry.spawn, ALLOWED_POINT, path + '.sentry.spawn');
      fields(author.clear, ALLOWED_CLEAR, path + '.clear');
      var sentryId = author.sentry.id;
      if (typeof sentryId !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(sentryId)) fail(path + '.sentry.id', '必须是受限标识符');
      var sentryX = integer(author.sentry.spawn.x, path + '.sentry.spawn.x');
      var sentryY = integer(author.sentry.spawn.y, path + '.sentry.spawn.y');
      if (sentryY < 0 || sentryY >= rows.length || sentryX < 0 || sentryX >= cols || rows[sentryY][sentryX] === '#') fail(path + '.sentry.spawn', '必须位于地图内的空地');
      if (author.clear.defeat !== sentryId) fail(path + '.clear.defeat', '必须引用 sentry.id');
      if (typeof author.clear.exposeLink !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(author.clear.exposeLink)) fail(path + '.clear.exposeLink', '必须是受限 link id');
      weapon = { cooldownTicks: integer(finitePositive(author.player.weapon.cooldownTicks, path + '.player.weapon.cooldownTicks'), path + '.player.weapon.cooldownTicks'), damage: integer(finitePositive(author.player.weapon.damage, path + '.player.weapon.damage'), path + '.player.weapon.damage') };
      sentry = { id: sentryId, xQ: sentryX * tile * Q + 2 * Q, yQ: sentryY * tile * Q + tile * Q - 20 * Q, wQ: 14 * Q, hQ: 20 * Q, health: integer(finitePositive(author.sentry.health, path + '.sentry.health'), path + '.sentry.health'), fireEveryTicks: integer(finitePositive(author.sentry.fireEveryTicks, path + '.sentry.fireEveryTicks'), path + '.sentry.fireEveryTicks'), projectileSpeedQ: Math.round(finitePositive(author.sentry.projectileSpeed, path + '.sentry.projectileSpeed') * Q / TICK_HZ), damage: integer(finitePositive(author.sentry.damage, path + '.sentry.damage'), path + '.sentry.damage') };
      clear = { defeat: sentryId, exposeLink: author.clear.exposeLink };
    }
    var wQ = 10 * Q, hQ = 22 * Q;
    var groundYQ = sy * tile * Q + tile * Q - hQ;
    return deepFreeze({
      tickHz: TICK_HZ, tickMs: TICK_MS, q: Q,
      viewport: { w: viewW, h: viewH },
      width: cols * tile, height: rows.length * tile,
      tileSize: tile, tileSizeQ: tile * Q, rows: rows.slice(),
      runQ: Math.round(run * Q / TICK_HZ), jumpQ: Math.round(jump * Q / TICK_HZ),
      gravityQ: Math.round(680 * Q / (TICK_HZ * TICK_HZ)),
      player: { spawn: { x: sx, y: sy }, spawnXQ: sx * tile * Q + 3 * Q, spawnYQ: groundYQ, health: health, wQ: wQ, hQ: hQ, weapon: weapon },
      sentry: sentry, clear: clear, presentation: PRESENTATION_PRESETS[presentationKey]
    });
  }

  function projectilePool(size) { var out = []; for (var i = 0; i < size; i++) out.push({ active: false, xQ: 0, yQ: 0, vxQ: 0, damage: 0 }); return out; }
  function createSimulation(plan, completed) {
    var sim = { tick: 0, xQ: plan.player.spawnXQ, yQ: plan.player.spawnYQ, vxQ: 0, vyQ: 0, wQ: plan.player.wQ, hQ: plan.player.hQ, grounded: true, cameraXQ: 0,
      hp: plan.player.health, dead: false, clear: !!completed, clearWritePending: false,
      sentry: plan.sentry ? { id: plan.sentry.id, xQ: plan.sentry.xQ, yQ: plan.sentry.yQ, wQ: plan.sentry.wQ, hQ: plan.sentry.hQ, hp: completed ? 0 : plan.sentry.health, active: !completed, nextFireTick: plan.sentry.fireEveryTicks } : null,
      playerShots: projectilePool(16), enemyShots: projectilePool(8), ammo: { shotSeq: 0, nextFireTick: 0, held: false },
      presentationEvents: [], presentationSeq: 0 };
    return sim;
  }
  function emitPresentation(s, type, xQ, yQ) {
    s.presentationEvents.push({ seq: ++s.presentationSeq, tick: s.tick, type: type, xQ: xQ || 0, yQ: yQ || 0 });
    if (s.presentationEvents.length > 32) s.presentationEvents.shift();
  }
  function validateClearLink(plan, node, path) {
    if (!plan.clear) return;
    var ids = (node.links || []).map(function (link) { return link && link.id; });
    if (ids.indexOf(plan.clear.exposeLink) < 0) fail((path || 'sidescroller') + '.clear.exposeLink', '必须引用 node.links 中存在的 id');
  }
  function solid(plan, tx, ty) {
    return ty < 0 || ty >= plan.rows.length || tx < 0 || tx >= plan.rows[0].length || plan.rows[ty][tx] === '#';
  }
  function collides(plan, s, xQ, yQ) {
    var left = Math.floor(xQ / plan.tileSizeQ);
    var right = Math.floor((xQ + s.wQ - 1) / plan.tileSizeQ);
    var top = Math.floor(yQ / plan.tileSizeQ);
    var bottom = Math.floor((yQ + s.hQ - 1) / plan.tileSizeQ);
    for (var y = top; y <= bottom; y++) for (var x = left; x <= right; x++) if (solid(plan, x, y)) return true;
    return false;
  }
  function moveAxis(plan, s, axis, delta) {
    if (!delta) return false;
    var sign = delta < 0 ? -1 : 1;
    var left = Math.abs(delta), moved = false;
    while (left > 0) {
      var part = sign * Math.min(left, Q);
      var nx = axis === 'x' ? s.xQ + part : s.xQ;
      var ny = axis === 'y' ? s.yQ + part : s.yQ;
      if (collides(plan, s, nx, ny)) return moved;
      if (axis === 'x') s.xQ = nx; else s.yQ = ny;
      left -= Math.abs(part); moved = true;
    }
    return moved;
  }
  function overlap(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; }
  function spawnShot(pool, xQ, yQ, vxQ, damage) {
    for (var i = 0; i < pool.length; i++) if (!pool[i].active) { pool[i].active = true; pool[i].xQ = xQ; pool[i].yQ = yQ; pool[i].vxQ = vxQ; pool[i].damage = damage; return pool[i]; }
    throw new Error('sidescroller projectile pool exhausted');
  }
  function clearShots(s) { s.playerShots.forEach(function (p) { p.active = false; }); s.enemyShots.forEach(function (p) { p.active = false; }); }
  function moveShots(plan, s, pool, playerOwned) {
    pool.forEach(function (p) {
      if (!p.active) return;
      var left = Math.abs(p.vxQ), sign = p.vxQ < 0 ? -1 : 1;
      while (left > 0 && p.active) {
        var dx = sign * Math.min(left, 2 * Q); p.xQ += dx; left -= Math.abs(dx);
        if (collides(plan, { wQ: 4 * Q, hQ: 3 * Q }, p.xQ, p.yQ)) { p.active = false; break; }
        if (playerOwned && s.sentry && s.sentry.active && overlap(p.xQ, p.yQ, 4 * Q, 3 * Q, s.sentry.xQ, s.sentry.yQ, s.sentry.wQ, s.sentry.hQ)) {
          s.sentry.hp = Math.max(0, s.sentry.hp - p.damage); p.active = false; emitPresentation(s, 'hit', p.xQ, p.yQ);
          if (s.sentry.hp === 0) { s.sentry.active = false; s.clear = true; s.clearWritePending = true; s.enemyShots.forEach(function (q) { q.active = false; }); emitPresentation(s, 'clear', s.sentry.xQ, s.sentry.yQ); }
        } else if (!playerOwned && !s.dead && overlap(p.xQ, p.yQ, 4 * Q, 3 * Q, s.xQ, s.yQ, s.wQ, s.hQ)) {
          s.hp = Math.max(0, s.hp - p.damage); p.active = false; emitPresentation(s, 'hurt', p.xQ, p.yQ);
          if (s.hp === 0) { s.dead = true; s.vxQ = s.vyQ = 0; clearShots(s); }
        }
      }
      if (p.xQ < 0 || p.xQ > plan.width * Q) p.active = false;
    });
  }
  function stepSimulation(plan, s, input) {
    input = input || {};
    s.tick++;
    if (s.dead || s.clear) return s;
    if (input.firePressed && !s.ammo.held) {
      s.ammo.held = true;
      if (plan.player.weapon && s.tick >= s.ammo.nextFireTick) {
        spawnShot(s.playerShots, s.xQ + s.wQ, s.yQ + 8 * Q, 5 * Q, plan.player.weapon.damage);
        s.ammo.shotSeq++; s.ammo.nextFireTick = s.tick + plan.player.weapon.cooldownTicks; emitPresentation(s, 'shot', s.xQ + s.wQ, s.yQ + 8 * Q);
      }
    }
    if (input.fireReleased) s.ammo.held = false;
    s.vxQ = input.left === input.right ? 0 : (input.left ? -plan.runQ : plan.runQ);
    if (input.jumpPressed && s.grounded) { s.vyQ = -plan.jumpQ; s.grounded = false; }
    moveAxis(plan, s, 'x', s.vxQ);
    s.vyQ += plan.gravityQ;
    var oldY = s.yQ;
    var movedY = moveAxis(plan, s, 'y', s.vyQ);
    if (!movedY || s.yQ === oldY) {
      if (s.vyQ > 0) s.grounded = true;
      s.vyQ = 0;
    } else s.grounded = collides(plan, s, s.xQ, s.yQ + Q);
    if (s.grounded && s.vyQ > 0) s.vyQ = 0;
    if (plan.sentry && s.sentry.active && s.tick >= s.sentry.nextFireTick) {
      spawnShot(s.enemyShots, s.sentry.xQ - 4 * Q, s.sentry.yQ + 8 * Q, -plan.sentry.projectileSpeedQ, plan.sentry.damage);
      s.sentry.nextFireTick = s.tick + plan.sentry.fireEveryTicks;
    }
    moveShots(plan, s, s.playerShots, true); moveShots(plan, s, s.enemyShots, false);
    var playerCenterQ = s.xQ + (s.wQ >> 1);
    var target = Math.max(0, Math.min(plan.width * Q - plan.viewport.w * Q, playerCenterQ - 112 * Q));
    s.cameraXQ = target;
    return s;
  }
  function restartSimulation(plan, s) { var fresh = createSimulation(plan); Object.keys(s).forEach(function (key) { delete s[key]; }); Object.keys(fresh).forEach(function (key) { s[key] = fresh[key]; }); return s; }
  function createFixedDriver(plan, sim) {
    var last = null, acc = 0;
    return { frame: function (ts, input) {
      if (last == null) { last = ts; return 0; }
      acc += Math.max(0, Math.min(250, ts - last)); last = ts;
      var n = 0;
      while (acc + 1e-7 >= plan.tickMs && n < 15) {
        var tickInput = typeof input === 'function' ? input(sim.tick) : input;
        stepSimulation(plan, sim, tickInput || {}); acc -= plan.tickMs; n++;
      }
      if (n === 15 && acc >= plan.tickMs) acc = 0;
      return n;
    } };
  }
  function simulationSnapshot(s) { return { tick: s.tick, x: s.xQ, y: s.yQ, vx: s.vxQ, vy: s.vyQ, grounded: s.grounded, cameraX: s.cameraXQ, hp: s.hp, dead: s.dead, sentryHp: s.sentry && s.sentry.hp, clear: s.clear, shotSeq: s.ammo.shotSeq }; }
  function drawBackground(ctx, plan, sim, frame) {
    var C = plan.presentation.colors, w = plan.viewport.w, h = plan.viewport.h, profile = plan.presentation.id;
    var gradient = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, h) : null;
    if (gradient && gradient.addColorStop) { gradient.addColorStop(0, C.skyTop); gradient.addColorStop(1, C.skyBottom); ctx.fillStyle = gradient; }
    else ctx.fillStyle = C.skyTop;
    ctx.fillRect(0, 0, w, h);
    var parallax = frame.reducedMotion ? 0 : -((sim.cameraXQ / Q) % 112) * 0.08;
    ctx.save(); ctx.translate(parallax, 0); ctx.fillStyle = C.far;
    if (profile === 'frost') {
      for (var fx = -20; fx < w + 60; fx += 56) { var peak = 58 + ((fx / 56) % 3) * 8; ctx.beginPath && ctx.beginPath(); if (ctx.moveTo) { ctx.moveTo(fx, 132); ctx.lineTo(fx + 28, peak); ctx.lineTo(fx + 66, 132); ctx.closePath(); ctx.fill(); } }
      ctx.fillStyle = C.terrainMark; for (fx = 6; fx < w; fx += 34) ctx.fillRect(fx, 28 + (fx % 5) * 9, 2, 2);
    } else if (profile === 'coast') {
      ctx.fillRect(0, 112, w + 112, 68); ctx.fillStyle = C.skyBottom; for (var wx = 0; wx < w + 112; wx += 38) ctx.fillRect(wx, 116 + (wx % 3) * 3, 24, 2);
      ctx.fillStyle = C.terrainMark; ctx.fillRect(w - 66, 50, 6, 62); ctx.fillRect(w - 78, 48, 30, 5); ctx.fillRect(w - 62, 40, 4, 10);
    } else { ctx.fillRect(0, 116, w + 112, 64); }
    ctx.restore();
  }
  function drawTerrain(ctx, plan) {
    var C = plan.presentation.colors, tile = plan.tileSize;
    for (var y = 0; y < plan.rows.length; y++) for (var x = 0; x < plan.rows[y].length; x++) if (plan.rows[y][x] === '#') {
      var px = x * tile, py = y * tile; ctx.fillStyle = C.terrainSide; ctx.fillRect(px, py, tile, tile);
      ctx.fillStyle = C.terrainTop; ctx.fillRect(px, py, tile, Math.max(3, tile >> 2));
      ctx.fillStyle = C.terrainMark; if (((x + y) & 3) === 0) ctx.fillRect(px + 3, py + 8, Math.max(3, tile - 8), 2);
    }
  }
  function drawPlayer(ctx, plan, sim) {
    var C = plan.presentation.colors, x = sim.xQ / Q, y = sim.yQ / Q, dead = sim.dead, profile = plan.presentation.id;
    ctx.fillStyle = dead ? C.dead : C.playerShade; ctx.fillRect(x + 2, y + 7, 7, 14);
    ctx.fillStyle = dead ? C.dead : C.player; ctx.fillRect(x + 1, y + 2, 8, 7); ctx.fillRect(x + 3, y + 9, 6, 8);
    ctx.fillStyle = C.playerGlow; ctx.fillRect(x + 6, y + 4, 2, 2); ctx.fillRect(x + 8, y + 10, profile === 'frost' ? 6 : 7, 3);
    if (!dead) { var stride = sim.grounded && sim.vxQ ? (sim.tick & 4 ? 2 : 0) : 1; ctx.fillStyle = C.playerShade; ctx.fillRect(x + 2 - stride, y + 17, 3, 5); ctx.fillRect(x + 7 + stride, y + 17, 3, 5); }
  }
  function drawSentry(ctx, plan, sim) {
    if (!sim.sentry || !sim.sentry.active) return;
    var C = plan.presentation.colors, x = sim.sentry.xQ / Q, y = sim.sentry.yQ / Q, hurt = sim.sentry.hp < plan.sentry.health;
    ctx.fillStyle = C.targetShade; ctx.fillRect(x + 1, y + 13, 13, 7); ctx.fillRect(x + 5, y + 3, 8, 12);
    ctx.fillStyle = C.target; ctx.fillRect(x + 2, y + 11, 11, 6); ctx.fillRect(x + 7, y + 1, 6, 9); ctx.fillRect(x - 7, y + 7, 15, 4);
    ctx.fillStyle = hurt && (sim.tick & 4) ? C.targetGlow : C.hostile; ctx.fillRect(x + 7, y + 4, 3, 3);
  }
  function drawProjectiles(ctx, plan, sim) {
    var C = plan.presentation.colors;
    ctx.fillStyle = C.friendly; sim.playerShots.forEach(function (p) { if (p.active) { var x = p.xQ / Q, y = p.yQ / Q; ctx.fillRect(x - 3, y + 1, 7, 1); ctx.fillRect(x, y, 5, 3); } });
    ctx.fillStyle = C.hostile; sim.enemyShots.forEach(function (p) { if (p.active) { var x = p.xQ / Q, y = p.yQ / Q; ctx.fillRect(x, y, 4, 3); ctx.fillRect(x + 3, y - 1, 2, 5); } });
  }
  function drawFeedback(ctx, plan, frame) {
    if (!frame || !frame.poster) return;
    var p = frame.poster, C = plan.presentation.colors;
    var age = typeof p.presentedFrames === 'number' ? p.presentedFrames : frame.tick - p.tick;
    if (age > 12) return;
    var x = p.xQ / Q, y = p.yQ / Q; ctx.fillStyle = p.type === 'clear' ? C.clear : p.type === 'hurt' ? C.hostile : C.targetGlow;
    var r = p.type === 'clear' ? 12 : 5; ctx.fillRect(x - r, y - 1, r * 2, 2); ctx.fillRect(x - 1, y - r, 2, r * 2);
  }
  function renderFrame(ctx, plan, sim, frame) {
    frame = frame || { tick: sim.tick, reducedMotion: false, poster: null };
    drawBackground(ctx, plan, sim, frame); ctx.save(); ctx.translate(-sim.cameraXQ / Q, 0); drawTerrain(ctx, plan); drawPlayer(ctx, plan, sim); drawSentry(ctx, plan, sim); drawProjectiles(ctx, plan, sim); drawFeedback(ctx, plan, frame); ctx.restore();
  }

  function createSidescrollerModule(opts) {
    opts = opts || {};
    var api = null, doc = null, hostWindow = null, rafId = 0, generation = 0, keyDown = null, keyUp = null, blur = null, stage = null, activeNode = null, activeSim = null, audioCtx = null, activeSources = [];
    var input = { left: false, right: false, jumpQueued: false, fireQueued: false, fireReleaseQueued: false };
    function muted() { try { return typeof localStorage !== 'undefined' && localStorage.getItem('amatlas-muted') === '1'; } catch (e) { return false; } }
    function resumeAudio() {
      if (!audioCtx || audioCtx.state !== 'suspended' || !audioCtx.resume) return;
      try { var resumed = audioCtx.resume(); if (resumed && resumed.catch) resumed.catch(function () {}); } catch (e) {}
    }
    function unlockAudio() {
      if (muted() || !hostWindow) return;
      if (audioCtx) { resumeAudio(); return; }
      var AC = hostWindow.AudioContext || hostWindow.webkitAudioContext; if (!AC) return;
      try { audioCtx = new AC(); resumeAudio(); } catch (e) { audioCtx = null; }
    }
    function stopActiveSources() {
      activeSources.slice().forEach(function (source) { try { source.stop(); } catch (e) {} }); activeSources = [];
    }
    function stopAudio() {
      stopActiveSources();
      if (audioCtx && audioCtx.close) try { var closed = audioCtx.close(); if (closed && closed.catch) closed.catch(function () {}); } catch (e) {}
      audioCtx = null;
    }
    function playCue(plan, type) {
      if (!audioCtx || muted()) return;
      var spec = plan.presentation.audio[type]; if (!spec) return;
      try {
        var now = audioCtx.currentTime, osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
        osc.type = spec[2]; osc.frequency.setValueAtTime(spec[0], now); osc.frequency.exponentialRampToValueAtTime(spec[1], now + (type === 'clear' ? 0.24 : 0.10));
        gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(type === 'hurt' ? 0.07 : 0.045, now + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === 'clear' ? 0.28 : 0.13));
        osc.connect(gain); gain.connect(audioCtx.destination); activeSources.push(osc);
        osc.onended = function () { var i = activeSources.indexOf(osc); if (i >= 0) activeSources.splice(i, 1); };
        osc.start(now); osc.stop(now + (type === 'clear' ? 0.30 : 0.15));
      } catch (e) {}
    }
    function stop() {
      generation++;
      if (rafId && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId);
      rafId = 0;
      if (doc && doc.removeEventListener) {
        if (keyDown) doc.removeEventListener('keydown', keyDown);
        if (keyUp) doc.removeEventListener('keyup', keyUp);
        if (blur) doc.removeEventListener('visibilitychange', blur);
      }
      if (blur && hostWindow && hostWindow.removeEventListener) hostWindow.removeEventListener('blur', blur);
      keyDown = keyUp = blur = null;
      input.left = input.right = input.jumpQueued = input.fireQueued = input.fireReleaseQueued = false;
      stopAudio(); activeNode = activeSim = null;
      if (stage) { stage.textContent = ''; while (stage.children && stage.children.length) stage.removeChild(stage.children[0]); }
      stage = null;
    }
    function keyIntent(key, down, repeat) {
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') input.left = down;
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') input.right = down;
      else if (down && !repeat && (key === 'ArrowUp' || key === 'w' || key === 'W')) input.jumpQueued = true;
      else if (key === ' ') { if (down && !repeat) input.fireQueued = true; if (!down) input.fireReleaseQueued = true; }
      else return false;
      return true;
    }
    function start(node) {
      if (!doc || !doc.getElementById) return;
      var planPath = 'sidescroller ?map/' + (node.title || 'node');
      var plan = compileLevel(node.sidescroller, planPath);
      validateClearLink(plan, node, planPath);
      stage = doc.getElementById(node.stageId || opts.stageId || 'sidescroller-stage');
      if (!stage) return;
      var canvas = doc.createElement('canvas'); canvas.width = plan.viewport.w; canvas.height = plan.viewport.h;
      canvas.setAttribute('aria-label', '2D 横版射击画布');
      var ctx = canvas.getContext && canvas.getContext('2d'); stage.textContent = ''; stage.appendChild(canvas);
      if (!ctx) return;
      var hud = doc.createElement('div'); hud.className = 'amatlas-sidescroller-hud'; hud.setAttribute('aria-live', 'polite'); stage.appendChild(hud);
      var controls = doc.createElement('div'); controls.className = 'amatlas-sidescroller-controls'; stage.appendChild(controls);
      function button(text, aria, on, off) {
        var b = doc.createElement('button'); b.textContent = text; b.className = 'amatlas-touchpad-key'; b.setAttribute('type', 'button'); b.setAttribute('aria-label', aria); b.style.minWidth = '52px'; b.style.minHeight = '44px'; b.style.touchAction = 'none';
        b.addEventListener('pointerdown', function (e) { if (e && e.preventDefault) e.preventDefault(); unlockAudio(); on(); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (name) { b.addEventListener(name, off || function () {}); });
        b.addEventListener('click', function (e) { if (e && e.detail === 0) on(); }); controls.appendChild(b);
      }
      button('←', '向左移动', function () { input.left = true; }, function () { input.left = false; });
      button('→', '向右移动', function () { input.right = true; }, function () { input.right = false; });
      button('↑', '跳跃', function () { input.jumpQueued = true; });
      if (plan.player.weapon) button('●', '开火', function () { input.fireQueued = true; }, function () { input.fireReleaseQueued = true; });
      var restart = doc.createElement('button'); restart.textContent = '重开本局'; restart.className = 'amatlas-touchpad-key amatlas-touchpad-key--pill'; restart.setAttribute('type', 'button'); restart.setAttribute('aria-label', '重开本局'); restart.style.minHeight = '44px'; restart.addEventListener('click', function () {
        if (!activeSim || !activeSim.dead) return;
        input.left = input.right = input.jumpQueued = input.fireQueued = input.fireReleaseQueued = false;
        stopActiveSources(); lastEventSeq = 0; posterQueue = [];
        restartSimulation(plan, activeSim);
      }); controls.appendChild(restart);
      var sim = createSimulation(plan, !!(api.state && api.state.sidescrollerCleared)), driver = createFixedDriver(plan, sim), localGeneration = generation, lastEventSeq = 0, posterQueue = [];
      var reducedMotion = !!(hostWindow && hostWindow.matchMedia && hostWindow.matchMedia('(prefers-reduced-motion: reduce)').matches);
      activeNode = node; activeSim = sim;
      keyDown = function (e) { if (keyIntent(e.key, true, e.repeat)) { unlockAudio(); if (e.preventDefault) e.preventDefault(); } };
      keyUp = function (e) { if (keyIntent(e.key, false, false) && e.preventDefault) e.preventDefault(); };
      blur = function () { input.left = input.right = input.jumpQueued = input.fireQueued = input.fireReleaseQueued = false; };
      doc.addEventListener('keydown', keyDown); doc.addEventListener('keyup', keyUp); doc.addEventListener('visibilitychange', blur);
      if (hostWindow && hostWindow.addEventListener) hostWindow.addEventListener('blur', blur);
      function consumeEvents() {
        sim.presentationEvents.forEach(function (ev) {
          if (ev.seq <= lastEventSeq) return;
          lastEventSeq = ev.seq; posterQueue.push({ seq: ev.seq, tick: ev.tick, type: ev.type, xQ: ev.xQ, yQ: ev.yQ, presentedFrames: 0 }); playCue(plan, ev.type);
        });
      }
      function draw() {
        var poster = posterQueue.length ? posterQueue[0] : null;
        renderFrame(ctx, plan, sim, { tick: sim.tick, reducedMotion: reducedMotion, poster: poster });
        if (poster && (++poster.presentedFrames >= 12 || posterQueue.length > 1)) posterQueue.shift();
        hud.textContent = sim.clear ? plan.presentation.hud.clear
          : sim.dead ? plan.presentation.hud.health + ' 0 / ' + plan.player.health + ' · 已阵亡，按“重开本局”'
          : plan.presentation.hud.health + ' ' + sim.hp + ' / ' + plan.player.health + ' · ' + plan.presentation.hud.target + ' ' + (sim.sentry ? sim.sentry.hp : 0) + ' · x ' + Math.round(sim.xQ / Q) + ' · tick ' + sim.tick;
      }
      function frame(ts) {
        if (localGeneration !== generation) return;
        driver.frame(ts, function () {
          var v = { left: input.left, right: input.right, jumpPressed: input.jumpQueued, firePressed: input.fireQueued, fireReleased: input.fireReleaseQueued };
          input.jumpQueued = input.fireQueued = input.fireReleaseQueued = false; return v;
        });
        consumeEvents();
        if (sim.clearWritePending) {
          sim.clearWritePending = false;
          api.apply({ run: function (state) { state.sidescrollerCleared = true; } });
        }
        draw(); if (localGeneration === generation) rafId = requestAnimationFrame(frame);
      }
      draw(); rafId = requestAnimationFrame(frame);
    }
    var mod = {
      id: 'sidescroller-example', nodeKinds: ['sidescroller'],
      systems: [
        { on: 'enter', run: function (state, ev) { stop(); if (ev && ev.node && ev.node.kind === 'sidescroller') start(ev.node); } },
        { on: 'restore', run: function (state, ev) { if (!ev || ev.phase === 'deactivate') stop(); else if (ev.phase === 'activate' && ev.current && ev.current.node && ev.current.node.kind === 'sidescroller') { stop(); start(ev.current.node); } } }
      ],
      render: function (state, node) { return { title: node.title || '横版试验', body: [{ type: 'prose', text: '方向键或 A/D 移动，W/↑跳跃，空格开火；也可使用屏上按钮。解除固定目标后清关出口才会开放。' }], status: [] }; },
      actions: function (state, node) {
        if (!api) return [];
        var all = api.linkActions(node, state);
        if (!node.sidescroller || !node.sidescroller.clear) return all;
        return all.filter(function (action) { return action.id !== node.sidescroller.clear.exposeLink || !!state.sidescrollerCleared; });
      },
      install: function (a) { api = a; doc = typeof document !== 'undefined' ? document : null; hostWindow = typeof window !== 'undefined' ? window : null; a.registerModule(mod); }
    };
    return mod;
  }

  return { compileLevel: compileLevel, validateClearLink: validateClearLink, createSimulation: createSimulation, stepSimulation: stepSimulation, restartSimulation: restartSimulation, createFixedDriver: createFixedDriver, simulationSnapshot: simulationSnapshot, createSidescrollerModule: createSidescrollerModule, _private: { renderFrame: renderFrame, presentationPresets: PRESENTATION_PRESETS } };
});
