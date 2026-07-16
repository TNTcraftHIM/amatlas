#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   graph-audit.mjs — 类型无关的「世界图」结构审计(Amatlas 新格式)
   ════════════════════════════════════════════════════════════════════════
   审计对象 = 数据驱动世界模型(world.js:maps/nodes/kind/exits/links.to),
   **不是**散文、**不是**叙事一致性
   (叙事一致性 = narrative-reviewer 子代理 + canon 核对的活儿,且是文字冒险专属)。

   只看核心契约暴露的图结构 → 任何模块(文字冒险 / 跑团 / …)都适用:
     边(edge)= node.exits[].to(核心默认移动) + node.links[].to(模块带条件移动)。
     没有 .to 的 link 是「纯动作」(run/once),**不是边**,不计入图。

   检查项:
     · 死链  [确认][P0]:某条 .to 指向不存在的节点 → 退出码 1。
     · 不可达/孤儿 [可疑][P1]:从 start 走遍 edge 仍到不了 → 可能是真孤儿,
        也可能由模块运行时机制(事件生成/动态)接入,故标「可疑」需人工确认。
     · 死胡同 [可疑][P2]:某节点没有任何出边 → 可能是有意的结局/终局,需人工确认。
     · 死 flag [可疑][P1]:被 requires/available/look 读、但 world.js 从不写的 flag
        → 门控它的选项/出口永远锁死(逻辑死锁,图连通查不到——如 hasThreeShards)。
        源文本静态分析(读 .flags.X 减 写 flags.X=/flag:'X'/set:{X});可能由 game.js/插件运行时设,故「可疑」。
     · 未初始化数值字段 [可疑][P1]:world.js 对 S.<key>/state.<key> 做复合赋值/自增减(+=/-=/++/--)、
        但 initState 未声明该 key → 首次即 NaN(undefined 参与算术)→ 数值门控恒 false、soft-lock。
        探针 ④ 只抓"走得到"的运行时 NaN,此处静态补"分支深处/被门控走不到"的;变量名靠约定(S/state),故「可疑」。
     · 死 state 键 [确认][P0]:被 S.<key>/state.<key> 门控/比较读、但从不写(无 =/+=/initState/默认)→ 恒 undefined、
        门控恒 false / 比较永不成立 → 路径或功能(如结局成就)死锁(deadFlag 的裸键版;排除 flags/保留/已写/已声明/防御性 ||?? 读)。
        showcase round6 升 P0:确定性死锁、单一正解;逃生口=在 initState 声明。
     · 假选择 [可疑][P1]:同节点 ≥2 个无 run/requires/once 的纯移动指向同一 to → 选哪个都一样(玩法等价假分支)。
     · 无保底出口:某节点有出边、但没有一条「无条件且非一次性(once)」的出口
        → 条件都不满足、或唯一无条件出口是 once 被消耗后重访时卡死(soft-lock,人工极难测)。
        once=一次性=不可逆,消耗后失效故不算保底(运行时安全网亦不覆盖被消耗锁死)。
        默认 [确认][P0] 硬拦(与结构断裂同性质;弱模型会忽略 P1);节点某出口标了 lockHint(显式有意单程/未完成)才降 [可疑][P1]。

   ⚠️ 有意不做「环检测」:在状态驱动模型里,A⇄B 来回走是**正常**的
      (内容=f(状态),来回不等于空转)——「无限循环/重复插页」是旧的
      "节点图 + if 判断来路" 模型的病,新模型由构造消除(见 docs/journal.md 阶段3、
      docs/lessons-learned.md ③)。所以这里**不**报「环」,只报死链/孤儿/死胡同。

   用法: node graph-audit.mjs path/to/world.js [--json]
   退出码: 0 = 无 P0;1 = 有 P0(死链 / 结构断裂 / 无保底出口〔无 lockHint〕)。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
import { createRequire } from 'module';
import { pathToFileURL, fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));   // 解析呈现器预设表用(audioPresetIssues)

// ---------- 边解析:把 exits / links 的 .to 归一成 "map/node" 键 ----------
// to 可为字符串(同图节点 id)或 { map, node }(跨图)。返回 null = 这条没有 .to(纯动作,不是边)。
function edgeKey(to, curMap) {
  if (to == null) return null;
  if (typeof to === 'string') return curMap + '/' + to;
  if (typeof to === 'object' && to.map && to.node) return to.map + '/' + to.node;
  return undefined;   // 有 .to 但形状非法 → 当作无法解析(死链)
}

function outEdges(node, curMap) {
  const out = [];
  const collect = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const e of arr) {
      if (e && Object.prototype.hasOwnProperty.call(e, 'to')) {
        out.push({ to: e.to, label: e.label });
      }
    }
  };
  collect(node.exits);
  collect(node.links);
  // v12:检定后果分支也是真边(success.to / fail.to —— Ink divert / ChoiceScript *goto / Fallen London
  //   challenge 分支同款一等公民语义;闸随契约进化:不计入会把"只能靠检定到达"的节点误报不可达、
  //   且 success.to 指向不存在节点的死链会漏报)。
  // v16:暴击/大失败叙事分支 crit.to / fumble.to 同理是真边(只经暴击可达的节点不可漏算;闸随契约进化)。
  if (Array.isArray(node.checks)) {
    const SIDE_LABEL = { success: '成功', fail: '失败', crit: '暴击', fumble: '大失败', partial: '部分成功' };
    for (const c of node.checks) {
      if (!c) continue;
      for (const side of ['success', 'fail', 'crit', 'fumble', 'partial']) {
        const o = c[side];
        if (o && o.to != null) out.push({ to: o.to, label: (c.label || c.id || '') + '·' + SIDE_LABEL[side] });
      }
    }
  }
  // round13:迷宫(kind:'maze')节点的对外出口在 node.maze.cells[*].exit.to(迷宫内某格触发的转移,移动靠模块内部 pos
  //   不经 links/exits)→ 当作真边,否则迷宫下游(走出迷宫后的节点)误报不可达、迷宫节点误报死胡同。
  if (node.maze && node.maze.cells && typeof node.maze.cells === 'object') {
    for (const ck of Object.keys(node.maze.cells)) {
      const cd = node.maze.cells[ck];
      if (cd && cd.exit && cd.exit.to != null) out.push({ to: cd.exit.to, label: (cd.exit.label || ('格' + ck)) + '·迷宫出口' });
    }
  }
  return out;
}

