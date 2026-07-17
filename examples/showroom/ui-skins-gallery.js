/* Amatlas Showroom · UI Skin Gallery
   这不是新模块或 playable demo;它用真实 Amatlas.boot 页面展示同一普通 DOM chrome 的换皮效果。 */
(function () {
  'use strict';

  var SKINS = [
    { id: 'amatlas-dark', label: 'Amatlas Dark', note: '默认深色叙事 UI,适合作为普通文字冒险基线。' },
    { id: 'parchment', label: 'Parchment', note: '羊皮纸/书页,适合幻想、历史、童话。' },
    { id: 'terminal', label: 'Terminal', note: '终端/设施日志,适合科幻、黑客、异常档案。' },
    { id: 'casefile', label: 'Casefile', note: '证据板/侦探档案,适合悬疑、调查、轻恐怖。' },
    { id: 'rust-zine', label: 'Rust Zine', note: '锈色剪贴杂志,适合废土、反叛、脏乱手册。' },
    { id: 'occult-margins', label: 'Occult Margins', note: '边注符号与仪式感,适合神秘学、古宅、异端研究。' },
    { id: 'neon-noir', label: 'Neon Noir', note: '霓虹夜城与高对比玻璃,适合赛博、都市、追逃。' },
    { id: 'field-notes', label: 'Field Notes', note: '野外笔记/网格纸,适合探索、调查、自然志。' }
  ];

  function $(id) { return document.getElementById(id); }
  function htmlRoot() { return document.documentElement || (document.querySelector && document.querySelector('html')); }
  function currentSkin() {
    var root = htmlRoot();
    return (root && root.dataset && root.dataset.ui) || (root && root.getAttribute && root.getAttribute('data-ui')) || '';
  }
  function writeSkin(skin) {
    var root = htmlRoot();
    if (!root) return;
    if (root.dataset) root.dataset.ui = skin;
    else if (root.setAttribute) root.setAttribute('data-ui', skin);
  }
  function refreshSkinStatus(skin) {
    var status = $('status');
    if (!status) return;
    Array.prototype.forEach.call(status.querySelectorAll('.status-item'), function (item) {
      if (item.textContent && item.textContent.indexOf('skin' + ':') === 0) {
        var value = item.querySelector('b');
        if (value) value.textContent = skin;
      }
    });
  }

  function setSkin(id) {
    var found = SKINS.some(function (s) { return s.id === id; });
    var skin = found ? id : SKINS[0].id;
    writeSkin(skin);
    var active = SKINS.filter(function (s) { return s.id === skin; })[0] || SKINS[0];
    var now = $('skin-current');
    if (now) now.textContent = active.label + ' — ' + active.note;
    Array.prototype.forEach.call(document.querySelectorAll('[data-skin-choice]'), function (btn) {
      var on = btn.getAttribute('data-skin-choice') === skin;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    refreshSkinStatus(skin);
  }

  function setupSkinControls() {
    var wrap = $('skin-controls');
    if (!wrap) return;
    wrap.innerHTML = '';
    SKINS.forEach(function (skin) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'skin-choice';
      btn.setAttribute('data-skin-choice', skin.id);
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = '<strong>' + skin.label + '</strong><span>' + skin.note + '</span>';
      btn.addEventListener('click', function () { setSkin(skin.id); });
      wrap.appendChild(btn);
    });
    setSkin(currentSkin() || SKINS[0].id);
  }

  function boot() {
    var WORLD = (typeof UI_SKINS_GALLERY_WORLD !== 'undefined')
      ? UI_SKINS_GALLERY_WORLD
      : window.UI_SKINS_GALLERY_WORLD;

    setupSkinControls();

    var engine = window.Amatlas.boot(WORLD, {
      present: { audio: false },
      status: function (s) {
        var bits = [ { label: 'skin', value: String(currentSkin() || 'amatlas-dark') } ];
        if (s.flags && s.flags.sampleRead) bits.push({ label: '样张', value: '已读' });
        if (s.inventory && s.inventory.length) bits.push({ label: '物品', value: s.inventory.join('、') });
        return bits;
      },
      save: true,
      minimap: { mode: 'toggle', layout: 'spatial', fog: 'frontier' },
      reset: true,
      achievements: [
        { id: 'opened-gallery', title: '打开 UI Skin Gallery', description: '进入普通页面 UI skin 选材页', on: 'action', when: function (s) { return !!(s.flags && s.flags.galleryOpened); } },
        { id: 'read-sample', title: '读懂换皮边界', description: '阅读样张说明,理解 skin 只属于 HTML/CSS 模板层', on: 'action', when: function (s) { return !!(s.flags && s.flags.sampleRead); } }
      ]
    });

    window._engine = engine;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
