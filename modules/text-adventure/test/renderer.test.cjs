/* Amatlas 文字冒险模块 · 渲染器验证 —— 纯 node 驱动 core + 模块,无需 jsdom。
   对照 world-engine 呈现语义:look(首次/重访/函数)、events beat(进入触发+once)、
   links→动作(移动/纯/once/requires 隐藏/showWhenLocked 灰显)、status、跨图。
   并显式验证一处与 world-engine 的【有意差异】:纯动作不 +1 计数 → look 仍按"首次"。 */
const { createEngine } = require('../../../core/runtime/engine-core.js');
const TA = require('../runtime/renderer.js');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

const A_FIRST = '你睁开眼,被冲上一片黑色的沙滩。';
const A_RETURN = '熟悉的黑沙滩。';
const FIND_CASE = '你的手碰到沙里一个硬物——一只旧皮箱。';

function makeWorld() {
  return {
    id: '15151515-1515-4515-8515-151515151515', start: { map: 'beach', node: 'shore' },
    seed: 7,
    maps: {
      beach: { name: '黑沙滩', nodes: {
        shore: {
          kind: 'scene', name: '海岸',
          look: function (S, first) { return first ? A_FIRST : A_RETURN; },
          events: [ { id: 'find_case', once: true, when: function (S) { return !S.flags.foundCase; },
                     run: function (S) { S.flags.foundCase = true; return FIND_CASE; } } ],
          links: [
            { label: '去潮池', to: 'tidepool' },
            { label: '去森林', to: { map: 'forest', node: 'edge' } },
            { label: '开箱(once)', once: true, id: 'open_case',
              requires: function (S) { return S.flags.foundCase; }, lockHint: '没东西可看',
              run: function (S) { S.flags.readNotes = true; } },
            { label: '锁住但灰显', requires: function (S) { return false; }, showWhenLocked: true, lockHint: '还不行' },
            { label: '完全隐藏', requires: function (S) { return false; } }
          ]
        },
        tidepool: { kind: 'scene', name: '礁石潮池',
          look: { first: '退潮后的礁石。', return: '潮池还在。' },
          links: [ { label: '回海岸', to: 'shore' } ] }
      } },
      forest: { name: '紫色森林', nodes: {
        edge: { kind: 'scene', name: '森林边缘', look: '高大的紫色蕨类挡住了光。',
          links: [ { label: '退回海滩', to: { map: 'beach', node: 'shore' } } ] }
      } }
    }
  };
}

function fresh() {
  const e = createEngine(makeWorld(), { storage: null });
  e.registerModule(TA.createTextAdventureModule({ status: function (s) { return s.flags.readNotes ? [{ label: '理解', value: '1' }] : []; } }));
  e.start();
  return e;
}
function actById(v, id) { return v.actions.filter(function (a) { return a.id === id; })[0]; }
function actByLabel(v, label) { return v.actions.filter(function (a) { return a.label === label; })[0]; }

console.log('S3a text-adventure 渲染器验证');

// resolveLook 单元
(function () {
  const r = TA.resolveLook;
  ok('U1 字符串 look 原样', r('x', {}, true) === 'x');
  ok('U2 对象 look 首次取 first', r({ first: 'F', return: 'R' }, {}, true) === 'F');
  ok('U3 对象 look 重访取 return', r({ first: 'F', return: 'R' }, {}, false) === 'R');
  ok('U4 对象 look 无 return 回退 first', r({ first: 'F' }, {}, false) === 'F');
  ok('U5 函数 look 收到 (state,isFirst)', r(function (s, f) { return f ? 'A' : 'B'; }, {}, false) === 'B');
})();

// A. 启动渲染:首次 look + beat 事件 + status + 标题/地图名
(function () {
  const e = fresh();
  const v = e.view();
  ok('A1 View.title=海岸', v.view.title === '海岸');
  ok('A2 View.mapname=黑沙滩', v.view.mapname === '黑沙滩');
  ok('A3 body[0] 是首次 look 散文', v.view.body[0].type === 'prose' && v.view.body[0].text === A_FIRST);
  ok('A4 beat 进入触发:body 含 event=find_case', v.view.body.some(function (b) { return b.type === 'event' && b.text === FIND_CASE; }));
  ok('A5 beat 改了 state(foundCase)', e.state.flags.foundCase === true);
  ok('A6 status 首位=所在/黑沙滩·海岸', eq(v.view.status[0], { label: '所在', value: '黑沙滩 · 海岸' }));
})();

