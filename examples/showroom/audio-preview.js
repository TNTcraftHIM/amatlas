/* Amatlas Showroom · 通用 Audio Workbench
   正式入口:试听公共 presenter audio 意图。临时 _scratch 页面只作历史参考,本页不复制它们。 */
(function () {
  'use strict';

  var root = document.getElementById('audio-preview');
  var tabs = document.querySelector('.tabs');
  var activeTitle = document.getElementById('active-title');
  var activeNote = document.getElementById('active-note');
  var activeCode = document.getElementById('active-code');
  var stopBtn = document.getElementById('stop-preview');
  var controlsRoot = document.getElementById('workbench-controls');
  var playSpecBtn = document.getElementById('play-workbench-spec');
  var playMidiBtn = document.getElementById('play-workbench-midi');
  var engine = null;
  var activeId = null;
  var cardEls = {};
  var controls = {};

  var previewWorld = window.AUDIO_PREVIEW_WORLD;
  if (!previewWorld || !previewWorld.start || !previewWorld.maps || !Array.isArray(previewWorld.previewGroups)) {
    showError(new Error('audio-preview-world.js 未正确加载:通用 Audio Workbench 需要先加载可导出的 world 数据。'));
    return;
  }

  var groups = previewWorld.previewGroups;
  var workbenchOptions = previewWorld.workbenchOptions || {};
  var midiDemos = previewWorld.midiDemos || [];
  var canRenderUi = !!(root && tabs && activeTitle && activeNote && activeCode && stopBtn);

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function worldForBoot() { return { id: previewWorld.id, start: previewWorld.start, seed: previewWorld.seed, maps: previewWorld.maps }; }

  function bootEngine() {
    engine = window.Amatlas.boot(worldForBoot(), {
      present: { svg: false, audio: { controlSlot: '#plugin-bar' } },
      storage: null,
      errorBanner: true
    });
    // 内部调试/探针钩子,非引擎公共 API;assembly-probe 依赖此钩子。
    window._audioPreviewEngine = engine;
    window._engine = engine;
  }

  function setActiveUi(spec) {
    activeId = spec && spec.id;
    Object.keys(cardEls).forEach(function (id) { cardEls[id].classList.toggle('active', id === activeId); });
    activeTitle.textContent = spec ? spec.name : '未启动试听';
    activeNote.textContent = spec ? spec.note : '先选下方任一卡片,或在工作台组合 MusicSpec / timbre / bass / MIDI;浏览器通常需要一次点击或按键手势才会真正放声。';
    activeCode.textContent = spec ? spec.code : '无 active preview';
  }

  function scrubAudioForCode(v) {
    var out = clone(v);
    if (out.music && typeof out.music === 'object' && out.music.midi != null) out.music.midi = '<base64 .mid>';
    return out;
  }
  function formatAudioCode(audio) {
    return 'audio: ' + JSON.stringify(scrubAudioForCode(audio), null, 2).replace(/"<base64 \.mid>"/g, "'<base64 .mid>'");
  }

  function updateWorkbenchNode(meta, audio) {
    var node = previewWorld.maps.workbench && previewWorld.maps.workbench.nodes && previewWorld.maps.workbench.nodes.preview;
    if (!node) throw new Error('audio-preview-world.js 缺少 workbench.preview 动态试听节点。');
    node.name = meta.name || '工作台试听';
    node.look = (meta.note || '') + '\n\n' + formatAudioCode(audio);
    node.audio = clone(audio);
  }

  function playAudioIntent(meta, audio, cardId) {
    try {
      if (!engine) bootEngine();
      updateWorkbenchNode(meta, audio);
      engine.enter({ map: 'workbench', node: 'preview' });
      setActiveUi({ id: cardId || null, name: meta.name || '工作台试听', note: meta.note || '', code: formatAudioCode(audio) });
    } catch (e) { showError(e); }
  }

  function startPreview(spec) { playAudioIntent({ name: spec.name, note: spec.note }, spec.audio, spec.id); }

  function stopPreview() {
    try {
      if (engine) engine.enter({ map: 'index', node: 'blank' });
      setActiveUi(null);
    } catch (e) { showError(e); }
  }

  function showError(e) {
    if (!root || !document.createElement) { if (window.console && console.error) console.error(e); return; }
    var pre = document.createElement('pre');
    pre.className = 'error';
    pre.textContent = (e && e.stack) || String(e);
    root.insertBefore(pre, root.firstChild);
  }

  function makeEl(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function selectControl(id, label, values, value) {
    var wrap = makeEl('label', 'control');
    wrap.appendChild(makeEl('span', '', label));
    var sel = document.createElement('select'); sel.id = id;
    values.forEach(function (v) {
      var opt = document.createElement('option');
      if (typeof v === 'object') { opt.value = v.value; opt.textContent = v.label; }
      else { opt.value = v; opt.textContent = v || '无'; }
      if (opt.value === value) opt.selected = true;
      sel.appendChild(opt);
    });
    wrap.appendChild(sel); controls[id] = sel; return wrap;
  }
  function numberControl(id, label, value, min, max, step) {
    var wrap = makeEl('label', 'control'); wrap.appendChild(makeEl('span', '', label));
    var input = document.createElement('input'); input.id = id; input.type = 'number'; input.value = value; input.min = min; input.max = max; input.step = step || 1;
    wrap.appendChild(input); controls[id] = input; return wrap;
  }
  function checkboxControl(id, label, checked) {
    var wrap = makeEl('label', 'check-control');
    var input = document.createElement('input'); input.id = id; input.type = 'checkbox'; input.checked = !!checked;
    wrap.appendChild(input); wrap.appendChild(makeEl('span', '', label)); controls[id] = input; return wrap;
  }
  function fieldset(title, children) {
    var fs = makeEl('fieldset', 'control-group'); fs.appendChild(makeEl('legend', '', title));
    children.forEach(function (c) { fs.appendChild(c); }); return fs;
  }

  function renderTabs() {
    groups.forEach(function (g, idx) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = g.label; b.setAttribute('aria-pressed', idx === 0 ? 'true' : 'false');
      b.onclick = function () {
        var on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        var sec = document.querySelector('[data-group="' + g.id + '"]');
        if (sec) sec.classList.toggle('hidden', !on);
      };
      tabs.appendChild(b);
    });
  }

  function renderGroups() {
    groups.forEach(function (g) {
      var sec = document.createElement('section');
      sec.setAttribute('data-group', g.id);
      var h = document.createElement('h2'); h.textContent = g.title; sec.appendChild(h);
      var p = document.createElement('p'); p.className = 'section-note'; p.textContent = g.note; sec.appendChild(p);
      var grid = document.createElement('div'); grid.className = 'grid'; sec.appendChild(grid);
      g.items.forEach(function (s) {
        var card = document.createElement('article'); card.className = 'card'; cardEls[s.id] = card;
        var meta = document.createElement('div'); meta.className = 'meta'; card.appendChild(meta);
        var badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = s.kind; meta.appendChild(badge);
        var strong = document.createElement('strong'); strong.textContent = s.name; meta.appendChild(strong);
        var note = document.createElement('p'); note.textContent = s.note; meta.appendChild(note);
        var code = document.createElement('code'); code.textContent = s.code; meta.appendChild(code);
        var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = '试听'; btn.onclick = function () { startPreview(s); }; meta.appendChild(document.createElement('p')).appendChild(btn);
        grid.appendChild(card);
      });
      root.appendChild(sec);
    });
  }

  function renderWorkbench() {
    if (!controlsRoot) return;
    var instruments = workbenchOptions.instruments || ['pad','bass','arp','lead','perc','drone'];
    controlsRoot.appendChild(fieldset('MusicSpec 基底', [
      selectControl('wb-preset', 'preset', workbenchOptions.presets || [{ value: 'calm', label: 'calm' }], 'calm'),
      selectControl('wb-key', 'key', workbenchOptions.keys || ['C','D','G','A'], 'D'),
      selectControl('wb-mode', 'mode', workbenchOptions.modes || ['major','minor'], 'minor'),
      numberControl('wb-tempo', 'tempo', 92, 40, 180, 1),
      selectControl('wb-progression', 'progression', workbenchOptions.progressions || [''], 'dread'),
      selectControl('wb-melody', 'melody', workbenchOptions.melodies || ['sparse','flowing','none'], 'sparse'),
      numberControl('wb-intensity', 'intensity', 0.65, 0, 1, 0.05)
    ]));
    controlsRoot.appendChild(fieldset('声部 instruments', instruments.map(function (name) { return checkboxControl('wb-inst-' + name, name, name === 'pad' || name === 'bass' || name === 'arp'); })));
    controlsRoot.appendChild(fieldset('音色 timbre', [
      selectControl('wb-timbre-pad', 'pad', (workbenchOptions.timbre && workbenchOptions.timbre.pad) || [''], ''),
      selectControl('wb-timbre-lead', 'lead', (workbenchOptions.timbre && workbenchOptions.timbre.lead) || [''], ''),
      selectControl('wb-timbre-arp', 'arp', (workbenchOptions.timbre && workbenchOptions.timbre.arp) || [''], ''),
      selectControl('wb-timbre-bass', 'bass', (workbenchOptions.timbre && workbenchOptions.timbre.bass) || [''], '')
    ]));
    controlsRoot.appendChild(fieldset('叠加层', [
      selectControl('wb-ambient', 'ambient', workbenchOptions.ambient || [''], ''),
      selectControl('wb-sfx', 'sfx', workbenchOptions.sfx || [''], ''),
      selectControl('wb-midi', 'MIDI 示例', midiDemos.map(function (m) { return { value: m.id, label: m.label }; }), midiDemos[0] && midiDemos[0].id)
    ]));
  }

  function selected(id) { return controls[id] ? controls[id].value : ''; }
  function checked(id) { return !!(controls[id] && controls[id].checked); }
  function ensureRole(spec, role) { if (spec.instruments.indexOf(role) < 0) spec.instruments.push(role); }
  function buildMusicSpecFromControls() {
    var inst = [];
    (workbenchOptions.instruments || []).forEach(function (role) { if (checked('wb-inst-' + role)) inst.push(role); });
    if (!inst.length) inst.push('pad');
    var spec = {
      preset: selected('wb-preset') || 'calm',
      key: selected('wb-key') || 'D',
      mode: selected('wb-mode') || 'minor',
      tempo: Math.max(40, Math.min(180, Number(selected('wb-tempo')) || 92)),
      instruments: inst,
      melody: selected('wb-melody') || 'sparse',
      intensity: Math.max(0, Math.min(1, Number(selected('wb-intensity')) || 0.65)),
      seed: 20260629
    };
    var prog = selected('wb-progression'); if (prog) spec.progression = prog;
    var timbre = {};
    ['pad','lead','arp','bass'].forEach(function (role) {
      var v = selected('wb-timbre-' + role);
      if (v) { timbre[role] = v; ensureRole(spec, role); }
    });
    if (Object.keys(timbre).length) spec.timbre = timbre;
    return spec;
  }
  function buildAudioFromControls() {
    var sfx = selected('wb-sfx');
    var amb = selected('wb-ambient');
    return { music: buildMusicSpecFromControls(), ambient: amb || false, sfx: sfx ? [sfx] : [] };
  }
  function playWorkbenchSpec() {
    var audio = buildAudioFromControls();
    playAudioIntent({ name: '完整音乐与短呼吸 · 工作台 MusicSpec', note: '同一个公共 audio.music 对象从第一段就给出完整陈述，之后由正式 presenter 在完整织体内部做轻回应，并只在段尾短暂峰值或收口呼吸。可以立即判断主体，也可继续听发展与循环接缝；下方代码片段可直接复制进 world.js。' }, audio, null);
  }
  function playWorkbenchMidi() {
    var id = selected('wb-midi');
    var demo = null;
    for (var i = 0; i < midiDemos.length; i++) if (midiDemos[i].id === id) demo = midiDemos[i];
    if (!demo) return;
    var audio = { music: { midi: demo.midi, loop: true, gain: 0.55 }, ambient: false, sfx: [] };
    playAudioIntent({ name: '工作台 MIDI · ' + demo.label, note: demo.note + ' 这是既有 {midi:base64} 形态,不是上传工具或新字段。' }, audio, null);
  }

  if (!canRenderUi) { bootEngine(); return; }   // assembly-probe 的 document stub 无真实 DOM;仍启动引擎以暴露 window._audioPreviewEngine/window._engine。

  renderTabs();
  renderWorkbench();
  renderGroups();
  stopBtn.onclick = stopPreview;
  if (playSpecBtn) playSpecBtn.onclick = playWorkbenchSpec;
  if (playMidiBtn) playMidiBtn.onclick = playWorkbenchMidi;
  document.addEventListener('visibilitychange', function () { if (document.hidden) stopPreview(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootEngine);
  else bootEngine();
})();