export function auditWorld(world) {
  const issues = [];
  const maps = (world && world.maps) || {};

  // v24:world.id 是跨版本稳定的游戏身份，也是 core/boot/plugin 存档命名空间的单一来源。
  // 这里与 createEngine 使用同一 UUID v4 形状；build 复用 auditWorld，故不用另抄一套构建校验。
  const worldIdRe = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!world || typeof world.id !== 'string' || !worldIdRe.test(world.id)) {
    issues.push("[确认][P0] world.id 必须是 UUID v4 字符串 —— 创建游戏时生成一次并长期保持；复制 demo/new game 时换新 UUID，不要拿标题、路径或地图内容哈希代替。");
  }

  // 1) 节点全集:键 = "map/node"
  const nodeKeys = new Set();
  for (const mapId of Object.keys(maps)) {
    const nodes = (maps[mapId] && maps[mapId].nodes) || {};
    for (const nodeId of Object.keys(nodes)) nodeKeys.add(mapId + '/' + nodeId);
  }

  // 2) 入口
  const start = world && world.start;
  const startKey = start && start.map && start.node ? start.map + '/' + start.node : null;
  if (!startKey) {
    issues.push("[确认][P0] 世界缺少合法 start:{map,node} —— 引擎无从进入。");
  } else if (!nodeKeys.has(startKey)) {
    issues.push(`[确认][P0] start 指向不存在的节点 '${startKey}'。`);
  }

  // 2.5) 单图规模提示(round11《奥术之始》51 节点塞一图 → 小地图必然拥挤;非错误,纯可用性提示):
  //   引擎原生支持多 maps、minimap 按当前图渲染 —— 大游戏按章节/区域拆图才是治本。阈值 32 经验值(>28 进自适应缩圆,32+ 已明显密)。
  for (const mapId of Object.keys(maps)) {
    const n = Object.keys((maps[mapId] && maps[mapId].nodes) || {}).length;
    if (n > 32) issues.push(`[可疑][P2] 单图过大:地图 '${mapId}' 有 ${n} 个节点 —— 小地图会很拥挤。引擎原生支持多 maps(按章节/区域拆图,minimap 只渲染当前图);若有意单图可忽略。`);
  }

  // 3) 逐节点:死链 + 出边表 + 死胡同
  const adj = new Map();         // key -> [resolvedTargetKey...]
  for (const mapId of Object.keys(maps)) {
    const nodes = (maps[mapId] && maps[mapId].nodes) || {};
    for (const nodeId of Object.keys(nodes)) {
      const key = mapId + '/' + nodeId;
      const node = nodes[nodeId] || {};
      // node.events 是文字冒险进入级 beat 的真实对象边界。只在对象树这一层校验 when，避免旧版
      // 全源码 `when:'…'` regex 把 meta.when / 自定义模块私有配置同名字段误判成 event.when；
      // auditWorld 是 graph CLI 与 build 共用的唯一裁决源，二者不会再一边拦、一边放。
      if (Array.isArray(node.events)) {
        for (let eventIndex = 0; eventIndex < node.events.length; eventIndex++) {
          const event = node.events[eventIndex];
          if (!event || typeof event !== 'object' || event.when == null || typeof event.when === 'function') continue;
          if (typeof event.when === 'string') {
            issues.push(`[确认][P0] event.when 写成字符串 '${event.when}':节点 '${key}' 的 events[${eventIndex}].when 必须是条件函数 \`(state)=>bool\`(可选)——events 进入节点本来就自动触发,不要和 achievement 的 \`on:'enter'\` 时机枚举混用。删掉 when=恒触发;若本意是条件门控,改成函数。`);
          } else {
            issues.push(`[确认][P0] event.when 形状错误:节点 '${key}' 的 events[${eventIndex}].when 必须是条件函数 \`(state)=>bool\`(可选),得到 ${typeof event.when}。删掉 when=恒触发;若本意是条件门控,改成函数。`);
          }
        }
      }
      // 跑团检定格式校验(showcase 实测盲点):弱模型把检定节点写成**自创格式** on_success/on_failure/modifiers,
      //   构建只报"不可达"(自创的 links 函数不是真边)→ 它误判成"引擎不支持动态 links"→ 砍掉整个跑团。
      //   这里在它最先撞到的静态闸上**直接点名 + 给正确契约**,把误判堵死(类型无关审计里的一处针对性提示)。
      const badCheck = ['on_success', 'on_failure', 'on_succeed', 'on_fail', 'modifiers'].filter((f) => Object.prototype.hasOwnProperty.call(node, f));
      if (badCheck.length) {
        issues.push(`[可疑][P1] 跑团检定格式错:节点 '${key}' 用了非契约字段 ${badCheck.map((f) => '`' + f + '`').join('/')}(引擎不认 → 检定静默失效、节点常显不可达)。`
          + `Amatlas tabletop 契约:\`kind:'encounter'\` + \`checks:[{ skill, dc, dice:'2d6', cost?, success:{ text, set?, flag?, clock?, to? }, fail:{…} }]\`(v12:success.to/fail.to=检定结果直接移动),移动用 \`exits:[{to,label}]\`;且 game.js 要 \`engine.use(A.Tabletop.createTabletopModule({sheet}))\`。`
          + `**别自创 on_success/on_failure/modifiers**——照抄 examples/tabletop-demo。`);
      }
      // v11 对称穷举(全引擎审计实锤的「字段放错对象」fail-silent 接缝;运行时 engine-core/renderer 已同步抛,这里静态全节点覆盖):
      //   ① exit 上写 links 的字段(requires/run/once/lockHint/showWhenLocked)→ 旧版静默忽略=锁消失/副作用丢/once 无效;P0(运行时必抛、零误报已 sweep)。
      for (const ex of (Array.isArray(node.exits) ? node.exits : [])) {
        const mis = ['requires', 'run', 'once', 'lockHint', 'showWhenLocked'].filter((k) => ex && ex[k] != null);
        if (mis.length) {
          issues.push(`[确认][P0] 出口字段放错对象:节点 '${key}' 的 exit「${(ex && ex.label) || (ex && typeof ex.to === 'string' ? ex.to : '')}」写了 ${mis.join('/')} —— exits 只支持 {to,label,available},这些是 links 的字段(引擎运行时会抛;旧版静默忽略=门控失效/副作用丢/一次性出口变无限)。把这条出口改写进 links:[{to,label,${mis.join(',')},…}]。`);
        }
      }
      //   ③ scene 节点带 checks → text-adventure 不消费、检定按钮静默消失(运行时 renderer 会抛)。
      //      自定义模块可合法认领 'scene' 自行消费 checks → 有合法反例,按 §11.2 只 P1 不 P0。
      if (node.kind === 'scene' && Array.isArray(node.checks) && node.checks.length) {
        issues.push(`[可疑][P1] scene 节点 '${key}' 写了 checks(检定):检定属于 kind:'encounter'(tabletop),text-adventure 不消费 checks → 检定按钮静默消失(且引擎运行时会抛)。混合游戏把该节点改 kind:'encounter';若自定义模块认领 'scene' 并自行消费 checks 可忽略。`);
      }
      //   encounter 有 checks 但没 scene → 进入时无画面(tabletop.render:193/206 无 node.scene 则 view.scene 空 →
      //     present-svg 没场景可画);点检定后(render:195-196)骰子被塞进【强造的空场景】→ 中性灰底突兀冒出
      //     (showcase《零号台站》实测:用户报"encounter 进入没画面、只有点检定画面才出现")。范例 tabletop-demo 每个
      //     encounter 都写 scene、tabletop-design §1 也教 → 漏写=静默接缝(blank→灰盒子 pop,作者零反馈)。
      //     只校验形式(有 checks 才需配 scene)、不碰内容;P1 可疑(纯文字无画面是合法少数 → 不硬拦)。
      if (node.kind === 'encounter' && Array.isArray(node.checks) && node.checks.length && node.scene == null) {
        issues.push(`[可疑][P1] encounter 节点 '${key}' 有 checks(检定)但没写 scene:进入时无画面(present-svg 没有可画的场景),要等点了检定、骰子才把一个空场景顶出来 → 玩家看到"突然冒出画面"(showcase 实测困惑点)。修:给该 encounter 加 scene:{region,mood}(同 kind:'scene' 节点,照抄 examples/tabletop-demo);确实要纯文字无画面可忽略。`);
      }
      // 可无限刷属性(round12《灰雾》实测:33 处增益 run vs once 仅 5 → 纯动作链接反复点=刷属性 + 同段回应重现"没反应")。
      //   形态签名:无 to(原地)、无 once、无 requires 的 link.run 含数值增益(`+= n` 或 `(S.x||0)+n`)且无抵扣(-=)/封顶(Math.min)。
      //   有意磨练机制可忽略 → P1 可疑非 P0;修=once:true / requires / run 内封顶。只查形式门控、不评内容。
      for (const lk of (Array.isArray(node.links) ? node.links : [])) {
        //   ② link 上写 available(exits 的字段)→ 旧版被注入的恒真过滤器覆盖=门控静默失效;P0(运行时必抛、零误报已 sweep)。
        if (lk && lk.available != null) {
          issues.push(`[确认][P0] 门控字段放错对象:节点 '${key}' 链接「${lk.label || lk.id || ''}」写了 available —— links 的门控字段是 requires(available 是 exits 的;引擎运行时会抛,旧版静默覆盖=门控失效)。改成 requires:(S)=>bool(可加 showWhenLocked/lockHint 灰显)。`);
        }
        if (lk && lk.to == null && !lk.once && lk.requires == null && typeof lk.run === 'function') {
          const src = lk.run.toString();
          if (/(\+=\s*\d|\|\|\s*0\)\s*\+\s*\d)/.test(src) && !/-=|Math\.min/.test(src)) {
            issues.push(`[可疑][P1] 可无限刷属性:节点 '${key}' 纯动作链接「${lk.label || lk.id || ''}」每次点击都数值增益,且无 once/requires 门控 —— 玩家可反复点刷属性、且每次重现同一段回应("没反应"感)。修:加 once:true(一次性)/ requires 条件 / run 内封顶;有意的可重复磨练可忽略。`);
          }
        }
      }
      const edges = outEdges(node, mapId);
      const targets = [];
      for (const e of edges) {
        const tk = edgeKey(e.to, mapId);
        if (tk === undefined || !nodeKeys.has(tk)) {
          const shown = typeof e.to === 'string' ? e.to : JSON.stringify(e.to);
          const lbl = e.label ? `「${e.label}」` : '';
          issues.push(`[确认][P0] 死链:节点 '${key}' 的出口${lbl}指向不存在的 '${shown}'。`);
        } else {
          targets.push(tk);
        }
      }
      adj.set(key, targets);
      if (edges.length === 0) {
        issues.push(`[可疑][P2] 死胡同:节点 '${key}' 没有任何出边(exits/links.to 皆无)。`
          + `若是有意的结局/终局则可忽略;否则玩家会卡在此处。`);
      } else {
        // 无保底出口:有出边、但没有一条「无条件且非一次性(once)」的出口 → 条件都不满足、或唯一的无条件
        // 出口是 once 被消耗后重访时卡死(soft-lock)。once = 一次性(=不可逆),消耗后该边失效,故**不算保底**
        //   ——运行时安全网同样不覆盖「被消耗」锁死(见 renderer.js:131-132),此处静态补上这个双层盲点。
        const isStandby = (e, condKey) => e && e.to != null && typeof e[condKey] !== 'function' && !e.once;
        let hasUncond = (node.exits || []).some((e) => isStandby(e, 'available'))
                     || (node.links || []).some((l) => isStandby(l, 'requires'));
        // v12:普通检定边**不算**保底(可失败/可被 cost 耗尽/available 门控——调研定稿);唯一例外=「整分支检定」:
        //   success.to + fail.to 双目的地、无 cost/available 门控、success 不置隐藏 flag(置了→成功后该检定隐去,
        //   重访可卡)→ 每次点击必然移动且重访仍在 = 等价保底出口(Disco Elysium 红检「检定即分叉」节点;
        //   不豁免会把纯分叉节点报成无保底 P0 = 违 §11.2 零误报)。
        hasUncond = hasUncond || (Array.isArray(node.checks) && node.checks.some((c) =>
          c && c.success && c.success.to != null && c.fail && c.fail.to != null
          && c.cost == null && c.available == null && c.success.flag == null));
        // round13:迷宫(kind:'maze')节点的出口在 maze.cells[*].exit.to(走到该格即出,无 requires 门控)→ 算保底出口
        //   (否则迷宫节点因没 node.exits/links 被误报"无保底出口";其结构可达性已由 outEdges 读 maze.cells 覆盖)。
        hasUncond = hasUncond || (node.maze && node.maze.cells && typeof node.maze.cells === 'object'
          && Object.keys(node.maze.cells).some((k) => node.maze.cells[k] && node.maze.cells[k].exit && node.maze.cells[k].exit.to != null));
        // maze3d(kind:'maze3d')节点:进度发生在 canvas 内部(走到发光门=winKey、被怪抓=scareKey,均经
        //   api.apply 写 flag,静态图看不到),links 只是【事后路由】→ 即使 win/caught/撤回 全带 requires 也非 soft-lock
        //   (玩家始终能玩迷宫=保底行动,且撤回门控成 !被抓 后仍随时可走直到终局)。同 kind:'maze' 的 cells 豁免理由。
        //   不豁免会把"被抓后不能再撤回"(showcase《零号台站》issue④,把撤回门控成 !caught)误报无保底 P0。
        //   grid 坏数据另由 maze3dIssues 精确 P0 报,这里仍按 maze3d 孤岛豁免,避免叠报「无保底出口」。
        hasUncond = hasUncond || node.kind === 'maze3d' || !!(node.maze && Array.isArray(node.maze.grid) && node.maze.grid.length);
        if (!hasUncond) {
          // design-principles §6a/§7.1:无保底出口与「结构断裂」同性质(确定性 soft-lock),默认 **P0 硬拦**
          //   ——弱模型会把 P1 当"审计误判"整体忽略(warning-fatigue,§3 铁律)。把"有意单程"收敛成**显式信号**:
          //   仅当该节点某条出口标了 lockHint(作者明确"这是有意的锁/单程/未完成")才降 P1。未声明意图 = P0。
          const hasLockHint = (node.exits || []).some((e) => e && e.lockHint != null)
                           || (node.links || []).some((l) => l && l.lockHint != null);
          const sev = hasLockHint ? '[可疑][P1]' : '[确认][P0]';
          const tail = hasLockHint
            ? `已标 lockHint(视为有意单程/未完成)→ 仅提醒;请确认条件确实总可满足、或确为有意。`
            : `**确定性 soft-lock,非误判**:每条出口要么带 requires/available 条件、要么是 once 一次性 → 条件全不满足、或 once 消耗后重访即卡死(人工极难测)。修:让至少一条出口无条件且非 once(保底出口);若确为有意单程/未完成,给该出口加 lockHint 标明意图 → 自动降为 P1。`;
          issues.push(`${sev} 无保底出口:节点 '${key}' 没有「无条件且非一次性」的出口。${tail}`);
        }
      }

      for (const m of maze3dIssues(key, node)) issues.push(m);

      // 假选择(design-principles §6b ⑨):同节点 ≥2 个**无 run 副作用、无 requires/available 条件、非 once** 的纯移动
      //   指向同一 to → 选哪个结果都一样(玩法等价的"假分支")。SKILL 反复教,有确定性判据 → P1(也可能有意多入口,故可疑)。
      const plain = {};
      const collectPlain = (arr, condKey) => {
        if (!Array.isArray(arr)) return;
        for (const e of arr) {
          if (!e || e.to == null) continue;
          if (typeof e.run === 'function' || typeof e[condKey] === 'function' || e.once) continue;  // 有副作用/条件/一次性 → 非假
          const tk = edgeKey(e.to, mapId);
          if (tk === undefined || !nodeKeys.has(tk)) continue;                                       // 死链已单独报
          (plain[tk] = plain[tk] || []).push(e.label || tk);
        }
      };
      collectPlain(node.exits, 'available');
      collectPlain(node.links, 'requires');
      for (const tk in plain) {
        if (plain[tk].length >= 2) {
          issues.push(`[可疑][P1] 假选择:节点 '${key}' 有 ${plain[tk].length} 个无差别选项(${plain[tk].map((l) => `「${l}」`).join('、')})都通向 '${tk}'`
            + `、且都无 run 副作用、无 requires/available 条件 → 玩家选哪个都一样(假分支)。合并它们,或给不同后果(run)/条件(requires)。`);
        }
      }
    }
  }

  // 4) 可达性(BFS over 已解析的边)
  let reached = new Set();
  if (startKey && nodeKeys.has(startKey)) {
    const stack = [startKey];
    while (stack.length) {
      const k = stack.pop();
      if (reached.has(k)) continue;
      reached.add(k);
      for (const t of (adj.get(k) || [])) if (!reached.has(t)) stack.push(t);
    }
  }
  const orphans = [...nodeKeys].filter((k) => !reached.has(k)).sort();
  // 孤儿率升级(S11-b showcase 诊断):引擎节点转移**只**经 exits/links.to(见 engine-core enter←action.to),
  //   run 是纯副作用、无"运行时动态接入"路径 → graph-audit 的可达性 = 真可达性。少量孤儿或许是作者草稿/
  //   未来模块动态接入(P1 存疑),但**大比例**孤儿几乎一定是漏接了边(某一幕入口无人指向→它及下游整片不可达),
  //   升 **P0 硬拦**:否则弱模型会把这堆 P1 当"审计误判"整体放过(实测 Haiku showcase 即如此)。阈值=≥3 个且 >1/3。
  const orphanRate = nodeKeys.size ? orphans.length / nodeKeys.size : 0;
  const structuralBreak = orphans.length >= 3 && orphanRate > 1 / 3;
  if (structuralBreak) {
    issues.push(`[确认][P0] 结构断裂:${orphans.length}/${nodeKeys.size}(${Math.round(orphanRate * 100)}%)个节点从 start 不可达 —— `
      + `远超"个别草稿节点",几乎一定是漏接了边(常见:某一幕的入口节点没有任何 link/exit 指向它 → 它及其下游整片不可达)。`
      + `引擎节点转移只经 exits/links.to、无"运行时动态接入"可补救 → **这不是审计误判**,必须补上缺失的边。先看下方第一个不可达节点应从哪进来。`);
  }
  for (const o of orphans) {
    issues.push(`[可疑][P1] 不可达节点 '${o}':从 start 沿 exits/links 走不到。`
      + (structuralBreak ? '(属上方「结构断裂」P0 的一部分,非独立误判)'
                         : '可能是(a)真孤儿,或(b)由模块运行时机制(事件/动态)接入——请人工确认。'));
  }

  // SCC 软锁口袋(逐节点「无保底出口」P0 的盲区;round12《烈焰与咸风》实锤)
  for (const m of softlockPocketIssues(maps, reached)) issues.push(m);

  const stats = { maps: Object.keys(maps).length, nodes: nodeKeys.size, reachable: reached.size };
  return { issues, stats };
}

