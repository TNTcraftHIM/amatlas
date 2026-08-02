/* Amatlas example 私有 2D 横版 runtime：固定 tick 跑、跳、tile AABB 与卷屏。 */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).Sidescroller = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var Q = 256;
  var TICK_HZ = 60;
  var TICK_MS = 1000 / TICK_HZ;
  var ALLOWED_ROOT = { viewport: 1, map: 1, player: 1, sentry: 1, clear: 1 };
  var ALLOWED_VIEWPORT = { w: 1, h: 1 };
  var ALLOWED_MAP = { tileSize: 1, rows: 1 };
  var ALLOWED_PLAYER = { spawn: 1, health: 1, run: 1, jump: 1, weapon: 1 };
  var ALLOWED_WEAPON = { cooldownTicks: 1, damage: 1 };
  var ALLOWED_SENTRY = { id: 1, spawn: 1, health: 1, fireEveryTicks: 1, projectileSpeed: 1, damage: 1 };
  var ALLOWED_CLEAR = { defeat: 1, exposeLink: 1 };
  var ALLOWED_POINT = { x: 1, y: 1 };

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
      sentry: sentry, clear: clear
    });
  }

  function projectilePool(size) { var out = []; for (var i = 0; i < size; i++) out.push({ active: false, xQ: 0, yQ: 0, vxQ: 0, damage: 0 }); return out; }
  function createSimulation(plan, completed) {
    var sim = { tick: 0, xQ: plan.player.spawnXQ, yQ: plan.player.spawnYQ, vxQ: 0, vyQ: 0, wQ: plan.player.wQ, hQ: plan.player.hQ, grounded: true, cameraXQ: 0,
      hp: plan.player.health, dead: false, clear: !!completed, clearWritePending: false,
      sentry: plan.sentry ? { id: plan.sentry.id, xQ: plan.sentry.xQ, yQ: plan.sentry.yQ, wQ: plan.sentry.wQ, hQ: plan.sentry.hQ, hp: completed ? 0 : plan.sentry.health, active: !completed, nextFireTick: plan.sentry.fireEveryTicks } : null,
      playerShots: projectilePool(16), enemyShots: projectilePool(8), ammo: { shotSeq: 0, nextFireTick: 0, held: false } };
    return sim;
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
          s.sentry.hp = Math.max(0, s.sentry.hp - p.damage); p.active = false;
          if (s.sentry.hp === 0) { s.sentry.active = false; s.clear = true; s.clearWritePending = true; s.enemyShots.forEach(function (q) { q.active = false; }); }
        } else if (!playerOwned && !s.dead && overlap(p.xQ, p.yQ, 4 * Q, 3 * Q, s.xQ, s.yQ, s.wQ, s.hQ)) {
          s.hp = Math.max(0, s.hp - p.damage); p.active = false;
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
        s.ammo.shotSeq++; s.ammo.nextFireTick = s.tick + plan.player.weapon.cooldownTicks;
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

  function createSidescrollerModule(opts) {
    opts = opts || {};
    var api = null, doc = null, hostWindow = null, rafId = 0, generation = 0, keyDown = null, keyUp = null, blur = null, stage = null, activeNode = null, activeSim = null;
    var input = { left: false, right: false, jumpQueued: false, fireQueued: false, fireReleaseQueued: false };
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
      activeNode = activeSim = null;
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
        b.addEventListener('pointerdown', function (e) { if (e && e.preventDefault) e.preventDefault(); on(); });
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
        restartSimulation(plan, activeSim);
      }); controls.appendChild(restart);
      var sim = createSimulation(plan, !!(api.state && api.state.sidescrollerCleared)), driver = createFixedDriver(plan, sim), localGeneration = generation;
      activeNode = node; activeSim = sim;
      keyDown = function (e) { if (keyIntent(e.key, true, e.repeat) && e.preventDefault) e.preventDefault(); };
      keyUp = function (e) { if (keyIntent(e.key, false, false) && e.preventDefault) e.preventDefault(); };
      blur = function () { input.left = input.right = input.jumpQueued = input.fireQueued = input.fireReleaseQueued = false; };
      doc.addEventListener('keydown', keyDown); doc.addEventListener('keyup', keyUp); doc.addEventListener('visibilitychange', blur);
      if (hostWindow && hostWindow.addEventListener) hostWindow.addEventListener('blur', blur);
      function draw() {
        ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save(); ctx.translate(-sim.cameraXQ / Q, 0);
        for (var y = 0; y < plan.rows.length; y++) for (var x = 0; x < plan.rows[y].length; x++) if (plan.rows[y][x] === '#') { ctx.fillStyle = y === plan.rows.length - 1 ? '#405066' : '#52677f'; ctx.fillRect(x * plan.tileSize, y * plan.tileSize, plan.tileSize, plan.tileSize); }
        ctx.fillStyle = sim.dead ? '#8b3945' : '#e0aa63'; ctx.fillRect(sim.xQ / Q, sim.yQ / Q, sim.wQ / Q, sim.hQ / Q);
        if (sim.sentry && sim.sentry.active) { ctx.fillStyle = '#c45454'; ctx.fillRect(sim.sentry.xQ / Q, sim.sentry.yQ / Q, sim.sentry.wQ / Q, sim.sentry.hQ / Q); }
        ctx.fillStyle = '#f2c14e'; sim.playerShots.forEach(function (p) { if (p.active) ctx.fillRect(p.xQ / Q, p.yQ / Q, 4, 3); });
        ctx.fillStyle = '#ef6f6c'; sim.enemyShots.forEach(function (p) { if (p.active) ctx.fillRect(p.xQ / Q, p.yQ / Q, 4, 3); }); ctx.restore();
        hud.textContent = sim.clear ? '目标已解除 · 清关出口已开放'
          : sim.dead ? '生命 0 / ' + plan.player.health + ' · 已阵亡，按“重开本局”'
          : '生命 ' + sim.hp + ' / ' + plan.player.health + ' · 目标 ' + (sim.sentry ? sim.sentry.hp : 0) + ' · x ' + Math.round(sim.xQ / Q) + ' · tick ' + sim.tick;
      }
      function frame(ts) {
        if (localGeneration !== generation) return;
        driver.frame(ts, function () {
          var v = { left: input.left, right: input.right, jumpPressed: input.jumpQueued, firePressed: input.fireQueued, fireReleased: input.fireReleaseQueued };
          input.jumpQueued = input.fireQueued = input.fireReleaseQueued = false; return v;
        });
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

  return { compileLevel: compileLevel, validateClearLink: validateClearLink, createSimulation: createSimulation, stepSimulation: stepSimulation, restartSimulation: restartSimulation, createFixedDriver: createFixedDriver, simulationSnapshot: simulationSnapshot, createSidescrollerModule: createSidescrollerModule };
});
