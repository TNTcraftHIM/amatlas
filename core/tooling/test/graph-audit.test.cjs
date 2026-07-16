/* ════════════════════════════════════════════════════════════════════════
   graph-audit.mjs 验证(纯 node,无需 jsdom;随 test/run.cjs)。
   测的是 CLI 契约 + 退出码语义(S4 验收关卡:退出码语义正确):
     · demo 世界(examples/text-adventure-demo/world.js)→ 退出 0、无 P0;有意结局会报 P2 死胡同。
     · 坏世界夹具 → 退出 1、报死链/孤儿/死胡同。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
var spawnSync = require('child_process').spawnSync;
var path = require('path');
var pathToFileURL = require('url').pathToFileURL;

var TOOL = path.join(__dirname, '..', 'graph-audit.mjs');
var DEMO = path.join(__dirname, '..', '..', '..', 'examples', 'text-adventure-demo', 'world.js');
var BROKEN = path.join(__dirname, 'fixtures', 'broken-world.js');

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name); pass++; }
  else { console.log('  X   ' + name + (detail ? '  → ' + detail : '')); fail++; }
}
function run(file) {
  var r = spawnSync(process.execPath, [TOOL, file], { encoding: 'utf8' });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

console.log('graph-audit 验证');

// auditWorld 直接导入牙在文件末执行；这里先保留 CLI 顺序测试。

// A. demo 世界:有意结局会报 P2 死胡同,但无 P0、退出码仍为 0
var demo = run(DEMO);
ok('A1 demo 退出码 0(无 P0)', demo.status === 0, 'status=' + demo.status);
ok('A2 demo 报告 P0=0(有意结局 P2 不阻断)', /P0=0/.test(demo.out), demo.out.slice(0, 120));
ok('A3 demo 可达 5/5 节点(含有意结局)', /可达:\s*5\/5/.test(demo.out), demo.out.match(/可达[^\n]*/));

// B. 坏世界:死链 → 退出 1
var bad = run(BROKEN);
ok('B1 坏世界退出码 1(有 P0 死链)', bad.status === 1, 'status=' + bad.status);
ok('B2 报死链且点名 ghost', /死链/.test(bad.out) && /ghost/.test(bad.out), bad.out);
ok('B3 报不可达孤儿 island', /不可达/.test(bad.out) && /island/.test(bad.out), bad.out);
ok('B4 报死胡同 island', /死胡同/.test(bad.out), bad.out);
ok('B5 P0 计数 ≥ 1', /P0=[1-9]/.test(bad.out), bad.out.match(/问题:[^\n]*/));

// C. 缺参数 → 退出 2(用法错误,区别于审计失败的 1)
var none = spawnSync(process.execPath, [TOOL], { encoding: 'utf8' });
ok('C1 缺参数退出码 2', none.status === 2, 'status=' + none.status);

// D. 死 flag(逻辑死锁)→ P1、退出码 0(可疑不硬拦);本夹具有保底出口,不应报无保底出口
var dead = run(path.join(__dirname, 'fixtures', 'dead-flag-world.js'));
ok('D1 死 flag 退出码 0(P1 不硬拦)', dead.status === 0, 'status=' + dead.status);
ok('D2 报死 flag 且点名 neverSet', /死 flag/.test(dead.out) && /neverSet/.test(dead.out), dead.out.replace(/\n/g, ' ').slice(0, 160));
ok('D3 已写的 flag(opened)不误报', !/死 flag 'opened'/.test(dead.out), dead.out.replace(/\n/g, ' ').slice(0, 120));
ok('D4 有保底出口 → 不报无保底出口(分档不误伤)', !/无保底出口/.test(dead.out), dead.out.replace(/\n/g, ' ').slice(0, 160));
ok('D5 注释里的 flags.docCommentOnly(文档注释非真代码)不误报死 flag(剥注释,与 audio/elements 对称;Sonnet r2《太乙镜渊》实测)', !/死 flag 'docCommentOnly'/.test(dead.out), dead.out.replace(/\n/g, ' ').slice(0, 160));

// E. 结构断裂:孤儿率 > 1/3 且 ≥3 → 升 P0、退出码 1(区别于个别孤儿的 P1;S11-b showcase 诊断)
var sb = run(path.join(__dirname, 'fixtures', 'structural-break-world.js'));
ok('E1 结构断裂退出码 1(大比例孤儿升 P0)', sb.status === 1, 'status=' + sb.status);
ok('E2 报「结构断裂」P0(含不可达比例)', /结构断裂/.test(sb.out) && /P0=[1-9]/.test(sb.out), sb.out.replace(/\n/g, ' ').slice(0, 200));
ok('E3 个别孤儿不误升 P0(broken-world 仅 1 孤儿,无「结构断裂」)', !/结构断裂/.test(bad.out), bad.out.replace(/\n/g, ' ').slice(0, 160));

// F. 无保底出口 P0/P1 分档(design-principles §6a/§7.1:确定性 soft-lock 默认 P0;显式 lockHint 才降 P1)
var ns = run(path.join(__dirname, 'fixtures', 'no-standby-world.js'));
ok('F1 无保底出口(无 lockHint)→ 退出码 1(升 P0 硬拦)', ns.status === 1, 'status=' + ns.status);
ok('F2 节点 locked(全条件、无 lockHint)报 [确认][P0]', /\[确认\]\[P0\][^\n]*无保底出口[^\n]*'m\/locked'/.test(ns.out), ns.out.replace(/\n/g, ' '));
ok('F3 节点 onceonly(once 单程、无 lockHint)报 P0(once 盲点回归)', /\[确认\]\[P0\][^\n]*无保底出口[^\n]*'m\/onceonly'/.test(ns.out), ns.out.replace(/\n/g, ' '));
ok('F4 节点 intended 标 lockHint → 降 [可疑][P1]', /\[可疑\]\[P1\][^\n]*无保底出口[^\n]*'m\/intended'/.test(ns.out), ns.out.replace(/\n/g, ' '));
ok('F5 保底节点 safe 不报无保底出口', !/无保底出口[^\n]*'m\/safe'/.test(ns.out), ns.out.replace(/\n/g, ' '));

// G. initState 未声明数值字段(NaN 源头)P1(design-principles §6b ⑦)
var un = run(path.join(__dirname, 'fixtures', 'uninit-numeric-world.js'));
ok('G1 未声明数值字段 → 退出码 0(P1 不硬拦)', un.status === 0, 'status=' + un.status);
ok('G2 报未初始化 stamina(S.stamina-= 但 initState 没声明)', /未初始化数值字段 'stamina'/.test(un.out), un.out.replace(/\n/g, ' ').slice(0, 220));
ok('G3 已声明的 gold(initState:{gold:0})不误报', !/未初始化数值字段 'gold'/.test(un.out), un.out.replace(/\n/g, ' ').slice(0, 160));