// B. links → 动作:移动 kind、once 可点、requires 隐藏 vs showWhenLocked 灰显
(function () {
  const e = fresh();
  const v = e.view();
  const moves = v.actions.filter(function (a) { return a.kind === 'move'; });
  ok('B1 两个移动动作(去潮池/去森林)', moves.length === 2);
  ok('B2 open_case 满足 requires → 可点(非 locked)', !!actById(v, 'open_case') && !actById(v, 'open_case').locked);
  const locked = actByLabel(v, '锁住但灰显');
  ok('B3 showWhenLocked → 灰显(locked=true + lockHint)', !!locked && locked.locked === true && locked.lockHint === '还不行');
  ok('B4 无 showWhenLocked 的不满足项 → 完全隐藏', !actByLabel(v, '完全隐藏'));
})();

// C. once 消耗 + 【有意差异】纯动作不 +1 计数 → look 仍首次
(function () {
  const e = fresh();
  e.view();                                   // 消费启动那帧的 beat
  e.apply(actById(e.view(), 'open_case'));     // 纯动作:set readNotes,原地
  ok('C1 纯动作改了 state(readNotes)', e.state.flags.readNotes === true);
  ok('C2 once 消耗:open_case 不再出现', !actById(e.view(), 'open_case'));
  ok('C3 纯动作不重复 +1(seen 仍=1)', e.state.seen['beach/shore'] === 1);
  const v = e.view();
  ok('C4【有意差异】纯动作后 look 仍=首次(未离开)', v.view.body[0].text === A_FIRST);
  ok('C5 纯动作后无 beat 复现(body 仅散文)', v.view.body.length === 1);
  ok('C6 status 反映新状态(理解=1)', v.view.status.some(function (b) { return b.label === '理解' && b.value === '1'; }));
})();

// D. 离开再回:seen=2 → 重访 look;once beat 不再触发
(function () {
  const e = fresh();
  e.view();
  e.apply(actByLabel(e.view(), '去潮池'));      // 移到潮池
  const vt = e.view();
  ok('D1 潮池首次 look=first', vt.view.body[0].text === '退潮后的礁石。');
  ok('D2 跨节点移动 entered 潮池(seen=1)', e.state.seen['beach/tidepool'] === 1);
  e.apply(actByLabel(e.view(), '回海岸'));       // 回到海岸(第二次)
  ok('D3 重访海岸 seen=2', e.state.seen['beach/shore'] === 2);
  const v = e.view();
  ok('D4 重访 look=return', v.view.body[0].text === A_RETURN);
  ok('D5 once beat 不再触发(body 仅散文)', v.view.body.length === 1 && v.view.body[0].type === 'prose');
})();

// E. 跨图移动
(function () {
  const e = fresh();
  e.view();
  e.apply(actByLabel(e.view(), '去森林'));
  const v = e.view();
  ok('E1 跨图 pos=forest/edge', eq(e.state.pos, { map: 'forest', node: 'edge' }));
  ok('E2 跨图 mapname=紫色森林 title=森林边缘', v.view.mapname === '紫色森林' && v.view.title === '森林边缘');
  ok('E3 静态字符串 look', v.view.body[0].text === '高大的紫色蕨类挡住了光。');
})();

// F. beat once 入档:_eventsDone 记录,存档往返后不复发
(function () {
  const e = fresh();
  e.view();
  ok('F1 _eventsDone 记录了 find_case', !!e.state._eventsDone && Object.keys(e.state._eventsDone).length === 1);
  const snap = e.serialize();
  e.load(snap);
  const v = e.view();
  ok('F2 读档后(在 shore)beat 不复发', !v.view.body.some(function (b) { return b.type === 'event'; }));
})();

