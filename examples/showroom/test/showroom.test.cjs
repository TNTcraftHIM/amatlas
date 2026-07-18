/* Amatlas Gallery Hub 静态回归 —— 正式 Gallery / Preview / Workbench 入口,不是 _scratch 实验页。 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var ENGINE = path.join(ROOT, '..', '..');
var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('FAIL ' + msg); } }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hasAll(src, names) { var miss = []; for (var i = 0; i < names.length; i++) if (src.indexOf(names[i]) < 0) miss.push(names[i]); return miss; }
function linkTargets(html) {
  var out = [], re = /href="([^"]+)"/g, m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function anchorTargets(html) {
  var out = [], re = /<a\b[^>]*\bhref="([^"]+)"/gi, m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function localAnchors(html) {
  return anchorTargets(html).filter(function (h) { return !/^[a-z]+:/i.test(h) && h.charAt(0) !== '#'; });
}
function dataTargets(html) {
  var out = [], re = /\bdata-src="([^"]+)"/g, m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function scriptTargets(html) {
  var out = [], re = /<script\s+src="([^"]+)"/g, m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function relExists(fromDir, href) {
  if (/^[a-z]+:/i.test(href) || href.charAt(0) === '#') return true;
  var clean = href.split('#')[0].split('?')[0];
  return fs.existsSync(path.resolve(fromDir, clean));
}

var indexHtml = read('index.html');
var audioHtml = read('audio-preview.html');
var audioJs = read('audio-preview.js');
var audioWorldJs = read('audio-preview-world.js');
var audioWorld = require(path.join(ROOT, 'audio-preview-world.js'));
var audioCombined = audioJs + '\n' + audioWorldJs;
var uiHtml = read('ui-skins-gallery.html');
var uiJs = read('ui-skins-gallery.js');
var uiWorldJs = read('ui-skins-gallery-world.js');
var uiWorld = require(path.join(ROOT, 'ui-skins-gallery-world.js'));
var uiCss = fs.readFileSync(path.join(ENGINE, 'ui', 'amatlas-skins.css'), 'utf8');
var uiCombined = uiHtml + '\n' + uiCss + '\n' + uiJs + '\n' + uiWorldJs;
var EXPECTED_UI_SKINS = ['amatlas-dark', 'parchment', 'terminal', 'casefile', 'rust-zine', 'occult-margins', 'neon-noir', 'field-notes'];
var FORMAL_SKIN_EXAMPLES = [
  'text-adventure-demo', 'tabletop-demo', 'cutscene-demo', 'minimal-demo', 'arcade-demo', 'maze3d', 'horror-demo'
];

console.log('════ showroom 静态回归 ════');

(function () {   // S1 Gallery 单向索引 12 个目标，launcher 不是硬跳转 anchor。
  var expected = [
    'ui-skins-gallery.html', 'audio-preview.html', '../maze3d/gallery.html', '../maze3d/audio-gallery.html',
    '../text-adventure-demo/index.html', '../tabletop-demo/index.html', '../cutscene-demo/index.html', '../maze3d/index.html',
    '../minimal-demo/index.html', '../arcade-demo/index.html', '../horror-demo/index.html', '../origin/index.html'
  ].sort();
  var targets = dataTargets(indexHtml).sort();
  var unique = Array.from(new Set(targets));
  var same = targets.length === expected.length && targets.every(function (value, i) { return value === expected[i]; });
  var hard = anchorTargets(indexHtml).filter(function (href) { return expected.indexOf(href) >= 0; });
  var launchers = (indexHtml.match(/<button\b[^>]*\bdata-src=/g) || []).length;
  ok(same && unique.length === expected.length && launchers === expected.length && !hard.length && /class="demoport"/.test(indexHtml) && /class="demoport-frame"/.test(indexHtml),
    'S1 embedded dev Gallery 必须精确单向索引 12 个目标并以 button 打开单例 overlay targets=' + JSON.stringify(targets) + ' hard=' + hard.join(',') + ' launchers=' + launchers);
})();

(function () {   // S2 正式 Gallery/workbench 不链接临时或发布产物，workbench 无跨页导航。
  var links = linkTargets(indexHtml).concat(linkTargets(audioHtml), linkTargets(uiHtml)).concat(dataTargets(indexHtml));
  var badScratch = links.filter(function (h) { return h.indexOf('_scratch') >= 0; });
  var badDist = links.filter(function (h) { return h.indexOf('dist/') >= 0 || h.indexOf('amatlas.tar.gz') >= 0; });
  ok(!badScratch.length && !badDist.length && !localAnchors(audioHtml).length && !localAnchors(uiHtml).length,
    'S2 embedded Gallery 不碰临时/发布产物，两个 workbench 不跨页导航 scratch=' + badScratch.join(',') + ' dist=' + badDist.join(',') + ' audio=' + localAnchors(audioHtml).join(',') + ' ui=' + localAnchors(uiHtml).join(','));
})();

(function () {   // S3 相对资源与 12 个 iframe target 均能在 file:// 源码树解析。
  var bad = linkTargets(indexHtml).concat(dataTargets(indexHtml)).filter(function (h) { return !relExists(ROOT, h); })
    .concat(linkTargets(audioHtml).filter(function (h) { return !relExists(ROOT, h); }).map(function (h) { return 'audio:' + h; }))
    .concat(linkTargets(uiHtml).filter(function (h) { return !relExists(ROOT, h); }).map(function (h) { return 'ui:' + h; }));
  ok(!bad.length, 'S3 embedded Gallery 的链接、脚本与 iframe target 在 file:// 源码树均存在 bad=' + bad.join(','));
})();

(function () {   // S4 audio-preview 使用正式 Amatlas 链路:core + text module + DOM/audio presenters + compose/progressions/MIDI + boot + world + 自己脚本。
  var miss = hasAll(audioHtml, [
    '../../core/runtime/engine-core.js', '../../modules/text-adventure/runtime/renderer.js', '../../presenters/present-dom.js',
    '../../presenters/progressions.js', '../../presenters/compose-music.js', '../../presenters/midi-music.js', '../../presenters/present-audio.js', '../../preset/boot.js',
    'audio-preview-world.js', 'audio-preview.js'
  ]);
  var scripts = scriptTargets(audioHtml);
  var badScripts = scripts.filter(function (s) { return s.indexOf('_scratch') >= 0 || /^https?:/i.test(s); });
  var midiIdx = scripts.indexOf('../../presenters/midi-music.js');
  var audioIdx = scripts.indexOf('../../presenters/present-audio.js');
  var worldIdx = scripts.indexOf('audio-preview-world.js');
  var uiIdx = scripts.indexOf('audio-preview.js');
  ok(!miss.length && !badScripts.length && midiIdx >= 0 && audioIdx > midiIdx && worldIdx >= 0 && uiIdx > worldIdx,
    'S4 audio-preview.html 引正式 runtime/presenter/boot/world,MIDI 在 present-audio 前,不引 _scratch/远程脚本 miss=' + miss.join(',') + ' bad=' + badScripts.join(',') + ' order=' + midiIdx + '/' + audioIdx + '/' + worldIdx + '/' + uiIdx);
})();

(function () {   // S5 audio-preview 通过真实 View audio 触发,不直调 presenter/maze 私有函数。
  var forbidden = ['bgmFreq', 'sfxSpec', 'composeMusic', 'parseMidi', 'startMusic', 'eventPickupSfx', 'buildMazeAmbient', 'buildProxAmb'].filter(function (x) { return audioCombined.indexOf(x + '(') >= 0; });
  ok(!forbidden.length && audioJs.indexOf('window.Amatlas.boot') >= 0 && audioJs.indexOf('AUDIO_PREVIEW_WORLD') >= 0 && audioJs.indexOf('playAudioIntent') >= 0 && audioWorldJs.indexOf("kind: 'scene'") >= 0 && audioWorldJs.indexOf('audio: s.audio') >= 0,
    'S5 audio-preview 走 Amatlas.boot + 可导出 scene view.audio world + workbench 动态节点,不直调内部合成/maze 私有函数 forbidden=' + forbidden.join(','));
})();

(function () {   // S6 audio-preview 生命周期:默认 blank 静音、一次只激活一个 engine、停止/切后台会停。
  var createCount = (audioJs.match(/window\.Amatlas\.boot\(/g) || []).length;
  var miss = hasAll(audioCombined, ["node: 'blank'", 'stopPreview', 'visibilitychange', 'music: false', 'ambient: false', 'storage: null']);
  ok(createCount === 1 && !miss.length && audioCombined.indexOf('startPreview(specs[0]') < 0,
    'S6 audio-preview 单 engine + blank stop + 隐藏页停止 + 不自动启动首个试听 createCount=' + createCount + ' miss=' + miss.join(','));
})();

(function () {   // S7 覆盖正式 music / MusicSpec / timbre / bass / MIDI / ambient / sfx / combo 词汇池,不是只挑几条 scratch 历史样本。
  var miss = hasAll(audioWorldJs, [
    'music-preset', 'music-spec', 'timbre', 'bass', 'midi', 'ambient', 'sfx', 'combo', 'workbenchOptions', 'midiDemos',
    'calm', 'tense', 'eerie', 'heroic', 'sad', 'pastoral', 'sacral', 'battle', 'mystery', 'festive', 'desolate', 'eastern', 'lullaby', 'synthwave', 'jazz-noir', 'march', 'chase', 'romance', 'scherzo', 'stealth', 'elegy', 'baroque',
    'key', 'mode', 'tempo', 'progression', 'instruments', 'melody', 'intensity', 'timbre', 'seed', 'pad', 'lead', 'arp', 'bass', 'choir', 'chant', 'glass', 'flute', 'reed', 'kalimba', 'sub', 'upright', 'picked', 'synth', 'sine-pluck',
    'TVRoZA', '<base64 .mid>',
    'wind', 'waves', 'rain', 'storm', 'forest', 'stream', 'night', 'snow', 'campfire', 'tavern', 'town', 'cave', 'underwater', 'heartbeat', 'ambient-unease',
    'success', 'fail', 'dice-roll', 'pickup', 'click', 'door', 'impact', 'magic', 'birds', 'thunder'
  ]);
  var chantCard = audioWorldJs.indexOf("timbre:{pad:'choir',lead:'chant'}") >= 0 && audioWorldJs.indexOf("lead: ['', 'soft','pulse','bell','pluck','brass','harp','flute','reed','chant']") >= 0;
  ok(!miss.length && chantCard, 'S7 audio-preview 覆盖 music/MusicSpec/timbre(含可直接试听的 choir+chant)/bass/MIDI/ambient/sfx 正式能力 miss=' + miss.join(','));
})();

(function () {   // S8 新文件位于 engine/examples,不是未打包 scratch;公共核心/契约文件不参与。
  ok(fs.existsSync(path.join(ROOT, 'index.html')) && fs.existsSync(path.join(ROOT, 'audio-preview.html')) && fs.existsSync(path.join(ROOT, 'audio-preview-world.js')) && fs.existsSync(path.join(ROOT, 'audio-preview.js')) && fs.existsSync(path.join(ROOT, 'ui-skins-gallery.html')) && fs.existsSync(path.join(ROOT, 'ui-skins-gallery-world.js')) && fs.existsSync(path.join(ROOT, 'ui-skins-gallery.js')),
    'S8 showroom hub / Audio Workbench / UI Skin Gallery 正式入口与数据文件存在');
  ok(fs.existsSync(path.join(ENGINE, 'core', 'runtime', 'engine-core.js')) && fs.existsSync(path.join(ENGINE, 'core', 'module-interface.md')),
    'S8 只读确认核心/公共契约仍在原位(本测试不要求也不修改它们)');
})();

(function () {   // S9 world 脚本可被 Node require 成真实 {start,maps},否则 build 准入门会找不到世界数据。
  var nodes = audioWorld && audioWorld.maps && audioWorld.maps.index && audioWorld.maps.index.nodes;
  var groups = audioWorld && audioWorld.previewGroups;
  var groupMaps = groups && groups.filter(function (g) { return audioWorld.maps[g.id] && audioWorld.maps[g.id].nodes; });
  var workbench = audioWorld && audioWorld.maps && audioWorld.maps.workbench && audioWorld.maps.workbench.nodes && audioWorld.maps.workbench.nodes.preview;
  var blank = nodes && nodes.blank && nodes.blank.audio;
  ok(!!(audioWorld && audioWorld.start && audioWorld.maps && nodes && nodes.blank && Array.isArray(groups) && groupMaps.length === groups.length && workbench && audioWorld.workbenchOptions && audioWorld.midiDemos && blank.music === false && blank.bgm === false && blank.ambient === false && Array.isArray(blank.sfx)),
    'S9 audio-preview-world.js 导出 build gate 可识别的 {start,maps}+previewGroups+workbench.preview+显式停声 blank,并按分组拆 maps 避免单图过大');
})();

(function () {   // S10 Audio Workbench 控件真实存在:不是只在 world 里列数据,页面能组合 MusicSpec/MIDI。
  var missHtml = hasAll(audioHtml, ['workbench-controls', 'play-workbench-spec', 'play-workbench-midi', 'Amatlas 通用音频工作台']);
  var missJs = hasAll(audioJs, ['buildMusicSpecFromControls', 'ensureRole', 'formatAudioCode', 'playAudioIntent', 'workbench.preview', '<base64 .mid>']);
  ok(!missHtml.length && !missJs.length,
    'S10 audio-preview 页面有工作台控件,脚本能生成 MusicSpec/MIDI 并格式化可复制代码 missHtml=' + missHtml.join(',') + ' missJs=' + missJs.join(','));
})();

(function () {   // S10b 正式 Workbench 明示“开场即完整 + 内部短呼吸”；旧/新 A/B 留在 gitignored _scratch，不进发布面。
  var miss = hasAll(audioHtml, ['试听完整音乐与短呼吸', '从第一段就是完整陈述', '可以立即判断主体']);
  var jsMiss = hasAll(audioJs, ['完整音乐与短呼吸 · 工作台 MusicSpec', '只在段尾短暂峰值或收口呼吸', 'playAudioIntent']);
  var stale = ['至少听满一轮', '至少听满四段'].filter(function (x) { return audioCombined.indexOf(x) >= 0; });
  var forbiddenApi = ['legacyComposeMusic', 'music.variant', 'audio.music.variant'].filter(function (x) { return audioCombined.indexOf(x) >= 0; });
  ok(!miss.length && !jsMiss.length && !stale.length && !forbiddenApi.length,
    'S10b Audio Workbench 明示开场即完整与段尾短呼吸、复用真实 View.audio，且不形成第二公共 API miss=' + miss.join(',') + ' jsMiss=' + jsMiss.join(',') + ' stale=' + stale.join(',') + ' forbiddenApi=' + forbiddenApi.join(','));
})();

(function () {   // S11 UI Skin Gallery 使用真实 Amatlas 链路,不是静态截图或孤立 demo。
  var miss = hasAll(uiHtml, [
    '../../ui/amatlas-skins.css', '../../core/runtime/engine-core.js', '../../modules/text-adventure/runtime/renderer.js', '../../presenters/present-dom.js', '../../presenters/present-svg.js',
    '../../plugins/save.js', '../../plugins/minimap.js', '../../plugins/achievement.js', '../../plugins/reset.js', '../../preset/boot.js',
    'ui-skins-gallery-world.js', 'ui-skins-gallery.js', '#mapname/#place/#scene/#look/#choices/#status'
  ]);
  var scripts = scriptTargets(uiHtml);
  var styles = linkTargets(uiHtml).filter(function (h) { return /\.css(?:$|[?#])/.test(h); });
  var badScripts = scripts.filter(function (s) { return s.indexOf('_scratch') >= 0 || /^https?:/i.test(s); });
  var badStyles = styles.filter(function (s) { return s !== '../../ui/amatlas-skins.css'; });
  var bootIdx = scripts.indexOf('../../preset/boot.js');
  var worldIdx = scripts.indexOf('ui-skins-gallery-world.js');
  var skinIdx = scripts.indexOf('ui-skins-gallery.js');
  ok(!miss.length && !badScripts.length && !badStyles.length && bootIdx >= 0 && worldIdx > bootIdx && skinIdx > worldIdx,
    'S11 ui-skins-gallery.html 引正式共享 CSS + core/module/presenter/plugin/boot/world/脚本,不引 _scratch/远程脚本 miss=' + miss.join(',') + ' badScripts=' + badScripts.join(',') + ' badStyles=' + badStyles.join(',') + ' order=' + bootIdx + '/' + worldIdx + '/' + skinIdx);
})();

(function () {   // S12 UI skin 只走 HTML/CSS data-ui 约定,不变成 public schema、模块或 demo 目录。
  var miss = hasAll(uiCombined, ['data-ui="amatlas-dark"', '../../ui/amatlas-skins.css', 'data-skin-choice', 'skin-controls', '不是 demo', '不是新模块', '不新增 world/View 字段', 'writeSkin(skin)']).concat(hasAll(uiCombined, EXPECTED_UI_SKINS));
  var cssMiss = EXPECTED_UI_SKINS.filter(function (id) { return uiCss.indexOf('html[data-ui="' + id + '"]') < 0; });
  var jsMiss = EXPECTED_UI_SKINS.filter(function (id) { return uiJs.indexOf("id: '" + id + "'") < 0; });
  var forbidden = ['ui-skins-demo', 'theme:', 'skin:', 'kind: \'ui\'', 'kind: "ui"'].filter(function (x) { return uiCombined.indexOf(x) >= 0; });
  ok(!miss.length && !cssMiss.length && !jsMiss.length && !forbidden.length,
    'S12 UI Skin Gallery 明确是 Gallery/Preview + html[data-ui] CSS 约定,8 套 skin 在 CSS/JS 双侧登记,不新增 demo/schema/kind miss=' + miss.join(',') + ' cssMiss=' + cssMiss.join(',') + ' jsMiss=' + jsMiss.join(',') + ' forbidden=' + forbidden.join(','));
})();

(function () {   // S13 UI Skin Gallery 的装配覆盖普通 chrome 与插件 chrome,并显式不启用音频。
  var createCount = (uiJs.match(/window\.Amatlas\.boot\(/g) || []).length;
  var miss = hasAll(uiCombined, ['UI_SKINS_GALLERY_WORLD', 'present: { audio: false }', 'save: true', 'minimap:', 'achievements:', 'reset: true', 'plugin-bar', 'plugin-minimap', 'plugin-overlay', 'lockHint', 'showWhenLocked', 'status: function']);
  ok(createCount === 1 && !miss.length,
    'S13 UI Skin Gallery 单 Amatlas.boot + save/minimap/achievement/reset + audio:false,覆盖锁定/状态/插件 chrome createCount=' + createCount + ' miss=' + miss.join(','));
})();

(function () {   // S14 UI world 是真实可审计 world:短小普通 scene,覆盖 prose/event/locked/move/status/scene。
  var nodes = uiWorld && uiWorld.maps && uiWorld.maps.gallery && uiWorld.maps.gallery.nodes;
  var foyer = nodes && nodes.foyer;
  var locked = foyer && foyer.links && foyer.links.filter(function (l) { return l.showWhenLocked && typeof l.requires === 'function' && l.lockHint; });
  var hasScenes = nodes && Object.keys(nodes).filter(function (id) { return nodes[id].kind === 'scene' && nodes[id].scene && nodes[id].scene.elements; }).length >= 4;
  ok(!!(uiWorld && uiWorld.start && uiWorld.start.map === 'gallery' && uiWorld.start.node === 'foyer' && nodes && foyer && foyer.kind === 'scene' && Array.isArray(foyer.events) && locked && locked.length && hasScenes && uiWorld.initState && Array.isArray(uiWorld.initState.inventory)),
    'S14 ui-skins-gallery-world.js 导出真实 {start,maps},覆盖 event/locked/scene/inventory,供 graph-audit/build gate 检查');
})();

(function () {   // S15 7 个正式 playable example 全部接入共享 skin,但不把 skin 写进 world/schema。
  var bad = [], missingCss = [], extraSkinFields = [];
  FORMAL_SKIN_EXAMPLES.forEach(function (name) {
    var htmlPath = path.join(ENGINE, 'examples', name, 'index.html');
    var worldPath = path.join(ENGINE, 'examples', name, 'world.js');
    var html = fs.readFileSync(htmlPath, 'utf8');
    if (html.indexOf('data-ui="amatlas-dark"') < 0 || html.indexOf('href="../../ui/amatlas-skins.css"') < 0) bad.push(name);
    var styles = linkTargets(html).filter(function (h) { return /\.css(?:$|[?#])/.test(h); });
    if (styles.indexOf('../../ui/amatlas-skins.css') < 0 || styles.filter(function (h) { return h === '../../ui/amatlas-skins.css'; }).length !== 1) missingCss.push(name + ':' + styles.join('|'));
    if (fs.existsSync(worldPath)) {
      var w = fs.readFileSync(worldPath, 'utf8');
      if (/(?:^|[^A-Za-z0-9_$])(theme|skin|ui)\s*:/.test(w) && name !== 'maze3d') extraSkinFields.push(name);
    }
  });
  ok(!bad.length && !missingCss.length && !extraSkinFields.length,
    'S15 7 个正式 example 均接入 data-ui + 共享 CSS,且未新增 world theme/skin/ui 字段 bad=' + bad.join(',') + ' missingCss=' + missingCss.join(',') + ' extraSkinFields=' + extraSkinFields.join(','));
})();

(function () {   // S15b 正式 playable 是自包含叶子，不依赖 Gallery 或作者页。
  var badLeafLinks = [];
  FORMAL_SKIN_EXAMPLES.forEach(function (name) {
    var html = fs.readFileSync(path.join(ENGINE, 'examples', name, 'index.html'), 'utf8');
    localAnchors(html).forEach(function (href) { badLeafLinks.push(name + ':' + href); });
  });
  ok(!badLeafLinks.length,
    'S15b 7 个正式 playable 都是自包含叶子，无依赖 embedded Gallery/作者页的相对导航 bad=' + badLeafLinks.join(','));
})();

(function () {   // S16 共享 skin 不得把正式 playable 的 #app 推到左边或把旧正文范本包成大卡片。
  var appBlock = (uiCss.match(/#app\s*\{[^}]*\}/) || [''])[0];
  var bodyBlock = (uiCss.match(/(?:^|\n)body\s*\{[^}]*\}/) || [''])[0];
  var miss = [];
  if (!/margin:\s*0 auto;/.test(appBlock)) miss.push('shared #app margin:0 auto');
  if (!/min-height:\s*100vh;/.test(appBlock)) miss.push('shared #app min-height:100vh');
  if (!/padding:\s*24px 18px 64px;/.test(appBlock)) miss.push('shared #app old padding rhythm');
  if (/box-shadow\s*:/.test(appBlock) && !/box-shadow:\s*none;/.test(appBlock)) miss.push('shared #app card shadow');
  if (/border:\s*1px/.test(appBlock)) miss.push('shared #app card border');
  if (/background:\s*color-mix/.test(appBlock)) miss.push('shared #app panel background');
  if (!/font:\s*16px\/1\.7/.test(bodyBlock)) miss.push('shared body old font rhythm');
  if (uiHtml.indexOf('.shell > #app { margin: 0; }') < 0) miss.push('gallery shell app margin override');
  ok(!miss.length, 'S16 共享 skin 保持正式 example 阅读框居中、旧正文节奏和无外层大卡片 miss=' + miss.join(','));
})();

(function () {   // S17 内置 skin 只能换材质/颜色/chrome,不得改正式 playable 的排版几何。
  var cssRules = uiCss.replace(/\/\*[\s\S]*?\*\//g, '');
  function block(re) { return (cssRules.match(re) || [''])[0]; }
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function ruleBodiesFor(id, target, suffix) {
    var bodies = [];
    var selectorRe = new RegExp('html\\[data-ui="' + id + '"\\]\\s+' + esc(target) + (suffix || '(?:\\s|,|$)'));
    var ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    var m;
    while ((m = ruleRe.exec(cssRules))) {
      if (selectorRe.test(m[1])) bodies.push(m[2]);
    }
    return bodies.join('\n');
  }
  var bad = [];
  EXPECTED_UI_SKINS.forEach(function (id) {
    var token = block(new RegExp('html\\[data-ui="' + id + '"\\]\\s*\\{[^}]*\\}'));
    var app = ruleBodiesFor(id, '#app');
    var place = ruleBodiesFor(id, '#place');
    var scene = ruleBodiesFor(id, '#scene');
    var look = ruleBodiesFor(id, '#look');
    var choice = ruleBodiesFor(id, '.choice', '(?:\\s|,|\\.|$)');
    if (token.indexOf('--amatlas-app-max: 720px;') < 0) bad.push(id + ':app-max');
    if (/Georgia|Times New Roman|Songti SC|ui-monospace|Trebuchet MS/.test(token)) bad.push(id + ':font-metric');
    if (/(^|[;{]\s*)(padding|max-width|width|margin|transform)\s*:/.test(app) || /(^|[;{]\s*)border\s*:/.test(app)) bad.push(id + ':app-geometry');
    if (/display\s*:\s*(?:block|inline|grid|flex)|(^|[;{]\s*)(font-size|padding|margin|border|transform|text-transform)\s*:/.test(place)) bad.push(id + ':place-geometry');
    if (/(^|[;{]\s*)(width|aspect-ratio|padding|margin|border|transform)\s*:/.test(scene)) bad.push(id + ':scene-geometry');
    if (/(^|[;{]\s*)font-size\s*:/.test(look)) bad.push(id + ':look-font');
    if (/(^|[;{]\s*)(border-left|padding|min-height|font|text-transform)\s*:/.test(choice)) bad.push(id + ':choice-geometry');
  });
  ok(!bad.length, 'S17 内置 skin 保持正式 playable 骨架稳定,含 media query/组合 selector,只改材质/chrome bad=' + bad.join(','));
})();

(function () {   // S18 内置 skin 在 UI Skin Gallery 里也不能压缩切换控件容器或改变双栏栅格。
  function block(src, re) { return (src.match(re) || [''])[0]; }
  var bad = [];
  EXPECTED_UI_SKINS.forEach(function (id) {
    var header = block(uiHtml, new RegExp('html\\[data-ui="' + id + '"\\]\\s+header\\s*\\{[^}]*\\}'));
    var shell = block(uiHtml, new RegExp('html\\[data-ui="' + id + '"\\]\\s+\\.shell\\s*\\{[^}]*\\}'));
    var notes = block(uiHtml, new RegExp('html\\[data-ui="' + id + '"\\]\\s+\\.notes\\s*\\{[^}]*\\}'));
    if (/(^|[;{]\s*)(margin|max-width|width|padding|border|transform)\s*:/.test(header)) bad.push(id + ':header-geometry');
    if (shell) bad.push(id + ':shell-grid');
    if (/(^|[;{]\s*)transform\s*:/.test(notes)) bad.push(id + ':notes-transform');
    if (new RegExp('html\\[data-ui="' + id + '"\\]\\s+(?:header|\\.notes)\\s*,').test(uiHtml)) bad.push(id + ':mobile-geometry');
  });
  ok(!bad.length, 'S18 内置 skin Gallery 只换材质,不挤压 skin 控件容器或改双栏栅格 bad=' + bad.join(','));
})();

console.log('════ showroom 静态回归:' + pass + ' PASS / ' + fail + ' FAIL ════');
process.exit(fail ? 1 : 0);