// H. 死 state 键(裸键 deadFlag 版)P0(design-principles §6b ⑧;round6 升 P0:确定性死锁、单一正解,逃生口=initState 声明)
var dk = run(path.join(__dirname, 'fixtures', 'dead-statekey-world.js'));
ok('H1 死 state 键 → 退出码 1(round6 升 P0 硬拦)', dk.status === 1, 'status=' + dk.status);
ok('H2 报死 state 键 understanding(读 S.understanding 从不写)→ [确认][P0]', /\[确认\]\[P0\][^\n]*死 state 键 'understanding'/.test(dk.out), dk.out.replace(/\n/g, ' ').slice(0, 220));
ok('H3 已写的 score(S.score=10)不误报', !/死 state 键 'score'/.test(dk.out), dk.out.replace(/\n/g, ' ').slice(0, 160));
ok('H4 flags 归 deadFlag、不被裸键检查误抓', !/死 state 键 'flags'/.test(dk.out), dk.out.replace(/\n/g, ' ').slice(0, 120));

// I. 假选择(同 to 无差别)P1(design-principles §6b ⑨)
var fc = run(path.join(__dirname, 'fixtures', 'fake-choice-world.js'));
ok('I1 假选择 → 退出码 0(P1 不硬拦)', fc.status === 0, 'status=' + fc.status);
ok('I2 报 hub 假选择(左门/右门都→room、无 run)', /假选择[^\n]*'m\/hub'[^\n]*'m\/room'/.test(fc.out), fc.out.replace(/\n/g, ' ').slice(0, 240));
ok('I3 带 run 的同 to 选项不算假(只数 2 个无差别)', /假选择[^\n]*2 个/.test(fc.out), fc.out.replace(/\n/g, ' ').slice(0, 200));

// J. 合并扫 game.js(showcase round4 盲区修正):flag 读侧常在 game.js(achievement.when),写侧在 world.js
var gm = run(path.join(__dirname, 'fixtures', 'game-merge', 'world.js'));
ok('J1 game.js achievement 读的 ghostAch(world+game 都不写)被报死 flag(证明合并扫 game.js)', /死 flag 'ghostAch'/.test(gm.out), gm.out.replace(/\n/g, ' ').slice(0, 220));
ok('J2 world 写了的 realFlag 不误报', !/死 flag 'realFlag'/.test(gm.out), gm.out.replace(/\n/g, ' ').slice(0, 160));
// J3/J4 防御性 idiom(haiku showcase 盲区):归一 (S.flags||{}) / (S.flags||(S.flags={})) → flags 后,读/写统一命中
ok('J3 防御写的 savedDef〔(S.flags||(S.flags={})).X=〕不误报(归一后识别为已写)', !/死 flag 'savedDef'/.test(gm.out), gm.out.replace(/\n/g, ' ').slice(0, 200));
ok('J4 防御读但从不写的 ghostDef〔(S.flags||{}).X〕被报死 flag', /死 flag 'ghostDef'/.test(gm.out), gm.out.replace(/\n/g, ' ').slice(0, 200));

// K. 跑团检定格式错(showcase 实测:弱模型自创 check/on_success/modifiers,构建只报"不可达"误导→砍跑团)
var be = run(path.join(__dirname, 'fixtures', 'bad-encounter-world.js'));
ok('K1 trial 用自创 on_success/modifiers → 报"跑团检定格式错"并点名 trial + on_success', /跑团检定格式错[^\n]*trial/.test(be.out) && /on_success/.test(be.out), be.out.replace(/\n/g, ' ').slice(0, 240));
ok('K2 safe 用对格式(checks/exits)→ 不误报', !/跑团检定格式错[^\n]*safe/.test(be.out), be.out.replace(/\n/g, ' ').slice(0, 160));
ok('K3 格式错为 P1、不硬拦(退出码 0)', be.status === 0, 'status=' + be.status);

// L. kind↔模块静态匹配(showcase 实测:弱模型做"文字冒险+跑团"混合、game.js 漏 use tabletop → encounter 无模块认领 → engine.start() 崩、游戏白屏只剩工具栏。把 start 的运行时检查提到静态闸,模型只跑 graph-audit 也能拦、且不被 probe 串行遮挡)
var km = run(path.join(__dirname, 'fixtures', 'kind-mismatch', 'world.js'));
ok('L1 encounter 节点 + game.js 缺 createTabletopModule → 报"没有模块认领"并点名 createTabletopModule', /没有模块认领/.test(km.out) && /createTabletopModule/.test(km.out), km.out.replace(/\n/g, ' ').slice(0, 240));
ok('L2 升 P0、硬拦(退出码 1)', km.status === 1, 'status=' + km.status);
ok('L3 scene 有 createTextAdventureModule → 不误报 scene', !/node\.kind:'scene'/.test(km.out), km.out.replace(/\n/g, ' ').slice(0, 200));
ok('L4 game-merge(scene + game.js 有 TextAdventure)→ 不报 kind P0(退出码 0、零误报)', gm.status === 0, 'status=' + gm.status);
// L5 boot 让位(S12):同一 encounter world,但 game.js 用 Amatlas.boot(按内置 kind encounter 自动拉 Tabletop)→ kind↔模块检查【让位】、不报(对照 L1 手写漏 use 报 P0)。boot 自动拉 + fail-loud + probe eval 三重覆盖。
var kmb = run(path.join(__dirname, 'fixtures', 'kind-mismatch-boot', 'world.js'));
ok('L5 encounter world + game.js 用 Amatlas.boot → kind↔模块让位、不报"没有模块认领"(退出码 0)', kmb.status === 0 && !/没有模块认领/.test(kmb.out), 'status=' + kmb.status + ' ' + kmb.out.replace(/\n/g, ' ').slice(0, 200));
// L6 §11.2 误报修(v11 红队实锤):手写装配 + 自定义模块(nodeKinds)合法认领内置 kind → 实跑 start 成功,
//    旧版却 P0 硬拦。修后:源含 nodeKinds → 降 P1 可疑(运行时 start 预检/probe 仍权威兜底)、退出码 0 不拦。
var kmc = run(path.join(__dirname, 'fixtures', 'kind-mismatch-custom', 'world.js'));
ok('L6 自定义模块认领 encounter → 降 P1 可疑、退出码 0(P0 零误报恢复)', kmc.status === 0 && /\[可疑\]\[P1\].*没有模块认领/.test(kmc.out) && /自定义模块 nodeKinds/.test(kmc.out), 'status=' + kmc.status + ' ' + kmc.out.replace(/\n/g, ' ').slice(0, 240));
ok('L7 无自定义模块(kind-mismatch 原夹具)仍维持 P0 硬拦(回归)', km.status === 1);