// G. 安全网:节点所有出口都被 requires 锁死 → 灰显出来,不留空场景
(function () {
  const w = { id: '15151515-1515-4515-8515-151515151515', start: { map: 'm', node: 'trap' }, maps: { m: { name: 'M', nodes: {
    trap: { kind: 'scene', name: '陷阱', look: '四面是墙。',
      links: [ { label: '封住的门', requires: function () { return false; }, lockHint: '封住了' } ] }
  } } } };
  const e = createEngine(w, { storage: null });
  e.registerModule(TA.createTextAdventureModule());
  e.start();
  const v = e.view();
  ok('G1 安全网:全锁→把隐藏项灰显', v.actions.length === 1 && v.actions[0].locked === true && v.actions[0].lockHint === '封住了');
})();

// H. 模块原生产出 scene/audio 意图(S11-b-ex:游戏层无需 render 垫片;也顺带验证经 use 注册)
(function () {
  const w = { id: '15151515-1515-4515-8515-151515151515', start: { map: 'm', node: 's' }, maps: { m: { name: 'M', nodes: {
    s: { kind: 'scene', name: '场', look: '看。', scene: { region: 'cave', mood: 'eerie' }, audio: { bgm: 'x' },
         links: [ { label: '去', to: 'p' } ] },
    p: { kind: 'scene', name: '朴', look: '朴素。', links: [ { label: '回', to: 's' } ] }
  } } } };
  const e = createEngine(w, { storage: null });
  e.use(TA.createTextAdventureModule());                 // 经统一入口 use 注册(模块工厂返回带 install 的对象)
  e.start();
  const v = e.view();
  ok('H1 render 原生透传 node.scene', eq(v.view.scene, { region: 'cave', mood: 'eerie' }));
  ok('H2 render 原生透传 node.audio', eq(v.view.audio, { bgm: 'x' }));
  e.apply(actByLabel(e.view(), '去'));
  const v2 = e.view();
  ok('H3 无声明节点不带 scene/audio(优雅退化)', v2.view.scene === undefined && v2.view.audio === undefined);
})();

// I. fail-loud(design-principles §6b):门控(requires/when)写成非函数 → 抛,不再静默旁路
(function () {
  function throws(fn) { try { fn(); return false; } catch (e) { return true; } }
  function eng(node) {
    const w = { id: '15151515-1515-4515-8515-151515151515', start: { map: 'm', node: 'n' }, maps: { m: { name: 'M', nodes: {
      n: node, dst: { kind: 'scene', look: '。', links: [{ label: '回', to: 'n' }] }
    } } } };
    const e = createEngine(w, { storage: null }); e.registerModule(TA.createTextAdventureModule()); e.start(); return e;
  }
  ok('I1 link.requires 写成字符串 → 抛(锁不再静默失效)', throws(function () {
    eng({ kind: 'scene', look: '。', links: [{ label: '门', to: 'dst', requires: 'S.hasKey' }] }).view();
  }));
  ok('I2 event.when 写成定值 false → 抛(事件不再被当恒触发)', throws(function () {
    eng({ kind: 'scene', look: '。', events: [{ when: false, run: function () { return 'b'; } }], links: [{ label: '去', to: 'dst' }] }).view();
  }));
  ok('I3 合法函数门控不抛(回归)', !throws(function () {
    eng({ kind: 'scene', look: '。', links: [{ label: '门', to: 'dst', requires: function () { return true; } }] }).view();
  }));
})();

