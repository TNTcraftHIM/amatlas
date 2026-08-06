'use strict';
/* Horror R·07 正式手写装配与最短玩家旅程。 */
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..'), ENGINE = path.join(ROOT, '..', '..');
var WORLD = require(path.join(ROOT, 'world.js'));
var CORE = require(path.join(ENGINE, 'core', 'runtime', 'engine-core.js'));
var TEXT = require(path.join(ENGINE, 'modules', 'text-adventure', 'runtime', 'renderer.js'));
var pass=0,fail=0;
function ok(c,m,d){if(c)pass++;else{fail++;console.log('  FAIL '+m+(d?' -> '+d:''));}}
function node(id){return WORLD.maps.descent.nodes[id];}
function action(s,re){return(s.actions||[]).filter(function(a){return re.test(a.label||'');})[0];}
function body(s){return(s.view.body||[]).map(function(x){return x.text||'';}).join('\n');}
function captureGame(source){
  var calls=[], captured={}, localStorage={getItem:function(){return null;},setItem:function(){},removeItem:function(){}};
  function plugin(id){return{id:id,install:function(){}};}
  var engine={use:function(p){calls.push('use:'+p.id);return engine;},start:function(){calls.push('start');},reset:function(){calls.push('reset');}};
  var A={
    TextAdventure:{createTextAdventureModule:function(){return plugin('text');}},
    DomPresenter:{createDomPresenter:function(){return plugin('dom');}},
    SvgPresenter:{createSvgPresenter:function(){return plugin('svg');}},
    AudioPresenter:{createAudioPresenter:function(){return plugin('audio');}},
    createEngine:function(world,opts){captured.world=world;captured.opts=opts;calls.push('create');return engine;}
  };
  var context={window:{Amatlas:A,HORROR_WORLD:WORLD,localStorage:localStorage},HORROR_WORLD:WORLD,document:{readyState:'complete',getElementById:function(){return null;},addEventListener:function(){}},confirm:function(){return true;}};
  vm.runInNewContext(source,context,{filename:path.join(ROOT,'game.js')});
  captured.calls=calls;captured.storage=localStorage;return captured;
}
function makeEngine(storage){var e=CORE.createEngine(WORLD,{storage:storage===undefined?null:storage});e.use(TEXT.createTextAdventureModule());e.start();return e;}
console.log('Horror R·07 手写escape-hatch正式旅程');
var index=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'), game=fs.readFileSync(path.join(ROOT,'game.js'),'utf8');
var scripts=Array.from(index.matchAll(/<script\s+src="([^"]+)"/g),function(m){return m[1];});
var expected=['../../core/runtime/engine-core.js','../../modules/text-adventure/runtime/renderer.js','../../presenters/present-dom.js','../../presenters/present-svg.js','../../presenters/progressions.js','../../presenters/compose-music.js','../../presenters/present-audio.js','world.js','game.js'];
ok(scripts.length===9&&scripts.every(function(s,i){return s===expected[i];}),'F0 正式index精确9段手写装配顺序',JSON.stringify(scripts));
var cap=captureGame(game);
ok(cap.world===WORLD&&cap.opts.storage===cap.storage&&cap.calls.join(',')==='create,use:text,use:dom,use:svg,use:audio,start','F1 实际执行game锁WORLD/localStorage与Text→DOM→SVG→Audio→start',cap.calls.join(','));
var ids=['waking','corridor','beyond','consumed'];
ok(Object.keys(WORLD.maps.descent.nodes).length===4&&ids.every(function(id){return !!node(id);})&&node('waking').scene.transition==='fade'&&node('corridor').scene.transition==='fade'&&node('beyond').scene.transition==='slam'&&node('consumed').scene.transition==='cut','F2 正式节点集合精确4个且transition锁fade/fade/slam/cut');
ok(JSON.stringify(node('waking').audio)==='{"bgm":"ambient-unease"}'&&JSON.stringify(node('corridor').audio)==='{"bgm":"ambient-unease"}'&&JSON.stringify(node('beyond').audio)==='{"bgm":null,"sfx":["horror-sting"]}'&&JSON.stringify(node('consumed').audio)==='{"sfx":["flesh-tear"]}','F3 完整audio对象锁继承/显式stop/sting/tear');
(function(){var e=makeEngine(),s=e.view();ok(s.pos.node==='waking'&&/黑暗里睁开眼/.test(body(s)),'J1 fresh waking');e.apply(action(s,/走向走廊/));s=e.view();ok(s.pos.node==='corridor'&&/三道目光/.test(body(s)),'J2 corridor');e.apply(action(s,/推开/));s=e.view();ok(s.pos.node==='beyond'&&/一只眼睛/.test(body(s)),'J3 beyond');e.apply(action(s,/凝视回去/));s=e.view();ok(s.pos.node==='consumed'&&s.actions.length===0&&/这是结局/.test(body(s)),'J4 consumed terminal');var blob=e.serialize(),r=makeEngine();ok(r.load(blob)&&r.view().pos.node==='consumed'&&r.view().actions.length===0,'J5 terminal load');e.reset();ok(e.view().pos.node==='waking'&&/黑暗里睁开眼/.test(body(e.view())),'J6 reset fresh');})();
console.log('反向变异');
(function(){var c=captureGame(game.replace(/engine\.use\(A\.SvgPresenter[\s\S]*?\);\s*\/\/ ②[^\n]*/,''));ok(c.calls.indexOf('use:svg')<0,'M1 断开live SVG use会被顺序牙打红');})();
(function(){var c=captureGame(game.replace('engine.start();','engine.start(); engine.use(A.DomPresenter.createDomPresenter({ document: document }));'));ok(c.calls[c.calls.length-1]!=='start','M2 start非末调用会打红');})();
(function(){var a=node('beyond').audio,b=a.bgm;delete a.bgm;ok(JSON.stringify(a)!=='{"bgm":null,"sfx":["horror-sting"]}','M3 删除高潮显式stop会打红');a.bgm=b;})();
(function(){var old=node('beyond').links[0].to;node('beyond').links[0].to='corridor';var e=makeEngine();e.apply(action(e.view(),/走向走廊/));e.apply(action(e.view(),/推开/));e.apply(action(e.view(),/凝视回去/));ok(e.view().pos.node!=='consumed','M4 断开终局link会打红');node('beyond').links[0].to=old;})();
(function(){node('consumed').links=[{label:'坏出口',to:'waking'}];var e=makeEngine();e.apply(action(e.view(),/走向走廊/));e.apply(action(e.view(),/推开/));e.apply(action(e.view(),/凝视回去/));ok(e.view().actions.length!==0,'M5 terminal新增出口会被无动作牙打红');node('consumed').links=[];})();
console.log('horror-journey: '+pass+' 通过, '+fail+' 失败');process.exit(fail?1:0);
