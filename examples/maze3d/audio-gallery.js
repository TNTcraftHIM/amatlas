/* eslint-env browser */
(function () {
  'use strict';

  var A = window.Amatlas || {};
  var root = document.getElementById('audio-gallery');
  var nav = document.querySelector('.tabs');
  var titleEl = document.getElementById('active-title');
  var noteEl = document.getElementById('active-note');
  var codeEl = document.getElementById('active-code');
  var stopBtn = document.getElementById('stop-preview');
  var muteBtn = document.getElementById('mute-toggle');
  var STAGE = 'audio-maze-stage';
  var engine = null;
  var activeId = null;

  var groups = [
    { id: 'themes', label: '主题', title: '主题 ambient', note: '每张卡进一个同构小房间,只换 maze.theme。常驻 room tone / tension 由 maze3d 私有 path-A 音频生成,不是公共 audio 契约。' },
    { id: 'pickups', label: '拾取', title: '拾取反馈', note: '通过 events[i].visual 触发真实拾取反馈:显眼 pickup、地面隐藏物、墙面隐藏物三类声纹不同。' },
    { id: 'mechanisms', label: '机关', title: '机关动作', note: '通过真实 set / warp / turn 坐标事件触发机关声;不是直接调用内部 SFX 函数。' },
    { id: 'keydoor', label: '钥匙/门', title: '钥匙与门', note: "通过网格字符 K / D 触发钥匙叮声、锁门提示与开门声。" },
    { id: 'monsters', label: '怪物', title: '怪物 proximity / mimic', note: '静止怪物用于核听距离心跳、按 face/body 分型的压迫声、左右声像、身后湿声 cue 与 mimic 念白。前方应更直接,身后应更湿更暗但不糊掉怪物特征。' }
  ];

  function idOf(group, name) { return (group + '-' + name).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase(); }
  function spec(group, name, code, maze, note) { return { id: idOf(group, name), group: group, name: name, code: code, maze: maze, note: note || '' }; }
  function copy(extra, base) { var out = {}, k; base = base || {}; for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k]; for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k]; return out; }
  function roomMaze(extra) {
    return copy(extra || {}, { grid: ['#######', '#.....#', '#.P..D#', '#.....#', '#######'], start: { x: 2, y: 2, dir: 'E' }, theme: 'dungeon', monsters: [], decorDensity: 0, wallDecorDensity: 0, flatWalls: false });
  }
  function eventMaze(ev, extra) {
    return roomMaze(copy(extra || {}, { grid: ['#######', '#.....#', '#.P..D#', '#.....#', '#######'], start: { x: 2, y: 2, dir: 'E' }, events: [ev] }));
  }
  function wallPickupMaze() {
    return roomMaze({ grid: ['#####', '#.#.#', '#.P.#', '#...#', '#####'], start: { x: 2, y: 2, dir: 'N' }, theme: 'cave', events: [{ x: 2, y: 2, visual: 'wall-pickup', icon: 'scroll', face: 'N', once: true, hint: '面向北墙贴近,抽出墙缝里的纸片。' }] });
  }
  function monsterMaze(face, body, lines, where) {
    where = where || 'front';
    var mon = where === 'rear' ? { x: 1, y: 2, chase: false } : { x: 5, y: 2, chase: false };
    if (face) mon.face = face;
    if (body) mon.body = body;
    if (lines) mon.lines = lines;
    return roomMaze({ grid: ['#########', '#.......#', '#.P....D#', '#.......#', '#########'], start: { x: 2, y: 2, dir: 'E' }, theme: face === 'yurei' ? 'ice' : face === 'mimic' ? 'flesh' : 'dungeon', monsters: [mon], chaseSpeed: 1.2 });
  }

  var specs = [];
  ['', 'dungeon', 'cave', 'flesh', 'station', 'clinic', 'metal', 'ice', 'shoji'].forEach(function (name) {
    specs.push(spec('themes', name || 'default', 'maze.theme: ' + JSON.stringify(name || ''), roomMaze({ theme: name, idleHint: '停在原地,点一下画面或按住 ▲ 解锁并核听这一主题的底噪。' }), '只换主题,听常驻 room tone / tension 的色彩是否与画面相称。'));
  });

  specs.push(spec('pickups', 'pickup', "events[i].visual:'pickup'", eventMaze({ x: 3, y: 2, visual: 'pickup', icon: 'gem', once: true, hint: '显眼关键物:走上去听短亮上扬的确认声。' }, { theme: 'cave' }), '按住 ▲ 走到宝石格。'));
  specs.push(spec('pickups', 'floor-pickup', "events[i].visual:'floor-pickup'", eventMaze({ x: 3, y: 2, visual: 'floor-pickup', icon: 'ritual_marks', once: true, hint: '地面隐藏线索:贴近格中心,听低调 tap/scrape。' }, { theme: 'dungeon' }), '按住 ▲ 走到地面符号中心。'));
  specs.push(spec('pickups', 'wall-pickup', "events[i].visual:'wall-pickup'", wallPickupMaze(), '开局面向北墙;按住 ▲ 贴近墙面,听墙缝轻擦 + 浅亮确认。'));

  specs.push(spec('mechanisms', 'set / plate', 'events[i].set', eventMaze({ x: 3, y: 2, visual: 'plate', once: true, hint: '压力板触发:远处封墙沉下。', set: [{ x: 4, y: 2, ch: '.' }] }, { grid: ['#######', '#.....#', '#.P.#D#', '#.....#', '#######'], theme: 'dungeon' }), '按住 ▲ 踩压力板,听石板/远程机关声。'));
  specs.push(spec('mechanisms', 'warp / marker', 'events[i].warp', eventMaze({ x: 3, y: 2, visual: 'marker', once: true, hint: '符文阵触发:空间扭曲。', warp: { x: 1, y: 3, dir: 'E' } }, { theme: 'ice' }), '按住 ▲ 踩符文,听双段传送声。'));
  specs.push(spec('mechanisms', 'turn / trap', 'events[i].turn', eventMaze({ x: 3, y: 2, visual: 'trap', once: true, hint: '旋转地砖触发:朝向被打乱。', turn: 'W' }, { theme: 'metal' }), '按住 ▲ 踩陷阱,听金属/旋转冲击声。'));

  specs.push(spec('keydoor', 'key + locked door', "grid:'K' + 'D'", roomMaze({ grid: ['#######', '#.....#', '#.PKD.#', '#.....#', '#######'], start: { x: 2, y: 2, dir: 'E' }, theme: 'cave', keyIcon: 'key' }), '按住 ▲ 先拾取 K 钥匙,再正对 D 门开门;听钥匙叮声与开门声。'));
  specs.push(spec('keydoor', 'keycard + blast door', "keyIcon:'keycard' + exitStyle:'blast-door'", roomMaze({ grid: ['#######', '#.....#', '#.PKD.#', '#.....#', '#######'], start: { x: 2, y: 2, dir: 'E' }, theme: 'station', keyIcon: 'keycard', exitStyle: 'blast-door' }), '同一语义换科技皮:核听金属门开声是否仍清楚。'));

  specs.push(spec('monsters', 'zombie', "monsters[].face:'zombie'", monsterMaze('zombie'), '点画面或按住 ▲ 解锁后停住听:低沉喉鸣 + 心跳渐强。'));
  specs.push(spec('monsters', 'zombie behind', "monsters[].face:'zombie' // behind", monsterMaze('zombie', null, null, 'rear'), '怪在玩家身后:左右仍居中,但应比正前方更湿、更暗、有尾音;不是 HRTF,是背后遮蔽 cue。'));
  specs.push(spec('monsters', 'yurei', "monsters[].face:'yurei'", monsterMaze('yurei'), '幽灵气声与低柔哀鸣,不应像尖锐电子哨。'));
  specs.push(spec('monsters', 'skull', "monsters[].face:'skull'", monsterMaze('skull'), '空洞低鸣 + 软低风。'));
  specs.push(spec('monsters', 'mimic', "monsters[].face:'mimic'", monsterMaze('mimic', null, ['hello?', 'I love you']), '伪人连续底噪 + 靠近后延迟开口;默认 formant 合成,不依赖外部素材。'));
  specs.push(spec('monsters', 'mimic behind', "monsters[].face:'mimic' // behind", monsterMaze('mimic', null, ['hello?', 'I love you'], 'rear'), '同样是 formant 念白,身后快照应更湿更暗;浏览器 TTS 路只做床层陪衬,不承诺本体空间化。'));
  specs.push(spec('monsters', 'slender', "monsters[].body:'slender'", monsterMaze(null, 'slender'), '全身怪走 body 分支:电视静电/无线电噪声 + 低频耳鸣。'));

  function makeWorld() {
    var nodes = { blank: { kind: 'audioBlank', title: '静音', look: '' } };
    specs.forEach(function (s) { nodes[s.id] = { kind: 'maze3d', title: s.name, stageId: STAGE, maze: s.maze, look: s.note }; });
    return { id: '88888888-8888-4888-8888-888888888888', start: { map: 'm', node: 'blank' }, seed: 20260629, maps: { m: { name: 'maze3d 声音试听', nodes: nodes } } };
  }
  function blankModule() { return { id: 'audioBlank', nodeKinds: ['audioBlank'], render: function () { return { title: '静音', body: [] }; }, actions: function () { return []; } }; }

  function setActiveUi(s) {
    activeId = s ? s.id : null;
    titleEl.textContent = s ? ('正在试听: ' + s.name) : '未启动试听';
    noteEl.textContent = s ? s.note : '先选下方任一卡片;浏览器通常还需要你按住画面下方 ▲ 或按键盘方向键,才会真正放声。';
    codeEl.textContent = s ? s.code : '无 active preview';
    Array.prototype.forEach.call(root.querySelectorAll('.card'), function (c) { c.classList.toggle('active', activeId && c.dataset.id === activeId); });
  }
  function stopPreview() {
    if (engine) {
      try { engine.enter({ map: 'm', node: 'blank' }); } catch (e) { showError(e); }
    }
    setActiveUi(null);
  }
  function activate(s) {
    if (!engine) return;
    try {
      engine.enter({ map: 'm', node: s.id });
      setActiveUi(s);
    } catch (e) { showError(e); }
  }
  function muted() { try { return localStorage.getItem('amatlas-muted') === '1'; } catch (e) { return false; } }
  function setMuted(v) { try { localStorage.setItem('amatlas-muted', v ? '1' : '0'); } catch (e) {} syncMuteButton(); }
  function syncMuteButton() { if (muteBtn) muteBtn.textContent = muted() ? '🔇 已静音' : '🔊 全局声音'; }
  function showError(err) {
    var e = document.createElement('div'); e.className = 'error'; e.textContent = 'maze3d audio gallery 启动失败:\n' + (err && (err.stack || err.message) || err); document.body.appendChild(e);
  }

  function makeCard(s) {
    var card = document.createElement('article');
    card.className = 'card';
    card.dataset.group = s.group;
    card.dataset.id = s.id;
    card.innerHTML = '<div class="meta"><strong></strong><code></code><p></p><button type="button">启动试听</button></div>';
    card.querySelector('strong').textContent = s.name;
    card.querySelector('code').textContent = s.code;
    card.querySelector('p').textContent = s.note;
    card.querySelector('button').addEventListener('click', function () { activate(s); });
    root.querySelector('[data-section="' + s.group + '"] .grid').appendChild(card);
  }

  function build() {
    if (!root || !nav || !A.createEngine || !A.Maze3d || !A.Maze3d.createMaze3dModule) {
      showError('缺少 Amatlas core 或 Maze3d runtime。'); return;
    }
    nav.innerHTML = '<button type="button" data-filter="all" aria-pressed="true">全部</button>' + groups.map(function (g) { return '<button type="button" data-filter="' + g.id + '" aria-pressed="false">' + g.label + '</button>'; }).join('');
    root.innerHTML = groups.map(function (g) { return '<section data-section="' + g.id + '"><h2>' + g.title + '</h2><p class="section-note">' + g.note + '</p><div class="grid"></div></section>'; }).join('');

    engine = A.createEngine(makeWorld(), { storage: null });
    engine.registerModule(blankModule());   // registerModule 是旧式 escape hatch;生产代码推荐统一 engine.use({install})。
    engine.use(A.Maze3d.createMaze3dModule({ stageId: STAGE, width: 640, height: 400, fullscreen: false, mimicVoice: 'formant' }));
    engine.start();

    specs.forEach(makeCard);
    nav.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest('button[data-filter]'); if (!b) return;
      var f = b.getAttribute('data-filter');
      Array.prototype.forEach.call(nav.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      Array.prototype.forEach.call(root.querySelectorAll('section'), function (s) { s.classList.toggle('hidden', f !== 'all' && s.dataset.section !== f); });
    });
    if (stopBtn) stopBtn.addEventListener('click', stopPreview);
    if (muteBtn) muteBtn.addEventListener('click', function () { setMuted(!muted()); });
    window.addEventListener('beforeunload', stopPreview);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stopPreview(); });
    syncMuteButton();
  }

  build();
})();