// J. round9 audit:look/run/status 错形态 fail-loud(似是而非形态→静默空白/丢副作用)
(function () {
  function throws(fn) { try { fn(); return false; } catch (e) { return true; } }
  function eng(node, modOpts) {
    const w = { id: '15151515-1515-4515-8515-151515151515', start: { map: 'm', node: 'n' }, maps: { m: { name: 'M', nodes: {
      n: node, dst: { kind: 'scene', look: '。', links: [{ label: '回', to: 'n' }] }
    } } } };
    const e = createEngine(w, { storage: null }); e.registerModule(TA.createTextAdventureModule(modOpts || {})); e.start(); return e;
  }
  ok('J1 look 写成数组 → 抛(正文不再静默空白)', throws(function () { eng({ kind: 'scene', look: ['一段', '二段'], links: [{ label: '去', to: 'dst' }] }).view(); }));
  ok('J2 look 对象字段名错 {text}(应 first/return)→ 抛', throws(function () { eng({ kind: 'scene', look: { text: 'x' }, links: [{ label: '去', to: 'dst' }] }).view(); }));
  ok('J3 link.run 写成字符串 → 抛(副作用不再静默丢→soft-lock)', throws(function () { eng({ kind: 'scene', look: '。', links: [{ label: '去', to: 'dst', run: 'S.x=1' }] }).view(); }));
  ok('J4 event.run 写成字符串 → 抛', throws(function () { eng({ kind: 'scene', look: '。', events: [{ id: 'e', run: 'S.x=1' }], links: [{ label: '去', to: 'dst' }] }).view(); }));
  ok('J5 status(state) 返回单对象(非数组)→ 抛(状态条不再崩)', throws(function () { eng({ kind: 'scene', look: '。', links: [{ label: '去', to: 'dst' }] }, { status: function () { return { label: 'HP', value: 1 }; } }).view(); }));
  ok('J6 合法 look(串)/run(函数)/status(数组)不抛(回归)', !throws(function () { eng({ kind: 'scene', look: '正文', links: [{ label: '去', to: 'dst', run: function () {} }] }, { status: function () { return [{ value: 'x' }]; } }).view(); }));
})();

// X. link.run 返回 string → 回应 beat(round12 真因修:两局强模型都自然写 return '回应'、与 event.run 对称的直觉,
//    旧引擎丢弃返回值 → 纯动作点击零可见反馈="选项没反应";契约 v10 起返回字符串=本次回应文本)
(function () {
  const w = { id: '15151515-1515-4515-8515-151515151515', start: { map: 'm', node: 'a' }, maps: { m: { name: 'M', nodes: {
    a: { kind: 'scene', name: 'A', look: '甲房。', links: [
      { id: 'ponder', label: '琢磨', run: function (S) { S.n = (S.n || 0) + 1; return '回应' + S.n + '号。'; } },
      { id: 'go', label: '走', to: 'b', run: function (S) { return '你边走边想。'; } }
    ] },
    b: { kind: 'scene', name: 'B', look: '乙房。', events: [ { id: 'arrive', run: function () { return '到站事件。'; } } ],
      links: [ { label: '回', to: 'a' } ] }
  } } } };
  const e = createEngine(w, { storage: null });
  e.registerModule(TA.createTextAdventureModule({}));
  e.start();
  e.view();                                                       // 消费启动帧
  e.apply(actById(e.view(), 'ponder'));
  let v = e.view();
  ok('X1 纯动作 link.run 返回 string → 本帧 event beat 显示(治"选项没反应")', v.view.body.some(function (b) { return b.type === 'event' && b.text === '回应1号。'; }));
  e.apply(actById(e.view(), 'ponder'));
  v = e.view();
  ok('X2 重复点击 → 每次都有回应 beat(回应2号;刷属性另由 graph-audit P1 提醒)', v.view.body.some(function (b) { return b.text === '回应2号。'; }));
  e.apply(actById(e.view(), 'go'));
  v = e.view();
  ok('X3 移动型 link.run 返回与目标节点 event 同帧共存(runBeats 不再清队)', v.view.body.some(function (b) { return b.text === '你边走边想。'; }) && v.view.body.some(function (b) { return b.text === '到站事件。'; }));
  ok('X4 beat 一次性:再渲染不复现(render 消费即清)', !e.view().view.body.some(function (b) { return b.type === 'event'; }));
})();

// Y. v11 对称穷举:link 写 available(exits 的字段)→ 抛;scene 节点带 checks → 抛(旧版均静默失效)
(function () {
  function mkW(node) {
    return { id: '15151515-1515-4515-8515-151515151515', start: { map: 'm', node: 'a' }, maps: { m: { name: 'M', nodes: {
      a: node, b: { kind: 'scene', look: '乙。', links: [{ label: '回', to: 'a' }] } } } } };
  }
  function boot(node) { const e = createEngine(mkW(node), { storage: null }); e.registerModule(TA.createTextAdventureModule({})); e.start(); return e.view(); }
  function throws2(fn) { try { fn(); return false; } catch (e) { return true; } }
  ok('Y1 link 写 available → 抛(旧版被恒真过滤器覆盖=门控静默失效)', throws2(function () { boot({ kind: 'scene', look: '甲。', links: [{ label: '密道', to: 'b', available: function () { return false; } }] }); }));
  ok('Y2 scene 节点写 checks → 抛(旧版检定按钮静默消失)', throws2(function () { boot({ kind: 'scene', look: '甲。', checks: [{ label: '搜查', dc: 7 }], links: [{ label: '走', to: 'b' }] }); }));
  ok('Y3 正确写法(link.requires)不抛', !throws2(function () { boot({ kind: 'scene', look: '甲。', links: [{ label: '门', to: 'b', requires: function () { return true; } }] }); }));
})();