// ---------- maze3d 私有内容审计(R1-a3:canvas 孤岛的坏数据提前到 graph-audit)----------
// 【为什么 maze3d 专属校验有意留在"类型无关"的核心 graph-audit,而非抽成模块自带/可插拔审计】(2026-07 决策留痕)
//   ① maze3d 进度发生在 canvas 内(走到发光门/被怪抓经 api.apply 写 flag),静态图层看不见 → graph-audit 是坏
//      grid 数据在交付前【唯一】能被机器发现的 pre-build 静态闸;抽出后 `graph-audit world.js` 不再报 maze3d P0,
//      要等价覆盖须引入插件发现机制 = 破坏「一条命令得全部静态闸」。
//   ② design-principles §10:新模块【默认继承 A 类闸】(graph-audit 类型无关、自动);抽成 opt-in 注册 = 方向相反。
//   ③ 先例:本文件 BUILTIN_KIND_MODULE 已在核心显式列 scene/encounter/cutscene —— 这是同一已接受决策的再次应用,非新罪。
//   耦合共两处:本函数 + :235 的「无保底出口」maze3d 内联豁免。抽出触发器(满足任一才值得走 §12 设计稿 +
//   registerAuditPlugin 公共 API):≥3 个 canvas/自定义 runtime 模块各 >100 行审计逻辑且演进独立于 core,或出现须
//   在不改 core 下注入审计规则的第三方模块贡献者。今皆不满足 → 留核心 + 接受耦合是当前正解。
function maze3dIssues(key, node) {
  const out = [];
  if (!node || (node.kind !== 'maze3d' && !(node.maze && Object.prototype.hasOwnProperty.call(node.maze, 'grid')))) return out;
  const maze = node.maze || {};
  const p0 = (msg) => out.push(`[确认][P0] maze3d 数据错误:节点 '${key}' ${msg}`);
  const p1 = (msg) => out.push(`[可疑][P1] maze3d 可疑数据:节点 '${key}' ${msg}`);
  const isInt = (v) => Number.isInteger(v);
  const dirOk = (v) => typeof v === 'string' && /^[NESW]$/i.test(v);
  const faceDx = (f) => f === 'W' ? -1 : f === 'E' ? 1 : 0;
  const faceDy = (f) => f === 'N' ? -1 : f === 'S' ? 1 : 0;

  const grid = maze.grid;
  if (!Array.isArray(grid) || !grid.length) {
    p0('maze.grid 必须是非空字符串数组(每行一个字符串:# 墙 / . 地板 / D 门 / K 钥匙);maze3d 进度发生在 canvas 内,没有合法 grid 就无法审计也无法可靠游玩。');
    return out;
  }
  let W = null, shapeBad = false;
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    if (typeof row !== 'string' || !row.length) { p0(`maze.grid[${y}] 必须是非空字符串。`); shapeBad = true; continue; }
    if (W == null) W = row.length;
    else if (row.length !== W) { p0(`maze.grid 必须是矩形:第 ${y} 行宽 ${row.length},应为 ${W}。短行会在运行时被当成隐形墙,请手工补齐而不是让引擎猜。`); shapeBad = true; }
    for (let x = 0; x < row.length; x++) {
      if ('#.DK'.indexOf(row[x]) < 0) { p0(`maze.grid(${x},${y}) 字符 ${JSON.stringify(row[x])} 非法;当前稳定字符只支持 '#'(墙)/'.'(地板)/'D'(出口门)/'K'(钥匙)。未知字符会被 runtime 当可走地板,属于 fail-silent。`); shapeBad = true; break; }
    }
  }
  if (shapeBad) return out;

  const H = grid.length;
  const inBounds = (x, y) => y >= 0 && y < H && x >= 0 && x < W;
  const cellAt = (x, y) => inBounds(x, y) ? grid[y][x] : '#';
  const isWalk = (x, y) => { const c = cellAt(x, y); return c !== '#' && c !== 'D'; };

  const st = maze.start || {};
  let startOk = true;
  const sx = st.x, sy = st.y;
  if (!isInt(sx) || !isInt(sy)) { p0(`maze.start.x/.y 必须是整数格坐标,得到 x=${sx} y=${sy}。`); startOk = false; }
  else if (!inBounds(sx, sy)) { p0(`maze.start (${sx},${sy}) 超出 grid 范围。`); startOk = false; }
  else if (!isWalk(sx, sy)) { p0(`maze.start (${sx},${sy}) 落在${cellAt(sx, sy) === '#' ? '墙#' : '出口门D'}上,玩家出生即卡住。`); startOk = false; }
  if (st.dir != null && !dirOk(st.dir)) p1(`maze.start.dir=${JSON.stringify(st.dir)} 不是 N/E/S/W;runtime 会退回默认朝向,作者意图会丢失。`);

  const setUnlocks = {}, warpDests = {}, dynamicDoorEvents = {}, dynamicKeyEvents = {};
  const mazeActionEffects = [];                                      // 每次顶层/page/success 动作保持原子性;门可达证明不能拆用“开路”却忽略同次“删门”。
  const effectKeys = new Set();
  const addSetUnlock = (ek, x, y) => { (setUnlocks[ek] = setUnlocks[ek] || []).push([x, y]); };
  const addWarp = (ek, x, y) => { (warpDests[ek] = warpDests[ek] || []).push([x, y]); };
  const addDynamicDoor = (ek, x, y) => { (dynamicDoorEvents[ek] = dynamicDoorEvents[ek] || []).push([x, y]); };
  const addDynamicKey = (ek, x, y) => { (dynamicKeyEvents[ek] = dynamicKeyEvents[ek] || []).push([x, y]); };
  const isDenseArray = (a) => {
    if (!Array.isArray(a)) return false;
    for (let i = 0; i < a.length; i++) if (!(i in a)) return false;
    return true;
  };
  const hasEventContent = (o) => !!(o && (o.run != null || o.set != null || o.warp != null || o.turn != null || o.activateMonsters != null || o.deactivateMonsters != null || o.puzzle != null || (o.hint != null && o.hint !== '') || (o.examine != null && o.examine !== '')));
  const validateMonsterToggle = (obj, label, field) => {
    if (obj[field] == null) return;
    const val = obj[field], count = Array.isArray(maze.monsters) ? maze.monsters.length : 0;
    const ok = val === true || (isDenseArray(val) && val.every((v) => isInt(v)));
    if (!ok) { p0(`${label}.${field} 必须是 true(全部)或整数索引数组,得到 ${JSON.stringify(val)}。`); return; }
    if (Array.isArray(val)) for (let mi = 0; mi < val.length; mi++) if (val[mi] < 0 || val[mi] >= count) p0(`${label}.${field}[${mi}]=${val[mi]} 越界(monsters 共 ${count} 个)。`);
  };
  const validateEventActions = (obj, label, ek, evOk) => {              // R1-b3 pages 与顶层事件复用同一动作形状闸;避免 page 成为静态审计盲区。
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    if (obj.run != null && typeof obj.run !== 'function') p0(`${label}.run 必须是函数(签名 (state,api)=>void),得到 ${typeof obj.run}。`);
    if (obj.examine != null && typeof obj.examine !== 'string') p0(`${label}.examine 必须是字符串(主动检视时显示的只读线索),得到 ${JSON.stringify(obj.examine)}。`);
    if (obj.trigger != null && obj.trigger !== 'interact') p0(`${label}.trigger 只支持 'interact'(进格/贴近只暴露上下文,按 E/Enter 或按钮才触发动作),得到 ${JSON.stringify(obj.trigger)}。`);
    const finalSet = new Map();                                      // 同一动作按数组顺序执行;同格多写只允许最后值进入 BFS/动态门钥匙模型。
    const effect = evOk && ek ? { eventKey: ek, writes: [], warp: null } : null;
    if (obj.set != null) {
      if (!Array.isArray(obj.set)) p0(`${label}.set 必须是数组(每项 {x,y,ch})。`);
      else {
        for (let si = 0; si < obj.set.length; si++) {
          const sc = obj.set[si] || {};
          if (!isInt(sc.x) || !isInt(sc.y)) { p0(`${label}.set[${si}].x/.y 必须是整数格坐标,得到 x=${sc.x} y=${sc.y}。`); continue; }
          if (!inBounds(sc.x, sc.y)) { p0(`${label}.set[${si}] 坐标 (${sc.x},${sc.y}) 超出 grid 范围。`); continue; }
          if ('#.DK'.indexOf(sc.ch) < 0) { p0(`${label}.set[${si}].ch 只支持 '#'/'.'/'D'/'K',得到 ${JSON.stringify(sc.ch)}。`); continue; }
          finalSet.set(sc.x + ',' + sc.y, sc);
        }
        if (effect) {
          for (const sc of finalSet.values()) {
            effect.writes.push([sc.x, sc.y, sc.ch]);
            if (sc.ch === '.' || sc.ch === 'K') addSetUnlock(ek, sc.x, sc.y);
            if (sc.ch === 'D') addDynamicDoor(ek, sc.x, sc.y);
            if (sc.ch === 'K') addDynamicKey(ek, sc.x, sc.y);
          }
        }
      }
    }
    if (obj.warp != null) {
      const wp = obj.warp;
      if (!wp || typeof wp !== 'object' || Array.isArray(wp) || !isInt(wp.x) || !isInt(wp.y)) p0(`${label}.warp 必须是 {x,y[,dir]} 整数格坐标,得到 ${JSON.stringify(wp)}。`);
      else if (!inBounds(wp.x, wp.y)) p0(`${label}.warp 坐标 (${wp.x},${wp.y}) 超出 grid 范围。`);
      else {
        const final = finalSet.get(wp.x + ',' + wp.y);
        const wc = final ? final.ch : cellAt(wp.x, wp.y);             // runtime 固定先 set 后 warp;不能拿旧 grid 证明目标安全或危险。
        if (wc === '#' || wc === 'D') p0(`${label}.warp 目标 (${wp.x},${wp.y}) 在同次 set 结算后是${wc === '#' ? '墙#' : '出口门D'},玩家会卡住;传送目标最终必须是可走地板或钥匙格。`);
        else if (evOk && ek) { addWarp(ek, wp.x, wp.y); if (effect) effect.warp = [wp.x, wp.y]; }
      }
      if (wp && wp.dir != null && !dirOk(wp.dir)) p0(`${label}.warp.dir 必须是 N/E/S/W,得到 ${JSON.stringify(wp.dir)}。`);
    }
    if (obj.turn != null && !dirOk(obj.turn)) p0(`${label}.turn 必须是 N/E/S/W,得到 ${JSON.stringify(obj.turn)}。`);
    validateMonsterToggle(obj, label, 'activateMonsters');
    validateMonsterToggle(obj, label, 'deactivateMonsters');
    if (effect && (effect.writes.length || effect.warp)) {
      effect.id = label;
      const effectKey = label + '|' + JSON.stringify(effect.writes) + '|' + JSON.stringify(effect.warp);
      if (!effectKeys.has(effectKey)) { effectKeys.add(effectKey); mazeActionEffects.push(effect); }
    }
  };
  const validatePuzzleSpec = (puzzle, label) => {                    // R1-b4 固定数据模板:graph-audit 复刻 runtime 数据边界,但不判断谜题线索是否公平。
    if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) { p0(`${label} 必须是对象。`); return; }
    const kindOk = puzzle.kind === 'code' || puzzle.kind === 'sequence' || puzzle.kind === 'toggle';
    if (!kindOk) p0(`${label}.kind 必须是 'code'/'sequence'/'toggle' 之一,得到 ${JSON.stringify(puzzle.kind)}。`);
    if (typeof puzzle.prompt !== 'string' || !puzzle.prompt.trim()) p0(`${label}.prompt 必须是非空字符串。`);
    const allowed = puzzle.kind === 'code'
      ? { kind: 1, prompt: 1, answer: 1, maxLength: 1 }
      : puzzle.kind === 'sequence'
        ? { kind: 1, prompt: 1, choices: 1, answer: 1 }
        : puzzle.kind === 'toggle'
          ? { kind: 1, prompt: 1, labels: 1, answer: 1 }
          : { kind: 1, prompt: 1 };
    for (const field of Object.keys(puzzle)) if (!allowed[field]) p0(`${label}.${field} 不是 ${kindOk ? puzzle.kind : 'v1 puzzle'} 模板字段;谜题只接受固定数据,不能嵌入任意逻辑。`);
    if (puzzle.kind === 'code') {
      const code = String(puzzle.answer == null ? '' : puzzle.answer);
      if ((typeof puzzle.answer !== 'string' && typeof puzzle.answer !== 'number') || !/^\d{1,8}$/.test(code)
        || (typeof puzzle.answer === 'number' && (!Number.isFinite(puzzle.answer) || !isInt(puzzle.answer) || puzzle.answer < 0))) {
        p0(`${label}.answer 必须是 1–8 位数字 string/number,得到 ${JSON.stringify(puzzle.answer)}。`);
      }
      const maxLength = puzzle.maxLength == null ? code.length : puzzle.maxLength;
      if (!isInt(maxLength) || maxLength < 1 || maxLength > 8 || maxLength < code.length) p0(`${label}.maxLength 必须是 1–8 的整数且不能短于答案长度 ${code.length},得到 ${JSON.stringify(puzzle.maxLength)}。`);
    } else if (puzzle.kind === 'sequence') {
      if (!isDenseArray(puzzle.choices) || !puzzle.choices.length || puzzle.choices.length > 8
        || !puzzle.choices.every((v) => typeof v === 'string' && !!v.trim())) p0(`${label}.choices 必须是 1–8 项无空槽的非空字符串数组。`);
      if (!isDenseArray(puzzle.answer) || !puzzle.answer.length || puzzle.answer.length > 8
        || !puzzle.answer.every((v) => typeof v === 'string' && Array.isArray(puzzle.choices) && puzzle.choices.indexOf(v) >= 0)) p0(`${label}.answer 必须是 1–8 项无空槽数组,且每项来自 choices。`);
    } else if (puzzle.kind === 'toggle') {
      if (!isDenseArray(puzzle.labels) || !puzzle.labels.length || puzzle.labels.length > 8
        || !puzzle.labels.every((v) => typeof v === 'string' && !!v.trim())) p0(`${label}.labels 必须是 1–8 项无空槽的非空字符串数组。`);
      if (!isDenseArray(puzzle.answer) || !isDenseArray(puzzle.labels) || puzzle.answer.length !== puzzle.labels.length
        || !puzzle.answer.every((v) => typeof v === 'boolean')) p0(`${label}.answer 必须是与 labels 等长、无空槽的 boolean 数组。`);
    }
  };
  const validatePuzzleOutcome = (obj, label, isFail, ek, evOk) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { p0(`${label} 必须是对象。`); return; }
    const allowed = isFail
      ? { hint: 1 }
      : { hint: 1, run: 1, set: 1, warp: 1, turn: 1, activateMonsters: 1, deactivateMonsters: 1 };
    for (const field of Object.keys(obj)) if (!allowed[field]) p0(`${label}.${field} 不允许;谜题结果只接受 ${Object.keys(allowed).join('/')}。`);
    if (obj.hint != null && (typeof obj.hint !== 'string' || !obj.hint.trim())) p0(`${label}.hint 存在时必须是非空字符串。`);
    if (isFail) {
      if (typeof obj.hint !== 'string' || !obj.hint.trim()) p0(`${label}.hint 必须是非空字符串(取消不执行 fail,答错才显示反馈)。`);
      return;                                                     // fail 动作全属非法字段,不能让它们进入下面的 BFS 机关模型。
    }
    validateEventActions(obj, label, ek, evOk);                   // 成功答案静态已知;可达 puzzle 的 success.set/warp 与普通可达机关同样进入乐观不动点。
    const hasSet = Array.isArray(obj.set) && obj.set.length > 0;
    const hasActivate = obj.activateMonsters === true || (Array.isArray(obj.activateMonsters) && obj.activateMonsters.length > 0);
    const hasDeactivate = obj.deactivateMonsters === true || (Array.isArray(obj.deactivateMonsters) && obj.deactivateMonsters.length > 0);
    if (obj.run == null && !hasSet && obj.warp == null && obj.turn == null
      && !hasActivate && !hasDeactivate && !obj.hint) p0(`${label} 须至少有非空 hint/run/set/warp/turn/activateMonsters/deactivateMonsters 之一,否则解谜成功没有可见结果。`);
  };
  const validatePuzzleLayer = (obj, label, ek, evOk, visual) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    if (obj.puzzle == null) {
      if (obj.success != null || obj.fail != null) p0(`${label} 写了 success/fail 却没有 puzzle;谜题结果不能脱离谜题静默存在。`);
      return;
    }
    const conflicts = ['hint', 'run', 'set', 'warp', 'turn', 'activateMonsters', 'deactivateMonsters'];
    for (const field of conflicts) if (obj[field] != null) p0(`${label} 写了 puzzle 时,同层不能再写 ${field};成功后果必须写进 success,否则会变成打开面板前先执行动作。`);
    validatePuzzleSpec(obj.puzzle, `${label}.puzzle`);
    validatePuzzleOutcome(obj.success, `${label}.success`, false, ek, evOk);
    validatePuzzleOutcome(obj.fail, `${label}.fail`, true, ek, evOk);
    if (visual === 'none' && (typeof obj.examine !== 'string' || !obj.examine.trim())) p1(`${label} 是无可见外观的 puzzle,却没有 examine 线索;无论自动触发还是 interact,玩家都可能无提示踩进或找不到面板。若确实是秘密机关,请在周围文本或外部节点给线索。`);
  };
  const evs = Array.isArray(maze.events) ? maze.events : [];
  if (maze.events != null && !Array.isArray(maze.events)) p0('maze.events 必须是数组;runtime 期望逐项坐标事件。');
  for (let i = 0; i < evs.length; i++) {
    const ev = evs[i] || {};
    if (ev.when != null && typeof ev.when !== 'function') p0(`events[${i}].when 必须是函数(签名 (state)=>boolean),得到 ${typeof ev.when}。`);
    let evOk = true, ex = ev.x, ey = ev.y, ek = null, ecell = '#';
    if (!isInt(ex) || !isInt(ey)) { p0(`events[${i}].x/.y 必须是整数格坐标,得到 x=${ex} y=${ey}。`); evOk = false; }
    else if (!inBounds(ex, ey)) { p0(`events[${i}] 坐标 (${ex},${ey}) 超出 grid 范围。`); evOk = false; }
    else { ek = ex + ',' + ey; ecell = cellAt(ex, ey); if (ecell === '#' || ecell === 'D') p1(`events[${i}] 坐标 (${ex},${ey}) 在${ecell === '#' ? '墙#' : '出口门D'}上,玩家走不到 → 事件永不触发(通常是手敲坐标错)。`); }
    const pageActions = Array.isArray(ev.pages) && ev.pages.some((pg) => pg && (pg.set != null || pg.warp != null || pg.turn != null));
    const eventVisual = ev.visual != null
      ? ev.visual
      : (ev.art != null || ev.icon != null)
        ? 'pickup'
        : (ev.set != null || ev.warp != null || ev.turn != null || pageActions) ? 'marker' : 'none';
    if (ev.visual === 'wall-pickup') {
      const face = String(ev.face || '').toUpperCase();
      if (!dirOk(face)) p0(`events[${i}] visual:'wall-pickup' 必须写 face:N/S/E/W,得到 ${JSON.stringify(ev.face)}。`);
      else if (evOk) {
        if (ecell === '#' || ecell === 'D') p0(`events[${i}] visual:'wall-pickup' 的 x/y 必须是玩家可站的地板格,当前是 ${ecell}。`);
        const wx = ex + faceDx(face), wy = ey + faceDy(face), wc = cellAt(wx, wy);
        if (wc !== '#') p0(`events[${i}] visual:'wall-pickup' 的 face=${face} 必须指向相邻墙格#,当前 (${wx},${wy}) 是 ${wc}。`);
      }
    }

    if (ev.pages != null) {
      validateEventActions({ trigger: ev.trigger }, `events[${i}]`, ek, evOk);   // 顶层 trigger 仍可作为 page 默认触发方式;其它文本/动作字段必须下沉到 page。
      if (!Array.isArray(ev.pages) || !ev.pages.length) p0(`events[${i}].pages 必须是非空数组(默认页放前、状态页放后;后匹配优先)。`);
      else {
        const topPageFields = ['when', 'run', 'set', 'warp', 'turn', 'activateMonsters', 'deactivateMonsters', 'hint', 'examine', 'puzzle', 'success', 'fail'];
        for (const f of topPageFields) if (ev[f] != null) p0(`events[${i}].pages 存在时,${f} 必须写进 page,顶层只放 x/y/visual/icon/art/face/trigger/once 等锚点字段。`);
        const badPageFields = ['x', 'y', 'once', 'visual', 'icon', 'art', 'palette', 'mirror', 'face'];
        let hasDefaultPage = false;
        for (let pi = 0; pi < ev.pages.length; pi++) {
          const pg = ev.pages[pi], label = `events[${i}].pages[${pi}]`;
          if (!pg || typeof pg !== 'object' || Array.isArray(pg)) { p0(`${label} 必须是对象。`); continue; }
          if (pg.when == null) hasDefaultPage = true;
          else if (typeof pg.when !== 'function') p0(`${label}.when 必须是函数(签名 (state)=>boolean),得到 ${typeof pg.when}。`);
          for (const f of badPageFields) if (pg[f] != null) p0(`${label}.${f} 不允许写在 page 上;page 只改文本/动作/puzzle/trigger,视觉和坐标仍归顶层事件。`);
          validateEventActions(pg, label, ek, evOk);
          validatePuzzleLayer(pg, label, ek, evOk, eventVisual);
          if (!hasEventContent(pg)) p0(`${label} 须至少有 run/set/warp/turn/activateMonsters/deactivateMonsters 或 puzzle 或 hint/examine 之一;trigger/when 本身不是事件内容。`);
        }
        if (!hasDefaultPage) p1(`events[${i}].pages 每个 page 都写了 when,没有默认页;条件都不满足时该事件会不可见/不可触发。若想给失败反馈,请把默认页放在前面。`);
      }
    } else {
      validateEventActions(ev, `events[${i}]`, ek, evOk);
      validatePuzzleLayer(ev, `events[${i}]`, ek, evOk, eventVisual);
      if (!hasEventContent(ev)) p0(`events[${i}] 须至少有 run/set/warp/turn/activateMonsters/deactivateMonsters(动作)或 puzzle(谜题面板)或 hint/examine 文本之一;trigger 本身不是事件内容。`);
    }
  }

  const checkSprites = (arr, name) => {
    if (arr == null) return;
    if (!Array.isArray(arr)) { p0(`maze.${name} 必须是数组。`); return; }
    for (let i = 0; i < arr.length; i++) {
      const o = arr[i] || {};
      if (!isInt(o.x) || !isInt(o.y)) { p0(`${name}[${i}].x/.y 必须是整数格坐标,得到 x=${o.x} y=${o.y}。`); continue; }
      if (!inBounds(o.x, o.y)) { p0(`${name}[${i}] 坐标 (${o.x},${o.y}) 超出 grid 范围。`); continue; }
      const c = cellAt(o.x, o.y);
      if (c === '#' || c === 'D') p1(`${name}[${i}] 坐标 (${o.x},${o.y}) 在${c === '#' ? '墙#' : '出口门D'}上,视觉/怪物可能不可见或不可达;若是刻意“墙里有东西”的演出请保留理由。`);
    }
  };
  checkSprites(maze.monsters, 'monsters');
  checkSprites(maze.pillars, 'pillars');
  if (maze.wallDecor != null) {
    if (!Array.isArray(maze.wallDecor)) p1('maze.wallDecor 应为数组(每项 {x,y,face,kind,...});写错会让墙饰不可渲染或运行时抛。');
    else for (let i = 0; i < maze.wallDecor.length; i++) {
      const d = maze.wallDecor[i] || {};
      if (!isInt(d.x) || !isInt(d.y)) { p1(`wallDecor[${i}].x/.y 应为整数格坐标,得到 x=${d.x} y=${d.y}。`); continue; }
      if (!inBounds(d.x, d.y)) { p1(`wallDecor[${i}] 坐标 (${d.x},${d.y}) 超出 grid 范围。`); continue; }
      if (!dirOk(d.face)) p1(`wallDecor[${i}].face 应为 N/E/S/W,得到 ${JSON.stringify(d.face)}。`);
    }
  }

  const staticDoors = [], staticKeys = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (grid[y][x] === 'D') staticDoors.push([x, y]); else if (grid[y][x] === 'K') staticKeys.push([x, y]); }
  const hasDynamicDoor = Object.keys(dynamicDoorEvents).some((ek) => dynamicDoorEvents[ek] && dynamicDoorEvents[ek].length);
  if (!staticDoors.length && !hasDynamicDoor) {
    if (node.winKey) p0(`写了 winKey='${node.winKey}' 但 maze.grid / events[].set 没有任何出口门 'D' → 玩家没有触发通关 flag 的入口。`);
    else p1("没有任何出口门 'D';若这是纯追逐/被抓/实验场景请确认,常规 maze3d 应提供至少一个 D。 ");
    return out;
  }

  // maze3d 网格可达性(BFS):graph-audit 对 maze3d 豁免「无保底出口」,但不能放过 canvas 内软锁。
  // 只认【可达】机关的不动点:可达 events.set 打通 '.'/'K',可达 events.warp 增加新起点;不搜 when(state)。
  // events.set 生成 'D'/'K' 也必须由【可达事件】触发后才参与门/钥匙判断;否则会被「写了机关」蒙混过关。
  if (startOk) {
    const unlocked = new Set(), reachStarts = new Set([sx + ',' + sy]);
    const walkableAt = (x, y) => { const c = cellAt(x, y); return (c !== '#' && c !== 'D') || unlocked.has(x + ',' + y); };
    let seen = new Set(), grew = true;
    while (grew) {
      grew = false; seen = new Set();
      const q = [];
      for (const sk of reachStarts) { const p = sk.split(','), x = +p[0], y = +p[1]; if (!seen.has(sk) && walkableAt(x, y)) { seen.add(sk); q.push([x, y]); } }
      while (q.length) {
        const cur = q.shift();
        for (const d of [[cur[0] + 1, cur[1]], [cur[0] - 1, cur[1]], [cur[0], cur[1] + 1], [cur[0], cur[1] - 1]]) {
          const kk = d[0] + ',' + d[1];
          if (!seen.has(kk) && walkableAt(d[0], d[1])) { seen.add(kk); q.push(d); }
        }
      }
      for (const ek in setUnlocks) { if (seen.has(ek)) for (const t of setUnlocks[ek]) { const tk = t[0] + ',' + t[1]; if (!unlocked.has(tk)) { unlocked.add(tk); grew = true; } } }
      for (const ek in warpDests) { if (seen.has(ek)) for (const t of warpDests[ek]) { const tk = t[0] + ',' + t[1]; if (!reachStarts.has(tk)) { reachStarts.add(tk); grew = true; } } }
    }
    const initialCells = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x] !== '#') initialCells.add(x + ',' + y + '=' + grid[y][x]);
    const cloneCells = (cells) => {
      const map = new Map();
      for (const entry of cells) { const eq = entry.lastIndexOf('='); map.set(entry.slice(0, eq), entry.slice(eq + 1)); }
      return map;
    };
    const encodeMap = (map) => Array.from(map, ([coord, ch]) => coord + '=' + ch).sort().join(';');
    const reachableOn = (cells, position) => {
      const reached = new Set(), q = [];
      const walkable = (x, y) => { const ch = cells.get(x + ',' + y); return ch != null && ch !== '#' && ch !== 'D'; };
      if (position) { const p = position.split(','), x = +p[0], y = +p[1]; if (walkable(x, y)) { reached.add(position); q.push([x, y]); } }
      while (q.length) {
        const cur = q.shift();
        for (const d of [[cur[0] + 1, cur[1]], [cur[0] - 1, cur[1]], [cur[0], cur[1] + 1], [cur[0], cur[1] - 1]]) {
          const dk = d[0] + ',' + d[1];
          if (!reached.has(dk) && walkable(d[0], d[1])) { reached.add(dk); q.push(d); }
        }
      }
      return reached;
    };
    const stateCan = (accepts) => {
      const initialMap = cloneCells(initialCells), queue = [{ cells: initialMap, position: sx + ',' + sy, used: new Set() }], visited = new Set();
      while (queue.length) {
        const state = queue.shift(), stateKey = encodeMap(state.cells) + '|' + state.position + '|' + Array.from(state.used).sort().join(';');
        if (visited.has(stateKey)) continue;
        visited.add(stateKey);
        const stateSeen = reachableOn(state.cells, state.position);
        if (accepts(state.cells, stateSeen)) return true;
        for (const fx of mazeActionEffects) {
          if (state.used.has(fx.id) || !stateSeen.has(fx.eventKey)) continue; // 先走到事件格再结算;set 后玩家留在机关格,warp 则把当前位置替换成目标格。
          const nextCells = new Map(state.cells), nextUsed = new Set(state.used);
          for (const w of fx.writes) nextCells.set(w[0] + ',' + w[1], w[2]);
          nextUsed.add(fx.id);
          queue.push({ cells: nextCells, position: fx.warp ? fx.warp[0] + ',' + fx.warp[1] : fx.eventKey, used: nextUsed });
        }
      }
      return false;
    };
    const canReachDoor = stateCan((cells, stateSeen) => {
      for (const [coord, ch] of cells) {
        if (ch !== 'D') continue;
        const p = coord.split(','), x = +p[0], y = +p[1];
        if ([[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some((a) => stateSeen.has(a[0] + ',' + a[1]))) return true;
      }
      return false;
    });
    if (!canReachDoor) {
      const anyReachableDoor = stateCan((cells) => Array.from(cells.values()).some((ch) => ch === 'D'));
      if (!anyReachableDoor) p0(`迷宫不可通关:可达事件的最终 set 结果中没有保留下出口门 'D' → 玩家没有触发通关 flag 的入口。`);
      else p0(`迷宫不可通关:发光门 'D' 被墙围死(从 start(${sx},${sy}) 走不到任何门旁,已按 runtime 顺序计入可达 events.set/warp 的最终网格)→ 玩家永远开不了门、逃不出。检查 maze.grid / events[].set。`);
    }
    if ((staticKeys.length || Object.keys(dynamicKeyEvents).length) && !stateCan((cells, stateSeen) => {
      for (const [coord, ch] of cells) if (ch === 'K' && stateSeen.has(coord)) return true;
      return false;
    })) p1("钥匙拿不到:迷宫钥匙 'K' 全被墙围死或被可达事件最终覆写(从 start 走不到)→ 若是'先找钥匙再开门'的迷宫则无法通关。检查 maze.grid / events[].set:至少一把 K 要可达。 ");
  }
  return out;
}