// M. 单图过大提示(round11《奥术之始》51 节点塞一图 → 地图必挤;P2 纯可用性提示、不拦,引导拆多 maps)
var bigm = run(path.join(__dirname, 'fixtures', 'big-map-world.js'));
ok('M1 34 节点单图 → P2「单图过大/拆图」提示 + 退出码 0(非闸)', bigm.status === 0 && /单图过大/.test(bigm.out) && /多 maps/.test(bigm.out), 'status=' + bigm.status + ' ' + bigm.out.replace(/\n/g, ' ').slice(0, 200));
ok('M2 小图(demo)无此提示(阈值 32 不误报)', !/单图过大/.test(demo.out));

// N. 可无限刷属性(round12《灰雾》:33 增益 run vs once 仅 5 → 反复点=刷属性+同段回应"没反应";P1 可疑不拦,只查形式门控)
var farm = run(path.join(__dirname, 'fixtures', 'farm-world.js'));
ok('N1 无 once/requires 纯增益链接 → P1「可无限刷属性」点名链接 + 退出码 0', farm.status === 0 && /可无限刷属性/.test(farm.out) && /反复琢磨/.test(farm.out), 'status=' + farm.status + ' ' + farm.out.replace(/\n/g, ' ').slice(0, 200));
ok('N2 once / requires / 含 -= 抵扣的增益链接不报(零误报)', !/深究一次/.test(farm.out) && !/有条件领悟/.test(farm.out) && !/买情报/.test(farm.out));
ok('N3 demo 不误报(其 +1 链接带 requires)', !/可无限刷属性/.test(demo.out));

// O. 字段放错对象(v11 对称穷举;运行时 engine-core/renderer 同步抛,此处静态全节点覆盖)
var mf = run(path.join(__dirname, 'fixtures', 'misplaced-fields-world.js'));
ok('O1 exit 写 requires → P0「出口字段放错对象」+ 退出码非零', mf.status !== 0 && /出口字段放错对象/.test(mf.out) && /上锁的门/.test(mf.out), 'status=' + mf.status);
ok('O2 link 写 available → P0「门控字段放错对象」', /门控字段放错对象/.test(mf.out) && /密道/.test(mf.out));
ok('O3 scene 节点带 checks → P1(自定义模块可合法消费 → 不升 P0)', /\[可疑\]\[P1\] scene 节点 'm\/b' 写了 checks/.test(mf.out));
ok('O4 正确写法不误报(exit.available / link.requires 零命中)', !/正常门/.test(mf.out) && !/正常链接/.test(mf.out));
ok('O5 demo 零误报(回归)', !/字段放错对象/.test(demo.out));

// P. v12 检定后果分支边(success.to/fail.to 计入图——不算会把"只能靠检定到达"的节点误报不可达、死分支漏报)
var cb = run(path.join(__dirname, 'fixtures', 'check-branch-world.js'));
ok('P1 只能经 success.to 到达的 vault 不报不可达', !/不可达[^\n]*vault/.test(cb.out), cb.out.replace(/\n/g, ' ').slice(0, 200));
ok('P2 fail.to 指向不存在节点 → P0 死链(带 ·失败 标签)', cb.status !== 0 && /死链[^\n]*失败[^\n]*phantom/.test(cb.out), cb.out.replace(/\n/g, ' ').slice(0, 240));
ok('P3 纯分叉检定节点(success.to+fail.to 双目的地、无门控)不报无保底出口(等价保底;§11.2 零误报)', !/无保底出口[^\n]*arena/.test(cb.out), cb.out.replace(/\n/g, ' ').slice(0, 240));
ok('P4 只有 success.to、fail 留原地的纯检定节点 → 仍报无保底(普通检定边不算保底,调研定稿)', /无保底出口[^\n]*pit/.test(cb.out), cb.out.replace(/\n/g, ' ').slice(0, 240));

// Q. audio 预设名静态校验(易用性审计批):ambient typo 真机每渲染必抛但探针/烟雾测不到 Web Audio → 静态提前抓;
//    名单从呈现器源码解析(非硬编码,扩预设自动跟上);正确名/对象 spec 不报。
var at = run(path.join(__dirname, 'fixtures', 'audio-typo-world.js'));
ok('Q1 ambient typo(ocean)→ P1 点名 + 列合法名', at.status === 0 && /ambient 预设名 'ocean'/.test(at.out) && /waves/.test(at.out), at.out.replace(/\n/g, ' ').slice(0, 200));
ok('Q2 music typo(clam)→ P1 点名(运行时回退默认曲)', /music 预设名 'clam'/.test(at.out), at.out.replace(/\n/g, ' ').slice(0, 200));
ok('Q3 正确预设名(calm/waves)不误报', !/'calm' 不在/.test(at.out) && !/'waves' 不在/.test(at.out), at.out.replace(/\n/g, ' ').slice(0, 200));
ok('Q4 对象形 music:{preset:typo}(tenze)→ P1 点名 music.preset(C16:对象路径对称补)', /music\.preset 预设名 'tenze'/.test(at.out), at.out.replace(/\n/g, ' ').slice(0, 240));
ok('Q5 带连字符的合法 music 预设名 jazz-noir 不误报(解析正则须认引号键;与 ambSet 对称——showcase Sonnet 实测漏修)', !/'jazz-noir' 不在/.test(at.out), at.out.replace(/\n/g, ' ').slice(0, 200));
ok('Q6 带连字符的合法 ambient 预设名 ambient-unease 不误报(ambSet 引号键回归守卫)', !/'ambient-unease' 不在/.test(at.out), at.out.replace(/\n/g, ' ').slice(0, 200));

