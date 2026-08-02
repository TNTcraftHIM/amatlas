/* Amatlas demo 世界机制验证 —— headless 驱动【真实 demo 世界】(world.js)+ 核心 + TA 模块,
   断言 demo 数据本身的机制正确(beat 拾物 / open_case 解锁 deep / nightfall 推进时钟 / once / 可达结局)。 */
const { createEngine } = require('../../../core/runtime/engine-core.js');
const TA = require('../runtime/renderer.js');
const WORLD = require('../../../examples/text-adventure-demo/world.js');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ok  ' + name); } else { fail++; console.log('  FAIL ' + name); } }

function mk() {
  const e = createEngine(WORLD, { storage: null });
  e.registerModule(TA.createTextAdventureModule({
    status: function (s) {
      const b = [{ label: '时刻', value: String((s.clock && s.clock.t) || 0) }];
      if (s.understanding) b.push({ label: '理解', value: String(s.understanding) });
      if (s.inventory && s.inventory.length) b.push({ label: '物品', value: s.inventory.join('、') });
      return b;
    }
  }));
  e.start();
  return e;
}
const byLabel = (v, l) => v.actions.filter(a => a.label === l)[0];
const byId = (v, i) => v.actions.filter(a => a.id === i)[0];

console.log('S3b demo 世界机制验证');

// 正路:拾箱 → 开箱 → 解锁 deep → 夜幕推进时钟
const e = mk();
let v = e.view();
ok('1 起步 beat 拾到皮箱(事件+物品)', v.view.body.some(b => b.type === 'event') && (e.state.inventory || []).join('').includes('皮箱'));

e.apply(byId(e.view(), 'open_case'));
v = e.view();
ok('2 开箱:readNotes + understanding=1 + 可见反馈', e.state.flags.readNotes === true && e.state.understanding === 1 && v.view.body.some(b => b.type === 'event' && /不要跟丢它/.test(b.text)));
ok('3 开箱后 once 消耗(open_case 消失)', !byId(v, 'open_case'));

e.apply(byLabel(e.view(), '走向那片紫色森林'));
v = e.view();
ok('4 edge look 追加"读过笔记"句', v.view.body[0].text.includes('雷纳画过这种光'));
const deep = byLabel(v, '循着光点深入森林');
ok('5 readNotes 满足 → deep 可点(非 locked)', !!deep && !deep.locked);

e.apply(deep);
v = e.view();
ok('6 deep:nightfall beat 出现', v.view.body.some(b => b.type === 'event'));
ok('7 nightfall 推进 clock.t=2', e.state.clock.t === 2);

e.apply(byLabel(e.view(), '往回走'));
e.apply(byLabel(e.view(), '循着光点深入森林'));
v = e.view();
ok('8 deep 重访:nightfall once 不再触发', !v.view.body.some(b => b.type === 'event'));
ok('9 clock 仍为 2(未再推进)', e.state.clock.t === 2);

const ending = byLabel(v, '跟上提灯人');
ok('10 deep → 结局入口存在且可点', !!ending && !ending.locked);
e.apply(ending);
v = e.view();
ok('11 进入结局节点 lantern', e.state.pos.map === 'forest' && e.state.pos.node === 'lantern');
ok('12 结局正文明确收束', v.view.body.some(b => /结局/.test(b.text) && /回家的路/.test(b.text)));
ok('13 结局节点无后续动作(终局)', v.actions.length === 0);

// 反路:未开箱直接去 edge → deep 灰显(showWhenLocked + lockHint)
const e2 = mk();
e2.apply(byLabel(e2.view(), '走向那片紫色森林'));
const d2 = byLabel(e2.view(), '循着光点深入森林');
ok('14 未读笔记 → deep 灰显(locked + lockHint)', !!d2 && d2.locked === true && d2.lockHint === '你总觉得贸然深入并不明智');

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