// ---------- SCC 软锁口袋(round12《烈焰与咸风》实锤:逐节点「无保底出口」检查的盲区)----------
// 现有「无保底出口」是【逐节点】查:节点只要有一条无条件非once出口就算过。盲区:两个(或多个)节点
//   【各自】都有无条件出口、却【互相指向】成封闭口袋——fog_entry 唯一 link→reef_nav、reef_nav 唯一
//   exit→fog_entry,离开口袋的唯一路 = reef_nav 检定 success.to(cost 船员士气);士气耗尽 → 检定灰显 →
//   只能在 fog_entry⇄reef_nav 来回走、永远出不去(死循环)。逐节点查不到(口袋内每个节点都"有无条件出口")。
//   三闸全漏:graph-audit 算它可达(检定 success.to 是真边)、probe 贪心首选 move 不反复检定故不触发士气耗尽。
// 静态信号(**纯拓扑、非资源量模拟**,区别于「悲观可达」backlog):在【仅无条件非once边】构成的子图里求 SCC;
//   某 size≥2 的 SCC 是「汇」(没有任何无条件边离开它)、却只能靠【带 cost 的检定】离开 → 资源枯竭即 soft-lock。
//   P1(可疑:cost 资源也许总够;但「封闭口袋 + 耗资源逃生」人工极难测、三闸全漏 → 值得提醒)。
//   只查 size≥2(size=1 的无保底已由逐节点 P0 覆盖,避免重复);只查可达 SCC(不可达另有 orphan 报告);
//   只在逃生路是【带 cost 检定】时报(requires 门控逃生太murky、免费可重试检定不算锁 → 守零误报)。
function softlockPocketIssues(maps, reached) {
  const isStandby = (e, condKey) => e && e.to != null && typeof e[condKey] !== 'function' && !e.once;
  // 「整分支检定」(success.to+fail.to 双目的地、无 cost/available、success 不置隐藏 flag)= 每次点击必移动
  //   = 等价无条件边(与逐节点检查 §v12 例外一致 → 不把 Disco Elysium「检定即分叉」节点误报)。
  const integral = (c) => c && c.success && c.success.to != null && c.fail && c.fail.to != null
    && c.cost == null && c.available == null && c.success.flag == null;
  const nodeAt = (key) => { const i = key.indexOf('/'); const mp = key.slice(0, i), nd = key.slice(i + 1);
    return { mapId: mp, node: (maps[mp] && maps[mp].nodes && maps[mp].nodes[nd]) || {} }; };
  // 无条件子图 uncondAdj(键 map/node)
  const uncondAdj = new Map(), allNodes = [];
  for (const mapId of Object.keys(maps)) {
    const nodes = (maps[mapId] && maps[mapId].nodes) || {};
    for (const nodeId of Object.keys(nodes)) {
      const key = mapId + '/' + nodeId, node = nodes[nodeId] || {}, outs = [];
      const push = (to) => { const tk = edgeKey(to, mapId); if (tk) outs.push(tk); };
      for (const e of (node.exits || [])) if (isStandby(e, 'available')) push(e.to);
      for (const l of (node.links || [])) if (isStandby(l, 'requires')) push(l.to);
      for (const c of (Array.isArray(node.checks) ? node.checks : [])) if (integral(c))
        for (const side of ['success', 'fail', 'crit', 'fumble', 'partial']) if (c[side] && c[side].to != null) push(c[side].to);
      allNodes.push(key); uncondAdj.set(key, outs);
    }
  }
  // Tarjan SCC(递归;节点规模小,深度安全)
  let idx = 0; const index = new Map(), low = new Map(), onStack = new Set(), st = [], sccs = [];
  const strongconnect = (v) => {
    index.set(v, idx); low.set(v, idx); idx++; st.push(v); onStack.add(v);
    for (const w of (uncondAdj.get(v) || [])) {
      if (!index.has(w)) { strongconnect(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
    }
    if (low.get(v) === index.get(v)) { const comp = []; let w; do { w = st.pop(); onStack.delete(w); comp.push(w); } while (w !== v); sccs.push(comp); }
  };
  for (const v of allNodes) if (!index.has(v)) strongconnect(v);
  const issues = [];
  for (const comp of sccs) {
    if (comp.length < 2) continue;                       // size=1 无保底已由逐节点 P0 覆盖
    if (!comp.some((k) => reached.has(k))) continue;     // 不可达 SCC → orphan 已报
    const inSet = new Set(comp);
    let uncondOut = false;                               // 有无条件边离开 SCC → 非汇 → 非软锁
    for (const k of comp) { for (const t of (uncondAdj.get(k) || [])) if (!inSet.has(t)) { uncondOut = true; break; } if (uncondOut) break; }
    if (uncondOut) continue;
    // 汇 SCC:只在「grind-trap」形态报(守零误报):带 cost(amount>0)的检定,success 类结果逃出 SCC、
    //   但 **fail 不逃**(undefined / 无 to / 仍回 SCC 内)→ 失败留在口袋、重试再耗资源 → 资源枯竭即死循环。
    //   排除两类合法形态:① 免费/amount≤0 检定(资源不枯竭,可无限重试);② fail-forward(success/fail 都离开
    //   口袋,负担得起一次就脱身 → 只剩"到达时资源已不足"才卡=「悲观可达」backlog,非纯拓扑可判,不在此闸)。
    const leavesSCC = (o, mapId) => { if (!o || o.to == null) return false; const tk = edgeKey(o.to, mapId); return !!(tk && !inSet.has(tk)); };
    let esc = null;
    for (const k of comp) {
      const { mapId, node } = nodeAt(k);
      for (const c of (Array.isArray(node.checks) ? node.checks : [])) {
        if (!c || c.cost == null || !(Number(c.cost.amount) > 0)) continue;            // 无 cost / amount≤0 → 资源不枯竭 → 跳过
        const anyEscape = ['success', 'crit', 'partial', 'fail', 'fumble'].some((s) => leavesSCC(c[s], mapId));
        if (!anyEscape) continue;                                                      // 哪个结果都不离开 SCC → 非逃生检定(如 demo bay 原地检定)
        if (!leavesSCC(c.fail, mapId)) { esc = { node: k, res: (c.cost && c.cost.res) || '资源', label: c.label || c.id || '' }; break; }  // fail 不逃 → grind-trap
      }
      if (esc) break;
    }
    if (esc) {
      issues.push(`[可疑][P1] 软锁口袋:节点 {${comp.slice().sort().join(', ')}} 用无条件出口互相连成封闭回路,`
        + `离开它的唯一通路是节点 '${esc.node}' 上消耗「${esc.res}」的检定「${esc.label}」——`
        + `「${esc.res}」耗尽时该检定灰显不可点,玩家就在这个口袋里来回走、永远出不去(死循环)。`
        + `逐节点「无保底出口」检查看不到(口袋内每个节点各自都有无条件出口、只是都指回口袋里)。`
        + `修:在口袋内某节点加一条【无条件、不耗资源】的出口指向口袋外(资源耗尽也能脱身);`
        + `或让该检定不消耗会枯竭的资源;或保证「${esc.res}」在抵达此处前一定可恢复/足够。`);
    }
  }
  return issues;
}

// ---------- 死 flag(逻辑死锁)静态分析:源文本级,类型无关 ----------
// 图连通(auditWorld)查不到「被 requires/available 读、但从不被写」的 flag——门控它的
// 选项/出口将永远锁死(如 expedition 的 hasThreeShards:canon 说集齐晶体逃生,但 world.js 从不 set)。
// 读 = .flags.X 的任何引用;写 = flags.X=(run 赋值) / flag:'X'(检定 success/fail 置位) / set:{X:…}。
// 读 − 写 = 死 flag → P1(可疑:可能由 game.js/插件运行时设;且正则是启发式,故不硬拦)。
function deadFlagIssues(source) {
  if (typeof source !== 'string' || !source) return [];
  source = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');   // 先剥 JS 注释(与 audioPresetIssues/elementsShapeIssues 对称、对称遗漏补):否则注释里的 `.flags.xxx`(如 world.js 文档注释「其余全用 S.flags.xxx 模式」)被当真读访问 → 误报死 flag(Sonnet r2《太乙镜渊》实测)
  // 先归一防御性 flags 访问 → 裸 flags,让下面读/写正则统一命中(haiku showcase 实测盲点:
  //   achievement 用 `(S.flags||{}).X` 读、run 用 `(S.flags||(S.flags={})).X=` 写,flags 与 key 被 ||{} 隔开 → 原 \bflags\. 读和写都漏 → 把写过的也误报成死 flag)。
  source = source.replace(/\(\s*\w+\.flags\s*\|\|\s*(?:\(\s*\w+\.flags\s*=\s*\{\s*\}\s*\)|\{\s*\})\s*\)/g, 'flags');
  const read = new Set();
  for (const m of source.matchAll(/\bflags\.([A-Za-z_$][\w$]*)/g)) read.add(m[1]);
  const written = new Set();
  for (const m of source.matchAll(/\bflags\.([A-Za-z_$][\w$]*)\s*=/g)) written.add(m[1]);   // run 里赋值
  for (const m of source.matchAll(/\bflag\s*:\s*['"]([^'"]+)['"]/g)) written.add(m[1]);       // 检定 success/fail.flag
  for (const blk of source.matchAll(/\bset\s*:\s*\{([^}]*)\}/g)) {                            // 检定 outcome.set 的键
    for (const km of blk[1].matchAll(/([A-Za-z_$][\w$]*)\s*:/g)) written.add(km[1]);
  }
  const issues = [];
  for (const f of [...read].sort()) {
    if (!written.has(f)) {
      issues.push(`[可疑][P1] 死 flag '${f}':被读取(.flags.${f})但 world.js/game.js 从不写它`
        + `(无 flags.${f}=… / flag:'${f}' / set:{${f}:…})。门控它的选项/出口将永远锁死、achievement.when 读它则成就永不解锁 → 玩家卡住/拿不到。`
        + `若由插件运行时设置,可忽略;否则补上获得途径(检定 success.flag / run 赋值 / game.js 里设)。`);
    }
  }
  return issues;
}

// initState 声明的键(含嵌套,保守多算 → 宁漏报不误报):取 initState:{…} 整块内所有 `key:`。供 ⑦/⑧ 共用。
function initStateDeclaredKeys(source) {
  const declared = new Set();
  if (typeof source !== 'string' || !source) return declared;
  const im = /initState\s*:\s*\{/.exec(source);
  if (im) {
    let depth = 0, end = -1;
    for (let i = im.index + im[0].length - 1; i < source.length; i++) {
      const c = source[i];
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { end = i; break; }
    }
    if (end >= 0) for (const km of source.slice(im.index, end + 1).matchAll(/\b([A-Za-z_$][\w$]*)\s*:/g)) declared.add(km[1]);
  }
  return declared;
}

const STATE_RESERVED = { pos: 1, clock: 1, seen: 1, flags: 1, rngSeed: 1, sheet: 1 };

// ---------- initState 未声明数值字段(NaN 源头)静态分析:源文本级,类型无关 ----------
// 探针 ④(自动游玩撞 NaN)只抓"走得到"的运行时 NaN;分支深处 / 被门控的走不到。这里静态补:
// world.js 对 S.<key> / state.<key> 做**复合赋值或自增减**(+= -= *= /= ++ --)= 读-改-写,
//   若 key 未在 initState 声明(也非引擎保留/下划线内部字段)→ 首次即 undefined±n = NaN → 数值门控恒 false → soft-lock。
// 复合赋值左侧必是裸 S.key(无 ||0 防御余地)→ 误报低;但变量名靠约定(run 参数 S/state),非常规命名漏报 → P1(可疑)。
function initNumericIssues(source, declared) {
  if (typeof source !== 'string' || !source) return [];
  const hit = new Map();   // key -> 示例运算符(每 key 报一次)
  const note = (k, op) => { if (k && k[0] !== '_' && !STATE_RESERVED[k] && !declared.has(k) && !hit.has(k)) hit.set(k, op); };
  for (const m of source.matchAll(/\b(?:S|state)\.([A-Za-z_$][\w$]*)\s*(\+=|-=|\*=|\/=|\+\+|--)/g)) note(m[1], m[2]);
  for (const m of source.matchAll(/(\+\+|--)\s*\b(?:S|state)\.([A-Za-z_$][\w$]*)/g)) note(m[2], m[1]);
  const issues = [];
  for (const [k, op] of hit) {
    issues.push(`[可疑][P1] 未初始化数值字段 '${k}':world.js 对它做了 \`${op}\` 算术(读-改-写),但 world.initState 未声明`
      + ` → 首次即 NaN(undefined 参与算术),此后数值门控恒 false → soft-lock(探针自动游玩走不到的分支尤其危险)。`
      + ` 在 world.initState 给初值(如 \`initState:{ ${k}: 0 }\`);若它在某 run 里先被无条件赋值、或由模块管理,可忽略。`);
  }
  return issues;
}

// ---------- 死 state 键(被门控读、从不写 → 恒 undefined 死锁)静态分析:deadFlag 的裸键版 ----------
// 门控大量用裸键(S.understanding>=15 / S.inventory.includes(...)),读但 world.js 从不写(无 =/+=/initState)
//   → 恒 undefined,门控恒 false 或访问报错 → 那条路径死锁(图连通查不到,同 hasThreeShards 但非 flag)。
// 排除:flags(归 deadFlag)、引擎保留/下划线、initState 声明键、被任何形式写过的键(=/+=,后者也含 ⑦ 的复合赋值)。
//   变量名约定 S/state(同 ⑦)→ 非常规命名漏报,且可能由 game.js/插件运行时设 → P1。
function deadStateKeyIssues(source, declared) {
  if (typeof source !== 'string' || !source) return [];
  const read = new Set(), written = new Set(), defaulted = new Set();
  for (const m of source.matchAll(/\b(?:S|state)\.([A-Za-z_$][\w$]*)/g)) read.add(m[1]);
  // 写:单 =(排除 == / >= / <= / !=,即 = 后非 =)、复合赋值、自增减
  for (const m of source.matchAll(/\b(?:S|state)\.([A-Za-z_$][\w$]*)\s*(?:=(?!=)|\+=|-=|\*=|\/=|\+\+|--)/g)) written.add(m[1]);
  // maze3d 节点的 winKey/scareKey 由 maze3d runtime 在 canvas 内写(走到 D 门=winKey、被怪抓=scareKey),
  //   静态图层看不见 → 声明 `winKey:'X'`/`scareKey:'X'` 即视为"已写",避免外层 links.requires 读 S.X 被误报死 state
  //   (dogfood 实测:承星者迷宫章节 winKey 写 corridorLit、外层场景门控读它 → 原会误报 P0)。与 :755 认 `flag:'X'` 同理。
  for (const m of source.matchAll(/\b(?:winKey|scareKey)\s*:\s*['"]([^'"]+)['"]/g)) written.add(m[1]);
  // 防御性读(有默认值):S.x || … / S.x ?? … / S.x?. … → 未设也被妥善处理、不构成死锁 → 不报(并降 P0 误报)。
  for (const m of source.matchAll(/\b(?:S|state)\.([A-Za-z_$][\w$]*)\s*(?:\|\||\?\?|\?\.)/g)) defaulted.add(m[1]);
  const issues = [];
  for (const k of [...read].sort()) {
    if (k[0] === '_' || STATE_RESERVED[k] || declared.has(k) || written.has(k) || defaulted.has(k)) continue;
    // showcase round6 升 P0(用户定「两者都做」):门控/比较读一个从不写、未声明、也无 ||/?? 默认的键 = 恒 undefined =
    //   确定性死锁/死功能(如 haiku 的 currentNode→3 个结局成就永不解锁),单一正解 → P0 硬拦。
    //   防御性读已排除 → 误报极低;逃生口 = 在 initState 声明(声明即视为已写)。4 demo 实测零此项。
    issues.push(`[确认][P0] 死 state 键 '${k}':world.js/game.js 读 S.${k}/state.${k}(门控/比较)但从不写它(无 =/+=、无 initState 声明、也无 ||/?? 默认)`
      + ` → 恒 undefined,门控恒 false / 比较永不成立 → 那条路径或那个功能(如结局成就)**死锁 / 永不触发**。`
      + ` 修:补写入途径(某处 \`S.${k} = …\`),或在 \`world.initState\` 声明初值(声明即视为已写、消除此 P0)。`);
  }
  return issues;
}

// ---------- 死 seen 键(死读家族第三员:flag / state键 / seen键)----------
// showcase《谐振》实锤:成就 when 读 `S.seen['plateau:chamber']`(冒号),但 engine-core enter() 写的 seen 键是
//   `map + '/' + node`(斜杠)→ 冒号键永远查不到 → 6 成就坏 5(静默永不解锁),且三闸全过(seen 子键非 flag、
//   非死链、运行时不崩——死flag/死state键检查都够不到)。本检查补这个缺口:扫【字面】seen 子键索引,凡不匹配
//   任何真实 map/node 键(冒号分隔符、拼错节点名)→ 恒 undefined = 死读 = 静默失效。
//   **不破坏创造力/自由度**(用户铁律):① 只查【字面字符串】键(`seen[变量]` 动态键跳过、不碰)② 合法 'map/node'
//   斜杠键放行 ③ P1【可疑·非硬拦】+ 文案留逃生口(确把 seen 当自定义存储用可忽略)——只警示"这个键永远匹配不到",
//   不禁止任何写法。近零误报:引擎自身产 seen 键只走斜杠(engine-core/minimap 全斜杠)、4 demo 用 Object.keys 计数不命中。
function deadSeenKeyIssues(combined, world) {
  if (typeof combined !== 'string' || !combined || !world || !world.maps) return [];
  const valid = new Set();
  for (const mp of Object.keys(world.maps)) {
    const nodes = (world.maps[mp] && world.maps[mp].nodes) || {};
    for (const nd of Object.keys(nodes)) valid.add(mp + '/' + nd);
  }
  const issues = [], reported = new Set();
  // 匹配 seen['字面'] / seen["字面"](`\bseen` 词边界排除 unseen 等;动态键 seen[var] 无引号、不匹配 → 跳过)
  for (const m of combined.matchAll(/\bseen\s*\[\s*(['"])([^'"\\]+)\1\s*\]/g)) {
    const key = m[2];
    if (valid.has(key) || reported.has(key)) continue;     // 合法 map/node 键放行;每键只报一次
    reported.add(key);
    const colonHint = key.indexOf(':') >= 0 ? `(疑似分隔符写错——把冒号改斜杠:'${key.replace(/:/g, '/')}'?)` : '';
    issues.push(`[可疑][P1] 死 seen 键 '${key}':读 seen['${key}'] 但它不是任何真实 map/node 键 ${colonHint}`
      + ` —— seen 的键是 'map/node'(**斜杠**,见契约 §3),写错(冒号/拼错节点名)= 恒 undefined = 该成就/门控**静默永不触发**(三闸都抓不到)。`
      + ` 判到访优先读你自己 set 的 \`S.flags\`(单一真相,见 examples/text-adventure-demo 成就);计数用 \`Object.keys(S.seen).length\`。`
      + ` (若你确在把 seen 当自定义存储用、这是有意的键,可忽略本条。)`);
  }
  return issues;
}

// ---------- 同名两池(混合 scene+encounter 游戏的资源接缝)静态分析:类型无关,跨 world.js + game.js ----------
// 缘起(showcase 实测两次:《深渊》stamina / 《落霞一剑》内力;lessons 66 + journal 阶段63/101):
//   跑团检定的 `cost` 扣的是**角色卡** `sheet.resources.X`(= state.sheet.resources,经 getSheet 从 game.js 的 sheet 初始化);
//   但作者在场景 link.run 里天然写**顶层** `S.resources.X`(回血/扣费)。**同名两池、boot 起互不相识、永不同步** →
//   场景回血点对检定无效、检定只从初值单调干涸、状态条若读 S.resources 则数字与检定实际池背离(静默、极难自测)。
// 检测(近零误报——同名几乎必是同一资源写错路径):game.js sheet 声明的 resources 键 X,与 world.js 里**非 sheet**
//   的 `.resources.X` / `.resources['X']` 访问同名 → P1。§2 指引早写"资源别同名"但实测咬两次 → 上闸。
// 排除:`S.sheet.resources.X`(正确写法,负向 lookbehind 排掉)、无 game.js(拿不到 sheet→空 set→跳过)、
//   名字不撞(合法的独立顶层池,如纯文字冒险用 S.resources 而无角色卡)。P1 可疑(非 P0):极个别作者或有意分池。
function sameNamePoolIssues(world, game) {
  if (typeof world !== 'string' || !world || typeof game !== 'string' || !game) return [];
  // 1. game.js sheet 声明的资源池键(检定真正扣的池)。CJK 键名(内力/体力)也要取到。
  const sheetRes = new Set();
  for (const blk of game.matchAll(/resources\s*:\s*\{([^}]*)\}/g)) {
    for (const km of blk[1].matchAll(/(['"]?)([A-Za-z_$一-鿿][\w$一-鿿]*)\1\s*:/g)) sheetRes.add(km[2]);
  }
  if (!sheetRes.size) return [];
  // 2. world.js 里**非 sheet** 的 .resources.X / .resources['X'](顶层 S.resources / state.resources;lookbehind 排掉 .sheet.resources)
  const topRes = new Set();
  for (const m of world.matchAll(/(?<!\.sheet)\.resources\s*\[\s*['"]([^'"]+)['"]\s*\]/g)) topRes.add(m[1]);
  for (const m of world.matchAll(/(?<!\.sheet)\.resources\.([A-Za-z_$一-鿿][\w$一-鿿]*)/g)) topRes.add(m[1]);
  const issues = [];
  for (const x of topRes) {
    if (!sheetRes.has(x)) continue;
    issues.push(`[可疑][P1] 同名两池 '${x}':world.js 在场景里写顶层 \`S.resources.${x}\`,但跑团检定的 cost 扣的是角色卡 \`sheet.resources.${x}\`(state.sheet.resources)`
      + ` —— 两个不同的池、boot 起互不相识、永不同步。后果:场景回血/扣费对检定**无效**、检定只从初值单调干涸、状态条若读 S.resources 则数字与检定实际池**背离**(静默、极难自测;showcase 实测两次)。`
      + ` 修:场景 run 与 status 一律改写/读 \`S.sheet.resources.${x}\`(单一真相=角色卡池);或两处资源取**不同名**。`);
  }
  return issues;
}

// ---------- kind ↔ 模块 静态匹配(showcase:模型漏 use 模块 → start() 崩白屏、只剩工具栏)----------
// engine-core start() 已对"node.kind 无模块认领"抛错(§6b 启动预检),但那是【运行时】——弱模型常
//   只跑 graph-audit(静态)、跳过 probe;且 probe 的 P0 串行、前一个装配崩(如 achievement 缺 when)
//   会遮住后一个(encounter 缺 tabletop),修完不重跑就漏下一个。故把这个【确定性】错误也提到 graph-audit:
//   world 用了内置 kind 但 game.js 没注册对应模块工厂 → P0。零误报:start 必崩、无合法反例;
//   只查引擎内置完整模块的 kind(scene/encounter),counter/自定义 kind 不碰(它们的工厂名 graph-audit 不知道,留给 start/probe)。
//   必须用 world 对象遍历【真正的 node.kind】(非文本 grep:scene.elements 里也有 kind:'character'/'dice' 等,grep 会误命中)。
const BUILTIN_KIND_MODULE = {
  scene:     { factory: 'createTextAdventureModule', api: 'A.TextAdventure', demo: 'demo' },
  encounter: { factory: 'createTabletopModule',      api: 'A.Tabletop',      demo: 'tabletop-demo' },
  cutscene:  { factory: 'createCutsceneModule',      api: 'A.Cutscene',      demo: 'cutscene-demo' },   // C2:boot 认领后 cutscene 与内置同权;本表只管【手写装配】路径(boot 形态在上方整体让位)
};
function kindModuleIssues(world, combined) {
  // 剥离注释再匹配:模型常把 use 整行注释掉(round8 实测"注释掉 tabletop use"),注释里的工厂名不算真注册。
  const src = (typeof combined === 'string' ? combined : '')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // S12 boot 让位:game.js 用 `Amatlas.boot(WORLD, manifest)` 装配时,boot(preset 层)按 world 出现的内置
  //   kind【自动拉】对应 module(scene→TextAdventure / encounter→Tabletop),缺工厂还会 fail-loud 抛(boot.js:55/59)。
  //   此形态下 game.js 不出现 createXxxModule 字样 → 本【grep 工厂名】检查会误报"漏 module";而 boot 自动拉 +
  //   start() 启动预检 + probe eval 抓 boot 的 throw 已【三重覆盖】这一类,静态 grep 冗余 → 让位(只对【手写装配】查)。
  if (/\b(?:Amatlas|A)\s*\.\s*boot\s*\(/.test(src)) return [];   // 认 Amatlas.boot( 与 A.boot(（A=window.Amatlas 别名;new-game/SKILL 模板用 A.boot）
  const maps = (world && world.maps) || {};
  const used = {};                                           // 内置 kind -> 节点数(只统计 BUILTIN 表内的)
  for (const mapId of Object.keys(maps)) {
    const nodes = (maps[mapId] && maps[mapId].nodes) || {};
    for (const nodeId of Object.keys(nodes)) {
      const k = nodes[nodeId] && nodes[nodeId].kind;
      if (k && BUILTIN_KIND_MODULE[k]) used[k] = (used[k] || 0) + 1;
    }
  }
  // §11.2 误报修(全引擎红队实锤):自定义模块可【合法】认领内置 kind(契约 §2:任何模块可声明 nodeKinds;
  //   红队构造的手写装配+自定义模块认领 'encounter' 实跑 start 成功、本检查却曾 P0 硬拦=违反自家「升 P0 需
  //   零误报无合法反例」)。剥注释后源里出现 nodeKinds = 存在自定义模块、其认领面静态不可知 → 降 P1 可疑
  //   (start() 预检 + probe 运行时仍权威兜底);无 nodeKinds 才维持 P0(纯内置装配、无合法反例)。
  const hasCustomModule = /\bnodeKinds\b/.test(src);
  const out = [];
  for (const k of Object.keys(used)) {
    const m = BUILTIN_KIND_MODULE[k];
    if (!new RegExp('\\b' + m.factory + '\\b').test(src)) {   // game.js(合并源)里没出现该模块工厂 = 漏 use
      out.push(`[${hasCustomModule ? '可疑][P1' : '确认][P0'}] node.kind:'${k}'(${used[k]} 个节点)没有模块认领:game.js 缺 ${m.factory}`
        + ` → engine.start() 抛「node.kind 没有模块认领」、游戏白屏(正文/选项整个不渲染,只剩插件工具栏 💾🗺️🏆)。`
        + ` 在 game.js 加 \`engine.use(${m.api}.${m.factory}({…}))\`(照抄 examples/${m.demo}/game.js);混合游戏=每种用到的 kind 都要 use 对应模块。`
        + (hasCustomModule ? `(检测到自定义模块 nodeKinds——若它合法认领了 '${k}' 可忽略本条;运行时 start() 预检/probe 仍会权威校验)` : ''));
    }
  }
  return out;
}

// ---------- audio 预设名静态校验(易用性审计批)----------
//   ambient 预设名是【封闭集】且运行时未知名 → present-audio fail-loud 抛(每次 render 重抛;装配探针无
//   AudioContext 走不到、smoke 只覆盖浅层节点 → typo 三闸全绿、真机才炸)。music 字符串预设也是封闭集,
//   未知名运行时只 console.warn 一次并回退默认曲(可玩但"不是作者点的菜")。两者都在这里提前到静态 P1。
//   预设名单【从呈现器源码解析】而非硬编码(lessons 77:硬编码清单必漂移;音色库扩预设 → 此闸自动跟上);
//   源文件不可读 → 跳过(不误报)。对象 spec / {midi} / 自定义音频呈现器消费任意名 → 不受此限(P1 可忽略)。
function parsePresetKeys(file, anchor, keyRe) {
  try {
    const src = fs.readFileSync(file, 'utf8');
    const at = src.indexOf(anchor);
    if (at < 0) return null;
    let i = src.indexOf('{', at), depth = 0, end = -1;
    for (let j = i; j < src.length; j++) {                       // 括号配平取整块(预设表是嵌套对象/函数)
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end < 0) return null;
    const block = src.slice(i, end);
    const keys = new Set(); let m;
    while ((m = keyRe.exec(block))) keys.add(m[1]);
    keyRe.lastIndex = 0;
    return keys.size ? keys : null;
  } catch (e) { return null; }
}
function audioPresetIssues(combined, selfDir) {
  const out = [];
  const src = (typeof combined === 'string' ? combined : '')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  if (!/\b(?:ambient|music)\s*:/.test(src)) return out;
  const ambSet = parsePresetKeys(path.join(selfDir, '../../presenters/present-audio.js'), 'BGS_BUILD = {', /(?:^|\n)\s{6}['"]?([a-zA-Z][\w-]*)['"]?\s*:\s*function/g);   // ['"]? 兼容带连字符的引号键(如 'ambient-unease'):否则该名不入名单 → 误报 P1(名单源解析,lesson 77)
  const musSet = parsePresetKeys(path.join(selfDir, '../../presenters/compose-music.js'), 'PRESET = {', /(?:^|\n)\s{4}['"]?([a-zA-Z][\w-]*)['"]?\s*:\s*\{/g);   // ['"]? 兼容带连字符的引号键(如 'jazz-noir'):与上一行 ambSet 对称,否则该名不入名单 → 误报 P1(showcase Sonnet 实测漏修,lesson 77 对称性)
  let m;
  const ambRe = /\bambient\s*:\s*(['"])([\w-]+)\1/g;
  while (ambSet && (m = ambRe.exec(src))) {
    if (!ambSet.has(m[2])) out.push(`[可疑][P1] ambient 预设名 '${m[2]}' 不在引擎预设表(封闭集):真机每次渲染 fail-loud 抛 → 无环境声 + console 刷错(装配探针/烟雾测不到 Web Audio,只有这里能提前抓)。合法名:${[...ambSet].join('/')};或改用 AmbientSpec 对象自定义。用了自定义音频呈现器可忽略。`);
  }
  const musRe = /\bmusic\s*:\s*(['"])([\w-]+)\1/g;
  while (musSet && (m = musRe.exec(src))) {
    if (!musSet.has(m[2])) out.push(`[可疑][P1] music 预设名 '${m[2]}' 不在引擎预设表:运行时只 console.warn 一次并回退默认曲 → 玩家听到的不是你点的曲风。合法名:${[...musSet].join('/')};要微调用 {preset:'基底',…},嵌现成曲用 {midi:'<base64>'}。用了自定义音频呈现器可忽略。`);
  }
  // C16:对象形 music:{preset:'X'} 的 typo——string 路径上面已抓,对象路径运行时回退默认曲(本批补 warn-once);静态在此对称补 P1。
  //   [^{}]*? 锁在同一对象内(不跨内层 {});preset 值非引擎预设名 → 回退兜底曲、非作者点的菜。
  const musObjRe = /\bmusic\s*:\s*\{[^{}]*?\bpreset\s*:\s*(['"])([\w-]+)\1/g;
  while (musSet && (m = musObjRe.exec(src))) {
    if (!musSet.has(m[2])) out.push(`[可疑][P1] music.preset 预设名 '${m[2]}' 不在引擎预设表:对象形 {preset:'…'} 写错预设名时回退默认曲(且仅 warn-once)→ 玩家听到的不是你点的曲风。合法名:${[...musSet].join('/')};基底要在表内(微调写 {preset:'合法基底',…})。用了自定义音频呈现器可忽略。`);
  }
  return out;
}

// ---------- C04:scene.elements 写成非数组(静默不画)静态校验 ----------
// showcase 前瞻审计(命名/形态接缝同母类:作者写错形态→呈现器静默降级)。present-svg buildSceneSVG 现对非数组
//   elements 即 throw(运行时由 boot 错误横幅兜),但**装配探针不渲染 SVG** → 静态在此提前抓。
// **近零误报**(铁律:升闸需零误报):只查【明确非数组字面量】(elements: 紧跟 { ' " 数字 true/false)——
//   数组字面量 `[` 放行、变量/函数调用(标识符)放行(可能合法),4 demo 全 `elements:[` 不命中(实测)。P1 可疑非硬拦。
function elementsShapeIssues(combined) {
  if (typeof combined !== 'string' || !combined) return [];
  const src = combined.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');   // 剥注释,避免注释里的 elements: 误命中
  const out = [], seen = new Set();
  for (const m of src.matchAll(/\belements\s*:\s*(\{|['"]|\d|true\b|false\b)/g)) {
    const t = m[1] === '{' ? '对象 {…}' : (m[1] === "'" || m[1] === '"') ? '字符串' : (m[1] === 'true' || m[1] === 'false') ? '布尔' : '数字';
    if (seen.has(t)) continue;                                                          // 每种错误形态只报一次(避免刷屏;修法相同)
    seen.add(t);
    out.push(`[可疑][P1] scene.elements 写成${t}(应为图元数组,如 elements:[{kind:'character',…}])`
      + ` → present-svg 运行时会抛、整场物件不画。改成数组;无物件的场景用 elements:[] 或省略该字段。`);
  }
  return out;
}

// 引擎版本戳(易用性审计批):从同包 engine-core 源抓 AMATLAS_VERSION,报告头打印 → 端用户跑审计即知包版本。
function engineVersion() {
  try {
    const src = fs.readFileSync(path.join(SELF_DIR, '../runtime/engine-core.js'), 'utf8');
    const m = src.match(/AMATLAS_VERSION\s*=\s*'([^']+)'/);
    if (m) return (m[1].charAt(0) === '_') ? 'dev' : m[1];
  } catch (e) { /* 拿不到源 → unknown */ }
  return 'unknown';
}

// ---------- 对象图 + 源文本的完整项目裁决 ----------
// build 与 graph CLI 必须消费同一份结论；否则某个 P0 只在 CLI 追加，直接 build
// 就会把已知坏游戏打成正式 HTML。worldSource/gameSource 来自实际目标项目，
// 不是对整份 HTML 做裸 regex；对象级结构仍由 auditWorld 裁决。
export function auditProject(world, worldSource, gameSource, hasGameJs) {
  const audit = auditWorld(world);
  const source = typeof worldSource === 'string' ? worldSource : '';
  const gameSrc = typeof gameSource === 'string' ? gameSource : '';
  const combined = source + (gameSrc ? '\n' + gameSrc : '');
  const declared = initStateDeclaredKeys(source);

  audit.issues.push(...deadFlagIssues(combined));
  audit.issues.push(...initNumericIssues(combined, declared));
  audit.issues.push(...deadStateKeyIssues(combined, declared));
  audit.issues.push(...deadSeenKeyIssues(combined, world));
  audit.issues.push(...sameNamePoolIssues(source, gameSrc));
  audit.issues.push(...audioPresetIssues(combined, SELF_DIR));
  audit.issues.push(...elementsShapeIssues(combined));
  if (hasGameJs) audit.issues.push(...kindModuleIssues(world, combined));
  return audit;
}

// ---------- 分级 + 报告 ----------
function severity(line) {
  for (const s of ['P0', 'P1', 'P2', 'P3']) if (line.includes('[' + s + ']')) return s;
  return 'P3';
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('用法: node graph-audit.mjs path/to/world.js [--json]');
    process.exit(2);
  }
  let world;
  try {
    world = require(path.resolve(file));
  } catch (e) {
    console.error('无法加载世界模块:', e && e.message ? e.message : e);
    process.exit(2);
  }

  let source = '';
  try { source = fs.readFileSync(path.resolve(file), 'utf8'); } catch (e) { /* 拿不到源 → 跳过 flag 分析 */ }
  // flag/state/module 检查需要同目录 game.js 源；项目级入口供 CLI 与 build 共用。
  let gameSrc = '';
  let hasGameJs = false;
  try {
    const gjs = path.join(path.dirname(path.resolve(file)), 'game.js');
    if (fs.existsSync(gjs)) { gameSrc = fs.readFileSync(gjs, 'utf8'); hasGameJs = true; }
  } catch (e) { /* 无 game.js → 只用 world.js */ }
  const { issues, stats } = auditProject(world, source, gameSrc, hasGameJs);
  const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
  issues.sort((a, b) => order[severity(a)] - order[severity(b)]);
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const i of issues) counts[severity(i)]++;

  if (asJson) {
    console.log(JSON.stringify({ stats, counts, issues }, null, 2));
  } else {
    console.log(`\n${'='.repeat(60)}\n世界图审计: ${file}  (引擎 ${engineVersion()})\n${'='.repeat(60)}`);
    console.log(`地图: ${stats.maps} | 节点: ${stats.nodes} | 可达: ${stats.reachable}/${stats.nodes}`);
    console.log(`问题: P0=${counts.P0} P1=${counts.P1} P2=${counts.P2} P3=${counts.P3}\n`);
    if (!issues.length) {
      console.log('✅ 图结构无问题(死链/可达/死胡同层面)。叙事/玩法语义仍需模块工具 + 实跑。');
    }
    for (const i of issues) console.log('  ' + i);
    console.log(`\n${'─'.repeat(60)}`);
    console.log('⚠️ [可疑] 项需人工确认:孤儿可能由运行时机制接入,死胡同可能是有意结局。');
    console.log('   本工具只看图结构(类型无关);散文/一致性是模块工具的活儿。');
  }
  process.exit(counts.P0 > 0 ? 1 : 0);
}

// 作为脚本直接运行时才执行 main()(被 import 时只导出 auditWorld)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