// R. audio.sfx 函数形展开(v22 · showcase Sonnet #5「仅首次/条件音效」;renderer 层求值,present-audio 零改)
(function () {
  const ex = TA.expandAudioSfx;
  function throws(fn) { try { fn(); return false; } catch (e) { return true; } }

  const a1 = { sfx: [function (S, first) { return first ? ['thunder'] : []; }] };
  ok('R1 函数项 isFirst=true → 展开 [thunder]', eq(ex(a1, {}, true).sfx, ['thunder']));
  ok('R2 同函数项 isFirst=false → 展开 []', eq(ex(a1, {}, false).sfx, []));

  const a2 = { sfx: [function (S) { return S.flags && S.flags.alarm ? ['alarm'] : []; }] };
  ok('R3 条件 false → [] / 条件 true → [alarm]', eq(ex(a2, { flags: {} }, true).sfx, []) && eq(ex(a2, { flags: { alarm: true } }, true).sfx, ['alarm']));

  const a3 = { music: 'eerie', sfx: ['click', function (S, first) { return first ? ['thunder'] : []; }, 'pop'] };
  ok('R4 混合数组按序展开 [click,thunder,pop] + 保留其他字段(music)', eq(ex(a3, {}, true).sfx, ['click', 'thunder', 'pop']) && ex(a3, {}, true).music === 'eerie');
  ok('R5 混合 isFirst=false → [click,pop]', eq(ex(a3, {}, false).sfx, ['click', 'pop']));

  const a4 = { sfx: ['click', 'pop'] };
  ok('R6 全字面量 → 引用相等(零拷贝、字节级向后兼容)', ex(a4, {}, true) === a4);
  const a4b = { bgm: 'x' };
  ok('R7 无 sfx 的 audio → 原样返回', ex(a4b, {}, true) === a4b);

  ok('R8 函数返回单字符串(漏 [])→ fail-loud 抛', throws(function () { ex({ sfx: [function () { return 'thunder'; }] }, {}, true); }));

  const a6 = { sfx: [function () { return ['boom']; }] };
  const before = a6.sfx;
  ex(a6, {}, true);
  ok('R9 展开不改原 node.audio(浅克隆;原数组仍是函数项)', a6.sfx === before && typeof a6.sfx[0] === 'function');
})();

// R-int. 经真实 render 路径:节点 audio.sfx 函数项 → view.audio.sfx 已展开(验证 call-site 接线)
(function () {
  const w = { id: '15151515-1515-4515-8515-151515151515', start: { map: 'm', node: 'a' }, maps: { m: { name: 'M', nodes: {
    a: { kind: 'scene', name: 'A', look: '甲。', audio: { sfx: [function (S, first) { return first ? ['thunder'] : []; }] },
         links: [{ label: '去', to: 'b' }] },
    b: { kind: 'scene', name: 'B', look: '乙。', links: [{ label: '回', to: 'a' }] }
  } } } };
  const e = createEngine(w, { storage: null });
  e.registerModule(TA.createTextAdventureModule());
  e.start();
  ok('R10 首次 render → view.audio.sfx=[thunder](接线生效)', eq(e.view().view.audio.sfx, ['thunder']));
  e.apply(actByLabel(e.view(), '去'));
  e.apply(actByLabel(e.view(), '回'));            // 回到 a(seen=2 → 非首次)
  ok('R11 重访 a → view.audio.sfx=[](isFirst=false 经 render 传入)', eq(e.view().view.audio.sfx, []));
})();

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