// R. 死 seen 键(死读家族第三员;showcase《谐振》成就冒号键):seen['字面'] 非真实 map/node → P1 静默失效;斜杠合法键放行
var ds = run(path.join(__dirname, 'fixtures', 'dead-seen-world.js'));
ok('R1 冒号 seen 键(m:b)→ P1 + 冒号改斜杠提示', /死 seen 键 'm:b'/.test(ds.out) && /m\/b'\?/.test(ds.out), ds.out.replace(/\n/g, ' ').slice(0, 220));
ok('R2 拼错节点名(m/ghost)→ P1(同属恒 undefined 死读)', /死 seen 键 'm\/ghost'/.test(ds.out), ds.out.replace(/\n/g, ' ').slice(0, 160));
ok('R3 合法斜杠键(m/b)放行、不误报', !/死 seen 键 'm\/b'/.test(ds.out), ds.out.replace(/\n/g, ' ').slice(0, 160));
ok('R4 P1 不拦构建(退出码 0,非硬拦)', ds.status === 0, 'status=' + ds.status);

// S. scene.elements 写成非数组(C04;showcase 前瞻审计:写错形态→present-svg 静默不画;运行时已 throw,探针够不到 SVG → 静态 P1 提前抓)
var be2 = run(path.join(__dirname, 'fixtures', 'bad-elements-world.js'));
ok('S1 elements 写成对象 → P1「scene.elements 写成对象」', /scene\.elements 写成对象/.test(be2.out), be2.out.replace(/\n/g, ' ').slice(0, 200));
ok('S2 正确数组 elements:[…] 不误报(只报一次对象形)', (be2.out.match(/scene\.elements 写成/g) || []).length === 1, be2.out.replace(/\n/g, ' ').slice(0, 200));
ok('S3 P1 不硬拦(退出码 0)', be2.status === 0, 'status=' + be2.status);
ok('S4 demo 零误报(回归:demo 全 elements:[ 数组)', !/scene\.elements 写成/.test(demo.out));

// T. v16/v17:暴击/大失败/部分成功叙事分支 crit.to / fumble.to / partial.to 计入图边(闸随契约进化,镜像 v12 success.to/fail.to)
var ce = run(path.join(__dirname, 'fixtures', 'crit-edge-world.js'));
ok('T1 crit/fumble/partial.to 计入图边 → 5/5 可达(漏计则 vault/pit/shrine 误报孤儿)', /可达:\s*5\/5/.test(ce.out), ce.out.match(/可达[^\n]*/));
ok('T2 不误报 vault/pit/shrine 不可达', !/不可达[^\n]*vault/.test(ce.out) && !/不可达[^\n]*pit/.test(ce.out) && !/不可达[^\n]*shrine/.test(ce.out), ce.out.replace(/\n/g, ' ').slice(0, 160));
ok('T3 退出码 0(无死链/结构断裂)', ce.status === 0, 'status=' + ce.status);

// U. 同名两池(混合游戏资源接缝;showcase 实测两次:《深渊》stamina /《落霞》内力,lessons 66/101)
//    场景写顶层 S.resources.内力 vs 检定扣角色卡 sheet.resources.内力 → 同名两池、永不同步 → P1
var snp = run(path.join(__dirname, 'fixtures', 'same-name-pool', 'world.js'));
ok('U1 报「同名两池 \'内力\'」(场景写 S.resources.内力、检定吃 sheet.resources.内力)', /同名两池 '内力'/.test(snp.out), snp.out.replace(/\n/g, ' ').match(/同名两池[^\n]{0,40}/));
ok('U2 不误报 体力(场景用正确的 S.sheet.resources.体力 写 → lookbehind 排掉)', !/同名两池 '体力'/.test(snp.out), snp.out.replace(/\n/g, ' ').slice(0, 120));

// V. event.when 对象级同源闸:真实 node.events[] 坏形状 P0;模块私有同名字段放行。
var ewsPath = path.join(__dirname, 'fixtures', 'event-when-string-world.js');
var ews = run(ewsPath);
ok('V1 报「event.when 写成字符串 \'enter\'」并 P0 硬拦(退出码非零)', /event\.when 写成字符串 'enter'/.test(ews.out) && ews.status !== 0, 'status=' + ews.status + ' ' + (ews.out.match(/event\.when[^\n]{0,80}/) || ''));
ok('V2 不误报函数形 when(节点 b 的 when:(S)=>bool)——只报一条字符串 when', (ews.out.match(/event\.when 写成字符串/g) || []).length === 1, '命中条数=' + (ews.out.match(/event\.when 写成字符串/g) || []).length);
var ewp = run(path.join(__dirname, 'fixtures', 'event-when-private-world.js'));
ok('V3 私有 meta.when/policy.when 字符串不是 node.events[] → CLI 放行', ewp.status === 0 && !/event\.when/.test(ewp.out), 'status=' + ewp.status + ' ' + ewp.out.replace(/\n/g, ' ').slice(0, 220));

// W. SCC 软锁口袋(round12《烈焰与咸风》fog_entry⇄reef_nav;逐节点「无保底出口」P0 的盲区)
//    2 节点互相用无条件出口连成封闭回路、只能靠 grind-trap 检定(cost>0、fail 回口袋内)离开 → P1 软锁口袋;
//    fail-forward(success/fail 都离开)与免费检定不报(守零误报)。
var slp = run(path.join(__dirname, 'fixtures', 'softlock-pocket-world.js'));
ok('W1 grind-trap 口袋 {trap_a,trap_b} → 报软锁口袋(点名两节点 + 检定耗资源)', /软锁口袋[^\n]*trap_a[^\n]*trap_b[^\n]*体力/.test(slp.out), slp.out.replace(/\n/g, ' ').match(/软锁口袋[^\n]{0,80}/));
ok('W2 fail-forward 口袋 {ff_a,ff_b} 不报(success/fail 都离开 → 负担得起一次就脱身)', !/软锁口袋[^\n]*ff_a/.test(slp.out) && !/软锁口袋[^\n]*ff_b/.test(slp.out), slp.out.replace(/\n/g, ' ').slice(0, 200));
ok('W3 grind-trap 节点逐节点「无保底出口」放行(各自都有无条件出口)→ 证明是 SCC 闸抓到的', !/无保底出口[^\n]*trap_/.test(slp.out), slp.out.replace(/\n/g, ' ').slice(0, 200));
ok('W4 软锁口袋 P1 不硬拦(退出码 0)', slp.status === 0, 'status=' + slp.status);
ok('W5 demo 零误报(回归:无软锁口袋报告)', !/软锁口袋/.test(demo.out));

// X. encounter 漏 scene(showcase《零号台站》issue①:encounter 进入没画面、点检定才突兀冒灰底)
//    有 checks 但没 node.scene → tabletop.render view.scene 空(进入无画面),骰子强造空场景才 pop → P1 提醒补 scene。
var enc = run(path.join(__dirname, 'fixtures', 'encounter-no-scene-world.js'));
ok('X1 noScene(encounter+checks 无 scene)→ P1「有 checks 但没写 scene」点名', /encounter 节点 'm\/noScene' 有 checks[^\n]*但没写 scene/.test(enc.out), enc.out.replace(/\n/g, ' ').match(/encounter 节点[^\n]{0,40}/));
ok('X2 withScene(有 scene)不误报', !/'m\/withScene'[^\n]*没写 scene/.test(enc.out), enc.out.replace(/\n/g, ' ').slice(0, 160));
ok('X3 emptyChecks(checks:[] 空、无 scene)不误报(length 守卫:没检定就不 pop)', !/'m\/emptyChecks'[^\n]*没写 scene/.test(enc.out), enc.out.replace(/\n/g, ' ').slice(0, 160));
ok('X4 P1 不硬拦(退出码 0)', enc.status === 0, 'status=' + enc.status);

// Y. maze3d「无保底出口」豁免(showcase《零号台站》issue④:被抓后撤回门控成 !caught → 三 link 全 requires)
//    maze3d 进度在 canvas 内(winKey/scareKey),links 是事后路由 → 全条件也非 soft-lock(玩家始终能玩迷宫)。同 kind:'maze' 豁免。
var m3 = run(path.join(__dirname, 'fixtures', 'maze3d-standby-world.js'));
ok('Y1 maze3d 节点(三 link 全 requires、无 lockHint)豁免 → 不报无保底出口', !/无保底出口[^\n]*'m\/maze'/.test(m3.out), m3.out.replace(/\n/g, ' ').slice(0, 200));
ok('Y2 豁免后退出码 0(移除豁免则三 link 全 requires 无 lockHint → P0 退出码 1)', m3.status === 0, 'status=' + m3.status);
ok('Y3 maze3d 漏 scene 不误报(maze 节点不是 encounter,① 检查不触)', !/'m\/maze'[^\n]*没写 scene/.test(m3.out), m3.out.replace(/\n/g, ' ').slice(0, 160));

// Z. maze3d 网格可达性 BFS(本批新增,maze-key-design §5 预留):发光门围死=[确认][P0]、钥匙围死=[可疑][P1]
var mzD = run(path.join(__dirname, 'fixtures', 'maze-door-walled-world.js'));
ok('Z1 门被墙围死 → [确认][P0] 迷宫不可通关、点名 maze', /'m\/maze'[^\n]*迷宫不可通关/.test(mzD.out), mzD.out.replace(/\n/g, ' ').match(/'m\/maze'[^\n]{0,80}迷宫不可通关/));
ok('Z2 门围死退出码 1(P0 硬拦)', mzD.status === 1, 'status=' + mzD.status);
var mzK = run(path.join(__dirname, 'fixtures', 'maze-key-boxed-world.js'));
ok('Z3 钥匙被墙围死 → [可疑][P1] 钥匙拿不到、点名 maze', /'m\/maze'[^\n]*钥匙拿不到/.test(mzK.out), mzK.out.replace(/\n/g, ' ').match(/'m\/maze'[^\n]{0,80}钥匙拿不到/));
ok('Z4 钥匙围死但门可达 → 不报 P0 迷宫不可通关(只 P1)', !/迷宫不可通关/.test(mzK.out), mzK.out.replace(/\n/g, ' ').slice(0, 160));
ok('Z5 钥匙围死退出码 0(P1 不硬拦)', mzK.status === 0, 'status=' + mzK.status);
ok('Z6 standby 夹具(门可达)零误报「迷宫不可通关」(回归)', !/迷宫不可通关/.test(m3.out), m3.out.replace(/\n/g, ' ').slice(0, 160));
// Z7-Z9 运行时机关认知(R1 解谜:门故意静态围死、可达机关 set/warp 打通=合法设计;只认【可达】机关的不动点 → 不漏真软锁)
var mzSet = run(path.join(__dirname, 'fixtures', 'maze-set-unlock-world.js'));
ok('Z7 门静态围死、但可达压力板的 set 打通门旁 → 不报 P0(认 events.set 不动点;变异=去 set 认知则门围死误报)', !/迷宫不可通关/.test(mzSet.out) && mzSet.status === 0, 'status=' + mzSet.status + ' ' + mzSet.out.replace(/\n/g, ' ').slice(0, 140));
var mzSetU = run(path.join(__dirname, 'fixtures', 'maze-set-unreachable-world.js'));
ok('Z8 门围死 + 有 set 但压力板本身也围死(踩不到)→ 仍报 P0(不被"写了 set 就算"蒙蔽、不漏真软锁)', /'m\/maze'[^\n]*迷宫不可通关/.test(mzSetU.out) && mzSetU.status === 1, 'status=' + mzSetU.status + ' ' + mzSetU.out.replace(/\n/g, ' ').slice(0, 120));
var mzWarp = run(path.join(__dirname, 'fixtures', 'maze-warp-world.js'));
ok('Z9 门旁在孤立区、但可达机关 warp 把玩家传送过去 → 不报 P0(认 events.warp 为新 BFS 起点)', !/迷宫不可通关/.test(mzWarp.out) && mzWarp.status === 0, 'status=' + mzWarp.status + ' ' + mzWarp.out.replace(/\n/g, ' ').slice(0, 120));
// Z12-Z13 迷宫批1 M5(events.set 放出钥匙 'K'):门静态围死、但可达压力板的 set 用 ch:'K' 打通门旁 → 不报 P0。
//   graph-audit 的 set 不动点(:244)早已把 s.ch === 'K' 与 s.ch === '.' 同等建模为解锁来源;本正向断言防未来回退成只认 '.'。
var mzSetKey = run(path.join(__dirname, 'fixtures', 'maze-set-key-unlock-world.js'));
ok("Z12 门静态围死、但可达压力板的 set 用 ch:'K' 放出钥匙打通门旁 → 不报 P0(正向断言:set 不动点认 'K' 同 '.'）", !/迷宫不可通关/.test(mzSetKey.out) && mzSetKey.status === 0, 'status=' + mzSetKey.status + ' ' + mzSetKey.out.replace(/\n/g, ' ').slice(0, 140));
ok('Z13 退出码 0(与 Z7 的 set ch:"." 用例对称;两种 ch 都应被 set 不动点认作解锁)', mzSetKey.status === 0, 'status=' + mzSetKey.status);
var mzSetDoor = run(path.join(__dirname, 'fixtures', 'maze-set-door-world.js'));
ok("Z13a 无初始 D、但可达压力板 set ch:'D' 生成出口门 → 不报 P0(动态出口是合法作者范式)", !/迷宫不可通关/.test(mzSetDoor.out) && mzSetDoor.status === 0, 'status=' + mzSetDoor.status + ' ' + mzSetDoor.out.replace(/\n/g, ' ').slice(0, 160));
var mzSetDoorU = run(path.join(__dirname, 'fixtures', 'maze-set-door-unreachable-world.js'));
ok("Z13b 只有 set ch:'D' 但压力板本身不可达 → 仍报 P0(不被动态门字段蒙混)", /没有保留下出口门 'D'/.test(mzSetDoorU.out) && mzSetDoorU.status === 1, 'status=' + mzSetDoorU.status + ' ' + mzSetDoorU.out.replace(/\n/g, ' ').slice(0, 220));
// Z14-Z24 maze3d 内容审计闸 R1-a3:坏 grid/start/events/warp/wall-pickup/monster 提前到 graph-audit。
var mzBadGrid = run(path.join(__dirname, 'fixtures', 'maze-bad-grid-world.js'));
ok('Z14 非矩形 grid → P0 点名「必须是矩形」', mzBadGrid.status === 1 && /maze\.grid 必须是矩形/.test(mzBadGrid.out), 'status=' + mzBadGrid.status + ' ' + mzBadGrid.out.replace(/\n/g, ' ').slice(0, 220));
ok('Z15 非法 grid 字符 → P0 点名「非法」', /字符 "X" 非法/.test(mzBadGrid.out), mzBadGrid.out.replace(/\n/g, ' ').slice(0, 220));
var mzBadStart = run(path.join(__dirname, 'fixtures', 'maze-bad-start-world.js'));
ok('Z16 start 在墙上 → P0、dir 非法 → P1 同时报告', mzBadStart.status === 1 && /maze\.start \(0,0\) 落在墙#/.test(mzBadStart.out) && /maze\.start\.dir/.test(mzBadStart.out), 'status=' + mzBadStart.status + ' ' + mzBadStart.out.replace(/\n/g, ' ').slice(0, 260));
var mzNoDoor = run(path.join(__dirname, 'fixtures', 'maze-no-door-world.js'));
ok('Z17 写了 winKey 但无 D → P0 无法触发通关', mzNoDoor.status === 1 && /winKey='won'[\s\S]*没有任何出口门 'D'/.test(mzNoDoor.out), 'status=' + mzNoDoor.status + ' ' + mzNoDoor.out.replace(/\n/g, ' ').slice(0, 220));
var mzBadEvent = run(path.join(__dirname, 'fixtures', 'maze-bad-event-world.js'));
ok('Z18 events.set 越界 → P0 点名 set[0] 坐标', mzBadEvent.status === 1 && /events\[0\]\.set\[0\][^\n]*超出 grid 范围/.test(mzBadEvent.out), 'status=' + mzBadEvent.status + ' ' + mzBadEvent.out.replace(/\n/g, ' ').slice(0, 240));
ok('Z19 events.set 非法 ch → P0 点名 set[1].ch', /events\[0\]\.set\[1\]\.ch 只支持/.test(mzBadEvent.out), mzBadEvent.out.replace(/\n/g, ' ').slice(0, 240));
ok('Z19-when maze.events[].when 属 maze 私有 runtime,不被 node.events[] beat 闸误认；仍由 maze 专项闸报错', /maze3d 数据错误:节点 'm\/maze' events\[0\]\.when 必须是函数/.test(mzBadEvent.out) && !/event\.when 写成字符串/.test(mzBadEvent.out), mzBadEvent.out.replace(/\n/g, ' ').slice(0, 340));
var mzBadTrigger = run(path.join(__dirname, 'fixtures', 'maze-bad-trigger-world.js'));
ok("Z19a trigger 坏词 → P0 点名 trigger 只支持 'interact'", mzBadTrigger.status === 1 && /events\[0\]\.trigger 只支持 'interact'/.test(mzBadTrigger.out), 'status=' + mzBadTrigger.status + ' ' + mzBadTrigger.out.replace(/\n/g, ' ').slice(0, 260));
ok('Z19b examine 非字符串 + 空 interact → P0 同时报告', /events\[1\]\.examine 必须是字符串/.test(mzBadTrigger.out) && /events\[2\] 须至少有/.test(mzBadTrigger.out), mzBadTrigger.out.replace(/\n/g, ' ').slice(0, 320));
var mzBadPages = run(path.join(__dirname, 'fixtures', 'maze-bad-pages-world.js'));
ok('Z19c pages 禁止视觉字段 / 坏 trigger / 空 page / 坏 set / 顶层混写 → P0', mzBadPages.status === 1 && /pages\[0\]\.visual 不允许/.test(mzBadPages.out) && /events\[1\]\.pages\[0\]\.trigger 只支持 'interact'/.test(mzBadPages.out) && /events\[2\]\.pages\[0\] 须至少有/.test(mzBadPages.out) && /events\[3\]\.pages\[0\]\.set\[0\]\.ch 只支持/.test(mzBadPages.out) && /pages 存在时,hint 必须写进 page/.test(mzBadPages.out), 'status=' + mzBadPages.status + ' ' + mzBadPages.out.replace(/\n/g, ' ').slice(0, 900));
ok('Z19d pages 全 when 无默认页 → P1 提醒失败反馈默认页', /events\[4\]\.pages 每个 page 都写了 when/.test(mzBadPages.out) && /P1=1/.test(mzBadPages.out), mzBadPages.out.replace(/\n/g, ' ').slice(0, 700));
var mzBadPuzzle = run(path.join(__dirname, 'fixtures', 'maze-bad-puzzle-world.js'));
ok("Z19e puzzle kind/固定字段/code 形状坏 → P0", mzBadPuzzle.status === 1 && /events\[0\]\.puzzle\.kind 必须是 'code'\/'sequence'\/'toggle'/.test(mzBadPuzzle.out) && /events\[1\]\.puzzle\.answer 必须是 1–8 位数字/.test(mzBadPuzzle.out) && /events\[2\]\.puzzle\.maxLength/.test(mzBadPuzzle.out) && /events\[5\]\.puzzle\.script 不是 code 模板字段/.test(mzBadPuzzle.out), 'status=' + mzBadPuzzle.status + ' ' + mzBadPuzzle.out.replace(/\n/g, ' ').slice(0, 1100));
ok('Z19f sequence/toggle 答案形状坏 → P0', /events\[3\]\.puzzle\.answer 必须是 1–8 项无空槽数组,且每项来自 choices/.test(mzBadPuzzle.out) && /events\[4\]\.puzzle\.answer 必须是与 labels 等长、无空槽/.test(mzBadPuzzle.out), mzBadPuzzle.out.replace(/\n/g, ' ').slice(0, 1100));
ok('Z19g 缺 success / 空 fail.hint / outcome 禁止字段与 fail 动作 → P0', /events\[6\]\.success 必须是对象/.test(mzBadPuzzle.out) && /events\[7\]\.fail\.hint 必须是非空字符串/.test(mzBadPuzzle.out) && /events\[8\]\.success\.once 不允许/.test(mzBadPuzzle.out) && /events\[8\]\.fail\.set 不允许/.test(mzBadPuzzle.out), mzBadPuzzle.out.replace(/\n/g, ' ').slice(0, 1800));
ok('Z19h puzzle 同层动作 / 漂浮 success / pages 顶层混写 → P0', /events\[9\] 写了 puzzle 时,同层不能再写 hint/.test(mzBadPuzzle.out) && /events\[10\] 写了 success\/fail 却没有 puzzle/.test(mzBadPuzzle.out) && /events\[11\]\.pages 存在时,puzzle 必须写进 page/.test(mzBadPuzzle.out), mzBadPuzzle.out.replace(/\n/g, ' ').slice(0, 1900));
ok('Z19i page puzzle 复用 sequence/success/fail 闸 → P0', /pages\[0\]\.puzzle\.answer 必须是 1–8 项无空槽数组,且每项来自 choices/.test(mzBadPuzzle.out) && /pages\[0\]\.success 须至少有/.test(mzBadPuzzle.out) && /pages\[0\]\.fail\.hint 必须是非空字符串/.test(mzBadPuzzle.out), mzBadPuzzle.out.replace(/\n/g, ' ').slice(0, 2600));
ok("Z19ia visual:'none' 自动 puzzle 无 examine → P1 像素猎杀提醒", /events\[13\] 是无可见外观的 puzzle,却没有 examine/.test(mzBadPuzzle.out) && /P1=1/.test(mzBadPuzzle.out), mzBadPuzzle.out.replace(/\n/g, ' ').slice(0, 2900));
var mzPuzzle = run(path.join(__dirname, 'fixtures', 'maze-puzzle-world.js'));
ok('Z19j 合法顶层三模板 + page puzzle → P0=0/P1=0', mzPuzzle.status === 0 && /P0=0 P1=0/.test(mzPuzzle.out), 'status=' + mzPuzzle.status + ' ' + mzPuzzle.out.replace(/\n/g, ' ').slice(0, 240));
ok('Z19k 门静态围死、但可达 puzzle.success.set 打通门旁 → 不误报不可通关', !/迷宫不可通关/.test(mzPuzzle.out) && mzPuzzle.status === 0, 'status=' + mzPuzzle.status + ' ' + mzPuzzle.out.replace(/\n/g, ' ').slice(0, 240));
var mzPuzzleEdge = run(path.join(__dirname, 'fixtures', 'maze-puzzle-edge-world.js'));
ok('Z19l 稀疏 sequence/toggle 答案不能绕过 every → P0', mzPuzzleEdge.status === 1 && /events\[0\]\.puzzle\.answer 必须是 1–8 项无空槽数组/.test(mzPuzzleEdge.out) && /events\[1\]\.puzzle\.answer 必须是与 labels 等长、无空槽/.test(mzPuzzleEdge.out), 'status=' + mzPuzzleEdge.status + ' ' + mzPuzzleEdge.out.replace(/\n/g, ' ').slice(0, 1000));
ok('Z19m 空 set / 空怪物索引数组不算 success 可见结果 → P0', /events\[2\]\.success 须至少有非空/.test(mzPuzzleEdge.out) && /events\[3\]\.success 须至少有非空/.test(mzPuzzleEdge.out), mzPuzzleEdge.out.replace(/\n/g, ' ').slice(0, 1300));
ok('Z19n success 先 set 墙再 warp 到同格 → 按真实结算顺序 P0', /events\[4\]\.success\.warp 目标 \(6,1\) 在同次 set 结算后是墙#/.test(mzPuzzleEdge.out), mzPuzzleEdge.out.replace(/\n/g, ' ').slice(0, 1700));
ok('Z19na success 先把原墙 set 成地板再 warp → 不误报该目标', !/events\[7\]\.success\.warp 目标/.test(mzPuzzleEdge.out), mzPuzzleEdge.out.replace(/\n/g, ' ').slice(0, 1900));
ok('Z19o 缺省 visual 与 interact none puzzle 无 examine 都给 P1', /events\[5\] 是无可见外观的 puzzle,却没有 examine/.test(mzPuzzleEdge.out) && /events\[6\] 是无可见外观的 puzzle,却没有 examine/.test(mzPuzzleEdge.out) && /P1=2/.test(mzPuzzleEdge.out), mzPuzzleEdge.out.replace(/\n/g, ' ').slice(0, 2400));
var mzPuzzleFinalSet = run(path.join(__dirname, 'fixtures', 'maze-puzzle-final-set-world.js'));
ok('Z19p 同格 set 先开后关只认最终墙 → 仍报迷宫不可通关', mzPuzzleFinalSet.status === 1 && /迷宫不可通关/.test(mzPuzzleFinalSet.out), 'status=' + mzPuzzleFinalSet.status + ' ' + mzPuzzleFinalSet.out.replace(/\n/g, ' ').slice(0, 400));
var mzPuzzleRemoveDoor = run(path.join(__dirname, 'fixtures', 'maze-puzzle-remove-door-world.js'));
ok('Z19q 同次 success.set 打通门旁却删除原始 D → 按最终网格仍报不可通关', mzPuzzleRemoveDoor.status === 1 && /迷宫不可通关/.test(mzPuzzleRemoveDoor.out), 'status=' + mzPuzzleRemoveDoor.status + ' ' + mzPuzzleRemoveDoor.out.replace(/\n/g, ' ').slice(0, 500));
var mzEventPosition = run(path.join(__dirname, 'fixtures', 'maze-event-position-world.js'));
ok('Z19r set 后玩家留在事件格、后路封死但面前生成 D → 不误报不可通关', mzEventPosition.status === 0 && !/迷宫不可通关/.test(mzEventPosition.out), 'status=' + mzEventPosition.status + ' ' + mzEventPosition.out.replace(/\n/g, ' ').slice(0, 500));
var mzWarpLeavesDoor = run(path.join(__dirname, 'fixtures', 'maze-warp-leaves-door-world.js'));
ok('Z19s set 生成 D 后 warp 到隔离格 → 旧出生区域失效、仍报不可通关', mzWarpLeavesDoor.status === 1 && /迷宫不可通关/.test(mzWarpLeavesDoor.out), 'status=' + mzWarpLeavesDoor.status + ' ' + mzWarpLeavesDoor.out.replace(/\n/g, ' ').slice(0, 500));
var mzBadWarp = run(path.join(__dirname, 'fixtures', 'maze-bad-warp-world.js'));
ok('Z20 warp 到墙 + dir 非法 → P0', mzBadWarp.status === 1 && /warp 目标 \(0,0\)[^\n]*墙#/.test(mzBadWarp.out) && /warp\.dir 必须是/.test(mzBadWarp.out), 'status=' + mzBadWarp.status + ' ' + mzBadWarp.out.replace(/\n/g, ' ').slice(0, 260));
var mzBadWallPickup = run(path.join(__dirname, 'fixtures', 'maze-bad-wall-pickup-world.js'));
ok("Z21 wall-pickup face 未指向墙 → P0", mzBadWallPickup.status === 1 && /visual:'wall-pickup'[\s\S]*face=E 必须指向相邻墙格#/.test(mzBadWallPickup.out), 'status=' + mzBadWallPickup.status + ' ' + mzBadWallPickup.out.replace(/\n/g, ' ').slice(0, 260));
var mzBadMonster = run(path.join(__dirname, 'fixtures', 'maze-bad-monster-world.js'));
ok('Z22 monster 越界 → P0', mzBadMonster.status === 1 && /monsters\[0\][^\n]*超出 grid 范围/.test(mzBadMonster.out), 'status=' + mzBadMonster.status + ' ' + mzBadMonster.out.replace(/\n/g, ' ').slice(0, 220));
var mzMonsterWall = run(path.join(__dirname, 'fixtures', 'maze-monster-in-wall-world.js'));
ok('Z23 monster 在墙里 → P1 不硬拦', mzMonsterWall.status === 0 && /monsters\[0\][^\n]*在墙#/.test(mzMonsterWall.out) && /P1=1/.test(mzMonsterWall.out), 'status=' + mzMonsterWall.status + ' ' + mzMonsterWall.out.replace(/\n/g, ' ').slice(0, 240));
var mzReal = run(path.join(__dirname, '..', '..', '..', 'examples', 'maze3d', 'world.js'));
ok('Z24 真实 maze3d recipes → P0=0/P1=0(新静态闸零误报)', mzReal.status === 0 && /P0=0 P1=0/.test(mzReal.out), 'status=' + mzReal.status + ' ' + mzReal.out.replace(/\n/g, ' ').slice(0, 200));

// CS. cutscene 孤岛节点(C2;cutscene-design.md §7 推演的实证锁定,两端各锁)
var csw = run(path.join(__dirname, 'fixtures', 'cutscene-world.js'));
ok('CS1 健康 cutscene 世界(无条件 links 是结构出口)→ P0=0、退出码 0', csw.status === 0 && /P0=0/.test(csw.out), 'status=' + csw.status + ' ' + csw.out.replace(/\n/g, ' ').slice(0, 200));
ok('CS2 links 是一等出边 → outro(仅经 cutscene links 可达)不报不可达', !/不可达/.test(csw.out), csw.out.replace(/\n/g, ' ').slice(0, 160));
ok('CS3 outro 无出口结局 → 报 P2 死胡同(有意结局语义、不拦)', /死胡同[^\n]*outro/.test(csw.out), csw.out.replace(/\n/g, ' ').slice(0, 200));
var csl = run(path.join(__dirname, 'fixtures', 'cutscene-locked-world.js'));
ok('CS4 cutscene 全条件出口无 lockHint → 无保底出口 P0 硬拦(退出码 1;cutscene 不享也不需 maze 豁免)', csl.status === 1 && /无保底出口[^\n]*intro/.test(csl.out), 'status=' + csl.status + ' ' + csl.out.replace(/\n/g, ' ').slice(0, 240));
var kmcs = run(path.join(__dirname, 'fixtures', 'kind-mismatch-cutscene', 'world.js'));
ok('CS5 手写装配漏 createCutsceneModule → kind↔模块 P0 点名(BUILTIN 表 cutscene 行生效)', kmcs.status === 1 && /没有模块认领/.test(kmcs.out) && /createCutsceneModule/.test(kmcs.out), 'status=' + kmcs.status + ' ' + kmcs.out.replace(/\n/g, ' ').slice(0, 240));
ok('CS6 同夹具 scene 有 createTextAdventureModule → 不误报 scene(零误报端)', !/node\.kind:'scene'/.test(kmcs.out), kmcs.out.replace(/\n/g, ' ').slice(0, 160));

// OBJ. 直接调用 auditWorld，证明 event.when P0 属对象级公共裁决，不是 CLI 拼源码特供。
import(pathToFileURL(TOOL).href).then(function (mod) {
  var badWorld = require(ewsPath);
  var direct = mod.auditWorld(badWorld);
  ok('OBJ1 auditWorld 直接返回 event.when P0(build 可复用)', direct.issues.some(function (issue) {
    return /\[确认\]\[P0\].*event\.when 写成字符串 'enter'/.test(issue);
  }), direct.issues.join(' | '));
  var privateWorld = require(path.join(__dirname, 'fixtures', 'event-when-private-world.js'));
  var privateDirect = mod.auditWorld(privateWorld);
  ok('OBJ2 auditWorld 不误报模块私有 meta.when/policy.when', !privateDirect.issues.some(function (issue) {
    return /event\.when/.test(issue);
  }), privateDirect.issues.join(' | '));
  var falseWhen = mod.auditWorld({
    id: '12121212-1212-4212-8212-121212121212',
    start: { map: 'm', node: 'a' },
    maps: { m: { nodes: { a: { kind: 'scene', events: [{ when: false }], links: [{ label: '回', to: 'a' }] } } } }
  });
  ok('OBJ3 event.when 非字符串定值同样按对象形状 P0 拒绝', falseWhen.issues.some(function (issue) {
    return /\[确认\]\[P0\].*event\.when 形状错误.*得到 boolean/.test(issue);
  }), falseWhen.issues.join(' | '));
  var missingId = mod.auditWorld({
    start: { map: 'm', node: 'a' },
    maps: { m: { nodes: { a: { kind: 'scene' } } } }
  });
  ok('OBJ4 缺 world.id → 对象级 P0(build 同源继承)', missingId.issues.some(function (issue) {
    return /\[确认\]\[P0\].*world\.id 必须是 UUID v4/.test(issue);
  }), missingId.issues.join(' | '));
  var badId = mod.auditWorld({
    id: 'same-template-game',
    start: { map: 'm', node: 'a' },
    maps: { m: { nodes: { a: { kind: 'scene' } } } }
  });
  ok('OBJ5 非 UUID world.id → P0,短 slug 不冒充全局身份', badId.issues.some(function (issue) {
    return /\[确认\]\[P0\].*world\.id 必须是 UUID v4/.test(issue);
  }), badId.issues.join(' | '));
  var validId = mod.auditWorld({
    id: 'ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF',
    start: { map: 'm', node: 'a' },
    maps: { m: { nodes: { a: { kind: 'scene' } } } }
  });
  ok('OBJ6 合法大写 UUID v4 放行 world.id 身份闸', !validId.issues.some(function (issue) {
    return /world\.id 必须是 UUID v4/.test(issue);
  }), validId.issues.join(' | '));

  console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
  process.exit(fail > 0 ? 1 : 0);
}).catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
